const AGENT_CONFIG = {
  hermes: {
    name: 'Hermes',
    port: 8642,
    devStatusPath: '/__api/dev/agents/status?agent=hermes',
    devStopAgent: 'hermes',
  },
  openclaw: {
    name: 'OpenClaw',
    port: 18789,
    devStatusPath: '/__api/dev/agents/status?agent=openclaw',
    devStopAgent: 'openclaw',
  },
  claudecode: {
    name: 'ClaudeCode',
    port: 3020,
    devStatusPath: '/__api/dev/agents/status?agent=claudecode',
    devStopAgent: 'claudecode',
  },
}

export const OPENCLAW_GATEWAY_STATES = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  CHECKING: 'checking',
  NEEDS_SETUP: 'needs_setup',
  READY: 'ready',
  ERROR: 'error',
}

export function normalizeAgentName(agent) {
  const raw = String(agent || '').trim().toLowerCase()
  if (raw === 'hermes') return 'hermes'
  if (raw === 'openclaw') return 'openclaw'
  if (raw === 'claude' || raw === 'claude-code' || raw === 'claude_code' || raw === 'claudecode') return 'claudecode'
  return null
}

export function getAgentGatewayConfig(agent) {
  const key = normalizeAgentName(agent)
  return key ? AGENT_CONFIG[key] : null
}

export function createAgentGatewayState(overrides = {}) {
  return {
    agent: overrides.agent || null,
    status: overrides.status || 'unknown',
    connected: Boolean(overrides.connected),
    ready: Boolean(overrides.ready),
    portListening: Boolean(overrides.portListening),
    verified: Boolean(overrides.verified),
    modelReady: overrides.modelReady ?? null,
    needsSetup: Boolean(overrides.needsSetup),
    message: overrides.message || '',
    port: overrides.port || null,
    pid: overrides.pid || null,
    error: overrides.error || null,
    checkedAt: Date.now(),
  }
}

export function isAgentGatewayUsable(state) {
  if (!state) return false
  return state.ready === true && state.connected === true && state.needsSetup !== true
}

export function isOpenClawModelConfigRequired(status) {
  if (!status) return false
  const value = typeof status === 'object' ? status : { message: String(status) }
  const text = JSON.stringify(value).toLowerCase()
  return value.needsSetup === true
    || value.needs_setup === true
    || value.status === OPENCLAW_GATEWAY_STATES.NEEDS_SETUP
    || value.code === 'OPENCLAW_MODEL_CONFIG_REQUIRED'
    || value.errorCode === 'OPENCLAW_MODEL_CONFIG_REQUIRED'
    || text.includes('openclaw_model_config_required')
    || text.includes('openclaw_minimax_api_key_required')
    || text.includes('model_config_required')
    || text.includes('model config')
    || text.includes('api key')
    || text.includes('apikey')
    || text.includes('minimax key')
    || text.includes('模型配置')
    || text.includes('未配置')
}

export function normalizeGatewayUiState(raw) {
  if (!raw) return OPENCLAW_GATEWAY_STATES.STOPPED
  if (raw.ready === true || raw.connected === true || raw.status === OPENCLAW_GATEWAY_STATES.READY) {
    return OPENCLAW_GATEWAY_STATES.READY
  }
  if (isOpenClawModelConfigRequired(raw)) {
    return OPENCLAW_GATEWAY_STATES.NEEDS_SETUP
  }
  if (raw.status === OPENCLAW_GATEWAY_STATES.STARTING) return OPENCLAW_GATEWAY_STATES.STARTING
  if (raw.status === OPENCLAW_GATEWAY_STATES.CHECKING) return OPENCLAW_GATEWAY_STATES.CHECKING
  if (raw.status === OPENCLAW_GATEWAY_STATES.ERROR || raw.error) return OPENCLAW_GATEWAY_STATES.ERROR
  if (raw.status === 'listening_unverified') return OPENCLAW_GATEWAY_STATES.ERROR
  if (raw.portListening && raw.verified) return OPENCLAW_GATEWAY_STATES.CHECKING
  return OPENCLAW_GATEWAY_STATES.STOPPED
}

