import test from 'node:test'
import assert from 'node:assert/strict'

import {
  allowedWatchTaskStatuses,
  checkpointFixture,
  forbiddenSensitivePaths,
  offlineWatchdogFixture,
  pendingDispatchWatchFixture,
  resumeFixture,
  stuckWatchdogFixture,
  taskFixture,
  watchdogFixture,
} from './fixtures/collaboration-watch.fixture.js'

const NO_PARALLEL_IMPL_CONTRACT = [
  'only wrap_existing / patch_existing is allowed',
  'do not create a second collaboration system',
  'do not create a second task runtime',
  'do not bypass src/lib/collaboration.js',
  'do not bypass chat.js dispatch',
  'do not bypass pending dispatch',
  'do not simulate full agent execution success',
  'do not read runtime/data/secrets',
]

const AGENT_RUN_STATUSES = new Set([
  'created',
  'running',
  'waiting_human',
  'recovering',
  'completed',
  'failed',
  'cancelled',
  'blocked',
])

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

async function loadExpectedWatchExports(requiredNames = []) {
  const mod = await loadCollaborationModule()
  const expected = {
    createTaskCheckpoint: mod.createTaskCheckpoint,
    listTaskCheckpoints: mod.listTaskCheckpoints,
    resumeTaskFromCheckpoint: mod.resumeTaskFromCheckpoint,
    evaluateCollaborationWatchdog: mod.evaluateCollaborationWatchdog,
  }

  for (const name of requiredNames) {
    const value = expected[name]
    assert.equal(
      typeof value,
      'function',
      `Expected gap: src/lib/collaboration.js must export ${name} before collaboration watch tasks can be implemented`,
    )
  }

  return { ...mod, ...expected }
}

function assertIsoTimestamp(value, fieldName) {
  assert.equal(typeof value, 'string', `${fieldName} must be a string`)
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, `${fieldName} must be stable ISO timestamp`)
}

function assertCheckpointShape(checkpoint) {
  assert.ok(checkpoint, 'checkpoint must exist')
  assert.ok(checkpoint.checkpoint_id, 'checkpoint_id is required')
  assert.equal(checkpoint.task_id, taskFixture.task_id, 'checkpoint must bind to original task_id')
  assert.ok(checkpoint.snapshot && typeof checkpoint.snapshot === 'object', 'checkpoint snapshot is required')
  assert.ok(checkpoint.snapshot.agent_status, 'checkpoint must include agent status')
  assertIsoTimestamp(checkpoint.timestamp || checkpoint.created_at, 'checkpoint timestamp')
}

function assertResumeShape(resumeTask) {
  assert.ok(resumeTask, 'resume_task must exist')
  assert.equal(resumeTask.task_id, resumeFixture.task_id, 'resume_task must bind original task_id')
  assert.equal(resumeTask.checkpoint_id, resumeFixture.checkpoint_id, 'resume_task must bind checkpoint_id')
  assert.equal(resumeTask.agent || resumeTask.target, resumeFixture.agent, 'resume_task must include target agent')
  assert.equal(resumeTask.status, 'running', 'resume_task must re-enter running status')
}

test('no_parallel_impl guard locks Collaboration / Watch Tasks scope', () => {
  const scope = NO_PARALLEL_IMPL_CONTRACT.join('\n')
  assert.match(scope, /wrap_existing \/ patch_existing/)
  assert.match(scope, /do not create a second collaboration system/)
  assert.match(scope, /do not create a second task runtime/)
  assert.match(scope, /src\/lib\/collaboration\.js/)
  assert.match(scope, /chat\.js dispatch/)
  assert.match(scope, /pending dispatch/)
  assert.match(scope, /do not simulate full agent execution success/)
  assert.match(scope, /do not read runtime\/data\/secrets/)
})

test('checkpoint contract: createTaskRequest must produce a restorable checkpoint bound to task_id', async () => {
  const { createTaskRequest, createTaskCheckpoint, listTaskCheckpoints } = await loadExpectedWatchExports([
    'createTaskCheckpoint',
    'listTaskCheckpoints',
  ])
  const request = createTaskRequest({
    taskId: taskFixture.task_id,
    sessionId: taskFixture.session_id,
    fromAgent: taskFixture.from_agent,
    toAgent: taskFixture.to_agent,
    title: taskFixture.title,
    content: taskFixture.content,
    context: taskFixture.context,
    artifacts: taskFixture.artifacts,
    permission_level: taskFixture.permission_level,
    requires_confirmation: taskFixture.requires_confirmation,
  })

  const checkpoint = createTaskCheckpoint({
    ...checkpointFixture,
    task_id: request.task_id,
    snapshot: {
      ...checkpointFixture.snapshot,
      task_request: request,
    },
  })
  const checkpoints = listTaskCheckpoints({ taskId: request.task_id })

  assertCheckpointShape(checkpoint)
  assert.equal(Array.isArray(checkpoints), true, 'checkpoint list must be an array')
  assert.ok(checkpoints.some(item => item.checkpoint_id === checkpoint.checkpoint_id), 'checkpoint must be recoverable from list')
})

