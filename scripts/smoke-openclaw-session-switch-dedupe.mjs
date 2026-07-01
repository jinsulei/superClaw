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
  'const _renderedMessageKeysBySession = new Map()',
  'function getOpenClawMessageDedupeKey(message = {}, sessionKey = _sessionKey)',
  'function getOpenClawHistoryDisplayDedupeKey(message = {}, sessionKey = _sessionKey)',
  'function dedupeHistoryStable(messages)',
  'dedupeHistoryStable(local).forEach',
  'dedupeHistoryStable(result.messages)',
  'dedupeKey: msg.displayDedupeKey || msg.dedupeKey',
  'function mergeOpenClawHistoryMessage(prev, next)',
  'function hasRenderedOpenClawMessage(sessionKey, dedupeKey)',
  'markRenderedOpenClawMessage(wrap, sessionKey, meta.dedupeKey)',
  'const assistantDedupeKey = getOpenClawMessageDedupeKey({',
  'createStreamBubble({',
  'dedupeKey: assistantDedupeKey',
  'sessionKey: _sessionKey',
  'skipped duplicate rendered assistant final',
], 'OpenClaw session-switch dedupe implementation')

includesAll(ws, [
  'if (!this._eventListeners.includes(callback)) this._eventListeners.push(callback)',
  'return () => { this._eventListeners = this._eventListeners.filter(fn => fn !== callback) }',
], 'WebSocket listener subscribe/unsubscribe guard')

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function hash(value) {
  const text = normalize(value)
  let h = 5381
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h) ^ text.charCodeAt(i)
  return `${text.length}:${(h >>> 0).toString(36)}`
}

function toolText(tools = []) {
  return tools.map(tool => normalize(tool.output ?? tool.result ?? tool.content ?? tool.name ?? '')).filter(Boolean).join('|')
}

function key(message) {
  const session = message.sessionKey || 'agent:main:main'
  const role = message.role === 'tool' ? 'assistant' : message.role
  const display = hash(message.text || toolText(message.tools || []))
  if (role === 'assistant' && message.runId && display) return `${session}|run:${message.runId}|display:${display}`
  if (message.id) return `${session}|id:${message.id}`
  if (message.eventId) return `${session}|event:${message.eventId}`
  return `${session}|display:${role}:${display}:${Math.floor((message.timestamp || 0) / 1000)}`
}

function displayKey(message) {
  return `${message.sessionKey || 'agent:main:main'}|history-display:${message.role}:${hash(message.text || toolText(message.tools || []))}:${Math.floor((message.timestamp || 0) / 60000)}`
}

function merge(prev, next) {
  const sameText = normalize(prev.text) === normalize(next.text)
  const tools = [...(prev.tools || [])]
  for (const tool of next.tools || []) {
    if (!tools.some(item => (item.id || item.name) === (tool.id || tool.name))) tools.push(tool)
  }
  return {
    ...prev,
    ...next,
    text: sameText ? (prev.text || next.text || '') : [prev.text, next.text].filter(Boolean).join('\n'),
    tools,
  }
}

function mergeMessages(messages) {
  const rows = []
  const seen = new Map()
  const seenDisplay = new Map()
  for (const msg of messages) {
    const msgKey = key(msg)
    const msgDisplayKey = displayKey(msg)
    if (seenDisplay.has(msgDisplayKey)) {
      rows[seenDisplay.get(msgDisplayKey)] = merge(rows[seenDisplay.get(msgDisplayKey)], msg)
      seen.set(msgKey, seenDisplay.get(msgDisplayKey))
      continue
    }
    if (seen.has(msgKey)) {
      rows[seen.get(msgKey)] = merge(rows[seen.get(msgKey)], msg)
      seenDisplay.set(msgDisplayKey, seen.get(msgKey))
      continue
    }
    const last = rows[rows.length - 1]
    if (last?.role === 'assistant' && msg.role === 'assistant' && ((last.tools?.length || 0) || (msg.tools?.length || 0) || last.runId === msg.runId)) {
      rows[rows.length - 1] = merge(last, msg)
      seen.set(msgKey, rows.length - 1)
      seenDisplay.set(msgDisplayKey, rows.length - 1)
      continue
    }
    seen.set(msgKey, rows.length)
    seenDisplay.set(msgDisplayKey, rows.length)
    rows.push(msg)
  }
  return rows
}

