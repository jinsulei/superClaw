/**
 * 侧边导航栏
 */
import { navigate, getCurrentRoute, reloadCurrentRoute } from '../router.js'
import { toggleTheme, getTheme, getColorTheme, setColorTheme } from '../lib/theme.js'
import { isOpenclawReady } from '../lib/app-state.js'
import { api } from '../lib/tauri-api.js'
import { toast } from './toast.js'
import { APP_BUILD_VERSION, PRODUCT_DISPLAY_VERSION } from '../lib/product-version.js'
import { t, getLang, setLang, getAvailableLangs } from '../lib/i18n.js'
import { isFeatureAvailable } from '../lib/feature-gates.js'
import { getKernelSnapshot } from '../lib/kernel.js'
import { triggerKernelUpgrade } from '../lib/kernel-upgrade.js'
import { getActiveEngine, getActiveEngineId, listEngines, switchEngine, onEngineChange } from '../lib/engine-manager.js'

// 当用户点 "暂时不升级" 时，本地会话内不再显示升级提示
const SS_DISMISSED_KERNEL_UPGRADE = 'superclaw_kernel_upgrade_dismissed'

function NAV_ITEMS_FULL() { return [
  {
    section: t('sidebar.sectionMonitor'),
    items: [
      { route: '/dashboard', label: t('sidebar.dashboard'), icon: 'dashboard' },
      { route: '/assistant', label: t('sidebar.assistant'), icon: 'assistant' },
      { route: '/chat', label: t('sidebar.chat'), icon: 'chat' },
      // HIDDEN: { route: '/route-map', label: t('sidebar.routeMap'), icon: 'route-map' },
      // HIDDEN: { route: '/services', label: t('sidebar.services'), icon: 'services' },  // 取消注释即可恢复
      { route: '/logs', label: t('sidebar.logs'), icon: 'logs' },
    ]
  },
  {
    section: t('sidebar.sectionConfig'),
    items: [
      { route: '/models', label: t('sidebar.models'), icon: 'models' },
      { route: '/agents', label: t('sidebar.agents'), icon: 'agents' },
      { route: '/gateway', label: t('sidebar.gateway'), icon: 'gateway' },
      { route: '/channels', label: t('sidebar.channels'), icon: 'channels' },
      // HIDDEN: { route: '/communication', label: t('sidebar.communication'), icon: 'settings' },
      // HIDDEN: { route: '/security', label: t('sidebar.security'), icon: 'security' },
    ]
  },
  {
    section: t('sidebar.sectionData'),
    items: [
      { route: '/memory', label: t('sidebar.memory'), icon: 'memory', gate: 'memory' },
      { route: '/dreaming', label: t('sidebar.dreaming'), icon: 'dreaming', gate: 'dreaming' },
      // HIDDEN: { route: '/cron', label: t('sidebar.cron'), icon: 'clock', gate: 'cron' },
      // HIDDEN: { route: '/usage', label: t('sidebar.usage'), icon: 'bar-chart' },
    ]
  },
  {
    section: t('sidebar.sectionExtension'),
    items: [
      { route: '/skills', label: t('sidebar.skills'), icon: 'skills', gate: 'skills' },
      { route: '/plugin-hub', label: t('sidebar.pluginHub'), icon: 'extensions' },
    ]
  },
  {
    section: '',
    items: [
      { route: '/recharge', label: t('sidebar.recharge'), icon: 'recharge' },
      { route: '/profile', label: t('sidebar.profile'), icon: 'profile' },
      { route: '/settings', label: t('sidebar.settings'), icon: 'settings' },
      { route: '/chat-debug', label: t('sidebar.checkRepair'), icon: 'diagnose' },
      //{ route: '/about', label: t('sidebar.about'), icon: 'about' },
    ]
  }
] }

function NAV_ITEMS_SETUP() { return [
  {
    section: '',
    items: [
      { route: '/setup', label: t('sidebar.setup'), icon: 'setup' },
      { route: '/assistant', label: t('sidebar.assistant'), icon: 'assistant' },
    ]
  },
  {
    section: '',
    items: [
      { route: '/profile', label: t('sidebar.profile'), icon: 'profile' },
      { route: '/settings', label: t('sidebar.settings'), icon: 'settings' },
      { route: '/chat-debug', label: t('sidebar.chatDebug'), icon: 'debug' },
      //{ route: '/about', label: t('sidebar.about'), icon: 'about' },
    ]
  }
] }

const ICONS = {
  setup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  services: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>',
  logs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  models: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>',
  agents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
  gateway: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
  memory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>',
  extensions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  about: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  assistant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/><path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/></svg>',
  security: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
  dreaming: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z"/><path d="M17 4l.8 1.7L19.5 6.5l-1.7.8L17 9l-.8-1.7-1.7-.8 1.7-.8L17 4z"/></svg>',
  skills: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
  channels: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  'bar-chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  debug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>',
  'route-map': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h10M7 18h10M5 8v8M19 8v8"/></svg>',
  diagnose: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  recharge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/></svg>',
}

