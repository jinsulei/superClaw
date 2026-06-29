import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  dedupeToolEvents,
  detectReportIntent,
  formatToolResultsForUser,
  isInternalStatusOnlyText,
  normalizeAssistantVisibleText,
  sanitizeMediaVisibleText,
} from '../src/shared/chat-output-guard.js'

const repoRoot = new URL('../', import.meta.url)
const read = file => fs.readFileSync(new URL(file, repoRoot), 'utf8')

assert.equal(detectReportIntent('汇报现在的进程'), 'process_status')
assert.equal(detectReportIntent('汇报工作进展'), 'work_progress')
assert.equal(detectReportIntent('汇报问题'), 'issue_report')
assert.equal(detectReportIntent('查看图片'), 'image_inspect')

for (const text of ['_(stopped)_', '*(stopped)*', '工具已完成，结果已同步', 'HEARTBEAT_OK', '[TOOL_CALL]']) {
  assert.equal(isInternalStatusOnlyText(text), true, `${text} should be hidden`)
}

const duplicateTools = dedupeToolEvents([
  { toolCallId: 'call-1', toolName: 'execute_code', status: 'running' },
  { toolCallId: 'call-1', toolName: 'execute_code', status: 'done', output: 'pid=1234' },
  { toolCallId: 'call-1', toolName: 'execute_code', status: 'done', output: 'pid=1234' },
])
assert.equal(duplicateTools.length, 1)
assert.equal(duplicateTools[0].status, 'done')

const processReport = formatToolResultsForUser({
  userText: '汇报现在的进程',
  toolEvents: duplicateTools,
})
assert.match(processReport, /进程|服务|execute_code|pid=1234/)
assert.ok(!processReport.includes('工具已完成，结果已同步'))
assert.ok(!processReport.includes('_(stopped)_'))

const visibleFromToolOnly = normalizeAssistantVisibleText({
  text: '_(stopped)_',
  userText: '汇报工作进展',
  toolEvents: duplicateTools,
})
assert.match(visibleFromToolOnly, /工作进展|execute_code|pid=1234/)

const media = sanitizeMediaVisibleText('MEDIA:C:\\tmp\\poster.jpeg\n{"prompt":"secret poster","image_prompt":"secret"}', {
  imageTask: true,
})
assert.ok(media.includes('MEDIA:C:\\tmp\\poster.jpeg'))
assert.ok(!/prompt|secret poster|image_prompt/i.test(media.replace(/^MEDIA:.*$/m, '')))
assert.ok(media.includes('图片已生成。'))

const chatStore = read('src/engines/hermes/lib/chat-store.js')
assert.match(chatStore, /chat-output-guard\.js/)
assert.match(chatStore, /dedupeToolEvents/)
assert.match(chatStore, /formatToolResultsForUser/)
assert.ok(!chatStore.includes("msg.content = '_(stopped)_'"))
assert.ok(!chatStore.includes("|| '(empty)'"))

const devApi = read('scripts/dev-api.js')
assert.match(devApi, /chat-output-guard\.js/)
assert.match(devApi, /sanitizeMediaVisibleText/)
assert.ok(!/taskkill\s+\/IM\s+node\.exe/i.test(devApi))

console.log('PASS smoke-chat-reporting-ux')