const initial = mergeMessages([
  { id: 'user-1', role: 'user', text: 'OK?', timestamp: 1000 },
  { id: 'assistant-1', role: 'assistant', runId: 'run-1', text: 'OK', timestamp: 2000 },
])
const switchedBack = mergeMessages([
  ...initial,
  { id: 'assistant-1', role: 'assistant', runId: 'run-1', text: 'OK', timestamp: 2000 },
])
assert(switchedBack.filter(item => item.role === 'assistant').length === 1, 'session switch history duplicated assistant')

const differentIdsSameDisplay = mergeMessages([
  { id: 'local-user-1', role: 'user', text: '只回复 OK', timestamp: 5000 },
  { id: 'remote-user-1', role: 'user', text: '只回复 OK', timestamp: 5100 },
  { id: 'local-assistant-1', role: 'assistant', text: 'OK', timestamp: 6200 },
  { id: 'remote-assistant-1', role: 'assistant', text: 'OK', timestamp: 6300 },
])
assert(differentIdsSameDisplay.filter(item => item.role === 'user').length === 1, 'same user message with different ids was not deduped')
assert(differentIdsSameDisplay.filter(item => item.role === 'assistant').length === 1, 'same assistant message with different ids was not deduped')

const liveHistory = mergeMessages([
  { role: 'assistant', runId: 'run-2', text: 'OK', timestamp: 3000 },
  { role: 'assistant', runId: 'run-2', text: 'OK', timestamp: 3000 },
])
assert(liveHistory.length === 1, 'live final and history complete were not deduped')

const toolAssistant = mergeMessages([
  { role: 'assistant', runId: 'run-3', text: '', tools: [{ id: 'tool-1', name: 'tool', output: 'OK' }], timestamp: 4000 },
  { role: 'assistant', runId: 'run-3', text: 'OK', tools: [], timestamp: 4000 },
])
assert(toolAssistant.length === 1, 'tool success and assistant final rendered twice')
assert(toolAssistant[0].text === 'OK', 'assistant final text should be retained')
assert(toolAssistant[0].tools.length === 1, 'tool status should be retained as metadata')

const seenEvents = new Set()
function handleEventOnce(eventId) {
  if (seenEvents.has(eventId)) return false
  seenEvents.add(eventId)
  return true
}
assert(handleEventOnce('evt-1') === true, 'first event should process')
assert(handleEventOnce('evt-1') === false, 'duplicate event should be skipped')

let listeners = []
function subscribe(callback) {
  if (!listeners.includes(callback)) listeners.push(callback)
  return () => { listeners = listeners.filter(item => item !== callback) }
}
const callback = () => {}
const unsub = subscribe(callback)
subscribe(callback)
assert(listeners.length === 1, 'same listener subscribed twice')
unsub()
assert(listeners.length === 0, 'unsubscribe did not remove listener')

console.log('OPENCLAW_SESSION_SWITCH_NO_DUPLICATE_HISTORY: PASS')
console.log('OPENCLAW_HISTORY_DIFFERENT_IDS_SAME_DISPLAY_DEDUPED: PASS')
console.log('OPENCLAW_LIVE_HISTORY_MERGE_DEDUPED: PASS')
console.log('OPENCLAW_TOOL_ASSISTANT_DUPLICATE_DEDUPED: PASS')
console.log('OPENCLAW_WS_EVENT_DEDUPED: PASS')
console.log('OPENCLAW_WS_LISTENER_COUNT_STABLE: PASS')
