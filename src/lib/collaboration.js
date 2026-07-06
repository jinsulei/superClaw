const TASKS_KEY = 'superclaw-collab-tasks-v1'
const PENDING_KEY = 'superclaw-collab-pending-dispatch-v1'
const MESSAGES_KEY = 'superclaw-agent-task-messages-v1'
const MEMORY_KEY = 'superclaw-shared-agent-memory-v1'
const CHECKPOINTS_KEY = 'superclaw-collab-task-checkpoints-v1'

export const SHARED_MEMORY_CONFIG = {
  enabled: true,
  store: 'local',
  portable: true,
  path: 'data/memory',
  maxRecentMessages: 50,
  maxSummaryLength: 8000,
  persistTaskContext: true,
  persistAgentMessages: true,
  sharedForAgents: ['hermes', 'openclaw', 'claude_code'],
}

export const COLLAB_TARGETS = {
  openclaw: 'openclaw',
  claudeCode: 'claude-code',
  hermes: 'hermes',
}

export const CLAUDE_CODE_MODES = {
  safe: 'safe',
  browserAutomation: 'browser_automation',
  takeover: 'takeover',
}

const CLAUDE_CODE_MODE_ALIASES = {
  safe: CLAUDE_CODE_MODES.safe,
  restricted: CLAUDE_CODE_MODES.safe,
  browser: CLAUDE_CODE_MODES.browserAutomation,
  browsermode: CLAUDE_CODE_MODES.browserAutomation,
  browserautomation: CLAUDE_CODE_MODES.browserAutomation,
  browser_automation: CLAUDE_CODE_MODES.browserAutomation,
  automation: CLAUDE_CODE_MODES.browserAutomation,
  browser_only: CLAUDE_CODE_MODES.browserAutomation,
  takeover: CLAUDE_CODE_MODES.takeover,
  full_control: CLAUDE_CODE_MODES.takeover,
}

export function normalizeClaudeCodeMode(input = {}) {
  const raw = typeof input === 'string' ? input : (input.mode || input.claudeCodeMode || input.permission_mode || input.permissionMode || '')
  const key = String(raw || CLAUDE_CODE_MODES.safe).trim().replace(/[-\s]+/g, '_').toLowerCase()
  const mode = CLAUDE_CODE_MODE_ALIASES[key] || CLAUDE_CODE_MODE_ALIASES[key.replace(/_/g, '')] || CLAUDE_CODE_MODES.safe
  const unknown = !!raw && !CLAUDE_CODE_MODE_ALIASES[key] && !CLAUDE_CODE_MODE_ALIASES[key.replace(/_/g, '')]
  if (mode === CLAUDE_CODE_MODES.takeover) {
    return { mode, permission_level: 'full_control', requires_confirmation: true, warning: unknown ? 'unknown_mode_fallback_to_safe' : null }
  }
  if (mode === CLAUDE_CODE_MODES.browserAutomation) {
    return {
      mode,
      permission_level: 'browser_only',
      requires_confirmation: false,
      single_browser: true,
      single_page: true,
      allow_popup: false,
      requires_confirmation_for_extra_page: true,
      warning: unknown ? 'unknown_mode_fallback_to_safe' : null,
    }
  }
  return { mode: CLAUDE_CODE_MODES.safe, permission_level: 'restricted', requires_confirmation: false, warning: unknown ? 'unknown_mode_fallback_to_safe' : null }
}

export function listCollaborationTasks() {
  try {
    const rows = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

export function listAgentTaskMessages(filter = {}) {
  try {
    const rows = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]')
    const list = Array.isArray(rows) ? rows : []
    return list.filter(item => {
      if (filter.toAgent && item.to_agent !== filter.toAgent) return false
      if (filter.fromAgent && item.from_agent !== filter.fromAgent) return false
      if (filter.taskId && item.task_id !== filter.taskId) return false
      if (filter.messageType && item.message_type !== filter.messageType) return false
      return true
    })
  } catch {
    return []
  }
}

export function listSharedMemory(filter = {}) {
  try {
    const rows = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]')
    const list = Array.isArray(rows) ? rows : []
    return list.filter(item => {
      if (filter.sessionId && item.session_id !== filter.sessionId) return false
      if (filter.taskId && item.task_id !== filter.taskId) return false
      if (filter.agent && item.from_agent !== filter.agent && item.to_agent !== filter.agent) return false
      return true
    })
  } catch {
    return []
  }
}

export function listTaskCheckpoints(filter = {}) {
  try {
    const taskId = typeof filter === 'string' ? filter : (filter?.taskId || filter?.task_id || '')
    const rows = JSON.parse(localStorage.getItem(CHECKPOINTS_KEY) || '[]')
    const list = Array.isArray(rows) ? rows : []
    return taskId ? list.filter(item => item?.task_id === taskId) : list
  } catch {
    return []
  }
}

export function createTaskCheckpoint(input = {}) {
  const now = input.created_at || input.timestamp || new Date().toISOString()
  const taskId = input.task_id || input.taskId || input.snapshot?.task?.task_id || input.snapshot?.pending_dispatch?.taskId || ''
  const agents = normalizeCheckpointAgents(input)
  const checkpoint = {
    checkpoint_id: input.checkpoint_id || input.checkpointId || buildCheckpointId(taskId, now),
    task_id: taskId,
    snapshot: redactSensitiveValue(input.snapshot || buildCheckpointSnapshot(input, taskId, agents)),
    agents,
    status: normalizeWatchTaskStatus(input.status || input.snapshot?.task?.status || 'running'),
    created_at: now,
    timestamp: input.timestamp || now,
    task_events: [createTaskEvent({
      task_id: taskId,
      task_type: 'collaboration',
      event_type: 'agent_checkpoint_saved',
      actor: input.actor || input.requested_by || COLLAB_TARGETS.hermes,
      source: 'collaboration.checkpoint',
      status: 'recovering',
      visible_text: input.visible_text || `Checkpoint saved for ${taskId || 'collaboration task'}`,
      raw_payload: {
        checkpoint_id: input.checkpoint_id || input.checkpointId || buildCheckpointId(taskId, now),
        agents,
        status: input.status || input.snapshot?.task?.status || 'running',
      },
      visibility: 'debug',
      severity: 'info',
      created_at: now,
    })],
  }
  const rows = listTaskCheckpoints().filter(item => item.checkpoint_id !== checkpoint.checkpoint_id)
  rows.unshift(checkpoint)
  localStorage.setItem(CHECKPOINTS_KEY, JSON.stringify(rows.slice(0, 200)))
  return checkpoint
}

