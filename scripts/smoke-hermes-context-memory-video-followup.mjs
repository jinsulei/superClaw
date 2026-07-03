import assert from 'node:assert/strict'

class MemoryStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  setItem(key, value) {
    this.map.set(key, String(value))
  }
  removeItem(key) {
    this.map.delete(key)
  }
}

globalThis.localStorage = new MemoryStorage()
globalThis.window = {
  location: { hostname: '127.0.0.1' },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0)

const { api } = await import('../src/lib/tauri-api.js')
const { getChatStore } = await import('../src/engines/hermes/lib/chat-store.js')

let runCount = 0
const captured = []

api.hermesProfilesList = async () => ({ active: 'default', profiles: [{ name: 'default', active: true }] })
api.hermesSessionsSummaryList = async () => []
api.hermesSessionDelete = async () => 'ok'
api.hermesSessionDetail = async sessionId => ({
  id: sessionId,
  title: '本地测试会话',
  source: 'api_server',
  messages: [],
})
api.hermesAgentRunStream = async (input, sessionId, history, instructions, _attachments, onEvent) => {
  runCount += 1
  captured.push({ input, sessionId, history, instructions })
  const backendId = sessionId || 'ctx-session'
  onEvent({ event: 'run.started', session_id: backendId })
  const output = runCount === 1
    ? '后台读取工具没有拿到该抖音链接的视频正文、字幕、口播或逐字稿，需要补充素材。'
    : '收到，你只是把抖音链接发给 Hermes；我会基于上一轮链接上下文继续说明素材不足原因。'
  onEvent({ event: 'message.delta', session_id: backendId, delta: output })
  onEvent({ event: 'message.final', session_id: backendId, output })
  onEvent({ event: 'run.completed', session_id: backendId, output })
  return { ok: true }
}

const store = getChatStore()
await store.loadSessions()

const firstPrompt = '请分析这个抖音视频链接：https://v.douyin.com/FKohEovsEfA/'
await store.sendMessage(firstPrompt, { clientRequestId: 'ctx-first' })
await store.sendMessage('我不是打开的抖音', { clientRequestId: 'ctx-followup' })

assert.equal(runCount, 2, 'Hermes test should perform two sends')
assert.equal(captured.length, 2, 'Hermes test should capture both model calls')

const followup = captured[1]
assert.equal(followup.input, '我不是打开的抖音', 'Follow-up input should remain the user correction')
assert.ok(Array.isArray(followup.history), 'Follow-up must include conversation history')
assert.ok(followup.history.length >= 2, 'Follow-up history should include the previous user and assistant messages')
assert.ok(
  followup.history.some(item => item.role === 'user' && String(item.content || '').includes('https://v.douyin.com/FKohEovsEfA/')),
  'Follow-up history must retain the previous Douyin link',
)
assert.ok(
  followup.history.some(item => item.role === 'assistant' && /视频正文|字幕|口播|逐字稿|素材/.test(String(item.content || ''))),
  'Follow-up history must retain the previous assistant material-insufficiency answer',
)
assert.ok(
  String(followup.instructions || '').includes('以下是用户长期偏好和项目记忆') === false,
  'No unrelated long-term memory should be injected when there is no explicit memory',
)

console.log('HERMES_CONTEXT_FOLLOWUP_RETAINS_PREVIOUS_LINK: PASS')
console.log('HERMES_CONTEXT_FOLLOWUP_RETAINS_PREVIOUS_ASSISTANT: PASS')
