const AUTH_USER_KEY = 'superclaw_auth_user'
const AUTH_STATE_KEY = 'superclaw_auth_state'

function safeJsonParse(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}

function publicLocalStatus() {
  const user = safeJsonParse(localStorage.getItem(AUTH_USER_KEY), null)
  const authState = safeJsonParse(localStorage.getItem(AUTH_STATE_KEY), {})
  const loggedIn = Boolean(user)
  const activated = Boolean(authState?.activated)
  return {
    authRequired: Boolean(authState?.authRequired),
    loggedIn,
    activated,
    allowAppAccess: !authState?.authRequired || (loggedIn && activated),
    sessionConfigured: loggedIn,
    user,
    reason: loggedIn ? (activated ? 'authenticated' : 'activation_required') : 'login_required',
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
    updatedAt: new Date().toISOString(),
  }))
}

export function clearLocalAuthSession() {
  localStorage.removeItem(AUTH_USER_KEY)
  localStorage.removeItem(AUTH_STATE_KEY)
}

export function getLocalAuthStatus() {
  return publicLocalStatus()
}

export function getAuthGuardDecision(status = publicLocalStatus()) {
  if (status.allowAppAccess) {
    return { allowAppAccess: true, targetRoute: null, reason: status.reason || 'authenticated' }
  }
  if (!status.loggedIn) {
    return { allowAppAccess: false, targetRoute: '/login', reason: status.reason || 'login_required' }
  }
  return { allowAppAccess: false, targetRoute: '/activate', reason: status.reason || 'activation_required' }
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

export async function fetchAuthStatus() {
  const payload = await requestJson('/api/auth/status')
  if (payload.status) {
    savePublicStatus(payload.status)
    return { ...payload.status, guard: payload.guard || getAuthGuardDecision(payload.status) }
  }
  return publicLocalStatus()
}

export async function loginAuth(input = {}) {
  const payload = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (payload.status) savePublicStatus(payload.status)
  return payload
}

export async function activateAuth(input = {}) {
  const payload = await requestJson('/api/auth/activate', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const current = publicLocalStatus()
  savePublicStatus({
    ...current,
    ...(payload.status || {}),
    authRequired: payload.status?.authRequired ?? true,
    activated: true,
  })
  return payload
}

export async function logoutAuth() {
  const payload = await requestJson('/api/auth/logout', { method: 'POST', body: '{}' })
  clearLocalAuthSession()
  if (payload.status) savePublicStatus(payload.status)
  return payload
}
