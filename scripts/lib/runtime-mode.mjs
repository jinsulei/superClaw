export function cleanRuntimeValue(value) {
  if (value == null || typeof value === 'object') return ''
  return String(value).trim().replace(/^["']|["']$/g, '').trim()
}

export function runtimeBoolFlag(value, fallback = false) {
  const raw = cleanRuntimeValue(value).toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return fallback
}

export function normalizeSuperclawMode(value) {
  return cleanRuntimeValue(value).toLowerCase() === 'release' ? 'release' : 'dev'
}

export function normalizeModelSource(value, mode = 'dev') {
  const raw = cleanRuntimeValue(value).toLowerCase()
  if (raw === 'yyapi') return 'yyapi'
  if (raw === 'direct') return 'direct'
  return mode === 'release' ? 'yyapi' : 'direct'
}

export function getRuntimeMode(env = process.env) {
  const superclawMode = normalizeSuperclawMode(env.SUPERCLAW_MODE || env.VITE_SUPERCLAW_MODE)
  const modelSource = normalizeModelSource(env.MODEL_SOURCE || env.SUPERCLAW_MODEL_SOURCE, superclawMode)
  const yyapiEnabled = runtimeBoolFlag(
    env.YYAPI_ENABLED || env.SUPERCLAW_YYAPI_ENABLED || env.VITE_SUPERCLAW_YYAPI_ENABLED,
    modelSource === 'yyapi'
  )
  const authRequired = runtimeBoolFlag(
    env.AUTH_REQUIRED || env.SUPERCLAW_AUTH_REQUIRED || env.VITE_SUPERCLAW_AUTH_REQUIRED,
    superclawMode === 'release'
  )
  const allowDirectFallback = runtimeBoolFlag(
    env.ALLOW_DIRECT_FALLBACK || env.SUPERCLAW_ALLOW_DIRECT_FALLBACK,
    false
  )
  return {
    mode: superclawMode,
    superclawMode,
    modelSource,
    yyapiEnabled,
    authRequired,
    allowDirectFallback,
  }
}
