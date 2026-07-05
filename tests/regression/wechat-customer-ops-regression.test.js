import test from 'node:test'
import assert from 'node:assert/strict'

import * as ecommerceSafety from '../../src/shared/ecommerce/safety-policy.js'
import {
  allowedWechatActionFixtures,
  customerAnalysisFixture,
  highRiskWechatActionFixtures,
  noParallelWechatContract,
  questionLibraryFixture,
  replyDraftFixture,
  replyLibraryFixture,
  sensitiveWechatPayloadFixture,
  wechatCustomerMessageFixture,
  wechatOpsForbiddenPaths,
} from './fixtures/wechat-customer-ops.fixture.js'

const SENSITIVE_VALUES = Object.values(sensitiveWechatPayloadFixture)

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value)
  for (const sensitive of SENSITIVE_VALUES) {
    assert.equal(serialized.includes(sensitive), false, `${sensitive} must be redacted`)
  }
}

function assertNoForbiddenPath(value) {
  const serialized = JSON.stringify(value)
  for (const forbiddenPath of wechatOpsForbiddenPaths) {
    assert.equal(serialized.includes(forbiddenPath), false, `fixture must not reference ${forbiddenPath}`)
  }
}

function loadWechatNormalizer() {
  const normalizer = ecommerceSafety.normalizeWeChatCustomerMessage
    || ecommerceSafety.normalizeWechatCustomerMessage
    || ecommerceSafety.mapOcrTextToWechatCustomerMessage
  assert.equal(
    typeof normalizer,
    'function',
    'Expected gap: WeChat Customer Ops needs a normalizer for OCR text to customer message',
  )
  return normalizer
}

function loadWechatRedactor() {
  const redactor = ecommerceSafety.redactWeChatCustomerPayload
    || ecommerceSafety.redactWechatCustomerPayload
  assert.equal(
    typeof redactor,
    'function',
    'Expected gap: WeChat Customer Ops needs a redactor for phone/address/order/wechat id and credentials',
  )
  return redactor
}

function loadWechatResultNormalizer() {
  const normalizer = ecommerceSafety.normalizeWeChatCustomerOpsResult
    || ecommerceSafety.normalizeWechatCustomerOpsResult
  assert.equal(
    typeof normalizer,
    'function',
    'Expected gap: WeChat Customer Ops needs an output normalizer with task_events and tool_runs',
  )
  return normalizer
}

test('OCR text can be normalized into a WeChat customer message contract', () => {
  const normalizer = loadWechatNormalizer()
  const message = normalizer(wechatCustomerMessageFixture)

  for (const field of ['task_id', 'channel', 'customer_id', 'source', 'visible_text', 'customer_state']) {
    assert.ok(Object.hasOwn(message, field), `normalized customer message must include ${field}`)
  }
  assert.equal(message.channel, 'wechat')
  assert.equal(typeof message.visible_text, 'string')
  assertNoSensitiveValues(message)
})

test('read, OCR, classify, reply draft, customer tags, and follow-up are allowed L1 workflows', () => {
  for (const action of allowedWechatActionFixtures) {
    const result = ecommerceSafety.classifyEcommerceActionGuard(action)
    assert.ok(result && typeof result === 'object')
    assert.notEqual(result.blocked, true, `${action.action_type} should not be blocked`)
    assert.notEqual(result.allowed, false, `${action.action_type} should enter a safe workflow`)
    assert.equal(result.permission_level, 'L1')
  }
})

test('send_wechat_message and send_private_message must be blocked or require confirmation', () => {
  for (const action of highRiskWechatActionFixtures) {
    const result = ecommerceSafety.classifyEcommerceActionGuard(action)
    assert.ok(result.blocked === true || result.requires_confirmation === true)
    assert.notEqual(result.allowed, true, `${action.action_type} must not auto-send`)
    assert.equal(result.required_permission_level, 'L2')
  }
})

