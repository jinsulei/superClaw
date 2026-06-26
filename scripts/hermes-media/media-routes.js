import { getHermesMediaConfig } from './media-config.js'
import { getHermesMediaCapabilities, generateHermesImage } from './image-service.js'
import { readMediaFile, saveMediaBuffer } from './media-storage.js'

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseJsonBuffer(buffer) {
  if (!buffer?.length) return {}
  return JSON.parse(buffer.toString('utf8'))
}

function parseDataUpload(input = {}) {
  const dataUrl = String(input.dataUrl || '').trim()
  if (dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) throw new Error('无效 dataUrl')
    return {
      buffer: Buffer.from(match[2], 'base64'),
      mimeType: match[1] || input.mimeType || 'image/png',
      fileName: input.fileName || input.name || 'upload.png',
    }
  }
  const base64 = String(input.base64 || input.content || '').trim()
  if (!base64) throw new Error('未找到上传文件')
  return {
    buffer: Buffer.from(base64, 'base64'),
    mimeType: input.mimeType || 'image/png',
    fileName: input.fileName || input.name || 'upload.png',
  }
}

function parseMultipartUpload(buffer, contentType) {
  const boundaryMatch = /boundary=([^;]+)/i.exec(contentType || '')
  if (!boundaryMatch) throw new Error('缺少 multipart boundary')
  const boundary = `--${boundaryMatch[1].replace(/^"|"$/g, '')}`
  const raw = buffer.toString('latin1')
  const parts = raw.split(boundary).slice(1, -1)
  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r?\n/, '')
    const splitAt = part.indexOf('\r\n\r\n')
    if (splitAt < 0) continue
    const headerText = part.slice(0, splitAt)
    let bodyText = part.slice(splitAt + 4)
    bodyText = bodyText.replace(/\r?\n$/, '')
    const disposition = /content-disposition:\s*([^\r\n]+)/i.exec(headerText)?.[1] || ''
    if (!/name="file"/i.test(disposition)) continue
    const fileName = /filename="([^"]*)"/i.exec(disposition)?.[1] || 'upload.png'
    const mimeType = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || 'application/octet-stream'
    return {
      buffer: Buffer.from(bodyText, 'latin1'),
      mimeType,
      fileName,
    }
  }
  throw new Error('未找到上传文件')
}

async function handleUpload(req, res, config) {
  const contentType = String(req.headers['content-type'] || '')
  const raw = await readRawBody(req)
  const upload = contentType.toLowerCase().includes('multipart/form-data')
    ? parseMultipartUpload(raw, contentType)
    : parseDataUpload(parseJsonBuffer(raw))

  if (!String(upload.mimeType || '').toLowerCase().startsWith('image/')) {
    sendJson(res, 400, { success: false, ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: '仅支持上传图片文件' })
    return true
  }

  const item = saveMediaBuffer(config, upload)
  sendJson(res, 200, { success: true, ok: true, file: item, attachment: item })
  return true
}

async function handleGenerate(req, res, config) {
  const input = parseJsonBuffer(await readRawBody(req))
  const result = await generateHermesImage(config, input)
  sendJson(res, result.success ? 200 : 200, result)
  return true
}

function handleFile(req, res, config, url) {
  const id = decodeURIComponent(url.pathname.slice('/api/hermes/media/file/'.length))
  const { item, buffer } = readMediaFile(config, id)
  res.statusCode = 200
  res.setHeader('Content-Type', item.mimeType || 'application/octet-stream')
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.end(buffer)
  return true
}

export async function handleHermesMediaApi(req, res, url, { rootDir = process.cwd(), env = process.env } = {}) {
  if (!url.pathname.startsWith('/api/hermes/media/')) return false
  const config = getHermesMediaConfig({ rootDir, env })

  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return true
    }

    if (url.pathname === '/api/hermes/media/capabilities' && req.method === 'GET') {
      sendJson(res, 200, getHermesMediaCapabilities(config))
      return true
    }

    if (url.pathname === '/api/hermes/media/upload' && req.method === 'POST') {
      return await handleUpload(req, res, config)
    }

    if (url.pathname === '/api/hermes/media/generate-image' && req.method === 'POST') {
      return await handleGenerate(req, res, config)
    }

    if (url.pathname.startsWith('/api/hermes/media/file/') && req.method === 'GET') {
      return handleFile(req, res, config, url)
    }

    sendJson(res, 404, { success: false, ok: false, code: 'MEDIA_ROUTE_NOT_FOUND', message: '媒体接口不存在' })
    return true
  } catch (error) {
    sendJson(res, 500, { success: false, ok: false, code: error?.code || 'MEDIA_ROUTE_ERROR', message: error?.message || String(error) })
    return true
  }
}
