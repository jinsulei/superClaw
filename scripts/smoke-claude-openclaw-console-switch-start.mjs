import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const source = readFileSync(resolve(root, 'src-tauri/resources/runtime/claude-panel/public/app.js'), 'utf8')

assert.match(source, /function\s+isOpenClawSuperclawRoute\s*\(/, 'Claude panel must classify OpenClaw console routes')
assert.match(source, /function\s+ensureOpenClawGatewayBeforeConsoleSwitch\s*\(/, 'Claude panel must pre-start OpenClaw before switching')
assert.match(source, /function\s+waitForOpenClawGatewayReadyFromSuperclaw\s*\(/, 'Claude panel must wait for OpenClaw ready before switching')
assert.match(source, /function\s+probeOpenClawGatewayReady\s*\(/, 'Claude panel must probe OpenClaw ready/live state')
assert.match(source, /\/__api\/dev\/agents\/start/, 'Claude panel must call the local dev agent start endpoint')
assert.match(source, /\/__api\/dev\/agents\/status\?agent=openclaw/, 'Claude panel must poll OpenClaw dev status')
assert.match(source, /http:\/\/127\.0\.0\.1:18789\/health/, 'Claude panel must fall back to OpenClaw health probe')
assert.match(source, /JSON\.stringify\(\{\s*agent:\s*"openclaw"\s*\}\)/, 'Claude panel must start the openclaw agent explicitly')
assert.match(source, /await\s+ensureOpenClawGatewayBeforeConsoleSwitch\(route\)/, 'OpenClaw pre-start must run before navigation')
assert.match(source, /navigateAfterOpenClawReady\(route,\s*href,\s*overlay\)/, 'OpenClaw navigation must be gated by ready/live')

const handlerIndex = source.indexOf('function handleSuperclawConsoleLinkClick')
const startIndex = source.indexOf('await navigateAfterOpenClawReady(route, href, overlay)', handlerIndex)
const waitIndex = source.indexOf('await waitForOpenClawGatewayReadyFromSuperclaw(base', source.indexOf('function ensureOpenClawGatewayBeforeConsoleSwitch'))
const navigateIndex = source.indexOf('async function navigateAfterOpenClawReady')
const gatedStartIndex = source.indexOf('await ensureOpenClawGatewayBeforeConsoleSwitch(route)', navigateIndex)
const assignIndex = source.indexOf('window.location.assign(href)', navigateIndex)

assert.ok(handlerIndex >= 0, 'Claude panel console switch handler is missing')
assert.ok(startIndex > handlerIndex, 'OpenClaw pre-start is not inside the console switch handler')
assert.ok(waitIndex > 0, 'OpenClaw ready wait is missing from the pre-start flow')
assert.ok(navigateIndex >= 0, 'Ready-gated navigation helper is missing')
assert.ok(gatedStartIndex > navigateIndex, 'Navigation helper must run the OpenClaw ready gate')
assert.ok(assignIndex > gatedStartIndex, 'Navigation must happen after OpenClaw ready-gated switch')

console.log('CLAUDE_OPENCLAW_CONSOLE_SWITCH_START: PASS')
