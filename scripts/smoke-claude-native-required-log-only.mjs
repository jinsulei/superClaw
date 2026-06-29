import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const serverPath = path.join(root, 'src-tauri/resources/runtime/claude-panel/server.js')
const appPath = path.join(root, 'src-tauri/resources/runtime/claude-panel/public/app.js')

const server = fs.readFileSync(serverPath, 'utf8')
const app = fs.readFileSync(appPath, 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`CLAUDE_NATIVE_REQUIRED_LOG_ONLY_FAIL: ${message}`)
    process.exit(1)
  }
}

assert(server.includes('function isNativeRequiredMode()'), 'missing native required mode helper')
assert(server.includes('NATIVE_CLAUDE_REQUIRED'), 'missing native required runtime mode')
assert(server.includes('CLAUDE_NATIVE_CLI_REQUIRED'), 'missing native required API error code')
assert(server.includes('CLAUDE_PANEL_ALLOW_RELAY_FALLBACK'), 'missing explicit relay fallback opt-in')
assert(server.includes('blocked-native-claude-required'), 'missing audit log for native required block')

assert(server.includes('function appendPanelLog'), 'missing panel log helper')
assert(server.includes('appendPanelLog("panel.err.log"'), 'native stderr must be written to panel.err.log')
assert(/writeEvent\(res,\s*"stderr"/.test(server), 'stderr event should still be structured')

const stderrBranch = app.slice(app.indexOf('} else if (event === "stderr")'), app.indexOf('} else if (event === "error")'))
assert(stderrBranch.includes('console.warn("[ClaudeCode stderr]"'), 'stderr branch should log to console for diagnostics')
assert(!/addMessage\(/.test(stderrBranch), 'stderr branch must not add chat messages')

console.log('CLAUDE_NATIVE_REQUIRED_LOG_ONLY_PASS')
