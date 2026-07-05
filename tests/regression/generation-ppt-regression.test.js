import test from 'node:test'
import assert from 'node:assert/strict'

import * as hermesImageCapability from '../../src/engines/hermes/lib/hermes-image-capability.js'
import {
  HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY,
  detectHermesImageIntent,
} from '../../src/engines/hermes/lib/hermes-response-assembler.js'
import {
  FIRST_TOKEN_TIMEOUT_MS,
  STREAM_IDLE_TIMEOUT_MS,
  createGenerationTimeoutManager,
} from '../../src/engines/openclaw/runtime/generation-timeout.js'
import { MODEL_PRESETS, PROVIDER_PRESETS } from '../../src/lib/model-presets.js'
import {
  fakeSensitiveGenerationFixture,
  forbiddenGenerationPaths,
  generationCapabilityStateFixtures,
  generationPromptContractFixture,
  generationResultContractFixture,
  noParallelGenerationContract,
  openClawGenerationBoundaryFixture,
} from './fixtures/generation-ppt.fixture.js'

const ALLOWED_CAPABILITY_STATES = new Set(['implemented', 'partial', 'planned', 'reserved', 'unknown'])
const PLANNED_OR_RESERVED = new Set(['planned', 'reserved'])
const SENSITIVE_VALUES = Object.values(fakeSensitiveGenerationFixture)

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value)
  for (const sensitive of SENSITIVE_VALUES) {
    assert.equal(serialized.includes(sensitive), false, `${sensitive} must be redacted`)
  }
}

function assertNoForbiddenPath(value) {
  const serialized = JSON.stringify(value)
  for (const forbiddenPath of forbiddenGenerationPaths) {
    assert.equal(serialized.includes(forbiddenPath), false, `fixture must not reference ${forbiddenPath}`)
  }
}

function assertGenerationResultShape(result) {
  assert.ok(result && typeof result === 'object', 'generation result must be an object')
  assert.ok(Array.isArray(result.artifacts), 'generation result must expose artifacts array')
  assert.ok(Array.isArray(result.task_events), 'generation result must expose task_events array')
  assert.ok(Array.isArray(result.tool_runs), 'generation result must expose tool_runs array')
  assert.ok(result.acceptance_summary && typeof result.acceptance_summary === 'object', 'generation result must include acceptance_summary')
  assert.equal(typeof result.status, 'string', 'generation result must include status')
}

test('Generation / PPT capability states keep implemented, partial, planned, and reserved boundaries explicit', () => {
  for (const [capability, entry] of Object.entries(generationCapabilityStateFixtures)) {
    assert.equal(entry.capability, capability)
    assert.equal(ALLOWED_CAPABILITY_STATES.has(entry.current_state), true, `${capability} state must be allowed`)
    assert.ok(entry.target_state, `${capability} target_state is required`)
    assert.ok(Array.isArray(entry.evidence_path), `${capability} evidence_path is required`)
  }

  assert.equal(generationCapabilityStateFixtures.text_to_image.current_state, 'partial')
  assert.equal(generationCapabilityStateFixtures.image_to_image.current_state, 'planned')
  assert.equal(generationCapabilityStateFixtures.image_to_video.current_state, 'planned')
  assert.equal(generationCapabilityStateFixtures.ppt.current_state, 'planned')

  for (const capability of ['image_to_image', 'image_to_video', 'ppt']) {
    assert.equal(
      generationCapabilityStateFixtures[capability].current_state === 'implemented',
      false,
      `${capability} must not be claimed as implemented`,
    )
  }
})

test('current image_to_image behavior remains unsupported and must not be faked as executable', () => {
  const intent = detectHermesImageIntent({
    text: 'please do image-to-image based on this uploaded image',
    attachments: [{ kind: 'image', mimeType: 'image/png' }],
  })

  assert.equal(intent, 'image_to_image')
  assert.equal(typeof HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY, 'string')
  assert.equal(HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY.length > 0, true)
  assert.equal(generationCapabilityStateFixtures.image_to_image.current_user_facing_status, 'unsupported')
  assert.equal(generationCapabilityStateFixtures.image_to_image.current_state === 'implemented', false)
})

test('PPT remains planned or reserved and fixture must not fabricate generated files', () => {
  const ppt = generationCapabilityStateFixtures.ppt
  assert.equal(PLANNED_OR_RESERVED.has(ppt.current_state), true, 'PPT must remain planned/reserved until contract exists')
  assert.equal(ppt.current_state === 'implemented', false)
  assert.equal(generationResultContractFixture.artifacts.length, 0, 'PPT fixture must not fake exported files')
  assert.equal(/\.pptx|\.pdf|exported|generated file/i.test(JSON.stringify(generationResultContractFixture)), false)
  assertNoForbiddenPath(generationResultContractFixture)
})

