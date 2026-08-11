import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const read = (path) => readFileSync(path, 'utf8')
const workspacePolicy = read('src-tauri/resources/templates/openclaw-workspace/AGENTS.md')
const taskSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-task-policy/SKILL.md')
const ecommerceSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-ecommerce/SKILL.md')
const financeSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-finance/SKILL.md')
const ocrSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-ocr/SKILL.md')
const videoSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-video-analysis/SKILL.md')
const chat = read('src/pages/chat.js')
const tauriApi = read('src/lib/tauri-api.js')
const wsClientSource = read('src/lib/ws-client.js')
const messageDb = read('src/lib/message-db.js')
const openclawHistorySource = read('src-tauri/src/commands/openclaw_history.rs')
const ocrPlugin = read('src-tauri/resources/runtime/openclaw/dist/extensions/superclaw-ocr/index.js')
const ocrManifest = read('src-tauri/resources/runtime/openclaw/dist/extensions/superclaw-ocr/openclaw.plugin.json')
const imageZoom = read('src/lib/anchored-image-zoom.js')

test('OpenClaw workspace policy makes native tools the execution authority', () => {
  assert.match(workspacePolicy, /native execution agent/i)
  assert.match(workspacePolicy, /Do not stop after/i)
  assert.match(workspacePolicy, /confirmation-required/i)
  assert.match(workspacePolicy, /Ecommerce/i)
  assert.match(workspacePolicy, /OCR/i)
  assert.match(workspacePolicy, /Finance/i)
})

