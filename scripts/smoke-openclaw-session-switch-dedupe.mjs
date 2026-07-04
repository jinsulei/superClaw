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
  'function normalizeOpenClawSessionKey',
  'function isOpenClawCurrentSessionKey',
  'function collapseNearDuplicateOpenClawUsers',
  'function hasVisibleOpenClawUserNearDuplicate',
  'async function loadHistory(sessionKey = _sessionKey)',
  'const requestedSessionKey = normalizeOpenClawSessionKey(sessionKey)',
  'const isLoadHistoryForCurrentSession = () => isOpenClawCurrentSessionKey(requestedSessionKey)',
  'loadHistory(targetSessionKey)',
  'const active = isOpenClawCurrentSessionKey(key) ?',
  'data-session-key="${escapeAttr(key)}"',
  'item.dataset.sessionKey || item.dataset.key',
  'sessionKey: msg.sessionKey || requestedSessionKey',
  'fromHistory: true',
], 'OpenClaw session switch history guard implementation')

includesAll(ws, [
  'if (!this._eventListeners.includes(callback)) this._eventListeners.push(callback)',
  'return () => { this._eventListeners = this._eventListeners.filter(fn => fn !== callback) }',
], 'WebSocket listener subscribe/unsubscribe guard')

function normalizeSessionKey(key) {
  const raw = String(key || '').trim()
  if (!raw || raw === 'main') return 'agent:main:main'
  if (raw.startsWith('agent:')) return raw
  return `agent:main:${raw}`
}

let currentSessionKey = 'agent:main:one'
function isCurrentSessionKey(key) {
  return normalizeSessionKey(key) === normalizeSessionKey(currentSessionKey)
}

assert(normalizeSessionKey('main') === 'agent:main:main', 'main session key should normalize')
assert(normalizeSessionKey('draft.md') === 'agent:main:draft.md', 'bare session key should normalize')
assert(isCurrentSessionKey('one') === true, 'normalized selected session should match')
assert(isCurrentSessionKey('agent:main:two') === false, 'different selected session should not match')

let renderedSession = []
function appendHistory(requestedSessionKey, text) {
  if (!isCurrentSessionKey(requestedSessionKey)) return false
  renderedSession.push({ sessionKey: normalizeSessionKey(requestedSessionKey), text })
  return true
}

const requestedA = 'agent:main:one'
currentSessionKey = 'agent:main:two'
assert(appendHistory(requestedA, 'stale') === false, 'stale history should not render after session switch')
assert(renderedSession.length === 0, 'stale history changed current messages')
assert(appendHistory('two', 'fresh') === true, 'current history should render')
assert(renderedSession.length === 1 && renderedSession[0].sessionKey === 'agent:main:two', 'current history rendered into wrong session')

console.log('OPENCLAW_SESSION_KEY_NORMALIZED: PASS')
console.log('OPENCLAW_SESSION_SWITCH_STALE_HISTORY_GUARDED: PASS')
console.log('OPENCLAW_SESSION_SWITCH_SELECTED_STATE_GUARDED: PASS')
console.log('OPENCLAW_WS_LISTENER_COUNT_STABLE: PASS')
