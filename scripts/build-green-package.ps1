param(
  [string]$OutRoot = "",
  [string]$ZipPath = "",
  [string]$TestExtract = "",
  [switch]$SkipBuild,
  [switch]$SkipZip,
  [switch]$SanitizedTest,
  [switch]$TestBuild,
  [switch]$SkipActivation,
  [switch]$PortableMode,
  [switch]$FailIfPortOccupied
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DateStamp = Get-Date -Format "yyyyMMdd"
$script:EffectiveSanitizedTest = $SanitizedTest.IsPresent -or $TestBuild.IsPresent
$script:EffectiveSkipActivation = $SkipActivation.IsPresent -or $script:EffectiveSanitizedTest
$script:EffectivePortableMode = $PortableMode.IsPresent -or $script:EffectiveSanitizedTest
$script:EffectiveFailIfPortOccupied = $true
$script:MiniMaxTestBaseUrl = "https://api.minimaxi.com/v1"
$script:MiniMaxAnthropicBaseUrl = "https://api.minimaxi.com/anthropic"
$script:MiniMaxTestModel = "MiniMax-M3"
$StrictPort = 1420
$StrictPortRequired = $true
$StrictPortSummary = "strictPort: port 1420, fail if port occupied, no reuse existing service"

function Step([string]$Message) {
  Write-Host ""
  Write-Host "[GREEN] $Message" -ForegroundColor Cyan
}

Write-Host $StrictPortSummary -ForegroundColor DarkCyan

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

function Assert-FileMinSize([string]$Path, [int64]$MinBytes, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Fail "Missing ${Label}: $Path"
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt $MinBytes) {
    Fail "${Label} is too small: $($item.Length) bytes, expected >= $MinBytes"
  }
}

function Get-GreenRuntimeRequirements {
  @(
    [pscustomobject]@{ Label = "OpenClaw launcher"; Path = (Join-Path $Root "src-tauri\resources\runtime\openclaw\openclaw.cmd"); Type = "Leaf" },
    [pscustomobject]@{ Label = "Bundled OpenClaw Node"; Path = (Join-Path $Root "src-tauri\resources\runtime\openclaw\node.exe"); Type = "Leaf" },
    [pscustomobject]@{ Label = "OpenClaw runtime dir"; Path = (Join-Path $Root "src-tauri\resources\runtime\openclaw"); Type = "Container" },
    [pscustomobject]@{ Label = "Hermes agent offline package"; Path = (Join-Path $Root "src-tauri\resources\hermes-agent-main.zip"); Type = "Leaf" },
    [pscustomobject]@{ Label = "uv tools runtime"; Path = (Join-Path $Root "src-tauri\resources\runtime\uv-tools"); Type = "Container" },
    [pscustomobject]@{ Label = "uv python runtime"; Path = (Join-Path $Root "src-tauri\resources\runtime\uv-python"); Type = "Container" },
    [pscustomobject]@{ Label = "Hermes agent runtime"; Path = (Join-Path $Root "src-tauri\resources\runtime\hermes-agent"); Type = "Container" },
    [pscustomobject]@{ Label = "Hermes CLI executable"; Path = (Join-Path $Root "src-tauri\resources\runtime\hermes-agent\Scripts\hermes.exe"); Type = "Leaf" },
    [pscustomobject]@{ Label = "Hermes agent executable"; Path = (Join-Path $Root "src-tauri\resources\runtime\hermes-agent\Scripts\hermes-agent.exe"); Type = "Leaf" },
    [pscustomobject]@{ Label = "Claude panel server"; Path = (Join-Path $Root "src-tauri\resources\runtime\claude-panel\server.js"); Type = "Leaf" },
    [pscustomobject]@{ Label = "Claude panel app"; Path = (Join-Path $Root "src-tauri\resources\runtime\claude-panel\public\app.js"); Type = "Leaf" },
    [pscustomobject]@{ Label = "OCR runtime"; Path = (Join-Path $Root "src-tauri\resources\runtime\ocr"); Type = "Container" },
    [pscustomobject]@{ Label = "OCR data"; Path = (Join-Path $Root "src-tauri\resources\data\ocr"); Type = "Container" }
  )
}

