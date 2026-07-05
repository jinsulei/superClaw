import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collaborationLocalMessageFixture,
  sensitivePayloadFixture,
  validActionGuardBlockedEvent,
  validAgentHeartbeatEvent,
  validAgentRunHeartbeat,
  validAgentRunStarted,
  validApprovalRequiredEvent,
  validTaskCreatedEvent,
  validToolRunCompleted,
  validToolRunFailed,
  validToolRunStarted,
} from './fixtures/observability-events.fixture.js'

const CONTRACT_SCOPE = [
  'first version validates schema / normalizer / wrapper contract only',
  'wrap src/lib/collaboration.js local task messages first',
  'do not create a second collaboration/task system',
  'do not rewrite scripts/dev-api.js',
  'do not rewrite src/engines/hermes/pages/chat.js',
]

const TASK_EVENT_VISIBILITY = new Set(['normal', 'debug', 'audit_only', 'hidden_sensitive'])
const TASK_EVENT_STATUS = new Set([
  'created',
  'planned',
  'running',
  'waiting_human',
  'recovering',
  'completed',
  'failed',
  'cancelled',
  'blocked',
])
const TOOL_RUN_STATUS = new Set(['started', 'running', 'completed', 'failed', 'cancelled'])
const AGENT_RUN_STATUS = new Set([
  'created',
  'running',
  'waiting_human',
  'recovering',
  'completed',
  'failed',
  'cancelled',
  'blocked',
])
const EVENT_TYPES = new Set([
  'user_message',
  'task_created',
  'task_planned',
  'task_started',
  'task_progress',
  'task_waiting_human',
  'task_recovering',
  'task_completed',
  'task_failed',
  'tool_call_started',
  'tool_call_completed',
  'tool_call_failed',
  'agent_command_sent',
  'agent_status_update',
  'agent_heartbeat',
  'agent_checkpoint_saved',
  'agent_resume_requested',
  'agent_resume_completed',
  'permission_checked',
  'action_guard_blocked',
  'approval_required',
  'approval_granted',
  'approval_rejected',
  'audit_recorded',
])

const SENSITIVE_VALUES = [
  sensitivePayloadFixture.api_key,
  sensitivePayloadFixture.token,
  sensitivePayloadFixture.cookie,
  sensitivePayloadFixture.secret,
  sensitivePayloadFixture.access_token,
  sensitivePayloadFixture.refresh_token,
  sensitivePayloadFixture.password,
]

function assertIsoTimestamp(value, fieldName) {
  assert.equal(typeof value, 'string', `${fieldName} must be a string`)
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, `${fieldName} must be stable ISO timestamp`)
  assert.equal(new Date(value).toISOString(), value, `${fieldName} must round-trip as ISO timestamp`)
}

function assertNoSensitiveValues(value, fieldName) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sensitiveValue of SENSITIVE_VALUES) {
    assert.equal(serialized.includes(sensitiveValue), false, `${fieldName} leaks sensitive fixture value`)
  }
}

function assertVisibleText(value) {
  assert.equal(typeof value, 'string', 'visible_text must be a string')
  assert.equal(value.trim().length > 0, true, 'visible_text must not be empty')
  assert.equal(/^\s*[\[{]/.test(value), false, 'visible_text must not look like an object dump')
  assert.equal(value.includes('[object Object]'), false, 'visible_text must not be implicit object dump')
}

function assertTaskEventContract(event) {
  assert.ok(event.event_id, 'event_id is required')
  assert.ok(event.task_id, 'task_id is required')
  assert.ok(event.task_type, 'task_type is required')
  assert.ok(event.event_type, 'event_type is required')
  assert.equal(EVENT_TYPES.has(event.event_type), true, `event_type is not allowed: ${event.event_type}`)
  assert.ok(event.actor, 'actor is required')
  assert.ok(event.status, 'status is required')
  assert.equal(TASK_EVENT_STATUS.has(event.status), true, `task event status is not allowed: ${event.status}`)
  assertIsoTimestamp(event.created_at, 'created_at')
  assertVisibleText(event.visible_text)
  assert.equal(TASK_EVENT_VISIBILITY.has(event.visibility), true, `visibility is not allowed: ${event.visibility}`)
  assertNoSensitiveValues(event.raw_payload ?? {}, 'raw_payload')
}

function assertToolRunContract(toolRun) {
  assert.ok(toolRun.tool_run_id, 'tool_run_id is required')
  assert.ok(toolRun.task_id, 'task_id is required')
  assert.ok(toolRun.tool_name, 'tool_name is required')
  assert.equal(TOOL_RUN_STATUS.has(toolRun.status), true, `tool run status is not allowed: ${toolRun.status}`)
  assertIsoTimestamp(toolRun.started_at, 'started_at')
  if (toolRun.status === 'completed') {
    assert.ok(toolRun.completed_at, 'completed tool run must have completed_at')
    assertIsoTimestamp(toolRun.completed_at, 'completed_at')
  }
  if (toolRun.status === 'failed') {
    assert.ok(toolRun.error_code, 'failed tool run must have error_code')
    assert.match(toolRun.error_code, /^[A-Z0-9_]+$/, 'error_code must be stable uppercase code')
  }
  assertNoSensitiveValues(toolRun.input_summary ?? '', 'input_summary')
  assertNoSensitiveValues(toolRun.output_summary ?? '', 'output_summary')
}

function assertAgentRunContract(agentRun) {
  assert.ok(agentRun.agent_run_id, 'agent_run_id is required')
  assert.ok(agentRun.task_id, 'task_id is required')
  assert.ok(agentRun.agent_name, 'agent_name is required')
  assert.equal(AGENT_RUN_STATUS.has(agentRun.status), true, `agent run status is not allowed: ${agentRun.status}`)
  assert.equal(typeof agentRun.resume_supported, 'boolean', 'resume_supported must be boolean')
  if (agentRun.heartbeat_at) assertIsoTimestamp(agentRun.heartbeat_at, 'heartbeat_at')
  if (agentRun.error_code) assert.match(agentRun.error_code, /^[A-Z0-9_]+$/, 'error_code must be stable uppercase code')
  if (agentRun.error_message) assertNoSensitiveValues(agentRun.error_message, 'error_message')
}

function redactSensitivePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (/api_key|token|cookie|secret|password/i.test(key)) return [key, '[REDACTED]']
      return [key, value]
    }),
  )
}

