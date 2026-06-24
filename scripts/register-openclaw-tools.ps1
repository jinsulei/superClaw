param(
  [string]$ResourcesRoot = "",
  [string]$DataRoot = "",
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

function Resolve-ResourcesRoot {
  param([string]$InputRoot)

  if ($InputRoot -and $InputRoot.Trim()) {
    return (Resolve-Path -LiteralPath $InputRoot).Path
  }

  $scriptDir = Split-Path -Parent $PSCommandPath
  $projectRoot = Split-Path -Parent $scriptDir
  $devResources = Join-Path $projectRoot "src-tauri\resources"
  if (Test-Path -LiteralPath $devResources -PathType Container) {
    return (Resolve-Path -LiteralPath $devResources).Path
  }

  $portableResources = Join-Path $projectRoot "resources"
  if (Test-Path -LiteralPath $portableResources -PathType Container) {
    return (Resolve-Path -LiteralPath $portableResources).Path
  }

  throw "Unable to resolve resources root. Pass -ResourcesRoot explicitly."
}

function Resolve-DataRoot {
  param(
    [string]$InputRoot,
    [string]$ResolvedResourcesRoot
  )

  if ($InputRoot -and $InputRoot.Trim()) {
    return [System.IO.Path]::GetFullPath($InputRoot)
  }

  return Join-Path $ResolvedResourcesRoot "data"
}

function Get-FullPathSafe {
  param([string]$Path)
  return [System.IO.Path]::GetFullPath($Path)
}

function Assert-PathUnder {
  param(
    [string]$Child,
    [string]$Parent,
    [string]$Label
  )

  $childFull = Get-FullPathSafe $Child
  $parentFull = (Get-FullPathSafe $Parent).TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
  if (-not $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label is outside expected root. Path=$childFull Root=$parentFull"
  }
}

function Assert-File {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label missing: $Path"
  }
}