test('L1 cannot auto-send and L2 still cannot bypass Action Guard', () => {
  const l1 = ecommerceSafety.classifyEcommerceActionGuard({
    action_type: 'send_wechat_message',
    permission_level: 'L1',
    risk_level: 'high',
    text: 'send WeChat message now',
  })
  assert.notEqual(l1.allowed, true)
  assert.ok(l1.blocked || l1.requires_confirmation)

  const l2 = ecommerceSafety.classifyEcommerceActionGuard({
    action_type: 'send_wechat_message',
    permission_level: 'L2',
    risk_level: 'high',
    text: 'send WeChat message now',
  })
  assert.notEqual(l2.allowed, true, 'L2 must not bypass Action Guard for sending')
  assert.ok(l2.blocked || l2.requires_confirmation)
})

test('reply output is draft-only and must never auto-send', () => {
  assert.equal(replyDraftFixture.status, 'draft')
  assert.equal(replyDraftFixture.auto_send, false)
  assert.equal(replyDraftFixture.requires_confirmation, true)
  assert.equal(/sent|delivered|execution_success/i.test(JSON.stringify(replyDraftFixture)), false)
})

test('question library schema contract is explicit', () => {
  for (const item of questionLibraryFixture) {
    for (const field of ['question_id', 'category', 'matchers', 'answer_refs', 'risk_level']) {
      assert.ok(Object.hasOwn(item, field), `question library item must include ${field}`)
    }
    assert.ok(Array.isArray(item.matchers))
    assert.ok(Array.isArray(item.answer_refs))
  }
})

test('reply library schema contract is explicit and review-gated', () => {
  for (const item of replyLibraryFixture) {
    for (const field of ['reply_id', 'category', 'template', 'allowed_channels', 'forbidden_phrases', 'requires_review']) {
      assert.ok(Object.hasOwn(item, field), `reply library item must include ${field}`)
    }
    assert.ok(item.allowed_channels.includes('wechat'))
    assert.equal(item.requires_review, true)
  }
})

test('customer analysis schema includes intent, tags, risk, follow_up, and customer_state', () => {
  for (const field of ['intent', 'tags', 'risk', 'follow_up', 'customer_state']) {
    assert.ok(Object.hasOwn(customerAnalysisFixture, field), `customer analysis must include ${field}`)
  }
  assert.ok(Array.isArray(customerAnalysisFixture.tags))
  assert.ok(customerAnalysisFixture.customer_state && typeof customerAnalysisFixture.customer_state === 'object')
})

test('WeChat Customer Ops redacts phone, address, order id, WeChat id, and credentials', () => {
  const redactor = loadWechatRedactor()
  const redacted = redactor({
    ...wechatCustomerMessageFixture,
    raw_payload: sensitiveWechatPayloadFixture,
    visible_text: JSON.stringify(sensitiveWechatPayloadFixture),
  })
  assertNoSensitiveValues(redacted)
})

test('WeChat Customer Ops output includes task_events and tool_runs attachment points', () => {
  const normalizer = loadWechatResultNormalizer()
  const result = normalizer({
    task_id: wechatCustomerMessageFixture.task_id,
    action_type: 'generate_reply_draft',
    status: 'draft',
    visible_text: replyDraftFixture.reply_text,
    raw_payload: sensitiveWechatPayloadFixture,
  })

  assert.ok(Array.isArray(result.task_events), 'WeChat Customer Ops result must include task_events')
  assert.ok(Array.isArray(result.tool_runs), 'WeChat Customer Ops result must include tool_runs')
  assertNoSensitiveValues(result)
})

test('no_parallel_impl and safety constraints are explicit for WeChat Customer Ops regression work', () => {
  const scope = noParallelWechatContract.join('\n')
  assert.match(scope, /do not create a second WeChat runner/)
  assert.match(scope, /do not rewrite OpenClaw UI/)
  assert.match(scope, /do not rewrite chat\.js/)
  assert.match(scope, /do not split scripts-dev-api\.js/)
  assert.match(scope, /do not auto-send WeChat messages/)
  assert.match(scope, /OCR and ecommerce Action Guard/)

  const fixtureText = JSON.stringify({
    allowedWechatActionFixtures,
    highRiskWechatActionFixtures,
    replyDraftFixture,
    questionLibraryFixture,
    replyLibraryFixture,
    customerAnalysisFixture,
  })

  assertNoForbiddenPath(fixtureText)
  assert.equal(/real agent completed|fake runtime success|sent successfully/i.test(fixtureText), false)
})