let _delegated = false

function _normalizeSidebarRoute(route) {
  const clean = String(route || '').split('?')[0].replace(/^#/, '')
  return clean || '/'
}

function _isSidebarItemActive(current, item) {
  const route = _normalizeSidebarRoute(item?.route)
  const activeRoutes = Array.isArray(item?.activeRoutes) ? item.activeRoutes.map(_normalizeSidebarRoute) : []
  const currentRoute = _normalizeSidebarRoute(current)
  if (currentRoute === route || activeRoutes.includes(currentRoute)) return true
  if (item?.matchChildren && currentRoute.startsWith(route.endsWith('/') ? route : `${route}/`)) return true
  return false
}

function _syncSidebarActiveRoute(el, route) {
  const nextRoute = _normalizeSidebarRoute(route)
  el.querySelectorAll('.nav-item[data-route]').forEach(node => {
    node.classList.toggle('active', _normalizeSidebarRoute(node.dataset.route) === nextRoute)
  })
}

// === 引擎切换器 ===
function _renderEngineSwitcher() {
  const engines = listEngines()
  if (engines.length < 2) return '' // 只有一个引擎时不显示
  const active = getActiveEngine()
  const engineOptions = engines.flatMap(engine => {
    if (engine.id !== 'hermes') return [engine]
    return [
      engine,
      {
        id: 'claude-code',
        name: 'Claude Code',
        icon: ICONS.assistant,
        action: 'claude-code',
      },
    ]
  })
  const options = [
    ...engineOptions,
    {
      id: 'codex',
      name: 'Codex',
      icon: ICONS.channels,
      action: 'coming-soon',
      badge: '待开放',
    },
  ]
  if (!active) return ''
  return `<div class="engine-switcher" id="engine-switcher">
    <div class="engine-switcher-label">${_escSidebar(t('engine.switcherSectionLabel'))}</div>
    <button class="engine-current" id="btn-engine-toggle" title="${_escSidebar(t('engine.switcherTooltip'))}" aria-haspopup="listbox" aria-expanded="false">
      <span class="engine-icon">${active.icon || ''}</span>
      <span class="engine-label">${_escSidebar(active.name)}</span>
      <svg class="engine-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="engine-dropdown" id="engine-dropdown">
      ${options.map(e => `<div class="engine-option${e.id === active.id ? ' active' : ''}${e.action === 'coming-soon' ? ' pending' : ''}" data-engine="${e.id}" ${e.action ? `data-engine-action="${e.action}"` : ''}>
        <span class="engine-opt-icon">${e.icon || ''}</span>
        <span class="engine-opt-name">${_escSidebar(e.name)}</span>
        ${e.badge ? `<span class="engine-opt-badge">${_escSidebar(e.badge)}</span>` : ''}
        ${e.id === active.id ? '<span class="engine-active-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></span>' : ''}
      </div>`).join('')}
    </div>
  </div>`
}

function _closeEngineDropdown() {
  const dd = document.getElementById('engine-dropdown')
  if (dd) dd.classList.remove('open')
  const btn = document.getElementById('btn-engine-toggle')
  if (btn) btn.setAttribute('aria-expanded', 'false')
}

function _toggleEngineDropdown() {
  const dd = document.getElementById('engine-dropdown')
  if (!dd) return
  const btn = document.getElementById('btn-engine-toggle')
  if (dd.classList.contains('open')) {
    dd.classList.remove('open')
    if (btn) btn.setAttribute('aria-expanded', 'false')
    return
  }
  dd.classList.add('open')
  if (btn) btn.setAttribute('aria-expanded', 'true')
}

let _engineSwitchProgressFrame = null
let _engineSwitchProgressTimer = null

function _engineNameById(id) {
  const engine = listEngines().find(item => item.id === id)
  return engine?.name || id || ''
}

function _shouldShowEngineSwitchProgress(fromId, toId) {
  return (fromId === 'hermes' && toId === 'openclaw')
    || (fromId === 'openclaw' && toId === 'hermes')
}

function _getEngineSwitchCopy(fromId, toId) {
  if (fromId === 'openclaw' && toId === 'hermes') {
    return {
      kicker: 'OpenClaw 到 Hermes',
      title: '正在进入 Hermes Agent',
      subtitle: '启动 Hermes 并打开实时聊天',
    }
  }
  if (fromId === 'hermes' && toId === 'openclaw') {
    return {
      kicker: 'Hermes 到 OpenClaw',
      title: '正在展开 OpenClaw 工作区',
      subtitle: '同步侧边栏、路由和控制台内容',
    }
  }
  return {
    kicker: `${_engineNameById(fromId)} 到 ${_engineNameById(toId)}`,
    title: `正在进入 ${_engineNameById(toId)}`,
    subtitle: '同步侧边栏、路由和控制台内容',
  }
}

function _getEngineLandingRoute(eid, eng) {
  if (eid === 'hermes') return '/h/chat'
  if (eid === 'openclaw') return '/chat'
  return eng?.getDefaultRoute?.() || '/dashboard'
}

function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function _findOpenClawGateway(services) {
  return services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0] || null
}

