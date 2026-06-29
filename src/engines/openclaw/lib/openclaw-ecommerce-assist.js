const ECOMMERCE_RE =
  /(?:\u7535\u5546|\u5916\u5356|\u7f8e\u56e2|\u997f\u4e86\u4e48|\u6296\u97f3|\u6296\u5e97|\u5feb\u624b|\u89c6\u9891\u53f7|\u5c0f\u7ea2\u4e66|\u6dd8\u5b9d|\u5929\u732b|\u62fc\u591a\u591a|douyin|doudian|kuaishou|xiaohongshu|taobao|tmall|pdd|ecommerce|shop|order)/i

const RUNTIME_ACTION_RE =
  /(?:\u6253\u5f00|\u8bfb\u53d6|\u6293\u53d6|\u622a\u56fe|\u5206\u6790|\u5bf9\u6bd4|\u67e5\u770b|\u64cd\u4f5c|\u586b\u5199|\u6574\u7406|\u5bfc\u51fa|\u9875\u9762|\u5e97\u94fa|\u5546\u54c1|\u8ba2\u5355|\u7d20\u6750|\u8bc4\u8bba|\u79c1\u4fe1|browser|desktop|screenshot|read|extract|crawl)/i

const HIGH_RISK_RE =
  /(?:\u4ed8\u6b3e|\u652f\u4ed8|\u4e0b\u5355|\u63d0\u4ea4\u8ba2\u5355|\u786e\u8ba4\u652f\u4ed8|\u53d1\u5e03|\u4e0a\u67b6|\u63d0\u4ea4\u5ba1\u6838|\u81ea\u52a8\u8bc4\u8bba|\u81ea\u52a8\u79c1\u4fe1|\u81ea\u52a8\u70b9\u8d5e|\u81ea\u52a8\u5173\u6ce8|\u5220\u9664|\u5bc6\u7801|\u9a8c\u8bc1\u7801|\u767b\u5f55|pay|payment|purchase|submit order|publish|delete|password|verification code)/i

const CAPABILITY_INTENT_RE =
  /(?:\u4ecb\u7ecd|\u8bf4\u660e|\u6709\u54ea\u4e9b|\u80fd\u505a\u4ec0\u4e48|\u80fd\u5e2e\u6211|\u529f\u80fd|\u80fd\u529b|\u652f\u6301|capabilit|feature|what can you do)/i

const SAFE_RUNTIME_STEPS = [
  'Open the requested ecommerce page or reuse the visible page.',
  'Read visible text, take screenshots, and extract structured facts.',
  'Prepare drafts, comparisons, or operation suggestions without submitting them.',
  'Stop before payment, publishing, login, deletion, or irreversible actions.',
]

export const OPENCLAW_ECOMMERCE_CAPABILITY = Object.freeze({
  agent: 'openclaw',
  role: 'runtime_executor',
  safeActions: ['open_page', 'read_visible_text', 'screenshot', 'extract_facts', 'prepare_draft'],
  blockedActions: ['payment', 'submit_order', 'publish', 'login', 'delete', 'auto_comment', 'auto_message'],
})

export function classifyOpenClawEcommerceRequest(text = '') {
  const value = String(text || '').trim()
  const matched = ECOMMERCE_RE.test(value) && RUNTIME_ACTION_RE.test(value)
  const highRisk = HIGH_RISK_RE.test(value)

  if (!matched && !highRisk) {
    return {
      matched: false,
      agent: 'openclaw',
      action: 'none',
      blocked: false,
      requiresConfirmation: false,
      reason: 'NO_ECOMMERCE_RUNTIME_INTENT',
    }
  }

  if (highRisk) {
    return {
      matched: true,
      agent: 'openclaw',
      action: 'blocked_high_risk_ecommerce_action',
      blocked: true,
      requiresConfirmation: true,
      reason: 'HIGH_RISK_ECOMMERCE_ACTION_REQUIRES_USER_CONTROL',
    }
  }

  return {
    matched: true,
    agent: 'openclaw',
    action: 'safe_ecommerce_runtime_assist',
    blocked: false,
    requiresConfirmation: false,
    reason: 'OPENCLAW_SAFE_ECOMMERCE_RUNTIME',
  }
}

