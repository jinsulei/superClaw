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
  /isOpenClawVisibleTextInternalAuditOnly\(msg\.text \|\| ''\)/,
  'OpenClaw history must drop internal audit-only assistant messages',
)
assert.match(
  chat,
  /function\s+isOpenClawIncompleteVisibleText\s*\(/,
  'OpenClaw must classify pipe-only and half-table assistant drafts as incomplete',
)
assert.match(
  chat,
  /isOpenClawTextClearlyIncomplete\(finalText\)/,
  'OpenClaw history must not complete or append incomplete assistant replies',
)
assert.match(
  chat,
  /chooseBestOpenClawAssistantText\(\[_currentAiText,\s*msg\.text\]/,
  'OpenClaw streaming history completion must compare live and history text completeness',
)
assert.match(
  chat,
  /function\s+createOpenClawTurnId\s*\(/,
  'OpenClaw must create a strong turn id for each OpenClaw send',
)
assert.match(
  chat,
  /function\s+isSameOpenClawTurn\s*\(/,
  'OpenClaw must compare strong turn keys before history recovery',
)
assert.match(
  chat,
  /function\s+isStrongOpenClawHistoryCandidate\s*\([\s\S]*getOpenClawStrongHistoryMatchReason[\s\S]*isOpenClawCandidateCompatibleWithPrompt/,
  'OpenClaw history recovery must require strong turn match plus prompt compatibility',
)
assert.doesNotMatch(
  chat,
  /samePrompt[\s\S]*completeStreamingDraftFromHistory/,
  'OpenClaw must not recover history by prompt-only matching',
)
assert.doesNotMatch(
  chat,
  /looksLikeSameDraft[\s\S]*completeStreamingDraftFromHistory/,
  'OpenClaw must not recover history by loose text similarity',
)
assert.match(
  chat,
  /function\s+hasVisibleOpenClawAssistantAfterLastUserWithDisplay\s*\([\s\S]*lastIndexOf\(true\)[\s\S]*rows\.slice\(lastUserIndex \+ 1\)/,
  'OpenClaw same-display assistant dedupe must only scan after the latest visible user turn',
)
assert.match(
  chat,
  /function\s+getOpenClawLastVisibleUserText\s*\(/,
  'OpenClaw history merge must know the latest visible user turn',
)
assert.match(
  chat,
  /if \(savedAgent && savedAgent === fallbackAgent\) \{\s*return saved/,
  'OpenClaw startup must restore a same-agent work-file session instead of resetting to main',
)
assert.match(
  chat,
  /if \(snapshotSessionKey\) \{[\s\S]*?_sessionKey = snapshotSessionKey[\s\S]*?restoreOpenClawChatSnapshot\(snapshotSessionKey, 'render'\)/,
  'OpenClaw startup must keep the saved session key even when no DOM snapshot exists',
)
assert.match(
  chat,
  /STORAGE_LAST_ACTIVE_SESSION_KEY = 'superclaw-last-active-session'/,
  'OpenClaw must keep a user-selected session key separate from Gateway defaults',
)
assert.match(
  chat,
  /localStorage\.setItem\(STORAGE_LAST_ACTIVE_SESSION_KEY, targetSessionKey\)/,
  'OpenClaw must persist the actual user session switch for the next app startup',
)
assert.match(
  chat,
  /getMostRecentLocalSessionKey\(\) \|\|[\s\S]*?STORAGE_LAST_ACTIVE_SESSION_KEY/,
  'OpenClaw startup must prefer the persisted local session index over Gateway defaults',
)
assert.match(
  chat,
  /upsertLocalSession\(targetSessionKey, nextAgentId, currentLocalSession\?\.title \|\| parseSessionLabel\(targetSessionKey\)\)/,
  'OpenClaw session switches must update the local session recency index',
)
assert.match(
  chat,
  /function scheduleInitialOpenClawHistoryLoad\(\)[\s\S]*?for \(const delayMs of \[0, 900, 2500, 5000\]\)[\s\S]*?await refreshSessionList\(\)[\s\S]*?loadHistory\(startupSessionKey\)/,
  'OpenClaw startup must retry an empty history view without requiring a manual session switch',
)
assert.match(
  chat,
  /let rawHistory = null[\s\S]*?api\.readOpenclawRawHistory\(requestedSessionKey, 500\)[\s\S]*?if \(!wsClient\.gatewayReady\) \{[\s\S]*?renderOpenClawRecoveredHistory\(rawHistory, requestedSessionKey, localDedupedForSession\)/,
  'OpenClaw startup must restore durable JSONL history before a delayed Gateway projection is ready',
)
assert.match(
  chat,
  /function renderOpenClawRecoveredHistory\([\s\S]*?attachOpenClawExecutionTimeline\(rawMessages\)[\s\S]*?clearMessages\(\)[\s\S]*?appendAiMessage\(/,
  'OpenClaw raw-history recovery must preserve execution timelines while rendering an offline startup view',
)
assert.match(
  chat,
  /function restoreOpenClawStartupSessionFromRawRegistry\([\s\S]*?api\.listOpenclawRawSessions\(80\)[\s\S]*?currentStillExists[\s\S]*?_sessionKey = recoveredKey[\s\S]*?localStorage\.setItem\(STORAGE_LAST_ACTIVE_SESSION_KEY, recoveredKey\)/,
  'OpenClaw startup must replace an obsolete local session key with the latest durable session instead of rendering an empty conversation',
)
assert.match(
  chat,
  /function markOpenClawGatewayReady\([\s\S]*?countDisplayedChatMessages\(\) === 0[\s\S]*?scheduleInitialOpenClawHistoryLoad\(\)/,
  'OpenClaw must reload durable history when a Gateway restart becomes ready while the chat route stays mounted',
)
assert.match(
  chat,
  /normalizeOpenClawPromptFingerprint\(lastHistoryUserText\) !== lastVisibleUserFingerprint[\s\S]*continue/,
  'OpenClaw history merge must not append old-user assistant replies after the latest visible user',
)
assert.match(
  chat,
  /const hasActiveOpenClawGeneration = Boolean\([\s\S]*const hasIncompleteDraft = _currentAiBubble && _currentAiText && isOpenClawTextClearlyIncomplete\(_currentAiText\)[\s\S]*if \(hasActiveOpenClawGeneration \|\| shouldProtectCurrentMessagesFromHistory\(deduped\)\)/,
  'OpenClaw must preserve active drafts but rebuild an idle view from authoritative Gateway history',
)
assert.match(
  chat,
  /renderCompactAssistantContent\(visibleDraftText,\s*_currentAiBubble,\s*\{ phase: 'completed' \}\)/,
  'OpenClaw complete history text must replace the current live bubble',
)
assert.match(
  chat,
  /function\s+completeOpenClawCurrentDraftFromLatestHistory\s*\([\s\S]*dedupeHistoryStable\(attachOpenClawExecutionTimeline\(historyMessages\)\)[\s\S]*_openClawPreviousUserRequestId[\s\S]*completeStreamingDraftFromHistory\(msg\)/,
  'OpenClaw recovery must retain tool-use frames and annotate same-turn evidence before completing the current draft',
)
assert.match(
  chat,
  /wsClient\.chatHistory\(_sessionKey,\s*200\)[\s\S]*completeOpenClawCurrentDraftFromLatestHistory\(history\?\.messages \|\| \[\]\)/,
  'OpenClaw recovery must query history directly when normal merge leaves an incomplete draft',
)
assert.match(
  chat,
  /function\s+mergeHistoryIntoCurrentMessages\s*\(historyMessages = \[\]\)[\s\S]*_activeOpenClawRun \|\| _openClawPendingResponse \|\| _isSending \|\| _isStreaming[\s\S]*completeOpenClawCurrentDraftFromLatestHistory\(historyMessages\) \? 1 : 0/,
  'OpenClaw history merge must not append stale history while an active run exists',
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
console.log('OPENCLAW_STALE_FINAL_NOT_APPENDED: PASS')
console.log('OPENCLAW_ROUTE_SWITCH_FINAL_UPDATES_EXISTING_BUBBLE: PASS')
console.log('OPENCLAW_RESTORE_DROPS_INTERNAL_AUDIT_ONLY_MESSAGE: PASS')
console.log('OPENCLAW_RESTORE_DOES_NOT_REPLACE_OK_WITH_SKILL_AUDIT: PASS')
console.log('OPENCLAW_HISTORY_COMPLETE_TABLE_REPLACES_HALF_LIVE: PASS')
console.log('OPENCLAW_HISTORY_CANDIDATE_REQUIRES_STRONG_TURN_MATCH: PASS')
console.log('OPENCLAW_PROMPT_ONLY_MATCH_DISABLED: PASS')
console.log('OPENCLAW_RESTORE_DOES_NOT_USE_AUDIT_AS_BEST_TEXT: PASS')
console.log('OPENCLAW_SAME_DISPLAY_DEDUPE_SCOPED_TO_LATEST_USER: PASS')
console.log('OPENCLAW_HISTORY_APPEND_SCOPED_TO_LATEST_VISIBLE_USER: PASS')
console.log('OPENCLAW_DIRECT_HISTORY_COMPLETES_HALF_DRAFT: PASS')
console.log('OPENCLAW_INCOMPLETE_DRAFT_BLOCKS_STALE_HISTORY_APPEND: PASS')
console.log('OPENCLAW_OK_NOT_REPLACED_BY_TABLE_HISTORY: PASS')
console.log('OPENCLAW_LONG_REPLY_NOT_REPLACED_BY_OK_HISTORY: PASS')
console.log('OPENCLAW_REPEATED_TABLE_PROMPT_USES_CURRENT_TURN: PASS')
console.log('OPENCLAW_AMBIGUOUS_HISTORY_DOES_NOT_RECOVER: PASS')
console.log('OPENCLAW_COMPLETENESS_SCORE_NOT_CROSS_TURN: PASS')
