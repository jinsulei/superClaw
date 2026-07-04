import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  ensureCompleteVisibleReply,
  looksIncompleteVisibleReply,
} from '../src/shared/chat-output-guard.js'

const fallbackPattern = /这次回复没有完整生成|杩欐/

const streamingDrafts = [
  'Advice:',
  '| Field | Value |',
  '-',
  'Material status:',
  'The answer is still streaming and may end with a colon:',
]

for (const draft of streamingDrafts) {
  assert.equal(looksIncompleteVisibleReply(draft), true, `draft should be considered incomplete: ${draft}`)
  const streamed = ensureCompleteVisibleReply(draft, {
    agent: 'hermes',
    phase: 'stream',
  })
  assert.equal(streamed, draft, 'streaming guard must preserve incomplete draft text')
  assert.doesNotMatch(streamed, fallbackPattern, 'streaming guard must not inject retry fallback')
}

const preservedFinal = ensureCompleteVisibleReply('Advice:', {
  agent: 'hermes',
  phase: 'final',
  allowFallbackReplacement: false,
  preserveOriginalOnIncomplete: true,
})
assert.equal(preservedFinal, 'Advice:', 'final guard can preserve non-empty incomplete text when explicitly requested')
assert.doesNotMatch(preservedFinal, fallbackPattern)

const legacyFinal = ensureCompleteVisibleReply('Advice:', {
  agent: 'hermes',
  phase: 'final',
})
assert.notEqual(legacyFinal, 'Advice:', 'legacy final guard should still repair incomplete text by default')

const chatStore = readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
assert.match(
  chatStore,
  /function\s+sanitizeHermesVisibleReply[\s\S]*options\s*=\s*\{\}/,
  'Hermes sanitizer must accept phase options',
)
assert.match(
  chatStore,
  /phase\s*===\s*['"]stream['"][\s\S]*stripInternalStatusText/,
  'Hermes stream sanitizer must avoid final completeness repair',
)
const streamPhaseCount = (chatStore.match(/phase:\s*['"]stream['"]/g) || []).length
assert.ok(streamPhaseCount >= 3, 'all Hermes delta append paths must sanitize as stream phase')

const assembler = readFileSync('src/engines/hermes/lib/hermes-response-assembler.js', 'utf8')
assert.match(
  assembler,
  /allowFallbackReplacement:\s*options\.allowFallbackReplacement/,
  'Hermes response assembler must pass fallback replacement option to shared guard',
)
assert.match(
  assembler,
  /preserveOriginalOnIncomplete:\s*options\.preserveOriginalOnIncomplete/,
  'Hermes response assembler must pass preserve-original option to shared guard',
)

console.log('SMOKE_HERMES_STREAMING_OUTPUT_GUARD_PASS')
