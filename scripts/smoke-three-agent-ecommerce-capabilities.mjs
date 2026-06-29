import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { classifyClaudeCodeEcommerceDevAssist } from '../src-tauri/resources/runtime/claude-panel/ecommerce-dev-assist.js'
import { classifyHermesEcommerceOrchestration } from '../src/engines/hermes/lib/hermes-ecommerce-orchestrator.js'
import { classifyOpenClawEcommerceRequest } from '../src/engines/openclaw/lib/openclaw-ecommerce-assist.js'

const root = process.cwd()

const hermes = classifyHermesEcommerceOrchestration('\u5e2e\u6211\u5f00\u59cb\u7535\u5546\u6d41\u7a0b\uff0c\u8bfb\u53d6\u6296\u5e97\u9875\u9762')
const openclaw = classifyOpenClawEcommerceRequest('\u5e2e\u6211\u8bfb\u53d6\u6296\u5e97\u9875\u9762\u5e76\u622a\u56fe')
const claude = classifyClaudeCodeEcommerceDevAssist('\u5e2e\u6211\u4fee\u590d\u7535\u5546 smoke \u811a\u672c')
const claudeRuntime = classifyClaudeCodeEcommerceDevAssist('\u5e2e\u6211\u53d1\u5e03\u6296\u5e97\u5546\u54c1')

assert.equal(hermes.source, 'hermes')
assert.equal(hermes.executor, 'openclaw')
assert.equal(openclaw.agent, 'openclaw')
assert.equal(openclaw.blocked, false)
assert.equal(claude.role, 'ecommerce_dev_assist_only')
assert.equal(claudeRuntime.allowed, false)

const openclawIndex = readFileSync(resolve(root, 'src/engines/openclaw/index.js'), 'utf8')
const hermesChat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
const claudeServer = readFileSync(resolve(root, 'src-tauri/resources/runtime/claude-panel/server.js'), 'utf8')

assert.doesNotMatch(openclawIndex, /openclaw-ecommerce-assist/)
assert.doesNotMatch(hermesChat, /hermes-ecommerce-orchestrator/)
assert.doesNotMatch(claudeServer, /ecommerce-dev-assist/)

console.log('smoke-three-agent-ecommerce-capabilities PASS')
