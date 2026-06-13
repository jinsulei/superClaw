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

.PARAMETER OutputDir
  Optional output directory for the portable desktop client.

.PARAMETER SanitizedTest
  Create a test package without remote activation, bundled YYAPI provider,
  or embedded API keys. Existing customer credentials are not copied.

.PARAMETER PackageOnly
  Skip frontend and Tauri compilation and package the existing executable.
#>

param(
  [switch]$CheckOnly,
  [switch]$Debug,
  [switch]$Clean,
  [switch]$SkipRuntimeDownload,
  [switch]$SkipNpmInstall,
  [string]$OutputDir = "",
  [switch]$SanitizedTest,
  [switch]$PackageOnly
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

function Scrub-SanitizedTextExamples([string]$Root) {
  if (-not (Test-Path $Root)) {
    return
  }

  $extensions = @(".md", ".txt", ".json", ".yaml", ".yml")
  Get-ChildItem -Path $Root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() } |
    ForEach-Object {
      $path = $_.FullName
      $text = Get-Content -LiteralPath $path -Raw -ErrorAction SilentlyContinue
      if ($null -eq $text) {
        return
      }

      $clean = $text
      $clean = $clean -replace 'Bearer\s+sk-[A-Za-z0-9_-]{8,}', 'Bearer YOUR_API_TOKEN'
      $clean = $clean -replace 'sk-[A-Za-z0-9_-]{20,}', 'sk-REDACTED'
      $clean = $clean -replace '(?im)^(\s*export\s+(OPENAI_API_KEY|MINIMAX_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|CUSTOM_API_KEY|YYAPI_KEY))=.*$', '$1  # set your own key'
      $clean = $clean -replace '(?im)^(\s*(OPENAI_API_KEY|MINIMAX_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|CUSTOM_API_KEY|YYAPI_KEY)\s*=\s*).+$', '$1YOUR_API_KEY'

      if ($clean -ne $text) {
        Write-Utf8NoBom $path $clean
      }
    }
}

function Restore-EnvValue([string]$Name, $Value) {
  if ($null -eq $Value) {
    Remove-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
  } else {
    Set-Item -LiteralPath "Env:$Name" -Value $Value
  }
}

function Ensure-PackagedPythonRuntime([string]$PackagedResources) {
  $PythonRoot = Join-Path $PackagedResources "uv-python"
  $PythonExe = Join-Path $PythonRoot "python\python.exe"
  if (Test-Path $PythonExe) {
    Ok "Portable Python runtime"
    return $PythonExe
  }

  $Archive = Get-ChildItem -LiteralPath $PackagedResources -Filter "cpython-*-windows-*.tar.gz" -File -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $Archive) {
    Fail "Portable Python archive not found in $PackagedResources"
  }

  Step "Extracting portable Python runtime"
  New-Item -ItemType Directory -Path $PythonRoot -Force | Out-Null
  & tar -xzf $Archive.FullName -C $PythonRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to extract portable Python archive: $($Archive.FullName)"
  }
  Assert-File $PythonExe "Portable Python runtime"
  return $PythonExe
}

function Test-PackagedHermesRuntime([string]$PackagedResources, [string]$PythonExe) {
  $SitePackages = Join-Path $PackagedResources "uv-tools\hermes-agent\Lib\site-packages"
  $HermesCli = Join-Path $SitePackages "hermes_cli"
  if (-not (Test-Path $HermesCli)) {
    return $false
  }

  $OldPythonPath = $env:PYTHONPATH
  $OldHermesHome = $env:HERMES_HOME
  $OldDisableUpdate = $env:HERMES_DISABLE_UPDATE_CHECK
  $OldNoUserSite = $env:PYTHONNOUSERSITE
  try {
    $env:PYTHONPATH = $SitePackages
    $env:HERMES_HOME = Join-Path $PackagedResources "data\hermes"
    $env:HERMES_DISABLE_UPDATE_CHECK = "1"
    $env:PYTHONNOUSERSITE = "1"
    & $PythonExe -c "import hermes_cli.main; import aiohttp; print('HERMES_RUNTIME_OK')" | Out-Null
    return ($LASTEXITCODE -eq 0)
  } finally {
    Restore-EnvValue "PYTHONPATH" $OldPythonPath
    Restore-EnvValue "HERMES_HOME" $OldHermesHome
    Restore-EnvValue "HERMES_DISABLE_UPDATE_CHECK" $OldDisableUpdate
    Restore-EnvValue "PYTHONNOUSERSITE" $OldNoUserSite
  }
}

