import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

const chatPage = fs.readFileSync(path.join(repoRoot, 'src/engines/hermes/pages/chat.js'), 'utf8')
const chatStore = fs.readFileSync(path.join(repoRoot, 'src/engines/hermes/lib/chat-store.js'), 'utf8')
const devApi = fs.readFileSync(path.join(repoRoot, 'scripts/dev-api.js'), 'utf8')

function extract(source, start, end) {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

const createHandler = extract(
  chatPage,
  'function handleCreateHermesSession()',
  'async function handleNewWorkFileSession()',
)

assert.match(chatPage, /function handleCreateHermesSession\(\)/)
assert.match(chatPage, /querySelector\('\.hm-chat-new-btn'\)\?\.addEventListener\('click', \(\) => \{\s*handleCreateHermesSession\(\)\s*\}\)/)
assert.match(chatPage, /querySelector\('#hm-chat-new-chat'\)\?\.addEventListener\('click', \(\) => \{\s*handleCreateHermesSession\(\)\s*\}\)/)
assert.doesNotMatch(chatPage, /querySelector\('\.hm-chat-new-btn'\)[\s\S]{0,180}handleNewWorkFileSession/)
assert.doesNotMatch(chatPage, /querySelector\('#hm-chat-new-chat'\)[\s\S]{0,180}handleNewWorkFileSession/)

assert.match(createHandler, /store\.createEmptySession/)
assert.match(createHandler, /profile: store\.state\.activeProfile \|\| 'default'|const profile = store\.state\.activeProfile \|\| 'default'/)
assert.match(createHandler, /selected\.clear\(\)/)
assert.match(createHandler, /resetInput\(\)/)
assert.match(createHandler, /clearLiveTextareaDomValue\(\)/)
assert.match(createHandler, /input\.focus\(\)/)
assert.doesNotMatch(createHandler, /openclaw|claude/i)

assert.match(chatPage, /const profileSwitcherMarkup = ''/)
assert.doesNotMatch(chatPage, /<div class="hm-chat-sidebar-profile">\s*\$\{renderProfileSwitcher\(\)\}\s*<\/div>/)

assert.match(chatStore, /function createEmptySession\(meta = \{\}\)/)
assert.match(chatStore, /function createLocalSession\(meta = \{\}\)/)
assert.match(chatStore, /const id = meta\.id \|\| uid\(\)/)
assert.match(chatStore, /sessionId: id/)
assert.match(chatStore, /session_id: id/)
assert.match(chatStore, /profile: meta\.profile \|\| state\.activeProfile \|\| 'default'/)
assert.match(chatStore, /messages: \[\]/)
assert.match(chatStore, /pendingTools: \{\}/)
assert.match(chatStore, /failedTasks: \[\]/)
assert.match(chatStore, /toolEvents: \[\]/)
assert.match(chatStore, /forceEmptyHistoryOnce: Boolean\(meta\.createEmpty \|\| meta\.forceLocal\)/)
assert.match(chatStore, /preventBackendSessionAdoption: Boolean\(meta\.createEmpty \|\| meta\.forceLocal\)/)
assert.match(chatStore, /if \(current\.preventBackendSessionAdoption\) return currentId/)

const emptySession = extract(
  chatStore,
  'function createEmptySession(meta = {})',
  'function adoptBackendSessionId',
)

assert.match(emptySession, /if \(state\.streaming\) return null/)
assert.match(emptySession, /detachStreamListeners\(\)/)
assert.match(emptySession, /state\.runningSessionId = null/)
assert.match(emptySession, /state\.runningClientRequestId = null/)
assert.match(emptySession, /state\.pendingAssistantId = null/)
assert.match(emptySession, /state\.liveTools = \[\]/)
assert.match(emptySession, /assistantMessageByRequestId\.clear\(\)/)
assert.match(emptySession, /createLocalSession\(\{/)
assert.doesNotMatch(emptySession, /openclaw|claude/i)

assert.match(chatStore, /forceEmptyHistory \? \[\] : buildDefaultConversationHistory\(s, userMessage\.id\)/)
assert.match(chatStore, /createEmptySession,/)

assert.match(devApi, /const bridgedHistory = Array\.isArray\(conversationHistory\)[\s\S]*?payload\.conversation_history = bridgedHistory/)
assert.match(devApi, /const bridgedHistory = Array\.isArray\(args\.conversationHistory\)[\s\S]*?payload\.conversation_history = bridgedHistory/)

console.log('PASS smoke-hermes-plus-new-session')