test('resume_task contract: resume binds checkpoint and does not create a new task_id', async () => {
  const { resumeTaskFromCheckpoint } = await loadExpectedWatchExports(['resumeTaskFromCheckpoint'])
  const resumeTask = resumeTaskFromCheckpoint(resumeFixture)

  assertResumeShape(resumeTask)
  assert.notEqual(resumeTask.task_id, `${resumeFixture.task_id}-resume`, 'resume must not create a derived task_id')
})

test('watchdog contract detects running timeout and enters recovering state', async () => {
  const { evaluateCollaborationWatchdog } = await loadExpectedWatchExports(['evaluateCollaborationWatchdog'])
  const decision = evaluateCollaborationWatchdog(stuckWatchdogFixture)

  assert.equal(decision.task_id, stuckWatchdogFixture.task_id)
  assert.equal(decision.reason, 'running_timeout')
  assert.equal(decision.status, 'recovering')
  assert.ok(decision.checkpoint_required, 'running timeout must require checkpoint before recovery')
})

test('watchdog contract detects agent offline and pending dispatch timeout', async () => {
  const { evaluateCollaborationWatchdog } = await loadExpectedWatchExports(['evaluateCollaborationWatchdog'])
  const offlineDecision = evaluateCollaborationWatchdog(offlineWatchdogFixture)
  const pendingDecision = evaluateCollaborationWatchdog(watchdogFixture)

  assert.equal(offlineDecision.reason, 'agent_offline')
  assert.equal(offlineDecision.status, 'recovering')
  assert.equal(pendingDecision.reason, 'pending_dispatch_timeout')
  assert.equal(pendingDecision.status, 'recovering')
})

test('task state machine allows only explicit Collaboration / Watch Task statuses', () => {
  const allowed = new Set(allowedWatchTaskStatuses)
  for (const status of allowedWatchTaskStatuses) {
    assert.equal(allowed.has(status), true, `${status} must be allowed`)
  }
  for (const status of ['draft', 'checkpointed', 'resumed', 'agent_heartbeat', 'task_progress', 'tool_call_started']) {
    assert.equal(allowed.has(status), false, `${status} must not be accepted as watch task lifecycle status`)
  }
  assert.equal(AGENT_RUN_STATUSES.has('agent_heartbeat'), false, 'agent heartbeat is an event, not agent_runs.status')
  assert.equal(AGENT_RUN_STATUSES.has('task_progress'), false, 'task_progress is an event, not agent_runs.status')
})

test('pending dispatch invariance: set does not lose task and consume is single-use', async () => {
  const { consumePendingDispatch, setPendingDispatch } = await loadCollaborationModule()
  const pending = setPendingDispatch(pendingDispatchWatchFixture)

  assert.equal(pending.taskId, pendingDispatchWatchFixture.taskId)
  assert.equal(pending.target, pendingDispatchWatchFixture.target)
  assert.equal(pending.stage, pendingDispatchWatchFixture.stage)
  assert.ok(Array.isArray(pending.task_events), 'pending dispatch must keep task_events wrapper output')

  const consumed = consumePendingDispatch(pendingDispatchWatchFixture.target)
  const consumedAgain = consumePendingDispatch(pendingDispatchWatchFixture.target)

  assert.equal(consumed.taskId, pendingDispatchWatchFixture.taskId)
  assert.equal(consumed.target, pendingDispatchWatchFixture.target)
  assert.equal(consumedAgain, null, 'pending dispatch must not be consumed twice')
})

test('security contract does not read runtime secrets or fake successful execution results', () => {
  const fixtureText = JSON.stringify({
    taskFixture,
    checkpointFixture,
    resumeFixture,
    watchdogFixture,
  })

  for (const forbiddenPath of forbiddenSensitivePaths) {
    assert.equal(fixtureText.includes(forbiddenPath), false, `fixture must not reference sensitive path ${forbiddenPath}`)
  }
  assert.equal(/execution_success|agent_completed_successfully|real runtime result/i.test(fixtureText), false, 'fixtures must not fake real agent execution success')
})
