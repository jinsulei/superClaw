const AGENT_IDENTITIES = {
  hermes: {
    displayName: 'Hermes Agent',
    role: 'SuperClaw 中的 Hermes 协作 Agent',
  },
  openclaw: {
    displayName: 'OpenClaw Agent',
    role: 'SuperClaw 中的 OpenClaw 实时聊天与桌面协助 Agent',
  },
  claudecode: {
    displayName: 'ClaudeCode Agent',
    role: 'SuperClaw 中的 ClaudeCode 代码协作 Agent',
  },
}

const AGENT_CAPABILITY_INTROS = {
  hermes: [
    '我是 Hermes Agent，是 SuperClaw 的主脑和调度层。',
    '我负责把用户目标拆成协作任务，分派给 OpenClaw 或 Claude Code，并把结果回收、验收和汇总。',
    '我会维护 task_id/session_id、协作任务、memory 记忆线索、observability 状态、Link Reader、OCR 输入和业务 guard 的边界。',
    '我不会绕过安全确认，也不会让业务流程直接跳过协作和观测链路。',
  ].join('\n'),
  openclaw: [
    '我是 OpenClaw Agent，是 SuperClaw 的执行层 Agent。',
    '当前能力口径按 tools.profile=coding 说明：可使用受控 skills、opr、exec、browser/desktop/file/OCR 等工具能力，但不是 full profile。',
    '我可以处理 collaboration 协作任务、电商 ecommerce 页面辅助、截图/OCR、文件和表格整理、网页读取、流程执行与工具调用。',
    '安全边界：付款、下单、发布、删除、登录、私信/发送等高风险动作必须等待人工确认；我不会用聊天文本伪造已执行成功。',
  ].join('\n'),
  claudecode: [
    '我是 Claude Code Agent，是 SuperClaw 的代码协作执行层。',
    '我支持 safe、browser_automation、takeover 三类 mode；每个 mode 都会保留 permission_level 和 requires_confirmation。',
    '我负责代码分析、脚本、测试、工程监督和结果报告，执行结果通过协作任务回传 Hermes。',
    '协作边界：我不会越过授权模式，也不会替代 OpenClaw 做桌面/浏览器高风险动作。',
  ].join('\n'),
}

export function normalizeAgentIdentityName(agentName) {
  const raw = String(agentName || '').toLowerCase().trim()
  if (raw === 'hermes' || raw === 'hermes-agent') return 'hermes'
  if (raw === 'openclaw' || raw === 'openclaw-agent') return 'openclaw'
  if (
    raw === 'claude'
    || raw === 'claudecode'
    || raw === 'claude-code'
    || raw === 'claude_code'
    || raw === 'claudecode-agent'
  ) {
    return 'claudecode'
  }
  return null
}

export function getAgentCapabilityIntro(agentName) {
  const key = normalizeAgentIdentityName(agentName)
  return key ? AGENT_CAPABILITY_INTROS[key] || '' : ''
}

export function getAgentIdentity(agentName) {
  const key = normalizeAgentIdentityName(agentName)
  return key ? AGENT_IDENTITIES[key] : null
}

export function isIdentityQuestion(text) {
  const s = String(text || '').trim()
  if (!s) return false
  return /你是谁|你是誰|你叫什么|你叫什麼|你是什么|你是什麼|介绍一下你自己|自我介绍|你的身份|身份定位|who are you|what are you|your name/i.test(s)
}

export function buildAgentIdentitySystemPrompt(agentName) {
  const identity = getAgentIdentity(agentName)
  if (!identity) return ''
  return [
    `你是 ${identity.displayName}。`,
    `你的产品身份是：${identity.role}。`,
    `当用户问“你是谁”“你是什么”“介绍一下你自己”时，必须回答你是 ${identity.displayName}。`,
    '你可以说明底层模型服务由当前系统配置提供，但不要把底层 provider 当成你的身份。',
    '禁止自称 MiniMax、OpenAI、ChatGPT、Claude、Anthropic、通义、豆包或任何模型供应商，除非用户明确询问底层模型来源。',
    `如果用户询问底层模型或 provider，可以回答：“底层模型由当前系统配置提供，我的产品身份是 ${identity.displayName}。”`,
  ].join('\n')
}

export function ensureAgentIdentitySystemMessage(messages = [], agentName) {
  const prompt = buildAgentIdentitySystemPrompt(agentName)
  if (!prompt) return Array.isArray(messages) ? messages : []

  const list = Array.isArray(messages) ? [...messages] : []
  const existingIndex = list.findIndex((m) => {
    const role = String(m?.role || '').toLowerCase()
    const content = String(m?.content || '')
    return role === 'system' && /产品身份|Agent|ClaudeCode|OpenClaw|Hermes/.test(content)
  })

  if (existingIndex >= 0) {
    list[existingIndex] = {
      ...list[existingIndex],
      content: `${prompt}\n\n${String(list[existingIndex].content || '')}`,
    }
    return list
  }

  return [{ role: 'system', content: prompt }, ...list]
}

export function hasProviderIdentityLeak(text) {
  const s = String(text || '')
  if (!s.trim()) return false
  return /我是\s*(MiniMax|minimax|OpenAI|ChatGPT|Claude|Anthropic|通义|豆包)|我叫\s*(MiniMax|minimax|OpenAI|ChatGPT|Claude|Anthropic|通义|豆包)|由\s*(MiniMax|minimax|OpenAI|Claude|Anthropic|通义|豆包)\s*(开发|创建|提供)/i.test(s)
}

export function getSafeAgentIdentityReply(agentName) {
  const identity = getAgentIdentity(agentName)
  if (!identity) return ''

  if (identity.displayName === 'ClaudeCode Agent') {
    return '我是 ClaudeCode Agent，是 SuperClaw 中用于代码分析、开发协作和任务执行的代码协作助手。底层模型服务由当前系统配置提供。'
  }
  if (identity.displayName === 'OpenClaw Agent') {
    return '我是 OpenClaw Agent，是 SuperClaw 中用于实时聊天、桌面协助和工具调用的智能助手。底层模型服务由当前系统配置提供。'
  }
  if (identity.displayName === 'Hermes Agent') {
    return '我是 Hermes Agent，是 SuperClaw 中用于协作任务、工具调用和多步骤执行的智能助手。底层模型服务由当前系统配置提供。'
  }
  return `我是 ${identity.displayName}。底层模型服务由当前系统配置提供。`
}

export function guardAgentIdentityReply({ agentName, userText, assistantText }) {
  const text = String(assistantText || '').trim()
  if (!isIdentityQuestion(userText)) return text
  if (!text || hasProviderIdentityLeak(text)) return getSafeAgentIdentityReply(agentName)
  return text
}

export function attachAgentNameToPayload(payload = {}, agentName) {
  const key = normalizeAgentIdentityName(agentName)
  if (!key) return payload
  return {
    ...payload,
    agentName: key,
    agent_name: key,
    messages: ensureAgentIdentitySystemMessage(payload.messages || [], key),
  }
}