function Get-FileSha256Safe {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return ""
  }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Copy-DirectoryExact {
  param(
    [string]$Source,
    [string]$Destination,
    [string]$AllowedParent
  )

  Assert-PathUnder -Child $Destination -Parent $AllowedParent -Label "OpenClaw plugin destination"
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

function Copy-FileIfDifferent {
  param(
    [string]$Source,
    [string]$Destination,
    [string]$AllowedParent
  )

  Assert-PathUnder -Child $Destination -Parent $AllowedParent -Label "OpenClaw sidecar destination"
  $sourceHash = Get-FileSha256Safe $Source
  $destHash = Get-FileSha256Safe $Destination
  if ($sourceHash -and $sourceHash -eq $destHash) {
    return
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Ensure-OpenClawConfigEntry {
  param(
    [string]$ConfigPath,
    [switch]$VerifyOnly
  )

  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "OpenClaw config missing: $ConfigPath"
  }

  $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $changed = $false

  if (-not $config.plugins -or $config.plugins -isnot [psobject]) {
    if ($VerifyOnly) { throw "OpenClaw config missing plugins object." }
    $config | Add-Member -NotePropertyName plugins -NotePropertyValue ([pscustomobject]@{}) -Force
    $changed = $true
  }
  if (-not $config.plugins.entries -or $config.plugins.entries -isnot [psobject]) {
    if ($VerifyOnly) { throw "OpenClaw config missing plugins.entries object." }
    $config.plugins | Add-Member -NotePropertyName entries -NotePropertyValue ([pscustomobject]@{}) -Force
    $changed = $true
  }

  foreach ($pluginId in @("browser", "desktop-control", "skill-manager")) {
    $entry = $config.plugins.entries.PSObject.Properties[$pluginId]
    if (-not $entry) {
      if ($VerifyOnly) { throw "OpenClaw config missing plugin entry: $pluginId" }
      $config.plugins.entries | Add-Member -NotePropertyName $pluginId -NotePropertyValue ([pscustomobject]@{ enabled = $true }) -Force
      $changed = $true
      continue
    }
    if ($entry.Value.enabled -ne $true) {
      if ($VerifyOnly) { throw "OpenClaw plugin is not enabled: $pluginId" }
      $entry.Value.enabled = $true
      $changed = $true
    }
    foreach ($pathKey in @("path", "entry", "source", "root")) {
      if ($entry.Value.PSObject.Properties[$pathKey]) {
        $value = [string]$entry.Value.$pathKey
        if ($value -match "C:\\tmp|Desktop|Downloads|AppData|\.openclaw") {
          throw "OpenClaw plugin entry contains stale/non-portable path: $pluginId.$pathKey"
        }
      }
    }
  }

  $allow = @()
  if ($config.plugins.allow -is [array]) {
    $allow = @($config.plugins.allow)
  }
  foreach ($pluginId in @("browser", "desktop-control", "skill-manager")) {
    if ($allow -notcontains $pluginId) {
      if ($VerifyOnly) { throw "OpenClaw plugins.allow missing: $pluginId" }
      $allow += $pluginId
      $changed = $true
    }
  }
  if ($changed -and -not $VerifyOnly) {
    $config.plugins | Add-Member -NotePropertyName allow -NotePropertyValue $allow -Force
    $json = $config | ConvertTo-Json -Depth 30
    [System.IO.File]::WriteAllText($ConfigPath, $json + "`n", [System.Text.UTF8Encoding]::new($false))
  }
}

$resourcesRootResolved = Resolve-ResourcesRoot $ResourcesRoot
$dataRootResolved = Resolve-DataRoot -InputRoot $DataRoot -ResolvedResourcesRoot $resourcesRootResolved

$openclawRuntime = Join-Path $resourcesRootResolved "runtime\openclaw"
$sourceExtensions = Join-Path $openclawRuntime "dist\extensions"
$runtimeExtensions = Join-Path $openclawRuntime "node_modules\@qingchencloud\openclaw-zh\dist\extensions"
$runtimeBin = Join-Path $openclawRuntime "bin"
$configPath = Join-Path $dataRootResolved ".openclaw\openclaw.json"

Assert-File (Join-Path $openclawRuntime "openclaw.cmd") "OpenClaw launcher"
Assert-File (Join-Path $openclawRuntime "node.exe") "OpenClaw node.exe"

foreach ($pluginId in @("desktop-control", "skill-manager")) {
  $source = Join-Path $sourceExtensions $pluginId
  $dest = Join-Path $runtimeExtensions $pluginId
  Assert-File (Join-Path $source "openclaw.plugin.json") "OpenClaw plugin manifest: $pluginId"
  Assert-File (Join-Path $source "index.js") "OpenClaw plugin entry: $pluginId"

  if ($VerifyOnly) {
    Assert-File (Join-Path $dest "openclaw.plugin.json") "Registered OpenClaw plugin manifest: $pluginId"
    Assert-File (Join-Path $dest "index.js") "Registered OpenClaw plugin entry: $pluginId"
    if ((Get-FileSha256Safe (Join-Path $source "openclaw.plugin.json")) -ne (Get-FileSha256Safe (Join-Path $dest "openclaw.plugin.json"))) {
      throw "Registered OpenClaw plugin manifest hash mismatch: $pluginId"
    }
    if ((Get-FileSha256Safe (Join-Path $source "index.js")) -ne (Get-FileSha256Safe (Join-Path $dest "index.js"))) {
      throw "Registered OpenClaw plugin entry hash mismatch: $pluginId"
    }
  } else {
    Copy-DirectoryExact -Source $source -Destination $dest -AllowedParent $runtimeExtensions
  }
}

$agentSource = Join-Path $resourcesRootResolved "bin\desktop-control-agent.exe"
$agentDest = Join-Path $runtimeBin "desktop-control-agent.exe"
Assert-File $agentSource "desktop-control sidecar source"
if ($VerifyOnly) {
  Assert-File $agentDest "desktop-control sidecar registered copy"
  if ((Get-FileSha256Safe $agentSource) -ne (Get-FileSha256Safe $agentDest)) {
    throw "desktop-control sidecar hash mismatch."
  }
} else {
  Copy-FileIfDifferent -Source $agentSource -Destination $agentDest -AllowedParent $runtimeBin
}

Ensure-OpenClawConfigEntry -ConfigPath $configPath -VerifyOnly:$VerifyOnly

Write-Host "OpenClaw desktop-control files: PASS"
Write-Host "OpenClaw desktop-control registration: PASS"
Write-Host "OpenClaw plugin paths portable: PASS"
Write-Host "No stale desktop-control path: PASS"
