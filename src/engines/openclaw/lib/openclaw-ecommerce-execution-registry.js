import {
  ECOMMERCE_EXECUTION_STATUS,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_TASK_TYPES,
  getEcommerceExecutionGapItems,
} from '../../../shared/ecommerce/execution-types.js'
import { assertEcommerceSafe } from '../../../shared/ecommerce/safety-policy.js'

const PLATFORM_RE = new RegExp(ECOMMERCE_PLATFORMS.join('|'), 'i')
const HOTWORD_RE = /(?:\u70ed\u8bcd|\u5173\u952e\u8bcd|\u641c\u7d22|hotword|keyword|search)/i
const SHOP_RE = /(?:\u6296\u5e97|\u5e97\u94fa|\u5546\u54c1|\u4e0a\u4e0b\u67b6|\u8ba2\u5355|shop|product|order|doudian)/i
const PUBLISH_RE = /(?:\u53d1\u5e03|\u7d20\u6750|\u6807\u9898|\u6807\u7b7e|\u89c6\u9891|publish|material|video)/i
const COMMENT_RE = /(?:\u8bc4\u8bba|\u516c\u5c4f|\u56de\u590d|comment|live chat|reply)/i
const PATROL_RE = /(?:\u5237\u89c6\u9891|\u7b5b\u9009.*\u94fe\u63a5|\u5019\u9009\u94fe\u63a5|patrol|candidate link)/i

function hasCapability(capabilities = {}, ...names) {
  return names.some((name) => capabilities[name] === true || capabilities[name]?.available === true)
}

export function getOpenClawEcommerceExecutionRegistry(capabilities = {}) {
  const browserReady = hasCapability(capabilities, 'desktopControl', 'browserAutomation', 'browser')
  const ocrReady = hasCapability(capabilities, 'ocr')

  return getEcommerceExecutionGapItems()
    .filter((item) => item.owner === 'openclaw_runtime_executor')
    .map((item) => {
      let status = item.currentStatus
      if (item.type === ECOMMERCE_TASK_TYPES.BROWSER_AUTOMATION) {
        status = browserReady ? ECOMMERCE_EXECUTION_STATUS.REAL : ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING
      }
      if (item.type === ECOMMERCE_TASK_TYPES.OCR_READ) {
        status = ocrReady ? ECOMMERCE_EXECUTION_STATUS.REAL : ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING
      }
      return {
        ...item,
        status,
        executor: 'openclaw',
      }
    })
}

export function classifyOpenClawEcommerceExecutionTask(text = '') {
  const value = String(text || '')
  if (PATROL_RE.test(value)) return ECOMMERCE_TASK_TYPES.VIDEO_LINK_PATROL
  if (COMMENT_RE.test(value)) return ECOMMERCE_TASK_TYPES.COMMENT_REPLY
  if (PUBLISH_RE.test(value)) return ECOMMERCE_TASK_TYPES.PUBLISH_FLOW
  if (SHOP_RE.test(value)) return ECOMMERCE_TASK_TYPES.SHOP_MANAGEMENT
  if (HOTWORD_RE.test(value) || PLATFORM_RE.test(value)) return ECOMMERCE_TASK_TYPES.PLATFORM_HOTWORD_SEARCH
  return null
}

export function buildOpenClawEcommerceExecutionPlan(text = '', capabilities = {}) {
  const taskType = classifyOpenClawEcommerceExecutionTask(text)
  const safety = assertEcommerceSafe(text)
  const registry = getOpenClawEcommerceExecutionRegistry(capabilities)
  const task = registry.find((item) => item.type === taskType)

  if (!taskType) {
    return {
      matched: false,
      executor: 'openclaw',
      status: ECOMMERCE_EXECUTION_STATUS.MISSING,
      reason: 'NO_OPENCLAW_ECOMMERCE_EXECUTION_INTENT',
      steps: [],
    }
  }

  if (!safety.ok) {
    return {
      matched: true,
      executor: 'openclaw',
      taskType,
      status: ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY,
      allowed: false,
      reason: safety.reason,
      steps: ['Stop before the risky ecommerce action.', 'Ask the user to complete it manually.'],
    }
  }

  return {
    matched: true,
    executor: 'openclaw',
    taskType,
    status: task?.status || ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    allowed: true,
    reason: task?.status === ECOMMERCE_EXECUTION_STATUS.REAL ? 'OPENCLAW_EXECUTION_READY' : 'OPENCLAW_EXECUTION_NEEDS_TOOLING',
    steps: [
      'Confirm the visible ecommerce page and platform.',
      'Use desktop/browser read operations before any write operation.',
      'Use OCR when the page or screenshot cannot expose structured text.',
      'Return a Chinese summary and stop before publish, payment, login, or automatic social actions.',
    ],
  }
}
