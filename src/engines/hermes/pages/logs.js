/**
 * Hermes Agent — Log viewer
 *
 * Data contract mirrors `hermes-web-ui`'s `/api/hermes/logs` endpoints:
 *   { files: [{ name, size, modified }] }
 *   { entries: [{ timestamp, level, logger, message, raw }, ...] }
 *
 * Extras beyond the official UI:
 *   - Download entire log file to user's disk
 *   - Clear the currently rendered entries (local only)
 *   - Auto-refresh (polling tail) toggle — 2s tick
 *   - Access-log colouring: method / path / status are parsed and highlighted
 *   - Live regex search that also highlights matches inline
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const LOG_LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
const LOG_LEVEL_LABELS = {
  ALL: '全部',
  DEBUG: '调试',
  INFO: '信息',
  WARNING: '警告',
  WARN: '警告',
  ERROR: '错误',
  CRITICAL: '严重',
  FATAL: '严重',
}
const LOG_FILE_PROJECTS = [
  {
    match: /^agent\.log$/i,
    title: 'Hermes Agent',
    desc: '对话、工具调用与运行上下文',
    kind: '主项目',
  },
  {
    match: /^gateway\.log$/i,
    title: 'Gateway 网关',
    desc: '接口请求、健康检查与内存监控',
    kind: '服务项目',
  },
  {
    match: /^gateway-exit-diag\.log$/i,
    title: 'Gateway 退出诊断',
    desc: '网关退出、崩溃与启动诊断',
    kind: '诊断项目',
  },
  {
    match: /^errors\.log$/i,
    title: '错误汇总',
    desc: '异常、失败请求与运行错误',
    kind: '异常项目',
  },
  {
    match: /^superclaw-openclaw\.out\.log$/i,
    title: 'OpenClaw 运行输出',
    desc: 'OpenClaw 标准输出日志',
    kind: 'OpenClaw',
  },
  {
    match: /^superclaw-openclaw\.err\.log$/i,
    title: 'OpenClaw 错误输出',
    desc: 'OpenClaw 标准错误日志',
    kind: 'OpenClaw',
  },
  {
    match: /claude|cloudcode/i,
    title: 'Claude Code 面板',
    desc: 'Claude Code 连接与面板日志',
    kind: 'Claude Code',
  },
  {
    match: /openclaw/i,
    title: 'OpenClaw 项目',
    desc: 'OpenClaw 相关运行日志',
    kind: 'OpenClaw',
  },
]
const LEVEL_TONE = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warn', WARN: 'warn',
  ERROR: 'error', CRITICAL: 'error', FATAL: 'error',
}

const ICONS = {
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
}

/** Extract HH:MM:SS from arbitrary timestamp string; fallback to the raw. */
function formatTime(ts) {
  if (!ts) return ''
  const match = String(ts).match(/\d{2}:\d{2}:\d{2}/)
  return match ? match[0] : String(ts)
}

/** Parse an HTTP access log message. Returns null on miss. */
function parseAccessLog(msg) {
  const text = String(msg || '').trim()
  const quoted = text.match(/"(\w+)\s+(\S+)\s+HTTP\/[^"]+"\s+(\d+)/)
  if (quoted) return { method: quoted[1], path: quoted[2], status: quoted[3] }
  const compact = text.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)(?:\s+(\d{3}))?$/i)
  if (compact) return { method: compact[1].toUpperCase(), path: compact[2], status: compact[3] || '' }
  return null
}

