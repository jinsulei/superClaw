import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  getHermesTaskStatusSummary,
  isHermesTaskStatusQuestion,
} from '../src/engines/hermes/lib/hermes-response-assembler.js'

assert.equal(isHermesTaskStatusQuestion('执行完没有'), true)
assert.equal(isHermesTaskStatusQuestion('现在进展怎么样'), true)
assert.equal(isHermesTaskStatusQuestion('解释一下 requestId'), false)

const running = getHermesTaskStatusSummary({
  activeTask: { status: 'running', lastStep: 'execute_code 正在执行' },
})
assert.match(running, /还在执行中/)
assert.match(running, /当前进度/)
assert.doesNotMatch(running, /execute_code|search_files|read_file/)

const success = getHermesTaskStatusSummary({
  activeTask: { status: 'success', summary: '已读取目标文件并完成检查。' },
})
assert.match(success, /已经执行完成/)
assert.match(success, /已读取目标文件/)

const failed = getHermesTaskStatusSummary({
  activeTask: { status: 'failed', error: '文件不存在' },
})
assert.match(failed, /任务失败/)
assert.match(failed, /文件不存在/)

const idle = getHermesTaskStatusSummary({})
assert.match(idle, /当前没有正在执行/)

const toolOnly = getHermesTaskStatusSummary({
  toolEvents: [{ name: 'read_file', status: 'done' }],
})
assert.match(toolOnly, /检查已完成|任务已完成/)
assert.doesNotMatch(toolOnly, /read_file|execute_code|search_files|工具调用/)

const store = fs.readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const statusBranch = store.match(/if \(isHermesTaskStatusQuestion\(rawText\)\) \{[\s\S]*?return Promise\.resolve\(\{ status: 'success', reason: 'status-report' \}\)/)?.[0] || ''
assert.match(statusBranch, /buildHermesTaskStatusReply/)
assert.doesNotMatch(statusBranch, /api\.hermesAgentRun|api\.hermesAgentRunStream/)

console.log('PASS smoke-hermes-task-progress-report')
