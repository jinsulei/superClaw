param(
  [switch]$AllowGatewayTask,
  [switch]$AllowReleaseConfigTask
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "1.0.7/hermes" + [string][char]0x534F + [string][char]0x4F5C + [string][char]0x4EFB + [string][char]0x52A1
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$Issues = New-Object System.Collections.Generic.List[object]

function Add-Issue([string]$Severity, [string]$Code, [string]$Path, [string]$Message) {
  $Issues.Add([pscustomobject]@{
    severity = $Severity
    code = $Code
    path = $Path
    message = $Message
  }) | Out-Null
}

function Invoke-Git([string[]]$GitArgs) {
  Push-Location -LiteralPath $RepoRoot
  try {
    $out = & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
      throw "git $($GitArgs -join ' ') failed"
    }
    return @($out)
  } finally {
    Pop-Location
  }
}

function Normalize-RepoPath([string]$Path) {
  return (($Path -replace '\\', '/') -replace '^\./', '')
}

function Test-TextPath([string]$Path) {
  $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  return @(
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".txt",
    ".ps1", ".cmd", ".bat", ".yaml", ".yml", ".toml", ".rs", ".html", ".css", ".env"
  ) -contains $ext
}

function Get-StagedContent([string]$RepoPath) {
  if (!(Test-TextPath $RepoPath)) { return $null }
  Push-Location -LiteralPath $RepoRoot
  try {
    $content = & git show (":$RepoPath") 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($content -join "`n")
  } finally {
    Pop-Location
  }
}

