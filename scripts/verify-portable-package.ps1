param(
  [string]$PackageRoot = "",
  [switch]$WriteManifest,
  [switch]$RequireFresh,
  [switch]$SkipBootCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($PackageRoot)) {
  $PackageRoot = Join-Path $RepoRoot "..\SuperClaw_Desktop_Client"
}
$PackageRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PackageRoot)
$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$checked = New-Object System.Collections.Generic.List[object]

function Add-Error([string]$message) { $errors.Add($message) | Out-Null; Write-Host "[ERROR] $message" -ForegroundColor Red }
function Add-Warning([string]$message) { $warnings.Add($message) | Out-Null; Write-Host "[WARN]  $message" -ForegroundColor Yellow }
function Add-Ok([string]$message) { Write-Host "[OK]    $message" -ForegroundColor Green }

function Get-Sha256([string]$path) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-PortableRelativePath([string]$basePath, [string]$targetPath) {
  $base = (Resolve-Path -LiteralPath $basePath).Path.TrimEnd([char[]]@([char]92, [char]47)) + [System.IO.Path]::DirectorySeparatorChar
  $target = (Resolve-Path -LiteralPath $targetPath).Path
  $baseUri = New-Object System.Uri($base)
  $targetUri = New-Object System.Uri($target)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('\\', '/')
}

function Assert-File([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-Error "$label is missing: $path"
    return $false
  }
  return $true
}

function Compare-File([string]$source, [string]$package, [string]$label) {
  if (-not (Assert-File $source "Source $label") -or -not (Assert-File $package "Packaged $label")) { return }
  $sourceHash = Get-Sha256 $source
  $packageHash = Get-Sha256 $package
  $checked.Add([pscustomobject]@{ label = $label; source = $source; package = $package; sha256 = $packageHash }) | Out-Null
  if ($sourceHash -ne $packageHash) {
    Add-Error "$label differs from its packaged copy"
  } else {
    Add-Ok "$label hash matches"
  }
}

function Compare-Tree([string]$sourceRoot, [string]$packageRoot, [string]$label) {
  if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) { Add-Error "Source $label directory is missing: $sourceRoot"; return }
  if (-not (Test-Path -LiteralPath $packageRoot -PathType Container)) { Add-Error "Packaged $label directory is missing: $packageRoot"; return }
  $sourceFiles = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Sort-Object FullName)
  foreach ($sourceFile in $sourceFiles) {
    $relative = $sourceFile.FullName.Substring($sourceRoot.Length).TrimStart([char[]]@([char]92, [char]47))
    Compare-File $sourceFile.FullName (Join-Path $packageRoot $relative) "$label/$relative"
  }
}

function Get-JsonVersion([string]$path, [string]$property) {
  try { return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json).$property } catch { return $null }
}

Write-Host "SuperClaw portable package consistency check"
Write-Host "Source:  $RepoRoot"
Write-Host "Package: $PackageRoot"

$packageExe = Join-Path $PackageRoot "superclaw.exe"
$resources = Join-Path $PackageRoot "resources"
if (-not (Assert-File $packageExe "Packaged executable") -or -not (Test-Path -LiteralPath $resources -PathType Container)) {
  exit 2
}

$sourceExe = Join-Path $RepoRoot "src-tauri\target\release\superclaw.exe"
if (Test-Path -LiteralPath $sourceExe -PathType Leaf) {
  Compare-File $sourceExe $packageExe "desktop executable"
} else {
  Add-Warning "Release executable is not present, so EXE hash parity could not be checked"
}

$packageVersion = Get-JsonVersion (Join-Path $RepoRoot "package.json") "version"
$tauriVersion = Get-JsonVersion (Join-Path $RepoRoot "src-tauri\tauri.conf.json") "version"
$cargoVersion = (Select-String -LiteralPath (Join-Path $RepoRoot "src-tauri\Cargo.toml") -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1).Matches.Groups[1].Value
if (-not $packageVersion -or $packageVersion -ne $tauriVersion -or $packageVersion -ne $cargoVersion) {
  Add-Error "Version fields are not aligned (package=$packageVersion, tauri=$tauriVersion, cargo=$cargoVersion)"
} else {
  Add-Ok "Version fields are aligned at $packageVersion"
}

