<#
.SYNOPSIS
    SuperClaw Portable Package Builder (fixed version)
.DESCRIPTION
    1. Build frontend + Rust backend (optional, skipped if binary already exists)
    2. Create SuperClaw_SuiShenBan/ directory (ASCII-safe, renamed at end)
    3. Copy all dependencies to resources/ subdirectories
    4. Output portable package to project root
#>

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$OUT  = Join-Path $ROOT "SuperClaw_SuiShenBan"  # ASCII-safe intermediate name
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Final directory name (ASCII-safe, no Chinese chars to avoid encoding issues)
$FINAL_OUT = $OUT

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SuperClaw Portable Package Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$EXE_SRC = Join-Path $ROOT "src-tauri\target\release\superclaw.exe"

# Verify binary exists (must be built first with: npm run build && cd src-tauri && cargo build --release)
if (-not (Test-Path $EXE_SRC)) {
    Write-Host "[1/4] Building (frontend + Rust backend)..." -ForegroundColor Yellow
    Set-Location $ROOT
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Frontend build failed!" -ForegroundColor Red
        exit 1
    }
    Set-Location (Join-Path $ROOT "src-tauri")
    cargo build --release
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Rust build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "[DONE] Build successful" -ForegroundColor Green
} else {
    Write-Host "[1/4] superclaw.exe already exists, skipping build" -ForegroundColor Yellow
}
Write-Host ""

# 2. Clean old portable directory
Write-Host "[2/4] Cleaning old portable directories..." -ForegroundColor Yellow
if (Test-Path $OUT) {
    Remove-Item -Recurse -Force $OUT -ErrorAction SilentlyContinue
}
if (Test-Path $FINAL_OUT) {
    Remove-Item -Recurse -Force $FINAL_OUT -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $OUT -Force | Out-Null
Write-Host "[DONE]"
Write-Host ""

# 3. Copy components
Write-Host "[3/4] Copying components..." -ForegroundColor Yellow

# bin/
$dstBin = Join-Path (Join-Path $OUT "resources") "bin"
New-Item -ItemType Directory -Path $dstBin -Force | Out-Null
Copy-Item -Recurse -Path (Join-Path $ROOT "bin\*") -Destination $dstBin
Write-Host "  [OK] bin/"

# uv-tools/
$dstUvTools = Join-Path (Join-Path $OUT "resources") "uv-tools"
New-Item -ItemType Directory -Path $dstUvTools -Force | Out-Null
Copy-Item -Recurse -Path (Join-Path $ROOT "uv-tools\*") -Destination $dstUvTools
Write-Host "  [OK] uv-tools/"

# uv-python/
$srcUvPython = Join-Path $ROOT "uv-python"
if (Test-Path $srcUvPython) {
    $dstUvPython = Join-Path (Join-Path $OUT "resources") "uv-python"
    New-Item -ItemType Directory -Path $dstUvPython -Force | Out-Null
    Copy-Item -Recurse -Path "$srcUvPython\*" -Destination $dstUvPython
    Write-Host "  [OK] uv-python/"
} else {
    Write-Host "  [SKIP] uv-python/ not found"
}

# data/
$dstData = Join-Path (Join-Path $OUT "resources") "data"
New-Item -ItemType Directory -Path $dstData -Force | Out-Null
Copy-Item -Recurse -Path (Join-Path $ROOT "data\*") -Destination $dstData
Write-Host "  [OK] data/"

# OpenClaw runtime
$srcOpenclaw = Join-Path $ROOT "src-tauri\resources\runtime\openclaw"
$dstOpenclaw = Join-Path (Join-Path (Join-Path $OUT "resources") "runtime") "openclaw"
New-Item -ItemType Directory -Path $dstOpenclaw -Force | Out-Null

# Copy root files only
Get-ChildItem -Path $srcOpenclaw -File | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $dstOpenclaw $_.Name) -Force
}

# Copy dist/ recursively
$srcDist = Join-Path $srcOpenclaw "dist"
$dstDist = Join-Path $dstOpenclaw "dist"
if (Test-Path $srcDist) {
    New-Item -ItemType Directory -Path $dstDist -Force | Out-Null
    Copy-Item -Recurse -Path "$srcDist\*" -Destination $dstDist
}

