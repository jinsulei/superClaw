/**
 * 日志查看页面
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { t } from '../lib/i18n.js'

const LOG_TABS = [
  {
    key: 'gateway',
    label: () => t('logs.tabGateway'),
    desc: () => t('logs.tabGatewayDesc'),
    badge: () => t('logs.badgeRuntime'),
    tone: 'run',
  },
  {
    key: 'gateway-err',
    label: () => t('logs.tabGatewayErr'),
    desc: () => t('logs.tabGatewayErrDesc'),
    badge: () => t('logs.badgeError'),
    tone: 'error',
  },
  {
    key: 'guardian',
    label: () => t('logs.tabGuardian'),
    desc: () => t('logs.tabGuardianDesc'),
    badge: () => t('logs.badgeGuard'),
    tone: 'guard',
  },
  {
    key: 'guardian-backup',
    label: () => t('logs.tabBackup'),
    desc: () => t('logs.tabBackupDesc'),
    badge: () => t('logs.badgeBackup'),
    tone: 'backup',
  },
  {
    key: 'config-audit',
    label: () => t('logs.tabAudit'),
    desc: () => t('logs.tabAuditDesc'),
    badge: () => t('logs.badgeAudit'),
    tone: 'audit',
  },
]

const DEFAULT_LINE_LIMIT = 300
let _searchTimer = null

export async function render() {
  const page = document.createElement('div')
  page.className = 'page openclaw-logs-page'

  page.innerHTML = `
    <div class="logs-hero">
      <div class="logs-hero-copy">
        <div class="logs-kicker">${t('logs.kicker')}</div>
        <h1 class="page-title">${t('logs.title')}</h1>
        <p class="page-desc">${t('logs.desc')}</p>
      </div>
      <div class="logs-hero-metrics">
        <div class="logs-metric">
          <strong id="log-current-branch">${LOG_TABS[0].label()}</strong>
          <span>${t('logs.currentBranch')}</span>
        </div>
        <div class="logs-metric">
          <strong id="log-line-count">0</strong>
          <span>${t('logs.visibleRows')}</span>
        </div>
        <div class="logs-metric">
          <strong id="log-last-updated">--</strong>
          <span>${t('logs.lastUpdated')}</span>
        </div>
      </div>
    </div>

    <div class="logs-branch-bar">
      ${LOG_TABS.map((item, i) => `
        <button class="logs-branch ${i === 0 ? 'active' : ''}" data-tab="${item.key}" data-tone="${item.tone}">
          <span class="logs-branch-main">${item.label()}</span>
          <span class="logs-branch-desc">${item.desc()}</span>
          <span class="logs-branch-badge">${item.badge()}</span>
        </button>
      `).join('')}
    </div>

    <div class="logs-control-card">
      <div class="logs-toolbar">
        <div class="logs-search-wrap">
          <span class="logs-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          </span>
          <input type="text" class="form-input" id="log-search" placeholder="${t('logs.searchPlaceholder')}">
        </div>
        <button class="btn btn-secondary btn-sm" id="btn-refresh">${t('logs.refresh')}</button>
        <label class="logs-toggle">
          <input type="checkbox" id="log-show-raw">
          <span>${t('logs.showRaw')}</span>
        </label>
        <label class="logs-toggle">
          <input type="checkbox" id="log-autoscroll" checked>
          <span>${t('logs.autoScroll')}</span>
        </label>
      </div>
      <div class="logs-summary" id="log-summary"></div>
    </div>

    <div class="log-viewer logs-viewer" id="log-content">
      ${renderLoading()}
    </div>
  `

  let currentTab = 'gateway'
  let currentLines = []

  const loadCurrentLog = async () => {
    const result = await loadLog(page, currentTab)
    currentLines = result.lines
  }

  page.querySelectorAll('.logs-branch').forEach(tab => {
    tab.onclick = async () => {
      page.querySelectorAll('.logs-branch').forEach(el => el.classList.remove('active'))
      tab.classList.add('active')
      currentTab = tab.dataset.tab
      page.querySelector('#log-search').value = ''
      await loadCurrentLog()
    }
  })

  page.querySelector('#log-search').addEventListener('input', (e) => {
    clearTimeout(_searchTimer)
    _searchTimer = setTimeout(() => {
      renderLogLines(page, currentTab, currentLines, e.target.value.trim())
    }, 220)
  })

  page.querySelector('#log-show-raw').addEventListener('change', () => {
    renderLogLines(page, currentTab, currentLines, page.querySelector('#log-search').value.trim())
  })

  page.querySelector('#btn-refresh').onclick = loadCurrentLog

  loadCurrentLog()
  return page
}

export function cleanup() {
  clearTimeout(_searchTimer)
  _searchTimer = null
}

async function loadLog(page, logName) {
  const el = page.querySelector('#log-content')
  const refreshBtn = page.querySelector('#btn-refresh')
  el.innerHTML = renderLoading()
  if (refreshBtn) { refreshBtn.classList.add('btn-loading'); refreshBtn.disabled = true }

  try {
    const content = await api.readLogTail(logName, DEFAULT_LINE_LIMIT)
    const lines = content?.trim() ? content.trim().split('\n') : []
    renderLogLines(page, logName, lines, '')
    return { lines }
  } catch (e) {
    el.innerHTML = `<div class="logs-empty logs-empty--error">${t('logs.loadFailed')}：${escapeHtml(String(e))}</div>`
    toast(t('logs.loadFailed') + '：' + e, 'error')
    updateSummary(page, logName, [], 0)
    return { lines: [] }
  } finally {
    if (refreshBtn) { refreshBtn.classList.remove('btn-loading'); refreshBtn.disabled = false }
  }
}

function renderLogLines(page, logName, lines, query) {
  const el = page.querySelector('#log-content')
  const showRaw = !!page.querySelector('#log-show-raw')?.checked
  const parsed = lines.map(line => parseLogLine(line, logName))
  const filtered = query
    ? parsed.filter(item => {
        const haystack = `${item.time} ${item.source} ${item.messageZh} ${item.raw}`.toLowerCase()
        return haystack.includes(query.toLowerCase())
      })
    : parsed

  updateSummary(page, logName, lines, filtered.length, query)

  if (!lines.length) {
    el.innerHTML = `<div class="logs-empty">${t('logs.empty')}</div>`
    return
  }
  if (!filtered.length) {
    el.innerHTML = `<div class="logs-empty">${t('logs.noResults')}</div>`
    return
  }

  el.innerHTML = filtered.map((item, index) => renderLogRow(item, index, query, showRaw)).join('')
  if (page.querySelector('#log-autoscroll')?.checked) {
    el.scrollTop = el.scrollHeight
  }
}

function updateSummary(page, logName, allLines, visibleCount, query = '') {
  const tab = getTab(logName)
  const latest = allLines.length ? parseLogLine(allLines[allLines.length - 1], logName) : null
  const errorCount = allLines.map(line => parseLogLine(line, logName)).filter(item => item.level === 'error').length
  const warnCount = allLines.map(line => parseLogLine(line, logName)).filter(item => item.level === 'warn').length

  page.querySelector('#log-current-branch').textContent = tab.label()
  page.querySelector('#log-line-count').textContent = String(visibleCount)
  page.querySelector('#log-last-updated').textContent = latest?.time || '--'

  const summary = page.querySelector('#log-summary')
  summary.innerHTML = `
    <div class="logs-summary-main">
      <span class="logs-summary-badge" data-tone="${tab.tone}">${tab.badge()}</span>
      <div>
        <strong>${tab.label()}</strong>
        <span>${tab.desc()}</span>
      </div>
    </div>
    <div class="logs-summary-stats">
      <span>${t('logs.totalRows')}：${allLines.length}</span>
      <span>${t('logs.warnRows')}：${warnCount}</span>
      <span>${t('logs.errorRows')}：${errorCount}</span>
      ${query ? `<span>${t('logs.searching')}：${escapeHtml(query)}</span>` : ''}
    </div>
  `
}

function renderLogRow(item, index, query, showRaw) {
  const levelLabel = item.level === 'error'
    ? t('logs.levelError')
    : item.level === 'warn'
      ? t('logs.levelWarn')
      : t('logs.levelInfo')
  const source = item.source || t('logs.sourceSystem')
  const translated = highlightMatch(escapeHtml(item.messageZh), query)
  const raw = highlightMatch(escapeHtml(item.raw), query)

  return `
    <div class="log-line logs-row" data-level="${item.level}" style="--row-index:${index}">
      <div class="logs-row-meta">
        <span class="logs-row-time">${escapeHtml(item.time || '--')}</span>
        <span class="logs-row-level">${levelLabel}</span>
        <span class="logs-row-source">${escapeHtml(source)}</span>
      </div>
      <div class="logs-row-body">
        <div class="logs-row-message">${translated}</div>
        ${showRaw ? `<pre class="logs-row-raw">${raw}</pre>` : `<details class="logs-row-detail"><summary>${t('logs.viewOriginal')}</summary><pre>${raw}</pre></details>`}
      </div>
    </div>
  `
}

function parseLogLine(line, logName) {
  const raw = String(line || '').trim()
  const json = parseJsonLog(raw, logName)
  if (json) return json

  const bracketMatch = raw.match(/^\[([^\]]+)\]\s*(?:\[([^\]]+)\]\s*)?(.*)$/)
  const time = bracketMatch ? formatTime(bracketMatch[1]) : ''
  const source = bracketMatch?.[2] || getTab(logName).label()
  const message = bracketMatch ? bracketMatch[3] : raw

  return {
    time,
    source: translateSource(source),
    messageZh: translateMessage(message, logName),
    raw,
    level: detectLevel(raw, logName),
  }
}

function parseJsonLog(raw, logName) {
  if (!raw.startsWith('{')) return null
  try {
    const obj = JSON.parse(raw)
    const action = obj.action || obj.event || obj.kind || obj.type || t('logs.auditEvent')
    const target = obj.path || obj.file || obj.key || obj.name || ''
    const actor = obj.actor || obj.user || obj.source || ''
    return {
      time: formatTime(obj.time || obj.timestamp || obj.created_at || ''),
      source: t('logs.tabAudit'),
      messageZh: `${t('logs.auditEvent')}：${action}${target ? `，${t('logs.target')} ${target}` : ''}${actor ? `，${t('logs.actor')} ${actor}` : ''}`,
      raw,
      level: detectLevel(raw, logName),
    }
  } catch {
    return null
  }
}

function translateMessage(message, logName) {
  const text = String(message || '').trim()
  const lower = text.toLowerCase()
  if (!text) return getTab(logName).desc()
  if (/^\(?y\/n\)?\??$/i.test(text)) return t('logs.askConfirm')
  if (lower.includes('starting gateway on windows')) return t('logs.msgStartingGatewayWindows')
  if (lower.includes('starting gateway')) return t('logs.msgStartingGateway')
  if (lower.includes('gateway started') || lower.includes('server started')) return t('logs.msgGatewayStarted')
  if (lower.includes('gateway stopped') || lower.includes('server stopped')) return t('logs.msgGatewayStopped')
  if (lower.includes('listening on') || lower.includes('listen on')) return t('logs.msgListening')
  if (lower.includes('health') && lower.includes('ok')) return t('logs.msgHealthOk')
  if (lower.includes('backup') && (lower.includes('created') || lower.includes('success'))) return t('logs.msgBackupCreated')
  if (lower.includes('backup')) return t('logs.msgBackup')
  if (lower.includes('guardian')) return t('logs.msgGuardian')
  if (lower.includes('audit') || lower.includes('config')) return t('logs.msgAudit')
  if (lower.includes('error') || lower.includes('failed') || lower.includes('panic')) return t('logs.msgError')
  if (lower.includes('warning') || lower.includes('warn')) return t('logs.msgWarn')
  if (logName === 'gateway') return t('logs.msgGatewayEvent')
  if (logName === 'gateway-err') return t('logs.msgError')
  if (logName === 'guardian') return t('logs.msgGuardian')
  if (logName === 'guardian-backup') return t('logs.msgBackup')
  if (logName === 'config-audit') return t('logs.msgAudit')
  return t('logs.msgSystemEvent')
}

function translateSource(source) {
  const value = String(source || '').trim()
  const lower = value.toLowerCase()
  if (lower.includes('clawpanel')) return t('logs.sourcePanel')
  if (lower.includes('gateway')) return t('logs.sourceGateway')
  if (lower.includes('guardian')) return t('logs.sourceGuardian')
  return value || t('logs.sourceSystem')
}

function detectLevel(raw, logName) {
  const lower = String(raw || '').toLowerCase()
  if (logName === 'gateway-err' || lower.includes('error') || lower.includes('failed') || lower.includes('panic') || lower.includes('exception')) return 'error'
  if (lower.includes('warn') || lower.includes('warning')) return 'warn'
  return 'info'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').replace(/\.\d+Z?$/, '')
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function getTab(key) {
  return LOG_TABS.find(item => item.key === key) || LOG_TABS[0]
}

function renderLoading() {
  return `
    <div class="log-loading">
      <div class="service-spinner"></div>
      <span>${t('logs.loading')}</span>
    </div>
  `
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightMatch(html, query) {
  if (!query) return html
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.replace(new RegExp(escaped, 'gi'), m => `<mark>${m}</mark>`)
}
