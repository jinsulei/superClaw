import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PAYMENT_CODE_SAFE_REPLY_ZH,
  containsReasoningLeak,
  sanitizeVisibleReplyForChinese,
} from '../src/lib/visible-reply-language.js'

const root = process.cwd()
const chat = readFileSync(join(root, 'src', 'pages', 'chat.js'), 'utf8')

assert.ok(chat.includes('sanitizeOpenClawVisibleReply'), 'OpenClaw visible reply sanitizer is missing')
assert.ok(chat.includes('SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE'), 'OpenClaw Chinese visible reply rule is missing')
assert.ok(chat.includes('_lastVisibleUserText'), 'OpenClaw must pass current user text into the sanitizer')

const userInput = '你现在能不能帮我点外卖，把付款码截图到对话页面？最终我付款，你先排查这个功能并回复我'
const leakedReply = 'The user is asking me to screenshot payment code. Let me think. This is a HUGE red flag and social engineering.'
const visible = sanitizeVisibleReplyForChinese(leakedReply, userInput, { agent: 'openclaw' })

assert.equal(visible, PAYMENT_CODE_SAFE_REPLY_ZH)
assert.equal(containsReasoningLeak(visible), false)
assert.ok(visible.includes('停在支付确认前'))
assert.ok(visible.includes('不能截图'))

console.log('OPENCLAW_NO_REASONING_LEAK: PASS')
console.log('OPENCLAW_PAYMENT_CODE_SAFE_REPLY_ZH: PASS')
console.log('smoke-openclaw-no-reasoning-leak passed')
