export const LifeTaskKind = Object.freeze({
  LOOK_AT_PAGE: 'look_at_page',
  FIND_COUPON: 'find_coupon',
  ORDER_FOOD: 'order_food',
  FIND_CLOTHES: 'find_clothes',
  SCREENSHOT_TO_CHAT: 'screenshot_to_chat',
  BROWSER_HELP: 'browser_help',
})

export const RiskLevel = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
})

export const HighRiskActions = Object.freeze([
  'pay',
  'submit_order',
  'confirm_purchase',
  'enter_password',
  'enter_payment_password',
  'enter_verification_code',
  'login',
  'upload_private_file',
  'delete_file',
  'change_account',
])

export function isHighRiskAction(action) {
  if (!action) return false
  const name = String(action.type || action.name || action.action || '').toLowerCase()
  return HighRiskActions.some(key => name.includes(key))
}

export function createScreenshotCard({
  id,
  title,
  imageUrl,
  source = '',
  note = '',
  createdAt = Date.now(),
  risk = RiskLevel.LOW,
}) {
  return {
    type: 'screenshot_card',
    id: id || `shot_${Date.now()}`,
    title: title || '页面截图',
    imageUrl,
    source,
    note,
    createdAt,
    risk,
  }
}

export function createUserConfirmation({
  id,
  title,
  description,
  amount,
  platform,
  items = [],
  action,
}) {
  return {
    type: 'user_confirmation',
    id: id || `confirm_${Date.now()}`,
    title: title || '需要你确认',
    description,
    amount,
    platform,
    items,
    action,
    createdAt: Date.now(),
  }
}
