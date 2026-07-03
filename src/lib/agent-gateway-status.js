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
  CONFIG_MISSING: 'config_missing',
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
    gatewayReady: Boolean(overrides.gatewayReady ?? overrides.ready),
    webReady: Boolean(overrides.webReady),
    relayReady: overrides.relayReady ?? null,
    needsSetup: Boolean(overrides.needsSetup),
    configMissing: Boolean(overrides.configMissing),
    canConnectWebSocket: overrides.canConnectWebSocket ?? true,
    shouldReconnect: overrides.shouldReconnect ?? true,
    reason: overrides.reason || '',
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

export function normalizeGatewayUiState(raw) {
  if (!raw) return OPENCLAW_GATEWAY_STATES.STOPPED
  if (raw.needsSetup
    || raw.needs_setup
    || raw.configMissing
    || raw.config_missing
    || raw.status === OPENCLAW_GATEWAY_STATES.NEEDS_SETUP
    || raw.status === OPENCLAW_GATEWAY_STATES.CONFIG_MISSING) {
    return OPENCLAW_GATEWAY_STATES.NEEDS_SETUP
  }
  if (raw.ready === true || raw.connected === true || raw.status === OPENCLAW_GATEWAY_STATES.READY) {
    return OPENCLAW_GATEWAY_STATES.READY
  }
  if (raw.status === OPENCLAW_GATEWAY_STATES.STARTING) return OPENCLAW_GATEWAY_STATES.STARTING
  if (raw.status === OPENCLAW_GATEWAY_STATES.CHECKING) return OPENCLAW_GATEWAY_STATES.CHECKING
  if (raw.status === OPENCLAW_GATEWAY_STATES.ERROR || raw.error) return OPENCLAW_GATEWAY_STATES.ERROR
  if (raw.status === 'listening_unverified') return OPENCLAW_GATEWAY_STATES.ERROR
  if (raw.portListening && raw.verified) return OPENCLAW_GATEWAY_STATES.CHECKING
  return OPENCLAW_GATEWAY_STATES.STOPPED
}

export function shouldSuppressAgentGatewayReconnect(raw) {
  if (!raw) return false
  const state = normalizeGatewayUiState(raw)
  const reason = String(raw.reason || raw.code || raw.error || raw.message || '').toLowerCase()
  return state === OPENCLAW_GATEWAY_STATES.NEEDS_SETUP
    || raw.needsSetup === true
    || raw.needs_setup === true
    || raw.configMissing === true
    || raw.config_missing === true
    || raw.shouldReconnect === false
    || raw.canConnectWebSocket === false
    || reason.includes('openclaw_model_config_required')
    || reason.includes('gateway_not_started_because_config_missing')
    || reason.includes('config_missing')
    || reason.includes('needs_setup')
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
        title: '模型配置未完成',
        desc: 'OpenClaw 模型或 Key 未配置，请先完成配置。',
        action: '去配置',
        canSend: false,
        showStartButton: false,
        showReconnectButton: false,
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
  if (state.needsSetup) return '模型或网关配置未完成，请先完成配置。'
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
  const needsSetup = Boolean(
    source.needsSetup
    || source.needs_setup
    || source.configMissing
    || source.config_missing
    || source.status === OPENCLAW_GATEWAY_STATES.NEEDS_SETUP
    || source.status === OPENCLAW_GATEWAY_STATES.CONFIG_MISSING
    || /OPENCLAW_MINIMAX_API_KEY_REQUIRED|api key|config|配置|未配置|needs_setup/i.test(text)
  )
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
    gatewayReady: ready && !needsSetup,
    webReady: source.webReady === true,
    relayReady: source.relayReady ?? null,
    modelReady: source.modelReady ?? null,
    needsSetup,
    configMissing: needsSetup || source.configMissing === true || source.config_missing === true,
    canConnectWebSocket: needsSetup ? false : source.canConnectWebSocket !== false,
    shouldReconnect: needsSetup ? false : source.shouldReconnect !== false,
    reason: source.reason || source.code || '',
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

  if (state.needsSetup) {
    return {
      ok: false,
      state,
      message: '模型或网关配置未完成，当前不能发送请求。',
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