test('OpenClaw keeps raw tool identifiers out of the visible reply and uses friendly progress labels', () => {
  const rawToolFilter = chat.match(/function stripOpenClawRawToolLines\([\s\S]*?\n\}/)?.[0] || ''
  // The progress label and its helpers were refactored into a shared block that
  // starts at redactOpenClawVisibleSensitiveText, so capture the whole span.
  const displayName = chat.match(/function redactOpenClawVisibleSensitiveText\([\s\S]*?(?=\nfunction stripRawOpenClawToolText)/)?.[0] || ''
  const sandbox = { result: null }

  vm.runInNewContext(`${rawToolFilter}; ${displayName}; result = [
    stripOpenClawRawToolLines('准备查询天气：\\nweb_search\\nweb_fetch\\n查询完成'),
    stripOpenClawRawToolLines('web_search\\nweb_fetch'),
    getOpenClawToolDisplayName({ name: 'web_search' }),
    getOpenClawToolDisplayName({ name: 'web_fetch' }),
    getOpenClawToolProgressLabel({ name: 'web_fetch' }),
  ]`, sandbox)

  assert.deepEqual(Array.from(sandbox.result), ['准备查询天气：\n查询完成', '', '检索公开资料', '读取网页内容', '读取网页'])
  assert.match(chat, /recordOpenClawRunStep\('tool', toolLabel, current\.status \|\| 'running', toolCallId\)/)
  assert.match(chat, /showTyping\(true, `正在\$\{toolLabel\}`\)/)
  assert.match(chat, /recordOpenClawRunStep\('plan', `开始处理：\$\{initialTaskSummary/)
})

test('OpenClaw renders provider public reasoning summaries without rendering raw internal reasoning', () => {
  const progress = chat.match(/function getOpenClawVisibleProgressFromEvent\([\s\S]*?(?=\nfunction hydrateOpenClawLiveHistoryProgress)/)?.[0] || ''

  assert.match(progress, /data\.reasoning_summary/)
  assert.match(progress, /data\.reasoningSummary/)
  assert.match(progress, /data\.public_reasoning/)
  assert.match(progress, /data\.explanation/)
  assert.match(chat, /推理摘要：\$\{thought\}/)
  assert.match(chat, /正在分析任务并确定下一步。/)
})

test('OpenClaw shows executed shell commands only in a redacted technical detail', () => {
  const commandPreview = chat.match(/function redactOpenClawVisibleSensitiveText\([\s\S]*?(?=\nfunction collectOpenClawToolText)/)?.[0] || ''
  const sandbox = { result: null }

  vm.runInNewContext(`${commandPreview}; result = [
    getOpenClawToolCommandPreview({ toolName: 'exec', input: { command: 'curl -H "Authorization: Bearer sk-secret-token-value-123" --api-key abcdefghijklmnop https://example.test' } }),
    getOpenClawToolCommandPreview({ toolName: 'web_fetch', input: { command: 'curl https://example.test' } }),
  ]`, sandbox)

  const [safeCommand, ignoredCommand] = Array.from(sandbox.result)
  assert.match(safeCommand, /curl -H "Authorization: Bearer \[已隐藏\]" --api-key \[已隐藏\]/)
  assert.doesNotMatch(safeCommand, /sk-secret-token-value-123|abcdefghijklmnop/)
  assert.equal(ignoredCommand, '')
  assert.match(chat, /执行命令：\$\{command\.replace/)
})

test('SuperClaw task policy keeps ecommerce, OCR, and finance inside native skills', () => {
  assert.match(taskSkill, /^name: superclaw-task-policy/m)
  assert.match(taskSkill, /supplements native\s+OpenClaw tools/i)
  assert.match(taskSkill, /Ecommerce/)
  assert.match(taskSkill, /OCR and Documents/)
  assert.match(taskSkill, /Finance/)
  assert.match(taskSkill, /confirmation/i)
})

test('OpenClaw UI remains a Gateway sender instead of a local answer generator', () => {
  const sendStart = chat.indexOf('async function sendMessage(')
  const sendEnd = chat.indexOf('async function doSend(', sendStart)
  const send = chat.slice(sendStart, sendEnd)

  assert.doesNotMatch(send, /maybeHandleOpenClawLocalAnswer\(/)
  assert.doesNotMatch(send, /appendOpenClawLocalEcommerceAnswer\(/)
  assert.doesNotMatch(send, /appendOpenClawLocalIdentityAnswer\(/)
  assert.match(chat, /wsClient\.chatSend\(_sessionKey, sendText/)
})

test('screenshot and desktop-file tasks never replace a native result with a missing-tool fallback', () => {
  const doSendStart = chat.indexOf('async function doSend(')
  const doSendEnd = chat.indexOf('function buildIntentTriggeredToolPrompt', doSendStart)
  const doSend = chat.slice(doSendStart, doSendEnd)
  const finalStart = chat.indexOf('function handleChatEvent(')
  const finalEnd = chat.indexOf('let hasContent = hasOpenClawRenderableContent', finalStart)
  const finalHandler = chat.slice(finalStart, finalEnd)
  const unavailable = chat.match(/function buildOpenClawToolUnavailableReply[\s\S]*?\n\}/)?.[0] || ''

  assert.doesNotMatch(doSend, /scheduleOpenClawBrowserToolFallback\(/)
  assert.doesNotMatch(finalHandler, /buildOpenClawToolUnavailableReply\(_lastVisibleUserText\)/)
  assert.match(unavailable, /return ''/)
  assert.match(unavailable, /absence of an[\s\S]*inline image[\s\S]*never proof/i)
})

test('OpenClaw tool-use frames remain progress until the native terminal reply arrives', () => {
  const historyRecovery = chat.match(/function completeOpenClawCurrentDraftFromLatestHistory[\s\S]*?function mergeHistoryIntoCurrentMessages/)?.[0] || ''
  const liveHistory = chat.match(/function hydrateOpenClawLiveHistoryProgress[\s\S]*?function attachOpenClawExecutionTimeline/)?.[0] || ''
  const finalHandler = chat.match(/if \(state === 'final'\) \{[\s\S]*?const stableStreamId = getOpenClawStableStreamId/)?.[0] || ''

  assert.match(chat, /function isOpenClawToolUseMessage\(message = \{\}\)/)
  assert.match(chat, /function attachOpenClawExecutionTimeline\(messages = \[\]\)/)
  assert.match(chat, /function recordOpenClawProgressNarrative\(text = '', stepId = ''\)/)
  assert.match(finalHandler, /isOpenClawToolUseMessage\(payload\.message \|\| payload\)/)
  assert.match(finalHandler, /recordOpenClawProgressNarrative\(extractOpenClawAssistantText\(payload\.message\)/)
  assert.match(finalHandler, /startOpenClawProgressHistoryPolling\(\)/)
  assert.match(historyRecovery, /if \(isOpenClawToolUseMessage\(msg\)\) \{[\s\S]*?recordOpenClawProgressNarrative\(msg\.text \|\| ''[\s\S]*?continue/)
  assert.doesNotMatch(liveHistory, /dedupeHistoryStable\(historyMessages\)/)
  assert.match(liveHistory, /sortOpenClawMessagesChronologically/)
  assert.match(liveHistory, /normalizeOpenClawHistoryRecord/)
  assert.match(chat, /authoritativeMessages = attachOpenClawExecutionTimeline\(authoritativeMessages\)/)
})

test('OpenClaw long native runs only settle on an explicit terminal assistant record', () => {
  const terminalGuard = chat.match(/function isOpenClawNativeTerminalAssistant[\s\S]*?\n\}/)?.[0] || ''
  const historyRecovery = chat.match(/function completeOpenClawCurrentDraftFromLatestHistory[\s\S]*?function mergeHistoryIntoCurrentMessages/)?.[0] || ''
  const finalHandler = chat.match(/if \(state === 'final'\) \{[\s\S]*?const stableStreamId = getOpenClawStableStreamId/)?.[0] || ''
  const timelineAttach = chat.match(/function attachOpenClawExecutionTimeline[\s\S]*?function hydrateOpenClawRunTimelineFromTools/)?.[0] || ''

  assert.match(terminalGuard, /stop\|end\|ended\|complete\|completed/)
  assert.match(historyRecovery, /requiresNativeTerminal/)
  assert.match(historyRecovery, /_openClawAuthoritativeTerminal = isOpenClawNativeTerminalAssistant\(msg\)/)
  assert.match(historyRecovery, /requiresNativeTerminal && !msg\._openClawAuthoritativeTerminal/)
  assert.match(finalHandler, /_activeOpenClawRun\?\.sawToolCall && !isOpenClawNativeTerminalAssistant/)
  assert.match(finalHandler, /startOpenClawProgressHistoryPolling\(\)/)
  assert.match(timelineAttach, /normalizeOpenClawHistoryRecord\(rawMessage\)/)
  assert.match(timelineAttach, /message\.role === 'tool' \|\| message\.role === 'toolResult'/)
  assert.match(timelineAttach, /Tool output belongs to the execution card/)
})

test('OpenClaw raw history preserves native terminal metadata instead of finalizing a tool-use frame', () => {
  assert.match(openclawHistorySource, /"stopReason": message\.get\("stopReason"\)/)
  assert.match(openclawHistorySource, /"runId": message\.get\("runId"\)/)
  assert.match(openclawHistorySource, /"clientRequestId": message\.get\("clientRequestId"\)/)
  assert.match(openclawHistorySource, /"content": message\.get\("content"\)\.cloned\(\)/)
})

test('OpenClaw agent-stream assistant output reuses the guarded chat renderer', () => {
  const adapter = chat.match(/function normalizeOpenClawAgentChatEvent\([\s\S]*?\n\}/)?.[0] || ''
  const eventHandler = chat.match(/function handleEvent\([\s\S]*?\n\}\n\nfunction handleChatEvent/)?.[0] || ''

  assert.match(adapter, /outputStreams = new Set\(\['assistant', 'message', 'text', 'delta', 'output', 'final'\]\)/)
  assert.match(adapter, /extractOpenClawAssistantText\(data\)/)
  assert.match(adapter, /state: isFinal \? 'final' : 'delta'/)
  assert.match(adapter, /sessionKey: payload\.sessionKey \|\| data\.sessionKey/)
  assert.match(adapter, /clientRequestId: payload\.clientRequestId \|\| data\.clientRequestId/)
  assert.match(eventHandler, /const agentChatPayload = normalizeOpenClawAgentChatEvent\(payload\)/)
  assert.match(eventHandler, /if \(agentChatPayload\) handleChatEvent\(agentChatPayload, msg\.id\)/)
})

test('OpenClaw binds native chat.send run ids before accepting agent stream frames', () => {
  const nativeRunId = chat.match(/function getOpenClawNativeRunId[\s\S]*?function bindOpenClawNativeRun/)?.[0] || ''
  const bindRun = chat.match(/function bindOpenClawNativeRun[\s\S]*?\n\}/)?.[0] || ''
  const sendBlock = chat.match(/async function doSend[\s\S]*?function processMessageQueue/)?.[0] || ''

  assert.match(nativeRunId, /value\?\.data\?\.runId/)
  assert.match(nativeRunId, /value\?\.run\?\.id/)
  assert.match(bindRun, /clientRequestId !== _activeClientRequestId/)
  assert.match(bindRun, /updateOpenClawActiveRun\(\{ clientRequestId, runId \}\)/)
  assert.match(sendBlock, /const sendResult = await wsClient\.chatSend/)
  assert.match(sendBlock, /bindOpenClawNativeRun\(sendResult, clientRequestId\)/)
})

test('OpenClaw agent deltas stream incrementally without waiting for the final history record', () => {
  const mergeSource = chat.match(/function mergeOpenClawStreamingText[\s\S]*?\n\}/)?.[0] || ''
  const adapter = chat.match(/function normalizeOpenClawAgentChatEvent[\s\S]*?function mergeOpenClawStreamingText/)?.[0] || ''
  const deltaHandler = chat.match(/if \(state === 'delta'\) \{[\s\S]*?\n    return\n  \}/)?.[0] || ''
  const sandbox = { result: null }

  vm.runInNewContext(`${mergeSource}; result = [
    mergeOpenClawStreamingText('', '第一段', true),
    mergeOpenClawStreamingText('第一段', '，第二段', true),
    mergeOpenClawStreamingText('第一段', '第一段，第二段', true),
    mergeOpenClawStreamingText('第一段，第二段', '，第二段', true),
    mergeOpenClawStreamingText('hello', ' world\\n', true),
  ]`, sandbox)

  assert.deepEqual(Array.from(sandbox.result), ['第一段', '第一段，第二段', '第一段，第二段', '第一段，第二段', 'hello world\n'])
  assert.match(adapter, /isIncrementalDelta/)
  assert.match(adapter, /extractOpenClawTextPart\(data\.delta\)/)
  assert.match(adapter, /_openClawIncrementalDelta: isIncrementalDelta/)
  assert.match(adapter, /_openClawRawDeltaText: streamingText/)
  assert.match(deltaHandler, /_currentAiStreamRawText = mergeOpenClawStreamingText/)
  assert.match(deltaHandler, /sanitizeOpenClawVisibleReply\(_currentAiStreamRawText\)/)
  assert.match(deltaHandler, /visibleDeltaText && visibleDeltaText !== _currentAiText/)
})

test('OpenClaw native deltaText follows gateway append, replace, and cumulative correction semantics', () => {
  const mergeSource = chat.match(/function mergeOpenClawStreamingText[\s\S]*?\n\}/)?.[0] || ''
  const adapter = chat.match(/function normalizeOpenClawAgentChatEvent[\s\S]*?function mergeOpenClawStreamingText/)?.[0] || ''
  const deltaHandler = chat.match(/if \(state === 'delta'\) \{[\s\S]*?\n    return\n  \}/)?.[0] || ''
  const sandbox = { result: null }

  vm.runInNewContext(`${mergeSource}; result = [
    mergeOpenClawStreamingText('Hello', ' world', true),
    mergeOpenClawStreamingText('stale', 'replacement', false, { replace: true }),
    mergeOpenClawStreamingText('Hello', ' world', true, { cumulativeMessageText: 'Hello world' }),
    mergeOpenClawStreamingText('wrong', ' world', true, { cumulativeMessageText: 'Hello world' }),
  ]`, sandbox)

  assert.deepEqual(Array.from(sandbox.result), ['Hello world', 'replacement', 'Hello world', 'Hello world'])
  assert.match(adapter, /typeof data\.deltaText === 'string'/)
  assert.match(adapter, /typeof payload\.deltaText === 'string'/)
  assert.match(adapter, /_openClawReplaceDelta: replaceDelta/)
  assert.match(adapter, /_openClawCumulativeMessageText: cumulativeMessageText/)
  assert.match(deltaHandler, /replace: nativeDeltaText != null \? nativeReplaceDelta : payload\._openClawReplaceDelta === true/)
  assert.match(deltaHandler, /: \(payload\._openClawCumulativeMessageText \|\| ''\)/)
  assert.match(deltaHandler, /typeof payload\.deltaText === 'string'/)
  assert.match(deltaHandler, /typeof payload\.data\?\.deltaText === 'string'/)
  assert.match(deltaHandler, /nativeDeltaText != null \? !nativeReplaceDelta/)
})

test('OpenClaw tool-task conclusion deltas are not collapsed by a reused event or message id', () => {
  const sequenceSource = chat.match(/function getChatEventSequence[\s\S]*?\n\}/)?.[0] || ''
  const dedupeSource = chat.match(/function getChatEventDedupeKey[\s\S]*?\n\}/)?.[0] || ''
  const sandbox = {
    result: null,
    _sessionKey: 'agent:main:test',
    getChatEventText(payload) {
      return String(payload?.message?.content || '')
    },
  }

  vm.runInNewContext(`${sequenceSource}; ${dedupeSource}; result = [
    getChatEventDedupeKey({ state: 'delta', runId: 'run-1', sequence: 1, message: { id: 'fixed' } }, 'fixed-event'),
    getChatEventDedupeKey({ state: 'delta', runId: 'run-1', sequence: 2, message: { id: 'fixed' } }, 'fixed-event'),
    getChatEventDedupeKey({ state: 'delta', runId: 'run-1', sequence: 2, message: { id: 'fixed' } }, 'fixed-event'),
    getChatEventDedupeKey({ state: 'delta', runId: 'run-1', _openClawIncrementalDelta: true, message: { id: 'fixed', content: 'same token' } }, 'fixed-event'),
    getChatEventDedupeKey({ state: 'final', runId: 'run-1', message: { id: 'fixed', content: 'done' } }, 'fixed-event'),
  ]`, sandbox)

  const keys = Array.from(sandbox.result)
  assert.notEqual(keys[0], keys[1])
  assert.equal(keys[1], keys[2])
  assert.equal(keys[3], '')
  assert.equal(keys[4], 'event:fixed-event')
  assert.match(dedupeSource, /payload\.state === 'delta'/)
  assert.match(dedupeSource, /payload\._openClawIncrementalDelta === true/)
  assert.match(dedupeSource, /return ''/)
  assert.match(wsClientSource, /const isOpenClawLiveStreamEvent = msg\.event === 'agent'/)
  assert.match(wsClientSource, /!isOpenClawLiveStreamEvent && msg\.id && this\._seenMessageIds\.has\(msg\.id\)/)
  assert.match(wsClientSource, /!isOpenClawLiveStreamEvent && msg\.id/)
})

test('OpenClaw watchdog timers are isolated to the request that created them', () => {
  const doSend = chat.match(/async function doSend[\s\S]*?function buildAttachmentTriggeredPrompt/)?.[0] || ''
  const settle = chat.match(/async function settleOpenClawActiveRunFromWatchdog[\s\S]*?function _startResponseWatchdog/)?.[0] || ''
  const watchdog = chat.match(/function _startResponseWatchdog[\s\S]*?function _resetWatchdogOnActivity/)?.[0] || ''

  assert.match(doSend, /_cancelResponseWatchdog\(\)[\s\S]*?_sendTimestamp = Date\.now\(\)/)
  assert.match(settle, /expectedRequestId !== _activeClientRequestId/)
  assert.match(watchdog, /requestId !== _activeClientRequestId/)
  assert.match(watchdog, /settleOpenClawActiveRunFromWatchdog\('active-run-watchdog-timeout', requestId\)/)
  assert.doesNotMatch(watchdog, /clearOpenClawGenerationState\('(?:watchdog|history)-visible-assistant'/)
  assert.match(watchdog, /hasOpenClawAssistantVisibleContentForRequest\(requestId\)[\s\S]*?markGenerationProgress\(\)[\s\S]*?_startResponseWatchdog\(\)/)
  assert.match(watchdog, /_lastResponseActivityAt = _lastResponseActivityAt \|\| _sendTimestamp/)
  assert.match(watchdog, /idleDuration = Date\.now\(\) - \(_lastResponseActivityAt \|\| _sendTimestamp\)/)
  assert.match(chat, /isOpenClawResponseIdleTimedOut\(_lastResponseActivityAt, _sendTimestamp\)/)
  assert.doesNotMatch(watchdog, /Date\.now\(\) - _sendTimestamp >= OPENCLAW_ACTIVE_RUN_WATCHDOG_MS/)
  assert.match(chat, /function _resetWatchdogOnActivity\(\)[\s\S]*?_lastResponseActivityAt = Date\.now\(\)/)
})

test('OpenClaw portable history only renews the idle watchdog for real execution progress', () => {
  const hydration = chat.match(/function hydrateOpenClawLiveHistoryProgress[\s\S]*?function attachOpenClawExecutionTimeline/)?.[0] || ''
  const poller = chat.match(/function startOpenClawProgressHistoryPolling[\s\S]*?function isOpenClawNativeSessionTerminal/)?.[0] || ''

  assert.match(hydration, /const timelineBefore = JSON\.stringify/)
  assert.match(hydration, /const timelineChanged = changed && timelineBefore !== JSON\.stringify/)
  assert.match(hydration, /return timelineChanged/)
  assert.match(poller, /if \(hydrateOpenClawLiveHistoryProgress\(rawMessages\)\) _resetWatchdogOnActivity\(\)/)
  assert.match(poller, /if \(hydrateOpenClawLiveHistoryProgress\(messages\)\) _resetWatchdogOnActivity\(\)/)
})

test('OpenClaw portable JSONL publishes running tool calls and completed tool results during a live run', () => {
  const hydration = chat.match(/function hydrateOpenClawLiveHistoryProgress[\s\S]*?function attachOpenClawExecutionTimeline/)?.[0] || ''
  const toolHydration = chat.match(/function hydrateOpenClawRunTimelineFromTools[\s\S]*?function collapseOpenClawRunTimeline/)?.[0] || ''

  assert.match(openclawHistorySource, /fn tool_calls\(message: &Value\) -> Vec<Value>/)
  assert.match(openclawHistorySource, /"status": "running"/)
  assert.match(openclawHistorySource, /fn tool_result_failed\(message: &Value\) -> bool/)
  assert.match(openclawHistorySource, /"tools": tool_calls\(message\)/)
  assert.match(openclawHistorySource, /"isError": tool_result_failed\(message\)/)
  assert.match(hydration, /message\?\.role === 'tool' \|\| message\?\.role === 'toolResult'/)
  assert.match(hydration, /recordOpenClawProgressNarrative\(message\.text \|\| '', message\.id \|\| message\.messageId\)/)
  assert.match(hydration, /hydrateOpenClawRunTimelineFromTools\(message\.tools\)/)
  assert.match(hydration, /hydrateOpenClawRunTimelineFromToolResult\(message\)/)
  assert.match(toolHydration, /tool\?\.status \|\| \(tool\?\.isError \? 'error' : 'running'\)/)
  assert.match(chat, /function hydrateOpenClawRunTimelineFromToolResult\(message = \{\}\)/)
})

test('OpenClaw keeps user-visible tool-use narration as a separate execution step', () => {
  const restore = chat.match(/function attachOpenClawExecutionTimeline[\s\S]*?function hydrateOpenClawRunTimelineFromTools/)?.[0] || ''

  assert.match(restore, /if \(narrative && !isOpenClawVisibleTextInternalAuditOnly\(narrative\)\)/)
  assert.match(restore, /key: `progress:\$\{message\.id \|\| message\.messageId \|\| steps\.length\}`/)
  assert.match(restore, /key: `tool:\$\{id\}`/)
  assert.match(chat, /function hydrateOpenClawRunTimelineFromTools\(tools = \[\]\)/)
})

test('OpenClaw watchdog expires on inactivity rather than total run duration', () => {
  const helperSource = chat.match(/function isOpenClawResponseIdleTimedOut[\s\S]*?\n\}/)?.[0] || ''
  const sandbox = { result: null }

  vm.runInNewContext(`${helperSource}; result = [
    isOpenClawResponseIdleTimedOut(590000, 0, 600000, 300000),
    isOpenClawResponseIdleTimedOut(299999, 0, 600000, 300000),
    isOpenClawResponseIdleTimedOut(300001, 0, 600000, 300000),
  ]`, sandbox)

  assert.deepEqual(Array.from(sandbox.result), [false, true, false])
})

test('OpenClaw lifecycle end forces durable native reply recovery', () => {
  const eventHandler = chat.match(/function handleEvent\([\s\S]*?\n\}\n\nfunction handleChatEvent/)?.[0] || ''

  assert.match(eventHandler, /phase === 'end'/)
  assert.match(eventHandler, /startOpenClawProgressHistoryPolling\(\)/)
  assert.match(eventHandler, /recoverOpenClawAssistantFromHistoryBeforeFallback\('agent-lifecycle-end'/)
  assert.match(eventHandler, /attempts: 10/)
  assert.match(eventHandler, /delayMs: 250/)
})

test('OpenClaw history recovery cannot bind the previous reply by array position', () => {
  const matchReason = chat.match(/function getOpenClawStrongHistoryMatchReason\([\s\S]*?\n\}/)?.[0] || ''
  const strongCandidate = chat.match(/function isStrongOpenClawHistoryCandidate\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(matchReason, /msg\._openClawPreviousUserFingerprint !== activeRun\.userTextFingerprint/)
  assert.doesNotMatch(matchReason, /return 'previousUserIndex'/)
  assert.match(strongCandidate, /getOpenClawMessageCreatedTime\(msg\)/)
  assert.doesNotMatch(strongCandidate, /Number\(msg\.timestamp\)/)
})

test('OpenClaw reconnect replay cannot bind the previous run before the current first frame', () => {
  const binding = chat.match(/function isOpenClawEventBoundToActiveRequest[\s\S]*?function shouldIgnoreOpenClawUnboundChatEvent/)?.[0] || ''
  const unbound = chat.match(/function shouldIgnoreOpenClawUnboundChatEvent[\s\S]*?function shouldUseOpenClawEmptyReplyFallback/)?.[0] || ''
  const mismatch = chat.match(/function isOpenClawStreamIdMismatch[\s\S]*?function hasOpenClawAssistantVisibleContentForRequest/)?.[0] || ''

  assert.match(binding, /eventRunId === activeRequestId/)
  assert.match(binding, /eventRunId === activeRunId/)
  assert.match(unbound, /!isOpenClawEventBoundToActiveRequest\(event\)/)
  assert.match(mismatch, /!isOpenClawEventBoundToActiveRequest\(event\)/)
  assert.ok(mismatch.indexOf('isOpenClawEventBoundToActiveRequest') < mismatch.indexOf('!_currentAiBubbleRequestId'))
})

test('OpenClaw history never appends an older assistant below the latest visible user', () => {
  const mergeHistory = chat.match(/function mergeHistoryIntoCurrentMessages[\s\S]*?function clearInitialOpenClawHistoryLoadTimers/)?.[0] || ''
  const appendHistory = chat.match(/function appendOpenClawHistoryMessage[\s\S]*?function completeStreamingDraftFromHistory/)?.[0] || ''
  const replaceDraft = chat.match(/function replaceOpenClawPartialAssistantAfterLastUser[\s\S]*?function appendOpenClawHistoryMessage/)?.[0] || ''
  const completeDraft = chat.match(/function completeStreamingDraftFromHistory[\s\S]*?function completeOpenClawCurrentDraftFromLatestHistory/)?.[0] || ''
  const recoverLatest = chat.match(/function completeOpenClawCurrentDraftFromLatestHistory[\s\S]*?function mergeHistoryIntoCurrentMessages/)?.[0] || ''

  assert.match(chat, /function getOpenClawLastVisibleUserCreatedTime\(\)/)
  assert.match(mergeHistory, /lastVisibleUserCreatedTime/)
  assert.match(mergeHistory, /getOpenClawMessageCreatedTime\(msg\) < lastVisibleUserCreatedTime/)
  assert.ok(mergeHistory.indexOf('getOpenClawMessageCreatedTime(msg) < lastVisibleUserCreatedTime') < mergeHistory.indexOf('appendOpenClawHistoryMessage(msg)'))
  assert.match(appendHistory, /getOpenClawMessageCreatedTime\(msg\) < lastVisibleUserCreatedTime/)
  assert.match(replaceDraft, /getOpenClawMessageCreatedTime\(msg\) < lastVisibleUserCreatedTime/)
  assert.match(recoverLatest, /latestHistoryUserFingerprint !== expectedUserFingerprint/)
  assert.match(recoverLatest, /for \(let index = latestUserIndex; index < deduped\.length/)
  assert.match(completeDraft, /const historyText = sanitizeOpenClawVisibleReply\(msg\.text/)
  assert.doesNotMatch(completeDraft, /chooseBestOpenClawAssistantText\(\[_currentAiText, msg\.text\]/)
})

test('OpenClaw progress cards reject tool events from a prior run or another session', () => {
  const eventHandler = chat.match(/function handleEvent\(msg\)[\s\S]*?if \(isOpenClawChatEvent\(event\)\) handleChatEvent/)?.[0] || ''

  assert.match(eventHandler, /agentSessionKey/)
  assert.match(eventHandler, /agentSessionKey !== currentSessionKey/)
  assert.match(eventHandler, /generationActive && !isOpenClawEventBoundToActiveRequest\(payload\)/)
  assert.ok(eventHandler.indexOf('isOpenClawEventBoundToActiveRequest(payload)') < eventHandler.indexOf("if (stream === 'tool'"))
})

test('OpenClaw attachment OCR is delegated to the Gateway rather than precomputed in chat send', () => {
  const sendStart = chat.indexOf('async function sendMessage(')
  const sendEnd = chat.indexOf('async function doSend(', sendStart)
  const send = chat.slice(sendStart, sendEnd)

  assert.doesNotMatch(send, /runOcrForAttachmentData\(/)
  assert.doesNotMatch(send, /\[OCR\]/)
  assert.match(chat, /Call superclaw_ocr with imagePath=/)
  assert.match(chat, /IMAGE_ATTACHMENT_CONTEXT/)
})

test('OpenClaw turns channel and plugin checks into native read-only inspections', () => {
  assert.match(chat, /function isOpenClawNativeInspectionRequest/)
  assert.match(chat, /NATIVE_INSPECTION_REQUIRED/)
  assert.match(chat, /Call skill_manager action=audit for installed skills/)
  assert.match(chat, /do not reply with a plan/i)
})

test('OpenClaw history fingerprints strip injected execution instructions before matching a live turn', () => {
  const stripRuntimeBlocks = chat.match(/function stripOpenClawRuntimePromptBlocks[\s\S]*?\n\}/)?.[0] || ''
  assert.match(stripRuntimeBlocks, /NATIVE_INSPECTION_REQUIRED/)
  assert.match(stripRuntimeBlocks, /CAPABILITY_AUDIT_TRIGGER/)
  assert.match(stripRuntimeBlocks, /DOCUMENT_ATTACHMENT_CONTEXT/)
  assert.match(stripRuntimeBlocks, /IMAGE_ATTACHMENT_CONTEXT/)
  assert.match(stripRuntimeBlocks, /图片识别触发/)
  assert.match(chat, /function openClawVisibleUserText\(text\) \{\s*return stripOpenClawHistoryUserTimestamp\(stripOpenClawRuntimePromptBlocks\(text\)\)/)
})

test('OpenClaw recovers MEDIA:<path> outputs into renderable images from assistant text', () => {
  const helper = chat.match(/function extractOpenClawMediaImagePaths[\s\S]*?\n\}/)?.[0] || ''
  const sandbox = { result: null }
  vm.runInNewContext(`${helper}; result = [
    extractOpenClawMediaImagePaths('已完成美化。\\n\\nMEDIA:C:\\\\Users\\\\ZXKJ\\\\image-1.png'),
    extractOpenClawMediaImagePaths('MEDIA: "D:/media/generated/photo.jpg"'),
    extractOpenClawMediaImagePaths('普通文本，没有媒体'),
    extractOpenClawMediaImagePaths('MEDIA:C:\\\\path\\\\notes.txt'),
  ]`, sandbox)
  const [first, quoted, none, nonImage] = sandbox.result
  assert.equal(first.length, 1)
  assert.equal(first[0].generatedMediaPath, 'C:\\Users\\ZXKJ\\image-1.png')
  assert.equal(first[0].fileName, 'image-1.png')
  assert.equal(quoted.length, 1)
  assert.equal(quoted[0].generatedMediaPath, 'D:/media/generated/photo.jpg')
  assert.equal(none.length, 0)
  assert.equal(nonImage.length, 0)
  assert.match(chat, /extractOpenClawMediaImagePaths\(safeVisibleText\)/)
  assert.match(chat, /extractOpenClawMediaImagePaths\(visibleText\)/)
})

test('OpenClaw strips the portable MEDIA:<path> marker from visible prose but still renders the image', () => {
  const stripAnsi = 'function stripAnsi(text) { return String(text || \'\').replace(/\\x1b\\[[0-9;]*m/g, \'\') }'
  const stripThinking = chat.match(/function stripThinkingTags[\s\S]*?\n\}/)?.[0] || ''
  const stripBlocks = chat.match(/function stripOpenClawInternalBlocks[\s\S]*?\n\}/)?.[0] || ''
  const extractMedia = chat.match(/function extractOpenClawMediaImagePaths[\s\S]*?\n\}/)?.[0] || ''
  const sandbox = { result: null }

  vm.runInNewContext(`${stripAnsi}; ${stripThinking}; ${stripBlocks}; ${extractMedia}; result = [
    stripOpenClawInternalBlocks('已完成美化。\\n\\nMEDIA:C:\\\\Users\\\\ZXKJ\\\\image-1.png'),
    stripOpenClawInternalBlocks('MEDIA: "D:/media/generated/photo.jpg"'),
    stripOpenClawInternalBlocks('普通文本，没有媒体标记'),
    extractOpenClawMediaImagePaths('已完成美化。\\n\\nMEDIA:C:\\\\Users\\\\ZXKJ\\\\image-1.png').length,
  ]`, sandbox)

  const [stripped, quoted, plain, mediaCount] = sandbox.result
  assert.doesNotMatch(stripped, /MEDIA:/i)
  assert.match(stripped, /已完成美化/)
  assert.doesNotMatch(quoted, /MEDIA:/i)
  assert.equal(plain, '普通文本，没有媒体标记')
  assert.equal(mediaCount, 1)
  assert.match(stripBlocks, /MEDIA:/)
  // Stripping the MEDIA marker from sanitized text is what makes the
  // text-only MEDIA record and the gateway image-block record share one
  // display fingerprint, so history collapses them into a single reply
  // instead of rendering the same image twice.
  const fingerprintBlock = chat.match(/function getOpenClawDisplayFingerprint[\s\S]*?\n\}/)?.[0] || ''
  assert.match(fingerprintBlock, /sanitizeOpenClawVisibleReply\(rawText\)/)
})

test('OpenClaw merges a gateway image URL with its portable MEDIA path into one rendered image', () => {
  const merge = chat.match(/function mergeOpenClawUniqueMedia[\s\S]*?\n\}/)?.[0] || ''
  const gatewayItem = chat.match(/function isOpenClawGatewayMediaItem[\s\S]*?\n\}/)?.[0] || ''
  const localItem = chat.match(/function isOpenClawLocalMediaImageItem[\s\S]*?\n\}/)?.[0] || ''
  const mediaKey = chat.match(/function getOpenClawMediaDedupeKey[\s\S]*?\n\}/)?.[0] || ''
  const gatewayRoute = chat.match(/function isOpenClawGatewayMediaRoute[\s\S]*?\n\}/)?.[0] || ''
  const windowsPath = chat.match(/function isOpenClawWindowsImagePath[\s\S]*?\n\}/)?.[0] || ''
  const fileUrl = chat.match(/function isOpenClawFileImageUrl[\s\S]*?\n\}/)?.[0] || ''
  const sandbox = { result: null }

  vm.runInNewContext(`${gatewayRoute}; ${windowsPath}; ${fileUrl}; ${gatewayItem}; ${localItem}; ${mediaKey}; ${merge}; result = [
    mergeOpenClawUniqueMedia(
      [{ mediaType: 'image/png', generatedMediaPath: 'C:\\\\data\\\\generated\\\\media\\\\image-1.png', mediaPath: 'C:\\\\data\\\\generated\\\\media\\\\image-1.png', fileName: 'image-1.png' }],
      [{ url: '/api/chat/media/outgoing/run/media/uuid/full', imageUrl: '/api/chat/media/outgoing/run/media/uuid/full', mediaType: 'image/png' }]
    ),
    mergeOpenClawUniqueMedia(
      [{ url: '/api/chat/media/outgoing/run/media/uuid/full', imageUrl: '/api/chat/media/outgoing/run/media/uuid/full', mediaType: 'image/png' }],
      []
    ),
    mergeOpenClawUniqueMedia(
      [{ mediaType: 'image/png', generatedMediaPath: 'C:\\\\data\\\\generated\\\\media\\\\image-1.png', mediaPath: 'C:\\\\data\\\\generated\\\\media\\\\image-1.png', fileName: 'image-1.png' }],
      []
    ),
  ]`, sandbox)

  const [both, gatewayOnly, localOnly] = sandbox.result
  assert.equal(both.length, 1)
  assert.equal(both[0].generatedMediaPath, 'C:\\data\\generated\\media\\image-1.png')
  assert.equal(both[0].url, undefined)
  assert.equal(gatewayOnly.length, 1)
  assert.equal(gatewayOnly[0].url, '/api/chat/media/outgoing/run/media/uuid/full')
  assert.equal(localOnly.length, 1)
  assert.equal(localOnly[0].generatedMediaPath, 'C:\\data\\generated\\media\\image-1.png')
})

test('OpenClaw restores user-uploaded MediaPath fields as renderable history attachments', () => {
  assert.match(openclawHistorySource, /fn user_image_attachments\(message: &Value\)/)
  assert.match(openclawHistorySource, /\.get\("MediaPaths"\)/)
  assert.match(openclawHistorySource, /\.get\("MediaPath"\)/)
  assert.match(openclawHistorySource, /"generatedMediaPath": trimmed/)
  assert.match(chat, /generatedMediaPath: img\.generatedMediaPath \|\| ''/)
  assert.match(chat, /generatedMediaPath: i\.generatedMediaPath \|\| ''/)
  assert.match(chat, /fallbackMediaPath: img\.fallbackMediaPath \|\| ''/)
  assert.match(chat, /fallbackMediaPath: i\.fallbackMediaPath \|\| ''/)
})

test('OpenClaw renders real tool execution alongside assistant prose', () => {
  const renderCard = chat.match(/function renderOpenClawToolResultCard[\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(renderCard, /isOpenClawToolDebugEnabled\(\)/)
  assert.match(chat, /upsertTool\(_currentAiTools, \{/)
  assert.match(chat, /function ensureOpenClawRunTimelineBubble\(\)/)
  assert.match(chat, /function renderOpenClawLiveTimeline\(\)/)
  assert.match(chat, /function hydrateOpenClawRunTimelineFromTools\(tools = \[\]\)/)
  assert.match(chat, /const name = getOpenClawToolDisplayName\(tool\) \|\|/)
  assert.match(chat, /if \(_activeOpenClawRun\) _activeOpenClawRun\.sawToolCall = true/)
  assert.match(chat, /renderOpenClawLiveTimeline\(\)/)
  assert.match(chat, /if \(tools\?\.length \|\| renderMeta\.executionTimeline\?\.length\) appendToolsToEl\(bubble, tools, renderMeta\.executionTimeline\)/)
  assert.match(chat, /function shouldRenderOpenClawToolMessage\(message = \{\}\) \{\s*return isOpenClawToolLikeMessage\(message\)/)
  assert.match(chat, /hasVisibleNonToolContent \|\|\s*tools\?\.length/)
  assert.match(chat, /tools,\s*\n\s*screenshotCards/)
})

test('OpenClaw execution timeline is live, safe, and collapses after the final reply', () => {
  const renderCard = chat.match(/function renderOpenClawToolResultCard[\s\S]*?\n\}/)?.[0] || ''
  assert.match(renderCard, /document\.createElement\('details'\)/)
  assert.match(renderCard, /openclaw-run-timeline/)
  assert.match(renderCard, /openclaw-run-timeline__toggle/)
  assert.match(renderCard, /container\.insertBefore\(card, container\.firstChild\)/)
  assert.match(chat, /const retainedExecutionTimeline = container\.querySelector\?\.\('\.openclaw-run-timeline'\) \|\| null/)
  assert.match(chat, /if \(retainedExecutionTimeline\) container\.insertBefore\(retainedExecutionTimeline, wrapper\)/)
  assert.match(renderCard, /if \(active\) card\.open = true/)
  assert.match(renderCard, /const displayedToolCount = Math\.max\(info\.toolCount, timelineToolCount\)/)
  assert.match(chat, /recordOpenClawRunStep\('analysis', thought \? `推理摘要：\$\{thought\}` : '正在分析任务并确定下一步。'/)
  assert.match(chat, /recordOpenClawRunStep\('plan', plan \? `计划更新：\$\{plan\}` : '正在规划执行步骤。'/)
  assert.match(chat, /recordOpenClawRunStep\('plan', `开始处理：\$\{initialTaskSummary\.slice\(0, 180\)\}/)
  assert.match(chat, /recordOpenClawRunStep\('plan', `开始处理：\$\{initialTaskSummary[^]*?'running', 'initial-plan'\)/)
  assert.match(chat, /if \(_currentAiTimeline\.length \|\| hasTimelineOverride\) \{\s*if \(existing\) existing\.remove\(\)\s*renderOpenClawToolResultCard\(el, \[\], '', timelineOverride\)/)
  assert.match(chat, /A live timeline is progress, not a completed assistant reply/)
  assert.match(chat, /const liveTimeline = _currentAiBubble\?\.querySelector\?\.\('\.openclaw-run-timeline\[open\]'\)/)
  assert.match(chat, /completeOpenClawCurrentDraftFromLatestHistory\(remoteDeduped\)/)
  assert.match(chat, /msg\._openClawAfterLatestHistoryUser && msg\.tools\?\.length/)
  const historyProgressBlock = chat.match(/function completeOpenClawCurrentDraftFromLatestHistory[\s\S]*?function mergeHistoryIntoCurrentMessages/)?.[0] || ''
  assert.match(historyProgressBlock, /hydrateOpenClawRunTimelineFromTools\(msg\.tools\)[\s\S]*?renderOpenClawLiveTimeline\(\)/)
  const recoveryBlock = chat.match(/function canRecoverOpenClawDraftFromLatestHistory[\s\S]*?function ensureOpenClawHistoryRecoveryBubble/)?.[0] || ''
  assert.match(recoveryBlock, /if \(_activeOpenClawRun && isStrongOpenClawHistoryCandidate\(msg, _activeOpenClawRun\)\) return true/)
  assert.match(recoveryBlock, /if \(recoveringToolTurn\) return false/)
  const completionBlock = chat.match(/function completeStreamingDraftFromHistory[\s\S]*?function completeOpenClawCurrentDraftFromLatestHistory/)?.[0] || ''
  assert.match(completionBlock, /stopOpenClawProgressHistoryPolling\(\)[\s\S]*?_cancelResponseWatchdog\(\)[\s\S]*?clearGenerationTimeoutManager\(\)[\s\S]*?showTyping\(false\)/)
  assert.doesNotMatch(chat, /_currentAiTimeline = _currentAiTimeline\.slice\(-80\)/)
  assert.match(chat, /function mergeOpenClawExecutionTimelines\(\.\.\.sources\)/)
  assert.match(chat, /_currentAiTimeline = mergeOpenClawExecutionTimelines\(_currentAiTimeline, msg\.executionTimeline\)/)
  assert.match(chat, /const wasOpen = existing\?\.open === true/)
  assert.match(chat, /if \(replacement && wasOpen\) replacement\.open = true/)
  assert.match(chat, /function startOpenClawProgressHistoryPolling\(\)/)
  assert.match(chat, /_openClawProgressHistoryTimer = setInterval\(refresh, 2500\)/)
  assert.match(chat, /const history = await wsClient\.chatHistory\(_sessionKey, 200\)/)
  assert.match(chat, /completeOpenClawCurrentDraftFromLatestHistory\(messages\)/)
  assert.match(chat, /stopOpenClawProgressHistoryPolling\(\)/)
  assert.match(chat, /collapseOpenClawRunTimeline\(_currentAiBubble\)/)
  const collapseBlock = chat.match(/function collapseOpenClawRunTimeline[\s\S]*?function ensureOpenClawRunTimelineBubble/)?.[0] || ''
  assert.match(collapseBlock, /title\.textContent = '执行过程'/)
  assert.doesNotMatch(chat, /innerHTML\s*=\s*.*(?:reasoning|chain.of.thought)/i)
})

test('OpenClaw live history collects tool-use frames before final-history compaction', () => {
  const liveProgress = chat.match(/function hydrateOpenClawLiveHistoryProgress\([\s\S]*?\n\}/)?.[0] || ''
  const poller = chat.match(/function startOpenClawProgressHistoryPolling\([\s\S]*?function isOpenClawNativeSessionTerminal/)?.[0] || ''

  assert.doesNotMatch(liveProgress, /dedupeHistoryStable\(historyMessages\)/)
  assert.match(liveProgress, /sortOpenClawMessagesChronologically/)
  assert.match(liveProgress, /normalizeOpenClawHistoryRecord/)
  assert.match(liveProgress, /isOpenClawToolUseMessage\(message\)/)
  assert.match(liveProgress, /recordOpenClawProgressNarrative\(message\.text/)
  assert.match(liveProgress, /hydrateOpenClawRunTimelineFromTools\(message\.tools\)/)
  assert.match(liveProgress, /renderOpenClawLiveTimeline\(\)/)
  assert.match(poller, /hydrateOpenClawLiveHistoryProgress\(rawMessages\)/)
  assert.match(poller, /hydrateOpenClawLiveHistoryProgress\(messages\)/)
})

test('OpenClaw history recovery does not mistake the execution card for assistant prose', () => {
  const recoverableDraft = chat.match(/function isRecoverableOpenClawCurrentDraft\(\)[\s\S]*?\n\}/)?.[0] || ''

  assert.match(recoverableDraft, /querySelector\?\.\('\[data-openclaw-assistant-content="true"\]'\)/)
  assert.match(recoverableDraft, /assistantContent\?\.innerText/)
  assert.match(recoverableDraft, /!assistantContent \|\|/)
  assert.doesNotMatch(recoverableDraft, /getOpenClawAssistantContentText\(_currentAiBubble\)/)
})

test('OpenClaw portable history preserves a trajectory final without duplicating a durable reply', () => {
  assert.match(openclawHistorySource, /\.trajectory\.jsonl/)
  assert.match(openclawHistorySource, /trajectory_messages\(&trajectory_source\)/)
  assert.match(openclawHistorySource, /let same_run =/)
  assert.match(openclawHistorySource, /let same_text =/)
  assert.match(openclawHistorySource, /if !already_present \{\s+segment_messages\.push\(candidate\);\s+\}/)
})

test('OpenClaw execution timeline persists through snapshots and local history restore', () => {
  const snapshotBlock = chat.match(/function collectOpenClawVisibleMessagesForSnapshot\([\s\S]*?function normalizeOpenClawSnapshotMessage/)?.[0] || ''
  const cacheBlock = chat.match(/function cachedHistoryMessage\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(snapshotBlock, /collectOpenClawExecutionTimelineFromBubble\(bubble\)/)
  assert.match(snapshotBlock, /executionTimeline,/)
  assert.match(chat, /function collectOpenClawExecutionTimelineFromBubble\(bubble\)/)
  assert.match(cacheBlock, /executionTimeline: Array\.isArray\(m\.executionTimeline\)/)
  assert.match(messageDb, /'executionTimeline'/)
  assert.match(chat, /executionTimeline: msg\.executionTimeline \|\| \[\]/)
})

test('OpenClaw finishes a packaged native tool-only run once the portable session is terminal', () => {
  const poller = chat.match(/function startOpenClawProgressHistoryPolling\([\s\S]*?function isOpenClawNativeSessionTerminal/)?.[0] || ''
  const terminalFallback = chat.match(/function completeOpenClawTerminalToolOnlyRun\([\s\S]*?function _cancelResponseWatchdog/)?.[0] || ''

  assert.match(poller, /api\.readOpenclawRawHistory\(_sessionKey, 300\)/)
  assert.ok(
    poller.indexOf('api.readOpenclawRawHistory(_sessionKey, 300)') < poller.indexOf('if (!wsClient.gatewayReady) return'),
    'portable JSONL recovery must continue while the Gateway WebSocket reconnects',
  )
  assert.match(poller, /completeOpenClawTerminalToolOnlyRun\(raw\)/)
  assert.match(chat, /function isOpenClawNativeSessionTerminal\(status\)/)
  assert.match(terminalFallback, /rawHistory\?\.sessionStatus/)
  assert.match(terminalFallback, /normalizeOpenClawPromptFingerprint\(latestUserText\)/)
  assert.match(terminalFallback, /clearOpenClawGenerationState\('native-terminal-tool-only'/)
  assert.match(terminalFallback, /resetStreamState\(\)/)
})

test('OpenClaw internal tool preludes do not become a visible generic retry reply', () => {
  const sanitize = chat.match(/function sanitizeOpenClawVisibleReply[\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(sanitize, /OPENCLAW_INTERNAL_REASONING_VISIBLE_FALLBACK/)
  assert.match(sanitize, /containsOpenClawInternalReasoningOutput\(visibleInput\) \? '' : visibleInput/)
  assert.match(sanitize, /preserveNonReasoningEnglish: !containsOpenClawInternalReasoningOutput\(safeInput\)/)
})

test('OpenClaw OCR uses the shared portable runtime through a native plugin', () => {
  assert.match(ocrManifest, /"id": "superclaw-ocr"/)
  assert.match(ocrManifest, /"superclaw_ocr"/)
  assert.match(ocrPlugin, /definePluginEntry/)
  assert.match(ocrPlugin, /name: "superclaw_ocr"/)
  assert.match(ocrPlugin, /ocr-runner\.cjs/)
  assert.match(ocrPlugin, /runtimeRoot\(\)/)
  assert.match(ocrPlugin, /for \(let depth = 0; depth < 12; depth \+= 1\)/)
  assert.match(ocrPlugin, /path\.join\(cursor, "ocr"\)/)
  assert.match(ocrPlugin, /fs\.existsSync\(path\.join\(candidate, "ocr-runner\.cjs"\)\)/)
  assert.match(ocrPlugin, /systemInstallRequired: false/)
  assert.ok(
    ocrPlugin.indexOf('path.join(cursor, "ocr")') < ocrPlugin.indexOf('return path.resolve(__dirname, "../../../..")'),
    'portable OCR discovery must run before the legacy source-layout fallback',
  )
  assert.match(ocrPlugin, /TESSDATA_PREFIX/)
  assert.match(ocrPlugin, /Do not call it automatically for every attachment/)
  assert.doesNotMatch(ocrPlugin, /C:\\\\Users|C:\\/)
})

test('OpenClaw accepts portable Office and PDF attachments through the native Gateway', () => {
  const inputMarkup = chat.match(/<input type="file" id="chat-file-input"[\s\S]*?>/)?.[0] || ''
  const attachmentHandler = chat.match(/async function handleOpenClawAttachmentFiles[\s\S]*?function bindImagePasteHandlers/)?.[0] || ''
  const promptBuilder = chat.match(/function buildAttachmentTriggeredPrompt[\s\S]*?function buildIntentTriggeredToolPrompt/)?.[0] || ''

  assert.match(inputMarkup, /\.pdf,\.doc,\.docx,\.xls,\.xlsx,\.csv/)
  assert.match(chat, /const OPENCLAW_DOCUMENT_EXTENSIONS = new Set/)
  assert.match(attachmentHandler, /createOpenClawDocumentAttachmentFromFile/)
  assert.match(chat, /async function createOpenClawDocumentAttachmentFromFile\(file\)[\s\S]*?fileToBase64\(file\)/)
  assert.match(attachmentHandler, /OPENCLAW_ATTACHMENT_MAX_BYTES/)
  assert.match(chat, /wsClient\.chatSend\(_sessionKey, sendText, attachments\.length \? attachments : undefined/)
  assert.match(promptBuilder, /\[DOCUMENT_ATTACHMENT_CONTEXT\]/)
  assert.match(promptBuilder, /MediaPath\/MediaPaths/)
  assert.match(promptBuilder, /preserve the original, write a new output file/i)
})

test('OpenClaw final replies turn portable workspace outputs into safe file cards', () => {
  const outputParser = chat.match(/function extractOpenClawWorkspaceOutputFiles[\s\S]*?(?=function openOpenClawPdfPreview)/)?.[0] || ''
  const sandbox = { result: null }

  vm.runInNewContext(`${outputParser}; result = extractOpenClawWorkspaceOutputFiles('已生成 C:\\\\portable\\\\data\\\\.openclaw\\\\workspace\\\\outbox\\\\report.docx');`, sandbox)
  assert.equal(sandbox.result.length, 1)
  assert.equal(sandbox.result[0].fileName, 'report.docx')
  assert.equal(sandbox.result[0].workspaceOutputPath.endsWith('report.docx'), true)
  const extractContent = chat.match(/function extractContent\(msg\)[\s\S]*?if \(Array\.isArray\(msg\.content\)\)/)?.[0] || ''
  assert.match(extractContent, /const visibleArtifactText = stripThinkingTags\(artifactText\)/)
  assert.match(extractContent, /files: extractOpenClawWorkspaceOutputFiles\(visibleArtifactText\)/)
  assert.match(chat, /function appendOpenClawOutputFiles\(el, files = \[\], text = ''\)/)
  assert.match(chat, /appendOpenClawOutputFiles\(bubble, files, text\)/)
  assert.match(chat, /appendOpenClawOutputFiles\(bubble, msg\.files \|\| \[\], finalText\)/)
  assert.match(chat, /appendOpenClawOutputFiles\(_currentAiBubble, msg\.files \|\| \[\], visibleDraftText\)/)
  assert.match(chat, /openclawOpenWorkspaceOutput/)
  assert.match(chat, /openclawDownloadWorkspaceOutput/)
  assert.match(openclawHistorySource, /pub async fn openclaw_open_workspace_output/)
  assert.match(openclawHistorySource, /pub async fn openclaw_download_workspace_output/)
  assert.match(openclawHistorySource, /target\.starts_with\(&workspace\)/)
})

test('OpenClaw renders safe image and PDF previews without bypassing the current chat', () => {
  const dataUrl = chat.match(/function getOpenClawAttachmentDataUrl[\s\S]*?function isOpenClawPdfAttachment/)?.[0] || ''
  const preview = chat.match(/function openOpenClawPdfPreview[\s\S]*?function createOpenClawFileCard/)?.[0] || ''
  const lightbox = chat.match(/function showLightbox[\s\S]*?function appendSystemMessage/)?.[0] || ''

  assert.match(dataUrl, /data:application\/pdf;base64/)
  assert.match(preview, /document\.createElement\('iframe'\)/)
  assert.match(preview, /event\.key === 'Escape'/)
  assert.match(chat, /function createOpenClawImageElement/)
  assert.match(chat, /showLightbox\(img\.src\)/)
  assert.match(lightbox, /document\.createElement\('img'\)/)
  assert.match(lightbox, /attachAnchoredImageZoom\(\{/)
  assert.match(lightbox, /step: 0\.15/)
  assert.match(lightbox, /if \(event\.target === lb\) dismiss\(\)/)
  assert.match(imageZoom, /event\.deltaY/)
  assert.match(imageZoom, /image\.style\.transformOrigin = 'center center'/)
  assert.match(imageZoom, /Math\.min\(maxZoom,/)
  assert.doesNotMatch(lightbox, /innerHTML\s*=/)
})

test('OpenClaw authenticated Gateway images use the portable Tauri media bridge', () => {
  const imageElement = chat.match(/function createOpenClawImageElement[\s\S]*?function getOpenClawAttachmentDataUrl/)?.[0] || ''

  assert.match(chat, /function isOpenClawGatewayMediaRoute\(value = ''\)/)
  assert.match(chat, /if \(isOpenClawGatewayMediaRoute\(direct\)\) return ''/)
  assert.match(imageElement, /isOpenClawGatewayMediaRoute\(mediaPath\)\s*\? await api\.loadOpenclawGatewayMedia\(mediaPath\)/)
  assert.match(tauriApi, /loadOpenclawGatewayMedia: \(path\) => invoke\('openclaw_load_gateway_media'/)
  assert.match(openclawHistorySource, /pub async fn openclaw_load_gateway_media\(path: String\)/)
  assert.match(openclawHistorySource, /route\.starts_with\("\/api\/chat\/media\/outgoing\/"\)/)
  assert.match(openclawHistorySource, /\.header\("Authorization", format!\("Bearer \{token\}"\)\)/)
  assert.match(openclawHistorySource, /!mime\.starts_with\("image\/"\)/)
  assert.doesNotMatch(openclawHistorySource, /C:\\\\Users|C:\\tmp/)
})

test('OpenClaw history preserves image blocks when assistant artifact text is selected first', () => {
  const extractContent = chat.match(/function extractContent\(msg\)[\s\S]*?if \(Array\.isArray\(msg\.content\)\)/)?.[0] || ''

  assert.match(chat, /function collectOpenClawContentImages\(content, initial = \[\]\)/)
  assert.match(extractContent, /images: collectOpenClawContentImages\(msg\.content, attachmentImages\)/)
})

test('OpenClaw history preserves images returned by native read tools', () => {
  const extractContent = chat.match(/function extractContent\(msg\)[\s\S]*?if \(msg\.role === 'assistant'\)/)?.[0] || ''

  assert.match(extractContent, /msg\.role === 'tool' \|\| msg\.role === 'toolResult'/)
  assert.match(extractContent, /images: collectOpenClawContentImages\(msg\.content, attachmentImages\)/)
})

test('OpenClaw restores native history before cache so stale sessions cannot hide media', () => {
  assert.match(chat, /const raw = await api\.readOpenclawRawHistory\(requestedSessionKey, 5_000\)/)
  assert.match(chat, /never reach the Gateway's portable JSONL/)
  assert.match(chat, /if \(local\.length\)/)
  assert.match(chat, /cachedHistoryMessage\(message, requestedSessionKey\)/)
  assert.match(chat, /function cachedHistoryMessage\(m, sessionKey = _sessionKey\)/)
  assert.match(chat, /sessionKey: normalizeOpenClawSessionKey\(m\.sessionKey \|\| sessionKey\)/)
})

test('OpenClaw restores every archived segment in the Gateway usage-family chain', () => {
  assert.match(openclawHistorySource, /fn portable_session_history_ids\(entry: &Value, current_id: &str\)/)
  assert.match(openclawHistorySource, /usageFamilySessionIds/)
  assert.match(openclawHistorySource, /fn portable_session_history_file\(sessions_dir: &Path, session_id: &str\)/)
  assert.match(openclawHistorySource, /name\.contains\("\.reset\."\)\s*\|\|\s*name\.contains\("\.deleted\."\)/)
  assert.match(openclawHistorySource, /let family_ids\s*=\s*portable_session_history_ids/)
  assert.match(openclawHistorySource, /for family_id in family_ids/)
})

test('OpenClaw restores the user-selected session and its raw history before Gateway readiness', () => {
  const renderStart = chat.indexOf('export async function render()')
  const renderEnd = chat.indexOf('const GUIDE_KEY', renderStart)
  const render = chat.slice(renderStart, renderEnd)

  const lastActiveIndex = render.indexOf('localStorage.getItem(STORAGE_LAST_ACTIVE_SESSION_KEY)')
  const recentLocalIndex = render.indexOf('getMostRecentLocalSessionKey()')
  assert.ok(lastActiveIndex >= 0 && recentLocalIndex >= 0 && lastActiveIndex < recentLocalIndex)
  assert.match(render, /if \(snapshotSessionKey\) void loadHistory\(snapshotSessionKey\)/)
})

test('OpenClaw renders portable JSONL history before a ready Gateway can stall chat.history', () => {
  const historyStart = chat.indexOf('async function loadHistory(')
  const historyEnd = chat.indexOf('function countDisplayedChatMessages()', historyStart)
  const history = chat.slice(historyStart, historyEnd)
  const rawRenderIndex = history.indexOf('renderOpenClawRecoveredHistory(rawHistory, requestedSessionKey, localDedupedForSession)')
  const gatewayHistoryIndex = history.indexOf('await wsClient.chatHistory(requestedSessionKey, 200)')

  assert.ok(rawRenderIndex >= 0 && gatewayHistoryIndex >= 0 && rawRenderIndex < gatewayHistoryIndex)
  assert.match(history, /if \(rawHistory\?\.length && !hasActiveOpenClawHistoryGeneration && isLoadHistoryForCurrentSession\(\)\)/)
})

test('OpenClaw native media history keeps the owning session and a renderable attachment fallback', () => {
  assert.match(openclawHistorySource, /"sessionKey": session_key/)
  assert.match(openclawHistorySource, /"attachments": if role == "user" \{/)
  assert.match(openclawHistorySource, /user_image_attachments\(message\)/)
  assert.match(openclawHistorySource, /image_attachments\(message\)/)
  assert.match(openclawHistorySource, /fn image_attachments\(message: &Value\)/)
  assert.match(openclawHistorySource, /fn user_image_attachments\(message: &Value\)/)
  assert.match(openclawHistorySource, /fn attach_openclaw_local_media_fallbacks\(messages: &mut \[Value\]\)/)
  assert.match(openclawHistorySource, /"fallbackMediaPath"/)
  assert.match(openclawHistorySource, /pub async fn openclaw_load_local_media\(path: String\)/)
  assert.match(chat, /await api\.loadOpenclawLocalMedia\(fallbackMediaPath\)/)
  assert.match(chat, /return mergeOpenClawUniqueMedia\(\[\], images\)/)
})

test('OpenClaw archives every successful generated-media read for future history recovery', () => {
  assert.match(openclawHistorySource, /fn history_media_dir\(\) -> PathBuf/)
  assert.match(openclawHistorySource, /fn archive_openclaw_media_file\(source: &str\)/)
  assert.match(openclawHistorySource, /fn gateway_media_archive_path\(route: &str, mime: &str\)/)
  assert.match(openclawHistorySource, /let _ = fs::write\(&archive_path, &bytes\)/)
  assert.match(openclawHistorySource, /messages\.sort_by\([\s\S]*attach_openclaw_local_media_fallbacks\(&mut messages\)/)
  assert.match(chat, /fallbackMediaPath: i\.fallbackMediaPath \|\| ''/)
})

test('OpenClaw execution cards retain provider public reasoning summaries without exposing raw reasoning', () => {
  const visibleProgress = chat.match(/function getOpenClawVisibleProgressFromEvent[\s\S]*?function hydrateOpenClawLiveHistoryProgress/)?.[0] || ''
  const eventHandler = chat.match(/function handleEvent[\s\S]*?function handleChatEvent/)?.[0] || ''

  assert.match(visibleProgress, /data\.reasoning_summary/)
  assert.match(visibleProgress, /data\.public_reasoning/)
  assert.match(visibleProgress, /data\.summary/)
  assert.match(visibleProgress, /isOpenClawVisibleTextInternalAuditOnly/)
  assert.doesNotMatch(visibleProgress, /data\.chain_of_thought/)
  assert.match(eventHandler, /const thought = getOpenClawVisibleProgressFromEvent\(data\)/)
  assert.match(eventHandler, /thought \? `推理摘要：\$\{thought\}` : '正在分析任务并确定下一步。'/)
})

test('product workflows stay in portable native skills with explicit confirmation boundaries', () => {
  assert.match(ecommerceSkill, /^name: superclaw-ecommerce/m)
  assert.match(ecommerceSkill, /desktop_control/)
  assert.match(ecommerceSkill, /current browser context/i)
  assert.match(ecommerceSkill, /explicit confirmation/i)
  assert.match(financeSkill, /^name: superclaw-finance/m)
  assert.match(financeSkill, /superclaw_ocr/)
  assert.match(financeSkill, /Never transfer funds/i)
  assert.match(ocrSkill, /^name: superclaw-ocr/m)
  assert.match(ocrSkill, /shared offline OCR engine/i)
  assert.match(ocrSkill, /Do not call OCR automatically/i)
  assert.match(videoSkill, /^name: superclaw-video-analysis/m)
  assert.match(videoSkill, /ffmpeg/i)
  assert.match(videoSkill, /SUPERCLAW_FFMPEG_PATH/)
  assert.match(videoSkill, /SUPERCLAW_FFPROBE_PATH/)
  assert.match(videoSkill, /explicit confirmation/i)
})
