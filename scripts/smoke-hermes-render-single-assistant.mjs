import assert from 'node:assert/strict'
import { HermesResponseAssembler } from '../src/engines/hermes/lib/hermes-response-assembler.js'

const assembler = new HermesResponseAssembler({ clientRequestId: 'req-1' })
let assistantText = ''
let assistantCount = 1

for (const event of [
  { event: 'message.delta', clientRequestId: 'req-1', delta: '你' },
  { event: 'message.delta', clientRequestId: 'req-1', delta: '好' },
  { event: 'message', clientRequestId: 'req-1', content: '你好，Hermes' },
  { event: 'message.final', clientRequestId: 'req-1', output: '你好，Hermes' },
  { event: 'run.completed', clientRequestId: 'req-1', output: '你好，Hermes' },
  { event: 'run.completed', clientRequestId: 'req-1', output: '你好，Hermes' },
]) {
  const accepted = assembler.accept(event)
  if (accepted?.text) assistantText += accepted.text
}

assert.equal(assistantCount, 1)
assert.equal(assistantText, '你好，Hermes')
assert.equal(assembler.completedSent, true)

console.log('PASS smoke-hermes-render-single-assistant')