test('Prompt Adapter contract preserves Hermes instruction, model choice, assets, and acceptance criteria', () => {
  for (const field of [
    'goal',
    'style',
    'output_type',
    'aspect_ratio',
    'page_count',
    'input_assets',
    'acceptance_criteria',
    'model_id',
    'provider',
    'forbidden_actions',
  ]) {
    assert.ok(Object.hasOwn(generationPromptContractFixture, field), `prompt contract must include ${field}`)
  }

  assert.ok(Array.isArray(generationPromptContractFixture.input_assets))
  assert.ok(Array.isArray(generationPromptContractFixture.acceptance_criteria))
  assert.ok(Array.isArray(generationPromptContractFixture.forbidden_actions))
  assert.match(generationPromptContractFixture.acceptance_criteria.join('\n'), /Hermes instruction/)
  assert.match(generationPromptContractFixture.forbidden_actions.join('\n'), /read_runtime_data_secrets/)
  assertNoForbiddenPath(generationPromptContractFixture)
})

test('production Prompt Adapter helper is still an expected gap before Generation / PPT implementation', () => {
  const promptAdapter = hermesImageCapability.normalizeGenerationPrompt
    || hermesImageCapability.buildGenerationPromptContract
    || hermesImageCapability.mapHermesPromptToGenerationPrompt

  assert.equal(
    typeof promptAdapter,
    'function',
    'Expected gap: Generation / PPT must expose a Prompt Adapter helper before production execution is wired',
  )
})

test('Model Adapter boundary must not reduce generation capability to generic chat model presets', () => {
  assert.ok(Array.isArray(PROVIDER_PRESETS), 'provider presets must exist')
  assert.ok(MODEL_PRESETS && typeof MODEL_PRESETS === 'object', 'model presets must exist')
  assert.ok(MODEL_PRESETS.minimax?.some(model => model.id === 'MiniMax-M3'), 'MiniMax model evidence should remain available')

  const modelAdapter = hermesImageCapability.normalizeGenerationModelCapability
    || hermesImageCapability.mapHermesImageCapabilityToGenerationCapability
    || hermesImageCapability.classifyGenerationModelCapability

  assert.equal(
    typeof modelAdapter,
    'function',
    'Expected gap: Model Adapter must distinguish text_to_image / image_to_image / image_to_video / ppt states before execution',
  )
})

test('OpenClaw generation boundary stays adapter-facing and cannot replace Hermes instruction with memory', () => {
  assert.equal(typeof createGenerationTimeoutManager, 'function')
  assert.equal(FIRST_TOKEN_TIMEOUT_MS > 0, true)
  assert.equal(STREAM_IDLE_TIMEOUT_MS > FIRST_TOKEN_TIMEOUT_MS, true)
  assert.equal(openClawGenerationBoundaryFixture.executor, 'openclaw')
  assert.equal(openClawGenerationBoundaryFixture.allowed_role, 'model_or_tool_execution')
  assert.equal(openClawGenerationBoundaryFixture.forbidden_role, 'source_of_truth_for_hermes_instruction')
  assert.match(openClawGenerationBoundaryFixture.must_not_bypass.join('\n'), /Model Adapter/)
  assert.match(openClawGenerationBoundaryFixture.must_not_bypass.join('\n'), /Prompt Adapter/)
  assert.match(openClawGenerationBoundaryFixture.must_receive.join('\n'), /acceptance_criteria/)
})

test('Generation result contract requires artifacts, observability, acceptance summary, and status', () => {
  assertGenerationResultShape(generationResultContractFixture)
  assert.equal(generationResultContractFixture.status, 'planned')
  assert.equal(generationResultContractFixture.acceptance_summary.status, 'not_evaluated')

  const normalizer = hermesImageCapability.normalizeGenerationResult
    || hermesImageCapability.normalizeGenerationPptResult
    || hermesImageCapability.mapGenerationResultToObservability

  assert.equal(
    typeof normalizer,
    'function',
    'Expected gap: Generation result normalizer must attach artifacts, task_events, tool_runs, acceptance_summary, and status',
  )
})

test('Generation / PPT fixtures never expose secrets or create local generated file paths', () => {
  const fixturePayload = {
    generationCapabilityStateFixtures,
    generationPromptContractFixture,
    generationResultContractFixture,
    openClawGenerationBoundaryFixture,
  }
  assertNoSensitiveValues(fixturePayload)
  assertNoForbiddenPath(fixturePayload)
  assert.equal(/fake generated|real execution success|\.pptx|C:\\Users\\/i.test(JSON.stringify(fixturePayload)), false)
})

test('no_parallel_impl contract is explicit for Generation / PPT regression work', () => {
  const scope = noParallelGenerationContract.join('\n')
  assert.match(scope, /do not create a second generation runner/)
  assert.match(scope, /do not rewrite OpenClaw UI/)
  assert.match(scope, /do not modify scripts-dev-api\.js/)
  assert.match(scope, /do not claim planned capabilities as implemented/)
  assert.match(scope, /hermes-image-capability\.js/)
  assert.match(scope, /model-presets\.js/)
  assert.match(scope, /adapter-facing only/)
})