function Get-GreenOptionalRuntimeResources {
  @(
    [pscustomobject]@{ Label = "Hermes legacy runtime optional"; Path = (Join-Path $Root "src-tauri\resources\runtime\hermes"); Type = "Container" },
    [pscustomobject]@{ Label = "Hermes ACP executable optional"; Path = (Join-Path $Root "src-tauri\resources\runtime\hermes-agent\Scripts\hermes-acp.exe"); Type = "Leaf" }
  )
}

function Assert-GreenRuntimeRequirements {
  $missing = @()
  foreach ($item in Get-GreenRuntimeRequirements) {
    if (-not (Test-Path -LiteralPath $item.Path -PathType $item.Type)) {
      $missing += $item
    }
  }
  if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Missing required green package runtime resources:" -ForegroundColor Red
    foreach ($item in $missing) {
      Write-Host (" - {0}: {1}" -f $item.Label, $item.Path) -ForegroundColor Red
    }
    Fail "Green package runtime prerequisites are incomplete. Do not copy old packages, download runtime, or create placeholder files in this step."
  }
  Write-Host "Hermes agent runtime: required" -ForegroundColor Green
  Write-Host "Using runtime/hermes-agent as Hermes executable runtime" -ForegroundColor Green
  foreach ($item in Get-GreenOptionalRuntimeResources) {
    if (Test-Path -LiteralPath $item.Path -PathType $item.Type) {
      Write-Host ("Optional runtime present - {0}: {1}" -f $item.Label, $item.Path) -ForegroundColor DarkGreen
    } else {
      Write-Host ("Optional runtime missing - {0}: {1}" -f $item.Label, $item.Path) -ForegroundColor Yellow
    }
  }
  Write-Host "Hermes legacy runtime: optional" -ForegroundColor Yellow
}

function Test-GreenOcrRuntime([string]$OpenCloudDir, [string]$NodeExe) {
  $ocrRuntime = Join-Path $OpenCloudDir "resources\runtime\ocr"
  $ocrData = Join-Path $OpenCloudDir "resources\data\ocr"
  $runner = Join-Path $ocrRuntime "ocr-runner.cjs"

  Assert-FileMinSize $runner 1000 "shared OCR runner"
  Assert-FileMinSize (Join-Path $ocrRuntime "package.json") 100 "OCR package.json"
  $sourceLock = Join-Path $Root "src-tauri\resources\runtime\ocr\package-lock.json"
  if (Test-Path -LiteralPath $sourceLock -PathType Leaf) {
    Assert-FileMinSize (Join-Path $ocrRuntime "package-lock.json") 100 "OCR package-lock.json"
  }
  Assert-FileMinSize (Join-Path $ocrRuntime "node_modules\tesseract.js\package.json") 100 "tesseract.js package"
  Assert-FileMinSize (Join-Path $ocrRuntime "node_modules\tesseract.js-core\package.json") 100 "tesseract.js-core package"
  Assert-FileMinSize (Join-Path $ocrRuntime "node_modules\tesseract.js-core\tesseract-core.wasm") 100000 "tesseract wasm"
  Assert-FileMinSize (Join-Path $ocrRuntime "tessdata\eng.traineddata.gz") 1048576 "OCR English language data"
  Assert-FileMinSize (Join-Path $ocrRuntime "tessdata\chi_sim.traineddata.gz") 1048576 "OCR Chinese language data"
  Assert-FileMinSize (Join-Path $ocrData "ocr-config.json") 100 "shared OCR config"

  Push-Location $ocrRuntime
  try {
    $healthText = (& $NodeExe "ocr-runner.cjs" --health 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
      Fail "Packaged OCR health check failed: $healthText"
    }
    $health = $healthText | ConvertFrom-Json
    if (-not $health.ok) {
      Fail "Packaged OCR health check returned ok=false: $healthText"
    }
  } finally {
    Pop-Location
  }
}

