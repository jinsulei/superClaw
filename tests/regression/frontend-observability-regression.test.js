import test from 'node:test'
import assert from 'node:assert/strict'

import {
  frontendAgentRunsFixture,
  frontendApprovalRequiredEventFixture,
  frontendForbiddenPaths,
  frontendNoParallelContract,
  frontendSensitivePayloadFixture,
  frontendTaskEventsFixture,
  frontendToolRunsFixture,
} from './fixtures/frontend-observability.fixture.js'

const SENSITIVE_VALUES = [
  frontendSensitivePayloadFixture.api_key,
  frontendSensitivePayloadFixture.token,
  frontendSensitivePayloadFixture.cookie,
  frontendSensitivePayloadFixture.secret,
  frontendSensitivePayloadFixture.access_token,
  frontendSensitivePayloadFixture.refresh_token,
  frontendSensitivePayloadFixture.password,
]

async function loadFrontendObservabilityHelpers() {
  const mod = await import('../../src/engines/hermes/lib/chat-store.js')
  return {
    buildProgressBubbleViewModel:
      mod.buildFrontendProgressBubbleViewModel
      || mod.buildProgressBubbleViewModel
      || mod.mapTaskEventsToProgressBubbleViewModel,
    buildDebugRowViewModel:
      mod.buildFrontendDebugRowViewModel
      || mod.buildDebugRowViewModel
      || mod.mapToolRunsToDebugRowViewModel,
    buildAgentStatusViewModel:
      mod.buildFrontendAgentStatusViewModel
      || mod.buildAgentStatusViewModel
      || mod.mapAgentRunsToAgentStatusViewModel,
    redactFrontendObservabilityPayload:
      mod.redactFrontendObservabilityPayload
      || mod.redactObservabilityViewModelPayload,
  }
}

function assertNoSensitiveValues(value, label = 'value') {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sensitiveValue of SENSITIVE_VALUES) {
    assert.equal(serialized.includes(sensitiveValue), false, `${label} leaks ${sensitiveValue}`)
  }
  assert.equal(/<think>|<\/think>|private model reasoning|private chain of thought/i.test(serialized), false, `${label} leaks hidden reasoning`)
}

function assertNoForbiddenPath(value, label = 'value') {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const forbiddenPath of frontendForbiddenPaths) {
    assert.equal(serialized.includes(forbiddenPath), false, `${label} references forbidden path ${forbiddenPath}`)
  }
}

test('Frontend Observability fixtures are safe and do not read runtime secrets', () => {
  assertNoSensitiveValues({
    frontendTaskEventsFixture,
    frontendToolRunsFixture,
    frontendAgentRunsFixture,
    frontendApprovalRequiredEventFixture,
  }, 'safe frontend observability fixtures')

  assertNoForbiddenPath({
    frontendTaskEventsFixture,
    frontendToolRunsFixture,
    frontendAgentRunsFixture,
    frontendApprovalRequiredEventFixture,
  }, 'safe frontend observability fixtures')
})

test('task_events should generate a Progress Bubble view model for normal mode', async () => {
  const helpers = await loadFrontendObservabilityHelpers()
  assert.equal(
    typeof helpers.buildProgressBubbleViewModel,
    'function',
    'Expected gap: Frontend Observability needs a progress bubble view model helper over task_events',
  )

  const viewModel = helpers.buildProgressBubbleViewModel({
    task_events: frontendTaskEventsFixture,
    mode: 'normal',
  })

  assert.equal(viewModel.mode, 'normal')
  assert.equal(viewModel.task_id, 'frontend-observability-task-001')
  assert.equal(typeof viewModel.summary, 'string')
  assert.notEqual(viewModel.summary.trim(), '')
  assert.equal(viewModel.raw_payload, undefined, 'normal mode must not expose raw_payload')
  assertNoSensitiveValues(viewModel, 'normal progress bubble view model')
})

test('tool_runs should generate a Debug Row view model with ids and stable error fields', async () => {
  const helpers = await loadFrontendObservabilityHelpers()
  assert.equal(
    typeof helpers.buildDebugRowViewModel,
    'function',
    'Expected gap: Frontend Observability needs a debug row view model helper over tool_runs',
  )

  const viewModel = helpers.buildDebugRowViewModel({
    tool_runs: frontendToolRunsFixture,
    mode: 'debug',
  })

  assert.equal(viewModel.mode, 'debug')
  assert.ok(Array.isArray(viewModel.rows), 'debug view model must expose rows')
  assert.ok(viewModel.rows.some(row => row.tool_run_id === 'tool-run-frontend-001'))
  assert.ok(viewModel.rows.some(row => row.error_code === 'WECHAT_DRAFT_REQUIRES_REVIEW'))
  assertNoSensitiveValues(viewModel, 'debug row view model')
})

