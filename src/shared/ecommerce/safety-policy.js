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

const WECHAT_SENSITIVE_KEY_RE =
  /(?:phone|mobile|tel|address|order[_-]?id|wechat[_-]?id|weixin|wxid|api[_-]?key|apikey|token|cookie|secret|access[_-]?token|refresh[_-]?token|password|authorization|bearer|relay[_-]?config|minimax[_-]?key|openai[_-]?key|anthropic[_-]?key)/i

const WECHAT_PHONE_RE = /\b1[3-9]\d{9}\b/g
const WECHAT_ORDER_RE = /\b(?:WX|ORDER|ORD)[A-Z0-9_-]{6,}\b/gi
const WECHAT_ID_RE = /\b(?:wxid_[a-z0-9_-]+|fixture_wechat_id)\b/gi
const WECHAT_ADDRESS_RE =
  /\b\d{1,6}\s+[A-Za-z0-9 .'-]+(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|District)(?:,\s*[A-Za-z .'-]+)?\b/gi

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
  'read_wechat_message',
  'read_wechat_messages',
  'read_wechat_visible_text',
  'ocr_wechat_message',
  'ocr_wechat_messages',
  'ocr_wechat_screenshot',
  'classify_customer_question',
  'classify_wechat_customer_question',
  'generate_reply_draft',
  'generate_wechat_reply_draft',
  'tag_customer',
  'tag_wechat_customer',
  'generate_follow_up_suggestion',
  'suggest_follow_up',
  'analyze_customer_intent',
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
  const highRisk = isHighRiskActionType(actionType) || action.risk_level === 'high' || action.riskLevel === 'high'
  const safeLowRiskAction = LOW_RISK_ACTION_TYPES.has(actionType) && !highRisk
  const text = [
    actionType,
    action.text,
    action.label,
    action.title,
    action.reason,
    action.message,
  ].filter(Boolean).join(' ')
  const safety = safeLowRiskAction
    ? {
        allowed: true,
        action: actionType.includes('draft')
          ? ECOMMERCE_SAFETY_ACTION.DRAFT_ONLY
          : ECOMMERCE_SAFETY_ACTION.READ_ONLY,
        status: ECOMMERCE_EXECUTION_STATUS.REAL,
        reason: 'SAFE_ECOMMERCE_ASSIST',
      }
    : classifyEcommerceSafety(text, { strict: false })
  const needsL2 = L2_ACTION_TYPES.has(actionType) || highRisk
  const safeLowRisk = safeLowRiskAction && safety.allowed
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

export function normalizeWeChatCustomerMessage(input = {}) {
  const now = new Date().toISOString()
  const content = redactWechatString(String(
    input.content
      || input.visible_text
      || input.ocr_text
      || input.text
      || input.message
      || '',
  ))
  const customerState = redactWeChatCustomerPayload(input.customer_state || input.customerState || {})
  const intent = String(input.intent || inferWechatCustomerIntent(content) || 'general_question')
  const tags = normalizeWechatCustomerTags(input.tags, content)
  const riskLevel = normalizeWechatRiskLevel(input.risk_level || input.risk, content)

  return {
    ...redactWeChatCustomerPayload(input),
    task_id: input.task_id || input.taskId || `wechat_customer_${now}`,
    source: input.source || 'ocr',
    platform: 'wechat',
    channel: 'wechat',
    customer_id: redactWechatString(String(input.customer_id || input.customerId || '')),
    customer_name: redactWechatString(String(input.customer_name || input.customerName || '')),
    content,
    visible_text: content,
    intent,
    tags,
    risk_level: riskLevel,
    follow_up: redactWechatString(String(input.follow_up || input.followUp || defaultWechatFollowUp(intent, riskLevel))),
    customer_state: customerState,
    history: redactWeChatCustomerPayload(input.history || []),
    created_at: input.created_at || input.createdAt || now,
  }
}

export const normalizeWechatCustomerMessage = normalizeWeChatCustomerMessage
export const mapOcrTextToWechatCustomerMessage = normalizeWeChatCustomerMessage

export function redactWeChatCustomerPayload(value) {
  if (value == null) return value

  if (typeof value === 'string') {
    return redactWechatString(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactWeChatCustomerPayload(item))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        WECHAT_SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : redactWeChatCustomerPayload(item),
      ]),
    )
  }

  return value
}

export const redactWechatCustomerPayload = redactWeChatCustomerPayload

