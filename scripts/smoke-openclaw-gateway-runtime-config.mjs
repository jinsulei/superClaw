import fs from 'node:fs'
import {
  isValidOpenClawProviderConfig,
  normalizeProviderModelList,
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

assert(/sanitizeOpenClawGatewayProviders\(cfg\.models\.providers\)/.test(devApi), 'launch config sanitizes providers before writing')
assert(/OPENCLAW_MODEL_PROVIDER_REQUIRED/.test(devApi), 'missing provider maps to an explicit needs_setup code')
assert(/status:\s*'needs_setup'/.test(devApi), 'start/status path can report needs_setup')
assert(!/http:\/\/example\.com/.test(devApi), 'dev-api does not inject a fake baseUrl')
assert(!/provider:\s*['"]yyapi['"]/.test(devApi), 'dev-api does not force yyapi as OpenClaw launch provider')

if (process.exitCode) {
  console.error('\nopenclaw gateway runtime config smoke failed')
  process.exit(process.exitCode)
}

console.log('\nopenclaw gateway runtime config smoke passed')
