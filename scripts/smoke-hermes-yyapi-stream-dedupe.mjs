import assert from 'node:assert/strict'
import {
  createHermesStreamDedupeState,
  emitHermesStreamDelta,
  finalizeHermesStreamDedupe,
  finalizeHermesStreamMessage,
} from './dev-api.js'

function collect(events) {
  const state = createHermesStreamDedupeState()
  let text = ''
  for (const item of events) {
    text += emitHermesStreamDelta(state, item.text, { mode: item.mode || 'delta' })
  }
  return { text, state }
}

{
  const { text } = collect(['你', '好', '，', 'Hermes'].map(text => ({ text })))
  assert.equal(text, '你好，Hermes')
}

{
  const { text } = collect([
    { text: '你好', mode: 'snapshot' },
    { text: '你好，Hermes', mode: 'snapshot' },
    { text: '你好，Hermes，可以帮你', mode: 'snapshot' },
  ])
  assert.equal(text, '你好，Hermes，可以帮你')
  assert.ok(!text.includes('你好你好'))
}

{
  const state = createHermesStreamDedupeState()
  let text = ''
  text += emitHermesStreamDelta(state, '你好，Hermes')
  const final = finalizeHermesStreamMessage(state, '你好，Hermes')
  text += final.delta
  assert.equal(text, '你好，Hermes')
  assert.equal(final.final, true)
  assert.equal(finalizeHermesStreamMessage(state, '你好，Hermes').final, false)
}

{
  const state = createHermesStreamDedupeState()
  let text = ''
  text += emitHermesStreamDelta(state, '你好，Hermes')
  const done1 = finalizeHermesStreamDedupe(state, '你好，Hermes')
  const done2 = finalizeHermesStreamDedupe(state, '你好，Hermes')
  text += done1.delta + done2.delta
  assert.equal(text, '你好，Hermes')
  assert.equal(done1.terminal, true)
  assert.equal(done2.terminal, false)
}

console.log('PASS smoke-hermes-yyapi-stream-dedupe')
