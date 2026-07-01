import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(chat, /function\s+normalizeOpenClawHistoryRecord\s*\(/, 'OpenClaw history wrapper normalizer is missing')
assert.match(chat, /\.\.\.inner,[\s\S]*messageId:\s*inner\.messageId\s*\|\|\s*msg\.messageId\s*\|\|\s*msg\.id/, 'History normalizer must preserve wrapper ids')
assert.match(chat, /timestamp:\s*inner\.timestamp\s*\|\|\s*msg\.timestamp/, 'History normalizer must preserve wrapper timestamp')
assert.match(chat, /function\s+dedupeHistory\s*\([\s\S]*?const msg = normalizeOpenClawHistoryRecord\(rawMsg\)/, 'dedupeHistory must unwrap OpenClaw history message records')
assert.match(chat, /function\s+dedupeHistoryStable\s*\([\s\S]*?const msg = normalizeOpenClawHistoryRecord\(rawMsg\)/, 'dedupeHistoryStable must unwrap OpenClaw history message records')
assert.match(chat, /function\s+cachedHistoryMessage\s*\(m\)\s*\{[\s\S]*?m = normalizeOpenClawHistoryRecord\(m\)/, 'cachedHistoryMessage must unwrap OpenClaw history message records')
assert.match(chat, /function\s+extractContent\s*\(msg\)\s*\{[\s\S]*?msg = normalizeOpenClawHistoryRecord\(msg\)/, 'extractContent must unwrap OpenClaw history message records')
assert.match(chat, /sparse history refresh merged to preserve visible messages/, 'Sparse Gateway history refresh must merge instead of being ignored')
assert.match(chat, /if\s*\(refreshIsSparse\)\s*\{[\s\S]*?mergeHistoryIntoCurrentMessages\(deduped\)[\s\S]*?saveMessages\(result\.messages\.map\(cachedHistoryMessage\)\)[\s\S]*?return/, 'Sparse history path must merge Gateway history before returning')
assert.doesNotMatch(chat, /sparse history refresh ignored to preserve visible messages/, 'Sparse Gateway history must not be ignored')
assert.match(chat, /m\.dedupeKey \|\| m\.displayDedupeKey \|\| m\.id \|\| m\.messageId \|\| m\.runId \|\| m\.timestamp/, 'Gateway history hash must include message identity, not only visible text length')
assert.match(chat, /else\s*\{\s*syncWorkspaceContext\(false\)\s*loadHistory\(\)\s*\}/, 'WS ready with an existing sessionKey must refresh Gateway history')
assert.match(chat, /function\s+hasVisibleRenderedOpenClawMessage\s*\(sessionKey,\s*dedupeKey\)/, 'OpenClaw history recovery needs a DOM-visible rendered message check')
assert.match(chat, /function\s+getOpenClawDedupeKeyParts\s*\(dedupeKey\s*=\s*''\)/, 'OpenClaw rendered rows must expose display fingerprints for live/history dedupe')
assert.match(chat, /function\s+hasVisibleOpenClawAssistantAfterLastUserWithDisplay\s*\(sessionKey,\s*displayKey\)/, 'OpenClaw history recovery needs after-last-user assistant display dedupe')
assert.match(chat, /wrap\.dataset\.openclawDisplayKey\s*=\s*parts\.display/, 'OpenClaw rendered rows must store display fingerprints')
assert.match(chat, /if\s*\(msg\.role === 'assistant'\)\s*\{[\s\S]*?const displayKey = getOpenClawDedupeKeyParts\(dedupeKey\)\.display[\s\S]*?return hasVisibleOpenClawAssistantAfterLastUserWithDisplay\(sessionKey,\s*displayKey\)/, 'Assistant history messages must only skip when a matching live assistant exists after the latest user message')
assert.match(chat, /fromHistory:\s*true/, 'History assistant append must bypass stale in-memory render keys and trust visible DOM')

console.log('OPENCLAW_HISTORY_MESSAGE_WRAPPER: PASS')
