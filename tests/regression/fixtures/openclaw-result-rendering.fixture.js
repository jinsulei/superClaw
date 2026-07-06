const fullBody = Array.from({ length: 36 }, (_, index) => {
  const step = String(index + 1).padStart(2, '0')
  return `OpenClaw execution detail ${step}: verified the delegated task, captured evidence, and returned a concrete result line that must remain visible in full result rendering.`
}).join('\n')

export const expectedFullContentMarker = 'OPENCLAW_FULL_RESULT_END'

export const fakeSensitiveOpenClawPayload = Object.freeze({
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  access_token: 'fake-access-token-should-be-redacted',
  refresh_token: 'fake-refresh-token-should-be-redacted',
  password: 'fake-password-should-be-redacted',
})

export const longOpenClawTaskResult = Object.freeze({
  session_id: 'session-openclaw-result-rendering',
  task_id: 'openclaw-result-rendering-task-001',
  parent_task_id: 'openclaw-result-rendering-parent-001',
  from_agent: 'openclaw',
  to_agent: 'hermes',
  message_type: 'task_result',
  status: 'completed',
  title: 'OpenClaw completed delegated task',
  content: [
    '# OpenClaw delegated task result',
    '',
    fullBody,
    '',
    expectedFullContentMarker,
  ].join('\n'),
  full_content: [
    '# OpenClaw delegated task result',
    '',
    fullBody,
    '',
    expectedFullContentMarker,
  ].join('\n'),
  summary: 'OpenClaw completed delegated task with evidence. Full result must remain available.',
  task_events: [
    {
      event_id: 'evt-openclaw-result-rendering-001',
      task_id: 'openclaw-result-rendering-task-001',
      task_type: 'collaboration',
      event_type: 'task_completed',
      actor: 'openclaw',
      source: 'collaboration.local_message',
      status: 'completed',
      visible_text: 'OpenClaw completed delegated task with evidence. Full result is available.',
      raw_payload: {
        task_id: 'openclaw-result-rendering-task-001',
        message_type: 'task_result',
        content_summary: 'summary only',
      },
      visibility: 'normal',
      severity: 'info',
      created_at: '2026-07-06T10:00:00.000Z',
    },
  ],
  tool_runs: [
    {
      tool_run_id: 'tool-run-openclaw-rendering-001',
      task_id: 'openclaw-result-rendering-task-001',
      tool_name: 'openclaw_gateway',
      provider: 'openclaw',
      status: 'completed',
      input_summary: 'Execute delegated task.',
      output_summary: 'Returned long result body.',
      started_at: '2026-07-06T09:59:00.000Z',
      completed_at: '2026-07-06T10:00:00.000Z',
    },
  ],
})

export const openClawResultRenderingNoParallelContract = Object.freeze([
  'Do not create a second chat renderer.',
  'Do not replace renderHermesInboxMessages.',
  'Do not replace existing local task messages.',
  'Do not rewrite scripts/dev-api.js.',
  'Do not put full OpenClaw result only into progress bubble.',
  'Do not read runtime/data/secrets.',
])

export const openClawResultForbiddenPaths = Object.freeze([
  'runtime/data/secrets',
  'src-tauri/resources/data/secrets',
  '.env',
  'relay-config.json',
])
