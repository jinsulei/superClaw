import { ECOMMERCE_EXECUTION_STATUS } from './execution-types.js'

const CHECKOUT_RE =
  /(?:\u4ed8\u6b3e|\u652f\u4ed8|\u4e0b\u5355|\u63d0\u4ea4\u8ba2\u5355|\u786e\u8ba4\u652f\u4ed8|p(?:ay|urchase)|submit\s+order)/i

const PUBLISH_RE =
  /(?:\u53d1\u5e03|\u4e0a\u67b6|\u63d0\u4ea4\u5ba1\u6838|\u53d1\u9001\u8bc4\u8bba|\u81ea\u52a8\u8bc4\u8bba|\u81ea\u52a8\u79c1\u4fe1|\u70b9\u8d5e|\u5173\u6ce8|publish|comment|message|follow|like)/i

const ACCOUNT_RE =
  /(?:\u767b\u5f55|\u5bc6\u7801|\u9a8c\u8bc1\u7801|\u7ed5\u8fc7\u9a8c\u8bc1|\u5220\u9664|log\s*in|sign\s*in|password|verification|captcha|delete)/i

const READ_ONLY_RE =
  /(?:\u8bfb\u53d6|\u67e5\u770b|\u622a\u56fe|\u6574\u7406|\u751f\u6210\u8349\u7a3f|\u5206\u6790|\u68c0\u67e5|\u5bf9\u6bd4|read|screenshot|draft|analyze|inspect|compare)/i

const SENSITIVE_KEY_RE =
  /(?:api[_-]?key|apikey|token|cookie|secret|access[_-]?token|refresh[_-]?token|password|authorization|bearer|relay[_-]?config|minimax[_-]?key|openai[_-]?key|anthropic[_-]?key)/i

const SENSITIVE_VALUE_RE =
  /\b(?:fake-(?:api-key|token|cookie|secret|access-token|refresh-token|password)-should-be-redacted|bearer\s+[a-z0-9._~+/=-]+|sk-[a-z0-9._-]+)\b/gi

const HIGH_RISK_ACTION_TYPES = new Set([
  'send_live_comment',
  'send_live_reply',
  'send_wechat_message',
  'send_private_message',
  'publish_video',
  'publish_content',
  'schedule_publish',
  'product_listing_submit',
  'submit_listing',
  'submit_review',
  'list_product',
  'product_delist',
  'delist_product',
  'change_product_price',
  'change_price',
  'change_inventory',
  'create_ad_plan',
  'increase_ad_budget',
  'pause_ad_plan',
  'payment',
  'pay',
  'submit_order',
])

const L2_ACTION_TYPES = new Set([
  ...HIGH_RISK_ACTION_TYPES,
  'write',
  'publish',
  'send',
  'spend',
  'list',
  'delist',
])

const LOW_RISK_ACTION_TYPES = new Set([
  'read_dashboard',
  'read_live_comments',
  'ocr_live_comments',
  'classify_customer_question',
  'generate_reply_draft',
  'generate_live_report',
  'generate_ad_report',
  'generate_product_suggestion',
  'prepare_publish_draft',
  'prepare_product_listing',
])

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

export function redactEcommerceGuardPayload(value) {
  if (value == null) return value

  if (typeof value === 'string') {
    return redactString(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactEcommerceGuardPayload(item))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : redactEcommerceGuardPayload(item),
      ]),
    )
  }

  return value
}