export function pickAgentStatusPayload(data, agent) {
  const key = normalizeAgentName(agent)
  if (!data || typeof data !== 'object') return {}

  if (typeof data.agent === 'string' && normalizeAgentName(data.agent) === key) return data
  if (typeof data.agentName === 'string' && normalizeAgentName(data.agentName) === key) return data
  if (typeof data.agent_name === 'string' && normalizeAgentName(data.agent_name) === key) return data

  if (data[key] && typeof data[key] === 'object') return data[key]
  if (data.agents && data.agents[key] && typeof data.agents[key] === 'object') return data.agents[key]

  const nested = data.data
  if (nested && typeof nested === 'object') {
    if (typeof nested.agent === 'string' && normalizeAgentName(nested.agent) === key) return nested
    if (typeof nested.agentName === 'string' && normalizeAgentName(nested.agentName) === key) return nested
    if (typeof nested.agent_name === 'string' && normalizeAgentName(nested.agent_name) === key) return nested
    if (nested[key] && typeof nested[key] === 'object') return nested[key]
    if (nested.agents && nested.agents[key] && typeof nested.agents[key] === 'object') return nested.agents[key]
  }

  return data
}

export function getOpenClawGatewayCopy(state, errorText = '') {
  switch (state) {
    case OPENCLAW_GATEWAY_STATES.STOPPED:
      return {
        title: 'Gateway 未启动',
        desc: '请先启动 Gateway 才能使用实时聊天。',
        action: '启动 Gateway',
        canSend: false,
        showStartButton: false,
        showReconnectButton: false,
      }
    case OPENCLAW_GATEWAY_STATES.STARTING:
      return {
        title: 'Gateway 正在启动',
        desc: '正在启动 Gateway，请稍候...',
        action: '启动中...',
        canSend: false,
        showStartButton: false,
        showReconnectButton: false,
      }
    case OPENCLAW_GATEWAY_STATES.CHECKING:
      return {
        title: 'Gateway 正在检查',
        desc: 'Gateway 已启动，正在检查服务是否可用...',
        action: '重新检查',
        canSend: false,
        showStartButton: false,
        showReconnectButton: false,
      }
    case OPENCLAW_GATEWAY_STATES.NEEDS_SETUP:
      return {
        title: 'OpenClaw 模型配置未完成',
        desc: '请先到模型设置中填写 MiniMax API Key，保存并测试连接后再开始聊天。',
        action: '去模型设置',
        canSend: false,
        showStartButton: false,
        showReconnectButton: false,
        showModelConfigButton: true,
      }
    case OPENCLAW_GATEWAY_STATES.READY:
      return {
        title: '已连接',
        desc: 'Gateway 已就绪，可以开始实时聊天。',
        action: '',
        canSend: true,
        showStartButton: false,
        showReconnectButton: false,
      }
    case OPENCLAW_GATEWAY_STATES.ERROR:
    default:
      return {
        title: 'Gateway 连接异常',
        desc: errorText || 'Gateway 启动或连接失败，请重新启动。',
        action: '重新启动 Gateway',
        canSend: false,
        showStartButton: false,
        showReconnectButton: true,
      }
  }
}

