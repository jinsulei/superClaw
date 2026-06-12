param(
  [string]$PackageRoot = "F:\SuperClaw-Packages",
  [switch]$CreatePackageRoot,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$PackageRootFull = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PackageRoot)

function RelPath([string]$Path) {
  $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  if ($full.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($RepoRoot.Length).TrimStart('\', '/')
  }
  return $full
}

function GitLines([string[]]$GitArgs) {
  Push-Location -LiteralPath $RepoRoot
  try {
    $out = & git @GitArgs 2>$null
    if ($LASTEXITCODE -ne 0) { return @() }
    return @($out)
  } finally {
    Pop-Location
  }
}

function Add-Issue([System.Collections.Generic.List[object]]$List, [string]$Severity, [string]$Code, [string]$Path, [string]$Message) {
  $List.Add([pscustomobject]@{
    severity = $Severity
    code = $Code
    path = $Path
    message = $Message
  }) | Out-Null
}

function Is-TextFile([string]$Path) {
  try {
    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  } catch {
    return $false
  }
  $textExt = @(
    ".js", ".ts", ".jsx", ".tsx", ".json", ".yaml", ".yml", ".toml", ".rs",
    ".md", ".txt", ".ps1", ".bat", ".cmd", ".html", ".css", ".svg", ".env"
  )
  return $textExt -contains $ext
}

function Test-SensitiveContent([string]$FullPath) {
  try {
    if (!(Test-Path -LiteralPath $FullPath -PathType Leaf)) { return @() }
    $item = Get-Item -LiteralPath $FullPath -Force
  } catch {
    return @()
  }
  if ($item.Length -gt 5MB) { return @() }
  if (!(Is-TextFile $FullPath)) { return @() }
  try {
    $content = Get-Content -LiteralPath $FullPath -Raw -ErrorAction Stop
  } catch {
    return @()
  }

  $hits = New-Object System.Collections.Generic.List[string]
  if ($content -match 'sk-[A-Za-z0-9_\-]{16,}') { $hits.Add("sk-key") | Out-Null }
  if ($content -match 'ark-[A-Za-z0-9_\-]{16,}') { $hits.Add("ark-key") | Out-Null }
  if ($content -match '(?i)Bearer\s+[A-Za-z0-9._\-]{20,}') { $hits.Add("bearer-token") | Out-Null }
  if ($content -match '(?i)(api[-_]?key|access[-_]?token|refresh[-_]?token)\s*[:=]\s*["''][A-Za-z0-9._\-]{24,}["'']') {
    $hits.Add("literal-credential-field") | Out-Null
  }
  return @($hits | Select-Object -Unique)
}

$issues = New-Object System.Collections.Generic.List[object]
$summary = [ordered]@{}

if (!(Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
  throw "This script must run inside the source repository."
}

if ($PackageRootFull.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  Add-Issue $issues "error" "PACKAGE_ROOT_INSIDE_SOURCE" $PackageRootFull "Package output is inside the source tree. Move it outside the repository."
}

if ($CreatePackageRoot -and !(Test-Path -LiteralPath $PackageRootFull)) {
  New-Item -ItemType Directory -Force -Path $PackageRootFull | Out-Null
}

$status = GitLines @("status", "--porcelain=v1", "--branch")
$tracked = GitLines @("ls-files")
$ignoredCheck = @(
  "SuperClaw_Desktop_Client",
  "SuperClaw-Desktop-Client",
  "src-tauri/target",
  ".dev-data",
  "workspace",
  "src-tauri/workspace",
  "logs",
  "dist",
  "node_modules",
  "SuperClaw_P2U_HANDOFF",
  "SuperClaw_DESKTOP_TEST_HANDOFF",
  "SuperClaw_VALIDATION_HANDOFF",
  "data",
  "bin",
  "uv-tools"
)

$trackedArtifactPattern = '(?i)(\.zip$|\.7z$|\.rar$|\.tar\.gz$|^dist/|^build/|^release/|^portable/|^src-tauri/target/|^node_modules/|^logs/|^cache/|^tmp/|^temp/|^SuperClaw.*Client/)'
foreach ($p in $tracked) {
  if ($p -match $trackedArtifactPattern) {
    Add-Issue $issues "warning" "TRACKED_ARTIFACT" $p "Tracked file looks like a package, cache, build output, or generated artifact."
  }
}

foreach ($p in $ignoredCheck) {
  $full = Join-Path $RepoRoot ($p -replace '/', '\')
  if (Test-Path -LiteralPath $full) {
    Add-Issue $issues "info" "LOCAL_GENERATED_DIR" $p "Local generated/runtime directory exists. Keep it out of source reads and package from a clean output folder."
  }
}

$largeTracked = New-Object System.Collections.Generic.List[object]
foreach ($p in $tracked) {
  try {
    $full = Join-Path $RepoRoot ($p -replace '/', '\')
    if (!(Test-Path -LiteralPath $full -PathType Leaf)) { continue }
    $item = Get-Item -LiteralPath $full -Force
    if ($item.Length -ge 10MB) {
      $largeTracked.Add([pscustomobject]@{
        path = $p
        mb = [math]::Round($item.Length / 1MB, 2)
      }) | Out-Null
    }
  } catch {
    Add-Issue $issues "info" "UNREADABLE_TRACKED_PATH" $p "Tracked path could not be inspected locally; check unusual characters or missing file."
  }
}

foreach ($entry in ($largeTracked | Sort-Object mb -Descending | Select-Object -First 30)) {
  Add-Issue $issues "info" "LARGE_TRACKED_FILE" $entry.path ("Tracked file is {0} MB. Confirm it is required." -f $entry.mb)
}

$sensitiveCandidates = New-Object System.Collections.Generic.List[string]
foreach ($p in $tracked) {
  if (Is-TextFile $p) { $sensitiveCandidates.Add((Join-Path $RepoRoot ($p -replace '/', '\'))) | Out-Null }
}
foreach ($p in @(
  "src-tauri/resources/data/.openclaw/openclaw.json",
  "src-tauri/resources/data/hermes/config.yaml",
  ".dev-data/hermes/config.yaml",
  ".env",
  ".env.local"
)) {
  $sensitiveCandidates.Add((Join-Path $RepoRoot ($p -replace '/', '\'))) | Out-Null
}

foreach ($full in ($sensitiveCandidates | Select-Object -Unique)) {
  $hits = @(Test-SensitiveContent $full)
  if ($hits.Count -gt 0) {
    Add-Issue $issues "error" "SENSITIVE_CONTENT" (RelPath $full) ("Potential secret pattern found: " + ($hits -join ", ") + ". Value is intentionally hidden.")
  }
}

$untracked = @($status | Where-Object { $_ -like "?? *" } | ForEach-Object { $_.Substring(3) })
foreach ($p in $untracked) {
  if ($p -match '(?i)(workspace/|src-tauri/workspace/|\.zip$|\.7z$|\.rar$|\.tar\.gz$|SuperClaw|target/|logs/)') {
    Add-Issue $issues "info" "UNTRACKED_LOCAL_ARTIFACT" $p "Untracked local artifact. Do not include unless explicitly required."
  }
}

$summary.repoRoot = $RepoRoot
$summary.packageRoot = $PackageRootFull
$summary.branch = (GitLines @("branch", "--show-current") | Select-Object -First 1)
$summary.statusCount = @($status | Where-Object { $_ -notlike "## *" }).Count
$summary.issueCount = $issues.Count
$summary.errorCount = @($issues | Where-Object { $_.severity -eq "error" }).Count
$summary.warningCount = @($issues | Where-Object { $_.severity -eq "warning" }).Count
$summary.infoCount = @($issues | Where-Object { $_.severity -eq "info" }).Count
$summary.recommendedPackageRoot = $PackageRootFull

$nextSteps = @(
  "Keep package output outside the repository.",
  "Do not scan generated folders when asking agents to read source.",
  "Before delivery, run this audit again and resolve all error-level findings.",
  "Use a clean source snapshot for packaging; keep zip/exe artifacts outside Git."
)

$result = [ordered]@{
  summary = $summary
  issues = @($issues.ToArray())
  nextSteps = @($nextSteps)
}

if ($Json) {
  $result | ConvertTo-Json -Depth 6
  exit $(if ($summary.errorCount -gt 0) { 2 } else { 0 })
}

Write-Host "SuperClaw packaging preflight audit"
Write-Host "Repo: $RepoRoot"
Write-Host "Branch: $($summary.branch)"
Write-Host "Recommended package root: $PackageRootFull"
Write-Host ""
Write-Host ("Git changed/untracked entries: {0}" -f $summary.statusCount)
Write-Host ("Issues: {0} error, {1} warning, {2} info" -f $summary.errorCount, $summary.warningCount, $summary.infoCount)
Write-Host ""

foreach ($issue in $issues) {
  Write-Host ("[{0}] {1}: {2}" -f $issue.severity.ToUpperInvariant(), $issue.code, $issue.path)
  Write-Host ("    {0}" -f $issue.message)
}

Write-Host ""
Write-Host "Recommended next steps:"
foreach ($step in $nextSteps) {
  Write-Host ("- {0}" -f $step)
}

exit $(if ($summary.errorCount -gt 0) { 2 } else { 0 })
