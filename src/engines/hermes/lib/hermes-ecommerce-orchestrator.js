import { classifyHermesEcommerceWorkflowIntent } from './ecommerce-workflow-guard.js'

const ECOMMERCE_RE =
  /(?:\u7535\u5546|\u5916\u5356|\u7f8e\u56e2|\u997f\u4e86\u4e48|\u6296\u97f3|\u6296\u5e97|\u5feb\u624b|\u89c6\u9891\u53f7|\u5c0f\u7ea2\u4e66|\u6dd8\u5b9d|\u5929\u732b|\u62fc\u591a\u591a|douyin|doudian|kuaishou|xiaohongshu|taobao|tmall|pdd|ecommerce|shop|order)/i

const DEV_RE =
  /(?:\u4ee3\u7801|\u6e90\u7801|\u4fee\u590d|\u8c03\u8bd5|\u6d4b\u8bd5|smoke|build|package|script|plugin|api|sdk|runtime|gateway|cli)/i

const HIGH_RISK_RE =
  /(?:\u4ed8\u6b3e|\u652f\u4ed8|\u4e0b\u5355|\u63d0\u4ea4\u8ba2\u5355|\u786e\u8ba4\u652f\u4ed8|\u53d1\u5e03|\u4e0a\u67b6|\u63d0\u4ea4\u5ba1\u6838|\u81ea\u52a8\u8bc4\u8bba|\u81ea\u52a8\u79c1\u4fe1|\u5220\u9664|\u5bc6\u7801|\u9a8c\u8bc1\u7801|pay|payment|purchase|submit order|publish|delete|password|verification code)/i

function hasEcommerceIntent(text = '') {
  return ECOMMERCE_RE.test(String(text || ''))
}

export function classifyHermesEcommerceOrchestration(text = '', options = {}) {
  const value = String(text || '').trim()
  const workflow = classifyHermesEcommerceWorkflowIntent(value, options)
  const ecommerce = hasEcommerceIntent(value) || workflow.allowed
  const highRisk = HIGH_RISK_RE.test(value)
  const devAssist = ecommerce && DEV_RE.test(value)

  if (!ecommerce) {
    return {
      matched: false,
      source: 'hermes',
      executor: null,
      reviewer: null,
      claudeCodeRole: 'none',
      requiresConfirmation: false,
      reason: 'NO_ECOMMERCE_INTENT',
    }
  }

  return {
    matched: true,
    source: 'hermes',
    executor: 'openclaw',
    reviewer: 'hermes',
    claudeCodeRole: devAssist ? 'dev_assist_only' : 'not_required',
    requiresConfirmation: highRisk,
    reason: highRisk ? 'HIGH_RISK_ACTION_STOPS_FOR_USER' : workflow.reason || 'HERMES_ECOMMERCE_ORCHESTRATION',
  }
}

export function buildHermesEcommerceOrchestrationPlan(text = '', options = {}) {
  const intent = classifyHermesEcommerceOrchestration(text, options)
  return {
    type: 'hermes_ecommerce_orchestration',
    matched: intent.matched,
    source: 'hermes',
    executor: intent.executor,
    reviewer: intent.reviewer,
    claudeCodeRole: intent.claudeCodeRole,
    requiresConfirmation: intent.requiresConfirmation,
    reason: intent.reason,
    steps: intent.matched
      ? [
          'Hermes confirms the user goal and safety boundary.',
          'OpenClaw handles browser or desktop runtime work.',
          'ClaudeCode is used only for code, smoke, or packaging assistance.',
          'Hermes summarizes results and stops before payment, publish, login, or deletion.',
        ]
      : [],
  }
}
