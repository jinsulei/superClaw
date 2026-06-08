<#
.SYNOPSIS
  Build a complete SuperClaw desktop client package.

.DESCRIPTION
  Builds the web UI and Tauri shell, then creates a portable desktop client
  folder that includes Hermes, OpenClaw, Claude Code CLI, and the Claude UI panel.

  Output:
    SuperClaw_Desktop_Client/
      superclaw.exe
      resources/
        runtime/openclaw/
        runtime/claude-code/
        runtime/claude-panel/
        data/
        bin/
        uv-tools/

.PARAMETER CheckOnly
  Only verify build tools and required resources. Does not build or package.

.PARAMETER Debug
  Build Rust in debug mode and package the debug executable.

.PARAMETER Clean
  Run cargo clean before building.

.PARAMETER SkipRuntimeDownload
  Do not run runtime download/update scripts.

.PARAMETER SkipNpmInstall
  Do not install npm dependencies even when node_modules is missing.
#>

param(
  [switch]$CheckOnly,
  [switch]$Debug,
  [switch]$Clean,
  [switch]$SkipRuntimeDownload,
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"

function Step([string]$Message) {
  Write-Host ""
  Write-Host "[SuperClaw] $Message" -ForegroundColor Cyan
}

function Ok([string]$Message) {
  Write-Host "  OK   $Message" -ForegroundColor Green
}

function Warn([string]$Message) {
  Write-Host "  WARN $Message" -ForegroundColor Yellow
}

function Fail([string]$Message) {
  Write-Host "  FAIL $Message" -ForegroundColor Red
  exit 1
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$Title) {
  Step $Title
  Write-Host ("  > " + $File + " " + ($Arguments -join " ")) -ForegroundColor DarkGray
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $File $($Arguments -join ' ')"
  }
}

function Copy-Directory([string]$Source, [string]$Destination) {
  if (-not (Test-Path $Source)) {
    Fail "Missing directory: $Source"
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  robocopy $Source $Destination /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed: $Source -> $Destination"
  }
}

function Remove-IfExists([string]$Path) {
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Write-Utf8NoBom([string]$Path, [string]$Value) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

function Assert-File([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path -PathType Leaf)) {
    Fail "$Label not found: $Path"
  }
  Ok $Label
}

function Assert-Dir([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path -PathType Container)) {
    Fail "$Label not found: $Path"
  }
  Ok $Label
}

function Ensure-ResourceDir([string]$RelativePath) {
  $dir = Join-Path $ResourcesDir $RelativePath
  if (-not (Test-Path $dir -PathType Container)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $hasFile = Get-ChildItem -Path $dir -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $hasFile) {
    Set-Content -Path (Join-Path $dir ".keep") -Value "placeholder for Tauri resource glob" -Encoding UTF8
  }
}

