import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = fs.readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const rust = fs.readFileSync('src-tauri/src/commands/hermes.rs', 'utf8')

assert.match(store, /clientRequestId:\s*state\.runningClientRequestId/)
assert.match(store, /runId:\s*evt\.run_id \|\| evt\.runId/)
assert.match(store, /activeResponseAssembler\.matches\(evt\)/)
assert.match(rust, /tool_call_id/)
assert.match(rust, /clientRequestId/)

console.log('PASS smoke-hermes-tool-result-isolation')
