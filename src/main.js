/**
 * SuperClaw 入口
 */
console.time('[boot] moduleLoad')
window._splashModuleStart = Date.now()

// 标记 JS 模块已加载（供 index.html 多阶段启动检测使用）
window._jsLoaded = true

import { registerRoute, initRouter, navigate, setDefaultRoute } from './router.js'
import { isLoggedIn, getToken, navigateTo } from './lib/user-api.js'
import { renderSidebar, openMobileSidebar } from './components/sidebar.js'
import { initTheme } from './lib/theme.js'
import { detectOpenclawStatus, isOpenclawReady, isUpgrading, isGatewayRunning, isGatewayForeign, onGatewayChange, startGatewayPoll, onGuardianGiveUp, resetAutoRestart, loadActiveInstance, getActiveInstance, onInstanceChange } from './lib/app-state.js'
import { wsClient } from './lib/ws-client.js'
import { api, checkBackendHealth, isBackendOnline, isTauriRuntime, onBackendStatusChange } from './lib/tauri-api.js'
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
import { statusIcon } from './lib/icons.js'
import { isForeignGatewayError, showGatewayConflictGuidance } from './lib/gateway-ownership.js'
import { toast } from './components/toast.js'
import { initI18n, t } from './lib/i18n.js'
import { initFeatureGates } from './lib/feature-gates.js'
import { onKernelChange } from './lib/kernel.js'
import { showFloorBlocker, hideFloorBlocker } from './components/floor-blocker.js'
import { registerEngine, initEngineManager, getActiveEngine, getActiveEngineId, onEngineChange } from './lib/engine-manager.js'
import openclawEngine from './engines/openclaw/index.js'
import hermesEngine from './engines/hermes/index.js'
// import xintianEngine from './engines/xintian/index.js'

// 样式
import './style/variables.css'
import './style/reset.css'
import './style/layout.css'
import './style/components.css'
import './style/pages.css'
import './style/chat.css'
import './style/agents.css'
import './style/debug.css'
import './style/assistant.css'
import './style/ai-drawer.css'
// 引擎专属样式（scope 到 [data-engine="<id>"] 子树，不影响其他引擎）
import './engines/hermes/style/hermes.css'
// import './engines/xintian/style/xintian.css'

console.timeEnd('[boot] moduleLoad')

// 初始化主题 + 国际化
initTheme()
initI18n()

/** HTML 转义，防止 XSS 注入 */
function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function openGatewayConflict(error = null) {
  const services = await api.getServicesStatus().catch(() => [])
  const gw = services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0] || null
  await showGatewayConflictGuidance({ error, service: gw })
}

// === 远程用户认证（JWT） ===
const isTauri = isTauriRuntime()

/**
 * 检查用户是否已通过远程 API 登录
 * 替代旧版本地密码保护
 */
async function checkRemoteAuth() {
  // Desktop portable mode must be locally usable even when the remote account
  // service or YYApi token sync is unavailable.
  if (isTauri) {
    sessionStorage.setItem('superclaw_authed', '1')
    return { ok: true }
  }

  // 已有 JWT token 则认为已登录
  if (isLoggedIn()) {
    // 建立本地 session，确保本地 OpenClaw API 调用不会触发 401
    sessionStorage.setItem('superclaw_authed', '1')
    try {
      if (isTauri) {
        // Tauri 模式：跳过 HTTP fetch /__api/auth_login（打包后无 HTTP 服务器），
        // 直接通过 IPC 读取 panel 配置以建立本地 session
        await (await import('./lib/tauri-api.js')).api.readPanelConfig()
      } else {
        // Web 模式：通过 dev-api 建立本地 session（dev-api.js 提供 /__api/auth_login 端点）
        await fetch('/__api/auth_login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: '123456' }),
        })
      }
    } catch {}
    return { ok: true }
  }
  // 没有 token，需要登录
  return { ok: false }
}

const _logoSvg = `<svg class="login-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
  <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
</svg>`
const _eyeSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`

function _hideSplash() {
  const splash = document.getElementById('splash')
  if (splash) { splash.classList.add('hide'); setTimeout(() => splash.remove(), 500) }
}

// === 后端离线检测（Web 模式） ===
let _backendRetryTimer = null

function showBackendDownOverlay() {
  if (document.getElementById('backend-down-overlay')) return
  _hideSplash()
  const overlay = document.createElement('div')
  overlay.id = 'backend-down-overlay'
  overlay.innerHTML = `
    <div class="login-card" style="text-align:center">
      ${_logoSvg}
      <div class="login-title" style="color:var(--error,#ef4444)">${t('common.backendDownTitle')}</div>
      <div class="login-desc" style="line-height:1.8">
        ${t('common.backendDownDesc')}<br>
        <span style="font-size:12px;color:var(--text-tertiary)">${t('common.backendDownHint')}</span>
      </div>
      <div style="background:var(--bg-tertiary);border-radius:var(--radius-md,8px);padding:14px 18px;margin:16px 0;text-align:left;font-family:var(--font-mono,monospace);font-size:12px;line-height:1.8;user-select:all;color:var(--text-secondary)">
        <div style="color:var(--text-tertiary);margin-bottom:4px"># ${t('common.devMode')}</div>
        npm run dev<br>
        <div style="color:var(--text-tertiary);margin-top:8px;margin-bottom:4px"># ${t('common.prodMode')}</div>
        npm run preview
      </div>
      <button class="login-btn" id="btn-backend-retry" style="margin-top:8px">
        <span id="backend-retry-text">${t('common.checkAgain')}</span>
      </button>
      <div id="backend-retry-status" style="font-size:12px;color:var(--text-tertiary);margin-top:12px"></div>
      <div style="margin-top:16px;font-size:11px;color:#aaa">
        <span>v${APP_VERSION}</span>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  let retrying = false
  const btn = overlay.querySelector('#btn-backend-retry')
  const statusEl = overlay.querySelector('#backend-retry-status')
  const textEl = overlay.querySelector('#backend-retry-text')

  btn.addEventListener('click', async () => {
    if (retrying) return
    retrying = true
    btn.disabled = true
    textEl.textContent = t('common.checking')
    statusEl.textContent = ''

    const ok = await checkBackendHealth()
    if (ok) {
      statusEl.textContent = t('common.backendConnectedLoading')
      statusEl.style.color = 'var(--success,#22c55e)'
      overlay.classList.add('hide')
      setTimeout(() => { overlay.remove(); location.reload() }, 600)
    } else {
      statusEl.textContent = t('common.backendStillDown')
      statusEl.style.color = 'var(--error,#ef4444)'
      textEl.textContent = t('common.checkAgain')
      btn.disabled = false
      retrying = false
    }
  })

  // 自动轮询：每 5 秒检测一次
  if (_backendRetryTimer) clearInterval(_backendRetryTimer)
  _backendRetryTimer = setInterval(async () => {
    const ok = await checkBackendHealth()
    if (ok) {
      clearInterval(_backendRetryTimer)
      _backendRetryTimer = null
      statusEl.textContent = t('common.backendConnectedLoading')
      statusEl.style.color = 'var(--success,#22c55e)'
      overlay.classList.add('hide')
      setTimeout(() => { overlay.remove(); location.reload() }, 600)
    }
  }, 5000)
}