export function getAgentGatewayUserMessage(state) {
  if (!state) return '正在检查网关状态...'
  if (isOpenClawModelConfigRequired(state)) return 'OpenClaw 模型配置未完成，请先到模型设置中填写 MiniMax API Key。'
  if (state.status === OPENCLAW_GATEWAY_STATES.STOPPED) return '网关未启动。'
  if (state.status === OPENCLAW_GATEWAY_STATES.STARTING) return '网关正在启动...'
  if (state.status === 'listening' || state.status === 'listening_unverified') {
    return '网关端口已监听，正在确认服务是否可用...'
  }
  if (state.status === OPENCLAW_GATEWAY_STATES.READY) return '已连接。'
  if (state.error) return `连接异常：${state.error}`
  return state.message || '正在检查网关状态...'
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 3500)

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    })

    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text }
    }

    return { ok: res.ok, status: res.status, json }
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeProbePayload(agent, payload = {}) {
  const key = normalizeAgentName(agent)
  const cfg = getAgentGatewayConfig(key)
  const source = pickAgentStatusPayload(payload, key)
  const text = String(source.error || source.message || '')
  const portListening = Boolean(
    source.portListening
    || source.listening
    || source.isListening
    || source.pid
    || source.port === cfg?.port
  )
  const verified = Boolean(source.verified || source.isVerified)
  const needsSetup = isOpenClawModelConfigRequired(source) || /OPENCLAW_MINIMAX_API_KEY_REQUIRED|api key|config|配置|未配置|needs_setup/i.test(text)
  const ready = Boolean(source.ready || source.usable || source.status === OPENCLAW_GATEWAY_STATES.READY)

  let status = 'unknown'
  if (needsSetup) status = OPENCLAW_GATEWAY_STATES.NEEDS_SETUP
  else if (ready) status = OPENCLAW_GATEWAY_STATES.READY
  else if (source.status === OPENCLAW_GATEWAY_STATES.ERROR || source.error) status = OPENCLAW_GATEWAY_STATES.ERROR
  else if (portListening) status = verified ? OPENCLAW_GATEWAY_STATES.CHECKING : 'listening_unverified'
  else status = OPENCLAW_GATEWAY_STATES.STOPPED

  return createAgentGatewayState({
    agent: key,
    port: source.port || cfg?.port || null,
    pid: source.pid || source.processId || null,
    portListening,
    verified,
    ready: ready && !needsSetup,
    connected: ready && !needsSetup,
    needsSetup,
    status,
    message: source.message || '',
    error: ready ? null : (source.error || null),
  })
}

export async function probeAgentGateway(agent, options = {}) {
  const key = normalizeAgentName(agent)
  const cfg = getAgentGatewayConfig(key)

  if (!cfg) {
    return createAgentGatewayState({
      agent,
      status: OPENCLAW_GATEWAY_STATES.ERROR,
      error: `unsupported agent: ${agent}`,
    })
  }

  try {
    const statusUrl = options.statusUrl || cfg.devStatusPath
    const result = await fetchJson(statusUrl, { timeoutMs: options.timeoutMs || 3500 })
    return normalizeProbePayload(key, result.json || {})
  } catch (err) {
    return createAgentGatewayState({
      agent: key,
      port: cfg.port,
      status: OPENCLAW_GATEWAY_STATES.ERROR,
      connected: false,
      ready: false,
      error: err && err.message ? err.message : String(err),
    })
  }
}

export async function waitForAgentGatewayReady(agent, options = {}) {
  const attempts = options.attempts || 12
  const delayMs = options.delayMs || 500
  let last = null

  for (let i = 0; i < attempts; i += 1) {
    last = await probeAgentGateway(agent, options)
    if (last.ready || last.needsSetup) return last
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  return last || createAgentGatewayState({ agent, status: OPENCLAW_GATEWAY_STATES.ERROR, error: 'probe timeout' })
}

export async function assertAgentReadyBeforeSend(agent, options = {}) {
  const state = await waitForAgentGatewayReady(agent, options)

  if (isOpenClawModelConfigRequired(state)) {
    return {
      ok: false,
      state,
      message: 'OpenClaw 模型配置未完成，请先到模型设置中填写 MiniMax API Key。',
    }
  }

  if (!isAgentGatewayUsable(state)) {
    return {
      ok: false,
      state,
      message: getAgentGatewayUserMessage(state),
    }
  }

  return {
    ok: true,
    state,
    message: 'ready',
  }
}