function Ensure-PackagedHermesRuntime([string]$PackagedResources, [string]$PythonExe) {
  if (Test-PackagedHermesRuntime $PackagedResources $PythonExe) {
    Ok "Portable Hermes runtime"
    return
  }

  $UvExe = Join-Path $PackagedResources "bin\uv.exe"
  $HermesZip = Join-Path $PackagedResources "hermes-agent-main.zip"
  Assert-File $UvExe "Packaged uv.exe"
  Assert-File $HermesZip "Packaged Hermes source archive"

  Step "Installing portable Hermes runtime"
  $ToolHome = Join-Path $PackagedResources "uv-tools\hermes-agent"
  if (Test-Path $ToolHome) {
    Remove-Item -LiteralPath $ToolHome -Recurse -Force
  }

  $OldToolDir = $env:UV_TOOL_DIR
  $OldToolBinDir = $env:UV_TOOL_BIN_DIR
  $OldPythonInstallDir = $env:UV_PYTHON_INSTALL_DIR
  $OldNoModifyPath = $env:UV_NO_MODIFY_PATH
  $OldLinkMode = $env:UV_LINK_MODE
  try {
    $env:UV_TOOL_DIR = Join-Path $PackagedResources "uv-tools"
    $env:UV_TOOL_BIN_DIR = Join-Path $PackagedResources "uv-tools\bin"
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $PackagedResources "uv-python"
    $env:UV_NO_MODIFY_PATH = "1"
    $env:UV_LINK_MODE = "copy"
    & $UvExe tool install --force --python $PythonExe $HermesZip
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to install portable Hermes runtime"
    }

    $ToolPython = Join-Path $ToolHome "Scripts\python.exe"
    Assert-File $ToolPython "Portable Hermes venv Python"
    & $UvExe pip install --python $ToolPython aiohttp
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to install portable Hermes API server dependency: aiohttp"
    }
  } finally {
    Restore-EnvValue "UV_TOOL_DIR" $OldToolDir
    Restore-EnvValue "UV_TOOL_BIN_DIR" $OldToolBinDir
    Restore-EnvValue "UV_PYTHON_INSTALL_DIR" $OldPythonInstallDir
    Restore-EnvValue "UV_NO_MODIFY_PATH" $OldNoModifyPath
    Restore-EnvValue "UV_LINK_MODE" $OldLinkMode
  }

  if (-not (Test-PackagedHermesRuntime $PackagedResources $PythonExe)) {
    Fail "Portable Hermes runtime verification failed"
  }
  Ok "Portable Hermes runtime"
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
          alsoAllow = @("browser", "desktop_control", "skill_manager", "exec")
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
        "skill-manager" = [ordered]@{ enabled = $true }
        minimax = [ordered]@{ enabled = $true }
      }
    }
    session = [ordered]@{ dmScope = "per-channel-peer" }
    skills = [ordered]@{ entries = [ordered]@{}; limits = [ordered]@{ maxSkillsPromptChars = 0 } }
    tools = [ordered]@{
      profile = "minimal"
      alsoAllow = @("browser", "desktop_control", "skill_manager", "exec")
      exec = [ordered]@{
        host = "gateway"
        security = "full"
        ask = "off"
      }
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
          "http://localhost:3020",
          "http://127.0.0.1:3020",
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
  Write-Utf8NoBom (Join-Path $OpenClawDataDir "exec-approvals.json") (([ordered]@{ version = 1; defaults = [ordered]@{ security = "full"; ask = "off"; askFallback = "full" } }) | ConvertTo-Json -Depth 5)
}

