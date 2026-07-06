import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const chatSource = readFileSync('src/engines/hermes/pages/chat.js', 'utf8')
const storeSource = readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')

test('Hermes run timeout guard finalizes visible assistant error and cleanup', () => {
  assert.match(storeSource, /HERMES_RUN_TIMEOUT_MS/, 'chat-store must define a stable Hermes run timeout constant')
  assert.match(storeSource, /createHermesRunTimeoutError/, 'timeout must use a stable error constructor')
  assert.match(storeSource, /startHermesRunTimeoutGuard/, 'send lifecycle must start a timeout guard')
  assert.match(storeSource, /clearHermesRunTimeoutGuard/, 'send lifecycle must clear the timeout guard')
  assert.match(storeSource, /setTimeout\([\s\S]*?createHermesRunTimeoutError/, 'timeout guard must be timer-backed')
  assert.match(storeSource, /clearTimeout\([\s\S]*?hermesRunTimeoutTimer/, 'timeout guard must clear its timer')
})

test('Hermes timeout is user-visible and is not only console logging', () => {
  const timeoutBlock = storeSource.match(/function handleHermesRunTimeout[\s\S]*?\n  \}/)?.[0] || ''
  assert.match(timeoutBlock, /ensureAssistantMessage/, 'timeout must target the pending assistant message')
  assert.match(timeoutBlock, /sanitizeHermesVisibleReply/, 'timeout must write sanitized user-visible content')
  assert.match(timeoutBlock, /mapHermesErrorToUserMessage/, 'timeout must use stable error wording')
  assert.match(timeoutBlock, /finalizeHermesRequestState/, 'timeout must converge on final-state cleanup')
  assert.doesNotMatch(timeoutBlock, /console\.(error|warn|log)/, 'timeout must not be console-only')
})

test('Hermes final-state cleanup clears streaming and running identifiers', () => {
  assert.match(storeSource, /state\.streaming\s*=\s*false/, 'cleanup must clear streaming')
  assert.match(storeSource, /state\.runningSessionId\s*=\s*null/, 'cleanup must clear runningSessionId')
  assert.match(storeSource, /state\.runningClientRequestId\s*=\s*null/, 'cleanup must clear runningClientRequestId')
  assert.match(storeSource, /state\.pendingAssistantId\s*=\s*null/, 'cleanup must clear pendingAssistantId')
  assert.match(storeSource, /state\.liveTools\s*=\s*\[\]/, 'cleanup must clear live tools')
})

test('stream error abort and timeout share final-state cleanup path', () => {
  assert.match(storeSource, /cleanupAfterRun\(\{ status: 'failed', reason: 'run-error'/, 'stream error must clean up failed run')
  assert.match(storeSource, /cleanupAfterRun\(\{ status: 'failed', reason: 'send-error'/, 'send error must clean up failed run')
  assert.match(storeSource, /finalizeHermesRequestState\(\{[\s\S]*?reason: 'run-timeout'/, 'timeout must finalize as failed run-timeout')
  assert.doesNotMatch(storeSource, /throw e\s*\n\s*assistantMessage\.error/, 'unreachable legacy error handling must not remain after throw')
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
