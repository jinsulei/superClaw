import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LifeTaskKind,
  RiskLevel,
  createScreenshotCard,
  createUserConfirmation,
  isHighRiskAction,
} from '../src/shared/life-assistant-types.js'
import { guardLifeAction } from '../src/shared/life-assistant-guard.js'
import { runLifeDesktopAssist } from '../src/tools/life-desktop-assist.js'

test('life assistant types expose task/risk primitives and factories', () => {
  assert.equal(LifeTaskKind.SCREENSHOT_TO_CHAT, 'screenshot_to_chat')
  assert.equal(RiskLevel.HIGH, 'high')

  const screenshot = createScreenshotCard({
    title: 'Current page',
    imageUrl: 'mock://screenshot.png',
  })
  assert.equal(screenshot.type, 'screenshot_card')
  assert.equal(screenshot.imageUrl, 'mock://screenshot.png')

  const confirmation = createUserConfirmation({
    title: 'Confirm action',
    action: { type: 'pay' },
  })
  assert.equal(confirmation.type, 'user_confirmation')
  assert.deepEqual(confirmation.action, { type: 'pay' })
})

test('life assistant risk classifier blocks high-risk actions only', () => {
  assert.equal(isHighRiskAction({ type: 'pay' }), true)
  assert.equal(isHighRiskAction({ type: 'submit_order' }), true)
  assert.equal(isHighRiskAction({ type: 'read_visible_text' }), false)
})

test('life assistant guard blocks empty and high-risk actions', () => {
  const read = guardLifeAction({ type: 'read_visible_text' })
  assert.equal(read.allowed, true)

  const empty = guardLifeAction(null)
  assert.equal(empty.allowed, false)
  assert.equal(empty.reason, 'EMPTY_ACTION')
  assert.equal(empty.confirmation?.type, 'user_confirmation')

  const pay = guardLifeAction({ type: 'pay', amount: '10.00', platform: 'mock' })
  assert.equal(pay.allowed, false)
  assert.equal(pay.reason, 'HIGH_RISK_ACTION')
  assert.equal(pay.confirmation?.type, 'user_confirmation')

  const submit = guardLifeAction({ type: 'submit_order', platform: 'mock' })
  assert.equal(submit.allowed, false)
  assert.equal(submit.confirmation?.type, 'user_confirmation')
})

test('life desktop assist emits screenshot card for screenshot_to_chat', async () => {
  const emitted = []
  const browserCalls = []

  const result = await runLifeDesktopAssist(
    { intent: LifeTaskKind.SCREENSHOT_TO_CHAT },
    {
      emit: event => emitted.push(event),
      browser: {
        readVisibleText: async () => {
          browserCalls.push('readVisibleText')
          return 'visible text'
        },
        captureScreenshot: async () => {
          browserCalls.push('captureScreenshot')
          return {
            imageUrl: 'mock://current-page.png',
            title: 'Mock page',
            source: 'mock-browser',
          }
        },
      },
    },
  )

  assert.equal(result.ok, true)
  assert.ok(browserCalls.includes('readVisibleText'))
  assert.ok(browserCalls.includes('captureScreenshot'))
  assert.equal(emitted.some(event => event.type === 'screenshot_card' && event.card?.imageUrl === 'mock://current-page.png'), true)
  assert.equal(emitted.some(event => event.type === 'user_confirmation'), false)
})

test('life desktop assist stops before high-risk order actions', async () => {
  const emitted = []
  const browserCalls = []

  const result = await runLifeDesktopAssist(
    {
      intent: LifeTaskKind.ORDER_FOOD,
      stopBeforePayment: true,
    },
    {
      emit: event => emitted.push(event),
      browser: {
        open: async () => browserCalls.push('open'),
        readVisibleText: async () => browserCalls.push('readVisibleText'),
        captureScreenshot: async () => browserCalls.push('captureScreenshot'),
      },
    },
  )

  assert.equal(result.ok, false)
  assert.equal(result.blocked, true)
  assert.equal(result.reason, 'HIGH_RISK_ACTION')
  assert.equal(result.confirmation?.type, 'user_confirmation')
  assert.equal(result.confirmation?.action?.type, 'submit_order')
  assert.equal(emitted.some(event => event.type === 'user_confirmation'), true)
  assert.equal(emitted.some(event => event.type === 'screenshot_card'), false)
  assert.deepEqual(browserCalls, ['open', 'readVisibleText'])
})
