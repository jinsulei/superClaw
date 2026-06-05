$base = "c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\src-tauri\target\release\build"

Write-Host "=== Checking superclaw build out directories ===" -ForegroundColor Cyan

$dirs = Get-ChildItem -Path $base -Directory -Filter "superclaw-*" | Sort-Object LastWriteTime -Descending

foreach ($d in $dirs) {
    Write-Host ""
    Write-Host ("Directory: " + $d.Name) -ForegroundColor Yellow
    Write-Host ("Last modified: " + $d.LastWriteTime)

    $rcFile = Join-Path $d.FullName "out\resource.rc"
    if (Test-Path $rcFile) {
        $rcInfo = Get-Item $rcFile
        Write-Host ("  resource.rc: " + $rcInfo.LastWriteTime + " (" + $rcInfo.Length + " bytes)")
    }

    $icoFiles = Get-ChildItem -Path (Join-Path $d.FullName "out") -Recurse -Filter "*.ico" -ErrorAction SilentlyContinue
    foreach ($ico in $icoFiles) {
        Write-Host ("  ICO: " + $ico.Name + " " + $ico.Length + " bytes " + $ico.LastWriteTime)
        # Check header of the ico file
        $bytes = [System.IO.File]::ReadAllBytes($ico.FullName)
        $header = ($bytes[0..5] | ForEach-Object { "{0:X2}" -f $_ }) -join " "
        $count = $bytes[4] + $bytes[5]*256
        Write-Host ("    Header: " + $header + " Count: " + $count + " Total: " + $bytes.Length + " bytes")
    }

    $pngFiles = Get-ChildItem -Path (Join-Path $d.FullName "out") -Recurse -Filter "*.png" -ErrorAction SilentlyContinue
    foreach ($png in $pngFiles) {
        Write-Host ("  PNG: " + $png.Name + " " + $png.Length + " bytes " + $png.LastWriteTime)
    }
}

Write-Host ""
Write-Host "=== Checking if icon.ico was properly embedded ===" -ForegroundColor Cyan

$exePath = "c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\src-tauri\target\release\superclaw.exe"
$exeInfo = Get-Item $exePath
Write-Host ("EXE: " + $exeInfo.LastWriteTime + " (" + $exeInfo.Length + " bytes)")

# Search for the icon.ico content inside the exe
$exeBytes = [System.IO.File]::ReadAllBytes($exePath)
$icoBytes = [System.IO.File]::ReadAllBytes("c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\src-tauri\icons\icon.ico")

# Look for the signature of the 32x32 icon entry in the exe
Write-Host ("Source icon.ico size: " + $icoBytes.Length + " bytes")
Write-Host ("EXE size: " + $exeBytes.Length + " bytes")

# Check if the icon.ico data appears in the exe
$found = $false
for ($i = 0; $i -le $exeBytes.Length - $icoBytes.Length; $i++) {
    $match = $true
    # Check first 16 bytes
    for ($j = 0; $j -lt 16; $j++) {
        if ($exeBytes[$i + $j] -ne $icoBytes[$j]) {
            $match = $false
            break
        }
    }
    if ($match) {
        Write-Host ("Found icon.ico header at exe offset: " + $i) -ForegroundColor Green
        $found = $true
        break
    }
}

if (-not $found) {
    Write-Host "WARNING: icon.ico header NOT found in exe!" -ForegroundColor Red
    Write-Host "The exe may contain an older cached icon." -ForegroundColor Red

    # Look for old icon.ico (original was 116608 bytes with PNG header)
    for ($i = 0; $i -le $exeBytes.Length - 8; $i++) {
        # PNG header: 89 50 4E 47
        if ($exeBytes[$i] -eq 0x89 -and $exeBytes[$i+1] -eq 0x50 -and $exeBytes[$i+2] -eq 0x4E -and $exeBytes[$i+3] -eq 0x47) {
            Write-Host ("Found PNG header at exe offset: " + $i) -ForegroundColor Yellow
        }
    }
}
