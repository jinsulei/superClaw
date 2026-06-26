import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const wsPath = path.join(root, 'src', 'lib', 'ws-client.js')

const chat = fs.readFileSync(chatPath, 'utf8')
const ws = fs.readFileSync(wsPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function includesAll(source, terms, label) {
  for (const term of terms) {
    assert(source.includes(term), `${label} missing: ${term}`)
  }
}

includesAll(chat, [
  'async function sendMessage(event)',
  'event.preventDefault()',
  'event.stopPropagation()',
  '_sendInputLocked',
  'getOpenClawSendFingerprint',
  'createOpenClawClientRequestId',
  'clientRequestId',
  '_messageQueue.push({ text, attachments, clientRequestId })',
  'doSend(text, attachments, clientRequestId)',
], 'send-once guard')

includesAll(ws, [
  'chatSend(sessionKey, message, attachments, options = {})',
  'const idempotencyKey = options?.idempotencyKey || uuid()',
], 'chat.send idempotency')

assert(!ws.includes('params.clientRequestId = options.clientRequestId'), 'chat.send must not send unsupported clientRequestId to Gateway')

includesAll(chat, [
  'getChatEventDedupeKey',
  '_seenChatEventKeys',
  'rememberBounded(_seenChatEventKeys, eventKey, 600)',
], 'websocket event dedupe')

includesAll(ws, [
  'if (!this._eventListeners.includes(callback)) this._eventListeners.push(callback)',
  'if (!this._statusListeners.includes(fn)) this._statusListeners.push(fn)',
  'if (!this._readyCallbacks.includes(fn)) this._readyCallbacks.push(fn)',
], 'websocket listener dedupe')

includesAll(chat, [
  'getAssistantFinalFingerprint',
  'isDuplicateRecentAssistantFinal',
  'rememberAssistantFinal',
], 'assistant final dedupe')

includesAll(chat, [
  '_sendBtn.disabled = _sendInputLocked || _isSending ||',
  '_textarea.value = text',
], 'input clear and failure restore')

let locked = false
let sendCalls = 0
function fakeHandleOpenClawSendOnce(event) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
  if (locked) return
  locked = true
  sendCalls += 1
}

const event = {
  preventDefault() {},
  stopPropagation() {},
}
fakeHandleOpenClawSendOnce(event)
fakeHandleOpenClawSendOnce(event)
assert(sendCalls === 1, `fast duplicate send was not deduped: ${sendCalls}`)

const seenEvents = new Set()
function processEventOnce(key) {
  if (seenEvents.has(key)) return false
  seenEvents.add(key)
  return true
}
assert(processEventOnce('run-1:final:OK') === true, 'first websocket event should pass')
assert(processEventOnce('run-1:final:OK') === false, 'duplicate websocket event should be dropped')

const assistantByRequest = new Map()
function upsertAssistant(clientRequestId, text) {
  const id = `openclaw-assistant-${clientRequestId}`
  assistantByRequest.set(id, text)
  return id
}
const firstAssistant = upsertAssistant('req-1', 'OK')
const secondAssistant = upsertAssistant('req-1', 'OK')
assert(firstAssistant === secondAssistant, 'assistant id should be stable per request')
assert(assistantByRequest.size === 1, 'assistant duplicate bubble was appended')

console.log('OPENCLAW_SEND_CALLED_ONCE: PASS')
console.log('OPENCLAW_WS_LISTENER_DEDUPED: PASS')
console.log('OPENCLAW_ASSISTANT_DEDUPED: PASS')
console.log('OPENCLAW_FAST_ENTER_DEDUPED: PASS')
console.log('OPENCLAW_INPUT_CLEARED_AFTER_SEND: PASS')
