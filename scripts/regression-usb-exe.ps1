param(
  [string]$ProjectRoot = "",
  [switch]$SkipLiveModel,
  [switch]$SkipUi,
  [switch]$RepairMode,
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRootResolved = Resolve-Path (Join-Path $PSScriptRoot "..")
} else {
  $ProjectRootResolved = Resolve-Path -LiteralPath $ProjectRoot
}

if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $ReportPath = "C:\tmp\usb-exe-regression-$stamp.txt"
}

$ProjectRoot = [System.IO.Path]::GetFullPath([string]$ProjectRootResolved.Path)
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  throw "ProjectRoot resolved to an empty path."
}
$Results = New-Object System.Collections.Generic.List[object]
$ExitCode = 0

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [int]$Code = 0,
    [string]$Message = ""
  )

  $script:Results.Add([pscustomobject]@{
    Name = $Name
    Status = $Status
    Code = $Code
    Message = ($Message -replace "\r?\n", " ").Trim()
  }) | Out-Null

  if ($Status -eq "FAIL" -and $script:ExitCode -eq 0) {
    $script:ExitCode = $Code
  }
}

function Invoke-CheckedCommand {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments = @(),
    [int]$FailCode,
    [string]$WorkingDirectory = $ProjectRoot
  )

  Write-Host "[REGRESSION] $Name"
  $output = ""
  $stdoutPath = Join-Path $env:TEMP ("superclaw-regression-stdout-" + [guid]::NewGuid().ToString("N") + ".txt")
  $stderrPath = Join-Path $env:TEMP ("superclaw-regression-stderr-" + [guid]::NewGuid().ToString("N") + ".txt")
  try {
    Push-Location $WorkingDirectory
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      & $FilePath @Arguments 1> $stdoutPath 2> $stderrPath
      $code = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
      Pop-Location
    }
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -Raw -LiteralPath $stdoutPath } else { "" }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { "" }
    $output = ($stdout + "`n" + $stderr).Trim()
    if ($code -eq 0) {
      Add-Result $Name "PASS" 0 ($output.Trim())
      return $true
    }
    Add-Result $Name "FAIL" $FailCode ("exit=$code; $output")
    return $false
  } catch {
    Add-Result $Name "FAIL" $FailCode $_.Exception.Message
    return $false
  } finally {
    Remove-Item -LiteralPath $stdoutPath,$stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Get-ChangedFiles {
  Push-Location $ProjectRoot
  try {
    $files = @()
    $baseline = "ecommerce-1.0.2-green-usb-from-1.0.1-4"
    git rev-parse --verify $baseline 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $files += git diff --name-only "$baseline..HEAD"
    }
    $files += git diff --name-only
    $files += git ls-files --others --exclude-standard
    $files | Where-Object { $_ } | Sort-Object -Unique
  } finally {
    Pop-Location
  }
}

function Test-ChangedByExtension {
  param(
    [string]$Name,
    [string]$Pattern,
    [string]$Command,
    [string[]]$BaseArgs,
    [int]$FailCode
  )

  $files = Get-ChangedFiles | Where-Object {
    $_ -and $_.Trim() -and $_ -match $Pattern -and (Test-Path -LiteralPath (Join-Path $ProjectRoot $_) -PathType Leaf)
  }
  if (-not $files -or $files.Count -eq 0) {
    Add-Result $Name "PASS" 0 "No changed files matched $Pattern."
    return
  }
  foreach ($file in $files) {
    $ok = Invoke-CheckedCommand "$Name - $file" $Command ($BaseArgs + @($file)) $FailCode
    if (-not $ok) { return }
  }
}

function Test-HttpEndpoint {
  param(
    [string]$Name,
    [string]$Url,
    [int[]]$AllowedStatus = @(200)
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    if ($AllowedStatus -contains [int]$response.StatusCode) {
      Add-Result $Name "PASS" 0 "HTTP $($response.StatusCode)"
      return
    }
    Add-Result $Name "FAIL" 80 "HTTP $($response.StatusCode)"
  } catch {
    Add-Result $Name "FAIL" 80 $_.Exception.Message
  }
}