export function resumeTaskFromCheckpoint(input = {}) {
  const checkpoint = input.checkpoint || findCheckpoint(input.checkpoint_id || input.checkpointId, input.task_id || input.taskId)
  const taskId = input.task_id || input.taskId || checkpoint?.task_id || ''
  const checkpointId = input.checkpoint_id || input.checkpointId || checkpoint?.checkpoint_id || ''
  const targetAgent = normalizeAgentId(input.target_agent || input.targetAgent || input.agent || input.target || checkpoint?.agents?.[0] || COLLAB_TARGETS.hermes)
  const createdAt = input.created_at || input.requested_at || new Date().toISOString()
  const resumeTask = {
    task_id: taskId,
    checkpoint_id: checkpointId,
    target_agent: targetAgent,
    agent: targetAgent,
    target: targetAgent,
    status: 'running',
    resume_from: checkpointId,
    created_at: createdAt,
    task_events: [createTaskEvent({
      task_id: taskId,
      task_type: 'collaboration',
      event_type: 'agent_resume_requested',
      actor: input.requested_by || input.actor || COLLAB_TARGETS.hermes,
      source: 'collaboration.resume_task',
      status: 'recovering',
      visible_text: input.visible_text || `Resume ${targetLabel(targetAgent)} from checkpoint`,
      raw_payload: {
        checkpoint_id: checkpointId,
        target_agent: targetAgent,
      },
      visibility: 'normal',
      severity: 'warning',
      created_at: createdAt,
    })],
  }
  if (input.dispatch !== false && taskId && targetAgent) {
    resumeTask.pending_dispatch = setPendingDispatch({
      target: targetAgent,
      taskId,
      sessionId: input.session_id || input.sessionId || checkpoint?.snapshot?.task?.session_id || checkpoint?.snapshot?.context?.session_id,
      stage: 'resume',
      title: input.title || `Resume ${targetLabel(targetAgent)} task`,
      message: input.message || `Resume task ${taskId} from checkpoint ${checkpointId}`,
      context: checkpoint?.snapshot?.context || checkpoint?.snapshot?.task_request?.context || checkpoint?.snapshot || {},
      artifacts: checkpoint?.snapshot?.artifacts || checkpoint?.snapshot?.task_request?.artifacts || [],
      fromAgent: input.requested_by || input.actor || COLLAB_TARGETS.hermes,
      requires_confirmation: !!input.requires_confirmation,
    })
  }
  return resumeTask
}

export function evaluateCollaborationWatchdog(input = {}) {
  const taskId = input.task_id || input.taskId || input.pending_dispatch?.taskId || input.pending_dispatch?.task_id || ''
  const status = normalizeWatchTaskStatus(input.status || input.task?.status || 'running')
  const nowMs = toTimestamp(input.now, Date.now())
  const staleAfterMs = Number(input.stale_after_ms || input.staleAfterMs || 300000)
  let reason = 'healthy'
  let shouldRecover = false
  let recoveryStatus = status

  if (status === 'completed' || status === 'failed' || status === 'blocked') {
    reason = 'terminal_state'
  } else if (status === 'waiting_human') {
    reason = 'waiting_human'
  } else if (String(input.status || '').trim() === 'offline') {
    reason = 'agent_offline'
    shouldRecover = true
    recoveryStatus = 'recovering'
  } else if (String(input.status || '').trim() === 'stuck') {
    reason = 'running_timeout'
    shouldRecover = true
    recoveryStatus = 'recovering'
  } else if (isPendingDispatchStale(input.pending_dispatch, nowMs, staleAfterMs)) {
    reason = 'pending_dispatch_timeout'
    shouldRecover = true
    recoveryStatus = 'recovering'
  } else if (isAgentOffline(input.agent_status)) {
    reason = 'agent_offline'
    shouldRecover = true
    recoveryStatus = 'recovering'
  } else if (isHeartbeatStale(input.last_heartbeat || input.heartbeat_at || input.agent_status?.heartbeat_at || input.agent_status?.last_seen_at, nowMs, staleAfterMs)) {
    reason = 'running_timeout'
    shouldRecover = true
    recoveryStatus = 'recovering'
  }

  return {
    task_id: taskId,
    status: recoveryStatus,
    reason,
    should_recover: shouldRecover,
    recovery_status: shouldRecover ? 'recovering' : status,
    checkpoint_required: shouldRecover,
    task_events: [createTaskEvent({
      task_id: taskId,
      task_type: 'collaboration',
      event_type: shouldRecover ? 'task_recovering' : 'agent_status_update',
      actor: input.agent_status?.agent || input.agent || 'system',
      source: 'collaboration.watchdog',
      status: shouldRecover ? 'recovering' : status,
      visible_text: shouldRecover ? `Collaboration watchdog detected ${reason}` : `Collaboration watchdog status: ${reason}`,
      raw_payload: {
        reason,
        status,
        recovery_status: shouldRecover ? 'recovering' : status,
        agent_status: input.agent_status || null,
      },
      visibility: shouldRecover ? 'normal' : 'debug',
      severity: shouldRecover ? 'warning' : 'info',
      created_at: new Date(nowMs).toISOString(),
    })],
  }
}

export function createTaskHeartbeat(input = {}) {
  const taskId = input.task_id || input.taskId || ''
  const sessionId = input.session_id || input.sessionId || getDefaultSessionId()
  const agent = normalizeAgentId(input.agent || input.agent_name || input.agentName || input.from_agent || input.fromAgent || COLLAB_TARGETS.hermes)
  const heartbeatAt = normalizeHeartbeatTimestamp(input.heartbeat_at || input.heartbeatAt || input.last_heartbeat || input.lastHeartbeat || input.checkedAt || input.lastMessageAt)
  const status = normalizeTaskEventStatus(input.status || 'running')
  const event = createTaskEvent({
    task_id: taskId,
    session_id: sessionId,
    task_type: 'collaboration',
    event_type: 'agent_heartbeat',
    actor: agent,
    source: 'collaboration.heartbeat',
    status,
    visible_text: input.visible_text || `${targetLabel(agent)} heartbeat`,
    raw_payload: {
      session_id: sessionId,
      agent,
      status,
      heartbeat_at: heartbeatAt,
      message: input.message || null,
      token: input.token,
      apiKey: input.apiKey,
      secret: input.secret,
      cookie: input.cookie,
    },
    visibility: 'debug',
    severity: 'info',
    created_at: heartbeatAt,
  })
  return {
    task_id: taskId,
    session_id: sessionId,
    agent,
    agent_name: agent,
    status,
    heartbeat_at: heartbeatAt,
    task_events: [event],
  }
}