function Write-Utf8File([string]$Path, [string]$Content) {
  New-Item -ItemType Directory -Path (Split-Path $Path -Parent) -Force | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Set-TestBuildViteEnv {
  if (-not $script:EffectiveSanitizedTest) { return @{} }
  $keys = @(
    "VITE_ENABLE_ECOMMERCE_ASSISTANT",
    "VITE_SUPERCLAW_TEST_BUILD",
    "VITE_SUPERCLAW_FORCE_PROVIDER",
    "VITE_SUPERCLAW_MINIMAX_BASE_URL",
    "VITE_SUPERCLAW_MINIMAX_MODEL"
  )
  $previous = @{}
  foreach ($key in $keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
  }
  [Environment]::SetEnvironmentVariable("VITE_ENABLE_ECOMMERCE_ASSISTANT", "true", "Process")
  [Environment]::SetEnvironmentVariable("VITE_SUPERCLAW_TEST_BUILD", "1", "Process")
  [Environment]::SetEnvironmentVariable("VITE_SUPERCLAW_FORCE_PROVIDER", "minimax", "Process")
  [Environment]::SetEnvironmentVariable("VITE_SUPERCLAW_MINIMAX_BASE_URL", $script:MiniMaxTestBaseUrl, "Process")
  [Environment]::SetEnvironmentVariable("VITE_SUPERCLAW_MINIMAX_MODEL", $script:MiniMaxTestModel, "Process")
  Write-Host "Test build Vite env: ecommerce assistant=true, no user system, provider=minimax, model=$script:MiniMaxTestModel" -ForegroundColor Green
  return $previous
}

function Restore-TestBuildViteEnv([hashtable]$Previous) {
  if (-not $Previous) { return }
  foreach ($key in $Previous.Keys) {
    [Environment]::SetEnvironmentVariable($key, $Previous[$key], "Process")
  }
}

function Write-OpenClawConfig([string]$Dir) {
  New-Item -ItemType Directory -Path $Dir -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $Dir "workspace") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $Dir "agents\main\agent") -Force | Out-Null
  $config = [ordered]@{
    '$schema' = "https://openclaw.ai/schema/config.json"
    meta = [ordered]@{
      lastTouchedVersion = "2026.5.26-zh.1"
      lastTouchedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    models = [ordered]@{
      providers = [ordered]@{
        minimax = [ordered]@{
          baseUrl = $script:MiniMaxTestBaseUrl
          apiKey = '${MINIMAX_API_KEY}'
          api = "openai-completions"
          models = @(
            [ordered]@{ id = $script:MiniMaxTestModel; name = "MiniMax M3"; api = "openai-completions"; reasoning = $true; input = @("text"); contextWindow = 204800; maxTokens = 131072 }
          )
        }
        "openai-compatible" = [ordered]@{
          baseUrl = '${OPENAI_COMPATIBLE_BASE_URL}'
          apiKey = '${OPENAI_API_KEY}'
          api = "openai-completions"
          models = @(
            [ordered]@{ id = "custom-model"; name = "OpenAI Compatible"; api = "openai-completions"; reasoning = $false; input = @("text"); contextWindow = 128000; maxTokens = 8192 }
          )
        }
        custom = [ordered]@{
          baseUrl = '${CUSTOM_OPENAI_BASE_URL}'
          apiKey = '${CUSTOM_API_KEY}'
          api = "openai-completions"
          models = @(
            [ordered]@{ id = "custom-model"; name = "Custom Provider"; api = "openai-completions"; reasoning = $false; input = @("text"); contextWindow = 128000; maxTokens = 8192 }
          )
        }
      }
    }
    agents = [ordered]@{
      defaults = [ordered]@{
        workspace = 'workspace'
        model = [ordered]@{ primary = "minimax/$script:MiniMaxTestModel"; fallbacks = @() }
        models = [ordered]@{ "minimax/$script:MiniMaxTestModel" = [ordered]@{} }
        skills = @()
        contextInjection = "never"
        bootstrapMaxChars = 300
        bootstrapTotalMaxChars = 800
        thinkingDefault = "off"
        verboseDefault = "off"
      }
      list = @([ordered]@{
        id = "main"
        name = "OpenCloud"
        workspace = "workspace"
        model = [ordered]@{ primary = "minimax/$script:MiniMaxTestModel"; fallbacks = @() }
        skills = @()
        skillsLimits = [ordered]@{ maxSkillsPromptChars = 0 }
        tools = [ordered]@{
          profile = "minimal"
          alsoAllow = @("browser", "desktop_control", "skill_manager", "exec", "process")
        }
        thinkingDefault = "off"
        verboseDefault = "off"
      })
    }
    bindings = @()
    channels = [ordered]@{}
    commands = [ordered]@{ native = "auto"; nativeSkills = "auto"; ownerDisplay = "raw"; restart = $true }
    plugins = [ordered]@{
      allow = @("browser", "desktop-control", "skill-manager")
      entries = [ordered]@{
        browser = [ordered]@{ enabled = $true }
        "desktop-control" = [ordered]@{ enabled = $true }
        "skill-manager" = [ordered]@{ enabled = $true }
        minimax = [ordered]@{ enabled = $true }
      }
    }
    session = [ordered]@{ dmScope = "per-channel-peer" }
    skills = [ordered]@{ entries = [ordered]@{}; limits = [ordered]@{ maxSkillsPromptChars = 0 } }
    tools = [ordered]@{ profile = "minimal"; alsoAllow = @("browser", "desktop_control", "skill_manager", "exec", "process"); exec = [ordered]@{ host = "gateway"; security = "full"; ask = "off" }; sessions = [ordered]@{ visibility = "agent" } }
    gateway = [ordered]@{
      mode = "local"
      bind = "loopback"
      port = 18789
      auth = [ordered]@{ mode = "token"; token = "superclaw-portable-local" }
      remote = [ordered]@{ token = "superclaw-portable-local" }
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
          "http://127.0.0.1:18789",
          "app://localhost",
          "app://",
          "null"
        )
        allowInsecureAuth = $true
      }
    }
  }
  Write-Utf8File (Join-Path $Dir "openclaw.json") ($config | ConvertTo-Json -Depth 30)
  Write-Utf8File (Join-Path $Dir "exec-approvals.json") (([ordered]@{ version = 1; defaults = [ordered]@{ security = "full"; ask = "off"; askFallback = "full" } }) | ConvertTo-Json -Depth 5)
  $models = [ordered]@{
    providers = [ordered]@{
      minimax = [ordered]@{
        baseUrl = $script:MiniMaxTestBaseUrl
        apiKey = '${MINIMAX_API_KEY}'
        api = "openai-completions"
        models = @(
          [ordered]@{ id = $script:MiniMaxTestModel; name = "MiniMax M3"; api = "openai-completions"; reasoning = $true; input = @("text"); contextWindow = 204800; maxTokens = 131072 }
        )
      }
      "openai-compatible" = [ordered]@{
        baseUrl = '${OPENAI_COMPATIBLE_BASE_URL}'
        apiKey = '${OPENAI_API_KEY}'
        api = "openai-completions"
        models = @(
          [ordered]@{ id = "custom-model"; name = "OpenAI Compatible"; api = "openai-completions"; reasoning = $false; input = @("text"); contextWindow = 128000; maxTokens = 8192 }
        )
      }
      custom = [ordered]@{
        baseUrl = '${CUSTOM_OPENAI_BASE_URL}'
        apiKey = '${CUSTOM_API_KEY}'
        api = "openai-completions"
        models = @(
          [ordered]@{ id = "custom-model"; name = "Custom Provider"; api = "openai-completions"; reasoning = $false; input = @("text"); contextWindow = 128000; maxTokens = 8192 }
        )
      }
    }
  }
  Write-Utf8File (Join-Path $Dir "agents\main\agent\models.json") ($models | ConvertTo-Json -Depth 10)
}

