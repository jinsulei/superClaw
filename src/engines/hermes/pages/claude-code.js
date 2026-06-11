import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'

const PRODUCT_VERSION = 'YY1.0.1'

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function statusText(ok, text) {
  return `<div style="color:${ok ? 'var(--hm-success)' : 'var(--hm-error)'};margin-bottom:12px">${esc(text)}</div>`
}

async function launchNative(page) {
  const state = page.querySelector('#cloudcode-launch-state')
  const btn = page.querySelector('#cloudcode-open-native')
  if (btn) btn.disabled = true
  try {
    const res = await api.claudeCodeNativeStart()
    const status = res?.status || {}
    const version = status?.version || 'Claude Code CLI'
    state.innerHTML = `
      ${statusText(true, `${PRODUCT_VERSION} · ${esc(version)} · 原生终端已打开`)}
      <div class="hm-muted" style="line-height:1.7">
        已调起 Claude Code 原生命令窗口。控制面板只负责启动与状态提示，真实对话在 Claude Code 终端内完成。
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        <button class="hm-btn hm-btn--primary" id="cloudcode-open-native">重新打开原生终端</button>
        <button class="hm-btn hm-btn--ghost" id="cloudcode-stop-native">关闭原生终端</button>
      </div>
    `
    toast('Claude Code 原生终端已打开', 'success')
  } catch (e) {
    const msg = e?.message || e
    state.innerHTML = `
      ${statusText(false, `Claude Code 原生终端启动失败：${esc(msg)}`)}
      <button class="hm-btn hm-btn--primary" id="cloudcode-open-native">重试打开原生终端</button>
    `
    toast('Claude Code 原生终端启动失败：' + msg, 'error')
  } finally {
    bindActions(page)
  }
}

async function stopNative(page) {
  try {
    const res = await api.claudeCodeNativeStop()
    toast(res?.message || 'Claude Code 原生终端已关闭', 'success')
    await loadStatus(page)
  } catch (e) {
    toast('关闭 Claude Code 原生终端失败：' + (e?.message || e), 'error')
  }
}

function bindActions(page) {
  page.querySelector('#cloudcode-open-native')?.addEventListener('click', () => launchNative(page))
  page.querySelector('#cloudcode-stop-native')?.addEventListener('click', () => stopNative(page))
  page.querySelector('#cloudcode-refresh')?.addEventListener('click', () => loadStatus(page))
}

async function loadStatus(page) {
  const state = page.querySelector('#cloudcode-launch-state')
  state.innerHTML = '<div class="hm-muted">正在检测 Claude Code CLI...</div>'
  try {
    const status = await api.claudeCodeStatus()
    const version = status?.version || '未检测到版本'
    const installed = !!status?.installed
    const connected = !!status?.connected
    state.innerHTML = `
      ${statusText(installed && connected, `${PRODUCT_VERSION} · ${esc(version)} · ${installed && connected ? 'CLI 已接通' : 'CLI 未就绪'}`)}
      <div class="hm-muted" style="line-height:1.7;margin-bottom:16px">
        这里启动的是 Claude Code 原生命令窗口，不跳转到 3020 控制面板。客户版会优先使用包内便携 Claude Code，不依赖桌面快捷方式，也不会内置真实 API Key。
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="hm-btn hm-btn--primary" id="cloudcode-open-native" ${installed ? '' : 'disabled'}>打开 Claude Code 原生终端</button>
        <button class="hm-btn hm-btn--ghost" id="cloudcode-stop-native">关闭原生终端</button>
        <button class="hm-btn hm-btn--ghost" id="cloudcode-refresh">刷新状态</button>
      </div>
    `
  } catch (e) {
    const msg = e?.message || e
    state.innerHTML = `
      ${statusText(false, `Claude Code 检测失败：${esc(msg)}`)}
      <button class="hm-btn hm-btn--primary" id="cloudcode-refresh">重试检测</button>
    `
  }
  bindActions(page)
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page hm-page'
  page.dataset.engine = 'hermes'
  page.innerHTML = `
    <div class="hm-hero">
      <div class="hm-hero-eyebrow">CLOUDCODE · CLAUDE CODE</div>
      <h1 class="hm-hero-h1">Claude Code 原生终端</h1>
      <p class="hm-hero-sub">从 SuperClaw 控制台调起 Claude Code 原生命令窗口，真实对话仍交给 Claude Code 本体执行。</p>
    </div>
    <div class="hm-panel"><div class="hm-panel-body" id="cloudcode-launch-state">检测中...</div></div>
  `

  loadStatus(page)
  return page
}
