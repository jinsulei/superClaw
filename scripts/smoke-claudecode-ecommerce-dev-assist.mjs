import assert from 'node:assert/strict'

import {
  buildClaudeCodeEcommerceDevAssistNotice,
  classifyClaudeCodeEcommerceDevAssist,
} from '../src-tauri/resources/runtime/claude-panel/ecommerce-dev-assist.js'

const dev = classifyClaudeCodeEcommerceDevAssist('\u5e2e\u6211\u4fee\u590d\u7535\u5546 smoke \u548c package \u811a\u672c')
assert.equal(dev.matched, true)
assert.equal(dev.agent, 'claudecode')
assert.equal(dev.allowed, true)
assert.equal(dev.role, 'ecommerce_dev_assist_only')

for (const text of [
  '\u5e2e\u6211\u6253\u5f00\u6296\u5e97\u5e76\u53d1\u5e03\u5546\u54c1',
  '\u5e2e\u6211\u53bb\u7f8e\u56e2\u4ed8\u6b3e',
  '\u5e2e\u6211\u81ea\u52a8\u8bc4\u8bba\u5c0f\u7ea2\u4e66',
]) {
  const runtime = classifyClaudeCodeEcommerceDevAssist(text)
  assert.equal(runtime.allowed, false, text)
  assert.equal(runtime.reason, 'CLAUDE_CODE_ECOMMERCE_RUNTIME_BLOCKED', text)
  assert.deepEqual(runtime.routeTo, ['hermes', 'openclaw'], text)
}

const notice = buildClaudeCodeEcommerceDevAssistNotice('\u5e2e\u6211\u4fee\u590d\u7535\u5546 gateway \u4ee3\u7801')
assert.equal(notice.allowed, true)
assert.match(notice.message, /code/)
assert.doesNotMatch(JSON.stringify(notice), /MiniMax/i)

const none = classifyClaudeCodeEcommerceDevAssist('\u4f60\u662f\u8c01')
assert.equal(none.matched, false)

console.log('smoke-claudecode-ecommerce-dev-assist PASS')
