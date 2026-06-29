const FOOD_DELIVERY_PATTERN = /点外卖|外卖|美团|美团外卖|饿了么|eleme|meituan|takeout|food delivery|附近(有)?(什么)?吃|附近.*店|评分高.*店|优惠券|满减|红包|奶茶|米饭|汉堡|午饭|晚饭|配送费|加入购物车|加购|下单|付款前停/i
const PAYMENT_OR_SUBMIT_PATTERN = /自动付款|直接付款|帮我付款|替我付款|付款|支付|提交订单|确认支付|扫码|验证码|支付密码|银行(?:卡)?|微信支付|支付宝|付款码|支付码|收款码|二维码/i

export function detectHermesFoodDeliveryIntent(text = '') {
  const value = String(text || '').trim()
  if (!value) return false
  return FOOD_DELIVERY_PATTERN.test(value)
}

export function isHermesFoodDeliveryPaymentOrSubmitStep(text = '') {
  return PAYMENT_OR_SUBMIT_PATTERN.test(String(text || ''))
}

export function hasHermesFoodDeliveryAutomation(capabilities = {}) {
  return Boolean(
    capabilities &&
    typeof capabilities.open === 'function' &&
    typeof capabilities.readVisibleText === 'function' &&
    typeof capabilities.findInteractiveTargets === 'function' &&
    capabilities.connected === true
  )
}

export function buildHermesFoodDeliveryPlan(text = '') {
  return {
    type: 'food_delivery_assist',
    needsBrowser: true,
    stopBeforePayment: true,
    userText: String(text || ''),
    steps: [
      '打开用户指定的外卖平台，或请用户打开对应页面。',
      '读取当前页面可见的店铺、评分、价格、配送费和优惠信息。',
      '按用户偏好筛选候选店铺和商品。',
      '用户明确确认后，才进行加入购物车等非支付类操作。',
      '到提交订单或付款前必须停止，等待用户本人确认。',
    ],
  }
}

export function formatHermesFoodDeliveryReply(plan = buildHermesFoodDeliveryPlan()) {
  const platform = inferFoodDeliveryPlatform(plan.userText)
  return [
    `可以，我先按外卖助手流程帮你处理${platform ? `：${platform}` : ''}。`,
    '',
    '我会帮你看店铺、评分、价格、配送费和优惠信息，并给出筛选建议。',
    '需要点击或加入购物车前会先确认；到提交订单或付款前一定停下，由你自己操作。',
  ].join('\n')
}

export function formatHermesFoodDeliveryUnavailable() {
  return [
    '可以帮你规划外卖，但当前没有接通可用的浏览器/桌面自动化能力。',
    '',
    '你可以先打开美团或饿了么页面，或者发截图给我；我再帮你筛选店铺、价格、评分和优惠。',
    '到提交订单或付款前我会停下，付款必须由你自己确认。',
  ].join('\n')
}

export function formatHermesFoodDeliveryPaymentBlockedReply() {
  return [
    '付款和提交订单需要你本人确认，我不能替你完成付款或提交订单。',
    '',
    '我可以帮你停在付款前，继续比较店铺、优惠、配送费和商品选择。',
  ].join('\n')
}

function inferFoodDeliveryPlatform(text = '') {
  const value = String(text || '')
  if (/美团|meituan/i.test(value)) return '美团外卖'
  if (/饿了么|eleme/i.test(value)) return '饿了么'
  return ''
}
