import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const deviceSource = readFileSync('src-tauri/src/commands/device.rs', 'utf8')
const pairingSource = readFileSync('src-tauri/src/commands/pairing.rs', 'utf8')
const commandsSource = readFileSync('src-tauri/src/commands/mod.rs', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')
const buildScriptSource = readFileSync('scripts/build-desktop-client.ps1', 'utf8')

test('portable first-run writes all gateway handshake identity stores', () => {
  assert.match(deviceSource, /pub\(crate\)\s+fn\s+ensure_gateway_identity_store_in_dir/)
  assert.match(deviceSource, /const\s+IDENTITY_DEVICE_FILE:\s*&str\s*=\s*"device\.json"/)
  assert.match(deviceSource, /const\s+IDENTITY_DEVICE_AUTH_FILE:\s*&str\s*=\s*"device-auth\.json"/)
  assert.match(deviceSource, /let\s+identity_dir\s*=\s*dir\.join\("identity"\)/)
  assert.match(deviceSource, /identity_dir\.join\(IDENTITY_DEVICE_FILE\)/)
  assert.match(deviceSource, /identity_dir\.join\(IDENTITY_DEVICE_AUTH_FILE\)/)
  assert.match(deviceSource, /publicKeyPem/)
  assert.match(deviceSource, /privateKeyPem/)
  assert.match(deviceSource, /"version":\s*1/)
  assert.match(deviceSource, /"tokens"[\s\S]*"operator"/)
})

test('portable pairing bootstrap calls gateway handshake store before gateway probing', () => {
  assert.match(pairingSource, /ensure_gateway_identity_store_in_dir\(openclaw_dir\)/)
  assert.match(commandsSource, /ensure_portable_device_identity\(openclaw_dir\)/)
  assert.match(commandsSource, /ensure_portable_openclaw_config\(&portable\)/)
})

test('existing gateway handshake identity stores are not overwritten', () => {
  assert.match(deviceSource, /if\s+identity_path\.exists\(\)\s*&&\s*device_auth_path\.exists\(\)/)
  assert.match(deviceSource, /return\s+Ok\(\(\)\)/)
})

test('portable package does not embed static device or auth stores', () => {
  for (const marker of [
    'clawpanel-device-key.json',
    'devices\\\\paired.json',
    'devices/paired.json',
    'identity\\\\device.json',
    'identity/device.json',
    'identity\\\\device-auth.json',
    'identity/device-auth.json',
  ]) {
    assert.equal(buildScriptSource.includes(marker), false, `build script must not embed ${marker}`)
  }
})

test('portable handshake bootstrap keeps tools profile coding and does not edit secrets', () => {
  assert.match(commandsSource, /const\s+OPENCLAW_EFFECTIVE_TOOLS_PROFILE:\s*&str\s*=\s*"coding"/)
  assert.match(commandsSource, /"profile":\s*OPENCLAW_EFFECTIVE_TOOLS_PROFILE/)

  for (const marker of [
    'models.providers.minimax.apiKey',
    'MINIMAX_API_KEY',
    'OPENCLAW_GATEWAY_TOKEN',
  ]) {
    assert.equal(deviceSource.includes(marker), false, `device.rs must not reference ${marker}`)
    assert.equal(pairingSource.includes(marker), false, `pairing.rs must not reference ${marker}`)
  }
})

test('portable handshake regression is release-gated', () => {
  assert.match(
    releaseGateSource,
    /node',\s*'--test',\s*'tests\/regression\/openclaw-portable-device-handshake-regression\.test\.js'/,
  )
})
