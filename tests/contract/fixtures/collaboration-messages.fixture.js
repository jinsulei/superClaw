export const taskRequestMessageFixture = {
  task_id: 'task_collab_wrapper_001',
  session_id: 'session_collab_wrapper_001',
  parent_task_id: null,
  from_agent: 'hermes',
  to_agent: 'openclaw',
  message_type: 'task_request',
  status: 'pending',
  title: 'Read product link',
  content: 'Read the public product link and return a concise summary.',
  context: {
    summary: 'Read product link',
    recent_messages: [{ role: 'user', content: 'Please inspect this link.' }],
    important_facts: ['executor=openclaw'],
    artifacts: [{ type: 'url', path: 'public/product-link', text: 'public link fixture' }],
    session_id: 'session_collab_wrapper_001',
    task_id: 'task_collab_wrapper_001',
  },
  artifacts: [{ type: 'url', path: 'public/product-link', text: 'public link fixture' }],
  mode: null,
  permission_level: null,
  requires_confirmation: false,
  created_at: '2026-07-06T03:00:00.000Z',
  updated_at: '2026-07-06T03:00:01.000Z',
}

export const taskProgressMessageFixture = {
  ...taskRequestMessageFixture,
  message_type: 'task_progress',
  status: 'running',
  title: 'OpenClaw running',
  content: 'OpenClaw accepted the delegated task and started execution.',
  created_at: '2026-07-06T03:01:00.000Z',
  updated_at: '2026-07-06T03:01:01.000Z',
}

export const taskResultMessageFixture = {
  ...taskRequestMessageFixture,
  from_agent: 'openclaw',
  to_agent: 'hermes',
  message_type: 'task_result',
  status: 'completed',
  title: 'OpenClaw completed',
  content: 'OpenClaw returned a sanitized result summary.',
  created_at: '2026-07-06T03:02:00.000Z',
  updated_at: '2026-07-06T03:02:01.000Z',
}

export const taskErrorMessageFixture = {
  ...taskResultMessageFixture,
  task_id: 'task_collab_wrapper_error_001',
  message_type: 'task_error',
  status: 'failed',
  title: 'OpenClaw failed',
  content: 'OpenClaw failed with a sanitized recoverable error.',
  created_at: '2026-07-06T03:03:00.000Z',
  updated_at: '2026-07-06T03:03:01.000Z',
}

export const taskDelegateMessageFixture = {
  ...taskResultMessageFixture,
  from_agent: 'claude-code',
  to_agent: 'hermes',
  message_type: 'task_delegate',
  status: 'delegated',
  title: 'Delegate follow-up to Hermes',
  content: 'Claude Code asks Hermes to handle a better-suited follow-up task.',
  mode: 'browser_automation',
  permission_level: 'browser_only',
  requires_confirmation: false,
  created_at: '2026-07-06T03:04:00.000Z',
  updated_at: '2026-07-06T03:04:01.000Z',
}

export const approvalRequiredMessageFixture = {
  ...taskRequestMessageFixture,
  task_id: 'task_collab_wrapper_approval_001',
  to_agent: 'claude-code',
  mode: 'takeover',
  permission_level: 'full_control',
  requires_confirmation: true,
  title: 'Claude Code takeover requires confirmation',
  content: 'Claude Code takeover task is waiting for explicit user confirmation.',
  created_at: '2026-07-06T03:05:00.000Z',
  updated_at: '2026-07-06T03:05:01.000Z',
}

export const pendingDispatchFixture = {
  taskId: 'task_collab_wrapper_001',
  target: 'openclaw',
  stage: 'execute',
  title: '[execute] OpenClaw - Read product link',
  message: 'Execution brief for OpenClaw using existing collaboration dispatch.',
  context: taskRequestMessageFixture.context,
  mode: null,
  permission_level: null,
  requires_confirmation: false,
}

export const sensitiveCollaborationMessageFixture = {
  ...taskRequestMessageFixture,
  task_id: 'task_collab_wrapper_sensitive_001',
  title: 'Sensitive fixture must be redacted',
  content: 'This fixture intentionally includes fake sensitive values.',
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  access_token: 'fake-access-token-should-be-redacted',
  refresh_token: 'fake-refresh-token-should-be-redacted',
  password: 'fake-password-should-be-redacted',
  context: {
    ...taskRequestMessageFixture.context,
    api_key: 'fake-api-key-should-be-redacted',
    token: 'fake-token-should-be-redacted',
    cookie: 'fake-cookie-should-be-redacted',
    secret: 'fake-secret-should-be-redacted',
    access_token: 'fake-access-token-should-be-redacted',
    refresh_token: 'fake-refresh-token-should-be-redacted',
    password: 'fake-password-should-be-redacted',
  },
}

export const sensitiveCollaborationValues = [
  'fake-api-key-should-be-redacted',
  'fake-token-should-be-redacted',
  'fake-cookie-should-be-redacted',
  'fake-secret-should-be-redacted',
  'fake-access-token-should-be-redacted',
  'fake-refresh-token-should-be-redacted',
  'fake-password-should-be-redacted',
]
