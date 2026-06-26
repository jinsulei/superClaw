import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const openclawCssPath = path.join(root, 'src', 'style', 'chat.css')
const hermesCssPath = path.join(root, 'src', 'engines', 'hermes', 'style', 'hermes.css')
const chatPath = path.join(root, 'src', 'pages', 'chat.js')

const openclawCss = fs.readFileSync(openclawCssPath, 'utf8')
const hermesCss = fs.readFileSync(hermesCssPath, 'utf8')
const chat = fs.readFileSync(chatPath, 'utf8')

function pass(label) {
  console.log(`${label}: PASS`)
}

function assertPass(label, condition, message) {
  assert.ok(condition, message || label)
  pass(label)
}

const sectionMarker = 'OpenClaw chat visual parity with Hermes'
const markerIndex = openclawCss.indexOf(sectionMarker)
assertPass('OPENCLAW_SPACING_SECTION_PRESENT', markerIndex >= 0, 'OpenClaw scoped spacing section is missing.')

const scoped = openclawCss.slice(markerIndex)

assertPass(
  'OPENCLAW_HERMES_CHAT_COLUMN_PARITY',
  scoped.includes('.openclaw-chat .chat-messages.sc-chat-stage') &&
    scoped.includes('width: min(1600px, calc(100% - 48px))') &&
    scoped.includes('padding: var(--space-md, 16px) 24px') &&
    scoped.includes('margin-inline: auto') &&
    scoped.includes('box-sizing: border-box'),
  'OpenClaw message column must be centered with Hermes-like side gutters.',
)

assertPass(
  'OPENCLAW_COMPOSER_CENTERED_LIKE_HERMES',
  chat.includes('openclaw-composer-row') &&
    scoped.includes('.openclaw-chat .openclaw-composer-row') &&
    scoped.includes('width: min(760px, calc(100% - 48px))') &&
    scoped.includes('max-width: 760px') &&
    scoped.includes('margin-inline: auto') &&
    hermesCss.includes('max-width: 760px'),
  'OpenClaw composer should share Hermes 760px centered composer width.',
)

assertPass(
  'OPENCLAW_NO_100VW_COMPOSER',
  !/\.openclaw-chat\s+\.openclaw-composer-row[^}]*100vw/s.test(scoped),
  'OpenClaw composer must not use 100vw.',
)

assertPass(
  'OPENCLAW_BUBBLE_WIDTH_PARITY',
  scoped.includes('max-width: min(980px, 72vw)') &&
    scoped.includes('max-width: min(520px, 46vw)') &&
    hermesCss.includes('max-width: min(980px, 72vw)') &&
    hermesCss.includes('max-width: min(520px, 46vw)'),
  'OpenClaw assistant/user bubble max-width should match Hermes values.',
)

assertPass(
  'OPENCLAW_NO_HORIZONTAL_OVERFLOW',
  scoped.includes('@media (max-width: 760px)') &&
    scoped.includes('.openclaw-chat .openclaw-composer-row') &&
    scoped.includes('width: 100%') &&
    scoped.includes('padding: 14px 12px'),
  'OpenClaw narrow viewport rules should keep the composer and message column inside the viewport.',
)

const diffFiles = execSync('git diff --name-only', {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
}).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

assertPass(
  'HERMES_STYLE_UNCHANGED',
  !diffFiles.includes('src/engines/hermes/style/hermes.css'),
  'Hermes CSS should remain unchanged for this OpenClaw spacing fix.',
)

console.log('smoke-openclaw-hermes-spacing-parity passed')
