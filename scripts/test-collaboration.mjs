#!/usr/bin/env node

class MemoryStorage {
  constructor() {
    this.store = new Map()
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }

  setItem(key, value) {
    this.store.set(String(key), String(value))
  }

  removeItem(key) {
    this.store.delete(String(key))
  }

  clear() {
    this.store.clear()
  }
}

globalThis.localStorage = new MemoryStorage()
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type
    this.detail = options.detail
  }
}
globalThis.window = {
  dispatchEvent() {},
}

const {
  COLLAB_TARGETS,
  normalizeClaudeCodeMode,
  createCollaborationTask,
  createTaskDelegate,
  createTaskProgress,
  createTaskRequest,
  createTaskResult,
  listAgentTaskMessages,
  listSharedMemory,
  routeEcommerceCollaborationTargets,
  setPendingDispatch,
  consumePendingDispatch,
  updateCollaborationTask,
  listCollaborationTasks,
} = await import('../src/lib/collaboration.js')

const failures = []
const results = []

function assert(condition, message, detail = {}) {
  if (!condition) failures.push({ message, detail })
}

function record(name, passed, detail = {}) {
  results.push({ name, passed, detail })
  assert(passed, name, detail)
}

function messagesFor(taskId) {
  return listAgentTaskMessages({ taskId })
}

function hasMessage(taskId, messageType, status, fromAgent, toAgent) {
  return messagesFor(taskId).some(item => (
    item.message_type === messageType &&
    item.status === status &&
    item.from_agent === fromAgent &&
    item.to_agent === toAgent
  ))
}

function createHermesDispatch(target, goal, mode = 'safe') {
  const modeInfo = normalizeClaudeCodeMode(mode)
  const task = createCollaborationTask({
    goal,
    executor: target,
    reviewer: target === COLLAB_TARGETS.openclaw ? COLLAB_TARGETS.claudeCode : COLLAB_TARGETS.openclaw,
    source: COLLAB_TARGETS.hermes,
    claudeCodeMode: modeInfo.mode,
    sessionId: 'session-collab-test',
    context: {
      summary: goal,
      recent_messages: [{ role: 'user', content: 'previous user context' }],
      important_facts: ['shared-memory-test'],
      artifacts: [{ type: 'file', path: 'data/artifacts/input.txt', text: 'input artifact' }],
    },
    artifacts: [{ type: 'file', path: 'data/artifacts/input.txt', text: 'input artifact' }],
  })
  createTaskRequest({
    taskId: task.id,
    sessionId: task.session_id,
    fromAgent: COLLAB_TARGETS.hermes,
    toAgent: target,
    title: `dispatch to ${target}`,
    content: goal,
    context: task.context,
    artifacts: task.artifacts,
    mode: target === COLLAB_TARGETS.claudeCode ? modeInfo.mode : undefined,
    permission_level: target === COLLAB_TARGETS.claudeCode ? modeInfo.permission_level : undefined,
    requires_confirmation: target === COLLAB_TARGETS.claudeCode ? modeInfo.requires_confirmation : undefined,
  })
  setPendingDispatch({
    target,
    taskId: task.id,
    stage: 'execute',
    title: `execute ${task.id}`,
    message: `mock execution brief for ${target}`,
    sessionId: task.session_id,
    context: task.context,
    artifacts: task.artifacts,
    mode: target === COLLAB_TARGETS.claudeCode ? modeInfo.mode : undefined,
    permission_level: target === COLLAB_TARGETS.claudeCode ? modeInfo.permission_level : undefined,
    requires_confirmation: target === COLLAB_TARGETS.claudeCode ? modeInfo.requires_confirmation : undefined,
  })
  updateCollaborationTask(task.id, {
    status: 'dispatched',
    lastDispatchedTo: target,
    dispatchedAt: Date.now(),
  })
  return task
}

function runAgentLifecycle(task, agent) {
  const pending = consumePendingDispatch(agent)
  const modeInfo = agent === COLLAB_TARGETS.claudeCode ? normalizeClaudeCodeMode(pending || task.claudeCodeMode || 'safe') : null
  record(`pending dispatch consumed by ${agent}`, !!pending && pending.taskId === task.id, { taskId: task.id, pending })
  createTaskProgress({
    taskId: task.id,
    sessionId: pending.session_id,
    fromAgent: agent,
    toAgent: COLLAB_TARGETS.hermes,
    title: `${agent} running`,
    content: `${agent} accepted ${task.id}`,
    context: pending.context,
    artifacts: pending.artifacts,
    mode: modeInfo?.mode,
    permission_level: modeInfo?.permission_level,
    requires_confirmation: modeInfo?.requires_confirmation,
  })
  createTaskResult({
    taskId: task.id,
    sessionId: pending.session_id,
    fromAgent: agent,
    toAgent: COLLAB_TARGETS.hermes,
    title: `${agent} completed`,
    content: `${agent} completed result for ${task.id}`,
    context: pending.context,
    artifacts: pending.artifacts,
    mode: modeInfo?.mode,
    permission_level: modeInfo?.permission_level,
    requires_confirmation: modeInfo?.requires_confirmation,
  })
  createTaskDelegate({
    taskId: task.id,
    parentTaskId: task.id,
    sessionId: pending.session_id,
    fromAgent: agent,
    toAgent: COLLAB_TARGETS.hermes,
    title: `${agent} delegated`,
    content: `${agent} asks Hermes to handle a better-suited subtask`,
    context: pending.context,
    artifacts: pending.artifacts,
    mode: modeInfo?.mode,
    permission_level: modeInfo?.permission_level,
    requires_confirmation: modeInfo?.requires_confirmation,
  })
  createTaskResult({
    taskId: `${task.id}-error`,
    parentTaskId: task.id,
    sessionId: pending.session_id,
    fromAgent: agent,
    toAgent: COLLAB_TARGETS.hermes,
    title: `${agent} failed subtask`,
    content: `${agent} failed with mock recoverable error`,
    failed: true,
    context: pending.context,
    artifacts: pending.artifacts,
    mode: modeInfo?.mode,
    permission_level: modeInfo?.permission_level,
    requires_confirmation: modeInfo?.requires_confirmation,
  })
}

