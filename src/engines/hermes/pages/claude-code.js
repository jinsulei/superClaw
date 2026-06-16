import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { COLLAB_TARGETS, buildTaskContext, consumePendingDispatch, createTaskDelegate, createTaskProgress, createTaskResult, normalizeClaudeCodeMode, updateCollaborationTask } from '../../../lib/collaboration.js'
import { ocr, formatOcrResult } from '../../../lib/ocr-service.js'

const PRODUCT_VERSION = 'YY1.0.1'

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

const escAttr = esc

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
  const modeInfo = normalizeClaudeCodeMode(pending)
  page.dataset.collabTaskId = pending.taskId || ''
  page.dataset.collabSessionId = pending.session_id || pending.sessionId || ''
  page.dataset.collabContext = JSON.stringify(pending.context || {})
  page.dataset.collabStage = stage
  page.dataset.claudeCodeMode = modeInfo.mode
  page.dataset.permissionLevel = modeInfo.permission_level
  page.dataset.requiresConfirmation = modeInfo.requires_confirmation ? 'true' : 'false'
  updateCollaborationTask(pending.taskId, {
    status: stage === 'review' ? 'reviewer_running' : 'executor_running',
    lastDispatchedTo: COLLAB_TARGETS.claudeCode,
    claudeCodePanelOpenedAt: Date.now(),
    claudeCodeMode: modeInfo.mode,
    claudeCodePermissionLevel: modeInfo.permission_level,
    claudeCodeRequiresConfirmation: modeInfo.requires_confirmation,
    context: pending.context || null,
    artifacts: pending.artifacts || [],
  })
  createTaskProgress({
    taskId: pending.taskId,
    sessionId: pending.session_id || pending.sessionId,
    fromAgent: COLLAB_TARGETS.claudeCode,
    toAgent: COLLAB_TARGETS.hermes,
    title: `Claude Code ${stage} accepted`,
    content: modeInfo.requires_confirmation
      ? 'Claude Code takeover task received and is waiting for explicit user confirmation.'
      : `Claude Code task received in ${modeInfo.mode} mode.`,
    mode: modeInfo.mode,
    permission_level: modeInfo.permission_level,
    requires_confirmation: modeInfo.requires_confirmation,
    context: pending.context || null,
    artifacts: pending.artifacts || [],
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
    const modeLine = document.createElement('div')
    modeLine.className = 'hm-muted'
    modeLine.style.cssText = 'margin-top:10px;line-height:1.7'
    modeLine.innerHTML = `Mode: <code>${esc(modeInfo.mode)}</code> · Permission: <code>${esc(modeInfo.permission_level)}</code>${modeInfo.requires_confirmation ? ' · Requires explicit confirmation before takeover' : ''}`
    hint.appendChild(modeLine)
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px'
    actions.innerHTML = `
      <button class="hm-btn hm-btn--primary hm-btn--sm" id="cloudcode-return-hermes">回传结果给 Hermes</button>
      <button class="hm-btn hm-btn--ghost hm-btn--sm" id="cloudcode-delegate-hermes">委派给 Hermes</button>
    `
    hint.appendChild(actions)
  }
  toast(ok ? 'Claude Code 协作任务单已复制。' : 'Claude Code 任务单未能自动复制。', ok ? 'success' : 'warning')
  return pending
}