async function _readOpenClawGatewayPort() {
  try {
    const config = await api.readOpenclawConfig()
    return Number(config?.gateway?.port || 18789)
  } catch {
    return 18789
  }
}

async function _probeOpenClawGatewayHealth(port) {
  try {
    if (await api.probeGatewayPort()) return true
  } catch {}

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    const resp = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return false
    const text = await resp.text()
    if (!text) return true
    try {
      const data = JSON.parse(text)
      return data?.ok !== false
    } catch {
      return true
    }
  } catch {
    return false
  }
}

async function _waitForOpenClawGatewayHealth(progress, start = 78, end = 92, timeoutMs = 18000) {
  const port = await _readOpenClawGatewayPort()
  const startedAt = Date.now()
  let attempt = 0
  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1
    if (await _probeOpenClawGatewayHealth(port)) {
      progress?.setProgress(end)
      return { port, attempts: attempt }
    }
    const elapsedRatio = Math.min(1, (Date.now() - startedAt) / timeoutMs)
    progress?.setProgress(start + (end - start - 2) * elapsedRatio)
    await _delay(420)
  }
  throw new Error(`OpenClaw Gateway 已启动，但 ${port} 端口健康检查未通过`)
}

async function _runSwitchProgressStep(progress, start, end, task) {
  progress?.setProgress(start)
  const startedAt = performance.now()
  const timer = setInterval(() => {
    const elapsed = performance.now() - startedAt
    const eased = 1 - Math.exp(-elapsed / 2200)
    progress?.setProgress(start + (end - start - 2) * eased)
  }, 180)

  try {
    const result = await task()
    progress?.setProgress(end)
    return result
  } finally {
    clearInterval(timer)
  }
}

async function _prepareOpenClawGatewayForSwitch() {
  let pairingRepaired = false
  try {
    const pairResult = await api.autoPairDevice()
    pairingRepaired = String(pairResult || '').includes('scopes repaired')
  } catch (e) {
    console.warn('[sidebar] OpenClaw auto pair before switch failed:', e)
  }
  try {
    await api.claimGateway()
  } catch (e) {
    console.warn('[sidebar] OpenClaw claim before switch failed:', e)
  }
  return pairingRepaired
}

async function _ensureOpenClawGatewayForSwitch(progress) {
  const pairingRepaired = await _runSwitchProgressStep(progress, 18, 28, () => _prepareOpenClawGatewayForSwitch())
  const services = await _runSwitchProgressStep(progress, 30, 42, () => api.getServicesStatus().catch(() => []))
  const gw = _findOpenClawGateway(services)
  if (gw?.running) {
    if (pairingRepaired) {
      await _runSwitchProgressStep(progress, 42, 64, () => api.restartService('ai.openclaw.gateway'))
    }
    try {
      await _waitForOpenClawGatewayHealth(progress, pairingRepaired ? 64 : 46, 84, 9000)
      return gw
    } catch (e) {
      console.warn('[sidebar] OpenClaw Gateway running but unhealthy, restarting once:', e)
      await _runSwitchProgressStep(progress, 58, 78, () => api.restartService('ai.openclaw.gateway'))
      await _waitForOpenClawGatewayHealth(progress, 78, 90, 18000)
      const latest = await _runSwitchProgressStep(progress, 90, 94, () => api.getServicesStatus().catch(() => []))
      const next = _findOpenClawGateway(latest)
      if (!next?.running) {
        throw new Error('OpenClaw Gateway is still offline after restart')
      }
      return next
    }
  }

  await _runSwitchProgressStep(progress, 44, 78, () => api.startService('ai.openclaw.gateway'))
  await _waitForOpenClawGatewayHealth(progress, 78, 90, 18000)
  const latest = await _runSwitchProgressStep(progress, 90, 94, () => api.getServicesStatus().catch(() => []))
  const next = _findOpenClawGateway(latest)
  if (!next?.running) {
    throw new Error('OpenClaw Gateway 启动后仍未在线')
  }
  return next
}

function _setEngineSwitchProgress(overlay, value) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const fill = overlay?.querySelector('[data-engine-progress-fill]')
  const percent = overlay?.querySelector('[data-engine-progress-percent]')
  const pageFill = document.querySelector('[data-engine-progress-page-fill]')
  const pagePercent = document.querySelector('[data-engine-progress-page-percent]')

  if (fill) fill.style.width = `${pct}%`
  if (percent) percent.textContent = `${pct}%`
  if (pageFill) pageFill.style.width = `${pct}%`
  if (pagePercent) pagePercent.textContent = `${pct}%`
}

