import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  compactHermesHistoryContentForPrompt,
  extractHermesVisibleExecutionNarration,
  stripHermesVisibleExecutionNarration,
} from '../../src/engines/hermes/lib/chat-store.js'
import {
  completeHermesReplyIfNeeded,
  normalizeHermesVisibleReply,
  preferHermesStreamText,
} from '../../src/engines/hermes/lib/hermes-response-assembler.js'

const hermesStoreSource = readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')

const OLD_ASSISTANT_SENTINEL = 'HERMES_OLD_ASSISTANT_LEAK_SENTINEL_123'
const OLD_USER_SENTINEL = 'HERMES_OLD_USER_LEAK_SENTINEL_456'

test('Hermes history keeps a bounded assistant answer so prior user turns remain paired', () => {
  const compacted = compactHermesHistoryContentForPrompt('assistant', [
    OLD_ASSISTANT_SENTINEL,
    'previous assistant answer that must never enter a new prompt',
  ].join('\n'))

  assert.equal(compacted.includes(OLD_ASSISTANT_SENTINEL), true)
  assert.equal(compacted.includes('previous assistant answer'), true)
})

test('Hermes default history contains completed user-assistant turns only', () => {
  const historyBlock = hermesStoreSource.match(/function buildDefaultConversationHistory\(session, currentMessageId\) \{[\s\S]*?function normalizeAttachments/)?.[0] || ''

  assert.match(historyBlock, /const completedTurns = \[\]/)
  assert.match(historyBlock, /if \(!pendingUser\) continue/)
  assert.match(historyBlock, /completedTurns\.push\(\[pendingUser, \{ role, content \}\]\)/)
  assert.match(historyBlock, /selectedTurns\.reverse\(\)\.flat\(\)/)
})

test('Hermes native chat sends bounded local history when the runtime session is unavailable', () => {
  const sendBlock = hermesStoreSource.match(/const runPromise = Promise\.resolve\(\)\.then\(async \(\) => \{[\s\S]*?const suppliedInstructions/)?.[0] || ''

  assert.match(sendBlock, /: buildDefaultConversationHistory\(s, userMessage\.id\)/)
  assert.match(sendBlock, /const conversationHistory = forceEmptyHistory \? null : requestedHistory/)
  assert.match(sendBlock, /The portable runtime does not reliably persist native Hermes sessions/)
})

test('Hermes actionable tasks require execution evidence in both desktop and web completion paths', () => {
  const taskBlock = hermesStoreSource.match(/function isHermesLongTaskRequest\(text\) \{[\s\S]*?function getHermesExactShortReplyTarget/)?.[0] || ''
  const boundaryBlock = hermesStoreSource.match(/function buildHermesCurrentTurnBoundaryInstruction\(currentInput = '', history = \[\]\) \{[\s\S]*?function loadJson/)?.[0] || ''
  const webCompletionBlock = hermesStoreSource.match(/function completeStreamRun\(runSessionId, output = '', clientRequestId = state\.runningClientRequestId\) \{[\s\S]*?function replaceStreamOutput/)?.[0] || ''
  const desktopCompletionBlock = hermesStoreSource.match(/const u3 = await tauriListen\('hermes-run-done'[\s\S]*?const u4 = await tauriListen/)?.[0] || ''

  assert.match(taskBlock, /\\u6253\\u5f00|\\u67e5\\u8be2|\\u641c\\u7d22|\\u8bfb\\u53d6/)
  assert.match(boundaryBlock, /Execution contract: this is an actionable task/)
  assert.match(boundaryBlock, /Do not finalize with a plan, intent/)
  assert.match(webCompletionBlock, /applyHermesPromiseOnlyTaskGuard\(msg, currentVisibleUserPrompt\(\), runTools, clientRequestId\)/)
  assert.match(desktopCompletionBlock, /applyHermesPromiseOnlyTaskGuard\(msg, currentVisibleUserPrompt\(\), runTools, clientRequestId\)/)
})

test('Hermes weather lookups avoid a second interpreter command that cannot be approved in chat', () => {
  const boundaryBlock = hermesStoreSource.match(/function buildHermesCurrentTurnBoundaryInstruction\(currentInput = '', history = \[\]\) \{[\s\S]*?function loadJson/)?.[0] || ''

  assert.match(boundaryBlock, /天气\|气温\|降雨\|下雨\|weather\|forecast\|temperature/)
  assert.match(boundaryBlock, /use at most one read-only public weather fetch/)
  assert.match(boundaryBlock, /Do not run Python, python3, Node\.js, PowerShell/)
  assert.match(boundaryBlock, /Do not request interactive command approval/)
})

test('Hermes history keeps old user context but strips stale exact-reply directives', () => {
  const userHistory = `${OLD_USER_SENTINEL} 记住苹果是红色的，只回复收到`
  const compacted = compactHermesHistoryContentForPrompt('user', userHistory)

  assert.equal(compacted.includes(OLD_USER_SENTINEL), true)
  assert.equal(compacted.includes('苹果是红色'), true)
  assert.equal(compacted.includes('只回复收到'), true)

  const messageTextBlock = hermesStoreSource.match(/function messageTextForHistory\(message, role = ''\) \{[\s\S]*?function normalizeHermesHistoryComparableText/)?.[0] || ''
  assert.match(messageTextBlock, /stripHermesReplyOnlyDirectiveForHistory\(text\)/)
})

test('Hermes stale stream and final events are rejected before mutating current turn', () => {
  const handleBlock = hermesStoreSource.match(/function handleStreamEvent\(runSessionId, evt\) \{[\s\S]*?function cleanupAfterRun/)?.[0] || ''

  assert.match(handleBlock, /activeResponseAssembler && !activeResponseAssembler\.matches\(evt\)/)
  assert.ok(handleBlock.indexOf('activeResponseAssembler && !activeResponseAssembler.matches(evt)') < handleBlock.indexOf('appendStreamDelta'))
  assert.match(hermesStoreSource, /function appendStreamDelta\(runSessionId, delta, clientRequestId = state\.runningClientRequestId\)/)
  assert.match(hermesStoreSource, /function completeStreamRun\(runSessionId, output = '', clientRequestId = state\.runningClientRequestId\)/)
  assert.match(hermesStoreSource, /ensureAssistantMessage\(s, clientRequestId\)/)
})

test('Hermes final snapshots are never appended as stream deltas', () => {
  const handleBlock = hermesStoreSource.match(/function handleStreamEvent\(runSessionId, evt\) \{[\s\S]*?function cleanupAfterRun/)?.[0] || ''
  const tauriDoneBlock = hermesStoreSource.match(/const u3 = await tauriListen\('hermes-run-done'[\s\S]*?const u4 = await tauriListen/)?.[0] || ''

  assert.doesNotMatch(handleBlock, /message\.final[\s\S]{0,240}appendStreamDelta/)
  assert.doesNotMatch(handleBlock, /run\.completed[\s\S]{0,240}appendStreamDelta/)
  assert.doesNotMatch(tauriDoneBlock, /msg\.content\s*=\s*sanitizeHermesVisibleReply\(msg\.content \+ accepted\.text/)
  assert.match(handleBlock, /replaceStreamOutput\(effectiveSessionId, accepted\.output/)
  assert.match(handleBlock, /completeStreamRun\(effectiveSessionId, accepted\.output/)
})

test('Hermes streaming text is never completed or compacted before final', () => {
  const sanitizeBlock = hermesStoreSource.match(/function sanitizeHermesVisibleReply\(text, prompt = currentVisibleUserPrompt\(\), options = \{\}\) \{[\s\S]*?function notifySync/)?.[0] || ''
  const streamingBlock = sanitizeBlock.match(/if \(options\.streaming === true\) \{[\s\S]*?\n\s*\}/)?.[0] || ''

  assert.match(streamingBlock, /normalizeHermesStreamText\(text\)/)
  assert.doesNotMatch(streamingBlock, /completeHermesReplyIfNeeded/)
  assert.doesNotMatch(streamingBlock, /normalizeHermesVisibleReplyText/)
})

test('Hermes finalization is idempotent and does not truncate a complete reply', () => {
  const longReply = Array.from({ length: 20 }, (_, index) => `第 ${index + 1} 项完整内容。`).join('\n')
  const once = completeHermesReplyIfNeeded(longReply, { userText: '请完整列出' })
  const twice = completeHermesReplyIfNeeded(once, { userText: '请完整列出' })
  const normalized = normalizeHermesVisibleReply(longReply, { userText: '请完整列出' })

  assert.equal(twice, once)
  assert.match(once, /第 20 项完整内容/)
  assert.match(normalized, /第 20 项完整内容/)
  assert.doesNotMatch(once, /以上是当前结果|如果你要继续/)
})

test('Hermes finalization preserves GFM tables that were visible during streaming', () => {
  const tableReply = [
    '## 查询结果',
    '',
    '| 名称 | 状态 |',
    '| --- | --- |',
    '| 表格内容 | 正常保留 |',
  ].join('\n')

  const finalized = normalizeHermesVisibleReply(tableReply, { userText: '请用表格展示结果' })

  assert.match(finalized, /\| 名称 \| 状态 \|/)
  assert.match(finalized, /\| --- \| --- \|/)
  assert.match(finalized, /\| 表格内容 \| 正常保留 \|/)
})

test('Hermes routes visible execution narration into the trace instead of the final answer', () => {
  const narration = '我来看看之前的脚本和当前状态，定位“查一周”指的是哪个任务。'
  assert.equal(extractHermesVisibleExecutionNarration(narration), narration)
  assert.equal(extractHermesVisibleExecutionNarration('## 最终结论\n\n| 日期 | 天气 |'), '')

  const finalReply = `${narration}\n\n## 查询结果\n\n已获取未来七天预报。`
  const visible = stripHermesVisibleExecutionNarration(finalReply, [{
    kind: 'reasoning',
    source: 'stream-visible',
    summary: narration,
  }])
  assert.equal(visible, '## 查询结果\n\n已获取未来七天预报。')
})

test('Hermes collapses repeated generic reasoning placeholders and stores stream narration as a trace step', () => {
  const executionBlock = hermesStoreSource.match(/function recordAssistantExecutionEvent\(session, clientRequestId, eventType, evt = \{\}\) \{[\s\S]*?function setPendingHermesApproval/)?.[0] || ''
  const appendBlock = hermesStoreSource.match(/function appendStreamDelta\(runSessionId, delta, clientRequestId = state\.runningClientRequestId\) \{[\s\S]*?function acceptActiveStreamEvent/)?.[0] || ''

  assert.match(executionBlock, /const isGenericReasoning = kind === 'reasoning' && text === HERMES_REASONING_PLACEHOLDER/)
  assert.match(executionBlock, /existing = trace\.find\(item => item\.id === pendingId\)/)
  assert.match(appendBlock, /recordHermesStreamNarration\(s, clientRequestId, streamState, protocol\.execution\)/)
  assert.match(appendBlock, /source: 'stream-visible'/)
  assert.match(appendBlock, /recordAssistantExecutionEvent\(s, clientRequestId, 'reasoning\.available'/)
})

test('Hermes never exposes a dangling hidden-reasoning close tag in the final reply', () => {
  const normalized = normalizeHermesVisibleReply('</think>\nHERMES_TOOL_OK', { userText: '执行终端校验' })

  assert.match(normalized, /HERMES_TOOL_OK/)
  assert.doesNotMatch(normalized, /<\/?think>|<\/?thinking>|<\/?reasoning>|<\/?analysis>/i)
})

test('Hermes stream assembler refuses unrelated longer final snapshots', () => {
  const current = '收到'
  const staleFinal = '你好，我是旧回复。Markdown 表格测试。'.repeat(8)
  assert.equal(preferHermesStreamText(current, staleFinal), current)
  assert.equal(preferHermesStreamText(current, `${current}，继续补充`), `${current}，继续补充`)
})

test('Hermes backend merge does not collapse assistant messages from different turns', () => {
  const collapseBlock = hermesStoreSource.match(/function collapseConsecutiveAssistantMessages\(messages\) \{[\s\S]*?function lastTurnAssistantText/)?.[0] || ''
  const finalChoiceBlock = hermesStoreSource.match(/function chooseHermesFinalOutput\([\s\S]*?function normalizeJoinedSourceSessionFields/)?.[0] || ''

  assert.match(collapseBlock, /prevRequestId/)
  assert.match(collapseBlock, /nextRequestId/)
  assert.match(collapseBlock, /prevRequestId !== nextRequestId/)
  assert.match(finalChoiceBlock, /containsHermesPriorAssistantLeak/)
  assert.match(finalChoiceBlock, /trimHermesFinalAtPriorAssistantLeak/)
})

test('Hermes forced post-run refresh does not append stale backend assistant snapshots over local run tail', () => {
  const helperBlock = hermesStoreSource.match(/function hasHermesLocalRunTail\(session\) \{[\s\S]*?function shouldPreferFinalOutput/)?.[0] || ''
  const refreshBlock = hermesStoreSource.match(/async function refreshActiveMessages\(options = \{\}\) \{[\s\S]*?function createLocalSession/)?.[0] || ''

  assert.match(helperBlock, /lastAssistantMessage/)
  assert.match(helperBlock, /hermesMessageRequestId\(message\)/)
  assert.match(helperBlock, /!message\.isStreaming/)
  assert.match(refreshBlock, /const skipMessageMerge = hasLocalTranscript && !options\.forceServerMessages/)
  assert.match(refreshBlock, /&& !skipMessageMerge/)
})

test('Hermes ordinary page refresh does not merge stale backend snapshots into a local transcript', () => {
  const helperBlock = hermesStoreSource.match(/function hasHermesLocalTranscript\(session\) \{[\s\S]*?function shouldPreferFinalOutput/)?.[0] || ''
  const refreshBlock = hermesStoreSource.match(/async function refreshActiveMessages\(options = \{\}\) \{[\s\S]*?function createLocalSession/)?.[0] || ''

  assert.match(helperBlock, /message\.role === 'user' \|\| message\.role === 'assistant'/)
  assert.match(helperBlock, /String\(message\.content \|\| ''\)\.trim\(\)/)
  assert.match(refreshBlock, /const hasLocalTranscript = hasHermesLocalTranscript\(target\)/)
  assert.match(refreshBlock, /hasLocalTranscript && !options\.forceServerMessages/)
  assert.match(refreshBlock, /else if \(skipMessageMerge\)/)
})

test('Hermes managed sessions drop backend orphan assistant snapshots on restore and merge', () => {
  const orphanHelperBlock = hermesStoreSource.match(/function isHermesBackendOrphanAssistant\(message = \{\}\) \{[\s\S]*?function hermesPriorAssistantLeakFragments/)?.[0] || ''
  const mergeBlock = hermesStoreSource.match(/function mergeHermesMessages\(localMessages = \[\], serverMessages = \[\]\) \{[\s\S]*?\/\/ ---------- Tauri event bridge/)?.[0] || ''
  const restoreBlock = hermesStoreSource.match(/function normalizeHermesRestoredMessages\(messages = \[\]\) \{[\s\S]*?function loadSessionsCache/)?.[0] || ''
  const mapBlock = hermesStoreSource.match(/function mapHermesMessages\(msgs\) \{[\s\S]*?function joinAssistantChunks/)?.[0] || ''

  assert.match(orphanHelperBlock, /message\.role === 'assistant'/)
  assert.match(orphanHelperBlock, /!hermesMessageRequestId\(message\)/)
  assert.match(orphanHelperBlock, /!Number\(message\.timestamp \|\| 0\)/)
  assert.match(orphanHelperBlock, /isKnownReplayContamination/)
  assert.match(orphanHelperBlock, /print\\\(\["'\]hello\["'\]\\\)/)
  assert.match(orphanHelperBlock, /模型或接口权限不可用/)
  assert.match(mergeBlock, /const localIsManaged = merged\.some\(m => hermesMessageRequestId\(m\)\)/)
  assert.match(mergeBlock, /if \(localIsManaged && isHermesBackendOrphanAssistant\(msg\)\) continue/)
  assert.match(restoreBlock, /const hasManagedTurns = messages\.some\(message => hermesMessageRequestId\(message\)\)/)
  assert.match(restoreBlock, /if \(hasManagedTurns && isHermesBackendOrphanAssistant\(message\)\) return null/)
  assert.match(mapBlock, /clientRequestId: m\.clientRequestId \|\| m\.client_request_id \|\| ''/)
})

test('Hermes orphan cleanup is narrow and does not drop normal backend capability replies', () => {
  const orphanHelperBlock = hermesStoreSource.match(/function isHermesBackendOrphanAssistant\(message = \{\}\) \{[\s\S]*?function hermesPriorAssistantLeakFragments/)?.[0] || ''

  assert.doesNotMatch(orphanHelperBlock, /String\(message\.content \|\| ''\)\.trim\(\)\s*\n\s*\)/)
  assert.match(orphanHelperBlock, /isKnownReplayContamination/)
})

test('Hermes restored orphan cleanup is persisted back to local storage', () => {
  const loadCacheBlock = hermesStoreSource.match(/function loadSessionsCache\(\) \{[\s\S]*?function loadProfilePrefs/)?.[0] || ''

  assert.match(loadCacheBlock, /const normalized = normalizeHermesRestoredMessages\(msgs\)/)
  assert.match(loadCacheBlock, /target\.messages = normalized/)
  assert.match(loadCacheBlock, /if \(normalized\.length !== msgs\.length\) saveJson\(messagesKey\(target\.id\), normalized\)/)
})

test('Hermes short-answer final is isolated by clientRequestId and protected from stale refresh', () => {
  assert.match(hermesStoreSource, /getHermesAssistantMessageId\(clientRequestId\)/)
  assert.match(hermesStoreSource, /const clientRequestId = String\(opts\.clientRequestId \|\| uid\(\)\)/)
  assert.match(hermesStoreSource, /normalizeHermesExactShortReply\(currentVisibleUserPrompt\(\), msg\.content\)/)
  assert.match(hermesStoreSource, /markHermesExactShortLocalTail\(s, currentVisibleUserPrompt\(\)\)/)
  assert.match(hermesStoreSource, /if \(hasHermesProtectedLocalTail\(target\)\) \{\s*forceRemoteRefreshIds\.delete\(sid\)\s*return\s*\}/)
})

test('Hermes session restore does not keep orphan streaming assistant as the active pending target', () => {
  const restoreBlock = hermesStoreSource.match(/function normalizeHermesRestoredMessages\(messages = \[\]\) \{[\s\S]*?function loadSessionsCache/)?.[0] || ''
  const loadCacheBlock = hermesStoreSource.match(/function loadSessionsCache\(\) \{[\s\S]*?function loadProfilePrefs/)?.[0] || ''
  const cleanupBlock = hermesStoreSource.match(/function cleanupAfterRun\(meta = \{\}\) \{[\s\S]*?function refreshSessionsAfterRun/)?.[0] || ''

  assert.match(restoreBlock, /if \(message\.isStreaming === true\) return null/)
  assert.match(restoreBlock, /delete next\.isStreaming/)
  assert.match(loadCacheBlock, /state\.pendingAssistantId = null/)
  assert.match(loadCacheBlock, /normalizeHermesRestoredMessages\(msgs\)/)
  assert.match(cleanupBlock, /state\.pendingAssistantId = null/)
  assert.match(cleanupBlock, /activeResponseAssembler = null/)
})

test('Hermes history contamination regression is release-gated', () => {
  assert.match(releaseGateSource, /hermes-history-contamination-regression\.test\.js/)
})
