import test from 'node:test'
import assert from 'node:assert/strict'

import {
  liveToolCompletedFixture,
  liveToolFailedFixture,
  liveToolRunningFixture,
  sensitiveToolFixture,
  toolMessageRowFixture,
} from './fixtures/hermes-tool-events.fixture.js'

const CONTRACT_SCOPE = [
  'first version only allows wrap_existing / patch_existing',
  'do not create a second tool system',
  'do not rewrite src/engines/hermes/lib/chat-store.js',
  'do not rewrite src/engines/hermes/pages/chat.js',
  'do not split or rewrite scripts-dev-api.js',
  'first wrapper version only covers existing liveTools / tool debug row',
]

const TOOL_RUN_STATUS = new Set(['started', 'running', 'completed', 'failed', 'cancelled'])
const SENSITIVE_VALUES = [
  sensitiveToolFixture.args.api_key,
  sensitiveToolFixture.args.token,
  sensitiveToolFixture.args.cookie,
  sensitiveToolFixture.args.secret,
  sensitiveToolFixture.args.access_token,
  sensitiveToolFixture.args.refresh_token,
  sensitiveToolFixture.args.password,
]

async function loadExpectedWrapperExports() {
  const mod = await import('../../src/engines/hermes/lib/chat-store.js')
  const expected = {
    mapHermesLiveToolToToolRun: mod.mapHermesLiveToolToToolRun,
    mapHermesToolMessageToToolRun: mod.mapHermesToolMessageToToolRun,
    redactToolRunPayload: mod.redactToolRunPayload,
    normalizeToolRunStatus: mod.normalizeToolRunStatus,
  }

  for (const [name, value] of Object.entries(expected)) {
    assert.equal(
      typeof value,
      'function',
      `expected failing contract: src/engines/hermes/lib/chat-store.js must export ${name}`,
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

function assertToolRunBase(toolRun) {
  assert.ok(toolRun.tool_run_id, 'tool_run_id is required')
  assert.ok(toolRun.task_id, 'task_id is required')
  assert.ok(toolRun.tool_name, 'tool_name is required')
  assert.ok(toolRun.provider, 'provider is required for Hermes tool wrapper baseline')
  assert.equal(TOOL_RUN_STATUS.has(toolRun.status), true, `tool run status is not allowed: ${toolRun.status}`)
  assertIsoTimestamp(toolRun.started_at, 'started_at')
  assert.equal(typeof toolRun.input_summary, 'string', 'input_summary must be a string')
  assertNoSensitiveValues(toolRun.input_summary, 'input_summary')
  assertNoSensitiveValues(toolRun.output_summary ?? '', 'output_summary')
  assertNoSensitiveValues(toolRun.error_message ?? '', 'error_message')
  assertNoSensitiveValues(toolRun, 'tool_run')
}

test('no_parallel_impl guard documents Hermes tool wrapper scope', () => {
  const scopeText = CONTRACT_SCOPE.join('\n')
  assert.match(scopeText, /wrap_existing \/ patch_existing/)
  assert.match(scopeText, /do not create a second tool system/)
  assert.match(scopeText, /do not rewrite src\/engines\/hermes\/lib\/chat-store\.js/)
  assert.match(scopeText, /do not rewrite src\/engines\/hermes\/pages\/chat\.js/)
  assert.match(scopeText, /do not split or rewrite scripts-dev-api\.js/)
  assert.match(scopeText, /existing liveTools \/ tool debug row/)
})

test('chat-store exports the expected Hermes tool_runs wrapper helpers', async () => {
  await loadExpectedWrapperExports()
})

test('mapHermesLiveToolToToolRun maps a running liveTool into tool_runs contract', async () => {
  const { mapHermesLiveToolToToolRun } = await loadExpectedWrapperExports()
  const toolRun = mapHermesLiveToolToToolRun(liveToolRunningFixture)

  assertToolRunBase(toolRun)
  assert.equal(toolRun.status, 'running')
  assert.equal(toolRun.tool_name, liveToolRunningFixture.name)
  assert.equal(toolRun.output_summary === '' || toolRun.output_summary == null, true, 'running tool output_summary may be empty')
  assert.equal(toolRun.error_code == null, true, 'running tool error_code may be null')
})

test('mapHermesLiveToolToToolRun maps a completed liveTool into tool_runs contract', async () => {
  const { mapHermesLiveToolToToolRun } = await loadExpectedWrapperExports()
  const toolRun = mapHermesLiveToolToToolRun(liveToolCompletedFixture)

  assertToolRunBase(toolRun)
  assert.equal(toolRun.status, 'completed')
  assert.ok(toolRun.completed_at, 'completed tool_run must include completed_at')
  assertIsoTimestamp(toolRun.completed_at, 'completed_at')
  assert.equal(typeof toolRun.output_summary, 'string', 'completed output_summary must be a string')
})

test('mapHermesLiveToolToToolRun maps a failed liveTool into tool_runs contract', async () => {
  const { mapHermesLiveToolToToolRun } = await loadExpectedWrapperExports()
  const toolRun = mapHermesLiveToolToToolRun(liveToolFailedFixture)

  assertToolRunBase(toolRun)
  assert.equal(toolRun.status, 'failed')
  assert.ok(toolRun.error_code, 'failed tool_run must include error_code')
  assert.match(toolRun.error_code, /^[A-Z0-9_]+$/, 'error_code must be stable uppercase code')
  assert.equal(typeof toolRun.error_message, 'string', 'failed error_message must be a string')
})

test('mapHermesToolMessageToToolRun maps a persisted role=tool row into tool_runs contract', async () => {
  const { mapHermesToolMessageToToolRun } = await loadExpectedWrapperExports()
  const toolRun = mapHermesToolMessageToToolRun(toolMessageRowFixture)

  assertToolRunBase(toolRun)
  assert.equal(toolRun.tool_name, toolMessageRowFixture.toolName)
  assert.equal(toolRun.status, 'completed')
  assert.ok(toolRun.completed_at, 'persisted completed tool row must include completed_at')
  assertIsoTimestamp(toolRun.completed_at, 'completed_at')
})

test('normalizeToolRunStatus maps Hermes liveTool statuses into allowed tool_runs status values', async () => {
  const { normalizeToolRunStatus } = await loadExpectedWrapperExports()
  const cases = [
    ['running', 'running'],
    ['started', 'started'],
    ['done', 'completed'],
    ['completed', 'completed'],
    ['error', 'failed'],
    ['failed', 'failed'],
    ['cancelled', 'cancelled'],
  ]

  for (const [input, expected] of cases) {
    assert.equal(normalizeToolRunStatus(input), expected, `${input} should map to ${expected}`)
  }

  assert.equal(TOOL_RUN_STATUS.has(normalizeToolRunStatus('unexpected-fixture-status')), true, 'unknown status must still map to an allowed status')
})

test('redactToolRunPayload removes sensitive fixture values from tool_run summaries and JSON', async () => {
  const { mapHermesLiveToolToToolRun, redactToolRunPayload } = await loadExpectedWrapperExports()
  const redactedPayload = redactToolRunPayload(sensitiveToolFixture)
  const toolRun = mapHermesLiveToolToToolRun(sensitiveToolFixture)

  assertNoSensitiveValues(redactedPayload, 'redacted payload')
  assertNoSensitiveValues(toolRun.input_summary, 'input_summary')
  assertNoSensitiveValues(toolRun.output_summary ?? '', 'output_summary')
  assertNoSensitiveValues(toolRun.error_message ?? '', 'error_message')
  assertNoSensitiveValues(toolRun, 'tool_run')
})
