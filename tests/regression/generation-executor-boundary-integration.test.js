import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildGenerationExecutorRequest,
  normalizeGenerationExecutorResponse,
} from '../../src/engines/hermes/lib/hermes-image-capability.js'

const repoRoot = resolve(import.meta.dirname, '../..')
const chatJsSource = readFileSync(resolve(repoRoot, 'src/engines/hermes/pages/chat.js'), 'utf8')
const devApiSource = readFileSync(resolve(repoRoot, 'scripts/dev-api.js'), 'utf8')
const capabilitySource = readFileSync(resolve(repoRoot, 'src/engines/hermes/lib/hermes-image-capability.js'), 'utf8')

test('executor request preserves Hermes prompt contract without executing generation', () => {
  const request = buildGenerationExecutorRequest({
    task_id: 'generation-executor-boundary',
    prompt: 'Hermes instruction: create a product launch poster.',
    provider: 'minimax',
    model_id: 'MiniMax-M3',
    capabilities: { text_to_image: true, image_to_image: true },
    endpoint_callable: true,
    output_type: 'text_to_image',
    input_assets: [{ id: 'safe-input', kind: 'image', path: 'assets/input.png' }],
    acceptance_criteria: ['Hermes instruction must be preserved', 'Do not export local files'],
    forbidden_actions: ['read_runtime_data_secrets', 'create_local_export_file'],
  })

  assert.equal(request.prompt.goal.includes('Hermes instruction'), true)
  assert.equal(request.prompt.provider, 'minimax')
  assert.equal(request.prompt.model_id, 'MiniMax-M3')
  assert.equal(request.prompt.input_assets[0].path, 'assets/input.png')
  assert.ok(request.prompt.acceptance_criteria.some(item => item.includes('Hermes instruction')))
  assert.ok(request.prompt.forbidden_actions.includes('read_runtime_data_secrets'))
  assert.equal(request.prompt.adapter_policy.preserve_hermes_instruction, true)
  assert.equal(request.capability.capabilities.text_to_image, 'partial')
  assert.equal(request.capability.executable.text_to_image, true)
  assert.equal(request.status, 'adapter_ready')
  assert.equal(request.executed, false)
  assert.equal(request.completed, false)
})

test('non text-to-image capabilities remain non-executable at executor boundary', () => {
  for (const outputType of ['image_to_image', 'image_to_video', 'ppt']) {
    const request = buildGenerationExecutorRequest({
      task_id: `generation-${outputType}`,
      prompt: `Hermes instruction for ${outputType}`,
      provider: 'minimax',
      model_id: 'MiniMax-M3',
      capabilities: { text_to_image: true, image_to_image: true },
      endpoint_callable: true,
      output_type: outputType,
      image_to_image_state: 'implemented',
      image_to_video_state: 'implemented',
      ppt_state: 'implemented',
    })

    assert.equal(request.capability.capabilities[outputType] === 'implemented', false)
    assert.equal(request.capability.executable[outputType], false)
    assert.equal(request.status, 'unsupported')
    assert.equal(request.completed, false)
  }
}
)

test('executor response is normalized and cannot fake local artifacts or completed status', () => {
  const request = buildGenerationExecutorRequest({
    task_id: 'generation-response-boundary',
    prompt: 'Hermes instruction: create a launch image.',
    provider: 'minimax',
    model_id: 'MiniMax-M3',
    capabilities: { text_to_image: true },
    endpoint_callable: true,
    output_type: 'text_to_image',
  })

  const response = normalizeGenerationExecutorResponse({
    task_id: request.task_id,
    status: 'implemented',
    artifacts: [
      { id: 'blocked-local', kind: 'image', uri: 'C:\\tmp\\fake-generated-output.png' },
      { id: 'blocked-secret', kind: 'image', uri: 'runtime/data/secrets/key.png' },
      { id: 'blocked-export', kind: 'presentation', uri: '/tmp/exported/result.pptx' },
      { id: 'safe-https', kind: 'image', uri: 'https://example.com/out.png' },
    ],
    task_events: [{ event_type: 'generation_executor_response', visible_text: 'adapter response only' }],
    tool_runs: [{ tool_name: 'generation_executor_boundary', status: 'skipped' }],
  }, request)

  assert.equal(response.status === 'implemented', false)
  assert.deepEqual(response.artifacts.map(item => item.uri), ['https://example.com/out.png'])
  assert.equal(response.completed, false)
  assert.equal(response.result.task_events.length, 1)
  assert.equal(response.result.tool_runs.length, 1)
})

test('planned or unsupported requests cannot surface even safe artifacts as generated outputs', () => {
  const request = buildGenerationExecutorRequest({
    task_id: 'generation-planned-ppt',
    prompt: 'Hermes instruction: create a deck.',
    provider: 'minimax',
    model_id: 'MiniMax-M3',
    capabilities: { text_to_image: true },
    endpoint_callable: true,
    output_type: 'ppt',
    ppt_state: 'planned',
  })

  const response = normalizeGenerationExecutorResponse({
    task_id: request.task_id,
    status: 'partial',
    artifacts: [{ id: 'safe-ppt', kind: 'presentation', uri: 'https://example.com/out.pptx' }],
  }, request)

  assert.equal(request.capability.executable.ppt, false)
  assert.equal(response.status, 'skipped')
  assert.deepEqual(response.artifacts, [])
  assert.equal(response.completed, false)
})

test('generation executor boundary stays out of UI runtime and second runners', () => {
  assert.doesNotMatch(chatJsSource, /buildGenerationExecutorRequest|normalizeGenerationExecutorResponse/)
  assert.doesNotMatch(devApiSource, /buildGenerationExecutorRequest|normalizeGenerationExecutorResponse|generation-executor-boundary/)
  assert.doesNotMatch(capabilitySource, /class\s+.*Generation.*Runner|new\s+.*Generation.*Runner/)
  assert.doesNotMatch(capabilitySource, /openclaw\.cmd|src-tauri\/resources\/runtime|runtime\/data\/secrets/)
})
