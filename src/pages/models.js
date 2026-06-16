/**
 * 模型配置页面
 * 服务商管理 + 模型增删改查 + 主模型选择
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showModal, showConfirm } from '../components/modal.js'
import { icon, statusIcon } from '../lib/icons.js'
import { API_TYPES, MODEL_PRESETS } from '../lib/model-presets.js'
import { t } from '../lib/i18n.js'
import { scheduleGatewayRestart, fireRestartNow, cancelPendingRestart, onRestartState } from '../lib/gateway-restart-queue.js'

// YYApi 中转站常量
const YYAPI_CONSOLE_URL = 'http://124.222.21.44:3002/console'
const YYAPI_PROVIDER_KEY = 'yyapi'
const OPENCLAW_SKILLS_PROMPT_BUDGET = 12000
const OPENCLAW_DIRECT_TOOL_ALLOWLIST = ['browser', 'desktop_control', 'skill_manager', 'exec']
const OPENCLAW_DIRECT_EXEC_CONFIG = { host: 'gateway', security: 'full', ask: 'off' }

function modelRefForProvider(providerKey, modelId) {
  return `${providerKey}/${modelId}`
}

function modelIdFromRef(ref = '') {
  const value = String(ref || '').trim()
  if (!value) return ''
  const slash = value.indexOf('/')
  return slash >= 0 ? value.slice(slash + 1) : value
}

function isYyapiPrimary(ref = '', yyapiModels = []) {
  const value = String(ref || '').trim()
  if (!value) return true
  if (value.startsWith(`${YYAPI_PROVIDER_KEY}/`)) return true
  return yyapiModels.includes(value)
}

function ensurePortableOpenClawSkills(config) {
  if (!config.agents) config.agents = {}
  if (!config.agents.defaults) config.agents.defaults = {}
  delete config.agents.defaults.skills

  if (Array.isArray(config.agents.list)) {
    for (const agent of config.agents.list) {
      if (!agent || typeof agent !== 'object') continue
      delete agent.skills
      if (!agent.skillsLimits || typeof agent.skillsLimits !== 'object' || Array.isArray(agent.skillsLimits)) {
        agent.skillsLimits = {}
      }
      if (!Number(agent.skillsLimits.maxSkillsPromptChars)) {
        agent.skillsLimits.maxSkillsPromptChars = OPENCLAW_SKILLS_PROMPT_BUDGET
      }
      if (!agent.tools || typeof agent.tools !== 'object' || Array.isArray(agent.tools)) agent.tools = {}
      agent.tools.profile = agent.tools.profile || 'minimal'
      const allow = Array.isArray(agent.tools.alsoAllow) ? agent.tools.alsoAllow.filter(Boolean).map(String) : []
      for (const tool of OPENCLAW_DIRECT_TOOL_ALLOWLIST) {
        if (!allow.includes(tool)) allow.push(tool)
      }
      agent.tools.alsoAllow = allow
      agent.tools.exec = { ...(agent.tools.exec || {}), ...OPENCLAW_DIRECT_EXEC_CONFIG }
    }
  }

  if (!config.plugins || typeof config.plugins !== 'object' || Array.isArray(config.plugins)) config.plugins = {}
  if (!config.plugins.entries || typeof config.plugins.entries !== 'object' || Array.isArray(config.plugins.entries)) {
    config.plugins.entries = {}
  }
  config.plugins.entries.browser = { ...(config.plugins.entries.browser || {}), enabled: true }
  config.plugins.entries['desktop-control'] = { ...(config.plugins.entries['desktop-control'] || {}), enabled: true }
  config.plugins.entries['skill-manager'] = { ...(config.plugins.entries['skill-manager'] || {}), enabled: true }

  if (!config.tools || typeof config.tools !== 'object' || Array.isArray(config.tools)) config.tools = {}
  config.tools.profile = config.tools.profile || 'minimal'
  const allow = Array.isArray(config.tools.alsoAllow) ? config.tools.alsoAllow.filter(Boolean).map(String) : []
  for (const tool of OPENCLAW_DIRECT_TOOL_ALLOWLIST) {
    if (!allow.includes(tool)) allow.push(tool)
  }
  config.tools.alsoAllow = allow
  config.tools.exec = { ...(config.tools.exec || {}), ...OPENCLAW_DIRECT_EXEC_CONFIG }

  if (!config.skills || typeof config.skills !== 'object' || Array.isArray(config.skills)) config.skills = {}
  if (!config.skills.entries || typeof config.skills.entries !== 'object' || Array.isArray(config.skills.entries)) config.skills.entries = {}
  if (!config.skills.limits || typeof config.skills.limits !== 'object' || Array.isArray(config.skills.limits)) {
    config.skills.limits = {}
  }
  if (!Number(config.skills.limits.maxSkillsPromptChars)) {
    config.skills.limits.maxSkillsPromptChars = OPENCLAW_SKILLS_PROMPT_BUDGET
  }
}

function ensureYyapiManagedModelSelection(config, yyapiModelIds = []) {
  if (!yyapiModelIds.length) return ''
  const fallbackRef = modelRefForProvider(YYAPI_PROVIDER_KEY, yyapiModelIds[0])

  if (!config.agents) config.agents = {}
  if (!config.agents.defaults) config.agents.defaults = {}
  if (!config.agents.defaults.model) config.agents.defaults.model = {}

  const defaults = config.agents.defaults
  const currentPrimary = getCurrentPrimary(config)
  let primary = currentPrimary
  if (isYyapiPrimary(currentPrimary, yyapiModelIds)) {
    const currentModelId = modelIdFromRef(currentPrimary)
    primary = yyapiModelIds.includes(currentModelId)
      ? modelRefForProvider(YYAPI_PROVIDER_KEY, currentModelId)
      : fallbackRef
    defaults.model.primary = primary

    if (!defaults.models || typeof defaults.models !== 'object' || Array.isArray(defaults.models)) {
      defaults.models = {}
    }
    for (const key of Object.keys(defaults.models)) {
      if (key.startsWith(`${YYAPI_PROVIDER_KEY}/`) && !yyapiModelIds.includes(modelIdFromRef(key))) {
        delete defaults.models[key]
      }
    }
    defaults.models[primary] = defaults.models[primary] || {}
  }

  if (Array.isArray(config.agents.list)) {
    for (const agent of config.agents.list) {
      if (!agent || typeof agent !== 'object') continue
      if (!agent.model) agent.model = {}
      const agentPrimary = String(agent.model.primary || '').trim()
      if (isYyapiPrimary(agentPrimary, yyapiModelIds)) {
        const agentModelId = modelIdFromRef(agentPrimary)
        agent.model.primary = yyapiModelIds.includes(agentModelId)
          ? modelRefForProvider(YYAPI_PROVIDER_KEY, agentModelId)
          : primary || fallbackRef
      }
      if (Array.isArray(agent.model.fallbacks)) {
        agent.model.fallbacks = agent.model.fallbacks.filter(ref => {
          const value = String(ref || '').trim()
          return !value.startsWith(`${YYAPI_PROVIDER_KEY}/`) || yyapiModelIds.includes(modelIdFromRef(value))
        })
      }
    }
  }

  return primary
}

// 主模型 localStorage 持久化键名
const STORAGE_PRIMARY_MODEL_KEY = 'superclaw-primary-model'

// HTML 转义，防止错误信息中的特殊字符破坏页面或被注入
function escapeHtml(str) {
  if (str == null) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('models.title')}</h1>
      <p class="page-desc">${t('models.desc')}</p>
    </div>
    <div class="config-actions">
      <button class="btn btn-primary btn-sm" id="btn-add-provider">${t('models.addProvider')}</button>
      <button class="btn btn-secondary btn-sm" id="btn-undo" disabled>${t('models.undo')}</button>
      <span style="flex:1"></span>
      <button class="btn btn-secondary btn-sm" id="btn-refresh-yyapi" title="${t('models.refreshYYApi')}">${icon('refresh-cw', 13)} ${t('models.refreshYYApi')}</button>
      <button class="btn btn-secondary btn-sm" id="btn-open-yyapi-console">${icon('external-link', 13)} ${t('models.openYYApiConsole')}</button>
    </div>
    <div class="form-hint" style="margin-bottom:var(--space-md)">
      ${t('models.providerHint')}
    </div>
    <div id="yyapi-token-panel" class="config-section" style="margin-bottom:var(--space-md);display:none"></div>
    <div id="default-model-bar"></div>
    <div style="margin-bottom:var(--space-md)">
      <input class="form-input" id="model-search" placeholder="${t('models.searchPlaceholder')}" style="max-width:360px">
    </div>
    <div id="providers-list">
      <div class="config-section"><div class="stat-card loading-placeholder" style="height:120px"></div></div>
      <div class="config-section"><div class="stat-card loading-placeholder" style="height:120px"></div></div>
    </div>
  `

  const state = { config: null, search: '', undoStack: [] }
  // 非阻塞:先返回 DOM,后台加载数据
  loadConfig(page, state)
  bindTopActions(page, state)

  // 搜索框实时过滤
  page.querySelector('#model-search').oninput = (e) => {
    state.search = e.target.value.trim().toLowerCase()
    renderProviders(page, state)
  }

  return page
}

async function loadConfig(page, state) {
  const listEl = page.querySelector('#providers-list')
  try {
    state.config = await api.readOpenclawConfig()
    // 自动修复现有配置中的 baseUrl(如 Ollama 缺少 /v1),一次性迁移
    const before = JSON.stringify(state.config?.models?.providers || {})
    normalizeProviderUrls(state.config)
    const after = JSON.stringify(state.config?.models?.providers || {})
    if (before !== after) {
      console.log('[models] 自动修复了服务商 baseUrl,正在保存...')
      await api.writeOpenclawConfig(state.config)
      toast(t('models.autoFixUrl'), 'info')
    }

    // 从 localStorage 恢复用户之前设置的主模型
    tryRestorePrimary(state)

    // 确保主模型在当前模型列表中有效，不存在则自动切到第一个
    ensureValidPrimary(state)

    renderDefaultBar(page, state)
    renderProviders(page, state)
    renderYyapiTokenPanel(page).catch(err => console.warn('[models] yyapi token panel failed:', err))

    // 自动初始化：如果 YYAPI 服务商不存在且有用户令牌，自动创建
    autoInitYYApi(page, state).catch(err => {
      console.error('[models] autoInitYYApi 失败:', err)
    })
  } catch (e) {
    console.error('[models] loadConfig failed:', e)
    const detail = escapeHtml(e?.stack || e?.message || String(e))
    const shortMsg = escapeHtml(e?.message || String(e))
    listEl.innerHTML = `
      <div class="models-load-error" style="padding:36px 20px;text-align:center;max-width:560px;margin:0 auto">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.10);color:var(--error);margin-bottom:14px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div style="color:var(--text-primary);font-weight:600;font-size:15px;margin-bottom:6px">${t('models.configLoadFailed')}</div>
        <div style="color:var(--text-secondary);font-size:13px;line-height:1.65;margin-bottom:18px">${t('models.configLoadFailedHint')}</div>
        <details style="text-align:left;margin-bottom:18px">
          <summary style="cursor:pointer;color:var(--text-tertiary);font-size:12px;padding:4px 0;user-select:none">${t('models.configLoadDetails')}</summary>
          <pre style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:6px;font-size:11px;color:var(--text-secondary);white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto;text-align:left">${detail}</pre>
        </details>
        <button class="btn btn-primary btn-sm" id="models-retry-load">${t('models.retryRestart')}</button>
      </div>
    `
    listEl.querySelector('#models-retry-load')?.addEventListener('click', () => loadConfig(page, state))
    toast(`${t('models.configLoadFailed')}: ${shortMsg}`, 'error')
  }
}

function getCurrentPrimary(config) {
  return config?.agents?.defaults?.model?.primary || ''
}

function ensureDefaultModelConfig(state) {
  if (!state.config.agents) state.config.agents = {}
  if (!state.config.agents.defaults) state.config.agents.defaults = {}
  if (!state.config.agents.defaults.model) state.config.agents.defaults.model = {}
  if (!Array.isArray(state.config.agents.defaults.model.fallbacks)) {
    state.config.agents.defaults.model.fallbacks = []
  }
  return state.config.agents.defaults.model
}

function collectAllModels(config) {
  const result = []
  const providers = config?.models?.providers || {}
  for (const [pk, pv] of Object.entries(providers)) {
    for (const m of (pv.models || [])) {
      const id = typeof m === 'string' ? m : m.id
      if (id) result.push({ provider: pk, modelId: id, full: modelRefForProvider(pk, id) })
    }
  }
  return result
}

function getApiTypeLabel(apiType) {
  return API_TYPES.find(at => at.value === apiType)?.label || apiType || t('common.unknown')
}

function maskApiKey(key = '') {
  const value = String(key || '').trim()
  if (!value) return ''
  if (value.length <= 10) return `${value.slice(0, 2)}****`
  return `${value.slice(0, 6)}****${value.slice(-4)}`
}

async function renderYyapiTokenPanel(page) {
  const panel = page.querySelector('#yyapi-token-panel')
  if (!panel) return
  try {
    const { getTokenList, getFullTokenKey } = await import('../lib/user-api.js')
    const tokens = await getTokenList()
    const token = (tokens || []).find(t => t?.is_default || t?.isDefault || t?.default)
      || (tokens || []).find(t => t?.enabled !== false && t?.status !== 'disabled')
      || (tokens || [])[0]
    if (!token) {
      panel.style.display = ''
      panel.innerHTML = `
        <div class="config-section-title">YYApi API Key</div>
        <div style="color:var(--text-tertiary);font-size:13px">当前账号暂无可用令牌</div>
      `
      return
    }

    let fullKey = token.key || token.apiKey || token.api_key || ''
    if (token.id && (!fullKey || fullKey.includes('*'))) {
      const keyData = await getFullTokenKey(token.id)
      fullKey = typeof keyData === 'string' ? keyData : (keyData?.key || keyData?.apiKey || keyData?.api_key || fullKey)
    }
    if (fullKey && !fullKey.includes('*')) {
      try { localStorage.setItem('superclaw_yyapi_key', fullKey) } catch {}
    }
    const noKeyText = '未获取到明文 Key'
    const safeKey = escapeHtml(fullKey || noKeyText)
    const masked = escapeHtml(maskApiKey(fullKey) || noKeyText)
    panel.style.display = ''
    panel.innerHTML = `
      <div class="config-section-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>YYApi API Key</span>
        <span style="font-size:12px;color:var(--text-tertiary);font-weight:400">${escapeHtml(String(token.name || token.id || '默认令牌'))}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;min-width:0">
        <code id="yyapi-token-value" data-full="${safeKey}" data-masked="${masked}" data-visible="0" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:6px;padding:8px 10px;font-size:12px">${masked}</code>
        <button class="btn btn-sm btn-secondary" id="btn-toggle-yyapi-token">显示</button>
        <button class="btn btn-sm btn-secondary" id="btn-copy-yyapi-token">复制</button>
      </div>
    `
    panel.querySelector('#btn-toggle-yyapi-token')?.addEventListener('click', () => {
      const valueEl = panel.querySelector('#yyapi-token-value')
      const visible = valueEl.dataset.visible === '1'
      valueEl.dataset.visible = visible ? '0' : '1'
      valueEl.textContent = visible ? valueEl.dataset.masked : valueEl.dataset.full
      panel.querySelector('#btn-toggle-yyapi-token').textContent = visible ? '显示' : '隐藏'
    })
    panel.querySelector('#btn-copy-yyapi-token')?.addEventListener('click', async () => {
      const value = panel.querySelector('#yyapi-token-value')?.dataset.full || ''
      if (!value || value === noKeyText) return toast('没有可复制的 API Key', 'warning')
      await navigator.clipboard?.writeText(value)
      toast('API Key 已复制', 'success')
    })
  } catch (err) {
    panel.style.display = ''
    panel.innerHTML = `
      <div class="config-section-title">YYApi API Key</div>
      <div style="color:var(--text-tertiary);font-size:13px">令牌读取失败：${escapeHtml(err.message || err)}</div>
    `
  }
}

// 渲染当前主模型状态栏
function renderDefaultBar(page, state) {
  const bar = page.querySelector('#default-model-bar')
  const primary = getCurrentPrimary(state.config)
  const fallbacks = state.config?.agents?.defaults?.model?.fallbacks || []
  const collapsed = !state.showFallbackEditor
  const chevron = collapsed ? '▸' : '▾'

  bar.innerHTML = `
    <div class="config-section" style="margin-bottom:var(--space-lg); transition: all 0.3s ease;">
      <div class="config-section-title" id="system-model-title" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;">
        <div style="display:flex; align-items:center; gap:8px">
          <span style="display:inline-block;width:16px;font-size:12px;color:var(--text-tertiary)">${chevron}</span>
          <span>${t('models.systemModelTitle')}</span>
          <div style="display:flex; gap:8px; margin-left: 12px; align-items: baseline; flex: 1; min-width: 0; overflow: hidden;">
            <span style="color:var(--success); font-family:var(--font-mono); font-size: 0.9em; font-weight: 500; white-space: nowrap;">${primary || t('models.notConfigured')}</span>
            <span style="font-size: 11px; color: var(--text-tertiary); font-weight: normal; white-space: nowrap;">${t('models.nFallbacks', { count: fallbacks.length })}</span>
          </div>
        </div>
      </div>

      ${collapsed && fallbacks.length > 0 ? `
      <div style="margin-top: 12px; display: flex; flex-wrap: nowrap; overflow: hidden; gap: 6px; align-items: center; padding-left: 24px;">
        ${fallbacks.map(f => `<span style="background: var(--bg-tertiary); border: 1px solid var(--border-color); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;" title="${f}">${f}</span>`).join('<span style="color: var(--text-tertiary); font-size: 10px; flex-shrink: 0;">→</span>')}
      </div>
      ` : ''}

      <div id="fallback-waterfall-container" style="display:${state.showFallbackEditor ? 'block' : 'none'}; margin-top: 8px;">
        ${renderFallbackWaterfall(state)}
      </div>

      ${collapsed ? '' : `<div class="form-hint" style="margin-top:8px">${t('models.fallbackHint')}</div>`}
    </div>
  `

  // 绑定标题点击折叠/展开
  bar.querySelector('#system-model-title').onclick = () => {
    state.showFallbackEditor = !state.showFallbackEditor
    renderDefaultBar(page, state)
  }

  if (state.showFallbackEditor) {
    bindWaterfallActions(page, state)
  }
}

function renderFallbackWaterfall(state) {
  const primary = getCurrentPrimary(state.config)
  const allModels = collectAllModels(state.config)
  const currentFallbacks = state.config?.agents?.defaults?.model?.fallbacks || []

  // 分组候选模型
  const providers = state.config?.models?.providers || {}
  const candidatesByProvider = {}
  Object.keys(providers).forEach(pKey => {
    const pModels = providers[pKey].models || []
    const filtered = pModels.map(m => typeof m === 'string' ? m : m.id)
      .filter(mId => {
        const full = modelRefForProvider(pKey, mId)
        return full !== primary && !currentFallbacks.includes(full)
      })
    if (filtered.length > 0) {
      candidatesByProvider[pKey] = filtered
    }
  })

  if (!state._fallback_candidates_collapsed) state._fallback_candidates_collapsed = {}

  return `
    <div class="fallback-editor-panel" style="background: var(--bg-secondary); padding: 12px; border-radius: var(--radius-md);">
      <div style="margin-bottom: 12px; font-size: 11px; color: var(--text-secondary); background: var(--bg-info-subtle); padding: 6px 10px; border-radius: 4px; border-left: 3px solid var(--primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${t('models.bestPracticeHint')}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px;">
        <div style="background: var(--bg-tertiary); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: var(--font-size-xs); font-weight: bold; margin-bottom: 8px; color: var(--text-tertiary);">${t('models.activeChainTitle')}</div>
          <div id="active-fallback-list" style="display: flex; flex-direction: column; gap: 4px; min-height: 50px;">
            ${currentFallbacks.map((f, i) => `
              <div class="fallback-chain-item" data-id="${f}" style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-primary); padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                  <span class="fallback-drag-handle" style="color:var(--text-tertiary);cursor:grab;user-select:none;font-size:14px;padding:2px; flex-shrink: 0;">⋮⋮</span>
                  <span style="font-family: var(--font-mono); font-size: var(--font-size-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${i + 1}. ${f}</span>
                </div>
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                  <button class="btn btn-xs btn-secondary btn-set-primary-from-fb" data-id="${f}" style="padding: 1px 4px; font-size: 10px;">${t('models.setAsPrimary')}</button>
                  <button class="btn-icon btn-remove-fb" data-id="${f}" title="${t('models.remove')}">${icon('x', 12)}</button>
                </div>
              </div>
            `).join('')}
            ${currentFallbacks.length === 0 ? `<div style="font-size: 12px; color: var(--text-tertiary); text-align: center; padding: 20px; border: 1px dashed var(--border-color); border-radius: 4px;">${t('models.noFallbackSelected')}</div>` : ''}
          </div>
        </div>

        <div style="background: var(--bg-tertiary); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: var(--font-size-xs); font-weight: bold; margin-bottom: 8px; color: var(--text-tertiary);">${t('models.candidatePoolTitle')}</div>
          <div id="candidate-model-pool" style="display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; padding-right: 4px;">
            ${Object.keys(candidatesByProvider).length === 0 ? `<div style="font-size: 12px; color: var(--text-tertiary); text-align: center; padding: 20px;">${t('models.noCandidateModel')}</div>` :
              Object.keys(candidatesByProvider).map(pKey => {
                const collapsed = !!state._fallback_candidates_collapsed[pKey]
                const mIds = candidatesByProvider[pKey]
                return `
                  <div class="candidate-provider-group" data-provider="${pKey}">
                    <div class="candidate-provider-header" style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: var(--bg-tertiary); border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; color: var(--text-secondary);">
                      <span class="chevron">${collapsed ? '▸' : '▾'}</span>
                      <span>${pKey}</span>
                      <span style="margin-left: auto; color: var(--text-tertiary); font-weight: normal;">${mIds.length}</span>
                    </div>
                    <div class="candidate-provider-list" style="display: ${collapsed ? 'none' : 'flex'}; flex-direction: column; gap: 4px; padding: 4px 0 4px 12px;">
                      ${mIds.map(mId => `
                        <div class="candidate-item" style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-primary); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); opacity: 0.9;">
                          <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${mId}</span>
                          <button class="btn btn-xs btn-primary btn-add-fb" data-full="${modelRefForProvider(pKey, mId)}" style="padding: 1px 6px; font-size: 10px;">${t('models.add')}</button>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                `
              }).join('')
            }
          </div>
        </div>
      </div>


    </div>
  `
}

function bindWaterfallActions(page, state) {
  const container = page.querySelector('#fallback-waterfall-container')

  // 移除
  container.querySelectorAll('.btn-remove-fb').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id
      const modelConfig = ensureDefaultModelConfig(state)
      pushUndo(state)
      modelConfig.fallbacks = modelConfig.fallbacks.filter(f => f !== id)
      renderDefaultBar(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
    }
  })

  // 设为主用 (从备选链中提升)
  container.querySelectorAll('.btn-set-primary-from-fb').forEach(btn => {
    btn.onclick = () => {
      const full = btn.dataset.id
      pushUndo(state)
      setPrimary(state, full)
      renderDefaultBar(page, state)
      renderProviders(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
      toast(t('models.setAsPrimarySuccess', { model: full }), 'success')
    }
  })

  // 加入
  container.querySelectorAll('.btn-add-fb').forEach(btn => {
    btn.onclick = () => {
      const full = btn.dataset.full
      const modelConfig = ensureDefaultModelConfig(state)
      if (modelConfig.fallbacks.includes(full)) return
      pushUndo(state)
      modelConfig.fallbacks.push(full)
      renderDefaultBar(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
    }
  })

  // 折叠候选服务商
  container.querySelectorAll('.candidate-provider-header').forEach(header => {
    header.onclick = () => {
      const group = header.closest('.candidate-provider-group')
      const pKey = group.dataset.provider
      state._fallback_candidates_collapsed[pKey] = !state._fallback_candidates_collapsed[pKey]
      renderDefaultBar(page, state)
    }
  })

  // 拖拽排序逻辑 (适配当前列表)
  const chainContainer = container.querySelector('#active-fallback-list')
  if (chainContainer && state.config.agents.defaults.model.fallbacks?.length > 1) {
    let dragged = null
    let placeholder = null
    let startY = 0

    chainContainer.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.fallback-drag-handle')
      if (!handle) return
      const item = handle.closest('.fallback-chain-item')
      if (!item) return

      e.preventDefault()
      dragged = item
      startY = e.clientY

      placeholder = document.createElement('div')
      placeholder.style.cssText = `height:${item.offsetHeight}px;border:1px dashed var(--primary);border-radius:4px;margin-bottom:4px;background:var(--bg-tertiary)`
      item.after(placeholder)

      const rect = item.getBoundingClientRect()
      item.style.position = 'fixed'
      item.style.left = rect.left + 'px'
      item.style.top = rect.top + 'px'
      item.style.width = rect.width + 'px'
      item.style.zIndex = '10000'
      item.style.opacity = '0.9'
      item.style.pointerEvents = 'none'
      item.setPointerCapture(e.pointerId)
    })

    chainContainer.addEventListener('pointermove', e => {
      if (!dragged || !placeholder) return
      e.preventDefault()

      const dy = e.clientY - startY
      itemMove(dragged, dy)
      startY = e.clientY

      const siblings = [...chainContainer.querySelectorAll('.fallback-chain-item:not([style*="position: fixed"])')]
      for (const sibling of siblings) {
        const rect = sibling.getBoundingClientRect()
        if (e.clientY < rect.top + rect.height / 2) {
          sibling.before(placeholder)
          return
        }
      }
      if (siblings.length) siblings[siblings.length - 1].after(placeholder)
    })

    function itemMove(el, dy) {
      const top = parseFloat(el.style.top)
      el.style.top = (top + dy) + 'px'
    }

    chainContainer.addEventListener('pointerup', e => {
      if (!dragged || !placeholder) return

      dragged.style.position = ''
      dragged.style.left = ''
      dragged.style.top = ''
      dragged.style.width = ''
      dragged.style.zIndex = ''
      dragged.style.opacity = ''
      dragged.style.pointerEvents = ''

      placeholder.before(dragged)
      placeholder.remove()

      // 更新顺序
      const newOrderIds = [...chainContainer.querySelectorAll('.fallback-chain-item')].map(el => el.dataset.id)
      const modelConfig = ensureDefaultModelConfig(state)
      if (newOrderIds.join('\n') !== modelConfig.fallbacks.join('\n')) {
        pushUndo(state)
        modelConfig.fallbacks = newOrderIds
        updateUndoBtn(page, state)
        autoSave(state)
      }

      dragged = null
      placeholder = null
      renderDefaultBar(page, state) // 刷新索引数字
    })
  }
}

// 排序模型列表
function sortModels(models, sortBy) {
  if (!sortBy || sortBy === 'default') return models

  const sorted = [...models]
  switch (sortBy) {
    case 'name-asc':
      sorted.sort((a, b) => {
        const nameA = (a.name || a.id || '').toLowerCase()
        const nameB = (b.name || b.id || '').toLowerCase()
        return nameA.localeCompare(nameB)
      })
      break
    case 'name-desc':
      sorted.sort((a, b) => {
        const nameA = (a.name || a.id || '').toLowerCase()
        const nameB = (b.name || b.id || '').toLowerCase()
        return nameB.localeCompare(nameA)
      })
      break
    case 'latency-asc':
      sorted.sort((a, b) => {
        const latA = a.latency ?? Infinity
        const latB = b.latency ?? Infinity
        return latA - latB
      })
      break
    case 'latency-desc':
      sorted.sort((a, b) => {
        const latA = a.latency ?? -1
        const latB = b.latency ?? -1
        return latB - latA
      })
      break
    case 'context-asc':
      sorted.sort((a, b) => {
        const ctxA = a.contextWindow ?? 0
        const ctxB = b.contextWindow ?? 0
        return ctxA - ctxB
      })
      break
    case 'context-desc':
      sorted.sort((a, b) => {
        const ctxA = a.contextWindow ?? 0
        const ctxB = b.contextWindow ?? 0
        return ctxB - ctxA
      })
      break
  }
  return sorted
}

// 渲染服务商列表(渲染完后直接绑定事件)
function renderProviders(page, state) {
  const listEl = page.querySelector('#providers-list')
  const providers = state.config?.models?.providers || {}
  const keys = Object.keys(providers)
  const primary = getCurrentPrimary(state.config)
  const search = state.search || ''
  const sortBy = state.sortBy || 'default'

  if (!keys.length) {
    listEl.innerHTML = `
      <div style="color:var(--text-tertiary);padding:20px;text-align:center">
        ${t('models.noProvider')}
      </div>`
    return
  }

  if (!state._collapsed) state._collapsed = {}

  listEl.innerHTML = keys.map(key => {
    const p = providers[key]
    const isManaged = p.managed === true
    const models = p.models || []
    const filtered = search
      ? models.filter((m) => {
          const id = (typeof m === 'string' ? m : m.id).toLowerCase()
          const name = (m.name || '').toLowerCase()
          return id.includes(search) || name.includes(search)
        })
      : models
    const sorted = sortModels(filtered, sortBy)
    const hiddenCount = models.length - sorted.length
    const collapsed = !!state._collapsed[key]
    const chevron = collapsed ? '▸' : '▾'

    // managed provider 的按钮组：只有测试和删除（隐藏编辑/添加）
    const actionButtons = isManaged ? `
      <span class="badge badge-primary" style="font-size:10px;background:var(--accent-muted);color:var(--accent);padding:1px 7px;border-radius:8px">${t('models.managedProvider')}</span>
      <button class="btn btn-sm btn-secondary" data-action="test-all-models">${t('models.testBtn')}</button>
      <button class="btn btn-sm btn-danger" data-action="delete-provider">${t('models.deleteProvider')}</button>
    ` : `
      <button class="btn btn-sm btn-secondary" data-action="edit-provider" style="display:none">${t('models.editProvider')}</button>
      <button class="btn btn-sm btn-secondary" data-action="add-model" style="display:none">${t('models.addModel')}</button>
      <button class="btn btn-sm btn-secondary" data-action="fetch-models">${t('models.fetchList')}</button>
      <button class="btn btn-sm btn-danger" data-action="delete-provider">${t('models.deleteProvider')}</button>
    `

    return `
      <div class="config-section" data-provider="${key}">
        <div class="config-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span style="cursor:pointer;user-select:none" data-action="toggle-provider"><span style="display:inline-block;width:16px;font-size:12px;color:var(--text-tertiary)">${chevron}</span>${key} <span style="font-size:var(--font-size-xs);color:var(--text-tertiary);font-weight:400">${getApiTypeLabel(p.api)} · ${t('models.nModels', { count: models.length })}</span></span>
          <div style="display:flex;gap:8px">
            ${actionButtons}
          </div>
        </div>
        <div class="provider-body" style="${collapsed ? 'display:none' : ''}">
        ${models.length >= 2 && !isManaged ? `
        <div style="display:flex;gap:6px;margin-bottom:var(--space-sm);align-items:center">
          <button class="btn btn-sm btn-secondary" data-action="batch-test">${t('models.batchTest')}</button>
          <button class="btn btn-sm btn-secondary" data-action="select-all">${t('models.selectAll')}</button>
          <button class="btn btn-sm btn-danger" data-action="batch-delete">${t('models.batchDelete')}</button>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <span style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${t('models.sort')}</span>
            <select class="form-input" data-action="sort-models" style="padding:4px 8px;font-size:var(--font-size-xs);width:auto">
              <option value="default">${t('models.sortDefault')}</option>
              <option value="name-asc">${t('models.sortNameAsc')}</option>
              <option value="name-desc">${t('models.sortNameDesc')}</option>
              <option value="latency-asc">${t('models.sortLatencyAsc')}</option>
              <option value="latency-desc">${t('models.sortLatencyDesc')}</option>
              <option value="context-asc">${t('models.sortContextAsc')}</option>
              <option value="context-desc">${t('models.sortContextDesc')}</option>
            </select>
            <button class="btn btn-sm btn-secondary" data-action="apply-sort" style="display:none">${t('models.applySortBtn')}</button>
          </div>
        </div>` : ''}
        <div class="provider-models">
          ${renderModelCards(key, sorted, primary, search, isManaged)}
          ${hiddenCount > 0 ? `<div style="font-size:var(--font-size-xs);color:var(--text-tertiary);padding:4px 0">${t('models.hiddenModels', { count: hiddenCount })}</div>` : ''}
        </div>
        </div>
      </div>
    `
  }).join('')

  // innerHTML 完成后,直接给每个按钮绑定 onclick
  bindProviderButtons(listEl, page, state)
}

// 渲染模型卡片(支持搜索高亮和批量选择 checkbox)
function renderModelCards(providerKey, models, primary, search, isManaged) {
  if (!models.length) {
    return `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm);padding:8px 0">${t('models.noModel')}</div>`
  }
  return models.map((m) => {
    const id = typeof m === 'string' ? m : m.id
    const name = m.name || id
    const full = modelRefForProvider(providerKey, id)
    const isPrimary = full === primary
    const borderColor = isPrimary ? 'var(--success)' : 'var(--border-primary)'
    const bgColor = isPrimary ? 'var(--success-muted)' : 'var(--bg-tertiary)'
    const meta = []
    if (name !== id) meta.push(name)
    if (m.contextWindow) meta.push((m.contextWindow / 1000) + 'K ' + t('models.context'))
    // 测试状态标签:成功显示耗时,失败显示不可用
    let latencyTag = ''
    if (m.testStatus === 'fail') {
      latencyTag = `<span style="font-size:var(--font-size-xs);padding:1px 6px;border-radius:var(--radius-sm);background:var(--error-muted, #fee2e2);color:var(--error)" title="${(m.testError || '').replace(/"/g, '&quot;')}">${t('models.unavailable')}</span>`
    } else if (m.latency != null) {
      const color = m.latency < 3000 ? 'success' : m.latency < 8000 ? 'warning' : 'error'
      const bg = color === 'success' ? 'var(--success-muted)' : color === 'warning' ? 'var(--warning-muted, #fef3c7)' : 'var(--error-muted, #fee2e2)'
      const fg = color === 'success' ? 'var(--success)' : color === 'warning' ? 'var(--warning, #d97706)' : 'var(--error)'
      latencyTag = `<span style="font-size:var(--font-size-xs);padding:1px 6px;border-radius:var(--radius-sm);background:${bg};color:${fg}">${(m.latency / 1000).toFixed(1)}s</span>`
    }
    const testTime = m.lastTestAt ? formatTestTime(m.lastTestAt) : ''
    if (testTime) meta.push(testTime)
    return `
      <div class="model-card" data-model-id="${id}" data-full="${full}"
           style="background:${bgColor};border:1px solid ${borderColor};padding:10px 14px;border-radius:var(--radius-md);margin-bottom:8px;display:flex;align-items:center;gap:10px">
        <span class="drag-handle" style="color:var(--text-tertiary);cursor:grab;user-select:none;font-size:16px;padding:4px;touch-action:none">⋮⋮</span>
        <input type="checkbox" class="model-checkbox" data-model-id="${id}" style="flex-shrink:0;cursor:pointer">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-family:var(--font-mono);font-size:var(--font-size-sm)">${id}</span>
            ${isPrimary ? `<span style="font-size:var(--font-size-xs);background:var(--success);color:var(--text-inverse);padding:1px 6px;border-radius:var(--radius-sm)">${t('models.primaryModel')}</span>` : ''}
            ${m.reasoning ? `<span style="font-size:var(--font-size-xs);background:var(--accent-muted);color:var(--accent);padding:1px 6px;border-radius:var(--radius-sm)">${t('models.reasoning')}</span>` : ''}
            ${latencyTag}
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:2px">${meta.join(' · ') || ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-secondary" data-action="test-model">${t('models.testBtn')}</button>
          ${!isPrimary ? `<button class="btn btn-sm btn-secondary" data-action="set-primary">${t('models.setPrimary')}</button>` : ''}
          ${isManaged ? '' : `<button class="btn btn-sm btn-secondary" data-action="edit-model">${t('models.editModel')}</button>`}
          ${isManaged ? '' : `<button class="btn btn-sm btn-danger" data-action="delete-model">${t('models.deleteModel')}</button>`}
        </div>
      </div>
    `
  }).join('')
}

// 格式化测试时间为相对时间
function formatTestTime(ts) {
  const diff = Date.now() - ts
  if (diff < 60000) return t('models.justTested')
  if (diff < 3600000) return t('models.minAgoTest', { n: Math.floor(diff / 60000) })
  if (diff < 86400000) return t('models.hourAgoTest', { n: Math.floor(diff / 3600000) })
  return t('models.dayAgoTest', { n: Math.floor(diff / 86400000) })
}

// 根据 model-id 找到原始 index
function findModelIdx(provider, modelId) {
  return (provider.models || []).findIndex(m => (typeof m === 'string' ? m : m.id) === modelId)
}

// ===== 自动保存 + 撤销机制 =====

// 保存快照到撤销栈(变更前调用)
function pushUndo(state) {
  state.undoStack.push(JSON.parse(JSON.stringify(state.config)))
  if (state.undoStack.length > 20) state.undoStack.shift()
}

// 撤销上一步
async function undo(page, state) {
  if (!state.undoStack.length) return
  state.config = state.undoStack.pop()
  renderProviders(page, state)
  renderDefaultBar(page, state)
  updateUndoBtn(page, state)
  await doAutoSave(state)
  toast(t('models.undone'), 'info')
}

// 自动保存（防抖 300ms）+ Gateway 重启队列（3s 防抖 + 单飞行锁）
// 解决 issue #243 / #244 / #240：快速连续编辑不再触发多次重启
let _saveTimer = null
let _batchTestAbort = null // 批量测试终止控制器

export function cleanup() {
  clearTimeout(_saveTimer)
  _saveTimer = null
  if (_batchTestAbort) { _batchTestAbort.abort = true; _batchTestAbort = null }
  cancelPendingRestart()
}
function autoSave(state) {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => doAutoSave(state), 300)
}

/** 已知的 API 类型错误→正确映射,自动修复用户手动编辑或旧版本配置 */
const API_TYPE_FIXES = {
  'google-gemini': 'google-generative-ai',
  'gemini': 'google-generative-ai',
  'google': 'google-generative-ai',
  'anthropic': 'anthropic-messages',
  'openai': 'openai-completions',
  'openai-chat': 'openai-completions',
}
const VALID_API_TYPES = new Set(API_TYPES.map(t => t.value))

