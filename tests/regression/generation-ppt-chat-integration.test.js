import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY,
} from '../../src/engines/hermes/lib/hermes-response-assembler.js'
import {
  normalizeGenerationModelCapability,
  normalizeGenerationPrompt,
  normalizeGenerationResult,
} from '../../src/engines/hermes/lib/hermes-image-capability.js'
import {
  buildHermesGenerationStatusMetadata,
} from '../../src/engines/hermes/lib/chat-store.js'

const repoRoot = resolve(import.meta.dirname, '../..')
const chatStoreSource = readFileSync(resolve(repoRoot, 'src/engines/hermes/lib/chat-store.js'), 'utf8')
const chatJsSource = readFileSync(resolve(repoRoot, 'src/engines/hermes/pages/chat.js'), 'utf8')
const devApiSource = readFileSync(resolve(repoRoot, 'scripts/dev-api.js'), 'utf8')

const dangerousInputAssetPath = 'C:\\Users\\csys1\\Desktop\\generated-fake-input.png'
const dangerousArtifactUri = 'C:\\Users\\csys1\\Desktop\\fake-generated-deck.pptx'

test('chat-store keeps image_to_image unsupported boundary and generation metadata helper', () => {
  assert.equal(typeof HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY, 'string')
  assert.ok(HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY.length > 0)
  assert.match(chatStoreSource, /HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY/)
  assert.equal(typeof buildHermesGenerationStatusMetadata, 'function')
})

test('Generation / PPT chat metadata keeps planned and adapter-facing capability boundaries', () => {
  const metadata = buildHermesGenerationStatusMetadata({
    provider: 'minimax',
    model: 'MiniMax-M3',
    capabilities: {
      text_to_image: true,
      image_to_image: true,
    },
    endpoint_callable: true,
    image_to_video_state: 'implemented',
    ppt_state: 'implemented',
    output_type: 'ppt',
    prompt: 'Hermes instruction: create a sales deck, but do not export a file.',
    acceptance_criteria: ['Hermes instruction must be preserved'],
    artifacts: [{ id: 'fake-ppt', kind: 'ppt', uri: dangerousArtifactUri }],
    input_assets: [{ id: 'input-image', kind: 'image', path: dangerousInputAssetPath }],
  })

  assert.equal(metadata.capability.capabilities.text_to_image, 'partial')
  assert.equal(metadata.capability.capabilities.image_to_image === 'implemented', false)
  assert.equal(metadata.capability.capabilities.image_to_video === 'implemented', false)
  assert.equal(metadata.capability.capabilities.ppt === 'implemented', false)
  assert.equal(metadata.capability.executable.image_to_image, false)
  assert.equal(metadata.capability.executable.image_to_video, false)
  assert.equal(metadata.capability.executable.ppt, false)
  assert.equal(metadata.result.artifacts.length, 0, 'unsafe fake artifacts must not be surfaced')
  assert.equal(metadata.result.status === 'implemented', false)
  assert.ok(Array.isArray(metadata.result.task_events))
  assert.ok(Array.isArray(metadata.result.tool_runs))
  assert.ok(metadata.result.acceptance_summary)
})

test('Prompt Adapter preserves Hermes instruction while redacting unsafe local input asset paths', () => {
  const prompt = normalizeGenerationPrompt({
    task_id: 'generation-ppt-chat-test',
    prompt: 'Hermes instruction: build a campaign image prompt.',
    style: 'clean product photography',
    output_type: 'text_to_image',
    aspect_ratio: '16:9',
    page_count: 6,
    input_assets: [{ id: 'asset-local', kind: 'image', path: dangerousInputAssetPath }],
    acceptance_criteria: ['Hermes instruction must be preserved'],
    model_id: 'MiniMax-M3',
    provider: 'minimax',
    forbidden_actions: ['read_runtime_data_secrets', 'create_local_export_file'],
  })

  assert.equal(prompt.goal.includes('Hermes instruction'), true)
  assert.equal(prompt.model_id, 'MiniMax-M3')
  assert.equal(prompt.provider, 'minimax')
  assert.equal(prompt.input_assets[0].path, null)
  assert.ok(prompt.acceptance_criteria.some((item) => item.includes('Hermes instruction')))
  assert.ok(prompt.forbidden_actions.includes('read_runtime_data_secrets'))
})

