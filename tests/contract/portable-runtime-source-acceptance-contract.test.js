import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function manifestRow(manifest, runtimeName) {
  const row = manifest
    .split(/\r?\n/)
    .find(line => line.startsWith(`| ${runtimeName} |`))
  assert.ok(row, `RUNTIME_MANIFEST must record ${runtimeName}`)
  return row
}

test('runtime manifest records uv-python and uv-tools review fields', () => {
  const manifest = readText('docs/registry/RUNTIME_MANIFEST.md')

  for (const runtimeName of ['uv-python', 'uv-tools']) {
    const row = manifestRow(manifest, runtimeName)
    for (const requiredField of ['source', 'checksum', 'license', 'review_status']) {
      assert.match(
        manifest,
        new RegExp(`\\b${requiredField}\\b`),
        `manifest must expose ${requiredField} for runtime source review`,
      )
    }
    assert.doesNotMatch(row, /\|\s*\|/, `${runtimeName} manifest row must not contain empty cells`)
  }

  assert.match(manifest, /runtime_version/, 'manifest must record runtime version field')
})

test('uv runtime source acceptance requires executable probes', () => {
  const manifest = readText('docs/registry/RUNTIME_MANIFEST.md')

  assert.match(manifest, /uv-python[\s\S]*python\.exe/i, 'uv-python acceptance must require python.exe')
  assert.match(manifest, /uv-tools[\s\S]*uv\.exe/i, 'uv-tools acceptance must require uv.exe')
})

test('runtime source acceptance blocks secrets and user state', () => {
  const manifest = readText('docs/registry/RUNTIME_MANIFEST.md')
  const forbidden = [
    '.env',
    'openclaw.json',
    'relay-config',
    'logs',
    'db',
    'sessions',
    'browser profile',
    'runtime/data/secrets',
    'secrets',
  ]

  for (const term of forbidden) {
    assert.match(manifest.toLowerCase(), new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `manifest must explicitly block ${term}`)
  }
})

test('candidate builder still requires uv runtime source executables without downloading', () => {
  const script = readText('scripts/build-desktop-client.ps1')

  assert.match(script, /Assert-Dir\s+\(Join-Path\s+\$ResourcesDir\s+["']runtime\\uv-python["']\)/, 'builder must require uv-python source')
  assert.match(script, /Assert-Dir\s+\(Join-Path\s+\$ResourcesDir\s+["']runtime\\uv-tools["']\)/, 'builder must require uv-tools source')
  assert.match(script, /Assert-File\s+\(Join-Path\s+\$ResourcesDir\s+["']runtime\\uv-tools\\uv\.exe["']\)/, 'builder must require uv-tools/uv.exe source')
  assert.match(script, /Get-ChildItem[\s\S]*runtime\\uv-python[\s\S]*python\.exe/, 'builder must probe packaged uv-python/python.exe')
})

test('release gate includes portable runtime source acceptance contract only', () => {
  const releaseGate = readText('scripts/check-release-gates.mjs')

  assert.match(
    releaseGate,
    /tests\/contract\/portable-runtime-source-acceptance-contract\.test\.js/,
    'portable runtime source acceptance contract must be included in Release Gate',
  )
  assert.doesNotMatch(releaseGate, /download:uv|download-uv|build-desktop-client\.ps1|build:desktop/, 'Release Gate must not download or package runtime sources')
})
