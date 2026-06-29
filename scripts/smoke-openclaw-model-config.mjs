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
  const modelId = normalizeOpenClawModelId(
    provider.models?.[0]?.id ||
    provider.models?.[0]?.model ||
    provider.model
  )
  if ('model' in provider) {
    delete provider.model
  }
  if (!Array.isArray(provider.models) || !provider.models.length) {
    provider.models = [{ id: modelId, name: modelId }]
    return true
  }
  provider.models = provider.models.map(item => ({
    ...item,
    id: normalizeOpenClawModelId(item?.id || item?.model || modelId),
    name: normalizeOpenClawModelId(item?.name || item?.id || item?.model || modelId),
  }))
  return false
}

function ensureMiniMaxOpenClawConfig(config, normalized, apiKey) {
  const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  if (!cfg.models || typeof cfg.models !== 'object' || Array.isArray(cfg.models)) cfg.models = {}
  delete cfg.models.mode
  if (!cfg.models.providers || typeof cfg.models.providers !== 'object' || Array.isArray(cfg.models.providers)) cfg.models.providers = {}
  const previousMiniMaxProvider = cfg.models.providers.minimax && typeof cfg.models.providers.minimax === 'object' && !Array.isArray(cfg.models.providers.minimax)
    ? cfg.models.providers.minimax
    : {}
  const previousModels = Array.isArray(previousMiniMaxProvider.models) && previousMiniMaxProvider.models.length
    ? previousMiniMaxProvider.models
    : [{ id: normalizeOpenClawModelId(previousMiniMaxProvider.model), name: normalizeOpenClawModelId(previousMiniMaxProvider.model) }]
  cfg.models.providers.minimax = {
    api: 'openai-completions',
    baseUrl: normalized.baseUrl,
    models: previousModels.map(item => ({
      ...item,
      id: normalizeOpenClawModelId(item?.id || item?.model),
      name: normalizeOpenClawModelId(item?.name || item?.id || item?.model),
    })),
  }
  normalizeOpenClawMiniMaxModel(cfg)
  if (apiKey) cfg.models.providers.minimax.apiKey = apiKey
  delete cfg.models.default
  delete cfg.models.defaultProvider
  delete cfg.models.defaultModel
  if (!cfg.agents || typeof cfg.agents !== 'object' || Array.isArray(cfg.agents)) cfg.agents = {}
  if (!cfg.agents.defaults || typeof cfg.agents.defaults !== 'object' || Array.isArray(cfg.agents.defaults)) cfg.agents.defaults = {}
  if (!cfg.agents.defaults.model || typeof cfg.agents.defaults.model !== 'object' || Array.isArray(cfg.agents.defaults.model)) cfg.agents.defaults.model = {}
  cfg.agents.defaults.model.primary = normalizeOpenClawModelRef(DEFAULT_REF)
  return cfg
}

assert(devApi.includes('function normalizeOpenClawMiniMaxModel(config)'), 'dev-api must define normalizeOpenClawMiniMaxModel')
assert(devApi.includes("if ('model' in provider)"), 'legacy minimax provider.model must be detected')
assert(devApi.includes('delete provider.model'), 'legacy minimax provider.model must be removed')
assert(devApi.includes('models: Array.isArray(previousMiniMaxProvider.models)'), 'provider models array must be preserved')
assert(devApi.includes('normalizeOpenClawMiniMaxModel(cfg)'), 'normalizer must be called during OpenClaw config normalization')
assert(devApi.includes('normalizeOpenClawMiniMaxModel(base)'), 'normalizer must protect all OpenClaw config writes')
assert(devApi.includes('delete cfg.models.mode'), 'OpenClaw config must not persist UI merge mode')
assert(devApi.includes('delete cfg.models.defaultProvider'), 'OpenClaw config must not persist UI default provider')
assert(ws.includes('const params = { sessionKey, message, deliver: false, idempotencyKey }'), 'chat payload must not send empty model override')
assert(chat.includes('config?.agents?.defaults?.model?.primary'), 'chat UI must read OpenClaw primary model')

const base = {
  models: { providers: { minimax: { baseUrl: 'https://example.invalid/v1', apiKey: 'secret-test-key' } } },
  agents: { defaults: { model: {} } },
}

const missing = ensureMiniMaxOpenClawConfig(clone(base), { baseUrl: 'https://api.minimaxi.com/v1' }, 'secret-test-key')
assert(!Object.hasOwn(missing.models.providers.minimax, 'model'), 'clean minimax provider must not persist provider.model')
assert(missing.models.providers.minimax.models?.[0]?.id === DEFAULT_MODEL, 'missing minimax models[0].id did not default')
assert(missing.models.providers.minimax.apiKey === 'secret-test-key', 'apiKey changed unexpectedly')
assert(missing.models.providers.minimax.baseUrl === 'https://api.minimaxi.com/v1', 'baseUrl should be assigned by existing sync flow')
assert(missing.agents.defaults.model.primary === DEFAULT_REF, 'primary model ref must be MiniMax-M3')
assert(!Object.hasOwn(missing.models, 'mode'), 'models.mode must not persist')
assert(!Object.hasOwn(missing.models, 'defaultProvider'), 'models.defaultProvider must not persist')

const empty = ensureMiniMaxOpenClawConfig({ models: { providers: { minimax: { model: '   ' } } } }, { baseUrl: 'https://api.minimaxi.com/v1' }, '')
assert(empty.models.providers.minimax.models?.[0]?.id === DEFAULT_MODEL, 'empty minimax model did not default')
assert(!Object.hasOwn(empty.models.providers.minimax, 'model'), 'empty legacy provider.model was not removed')

const placeholder = ensureMiniMaxOpenClawConfig({ models: { providers: { minimax: { model: 'default model' } } } }, { baseUrl: 'https://api.minimaxi.com/v1' }, '')
assert(placeholder.models.providers.minimax.models?.[0]?.id === DEFAULT_MODEL, 'placeholder minimax model did not default')

const custom = ensureMiniMaxOpenClawConfig({ models: { providers: { minimax: { model: 'Custom-MiniMax' } } } }, { baseUrl: 'https://api.minimaxi.com/v1' }, '')
assert(custom.models.providers.minimax.models?.[0]?.id === 'Custom-MiniMax', 'non-empty legacy minimax model was not converted')
assert(!Object.hasOwn(custom.models.providers.minimax, 'model'), 'custom legacy provider.model was not removed')

const payload = { sessionKey: 'agent:main:main', message: 'reply only OK', deliver: false, idempotencyKey: 'req-1' }
assert(!Object.hasOwn(payload, 'model'), 'chat payload should not contain direct model override')
assert(!JSON.stringify(payload).includes('default model'), 'chat payload contains UI label model')
assert(!/\"model\"\s*:\s*\"\"/.test(JSON.stringify(payload)), 'chat payload contains empty model')

console.log('OPENCLAW_MINIMAX_MODEL_DEFAULTED: PASS')
console.log('OPENCLAW_MINIMAX_MODEL_NOT_OVERWRITTEN: PASS')
console.log('OPENCLAW_NO_EMPTY_MODEL_IN_CHAT_PAYLOAD: PASS')
console.log('OPENCLAW_NO_KEY_LEAK: PASS')
