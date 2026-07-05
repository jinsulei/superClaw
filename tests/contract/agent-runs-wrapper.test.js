import test from 'node:test'
import assert from 'node:assert/strict'

import {
  agentFailedStatusFixture,
  agentHeartbeatFixture,
  claudeCodeStatusFixture,
  codexReservedFixture,
  hermesStatusFixture,
  openclawStatusFixture,
  sensitiveAgentStatusFixture,
} from './fixtures/agent-status.fixture.js'

const CONTRACT_SCOPE = [
  'first version only allows wrap_existing / patch_existing',
  'do not create a second Agent Dispatcher',
  'do not create a second agent runtime',
  'do not split or rewrite scripts-dev-api.js',
  'do not rewrite Claude Code panel',
  'do not rewrite OpenClaw UI',
  'do not mark Codex as implemented',
  'first wrapper version only covers existing agent status snapshot / gateway status',
]

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
const TASK_EVENT_TYPES = new Set([
  'agent_status_update',
  'agent_heartbeat',
])
const TASK_EVENT_VISIBILITY = new Set(['normal', 'debug', 'audit_only', 'hidden_sensitive'])
const SENSITIVE_VALUES = [
  sensitiveAgentStatusFixture.api_key,
  sensitiveAgentStatusFixture.token,
  sensitiveAgentStatusFixture.cookie,
  sensitiveAgentStatusFixture.secret,
  sensitiveAgentStatusFixture.access_token,
  sensitiveAgentStatusFixture.refresh_token,
  sensitiveAgentStatusFixture.password,
]

async function loadExpectedWrapperExports() {
  const mod = await import('../../src/lib/agent-gateway-status.js')
  const expected = {
    mapAgentGatewayStatusToAgentRun: mod.mapAgentGatewayStatusToAgentRun,
    mapAgentHeartbeatToAgentRun: mod.mapAgentHeartbeatToAgentRun,
    mapAgentStatusToTaskEvent: mod.mapAgentStatusToTaskEvent,
    redactAgentRunPayload: mod.redactAgentRunPayload,
    normalizeAgentRunStatus: mod.normalizeAgentRunStatus,
  }

  for (const [name, value] of Object.entries(expected)) {
    assert.equal(
      typeof value,
      'function',
      `expected failing contract: src/lib/agent-gateway-status.js must export ${name}`,
    )
  }

  return expected
}

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

function assertAgentRunBase(agentRun) {
  assert.ok(agentRun.agent_run_id, 'agent_run_id is required')
  assert.ok(agentRun.task_id, 'task_id is required')
  assert.ok(agentRun.agent_name, 'agent_name is required')
  assert.ok(agentRun.adapter_name, 'adapter_name is required')
  assert.equal(AGENT_RUN_STATUS.has(agentRun.status), true, `agent run status is not allowed: ${agentRun.status}`)
  assert.equal(typeof agentRun.resume_supported, 'boolean', 'resume_supported must be boolean')
  assertIsoTimestamp(agentRun.started_at, 'started_at')
  if (agentRun.heartbeat_at) assertIsoTimestamp(agentRun.heartbeat_at, 'heartbeat_at')
  if (agentRun.completed_at) assertIsoTimestamp(agentRun.completed_at, 'completed_at')
  if (agentRun.error_code) assert.match(agentRun.error_code, /^[A-Z0-9_]+$/, 'error_code must be stable uppercase code')
  assertNoSensitiveValues(agentRun.current_step ?? '', 'current_step')
  assertNoSensitiveValues(agentRun.error_message ?? '', 'error_message')
  assertNoSensitiveValues(agentRun, 'agent_run')
}

function assertTaskEventBase(event) {
  assert.ok(event.event_id, 'event_id is required')
  assert.ok(event.task_id, 'task_id is required')
  assert.equal(TASK_EVENT_TYPES.has(event.event_type), true, `unexpected task event type: ${event.event_type}`)
  assert.ok(event.actor, 'actor is required')
  assertIsoTimestamp(event.created_at, 'created_at')
  assert.equal(TASK_EVENT_VISIBILITY.has(event.visibility), true, `visibility is not allowed: ${event.visibility}`)
  assertNoSensitiveValues(event.visible_text ?? '', 'task_event.visible_text')
  assertNoSensitiveValues(event.raw_payload ?? {}, 'task_event.raw_payload')
}

test('no_parallel_impl guard documents agent_runs wrapper scope', () => {
  const scopeText = CONTRACT_SCOPE.join('\n')
  assert.match(scopeText, /wrap_existing \/ patch_existing/)
  assert.match(scopeText, /do not create a second Agent Dispatcher/)
  assert.match(scopeText, /do not create a second agent runtime/)
  assert.match(scopeText, /do not split or rewrite scripts-dev-api\.js/)
  assert.match(scopeText, /do not rewrite Claude Code panel/)
  assert.match(scopeText, /do not rewrite OpenClaw UI/)
  assert.match(scopeText, /do not mark Codex as implemented/)
  assert.match(scopeText, /existing agent status snapshot \/ gateway status/)
})

test('agent-gateway-status exports the expected agent_runs wrapper helpers', async () => {
  await loadExpectedWrapperExports()
})

