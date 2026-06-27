import crypto from 'crypto'
import { getRuntimeMode } from './runtime-mode.mjs'

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

function normalizeMode(value) {
  const raw = clean(value).toLowerCase()
  return raw === 'release' ? 'release' : 'dev'
}

function normalizeModelSource(value, mode) {
  const raw = clean(value).toLowerCase()
  if (raw === 'yyapi') return 'yyapi'
  if (raw === 'direct') return 'direct'
  return mode === 'release' ? 'yyapi' : 'direct'
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

export function getRuntimeModelPolicy(env = process.env) {
  const runtime = getRuntimeMode(env)
  return {
    mode: runtime.mode,
    superclawMode: runtime.superclawMode,
    modelSource: runtime.modelSource,
    yyapiEnabled: runtime.yyapiEnabled,
    authRequired: runtime.authRequired,
    allowDirectFallback: runtime.allowDirectFallback,
  }
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
  return {
    provider: clean(config.provider || config.providerId || MODEL_CONFIG_DEFAULTS.provider),
    baseUrl: clean(config.baseUrl || config.base_url || env.OPENAI_BASE_URL || MODEL_CONFIG_DEFAULTS.baseUrl),
    model: clean(config.model || env.OPENAI_MODEL || MODEL_CONFIG_DEFAULTS.model),
    apiKeyConfigured: !!apiKey,
    apiKeyFingerprint: modelConfigKeyFingerprint(apiKey),
    configPath: clean(config.configPath || config.path || ''),
  }
}

function normalizeYyapiConfig(config = {}) {
  const key = normalizeConfigApiKey(config.apiKey || config.api_key || config.token)
  const apiKeyConfigured = config.apiKeyConfigured === true || !!key
  return {
    provider: clean(config.provider || 'yyapi'),
    baseUrl: clean(config.baseUrl || config.base_url || ''),
    model: clean(config.model || ''),
    apiKeyConfigured,
    apiKeyFingerprint: modelConfigKeyFingerprint(key),
    configPath: clean(config.configPath || config.path || ''),
  }
}

export function getEffectiveModelConfig(agentName, options = {}) {
  const env = options.env || process.env
  const policy = getRuntimeModelPolicy(env)
  const direct = normalizeDirectConfig(options.directConfig || {}, env)
  const yyapi = normalizeYyapiConfig(options.yyapiConfig || {})
  const warnings = []

  if (policy.modelSource === 'yyapi') {
    if (direct.apiKeyConfigured && !policy.allowDirectFallback) {
      warnings.push('USER_DIRECT_MODEL_OVERRIDE')
      return {
        agentName,
        ...policy,
        modelSource: 'direct',
        provider: direct.provider,
        baseUrl: direct.baseUrl,
        model: direct.model,
        apiKeyConfigured: true,
        apiKeySource: 'direct-user',
        apiKeyFingerprint: direct.apiKeyFingerprint,
        configPath: direct.configPath || options.configPath || '',
        status: 'ready',
        configStatus: 'ready',
        code: 'OK',
        warnings,
      }
    }

    if (!yyapi.provider || !yyapi.baseUrl || !yyapi.model || !yyapi.apiKeyConfigured) {
      warnings.push('YYAPI_CONFIG_MISSING')
      return {
        agentName,
        ...policy,
        provider: yyapi.provider || 'yyapi',
        baseUrl: yyapi.baseUrl,
        model: yyapi.model,
        apiKeyConfigured: yyapi.apiKeyConfigured,
        apiKeySource: yyapi.apiKeyConfigured ? 'yyapi' : 'none',
        apiKeyFingerprint: yyapi.apiKeyFingerprint,
        configPath: yyapi.configPath || options.configPath || '',
        status: 'needs_setup',
        configStatus: 'needs_setup',
        code: 'YYAPI_MODEL_CONFIG_REQUIRED',
        warnings,
      }
    }

    return {
      agentName,
      ...policy,
      provider: yyapi.provider,
      baseUrl: yyapi.baseUrl,
      model: yyapi.model,
      apiKeyConfigured: yyapi.apiKeyConfigured,
      apiKeySource: 'yyapi',
      apiKeyFingerprint: yyapi.apiKeyFingerprint,
      configPath: yyapi.configPath || options.configPath || '',
      status: 'ready',
      configStatus: 'ready',
      code: 'OK',
      warnings,
    }
  }

  if (!direct.provider || !direct.baseUrl || !direct.model || !direct.apiKeyConfigured) {
    if (!direct.apiKeyConfigured) warnings.push('DIRECT_API_KEY_MISSING')
    return {
      agentName,
      ...policy,
      provider: direct.provider || MODEL_CONFIG_DEFAULTS.provider,
      baseUrl: direct.baseUrl || MODEL_CONFIG_DEFAULTS.baseUrl,
      model: direct.model || MODEL_CONFIG_DEFAULTS.model,
      apiKeyConfigured: direct.apiKeyConfigured,
      apiKeySource: direct.apiKeyConfigured ? 'direct-env' : 'none',
      apiKeyFingerprint: direct.apiKeyFingerprint,
      configPath: direct.configPath || options.configPath || '',
      status: 'needs_setup',
      configStatus: 'needs_setup',
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
    configStatus: 'ready',
    code: 'OK',
    warnings,
  }
}

export function assertDirectModelConfigWritable(agentName, options = {}) {
  const policy = getRuntimeModelPolicy(options.env || process.env)
  if (policy.modelSource === 'yyapi' && !policy.allowDirectFallback) {
    const error = new Error(`${agentName} direct model config is disabled while MODEL_SOURCE=yyapi`)
    error.code = 'DIRECT_CONFIG_DISABLED_IN_RELEASE_YYAPI'
    error.details = { agentName, ...policy }
    throw error
  }
  return true
}
