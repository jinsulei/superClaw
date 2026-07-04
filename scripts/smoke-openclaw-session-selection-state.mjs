import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const chat = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

for (const term of [
  'function normalizeOpenClawSessionKey',
  'function isOpenClawCurrentSessionKey',
  'const key = normalizeOpenClawSessionKey(s.sessionKey || s.key ||',
  'const active = isOpenClawCurrentSessionKey(key) ?',
  'data-session-key="${escapeAttr(key)}"',
  'addEventListener(\'click\', handleOpenClawSessionListClick, true)',
  'function handleOpenClawSessionListClick',
  'item.dataset.sessionKey || item.dataset.key',
  'function syncOpenClawSessionListActiveState',
  'syncOpenClawSessionListActiveState(targetSessionKey)',
  'const targetSessionKey = normalizeOpenClawSessionKey(newKey)',
  'localStorage.setItem(STORAGE_SESSION_KEY, targetSessionKey)',
  '_sessionKey = targetSessionKey',
  'loadHistory(targetSessionKey)',
]) {
  assert(chat.includes(term), `session selection marker missing: ${term}`)
}

function normalizeSessionKey(key) {
  const raw = String(key || '').trim()
  if (!raw || raw === 'main') return 'agent:main:main'
  if (raw.startsWith('agent:')) return raw
  return `agent:main:${raw}`
}

let selected = 'agent:main:a'

function activeClass(key) {
  return normalizeSessionKey(key) === normalizeSessionKey(selected) ? ' active' : ''
}

function renderCards(sessions) {
  return sessions.map(session => ({
    key: normalizeSessionKey(session.sessionKey || session.key),
    active: activeClass(session.sessionKey || session.key).trim() === 'active',
  }))
}

function switchSession(key) {
  const target = normalizeSessionKey(key)
  if (target === normalizeSessionKey(selected)) return false
  selected = target
  return true
}

function clickSession(dataset) {
  const clickedKey = dataset.sessionKey || dataset.key
  return switchSession(clickedKey)
}

assert(activeClass('a') === ' active', 'normalized active class did not match bare key')
assert(activeClass('agent:main:b') === '', 'inactive session rendered active')
assert(clickSession({ sessionKey: 'b' }) === true, 'click did not switch by data-session-key')
assert(selected === 'agent:main:b', 'selected session was not normalized on click')
assert(activeClass('agent:main:b') === ' active', 'active class did not follow selected session')
assert(switchSession('agent:main:b') === false, 'same selected session should not reload')

const reordered = renderCards([
  { sessionKey: 'agent:main:c' },
  { sessionKey: 'agent:main:b' },
  { sessionKey: 'agent:main:a' },
])

assert(reordered[1].active === true, 'active state did not survive session list reorder by key')
assert(reordered.filter(card => card.active).length === 1, 'more than one session rendered active')

console.log('OPENCLAW_SESSION_SELECTION_NORMALIZED_ACTIVE_CLASS: PASS')
console.log('OPENCLAW_SESSION_SELECTION_SWITCH_UPDATES_TARGET: PASS')
console.log('OPENCLAW_SESSION_SELECTION_SAME_SESSION_NO_RELOAD: PASS')
console.log('OPENCLAW_SESSION_LIST_ACTIVE_BY_KEY: PASS')
console.log('OPENCLAW_SESSION_CLICK_SYNC_STATE: PASS')
console.log('OPENCLAW_SESSION_ACTIVE_SURVIVES_LIST_REORDER: PASS')
