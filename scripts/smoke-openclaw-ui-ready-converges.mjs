import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const chat = readFileSync(join(root, 'src', 'pages', 'chat.js'), 'utf8')
const sidebar = readFileSync(join(root, 'src', 'components', 'sidebar.js'), 'utf8')

function includesAll(source, terms, label) {
  for (const term of terms) {
    assert.ok(source.includes(term), `${label} missing: ${term}`)
  }
}

includesAll(chat, [
  'function scheduleOpenClawGatewayUiConvergence',
  'scheduleOpenClawGatewayUiConvergence(\'render\')',
  'clearOpenClawGatewayUiConvergenceTimers()',
  '_page !== pageRef',
  'pageRef?.isConnected',
  'autoStartOpenClawGatewayOnEnter().catch',
], 'OpenClaw render schedules attached-DOM convergence')

includesAll(chat, [
  'function refreshOpenClawGatewayUiState()',
  'hasOpenClawGatewayReadySignal(probe) ? \'ready\' : normalizeGatewayUiState(probe)',
  'if (state === \'ready\') markOpenClawGatewayReady(\'dev-status-ready\', { probe })',
  'if (_openClawGatewayUiState === \'ready\') {',
  'if (overlay) overlay.style.display = \'none\'',
], 'OpenClaw ready status hides startup UI')

includesAll(chat, [
  'const gatewayCanSend = _openClawGatewayUiState === \'ready\'',
  '_sendBtn.disabled = _sendInputLocked || _isSending || _openClawGatewayUiState !== \'ready\'',
], 'OpenClaw send button follows latest ready state')

includesAll(sidebar, [
  'function _isOpenClawGatewaySwitchReady(status)',
  'async function _readOpenClawGatewaySwitchStatus()',
  '/__api/dev/agents/status?agent=openclaw',
  'if (_isOpenClawGatewaySwitchReady(currentStatus))',
  'if (_isOpenClawGatewaySwitchReady(readyStatus))',
], 'OpenClaw switch checks dev ready before restart')

const currentReadyReturn = sidebar.indexOf('if (_isOpenClawGatewaySwitchReady(currentStatus))')
const firstRestart = sidebar.indexOf("api.restartService('ai.openclaw.gateway')")
assert.ok(currentReadyReturn >= 0 && firstRestart >= 0 && currentReadyReturn < firstRestart,
  'OpenClaw switch must return on ready status before restart')

console.log('OPENCLAW_UI_READY_TRUE_SHOWS_ONLINE: PASS')
console.log('OPENCLAW_SEND_ENABLED_WHEN_READY: PASS')
console.log('OPENCLAW_REFRESH_STATUS_ON_AGENT_SWITCH: PASS')
console.log('OPENCLAW_NO_RESTART_WHEN_READY: PASS')
console.log('OPENCLAW_HEALTH_READY_UI_CONSISTENT: PASS')