// 全局 401 拦截：尝试重新建立本地 session，不清除远程 JWT
window.__superclaw_show_login = async function() {
  // 如果已经有远程 JWT，尝试重新建立本地 session 即可
  if (isLoggedIn()) {
    try {
      fetch('/__api/auth_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: '123456' }),
      }).catch(() => {})
    } catch {}
    return
  }
  // 没有远程 JWT，跳转到远程登录页
  navigateTo('login')
}

const sidebar = document.getElementById('sidebar')
const content = document.getElementById('content')

/**
 * 根据当前 hash 渲染对应的 auth 页面
 * 在未认证状态下被调用，支持 login/register/activate/claim 之间的 SPA 切换
 * @param {HTMLElement} app
 */
async function renderAuthPage(app) {
  const authRoute = (window.location.hash.slice(1) || '').split('?')[0]
  let pageMod
  try {
    if (authRoute === '/register') {
      pageMod = await import('./pages/register.js')
    } else if (authRoute === '/activate') {
      pageMod = await import('./pages/activate.js')
    } else if (authRoute === '/claim') {
      pageMod = await import('./pages/claim.js')
    } else if (authRoute === '/login') {
      pageMod = await import('./pages/login.js')
    } else {
      window.location.hash = '#/activate'
      pageMod = await import('./pages/activate.js')
    }
    const page = await pageMod.render()
    app.innerHTML = ''
    app.appendChild(page)
  } catch (e) {
    app.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:var(--text-secondary);font-size:14px">${t('common.loadFailed')}: ${e.message}</div>`
  }
}

async function renderLocalAccessPage(app) {
  const { api } = await import('./lib/tauri-api.js')
  const cfg = await api.readPanelConfig().catch(() => ({ accessPassword: '123456' }))
  const password = cfg?.accessPassword || ''

  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-logo">${_logoSvg}</div>
          <h1 class="auth-title">SuperClaw</h1>
          <p class="auth-desc">${t('security.loginPrompt')}</p>
          <form id="form-local-login">
            <div class="auth-field">
              <label class="auth-label" for="local-password">${t('security.accessPasswordPlaceholder')}</label>
              <div class="auth-input-wrap has-toggle">
                <input type="password" id="local-password" class="auth-input" placeholder="${t('security.accessPasswordPlaceholder')}" autocomplete="current-password" autofocus />
                <button type="button" class="auth-password-toggle" id="local-password-toggle" title="${t('gateway.show') || '显示'}">${_eyeSvg}</button>
              </div>
            </div>
            <div id="local-login-error" class="auth-error" style="display:none"></div>
            <button type="submit" class="auth-btn" id="btn-local-login">${t('security.loginAction')}</button>
          </form>
        </div>
      </div>
    </div>
  `

  const form = app.querySelector('#form-local-login')
  const input = app.querySelector('#local-password')
  const errorEl = app.querySelector('#local-login-error')
  app.querySelector('#local-password-toggle')?.addEventListener('click', () => {
    if (!input) return
    input.type = input.type === 'password' ? 'text' : 'password'
  })
  input?.focus()
  form?.addEventListener('submit', (event) => {
    event.preventDefault()
    const entered = input?.value || ''
    if (password && entered !== password) {
      errorEl.textContent = t('security.loginWrongPassword')
      errorEl.style.display = 'block'
      return
    }
    sessionStorage.setItem('superclaw_authed', '1')
    window.location.hash = window.location.hash && window.location.hash !== '#/login'
      ? window.location.hash
      : '#/h/dashboard'
    window.location.reload()
  })
}

// YYApi 常量
const YYAPI_BASE_URL = 'http://124.222.21.44:3002'
const YYAPI_API_BASE_URL = `${YYAPI_BASE_URL}/v1`
const YYAPI_PROVIDER_KEY = 'yyapi'

function normalizeYyapiModelRows(raw) {
  const rows = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : [])
  return rows
    .map(m => (typeof m === 'string' ? m : m?.id))
    .filter(Boolean)
    .map(id => ({ id, name: id, input: ['text', 'image'] }))
}

function pickYyapiDefaultModel(modelIds = []) {
  const ids = modelIds.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean)
  return ids.find(id => /(^|[-_/])gpt-?5\.?5($|[-_/])/i.test(id))
    || ids.find(id => /5\.?5/i.test(id))
    || ids[0]
    || ''
}

function modelIdFromRef(ref = '') {
  const value = String(ref || '').trim()
  if (!value) return ''
  const slash = value.indexOf('/')
  return slash >= 0 ? value.slice(slash + 1) : value
}

function yyapiModelRef(modelId = '') {
  const id = String(modelId || '').trim()
  return id ? `${YYAPI_PROVIDER_KEY}/${id}` : ''
}

function isYyapiPrimary(ref = '', yyapiModelIds = []) {
  const value = String(ref || '').trim()
  if (!value) return true
  if (value.startsWith(`${YYAPI_PROVIDER_KEY}/`)) return true
  return yyapiModelIds.includes(value)
}

async function getDefaultYyapiProfile() {
  if (!isLoggedIn()) return null

  let fullKey = ''

  try {
    const { getTokenList, getFullTokenKey } = await import('./lib/user-api.js')
    const tokenList = await getTokenList()
    const tokens = Array.isArray(tokenList)
      ? tokenList
      : (Array.isArray(tokenList?.items) ? tokenList.items : (Array.isArray(tokenList?.tokens) ? tokenList.tokens : []))
    const token = tokens.find(t => t?.is_default || t?.isDefault || t?.default)
      || tokens.find(t => t?.enabled !== false && t?.status !== 'disabled')
      || tokens[0]

    if (token?.id) {
      const keyData = await getFullTokenKey(token.id)
      fullKey = typeof keyData === 'string'
        ? keyData
        : (keyData?.key || keyData?.apiKey || keyData?.api_key || '')
    } else {
      fullKey = token?.key || token?.apiKey || token?.api_key || ''
    }

    if (fullKey && !fullKey.includes('*')) {
      try { localStorage.setItem('superclaw_yyapi_key', fullKey) } catch {}
    }
  } catch (err) {
    console.warn('[yyapi] default key fetch failed, falling back to local cache:', err.message)
  }

  if (!fullKey) fullKey = localStorage.getItem('superclaw_yyapi_key') || ''
  if (!fullKey || fullKey.includes('*')) return null

  const modelResp = await fetch(`${YYAPI_API_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${fullKey}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!modelResp.ok) throw new Error(`YYAPI models HTTP ${modelResp.status}`)

  const modelData = await modelResp.json()
  const modelIds = normalizeYyapiModelRows(modelData)
  if (!modelIds.length) return null

  return {
    apiKey: fullKey,
    baseUrl: YYAPI_API_BASE_URL,
    models: modelIds,
    defaultModel: pickYyapiDefaultModel(modelIds),
  }
}

/**
 * 从远程 v2 API 同步 YYApi 可用模型列表到本地配置
 * 自动创建/更新 yyapi provider，不覆盖用户主动删除的状态
 */