function Write-PortablePanelConfig([string]$OpenClawDataDir, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $OpenClawDataDir -Force | Out-Null
  $config = [ordered]@{
    ignoreRisk = $true
    accessPassword = ""
    engineMode = "hermes"
  }
  if ($SanitizedTestMode) {
    $config.sanitizedTestMode = $true
    $config.disableYyapiAutoSync = $true
  }
  Write-Utf8NoBom (Join-Path $OpenClawDataDir "clawpanel.json") ($config | ConvertTo-Json -Depth 10)
}

function Repair-HermesConfig([string]$HermesDataDir, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $HermesDataDir -Force | Out-Null
  $configPath = Join-Path $HermesDataDir "config.yaml"
  $envPath = Join-Path $HermesDataDir ".env"

  if ($SanitizedTestMode) {
    Set-Content -Path $configPath -Encoding UTF8 -Value @"
# Hermes Agent configuration (sanitized SuperClaw test package)
# Uses MiniMax provider placeholders for local testing. No real API key is bundled.
# Set MINIMAX_API_KEY in the local environment before chat testing.
model:
  default: MiniMax-M2.7-highspeed
  provider: minimax-cn
  api_mode: anthropic_messages
  base_url: https://api.minimaxi.com/anthropic
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
    Set-Content -Path $envPath -Encoding UTF8 -Value @"
MINIMAX_API_KEY=`${MINIMAX_API_KEY}
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_CN_API_KEY=`${MINIMAX_API_KEY}
MINIMAX_CN_BASE_URL=https://api.minimaxi.com/anthropic
GATEWAY_ALLOW_ALL_USERS=true
API_SERVER_KEY=clawpanel-local
"@
    return
  }

  if (-not (Test-Path $configPath)) {
    Set-Content -Path $configPath -Encoding UTF8 -Value @"
# Hermes Agent configuration (managed by SuperClaw)
model:
  default:
  provider: custom
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
      $text = $text -replace '(?m)^(\s+default:.*\r?\n)', "`$1  provider: custom`n"
    }
    $text = $text -replace '(?m)^(\s+provider:\s*)(openai-api|openai)\s*$', '${1}custom'
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

function Prepare-PortableDataState([string]$DataRoot, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null

  $HermesData = Join-Path $DataRoot "hermes"
  New-Item -ItemType Directory -Path $HermesData -Force | Out-Null
  foreach ($name in @("sessions", "logs", "audio_cache", "image_cache", "memories", "pairing", "cron", "hooks")) {
    Remove-IfExists (Join-Path $HermesData $name)
  }
  foreach ($name in @("gateway.lock", "gateway.pid", "gateway_state.json", "gateway-run.log", "auth.lock", ".skills_prompt_snapshot.json", ".tirith-install-failed", "channel_directory.json")) {
    Remove-IfExists (Join-Path $HermesData $name)
  }
  foreach ($name in @("cache", "models_dev_cache.json")) {
    Remove-IfExists (Join-Path $HermesData $name)
  }
  Remove-IfExists (Join-Path $HermesData "skills\index-cache")
  Remove-IfExists (Join-Path $HermesData "skills\.hub\index-cache")
  Remove-IfExists (Join-Path $HermesData "skills\.curator_backups")
  Get-ChildItem -Path $HermesData -File -Filter "*.bak*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -Path $HermesData -File -Filter "*.last-good*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -Path $HermesData -File -Filter "*.db" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -Path $HermesData -File -Filter "*.db-shm" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -Path $HermesData -File -Filter "*.db-wal" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

  $DotOpenClaw = Join-Path $DataRoot ".openclaw"
  Remove-IfExists $DotOpenClaw
  New-Item -ItemType Directory -Path $DotOpenClaw -Force | Out-Null

  $ClawPanelData = Join-Path $DataRoot "clawpanel"
  Remove-IfExists (Join-Path $ClawPanelData "sessions")
  Remove-IfExists (Join-Path $ClawPanelData "logs")

  $ClaudePanelData = Join-Path $DataRoot "claude-panel"
  foreach ($name in @("relay-config.json", "sessions", "logs", "tmp", "cache")) {
    Remove-IfExists (Join-Path $ClaudePanelData $name)
  }

  $ClaudeConfig = Join-Path $DataRoot "claude-code\home\claude-config"
  foreach ($name in @("backups", "plans", "projects", "sessions")) {
    Remove-IfExists (Join-Path $ClaudeConfig $name)
  }

  Write-PortableOpenClawConfig $DotOpenClaw
  Write-PortablePanelConfig $DotOpenClaw $SanitizedTestMode
  Repair-HermesConfig $HermesData $SanitizedTestMode
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$TauriDir = Join-Path $Root "src-tauri"
$ResourcesDir = Join-Path $TauriDir "resources"
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutDir = Join-Path $Root "SuperClaw_Desktop_Client"
} elseif ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutDir = $OutputDir
} else {
  $OutDir = Join-Path $Root $OutputDir
}
$ModeDir = if ($Debug) { "debug" } else { "release" }
$ExeSource = Join-Path $TauriDir "target\$ModeDir\superclaw.exe"
$ExeDest = Join-Path $OutDir "superclaw.exe"

