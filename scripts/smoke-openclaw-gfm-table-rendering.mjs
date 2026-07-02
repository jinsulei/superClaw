import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const renderer = readFileSync(resolve(root, 'src/components/chat/agent-message-content.js'), 'utf8')
const styles = readFileSync(resolve(root, 'src/components/chat/agent-message-content.css'), 'utf8')
const chatStyles = readFileSync(resolve(root, 'src/style/chat.css'), 'utf8')
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(renderer, /function\s+isGfmTableSeparatorLine\s*\(/, 'GFM table separator detector is missing')
assert.match(renderer, /function\s+isGfmTableRowLine\s*\(/, 'GFM table row detector is missing')
assert.match(renderer, /function\s+splitGfmTableRow\s*\(/, 'GFM table row splitter is missing')
assert.match(renderer, /function\s+renderGfmTable\s*\(/, 'GFM table renderer is missing')
assert.match(
  renderer,
  /isGfmTableRowLine\(line\)\s*&&\s*i \+ 1 < lines\.length\s*&&\s*isGfmTableSeparatorLine\(lines\[i \+ 1\]\)/,
  'Text segment renderer must detect a GFM table header followed by a separator',
)
assert.match(renderer, /<table class="agent-message-markdown-table">/, 'GFM table renderer must output a table element')
assert.match(renderer, /<thead><tr>/, 'GFM table renderer must output table headers')
assert.match(renderer, /<tbody>/, 'GFM table renderer must output table body rows')
assert.match(styles, /\.agent-message-table-wrap\s*\{[\s\S]*?overflow-x:\s*auto;/, 'GFM table wrapper must allow horizontal overflow')
assert.match(chat, /hasMarkdownTable[\s\S]*?classList\?\.toggle\('has-markdown-table'/, 'Live OpenClaw table bubbles must get an explicit table class')
assert.match(chatStyles, /\.sc-msg-bubble\.assistant\.has-markdown-table/, 'OpenClaw table bubble CSS must not rely only on :has(table)')
assert.match(
  chat,
  /renderAgentMessageContentInto\(content,\s*\{[\s\S]*?agent:\s*'openclaw'/,
  'OpenClaw compact assistant content must use the agent message renderer that now supports GFM tables',
)

console.log('OPENCLAW_GFM_TABLE_RENDERING: PASS')
