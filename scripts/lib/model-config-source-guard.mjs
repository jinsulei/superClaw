import crypto from 'crypto'

export const MODEL_CONFIG_DEFAULTS = Object.freeze({
  provider: 'minimax',
  baseUrl: 'https://api.minimaxi.com/v1',
  model: 'MiniMax-M3',
})

const DIRECT_API_KEY_SOURCES = [
  'MINIMAX_API_KEY',
  'MINIMAX_CN_API_KEY',
  'OPENAI_API_KEY',
]

function clean(value) {
  if (value == null || typeof value === 'object') return ''
  return String(value).trim().replace(/^["']|["']$/g, '').trim()
}

function boolFlag(value, fallback = false) {
  const raw = clean(value).toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return fallback
}

function isPlaceholderApiKey(value) {
  const key = clean(value)
  if (!key) return true
  const lower = key.toLowerCase()
  return lower.includes('placeholder')
    || lower.includes('your_api_key')
    || lower.includes('replace_me')
    || lower.includes('superclaw-login-required')
    || lower.includes('minimax_api_key')
    || lower.includes('openai_api_key')
    || lower.includes('api_key_here')
    || lower.startsWith('${')
    || lower.startsWith('%')
    || lower.startsWith('<')
}

export function normalizeConfigApiKey(value) {
  const key = clean(value)
  return isPlaceholderApiKey(key) ? '' : key
}

export function modelConfigKeyFingerprint(value) {
  const key = normalizeConfigApiKey(value)
  return key ? crypto.createHash('sha256').update(key).digest('hex').slice(0, 8) : ''
}

export function getRuntimeModelPolicy() {
  return { mode: 'runtime', modelSource: 'direct' }
}

function firstConfiguredKey(config = {}, env = {}) {
  const keys = [
    config.apiKey,
    config.api_key,
    config.token,
    config.openaiApiKey,
    config.minimaxApiKey,
  ]
  for (const name of DIRECT_API_KEY_SOURCES) keys.push(env[name])
  for (const value of keys) {
    const key = normalizeConfigApiKey(value)
    if (key) return key
  }
  return ''
}

function normalizeDirectConfig(config = {}, env = {}) {
  const apiKey = firstConfiguredKey(config, env)
  const provider = clean(
    config.provider ||
    config.providerId ||
    env.HERMES_PROVIDER ||
    env.OPENCLAW_PROVIDER ||
    env.AGENT_PROVIDER ||
    env.PROVIDER
  )
  return {
    provider,
    baseUrl: clean(config.baseUrl || config.base_url || env.OPENAI_BASE_URL || ''),
    model: clean(config.model || env.OPENAI_MODEL || ''),
    apiKeyConfigured: !!apiKey,
    apiKeyFingerprint: modelConfigKeyFingerprint(apiKey),
    configPath: clean(config.configPath || config.path || ''),
  }
}

export function getEffectiveModelConfig(agentName, options = {}) {
  const env = options.env || process.env
  const policy = getRuntimeModelPolicy()
  const direct = normalizeDirectConfig(options.directConfig || {}, env)
  const warnings = []

  if (!direct.provider || !direct.baseUrl || !direct.model || !direct.apiKeyConfigured) {
    if (!direct.provider) warnings.push('DIRECT_PROVIDER_MISSING')
    if (!direct.baseUrl) warnings.push('DIRECT_BASE_URL_MISSING')
    if (!direct.model) warnings.push('DIRECT_MODEL_MISSING')
    if (!direct.apiKeyConfigured) warnings.push('DIRECT_API_KEY_MISSING')
    return {
      agentName,
      ...policy,
      provider: direct.provider,
      baseUrl: direct.baseUrl,
      model: direct.model,
      apiKeyConfigured: direct.apiKeyConfigured,
      apiKeySource: direct.apiKeyConfigured ? 'direct-env' : 'none',
      apiKeyFingerprint: direct.apiKeyFingerprint,
      configPath: direct.configPath || options.configPath || '',
      status: 'needs_setup',
      code: 'DIRECT_MODEL_CONFIG_REQUIRED',
      warnings,
    }
  }

  return {
    agentName,
    ...policy,
    provider: direct.provider,
    baseUrl: direct.baseUrl,
    model: direct.model,
    apiKeyConfigured: true,
    apiKeySource: 'direct-env',
    apiKeyFingerprint: direct.apiKeyFingerprint,
    configPath: direct.configPath || options.configPath || '',
    status: 'ready',
    code: 'OK',
    warnings,
  }
}

export function assertDirectModelConfigWritable(agentName, options = {}) {
  void agentName
  void options
  return true
}
