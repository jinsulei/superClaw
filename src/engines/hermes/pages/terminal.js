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

  const cards = [
    {
      title: 'Terminal tools are available through Hermes chat',
      body: 'Packaged Hermes enables the terminal/process toolset in the Agent runtime. Ask Hermes to run a command from the chat surface so the action can produce visible tool events and a final state.',
    },
    {
      title: 'No raw terminal is opened here',
      body: 'This page is a safe status entry. It does not start cmd, PowerShell, ConPTY, or any other native command runtime by itself.',
    },
    {
      title: 'Portable path rule',
      body: 'When a command needs Hermes, use the full path to resources\\runtime\\hermes.cmd inside this portable package. Do not rely on global Hermes, Python, uv, or virtualenv shell shims.',
    },
  ]

  el.innerHTML = `
    <div class="hm-hero">
      <div class="hm-hero-title">
        <div class="hm-hero-eyebrow">HERMES AGENT · TERMINAL</div>
        <h1 class="hm-hero-h1">Terminal tool status</h1>
        <div class="hm-hero-sub">Safe entry for packaged Hermes command capability.</div>
      </div>
      <div class="hm-hero-actions">
        <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-terminal-back">Back to chat</button>
      </div>
    </div>

    <div class="hm-panel">
      <div class="hm-panel-header">
        <div>
          <div class="hm-panel-title">Hermes terminal/process tools are routed through chat.</div>
          <div class="hm-muted" style="margin-top:4px">Use this page to confirm the boundary; use Hermes chat for actual tool-dispatched work.</div>
        </div>
      </div>
      <div class="hm-panel-body">
        <div style="display:grid;gap:12px;max-width:760px">
          ${cards.map(card => `
            <div style="padding:14px;border:1px solid var(--hm-border);border-radius:var(--hm-radius);background:var(--hm-surface-0)">
              <div style="font-weight:700;margin-bottom:6px">${escHtml(card.title)}</div>
              <div class="hm-muted">${escHtml(card.body)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `

  el.querySelector('#hm-terminal-back')?.addEventListener('click', () => {
    window.location.hash = '#/h/chat'
  })

  return el
}
