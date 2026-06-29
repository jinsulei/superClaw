import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildHermesFoodDeliveryPlan,
  detectHermesFoodDeliveryIntent,
  formatHermesFoodDeliveryPaymentBlockedReply,
  formatHermesFoodDeliveryReply,
  formatHermesFoodDeliveryUnavailable,
  hasHermesFoodDeliveryAutomation,
  isHermesFoodDeliveryPaymentOrSubmitStep,
} from '../src/engines/hermes/lib/hermes-food-delivery-assist.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const chatSource = readFileSync(resolve(repoRoot, 'src/engines/hermes/pages/chat.js'), 'utf8')
const helperSource = readFileSync(resolve(repoRoot, 'src/engines/hermes/lib/hermes-food-delivery-assist.js'), 'utf8')

assert.equal(detectHermesFoodDeliveryIntent('帮我点外卖'), true)
assert.equal(detectHermesFoodDeliveryIntent('打开美团外卖，找评分高的店'), true)
assert.equal(detectHermesFoodDeliveryIntent('看看附近有什么吃的'), true)
assert.equal(detectHermesFoodDeliveryIntent('解释什么是 requestId'), false)

assert.equal(isHermesFoodDeliveryPaymentOrSubmitStep('帮我直接付款'), true)
assert.equal(isHermesFoodDeliveryPaymentOrSubmitStep('识别付款码并帮我支付'), true)
assert.equal(isHermesFoodDeliveryPaymentOrSubmitStep('加入购物车前先问我'), false)

assert.equal(hasHermesFoodDeliveryAutomation({
  connected: true,
  open: async () => ({}),
  readVisibleText: async () => ({}),
  findInteractiveTargets: async () => ({}),
}), true)
assert.equal(hasHermesFoodDeliveryAutomation({
  connected: false,
  open: async () => ({}),
  readVisibleText: async () => ({}),
  findInteractiveTargets: async () => ({}),
}), false)

const plan = buildHermesFoodDeliveryPlan('用美团帮我点外卖，付款前停')
assert.equal(plan.type, 'food_delivery_assist')
assert.equal(plan.stopBeforePayment, true)
assert.equal(plan.needsBrowser, true)
assert.ok(plan.steps.some((step) => step.includes('付款前必须停止')))

const readyReply = formatHermesFoodDeliveryReply(plan)
assert.match(readyReply, /外卖助手流程/)
assert.match(readyReply, /付款前一定停下/)
assert.doesNotMatch(readyReply, /已经下单|已经付款|支付完成|自动提交/)

const unavailableReply = formatHermesFoodDeliveryUnavailable()
assert.match(unavailableReply, /当前没有接通可用的浏览器\/桌面自动化能力/)
assert.match(unavailableReply, /打开美团或饿了么页面|发截图/)
assert.doesNotMatch(unavailableReply, /已经打开|已经抓取|已经下单|已经付款/)

const blockedReply = formatHermesFoodDeliveryPaymentBlockedReply()
assert.match(blockedReply, /本人确认/)
assert.match(blockedReply, /不能替你完成付款或提交订单/)
assert.doesNotMatch(blockedReply, /自动付款|自动提交订单|支付完成/)

assert.match(chatSource, /hermes-food-delivery-assist\.js/)
assert.match(chatSource, /function maybeRunHermesFoodDeliveryAssist/)
assert.match(chatSource, /detectHermesFoodDeliveryIntent\(text\)/)
assert.match(chatSource, /maybeRunHermesFoodDeliveryAssist\(text\)/)
assert.ok(
  chatSource.indexOf('maybeRunHermesFoodDeliveryAssist(text)') <
    chatSource.indexOf('maybeRunEcommerceStage(text)'),
  'food delivery assistant should intercept before legacy ecommerce stages',
)

assert.doesNotMatch(helperSource, /openclaw|claudecode|claude-panel/i)

console.log('smoke-hermes-food-delivery-assist PASS')
