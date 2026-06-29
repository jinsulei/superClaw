import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  formatHermesToolSummaryForUser,
  isHermesDebugToolsVisible,
  normalizeHermesVisibleReply,
  stripHermesToolProcessText,
  summarizeHermesToolResultForUser,
} from '../src/engines/hermes/lib/hermes-response-assembler.js'

const internalToolText = /execute_code|search_files|read_file|tool_result|tool\s+tool|stdout\s*:|stderr\s*:|HEARTBEAT_OK|\[TOOL_CALL\]|toolCallId|arguments|结果已同步到|工具执行|工具调用|展开详情|收起详情/i

delete globalThis.localStorage
assert.equal(isHermesDebugToolsVisible(), false)

globalThis.localStorage = {
  getItem(key) {
    return key === 'DEBUG_HERMES_TOOLS' ? '1' : null
  },
}
assert.equal(isHermesDebugToolsVisible(), true)
delete globalThis.localStorage

const cleaned = stripHermesToolProcessText([
  'execute_code',
  'search_files',
  'read_file',
  'tool_result',
  'tool tool',
  '工具执行完成',
  '结果已同步到详情',
  'stdout: OK',
  'stderr: warning',
  '[TOOL_CALL] {"name":"execute_code"}',
  'HEARTBEAT_OK',
  '{"toolCallId":"abc","arguments":{"cmd":"dir"}}',
  '检查已完成。',
].join('\n'))

assert.equal(cleaned, '检查已完成。')
assert.doesNotMatch(cleaned, internalToolText)

const summary = summarizeHermesToolResultForUser({
  userText: '汇报现在的进程',
  toolEvents: [
    {
      name: 'execute_code',
      status: 'done',
      output: 'stdout: OK\n当前进程运行正常。',
    },
    {
      name: 'search_files',
      status: 'done',
      result: 'tool_result\n未发现异常配置。',
    },
  ],
})

assert.match(summary, /检查已完成|当前进程运行正常|未发现异常配置/)
assert.doesNotMatch(summary, internalToolText)
assert.doesNotMatch(summary, /execute_code|search_files/)

const fallback = formatHermesToolSummaryForUser({
  userText: '执行完没有？',
  toolEvents: [{ name: 'read_file', status: 'done' }],
})
assert.match(fallback, /任务已完成|没有拿到可展示/)
assert.doesNotMatch(fallback, /read_file|工具调用已完成|工具结果/)

const visible = normalizeHermesVisibleReply([
  'execute_code',
  '工具执行完成',
  'stdout: done',
  '{"toolCallId":"abc","arguments":{"cmd":"pwd"}}',
  '文件已更新。',
].join('\n'), {
  userText: '修复文件',
})

assert.equal(visible, '文件已更新。')
assert.doesNotMatch(visible, internalToolText)

const page = fs.readFileSync('src/engines/hermes/pages/chat.js', 'utf8')
assert.match(page, /DEBUG_HERMES_TOOLS/)
assert.match(page, /function renderToolMessage\(m\)\s*{\s*if \(!isHermesDebugToolsVisible\(\)\) return ''/s)
assert.match(page, /if \(m\.role === 'tool'\) return \(!isHermesDebugToolsVisible\(\) \|\| shouldHideToolRow\(m\)\)/)
assert.match(page, /const showDetails = isHermesDebugToolsVisible\(\)/)
assert.match(page, /const tools = isHermesDebugToolsVisible\(\)/)

const store = fs.readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
assert.match(store, /isHermesDebugToolsVisible/)
assert.match(store, /runTools\.length && isHermesDebugToolsVisible\(\)/)
assert.match(store, /isHermesDebugToolsVisible\(\) \? dedupeToolEvents\(state\.liveTools\) : \[\]/)

console.log('PASS smoke-hermes-hide-tool-process')
