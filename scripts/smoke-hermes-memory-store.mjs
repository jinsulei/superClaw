import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.env.HERMES_MEMORY_DIR = resolve(root, '.runtime', 'hermes', 'memory-smoke')

const {
  addHermesMemory,
  buildHermesMemoryContext,
  clearHermesMemories,
  containsSensitiveMemoryText,
  exportHermesMemoryBackup,
  getHermesMemoryPath,
  handleHermesMemoryCommand,
  isBlockedMemoryType,
  listHermesMemories,
  resetHermesMemoryStoreForTest,
  sanitizeMemoryText,
  shouldSaveHermesMemory,
  shouldSkipMemoryForThisTurn,
  setHermesMemoryEnabled,
  updateHermesMemory,
} = await import('../src/engines/hermes/lib/hermes-memory-store.js')

resetHermesMemoryStoreForTest()

assert.equal(listHermesMemories().length, 0, 'memory store should start empty')

const memoryPath = getHermesMemoryPath()
assert.match(memoryPath, /user-memory\.json$/, 'memory file path should end with user-memory.json')
assert(!memoryPath.includes('src-tauri'), 'memory path must not be under src-tauri resources')
assert(!memoryPath.includes('\\src\\') && !memoryPath.includes('/src/'), 'memory path must not be under src')

assert.equal(shouldSaveHermesMemory('普通聊天：今天天气不错'), false, 'ordinary chat must not be saved')
assert.equal(shouldSaveHermesMemory('以后给我代码时一次性给完整，不要分散。'), true, 'explicit preference should be saved')
assert.equal(shouldSaveHermesMemory('记住：我的 api key 是 sk-test-123456'), false, 'sensitive preference must not be saved')
assert.equal(containsSensitiveMemoryText('token="abc123"'), true, 'token text should be sensitive')
assert.equal(containsSensitiveMemoryText('C:\\tmp\\old-package\\x'), true, 'temp package path should be sensitive')
assert.equal(isBlockedMemoryType('session_summary'), true)
assert.equal(isBlockedMemoryType('temporary_context'), true)
assert.equal(isBlockedMemoryType('tool_lesson'), true)
assert.equal(isBlockedMemoryType('stdout'), true)
assert.equal(isBlockedMemoryType('stderr'), true)
assert.equal(sanitizeMemoryText('token="abc123"'), '', 'token assignment should be rejected after sanitation')
assert.equal(sanitizeMemoryText('C:\\tmp\\old-package\\x'), '', 'old temp path should be rejected')

const addReply = handleHermesMemoryCommand('记住：以后给我代码时一次性给完整，不要分散。')
assert.match(addReply, /已记住/, 'explicit add command should save memory')
assert.equal(listHermesMemories().length, 1, 'memory add command should create one item')

const first = listHermesMemories()[0]
assert.equal(first.type, 'user_preference', 'reply style memory should be user_preference')
assert.equal(first.scope, 'hermes', 'default scope must be hermes')
assert.equal(first.source, 'explicit', 'memory source should be allowed and traceable')

const update = updateHermesMemory(first.id, { tags: ['reply-style'], confidence: 0.95, scope: 'openclaw' })
assert.equal(update.ok, true, 'memory update should work')
assert(update.item.tags.includes('reply-style'), 'memory update should preserve tags')
assert.equal(update.item.scope, 'hermes', 'invalid scope must normalize back to hermes')

const duplicate = addHermesMemory({
  text: '以后给我代码时一次性给完整，不要分散。',
  source: 'explicit',
})
assert.equal(duplicate.ok, true, 'duplicate safe memory should update')
assert.equal(listHermesMemories().length, 1, 'duplicate memory must not grow list')

for (let i = 0; i < 10; i += 1) {
  const result = addHermesMemory({
    type: i % 2 ? 'project_rule' : 'workflow_preference',
    scope: i % 3 ? 'hermes' : 'shared_safe',
    text: `固定规则：Hermes 测试记忆 ${i}，回复格式检查 ${i}`,
    source: 'explicit',
  })
  assert.equal(result.ok, true, `safe memory ${i} should be stored`)
}

