import assert from 'node:assert/strict'

import {
  buildHermesEcommerceLinkReadPlan,
  classifyHermesEcommerceLink,
  extractHermesEcommerceLinks,
} from '../src/engines/hermes/lib/hermes-ecommerce-link-reader.js'
import { ECOMMERCE_EXECUTION_STATUS } from '../src/shared/ecommerce/execution-types.js'

const links = extractHermesEcommerceLinks('\u8bf7\u8bfb\u53d6 https://example.com/path, \u518d\u770b https://github.com/a/b')
assert.deepEqual(links, ['https://example.com/path', 'https://github.com/a/b'])

const social = classifyHermesEcommerceLink('https://v.douyin.com/abc')
assert.equal(social.platform, 'social_login_or_visual_required')
assert.equal(social.status, ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING)

const noToolPlan = buildHermesEcommerceLinkReadPlan('\u8bfb\u53d6 https://www.xiaohongshu.com/explore/1')
assert.equal(noToolPlan.matched, true)
assert.equal(noToolPlan.noFakeExecution, true)
assert.match(noToolPlan.links[0].userVisibleFallback, /Need login|No link reader/)

const toolPlan = buildHermesEcommerceLinkReadPlan('\u8bfb\u53d6 https://example.com', { fetch: true })
assert.equal(toolPlan.status, ECOMMERCE_EXECUTION_STATUS.REAL)

console.log('smoke-hermes-ecommerce-link-reader PASS')
