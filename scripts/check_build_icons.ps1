$base = "c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\src-tauri\target\release\build"

# Find superclaw build out dir
$superclawDirs = Get-ChildItem -Path $base -Directory -Filter "superclaw-*"
foreach ($dir in $superclawDirs) {
    $outDir = Join-Path $dir.FullName "out"
    if (Test-Path $outDir) {
        Write-Host "=== Found: $($dir.Name) ===" -ForegroundColor Cyan
        Get-ChildItem -Path $outDir -Recurse | ForEach-Object {
            Write-Host ("  " + $_.FullName + " (" + $_.Length + " bytes, " + $_.LastWriteTime + ")")
        }
    }
}

# Also check tauri build dirs
$tauriDirs = Get-ChildItem -Path $base -Directory -Filter "tauri-*"
foreach ($dir in $tauriDirs) {
    $outDir = Join-Path $dir.FullName "out"
    if (Test-Path $outDir) {
        Write-Host "=== Found: $($dir.Name) ===" -ForegroundColor Cyan
        Get-ChildItem -Path $outDir -Recurse | ForEach-Object {
            Write-Host ("  " + $_.FullName + " (" + $_.Length + " bytes, " + $_.LastWriteTime + ")")
        }
    }
}

# Find any .rc files in target
$rcFiles = Get-ChildItem -Path "c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\src-tauri\target\release" -Recurse -Filter "*.rc" -ErrorAction SilentlyContinue
if ($rcFiles) {
    Write-Host "=== Found .rc files ===" -ForegroundColor Cyan
    foreach ($rc in $rcFiles) {
        Write-Host ("  " + $rc.FullName + " (" + $rc.Length + " bytes)")
    }
}

# Find any .res files
$resFiles = Get-ChildItem -Path "c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\src-tauri\target\release" -Recurse -Filter "*.res" -ErrorAction SilentlyContinue
if ($resFiles) {
    Write-Host "=== Found .res files ===" -ForegroundColor Cyan
    foreach ($res in $resFiles) {
        Write-Host ("  " + $res.FullName + " (" + $res.Length + " bytes)")
    }
}