test('Generation result normalizer refuses fake local artifacts and keeps observability fields', () => {
  const result = normalizeGenerationResult({
    task_id: 'generation-ppt-chat-test',
    status: 'implemented',
    artifacts: [
      { id: 'fake-pptx', kind: 'presentation', uri: dangerousArtifactUri, summary: 'fake generated deck' },
      { id: 'fake-png', kind: 'image', uri: 'file:///C:/Users/csys1/Desktop/exported-image.png', summary: 'fake png' },
    ],
    task_events: [{ event_type: 'generation_status', visible_text: 'planned only' }],
    tool_runs: [{ tool_name: 'generation_adapter', status: 'skipped' }],
  })

  assert.equal(result.status === 'implemented', false)
  assert.deepEqual(result.artifacts, [])
  assert.equal(result.task_events.length, 1)
  assert.equal(result.tool_runs.length, 1)
  assert.equal(result.acceptance_summary.status, 'not_evaluated')
})

test('Generation path sanitizer allows safe png URIs and relative input assets without weakening local path blocks', () => {
  const prompt = normalizeGenerationPrompt({
    input_assets: [
      { id: 'safe-relative-png', kind: 'image', path: 'assets/input.png' },
      { id: 'blocked-windows', kind: 'image', path: 'C:\\tmp\\fake-generated-output.png' },
      { id: 'blocked-file-url', kind: 'image', path: 'file:///C:/tmp/out.png' },
      { id: 'blocked-secret', kind: 'image', path: 'runtime/data/secrets/key.png' },
      { id: 'blocked-env', kind: 'config', path: '.env' },
      { id: 'blocked-relay', kind: 'config', path: 'relay-config.json' },
    ],
  })

  assert.equal(prompt.input_assets[0].path, 'assets/input.png')
  assert.equal(prompt.input_assets[1].path, null)
  assert.equal(prompt.input_assets[2].path, null)
  assert.equal(prompt.input_assets[3].path, null)
  assert.equal(prompt.input_assets[4].path, null)
  assert.equal(prompt.input_assets[5].path, null)

  const result = normalizeGenerationResult({
    artifacts: [
      { id: 'safe-http-png', kind: 'image', uri: 'https://example.com/out.png' },
      { id: 'blocked-unix-export', kind: 'presentation', uri: '/tmp/exported/result.pptx' },
      { id: 'blocked-file-url', kind: 'image', uri: 'file:///C:/tmp/out.png' },
    ],
  })

  assert.deepEqual(result.artifacts.map(artifact => artifact.uri), ['https://example.com/out.png'])
})

test('planned generation capabilities cannot surface artifacts through chat metadata', () => {
  const metadata = buildHermesGenerationStatusMetadata({
    provider: 'minimax',
    model: 'MiniMax-M3',
    capabilities: {
      text_to_image: true,
      image_to_image: true,
    },
    endpoint_callable: true,
    output_type: 'ppt',
    ppt_state: 'planned',
    artifacts: [{ id: 'safe-uri-but-planned-ppt', kind: 'presentation', uri: 'https://example.com/out.pptx' }],
  })

  assert.equal(metadata.capability.capabilities.ppt === 'implemented', false)
  assert.equal(metadata.capability.executable.ppt, false)
  assert.deepEqual(metadata.result.artifacts, [])
  assert.equal(metadata.result.status === 'implemented', false)
})

test('no_parallel_impl: Generation / PPT integration does not touch chat.js, dev-api, or runtime paths', () => {
  assert.doesNotMatch(chatJsSource, /buildHermesGenerationStatusMetadata|normalizeGenerationPrompt|normalizeGenerationResult/)
  assert.doesNotMatch(devApiSource, /generation-ppt-chat-integration|normalizeGenerationPrompt|normalizeGenerationResult/)
  assert.doesNotMatch(chatStoreSource, /class\s+.*Generation.*Runner|new\s+.*Generation.*Runner/)
  assert.doesNotMatch(chatStoreSource, /runtime\/data\/secrets|src-tauri\/resources\/data\/secrets/)
})
