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
  Create a test package without the customer user system,
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

function Set-SanitizedTestBuildEnv {
  if (-not $SanitizedTest) { return @{} }
  $keys = @(
    "VITE_ENABLE_ECOMMERCE_ASSISTANT",
    "VITE_SUPERCLAW_DISABLE_YYAPI"
  )
  $previous = @{}
  foreach ($key in $keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
  }
  [Environment]::SetEnvironmentVariable("VITE_ENABLE_ECOMMERCE_ASSISTANT", "true", "Process")
  [Environment]::SetEnvironmentVariable("VITE_SUPERCLAW_DISABLE_YYAPI", "true", "Process")
  Ok "Sanitized frontend flags: ecommerce=true, YYAPI disabled, model config remains runtime-only"
  return $previous
}

function Restore-SanitizedTestBuildEnv([hashtable]$Previous) {
  if (-not $Previous) { return }
  foreach ($key in $Previous.Keys) {
    [Environment]::SetEnvironmentVariable($key, $Previous[$key], "Process")
  }
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

function Stop-PackagedProcesses([string]$PackageRoot) {
  if ([string]::IsNullOrWhiteSpace($PackageRoot) -or -not (Test-Path $PackageRoot)) {
    return
  }

  $ResolvedPackageRoot = (Resolve-Path -LiteralPath $PackageRoot).Path
  $Processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -and
      $_.ExecutablePath.StartsWith($ResolvedPackageRoot, [System.StringComparison]::OrdinalIgnoreCase)
    }

  foreach ($Process in $Processes) {
    Stop-Process -Id $Process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Write-Utf8NoBom([string]$Path, [string]$Value) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

function Copy-FileIfMissingOrEmpty([string]$Source, [string]$Target) {
  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    Fail "Missing OpenClaw identity template: $Source"
  }
  New-Item -ItemType Directory -Path (Split-Path $Target -Parent) -Force | Out-Null
  if (-not (Test-Path -LiteralPath $Target -PathType Leaf)) {
    Copy-Item -LiteralPath $Source -Destination $Target -Force
    return
  }
  $current = Get-Content -LiteralPath $Target -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($current)) {
    Copy-Item -LiteralPath $Source -Destination $Target -Force
  }
}

function Copy-OpenClawWorkspaceIdentity([string]$ResourcesRoot, [string]$DataRoot) {
  $templateDir = Join-Path $ResourcesRoot "templates\openclaw-workspace"
  $workspaceDir = Join-Path $DataRoot ".openclaw\workspace"
  foreach ($name in @("IDENTITY.md", "SOUL.md", "AGENTS.md")) {
    Copy-FileIfMissingOrEmpty (Join-Path $templateDir $name) (Join-Path $workspaceDir $name)
  }
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
      $clean = $clean -replace '(?im)^(\s*export\s+(OPENAI_API_KEY|MINIMAX_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|CUSTOM_API_KEY))=.*$', '$1  # set your own key'
      $clean = $clean -replace '(?im)^(\s*(OPENAI_API_KEY|MINIMAX_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|CUSTOM_API_KEY)\s*=\s*).+$', '$1YOUR_API_KEY'

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

function Find-PackagedPythonExe([string]$PythonRoot) {
  $Direct = Join-Path $PythonRoot "python\python.exe"
  if (Test-Path $Direct) {
    return $Direct
  }
  $Candidate = Get-ChildItem -LiteralPath $PythonRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName "python.exe") } |
    Select-Object -First 1
  if ($Candidate) {
    return (Join-Path $Candidate.FullName "python.exe")
  }
  return $null
}

function Get-PackagedPythonRoots([string]$PackagedResources) {
  @(
    (Join-Path $PackagedResources "runtime\uv-python"),
    (Join-Path $PackagedResources "uv-python")
  )
}

function Get-PackagedHermesToolRoots([string]$PackagedResources) {
  @(
    (Join-Path $PackagedResources "runtime\hermes-agent"),
    (Join-Path $PackagedResources "uv-tools\hermes-agent")
  )
}

function Find-PackagedPythonRoot([string]$PackagedResources) {
  foreach ($root in (Get-PackagedPythonRoots $PackagedResources)) {
    if (Find-PackagedPythonExe $root) {
      return $root
    }
  }
  return (Join-Path $PackagedResources "runtime\uv-python")
}

function Find-PackagedHermesToolRoot([string]$PackagedResources) {
  foreach ($root in (Get-PackagedHermesToolRoots $PackagedResources)) {
    if (Test-Path (Join-Path $root "Lib\site-packages\hermes_cli")) {
      return $root
    }
  }
  return (Join-Path $PackagedResources "runtime\hermes-agent")
}

