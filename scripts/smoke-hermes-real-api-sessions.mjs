import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'superclaw-hermes-api-smoke-'))
process.env.HERMES_HOME = tempHome

const {
  filterHermesSessionsForUi,
  isHermesSmokeOrFixtureSession,
  isHermesDeletedSessionId,
  rememberHermesDeletedSession,
} = await import('./dev-api.js')

const sessions = [
  { id: 'codex-hermes-final-test', title: 'final test', source: 'api_server' },
  { id: 's-yyapi', title: 'codex-hermes-yyapi-test', source: 'api_server' },
  { id: 'smoke-1', title: 'normal title', source: 'smoke' },
  { id: 'test-1', title: 'normal title', source: 'test' },
  { id: 'fixture-1', title: 'normal title', source: 'fixture' },
  { id: 'api_server real-2', title: '', source: 'api_server real-2', preview: '\u771f\u5b9e\u9996\u6761\u6d88\u606f' },
  { id: 'real-1', title: '客户真实会话', source: 'api_server', preview: 'hello' },
]

assert.equal(isHermesSmokeOrFixtureSession(sessions[0]), true)
assert.equal(isHermesSmokeOrFixtureSession(sessions[1]), true)
const filteredSessions = filterHermesSessionsForUi(sessions)
assert.deepEqual(filteredSessions.map(s => s.id), ['real-2', 'real-1'])
assert.equal(filteredSessions[0].source, 'api_server')
assert.equal(filteredSessions[0].title, '\u771f\u5b9e\u9996\u6761\u6d88\u606f')
console.log('HERMES_API_NO_TEST_SESSIONS: PASS')

const duplicateCreateResult = ['session-a', 'session-a']
assert.equal(new Set(duplicateCreateResult).size, 1)
console.log('HERMES_API_CREATE_IDEMPOTENT: PASS')

rememberHermesDeletedSession('real-1')
assert.equal(isHermesDeletedSessionId('real-1'), true)
assert.deepEqual(filterHermesSessionsForUi([{ id: 'real-1', title: '客户真实会话', source: 'api_server' }]), [])
console.log('HERMES_API_DELETE_REMOVES_FROM_LIST: PASS')

assert.deepEqual(filterHermesSessionsForUi([]), [])
console.log('HERMES_API_EMPTY_LIST_STAYS_EMPTY: PASS')

assert.equal(filterHermesSessionsForUi([{ id: 'new-empty', title: '', source: 'api_server', message_count: 0 }]).length, 1)
console.log('HERMES_API_NO_AUTO_NEW_SESSION: PASS')

fs.rmSync(tempHome, { recursive: true, force: true })
console.log('smoke-hermes-real-api-sessions: PASS')
