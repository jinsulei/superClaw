import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const channels = read('src/pages/channels.js')
const messaging = read('src-tauri/src/commands/messaging.rs')
const utils = read('src-tauri/src/utils.rs')
const tauriApi = read('src/lib/tauri-api.js')
const devApi = read('scripts/dev-api.js')

// channels.js 必须在运行时解析 OpenClaw CLI 完整路径，而不是用硬编码相对路径
assert.match(channels, /async function resolveOpenClawCliPath\(\)[\s\S]*?api\.getOpenclawCliPath\(\)/, 'channels resolves CLI path from backend')
assert.match(channels, /_resolvedOpenClawCliPath\s*\|\|\s*BUNDLED_OPENCLAW_CMD/, 'channels falls back to bundled relative path when resolution fails')
assert.match(channels, /if \(cliPath\.includes\(' '\)\) cliPath = `"\$\{cliPath\}"`/, 'channels quotes CLI path containing spaces')
assert.match(channels, /await resolveOpenClawCliPath\(\)/, 'channels awaits CLI path resolution before building manual commands')
console.log('OPENCLAW_CHANNEL_COMMAND_USES_FULL_CLI_PATH: PASS')
console.log('OPENCLAW_CHANNEL_COMMAND_QUOTES_SPACES: PASS')

// messaging.rs 后端日志里的手动命令也必须使用完整 CLI 路径，不能再用相对路径
assert.match(messaging, /crate::utils::openclaw_cli_path_display\(\)/, 'messaging uses resolved CLI path helper')
assert.doesNotMatch(messaging, /\.\\\\resources\\\\runtime\\\\openclaw\\\\openclaw\.cmd/, 'messaging no longer shows relative bundled CLI path')
assert.doesNotMatch(messaging, /npm i -g @qingchencloud\/openclaw-zh/, 'messaging no longer suggests npm global install for built-in agents')
console.log('OPENCLAW_CHANNEL_BACKEND_LOG_FULL_CLI_PATH: PASS')

// utils.rs 提供可直接粘贴的完整路径（含空格自动加引号）
assert.match(utils, /pub fn openclaw_cli_path_display\(\) -> String/, 'utils exposes openclaw_cli_path_display')
const utilsHelper = utils.match(/pub fn openclaw_cli_path_display\(\) -> String[\s\S]*?\n\}/)?.[0] || ''
assert.match(utilsHelper, /raw\.contains\(' '\)/, 'utils quotes CLI path when it contains spaces')
assert.match(utilsHelper, /format!\(/, 'utils builds a display string')
console.log('OPENCLAW_UTILS_CLI_PATH_DISPLAY_HELPER: PASS')

// 前后端 API 暴露 getOpenclawCliPath / get_openclaw_cli_path
assert.match(tauriApi, /getOpenclawCliPath:\s*\(\)\s*=>\s*invoke\('get_openclaw_cli_path'\)/, 'tauri-api exposes getOpenclawCliPath')
assert.match(devApi, /get_openclaw_cli_path\(\)[\s\S]*?return resolveOpenclawCliPath\(\) \|\| null/, 'dev-api exposes get_openclaw_cli_path for web mode')
console.log('OPENCLAW_CLI_PATH_API_EXPOSED: PASS')

console.log('\nopenclaw channel cli full path smoke passed')
