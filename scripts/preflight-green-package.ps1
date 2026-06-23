param(
  [string]$ExpectedBranch = "test-minimax-only-no-user-from-green"
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "========== $Title ==========" -ForegroundColor Cyan
}

function Add-Issue {
  param(
    [System.Collections.Generic.List[object]]$List,
    [string]$Severity,
    [string]$Path,
    [int]$Line,
    [string]$Message,
    [string]$Text = ""
  )

  $List.Add([pscustomobject]@{
    severity = $Severity
    path = $Path
    line = $Line
    message = $Message
    text = $Text
  }) | Out-Null
}

function Get-NormalizedPath([string]$Path) {
  return $Path.Replace("\", "/")
}

function Test-AllowedPlaceholder([string]$Value) {
  $clean = ($Value -replace '^["'']|["'']$', '').Trim()
  if (-not $clean) { return $true }
  if ($clean -in @("superclaw-login-required", "YOUR_API_KEY", "<YOUR_API_KEY>", "REPLACE_ME", "LOGIN_REQUIRED")) { return $true }
  if ($clean -match '^\$\{[A-Z0-9_]+\}$') { return $true }
  if ($clean -match '^%[A-Z0-9_]+%$') { return $true }
  return $false
}

function Get-FreeSubstDrive {
  foreach ($letter in @("R", "S", "T", "U", "V", "W", "X", "Y", "Z")) {
    $drive = "${letter}:"
    $substUsed = (& subst 2>$null | Select-String -Pattern "^$([regex]::Escape($drive))\\")
    if (-not $substUsed -and -not (Test-Path -LiteralPath "$drive\")) {
      return $drive
    }
  }
  throw "No free subst drive is available for long-path runtime verification."
}

function Invoke-RuntimeVerify {
  param(
    [string]$ProjectRoot,
    [string]$ManifestPath
  )

  $drive = Get-FreeSubstDrive
  $mapped = $false
  try {
    & subst $drive $ProjectRoot | Out-Null
    $mapped = $true
    $scriptPath = "$drive\scripts\verify-green-runtime.ps1"
    powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -ProjectRoot "$drive\" -OutputManifest $ManifestPath -IncludeOptional -RequireComplete
    if ($LASTEXITCODE -ne 0) {
      throw "verify-green-runtime.ps1 failed with exit code $LASTEXITCODE"
    }
  } finally {
    if ($mapped) {
      & subst $drive /D | Out-Null
    }
  }
}

function Test-WorkspaceStatus {
  param([string]$ProjectRoot)

  $allowedDirty = @(
    "scripts/build-green-package.ps1",
    "scripts/preflight-green-package.ps1",
    "src/lib/yyapi-config.js",
    "scripts/build-desktop-client.ps1",
    "src/lib/test-build-mode.js",
    "src/main.js",
    "src/lib/user-api.js",
    "src/lib/model-presets.js"
  )

  $unexpected = @()
  $statusLines = git status --porcelain=v1 -uall
  foreach ($line in $statusLines) {
    if ($line.Length -lt 4) { continue }
    $code = $line.Substring(0, 2).Trim()
    $path = Get-NormalizedPath ($line.Substring(3).Trim('"'))
    if ($allowedDirty -notcontains $path) {
      $unexpected += $line
      continue
    }
    if ($code -notin @("M", "A", "??")) {
      $unexpected += $line
    }
  }

  if ($unexpected.Count -gt 0) {
    $unexpected | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Workspace has unexpected changes."
  }

  if ($statusLines) {
    Write-Host "Workspace has allowed preflight edits only:" -ForegroundColor Yellow
    $statusLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  } else {
    Write-Host "Workspace is clean."
  }
}

function Test-Port1420 {
  $existing = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
  if (-not $existing) {
    Write-Host "Port 1420 is free."
    return
  }

  foreach ($ownerPid in ($existing | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
    Write-Host "PID: $ownerPid" -ForegroundColor Red
    if ($proc) {
      Write-Host "ProcessName: $($proc.Name)" -ForegroundColor Red
      Write-Host "CommandLine: $($proc.CommandLine)" -ForegroundColor Red
    }
  }
  throw "Port 1420 is occupied. Green package tests must use strictPort 1420 and must not reuse an existing service."
}

function Test-BuildScriptLogic {
  $path = "scripts/build-green-package.ps1"
  $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $legacyYyapiIpPattern = ("124\.222\." + "21\.44")
  $required = @(
    "strictPort",
    "port 1420",
    "fail if port occupied",
    "no reuse existing service",
    "FailIfPortOccupied",
    "runtime/hermes-agent",
    "runtime/hermes",
    "hermes.exe",
    "hermes-agent.exe"
  )

  foreach ($term in $required) {
    if ($text -notmatch [regex]::Escape($term)) {
      throw "$path is missing required green preflight logic term: $term"
    }
  }

  if ($text -match "Reusing existing panel service") {
    throw "$path still contains panel service reuse logic."
  }

  if ($text -match $legacyYyapiIpPattern) {
    throw "$path still contains legacy yyapi IP."
  }

  Write-Host "build-green-package.ps1 strictPort/fail-if-occupied logic is present."
}

function Test-MiniMaxOnlyTestBuildLogic {
  $buildPath = "scripts/build-green-package.ps1"
  $modePath = "src/lib/test-build-mode.js"
  $buildText = Get-Content -LiteralPath $buildPath -Raw -Encoding UTF8
  $modeText = Get-Content -LiteralPath $modePath -Raw -Encoding UTF8
  $viteMinimaxApiKeyPattern = ("VITE_MINIMAX_" + "API_KEY")
  $requiredBuildTerms = @(
    "VITE_SUPERCLAW_TEST_BUILD",
    "VITE_SUPERCLAW_SKIP_AUTH",
    "VITE_SUPERCLAW_SKIP_ACTIVATION",
    "VITE_SUPERCLAW_DISABLE_YYAPI",
    "VITE_SUPERCLAW_FORCE_PROVIDER",
    "VITE_SUPERCLAW_MINIMAX_BASE_URL",
    "VITE_SUPERCLAW_MINIMAX_MODEL",
    "https://api.minimax.io/v1",
    "MiniMax-M3"
  )
  foreach ($term in $requiredBuildTerms) {
    if ($buildText -notmatch [regex]::Escape($term)) {
      throw "$buildPath is missing MiniMax-only test build term: $term"
    }
  }
  $requiredModeTerms = @(
    "isTestBuildMode",
    "isAuthBypassEnabled",
    "isActivationBypassEnabled",
    "isYyapiDisabled",
    "getForcedProvider",
    "isMiniMaxOnlyMode",
    "getMiniMaxDefaultConfig",
    "getTestUser"
  )
  foreach ($term in $requiredModeTerms) {
    if ($modeText -notmatch [regex]::Escape($term)) {
      throw "$modePath is missing test build helper: $term"
    }
  }
  if ($buildText -match [regex]::Escape($viteMinimaxApiKeyPattern) -or $modeText -match [regex]::Escape($viteMinimaxApiKeyPattern)) {
    throw "MiniMax-only test mode must not use $viteMinimaxApiKeyPattern."
  }
  Write-Host "Test build auth bypass: PASS" -ForegroundColor Green
  Write-Host "MiniMax only mode: PASS" -ForegroundColor Green
  Write-Host "YYAPI disabled: PASS" -ForegroundColor Green
}

function Test-TrackedSourceRisks {
  $issues = [System.Collections.Generic.List[object]]::new()
  $trackedFiles = git -c core.quotepath=false ls-files
  $viteMinimaxApiKeyPattern = ("VITE_MINIMAX_" + "API_KEY")
  $legacyYyapiIpPattern = ("124\.222\." + "21\.44")
  $allowedDesktopTerms = @("desktop_control", "desktop-control", "Desktop Control")
  $docWarningPrefixes = @("docs/", "AGENTS.md", "README.md", "CONTRIBUTING.md")
  $legacyIpFatalPaths = @(
    "src/",
    "src-tauri/src/",
    "scripts/build-green-package.ps1",
    "scripts/build-desktop-client.ps1",
    "scripts/dev-api.js"
  )

  foreach ($file in $trackedFiles) {
    $normalized = Get-NormalizedPath $file
    if (-not (Test-Path -LiteralPath $file -PathType Leaf -ErrorAction SilentlyContinue)) { continue }
    $item = Get-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
    if (-not $item) { continue }
    if ($item.Length -gt 2MB) { continue }

    try {
      $lines = @(Get-Content -LiteralPath $file -Encoding UTF8 -ErrorAction Stop)
    } catch {
      continue
    }

    for ($i = 0; $i -lt $lines.Count; $i++) {
      $line = [string]$lines[$i]
      $lineNo = $i + 1
      $hasAllowedDesktopTerm = $false
      foreach ($desktopTerm in $allowedDesktopTerms) {
        if ($line -match [regex]::Escape($desktopTerm)) {
          $hasAllowedDesktopTerm = $true
          break
        }
      }

      if ($line -match $legacyYyapiIpPattern) {
        $isDocWarning = $false
        foreach ($prefix in $docWarningPrefixes) {
          if ($normalized -eq $prefix -or $normalized.StartsWith($prefix)) {
            $isDocWarning = $true
            break
          }
        }

        $isFatal = $false
        foreach ($prefix in $legacyIpFatalPaths) {
          if ($normalized -eq $prefix -or $normalized.StartsWith($prefix)) {
            $isFatal = $true
            break
          }
        }

        if ($isFatal) {
          Add-Issue $issues "fatal" $normalized $lineNo "Legacy yyapi IP in runtime/build source." $line.Trim()
        } elseif ($isDocWarning) {
          Add-Issue $issues "warning" $normalized $lineNo "Legacy yyapi IP appears in documentation/internal notes only." $line.Trim()
        } else {
          Add-Issue $issues "warning" $normalized $lineNo "Legacy yyapi IP appears outside runtime/build source." $line.Trim()
        }
      }

      if ($normalized -eq "scripts/preflight-green-package.ps1" -and ($line -match [regex]::Escape($viteMinimaxApiKeyPattern) -or $line -match "sk-\[|Bearer")) {
        continue
      }

      if ($line -match [regex]::Escape($viteMinimaxApiKeyPattern)) {
        Add-Issue $issues "fatal" $normalized $lineNo "VITE MiniMax API key env var must not be committed." $line.Trim()
      }

      foreach ($match in [regex]::Matches($line, "(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}")) {
        Add-Issue $issues "fatal" $normalized $lineNo "Real-looking sk- API key." $match.Value
      }

      foreach ($match in [regex]::Matches($line, "Bearer\s+([A-Za-z0-9_-]{20,})")) {
        Add-Issue $issues "fatal" $normalized $lineNo "Real-looking Bearer token." $match.Value
      }

      foreach ($match in [regex]::Matches($line, "(?i)^\s*(?:export\s+)?(MINIMAX_API_KEY|OPENAI_API_KEY|YYAPI_KEY)\s*=\s*([^#\s]+)")) {
        $value = $match.Groups[2].Value.Trim()
        if (-not (Test-AllowedPlaceholder $value)) {
          Add-Issue $issues "fatal" $normalized $lineNo "Real-looking API key assignment." $line.Trim()
        }
      }

      if ($normalized -match "^scripts/" -and -not $hasAllowedDesktopTerm -and $line -match "(Copy-Item|Copy-Dir|robocopy)" -and $line -match "(C:\\tmp|Downloads|Desktop|AppData)" -and $line -match "(runtime|old package|old-package|package)") {
        Add-Issue $issues "fatal" $normalized $lineNo "Build script appears to copy runtime/package content from local cache or user folders." $line.Trim()
      }
    }
  }

  return $issues
}

function Write-Issues {
  param([System.Collections.Generic.List[object]]$Issues)

  $warnings = @($Issues | Where-Object { $_.severity -eq "warning" })
  $fatals = @($Issues | Where-Object { $_.severity -eq "fatal" })

  if ($warnings.Count -gt 0) {
    Write-Host "Warnings:" -ForegroundColor Yellow
    foreach ($issue in $warnings) {
      Write-Host ("  [{0}:{1}] {2} :: {3}" -f $issue.path, $issue.line, $issue.message, $issue.text) -ForegroundColor Yellow
    }
  } else {
    Write-Host "Warnings: 0"
  }

  if ($fatals.Count -gt 0) {
    Write-Host "Fatal risks:" -ForegroundColor Red
    foreach ($issue in $fatals) {
      Write-Host ("  [{0}:{1}] {2} :: {3}" -f $issue.path, $issue.line, $issue.message, $issue.text) -ForegroundColor Red
    }
    throw "Fatal source risk count: $($fatals.Count)"
  }

  Write-Host "Fatal risks: 0"
}

$root = (git rev-parse --show-toplevel 2>$null)
if (-not $root) {
  throw "Current directory is not a git repository."
}

Set-Location $root
$branch = git branch --show-current
if ($branch -ne $ExpectedBranch) {
  throw "Expected branch $ExpectedBranch, current branch is $branch."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$manifestPath = "C:\tmp\green-usb-preflight-manifest-$timestamp.json"
New-Item -ItemType Directory -Force C:\tmp | Out-Null

Write-Section "Workspace"
Test-WorkspaceStatus $root

Write-Section "Build Script Logic"
Test-BuildScriptLogic

Write-Section "MiniMax-only Test Build Logic"
Test-MiniMaxOnlyTestBuildLogic

Write-Section "Runtime Manifest"
Invoke-RuntimeVerify -ProjectRoot $root -ManifestPath $manifestPath
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$missingRequiredCount = @($manifest.missingRequired).Count
$riskHitsCount = @($manifest.riskHits).Count
if ($missingRequiredCount -ne 0) { throw "Runtime manifest missingRequired=$missingRequiredCount" }
if ($riskHitsCount -ne 0) { throw "Runtime manifest riskHits=$riskHitsCount" }
Write-Host "Runtime manifest passed: $manifestPath"
Write-Host "missingRequired=0"
Write-Host "riskHits=0"

Write-Section "Port 1420"
Test-Port1420

Write-Section "Tracked Source Risk Scan"
$issues = Test-TrackedSourceRisks
Write-Issues $issues

Write-Section "Summary"
Write-Host "Preflight result: PASS" -ForegroundColor Green
Write-Host "Manifest: $manifestPath"
