#!/usr/bin/env node

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(String(key), String(value)) }
  removeItem(key) { this.store.delete(String(key)) }
}

globalThis.localStorage = new MemoryStorage()
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}
globalThis.window = { dispatchEvent() {} }

const {
  CLAUDE_CODE_MODES,
  COLLAB_TARGETS,
  createCollaborationTask,
  createTaskProgress,
  createTaskRequest,
  createTaskResult,
  listAgentTaskMessages,
  normalizeClaudeCodeMode,
  setPendingDispatch,
  consumePendingDispatch,
} = await import('../src/lib/collaboration.js')

const failures = []
const results = []

function record(name, passed, detail = {}) {
  results.push({ name, passed, detail })
  if (!passed) failures.push({ name, detail })
}

function dispatchClaudeMode(mode) {
  const modeInfo = normalizeClaudeCodeMode(mode)
  const task = createCollaborationTask({
    goal: `mode test ${mode}`,
    executor: COLLAB_TARGETS.claudeCode,
    reviewer: COLLAB_TARGETS.openclaw,
    source: COLLAB_TARGETS.hermes,
    claudeCodeMode: mode,
  })
  createTaskRequest({
    taskId: task.id,
    fromAgent: COLLAB_TARGETS.hermes,
    toAgent: COLLAB_TARGETS.claudeCode,
    title: `Hermes to Claude ${modeInfo.mode}`,
    content: `run in ${modeInfo.mode}`,
    mode,
  })
  setPendingDispatch({
    target: COLLAB_TARGETS.claudeCode,
    taskId: task.id,
    stage: 'execute',
    title: `execute ${modeInfo.mode}`,
    message: `mock brief ${modeInfo.mode}`,
    mode,
  })
  return { task, modeInfo }
}

function simulateClaudeReceiveAndReturn(task, mode) {
  const pending = consumePendingDispatch(COLLAB_TARGETS.claudeCode)
  const modeInfo = normalizeClaudeCodeMode(pending || mode)
  createTaskProgress({
    taskId: task.id,
    fromAgent: COLLAB_TARGETS.claudeCode,
    toAgent: COLLAB_TARGETS.hermes,
    title: 'accepted',
    content: modeInfo.requires_confirmation ? 'waiting for confirmation' : 'running',
    mode: modeInfo.mode,
  })
  const blocked = modeInfo.mode === CLAUDE_CODE_MODES.takeover && modeInfo.requires_confirmation
  createTaskResult({
    taskId: task.id,
    fromAgent: COLLAB_TARGETS.claudeCode,
    toAgent: COLLAB_TARGETS.hermes,
    title: blocked ? 'takeover requires confirmation' : 'completed',
    content: blocked ? 'takeover_requires_user_confirmation' : `completed in ${modeInfo.mode}`,
    failed: blocked,
    mode: modeInfo.mode,
  })
  return { pending, modeInfo, blocked }
}

const safe = dispatchClaudeMode('safe')
record('safe normalizes to restricted', safe.modeInfo.mode === 'safe' && safe.modeInfo.permission_level === 'restricted' && !safe.modeInfo.requires_confirmation, safe.modeInfo)
let run = simulateClaudeReceiveAndReturn(safe.task, 'safe')
record('safe does not auto-upgrade', run.modeInfo.mode === 'safe' && run.modeInfo.permission_level === 'restricted' && !run.blocked, run)

const browser = dispatchClaudeMode('browser')
record('legacy browser maps to browser_automation', browser.modeInfo.mode === 'browser_automation' && browser.modeInfo.permission_level === 'browser_only' && browser.modeInfo.single_browser && browser.modeInfo.single_page && browser.modeInfo.allow_popup === false, browser.modeInfo)
run = simulateClaudeReceiveAndReturn(browser.task, 'browser')
record('browser_automation does not become takeover', run.modeInfo.mode === 'browser_automation' && !run.modeInfo.requires_confirmation && !run.blocked, run)

const takeover = dispatchClaudeMode('takeover')
record('takeover requires confirmation', takeover.modeInfo.mode === 'takeover' && takeover.modeInfo.permission_level === 'full_control' && takeover.modeInfo.requires_confirmation, takeover.modeInfo)
run = simulateClaudeReceiveAndReturn(takeover.task, 'takeover')
record('takeover blocked before confirmation', run.blocked === true, run)

const unknown = dispatchClaudeMode('super-admin')
record('unknown mode falls back to safe with warning', unknown.modeInfo.mode === 'safe' && unknown.modeInfo.permission_level === 'restricted' && unknown.modeInfo.warning === 'unknown_mode_fallback_to_safe', unknown.modeInfo)
run = simulateClaudeReceiveAndReturn(unknown.task, 'super-admin')
record('unknown mode result remains safe', run.modeInfo.mode === 'safe' && run.modeInfo.permission_level === 'restricted', run)

for (const item of [safe, browser, takeover, unknown]) {
  const messages = listAgentTaskMessages({ taskId: item.task.id })
  const progress = messages.find(msg => msg.message_type === 'task_progress')
  const result = messages.find(msg => msg.message_type === 'task_result' || msg.message_type === 'task_error')
  record(`progress keeps mode for ${item.task.id}`, !!progress?.mode && !!progress?.permission_level, progress)
  record(`result keeps mode for ${item.task.id}`, !!result?.mode && !!result?.permission_level, result)
}

const payload = {
  ok: failures.length === 0,
  environment: process.env.CLAUDE_MODE_TEST_ENV || 'source-dev',
  checked_at: new Date().toISOString(),
  results,
  failures,
}

console.log(JSON.stringify(payload, null, 2))
if (failures.length) process.exit(1)
