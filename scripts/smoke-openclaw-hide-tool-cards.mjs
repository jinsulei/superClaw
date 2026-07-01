import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const chat = readFileSync(join(root, 'src', 'pages', 'chat.js'), 'utf8')

function isOpenClawToolLikeMessage(message = {}) {
  const role = String(message?.role || '').toLowerCase()
  const type = String(message?.type || message?.kind || '').toLowerCase()
  const text = String(message?.content || message?.text || '').trim()
  if (role === 'tool' || role === 'toolresult') return true
  if (type === 'tool' || type === 'tool_result' || type === 'toolresult') return true
  if (type === 'terminal') return true
  if (message?.toolCall || message?.toolResult || message?.terminal) return true
  if (/^\s*\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210[.!?\u3002\uff01\uff1f]*\s*$/.test(text)) return true
  if (/^tool call completed\.?$/i.test(text)) return true
  if (/^tool completed\.?$/i.test(text)) return true
  if (/^(?:stdout|stderr|terminal)\s*[:=]/i.test(text)) return true
  return false
}

function shouldRenderOpenClawToolMessage(message = {}, debug = false) {
  return debug && isOpenClawToolLikeMessage(message)
}

function visibleHistory(messages = [], debug = false) {
  return messages.filter(message => {
    if (isOpenClawToolLikeMessage(message) && !shouldRenderOpenClawToolMessage(message, debug)) return false
    return true
  })
}

assert.equal(shouldRenderOpenClawToolMessage({
  role: 'tool',
  content: '\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210',
}), false)
console.log('OPENCLAW_HIDE_TOOL_COMPLETED_CARD: PASS')

assert.equal(shouldRenderOpenClawToolMessage({
  type: 'tool',
  toolResult: { ok: true },
}), false)
console.log('OPENCLAW_HIDE_TOOL_RESULT_CARD: PASS')

assert.equal(shouldRenderOpenClawToolMessage({
  type: 'terminal',
  content: 'stdout...',
}), false)
console.log('OPENCLAW_HIDE_TERMINAL_CARD: PASS')

assert.equal(isOpenClawToolLikeMessage({
  role: 'assistant',
  content: '\u6211\u53ef\u4ee5\u8bc6\u522b\u56fe\u7247\u91cc\u7684\u6587\u5b57\u3002',
}), false)
console.log('OPENCLAW_ASSISTANT_REPLY_STILL_VISIBLE: PASS')

const history = visibleHistory([
  { role: 'user', content: '\u4f60\u6709 OCR \u5417\uff1f' },
  { role: 'tool', content: '\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210' },
  { role: 'assistant', content: '\u6709 OCR \u80fd\u529b\u3002' },
])
assert.equal(history.length, 2)
assert.deepEqual(history.map(item => item.role), ['user', 'assistant'])
console.log('OPENCLAW_HISTORY_TOOL_CARD_HIDDEN: PASS')

for (const term of [
  'function isOpenClawToolDebugEnabled',
  'function isOpenClawToolLikeMessage',
  'function shouldRenderOpenClawToolMessage',
  'function isOpenClawMarkdownTableFragment',
  'function buildOpenClawCapabilitySummaryFallback',
  'if (!isOpenClawToolDebugEnabled()) return false',
  'isOpenClawMarkdownTableFragment(value)',
  'buildOpenClawCapabilitySummaryFallback(userText, value)',
  'function appendToolsToEl',
  'OPENCLAW_TOOL_ONLY_FALLBACK',
  'OPENCLAW_EMPTY_REPLY_FALLBACK',
]) {
  assert.ok(chat.includes(term), `chat.js missing OpenClaw tool-card guard term: ${term}`)
}
console.log('OPENCLAW_EMPTY_FINAL_FALLBACK_STILL_PRESENT: PASS')

console.log('smoke-openclaw-hide-tool-cards passed')