function openHermesReturnBox(page, mode = 'result') {
  const taskId = page.dataset.collabTaskId || `claude-${Date.now().toString(36)}`
  const sessionId = page.dataset.collabSessionId || undefined
  const modeInfo = normalizeClaudeCodeMode(page.dataset.claudeCodeMode || 'safe')
  let inheritedContext = {}
  try { inheritedContext = JSON.parse(page.dataset.collabContext || '{}') || {} } catch {}
  const title = mode === 'delegate' ? 'Claude Code delegate to Hermes' : 'Claude Code result to Hermes'
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-title">${esc(title)}</div>
      <div class="modal-body">
        <textarea id="cloudcode-hermes-content" class="form-input" rows="8" style="width:100%;resize:vertical"
          placeholder="${mode === 'delegate' ? 'Describe the task Hermes should handle, with context and constraints.' : 'Paste Claude Code result, logs, file paths, or error details.'}"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-act="cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" data-act="ok">Send</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  const close = () => overlay.remove()
  overlay.querySelector('[data-act="cancel"]')?.addEventListener('click', close)
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close() })
  overlay.querySelector('[data-act="ok"]')?.addEventListener('click', () => {
    const content = overlay.querySelector('#cloudcode-hermes-content')?.value?.trim() || ''
    if (!content) {
      toast('Please enter content to send to Hermes.', 'warning')
      return
    }
    if (mode === 'delegate') {
      const context = buildTaskContext({
        sessionId,
        taskId,
        context: inheritedContext,
        summary: content,
        recent_messages: inheritedContext.recent_messages || [],
        content,
      })
      createTaskDelegate({
        taskId,
        parentTaskId: taskId,
        sessionId,
        fromAgent: COLLAB_TARGETS.claudeCode,
        toAgent: COLLAB_TARGETS.hermes,
        title,
        content,
        context,
        mode: modeInfo.mode,
        permission_level: modeInfo.permission_level,
        requires_confirmation: modeInfo.requires_confirmation,
      })
      updateCollaborationTask(taskId, { status: 'delegated', claudeCodeDelegatedAt: Date.now() })
    } else {
      const context = buildTaskContext({
        sessionId,
        taskId,
        context: inheritedContext,
        summary: content,
        recent_messages: inheritedContext.recent_messages || [],
        content,
      })
      createTaskResult({
        taskId,
        sessionId,
        fromAgent: COLLAB_TARGETS.claudeCode,
        toAgent: COLLAB_TARGETS.hermes,
        title,
        content,
        context,
        mode: modeInfo.mode,
        permission_level: modeInfo.permission_level,
        requires_confirmation: modeInfo.requires_confirmation,
      })
      updateCollaborationTask(taskId, { status: 'claude_code_completed', claudeCodeResultAt: Date.now() })
    }
    toast('Sent to Hermes inbox.', 'success')
    close()
  })
  setTimeout(() => overlay.querySelector('#cloudcode-hermes-content')?.focus(), 0)
}

function pickImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const file = input.files?.[0] || null
      input.remove()
      resolve(file)
    }, { once: true })
    input.click()
  })
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read image failed'))
    reader.readAsDataURL(file)
  })
}

async function runClaudeCodeOcr(page) {
  const file = await pickImageFile()
  if (!file) return
  try {
    toast('OCR 正在识别...', 'info')
    const dataUrl = await readFileAsDataUrl(file)
    const result = await ocr.extractTextFromImageData(dataUrl, {
      mimeType: file.type || 'image/png',
      sourceType: 'image',
    })
    const output = formatOcrResult(result)
    if (result.ok && result.text) await copyText(result.text).catch(() => false)
    const taskId = page.dataset.collabTaskId || `claude-ocr-${Date.now().toString(36)}`
    const sessionId = page.dataset.collabSessionId || undefined
    const modeInfo = normalizeClaudeCodeMode(page.dataset.claudeCodeMode || 'safe')
    let inheritedContext = {}
    try { inheritedContext = JSON.parse(page.dataset.collabContext || '{}') || {} } catch {}
    const artifacts = [{
      type: 'ocr_text',
      path: file.name || 'claude-code-ocr-image',
      text: result.ok ? result.text : result.error,
    }]
    const context = buildTaskContext({
      sessionId,
      taskId,
      context: inheritedContext,
      artifacts,
      summary: result.ok ? result.text : result.error,
      content: result.ok ? result.text : result.error,
    })
    createTaskResult({
      taskId,
      sessionId,
      fromAgent: COLLAB_TARGETS.claudeCode,
      toAgent: COLLAB_TARGETS.hermes,
      title: result.ok ? 'Claude Code OCR completed' : 'Claude Code OCR failed',
      content: result.ok ? result.text : result.error,
      failed: !result.ok,
      tool: 'ocr',
      mode: modeInfo.mode,
      permission_level: modeInfo.permission_level,
      requires_confirmation: modeInfo.requires_confirmation,
      context,
      artifacts,
    })
    const panel = page.querySelector('#cloudcode-collab-state')
    if (panel) {
      panel.style.display = ''
      panel.innerHTML = `<strong>Claude Code OCR</strong><pre style="white-space:pre-wrap;margin-top:10px">${esc(output)}</pre>`
    }
    toast(result.ok ? 'OCR 结果已复制并回传 Hermes' : 'OCR 失败，错误已回传 Hermes', result.ok ? 'success' : 'warning')
  } catch (error) {
    toast(`OCR 失败：${error?.message || error}`, 'warning')
  }
}

