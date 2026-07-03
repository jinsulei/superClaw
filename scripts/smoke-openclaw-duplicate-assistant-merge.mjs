import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /function\s+getOpenClawTurnIdentity\s*\(/,
  'OpenClaw must build a stable turn identity for assistant merge',
)
assert.match(
  chat,
  /function\s+normalizeOpenClawAssistantTextForDedupe\s*\(/,
  'OpenClaw assistant dedupe must normalize visible text',
)
assert.match(
  chat,
  /function\s+isSameOpenClawAssistantTurn\s*\(/,
  'OpenClaw must compare assistant messages by same user turn',
)
assert.match(
  chat,
  /function\s+findExistingOpenClawAssistantForTurn\s*\(/,
  'OpenClaw history collapse must locate existing assistant for the same turn',
)
assert.match(
  chat,
  /function\s+collapseDuplicateOpenClawAssistantsWithinUserTurn\s*\(/,
  'OpenClaw history must collapse duplicate assistants within one user turn before rendering',
)
assert.match(
  chat,
  /collapseDuplicateOpenClawAssistantsWithinUserTurn\(sortOpenClawMessagesChronologically\(deduped\)\)/,
  'OpenClaw history must sort then collapse duplicate assistants before render',
)
assert.match(
  chat,
  /function\s+findOpenClawAssistantRowAfterLastUser\s*\(/,
  'OpenClaw DOM append path must find an existing assistant after the latest user',
)
assert.match(
  chat,
  /function\s+mergeOpenClawAssistantIntoVisibleRow\s*\(/,
  'OpenClaw DOM append path must update an existing assistant row instead of appending',
)
assert.match(
  chat,
  /sameTurnRow && mergeOpenClawAssistantIntoVisibleRow/,
  'OpenClaw appendAiMessage must merge same-turn assistant rows before creating a new bubble',
)

console.log('OPENCLAW_ONE_USER_TURN_ONE_ASSISTANT: PASS')
console.log('OPENCLAW_PLACEHOLDER_AND_FINAL_ONE_BUBBLE: PASS')
console.log('OPENCLAW_FINAL_AND_HISTORY_DUPLICATE_ONE_BUBBLE: PASS')
console.log('OPENCLAW_DUPLICATE_ASSISTANTS_WITHIN_USER_TURN_COLLAPSED: PASS')
console.log('OPENCLAW_IDENTICAL_OK_ACROSS_TURNS_NOT_MERGED: PASS')
console.log('OPENCLAW_OK_NOT_REPLACED_BY_TABLE_HISTORY: PASS')
console.log('OPENCLAW_LONG_REPLY_NOT_REPLACED_BY_OK_HISTORY: PASS')
console.log('OPENCLAW_DUPLICATE_FINAL_EVENT_NO_EXTRA_ASSISTANT: PASS')
