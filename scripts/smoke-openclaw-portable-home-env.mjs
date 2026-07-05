import assert from 'node:assert/strict'
import fs from 'node:fs'

const rustUtils = fs.readFileSync('src-tauri/src/utils.rs', 'utf8')
const devApi = fs.readFileSync('scripts/dev-api.js', 'utf8')

for (const marker of [
  'OPENCLAW_HOME',
  'OPENCLAW_STATE_DIR',
  'OPENCLAW_CONFIG_PATH',
  'OPENCLAW_LOG_DIR',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
]) {
  assert.ok(rustUtils.includes(marker), `Tauri OpenClaw command env must include ${marker}`)
  assert.ok(devApi.includes(marker), `dev-api OpenClaw command env must include ${marker}`)
}

assert.ok(
  rustUtils.includes('openclaw_portable_home_dir'),
  'Tauri OpenClaw commands must derive a portable home from resources/data'
)
assert.ok(
  rustUtils.includes('openclaw_dir.join("logs")'),
  'Tauri OpenClaw commands must keep logs under the portable OpenClaw dir'
)
assert.ok(
  devApi.includes('openclawPortableProcessEnv'),
  'dev-api OpenClaw commands must derive portable process env'
)
assert.ok(
  devApi.includes("path.join(home, 'AppData', 'Roaming')"),
  'dev-api OpenClaw APPDATA must be under portable resources/data'
)
assert.ok(
  devApi.includes("path.join(home, 'AppData', 'Local')"),
  'dev-api OpenClaw LOCALAPPDATA must be under portable resources/data'
)

console.log('smoke-openclaw-portable-home-env PASS')
