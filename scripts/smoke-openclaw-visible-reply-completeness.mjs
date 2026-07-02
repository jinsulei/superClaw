import fs from 'node:fs'
import path from 'node:path'
import {
  ensureCompleteVisibleReply,
  looksIncompleteVisibleReply,
} from '../src/shared/chat-output-guard.js'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const source = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const requiredTerms = [
  'function sanitizeOpenClawVisibleReply',
  'function completeOpenClawVisibleReply',
  'function isOpenClawExactLiteralReplyRequest',
  'function isOpenClawSafeShortLiteralReply',
  'function hasOpenClawRenderableContent',
  'function removeCurrentOpenClawStreamBubbleIfEmpty',
  'const visibleDeltaText = sanitizeOpenClawVisibleReply',
  'function isOpenClawMarkdownTableFragment',
  'function isOpenClawNumberedListFragment',
  'function isOpenClawLetteredListFragment',
  'function buildOpenClawCapabilitySummaryFallback',
  'function stripOpenClawInternalReasoningOutput',
  'function containsOpenClawInternalReasoningOutput',
  'OPENCLAW_INTERNAL_REASONING_VISIBLE_FALLBACK',
  'if (!hasOpenClawRenderableContent({ visibleText: visibleDeltaText }))',
  'if (_currentAiBubble && !hasContent && removeCurrentOpenClawStreamBubbleIfEmpty())',
  'if (!hasOpenClawRenderableContent({',
]

for (const term of requiredTerms) {
  assert(source.includes(term), `missing OpenClaw visible reply completeness guard: ${term}`)
}

const appendAiStart = source.indexOf('function appendAiMessage')
const appendAiEnd = source.indexOf('function appendSystemMessage', appendAiStart)
const appendAiFn = source.slice(appendAiStart, appendAiEnd)

assert(appendAiStart >= 0, 'appendAiMessage function not found')
assert(
  appendAiFn.includes('normalizeOpenClawVisibleAssistantText(text || \'\',') &&
    appendAiFn.includes('text = normalizedText.text ? completeOpenClawVisibleReply(normalizedText.text) : \'\''),
  'appendAiMessage must sanitize OpenClaw assistant text before rendering',
)
assert(
  appendAiFn.includes('if (!hasOpenClawRenderableContent({') &&
    appendAiFn.includes('tools: isOpenClawToolDebugEnabled() ? tools : []'),
  'appendAiMessage must refuse empty assistant messages without renderable attachments and hide tools by default',
)

const deltaStart = source.indexOf("if (state === 'delta')")
const deltaEnd = source.indexOf("if (state === 'final')", deltaStart)
const deltaBlock = source.slice(deltaStart, deltaEnd)

assert(deltaStart >= 0, 'OpenClaw delta branch not found')
assert(
  deltaBlock.indexOf('const visibleDeltaText = sanitizeOpenClawVisibleReply') <
    deltaBlock.indexOf('createStreamBubble'),
  'delta branch must sanitize visible text before creating a stream bubble',
)
assert(
  deltaBlock.includes('removeCurrentOpenClawStreamBubbleIfEmpty()'),
  'empty visible delta must remove an accidental empty stream bubble',
)

const finalStart = source.indexOf("if (state === 'final')")
const finalEnd = source.indexOf('const messagePayload', finalStart)
const finalBlock = source.slice(finalStart, finalEnd)

assert(finalStart >= 0, 'OpenClaw final branch not found')
assert(
  finalBlock.includes('hasOpenClawRenderableContent({'),
  'final branch must decide renderability before keeping an assistant bubble',
)
const completeFnStart = source.indexOf('function completeOpenClawVisibleReply')
const completeFnEnd = source.indexOf('function extractOpenClawTextPart', completeFnStart)
const completeFn = source.slice(completeFnStart, completeFnEnd)
assert(completeFnStart >= 0, 'completeOpenClawVisibleReply function not found')
assert(
  completeFn.includes('return sanitizeOpenClawVisibleReply(text)') &&
    !completeFn.includes('ensureCompleteVisibleReply') &&
    !completeFn.includes('repairIncompleteOpenClawVisibleReply'),
  'OpenClaw render path must not replace model output with local incomplete-reply fallback',
)
assert(
  finalBlock.includes("clearOpenClawGenerationState('empty-final'"),
  'empty final must close generation state without rendering a blank assistant bubble',
)

const halfTable = [
  '| 你想做的事 | 怎么拼 |',
  '| ----- | --- |',
  '|       |     |',
].join('\n')