export function buildTaskContext(input = {}) {
  const sessionId = input.session_id || input.sessionId || input.session?.id || getDefaultSessionId()
  const taskId = input.task_id || input.taskId || ''
  const base = normalizeContext(input.context || {})
  const history = listAgentTaskMessages({ taskId }).slice(0, SHARED_MEMORY_CONFIG.maxRecentMessages)
  const recent = base.recent_messages.length ? base.recent_messages : history.map(item => ({
    from_agent: item.from_agent,
    to_agent: item.to_agent,
    message_type: item.message_type,
    status: item.status,
    title: item.title,
    content: item.content,
    created_at: item.created_at,
  }))
  const artifacts = mergeArtifacts(base.artifacts, input.artifacts)
  return {
    summary: clampText(base.summary || input.summary || shortGoal(input.content || input.title || taskId, 120), SHARED_MEMORY_CONFIG.maxSummaryLength),
    recent_messages: recent.slice(0, SHARED_MEMORY_CONFIG.maxRecentMessages),
    important_facts: Array.isArray(base.important_facts) ? base.important_facts.slice(0, 100) : [],
    artifacts,
    session_id: sessionId,
    task_id: taskId,
  }
}

export function saveAgentTaskMessage(message = {}) {
  const now = new Date().toISOString()
  const taskId = message.task_id || message.taskId || `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const sessionId = message.session_id || message.sessionId || getDefaultSessionId()
  const fromAgent = normalizeAgentId(message.from_agent || message.fromAgent || COLLAB_TARGETS.hermes)
  const toAgent = normalizeAgentId(message.to_agent || message.toAgent || COLLAB_TARGETS.hermes)
  const isClaudeMessage = fromAgent === COLLAB_TARGETS.claudeCode || toAgent === COLLAB_TARGETS.claudeCode || !!message.mode || !!message.claudeCodeMode
  const modeInfo = isClaudeMessage ? normalizeClaudeCodeMode(message) : null
  const artifacts = normalizeArtifacts(message.artifacts)
  const context = buildTaskContext({ ...message, task_id: taskId, session_id: sessionId, artifacts })
  const row = {
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: message.parent_task_id || message.parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    message_type: message.message_type || message.messageType || (message.memory_update ? 'memory_update' : 'task_result'),
    mode: modeInfo?.mode || message.mode || null,
    permission_level: modeInfo?.permission_level || message.permission_level || message.permissionLevel || null,
    requires_confirmation: modeInfo ? !!modeInfo.requires_confirmation : !!(message.requires_confirmation || message.requiresConfirmation),
    mode_warning: modeInfo?.warning || message.mode_warning || message.modeWarning || null,
    tool: message.tool || null,
    status: message.status || 'completed',
    title: message.title || shortGoal(message.content || taskId),
    content: String(message.content || ''),
    context,
    artifacts,
    created_at: message.created_at || now,
    updated_at: now,
  }
  row.task_events = buildTaskEventsForAgentTaskMessage(row)
  const rows = listAgentTaskMessages()
    .filter(item => !(item.task_id === row.task_id && item.message_type === row.message_type && item.from_agent === row.from_agent && item.content === row.content))
  rows.unshift(row)
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(rows.slice(0, 200)))
  saveSharedMemoryEntry(row)
  window.dispatchEvent(new CustomEvent('superclaw-agent-task-message', { detail: row }))
  return row
}

export function createTaskRequest({ fromAgent, toAgent, title, content, parentTaskId, taskId, sessionId, context, artifacts, mode, permission_level, permissionLevel, requires_confirmation, requiresConfirmation } = {}) {
  return saveAgentTaskMessage({
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    mode,
    permission_level: permission_level || permissionLevel,
    requires_confirmation: requires_confirmation ?? requiresConfirmation,
    message_type: 'task_request',
    status: 'pending',
    title,
    content,
    context,
    artifacts,
  })
}

export function createTaskProgress({ fromAgent, toAgent, title, content, parentTaskId, taskId, sessionId, context, artifacts, mode, permission_level, permissionLevel, requires_confirmation, requiresConfirmation } = {}) {
  return saveAgentTaskMessage({
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    mode,
    permission_level: permission_level || permissionLevel,
    requires_confirmation: requires_confirmation ?? requiresConfirmation,
    message_type: 'task_progress',
    status: 'running',
    title,
    content,
    context,
    artifacts,
  })
}

export function createTaskResult({ fromAgent, toAgent, title, content, parentTaskId, taskId, sessionId, context, artifacts, failed = false, tool = null, mode, permission_level, permissionLevel, requires_confirmation, requiresConfirmation } = {}) {
  return saveAgentTaskMessage({
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    mode,
    permission_level: permission_level || permissionLevel,
    requires_confirmation: requires_confirmation ?? requiresConfirmation,
    message_type: failed ? 'task_error' : 'task_result',
    tool,
    status: failed ? 'failed' : 'completed',
    title,
    content,
    context,
    artifacts,
  })
}

export function createTaskDelegate({ fromAgent, toAgent = COLLAB_TARGETS.hermes, title, content, parentTaskId, taskId, sessionId, context, artifacts, mode, permission_level, permissionLevel, requires_confirmation, requiresConfirmation } = {}) {
  return saveAgentTaskMessage({
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    mode,
    permission_level: permission_level || permissionLevel,
    requires_confirmation: requires_confirmation ?? requiresConfirmation,
    message_type: 'task_delegate',
    status: 'delegated',
    title,
    content,
    context,
    artifacts,
  })
}

export function saveCollaborationTask(task) {
  const rows = listCollaborationTasks().filter(item => item.id !== task.id)
  rows.unshift(task)
  localStorage.setItem(TASKS_KEY, JSON.stringify(rows.slice(0, 100)))
  return task
}

export function updateCollaborationTask(id, patch = {}) {
  const rows = listCollaborationTasks()
  const idx = rows.findIndex(item => item.id === id)
  if (idx < 0) return null
  rows[idx] = { ...rows[idx], ...patch, updatedAt: Date.now() }
  localStorage.setItem(TASKS_KEY, JSON.stringify(rows.slice(0, 100)))
  return rows[idx]
}

export function createCollaborationTask(input = {}) {
  const goal = String(input.goal || '').trim()
  const createdAt = Date.now()
  const claudeMode = normalizeClaudeCodeMode(input.claudeCodeMode || input.mode || CLAUDE_CODE_MODES.safe)
  const sessionId = input.session_id || input.sessionId || getDefaultSessionId()
  const context = buildTaskContext({ ...input, session_id: sessionId, content: goal })
  const task = {
    id: `collab-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    session_id: sessionId,
    goal,
    title: input.title || shortGoal(goal),
    source: input.source || COLLAB_TARGETS.hermes,
    executor: input.executor || COLLAB_TARGETS.openclaw,
    reviewer: input.reviewer || COLLAB_TARGETS.claudeCode,
    claudeCodeMode: claudeMode.mode,
    claudeCodePermissionLevel: claudeMode.permission_level,
    claudeCodeRequiresConfirmation: claudeMode.requires_confirmation,
    context,
    artifacts: normalizeArtifacts(input.artifacts),
    plan: Array.isArray(input.plan) && input.plan.length ? input.plan : splitCollaborationTask(goal, input),
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
  }
  return saveCollaborationTask(task)
}

