import assert from 'node:assert/strict'

import {
  buildClaudeCodeEcommerceCodeAssistPlan,
  classifyClaudeCodeEcommerceCodeAssist,
} from '../src-tauri/resources/runtime/claude-panel/ecommerce-code-assist.js'

const code = classifyClaudeCodeEcommerceCodeAssist('\u4fee\u590d\u7535\u5546 smoke \u548c gateway \u4ee3\u7801')
assert.equal(code.matched, true)
assert.equal(code.allowed, true)
assert.equal(code.nativeRequired, true)
assert.equal(code.relayFallbackAllowed, false)
assert.equal(code.stderrLogOnly, true)

const runtime = classifyClaudeCodeEcommerceCodeAssist('\u6253\u5f00\u6296\u5e97\u5e76\u76f4\u63a5\u53d1\u5e03\u5546\u54c1')
assert.equal(runtime.allowed, false)
assert.deepEqual(runtime.routeTo, ['hermes', 'openclaw'])

const plan = buildClaudeCodeEcommerceCodeAssistPlan('\u8bf7\u68c0\u67e5\u7535\u5546 build script')
assert.ok(plan.recommendedSmokes.includes('scripts/smoke-three-agent-ecommerce-capabilities.mjs'))

console.log('smoke-claudecode-ecommerce-code-assist PASS')

