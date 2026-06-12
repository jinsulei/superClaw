/**
 * SkillHub SDK for the local dev API.
 *
 * Current public installs are served by ClawHub:
 *   1. GET /api/v1/skills/{slug}/install
 *   2. Download the archive.downloadUrl returned by that response.
 *
 * Older SkillHub mirrors are kept as a fallback because some existing UI
 * screens still surface their search results.
 */
import fs from 'fs'
import path from 'path'
import { inflateRaw } from 'zlib'
import { promisify } from 'util'

const inflateRawAsync = promisify(inflateRaw)

const COS_BASE = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com'
const LEGACY_API_BASE = 'https://lightmake.site/api/v1'
const CLAWHUB_API_BASE = 'https://clawhub.ai/api/v1'
const INDEX_TTL = 10 * 60 * 1000

let _indexCache = null

export async function search(query, limit = 20) {
  const q = (query || '').trim()
  if (!q) return []
  const max = Math.max(1, Math.min(50, Number(limit) || 20))
  const [legacy, current] = await Promise.allSettled([
    searchLegacy(q, max),
    searchClawHub(q, max),
  ])
  const items = []
  if (legacy.status === 'fulfilled') items.push(...legacy.value)
  if (current.status === 'fulfilled') items.push(...current.value)
  const merged = dedupeSkills(items)
  if (!merged.length) {
    const errors = [legacy, current]
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.message || String(r.reason))
      .join('; ')
    if (errors) throw new Error(`SkillHub search failed: ${errors}`)
  }
  return merged.slice(0, max)
}