function formatSize(bytes) {
  if (typeof bytes === 'string') return bytes
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function levelLabel(level) {
  return LOG_LEVEL_LABELS[String(level || '').toUpperCase()] || String(level || '')
}

function projectLabelForFile(name) {
  const fileName = String(name || '').trim()
  const known = LOG_FILE_PROJECTS.find(item => item.match.test(fileName))
  if (known) return { ...known, fileName }
  const base = fileName.replace(/\.(log|txt|jsonl)$/i, '').replace(/[-_]+/g, ' ').trim()
  return {
    title: base ? `${base} 项目` : '未命名日志项目',
    desc: '项目运行日志',
    kind: '日志项目',
    fileName,
  }
}

function entryText(e) {
  return String(e?.message || e?.raw || '').trim()
}

function entrySource(e) {
  const explicit = String(e?.logger || e?.source || '').trim()
  if (explicit) return explicit
  const match = String(e?.message || '').match(/^([A-Za-z0-9_.-]{2,80}):\s+/)
  return match ? match[1] : ''
}

function entryTime(e) {
  return formatTime(e?.timestamp) || '无时间'
}

function entryContext(sourceEntries, index, radius = 2) {
  if (!sourceEntries.length) return []
  const safeIndex = Math.max(0, Math.min(index ?? sourceEntries.length - 1, sourceEntries.length - 1))
  const start = Math.max(0, safeIndex - radius)
  const end = Math.min(sourceEntries.length - 1, safeIndex + radius)
  const rows = []
  for (let i = start; i <= end; i += 1) {
    rows.push({ index: i, entry: sourceEntries[i], relation: i < safeIndex ? '上文' : i > safeIndex ? '下文' : '当前' })
  }
  return rows
}

function isValidLogFile(file) {
  const name = String(file?.name || '').trim()
  if (!name) return false
  if (/^log files in\b/i.test(name) || name.endsWith(':')) return false
  if (/[\\/]/.test(name)) return false
  return /\.(log|txt|jsonl)$/i.test(name)
}

function normalizeLogFiles(files) {
  return (Array.isArray(files) ? files : [])
    .filter(isValidLogFile)
    .map(f => ({ ...f, name: String(f.name).trim() }))
}

function zhLogError(err) {
  const msg = String(err?.message || err || '')
  const notFound = msg.match(/Log file not found:\s*(.+)$/i)
  if (notFound) return `日志文件不存在：${notFound[1]}`
  if (/log file name is required/i.test(msg)) return '请选择一个日志文件'
  if (/failed to read log/i.test(msg)) return msg.replace(/Failed to read log/i, '读取日志失败')
  return msg || '未知错误'
}

/** Highlight substrings matching `query` in an HTML-escaped text. */
function highlight(text, query) {
  if (!query) return text
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig')
  return text.replace(re, '<mark class="hm-log-hl">$1</mark>')
}

/** Trigger a browser file download of `content` as `filename`. */
function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-logs-page'
  el.dataset.engine = 'hermes'

  // --- State ---
  let logFiles = []
  let activeFile = ''
  let entries = []
  let loading = false
  let levelFilter = 'ALL'
  let searchQuery = ''
  let lineLimit = 200
  let autoScroll = true
  let tailing = false          // auto-refresh tick active
  let downloading = false
  let tailTimer = null
  let selectedEntryIndex = null

  // --- Data ---
  async function loadFiles() {
    try {
      logFiles = normalizeLogFiles(await api.hermesLogsList())
      if (!logFiles.some(f => f.name === activeFile)) {
        activeFile = logFiles[0]?.name || ''
      }
    } catch (e) {
      console.error('[logs] Failed to load file list:', e)
      logFiles = []
    }
  }

  async function loadEntries({ silent = false } = {}) {
    if (!activeFile) { entries = []; selectedEntryIndex = null; if (!silent) draw(); return }
    if (!silent) { loading = true; draw() }
    try {
      entries = await api.hermesLogsRead(
        activeFile,
        lineLimit,
        levelFilter !== 'ALL' ? levelFilter : null,
      )
    } catch (e) {
      entries = [{ raw: `⚠️ ${t('engine.logsLoadFailed')}：${zhLogError(e)}` }]
    }
    if (entries.length === 0) {
      selectedEntryIndex = null
    } else if (selectedEntryIndex == null || selectedEntryIndex >= entries.length) {
      selectedEntryIndex = entries.length - 1
    }
    loading = false
    draw()
  }

  function filteredEntries() {
    const indexed = entries.map((entry, index) => ({ entry, index }))
    if (!searchQuery) return indexed
    const q = searchQuery.toLowerCase()
    return indexed.filter(({ entry: e }) => {
      const hay = [e.raw, e.message, e.logger].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }

  // --- Tailing (simple poll, 2s) ---
  function startTail() {
    if (tailTimer) return
    tailing = true
    tailTimer = setInterval(() => loadEntries({ silent: true }), 2000)
    draw()
  }
  function stopTail() {
    if (tailTimer) { clearInterval(tailTimer); tailTimer = null }
    tailing = false
    draw()
  }
  function toggleTail() { tailing ? stopTail() : startTail() }

  // --- Actions ---
  async function doDownload() {
    if (!activeFile || downloading) return
    downloading = true
    draw()
    try {
      const result = await api.hermesLogsDownload(activeFile)
      if (typeof result === 'string') {
        triggerDownload(result, activeFile)
        toast(t('engine.logsDownloadBrowserOk'), 'success', { duration: 5000 })
      } else {
        const path = result?.path || ''
        toast(t('engine.logsDownloadOk').replace('{path}', path), 'success', { duration: 7000 })
      }
    } catch (e) {
      toast(t('engine.logsDownloadFailed') + ': ' + (e?.message || e), 'error')
    }
    downloading = false
    draw()
  }

  function doClearView() {
    // Local-only clear: drop rendered entries. The file on disk is untouched.
    entries = []
    selectedEntryIndex = null
    draw()
  }

  // --- Rendering ---
  function renderLevelBadge(lvl, tone) {
    return `<span class="hm-log-level" data-tone="${tone || ''}">${escHtml(levelLabel(lvl) || '-')}</span>`
  }

  function renderEntry(item) {
    const e = item.entry || {}
    const index = item.index
    const lvl = (e.level || '').toUpperCase()
    const tone = LEVEL_TONE[lvl] || ''
    const logger = e.logger || ''
    const time = formatTime(e.timestamp)
    const rawMsg = e.message || ''
    const access = parseAccessLog(rawMsg)
    const selected = index === selectedEntryIndex ? ' is-selected' : ''

    // Raw (unparsed) fallback — preserve full line
    if (!e.timestamp && !lvl) {
      const raw = escHtml(e.raw || '')
      return `<button type="button" class="hm-log-entry hm-log-entry--raw${selected}" data-index="${index}">
        <span class="hm-log-msg">${highlight(raw, searchQuery)}</span>
      </button>`
    }

    let msgHtml
    if (access) {
      const statusClass = `hm-log-status--${access.status?.[0] || 'x'}xx`
      msgHtml = `
        <span class="hm-log-access">
          <span class="hm-log-method">${escHtml(access.method)}</span>
          <span class="hm-log-path">${escHtml(access.path)}</span>
          ${access.status ? `<span class="hm-log-status ${statusClass}">${escHtml(access.status)}</span>` : ''}
        </span>
      `
    } else {
      msgHtml = `<span class="hm-log-msg">${highlight(escHtml(rawMsg), searchQuery)}</span>`
    }

    return `<button type="button" class="hm-log-entry${selected}" data-tone="${tone}" data-index="${index}">
      <span class="hm-log-time">${escHtml(time)}</span>
      ${renderLevelBadge(lvl, tone)}
      ${logger ? `<span class="hm-log-logger">${highlight(escHtml(logger), searchQuery)}</span>` : ''}
      ${msgHtml}
    </button>`
  }

  function renderSelectedContext(activeMeta) {
    if (loading) return ''
    if (!entries.length) {
      return `<div class="hm-logs-context hm-logs-context--empty">
        <div class="hm-logs-context-title">当前项目暂无日志上下文</div>
        <div class="hm-logs-context-sub">选择其他项目或刷新后再查看。</div>
      </div>`
    }

    const safeIndex = Math.max(0, Math.min(selectedEntryIndex ?? entries.length - 1, entries.length - 1))
    const selected = entries[safeIndex] || {}
    const lvl = (selected.level || '').toUpperCase()
    const tone = LEVEL_TONE[lvl] || ''
    const source = entrySource(selected) || activeMeta.title
    const rows = entryContext(entries, safeIndex, 2)

    return `<div class="hm-logs-context" data-tone="${tone}">
      <div class="hm-logs-context-head">
        <div>
          <div class="hm-logs-context-kicker">当前记录</div>
          <div class="hm-logs-context-title">${escHtml(activeMeta.title)}</div>
        </div>
        <div class="hm-logs-context-time">
          <span>时间</span>
          <strong>${escHtml(entryTime(selected))}</strong>
        </div>
      </div>
      <div class="hm-logs-context-meta">
        <span>${escHtml(activeMeta.kind)}</span>
        ${renderLevelBadge(lvl, tone)}
        <span title="${escHtml(source)}">${escHtml(source)}</span>
        <span title="${escHtml(activeMeta.fileName)}">原始文件：${escHtml(activeMeta.fileName)}</span>
      </div>
      <div class="hm-logs-context-current">${highlight(escHtml(entryText(selected) || selected.raw || '（无内容）'), searchQuery)}</div>
      <div class="hm-logs-context-list">
        <div class="hm-logs-context-label">上下文</div>
        ${rows.map(({ index, entry, relation }) => `
          <button type="button" class="hm-logs-context-row ${index === safeIndex ? 'is-current' : ''}" data-index="${index}">
            <span class="hm-logs-context-row-rel">${relation}</span>
            <span class="hm-logs-context-row-time">${escHtml(entryTime(entry))}</span>
            <span class="hm-logs-context-row-text">${highlight(escHtml(entryText(entry) || entry.raw || ''), searchQuery)}</span>
          </button>
        `).join('')}
      </div>
    </div>`
  }

  function draw() {
    const filtered = filteredEntries()
    const totalVisible = filtered.length
    const totalLoaded = entries.length
    const activeMeta = projectLabelForFile(activeFile)

    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">
            <span class="hm-dot hm-dot--${tailing ? 'run' : 'idle'}"></span>
            ${tailing ? t('engine.logsTailing') : t('engine.logsEyebrow')}
          </div>
          <h1 class="hm-hero-h1">${t('engine.hermesLogsTitle')}</h1>
          <div class="hm-hero-sub">${activeFile ? `${escHtml(activeMeta.title)} · ~/.hermes/logs/${escHtml(activeMeta.fileName)}` : '~/.hermes/logs/'}</div>
        </div>
        <div class="hm-hero-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm hm-logs-tail ${tailing ? 'is-active' : ''}" title="${t('engine.logsToggleTail')}">
            ${tailing ? ICONS.pause : ICONS.play} ${tailing ? t('engine.logsTailStop') : t('engine.logsTailStart')}
          </button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm hm-logs-download" ${!activeFile || downloading ? 'disabled' : ''} title="${t('engine.logsDownload')}">
            ${ICONS.download} ${downloading ? '…' : t('engine.logsDownload')}
          </button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm hm-logs-refresh" ${loading ? 'disabled' : ''} title="${t('engine.logsRefresh')}">
            ${ICONS.refresh} ${t('engine.logsRefresh')}
          </button>
        </div>
      </div>

      <div class="hm-logs-layout">
        <aside class="hm-logs-sidebar">
          <div class="hm-panel-title hm-logs-sidebar-title">日志项目</div>
          <div class="hm-logs-file-list">
            ${logFiles.length === 0
              ? `<div class="hm-logs-empty hm-muted">${t('engine.logsNoFiles')}</div>`
              : logFiles.map(f => {
                const meta = projectLabelForFile(f.name)
                return `
                <button class="hm-logs-file-item ${f.name === activeFile ? 'is-active' : ''}" data-file="${escHtml(f.name)}">
                  <span class="hm-logs-file-copy">
                    <span class="hm-logs-file-name">${escHtml(meta.title)}</span>
                    <span class="hm-logs-file-desc">${escHtml(meta.desc)}</span>
                  </span>
                  <span class="hm-logs-file-meta">
                    <span class="hm-logs-file-kind">${escHtml(meta.kind)}</span>
                    <span class="hm-logs-file-size">${formatSize(f.size)}</span>
                  </span>
                </button>
              `}).join('')}
          </div>
        </aside>

        <section class="hm-logs-main">
          <div class="hm-logs-toolbar">
            <label class="hm-logs-toolbar-item">
              <span class="hm-field-label">${t('engine.logsLevel')}</span>
              <select id="hm-logs-level" class="hm-input hm-logs-select">
                ${LOG_LEVELS.map(l => `<option value="${l}" ${l === levelFilter ? 'selected' : ''}>${levelLabel(l)}</option>`).join('')}
              </select>
            </label>
            <label class="hm-logs-toolbar-item">
              <span class="hm-field-label">${t('engine.logsLinesLabel')}</span>
              <select id="hm-logs-lines" class="hm-input hm-logs-select">
                ${[100, 200, 500, 1000].map(n => `<option value="${n}" ${n === lineLimit ? 'selected' : ''}>${n} ${t('engine.logsLines')}</option>`).join('')}
              </select>
            </label>
            <label class="hm-logs-toolbar-item hm-logs-toolbar-item--grow">
              <span class="hm-field-label">${t('engine.logsSearchLabel')}</span>
              <input type="text" id="hm-logs-search" class="hm-input" placeholder="${t('engine.logsSearch')}" value="${escHtml(searchQuery)}">
            </label>
            <div class="hm-logs-toolbar-item hm-logs-toolbar-actions">
              <button class="hm-btn hm-btn--ghost hm-btn--sm hm-logs-clear" ${!entries.length ? 'disabled' : ''} title="${t('engine.logsClear')}">
                ${ICONS.clear}
              </button>
            </div>
          </div>
          <div class="hm-logs-count hm-muted">
            ${totalVisible} / ${totalLoaded} ${t('engine.logsEntries')}
            ${searchQuery ? `· ${t('engine.logsFilteredBy')} "${escHtml(searchQuery)}"` : ''}
          </div>
          ${renderSelectedContext(activeMeta)}

          <div class="hm-logs-content" id="hm-logs-content">
            ${loading ? `
              <div class="hm-logs-loading">
                <div class="hm-skel" style="width:70%;height:14px;margin-bottom:10px"></div>
                <div class="hm-skel" style="width:80%;height:14px;margin-bottom:10px"></div>
                <div class="hm-skel" style="width:60%;height:14px"></div>
              </div>
            ` : ''}
            ${!loading && totalVisible === 0 ? `<div class="hm-logs-empty-content hm-muted">${t('engine.logsEmpty')}</div>` : ''}
            ${!loading ? filtered.map(renderEntry).join('') : ''}
          </div>
        </section>
      </div>
    `
    bind()
    if (autoScroll && !loading) {
      const content = el.querySelector('#hm-logs-content')
      if (content) content.scrollTop = content.scrollHeight
    }
  }

  // --- Event binding ---
  function bind() {
    el.querySelector('.hm-logs-refresh')?.addEventListener('click', () => loadEntries())
    el.querySelector('.hm-logs-tail')?.addEventListener('click', toggleTail)
    el.querySelector('.hm-logs-download')?.addEventListener('click', doDownload)
    el.querySelector('.hm-logs-clear')?.addEventListener('click', doClearView)

    el.querySelectorAll('.hm-logs-file-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.file === activeFile) return
        activeFile = item.dataset.file
        selectedEntryIndex = null
        loadEntries()
      })
    })

    el.querySelectorAll('.hm-log-entry[data-index], .hm-logs-context-row[data-index]').forEach(item => {
      item.addEventListener('click', () => {
        const nextIndex = Number.parseInt(item.dataset.index, 10)
        if (!Number.isFinite(nextIndex)) return
        selectedEntryIndex = nextIndex
        autoScroll = false
        draw()
      })
    })

    el.querySelector('#hm-logs-level')?.addEventListener('change', (e) => {
      levelFilter = e.target.value
      loadEntries()
    })

    el.querySelector('#hm-logs-lines')?.addEventListener('change', (e) => {
      lineLimit = parseInt(e.target.value) || 200
      loadEntries()
    })

    el.querySelector('#hm-logs-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value
      draw()
    })
  }

  // --- Lifecycle: stop tail when the page is detached ---
  const detachObserver = new MutationObserver(() => {
    if (!el.isConnected) {
      stopTail()
      detachObserver.disconnect()
    }
  })
  requestAnimationFrame(() => {
    if (el.parentNode) detachObserver.observe(el.parentNode, { childList: true })
  })

  // --- Init ---
  async function init() {
    await loadFiles()
    await loadEntries()
  }
  init()

  return el
}
