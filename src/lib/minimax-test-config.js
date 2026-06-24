import { api, invoke } from './tauri-api.js'
import { getMiniMaxDefaultConfig } from './test-build-mode.js'

const PROVIDER_ID = 'minimax'
const PROVIDER_NAME = 'MiniMax'
const MODEL_ID = 'MiniMax-M3'
const INTL_BASE_URL = 'https://api.minimax.io/v1'
const CN_BASE_URL = 'https://api.minimaxi.com/v1'
const MASKED_KEY_RE = /\*{2,}/

function clean(value) {
  return String(value || '').trim()
}

function withTrailingBaseUrl(value) {
  return clean(value).replace(/\/+$/, '')
}

function providerForBaseUrl(baseUrl) {
  return withTrailingBaseUrl(baseUrl).includes('api.minimaxi.com') ? 'minimax-cn' : PROVIDER_ID
}

function openAiBaseUrlForMiniMaxUrl(baseUrl) {
  const value = withTrailingBaseUrl(baseUrl)
  if (value.includes('api.minimaxi.com')) return CN_BASE_URL
  if (value.includes('api.minimax.io')) return INTL_BASE_URL
  return value
}

function isPlainNewKey(value) {
  const text = clean(value)
  return !!text && !MASKED_KEY_RE.test(text)
}

function modelRef() {
  return `${PROVIDER_ID}/${MODEL_ID}`
}

function openClawModelDefinition() {
  return {
    id: MODEL_ID,
    name: MODEL_ID,
    api: 'openai-completions',
    reasoning: true,
    input: ['text'],
    contextWindow: 204800,
    maxTokens: 131072,
  }
}

function cloneConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  try {
    return JSON.parse(JSON.stringify(input))
  } catch {
    return { ...input }
  }
}

export function getMiniMaxTestDefaults() {
  const base = getMiniMaxDefaultConfig()
  const configuredBaseUrl = withTrailingBaseUrl(base.baseUrl)
  return {
    providerId: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    model: clean(base.model) || MODEL_ID,
    baseUrl: configuredBaseUrl === INTL_BASE_URL ? CN_BASE_URL : configuredBaseUrl || CN_BASE_URL,
    cnBaseUrl: withTrailingBaseUrl(base.cnBaseUrl) || CN_BASE_URL,
    intlBaseUrl: INTL_BASE_URL,
  }
}

export function maskApiKey(apiKey) {
  const value = clean(apiKey)
  if (!value) return ''
  if (value.length <= 10) return `${value.slice(0, 2)}****`
  return `${value.slice(0, 6)}****${value.slice(-4)}`
}

export function normalizeMiniMaxTestConfig(input = {}) {
  const defaults = getMiniMaxTestDefaults()
  const rawBaseUrl = withTrailingBaseUrl(input.baseUrl || defaults.baseUrl)
  const allowedBaseUrls = [defaults.baseUrl, defaults.cnBaseUrl, defaults.intlBaseUrl].filter(Boolean)
  const baseUrl = allowedBaseUrls.includes(rawBaseUrl)
    ? rawBaseUrl
    : defaults.baseUrl
  const next = {
    providerId: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    model: MODEL_ID,
    baseUrl,
    cnBaseUrl: defaults.cnBaseUrl,
  }
  if (isPlainNewKey(input.apiKey)) next.apiKey = clean(input.apiKey)
  return next
}

function ensureMiniMaxProvider(openclawConfig, config, apiKey) {
  const cfg = cloneConfig(openclawConfig)
  if (!cfg.models || typeof cfg.models !== 'object' || Array.isArray(cfg.models)) cfg.models = {}
  cfg.models.mode = 'merge'
  if (!cfg.models.providers || typeof cfg.models.providers !== 'object' || Array.isArray(cfg.models.providers)) {
    cfg.models.providers = {}
  }
  const models = [openClawModelDefinition()]
  cfg.models.providers[PROVIDER_ID] = {
    api: 'openai-completions',
    baseUrl: config.baseUrl,
    models,
  }
  if (apiKey) cfg.models.providers[PROVIDER_ID].apiKey = apiKey
  delete cfg.models.defaultProvider
  delete cfg.models.defaultModel

  if (!cfg.agents || typeof cfg.agents !== 'object' || Array.isArray(cfg.agents)) cfg.agents = {}
  if (!cfg.agents.defaults || typeof cfg.agents.defaults !== 'object' || Array.isArray(cfg.agents.defaults)) {
    cfg.agents.defaults = {}
  }
  if (!cfg.agents.defaults.model || typeof cfg.agents.defaults.model !== 'object' || Array.isArray(cfg.agents.defaults.model)) {
    cfg.agents.defaults.model = {}
  }
  cfg.agents.defaults.model.primary = modelRef()
  if (!Array.isArray(cfg.agents.defaults.model.fallbacks)) cfg.agents.defaults.model.fallbacks = []
  cfg.agents.defaults.model.fallbacks = cfg.agents.defaults.model.fallbacks.filter(item => item !== modelRef())
  if (!cfg.agents.defaults.models || typeof cfg.agents.defaults.models !== 'object' || Array.isArray(cfg.agents.defaults.models)) {
    cfg.agents.defaults.models = {}
  }
  cfg.agents.defaults.models[modelRef()] = cfg.agents.defaults.models[modelRef()] || {}
  return cfg
}

