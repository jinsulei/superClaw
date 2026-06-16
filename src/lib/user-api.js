/**
 * SuperClaw 远程用户认证 API 服务层
 * 对接 http://124.222.21.44:3001/api
 * 处理 激活 → 注册（含登录）→ 领证 → 登录 流程
 */

const REMOTE_API_ORIGIN = 'http://124.222.21.44:3001'
const API_BASE_OVERRIDE_KEY = 'superclaw_api_base_url'

function getApiOrigin() {
  const override = localStorage.getItem(API_BASE_OVERRIDE_KEY)
  if (override) return override.replace(/\/+$/, '')

  return REMOTE_API_ORIGIN
}

function getBaseUrl() {
  return `${getApiOrigin()}/api`
}

function getBaseUrlV2() {
  return `${getApiOrigin()}/api/v2`
}

/**
 * 导航到指定页面（全量刷新，触发 boot 流程中的 JWT 检查）
 * 适用于从 auth 页面跳转到 app 内部页面（如 claim → dashboard）
 * @param {string} path - 如 '/dashboard', '/login'
 */
export function navigateTo(path) {
  // 必须先设置 hash，再 reload，确保页面重载后 hash 还在
  window.location.hash = '#/' + path.replace(/^\/+/, '')
  window.location.reload()
}

/**
 * auth 页面之间的导航（不触发全量刷新，仅改 hash）
 * 适用于 login / register / activate 之间的互相跳转
 * @param {string} path - 如 'login', 'register', 'activate'
 */
export function navigateToAuth(path) {
  window.location.hash = '#/' + path.replace(/^\/+/, '')
}

/**
 * 获取存储的 JWT token
 */
export function getToken() {
  return localStorage.getItem('superclaw_token')
}

/**
 * 存储 JWT token
 */
export function setToken(token) {
  if (token) {
    localStorage.setItem('superclaw_token', token)
  } else {
    localStorage.removeItem('superclaw_token')
  }
}

/**
 * 获取当前登录用户信息（从 localStorage）
 */
export function getStoredUser() {
  const raw = localStorage.getItem('superclaw_user')
  return raw ? JSON.parse(raw) : null
}

/**
 * 存储当前用户信息
 */
export function setStoredUser(user) {
  if (user) {
    localStorage.setItem('superclaw_user', JSON.stringify(user))
  } else {
    localStorage.removeItem('superclaw_user')
  }
}

/**
 * 判断用户是否已登录（有 token）
 */
export function isLoggedIn() {
  return !!getToken()
}

/**
 * 清除所有登录状态
 */
export function clearAuth() {
  localStorage.removeItem('superclaw_token')
  localStorage.removeItem('superclaw_user')
  clearConfiguredModelsForLogout().catch(err => {
    console.warn('[auth] clear configured models failed:', err?.message || err)
  })
}

const YYAPI_PROVIDER_KEY = 'yyapi'
const YYAPI_BASE_URL = 'http://124.222.21.44:3002/v1'
const LOGOUT_MODEL_PLACEHOLDER = 'superclaw-login-required'

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
  const config = await api.readOpenclawConfig()
  if (!config.models) config.models = {}
  if (!config.models.providers) config.models.providers = {}

  config.models.providers[YYAPI_PROVIDER_KEY] = {
    ...(config.models.providers[YYAPI_PROVIDER_KEY] || {}),
    baseUrl: YYAPI_BASE_URL,
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
  const current = await api.hermesReadConfig().catch(() => null)
  if (!isYyapiBaseUrl(current?.base_url || '')) return

  await api.configureHermes(
    'openai-api',
    '',
    LOGOUT_MODEL_PLACEHOLDER,
    YYAPI_BASE_URL,
  )
}

async function resetClaudeManagedModelConfig(api) {
  if (typeof api.configureClaudeCodeRelay !== 'function') return
  await api.configureClaudeCodeRelay({
    baseUrl: YYAPI_BASE_URL,
    apiKey: LOGOUT_MODEL_PLACEHOLDER,
    model: LOGOUT_MODEL_PLACEHOLDER,
    models: [],
    force: false,
  })
}

function isManagedYyapiModelRef(ref) {
  const value = String(ref || '').trim()
  return !value || value.startsWith(`${YYAPI_PROVIDER_KEY}/`)
}

function isYyapiBaseUrl(url) {
  return normalizeUrl(url) === normalizeUrl(YYAPI_BASE_URL)
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

function isAuthInvalidError(status, message = '') {
  return status === 401
    || /令牌|未登录|unauthorized|forbidden|invalid\s*token|用户不存在/i.test(message)
}

// ========== 认证请求 ==========

/**
 * 通用 fetch 封装，自动附加 JWT
 */
async function request(path, options = {}) {
  const { method = 'POST', body, auth = false, suppressAuthRedirect = false, timeoutMs = 15000 } = options
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  const controller = timeoutMs ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const resp = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    signal: controller?.signal,
    body: body ? JSON.stringify(body) : undefined,
  }).finally(() => { if (timer) clearTimeout(timer) })
  const data = await resp.json()
  if (!resp.ok) {
    const msg = data.error || data.message || `HTTP ${resp.status}`
    // 令牌失效 / 未登录 → 全局跳转登录页
    if (isAuthInvalidError(resp.status, msg)) {
      clearAuth()
      if (!suppressAuthRedirect) {
        navigateTo('login')
      }
    }
    throw new Error(msg)
  }
  // 后端统一返回 { success: true, data: { ... } }，展开 data 字段
  if (data && data.success !== undefined && data.data !== undefined) {
    return data.data
  }
  return data
}

/**
 * 激活码验证（无需登录）
 * POST /api/redemption/activate
 * @param {string} code - 32位激活码
 * @returns {{ amount: number }}
 */
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