function Ensure-PackagedPythonRuntime([string]$PackagedResources) {
  $PythonRoot = Find-PackagedPythonRoot $PackagedResources
  $PythonExe = Find-PackagedPythonExe $PythonRoot
  if ($PythonExe -and (Test-Path $PythonExe)) {
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
  $PythonExe = Find-PackagedPythonExe $PythonRoot
  Assert-File $PythonExe "Portable Python runtime"
  return $PythonExe
}

function Test-PackagedHermesRuntime([string]$PackagedResources, [string]$PythonExe) {
  $HermesTool = Find-PackagedHermesToolRoot $PackagedResources
  $SitePackages = Join-Path $HermesTool "Lib\site-packages"
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
  $ToolHome = Join-Path $PackagedResources "runtime\hermes-agent"
  if (Test-Path $ToolHome) {
    Remove-Item -LiteralPath $ToolHome -Recurse -Force
  }

  $OldToolDir = $env:UV_TOOL_DIR
  $OldToolBinDir = $env:UV_TOOL_BIN_DIR
  $OldPythonInstallDir = $env:UV_PYTHON_INSTALL_DIR
  $OldNoModifyPath = $env:UV_NO_MODIFY_PATH
  $OldLinkMode = $env:UV_LINK_MODE
  try {
    $env:UV_TOOL_DIR = Join-Path $PackagedResources "runtime\uv-tools"
    $env:UV_TOOL_BIN_DIR = Join-Path $PackagedResources "runtime\uv-tools\bin"
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $PackagedResources "runtime\uv-python"
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

function Sync-SuperClawOpenClawPlugins {
  $SourceExtensions = Join-Path $ResourcesDir "runtime\openclaw\dist\extensions"
  $RuntimeExtensions = Join-Path $ResourcesDir "runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions"
  Assert-Dir $SourceExtensions "SuperClaw OpenClaw plugin source directory"
  New-Item -ItemType Directory -Path $RuntimeExtensions -Force | Out-Null

  foreach ($plugin in @("skill-manager", "desktop-control")) {
    $source = Join-Path $SourceExtensions $plugin
    $destination = Join-Path $RuntimeExtensions $plugin
    Copy-Directory $source $destination
    Assert-File (Join-Path $destination "openclaw.plugin.json") "OpenClaw plugin manifest: $plugin"
    Assert-File (Join-Path $destination "index.js") "OpenClaw plugin entry: $plugin"
  }

  $DesktopAgentSource = Join-Path $ResourcesDir "bin\desktop-control-agent.exe"
  $DesktopAgentDestDir = Join-Path $ResourcesDir "runtime\openclaw\bin"
  $DesktopAgentDest = Join-Path $DesktopAgentDestDir "desktop-control-agent.exe"
  Assert-File $DesktopAgentSource "Desktop control sidecar source"
  New-Item -ItemType Directory -Path $DesktopAgentDestDir -Force | Out-Null
  Copy-Item -Path $DesktopAgentSource -Destination $DesktopAgentDest -Force
  Assert-File $DesktopAgentDest "OpenClaw desktop-control sidecar"
  Ok "SuperClaw OpenClaw plugins are installed into the runtime package path"
}

function Write-PortableOpenClawConfig([string]$OpenClawDataDir, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $OpenClawDataDir -Force | Out-Null
  # Keep the packaged template path-relative. Absolute paths under Chinese
  # directories have been observed to get mojibake-corrupted and break JSON
  # parsing after the desktop client copies resources at startup.
  $workspace = "workspace"
  $baselineSkills = @(
    "healthcheck",
    "node-connect",
    "skill-creator",
    "taskflow",
    "taskflow-inbox-triage",
    "weather"
  )
  New-Item -ItemType Directory -Path (Join-Path $OpenClawDataDir "workspace") -Force | Out-Null
  $RuntimeSkills = Join-Path $ResourcesDir "runtime\openclaw\skills"
  $PortableSkills = Join-Path $OpenClawDataDir "skills"
  if (Test-Path $RuntimeSkills -PathType Container) {
    Copy-Directory $RuntimeSkills $PortableSkills
  }

  $providers = [ordered]@{
    minimax = [ordered]@{
      baseUrl = ""
      apiKey = ""
      api = "openai-completions"
      models = @()
      needsSetup = $true
    }
    "openai-compatible" = [ordered]@{
      baseUrl = ""
      apiKey = ""
      api = "openai-completions"
      models = @()
      needsSetup = $true
    }
  }
  $defaultModelRef = ""
  $defaultModels = [ordered]@{}

  $config = [ordered]@{
    '$schema' = "https://openclaw.ai/schema/config.json"
    meta = [ordered]@{
      lastTouchedVersion = "2026.5.26-zh.1"
      lastTouchedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    models = [ordered]@{
      providers = $providers
    }
    agents = [ordered]@{
      defaults = [ordered]@{
        workspace = $workspace
        model = [ordered]@{
          primary = $defaultModelRef
          fallbacks = @()
        }
        models = $defaultModels
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
          primary = $defaultModelRef
          fallbacks = @()
        }
        skillsLimits = [ordered]@{ maxSkillsPromptChars = 12000 }
        tools = [ordered]@{
          profile = "minimal"
          alsoAllow = @("browser", "desktop_control", "skill_manager", "exec", "process")
          exec = [ordered]@{
            host = "gateway"
            security = "full"
            ask = "off"
          }
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
      allow = @("browser", "desktop-control", "skill-manager")
      entries = [ordered]@{
        browser = [ordered]@{ enabled = $true }
        "desktop-control" = [ordered]@{ enabled = $true }
        "skill-manager" = [ordered]@{ enabled = $true }
      }
    }
    session = [ordered]@{ dmScope = "per-channel-peer" }
    skills = [ordered]@{
      entries = [ordered]@{}
      limits = [ordered]@{ maxSkillsPromptChars = 12000 }
    }
    tools = [ordered]@{
      profile = "minimal"
      alsoAllow = @("browser", "desktop_control", "skill_manager", "exec", "process")
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
      remote = [ordered]@{
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
  $agentModelDir = Join-Path $OpenClawDataDir "agents\main\agent"
  New-Item -ItemType Directory -Path $agentModelDir -Force | Out-Null
  $agentModels = [ordered]@{
    providers = $providers
    defaults = [ordered]@{
      provider = ""
      model = ""
      modelRef = $defaultModelRef
    }
    needsSetup = $true
  }
  Write-Utf8NoBom (Join-Path $agentModelDir "models.json") ($agentModels | ConvertTo-Json -Depth 20)
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
    $config.noUserSystem = $true
  }
  Write-Utf8NoBom (Join-Path $OpenClawDataDir "clawpanel.json") ($config | ConvertTo-Json -Depth 10)
}

function Write-PortableClaudePanelRelayConfig([string]$ClaudePanelDataDir, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $ClaudePanelDataDir -Force | Out-Null
  $configPath = Join-Path $ClaudePanelDataDir "relay-config.json"
  $config = [ordered]@{
    enabled = $false
    interfaceType = "relay"
    name = ""
    provider = ""
    defaultProvider = ""
    baseUrl = ""
    model = ""
    models = @()
    branchModels = @()
    apiKey = ""
    needsSetup = $true
    managedBy = "runtime-config"
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-Utf8NoBom $configPath ($config | ConvertTo-Json -Depth 10)
}

function Prepare-HermesRuntimeConfigDirectory([string]$HermesDataDir, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $HermesDataDir -Force | Out-Null
  foreach ($name in @("config.yaml", ".env", ".env.local")) {
    Remove-IfExists (Join-Path $HermesDataDir $name)
  }
}

function Prepare-PortableDataState([string]$DataRoot, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null

  $MemoryData = Join-Path $DataRoot "memory"
  Remove-IfExists $MemoryData
  New-Item -ItemType Directory -Path $MemoryData -Force | Out-Null
  Write-Utf8NoBom (Join-Path $MemoryData "memory-config.json") (@"
{
  "memory": {
    "enabled": true,
    "store": "local",
    "portable": true,
    "path": "data/memory",
    "maxRecentMessages": 50,
    "maxSummaryLength": 8000,
    "persistTaskContext": true,
    "persistAgentMessages": true,
    "sharedForAgents": ["hermes", "openclaw", "claude_code"]
  }
}
"@)

  $HermesData = Join-Path $DataRoot "hermes"
  New-Item -ItemType Directory -Path $HermesData -Force | Out-Null
  foreach ($name in @("sessions", "logs", "audio_cache", "image_cache", "memories", "pairing", "cron", "hooks")) {
    Remove-IfExists (Join-Path $HermesData $name)
  }
  foreach ($name in @("gateway.lock", "gateway.pid", "gateway_state.json", "gateway-run.log", "auth.lock", "auth.json", ".skills_prompt_snapshot.json", ".tirith-install-failed", "channel_directory.json")) {
    Remove-IfExists (Join-Path $HermesData $name)
  }
  foreach ($name in @("cache", "models_dev_cache.json")) {
    Remove-IfExists (Join-Path $HermesData $name)
  }
  Remove-IfExists (Join-Path $HermesData "skills\index-cache")
  Remove-IfExists (Join-Path $HermesData "skills\.hub\index-cache")
  Remove-IfExists (Join-Path $HermesData "skills\.hub\lock.json")
  Remove-IfExists (Join-Path $HermesData "skills\.hub\audit.log")
  Remove-IfExists (Join-Path $HermesData "skills\.curator_state")
  Remove-IfExists (Join-Path $HermesData "skills\.curator_backups")
  Remove-IfExists (Join-Path $HermesData "skills\.usage.json")
  Remove-IfExists (Join-Path $HermesData "skills\.usage.json.lock")
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
  foreach ($name in @("auth.json", "user.json", "profile.json", "payment.json", "quota.json", "usage.json", "license.json", "recent.json", "memory", "cache", "tmp")) {
    Remove-IfExists (Join-Path $ClawPanelData $name)
  }

  $ClaudePanelData = Join-Path $DataRoot "claude-panel"
  foreach ($name in @(
    ".claude",
    ".claude.json",
    "AppData",
    "audit.log",
    "conversations.json",
    "Documents",
    "panel.err.log",
    "panel.log",
    "project-folders.json",
    "projects.json",
    "recent-projects.json",
    "relay-config.json",
    "sessions",
    "logs",
    "tmp",
    "cache"
  )) {
    Remove-IfExists (Join-Path $ClaudePanelData $name)
  }

  $ClaudeCodeData = Join-Path $DataRoot "claude-code"
  foreach ($name in @("projects", "sessions", "logs", "cache", "tmp")) {
    Remove-IfExists (Join-Path $ClaudeCodeData $name)
  }

  $ClaudeCodeHome = Join-Path $DataRoot "claude-code\home"
  foreach ($name in @(
    ".claude",
    ".claude.json",
    ".config",
    ".cache",
    "AppData",
    "Documents",
    "claude-config\.claude.json",
    "claude-config\.last-cleanup",
    "claude-config\backups",
    "claude-config\plans",
    "claude-config\projects",
    "claude-config\sessions"
  )) {
    Remove-IfExists (Join-Path $ClaudeCodeHome $name)
  }

  $ClaudeConfig = Join-Path $DataRoot "claude-code\home\claude-config"
  foreach ($name in @(".claude.json", "settings.json", ".last-cleanup", "backups", "plans", "projects", "sessions")) {
    Remove-IfExists (Join-Path $ClaudeConfig $name)
  }

  Write-PortableOpenClawConfig $DotOpenClaw $SanitizedTestMode
  Copy-OpenClawWorkspaceIdentity $ResourcesDir $DataRoot
  Write-PortablePanelConfig $DotOpenClaw $SanitizedTestMode
  Write-PortableClaudePanelRelayConfig $ClaudePanelData $SanitizedTestMode
  Prepare-HermesRuntimeConfigDirectory $HermesData $SanitizedTestMode
}

function Clear-PackagedRuntimeArtifacts([string]$DataRoot) {
  if (-not (Test-Path $DataRoot -PathType Container)) {
    return
  }

  foreach ($pattern in @("*.log", "*.pid", "*.lock", "*.tmp", "*.bak", "*.last-good", "*.db", "*.db-shm", "*.db-wal", "*.sqlite", "*.sqlite-shm", "*.sqlite-wal")) {
    Get-ChildItem -Path $DataRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }

  foreach ($rel in @(
    "claude-code\home\.claude",
    "claude-code\home\AppData",
    "claude-code\home\Documents",
    "claude-code\home\claude-config\backups",
    "claude-code\home\claude-config\plans",
    "claude-code\home\claude-config\projects",
    "claude-code\home\claude-config\sessions",
    "claude-code\projects",
    "claude-code\sessions",
    "claude-panel\.claude",
    "claude-panel\AppData",
    "claude-panel\Documents",
    "hermes\cron",
    "hermes\logs",
    "hermes\memory",
    "hermes\memories",
    "hermes\sessions",
    "hermes\skills\.curator_backups",
    "hermes\skills\.curator_state",
    "hermes\skills\.hub\audit.log",
    "hermes\skills\.hub\index-cache",
    "hermes\skills\.hub\lock.json",
    "hermes\skills\.usage.json",
    "hermes\skills\.usage.json.lock",
    "hermes\skills\index-cache",
    ".openclaw\logs",
    ".openclaw\state",
    ".openclaw\workspace-attestations",
    "clawpanel\logs",
    "clawpanel\sessions",
    "clawpanel\cache",
    "claude-panel\logs"
  )) {
    Remove-IfExists (Join-Path $DataRoot $rel)
  }

  foreach ($name in @(
    "claude-panel\.claude.json",
    "claude-panel\audit.log",
    "claude-panel\conversations.json",
    "claude-panel\panel.err.log",
    "claude-panel\panel.log",
    "claude-panel\project-folders.json",
    "claude-panel\projects.json",
    "claude-panel\recent-projects.json",
    "claude-code\home\claude-config\.claude.json",
    "claude-code\home\claude-config\settings.json",
    "clawpanel\auth.json",
    "clawpanel\license.json",
    "clawpanel\payment.json",
    "clawpanel\profile.json",
    "clawpanel\quota.json",
    "clawpanel\recent.json",
    "clawpanel\usage.json",
    "clawpanel\user.json",
    "hermes\auth.json",
    "hermes\channel_directory.json",
    "hermes\gateway_state.json",
    "hermes\user-memory.json"
  )) {
    Remove-IfExists (Join-Path $DataRoot $name)
  }
}

function Clear-PackagedMachineSpecificPaths([string]$PackagedResources) {
  $HermesTool = Find-PackagedHermesToolRoot $PackagedResources
  $HermesScripts = Join-Path $HermesTool "Scripts"

  # uv writes install receipts and non-Windows activation scripts with the build
  # machine path. SuperClaw launches Hermes directly via python.exe, so these are
  # not needed in the Windows portable client and should not be shipped.
  foreach ($rel in @(
    "uv-receipt.toml",
    "Scripts\activate",
    "Scripts\activate.csh",
    "Scripts\activate.fish",
    "Scripts\activate.nu"
  )) {
    Remove-IfExists (Join-Path $HermesTool $rel)
  }

  $ActivateBat = Join-Path $HermesScripts "activate.bat"
  if (Test-Path $ActivateBat) {
    (Get-Content -Raw $ActivateBat) -replace 'C:\\Users\\.*?hermes-agent', '%%~dp0..' |
      Set-Content -Path $ActivateBat -Encoding UTF8
  }

  $ActivatePs1 = Join-Path $HermesScripts "activate.ps1"
  if (Test-Path $ActivatePs1) {
    (Get-Content -Raw $ActivatePs1) -replace 'C:\\Users\\.*?hermes-agent', '$PSScriptRoot\..' |
      Set-Content -Path $ActivatePs1 -Encoding UTF8
  }

  $CleanupRoots = @()
  $CleanupRoots += Get-PackagedHermesToolRoots $PackagedResources
  $CleanupRoots += Get-PackagedPythonRoots $PackagedResources
  foreach ($root in $CleanupRoots) {
    if (Test-Path $root -PathType Container) {
      Get-ChildItem -Path $root -Recurse -Directory -Force -Filter "__pycache__" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  $ClaudePanelData = Join-Path $PackagedResources "data\claude-panel"
  foreach ($name in @("project-folders.json", "projects.json", "recent-projects.json")) {
    Remove-IfExists (Join-Path $ClaudePanelData $name)
  }
}

function Remove-PackagedRuntimeState([string]$PackageDir) {
  if (-not (Test-Path $PackageDir -PathType Container)) {
    return
  }

  foreach ($pattern in @("config.yaml", ".env", ".env.local", "user-memory.json")) {
    Get-ChildItem -LiteralPath $PackageDir -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }

  $runtimeDirPatterns = @(
    "\\resources\\data\\claude-code\\home\\claude-config\\projects($|\\)",
    "\\resources\\data\\hermes\\memory($|\\)",
    "\\resources\\data\\[^\\]+\\logs($|\\)",
    "\\resources\\data\\[^\\]+\\history($|\\)",
    "\\resources\\data\\[^\\]+\\cache($|\\)"
  )

  Get-ChildItem -LiteralPath $PackageDir -Recurse -Force -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      $full = $_.FullName
      foreach ($pattern in $runtimeDirPatterns) {
        if ($full -match $pattern) { return $true }
      }
      return $false
    } |
    Sort-Object FullName -Descending |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

function Assert-CleanPackageForRelease([string]$PackageDir) {
  if (-not (Test-Path $PackageDir -PathType Container)) {
    Fail "Package directory does not exist: $PackageDir"
  }

  $blockedFiles = @("config.yaml", ".env", ".env.local", "user-memory.json")
  foreach ($blocked in $blockedFiles) {
    $hit = Get-ChildItem -LiteralPath $PackageDir -Recurse -Force -File -Filter $blocked -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($hit) {
      Fail "Package contains blocked runtime/config file: $($hit.FullName)"
    }
  }

  $blockedDirPatterns = @(
    "\\resources\\data\\claude-code\\home\\claude-config\\projects($|\\)",
    "\\resources\\data\\hermes\\memory($|\\)"
  )
  $blockedDir = Get-ChildItem -LiteralPath $PackageDir -Recurse -Force -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      $full = $_.FullName
      foreach ($pattern in $blockedDirPatterns) {
        if ($full -match $pattern) { return $true }
      }
      return $false
    } |
    Select-Object -First 1
  if ($blockedDir) {
    Fail "Package contains blocked runtime directory: $($blockedDir.FullName)"
  }

  $blockedTextPatterns = @(
    "124\.222\.21\.44",
    "(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}",
    "Bearer\s+(sk|ark|eyJ)[A-Za-z0-9._~+/-]{20,}",
    "release-user-package",
    "SuperClaw-1\.0\.4",
    "电商1\.0\.2"
  )
  $textExtensions = @(".cmd", ".bat", ".ps1", ".sh", ".js", ".mjs", ".json", ".md", ".txt", ".yaml", ".yml", ".toml", ".html", ".css")
  $textHit = Get-ChildItem -LiteralPath $PackageDir -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $textExtensions -contains $_.Extension.ToLowerInvariant() } |
    Select-String -Pattern $blockedTextPatterns -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($textHit) {
    Fail "Package contains blocked sensitive/legacy text: $($textHit.Path):$($textHit.LineNumber)"
  }

  Ok "Release package has no runtime model config, env files, user memory, or legacy sensitive markers"
}

function Clear-PackagedForbiddenFiles([string]$PackageRoot) {
  if (-not (Test-Path $PackageRoot -PathType Container)) {
    return
  }

  Remove-PackagedRuntimeState $PackageRoot

  Get-ChildItem -LiteralPath $PackageRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @("config.yaml", ".env", ".env.local", "user-memory.json") -or $_.Name -like "backup-*.patch" } |
    Remove-Item -Force -ErrorAction SilentlyContinue

  Get-ChildItem -LiteralPath $PackageRoot -Recurse -Force -Directory -Filter ".git" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

function Assert-NoForbiddenPackageFiles([string]$PackageRoot) {
  $found = Get-ChildItem -LiteralPath $PackageRoot -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -in @("config.yaml", ".env", ".env.local", "user-memory.json") -or
      $_.Name -like "backup-*.patch" -or
      ($_.PSIsContainer -and $_.Name -eq ".git") -or
      ($_.PSIsContainer -and $_.FullName -match "\\hermes\\memory($|\\)")
    } |
    Select-Object -First 10
  if ($found) {
    $names = ($found | ForEach-Object { $_.FullName.Replace($PackageRoot, "").TrimStart("\") }) -join ", "
    Fail "Forbidden files remain in package: $names"
  }
  Ok "No config.yaml, .env, .env.local, user-memory.json, backup patch, or .git files in package"
}

function Scrub-PackagedPathExamples([string]$PackageRoot) {
  if (-not (Test-Path $PackageRoot -PathType Container)) {
    return
  }

  Get-ChildItem -LiteralPath $PackageRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".md", ".txt") } |
    ForEach-Object {
      $text = Get-Content -Raw -LiteralPath $_.FullName -ErrorAction SilentlyContinue
      if ($null -ne $text -and $text.Contains("C:\tmp")) {
        Set-Content -LiteralPath $_.FullName -Encoding UTF8 -Value ($text.Replace("C:\tmp", "%TEMP%"))
      }
    }
}

function Assert-NoPackagedUserState([string]$DataRoot) {
  $forbidden = @(
    ".openclaw\devices\pending.json",
    ".openclaw\gateway-owner.json",
    ".openclaw\identity",
    ".openclaw\logs",
    ".openclaw\state",
    ".openclaw\update-check.json",
    ".openclaw\workspace-attestations",
    "claude-code\home\.claude",
    "claude-code\home\.claude.json",
    "claude-code\home\AppData",
    "claude-code\home\Documents",
    "claude-code\home\claude-config\.claude.json",
    "claude-code\home\claude-config\settings.json",
    "claude-code\home\claude-config\backups",
    "claude-code\home\claude-config\plans",
    "claude-code\home\claude-config\projects",
    "claude-code\home\claude-config\sessions",
    "claude-code\projects",
    "claude-code\sessions",
    "claude-panel\.claude",
    "claude-panel\.claude.json",
    "claude-panel\AppData",
    "claude-panel\audit.log",
    "claude-panel\conversations.json",
    "claude-panel\Documents",
    "claude-panel\panel.err.log",
    "claude-panel\panel.log",
    "claude-panel\project-folders.json",
    "claude-panel\projects.json",
    "claude-panel\recent-projects.json",
    "clawpanel\auth.json",
    "clawpanel\license.json",
    "clawpanel\payment.json",
    "clawpanel\profile.json",
    "clawpanel\quota.json",
    "clawpanel\sessions",
    "clawpanel\usage.json",
    "clawpanel\user.json",
    "hermes\auth.json",
    "hermes\cache",
    "hermes\channel_directory.json",
    "hermes\cron",
    "hermes\gateway_state.json",
    "hermes\logs",
    "hermes\memory",
    "hermes\memories",
    "hermes\sessions",
    "hermes\user-memory.json",
    "hermes\skills\.curator_backups",
    "hermes\skills\.curator_state",
    "hermes\skills\.hub\audit.log",
    "hermes\skills\.hub\index-cache",
    "hermes\skills\.hub\lock.json",
    "hermes\skills\.usage.json",
    "hermes\skills\.usage.json.lock",
    "hermes\skills\index-cache"
  )

  $found = @()
  foreach ($rel in $forbidden) {
    $candidate = Join-Path $DataRoot $rel
    if (Test-Path $candidate) {
      $found += $rel
    }
  }

  foreach ($pattern in @("*.log", "*.pid", "*.lock", "*.db", "*.db-shm", "*.db-wal", "*.sqlite", "*.sqlite-shm", "*.sqlite-wal")) {
    $matches = Get-ChildItem -Path $DataRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue |
      Select-Object -First 20
    foreach ($match in $matches) {
      $found += $match.FullName.Substring($DataRoot.Length).TrimStart('\', '/')
    }
  }

  if ($found.Count -gt 0) {
    Fail ("Packaged user/runtime state was not cleaned: " + (($found | Select-Object -Unique) -join ", "))
  }

  $agentsRoot = Join-Path $DataRoot ".openclaw\agents"
  if (Test-Path $agentsRoot -PathType Container) {
    $allowedAgentFiles = @("main\agent\models.json")
    $unexpectedAgentFiles = Get-ChildItem -LiteralPath $agentsRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
      ForEach-Object { $_.FullName.Substring($agentsRoot.Length).TrimStart("\") } |
      Where-Object { $allowedAgentFiles -notcontains $_ }
    if ($unexpectedAgentFiles) {
      Fail ("Packaged OpenClaw agent state was not cleaned: " + (($unexpectedAgentFiles | Select-Object -Unique) -join ", "))
    }
  }
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
  Write-Host "Package: sanitized runtime-config build without bundled model credentials" -ForegroundColor Yellow
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
Assert-Dir (Join-Path $ResourcesDir "runtime\uv-python") "Portable Python runtime source"
Assert-Dir (Join-Path $ResourcesDir "runtime\uv-tools") "UV tools runtime source"
Assert-File (Join-Path $ResourcesDir "runtime\uv-tools\uv.exe") "UV tools executable source"
Assert-Dir (Join-Path $ResourcesDir "runtime\hermes-agent") "Hermes agent runtime source"
Assert-File (Join-Path $ResourcesDir "runtime\hermes-agent\Scripts\hermes.exe") "Hermes bundled executable source"
Ensure-ResourceDir "portable"
Assert-Dir (Join-Path $ResourcesDir "runtime\openclaw") "OpenClaw runtime"
Assert-File (Join-Path $ResourcesDir "runtime\openclaw\openclaw.cmd") "OpenClaw launcher"
foreach ($identityFile in @("IDENTITY.md", "SOUL.md", "AGENTS.md")) {
  Assert-File (Join-Path $ResourcesDir "templates\openclaw-workspace\$identityFile") "OpenClaw identity template $identityFile"
}
Sync-SuperClawOpenClawPlugins
Assert-Dir (Join-Path $ResourcesDir "runtime\claude-panel") "Claude UI panel runtime"
Assert-File (Join-Path $ResourcesDir "runtime\claude-panel\server.js") "Claude UI panel server"
if (Test-Path -LiteralPath (Join-Path $ResourcesDir "runtime\claude-code\bin\claude.exe") -PathType Leaf) {
  Ok "Claude Code native CLI"
} else {
  Warn "Claude Code native CLI is not bundled; Claude Panel OPENAI_RELAY will be used for this EXE test package"
}
Assert-Dir (Join-Path $ResourcesDir "runtime\ocr") "Shared OCR runtime"
Assert-File (Join-Path $ResourcesDir "runtime\ocr\ocr-runner.cjs") "Shared OCR runner"
Assert-File (Join-Path $ResourcesDir "runtime\ocr\tessdata\eng.traineddata.gz") "OCR English language data"
Assert-File (Join-Path $ResourcesDir "runtime\ocr\tessdata\chi_sim.traineddata.gz") "OCR Chinese language data"
Assert-File (Join-Path $ResourcesDir "data\ocr\ocr-config.json") "Shared OCR config"
Assert-Dir (Join-Path $ResourcesDir "data") "Portable data"

$TauriConf = Join-Path $TauriDir "tauri.conf.json"
$TauriConfText = Get-Content -Raw -Path $TauriConf
function Test-TauriResourceGlob([string]$Glob) {
  if ($TauriConfText -like "*$Glob*") { return $true }
  if ($Glob -like "resources/runtime/*" -and $TauriConfText -like "*resources/runtime/**/*") { return $true }
  return $false
}
foreach ($glob in @(
  "resources/runtime/openclaw/**/*",
  "resources/runtime/claude-code/**/*",
  "resources/runtime/claude-panel/**/*",
  "resources/runtime/ocr/**/*",
  "resources/data/**/*"
)) {
  if (-not (Test-TauriResourceGlob $glob)) {
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
  $previousBuildEnv = Set-SanitizedTestBuildEnv
  try {
    Invoke-Checked -File "npm" -Arguments @("run", "build") -Title "Building frontend"

    if ($Debug) {
      Invoke-Checked -File "cargo" -Arguments @("build", "--manifest-path", (Join-Path $TauriDir "Cargo.toml")) -Title "Building Tauri shell"
    } else {
      Invoke-Checked -File "npm" -Arguments @("run", "tauri:build") -Title "Building Tauri shell with embedded frontend"
    }
  } finally {
    Restore-SanitizedTestBuildEnv $previousBuildEnv
  }
}

Assert-File $ExeSource "Built desktop executable"

Step "Creating portable desktop client"
Stop-PackagedProcesses $OutDir
Remove-IfExists $OutDir
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Copy-Item -Path $ExeSource -Destination $ExeDest -Force
Copy-Directory $ResourcesDir (Join-Path $OutDir "resources")
Ok "Copied superclaw.exe and complete resources/"

Step "Cleaning packaged runtime state"
$PackagedResources = Join-Path $OutDir "resources"
Prepare-PortableDataState (Join-Path $PackagedResources "data") $SanitizedTest.IsPresent
Clear-PackagedRuntimeArtifacts (Join-Path $PackagedResources "data")
if ($SanitizedTest) {
  Scrub-SanitizedTextExamples (Join-Path $PackagedResources "data")
}
Ok "Removed local sessions, logs, locks, and machine-specific OpenClaw state"

Step "Preparing packaged Hermes runtime"
$PackagedPython = Ensure-PackagedPythonRuntime $PackagedResources
Ensure-PackagedHermesRuntime $PackagedResources $PackagedPython

if ($SanitizedTest) {
  $SanitizedReadmeLines = @(
    "SuperClaw sanitized runtime-config package",
    "",
    "1. Customer login, registration, activation, claim, and profile pages are not part of this test package.",
    "2. No real API key or local customer session is bundled.",
    "3. Model providers, base URLs, API keys, and model names must be configured at runtime before chat testing.",
    "4. Hermes starts in the normal dashboard/chat flow and reports needs_setup until runtime model configuration is provided.",
    "5. This is a USB test package, not a customer delivery package."
  )
  $SanitizedReadme = $SanitizedReadmeLines -join [Environment]::NewLine
  Write-Utf8NoBom (Join-Path $OutDir "README-SANITIZED-TEST.txt") $SanitizedReadme
}

Step "Fixing portable uv virtualenv paths"
$PackagedHermesTool = Find-PackagedHermesToolRoot $PackagedResources
$PackagedPythonRoot = Find-PackagedPythonRoot $PackagedResources
$ActivateBat = Join-Path $PackagedHermesTool "Scripts\activate.bat"
$PyVenvCfg = Join-Path $PackagedHermesTool "pyvenv.cfg"
if (Test-Path $ActivateBat) {
  (Get-Content $ActivateBat) -replace 'C:\\Users\\.*?hermes-agent', '%%~dp0..' | Set-Content $ActivateBat
  Ok "activate.bat"
} else {
  Warn "activate.bat not found"
}
if (Test-Path $PyVenvCfg) {
  $PythonExeForVenv = Find-PackagedPythonExe $PackagedPythonRoot
  if ($PythonExeForVenv) {
    $PythonHomeForVenv = Split-Path -Parent $PythonExeForVenv
    $PythonHomeLeaf = Split-Path -Leaf $PythonHomeForVenv
    if ($PackagedPythonRoot -like "*\runtime\uv-python") {
      $PortableHome = "..\uv-python\$PythonHomeLeaf"
    } else {
      $PortableHome = "..\..\..\uv-python\$PythonHomeLeaf"
    }
    (Get-Content $PyVenvCfg) -replace '^home = .*', "home = $PortableHome" | Set-Content $PyVenvCfg
  } else {
    Warn "portable Python home not found for pyvenv.cfg"
  }
  Ok "pyvenv.cfg"
} else {
  Warn "pyvenv.cfg not found"
}
Clear-PackagedMachineSpecificPaths $PackagedResources

Step "Final packaged runtime cleanup"
Stop-PackagedProcesses $OutDir
Clear-PackagedRuntimeArtifacts (Join-Path $PackagedResources "data")
Clear-PackagedMachineSpecificPaths $PackagedResources
Remove-PackagedRuntimeState $OutDir
Clear-PackagedForbiddenFiles $OutDir
Scrub-PackagedPathExamples $OutDir
Assert-CleanPackageForRelease $OutDir
Ok "Removed logs, locks, and pid files created during package verification"

Step "Verifying package"
Assert-File $ExeDest "Packaged superclaw.exe"
Assert-File (Join-Path $PackagedResources "runtime\openclaw\openclaw.cmd") "Packaged OpenClaw launcher"
foreach ($identityFile in @("IDENTITY.md", "SOUL.md", "AGENTS.md")) {
  Assert-File (Join-Path $PackagedResources "templates\openclaw-workspace\$identityFile") "Packaged OpenClaw identity template $identityFile"
  Assert-File (Join-Path $PackagedResources "data\.openclaw\workspace\$identityFile") "Packaged OpenClaw workspace identity $identityFile"
}
Assert-File (Join-Path $PackagedResources "runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions\skill-manager\openclaw.plugin.json") "Packaged OpenClaw skill-manager plugin"
Assert-File (Join-Path $PackagedResources "runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions\desktop-control\openclaw.plugin.json") "Packaged OpenClaw desktop-control plugin"
Assert-File (Join-Path $PackagedResources "runtime\openclaw\bin\desktop-control-agent.exe") "Packaged OpenClaw desktop-control sidecar"
Assert-File (Join-Path $PackagedResources "data\.openclaw\openclaw.json") "Packaged OpenClaw config"
Assert-File (Join-Path $PackagedResources "runtime\hermes-agent\Scripts\hermes.exe") "Hermes bundled executable"
Assert-File (Join-Path $PackagedResources "runtime\uv-tools\uv.exe") "Packaged UV tools executable"
$PackagedPythonProbe = Get-ChildItem -LiteralPath (Join-Path $PackagedResources "runtime\uv-python") -Recurse -Filter "python.exe" -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $PackagedPythonProbe) {
  Fail "Packaged UV Python executable not found under resources\runtime\uv-python"
}
Ok "Packaged UV Python executable"
Assert-File (Join-Path $PackagedResources "runtime\claude-panel\server.js") "Packaged Claude UI panel"
if (Test-Path -LiteralPath (Join-Path $PackagedResources "runtime\claude-code\bin\claude.exe") -PathType Leaf) {
  Ok "Packaged Claude Code native CLI"
} else {
  Warn "Packaged Claude Code native CLI is absent; packaged Claude Panel relay is the supported Claude Code surface"
}
Assert-File (Join-Path $PackagedResources "runtime\ocr\ocr-runner.cjs") "Packaged shared OCR runner"
Assert-File (Join-Path $PackagedResources "runtime\ocr\tessdata\eng.traineddata.gz") "Packaged OCR English language data"
Assert-File (Join-Path $PackagedResources "runtime\ocr\tessdata\chi_sim.traineddata.gz") "Packaged OCR Chinese language data"
Assert-File (Join-Path $PackagedResources "data\ocr\ocr-config.json") "Packaged shared OCR config"
Assert-Dir (Join-Path $PackagedResources "data") "Packaged data directory"
Assert-NoForbiddenPackageFiles $OutDir
Assert-CleanPackageForRelease $OutDir
Assert-NoPackagedUserState (Join-Path $PackagedResources "data")
Ok "No user sessions, usage records, logs, locks, or local project state in package data"

$HardcodedFound = $false
foreach ($scan in @(
  (Join-Path $PackagedResources "runtime\openclaw\openclaw.cmd"),
  $ActivateBat,
  (Join-Path $PackagedHermesTool "Scripts\activate.ps1"),
  $PyVenvCfg,
  (Join-Path $PackagedResources "data\claude-panel\project-folders.json"),
  (Join-Path $PackagedResources "data\claude-panel\projects.json")
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
