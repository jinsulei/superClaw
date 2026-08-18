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
  icon: '<img class="engine-brand-icon" src="/images/hermes-icon.png" alt="" aria-hidden="true">',

  async detect() {
    await detectHermesStatus()
    return { installed: _ready, ready: _ready }
  },

  async boot() {
    await detectHermesStatus()
    // Populate portable bundled skills during engine startup. The skills page
    // still loads its list on demand, but a fresh portable data directory no
    // longer appears to have no skills while the user is elsewhere in Hermes.
    void api.hermesEnsureBuiltinSkills().catch((error) => {
      console.warn('[hermes] builtin skills bootstrap failed:', error)
    })
    if (_ready && !_running) {
      // The bundled runtime can start in the background after the console opens.
      void tryAutoInit()
    }
    startPoll()
  },

  cleanup() {
    stopPoll()
  },

  getNavItems() {
    // 完整菜单（新版会话侧边栏）：无论是否已配置都返回。
    // 首次进入不强制初始化、也不显示“初始设置”入口；
    // 未配置模型时由控制台（dashboard）内联的模型配置区引导完成配置。
    return [{
      section: t('sidebar.sectionMonitor'),
      items: [
        { route: '/h/dashboard', label: t('sidebar.dashboard'), icon: 'dashboard' },
        { route: '/h/chat', label: t('sidebar.chat'), icon: 'chat' },
        { route: '/h/sessions', label: t('sidebar.sessions'), icon: 'inbox' },
        { route: '/h/logs', label: t('sidebar.logs'), icon: 'logs' },
        // HIDDEN: { route: '/h/usage', label: t('sidebar.usage'), icon: 'bar-chart' },
      ]
    }, {
      section: t('sidebar.sectionManage'),
      items: [
        { route: '/h/skills', label: t('sidebar.skills'), icon: 'skills' },
        { route: '/h/memory', label: t('sidebar.memory'), icon: 'memory' },
        // HIDDEN: { route: '/h/cron', label: t('sidebar.cron'), icon: 'clock' },
        { route: '/h/extensions', label: t('sidebar.extensions'), icon: 'package' },
      ]
    }, {
      section: '',
      items: [
        { route: '/profile', label: t('sidebar.profile'), icon: 'profile' },
        { route: '/models', label: t('sidebar.models'), icon: 'models' },
        { route: '/payment', label: t('sidebar.recharge'), icon: 'recharge' },
      ]
    }]
  },

  getRoutes() {
    return [
      // Hermes 专属页面（/h/ 前缀）
      { path: '/h/setup', loader: () => import('./pages/setup.js') },
      { path: '/h/dashboard', loader: () => import('./pages/dashboard.js') },
      { path: '/h/terminal', loader: () => import('./pages/terminal.js') },
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
      { path: '/h/recharge', loader: () => import('../../pages/payment.js') },
      // 共用页面（引擎无关）
      { path: '/assistant', loader: () => import('../../pages/assistant.js') },
      { path: '/models', loader: () => import('../../pages/models.js') },
      { path: '/settings', loader: () => import('../../pages/settings.js') },
      { path: '/about', loader: () => import('../../pages/about.js') },
      { path: '/recharge', loader: () => import('../../pages/payment.js') },
      { path: '/payment', loader: () => import('../../pages/payment.js') },
    ]
  },

  getSetupRoute() { return '/h/setup' },
  getDefaultRoute() { return '/h/dashboard' },

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