function Write-PortableOpenClawConfig([string]$OpenClawDataDir) {
  New-Item -ItemType Directory -Path $OpenClawDataDir -Force | Out-Null
  # Keep the packaged template path-relative. Absolute paths under Chinese
  # directories have been observed to get mojibake-corrupted and break JSON
  # parsing after the desktop client copies resources at startup.
  $workspace = "workspace"
  New-Item -ItemType Directory -Path (Join-Path $OpenClawDataDir "workspace") -Force | Out-Null

  $config = [ordered]@{
    '$schema' = "https://openclaw.ai/schema/config.json"
    meta = [ordered]@{
      lastTouchedVersion = "YY1.0.1"
      lastTouchedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    models = [ordered]@{
      providers = [ordered]@{
        minimax = [ordered]@{
          baseUrl = "https://api.minimaxi.com/anthropic/v1"
          apiKey = '${MINIMAX_API_KEY}'
          api = "anthropic-messages"
          models = @(
            [ordered]@{
              id = "MiniMax-M2.7-highspeed"
              name = "MiniMax M2.7 Highspeed"
              api = "anthropic-messages"
              reasoning = $false
              input = @("text")
              contextWindow = 204800
              maxTokens = 8192
            },
            [ordered]@{
              id = "MiniMax-M2.7"
              name = "MiniMax M2.7"
              api = "anthropic-messages"
              reasoning = $false
              input = @("text")
              contextWindow = 204800
              maxTokens = 8192
            }
          )
        }
      }
    }
    agents = [ordered]@{
      defaults = [ordered]@{
        workspace = $workspace
        model = [ordered]@{
          primary = "minimax/MiniMax-M2.7-highspeed"
          fallbacks = @("minimax/MiniMax-M2.7")
        }
        models = [ordered]@{
          "minimax/MiniMax-M2.7-highspeed" = [ordered]@{}
          "minimax/MiniMax-M2.7" = [ordered]@{}
        }
        skills = @()
        contextInjection = "never"
        bootstrapMaxChars = 300
        bootstrapTotalMaxChars = 800
        thinkingDefault = "off"
        verboseDefault = "off"
      }
      list = @([ordered]@{
        id = "main"
        name = "Main Agent"
        workspace = $workspace
        model = [ordered]@{
          primary = "minimax/MiniMax-M2.7-highspeed"
          fallbacks = @("minimax/MiniMax-M2.7")
        }
        skills = @()
        skillsLimits = [ordered]@{ maxSkillsPromptChars = 0 }
        tools = [ordered]@{
          profile = "minimal"
          alsoAllow = @("browser", "desktop_control")
        }
        thinkingDefault = "off"
        verboseDefault = "off"
      })
    }
    bindings = @()
    channels = [ordered]@{}
    commands = [ordered]@{
      native = "auto"
      nativeSkills = "auto"
      ownerDisplay = "raw"
      restart = $true
    }
    plugins = [ordered]@{
      entries = [ordered]@{
        browser = [ordered]@{ enabled = $true }
        "desktop-control" = [ordered]@{ enabled = $true }
        minimax = [ordered]@{ enabled = $true }
      }
    }
    session = [ordered]@{ dmScope = "per-channel-peer" }
    skills = [ordered]@{ entries = [ordered]@{}; limits = [ordered]@{ maxSkillsPromptChars = 0 } }
    tools = [ordered]@{
      profile = "minimal"
      alsoAllow = @("browser", "desktop_control")
      sessions = [ordered]@{ visibility = "agent" }
    }
    gateway = [ordered]@{
      mode = "local"
      bind = "loopback"
      port = 18789
      auth = [ordered]@{
        mode = "token"
        token = "superclaw-portable-local"
      }
      controlUi = [ordered]@{
        enabled = $true
        allowedOrigins = @(
          "tauri://localhost",
          "https://tauri.localhost",
          "http://tauri.localhost",
          "http://localhost",
          "http://127.0.0.1",
          "http://localhost:1420",
          "http://127.0.0.1:1420",
          "http://127.0.0.1:18777",
          "app://localhost",
          "app://",
          "null"
        )
        allowInsecureAuth = $true
      }
    }
  }

  Write-Utf8NoBom (Join-Path $OpenClawDataDir "openclaw.json") ($config | ConvertTo-Json -Depth 20)
}

function Write-PortablePanelConfig([string]$OpenClawDataDir) {
  New-Item -ItemType Directory -Path $OpenClawDataDir -Force | Out-Null
  $config = [ordered]@{
    ignoreRisk = $true
    accessPassword = ""
    engineMode = "hermes"
  }
  Write-Utf8NoBom (Join-Path $OpenClawDataDir "clawpanel.json") ($config | ConvertTo-Json -Depth 10)
}

function Repair-HermesConfig([string]$HermesDataDir) {
  New-Item -ItemType Directory -Path $HermesDataDir -Force | Out-Null
  $configPath = Join-Path $HermesDataDir "config.yaml"
  $envPath = Join-Path $HermesDataDir ".env"

  if (-not (Test-Path $configPath)) {
    Set-Content -Path $configPath -Encoding UTF8 -Value @"
# Hermes Agent configuration (managed by SuperClaw)
model:
  default:
  provider: openai-api
  base_url: http://124.222.21.44:3002/v1
platform_toolsets:
  api_server:
    - hermes-api-server
terminal:
  backend: local
platforms:
  api_server:
    enabled: true
api_server:
  host: 127.0.0.1
  port: 8642
skills:
  disabled: []
"@
  } else {
    $text = Get-Content -Raw -Path $configPath
    if ($text -match '(?m)^model:\s*$' -and $text -notmatch '(?m)^\s+provider:\s*\S+') {
      $text = $text -replace '(?m)^(\s+default:.*\r?\n)', "`$1  provider: openai-api`n"
    }
    $text = $text -replace '(?m)^(\s+provider:\s*)(custom|openai)\s*$', '${1}openai-api'
    if ($text -notmatch '(?m)^\s+base_url:\s*\S+') {
      $text = $text -replace '(?m)^(\s+provider:.*\r?\n)', "`$1  base_url: http://124.222.21.44:3002/v1`n"
    }
    Set-Content -Path $configPath -Encoding UTF8 -Value $text
  }

  $envText = if (Test-Path $envPath) { Get-Content -Raw -Path $envPath } else { "" }
  $envText = $envText -replace '(?m)^OPENAI_API_KEY=.*$', 'OPENAI_API_KEY=superclaw-login-required'
  $envText = $envText -replace '(?m)^OPENAI_BASE_URL=.*$', 'OPENAI_BASE_URL=http://124.222.21.44:3002/v1'
  if ($envText -notmatch '(?m)^OPENAI_API_KEY=') { $envText += "`nOPENAI_API_KEY=superclaw-login-required" }
  if ($envText -notmatch '(?m)^OPENAI_BASE_URL=') { $envText += "`nOPENAI_BASE_URL=http://124.222.21.44:3002/v1" }
  if ($envText -notmatch '(?m)^GATEWAY_ALLOW_ALL_USERS=') { $envText += "`nGATEWAY_ALLOW_ALL_USERS=true" }
  if ($envText -notmatch '(?m)^API_SERVER_KEY=') { $envText += "`nAPI_SERVER_KEY=clawpanel-local" }
  Set-Content -Path $envPath -Encoding UTF8 -Value ($envText.Trim() + "`n")
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$TauriDir = Join-Path $Root "src-tauri"
$ResourcesDir = Join-Path $TauriDir "resources"
$OutDir = Join-Path $Root "SuperClaw_Desktop_Client"
$ModeDir = if ($Debug) { "debug" } else { "release" }
$ExeSource = Join-Path $TauriDir "target\$ModeDir\superclaw.exe"
$ExeDest = Join-Path $OutDir "superclaw.exe"

Set-Location $Root

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SuperClaw Desktop Client Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ("Project: " + $Root)
Write-Host ("Mode:    " + $(if ($Debug) { "debug" } else { "release" }))

Step "Checking build tools"
foreach ($tool in @("node", "npm", "cargo", "rustc", "robocopy")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Fail "Required tool is missing: $tool"
  }
  Ok $tool
}

Step "Checking required resources"
Assert-Dir $ResourcesDir "Tauri resources"
Ensure-ResourceDir "uv-python"
Ensure-ResourceDir "portable"
Assert-Dir (Join-Path $ResourcesDir "runtime\openclaw") "OpenClaw runtime"
Assert-File (Join-Path $ResourcesDir "runtime\openclaw\openclaw.cmd") "OpenClaw launcher"
Assert-Dir (Join-Path $ResourcesDir "runtime\claude-code") "Claude Code runtime"
Assert-File (Join-Path $ResourcesDir "runtime\claude-code\bin\claude.exe") "Claude Code CLI"
Assert-Dir (Join-Path $ResourcesDir "runtime\claude-panel") "Claude UI panel runtime"
Assert-File (Join-Path $ResourcesDir "runtime\claude-panel\server.js") "Claude UI panel server"
Assert-Dir (Join-Path $ResourcesDir "data") "Portable data"

$TauriConf = Join-Path $TauriDir "tauri.conf.json"
$TauriConfText = Get-Content -Raw -Path $TauriConf
foreach ($glob in @(
  "resources/runtime/openclaw/**/*",
  "resources/runtime/claude-code/**/*",
  "resources/runtime/claude-panel/**/*",
  "resources/data/**/*"
)) {
  if ($TauriConfText -notlike "*$glob*") {
    Fail "tauri.conf.json is missing resource glob: $glob"
  }
}
Ok "Tauri resource globs include OpenClaw and Claude UI"

if ($CheckOnly) {
  Write-Host ""
  Write-Host "CheckOnly passed. Resources are ready for a full desktop package." -ForegroundColor Green
  exit 0
}

$NodeModules = Join-Path $Root "node_modules"
$ViteBin = Join-Path $NodeModules ".bin\vite.cmd"
$NeedsNpmInstall = (-not (Test-Path $NodeModules)) -or (-not (Test-Path $ViteBin))

if (-not $SkipNpmInstall -and $NeedsNpmInstall) {
  if ((Test-Path (Join-Path $Root "package-lock.json")) -and (-not (Test-Path $NodeModules))) {
    Invoke-Checked -File "npm" -Arguments @("ci") -Title "Installing npm dependencies"
  } else {
    Invoke-Checked -File "npm" -Arguments @("install") -Title "Installing npm dependencies"
  }
} else {
  Step "Npm dependencies"
  if ($SkipNpmInstall) {
    Warn "Skipped by -SkipNpmInstall"
  } else {
    Ok "node_modules and vite are ready"
  }
}

if (-not $SkipRuntimeDownload) {
  if (Test-Path (Join-Path $Root "scripts\download-uv.js")) {
    Invoke-Checked -File "npm" -Arguments @("run", "download:uv") -Title "Preparing uv runtime archive"
  }
  if (Test-Path (Join-Path $Root "scripts\download-openclaw.js")) {
    Invoke-Checked -File "npm" -Arguments @("run", "download:openclaw") -Title "Preparing OpenClaw runtime"
  }
} else {
  Step "Runtime download"
  Warn "Skipped by -SkipRuntimeDownload"
}

if ($Clean) {
  Invoke-Checked -File "cargo" -Arguments @("clean", "--manifest-path", (Join-Path $TauriDir "Cargo.toml")) -Title "Cleaning Rust target"
}

Invoke-Checked -File "npm" -Arguments @("run", "build") -Title "Building frontend"

if ($Debug) {
  Invoke-Checked -File "cargo" -Arguments @("build", "--manifest-path", (Join-Path $TauriDir "Cargo.toml")) -Title "Building Tauri shell"
} else {
  Invoke-Checked -File "npm" -Arguments @("run", "tauri:build") -Title "Building Tauri shell with embedded frontend"
}

Assert-File $ExeSource "Built desktop executable"

Step "Creating portable desktop client"
Remove-IfExists $OutDir
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Copy-Item -Path $ExeSource -Destination $ExeDest -Force
Copy-Directory $ResourcesDir (Join-Path $OutDir "resources")
Ok "Copied superclaw.exe and complete resources/"

Step "Cleaning packaged runtime state"
$PackagedResources = Join-Path $OutDir "resources"
$HermesData = Join-Path $PackagedResources "data\hermes"
foreach ($name in @("sessions", "logs", "audio_cache", "image_cache", "memories", "pairing", "cron", "hooks")) {
  Remove-IfExists (Join-Path $HermesData $name)
}
foreach ($name in @("gateway.lock", "gateway.pid", "gateway_state.json", "gateway-run.log", "auth.lock", ".skills_prompt_snapshot.json")) {
  Remove-IfExists (Join-Path $HermesData $name)
}

$DotOpenClaw = Join-Path $PackagedResources "data\.openclaw"
foreach ($name in @(
  "clawpanel-device-key.json",
  "gateway-owner.json",
  "openclaw.json",
  "openclaw.json.bak",
  "openclaw.json.last-good",
  "update-check.json"
)) {
  Remove-IfExists (Join-Path $DotOpenClaw $name)
}
foreach ($name in @("agents", "canvas", "devices", "identity", "logs", "tasks", "workspace")) {
  Remove-IfExists (Join-Path $DotOpenClaw $name)
}
Write-PortableOpenClawConfig $DotOpenClaw
Write-PortablePanelConfig $DotOpenClaw
Repair-HermesConfig $HermesData
Ok "Removed local sessions, logs, locks, and machine-specific OpenClaw state"

Step "Fixing portable uv virtualenv paths"
$ActivateBat = Join-Path $PackagedResources "uv-tools\hermes-agent\Scripts\activate.bat"
$PyVenvCfg = Join-Path $PackagedResources "uv-tools\hermes-agent\pyvenv.cfg"
if (Test-Path $ActivateBat) {
  (Get-Content $ActivateBat) -replace 'C:\\Users\\.*?hermes-agent', '%%~dp0..' | Set-Content $ActivateBat
  Ok "activate.bat"
} else {
  Warn "activate.bat not found"
}
if (Test-Path $PyVenvCfg) {
  (Get-Content $PyVenvCfg) -replace 'home = C:\\.*', 'home = ..\..\..\uv-python\python' | Set-Content $PyVenvCfg
  Ok "pyvenv.cfg"
} else {
  Warn "pyvenv.cfg not found"
}

Step "Verifying package"
Assert-File $ExeDest "Packaged superclaw.exe"
Assert-File (Join-Path $PackagedResources "runtime\openclaw\openclaw.cmd") "Packaged OpenClaw launcher"
Assert-File (Join-Path $PackagedResources "data\.openclaw\openclaw.json") "Packaged OpenClaw config"
Assert-File (Join-Path $PackagedResources "runtime\claude-code\bin\claude.exe") "Packaged Claude Code CLI"
Assert-File (Join-Path $PackagedResources "runtime\claude-panel\server.js") "Packaged Claude UI panel"
Assert-Dir (Join-Path $PackagedResources "data") "Packaged data directory"

$HardcodedFound = $false
foreach ($scan in @(
  (Join-Path $PackagedResources "runtime\openclaw\openclaw.cmd"),
  $ActivateBat
)) {
  if (Test-Path $scan) {
    $hit = Select-String -Path $scan -Pattern "C:\Users" -SimpleMatch -ErrorAction SilentlyContinue
    if ($hit) {
      $HardcodedFound = $true
      Warn "Hardcoded path remains in $scan"
    }
  }
}
if (-not $HardcodedFound) {
  Ok "No obvious hardcoded C:\Users path in launch scripts"
}

$PackagedFiles = Get-ChildItem -Path $OutDir -Recurse -File -ErrorAction SilentlyContinue
$FileCount = ($PackagedFiles | Measure-Object).Count
$SizeMB = [math]::Round((($PackagedFiles | Measure-Object -Property Length -Sum).Sum) / 1MB, 1)

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Desktop package complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ("Output: " + $OutDir)
Write-Host ("Files:  " + $FileCount)
Write-Host ("Size:   " + $SizeMB + " MB")
Write-Host ("Run:    " + $ExeDest)