function _clearEngineSwitchProgress() {
  if (_engineSwitchProgressFrame) {
    cancelAnimationFrame(_engineSwitchProgressFrame)
    _engineSwitchProgressFrame = null
  }
  if (_engineSwitchProgressTimer) {
    clearTimeout(_engineSwitchProgressTimer)
    _engineSwitchProgressTimer = null
  }
  document.querySelectorAll('.engine-switch-progress').forEach(node => node.remove())
}

function _showEngineSwitchProgress(fromId, toId) {
  _clearEngineSwitchProgress()
  const copy = _getEngineSwitchCopy(fromId, toId)

  const overlay = document.createElement('div')
  overlay.className = 'engine-switch-progress'
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-live', 'polite')
  overlay.innerHTML = `
    <div class="engine-switch-progress-card">
      <div class="engine-switch-progress-top">
        <div>
          <div class="engine-switch-progress-kicker">Hermes 到 OpenClaw</div>
          <div class="engine-switch-progress-title">正在展开 OpenClaw 工作区</div>
        </div>
        <span class="engine-switch-progress-percent" data-engine-progress-percent>0%</span>
      </div>
      <div class="engine-switch-progress-track">
        <span data-engine-progress-fill style="width:0%"></span>
      </div>
      <div class="engine-switch-progress-meta">
        ${_escSidebar(_engineNameById(fromId))} 切换到 ${_escSidebar(_engineNameById(toId))}
      </div>
    </div>`
  overlay.querySelector('.engine-switch-progress-kicker').textContent = copy.kicker
  overlay.querySelector('.engine-switch-progress-title').textContent = copy.title
  document.body.appendChild(overlay)

  _setEngineSwitchProgress(overlay, 4)
  requestAnimationFrame(() => overlay.classList.add('is-visible'))

  const startedAt = performance.now()
  const duration = 900
  const tick = (now) => {
    const elapsed = Math.min(now - startedAt, duration)
    const ratio = elapsed / duration
    const eased = 1 - Math.pow(1 - ratio, 3)
    _setEngineSwitchProgress(overlay, 4 + eased * 30)

    if (ratio < 1) {
      _engineSwitchProgressFrame = requestAnimationFrame(tick)
    }
  }
  _engineSwitchProgressFrame = requestAnimationFrame(tick)

  return {
    setProgress: (value) => _setEngineSwitchProgress(overlay, value),
    complete: () => _finishEngineSwitchProgress(overlay, false),
    fail: () => _finishEngineSwitchProgress(overlay, true),
  }
}

function _showEngineSwitchPageProgress() {
  _clearEngineSwitchProgress()
  _setEngineSwitchProgress(null, 4)

  const startedAt = performance.now()
  const duration = 900
  const tick = (now) => {
    const elapsed = Math.min(now - startedAt, duration)
    const ratio = elapsed / duration
    const eased = 1 - Math.pow(1 - ratio, 3)
    _setEngineSwitchProgress(null, 4 + eased * 30)

    if (ratio < 1) {
      _engineSwitchProgressFrame = requestAnimationFrame(tick)
    }
  }
  _engineSwitchProgressFrame = requestAnimationFrame(tick)

  return {
    setProgress: (value) => _setEngineSwitchProgress(null, value),
    complete: () => _finishEngineSwitchPageProgress(),
    fail: () => _finishEngineSwitchPageProgress(),
  }
}

function _finishEngineSwitchPageProgress() {
  if (_engineSwitchProgressFrame) {
    cancelAnimationFrame(_engineSwitchProgressFrame)
    _engineSwitchProgressFrame = null
  }
  _setEngineSwitchProgress(null, 100)
}

function _finishEngineSwitchProgress(overlay, failed) {
  if (_engineSwitchProgressFrame) {
    cancelAnimationFrame(_engineSwitchProgressFrame)
    _engineSwitchProgressFrame = null
  }

  if (!overlay) return

  if (failed) {
    overlay.classList.add('is-error')
    const title = overlay.querySelector('.engine-switch-progress-title')
    if (title) title.textContent = '切换失败，请稍后重试'
  } else {
    overlay.classList.add('is-complete')
    _setEngineSwitchProgress(overlay, 100)
  }

  if (_engineSwitchProgressTimer) clearTimeout(_engineSwitchProgressTimer)
  _engineSwitchProgressTimer = setTimeout(() => {
    overlay.classList.remove('is-visible')
    _engineSwitchProgressTimer = setTimeout(() => {
      overlay.remove()
      _engineSwitchProgressTimer = null
    }, 260)
  }, failed ? 1200 : 560)
}

const LS_SIDEBAR_COLLAPSED = 'superclaw_sidebar_collapsed'

