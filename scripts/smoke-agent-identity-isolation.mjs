import fs from 'node:fs'
import path from 'node:path'
import {
  attachAgentNameToPayload,
  buildAgentIdentitySystemPrompt,
  ensureAgentIdentitySystemMessage,
  guardAgentIdentityReply,
} from '../src/shared/agent-identity-guard.js'

function assert(cond, msg) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`[PASS] ${msg}`)
  }
}

const root = process.cwd()

function read(rel) {
  const p = path.join(root, rel)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}

assert(/ClaudeCode Agent/.test(buildAgentIdentitySystemPrompt('claudecode')), 'ClaudeCode identity prompt exists')
assert(/OpenClaw Agent/.test(buildAgentIdentitySystemPrompt('openclaw')), 'OpenClaw identity prompt exists')
assert(/Hermes Agent/.test(buildAgentIdentitySystemPrompt('hermes')), 'Hermes identity prompt exists')

const messages = ensureAgentIdentitySystemMessage([{ role: 'user', content: '你是谁？' }], 'claudecode')
assert(messages[0].role === 'system', 'identity system message inserted first')
assert(/ClaudeCode Agent/.test(messages[0].content), 'ClaudeCode identity inserted')

const guardedClaude = guardAgentIdentityReply({
  agentName: 'claudecode',
  userText: '你是谁？',
  assistantText: '我是 MiniMax，由 MiniMax 提供服务。',
})
assert(/ClaudeCode Agent/.test(guardedClaude), 'ClaudeCode provider leak rewritten')
assert(!/我是 MiniMax/.test(guardedClaude), 'ClaudeCode does not self-identify as MiniMax')

const guardedOpenClaw = guardAgentIdentityReply({
  agentName: 'openclaw',
  userText: '你是谁？',
  assistantText: '我是 minimax。',
})
assert(/OpenClaw Agent/.test(guardedOpenClaw), 'OpenClaw provider leak rewritten')

const guardedHermes = guardAgentIdentityReply({
  agentName: 'hermes',
  userText: '你是谁？',
  assistantText: '我是 MiniMax。',
})
assert(/Hermes Agent/.test(guardedHermes), 'Hermes provider leak rewritten')

const normal = guardAgentIdentityReply({
  agentName: 'claudecode',
  userText: '解释 MiniMax 和 ClaudeCode 的区别。',
  assistantText: 'MiniMax 是底层模型供应商之一，ClaudeCode Agent 是产品中的代码协作 Agent。',
})
assert(/MiniMax/.test(normal), 'non-identity question can still mention provider')

const payload = attachAgentNameToPayload({ messages: [{ role: 'user', content: '你是谁？' }] }, 'claudecode')
assert(payload.agentName === 'claudecode', 'payload has agentName')
assert(payload.agent_name === 'claudecode', 'payload has agent_name')
assert(/ClaudeCode Agent/.test(payload.messages[0].content), 'payload messages include ClaudeCode identity')

const tauriApi = read('src/lib/tauri-api.js')
assert(/agentName:\s*options\?\.agentName\s*\|\|\s*'hermes'/.test(tauriApi), 'Hermes Tauri/Web API propagates agentName')

const hermesStore = read('src/engines/hermes/lib/chat-store.js')
assert(/buildAgentIdentitySystemPrompt\('hermes'\)/.test(hermesStore), 'Hermes store injects identity prompt')
assert(/guardAgentIdentityReply\(\{[\s\S]*agentName:\s*'hermes'/.test(hermesStore), 'Hermes store guards identity replies')

const openClawChat = read('src/pages/chat.js')
assert(/buildAgentIdentitySystemPrompt\('openclaw'\)/.test(openClawChat), 'OpenClaw prompt includes identity prompt')
assert(/guardAgentIdentityReply\(\{[\s\S]*agentName:\s*'openclaw'/.test(openClawChat), 'OpenClaw local identity reply is guarded')

const devApi = read('scripts/dev-api.js')
assert(/buildAgentIdentitySystemPrompt/.test(devApi), 'dev-api can inject identity prompt')
assert(/guardAgentIdentityReply/.test(devApi), 'dev-api can guard identity replies')
assert(/agentName:\s*effectiveAgentName/.test(devApi), 'dev-api forwards agentName')

const claudeServer = read('src-tauri/resources/runtime/claude-panel/server.js')
assert(/ClaudeCode Agent inside SuperClaw/.test(claudeServer), 'Claude Panel server injects ClaudeCode Agent identity')
assert(/guardClaudeCodeIdentityReply/.test(claudeServer), 'Claude Panel server guards provider identity leaks')

const claudeApp = read('src-tauri/resources/runtime/claude-panel/public/app.js')
assert(/agentName:\s*"claudecode"/.test(claudeApp), 'Claude Panel frontend sends agentName')

if (process.exitCode) {
  console.error('\nagent identity isolation smoke failed')
  process.exit(process.exitCode)
}

console.log('\nagent identity isolation smoke passed')
