const AUTH_USER_KEY = 'superclaw_auth_user'
const AUTH_STATE_KEY = 'superclaw_auth_state'

function cleanRuntimeValue(value) {
  if (value == null || typeof value === 'object') return ''
  return String(value).trim().replace(/^["']|["']$/g, '').trim()
}

function boolFlag(value, fallback = false) {
  const raw = cleanRuntimeValue(value).toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return fallback
}

function buildRuntimeMode() {
  const env = import.meta?.env || {}
  const mode = cleanRuntimeValue(env.VITE_SUPERCLAW_MODE).toLowerCase() === 'release' ? 'release' : 'dev'
  const modelSource = cleanRuntimeValue(env.VITE_SUPERCLAW_MODEL_SOURCE).toLowerCase() || (mode === 'release' ? 'yyapi' : 'direct')
  return {
    mode,
    modelSource,
    yyapiEnabled: boolFlag(env.VITE_SUPERCLAW_YYAPI_ENABLED, modelSource === 'yyapi'),
    authRequired: boolFlag(env.VITE_SUPERCLAW_AUTH_REQUIRED, mode === 'release'),
    localAuthFallback: boolFlag(env.VITE_SUPERCLAW_USE_LOCAL_AUTH_FALLBACK, false),
  }
}

function isTauriRuntime() {
  return Boolean(window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__)
}

function shouldUseLocalAuthFallback() {
  const runtime = buildRuntimeMode()
  return runtime.localAuthFallback || isTauriRuntime()
}

function safeJsonParse(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}

function publicLocalStatus() {
  const user = safeJsonParse(localStorage.getItem(AUTH_USER_KEY), null)
  const authState = safeJsonParse(localStorage.getItem(AUTH_STATE_KEY), {})
  const runtime = buildRuntimeMode()
  const loggedIn = Boolean(user)
  const activated = Boolean(authState?.activated)
  const authRequired = Boolean(authState?.authRequired ?? runtime.authRequired)
  const allowAppAccess = !authRequired || (activated && loggedIn)
  let nextStep = 'app'
  let reason = 'auth_not_required'
  if (authRequired && !activated) {
    nextStep = 'activate'
    reason = 'activation_required'
  } else if (authRequired && !loggedIn) {
    nextStep = 'login'
    reason = 'login_required'
  } else if (authRequired) {
    reason = 'authenticated'
  }
  return {
    authRequired,
    loggedIn,
    activated,
    allowAppAccess,
    nextStep,
    sessionConfigured: loggedIn,
    user,
    reason,
    mode: runtime.mode,
    modelSource: runtime.modelSource,
    yyapiEnabled: runtime.yyapiEnabled,
    source: 'local',
  }
}

function savePublicStatus(status = {}) {
  if (status.user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(status.user))
  }
  localStorage.setItem(AUTH_STATE_KEY, JSON.stringify({
    authRequired: Boolean(status.authRequired),
    activated: Boolean(status.activated),
    mode: status.mode || buildRuntimeMode().mode,
    modelSource: status.modelSource || buildRuntimeMode().modelSource,
    yyapiEnabled: Boolean(status.yyapiEnabled),
    updatedAt: new Date().toISOString(),
  }))
}

export function clearLocalAuthSession() {
  localStorage.removeItem(AUTH_USER_KEY)
  localStorage.removeItem(AUTH_STATE_KEY)
}

function clearLocalLoginSession() {
  localStorage.removeItem(AUTH_USER_KEY)
}

export function getLocalAuthStatus() {
  return publicLocalStatus()
}

export function getAuthGuardDecision(status = publicLocalStatus()) {
  if (!status.authRequired || status.allowAppAccess) {
    return { allowAppAccess: true, targetRoute: null, reason: status.reason || 'authenticated' }
  }
  if (!status.activated) {
    return { allowAppAccess: false, targetRoute: '/activate', reason: status.reason || 'activation_required' }
  }
  return { allowAppAccess: false, targetRoute: '/login', reason: status.reason || 'login_required' }
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.error || `请求失败：${response.status}`)
    error.payload = payload
    throw error
  }
  return payload
}

function loginLocalAuth(input = {}) {
  const username = cleanRuntimeValue(input.username || input.account || input.phone || input.email)
  const password = cleanRuntimeValue(input.password || input.passcode || input.secret)
  if (!username || !password) {
    const error = new Error('请输入账号和密码。')
    error.code = 'AUTH_LOGIN_INVALID'
    throw error
  }
  const runtime = buildRuntimeMode()
  const current = publicLocalStatus()
  const activated = Boolean(current.activated || !runtime.authRequired)
  const allowAppAccess = !runtime.authRequired || activated
  const status = {
    ...current,
    authRequired: runtime.authRequired,
    loggedIn: true,
    activated,
    allowAppAccess,
    sessionConfigured: true,
    user: {
      id: username,
      name: cleanRuntimeValue(input.name || username),
      username,
      phone: cleanRuntimeValue(input.phone),
      email: cleanRuntimeValue(input.email),
    },
    nextStep: allowAppAccess ? 'app' : 'activate',
    reason: allowAppAccess ? 'authenticated' : 'activation_required',
    source: 'local-fallback',
  }
  savePublicStatus(status)
  return { ok: true, status, guard: getAuthGuardDecision(status), source: 'local-fallback' }
}

function activateLocalAuth(input = {}) {
  const code = cleanRuntimeValue(input.activationCode || input.code || input.license || input.key)
  if (code.length < 4) {
    const error = new Error('请输入有效激活码。')
    error.code = 'AUTH_ACTIVATION_INVALID'
    throw error
  }
  const current = publicLocalStatus()
  const loggedIn = Boolean(current.loggedIn)
  const status = {
    ...current,
    activated: true,
    allowAppAccess: !current.authRequired || loggedIn,
    nextStep: loggedIn ? 'app' : 'login',
    reason: loggedIn ? 'authenticated' : 'login_required',
    source: 'local-fallback',
  }
  savePublicStatus(status)
  return { ok: true, status, guard: getAuthGuardDecision(status), source: 'local-fallback' }
}

export async function fetchAuthStatus() {
  try {
    const payload = await requestJson('/api/auth/status')
    if (payload.status) {
      savePublicStatus(payload.status)
      return { ...payload.status, guard: payload.guard || getAuthGuardDecision(payload.status) }
    }
    return publicLocalStatus()
  } catch (error) {
    if (!shouldUseLocalAuthFallback()) throw error
    const status = publicLocalStatus()
    return { ...status, guard: getAuthGuardDecision(status) }
  }
}

export async function loginAuth(input = {}) {
  try {
    const payload = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (payload.status) savePublicStatus(payload.status)
    return payload
  } catch (error) {
    if (!shouldUseLocalAuthFallback()) throw error
    return loginLocalAuth(input)
  }
}

export async function activateAuth(input = {}) {
  try {
    const payload = await requestJson('/api/auth/activate', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (payload.status) savePublicStatus(payload.status)
    return payload
  } catch (error) {
    if (!shouldUseLocalAuthFallback()) throw error
    return activateLocalAuth(input)
  }
}

export async function logoutAuth() {
  try {
    const payload = await requestJson('/api/auth/logout', { method: 'POST', body: '{}' })
    clearLocalAuthSession()
    if (payload.status) savePublicStatus(payload.status)
    return payload
  } catch (error) {
    if (!shouldUseLocalAuthFallback()) throw error
    clearLocalLoginSession()
    const status = publicLocalStatus()
    return { ok: true, status, guard: getAuthGuardDecision(status), source: 'local-fallback' }
  }
}
