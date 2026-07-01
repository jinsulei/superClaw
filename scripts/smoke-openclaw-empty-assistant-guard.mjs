import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const chat = readFileSync(join(root, 'src', 'pages', 'chat.js'), 'utf8')

const OPENCLAW_EMPTY_REPLY_FALLBACK =
  'OpenClaw \u6ca1\u6709\u6536\u5230\u6709\u6548\u56de\u590d\uff0c\u8bf7\u91cd\u8bd5\u6216\u68c0\u67e5\u6a21\u578b\u914d\u7f6e\u3002'
const OPENCLAW_ASSISTANT_FAILED_PLACEHOLDER = '[assistant turn failed before producing content]'

function isOpenClawAssistantFailurePlaceholderText(text) {
  return String(text || '').trim() === OPENCLAW_ASSISTANT_FAILED_PLACEHOLDER
}

function extractOpenClawTextPart(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(item => extractOpenClawTextPart(item))
      .filter(Boolean)
      .join('\n')
  }
  if (typeof value !== 'object') return ''
  if (typeof value.text === 'string') return value.text
  if (typeof value.content === 'string') return value.content
  if (typeof value.value === 'string') return value.value
  if (typeof value.output === 'string') return value.output
  if (typeof value.output_text === 'string') return value.output_text
  if (typeof value.outputText === 'string') return value.outputText
  if (typeof value.reply === 'string') return value.reply
  if (typeof value.response === 'string') return value.response
  if (typeof value.result === 'string') return value.result
  if (typeof value.finalText === 'string') return value.finalText
  if (value.type === 'text' && typeof value.text === 'string') return value.text
  if (value.type === 'output_text' && typeof value.text === 'string') return value.text
  if (Array.isArray(value.content)) return extractOpenClawTextPart(value.content)
  if (Array.isArray(value.output)) return extractOpenClawTextPart(value.output)
  if (Array.isArray(value.result)) return extractOpenClawTextPart(value.result)
  if (Array.isArray(value.parts)) return extractOpenClawTextPart(value.parts)
  if (value.message) return extractOpenClawTextPart(value.message)
  if (value.delta) return extractOpenClawTextPart(value.delta)
  if (value.data) return extractOpenClawTextPart(value.data)
  return ''
}

function extractOpenClawAssistantText(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) return extractOpenClawTextPart(payload)

  const candidates = [
    payload.content,
    payload.text,
    payload.output_text,
    payload.outputText,
    payload.reply,
    payload.response,
    payload.result,
    payload.assistantTexts,
    payload.data?.assistantTexts,
    payload.artifacts?.assistantTexts,
    payload.data?.artifacts?.assistantTexts,
    payload.trace?.assistantTexts,
    payload.trace?.artifacts?.assistantTexts,
    payload.message?.assistantTexts,
    payload.message?.data?.assistantTexts,
    payload.message?.artifacts?.assistantTexts,
    payload.delta,
    payload.delta?.content,
    payload.delta?.text,
    payload.message,
    payload.message?.content,
    payload.message?.text,
    payload.data?.content,
    payload.data?.text,
    payload.data?.message,
    payload.data?.message?.content,
    payload.data,
    payload.event,
    payload.event?.content,
    payload.event?.text,
    payload.choices?.[0]?.message,
    payload.choices?.[0]?.message?.content,
    payload.choices?.[0]?.message?.text,
    payload.choices?.[0]?.delta,
    payload.choices?.[0]?.delta?.content,
    payload.choices?.[0]?.delta?.text,
    payload.choices?.[0]?.text,
  ]

  for (const candidate of candidates) {
    const text = extractOpenClawTextPart(candidate).trim()
    if (isOpenClawAssistantFailurePlaceholderText(text)) continue
    if (text) return text
  }
  return ''
}

function stripOpenClawInternalBlocks(text) {
  if (!text) return ''
  let next = String(text)
  next = next.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
  next = next.replace(/```tool[\s\S]*?```/gi, '')
  next = next.replace(/```terminal[\s\S]*?```/gi, '')

  const finalMarkers = [
    /(?:\u6700\u7ec8\u7b54\u590d|\u6700\u7ec8\u56de\u7b54|\u7ed9\u7528\u6237\u7684\u56de\u7b54|\u7b54\u590d)[:\uff1a]\s*([\s\S]+)$/i,
    /(?:final answer|final response)[:\uff1a]\s*([\s\S]+)$/i,
  ]
  for (const marker of finalMarkers) {
    const match = next.match(marker)
    if (match?.[1]?.trim()) {
      next = match[1].trim()
      break
    }
  }

  const internalOnlyPatterns = [
    /^\s*the user is asking me\b/i,
    /^\s*let me think\b/i,
    /^\s*i need to\b/i,
    /^\s*this is a (huge )?red flag\b/i,
    /^\s*policy analysis\b/i,
    /^\s*internal reasoning\b/i,
    /^\s*scratchpad\b/i,
  ]

  return next
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return true
      return !internalOnlyPatterns.some(pattern => pattern.test(trimmed))
    })
    .join('\n')
    .trim()
}

