import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')
const wsClient = readFileSync(resolve(root, 'src/lib/ws-client.js'), 'utf8')

assert.match(
  wsClient,
  /msg\.event === 'chat\.message' && msg\.payload\?\.sessionKey/,
  'ws-client must cache packaged OpenClaw chat.message payloads by sessionKey',
)

assert.match(
  chat,
  /function\s+isOpenClawChatEvent\s*\(\s*event\s*\)\s*\{[\s\S]*?event === 'chat' \|\| event === 'chat\.message'[\s\S]*?\}/,
  'chat page must treat packaged OpenClaw chat.message events as chat events',
)

assert.match(
  chat,
  /if\s*\(isOpenClawChatEvent\(event\)\)\s*handleChatEvent\(payload,\s*msg\.id\)/,
  'chat page must route chat.message payloads through the existing OpenClaw renderer',
)

assert.doesNotMatch(
  chat,
  /if\s*\(event === 'chat'\)\s*handleChatEvent\(payload,\s*msg\.id\)/,
  'chat page must not only handle the legacy chat event name',
)

console.log('OPENCLAW_CHAT_MESSAGE_EVENT_ROUTING: PASS')
console.log('OPENCLAW_PACKAGED_GATEWAY_FINAL_EVENT_RENDERED: PASS')