const ecommerceRoute = routeEcommerceCollaborationTargets({
  goal: '帮我用 ClaudeCode 去抖店上架商品并发布',
  executor: COLLAB_TARGETS.claudeCode,
  reviewer: COLLAB_TARGETS.claudeCode,
})
record('ecommerce runtime does not route executor to Claude Code', ecommerceRoute.executor === COLLAB_TARGETS.openclaw && ecommerceRoute.changed, ecommerceRoute)
record('ecommerce runtime reviewer falls back to Hermes', ecommerceRoute.reviewer === COLLAB_TARGETS.hermes, ecommerceRoute)

const devAssistRoute = routeEcommerceCollaborationTargets({
  goal: '检查抖店上架确认前代码 bug，并跑 smoke test',
  executor: COLLAB_TARGETS.claudeCode,
  reviewer: COLLAB_TARGETS.claudeCode,
})
record('Claude Code remains available for ecommerce source/debug/test work', devAssistRoute.executor === COLLAB_TARGETS.claudeCode && !devAssistRoute.changed, devAssistRoute)

createTaskRequest({
  taskId: 'policy-block-direct-claude',
  sessionId: 'session-collab-test',
  fromAgent: COLLAB_TARGETS.hermes,
  toAgent: COLLAB_TARGETS.claudeCode,
  title: 'blocked runtime task',
  content: '帮我在抖店发布商品并付款',
})
const blockedDirect = listAgentTaskMessages({ taskId: 'policy-block-direct-claude' })[0]
record('direct Hermes -> Claude Code ecommerce runtime request is policy-blocked', blockedDirect?.status === 'blocked' && blockedDirect?.to_agent === COLLAB_TARGETS.hermes && blockedDirect?.requested_to_agent === COLLAB_TARGETS.claudeCode, blockedDirect)

setPendingDispatch({
  target: COLLAB_TARGETS.claudeCode,
  taskId: 'policy-block-pending-claude',
  sessionId: 'session-collab-test',
  stage: 'execute',
  title: 'blocked pending runtime task',
  message: '帮我评论直播公屏并发送回复',
})
const blockedPending = consumePendingDispatch(COLLAB_TARGETS.hermes)
record('pending ecommerce runtime dispatch to Claude Code is rerouted to Hermes', blockedPending?.policy_blocked && blockedPending?.target === COLLAB_TARGETS.hermes && blockedPending?.requestedTarget === COLLAB_TARGETS.claudeCode, blockedPending)

const openclawTask = createHermesDispatch(COLLAB_TARGETS.openclaw, 'mock task: Hermes dispatch to OpenClaw')
record('Hermes -> OpenClaw task_request stored', hasMessage(openclawTask.id, 'task_request', 'pending', COLLAB_TARGETS.hermes, COLLAB_TARGETS.openclaw), { taskId: openclawTask.id })
runAgentLifecycle(openclawTask, COLLAB_TARGETS.openclaw)

const claudeTask = createHermesDispatch(COLLAB_TARGETS.claudeCode, 'mock task: Hermes dispatch to Claude Code', 'browser_automation')
record('Hermes -> Claude Code task_request stored', hasMessage(claudeTask.id, 'task_request', 'pending', COLLAB_TARGETS.hermes, COLLAB_TARGETS.claudeCode), { taskId: claudeTask.id })
runAgentLifecycle(claudeTask, COLLAB_TARGETS.claudeCode)

