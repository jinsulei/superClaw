import assert from 'node:assert/strict'

import {
  ECOMMERCE_EXECUTION_STATUS,
  ECOMMERCE_TASK_TYPES,
  getEcommerceExecutionGapItems,
} from '../src/shared/ecommerce/execution-types.js'

const items = getEcommerceExecutionGapItems()
assert.equal(items.length, 11)

const byType = new Map(items.map((item) => [item.type, item]))
for (const type of Object.values(ECOMMERCE_TASK_TYPES)) {
  assert.ok(byType.has(type), `missing task type ${type}`)
}

assert.equal(byType.get(ECOMMERCE_TASK_TYPES.BROWSER_AUTOMATION).currentStatus, ECOMMERCE_EXECUTION_STATUS.REAL)
assert.equal(byType.get(ECOMMERCE_TASK_TYPES.OCR_READ).currentStatus, ECOMMERCE_EXECUTION_STATUS.REAL)
assert.equal(byType.get(ECOMMERCE_TASK_TYPES.SCHEDULER_SUPERVISION).currentStatus, ECOMMERCE_EXECUTION_STATUS.MISSING)
assert.equal(byType.get(ECOMMERCE_TASK_TYPES.PUBLISH_FLOW).currentStatus, ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY)

console.table(items.map((item) => ({
  id: item.id,
  type: item.type,
  owner: item.owner,
  status: item.currentStatus,
})))

console.log('smoke-ecommerce-execution-gap-audit PASS')
