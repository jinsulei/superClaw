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

# Chinese name for final rename: SuperClaw_闅忚韩鐗?$CN_NAME   = "SuperClaw_" + [char]0x968F + [char]0x8EAB + [char]0x7248
$FINAL_OUT = Join-Path $ROOT $CN_NAME

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

# Clean .openclaw runtime state
@("clawpanel-device-key.json","gateway-owner.json","openclaw.json","openclaw.json.bak","openclaw.json.last-good","update-check.json") | ForEach-Object {
    $f = Join-Path $dstDotOpenclaw $_
    if (Test-Path $f) { Remove-Item -Force $f -ErrorAction SilentlyContinue }
}

# Also clean source portable directory's openclaw.json (if exists from previous development run)
$srcPortable = Join-Path $ROOT "SuperClaw_闅忚韩鐗?
$srcOpenclawJson = Join-Path (Join-Path (Join-Path (Join-Path $srcPortable "resources") "data") ".openclaw") "openclaw.json"
if (Test-Path $srcOpenclawJson) {
    Remove-Item -Force $srcOpenclawJson -ErrorAction SilentlyContinue
    Write-Host "  [CLEANED] source portable openclaw.json (stale absolute paths)"
}

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

# 5. Rename to Chinese name
Write-Host "[5/5] Renaming to Chinese directory name..." -ForegroundColor Yellow
Rename-Item -Path $OUT -NewName $CN_NAME
Write-Host "  [OK] $CN_NAME" -ForegroundColor Green
Write-Host "[DONE]"
Write-Host ""

# Verification
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$totalFiles = (Get-ChildItem -Path $FINAL_OUT -Recurse -File | Measure-Object).Count
Write-Host ("Total files: " + $totalFiles)

$openclawCmd = Join-Path (Join-Path (Join-Path (Join-Path $FINAL_OUT "resources") "runtime") "openclaw") "openclaw.cmd"
$openclawMjs = Join-Path (Join-Path (Join-Path (Join-Path $FINAL_OUT "resources") "runtime") "openclaw") "openclaw.mjs"
$entryJs = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $FINAL_OUT "resources") "runtime") "openclaw") "dist") "entry.js"
$json5Pkg = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $FINAL_OUT "resources") "runtime") "openclaw") "node_modules") "json5\package.json"

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

$dstDist2 = Join-Path (Join-Path (Join-Path (Join-Path $FINAL_OUT "resources") "runtime") "openclaw") "dist"
if (Test-Path $dstDist2) {
    $distCount = (Get-ChildItem -Path $dstDist2 -Recurse -File | Measure-Object).Count
    Write-Host ("  dist/ files: " + $distCount)
}

# Check for hardcoded absolute paths
Write-Host ""
Write-Host "  Scanning for hardcoded paths..." -ForegroundColor Yellow
$hardcoded_batch = @()
$hardcoded_json = @()
$scanPaths = @(
    (Join-Path $FINAL_OUT "openclaw.cmd"),
    $activateBat2
)
foreach ($p in $scanPaths) {
    if (Test-Path $p) {
        $h = Select-String -Path $p -Pattern "C:\\Users" -SimpleMatch -ErrorAction SilentlyContinue
        if ($h) { $hardcoded_batch += $p }
    }
}
# Also scan .json configs in .openclaw/
$dotOpenclawDir = Join-Path (Join-Path (Join-Path (Join-Path $FINAL_OUT "resources") "data") ".openclaw")
if (Test-Path $dotOpenclawDir) {
    $jsonFiles = Get-ChildItem -Path $dotOpenclawDir -Filter "*.json" -Recurse
    foreach ($jf in $jsonFiles) {
        $h = Select-String -Path $jf.FullName -Pattern "C:\\Users" -SimpleMatch -ErrorAction SilentlyContinue
        if ($h) { $hardcoded_json += $jf.FullName }
    }
}
if ($hardcoded_batch) {
    Write-Host "  [ERROR] Hardcoded C:\Users paths found in:" -ForegroundColor Red
    foreach ($f in $hardcoded_batch) { Write-Host "         $f" -ForegroundColor Red }
}
if ($hardcoded_json) {
    Write-Host "  [ERROR] Hardcoded C:\Users paths found in .json configs:" -ForegroundColor Red
    foreach ($f in $hardcoded_json) { Write-Host "         $f" -ForegroundColor Red }
}
if ($hardcoded_batch.Count -eq 0 -and $hardcoded_json.Count -eq 0) {
    Write-Host "  [OK] no hardcoded paths detected" -ForegroundColor Green
}

$sizeInMB = [math]::Round(((Get-ChildItem -Recurse $FINAL_OUT | Measure-Object -Property Length -Sum).Sum) / 1MB, 1)
Write-Host ""
Write-Host "Output: $FINAL_OUT" -ForegroundColor White
Write-Host ("Size:   " + $sizeInMB + " MB") -ForegroundColor White
Write-Host "Time:   $TIMESTAMP" -ForegroundColor White
Write-Host ""
Write-Host "Script fixed: no Chinese chars in batch variables." -ForegroundColor Yellow
Write-Host "The previous bat failure was due to cmd.exe garbling Chinese dir name." -ForegroundColor Yellow
