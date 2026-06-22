param(
  [string]$ProjectRoot = "",
  [string]$OutputManifest = "",
  [string]$VerifyManifest = "",
  [switch]$RequireComplete,
  [switch]$IncludeOptional,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  if (-not $Quiet) {
    Write-Host $Message
  }
}

function Resolve-GreenProjectRoot {
  param([string]$InputRoot)

  if ($InputRoot -and $InputRoot.Trim()) {
    return (Resolve-Path -LiteralPath $InputRoot).Path
  }

  $gitRoot = git rev-parse --show-toplevel 2>$null
  if ($LASTEXITCODE -eq 0 -and $gitRoot) {
    return (Resolve-Path -LiteralPath $gitRoot.Trim()).Path
  }

  return (Get-Location).Path
}

function Get-RelativePathSafe {
  param(
    [string]$BasePath,
    [string]$FullPath
  )

  $baseFull = [System.IO.Path]::GetFullPath($BasePath).TrimEnd("\", "/")
  $targetFull = [System.IO.Path]::GetFullPath($FullPath)
  $baseUri = [System.Uri]::new($baseFull + [System.IO.Path]::DirectorySeparatorChar)
  $targetUri = [System.Uri]::new($targetFull)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace("/", [System.IO.Path]::DirectorySeparatorChar)
}

function Get-FileSha256 {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return ""
  }

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-DirectoryFileEntries {
  param(
    [string]$RootPath,
    [string]$BasePath
  )

  if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) {
    return @()
  }

  $files = Get-ChildItem -LiteralPath $RootPath -Recurse -Force -File -ErrorAction SilentlyContinue |
    Sort-Object FullName
  $entries = @()

  foreach ($file in $files) {
    $relative = (Get-RelativePathSafe -BasePath $BasePath -FullPath $file.FullName).Replace("\", "/")
    $entries += [ordered]@{
      path = $relative
      size = [int64]$file.Length
      sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      modifiedUtc = $file.LastWriteTimeUtc.ToString("o")
    }
  }

  return $entries
}

function Get-DirectoryDigest {
  param([object[]]$Entries)

  if (-not $Entries -or $Entries.Count -eq 0) {
    return ""
  }

  $lines = foreach ($entry in $Entries) {
    "$($entry.path)|$($entry.size)|$($entry.sha256)"
  }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
  $sha = [System.Security.Cryptography.SHA256]::Create()

  try {
    return ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace "-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-TextRiskHits {
  param(
    [string]$Path,
    [string]$BasePath
  )

  $hits = @()
  if (-not (Test-Path -LiteralPath $Path)) {
    return $hits
  }

  $rootItem = Get-Item -LiteralPath $Path -Force
  if ($rootItem.PSIsContainer) {
    $files = Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue
  } else {
    $files = @($rootItem)
  }

  $patterns = @(
    "124.222.21.44",
    "VITE_MINIMAX_API_KEY",
    "sk-[A-Za-z0-9_\-]{20,}",
    "Bearer\s+[A-Za-z0-9_\-]{20,}",
    "MINIMAX_API_KEY\s*=\s*[^#\s].+"
  )
  $textExts = @(".js", ".json", ".txt", ".md", ".yml", ".yaml", ".toml", ".ps1", ".cmd", ".bat", ".html", ".css", ".rs", ".env")

  foreach ($file in $files) {
    if ($file.Length -gt 2MB) {
      continue
    }

    $ext = [System.IO.Path]::GetExtension($file.Name).ToLowerInvariant()
    if ($textExts -notcontains $ext) {
      continue
    }

    foreach ($pattern in $patterns) {
      $matches = Select-String -LiteralPath $file.FullName -Pattern $pattern -CaseSensitive:$false -ErrorAction SilentlyContinue
      foreach ($match in $matches) {
        $hits += [ordered]@{
          path = (Get-RelativePathSafe -BasePath $BasePath -FullPath $file.FullName).Replace("\", "/")
          line = $match.LineNumber
          pattern = $pattern
          text = $match.Line.Trim()
        }
      }
    }
  }

  return $hits
}

$ProjectRootResolved = Resolve-GreenProjectRoot $ProjectRoot
Set-Location $ProjectRootResolved

if (-not $OutputManifest -or -not $OutputManifest.Trim()) {
  New-Item -ItemType Directory -Force C:\tmp | Out-Null
  $OutputManifest = "C:\tmp\green-runtime-manifest-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
}

$runtimeItems = @(
  [ordered]@{ id = "openclaw_launcher"; label = "OpenClaw launcher"; path = "src-tauri/resources/runtime/openclaw/openclaw.cmd"; type = "file"; required = $true },
  [ordered]@{ id = "openclaw_node"; label = "OpenClaw bundled node.exe"; path = "src-tauri/resources/runtime/openclaw/node.exe"; type = "file"; required = $true },
  [ordered]@{ id = "openclaw_runtime_dir"; label = "OpenClaw runtime directory"; path = "src-tauri/resources/runtime/openclaw"; type = "dir"; required = $true },
  [ordered]@{ id = "hermes_runtime"; label = "Hermes runtime directory"; path = "src-tauri/resources/runtime/hermes"; type = "dir"; required = $true },
  [ordered]@{ id = "hermes_agent"; label = "Hermes agent directory"; path = "src-tauri/resources/runtime/hermes-agent"; type = "dir"; required = $true },
  [ordered]@{ id = "uv_tools"; label = "uv tools"; path = "src-tauri/resources/runtime/uv-tools"; type = "dir"; required = $true },
  [ordered]@{ id = "uv_python"; label = "uv python"; path = "src-tauri/resources/runtime/uv-python"; type = "dir"; required = $true },
  [ordered]@{ id = "claude_panel_server"; label = "Claude panel server"; path = "src-tauri/resources/runtime/claude-panel/server.js"; type = "file"; required = $true },
  [ordered]@{ id = "claude_panel_app"; label = "Claude panel app"; path = "src-tauri/resources/runtime/claude-panel/public/app.js"; type = "file"; required = $true },
  [ordered]@{ id = "ocr_runner"; label = "OCR runner optional"; path = "src-tauri/resources/runtime/ocr/ocr-runner.cjs"; type = "file"; required = $false },
  [ordered]@{ id = "ocr_config"; label = "OCR config optional"; path = "src-tauri/resources/data/ocr/ocr-config.json"; type = "file"; required = $false }
)

$entries = @()
$missingRequired = @()
$riskHits = @()

foreach ($item in $runtimeItems) {
  if (-not $item.required -and -not $IncludeOptional) {
    continue
  }

  $absolute = Join-Path $ProjectRootResolved $item.path
  $exists = Test-Path -LiteralPath $absolute
  $actualType = ""
  $size = $null
  $sha256 = ""
  $fileCount = 0
  $totalSize = [int64]0
  $directoryDigest = ""
  $files = @()

  if ($exists) {
    $obj = Get-Item -LiteralPath $absolute -Force
    $actualType = if ($obj.PSIsContainer) { "dir" } else { "file" }

    if ($actualType -eq "file") {
      $size = [int64]$obj.Length
      $sha256 = Get-FileSha256 $absolute
      $fileCount = 1
      $totalSize = [int64]$obj.Length
    } else {
      $files = Get-DirectoryFileEntries -RootPath $absolute -BasePath $ProjectRootResolved
      $fileCount = $files.Count
      foreach ($fileEntry in $files) {
        $totalSize += [int64]$fileEntry.size
      }
      $directoryDigest = Get-DirectoryDigest $files
    }

    foreach ($hit in (Get-TextRiskHits -Path $absolute -BasePath $ProjectRootResolved)) {
      $riskHits += $hit
    }
  }

  if ($item.required -and -not $exists) {
    $missingRequired += $item.path
  }

  $entries += [ordered]@{
    id = $item.id
    label = $item.label
    required = [bool]$item.required
    path = $item.path
    expectedType = $item.type
    exists = [bool]$exists
    actualType = $actualType
    size = $size
    sha256 = $sha256
    fileCount = $fileCount
    totalSize = $totalSize
    directoryDigest = $directoryDigest
    files = $files
  }
}

$manifest = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToString("o")
  projectRoot = $ProjectRootResolved
  head = (git log --oneline -n 1 2>$null)
  branch = (git branch --show-current 2>$null)
  policy = [ordered]@{
    noOldPackageCopy = $true
    noFakeRuntime = $true
    requireSha256ForFiles = $true
    requireDirectoryDigestForDirectories = $true
    failIfRequiredMissing = [bool]$RequireComplete
  }
  runtime = $entries
  missingRequired = $missingRequired
  riskHits = $riskHits
}

$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $OutputManifest -Encoding UTF8
Write-Info "Manifest written: $OutputManifest"

if ($riskHits.Count -gt 0) {
  Write-Info "Risk hits found: $($riskHits.Count)"
}

if ($VerifyManifest -and $VerifyManifest.Trim()) {
  if (-not (Test-Path -LiteralPath $VerifyManifest -PathType Leaf)) {
    throw "Verify manifest not found: $VerifyManifest"
  }

  $baseline = Get-Content -LiteralPath $VerifyManifest -Raw -Encoding UTF8 | ConvertFrom-Json
  $mismatches = @()

  foreach ($baseItem in $baseline.runtime) {
    $current = $entries | Where-Object { $_.id -eq $baseItem.id } | Select-Object -First 1
    if (-not $current) {
      $mismatches += "Missing current item: $($baseItem.id)"
      continue
    }

    if ([bool]$baseItem.required -and -not [bool]$current.exists) {
      $mismatches += "Required missing: $($baseItem.id)"
      continue
    }

    if ($baseItem.actualType -eq "file" -and $baseItem.sha256 -and ($current.sha256 -ne $baseItem.sha256)) {
      $mismatches += "SHA mismatch: $($baseItem.id)"
    }

    if ($baseItem.actualType -eq "dir" -and $baseItem.directoryDigest -and ($current.directoryDigest -ne $baseItem.directoryDigest)) {
      $mismatches += "Directory digest mismatch: $($baseItem.id)"
    }
  }

  if ($mismatches.Count -gt 0) {
    Write-Info "Manifest verification failed:"
    foreach ($mismatch in $mismatches) {
      Write-Info " - $mismatch"
    }
    exit 2
  }

  Write-Info "Manifest verification passed."
}

if ($RequireComplete -and $missingRequired.Count -gt 0) {
  Write-Info "Missing required runtime:"
  foreach ($missing in $missingRequired) {
    Write-Info " - $missing"
  }
  exit 3
}

if ($riskHits.Count -gt 0) {
  Write-Info "Runtime risk hits:"
  foreach ($hit in $riskHits) {
    Write-Info " - $($hit.path):$($hit.line) $($hit.pattern)"
  }
  exit 4
}

exit 0
