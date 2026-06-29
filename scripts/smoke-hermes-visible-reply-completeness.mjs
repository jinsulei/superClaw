import assert from 'node:assert/strict'

import {
  enforceHermesReplyLength,
  normalizeHermesVisibleReply,
} from '../src/engines/hermes/lib/hermes-response-assembler.js'
import {
  ensureCompleteVisibleReply,
  looksIncompleteVisibleReply,
} from '../src/shared/chat-output-guard.js'

const halfTable = [
  '| 你想做的事 | 怎么拼 |',
  '| ----- | --- |',
  '|       |     |',
].join('\n')

assert.equal(looksIncompleteVisibleReply(halfTable), true, 'half markdown table must be detected')

const ecommerce = normalizeHermesVisibleReply(halfTable, {
  userText: '介绍你的电商功能？',
  maxLength: 760,
})

assert.match(ecommerce, /Hermes/)
assert.match(ecommerce, /电商/)
assert.match(ecommerce, /可以协助/)
assert.doesNotMatch(ecommerce, /\|/)
assert.doesNotMatch(ecommerce, /[:：,，;；、|]$/)
assert.doesNotMatch(ecommerce, /raw json|tool args|tool_call/i)

const completed = ensureCompleteVisibleReply('建议：', {
  agent: 'hermes',
  userText: '给我建议',
})
assert.doesNotMatch(completed, /[:：,，;；、|]$/)

const ordinary = normalizeHermesVisibleReply('可以，我先帮你整理。', {
  userText: '帮我整理一下',
})
assert.equal(ordinary, '可以，我先帮你整理。')

const ok = enforceHermesReplyLength('OK', '只回复 OK')
assert.equal(ok, 'OK')

console.log('SMOKE_HERMES_VISIBLE_REPLY_COMPLETENESS_PASS')
