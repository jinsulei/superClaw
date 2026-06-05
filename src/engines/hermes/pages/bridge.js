import { navigate } from '../../../router.js'
import { api, ensureClaudeCodeStarted } from '../../../lib/tauri-api.js'
import { switchEngine } from '../../../lib/engine-manager.js'
import { toast } from '../../../components/toast.js'

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function statusText(ok, text) {
  return `<span style="color:${ok ? 'var(--success)' : 'var(--warning)'}">● ${esc(text)}</span>`
}

function detailText(text) {
  return `<div style="margin-top:6px;color:var(--muted);font-size:12px;line-height:1.5">${esc(text)}</div>`
}

async function loadBridgeStatus(page) {
  const hermesEl = page.querySelector('#bridge-hermes-status')
  const openclawEl = page.querySelector('#bridge-openclaw-status')
  const claudeEl = page.querySelector('#bridge-claude-status')

  try {
    const h = await api.hermesHealthCheck()
    hermesEl.innerHTML = statusText(true, h?.status || 'Hermes 在线')
  } catch (e) {
    hermesEl.innerHTML = statusText(false, 'Hermes 未连接') + detailText(e?.message || e)
  }

  try {
    const services = await api.getServicesStatus()
    const gw = services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0]
    openclawEl.innerHTML = statusText(!!gw?.running, gw?.running ? `OpenClaw 在线 · ${gw.pid || 'pid?'}` : 'OpenClaw 未启动')
  } catch (e) {
    openclawEl.innerHTML = statusText(false, 'OpenClaw 状态未知') + detailText(e?.message || e)
  }

  try {
    const c = await api.claudeCodeStatus()
    const ok = !!c?.connected || !!c?.version
    const version = c?.version || 'Claude Code CLI'
    const mode = c?.mode === 'cli' ? 'CLI 直连' : '未知模式'
    claudeEl.innerHTML = statusText(ok, ok ? `${version} · ${mode}` : 'Claude Code 未接通')
      + detailText(ok ? '不启动 Claude Code 控制面板，后续由 Hermes 通过后端桥接调用。' : (c?.versionError || '未找到便携 Claude Code CLI'))
  } catch (e) {
    claudeEl.innerHTML = statusText(false, 'Claude Code 未接通') + detailText(e?.message || e)
  }
}

async function openOpenClawChat() {
  const services = await api.getServicesStatus().catch(() => [])
  const gw = services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0]
  if (!gw?.running) {
    await api.startService('ai.openclaw.gateway')
  }
  await switchEngine('openclaw')
  navigate('/chat')
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page hm-page'
  page.innerHTML = `
    <div class="hm-hero">
      <div class="hm-hero-eyebrow">HERMES · BRIDGE</div>
      <h1 class="hm-hero-h1">三方桥接工作台</h1>
      <p class="hm-hero-sub">Hermes 作为主入口，OpenClaw 提供模型与 Agent 通道，Claude Code 作为便携 CLI 执行通道。</p>
    </div>

    <div class="hm-panel">
      <div class="hm-panel-header">
        <div class="hm-panel-title">连接状态</div>
        <div class="hm-panel-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="bridge-refresh">刷新</button>
        </div>
      </div>
      <div class="hm-panel-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
          <button class="hm-kpi hm-kpi--link" id="bridge-open-hermes" style="text-align:left;font-family:inherit;color:inherit">
            <div class="hm-kpi-label">Hermes 主脑</div>
            <div class="hm-kpi-value" id="bridge-hermes-status">检查中...</div>
          </button>
          <button class="hm-kpi hm-kpi--link" id="bridge-open-openclaw" style="text-align:left;font-family:inherit;color:inherit">
            <div class="hm-kpi-label">OpenClaw 通道</div>
            <div class="hm-kpi-value" id="bridge-openclaw-status">检查中...</div>
          </button>
          <button class="hm-kpi hm-kpi--link" id="bridge-check-claude" style="text-align:left;font-family:inherit;color:inherit">
            <div class="hm-kpi-label">Claude Code CLI</div>
            <div class="hm-kpi-value" id="bridge-claude-status">检查中...</div>
          </button>
        </div>
      </div>
    </div>

    <div class="hm-panel">
      <div class="hm-panel-header">
        <div class="hm-panel-title">控制入口</div>
      </div>
      <div class="hm-panel-body">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="hm-btn" id="bridge-go-hermes">Hermes 聊天</button>
          <button class="hm-btn hm-btn--ghost" id="bridge-go-openclaw">OpenClaw 聊天</button>
          <button class="hm-btn hm-btn--ghost" id="bridge-test-claude">检测 Claude Code</button>
        </div>
      </div>
    </div>
  `

  page.querySelector('#bridge-refresh')?.addEventListener('click', () => loadBridgeStatus(page))
  page.querySelector('#bridge-open-hermes')?.addEventListener('click', () => navigate('/h/chat'))
  page.querySelector('#bridge-go-hermes')?.addEventListener('click', () => navigate('/h/chat'))
  page.querySelector('#bridge-open-openclaw')?.addEventListener('click', async () => {
    try {
      await openOpenClawChat()
      toast('正在进入 OpenClaw 实时聊天', 'success')
    } catch (e) {
      toast('OpenClaw 启动失败：' + (e?.message || e), 'error')
    }
  })
  page.querySelector('#bridge-go-openclaw')?.addEventListener('click', async () => {
    try {
      await openOpenClawChat()
      toast('正在进入 OpenClaw 实时聊天', 'success')
    } catch (e) {
      toast('OpenClaw 启动失败：' + (e?.message || e), 'error')
    }
  })
  page.querySelector('#bridge-check-claude')?.addEventListener('click', () => navigate('/h/claude-code'))
  page.querySelector('#bridge-test-claude')?.addEventListener('click', async () => {
    try {
      await ensureClaudeCodeStarted()
      toast('Claude Code CLI 已接通。', 'success')
      navigate('/h/claude-code')
    } catch (e) {
      toast('Claude Code 检测失败：' + (e?.message || e), 'error')
    }
  })

  loadBridgeStatus(page)
  return page
}
