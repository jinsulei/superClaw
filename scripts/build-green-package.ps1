param(
  [string]$OutRoot = "",
  [string]$ZipPath = "",
  [string]$TestExtract = "",
  [switch]$SkipBuild,
  [switch]$SkipZip
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DateStamp = Get-Date -Format "yyyyMMdd"

function Step([string]$Message) {
  Write-Host ""
  Write-Host "[GREEN] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host "[ERROR] $Message" -ForegroundColor Red
  exit 1
}

function Assert-UnderF([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  $drive = [System.IO.Path]::GetPathRoot($full)
  if ($drive -and -not (Test-Path -LiteralPath $drive)) {
    Fail "Output drive does not exist: $drive"
  }
  return $full
}

function Copy-Dir([string]$Source, [string]$Dest, [string[]]$XD = @(), [string[]]$XF = @()) {
  if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    Fail "Missing directory: $Source"
  }
  New-Item -ItemType Directory -Path $Dest -Force | Out-Null
  $args = @($Source, $Dest, "/E", "/R:2", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
  if ($XD.Count) { $args += "/XD"; $args += $XD }
  if ($XF.Count) { $args += "/XF"; $args += $XF }
  & robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) {
    Fail "Robocopy failed: $Source -> $Dest"
  }
}

function Copy-FileIfExists([string]$Source, [string]$DestDir) {
  if (Test-Path -LiteralPath $Source -PathType Leaf) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination (Join-Path $DestDir (Split-Path $Source -Leaf)) -Force
  }
}

