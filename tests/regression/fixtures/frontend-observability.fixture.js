export const frontendTaskEventsFixture = Object.freeze([
  {
    event_id: 'evt-frontend-task-created-001',
    task_id: 'frontend-observability-task-001',
    task_type: 'collaboration',
    event_type: 'task_created',
    actor: 'hermes',
    source: 'collaboration.local_message',
    status: 'created',
    visible_text: 'Hermes created a collaboration task.',
    raw_payload: {
      task_id: 'frontend-observability-task-001',
      safe_field: 'created',
    },
    visibility: 'normal',
    severity: 'info',
    created_at: '2026-07-06T09:00:00.000Z',
  },
  {
    event_id: 'evt-frontend-task-progress-001',
    task_id: 'frontend-observability-task-001',
    task_type: 'collaboration',
    event_type: 'task_progress',
    actor: 'tool',
    source: 'hermes.stream',
    status: 'running',
    visible_text: 'Reading task context and preparing tool calls.',
    raw_payload: {
      step: 'prepare',
      payload_shape: ['step'],
    },
    visibility: 'normal',
    severity: 'info',
    linked_tool_run_id: 'tool-run-frontend-001',
    created_at: '2026-07-06T09:00:02.000Z',
  },
])

export const frontendApprovalRequiredEventFixture = Object.freeze({
  event_id: 'evt-frontend-approval-001',
  task_id: 'frontend-observability-task-001',
  task_type: 'ecommerce_ops',
  event_type: 'approval_required',
  actor: 'system',
  source: 'ecommerce.action_guard',
  status: 'waiting_human',
  visible_text: 'This action requires human confirmation before sending.',
  raw_payload: {
    action_type: 'send_wechat_message',
    permission_level: 'L2',
  },
  visibility: 'normal',
  severity: 'warning',
  created_at: '2026-07-06T09:00:05.000Z',
})

export const frontendToolRunsFixture = Object.freeze([
  {
    tool_run_id: 'tool-run-frontend-001',
    task_id: 'frontend-observability-task-001',
    tool_name: 'assistant_fetch_url',
    provider: 'hermes',
    status: 'completed',
    input_summary: 'Fetch public product URL.',
    output_summary: 'Fetched safe public page metadata.',
    error_code: null,
    started_at: '2026-07-06T09:00:01.000Z',
    completed_at: '2026-07-06T09:00:03.000Z',
  },
  {
    tool_run_id: 'tool-run-frontend-002',
    task_id: 'frontend-observability-task-001',
    tool_name: 'wechat_customer_ops_normalizer',
    provider: 'local',
    status: 'failed',
    input_summary: 'Normalize customer message with [REDACTED] values.',
    output_summary: '',
    error_code: 'WECHAT_DRAFT_REQUIRES_REVIEW',
    error_message: 'Reply stayed as draft because sending requires confirmation.',
    started_at: '2026-07-06T09:00:04.000Z',
    completed_at: '2026-07-06T09:00:05.000Z',
  },
])

export const frontendAgentRunsFixture = Object.freeze([
  {
    agent_run_id: 'agent-run-hermes-frontend-001',
    task_id: 'frontend-observability-task-001',
    agent_name: 'hermes',
    adapter_name: 'hermes_gateway_bridge',
    status: 'running',
    current_step: 'Preparing visible execution summary.',
    heartbeat_at: '2026-07-06T09:00:04.000Z',
    checkpoint_id: 'checkpoint-frontend-001',
    resume_supported: true,
    error_code: null,
    error_message: null,
    started_at: '2026-07-06T09:00:00.000Z',
    completed_at: null,
  },
])

export const frontendSensitivePayloadFixture = Object.freeze({
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  access_token: 'fake-access-token-should-be-redacted',
  refresh_token: 'fake-refresh-token-should-be-redacted',
  password: 'fake-password-should-be-redacted',
  raw_payload: {
    hidden_reasoning: '<think>private model reasoning should never be visible</think>',
    local_path: 'C:\\Users\\fixture\\runtime\\data\\secrets\\.env',
  },
})

export const frontendNoParallelContract = Object.freeze([
  'do not create a second chat renderer',
  'wrap existing src/engines/hermes/pages/chat.js renderLiveTools and renderToolMessage paths',
  'do not rewrite src/engines/hermes/pages/chat.js',
  'do not rewrite src/engines/hermes/lib/chat-store.js',
  'do not split scripts-dev-api.js',
  'do not read runtime/data/secrets',
])

export const frontendForbiddenPaths = Object.freeze([
  'runtime/data/secrets',
  'src-tauri/resources/data/secrets',
  '.env',
  'relay-config.json',
  'C:\\Users\\',
  '/Users/',
])
