import assert from 'node:assert/strict'
import fs from 'node:fs'

const dashboardPath = 'src/engines/hermes/pages/dashboard.js'
const launcherPath = 'src/engines/hermes/lib/hermes-terminal-launcher.js'
const indexPath = 'src/engines/hermes/index.js'
const terminalPagePath = 'src/engines/hermes/pages/terminal.js'
const hermesCommandPath = 'src-tauri/src/commands/hermes.rs'

const dashboard = fs.readFileSync(dashboardPath, 'utf8')
const launcher = fs.readFileSync(launcherPath, 'utf8')
const index = fs.readFileSync(indexPath, 'utf8')
const terminalPage = fs.readFileSync(terminalPagePath, 'utf8')
const hermesCommand = fs.readFileSync(hermesCommandPath, 'utf8')

assert.match(dashboard, /hm-dash-terminal-chat/, 'Hermes dashboard must keep the terminal entry')
assert.match(dashboard, /openHermesTerminalLauncher/, 'Hermes terminal entry must call the launcher')
assert.match(dashboard, /function isHermesDashboardReady/, 'dashboard must validate native dashboard readiness')
assert.match(dashboard, /frontend_not_built/, 'dashboard must handle native dashboard frontend-not-built responses')
assert.match(hermesCommand, /fn hermes_dashboard_http_status/, 'Tauri dashboard command must verify HTTP UI readiness')
assert.match(hermesCommand, /frontend_not_built/, 'Tauri dashboard command must detect frontend-not-built responses')
assert.match(hermesCommand, /"ready": status\.ready/, 'dashboard probe must expose a ready flag')
assert.match(hermesCommand, /"kind": status\.kind/, 'dashboard probe must expose failure kind')
assert.match(launcher, /HERMES_TERMINAL_GATEWAY_NOT_READY_MESSAGE/, 'launcher must guard gateway-not-ready')
assert.match(launcher, /HERMES_TERMINAL_UNAVAILABLE_MESSAGE/, 'launcher must report unavailable terminal runtime')
assert.match(launcher, /isHermesGatewayReadyForTerminal/, 'launcher must expose a gateway readiness guard')
assert.match(launcher, /route = '\/h\/terminal'/, 'launcher must default to the safe Hermes terminal route')
assert.match(index, /path: '\/h\/terminal'/, 'Hermes routes must register /h/terminal')
assert.match(index, /pages\/terminal\.js/, 'Hermes terminal route must load the safe terminal page')
assert.match(terminalPage, /Hermes 终端对话暂未启用受控 session。/, 'terminal page must state controlled session is disabled')
assert.match(terminalPage, /当前不会执行系统命令。/, 'terminal page must state it will not execute commands')
assert.match(terminalPage, /只允许用户手动输入命令/, 'terminal page must require manual user input for future terminal support')

const terminalHandler = dashboard.match(/querySelector\('\.hm-dash-terminal-chat'\)[\s\S]{0,2600}/)?.[0] || ''
assert.ok(terminalHandler.includes('openHermesTerminalLauncher'), 'terminal click handler must not be empty')
assert.ok(terminalHandler.includes('hermesDashboardProbe'), 'terminal click handler must probe Hermes native dashboard')
assert.ok(terminalHandler.includes('hermesDashboardStart'), 'terminal click handler must start Hermes native dashboard when needed')
assert.ok(terminalHandler.includes('openExternalUrl'), 'terminal click handler must open the native dashboard URL')
assert.ok(terminalHandler.includes('isHermesDashboardReady'), 'terminal click handler must only open a ready native dashboard')
assert.ok(terminalHandler.includes('ready !== false'), 'terminal click handler must reject started-but-unready dashboard results')
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
