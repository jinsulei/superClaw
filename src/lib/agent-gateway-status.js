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

function stableAgentIsoTime(value, fallback = null) {
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  if (fallback != null) return stableAgentIsoTime(fallback)
  return new Date().toISOString()
}

function isSensitiveAgentRunKey(key) {
  return /api[_-]?key|access[_-]?token|refresh[_-]?token|token|cookie|secret|password/i.test(String(key || ''))
}

function sanitizeAgentRunText(value) {
  return String(value ?? '').replace(
    /(fake-[a-z0-9-]*(?:api-key|token|cookie|secret|access-token|refresh-token|password)[a-z0-9-]*)/gi,
    '[REDACTED]',
  )
}

function summarizeAgentValue(value) {
  if (value == null || value === '') return ''
  const redacted = redactAgentRunPayload(value)
  const text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted)
  return sanitizeAgentRunText(text)
}

function canonicalAgentRunName(agent) {
  const raw = String(agent || '').trim().toLowerCase()
  if (raw === 'hermes') return 'hermes'
  if (raw === 'openclaw') return 'openclaw'
  if (raw === 'claude' || raw === 'claude-code' || raw === 'claude_code' || raw === 'claudecode') return 'claude_code'
  if (raw === 'codex') return 'codex'
  return raw || 'unknown'
}

function agentAdapterName(snapshot = {}) {
  const agent = canonicalAgentRunName(snapshot.agent || snapshot.agentName || snapshot.agent_name)
  if (agent === 'codex') {
    return snapshot.implemented === true ? 'codex_adapter' : 'codex_reserved'
  }
  if (agent === 'claude_code') return 'claude_code_panel_bridge'
  if (agent === 'openclaw') return 'openclaw_gateway_bridge'
  if (agent === 'hermes') return 'hermes_gateway_bridge'
  return `${agent || 'unknown'}_status_bridge`
}

function stableAgentErrorCode(error, fallback = 'AGENT_RUN_FAILED') {
  const raw = typeof error === 'object' && error
    ? (error.code || error.error_code || error.name || fallback)
    : (error || fallback)
  const code = String(raw || fallback)
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  return code || fallback
}

function agentCurrentStep(snapshot = {}) {
  if (snapshot.message) return summarizeAgentValue(snapshot.message)
  if (snapshot.error) return `Agent status error: ${summarizeAgentValue(typeof snapshot.error === 'object' ? snapshot.error.message || snapshot.error : snapshot.error)}`
  const agent = canonicalAgentRunName(snapshot.agent || snapshot.agentName || snapshot.agent_name)
  const status = normalizeAgentRunStatus(snapshot.status)
  if (status === 'running') return `${agent} is running`
  if (status === 'created') return `${agent} is starting`
  if (status === 'recovering') return `${agent} is reconnecting`
  if (status === 'cancelled') return `${agent} is stopped`
  if (status === 'blocked') return `${agent} is reserved or blocked`
  return `${agent} status is ${status}`
}

export function normalizeAgentRunStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'ready' || value === 'connected' || value === 'running' || value === 'online' || value === 'ok' || value === 'checking') return 'running'
  if (value === 'starting' || value === 'created' || value === 'initializing') return 'created'
  if (value === 'waiting_human' || value === 'waiting') return 'waiting_human'
  if (value === 'recovering' || value === 'reconnecting') return 'recovering'
  if (value === 'completed' || value === 'complete' || value === 'done' || value === 'success' || value === 'succeeded') return 'completed'
  if (value === 'failed' || value === 'error' || value === 'offline' || value === 'unreachable' || value === 'disconnected' || value === 'listening_unverified') return 'failed'
  if (value === 'stopped' || value === 'cancelled' || value === 'canceled') return 'cancelled'
  if (value === 'blocked' || value === 'reserved' || value === 'planned' || value === 'needs_setup') return 'blocked'
  return 'failed'
}

export function redactAgentRunPayload(value) {
  if (Array.isArray(value)) return value.map(item => redactAgentRunPayload(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (isSensitiveAgentRunKey(key)) return [key, '[REDACTED]']
      return [key, redactAgentRunPayload(item)]
    }))
  }
  if (typeof value === 'string') return sanitizeAgentRunText(value)
  return value
}

