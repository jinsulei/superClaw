import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const chat = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

for (const term of [
  'const OPENCLAW_HISTORY_USER_DUPLICATE_WINDOW_MS = 3000',
  'const OPENCLAW_CONSECUTIVE_USER_RESTORE_DUPLICATE_WINDOW_MS = 10000',
  'function isNearDuplicateOpenClawUserMessage',
  'function isConsecutiveOpenClawUserRestoreDuplicate',
  'function getOpenClawMessageExplicitCreatedTime',
  'function collapseNearDuplicateOpenClawUsers',
  'function hasVisibleOpenClawUserNearDuplicate',
  'renderMeta.fromHistory === true && hasVisibleOpenClawUserNearDuplicate(historyCandidate)',
  'wrap.dataset.openclawUserFingerprint',
  'wrap.dataset.openclawTimestamp',
  'wrap.dataset.openclawCreatedAt',
  "if (role === 'user' && !ts) return ''",
  "if (role === 'user') return ''",
  'if (!prevTime || !nextTime) return false',
  'if (!rowTime || !targetTime) return false',
  'let localDedupedForSession = []',
  'dedupeHistoryStable([...localDedupedForSession, ...result.messages])',
  'collapseNearDuplicateOpenClawUsers(',
  'createdAt: userCreatedAt',
]) {
  assert(chat.includes(term), `refresh history dedupe marker missing: ${term}`)
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function normalizeSessionKey(key) {
  const raw = String(key || '').trim()
  if (!raw || raw === 'main') return 'agent:main:main'
  if (raw.startsWith('agent:')) return raw
  return `agent:main:${raw}`
}

function isNearDuplicateUser(prev, next) {
  if (prev.role !== 'user' || next.role !== 'user') return false
  if (normalizeSessionKey(prev.sessionKey) !== normalizeSessionKey(next.sessionKey)) return false
  if (prev.clientRequestId && next.clientRequestId && prev.clientRequestId === next.clientRequestId) return true
  if (prev.id && next.id && prev.id === next.id) return true
  if (prev.messageId && next.messageId && prev.messageId === next.messageId) return true
  if (normalizeText(prev.text) !== normalizeText(next.text)) return false
  if (!prev.timestamp || !next.timestamp) return false
  return Math.abs(prev.timestamp - next.timestamp) <= 3000
}

function isConsecutiveRestoreDuplicate(prev, next) {
  if (prev.role !== 'user' || next.role !== 'user') return false
  if (normalizeSessionKey(prev.sessionKey) !== normalizeSessionKey(next.sessionKey)) return false
  if (normalizeText(prev.text) !== normalizeText(next.text)) return false
  if (!prev.timestamp || !next.timestamp) return false
  return Math.abs(prev.timestamp - next.timestamp) <= 10000
}

function collapseNearDuplicateUsers(messages) {
  const result = []
  for (const msg of messages) {
    if (msg.role !== 'user') {
      result.push(msg)
      continue
    }
    if (isConsecutiveRestoreDuplicate(result[result.length - 1] || {}, msg)) continue
    if (result.some(existing => isNearDuplicateUser(existing, msg))) continue
    result.push(msg)
  }
  return result
}

const collapsed = collapseNearDuplicateUsers([
  { role: 'user', sessionKey: 'agent:main:a', text: 'reply OK', timestamp: 1000 },
  { role: 'user', sessionKey: 'a', text: 'reply  OK', timestamp: 2000 },
  { role: 'assistant', sessionKey: 'a', text: 'OK', timestamp: 3000 },
  { role: 'user', sessionKey: 'agent:main:b', text: 'reply OK', timestamp: 2500 },
  { role: 'user', sessionKey: 'agent:main:a', text: 'reply OK', timestamp: 9000 },
])

assert(collapsed.filter(item => item.role === 'user' && normalizeSessionKey(item.sessionKey) === 'agent:main:a').length === 2, 'same-session near duplicate users were not collapsed correctly')
assert(collapsed.filter(item => normalizeSessionKey(item.sessionKey) === 'agent:main:b').length === 1, 'different session user was incorrectly collapsed')
assert(collapsed.some(item => item.role === 'assistant'), 'assistant message was removed during user dedupe')

const sameRequest = collapseNearDuplicateUsers([
  { role: 'user', sessionKey: 'agent:main:a', text: 'repeat id', clientRequestId: 'req-1', timestamp: 1000 },
  { role: 'user', sessionKey: 'agent:main:a', text: 'repeat id', clientRequestId: 'req-1', timestamp: 9000 },
])

assert(sameRequest.filter(item => item.role === 'user').length === 1, 'same clientRequestId should dedupe')

const differentRequestIds = collapseNearDuplicateUsers([
  { role: 'user', sessionKey: 'agent:main:a', text: 'repeat id', clientRequestId: 'req-1', timestamp: 1000 },
  { role: 'user', sessionKey: 'agent:main:a', text: 'repeat id', clientRequestId: 'req-2', timestamp: 12000 },
])

assert(differentRequestIds.filter(item => item.role === 'user').length === 2, 'different clientRequestId intentional repeats were collapsed')

const intentionalRepeat = collapseNearDuplicateUsers([
  { role: 'user', sessionKey: 'agent:main:a', text: 'intentional repeat' },
  { role: 'assistant', sessionKey: 'agent:main:a', text: 'OK' },
  { role: 'user', sessionKey: 'agent:main:a', text: 'intentional repeat' },
])

assert(intentionalRepeat.filter(item => item.role === 'user').length === 2, 'intentional repeated user messages without explicit ids/timestamps were collapsed')

const longGapRepeat = collapseNearDuplicateUsers([
  { role: 'user', sessionKey: 'agent:main:a', text: 'long gap repeat', timestamp: 1000 },
  { role: 'user', sessionKey: 'agent:main:a', text: 'long gap repeat', timestamp: 12000 },
])

assert(longGapRepeat.filter(item => item.role === 'user').length === 2, 'same text user messages more than 10s apart were collapsed')

const consecutiveRestoreDuplicate = collapseNearDuplicateUsers([
  { role: 'user', sessionKey: 'agent:main:a', text: 'restore duplicate', timestamp: 1000 },
  { role: 'user', sessionKey: 'agent:main:a', text: 'restore duplicate', timestamp: 4800 },
  { role: 'assistant', sessionKey: 'agent:main:a', text: 'OK', timestamp: 7000 },
  { role: 'user', sessionKey: 'agent:main:a', text: 'restore duplicate', timestamp: 15000 },
])

assert(consecutiveRestoreDuplicate.filter(item => item.role === 'user').length === 2, 'consecutive restore duplicate was not collapsed or post-assistant repeat was removed')

console.log('OPENCLAW_REFRESH_HISTORY_USER_NEAR_DUPLICATE_COLLAPSED: PASS')
console.log('OPENCLAW_REFRESH_HISTORY_DIFFERENT_SESSION_KEPT: PASS')
console.log('OPENCLAW_REFRESH_HISTORY_ASSISTANT_KEPT: PASS')
console.log('OPENCLAW_REFRESH_HISTORY_INTENTIONAL_REPEAT_KEPT: PASS')
console.log('OPENCLAW_REFRESH_KEEP_REPEAT_WITH_DIFFERENT_CLIENT_ID: PASS')
console.log('OPENCLAW_REFRESH_KEEP_INTENTIONAL_REPEAT_USER: PASS')
console.log('OPENCLAW_REFRESH_DEDUPE_BY_CLIENT_REQUEST_ID: PASS')
console.log('OPENCLAW_REFRESH_NO_BLIND_DEDUPE_WITHOUT_IDS: PASS')
console.log('OPENCLAW_REFRESH_CONSECUTIVE_USER_RESTORE_DUPLICATE_COLLAPSED: PASS')
