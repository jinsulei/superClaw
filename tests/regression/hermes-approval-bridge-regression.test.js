import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
const rust = read('src-tauri/src/commands/hermes.rs')
const lib = read('src-tauri/src/lib.rs')
const api = read('src/lib/tauri-api.js')
const devApi = read('scripts/dev-api.js')
const store = read('src/engines/hermes/lib/chat-store.js')
const page = read('src/engines/hermes/pages/chat.js')
const runtime = read('src-tauri/resources/runtime/hermes-agent/Lib/site-packages/gateway/platforms/api_server.py')

test('bundled Hermes exposes a generic approval protocol', () => {
  assert.match(runtime, /approval\.request/)
  assert.match(runtime, /\/v1\/runs\/\{run_id\}\/approval/)
  assert.match(runtime, /once.*session.*always.*deny/s)
})

test('desktop and web forward approval to the same active run', () => {
  assert.match(rust, /pub async fn hermes_agent_resolve_approval/)
  assert.match(rust, /\/v1\/runs\/\{run_id\}\/approval/)
  assert.match(rust, /"once" \| "session" \| "always" \| "deny"/)
  assert.match(lib, /hermes::hermes_agent_resolve_approval/)
  assert.match(api, /hermesAgentResolveApproval/)
  assert.match(devApi, /hermes_agent_resolve_approval/)
  assert.match(devApi, /\/approval/)
})

test('chat consumes approval events without creating a user message', () => {
  assert.match(store, /pendingApproval/)
  assert.match(store, /setPendingHermesApproval/)
  assert.match(store, /resolvePendingHermesApproval/)
  assert.match(store, /eventType === 'approval\.request'/)
  assert.match(store, /eventType === 'approval\.responded'/)
  assert.match(page, /本次允许/)
  assert.match(page, /本会话允许/)
  assert.match(page, /授权会直接继续当前任务，不会额外发送一条聊天消息/)
})

test('approval bridge uses portable runtime paths only', () => {
  const changed = [rust, lib, api, devApi, store, page].join('\n')
  assert.doesNotMatch(changed, /C:\\\\Users\\|C:\\\\tmp/i)
})