function Write-HermesConfig([string]$Dir) {
  New-Item -ItemType Directory -Path $Dir -Force | Out-Null
  $baseUrlYamlLine = "  base_url: $script:MiniMaxTestBaseUrl`n"
  foreach ($name in @("cron", "sessions", "logs", "memories", "skills", "pairing", "hooks", "image_cache", "audio_cache", "plugins")) {
    New-Item -ItemType Directory -Path (Join-Path $Dir $name) -Force | Out-Null
  }
  Write-Utf8File (Join-Path $Dir "config.yaml") @"
# Hermes Agent portable configuration.
model:
  default: $script:MiniMaxTestModel
  provider: minimax
${baseUrlYamlLine}platform_toolsets:
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
  Write-Utf8File (Join-Path $Dir ".env") @"
MINIMAX_API_KEY=YOUR_API_KEY
MINIMAX_BASE_URL=$script:MiniMaxTestBaseUrl
HERMES_PROVIDER=minimax
OPENAI_MODEL=$script:MiniMaxTestModel
SUPERCLAW_FORCE_PROVIDER=minimax
API_SERVER_KEY=clawpanel-local
GATEWAY_ALLOW_ALL_USERS=true
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
const strictPort = 1420;
const strictPortRequired = true;

function log(msg) { console.log(`[Launcher] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function exists(p) { return fs.existsSync(p); }
function fail(msg) { console.error(`\n[ERROR] ${msg}\n`); process.exit(1); }

function registerOpenClawTools() {
  const script = path.join(app, 'scripts', 'register-openclaw-tools.ps1');
  const resources = path.join(app, 'resources');
  const data = path.join(resources, 'data');
  if (!exists(script)) fail('Missing OpenClaw tool registration script. Please extract the full package again.');
  const result = cp.spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-ResourcesRoot',
    resources,
    '-DataRoot',
    data,
  ], {
    cwd: app,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail(`OpenClaw desktop-control registration failed before gateway startup (exit ${result.status ?? 'unknown'}).`);
  }
}

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

function getPortOwnerReport(port) {
  if (process.platform !== 'win32') return 'Port owner lookup is only implemented on Windows.';
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$conns = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort ${port} -State Listen)
$rows = foreach ($c in $conns) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
  [pscustomobject]@{
    PID = $c.OwningProcess
    ProcessName = $p.Name
    CommandLine = $p.CommandLine
  }
}
$rows | ConvertTo-Json -Depth 3
`;
  try {
    const raw = cp.execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    }).trim();
    if (!raw) return 'No owning process details found.';
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map(row => {
      const commandLine = String(row.CommandLine || '').replace(/\s+/g, ' ').trim();
      return `PID: ${row.PID || 'unknown'}\nProcessName: ${row.ProcessName || 'unknown'}\nCommandLine: ${commandLine || '(empty)'}`;
    }).join('\n---\n');
  } catch (err) {
    return `Unable to query owner details: ${err.message || err}`;
  }
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
  log(`Strict port mode: port ${strictPort}, fail if port occupied, no reuse existing service.`);
  if (strictPortRequired && await tcpOpen(strictPort)) {
    fail(`Port ${strictPort} is already occupied.\n${getPortOwnerReport(strictPort)}\nGreen package tests never reuse an unknown ${strictPort} service. Close the occupying process and retry.`);
  }
  log(`Starting control panel: http://127.0.0.1:${strictPort}`);
  spawnManaged(nodeExe, [serve, '--host', '127.0.0.1', '--port', String(strictPort)], {
    cwd: app,
    env: { ...process.env, PORT: String(strictPort), HOST: '127.0.0.1' },
  });
  if (!(await waitTcp(strictPort, 'Panel progress', 30000))) fail(`Panel startup timed out. Check whether port ${strictPort} is occupied.`);
  process.stdout.write('\rPanel progress: 100%\n');
}

