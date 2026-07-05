import test from 'node:test'
import assert from 'node:assert/strict'

import {
  confirmationFixture,
  ecommerceOpsForbiddenPaths,
  fakeSensitiveEcommerceFixture,
  forbiddenActionFixture,
  highRiskActionFixtures,
  lowRiskActionFixtures,
  stage3PublishFixture,
  stage4ListingFixture,
  stage56LiveReplyFixture,
} from './fixtures/ecommerce-ops.fixture.js'

import {
  ECOMMERCE_SAFETY_ACTION,
  classifyEcommerceSafety,
} from '../../src/shared/ecommerce/safety-policy.js'
import { ECOMMERCE_EXECUTION_STATUS } from '../../src/shared/ecommerce/execution-types.js'
import { guardStage1Action } from '../../src/shared/ecommerce-stage1/risk-guard.js'
import { Stage1ActionType } from '../../src/shared/ecommerce-stage1/types.js'
import {
  Stage3ActionType,
  createPlatformConfirmationCard,
} from '../../src/shared/ecommerce-stage3/types.js'
import {
  Stage4ActionType,
  createPriceInventoryConfirmationCard,
  createSubmitReviewConfirmationCard,
} from '../../src/shared/ecommerce-stage4/types.js'
import { generateLiveReplies } from '../../src/shared/ecommerce-stage56/live-comment-assist.js'
import {
  Stage56ActionType,
  createLiveReplyConfirmationCard,
} from '../../src/shared/ecommerce-stage56/types.js'
import * as ecommerceSafety from '../../src/shared/ecommerce/safety-policy.js'

const NO_PARALLEL_IMPL_CONTRACT = [
  'only patch_existing / wrap_existing is allowed',
  'do not create a second ecommerce runner',
  'do not bypass src/shared/ecommerce-stage*',
  'do not bypass existing risk-guard',
  'do not bypass confirmation',
  'do not bypass Action Guard',
  'do not directly rewrite chat.js main flow',
  'do not modify scripts-dev-api.js',
  'do not read runtime/data/secrets',
]

const HIGH_RISK_STAGE1_ACTION_MAP = Object.freeze({
  send_live_comment: Stage1ActionType.SEND_LIVE_REPLY,
  send_wechat_message: Stage1ActionType.SEND_PRIVATE_MESSAGE,
  publish_video: Stage1ActionType.PUBLISH_CONTENT,
  schedule_publish: Stage1ActionType.PUBLISH_CONTENT,
  product_listing_submit: Stage1ActionType.LIST_PRODUCT,
  product_delist: Stage1ActionType.DELIST_PRODUCT,
  change_product_price: Stage1ActionType.CHANGE_PRICE,
  change_inventory: Stage1ActionType.CHANGE_INVENTORY,
  create_ad_plan: 'create_ad_plan',
  increase_ad_budget: 'increase_ad_budget',
  pause_ad_plan: 'pause_ad_plan',
  payment: Stage1ActionType.PAY,
  submit_order: Stage1ActionType.SUBMIT_ORDER,
})

const SENSITIVE_VALUES = Object.values(fakeSensitiveEcommerceFixture)

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value)
  for (const sensitive of SENSITIVE_VALUES) {
    assert.equal(serialized.includes(sensitive), false, `${sensitive} must be redacted`)
  }
}

function classifyWithCurrentOrFutureGuard(action) {
  const guard = ecommerceSafety.classifyEcommerceActionGuard
  assert.equal(
    typeof guard,
    'function',
    'Expected gap: global classifyEcommerceActionGuard must be exported before E-Commerce Ops can rely on a unified Action Guard',
  )
  return guard(action)
}

function assertHighRiskGuardResult(result, action) {
  assert.ok(result && typeof result === 'object', `${action.action_type} must return a guard result`)
  assert.notEqual(result.allowed, true, `${action.action_type} must not auto-execute`)
  assert.ok(
    result.blocked === true || result.requires_confirmation === true || result.action === ECOMMERCE_SAFETY_ACTION.USER_CONFIRM_REQUIRED,
    `${action.action_type} must be blocked or require confirmation`,
  )
}

function assertSafeWorkflowResult(result, action) {
  assert.ok(result && typeof result === 'object', `${action.action_type} must return a safety result`)
  assert.notEqual(result.allowed, false, `${action.action_type} should be allowed into a safe workflow`)
  assert.notEqual(result.action, ECOMMERCE_SAFETY_ACTION.BLOCKED, `${action.action_type} should not be blocked`)
}

