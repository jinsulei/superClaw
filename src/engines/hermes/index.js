/**
 * Hermes Agent 引擎
 */
import { t } from '../../lib/i18n.js'
import { api, invalidate } from '../../lib/tauri-api.js'

// Hermes 状态
let _ready = false
let _running = false
let _listeners = []
let _pollTimer = null
let _visibilityHandler = null
const HERMES_POLL_INTERVAL_MS = 30000

async function detectHermesStatus() {
  try {
    invalidate('check_hermes')
    const info = await api.checkHermes()
    _ready = !!info?.installed && !!info?.configExists
    _running = !!info?.gatewayRunning
  } catch (_) {
    _ready = false
    _running = false
  }
  _listeners.forEach(fn => { try { fn({ ready: _ready, running: _running }) } catch (_) {} })
  return _ready
}

function startPoll() {
  if (_pollTimer) return
  const tick = () => {
    if (typeof document !== 'undefined' && document.hidden) return
    detectHermesStatus()
  }
  _pollTimer = setInterval(tick, HERMES_POLL_INTERVAL_MS)
  if (!_visibilityHandler && typeof document !== 'undefined') {
    _visibilityHandler = () => {
      if (!document.hidden) detectHermesStatus()
    }
    document.addEventListener('visibilitychange', _visibilityHandler)
  }
}

function stopPoll() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  if (_visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', _visibilityHandler)
    _visibilityHandler = null
  }
}

// ── 自动初始化：免打扰安装 + 启动 Gateway ──
async function tryAutoInit() {
  if (_ready && _running) return true
  try {
    invalidate('check_hermes')
    let info = await api.checkHermes()

    // Step 1: 未安装 → 静默安装
    if (!info?.installed) {
      await detectHermesStatus()
      return false
    }

    // Step 2: 已配置但 Gateway 未运行 → 自动启动
    if (info?.installed && info?.configExists && !info?.gatewayRunning) {
      await api.hermesGatewayAction('start')
    }

    // 重新检测引擎状态
    await detectHermesStatus()
    return _ready
  } catch (err) {
    console.warn('[hermes] tryAutoInit failed:', err)
    return false
  }
}

export default {
  id: 'hermes',
  name: 'Hermes Agent',
  description: 'Hermes AI Agent with tool-calling capabilities',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',

  async detect() {
    await detectHermesStatus()
    return { installed: _ready, ready: _ready }
  },

  async boot() {
    await detectHermesStatus()
    if (_ready && !_running) {
      await tryAutoInit()
    }
    startPoll()
  },

  cleanup() {
    stopPoll()
  },

  getNavItems() {
    // 未就绪时显示 Setup 菜单
    if (!_ready) {
      return [{
        section: '',
        items: [
          { route: '/h/setup', label: t('sidebar.setup'), icon: 'setup' },
        ]
      }, {
        section: '',
        items: [
          { route: '/settings', label: t('sidebar.settings'), icon: 'settings' },
          // HIDDEN: { route: '/about', label: t('sidebar.about'), icon: 'about' },
        ]
      }]
    }
    // 就绪后显示完整菜单
    return [{
      section: t('sidebar.sectionMonitor'),
      items: [
        { route: '/h/dashboard', label: t('sidebar.dashboard'), icon: 'dashboard' },
        { route: '/h/chat', label: t('sidebar.chat'), icon: 'chat' },
        { route: '/h/sessions', label: t('sidebar.sessions'), icon: 'inbox' },
        { route: '/h/logs', label: t('sidebar.logs'), icon: 'logs' },
        { route: '/h/usage', label: t('sidebar.usage'), icon: 'bar-chart' },
      ]
    }, {
      section: t('sidebar.sectionManage'),
      items: [
        { route: '/h/skills', label: t('sidebar.skills'), icon: 'skills' },
        { route: '/h/memory', label: t('sidebar.memory'), icon: 'memory' },
        { route: '/h/cron', label: t('sidebar.cron'), icon: 'clock' },
        { route: '/h/extensions', label: t('sidebar.extensions'), icon: 'package' },
      ]
    }, {
      section: '',
      items: [
        { route: '/recharge', label: t('sidebar.recharge'), icon: 'recharge' },
        { route: '/profile', label: t('sidebar.profile'), icon: 'profile' },
        { route: '/settings', label: t('sidebar.settings'), icon: 'settings' },
        // HIDDEN: { route: '/about', label: t('sidebar.about'), icon: 'about' },
      ]
    }]
  },

  getRoutes() {
    return [
      // Hermes 专属页面（/h/ 前缀）
      { path: '/h/setup', loader: () => import('./pages/setup.js') },
      { path: '/h/dashboard', loader: () => import('./pages/dashboard.js') },
      { path: '/h/chat', loader: () => import('./pages/chat.js') },
      { path: '/h/bridge', loader: () => import('./pages/bridge.js') },
      { path: '/h/claude-code', loader: () => import('./pages/claude-code.js') },
      { path: '/h/sessions', loader: () => import('./pages/sessions.js') },
      { path: '/h/logs', loader: () => import('./pages/logs.js') },
      { path: '/h/usage', loader: () => import('./pages/usage.js') },
      { path: '/h/skills', loader: () => import('./pages/skills.js') },
      { path: '/h/memory', loader: () => import('./pages/memory.js') },
      { path: '/h/cron', loader: () => import('./pages/cron.js') },
      { path: '/h/extensions', loader: () => import('./pages/extensions.js') },
      { path: '/h/services', loader: () => import('./pages/services.js') },
      { path: '/h/config', loader: () => import('./pages/config.js') },
      { path: '/h/channels', loader: () => import('./pages/channels.js') },
      { path: '/h/env', loader: () => import('./pages/env-editor.js') },
      // 共用页面（引擎无关）
      { path: '/assistant', loader: () => import('../../pages/assistant.js') },
      { path: '/settings', loader: () => import('../../pages/settings.js') },
      { path: '/about', loader: () => import('../../pages/about.js') },
      { path: '/recharge', loader: () => import('../../pages/payment.js') },
      { path: '/profile', loader: () => import('../../pages/profile.js') },
    ]
  },

  getSetupRoute() { return '/h/setup' },
  getDefaultRoute() { return '/h/chat' },

  isReady() { return _ready },
  isGatewayRunning() { return _running },
  isGatewayForeign() { return false },

  onStateChange(fn) {
    _listeners.push(fn)
    return () => { _listeners = _listeners.filter(cb => cb !== fn) }
  },
  onReadyChange(fn) {
    _listeners.push(fn)
    return () => { _listeners = _listeners.filter(cb => cb !== fn) }
  },

  isFeatureAvailable() { return true },

  // 自动初始化（安装 + 启动 Gateway）
  tryAutoInit,
}
