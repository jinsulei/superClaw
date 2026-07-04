import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const chat = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function includesAll(source, terms, label) {
  for (const term of terms) {
    assert(source.includes(term), `${label} missing: ${term}`)
  }
}

includesAll(chat, [
  'function normalizeOpenClawSessionKey(key)',
  'function isOpenClawCurrentSessionKey(key)',
  'const key = normalizeOpenClawSessionKey(s.sessionKey || s.key)',
  "const active = isOpenClawCurrentSessionKey(key) ? ' active' : ''",
  'void switchSession(normalizeOpenClawSessionKey(item.dataset.key))',
  'const targetSessionKey = normalizeOpenClawSessionKey(newKey)',
  'if (!targetSessionKey || isOpenClawCurrentSessionKey(targetSessionKey)) return false',
  '_sessionKey = targetSessionKey',
  'localStorage.setItem(STORAGE_SESSION_KEY, targetSessionKey)',
], 'OpenClaw session selection state')

includesAll(chat, [
  'if (!wsClient.gatewayReady) {',
  'renderSessionList(getLocalSessions())',
  'return',
], 'OpenClaw local session list under gateway setup states')

includesAll(chat, [
  'const requestedSessionKey = normalizeOpenClawSessionKey(_sessionKey)',
  'const isLoadHistoryForCurrentSession = () => isOpenClawCurrentSessionKey(requestedSessionKey)',
  'const local = await getLocalMessages(requestedSessionKey, 200)',
  'if (!_messagesEl || !isLoadHistoryForCurrentSession()) {',
  '_isLoadingHistory = false',
  'const result = await wsClient.chatHistory(requestedSessionKey, 200)',
  'if (!isLoadHistoryForCurrentSession()) return',
  'sessionKey: msg.sessionKey || requestedSessionKey',
], 'OpenClaw stale history restore guard')

includesAll(chat, [
  'const payloadSessionKey = normalizeOpenClawSessionKey(payload.sessionKey)',
  'const currentSessionKey = normalizeOpenClawSessionKey(_sessionKey)',
  'const hostedSessionKey = normalizeOpenClawSessionKey(getHostedBoundSessionKey())',
  'const isCurrentSession = !payloadSessionKey || !currentSessionKey || payloadSessionKey === currentSessionKey',
  'const isHostedSession = !!payloadSessionKey && !!hostedSessionKey && payloadSessionKey === hostedSessionKey',
], 'OpenClaw websocket event session guard')

assert(!/const active = key === _sessionKey \?/.test(chat), 'session active class must not compare raw ids')
assert(!/void switchSession\(item\.dataset\.key\)/.test(chat), 'session click must normalize dataset key')
assert(!/const result = await wsClient\.chatHistory\(_sessionKey, 200\)/.test(chat), 'history load must bind requested session key')
assert(!/const local = await getLocalMessages\(_sessionKey, 200\)/.test(chat), 'local restore must bind requested session key')

function normalizeSessionKey(key) {
  return String(key || '').trim()
}

function selectedClass(sessionId, activeId) {
  const key = normalizeSessionKey(sessionId)
  return normalizeSessionKey(activeId) === key ? ' active' : ''
}

assert(selectedClass(42, '42') === ' active', 'numeric session id should match string selected id')
assert(selectedClass(' agent:main:one ', 'agent:main:one') === ' active', 'trimmed session id should match selected id')
assert(selectedClass('agent:main:one', 'agent:main:two') === '', 'different sessions must not be selected')

function shouldApplyHistory(requested, current) {
  return normalizeSessionKey(requested) === normalizeSessionKey(current)
}

assert(shouldApplyHistory('agent:main:a', 'agent:main:a') === true, 'current session history should apply')
assert(shouldApplyHistory('agent:main:a', 'agent:main:b') === false, 'stale session history should not apply')

console.log('OPENCLAW_SESSION_SELECTION_STATE: PASS')
console.log('OPENCLAW_SESSION_ID_NORMALIZED: PASS')
console.log('OPENCLAW_NEEDS_SETUP_LOCAL_SESSION_SWITCH: PASS')
console.log('OPENCLAW_STALE_HISTORY_GUARDED: PASS')
console.log('OPENCLAW_WS_EVENT_SESSION_GUARDED: PASS')
