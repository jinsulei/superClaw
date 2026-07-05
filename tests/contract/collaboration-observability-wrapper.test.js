import test from 'node:test'
import assert from 'node:assert/strict'

import {
  approvalRequiredMessageFixture,
  pendingDispatchFixture,
  sensitiveCollaborationMessageFixture,
  sensitiveCollaborationValues,
  taskDelegateMessageFixture,
  taskErrorMessageFixture,
  taskProgressMessageFixture,
  taskRequestMessageFixture,
  taskResultMessageFixture,
} from './fixtures/collaboration-messages.fixture.js'

const WRAPPER_SCOPE = [
  'only wrap_existing / patch_existing is allowed',
  'do not create a second collaboration/task system',
  'do not rewrite scripts/dev-api.js',
  'do not rewrite chat.js',
  'do not change the existing collaboration return shape',
  'first wrapper version must attach minimally around saveAgentTaskMessage() / local task messages',
]

const TASK_EVENT_TYPES = new Set([
  'task_created',
  'task_progress',
  'task_completed',
  'task_failed',
  'agent_command_sent',
  'approval_required',
])

const TASK_EVENT_STATUSES = new Set([
  'created',
  'running',
  'waiting_human',
  'completed',
  'failed',
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

function assertExistingMessageShape(row, fixture) {
  for (const field of [
    'task_id',
    'from_agent',
    'to_agent',
    'message_type',
    'status',
    'title',
    'content',
    'requires_confirmation',
  ]) {
    assert.ok(Object.hasOwn(row, field), `existing field must remain: ${field}`)
  }
  assert.equal(row.task_id, fixture.task_id)
  assert.equal(row.from_agent, fixture.from_agent)
  assert.equal(row.to_agent, fixture.to_agent)
  assert.equal(row.message_type, fixture.message_type)
  assert.equal(row.title, fixture.title)
  assert.equal(row.content, fixture.content)
}

function assertTaskEvents(row) {
  assert.ok(Array.isArray(row.task_events), 'future wrapper must attach task_events array')
  assert.equal(row.task_events.length > 0, true, 'task_events must contain at least one event')
  return row.task_events
}

function findEvent(row, eventType) {
  return assertTaskEvents(row).find(event => event.event_type === eventType)
}

function assertTaskEvent(event, expected = {}) {
  assert.ok(event, `missing task_event ${expected.event_type || ''}`.trim())
  assert.ok(event.event_id, 'event_id is required')
  assert.ok(event.task_id, 'task_id is required')
  assert.ok(event.task_type, 'task_type is required')
  assert.equal(TASK_EVENT_TYPES.has(event.event_type), true, `unexpected event_type: ${event.event_type}`)
  assert.equal(TASK_EVENT_STATUSES.has(event.status), true, `unexpected status: ${event.status}`)
  assert.equal(typeof event.actor, 'string', 'actor must be string')
  assert.equal(typeof event.visible_text, 'string', 'visible_text must be string')
  assert.equal(/^\s*[\[{]/.test(event.visible_text), false, 'visible_text must not be object dump')
  assert.match(event.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'created_at must be stable ISO timestamp')
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(event[key], value, `${key} mismatch`)
  }
}

function assertNoSensitiveValues(value, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sensitiveValue of sensitiveCollaborationValues) {
    assert.equal(serialized.includes(sensitiveValue), false, `${label} leaks ${sensitiveValue}`)
  }
}

test('no_parallel_impl guard documents wrapper scope', () => {
  const scope = WRAPPER_SCOPE.join('\n')
  assert.match(scope, /wrap_existing \/ patch_existing/)
  assert.match(scope, /do not create a second collaboration\/task system/)
  assert.match(scope, /do not rewrite scripts\/dev-api\.js/)
  assert.match(scope, /do not rewrite chat\.js/)
  assert.match(scope, /do not change the existing collaboration return shape/)
  assert.match(scope, /saveAgentTaskMessage\(\) \/ local task messages/)
})

test('createTaskRequest keeps existing fields and emits task_created event', async () => {
  const { createTaskRequest } = await loadCollaborationModule()
  const row = createTaskRequest({
    taskId: taskRequestMessageFixture.task_id,
    sessionId: taskRequestMessageFixture.session_id,
    parentTaskId: taskRequestMessageFixture.parent_task_id,
    fromAgent: taskRequestMessageFixture.from_agent,
    toAgent: taskRequestMessageFixture.to_agent,
    title: taskRequestMessageFixture.title,
    content: taskRequestMessageFixture.content,
    context: taskRequestMessageFixture.context,
    artifacts: taskRequestMessageFixture.artifacts,
    mode: taskRequestMessageFixture.mode,
    permission_level: taskRequestMessageFixture.permission_level,
    requires_confirmation: taskRequestMessageFixture.requires_confirmation,
  })

  assertExistingMessageShape(row, taskRequestMessageFixture)
  const event = findEvent(row, 'task_created')
  assertTaskEvent(event, {
    event_type: 'task_created',
    status: 'created',
    actor: taskRequestMessageFixture.from_agent,
  })
  assertNoSensitiveValues(event.visible_text, 'task_created visible_text')
  assertNoSensitiveValues(event.raw_payload ?? {}, 'task_created raw_payload')
})

test('createTaskProgress emits task_progress event', async () => {
  const { createTaskProgress } = await loadCollaborationModule()
  const row = createTaskProgress({
    taskId: taskProgressMessageFixture.task_id,
    sessionId: taskProgressMessageFixture.session_id,
    fromAgent: taskProgressMessageFixture.from_agent,
    toAgent: taskProgressMessageFixture.to_agent,
    title: taskProgressMessageFixture.title,
    content: taskProgressMessageFixture.content,
    context: taskProgressMessageFixture.context,
    artifacts: taskProgressMessageFixture.artifacts,
  })

  assertExistingMessageShape(row, taskProgressMessageFixture)
  assertTaskEvent(findEvent(row, 'task_progress'), {
    event_type: 'task_progress',
    status: 'running',
  })
})

test('createTaskResult emits task_completed event for successful results', async () => {
  const { createTaskResult } = await loadCollaborationModule()
  const row = createTaskResult({
    taskId: taskResultMessageFixture.task_id,
    sessionId: taskResultMessageFixture.session_id,
    fromAgent: taskResultMessageFixture.from_agent,
    toAgent: taskResultMessageFixture.to_agent,
    title: taskResultMessageFixture.title,
    content: taskResultMessageFixture.content,
    context: taskResultMessageFixture.context,
    artifacts: taskResultMessageFixture.artifacts,
  })

  assertExistingMessageShape(row, taskResultMessageFixture)
  assertTaskEvent(findEvent(row, 'task_completed'), {
    event_type: 'task_completed',
    status: 'completed',
  })
})

test('createTaskResult emits task_failed event for failed results', async () => {
  const { createTaskResult } = await loadCollaborationModule()
  const row = createTaskResult({
    taskId: taskErrorMessageFixture.task_id,
    parentTaskId: taskErrorMessageFixture.parent_task_id,
    sessionId: taskErrorMessageFixture.session_id,
    fromAgent: taskErrorMessageFixture.from_agent,
    toAgent: taskErrorMessageFixture.to_agent,
    title: taskErrorMessageFixture.title,
    content: taskErrorMessageFixture.content,
    failed: true,
    context: taskErrorMessageFixture.context,
    artifacts: taskErrorMessageFixture.artifacts,
  })

  assertExistingMessageShape(row, taskErrorMessageFixture)
  assertTaskEvent(findEvent(row, 'task_failed'), {
    event_type: 'task_failed',
    status: 'failed',
  })
})

test('createTaskDelegate emits agent_command_sent event', async () => {
  const { createTaskDelegate } = await loadCollaborationModule()
  const row = createTaskDelegate({
    taskId: taskDelegateMessageFixture.task_id,
    parentTaskId: taskDelegateMessageFixture.parent_task_id,
    sessionId: taskDelegateMessageFixture.session_id,
    fromAgent: taskDelegateMessageFixture.from_agent,
    toAgent: taskDelegateMessageFixture.to_agent,
    title: taskDelegateMessageFixture.title,
    content: taskDelegateMessageFixture.content,
    context: taskDelegateMessageFixture.context,
    artifacts: taskDelegateMessageFixture.artifacts,
    mode: taskDelegateMessageFixture.mode,
    permission_level: taskDelegateMessageFixture.permission_level,
    requires_confirmation: taskDelegateMessageFixture.requires_confirmation,
  })

  assertExistingMessageShape(row, taskDelegateMessageFixture)
  const event = findEvent(row, 'agent_command_sent')
  assertTaskEvent(event, { event_type: 'agent_command_sent' })
  assert.equal(['running', 'created'].includes(event.status), true, 'delegate event status must be running or created')
  assert.equal(event.actor, taskDelegateMessageFixture.from_agent)
})

test('requires_confirmation messages emit approval_required alongside task event', async () => {
  const { createTaskRequest } = await loadCollaborationModule()
  const row = createTaskRequest({
    taskId: approvalRequiredMessageFixture.task_id,
    sessionId: approvalRequiredMessageFixture.session_id,
    fromAgent: approvalRequiredMessageFixture.from_agent,
    toAgent: approvalRequiredMessageFixture.to_agent,
    title: approvalRequiredMessageFixture.title,
    content: approvalRequiredMessageFixture.content,
    context: approvalRequiredMessageFixture.context,
    artifacts: approvalRequiredMessageFixture.artifacts,
    mode: approvalRequiredMessageFixture.mode,
    permission_level: approvalRequiredMessageFixture.permission_level,
    requires_confirmation: approvalRequiredMessageFixture.requires_confirmation,
  })

  assertExistingMessageShape(row, approvalRequiredMessageFixture)
  assertTaskEvent(findEvent(row, 'task_created'), { event_type: 'task_created', status: 'created' })
  assertTaskEvent(findEvent(row, 'approval_required'), {
    event_type: 'approval_required',
    status: 'waiting_human',
  })
})

test('pending dispatch exposes a mappable observability event gap', async () => {
  const { setPendingDispatch } = await loadCollaborationModule()
  const pending = setPendingDispatch(pendingDispatchFixture)
  assert.equal(pending.taskId, pendingDispatchFixture.taskId)
  assert.equal(pending.target, pendingDispatchFixture.target)
  assert.equal(pending.stage, pendingDispatchFixture.stage)
  assert.ok(Array.isArray(pending.task_events), 'future wrapper must attach task_events to pending dispatch')
  assert.equal(
    pending.task_events.some(event => event.event_type === 'agent_command_sent' || event.event_type === 'task_progress'),
    true,
    'pending dispatch must map to agent_command_sent or task_progress',
  )
})

test('collaboration wrapper redacts sensitive values from visible text, raw payload, and task_events', async () => {
  const { createTaskRequest } = await loadCollaborationModule()
  const row = createTaskRequest({
    taskId: sensitiveCollaborationMessageFixture.task_id,
    sessionId: sensitiveCollaborationMessageFixture.session_id,
    fromAgent: sensitiveCollaborationMessageFixture.from_agent,
    toAgent: sensitiveCollaborationMessageFixture.to_agent,
    title: sensitiveCollaborationMessageFixture.title,
    content: sensitiveCollaborationMessageFixture.content,
    context: sensitiveCollaborationMessageFixture.context,
    artifacts: sensitiveCollaborationMessageFixture.artifacts,
  })

  assertNoSensitiveValues(row.content, 'existing visible content')
  for (const event of assertTaskEvents(row)) {
    assertNoSensitiveValues(event.visible_text, 'task_event visible_text')
    assertNoSensitiveValues(event.raw_payload ?? {}, 'task_event raw_payload')
  }
  assertNoSensitiveValues(row.task_events, 'task_events')
})
