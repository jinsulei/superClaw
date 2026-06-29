import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  enforceHermesReplyLength,
  formatHermesStructuredReply,
  formatHermesToolSummaryForUser,
  normalizeHermesVisibleReply,
} from '../src/engines/hermes/lib/hermes-response-assembler.js'

const badMarkdown = /\*\*[^*\n]{1,80}\s+\*|(^|\n)\s*\*\s*[:：]?\s*(?=\n|$)|\*\s*[:：]/
const internalStatus = /HEARTBEAT_OK|tool\s+tool|_\((?:stopped|running|done)\)_|结果已同步|下方详情|toolCallId|raw json|tool args/i

const skills = enforceHermesReplyLength(
  [
    'browser — 打开网页并读取页面内容',
    'devops/deploy — 检查部署环境',
    'minimax-image-generation — 图片生成',
    'HEARTBEAT_OK',
  ].join('\n'),
  '查看当前可用 skills',
)

assert.match(skills, /📌 当前可用/)
assert.match(skills, /browser\s+—\s+打开网页/)
assert.match(skills, /devops\/deploy\s+—\s+检查部署/)
assert.ok(skills.split('\n').filter(Boolean).length >= 4, 'skills reply keeps multiple lines')
assert.ok(skills.split('\n').filter(Boolean).length <= 12, 'skills reply is bounded')
assert.doesNotMatch(skills, internalStatus)
assert.doesNotMatch(skills, badMarkdown)

const report = normalizeHermesVisibleReply(
  [
    '已经检查完成。',
    'Gateway 正常。',
    '工具结果没有异常。',
    '下一步可以继续验证页面。',
  ].join('\n'),
  { userText: '汇报现在的进程' },
)

assert.match(report, /📌 检查结果|已经检查完成/)
assert.ok(report.split('\n').filter(Boolean).length >= 3, 'report reply keeps readable lines')
assert.doesNotMatch(report, internalStatus)

const ordinary = enforceHermesReplyLength(
  [
    'requestId 是一次请求的唯一编号。',
    '它把用户输入、助手回复和工具结果绑定到同一轮。',
    '这样可以避免旧任务结果串到新问题里。',
  ].join('\n'),
  '解释一下 requestId 是什么',
)

assert.ok(ordinary.split(/\n+/).filter(Boolean).length >= 3)
assert.ok(ordinary.split(/\n+/).filter(Boolean).length <= 5)
assert.doesNotMatch(ordinary, /📌 当前可用/)

assert.equal(enforceHermesReplyLength('OK', '只回复 OK'), 'OK')

const identity = normalizeHermesVisibleReply('你好，我是 MiniMax-M3。', { userText: '你是谁？' })
assert.match(identity, /Hermes Agent/)
assert.ok(identity.length <= 180)

const formatted = formatHermesStructuredReply('Tool tool success\n{"toolCallId":"x"}\n检查完成。', '排查结果')
assert.doesNotMatch(formatted, /toolCallId|Tool tool/i)

const toolSummary = formatHermesToolSummaryForUser({
  userText: '查看当前可用 skills',
  toolEvents: [{ name: 'skill_view', status: 'done' }],
})
assert.match(toolSummary, /检查已完成|任务已完成/)
assert.doesNotMatch(toolSummary, /skill_view|execute_code|search_files|read_file|工具调用/)

const store = fs.readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
assert.doesNotMatch(store, /src\/pages\/chat\.js|openclaw|claude-panel/i)

console.log('PASS smoke-hermes-structured-reply-style')
