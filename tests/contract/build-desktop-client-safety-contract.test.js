import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function stripComments(text) {
  return text
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('#'))
    .join('\n')
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `missing function ${name}`)
  const next = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

test('build desktop script does not mutate source resources data or runtime', () => {
  const script = stripComments(readText('scripts/build-desktop-client.ps1'))

  assert.doesNotMatch(
    script,
    /Prepare-PortableDataState\s*\(\s*Join-Path\s+\$ResourcesDir\s+["']data["']\s*\)/,
    'candidate builder must not sanitize or delete files under source src-tauri/resources/data',
  )
  assert.doesNotMatch(
    script,
    /Copy-Directory\s+\$ResourcesDir\s+\(Join-Path\s+\$OutDir\s+["']resources["']\)/,
    'candidate builder must not whole-copy src-tauri/resources into the package',
  )
  assert.match(script, /Copy-PackagedResourcesAllowlist/, 'candidate builder must use an allowlisted resource copy path')
  assert.match(script, /Assert-SuperClawOpenClawPluginSources/, 'source OpenClaw plugin inputs should be validated without writing runtime source')
  assert.match(script, /Sync-SuperClawOpenClawPlugins\s+\$PackagedResources/, 'OpenClaw plugin sync must target packaged resources')
})

test('packaged OpenClaw config is sanitized and keeps coding profile', () => {
  const script = stripComments(readText('scripts/build-desktop-client.ps1'))
  const openclawConfig = functionBody(script, 'Write-PortableOpenClawConfig')

  assert.doesNotMatch(openclawConfig, /profile\s*=\s*["']minimal["']/, 'packaged OpenClaw config must not default to minimal')
  assert.match(openclawConfig, /profile\s*=\s*["']coding["']/, 'packaged OpenClaw config should default to coding')
  assert.doesNotMatch(openclawConfig, /superclaw-portable-local/, 'packaged OpenClaw config must not contain a fixed gateway token')
  assert.match(openclawConfig, /token\s*=\s*['"]\$\{OPENCLAW_GATEWAY_TOKEN\}['"]|token\s*=\s*['"]['"]/, 'gateway token must be blank or an environment placeholder')
  assert.doesNotMatch(openclawConfig, /C:\\Users\\csys1\\\.openclaw\\openclaw\.json/i, 'builder must not read the developer private OpenClaw config')
})

test('packaged relay config does not include a real api key', () => {
  const script = stripComments(readText('scripts/build-desktop-client.ps1'))
  const relayConfig = functionBody(script, 'Write-PortableClaudePanelRelayConfig')

  assert.match(relayConfig, /apiKey\s*=\s*['"]\$\{CLAUDE_RELAY_API_KEY\}['"]|apiKey\s*=\s*['"]['"]/, 'relay apiKey must be empty or an environment placeholder')
  assert.doesNotMatch(relayConfig, /apiKey\s*=\s*["'](?!\$\{CLAUDE_RELAY_API_KEY\}["'])[^"']{8,}["']/, 'relay apiKey must not be a packaged real value')
})

test('packaged resource allowlist blocks user state and source data copies', () => {
  const script = stripComments(readText('scripts/build-desktop-client.ps1'))
  const allowlist = functionBody(script, 'Copy-PackagedResourcesAllowlist')

  assert.match(allowlist, /runtime/, 'runtime resources remain allowlisted')
  assert.match(allowlist, /bin/, 'binary resources remain allowlisted')
  assert.match(allowlist, /templates/, 'template resources remain allowlisted')
  assert.match(allowlist, /data\\ocr|data\/ocr/, 'only OCR data may be copied from source data')
  assert.doesNotMatch(allowlist, /Copy-Directory\s+\(Join-Path\s+\$SourceResources\s+["']data["']\)/, 'source resources/data must not be copied wholesale')

  for (const forbidden of ['browser', 'profile', 'logs', 'db', 'sessions', 'runtime\\data\\secrets']) {
    assert.match(script.toLowerCase(), new RegExp(forbidden.replaceAll('\\', '\\\\').toLowerCase()), `builder should name and block ${forbidden}`)
  }
})

test('release gate includes build desktop safety contract without running packaging', () => {
  const releaseGate = readText('scripts/check-release-gates.mjs')

  assert.match(
    releaseGate,
    /tests\/contract\/build-desktop-client-safety-contract\.test\.js/,
    'build desktop safety contract must be included in Release Gate',
  )
  assert.doesNotMatch(releaseGate, /build-desktop-client\.ps1|tauri:build|build:desktop/, 'Release Gate must not run packaging commands')
})
