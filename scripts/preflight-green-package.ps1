param(
  [string]$ExpectedBranch = "test-minimax-only-no-user-from-green"
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "========== $Title ==========" -ForegroundColor Cyan
}

function Add-Issue {
  param(
    [System.Collections.Generic.List[object]]$List,
    [string]$Severity,
    [string]$Path,
    [int]$Line,
    [string]$Message,
    [string]$Text = ""
  )

  $List.Add([pscustomobject]@{
    severity = $Severity
    path = $Path
    line = $Line
    message = $Message
    text = $Text
  }) | Out-Null
}

function Get-NormalizedPath([string]$Path) {
  return $Path.Replace("\", "/")
}

function Test-AllowedPlaceholder([string]$Value) {
  $clean = ($Value -replace '^["'']|["'']$', '').Trim()
  if (-not $clean) { return $true }
  if ($clean -in @("YOUR_API_KEY", "<YOUR_API_KEY>", "REPLACE_ME")) { return $true }
  if ($clean -match '^\$\{[A-Z0-9_]+\}$') { return $true }
  if ($clean -match '^%[A-Z0-9_]+%$') { return $true }
  return $false
}

function Get-FreeSubstDrive {
  foreach ($letter in @("R", "S", "T", "U", "V", "W", "X", "Y", "Z")) {
    $drive = "${letter}:"
    $substUsed = (& subst 2>$null | Select-String -Pattern "^$([regex]::Escape($drive))\\")
    if (-not $substUsed -and -not (Test-Path -LiteralPath "$drive\")) {
      return $drive
    }
  }
  throw "No free subst drive is available for long-path runtime verification."
}

function Invoke-RuntimeVerify {
  param(
    [string]$ProjectRoot,
    [string]$ManifestPath
  )

  $drive = Get-FreeSubstDrive
  $mapped = $false
  try {
    & subst $drive $ProjectRoot | Out-Null
    $mapped = $true
    $scriptPath = "$drive\scripts\verify-green-runtime.ps1"
    powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -ProjectRoot "$drive\" -OutputManifest $ManifestPath -IncludeOptional -RequireComplete
    if ($LASTEXITCODE -ne 0) {
      throw "verify-green-runtime.ps1 failed with exit code $LASTEXITCODE"
    }
  } finally {
    if ($mapped) {
      & subst $drive /D | Out-Null
    }
  }
}

function Test-WorkspaceStatus {
  param([string]$ProjectRoot)

  $allowedDirty = @(
    "scripts/build-desktop-client.ps1",
    "scripts/build-green-package.ps1",
    "scripts/dev-api.js",
    "scripts/preflight-green-package.ps1",
    "scripts/register-openclaw-tools.ps1",
    "scripts/regression-usb-exe.ps1",
    "scripts/verify-green-runtime.ps1",
    "src-tauri/src/commands/claude_code.rs",
    "src-tauri/src/commands/config.rs",
    "src-tauri/src/commands/hermes.rs",
    "src-tauri/src/commands/mod.rs",
    "src-tauri/src/lib.rs",
    "src/components/sidebar.js",
    "src/engines/hermes/index.js",
    "src/engines/hermes/pages/dashboard.js",
    "src/engines/hermes/pages/setup.js",
    "src/engines/openclaw/index.js",
    "src/lib/engine-manager.js",
    "src/lib/license-binding.js",
    "src/lib/minimax-test-config.js",
    "src/lib/payment-api.js",
    "src/lib/test-build-mode.js",
    "src/lib/user-api.js",
    "src/lib/yyapi-config.js",
    "src/locales/index.js",
    "src/locales/modules/models.js",
    "src/locales/modules/profile.js",
    "src/main.js",
    "src/pages/activate.js",
    "src/pages/channels.js",
    "src/pages/chat.js",
    "src/pages/claim.js",
    "src/pages/login.js",
    "src/pages/models.js",
    "src/pages/payment.js",
    "src/pages/profile.js",
    "src/pages/register.js",
    "src/router.js"
  )

  $unexpected = @()
  $statusLines = git status --porcelain=v1 -uall
  foreach ($line in $statusLines) {
    if ($line.Length -lt 4) { continue }
    $code = $line.Substring(0, 2).Trim()
    $path = Get-NormalizedPath ($line.Substring(3).Trim('"'))
    if ($allowedDirty -notcontains $path) {
      $unexpected += $line
      continue
    }
    if ($code -notin @("M", "A", "D", "??")) {
      $unexpected += $line
    }
  }

  if ($unexpected.Count -gt 0) {
    $unexpected | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Workspace has unexpected changes."
  }

  if ($statusLines) {
    Write-Host "Workspace has allowed preflight edits only:" -ForegroundColor Yellow
    $statusLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  } else {
    Write-Host "Workspace is clean."
  }
}

function Test-Port1420 {
  $existing = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
  if (-not $existing) {
    Write-Host "Port 1420 is free."
    return
  }

  foreach ($ownerPid in ($existing | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
    Write-Host "PID: $ownerPid" -ForegroundColor Red
    if ($proc) {
      Write-Host "ProcessName: $($proc.Name)" -ForegroundColor Red
      Write-Host "CommandLine: $($proc.CommandLine)" -ForegroundColor Red
    }
  }
  throw "Port 1420 is occupied. Green package tests must use strictPort 1420 and must not reuse an existing service."
}

function Test-BuildScriptLogic {
  $path = "scripts/build-green-package.ps1"
  $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $legacyYyapiIpPattern = ("124\.222\." + "21\.44")
  $required = @(
    "strictPort",
    "port 1420",
    "fail if port occupied",
    "no reuse existing service",
    "FailIfPortOccupied",
    "runtime/hermes-agent",
    "runtime/hermes",
    "hermes.exe",
    "hermes-agent.exe"
  )

  foreach ($term in $required) {
    if ($text -notmatch [regex]::Escape($term)) {
      throw "$path is missing required green preflight logic term: $term"
    }
  }

  if ($text -match "Reusing existing panel service") {
    throw "$path still contains panel service reuse logic."
  }

  if ($text -match $legacyYyapiIpPattern) {
    throw "$path still contains legacy yyapi IP."
  }

  Write-Host "build-green-package.ps1 strictPort/fail-if-occupied logic is present."
}

function Test-MiniMaxOnlyTestBuildLogic {
  $buildPath = "scripts/build-green-package.ps1"
  $modePath = "src/lib/test-build-mode.js"
  $buildText = Get-Content -LiteralPath $buildPath -Raw -Encoding UTF8
  $modeText = Get-Content -LiteralPath $modePath -Raw -Encoding UTF8
  $viteMinimaxApiKeyPattern = ("VITE_MINIMAX_" + "API_KEY")
  $requiredBuildTerms = @(
    "VITE_SUPERCLAW_TEST_BUILD",
    "VITE_SUPERCLAW_FORCE_PROVIDER",
    "VITE_SUPERCLAW_MINIMAX_BASE_URL",
    "VITE_SUPERCLAW_MINIMAX_MODEL",
    "https://api.minimaxi.com/v1",
    "MiniMax-M3"
  )
  foreach ($term in $requiredBuildTerms) {
    if ($buildText -notmatch [regex]::Escape($term)) {
      throw "$buildPath is missing MiniMax-only test build term: $term"
    }
  }
  $requiredModeTerms = @(
    "isTestBuildMode",
    "getForcedProvider",
    "isMiniMaxOnlyMode",
    "getMiniMaxDefaultConfig"
  )
  foreach ($term in $requiredModeTerms) {
    if ($modeText -notmatch [regex]::Escape($term)) {
      throw "$modePath is missing test build helper: $term"
    }
  }
  if ($buildText -match [regex]::Escape($viteMinimaxApiKeyPattern) -or $modeText -match [regex]::Escape($viteMinimaxApiKeyPattern)) {
    throw "MiniMax-only test mode must not use $viteMinimaxApiKeyPattern."
  }
  foreach ($forbidden in @("VITE_SUPERCLAW_SKIP_AUTH", "VITE_SUPERCLAW_SKIP_ACTIVATION", "VITE_SUPERCLAW_DISABLE_YYAPI", "isAuthBypassEnabled", "isActivationBypassEnabled", "isYyapiDisabled", "getTestUser")) {
    if (($buildText + "`n" + $modeText) -match [regex]::Escape($forbidden)) {
      throw "Test build must not retain legacy auth/activation/YYAPI bypass term: $forbidden"
    }
  }
  Write-Host "No user-system test mode: PASS" -ForegroundColor Green
  Write-Host "MiniMax only mode: PASS" -ForegroundColor Green
  Write-Host "Legacy provider bypass flags removed: PASS" -ForegroundColor Green
}

function Test-MiniMaxCNGatewayDefaults {
  $cnBaseUrl = "https://api.minimaxi.com/v1"
  $devApiText = Get-Content -LiteralPath "scripts/dev-api.js" -Raw -Encoding UTF8
  $greenText = Get-Content -LiteralPath "scripts/build-green-package.ps1" -Raw -Encoding UTF8
  $desktopText = Get-Content -LiteralPath "scripts/build-desktop-client.ps1" -Raw -Encoding UTF8

  foreach ($entry in @(
    @{ path = "scripts/build-green-package.ps1"; text = $greenText },
    @{ path = "scripts/build-desktop-client.ps1"; text = $desktopText },
    @{ path = "scripts/dev-api.js"; text = $devApiText }
  )) {
    if ($entry.text -notmatch [regex]::Escape($cnBaseUrl)) {
      throw "$($entry.path) is missing MiniMax CN default: $cnBaseUrl"
    }
  }

  if ($devApiText -notmatch "HERMES_BUNDLED_RUNTIME_MISSING" -or $devApiText -notmatch "hermesBundledExecutable") {
    throw "scripts/dev-api.js must require bundled Hermes runtime."
  }
  if ($devApiText -match "Programs', 'Python', py, 'Scripts', 'hermes.exe" -or $devApiText -match "findCommandPath\('hermes'\)") {
    throw "scripts/dev-api.js still contains global Hermes fallback."
  }
  if ($devApiText -notmatch "/api/status") {
    throw "scripts/dev-api.js must probe Claude Panel through /api/status."
  }

  $openclawPath = "src-tauri/resources/data/.openclaw/openclaw.json"
  $openclawAgentPath = "src-tauri/resources/data/.openclaw/agents/main/agent/models.json"
  $hermesConfigPath = "src-tauri/resources/data/hermes/config.yaml"
  $hermesEnvPath = "src-tauri/resources/data/hermes/.env"
  $relayPath = "src-tauri/resources/data/claude-panel/relay-config.json"

  foreach ($path in @($openclawPath, $openclawAgentPath, $hermesConfigPath, $relayPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Missing MiniMax local config for preflight: $path"
    }
  }
  if (Test-Path -LiteralPath $hermesEnvPath -PathType Leaf) {
    throw "Hermes .env must not be required or packaged in sanitized test builds: $hermesEnvPath"
  }

  $openclaw = Get-Content -LiteralPath $openclawPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $agentModels = Get-Content -LiteralPath $openclawAgentPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $relay = Get-Content -LiteralPath $relayPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $hermesConfig = Get-Content -LiteralPath $hermesConfigPath -Raw -Encoding UTF8

  if ($openclaw.models.providers.minimax.baseUrl -ne $cnBaseUrl) {
    throw "OpenClaw minimax baseUrl must be $cnBaseUrl"
  }
  if ($agentModels.providers.minimax.baseUrl -ne $cnBaseUrl) {
    throw "OpenClaw agent minimax baseUrl must be $cnBaseUrl"
  }
  if ($hermesConfig -notmatch "provider:\s*minimax" -or $hermesConfig -notmatch "base_url:\s*$([regex]::Escape($cnBaseUrl))" -or $hermesConfig -notmatch "default:\s*MiniMax-M3") {
    throw "Hermes config.yaml must use minimax MiniMax-M3 on $cnBaseUrl"
  }
  if ($relay.baseUrl -ne $cnBaseUrl -or $relay.model -ne "MiniMax-M3") {
    throw "Claude Panel relay must use MiniMax-M3 on $cnBaseUrl"
  }
  if ($relay.interfaceType -and $relay.interfaceType -ne "relay") {
    throw "Claude Panel must remain in OPENAI_RELAY mode."
  }

  Write-Host "MiniMax CN test default: PASS" -ForegroundColor Green
  Write-Host "OpenClaw MiniMax CN config: PASS" -ForegroundColor Green
  Write-Host "Hermes MiniMax CN config: PASS" -ForegroundColor Green
  Write-Host "Hermes .env omitted from sanitized package: PASS" -ForegroundColor Green
  Write-Host "Claude Panel MiniMax CN config: PASS" -ForegroundColor Green
  Write-Host "Hermes bundled runtime only: PASS" -ForegroundColor Green
  Write-Host "Claude Panel status route: PASS" -ForegroundColor Green
}

function Test-EcommerceAssistantBuildFlag {
  $buildPath = "scripts/build-green-package.ps1"
  $chatPath = "src/engines/hermes/pages/chat.js"
  $packagePath = "package.json"
  $buildText = Get-Content -LiteralPath $buildPath -Raw -Encoding UTF8
  $chatText = Get-Content -LiteralPath $chatPath -Raw -Encoding UTF8
  $package = Get-Content -LiteralPath $packagePath -Raw -Encoding UTF8 | ConvertFrom-Json

  $requiredSetPattern = 'SetEnvironmentVariable\("VITE_ENABLE_ECOMMERCE_ASSISTANT",\s*"true",\s*"Process"\)'
  if ($buildText -notmatch $requiredSetPattern) {
    throw "$buildPath must set VITE_ENABLE_ECOMMERCE_ASSISTANT to string true in TestBuild/SanitizedTest mode."
  }
  if ($buildText -match 'SetEnvironmentVariable\("VITE_ENABLE_ECOMMERCE_ASSISTANT",\s*"1"') {
    throw "$buildPath must not set VITE_ENABLE_ECOMMERCE_ASSISTANT to 1; feature flags require true."
  }

  foreach ($stage in @("stage1", "stage2", "stage3", "stage4", "stage56")) {
    $dir = "src/shared/ecommerce-$stage"
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
      throw "Missing ecommerce stage directory: $dir"
    }
    $smoke = "scripts/smoke-ecommerce-$stage.mjs"
    if (-not (Test-Path -LiteralPath $smoke -PathType Leaf)) {
      throw "Missing ecommerce smoke script: $smoke"
    }
    $scriptName = "smoke:ecommerce-$stage"
    $expected = "node $smoke"
    if ($package.scripts.$scriptName -ne $expected) {
      throw "$packagePath script $scriptName must be: $expected"
    }
  }

  if ($chatText -notmatch "maybeRunEcommerceStage") {
    throw "$chatPath is missing maybeRunEcommerceStage."
  }

  Write-Host "Ecommerce assistant build flag: PASS" -ForegroundColor Green
  Write-Host "Ecommerce stage smoke wiring: PASS" -ForegroundColor Green
}

function Assert-Leaf {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label missing: $Path"
  }
}

function Test-OpenClawDesktopControlRegistration {
  $scriptPath = "scripts/register-openclaw-tools.ps1"
  $buildPath = "scripts/build-green-package.ps1"
  $devApiPath = "scripts/dev-api.js"
  Assert-Leaf $scriptPath "OpenClaw tool registration script"

  $runtime = "src-tauri/resources/runtime/openclaw"
  $sourceRoot = Join-Path $runtime "dist/extensions"
  $registeredRoot = Join-Path $runtime "node_modules/@qingchencloud/openclaw-zh/dist/extensions"
  foreach ($pluginId in @("desktop-control", "skill-manager")) {
    $sourceManifest = Join-Path $sourceRoot "$pluginId/openclaw.plugin.json"
    $sourceEntry = Join-Path $sourceRoot "$pluginId/index.js"
    $registeredManifest = Join-Path $registeredRoot "$pluginId/openclaw.plugin.json"
    $registeredEntry = Join-Path $registeredRoot "$pluginId/index.js"
    Assert-Leaf $sourceManifest "OpenClaw plugin source manifest $pluginId"
    Assert-Leaf $sourceEntry "OpenClaw plugin source entry $pluginId"
    Assert-Leaf $registeredManifest "OpenClaw registered plugin manifest $pluginId"
    Assert-Leaf $registeredEntry "OpenClaw registered plugin entry $pluginId"

    $sourceJson = Get-Content -LiteralPath $sourceManifest -Raw -Encoding UTF8 | ConvertFrom-Json
    $registeredJson = Get-Content -LiteralPath $registeredManifest -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($sourceJson.id -ne $pluginId -or $registeredJson.id -ne $pluginId) {
      throw "OpenClaw plugin manifest id mismatch for $pluginId"
    }
    if ((Get-FileHash -LiteralPath $sourceManifest -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $registeredManifest -Algorithm SHA256).Hash) {
      throw "OpenClaw registered plugin manifest hash mismatch for $pluginId"
    }
    if ((Get-FileHash -LiteralPath $sourceEntry -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $registeredEntry -Algorithm SHA256).Hash) {
      throw "OpenClaw registered plugin entry hash mismatch for $pluginId"
    }
  }

  $sidecarSource = "src-tauri/resources/bin/desktop-control-agent.exe"
  $sidecarRegistered = Join-Path $runtime "bin/desktop-control-agent.exe"
  Assert-Leaf $sidecarSource "desktop-control sidecar source"
  Assert-Leaf $sidecarRegistered "desktop-control sidecar registered copy"
  if ((Get-FileHash -LiteralPath $sidecarSource -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $sidecarRegistered -Algorithm SHA256).Hash) {
    throw "desktop-control sidecar registered copy hash mismatch"
  }

  $openclawConfigPath = "src-tauri/resources/data/.openclaw/openclaw.json"
  Assert-Leaf $openclawConfigPath "OpenClaw local config"
  $openclawConfig = Get-Content -LiteralPath $openclawConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($pluginId in @("browser", "desktop-control", "skill-manager")) {
    $entry = $openclawConfig.plugins.entries.PSObject.Properties[$pluginId]
    if (-not $entry -or $entry.Value.enabled -ne $true) {
      throw "OpenClaw config plugin entry must be enabled: $pluginId"
    }
    if ($openclawConfig.plugins.allow -and @($openclawConfig.plugins.allow) -notcontains $pluginId) {
      throw "OpenClaw plugins.allow missing: $pluginId"
    }
  }

  $configText = Get-Content -LiteralPath $openclawConfigPath -Raw -Encoding UTF8
  if ($configText -match "C:\\tmp|C:/tmp|\\Desktop\\|/Desktop/|\\Downloads\\|/Downloads/|\\AppData\\|/AppData/|C:\\Users\\csys1\\Documents\\ecommerce-1\.0\.2-green-usb-from-1\.0\.1-4|C:\\Users\\csys1\\.openclaw") {
    throw "OpenClaw config contains stale/non-portable desktop-control path."
  }

  $buildText = Get-Content -LiteralPath $buildPath -Raw -Encoding UTF8
  $devApiText = Get-Content -LiteralPath $devApiPath -Raw -Encoding UTF8
  foreach ($term in @("register-openclaw-tools.ps1", "Registering OpenClaw portable tools", "registerOpenClawTools")) {
    if ($buildText -notmatch [regex]::Escape($term)) {
      throw "$buildPath is missing OpenClaw tool registration term: $term"
    }
  }
  foreach ($term in @(
    '"superclaw-portable-local"',
    'remote = [ordered]@{ token = "superclaw-portable-local" }',
    'allow = @("browser", "desktop-control", "skill-manager")',
    'alsoAllow = @("browser", "desktop_control", "skill_manager", "exec", "process")'
  )) {
    if ($buildText -notmatch [regex]::Escape($term)) {
      throw "$buildPath is missing portable OpenClaw gateway/plugin allow term: $term"
    }
  }
  if ($buildText -match "opencloud-portable-local") {
    throw "$buildPath still contains the old OpenClaw gateway token."
  }
  foreach ($term in @("ensurePortableOpenClawTools", "desktop-control-agent.exe", "@qingchencloud")) {
    if ($devApiText -notmatch [regex]::Escape($term)) {
      throw "$devApiPath is missing OpenClaw portable tool sync term: $term"
    }
  }

  Write-Host "OpenClaw desktop-control files: PASS" -ForegroundColor Green
  Write-Host "OpenClaw desktop-control registration: PASS" -ForegroundColor Green
  Write-Host "OpenClaw plugin paths portable: PASS" -ForegroundColor Green
  Write-Host "No stale desktop-control path: PASS" -ForegroundColor Green
}

function Test-MiniMaxApiKeyEntry {
  $configPath = "src/lib/minimax-test-config.js"
  $modelsPath = "src/pages/models.js"
  $devApiPath = "scripts/dev-api.js"
  $relayPath = "src-tauri/src/commands/claude_code.rs"
  $viteMinimaxApiKeyPattern = ("VITE_MINIMAX_" + "API_KEY")

  foreach ($path in @($configPath, $modelsPath, $devApiPath, $relayPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "MiniMax API key entry check missing file: $path"
    }
  }

  $configText = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
  $modelsText = Get-Content -LiteralPath $modelsPath -Raw -Encoding UTF8
  $devApiText = Get-Content -LiteralPath $devApiPath -Raw -Encoding UTF8
  $relayText = Get-Content -LiteralPath $relayPath -Raw -Encoding UTF8

  $requiredConfigTerms = @(
    "getMiniMaxTestDefaults",
    "normalizeMiniMaxTestConfig",
    "maskApiKey",
    "readMiniMaxTestConfig",
    "saveMiniMaxTestConfig",
    "applyMiniMaxTestConfig",
    "getMiniMaxConfigStatus",
    "https://api.minimax.io/v1",
    "https://api.minimaxi.com/v1",
    "MiniMax-M3"
  )
  foreach ($term in $requiredConfigTerms) {
    if ($configText -notmatch [regex]::Escape($term)) {
      throw "$configPath is missing MiniMax test config term: $term"
    }
  }

  $requiredModelTerms = @(
    "minimax-test-panel",
    "readMiniMaxTestConfig",
    "saveMiniMaxTestConfig",
    "isMiniMaxOnlyMode",
    "isTestBuildMode"
  )
  foreach ($term in $requiredModelTerms) {
    if ($modelsText -notmatch [regex]::Escape($term)) {
      throw "$modelsPath is missing MiniMax API key entry term: $term"
    }
  }

  $requiredSyncTerms = @(
    "read_minimax_test_config",
    "save_minimax_test_config",
    "configure_claude_code_relay",
    "resources",
    ".openclaw",
    "hermes",
    "relay-config.json"
  )
  foreach ($term in $requiredSyncTerms) {
    if (($devApiText + "`n" + $relayText) -notmatch [regex]::Escape($term)) {
      throw "Local config sync is missing term: $term"
    }
  }

  foreach ($source in @($configText, $modelsText, $devApiText, $relayText)) {
    if ($source -match [regex]::Escape($viteMinimaxApiKeyPattern)) {
      throw "MiniMax API key entry must not read or write $viteMinimaxApiKeyPattern."
    }
    if ($source -match "(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}") {
      throw "MiniMax API key entry source contains a real-looking sk- key."
    }
  }

  Write-Host "MiniMax API key entry: PASS" -ForegroundColor Green
  Write-Host "Local config sync: PASS" -ForegroundColor Green
  Write-Host "Secret source scan: PASS" -ForegroundColor Green
}

function Test-NoUserSystemRemoval {
  $removedFiles = @(
    "src/pages/login.js",
    "src/pages/register.js",
    "src/pages/activate.js",
    "src/pages/claim.js",
    "src/pages/profile.js",
    "src/lib/user-api.js",
    "src/lib/license-binding.js",
    "src/lib/yyapi-config.js"
  )

  foreach ($path in $removedFiles) {
    if (Test-Path -LiteralPath $path) {
      throw "Customer user-system file still exists: $path"
    }
  }

  $mainText = Get-Content -LiteralPath "src/main.js" -Raw -Encoding UTF8
  $sidebarText = Get-Content -LiteralPath "src/components/sidebar.js" -Raw -Encoding UTF8
  $paymentText = Get-Content -LiteralPath "src/pages/payment.js" -Raw -Encoding UTF8

  foreach ($term in @("pages/login.js", "pages/register.js", "pages/activate.js", "pages/claim.js", "pages/profile.js", "user-api.js", "license-binding.js", "yyapi-config.js")) {
    if (($mainText + "`n" + $sidebarText + "`n" + $paymentText) -match [regex]::Escape($term)) {
      throw "Customer user-system import/reference remains: $term"
    }
  }

  foreach ($route in @("'/login'", "'/register'", "'/activate'", "'/claim'", "'/profile'")) {
    if ($sidebarText -match [regex]::Escape($route)) {
      throw "Sidebar still exposes customer user route: $route"
    }
  }

  if ($paymentText -notmatch [regex]::Escape("../lib/payment-api.js")) {
    throw "Payment page must use payment-api.js instead of customer user API."
  }
  if (-not (Test-Path -LiteralPath "src/lib/payment-api.js" -PathType Leaf)) {
    throw "Payment API shim is missing."
  }

  Write-Host "Customer user pages removed: PASS" -ForegroundColor Green
  Write-Host "Customer user libraries removed: PASS" -ForegroundColor Green
  Write-Host "Payment decoupled from user system: PASS" -ForegroundColor Green
}

function Test-BackendLocalAuthIsolation {
  $devApiPath = "scripts/dev-api.js"
  $devApiText = Get-Content -LiteralPath $devApiPath -Raw -Encoding UTF8

  $requiredTerms = @(
    "SUPERCLAW_TEST_BUILD",
    "VITE_SUPERCLAW_TEST_BUILD",
    "SUPERCLAW_TEST_CONFIG_HOME",
    "SUPERCLAW_RESOURCES_DIR",
    "isServerTestBuild",
    "testConfigHomeDir",
    "isLoopbackRequest",
    "isLoopbackHostHeader",
    "isLoopbackSocketAddress",
    "req?.socket?.remoteAddress",
    "req?.socket?.localAddress",
    "req?.headers?.host",
    "return isLoopbackRequest(req)"
  )

  foreach ($term in $requiredTerms) {
    if ($devApiText -notmatch [regex]::Escape($term)) {
      throw "$devApiPath is missing backend local auth isolation term: $term"
    }
  }

  if ($devApiText -match "portableCfg && fs\.existsSync\(portableCfg\).*PANEL_CONFIG_PATH") {
    throw "$devApiPath can still fall back to global clawpanel.json when portable config is missing."
  }

  foreach ($forbidden in @("SUPERCLAW_SKIP_LOCAL_AUTH", "VITE_SUPERCLAW_SKIP_AUTH", "shouldBypassLocalAccessPassword", "Test local auth bypass")) {
    if ($devApiText -match [regex]::Escape($forbidden)) {
      throw "$devApiPath must not retain legacy auth bypass term: $forbidden"
    }
  }

  foreach ($line in ($devApiText -split "`r?`n")) {
    if ($line -match "(req\.url|req\.headers|query)" -and $line -match "(SKIP_LOCAL_AUTH|TEST_BUILD|bypass)") {
      throw "$devApiPath must not enable auth bypass from request query or headers."
    }
  }

  Write-Host "Backend local auth isolation: PASS" -ForegroundColor Green
  Write-Host "Worktree config isolation: PASS" -ForegroundColor Green
  Write-Host "Loopback-only local API access: PASS" -ForegroundColor Green
}

function Test-ExecutableRuntimeCopyLine {
  param([string]$LineText)

  $trimmed = $LineText.Trim()
  if (-not $trimmed -or $trimmed.StartsWith("#")) {
    return $false
  }

  $commandPattern = "(?i)^(?:&\s*)?(?:Copy-Item|Copy-Dir|robocopy|xcopy|Move-Item|Start-BitsTransfer|Invoke-WebRequest|curl|wget)\b|^cmd(?:\.exe)?\s*/c\s+(?:copy|xcopy|robocopy)\b|^powershell(?:\.exe)?\b.*\b(?:Copy-Item|Copy-Dir|robocopy|xcopy|Move-Item|Start-BitsTransfer|Invoke-WebRequest|curl|wget)\b"
  if ($trimmed -notmatch $commandPattern) {
    return $false
  }

  $localCachePattern = '(?i)(C:\\tmp|C:/tmp|\\Desktop\\|/Desktop/|\\Downloads\\|/Downloads/|\\AppData\\|/AppData/|\$env:(?:APPDATA|LOCALAPPDATA|USERPROFILE)|%(?:APPDATA|LOCALAPPDATA|USERPROFILE)%)'
  $runtimeContextPattern = "(?i)(runtime|openclaw|uv-tools|uv-python|hermes-agent|claude-panel|old package|old-package|package)"
  return ($trimmed -match $localCachePattern -and $trimmed -match $runtimeContextPattern)
}

function Test-SelfScannerRuleLine {
  param(
    [string]$Path,
    [string]$LineText
  )

  if ($Path -ne "scripts/preflight-green-package.ps1") {
    return $false
  }

  if (Test-ExecutableRuntimeCopyLine $LineText) {
    return $false
  }

  $trimmed = $LineText.Trim()
  if (-not $trimmed) {
    return $false
  }

  $scannerTermsPattern = "(?i)(Copy-Item|Copy-Dir|robocopy|xcopy|Move-Item|Start-BitsTransfer|Invoke-WebRequest|curl|wget|C:\\tmp|Desktop|Downloads|AppData|runtime|old package|old-package|package)"
  if ($trimmed -notmatch $scannerTermsPattern) {
    return $false
  }

  return (
    $trimmed.StartsWith("#") -or
    $trimmed -match '\$line\s+-match' -or
    $trimmed -match "Add-Issue|Write-Host|throw" -or
    $trimmed -match "^\s*\$[A-Za-z0-9_]+\s*=" -or
    $trimmed -match "^\s*(if|foreach|return)\b"
  )
}

function Test-TrackedSourceRisks {
  $issues = [System.Collections.Generic.List[object]]::new()
  $trackedFiles = git -c core.quotepath=false ls-files
  $viteMinimaxApiKeyPattern = ("VITE_MINIMAX_" + "API_KEY")
  $legacyYyapiIpPattern = ("124\.222\." + "21\.44")
  $allowedDesktopTerms = @("desktop_control", "desktop-control", "Desktop Control")
  $docWarningPrefixes = @("docs/", "AGENTS.md", "README.md", "CONTRIBUTING.md")
  $legacyIpFatalPaths = @(
    "src/",
    "src-tauri/src/",
    "scripts/build-green-package.ps1",
    "scripts/build-desktop-client.ps1",
    "scripts/dev-api.js"
  )

  foreach ($file in $trackedFiles) {
    $normalized = Get-NormalizedPath $file
    if (-not (Test-Path -LiteralPath $file -PathType Leaf -ErrorAction SilentlyContinue)) { continue }
    $item = Get-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
    if (-not $item) { continue }
    if ($item.Length -gt 2MB) { continue }

    try {
      $lines = @(Get-Content -LiteralPath $file -Encoding UTF8 -ErrorAction Stop)
    } catch {
      continue
    }

    for ($i = 0; $i -lt $lines.Count; $i++) {
      $line = [string]$lines[$i]
      $lineNo = $i + 1
      $hasAllowedDesktopTerm = $false
      foreach ($desktopTerm in $allowedDesktopTerms) {
        if ($line -match [regex]::Escape($desktopTerm)) {
          $hasAllowedDesktopTerm = $true
          break
        }
      }

      if ($line -match $legacyYyapiIpPattern) {
        $isDocWarning = $false
        foreach ($prefix in $docWarningPrefixes) {
          if ($normalized -eq $prefix -or $normalized.StartsWith($prefix)) {
            $isDocWarning = $true
            break
          }
        }

        $isFatal = $false
        foreach ($prefix in $legacyIpFatalPaths) {
          if ($normalized -eq $prefix -or $normalized.StartsWith($prefix)) {
            $isFatal = $true
            break
          }
        }

        if ($isFatal) {
          Add-Issue $issues "fatal" $normalized $lineNo "Legacy yyapi IP in runtime/build source." $line.Trim()
        } elseif ($isDocWarning) {
          Add-Issue $issues "warning" $normalized $lineNo "Legacy yyapi IP appears in documentation/internal notes only." $line.Trim()
        } else {
          Add-Issue $issues "warning" $normalized $lineNo "Legacy yyapi IP appears outside runtime/build source." $line.Trim()
        }
      }

      if ($normalized -eq "scripts/preflight-green-package.ps1" -and ($line -match [regex]::Escape($viteMinimaxApiKeyPattern) -or $line -match "sk-\[|Bearer")) {
        continue
      }

      if ($line -match [regex]::Escape($viteMinimaxApiKeyPattern)) {
        Add-Issue $issues "fatal" $normalized $lineNo "VITE MiniMax API key env var must not be committed." $line.Trim()
      }

      foreach ($match in [regex]::Matches($line, "(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}")) {
        Add-Issue $issues "fatal" $normalized $lineNo "Real-looking sk- API key." $match.Value
      }

      foreach ($match in [regex]::Matches($line, "Bearer\s+([A-Za-z0-9_-]{20,})")) {
        Add-Issue $issues "fatal" $normalized $lineNo "Real-looking Bearer token." $match.Value
      }

      foreach ($match in [regex]::Matches($line, "(?i)^\s*(?:export\s+)?(MINIMAX_API_KEY|OPENAI_API_KEY)\s*=\s*([^#\s]+)")) {
        $value = $match.Groups[2].Value.Trim()
        if (-not (Test-AllowedPlaceholder $value)) {
          Add-Issue $issues "fatal" $normalized $lineNo "Real-looking API key assignment." $line.Trim()
        }
      }

      $isExecutableRuntimeCopy = Test-ExecutableRuntimeCopyLine $line
      $isLegacyLocalRuntimeCopyPattern = (
        $line -match "(Copy-Item|Copy-Dir|robocopy)" -and
        $line -match "(C:\\tmp|Downloads|Desktop|AppData)" -and
        $line -match "(runtime|old package|old-package|package)"
      )
      $isSelfScannerRule = Test-SelfScannerRuleLine $normalized $line

      if ($normalized -match "^scripts/" -and -not $hasAllowedDesktopTerm -and ($isExecutableRuntimeCopy -or $isLegacyLocalRuntimeCopyPattern) -and -not $isSelfScannerRule) {
        Add-Issue $issues "fatal" $normalized $lineNo "Build script appears to copy runtime/package content from local cache or user folders." $line.Trim()
      }
    }
  }

  return $issues
}

function Write-Issues {
  param([System.Collections.Generic.List[object]]$Issues)

  $warnings = @($Issues | Where-Object { $_.severity -eq "warning" })
  $fatals = @($Issues | Where-Object { $_.severity -eq "fatal" })

  if ($warnings.Count -gt 0) {
    Write-Host "Warnings:" -ForegroundColor Yellow
    foreach ($issue in $warnings) {
      Write-Host ("  [{0}:{1}] {2} :: {3}" -f $issue.path, $issue.line, $issue.message, $issue.text) -ForegroundColor Yellow
    }
  } else {
    Write-Host "Warnings: 0"
  }

  if ($fatals.Count -gt 0) {
    Write-Host "Fatal risks:" -ForegroundColor Red
    foreach ($issue in $fatals) {
      Write-Host ("  [{0}:{1}] {2} :: {3}" -f $issue.path, $issue.line, $issue.message, $issue.text) -ForegroundColor Red
    }
    throw "Fatal source risk count: $($fatals.Count)"
  }

  Write-Host "Fatal risks: 0"
}

$root = (git rev-parse --show-toplevel 2>$null)
if (-not $root) {
  throw "Current directory is not a git repository."
}

Set-Location $root
$branch = git branch --show-current
if ($branch -ne $ExpectedBranch -and $branch -notlike "release-regression-usb-exe-*") {
  throw "Expected branch $ExpectedBranch or release-regression-usb-exe-*, current branch is $branch."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$manifestPath = "C:\tmp\green-usb-preflight-manifest-$timestamp.json"
New-Item -ItemType Directory -Force C:\tmp | Out-Null

Write-Section "Workspace"
Test-WorkspaceStatus $root

Write-Section "Build Script Logic"
Test-BuildScriptLogic

Write-Section "MiniMax-only Test Build Logic"
Test-MiniMaxOnlyTestBuildLogic

Write-Section "MiniMax CN Gateway Defaults"
Test-MiniMaxCNGatewayDefaults

Write-Section "OpenClaw Desktop Control Registration"
Test-OpenClawDesktopControlRegistration

Write-Section "Ecommerce Assistant Build Flag"
Test-EcommerceAssistantBuildFlag

Write-Section "MiniMax API Key Entry"
Test-MiniMaxApiKeyEntry

Write-Section "No Customer User System"
Test-NoUserSystemRemoval

Write-Section "Backend Local Auth Isolation"
Test-BackendLocalAuthIsolation

Write-Section "Runtime Manifest"
Invoke-RuntimeVerify -ProjectRoot $root -ManifestPath $manifestPath
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$missingRequiredCount = @($manifest.missingRequired).Count
$riskHitsCount = @($manifest.riskHits).Count
if ($missingRequiredCount -ne 0) { throw "Runtime manifest missingRequired=$missingRequiredCount" }
if ($riskHitsCount -ne 0) { throw "Runtime manifest riskHits=$riskHitsCount" }
Write-Host "Runtime manifest passed: $manifestPath"
Write-Host "missingRequired=0"
Write-Host "riskHits=0"

Write-Section "Port 1420"
Test-Port1420

Write-Section "Tracked Source Risk Scan"
$issues = Test-TrackedSourceRisks
Write-Issues $issues

Write-Section "Summary"
Write-Host "Preflight result: PASS" -ForegroundColor Green
Write-Host "Manifest: $manifestPath"
