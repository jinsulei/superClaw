import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

function assert(condition, label, details = '') {
  if (!condition) {
    console.error(`${label}: FAIL${details ? ` - ${details}` : ''}`)
    process.exitCode = 1
    return
  }
  console.log(`${label}: PASS`)
}

const appState = read('src/lib/app-state.js')
const devApi = read('scripts/dev-api.js')
const chat = read('src/pages/chat.js')

assert(
  appState.includes('probeOpenclawGatewayHealth') &&
    appState.includes('http://127.0.0.1:18789/health') &&
    appState.includes('health.ready'),
  'APP_STATE_HEALTH_READY_GATES_GATEWAY',
)

assert(
  devApi.includes('probeOpenclawGatewayHealth') &&
    devApi.includes('waitForGatewayReady') &&
    devApi.includes('health_ready') &&
    devApi.includes('process_running') &&
    devApi.includes('OpenClaw Gateway 启动超时，请点击重新连接'),
  'DEV_API_HEALTH_READY_GATES_SERVICE_STATUS',
)

assert(
  devApi.includes('owned_by_current_instance') &&
    devApi.includes('foreignGatewayError') &&
    devApi.includes('ensureOwnedGatewayOrThrow') &&
    devApi.includes('gateway-owner.json') &&
    devApi.includes('windowsGatewayPidBelongsToCurrentProject(pid)') &&
    devApi.includes('shouldAutoClaimGateway(owner, pid || null)'),
  'OLD_OR_FOREIGN_GATEWAY_NOT_TREATED_AS_READY',
)

assert(
  chat.includes('OPENCLAW_GATEWAY_SEND_READY_TIMEOUT_MS = 30000') &&
    chat.includes('waitForOpenClawGatewayReady') &&
    chat.includes('ensureOpenClawGatewayReadyForSend') &&
    chat.includes('OpenClaw Gateway 正在启动，请稍候'),
  'OPENCLAW_SEND_WAITS_FOR_GATEWAY_READY',
)

const sendGuardCount = (chat.match(/if \(!\(await ensureOpenClawGatewayReadyForSend\(\)\)\) return/g) || []).length
assert(sendGuardCount >= 2, 'OPENCLAW_SEND_AND_QUEUE_GUARDED', `count=${sendGuardCount}`)

if (process.exitCode) process.exit(process.exitCode)
