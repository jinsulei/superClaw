import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.')
const read = (relative) => readFileSync(resolve(root, relative), 'utf8')

test('all agent document outputs use the shared compact card visual language', () => {
  const openclaw = read('src/pages/chat.js')
  const openclawCss = read('src/style/chat.css')
  const hermes = read('src/engines/hermes/pages/chat.js')
  const hermesCss = read('src/engines/hermes/style/hermes.css')
  const claude = read('src-tauri/resources/runtime/claude-panel/public/app.js')
  const claudeCss = read('src-tauri/resources/runtime/claude-panel/public/styles.css')

  assert.match(openclaw, /sc-document-card/)
  assert.match(openclaw, /pptx: 'ppt'/)
  assert.match(openclawCss, /sc-document-card__type\.is-excel/)
  assert.match(openclawCss, /sc-document-card__type\.is-word/)
  assert.match(openclawCss, /sc-document-card__type\.is-pdf/)

  assert.match(hermes, /hm-document-card/)
  assert.match(hermes, /formatDocumentFileSize/)
  assert.match(hermesCss, /hm-document-card__type\.is-excel/)
  assert.match(hermesCss, /hm-document-card__type\.is-word/)
  assert.match(hermesCss, /hm-document-card__type\.is-pdf/)

  assert.match(claude, /appendClaudeOutputDocumentCards/)
  assert.match(claude, /document-chip-type/)
  assert.match(claudeCss, /document-output-card__type\.is-excel/)
  assert.match(claudeCss, /document-output-card__type\.is-word/)
  assert.match(claudeCss, /document-output-card__type\.is-pdf/)
})