Set-Location $Root

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SuperClaw Desktop Client Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ("Project: " + $Root)
Write-Host ("Mode:    " + $(if ($Debug) { "debug" } else { "release" }))
Write-Host ("Output:  " + $OutDir)
if ($SanitizedTest) {
  Write-Host "Package: Sanitized test build (activation and bundled YYAPI disabled)" -ForegroundColor Yellow
}
if ($PackageOnly) {
  Write-Host "Build:   PackageOnly (using existing executable)" -ForegroundColor Yellow
}

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

if ($PackageOnly) {
  Step "Npm dependencies"
  Warn "Skipped by -PackageOnly"
} elseif (-not $SkipNpmInstall -and $NeedsNpmInstall) {
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

if ($PackageOnly) {
  Step "Runtime download"
  Warn "Skipped by -PackageOnly"
} elseif (-not $SkipRuntimeDownload) {
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

Step "Preparing portable resource data"
Prepare-PortableDataState (Join-Path $ResourcesDir "data") $SanitizedTest.IsPresent
Ok "Source resource data is sanitized for desktop packaging"

if (-not $PackageOnly -and $Clean) {
  Invoke-Checked -File "cargo" -Arguments @("clean", "--manifest-path", (Join-Path $TauriDir "Cargo.toml")) -Title "Cleaning Rust target"
}

if ($PackageOnly) {
  Step "Building frontend"
  Warn "Skipped by -PackageOnly"
  Step "Building Tauri shell"
  Warn "Skipped by -PackageOnly"
} else {
  Invoke-Checked -File "npm" -Arguments @("run", "build") -Title "Building frontend"

  if ($Debug) {
    Invoke-Checked -File "cargo" -Arguments @("build", "--manifest-path", (Join-Path $TauriDir "Cargo.toml")) -Title "Building Tauri shell"
  } else {
    Invoke-Checked -File "npm" -Arguments @("run", "tauri:build") -Title "Building Tauri shell with embedded frontend"
  }
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
Prepare-PortableDataState (Join-Path $PackagedResources "data") $SanitizedTest.IsPresent
if ($SanitizedTest) {
  Scrub-SanitizedTextExamples (Join-Path $PackagedResources "data")
}
Ok "Removed local sessions, logs, locks, and machine-specific OpenClaw state"

Step "Preparing packaged Hermes runtime"
$PackagedPython = Ensure-PackagedPythonRuntime $PackagedResources
Ensure-PackagedHermesRuntime $PackagedResources $PackagedPython

if ($SanitizedTest) {
  $SanitizedReadmeLines = @(
    "SuperClaw sanitized test package",
    "",
    "1. Local activation and access password are skipped. Double-click superclaw.exe to open the control panel.",
    "2. No YYAPI base URL, real API key, or local customer session is bundled.",
    "3. OpenClaw and Hermes keep MiniMax placeholders only: `${MINIMAX_API_KEY}. Configure your own key before chat testing.",
    "4. Hermes starts in the normal dashboard/chat flow, not the first-run install wizard.",
    "5. This is a USB test package, not a customer delivery package."
  )
  $SanitizedReadme = $SanitizedReadmeLines -join [Environment]::NewLine
  Write-Utf8NoBom (Join-Path $OutDir "README-SANITIZED-TEST.txt") $SanitizedReadme
}

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