/** 保存前规范化所有服务商的 baseUrl 和 API 类型,确保 Gateway 能正确调用 */
function normalizeProviderUrls(config) {
  const providers = config?.models?.providers
  if (!providers) return
  for (const [, p] of Object.entries(providers)) {
    // 修复 API 类型
    if (p.api) {
      const lower = p.api.toLowerCase().trim()
      if (API_TYPE_FIXES[lower]) {
        p.api = API_TYPE_FIXES[lower]
      } else if (!VALID_API_TYPES.has(lower)) {
        console.warn(`[models] 未知 API 类型「${p.api}」,自动修正为 openai-completions`)
        p.api = 'openai-completions'
      }
    }

    if (!p.baseUrl) continue
    let url = p.baseUrl.replace(/\/+$/, '')
    // 去掉尾部的已知端点路径(用户可能粘贴了完整 URL)
    for (const suffix of ['/api/chat', '/api/generate', '/api/tags', '/api', '/chat/completions', '/completions', '/responses', '/messages', '/models']) {
      if (url.endsWith(suffix)) { url = url.slice(0, -suffix.length); break }
    }
    url = url.replace(/\/+$/, '')
    const apiType = (p.api || 'openai-completions').toLowerCase()
    if (apiType === 'anthropic-messages') {
      if (!url.endsWith('/v1')) url += '/v1'
    } else if (apiType !== 'google-generative-ai' && apiType !== 'ollama') {
      // Ollama OpenAI 兼容模式端口检测:11434 默认需要加 /v1(ollama 原生 API 不需要)
      if (/:11434$/.test(url) && !url.endsWith('/v1')) url += '/v1'
      // 不再强制追加 /v1,尊重用户填写的 URL(火山引擎等第三方用 /v3 等路径)
    }
    p.baseUrl = url
  }
}

