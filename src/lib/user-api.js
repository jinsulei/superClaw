/**
 * SuperClaw remote user API service.
 * Handles activation, login/register, YYApi token sync, quota and payment.
 */
import {
  YYAPI_PROVIDER_KEY,
  getUserApiBaseUrl,
  getUserApiBaseUrlV2,
  getYyapiBaseUrl,
  isYyapiBaseUrl,
} from './yyapi-config.js'
import { clearLocalAuthSession } from './auth-session.js'

const LOGOUT_MODEL_PLACEHOLDER = 'superclaw-login-required'

function getBaseUrl() {
  return getUserApiBaseUrl()
}

function getBaseUrlV2() {
  return getUserApiBaseUrlV2()
}

export function navigateTo(path) {
  window.location.hash = '#/' + String(path || '').replace(/^\/+/, '')
  window.location.reload()
}

export function navigateToAuth(path) {
  window.location.hash = '#/' + String(path || '').replace(/^\/+/, '')
}

export function getToken() {
  return localStorage.getItem('superclaw_token')
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('superclaw_token', token)
  } else {
    localStorage.removeItem('superclaw_token')
  }
}

export function getStoredUser() {
  const raw = localStorage.getItem('superclaw_user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem('superclaw_user', JSON.stringify(user))
  } else {
    localStorage.removeItem('superclaw_user')
  }
}

export function isLoggedIn() {
  return !!getToken()
}

export function clearAuth() {
  localStorage.removeItem('superclaw_token')
  localStorage.removeItem('superclaw_user')
  // 同时清空本地 dev-api 会话（superclaw_auth_user / superclaw_auth_state），
  // 避免重新激活/退出登录后 dev-api /api/auth/status 仍返回已登录状态。
  clearLocalAuthSession()
  clearConfiguredModelsForLogout().catch(err => {
    console.warn('[auth] clear configured models failed:', err?.message || err)
  })
}

export async function clearConfiguredModelsForLogout() {
  try { localStorage.removeItem('superclaw_yyapi_key') } catch {}
  try { localStorage.removeItem('superclaw_yyapi_user_id') } catch {}
  try { localStorage.removeItem('superclaw-primary-model') } catch {}
  try { localStorage.removeItem('hermes-primary-model') } catch {}
  try { sessionStorage.removeItem('superclaw_yyapi_dismissed') } catch {}

  if (!window.__TAURI_INTERNALS__) return

  const { api } = await import('./tauri-api.js')
  await Promise.allSettled([
    resetOpenclawManagedModelConfig(api),
    resetHermesManagedModelConfig(api),
    resetClaudeManagedModelConfig(api),
  ])
}

async function resetOpenclawManagedModelConfig(api) {
  const yyapiBaseUrl = getYyapiBaseUrl()
  const config = await api.readOpenclawConfig()
  if (!config.models) config.models = {}
  if (!config.models.providers) config.models.providers = {}

  config.models.providers[YYAPI_PROVIDER_KEY] = {
    ...(config.models.providers[YYAPI_PROVIDER_KEY] || {}),
    baseUrl: yyapiBaseUrl,
    apiKey: LOGOUT_MODEL_PLACEHOLDER,
    api: 'openai-completions',
    models: [],
  }

  if (!config.agents) config.agents = {}
  if (!config.agents.defaults) config.agents.defaults = {}
  if (!config.agents.defaults.model) config.agents.defaults.model = {}

  if (isManagedYyapiModelRef(config.agents.defaults.model.primary)) {
    config.agents.defaults.model.primary = ''
  }
  if (Array.isArray(config.agents.defaults.model.fallbacks)) {
    config.agents.defaults.model.fallbacks = config.agents.defaults.model.fallbacks
      .filter(ref => !isManagedYyapiModelRef(ref))
  }
  if (config.agents.defaults.models && typeof config.agents.defaults.models === 'object') {
    for (const key of Object.keys(config.agents.defaults.models)) {
      if (isManagedYyapiModelRef(key)) delete config.agents.defaults.models[key]
    }
  }

  for (const agent of (config.agents.list || [])) {
    if (!agent?.model || typeof agent.model !== 'object') continue
    if (isManagedYyapiModelRef(agent.model.primary)) agent.model.primary = ''
    if (Array.isArray(agent.model.fallbacks)) {
      agent.model.fallbacks = agent.model.fallbacks.filter(ref => !isManagedYyapiModelRef(ref))
    }
  }

  await api.writeOpenclawConfig(config)
}