function Write-Utf8File([string]$Path, [string]$Content) {
  New-Item -ItemType Directory -Path (Split-Path $Path -Parent) -Force | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Write-OpenClawConfig([string]$Dir) {
  New-Item -ItemType Directory -Path $Dir -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $Dir "workspace") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $Dir "agents\main\agent") -Force | Out-Null
  $config = [ordered]@{
    '$schema' = "https://openclaw.ai/schema/config.json"
    meta = [ordered]@{ lastTouchedVersion = "YY1.0.1"; package = "OpenCloud-Hermes-Green" }
    models = [ordered]@{
      providers = [ordered]@{
        minimax = [ordered]@{
          baseUrl = "https://api.minimaxi.com/anthropic/v1"
          apiKey = '${MINIMAX_API_KEY}'
          api = "anthropic-messages"
          models = @(
            [ordered]@{ id = "MiniMax-M2.7-highspeed"; name = "MiniMax M2.7 Highspeed"; api = "anthropic-messages"; reasoning = $false; input = @("text"); contextWindow = 204800; maxTokens = 8192 },
            [ordered]@{ id = "MiniMax-M2.7"; name = "MiniMax M2.7"; api = "anthropic-messages"; reasoning = $false; input = @("text"); contextWindow = 204800; maxTokens = 8192 }
          )
        }
      }
    }
    agents = [ordered]@{
      defaults = [ordered]@{
        workspace = 'workspace'
        model = [ordered]@{ primary = "minimax/MiniMax-M2.7-highspeed"; fallbacks = @("minimax/MiniMax-M2.7") }
        models = [ordered]@{
          "minimax/MiniMax-M2.7-highspeed" = [ordered]@{}
          "minimax/MiniMax-M2.7" = [ordered]@{}
        }
        skills = @()
        contextInjection = "continuation-skip"
        bootstrapMaxChars = 300
        bootstrapTotalMaxChars = 800
        thinkingDefault = "off"
        verboseDefault = "off"
      }
      list = @([ordered]@{
        id = "main"
        name = "OpenCloud"
        workspace = "workspace"
        model = [ordered]@{ primary = "minimax/MiniMax-M2.7-highspeed"; fallbacks = @("minimax/MiniMax-M2.7") }
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
    commands = [ordered]@{ native = "auto"; nativeSkills = "auto"; ownerDisplay = "raw"; restart = $true }
    plugins = [ordered]@{ entries = [ordered]@{ browser = [ordered]@{ enabled = $true }; "desktop-control" = [ordered]@{ enabled = $true }; minimax = [ordered]@{ enabled = $true } } }
    session = [ordered]@{ dmScope = "per-channel-peer" }
    skills = [ordered]@{ entries = [ordered]@{}; limits = [ordered]@{ maxSkillsPromptChars = 0 } }
    tools = [ordered]@{ profile = "minimal"; alsoAllow = @("browser", "desktop_control"); sessions = [ordered]@{ visibility = "agent" } }
    gateway = [ordered]@{
      mode = "local"
      bind = "loopback"
      port = 18789
      auth = [ordered]@{ mode = "token"; token = "opencloud-portable-local" }
      controlUi = [ordered]@{
        enabled = $true
        allowedOrigins = @("http://127.0.0.1:1420", "http://localhost:1420", "http://127.0.0.1:18789")
        allowInsecureAuth = $true
      }
    }
  }
  $config | ConvertTo-Json -Depth 30 | Set-Content -Path (Join-Path $Dir "openclaw.json") -Encoding UTF8
  $models = [ordered]@{
    providers = [ordered]@{
      minimax = [ordered]@{
        baseUrl = "https://api.minimaxi.com/anthropic/v1"
        apiKey = '${MINIMAX_API_KEY}'
        api = "anthropic-messages"
        models = @(
          [ordered]@{ id = "MiniMax-M2.7-highspeed"; name = "MiniMax M2.7 Highspeed"; api = "anthropic-messages"; reasoning = $false; input = @("text"); contextWindow = 204800; maxTokens = 8192 },
          [ordered]@{ id = "MiniMax-M2.7"; name = "MiniMax M2.7"; api = "anthropic-messages"; reasoning = $false; input = @("text"); contextWindow = 204800; maxTokens = 8192 }
        )
      }
    }
  }
  $models | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $Dir "agents\main\agent\models.json") -Encoding UTF8
}

function Write-HermesConfig([string]$Dir) {
  New-Item -ItemType Directory -Path $Dir -Force | Out-Null
  foreach ($name in @("cron", "sessions", "logs", "memories", "skills", "pairing", "hooks", "image_cache", "audio_cache", "plugins")) {
    New-Item -ItemType Directory -Path (Join-Path $Dir $name) -Force | Out-Null
  }
  Write-Utf8File (Join-Path $Dir "config.yaml") @"
# Hermes Agent portable configuration.
model:
  default: MiniMax-M2.7-highspeed
  provider: minimax
  base_url: https://api.minimaxi.com/v1
platform_toolsets:
  api_server:
    - hermes-api-server
    - desktop_control
plugins:
  enabled:
    - desktop_control_bridge
known_plugin_toolsets:
  api_server:
    - desktop_control
terminal:
  backend: local
platforms:
  api_server:
    enabled: true
"@
}

function Write-Launcher([string]$LauncherPath) {
  Write-Utf8File $LauncherPath @'
const cp = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = path.join(root, 'OpenCloud');
const nodeExe = process.execPath;
const children = [];
const mode = (process.argv[2] || 'all').toLowerCase();

function log(msg) { console.log(`[Launcher] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function exists(p) { return fs.existsSync(p); }
function fail(msg) { console.error(`\n[ERROR] ${msg}\n`); process.exit(1); }

function spawnManaged(file, args, opts = {}) {
  const child = cp.spawn(file, args, { windowsHide: false, stdio: 'inherit', ...opts });
  children.push(child);
  child.on('exit', code => log(`${path.basename(file)} exited: ${code ?? 'unknown'}`));
  return child;
}

function cleanup() {
  for (const child of children) {
    try { child.kill(); } catch {}
  }
}
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

function tcpOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 500 }, () => {
      socket.destroy(); resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function waitTcp(port, label, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await tcpOpen(port)) return true;
    const pct = Math.min(99, Math.floor(((Date.now() - start) / timeoutMs) * 100));
    process.stdout.write(`\r${label}: ${pct}%`);
    await sleep(500);
  }
  process.stdout.write('\n');
  return false;
}

async function postJson(url, body = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`${resp.status} ${await resp.text()}`);
  return resp.json().catch(() => ({}));
}

async function startPanel() {
  const serve = path.join(app, 'scripts', 'serve.js');
  if (!exists(serve)) fail('Missing OpenCloud\\scripts\\serve.js. Please extract the full package again.');
  if (!(await tcpOpen(1420))) {
    log('Starting control panel: http://127.0.0.1:1420');
    spawnManaged(nodeExe, [serve, '--host', '127.0.0.1', '--port', '1420'], {
      cwd: app,
      env: { ...process.env, PORT: '1420', HOST: '127.0.0.1' },
    });
  } else {
    log('Port 1420 is already running. Reusing existing panel service.');
  }
  if (!(await waitTcp(1420, 'Panel progress', 30000))) fail('Panel startup timed out. Check whether port 1420 is occupied.');
  process.stdout.write('\rPanel progress: 100%\n');
}

async function startOpenClaw() {
  const openclaw = path.join(app, 'resources', 'runtime', 'openclaw', 'openclaw.cmd');
  const home = path.join(app, 'resources', 'data', '.openclaw');
  if (!exists(openclaw)) fail('Missing OpenClaw runtime. Please extract the full package again.');
  if (!(await tcpOpen(18789))) {
    log('Starting OpenCloud/OpenClaw Gateway: http://127.0.0.1:18789');
    spawnManaged(openclaw, ['gateway', 'run'], {
      cwd: path.dirname(openclaw),
      env: {
        ...process.env,
        OPENCLAW_HOME: home,
        OPENCLAW_CONFIG: path.join(home, 'openclaw.json'),
        OPENCLAW_CONFIG_PATH: path.join(home, 'openclaw.json'),
        PATH: `${path.dirname(openclaw)};${process.env.PATH || ''}`,
      },
    });
  } else {
    log('Port 18789 is already running. Reusing existing OpenClaw Gateway.');
  }
  if (!(await waitTcp(18789, 'OpenClaw progress', 60000))) fail('OpenClaw Gateway startup timed out. Check port 18789 and logs.');
  process.stdout.write('\rOpenClaw progress: 100%\n');
}

async function startHermes() {
  await startPanel();
  log('Starting Hermes Gateway. First run may unpack bundled Python/Hermes resources.');
  try {
    await postJson('http://127.0.0.1:1420/__api/hermes_gateway_action', { action: 'start' });
  } catch (err) {
    console.error(`[WARN] Hermes start API returned: ${err.message}`);
  }
  await waitTcp(8642, 'Hermes progress', 90000);
  process.stdout.write('\rHermes progress: 100%\n');
}

function openBrowser(url) {
  cp.spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

(async () => {
  if (!exists(nodeExe)) fail('Missing bundled Node runtime.');
  if (mode === 'opencloud') {
    await startPanel();
    await startOpenClaw();
    openBrowser('http://127.0.0.1:1420/#/chat');
  } else if (mode === 'hermes') {
    await startHermes();
    openBrowser('http://127.0.0.1:1420/#/h/chat');
  } else {
    await startPanel();
    await startHermes();
    await startOpenClaw();
    openBrowser('http://127.0.0.1:1420/#/h/dashboard');
  }
  log('Browser opened. Keep this window open while using the services.');
  process.stdin.resume();
})().catch(err => fail(err.stack || err.message || String(err)));
'@
}

function Write-Bat([string]$Path, [string]$Mode) {
  Write-Utf8File $Path @"
@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
set "NODE=%ROOT%runtime\node-win\node.exe"
if not exist "%NODE%" (
  echo [ERROR] Missing bundled Node: %NODE%
  echo Please extract the complete package again.
  pause
  exit /b 1
)
"%NODE%" "%ROOT%runtime\portable-launcher.mjs" $Mode
pause
"@
}

$DefaultOutBase = if (Test-Path -LiteralPath "F:\") {
  "F:\"
} else {
  [Environment]::GetFolderPath("Desktop")
}
if ([string]::IsNullOrWhiteSpace($OutRoot)) {
  $OutRoot = Join-Path $DefaultOutBase "OpenCloud-Hermes-Green"
}
if ([string]::IsNullOrWhiteSpace($ZipPath)) {
  $ZipPath = Join-Path $DefaultOutBase "OpenCloud-Hermes-Win10-Win11-Green-$DateStamp.zip"
}
if ([string]::IsNullOrWhiteSpace($TestExtract)) {
  $TestExtract = Join-Path $DefaultOutBase "OpenCloud-Hermes-Green-TestExtract"
}

$OutRoot = Assert-UnderF $OutRoot
$ZipPath = Assert-UnderF $ZipPath
$TestExtract = Assert-UnderF $TestExtract

Step "Checking source layout"
foreach ($must in @("package.json", "scripts\serve.js", "scripts\dev-api.js", "dist", "src", "src-tauri\resources\runtime\openclaw")) {
  if (-not (Test-Path -LiteralPath (Join-Path $Root $must))) { Fail "Source is missing: $must" }
}

if (-not $SkipBuild) {
  Step "Building frontend"
  Push-Location $Root
  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "npm run build failed" }
  Pop-Location
}

Step "Creating package directory"
foreach ($p in @($OutRoot, $TestExtract)) {
  if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force }
}
if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }

$OpenCloud = Join-Path $OutRoot "OpenCloud"
$Hermes = Join-Path $OutRoot "Hermes"
$Runtime = Join-Path $OutRoot "runtime"
$ConfigTemplate = Join-Path $OutRoot "config-template"
$Logs = Join-Path $OutRoot "logs"
$Docs = Join-Path $OutRoot "docs"
New-Item -ItemType Directory -Path $OpenCloud,$Hermes,$Runtime,$ConfigTemplate,$Logs,$Docs -Force | Out-Null

Step "Copying frontend, source, and runtimes"
Copy-Dir (Join-Path $Root "dist") (Join-Path $OpenCloud "dist")
Copy-Dir (Join-Path $Root "src") (Join-Path $OpenCloud "src")
Copy-Dir (Join-Path $Root "public") (Join-Path $OpenCloud "public")
Copy-Dir (Join-Path $Root "scripts") (Join-Path $OpenCloud "scripts") -XD @("__pycache__", ".cache", "cache", "tmp", "temp") -XF @("*.log", "*.tmp")
Copy-Dir (Join-Path $Root "src-tauri\resources\runtime\openclaw") (Join-Path $OpenCloud "resources\runtime\openclaw") -XD @(".cache", "cache", "tmp", "temp") -XF @("*.log", "*.tmp")

foreach ($runtimeName in @("claude-code", "claude-panel")) {
  $rp = Join-Path $Root "src-tauri\resources\runtime\$runtimeName"
  if (Test-Path -LiteralPath $rp) {
    Copy-Dir $rp (Join-Path $OpenCloud "resources\runtime\$runtimeName") -XD @(".cache", "cache", "tmp", "temp") -XF @("*.log", "*.tmp")
  }
}

Copy-Dir (Join-Path $Root "src-tauri\resources\bin") (Join-Path $OpenCloud "resources\bin")
Copy-Dir (Join-Path $Root "src-tauri\resources\uv-tools") (Join-Path $OpenCloud "resources\uv-tools")
Copy-Dir (Join-Path $Root "src-tauri\resources\uv-python") (Join-Path $OpenCloud "resources\uv-python")
foreach ($file in @("src-tauri\resources\cpython-3.11.13-windows-x86_64-none.tar.gz", "src-tauri\resources\hermes-agent-main.zip", "src-tauri\resources\uv-x86_64-pc-windows-msvc.zip")) {
  Copy-FileIfExists (Join-Path $Root $file) (Join-Path $OpenCloud "resources")
}

foreach ($file in @("package.json", "package-lock.json", "vite.config.js", "LICENSE", "SECURITY.md", "CHANGELOG.md", "README.zh-TW.md", "README.pt.md", "README.ru.md", "README.vi.md")) {
  Copy-FileIfExists (Join-Path $Root $file) $OpenCloud
}
if (Test-Path -LiteralPath (Join-Path $Root "docs")) {
  Copy-Dir (Join-Path $Root "docs") $Docs -XF @("*.mp4", "*.mov", "*.avi", "*.gif")
}

Step "Writing clean configs and templates"
Write-OpenClawConfig (Join-Path $OpenCloud "resources\data\.openclaw")
Write-HermesConfig (Join-Path $OpenCloud "resources\data\hermes")
$skillsSrc = Join-Path $Root "src-tauri\resources\data\hermes\skills"
if (Test-Path -LiteralPath $skillsSrc) {
  Copy-Dir $skillsSrc (Join-Path $OpenCloud "resources\data\hermes\skills") -XD @(".cache", "cache", "tmp", "temp") -XF @("*.log", "*.tmp")
  Copy-Dir $skillsSrc (Join-Path $Hermes "skills") -XD @(".cache", "cache", "tmp", "temp") -XF @("*.log", "*.tmp")
}
$hermesPluginsSrc = Join-Path $Root "src-tauri\resources\data\hermes\plugins"
if (Test-Path -LiteralPath $hermesPluginsSrc) {
  Copy-Dir $hermesPluginsSrc (Join-Path $OpenCloud "resources\data\hermes\plugins") -XD @("__pycache__", ".cache", "cache", "tmp", "temp") -XF @("*.log", "*.tmp", "*.pyc")
}
Copy-FileIfExists (Join-Path $Root "src-tauri\resources\data\hermes\SOUL.md") (Join-Path $Hermes "docs")

Write-Utf8File (Join-Path $ConfigTemplate "OpenCloud-openclaw.json.template") (Get-Content -Raw -LiteralPath (Join-Path $OpenCloud "resources\data\.openclaw\openclaw.json"))
Write-Utf8File (Join-Path $ConfigTemplate "Hermes-env.template") @"
# Copy this file to OpenCloud\resources\data\hermes\.env and fill your own key.
# Do not publish real keys.
MINIMAX_API_KEY=
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
API_SERVER_KEY=clawpanel-local
GATEWAY_ALLOW_ALL_USERS=true
"@
Write-Utf8File (Join-Path $ConfigTemplate "README-config.txt") @"
OpenCloud / Hermes config templates.
No real API key is included in this package.
"@

Step "Writing bundled Node and launch scripts"
New-Item -ItemType Directory -Path (Join-Path $Runtime "node-win") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $Root "src-tauri\resources\runtime\openclaw\node.exe") -Destination (Join-Path $Runtime "node-win\node.exe") -Force
Write-Launcher (Join-Path $Runtime "portable-launcher.mjs")
Write-Bat (Join-Path $OutRoot "Start-OpenCloud.bat") "opencloud"
Write-Bat (Join-Path $OutRoot "Start-Hermes.bat") "hermes"
Write-Bat (Join-Path $OutRoot "Start-All.bat") "all"

Write-Utf8File (Join-Path $OutRoot "README-FIRST-USE.txt") @"
OpenCloud-Hermes Windows green portable package.

Supported: Windows 10, Windows 11, Desktop, D drive, USB drive, paths with spaces.

Start:
1. Start-OpenCloud.bat: opens OpenCloud/OpenClaw realtime chat.
2. Start-Hermes.bat: opens Hermes chat.
3. Start-All.bat: starts panel, Hermes, and OpenCloud.

Bundled Node: runtime\node-win\node.exe
No system Node, terminal, or npm install is required.
No real API key is included. Fill your own key in the panel or config-template.
"@

Step "Removing generated local env/key files"
Get-ChildItem -LiteralPath $OutRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq ".env" -or $_.Name -match '\.(pem|key|p12|pfx)$' } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

Step "Redacting key examples in generated docs"
Get-ChildItem -LiteralPath $OutRoot -Recurse -File -Filter "*.md" -ErrorAction SilentlyContinue |
  ForEach-Object {
    $text = Get-Content -Raw -LiteralPath $_.FullName
    $newText = $text -replace 'Bearer\s+sk-[A-Za-z0-9_-]+', 'Bearer sk-REDACTED' -replace '(?<![A-Za-z0-9._/-])sk-[A-Za-z0-9_-]{6,}', 'sk-REDACTED'
    if ($newText -ne $text) { Write-Utf8File $_.FullName $newText }
  }

Step "Scanning final package for secrets"
$secretPatterns = @(
  '(?<![A-Za-z0-9._/-])sk-[A-Za-z0-9_-]{32,}',
  '(?<![A-Za-z0-9._/-])ark-[A-Za-z0-9_-]{32,}',
  'Bearer\s+(sk|ark|eyJ)[A-Za-z0-9._~+/-]{20,}',
  '-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{80,}'
)
$secretHits = @()
Get-ChildItem -LiteralPath $OutRoot -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Length -lt 8MB -and $_.FullName -notmatch '\\resources\\runtime\\openclaw\\node_modules\\' } |
  ForEach-Object {
    $file = $_.FullName
    foreach ($pat in $secretPatterns) {
      $m = Select-String -LiteralPath $file -Pattern $pat -CaseSensitive:$false -ErrorAction SilentlyContinue
      foreach ($hit in $m) {
        $secretHits += [pscustomobject]@{ File = $file.Replace($OutRoot + "\", ""); Line = $hit.LineNumber; Pattern = $pat }
      }
    }
  }
$envFiles = Get-ChildItem -LiteralPath $OutRoot -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq ".env" -or $_.Name -match '\.(pem|key|p12|pfx)$' }

if ($secretHits.Count -gt 0 -or $envFiles.Count -gt 0) {
  Write-Host "Sensitive-like content was found:" -ForegroundColor Red
  $secretHits | Format-Table -AutoSize
  $envFiles | Select-Object FullName,Length | Format-Table -AutoSize
  Fail "Security scan failed. Zip was not created."
}

Step "Running basic checks"
& (Join-Path $Runtime "node-win\node.exe") --version
if ($LASTEXITCODE -ne 0) { Fail "Bundled Node is not usable" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "scripts\serve.js"))) { Fail "Missing serve.js" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\runtime\openclaw\openclaw.cmd"))) { Fail "Missing openclaw.cmd" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\hermes-agent-main.zip"))) { Fail "Missing Hermes offline package" }

if (-not $SkipZip) {
  Step "Creating zip"
  Compress-Archive -Path $OutRoot -DestinationPath $ZipPath -Force

  Step "Extracting zip for structure verification"
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $TestExtract -Force
  $ExtractedRoot = Join-Path $TestExtract (Split-Path $OutRoot -Leaf)
  foreach ($must in @("Start-OpenCloud.bat", "Start-Hermes.bat", "Start-All.bat", "runtime\node-win\node.exe", "OpenCloud\scripts\serve.js", "OpenCloud\resources\runtime\openclaw\openclaw.cmd")) {
    if (-not (Test-Path -LiteralPath (Join-Path $ExtractedRoot $must))) {
      Fail "Extract test missing: $must"
    }
  }
}

$sizeMb = [math]::Round(((Get-ChildItem -LiteralPath $OutRoot -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 2)
Write-Utf8File (Join-Path $OutRoot "PACKAGE-REPORT.txt") @"
Source: $Root
Package directory: $OutRoot
Zip: $ZipPath
Size MB: $sizeMb
Bundled Node: runtime\node-win\node.exe
OpenCloud: dist, src, scripts, OpenClaw runtime, clean config
Hermes: clean config, offline package, uv tools, skills
Security scan: no complete sk-/ark-/Bearer/private-key material; no .env/pem/key/p12/pfx files
Excluded: node_modules, src-tauri\target, old zips/builds, logs, cache/tmp/temp, sessions, real configs
Customer action: unzip and double-click bat; fill own API key before chat
"@

Write-Host ""
Write-Host "Done: $OutRoot" -ForegroundColor Green
Write-Host "Zip:  $ZipPath" -ForegroundColor Green
