import fs from 'node:fs'
import path from 'node:path'
import {
  getSafeAgentIdentityReply,
  guardAgentIdentityReply,
} from '../src/shared/agent-identity-guard.js'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const wsPath = path.join(root, 'src', 'lib', 'ws-client.js')

const chat = fs.readFileSync(chatPath, 'utf8')
const ws = fs.readFileSync(wsPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function getFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert(start >= 0, `${name} function missing`)
  const brace = source.indexOf('{', start)
  let depth = 0
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`${name} function body not closed`)
}

const identityQuestionFn = getFunctionBody(chat, 'isOpenClawIdentityQuestion')
const localIdentityFn = getFunctionBody(chat, 'appendOpenClawLocalIdentityAnswer')
const preludeFn = getFunctionBody(chat, 'withOpenClawIdentityPrelude')
const stripPreludeFn = getFunctionBody(chat, 'stripOpenClawIdentityPrelude')

assert(chat.includes('OPENCLAW_IDENTITY_CONTEXT_START'), 'OpenClaw identity context marker must remain defined for legacy history cleanup')
assert(chat.includes('OPENCLAW_IDENTITY_CONTEXT_END'), 'OpenClaw identity context end marker must remain defined for legacy history cleanup')
assert(chat.includes('OPENCLAW_IDENTITY_PRELUDE'), 'OpenClaw identity prelude constant must remain available')
assert(chat.includes('OPENCLAW_LOCAL_IDENTITY_ANSWER'), 'OpenClaw local identity answer must remain available')
assert(chat.includes('SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE'), 'OpenClaw must keep Simplified Chinese visible reply guard')
assert(chat.includes('sanitizeOpenClawVisibleReply'), 'OpenClaw visible reply sanitizer must remain wired')

assert(identityQuestionFn.includes('text.length > 160'), 'local identity fallback must not swallow long prompts')
assert(identityQuestionFn.includes('OpenClaw') && identityQuestionFn.includes('return false'), 'local identity fallback must exclude OpenClaw audit/control prompts')

assert(localIdentityFn.includes("agentName: 'openclaw'"), 'local identity answer must be guarded as OpenClaw')
assert(localIdentityFn.includes('assistantText: OPENCLAW_LOCAL_IDENTITY_ANSWER || getSafeAgentIdentityReply'), 'local identity answer must use OpenClaw safe fallback')
assert(localIdentityFn.includes('appendUserMessage(text, attachments)'), 'user bubble must continue to use original text')
assert(localIdentityFn.includes("role: 'user'"), 'saved user message must keep user role')
assert(localIdentityFn.includes('content: text'), 'saved user message must continue to use original text')
assert(localIdentityFn.includes('appendAiMessage(identityAnswer)'), 'local identity answer must render as assistant')
assert(localIdentityFn.includes('content: identityAnswer'), 'saved identity answer must store assistant answer only')

assert(preludeFn.includes('return body'), 'regular OpenClaw requests must stay clean and not inject hidden identity context into Gateway history')
assert(!preludeFn.includes('OPENCLAW_IDENTITY_PRELUDE'), 'Gateway request path must not append hidden identity prelude')
assert(stripPreludeFn.includes('raw.includes(OPENCLAW_IDENTITY_CONTEXT_START)'), 'legacy hidden identity context must still be stripped from visible/history text')
assert(stripPreludeFn.includes('OPENCLAW_IDENTITY_CONTEXT_END'), 'legacy hidden identity context stripping must include end marker')

assert(chat.includes('isOpenClawIdentityQuestion(text)'), 'send path must detect OpenClaw identity questions')
assert(chat.includes('appendOpenClawLocalIdentityAnswer(text, attachments, clientRequestId)'), 'identity questions must be answered locally')
assert(chat.includes('const sendText = withOpenClawIdentityPrelude(buildAttachmentTriggeredPrompt(text, attachments))'), 'Gateway send path must still normalize attachment prompts')
assert(!chat.includes('appendUserMessage(sendText'), 'identity/prelude text must not be rendered as user bubble')
assert(!chat.includes('content: sendText'), 'identity/prelude text must not be saved as user content')

assert(!ws.includes('params.system'), 'Gateway chat.send must not receive unsupported system field')
assert(!ws.includes('system:'), 'Gateway chat.send params must not contain unsupported system field')
assert(ws.includes('chatSend(sessionKey, message, attachments, options = {})'), 'chatSend signature must preserve options')
assert(ws.includes('const idempotencyKey = options?.idempotencyKey || uuid()'), 'idempotency preservation must remain wired')

const safe = getSafeAgentIdentityReply('openclaw')
assert(/OpenClaw Agent/.test(safe), 'safe OpenClaw identity reply must name OpenClaw Agent')
assert(!/\bMiniMax\b/i.test(safe.replace(/底层模型服务由当前系统配置提供。?/g, '')), 'safe OpenClaw identity reply must not disguise as MiniMax')

const guarded = guardAgentIdentityReply({
  agentName: 'openclaw',
  userText: '你是谁？',
  assistantText: '我是 MiniMax。',
})
assert(/OpenClaw Agent/.test(guarded), 'identity guard must rewrite provider-disguised OpenClaw replies')

console.log('OPENCLAW_LOCAL_IDENTITY_FALLBACK: PASS')
console.log('OPENCLAW_NO_HIDDEN_IDENTITY_PRELUDE_IN_GATEWAY: PASS')
console.log('OPENCLAW_LEGACY_IDENTITY_CONTEXT_STRIPPED: PASS')
console.log('OPENCLAW_NO_ILLEGAL_SYSTEM_FIELD: PASS')
console.log('OPENCLAW_USER_BUBBLE_NOT_POLLUTED: PASS')
console.log('OPENCLAW_IDEMPOTENCY_PRESERVED: PASS')
console.log('OPENCLAW_DEFAULT_CHINESE: PASS')
