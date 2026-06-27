import assert from 'assert/strict'
import fs from 'fs'
import path from 'path'
import {
  getEffectiveModelConfig,
  MODEL_CONFIG_DEFAULTS,
} from './lib/model-config-source-guard.mjs'
import { getRuntimeMode } from './lib/runtime-mode.mjs'
import { readYyapiConfig, sanitizeYyapiConfig, yyapiRelaySummary } from './lib/yyapi-config.mjs'

const directKey = 'direct-dev-key-for-auth-kit-smoke'
const yyapiTokenForSmoke = 'yyapi-token-for-auth-kit-smoke'

function assertNoRawKeyLeak(payload, rawKey) {
  const json = JSON.stringify(payload)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'apiKey'), false, 'top-level apiKey must not be exposed')
  assert.equal(json.includes(rawKey), false, 'payload leaked raw key')
}

function runDevDirectMode() {
  const env = {
    SUPERCLAW_MODE: 'dev',
    MODEL_SOURCE: 'direct',
    AUTH_REQUIRED: 'false',
  }
  const runtime = getRuntimeMode(env)
  assert.equal(runtime.superclawMode, 'dev')
  assert.equal(runtime.modelSource, 'direct')
  assert.equal(runtime.authRequired, false)

  const result = getEffectiveModelConfig('openclaw', {
    env,
    directConfig: {
      provider: MODEL_CONFIG_DEFAULTS.provider,
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: directKey,
    },
  })
  assert.equal(result.superclawMode, 'dev')
  assert.equal(result.modelSource, 'direct')
  assert.equal(result.status, 'ready')
  assert.equal(result.configStatus, 'ready')
  assert.equal(result.apiKeySource, 'direct-env')
  assert.equal(result.yyapiEnabled, false)
  assertNoRawKeyLeak(result, directKey)
  console.log('AUTH_KIT_DEV_DIRECT_PASS')
}

function runReleaseYyapiMode() {
  const env = {
    SUPERCLAW_MODE: 'release',
    MODEL_SOURCE: 'yyapi',
    AUTH_REQUIRED: 'true',
    YYAPI_ENABLED: 'true',
  }
  const runtime = getRuntimeMode(env)
  assert.equal(runtime.superclawMode, 'release')
  assert.equal(runtime.modelSource, 'yyapi')
  assert.equal(runtime.authRequired, true)
  assert.equal(runtime.yyapiEnabled, true)

  const missing = getEffectiveModelConfig('openclaw', {
    env,
    yyapiConfig: readYyapiConfig(env),
  })
  assert.equal(missing.status, 'needs_setup')
  assert.equal(missing.configStatus, 'needs_setup')
  assert.equal(missing.code, 'YYAPI_MODEL_CONFIG_REQUIRED')
  assert.equal(missing.apiKeySource, 'none')

  const yyapiConfig = readYyapiConfig(env, {
    baseUrl: 'https://yyapi.example.invalid/v1',
    model: 'yyapi-model',
    apiKey: yyapiTokenForSmoke,
  })
  const ready = getEffectiveModelConfig('openclaw', {
    env,
    yyapiConfig,
  })
  assert.equal(ready.status, 'ready')
  assert.equal(ready.modelSource, 'yyapi')
  assert.equal(ready.apiKeySource, 'yyapi')
  assertNoRawKeyLeak(ready, yyapiTokenForSmoke)

  const safeConfig = sanitizeYyapiConfig(yyapiConfig)
  const relay = yyapiRelaySummary(yyapiConfig)
  assertNoRawKeyLeak(safeConfig, yyapiTokenForSmoke)
  assertNoRawKeyLeak(relay, yyapiTokenForSmoke)
  assert.equal(relay.mode, 'OPENAI_RELAY')
  console.log('AUTH_KIT_RELEASE_YYAPI_PASS')
}

function runConflictGuard() {
  const env = {
    SUPERCLAW_MODE: 'release',
    MODEL_SOURCE: 'yyapi',
    AUTH_REQUIRED: 'true',
    YYAPI_ENABLED: 'true',
  }
  const result = getEffectiveModelConfig('openclaw', {
    env,
    directConfig: {
      provider: 'minimax',
      baseUrl: MODEL_CONFIG_DEFAULTS.baseUrl,
      model: MODEL_CONFIG_DEFAULTS.model,
      apiKey: directKey,
    },
    yyapiConfig: readYyapiConfig(env, {
      baseUrl: 'https://yyapi.example.invalid/v1',
      model: 'yyapi-model',
      apiKey: yyapiTokenForSmoke,
    }),
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.configStatus, 'ready')
  assert.equal(result.code, 'OK')
  assert.equal(result.modelSource, 'direct')
  assert.equal(result.apiKeySource, 'direct-user')
  assert.equal(result.warnings.includes('USER_DIRECT_MODEL_OVERRIDE'), true)
  assertNoRawKeyLeak(result, directKey)
  assertNoRawKeyLeak(result, yyapiTokenForSmoke)
  console.log('AUTH_KIT_USER_DIRECT_OVERRIDE_PRESERVED_PASS')
}

function runApiExistenceCheck() {
  const devApi = fs.readFileSync(path.join(process.cwd(), 'scripts', 'dev-api.js'), 'utf8')
  for (const route of [
    '/api/runtime-mode',
    '/api/effective-model-config',
    '/api/relay-config',
    '/api/test-relay',
  ]) {
    assert.match(devApi, new RegExp(route.replace(/[/-]/g, match => `\\${match}`)))
  }
  assert.match(devApi, /authYyapiKitEffectiveModelConfig/)
  assert.match(devApi, /getEffectiveModelConfig/)
  console.log('AUTH_KIT_APIS_PASS')
}

function runNoKeyLeakCheck() {
  const files = [
    'scripts/lib/runtime-mode.mjs',
    'scripts/lib/yyapi-config.mjs',
    'scripts/lib/model-config-source-guard.mjs',
    'scripts/dev-api.js',
  ]
  const legacyEndpointPattern = /124\.222\.21\.44/
  const viteKeyMarker = ['VITE', 'MINIMAX', 'API', 'KEY'].join('_')
  for (const file of files) {
    const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    assert.equal(legacyEndpointPattern.test(text), false, `${file} contains a legacy endpoint`)
    assert.equal(text.includes(viteKeyMarker), false, `${file} contains a forbidden frontend key marker`)
  }
  console.log('AUTH_KIT_NO_KEY_LEAK_PASS')
}

runDevDirectMode()
runReleaseYyapiMode()
runConflictGuard()
runApiExistenceCheck()
runNoKeyLeakCheck()
