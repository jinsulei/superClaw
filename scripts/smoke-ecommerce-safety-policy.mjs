import assert from 'node:assert/strict'

import {
  ECOMMERCE_SAFETY_ACTION,
  assertEcommerceSafe,
  classifyEcommerceSafety,
} from '../src/shared/ecommerce/safety-policy.js'
import { ECOMMERCE_EXECUTION_STATUS } from '../src/shared/ecommerce/execution-types.js'

const readOnly = classifyEcommerceSafety('\u8bfb\u53d6\u6296\u5e97\u9875\u9762\u5e76\u622a\u56fe')
assert.equal(readOnly.allowed, true)
assert.equal(readOnly.action, ECOMMERCE_SAFETY_ACTION.READ_ONLY)

for (const text of [
  '\u76f4\u63a5\u4ed8\u6b3e',
  '\u81ea\u52a8\u53d1\u5e03\u5546\u54c1',
  '\u81ea\u52a8\u8bc4\u8bba\u5c0f\u7ea2\u4e66',
  '\u7ed5\u8fc7\u9a8c\u8bc1\u7801\u767b\u5f55',
]) {
  const result = assertEcommerceSafe(text)
  assert.equal(result.ok, false, text)
  assert.equal(result.status, ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY, text)
}

console.log('smoke-ecommerce-safety-policy PASS')
