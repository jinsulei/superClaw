import { api } from '../../../lib/tauri-api.js'
import { icon } from '../../../lib/icons.js'
import { toast } from '../../../components/toast.js'
import { t } from '../../../lib/i18n.js'

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatTokens(value) {
  const n = Number(value || 0)
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

function formatCost(value) {
  const n = Number(value || 0)
  if (!n) return '$0.00'
  if (n < 0.01) return '<$0.01'
  return '$' + n.toFixed(2)
}

const HERMES_DASHBOARD_THEME_KEY = 'superclaw-hermes-dashboard-theme'
const DARK_DASHBOARD_THEMES = new Set(['midnight', 'cyberpunk'])

function dashboardThemeTone(name) {
  return String(name || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'default'
}

function applyDashboardTheme(name) {
  const tone = dashboardThemeTone(name)
  document.documentElement.dataset.hermesDashboardTheme = tone
  try { localStorage.setItem(HERMES_DASHBOARD_THEME_KEY, tone) } catch {}
}

function previewDashboardTheme(name, update) {
  const tone = dashboardThemeTone(name)
  const fromBottomLeft = DARK_DASHBOARD_THEMES.has(tone)
  const html = document.documentElement
  html.style.setProperty('--theme-reveal-x', fromBottomLeft ? '0%' : '100%')
  html.style.setProperty('--theme-reveal-y', fromBottomLeft ? '100%' : '0%')
  if (document.startViewTransition) {
    document.startViewTransition(update)
  } else {
    update()
  }
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page hm-extensions-page'
  el.dataset.engine = 'hermes'

  let loading = true
  let themes = []
  let activeTheme = 'default'
  let plugins = []
  let analytics = null
  let error = ''
  let savingTheme = ''
  let themeSwitchToken = 0

  try {
    const savedTheme = localStorage.getItem(HERMES_DASHBOARD_THEME_KEY)
    if (savedTheme) {
      activeTheme = savedTheme
      applyDashboardTheme(savedTheme)
    }
  } catch {}

  const docs = [
    { label: 'engine.extensionsDocGettingStarted', desc: 'engine.extensionsDocGettingStartedDesc', href: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation/', icon: 'rocket' },
    { label: 'engine.extensionsDocCron', desc: 'engine.extensionsDocCronDesc', href: 'https://hermes-agent.nousresearch.com/docs/guides/automate-with-cron/', icon: 'clock' },
    { label: 'engine.extensionsDocSkills', desc: 'engine.extensionsDocSkillsDesc', href: 'https://hermes-agent.nousresearch.com/docs/guides/skills/', icon: 'wrench' },
    { label: 'engine.extensionsDocDashboard', desc: 'engine.extensionsDocDashboardDesc', href: 'http://127.0.0.1:9119/', icon: 'monitor' },
  ]

  const themeCopy = {
    default: ['Default', '默认暖金控制台主题，适合日常管理和长时间阅读。'],
    midnight: ['Midnight', '深色夜间主题，降低亮度并突出关键状态。'],
    ember: ['Ember', '暖色焦糖主题，适合偏柔和的 Dashboard 观感。'],
    mono: ['Mono', '单色专注主题，弱化装饰并强调信息密度。'],
    cyberpunk: ['Cyberpunk', '霓虹科技主题，适合高对比监控场景。'],
    rose: ['Rose', '柔和玫瑰主题，适合轻量展示和演示。'],
  }

  function themeMeta(theme) {
    const name = String(theme?.name || '').trim() || 'default'
    const copy = themeCopy[name.toLowerCase()]
    return {
      name,
      label: theme?.label || copy?.[0] || name,
      description: copy?.[1] || theme?.description || t('engine.extensionsNoDescription'),
      tone: name.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'default',
    }
  }

  function renderDocLink(doc) {
    return `
      <a class="hm-ext-doc-link" href="${esc(doc.href)}" target="_blank" rel="noopener noreferrer">
        <span class="hm-ext-doc-icon">${icon(doc.icon, 15)}</span>
        <span class="hm-ext-doc-copy">
          <strong>${esc(t(doc.label))}</strong>
          <small>${esc(t(doc.desc))}</small>
        </span>
        <span class="hm-ext-doc-arrow">↗</span>
      </a>
    `
  }

  function renderThemeChoice(theme) {
    const meta = themeMeta(theme)
    const activeTone = dashboardThemeTone(activeTheme)
    const savingTone = dashboardThemeTone(savingTheme)
    const isActive = dashboardThemeTone(meta.name) === activeTone
    const themeBusy = !!savingTheme && savingTone === activeTone
    const isSaving = themeBusy && dashboardThemeTone(meta.name) === savingTone
    return `
      <button class="hm-ext-theme-choice ${isActive ? 'is-active' : ''} ${isSaving ? 'is-saving' : ''}" data-theme="${esc(meta.name)}" data-tone="${esc(meta.tone)}" ${themeBusy ? 'disabled' : ''}>
        <span class="hm-ext-theme-swatch" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="hm-ext-theme-copy">
          <strong>${esc(meta.label)}</strong>
          <small>${esc(meta.description)}</small>
        </span>
        <span class="hm-ext-theme-status">${isSaving ? esc(t('engine.extensionsSwitchingTheme')) : (isActive ? esc(t('engine.extensionsCurrentTheme')) : esc(t('engine.extensionsApplyTheme')))}</span>
      </button>
    `
  }

  function renderPlugin(plugin) {
    return `
      <article class="hm-ext-plugin-row">
        <div class="hm-ext-plugin-main">
          <strong>${esc(plugin.label || plugin.name)}</strong>
          <span>${esc(plugin.description || t('engine.extensionsNoDescription'))}</span>
        </div>
        <div class="hm-ext-plugin-meta">
          <span>v${esc(plugin.version || '0.0.0')}</span>
          ${plugin.has_api ? '<span>API</span>' : ''}
          ${plugin.tab?.path ? `<code>${esc(plugin.tab.path)}</code>` : ''}
        </div>
      </article>
    `
  }

  function draw() {
    const totals = analytics?.totals || {}
    const tokens = Number(totals.total_input || 0) + Number(totals.total_output || 0)
    const cost = totals.total_actual_cost || totals.total_estimated_cost
    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">${esc(t('engine.extensionsEyebrow'))}</div>
          <h1 class="hm-hero-h1">${esc(t('engine.extensionsTitle'))}</h1>
          <div class="hm-hero-sub">${esc(t('engine.extensionsDesc'))}</div>
        </div>
        <div class="hm-hero-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-ext-refresh" ${loading ? 'disabled' : ''}>${icon('refresh-cw', 14)}${esc(t('engine.extensionsRefresh'))}</button>
          <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-ext-rescan" ${loading ? 'disabled' : ''}>${icon('package', 14)}${esc(t('engine.extensionsRescan'))}</button>
        </div>
      </div>

      ${error ? `<div class="hm-ext-alert">${icon('alert-triangle', 14)}<span>${esc(error)}</span></div>` : ''}

      <div class="hm-ext-summary">
        <div class="hm-ext-summary-item">
          <span class="hm-ext-summary-icon">${icon('pen-tool', 15)}</span>
          <span>${esc(t('engine.extensionsThemes'))}</span>
          <strong>${themes.length}</strong>
          <small>${esc(t('engine.extensionsActive'))}: ${esc(activeTheme)}</small>
        </div>
        <div class="hm-ext-summary-item">
          <span class="hm-ext-summary-icon">${icon('plug', 15)}</span>
          <span>${esc(t('engine.extensionsPlugins'))}</span>
          <strong>${plugins.length}</strong>
          <small>${esc(t('engine.extensionsManifestCount').replace('{n}', plugins.length))}</small>
        </div>
        <div class="hm-ext-summary-item">
          <span class="hm-ext-summary-icon">${icon('bar-chart', 15)}</span>
          <span>${esc(t('engine.extensionsTokens'))}</span>
          <strong>${esc(formatTokens(tokens))}</strong>
          <small>${esc(t('engine.extensionsLast30Days'))}</small>
        </div>
        <div class="hm-ext-summary-item">
          <span class="hm-ext-summary-icon">${icon('target', 15)}</span>
          <span>${esc(t('engine.extensionsCost'))}</span>
          <strong>${esc(formatCost(cost))}</strong>
          <small>${esc(t('engine.extensionsEstimatedSpend'))}</small>
        </div>
      </div>

      <div class="hm-ext-layout">
        <section class="hm-panel hm-ext-docs-panel">
          <div class="hm-panel-header">
            <div>
              <div class="hm-panel-title">${esc(t('engine.extensionsDocs'))}</div>
              <div class="hm-ext-panel-sub">${esc(t('engine.extensionsDocsSub'))}</div>
            </div>
          </div>
          <div class="hm-panel-body hm-ext-doc-list">
            ${docs.map(renderDocLink).join('')}
          </div>
        </section>

        <section class="hm-panel hm-ext-analytics-panel">
          <div class="hm-panel-header">
            <div>
              <div class="hm-panel-title">${esc(t('engine.extensionsAnalytics'))}</div>
              <div class="hm-ext-panel-sub">${esc(t('engine.extensionsAnalyticsSub'))}</div>
            </div>
          </div>
          <div class="hm-panel-body">
            <div class="hm-ext-kpi-grid">
              <div class="hm-ext-kpi"><span>${esc(t('engine.extensionsSessions'))}</span><strong>${esc(totals.total_sessions || 0)}</strong><small>${esc(t('engine.extensionsConversationRuns'))}</small></div>
              <div class="hm-ext-kpi"><span>${esc(t('engine.extensionsTokens'))}</span><strong>${esc(formatTokens(tokens))}</strong><small>${esc(t('engine.extensionsInputOutput'))}</small></div>
              <div class="hm-ext-kpi"><span>${esc(t('engine.extensionsCost'))}</span><strong>${esc(formatCost(cost))}</strong><small>${esc(t('engine.extensionsActualOrEstimated'))}</small></div>
            </div>
          </div>
        </section>

        <section class="hm-panel hm-ext-themes-panel">
          <div class="hm-panel-header">
            <div>
              <div class="hm-panel-title">${esc(t('engine.extensionsThemes'))}</div>
              <div class="hm-ext-panel-sub">${esc(t('engine.extensionsThemesSub'))}</div>
            </div>
            <div class="hm-panel-actions"><span class="hm-ext-chip">${esc(t('engine.extensionsActive'))}: ${esc(activeTheme)}</span></div>
          </div>
          <div class="hm-panel-body hm-ext-theme-list">
            ${themes.length ? themes.map(renderThemeChoice).join('') : `
              <div class="hm-ext-empty">
                ${icon('pen-tool', 30)}
                <strong>${esc(t('engine.extensionsNoThemes'))}</strong>
                <span>${esc(t('engine.extensionsNoThemesHint'))}</span>
              </div>
            `}
          </div>
        </section>

        <section class="hm-panel hm-ext-plugins-panel">
          <div class="hm-panel-header">
            <div>
              <div class="hm-panel-title">${esc(t('engine.extensionsPlugins'))}</div>
              <div class="hm-ext-panel-sub">${esc(t('engine.extensionsPluginsSub'))}</div>
            </div>
            <div class="hm-panel-actions"><span class="hm-ext-chip">${esc(t('engine.extensionsManifestCount').replace('{n}', plugins.length))}</span></div>
          </div>
          <div class="hm-panel-body hm-ext-plugin-list">
            ${plugins.length ? plugins.map(renderPlugin).join('') : `
              <div class="hm-ext-empty">
                ${icon('inbox', 30)}
                <strong>${esc(t('engine.extensionsNoPluginsTitle'))}</strong>
                <span>${esc(t('engine.extensionsNoPlugins'))}</span>
                <button class="hm-btn hm-btn--ghost hm-btn--sm hm-ext-empty-action" id="hm-ext-empty-rescan">${icon('refresh-cw', 12)}${esc(t('engine.extensionsRescan'))}</button>
              </div>
            `}
          </div>
        </section>
      </div>
    `

    el.querySelector('#hm-ext-refresh')?.addEventListener('click', load)
    el.querySelector('#hm-ext-rescan')?.addEventListener('click', rescan)
    // 拦截 Dashboard 本地链接：probe → auto-start → 打开。避免直接打开浏览器看到 ERR_CONNECTION_REFUSED
    el.querySelectorAll('a[href^="http://127.0.0.1:9119"]').forEach(a => {
      a.addEventListener('click', async (ev) => {
        ev.preventDefault()
        const openWith = async (port) => {
          const url = a.href.replace(/:9119(\/?)/, ':' + port + '$1')
          if (window.__TAURI_INTERNALS__) {
            const { open } = await import('@tauri-apps/plugin-shell')
            await open(url)
          } else {
            window.open(url, '_blank', 'noopener,noreferrer')
          }
        }
        // 1. probe
        const probe = await api.hermesDashboardProbe().catch(() => ({ running: false, port: 9119 }))
        if (probe?.running) {
          try { await openWith(probe.port || 9119) }
          catch (err) { toast(t('engine.dashNativePanelOpenFail') + ': ' + (err?.message || err), 'error') }
          return
        }
        // 2. auto-start
        const r = await api.hermesDashboardStart().catch(() => ({ started: false, kind: 'spawn_failed', port: probe?.port || 9119 }))
        if (r?.started) {
          try { await openWith(r.port || 9119) }
          catch (err) { toast(t('engine.dashNativePanelOpenFail') + ': ' + (err?.message || err), 'error') }
          return
        }
        // 3. 失败 → toast（dashboard 页面有完整安装流程，这里只引导）
        const port = r?.port || probe?.port || 9119
        if (r?.kind === 'deps_missing') {
          toast(t('engine.dashNativePanelDepHint'), 'warning', { duration: 6000 })
        } else {
          toast(t('engine.dashNativePanelDown', { port }), 'warning')
        }
      })
    })
    el.querySelector('#hm-ext-empty-rescan')?.addEventListener('click', rescan)
    el.querySelectorAll('.hm-ext-theme-choice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.theme
        const currentBusy = !!savingTheme && dashboardThemeTone(savingTheme) === dashboardThemeTone(activeTheme)
        if (!name || dashboardThemeTone(name) === dashboardThemeTone(activeTheme) || currentBusy) return
        const previousTheme = activeTheme
        const currentSwitchToken = ++themeSwitchToken
        savingTheme = name
        previewDashboardTheme(name, () => {
          activeTheme = name
          applyDashboardTheme(name)
          draw()
        })
        try {
          await api.hermesDashboardThemeSet(name)
          if (currentSwitchToken !== themeSwitchToken) return
          savingTheme = ''
          toast(t('engine.extensionsThemeSaved'), 'success')
          draw()
        } catch (err) {
          if (currentSwitchToken !== themeSwitchToken) return
          savingTheme = ''
          previewDashboardTheme(previousTheme, () => {
            activeTheme = previousTheme
            applyDashboardTheme(previousTheme)
            draw()
          })
          toast(String(err?.message || err).replace(/^Error:\s*/, ''), 'error')
        }
      })
    })
  }

  async function load() {
    loading = true
    error = ''
    draw()
    try {
      const [themeData, pluginData, usageData] = await Promise.all([
        api.hermesDashboardThemes(),
        api.hermesDashboardPlugins(),
        api.hermesUsageAnalytics(30),
      ])
      themes = Array.isArray(themeData?.themes) ? themeData.themes : []
      activeTheme = themeData?.active || 'default'
      savingTheme = ''
      themeSwitchToken += 1
      applyDashboardTheme(activeTheme)
      plugins = Array.isArray(pluginData) ? pluginData : []
      analytics = usageData || null
    } catch (err) {
      error = String(err?.message || err).replace(/^Error:\s*/, '')
    } finally {
      loading = false
      draw()
    }
  }

  async function rescan() {
    try {
      await api.hermesDashboardPluginsRescan()
      await load()
      toast(t('engine.extensionsPluginsRescanned'), 'success')
    } catch (err) {
      toast(String(err?.message || err).replace(/^Error:\s*/, ''), 'error')
    }
  }

  draw()
  load()
  return el
}
