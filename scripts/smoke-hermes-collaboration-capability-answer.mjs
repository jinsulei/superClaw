import assert from 'node:assert/strict'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => (storage.has(String(key)) ? storage.get(String(key)) : null),
  setItem: (key, value) => storage.set(String(key), String(value)),
  removeItem: key => storage.delete(String(key)),
}
globalThis.window = {
  location: { hostname: '127.0.0.1' },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0)

const {
  formatHermesCollaborationCapabilityReply,
  isHermesCollaborationCapabilityQuestion,
} = await import('../src/shared/chat-output-guard.js')
const { getChatStore } = await import('../src/engines/hermes/lib/chat-store.js')

const prompt = '你的协作任务是什么？'
assert.equal(isHermesCollaborationCapabilityQuestion(prompt), true)
assert.equal(isHermesCollaborationCapabilityQuestion('你怎么调度 OpenClaw 和 ClaudeCode？'), true)
assert.equal(isHermesCollaborationCapabilityQuestion('三个 Agent 怎么协作？'), true)
assert.equal(isHermesCollaborationCapabilityQuestion('你是谁？请用一句话回答。'), false)
assert.equal(isHermesCollaborationCapabilityQuestion('今天怎么协作写文档？'), false)

const reply = formatHermesCollaborationCapabilityReply()
const mojibakePattern = /(?:\u951f|\u8119|\u8117|\u8292\u9207)/
for (const required of [
  /Hermes/,
  /主脑|调度/,
  /OpenClaw/,
  /ClaudeCode/,
  /拆成可执行步骤|分配给不同执行端|任务分配/,
  /验收/,
  /回传|汇总/,
  /继续.*OpenClaw|继续.*ClaudeCode|返工|重新执行/,
]) {
  assert.match(reply, required)
}

for (const forbidden of [
  /当前可用 Skills 当前可用 Skills/,
  /yyapi/i,
  /auth/i,
  /undefined/,
  /null/,
  /\[object Object\]/,
  /124\.222\.21\.44/,
  mojibakePattern,
]) {
  assert.doesNotMatch(reply, forbidden)
}

const store = getChatStore()
await store.sendMessage(prompt, { clientRequestId: 'collab-capability-1' })
const session = store.activeSession()
assert.ok(session, 'local session is created')
assert.equal(session.messages.length, 2, 'one user message and one assistant reply')
assert.equal(session.messages[0].role, 'user')
assert.equal(session.messages[1].role, 'assistant')
assert.equal(session.messages[1].id, 'collab-capability-1-assistant')
assert.equal(session.messages[1].content, reply)
assert.doesNotMatch(session.messages[1].content, /yyapi|undefined|null|\[object Object\]|124\.222\.21\.44/i)
assert.doesNotMatch(session.messages[1].content, mojibakePattern)

console.log('HERMES_COLLABORATION_CAPABILITY_ANSWER: PASS')
