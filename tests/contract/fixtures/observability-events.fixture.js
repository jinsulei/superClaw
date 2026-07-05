export const validTaskCreatedEvent = {
  event_id: 'evt_task_created_001',
  task_id: 'task_collaboration_001',
  task_type: 'collaboration',
  event_type: 'task_created',
  actor: 'hermes',
  source: 'collaboration.local_message',
  status: 'created',
  visible_text: 'Collaboration task created for link review.',
  raw_payload: {
    source_message_id: 'local_msg_001',
    payload_shape: 'collaboration_task',
  },
  visibility: 'normal',
  severity: 'info',
  created_at: '2026-07-06T02:00:00.000Z',
}

export const validToolRunStarted = {
  tool_run_id: 'tool_run_link_reader_001',
  task_id: 'task_collaboration_001',
  tool_name: 'link_reader',
  provider: 'hermes',
  status: 'started',
  input_summary: 'Read one public product link.',
  started_at: '2026-07-06T02:00:01.000Z',
}

export const validToolRunCompleted = {
  ...validToolRunStarted,
  status: 'completed',
  output_summary: 'Link metadata extracted without secrets.',
  completed_at: '2026-07-06T02:00:03.000Z',
  duration_ms: 2000,
}

export const validToolRunFailed = {
  ...validToolRunStarted,
  tool_run_id: 'tool_run_link_reader_002',
  status: 'failed',
  output_summary: 'Link reader failed with sanitized network error.',
  error_code: 'LINK_READER_TIMEOUT',
  error_message: 'Request timed out before metadata extraction.',
  completed_at: '2026-07-06T02:00:05.000Z',
}

export const validAgentRunStarted = {
  agent_run_id: 'agent_run_openclaw_001',
  task_id: 'task_collaboration_001',
  agent_name: 'openclaw',
  adapter_name: 'openclaw_gateway_bridge',
  status: 'running',
  current_step: 'Preparing browser runtime command.',
  resume_supported: false,
  started_at: '2026-07-06T02:00:06.000Z',
}

export const validAgentRunHeartbeat = {
  ...validAgentRunStarted,
  status: 'running',
  current_step: 'Waiting for browser runtime response.',
  heartbeat_at: '2026-07-06T02:00:16.000Z',
}

export const validAgentHeartbeatEvent = {
  event_id: 'evt_agent_heartbeat_001',
  task_id: 'task_collaboration_001',
  task_type: 'collaboration',
  event_type: 'agent_heartbeat',
  actor: 'openclaw',
  source: 'openclaw.gateway_bridge',
  status: 'running',
  visible_text: 'OpenClaw is still running.',
  raw_payload: {
    agent_run_id: 'agent_run_openclaw_001',
    heartbeat_at: '2026-07-06T02:00:16.000Z',
  },
  visibility: 'debug',
  severity: 'info',
  linked_agent_run_id: 'agent_run_openclaw_001',
  created_at: '2026-07-06T02:00:16.000Z',
}

export const validApprovalRequiredEvent = {
  event_id: 'evt_approval_required_001',
  task_id: 'task_ecommerce_001',
  task_type: 'ecommerce',
  event_type: 'approval_required',
  actor: 'system',
  source: 'ecommerce.action_guard',
  status: 'waiting_human',
  visible_text: 'Approval is required before continuing this action.',
  raw_payload: {
    action_type: 'publish_product',
    risk_level: 'high',
  },
  visibility: 'normal',
  severity: 'warning',
  created_at: '2026-07-06T02:01:00.000Z',
}

export const validActionGuardBlockedEvent = {
  event_id: 'evt_action_guard_blocked_001',
  task_id: 'task_ecommerce_002',
  task_type: 'ecommerce',
  event_type: 'action_guard_blocked',
  actor: 'system',
  source: 'ecommerce.action_guard',
  status: 'blocked',
  visible_text: 'High-risk action was blocked before execution.',
  raw_payload: {
    action_type: 'paid_campaign_submit',
    risk_level: 'high',
    blocked: true,
  },
  visibility: 'audit_only',
  severity: 'warning',
  created_at: '2026-07-06T02:02:00.000Z',
}

export const sensitivePayloadFixture = {
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  access_token: 'fake-access-token-should-be-redacted',
  refresh_token: 'fake-refresh-token-should-be-redacted',
  password: 'fake-password-should-be-redacted',
  safe_summary: 'This summary may be shown after redaction.',
}

export const collaborationLocalMessageFixture = {
  id: 'local_msg_001',
  task_id: 'task_collaboration_001',
  type: 'task_created',
  role: 'hermes',
  text: 'Collaboration task queued for existing dispatcher path.',
  status: 'created',
  created_at: '2026-07-06T02:03:00.000Z',
}
