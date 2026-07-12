import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const workspacePolicy = read('src-tauri/resources/templates/openclaw-workspace/AGENTS.md')
const taskSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-task-policy/SKILL.md')
const ecommerceSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-ecommerce/SKILL.md')
const financeSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-finance/SKILL.md')
const chat = read('src/pages/chat.js')
const ocrPlugin = read('src-tauri/resources/runtime/openclaw/dist/extensions/superclaw-ocr/index.js')
const ocrManifest = read('src-tauri/resources/runtime/openclaw/dist/extensions/superclaw-ocr/openclaw.plugin.json')

test('OpenClaw workspace policy makes native tools the execution authority', () => {
  assert.match(workspacePolicy, /native execution agent/i)
  assert.match(workspacePolicy, /Do not stop after/i)
  assert.match(workspacePolicy, /confirmation-required/i)
  assert.match(workspacePolicy, /Ecommerce/i)
  assert.match(workspacePolicy, /OCR/i)
  assert.match(workspacePolicy, /Finance/i)
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
  const finalHandler = chat.match(/if \(state === 'final'\) \{[\s\S]*?const stableStreamId = getOpenClawStableStreamId/)?.[0] || ''

  assert.match(chat, /function isOpenClawToolUseMessage\(message = \{\}\)/)
  assert.match(chat, /function attachOpenClawExecutionTimeline\(messages = \[\]\)/)
  assert.match(chat, /function recordOpenClawProgressNarrative\(text = '', stepId = ''\)/)
  assert.match(finalHandler, /isOpenClawToolUseMessage\(payload\.message \|\| payload\)/)
  assert.match(finalHandler, /recordOpenClawProgressNarrative\(extractOpenClawAssistantText\(payload\.message\)/)
  assert.match(finalHandler, /startOpenClawProgressHistoryPolling\(\)/)
  assert.match(historyRecovery, /if \(isOpenClawToolUseMessage\(msg\)\) \{[\s\S]*?recordOpenClawProgressNarrative\(msg\.text \|\| ''[\s\S]*?continue/)
  assert.match(chat, /authoritativeMessages = attachOpenClawExecutionTimeline\(authoritativeMessages\)/)
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
  assert.match(chat, /function openClawVisibleUserText\(text\) \{\s*return stripOpenClawHistoryUserTimestamp\(stripOpenClawRuntimePromptBlocks\(text\)\)/)
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
  assert.match(chat, /recordOpenClawRunStep\('analysis', '正在分析任务'/)
  assert.match(chat, /recordOpenClawRunStep\('plan', '正在规划执行步骤'/)
  assert.match(chat, /recordOpenClawRunStep\('start', '\\u5df2\\u63d0\\u4ea4\\u4efb\\u52a1\\uff0c\\u6b63\\u5728\\u8fde\\u63a5\\u6267\\u884c\\u73af\\u5883'/)
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
  assert.match(chat, /if \(_currentAiTimeline\.length > 80\) _currentAiTimeline = _currentAiTimeline\.slice\(-80\)/)
  assert.match(chat, /function startOpenClawProgressHistoryPolling\(\)/)
  assert.match(chat, /_openClawProgressHistoryTimer = setInterval\(refresh, 2500\)/)
  assert.match(chat, /const history = await wsClient\.chatHistory\(_sessionKey, 200\)/)
  assert.match(chat, /completeOpenClawCurrentDraftFromLatestHistory\(messages\)/)
  assert.match(chat, /stopOpenClawProgressHistoryPolling\(\)/)
  assert.match(chat, /collapseOpenClawRunTimeline\(_currentAiBubble\)/)
  const collapseBlock = chat.match(/function collapseOpenClawRunTimeline[\s\S]*?function ensureOpenClawRunTimelineBubble/)?.[0] || ''
  assert.match(collapseBlock, /title\.textContent = '执行过程已完成'/)
  assert.doesNotMatch(chat, /innerHTML\s*=\s*.*(?:reasoning|chain.of.thought)/i)
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
  assert.match(ocrPlugin, /TESSDATA_PREFIX/)
  assert.match(ocrPlugin, /Do not call it automatically for every attachment/)
  assert.doesNotMatch(ocrPlugin, /C:\\\\Users|C:\\/)
})

test('product workflows stay in native skills with explicit confirmation boundaries', () => {
  assert.match(ecommerceSkill, /^name: superclaw-ecommerce/m)
  assert.match(ecommerceSkill, /desktop_control/)
  assert.match(ecommerceSkill, /current browser context/i)
  assert.match(ecommerceSkill, /explicit confirmation/i)
  assert.match(financeSkill, /^name: superclaw-finance/m)
  assert.match(financeSkill, /superclaw_ocr/)
  assert.match(financeSkill, /Never transfer funds/i)
})
