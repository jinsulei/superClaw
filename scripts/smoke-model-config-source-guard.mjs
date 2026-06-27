import assert from 'assert/strict'
import fs from 'fs'
import path from 'path'
import {
  assertDirectModelConfigWritable,
  getEffectiveModelConfig,
  MODEL_CONFIG_DEFAULTS,
} from './lib/model-config-source-guard.mjs'

const directKey = 'direct-dev-key-for-smoke'
const yyapiTokenForSmoke = 'yyapi-dev-token-for-smoke'

function assertNoRawKeyLeak(config, rawKey) {
  const json = JSON.stringify(config)
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'apiKey'), false, 'effective config must not expose apiKey')
  assert.equal(json.includes(rawKey), false, 'effective config leaked a raw key')
}

function runDevDirect() {
  const result = getEffectiveModelConfig('openclaw', {
    env: {
      SUPERCLAW_MODE: 'dev',
      MODEL_SOURCE: 'direct',
      AUTH_REQUIRED: 'false',
    },
    directConfig: {
      provider: MODEL_CONFIG_DEFAULTS.provider,
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: directKey,
      configPath: 'resources/data/.openclaw/openclaw.json',
    },
  })
  assert.equal(result.mode, 'dev')
  assert.equal(result.modelSource, 'direct')
  assert.equal(result.status, 'ready')
  assert.equal(result.provider, 'minimax')
  assert.equal(result.apiKeyConfigured, true)
  assert.equal(result.apiKeySource, 'direct-env')
  assertNoRawKeyLeak(result, directKey)
  console.log('MODEL_CONFIG_DEV_DIRECT_PASS')
}

function runReleaseYyapi() {
  const ready = getEffectiveModelConfig('openclaw', {
    env: {
      SUPERCLAW_MODE: 'release',
      MODEL_SOURCE: 'yyapi',
      AUTH_REQUIRED: 'true',
    },
    yyapiConfig: {
      provider: 'yyapi',
      baseUrl: 'https://yyapi.example.invalid/v1',
      model: 'yyapi-model',
      apiKey: yyapiTokenForSmoke,
    },
  })
  assert.equal(ready.mode, 'release')
  assert.equal(ready.modelSource, 'yyapi')
  assert.equal(ready.status, 'ready')
  assert.equal(ready.apiKeySource, 'yyapi')
  assertNoRawKeyLeak(ready, yyapiTokenForSmoke)

  const missing = getEffectiveModelConfig('openclaw', {
    env: {
      SUPERCLAW_MODE: 'release',
      MODEL_SOURCE: 'yyapi',
      AUTH_REQUIRED: 'true',
    },
  })
  assert.equal(missing.status, 'needs_setup')
  assert.equal(missing.code, 'YYAPI_MODEL_CONFIG_REQUIRED')
  assert.equal(missing.apiKeySource, 'none')
  console.log('MODEL_CONFIG_RELEASE_YYAPI_PASS')
}

function runConflictGuard() {
  const override = getEffectiveModelConfig('openclaw', {
    env: {
      SUPERCLAW_MODE: 'release',
      MODEL_SOURCE: 'yyapi',
      AUTH_REQUIRED: 'true',
    },
    directConfig: {
      provider: 'minimax',
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: directKey,
    },
    yyapiConfig: {
      provider: 'yyapi',
      baseUrl: 'https://yyapi.example.invalid/v1',
      model: 'yyapi-model',
      apiKey: yyapiTokenForSmoke,
    },
  })
  assert.equal(override.status, 'ready')
  assert.equal(override.code, 'OK')
  assert.equal(override.modelSource, 'direct')
  assert.equal(override.apiKeySource, 'direct-user')
  assert.equal(override.warnings.includes('USER_DIRECT_MODEL_OVERRIDE'), true)
  assertNoRawKeyLeak(override, directKey)
  assert.throws(() => assertDirectModelConfigWritable('openclaw', {
    env: {
      SUPERCLAW_MODE: 'release',
      MODEL_SOURCE: 'yyapi',
      AUTH_REQUIRED: 'true',
    },
  }), /direct model config is disabled/)
  console.log('MODEL_CONFIG_USER_DIRECT_OVERRIDE_PRESERVED')
}

function runAgentIsolation() {
  const openclaw = getEffectiveModelConfig('openclaw', {
    env: { SUPERCLAW_MODE: 'dev', MODEL_SOURCE: 'direct' },
    directConfig: {
      provider: 'minimax',
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: directKey,
    },
  })
  const hermes = getEffectiveModelConfig('hermes', {
    env: { SUPERCLAW_MODE: 'dev', MODEL_SOURCE: 'direct' },
    directConfig: {
      provider: 'minimax',
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: '',
    },
  })
  assert.equal(openclaw.status, 'ready')
  assert.equal(hermes.status, 'needs_setup')

  const devApi = fs.readFileSync(path.join(process.cwd(), 'scripts', 'dev-api.js'), 'utf8')
  assert.match(devApi, /assertDirectModelConfigWritable\('minimax-test-config'\)/)
  assert.doesNotMatch(devApi, /assertDirectModelConfigWritable\('claude-code'\)/)
  assert.match(devApi, /existing-user-relay-config/)
  console.log('MODEL_CONFIG_AGENT_WRITE_ISOLATED')
}

function runNoKeyLeak() {
  const result = getEffectiveModelConfig('openclaw', {
    env: { SUPERCLAW_MODE: 'dev', MODEL_SOURCE: 'direct' },
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

runDevDirect()
runReleaseYyapi()
runConflictGuard()
runAgentIsolation()
runNoKeyLeak()