export function mapAgentGatewayStatusToAgentRun(statusSnapshot = {}) {
  const agentName = canonicalAgentRunName(statusSnapshot.agent || statusSnapshot.agentName || statusSnapshot.agent_name)
  const status = normalizeAgentRunStatus(statusSnapshot.status || (statusSnapshot.ready || statusSnapshot.connected || statusSnapshot.running ? 'running' : 'failed'))
  const startedAt = stableAgentIsoTime(statusSnapshot.started_at || statusSnapshot.startedAt || statusSnapshot.checkedAt || statusSnapshot.created_at)
  const completedAt = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'blocked'
    ? stableAgentIsoTime(statusSnapshot.completed_at || statusSnapshot.completedAt || statusSnapshot.checkedAt || statusSnapshot.updated_at, startedAt)
    : null
  const error = statusSnapshot.error || statusSnapshot.error_message || null
  const agentRunId = String(
    statusSnapshot.agent_run_id
    || statusSnapshot.run_id
    || statusSnapshot.runId
    || `${agentName}-${statusSnapshot.pid || statusSnapshot.task_id || statusSnapshot.taskId || 'status'}`,
  )

  return {
    agent_run_id: agentRunId,
    task_id: String(statusSnapshot.task_id || statusSnapshot.taskId || statusSnapshot.run_id || statusSnapshot.runId || `${agentName}-status-task`),
    agent_name: agentName,
    adapter_name: agentAdapterName(statusSnapshot),
    status,
    current_step: agentCurrentStep(statusSnapshot),
    heartbeat_at: status === 'running' ? stableAgentIsoTime(statusSnapshot.heartbeat_at || statusSnapshot.lastMessageAt || statusSnapshot.checkedAt, startedAt) : null,
    checkpoint_id: statusSnapshot.checkpoint_id || statusSnapshot.checkpointId || null,
    resume_supported: Boolean(statusSnapshot.resume_supported || statusSnapshot.resumeSupported),
    error_code: status === 'failed' ? stableAgentErrorCode(error) : null,
    error_message: status === 'failed' ? summarizeAgentValue(typeof error === 'object' && error ? (error.message || error) : error) : null,
    started_at: startedAt,
    completed_at: completedAt,
  }
}

export function mapAgentHeartbeatToAgentRun(heartbeat = {}) {
  return {
    ...mapAgentGatewayStatusToAgentRun({ ...heartbeat, status: 'running' }),
    status: 'running',
    heartbeat_at: stableAgentIsoTime(heartbeat.heartbeat_at || heartbeat.lastMessageAt || heartbeat.checkedAt),
    completed_at: null,
  }
}

export function mapAgentStatusToTaskEvent(statusSnapshot = {}, options = {}) {
  const agentName = canonicalAgentRunName(statusSnapshot.agent || statusSnapshot.agentName || statusSnapshot.agent_name)
  const eventType = options.event_type || options.eventType || 'agent_status_update'
  const status = normalizeAgentRunStatus(statusSnapshot.status || (statusSnapshot.connected || statusSnapshot.ready || statusSnapshot.running ? 'running' : 'failed'))
  const createdAt = stableAgentIsoTime(statusSnapshot.checkedAt || statusSnapshot.lastMessageAt || statusSnapshot.created_at)
  const agentRunId = statusSnapshot.agent_run_id || statusSnapshot.run_id || statusSnapshot.runId || `${agentName}-${statusSnapshot.pid || statusSnapshot.task_id || statusSnapshot.taskId || 'status'}`

  return {
    event_id: `evt-${eventType}-${agentRunId}`,
    task_id: String(statusSnapshot.task_id || statusSnapshot.taskId || statusSnapshot.run_id || statusSnapshot.runId || `${agentName}-status-task`),
    task_type: 'agent_status',
    event_type: eventType,
    actor: agentName,
    source: `${agentAdapterName(statusSnapshot)}.status`,
    status,
    visible_text: summarizeAgentValue(statusSnapshot.message || statusSnapshot.error?.message || `${agentName} ${eventType === 'agent_heartbeat' ? 'heartbeat' : 'status'}: ${status}`),
    raw_payload: redactAgentRunPayload({
      agent: agentName,
      status: statusSnapshot.status,
      connected: statusSnapshot.connected,
      ready: statusSnapshot.ready,
      running: statusSnapshot.running,
      portListening: statusSnapshot.portListening,
      pid: statusSnapshot.pid,
      error: statusSnapshot.error,
      checkedAt: statusSnapshot.checkedAt,
      lastMessageAt: statusSnapshot.lastMessageAt,
    }),
    visibility: eventType === 'agent_heartbeat' ? 'debug' : 'normal',
    severity: status === 'failed' || status === 'blocked' ? 'warning' : 'info',
    linked_agent_run_id: String(agentRunId),
    created_at: createdAt,
  }
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
