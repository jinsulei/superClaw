param(
    [string]$IcoPath = "",
    [string]$ExePath = ""
)

# Inspect the repository icon and the current local release executable.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($IcoPath)) { $IcoPath = Join-Path $repoRoot "src-tauri\icons\icon.ico" }
if ([string]::IsNullOrWhiteSpace($ExePath)) { $ExePath = Join-Path $repoRoot "src-tauri\target\release\superclaw.exe" }

Write-Host "=== Checking icon.ico ===" -ForegroundColor Cyan

$bytes = [System.IO.File]::ReadAllBytes($IcoPath)
Write-Host ("File size: " + $bytes.Length + " bytes")
$headerHex = ($bytes[0..5] | ForEach-Object { "{0:X2}" -f $_ }) -join " "
Write-Host ("Header: " + $headerHex)

if ($bytes[0] -eq 0 -and $bytes[1] -eq 0 -and $bytes[2] -eq 1 -and $bytes[3] -eq 0) {
    Write-Host "Format: VALID ICO" -ForegroundColor Green
} elseif ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E) {
    Write-Host "Format: INVALID - this is a PNG file, not ICO!" -ForegroundColor Red
} else {
    Write-Host "Format: UNKNOWN" -ForegroundColor Yellow
}

$count = $bytes[4] + $bytes[5]*256
Write-Host ("Entry count: " + $count)

for ($i = 0; $i -lt $count; $i++) {
    $o = 6 + $i*16
    $w = $bytes[$o]; if ($w -eq 0) { $w = 256 }
    $h = $bytes[$o+1]; if ($h -eq 0) { $h = 256 }
    $colors = $bytes[$o+2]
    $bpp = $bytes[$o+6]
    $sz = $bytes[$o+8] + $bytes[$o+9]*256 + $bytes[$o+10]*65536 + $bytes[$o+11]*16777216
    $offset = $bytes[$o+12] + $bytes[$o+13]*256 + $bytes[$o+14]*65536 + $bytes[$o+15]*16777216

    # Check if this entry uses PNG encoding (modern ICO)
    $entryBytes = $bytes[$offset..($offset+3)]
    $entryHeader = ($entryBytes | ForEach-Object { "{0:X2}" -f $_ }) -join " "
    if ($entryBytes[0] -eq 0x89 -and $entryBytes[1] -eq 0x50) {
        $entryType = "PNG"
    } else {
        $entryType = "BMP"
    }

    Write-Host ("  Entry " + $i + ": " + $w + "x" + $h + " " + $bpp + "bpp colors=" + $colors + " size=" + $sz + " offset=" + $offset + " [" + $entryType + "]")
}

Write-Host ""
Write-Host "=== Checking superclaw.exe ===" -ForegroundColor Cyan

if (Test-Path $ExePath) {
    $exeBytes = [System.IO.File]::ReadAllBytes($ExePath)
    Write-Host ("EXE size: " + $exeBytes.Length + " bytes")

    # Search for ICO magic bytes in the exe (RT_ICON group)
    $icoCount = 0
    $icoOffsets = @()
    for ($i = 0; $i -lt $exeBytes.Length - 4; $i++) {
        if ($exeBytes[$i] -eq 0 -and $exeBytes[$i+1] -eq 0 -and $exeBytes[$i+2] -eq 1 -and $exeBytes[$i+3] -eq 0) {
            # Verify this is an ICO header by checking count bytes
            $cnt = $exeBytes[$i+4] + $exeBytes[$i+5]*256
            if ($cnt -ge 1 -and $cnt -le 10) {
                $icoOffsets += @{offset=$i; count=$cnt}
            }
        }
    }

    if ($icoOffsets.Count -gt 0) {
        Write-Host ("Found " + $icoOffsets.Count + " ICO resource(s) in exe:") -ForegroundColor Green
        foreach ($ico in $icoOffsets) {
            Write-Host ("  Offset: " + $ico.offset + ", Entries: " + $ico.count)
        }
    } else {
        Write-Host "WARNING: No ICO resources found in exe!" -ForegroundColor Red
    }

    # Also look for PNG headers to find embedded icon data
    $pngCount = 0
    for ($i = 0; $i -lt $exeBytes.Length - 4; $i++) {
        if ($exeBytes[$i] -eq 0x89 -and $exeBytes[$i+1] -eq 0x50 -and $exeBytes[$i+2] -eq 0x4E -and $exeBytes[$i+3] -eq 0x47) {
            $pngCount++
        }
    }
    Write-Host ("Embedded PNG images in exe: " + $pngCount)

    # Check PE icon directory group (RT_GROUP_ICON)
    # Look for pattern: FF EE FF EE (group icon header magic in PE resources)
    $grpIconCount = 0
    for ($i = 0; $i -lt $exeBytes.Length - 8; $i++) {
        # RT_GROUP_ICON resource starts with WORD reserved=0, WORD type=1, WORD count
        if ($exeBytes[$i] -eq 0 -and $exeBytes[$i+1] -eq 0 -and $exeBytes[$i+2] -eq 1 -and $exeBytes[$i+3] -eq 0) {
            $cnt = $exeBytes[$i+4] + $exeBytes[$i+5]*256
            if ($cnt -ge 1 -and $cnt -le 10 -and $i -gt 1000) {
                # Double-check this is really in the resource section by looking back for RT_ICON
                Write-Host ("  Group icon at offset " + $i + " with " + $cnt + " entries")
            }
        }
    }
} else {
    Write-Host "EXE not found at: $ExePath" -ForegroundColor Yellow
    Write-Host "Checking alternative paths..."

    $altPaths = @($ExePath)
    foreach ($p in $altPaths) {
        if (Test-Path $p) {
            Write-Host ("Found at: " + $p)
        } else {
            Write-Host ("Not found: " + $p)
        }
    }
}

Write-Host ""
Write-Host "=== Suggestion ===" -ForegroundColor Yellow
Write-Host "If icon.ico is correct but exe still has old icon, try:"
Write-Host "1. cargo clean + rebuild"
Write-Host "2. Check if another icon file is being used as source"