test('high-risk ecommerce actions require global Action Guard or confirmation before execution', () => {
  for (const action of highRiskActionFixtures) {
    const result = classifyWithCurrentOrFutureGuard(action)
    assertHighRiskGuardResult(result, action)
    assertNoSensitiveValues(result)
  }
})

test('existing Stage1 risk guard blocks known high-risk ecommerce actions', () => {
  for (const action of highRiskActionFixtures) {
    const mappedType = HIGH_RISK_STAGE1_ACTION_MAP[action.action_type]
    if (!Object.values(Stage1ActionType).includes(mappedType)) continue

    const result = guardStage1Action({
      type: mappedType,
      label: action.label,
      permission_level: action.permission_level,
      risk_level: action.risk_level,
    })

    assert.equal(result.allowed, false, `${action.action_type} must not be allowed by Stage1 guard`)
    assert.equal(result.risk, 'high')
    assert.ok(result.confirmation, `${action.action_type} must provide confirmation payload`)
  }
})

test('low-risk ecommerce actions are allowed into read, analysis, or draft workflows', () => {
  for (const action of lowRiskActionFixtures) {
    const result = classifyEcommerceSafety(action.text, { strict: false })
    assertSafeWorkflowResult(result, action)
    assert.ok(
      [ECOMMERCE_SAFETY_ACTION.READ_ONLY, ECOMMERCE_SAFETY_ACTION.DRAFT_ONLY].includes(result.action),
      `${action.action_type} must stay read-only or draft-only`,
    )
  }
})

test('L1 / L2 permission rules are explicit and L2 does not bypass high-risk guard', () => {
  assert.equal(confirmationFixture.requires_confirmation, true)
  assert.equal(confirmationFixture.permission_level, 'L1')
  assert.equal(confirmationFixture.risk_level, 'high')
  assert.equal(forbiddenActionFixture.blocked, true)

  for (const action of highRiskActionFixtures) {
    assert.equal(action.permission_level, 'L2', `${action.action_type} fixture exercises L2 boundary`)
    const result = classifyWithCurrentOrFutureGuard({ ...action, permission_level: 'L2' })
    assertHighRiskGuardResult(result, action)
  }
})

test('Stage3 content publishing is prepare-only and must not directly publish', () => {
  assert.ok(stage3PublishFixture.safePrepareText)
  assert.ok(stage3PublishFixture.unsafePublishText)
  const finalActions = new Set([
    Stage3ActionType.CLICK_PUBLISH,
    Stage3ActionType.PUBLISH_CONTENT,
    Stage3ActionType.SUBMIT_LISTING,
    Stage3ActionType.LIST_PRODUCT,
    Stage3ActionType.SUBMIT_REVIEW,
  ])
  const safePrepActions = [
    Stage3ActionType.CREATE_PREP_CARD,
    Stage3ActionType.CREATE_CONFIRMATION_CARD,
    Stage3ActionType.STOP_BEFORE_FINAL_SUBMIT,
  ]
  const card = createPlatformConfirmationCard({
    platform: 'douyin',
    platformLabel: 'Douyin fixture',
    platformKind: 'content',
    action: {
      type: Stage3ActionType.PUBLISH_CONTENT,
      label: 'Final publish requires human confirmation',
    },
  })

  for (const action of safePrepActions) {
    assert.equal(finalActions.has(action), false, `${action} must remain a preparation/confirmation step`)
  }
  assert.equal(finalActions.has(card.action.type), true, 'confirmation card points at a final action')
  assert.equal(card.type, 'platform_confirmation_card')
})

test('Stage4 product listing is prepare-only and must stop before submit review', () => {
  assert.ok(stage4ListingFixture.safePrepareText)
  assert.ok(stage4ListingFixture.unsafeSubmitText)
  const finalActions = new Set([
    Stage4ActionType.SUBMIT_REVIEW,
    Stage4ActionType.PUBLISH_PRODUCT,
    Stage4ActionType.LIST_PRODUCT,
    Stage4ActionType.CHANGE_PRICE,
    Stage4ActionType.CHANGE_INVENTORY,
  ])
  const priceInventoryCard = createPriceInventoryConfirmationCard({
    productTitle: 'fixture product',
    price: '19.90',
    inventory: '100',
    action: {
      type: Stage4ActionType.FILL_PRICE_INVENTORY_AFTER_CONFIRMATION,
      label: 'Fill price and inventory after confirmation',
    },
  })
  const submitCard = createSubmitReviewConfirmationCard({
    productTitle: 'fixture product',
    action: {
      type: Stage4ActionType.SUBMIT_REVIEW,
      label: 'Final submit review requires human confirmation',
    },
  })

  assert.equal(finalActions.has(Stage4ActionType.STOP_BEFORE_SUBMIT_REVIEW), false)
  assert.equal(priceInventoryCard.type, 'price_inventory_confirmation_card')
  assert.equal(submitCard.type, 'submit_review_confirmation_card')
  assert.equal(finalActions.has(submitCard.action.type), true)
})

