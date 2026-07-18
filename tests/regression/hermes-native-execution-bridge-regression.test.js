import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const store = fs.readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const chat = fs.readFileSync('src/engines/hermes/pages/chat.js', 'utf8')
const rust = fs.readFileSync('src-tauri/src/commands/hermes.rs', 'utf8')
const devApi = fs.readFileSync('scripts/dev-api.js', 'utf8')
const packageScript = fs.readFileSync('scripts/build-desktop-client.ps1', 'utf8')

test('Hermes user turns are owned by the native Agent runtime', () => {
  assert.match(store, /const HERMES_NATIVE_EXECUTION_ONLY = true/)
  assert.match(store, /api\.hermesAgentRun\(/)
  assert.match(store, /api\.hermesAgentRunStream\(/)
  assert.match(store, /Native Hermes owns context, planning, tools, skills and memory/)
  assert.match(store, /: null\n\s+\/\/ Native Hermes owns context/)
  assert.doesNotMatch(rust, /else if let Some\(hist\)[\s\S]{0,120}build_hermes_conversation_history_from_session/)
  assert.doesNotMatch(devApi, /const bridgedHistory[\s\S]{0,160}_buildHermesConversationHistoryFromSession/)
})

test('native execution events stay bound to the active client request', () => {
  assert.match(store, /recordAssistantExecutionEvent/)
  assert.match(store, /clientRequestId/)
  assert.match(store, /hermes-run-reasoning/)
  assert.match(store, /hermes-run-event/)
  assert.match(rust, /obj\.insert\("clientRequestId"/)
})

test('execution trace persists on the assistant message and renders above its answer', () => {
  assert.match(store, /message\.executionTrace = trace\.slice\(-80\)/)
  const processIndex = chat.indexOf('!isUser ? renderExecutionProcessCard(m)')
  const answerIndex = chat.indexOf("visibleContent.trim() ?")
  assert.ok(processIndex >= 0 && answerIndex > processIndex, 'execution process must render before the final answer')
  assert.match(chat, /<details class="hm-chat-execution-card"/)
  assert.match(chat, /执行过程/)
  assert.match(store, /typeof value === 'boolean'/)
  assert.match(store, /typeof output !== 'boolean'/)
})

test('Hermes execution cards expose safe progress without persisting private reasoning', () => {
  assert.match(store, /function executionEventText\(evt = \{\}, eventType = ''\)/)
  assert.match(store, /if \(eventType === 'reasoning\.available'\)/)
  assert.match(store, /evt\.visible_text \?\? evt\.visibleText \?\? evt\.userVisibleText \?\? evt\.summary \?\? evt\.preview/)
  assert.match(store, /正在分析任务并准备下一步。/)
  assert.match(store, /const text = executionEventText\(evt, eventType\)/)
})

test('Web dev and packaged Tauri expose the same Hermes capabilities', () => {
  assert.match(rust, /pub fn hermes_native_terminal_start/)
  assert.match(devApi, /async hermes_native_terminal_start\(\)/)
  assert.match(rust, /"reasoning\.available"/)
  assert.match(devApi, /hermes_agent_run_stream/)
  assert.match(devApi, /\.dev-data', 'hermes'/)
  for (const toolset of ['web', 'browser', 'terminal', 'file', 'code_execution', 'vision', 'video', 'skills', 'memory', 'session_search', 'delegation']) {
    assert.match(rust, new RegExp(`"${toolset}"`))
    assert.match(devApi, new RegExp(`'${toolset}'`))
  }
  assert.match(rust, /ensure_hermes_api_server_toolsets/)
  assert.match(devApi, /_ensureHermesApiServerToolsets/)
  assert.match(rust, /tools", "list", "--platform", "api_server"/)
  assert.match(devApi, /\['tools', 'list', '--platform', 'api_server'\]/)
  assert.match(rust, /\("API_SERVER_ENABLED"\.into\(\), "true"\.into\(\)\)/)
  assert.match(rust, /\("API_SERVER_PORT"\.into\(\), hermes_gateway_port\(\)\.to_string\(\)\)/)
  assert.match(devApi, /\['API_SERVER_ENABLED', 'true'\]/)
  assert.match(devApi, /\['API_SERVER_PORT', String\(hermesGatewayPort\(\)\)\]/)
})

test('Hermes execution artifacts persist without leaking a host path into portable sessions', () => {
  assert.match(store, /function normalizeExecutionArtifacts\(evt = \{\}\)/)
  assert.match(store, /const isAbsolutePath = \/\^\[A-Za-z\]:\\\//)
  assert.match(store, /normalizedPath\.split\('\/'\).*\.pop\(\)/)
  assert.match(store, /message\.artifacts = Array\.from\(byKey\.values\(\)\)\.slice\(-40\)/)
  assert.match(chat, /hm-chat-execution-artifacts/)
  assert.match(chat, /hm-chat-execution-artifact/)
})

test('portable Hermes bridge contains no fixed development path', () => {
  for (const source of [store, chat, rust, devApi]) {
    assert.doesNotMatch(source, /C:\\Users\\ZXKJ/)
    assert.doesNotMatch(source, /C:\\tmp\\superclaw/)
  }
  assert.match(packageScript, /hermes-native-terminal\.cmd/)
  assert.match(packageScript, /"workspace"/)
})
