export function render() {
  const el = document.createElement('div')
  el.className = 'page'
  el.dataset.engine = 'hermes'
  el.innerHTML = `
    <div class="hm-hero">
      <div class="hm-hero-title">
        <div class="hm-hero-eyebrow">HERMES AGENT · TERMINAL</div>
        <h1 class="hm-hero-h1">终端对话</h1>
        <div class="hm-hero-sub">受控 session 尚未启用</div>
      </div>
      <div class="hm-hero-actions">
        <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-terminal-back">返回聊天</button>
      </div>
    </div>

    <div class="hm-panel">
      <div class="hm-panel-header">
        <div>
          <div class="hm-panel-title">Hermes 终端对话暂未启用受控 session。</div>
          <div class="hm-muted" style="margin-top:4px">当前页面只是安全入口，不会启动本地终端。</div>
        </div>
      </div>
      <div class="hm-panel-body">
        <div style="display:grid;gap:12px;max-width:760px">
          <div style="padding:14px;border:1px solid var(--hm-border);border-radius:var(--hm-radius);background:var(--hm-surface-0)">
            当前不会执行系统命令。
          </div>
          <div style="padding:14px;border:1px solid var(--hm-border);border-radius:var(--hm-radius);background:var(--hm-surface-0)">
            后续启用后，将只允许用户手动输入命令，并对高风险命令进行确认。
          </div>
          <div class="hm-muted">
            你仍然可以返回 Hermes 普通聊天，继续使用问答、记忆、图片和工具协作能力。
          </div>
        </div>
      </div>
    </div>
  `

  el.querySelector('#hm-terminal-back')?.addEventListener('click', () => {
    window.location.hash = '#/h/chat'
  })

  return el
}
