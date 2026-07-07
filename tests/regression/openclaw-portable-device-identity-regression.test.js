import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const deviceSource = readFileSync('src-tauri/src/commands/device.rs', 'utf8')
const pairingSource = readFileSync('src-tauri/src/commands/pairing.rs', 'utf8')
const commandsSource = readFileSync('src-tauri/src/commands/mod.rs', 'utf8')
const openClawEngineSource = readFileSync('src/engines/openclaw/index.js', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')
const buildScriptSource = readFileSync('scripts/build-desktop-client.ps1', 'utf8')

test('portable package does not embed a static device key', () => {
  assert.doesNotMatch(buildScriptSource, /clawpanel-device-key\.json/i)
  assert.doesNotMatch(buildScriptSource, /devices[\\/]+paired\.json/i)
})

test('device identity generation can target a portable OpenClaw data directory', () => {
  assert.match(deviceSource, /pub\(crate\)\s+fn\s+get_or_create_key_in_dir/)
  assert.match(deviceSource, /openclaw_dir\(\)/)
  assert.match(deviceSource, /get_or_create_key_in_dir\(&dir\)/)
  assert.match(deviceSource, /DEVICE_KEY_FILE/)
  assert.match(deviceSource, /clawpanel-device-key\.json/)
})

test('portable first-run pairing writes paired.json in the portable data directory', () => {
  assert.match(pairingSource, /pub\(crate\)\s+fn\s+ensure_pairing_for_dir/)
  assert.match(pairingSource, /get_or_create_key_in_dir\(openclaw_dir\)/)
  assert.match(pairingSource, /join\("devices"\)[\s\S]*join\("paired\.json"\)/)
  assert.match(pairingSource, /createdAtMs/)
  assert.match(pairingSource, /approvedAtMs/)
})

test('portable OpenClaw config bootstraps device identity before gateway probing', () => {
  const portableConfigHelper = commandsSource.slice(
    commandsSource.indexOf('fn ensure_portable_openclaw_config'),
    commandsSource.indexOf('pub fn openclaw_dir'),
  )
  assert.match(portableConfigHelper, /ensure_portable_device_identity/)
  assert.match(portableConfigHelper, /pairing::ensure_pairing_for_dir\(openclaw_dir\)/)
  assert.match(commandsSource, /fn\s+ensure_portable_device_identity/)
  assert.match(commandsSource, /ensure_portable_openclaw_config\(&portable\)/)
})

test('OpenClaw boot still pairs before gateway start and keeps tools profile coding', () => {
  assert.match(openClawEngineSource, /api\.autoPairDevice\(\)/)
  assert.match(openClawEngineSource, /api\.startService\('ai\.openclaw\.gateway'\)/)
  assert.match(commandsSource, /const\s+OPENCLAW_EFFECTIVE_TOOLS_PROFILE:\s*&str\s*=\s*"coding"/)
  assert.match(commandsSource, /"profile":\s*OPENCLAW_EFFECTIVE_TOOLS_PROFILE/)
})

test('portable device identity regression is release-gated and avoids secrets', () => {
  assert.match(
    releaseGateSource,
    /node',\s*'--test',\s*'tests\/regression\/openclaw-portable-device-identity-regression\.test\.js'/,
  )

  const forbidden = [
    'gateway.auth.token',
    'models.providers.minimax.apiKey',
    'OPENCLAW_GATEWAY_TOKEN',
    'MINIMAX_API_KEY',
  ]
  for (const marker of forbidden) {
    assert.equal(deviceSource.includes(marker), false, `device.rs must not reference ${marker}`)
    assert.equal(pairingSource.includes(marker), false, `pairing.rs must not reference ${marker}`)
  }
})