export function getDefaultSessionId() {
  try {
    const key = 'superclaw-active-agent-session-id'
    let current = localStorage.getItem(key)
    if (!current) {
      current = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem(key, current)
    }
    return current
  } catch {
    return `session-${Date.now().toString(36)}`
  }
}

function normalizeAgentId(agent) {
  const value = String(agent || '').trim()
  if (value === COLLAB_TARGETS.claudeCode || value === 'claude_code' || value === 'claudeCode') return COLLAB_TARGETS.claudeCode
  if (value === COLLAB_TARGETS.openclaw) return COLLAB_TARGETS.openclaw
  if (value === COLLAB_TARGETS.hermes) return COLLAB_TARGETS.hermes
  return value || COLLAB_TARGETS.hermes
}

function normalizeCheckpointAgents(input = {}) {
  const raw = [
    ...(Array.isArray(input.agents) ? input.agents : []),
    input.agent,
    input.target_agent,
    input.targetAgent,
    input.from_agent,
    input.fromAgent,
    input.to_agent,
    input.toAgent,
    input.snapshot?.agent_status?.agent,
    input.snapshot?.pending_dispatch?.target,
    input.snapshot?.task?.target,
  ]
  const seen = new Set()
  return raw
    .map(item => normalizeAgentId(item))
    .filter(item => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function buildCheckpointSnapshot(input = {}, taskId = '', agents = []) {
  return {
    task: {
      task_id: taskId,
      status: normalizeWatchTaskStatus(input.status || 'running'),
      stage: input.stage || input.pending_dispatch?.stage || null,
      target: input.target || input.target_agent || agents[0] || null,
    },
    agent_status: input.agent_status || {
      agent: agents[0] || input.agent || null,
      status: input.agent_status?.status || input.status || 'running',
      heartbeat_at: input.heartbeat_at || input.last_heartbeat || null,
    },
    pending_dispatch: input.pending_dispatch || null,
  }
}

function buildCheckpointId(taskId, createdAt) {
  const normalizedTask = String(taskId || 'task').replace(/[^a-z0-9_-]+/gi, '-')
  const normalizedTime = String(createdAt || new Date().toISOString()).replace(/[^a-z0-9]+/gi, '-').replace(/-+$/g, '')
  return `checkpoint-${normalizedTask}-${normalizedTime}`
}

function findCheckpoint(checkpointId, taskId) {
  const rows = listTaskCheckpoints(taskId || '')
  if (checkpointId) return rows.find(item => item.checkpoint_id === checkpointId) || null
  return rows[0] || null
}

function normalizeWatchTaskStatus(status) {
  const value = String(status || '').trim()
  if (['created', 'running', 'waiting_human', 'recovering', 'completed', 'failed', 'blocked'].includes(value)) return value
  if (value === 'pending' || value === 'draft') return 'created'
  if (value === 'stuck' || value === 'offline' || value === 'checkpointed' || value === 'resumed') return 'running'
  return 'running'
}

function isTerminalWatchStatus(status) {
  const value = normalizeWatchTaskStatus(status)
  return value === 'completed' || value === 'failed' || value === 'blocked'
}

function toTimestamp(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime()
  const parsed = Date.parse(String(value || ''))
  return Number.isNaN(parsed) ? fallback : parsed
}

function isPendingDispatchStale(pending, nowMs, staleAfterMs) {
  if (!pending) return false
  const createdAt = toTimestamp(pending.createdAt || pending.created_at || pending.timestamp, nowMs)
  return nowMs - createdAt >= staleAfterMs
}

function isHeartbeatStale(value, nowMs, staleAfterMs) {
  if (!value) return false
  const heartbeatAt = toTimestamp(value, nowMs)
  return nowMs - heartbeatAt >= staleAfterMs
}

function isAgentOffline(agentStatus = {}) {
  const status = String(agentStatus?.status || '').trim().toLowerCase()
  return ['offline', 'failed', 'error', 'unreachable', 'disconnected'].includes(status)
}

export function shortGoal(text, maxLen = 24) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return '协作任务'
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw
}

export function targetLabel(target) {
  if (target === COLLAB_TARGETS.openclaw) return 'OpenClaw'
  if (target === COLLAB_TARGETS.claudeCode) return 'Claude Code'
  if (target === COLLAB_TARGETS.hermes) return 'Hermes'
  return target || 'Agent'
}

function hasDesktopGoal(text) {
  const raw = String(text || '')
  return /(桌面端|客户端|本地应用|应用程序|\bapp\b|抖音|快手|小红书|飞书|钉钉|微信|QQ)/i.test(raw)
}

function hasRecurringGoal(text) {
  const raw = String(text || '')
  return /(每\s*\d+\s*(秒|分钟|小时|天)|定时|循环|轮询|持续|一直|自动换)/i.test(raw)
}

function hasCodeGoal(text) {
  const raw = String(text || '')
  return /(代码|源码|文件|修复|修改|构建|打包|测试|接口|报错|bug|编译|仓库|git)/i.test(raw)
}

function hasVisionGoal(text) {
  const raw = String(text || '')
  return /(图片|截图|画面|识别|红框|粘贴|视觉|图里|图中)/i.test(raw)
}

export function splitCollaborationTask(goal, input = {}) {
  const raw = String(goal || '').trim()
  const executor = targetLabel(input.executor || COLLAB_TARGETS.openclaw)
  const reviewer = targetLabel(input.reviewer || COLLAB_TARGETS.claudeCode)
  const steps = [
    `确认目标和上下文：读取当前会话、项目路径、已有配置和用户明确限制，先复述要解决的问题。`,
  ]

  if (hasDesktopGoal(raw)) {
    steps.push('桌面端优先：先枚举并激活用户已打开的本地 App 窗口，必要时截图读取画面；如果只在托盘/后台发现痕迹，不要判定未打开，先要求恢复/激活可见窗口，再决定是否网页兜底。')
  }
  if (hasVisionGoal(raw)) {
    steps.push('图片/截图处理：把粘贴或上传的图片作为视觉输入读取，提取关键文字、按钮、错误和用户标注区域。')
  }
  if (hasCodeGoal(raw)) {
    steps.push('代码与文件处理：定位相关源码/配置，最小范围修改，避免改动无关文件或覆盖用户本地配置。')
  }
  if (hasRecurringGoal(raw)) {
    steps.push('持续/定时处理：先跑通一次完整流程并回报，再判断是否需要后台定时任务或轮询执行器。')
  }

  steps.push(`${executor} 执行：按子任务逐项完成，并输出修改文件、命令、截图/日志或失败原因。`)
  steps.push(`${reviewer} 验收：对照验收标准复核，明确通过/不通过/需要补充。`)
  steps.push('Hermes 终审：读取执行和验收结果，给出最终结论、残留风险和下一步建议。')
  return steps
}

function renderTaskPlan(task) {
  const plan = Array.isArray(task.plan) && task.plan.length ? task.plan : splitCollaborationTask(task.goal, task)
  return plan.map((item, index) => `${index + 1}. ${item}`).join('\n')
}

export function buildExecutionBrief(task) {
  const executor = targetLabel(task.executor)
  const reviewer = targetLabel(task.reviewer)
  const desktopGoal = hasDesktopGoal(task.goal)
  const recurringGoal = hasRecurringGoal(task.goal)
  const executionKickoff = []
  if (task.executor === COLLAB_TARGETS.openclaw) {
    executionKickoff.push(
      '## 执行启动要求',
      '- 这是一张执行任务单，不是咨询问题。收到后必须立即开始执行，不能只回复“我看看”“我来处理”。',
      '- 如果当前工具无法完成，必须明确说明缺少哪个工具/插件/权限，以及下一步需要用户如何授权或补齐。',
    )
    if (desktopGoal) {
      executionKickoff.push(
        '- 本任务明确涉及桌面端/客户端/本地 App。第一步必须尝试调用 desktop_control，先 action=list_windows 查找目标窗口，再 activate 目标窗口。',
        '- 不要优先改用浏览器，也不要把 <tool_call>、XML 或伪工具调用当作普通文字输出。',
        '- 如果目标是抖音/快手/小红书等桌面客户端，优先操作用户已经打开的桌面客户端；任务栏托盘里有图标但没有展开窗口时，不能判定“未打开”，应说明当前桌面工具只能枚举可见窗口，并让用户恢复/激活主窗口后继续。',
        '- 只有桌面客户端确实无法激活，且用户同意网页兜底时，才改用浏览器。浏览器自动化必须复用同一个专用窗口/标签，禁止反复打开多个浏览器或多个独立页面。',
        '- 如果任务需要读取画面中的价格、数量、直播间信息，激活窗口后必须调用 desktop_control 的 action=screenshot，并基于返回的图片结果继续分析；如果截图失败，明确说明失败原因，不能编造采集结果。',
      )
    }
    if (recurringGoal) {
      executionKickoff.push(
        '- 本任务包含定时/循环要求。先完成一次可执行流程验证并回报结果；持续每 N 分钟执行需要后台定时执行器支持，不能只靠一次聊天消息长期运行。',
      )
    }
    executionKickoff.push('')
  }
  return [
    '# Hermes 协作任务单',
    '',
    `任务编号：${task.id}`,
    `执行方：${executor}`,
    `验收方：${reviewer}`,
    `最终审核：Hermes`,
    '',
    '## 目标',
    task.goal || '（未填写）',
    '',
    '## Hermes 拆分的子任务',
    renderTaskPlan(task),
    '',
    ...executionKickoff,
    '## 执行规则',
    '1. 先读取当前上下文和相关文件，再动手。',
    '2. 只做本任务相关改动，不要改无关文件。',
    '3. 如果需要浏览器、桌面控制、截图识别、文件读写或命令执行，只在用户意图明确时调用对应能力。',
    '4. 如果缺少工具、插件、skills 或权限，先说明缺什么和风险，再询问是否安装或启用。',
    '5. 做完后必须给出可验收结果，不要停在“我看看”。',
    '',
    '## 交接格式',
    '- 完成内容：',
    '- 修改文件：',
    '- 运行命令 / 测试结果：',
    '- 发现的问题：',
    '- 需要 Hermes 最终审核的点：',
  ].join('\n')
}

export function buildReviewBrief(task, executionSummary = '') {
  return [
    '# Hermes 协作验收单',
    '',
    `任务编号：${task.id}`,
    `执行方：${targetLabel(task.executor)}`,
    `验收方：${targetLabel(task.reviewer)}`,
    '',
    '## 原始目标',
    task.goal || '（未填写）',
    '',
    '## Hermes 拆分的子任务',
    renderTaskPlan(task),
    '',
    '## 执行方交接',
    executionSummary || '请读取执行会话中的交接内容。',
    '',
    '## 验收要求',
    '1. 对照目标检查是否完成。',
    '2. 检查是否有明显回归、漏改、路径错误、配置污染或密钥泄露。',
    '3. 明确给出：通过 / 不通过 / 需要补充修改。',
    '4. 最后交给 Hermes 做最终审核。',
  ].join('\n')
}

export function setPendingDispatch(dispatch) {
  const modeInfo = dispatch?.target === COLLAB_TARGETS.claudeCode ? normalizeClaudeCodeMode(dispatch) : null
  const sessionId = dispatch?.session_id || dispatch?.sessionId || getDefaultSessionId()
  const context = buildTaskContext({ ...dispatch, session_id: sessionId, task_id: dispatch?.taskId || dispatch?.task_id, content: dispatch?.message || dispatch?.content })
  const taskId = dispatch?.taskId || dispatch?.task_id || ''
  const payload = {
    ...dispatch,
    taskId,
    session_id: sessionId,
    context,
    artifacts: normalizeArtifacts(dispatch?.artifacts),
    mode: modeInfo?.mode || dispatch?.mode,
    permission_level: modeInfo?.permission_level || dispatch?.permission_level,
    requires_confirmation: modeInfo ? !!modeInfo.requires_confirmation : !!dispatch?.requires_confirmation,
    mode_warning: modeInfo?.warning || dispatch?.mode_warning || null,
    createdAt: Date.now(),
  }
  payload.task_events = buildTaskEventsForPendingDispatch(payload)
  if (taskId) {
    const checkpoint = createTaskCheckpoint({
      task_id: taskId,
      agents: [payload.target],
      status: 'running',
      stage: payload.stage,
      actor: payload.fromAgent || payload.from_agent || COLLAB_TARGETS.hermes,
      created_at: new Date(payload.createdAt).toISOString(),
      visible_text: `Checkpoint saved before dispatch to ${targetLabel(payload.target)}`,
      snapshot: {
        task: {
          task_id: taskId,
          session_id: sessionId,
          status: 'running',
          stage: payload.stage || null,
          target: payload.target || null,
        },
        agent_status: {
          agent: payload.target || null,
          status: 'running',
          heartbeat_at: null,
        },
        pending_dispatch: {
          taskId,
          target: payload.target || null,
          stage: payload.stage || null,
          title: payload.title || null,
          message: payload.message || null,
          createdAt: payload.createdAt,
        },
        context,
        artifacts: payload.artifacts,
      },
    })
    payload.checkpoint_id = checkpoint.checkpoint_id
  }
  const queue = readPendingQueue()
    .filter(item => !(item?.taskId === payload.taskId && item?.target === payload.target && item?.stage === payload.stage))
  queue.push(payload)
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue.slice(-20)))
  return payload
}