Push-Location $ProjectRoot
try {
  Add-Result "Project root" "PASS" 0 $ProjectRoot
  Add-Result "Repair mode" "PASS" 0 ("RepairMode=" + [bool]$RepairMode)

  $branch = (git branch --show-current).Trim()
  Add-Result "Git branch" "PASS" 0 $branch
  Invoke-CheckedCommand "Git diff whitespace" "git" @("diff", "--check") 10 | Out-Null

  Test-ChangedByExtension "JS syntax" "\.(js|mjs|cjs)$" "node" @("--check") 10
  $psFiles = Get-ChangedFiles | Where-Object {
    $_ -and $_.Trim() -and $_ -match "\.ps1$" -and (Test-Path -LiteralPath (Join-Path $ProjectRoot $_) -PathType Leaf)
  }
  if (-not $psFiles -or $psFiles.Count -eq 0) {
    Add-Result "PowerShell syntax" "PASS" 0 "No changed PowerShell files."
  } else {
    foreach ($file in $psFiles) {
      try {
        [scriptblock]::Create((Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot $file))) | Out-Null
        Add-Result "PowerShell syntax - $file" "PASS" 0 ""
      } catch {
        Add-Result "PowerShell syntax - $file" "FAIL" 10 $_.Exception.Message
        break
      }
    }
  }
  Test-ChangedByExtension "Python syntax" "\.py$" "python" @("-m", "py_compile") 10

  if (Test-Path -LiteralPath (Join-Path $ProjectRoot "src-tauri\Cargo.toml")) {
    Invoke-CheckedCommand "cargo check" "cargo" @("check") 10 (Join-Path $ProjectRoot "src-tauri") | Out-Null
  } else {
    Add-Result "cargo check" "PASS" 0 "No src-tauri/Cargo.toml found."
  }

  if (Test-Path -LiteralPath "scripts\verify-green-runtime.ps1") {
    $runtimeManifest = "C:\tmp\usb-exe-runtime-$((Get-Date).ToString('yyyyMMdd-HHmmss')).json"
    Invoke-CheckedCommand "runtime verify" "powershell" @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts\verify-green-runtime.ps1",
      "-OutputManifest",
      $runtimeManifest,
      "-IncludeOptional",
      "-RequireComplete"
    ) 20 | Out-Null
  } else {
    Add-Result "runtime verify" "FAIL" 20 "scripts/verify-green-runtime.ps1 is missing."
  }

  if (Test-Path -LiteralPath "scripts\preflight-green-package.ps1") {
    Invoke-CheckedCommand "preflight" "powershell" @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts\preflight-green-package.ps1",
      "-ExpectedBranch",
      $branch
    ) 30 | Out-Null
  } else {
    Add-Result "preflight" "FAIL" 30 "scripts/preflight-green-package.ps1 is missing."
  }

  $requiredSmoke = @(
    "smoke:ecommerce-stage1",
    "smoke:ecommerce-stage2",
    "smoke:ecommerce-stage3",
    "smoke:ecommerce-stage4",
    "smoke:ecommerce-stage56"
  )
  foreach ($smoke in $requiredSmoke) {
    Invoke-CheckedCommand "npm run $smoke" "npm" @("run", $smoke) 70 | Out-Null
  }

  $optionalSmoke = @(
    "scripts\smoke-agent-execution-trace.mjs",
    "scripts\smoke-agent-session-persistence.mjs",
    "scripts\smoke-agent-slash-commands.mjs",
    "scripts\smoke-agent-background-tasks.mjs",
    "scripts\smoke-hermes-collaboration.mjs",
    "scripts\smoke-hermes-image-generation.mjs",
    "scripts\smoke-openclaw-desktop-control.mjs"
  )
  foreach ($script in $optionalSmoke) {
    if (Test-Path -LiteralPath $script -PathType Leaf) {
      Invoke-CheckedCommand "node $script" "node" @($script) 70 | Out-Null
    } else {
      Add-Result "node $script" "SKIP" 0 "Smoke script not implemented."
    }
  }

  Invoke-CheckedCommand "npm run build" "npm" @("run", "build") 40 | Out-Null
  if (Test-Path -LiteralPath "dist\index.html" -PathType Leaf) {
    Add-Result "dist/index.html" "PASS" 0 "Found."
  } else {
    Add-Result "dist/index.html" "FAIL" 40 "Missing after build."
  }

  if ($SkipUi) {
    Add-Result "UI route checks" "SKIP" 0 "SkipUi was set."
  } else {
    Test-HttpEndpoint "Route /" "http://127.0.0.1:1420/" @(200)
    Test-HttpEndpoint "Route /#/payment" "http://127.0.0.1:1420/#/payment" @(200)
    Test-HttpEndpoint "Route /#/models" "http://127.0.0.1:1420/#/models" @(200)
    Test-HttpEndpoint "Route /#/h/chat" "http://127.0.0.1:1420/#/h/chat" @(200)
  }

  if ($SkipLiveModel) {
    Add-Result "MiniMax live check" "SKIP" 0 "SkipLiveModel was set."
    Add-Result "Gateway live checks" "SKIP" 0 "SkipLiveModel was set."
  } else {
    Test-HttpEndpoint "OpenClaw health" "http://127.0.0.1:18789/health" @(200)
    Test-HttpEndpoint "Hermes health" "http://127.0.0.1:8642/health" @(200)
    Test-HttpEndpoint "Claude panel status" "http://127.0.0.1:3020/api/status" @(200)
  }
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force (Split-Path $ReportPath -Parent) | Out-Null
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("SuperClaw USB EXE regression report") | Out-Null
$lines.Add("ProjectRoot: $ProjectRoot") | Out-Null
$lines.Add("Generated: $(Get-Date -Format o)") | Out-Null
$lines.Add("") | Out-Null
foreach ($row in $Results) {
  $lines.Add(("{0} [{1}] {2}" -f $row.Name, $row.Status, $row.Message)) | Out-Null
}
$lines.Add("") | Out-Null
$lines.Add("ExitCode: $ExitCode") | Out-Null
[System.IO.File]::WriteAllLines($ReportPath, $lines, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Regression report: $ReportPath"
$Results | Format-Table -AutoSize
exit $ExitCode
