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

const { api } = await import('../src/lib/tauri-api.js')
const { getChatStore } = await import('../src/engines/hermes/lib/chat-store.js')

let remoteSessions = []
let streamRunCount = 0

api.hermesProfilesList = async () => ({ active: 'default', profiles: [{ name: 'default', active: true }] })
api.hermesSessionsSummaryList = async () => remoteSessions
api.hermesSessionDelete = async () => 'ok'
api.hermesSessionDetail = async sessionId => ({
  id: sessionId,
  title: '\u65b0\u4f1a\u8bdd',
  source: 'api_server',
  messages: [],
})
api.hermesAgentRunStream = async (input, sessionId, _history, _instructions, _attachments, onEvent) => {
  streamRunCount += 1
  const backendId = String(sessionId || '').startsWith('backend-') ? sessionId : 'backend-1'
  onEvent({ event: 'run.started', session_id: backendId })
  onEvent({ event: 'message.delta', session_id: backendId, delta: 'O' })
  onEvent({ event: 'message.delta', session_id: backendId, delta: 'K' })
  onEvent({ event: 'message.final', session_id: backendId, output: 'OK' })
  onEvent({ event: 'run.completed', session_id: backendId, output: 'OK' })
  return { ok: true }
}

function active(store) {
  const session = store.activeSession()
  assert.ok(session, 'active session exists')
  return session
}

function assertTranscript(session, expectedTurns) {
  const users = session.messages.filter(m => m.role === 'user')
  const assistants = session.messages.filter(m => m.role === 'assistant')
  assert.equal(users.length, expectedTurns, 'one user message per send')
  assert.equal(assistants.length, expectedTurns, 'one assistant bubble per send')
  for (const msg of assistants) {
    assert.equal(msg.content, 'OK')
    assert.equal(msg.isStreaming, undefined)
  }
  assert.equal(session.messages.some(m => !m.role), false, 'no malformed messages')
}

function assertChatPageDraftFlow() {
  const chat = fs.readFileSync(path.join(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
  const start = chat.indexOf('async function handleSend')
  const end = chat.indexOf('// ----------------------------------------------------------- search modal', start)
  assert.ok(start > 0 && end > start, 'handleSend block exists')
  const block = chat.slice(start, end)
  assert.match(block, /const restoreText = inputValue/)
  assert.match(block, /const restoreAttachments = pendingAttachments\.slice\(\)/)
  assert.match(block, /suppressTextareaCaptureUntil = Date\.now\(\) \+ 1500/)
  assert.match(block, /clearLiveTextareaDomValue\(\)/)
  assert.ok(block.indexOf('resetInput()') < block.indexOf('await store.sendMessage'), 'draft clears before send awaits')
  assert.ok(block.indexOf('clearLiveTextareaDomValue()') < block.indexOf('await store.sendMessage'), 'DOM textarea clears before send awaits')
  assert.match(block, /inputValue = restoreText/)
  assert.match(block, /restoreLiveTextareaDomValue\(restoreText, restoreCaret\)/)
  assert.match(block, /pendingAttachments = restoreAttachments/)
  assert.match(block, /pendingAttachmentInstructions = restoreInstructions/)
}

const store = getChatStore()
await store.loadSessions()
assert.equal(store.state.sessions.length, 0, 'loading sessions does not create an empty chat')
assert.equal(store.activeSession(), null, 'no active session before first send')
console.log('HERMES_NO_AUTO_EMPTY_SESSION: PASS')

store.newChat()
assert.equal(store.activeSession(), null, '/new does not create an empty local session')
console.log('HERMES_NO_EXTRA_EMPTY_SESSION: PASS')

const firstSend = store.sendMessage('first hello', { clientRequestId: 'req-first' })
let session = active(store)
assert.equal(store.state.sessions.length, 1, 'first send creates exactly one local session')
assert.equal(session.messages.length, 2, 'first send immediately creates user + assistant placeholder')
assert.equal(session.messages[0].id, 'user-req-first')
assert.equal(session.messages[1].id, 'assistant-req-first')
console.log('HERMES_FIRST_SEND_ONE_SESSION: PASS')
await firstSend
session = active(store)
assert.equal(session.id, 'backend-1', 'backend session id is adopted')
assertTranscript(session, 1)
assert.match(session.title, /first hello/)
console.log('HERMES_ASSISTANT_DEDUPED: PASS')

remoteSessions = []
await store.loadSessions()
session = active(store)
assert.equal(session.id, 'backend-1', 'pending first-send session survives delayed summary list')
assertTranscript(session, 1)
console.log('HERMES_MESSAGES_NOT_LOST_ON_REFRESH: PASS')

remoteSessions = [{ id: 'backend-1', title: '\u65b0\u4f1a\u8bdd', source: 'api_server', updated_at: Date.now() }]
await store.loadSessions()
session = active(store)
assert.equal(store.state.sessions.length, 1, 'remote summary merge does not duplicate the local session')
assertTranscript(session, 1)
assert.match(session.title, /first hello/, 'placeholder remote title does not overwrite generated title')

remoteSessions = [{ id: 'api_server backend-1', title: '', source: 'api_server backend-1', preview: 'first hello', updated_at: Date.now() }]
await store.loadSessions()
session = active(store)
assert.equal(session.id, 'backend-1', 'joined source/id summary is normalized')
assert.equal(store.state.sessions.length, 1, 'joined source/id summary does not create a duplicate sidebar session')
assert.match(session.title, /first hello/, 'summary preview preserves the generated title')

await store.sendMessage('second hello', { clientRequestId: 'req-second' })
session = active(store)
assert.equal(streamRunCount, 2)
assertTranscript(session, 2)
assert.equal(new Set(session.messages.map(m => m.id)).size, session.messages.length, 'message ids are unique')

await store.deleteSession('backend-1')
assert.equal(store.activeSession(), null, 'deleted active session clears current session')
remoteSessions = [{ id: 'backend-1', title: 'first hello', source: 'api_server', updated_at: Date.now() }]
await store.loadSessions()
assert.equal(store.state.sessions.some(s => s.id === 'backend-1'), false, 'deleted remote session is tombstoned')
console.log('HERMES_DELETE_TOMBSTONE_FILTERS_STALE_SESSION: PASS')

assertChatPageDraftFlow()
console.log('HERMES_DRAFT_CLEARED_AFTER_SEND: PASS')
console.log('HERMES_SEND_FAILURE_RESTORES_DRAFT: PASS')

console.log('smoke-hermes-session-first-send: PASS')