function buildTaskEventsForAgentTaskMessage(row = {}) {
  const primary = taskEventTypeForMessage(row.message_type)
  const events = []
  if (primary) {
    events.push(createCollaborationTaskEvent(row, {
      eventType: primary,
      status: taskEventStatusForMessage(row.message_type, row.status),
      actor: row.from_agent,
    }))
  }
  if (row.requires_confirmation) {
    events.push(createCollaborationTaskEvent(row, {
      eventType: 'approval_required',
      status: 'waiting_human',
      actor: row.from_agent || 'system',
    }))
  }
  return events
}

function buildTaskEventsForPendingDispatch(payload = {}) {
  const taskId = payload.taskId || payload.task_id || ''
  const actor = normalizeAgentId(payload.fromAgent || payload.from_agent || COLLAB_TARGETS.hermes)
  const createdAt = new Date(payload.createdAt || Date.now()).toISOString()
  return [createTaskEvent({
    task_id: taskId,
    task_type: 'collaboration',
    event_type: 'agent_command_sent',
    actor,
    source: 'collaboration.pending_dispatch',
    status: 'running',
    visible_text: payload.title || payload.message || `Dispatch to ${payload.target || 'agent'}`,
    raw_payload: {
      taskId,
      target: payload.target || null,
      stage: payload.stage || null,
      title: payload.title || null,
      message: payload.message || null,
      mode: payload.mode || null,
      permission_level: payload.permission_level || null,
      requires_confirmation: !!payload.requires_confirmation,
    },
    visibility: 'normal',
    severity: 'info',
    created_at: createdAt,
  })]
}

