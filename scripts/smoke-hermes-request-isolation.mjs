import assert from 'node:assert/strict'
import { HermesResponseAssembler } from '../src/engines/hermes/lib/hermes-response-assembler.js'

const active = new HermesResponseAssembler({ clientRequestId: 'req-b', runId: 'run-b' })
assert.equal(active.accept({ event: 'message.delta', clientRequestId: 'req-a', run_id: 'run-a', delta: 'OLD' }), null)
assert.equal(active.accept({ event: 'message.final', clientRequestId: 'req-a', run_id: 'run-a', output: 'OLD FINAL' }), null)
assert.equal(active.accept({ event: 'tool.completed', clientRequestId: 'req-a', run_id: 'run-a', output: 'OLD TOOL' }), null)

const accepted = active.accept({ event: 'message.delta', clientRequestId: 'req-b', run_id: 'run-b', delta: 'NEW' })
assert.equal(accepted.text, 'NEW')

console.log('PASS smoke-hermes-request-isolation')
