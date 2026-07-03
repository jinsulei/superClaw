import assert from 'node:assert/strict'
import fs from 'node:fs'

const dashboardPath = 'src/engines/hermes/pages/dashboard.js'
const terminalPagePath = 'src/engines/hermes/pages/terminal.js'
const hermesCommandPath = 'src-tauri/src/commands/hermes.rs'
const devApiPath = 'scripts/dev-api.js'

const dashboard = fs.readFileSync(dashboardPath, 'utf8')
const terminalPage = fs.readFileSync(terminalPagePath, 'utf8')
const hermesCommand = fs.readFileSync(hermesCommandPath, 'utf8')
const devApi = fs.readFileSync(devApiPath, 'utf8')

assert.match(dashboard, /hm-dash-hermes-web/, 'Hermes dashboard must expose the Hermes Web entry')
assert.match(dashboard, /打开 Hermes Web/, 'Hermes dashboard entry must use Web wording')
assert.doesNotMatch(dashboard, /hm-dash-terminal-chat/, 'Hermes dashboard must not expose the old terminal button class')
assert.doesNotMatch(dashboard, /openHermesTerminalLauncher/, 'Hermes dashboard Web entry must not call the terminal/session guard')
assert.match(dashboard, /hermesDashboardProbe/, 'Hermes Web entry must probe the native Web service')
assert.match(dashboard, /hermesDashboardStart/, 'Hermes Web entry must start Hermes Web when needed')
assert.match(dashboard, /openExternalUrl/, 'Hermes Web entry must open the native Web URL')
assert.match(dashboard, /isHermesDashboardReady/, 'Hermes Web entry must only open a ready service')
assert.match(dashboard, /frontend_not_built/, 'Hermes Web entry must handle frontend-not-built responses')

const webHandler = dashboard.match(/querySelector\('\.hm-dash-hermes-web'\)[\s\S]{0,2600}/)?.[0] || ''
assert.ok(webHandler.includes('hermesDashboardProbe'), 'Hermes Web click handler must probe Hermes Web')
assert.ok(webHandler.includes('hermesDashboardStart'), 'Hermes Web click handler must start Hermes Web when needed')
assert.ok(webHandler.includes('openExternalUrl'), 'Hermes Web click handler must open the Hermes Web URL')
assert.ok(webHandler.includes('isHermesDashboardReady'), 'Hermes Web click handler must only open a ready service')
assert.ok(!webHandler.includes("'#/chat'"), 'Hermes Web click handler must not route to OpenClaw')
assert.ok(!webHandler.includes("'#/c"), 'Hermes Web click handler must not route to ClaudeCode')

assert.match(terminalPage, /HERMES AGENT · NATIVE WEB/, 'Hermes route page must describe native Web, not terminal')
assert.match(terminalPage, /打开 Hermes Web/, 'Hermes route page must open Hermes Web')
assert.match(terminalPage, /HERMES_WEB_PATH = '\/chat'/, 'Hermes Web bridge must open /chat')
assert.match(terminalPage, /hermesDashboardProbe/, 'Hermes Web bridge must probe readiness')
assert.match(terminalPage, /hermesDashboardStart/, 'Hermes Web bridge must start when needed')
assert.match(terminalPage, /openExternalUrl/, 'Hermes Web bridge must open the Web URL')
assert.match(terminalPage, /frontend_not_built/, 'Hermes Web bridge must identify missing frontend assets')
assert.doesNotMatch(terminalPage, /NATIVE TERMINAL|受控 session|终端未启用|系统命令/, 'Hermes Web bridge must not show terminal/session safety copy')
assert.doesNotMatch(terminalPage, /result\.running === true \|\| result\.started === true/, 'Hermes Web bridge must not open based only on process liveness')

assert.match(hermesCommand, /fn hermes_dashboard_http_status/, 'Tauri dashboard command must verify HTTP UI readiness')
assert.match(hermesCommand, /frontend_not_built/, 'Tauri dashboard command must detect frontend-not-built responses')
assert.match(hermesCommand, /"ready": status\.ready/, 'dashboard probe must expose a ready flag')
assert.match(hermesCommand, /"kind": status\.kind/, 'dashboard probe must expose failure kind')
assert.match(devApi, /_hermesDashboardHttpStatus/, 'dev-api must share an HTTP readiness probe for Hermes Web')
assert.match(devApi, /frontend not built/i, 'dev-api must detect Hermes frontend-not-built responses')
assert.match(devApi, /kind: 'frontend_not_built'/, 'dev-api must return frontend_not_built instead of ready for unbuilt frontend')
assert.match(devApi, /kind: 'native_web'/, 'dev-api must mark usable Hermes Web as native_web')
assert.match(devApi, /url: `http:\/\/127\.0\.0\.1:\$\{port\}\/chat`/, 'dev-api ready status must expose the Hermes Web URL')
assert.match(devApi, /ready: false,[\s\S]{0,180}kind: initialStatus\.kind/, 'dev-api start must preserve unready already-running status')
assert.match(devApi, /ensureHermesDashboardWebDist/, 'dev-api must build or restore Hermes dashboard frontend before launch')

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
  assert.ok(!terminalPage.includes(marker), `Hermes Web page must not start a native command runtime: ${marker}`)
}

assert.ok(!terminalPage.includes('OpenClaw'), 'Hermes Web page must not touch OpenClaw')
assert.ok(!terminalPage.includes('ClaudeCode'), 'Hermes Web page must not touch ClaudeCode')

console.log('smoke-hermes-terminal-launcher PASS')
