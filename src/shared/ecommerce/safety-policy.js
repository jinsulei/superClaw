import { ECOMMERCE_EXECUTION_STATUS } from './execution-types.js'

const CHECKOUT_RE =
  /(?:\u4ed8\u6b3e|\u652f\u4ed8|\u4e0b\u5355|\u63d0\u4ea4\u8ba2\u5355|\u786e\u8ba4\u652f\u4ed8|p(?:ay|urchase)|submit\s+order)/i

const PUBLISH_RE =
  /(?:\u53d1\u5e03|\u4e0a\u67b6|\u63d0\u4ea4\u5ba1\u6838|\u53d1\u9001\u8bc4\u8bba|\u81ea\u52a8\u8bc4\u8bba|\u81ea\u52a8\u79c1\u4fe1|\u70b9\u8d5e|\u5173\u6ce8|publish|comment|message|follow|like)/i

const ACCOUNT_RE =
  /(?:\u767b\u5f55|\u5bc6\u7801|\u9a8c\u8bc1\u7801|\u7ed5\u8fc7\u9a8c\u8bc1|\u5220\u9664|log\s*in|sign\s*in|password|verification|captcha|delete)/i

const READ_ONLY_RE =
  /(?:\u8bfb\u53d6|\u67e5\u770b|\u622a\u56fe|\u6574\u7406|\u751f\u6210\u8349\u7a3f|\u5206\u6790|\u68c0\u67e5|\u5bf9\u6bd4|read|screenshot|draft|analyze|inspect|compare)/i

export const ECOMMERCE_SAFETY_ACTION = Object.freeze({
  READ_ONLY: 'read_only',
  DRAFT_ONLY: 'draft_only',
  USER_CONFIRM_REQUIRED: 'user_confirm_required',
  BLOCKED: 'blocked',
})

export function classifyEcommerceSafety(text = '', options = {}) {
  const value = String(text || '').trim()
  const strict = options.strict !== false
  const checkout = CHECKOUT_RE.test(value)
  const publish = PUBLISH_RE.test(value)
  const account = ACCOUNT_RE.test(value)

  if (checkout) {
    return {
      allowed: false,
      action: ECOMMERCE_SAFETY_ACTION.USER_CONFIRM_REQUIRED,
      status: ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY,
      reason: 'CHECKOUT_OR_ORDER_REQUIRES_USER_CONTROL',
    }
  }

  if (publish) {
    return {
      allowed: false,
      action: ECOMMERCE_SAFETY_ACTION.USER_CONFIRM_REQUIRED,
      status: ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY,
      reason: 'PUBLISH_OR_SOCIAL_ACTION_REQUIRES_USER_CONTROL',
    }
  }

  if (account) {
    return {
      allowed: false,
      action: ECOMMERCE_SAFETY_ACTION.BLOCKED,
      status: ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY,
      reason: 'ACCOUNT_OR_CAPTCHA_ACTION_BLOCKED',
    }
  }

  return {
    allowed: true,
    action: READ_ONLY_RE.test(value) ? ECOMMERCE_SAFETY_ACTION.READ_ONLY : ECOMMERCE_SAFETY_ACTION.DRAFT_ONLY,
    status: strict ? ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING : ECOMMERCE_EXECUTION_STATUS.REAL,
    reason: 'SAFE_ECOMMERCE_ASSIST',
  }
}

export function assertEcommerceSafe(text = '', options = {}) {
  const safety = classifyEcommerceSafety(text, options)
  if (!safety.allowed) {
    return {
      ok: false,
      ...safety,
      visibleMessage: 'This ecommerce action must stop before checkout, publish, account entry, deletion, or automatic social actions.',
    }
  }
  return { ok: true, ...safety }
}