# Copy node_modules/ recursively
$srcNm = Join-Path $srcOpenclaw "node_modules"
$dstNm = Join-Path $dstOpenclaw "node_modules"
if (Test-Path $srcNm) {
    New-Item -ItemType Directory -Path $dstNm -Force | Out-Null
    Copy-Item -Recurse -Path "$srcNm\*" -Destination $dstNm
}

# Copy scripts/, skills/, docs/
@("scripts","skills","docs") | ForEach-Object {
    $srcDir = Join-Path $srcOpenclaw $_
    $dstDir = Join-Path $dstOpenclaw $_
    if (Test-Path $srcDir) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
        Copy-Item -Recurse -Path "$srcDir\*" -Destination $dstDir
    }
}
Write-Host "  [OK] resources/runtime/openclaw/"

# .openclaw config
$dstDotOpenclaw = Join-Path (Join-Path (Join-Path $OUT "resources") "data") ".openclaw"
New-Item -ItemType Directory -Path $dstDotOpenclaw -Force | Out-Null
$jsonSrc = Join-Path $ROOT "src-tauri\resources\data\.openclaw\clawpanel.json"
if (Test-Path $jsonSrc) {
    Copy-Item -Path $jsonSrc -Destination (Join-Path $dstDotOpenclaw "clawpanel.json")
    Write-Host "  [OK] .openclaw/"
}

# Clean runtime artifacts
Write-Host ""
Write-Host "  Cleaning runtime artifacts for portability..." -ForegroundColor Yellow

$hermesData = Join-Path (Join-Path (Join-Path $OUT "resources") "data") "hermes"

@("sessions","logs","audio_cache","image_cache","memories","pairing","skills","cron","hooks") | ForEach-Object {
    $d = Join-Path $hermesData $_
    if (Test-Path $d) { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }
}

@("gateway.lock","gateway.pid","gateway_state.json","gateway-run.log","auth.lock",".skills_prompt_snapshot.json") | ForEach-Object {
    $f = Join-Path $hermesData $_
    if (Test-Path $f) { Remove-Item -Force $f -ErrorAction SilentlyContinue }
}

# Clean .openclaw runtime state (prevent stale absolute paths from being packaged)
@("clawpanel-device-key.json","gateway-owner.json","openclaw.json.bak","openclaw.json.last-good","update-check.json") | ForEach-Object {
    $f = Join-Path $dstDotOpenclaw $_
    if (Test-Path $f) { Remove-Item -Force $f -ErrorAction SilentlyContinue }
}

# NOTE: openclaw.json is deliberately NOT copied into the portable package.
# The Gateway will read it from OPENCLAW_HOME (set by Rust at runtime),
# and the Rust service layer auto-fixes the workspace path before startup.
# This ensures each machine uses its own correct absolute paths.

@("agents","canvas","devices","identity","logs","tasks","workspace") | ForEach-Object {
    $d = Join-Path $dstDotOpenclaw $_
    if (Test-Path $d) { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }
}

Write-Host "  [OK] cleaned runtime artifacts for portability"

# Fix hardcoded paths in uv-tools virtualenv
Write-Host ""
Write-Host "  Fixing hardcoded paths in uv-tools virtualenv..." -ForegroundColor Yellow
$activateBat = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $OUT "resources") "uv-tools") "hermes-agent") "Scripts") "activate.bat"
$pyvenvCfg = Join-Path (Join-Path (Join-Path (Join-Path $OUT "resources") "uv-tools") "hermes-agent") "pyvenv.cfg"
if (Test-Path $activateBat) {
    (Get-Content $activateBat) -replace 'C:\\Users\\.*?hermes-agent', '%%~dp0..' | Set-Content $activateBat
}
if (Test-Path $pyvenvCfg) {
    (Get-Content $pyvenvCfg) -replace 'home = C:\\.*', 'home = ..\..\..\uv-python\python' | Set-Content $pyvenvCfg
}
Write-Host "  [OK] fixed uv-tools virtualenv paths"

Write-Host "[DONE]"
Write-Host ""

