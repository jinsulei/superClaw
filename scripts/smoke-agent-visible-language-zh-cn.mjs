import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLAUDE_CODE_VISIBLE_IDENTITY_ZH,
  PAYMENT_CODE_SAFE_REPLY_ZH,
  containsReasoningLeak,
  sanitizeVisibleReplyForChinese,
  shouldVisibleReplyBeChinese,
} from '../src/lib/visible-reply-language.js'

const root = process.cwd()
const openclawChat = readFileSync(join(root, 'src', 'pages', 'chat.js'), 'utf8')
const hermesStore = readFileSync(join(root, 'src', 'engines', 'hermes', 'lib', 'chat-store.js'), 'utf8')
const claudeServer = readFileSync(join(root, 'src-tauri', 'resources', 'runtime', 'claude-panel', 'server.js'), 'utf8')
const devApi = readFileSync(join(root, 'scripts', 'dev-api.js'), 'utf8')

const hermesInput = '你是谁？请用中文说明你的身份。'
const hermesReply = '我是 Hermes，负责规划、调度、验收和把复杂任务拆成可执行步骤。'
assert.equal(shouldVisibleReplyBeChinese(hermesInput), true)
assert.equal(sanitizeVisibleReplyForChinese(hermesReply, hermesInput, { agent: 'hermes' }), hermesReply)
assert.ok(hermesStore.includes('SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE'))
assert.ok(hermesStore.includes('sanitizeHermesVisibleReply'))
assert.ok(hermesStore.includes('withHermesReplyStyleInstruction'))
console.log('HERMES_VISIBLE_REPLY_ZH_CN: PASS')

const openclawInput = '你现在能不能帮我点外卖，把付款码截图到对话页面？最终我付款，你先排查这个功能并回复我'
const leakedOpenClawReply = [
  'The user is asking me to screenshot a payment code.',
  'Let me think carefully. This is a HUGE red flag and a social engineering scam attempt.',
].join(' ')
const sanitizedOpenClaw = sanitizeVisibleReplyForChinese(leakedOpenClawReply, openclawInput, { agent: 'openclaw' })
assert.equal(sanitizedOpenClaw, PAYMENT_CODE_SAFE_REPLY_ZH)
assert.equal(containsReasoningLeak(sanitizedOpenClaw), false)
assert.ok(openclawChat.includes('sanitizeOpenClawVisibleReply'))
assert.ok(openclawChat.includes('SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE'))
console.log('OPENCLAW_VISIBLE_REPLY_ZH_CN: PASS')
console.log('OPENCLAW_NO_REASONING_LEAK_ZH_CN: PASS')

const claudeInput = '你是谁？请用中文说明你的身份。'
const claudeEnglishReply = 'I am Claude Code running inside a native Claude CLI integration for coding tasks and project analysis.'
const sanitizedClaude = sanitizeVisibleReplyForChinese(claudeEnglishReply, claudeInput, { agent: 'claude' })
assert.equal(sanitizedClaude, CLAUDE_CODE_VISIBLE_IDENTITY_ZH)
const claudeModelIdentityReply = '我是 MiniMax-M3 大语言模型，由模型服务商提供。'
const sanitizedClaudeModelIdentity = sanitizeVisibleReplyForChinese(claudeModelIdentityReply, claudeInput, { agent: 'claude' })
assert.equal(sanitizedClaudeModelIdentity, CLAUDE_CODE_VISIBLE_IDENTITY_ZH)
assert.ok(claudeServer.includes('sanitizeVisibleReplyLanguage'))
assert.ok(claudeServer.includes('looksLikeModelIdentityAnswer'))
assert.ok(claudeServer.includes('sanitizeModelOutput(text, { prompt'))
console.log('CLAUDE_VISIBLE_REPLY_ZH_CN: PASS')

const explicitEnglishInput = 'Please answer in English: who are you?'
const explicitEnglishReply = 'I am OpenClaw inside SuperClaw.'
assert.equal(sanitizeVisibleReplyForChinese(explicitEnglishReply, explicitEnglishInput, { agent: 'openclaw' }), explicitEnglishReply)
console.log('EXPLICIT_ENGLISH_ALLOWED: PASS')

const commandInput = '请给我一条 npm build 命令。'
const commandReply = '可以使用命令：`npm run build`。'
assert.equal(sanitizeVisibleReplyForChinese(commandReply, commandInput, { agent: 'hermes' }), commandReply)
assert.ok(commandReply.includes('npm run build'))
console.log('CODE_COMMAND_NOT_TRANSLATED: PASS')

assert.ok(!devApi.includes('[reasoning] ${reasoning}'), 'dev-api must not expose raw reasoning text')
assert.ok(!devApi.includes('[reasoning] ${msg.reasoning_content}'), 'dev-api must not expose raw reasoning_content')

console.log('smoke-agent-visible-language-zh-cn passed')
