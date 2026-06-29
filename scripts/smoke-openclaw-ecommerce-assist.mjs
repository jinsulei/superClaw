import assert from 'node:assert/strict'

import {
  buildOpenClawEcommerceVisibleReply,
  buildOpenClawEcommerceAssistPlan,
  classifyOpenClawEcommerceRequest,
  guardOpenClawEcommerceAction,
  OPENCLAW_ECOMMERCE_CAPABILITY,
} from '../src/engines/openclaw/lib/openclaw-ecommerce-assist.js'

assert.equal(OPENCLAW_ECOMMERCE_CAPABILITY.agent, 'openclaw')
assert.equal(OPENCLAW_ECOMMERCE_CAPABILITY.role, 'runtime_executor')

const safe = classifyOpenClawEcommerceRequest('\u5e2e\u6211\u8bfb\u53d6\u6296\u5e97\u9875\u9762\u5e76\u622a\u56fe')
assert.equal(safe.matched, true)
assert.equal(safe.agent, 'openclaw')
assert.equal(safe.blocked, false)

const plan = buildOpenClawEcommerceAssistPlan('\u5e2e\u6211\u6293\u53d6\u6dd8\u5b9d\u5546\u54c1\u4ef7\u683c')
assert.equal(plan.executor, 'openclaw')
assert.equal(plan.blocked, false)
assert.ok(plan.steps.length >= 3)

const visible = buildOpenClawEcommerceVisibleReply('\u4ecb\u7ecd\u4f60\u7684\u7535\u5546\u529f\u80fd')
assert.match(visible, /OpenClaw/)
assert.match(visible, /\u7535\u5546/)
assert.match(visible, /\u4ed8\u6b3e/)
assert.ok(!visible.includes('tool_call'))

for (const text of [
  '\u5e2e\u6211\u76f4\u63a5\u4ed8\u6b3e',
  '\u5e2e\u6211\u81ea\u52a8\u53d1\u5e03\u5546\u54c1',
  '\u5e2e\u6211\u63d0\u4ea4\u8ba2\u5355',
  '\u5e2e\u6211\u81ea\u52a8\u8bc4\u8bba\u5c0f\u7ea2\u4e66',
]) {
  const blocked = guardOpenClawEcommerceAction(text)
  assert.equal(blocked.allowed, false, text)
  assert.equal(blocked.requiresConfirmation, true, text)
}

const none = classifyOpenClawEcommerceRequest('\u89e3\u91ca requestId')
assert.equal(none.matched, false)

console.log('smoke-openclaw-ecommerce-assist PASS')
