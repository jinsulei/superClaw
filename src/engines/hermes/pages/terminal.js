import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { openHermesTerminalLauncher } from '../lib/hermes-terminal-launcher.js'

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page'
  el.dataset.engine = 'hermes'
  el.innerHTML = `
    <div class="hm-hero">
      <div class="hm-hero-title">
        <div class="hm-hero-eyebrow">HERMES AGENT · NATIVE CLI</div>
        <h1 class="hm-hero-h1">Hermes 原生终端</h1>
        <div class="hm-hero-sub">使用便携包内置的 Hermes、Python、配置、Skills 与工具环境。</div>
      </div>
      <div class="hm-hero-actions">
        <button class="hm-btn hm-btn--cta" id="hm-terminal-open">打开原生终端</button>
        <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-terminal-back">返回聊天</button>
      </div>
    </div>

    <div class="hm-panel">
      <div class="hm-panel-header">
        <div>
          <div class="hm-panel-title">终端与 App 聊天使用同一套 Hermes 运行时</div>
          <div class="hm-muted" style="margin-top:4px">终端用于直接操作原生 Hermes；App 聊天通过 Hermes 原生 run 事件展示执行过程和最终结果。</div>
        </div>
      </div>
      <div class="hm-panel-body">
        <div style="display:grid;gap:12px;max-width:760px">
          ${[
            ['便携运行时', '不依赖系统全局 Hermes、Python、uv 或固定盘符。'],
            ['原生执行', '工具、Skills、记忆与任务规划由 Hermes Agent 自己负责，前端只负责展示。'],
            ['独立工作区', '终端默认使用便携数据目录下的 workspace，迁移到其他电脑或 U 盘后仍可解析。'],
          ].map(([title, body]) => `
            <div style="padding:14px;border:1px solid var(--hm-border);border-radius:var(--hm-radius);background:var(--hm-surface-0)">
              <div style="font-weight:700;margin-bottom:6px">${escHtml(title)}</div>
              <div class="hm-muted">${escHtml(body)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `

  el.querySelector('#hm-terminal-open')?.addEventListener('click', async (event) => {
    const button = event.currentTarget
    button.disabled = true
    button.textContent = '正在打开...'
    const result = await openHermesTerminalLauncher({
      launch: () => api.hermesNativeTerminalStart(),
      notify: (message, type) => toast(message, type || 'info'),
    })
    if (result.ok) toast('Hermes 原生终端已打开', 'success')
    button.disabled = false
    button.textContent = '打开原生终端'
  })
  el.querySelector('#hm-terminal-back')?.addEventListener('click', () => {
    window.location.hash = '#/h/chat'
  })
  return el
}
