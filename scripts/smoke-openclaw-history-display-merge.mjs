import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /function\s+stripOpenClawRuntimePromptBlocks\s*\(/,
  'OpenClaw must strip internal runtime prompt blocks before rendering user history',
)
assert.match(
  chat,
  /BROWSER_TOOL_TRIGGER[\s\S]*DESKTOP_CONTROL_TRIGGER[\s\S]*OPENCLAW_TOOL_TRIGGER/,
  'OpenClaw runtime prompt stripper must include tool trigger blocks',
)
assert.match(
  chat,
  /function\s+openClawVisibleUserText\s*\(/,
  'OpenClaw visible user text helper is missing',
)
assert.match(
  chat,
  /const visibleText = role === 'user' \? openClawVisibleUserText\(rawText\) : sanitizeOpenClawVisibleReply\(rawText\)/,
  'OpenClaw history fingerprint must use sanitized user-visible text',
)
assert.match(
  chat,
  /appendUserMessage\(openClawVisibleUserText\(msg\.text \|\| ''\)/,
  'OpenClaw local and gateway history must render sanitized user text',
)
assert.match(
  chat,
  /stripOpenClawRuntimePromptBlocks\(stripThinkingTags/,
  'OpenClaw content extraction must strip runtime prompt blocks before history dedupe/rendering',
)
assert.match(
  chat,
  /function\s+replaceOpenClawPartialAssistantAfterLastUser\s*\(/,
  'OpenClaw must replace partial live assistant bubbles with complete history replies',
)
assert.match(
  chat,
  /isOpenClawPartialAssistantText\(existingText,\s*finalText\)/,
  'OpenClaw partial assistant replacement must compare existing and final visible text',
)
assert.match(
  chat,
  /if \(replaceOpenClawPartialAssistantAfterLastUser\(msg\)\) return true/,
  'OpenClaw assistant history append must replace partial request bubbles before appending',
)
assert.match(
  chat,
  /function\s+isOpenClawIncompleteVisibleText\s*\(/,
  'OpenClaw must classify pipe-only and half-table assistant drafts as incomplete',
)
assert.match(
  chat,
  /isOpenClawIncompleteVisibleText\(text\)/,
  'OpenClaw meaningful assistant detection must reject incomplete visible text',
)
assert.match(
  chat,
  /const hasIncompleteDraft = _currentAiBubble && _currentAiText && isOpenClawIncompleteVisibleText\(_currentAiText\)/,
  'OpenClaw abort/error handling must check whether the current assistant draft is incomplete',
)
assert.match(
  chat,
  /!isOpenClawIncompleteVisibleText\(_currentAiText\)[\s\S]*clearOpenClawGenerationState\('aborted-after-visible-content'/,
  'OpenClaw must not mark aborted replies complete when only an incomplete draft is visible',
)
assert.match(
  chat,
  /recoverOpenClawAssistantFromHistoryBeforeFallback\('aborted-before-fallback'[\s\S]*attempts: hasIncompleteDraft \? 10 : 4/,
  'OpenClaw aborted recovery must wait longer when the visible draft is incomplete',
)
assert.match(
  chat,
  /if \(\(_isStreaming \|\| _currentAiBubble\) && !hasIncompleteDraft\)[\s\S]*clearOpenClawGenerationState\('error-after-visible-content'/,
  'OpenClaw error handling must only complete visible replies when the current draft is not incomplete',
)
assert.match(
  chat,
  /recoverOpenClawAssistantFromHistoryBeforeFallback\('error-before-fallback'[\s\S]*attempts: 10/,
  'OpenClaw error handling must recover incomplete drafts from history before showing an error fallback',
)

console.log('OPENCLAW_HISTORY_DISPLAY_MERGE: PASS')
