import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

function assert(condition, label, details = '') {
  if (!condition) {
    console.error(`${label}: FAIL${details ? ` - ${details}` : ''}`)
    process.exitCode = 1
    return
  }
  console.log(`${label}: PASS`)
}

const openclawCss = read('src/style/chat.css')
const hermesCss = read('src/engines/hermes/style/hermes.css')
const claudeCss = read('src-tauri/resources/runtime/claude-panel/public/styles.css')

assert(
  openclawCss.includes('--agent-chat-column-max: 1180px') &&
    openclawCss.includes('width: min(var(--agent-chat-column-max), calc(100% - var(--agent-chat-column-gutter)))') &&
    !/openclaw-composer-row[\s\S]{0,220}max-width:\s*760px/.test(openclawCss),
  'OPENCLAW_CHAT_COLUMN_ALIGNED',
)

assert(
  hermesCss.includes('max-width: 1180px') &&
    hermesCss.includes('.hm-chat-messages.sc-chat-stage') &&
    hermesCss.includes('width: min(1180px, calc(100% - 48px))'),
  'HERMES_CHAT_COLUMN_ALIGNED',
)

assert(
  claudeCss.includes('--sc-chat-stage-max: 1180px') &&
    claudeCss.includes('width: min(1180px, calc(100% - 32px))') &&
    claudeCss.includes('max-width: min(980px, 100%)'),
  'CLAUDE_CHAT_COLUMN_ALIGNED',
)

assert(
  !/openclaw-composer-row[\s\S]{0,220}100vw/.test(openclawCss) &&
    !/hm-chat-input-wrap[\s\S]{0,220}100vw/.test(hermesCss) &&
    !/\.composer[\s\S]{0,220}100vw/.test(claudeCss),
  'NO_CHAT_INPUT_100VW_OVERFLOW',
)

if (process.exitCode) process.exit(process.exitCode)
