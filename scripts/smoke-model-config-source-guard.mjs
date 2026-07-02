import assert from 'assert/strict'
import fs from 'fs'
import path from 'path'
import {
  assertDirectModelConfigWritable,
  getEffectiveModelConfig,
  MODEL_CONFIG_DEFAULTS,
} from './lib/model-config-source-guard.mjs'

const directKey = 'direct-dev-key-for-smoke'

function assertNoRawKeyLeak(config, rawKey) {
  const json = JSON.stringify(config)
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'apiKey'), false, 'effective config must not expose apiKey')
  assert.equal(json.includes(rawKey), false, 'effective config leaked a raw key')
}

function runDirectRuntimeConfig() {
  const result = getEffectiveModelConfig('openclaw', {
    env: {},
    directConfig: {
      provider: MODEL_CONFIG_DEFAULTS.provider,
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: directKey,
      configPath: 'resources/data/.openclaw/openclaw.json',
    },
  })
  assert.equal(result.mode, 'runtime')
  assert.equal(result.modelSource, 'direct')
  assert.equal(result.status, 'ready')
  assert.equal(result.provider, 'minimax')
  assert.equal(result.apiKeyConfigured, true)
  assert.equal(result.apiKeySource, 'direct-env')
  assertNoRawKeyLeak(result, directKey)
  console.log('MODEL_CONFIG_DIRECT_RUNTIME_PASS')
}

function runMissingDirectConfig() {
  const missing = getEffectiveModelConfig('openclaw', {
    env: {},
    directConfig: {
      provider: MODEL_CONFIG_DEFAULTS.provider,
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: '',
    },
  })
  assert.equal(missing.modelSource, 'direct')
  assert.equal(missing.status, 'needs_setup')
  assert.equal(missing.code, 'DIRECT_MODEL_CONFIG_REQUIRED')
  assert.equal(missing.apiKeySource, 'none')
  assert.equal(missing.provider, MODEL_CONFIG_DEFAULTS.provider)
  assert.equal(missing.baseUrl, MODEL_CONFIG_DEFAULTS.baseUrl)
  assert.equal(missing.model, MODEL_CONFIG_DEFAULTS.model)
  console.log('MODEL_CONFIG_DIRECT_NEEDS_SETUP_PASS')
}

function runEmptyRuntimeConfig() {
  const missing = getEffectiveModelConfig('openclaw', {
    env: {},
    directConfig: {},
  })
  assert.equal(missing.modelSource, 'direct')
  assert.equal(missing.status, 'needs_setup')
  assert.equal(missing.code, 'DIRECT_MODEL_CONFIG_REQUIRED')
  assert.equal(missing.provider, '')
  assert.equal(missing.baseUrl, '')
  assert.equal(missing.model, '')
  assert.equal(missing.apiKeyConfigured, false)
  assert.match(missing.warnings.join(','), /DIRECT_PROVIDER_MISSING/)
  assert.match(missing.warnings.join(','), /DIRECT_BASE_URL_MISSING/)
  assert.match(missing.warnings.join(','), /DIRECT_MODEL_MISSING/)
  assert.match(missing.warnings.join(','), /DIRECT_API_KEY_MISSING/)
  console.log('MODEL_CONFIG_EMPTY_RUNTIME_NEEDS_SETUP_PASS')
}

function runAgentIsolation() {
  const openclaw = getEffectiveModelConfig('openclaw', {
    env: {},
    directConfig: {
      provider: 'minimax',
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: directKey,
    },
  })
  const hermes = getEffectiveModelConfig('hermes', {
    env: {},
    directConfig: {
      provider: 'minimax',
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: '',
    },
  })
  assert.equal(openclaw.status, 'ready')
  assert.equal(hermes.status, 'needs_setup')
  console.log('MODEL_CONFIG_AGENT_ISOLATED')
}

function runDirectWritesAllowed() {
  assert.equal(assertDirectModelConfigWritable('openclaw'), true)
  assert.equal(assertDirectModelConfigWritable('claude-code'), true)
  console.log('MODEL_CONFIG_DIRECT_WRITES_ALLOWED')
}

function runNoKeyLeak() {
  const result = getEffectiveModelConfig('openclaw', {
    env: {},
    directConfig: {
      provider: 'minimax',
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: directKey,
    },
  })
  assertNoRawKeyLeak(result, directKey)
  assert.equal(typeof result.apiKeyFingerprint, 'string')
  assert.equal(result.apiKeyFingerprint.length, 8)
  console.log('MODEL_CONFIG_NO_KEY_LEAK')
}

function runLegacyRuntimeRemoved() {
  const guard = fs.readFileSync(path.join(process.cwd(), 'scripts', 'lib', 'model-config-source-guard.mjs'), 'utf8')
  const devApi = fs.readFileSync(path.join(process.cwd(), 'scripts', 'dev-api.js'), 'utf8')

  assert.doesNotMatch(guard, /modelSource\s*===\s*['"]yyapi['"]/i)
  assert.doesNotMatch(guard, /provider:\s*yyapi|apiKeySource:\s*['"]yyapi['"]/i)
  assert.doesNotMatch(devApi, /YYAPI_MODEL_CONFIG_REQUIRED|CONFIG_CONFLICT_DIRECT_WITH_YYAPI/i)
  assert.doesNotMatch(devApi, /gpt-5\.5/i)
  console.log('MODEL_CONFIG_LEGACY_RUNTIME_REMOVED')
}

runDirectRuntimeConfig()
runMissingDirectConfig()
runEmptyRuntimeConfig()
runAgentIsolation()
runDirectWritesAllowed()
runNoKeyLeak()
runLegacyRuntimeRemoved()