export async function fetchIndex() {
  if (_indexCache && Date.now() - _indexCache.ts < INDEX_TTL) {
    return _indexCache.items
  }
  const resp = await fetch(`${COS_BASE}/skills.json`, { signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error(`SkillHub index failed: HTTP ${resp.status}`)
  const data = await resp.json()
  const items = Array.isArray(data) ? data : (Array.isArray(data.skills) ? data.skills : [])
  _indexCache = { ts: Date.now(), items }
  return items
}

export async function downloadZip(slug) {
  validateSlug(slug)
  const errors = []
  const attempts = [
    () => downloadFromClawHub(slug),
    () => downloadFromUrl(`${COS_BASE}/skills/${encodeURIComponent(slug)}.zip`, 'legacy-cos'),
    () => downloadFromUrl(`${LEGACY_API_BASE}/download?slug=${encodeURIComponent(slug)}`, 'legacy-api'),
  ]
  for (const attempt of attempts) {
    try {
      return await attempt()
    } catch (error) {
      errors.push(error?.message || String(error))
    }
  }
  throw new Error(`SkillHub download failed: ${errors.join('; ')}`)
}

export async function install(slug, skillsDir) {
  validateSlug(slug)
  const targetDir = path.join(skillsDir, slug)
  const zipBuf = await downloadZip(slug)
  await extractZip(zipBuf, targetDir)
  return targetDir
}

async function searchLegacy(query, limit) {
  const url = `${LEGACY_API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error(`legacy search HTTP ${resp.status}`)
  const data = await resp.json()
  return (Array.isArray(data.results) ? data.results : []).map((item) => ({
    ...item,
    source: item.source || 'legacy-skillhub',
  }))
}

async function searchClawHub(query, limit) {
  const url = `${CLAWHUB_API_BASE}/skills?search=${encodeURIComponent(query)}&limit=${limit}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error(`clawhub search HTTP ${resp.status}`)
  const data = await resp.json()
  return (Array.isArray(data.items) ? data.items : []).map(normalizeClawHubItem)
}

function normalizeClawHubItem(item) {
  return {
    ...item,
    name: item.name || item.displayName,
    displayName: item.displayName || item.name || item.slug,
    version: item.latestVersion?.version || item.tags?.latest || item.version,
    source: 'clawhub',
  }
}

function dedupeSkills(items) {
  const seen = new Set()
  const merged = []
  for (const item of items) {
    const slug = String(item?.slug || '').trim()
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    merged.push(item)
  }
  return merged
}

async function downloadFromClawHub(slug) {
  const installUrl = `${CLAWHUB_API_BASE}/skills/${encodeURIComponent(slug)}/install`
  const resp = await fetch(installUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const text = await safeResponseText(resp)
    throw new Error(`clawhub install HTTP ${resp.status}${text ? `: ${text}` : ''}`)
  }
  const data = await resp.json()
  const downloadUrl = data?.archive?.downloadUrl
  if (data?.installKind !== 'archive' || typeof downloadUrl !== 'string' || !downloadUrl) {
    throw new Error('clawhub install did not return an archive download URL')
  }
  return await downloadFromUrl(downloadUrl, 'clawhub')
}

async function downloadFromUrl(url, source) {
  const resp = await fetch(url, {
    headers: { accept: 'application/zip,application/octet-stream,*/*' },
    signal: AbortSignal.timeout(30000),
  })
  const buf = Buffer.from(await resp.arrayBuffer())
  if (!resp.ok) {
    throw new Error(`${source} HTTP ${resp.status}: ${bufferPreview(buf)}`)
  }
  if (!isZip(buf)) {
    throw new Error(`${source} response is not a zip: ${bufferPreview(buf)}`)
  }
  return buf
}

async function safeResponseText(resp) {
  try {
    return (await resp.text()).slice(0, 200)
  } catch {
    return ''
  }
}

function bufferPreview(buf) {
  return buf.subarray(0, 120).toString('utf8').replace(/\s+/g, ' ').trim()
}

function isZip(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b
}

function validateSlug(slug) {
  if (!slug) throw new Error('Skill slug is required')
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new Error(`Invalid Skill slug: ${slug}`)
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(slug)) {
    throw new Error(`Invalid Skill slug: ${slug}`)
  }
}

async function extractZip(zipBuf, targetDir) {
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })

  const entries = parseZipEntries(zipBuf)
  if (!entries.length) throw new Error('zip is empty or unsupported')

  const stripPrefix = detectSingleRootDir(entries)
  const targetRoot = path.resolve(targetDir)

  for (const entry of entries) {
    let name = String(entry.name || '').replace(/\\/g, '/')
    if (!name || name.includes('..')) continue

    if (stripPrefix) {
      if (!name.startsWith(stripPrefix)) continue
      name = name.slice(stripPrefix.length)
      if (!name) continue
    }

    const outPath = path.resolve(targetRoot, name)
    if (outPath !== targetRoot && !outPath.startsWith(`${targetRoot}${path.sep}`)) continue

    if (entry.isDir) {
      fs.mkdirSync(outPath, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(outPath), { recursive: true })

      let data
      if (entry.method === 0) {
        data = zipBuf.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
      } else if (entry.method === 8) {
        const compressed = zipBuf.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
        data = await inflateRawAsync(compressed)
      } else {
        console.warn(`[skillhub-sdk] skipped unsupported compression method ${entry.method}: ${name}`)
        continue
      }
      fs.writeFileSync(outPath, data)
    }
  }
}

function parseZipEntries(buf) {
  const entries = []
  let offset = 0
  const LOCAL_FILE_HEADER_SIG = 0x04034b50

  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset)
    if (sig !== LOCAL_FILE_HEADER_SIG) break

    const gpFlag = buf.readUInt16LE(offset + 6)
    const method = buf.readUInt16LE(offset + 8)
    const compressedSize = buf.readUInt32LE(offset + 18)
    const uncompressedSize = buf.readUInt32LE(offset + 22)
    const nameLen = buf.readUInt16LE(offset + 26)
    const extraLen = buf.readUInt16LE(offset + 28)
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8')
    const dataOffset = offset + 30 + nameLen + extraLen

    entries.push({
      name,
      isDir: name.endsWith('/'),
      method,
      compressedSize,
      uncompressedSize,
      dataOffset,
    })

    if ((gpFlag & 0x08) && compressedSize === 0) break
    offset = dataOffset + compressedSize
  }

  return entries
}

function detectSingleRootDir(entries) {
  let root = null
  for (const entry of entries) {
    const firstSeg = String(entry.name || '').split('/')[0]
    if (!firstSeg) continue
    const prefix = firstSeg + '/'
    if (root === null) {
      root = prefix
    } else if (!entry.name.startsWith(root)) {
      return null
    }
  }
  return root
}
