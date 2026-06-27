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
  openclawCss.includes('--superclaw-chat-stage-max: 1480px') &&
    openclawCss.includes('--agent-chat-column-max: var(--superclaw-chat-stage-max, 1480px)') &&
    openclawCss.includes('calc(100vw - var(--agent-chat-column-reserved))') &&
    openclawCss.includes('max-width: var(--agent-chat-column-max)') &&
    !/openclaw-composer-row[\s\S]{0,220}max-width:\s*760px/.test(openclawCss),
  'OPENCLAW_CHAT_COLUMN_ALIGNED',
)

assert(
  hermesCss.includes('--superclaw-chat-stage-max: 1480px') &&
    hermesCss.includes('.hm-chat-messages.sc-chat-stage') &&
    hermesCss.includes('calc(100vw - var(--superclaw-chat-stage-reserved, 320px))') &&
    hermesCss.includes('max-width: var(--superclaw-chat-stage-max, 1480px)'),
  'HERMES_CHAT_COLUMN_ALIGNED',
)

assert(
  claudeCss.includes('--sc-chat-stage-max: 1480px') &&
    claudeCss.includes('calc(100vw - var(--sc-chat-stage-reserved))') &&
    claudeCss.includes('max-width: var(--sc-chat-stage-max)') &&
    claudeCss.includes('max-width: min(var(--sc-chat-assistant-readable-max), calc(100% - var(--sc-chat-bubble-edge-room)))'),
  'CLAUDE_CHAT_COLUMN_ALIGNED',
)

assert(
  !/openclaw-composer-row[\s\S]{0,220}width:\s*100vw/.test(openclawCss) &&
    !/hm-chat-input-wrap[\s\S]{0,220}width:\s*100vw/.test(hermesCss) &&
    !/\.composer[\s\S]{0,260}width:\s*100vw/.test(claudeCss),
  'NO_CHAT_INPUT_100VW_OVERFLOW',
)

if (process.exitCode) process.exit(process.exitCode)
