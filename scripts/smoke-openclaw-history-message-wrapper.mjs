import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(chat, /function\s+normalizeOpenClawHistoryRecord\s*\(/, 'OpenClaw history wrapper normalizer is missing')
assert.match(chat, /function\s+stripOpenClawHistoryUserTimestamp\s*\(/, 'OpenClaw history user timestamp prefix stripper is missing')
assert.match(chat, /openClawVisibleUserText\(text\)[\s\S]*?stripOpenClawHistoryUserTimestamp\(stripOpenClawRuntimePromptBlocks\(text\)\)/, 'OpenClaw visible user text must strip Gateway history timestamp prefixes')
assert.match(chat, /\.\.\.inner,[\s\S]*messageId:\s*inner\.messageId\s*\|\|\s*msg\.messageId\s*\|\|\s*msg\.id/, 'History normalizer must preserve wrapper ids')
assert.match(chat, /timestamp:\s*inner\.timestamp\s*\|\|\s*msg\.timestamp/, 'History normalizer must preserve wrapper timestamp')
assert.match(chat, /function\s+dedupeHistory\s*\([\s\S]*?const msg = normalizeOpenClawHistoryRecord\(rawMsg\)/, 'dedupeHistory must unwrap OpenClaw history message records')
assert.match(chat, /function\s+dedupeHistoryStable\s*\([\s\S]*?const msg = normalizeOpenClawHistoryRecord\(rawMsg\)/, 'dedupeHistoryStable must unwrap OpenClaw history message records')
assert.match(chat, /function\s+cachedHistoryMessage\s*\(m\)\s*\{[\s\S]*?m = normalizeOpenClawHistoryRecord\(m\)/, 'cachedHistoryMessage must unwrap OpenClaw history message records')
assert.match(chat, /function\s+extractContent\s*\(msg\)\s*\{[\s\S]*?msg = normalizeOpenClawHistoryRecord\(msg\)/, 'extractContent must unwrap OpenClaw history message records')
assert.match(chat, /sparse history refresh merged to preserve visible messages/, 'Sparse Gateway history refresh must merge instead of being ignored')
assert.match(chat, /if\s*\(refreshIsSparse\)\s*\{[\s\S]*?mergeHistoryIntoCurrentMessages\(deduped\)[\s\S]*?saveMessages\(result\.messages\.map\(cachedHistoryMessage\)\)[\s\S]*?return/, 'Sparse history path must merge Gateway history before returning')
assert.doesNotMatch(chat, /sparse history refresh ignored to preserve visible messages/, 'Sparse Gateway history must not be ignored')
assert.match(chat, /const hasActiveOpenClawGeneration = Boolean\(_activeOpenClawRun \|\| _openClawPendingResponse \|\| _isSending \|\| _isStreaming \|\| _currentAiBubble\)/, 'Active OpenClaw generation must force history merge instead of trusting stale history hash')
assert.match(chat, /if\s*\(hash === _lastHistoryHash && hasExisting && !hasIncompleteDraft && !hasActiveOpenClawGeneration\) return/, 'OpenClaw active run must not skip history merge on matching hash')
assert.match(chat, /const history = await wsClient\.chatHistory\(_sessionKey,\s*200\)[\s\S]*?completeOpenClawCurrentDraftFromLatestHistory\(history\?\.messages \|\| \[\]\)/, 'OpenClaw recovery must read Gateway history even when no stream text was accumulated')
assert.match(chat, /function\s+isRecoverableOpenClawCurrentDraft\s*\([\s\S]*openclawIncomplete === 'true'[\s\S]*isOpenClawTransientFallbackText\(text\)[\s\S]*isOpenClawTextClearlyIncomplete\(text\)/, 'OpenClaw must recognize incomplete/fallback UI bubbles as recoverable from Gateway history')
assert.match(chat, /function\s+canRecoverOpenClawDraftFromLatestHistory\s*\([\s\S]*msg\._openClawAfterLatestHistoryUser[\s\S]*isOpenClawCandidateCompatibleWithPrompt\(text,\s*userText\)/, 'OpenClaw must allow latest-user Gateway assistant history to recover packaged UI fallbacks without request ids')
assert.match(chat, /function\s+ensureOpenClawHistoryRecoveryBubble\s*\([\s\S]*createStreamBubble\([\s\S]*_currentAiBubbleRequestId = stableStreamId/, 'OpenClaw must create a recovery bubble when Gateway history has the final reply but no stream bubble was created')
assert.match(chat, /if\s*\(!canRecoverOpenClawDraftFromLatestHistory\(msg\)\) return false/, 'OpenClaw current-draft completion must use the packaged history recovery gate')
assert.doesNotMatch(chat, /function\s+completeOpenClawCurrentDraftFromLatestHistory\s*\([^)]*\)\s*\{\s*if\s*\(!_currentAiBubble\) return false/, 'OpenClaw latest-history completion must not give up when no stream bubble exists')
assert.match(chat, /if\s*\(!_currentAiBubble && !ensureOpenClawHistoryRecoveryBubble\(msg\)\) continue/, 'OpenClaw latest-history completion must create a recovery bubble before completing from Gateway history')
assert.match(chat, /canUseLatestHistoryFallback[\s\S]*existingIsRecoverable[\s\S]*isOpenClawPartialAssistantText\(existingText,\s*finalText\)[\s\S]*canUseLatestHistoryFallback && existingIsRecoverable/, 'OpenClaw history merge must replace incomplete fallback rows after the latest user')
assert.match(chat, /recoverOpenClawAssistantFromHistoryBeforeFallback\('post-incomplete-fallback-history-recovery'[\s\S]*attempts:\s*12[\s\S]*delayMs:\s*500/, 'OpenClaw must keep polling history after rendering an incomplete fallback')
assert.match(chat, /const history = await wsClient\.chatHistory\(_sessionKey,\s*200\)[\s\S]*completeOpenClawCurrentDraftFromLatestHistory\(history\?\.messages \|\| \[\]\)/, 'OpenClaw direct history recovery must run even when the UI has no current assistant bubble')
assert.match(chat, /m\.dedupeKey \|\| m\.displayDedupeKey \|\| m\.id \|\| m\.messageId \|\| m\.runId \|\| m\.timestamp/, 'Gateway history hash must include message identity, not only visible text length')
assert.match(chat, /else\s*\{\s*syncWorkspaceContext\(false\)\s*loadHistory\(\)\s*\}/, 'WS ready with an existing sessionKey must refresh Gateway history')
assert.match(chat, /function\s+hasVisibleRenderedOpenClawMessage\s*\(sessionKey,\s*dedupeKey\)/, 'OpenClaw history recovery needs a DOM-visible rendered message check')
assert.match(chat, /function\s+getOpenClawDedupeKeyParts\s*\(dedupeKey\s*=\s*''\)/, 'OpenClaw rendered rows must expose display fingerprints for live/history dedupe')
assert.match(chat, /function\s+hasVisibleOpenClawAssistantAfterLastUserWithDisplay\s*\(sessionKey,\s*displayKey\)/, 'OpenClaw history recovery needs after-last-user assistant display dedupe')
assert.match(chat, /wrap\.dataset\.openclawDisplayKey\s*=\s*parts\.display/, 'OpenClaw rendered rows must store display fingerprints')
assert.match(chat, /if\s*\(msg\.role === 'assistant'\)\s*\{[\s\S]*?const displayKey = getOpenClawDedupeKeyParts\(dedupeKey\)\.display[\s\S]*?return hasVisibleOpenClawAssistantAfterLastUserWithDisplay\(sessionKey,\s*displayKey\)/, 'Assistant history messages must only skip when a matching live assistant exists after the latest user message')
assert.match(chat, /fromHistory:\s*true/, 'History assistant append must bypass stale in-memory render keys and trust visible DOM')

function stripOpenClawHistoryUserTimestampForSmoke(text = '') {
  return String(text || '')
    .replace(/^\[[A-Z][a-z]{2}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+GMT[+-]\d+\]\s*/u, '')
    .trim()
}

assert.equal(stripOpenClawHistoryUserTimestampForSmoke('[Sun 2026-07-05 15:01 GMT+8] 你好'), '你好', 'OpenClaw history timestamp prefix was not stripped in smoke model')

console.log('OPENCLAW_HISTORY_MESSAGE_WRAPPER: PASS')
console.log('OPENCLAW_HISTORY_USER_TIMESTAMP_PREFIX_STRIPPED: PASS')
console.log('OPENCLAW_ACTIVE_RUN_HISTORY_MERGE_NOT_HASH_SKIPPED: PASS')
console.log('OPENCLAW_EMPTY_STREAM_DRAFT_RECOVERS_FROM_HISTORY: PASS')
console.log('OPENCLAW_PACKAGED_FALLBACK_REPLACED_BY_HISTORY: PASS')
console.log('OPENCLAW_HISTORY_FINAL_CREATES_MISSING_STREAM_BUBBLE: PASS')
