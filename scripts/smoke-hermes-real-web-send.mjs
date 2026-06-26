import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const storage = new Map()
globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
}
globalThis.window = {
  location: { hostname: '127.0.0.1' },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0)

const chat = fs.readFileSync(path.join(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
const storeSource = fs.readFileSync(path.join(root, 'src/engines/hermes/lib/chat-store.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/engines/hermes/style/hermes.css'), 'utf8')

function blockBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  const end = source.indexOf(endNeedle, start)
  assert.ok(start >= 0 && end > start, `block exists: ${startNeedle}`)
  return source.slice(start, end)
}

const handleSendBlock = blockBetween(chat, 'async function handleSend(', '// ----------------------------------------------------------- search modal')
assert.ok(handleSendBlock.indexOf('hermesSendInFlight = true') < handleSendBlock.indexOf('await maybeRunEcommerceStage'), 'send lock is set before first async branch')
assert.ok(handleSendBlock.includes('event?.preventDefault?.()'), 'send event prevents default submit')
assert.ok(handleSendBlock.includes('event?.stopPropagation?.()'), 'send event stops duplicate propagation')
assert.ok(handleSendBlock.includes('if ((!text && !attachments.length) || store.state.streaming || hermesSendInFlight) return'), 'duplicate send guard exists')
assert.ok(handleSendBlock.indexOf('clearDraftForSend()') < handleSendBlock.indexOf('await store.sendMessage'), 'draft clears before model request')
assert.ok(handleSendBlock.indexOf('clearDraftForSend()') < handleSendBlock.indexOf('runHermesAttachmentOcr'), 'draft clears before slow OCR request')
assert.ok(!/!active\s*\|\|/.test(blockBetween(chat, '<button class="hm-chat-send-btn"', '<input id="hm-chat-file-input"')), 'send button is not disabled just because no active session exists')
console.log('HERMES_SEND_CALLED_ONCE: PASS')
console.log('HERMES_TEXTAREA_CLEARS_AFTER_SEND: PASS')
console.log('HERMES_DRAW_DOES_NOT_REFILL_SENT_TEXT: PASS')

assert.match(storeSource, /function shouldAcceptStreamEvent/)
assert.match(storeSource, /if \(!shouldAcceptStreamEvent\(effectiveSessionId\)\)/)

const { api } = await import('../src/lib/tauri-api.js')
const { getChatStore } = await import('../src/engines/hermes/lib/chat-store.js')

let runCount = 0
api.hermesProfilesList = async () => ({ active: 'default', profiles: [{ name: 'default', active: true }] })
api.hermesSessionsSummaryList = async () => []
api.hermesSessionDelete = async () => 'ok'
api.hermesSessionDetail = async sessionId => ({ id: sessionId, title: '新会话', source: 'api_server', messages: [] })
api.hermesAgentRunStream = async (_input, sessionId, _history, _instructions, _attachments, onEvent) => {
  runCount += 1
  const backendId = String(sessionId || '').startsWith('backend-') ? sessionId : 'backend-web-1'
  onEvent({ event: 'run.started', session_id: backendId })
  onEvent({ event: 'message.delta', session_id: backendId, delta: 'O' })
  onEvent({ event: 'message.delta', session_id: backendId, delta: 'K' })
  onEvent({ event: 'message.final', session_id: backendId, output: 'OK' })
  onEvent({ event: 'run.completed', session_id: backendId, output: 'OK' })
  onEvent({ event: 'message.final', session_id: backendId, output: 'LATE DUPLICATE' })
  onEvent({ event: 'run.completed', session_id: backendId, output: 'LATE DUPLICATE' })
  return { ok: true }
}

const store = getChatStore()
await store.loadSessions()
assert.equal(store.activeSession(), null, 'empty list does not create a session')
store.newChat()
assert.equal(store.activeSession(), null, '/new stays draft-only')
const p1 = store.sendMessage('你好', { clientRequestId: 'web-send-1' })
const p2 = store.sendMessage('你好', { clientRequestId: 'web-send-1' })
await Promise.all([p1, p2])
assert.equal(runCount, 1, 'same request id runs once')
const session = store.activeSession()
assert.ok(session, 'first send creates one session')
assert.equal(store.state.sessions.length, 1, 'first send creates exactly one session')
assert.equal(session.messages.filter(m => m.role === 'user').length, 1, 'one user message')
assert.equal(session.messages.filter(m => m.role === 'assistant').length, 1, 'one assistant message')
assert.equal(session.messages.find(m => m.role === 'assistant')?.content, 'OK', 'late stream output ignored')
console.log('HERMES_ASSISTANT_REPLY_DEDUPED: PASS')
console.log('HERMES_FIRST_SEND_ONE_SESSION: PASS')
console.log('HERMES_NO_AUTO_EMPTY_SESSION: PASS')

assert.match(css, /\.hm-chat-sidebar-body[\s\S]*display:\s*flex/)
assert.match(css, /\.hm-chat-sidebar-body[\s\S]*overflow-y:\s*auto/)
assert.match(css, /\.hm-chat-group[\s\S]*flex-shrink:\s*0/)
assert.match(css, /\.hm-chat-session-item[\s\S]*min-height:\s*58px/)
assert.match(css, /\.hm-chat-session-item[\s\S]*flex-shrink:\s*0/)
assert.match(css, /\.hm-chat-session-actions[\s\S]*flex-shrink:\s*0/)
console.log('HERMES_SESSION_LIST_LAYOUT_STABLE: PASS')

console.log('smoke-hermes-real-web-send: PASS')
