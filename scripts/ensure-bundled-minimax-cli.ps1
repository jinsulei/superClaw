# Ensures the official MiniMax CLI archive is unpacked into the existing OpenClaw Node runtime for development.
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root 'src-tauri\resources\runtime\openclaw'
$Archive = Join-Path $Root 'src-tauri\resources\runtime\minimax\mmx-cli-1.0.18.tgz'
$Target = Join-Path $Runtime 'node_modules\mmx-cli'
$Entry = Join-Path $Target 'dist\mmx.mjs'

if (Test-Path -LiteralPath $Entry -PathType Leaf) {
  exit 0
}
if (-not (Test-Path -LiteralPath $Archive -PathType Leaf)) {
  throw "Bundled MiniMax CLI archive is missing: $Archive"
}
if (-not (Test-Path -LiteralPath (Join-Path $Runtime 'node.exe') -PathType Leaf)) {
  throw "Bundled OpenClaw Node runtime is missing: $Runtime"
}

$Stage = Join-Path $Runtime '.mmx-cli-stage'
if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
try {
  & tar -xf $Archive -C $Stage
  if ($LASTEXITCODE -ne 0) { throw 'Could not unpack the bundled MiniMax CLI archive.' }
  if (-not (Test-Path -LiteralPath (Join-Path $Stage 'package\dist\mmx.mjs') -PathType Leaf)) {
    throw 'Bundled MiniMax CLI archive does not contain mmx.mjs.'
  }
  if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
  Move-Item -LiteralPath (Join-Path $Stage 'package') -Destination $Target
} finally {
  if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
}
