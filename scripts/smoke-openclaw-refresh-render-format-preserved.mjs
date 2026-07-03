import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /schemaVersion:\s*OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION[\s\S]*?messages,/,
  'Refresh snapshots must store canonical messages with the render schema',
)
assert.match(
  chat,
  /content\.dataset\.openclawRawMarkdown = visibleText/,
  'OpenClaw rendered assistant content must retain its original markdown source',
)
assert.match(
  chat,
  /function\s+getOpenClawAssistantMarkdownSource\s*\(/,
  'OpenClaw snapshot restore must be able to read preserved markdown source',
)
assert.match(
  chat,
  /getOpenClawAssistantMarkdownSource\(bubble\) \|\| extractOpenClawSnapshotTextFromNode/,
  'OpenClaw snapshots must prefer raw markdown over rendered DOM text',
)
assert.match(
  chat,
  /const sourceMessages = Array\.isArray\(snapshot\.messages\)[\s\S]*?\? snapshot\.messages[\s\S]*?: openClawSnapshotHtmlToMessages\(snapshot\.html \|\| ''\)/,
  'Refresh restore must prefer canonical messages and only use HTML as legacy fallback',
)
assert.match(
  chat,
  /function\s+openClawTableToMarkdown\s*\([\s\S]*?querySelectorAll\?\.\('tr'\)[\s\S]*?const separator = `\| \$\{Array\.from\(\{ length: width \}\)/,
  'Legacy rendered tables must be converted back to GFM markdown rows',
)
assert.match(
  chat,
  /function\s+extractOpenClawSnapshotTextFromNode\s*\([\s\S]*?\.assistant-compact-message__toggle[\s\S]*?table\.replaceWith\(document\.createTextNode/,
  'Snapshot text extraction must drop controls and preserve table text',
)
assert.doesNotMatch(
  chat,
  /holder\.innerHTML\s*=\s*snapshot\.html[\s\S]{0,800}insertBefore\(node,\s*_typingEl\)/,
  'Refresh restore must not display stale HTML snapshots directly',
)

console.log('OPENCLAW_REFRESH_RENDER_FORMAT_PRESERVED: PASS')
console.log('OPENCLAW_REFRESH_RESTORE_USES_CANONICAL_MESSAGES: PASS')
console.log('OPENCLAW_LEGACY_TABLE_HTML_TO_MARKDOWN: PASS')
console.log('OPENCLAW_RAW_MARKDOWN_SOURCE_PRESERVED: PASS')
