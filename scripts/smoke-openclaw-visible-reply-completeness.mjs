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
  'function hasOpenClawRenderableContent',
  'function removeCurrentOpenClawStreamBubbleIfEmpty',
  'const visibleDeltaText = sanitizeOpenClawVisibleReply(c?.text || \'\')',
  'if (!hasOpenClawRenderableContent({ visibleText: visibleDeltaText }))',
  'if (_currentAiBubble && !hasContent && removeCurrentOpenClawStreamBubbleIfEmpty())',
  'if (!hasOpenClawRenderableContent({ text, images, videos, audios, files, tools, screenshotCards, confirmations })) return',
]

for (const term of requiredTerms) {
  assert(source.includes(term), `missing OpenClaw visible reply completeness guard: ${term}`)
}

const appendAiStart = source.indexOf('function appendAiMessage')
const appendAiEnd = source.indexOf('function appendSystemMessage', appendAiStart)
const appendAiFn = source.slice(appendAiStart, appendAiEnd)

assert(appendAiStart >= 0, 'appendAiMessage function not found')
assert(
  appendAiFn.includes('text = completeOpenClawVisibleReply(text || \'\')'),
  'appendAiMessage must complete OpenClaw assistant text before rendering',
)
assert(
  appendAiFn.includes('if (!hasOpenClawRenderableContent({ text, images, videos, audios, files, tools, screenshotCards, confirmations })) return'),
  'appendAiMessage must refuse empty assistant messages without renderable attachments',
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

console.log('SMOKE_OPENCLAW_VISIBLE_REPLY_COMPLETENESS_PASS')