async function startOpenClaw() {
  const openclaw = path.join(app, 'resources', 'runtime', 'openclaw', 'openclaw.cmd');
  const home = path.join(app, 'resources', 'data', '.openclaw');
  if (!exists(openclaw)) fail('Missing OpenClaw runtime. Please extract the full package again.');
  registerOpenClawTools();
  if (!(await tcpOpen(18789))) {
    log('Starting OpenCloud/OpenClaw Gateway: http://127.0.0.1:18789');
    spawnManaged(openclaw, ['gateway', 'run'], {
      cwd: path.dirname(openclaw),
      env: {
        ...process.env,
        OPENCLAW_HOME: home,
        OPENCLAW_STATE_DIR: home,
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
Assert-GreenRuntimeRequirements

if (-not $SkipBuild) {
  Step "Building frontend"
  Push-Location $Root
  $previousViteEnv = Set-TestBuildViteEnv
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { Fail "npm run build failed" }
  } finally {
    Restore-TestBuildViteEnv $previousViteEnv
    Pop-Location
  }
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
Copy-Dir (Join-Path $Root "src-tauri\resources\runtime\openclaw") (Join-Path $OpenCloud "resources\runtime\openclaw") -XD @(".cache", "tmp", "temp") -XF @("*.log", "*.tmp")
Copy-Dir (Join-Path $Root "src-tauri\resources\runtime\hermes-agent") (Join-Path $OpenCloud "resources\runtime\hermes-agent") -XD @(".cache", "tmp", "temp") -XF @("*.log", "*.tmp")
$legacyHermesRuntime = Join-Path $Root "src-tauri\resources\runtime\hermes"
if (Test-Path -LiteralPath $legacyHermesRuntime -PathType Container) {
  Copy-Dir $legacyHermesRuntime (Join-Path $OpenCloud "resources\runtime\hermes") -XD @(".cache", "tmp", "temp") -XF @("*.log", "*.tmp")
} else {
  Write-Host "[WARN] Hermes legacy runtime: optional and not present. Using runtime/hermes-agent as Hermes executable runtime." -ForegroundColor Yellow
}
Copy-Dir (Join-Path $Root "src-tauri\resources\runtime\ocr") (Join-Path $OpenCloud "resources\runtime\ocr") -XD @(".cache", "tmp", "temp") -XF @("*.log", "*.tmp")

foreach ($runtimeName in @("claude-code", "claude-panel")) {
  $rp = Join-Path $Root "src-tauri\resources\runtime\$runtimeName"
  if (Test-Path -LiteralPath $rp) {
    Copy-Dir $rp (Join-Path $OpenCloud "resources\runtime\$runtimeName") -XD @(".cache", "tmp", "temp") -XF @("*.log", "*.tmp")
  }
}

Copy-Dir (Join-Path $Root "src-tauri\resources\bin") (Join-Path $OpenCloud "resources\bin")
Copy-Dir (Join-Path $Root "src-tauri\resources\runtime\uv-tools") (Join-Path $OpenCloud "resources\uv-tools")
Copy-Dir (Join-Path $Root "src-tauri\resources\runtime\uv-python") (Join-Path $OpenCloud "resources\uv-python")
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
Copy-Dir (Join-Path $Root "src-tauri\resources\data\ocr") (Join-Path $OpenCloud "resources\data\ocr") -XD @(".cache", "cache", "tmp", "temp") -XF @("*.log", "*.tmp")
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

Step "Registering OpenClaw portable tools"
& powershell -NoProfile -ExecutionPolicy Bypass `
  -File (Join-Path $OpenCloud "scripts\register-openclaw-tools.ps1") `
  -ResourcesRoot (Join-Path $OpenCloud "resources") `
  -DataRoot (Join-Path $OpenCloud "resources\data")
if ($LASTEXITCODE -ne 0) { Fail "OpenClaw desktop-control registration failed" }

Write-Utf8File (Join-Path $ConfigTemplate "OpenCloud-openclaw.json.template") (Get-Content -Raw -LiteralPath (Join-Path $OpenCloud "resources\data\.openclaw\openclaw.json"))
Write-Utf8File (Join-Path $ConfigTemplate "Hermes-env.template") @"
# Copy this file to OpenCloud\resources\data\hermes\.env and fill your own key.
# Do not publish real keys.
MINIMAX_API_KEY=YOUR_API_KEY
MINIMAX_BASE_URL=$script:MiniMaxTestBaseUrl
HERMES_PROVIDER=minimax
OPENAI_MODEL=$script:MiniMaxTestModel
SUPERCLAW_FORCE_PROVIDER=minimax
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
$BundledNode = Join-Path $Runtime "node-win\node.exe"
& $BundledNode --version
if ($LASTEXITCODE -ne 0) { Fail "Bundled Node is not usable" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "scripts\serve.js"))) { Fail "Missing serve.js" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\runtime\openclaw\openclaw.cmd"))) { Fail "Missing openclaw.cmd" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions\desktop-control\openclaw.plugin.json"))) { Fail "Missing registered OpenClaw desktop-control plugin" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions\skill-manager\openclaw.plugin.json"))) { Fail "Missing registered OpenClaw skill-manager plugin" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\runtime\openclaw\bin\desktop-control-agent.exe"))) { Fail "Missing registered OpenClaw desktop-control sidecar" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\runtime\hermes-agent\Scripts\hermes.exe"))) { Fail "Missing Hermes CLI executable" }
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\runtime\hermes-agent\Scripts\hermes-agent.exe"))) { Fail "Missing Hermes agent executable" }
Test-GreenOcrRuntime $OpenCloud $BundledNode
if (-not (Test-Path -LiteralPath (Join-Path $OpenCloud "resources\hermes-agent-main.zip"))) { Fail "Missing Hermes offline package" }

if (-not $SkipZip) {
  Step "Creating zip"
  Compress-Archive -Path $OutRoot -DestinationPath $ZipPath -Force

  Step "Extracting zip for structure verification"
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $TestExtract -Force
  $ExtractedRoot = Join-Path $TestExtract (Split-Path $OutRoot -Leaf)
  foreach ($must in @("Start-OpenCloud.bat", "Start-Hermes.bat", "Start-All.bat", "runtime\node-win\node.exe", "OpenCloud\scripts\serve.js", "OpenCloud\resources\runtime\openclaw\openclaw.cmd", "OpenCloud\resources\runtime\hermes-agent\Scripts\hermes.exe", "OpenCloud\resources\runtime\hermes-agent\Scripts\hermes-agent.exe", "OpenCloud\resources\runtime\ocr\ocr-runner.cjs", "OpenCloud\resources\runtime\ocr\package.json", "OpenCloud\resources\runtime\ocr\node_modules\tesseract.js\package.json", "OpenCloud\resources\runtime\ocr\node_modules\tesseract.js-core\package.json", "OpenCloud\resources\runtime\ocr\tessdata\eng.traineddata.gz", "OpenCloud\resources\runtime\ocr\tessdata\chi_sim.traineddata.gz", "OpenCloud\resources\data\ocr\ocr-config.json")) {
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
Hermes: clean config, offline package, uv tools, runtime\hermes-agent, skills; legacy runtime\hermes optional
Shared OCR: runner, package metadata, tesseract.js dependencies, tessdata, data config
Security scan: no complete sk-/ark-/Bearer/private-key material; no .env/pem/key/p12/pfx files
Excluded: node_modules, src-tauri\target, old zips/builds, logs, cache/tmp/temp, sessions, real configs
Customer action: unzip and double-click bat; fill own API key before chat
"@

Write-Host ""
Write-Host "Done: $OutRoot" -ForegroundColor Green
Write-Host "Zip:  $ZipPath" -ForegroundColor Green
