const FIXED_NOW = '2026-07-05T12:00:00.000Z'
const FIXED_LATER = '2026-07-05T12:00:03.000Z'

export const liveToolRunningFixture = {
  id: 'tool-call-running-001',
  runId: 'hermes-run-001',
  clientRequestId: 'client-request-001',
  task_id: 'task-hermes-tool-001',
  name: 'assistant_fetch_url',
  status: 'running',
  preview: 'Fetching public product link metadata',
  args: {
    url: 'https://example.test/product/123',
    mode: 'metadata',
  },
  result: null,
  error: null,
  created_at: FIXED_NOW,
  updated_at: FIXED_NOW,
}

export const liveToolCompletedFixture = {
  id: 'tool-call-completed-001',
  runId: 'hermes-run-001',
  clientRequestId: 'client-request-001',
  task_id: 'task-hermes-tool-001',
  name: 'assistant_fetch_url',
  status: 'done',
  preview: 'Fetched public product link metadata',
  args: {
    url: 'https://example.test/product/123',
    mode: 'metadata',
  },
  result: {
    title: 'Example Product',
    summary: 'Safe fixture product metadata.',
  },
  error: null,
  created_at: FIXED_NOW,
  updated_at: FIXED_LATER,
  completed_at: FIXED_LATER,
}

export const liveToolFailedFixture = {
  id: 'tool-call-failed-001',
  runId: 'hermes-run-002',
  clientRequestId: 'client-request-002',
  task_id: 'task-hermes-tool-002',
  name: 'assistant_fetch_url',
  status: 'error',
  preview: 'Link fetch failed',
  args: {
    url: 'https://example.test/private',
  },
  result: null,
  error: {
    name: 'FETCH_TIMEOUT',
    message: 'Fixture timeout while fetching public metadata.',
  },
  created_at: FIXED_NOW,
  updated_at: FIXED_LATER,
}

export const toolMessageRowFixture = {
  id: 'message-tool-row-001',
  role: 'tool',
  toolName: 'assistant_fetch_url',
  toolArgs: JSON.stringify({
    url: 'https://example.test/product/123',
    mode: 'metadata',
  }),
  toolResult: JSON.stringify({
    title: 'Example Product',
    summary: 'Safe fixture product metadata.',
  }),
  toolStatus: 'done',
  runId: 'hermes-run-001',
  task_id: 'task-hermes-tool-001',
  created_at: FIXED_NOW,
  updated_at: FIXED_LATER,
}

export const sensitiveToolFixture = {
  id: 'tool-call-sensitive-001',
  runId: 'hermes-run-sensitive-001',
  clientRequestId: 'client-request-sensitive-001',
  task_id: 'task-hermes-tool-sensitive-001',
  name: 'provider_call',
  status: 'error',
  preview: 'Provider call failed with fake credentials in source payload',
  args: {
    api_key: 'fake-api-key-should-be-redacted',
    token: 'fake-token-should-be-redacted',
    cookie: 'fake-cookie-should-be-redacted',
    secret: 'fake-secret-should-be-redacted',
    access_token: 'fake-access-token-should-be-redacted',
    refresh_token: 'fake-refresh-token-should-be-redacted',
    password: 'fake-password-should-be-redacted',
    safe_prompt: 'Summarize fixture data only.',
  },
  result: {
    output: 'Fixture output mentions no real credentials.',
    api_key: 'fake-api-key-should-be-redacted',
    token: 'fake-token-should-be-redacted',
  },
  error: {
    name: 'PROVIDER_AUTH_FAILED',
    message: 'Auth failed with fake-token-should-be-redacted',
  },
  created_at: FIXED_NOW,
  updated_at: FIXED_LATER,
}

