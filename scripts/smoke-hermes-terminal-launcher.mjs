import assert from 'node:assert/strict'
import fs from 'node:fs'

const dashboard = fs.readFileSync('src/engines/hermes/pages/dashboard.js', 'utf8')
const launcher = fs.readFileSync('src/engines/hermes/lib/hermes-terminal-launcher.js', 'utf8')
const index = fs.readFileSync('src/engines/hermes/index.js', 'utf8')
const terminalPage = fs.readFileSync('src/engines/hermes/pages/terminal.js', 'utf8')
const api = fs.readFileSync('src/lib/tauri-api.js', 'utf8')
const rust = fs.readFileSync('src-tauri/src/commands/hermes.rs', 'utf8')
const devApi = fs.readFileSync('scripts/dev-api.js', 'utf8')

assert.match(dashboard, /hm-dash-terminal-chat/, 'Hermes dashboard must keep the terminal entry')
assert.match(dashboard, /openHermesTerminalLauncher/, 'Hermes terminal entry must call the shared launcher')
assert.match(dashboard, /api\.hermesNativeTerminalStart\(\)/, 'dashboard must start the native Hermes CLI')
assert.match(launcher, /await launch\(\)/, 'launcher must execute the supplied native launch function')
assert.doesNotMatch(launcher, /gateway_not_ready/, 'native terminal must not depend on Gateway readiness')
assert.match(index, /path: '\/h\/terminal'/, 'Hermes routes must keep the terminal fallback page')
assert.match(terminalPage, /Hermes 原生终端/, 'terminal page must identify the native Hermes CLI')
assert.match(terminalPage, /api\.hermesNativeTerminalStart\(\)/, 'terminal page must start native Hermes')
assert.match(api, /hermesNativeTerminalStart: \(\) => invoke\('hermes_native_terminal_start'\)/, 'frontend API must expose native terminal start')
assert.match(rust, /pub fn hermes_native_terminal_start/, 'Tauri must expose the native terminal command')
assert.match(rust, /-m hermes_cli\.main --cli/, 'Tauri launcher must run the bundled Hermes CLI module')
assert.match(rust, /hermes_native_workspace_dir/, 'Tauri launcher must use a portable Hermes workspace')
assert.match(devApi, /async hermes_native_terminal_start\(\)/, 'Web dev API must expose the same native terminal action')
assert.match(devApi, /hermesCommandSpec\(\['--cli'\]\)/, 'Web dev must use the bundled Hermes command resolver')

for (const source of [rust, devApi, launcher, terminalPage]) {
  assert.doesNotMatch(source, /C:\\Users\\/, 'Hermes native terminal must not hardcode a user path')
  assert.doesNotMatch(source, /C:\\tmp\\/, 'Hermes native terminal must not hardcode a test path')
}

console.log('smoke-hermes-terminal-launcher PASS')
