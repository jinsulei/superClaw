const FIXED_NOW_MS = Date.parse('2026-07-06T02:10:00.000Z')
const FIXED_HEARTBEAT_MS = Date.parse('2026-07-06T02:10:30.000Z')

export const openclawStatusFixture = {
  agent: 'openclaw',
  status: 'ready',
  connected: true,
  ready: true,
  portListening: true,
  pid: 18789,
  error: null,
  checkedAt: FIXED_NOW_MS,
  gatewayUrl: 'http://127.0.0.1:18789',
  version: 'fixture-openclaw-gateway',
  task_id: 'task-agent-openclaw-001',
}

export const hermesStatusFixture = {
  agent: 'hermes',
  status: 'running',
  connected: true,
  ready: true,
  portListening: true,
  pid: 8642,
  error: null,
  checkedAt: FIXED_NOW_MS,
  gatewayUrl: 'http://127.0.0.1:8642',
  run_id: 'hermes-run-fixture-001',
  task_id: 'task-agent-hermes-001',
}

export const claudeCodeStatusFixture = {
  agent: 'claude_code',
  status: 'running',
  running: true,
  ready: true,
  portListening: true,
  pid: 3020,
  error: null,
  checkedAt: FIXED_NOW_MS,
  panelUrl: 'http://127.0.0.1:3020',
  version: 'Claude Code Panel relay fixture',
  task_id: 'task-agent-claude-code-001',
}

export const agentHeartbeatFixture = {
  agent: 'openclaw',
  status: 'connected',
  checkedAt: FIXED_HEARTBEAT_MS,
  lastMessageAt: FIXED_HEARTBEAT_MS,
  connected: true,
  task_id: 'task-agent-openclaw-001',
}

export const agentFailedStatusFixture = {
  agent: 'openclaw',
  status: 'error',
  connected: false,
  ready: false,
  error: {
    code: 'OPENCLAW_GATEWAY_DOWN',
    message: 'Gateway fixture process is unavailable.',
  },
  checkedAt: FIXED_NOW_MS,
  task_id: 'task-agent-openclaw-failed-001',
}

export const codexReservedFixture = {
  agent: 'codex',
  status: 'reserved',
  implemented: false,
  task_id: 'task-agent-codex-reserved-001',
}

export const sensitiveAgentStatusFixture = {
  agent: 'hermes',
  status: 'error',
  connected: false,
  ready: false,
  checkedAt: FIXED_NOW_MS,
  task_id: 'task-agent-sensitive-001',
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  access_token: 'fake-access-token-should-be-redacted',
  refresh_token: 'fake-refresh-token-should-be-redacted',
  password: 'fake-password-should-be-redacted',
  error: {
    code: 'PROVIDER_AUTH_FAILED',
    message: 'Auth failed with fake-token-should-be-redacted',
  },
}

