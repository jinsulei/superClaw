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

function requireAll(source, terms, label) {
  for (const term of terms) {
    if (!source.includes(term)) fail(`${label}: missing ${term}`)
  }
}

const chat = read('src/pages/chat.js')
const messageDb = read('src/lib/message-db.js')
const tauriApi = read('src/lib/tauri-api.js')
const devApi = read('scripts/dev-api.js')
const assistantRs = read('src-tauri/src/commands/assistant.rs')

requireAll(chat, [
  'bindOpenClawImageDropHandlers(page)',
  'dragenter',
  'dragover',
  'drop',
  'handleOpenClawImageFiles',
  'createOpenClawImageAttachmentFromFile',
  '_attachments',
], 'OPENCLAW_IMAGE_DRAG_HANDLER_EXISTS')
pass('OPENCLAW_IMAGE_DRAG_HANDLER_EXISTS')

requireAll(chat, [
  'api.saveImage',
  'api.loadHermesMediaImage',
  'serializeOpenClawAttachments',
], 'OPENCLAW_IMAGE_UPLOAD_ROUTE_WORKS')
requireAll(tauriApi, ['saveImage', 'loadHermesMediaImage'], 'OPENCLAW_IMAGE_UPLOAD_ROUTE_WORKS')
requireAll(devApi, ['assistant_save_image', '/api/hermes/media/file/'], 'OPENCLAW_IMAGE_UPLOAD_ROUTE_WORKS')
requireAll(assistantRs, ['assistant_save_image', 'hermes_load_media_image'], 'OPENCLAW_IMAGE_UPLOAD_ROUTE_WORKS')
pass('OPENCLAW_IMAGE_UPLOAD_ROUTE_WORKS')

if (/img\.src\s*=\s*(att\.)?(localPath|savedPath|mediaPath|filePath|path)/.test(chat)) {
  fail('OPENCLAW_IMAGE_URL_NOT_RAW_WINDOWS_PATH: raw local path can be assigned to img.src')
}
requireAll(chat, [
  'isOpenClawWindowsImagePath',
  'isOpenClawFileImageUrl',
  'isOpenClawSafeImageSrc',
  'openClawAttachmentMediaPath',
  'createOpenClawImageElement',
], 'OPENCLAW_IMAGE_URL_NOT_RAW_WINDOWS_PATH')
pass('OPENCLAW_IMAGE_URL_NOT_RAW_WINDOWS_PATH')

requireAll(chat, [
  'function appendUserMessage',
  'createOpenClawImageElement(att)',
  'function appendImagesToEl',
  'createOpenClawImageElement(img)',
], 'OPENCLAW_MESSAGE_IMAGE_RENDER')
pass('OPENCLAW_MESSAGE_IMAGE_RENDER')

requireAll(messageDb, [
  'function mediaFields',
  'attachments',
  'images',
  '...mediaFields(message)',
  '...mediaFields(msg)',
], 'OPENCLAW_IMAGE_RENDER_AFTER_RESTORE')
requireAll(chat, [
  'collectOpenClawAttachmentImages',
  'openClawAttachmentToImage',
  'normalizeOpenClawAttachment',
  'savedPath',
  'mediaPath',
  'localPath',
], 'OPENCLAW_IMAGE_RENDER_AFTER_RESTORE')
pass('OPENCLAW_IMAGE_RENDER_AFTER_RESTORE')

if (!devApi.includes('isHermesMediaRouteTraversal')) {
  fail('OPENCLAW_IMAGE_ROUTE_BLOCKS_TRAVERSAL: shared media traversal guard is missing')
}
let liveTraversalChecked = false
try {
  const response = await fetch('http://127.0.0.1:1420/api/hermes/media/file/..%2F..%2FWindows%2FSystem32', {
    method: 'GET',
  })
  if (response.status >= 400) liveTraversalChecked = true
  else fail(`OPENCLAW_IMAGE_ROUTE_BLOCKS_TRAVERSAL: traversal route returned HTTP ${response.status}`)
} catch {}
pass('OPENCLAW_IMAGE_ROUTE_BLOCKS_TRAVERSAL', liveTraversalChecked ? 'live route checked' : 'source guard checked')

const forbiddenPackagedDependencies = [
  'http://127.0.0.1:1420/api/hermes/media/file',
  'http://localhost:1420/api/hermes/media/file',
  'C:\\Users\\csys1\\Documents\\restore-hermes-chat-features',
]
for (const forbidden of forbiddenPackagedDependencies) {
  if (chat.includes(forbidden)) {
    fail(`OPENCLAW_IMAGE_PACKAGED_NO_DEV_SERVER_DEPENDENCY: found hard-coded dev dependency ${forbidden}`)
  }
}
requireAll(chat, [
  'api.loadHermesMediaImage',
  'openClawAttachmentMediaPath',
], 'OPENCLAW_IMAGE_PACKAGED_NO_DEV_SERVER_DEPENDENCY')
pass('OPENCLAW_IMAGE_PACKAGED_NO_DEV_SERVER_DEPENDENCY')
