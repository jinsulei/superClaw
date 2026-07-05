import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const chat = readFileSync(join(root, 'src', 'pages', 'chat.js'), 'utf8')
const sidebar = readFileSync(join(root, 'src', 'components', 'sidebar.js'), 'utf8')
const appState = readFileSync(join(root, 'src', 'lib', 'app-state.js'), 'utf8')
const openclawEngine = readFileSync(join(root, 'src', 'engines', 'openclaw', 'index.js'), 'utf8')
const tauriService = readFileSync(join(root, 'src-tauri', 'src', 'commands', 'service.rs'), 'utf8')

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
  'function _isOwnedOpenClawGatewayRunning(gateway)',
  'async function _readOwnedOpenClawGatewayServiceStatus()',
  "source = 'tauri-service-status'",
  '/__api/dev/agents/status?agent=openclaw',
  'if (_isOpenClawGatewaySwitchReady(currentStatus))',
  'if (_isOpenClawGatewaySwitchReady(readyStatus))',
], 'OpenClaw switch checks dev ready before restart')

const currentReadyReturn = sidebar.indexOf('if (_isOpenClawGatewaySwitchReady(currentStatus))')
const firstRestart = sidebar.indexOf("api.restartService('ai.openclaw.gateway')")
assert.ok(currentReadyReturn >= 0 && firstRestart >= 0 && currentReadyReturn < firstRestart,
  'OpenClaw switch must return on ready status before restart')

assert.ok(sidebar.includes('api.claimGateway().catch(() => null)'),
  'OpenClaw switch must claim, not restart, after pairing repair when gateway is already running')
assert.ok(!sidebar.includes("pairingRepaired) {\n      await _runSwitchProgressStep(progress, 50, 64, () => api.restartService('ai.openclaw.gateway'))"),
  'OpenClaw switch must not restart an already-running packaged gateway after pairing repair')

includesAll(appState, [
  'function _isOwnedGatewayServiceRunning(gateway)',
  'if (ownedRunning && isTauri) {',
  '_setGatewayRunning(true, false)',
], 'OpenClaw global gateway status trusts packaged service ownership')

assert.ok(!openclawEngine.includes("if (pairingRepaired) {\n          await api.restartService('ai.openclaw.gateway')"),
  'OpenClaw engine boot must not restart an already-running packaged gateway after pairing repair')
assert.ok(openclawEngine.includes('await api.claimGateway().catch((e) => {'),
  'OpenClaw engine boot should claim a running gateway without restarting it')

const windowsStartMatch = tauriService.match(/pub async fn start_service_impl\(_label: &str\) -> Result<\(\), String> \{[\s\S]*?let \(stdout_log, stderr_log\) = create_gateway_log_files\(\)\?;/)
assert.ok(windowsStartMatch, 'Windows start_service_impl block must be present')
const windowsStartBlock = windowsStartMatch[0]
const startStatusCheck = windowsStartBlock.indexOf('let (running, pid) = check_service_status(0, "");')
const zombieCleanup = windowsStartBlock.indexOf('cleanup_zombie_gateway_processes();')
assert.ok(startStatusCheck >= 0 && zombieCleanup >= 0 && startStatusCheck < zombieCleanup,
  'Windows start_service_impl must check an already-running gateway before zombie cleanup')

const cleanupMatch = tauriService.match(/pub\(crate\) fn cleanup_zombie_gateway_processes\(\) \{[\s\S]*?fn get_gateway_pid_by_port/)
assert.ok(cleanupMatch, 'cleanup_zombie_gateway_processes block must be present')
includesAll(cleanupMatch[0], [
  'if gateway_pid_belongs_to_current_project(pid) {',
  '跳过僵尸清理以避免中断正在执行的请求',
  '*known = Some(pid);',
  'continue;',
], 'OpenClaw zombie cleanup skips current packaged gateway during active generation')

includesAll(tauriService, [
  'static GATEWAY_START_IN_FLIGHT: AtomicBool = AtomicBool::new(false);',
  'struct GatewayStartGuard;',
  'fn try_enter_gateway_start() -> Option<GatewayStartGuard>',
  'let Some(_start_guard) = try_enter_gateway_start() else {',
  '避免重复 Hidden-start',
  'Gateway 正在启动但 30 秒内未就绪',
], 'OpenClaw Windows startup serializes concurrent hidden-start requests')

console.log('OPENCLAW_UI_READY_TRUE_SHOWS_ONLINE: PASS')
console.log('OPENCLAW_SEND_ENABLED_WHEN_READY: PASS')
console.log('OPENCLAW_REFRESH_STATUS_ON_AGENT_SWITCH: PASS')
console.log('OPENCLAW_NO_RESTART_WHEN_READY: PASS')
console.log('OPENCLAW_HEALTH_READY_UI_CONSISTENT: PASS')
console.log('OPENCLAW_PACKAGED_GATEWAY_SERVICE_STATUS_TRUSTED: PASS')
console.log('OPENCLAW_NO_RESTART_ON_PACKAGED_GATEWAY_RUNNING: PASS')
console.log('OPENCLAW_TAURI_START_CHECKS_RUNNING_BEFORE_CLEANUP: PASS')
console.log('OPENCLAW_ZOMBIE_CLEANUP_SKIPS_CURRENT_PACKAGE_GATEWAY: PASS')
console.log('OPENCLAW_TAURI_STARTUP_SINGLE_FLIGHT: PASS')
