import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const chatSource = readFileSync('src/engines/hermes/pages/chat.js', 'utf8')
const storeSource = readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')
const rustSource = readFileSync('src-tauri/src/commands/hermes.rs', 'utf8')
const devApiSource = readFileSync('scripts/dev-api.js', 'utf8')

test('Hermes disables Python bytecode writes in Tauri-watched runtime resources', () => {
  const rustBytecodeGuards = rustSource.match(/\.env\("PYTHONDONTWRITEBYTECODE", "1"\)/g) || []
  assert.ok(rustBytecodeGuards.length >= 4, 'all native Hermes command paths must disable bytecode caches')
  assert.match(devApiSource, /env\.PYTHONDONTWRITEBYTECODE\s*=\s*'1'/, 'web/dev Hermes launcher must use the same guard')
  assert.match(rustSource, /Avoid\s+\n?\s*\/\/ writing __pycache__/, 'native guard must document the watched-resource restart risk')
})

test('Hermes idle watchdog observes progress instead of enforcing a wall-clock failure', () => {
  assert.match(storeSource, /HERMES_RUN_TIMEOUT_MS/, 'chat-store must define a stable Hermes run timeout constant')
  assert.match(storeSource, /createHermesRunTimeoutError/, 'timeout must use a stable error constructor')
  assert.match(storeSource, /startHermesRunTimeoutGuard/, 'send lifecycle must start a timeout guard')
  assert.match(storeSource, /clearHermesRunTimeoutGuard/, 'send lifecycle must clear the timeout guard')
  assert.match(storeSource, /touchHermesRunWatchdog/, 'progress must renew the idle watchdog')
  assert.match(storeSource, /setTimeout\([\s\S]*?handleHermesRunTimeout/, 'watchdog must remain timer-backed')
  assert.match(storeSource, /clearTimeout\([\s\S]*?hermesRunTimeoutTimer/, 'timeout guard must clear its timer')
})

test('Hermes idle recovery checks the native run before deciding a final state', () => {
  const timeoutBlock = storeSource.match(/function handleHermesRunTimeout[\s\S]*?\n  \}/)?.[0] || ''
  assert.match(timeoutBlock, /api\.hermesHealthCheck/, 'recovery must check gateway health')
  assert.match(timeoutBlock, /api\.hermesApiProxy\('GET', `\/v1\/runs\//, 'recovery must poll native run status')
  assert.match(timeoutBlock, /status === 'completed'/, 'completed runs must be finalized from native status')
  assert.match(timeoutBlock, /status === 'waiting_for_approval'/, 'approval waits must reopen the approval flow')
  assert.match(timeoutBlock, /startHermesRunTimeoutGuard/, 'active runs must continue watching after recovery')
  assert.doesNotMatch(timeoutBlock, /console\.(error|warn|log)/, 'timeout must not be console-only')
})

test('Hermes final-state cleanup clears streaming and running identifiers', () => {
  assert.match(storeSource, /state\.streaming\s*=\s*false/, 'cleanup must clear streaming')
  assert.match(storeSource, /state\.runningSessionId\s*=\s*null/, 'cleanup must clear runningSessionId')
  assert.match(storeSource, /state\.runningClientRequestId\s*=\s*null/, 'cleanup must clear runningClientRequestId')
  assert.match(storeSource, /state\.pendingAssistantId\s*=\s*null/, 'cleanup must clear pendingAssistantId')
  assert.match(storeSource, /state\.liveTools\s*=\s*\[\]/, 'cleanup must clear live tools')
})

test('stream errors still finalize, but idle recovery does not force-stop a healthy run', () => {
  assert.match(storeSource, /cleanupAfterRun\(\{ status: 'failed', reason: 'run-error'/, 'stream error must clean up failed run')
  assert.match(storeSource, /cleanupAfterRun\(\{ status: 'failed', reason: 'send-error'/, 'send error must clean up failed run')
  const timeoutBlock = storeSource.match(/function handleHermesRunTimeout[\s\S]*?\n  \}/)?.[0] || ''
  assert.doesNotMatch(timeoutBlock, /stopActiveHermesServerRun\('run-timeout'\)/, 'idle recovery must not kill a potentially healthy run')
  assert.doesNotMatch(storeSource, /throw e\s*\n\s*assistantMessage\.error/, 'unreachable legacy error handling must not remain after throw')
})

test('only an explicit user stop cancels the native gateway run', () => {
  assert.match(storeSource, /function stopActiveHermesServerRun/, 'chat-store must own a native run stop helper')
  assert.match(storeSource, /\/v1\/runs\/\$\{encodeURIComponent\(runId\)\}\/stop/, 'native stop must use the Hermes run stop endpoint')
  const stopBlock = storeSource.match(/function stopStreaming\(\)[\s\S]*?\n  \}/)?.[0] || ''
  assert.match(stopBlock, /stopActiveHermesServerRun\('user-stop'\)/, 'user stop must stop the native run')
})

test('Hermes serializes replacement runs and quarantines stale SSE errors', () => {
  assert.match(storeSource, /await stopActiveHermesServerRun\('superseded-by-new-request'\)/, 'replacement send must stop the previous run first')
  assert.match(storeSource, /if \(pendingHermesStopPromise\) await pendingHermesStopPromise\.promise/, 'new native run must wait for an in-flight stop request')
  assert.match(storeSource, /if \(state\.runningClientRequestId !== clientRequestId\)[\s\S]*?superseded-run-error/, 'stale invoke errors must not clean up the active request')
})

test('Hermes injects current-turn boundaries and avoids approval-only parsing for read-only news lookups', () => {
  assert.match(storeSource, /const currentTurnInstructions = buildHermesCurrentTurnBoundaryInstruction/, 'native Hermes runs must receive current-turn boundaries')
  assert.match(storeSource, /withHermesReplyStyleInstruction\(/, 'native Hermes runs must receive the common reply and renderer contract')
  assert.match(storeSource, /News\/ranking lookup rule/, 'news/ranking queries must have a read-only execution rule')
  assert.match(storeSource, /Do not call execute_code, Python, python3, Node\.js, PowerShell/, 'news/ranking parsing must not enter interactive script approval')
  assert.match(storeSource, /Do not request interactive command approval for a read-only news\/ranking lookup/, 'news/ranking queries must not block on unavailable approval UI')
})

test('existing protected chat integrations remain anchored', () => {
  assert.match(chatSource, /normalizeLinkReaderResult/, 'Link Reader normalization must remain in chat.js')
  assert.match(chatSource, /metadata:\s*\{[\s\S]*?link_reader_result/, 'Link Reader metadata must remain in chat.js')
  assert.match(chatSource, /renderHermesInboxMessages/, 'Collaboration inbox renderer must remain')
  assert.match(chatSource, /renderOpenClawFullContentBlock|full_content|fullContent/, 'OpenClaw full result rendering must remain')
  assert.match(storeSource, /buildFrontendProgressBubbleViewModel/, 'Frontend Observability progress helper must remain')
  assert.match(storeSource, /buildFrontendDebugRowViewModel/, 'Frontend Observability debug helper must remain')
})

test('Hermes timeout regression is included in release gate and avoids forbidden files', () => {
  assert.match(releaseGateSource, /hermes-run-timeout-final-state-regression\.test\.js/, 'new regression must be in release gate')
  assert.doesNotMatch(chatSource + storeSource, /openclaw\.json|runtime\/data\/secrets|runtime\\\\data\\\\secrets|scripts-dev-api|scripts\/dev-api/, 'timeout fix must not touch runtime secrets or dev-api paths')
})
