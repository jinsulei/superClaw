import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /function\s+parseOpenClawMessageTime\s*\(/,
  'OpenClaw history must parse message creation timestamps',
)
assert.match(
  chat,
  /function\s+getOpenClawMessageCreatedTime\s*\(/,
  'OpenClaw history must choose a stable created-time sort key',
)
assert.match(
  chat,
  /parseOpenClawMessageTime\(message\.createdAt\)[\s\S]*parseOpenClawMessageTime\(message\.created_at\)[\s\S]*parseOpenClawMessageTime\(message\.timestamp\)/,
  'OpenClaw history sort must prefer createdAt/created_at before timestamp',
)
assert.doesNotMatch(
  chat.match(/function\s+getOpenClawMessageCreatedTime\s*\([\s\S]*?\n\}/)?.[0] || '',
  /updatedAt|updated_at/,
  'OpenClaw history sort must not use updatedAt as its primary order source',
)
assert.match(
  chat,
  /function\s+getOpenClawRoleOrder\s*\(/,
  'OpenClaw history must sort user before assistant inside the same turn',
)
assert.match(
  chat,
  /function\s+sortOpenClawMessagesChronologically\s*\(/,
  'OpenClaw history must have a central chronological sort helper',
)
assert.match(
  chat,
  /if \(at !== bt\) return at - bt[\s\S]*if \(ar !== br\) return ar - br/,
  'OpenClaw history sort must order by time first, then role',
)
assert.match(
  chat,
  /_openClawOriginalIndex: sourceIndex/,
  'OpenClaw history must preserve source index as final stable fallback',
)
assert.match(
  chat,
  /collapseDuplicateOpenClawAssistantsWithinUserTurn\(sortOpenClawMessagesChronologically\(deduped\)\)/,
  'OpenClaw history restore must merge before render using sorted messages',
)

console.log('OPENCLAW_HISTORY_RESTORE_MERGES_BEFORE_RENDER: PASS')
console.log('OPENCLAW_HISTORY_SORTS_BY_CREATED_AT: PASS')
console.log('OPENCLAW_UPDATED_AT_DOES_NOT_REORDER_HISTORY: PASS')
console.log('OPENCLAW_USER_BEFORE_ASSISTANT_WITHIN_TURN: PASS')
console.log('OPENCLAW_HISTORY_LATEST_MESSAGE_AT_BOTTOM: PASS')
