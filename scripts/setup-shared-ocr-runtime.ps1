$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root "src-tauri\resources\runtime\ocr"
$TessdataDir = Join-Path $RuntimeDir "tessdata"
$ConfigDir = Join-Path $Root "src-tauri\resources\data\ocr"
$ConfigPath = Join-Path $ConfigDir "ocr-config.json"
$Runner = Join-Path $RuntimeDir "ocr-runner.cjs"

function Step([string]$Message) {
  Write-Host ""
  Write-Host "[OCR] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  throw $Message
}

function Assert-FileMinSize([string]$Path, [int64]$MinBytes, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Fail "$Label is missing: $Path"
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt $MinBytes) {
    Fail "$Label is too small: $($item.Length) bytes, expected >= $MinBytes"
  }
  Write-Host "${Label}: $($item.Length) bytes"
}

function Download-Language([string]$Name, [string]$Url, [int64]$MinBytes) {
  $dest = Join-Path $TessdataDir "$Name.traineddata.gz"
  if (Test-Path -LiteralPath $dest -PathType Leaf) {
    Assert-FileMinSize $dest $MinBytes "$Name traineddata"
    return
  }
  $tmp = "$dest.download"
  Write-Host "Downloading $Name from $Url"
  Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing
  Move-Item -LiteralPath $tmp -Destination $dest -Force
  Assert-FileMinSize $dest $MinBytes "$Name traineddata"
}

Step "Preparing directories"
New-Item -ItemType Directory -Force $RuntimeDir, $TessdataDir, $ConfigDir | Out-Null

Step "Checking Node and npm"
node --version
npm --version

Step "Installing local OCR dependency"
if (-not (Test-Path -LiteralPath (Join-Path $RuntimeDir "package.json") -PathType Leaf)) {
  Fail "Missing runtime package.json: $RuntimeDir"
}
Push-Location $RuntimeDir
try {
  if (Test-Path -LiteralPath "package-lock.json" -PathType Leaf) {
    npm ci --omit=dev
  } else {
    npm install --omit=dev
  }
} finally {
  Pop-Location
}

Assert-FileMinSize (Join-Path $RuntimeDir "package-lock.json") 100 "OCR package lock"
Assert-FileMinSize (Join-Path $RuntimeDir "node_modules\tesseract.js\package.json") 100 "tesseract.js package"
Assert-FileMinSize (Join-Path $RuntimeDir "node_modules\tesseract.js-core\package.json") 100 "tesseract.js-core package"
Assert-FileMinSize (Join-Path $RuntimeDir "node_modules\tesseract.js-core\tesseract-core.wasm") 100000 "tesseract wasm"

Step "Downloading real tesseract.js language data"
Download-Language "eng" "https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/eng.traineddata.gz" 512000
Download-Language "chi_sim" "https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/chi_sim.traineddata.gz" 1048576

Step "Checking config and runner"
Assert-FileMinSize $ConfigPath 100 "OCR config"
Assert-FileMinSize $Runner 1000 "OCR runner"
node --check $Runner

Step "Health check"
$healthText = node $Runner --health
Write-Host $healthText
$health = $healthText | ConvertFrom-Json
if (-not $health.ok) {
  Fail "OCR health check failed"
}

Write-Host ""
Write-Host "Shared OCR runtime is ready."