function _isDesktopSidebarCollapsed() {
  try { return localStorage.getItem(LS_SIDEBAR_COLLAPSED) === '1' } catch { return false }
}

function _setDesktopSidebarCollapsed(collapsed) {
  try { localStorage.setItem(LS_SIDEBAR_COLLAPSED, collapsed ? '1' : '0') } catch {}
  const sidebar = document.getElementById('sidebar')
  if (sidebar) {
    sidebar.classList.toggle('sidebar-collapsed', !!collapsed)
  }
  const btn = document.getElementById('btn-sidebar-collapse')
  if (btn) btn.textContent = collapsed ? '»' : '«'
}

export function renderSidebar(el) {
  const current = getCurrentRoute()

  const collapsed = _isDesktopSidebarCollapsed()
  let html = `
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <img src="/images/logo.png" alt="SuperClaw">
      </div>
      <span class="sidebar-title">SuperClaw</span>
      <button class="sidebar-collapse-btn" id="btn-sidebar-collapse" title="${t('sidebar.collapse')}">${collapsed ? '»' : '«'}</button>
      <button class="sidebar-close-btn" id="btn-sidebar-close" title="${t('sidebar.closeMenu')}">&times;</button>
    </div>
    ${_renderEngineSwitcher()}
    <nav class="sidebar-nav">
  `

  // 从当前引擎获取菜单（回退到原有逻辑）
  const engine = getActiveEngine()
  const navItems = engine ? engine.getNavItems() : (isOpenclawReady() ? NAV_ITEMS_FULL() : NAV_ITEMS_SETUP())

  for (const section of navItems) {
    html += `<div class="nav-section">
      <div class="nav-section-title">${section.section}</div>`

    for (const item of section.items) {
      if (item.gate && engine && !engine.isFeatureAvailable(item.gate)) continue
      if (item.gate && !engine && !isFeatureAvailable(item.gate)) continue
      const active = _isSidebarItemActive(current, item) ? ' active' : ''
      const extraClass = item.className ? ` ${_escSidebar(item.className)}` : ''
      html += `<div class="nav-item${active}${extraClass}" data-route="${item.route}">
        ${ICONS[item.icon] || ''}
        <span>${item.label}</span>
      </div>`
    }
    html += '</div>'
  }

  html += '</nav>'

  // 主题切换按钮
  const isDark = getTheme() === 'dark'
  const colorTheme = getColorTheme()
  const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
  const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'
  const paletteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 5.8 2 10.5S5.8 19 10.5 19H12a2 2 0 002-2 1.5 1.5 0 011.5-1.5H17c2.8 0 5-2.1 5-4.8C22 5.9 17.5 2 12 2z"/></svg>'
  const colorThemes = [
    ['default', '默认'],
    ['midnight', '午夜'],
    ['ember', '暖橙'],
    ['mono', '单色'],
    ['cyberpunk', '霓虹'],
    ['rose', '玫瑰'],
  ]
  const colorThemeOptions = colorThemes.map(([name, label]) => `
    <button type="button" class="theme-color-option${name === colorTheme ? ' active' : ''}" data-color-theme="${name}" data-tone="${name}">
      <span class="theme-color-swatch" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>${label}</span>
      ${name === colorTheme ? '<span class="theme-color-check">✓</span>' : ''}
    </button>
  `).join('')

  const langCode = getLang()
  const langs = getAvailableLangs()
  const currentLang = langs.find(l => l.code === langCode) || langs[0]
  const globeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>'
  const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>'

  const langOptions = langs.map(l => `
    <div class="lang-option${l.code === langCode ? ' active' : ''}" data-lang="${l.code}">
      <span class="lang-option-label">${l.label}</span>
      <span class="lang-option-code">${l.code}</span>
      ${l.code === langCode ? `<span class="lang-option-check">${checkIcon}</span>` : ''}
    </div>
  `).join('')

  // 内核可升级卡片（仅 openclaw 引擎、已连接、低于推荐版时显示）
  html += _renderKernelUpgradeHint()

  html += `
    <div class="sidebar-footer">
      <div class="theme-switcher" id="theme-switcher">
        <div class="theme-switch-row">
          <button type="button" class="nav-item theme-mode-trigger" id="btn-theme-toggle">
            ${isDark ? sunIcon : moonIcon}
            <span>${isDark ? t('sidebar.themeLight') : t('sidebar.themeDark')}</span>
          </button>
          <button type="button" class="theme-color-trigger" id="btn-theme-color-toggle" title="颜色主题">
            ${paletteIcon}
          </button>
        </div>
        <div class="theme-color-dropdown" id="theme-color-dropdown">
          <div class="theme-color-title">颜色主题</div>
          <div class="theme-color-options">${colorThemeOptions}</div>
        </div>
      </div>
      <div class="lang-switcher" id="lang-switcher">
        <button class="nav-item lang-trigger" id="btn-lang-toggle">
          ${globeIcon}
          <span>${currentLang.label}</span>
          <svg class="lang-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
        <div class="lang-dropdown" id="lang-dropdown">
          <div class="lang-options" id="lang-options">${langOptions}</div>
        </div>
      </div>
      <div class="sidebar-meta">
        <span class="sidebar-version" title="内部构建版本 v${APP_BUILD_VERSION}">${PRODUCT_DISPLAY_VERSION}</span>
      </div>
    </div>
  `

  el.innerHTML = html

  // 应用折叠态（桌面端）
  _setDesktopSidebarCollapsed(collapsed)

  // 事件委托：只绑定一次，避免重复绑定
  if (!_delegated) {
    _delegated = true
    el.addEventListener('click', (e) => {
      // 导航点击
      const navItem = e.target.closest('.nav-item[data-route]')
      if (navItem) {
        _syncSidebarActiveRoute(el, navItem.dataset.route)
        navigate(navItem.dataset.route)
        _closeMobileSidebar()
        return
      }
      // 移动端关闭按钮
      if (e.target.closest('#btn-sidebar-close')) {
        _closeMobileSidebar()
        return
      }
      // 侧边栏折叠
      const collapseBtn = e.target.closest('#btn-sidebar-collapse')
      if (collapseBtn) {
        _setDesktopSidebarCollapsed(!_isDesktopSidebarCollapsed())
        // 不需要整体重渲染
        return
      }
      // 主题切换
      const themeBtn = e.target.closest('#btn-theme-toggle')
      if (themeBtn) {
        toggleTheme(() => renderSidebar(el))
        return
      }
      const themeColorBtn = e.target.closest('#btn-theme-color-toggle')
      if (themeColorBtn) {
        _toggleThemeColorDropdown()
        return
      }
      const themeColorOpt = e.target.closest('.theme-color-option[data-color-theme]')
      if (themeColorOpt) {
        const name = themeColorOpt.dataset.colorTheme
        setColorTheme(name)
        _closeThemeColorDropdown()
        renderSidebar(el)
        return
      }
      // 内核升级提示卡：dismiss 按钮 → 仅当前会话不再显示
      const dismissBtn = e.target.closest('#btn-kernel-upgrade-dismiss')
      if (dismissBtn) {
        e.preventDefault()
        e.stopPropagation()
        try { sessionStorage.setItem(SS_DISMISSED_KERNEL_UPGRADE, '1') } catch {}
        const card = el.querySelector('#kernel-upgrade-hint')
        if (card) card.remove()
        return
      }
      // 内核升级提示卡：主体点击 → 触发一键升级流程
      const hintCard = e.target.closest('#kernel-upgrade-hint')
      if (hintCard) {
        triggerKernelUpgrade({
          onDone: () => {
            // 升级完成后清除会话内的 dismiss 标记并刷新 sidebar
            try { sessionStorage.removeItem(SS_DISMISSED_KERNEL_UPGRADE) } catch {}
            renderSidebar(el)
          },
        }).catch(err => {
          console.error('[sidebar] 内核升级触发失败:', err)
        })
        return
      }
      // 语言切换器：打开/关闭下拉
      const langBtn = e.target.closest('#btn-lang-toggle')
      if (langBtn) {
        _toggleLangDropdown(el)
        return
      }
      // 语言选项点击
      const langOpt = e.target.closest('.lang-option[data-lang]')
      if (langOpt) {
        const code = langOpt.dataset.lang
        if (code !== getLang()) {
          setLang(code)
          renderSidebar(el)
          reloadCurrentRoute()
        } else {
          _closeLangDropdown()
        }
        return
      }
      // 引擎切换器：打开/关闭下拉
      const engineBtn = e.target.closest('#btn-engine-toggle')
      if (engineBtn) {
        _toggleEngineDropdown()
        return
      }
      // 引擎选项点击
      const engineOpt = e.target.closest('.engine-option[data-engine]')
      if (engineOpt) {
        const eid = engineOpt.dataset.engine
        const action = engineOpt.dataset.engineAction
        _closeEngineDropdown()
        if (action === 'coming-soon') {
          toast('Codex 通道待开放', 'info')
          return
        }
        if (action === 'claude-code') {
          engineOpt.style.opacity = '0.5'
          Promise.resolve().then(async () => {
            await switchEngine('hermes')
            await api.claudeCodeStart()
            renderSidebar(el)
            navigate('/h/claude-code')
            toast('Claude Code 控制面板已启动', 'success')
          }).catch(err => {
            console.error('[sidebar] Claude Code 接通失败:', err)
            toast(`Claude Code 接通失败：${err?.message || err}`, 'error')
            renderSidebar(el)
          }).finally(() => {
            engineOpt.style.opacity = ''
          })
          return
        }
        const fromEngineId = getActiveEngineId()
        if (eid === fromEngineId) {
          const currentRoute = getCurrentRoute()
          if (eid === 'hermes' && currentRoute === '/h/claude-code') {
            engineOpt.style.opacity = '0.5'
            const eng = getActiveEngine()
            Promise.resolve()
              .then(async () => {
                if (eng?.tryAutoInit) await eng.tryAutoInit()
                navigate('/h/chat')
                toast('正在进入 Hermes 实时聊天', 'success')
              })
              .catch(err => {
                console.error('[sidebar] Hermes 聊天启动失败:', err)
                toast(`Hermes 启动失败：${err?.message || err}`, 'error')
              })
              .finally(() => {
                engineOpt.style.opacity = ''
              })
          }
          return
        }
        if (eid !== fromEngineId) {
          const showSwitchProgress = _shouldShowEngineSwitchProgress(fromEngineId, eid)
          const switchCopy = _getEngineSwitchCopy(fromEngineId, eid)
          engineOpt.style.opacity = '0.5'
          // 立即在内容区显示加载骨架，避免切换期间空白
          const contentEl = document.getElementById('content')
          if (contentEl) {
            contentEl.innerHTML = showSwitchProgress ? `<div class="page engine-switch-loading-page">
              <div class="engine-switch-loading-panel">
                <div>
                  <div class="engine-switch-loading-kicker">${_escSidebar(switchCopy.kicker)}</div>
                  <div class="engine-switch-loading-title">${_escSidebar(switchCopy.title)}</div>
                  <div class="engine-switch-loading-subtitle">${_escSidebar(switchCopy.subtitle)}</div>
                </div>
                <div class="engine-switch-loading-percent" data-engine-progress-page-percent>0%</div>
                <div class="engine-switch-loading-track">
                  <span data-engine-progress-page-fill style="width:0%"></span>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px">
                ${[1,2,3].map(() => '<div class="card"><div class="card-body" style="padding:16px"><div class="skeleton-line" style="width:60%;height:12px;margin-bottom:10px"></div><div class="skeleton-line" style="width:80%;height:20px"></div></div></div>').join('')}
              </div>
              <div class="card"><div class="card-body" style="padding:20px"><div class="skeleton-line" style="width:40%;height:16px;margin-bottom:16px"></div><div class="skeleton-line" style="height:36px"></div></div></div>
            </div>` : `<div class="page" style="padding:32px">
              <div class="skeleton-line" style="width:200px;height:28px;margin-bottom:24px"></div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px">
                ${[1,2,3].map(() => '<div class="card"><div class="card-body" style="padding:16px"><div class="skeleton-line" style="width:60%;height:12px;margin-bottom:10px"></div><div class="skeleton-line" style="width:80%;height:20px"></div></div></div>').join('')}
              </div>
              <div class="card"><div class="card-body" style="padding:20px"><div class="skeleton-line" style="width:40%;height:16px;margin-bottom:16px"></div><div class="skeleton-line" style="height:36px"></div></div></div>
            </div>`
          }
          const switchProgress = showSwitchProgress ? _showEngineSwitchPageProgress() : null
          Promise.resolve().then(async () => {
            if (eid === 'openclaw') {
              await _ensureOpenClawGatewayForSwitch(switchProgress)
            }
            switchProgress?.setProgress(88)
            await switchEngine(eid)
            toast(t('engine.switchedTo', { name: getActiveEngine()?.name || eid }), 'success')
            renderSidebar(el)
            switchProgress?.setProgress(92)
            // 尝试自动初始化新引擎（静默安装 + 启动 Gateway），然后跳转
            const eng = getActiveEngine()
            if (eng) {
              const isHermesTarget = eid === 'hermes'
              if (eng.tryAutoInit && (isHermesTarget || !eng.isReady())) {
                await _runSwitchProgressStep(switchProgress, 92, 96, () => eng.tryAutoInit())
              }
              switchProgress?.setProgress(98)
              navigate(eng.isReady() ? _getEngineLandingRoute(eid, eng) : eng.getSetupRoute())
            }
            switchProgress?.complete()
          }).catch(err => {
            switchProgress?.fail()
            console.error('[sidebar] 切换引擎失败:', err)
            toast(t('engine.switchFailed') || '引擎切换失败，请稍后重试', 'error')
            renderSidebar(el)
            // 恢复内容区：重新加载当前路由或显示错误占位
            const contentEl = document.getElementById('content')
            if (contentEl) {
              const hash = window.location.hash.slice(1) || '/'
              if (hash) {
                reloadCurrentRoute()
              } else {
                contentEl.innerHTML = `<div class="page" style="padding:32px;color:var(--error)">加载失败，请刷新页面重试</div>`
              }
            }
          }).finally(() => {
            engineOpt.style.opacity = ''
          })
        }
        return
      }
      // 点击其他区域关闭下拉
      if (!e.target.closest('.engine-switcher')) {
        _closeEngineDropdown()
      }
      if (!e.target.closest('.lang-switcher')) {
        _closeLangDropdown()
      }
      if (!e.target.closest('.theme-switcher')) {
        _closeThemeColorDropdown()
      }
    })

  }
}