test('normalizeAgentRunStatus maps gateway and lifecycle statuses to allowed agent_runs statuses', async () => {
  const { normalizeAgentRunStatus } = await loadExpectedWrapperExports()
  const cases = [
    ['ready', 'running'],
    ['connected', 'running'],
    ['running', 'running'],
    ['online', 'running'],
    ['starting', 'created'],
    ['created', 'created'],
    ['waiting_human', 'waiting_human'],
    ['recovering', 'recovering'],
    ['failed', 'failed'],
    ['error', 'failed'],
    ['offline', 'failed'],
    ['stopped', 'cancelled'],
    ['cancelled', 'cancelled'],
    ['blocked', 'blocked'],
  ]

  for (const [input, expected] of cases) {
    assert.equal(normalizeAgentRunStatus(input), expected, `${input} should map to ${expected}`)
  }

  assert.equal(AGENT_RUN_STATUS.has(normalizeAgentRunStatus('unexpected-fixture-status')), true, 'unknown status must map to an allowed lifecycle status')
  assert.equal(AGENT_RUN_STATUS.has('agent_heartbeat'), false, 'agent_heartbeat must not be an agent run status')
})

test('OpenClaw gateway status maps into agent_runs contract', async () => {
  const { mapAgentGatewayStatusToAgentRun } = await loadExpectedWrapperExports()
  const agentRun = mapAgentGatewayStatusToAgentRun(openclawStatusFixture)

  assertAgentRunBase(agentRun)
  assert.equal(agentRun.agent_name, 'openclaw')
  assert.match(agentRun.adapter_name, /openclaw/i)
})

test('Hermes gateway status maps into agent_runs contract', async () => {
  const { mapAgentGatewayStatusToAgentRun } = await loadExpectedWrapperExports()
  const agentRun = mapAgentGatewayStatusToAgentRun(hermesStatusFixture)

  assertAgentRunBase(agentRun)
  assert.equal(agentRun.agent_name, 'hermes')
  assert.match(agentRun.adapter_name, /hermes/i)
  assert.match(agentRun.agent_run_id, /hermes-run-fixture-001|hermes/i)
})

test('Claude Code panel status maps into agent_runs contract', async () => {
  const { mapAgentGatewayStatusToAgentRun } = await loadExpectedWrapperExports()
  const agentRun = mapAgentGatewayStatusToAgentRun(claudeCodeStatusFixture)

  assertAgentRunBase(agentRun)
  assert.equal(agentRun.agent_name, 'claude_code')
  assert.match(agentRun.adapter_name, /claude/i)
})

test('agent heartbeat maps to running agent_run and task_event agent_heartbeat', async () => {
  const { mapAgentHeartbeatToAgentRun, mapAgentStatusToTaskEvent } = await loadExpectedWrapperExports()
  const agentRun = mapAgentHeartbeatToAgentRun(agentHeartbeatFixture)
  const event = mapAgentStatusToTaskEvent(agentHeartbeatFixture, { event_type: 'agent_heartbeat' })

  assertAgentRunBase(agentRun)
  assert.equal(agentRun.status, 'running')
  assert.ok(agentRun.heartbeat_at, 'heartbeat_at is required for heartbeat mapping')
  assert.equal(typeof agentRun.resume_supported, 'boolean')
  assertTaskEventBase(event)
  assert.equal(event.event_type, 'agent_heartbeat')
  assert.equal(AGENT_RUN_STATUS.has('agent_heartbeat'), false)
})

test('failed agent status maps stable error fields without leaking secrets', async () => {
  const { mapAgentGatewayStatusToAgentRun } = await loadExpectedWrapperExports()
  const agentRun = mapAgentGatewayStatusToAgentRun(agentFailedStatusFixture)

  assertAgentRunBase(agentRun)
  assert.equal(agentRun.status, 'failed')
  assert.ok(agentRun.error_code, 'failed agent_run must include error_code')
  assert.equal(typeof agentRun.error_message, 'string', 'failed agent_run must include error_message string')
})

test('Codex reserved remains planned/reserved rather than runtime implemented', async () => {
  const { mapAgentGatewayStatusToAgentRun } = await loadExpectedWrapperExports()
  const agentRun = mapAgentGatewayStatusToAgentRun(codexReservedFixture)

  assert.equal(codexReservedFixture.implemented, false, 'Codex fixture must remain not implemented')
  assertAgentRunBase(agentRun)
  assert.equal(agentRun.agent_name, 'codex')
  assert.equal(['blocked', 'created'].includes(agentRun.status), true, 'reserved Codex should map to blocked or created')
  assert.match(agentRun.adapter_name, /codex_(reserved|planned)/)
})

test('redactAgentRunPayload removes sensitive fixture values from agent_run and task_event fields', async () => {
  const { mapAgentGatewayStatusToAgentRun, mapAgentStatusToTaskEvent, redactAgentRunPayload } = await loadExpectedWrapperExports()
  const redactedPayload = redactAgentRunPayload(sensitiveAgentStatusFixture)
  const agentRun = mapAgentGatewayStatusToAgentRun(sensitiveAgentStatusFixture)
  const event = mapAgentStatusToTaskEvent(sensitiveAgentStatusFixture)

  assertNoSensitiveValues(redactedPayload, 'redacted payload')
  assertNoSensitiveValues(agentRun.error_message ?? '', 'error_message')
  assertNoSensitiveValues(agentRun.current_step ?? '', 'current_step')
  assertNoSensitiveValues(agentRun, 'agent_run')
  assertTaskEventBase(event)
  assertNoSensitiveValues(event.visible_text ?? '', 'task_event.visible_text')
  assertNoSensitiveValues(event.raw_payload ?? {}, 'task_event.raw_payload')
})