function statusFromParts(config, apiKey, synced = {}) {
  const normalized = normalizeMiniMaxTestConfig(config)
  const hasApiKey = !!clean(apiKey)
  return {
    providerId: PROVIDER_ID,
    providerName: PROVIDER_NAME,
    model: MODEL_ID,
    baseUrl: normalized.baseUrl,
    cnBaseUrl: normalized.cnBaseUrl,
    hasApiKey,
    maskedKey: hasApiKey ? maskApiKey(apiKey) : '',
    synced: {
      openclaw: !!synced.openclaw,
      openclawAgent: !!synced.openclawAgent,
      hermes: !!synced.hermes,
      claudePanel: !!synced.claudePanel,
    },
  }
}

function statusFromOpenClawConfig(openclawConfig = {}) {
  const provider = openclawConfig?.models?.providers?.[PROVIDER_ID] || {}
  const baseUrl = openAiBaseUrlForMiniMaxUrl(provider.baseUrl) || getMiniMaxTestDefaults().baseUrl
  const apiKey = clean(provider.apiKey)
  return statusFromParts({ baseUrl }, apiKey, {
    openclaw: !!provider.baseUrl,
    openclawAgent: openclawConfig?.agents?.defaults?.model?.primary === modelRef(),
  })
}

async function tryInvoke(command, payload = {}) {
  try {
    return await invoke(command, payload)
  } catch {
    return null
  }
}

export async function readMiniMaxTestConfig() {
  const direct = await tryInvoke('read_minimax_test_config')
  if (direct && typeof direct === 'object') return direct
  try {
    const cfg = await api.readOpenclawConfig()
    return statusFromOpenClawConfig(cfg)
  } catch {
    return statusFromParts(getMiniMaxTestDefaults(), '', {})
  }
}

export async function getMiniMaxConfigStatus() {
  return readMiniMaxTestConfig()
}

async function setOptionalHermesEnv(key, value) {
  try {
    await api.hermesEnvSet(key, value)
    return true
  } catch {
    return false
  }
}

async function configureHermesMiniMax(config, apiKey) {
  if (!apiKey) return false
  const provider = providerForBaseUrl(config.baseUrl)
  try {
    await api.configureHermes(provider, apiKey, MODEL_ID, config.baseUrl)
    await setOptionalHermesEnv('HERMES_PROVIDER', provider)
    await setOptionalHermesEnv('OPENAI_MODEL', MODEL_ID)
    await setOptionalHermesEnv('SUPERCLAW_FORCE_PROVIDER', PROVIDER_ID)
    return true
  } catch {
    return false
  }
}

async function configureClaudePanelMiniMax(config, apiKey) {
  if (!apiKey) return false
  try {
    const result = await api.configureClaudeCodeRelay({
      force: true,
      enabled: true,
      interfaceType: 'relay',
      name: PROVIDER_NAME,
      provider: 'openai-compatible',
      defaultProvider: PROVIDER_ID,
      baseUrl: config.baseUrl,
      apiKey,
      model: MODEL_ID,
      models: [MODEL_ID],
      branchModels: [MODEL_ID],
      managedBy: 'superclaw-minimax-test',
    })
    return result?.configured !== false
  } catch {
    return false
  }
}

export async function applyMiniMaxTestConfig(input = {}) {
  const config = normalizeMiniMaxTestConfig(input)
  const current = await api.readOpenclawConfig().catch(() => ({}))
  const existingKey = clean(current?.models?.providers?.[PROVIDER_ID]?.apiKey)
  const apiKey = config.apiKey || existingKey
  const next = ensureMiniMaxProvider(current, config, apiKey)
  await api.writeOpenclawConfig(next)
  const hermes = await configureHermesMiniMax(config, apiKey)
  const claudePanel = await configureClaudePanelMiniMax(config, apiKey)
  return statusFromParts(config, apiKey, {
    openclaw: true,
    openclawAgent: true,
    hermes,
    claudePanel,
  })
}

export async function saveMiniMaxTestConfig(config = {}) {
  const normalized = normalizeMiniMaxTestConfig(config)
  const direct = await tryInvoke('save_minimax_test_config', { config: normalized })
  if (direct && typeof direct === 'object') return direct
  return applyMiniMaxTestConfig(normalized)
}
