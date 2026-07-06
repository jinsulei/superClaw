import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  agentHeartbeatFixture,
  claudeCodeStatusFixture,
  hermesStatusFixture,
  openclawStatusFixture,
  sensitiveAgentStatusFixture,
} from '../contract/fixtures/agent-status.fixture.js'
import {
  liveToolCompletedFixture,
  liveToolRunningFixture,
  sensitiveToolFixture,
  toolMessageRowFixture,
} from '../contract/fixtures/hermes-tool-events.fixture.js'

const CHAT_STORE_PATH = 'src/engines/hermes/lib/chat-store.js'
const COLLABORATION_PATH = 'src/lib/collaboration.js'
const AGENT_STATUS_PATH = 'src/lib/agent-gateway-status.js'
const CHAT_PATH = 'src/engines/hermes/pages/chat.js'
const DEV_API_PATH = 'scripts/dev-api.js'
const PACKAGE_PATH = 'package.json'
const TAURI_PATH = 'src-tauri/tauri.conf.json'

const chatStoreSource = readFileSync(CHAT_STORE_PATH, 'utf8')
const collaborationSource = readFileSync(COLLABORATION_PATH, 'utf8')
const agentStatusSource = readFileSync(AGENT_STATUS_PATH, 'utf8')
const chatSource = readFileSync(CHAT_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')
const packageSource = readFileSync(PACKAGE_PATH, 'utf8')
const tauriSource = readFileSync(TAURI_PATH, 'utf8')
const bridgeSource = chatStoreSource.slice(
  chatStoreSource.indexOf('export function buildRuntimeObservabilityBridge'),
  chatStoreSource.indexOf('function safeGet'),
)

const SENSITIVE_VALUES = [
  'fake-api-key-should-be-redacted',
  'fake-token-should-be-redacted',
  'fake-cookie-should-be-redacted',
  'fake-secret-should-be-redacted',
  'fake-access-token-should-be-redacted',
  'fake-refresh-token-should-be-redacted',
  'fake-password-should-be-redacted',
]

async function loadBridge() {
  const mod = await import('../../src/engines/hermes/lib/chat-store.js')
  assert.equal(typeof mod.buildRuntimeObservabilityBridge, 'function', 'Expected gap: runtime observability bridge helper must exist')
  return mod.buildRuntimeObservabilityBridge
}

function assertNoSensitiveValues(value, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sensitive of SENSITIVE_VALUES) {
    assert.equal(text.includes(sensitive), false, `${label} leaks sensitive fixture value`)
  }
}

function assertNoRawPayload(value, label) {
  assert.equal(JSON.stringify(value).includes('"raw_payload"'), false, `${label} must not expose raw_payload`)
}

function taskMessage(messageType, status, overrides = {}) {
  return {
    session_id: 'runtime-observability-session',
    task_id: `runtime-observability-${messageType}`,
    from_agent: messageType === 'task_request' ? 'hermes' : 'openclaw',
    to_agent: messageType === 'task_request' ? 'openclaw' : 'hermes',
    message_type: messageType,
    status,
    title: `${messageType} fixture`,
    content: `${messageType} safe fixture content`,
    created_at: '2026-07-06T15:30:00.000Z',
    ...overrides,
  }
}

test('runtime status snapshots map into agent_runs without fabricating completed agents', async () => {
  const buildRuntimeObservabilityBridge = await loadBridge()
  const result = buildRuntimeObservabilityBridge({
    agent_statuses: [
      openclawStatusFixture,
      claudeCodeStatusFixture,
      hermesStatusFixture,
      sensitiveAgentStatusFixture,
    ],
  })

  assert.equal(result.agent_runs.length, 4)
  assert.ok(result.agent_runs.some(run => run.agent_name === 'openclaw' && run.status === 'running'))
  assert.ok(result.agent_runs.some(run => run.agent_name === 'claude_code' && run.status === 'running'))
  assert.ok(result.agent_runs.some(run => run.agent_name === 'hermes' && run.status === 'running'))
  assert.ok(result.agent_runs.some(run => run.status === 'failed'))
  assert.equal(result.agent_runs.some(run => run.status === 'completed'), false, 'status snapshots must not fake completed agents')
  assertNoSensitiveValues(result, 'agent observability bridge')
  assertNoRawPayload(result, 'agent observability bridge')
})

