import assert from 'node:assert/strict'
import {
  formatHermesToolSummaryForUser,
  getHermesAssistantMessageId,
  HermesResponseAssembler,
  normalizeHermesVisibleReply,
  splitHermesVisibleAndDetails,
  upsertHermesAssistantMessage,
} from '../src/engines/hermes/lib/hermes-response-assembler.js'

function collectText(events) {
  const assembler = new HermesResponseAssembler({ clientRequestId: 'req-render' })
  let text = ''
  let completedCount = 0
  for (const event of events) {
    const accepted = assembler.accept({ clientRequestId: 'req-render', ...event })
    if (!accepted) continue
    if (accepted.type === 'completed') completedCount += 1
    if (accepted.text) text += accepted.text
  }
  return { text, completedCount, assembler }
}

const snapshot = collectText([
  { event: 'message', content: '\u4f60\u597d' },
  { event: 'message', content: '\u4f60\u597d\uff0cHermes' },
  { event: 'message.final', output: '\u4f60\u597d\uff0cHermes' },
  { event: 'run.completed', output: '\u4f60\u597d\uff0cHermes' },
  { event: 'run.completed', output: '\u4f60\u597d\uff0cHermes' },
])

assert.equal(snapshot.text, '\u4f60\u597d\uff0cHermes')
assert.equal(snapshot.completedCount, 1)
assert.equal(snapshot.assembler.completedSent, true)

const delta = collectText([
  { event: 'message.delta', delta: '\u4f60' },
  { event: 'message.delta', delta: '\u597d' },
  { event: 'message.final', output: '\u4f60\u597d' },
  { event: 'run.completed', output: '\u4f60\u597d' },
])

assert.equal(delta.text, '\u4f60\u597d')

const messages = []
upsertHermesAssistantMessage(messages, {
  id: getHermesAssistantMessageId('req-render'),
  clientRequestId: 'req-render',
  content: '\u7b2c\u4e00\u6b21',
})
upsertHermesAssistantMessage(messages, {
  clientRequestId: 'req-render',
  content: '\u7b2c\u4e8c\u6b21',
})

assert.equal(messages.length, 1)
assert.equal(messages[0].content, '\u7b2c\u4e8c\u6b21')
assert.equal(messages[0].id, getHermesAssistantMessageId('req-render'))

const rawTool = [
  'Tool tool success',
  '{"tool_call":"exec","arguments":{"cmd":"dir"},"result":"secret raw output"}',
  '\u5df2\u5b8c\u6210\u68c0\u67e5\u3002',
].join('\n')

const visible = normalizeHermesVisibleReply(rawTool)
assert.match(visible, /\u5df2\u5b8c\u6210\u68c0\u67e5/)
assert.doesNotMatch(visible, /Tool tool/i)
assert.doesNotMatch(visible, /tool_call|arguments|secret raw output/i)

const imageVisible = normalizeHermesVisibleReply([
  'MEDIA:C:\\tmp\\output.png',
  'image_prompt: very long hidden prompt',
].join('\n'), { imageTask: true })
assert.match(imageVisible, /^MEDIA:/)
assert.doesNotMatch(imageVisible, /image_prompt|hidden prompt/i)

const summary = formatHermesToolSummaryForUser({
  userText: '\u68c0\u67e5\u8fdb\u7a0b',
  toolEvents: [{ name: 'exec', status: 'done', result: '{"pid":123}' }],
})
assert.match(summary, /\u5de5\u5177\u7ed3\u679c/)
assert.doesNotMatch(summary, /\{"pid"/)

const split = splitHermesVisibleAndDetails('\u53ef\u89c1\u6b63\u6587', [{ name: 'exec', result: 'ok' }])
assert.equal(split.visible, '\u53ef\u89c1\u6b63\u6587')
assert.equal(split.details.length, 1)

console.log('PASS smoke-hermes-render-no-double')