# 4. Copy main executable
Write-Host "[4/4] Copying superclaw.exe..." -ForegroundColor Yellow
$exeDst = Join-Path $OUT "superclaw.exe"
if (Test-Path $EXE_SRC) {
    Copy-Item -Path $EXE_SRC -Destination $exeDst
    Write-Host "  [OK] superclaw.exe" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] superclaw.exe not found!" -ForegroundColor Red
    exit 1
}
Write-Host "[DONE]"
Write-Host ""

# Verification
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$totalFiles = (Get-ChildItem -Path $FINAL_OUT -Recurse -File | Measure-Object).Count
Write-Host ("Total files: " + $totalFiles)

$openclawDir = $FINAL_OUT + "\resources\runtime\openclaw"
$openclawCmd = $openclawDir + "\openclaw.cmd"
$openclawMjs = $openclawDir + "\openclaw.mjs"
$entryJs = $openclawDir + "\dist\entry.js"
$json5Pkg = $openclawDir + "\node_modules\json5\package.json"

if (Test-Path $openclawCmd) { Write-Host "  [OK] openclaw.cmd" } else { Write-Host "  [MISSING] openclaw.cmd!" -ForegroundColor Red }
if (Test-Path $openclawMjs) { Write-Host "  [OK] openclaw.mjs" } else { Write-Host "  [MISSING] openclaw.mjs!" -ForegroundColor Red }
if (Test-Path $entryJs) { Write-Host "  [OK] dist/entry.js" } else { Write-Host "  [MISSING] dist/entry.js!" -ForegroundColor Red }
if (Test-Path (Join-Path $FINAL_OUT "superclaw.exe")) {
    $size = (Get-Item (Join-Path $FINAL_OUT "superclaw.exe")).Length
    Write-Host ("  [OK] superclaw.exe (" + $size + " bytes)")
} else {
    Write-Host "  [MISSING] superclaw.exe!" -ForegroundColor Red
}
if (Test-Path $json5Pkg) {
    Write-Host "  [OK] node_modules/json5/"
} else {
    Write-Host "  [WARN] node_modules/json5/ missing" -ForegroundColor Red
}

$dstDist2 = $openclawDir + "\dist"
if (Test-Path $dstDist2) {
    $distCount = (Get-ChildItem -Path $dstDist2 -Recurse -File | Measure-Object).Count
    Write-Host ("  dist/ files: " + $distCount)
}

# Check for hardcoded absolute paths
Write-Host ""
Write-Host "  Scanning for hardcoded paths..." -ForegroundColor Yellow
$hardcoded_found = $false
$scanPaths = @(
    $openclawCmd,
    ($FINAL_OUT + "\resources\uv-tools\hermes-agent\Scripts\activate.bat")
)
foreach ($p in $scanPaths) {
    if (Test-Path $p) {
        $h = Select-String -Path $p -Pattern "C:\\Users" -SimpleMatch -ErrorAction SilentlyContinue
        if ($h) { $hardcoded_found = $true; Write-Host "  [ERROR] Hardcoded path in: $p" -ForegroundColor Red }
    }
}
# Also scan .json configs in .openclaw/ for stale absolute paths
$dotOpenclawDir = $FINAL_OUT + "\resources\data\.openclaw"
if (Test-Path $dotOpenclawDir) {
    $jsonFiles = Get-ChildItem -Path $dotOpenclawDir -Filter "*.json" -Recurse
    foreach ($jf in $jsonFiles) {
        $h = Select-String -Path $jf.FullName -Pattern "C:\\Users" -SimpleMatch -ErrorAction SilentlyContinue
        if ($h) { $hardcoded_found = $true; Write-Host "  [ERROR] Hardcoded path in: $($jf.FullName)" -ForegroundColor Red }
    }
}
if (-not $hardcoded_found) {
    Write-Host "  [OK] no hardcoded paths detected" -ForegroundColor Green
}

$sizeInMB = [math]::Round(((Get-ChildItem -Recurse $FINAL_OUT | Measure-Object -Property Length -Sum).Sum) / 1MB, 1)
Write-Host ""
Write-Host "Output: $FINAL_OUT" -ForegroundColor White
Write-Host ("Size:   " + $sizeInMB + " MB") -ForegroundColor White
Write-Host "Time:   $TIMESTAMP" -ForegroundColor White
Write-Host ""
Write-Host "Package complete." -ForegroundColor Yellow
