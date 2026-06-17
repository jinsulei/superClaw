import { api } from './tauri-api.js'

const DEFAULT_LANGUAGE = 'eng+chi_sim'
const DEFAULT_AGENT = 'openclaw'

function normalizeResult(result, fallbackSource = {}) {
  if (result?.ok) {
    return {
      ok: true,
      text: String(result.text || ''),
      language: result.language || DEFAULT_LANGUAGE,
      confidence: Number(result.confidence || 0),
      source: result.source || fallbackSource,
      created_at: result.created_at || new Date().toISOString(),
    }
  }
  return {
    ok: false,
    error: result?.error || 'OCR failed',
    recoverable: result?.recoverable !== false,
    source: result?.source || fallbackSource,
  }
}

function fail(error, source) {
  return { ok: false, error: String(error?.message || error || 'OCR failed'), recoverable: true, source }
}

async function ensureEnabled() {
  const cfg = await api.ocrGetConfig().catch(() => null)
  if (cfg?.ocr?.enabled === false) throw new Error('OCR is disabled')
  return cfg
}

async function dataUrlFromClipboardImage() {
  if (!navigator.clipboard?.read) throw new Error('Clipboard image read is not available')
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find(t => t.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('read clipboard image failed'))
      reader.readAsDataURL(blob)
    })
    return { dataUrl, mimeType: type }
  }
  throw new Error('No image found in clipboard')
}

export const ocr = {
  async getConfig() {
    return api.ocrGetConfig()
  },

  async setEnabled(enabled) {
    return api.ocrSetEnabled(!!enabled)
  },

  async extractTextFromImage(imagePath, options = {}) {
    const source = { type: 'image', path: imagePath || '' }
    try {
      await ensureEnabled()
      const result = await api.ocrExtractText({
        imagePath,
        sourceType: 'image',
        language: options.language || DEFAULT_LANGUAGE,
        agent: options.agent || DEFAULT_AGENT,
        timeoutMs: options.timeoutMs || null,
      })
      return normalizeResult(result, source)
    } catch (error) {
      return fail(error, source)
    }
  },

  async extractTextFromImageData(imageData, options = {}) {
    const source = { type: options.sourceType || 'image', path: options.path || '' }
    try {
      await ensureEnabled()
      const result = await api.ocrExtractText({
        imageData,
        mimeType: options.mimeType || 'image/png',
        sourceType: options.sourceType || 'image',
        language: options.language || DEFAULT_LANGUAGE,
        agent: options.agent || DEFAULT_AGENT,
        timeoutMs: options.timeoutMs || null,
      })
      return normalizeResult(result, source)
    } catch (error) {
      return fail(error, source)
    }
  },

  async extractTextFromScreenshot(screenshotPath, options = {}) {
    const source = { type: 'screenshot', path: screenshotPath || '' }
    try {
      await ensureEnabled()
      const result = await api.ocrExtractText({
        imagePath: screenshotPath,
        sourceType: 'screenshot',
        language: options.language || DEFAULT_LANGUAGE,
        agent: options.agent || DEFAULT_AGENT,
        timeoutMs: options.timeoutMs || null,
      })
      return normalizeResult(result, source)
    } catch (error) {
      return fail(error, source)
    }
  },

  async extractTextFromClipboardImage(options = {}) {
    const source = { type: 'clipboard', path: '' }
    try {
      await ensureEnabled()
      const { dataUrl, mimeType } = await dataUrlFromClipboardImage()
      const result = await api.ocrExtractText({
        imageData: dataUrl,
        mimeType,
        sourceType: 'clipboard',
        language: options.language || DEFAULT_LANGUAGE,
        agent: options.agent || DEFAULT_AGENT,
        timeoutMs: options.timeoutMs || null,
      })
      return normalizeResult(result, source)
    } catch (error) {
      return fail(error, source)
    }
  },

  async extractTextFromCurrentBrowserPage(options = {}) {
    if (options.screenshotPath) {
      const source = { type: 'browser_page', path: options.screenshotPath || '' }
      try {
        await ensureEnabled()
        const result = await api.ocrExtractText({
          imagePath: options.screenshotPath,
          sourceType: 'browser_page',
          language: options.language || DEFAULT_LANGUAGE,
          agent: options.agent || DEFAULT_AGENT,
          timeoutMs: options.timeoutMs || null,
        })
        return normalizeResult(result, source)
      } catch (error) {
        return fail(error, source)
      }
    }
    if (options.imageData) {
      return this.extractTextFromImageData(options.imageData, { ...options, sourceType: 'browser_page' })
    }
    return fail('Browser page OCR requires a screenshot from the current active page', { type: 'browser_page', path: '' })
  },
}

export function formatOcrResult(result) {
  if (result?.ok) {
    return [
      'OCR completed',
      `Language: ${result.language || DEFAULT_LANGUAGE}`,
      `Confidence: ${Math.round(Number(result.confidence || 0) * 100)}%`,
      '',
      result.text || '(empty)',
    ].join('\n')
  }
  return `OCR failed: ${result?.error || 'unknown error'}`
}