function taskEventTypeForMessage(messageType) {
  if (messageType === 'task_request') return 'task_created'
  if (messageType === 'task_progress') return 'task_progress'
  if (messageType === 'task_result') return 'task_completed'
  if (messageType === 'task_error') return 'task_failed'
  if (messageType === 'task_delegate') return 'agent_command_sent'
  return ''
}

function taskEventStatusForMessage(messageType, status) {
  if (messageType === 'task_request') return 'created'
  if (messageType === 'task_progress') return 'running'
  if (messageType === 'task_result') return 'completed'
  if (messageType === 'task_error') return 'failed'
  if (messageType === 'task_delegate') return 'running'
  return normalizeTaskEventStatus(status)
}

function normalizeTaskEventStatus(status) {
  const value = String(status || '').trim()
  if (['created', 'running', 'waiting_human', 'completed', 'failed', 'blocked'].includes(value)) return value
  if (value === 'pending') return 'created'
  if (value === 'delegated' || value === 'dispatched') return 'running'
  return 'running'
}

function createCollaborationTaskEvent(row, options = {}) {
  return createTaskEvent({
    task_id: row.task_id,
    task_type: 'collaboration',
    event_type: options.eventType,
    actor: options.actor || row.from_agent || 'system',
    source: 'collaboration.local_message',
    status: options.status || normalizeTaskEventStatus(row.status),
    visible_text: buildTaskEventVisibleText(row),
    raw_payload: {
      session_id: row.session_id,
      parent_task_id: row.parent_task_id,
      from_agent: row.from_agent,
      to_agent: row.to_agent,
      message_type: row.message_type,
      status: row.status,
      title: row.title,
      content: row.content,
      mode: row.mode,
      permission_level: row.permission_level,
      requires_confirmation: row.requires_confirmation,
      tool: row.tool,
      context: row.context,
      artifacts: row.artifacts,
    },
    visibility: row.requires_confirmation && options.eventType === 'approval_required' ? 'normal' : 'debug',
    severity: row.message_type === 'task_error' ? 'error' : row.requires_confirmation ? 'warning' : 'info',
    created_at: row.created_at || new Date().toISOString(),
  })
}

