import { ensureClaudeCodeStarted } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'

const PRODUCT_VERSION = 'YY1.0.1'

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function getPanelUrl(res, status) {
  return res?.panelUrl || res?.url || status?.panelUrl || status?.url || status?.panel?.url || ''
}

async function loadStatus(page) {
  const state = page.querySelector('#cloudcode-launch-state')
  try {
    state.innerHTML = '<div class="hm-muted">正在连接 Claude Code...</div>'
    const res = await ensureClaudeCodeStarted()
    const status = res?.status || res || {}
    const version = status?.version || 'Claude Code CLI'
    const mode = res?.mode || status?.mode || 'unknown'
    const panelUrl = getPanelUrl(res, status)
    const panelRunning = !!(status?.panel?.running || res?.started || (mode === 'panel' && panelUrl))
    const modeLabel = mode === 'cli' ? 'CLI 直连' : mode === 'panel' ? '面板' : mode
    const statusLine = `${PRODUCT_VERSION} · ${version} · ${modeLabel}`

    if (panelUrl && (panelRunning || status?.needsPanel)) {
      state.innerHTML = `
        <div style="color:var(--hm-success);margin-bottom:12px">${esc(statusLine)}</div>
        <div class="hm-muted" style="line-height:1.6;margin-bottom:16px">
          Claude Code 控制面板已接通，SuperClaw 已为 Hermes 准备好便携 Claude Code 运行时。
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <a class="hm-btn hm-btn--primary" id="cloudcode-open-panel" href="${esc(panelUrl)}">进入 Claude 控制台</a>
          <a class="hm-link" id="cloudcode-panel-url" href="${esc(panelUrl)}">${esc(panelUrl)}</a>
        </div>
      `
      page.querySelector('#cloudcode-open-panel')?.addEventListener('click', (e) => {
        e.preventDefault()
        window.location.assign(panelUrl)
      })
      page.querySelector('#cloudcode-panel-url')?.addEventListener('click', (e) => {
        e.preventDefault()
        window.location.assign(panelUrl)
      })
      return
    }

    state.innerHTML = `
      <div style="color:var(--hm-success);margin-bottom:12px">${esc(statusLine)}</div>
      <div class="hm-muted" style="line-height:1.6">
        Claude Code 已作为便携 CLI 接通。当前运行时不要求单独控制面板。
      </div>
    `
  } catch (e) {
    const msg = e?.message || e
    state.innerHTML = `
      <div style="color:var(--hm-error);margin-bottom:12px">Claude Code 检测失败：${esc(msg)}</div>
      <button class="hm-btn hm-btn--primary" id="cloudcode-retry">重试</button>
    `
    page.querySelector('#cloudcode-retry')?.addEventListener('click', () => loadStatus(page))
    toast('Claude Code 检测失败：' + msg, 'error')
  }
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page hm-page'
  page.dataset.engine = 'hermes'
  page.innerHTML = `
    <div class="hm-hero">
      <div class="hm-hero-eyebrow">CLOUDCODE · CLAUDE CODE</div>
      <h1 class="hm-hero-h1">Claude Code 直连状态</h1>
      <p class="hm-hero-sub">检测便携 Claude Code CLI，并在需要时启动本地 Claude Code 面板。</p>
    </div>
    <div class="hm-panel"><div class="hm-panel-body" id="cloudcode-launch-state">检测中...</div></div>
  `

  loadStatus(page)
  return page
}
