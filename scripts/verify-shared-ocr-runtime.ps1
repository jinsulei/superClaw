$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root "src-tauri\resources\runtime\ocr"
$TessdataDir = Join-Path $RuntimeDir "tessdata"
$ConfigPath = Join-Path $Root "src-tauri\resources\data\ocr\ocr-config.json"
$Runner = Join-Path $RuntimeDir "ocr-runner.cjs"
$TestImage = "C:\tmp\ocr-test.png"
$StandaloneRoot = Join-Path $env:TEMP "shared-ocr-standalone-test"

function Step([string]$Message) {
  Write-Host ""
  Write-Host "[OCR VERIFY] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  throw $Message
}

function Assert-FileMinSize([string]$Path, [int64]$MinBytes, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Fail "$Label missing: $Path"
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt $MinBytes) {
    Fail "$Label too small: $($item.Length) bytes"
  }
  Write-Host "${Label}: $($item.Length) bytes"
}

function New-OcrTestImage([string]$Path) {
  New-Item -ItemType Directory -Force (Split-Path $Path -Parent) | Out-Null
  Add-Type -AssemblyName System.Drawing
  $bitmap = New-Object System.Drawing.Bitmap 640, 220
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::White)
    $font = New-Object System.Drawing.Font "Arial", 36
    $brush = [System.Drawing.Brushes]::Black
    $graphics.DrawString("TEST 123", $font, $brush, 24, 28)
    $graphics.DrawString("中文测试", $font, $brush, 24, 104)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  Assert-FileMinSize $Path 1000 "OCR test image"
}

Step "Checking files"
Assert-FileMinSize $Runner 1000 "OCR runner"
Assert-FileMinSize (Join-Path $RuntimeDir "package.json") 100 "OCR package"
Assert-FileMinSize (Join-Path $RuntimeDir "package-lock.json") 100 "OCR package lock"
Assert-FileMinSize (Join-Path $RuntimeDir "node_modules\tesseract.js\package.json") 100 "tesseract.js package"
Assert-FileMinSize (Join-Path $RuntimeDir "node_modules\tesseract.js-core\package.json") 100 "tesseract.js-core package"
Assert-FileMinSize (Join-Path $RuntimeDir "node_modules\tesseract.js-core\tesseract-core.wasm") 100000 "tesseract wasm"
Assert-FileMinSize (Join-Path $TessdataDir "eng.traineddata.gz") 512000 "English traineddata"
Assert-FileMinSize (Join-Path $TessdataDir "chi_sim.traineddata.gz") 1048576 "Chinese traineddata"
Assert-FileMinSize $ConfigPath 100 "OCR config"

Step "Checking config shared agents"
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
foreach ($agent in @("openclaw", "hermes", "claude_code")) {
  if ($config.ocr.sharedForAgents -notcontains $agent) {
    Fail "OCR config sharedForAgents is missing: $agent"
  }
}

Step "Checking runner syntax and health"
node --check $Runner
$healthText = node $Runner --health
Write-Host $healthText
$health = $healthText | ConvertFrom-Json
if (-not $health.ok) {
  Fail "OCR health check failed"
}

Step "Creating test image"
New-OcrTestImage $TestImage

Step "Running OCR"
$ocrText = node $Runner --image $TestImage --lang "eng+chi_sim" --json
Write-Host $ocrText
$ocr = $ocrText | ConvertFrom-Json
if (-not $ocr.ok) {
  Fail "OCR engine failed: $($ocr.message)"
}
if ([string]::IsNullOrWhiteSpace($ocr.text)) {
  Write-Host "WARNING: OCR returned empty text" -ForegroundColor Yellow
}

Step "Running isolated OCR runtime test"
if (Test-Path -LiteralPath $StandaloneRoot) {
  Remove-Item -LiteralPath $StandaloneRoot -Recurse -Force
}
New-Item -ItemType Directory -Force (Join-Path $StandaloneRoot "runtime"), (Join-Path $StandaloneRoot "data") | Out-Null
Copy-Item -LiteralPath $RuntimeDir -Destination (Join-Path $StandaloneRoot "runtime\ocr") -Recurse -Force
Copy-Item -LiteralPath (Split-Path $ConfigPath -Parent) -Destination (Join-Path $StandaloneRoot "data\ocr") -Recurse -Force
$standaloneImage = Join-Path $StandaloneRoot "ocr-test.png"
try {
  New-OcrTestImage $standaloneImage
  Push-Location $StandaloneRoot
  try {
    $standaloneHealthText = node "runtime\ocr\ocr-runner.cjs" --health
    Write-Host $standaloneHealthText
    $standaloneHealth = $standaloneHealthText | ConvertFrom-Json
    if (-not $standaloneHealth.ok) {
      Fail "Standalone OCR health check failed"
    }
    $standaloneOcrText = node "runtime\ocr\ocr-runner.cjs" --image $standaloneImage --lang "eng+chi_sim" --json
    Write-Host $standaloneOcrText
    $standaloneOcr = $standaloneOcrText | ConvertFrom-Json
    if (-not $standaloneOcr.ok) {
      Fail "Standalone OCR engine failed: $($standaloneOcr.message)"
    }
    if ([string]::IsNullOrWhiteSpace($standaloneOcr.text)) {
      Write-Host "WARNING: standalone OCR returned empty text" -ForegroundColor Yellow
    }
  } finally {
    Pop-Location
  }
} finally {
  if (Test-Path -LiteralPath $StandaloneRoot) {
    Remove-Item -LiteralPath $StandaloneRoot -Recurse -Force
  }
}

Step "Checking JavaScript files"
node --check (Join-Path $Root "src\lib\ocr-service.js")
node --check (Join-Path $Root "scripts\dev-api.js")

Step "Running Web build"
$buildLog = "C:\tmp\shared-ocr-build-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
cmd.exe /c "npm run build > `"$buildLog`" 2>&1"
if ($LASTEXITCODE -ne 0) {
  Get-Content -LiteralPath $buildLog -Tail 120 -ErrorAction SilentlyContinue
  Fail "npm run build failed"
}
Write-Host "Build log: $buildLog"

Step "Git status"
git status --short

Write-Host ""
Write-Host "Shared OCR runtime verification completed."
