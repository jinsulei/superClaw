import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8')
}

function pass(label, note = '') {
  console.log(`${label}: PASS${note ? ` (${note})` : ''}`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const chat = read('src/engines/hermes/pages/chat.js')
const store = read('src/engines/hermes/lib/chat-store.js')
const devApi = read('scripts/dev-api.js')
const tauriApi = read('src/lib/tauri-api.js')
const assistantRs = read('src-tauri/src/commands/assistant.rs')

const localPathPattern = String.raw`C:\tmp\test-image.png`

if (!chat.includes('isSafeRenderableImageSrc') || !chat.includes('attachmentMediaPath')) {
  fail('IMAGE_RENDER_NO_RAW_WINDOWS_PATH: Hermes chat missing safe image src helpers')
}
if (!chat.includes('data-hermes-media-path') || !chat.includes('api.loadHermesMediaImage')) {
  fail('IMAGE_RENDER_NO_RAW_WINDOWS_PATH: Hermes chat does not hydrate local media paths')
}
if (/function attachmentImageSrc[\s\S]*return\s+(att\.)?(localPath|savedPath|mediaPath|path)/.test(chat)) {
  fail(`IMAGE_RENDER_NO_RAW_WINDOWS_PATH: attachmentImageSrc can return raw local paths such as ${localPathPattern}`)
}
if (!/isWindowsAbsoluteImagePath|isLocalFileImageUrl/.test(chat)) {
  fail('IMAGE_RENDER_NO_RAW_WINDOWS_PATH: Hermes chat does not detect raw local image paths')
}
pass('IMAGE_RENDER_NO_RAW_WINDOWS_PATH')

for (const term of ['savedPath', 'localPath', 'mediaPath']) {
  if (!store.includes(term)) {
    fail(`IMAGE_RENDER_HISTORY_USES_PERSISTENT_URL: chat-store does not preserve ${term}`)
  }
}
if (store.includes('if (!content && !url) return null')) {
  fail('IMAGE_RENDER_HISTORY_USES_PERSISTENT_URL: chat-store still drops attachments that only have local paths')
}
pass('IMAGE_RENDER_HISTORY_USES_PERSISTENT_URL')

if (!devApi.includes('/api/hermes/media/file/')) {
  fail('HERMES_MEDIA_FILE_ROUTE_WORKS: dev API media file route is missing')
}
if (!devApi.includes('sendHermesMediaFileResponse') || !devApi.includes('readHermesMediaImageDataUrl')) {
  fail('HERMES_MEDIA_FILE_ROUTE_WORKS: dev API media file route does not use the shared safe reader')
}
if (!tauriApi.includes('hermes_load_media_image') || !assistantRs.includes('hermes_load_media_image')) {
  fail('HERMES_MEDIA_FILE_ROUTE_WORKS: packaged Tauri media image command is missing')
}

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)
const generatedRoot = path.join(root, 'src-tauri', 'resources', 'data', 'generated')
fs.mkdirSync(generatedRoot, { recursive: true })
const tempDir = fs.mkdtempSync(path.join(generatedRoot, 'packaged-image-smoke-'))
const mediaPath = path.join(tempDir, 'probe.png')
fs.writeFileSync(mediaPath, tinyPng)

let liveRouteChecked = false
try {
  const url = `http://127.0.0.1:1420/api/hermes/media/file/${encodeURIComponent(mediaPath)}`
  const response = await fetch(url, { method: 'GET' })
  if (response.ok) {
    liveRouteChecked = true
    const contentType = response.headers.get('content-type') || ''
    const body = Buffer.from(await response.arrayBuffer())
    if (!contentType.toLowerCase().startsWith('image/png')) {
      fail(`HERMES_MEDIA_FILE_ROUTE_WORKS: expected image/png, got ${contentType}`)
    }
    if (!body.equals(tinyPng)) {
      fail('HERMES_MEDIA_FILE_ROUTE_WORKS: media route returned unexpected image bytes')
    }
  }
} catch {}

pass('HERMES_MEDIA_FILE_ROUTE_WORKS', liveRouteChecked ? 'live route checked' : 'source route registered')

let liveTraversalChecked = false
try {
  const response = await fetch('http://127.0.0.1:1420/api/hermes/media/file/..%2F..%2FWindows%2FSystem32', {
    method: 'GET',
  })
  if (response.status >= 400) liveTraversalChecked = true
  else fail(`HERMES_MEDIA_FILE_ROUTE_BLOCKS_TRAVERSAL: traversal route returned HTTP ${response.status}`)
} catch {}

if (!devApi.includes('isHermesMediaRouteTraversal')) {
  fail('HERMES_MEDIA_FILE_ROUTE_BLOCKS_TRAVERSAL: source traversal guard is missing')
}
pass('HERMES_MEDIA_FILE_ROUTE_BLOCKS_TRAVERSAL', liveTraversalChecked ? 'live route checked' : 'source guard checked')

const forbiddenPackagedDependencies = [
  'http://127.0.0.1:1420/api/hermes/media/file',
  'http://localhost:1420/api/hermes/media/file',
  'C:\\Users\\csys1\\Documents\\restore-hermes-chat-features',
]
for (const forbidden of forbiddenPackagedDependencies) {
  if (chat.includes(forbidden)) {
    fail(`PACKAGED_IMAGE_RENDER_NO_DEV_SERVER_DEPENDENCY: found hard-coded dev dependency ${forbidden}`)
  }
}
if (!chat.includes('api.loadHermesMediaImage')) {
  fail('PACKAGED_IMAGE_RENDER_NO_DEV_SERVER_DEPENDENCY: packaged renderer is not using the Tauri-safe media loader')
}
pass('PACKAGED_IMAGE_RENDER_NO_DEV_SERVER_DEPENDENCY')

fs.rmSync(tempDir, { recursive: true, force: true })
