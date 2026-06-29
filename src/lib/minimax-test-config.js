import { api, invoke } from './tauri-api.js'
import { getMiniMaxDefaultConfig } from './test-build-mode.js'
import {
  DEFAULT_MODEL_PROVIDER_PROFILE_ID,
  buildOpenClawProviderConfig,
  getModelProviderProfile,
  hermesProviderIdForProfile,
  modelRefForProfile,
  normalizeProviderProfileConfig,
  openClawProviderIdForProfile,
  providerProfileForBaseUrl,
} from './model-provider-profiles.js'

const MASKED_KEY_RE = /\*{2,}/

function clean(value) {
  return String(value || '').trim()
}

function withTrailingBaseUrl(value) {
  return clean(value).replace(/\/+$/, '')
}

function providerForBaseUrl(baseUrl) {
  return hermesProviderIdForProfile({ baseUrl })
}

function openAiBaseUrlForMiniMaxUrl(baseUrl) {
  return normalizeProviderProfileConfig({ baseUrl }).baseUrl
}

function isPlainNewKey(value) {
  const text = clean(value)
  return !!text && !MASKED_KEY_RE.test(text)
}

function modelRef() {
  return modelRefForProfile(getMiniMaxTestDefaults())
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
  return normalizeProviderProfileConfig({
    providerId: base.providerId || base.provider || DEFAULT_MODEL_PROVIDER_PROFILE_ID,
    model: base.model,
    baseUrl: configuredBaseUrl || undefined,
  })
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
  const next = normalizeProviderProfileConfig({
    providerId: input.providerId || providerProfileForBaseUrl(baseUrl).id,
    model: input.model || defaults.model,
    baseUrl,
  })
  if (isPlainNewKey(input.apiKey)) next.apiKey = clean(input.apiKey)
  return next
}

function ensureMiniMaxProvider(openclawConfig, config, apiKey) {
  const cfg = cloneConfig(openclawConfig)
  if (!cfg.models || typeof cfg.models !== 'object' || Array.isArray(cfg.models)) cfg.models = {}
  delete cfg.models.mode
  if (!cfg.models.providers || typeof cfg.models.providers !== 'object' || Array.isArray(cfg.models.providers)) {
    cfg.models.providers = {}
  }
  const providerId = openClawProviderIdForProfile(config)
  cfg.models.providers[providerId] = buildOpenClawProviderConfig(config, apiKey)
  delete cfg.models.default
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
    providerId: normalized.providerId,
    providerName: normalized.providerName,
    model: normalized.model,
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
  const defaults = getMiniMaxTestDefaults()
  const providerId = openClawProviderIdForProfile(defaults)
  const provider = openclawConfig?.models?.providers?.[providerId] || {}
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
    await api.configureHermes(provider, apiKey, config.model, config.baseUrl)
    await setOptionalHermesEnv('HERMES_PROVIDER', provider)
    await setOptionalHermesEnv('OPENAI_MODEL', config.model)
    await setOptionalHermesEnv('SUPERCLAW_FORCE_PROVIDER', config.group || 'minimax')
    await setOptionalHermesEnv('SUPERCLAW_MODEL_PROVIDER_PROFILE', config.providerId)
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
      name: config.providerName,
      provider: getModelProviderProfile(config.providerId).agent.claudeProvider,
      defaultProvider: config.providerId,
      baseUrl: config.baseUrl,
      apiKey,
      model: config.model,
      models: [config.model],
      branchModels: [config.model],
      managedBy: getModelProviderProfile(config.providerId).agent.managedBy,
    })
    return result?.configured !== false
  } catch {
    return false
  }
}

export async function applyMiniMaxTestConfig(input = {}) {
  const config = normalizeMiniMaxTestConfig(input)
  const current = await api.readOpenclawConfig().catch(() => ({}))
  const providerId = openClawProviderIdForProfile(config)
  const existingKey = clean(current?.models?.providers?.[providerId]?.apiKey)
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