export function classifyEcommerceActionGuard(action = {}) {
  const actionType = normalizeActionType(action)
  const permissionLevel = normalizePermissionLevel(action.permission_level || action.permissionLevel)
  const text = [
    actionType,
    action.text,
    action.label,
    action.title,
    action.reason,
    action.message,
  ].filter(Boolean).join(' ')
  const safety = classifyEcommerceSafety(text, { strict: false })
  const highRisk = isHighRiskActionType(actionType) || action.risk_level === 'high' || action.riskLevel === 'high'
  const needsL2 = L2_ACTION_TYPES.has(actionType) || highRisk
  const safeLowRisk = LOW_RISK_ACTION_TYPES.has(actionType) && !highRisk && safety.allowed
  const status = highRisk || !safety.allowed
    ? ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY
    : safety.status
  const reason = highRisk
    ? 'HIGH_RISK_ACTION_REQUIRES_CONFIRMATION'
    : needsL2 && permissionLevel !== 'L2'
      ? 'L2_PERMISSION_REQUIRED'
      : safety.reason
  const blocked = highRisk || !safety.allowed
  const now = new Date().toISOString()
  const result = {
    allowed: safeLowRisk || (!blocked && (!needsL2 || permissionLevel === 'L2')),
    blocked,
    requires_confirmation: blocked || needsL2,
    permission_level: permissionLevel || (needsL2 ? 'L2' : 'L1'),
    required_permission_level: needsL2 ? 'L2' : 'L1',
    action: blocked ? ECOMMERCE_SAFETY_ACTION.USER_CONFIRM_REQUIRED : safety.action,
    action_type: actionType,
    risk_level: highRisk ? 'high' : action.risk_level || action.riskLevel || 'low',
    status,
    reason,
    visible_text: blocked
      ? 'This ecommerce action is blocked until explicit human confirmation.'
      : 'This ecommerce action is allowed only as read, analysis, or draft workflow.',
    raw_payload: redactEcommerceGuardPayload(action),
    task_events: [
      {
        event_id: `evt_ecommerce_guard_${now}`,
        task_id: action.task_id || action.taskId || `ecommerce_${actionType || 'action'}`,
        task_type: 'ecommerce_ops',
        event_type: blocked ? 'action_guard_blocked' : 'permission_checked',
        actor: 'system',
        source: 'ecommerce.safety_policy',
        status: blocked ? 'blocked' : 'running',
        visible_text: blocked ? 'Action Guard blocked ecommerce action.' : 'E-Commerce action permission checked.',
        raw_payload: redactEcommerceGuardPayload({
          action_type: actionType,
          permission_level: permissionLevel,
          risk_level: highRisk ? 'high' : action.risk_level || action.riskLevel || 'low',
        }),
        visibility: 'normal',
        severity: blocked ? 'warning' : 'info',
        created_at: now,
      },
    ],
  }

  if (blocked || needsL2) {
    result.confirmation = {
      required: true,
      action_type: actionType,
      permission_level: result.required_permission_level,
      risk_level: result.risk_level,
    }
  }

  return redactEcommerceGuardPayload(result)
}

export function normalizeEcommerceOpsResult(input = {}) {
  const now = new Date().toISOString()
  const actionType = normalizeActionType(input) || 'ecommerce_ops'
  const taskId = input.task_id || input.taskId || `ecommerce_${actionType}`
  const status = input.status || ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING
  const visibleText = redactString(String(input.visible_text || input.message || input.reason || 'E-Commerce operation result.'))
  const rawPayload = redactEcommerceGuardPayload(input.raw_payload || input)

  return {
    ...redactEcommerceGuardPayload(input),
    action_type: actionType,
    status,
    visible_text: visibleText,
    raw_payload: rawPayload,
    task_events: Array.isArray(input.task_events) && input.task_events.length
      ? redactEcommerceGuardPayload(input.task_events)
      : [
          {
            event_id: `evt_ecommerce_result_${now}`,
            task_id: taskId,
            task_type: 'ecommerce_ops',
            event_type: status === ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY
              ? 'action_guard_blocked'
              : 'task_progress',
            actor: 'hermes',
            source: 'ecommerce.safety_policy',
            status: status === ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY ? 'blocked' : 'running',
            visible_text: visibleText,
            raw_payload: rawPayload,
            visibility: 'normal',
            severity: status === ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY ? 'warning' : 'info',
            created_at: now,
          },
        ],
    tool_runs: Array.isArray(input.tool_runs) && input.tool_runs.length
      ? redactEcommerceGuardPayload(input.tool_runs)
      : [
          {
            tool_run_id: `tool_ecommerce_${now}`,
            task_id: taskId,
            tool_name: 'ecommerce_action_guard',
            provider: 'local',
            status: 'completed',
            input_summary: redactString(actionType),
            output_summary: visibleText,
            started_at: now,
            completed_at: now,
          },
        ],
  }
}

function normalizeActionType(action = {}) {
  return String(action.action_type || action.actionType || action.type || action.name || action.action || '').trim()
}

function normalizePermissionLevel(value = '') {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'L1' || normalized === 'L2') return normalized
  return ''
}

function isHighRiskActionType(actionType = '') {
  const normalized = String(actionType || '').trim()
  if (HIGH_RISK_ACTION_TYPES.has(normalized)) return true
  return /(?:send|publish|schedule|submit|list|delist|price|inventory|ad|budget|payment|pay|order)/i.test(normalized)
}

function redactString(value = '') {
  return String(value).replace(SENSITIVE_VALUE_RE, '[REDACTED]')
}
