const MINIMAX_MODEL_ID = 'MiniMax-M3'
const MINIMAX_CN_BASE_URL = 'https://api.minimaxi.com/v1'
const MINIMAX_INTL_BASE_URL = 'https://api.minimax.io/v1'
const YYAPI_BASE_URL = 'http://124.222.21.44:3002/v1'

const MINIMAX_MODELS = Object.freeze([
  {
    id: MINIMAX_MODEL_ID,
    name: 'MiniMax M3',
    api: 'openai-completions',
    reasoning: true,
    input: ['text'],
    contextWindow: 204800,
    maxTokens: 131072,
  },
  {
    id: 'MiniMax-M2.7',
    name: 'MiniMax M2.7',
    api: 'openai-completions',
    reasoning: true,
    input: ['text'],
    contextWindow: 204800,
    maxTokens: 131072,
  },
  {
    id: 'MiniMax-M2.7-highspeed',
    name: 'MiniMax M2.7 Highspeed',
    api: 'openai-completions',
    reasoning: true,
    input: ['text'],
    contextWindow: 204800,
    maxTokens: 131072,
  },
  {
    id: 'MiniMax-M2.5',
    name: 'MiniMax M2.5',
    api: 'openai-completions',
    reasoning: true,
    input: ['text'],
    contextWindow: 204800,
    maxTokens: 131072,
  },
])

export const MODEL_PROVIDER_PROFILES = Object.freeze({
  minimax: Object.freeze({
    id: 'minimax',
    group: 'minimax',
    name: 'MiniMax',
    label: 'MiniMax',
    region: 'global',
    api: 'openai-completions',
    transport: 'openai_chat',
    baseUrl: MINIMAX_INTL_BASE_URL,
    defaultModel: MINIMAX_MODEL_ID,
    models: MINIMAX_MODELS,
    env: Object.freeze({
      apiKey: 'MINIMAX_API_KEY',
      baseUrl: 'MINIMAX_BASE_URL',
      openAiApiKey: 'OPENAI_API_KEY',
      openAiBaseUrl: 'OPENAI_BASE_URL',
      openAiModel: 'OPENAI_MODEL',
      openClawApiKey: 'OPENCLAW_MINIMAX_API_KEY',
      forceProvider: 'SUPERCLAW_FORCE_PROVIDER',
    }),
    agent: Object.freeze({
      hermesProvider: 'minimax',
      openclawProvider: 'minimax',
      claudeProvider: 'openai-compatible',
      managedBy: 'superclaw-provider-profile:minimax',
    }),
  }),
  'minimax-cn': Object.freeze({
    id: 'minimax-cn',
    group: 'minimax',
    name: 'MiniMax CN',
    label: 'MiniMax 国内',
    region: 'cn',
    api: 'openai-completions',
    transport: 'openai_chat',
    baseUrl: MINIMAX_CN_BASE_URL,
    defaultModel: MINIMAX_MODEL_ID,
    models: MINIMAX_MODELS,
    env: Object.freeze({
      apiKey: 'MINIMAX_CN_API_KEY',
      baseUrl: 'MINIMAX_CN_BASE_URL',
      openAiApiKey: 'OPENAI_API_KEY',
      openAiBaseUrl: 'OPENAI_BASE_URL',
      openAiModel: 'OPENAI_MODEL',
      openClawApiKey: 'OPENCLAW_MINIMAX_API_KEY',
      forceProvider: 'SUPERCLAW_FORCE_PROVIDER',
    }),
    agent: Object.freeze({
      hermesProvider: 'minimax-cn',
      openclawProvider: 'minimax_cn',
      claudeProvider: 'openai-compatible',
      managedBy: 'superclaw-provider-profile:minimax-cn',
    }),
  }),
  yyapi: Object.freeze({
    id: 'yyapi',
    group: 'yyapi',
    name: 'YYAPI',
    label: 'YYAPI',
    region: 'cn',
    api: 'openai-completions',
    transport: 'openai_chat',
    baseUrl: YYAPI_BASE_URL,
    defaultModel: '',
    models: Object.freeze([]),
    env: Object.freeze({
      apiKey: 'YYAPI_API_KEY',
      baseUrl: 'YYAPI_BASE_URL',
      openAiApiKey: 'OPENAI_API_KEY',
      openAiBaseUrl: 'OPENAI_BASE_URL',
      openAiModel: 'OPENAI_MODEL',
      openClawApiKey: 'OPENCLAW_YYAPI_API_KEY',
      forceProvider: 'SUPERCLAW_FORCE_PROVIDER',
    }),
    agent: Object.freeze({
      hermesProvider: 'custom',
      openclawProvider: 'yyapi',
      claudeProvider: 'openai-compatible',
      managedBy: 'superclaw-provider-profile:yyapi',
    }),
  }),
})

