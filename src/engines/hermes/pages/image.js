import { toast } from '../../../components/toast.js'

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escAttr(value) {
  return escHtml(value)
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch {}
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || text || `HTTP ${response.status}`)
  }
  return payload || {}
}

export function render() {
  const el = document.createElement('div')
  el.className = 'hm-media-page'

  let capabilities = null
  let loading = true
  let busy = false
  let error = ''
  let uploaded = null
  let result = null
  let prompt = ''

  function uploadedHtml() {
    if (!uploaded) return '<div class="hm-media-empty">可选：先上传一张参考图，再进行图生图。</div>'
    return `
      <div class="hm-media-upload-card">
        <img src="${escAttr(uploaded.url)}" alt="${escAttr(uploaded.fileName || '参考图')}">
        <div>
          <strong>${escHtml(uploaded.fileName || '参考图')}</strong>
          <span>${escHtml(uploaded.mimeType || 'image')} · ${Math.round((uploaded.size || 0) / 1024)} KB</span>
          <button type="button" class="hm-media-link-btn" id="hm-media-clear-upload">移除参考图</button>
        </div>
      </div>
    `
  }

  function resultHtml() {
    if (busy) return '<div class="hm-media-status is-loading">正在请求图片模型...</div>'
    if (!result) return '<div class="hm-media-empty">生成结果会显示在这里。</div>'
    if (!result.success) {
      return `<div class="hm-media-status is-warning">${escHtml(result.message || '生成失败')}</div>`
    }
    const image = result.image || result.images?.[0]
    if (!image?.url) return '<div class="hm-media-status is-warning">图片模型未返回可展示图片。</div>'
    return `
      <figure class="hm-media-result">
        <img src="${escAttr(image.url)}" alt="AI 生图结果">
        <figcaption>${image.remote ? '远程图片结果' : '已保存到 Hermes workspace'}</figcaption>
      </figure>
    `
  }

  function draw() {
    el.innerHTML = `
      <div class="hm-media-shell">
        <header class="hm-media-hero">
          <div>
            <div class="hm-media-eyebrow">Hermes Media</div>
            <h1>AI 生图</h1>
            <p>用于 Hermes 的最小可用图片生成入口。当前只接入本地上传、参考图和图片模型接口。</p>
          </div>
          <button type="button" class="hm-media-secondary" id="hm-media-refresh">刷新能力</button>
        </header>

        <section class="hm-media-grid">
          <div class="hm-media-panel">
            <h2>模型能力</h2>
            ${loading ? '<div class="hm-media-empty">正在读取图片模型配置...</div>' : `
              <div class="hm-media-cap ${capabilities?.configured ? 'is-ready' : 'is-missing'}">
                <strong>${capabilities?.configured ? '已配置' : '未配置'}</strong>
                <span>${capabilities?.configured ? '图片模型 API Key 已可用。' : '尚未配置图片模型 API Key'}</span>
              </div>
              <dl class="hm-media-kv">
                <div><dt>Provider</dt><dd>${escHtml(capabilities?.provider || '-')}</dd></div>
                <div><dt>Base URL</dt><dd>${escHtml(capabilities?.baseUrl || '-')}</dd></div>
                <div><dt>Model</dt><dd>${escHtml(capabilities?.model || '-')}</dd></div>
                <div><dt>默认尺寸</dt><dd>${escHtml(capabilities?.defaultSize || '-')}</dd></div>
                <div><dt>默认质量</dt><dd>${escHtml(capabilities?.defaultQuality || '-')}</dd></div>
              </dl>
            `}
            ${error ? `<div class="hm-media-status is-error">${escHtml(error)}</div>` : ''}
          </div>

          <div class="hm-media-panel">
            <h2>参考图</h2>
            <div class="hm-media-drop" id="hm-media-drop">
              <input type="file" id="hm-media-file" accept="image/*" hidden>
              <button type="button" class="hm-media-upload-btn" id="hm-media-pick">选择图片</button>
              <span>或拖入一张图片</span>
            </div>
            ${uploadedHtml()}
          </div>
        </section>

        <section class="hm-media-panel hm-media-compose">
          <label for="hm-media-prompt">提示词</label>
          <textarea id="hm-media-prompt" rows="5" placeholder="例如：根据参考图生成一张春季女装海报，干净背景，高级电商主图风格。">${escHtml(prompt)}</textarea>
          <div class="hm-media-actions">
            <button type="button" class="hm-media-primary" id="hm-media-generate" ${busy ? 'disabled' : ''}>生成图片</button>
            <span>未配置 Key 时会返回中文提示，不会崩溃。</span>
          </div>
        </section>

        <section class="hm-media-panel">
          <h2>结果</h2>
          ${resultHtml()}
        </section>
      </div>
    `
    bind()
  }

  async function loadCapabilities() {
    loading = true
    error = ''
    draw()
    try {
      capabilities = await fetchJson('/api/hermes/media/capabilities')
    } catch (err) {
      error = err?.message || String(err)
    } finally {
      loading = false
      draw()
    }
  }

  async function uploadFile(file) {
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      toast('请选择图片文件', 'warning')
      return
    }
    busy = true
    error = ''
    draw()
    try {
      const form = new FormData()
      form.append('file', file)
      const payload = await fetchJson('/api/hermes/media/upload', { method: 'POST', body: form })
      uploaded = payload.file || payload.attachment
      toast('参考图已上传', 'success')
    } catch (err) {
      error = err?.message || String(err)
      toast(error, 'error')
    } finally {
      busy = false
      draw()
    }
  }

  async function generateImage() {
    const textarea = el.querySelector('#hm-media-prompt')
    prompt = textarea?.value?.trim() || ''
    if (!prompt) {
      toast('请先输入提示词', 'warning')
      return
    }
    busy = true
    result = null
    error = ''
    draw()
    try {
      result = await fetchJson('/api/hermes/media/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          sourceImageIds: uploaded?.id ? [uploaded.id] : [],
        }),
      })
    } catch (err) {
      result = { success: false, message: err?.message || String(err) }
    } finally {
      busy = false
      draw()
    }
  }

  function bind() {
    el.querySelector('#hm-media-refresh')?.addEventListener('click', loadCapabilities)
    el.querySelector('#hm-media-pick')?.addEventListener('click', () => el.querySelector('#hm-media-file')?.click())
    el.querySelector('#hm-media-file')?.addEventListener('change', event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      uploadFile(file)
    })
    el.querySelector('#hm-media-clear-upload')?.addEventListener('click', () => {
      uploaded = null
      draw()
    })
    el.querySelector('#hm-media-generate')?.addEventListener('click', generateImage)
    el.querySelector('#hm-media-prompt')?.addEventListener('input', event => {
      prompt = event.target.value
    })
    const drop = el.querySelector('#hm-media-drop')
    drop?.addEventListener('dragover', event => {
      event.preventDefault()
      drop.classList.add('is-drag-over')
    })
    drop?.addEventListener('dragleave', () => drop.classList.remove('is-drag-over'))
    drop?.addEventListener('drop', event => {
      event.preventDefault()
      drop.classList.remove('is-drag-over')
      uploadFile(event.dataTransfer?.files?.[0])
    })
  }

  draw()
  loadCapabilities()
  return el
}
