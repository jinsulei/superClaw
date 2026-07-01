import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const devApiPath = path.join(root, 'scripts', 'dev-api.js')
const openclawChatPath = path.join(root, 'src', 'pages', 'chat.js')
const hermesChatPath = path.join(root, 'src', 'engines', 'hermes', 'pages', 'chat.js')

const devApi = fs.readFileSync(devApiPath, 'utf8')
const openclawChat = fs.readFileSync(openclawChatPath, 'utf8')
const hermesChat = fs.readFileSync(hermesChatPath, 'utf8')

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} not found`)
  const next = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

const spawnOpenclawBlock = functionBlock(devApi, 'spawnOpenclaw')
assert.match(devApi, /function automaticAgentSpawnOptions/)
assert.match(devApi, /windowsHide:\s*true/)
assert.match(devApi, /detached:\s*false/)
assert.match(devApi, /normalizeBackgroundStdio\(options\.stdio\)/)
assert.match(spawnOpenclawBlock, /automaticAgentSpawnOptions\(rest\)/)
console.log('OPENCLAW_TERMINAL_BACKGROUND: PASS')

const spawnOpenclawSyncBlock = functionBlock(devApi, 'spawnOpenclawSync')
assert.match(spawnOpenclawSyncBlock, /automaticAgentSpawnOptions\(rest\)/)

const nativeClaudeBlock = functionBlock(devApi, 'startNativeClaudeTerminal')
assert.equal(/spawn\(\s*['"]cmd\.exe['"][\s\S]{0,160}['"]start['"][\s\S]{0,160}['"]cmd\.exe['"][\s\S]{0,160}['"]\/k['"]/.test(nativeClaudeBlock), false)
assert.match(nativeClaudeBlock, /windowsHide:\s*true/)
assert.match(nativeClaudeBlock, /background:\s*true/)
console.log('CLAUDE_TERMINAL_BACKGROUND: PASS')

assert.match(devApi, /function writeAgentToolLog/)
assert.match(devApi, /logs['"],\s*['"]agent-tools/)
assert.match(devApi, /redactAgentToolText/)
console.log('TOOL_LOG_WRITTEN: PASS')

assert.match(hermesChat, /assistant-compact-message \$\{canToggle \? \(manualCollapsed \? 'is-collapsed' : 'is-expanded'\) : ''\}/)
assert.match(hermesChat, /assistant-compact-message__full" \$\{manualCollapsed \? 'hidden' : ''\}/)
assert.equal(/assistant-compact-message \$\{canToggle \? 'is-collapsed' : ''\}/.test(hermesChat), false)
console.log('HERMES_TERMINAL_BACKGROUND: PASS')

const openclawToolBlock = functionBlock(openclawChat, 'appendToolsToEl')
assert.match(openclawToolBlock, /document\.createElement\(['"]details['"]\)/)
assert.equal(/details\.open\s*=\s*true/.test(openclawToolBlock), false)
assert.equal(/setAttribute\(['"]open['"]/.test(openclawToolBlock), false)
console.log('TOOL_OUTPUT_COLLAPSED_BY_DEFAULT: PASS')

const child = spawnSync(process.execPath, ['-v'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
assert.equal(child.status, 0)
assert.match(String(child.stdout || ''), /^v\d+\./)
console.log('CHILD_PROCESS_WINDOWS_HIDE: PASS')
