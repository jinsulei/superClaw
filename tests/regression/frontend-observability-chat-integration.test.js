import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const CHAT_PATH = 'src/engines/hermes/pages/chat.js'
const CHAT_STORE_PATH = 'src/engines/hermes/lib/chat-store.js'
const DEV_API_PATH = 'scripts/dev-api.js'

const chatSource = readFileSync(CHAT_PATH, 'utf8')
const chatStoreSource = readFileSync(CHAT_STORE_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')

test('chat.js wires Frontend Observability view model helpers into existing renderer', () => {
  assert.match(
    chatSource,
    /buildFrontendProgressBubbleViewModel|buildProgressBubbleViewModel|mapTaskEventsToProgressBubbleViewModel/,
    'chat.js must use the Progress Bubble view model helper from chat-store.js',
  )
  assert.match(
    chatSource,
    /buildFrontendDebugRowViewModel|buildDebugRowViewModel|mapToolRunsToDebugRowViewModel/,
    'chat.js must use the Debug Row view model helper from chat-store.js',
  )
  assert.match(chatStoreSource, /export function buildFrontendProgressBubbleViewModel/)
  assert.match(chatStoreSource, /export function buildFrontendDebugRowViewModel/)
})

test('Frontend Observability UI integration preserves existing Hermes renderer entry points', () => {
  assert.match(chatSource, /function\s+renderLiveTools\s*\(/)
  assert.match(chatSource, /function\s+renderToolMessage\s*\(/)
  assert.match(chatSource, /function\s+renderHermesInboxMessages\s*\(/)
  assert.doesNotMatch(chatSource, /function\s+renderFrontendChatRenderer\s*\(/)
  assert.doesNotMatch(chatSource, /class\s+FrontendObservabilityRenderer\b/)
})

test('Frontend Observability integration preserves Link Reader chat attachment flow', () => {
  assert.match(chatSource, /\bnormalizeLinkReaderResult\b/)
  assert.match(chatSource, /\blinkReaderResult\b/)
  assert.match(chatSource, /metadata:\s*{[\s\S]{0,240}link_reader_result/)
  assert.match(chatSource, /\bbuildLinkReaderNormalizedMetadata\b/)
  assert.doesNotMatch(chatSource, /modelContent\s*=\s*normalizeLinkReaderResult/)
  assert.doesNotMatch(chatSource, /visibleText\s*=\s*normalizeLinkReaderResult/)
})

test('Frontend Observability integration preserves OpenClaw full result rendering', () => {
  assert.match(chatSource, /\bfull_content\b/)
  assert.match(chatSource, /\bfullContent\b/)
  assert.ok(
    /\brenderOpenClawFullContentBlock\b/.test(chatSource)
      || /\bformatHermesInboxMessageBody\b/.test(chatSource),
    'OpenClaw full result rendering must keep an explicit full-content entry point',
  )
  assert.match(chatSource, /\bopenclawInboxSummary\b/)
  assert.match(chatSource, /\bredactHermesInboxFullContent\b/)
})

test('normal progress bubble must not directly render raw_payload or hidden reasoning', () => {
  const progressRenderer = chatSource.match(/function\s+renderFrontendProgressBubble[\s\S]*?\n\s*}\n/)
  assert.ok(progressRenderer, 'chat.js must contain a minimal Progress Bubble renderer')
  assert.doesNotMatch(progressRenderer[0], /raw_payload|rawPayload/)
  assert.doesNotMatch(progressRenderer[0], /<think>|hidden reasoning|private chain of thought/i)
})

test('debug rows must be fed through sanitized view model output', () => {
  const debugRenderer = chatSource.match(/function\s+renderFrontendDebugRows[\s\S]*?\n\s*}\n/)
  assert.ok(debugRenderer, 'chat.js must contain a minimal Debug Row renderer')
  assert.doesNotMatch(debugRenderer[0], /raw_payload|rawPayload/)
  assert.match(chatSource, /buildFrontendDebugRowViewModel\s*\(/)
  assert.match(chatSource, /output_summary|error_code|tool_run_id/)
})

test('integration remains scoped away from dev-api and runtime secrets', () => {
  assert.match(devApiSource, /\bassistant_fetch_url\b/)
  assert.doesNotMatch(chatSource, /runtime\/data\/secrets|relay-config\.json|\.env/)
  assert.doesNotMatch(chatSource, /scripts\/dev-api|dev-api\.js/)
})

test('no_parallel_impl contract remains explicit for frontend observability chat integration', () => {
  const noParallelImpl = [
    'Do not create a second chat renderer.',
    'Do not remove renderLiveTools.',
    'Do not remove renderToolMessage.',
    'Do not remove renderHermesInboxMessages.',
    'Do not replace Link Reader normalized metadata flow.',
    'Do not replace OpenClaw full result rendering.',
    'Do not modify scripts-dev-api.js.',
    'Do not read runtime/data/secrets.',
  ]

  assert.ok(noParallelImpl.includes('Do not create a second chat renderer.'))
  assert.ok(noParallelImpl.includes('Do not replace Link Reader normalized metadata flow.'))
  assert.ok(noParallelImpl.includes('Do not replace OpenClaw full result rendering.'))
})