test('Stage56 live reply only generates draft replies and must not directly send', () => {
  const replies = generateLiveReplies([
    {
      id: 'comment_fixture_1',
      text: stage56LiveReplyFixture.commentText,
      questionType: 'general',
    },
  ], stage56LiveReplyFixture.productInfo)

  assert.ok(replies.length >= 1)
  assert.equal(replies[0].requiresUserConfirm, true)
  assert.equal(typeof replies[0].reply, 'string')
  assert.ok(stage56LiveReplyFixture.unsafeSendText)

  const confirmCard = createLiveReplyConfirmationCard({
    platform: 'douyin',
    comment: replies[0].comment,
    reply: replies[0].reply,
    questionType: replies[0].questionType,
    action: {
      type: Stage56ActionType.SEND_LIVE_REPLY,
      label: 'Send live reply requires human confirmation',
    },
  })

  assert.equal(confirmCard.type, 'live_reply_confirmation_card')
  assert.equal(confirmCard.action.type, Stage56ActionType.SEND_LIVE_REPLY)
})

test('E-Commerce Ops output contract requires task_events and tool_runs attachment points', () => {
  const normalizer = ecommerceSafety.normalizeEcommerceOpsResult
  assert.equal(
    typeof normalizer,
    'function',
    'Expected gap: normalizeEcommerceOpsResult must be exported before ecommerce stage outputs can attach task_events/tool_runs consistently',
  )

  const result = normalizer({
    action_type: 'prepare_publish_draft',
    status: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    visible_text: 'Prepared a fixture draft.',
    raw_payload: fakeSensitiveEcommerceFixture,
  })

  assert.ok(Array.isArray(result.task_events), 'ecommerce result must include task_events')
  assert.ok(Array.isArray(result.tool_runs), 'ecommerce result must include tool_runs')
  assertNoSensitiveValues(result)
})

test('sensitive ecommerce payload values are never exposed by guard-visible fields', () => {
  const redactor = ecommerceSafety.redactEcommerceGuardPayload
  assert.equal(
    typeof redactor,
    'function',
    'Expected gap: redactEcommerceGuardPayload must be exported before ecommerce guard results can safely carry raw payloads',
  )

  const redacted = redactor({
    action_type: 'publish_video',
    reason: 'fixture guard reason',
    message: 'fixture visible message',
    visible_text: 'fixture visible text',
    raw_payload: fakeSensitiveEcommerceFixture,
    task_events: [{ raw_payload: fakeSensitiveEcommerceFixture }],
    tool_runs: [{ input_summary: fakeSensitiveEcommerceFixture }],
  })

  assertNoSensitiveValues(redacted)
})

test('no_parallel_impl and safety constraints are explicit for E-Commerce Ops regression work', () => {
  const scope = NO_PARALLEL_IMPL_CONTRACT.join('\n')
  assert.match(scope, /patch_existing \/ wrap_existing/)
  assert.match(scope, /do not create a second ecommerce runner/)
  assert.match(scope, /src\/shared\/ecommerce-stage\*/)
  assert.match(scope, /existing risk-guard/)
  assert.match(scope, /confirmation/)
  assert.match(scope, /Action Guard/)
  assert.match(scope, /chat\.js main flow/)
  assert.match(scope, /scripts-dev-api\.js/)
  assert.match(scope, /runtime\/data\/secrets/)

  const fixtureText = JSON.stringify({
    highRiskActionFixtures,
    lowRiskActionFixtures,
    confirmationFixture,
    forbiddenActionFixture,
    stage3PublishFixture,
    stage4ListingFixture,
    stage56LiveReplyFixture,
  })

  for (const forbiddenPath of ecommerceOpsForbiddenPaths) {
    assert.equal(fixtureText.includes(forbiddenPath), false, `fixture must not reference ${forbiddenPath}`)
  }
  assert.equal(/execution_success|real agent completed|fake runtime success/i.test(fixtureText), false)
})
