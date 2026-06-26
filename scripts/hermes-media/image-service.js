import fs from 'fs'
import { IMAGE_API_KEY_MISSING_CODE, IMAGE_API_KEY_MISSING_MESSAGE, publicHermesMediaCapabilities } from './media-config.js'
import { readMediaFile, saveGeneratedBase64 } from './media-storage.js'

function clean(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function imageMimeFromResponse(item = {}) {
  if (item.mime_type) return item.mime_type
  if (item.mimeType) return item.mimeType
  return 'image/png'
}

function normalizePrompt(prompt) {
  const text = clean(prompt)
  if (!text) throw new Error('请输入生图提示词')
  return text
}

function apiUrl(config, suffix) {
  return `${config.baseUrl.replace(/\/+$/, '')}${suffix}`
}

async function parseImageApiResponse(config, response) {
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch {}

  if (!response.ok) {
    const message = json?.error?.message || json?.message || text || `图片模型请求失败：HTTP ${response.status}`
    return { success: false, ok: false, status: response.status, code: json?.error?.code || 'IMAGE_API_ERROR', message }
  }

  const image = Array.isArray(json?.data) ? json.data[0] : null
  const b64 = image?.b64_json || image?.base64 || image?.image_base64
  if (b64) {
    const mimeType = imageMimeFromResponse(image)
    const saved = saveGeneratedBase64(config, { base64: b64, mimeType })
    return { success: true, ok: true, image: saved, images: [saved], raw: { usage: json?.usage || null } }
  }

  const url = image?.url || json?.url
  if (url) {
    return { success: true, ok: true, image: { url, remote: true }, images: [{ url, remote: true }], raw: { usage: json?.usage || null } }
  }

  return { success: false, ok: false, code: 'IMAGE_EMPTY_RESPONSE', message: '图片模型未返回可用图片' }
}

async function generateFromText(config, { prompt, size, quality, outputFormat }) {
  const body = {
    model: config.model,
    prompt,
    size: clean(size, config.defaultSize),
    quality: clean(quality, config.defaultQuality),
    n: 1,
    response_format: 'b64_json',
  }
  if (outputFormat || config.outputFormat) body.output_format = clean(outputFormat, config.outputFormat)

  const response = await fetch(apiUrl(config, '/images/generations'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return parseImageApiResponse(config, response)
}

async function generateFromImage(config, { prompt, sourceImageIds = [], size, quality }) {
  const source = sourceImageIds[0]
  const { item, buffer } = readMediaFile(config, source)
  const form = new FormData()
  form.append('model', config.model)
  form.append('prompt', prompt)
  form.append('size', clean(size, config.defaultSize))
  form.append('quality', clean(quality, config.defaultQuality))
  form.append('image', new Blob([buffer], { type: item.mimeType || 'image/png' }), item.fileName || 'image.png')

  const response = await fetch(apiUrl(config, '/images/edits'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  })
  return parseImageApiResponse(config, response)
}

export function getHermesMediaCapabilities(config) {
  return publicHermesMediaCapabilities(config)
}

export async function generateHermesImage(config, input = {}) {
  if (!config.hasApiKey) {
    return {
      success: false,
      ok: false,
      code: IMAGE_API_KEY_MISSING_CODE,
      message: IMAGE_API_KEY_MISSING_MESSAGE,
      capabilities: publicHermesMediaCapabilities(config),
    }
  }

  const prompt = normalizePrompt(input.prompt)
  const sourceImageIds = Array.isArray(input.sourceImageIds) ? input.sourceImageIds.filter(Boolean) : []
  if (sourceImageIds.length) {
    return generateFromImage(config, { ...input, prompt, sourceImageIds })
  }
  return generateFromText(config, { ...input, prompt })
}

export function fileStatSummary(filePath) {
  const stat = fs.statSync(filePath)
  return { size: stat.size, mtimeMs: stat.mtimeMs }
}
