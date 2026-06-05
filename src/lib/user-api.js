/**
 * SuperClaw 远程用户认证 API 服务层
 * 对接 http://124.222.21.44:3001/api
 * 处理 激活 → 注册（含登录）→ 领证 → 登录 流程
 */

const BASE_URL = 'http://124.222.21.44:3001/api'

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
}

// ========== 认证请求 ==========

/**
 * 通用 fetch 封装，自动附加 JWT
 */
async function request(path, options = {}) {
  const { method = 'POST', body, auth = false } = options
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json()
  if (!resp.ok) {
    const msg = data.error || data.message || `HTTP ${resp.status}`
    // 令牌失效 / 未登录 → 全局跳转登录页
    if (resp.status === 401 || /(令牌|未登录|unauthorized)/i.test(msg)) {
      clearAuth()
      navigateTo('login')
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
export async function activateCode(code) {
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
  return request('/auth/login', { body: data })
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
  clearAuth()
}

/**
 * 获取用户信息（含额度）
 * GET /api/user/info
 * @returns {{ user: object, amount: number, tokenInfo?: { remaining_tokens: number } }}
 */
export async function getUserInfo() {
  return request('/user/info', { auth: true, method: 'GET' })
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

const BASE_URL_V2 = 'http://124.222.21.44:3001/api/v2'

async function requestV2(path, options = {}) {
  const { method = 'POST', body, params = {}, auth = false, suppressAuthRedirect = false } = options
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  let url = `${BASE_URL_V2}${path}`
  const qs = new URLSearchParams(params).toString()
  if (qs) url += '?' + qs
  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data
  try {
    data = await resp.json()
  } catch {
    data = {}
  }
  if (!resp.ok || data.success === false) {
    const msg = data.message || data.error || `HTTP ${resp.status}`
    // 令牌失效 / 未登录 → 全局跳转登录页
    if (resp.status === 401 || /(令牌|未登录|unauthorized)/i.test(msg)) {
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
  return requestV2('/user/quota', { auth: true, method: 'GET' })
}

/** 获取用户信息（v2 格式，兼容 v1） GET /api/v2/user/info */
export async function getUserInfoV2() {
  return requestV2('/user/info', { auth: true, method: 'GET' })
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
  return requestV2('/payment/topup-info', { auth: true, method: 'GET' })
}

/**
 * 创建支付订单（调好收米 API 生成二维码，用户扫码付款）
 * POST /api/v2/payment/create-order
 * @param {number} amount - 充值金额（元）
 * @returns {{ orderId: string, amount: number, quotaAmount: number, paymentType: string, qrCode: string, payUrl: string|null }}
 */
export async function createPaymentOrder(amount) {
  return requestV2('/payment/create-order', { auth: true, body: { amount } })
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
