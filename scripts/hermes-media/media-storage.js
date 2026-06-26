import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const IMAGE_MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safeName(value, fallback = 'image') {
  const base = path.basename(String(value || fallback)).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  return base.slice(0, 120) || fallback
}

function mediaIndexPath(config) {
  return path.join(config.mediaDir, 'media-index.json')
}

function readIndex(config) {
  try {
    return JSON.parse(fs.readFileSync(mediaIndexPath(config), 'utf8'))
  } catch {
    return { files: {} }
  }
}

function writeIndex(config, index) {
  ensureDir(config.mediaDir)
  fs.writeFileSync(mediaIndexPath(config), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}

export function extensionFromMime(mimeType, fallback = 'png') {
  const mime = String(mimeType || '').toLowerCase()
  return IMAGE_MIME_EXT[mime] || fallback
}

export function createMediaId(prefix = 'media') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
}

export function saveMediaBuffer(config, { buffer, mimeType = 'image/png', fileName = 'image.png', source = 'upload' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('媒体文件为空')
  ensureDir(config.mediaDir)

  const id = createMediaId(source === 'generated' ? 'generated' : 'upload')
  const ext = extensionFromMime(mimeType, path.extname(fileName).replace(/^\./, '') || config.outputFormat || 'png')
  const diskName = `${id}.${ext}`
  const filePath = path.join(config.mediaDir, diskName)
  fs.writeFileSync(filePath, buffer)

  const item = {
    id,
    source,
    fileName: safeName(fileName, `${id}.${ext}`),
    diskName,
    mimeType,
    size: buffer.length,
    path: filePath,
    url: `/api/hermes/media/file/${encodeURIComponent(id)}`,
    createdAt: new Date().toISOString(),
  }
  const index = readIndex(config)
  index.files[id] = item
  writeIndex(config, index)
  return item
}

export function saveGeneratedBase64(config, { base64, mimeType = 'image/png', fileName } = {}) {
  const data = String(base64 || '').replace(/^data:[^;]+;base64,/i, '')
  return saveMediaBuffer(config, {
    buffer: Buffer.from(data, 'base64'),
    mimeType,
    fileName: fileName || `generated.${extensionFromMime(mimeType, config.outputFormat || 'png')}`,
    source: 'generated',
  })
}

export function readMediaFile(config, id) {
  const cleanId = String(id || '').trim()
  if (!/^[A-Za-z0-9_-]+$/.test(cleanId)) throw new Error('无效媒体 ID')
  const item = readIndex(config).files?.[cleanId]
  if (!item?.path) throw new Error('媒体文件不存在')

  const mediaRoot = path.resolve(config.mediaDir)
  const filePath = path.resolve(item.path)
  if (filePath !== mediaRoot && !filePath.startsWith(mediaRoot + path.sep)) {
    throw new Error('媒体文件路径越界')
  }
  if (!fs.existsSync(filePath)) throw new Error('媒体文件不存在')
  return { item, buffer: fs.readFileSync(filePath) }
}