// 仅保存配置,不重启 Gateway(用于测试结果等元数据持久化)
async function saveConfigOnly(state) {
  try {
    const primary = getCurrentPrimary(state.config)
    if (primary) applyDefaultModel(state)
    normalizeProviderUrls(state.config)
    await api.writeOpenclawConfig(state.config)
  } catch (e) {
    toast(t('models.saveFailed') + ': ' + e, 'error')
  }
}

async function doAutoSave(state) {
  try {
    const primary = getCurrentPrimary(state.config)
    if (primary) applyDefaultModel(state)
    normalizeProviderUrls(state.config)
    await api.writeOpenclawConfig(state.config)

    // ⚠ 只有 Gateway 已经在运行时才触发 restart 让配置生效。
    // 如果 Gateway 没启动（首次安装 / 用户手动停了），盲目调 restart_gateway 会：
    //   1) HTTP 重载失败（端口没人）→ fallback 到 restart_service 强制启动
    //   2) Gateway 启动失败 → 触发后端 Guardian 自动跑 doctor --fix → 卡 30s
    //   3) 用户看到的全是错误 toast，但**配置实际已经写入文件了**
    // 改成：先 probe，运行才 schedule restart；没运行就静默告诉用户"已保存"。
    const gwRunning = await api.probeGatewayPort().catch(() => false)
    if (gwRunning) {
      // 配置已写入。使用 3s 防抖 + 单飞行锁排队重启，避免快速连续编辑触发多次重启。
      showRestartPendingToast()
      scheduleGatewayRestart({ reason: 'models-page' })
    } else {
      toast(t('models.configSavedGwNotRunning'), 'info', { duration: 4000 })
    }
    return true
  } catch (e) {
    toast(t('models.autoSaveFailed') + ': ' + e, 'error')
    return false
  }
}

