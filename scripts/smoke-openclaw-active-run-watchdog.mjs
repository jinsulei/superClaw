import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /let\s+_activeOpenClawRun\s*=\s*null/,
  'OpenClaw chat must keep a single active run ledger',
)
assert.match(
  chat,
  /function\s+createOpenClawActiveRun\s*\([\s\S]*openclawTurnId[\s\S]*clientRequestId[\s\S]*assistantMessageId[\s\S]*status:\s*input\.status \|\| 'pending'/,
  'OpenClaw send must create one pending active run with turn, request and assistant ids',
)
assert.match(
  chat,
  /createOpenClawActiveRun\(\{[\s\S]*openclawTurnId,[\s\S]*clientRequestId,[\s\S]*assistantMessageId,[\s\S]*status:\s*'pending'/,
  'OpenClaw doSend must bind one active run before calling chatSend',
)
assert.match(
  chat,
  /function\s+getOpenClawTurnKey\s*\(/,
  'OpenClaw active run must expose a strong turn key helper',
)
assert.match(
  chat,
  /function\s+getOpenClawStrongHistoryMatchReason\s*\([\s\S]*assistantMessageId[\s\S]*openclawTurnId[\s\S]*clientRequestId[\s\S]*runId[\s\S]*previousUserId/,
  'OpenClaw history recovery must check strong turn identifiers',
)
assert.match(
  chat,
  /updateOpenClawActiveRun\(\{[\s\S]*assistantMessageId:\s*_currentAiBubbleRequestId \|\| stableStreamId,[\s\S]*accumulatedText:\s*_currentAiText,[\s\S]*status:\s*'streaming'/,
  'OpenClaw delta must update the same active run and accumulated text',
)
assert.match(
  chat,
  /updateOpenClawActiveRun\(\{[\s\S]*runId:\s*payload\.runId[\s\S]*assistantMessageId:\s*_currentAiBubbleRequestId \|\| stableStreamId/,
  'OpenClaw final must resolve through the active run before completion',
)
console.log('OPENCLAW_SINGLE_RUN_ONE_ASSISTANT_BUBBLE: PASS')
console.log('OPENCLAW_DELTA_FINAL_HISTORY_UPDATE_SAME_BUBBLE: PASS')
console.log('OPENCLAW_HISTORY_CANDIDATE_REQUIRES_STRONG_TURN_MATCH: PASS')

assert.match(
  chat,
  /const\s+OPENCLAW_ACTIVE_RUN_WATCHDOG_MS\s*=\s*75\s*\*\s*1000/,
  'OpenClaw active run watchdog timeout must be explicit',
)
assert.match(
  chat,
  /function\s+settleOpenClawActiveRunFromWatchdog\s*\([\s\S]*recoverOpenClawAssistantFromHistoryBeforeFallback\([\s\S]*attempts:\s*2[\s\S]*delayMs:\s*500/,
  'OpenClaw watchdog must first try direct history recovery',
)
assert.match(
  chat,
  /renderCompactAssistantContent\(_currentAiText,\s*_currentAiBubble,\s*\{ phase:\s*'incomplete' \}\)/,
  'OpenClaw watchdog must mark partial text incomplete instead of completed',
)
assert.match(
  chat,
  /finishOpenClawActiveRun\(_currentAiText \? 'incomplete' : 'failed',\s*reason\)/,
  'OpenClaw watchdog must finish stuck active runs',
)
assert.match(
  chat,
  /Date\.now\(\) - _sendTimestamp >= OPENCLAW_ACTIVE_RUN_WATCHDOG_MS[\s\S]*settleOpenClawActiveRunFromWatchdog\('active-run-watchdog-timeout'\)/,
  'OpenClaw response watchdog must converge stuck pending runs',
)
console.log('OPENCLAW_WATCHDOG_RECOVERS_FROM_STUCK_PENDING_WITH_HISTORY: PASS')
console.log('OPENCLAW_WATCHDOG_MARKS_PARTIAL_INCOMPLETE: PASS')

assert.match(
  chat,
  /_openClawPendingResponse = false[\s\S]*_openClawActiveRequestClosed = true[\s\S]*_isSending = false[\s\S]*_isStreaming = false[\s\S]*updateSendState\(\)/,
  'OpenClaw watchdog and incomplete paths must restore send button state',
)
assert.match(
  chat,
  /finishOpenClawActiveRun\(preserveIncompleteDraft \? 'incomplete' : 'completed'/,
  'OpenClaw stream reset must finish the active run explicitly',
)
assert.match(
  chat,
  /finishOpenClawActiveRun\('completed',\s*'history-completed-current-draft'\)/,
  'OpenClaw history completion must finish the active run explicitly',
)
console.log('OPENCLAW_SEND_BUTTON_STATE_FOLLOWS_RUN_STATE: PASS')

assert.match(
  chat,
  /function\s+hasOpenClawMeaningfulAssistantNode\s*\([\s\S]*isOpenClawIncompleteVisibleText\(text\)[\s\S]*return false/,
  'OpenClaw watchdog visible-content checks must reject incomplete visible replies',
)

console.log('OPENCLAW_ACTIVE_RUN_WATCHDOG: PASS')
