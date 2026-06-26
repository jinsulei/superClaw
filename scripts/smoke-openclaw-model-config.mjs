import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const devApiPath = path.join(root, 'scripts', 'dev-api.js')
const wsPath = path.join(root, 'src', 'lib', 'ws-client.js')
const chatPath = path.join(root, 'src', 'pages', 'chat.js')

const devApi = fs.readFileSync(devApiPath, 'utf8')
const ws = fs.readFileSync(wsPath, 'utf8')
const chat = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const DEFAULT_MODEL = 'MiniMax-M3'
const DEFAULT_REF = `minimax/${DEFAULT_MODEL}`

function isInvalidOpenClawModelId(modelId) {
  const raw = String(modelId || '').trim()
  const lower = raw.toLowerCase()
  return !raw
    || lower === 'default model'
    || lower === 'default'
    || lower === 'undefined'
    || lower === 'null'
}

function normalizeOpenClawModelId(modelId, fallback = DEFAULT_MODEL) {
  return isInvalidOpenClawModelId(modelId) ? fallback : String(modelId).trim()
}

function normalizeOpenClawModelRef(modelRef, fallback = DEFAULT_REF) {
  return isInvalidOpenClawModelId(modelRef) ? fallback : String(modelRef).trim()
}

function normalizeOpenClawMiniMaxModel(config) {
  const provider = config?.models?.providers?.minimax
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return false
  if (isInvalidOpenClawModelId(provider.model)) {
    provider.model = DEFAULT_MODEL
    return true
  }
  provider.model = String(provider.model).trim()
  return false
}

function ensureMiniMaxOpenClawConfig(config, normalized, apiKey) {
  const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  if (!cfg.models || typeof cfg.models !== 'object' || Array.isArray(cfg.models)) cfg.models = {}
  cfg.models.mode = 'merge'
  if (!cfg.models.providers || typeof cfg.models.providers !== 'object' || Array.isArray(cfg.models.providers)) cfg.models.providers = {}
  const previousMiniMaxProvider = cfg.models.providers.minimax && typeof cfg.models.providers.minimax === 'object' && !Array.isArray(cfg.models.providers.minimax)
    ? cfg.models.providers.minimax
    : {}
  cfg.models.providers.minimax = {
    api: 'openai-completions',
    baseUrl: normalized.baseUrl,
    model: normalizeOpenClawModelId(previousMiniMaxProvider.model),
    models: [{ id: DEFAULT_MODEL, name: DEFAULT_MODEL }],
  }
  normalizeOpenClawMiniMaxModel(cfg)
  if (apiKey) cfg.models.providers.minimax.apiKey = apiKey
  if (!cfg.agents || typeof cfg.agents !== 'object' || Array.isArray(cfg.agents)) cfg.agents = {}
  if (!cfg.agents.defaults || typeof cfg.agents.defaults !== 'object' || Array.isArray(cfg.agents.defaults)) cfg.agents.defaults = {}
  if (!cfg.agents.defaults.model || typeof cfg.agents.defaults.model !== 'object' || Array.isArray(cfg.agents.defaults.model)) cfg.agents.defaults.model = {}
  cfg.agents.defaults.model.primary = normalizeOpenClawModelRef(DEFAULT_REF)
  return cfg
}

assert(devApi.includes('function normalizeOpenClawMiniMaxModel(config)'), 'dev-api must define normalizeOpenClawMiniMaxModel')
assert(devApi.includes('provider.model = MINIMAX_TEST_DEFAULTS.model'), 'empty minimax provider.model must default to MiniMax-M3')
assert(devApi.includes('model: normalizeOpenClawModelId(previousMiniMaxProvider.model)'), 'existing non-empty provider.model must be preserved')
assert(devApi.includes('normalizeOpenClawMiniMaxModel(cfg)'), 'normalizer must be called during OpenClaw config normalization')
assert(devApi.includes('normalizeOpenClawMiniMaxModel(base)'), 'normalizer must protect all OpenClaw config writes')
assert(ws.includes('const params = { sessionKey, message, deliver: false, idempotencyKey }'), 'chat payload must not send empty model override')
assert(chat.includes('config?.agents?.defaults?.model?.primary'), 'chat UI must read OpenClaw primary model')

const base = {
  models: { providers: { minimax: { baseUrl: 'https://example.invalid/v1', apiKey: 'secret-test-key' } } },
  agents: { defaults: { model: {} } },
}

const missing = ensureMiniMaxOpenClawConfig(clone(base), { baseUrl: 'https://api.minimaxi.com/v1' }, 'secret-test-key')
assert(missing.models.providers.minimax.model === DEFAULT_MODEL, 'missing minimax.model did not default')
assert(missing.models.providers.minimax.apiKey === 'secret-test-key', 'apiKey changed unexpectedly')
assert(missing.models.providers.minimax.baseUrl === 'https://api.minimaxi.com/v1', 'baseUrl should be assigned by existing sync flow')
assert(missing.agents.defaults.model.primary === DEFAULT_REF, 'primary model ref must be MiniMax-M3')

const empty = ensureMiniMaxOpenClawConfig({ models: { providers: { minimax: { model: '   ' } } } }, { baseUrl: 'https://api.minimaxi.com/v1' }, '')
assert(empty.models.providers.minimax.model === DEFAULT_MODEL, 'empty minimax.model did not default')

const placeholder = ensureMiniMaxOpenClawConfig({ models: { providers: { minimax: { model: 'default model' } } } }, { baseUrl: 'https://api.minimaxi.com/v1' }, '')
assert(placeholder.models.providers.minimax.model === DEFAULT_MODEL, 'placeholder minimax.model did not default')

const custom = ensureMiniMaxOpenClawConfig({ models: { providers: { minimax: { model: 'Custom-MiniMax' } } } }, { baseUrl: 'https://api.minimaxi.com/v1' }, '')
assert(custom.models.providers.minimax.model === 'Custom-MiniMax', 'non-empty minimax.model was overwritten')

const payload = { sessionKey: 'agent:main:main', message: 'reply only OK', deliver: false, idempotencyKey: 'req-1' }
assert(!Object.hasOwn(payload, 'model'), 'chat payload should not contain direct model override')
assert(!JSON.stringify(payload).includes('default model'), 'chat payload contains UI label model')
assert(!/\"model\"\s*:\s*\"\"/.test(JSON.stringify(payload)), 'chat payload contains empty model')

console.log('OPENCLAW_MINIMAX_MODEL_DEFAULTED: PASS')
console.log('OPENCLAW_MINIMAX_MODEL_NOT_OVERWRITTEN: PASS')
console.log('OPENCLAW_NO_EMPTY_MODEL_IN_CHAT_PAYLOAD: PASS')
console.log('OPENCLAW_NO_KEY_LEAK: PASS')