export function normalizeWeChatCustomerOpsResult(input = {}) {
  const now = new Date().toISOString()
  const actionType = normalizeActionType(input) || 'wechat_customer_ops'
  const taskId = input.task_id || input.taskId || `wechat_customer_${actionType}`
  const guard = classifyEcommerceActionGuard({
    ...input,
    action_type: actionType,
  })
  const customerMessage = normalizeWeChatCustomerMessage(input.customer_message || input.customerMessage || input)
  const visibleText = redactWechatString(String(
    input.visible_text
      || input.message
      || input.reason
      || customerMessage.visible_text
      || 'WeChat customer operation result.',
  ))
  const rawPayload = redactWeChatCustomerPayload(input.raw_payload || input.rawPayload || input)
  const replyDraft = redactWeChatCustomerPayload(input.reply_draft || input.replyDraft || {
    status: 'draft',
    auto_send: false,
    requires_confirmation: true,
    reply_text: visibleText,
  })
  const blocked = guard.blocked === true
  const requiresConfirmation = guard.requires_confirmation === true || actionType.includes('send')
  const status = input.status || (blocked ? ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY : 'draft')

  return redactWeChatCustomerPayload({
    ...input,
    status,
    platform: 'wechat',
    action_type: actionType,
    customer_message: customerMessage,
    reply_draft: replyDraft,
    question_library_entry: input.question_library_entry || input.questionLibraryEntry || null,
    reply_library_entry: input.reply_library_entry || input.replyLibraryEntry || null,
    customer_analysis: input.customer_analysis || input.customerAnalysis || {
      intent: customerMessage.intent,
      tags: customerMessage.tags,
      risk: customerMessage.risk_level,
      follow_up: customerMessage.follow_up,
      customer_state: customerMessage.customer_state,
    },
    allowed: guard.allowed === true && !blocked,
    blocked,
    requires_confirmation: requiresConfirmation,
    visible_text: visibleText,
    raw_payload: rawPayload,
    task_events: Array.isArray(input.task_events) && input.task_events.length
      ? redactWeChatCustomerPayload(input.task_events)
      : [
          {
            event_id: `evt_wechat_customer_${now}`,
            task_id: taskId,
            task_type: 'wechat_customer_ops',
            event_type: blocked ? 'action_guard_blocked' : 'task_progress',
            actor: 'hermes',
            source: 'ecommerce.safety_policy',
            status: blocked ? 'blocked' : 'running',
            visible_text: visibleText,
            raw_payload: {
              action_type: actionType,
              platform: 'wechat',
              blocked,
              requires_confirmation: requiresConfirmation,
            },
            visibility: 'normal',
            severity: blocked ? 'warning' : 'info',
            created_at: now,
          },
        ],
    tool_runs: Array.isArray(input.tool_runs) && input.tool_runs.length
      ? redactWeChatCustomerPayload(input.tool_runs)
      : [
          {
            tool_run_id: `tool_wechat_customer_${now}`,
            task_id: taskId,
            tool_name: 'wechat_customer_ops_normalizer',
            provider: 'local',
            status: 'completed',
            input_summary: redactWechatString(actionType),
            output_summary: visibleText,
            started_at: now,
            completed_at: now,
          },
        ],
  })
}

export const normalizeWechatCustomerOpsResult = normalizeWeChatCustomerOpsResult

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
  const segments = normalized.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return segments.some((segment) => [
    'send',
    'publish',
    'schedule',
    'submit',
    'list',
    'delist',
    'price',
    'inventory',
    'ad',
    'ads',
    'budget',
    'payment',
    'pay',
    'order',
  ].includes(segment))
}

function redactString(value = '') {
  return String(value).replace(SENSITIVE_VALUE_RE, '[REDACTED]')
}

function redactWechatString(value = '') {
  return redactString(value)
    .replace(WECHAT_PHONE_RE, '[REDACTED]')
    .replace(WECHAT_ORDER_RE, '[REDACTED]')
    .replace(WECHAT_ID_RE, '[REDACTED]')
    .replace(WECHAT_ADDRESS_RE, '[REDACTED]')
}

function inferWechatCustomerIntent(text = '') {
  const value = String(text || '').toLowerCase()
  if (/(?:size|\bxs\b|\bs\b|\bm\b|\bl\b|\bxl\b)/i.test(value)) return 'size_availability'
  if (/(?:order|tracking|shipment|shipping)/i.test(value)) return 'order_or_shipping'
  if (/(?:refund|return|after[- ]?sale)/i.test(value)) return 'after_sale'
  if (/(?:price|discount|coupon)/i.test(value)) return 'price_or_discount'
  return 'general_question'
}

function normalizeWechatCustomerTags(tags, text = '') {
  const normalized = Array.isArray(tags)
    ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : []
  const value = String(text || '').toLowerCase()
  const inferred = ['wechat']

  if (value.includes('size')) inferred.push('size_question')
  if (value.includes('order')) inferred.push('order_related')
  if (value.includes('address')) inferred.push('shipping_related')

  return Array.from(new Set([...normalized, ...inferred]))
}

function normalizeWechatRiskLevel(riskLevel = '', text = '') {
  const normalized = String(riskLevel || '').trim().toLowerCase()
  if (['low', 'medium', 'high'].includes(normalized)) return normalized
  const value = String(text || '')
  if (/(?:password|token|secret|payment|pay now)/i.test(value)) return 'high'
  if (WECHAT_PHONE_RE.test(value) || WECHAT_ORDER_RE.test(value) || WECHAT_ADDRESS_RE.test(value) || WECHAT_ID_RE.test(value)) {
    return 'medium'
  }
  return 'low'
}

function defaultWechatFollowUp(intent = 'general_question', riskLevel = 'low') {
  if (riskLevel === 'high') return 'Escalate to human review before responding.'
  if (intent === 'size_availability') return 'Confirm preferred size, color, and official order channel.'
  if (intent === 'order_or_shipping') return 'Ask customer to verify order details through the official channel.'
  return 'Prepare a reviewed reply draft and wait for human confirmation before sending.'
}