function showRestartPendingToast() {
  const applyNow = document.createElement('button')
  applyNow.className = 'btn btn-sm btn-primary'
  applyNow.textContent = t('models.applyNow')
  applyNow.style.marginLeft = '8px'
  applyNow.onclick = () => fireRestartNow()
  toast(t('models.configQueued'), 'info', { action: applyNow, duration: 3500 })
}

/**
 * 处理重启队列事件并展示 toast。监听在模块级别，全生命周期生效。
 * - succeeded → 成功提示
 * - failed    → 失败提示 + 重试按钮
 */
function handleRestartState(ev) {
  if (ev.event === 'succeeded') {
    toast(t('models.configEffective'), 'success')
  } else if (ev.event === 'failed') {
    const retryBtn = document.createElement('button')
    retryBtn.className = 'btn btn-sm btn-primary'
    retryBtn.textContent = t('models.retryRestart')
    retryBtn.style.marginLeft = '8px'
    retryBtn.onclick = () => scheduleGatewayRestart({ delay: 0, reason: 'retry' })
    toast(t('models.configSavedGwFailed') + ': ' + ev.error, 'warning', { action: retryBtn, duration: 6000 })
  }
}

let _restartStateOff = null
if (typeof window !== 'undefined' && !_restartStateOff) {
  _restartStateOff = onRestartState(handleRestartState)
}

