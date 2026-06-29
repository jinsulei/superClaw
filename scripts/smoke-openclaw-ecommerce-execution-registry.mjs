import assert from 'node:assert/strict'

import {
  buildOpenClawEcommerceExecutionPlan,
  classifyOpenClawEcommerceExecutionTask,
  getOpenClawEcommerceExecutionRegistry,
} from '../src/engines/openclaw/lib/openclaw-ecommerce-execution-registry.js'
import {
  ECOMMERCE_EXECUTION_STATUS,
  ECOMMERCE_TASK_TYPES,
} from '../src/shared/ecommerce/execution-types.js'

const registry = getOpenClawEcommerceExecutionRegistry({
  desktopControl: true,
  ocr: true,
})
assert.ok(registry.length >= 7)
assert.equal(registry.find((item) => item.type === ECOMMERCE_TASK_TYPES.BROWSER_AUTOMATION).status, ECOMMERCE_EXECUTION_STATUS.REAL)
assert.equal(registry.find((item) => item.type === ECOMMERCE_TASK_TYPES.OCR_READ).status, ECOMMERCE_EXECUTION_STATUS.REAL)

assert.equal(classifyOpenClawEcommerceExecutionTask('\u641c\u7d22\u6296\u97f3\u70ed\u8bcd'), ECOMMERCE_TASK_TYPES.PLATFORM_HOTWORD_SEARCH)
assert.equal(classifyOpenClawEcommerceExecutionTask('\u68c0\u67e5\u6296\u5e97\u5546\u54c1'), ECOMMERCE_TASK_TYPES.SHOP_MANAGEMENT)
assert.equal(classifyOpenClawEcommerceExecutionTask('\u7b5b\u9009\u89c6\u9891\u94fe\u63a5'), ECOMMERCE_TASK_TYPES.VIDEO_LINK_PATROL)

const safePlan = buildOpenClawEcommerceExecutionPlan('\u8bfb\u53d6\u6dd8\u5b9d\u5546\u54c1\u9875\u9762', {
  desktopControl: true,
  ocr: true,
})
assert.equal(safePlan.matched, true)
assert.equal(safePlan.allowed, true)
assert.ok(safePlan.steps.length >= 3)

const riskyPlan = buildOpenClawEcommerceExecutionPlan('\u76f4\u63a5\u53d1\u5e03\u5546\u54c1\u5e76\u4ed8\u6b3e')
assert.equal(riskyPlan.matched, true)
assert.equal(riskyPlan.allowed, false)
assert.equal(riskyPlan.status, ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY)

console.log('smoke-openclaw-ecommerce-execution-registry PASS')