record('OpenClaw -> Hermes progress running stored', hasMessage(openclawTask.id, 'task_progress', 'running', COLLAB_TARGETS.openclaw, COLLAB_TARGETS.hermes), { taskId: openclawTask.id })
record('Claude Code -> Hermes progress running stored', hasMessage(claudeTask.id, 'task_progress', 'running', COLLAB_TARGETS.claudeCode, COLLAB_TARGETS.hermes), { taskId: claudeTask.id })
record('OpenClaw -> Hermes completed result stored', hasMessage(openclawTask.id, 'task_result', 'completed', COLLAB_TARGETS.openclaw, COLLAB_TARGETS.hermes), { taskId: openclawTask.id })
record('Claude Code -> Hermes completed result stored', hasMessage(claudeTask.id, 'task_result', 'completed', COLLAB_TARGETS.claudeCode, COLLAB_TARGETS.hermes), { taskId: claudeTask.id })
record('OpenClaw -> Hermes delegate stored', hasMessage(openclawTask.id, 'task_delegate', 'delegated', COLLAB_TARGETS.openclaw, COLLAB_TARGETS.hermes), { taskId: openclawTask.id })
record('Claude Code -> Hermes delegate stored', hasMessage(claudeTask.id, 'task_delegate', 'delegated', COLLAB_TARGETS.claudeCode, COLLAB_TARGETS.hermes), { taskId: claudeTask.id })
record('Claude Code result keeps mode and permission', listAgentTaskMessages({ taskId: claudeTask.id }).some(item => item.message_type === 'task_result' && item.mode === 'browser_automation' && item.permission_level === 'browser_only'), { taskId: claudeTask.id })
record('Hermes -> OpenClaw context retained', listAgentTaskMessages({ taskId: openclawTask.id }).some(item => item.to_agent === COLLAB_TARGETS.openclaw && item.session_id === 'session-collab-test' && item.context?.summary && item.artifacts?.length), { taskId: openclawTask.id })
record('Hermes -> Claude Code context retained', listAgentTaskMessages({ taskId: claudeTask.id }).some(item => item.to_agent === COLLAB_TARGETS.claudeCode && item.session_id === 'session-collab-test' && item.context?.recent_messages?.length && item.artifacts?.length), { taskId: claudeTask.id })
record('OpenClaw -> Hermes result writes memory context', listAgentTaskMessages({ taskId: openclawTask.id }).some(item => item.from_agent === COLLAB_TARGETS.openclaw && item.to_agent === COLLAB_TARGETS.hermes && item.message_type === 'task_result' && item.context?.artifacts?.length), { taskId: openclawTask.id })
record('Claude Code -> Hermes result writes memory context', listAgentTaskMessages({ taskId: claudeTask.id }).some(item => item.from_agent === COLLAB_TARGETS.claudeCode && item.to_agent === COLLAB_TARGETS.hermes && item.message_type === 'task_result' && item.context?.artifacts?.length), { taskId: claudeTask.id })
record('shared memory persisted in local store', listSharedMemory({ sessionId: 'session-collab-test' }).length >= 8, { count: listSharedMemory({ sessionId: 'session-collab-test' }).length })

const persistedMemoryJson = globalThis.localStorage.getItem('superclaw-shared-agent-memory-v1')
globalThis.localStorage.removeItem('superclaw-shared-agent-memory-v1')
globalThis.localStorage.setItem('superclaw-shared-agent-memory-v1', persistedMemoryJson)
record('shared memory survives reload simulation', listSharedMemory({ sessionId: 'session-collab-test' }).length >= 8, { count: listSharedMemory({ sessionId: 'session-collab-test' }).length })

const openclawError = listAgentTaskMessages({ taskId: `${openclawTask.id}-error` })[0]
const claudeError = listAgentTaskMessages({ taskId: `${claudeTask.id}-error` })[0]
record('OpenClaw failed status is visible and linked to parent task', !!openclawError && openclawError.status === 'failed' && openclawError.parent_task_id === openclawTask.id, openclawError)
record('Claude Code failed status is visible and linked to parent task', !!claudeError && claudeError.status === 'failed' && claudeError.parent_task_id === claudeTask.id, claudeError)

for (const task of [openclawTask, claudeTask]) {
  const taskMessages = messagesFor(task.id)
  const statuses = new Set(taskMessages.map(item => item.status))
  record(`task_id retained for all primary messages: ${task.id}`, taskMessages.length >= 4 && taskMessages.every(item => item.task_id === task.id), {
    taskId: task.id,
    count: taskMessages.length,
  })
  record(`primary task has pending/running/completed/delegated states: ${task.id}`, ['pending', 'running', 'completed', 'delegated'].every(status => statuses.has(status)), {
    taskId: task.id,
    statuses: Array.from(statuses),
  })
}

record('collaboration task records retained', listCollaborationTasks().length === 2, { count: listCollaborationTasks().length })
record('no pending dispatch left after agents consume', !consumePendingDispatch(COLLAB_TARGETS.openclaw) && !consumePendingDispatch(COLLAB_TARGETS.claudeCode), {})

const payload = {
  ok: failures.length === 0,
  environment: process.env.COLLAB_TEST_ENV || 'source-dev',
  checked_at: new Date().toISOString(),
  results,
  failures,
  message_count: listAgentTaskMessages().length,
  task_count: listCollaborationTasks().length,
}

console.log(JSON.stringify(payload, null, 2))
if (failures.length) process.exit(1)
