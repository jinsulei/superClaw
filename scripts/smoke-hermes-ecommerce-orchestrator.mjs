import assert from 'node:assert/strict'

import {
  buildHermesEcommerceOrchestrationPlan,
  classifyHermesEcommerceOrchestration,
} from '../src/engines/hermes/lib/hermes-ecommerce-orchestrator.js'

const runtime = classifyHermesEcommerceOrchestration('\u5e2e\u6211\u5f00\u59cb\u7535\u5546\u6d41\u7a0b\uff0c\u8bfb\u53d6\u6296\u5e97\u9875\u9762')
assert.equal(runtime.matched, true)
assert.equal(runtime.source, 'hermes')
assert.equal(runtime.executor, 'openclaw')
assert.equal(runtime.reviewer, 'hermes')
assert.notEqual(runtime.claudeCodeRole, 'runtime_executor')

const dev = classifyHermesEcommerceOrchestration('\u5e2e\u6211\u4fee\u590d\u7535\u5546 smoke \u548c build \u811a\u672c')
assert.equal(dev.matched, true)
assert.equal(dev.claudeCodeRole, 'dev_assist_only')

const risky = classifyHermesEcommerceOrchestration('\u5e2e\u6211\u5f00\u59cb\u7535\u5546\u6d41\u7a0b\u5e76\u76f4\u63a5\u4ed8\u6b3e')
assert.equal(risky.matched, true)
assert.equal(risky.requiresConfirmation, true)

const plan = buildHermesEcommerceOrchestrationPlan('\u5e2e\u6211\u5f00\u59cb\u7535\u5546\u6d41\u7a0b')
assert.equal(plan.source, 'hermes')
assert.equal(plan.executor, 'openclaw')
assert.equal(plan.reviewer, 'hermes')
assert.ok(plan.steps.some((step) => /OpenClaw/.test(step)))

const none = classifyHermesEcommerceOrchestration('\u4ec0\u4e48\u662f requestId')
assert.equal(none.matched, false)

console.log('smoke-hermes-ecommerce-orchestrator PASS')