function createTaskEvent(input = {}) {
  return {
    event_id: `evt-${String(input.event_type || 'task_event').replace(/[^a-z0-9_]+/gi, '-')}-${String(input.task_id || Date.now()).replace(/[^a-z0-9_-]+/gi, '-')}`,
    task_id: input.task_id || '',
    ...(input.session_id ? { session_id: input.session_id } : {}),
    task_type: input.task_type || 'collaboration',
    event_type: input.event_type,
    actor: input.actor || 'system',
    source: input.source || 'collaboration',
    status: input.status || 'running',
    visible_text: redactSensitiveValue(String(input.visible_text || '').trim() || 'Task event'),
    raw_payload: redactSensitiveValue(input.raw_payload || {}),
    visibility: input.visibility || 'debug',
    severity: input.severity || 'info',
    created_at: input.created_at || new Date().toISOString(),
  }
}

function normalizeHeartbeatTimestamp(value) {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

function buildTaskEventVisibleText(row = {}) {
  const title = String(row.title || '').trim()
  const content = String(row.content || '').trim()
  const text = title && content ? `${title}: ${content}` : title || content || row.message_type || 'Task event'
  return clampText(text, 500)
}

function redactSensitiveValue(value) {
  if (Array.isArray(value)) return value.map(item => redactSensitiveValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (isSensitiveKey(key)) return [key, '[REDACTED]']
      return [key, redactSensitiveValue(item)]
    }))
  }
  if (typeof value === 'string') {
    return value
      .replace(/fake-(?:api-key|token|cookie|secret|access-token|refresh-token|password)-should-be-redacted/gi, '[REDACTED]')
      .replace(/\b(?:sk|sk-proj)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, 'Bearer [REDACTED]')
  }
  return value
}

function isSensitiveKey(key) {
  return /api_key|access_token|refresh_token|token|cookie|secret|password/i.test(String(key || ''))
}

function normalizeContext(context = {}) {
  const value = context && typeof context === 'object' ? context : {}
  return {
    summary: clampText(value.summary || '', SHARED_MEMORY_CONFIG.maxSummaryLength),
    recent_messages: Array.isArray(value.recent_messages) ? value.recent_messages.slice(0, SHARED_MEMORY_CONFIG.maxRecentMessages) : [],
    important_facts: Array.isArray(value.important_facts) ? value.important_facts : [],
    artifacts: normalizeArtifacts(value.artifacts),
  }
}

function normalizeArtifacts(input = []) {
  const list = Array.isArray(input) ? input : []
  return list
    .filter(Boolean)
    .map(item => {
      const rawPath = String(item.path || item.relativePath || '').replace(/\\/g, '/')
      return {
        type: item.type || 'file',
        path: stripAbsolutePath(rawPath),
        text: item.text || item.content || '',
        created_at: item.created_at || item.createdAt || new Date().toISOString(),
      }
    })
}

function mergeArtifacts(...groups) {
  const seen = new Set()
  const merged = []
  for (const item of groups.flatMap(group => normalizeArtifacts(group))) {
    const key = `${item.type}:${item.path}:${item.text.slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged.slice(0, 100)
}

function stripAbsolutePath(path) {
  const raw = String(path || '')
  if (!raw) return ''
  const normalized = raw.replace(/\\/g, '/')
  const idx = normalized.toLowerCase().lastIndexOf('/resources/data/')
  if (idx >= 0) return normalized.slice(idx + '/resources/'.length)
  if (/^[a-z]:\//i.test(normalized)) return normalized.split('/').slice(-2).join('/')
  if (normalized.startsWith('/')) return normalized.split('/').slice(-2).join('/')
  return normalized
}

function clampText(text, maxLen) {
  const raw = String(text || '').trim()
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw
}

function saveSharedMemoryEntry(row) {
  if (!SHARED_MEMORY_CONFIG.enabled) return
  const entry = {
    session_id: row.session_id,
    task_id: row.task_id,
    parent_task_id: row.parent_task_id,
    from_agent: row.from_agent,
    to_agent: row.to_agent,
    mode: row.mode || 'normal',
    message_type: row.message_type,
    status: row.status,
    title: row.title,
    content: row.content,
    context: row.context,
    artifacts: row.artifacts,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
  const rows = listSharedMemory()
    .filter(item => !(item.task_id === entry.task_id && item.message_type === entry.message_type && item.from_agent === entry.from_agent && item.content === entry.content))
  rows.unshift(entry)
  localStorage.setItem(MEMORY_KEY, JSON.stringify(rows.slice(0, 500)))
  persistPortableSharedMemory(rows.slice(0, 500))
}

let portableMemoryWritePending = false
function persistPortableSharedMemory(rows) {
  if (portableMemoryWritePending || typeof window === 'undefined') return
  if (!window.__TAURI_INTERNALS__ && !window.__TAURI__) return
  portableMemoryWritePending = true
  setTimeout(async () => {
    portableMemoryWritePending = false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('shared_memory_write', { content: JSON.stringify(rows, null, 2) })
    } catch (err) {
      console.warn('[collaboration] shared memory portable write failed:', err)
    }
  }, 50)
}

function routeForTarget(target) {
  if (target === COLLAB_TARGETS.openclaw) return '/chat'
  if (target === COLLAB_TARGETS.claudeCode) return '/h/claude-code'
  if (target === COLLAB_TARGETS.hermes) return '/h/chat'
  return '/'
}

function isSafeAppBaseUrl(url) {
  if (!url) return false
  if (url.protocol === 'tauri:') return true
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = String(url.hostname || '').toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
  try {
    const currentHost = String(window?.location?.hostname || '').toLowerCase()
    return !!currentHost && host === currentHost
  } catch {
    return false
  }
}

function normalizeAppBaseUrl(rawBase) {
  if (!rawBase) return ''
  try {
    const fallbackHref = window?.location?.href || 'http://127.0.0.1:1420/'
    const url = new URL(String(rawBase), fallbackHref)
    url.hash = ''
    if (!isSafeAppBaseUrl(url)) return ''
    return `${url.origin}${url.pathname || '/'}${url.search || ''}`
  } catch {
    return ''
  }
}

function currentAppBaseUrl() {
  try {
    const loc = window?.location
    const params = new URLSearchParams(loc?.search || '')
    const delegatedBase = normalizeAppBaseUrl(params.get('superclawBase'))
    if (delegatedBase) return delegatedBase
    if (params.has('superclawBase')) {
      params.delete('superclawBase')
      const search = params.toString()
      return `${loc?.origin || ''}${loc?.pathname || '/'}${search ? `?${search}` : ''}`
    }
    return `${loc?.origin || ''}${loc?.pathname || '/'}${loc?.search || ''}`
  } catch {
    return ''
  }
}

function appUrlForRoute(route) {
  const cleanRoute = String(route || '/').startsWith('/') ? route : `/${route}`
  const base = currentAppBaseUrl()
  return `${base}#${cleanRoute}`
}

export async function openCollaborationPanel(target, taskId, options = {}) {
  const route = routeForTarget(target)
  const label = `superclaw-${target}-${taskId || Date.now()}`
  const title = options.title || `${targetLabel(target)} 控制面板`
  const url = appUrlForRoute(route)

  if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const existing = await WebviewWindow.getByLabel(label).catch(() => null)
      if (existing) {
        await existing.setFocus().catch(() => {})
        return { mode: 'tauri', reused: true, label, url }
      }
      const child = new WebviewWindow(label, {
        url,
        title,
        width: options.width || 1320,
        height: options.height || 860,
        minWidth: 980,
        minHeight: 680,
        resizable: true,
        center: true,
      })
      child.once('tauri://created', () => {})
      child.once('tauri://error', () => {})
      return { mode: 'tauri', reused: false, label, url }
    } catch (err) {
      console.warn('[collaboration] Tauri window open failed, fallback to window.open:', err)
    }
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer,width=1320,height=860')
  return { mode: 'browser', reused: false, label, url, opened: !!opened }
}

