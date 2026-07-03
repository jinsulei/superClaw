import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /function\s+collapseConsecutiveOpenClawAssistantDuplicates\s*\(messages = \[\]\)/,
  'OpenClaw must have a dedicated adjacent assistant collapse helper',
)
assert.match(
  chat,
  /previous\?\.role === 'assistant' && current\.role === 'assistant'[\s\S]*?mergeOpenClawAssistantMessage\(previous,\s*current\)/,
  'Adjacent assistant collapse must merge duplicate or same-turn replies',
)
assert.match(
  chat,
  /function\s+normalizeOpenClawMessagesForRestore\s*\([\s\S]*?collapseConsecutiveOpenClawAssistantDuplicates/,
  'Refresh restore must collapse consecutive assistant duplicates before rendering',
)
assert.match(
  chat,
  /const stableHistoryMessages = collapseConsecutiveOpenClawAssistantDuplicates\(historyMessages \|\| \[\]\)/,
  'History merge must collapse adjacent duplicate assistants before appending',
)
assert.match(
  chat,
  /const sameTurnRow = msg\?\.role === 'assistant' \? findOpenClawAssistantRowAfterLastUser\(msg\) : null[\s\S]*?mergeOpenClawAssistantIntoVisibleRow\(sameTurnRow,\s*msg\)/,
  'History merge must update the visible same-turn bubble before appending another assistant',
)

console.log('OPENCLAW_CONSECUTIVE_HISTORY_DUPLICATE_COLLAPSE: PASS')
console.log('OPENCLAW_HISTORY_SAME_TURN_MERGES_VISIBLE_BUBBLE: PASS')