test('agent_runs should generate an Agent Status view model', async () => {
  const helpers = await loadFrontendObservabilityHelpers()
  assert.equal(
    typeof helpers.buildAgentStatusViewModel,
    'function',
    'Expected gap: Frontend Observability needs an agent status view model helper over agent_runs',
  )

  const viewModel = helpers.buildAgentStatusViewModel({
    agent_runs: frontendAgentRunsFixture,
    mode: 'normal',
  })

  assert.ok(Array.isArray(viewModel.agents), 'agent status view model must expose agents')
  assert.ok(viewModel.agents.some(agent => agent.agent_name === 'hermes' && agent.status === 'running'))
  assertNoSensitiveValues(viewModel, 'agent status view model')
})

test('normal mode only displays execution summary and never raw payload', async () => {
  const helpers = await loadFrontendObservabilityHelpers()
  assert.equal(
    typeof helpers.buildProgressBubbleViewModel,
    'function',
    'Expected gap: Frontend Observability normal mode needs a task_events progress summary helper',
  )

  const viewModel = helpers.buildProgressBubbleViewModel({
    task_events: [
      ...frontendTaskEventsFixture,
      {
        ...frontendTaskEventsFixture[0],
        event_id: 'evt-sensitive-normal-mode-001',
        raw_payload: frontendSensitivePayloadFixture,
      },
    ],
    mode: 'normal',
  })

  assert.equal(Object.hasOwn(viewModel, 'raw_payload'), false)
  assertNoSensitiveValues(viewModel, 'normal mode summary')
})

test('debug mode may display ids, status, and error_code but must redact payloads', async () => {
  const helpers = await loadFrontendObservabilityHelpers()
  assert.equal(
    typeof helpers.buildDebugRowViewModel,
    'function',
    'Expected gap: Frontend Observability debug mode needs a sanitized debug row helper',
  )

  const viewModel = helpers.buildDebugRowViewModel({
    tool_runs: [
      ...frontendToolRunsFixture,
      {
        ...frontendToolRunsFixture[1],
        tool_run_id: 'tool-run-sensitive-debug-001',
        input_summary: JSON.stringify(frontendSensitivePayloadFixture),
        output_summary: JSON.stringify(frontendSensitivePayloadFixture),
      },
    ],
    mode: 'debug',
  })

  assert.ok(JSON.stringify(viewModel).includes('tool-run-sensitive-debug-001'))
  assert.ok(JSON.stringify(viewModel).includes('WECHAT_DRAFT_REQUIRES_REVIEW'))
  assertNoSensitiveValues(viewModel, 'debug mode view model')
})

test('approval_required should display waiting human state in progress bubble', async () => {
  const helpers = await loadFrontendObservabilityHelpers()
  assert.equal(
    typeof helpers.buildProgressBubbleViewModel,
    'function',
    'Expected gap: Frontend Observability needs approval_required mapping into waiting human progress state',
  )

  const viewModel = helpers.buildProgressBubbleViewModel({
    task_events: [
      ...frontendTaskEventsFixture,
      frontendApprovalRequiredEventFixture,
    ],
    mode: 'normal',
  })

  assert.equal(viewModel.status, 'waiting_human')
  assert.match(viewModel.summary, /confirmation|human|waiting/i)
  assertNoSensitiveValues(viewModel, 'approval progress bubble view model')
})

test('no_parallel_impl locks Frontend Observability to existing Hermes chat renderer', () => {
  const scopeText = frontendNoParallelContract.join('\n')
  assert.match(scopeText, /do not create a second chat renderer/)
  assert.match(scopeText, /renderLiveTools and renderToolMessage/)
  assert.match(scopeText, /do not rewrite src\/engines\/hermes\/pages\/chat\.js/)
  assert.match(scopeText, /do not split scripts-dev-api\.js/)
  assert.match(scopeText, /do not read runtime\/data\/secrets/)
})