Compare-File (Join-Path $RepoRoot "src-tauri\resources\runtime\openclaw\openclaw.cmd") (Join-Path $resources "runtime\openclaw\openclaw.cmd") "OpenClaw launcher"
Compare-File (Join-Path $RepoRoot "src-tauri\resources\runtime\ocr\ocr-runner.cjs") (Join-Path $resources "runtime\ocr\ocr-runner.cjs") "shared OCR runner"
Compare-File (Join-Path $RepoRoot "src-tauri\resources\data\ocr\ocr-config.json") (Join-Path $resources "data\ocr\ocr-config.json") "shared OCR config"
Compare-File (Join-Path $RepoRoot "src-tauri\resources\runtime\claude-panel\server.js") (Join-Path $resources "runtime\claude-panel\server.js") "Claude panel server"
Compare-File (Join-Path $RepoRoot "src-tauri\resources\runtime\claude-panel\local-desktop-mcp.js") (Join-Path $resources "runtime\claude-panel\local-desktop-mcp.js") "Claude desktop MCP"
Compare-File (Join-Path $RepoRoot "src-tauri\resources\runtime\document-tools\hermes_document_tool.py") (Join-Path $resources "runtime\document-tools\hermes_document_tool.py") "Shared document service"
Compare-File (Join-Path $RepoRoot "src-tauri\resources\runtime\document-tools\superclaw-file.cmd") (Join-Path $resources "runtime\document-tools\superclaw-file.cmd") "Shared document CLI"
Compare-Tree (Join-Path $RepoRoot "src-tauri\resources\templates\openclaw-plugins\superclaw-media") (Join-Path $resources "runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions\superclaw-media") "OpenClaw media plugin"
foreach ($plugin in @("skill-manager", "desktop-control", "superclaw-ocr")) {
  Compare-Tree (Join-Path $RepoRoot "src-tauri\resources\runtime\openclaw\dist\extensions\$plugin") (Join-Path $resources "runtime\openclaw\node_modules\@qingchencloud\openclaw-zh\dist\extensions\$plugin") "OpenClaw $plugin plugin"
}

foreach ($required in @(
  "runtime\hermes.cmd",
  "runtime\hermes-agent\Scripts\hermes.exe",
  "runtime\document-tools\hermes_document_tool.py",
  "runtime\document-tools\superclaw-file.cmd",
  "runtime\ocr\tessdata\eng.traineddata.gz",
  "runtime\ocr\tessdata\chi_sim.traineddata.gz",
  "runtime\openclaw\node.exe",
  "runtime\openclaw\node_modules\mmx-cli\dist\mmx.mjs",
  "data\hermes\SOUL.md",
  "data\.openclaw\openclaw.json"
)) {
  $null = Assert-File (Join-Path $resources $required) "Required portable resource"
}

# Runtime-generated state files that the app regenerates on every boot with the
# package's own resolved path (e.g. the Hermes native-terminal launcher, gateway
# pid/state). build-desktop-client.ps1 removes these before delivery; they are NOT
# packaged resources. They must not trip the source-machine path scan, which would
# otherwise false-positive after any app boot (including the boot check below).
$runtimeStateNames = @(
  'gateway.lock', 'gateway.pid', 'gateway_state.json', 'gateway-run.log',
  'hermes-native-terminal.cmd', 'kanban.db.init.lock', 'auth.lock', 'auth.json',
  '.skills_prompt_snapshot.json', '.tirith-install-failed', 'channel_directory.json'
)
$repoNeedle = [Regex]::Escape($RepoRoot.Replace('\\', '/'))
$currentUserProfileNeedle = if ($env:USERPROFILE) { [Regex]::Escape($env:USERPROFILE.Replace('\\', '/')) } else { $null }
$textExtensions = @('.cmd', '.bat', '.ps1', '.json', '.yaml', '.yml', '.toml')
$hardcodedFiles = @(Get-ChildItem -LiteralPath $resources -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $textExtensions -contains $_.Extension.ToLowerInvariant() })
foreach ($file in $hardcodedFiles) {
  if ($file.Length -gt 5MB) { continue }
  if ($runtimeStateNames -contains $file.Name) { continue }
  try {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $portableContent = $content.Replace('\\', '/')
    if ($portableContent -match $repoNeedle) { Add-Error "Packaged resource contains the source-machine repository path: $($file.FullName)" }
    if ($currentUserProfileNeedle -and $portableContent -match $currentUserProfileNeedle) { Add-Error "Packaged resource contains the source-machine user path: $($file.FullName)" }
  } catch {}
}