function bindActions(page) {
  page.querySelector('#cloudcode-open-panel')?.addEventListener('click', () => openPanel(page))
  page.querySelector('#cloudcode-open-native')?.addEventListener('click', () => openNative(page))
  page.querySelector('#cloudcode-stop-native')?.addEventListener('click', () => stopNative(page))
  page.querySelector('#cloudcode-refresh')?.addEventListener('click', () => loadStatus(page))
  page.querySelector('#cloudcode-return-hermes')?.addEventListener('click', () => openHermesReturnBox(page, 'result'))
  page.querySelector('#cloudcode-delegate-hermes')?.addEventListener('click', () => openHermesReturnBox(page, 'delegate'))
  page.querySelector('#cloudcode-ocr-image')?.addEventListener('click', () => runClaudeCodeOcr(page))
}

function withSuperclawBase(url) {
  const target = new URL(url || 'http://127.0.0.1:3020/')
  try {
    const base = `${window.location.origin}${window.location.pathname}`
    target.searchParams.set('superclawBase', base.replace(/\/$/, ''))
  } catch {}
  return target.toString()
}

function showPanelFrame(page, url) {
  const state = page.querySelector('#cloudcode-launch-state')
  if (!state) return
  const panelUrl = withSuperclawBase(url)
  state.innerHTML = `
    <div class="hm-panel-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
      <div>
        <strong>正在进入 Claude Code 控制面板</strong>
        <div class="hm-muted" style="margin-top:4px">${esc(panelUrl)}</div>
      </div>
      <button class="hm-btn hm-btn--ghost" id="cloudcode-refresh">刷新状态</button>
    </div>
    <div class="hm-muted" style="line-height:1.7">即将以整窗方式打开 3020 原生面板。如果没有自动跳转，请点击下方按钮。</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      <button class="hm-btn hm-btn--primary" id="cloudcode-open-full-panel">进入 Claude Code 控制面板</button>
    </div>
  `
  state.querySelector('#cloudcode-open-full-panel')?.addEventListener('click', () => {
    window.location.assign(panelUrl)
  })
  bindActions(page)
  setTimeout(() => window.location.assign(panelUrl), 50)
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
    showPanelFrame(page, url)
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

  const manualPanel = document.createElement('div')
  manualPanel.className = 'hm-panel'
  manualPanel.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="hm-btn hm-btn--primary hm-btn--sm" id="cloudcode-ocr-image">OCR 识别图片</button>
      <button class="hm-btn hm-btn--ghost hm-btn--sm" id="cloudcode-return-hermes">回传结果给 Hermes</button>
      <button class="hm-btn hm-btn--ghost hm-btn--sm" id="cloudcode-delegate-hermes">委派给 Hermes</button>
    </div>
  `
  page.querySelector('#cloudcode-collab-state')?.after(manualPanel)

  await consumeClaudeCollaboration(page)
  bindActions(page)
  if (page.dataset.requiresConfirmation === 'true') {
    const state = page.querySelector('#cloudcode-launch-state')
    if (state) {
      state.innerHTML = `
        ${statusText(false, 'Claude Code takeover mode requires explicit confirmation before starting.')}
        <div class="hm-muted" style="line-height:1.7;margin-bottom:16px">
          Mode: <code>${esc(page.dataset.claudeCodeMode || 'takeover')}</code> · Permission: <code>${esc(page.dataset.permissionLevel || 'full_control')}</code>.
          The native panel will not be opened automatically.
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="hm-btn hm-btn--primary" id="cloudcode-open-panel">Confirm and start takeover panel</button>
          <button class="hm-btn hm-btn--ghost" id="cloudcode-return-hermes">Return result/reject reason to Hermes</button>
          <button class="hm-btn hm-btn--ghost" id="cloudcode-delegate-hermes">Delegate to Hermes</button>
        </div>
      `
      bindActions(page)
    }
  } else {
    setTimeout(() => openPanel(page), 0)
  }
  return page
}
