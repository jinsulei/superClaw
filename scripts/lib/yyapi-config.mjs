import crypto from 'crypto'
import { cleanRuntimeValue, runtimeBoolFlag } from './runtime-mode.mjs'

function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanRuntimeValue(value)
    if (cleaned) return cleaned
  }
  return ''
}

function normalizeBaseUrl(value) {
  const raw = cleanRuntimeValue(value).replace(/\/+$/, '')
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function keyFingerprint(value) {
  const key = cleanRuntimeValue(value)
  return key ? crypto.createHash('sha256').update(key).digest('hex').slice(0, 8) : ''
}

export function readYyapiConfig(env = process.env, overrides = {}) {
  const baseUrl = normalizeBaseUrl(firstValue(
    overrides.baseUrl,
    overrides.base_url,
    env.YYAPI_BASE_URL,
    env.SUPERCLAW_YYAPI_BASE_URL,
    env.VITE_YYAPI_BASE_URL
  ))
  const authBaseUrl = normalizeBaseUrl(firstValue(
    overrides.authBaseUrl,
    overrides.auth_base_url,
    env.YYAPI_AUTH_BASE_URL,
    env.SUPERCLAW_YYAPI_AUTH_BASE_URL,
    env.VITE_YYAPI_AUTH_BASE_URL
  ))
  const model = firstValue(
    overrides.model,
    env.YYAPI_MODEL,
    env.SUPERCLAW_YYAPI_MODEL,
    env.VITE_YYAPI_MODEL
  )
  const apiKey = firstValue(
    overrides.apiKey,
    overrides.api_key,
    overrides.token,
    env.YYAPI_API_KEY,
    env.YYAPI_TOKEN,
    env.SUPERCLAW_YYAPI_API_KEY,
    env.SUPERCLAW_YYAPI_TOKEN
  )
  const provider = firstValue(overrides.provider, env.YYAPI_PROVIDER, 'yyapi')
  const enabled = runtimeBoolFlag(
    overrides.enabled ?? env.YYAPI_ENABLED ?? env.SUPERCLAW_YYAPI_ENABLED,
    false
  )
  const apiKeyConfigured = Boolean(apiKey)
  const ready = Boolean(provider && baseUrl && model && apiKeyConfigured)

  return {
    provider,
    baseUrl,
    authBaseUrl,
    model,
    apiKey,
    apiKeyConfigured,
    apiKeyFingerprint: keyFingerprint(apiKey),
    enabled,
    configPath: firstValue(overrides.configPath, overrides.path, 'runtime-env:yyapi'),
    status: ready ? 'ready' : 'needs_setup',
    code: ready ? 'OK' : 'YYAPI_MODEL_CONFIG_REQUIRED',
  }
}

export function sanitizeYyapiConfig(config = {}) {
  return {
    provider: cleanRuntimeValue(config.provider || 'yyapi'),
    baseUrl: cleanRuntimeValue(config.baseUrl),
    authBaseUrl: cleanRuntimeValue(config.authBaseUrl),
    model: cleanRuntimeValue(config.model),
    apiKeyConfigured: Boolean(config.apiKeyConfigured),
    apiKeyFingerprint: cleanRuntimeValue(config.apiKeyFingerprint),
    enabled: Boolean(config.enabled),
    configPath: cleanRuntimeValue(config.configPath || config.path),
    status: cleanRuntimeValue(config.status || 'needs_setup'),
    code: cleanRuntimeValue(config.code || 'YYAPI_MODEL_CONFIG_REQUIRED'),
  }
}

export function yyapiRelaySummary(config = {}) {
  const safe = sanitizeYyapiConfig(config)
  return {
    mode: 'OPENAI_RELAY',
    provider: safe.provider || 'yyapi',
    baseUrl: safe.baseUrl,
    model: safe.model,
    apiKeyConfigured: safe.apiKeyConfigured,
    apiKeyFingerprint: safe.apiKeyFingerprint,
    status: safe.status,
    code: safe.code,
  }
}