async function resetHermesManagedModelConfig(api) {
  const yyapiBaseUrl = getYyapiBaseUrl()
  const current = await api.hermesReadConfig().catch(() => null)
  if (!isYyapiBaseUrl(current?.base_url || '')) return

  await api.configureHermes(
    'custom',
    '',
    LOGOUT_MODEL_PLACEHOLDER,
    yyapiBaseUrl,
  )
}

async function resetClaudeManagedModelConfig(api) {
  const yyapiBaseUrl = getYyapiBaseUrl()
  if (typeof api.configureClaudeCodeRelay !== 'function') return
  await api.configureClaudeCodeRelay({
    name: 'YYAPI',
    provider: 'openai-compatible',
    defaultProvider: YYAPI_PROVIDER_KEY,
    interfaceType: 'relay',
    baseUrl: yyapiBaseUrl,
    apiKey: LOGOUT_MODEL_PLACEHOLDER,
    model: LOGOUT_MODEL_PLACEHOLDER,
    models: [],
    branchModels: [],
    managedBy: 'superclaw-yyapi',
    force: false,
  })
}

function isManagedYyapiModelRef(ref) {
  const value = String(ref || '').trim()
  return !value || value.startsWith(`${YYAPI_PROVIDER_KEY}/`)
}

function isAuthInvalidError(status, message = '') {
  return status === 401
    || /令牌|未登录|unauthorized|forbidden|invalid\s*token|用户不存在/i.test(message)
}

async function request(path, options = {}) {
  const { method = 'POST', body, auth = false, suppressAuthRedirect = false, timeoutMs = 15000 } = options
  const baseUrl = getBaseUrl()
  if (!baseUrl) throw new Error('USER_API_BASE_URL 未配置')

  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const controller = timeoutMs ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const resp = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    signal: controller?.signal,
    body: body ? JSON.stringify(body) : undefined,
  }).finally(() => { if (timer) clearTimeout(timer) })

  let data
  try {
    data = await resp.json()
  } catch {
    data = {}
  }

  if (!resp.ok) {
    const msg = data.error || data.message || `HTTP ${resp.status}`
    if (isAuthInvalidError(resp.status, msg)) {
      clearAuth()
      if (!suppressAuthRedirect) navigateTo('login')
    }
    throw new Error(msg)
  }

  if (data && data.success !== undefined && data.data !== undefined) return data.data
  return data
}

export async function activateCode(code, options = {}) {
  if (options.endpoint === 'v2') {
    return requestV2('/license/activate', {
      body: {
        code,
        usbId: options.usb?.usbId || null,
        usb: options.usb || null,
      },
    })
  }
  return request('/redemption/activate', { body: { code } })
}

export async function register(data) {
  return request('/auth/register', { body: data })
}

export async function login(data) {
  return request('/auth/login', { body: data, suppressAuthRedirect: true })
}

export async function logout() {
  try {
    await request('/auth/logout', { auth: true, method: 'POST', suppressAuthRedirect: true })
  } catch {
    // Logout should complete locally even if the server is unavailable.
  }
  localStorage.removeItem('superclaw_token')
  localStorage.removeItem('superclaw_user')
  clearLocalAuthSession()
  await clearConfiguredModelsForLogout()
}

export async function getUserInfo() {
  return request('/user/info', { auth: true, method: 'GET', timeoutMs: 2500 })
}