test('task-bound heartbeat outputs both agent_runs and task_events with task identity', async () => {
  const buildRuntimeObservabilityBridge = await loadBridge()
  const heartbeat = {
    ...agentHeartbeatFixture,
    task_id: 'runtime-heartbeat-task',
    session_id: 'runtime-heartbeat-session',
  }
  const result = buildRuntimeObservabilityBridge({
    heartbeats: [heartbeat],
  })

  assert.equal(result.agent_runs.length, 1)
  assert.equal(result.agent_runs[0].task_id, 'runtime-heartbeat-task')
  assert.equal(result.agent_runs[0].session_id, 'runtime-heartbeat-session')
  assert.equal(result.task_events.length, 1)
  assert.equal(result.task_events[0].event_type, 'agent_heartbeat')
  assert.equal(result.task_events[0].task_id, 'runtime-heartbeat-task')
  assert.equal(result.task_events[0].session_id, 'runtime-heartbeat-session')
  assertNoRawPayload(result, 'heartbeat observability bridge')
})

test('collaboration progress result error and delegate messages map into task_events', async () => {
  const buildRuntimeObservabilityBridge = await loadBridge()
  const result = buildRuntimeObservabilityBridge({
    task_messages: [
      taskMessage('task_progress', 'running'),
      taskMessage('task_result', 'completed'),
      taskMessage('task_error', 'failed'),
      taskMessage('task_delegate', 'delegated'),
    ],
  })
  const eventTypes = result.task_events.map(event => event.event_type)

  assert.ok(eventTypes.includes('task_progress'))
  assert.ok(eventTypes.includes('task_completed'))
  assert.ok(eventTypes.includes('task_failed'))
  assert.ok(eventTypes.includes('agent_command_sent'))
  assertNoRawPayload(result, 'task event observability bridge')
})

test('Hermes live tools and role tool messages map into tool_runs without fake completion', async () => {
  const buildRuntimeObservabilityBridge = await loadBridge()
  const result = buildRuntimeObservabilityBridge({
    live_tools: [liveToolRunningFixture, liveToolCompletedFixture, sensitiveToolFixture],
    tool_messages: [toolMessageRowFixture],
  })

  assert.equal(result.tool_runs.length, 4)
  assert.ok(result.tool_runs.some(run => run.tool_name === 'assistant_fetch_url' && run.status === 'running'))
  assert.ok(result.tool_runs.some(run => run.tool_name === 'assistant_fetch_url' && run.status === 'completed'))
  assert.ok(result.tool_runs.some(run => run.status === 'failed'))
  assert.equal(result.tool_runs.find(run => run.tool_run_id === liveToolRunningFixture.id)?.status, 'running')
  assertNoSensitiveValues(result, 'tool observability bridge')
  assertNoRawPayload(result, 'tool observability bridge')
})

test('runtime observability bridge reuses existing helpers and stays out of runtime and UI', () => {
  assert.match(chatStoreSource, /\bmapHermesLiveToolToToolRun\b/)
  assert.match(chatStoreSource, /\bmapHermesToolMessageToToolRun\b/)
  assert.match(chatStoreSource, /\bbuildFrontendAgentStatusViewModel\b/)
  assert.match(agentStatusSource, /\bmapAgentGatewayStatusToAgentRun\b/)
  assert.match(agentStatusSource, /\bmapTaskBoundAgentHeartbeat\b/)
  assert.match(collaborationSource, /\bmapCollaborationTaskMessageToTaskEvents\b/)
  assert.doesNotMatch(chatSource, /runtime-observability-bridge-integration|buildRuntimeObservabilityBridge/)
  assert.doesNotMatch(devApiSource, /runtime-observability-bridge-integration|buildRuntimeObservabilityBridge/)
  assert.doesNotMatch(packageSource + tauriSource, /runtime-observability-bridge-integration|buildRuntimeObservabilityBridge/)
  assert.doesNotMatch(chatStoreSource + collaborationSource + agentStatusSource, /\bsetInterval\s*\(/)
  assert.doesNotMatch(chatStoreSource + collaborationSource + agentStatusSource, /\bclass\s+.*ObservabilityRuntime\b|\bnew\s+.*ObservabilityRuntime\b/)
  assert.doesNotMatch(bridgeSource, /runtime\/data\/secrets|relay-config\.json|\.env/)
})
