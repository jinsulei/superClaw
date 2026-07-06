import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const COLLABORATION_PATH = 'src/lib/collaboration.js'
const CHAT_PATH = 'src/engines/hermes/pages/chat.js'
const DEV_API_PATH = 'scripts/dev-api.js'
const PACKAGE_PATH = 'package.json'
const TAURI_PATH = 'src-tauri/tauri.conf.json'

const collaborationSource = readFileSync(COLLABORATION_PATH, 'utf8')
const chatSource = readFileSync(CHAT_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')
const packageSource = readFileSync(PACKAGE_PATH, 'utf8')
const tauriSource = readFileSync(TAURI_PATH, 'utf8')

const taskId = 'watchdog_runner_task_001'
const sessionId = 'watchdog_runner_session_001'
const now = '2026-07-06T15:10:00.000Z'
const staleHeartbeatAt = '2026-07-06T15:00:00.000Z'
const freshHeartbeatAt = '2026-07-06T15:09:30.000Z'

function installBrowserShim() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
  }
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: {
      origin: 'http://127.0.0.1:1420',
      pathname: '/',
      search: '',
      href: 'http://127.0.0.1:1420/#/chat',
      hostname: '127.0.0.1',
    },
  }
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type
      this.detail = init.detail
    }
  }
}

async function loadCollaborationModule() {
  installBrowserShim()
  return import('../../src/lib/collaboration.js')
}

function buildPendingDispatch(overrides = {}) {
  return {
    taskId,
    sessionId,
    target: 'openclaw',
    stage: 'execute',
    title: 'Execute watchdog runner task',
    message: 'Run this collaboration task and report progress.',
    context: {
      summary: 'watchdog runner fixture',
      recent_messages: [],
      important_facts: ['one-shot only'],
      artifacts: [],
      session_id: sessionId,
      task_id: taskId,
    },
    artifacts: [],
    requires_confirmation: false,
    ...overrides,
  }
}

function buildHeartbeat(agent, heartbeatAt) {
  return {
    agent,
    task_id: taskId,
    session_id: sessionId,
    status: 'running',
    heartbeat_at: heartbeatAt,
  }
}

test('one-shot runner scans stale pending dispatch without consuming it', async () => {
  const {
    consumePendingDispatch,
    listTaskCheckpoints,
    runCollaborationWatchdogOnce,
    setPendingDispatch,
  } = await loadCollaborationModule()
  assert.equal(typeof runCollaborationWatchdogOnce, 'function', 'Expected gap: runCollaborationWatchdogOnce must exist')

  const pending = setPendingDispatch(buildPendingDispatch())
  pending.createdAt = Date.parse('2026-07-06T15:00:00.000Z')

  const result = runCollaborationWatchdogOnce({
    now,
    stale_after_ms: 300000,
    pending_dispatches: [pending],
  })

  assert.equal(result.summary.total, 1)
  assert.equal(result.summary.recovering, 1)
  assert.equal(result.decisions[0].task_id, taskId)
  assert.equal(result.decisions[0].reason, 'pending_dispatch_timeout')
  assert.equal(result.decisions[0].status, 'recovering')
  assert.equal(result.decisions[0].checkpoint?.task_id, taskId)
  assert.ok(listTaskCheckpoints({ taskId }).length >= 1, 'runner must be able to find checkpoint')

  const consumed = consumePendingDispatch('openclaw')
  const consumedAgain = consumePendingDispatch('openclaw')
  assert.equal(consumed.taskId, taskId, 'runner must not call consumePendingDispatch')
  assert.equal(consumedAgain, null, 'pending dispatch single-consume semantics must remain unchanged')
})