export const DEFAULT_MODEL_PROVIDER_PROFILE_ID = 'minimax-cn'

function clean(value) {
  return String(value || '').trim()
}

export function withoutTrailingSlash(value) {
  return clean(value).replace(/\/+$/, '')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function getModelProviderProfile(providerId = DEFAULT_MODEL_PROVIDER_PROFILE_ID) {
  const key = clean(providerId).toLowerCase().replace(/_/g, '-')
  const profile = MODEL_PROVIDER_PROFILES[key] || MODEL_PROVIDER_PROFILES[DEFAULT_MODEL_PROVIDER_PROFILE_ID]
  return clone(profile)
}

export function listModelProviderProfiles({ group } = {}) {
  const profiles = Object.values(MODEL_PROVIDER_PROFILES)
  return profiles
    .filter(profile => !group || profile.group === group)
    .map(profile => clone(profile))
}

export function getMiniMaxProviderProfiles() {
  return listModelProviderProfiles({ group: 'minimax' })
}

export function getYyapiProviderProfiles() {
  return listModelProviderProfiles({ group: 'yyapi' })
}

export function providerProfileForBaseUrl(baseUrl, fallbackId = DEFAULT_MODEL_PROVIDER_PROFILE_ID) {
  const value = withoutTrailingSlash(baseUrl)
  if (value.includes('124.222.21.44:3002')) return getModelProviderProfile('yyapi')
  if (value.includes('yyapi')) return getModelProviderProfile('yyapi')
  if (value.includes('api.minimaxi.com')) return getModelProviderProfile('minimax-cn')
  if (value.includes('api.minimax.io')) return getModelProviderProfile('minimax')
  return getModelProviderProfile(fallbackId)
}

export function normalizeProviderProfileConfig(input = {}, fallbackId = DEFAULT_MODEL_PROVIDER_PROFILE_ID) {
  const baseProfile = input.baseUrl
    ? providerProfileForBaseUrl(input.baseUrl, input.providerId || fallbackId)
    : getModelProviderProfile(input.providerId || fallbackId)
  const baseUrl = withoutTrailingSlash(input.baseUrl || baseProfile.baseUrl)
  const profile = providerProfileForBaseUrl(baseUrl, baseProfile.id)
  const model = clean(input.model || profile.defaultModel)
  return {
    providerId: profile.id,
    providerName: profile.name,
    label: profile.label,
    group: profile.group,
    api: profile.api,
    baseUrl: baseUrl || profile.baseUrl,
    model: model || profile.defaultModel,
    models: profile.models,
    env: profile.env,
    agent: profile.agent,
    cnBaseUrl: MODEL_PROVIDER_PROFILES['minimax-cn'].baseUrl,
    intlBaseUrl: MODEL_PROVIDER_PROFILES.minimax.baseUrl,
    yyapiBaseUrl: MODEL_PROVIDER_PROFILES.yyapi.baseUrl,
  }
}

export function openClawProviderIdForProfile(profileConfig = {}) {
  const profile = getModelProviderProfile(profileConfig.providerId || DEFAULT_MODEL_PROVIDER_PROFILE_ID)
  return profile.agent.openclawProvider || profile.id
}

export function hermesProviderIdForProfile(profileConfig = {}) {
  const profile = getModelProviderProfile(profileConfig.providerId || DEFAULT_MODEL_PROVIDER_PROFILE_ID)
  return profile.agent.hermesProvider || profile.id
}

export function modelRefForProfile(profileConfig = {}) {
  const config = normalizeProviderProfileConfig(profileConfig)
  return `${openClawProviderIdForProfile(config)}/${config.model}`
}

export function modelDefinitionForProfile(profileConfig = {}) {
  const config = normalizeProviderProfileConfig(profileConfig)
  const model = config.models.find(item => item.id === config.model) || config.models[0] || {}
  return {
    ...model,
    id: config.model,
    name: model.name || config.model,
    api: model.api || config.api || 'openai-completions',
    reasoning: model.reasoning !== undefined ? model.reasoning : true,
    input: Array.isArray(model.input) && model.input.length ? model.input : ['text'],
    contextWindow: Number(model.contextWindow || 204800),
    maxTokens: Number(model.maxTokens || 131072),
  }
}

export function buildOpenClawProviderConfig(profileConfig = {}, apiKey) {
  const config = normalizeProviderProfileConfig(profileConfig)
  const provider = {
    api: config.api,
    baseUrl: config.baseUrl,
    models: [modelDefinitionForProfile(config)],
  }
  if (apiKey) provider.apiKey = apiKey
  return provider
}

export function envForProviderProfile(profileConfig = {}, apiKey = '') {
  const config = normalizeProviderProfileConfig(profileConfig)
  const env = {
    [config.env.baseUrl]: config.baseUrl,
    [config.env.openAiBaseUrl]: config.baseUrl,
    [config.env.openAiModel]: config.model,
    [config.env.forceProvider]: config.group,
    SUPERCLAW_MODEL_PROVIDER_PROFILE: config.providerId,
    SUPERCLAW_MODEL_PROVIDER_GROUP: config.group,
  }
  if (apiKey) {
    env[config.env.apiKey] = apiKey
    env[config.env.openAiApiKey] = apiKey
    env[config.env.openClawApiKey] = apiKey
    if (config.group === 'minimax') {
      env.MINIMAX_API_KEY = apiKey
      env.MINIMAX_CN_API_KEY = apiKey
    } else if (config.group === 'yyapi') {
      env.YYAPI_TOKEN = apiKey
      env.SUPERCLAW_YYAPI_API_KEY = apiKey
      env.SUPERCLAW_YYAPI_TOKEN = apiKey
    }
  }
  if (config.group === 'minimax') {
    env.MINIMAX_BASE_URL = config.baseUrl
    env.MINIMAX_CN_BASE_URL = config.baseUrl
  } else if (config.group === 'yyapi') {
    env.YYAPI_BASE_URL = config.baseUrl
    env.SUPERCLAW_YYAPI_BASE_URL = config.baseUrl
    if (config.model) env.SUPERCLAW_YYAPI_MODEL = config.model
  }
  return env
}

export function managedEnvKeysForProviderProfile(profileConfig = {}) {
  const config = normalizeProviderProfileConfig(profileConfig)
  return Array.from(new Set([
    config.env.apiKey,
    config.env.baseUrl,
    config.env.openAiApiKey,
    config.env.openAiBaseUrl,
    config.env.openAiModel,
    config.env.openClawApiKey,
    config.env.forceProvider,
    ...(config.group === 'minimax'
      ? ['MINIMAX_API_KEY', 'MINIMAX_CN_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_CN_BASE_URL']
      : []),
    ...(config.group === 'yyapi'
      ? ['YYAPI_TOKEN', 'YYAPI_BASE_URL', 'SUPERCLAW_YYAPI_API_KEY', 'SUPERCLAW_YYAPI_TOKEN', 'SUPERCLAW_YYAPI_BASE_URL', 'SUPERCLAW_YYAPI_MODEL']
      : []),
    'SUPERCLAW_MODEL_PROVIDER_PROFILE',
    'SUPERCLAW_MODEL_PROVIDER_GROUP',
  ]))
}

export function isProviderProfileManagedRelay(value = '') {
  return clean(value).startsWith('superclaw-provider-profile:')
}
