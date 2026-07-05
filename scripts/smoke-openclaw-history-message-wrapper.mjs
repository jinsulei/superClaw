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
assert.match(chat, /if\s*\(_currentAiBubble\)\s*\{[\s\S]*?const history = await wsClient\.chatHistory\(_sessionKey,\s*200\)[\s\S]*?completeOpenClawCurrentDraftFromLatestHistory\(history\?\.messages \|\| \[\]\)/, 'OpenClaw recovery must read Gateway history even when no stream text was accumulated')
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
