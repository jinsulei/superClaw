import { createUserConfirmation, isHighRiskAction } from './life-assistant-types.js'

export function guardLifeAction(action) {
  if (!action) {
    return {
      allowed: false,
      reason: 'EMPTY_ACTION',
      confirmation: createUserConfirmation({
        title: '操作为空',
        description: '没有可执行的动作。',
        action,
      }),
    }
  }

  if (isHighRiskAction(action)) {
    return {
      allowed: false,
      reason: 'HIGH_RISK_ACTION',
      confirmation: createUserConfirmation({
        title: '高风险操作需要确认',
        description: buildHighRiskDescription(action),
        amount: action.amount,
        platform: action.platform,
        items: action.items || [],
        action,
      }),
    }
  }

  return {
    allowed: true,
    reason: 'LOW_RISK_ACTION',
    confirmation: null,
  }
}

function buildHighRiskDescription(action) {
  const platform = action.platform ? `平台：${action.platform}\n` : ''
  const amount = action.amount ? `金额：${action.amount}\n` : ''
  const name = action.label || action.name || action.type || '未知操作'
  return `${platform}${amount}OpenClaw 准备执行：${name}\n涉及付款、订单、账号或隐私的动作必须由用户确认。`
}