async function syncYYApiKeys() {
  return syncDefaultModelSettings()
  // 只有在已登录的情况下才同步
  if (!isLoggedIn()) return

  // 用户曾主动隐藏过 YYApi provider，跳过同步（sessionStorage 级，刷新后重新拉取）
  if (sessionStorage.getItem('superclaw_yyapi_dismissed')) return

  try {
    const { api } = await import('./lib/tauri-api.js')
    const config = await api.readOpenclawConfig()

    // 确保 models.providers 存在
    if (!config.models) config.models = {}
    if (!config.models.providers) config.models.providers = {}

    // 检查用户是否手动删除了 YYApi provider（本地标记）
    const yyapiDeleted = config.models.providers[YYAPI_PROVIDER_KEY] === undefined
      && localStorage.getItem('superclaw_yyapi_deleted') === '1'
    if (yyapiDeleted) return

    // 优先使用 localStorage 中保存的 key（v2 注册时自动写入）
    let fullKey = localStorage.getItem('superclaw_yyapi_key') || ''

    // 本地没有保存的 key 时，从远程获取 token 列表
    if (!fullKey) {
      const { getTokenList, getFullTokenKey } = await import('./lib/user-api.js')
      console.log('[yyapi] 正在获取 token 列表...')
      const tokens = await getTokenList()
      console.log('[yyapi] token 列表返回:', tokens)
      if (tokens && tokens.length) {
        const firstToken = tokens[0]
        console.log('[yyapi] 首个 token:', JSON.stringify(firstToken))
        // 只要有 token ID，就获取完整 key（list 接口返回的 key 可能是脱敏的）
        if (firstToken.id) {
          console.log('[yyapi] 准备调用 getFullTokenKey, id:', firstToken.id)
          try {
            const keyData = await getFullTokenKey(firstToken.id)
            console.log('[yyapi] getFullTokenKey 返回:', JSON.stringify(keyData))
            // 处理 keyData 可能是纯字符串的情况
            if (typeof keyData === 'string') {
              fullKey = keyData
            } else {
              fullKey = keyData.key || keyData.apiKey || ''
            }
          } catch (err) {
            console.warn('[yyapi] getFullTokenKey 失败:', err.message)
            // fallback: 使用 list 接口返回的 key（可能是脱敏的，聊胜于无）
            fullKey = firstToken.key || ''
          }
        } else {
          console.log('[yyapi] token 无 id 字段，使用 list 返回的 key')
          fullKey = firstToken.key || ''
        }
      }
    }
    if (!fullKey) return

    // 从 YYApi 获取模型列表
    const modelResp = await fetch(`${YYAPI_BASE_URL}/v1/models`, {
      headers: { 'Authorization': `Bearer ${fullKey}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!modelResp.ok) return
    const modelData = await modelResp.json()
    const modelIds = (modelData.data || modelData || [])
      .filter(m => m.id)
      .map(m => ({ id: m.id, name: m.id, input: ['text', 'image'] }))

    if (!modelIds.length) return

    // 创建/更新 YYApi provider
    const existing = config.models.providers[YYAPI_PROVIDER_KEY]
    if (!existing) {
      config.models.providers[YYAPI_PROVIDER_KEY] = {
        baseUrl: `${YYAPI_BASE_URL}/v1`,
        apiKey: fullKey,
        api: 'openai-completions',
        models: modelIds,
      }
    } else {
      // 只更新 baseUrl、apiKey，保留用户自定义的模型顺序
      existing.baseUrl = `${YYAPI_BASE_URL}/v1`
      existing.apiKey = fullKey
      existing.api = existing.api || 'openai-completions'

      // 合并模型：保留现有 + 新增不存在的
      if (existing.models) {
        const existingIds = new Set(existing.models.map(m => typeof m === 'string' ? m : m.id))
        for (const m of modelIds) {
          if (!existingIds.has(m.id)) {
            existing.models.push(m)
          }
        }
      } else {
        existing.models = modelIds
      }
    }

    // 同步完成后，验证主模型是否存在，不存在则自动设置第一个可用模型
    const allModelList = []
    for (const [pk, pv] of Object.entries(config.models.providers || {})) {
      for (const m of (pv.models || [])) {
        const id = typeof m === 'string' ? m : m.id
        if (id) allModelList.push(`${pk}/${id}`)
      }
    }
    const currentPrimary = getCurrentPrimary(config)
    if (allModelList.length > 0) {
      if (!currentPrimary || !allModelList.includes(currentPrimary)) {
        if (!config.agents) config.agents = {}
        if (!config.agents.defaults) config.agents.defaults = {}
        if (!config.agents.defaults.model) config.agents.defaults.model = {}
        const newPrimary = allModelList[0]
        config.agents.defaults.model.primary = newPrimary
        console.log(`[yyapi] 主模型已设为: ${newPrimary}`)
      }
      // 持久化到 localStorage，下次进入模型页面时恢复
      try { localStorage.setItem('superclaw-primary-model', config.agents.defaults.model.primary) } catch {}
    }

    await api.writeOpenclawConfig(config)
    console.log(`[yyapi] 已同步 ${modelIds.length} 个模型到 ${YYAPI_PROVIDER_KEY} provider`)
  } catch (err) {
    console.warn('[yyapi] 同步失败（非致命）:', err.message)
  }
}

// ── Hermes 模型同步：登录/启动时刷新模型列表 + 验证主模型 ──
async function syncHermesModel() {
  try {
    const config = await api.hermesReadConfig()
    if (!config?.config_exists) return
    const baseUrl = config.base_url || ''
    const apiKey = config.api_key || ''
    const currentModel = config.model || ''
    const providerId = config.provider || ''
    if (!baseUrl || !apiKey) return

    const models = await api.hermesFetchModels(baseUrl, apiKey, null, providerId || null)
    if (!models || !models.length) return

    const savedPrimary = loadHermesPrimary()
    let targetModel = ''

    const preferredYyapiModel = pickYyapiDefaultModel(models)

    if (preferredYyapiModel && models.includes(preferredYyapiModel)) {
      // Hermes 只保留 YYAPI 通道时，启动同步始终优先使用后台默认模型。
      targetModel = preferredYyapiModel
    } else if (savedPrimary && models.includes(savedPrimary)) {
      targetModel = savedPrimary
    } else if (models.includes(currentModel)) {
      // 当前 config 中的模型有效
      targetModel = currentModel
      saveHermesPrimary(targetModel)
    } else {
      // 都不存在，自动设为第一个
      targetModel = models[0]
      await api.hermesUpdateModel(targetModel, providerId || null)
      saveHermesPrimary(targetModel)
      console.log(`[hermes] 主模型已自动切换到: ${targetModel}`)
    }

    // 确保 localStorage 与 config 一致
    if (targetModel && targetModel === currentModel) {
      saveHermesPrimary(targetModel)
    }
  } catch (err) {
    console.warn('[hermes] 模型同步失败（非致命）:', err.message)
  }
}

async function syncDefaultModelSettings() {
  try {
    const profile = await getDefaultYyapiProfile()
    if (!profile) {
      await syncHermesModel()
      return
    }

    const { api } = await import('./lib/tauri-api.js')

    const config = await api.readOpenclawConfig()
    if (!config.models) config.models = {}
    if (!config.models.providers) config.models.providers = {}

    const yyapiModelIds = profile.models.map(m => m.id).filter(Boolean)
    if (!yyapiModelIds.length || !profile.defaultModel) {
      await syncHermesModel()
      return
    }

    const previous = config.models.providers[YYAPI_PROVIDER_KEY] || {}
    config.models.providers[YYAPI_PROVIDER_KEY] = {
      ...previous,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      api: previous.api || 'openai-completions',
      models: profile.models,
    }

    if (!config.agents) config.agents = {}
    if (!config.agents.defaults) config.agents.defaults = {}
    if (!config.agents.defaults.model) config.agents.defaults.model = {}
    const currentPrimary = String(config.agents.defaults.model.primary || '').trim()
    let openclawPrimary = currentPrimary
    const yyapiPrimaryManaged = isYyapiPrimary(currentPrimary, yyapiModelIds)
    if (yyapiPrimaryManaged) {
      const currentModelId = modelIdFromRef(currentPrimary)
      openclawPrimary = yyapiModelIds.includes(currentModelId)
        ? yyapiModelRef(currentModelId)
        : yyapiModelRef(profile.defaultModel)
      config.agents.defaults.model.primary = openclawPrimary
      try { localStorage.setItem('superclaw-primary-model', openclawPrimary) } catch {}
    }

    await api.writeOpenclawConfig(config)

    const hermesConfig = await api.hermesReadConfig().catch(() => null)
    const hermesSaved = loadHermesPrimary()
    const hermesCurrent = hermesConfig?.model || ''
    const hermesModel = yyapiModelIds.includes(profile.defaultModel)
      ? profile.defaultModel
      : (yyapiModelIds.includes(hermesCurrent) ? hermesCurrent : (yyapiModelIds.includes(hermesSaved) ? hermesSaved : profile.defaultModel))

    // Hermes 需要在启动/登录后自动获得后台默认 API Key；这里用 custom
    // OpenAI-compatible 配置写入 ~/.hermes/config.yaml 和 ~/.hermes/.env，
    // 同时补齐本地 Gateway 所需的 API_SERVER_KEY。
    await api.configureHermes('custom', profile.apiKey, hermesModel, profile.baseUrl)
    saveHermesPrimary(hermesModel)

    if (yyapiPrimaryManaged && typeof api.configureClaudeCodeRelay === 'function') {
      await api.configureClaudeCodeRelay({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: modelIdFromRef(openclawPrimary) || profile.defaultModel,
        models: yyapiModelIds,
        force: false,
      }).catch(err => console.warn('[model-sync] Claude Code relay sync failed:', err.message))
    }

    console.log(`[model-sync] yyapi synced: openclaw=${openclawPrimary || 'unchanged'}, hermes=${hermesModel || 'unchanged'}`)
  } catch (err) {
    console.warn('[model-sync] default model sync failed:', err.message)
    await syncHermesModel()
  }
}

window.__superclaw_sync_default_model_settings = syncDefaultModelSettings

// localStorage 读写 Hermes 主模型
function saveHermesPrimary(model) {
  if (!model) return
  try { localStorage.setItem('hermes-primary-model', model) } catch {}
}
function loadHermesPrimary() {
  try { return localStorage.getItem('hermes-primary-model') || '' } catch { return '' }
}

// 自动隔离系统 PATH 中非本项目的 OpenClaw 可执行文件
async function autoIsolateConflictingOpenclaw() {
  try {
    const conflicts = await api.scanOpenclawPathConflicts()
    if (!conflicts || !conflicts.length) return
    console.log(`[auto-isolate] 发现 ${conflicts.length} 处冲突 OpenClaw，正在自动隔离...`)
    const result = await api.quarantineOpenclawPathsBulk(conflicts.map(c => c.path))
    const ok = result?.records?.length || 0
    const fail = result?.failed?.length || 0
    if (ok > 0) {
      console.log(`[auto-isolate] 已隔离 ${ok} 处冲突 OpenClaw`)
    }
    if (fail > 0) {
      console.warn(`[auto-isolate] ${fail} 处隔离失败:`, result.failed.map(f => `${f.path}: ${f.error}`).join('; '))
    }
  } catch (err) {
    console.warn('[auto-isolate] 自动隔离失败（非致命）:', err.message)
  }
}

// 从 config 中获取当前主模型（复刻 models.js 中的逻辑）
function getCurrentPrimary(config) {
  return config?.agents?.defaults?.model?.primary || ''
}

async function boot() {
  // 注册引擎
  registerEngine(openclawEngine)
  registerEngine(hermesEngine)
  // registerEngine(xintianEngine)

  // 初始化引擎管理器：读取 clawpanel.json 的 engineMode，注册对应路由
  console.time('[boot] initEngineManager')
  await initEngineManager()
  console.timeEnd('[boot] initEngineManager')

  // 订阅内核版本变化：低于硬地板时弹出全屏拦截，恢复后自动隐藏；
  // 同时刷新 sidebar 以反映 "内核可升级" 提示卡片状态。
  // 触发时机：Gateway 握手成功 / 重连后版本变化 / 引擎切换
  let _readonlyModeActive = false
  onKernelChange((snap) => {
    if (!snap?.version) {
      // 还未拿到版本，保持当前状态不变
      return
    }
    if (!snap.aboveFloor && !_readonlyModeActive) {
      console.warn(`[kernel] 检测到内核版本 ${snap.version} 低于 ${snap.engine} 硬地板 ${snap.floor}`)
      showFloorBlocker({
        currentVersion: snap.version,
        floor: snap.floor,
        target: snap.target,
        onIgnore: () => { _readonlyModeActive = true },
      })
    } else if (snap.aboveFloor) {
      hideFloorBlocker()
      _readonlyModeActive = false
    }
    // sidebar 卡片显隐依赖 snapshot，状态变化时刷新一次
    if (sidebar) {
      try { renderSidebar(sidebar) } catch (e) { console.warn('[main] kernel-change renderSidebar 失败', e) }
    }
  })

  renderSidebar(sidebar)
  initRouter(content)

  // 移动端顶栏（汉堡菜单 + 标题）
  const mainCol = document.getElementById('main-col')
  const topbar = document.createElement('div')
  topbar.className = 'mobile-topbar'
  topbar.id = 'mobile-topbar'
  topbar.innerHTML = `
    <button class="mobile-hamburger" id="btn-mobile-menu">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <span class="mobile-topbar-title">SuperClaw</span>
  `
  topbar.querySelector('.mobile-hamburger').addEventListener('click', openMobileSidebar)
  mainCol.prepend(topbar)

  // 注意：启动加载屏（splash）的隐藏时机已推迟到骨架屏渲染后（见 ensureWebSession.then() 内部），
  // 避免 splash 隐藏后 content 空白导致白屏。

  // 启动 3 秒后提示 @homebridge/ciao cmd 弹窗问题（仅 Windows 受影响）
  // 只在桌面端跑——Web 模式下的 dev-api.js 桩会直接返回 affected:false
  setTimeout(async () => {
    try {
      const { checkAndWarnCiaoBug } = await import('./lib/ciao-bug-warning.js')
      checkAndWarnCiaoBug()
    } catch (err) {
      console.debug('[ciao-bug] module skipped:', err)
    }
  }, 3000)

  // Tauri 模式：确保 web session 存在（页面刷新后 cookie 可能丢失），然后加载实例和检测状态
  const ensureWebSession = Promise.resolve()

  // --- 引擎状态监听管理 ---
  let _engineStateUnsub = null
  let _engineReadyUnsub = null
  function bindEngineListeners(engine) {
    // 清理旧监听
    if (_engineStateUnsub) { _engineStateUnsub(); _engineStateUnsub = null }
    if (_engineReadyUnsub) { _engineReadyUnsub(); _engineReadyUnsub = null }
    // 注册新监听
    if (engine.onStateChange) {
      _engineStateUnsub = engine.onStateChange(() => renderSidebar(sidebar))
    }
    if (engine.onReadyChange) {
      _engineReadyUnsub = engine.onReadyChange(() => renderSidebar(sidebar))
    }
  }

  // 引擎切换时：重新绑定状态监听 + 刷新侧边栏
  onEngineChange((engine) => {
    bindEngineListeners(engine)
    renderSidebar(sidebar)
    if (engine?.id === 'openclaw') {
      bindOpenClawRuntimeHooks()
      setTimeout(async () => {
        await detectOpenclawStatus().catch(() => {})
        if (isGatewayRunning()) autoConnectWebSocket()
      }, 500)
    }
  })

  console.time('[boot] ensureWebSession+loadInstance')
  await ensureWebSession.then(() => getActiveEngineId() === 'openclaw' ? loadActiveInstance() : Promise.resolve()).then(async () => {
    console.timeEnd('[boot] ensureWebSession+loadInstance')
    const engine = getActiveEngine()
    if (!engine) return

    // 立即显示骨架屏，避免 boot() 期间内容区空白
    console.time('[boot] skeleton+splashHide')
    if (!content.querySelector('.page')) {
      content.innerHTML = `<div class="page" style="padding:32px;background:var(--bg-primary, #FAFAFA);min-height:400px">
        <div class="skeleton-line" style="width:200px;height:28px;margin-bottom:24px"></div>
        <div class="skeleton-subtitle" style="width:120px;height:14px;margin-bottom:20px;opacity:0.5"></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px">
          ${[1,2,3].map(() => '<div class="card"><div class="card-body" style="padding:16px"><div class="skeleton-line" style="width:60%;height:12px;margin-bottom:10px"></div><div class="skeleton-line" style="width:80%;height:20px"></div></div></div>').join('')}
        </div>
        <div class="card"><div class="card-body" style="padding:20px"><div class="skeleton-line" style="width:40%;height:16px;margin-bottom:16px"></div><div class="skeleton-line" style="height:36px"></div></div></div>
      </div>`
    }

    // 骨架屏已就绪，隐藏启动加载屏（避免 splash 隐藏后 content 空白导致白屏）
    const splash = document.getElementById('splash')
    if (splash) {
      splash.classList.add('hide')
      setTimeout(() => splash.remove(), 500)
    }
    console.timeEnd('[boot] skeleton+splashHide')

    // 引擎启动（检测安装状态 + 初始化轮询等），添加 8 秒超时避免阻塞渲染
    console.time('[boot] engine.boot()')
    const bootPromise = engine.boot()
    const bootTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('engine.boot() timeout')), 8000)
    )
    await Promise.race([bootPromise, bootTimeout]).catch(err => {
      console.warn('[main] engine.boot() 超时或失败:', err.message)
    })
    console.timeEnd('[boot] engine.boot()')

    // 重新渲染侧边栏（引擎检测完成后状态已更新）
    renderSidebar(sidebar)

    // 监听引擎状态变化（如 setup 完成后 ready 变为 true），自动刷新侧边栏
    bindEngineListeners(engine)

    // 引导时自动同步模型列表 + 验证主模型（非阻塞，不阻塞 engine boot）
    syncDefaultModelSettings()

    // 登录/重新登录后自动触发同步
    window.addEventListener('superclaw:login', () => {
      syncDefaultModelSettings()
    }, { once: true })

    // 自动隔离系统 PATH 中的外部 OpenClaw（非阻塞）
    autoIsolateConflictingOpenclaw()

    if (!engine.isReady()) {
      // 引擎未就绪时，直接跳转设置页（由设置页负责自动初始化）
      setDefaultRoute(engine.getSetupRoute())
      navigate(engine.getSetupRoute())
    } else {
      console.time('[boot] readyNavigation')
      const setupRoute = engine.getSetupRoute()
      const currentHash = window.location.hash.slice(1) || ''
      if (currentHash === setupRoute || !currentHash) {
        navigate(engine.getDefaultRoute())
      }
      console.timeEnd('[boot] readyNavigation')

      // Gateway 横幅（所有引擎均注册，update() 内部按引擎判断显隐）
      setupGatewayBanner()

      // === OpenClaw 专属逻辑（WebSocket、Guardian 守护等） ===
      if (getActiveEngineId() === 'openclaw') {
        // 自动连接 WebSocket（如果 Gateway 正在运行）
        if (isGatewayRunning()) {
          autoConnectWebSocket()
        }

        // 监听 Gateway 状态变化，自动连接/断开 WebSocket
        onGatewayChange((running) => {
          if (running) {
            autoConnectWebSocket()
            // 正向时机：Gateway 启动成功，延迟弹社区引导
          } else {
            wsClient.disconnect()
          }
        })

        // 守护放弃时，弹出恢复选项
        if (isTauriRuntime()) {
          import('@tauri-apps/api/event').then(async ({ listen }) => {
            await listen('guardian-event', (e) => {
              if (e.payload?.kind === 'give_up') showGuardianRecovery()
              else if (e.payload?.kind === 'auto_fix_start') toast(t('dashboard.fixing'), 'info')
              else if (e.payload?.kind === 'auto_fix_retry') toast(t('dashboard.fixDoneRestarting'), 'info')
              else if (e.payload?.kind === 'auto_fix_success') toast(t('dashboard.fixDoneRestarted'), 'success')
              else if (e.payload?.kind === 'auto_fix_failure') toast(String(e.payload?.message || t('dashboard.fixDoneRestartFail')).slice(0, 240), 'error')
            })
          }).catch(() => {})
          api.guardianStatus().then(status => {
            if (status?.giveUp) showGuardianRecovery()
          }).catch(() => {})
        } else {
          onGuardianGiveUp(() => {
            showGuardianRecovery()
          })
        }

        // 实例切换时，重连 WebSocket + 重新检测状态
        onInstanceChange(async () => {
          wsClient.disconnect()
          await detectOpenclawStatus()
          if (isGatewayRunning()) autoConnectWebSocket()
        })
      }
    }

    // 全局监听后台任务完成/失败事件，自动刷新安装状态和侧边栏（仅 OpenClaw）
    if (isTauriRuntime() && getActiveEngineId() === 'openclaw') {
      import('@tauri-apps/api/event').then(async ({ listen }) => {
        const refreshAfterTask = async () => {
          // 清除 API 缓存，确保拿到最新状态
          const { invalidate } = await import('./lib/tauri-api.js')
          invalidate('check_installation', 'get_services_status', 'get_version_info')
          await detectOpenclawStatus()
          renderSidebar(sidebar)
          // 如果安装完成后变为就绪，跳转到仪表盘
          if (isOpenclawReady() && window.location.hash === '#/setup') {
            navigate('/dashboard')
          }
          // 如果卸载后变为未就绪，跳转到 setup
          if (!isOpenclawReady() && !isUpgrading()) {
            setDefaultRoute('/setup')
            navigate('/setup')
          }
        }
        await listen('upgrade-done', refreshAfterTask)
        await listen('upgrade-error', refreshAfterTask)
      }).catch(() => {})
    }
  }).catch(err => {
    console.error('[main] boot chain 内部失败:', err)
    // 确保 splash 能隐藏，避免无限白屏
    const splash = document.getElementById('splash')
    if (splash) { splash.classList.add('hide'); setTimeout(() => splash.remove(), 500) }
  })
}

async function autoConnectWebSocket() {
  try {
    const inst = getActiveInstance()
    console.log(`[main] 自动连接 WebSocket (实例: ${inst.name})...`)
    const config = await api.readOpenclawConfig()
    const port = config?.gateway?.port || 18789
    const rawToken = config?.gateway?.auth?.token
    const token = (typeof rawToken === 'string') ? rawToken : ''
    const rawPassword = config?.gateway?.auth?.password
    const password = (typeof rawPassword === 'string') ? rawPassword : ''

    // 启动前先确保设备已配对 + allowedOrigins 已写入，无需用户手动操作
    let needReload = false
    try {
      const pairResult = await api.autoPairDevice()
      console.log('[main] 设备配对 + origins 已就绪:', pairResult)
      // 仅在配置实际变更时才需要 reload（dev-api 返回 {changed}，Tauri 返回字符串）
      if (typeof pairResult === 'object' && pairResult.changed) {
        needReload = true
      } else if (typeof pairResult === 'string' && pairResult !== '设备已配对') {
        needReload = true
      }
    } catch (pairErr) {
      console.warn('[main] autoPairDevice 失败（非致命）:', pairErr)
    }

    // 确保模型配置包含 vision 支持（input: ["text", "image"]）
    try {
      const patched = await api.patchModelVision()
      if (patched) {
        console.log('[main] 已为模型添加 vision 支持')
        needReload = true
      }
    } catch (visionErr) {
      console.warn('[main] patchModelVision 失败（非致命）:', visionErr)
    }

    // 统一 reload Gateway（配对 origins + vision patch 合并为一次 reload）
    if (needReload) {
      try {
        await api.reloadGateway()
        console.log('[main] Gateway 已重载')
      } catch (reloadErr) {
        console.warn('[main] reloadGateway 失败（非致命）:', reloadErr)
      }
    }

    // TCP 端口就绪探测：等待 Gateway 端口可达后再发起 WS 连接（仅 Tauri 桌面端）
    if (isTauriRuntime()) {
      const probeStart = Date.now()
      const probeTimeout = 20000
      let portReady = false
      while (Date.now() - probeStart < probeTimeout) {
        try {
          portReady = await api.probeGatewayPort()
          if (portReady) break
        } catch {}
        await new Promise(r => setTimeout(r, 2000))
      }
      if (!portReady) {
        console.warn(`[main] Gateway 端口 ${port} 在 ${probeTimeout / 1000}s 内未就绪，仍尝试连接`)
      }
    }

    let host
    const inst2 = getActiveInstance()
    if (inst2.type !== 'local' && inst2.endpoint) {
      try {
        const url = new URL(inst2.endpoint)
        host = `${url.hostname}:${inst2.gatewayPort || port}`
      } catch {
        host = isTauriRuntime() ? `127.0.0.1:${port}` : location.host
      }
    } else {
      host = isTauriRuntime() ? `127.0.0.1:${port}` : location.host
    }
    wsClient.connect(host, token, { password })
    console.log(`[main] WebSocket 连接已启动 -> ${host}${password ? ' (password mode)' : ''}`)
  } catch (e) {
    console.error('[main] 自动连接 WebSocket 失败:', e)
  }
}

let _openclawRuntimeHooksBound = false

function bindOpenClawRuntimeHooks() {
  if (getActiveEngineId() !== 'openclaw') return

  setupGatewayBanner()

  if (isGatewayRunning()) {
    autoConnectWebSocket()
  }

  if (_openclawRuntimeHooksBound) return
  _openclawRuntimeHooksBound = true

  onGatewayChange((running) => {
    if (getActiveEngineId() !== 'openclaw') return
    if (running) {
      autoConnectWebSocket()
    } else {
      wsClient.disconnect()
    }
  })

  if (isTauriRuntime()) {
    import('@tauri-apps/api/event').then(async ({ listen }) => {
      await listen('guardian-event', (e) => {
        if (e.payload?.kind === 'give_up') showGuardianRecovery()
        else if (e.payload?.kind === 'auto_fix_start') toast(t('dashboard.fixing'), 'info')
        else if (e.payload?.kind === 'auto_fix_retry') toast(t('dashboard.fixDoneRestarting'), 'info')
        else if (e.payload?.kind === 'auto_fix_success') toast(t('dashboard.fixDoneRestarted'), 'success')
        else if (e.payload?.kind === 'auto_fix_failure') toast(String(e.payload?.message || t('dashboard.fixDoneRestartFail')).slice(0, 240), 'error')
      })
    }).catch(() => {})
    api.guardianStatus().then(status => {
      if (status?.giveUp && getActiveEngineId() === 'openclaw') showGuardianRecovery()
    }).catch(() => {})
  } else {
    onGuardianGiveUp(() => {
      if (getActiveEngineId() === 'openclaw') showGuardianRecovery()
    })
  }

  onInstanceChange(async () => {
    if (getActiveEngineId() !== 'openclaw') return
    wsClient.disconnect()
    await detectOpenclawStatus()
    if (isGatewayRunning()) autoConnectWebSocket()
  })
}

function setupGatewayBanner() {
  const banner = document.getElementById('gw-banner')
  if (!banner) return

  function update(running, foreign) {
    // Hermes 模式不显示 OpenClaw Gateway 横幅
    if (getActiveEngineId() !== 'openclaw') {
      banner.classList.add('gw-banner-hidden')
      return
    }
    if (running || sessionStorage.getItem('gw-banner-dismissed')) {
      banner.classList.add('gw-banner-hidden')
      return
    }
    banner.classList.remove('gw-banner-hidden')

    if (foreign) {
      // Gateway 在运行但属于外部实例 —— 显示认领按钮
      banner.innerHTML = `
        <div class="gw-banner-content">
          <span class="gw-banner-icon">${statusIcon('warning', 16)}</span>
          <span>${t('dashboard.foreignGatewayBanner')}</span>
          <button class="btn btn-sm btn-secondary" id="btn-gw-claim" style="margin-left:auto">${t('dashboard.claimGateway')}</button>
          <a class="btn btn-sm btn-ghost" href="#/services" hidden>${t('sidebar.services')}</a>
          <button class="gw-banner-close" id="btn-gw-dismiss" title="${t('common.close')}">&times;</button>
        </div>
      `
      banner.querySelector('#btn-gw-dismiss')?.addEventListener('click', () => {
        banner.classList.add('gw-banner-hidden')
        sessionStorage.setItem('gw-banner-dismissed', '1')
      })
      banner.querySelector('#btn-gw-claim')?.addEventListener('click', async (e) => {
        const btn = e.target
        btn.disabled = true
        btn.textContent = t('common.processing')
        try {
          await api.claimGateway()
          // 认领后立刻刷新全局状态
          const { refreshGatewayStatus } = await import('./lib/app-state.js')
          await refreshGatewayStatus()
        } catch (err) {
          btn.disabled = false
          btn.textContent = t('dashboard.claimGateway')
          console.error('[banner] claim failed:', err)
        }
      })
      return
    }

    // Gateway 未运行 —— 醒目提示，强调需要启动
    banner.innerHTML = `
      <div class="gw-banner-content">
        <span class="gw-banner-icon">${statusIcon('warn', 18)}</span>
        <span><strong>${t('dashboard.controlUINotRunning')}</strong> — ${t('dashboard.controlUINotRunningDesc')}</span>
        <button class="btn btn-sm" id="btn-gw-start" style="margin-left:auto">${t('dashboard.startBtn')}</button>
        <a class="btn btn-sm btn-ghost" href="#/services" hidden>${t('sidebar.services')}</a>
        <button class="gw-banner-close" id="btn-gw-dismiss" title="${t('common.close')}">&times;</button>
      </div>
    `
    banner.querySelector('#btn-gw-dismiss')?.addEventListener('click', () => {
      banner.classList.add('gw-banner-hidden')
      sessionStorage.setItem('gw-banner-dismissed', '1')
    })
    banner.querySelector('#btn-gw-start')?.addEventListener('click', async (e) => {
        const btn = e.target
        btn.disabled = true
        btn.classList.add('btn-loading')
        btn.textContent = t('dashboard.starting')
        try {
          await api.startService('ai.openclaw.gateway')
        } catch (err) {
          if (isForeignGatewayError(err)) {
            await openGatewayConflict(err)
            update(false)
            return
          }
          const errMsg = (err.message || String(err)).slice(0, 120)
          banner.innerHTML = `
            <div class="gw-banner-content" style="flex-wrap:wrap">
              <span class="gw-banner-icon">${statusIcon('info', 16)}</span>
              <span>${t('dashboard.startFail')}</span>
              <button class="btn btn-sm btn-secondary" id="btn-gw-start" style="margin-left:auto">${t('dashboard.retry')}</button>
              <a class="btn btn-sm btn-ghost" href="#/services" hidden>${t('sidebar.services')}</a>
              <a class="btn btn-sm btn-ghost" href="#/logs">${t('sidebar.logs')}</a>
            </div>
            <div style="font-size:11px;opacity:0.7;margin-top:4px;font-family:monospace;word-break:break-all">${escapeHtml(errMsg)}</div>
          `
          update(false)
          return
        }
        // 轮询等待实际启动
        const t0 = Date.now()
        while (Date.now() - t0 < 30000) {
          try {
            const s = await api.getServicesStatus()
            const gw = s?.find?.(x => x.label === 'ai.openclaw.gateway') || s?.[0]
            if (gw?.running) { update(true); return }
          } catch {}
          const sec = Math.floor((Date.now() - t0) / 1000)
          btn.textContent = `${t('dashboard.starting')} ${sec}s`
          await new Promise(r => setTimeout(r, 1500))
        }
        // 超时后尝试获取日志帮助排查
        let logHint = ''
        try {
          const logs = await api.readLogTail('gateway', 5)
          if (logs?.trim()) logHint = `<div style="font-size:12px;margin-top:4px;opacity:0.8;font-family:monospace;white-space:pre-wrap">${logs.trim().split('\n').slice(-3).join('\n')}</div>`
        } catch {}
        banner.innerHTML = `
          <div class="gw-banner-content">
            <span class="gw-banner-icon">${statusIcon('info', 16)}</span>
            <span>${t('dashboard.startTimeout')}</span>
            <button class="btn btn-sm btn-secondary" id="btn-gw-start" style="margin-left:auto">${t('dashboard.retry')}</button>
            <a class="btn btn-sm btn-ghost" href="#/logs">${t('sidebar.logs')}</a>
          </div>
          ${logHint}
        `
        update(false)
      })
  }

  update(isGatewayRunning(), isGatewayForeign())
  onGatewayChange(update)
  // 引擎切换时刷新横幅（Hermes 模式隐藏，OpenClaw 模式按 Gateway 状态显示）
  onEngineChange(() => update(isGatewayRunning(), isGatewayForeign()))
}

function showGuardianRecovery() {
  const banner = document.getElementById('gw-banner')
  if (!banner) return
  banner.classList.remove('gw-banner-hidden')
  banner.innerHTML = `
    <div class="gw-banner-content" style="flex-wrap:wrap;gap:8px">
      <span class="gw-banner-icon">${statusIcon('warn', 16)}</span>
      <span>${t('dashboard.guardianFailed')}</span>
      <button class="btn btn-sm btn-primary" id="btn-gw-recover-fix" style="margin-left:auto">${t('dashboard.autoFix')}</button>
      <button class="btn btn-sm btn-secondary" id="btn-gw-recover-restart">${t('dashboard.retryStart')}</button>
      <a class="btn btn-sm btn-ghost" href="#/logs">${t('sidebar.logs')}</a>
    </div>
  `
  banner.querySelector('#btn-gw-recover-fix')?.addEventListener('click', async (e) => {
    const btn = e.target
    btn.disabled = true
    btn.textContent = t('dashboard.fixing')
    // 弹出修复弹窗
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-title">${t('dashboard.fixModalTitle')}</div>
        <div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:12px">
          ${t('dashboard.fixModalDesc')}
        </div>
        <div id="fix-log" style="font-family:var(--font-mono);font-size:11px;background:var(--bg-tertiary);padding:12px;border-radius:var(--radius-md);max-height:300px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;color:var(--text-secondary)">${t('dashboard.fixRunning')}\n</div>
        <div id="fix-status" style="margin-top:12px;font-size:var(--font-size-sm);font-weight:600"></div>
        <div class="modal-actions" style="margin-top:16px">
          <button class="btn btn-secondary btn-sm" id="fix-close" style="display:none">${t('common.close')}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const logEl = overlay.querySelector('#fix-log')
    const statusEl = overlay.querySelector('#fix-status')
    const closeBtn = overlay.querySelector('#fix-close')
    closeBtn.onclick = () => overlay.remove()

    try {
      const result = await api.doctorFix()
      const output = result?.stdout || result?.output || JSON.stringify(result, null, 2)
      logEl.textContent = output || t('dashboard.fixDoneNoOutput')
      logEl.scrollTop = logEl.scrollHeight
      if (result?.errors) {
        statusEl.innerHTML = `<span style="color:var(--warning)">${t('dashboard.fixDoneWarning')}${escapeHtml(String(result.errors).slice(0, 200))}</span>`
      } else {
        statusEl.innerHTML = `<span style="color:var(--success)">${t('dashboard.fixDoneRestarting')}</span>`
        resetAutoRestart()
        try {
          await api.startService('ai.openclaw.gateway')
          statusEl.innerHTML = `<span style="color:var(--success)">${t('dashboard.fixDoneRestarted')}</span>`
        } catch (err) {
          if (isForeignGatewayError(err)) await openGatewayConflict(err)
          statusEl.innerHTML = `<span style="color:var(--warning)">${t('dashboard.fixDoneRestartFail')}</span>`
        }
      }
    } catch (err) {
      logEl.textContent += '\n❌ ' + (err.message || String(err))
      statusEl.innerHTML = `<span style="color:var(--error)">${t('dashboard.fixFailed')}${escapeHtml(String(err.message || err).slice(0, 200))}</span>`
    }
    closeBtn.style.display = ''
    btn.textContent = t('dashboard.autoFix')
    btn.disabled = false
  })
  banner.querySelector('#btn-gw-recover-restart')?.addEventListener('click', async (e) => {
    const btn = e.target
    btn.disabled = true
    btn.textContent = t('dashboard.fixing')
    resetAutoRestart()
    try {
      await api.startService('ai.openclaw.gateway')
      btn.textContent = t('dashboard.startSent')
    } catch (err) {
      if (isForeignGatewayError(err)) await openGatewayConflict(err)
      btn.textContent = t('dashboard.retryStart')
      btn.disabled = false
    }
  })
}

// === 全局版本更新检测 ===
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000 // 30 分钟
let _updateCheckTimer = null

async function checkGlobalUpdate() {
  const banner = document.getElementById('update-banner')
  if (!banner) return

  try {
    const info = await api.checkFrontendUpdate()
    if (!info.hasUpdate) return

    const ver = info.latestVersion || info.manifest?.version || ''
    if (!ver) return

    // 用户已忽略过该版本，不再打扰
    const dismissed = localStorage.getItem('superclaw_update_dismissed')
    if (dismissed === ver) return

    const changelog = info.manifest?.changelog || ''
    const downloadUrl = info.manifest?.downloadUrl || info.manifest?.url || ''
    const canHotUpdate = isTauriRuntime()
      && downloadUrl
      && info.manifest?.hash

    banner.classList.remove('update-banner-hidden')
    banner.innerHTML = `
      <div class="update-banner-content">
        <div class="update-banner-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span class="update-banner-ver">${t('about.versionAvailable', { version: ver })}</span>
          ${changelog ? `<span class="update-banner-changelog">· ${changelog}</span>` : ''}
        </div>
        ${canHotUpdate ? `<button class="btn btn-sm btn-primary" id="btn-hot-update">${t('about.hotUpdateNow')}</button>` : ''}
        <button class="update-banner-close" id="btn-update-dismiss" title="${t('about.dismissVersion')}">✕</button>
      </div>
    `

    // 关闭按钮：记住忽略的版本
    banner.querySelector('#btn-update-dismiss')?.addEventListener('click', () => {
      localStorage.setItem('superclaw_update_dismissed', ver)
      banner.classList.add('update-banner-hidden')
    })

    // 热更新按钮
    const hotUpdateBtn = banner.querySelector('#btn-hot-update')
    if (hotUpdateBtn && canHotUpdate) {
      hotUpdateBtn.addEventListener('click', async () => {
        hotUpdateBtn.disabled = true
          hotUpdateBtn.textContent = t('about.hotUpdateDownloading')
        try {
          await api.downloadFrontendUpdate(
            downloadUrl,
            info.manifest.hash,
            ver
          )
          hotUpdateBtn.style.display = 'none'
          toast(t('about.hotUpdateDone'), 'success')
          // 在 banner 中插入重启按钮
          const rebootBtn = document.createElement('button')
          rebootBtn.className = 'btn btn-sm btn-primary'
          rebootBtn.textContent = t('about.restartApp')
          rebootBtn.onclick = () => api.relaunchApp().catch(() => {})
          banner.querySelector('.update-banner-text').after(rebootBtn)
        } catch (err) {
          hotUpdateBtn.disabled = false
          hotUpdateBtn.textContent = t('about.hotUpdateNow')
          toast(t('about.hotUpdateFailed') + ': ' + (err.message || err), 'error')
        }
      })
    }
  } catch {
    // 检查失败静默忽略
  }
}

function startUpdateChecker() {
  // Web 模式：浏览器每次刷新都拿最新前端，前端热更新无意义；跳过避免 404 噪音
  if (!isTauri) return
  // 启动后 5 秒检查一次
  setTimeout(checkGlobalUpdate, 5000)
  // 之后每 30 分钟检查一次
  _updateCheckTimer = setInterval(checkGlobalUpdate, UPDATE_CHECK_INTERVAL)
}

// 启动：先检查后端 → 认证 → 加载应用
;(async () => {
  console.time('[boot] total')
  console.log('[boot] preBootElapsed:', Date.now() - window._splashStart, 'ms — from index.html render to boot start')
  // Web 模式：先检测后端是否在线（不在线则显示提示，不加载应用）
  if (!isTauri) {
    const backendOk = await checkBackendHealth()
    if (!backendOk) {
      showBackendDownOverlay()
      return
    }
  }

  // 远程 JWT 认证检查：未登录时直接渲染对应的 auth 页面
  const auth = await checkRemoteAuth()
  if (!auth.ok) {
    _hideSplash()
    const app = document.getElementById('app')
    if (app) {
      if (auth.local) {
        renderLocalAccessPage(app)
        return
      }
      renderAuthPage(app)
      // 监听 hash 变化，支持 auth 页面间的 SPA 导航
      window._authHashHandler = () => {
        // 避免 hashchange 触发了已经 boot 完成的情况
        if (window._bootDone) {
          window.removeEventListener('hashchange', window._authHashHandler)
          return
        }
        renderAuthPage(app)
      }
      window.addEventListener('hashchange', window._authHashHandler)
    }
    return
  }
  // 进入 boot 后移除 auth hash 监听
  window.removeEventListener('hashchange', window._authHashHandler)
  try {
    await boot()
    console.timeEnd('[boot] total')
    window._bootDone = true
  } catch (bootErr) {
    window._bootDone = true
    console.error('[main] boot() 失败:', bootErr)
    console.timeEnd('[boot] total')
    _hideSplash()
    const app = document.getElementById('app')
    if (app) app.innerHTML = showBootError(String(bootErr?.message || bootErr))
  }
  startUpdateChecker()

  // 初始化全局 AI 助手浮动按钮（延迟加载，不阻塞启动）
  setTimeout(async () => {
    const { initAIFab, registerPageContext, openAIDrawerWithError } = await import('./components/ai-drawer.js')
    initAIFab()

    // 注册各页面上下文提供器
    registerPageContext('/chat-debug', async () => {
      const { isOpenclawReady, isGatewayRunning } = await import('./lib/app-state.js')
      const { wsClient } = await import('./lib/ws-client.js')
      const { api } = await import('./lib/tauri-api.js')
      const lines = ['## 系统诊断快照']
      lines.push(`- OpenClaw: ${isOpenclawReady() ? '就绪' : '未就绪'}`)
      lines.push(`- Gateway: ${isGatewayRunning() ? '运行中' : '未运行'}`)
      lines.push(`- WebSocket: ${wsClient.connected ? '已连接' : '未连接'}`)
      try {
        const node = await api.checkNode()
        lines.push(`- Node.js: ${node?.version || '未知'}`)
      } catch {}
      try {
        const ver = await api.getVersionInfo()
        lines.push(`- 版本: 当前 ${ver?.current || '?'} / 推荐 ${ver?.recommended || '?'} / 最新 ${ver?.latest || '?'}${ver?.ahead_of_recommended ? ' / 当前版本高于推荐版' : ''}`)
      } catch {}
      return { detail: lines.join('\n') }
    })

    registerPageContext('/services', async () => {
      const { isGatewayRunning } = await import('./lib/app-state.js')
      const { api } = await import('./lib/tauri-api.js')
      const lines = ['## 服务状态']
      lines.push(`- Gateway: ${isGatewayRunning() ? '运行中' : '未运行'}`)
      try {
        const svc = await api.getServicesStatus()
        if (svc?.[0]) {
          lines.push(`- CLI: ${svc[0].cli_installed ? '已安装' : '未安装'}`)
          lines.push(`- PID: ${svc[0].pid || '无'}`)
        }
      } catch {}
      return { detail: lines.join('\n') }
    })

    registerPageContext('/gateway', async () => {
      const { api } = await import('./lib/tauri-api.js')
      try {
        const config = await api.readOpenclawConfig()
        const gw = config?.gateway || {}
        const lines = ['## Gateway 配置']
        lines.push(`- 端口: ${gw.port || 18789}`)
        lines.push(`- 模式: ${gw.mode || 'local'}`)
        lines.push(`- Token: ${gw.auth?.token ? '已设置' : '未设置'}`)
        if (gw.controlUi?.allowedOrigins) lines.push(`- Origins: ${JSON.stringify(gw.controlUi.allowedOrigins)}`)
        return { detail: lines.join('\n') }
      } catch { return null }
    })

    registerPageContext('/setup', () => {
      return { detail: '用户正在进行 OpenClaw 初始安装，请帮助检查 Node.js 环境和网络状况' }
    })

    // 挂到全局，供安装/升级失败时调用
    window.__openAIDrawerWithError = openAIDrawerWithError
  }, 500)
})()
