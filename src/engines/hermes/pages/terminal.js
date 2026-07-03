import { toast } from '../../../components/toast.js'
import { api } from '../../../lib/tauri-api.js'

const HERMES_WEB_DEFAULT_PORT = 9119
const HERMES_WEB_PATH = '/chat'

function hermesWebUrl(port) {
  return `http://127.0.0.1:${port || HERMES_WEB_DEFAULT_PORT}${HERMES_WEB_PATH}`
}

function hermesWebReady(result) {
  if (!result || typeof result !== 'object') return false
  return result.running === true && result.ready === true
}

function hermesWebIssueMessage(result) {
  const port = result?.port || HERMES_WEB_DEFAULT_PORT
  if (result?.kind === 'frontend_not_built') {
    return `Hermes 原生 Web 服务已启动在 ${port}，但前端资源未构建，暂时不能打开。`
  }
  if (result?.kind === 'frontend_unavailable') {
    return `Hermes 原生 Web 服务已启动在 ${port}，但没有返回可用页面。`
  }
  if (result?.kind === 'timeout') {
    return `Hermes 原生 Web 启动超时，端口 ${port} 暂未 ready。`
  }
  const detail = String(result?.log_tail || result?.error || '').split('\n').slice(-2).join('\n').trim()
  return `Hermes 原生 Web 暂不可用，端口 ${port} 未返回可用页面。${detail ? `\n${detail}` : ''}`
}

async function openExternalUrl(url) {
  if (!url) return
  if (window.__TAURI_INTERNALS__) {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
    return
  }
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) throw new Error('popup blocked')
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page'
  el.dataset.engine = 'hermes'
  el.innerHTML = `
    <div class="hm-hero">
      <div class="hm-hero-title">
        <div class="hm-hero-eyebrow">HERMES AGENT · NATIVE WEB</div>
        <h1 class="hm-hero-h1">Hermes Web</h1>
        <div class="hm-hero-sub" id="hm-web-status">正在准备打开 127.0.0.1:${HERMES_WEB_DEFAULT_PORT}</div>
      </div>
      <div class="hm-hero-actions">
        <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-web-open">打开 Hermes Web</button>
        <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-web-back">返回聊天</button>
      </div>
    </div>

    <div class="hm-panel">
      <div class="hm-panel-header">
        <div>
          <div class="hm-panel-title">Hermes 原生 Web 中转</div>
          <div class="hm-muted" style="margin-top:4px">此页面会检测并启动 Hermes 原生 Web，然后打开 9119 端口页面。</div>
        </div>
      </div>
      <div class="hm-panel-body">
        <div style="display:grid;gap:12px;max-width:820px">
          <div id="hm-web-message" style="padding:14px;border:1px solid var(--hm-border);border-radius:var(--hm-radius);background:var(--hm-surface-0)">
            正在检测 Hermes 原生 Web...
          </div>
          <div class="hm-muted">
            这个入口只负责打开 Hermes 原生 Web 页面；如果前端资源缺失，会明确提示“原生 Web 前端未构建”。
          </div>
        </div>
      </div>
    </div>
  `

  const statusEl = el.querySelector('#hm-web-status')
  const messageEl = el.querySelector('#hm-web-message')
  const openBtn = el.querySelector('#hm-web-open')

  const setMessage = (message, tone = 'info') => {
    if (statusEl) statusEl.textContent = message
    if (messageEl) {
      messageEl.textContent = message
      messageEl.dataset.tone = tone
    }
  }

  const openHermesWeb = async () => {
    if (openBtn) {
      openBtn.disabled = true
      openBtn.textContent = '正在打开...'
    }
    try {
      setMessage('正在检测 Hermes 原生 Web...', 'info')
      const probe = await api.hermesDashboardProbe().catch(() => ({ running: false, port: HERMES_WEB_DEFAULT_PORT }))
      if (hermesWebReady(probe)) {
        const url = hermesWebUrl(probe.port)
        await openExternalUrl(url)
        setMessage(`Hermes Web 已打开：${url}`, 'success')
        toast('Hermes Web 已打开。', 'success')
        return
      }

      if (probe?.running && probe?.ready === false) {
        const message = hermesWebIssueMessage(probe)
        setMessage(message, 'warning')
        toast(message, 'warning', { duration: 8000 })
        return
      }

      setMessage('Hermes 原生 Web 未运行，正在启动...', 'info')
      const result = await api.hermesDashboardStart().catch((err) => ({
        started: false,
        kind: 'spawn_failed',
        port: probe?.port || HERMES_WEB_DEFAULT_PORT,
        log_tail: String(err?.message || err),
      }))
      if (hermesWebReady(result)) {
        const url = hermesWebUrl(result.port || probe?.port)
        await openExternalUrl(url)
        setMessage(`Hermes Web 已启动并打开：${url}`, 'success')
        toast('Hermes Web 已启动并打开。', 'success')
        return
      }

      const message = hermesWebIssueMessage(result)
      setMessage(message, 'warning')
      toast(message, 'warning', { duration: 8000 })
    } catch (err) {
      const message = `Hermes Web 打开失败：${err?.message || err}`
      setMessage(message, 'error')
      toast(message, 'error', { duration: 8000 })
    } finally {
      if (openBtn) {
        openBtn.disabled = false
        openBtn.textContent = '打开 Hermes Web'
      }
    }
  }

  openBtn?.addEventListener('click', openHermesWeb)
  el.querySelector('#hm-web-back')?.addEventListener('click', () => {
    window.location.hash = '#/h/chat'
  })

  setTimeout(openHermesWeb, 0)

  return el
}
