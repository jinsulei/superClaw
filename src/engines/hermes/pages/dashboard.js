/**
 * Hermes Agent 仪表盘
 */
import { t } from '../../../lib/i18n.js'
import { api, ensureClaudeCodeStarted, isTauriRuntime } from '../../../lib/tauri-api.js'
import { switchEngine } from '../../../lib/engine-manager.js'
import { PRODUCT_DISPLAY_VERSION } from '../../../lib/product-version.js'
import { toast } from '../../../components/toast.js'
import {
  loadHermesProviders,
  inferProviderByBaseUrl,
} from '../lib/providers.js'

const ICONS = {
  running: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--success, #22c55e)" stroke-width="2.5" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>`,
  stopped: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--error, #ef4444)" stroke-width="2.5" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  cron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  config: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>`,
}

// Provider registry—异步加载，第一次 render 前填充
let hermesProviders = []

// Hermes 主模型 localStorage 持久化键名（与 OpenClaw 的 superclaw-primary-model 分离）
const STORAGE_HERMES_MODEL = 'hermes-primary-model'
function saveHermesPrimary(model) {
  try { localStorage.setItem(STORAGE_HERMES_MODEL, model) } catch {}
}
function loadHermesPrimary() {
  try { return localStorage.getItem(STORAGE_HERMES_MODEL) || '' } catch { return '' }
}

// Lazy Tauri event listen (avoid top-level await for vite build).
// Web 模式下 `@tauri-apps/api/event` 的模块顶层会触碰 `window.__TAURI_INTERNALS__.transformCallback`
// 导致 "Cannot read properties of undefined (reading 'transformCallback')"（issue #260），
// 因此非 Tauri 环境直接 noop。
let _listenFn = null
async function tauriListen(event, cb) {
  if (!isTauriRuntime()) return () => {}
  if (!_listenFn) {
    const mod = await import('@tauri-apps/api/event')
    _listenFn = mod.listen
  }
  return _listenFn(event, cb)
}

const HERMES_DASHBOARD_URL = 'http://127.0.0.1:9119/'
const YYAPI_BASE_URL = 'http://124.222.21.44:3002/v1'

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

/**
 * Open `url` in the user's system browser. Tauri desktop uses the shell
 * plugin (which respects `xdg-open` / `start` / `open`); Web mode uses
 * `window.open` with `noopener` to avoid tab-jacking. Errors propagate so
 * the caller can decide how to surface them — silent fallback hid real
 * scope/CSP errors and made "9119 打不开" hard to diagnose.
 */
