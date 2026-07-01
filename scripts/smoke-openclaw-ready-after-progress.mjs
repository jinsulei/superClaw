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

assert(chat, 'OpenClaw chat page exists')
assert(helper, 'agent gateway status helper exists')

const finalizeMatch = chat.match(/async function finalizeOpenClawProgressReady\(\) \{[\s\S]*?\n\}/)
const finalizeBlock = finalizeMatch?.[0] || ''

assert(/finalizeOpenClawProgressReady/.test(chat), 'finalizeOpenClawProgressReady exists')
assert(
  chat.includes("setOpenClawGatewayUiState('checking', { error: '', progress: 5 })") &&
    chat.indexOf("setOpenClawGatewayUiState('checking', { error: '', progress: 5 })") < chat.indexOf('autoStartOpenClawGatewayOnEnter().catch'),
  'OpenClaw page enters checking progress before auto-start'
)
assert(/setOpenClawGatewayUiState\(\s*['"]checking['"]/.test(finalizeBlock), 'finalize starts with checking state')
assert(/waitForAgentGatewayReady\(\s*['"]openclaw['"]/.test(finalizeBlock), 'finalize performs a real OpenClaw ready probe')
assert(/normalizeGatewayUiState\(probe\)/.test(finalizeBlock), 'finalize normalizes probed gateway state')
assert(/nextState\s*===\s*['"]ready['"]/.test(finalizeBlock), 'finalize only reports ok when probe says ready')

const startMatch = chat.match(/async function startOrRepairOpenClawGateway\(\) \{[\s\S]*?\n\}/)
const startBlock = startMatch?.[0] || ''

assert(/setOpenClawGatewayUiState\(\s*['"]starting['"]/.test(startBlock), 'start handler enters starting state')
assert(startBlock.includes("setOpenClawGatewayUiState('starting', { error: '', progress: 20 })"), 'start handler begins at current startup progress')
assert(/finalizeOpenClawProgressReady\(\)/.test(startBlock), 'start handler delegates completion to final ready probe')
assert(!/setOpenClawGatewayUiState\(\s*['"]ready['"][\s\S]{0,120}api\.startService/.test(startBlock), 'start handler does not mark ready immediately after startService')

const readyBlock = helper.match(/case OPENCLAW_GATEWAY_STATES\.READY:[\s\S]*?case OPENCLAW_GATEWAY_STATES\.ERROR:/)?.[0] || ''
assert(/showStartButton:\s*false/.test(readyBlock), 'ready hides start button')
assert(/showReconnectButton:\s*false/.test(readyBlock), 'ready hides reconnect button')
assert(/canSend:\s*true/.test(readyBlock), 'ready enables send')
assert(/assertAgentReadyBeforeSend\(\s*['"]openclaw['"]/.test(chat), 'send path asserts OpenClaw readiness before wsClient.chatSend')

if (process.exitCode) {
  console.error('\nopenclaw ready-after-progress smoke failed')
  process.exit(process.exitCode)
}

console.log('\nopenclaw ready-after-progress smoke passed')
