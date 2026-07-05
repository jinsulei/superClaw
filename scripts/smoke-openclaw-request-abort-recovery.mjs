import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /function\s+shouldTreatOpenClawAbortAsRecoverable\s*\(/,
  'OpenClaw abort recovery gate is missing',
)
assert.match(
  chat,
  /function\s+isOpenClawRuntimeReadyForAbortRecovery\s*\(/,
  'OpenClaw abort recovery must check runtime readiness before treating aborts as failures',
)
assert.match(
  chat,
  /error:\s*err[\s\S]*?recoverOpenClawGenerationAfterTransientDisconnect\('send-abort-recovery'/,
  'send AbortError must recover from the existing run instead of clearing the bubble immediately',
)
assert.match(
  chat,
  /error:\s*errMsg[\s\S]*?recoverOpenClawGenerationAfterTransientDisconnect\('chat-error-abort-recovery'/,
  'chat error AbortError must recover from the existing run instead of reporting Gateway failure',
)
assert.match(
  chat,
  /notify:\s*false,[\s\S]*?attempts:\s*10,[\s\S]*?delayMs:\s*900/,
  'recoverable aborts must wait for history/final recovery without showing a false Gateway error',
)
console.log('OPENCLAW_ABORT_READY_RECOVERY_NO_FALSE_GATEWAY_ERROR: PASS')

assert.match(
  chat,
  /recoverOpenClawAssistantFromHistoryBeforeFallback\(reason,\s*requestId,[\s\S]*?attempts:\s*options\.attempts \|\| 10/,
  'transient abort recovery must poll history before falling back',
)
assert.match(
  chat,
  /clearOpenClawGenerationState\(`\$\{reason\}-recover-failed`,\s*requestId\)/,
  'transient recovery should only clear generation state after recovery fails',
)
console.log('OPENCLAW_ABORT_RECOVERY_POLLS_HISTORY_BEFORE_CLEAR: PASS')

assert.match(
  chat,
  /if\s*\(isOpenClawGenerationActive\(\)\)\s*\{[\s\S]*?scheduleOpenClawTransientRecovery\(`connect-probe-\$\{state\}`/,
  'connect probe must not disconnect an active OpenClaw run when dashboard status is stale',
)
assert.match(
  chat,
  /if\s*\(!wsClient\.gatewayReady && \(wsClient\.connected \|\| wsClient\.connecting\) && !isOpenClawGenerationActive\(\)\)\s*wsClient\.disconnect\(\)/,
  'send readiness check must not disconnect WS during an active OpenClaw run',
)
console.log('OPENCLAW_ACTIVE_RUN_WS_NOT_DISCONNECTED_BY_STATUS_PROBE: PASS')

assert.match(
  chat,
  /const\s+keepActiveOpenClawRun\s*=\s*isOpenClawGenerationActive\(\)/,
  'route cleanup must detect active OpenClaw run before clearing state',
)
assert.match(
  chat,
  /_currentAiBubble = null\s+if\s*\(!keepActiveOpenClawRun\)\s*\{[\s\S]*?_messageQueue = \[\][\s\S]*?\}/,
  'route cleanup must preserve active request/run state while dropping detached DOM references',
)
console.log('OPENCLAW_ROUTE_CLEANUP_PRESERVES_ACTIVE_RUN_STATE: PASS')

assert.match(
  chat,
  /function\s+recoverOpenClawSilentReplyForExactLiteral\s*\(/,
  'OpenClaw must recover model NO_REPLY when the user explicitly requested a short literal reply',
)
assert.match(
  chat,
  /if\s*\(silentLiteral\)\s*return silentLiteral/,
  'OpenClaw visible sanitizer must show the requested short literal instead of swallowing the assistant bubble',
)
assert.match(
  chat,
  /function\s+normalizeOpenClawVisibleAssistantText\s*\([^)]*\)\s*\{[\s\S]*?const userText = options\.userText \|\| _activeOpenClawUserText \|\| _lastVisibleUserText[\s\S]*?const silentLiteral = recoverOpenClawSilentReplyForExactLiteral\(raw,\s*userText\)[\s\S]*?text:\s*silentLiteral/,
  'OpenClaw normalize path must recover requested short literals before NO_REPLY is treated as empty content',
)
assert.match(
  chat,
  /NO_REPLY[\s\S]*getOpenClawRequestedShortLiteral\(userText\)/,
  'OpenClaw NO_REPLY recovery must be gated by the active request user text',
)
assert.match(
  chat,
  /let\s+_activeOpenClawUserText\s*=\s*''/,
  'OpenClaw must track the active user text separately from restored history user text',
)
assert.match(
  chat,
  /_activeOpenClawUserText = text[\s\S]*?_currentAiText = ''/,
  'OpenClaw must clear previous stream draft when a new request starts',
)
assert.match(
  chat,
  /_activeOpenClawUserText = ''/,
  'OpenClaw active user text must be cleared when the active request ends',
)
assert.match(
  chat,
  /function\s+stripOpenClawRepeatedLeadingStatusGlyphs\s*\(/,
  'OpenClaw must strip duplicated leading success glyphs from assistant body text',
)
assert.match(
  chat,
  /const visibleInput = stripOpenClawRepeatedLeadingStatusGlyphs\(text\)/,
  'OpenClaw sanitizer must remove duplicated status glyphs before rendering visible text',
)
assert.match(
  chat,
  /literalMatch[\s\S]*?isOpenClawSafeShortLiteralReply\(literalMatch\[1\]\)[\s\S]*?literalMatch\[1\]\.toUpperCase\(\)/,
  'OpenClaw sanitizer must render status-prefixed short literals like ✅OK as plain OK',
)
assert.match(
  chat,
  /const displayText = openClawVisibleUserText\(text\)[\s\S]*?if \(displayText\) _lastVisibleUserText = displayText/,
  'OpenClaw history restore must keep the previous user text available for literal NO_REPLY recovery',
)
assert.match(
  chat,
  /let lastHistoryUserText = ''[\s\S]*?lastHistoryUserText = openClawVisibleUserText\(msg\.text \|\| ''\)[\s\S]*?_lastVisibleUserText = lastHistoryUserText/,
  'OpenClaw history merge must track the previous user text even when the visible user row is deduped',
)
assert.match(
  chat,
  /getOpenClawRequestedShortLiteral\(_activeOpenClawUserText \|\| _lastVisibleUserText\)[\s\S]*?appendAiMessage\(literal/,
  'OpenClaw recoverable abort fallback must render the requested short literal instead of a retry system message',
)
console.log('OPENCLAW_NO_REPLY_LITERAL_REQUEST_RECOVERED: PASS')
