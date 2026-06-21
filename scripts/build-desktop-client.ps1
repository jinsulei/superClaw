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

function Get-ConfiguredYyapiBaseUrl {
  foreach ($name in @("YYAPI_BASE_URL", "OPENAI_BASE_URL")) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ($value -and $value.Trim()) {
      return $value.Trim().TrimEnd("/")
    }
  }
  return ""
}

function Read-EnvFileValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path -PathType Leaf)) {
    return ""
  }
  $prefix = "$Name="
  foreach ($line in (Get-Content -Path $Path -ErrorAction SilentlyContinue)) {
    if ($line -and $line.StartsWith($prefix)) {
      return $line.Substring($prefix.Length).Trim().Trim('"').Trim("'")
    }
  }
  return ""
}

function Set-EnvTextValue([string]$Text, [string]$Name, [string]$Value) {
  $pattern = "^\s*" + [regex]::Escape($Name) + "\s*="
  $lines = @()
  $seen = $false
  foreach ($line in ($Text -split "\r?\n")) {
    if ($line -match $pattern) {
      if (-not $seen) {
        $lines += "$Name=$Value"
        $seen = $true
      }
      continue
    }
    if ($line -ne "") {
      $lines += $line
    }
  }
  if (-not $seen) {
    $lines += "$Name=$Value"
  }
  return (($lines -join "`n").TrimEnd() + "`n")
}

function Get-HermesEnvPath {
  if ($script:ResourcesDir) {
    return Join-Path $script:ResourcesDir "data\hermes\.env"
  }
  return ""
}

function Get-PackagedHermesEnvPath {
  if ($script:OutDir) {
    return Join-Path $script:OutDir "resources\data\hermes\.env"
  }
  return ""
}

function Is-UsableSecret([string]$Value) {
  return $Value -and $Value.Trim() -and $Value -notmatch '\$\{' -and $Value -ne "superclaw-login-required"
}

function Is-MiniMaxBaseUrl([string]$Value) {
  return $Value -and ($Value -match 'minimax|minimaxi')
}

function Get-ConfiguredMiniMaxApiKey {
  if ($script:ConfiguredMiniMaxApiKey -and (Is-UsableSecret $script:ConfiguredMiniMaxApiKey)) {
    return $script:ConfiguredMiniMaxApiKey
  }

  foreach ($name in @("MINIMAX_API_KEY", "MINIMAX_CN_API_KEY")) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if (Is-UsableSecret $value) {
      return $value.Trim()
    }
  }

  foreach ($envPath in @((Get-HermesEnvPath), (Get-PackagedHermesEnvPath))) {
    foreach ($name in @("MINIMAX_API_KEY", "MINIMAX_CN_API_KEY")) {
      $value = Read-EnvFileValue $envPath $name
      if (Is-UsableSecret $value) {
        return $value.Trim()
      }
    }

    $openAiBase = Read-EnvFileValue $envPath "OPENAI_BASE_URL"
    $openAiKey = Read-EnvFileValue $envPath "OPENAI_API_KEY"
    if ((Is-MiniMaxBaseUrl $openAiBase) -and (Is-UsableSecret $openAiKey)) {
      return $openAiKey.Trim()
    }
  }
  return ""
}

function Get-ConfiguredMiniMaxBaseUrl {
  if ($script:ConfiguredMiniMaxBaseUrl -and $script:ConfiguredMiniMaxBaseUrl.Trim()) {
    return $script:ConfiguredMiniMaxBaseUrl.Trim().TrimEnd("/")
  }

  foreach ($name in @("MINIMAX_BASE_URL", "MINIMAX_CN_BASE_URL")) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ($value -and $value.Trim()) {
      return $value.Trim().TrimEnd("/")
    }
  }

  foreach ($envPath in @((Get-HermesEnvPath), (Get-PackagedHermesEnvPath))) {
    foreach ($name in @("MINIMAX_BASE_URL", "MINIMAX_CN_BASE_URL")) {
      $value = Read-EnvFileValue $envPath $name
      if ($value -and $value.Trim()) {
        return $value.Trim().TrimEnd("/")
      }
    }

    $openAiBase = Read-EnvFileValue $envPath "OPENAI_BASE_URL"
    if (Is-MiniMaxBaseUrl $openAiBase) {
      return $openAiBase.Trim().TrimEnd("/")
    }
  }
  return "https://api.minimaxi.com/v1"
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
      $clean = $clean -replace '(?im)^(\s*export\s+(OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|CUSTOM_API_KEY|YYAPI_KEY))=.*$', '$1  # set your own key'
      $clean = $clean -replace '(?im)^(\s*(OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|CUSTOM_API_KEY|YYAPI_KEY)\s*=\s*).+$', '$1YOUR_API_KEY'

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

