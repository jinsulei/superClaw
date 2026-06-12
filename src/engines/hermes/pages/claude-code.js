import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { COLLAB_TARGETS, consumePendingDispatch, updateCollaborationTask } from '../../../lib/collaboration.js'

const PRODUCT_VERSION = 'YY1.0.1'

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function statusText(ok, text) {
  return `<div style="color:${ok ? 'var(--hm-success)' : 'var(--hm-error)'};margin-bottom:12px">${esc(text)}</div>`
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

async function consumeClaudeCollaboration(page) {
  const pending = consumePendingDispatch(COLLAB_TARGETS.claudeCode)
  if (!pending?.message) return null
  const stage = pending.stage || 'review'
  updateCollaborationTask(pending.taskId, {
    status: stage === 'review' ? 'reviewer_running' : 'executor_running',
    lastDispatchedTo: COLLAB_TARGETS.claudeCode,
    claudeCodePanelOpenedAt: Date.now(),
  })
  const ok = await copyText(pending.message)
  const hint = page.querySelector('#cloudcode-collab-state')
  if (hint) {
    hint.style.display = ''
    hint.innerHTML = `
      <strong>${stage === 'review' ? 'Claude Code 验收任务' : 'Claude Code 执行任务'}</strong>
      <div class="hm-muted" style="margin-top:6px;line-height:1.7">
        Hermes 已把任务单交给 Claude Code。任务内容${ok ? '已复制到剪贴板' : '复制到剪贴板失败，请回到 Hermes 复制'}；
        进入原生面板后直接粘贴即可继续。
      </div>
    `
  }
  toast(ok ? 'Claude Code 协作任务单已复制。' : 'Claude Code 任务单未能自动复制。', ok ? 'success' : 'warning')
  return pending
}

function bindActions(page) {
  page.querySelector('#cloudcode-open-panel')?.addEventListener('click', () => openPanel(page))
  page.querySelector('#cloudcode-open-native')?.addEventListener('click', () => openNative(page))
  page.querySelector('#cloudcode-stop-native')?.addEventListener('click', () => stopNative(page))
  page.querySelector('#cloudcode-refresh')?.addEventListener('click', () => loadStatus(page))
}

function redirectToPanel(url) {
  window.location.href = url || 'http://127.0.0.1:3020/'
}

async function openPanel(page) {
  const state = page.querySelector('#cloudcode-launch-state')
  const btn = page.querySelector('#cloudcode-open-panel')
  if (btn) btn.disabled = true
  if (state) {
    state.innerHTML = `
      ${statusText(true, '正在启动 Claude Code 控制面板...')}
      <div class="hm-muted" style="line-height:1.7">启动成功后会自动进入 3020 原生面板。</div>
    `
  }
  try {
    const res = await api.claudeCodeStart()
    const url = res?.panelUrl || res?.url || res?.status?.panelUrl || 'http://127.0.0.1:3020/'
    toast('Claude Code 控制面板已启动', 'success')
    redirectToPanel(url)
  } catch (e) {
    const msg = e?.message || e
    if (state) {
      state.innerHTML = `
        ${statusText(false, `Claude Code 控制面板启动失败：${msg}`)}
        <div class="hm-muted" style="line-height:1.7;margin-bottom:16px">
          这不是 Claude 账号激活问题，而是本地 3020 面板服务没有启动成功。需要检查面板资源或 panel.err.log。
          如果你要登录/激活 Claude Code，可以临时打开原生终端处理。
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="hm-btn hm-btn--primary" id="cloudcode-open-panel">重试打开控制面板</button>
          <button class="hm-btn hm-btn--ghost" id="cloudcode-open-native">打开 Claude Code 终端</button>
          <button class="hm-btn hm-btn--ghost" id="cloudcode-refresh">刷新状态</button>
        </div>
      `
    }
    toast(`Claude Code 控制面板启动失败：${msg}`, 'error')
    bindActions(page)
  } finally {
    if (btn) btn.disabled = false
  }
}

async function openNative(page) {
  try {
    await api.claudeCodeNativeStart()
    toast('Claude Code 终端已打开', 'success')
    await loadStatus(page)
  } catch (e) {
    toast(`Claude Code 终端启动失败：${e?.message || e}`, 'error')
  }
}

async function stopNative(page) {
  try {
    const res = await api.claudeCodeNativeStop()
    toast(res?.message || 'Claude Code 终端已关闭', 'success')
    await loadStatus(page)
  } catch (e) {
    toast(`关闭 Claude Code 终端失败：${e?.message || e}`, 'error')
  }
}

async function loadStatus(page) {
  const state = page.querySelector('#cloudcode-launch-state')
  if (!state) return
  state.innerHTML = '<div class="hm-muted">正在检测 Claude Code...</div>'
  try {
    const status = await api.claudeCodeStatus()
    const version = status?.version || '未检测到版本'
    const installed = !!status?.installed
    const panelRunning = !!(status?.running || status?.panel?.running)
    const url = status?.panelUrl || status?.url || status?.panel?.url || 'http://127.0.0.1:3020/'
    state.innerHTML = `
      ${statusText(installed, `${PRODUCT_VERSION} · ${esc(version)} · ${panelRunning ? '控制面板已运行' : '控制面板未启动'}`)}
      <div class="hm-muted" style="line-height:1.7;margin-bottom:16px">
        Claude Code 入口优先进入 3020 控制面板。终端只作为登录、激活或排查时的备用入口。
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="hm-btn hm-btn--primary" id="cloudcode-open-panel">${panelRunning ? '进入 Claude Code 控制面板' : '启动 Claude Code 控制面板'}</button>
        <button class="hm-btn hm-btn--ghost" id="cloudcode-open-native">打开 Claude Code 终端</button>
        <button class="hm-btn hm-btn--ghost" id="cloudcode-stop-native">关闭终端</button>
        <button class="hm-btn hm-btn--ghost" id="cloudcode-refresh">刷新状态</button>
      </div>
      <div class="hm-muted" style="margin-top:12px">面板地址：${esc(url)}</div>
    `
  } catch (e) {
    state.innerHTML = `
      ${statusText(false, `Claude Code 检测失败：${e?.message || e}`)}
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
      <h1 class="hm-hero-h1">Claude Code 控制面板</h1>
      <p class="hm-hero-sub">从 SuperClaw 启动 Claude Code 本地控制面板。真实对话仍由 Claude Code 本体处理。</p>
    </div>
    <div class="hm-panel" id="cloudcode-collab-state" style="display:none"></div>
    <div class="hm-panel"><div class="hm-panel-body" id="cloudcode-launch-state">正在进入...</div></div>
  `

  await consumeClaudeCollaboration(page)
  setTimeout(() => openPanel(page), 0)
  return page
}
