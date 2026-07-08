import assert from 'node:assert/strict'
import fs from 'node:fs'

const dashboardPath = 'src/engines/hermes/pages/dashboard.js'
const launcherPath = 'src/engines/hermes/lib/hermes-terminal-launcher.js'
const indexPath = 'src/engines/hermes/index.js'
const terminalPagePath = 'src/engines/hermes/pages/terminal.js'

const dashboard = fs.readFileSync(dashboardPath, 'utf8')
const launcher = fs.readFileSync(launcherPath, 'utf8')
const index = fs.readFileSync(indexPath, 'utf8')
const terminalPage = fs.readFileSync(terminalPagePath, 'utf8')

assert.match(dashboard, /hm-dash-terminal-chat/, 'Hermes dashboard must keep the terminal entry')
assert.match(dashboard, /openHermesTerminalLauncher/, 'Hermes terminal entry must call the launcher')
assert.match(launcher, /HERMES_TERMINAL_GATEWAY_NOT_READY_MESSAGE/, 'launcher must guard gateway-not-ready')
assert.match(launcher, /HERMES_TERMINAL_UNAVAILABLE_MESSAGE/, 'launcher must report unavailable terminal runtime')
assert.match(launcher, /isHermesGatewayReadyForTerminal/, 'launcher must expose a gateway readiness guard')
assert.match(launcher, /route = '\/h\/terminal'/, 'launcher must default to the safe Hermes terminal route')
assert.match(index, /path: '\/h\/terminal'/, 'Hermes routes must register /h/terminal')
assert.match(index, /pages\/terminal\.js/, 'Hermes terminal route must load the safe terminal page')
assert.match(terminalPage, /Terminal tool status/, 'terminal page must render readable status text')
assert.match(terminalPage, /terminal\/process toolset/, 'terminal page must explain Hermes terminal tools')
assert.match(terminalPage, /does not start cmd, PowerShell, ConPTY/, 'terminal page must state it does not open a raw native terminal')
assert.match(terminalPage, /resources\\\\runtime\\\\hermes\.cmd/, 'terminal page must document the portable Hermes launcher path')

const terminalHandler = dashboard.match(/querySelector\('\.hm-dash-terminal-chat'\)[\s\S]{0,3200}/)?.[0] || ''
assert.ok(terminalHandler.includes('openHermesTerminalLauncher'), 'terminal click handler must not be empty')
assert.ok(terminalHandler.includes("route: '/h/native-dashboard'"), 'terminal entry must guard the native Hermes Web path')
assert.ok(terminalHandler.includes('api.hermesDashboardProbe'), 'terminal entry must probe Hermes Web before falling back')
assert.ok(terminalHandler.includes('api.hermesDashboardStart'), 'terminal entry must start Hermes Web when it is not running')
assert.ok(terminalHandler.includes('openExternalUrl'), 'terminal entry must open Hermes Web at 127.0.0.1:9119 when available')
assert.ok(terminalHandler.includes("window.location.hash = '#/h/terminal'"), 'terminal entry must keep the safe internal terminal fallback')
assert.ok(!terminalHandler.includes("'#/chat'"), 'terminal click handler must not route to OpenClaw')
assert.ok(!terminalHandler.includes("'#/c"), 'terminal click handler must not route to ClaudeCode')

const dangerousRuntimeMarkers = [
  'child_process',
  'spawn(',
  'exec(',
  'execFile(',
  'cmd.exe',
  'powershell',
  'conpty',
  'pty',
]

for (const marker of dangerousRuntimeMarkers) {
  assert.ok(!launcher.includes(marker), `launcher must not start a native command runtime: ${marker}`)
  assert.ok(!terminalPage.includes(marker), `terminal page must not start a native command runtime: ${marker}`)
}

const forbiddenConfigMarkers = [
  String.fromCharCode(99, 111, 110, 102, 105, 103, 46, 121, 97, 109, 108),
  String.fromCharCode(46, 101, 110, 118),
  String.fromCharCode(121, 121, 97, 112, 105),
  String.fromCharCode(77, 73, 78, 73, 77, 65, 88, 95, 65, 80, 73, 95, 75, 69, 89),
  String.fromCharCode(79, 80, 69, 78, 65, 73, 95, 65, 80, 73, 95, 75, 69, 89),
]

for (const marker of forbiddenConfigMarkers) {
  assert.ok(!launcher.includes(marker), `launcher must not read or hardcode provider config: ${marker}`)
}

assert.ok(!launcher.includes('OpenClaw'), 'Hermes launcher must not touch OpenClaw')
assert.ok(!launcher.includes('ClaudeCode'), 'Hermes launcher must not touch ClaudeCode')

console.log('smoke-hermes-terminal-launcher PASS')