function _escSidebar(s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

/**
 * 渲染"内核可升级"卡片。
 *
 * 显示条件（同时满足）：
 * - 当前引擎是 openclaw
 * - 已成功握手 Gateway（snapshot 有 version）
 * - 高于硬地板（< floor 由 floor-blocker 接管）
 * - 低于推荐目标（!isLatest）
 * - 用户未在本会话中点击过 "暂不升级"
 *
 * 不满足任何一条返回空串。
 */
function _renderKernelUpgradeHint() {
  if (getActiveEngineId() !== 'openclaw') return ''
  if (sessionStorage.getItem(SS_DISMISSED_KERNEL_UPGRADE) === '1') return ''

  const snap = getKernelSnapshot()
  if (!snap || !snap.version) return ''
  if (!snap.aboveFloor) return ''   // floor-blocker 处理
  if (snap.isLatest) return ''       // 已经是推荐目标

  const arrowIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>'
  const sparkIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L13.5 8.5 20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z"/></svg>'

  const fromLabel = snap.versionLabel || snap.version
  const toLabel = snap.target || ''

  return `
    <div class="kernel-upgrade-hint" id="kernel-upgrade-hint" role="button" tabindex="0">
      <div class="kernel-upgrade-hint-icon">${sparkIcon}</div>
      <div class="kernel-upgrade-hint-body">
        <div class="kernel-upgrade-hint-title">${_escSidebar(t('kernel.upgradeHint.title'))}</div>
        <div class="kernel-upgrade-hint-meta">${_escSidebar(t('kernel.upgradeHint.subtitle', { from: fromLabel, to: toLabel }))}</div>
      </div>
      <div class="kernel-upgrade-hint-arrow">${arrowIcon}</div>
      <button class="kernel-upgrade-hint-dismiss" id="btn-kernel-upgrade-dismiss" title="${_escSidebar(t('kernel.upgradeHint.dismissTooltip'))}" aria-label="${_escSidebar(t('kernel.upgradeHint.dismissTooltip'))}">×</button>
    </div>
  `
}

// === 移动端侧边栏 ===
function _closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar')
  const overlay = document.getElementById('sidebar-overlay')
  if (sidebar) sidebar.classList.remove('sidebar-open')
  if (overlay) overlay.classList.remove('visible')
}

