import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const devApi = readFileSync('scripts/dev-api.js', 'utf8')
const tauriCommands = readFileSync('src-tauri/src/commands/mod.rs', 'utf8')
const tauriConfigCommands = readFileSync('src-tauri/src/commands/config.rs', 'utf8')
const releaseGate = readFileSync('scripts/check-release-gates.mjs', 'utf8')
const modelPage = readFileSync('src/pages/models.js', 'utf8')
const buildDesktop = readFileSync('scripts/build-desktop-client.ps1', 'utf8')

test('dev-api calibration keeps OpenClaw effective tools.profile on coding', () => {
  assert.match(devApi, /const\s+OPENCLAW_EFFECTIVE_TOOLS_PROFILE\s*=\s*'coding'/)
  assert.doesNotMatch(devApi, /next\.profile\s*=\s*'minimal'/)
  assert.doesNotMatch(devApi, /profile:\s*'minimal'/)
  assert.doesNotMatch(devApi, /config\.tools\.profile\s*=\s*'minimal'/)
  assert.match(devApi, /next\.profile\s*=\s*OPENCLAW_EFFECTIVE_TOOLS_PROFILE/)
  assert.match(devApi, /profile:\s*OPENCLAW_EFFECTIVE_TOOLS_PROFILE/)
  assert.match(devApi, /config\.tools\.profile\s*=\s*OPENCLAW_EFFECTIVE_TOOLS_PROFILE/)
})

test('Tauri OpenClaw config initialization does not restore minimal profile', () => {
  assert.doesNotMatch(tauriCommands, /"profile":\s*"minimal"/)
  assert.doesNotMatch(tauriCommands, /Some\("minimal"\)/)
  assert.doesNotMatch(tauriCommands, /json!\("minimal"\)/)
  assert.match(tauriCommands, /const\s+OPENCLAW_EFFECTIVE_TOOLS_PROFILE:\s*&str\s*=\s*"coding"/)
  assert.match(tauriCommands, /"profile":\s*OPENCLAW_EFFECTIVE_TOOLS_PROFILE/)
  assert.match(tauriCommands, /Some\(OPENCLAW_EFFECTIVE_TOOLS_PROFILE\)/)
})

test('Tauri calibration keeps the effective coding profile and agent session visibility', () => {
  assert.match(tauriConfigCommands, /"profile":\s*"coding"/)
  assert.match(tauriConfigCommands, /"visibility":\s*"agent"/)
  assert.doesNotMatch(tauriConfigCommands, /Value::String\("full"\.into\(\)\)/)
  assert.doesNotMatch(tauriConfigCommands, /Value::String\("all"\.into\(\)\)/)
})

test('OpenClaw native execution keeps workspace context and skills unrestricted', () => {
  assert.match(tauriCommands, /contextInjection"\)\.and_then\(\|v\| v\.as_str\(\)\) != Some\("always"\)/)
  assert.match(tauriCommands, /defaults\.remove\("skills"\)/)
  assert.match(tauriCommands, /agent\.remove\("skills"\)/)
  assert.match(tauriCommands, /agent\s*\.entry\("tools"\)/)
  assert.match(tauriCommands, /OPENCLAW_EFFECTIVE_TOOLS_PROFILE/)
  assert.match(modelPage, /config\.agents\.defaults\.contextInjection = 'always'/)
  assert.match(modelPage, /agent\.tools\.profile = 'coding'/)
  assert.match(modelPage, /config\.tools\.profile = 'coding'/)
  assert.doesNotMatch(modelPage, /profile = agent\.tools\.profile \|\| 'minimal'/)
  assert.match(buildDesktop, /contextInjection = "always"/)
})

test('minimal can remain a valid profile name but not the default recovery target', () => {
  assert.match(devApi, /OPENCLAW_SUPPORTED_TOOLS_PROFILES/)
  assert.match(devApi, /'minimal'/)
  assert.match(devApi, /'coding'/)
})

test('OpenClaw effective profile regression is included in release gate', () => {
  assert.match(
    releaseGate,
    /node',\s*'--test',\s*'tests\/regression\/openclaw-tools-profile-effective-regression\.test\.js'/,
  )
})
