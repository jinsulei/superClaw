const DEFAULT_RECENT_WINDOW_MS = 1400
const recentImageSignatures = new Map()

function cleanupRecent(now = Date.now(), windowMs = DEFAULT_RECENT_WINDOW_MS) {
  for (const [key, ts] of recentImageSignatures.entries()) {
    if (now - ts > windowMs) recentImageSignatures.delete(key)
  }
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function fileSignature(file) {
  const mime = file?.type || 'image/png'
  const size = Number(file?.size || 0)
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return `${mime}:${size}:${toHex(digest)}`
  } catch {
    return `${mime}:${size}:${file?.name || ''}:${file?.lastModified || 0}`
  }
}

export function clipboardHasImage(event) {
  return Array.from(event?.clipboardData?.items || [])
    .some(item => String(item?.type || '').startsWith('image/'))
}

export async function getUniqueClipboardImageFiles(event, options = {}) {
  const recentWindowMs = Number(options.recentWindowMs || DEFAULT_RECENT_WINDOW_MS)
  const now = Date.now()
  cleanupRecent(now, recentWindowMs)

  const files = []
  const seenInEvent = new Set()
  const imageItems = Array.from(event?.clipboardData?.items || [])
    .filter(item => String(item?.type || '').startsWith('image/'))

  for (const item of imageItems) {
    const file = item.getAsFile?.()
    if (!file) continue
    const signature = await fileSignature(file)
    if (seenInEvent.has(signature)) continue
    seenInEvent.add(signature)
    const lastSeen = recentImageSignatures.get(signature)
    if (lastSeen && now - lastSeen <= recentWindowMs) continue
    recentImageSignatures.set(signature, now)
    files.push(file)
  }

  return files
}
