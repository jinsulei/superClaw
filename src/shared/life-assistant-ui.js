export function renderScreenshotCard(card = {}) {
  const root = document.createElement('div')
  root.className = 'screenshot-card'

  const header = document.createElement('div')
  header.className = 'screenshot-card__header'

  const title = document.createElement('div')
  title.className = 'screenshot-card__title'
  title.textContent = card.title || '页面截图'

  const time = document.createElement('div')
  time.className = 'screenshot-card__time'
  time.textContent = formatScreenshotTime(card.createdAt)

  header.appendChild(title)
  header.appendChild(time)
  root.appendChild(header)

  if (card.imageUrl) {
    const img = document.createElement('img')
    img.className = 'screenshot-card__image'
    img.src = card.imageUrl
    img.alt = card.title || '截图'
    img.loading = 'lazy'
    root.appendChild(img)
  }

  if (card.note) {
    const note = document.createElement('div')
    note.className = 'screenshot-card__note'
    note.textContent = card.note
    root.appendChild(note)
  }

  if (card.imageUrl) {
    const actions = document.createElement('div')
    actions.className = 'screenshot-card__actions'
    const openBtn = document.createElement('button')
    openBtn.type = 'button'
    openBtn.className = 'screenshot-card__button'
    openBtn.textContent = '放大查看'
    openBtn.addEventListener('click', () => {
      window.open(card.imageUrl, '_blank', 'noopener,noreferrer')
    })
    actions.appendChild(openBtn)
    root.appendChild(actions)
  }

  return root
}

export function renderUserConfirmationCard(confirmation = {}) {
  const root = document.createElement('div')
  root.className = 'life-confirmation-card'

  const title = document.createElement('div')
  title.className = 'life-confirmation-card__title'
  title.textContent = confirmation.title || '需要你确认'
  root.appendChild(title)

  const desc = document.createElement('div')
  desc.className = 'life-confirmation-card__desc'
  desc.textContent = confirmation.description || '此操作需要你确认后才能继续。'
  root.appendChild(desc)

  const metaItems = []
  if (confirmation.platform) metaItems.push(['平台', confirmation.platform])
  if (confirmation.amount) metaItems.push(['金额', confirmation.amount])
  if (metaItems.length) {
    const meta = document.createElement('div')
    meta.className = 'life-confirmation-card__meta'
    metaItems.forEach(([label, value]) => {
      const item = document.createElement('span')
      item.textContent = `${label}：${value}`
      meta.appendChild(item)
    })
    root.appendChild(meta)
  }

  return root
}

export function renderScreenshotCardHtml(card = {}) {
  const imageUrl = String(card.imageUrl || '')
  return `
    <div class="screenshot-card">
      <div class="screenshot-card__header">
        <div class="screenshot-card__title">${escapeHtml(card.title || '页面截图')}</div>
        <div class="screenshot-card__time">${escapeHtml(formatScreenshotTime(card.createdAt))}</div>
      </div>
      ${imageUrl ? `<img class="screenshot-card__image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(card.title || '截图')}" loading="lazy">` : ''}
      ${card.note ? `<div class="screenshot-card__note">${escapeHtml(card.note)}</div>` : ''}
      ${imageUrl ? `<div class="screenshot-card__actions"><button type="button" class="screenshot-card__button" data-open-screenshot="${escapeAttr(imageUrl)}">放大查看</button></div>` : ''}
    </div>
  `
}

export function renderUserConfirmationCardHtml(confirmation = {}) {
  const meta = [
    confirmation.platform ? `<span>平台：${escapeHtml(confirmation.platform)}</span>` : '',
    confirmation.amount ? `<span>金额：${escapeHtml(confirmation.amount)}</span>` : '',
  ].filter(Boolean).join('')
  return `
    <div class="life-confirmation-card">
      <div class="life-confirmation-card__title">${escapeHtml(confirmation.title || '需要你确认')}</div>
      <div class="life-confirmation-card__desc">${escapeHtml(confirmation.description || '此操作需要你确认后才能继续。')}</div>
      ${meta ? `<div class="life-confirmation-card__meta">${meta}</div>` : ''}
    </div>
  `
}

function formatScreenshotTime(value) {
  try {
    return new Date(value || Date.now()).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}
