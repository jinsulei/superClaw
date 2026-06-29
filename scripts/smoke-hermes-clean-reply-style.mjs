import assert from 'node:assert/strict'
import {
  enforceHermesReplyLength,
  formatHermesToolSummaryForUser,
  normalizeHermesVisibleReply,
} from '../src/engines/hermes/lib/hermes-response-assembler.js'

const longTemplateTerms = /\u5e95\u5c42\u6a21\u578b|\u8fd0\u884c\u4f4d\u7f6e|\u8c03\u5ea6\u4e0e\u59d4\u6d3e|\u8bb0\u5fc6\u4e0e\u6280\u80fd|\u539f\u5219/
const badMarkdown = /\*\*[^*\n]{1,80}\s+\*|(^|\n)\s*\*\s*[:\uff1a]?\s*(?=\n|$)|\*\s*[:\uff1a]/
const internalStatus = /HEARTBEAT_OK|tool\s+tool|_\((?:stopped|running|done)\)_|\u7ed3\u679c\u5df2\u540c\u6b65|\u4e0b\u65b9\u8be6\u60c5|toolCallId|raw json|tool args/i

const identity = normalizeHermesVisibleReply(
  [
    '\u4f60\u597d\uff0c\u6211\u662f MiniMax-M3\u3002',
    '\u5e95\u5c42\u6a21\u578b\uff1aMiniMax-M3',
    '\u8fd0\u884c\u4f4d\u7f6e\uff1aSuperClaw',
    '\u539f\u5219\uff1a\u5148\u9a8c\u8bc1\u3002',
  ].join('\n'),
  { userText: '\u4ecb\u7ecd\u4e0b\u81ea\u5df1' },
)

assert.match(identity, /\u6211\u662f Hermes Agent/)
assert.match(identity, /Nous Research/)
assert.match(identity, /\u9700\u8981\u6211\u505a\u70b9\u4ec0\u4e48\u5417/)
assert.doesNotMatch(identity, /MiniMax|OpenClaw|ClaudeCode/)
assert.doesNotMatch(identity, longTemplateTerms)
assert.doesNotMatch(identity, badMarkdown)
assert.ok(identity.length <= 180, 'identity reply stays short')

const ordinary = normalizeHermesVisibleReply(
  [
    '\u53ef\u4ee5\u5904\u7406\u3002',
    '\u5e95\u5c42\u6a21\u578b\uff1aMiniMax-M3',
    '\u8fd0\u884c\u4f4d\u7f6e\uff1a\u672c\u5730',
    '\u8c03\u5ea6\u4e0e\u59d4\u6d3e\uff1a\u5f88\u957f\u7684\u5de5\u4f5c\u6d41\u7a0b',
    '**\u80fd\u529b *',
  ].join('\n'),
  { userText: '\u4f60\u80fd\u5e2e\u6211\u5417' },
)

assert.equal(ordinary, '\u53ef\u4ee5\u5904\u7406\u3002')
assert.ok(ordinary.length <= 420, 'ordinary reply stays concise')
assert.doesNotMatch(ordinary, longTemplateTerms)
assert.doesNotMatch(ordinary, badMarkdown)

const ordinaryFull = normalizeHermesVisibleReply(
  [
    'requestId 是一次请求的唯一编号。',
    '它用来把用户消息、助手回复和工具结果绑定到同一轮，避免串到别的问题里。',
    '排查重复回复或串稿时，可以先看同一轮里的 requestId 是否一致。',
  ].join('\n'),
  { userText: '解释一下 requestId 是什么' },
)

const ordinaryFullLineCount = ordinaryFull.split(/\n+/).filter(Boolean).length
assert.ok(
  ordinaryFullLineCount >= 1 && ordinaryFullLineCount <= 5,
  'ordinary explanation stays within the short reply line budget',
)
assert.match(ordinaryFull, /requestId/)
assert.match(ordinaryFull, /工具结果/)

const brief = enforceHermesReplyLength('OK', '只回复 OK')
assert.equal(brief, 'OK')

const detailed = normalizeHermesVisibleReply(
  [
    '\u53ef\u4ee5\u5c55\u5f00\u8bf4\u3002',
    '\u5e95\u5c42\u6a21\u578b\u7531\u7cfb\u7edf\u914d\u7f6e\u63d0\u4f9b\u3002',
    '\u8fd0\u884c\u4f4d\u7f6e\u5728 SuperClaw \u5185\u3002',
  ].join('\n'),
  { userText: '\u8be6\u7ec6\u4ecb\u7ecd\u4f60\u7684\u80fd\u529b' },
)

assert.match(detailed, /\u5e95\u5c42\u6a21\u578b/)
assert.match(detailed, /\u8fd0\u884c\u4f4d\u7f6e/)

const toolSummary = formatHermesToolSummaryForUser({
  userText: '\u6c47\u62a5\u73b0\u5728\u7684\u8fdb\u7a0b',
  toolEvents: [
    {
      name: 'exec',
      status: 'done',
      result: 'HEARTBEAT_OK _(stopped)_ {"toolCallId":"abc"}',
    },
  ],
})

assert.match(toolSummary, /\u68c0\u67e5\u5df2\u5b8c\u6210|\u4efb\u52a1\u5df2\u5b8c\u6210/)
assert.doesNotMatch(toolSummary, internalStatus)
assert.doesNotMatch(toolSummary, /exec|execute_code|search_files|read_file|\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210|\u5de5\u5177\u7ed3\u679c/)
assert.doesNotMatch(toolSummary, /\|.+\|/)
assert.ok(toolSummary.length <= 160, 'tool summary stays concise')

const rawTool = normalizeHermesVisibleReply(
  [
    'Tool tool success',
    '| 1 | exec | ok |',
    '{"toolCallId":"abc","arguments":{"cmd":"dir"}}',
    '\u68c0\u67e5\u5df2\u5b8c\u6210\u3002',
  ].join('\n'),
  { userText: '\u6c47\u62a5\u73b0\u5728\u7684\u8fdb\u7a0b' },
)

assert.equal(rawTool, '\u68c0\u67e5\u5df2\u5b8c\u6210\u3002')
assert.doesNotMatch(rawTool, internalStatus)
assert.doesNotMatch(rawTool, /\|.+\|/)

console.log('PASS smoke-hermes-clean-reply-style')