function mapCollaborationLocalMessageToTaskEvent(message) {
  return {
    task_id: message.task_id,
    task_type: 'collaboration',
    event_type: message.type,
    actor: message.role,
    visible_text: message.text,
    status: message.status,
    created_at: message.created_at,
  }
}

test('task_events contract accepts valid task, approval, and action guard events', () => {
  assertTaskEventContract(validTaskCreatedEvent)
  assertTaskEventContract(validAgentHeartbeatEvent)
  assertTaskEventContract(validApprovalRequiredEvent)
  assertTaskEventContract(validActionGuardBlockedEvent)
})

test('tool_runs contract validates started, completed, and failed runs', () => {
  assertToolRunContract(validToolRunStarted)
  assertToolRunContract(validToolRunCompleted)
  assertToolRunContract(validToolRunFailed)
})

test('agent_runs contract validates started and heartbeat runs', () => {
  assertAgentRunContract(validAgentRunStarted)
  assertAgentRunContract(validAgentRunHeartbeat)
  assert.equal(validAgentRunHeartbeat.status, 'running', 'agent heartbeat fixture status must remain lifecycle status')
  assert.ok(validAgentRunHeartbeat.heartbeat_at, 'agent heartbeat fixture must carry heartbeat_at')
  assert.equal(EVENT_TYPES.has('agent_heartbeat'), true, 'agent_heartbeat must be a task event type')
  assert.equal(AGENT_RUN_STATUS.has('agent_heartbeat'), false, 'agent_heartbeat must not be an agent run status')
  assert.equal(AGENT_RUN_STATUS.has('heartbeat'), false, 'heartbeat must not be an agent run status')
  assert.equal(AGENT_RUN_STATUS.has('tool_call_started'), false, 'tool event types must not be agent run statuses')
  assert.equal(AGENT_RUN_STATUS.has('tool_call_completed'), false, 'tool event types must not be agent run statuses')
  assert.equal(AGENT_RUN_STATUS.has('task_progress'), false, 'task event types must not be agent run statuses')
})

test('event_type enum covers required observability events', () => {
  for (const eventType of [
    'tool_call_started',
    'tool_call_completed',
    'tool_call_failed',
    'agent_command_sent',
    'agent_status_update',
    'agent_heartbeat',
    'approval_required',
    'approval_granted',
    'approval_rejected',
    'action_guard_blocked',
    'task_completed',
    'task_failed',
  ]) {
    assert.equal(EVENT_TYPES.has(eventType), true, `${eventType} must be allowed`)
  }
})

test('visible normal/debug summaries do not expose sensitive fixture values', () => {
  const sanitized = redactSensitivePayload(sensitivePayloadFixture)
  const normalVisibleOutput = `Summary: ${sanitized.safe_summary}`
  const debugVisibleOutput = JSON.stringify({
    payload_shape: Object.keys(sanitized),
    sanitized_payload: sanitized,
  })

  assertNoSensitiveValues(normalVisibleOutput, 'normal visible output')
  assertNoSensitiveValues(debugVisibleOutput, 'debug visible output')
})

test('no_parallel_impl contract is documented in the contract scope', () => {
  const scopeText = CONTRACT_SCOPE.join('\n')
  assert.match(scopeText, /schema \/ normalizer \/ wrapper contract only/)
  assert.match(scopeText, /src\/lib\/collaboration\.js local task messages/)
  assert.match(scopeText, /do not create a second collaboration\/task system/)
  assert.match(scopeText, /do not rewrite scripts\/dev-api\.js/)
  assert.match(scopeText, /do not rewrite src\/engines\/hermes\/pages\/chat\.js/)
})

test('collaboration local message fixture maps to task_events minimum fields', () => {
  const mapped = mapCollaborationLocalMessageToTaskEvent(collaborationLocalMessageFixture)
  assert.ok(mapped.task_id, 'mapped task_id is required')
  assert.ok(mapped.event_type, 'mapped event_type is required')
  assert.ok(mapped.actor, 'mapped actor is required')
  assert.ok(mapped.visible_text, 'mapped visible_text is required')
  assert.ok(mapped.status, 'mapped status is required')
  assert.ok(mapped.created_at, 'mapped created_at is required')
  assert.equal(EVENT_TYPES.has(mapped.event_type), true, 'mapped event_type must be allowed')
  assert.equal(TASK_EVENT_STATUS.has(mapped.status), true, 'mapped status must be allowed')
  assertVisibleText(mapped.visible_text)
  assertIsoTimestamp(mapped.created_at, 'mapped created_at')
})
