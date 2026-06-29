import fs from 'node:fs'

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
  }
}

const chat = read('src/pages/chat.js')
const devApi = read('scripts/dev-api.js')

assert(/async function startOpenClawGateway\s*\(/.test(chat), 'chat.js defines startOpenClawGateway')
assert(/\/__api\/dev\/agents\/start/.test(chat), 'startOpenClawGateway calls /__api/dev/agents/start in Web dev')
assert(/isTauriRuntime\(\)[\s\S]{0,180}api\.startService\('ai\.openclaw\.gateway'\)/.test(chat), 'Tauri path still uses native startService')
assert(/startOrRepairOpenClawGateway[\s\S]{0,400}await startOpenClawGateway\(\)/.test(chat), 'startOrRepairOpenClawGateway delegates to startOpenClawGateway')

assert(/cmd === 'dev\/agents\/start'/.test(devApi), 'dev-api exposes /__api/dev/agents/start')
assert(/async function startDevAgent\s*\(/.test(devApi), 'dev-api defines startDevAgent')
assert(/normalizeAgentName\(agentInput\)/.test(devApi), 'start endpoint normalizes agent name')
assert(/agent !== 'openclaw'/.test(devApi), 'start endpoint currently limits real start behavior to OpenClaw')
assert(/requireOpenClawMiniMaxGatewayConfig\(\)/.test(devApi), 'start endpoint checks OpenClaw MiniMax config before spawn')
assert(/OPENCLAW_MINIMAX_API_KEY_REQUIRED/.test(devApi), 'start endpoint reports missing OpenClaw MiniMax key')
assert(/OPENCLAW_MINIMAX_API_KEY/.test(devApi), 'OpenClaw env includes OPENCLAW_MINIMAX_API_KEY')
assert(/MINIMAX_API_KEY/.test(devApi), 'OpenClaw env includes MINIMAX_API_KEY')
assert(/MINIMAX_CN_API_KEY/.test(devApi), 'OpenClaw env includes MINIMAX_CN_API_KEY')
assert(/openclawMiniMaxGatewayEnv\(\)/.test(devApi), 'OpenClaw gateway spawn uses MiniMax env')
assert(/function prepareOpenClawGatewayLaunchConfig\s*\(/.test(devApi), 'dev-api prepares normalized OpenClaw gateway launch config')
assert(/function normalizeOpenClawGatewayProvider\s*\(/.test(devApi), 'dev-api normalizes OpenClaw provider schema')
assert(/provider\.models\s*=/.test(devApi), 'OpenClaw launch config guarantees provider models array')
assert(/openclawEnvSecretRef\('OPENCLAW_MINIMAX_API_KEY'\)/.test(devApi), 'OpenClaw launch config uses env SecretRef instead of writing raw key')
assert(/OPENCLAW_CONFIG_PATH:\s*launchConfig\.path/.test(devApi), 'OpenClaw gateway child uses normalized launch config path')
assert(/waitForDevAgentReady\('openclaw'|waitForDevAgentReady\(agent/.test(devApi), 'start endpoint polls dev agent readiness')
assert(/attempts:\s*40/.test(devApi), 'start endpoint polls long enough for OpenClaw cold startup')
assert(/delayMs:\s*500/.test(devApi), 'start endpoint polls every 500ms')
assert(/createDevAgentStatus\(agent\)/.test(devApi), 'start endpoint reuses dev status semantics')
assert(/status:\s*'needs_setup'/.test(devApi), 'dev-api status distinguishes needs_setup')
assert(/status:\s*'stopped'/.test(devApi), 'dev-api status distinguishes stopped')

const dangerousGlobalKills = [
  /taskkill\s+\/IM\s+node\.exe/i,
  /taskkill\s+\/IM\s+python\.exe/i,
  /Stop-Process\s+-Name\s+node/i,
  /Stop-Process\s+-Name\s+python/i,
]
for (const pattern of dangerousGlobalKills) {
  assert(!pattern.test(devApi), `dev-api must not contain dangerous global kill: ${pattern}`)
}

if (!process.exitCode) {
  console.log('PASS smoke-openclaw-gateway-start-chain')
}
