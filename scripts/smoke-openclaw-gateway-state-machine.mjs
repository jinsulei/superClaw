import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(rel) {
  const p = path.join(root, rel)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}

function assert(cond, message) {
  if (!cond) {
    console.error(`[FAIL] ${message}`)
    process.exitCode = 1
  } else {
    console.log(`[PASS] ${message}`)
  }
}

const chat = read('src/pages/chat.js')
const helper = read('src/lib/agent-gateway-status.js')
const devApi = read('scripts/dev-api.js')

assert(chat, 'OpenClaw chat page exists')
assert(helper, 'agent gateway status helper exists')

for (const state of ['stopped', 'starting', 'checking', 'needs_setup', 'ready', 'error']) {
  assert(helper.includes(`'${state}'`) || helper.includes(`"${state}"`) || chat.includes(`'${state}'`) || chat.includes(`"${state}"`), `${state} state exists`)
}

assert(helper.includes('OPENCLAW_GATEWAY_STATES'), 'OpenClaw states are centralized')

const stoppedBlock = helper.match(/case OPENCLAW_GATEWAY_STATES\.STOPPED:[\s\S]*?case OPENCLAW_GATEWAY_STATES\.STARTING:/)
assert(stoppedBlock && !/正在连接 Gateway/.test(stoppedBlock[0]), 'stopped copy does not say connecting')

const readyBlock = helper.match(/case OPENCLAW_GATEWAY_STATES\.READY:[\s\S]*?case OPENCLAW_GATEWAY_STATES\.ERROR:/)
assert(readyBlock && /已连接/.test(readyBlock[0]), 'ready copy owns connected text')
assert(readyBlock && !/启动 Gateway|重新启动 Gateway|修复并重连/.test(readyBlock[0]), 'ready copy does not expose start or reconnect action')
assert(readyBlock && /canSend:\s*true/.test(readyBlock[0]), 'ready copy allows send')

const needsSetupBlock = helper.match(/case OPENCLAW_GATEWAY_STATES\.NEEDS_SETUP:[\s\S]*?case OPENCLAW_GATEWAY_STATES\.READY:/)
assert(needsSetupBlock && /canSend:\s*false/.test(needsSetupBlock[0]), 'needs_setup cannot send')
assert(needsSetupBlock && !/启动中/.test(needsSetupBlock[0]), 'needs_setup copy does not say starting')

assert(/action\.style\.display\s*=[^\n]*copy\.showStartButton[^\n]*copy\.showReconnectButton/.test(chat), 'OpenClaw action button visibility follows unified copy flags')
assert(/_openClawGatewayUiState !== ['"]ready['"]/.test(chat), 'send button is disabled before ready')
const sendStateBlock = chat.match(/function updateSendState\(\)[\s\S]*?function /)
assert(sendStateBlock && /gatewayCanSend\s*=\s*_openClawGatewayUiState\s*===\s*['"]ready['"]/.test(sendStateBlock[0]), 'send button only enables from ready ui state')
assert(sendStateBlock && !/gatewayCanSend\s*=[^\n]*(portListening|verified|progress|connected|wsClient\.gatewayReady)/.test(sendStateBlock[0]), 'send button does not use probe-only signals as ready')
assert(/startOrRepairOpenClawGateway/.test(chat), 'start and repair use one OpenClaw handler')
assert(/finalizeOpenClawProgressReady/.test(chat), 'OpenClaw startup completion uses final ready probe helper')
assert(/assertAgentReadyBeforeSend\(\s*['"]openclaw['"]/.test(chat), 'OpenClaw send path asserts readiness')
assert(/probeAgentGateway\(\s*['"]openclaw['"]/.test(chat), 'OpenClaw page probes gateway readiness')
assert(/stopAgentOnPageClose\(\s*['"]openclaw['"]\s*\)/.test(chat), 'OpenClaw page cleanup stops OpenClaw agent')

assert(/dev\/agents\/status/.test(devApi) && /ready/.test(devApi) && /needsSetup/.test(devApi) && /portListening/.test(devApi), 'dev status exposes ready/needsSetup/portListening')
assert(/OPENCLAW_MINIMAX_API_KEY_REQUIRED/.test(devApi), 'dev status detects OpenClaw MiniMax key setup')
assert(/agent === ['"]openclaw['"][\s\S]*?portListening\s*&&\s*verified[\s\S]*?['"]checking['"][\s\S]*?:\s*['"]error['"]/.test(devApi), 'OpenClaw health not-ready is checking/error, not ready')
assert(!/ready\s*=\s*portListening/.test(devApi), 'dev status does not treat portListening as ready')

assert(!/taskkill\s+\/IM\s+node\.exe/i.test(devApi), 'no global taskkill node.exe')
assert(!/taskkill\s+\/IM\s+python\.exe/i.test(devApi), 'no global taskkill python.exe')
assert(!/Stop-Process\s+-Name\s+node/i.test(devApi), 'no Stop-Process node')
assert(!/Stop-Process\s+-Name\s+python/i.test(devApi), 'no Stop-Process python')

if (process.exitCode) {
  console.error('\nopenclaw gateway state machine smoke failed')
  process.exit(process.exitCode)
}

console.log('\nopenclaw gateway state machine smoke passed')
