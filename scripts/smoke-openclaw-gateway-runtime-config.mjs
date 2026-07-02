import fs from 'node:fs'
import {
  isValidOpenClawProviderConfig,
  normalizeProviderModelList,
  resolveOpenClawGatewayPrimaryModel,
  sanitizeOpenClawGatewayProviders,
} from './dev-api.js'

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${message}`)
  }
}

const devApi = fs.readFileSync('scripts/dev-api.js', 'utf8')

assert(normalizeProviderModelList([' MiniMax-M3 ', { id: 'gpt-4.1' }, { model: 'custom-model' }]).length === 3, 'model list normalization keeps string/object model ids')

const emptyProviders = sanitizeOpenClawGatewayProviders({
  'openai-compatible': {
    baseUrl: '',
    apiKey: '',
    api: 'openai-completions',
    models: [],
    needsSetup: true,
  },
  minimax: {
    api: 'openai-completions',
    baseUrl: '',
    apiKey: '',
    models: [],
  },
})

assert(Object.keys(emptyProviders).length === 0, 'empty openai-compatible and minimax providers are removed')
assert(!isValidOpenClawProviderConfig('openai-compatible', { baseUrl: '', models: [{ id: 'x' }] }), 'openai-compatible without baseUrl is invalid')
assert(!isValidOpenClawProviderConfig('openai-compatible', { baseUrl: 'https://api.example.test/v1', models: [] }), 'openai-compatible without models is invalid')
assert(!isValidOpenClawProviderConfig('minimax', { apiKey: '', models: [{ id: 'MiniMax-M3' }] }), 'minimax without apiKey is invalid')
assert(!isValidOpenClawProviderConfig('minimax', { apiKey: { source: 'env', id: 'OPENCLAW_MINIMAX_API_KEY' }, models: [] }), 'minimax without models is invalid')
assert(!isValidOpenClawProviderConfig('openai-compatible', { baseUrl: 'https://models.example.test/v1', models: [{ id: 'custom-chat' }], needsSetup: true }), 'needsSetup provider is invalid even when other fields are present')

const validProviders = sanitizeOpenClawGatewayProviders({
  'openai-compatible': {
    baseUrl: 'https://models.example.test/v1',
    apiKey: '',
    api: 'openai-completions',
    models: [{ id: 'custom-chat' }],
  },
  minimax: {
    api: 'openai-completions',
    baseUrl: 'https://api.minimaxi.com/v1',
    apiKey: { source: 'env', provider: 'default', id: 'OPENCLAW_MINIMAX_API_KEY' },
    models: [{ id: 'MiniMax-M3' }],
  },
})

assert(Boolean(validProviders['openai-compatible']), 'valid openai-compatible provider is retained')
assert(Boolean(validProviders.minimax), 'valid minimax provider is retained')
assert(!('needsSetup' in validProviders['openai-compatible']), 'needsSetup is stripped from gateway provider config')
assert(!('apiKey' in validProviders['openai-compatible']), 'empty apiKey is stripped from valid openai-compatible provider')
assert(validProviders['openai-compatible'].baseUrl !== '', 'generated config does not retain baseUrl empty string')

const emptyPrimary = resolveOpenClawGatewayPrimaryModel({
  cfg: {
    models: { providers: {} },
    agents: { defaults: { model: {} } },
  },
  env: {},
  minimaxConfig: {},
  testMode: false,
})

assert(emptyPrimary.status === 'config_required', 'empty OpenClaw runtime config stays needs_setup instead of auto-selecting a model')
assert(emptyPrimary.source === 'missing', 'empty OpenClaw runtime config reports missing model source')
assert(emptyPrimary.primary === '', 'empty OpenClaw runtime config does not synthesize a primary model')

const userPrimary = resolveOpenClawGatewayPrimaryModel({
  cfg: {
    models: {
      providers: {
        custom: {
          api: 'openai-completions',
          baseUrl: 'https://models.example.test/v1',
          models: [{ id: 'custom-chat' }],
        },
      },
    },
    agents: { defaults: { model: { primary: 'custom/custom-chat' } } },
  },
  env: {},
  minimaxConfig: {},
  testMode: false,
})

assert(userPrimary.status === 'ready', 'configured OpenClaw provider is ready')
assert(userPrimary.source === 'user_config', 'configured OpenClaw provider is treated as user runtime config')
assert(userPrimary.primary === 'custom/custom-chat', 'configured OpenClaw provider keeps its selected primary model')

const testPrimary = resolveOpenClawGatewayPrimaryModel({
  cfg: {
    models: { providers: {} },
    agents: { defaults: { model: {} } },
  },
  env: {
    VITE_SUPERCLAW_TEST_BUILD: '1',
    VITE_SUPERCLAW_FORCE_PROVIDER: 'minimax',
    MINIMAX_MODEL: 'MiniMax-M3',
  },
  minimaxConfig: { model: 'MiniMax-M3', baseUrl: 'https://api.minimaxi.com/v1' },
  testMode: true,
})

assert(testPrimary.status === 'ready', 'test mode can resolve an OpenClaw MiniMax primary')
assert(testPrimary.source === 'test_override', 'MiniMax primary is marked as a test override')
assert(testPrimary.primary === 'minimax/MiniMax-M3', 'MiniMax primary is only synthesized for explicit test mode')

assert(/sanitizeOpenClawGatewayProviders\(cfg\.models\.providers\)/.test(devApi), 'launch config sanitizes providers before writing')
assert(/resolveOpenClawGatewayPrimaryModel\(\{ cfg, env, minimaxConfig/.test(devApi), 'launch config resolves primary from runtime config')
assert(!/ensureOpenClawGatewayPrimaryModel\(cfg,\s*['"]minimax['"]/.test(devApi), 'launch config does not force minimax as the OpenClaw primary model')
assert(/ensureOpenClawGatewayWorkspace\(cfg\)/.test(devApi), 'launch config normalizes OpenClaw workspace path')
assert(/OutputEncoding\s*=\s*\[System\.Text\.Encoding\]::UTF8/.test(devApi), 'Windows process command line is read as UTF-8 for non-ASCII paths')
assert(/OPENCLAW_MODEL_PROVIDER_REQUIRED/.test(devApi), 'missing provider maps to an explicit needs_setup code')
assert(/status:\s*'needs_setup'/.test(devApi), 'start/status path can report needs_setup')
assert(/OPENCLAW_MODEL_CONFIG_REQUIRED/.test(devApi), 'missing runtime model config maps to an explicit needs_setup code')
assert(/noOpenAiFallback:\s*true/.test(devApi), 'generated OpenClaw launch config records no OpenAI fallback')
assert(!/OPENAI_API_KEY:\s*minimaxConfig\.apiKey/.test(devApi), 'OpenClaw launch env does not alias MiniMax key as OPENAI_API_KEY')
assert(!/OPENAI_MODEL:\s*minimaxConfig\.model/.test(devApi), 'OpenClaw launch env does not alias MiniMax model as OPENAI_MODEL')
assert(!/http:\/\/example\.com/.test(devApi), 'dev-api does not inject a fake baseUrl')
assert(!/provider:\s*['"]yyapi['"]/.test(devApi), 'dev-api does not force yyapi as OpenClaw launch provider')

if (process.exitCode) {
  console.error('\nopenclaw gateway runtime config smoke failed')
  process.exit(process.exitCode)
}

console.log('\nopenclaw gateway runtime config smoke passed')
