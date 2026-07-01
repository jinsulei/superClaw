import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const source = readFileSync(resolve(root, 'src-tauri/resources/runtime/claude-panel/public/app.js'), 'utf8')

assert.match(source, /function\s+isOpenClawSuperclawRoute\s*\(/, 'Claude panel must classify OpenClaw console routes')
assert.match(source, /function\s+ensureOpenClawGatewayBeforeConsoleSwitch\s*\(/, 'Claude panel must pre-start OpenClaw before switching')
assert.match(source, /\/__api\/dev\/agents\/start/, 'Claude panel must call the local dev agent start endpoint')
assert.match(source, /JSON\.stringify\(\{\s*agent:\s*"openclaw"\s*\}\)/, 'Claude panel must start the openclaw agent explicitly')
assert.match(source, /await\s+ensureOpenClawGatewayBeforeConsoleSwitch\(route\)/, 'OpenClaw pre-start must run before navigation')

const handlerIndex = source.indexOf('function handleSuperclawConsoleLinkClick')
const startIndex = source.indexOf('await ensureOpenClawGatewayBeforeConsoleSwitch(route)', handlerIndex)
const assignIndex = source.indexOf('window.location.assign(href)', handlerIndex)

assert.ok(handlerIndex >= 0, 'Claude panel console switch handler is missing')
assert.ok(startIndex > handlerIndex, 'OpenClaw pre-start is not inside the console switch handler')
assert.ok(assignIndex > startIndex, 'Navigation must happen after OpenClaw pre-start')

console.log('CLAUDE_OPENCLAW_CONSOLE_SWITCH_START: PASS')
