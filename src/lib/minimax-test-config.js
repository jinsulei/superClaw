import { api, invoke } from './tauri-api.js'
import { getMiniMaxDefaultConfig } from './test-build-mode.js'
import { applyUnifiedModelSelection } from './unified-model-routing.js'

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
  delete cfg.models.mode
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

  // OpenClaw's MiniMax web_search provider has a separate plugin-owned
  // credential path and does not reuse models.providers.minimax.apiKey.
  // SuperClaw's MiniMax test key is a Token Plan key, so keep both official
  // configuration paths in sync without relying on machine-level env vars.
  if (!cfg.plugins || typeof cfg.plugins !== 'object' || Array.isArray(cfg.plugins)) cfg.plugins = {}
  if (!cfg.plugins.entries || typeof cfg.plugins.entries !== 'object' || Array.isArray(cfg.plugins.entries)) {
    cfg.plugins.entries = {}
  }
  const minimaxPlugin = cfg.plugins.entries[PROVIDER_ID] && typeof cfg.plugins.entries[PROVIDER_ID] === 'object'
    ? cfg.plugins.entries[PROVIDER_ID]
    : {}
  const minimaxPluginConfig = minimaxPlugin.config && typeof minimaxPlugin.config === 'object'
    ? minimaxPlugin.config
    : {}
  const webSearch = minimaxPluginConfig.webSearch && typeof minimaxPluginConfig.webSearch === 'object'
    ? minimaxPluginConfig.webSearch
    : {}
  cfg.plugins.entries[PROVIDER_ID] = {
    ...minimaxPlugin,
    enabled: true,
    config: {
      ...minimaxPluginConfig,
      webSearch: {
        ...webSearch,
        ...(apiKey ? { apiKey } : {}),
        region: config.baseUrl.includes('api.minimaxi.com') ? 'cn' : 'global',
      },
    },
  }
  if (!cfg.tools || typeof cfg.tools !== 'object' || Array.isArray(cfg.tools)) cfg.tools = {}
  if (!cfg.tools.web || typeof cfg.tools.web !== 'object' || Array.isArray(cfg.tools.web)) cfg.tools.web = {}
  if (!cfg.tools.web.search || typeof cfg.tools.web.search !== 'object' || Array.isArray(cfg.tools.web.search)) {
    cfg.tools.web.search = {}
  }
  cfg.tools.web.search.provider = PROVIDER_ID
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
  const applied = await applyUnifiedModelSelection({
    providerId: PROVIDER_ID,
    name: PROVIDER_NAME,
    baseUrl: config.baseUrl,
    apiKey,
    api: 'openai-completions',
    model: MODEL_ID,
    models: [openClawModelDefinition()],
    // Hermes keeps region-specific MiniMax ids (`minimax-cn` for the CN
    // endpoint), so the frontend fallback path must match the direct
    // save_minimax_test_config writer instead of defaulting to `minimax`.
    hermesProvider: providerForBaseUrl(config.baseUrl),
  }, { target: 'default', forceClaudeRelay: true })
  return statusFromParts(config, apiKey, {
    openclaw: applied.applied.includes('openclaw'),
    openclawAgent: applied.applied.includes('openclaw'),
    hermes: applied.applied.includes('hermes'),
    claudePanel: applied.applied.includes('claude_code'),
  })
}

export async function saveMiniMaxTestConfig(config = {}) {
  const normalized = normalizeMiniMaxTestConfig(config)
  const direct = await tryInvoke('save_minimax_test_config', { config: normalized })
  if (direct && typeof direct === 'object') return direct
  return applyMiniMaxTestConfig(normalized)
}