$exeTime = (Get-Item -LiteralPath $packageExe).LastWriteTimeUtc
$freshInputs = @(
  (Join-Path $RepoRoot "dist"),
  (Join-Path $RepoRoot "src-tauri\src"),
  (Join-Path $RepoRoot "src-tauri\tauri.conf.json"),
  (Join-Path $RepoRoot "package.json"),
  (Join-Path $RepoRoot "scripts\build-desktop-client.ps1"),
  (Join-Path $RepoRoot "src-tauri\resources\runtime\ocr\ocr-runner.cjs"),
  (Join-Path $RepoRoot "src-tauri\resources\data\ocr\ocr-config.json"),
  (Join-Path $RepoRoot "src-tauri\resources\runtime\claude-panel\server.js"),
  (Join-Path $RepoRoot "src-tauri\resources\runtime\claude-panel\local-desktop-mcp.js"),
  (Join-Path $RepoRoot "src-tauri\resources\runtime\document-tools"),
  (Join-Path $RepoRoot "src-tauri\resources\templates\openclaw-plugins\superclaw-media"),
  (Join-Path $RepoRoot "src-tauri\resources\runtime\openclaw\dist\extensions\skill-manager"),
  (Join-Path $RepoRoot "src-tauri\resources\runtime\openclaw\dist\extensions\desktop-control"),
  (Join-Path $RepoRoot "src-tauri\resources\runtime\openclaw\dist\extensions\superclaw-ocr")
)
$newerInputs = @()
foreach ($input in $freshInputs) {
  if (Test-Path -LiteralPath $input -PathType Leaf) {
    if ((Get-Item -LiteralPath $input).LastWriteTimeUtc -gt $exeTime) { $newerInputs += $input }
  } elseif (Test-Path -LiteralPath $input -PathType Container) {
    $hit = Get-ChildItem -LiteralPath $input -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -gt $exeTime } | Select-Object -First 1
    if ($hit) { $newerInputs += $hit.FullName }
  }
}
if ($newerInputs.Count) {
  $message = "Package is older than current source/build input: $($newerInputs[0])"
  if ($RequireFresh) { Add-Error $message } else { Add-Warning $message }
} else {
  Add-Ok "Package timestamp is current relative to source/build inputs"
}

# Durable guard: reject a dev-mode EXE (built without tauri/custom-protocol).
# A dev-mode build boots WebView2 at the Vite dev URL (http://localhost:1420),
# which is not running in production -> "localhost refused connection".
$bootCheckScript = Join-Path $RepoRoot "scripts\check-exe-boot-mode.mjs"
if ($SkipBootCheck) {
  Add-Warning "Skipped boot-mode check (as requested)"
} elseif (-not (Test-Path -LiteralPath $bootCheckScript -PathType Leaf)) {
  Add-Warning "Boot-mode check script not found; skipping"
} else {
  Write-Host ""
  Write-Host "Booting packaged executable to verify production (custom-protocol) mode..."
  & node $bootCheckScript --exe $packageExe --port 9333 --timeout 25000
  if ($LASTEXITCODE -ne 0) {
    Add-Error "Packaged executable is NOT a production build (dev-mode EXE). Rebuild with 'npm run tauri:build' so the tauri/custom-protocol feature is enabled."
  } else {
    Add-Ok "Packaged executable boots in production (custom-protocol) mode"
  }
}

$manifestPath = Join-Path $PackageRoot "package-manifest.json"
if ($WriteManifest -and $errors.Count -eq 0) {
  $commit = (& git -C $RepoRoot rev-parse HEAD 2>$null | Select-Object -First 1)
  $checkedFiles = @(
    $checked.ToArray() | ForEach-Object {
      [pscustomobject]@{
        label = $_.label
        source = Get-PortableRelativePath $RepoRoot $_.source
        package = Get-PortableRelativePath $PackageRoot $_.package
        sha256 = $_.sha256
      }
    }
  )
  $manifest = [pscustomobject]@{
    product = "SuperClaw Desktop Client"
    version = $packageVersion
    built_at = (Get-Date).ToUniversalTime().ToString("o")
    source_commit = $commit
    executable_sha256 = (Get-FileHash -LiteralPath $packageExe -Algorithm SHA256).Hash.ToLowerInvariant()
    checked_files = $checkedFiles
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  Add-Ok "Wrote package manifest"
} elseif (-not (Test-Path -LiteralPath $manifestPath)) {
  Add-Warning "Package manifest is absent; rebuild with the current desktop build script before delivery"
}

Write-Host ""
Write-Host "Checked: $($checked.Count) copied artifacts; errors: $($errors.Count); warnings: $($warnings.Count)"
if ($errors.Count -gt 0) { exit 2 }
