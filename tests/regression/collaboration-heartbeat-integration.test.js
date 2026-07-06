import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const COLLABORATION_PATH = 'src/lib/collaboration.js'
const AGENT_GATEWAY_STATUS_PATH = 'src/lib/agent-gateway-status.js'
const DEV_API_PATH = 'scripts/dev-api.js'
const PACKAGE_PATH = 'package.json'
const TAURI_PATH = 'src-tauri/tauri.conf.json'

const collaborationSource = readFileSync(COLLABORATION_PATH, 'utf8')
const agentGatewaySource = readFileSync(AGENT_GATEWAY_STATUS_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')
const packageSource = readFileSync(PACKAGE_PATH, 'utf8')
const tauriSource = readFileSync(TAURI_PATH, 'utf8')

const taskId = 'heartbeat_task_001'
const sessionId = 'heartbeat_session_001'
const freshHeartbeatAt = '2026-07-06T14:00:00.000Z'
const staleHeartbeatAt = '2026-07-06T13:40:00.000Z'

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

async function loadAgentGatewayStatusModule() {
  return import('../../src/lib/agent-gateway-status.js')
}

function buildHeartbeat(agent, heartbeatAt = freshHeartbeatAt) {
  return {
    agent,
    task_id: taskId,
    session_id: sessionId,
    status: 'running',
    heartbeat_at: heartbeatAt,
    message: `${agent} heartbeat for ${taskId}`,
    token: 'fake-token-should-be-redacted',
    apiKey: 'fake-api-key-should-be-redacted',
  }
}

function assertTaskBoundHeartbeat(value, agentName) {
  assert.equal(value.task_id, taskId)
  assert.equal(value.session_id, sessionId)
  assert.equal(value.agent_name || value.actor || value.agent, agentName)
  assert.equal(value.heartbeat_at, freshHeartbeatAt)
}

test('OpenClaw heartbeat binds original task_id and session_id', async () => {
  const { mapTaskBoundAgentHeartbeat } = await loadAgentGatewayStatusModule()
  assert.equal(typeof mapTaskBoundAgentHeartbeat, 'function', 'Expected gap: mapTaskBoundAgentHeartbeat must exist')

  const heartbeat = mapTaskBoundAgentHeartbeat(buildHeartbeat('openclaw'))

  assertTaskBoundHeartbeat(heartbeat, 'openclaw')
  assert.equal(heartbeat.agent_run.task_id, taskId)
  assert.equal(heartbeat.agent_run.session_id, sessionId)
  assert.equal(heartbeat.task_events[0].task_id, taskId)
  assert.equal(heartbeat.task_events[0].session_id, sessionId)
  assert.equal(heartbeat.task_events[0].event_type, 'agent_heartbeat')
})

test('Claude heartbeat binds original task_id and session_id', async () => {
  const { mapTaskBoundAgentHeartbeat } = await loadAgentGatewayStatusModule()
  const heartbeat = mapTaskBoundAgentHeartbeat(buildHeartbeat('claude-code'))

  assertTaskBoundHeartbeat(heartbeat, 'claude_code')
  assert.equal(heartbeat.agent_run.agent_name, 'claude_code')
  assert.equal(heartbeat.agent_run.task_id, taskId)
  assert.equal(heartbeat.agent_run.session_id, sessionId)
  assert.equal(heartbeat.task_events[0].actor, 'claude_code')
})

test('collaboration heartbeat creates task_events and feeds watchdog healthy state', async () => {
  const { createTaskHeartbeat, evaluateCollaborationWatchdog } = await loadCollaborationModule()
  assert.equal(typeof createTaskHeartbeat, 'function', 'Expected gap: createTaskHeartbeat must exist')

  const heartbeat = createTaskHeartbeat(buildHeartbeat('openclaw'))
  const decision = evaluateCollaborationWatchdog({
    task_id: taskId,
    session_id: sessionId,
    status: 'running',
    agent_status: heartbeat,
    now: '2026-07-06T14:01:00.000Z',
    stale_after_ms: 300000,
  })

  assert.equal(heartbeat.task_id, taskId)
  assert.equal(heartbeat.session_id, sessionId)
  assert.equal(heartbeat.task_events[0].event_type, 'agent_heartbeat')
  assert.equal(decision.reason, 'healthy')
  assert.equal(decision.should_recover, false)
  assert.equal(decision.status, 'running')
})

test('stale heartbeat lets watchdog produce recovering state', async () => {
  const { createTaskHeartbeat, evaluateCollaborationWatchdog } = await loadCollaborationModule()
  const heartbeat = createTaskHeartbeat(buildHeartbeat('openclaw', staleHeartbeatAt))
  const decision = evaluateCollaborationWatchdog({
    task_id: taskId,
    session_id: sessionId,
    status: 'running',
    agent_status: heartbeat,
    now: '2026-07-06T14:01:00.000Z',
    stale_after_ms: 300000,
  })

  assert.equal(decision.reason, 'running_timeout')
  assert.equal(decision.status, 'recovering')
  assert.equal(decision.should_recover, true)
  assert.ok(decision.task_events.some(event => event.event_type === 'task_recovering'))
})

test('heartbeat bridge stays on existing collaboration system and does not touch runtimes or secrets', () => {
  assert.match(collaborationSource, /\bevaluateCollaborationWatchdog\b/)
  assert.match(collaborationSource, /\bsetPendingDispatch\b/)
  assert.match(collaborationSource, /\bconsumePendingDispatch\b/)
  assert.match(agentGatewaySource, /\bmapAgentHeartbeatToAgentRun\b/)
  assert.doesNotMatch(collaborationSource + agentGatewaySource, /\bsetInterval\s*\(/)
  assert.doesNotMatch(collaborationSource + agentGatewaySource, /\bclass\s+.*CollaborationRuntime\b|\bnew\s+.*CollaborationRuntime\b/)
  assert.doesNotMatch(devApiSource, /collaboration-heartbeat-integration|mapTaskBoundAgentHeartbeat|createTaskHeartbeat/)
  assert.doesNotMatch(packageSource + tauriSource, /collaboration-heartbeat-integration|mapTaskBoundAgentHeartbeat|createTaskHeartbeat/)
  assert.doesNotMatch(collaborationSource + agentGatewaySource, /runtime\/data\/secrets|relay-config\.json|\.env/)
})