/**
 * 用户注册（含激活码绑定）
 * POST /api/auth/register
 * @param {{ username: string, phone: string, password: string, confirmPassword: string, activationCode: string }}
 * @returns {{ token: string, user: object }}
 */
export async function register(data) {
  return request('/auth/register', { body: data })
}

/**
 * 用户登录
 * POST /api/auth/login
 * @param {{ username: string, password: string }}
 * @returns {{ token: string, user: object, tokenInfo?: { remaining_tokens: number } }}
 */
export async function login(data) {
  return request('/auth/login', { body: data, suppressAuthRedirect: true })
}

/**
 * 用户登出
 * POST /api/auth/logout
 */
export async function logout() {
  try {
    await request('/auth/logout', { auth: true, method: 'POST' })
  } catch {
    // 忽略登出时的网络错误
  }
  localStorage.removeItem('superclaw_token')
  localStorage.removeItem('superclaw_user')
  await clearConfiguredModelsForLogout()
}

/**
 * 获取用户信息（含额度）
 * GET /api/user/info
 * @returns {{ user: object, amount: number, tokenInfo?: { remaining_tokens: number } }}
 */
export async function getUserInfo() {
  return request('/user/info', { auth: true, method: 'GET', timeoutMs: 2500 })
}

/**
 * 绑定激活码到已登录账号
 * POST /api/auth/bind-activation
 * @param {string} code
 * @returns {{ amount: number, balance: number, tokenInfo: object }}
 */
export async function bindActivation(code) {
  return request('/auth/bind-activation', { auth: true, body: { code } })
}

/**
 * 用户主动兑换激活码（已登录）
 * POST /api/user/redemption/activate
 * @param {string} code
 * @returns {{ amount: number, balance: number }}
 */
export async function redeemCode(code) {
  return request('/user/redemption/activate', { auth: true, body: { code } })
}

// ========== v2 API（YYApi 中转站集成） ==========

async function requestV2(path, options = {}) {
  const { method = 'POST', body, params = {}, auth = false, suppressAuthRedirect = false, cache, timeoutMs = 15000 } = options
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  let url = `${getBaseUrlV2()}${path}`
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
    // 令牌失效 / 未登录 → 全局跳转登录页
    if (isAuthInvalidError(resp.status, msg)) {
      if (!suppressAuthRedirect) {
        clearAuth()
        navigateTo('login')
      }
    }
    throw new Error(msg)
  }
  // 兼容两种响应格式：
  // 1. { success: true, data: { ... } }  → 取出 data
  // 2. { success: true, orderId: '...', qrCode: '...', ... }  → 去除 success/message/error 后返回
  if (data.data !== undefined) return data.data
  const { success, message, error, ...rest } = data
  return rest
}

/** v2 注册（自动同步到 YYApi） POST /api/v2/auth/register */
export async function registerV2(data) {
  return requestV2('/auth/register', { body: data })
}

/** 获取 API Key 列表 GET /api/v2/tokens */
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

/** 创建 API Key POST /api/v2/tokens */
export async function createToken(data) {
  return requestV2('/tokens', { auth: true, body: data })
}

/** 获取完整 API Key（明文） POST /api/v2/tokens/:id/key */
export async function getFullTokenKey(id) {
  return requestV2(`/tokens/${id}/key`, {
    auth: true,
    method: 'POST',
    suppressAuthRedirect: true,
  })
}

/** 获取用户额度 GET /api/v2/user/quota */
export async function getUserQuota() {
  return requestV2('/user/quota', { auth: true, method: 'GET', timeoutMs: 2500 })
}

/** 获取用户信息（v2 格式，兼容 v1） GET /api/v2/user/info */
export async function getUserInfoV2() {
  return requestV2('/user/info', { auth: true, method: 'GET', timeoutMs: 3000 })
}

/** 同步用户到 YYApi POST /api/v2/user/sync */
export async function syncUserToNewAPI(data) {
  return requestV2('/user/sync', { auth: true, body: data })
}

/** 增加额度 POST /api/v2/user/topup */
export async function topupUser(amount) {
  return requestV2('/user/topup', { auth: true, body: { amount } })
}

// ========== 支付（V2 API） ==========

/**
 * 获取充值配置（折扣 + 支付方式）
 * GET /api/v2/payment/topup-info
 * @returns {{ discount: object, pay_methods: Array }}
 */
export async function getTopupInfo() {
  return requestV2('/payment/topup-info', { auth: true, method: 'GET', timeoutMs: 5000 })
}

/**
 * 创建支付订单（调好收米 API 生成二维码，用户扫码付款）
 * POST /api/v2/payment/create-order
 * @param {number} amount - 充值金额（元）
 * @returns {{ orderId: string, amount: number, quotaAmount: number, paymentType: string, qrCode: string, payUrl: string|null }}
 */
export async function createPaymentOrder(amount, type) {
  return requestV2('/payment/create-order', { auth: true, body: { amount, type } })
}

/** Query local payment order status. */
export async function getPaymentOrderStatus(orderId) {
  return requestV2(`/payment/order/${encodeURIComponent(orderId)}`, {
    auth: true,
    method: 'GET',
    params: { _: Date.now() },
    cache: 'no-store',
    suppressAuthRedirect: true,
  })
}

/** 获取 YYApi 控制台登录会话（通过本地代理或 Tauri 命令）
 *  返回 { success: true, sessionCookie: string, sessionValue?: string }
 */
export async function createYYApiSession(username, password) {
  const { invoke: tauriInvoke } = await import('./tauri-api.js')
  try {
    const result = await tauriInvoke('yyapi_create_session', { username, password })
    return result
  } catch (e) {
    console.warn('[user-api] createYYApiSession 失败:', e)
    throw e
  }
}