function normalizeOpenClawVisibleAssistantText(payload, options = {}) {
  const raw = extractOpenClawAssistantText(payload)
  const cleaned = stripOpenClawInternalBlocks(raw).trim()
  if (cleaned) {
    return {
      text: cleaned,
      usedFallback: false,
      rawWasEmpty: !raw.trim(),
    }
  }
  return {
    text: options.fallback ?? OPENCLAW_EMPTY_REPLY_FALLBACK,
    usedFallback: true,
    rawWasEmpty: !raw.trim(),
  }
}

const hello = '\u4f60\u597d'
const providerPayloads = [
  { content: hello },
  { text: hello },
  { message: { content: hello } },
  { message: { output: hello } },
  { message: { result: hello } },
  { message: { finalText: hello } },
  { delta: { content: hello } },
  { choices: [{ message: { content: hello } }] },
  { choices: [{ delta: { content: hello } }] },
  { output_text: hello },
  { content: [{ type: 'text', text: hello }] },
]

for (const payload of providerPayloads) {
  assert.equal(extractOpenClawAssistantText(payload), hello)
}
console.log('OPENCLAW_EXTRACT_TEXT_VARIANTS: PASS')

const emptyFinal = normalizeOpenClawVisibleAssistantText({ content: '' })
assert.equal(emptyFinal.text, OPENCLAW_EMPTY_REPLY_FALLBACK)
assert.equal(emptyFinal.usedFallback, true)
console.log('OPENCLAW_EMPTY_FINAL_FALLBACK: PASS')

const artifactFinal = normalizeOpenClawVisibleAssistantText({
  message: { content: [{ type: 'text', text: OPENCLAW_ASSISTANT_FAILED_PLACEHOLDER }] },
  data: { assistantTexts: ['OK'] },
})
assert.equal(artifactFinal.text, 'OK')
assert.equal(artifactFinal.usedFallback, false)
console.log('OPENCLAW_ARTIFACT_FINAL_TEXT_RECOVERY: PASS')

const placeholderOnly = normalizeOpenClawVisibleAssistantText({
  message: { content: [{ type: 'text', text: OPENCLAW_ASSISTANT_FAILED_PLACEHOLDER }] },
})
assert.equal(placeholderOnly.text, OPENCLAW_EMPTY_REPLY_FALLBACK)
assert.equal(placeholderOnly.usedFallback, true)
console.log('OPENCLAW_ASSISTANT_FAILURE_PLACEHOLDER_HIDDEN: PASS')

const internalOnly = normalizeOpenClawVisibleAssistantText('The user is asking me to inspect the page.')
assert.equal(internalOnly.text, OPENCLAW_EMPTY_REPLY_FALLBACK)
assert.equal(internalOnly.usedFallback, true)
console.log('OPENCLAW_SANITIZER_EMPTY_USES_FALLBACK: PASS')

const withToolCall = normalizeOpenClawVisibleAssistantText({
  content: `[TOOL_CALL]{"name":"x"}[/TOOL_CALL]\n\u6700\u7ec8\u7b54\u590d\uff1a${hello}`,
})
assert.equal(withToolCall.text, hello)
assert.equal(withToolCall.text.includes('TOOL_CALL'), false)
console.log('OPENCLAW_TOOLCALL_STRIPPED: PASS')

for (const term of [
  'const OPENCLAW_EMPTY_REPLY_FALLBACK',
  'const OPENCLAW_ASSISTANT_FAILED_PLACEHOLDER',
  'function extractOpenClawAssistantText',
  'function isOpenClawAssistantFailurePlaceholderText',
  'function normalizeOpenClawVisibleAssistantText',
  'payload.data?.assistantTexts',
  'payload.message?.data?.assistantTexts',
  'isOpenClawAssistantFailurePlaceholderText(text)',
  'isOpenClawAssistantFailurePlaceholderText(c?.text)',
  "normalizeOpenClawVisibleAssistantText(payload, { fallback: '' })",
  'function shouldUseOpenClawEmptyReplyFallback',
  "recoverOpenClawAssistantFromHistoryBeforeFallback('history-visible-assistant-after-empty-final'",
  "console.warn('[chat] empty final history recovery failed:'",
]) {
  assert.ok(chat.includes(term), `chat.js missing empty assistant guard term: ${term}`)
}
console.log('OPENCLAW_EMPTY_FINAL_HISTORY_RECOVERY: PASS')

console.log('smoke-openclaw-empty-assistant-guard passed')