// 更新撤销按钮状态
function updateUndoBtn(page, state) {
  const btn = page.querySelector('#btn-undo')
  if (!btn) return
  const n = state.undoStack.length
  btn.disabled = !n
  btn.textContent = n ? t('models.undoN', { n }) : t('models.undo')
}

// 渲染完成后,直接给每个 [data-action] 按钮绑定 onclick
function bindProviderButtons(listEl, page, state) {
  // 绑定排序下拉框
  listEl.querySelectorAll('select[data-action="sort-models"]').forEach(select => {
    select.onchange = (e) => {
      const val = e.target.value
      const section = select.closest('[data-provider]')
      if (!section) return
      const providerKey = section.dataset.provider
      const provider = state.config.models.providers[providerKey]

      if (val === 'default') {
        state.sortBy = 'default'
        renderProviders(page, state)
      } else {
        // 将排序固化到底层数据并保存
        pushUndo(state)
        provider.models = sortModels(provider.models, val)
        // 恢复下拉框显示 "默认顺序",因为新顺序已经变成了默认顺序
        state.sortBy = 'default'
        renderProviders(page, state)
        autoSave(state)
        toast(t('models.sortSaved'), 'success')
      }
    }
  })

  // 绑定拖拽排序(Pointer 事件实现,兼容 Tauri WebView2/WKWebView)
  listEl.querySelectorAll('.provider-models').forEach(container => {
    let dragged = null
    let placeholder = null
    let startY = 0

    // 仅从拖拽手柄启动
    container.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.drag-handle')
      if (!handle) return
      const card = handle.closest('.model-card')
      if (!card) return

      e.preventDefault()
      dragged = card
      startY = e.clientY

      // 创建占位符
      placeholder = document.createElement('div')
      placeholder.style.cssText = `height:${card.offsetHeight}px;border:2px dashed var(--border);border-radius:var(--radius-md);margin-bottom:8px;background:var(--bg-secondary)`
      card.after(placeholder)

      // 浮动拖拽元素
      const rect = card.getBoundingClientRect()
      card.style.position = 'fixed'
      card.style.left = rect.left + 'px'
      card.style.top = rect.top + 'px'
      card.style.width = rect.width + 'px'
      card.style.zIndex = '9999'
      card.style.opacity = '0.85'
      card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)'
      card.style.pointerEvents = 'none'
      card.setPointerCapture(e.pointerId)
    })

    container.addEventListener('pointermove', e => {
      if (!dragged || !placeholder) return
      e.preventDefault()

      // 移动浮动元素
      const dy = e.clientY - startY
      const origTop = parseFloat(dragged.style.top)
      dragged.style.top = (origTop + dy) + 'px'
      startY = e.clientY

      // 查找目标位置
      const siblings = [...container.querySelectorAll('.model-card:not([style*="position: fixed"])')].filter(c => c !== dragged)
      for (const sibling of siblings) {
        const rect = sibling.getBoundingClientRect()
        const midY = rect.top + rect.height / 2
        if (e.clientY < midY) {
          sibling.before(placeholder)
          return
        }
      }
      // 放到最后
      if (siblings.length) siblings[siblings.length - 1].after(placeholder)
    })

    container.addEventListener('pointerup', e => {
      if (!dragged || !placeholder) return

      // 恢复样式
      dragged.style.position = ''
      dragged.style.left = ''
      dragged.style.top = ''
      dragged.style.width = ''
      dragged.style.zIndex = ''
      dragged.style.opacity = ''
      dragged.style.boxShadow = ''
      dragged.style.pointerEvents = ''

      // 把卡片放到占位符位置
      placeholder.before(dragged)
      placeholder.remove()

      // 保存新顺序
      const section = container.closest('[data-provider]')
      if (section) {
        const providerKey = section.dataset.provider
        const provider = state.config.models.providers[providerKey]
        if (provider) {
          const newOrderIds = [...container.querySelectorAll('.model-card')].map(c => c.dataset.modelId)
          pushUndo(state)
          const oldModels = [...provider.models]
          provider.models = newOrderIds.map(id => oldModels.find(m => (typeof m === 'string' ? m : m.id) === id))
          autoSave(state)
        }
      }

      dragged = null
      placeholder = null
    })
  })

  // 折叠/展开服务商
  listEl.querySelectorAll('[data-action="toggle-provider"]').forEach(span => {
    span.onclick = () => {
      const section = span.closest('[data-provider]')
      if (!section) return
      const key = section.dataset.provider
      state._collapsed[key] = !state._collapsed[key]
      renderProviders(page, state)
    }
  })

  // 绑定按钮
  listEl.querySelectorAll('button[data-action], input[data-action]').forEach(btn => {
    const action = btn.dataset.action
    const section = btn.closest('[data-provider]')
    if (!section) return
    const providerKey = section.dataset.provider
    const provider = state.config.models.providers[providerKey]
    if (!provider) return
    const card = btn.closest('.model-card')

        // checkbox 改变时不需要阻止冒泡,由 handleAction 内部处理
    if (btn.type === 'checkbox') {
      btn.onchange = (e) => {
        handleAction(action, btn, card, section, providerKey, provider, page, state)
      }
    } else {
      btn.onclick = (e) => {
        e.stopPropagation()
        handleAction(action, btn, card, section, providerKey, provider, page, state)
      }
    }
  })
}