function Ensure-PackagedPythonRuntime([string]$PackagedResources) {
  $PythonRoot = Join-Path $PackagedResources "uv-python"
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
  New-Item -ItemType Directory -Path (Join-Path $OpenClawDataDir "agents\main\agent") -Force | Out-Null
  $RuntimeSkills = Join-Path $ResourcesDir "runtime\openclaw\skills"
  $PortableSkills = Join-Path $OpenClawDataDir "skills"
  if (Test-Path $RuntimeSkills -PathType Container) {
    Copy-Directory $RuntimeSkills $PortableSkills
  }

  $yyapiBaseUrl = Get-ConfiguredYyapiBaseUrl
  $providers = [ordered]@{}
  $defaultModelRef = ""
  $fallbackModelRefs = @()
  $defaultModels = [ordered]@{}

  # MiniMax provider (API key from environment variable, base URL from env or default)
  $minimaxApiKey = if ($SanitizedTestMode) { "" } else { Get-ConfiguredMiniMaxApiKey }
  $minimaxBaseUrl = Get-ConfiguredMiniMaxBaseUrl
  if ($minimaxApiKey -and $minimaxApiKey -notmatch '\$\{') {
    $providers.minimax = [ordered]@{
      baseUrl = $minimaxBaseUrl
      apiKey = $minimaxApiKey
      api = "openai-completions"
      models = @(
        [ordered]@{
          id = "MiniMax-M2.7"
          name = "MiniMax M2.7"
          api = "openai-completions"
          reasoning = $false
          input = @("text")
          contextWindow = 128000
          maxTokens = 4096
        },
        [ordered]@{
          id = "MiniMax-M2.5"
          name = "MiniMax M2.5"
          api = "openai-completions"
          reasoning = $false
          input = @("text")
          contextWindow = 128000
          maxTokens = 4096
        }
      )
    }
    $defaultModelRef = "minimax/MiniMax-M2.7"
    $fallbackModelRefs = @("minimax/MiniMax-M2.5")
    $defaultModels[$defaultModelRef] = [ordered]@{}
    $defaultModels["minimax/MiniMax-M2.5"] = [ordered]@{}
  }

  # yyapi后端地址保留用于接口调用，但不作为AI模型供应商
  # 模型供应商仅使用MiniMax

  $config = [ordered]@{
    '$schema' = "https://openclaw.ai/schema/config.json"
    meta = [ordered]@{
      lastTouchedVersion = "YY1.0.1"
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
          fallbacks = @($fallbackModelRefs)
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
          fallbacks = @($fallbackModelRefs)
        }
        models = $defaultModels
        skillsLimits = [ordered]@{ maxSkillsPromptChars = 12000 }
        tools = [ordered]@{
          profile = "minimal"
          alsoAllow = @("browser", "desktop_control", "skill_manager", "exec")
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
  Write-Utf8NoBom (Join-Path $OpenClawDataDir "agents\main\agent\models.json") (([ordered]@{ providers = $providers }) | ConvertTo-Json -Depth 20)
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

function Write-PortableClaudeRelayConfig([string]$ClaudePanelDataDir, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $ClaudePanelDataDir -Force | Out-Null
  if ($SanitizedTestMode) {
    return
  }

  $minimaxApiKey = Get-ConfiguredMiniMaxApiKey
  if (-not (Is-UsableSecret $minimaxApiKey)) {
    Warn "MiniMax API key was not found; Claude Code relay-config.json will not be bundled"
    return
  }

  $minimaxBaseUrl = Get-ConfiguredMiniMaxBaseUrl
  $config = [ordered]@{
    enabled = $true
    interfaceType = "relay"
    name = "MiniMax"
    provider = "openai-compatible"
    baseUrl = $minimaxBaseUrl
    model = "MiniMax-M2.7"
    branchModels = @("MiniMax-M2.7", "MiniMax-M2.5")
    apiKey = $minimaxApiKey
    managedBy = "superclaw-minimax"
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-Utf8NoBom (Join-Path $ClaudePanelDataDir "relay-config.json") ($config | ConvertTo-Json -Depth 10)
}

function Repair-HermesConfig([string]$HermesDataDir, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $HermesDataDir -Force | Out-Null
  $configPath = Join-Path $HermesDataDir "config.yaml"
  $envPath = Join-Path $HermesDataDir ".env"
  $minimaxApiKey = Get-ConfiguredMiniMaxApiKey
  $minimaxBaseUrl = Get-ConfiguredMiniMaxBaseUrl
  $defaultModel = if ($minimaxApiKey) { "MiniMax-M2.7" } else { "superclaw-login-required" }
  $openAiApiKey = if ($minimaxApiKey) { $minimaxApiKey } else { "superclaw-login-required" }
  if ($SanitizedTestMode) {
    $minimaxApiKey = ""
    $defaultModel = "superclaw-login-required"
    $openAiApiKey = "superclaw-login-required"
  }
  # 使用MiniMax作为默认模型供应商，不再使用yyapi
  $baseUrlYamlLine = if ($minimaxApiKey) { "  base_url: $minimaxBaseUrl`n" } else { "" }
  $baseUrlEnvLine = if ($minimaxApiKey) { "OPENAI_BASE_URL=$minimaxBaseUrl`n" } else { "" }
  $envApiKeyLine = if ($minimaxApiKey) { "MINIMAX_API_KEY=$minimaxApiKey`n" } else { "" }
  $envBaseUrlLine = if ($minimaxApiKey) { "MINIMAX_BASE_URL=$minimaxBaseUrl`n" } else { "" }

  if ($SanitizedTestMode) {
    Set-Content -Path $configPath -Encoding UTF8 -Value @"
# Hermes Agent configuration (sanitized SuperClaw test package)
# No real API key is bundled. Login/model sync must provide usable credentials.
model:
  default: $defaultModel
  provider: openai-api
  api_mode: chat_completions
${baseUrlYamlLine}platform_toolsets:
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
OPENAI_API_KEY=$openAiApiKey
${baseUrlEnvLine}GATEWAY_ALLOW_ALL_USERS=true
API_SERVER_KEY=clawpanel-local
"@
    return
  }

  if (-not (Test-Path $configPath)) {
    Set-Content -Path $configPath -Encoding UTF8 -Value @"
# Hermes Agent configuration (managed by SuperClaw)
model:
  default: $defaultModel
  provider: openai-api
${baseUrlYamlLine}platform_toolsets:
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
    if ($text -match '(?m)^model:\s*$' -and $text -notmatch '(?m)^\s+default:\s*\S+') {
      $text = $text -replace '(?m)^(model:\s*\r?\n)', "`$1  default: $defaultModel`n"
    }
    if ($text -match '(?m)^\s+default:\s*\S+') {
      $text = $text -replace '(?m)^(\s+default:\s*).+$', "`${1}$defaultModel"
    }
    if ($text -match '(?m)^\s+provider:\s*\S+') {
      $text = $text -replace '(?m)^(\s+provider:\s*).+$', '${1}openai-api'
    } else {
      $text = $text -replace '(?m)^(\s+default:.*\r?\n)', "`$1  provider: openai-api`n"
    }
    if ($minimaxApiKey) {
      if ($text -match '(?m)^\s+base_url:\s*\S+') {
        $text = $text -replace '(?m)^(\s+base_url:\s*).+$', "`${1}$minimaxBaseUrl"
      } else {
        $text = $text -replace '(?m)^(\s+provider:.*\r?\n)', "`$1  base_url: $minimaxBaseUrl`n"
      }
    } else {
      $text = $text -replace '(?m)^(\s+provider:\s*)(custom|openai)\s*$', '${1}openai-api'
    }
    Set-Content -Path $configPath -Encoding UTF8 -Value $text
  }

  $envText = if (Test-Path $envPath) { Get-Content -Raw -Path $envPath } else { "" }
  $envText = Set-EnvTextValue $envText "OPENAI_API_KEY" $openAiApiKey
  if ($minimaxApiKey) {
    $envText = Set-EnvTextValue $envText "OPENAI_BASE_URL" $minimaxBaseUrl
    $envText = Set-EnvTextValue $envText "MINIMAX_API_KEY" $minimaxApiKey
    $envText = Set-EnvTextValue $envText "MINIMAX_BASE_URL" $minimaxBaseUrl
  }
  $envText = Set-EnvTextValue $envText "GATEWAY_ALLOW_ALL_USERS" "true"
  $envText = Set-EnvTextValue $envText "API_SERVER_KEY" "clawpanel-local"
  Set-Content -Path $envPath -Encoding UTF8 -Value $envText
}

function Prepare-PortableDataState([string]$DataRoot, [bool]$SanitizedTestMode = $false) {
  New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null

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
  foreach ($name in @("relay-config.json", "sessions", "logs", "tmp", "cache", "project-folders.json", "projects.json", "recent-projects.json", "conversations.json")) {
    Remove-IfExists (Join-Path $ClaudePanelData $name)
  }

  $ClaudeCodeHome = Join-Path $DataRoot "claude-code\home"
  foreach ($name in @(".claude.json", ".claude\projects", "Documents\OpenClawProjects")) {
    Remove-IfExists (Join-Path $ClaudeCodeHome $name)
  }

  $ClaudeConfig = Join-Path $DataRoot "claude-code\home\claude-config"
  foreach ($name in @("backups", "plans", "projects", "sessions")) {
    Remove-IfExists (Join-Path $ClaudeConfig $name)
  }

  Write-PortableOpenClawConfig $DotOpenClaw $SanitizedTestMode
  Write-PortablePanelConfig $DotOpenClaw $SanitizedTestMode
  Write-PortableClaudeRelayConfig $ClaudePanelData $SanitizedTestMode
  Repair-HermesConfig $HermesData $SanitizedTestMode
}

function Clear-PackagedRuntimeArtifacts([string]$DataRoot) {
  if (-not (Test-Path $DataRoot -PathType Container)) {
    return
  }

  foreach ($pattern in @("*.log", "*.pid", "*.lock")) {
    Get-ChildItem -Path $DataRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }

  foreach ($rel in @(
    "hermes\logs",
    ".openclaw\logs",
    "clawpanel\logs",
    "claude-panel\logs"
  )) {
    Remove-IfExists (Join-Path $DataRoot $rel)
  }
}

function Clear-PackagedMachineSpecificPaths([string]$PackagedResources) {
  $HermesTool = Join-Path $PackagedResources "uv-tools\hermes-agent"
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

  foreach ($root in @(
    (Join-Path $PackagedResources "uv-tools\hermes-agent"),
    (Join-Path $PackagedResources "uv-python")
  )) {
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
$script:ConfiguredMiniMaxApiKey = ""
$script:ConfiguredMiniMaxBaseUrl = ""
$script:ConfiguredMiniMaxApiKey = Get-ConfiguredMiniMaxApiKey
$script:ConfiguredMiniMaxBaseUrl = Get-ConfiguredMiniMaxBaseUrl

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
Sync-SuperClawOpenClawPlugins
Assert-Dir (Join-Path $ResourcesDir "runtime\claude-code") "Claude Code runtime"
Assert-File (Join-Path $ResourcesDir "runtime\claude-code\bin\claude.exe") "Claude Code CLI"
Assert-Dir (Join-Path $ResourcesDir "runtime\claude-panel") "Claude UI panel runtime"
Assert-File (Join-Path $ResourcesDir "runtime\claude-panel\server.js") "Claude UI panel server"
Assert-Dir (Join-Path $ResourcesDir "runtime\ocr") "Shared OCR runtime"
Assert-File (Join-Path $ResourcesDir "runtime\ocr\ocr-runner.cjs") "Shared OCR runner"
Assert-File (Join-Path $ResourcesDir "runtime\ocr\tessdata\eng.traineddata.gz") "OCR English language data"
Assert-File (Join-Path $ResourcesDir "runtime\ocr\tessdata\chi_sim.traineddata.gz") "OCR Chinese language data"
Assert-File (Join-Path $ResourcesDir "data\ocr\ocr-config.json") "Shared OCR config"
Assert-Dir (Join-Path $ResourcesDir "data") "Portable data"

$TauriConf = Join-Path $TauriDir "tauri.conf.json"
$TauriConfText = Get-Content -Raw -Path $TauriConf
foreach ($glob in @(
  "resources/runtime/openclaw/**/*",
  "resources/runtime/claude-code/**/*",
  "resources/runtime/claude-panel/**/*",
  "resources/runtime/ocr/**/*",
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
    "SuperClaw sanitized test package",
    "",
    "1. Local activation and access password are skipped. Double-click superclaw.exe to open the control panel.",
    "2. No YYAPI base URL, real API key, or local customer session is bundled.",
    "3. OpenClaw and Hermes keep login-required placeholders only. Configure a user model before chat testing.",
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
  $PythonExeForVenv = Find-PackagedPythonExe (Join-Path $PackagedResources "uv-python")
  if ($PythonExeForVenv) {
    $PythonHomeForVenv = Split-Path -Parent $PythonExeForVenv
    $PythonHomeLeaf = Split-Path -Leaf $PythonHomeForVenv
    $PortableHome = "..\..\..\uv-python\$PythonHomeLeaf"
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
Ok "Removed logs, locks, and pid files created during package verification"

Step "Verifying package"
Assert-File $ExeDest "Packaged superclaw.exe"
Assert-File (Join-Path $PackagedResources "runtime\openclaw\openclaw.cmd") "Packaged OpenClaw launcher"
Assert-File (Join-Path $PackagedResources "runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions\skill-manager\openclaw.plugin.json") "Packaged OpenClaw skill-manager plugin"
Assert-File (Join-Path $PackagedResources "runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions\desktop-control\openclaw.plugin.json") "Packaged OpenClaw desktop-control plugin"
Assert-File (Join-Path $PackagedResources "runtime\openclaw\bin\desktop-control-agent.exe") "Packaged OpenClaw desktop-control sidecar"
Assert-File (Join-Path $PackagedResources "data\.openclaw\openclaw.json") "Packaged OpenClaw config"
Assert-File (Join-Path $PackagedResources "runtime\claude-code\bin\claude.exe") "Packaged Claude Code CLI"
Assert-File (Join-Path $PackagedResources "runtime\claude-panel\server.js") "Packaged Claude UI panel"
Assert-File (Join-Path $PackagedResources "runtime\ocr\ocr-runner.cjs") "Packaged shared OCR runner"
Assert-File (Join-Path $PackagedResources "runtime\ocr\tessdata\eng.traineddata.gz") "Packaged OCR English language data"
Assert-File (Join-Path $PackagedResources "runtime\ocr\tessdata\chi_sim.traineddata.gz") "Packaged OCR Chinese language data"
Assert-File (Join-Path $PackagedResources "data\ocr\ocr-config.json") "Packaged shared OCR config"
Assert-Dir (Join-Path $PackagedResources "data") "Packaged data directory"

$HardcodedFound = $false
foreach ($scan in @(
  (Join-Path $PackagedResources "runtime\openclaw\openclaw.cmd"),
  $ActivateBat,
  (Join-Path $PackagedResources "uv-tools\hermes-agent\Scripts\activate.ps1"),
  (Join-Path $PackagedResources "uv-tools\hermes-agent\pyvenv.cfg"),
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
