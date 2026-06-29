import assert from 'node:assert/strict'
import fs from 'node:fs'
import { HermesResponseAssembler } from '../src/engines/hermes/lib/hermes-response-assembler.js'

const assembler = new HermesResponseAssembler({ clientRequestId: 'req-tauri', runId: 'run-tauri' })
let text = ''
for (const event of [
  { event: 'message.delta', clientRequestId: 'req-tauri', run_id: 'run-tauri', delta: '你好' },
  { event: 'message.final', clientRequestId: 'req-tauri', run_id: 'run-tauri', output: '你好，Hermes' },
  { event: 'run.completed', clientRequestId: 'req-tauri', run_id: 'run-tauri', output: '你好，Hermes' },
]) {
  const accepted = assembler.accept(event)
  if (accepted?.text) text += accepted.text
}
assert.equal(text, '你好，Hermes')

const rust = fs.readFileSync('src-tauri/src/commands/hermes.rs', 'utf8')
assert.match(rust, /emit_hermes_stream_delta/)
assert.match(rust, /client_request_id: Option<String>/)
assert.match(rust, /clientRequestId/)
assert.match(rust, /"message\.final"/)

console.log('PASS smoke-hermes-tauri-stream-dedupe')
