import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const COLLABORATION_PATH = 'src/lib/collaboration.js'
const CHAT_PATH = 'src/engines/hermes/pages/chat.js'
const DEV_API_PATH = 'scripts/dev-api.js'

const collaborationSource = readFileSync(COLLABORATION_PATH, 'utf8')
const chatSource = readFileSync(CHAT_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')

const taskId = 'watch_integration_task_001'
const sessionId = 'watch_integration_session_001'

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
    title: 'Execute watch integration task',
    message: 'Run this collaboration task without simulating agent success.',
    context: {
      summary: 'watch integration fixture',
      recent_messages: [],
      important_facts: ['contract only'],
      artifacts: [],
      session_id: sessionId,
      task_id: taskId,
    },
    artifacts: [],
    requires_confirmation: false,
    ...overrides,
  }
}

test('dispatching a collaboration task automatically creates a checkpoint bound to the original task_id', async () => {
  const {
    consumePendingDispatch,
    listTaskCheckpoints,
    setPendingDispatch,
  } = await loadCollaborationModule()

  const pending = setPendingDispatch(buildPendingDispatch())
  const checkpoints = listTaskCheckpoints({ taskId })

  assert.equal(pending.taskId, taskId)
  assert.equal(pending.target, 'openclaw')
  assert.ok(Array.isArray(checkpoints), 'checkpoint list must be readable')
  assert.ok(checkpoints.length >= 1, 'dispatch must create at least one checkpoint')
  assert.ok(checkpoints.every(item => item.task_id === taskId), 'checkpoint must bind original task_id')
  assert.ok(checkpoints.some(item => item.snapshot?.pending_dispatch?.taskId === taskId))

  const consumed = consumePendingDispatch('openclaw')
  const consumedAgain = consumePendingDispatch('openclaw')
  assert.equal(consumed.taskId, taskId)
  assert.equal(consumedAgain, null, 'pending dispatch must remain single-use')
})

test('watchdog recognizes stale pending dispatch as recovering with task_events', async () => {
  const {
    evaluateCollaborationWatchdog,
    setPendingDispatch,
  } = await loadCollaborationModule()

  const pending = setPendingDispatch(buildPendingDispatch())
  const stalePending = {
    ...pending,
    createdAt: Date.parse('2026-07-06T04:00:00.000Z'),
  }
  const decision = evaluateCollaborationWatchdog({
    task_id: taskId,
    status: 'running',
    pending_dispatch: stalePending,
    now: '2026-07-06T04:10:00.000Z',
    stale_after_ms: 300000,
  })

  assert.equal(decision.task_id, taskId)
  assert.equal(decision.reason, 'pending_dispatch_timeout')
  assert.equal(decision.status, 'recovering')
  assert.equal(decision.should_recover, true)
  assert.equal(decision.checkpoint_required, true)
  assert.ok(Array.isArray(decision.task_events))
  assert.ok(decision.task_events.some(event => event.event_type === 'task_recovering'))
})

test('resume_task keeps original task_id and re-enters the existing pending dispatch queue', async () => {
  const {
    consumePendingDispatch,
    createTaskCheckpoint,
    resumeTaskFromCheckpoint,
  } = await loadCollaborationModule()

  const checkpoint = createTaskCheckpoint({
    task_id: taskId,
    agents: ['openclaw'],
    status: 'running',
    snapshot: {
      task: {
        task_id: taskId,
        session_id: sessionId,
        status: 'running',
        stage: 'execute',
        target: 'openclaw',
      },
      pending_dispatch: buildPendingDispatch(),
      agent_status: {
        agent: 'openclaw',
        status: 'offline',
        heartbeat_at: '2026-07-06T04:00:00.000Z',
      },
    },
  })

  const resume = resumeTaskFromCheckpoint({
    task_id: taskId,
    checkpoint_id: checkpoint.checkpoint_id,
    target_agent: 'openclaw',
    requested_by: 'hermes',
  })
  const consumed = consumePendingDispatch('openclaw')
  const consumedAgain = consumePendingDispatch('openclaw')

  assert.equal(resume.task_id, taskId)
  assert.equal(resume.target_agent, 'openclaw')
  assert.equal(resume.status, 'running')
  assert.notEqual(resume.task_id, `${taskId}-resume`)
  assert.equal(consumed.taskId, taskId, 'resume must re-enter pending dispatch with original task_id')
  assert.equal(consumed.stage, 'resume')
  assert.equal(consumedAgain, null, 'resume pending dispatch remains single-use')
})

test('integration stays on the existing collaboration system and does not touch runtime paths', () => {
  assert.match(collaborationSource, /\bsetPendingDispatch\b/)
  assert.match(collaborationSource, /\bconsumePendingDispatch\b/)
  assert.match(collaborationSource, /\bcreateTaskCheckpoint\b/)
  assert.match(collaborationSource, /\bresumeTaskFromCheckpoint\b/)
  assert.match(chatSource, /\bdispatchCollaborationTask\b/)
  assert.match(chatSource, /\bsetPendingDispatch\b/)
  assert.doesNotMatch(collaborationSource, /\bclass\s+.*TaskRuntime\b|\bnew\s+.*TaskRuntime\b/)
  assert.doesNotMatch(collaborationSource, /\bsetInterval\s*\(/)
  assert.doesNotMatch(chatSource, /\bsetInterval\s*\(/)
  assert.doesNotMatch(devApiSource, /collaboration-watch-integration|resumeTaskFromCheckpoint|createTaskCheckpoint/)
  assert.doesNotMatch(collaborationSource + chatSource, /runtime\/data\/secrets|relay-config\.json|\.env/)
})