export function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return
  sidebar.classList.add('sidebar-open')
  let overlay = document.getElementById('sidebar-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'sidebar-overlay'
    overlay.className = 'sidebar-overlay'
    overlay.addEventListener('click', _closeMobileSidebar)
    document.getElementById('app').appendChild(overlay)
  }
  requestAnimationFrame(() => overlay.classList.add('visible'))
}

function _closeLangDropdown() {
  const sw = document.getElementById('lang-switcher')
  const dd = document.getElementById('lang-dropdown')
  if (dd) dd.classList.remove('open')
  if (sw) sw.classList.remove('open')
}

function _closeThemeColorDropdown() {
  const sw = document.getElementById('theme-switcher')
  const dd = document.getElementById('theme-color-dropdown')
  if (dd) dd.classList.remove('open')
  if (sw) sw.classList.remove('open')
}

function _toggleThemeColorDropdown() {
  const sw = document.getElementById('theme-switcher')
  const dd = document.getElementById('theme-color-dropdown')
  if (!dd) return
  if (dd.classList.contains('open')) {
    dd.classList.remove('open')
    if (sw) sw.classList.remove('open')
    return
  }
  dd.classList.add('open')
  if (sw) sw.classList.add('open')
}

function _toggleLangDropdown(sidebarEl) {
  const sw = document.getElementById('lang-switcher')
  const dd = document.getElementById('lang-dropdown')
  if (!dd) return
  if (dd.classList.contains('open')) { dd.classList.remove('open'); if (sw) sw.classList.remove('open'); return }
  dd.classList.add('open')
  if (sw) sw.classList.add('open')
  const searchInput = dd.querySelector('#lang-search')
  if (searchInput) {
    searchInput.value = ''
    _filterLangOptions('')
    requestAnimationFrame(() => searchInput.focus())
    searchInput.oninput = () => _filterLangOptions(searchInput.value)
  }
}

function _filterLangOptions(query) {
  const opts = document.querySelectorAll('#lang-options .lang-option')
  const q = query.toLowerCase().trim()
  opts.forEach(opt => {
    if (!q) { opt.style.display = ''; return }
    const label = (opt.querySelector('.lang-option-label')?.textContent || '').toLowerCase()
    const code = (opt.querySelector('.lang-option-code')?.textContent || '').toLowerCase()
    opt.style.display = (label.includes(q) || code.includes(q)) ? '' : 'none'
  })
}