async function openExternalUrl(url) {
  if (!url) return
  if (window.__TAURI_INTERNALS__) {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
    return
  }
  // Web 模式：打开用户浏览器中的新标签
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) throw new Error('popup blocked')
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page'
  // Scope the new Hermes-dense design system to this subtree only,
  // so OpenClaw and other engines stay completely unaffected.
  el.dataset.engine = 'hermes'

  let info = null
  let health = null
  let hermesConfig = null   // { model, base_url, provider, api_key }
  let models = []           // fetched model list
  let loading = true
  let actionBusy = false
  let modelBusy = false
  let fetchBusy = false
  let cfgMsg = ''           // 配置区消息 HTML
  let showDropdown = false  // 模型下拉是否展开
  let envDetecting = false  // 环境探测中
  let envData = null        // { wsl2: {...}, docker: {...} }
  let connectMode = 'local' // local | wsl2 | docker | custom
  let customGwUrl = ''      // 自定义 Gateway URL
  let connectMsg = ''       // 连接区消息
  let modelConfigCollapsed = true // 模型配置默认折叠
  let openclawStatus = null
  let claudeStatus = null
  let bridgeBusy = ''
  let bridgeMsg = ''
  let bridgeProgress = null

  // 表单状态（跨 draw 保持，不被覆盖）
  let formBaseUrl = ''
  let formApiKey = ''
  let formModel = ''
  let formInited = false    // 首次加载后用 hermesConfig 初始化

  function syncFormFromDom() {
    const u = el.querySelector('#hm-cfg-baseurl')
    const k = el.querySelector('#hm-cfg-apikey')
    const m = el.querySelector('#hm-cfg-model')
    if (u) formBaseUrl = u.value
    if (k) formApiKey = k.value
    if (m) formModel = m.value
  }

  function applyYyapiManagedFormGuard() {
    if (normalizeUrl(formBaseUrl || hermesConfig?.base_url) !== normalizeUrl(YYAPI_BASE_URL)) return false
    formBaseUrl = YYAPI_BASE_URL
    try {
      const yyapiKey = localStorage.getItem('superclaw_yyapi_key') || ''
      if (yyapiKey) formApiKey = yyapiKey
    } catch {}
    if (!formApiKey && hermesConfig?.api_key) formApiKey = hermesConfig.api_key
    return true
  }

  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') }

  function getOpenclawGatewayStatus(services) {
    return services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0] || null
  }

  function renderBridgeStatus(ok, text) {
    return `<span class="hm-dot hm-dot--${ok ? 'run' : 'stop'}"></span>${esc(text)}`
  }

  function setBridgeProgress(percent, label) {
    bridgeProgress = {
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      label: label || '',
    }
    draw()
  }

  function clearBridgeProgress() {
    bridgeProgress = null
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function runBridgeProgressStep(start, end, label, task) {
    setBridgeProgress(start, label)
    const startedAt = performance.now()
    const timer = setInterval(() => {
      const elapsed = performance.now() - startedAt
      const eased = 1 - Math.exp(-elapsed / 2400)
      setBridgeProgress(start + (end - start - 2) * eased, label)
    }, 240)

    try {
      const result = await task()
      setBridgeProgress(end, label)
      return result
    } finally {
      clearInterval(timer)
    }
  }

  // --- 终端命令 ---
  const isWin = navigator.platform?.startsWith('Win') || navigator.userAgent?.includes('Windows')
  const configPath = isWin ? '%USERPROFILE%\\.hermes' : '~/.hermes'

  const CLI_COMMANDS = [
    { label: t('engine.cliChat'),       desc: t('engine.cliChatDesc'),      cmd: 'hermes chat' },
    { label: t('engine.cliDoctor'),     desc: t('engine.cliDoctorDesc'),    cmd: 'hermes doctor' },
    { label: t('engine.cliVersion'),    desc: t('engine.cliVersionDesc'),   cmd: 'hermes version' },
    { label: t('engine.cliGwStart'),    desc: t('engine.cliGwStartDesc'),   cmd: 'hermes gateway run' },
    { label: t('engine.cliGwStop'),     desc: t('engine.cliGwStopDesc'),    cmd: 'hermes gateway stop' },
    { label: t('engine.cliUpgrade'),    desc: t('engine.cliUpgradeDesc'),   cmd: 'uv tool install --reinstall "hermes-agent @ git+https://github.com/NousResearch/hermes-agent.git" --python 3.11' },
    { label: t('engine.cliUninstall'),  desc: t('engine.cliUninstallDesc'), cmd: 'uv tool uninstall hermes-agent' },
    { label: t('engine.cliConfig'),     desc: t('engine.cliConfigDesc'),    cmd: isWin ? `explorer ${configPath}` : `open ${configPath}` },
  ]

  function renderCliCommands() {
    return CLI_COMMANDS.map((c, i) =>
      `<div class="hm-cli-row">
        <div class="hm-cli-info">
          <span class="hm-cli-label">${c.label}</span>
          <span class="hm-cli-desc">${c.desc}</span>
        </div>
        <div class="hm-cli-cmd-wrap">
          <code class="hm-cli-cmd">${esc(c.cmd)}</code>
          <button class="hm-cli-copy" data-cmd-idx="${i}" title="${t('common.copy')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
        </div>
      </div>`
    ).join('')
  }

  function draw() {
    // 加载骨架屏（data-dense style）
    if (loading) {
      el.innerHTML = `
        <div class="hm-hero">
          <div class="hm-hero-title">
            <div class="hm-hero-eyebrow">
              <span class="hm-dot hm-dot--idle"></span>
              ${t('engine.dashEyebrowLoading')}
            </div>
            <div class="hm-skel" style="width:240px;height:28px;margin-bottom:6px"></div>
            <div class="hm-skel" style="width:180px;height:14px"></div>
          </div>
        </div>
        <div class="hm-kpi-grid">
          ${[1,2,3,4,5].map(() => `
            <div class="hm-kpi">
              <div class="hm-skel" style="width:70%;height:10px;margin-bottom:10px"></div>
              <div class="hm-skel" style="width:50%;height:22px;margin-bottom:8px"></div>
              <div class="hm-skel" style="width:40%;height:10px"></div>
            </div>
          `).join('')}
        </div>
        <div class="hm-panel">
          <div class="hm-panel-header">
            <div class="hm-skel" style="width:120px;height:12px"></div>
          </div>
          <div class="hm-panel-body">
            <div class="hm-skel" style="width:100%;height:34px;margin-bottom:12px"></div>
            <div class="hm-skel" style="width:100%;height:34px"></div>
          </div>
        </div>
      `
      return
    }

    const gwRunning = info?.gatewayRunning
    const port = info?.gatewayPort || 8642
    const runtimeVersion = info?.version || '-'
    const version = PRODUCT_DISPLAY_VERSION
    const modelName = formModel || hermesConfig?.model || health?.model || info?.model || ''
    const displayModel = modelName || t('engine.dashNoModel')
    const openclawRunning = !!openclawStatus?.running
    const claudeConnected = !!claudeStatus?.connected || !!claudeStatus?.version
    const claudeVersion = claudeStatus?.version || 'Claude Code CLI'

    // 服务商高亮匹配
    const activePreset = inferProviderByBaseUrl(hermesProviders, formBaseUrl)
    const yyapiManaged = normalizeUrl(formBaseUrl || hermesConfig?.base_url) === normalizeUrl(YYAPI_BASE_URL)

    // 模型下拉 HTML（data-dense）
    const dropdownHtml = showDropdown && models.length
      ? `<div id="hm-model-dropdown" class="hm-dropdown">${models.map(m =>
          `<div class="hm-dropdown-item hm-model-opt ${m === formModel ? 'is-selected' : ''}" data-model="${esc(m)}">${esc(m)}</div>`
        ).join('')}</div>`
      : ''

    el.innerHTML = `
      <!-- Hero strip: dynamic colored bar + title + CTA + icon actions -->
      <div class="hm-hero" data-state="${gwRunning ? 'running' : 'stopped'}">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">
            <span class="hm-dot hm-dot--${gwRunning ? 'run' : 'stop'}"></span>
            ${gwRunning ? t('engine.dashEyebrowOnline') : t('engine.dashEyebrowOffline')}
          </div>
          <h1 class="hm-hero-h1">${t('engine.hermesDashboardTitle')}</h1>
          <div class="hm-hero-sub">127.0.0.1:${port} · ${esc(displayModel || '—')} · ${esc(version)}</div>
        </div>
        <div class="hm-hero-actions">
          ${!gwRunning ? `<button class="hm-btn hm-btn--cta hm-dash-start" ${actionBusy ? 'disabled' : ''}>▶ ${actionBusy ? t('engine.gatewayStarting') : t('engine.dashStartGw')}</button>` : ''}
          ${gwRunning ? `<button class="hm-btn hm-btn--danger hm-dash-stop" ${actionBusy ? 'disabled' : ''}>■ ${actionBusy ? t('engine.dashStopping') : t('engine.dashStopGw')}</button>` : ''}
          ${gwRunning ? `<button class="hm-btn hm-dash-restart" ${actionBusy ? 'disabled' : ''}>↻ ${actionBusy ? t('engine.dashRestarting') : t('engine.dashRestartGw')}</button>` : ''}
          <button class="hm-btn hm-btn--icon hm-dash-refresh" title="${t('engine.dashRefresh')}">${ICONS.refresh}</button>
        </div>
      </div>

      <!-- KPI grid: 5 cards with tone indicators -->
      <div class="hm-kpi-grid">
        <div class="hm-kpi" data-tone="${gwRunning ? 'success' : 'error'}">
          <div class="hm-kpi-label">${t('engine.dashGatewayStatus')}</div>
          <div class="hm-kpi-value" style="font-size:15px">
            <span class="hm-dot hm-dot--${gwRunning ? 'run' : 'stop'}"></span>
            ${gwRunning ? t('engine.dashRunning') : t('engine.dashStopped')}
          </div>
          <div class="hm-kpi-foot">${t('engine.dashPort')} <span style="color:var(--hm-text-secondary)">:${port}</span></div>
        </div>
        <div class="hm-kpi" data-tone="accent">
          <div class="hm-kpi-label">${t('engine.dashModel')}</div>
          <div class="hm-kpi-value" style="font-size:13px;word-break:break-all">${esc(displayModel)}</div>
          <div class="hm-kpi-foot">${t('engine.dashProvider')} <code class="hm-code" style="padding:0 5px;font-size:10px">${esc(hermesConfig?.provider || activePreset?.id || '—')}</code></div>
        </div>
        <div class="hm-kpi">
          <div class="hm-kpi-label">${t('engine.dashVersion')}</div>
          <div class="hm-kpi-value">${esc(version)}</div>
          <div class="hm-kpi-foot"><span class="hm-badge hm-badge--accent" title="Hermes runtime v${esc(runtimeVersion)}">uv-tool</span></div>
        </div>
        <div class="hm-kpi">
          <div class="hm-kpi-label">${t('engine.dashApiEndpoint')}</div>
          <div class="hm-kpi-value" style="font-size:13px">127.0.0.1</div>
          <div class="hm-kpi-foot"><code class="hm-code" style="padding:0 5px;font-size:10.5px">:${port}/v1</code></div>
        </div>
        <div class="hm-kpi hm-kpi--link hm-dash-open-panel" data-tone="accent">
          <div class="hm-kpi-label">
            ${t('engine.dashOpenPanel')}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" style="opacity:.7"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </div>
          <div class="hm-kpi-value" style="font-size:13px">${t('engine.dashOpenPanelDesc')}</div>
          <div class="hm-kpi-foot">${t('engine.dashOpenChat')}</div>
        </div>
      </div>

      <div class="hm-panel">
        <div class="hm-panel-header">
          <div class="hm-panel-title">
            <svg class="hm-panel-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            三方工作台
          </div>
          <div class="hm-panel-actions">
            <button class="hm-btn hm-btn--ghost hm-btn--sm hm-bridge-refresh" ${bridgeBusy ? 'disabled' : ''}>刷新</button>
            <button class="hm-btn hm-btn--primary hm-btn--sm hm-bridge-open-all" ${bridgeBusy ? 'disabled' : ''}>${bridgeBusy === 'all' ? '接通中...' : '全部接通'}</button>
          </div>
        </div>
        <div class="hm-panel-body">
          <div class="hm-kpi-grid hm-bridge-grid" style="margin-bottom:12px">
            <button class="hm-kpi hm-kpi--link hm-dash-link" data-route="/h/chat" data-tone="${gwRunning ? 'success' : 'error'}" style="text-align:left;font-family:inherit;color:inherit;cursor:pointer">
              <div class="hm-kpi-label">Hermes 主脑</div>
              <div class="hm-kpi-value" style="font-size:14px">${renderBridgeStatus(gwRunning, gwRunning ? '已启动' : '未启动')}</div>
              <div class="hm-kpi-foot">进入 Hermes 聊天和调度中心</div>
            </button>
            <button class="hm-kpi hm-kpi--link hm-bridge-openclaw" data-tone="${openclawRunning ? 'success' : 'warn'}" style="text-align:left;font-family:inherit;color:inherit;cursor:pointer" ${bridgeBusy ? 'disabled' : ''}>
              <div class="hm-kpi-label">OpenClaw 通道</div>
              <div class="hm-kpi-value" style="font-size:14px">${renderBridgeStatus(openclawRunning, openclawRunning ? `在线 · ${openclawStatus?.pid || 'pid?'}` : '点击一键启动')}</div>
              <div class="hm-kpi-foot">${openclawRunning ? '打开 OpenClaw 聊天' : '启动 Gateway 后进入聊天'}</div>
            </button>
            <button class="hm-kpi hm-kpi--link hm-bridge-claude" data-tone="${claudeConnected ? 'success' : 'warn'}" style="text-align:left;font-family:inherit;color:inherit;cursor:pointer" ${bridgeBusy ? 'disabled' : ''}>
              <div class="hm-kpi-label">CloudCode / Claude Code</div>
              <div class="hm-kpi-value" style="font-size:14px">${renderBridgeStatus(claudeConnected, claudeConnected ? 'CLI 已接通' : '点击一键接通')}</div>
              <div class="hm-kpi-foot">${esc(claudeConnected ? claudeVersion : (claudeStatus?.versionError || '便携 CLI 检测'))}</div>
            </button>
          </div>
          <div class="hm-muted" id="hm-bridge-msg" style="min-height:16px">${bridgeMsg}</div>
          ${bridgeProgress ? `
            <div class="hm-bridge-progress" role="status" aria-live="polite">
              <div class="hm-bridge-progress-head">
                <span>${esc(bridgeProgress.label || '正在准备 OpenClaw')}</span>
                <strong>${bridgeProgress.percent}%</strong>
              </div>
              <div class="hm-bridge-progress-track">
                <span style="width:${bridgeProgress.percent}%"></span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!--<div class="hm-native-dashboard-hint">
        <span>${t('engine.dashNativePanelDesc')}</span>
        <button class="hm-native-dashboard-link hm-dash-open-native" data-href="${HERMES_DASHBOARD_URL}">
          ${t('engine.dashNativePanelOpen')}
        </button>
      </div>-->

      <!-- Model config panel (collapsible). hm-panel--allow-overflow lets the model dropdown escape the panel overflow:hidden clip (issue #260). -->
      <div class="hm-panel hm-panel--allow-overflow">
        <div class="hm-panel-header hm-panel-header--toggle hm-cfg-toggle ${modelConfigCollapsed ? '' : 'is-open'}">
          <div class="hm-panel-title">
            <svg class="hm-panel-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"/></svg>
            ${t('engine.dashModelConfig')}
            <!--<span class="hm-panel-title-count">${hermesProviders.filter(p => p.id !== 'custom').length}</span>-->
          </div>
          <div class="hm-panel-actions">
            <svg class="hm-panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
        ${!modelConfigCollapsed ? `
        <div class="hm-panel-body">
          <!--<div class="hm-field-label" style="margin-bottom:10px">${t('engine.dashProviderPresets')}</div>-->
          <!--<div class="hm-pills" style="margin-bottom:18px">
            ${hermesProviders.filter(p => p.id !== 'custom').map(p => {
              const api = p.transport === 'anthropic_messages' ? 'anthropic-messages'
                : p.transport === 'google_gemini' ? 'google-generative-ai'
                : 'openai-completions'
              const active = activePreset?.id === p.id
              return `<button class="hm-pill hm-preset-btn ${active ? 'is-active' : ''}" data-key="${p.id}" data-url="${esc(p.baseUrl)}" data-api="${api}">${esc(p.name)}</button>`
            }).join('')}
          </div>-->
          <div class="hm-field-row">
            <label class="hm-field">
              <span class="hm-field-label">${t('engine.dashApiBaseUrl')}</span>
              <input type="text" id="hm-cfg-baseurl" class="hm-input" value="${esc(formBaseUrl)}" placeholder="https://api.minimaxi.com/v1" ${yyapiManaged ? 'readonly aria-readonly="true"' : ''}>
            </label>
            <label class="hm-field">
              <span class="hm-field-label">${t('engine.dashApiKey')}</span>
              <input type="password" id="hm-cfg-apikey" class="hm-input" value="${esc(formApiKey)}" placeholder="sk-…" ${yyapiManaged ? 'readonly aria-readonly="true"' : ''}>
            </label>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-end;margin-top:12px">
            <label class="hm-field" style="flex:1">
              <span class="hm-field-label">${t('engine.configModel')}</span>
              <div style="position:relative">
                <input type="text" id="hm-cfg-model" class="hm-input" value="${esc(formModel)}" placeholder="MiniMax-M2.7-highspeed">
                ${dropdownHtml}
              </div>
            </label>
            <button class="hm-btn hm-btn--sm hm-fetch-models" ${fetchBusy ? 'disabled' : ''}>${fetchBusy ? t('engine.configFetching') : t('engine.configFetchModels')}</button>
          </div>
          <div id="hm-cfg-msg" class="hm-muted" style="min-height:16px;margin:12px 0 6px">${cfgMsg}</div>
          <div class="hm-stack">
            <button class="hm-btn hm-btn--primary hm-btn--sm hm-save-model" ${modelBusy ? 'disabled' : ''}>${modelBusy ? '...' : t('engine.configSaveBtn')}</button>
            <span class="hm-spacer"></span>
            <a href="#/h/env" class="hm-btn hm-btn--ghost hm-btn--sm" title="${t('engine.dashEnvAdvancedEdit')}">${t('engine.dashEnvAdvancedEdit')}</a>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Gateway message line (actions moved to Hero bar) -->
      <div id="hm-dash-msg" class="hm-muted" style="min-height:14px;margin:-6px 4px 12px;font-size:11px"></div>

      <!-- Connection target panel -->
      <div class="hm-panel">
        <div class="hm-panel-header">
          <div class="hm-panel-title">
            <svg class="hm-panel-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
            ${t('engine.dashConnectTarget')}
          </div>
          <div class="hm-panel-actions">
            <button class="hm-btn hm-btn--ghost hm-btn--sm hm-detect-env" ${envDetecting ? 'disabled' : ''}>${envDetecting ? t('engine.dashDetecting') : '↻ ' + t('engine.dashDetectEnv')}</button>
          </div>
        </div>
        <div class="hm-panel-body hm-panel-body--tight">
          <div class="hm-pills" style="margin-bottom:12px">
            <button class="hm-pill hm-connect-mode ${connectMode === 'local' ? 'is-active' : ''}" data-mode="local">${t('engine.dashConnLocal')} · 127.0.0.1</button>
            ${envData?.wsl2?.available ? `<button class="hm-pill hm-connect-mode ${connectMode === 'wsl2' ? 'is-active' : ''}" data-mode="wsl2">${t('engine.dashConnWsl2')}${envData.wsl2.gatewayRunning ? ' ✓' : envData.wsl2.hermesInstalled ? ' !' : ''}</button>` : envData?.wsl2?.wslNoDistros ? `<button class="hm-pill hm-connect-mode" disabled style="opacity:0.5;cursor:not-allowed" title="${esc(t('engine.dashWslNoDistros') || '')}">${t('engine.dashConnWsl2')} ⚠</button>` : ''}
            ${envData?.docker?.available ? `<button class="hm-pill hm-connect-mode ${connectMode === 'docker' ? 'is-active' : ''}" data-mode="docker">${t('engine.dashConnDocker')}${envData.docker.hermesContainers?.length ? ' ✓' : ''}</button>` : ''}
            <button class="hm-pill hm-connect-mode ${connectMode === 'custom' ? 'is-active' : ''}" data-mode="custom">${t('engine.dashConnCustom')}</button>
          </div>

          ${connectMode === 'wsl2' && envData?.wsl2 ? `
            <div class="hm-term" style="margin-bottom:12px">
              <span class="hm-muted">$ wsl --status</span><br>
              ${envData.wsl2.wslNoDistros ? `
                <span style="color:var(--hm-warn)">⚠ ${esc(t('engine.dashWslNoDistros') || '')}</span><br>
                <span style="color:var(--hm-warn);font-size:11px">${esc(t('engine.dashWslInstallHint') || '')}</span>
              ` : `
                IP <span style="color:var(--hm-accent)">${esc(envData.wsl2.ip || '-')}</span> · distros [${(envData.wsl2.distros || []).join(', ')}]<br>
                ${envData.wsl2.hermesInstalled ? `<span style="color:var(--hm-cta)">✓ hermes ${esc(envData.wsl2.hermesInfo || '')}</span>` : `<span style="color:var(--hm-warn)">! ${t('engine.dashHermesMissing')}</span>`}<br>
                ${envData.wsl2.gatewayRunning ? `<span style="color:var(--hm-cta)">✓ gateway: ${esc(envData.wsl2.gatewayUrl || '')}</span>` : `<span class="hm-muted">${t('engine.dashGatewayNotRunning')}</span>`}
              `}
            </div>
          ` : ''}
          ${connectMode === 'docker' && envData?.docker ? `
            <div class="hm-term" style="margin-bottom:12px">
              <span class="hm-muted">$ docker ps --filter ancestor=hermes</span><br>
              engine <span style="color:var(--hm-accent)">${esc(envData.docker.version || '')}</span><br>
              ${envData.docker.hermesContainers?.length ? envData.docker.hermesContainers.map(c =>
                `<span style="color:var(--hm-cta)">▶</span> <code>${esc(c.name)}</code> (${esc(c.image)}) ${esc(c.ports)}`
              ).join('<br>') : `<span class="hm-muted">${t('engine.dashNoHermesContainers')}</span>`}
            </div>
          ` : ''}
          ${connectMode === 'custom' ? `
            <div style="margin-bottom:12px">
              <input type="text" id="hm-custom-gw-url" class="hm-input" value="${esc(customGwUrl)}" placeholder="http://192.168.1.100:8642">
            </div>
          ` : ''}

          <div class="hm-stack">
            <button class="hm-btn hm-btn--primary hm-btn--sm hm-apply-connect">${t('engine.dashConnApply')}</button>
            <span id="hm-connect-msg" class="hm-muted">${connectMsg}</span>
          </div>
        </div>
      </div>

      <!-- Terminal environment status -->
      ${envData ? `
      <div class="hm-panel">
        <div class="hm-panel-header">
          <div class="hm-panel-title">
            <svg class="hm-panel-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            ${t('engine.extraPty')}
          </div>
        </div>
        <div class="hm-panel-body hm-panel-body--tight">
          ${envData.wsl2?.available ? `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="color:var(--hm-cta)">●</span>
              <span>WSL2 · ${esc((envData.wsl2.distros || []).join(', '))}</span>
            </div>
          ` : envData.wsl2?.wslNoDistros && envData.portable?.available ? `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="color:var(--hm-cta)">●</span>
              <span>${t('engine.dashPortableMode')}</span>
              <span style="color:var(--text-secondary);font-size:11px">
                ${envData.portable.hasBash ? `${t('engine.dashPortableBash')} ${t('engine.dashPortableReady')} ·` : ''}
                ${envData.portable.hasRg ? `${t('engine.dashPortableRg')} ${t('engine.dashPortableReady')}` : ''}
              </span>
            </div>
          ` : envData.wsl2?.wslNoDistros && !envData.portable?.available ? `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="color:var(--hm-warn)">●</span>
              <span style="color:var(--hm-warn)">${t('engine.dashPortableUnavailable')}</span>
              <span style="color:var(--text-secondary);font-size:11px">${t('engine.dashWslInstallHint')}</span>
            </div>
          ` : envData.wsl2?.available === false && !envData.wsl2?.wslNoDistros && envData.portable?.available ? `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="color:var(--hm-cta)">●</span>
              <span>${t('engine.dashPortableMode')}</span>
              <span style="color:var(--text-secondary);font-size:11px">
                ${envData.portable.hasBash ? `${t('engine.dashPortableBash')} ${t('engine.dashPortableReady')} ·` : ''}
                ${envData.portable.hasRg ? `${t('engine.dashPortableRg')} ${t('engine.dashPortableReady')}` : ''}
              </span>
            </div>
          ` : ''}
        </div>
      </div>
      ` : ''}

      <!-- Quick actions -->
      <div class="hm-field-label" style="margin:8px 2px 10px">${t('engine.dashQuickActions')}</div>
      <div class="hm-kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        <button class="hm-kpi hm-kpi--link hm-dash-link" data-route="/h/chat" data-tone="accent" style="text-align:left;font-family:inherit;color:inherit;cursor:pointer">
          <div class="hm-kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            ${t('engine.dashOpenChat')}
          </div>
          <div class="hm-kpi-value" style="font-size:13px">${t('engine.dashOpenChat')}</div>
          <div class="hm-kpi-foot">${t('engine.dashInteractiveSession')}</div>
        </button>
        <!--<button class="hm-kpi hm-kpi--link hm-dash-link" data-route="/h/setup" data-tone="accent" style="text-align:left;font-family:inherit;color:inherit;cursor:pointer">
          <div class="hm-kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6"/></svg>
            ${t('engine.dashOpenSetup')}
          </div>
          <div class="hm-kpi-value" style="font-size:13px">${t('engine.dashOpenSetup')}</div>
          <div class="hm-kpi-foot">${t('engine.dashInstallerWizard')}</div>
        </button>-->
        <button class="hm-kpi hm-kpi--link hm-dash-link" data-route="/h/logs" data-tone="info" style="text-align:left;font-family:inherit;color:inherit;cursor:pointer">
          <div class="hm-kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${t('engine.servicesOpenLogs')}
          </div>
          <div class="hm-kpi-value" style="font-size:13px">gateway.log</div>
          <div class="hm-kpi-foot">${t('engine.dashLogsFoot')}</div>
        </button>
        <button class="hm-kpi hm-kpi--link hm-dash-link" data-route="/h/env" data-tone="warn" style="text-align:left;font-family:inherit;color:inherit;cursor:pointer">
          <div class="hm-kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            .ENV
          </div>
          <div class="hm-kpi-value" style="font-size:13px">${t('engine.dashAdvancedEdit')}</div>
          <div class="hm-kpi-foot">${t('engine.dashCustomVars')}</div>
        </button>
      </div>

      <!-- CLI reference as data table -->
      <!--<div class="hm-panel">
        <div class="hm-panel-header">
          <div class="hm-panel-title">
            <svg class="hm-panel-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            ${t('engine.dashCliTitle')}
            <span class="hm-panel-title-count">${CLI_COMMANDS.length}</span>
          </div>
          <div class="hm-panel-actions">
            <span class="hm-muted">${t('engine.dashCliDesc')}</span>
          </div>
        </div>
        <div class="hm-panel-body hm-panel-body--none">
          <table class="hm-table">
            <thead>
              <tr>
                <th style="width:38%">${t('engine.dashCliCommand')}</th>
                <th>${t('engine.dashCliDescription')}</th>
                <th style="width:48px;text-align:center">${t('engine.dashCliCopy')}</th>
              </tr>
            </thead>
            <tbody>
              ${CLI_COMMANDS.map((c, i) => `
                <tr>
                  <td><code class="hm-code">${esc(c.cmd)}</code></td>
                  <td>
                    <div style="color:var(--hm-text-primary);font-family:var(--hm-font-sans);font-size:12px;font-weight:500;margin-bottom:2px">${c.label}</div>
                    <div class="hm-muted">${c.desc}</div>
                  </td>
                  <td style="text-align:center">
                    <button class="hm-btn hm-btn--icon hm-cli-copy" data-cmd-idx="${i}" title="${t('common.copy')}">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>-->
    `
    bind()
  }

  function bind() {
    el.querySelector('.hm-dash-refresh')?.addEventListener('click', refresh)
    // 模型配置折叠/展开
    el.querySelector('.hm-cfg-toggle')?.addEventListener('click', () => {
      syncFormFromDom()
      modelConfigCollapsed = !modelConfigCollapsed
      draw()
    })
    // Gateway actions
    el.querySelector('.hm-dash-start')?.addEventListener('click', async () => {
      actionBusy = true; draw()
      showGwMsg(t('engine.gatewayStarting'), false)
      try {
        const result = await api.hermesGatewayAction('start')
        showGwMsg(result || t('engine.dashGatewayStarted'), false)
      } catch (e) {
        showGwMsg(String(e).replace(/^Error:\s*/, ''), true)
      }
      actionBusy = false; await refresh()
    })
    el.querySelector('.hm-dash-stop')?.addEventListener('click', async () => {
      actionBusy = true; draw()
      try { await api.hermesGatewayAction('stop') } catch (e) { showGwMsg(String(e).replace(/^Error:\s*/, ''), true) }
      actionBusy = false; await refresh()
    })
    el.querySelector('.hm-dash-restart')?.addEventListener('click', async () => {
      actionBusy = true; draw()
      try { await api.hermesGatewayAction('stop') } catch (_) { /* ignore stop failure on Windows */ }
      await new Promise(r => setTimeout(r, 1500))
      try {
        await api.hermesGatewayAction('start')
      } catch (e) { showGwMsg(String(e).replace(/^Error:\s*/, ''), true) }
      actionBusy = false; await refresh()
    })
    // Quick links
    el.querySelectorAll('.hm-dash-link').forEach(btn => {
      btn.addEventListener('click', () => { window.location.hash = '#' + btn.dataset.route })
    })
    el.querySelector('.hm-bridge-refresh')?.addEventListener('click', async () => {
      bridgeBusy = 'refresh'
      bridgeMsg = '<span style="color:var(--hm-accent)">正在刷新三方状态...</span>'
      draw()
      await refresh()
      bridgeBusy = ''
      bridgeMsg = '<span style="color:var(--hm-success)">三方状态已刷新。</span>'
      draw()
    })
    el.querySelector('.hm-bridge-openclaw')?.addEventListener('click', doOpenClawBridge)
    el.querySelector('.hm-bridge-claude')?.addEventListener('click', doConnectClaudeBridge)
    el.querySelector('.hm-bridge-open-all')?.addEventListener('click', doOpenAllBridge)
    // Open panel card
    el.querySelector('.hm-dash-open-panel')?.addEventListener('click', () => { window.location.hash = '#/h/chat' })
    // Open Hermes native dashboard in system browser
    // 流程：Probe → 没起就 auto-start → start 失败再看是否依赖缺失走安装流程
    el.querySelector('.hm-dash-open-native')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget
      const href = btn.dataset.href
      if (!href) return
      const origText = btn.textContent
      btn.disabled = true
      btn.textContent = t('engine.dashNativePanelChecking')

      const tryOpen = async (port) => {
        const url = href.replace(/:9119(\/?$)/, ':' + port + '$1')
        await openExternalUrl(url)
      }

      // 共用：调用 hermesDashboardStart，带"首次启动"提示，端口起来后开浏览器
      // 返回 { ok, kind?, port, log_tail? } —— ok=true 时已经打开浏览器
      const startAndOpen = async () => {
        btn.textContent = t('engine.dashNativePanelStarting')
        // 首次启动可能慢（Hermes 会跑 npm build 构建前端），给用户一个 toast 安抚
        let firstHintTimer = null
        const showFirstHint = async () => {
          const { toast } = await import('../../../components/toast.js')
          toast(t('engine.dashNativePanelStartFirstHint'), 'info', { duration: 8000 })
        }
        firstHintTimer = setTimeout(showFirstHint, 5000)
        try {
          const result = await api.hermesDashboardStart().catch((err) => ({
            started: false, kind: 'spawn_failed', port: 9119,
            log_tail: String(err?.message || err),
          }))
          if (result?.started) {
            try {
              await tryOpen(result.port || 9119)
              return { ok: true, ...result }
            } catch (err) {
              const { toast } = await import('../../../components/toast.js')
              toast(t('engine.dashNativePanelOpenFail') + ': ' + (err?.message || err), 'error')
              return { ok: false, kind: 'open_failed', ...result }
            }
          }
          return { ok: false, ...(result || {}) }
        } finally {
          if (firstHintTimer) clearTimeout(firstHintTimer)
        }
      }

      try {
        const probe = await api.hermesDashboardProbe().catch(() => ({ running: false, port: 9119 }))
        if (probe?.running) {
          await tryOpen(probe.port || 9119)
          return
        }

        // 自动启动 Dashboard
        const startResult = await startAndOpen()
        if (startResult.ok) return

        // 启动失败，按 kind 分发
        const port = startResult.port || probe?.port || 9119
        const { toast } = await import('../../../components/toast.js')

        if (startResult.kind === 'timeout') {
          toast(t('engine.dashNativePanelStartTimeout', { port }), 'warning', { duration: 6000 })
          return
        }
        if (startResult.kind === 'port_in_use') {
          toast(t('engine.dashNativePanelStartPortBusy', { port }), 'warning', { duration: 6000 })
          return
        }
        if (startResult.kind === 'posix_only_module') {
          // Hermes Agent 上游 bug：pty_bridge.py / memory_tool.py 在 Windows 上 import fcntl 等 POSIX-only 模块
          // 见 https://github.com/NousResearch/hermes-agent/issues/5246
          // 没办法在前端绕过——只能告诉用户原因和替代方案
          const { showContentModal } = await import('../../../components/modal.js')
          const m = showContentModal({
            title: t('engine.dashNativePanelWindowsTitle'),
            width: 580,
            content: `
              <p style="margin:0 0 14px;line-height:1.6;color:var(--text-secondary)">
                ${t('engine.dashNativePanelWindowsDesc')}
              </p>
              <ul style="margin:0 0 12px 20px;padding:0;line-height:1.7;color:var(--text-primary)">
                <li>${t('engine.dashNativePanelWindowsAlt1')}</li>
                <li>${t('engine.dashNativePanelWindowsAlt2')}</li>
              </ul>
              <pre style="margin:0;padding:10px 12px;background:var(--surface-2,#f5f5f4);border:1px solid var(--border,#e5e5e5);border-radius:6px;font-family:var(--hm-font-mono,monospace);font-size:11px;color:var(--text-tertiary,#888);max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-all">${(startResult.log_tail || '').split('\n').slice(-6).join('\n').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c])}</pre>
            `,
            buttons: [
              { label: t('engine.dashNativePanelWindowsReportLink'), className: 'btn btn-secondary btn-sm', id: 'hm-dash-issue-link' },
            ],
          })
          m.querySelector('#hm-dash-issue-link')?.addEventListener('click', async () => {
            try { await openExternalUrl('https://github.com/NousResearch/hermes-agent/issues/5246') }
            catch {}
          })
          return
        }
        if (startResult.kind !== 'deps_missing') {
          // spawn_failed / 其他未知 → 显示日志尾部摘要
          const detail = (startResult.log_tail || '').split('\n').slice(-3).join('\n').trim()
          toast(t('engine.dashNativePanelStartGeneric') + (detail ? ': ' + detail : ''), 'error', { duration: 8000 })
          return
        }

        // —— 依赖缺失（fastapi/uvicorn）：弹安装引导 modal ——
        const { showContentModal, showUpgradeModal } = await import('../../../components/modal.js')
        const overlay = showContentModal({
          title: t('engine.dashNativePanelDownTitle'),
          width: 560,
          content: `
            <p style="margin:0 0 10px;line-height:1.6;color:var(--text-secondary)">
              ${t('engine.dashNativePanelDepHint')}
            </p>
            <pre style="margin:0 0 12px;padding:12px 14px;background:var(--surface-2,#f5f5f4);border:1px solid var(--border,#e5e5e5);border-radius:6px;font-family:var(--hm-font-mono,monospace);font-size:13px;color:var(--text-primary);user-select:all;white-space:pre-wrap;word-break:break-all"><code>uv tool install --force 'hermes-agent[web] @ git+https://github.com/NousResearch/hermes-agent.git'</code></pre>
            <p style="margin:0;font-size:12px;color:var(--text-tertiary,#999);line-height:1.6">
              ${t('engine.dashNativePanelDown', { port })}
            </p>
          `,
          buttons: [
            { label: t('common.copy') || 'Copy', className: 'btn btn-secondary btn-sm', id: 'hm-dash-copy-cmd' },
            { label: t('common.retry') || 'Retry', className: 'btn btn-secondary btn-sm', id: 'hm-dash-retry' },
            { label: t('engine.dashNativePanelInstallWeb'), className: 'btn btn-primary btn-sm', id: 'hm-dash-install-web' },
          ],
        })
        overlay.querySelector('#hm-dash-copy-cmd')?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(`uv tool install --force 'hermes-agent[web] @ git+https://github.com/NousResearch/hermes-agent.git'`)
            toast(t('common.copied') || 'Copied', 'success')
          } catch {}
        })
        overlay.querySelector('#hm-dash-retry')?.addEventListener('click', async () => {
          // 重试：先 probe，再 auto-start
          overlay.close()
          const retryProbe = await api.hermesDashboardProbe().catch(() => ({ running: false, port }))
          if (retryProbe?.running) {
            try { await tryOpen(retryProbe.port || port) }
            catch (err) { toast(t('engine.dashNativePanelOpenFail') + ': ' + (err?.message || err), 'error') }
            return
          }
          const r = await startAndOpen()
          if (!r.ok) {
            toast(t('engine.dashNativePanelDown', { port: r.port || port }), 'warning')
          }
        })
        overlay.querySelector('#hm-dash-install-web')?.addEventListener('click', async () => {
          overlay.close()
          // 进度 modal 复用现有 showUpgradeModal（已有日志窗 + 进度条 + 任务栏最小化）
          const um = showUpgradeModal(t('engine.dashNativePanelInstallWebTitle'))
          um.setProgressLabels({
            preparing: t('engine.dashNativePanelInstallWebTitle'),
            downloading: t('engine.dashNativePanelInstallWebTitle'),
            installing: t('engine.dashNativePanelInstallWebTitle'),
            done: t('engine.dashNativePanelInstallWebDone'),
          })
          let unlisten = null
          // Gateway 是否运行 → 装前停、装后重启。Windows 下 uv 无法覆盖被占用的
          // ~/.local/bin/hermes.exe（os error 32），所以必须先释放文件锁。
          let gatewayWasRunning = false
          try {
            await api.hermesHealthCheck()
            gatewayWasRunning = true
          } catch { /* gateway not running, no pre-stop needed */ }

          let installOk = false
          try {
            if (window.__TAURI_INTERNALS__) {
              const { listen } = await import('@tauri-apps/api/event')
              const u1 = await listen('hermes-install-log', (ev) => um.appendLog(String(ev.payload)))
              const u2 = await listen('hermes-install-progress', (ev) => um.setProgress(Number(ev.payload) || 0))
              unlisten = () => { u1(); u2() }
            }

            if (gatewayWasRunning) {
              um.appendLog(t('engine.dashNativePanelInstallStoppingGw'))
              try {
                await api.hermesGatewayAction('stop')
                await new Promise(r => setTimeout(r, 800))
                um.appendLog(t('engine.dashNativePanelInstallGwStopped'))
              } catch (err) {
                um.appendLog(t('engine.dashNativePanelInstallGwWarn') + ': ' + (err?.message || err))
              }
            }

            await api.installHermes('uv-tool', ['web'])
            um.setDone(t('engine.dashNativePanelInstallWebDone'))
            installOk = true
          } catch (err) {
            const msg = String(err?.message || err).replace(/^Error:\s*/, '')
            um.setError(t('engine.dashNativePanelInstallWebFailed') + ': ' + msg)
          } finally {
            if (unlisten) { unlisten() }
            if (gatewayWasRunning) {
              um.appendLog(t('engine.dashNativePanelInstallRestartingGw'))
              try {
                await api.hermesGatewayAction('start')
                um.appendLog(t('engine.dashNativePanelInstallGwRestarted'))
              } catch (err) {
                um.appendLog(t('engine.dashNativePanelInstallGwWarn') + ': ' + (err?.message || err))
              }
            }
          }

          // 安装成功 → 自动启动 dashboard 并打开浏览器，省去用户跑命令的步骤
          if (installOk) {
            um.appendLog('')
            um.appendLog('▶ ' + t('engine.dashNativePanelStarting'))
            const startRes = await api.hermesDashboardStart().catch((err) => ({
              started: false, kind: 'spawn_failed',
              log_tail: String(err?.message || err),
            }))
            if (startRes?.started) {
              um.appendLog('✓ Dashboard @ 127.0.0.1:' + (startRes.port || port))
              try {
                await tryOpen(startRes.port || port)
              } catch (err) {
                um.appendLog('⚠ ' + t('engine.dashNativePanelOpenFail') + ': ' + (err?.message || err))
              }
            } else {
              const detail = (startRes?.log_tail || '').split('\n').slice(-3).join('\n').trim()
              um.appendLog('⚠ ' + t('engine.dashNativePanelStartGeneric') + (detail ? ': ' + detail : ''))
            }
          }
        })
      } catch (err) {
        const { toast } = await import('../../../components/toast.js')
        toast(t('engine.dashNativePanelOpenFail') + ': ' + (err?.message || err), 'error')
      } finally {
        btn.disabled = false
        btn.textContent = origText
      }
    })
    // Provider presets — 点击填充 URL
    el.querySelectorAll('.hm-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        formBaseUrl = btn.dataset.url
        draw()
      })
    })
    // Fetch models — 通过 Rust 后端代理获取（避免 CORS）
    el.querySelector('.hm-fetch-models')?.addEventListener('click', doFetchModels)
    // Model dropdown click
    el.querySelectorAll('.hm-model-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        formModel = opt.dataset.model
        showDropdown = false
        draw()
      })
    })
    // 输入框聚焦时展开已获取的下拉
    el.querySelector('#hm-cfg-model')?.addEventListener('focus', () => {
      if (models.length) { showDropdown = true; syncFormFromDom(); draw() }
    })
    // 点击外部收起下拉
    el.addEventListener('click', (e) => {
      if (showDropdown && !e.target.closest('#hm-cfg-model') && !e.target.closest('#hm-model-dropdown') && !e.target.closest('.hm-fetch-models')) {
        showDropdown = false; syncFormFromDom(); draw()
      }
    })
    // Save model config
    el.querySelector('.hm-save-model')?.addEventListener('click', doSaveModel)
    // --- 连接目标 ---
    el.querySelector('.hm-detect-env')?.addEventListener('click', doDetectEnv)
    el.querySelectorAll('.hm-connect-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        connectMode = btn.dataset.mode
        // WSL2 选中时自动填充 URL
        if (connectMode === 'wsl2' && envData?.wsl2?.gatewayUrl) {
          customGwUrl = envData.wsl2.gatewayUrl
        }
        syncFormFromDom(); draw()
      })
    })
    el.querySelector('.hm-apply-connect')?.addEventListener('click', doApplyConnect)
    // CLI copy buttons
    el.querySelectorAll('.hm-cli-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.cmdIdx)
        const cmd = CLI_COMMANDS[idx]?.cmd
        if (!cmd) return
        navigator.clipboard.writeText(cmd).then(() => {
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--success, #22c55e)" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>'
          setTimeout(() => {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'
          }, 1500)
        }).catch(() => {})
      })
    })
  }

  async function doFetchModels() {
    syncFormFromDom()
    const yyapiManaged = applyYyapiManagedFormGuard()
    if (!formBaseUrl) { cfgMsg = `<span style="color:var(--warning)">${t('engine.configFetchNeedUrl')}</span>`; draw(); return }
    if (!formApiKey) { cfgMsg = `<span style="color:var(--warning)">${t('engine.configFetchNeedKey')}</span>`; draw(); return }

    const matched = inferProviderByBaseUrl(hermesProviders, formBaseUrl)
    const apiType = matched
      ? (matched.transport === 'anthropic_messages' ? 'anthropic-messages'
        : matched.transport === 'google_gemini' ? 'google-generative-ai'
        : 'openai-completions')
      : 'openai-completions'
    const nextApiType = yyapiManaged ? 'openai-completions' : apiType

    fetchBusy = true; cfgMsg = ''; draw()
    try {
      const fetchedModels = await api.hermesFetchModels(formBaseUrl, formApiKey, nextApiType)
      models = fetchedModels || []

      // 模型列表刷新后，验证主模型是否仍然存在，不存在则自动切换到第一个
      if (models.length > 0) {
        const savedPrimary = loadHermesPrimary()
        if (savedPrimary && models.includes(savedPrimary)) {
          // localStorage 中的主模型仍然有效，恢复它
          formModel = savedPrimary
        } else if (!models.includes(formModel)) {
          // 当前选中模型已不存在，自动切换到第一个
          formModel = models[0]
          // 如果 localStorage 中有过期记录，清除它
          if (savedPrimary && !models.includes(savedPrimary)) {
            try { localStorage.removeItem(STORAGE_HERMES_MODEL) } catch {}
          }
        }
      }

      cfgMsg = `<span style="color:var(--success)">✓ ${t('engine.configFetchSuccess', { count: models.length })}</span>`
      showDropdown = models.length > 0
    } catch (err) {
      const msg = String(err).replace(/^Error:\s*/, '')
      cfgMsg = `<span style="color:var(--error)">✗ ${msg}</span>`
    } finally {
      fetchBusy = false; draw()
    }
  }

  async function doSaveModel() {
    syncFormFromDom()
    const yyapiManaged = applyYyapiManagedFormGuard()
    if (!formApiKey) { cfgMsg = `<span style="color:var(--warning)">${t('engine.configFetchNeedKey')}</span>`; draw(); return }
    if (!formModel) { cfgMsg = `<span style="color:var(--warning)">${t('engine.configModelRequired')}</span>`; draw(); return }

    const matched = inferProviderByBaseUrl(hermesProviders, formBaseUrl)
    const provider = yyapiManaged ? 'custom' : (matched?.id || 'custom')

    modelBusy = true; cfgMsg = ''; draw()
    try {
      await api.configureHermes(provider, formApiKey, formModel, formBaseUrl || null)
      // 持久化主模型到 localStorage（跨引擎独立，与 OpenClaw 分离）
      saveHermesPrimary(formModel)
      cfgMsg = `<span style="color:var(--success)">✓ ${t('engine.configSaved')}</span>`
      // 刷新后端状态（不覆盖 form）
      try { hermesConfig = await api.hermesReadConfig() } catch (_) {}
    } catch (e) {
      cfgMsg = `<span style="color:var(--error)">✗ ${String(e).replace(/^Error:\s*/, '')}</span>`
    } finally {
      modelBusy = false; draw()
    }
  }

  async function doDetectEnv() {
    envDetecting = true; draw()
    try {
      envData = await api.hermesDetectEnvironments()
    } catch (e) {
      connectMsg = `<span style="color:var(--error)">${t('engine.envDetectFailed')}: ${String(e).replace(/^Error:\s*/, '')}</span>`
    }
    envDetecting = false; draw()
  }

  async function doApplyConnect() {
    let targetUrl = null
    if (connectMode === 'local') {
      targetUrl = null // 清除自定义，使用本地默认
    } else if (connectMode === 'wsl2') {
      targetUrl = envData?.wsl2?.gatewayUrl || null
      if (!targetUrl) {
        connectMsg = `<span style="color:var(--warning)">${t('engine.connWslGatewayMissing')}</span>`
        draw(); return
      }
    } else if (connectMode === 'docker') {
      // Docker 模式暂时需要用户提供 URL
      const urlInput = el.querySelector('#hm-custom-gw-url')
      targetUrl = urlInput?.value?.trim() || null
      if (!targetUrl && envData?.docker?.hermesContainers?.length) {
        connectMsg = `<span style="color:var(--warning)">${t('engine.connDockerCustomHint')}</span>`
        draw(); return
      }
    } else if (connectMode === 'custom') {
      const urlInput = el.querySelector('#hm-custom-gw-url')
      targetUrl = urlInput?.value?.trim() || null
      if (!targetUrl) {
        connectMsg = `<span style="color:var(--warning)">${t('engine.connUrlRequired')}</span>`
        draw(); return
      }
    }

    try {
      const result = await api.hermesSetGatewayUrl(targetUrl)
      connectMsg = `<span style="color:var(--success)">✓ ${result}</span>`
      // 刷新状态
      await refresh()
    } catch (e) {
      connectMsg = `<span style="color:var(--error)">✗ ${String(e).replace(/^Error:\s*/, '')}</span>`
      draw()
    }
  }

  function showGwMsg(msg, isErr) {
    const msgEl = el.querySelector('#hm-dash-msg')
    if (msgEl) {
      msgEl.textContent = msg
      msgEl.style.color = isErr ? 'var(--error)' : 'var(--success)'
    }
  }

  async function refreshBridgeStatus() {
    const [servicesResult, claudeResult] = await Promise.allSettled([
      api.getServicesStatus(),
      api.claudeCodeStatus(),
    ])
    openclawStatus = servicesResult.status === 'fulfilled'
      ? getOpenclawGatewayStatus(servicesResult.value)
      : null
    claudeStatus = claudeResult.status === 'fulfilled'
      ? claudeResult.value
      : { connected: false, versionError: claudeResult.reason?.message || String(claudeResult.reason) }
  }

  async function doOpenClawBridge() {
    bridgeBusy = 'openclaw'
    bridgeMsg = '<span style="color:var(--hm-accent)">正在准备 OpenClaw 聊天...</span>'
    bridgeProgress = { percent: 8, label: '检查 OpenClaw Gateway' }
    draw()
    let opened = false
    try {
      const services = await runBridgeProgressStep(12, 28, '检查 Gateway 状态', () => api.getServicesStatus().catch(() => []))
      const gw = getOpenclawGatewayStatus(services)
      if (!gw?.running) {
        await runBridgeProgressStep(32, 74, '正在启动 Gateway', () => api.startService('ai.openclaw.gateway'))
        await delay(600)
      } else {
        setBridgeProgress(72, 'Gateway 已在线')
      }
      await runBridgeProgressStep(76, 86, '确认 Gateway 在线', () => refreshBridgeStatus())
      if (!openclawStatus?.running) {
        const latest = await api.getServicesStatus().catch(() => [])
        openclawStatus = getOpenclawGatewayStatus(latest)
      }
      if (!openclawStatus?.running) throw new Error('OpenClaw Gateway 启动后仍未在线')
      bridgeMsg = '<span style="color:var(--hm-success)">OpenClaw 已启动，正在打开聊天。</span>'
      setBridgeProgress(90, '切换到 OpenClaw 聊天')
      await runBridgeProgressStep(90, 98, '切换到 OpenClaw 聊天', () => switchEngine('openclaw'))
      setBridgeProgress(100, '已进入 OpenClaw 聊天')
      toast('OpenClaw 已启动，正在进入聊天。', 'success')
      opened = true
      window.location.hash = '#/chat'
    } catch (e) {
      bridgeMsg = `<span style="color:var(--hm-error)">OpenClaw 启动失败：${esc(String(e).replace(/^Error:\s*/, ''))}</span>`
      clearBridgeProgress()
      toast('OpenClaw 启动失败：' + String(e).replace(/^Error:\s*/, ''), 'error')
    } finally {
      bridgeBusy = ''
      if (!opened) draw()
    }
  }

  async function doConnectClaudeBridge() {
    bridgeBusy = 'claude'
    bridgeMsg = '<span style="color:var(--hm-accent)">正在接通 CloudCode CLI...</span>'
    draw()
    try {
      const result = await ensureClaudeCodeStarted()
      claudeStatus = result?.status || await api.claudeCodeStatus()
      const ok = !!claudeStatus?.connected || !!claudeStatus?.version
      bridgeMsg = ok
        ? `<span style="color:var(--hm-success)">CloudCode 已接通：${esc(claudeStatus.version || 'CLI ready')}</span>`
        : `<span style="color:var(--hm-warn)">CloudCode 未接通：${esc(claudeStatus?.versionError || '未找到 CLI')}</span>`
      toast(ok ? 'CloudCode CLI 已接通。' : 'CloudCode CLI 未接通。', ok ? 'success' : 'warning')
    } catch (e) {
      claudeStatus = { connected: false, versionError: e?.message || String(e) }
      bridgeMsg = `<span style="color:var(--hm-error)">CloudCode 检测失败：${esc(String(e).replace(/^Error:\s*/, ''))}</span>`
      toast('CloudCode 检测失败：' + String(e).replace(/^Error:\s*/, ''), 'error')
    } finally {
      bridgeBusy = ''
      draw()
    }
  }

  async function doOpenAllBridge() {
    bridgeBusy = 'all'
    bridgeMsg = '<span style="color:var(--hm-accent)">正在接通 Hermes、OpenClaw、CloudCode...</span>'
    draw()
    try {
      if (!info?.gatewayRunning) {
        await api.hermesGatewayAction('start').catch(() => null)
      }
      const services = await api.getServicesStatus().catch(() => [])
      const gw = getOpenclawGatewayStatus(services)
      if (!gw?.running) {
        await api.startService('ai.openclaw.gateway')
      }
      const c = await ensureClaudeCodeStarted()
      claudeStatus = c?.status || await api.claudeCodeStatus()
      await refresh()
      bridgeMsg = '<span style="color:var(--hm-success)">三方通道已刷新，正在打开总览。</span>'
      toast('Hermes、OpenClaw、CloudCode 已完成接通检查。', 'success')
      await switchEngine('hermes')
      window.location.hash = '#/h/bridge'
    } catch (e) {
      bridgeMsg = `<span style="color:var(--hm-error)">三方接通失败：${esc(String(e).replace(/^Error:\s*/, ''))}</span>`
      toast('三方接通失败：' + String(e).replace(/^Error:\s*/, ''), 'error')
    } finally {
      bridgeBusy = ''
      draw()
    }
  }

  async function refresh() {
    try {
      info = await api.checkHermes()
      const [healthResult, configResult, bridgeResult] = await Promise.allSettled([
        info?.gatewayRunning ? api.hermesHealthCheck() : Promise.resolve(null),
        api.hermesReadConfig(),
        refreshBridgeStatus(),
      ])
      health = healthResult.status === 'fulfilled' ? healthResult.value : null
      if (configResult.status === 'fulfilled') {
        hermesConfig = configResult.value
      }
      if (bridgeResult.status === 'rejected') {
        console.warn('[hermes/dashboard] refreshBridgeStatus failed:', bridgeResult.reason)
      }
    } catch (_) {}
    loading = false
    // 首次加载时用 hermesConfig 初始化表单
    if (!formInited && hermesConfig) {
      formBaseUrl = hermesConfig.base_url || ''
      formApiKey = hermesConfig.api_key || ''
      formModel = hermesConfig.model || ''

      // 尝试从 localStorage 恢复用户之前设置的主模型
      const savedPrimary = loadHermesPrimary()
      if (savedPrimary && savedPrimary !== formModel) {
        // Backend config is authoritative until a fetched model list proves the
        // cached browser choice is still valid.
        if (models.includes(savedPrimary)) {
          formModel = savedPrimary
        } else if (!formModel) {
          formModel = savedPrimary
        }
      }

      formInited = true
    }
    draw()
  }

  // 初始加载：先拉取 provider registry（和 refresh 并行），再渲染
  ;(async () => {
    try {
      hermesProviders = await loadHermesProviders()
    } catch (err) {
      console.warn('[hermes/dashboard] failed to load providers:', err)
    }
    refresh()
  })()

  // --- Guardian 事件监听：实时响应 Gateway 状态变化 ---
  let unlisteners = []
  let autoRefreshTimer = null

  async function setupListeners() {
    try {
      // 监听 Guardian 推送的状态变化
      const unlisten1 = await tauriListen('hermes-gateway-status', (evt) => {
        const data = evt.payload
        if (info) {
          const wasRunning = info.gatewayRunning
          info.gatewayRunning = !!data.running
          if (data.port) info.gatewayPort = data.port
          // 状态变化时刷新（不覆盖 form 表单）
          if (wasRunning !== info.gatewayRunning) {
            draw()
          }
        }
      })
      unlisteners.push(unlisten1)

      // 监听 Guardian 日志（显示在消息区）
      const unlisten2 = await tauriListen('hermes-guardian-log', (evt) => {
        showGwMsg(evt.payload || '', false)
      })
      unlisteners.push(unlisten2)

      // 监听 config.yaml 自愈事件（api_server guardian）
      const unlisten3 = await tauriListen('hermes-config-patched', async (evt) => {
        const { toast } = await import('../../../components/toast.js')
        const msg = evt?.payload?.message || t('engine.dashConfigPatched')
        toast(msg, 'info', { duration: 6000 })
      })
      unlisteners.push(unlisten3)
    } catch (_) {
      // Web 模式下无 Tauri 事件，静默忽略
    }

    // 定期自动刷新（15s），作为事件监听的补充
    autoRefreshTimer = setInterval(async () => {
      if (actionBusy || modelBusy) return
      try {
        const newInfo = await api.checkHermes()
        if (newInfo && info) {
          const changed = newInfo.gatewayRunning !== info.gatewayRunning
          info = newInfo
          if (changed) draw()
        }
      } catch (_) {}
    }, 15000)
  }
  setupListeners()

  // 页面卸载时清理
  const cleanup = () => {
    unlisteners.forEach(fn => fn())
    unlisteners = []
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null }
  }
  // MutationObserver 检测元素从 DOM 移除
  const detachObserver = new MutationObserver(() => {
    if (!el.isConnected) { cleanup(); detachObserver.disconnect() }
  })
  requestAnimationFrame(() => {
    if (el.parentNode) detachObserver.observe(el.parentNode, { childList: true })
  })

  return el
}