assert(looksIncompleteVisibleReply(halfTable) === true, 'half markdown table must be detected')
const ecommerce = ensureCompleteVisibleReply(halfTable, {
  agent: 'openclaw',
  userText: '介绍你的电商功能？',
  maxChars: 760,
})
assert(/OpenClaw/.test(ecommerce), 'OpenClaw ecommerce repair keeps agent identity')
assert(/电商/.test(ecommerce), 'OpenClaw ecommerce repair mentions ecommerce')
assert(/可以协助/.test(ecommerce), 'OpenClaw ecommerce repair keeps complete capability section')
assert(!/\|/.test(ecommerce), 'OpenClaw ecommerce repair must not output markdown table pipes')
assert(!/[:：,，;；、|]$/.test(ecommerce), 'OpenClaw ecommerce repair must not end with punctuation fragment')
assert(!/raw json|tool args|tool_call/i.test(ecommerce), 'OpenClaw ecommerce repair must not leak raw tool content')

const incompleteSentence = ensureCompleteVisibleReply('可以协助：', {
  agent: 'openclaw',
  userText: '你能做什么？',
})
assert(!/[:：,，;；、|]$/.test(incompleteSentence), 'OpenClaw incomplete sentence must be repaired')

assert(source.includes('isOpenClawMarkdownTableFragment(value)'), 'OpenClaw must detect inline half markdown tables')
assert(source.includes('isOpenClawNumberedListFragment(value)'), 'OpenClaw must detect incomplete numbered list fragments')
assert(source.includes('isOpenClawLetteredListFragment(value)'), 'OpenClaw must detect incomplete lettered list fragments')
assert(source.includes('buildOpenClawCapabilitySummaryFallback(userText, value)'), 'OpenClaw retains fallback helper for explicit local replies')
assert(source.includes('当前可用：浏览器/桌面协助'), 'OpenClaw capability fallback must be a Chinese summary')
assert(source.includes('当前具备 OCR 相关能力'), 'OpenClaw OCR fallback must be a concise Chinese summary')
assert(source.includes('_currentAiText = _currentAiText || finalText'), 'OpenClaw final branch must not overwrite repaired visible text with raw final text')
assert(
  source.includes('payload?.runId || payload?.clientRequestId || payload?.idempotencyKey'),
  'OpenClaw final fingerprint must include run/request id so repeated short replies are not swallowed',
)
assert(
  !/String\(text \|\| ''\)\.trim\(\),\s*\n\s*payload\?\.message\?\.id \|\| ''/.test(source),
  'OpenClaw final fingerprint must not dedupe only by visible text plus optional message id',
)
assert(source.includes('allowEnglish: isOpenClawExactLiteralReplyRequest(_lastVisibleUserText)'), 'OpenClaw must allow exact short literal replies like "只回复 OK"')
assert(source.includes('isOpenClawSafeShortLiteralReply(text)'), 'OpenClaw must preserve safe short literal replies like OK')
assert(source.includes('const preserveShortLiteral = isOpenClawSafeShortLiteralReply(text)'), 'OpenClaw internal cleaner must detect whole-message safe short literals')
assert(source.includes('isInternalToolPlaceholderText(line, { allowShortLiteral: preserveShortLiteral })'), 'OpenClaw internal cleaner must not strip whole-message OK replies')
assert(source.includes('function isInternalToolPlaceholderText(value, options = {})'), 'OpenClaw tool placeholder filter must accept short-literal options')
assert(source.includes('options.allowShortLiteral !== true && /^\\s*(?:success|ok|completed|done)\\s*$/i.test(raw)'), 'OpenClaw tool placeholder filter must preserve OK only when explicitly allowed')
assert(source.includes('only\\s+reply') && source.includes('\\u53ea\\u9700') && source.includes('\\u56de\\u590d'), 'OpenClaw exact literal detector must cover English and Chinese literal requests')
assert(source.includes('The user is asking'), 'OpenClaw visible sanitizer must catch English user-intent reasoning leaks')
assert(source.includes("I've been running"), 'OpenClaw visible sanitizer must catch repeated-audit reasoning leaks')
assert(source.includes('Reply in Simplified Chinese'), 'OpenClaw visible sanitizer must catch leaked prompt instructions')
assert(source.includes('Use skill_manager'), 'OpenClaw visible sanitizer must catch leaked tool-audit instructions')
assert(
  source.indexOf('stripOpenClawInternalReasoningOutput(text)') <
    source.indexOf('sanitizeVisibleReplyForChinese(safeInput'),
  'OpenClaw must remove internal reasoning before Chinese visible-reply sanitization',
)

console.log('SMOKE_OPENCLAW_VISIBLE_REPLY_COMPLETENESS_PASS')
