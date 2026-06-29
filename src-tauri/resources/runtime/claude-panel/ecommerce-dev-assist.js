const ECOMMERCE_RE =
  /(?:\u7535\u5546|\u5916\u5356|\u7f8e\u56e2|\u997f\u4e86\u4e48|\u6296\u97f3|\u6296\u5e97|\u5feb\u624b|\u89c6\u9891\u53f7|\u5c0f\u7ea2\u4e66|\u6dd8\u5b9d|\u5929\u732b|\u62fc\u591a\u591a|meituan|eleme|douyin|doudian|kuaishou|xiaohongshu|taobao|tmall|pdd|ecommerce|shop|order)/i

const DEV_RE =
  /(?:\u4ee3\u7801|\u6e90\u7801|\u4fee\u590d|\u8c03\u8bd5|\u6d4b\u8bd5|smoke|build|package|script|plugin|api|sdk|runtime|gateway|cli|config|lint)/i

const RUNTIME_RE =
  /(?:\u6253\u5f00|\u64cd\u4f5c|\u8bfb\u53d6|\u6293\u53d6|\u4ed8\u6b3e|\u652f\u4ed8|\u4e0b\u5355|\u63d0\u4ea4|\u53d1\u5e03|\u4e0a\u67b6|\u8bc4\u8bba|\u79c1\u4fe1|\u70b9\u8d5e|\u5173\u6ce8|\u767b\u5f55|\u5bc6\u7801|open|click|pay|publish|comment|message|login)/i

export function classifyClaudeCodeEcommerceDevAssist(text = '') {
  const value = String(text || '').trim()
  const ecommerce = ECOMMERCE_RE.test(value)
  const devAssist = ecommerce && DEV_RE.test(value)
  const runtimeAction = ecommerce && RUNTIME_RE.test(value) && !devAssist

  if (!ecommerce) {
    return {
      matched: false,
      agent: 'claudecode',
      allowed: true,
      role: 'normal_coding_agent',
      reason: 'NO_ECOMMERCE_INTENT',
    }
  }

  if (devAssist) {
    return {
      matched: true,
      agent: 'claudecode',
      allowed: true,
      role: 'ecommerce_dev_assist_only',
      reason: 'CLAUDECODE_ECOMMERCE_DEV_ASSIST',
    }
  }

  if (runtimeAction) {
    return {
      matched: true,
      agent: 'claudecode',
      allowed: false,
      role: 'blocked_runtime_ecommerce_action',
      routeTo: ['hermes', 'openclaw'],
      reason: 'CLAUDE_CODE_ECOMMERCE_RUNTIME_BLOCKED',
    }
  }

  return {
    matched: true,
    agent: 'claudecode',
    allowed: true,
    role: 'ecommerce_context_review',
    reason: 'CLAUDECODE_ECOMMERCE_CONTEXT_ONLY',
  }
}

export function buildClaudeCodeEcommerceDevAssistNotice(text = '') {
  const intent = classifyClaudeCodeEcommerceDevAssist(text)
  if (intent.allowed) {
    return {
      allowed: true,
      role: intent.role,
      message: 'ClaudeCode can assist only with code, tests, scripts, docs, and packaging for ecommerce features.',
    }
  }
  return {
    allowed: false,
    role: intent.role,
    routeTo: intent.routeTo,
    message: 'ClaudeCode must not perform live ecommerce runtime operations. Route runtime work through Hermes and OpenClaw.',
  }
}