// 统一处理按钮动作
async function handleAction(action, btn, card, section, providerKey, provider, page, state) {
  switch (action) {
    case 'edit-provider':
      editProvider(page, state, providerKey)
      break
    case 'add-model':
      addModel(page, state, providerKey)
      break
    case 'fetch-models':
      fetchRemoteModels(btn, page, state, providerKey)
      break
    case 'delete-provider': {
      const yes = await showConfirm(t('models.confirmDeleteProvider', { name: providerKey }))
      if (!yes) return
      pushUndo(state)
      delete state.config.models.providers[providerKey]
      renderProviders(page, state)
      renderDefaultBar(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
      toast(t('models.providerDeleted', { name: providerKey }), 'info')
      break
    }
    case 'select-all':
      handleSelectAll(section)
      break
    case 'batch-delete':
      handleBatchDelete(section, page, state, providerKey)
      break
    case 'batch-test':
      handleBatchTest(section, state, providerKey)
      break
    case 'delete-model': {
      if (!card) return
      const modelId = card.dataset.modelId
      const yes = await showConfirm(t('models.confirmDeleteModel', { name: modelId }))
      if (!yes) return
      pushUndo(state)
      const idx = findModelIdx(provider, modelId)
      if (idx >= 0) provider.models.splice(idx, 1)
      renderProviders(page, state)
      renderDefaultBar(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
      toast(t('models.modelDeleted', { name: modelId }), 'info')
      break
    }
    case 'edit-model': {
      if (!card) return
      if (provider?.managed) { toast(t('models.cannotEditManaged'), 'info'); return }
      const idx = findModelIdx(provider, card.dataset.modelId)
      if (idx >= 0) editModel(page, state, providerKey, idx)
      break
    }
    case 'test-all-models': {
      handleBatchTest(section, state, providerKey)
      break
    }
    case 'set-primary': {
      if (!card) return
      pushUndo(state)
      setPrimary(state, card.dataset.full)
      renderProviders(page, state)
      renderDefaultBar(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
      toast(t('models.setPrimaryDone'), 'success')
      break
    }
    case 'test-model': {
      if (!card) return
      const idx = findModelIdx(provider, card.dataset.modelId)
      if (idx >= 0) testModel(btn, state, providerKey, idx)
      break
    }
  }
}

// 设置主模型入口
function setPrimary(state, full) {
  const oldPrimary = getCurrentPrimary(state.config)
  if (oldPrimary === full) return

  // 1. 设置新主模型状态
  ensureDefaultModelConfig(state).primary = full

  // 2. 轮转备选链状态
  rotateFallbackChain(state, oldPrimary, full)

  // 3. 持久化到 localStorage（下次进入页面时恢复）
  try { localStorage.setItem(STORAGE_PRIMARY_MODEL_KEY, full) } catch {}
}

// 页面加载时尝试从 localStorage 恢复主模型
function tryRestorePrimary(state) {
  const saved = localStorage.getItem(STORAGE_PRIMARY_MODEL_KEY)
  if (!saved) return
  const allModels = collectAllModels(state.config)
  if (allModels.some(m => m.full === saved)) {
    // 模型存在列表中，恢复用户之前设置的主模型
    setPrimary(state, saved)
  } else {
    // 主模型已不存在（服务商/模型被删除），清除 localStorage 标记
    localStorage.removeItem(STORAGE_PRIMARY_MODEL_KEY)
  }
}

// 处理主模型变更后，备选链的数据流转
function rotateFallbackChain(state, oldPrimary, newPrimary) {
  const modelConfig = ensureDefaultModelConfig(state)
  const validModels = new Set(collectAllModels(state.config).map(m => m.full))
  const seen = new Set()

  // 从备选链中移除新上位的主模型
  const newFallbacks = (modelConfig.fallbacks || [])
    .filter(f => f !== newPrimary && validModels.has(f))
    .filter(f => {
      if (seen.has(f)) return false
      seen.add(f)
      return true
    })

  // 将原主模型降级放入备选链
  if (oldPrimary && oldPrimary !== newPrimary && validModels.has(oldPrimary) && !seen.has(oldPrimary)) {
    newFallbacks.push(oldPrimary)
  }

  modelConfig.fallbacks = newFallbacks
}

// 应用默认模型:primary + 其余自动成为备选
// 确保 primary 指向的模型仍然存在,不存在则自动切到第一个可用模型
function ensureValidPrimary(state) {
  const primary = getCurrentPrimary(state.config)
  const allModels = collectAllModels(state.config)
  if (allModels.length === 0) {
    // 所有模型都没了,清空 primary
    if (state.config.agents?.defaults?.model) {
      state.config.agents.defaults.model.primary = ''
    }
    return
  }
  const exists = allModels.some(m => m.full === primary)
  if (!exists) {
    // primary 指向已删除的模型,自动切到第一个
    const newPrimary = allModels[0].full
    setPrimary(state, newPrimary)
    toast(t('models.primaryAutoSwitch', { model: newPrimary }), 'info')
  }
}

function applyDefaultModel(state) {
  ensureValidPrimary(state)
  const primary = getCurrentPrimary(state.config)

  const defaults = state.config.agents.defaults
  if (!defaults.model) defaults.model = {}
  defaults.model.primary = primary

  // fallbacks / models 仅在为空时初始化(首次安装友好),不再每次保存都覆盖
  // 避免用户精心维护的精简 fallback 链被重写,且随模型增多不断膨胀 (fixes #190)
  if (!defaults.model.fallbacks || defaults.model.fallbacks.length === 0) {
    const allModels = collectAllModels(state.config)
    defaults.model.fallbacks = allModels.filter(m => m.full !== primary).map(m => m.full)
  }
  if (!defaults.models || Object.keys(defaults.models).length === 0) {
    const allModels = collectAllModels(state.config)
    const modelsMap = {}
    modelsMap[primary] = {}
    for (const m of allModels) { if (m.full !== primary) modelsMap[m.full] = {} }
    defaults.models = modelsMap
  }

  // 注意:不再强制同步到各 agent 的 model.primary
  // 子 Agent 的模型覆盖是 OpenClaw 正常功能(用户可通过对话为不同 Agent 设置不同模型)
  // 强制覆盖会导致 #142:重开 SuperClaw 后子 Agent 模型配置被重置
}

// 顶部按钮事件
function bindTopActions(page, state) {
  page.querySelector('#btn-add-provider').onclick = () => addProvider(page, state)
  page.querySelector('#btn-undo').onclick = () => undo(page, state)
  const yyapiRefreshBtn = page.querySelector('#btn-refresh-yyapi')
  if (yyapiRefreshBtn) yyapiRefreshBtn.onclick = () => refreshYYApiKeys(page, state)
  const yyapiConsoleBtn = page.querySelector('#btn-open-yyapi-console')
  if (yyapiConsoleBtn) yyapiConsoleBtn.onclick = () => openYYApiConsole()

}

// 模型配置对话框（默认 YYApi，API Key 可下拉选择也可手动输入）
function addProvider(page, state) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" style="max-height:85vh;overflow-y:auto">
      <div class="modal-title">${t('models.addProviderTitle')}</div>
      <div class="form-group">
        <label class="form-label">${t('models.providerName')}</label>
        <input class="form-input" data-name="key" value="YYAPI" placeholder="deepseek">
        <div class="form-hint">${t('models.providerNameHint')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('models.baseUrl')}</label>
        <input class="form-input" data-name="baseUrl" value="http://124.222.21.44:3002/v1" placeholder="https://api.openai.com/v1">
        <div class="form-hint">${t('models.baseUrlHint')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('models.apiKey')}</label>
        <select class="form-input" data-name="apiKey-select" id="apikey-select">
          <option value="">${t('common.loading')}</option>
        </select>
        <input class="form-input" data-name="apiKey-input" id="apikey-input" placeholder="${t('models.apiKeyPlaceholder')}" style="display:none">
        <div class="form-hint">${t('models.apiKeyHint')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('models.apiType')}</label>
        <select class="form-input" data-name="api">
          ${API_TYPES.map(at => `<option value="${at.value}" ${at.value === 'openai-completions' ? 'selected' : ''}>${at.label}</option>`).join('')}
        </select>
        <div class="form-hint">${t('models.apiTypeHint')}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
        <button class="btn btn-primary btn-sm" data-action="confirm">${t('common.confirm')}</button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  // 异步加载 API Key 列表填充下拉框
  ;(async () => {
    try {
      const { getTokenList } = await import('../lib/user-api.js')
      const tokens = await getTokenList()
      const select = overlay.querySelector('#apikey-select')
      const input = overlay.querySelector('[data-name="apiKey-input"]')
      if (!select) return
      if (tokens && tokens.length) {
        select.innerHTML = tokens.map((tok, i) => {
          const label = tok.name || tok.id || `Token ${i + 1}`
          // value 用 id（数字），确认时会自动调 getFullTokenKey 获取明文 key
          const val = tok.id || tok.key || ''
          return `<option value="${val}">${label}</option>`
        }).join('') + '<option value="__custom__">✏️ 手动输入</option>'
        // 默认选中第一个
        select.value = tokens[0].id || tokens[0].key || ''
      } else {
        select.innerHTML = '<option value="">-- 暂无密钥 --</option>' + '<option value="__custom__">✏️ 手动输入</option>'
        select.value = '__custom__'
      }
      // 切换 select/input
      const doToggle = () => {
        if (select.value === '__custom__') {
          select.style.display = 'none'
          input.style.display = ''
          input.focus()
        }
      }
      select.addEventListener('change', doToggle)
      if (select.value === '__custom__') doToggle()
    } catch (err) {
      console.error('[addProvider] 加载 API Key 列表失败:', err)
      const select = overlay.querySelector('#apikey-select')
      if (select) {
        select.innerHTML = '<option value="">-- 加载失败 --</option>' + '<option value="__custom__">✏️ 手动输入</option>'
        select.value = '__custom__'
        select.dispatchEvent(new Event('change'))
      }
    }
  })()

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  overlay.querySelector('[data-action="cancel"]').onclick = () => overlay.remove()

  overlay.querySelector('[data-action="confirm"]').onclick = async () => {
    const keyInput = overlay.querySelector('[data-name="key"]')
    const baseUrlInput = overlay.querySelector('[data-name="baseUrl"]')
    const key = keyInput.value.trim() || 'OPENAI'
    const baseUrl = baseUrlInput.value.trim()
    const select = overlay.querySelector('[data-name="apiKey-select"]')
    const input = overlay.querySelector('[data-name="apiKey-input"]')
    const apiKeyVal = (input.style.display !== 'none' ? input.value : select.value).trim()
    const apiType = overlay.querySelector('[data-name="api"]').value

    if (!key) {
      toast(t('models.providerNameRequired'), 'warning')
      return
    }
    if (!baseUrl) {
      toast(t('models.baseUrlRequired'), 'warning')
      return
    }

    pushUndo(state)
    if (!state.config.models) state.config.models = { mode: 'replace', providers: {} }
    if (!state.config.models.providers) state.config.models.providers = {}

    let finalApiKey = apiKeyVal
    // 如果输入的是 token ID（纯数字），尝试获取完整 key
    if (/^\d+$/.test(apiKeyVal)) {
      try {
        const { getFullTokenKey } = await import('../lib/user-api.js')
        const keyData = await getFullTokenKey(apiKeyVal)
        if (keyData.key) finalApiKey = keyData.key
        else if (keyData.apiKey) finalApiKey = keyData.apiKey
      } catch (err) {
        console.error('[addProvider] 获取完整 API Key 失败:', err)
      }
    }

    state.config.models.providers[key] = {
      baseUrl: baseUrl,
      apiKey: finalApiKey || '',
      api: apiType,
      managed: false,
      models: [],
    }
    overlay.remove()
    renderProviders(page, state)
    updateUndoBtn(page, state)
    autoSave(state)
    toast(t('models.providerAdded', { name: key }), 'success')
  }
}

// 自动初始化 YYApi 服务商（如果存在用户令牌，自动创建并拉取模型列表）
async function autoInitYYApi(page, state) {
  // 如果已有 YYAPI 服务商则跳过
  if (state.config?.models?.providers?.[YYAPI_PROVIDER_KEY]) return

  let tokens, firstKey
  try {
    const { getTokenList, getFullTokenKey } = await import('../lib/user-api.js')
    tokens = await getTokenList()
    if (!tokens || !tokens.length) return
    const firstToken = tokens[0]
    // 只要有 token ID，就获取完整 key（list 接口返回的 key 可能是脱敏的）
    if (firstToken.id) {
      try {
        const keyData = await getFullTokenKey(firstToken.id)
        firstKey = keyData.key || keyData.apiKey || ''
      } catch (_) {
        firstKey = firstToken.key || ''
      }
    } else {
      firstKey = firstToken.key || ''
    }
  } catch (err) {
    console.error('[autoInitYYApi] 获取令牌失败:', err)
    return
  }
  if (!firstKey) return

  // 拉取 YYApi 模型列表
  let modelIds = []
  try {
    const modelResp = await fetch('http://124.222.21.44:3002/v1/models', {
      headers: { 'Authorization': `Bearer ${firstKey}` },
      signal: AbortSignal.timeout(10000),
    })
    if (modelResp.ok) {
      const modelData = await modelResp.json()
      modelIds = (modelData.data || modelData || [])
        .filter(m => m.id)
        .map(m => ({ id: m.id, name: m.id, input: ['text', 'image'] }))
    }
  } catch (err) {
    console.error('[autoInitYYApi] 拉取模型列表失败:', err)
  }

  if (!state.config.models) state.config.models = { mode: 'replace', providers: {} }
  if (!state.config.models.providers) state.config.models.providers = {}

  // 自动初始化时只把主模型写入配置，避免上百个模型全量写入导致 gateway schema 验证失败
  const primaryModelId = modelIds.length ? modelIds[0].id : null
  state.config.models.providers[YYAPI_PROVIDER_KEY] = {
    baseUrl: 'http://124.222.21.44:3002/v1',
    apiKey: firstKey,
    api: 'openai-completions',
    models: modelIds,
  }

  // 自动设置主模型；打包模板里的 yyapi/superclaw-login-required 也会在这里替换掉。
  if (primaryModelId) {
    ensureYyapiManagedModelSelection(state.config, modelIds.map(m => m.id).filter(Boolean))
  }
  ensurePortableOpenClawSkills(state.config)

  renderProviders(page, state)
  renderDefaultBar(page, state)
  updateUndoBtn(page, state)
  autoSave(state)
  console.log(`[autoInitYYApi] YYAPI provider added, models=${modelIds.length}, primary=${primaryModelId || ''}`)
}

// 编辑服务商
function editProvider(page, state, providerKey) {
  const p = state.config.models.providers[providerKey]
  if (p?.managed) {
    toast(t('models.cannotEditManaged'), 'info')
    return
  }
  showModal({
    title: t('models.editProviderTitle', { name: providerKey }),
    fields: [
      { name: 'baseUrl', label: t('models.baseUrl'), value: p.baseUrl || '', hint: t('models.baseUrlHint') },
      { name: 'apiKey', label: t('models.apiKey'), value: p.apiKey || '', hint: t('models.apiKeyEditHint') },
      {
        name: 'api', label: t('models.apiType'), type: 'select', value: p.api || 'openai-completions',
        options: API_TYPES,
        hint: t('models.apiTypeHint'),
      },
    ],
    onConfirm: ({ baseUrl, apiKey, api: apiType }) => {
      pushUndo(state)
      p.baseUrl = baseUrl
      p.apiKey = apiKey
      p.api = apiType
      renderProviders(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
      toast(t('models.providerUpdated'), 'success')
    },
  })
}

// 添加模型(带预设快捷选择)
function addModel(page, state, providerKey) {
  const presets = MODEL_PRESETS[providerKey] || []
  const existingIds = (state.config.models.providers[providerKey].models || [])
    .map(m => typeof m === 'string' ? m : m.id)

  // 过滤掉已添加的模型
  const available = presets.filter(p => !existingIds.includes(p.id))

  const fields = [
    { name: 'id', label: t('models.modelId'), placeholder: t('models.modelIdPlaceholder'), hint: t('models.modelIdHint') },
    { name: 'name', label: t('models.displayName'), placeholder: t('models.displayNamePlaceholder'), hint: t('models.displayNameHint') },
    { name: 'contextWindow', label: t('models.contextLength'), placeholder: t('models.contextLengthPlaceholder'), hint: t('models.contextLengthHint') },
    { name: 'reasoning', label: t('models.isReasoning'), type: 'checkbox', value: false, hint: t('models.reasoningHint') },
  ]

  if (available.length) {
    // 有预设可用,构建自定义弹窗
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'

    const presetBtns = available.map(p =>
      `<button class="btn btn-sm btn-secondary preset-btn" data-mid="${p.id}" style="margin:0 6px 6px 0">${p.name}${p.reasoning ? ` (${t('models.reasoning')})` : ''}</button>`
    ).join('')

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${t('models.addModelTitle', { provider: providerKey })}</div>
        <div class="form-group">
          <label class="form-label">${t('models.quickAdd')}</label>
          <div style="display:flex;flex-wrap:wrap">${presetBtns}</div>
          <div class="form-hint">${t('models.quickAddHint')}</div>
        </div>
        <hr style="border:none;border-top:1px solid var(--border-primary);margin:var(--space-sm) 0">
        <div class="form-group">
          <label class="form-label">${t('models.manualAdd')}</label>
        </div>
        ${buildFieldsHtml(fields)}
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
          <button class="btn btn-primary btn-sm" data-action="confirm">${t('common.confirm')}</button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)
    bindModalEvents(overlay, fields, (vals) => {
      pushUndo(state)
      doAddModel(state, providerKey, vals)
      renderProviders(page, state)
      renderDefaultBar(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
    })

    // 预设按钮:点击直接添加
    overlay.querySelectorAll('.preset-btn').forEach(btn => {
      btn.onclick = () => {
        const preset = available.find(p => p.id === btn.dataset.mid)
        if (!preset) return
        pushUndo(state)
        const model = { ...preset, input: ['text', 'image'] }
        state.config.models.providers[providerKey].models.push(model)
        overlay.remove()
        renderProviders(page, state)
        renderDefaultBar(page, state)
        updateUndoBtn(page, state)
        autoSave(state)
        toast(t('models.modelAdded', { name: preset.name }), 'success')
      }
    })
  } else {
    // 无预设,直接弹普通 modal
    showModal({
      title: t('models.addModelTitle', { provider: providerKey }),
      fields,
      onConfirm: (vals) => {
        pushUndo(state)
        doAddModel(state, providerKey, vals)
        renderProviders(page, state)
        renderDefaultBar(page, state)
        updateUndoBtn(page, state)
        autoSave(state)
      },
    })
  }
}

// 构建表单字段 HTML(用于自定义弹窗)
function buildFieldsHtml(fields) {
  return fields.map(f => {
    if (f.type === 'checkbox') {
      return `
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" data-name="${f.name}" ${f.value ? 'checked' : ''}>
            <span class="form-label" style="margin:0">${f.label}</span>
          </label>
          ${f.hint ? `<div class="form-hint">${f.hint}</div>` : ''}
        </div>`
    }
    return `
      <div class="form-group">
        <label class="form-label">${f.label}</label>
        <input class="form-input" data-name="${f.name}" value="${f.value || ''}" placeholder="${f.placeholder || ''}">
        ${f.hint ? `<div class="form-hint">${f.hint}</div>` : ''}
      </div>`
  }).join('')
}

// 绑定自定义弹窗的通用事件
function bindModalEvents(overlay, fields, onConfirm) {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  overlay.querySelector('[data-action="cancel"]').onclick = () => overlay.remove()
  overlay.querySelector('[data-action="confirm"]').onclick = () => {
    const result = {}
    overlay.querySelectorAll('[data-name]').forEach(el => {
      result[el.dataset.name] = el.type === 'checkbox' ? el.checked : el.value
    })
    overlay.remove()
    onConfirm(result)
  }
}

// 实际添加模型到 state
function doAddModel(state, providerKey, vals) {
  if (!vals.id) { toast(t('models.modelIdRequired'), 'warning'); return }
  const model = {
    id: vals.id.trim(),
    name: vals.name?.trim() || vals.id.trim(),
    reasoning: !!vals.reasoning,
    input: ['text', 'image'],
  }
  if (vals.contextWindow) model.contextWindow = parseInt(vals.contextWindow) || 0
  state.config.models.providers[providerKey].models.push(model)
  toast(t('models.modelAdded', { name: model.name }), 'success')
}

// 编辑模型
function editModel(page, state, providerKey, idx) {
  const m = state.config.models.providers[providerKey].models[idx]
  showModal({
    title: t('models.editModelTitle', { name: m.id }),
    fields: [
      { name: 'id', label: t('models.modelId'), value: m.id || '', hint: t('models.modelIdHint') },
      { name: 'name', label: t('models.displayNameLabel'), value: m.name || '', hint: t('models.displayNameHint') },
      { name: 'contextWindow', label: t('models.contextLengthLabel'), value: String(m.contextWindow || ''), hint: t('models.contextLengthHint') },
      { name: 'reasoning', label: t('models.isReasoningLabel'), type: 'checkbox', value: !!m.reasoning, hint: t('models.reasoningHint') },
    ],
    onConfirm: (vals) => {
      if (!vals.id) return
      pushUndo(state)
      m.id = vals.id.trim()
      m.name = vals.name?.trim() || vals.id.trim()
      m.reasoning = !!vals.reasoning
      if (vals.contextWindow) m.contextWindow = parseInt(vals.contextWindow) || 0
      renderProviders(page, state)
      renderDefaultBar(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
      toast(t('models.modelUpdated'), 'success')
    },
  })
}

// 全选/取消全选
function handleSelectAll(section) {
  const boxes = section.querySelectorAll('.model-checkbox')
  const allChecked = [...boxes].every(cb => cb.checked)
  boxes.forEach(cb => { cb.checked = !allChecked })
  // 更新批量删除按钮状态
  const batchDelBtn = section.querySelector('[data-action="batch-delete"]')
  if (batchDelBtn) batchDelBtn.disabled = allChecked
}

// 批量删除选中的模型
async function handleBatchDelete(section, page, state, providerKey) {
  const checked = [...section.querySelectorAll('.model-checkbox:checked')]
  if (!checked.length) { toast(t('models.batchSelectHint'), 'warning'); return }
  const ids = checked.map(cb => cb.dataset.modelId)
  const yes = await showConfirm(t('models.confirmBatchDelete', { count: ids.length, ids: ids.join(', ') }))
  if (!yes) return
  pushUndo(state)
  const provider = state.config.models.providers[providerKey]
  provider.models = (provider.models || []).filter(m => {
    const mid = typeof m === 'string' ? m : m.id
    return !ids.includes(mid)
  })
  renderProviders(page, state)
  renderDefaultBar(page, state)
  updateUndoBtn(page, state)
  autoSave(state)
  toast(t('models.batchDeleted', { count: ids.length }), 'info')
}

// 批量测试:勾选的模型,没勾选则测试全部(记录耗时和状态)
async function handleBatchTest(section, state, providerKey) {
  // 如果正在测试,点击则终止
  if (_batchTestAbort) {
    _batchTestAbort.abort = true
    toast(t('models.stoppingBatchTest'), 'warning')
    return
  }

  const provider = state.config.models.providers[providerKey]
  const checked = [...section.querySelectorAll('.model-checkbox:checked')]
  const ids = checked.length
    ? checked.map(cb => cb.dataset.modelId)
    : (provider.models || []).map(m => typeof m === 'string' ? m : m.id)

  if (!ids.length) { toast(t('models.noTestModels'), 'warning'); return }

  const batchBtn = section.querySelector('[data-action="batch-test"]')
  const ctrl = { abort: false }
  _batchTestAbort = ctrl
  if (batchBtn) {
    batchBtn.textContent = t('models.stopBatchTest')
    batchBtn.classList.remove('btn-secondary')
    batchBtn.classList.add('btn-danger')
  }

  const page = section.closest('.page')
  let ok = 0, fail = 0
  for (const modelId of ids) {
    if (ctrl.abort) break

    const model = (provider.models || []).find(m => (typeof m === 'string' ? m : m.id) === modelId)
    // 标记当前正在测试的卡片
    const card = section.querySelector(`.model-card[data-model-id="${modelId}"]`)
    if (card) card.style.outline = '2px solid var(--accent)'

    const start = Date.now()
    try {
      await api.testModel(provider.baseUrl, provider.apiKey || '', modelId, provider.api || 'openai-completions')
      const elapsed = Date.now() - start
      if (model && typeof model === 'object') {
        model.latency = elapsed
        model.lastTestAt = Date.now()
        model.testStatus = 'ok'
        delete model.testError
      }
      ok++
    } catch (e) {
      const elapsed = Date.now() - start
      if (model && typeof model === 'object') {
        model.latency = null
        model.lastTestAt = Date.now()
        model.testStatus = 'fail'
        model.testError = String(e).slice(0, 100)
      }
      fail++
    }

    // 每测完一个实时刷新卡片
    if (page) {
      renderProviders(page, state)
      renderDefaultBar(page, state)
    }
    // 进度 toas
    const status = model?.testStatus === 'ok' ? '\u2713' : '\u2717'
    const latStr = model?.latency != null ? ` ${(model.latency / 1000).toFixed(1)}s` : ''
    toast(`${status} ${modelId}${latStr} (${ok + fail}/${ids.length})`, model?.testStatus === 'ok' ? 'success' : 'error')
  }

  // 恢复按钮
  _batchTestAbort = null
  // 重新查找按钮(renderProviders 后 DOM 已更新)
  const newSection = page?.querySelector(`[data-provider="${providerKey}"]`)
  const newBtn = newSection?.querySelector('[data-action="batch-test"]')
  if (newBtn) {
    newBtn.textContent = t('models.batchTest')
    newBtn.classList.remove('btn-danger')
    newBtn.classList.add('btn-secondary')
  }

  const aborted = ctrl.abort
  autoSave(state)
  if (aborted) {
    toast(t('models.batchTestAborted', { ok, fail, skip: ids.length - ok - fail }), 'warning')
  } else {
    toast(t('models.batchTestDone', { ok, fail }), ok === ids.length ? 'success' : 'warning')
  }
}

// 从服务商远程获取模型列表
async function fetchRemoteModels(btn, page, state, providerKey) {
  const provider = state.config.models.providers[providerKey]
  btn.disabled = true
  btn.textContent = t('models.qtcoolFetching')

  try {
    const remoteIds = await api.listRemoteModels(provider.baseUrl, provider.apiKey || '', provider.api || 'openai-completions')
    btn.disabled = false
    btn.textContent = t('models.fetchList')

    // 标记已添加的模型
    const existingIds = (provider.models || []).map(m => typeof m === 'string' ? m : m.id)

    // 弹窗展示可选模型列表
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal" style="max-height:80vh;display:flex;flex-direction:column">
        <div class="modal-title">${t('models.remoteListTitle', { provider: providerKey, count: remoteIds.length })}</div>
        <div style="margin-bottom:var(--space-sm);display:flex;gap:8px;align-items:center">
          <input class="form-input" id="remote-filter" placeholder="${t('models.remoteSearch')}" style="flex:1">
          <button class="btn btn-sm btn-secondary" id="remote-toggle-all">${t('models.selectAll')}</button>
        </div>
        <div id="remote-model-list" style="flex:1;overflow-y:auto;max-height:50vh"></div>
        <div class="modal-actions" style="margin-top:var(--space-sm)">
          <span id="remote-selected-count" style="font-size:var(--font-size-xs);color:var(--text-tertiary);flex:1">${t('models.remoteSelected', { count: 0 })}</span>
          <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
          <button class="btn btn-primary btn-sm" data-action="confirm">${t('models.addSelected')}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    const listEl = overlay.querySelector('#remote-model-list')
    const filterInput = overlay.querySelector('#remote-filter')
    const countEl = overlay.querySelector('#remote-selected-count')

    function renderRemoteList(filter) {
      const filtered = filter
        ? remoteIds.filter(id => id.toLowerCase().includes(filter.toLowerCase()))
        : remoteIds
      listEl.innerHTML = filtered.map(id => {
        const exists = existingIds.includes(id)
        return `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--radius-sm);cursor:pointer;${exists ? 'opacity:0.5' : ''}">
            <input type="checkbox" class="remote-cb" data-id="${id}" ${exists ? 'disabled' : ''}>
            <span style="font-family:var(--font-mono);font-size:var(--font-size-sm)">${id}</span>
            ${exists ? `<span style="font-size:var(--font-size-xs);color:var(--text-tertiary)">(${t('models.alreadyAdded')})</span>` : ''}
          </label>`
      }).join('')
      updateCount()
    }

    function updateCount() {
      const n = listEl.querySelectorAll('.remote-cb:checked').length
      countEl.textContent = t('models.remoteSelected', { count: n })
    }

    renderRemoteList('')
    filterInput.oninput = () => renderRemoteList(filterInput.value.trim())
    listEl.addEventListener('change', updateCount)

    overlay.querySelector('#remote-toggle-all').onclick = () => {
      const cbs = listEl.querySelectorAll('.remote-cb:not(:disabled)')
      const allChecked = [...cbs].every(cb => cb.checked)
      cbs.forEach(cb => { cb.checked = !allChecked })
      updateCount()
    }

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('[data-action="cancel"]').onclick = () => overlay.remove()
    overlay.querySelector('[data-action="confirm"]').onclick = () => {
      const selected = [...listEl.querySelectorAll('.remote-cb:checked')].map(cb => cb.dataset.id)
      if (!selected.length) { toast(t('models.selectAtLeast'), 'warning'); return }
      pushUndo(state)
      for (const id of selected) {
        provider.models.push({ id, input: ['text', 'image'] })
      }
      overlay.remove()
      renderProviders(page, state)
      renderDefaultBar(page, state)
      updateUndoBtn(page, state)
      autoSave(state)
      toast(t('models.qtcoolAdded', { count: selected.length }), 'success')
    }

    filterInput.focus()
  } catch (e) {
    btn.disabled = false
    btn.textContent = t('models.fetchList')
    const errStr = String(e?.message || e)
    // 服务商不支持 /models 接口 → 友好弹窗引导手动添加
    if (errStr.includes('[NOT_SUPPORTED]') || errStr.includes('不支持自动获取')) {
      const msg = errStr.replace('[NOT_SUPPORTED] ', '').replace('获取模型列表失败: ', '')
      showConfirm(t('models.fetchNotSupported', { error: msg }), {
        title: t('models.fetchNotSupportedTitle'),
        confirmText: t('models.addModel').replace('+ ', ''),
        cancelText: t('common.close'),
      }).then(yes => {
        if (yes) addModel(btn.closest('.page') || document.querySelector('.page'), { config: state.config, save: state.save }, providerKey)
      })
    } else {
      toast(t('models.fetchFailed', { error: errStr }), 'error')
    }
  }
}

/**
 * 刷新 YYApi 模型列表
 * 调用 v2 API 获取最新 key 和模型
 */
async function refreshYYApiKeys(page, state) {
  const btn = page.querySelector('#btn-refresh-yyapi')
  if (!btn) return
  btn.disabled = true
  const origText = btn.innerHTML
  btn.innerHTML = t('models.refreshing')

  try {
    const { getTokenList, getFullTokenKey } = await import('../lib/user-api.js')
    const tokens = await getTokenList()
    if (!tokens || !tokens.length) {
      toast(t('models.yyapiNoToken'), 'warning')
      return
    }

    const firstToken = tokens[0]
    let fullKey = ''
    // 只要有 token ID，就获取完整 key（list 接口返回的 key 可能是脱敏的）
    if (firstToken.id) {
      try {
        const keyData = await getFullTokenKey(firstToken.id)
        fullKey = typeof keyData === 'string' ? keyData : (keyData.key || keyData.apiKey || '')
      } catch (_) {
        fullKey = firstToken.key || ''
      }
    } else {
      fullKey = firstToken.key || ''
    }
    if (!fullKey) {
      toast(t('models.yyapiNoKey'), 'warning')
      return
    }

    // 从 YYApi 获取模型列表
    const modelResp = await fetch('http://124.222.21.44:3002/v1/models', {
      headers: { 'Authorization': `Bearer ${fullKey}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!modelResp.ok) {
      toast(t('models.yyapiFetchFailed'), 'error')
      return
    }
    const modelData = await modelResp.json()
    const modelIds = (modelData.data || modelData || [])
      .filter(m => m.id)
      .map(m => ({ id: m.id, name: m.id, input: ['text', 'image'] }))

    if (!modelIds.length) {
      toast(t('models.yyapiNoModels'), 'info')
      return
    }

    // 更新本地配置
    pushUndo(state)
    if (!state.config.models) state.config.models = {}
    if (!state.config.models.providers) state.config.models.providers = {}
    const existing = state.config.models.providers[YYAPI_PROVIDER_KEY]
    if (!existing) {
      state.config.models.providers[YYAPI_PROVIDER_KEY] = {
        baseUrl: 'http://124.222.21.44:3002/v1',
        apiKey: fullKey,
        api: 'openai-completions',
        models: modelIds,
      }
    } else {
      existing.baseUrl = 'http://124.222.21.44:3002/v1'
      existing.apiKey = fullKey
      existing.api = existing.api || 'openai-completions'
      existing.models = modelIds
    }

    const yyapiIds = modelIds.map(m => m.id).filter(Boolean)
    const nextPrimary = ensureYyapiManagedModelSelection(state.config, yyapiIds)
    ensurePortableOpenClawSkills(state.config)
    if (nextPrimary) {
      try { localStorage.setItem(STORAGE_PRIMARY_MODEL_KEY, nextPrimary) } catch {}
    }

    renderProviders(page, state)
    renderDefaultBar(page, state)
    updateUndoBtn(page, state)
    const saved = await doAutoSave(state)
    if (saved) {
      toast(t('models.yyapiRefreshDone', { count: modelIds.length }), 'success')
    }
  } catch (err) {
    toast(t('models.yyapiRefreshFailed') + ': ' + (err.message || err), 'error')
  } finally {
    btn.disabled = false
    btn.innerHTML = origText
  }
}

/**
 * 打开 YYApi 控制台 - 直接在浏览器打开，不内置
 */
async function openYYApiConsole() {
  if (window.__TAURI_INTERNALS__) {
    return openYYApiConsoleDesktop()
  }
  // Web 端：直接在新标签页打开
  window.open(YYAPI_CONSOLE_URL, '_blank')
}

/** Tauri 桌面端：直接在系统浏览器打开 YYApi 控制台 */
async function openYYApiConsoleDesktop() {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(YYAPI_CONSOLE_URL)
  } catch (_) {
    // 降级：window.open 兜底
    window.open(YYAPI_CONSOLE_URL, '_blank')
  }
}

// 测试模型连通性(记录耗时和状态)
async function testModel(btn, state, providerKey, idx) {
  const provider = state.config.models.providers[providerKey]
  const model = provider.models[idx]
  const modelId = typeof model === 'string' ? model : model.id

  btn.disabled = true
  const origText = btn.textContent
  btn.textContent = t('models.testing')

  const start = Date.now()
  try {
    const reply = await api.testModel(provider.baseUrl, provider.apiKey || '', modelId, provider.api || 'openai-completions')
    const elapsed = Date.now() - start
    // 记录到模型对象
    if (typeof model === 'object') {
      model.latency = elapsed
      model.lastTestAt = Date.now()
      model.testStatus = 'ok'
      delete model.testError
    }
    // 包含 ⚠ 的是非致命错误(429 等),拆分显示
    if (reply.startsWith('⚠')) {
      const lines = reply.split('\n')
      const summary = lines[0]
      const detail = lines.slice(1).join('\n').trim()
      if (detail) {
        const detailHtml = detail.replace(/</g, '&lt;').replace(/(https?:\/\/[^\s，。;））'"&]+)/g, '<a href="$1" target="_blank" style="color:var(--primary);text-decoration:underline">$1</a>')
        toast(`<strong>${modelId}</strong> ${summary.replace(/</g, '&lt;')}<br><span style="font-size:11px;line-height:1.5;word-break:break-all">${detailHtml}</span>`, 'warning', { duration: 10000, html: true })
      } else {
        toast(`${modelId} ${summary}`, 'warning', { duration: 6000 })
      }
    } else {
      toast(t('models.testOk', { model: modelId, time: (elapsed / 1000).toFixed(1), reply: reply.slice(0, 50) }), 'success')
    }
  } catch (e) {
    const elapsed = Date.now() - start
    if (typeof model === 'object') {
      model.latency = null
      model.lastTestAt = Date.now()
      model.testStatus = 'fail'
      model.testError = String(e).slice(0, 200)
    }
    toast(t('models.testFail', { model: modelId, time: (elapsed / 1000).toFixed(1), error: e }), 'error', { duration: 8000 })
  } finally {
    btn.disabled = false
    btn.textContent = origText
    // 刷新卡片显示最新状态
    const page = btn.closest('.page')
    if (page) {
      renderProviders(page, state)
      renderDefaultBar(page, state)
    }
    // 持久化测试结果(仅保存,不重启 Gateway)
    saveConfigOnly(state)
  }
}
