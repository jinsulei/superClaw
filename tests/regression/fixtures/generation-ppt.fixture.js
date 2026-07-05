export const generationCapabilityStateFixtures = Object.freeze({
  text_to_image: {
    capability: 'text_to_image',
    current_state: 'partial',
    target_state: 'implemented_through_model_adapter',
    evidence_path: [
      'src/engines/hermes/lib/hermes-image-capability.js',
      'src/lib/model-presets.js',
    ],
  },
  image_to_image: {
    capability: 'image_to_image',
    current_state: 'planned',
    target_state: 'implemented_through_model_adapter',
    evidence_path: [
      'src/engines/hermes/lib/hermes-response-assembler.js',
      'src/engines/hermes/lib/hermes-image-capability.js',
    ],
    current_user_facing_status: 'unsupported',
  },
  image_to_video: {
    capability: 'image_to_video',
    current_state: 'planned',
    target_state: 'reserved_until_provider_contract_exists',
    evidence_path: ['not_found'],
  },
  ppt: {
    capability: 'ppt',
    current_state: 'planned',
    target_state: 'reserved_until_ppt_contract_exists',
    evidence_path: [
      'src/modules/generation/README.md',
      'docs/registry/FEATURE_REGISTRY.md',
    ],
  },
})

export const generationPromptContractFixture = Object.freeze({
  task_id: 'generation-task-fixture-001',
  goal: 'Create a launch visual and optional deck outline for a fixture campaign.',
  style: 'clean product editorial',
  output_type: 'text_to_image',
  aspect_ratio: '16:9',
  page_count: 8,
  input_assets: [
    {
      asset_id: 'asset-fixture-001',
      kind: 'image',
      source: 'fixture_only',
      path: null,
    },
  ],
  acceptance_criteria: [
    'Must match the requested product positioning.',
    'Must preserve Hermes instruction and user constraints.',
    'Must not rely on OpenClaw memory as the only instruction source.',
  ],
  model_id: 'MiniMax-M3',
  provider: 'minimax',
  forbidden_actions: [
    'rewrite_openclaw_ui',
    'modify_scripts_dev_api',
    'read_runtime_data_secrets',
    'claim_planned_capability_as_implemented',
  ],
})

export const openClawGenerationBoundaryFixture = Object.freeze({
  executor: 'openclaw',
  allowed_role: 'model_or_tool_execution',
  forbidden_role: 'source_of_truth_for_hermes_instruction',
  must_receive: [
    'normalized_model_capability',
    'normalized_prompt_contract',
    'acceptance_criteria',
  ],
  must_not_bypass: [
    'Model Adapter',
    'Prompt Adapter',
    'Hermes acceptance criteria',
  ],
})

export const generationResultContractFixture = Object.freeze({
  task_id: 'generation-task-fixture-001',
  status: 'planned',
  artifacts: [],
  task_events: [
    {
      event_type: 'task_planned',
      status: 'planned',
      actor: 'hermes',
      visible_text: 'Generation task planned; execution adapter not implemented in this fixture.',
    },
  ],
  tool_runs: [],
  acceptance_summary: {
    status: 'not_evaluated',
    reason: 'No real generation artifact is produced by this regression fixture.',
  },
})

export const fakeSensitiveGenerationFixture = Object.freeze({
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  access_token: 'fake-access-token-should-be-redacted',
  refresh_token: 'fake-refresh-token-should-be-redacted',
  password: 'fake-password-should-be-redacted',
})

export const noParallelGenerationContract = Object.freeze([
  'do not create a second generation runner',
  'do not rewrite OpenClaw UI',
  'do not modify scripts-dev-api.js',
  'do not claim planned capabilities as implemented',
  'wrap existing hermes-image-capability.js',
  'wrap existing model-presets.js',
  'preserve OpenClaw execution as adapter-facing only',
])

export const forbiddenGenerationPaths = Object.freeze([
  'runtime/data/secrets',
  'src-tauri/resources/data',
  'relay-config.json',
  '.env',
  'C:\\Users\\',
  '/Users/',
])
