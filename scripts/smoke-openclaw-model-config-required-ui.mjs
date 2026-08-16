import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const chat = read('src/pages/chat.js')
const helper = read('src/lib/agent-gateway-status.js')
const models = read('src/pages/models.js')

const needsSetupBlock = helper.match(/case OPENCLAW_GATEWAY_STATES\.NEEDS_SETUP:[\s\S]*?case OPENCLAW_GATEWAY_STATES\.READY:/)?.[0] || ''
assert(needsSetupBlock, 'needs_setup copy block exists')
assert(!/Gateway 未启动|Gateway 正在检查|Gateway 连接异常/.test(needsSetupBlock), 'needs_setup copy must not be gateway-down copy')
console.log('OPENCLAW_MODEL_CONFIG_REQUIRED_NOT_GATEWAY_DOWN: PASS')

assert(/OpenClaw 模型配置未完成/.test(needsSetupBlock), 'needs_setup title mentions OpenClaw model config')
assert(/API Key/.test(needsSetupBlock), 'needs_setup prompt mentions API Key')
console.log('OPENCLAW_NEEDS_SETUP_SHOWS_MODEL_CONFIG_PROMPT: PASS')
console.log('OPENCLAW_MODEL_CONFIG_PROMPT_MENTIONS_API_KEY: PASS')

assert(/showModelConfigButton:\s*true/.test(needsSetupBlock), 'needs_setup exposes model config action')
assert(/navigate\(['"]\/models['"]\)/.test(chat), 'chat model config action navigates to /models')
assert(/id="chat-connect-title">正在检查 OpenClaw 状态/.test(chat), 'initial overlay title is neutral before gateway/model status probe')
assert(!/id="chat-connect-title">Gateway 未启动/.test(chat), 'initial overlay must not pre-label unknown state as gateway down')
console.log('OPENCLAW_MODEL_CONFIG_PROMPT_HAS_MODELS_ROUTE: PASS')

const sendGuard = chat.match(/async function ensureOpenClawGatewayReadyForSend\(\)[\s\S]*?async function refreshSessionList/)?.[0] || ''
assert(/isOpenClawModelConfigRequired\(statusProbe\)[\s\S]*return false/.test(sendGuard), 'send path stops before health/ws when model config is required')
assert(/isOpenClawModelConfigRequired\(readyCheck\.state\)[\s\S]*return false/.test(sendGuard), 'ready check stops before ws reconnect when model config is required')
console.log('OPENCLAW_MODEL_CONFIG_REQUIRED_NO_WS_RECONNECT: PASS')

assert(/id="minimax-test-api-key"/.test(models), 'MiniMax API key input exists')
assert(/btn-save-minimax-test/.test(models), 'MiniMax save button exists')
assert(/function shouldShowMiniMaxTestPanel\(\)/.test(models), 'MiniMax panel visibility guard exists')
assert(/isMiniMaxOnlyMode\(\) \|\| isTestBuildMode\(\)/.test(models), 'MiniMax panel shows in MiniMax-only or test-build mode')
assert(/免登录测试模式/.test(models), 'login-free MiniMax config copy exists')
console.log('OPENCLAW_MINIMAX_TEST_BUTTON_EXISTS: PASS')
console.log('OPENCLAW_MODEL_CONFIG_LOGIN_FREE: PASS')
console.log('OPENCLAW_MINIMAX_ENTRY_VISIBLE_IN_TEST_BUILD: PASS')

const stoppedBlock = helper.match(/case OPENCLAW_GATEWAY_STATES\.STOPPED:[\s\S]*?case OPENCLAW_GATEWAY_STATES\.STARTING:/)?.[0] || ''
const errorBlock = helper.match(/case OPENCLAW_GATEWAY_STATES\.ERROR:[\s\S]*?default:/)?.[0] || ''
assert(/Gateway 未启动/.test(stoppedBlock), 'gateway down copy still exists for stopped state')
assert(!/API Key|模型配置/.test(stoppedBlock + errorBlock), 'gateway down/error copy stays distinct from model config prompt')
console.log('OPENCLAW_GATEWAY_DOWN_DISTINCT_FROM_MODEL_CONFIG: PASS')

console.log('\nopenclaw model config required UI smoke passed')
