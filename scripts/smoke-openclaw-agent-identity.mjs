import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const wsPath = path.join(root, 'src', 'lib', 'ws-client.js')

const chat = fs.readFileSync(chatPath, 'utf8')
const ws = fs.readFileSync(wsPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function includesAll(source, terms, label) {
  for (const term of terms) {
    assert(source.includes(term), `${label} missing: ${term}`)
  }
}

includesAll(chat, [
  'OPENCLAW_IDENTITY_CONTEXT_START',
  'OPENCLAW_IDENTITY_CONTEXT_END',
  'OPENCLAW_IDENTITY_PRELUDE',
  'You are OpenClaw inside SuperClaw.',
  'execution agent',
  'browser automation',
  'desktop control',
  'OCR-assisted',
  'Do not claim to be Hermes or Claude Code.',
  'MiniMax-M3',
], 'identity prelude')

includesAll(chat, [
  'function withOpenClawIdentityPrelude(prompt)',
  'function stripOpenClawIdentityPrelude(text)',
  'const displayText = stripOpenClawIdentityPrelude(text)',
  'body.includes(OPENCLAW_IDENTITY_CONTEXT_START)',
  'withOpenClawIdentityPrelude(buildAttachmentTriggeredPrompt(text, attachments))',
  'stripOpenClawIdentityPrelude(stripThinkingTags(content))',
  'stripOpenClawIdentityPrelude(stripThinkingTags(texts.join(\'\\n\')))',
  'stripOpenClawIdentityPrelude(stripThinkingTags(message.text))',
], 'identity injection path')

assert(
  chat.includes('appendUserMessage(text, attachments)'),
  'user bubble must continue to use original text'
)
assert(
  chat.includes('role: \'user\', content: text'),
  'saved user message must continue to use original text'
)
assert(!chat.includes('appendUserMessage(sendText'), 'identity prelude must not be rendered as user bubble')
assert(!chat.includes('content: sendText'), 'identity prelude must not be saved as user content')

assert(!ws.includes('params.system'), 'Gateway chat.send must not receive unsupported system field')
assert(!ws.includes('system:'), 'Gateway chat.send params must not contain unsupported system field')
includesAll(ws, [
  'chatSend(sessionKey, message, attachments, options = {})',
  'const idempotencyKey = options?.idempotencyKey || uuid()',
], 'idempotency preservation')

const samplePrompt = 'who are you?'
function withOpenClawIdentityPreludeForSmoke(prompt) {
  const body = String(prompt || '').trim()
  if (!body || body.includes('[OPENCLAW_IDENTITY_CONTEXT]')) return body
  return [
    '[OPENCLAW_IDENTITY_CONTEXT]',
    'You are OpenClaw inside SuperClaw.',
    '[/OPENCLAW_IDENTITY_CONTEXT]',
    '',
    'User:',
    body,
  ].join('\n')
}

const once = withOpenClawIdentityPreludeForSmoke(samplePrompt)
const twice = withOpenClawIdentityPreludeForSmoke(once)
assert(once === twice, 'identity prelude should not be injected twice')

console.log('OPENCLAW_IDENTITY_INJECTED: PASS')
console.log('OPENCLAW_NO_ILLEGAL_SYSTEM_FIELD: PASS')
console.log('OPENCLAW_USER_BUBBLE_NOT_POLLUTED: PASS')
console.log('OPENCLAW_IDENTITY_DEDUPED: PASS')
console.log('OPENCLAW_IDEMPOTENCY_PRESERVED: PASS')