export function shouldAnswerOpenClawEcommerceCapability(text = '') {
  const value = String(text || '').trim()
  return ECOMMERCE_RE.test(value) && CAPABILITY_INTENT_RE.test(value)
}

export function guardOpenClawEcommerceAction(actionOrText = '') {
  const result = classifyOpenClawEcommerceRequest(actionOrText)
  if (result.blocked) {
    return {
      allowed: false,
      agent: 'openclaw',
      requiresConfirmation: true,
      reason: result.reason,
    }
  }
  return {
    allowed: true,
    agent: 'openclaw',
    requiresConfirmation: false,
    reason: result.reason,
  }
}

export function buildOpenClawEcommerceAssistPlan(text = '') {
  const intent = classifyOpenClawEcommerceRequest(text)
  return {
    type: 'openclaw_ecommerce_assist',
    agent: 'openclaw',
    executor: 'openclaw',
    matched: intent.matched,
    blocked: intent.blocked,
    requiresConfirmation: intent.requiresConfirmation,
    reason: intent.reason,
    steps: intent.blocked ? SAFE_RUNTIME_STEPS.slice(0, 3).concat('Ask the user to complete the risky action manually.') : SAFE_RUNTIME_STEPS,
  }
}

export function buildOpenClawEcommerceVisibleReply(text = '') {
  const intent = classifyOpenClawEcommerceRequest(text)
  const capability = shouldAnswerOpenClawEcommerceCapability(text)

  if (!capability && !intent.blocked) return ''

  if (intent.blocked) {
    return [
      '\u6211\u53ef\u4ee5\u534f\u52a9\u7535\u5546\u9875\u9762\u68c0\u67e5\u548c\u8d44\u6599\u6574\u7406\uff0c\u4f46\u9ad8\u98ce\u9669\u52a8\u4f5c\u4e0d\u4f1a\u81ea\u52a8\u6267\u884c\u3002',
      '\u4ed8\u6b3e\u3001\u4e0b\u5355\u3001\u53d1\u5e03\u3001\u767b\u5f55\u3001\u5220\u9664\u3001\u81ea\u52a8\u8bc4\u8bba\u6216\u79c1\u4fe1\uff0c\u90fd\u9700\u8981\u4f60\u81ea\u5df1\u786e\u8ba4\u5e76\u624b\u52a8\u5b8c\u6210\u3002',
      '\u4f60\u53ef\u4ee5\u8ba9\u6211\u5148\u505a\u622a\u56fe\u3001\u8bfb\u9875\u9762\u3001\u6574\u7406\u5546\u54c1\u4fe1\u606f\u6216\u751f\u6210\u8349\u7a3f\u3002',
    ].join('\n\n')
  }

  return [
    '\u6211\u662f OpenClaw \u7684\u7535\u5546\u6267\u884c\u52a9\u624b\uff0c\u8d1f\u8d23\u628a\u7535\u5546\u9875\u9762\u64cd\u4f5c\u53d8\u6210\u53ef\u63a7\u6b65\u9aa4\u3002',
    '\u6211\u53ef\u4ee5\u5e2e\u4f60\u6253\u5f00\u6216\u8bfb\u53d6\u7535\u5546\u9875\u9762\u3001\u622a\u56fe\u3001\u6574\u7406\u5546\u54c1/\u8ba2\u5355/\u8bc4\u8bba\u4fe1\u606f\uff0c\u751f\u6210\u8349\u7a3f\u3001\u5bf9\u6bd4\u548c\u64cd\u4f5c\u5efa\u8bae\u3002',
    '\u4ed8\u6b3e\u3001\u4e0b\u5355\u3001\u53d1\u5e03\u3001\u767b\u5f55\u3001\u5220\u9664\u3001\u81ea\u52a8\u8bc4\u8bba/\u79c1\u4fe1\u7b49\u9ad8\u98ce\u9669\u52a8\u4f5c\uff0c\u6211\u4f1a\u505c\u4e0b\u6765\u8ba9\u4f60\u624b\u52a8\u786e\u8ba4\u3002',
  ].join('\n\n')
}