test('one-shot runner marks stale heartbeat recovering and keeps fresh heartbeat healthy', async () => {
  const {
    createTaskCheckpoint,
    createTaskHeartbeat,
    runCollaborationWatchdogOnce,
  } = await loadCollaborationModule()

  createTaskCheckpoint({
    task_id: taskId,
    agents: ['openclaw'],
    status: 'running',
    snapshot: {
      task: { task_id: taskId, session_id: sessionId, status: 'running', target: 'openclaw' },
      pending_dispatch: buildPendingDispatch(),
    },
  })

  const stale = runCollaborationWatchdogOnce({
    now,
    stale_after_ms: 300000,
    agent_statuses: [createTaskHeartbeat(buildHeartbeat('openclaw', staleHeartbeatAt))],
  })
  const fresh = runCollaborationWatchdogOnce({
    now,
    stale_after_ms: 300000,
    agent_statuses: [createTaskHeartbeat(buildHeartbeat('openclaw', freshHeartbeatAt))],
  })

  assert.equal(stale.decisions[0].task_id, taskId)
  assert.equal(stale.decisions[0].status, 'recovering')
  assert.equal(stale.decisions[0].reason, 'running_timeout')
  assert.equal(stale.decisions[0].checkpoint?.task_id, taskId)
  assert.ok(stale.task_events.some(event => event.event_type === 'task_recovering'))

  assert.equal(fresh.decisions[0].task_id, taskId)
  assert.equal(fresh.decisions[0].status, 'running')
  assert.equal(fresh.decisions[0].reason, 'healthy')
  assert.equal(fresh.summary.recovering, 0)
})

test('one-shot runner does not auto resume unless resume is explicitly true', async () => {
  const {
    consumePendingDispatch,
    createTaskCheckpoint,
    runCollaborationWatchdogOnce,
  } = await loadCollaborationModule()

  const checkpoint = createTaskCheckpoint({
    task_id: taskId,
    agents: ['openclaw'],
    status: 'running',
    snapshot: {
      task: { task_id: taskId, session_id: sessionId, status: 'running', target: 'openclaw' },
      pending_dispatch: buildPendingDispatch(),
      agent_status: buildHeartbeat('openclaw', staleHeartbeatAt),
    },
  })

  const dryRun = runCollaborationWatchdogOnce({
    now,
    stale_after_ms: 300000,
    resume: false,
    agent_statuses: [buildHeartbeat('openclaw', staleHeartbeatAt)],
  })
  assert.equal(dryRun.summary.resumed, 0)
  assert.equal(consumePendingDispatch('openclaw'), null, 'default dry run must not enqueue resume dispatch')

  const resumed = runCollaborationWatchdogOnce({
    now,
    stale_after_ms: 300000,
    resume: true,
    agent_statuses: [buildHeartbeat('openclaw', staleHeartbeatAt)],
  })
  const consumed = consumePendingDispatch('openclaw')

  assert.equal(resumed.summary.resumed, 1)
  assert.equal(resumed.decisions[0].resume.task_id, taskId)
  assert.equal(resumed.decisions[0].resume.checkpoint_id, checkpoint.checkpoint_id)
  assert.equal(consumed.taskId, taskId, 'resume:true must preserve original task_id')
  assert.equal(consumed.stage, 'resume')
})

test('watchdog runner stays on existing collaboration system and avoids runtime or daemon changes', () => {
  assert.match(collaborationSource, /\bevaluateCollaborationWatchdog\b/)
  assert.match(collaborationSource, /\bresumeTaskFromCheckpoint\b/)
  assert.match(collaborationSource, /\bsetPendingDispatch\b/)
  assert.match(collaborationSource, /\bconsumePendingDispatch\b/)
  assert.match(collaborationSource, /\brunCollaborationWatchdogOnce\b/)
  assert.doesNotMatch(collaborationSource, /\brunCollaborationWatchdogOnce[\s\S]*?\bconsumePendingDispatch\s*\(/)
  assert.doesNotMatch(collaborationSource + chatSource, /\bsetInterval\s*\(/)
  assert.doesNotMatch(collaborationSource, /\bclass\s+.*CollaborationRuntime\b|\bnew\s+.*CollaborationRuntime\b/)
  assert.doesNotMatch(devApiSource, /collaboration-watchdog-runner-integration|runCollaborationWatchdogOnce/)
  assert.doesNotMatch(packageSource + tauriSource, /collaboration-watchdog-runner-integration|runCollaborationWatchdogOnce/)
  assert.doesNotMatch(collaborationSource + chatSource, /runtime\/data\/secrets|relay-config\.json|\.env/)
})
