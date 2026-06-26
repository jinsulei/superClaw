import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const cssPath = path.join(root, 'src', 'style', 'chat.css')

const read = (file) => fs.readFileSync(file, 'utf8')
const chat = read(chatPath)
const css = read(cssPath)

function pass(label) {
  console.log(`${label}: PASS`)
}

function fail(label, message) {
  console.error(`${label}: FAIL`)
  if (message) console.error(message)
  process.exitCode = 1
}

function assert(label, condition, message) {
  if (condition) pass(label)
  else fail(label, message)
}

const openclawBlock = css.slice(css.indexOf('OpenClaw chat visual parity with Hermes'))
const leakedSelectors = openclawBlock
  .split(/\r?\n/)
  .map((line, index) => ({ line: line.trim(), index }))
  .filter(({ line }) => line && !line.startsWith('/*') && !line.startsWith('*') && !line.startsWith('@') && line.includes('{'))
  .filter(({ line }) => !line.startsWith('.openclaw-chat ') && !line.startsWith('[data-theme="dark"] .openclaw-chat'))

assert(
  'OPENCLAW_UI_SCOPE_PRESENT',
  chat.includes('openclaw-chat') && chat.includes("page.dataset.agent = 'openclaw'") && css.includes('.openclaw-chat .chat-messages.sc-chat-stage'),
  'OpenClaw chat root scope or scoped message list styles are missing.',
)

assert(
  'OPENCLAW_ASSISTANT_ICON_PRESENT',
  chat.includes('createOpenClawRoleLine') && chat.includes("svgIcon(iconName, 13)") && chat.includes("'OpenClaw'") && css.includes('.openclaw-chat .openclaw-role-badge'),
  'OpenClaw assistant role icon/badge is missing.',
)

assert(
  'OPENCLAW_TOOL_BADGE_PRESENT',
  chat.includes('openclaw-tool-badge') && chat.includes('openclaw-tool-status') && chat.includes("svgIcon('wrench', 12)") && css.includes('.openclaw-chat .openclaw-tool-badge'),
  'OpenClaw tool/status badge is missing.',
)

assert(
  'OPENCLAW_BUBBLE_SIZE_ALIGNED',
  css.includes('max-width: min(980px, 72vw)') &&
    css.includes('max-width: min(520px, 46vw)') &&
    css.includes('padding: 10px 14px') &&
    css.includes('font-size: 14px') &&
    css.includes('line-height: 1.65'),
  'OpenClaw bubble sizing does not match the Hermes-aligned values.',
)

assert(
  'OPENCLAW_NO_GLOBAL_STYLE_POLLUTION',
  leakedSelectors.length === 0,
  leakedSelectors.map(({ line, index }) => `line ${index + 1}: ${line}`).join('\n'),
)

assert(
  'OPENCLAW_COMPOSER_CENTERED',
  chat.includes('openclaw-composer-row') &&
    css.includes('.openclaw-chat .chat-input-area') &&
    css.includes('justify-content: center') &&
    css.includes('margin-inline: auto'),
  'OpenClaw composer row is not explicitly centered inside the OpenClaw scope.',
)

assert(
  'OPENCLAW_COMPOSER_WIDTH_ALIGNED',
  css.includes('.openclaw-chat .openclaw-composer-row') &&
    css.includes('width: min(760px, calc(100% - 48px))') &&
    css.includes('max-width: 760px') &&
    css.includes('box-sizing: border-box'),
  'OpenClaw composer width is not aligned with the Hermes 760px composer column.',
)

assert(
  'OPENCLAW_COMPOSER_NO_100VW',
  !openclawBlock.includes('100vw'),
  'OpenClaw composer should not use 100vw because sidebar width can shift visual centering.',
)

assert(
  'OPENCLAW_COMPOSER_NO_GLOBAL_POLLUTION',
  !css.includes('.chat-input-area .openclaw-composer-row') &&
    css.includes('.openclaw-chat .openclaw-composer-row'),
  'OpenClaw composer styles must stay under .openclaw-chat.',
)

const diffNameOutput = execSync('git diff --name-only', {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
})

const diffFiles = diffNameOutput.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
const allowedLanguageGuardFiles = new Set([
  'src/engines/hermes/lib/chat-store.js',
  'src-tauri/resources/runtime/claude-panel/server.js',
  'src-tauri/resources/runtime/claude-panel/public/app.js',
  'src-tauri/resources/runtime/claude-panel/public/styles.css',
  'scripts/dev-api.js',
])
const crossAgentDiffs = diffFiles.filter(file =>
  file.startsWith('src/engines/hermes/') ||
  file.startsWith('src/engines/claude') ||
  file.startsWith('src-tauri/resources/runtime/claude-panel/')
)
const languageGuardIntegration =
  crossAgentDiffs.length > 0 &&
  crossAgentDiffs.every(file => allowedLanguageGuardFiles.has(file))

if (!languageGuardIntegration && crossAgentDiffs.length > 0) {
  fail('OPENCLAW_SCOPE_ONLY', 'Hermes or ClaudeCode files appear to be modified.')
} else {
  pass('OPENCLAW_SCOPE_ONLY')
}