assert.equal(addHermesMemory({ type: 'session_summary', text: '固定规则：会话摘要不应该进入长期记忆', source: 'explicit' }).ok, false)
assert.equal(addHermesMemory({ type: 'temporary_context', text: '固定规则：临时上下文不应该进入长期记忆', source: 'explicit' }).ok, false)
assert.equal(addHermesMemory({ type: 'tool_lesson', text: '固定规则：工具教训不应该进入长期记忆', source: 'explicit' }).ok, false)
assert.equal(addHermesMemory({ type: 'stdout', text: '固定规则：stdout output', source: 'explicit' }).ok, false)
assert.equal(addHermesMemory({ type: 'stderr', text: '固定规则：stderr output', source: 'explicit' }).ok, false)
assert.equal(addHermesMemory({ text: '记住：我的 api_key="sk-test-secret"', source: 'explicit' }).ok, false)
assert(!listHermesMemories({ includeDisabled: true }).some(item => /stdout|stderr|session_summary|temporary_context|tool_lesson|sk-test-secret/.test(`${item.type} ${item.text}`)), 'blocked memory data must not be stored')

const context = buildHermesMemoryContext('请检查回复格式')
assert.match(context, /长期偏好和项目记忆/, 'memory context should be generated')
assert((context.match(/^- /gm) || []).length <= 6, 'memory context should inject at most 6 memories')
assert(!context.includes('session_summary'), 'session summaries must not inject')
assert(!context.includes('temporary_context'), 'temporary context must not inject')
assert(!context.includes('tool_lesson'), 'tool lessons must not inject')
assert(!context.includes('stdout'), 'stdout must not inject')
assert(!context.includes('stderr'), 'stderr must not inject')
assert(!context.includes('mem_'), 'memory context should not expose memory ids')

assert.equal(shouldSkipMemoryForThisTurn('不要参考记忆，这次只回答一句话'), true)
assert.equal(buildHermesMemoryContext('不要参考记忆，这次只回答一句话'), '', 'skip phrase must disable injection for this turn')

setHermesMemoryEnabled(false)
assert.equal(buildHermesMemoryContext('回复格式'), '', 'disabled memory should not inject context')
assert.equal(addHermesMemory({ text: '以后默认用短句回答', source: 'explicit' }).ok, false, 'disabled memory should not save')
assert.match(handleHermesMemoryCommand('记住：以后默认用短句回答'), /记忆已关闭，未写入/, 'disabled memory command should not save')

setHermesMemoryEnabled(true)
assert.match(buildHermesMemoryContext('回复格式'), /回复格式|代码/, 'enabled memory should inject relevant context')

const listReply = handleHermesMemoryCommand('你记住了什么？')
assert.match(listReply, /Hermes 记忆/, 'list command should be local and user-visible')
assert.doesNotMatch(listReply, /tool tool|stdout|stderr|raw/i, 'list command must not expose tool/internal output')

const deleteReply = handleHermesMemoryCommand('忘记 一次性给完整')
assert.match(deleteReply, /已忘记|没有找到/, 'delete command should produce a clear result')

const clearReply = handleHermesMemoryCommand('清空记忆')
assert.match(clearReply, /确认清空记忆/, 'clear should require confirmation')
assert(listHermesMemories().length > 0, 'clear without confirmation should not delete items')

const confirmReply = handleHermesMemoryCommand('确认清空记忆')
assert.match(confirmReply, /记忆已清空/, 'confirmed clear should delete memories')
assert.equal(listHermesMemories().length, 0, 'confirmed clear should empty memory store')

addHermesMemory({ text: '用户偏好：以后给我回答要简洁', source: 'explicit' })
const backup = exportHermesMemoryBackup()
assert.match(backup, /用户偏好/, 'export should include sanitized memory text')
assert.doesNotMatch(backup, /sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|temporary-test-secret/, 'export should not contain secrets')

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
assert(!tracked.split(/\r?\n/).some(file => /(^|\/)user-memory\.json$/i.test(file)), 'user-memory.json must not be tracked')

console.log('HERMES_MEMORY_PATH_RUNTIME_ONLY: PASS')
console.log('HERMES_MEMORY_ADD_UPDATE_DELETE: PASS')
console.log('HERMES_MEMORY_ENABLE_DISABLE_CLEAR: PASS')
console.log('HERMES_MEMORY_CONTEXT_LIMIT_AND_SCOPE: PASS')
console.log('HERMES_MEMORY_SECRET_FILTER: PASS')
console.log('HERMES_MEMORY_CLEAR_CONFIRMATION: PASS')