function Get-WorkingContent([string]$RepoPath) {
  if (!(Test-TextPath $RepoPath)) { return $null }
  $full = Join-Path $RepoRoot ($RepoPath -replace '/', '\')
  if (!(Test-Path -LiteralPath $full -PathType Leaf)) { return $null }
  $item = Get-Item -LiteralPath $full -Force
  if ($item.Length -gt 5MB) { return $null }
  return Get-Content -LiteralPath $full -Raw
}

function Test-FakeSecretLine([string]$Line) {
  return $Line -match '(?i)fake-[a-z0-9_-]+-should-be-redacted|YOUR_[A-Z0-9_]+|needs_review|superclaw-portable-local'
}

function Find-SecretHits([string]$Content) {
  $hits = New-Object System.Collections.Generic.List[string]
  if ([string]::IsNullOrWhiteSpace($Content)) { return @() }

  $lines = $Content -split "`r?`n"
  foreach ($line in $lines) {
    if (Test-FakeSecretLine $line) { continue }

    if ($line -match 'sk-proj-[A-Za-z0-9_-]{20,}') { $hits.Add("openai-project-key") | Out-Null }
    elseif ($line -match 'sk-[A-Za-z0-9_-]{20,}') { $hits.Add("openai-key") | Out-Null }

    if ($line -match 'ark-[A-Za-z0-9_-]{20,}') { $hits.Add("ark-key") | Out-Null }
    if ($line -match '(?i)Bearer\s+[A-Za-z0-9._~+/=-]{24,}') { $hits.Add("bearer-token") | Out-Null }
    if ($line -match '(?i)(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|cookie|authorization)\s*[:=]\s*["''][^"'']{16,}["'']') {
      $hits.Add("credential-field") | Out-Null
    }
    if ($line -match '(?i)(MINIMAX|OPENAI|ANTHROPIC|CLAUDE|CODEX)[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["''][^"'']{12,}["'']') {
      $hits.Add("provider-credential") | Out-Null
    }
  }

  return @($hits | Select-Object -Unique)
}

function Find-OldPackageHits([string]$RepoPath, [string]$Content) {
  $hits = New-Object System.Collections.Generic.List[string]
  if ([string]::IsNullOrWhiteSpace($Content)) { return @() }

  $path = Normalize-RepoPath $RepoPath
  $isExecutableConfig = $path -match '(?i)(package\.json|\.ps1$|\.mjs$|\.js$|tauri\.conf\.json)$'

  foreach ($token in @(
    'superclaw-1.0.5',
    'superclaw-1.0.6',
    'feature-agent-runtime-orchestration-image',
    'restore-hermes'
  )) {
    if ($Content -match [regex]::Escape($token)) { $hits.Add($token) | Out-Null }
  }

  if ($Content -match '(?i)C:\\Users\\[^\\]+\\Documents') {
    $hits.Add("old-documents-path") | Out-Null
  }

  if ($isExecutableConfig) {
    if ($Content -match '(?im)^\s*(Copy-Item|robocopy|xcopy).*(^|[\\/"''])data([\\/"'']|\s|$)') {
      $hits.Add("root-data-copy") | Out-Null
    }
    if ($Content -match '(?im)^\s*(Copy-Item|robocopy|xcopy).*(^|[\\/"''])uv-python([\\/"'']|\s|$)') {
      $hits.Add("root-uv-python-copy") | Out-Null
    }
    if ($Content -match '(?im)^\s*(Copy-Item|robocopy|xcopy).*(^|[\\/"''])uv-tools([\\/"'']|\s|$)') {
      $hits.Add("root-uv-tools-copy") | Out-Null
    }
    if ($path -eq 'package.json' -and $Content -match '(?i)package-portable') {
      $hits.Add("package-portable-main-chain") | Out-Null
    }
  }

  return @($hits | Select-Object -Unique)
}

function Assert-StagedWhitelist([string[]]$StagedPaths) {
  $blockedPatterns = @(
    '(^|/)\.env($|[./_-])',
    '(^|/)relay-config\.json$',
    '(^|/)runtime/data/secrets(/|$)',
    '(^|/)node_modules(/|$)',
    '^src-tauri/target(/|$)',
    '^package\.json$',
    '^package-lock\.json$'
  )

  foreach ($path in $StagedPaths) {
    $p = Normalize-RepoPath $path
    foreach ($pattern in $blockedPatterns) {
      if ($p -match $pattern) {
        Add-Issue "error" "STAGED_FORBIDDEN_PATH" $p "Forbidden staged path for release preflight."
      }
    }

    if (!$AllowReleaseConfigTask -and $p -eq 'src-tauri/tauri.conf.json') {
      Add-Issue "error" "STAGED_TAURI_CONFIG" $p "tauri.conf.json requires an explicit release configuration task."
    }

    if (!$AllowGatewayTask -and ($p -eq 'scripts/dev-api.js' -or $p -eq 'scripts-dev-api.js')) {
      Add-Issue "error" "STAGED_GATEWAY_SCRIPT" $p "scripts-dev-api.js changes must be isolated in an explicit Gateway / Runtime / Relay task."
    }
  }
}

Write-Host "Hermes 1.0.7 release preflight"
Write-Host "Repo: $RepoRoot"

Push-Location -LiteralPath $RepoRoot
try {
  $branch = (Invoke-Git @("branch", "--show-current") | Select-Object -First 1)
  Write-Host "Branch: $branch"
  if ($branch -ne $ExpectedBranch) {
    Add-Issue "error" "WRONG_BRANCH" $branch "Expected branch is $ExpectedBranch."
  }

  $statusShort = @(Invoke-Git @("status", "-sb"))
  Write-Host ""
  Write-Host "Git status:"
  foreach ($line in $statusShort) { Write-Host $line }

  $staged = @(Invoke-Git @("diff", "--cached", "--name-only") | ForEach-Object { Normalize-RepoPath $_ } | Where-Object { $_ })
  Write-Host ""
  Write-Host ("Staged files: {0}" -f $staged.Count)
  foreach ($path in $staged) { Write-Host "  $path" }

  Assert-StagedWhitelist $staged

  $secretScanPaths = New-Object System.Collections.Generic.List[string]
  foreach ($path in $staged) { $secretScanPaths.Add($path) | Out-Null }
  foreach ($path in @(
    'package.json',
    'src-tauri/tauri.conf.json',
    'scripts/build-desktop-client.ps1',
    'scripts/check-release-gates.mjs',
    'docs/registry/RUNTIME_MANIFEST.md'
  )) {
    $secretScanPaths.Add($path) | Out-Null
  }

  foreach ($path in ($secretScanPaths | Select-Object -Unique)) {
    $content = if ($staged -contains $path) { Get-StagedContent $path } else { Get-WorkingContent $path }
    if ($null -eq $content) { continue }

    $secretHits = @(Find-SecretHits $content)
    if ($secretHits.Count -gt 0) {
      Add-Issue "error" "SECRET_SCAN_HIT" $path ("Potential real secret pattern found: " + ($secretHits -join ", ") + ". Values are intentionally hidden.")
    }
  }

  $oldPackageScanPaths = New-Object System.Collections.Generic.List[string]
  foreach ($path in $staged) { $oldPackageScanPaths.Add($path) | Out-Null }
  foreach ($path in @(
    'package.json',
    'src-tauri/tauri.conf.json',
    'scripts/build-desktop-client.ps1',
    'scripts/check-release-gates.mjs'
  )) {
    $oldPackageScanPaths.Add($path) | Out-Null
  }

  foreach ($path in ($oldPackageScanPaths | Select-Object -Unique)) {
    $content = if ($staged -contains $path) { Get-StagedContent $path } else { Get-WorkingContent $path }
    if ($null -eq $content) { continue }

    $oldHits = @(Find-OldPackageHits $path $content)
    if ($oldHits.Count -gt 0) {
      Add-Issue "error" "OLD_PACKAGE_SCAN_HIT" $path ("Old package, old branch, local Documents path, or unsafe legacy packaging chain found: " + ($oldHits -join ", "))
    }
  }

  Write-Host ""
  Write-Host "Running release gates:"
  & node scripts/check-release-gates.mjs
  $gateExit = $LASTEXITCODE
  if ($gateExit -ne 0) {
    Add-Issue "error" "RELEASE_GATE_FAILED" "scripts/check-release-gates.mjs" "Release gate runner failed with exit code $gateExit."
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Preflight issues:"
if ($Issues.Count -eq 0) {
  Write-Host "  none"
} else {
  foreach ($issue in $Issues) {
    Write-Host ("[{0}] {1}: {2}" -f $issue.severity.ToUpperInvariant(), $issue.code, $issue.path)
    Write-Host ("  {0}" -f $issue.message)
  }
}

$errorCount = @($Issues | Where-Object { $_.severity -eq "error" }).Count
Write-Host ""
Write-Host ("Summary: errors={0}, issues={1}" -f $errorCount, $Issues.Count)

if ($errorCount -gt 0) {
  exit 1
}

exit 0
