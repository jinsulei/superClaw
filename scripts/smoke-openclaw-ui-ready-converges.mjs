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
  'const healthProbe = await probeOpenClawGatewayHealthForSend().catch(() => null)',
  'markOpenClawGatewayReady(\'dev-status-ready\', { probe: effectiveProbe })',
  'if (_openClawGatewayUiState === \'ready\') {',
  'clearOpenClawTransientConnectionUi()',
], 'OpenClaw ready status hides startup UI and falls back to live health')

includesAll(chat, [
  'function clearOpenClawTransientConnectionUi()',
  'document.getElementById(\'chat-disconnect-bar\')',
  'bar.textContent = \'\'',
  'document.getElementById(\'chat-connect-overlay\')',
], 'OpenClaw ready status clears stale disconnect UI text')

includesAll(chat, [
  'const gatewayCanSend = _openClawGatewayUiState === \'ready\'',
  '_sendBtn.disabled = _sendInputLocked || _openClawPendingResponse || _isSending || _openClawGatewayUiState !== \'ready\'',
], 'OpenClaw send button follows latest ready state')

includesAll(chat, [
  'const healthProbe = await probeOpenClawGatewayHealthForSend().catch(() => null)',
  "markOpenClawGatewayReady(`${reason}-health-converged-ready`, { probe: healthProbe })",
  "const probe = await probeAgentGateway('openclaw', { timeoutMs: 1800 }).catch(() => null)",
  "markOpenClawGatewayReady(`${reason}-converged-ready`, { probe })",
], 'OpenClaw convergence probes ready state before showing checking UI')

includesAll(chat, [
  "markOpenClawGatewayReady('auto-enter-health-ready', { probe: healthProbe })",
  "await connectGateway({ skipProbe: true })",
], 'OpenClaw auto-enter uses live health before slower dev status')

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
