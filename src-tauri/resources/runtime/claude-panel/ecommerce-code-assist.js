const ECOMMERCE_RE =
  /(?:\u7535\u5546|\u6296\u5e97|\u6296\u97f3|\u5feb\u624b|\u5c0f\u7ea2\u4e66|\u6dd8\u5b9d|\u5929\u732b|\u62fc\u591a\u591a|ecommerce|shop|doudian|taobao|pdd)/i

const CODE_RE =
  /(?:\u4ee3\u7801|\u6e90\u7801|\u4fee\u590d|\u8c03\u8bd5|\u6d4b\u8bd5|smoke|build|script|package|runtime|gateway|api|code|test|lint)/i

const RUNTIME_RE =
  /(?:\u6253\u5f00|\u70b9\u51fb|\u586b\u5199|\u4ed8\u6b3e|\u53d1\u5e03|\u8bc4\u8bba|\u79c1\u4fe1|\u767b\u5f55|open|click|pay|publish|comment|login)/i

export function classifyClaudeCodeEcommerceCodeAssist(text = '') {
  const value = String(text || '').trim()
  const ecommerce = ECOMMERCE_RE.test(value)
  const code = CODE_RE.test(value)
  const runtime = RUNTIME_RE.test(value) && !code

  if (!ecommerce) {
    return {
      matched: false,
      agent: 'claudecode',
      nativeRequired: true,
      relayFallbackAllowed: false,
      stderrLogOnly: true,
      reason: 'NO_ECOMMERCE_CODE_ASSIST_INTENT',
    }
  }

  if (runtime) {
    return {
      matched: true,
      agent: 'claudecode',
      allowed: false,
      routeTo: ['hermes', 'openclaw'],
      nativeRequired: true,
      relayFallbackAllowed: false,
      stderrLogOnly: true,
      reason: 'RUNTIME_ECOMMERCE_ACTION_NOT_FOR_CLAUDECODE',
    }
  }

  return {
    matched: true,
    agent: 'claudecode',
    allowed: true,
    nativeRequired: true,
    relayFallbackAllowed: false,
    stderrLogOnly: true,
    reason: code ? 'CLAUDECODE_ECOMMERCE_CODE_ASSIST_READY' : 'ECOMMERCE_CONTEXT_REVIEW_ONLY',
  }
}

export function buildClaudeCodeEcommerceCodeAssistPlan(text = '') {
  const intent = classifyClaudeCodeEcommerceCodeAssist(text)
  return {
    ...intent,
    checks: intent.allowed === false ? [] : [
      'Inspect ecommerce source changes without touching live runtime accounts.',
      'Run targeted smoke tests for ecommerce safety and agent routing.',
      'Keep native Claude CLI required; never silently fall back to relay chat.',
      'Write stderr to logs only, not the user chat stream.',
    ],
    recommendedSmokes: [
      'scripts/smoke-openclaw-ecommerce-assist.mjs',
      'scripts/smoke-hermes-ecommerce-orchestrator.mjs',
      'scripts/smoke-claudecode-ecommerce-dev-assist.mjs',
      'scripts/smoke-three-agent-ecommerce-capabilities.mjs',
    ],
  }
}

