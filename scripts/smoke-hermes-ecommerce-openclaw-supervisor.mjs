import assert from 'node:assert/strict'

import {
  buildHermesOpenClawInstruction,
  createHermesOpenClawSupervisionTask,
  summarizeHermesOpenClawStatus,
} from '../src/engines/hermes/lib/hermes-openclaw-supervisor.js'

const instruction = buildHermesOpenClawInstruction({
  goal: '\u8bfb\u53d6\u6296\u5e97\u5546\u54c1\u9875\u9762\u5e76\u6574\u7406\u8981\u70b9',
})
assert.equal(instruction.supervisor, 'hermes')
assert.equal(instruction.executor, 'openclaw')
assert.equal(instruction.allowed, true)
assert.match(instruction.instruction, /OpenClaw/)

const risky = createHermesOpenClawSupervisionTask('\u76f4\u63a5\u4ed8\u6b3e\u5e76\u63d0\u4ea4\u8ba2\u5355')
assert.equal(risky.allowed, false)
assert.equal(risky.noFakeExecution, true)

const status = summarizeHermesOpenClawStatus([
  { type: 'started' },
  { type: 'completed', status: 'completed' },
])
assert.equal(status.status, 'completed')
assert.equal(status.eventCount, 2)

console.log('smoke-hermes-openclaw-supervisor PASS')