export function peekPendingDispatch() {
  return readPendingQueue()[0] || null
}

function readPendingQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
    if (Array.isArray(raw)) return raw.filter(Boolean)
    return raw?.target ? [raw] : []
  } catch {
    return []
  }
}

function buildWatchdogCandidates({ pendingDispatches = [], activeTasks = [], agentStatuses = [] } = {}) {
  const byTaskId = new Map()
  const ensure = taskId => {
    const id = String(taskId || '').trim()
    if (!id) return null
    if (!byTaskId.has(id)) byTaskId.set(id, { task_id: id })
    return byTaskId.get(id)
  }

  for (const pending of pendingDispatches) {
    const candidate = ensure(pending?.taskId || pending?.task_id)
    if (!candidate) continue
    candidate.pending_dispatch = pending
    candidate.session_id = candidate.session_id || pending.session_id || pending.sessionId || ''
    candidate.status = candidate.status || 'running'
  }

  for (const task of activeTasks) {
    const candidate = ensure(task?.task_id || task?.taskId || task?.id)
    if (!candidate) continue
    candidate.task = task
    candidate.session_id = candidate.session_id || task.session_id || task.sessionId || ''
    candidate.status = task.status || candidate.status || 'running'
  }

  for (const agentStatus of agentStatuses) {
    const candidate = ensure(agentStatus?.task_id || agentStatus?.taskId)
    if (!candidate) continue
    candidate.agent_status = agentStatus
    candidate.session_id = candidate.session_id || agentStatus.session_id || agentStatus.sessionId || ''
    candidate.status = candidate.status || agentStatus.status || 'running'
  }

  return Array.from(byTaskId.values())
}

export function consumePendingDispatch(target) {
  const queue = readPendingQueue()
  const idx = queue.findIndex(item => item?.target === target)
  if (idx < 0) return null
  const [pending] = queue.splice(idx, 1)
  if (queue.length) localStorage.setItem(PENDING_KEY, JSON.stringify(queue))
  else localStorage.removeItem(PENDING_KEY)
  return pending
}

export function runCollaborationWatchdogOnce(input = {}) {
  const now = input.now || new Date().toISOString()
  const staleAfterMs = Number(input.stale_after_ms || input.staleAfterMs || 300000)
  const pendingDispatches = Array.isArray(input.pending_dispatches)
    ? input.pending_dispatches
    : Array.isArray(input.pendingDispatches)
      ? input.pendingDispatches
      : readPendingQueue()
  const activeTasks = Array.isArray(input.active_tasks)
    ? input.active_tasks
    : Array.isArray(input.activeTasks)
      ? input.activeTasks
      : listCollaborationTasks().filter(item => !isTerminalWatchStatus(item?.status))
  const agentStatuses = Array.isArray(input.agent_statuses)
    ? input.agent_statuses
    : Array.isArray(input.agentStatuses)
      ? input.agentStatuses
      : []
  const candidates = buildWatchdogCandidates({ pendingDispatches, activeTasks, agentStatuses })
  const decisions = candidates.map(candidate => {
    const taskId = candidate.task_id || candidate.taskId || candidate.pending_dispatch?.taskId || ''
    const checkpoint = findCheckpoint('', taskId)
    const decision = evaluateCollaborationWatchdog({
      task_id: taskId,
      session_id: candidate.session_id || candidate.sessionId || candidate.pending_dispatch?.session_id || candidate.pending_dispatch?.sessionId || candidate.agent_status?.session_id,
      status: candidate.status || candidate.task?.status || 'running',
      task: candidate.task || null,
      pending_dispatch: candidate.pending_dispatch || null,
      agent_status: candidate.agent_status || null,
      now,
      stale_after_ms: staleAfterMs,
    })
    const out = {
      ...decision,
      session_id: candidate.session_id || candidate.sessionId || candidate.pending_dispatch?.session_id || candidate.pending_dispatch?.sessionId || candidate.agent_status?.session_id || '',
      checkpoint: checkpoint || null,
      task: candidate.task || null,
      pending_dispatch: candidate.pending_dispatch || null,
      agent_status: candidate.agent_status || null,
      resume: null,
    }
    if (input.resume === true && decision.should_recover && checkpoint) {
      out.resume = resumeTaskFromCheckpoint({
        task_id: taskId,
        checkpoint_id: checkpoint.checkpoint_id,
        checkpoint,
        target_agent: candidate.pending_dispatch?.target || candidate.agent_status?.agent || candidate.agent_status?.agent_name || checkpoint.agents?.[0],
        requested_by: input.requested_by || input.actor || COLLAB_TARGETS.hermes,
      })
    }
    return out
  })
  const taskEvents = decisions.flatMap(item => Array.isArray(item.task_events) ? item.task_events : [])
  const resumed = decisions.filter(item => item.resume).length
  return {
    summary: {
      total: decisions.length,
      recovering: decisions.filter(item => item.should_recover).length,
      healthy: decisions.filter(item => !item.should_recover).length,
      resumed,
    },
    decisions,
    task_events: taskEvents,
    resumed,
    checked_at: new Date(toTimestamp(now, Date.now())).toISOString(),
  }
}
