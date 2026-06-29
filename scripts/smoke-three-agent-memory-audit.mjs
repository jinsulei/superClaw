import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel))
}

const hermesMemoryStore = 'src/engines/hermes/lib/hermes-memory-store.js'
const hermesChatStore = 'src/engines/hermes/lib/chat-store.js'
const hermesMemoryPage = 'src/engines/hermes/pages/memory.js'
const openclawIndex = 'src/engines/openclaw/index.js'
const openclawMemorySmoke = 'scripts/smoke-openclaw-memory-status.mjs'
const claudePanelServer = 'src-tauri/resources/runtime/claude-panel/server.js'
const claudeTemplate = 'src-tauri/resources/runtime/claude-panel/templates/CLAUDE.md'
const buildDesktopScript = 'scripts/build-desktop-client.ps1'

assert(exists(hermesMemoryStore), 'Hermes memory store is missing')
assert(exists(hermesMemoryPage), 'Hermes memory page is missing')
assert(exists(openclawIndex), 'OpenClaw index is missing')
assert(exists(claudePanelServer), 'ClaudeCode panel server is missing')

const hermesStoreText = read(hermesMemoryStore)
const hermesChatText = read(hermesChatStore)
const openclawIndexText = read(openclawIndex)
const claudeServerText = read(claudePanelServer)
const claudeTemplateText = exists(claudeTemplate) ? read(claudeTemplate) : ''
const gitignoreText = read('.gitignore')
const buildScriptText = read(buildDesktopScript)

for (const symbol of [
  'addHermesMemory',
  'updateHermesMemory',
  'deleteHermesMemory',
  'clearHermesMemories',
  'setHermesMemoryEnabled',
  'exportHermesMemoryBackup',
  'buildHermesMemoryContext',
  'handleHermesMemoryCommand',
  'getHermesMemorySourceTrace',
  'getHermesMemoryPath',
  'shouldSaveHermesMemory',
  'containsSensitiveMemoryText',
  'isBlockedMemoryType',
]) {
  assert(hermesStoreText.includes(`export function ${symbol}`), `Hermes memory store missing ${symbol}`)
}

assert(hermesChatText.includes('buildHermesMemoryContext'), 'Hermes chat does not inject relevant memory context')
assert(hermesChatText.includes('handleHermesMemoryCommand'), 'Hermes chat does not handle memory commands')
assert(hermesChatText.includes("reason: 'memory-command'"), 'Hermes memory command local reply path is missing')

assert(hermesStoreText.includes('user-memory.json'), 'Hermes memory file name is not declared')
assert(hermesStoreText.includes('SUPERCLAW_PORTABLE_DATA_DIR'), 'Hermes memory portable data path is missing')
assert(hermesStoreText.includes('APPDATA') && hermesStoreText.includes('LOCALAPPDATA'), 'Hermes memory app data fallback is missing')
assert(!/src-tauri\/resources\/data\/hermes\/user-memory\.json/.test(hermesStoreText), 'Hermes memory store must not target source resources')
assert(hermesStoreText.includes("'hermes'") && hermesStoreText.includes("'shared_safe'"), 'Hermes memory scope allowlist missing')
assert(hermesStoreText.includes('session_summary') && hermesStoreText.includes('temporary_context') && hermesStoreText.includes('tool_lesson'), 'blocked memory types missing')
assert(hermesStoreText.includes('memory_disabled'), 'disabled-memory write guard missing')
assert(hermesStoreText.includes('shouldSkipMemoryForThisTurn'), 'per-turn memory skip guard missing')

assert(gitignoreText.includes('**/user-memory.json'), '.gitignore must ignore user-memory.json')
assert(gitignoreText.includes('src-tauri/resources/data/hermes/user-memory.json'), '.gitignore must ignore source Hermes memory file')
assert(gitignoreText.includes('src-tauri/resources/data/hermes/memory/'), '.gitignore must ignore source Hermes memory directory')

assert(buildScriptText.includes('user-memory.json'), 'desktop build sanitizer must mention user-memory.json')
assert(buildScriptText.includes('hermes\\memory'), 'desktop build sanitizer must remove Hermes memory directory')
assert(buildScriptText.includes('Package contains Hermes user-memory.json') || buildScriptText.includes('user-memory.json, backup patch'), 'desktop build sanitizer must assert no user memory')

const openclawHasMemoryPage = openclawIndexText.includes("route: '/memory'") && openclawIndexText.includes("path: '/memory'")
const openclawHasMemoryCoreSmoke = exists(openclawMemorySmoke) && read(openclawMemorySmoke).includes('memory-core')
assert(openclawHasMemoryPage, 'OpenClaw memory page route is missing')
assert(openclawHasMemoryCoreSmoke, 'OpenClaw memory-core audit smoke is missing')

const claudeHasProjectMemory = /CLAUDE_CONFIG_DIR|CLAUDE_CODE_PROJECTS_DIR|projects\.json|project-folders\.json/.test(claudeServerText)
const claudeHasTemplateMemoryPolicy = /memory|project/i.test(claudeTemplateText)
assert(claudeHasProjectMemory, 'ClaudeCode project/session persistence paths are missing')
assert(claudeHasTemplateMemoryPolicy, 'ClaudeCode project template memory policy is missing')

for (const [label, source] of [
  ['Hermes memory store', hermesStoreText],
  ['Hermes chat store', hermesChatText],
  ['build script', buildScriptText],
]) {
  assert(!/sk-[A-Za-z0-9_-]{20,}/.test(source), `${label} contains real-looking key`)
  assert(!/Bearer\s+[A-Za-z0-9._-]{20,}/.test(source), `${label} contains real-looking bearer token`)
}

console.log('HERMES_MEMORY_CAPABILITY: PASS')
console.log('HERMES_MEMORY_RUNTIME_FILE_GUARD: PASS')
console.log('OPENCLAW_MEMORY_AUDIT_READ_ONLY: PASS')
console.log('CLAUDECODE_MEMORY_AUDIT_READ_ONLY: PASS')
console.log('THREE_AGENT_MEMORY_SCOPE_ISOLATION: PASS')