export async function bindActivation(code) {
  return request('/auth/bind-activation', { auth: true, body: { code } })
}

export async function redeemCode(code) {
  // suppressAuthRedirect: 注册后立即兑换时，若 token 异常不应把用户踢回登录页，
  // 兑换失败的提示由调用方（领证页）展示，便于重试。
  return request('/user/redemption/activate', { auth: true, suppressAuthRedirect: true, body: { code } })
}

async function requestV2(path, options = {}) {
  const {
    method = 'POST',
    body,
    params = {},
    auth = false,
    suppressAuthRedirect = false,
    cache,
    timeoutMs = 15000,
  } = options
  const baseUrl = getBaseUrlV2()
  if (!baseUrl) throw new Error('USER_API_BASE_URL 未配置')

  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let url = `${baseUrl}${path}`
  const qs = new URLSearchParams(params).toString()
  if (qs) url += '?' + qs

  const controller = timeoutMs ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const resp = await fetch(url, {
    method,
    headers,
    cache,
    signal: controller?.signal,
    body: body ? JSON.stringify(body) : undefined,
  }).finally(() => { if (timer) clearTimeout(timer) })

  let data
  try {
    data = await resp.json()
  } catch {
    data = {}
  }

  if (!resp.ok || data.success === false) {
    const msg = data.message || data.error || `HTTP ${resp.status}`
    if (isAuthInvalidError(resp.status, msg) && !suppressAuthRedirect) {
      clearAuth()
      navigateTo('login')
    }
    throw new Error(msg)
  }

  if (data.data !== undefined) return data.data
  const { success, message, error, ...rest } = data
  return rest
}

export async function registerV2(data) {
  return requestV2('/auth/register', { body: data })
}

export async function getTokenList(params = {}) {
  const data = await requestV2('/tokens', {
    auth: true,
    method: 'GET',
    params,
    suppressAuthRedirect: true,
  })
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.tokens)) return data.tokens
  return []
}

export async function createToken(data) {
  return requestV2('/tokens', { auth: true, body: data })
}

export async function getFullTokenKey(id) {
  return requestV2(`/tokens/${id}/key`, {
    auth: true,
    method: 'POST',
    suppressAuthRedirect: true,
  })
}

export async function getUserQuota(options = {}) {
  return requestV2('/user/quota', {
    auth: true,
    method: 'GET',
    timeoutMs: 2500,
    suppressAuthRedirect: !!options.suppressAuthRedirect,
  })
}

export async function getUserInfoV2() {
  return requestV2('/user/info', { auth: true, method: 'GET', timeoutMs: 3000 })
}

export async function syncUserToNewAPI(data) {
  return requestV2('/user/sync', { auth: true, body: data })
}

export async function topupUser(amount) {
  return requestV2('/user/topup', { auth: true, body: { amount } })
}

export async function getTopupInfo(options = {}) {
  return requestV2('/payment/topup-info', {
    auth: true,
    method: 'GET',
    timeoutMs: 5000,
    suppressAuthRedirect: !!options.suppressAuthRedirect,
  })
}

export async function createPaymentOrder(amount, type, options = {}) {
  return requestV2('/payment/create-order', {
    auth: true,
    body: { amount, type },
    suppressAuthRedirect: !!options.suppressAuthRedirect,
  })
}

export async function getPaymentOrderStatus(orderId) {
  return requestV2(`/payment/order/${encodeURIComponent(orderId)}`, {
    auth: true,
    method: 'GET',
    params: { _: Date.now() },
    cache: 'no-store',
    suppressAuthRedirect: true,
  })
}

export async function createYYApiSession(username, password) {
  const { invoke: tauriInvoke } = await import('./tauri-api.js')
  try {
    return await tauriInvoke('yyapi_create_session', { username, password })
  } catch (e) {
    console.warn('[user-api] createYYApiSession failed:', e)
    throw e
  }
}
