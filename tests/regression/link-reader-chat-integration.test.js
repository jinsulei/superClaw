import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const CHAT_JS_PATH = 'src/engines/hermes/pages/chat.js'
const DEV_API_PATH = 'scripts/dev-api.js'
const TAURI_API_PATH = 'src/lib/tauri-api.js'

const chatSource = readFileSync(CHAT_JS_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')
const tauriApiSource = readFileSync(TAURI_API_PATH, 'utf8')

const NO_PARALLEL_IMPL_RULES = [
  'Do not create a second Link Reader implementation.',
  'Do not bypass assistant_fetch_url.',
  'Do not rewrite scripts/dev-api.js for this integration.',
  'Attach normalizeLinkReaderResult output beside the existing modelContent / visibleText flow.',
]

test('Link Reader chat integration has an explicit expected gap for normalizeLinkReaderResult', () => {
  assert.match(
    chatSource,
    /\bnormalizeLinkReaderResult\b/,
    'expected gap: chat.js must import or call normalizeLinkReaderResult in the Link Reader main path',
  )
})

test('Link Reader chat integration preserves existing main-chain functions', () => {
  for (const functionName of [
    'handleReadLink',
    'assistantFetchUrlWithTimeout',
    'buildHermesVideoLinkAnalysisPayload',
    'formatVideoLinkAnalysisRequest',
  ]) {
    assert.match(chatSource, new RegExp(`\\bfunction\\s+${functionName}\\b|\\basync\\s+function\\s+${functionName}\\b`))
  }
})

test('Link Reader chat integration keeps existing insufficient-material fallback wording', () => {
  assert.match(chatSource, /素材不足/)
  assert.match(chatSource, /暂时拿不到视频正文|需要你补充素材|抓取失败|抓取超时/)
})

test('Link Reader chat integration must not bypass assistant_fetch_url', () => {
  assert.match(tauriApiSource, /assistantFetchUrl:\s*\(url\)\s*=>\s*invoke\('assistant_fetch_url'/)
  assert.match(devApiSource, /\bassistant_fetch_url\b/)
  assert.match(chatSource, /\bassistantFetchUrlWithTimeout\b/)
  assert.doesNotMatch(chatSource, /\bfetch\s*\(\s*url\s*\)/)
})

test('Link Reader chat integration must not create a second Link Reader runner in chat.js', () => {
  assert.doesNotMatch(chatSource, /\bclass\s+.*LinkReader\b/)
  assert.doesNotMatch(chatSource, /\bnew\s+.*LinkReader\b/)
  assert.doesNotMatch(chatSource, /\bcreateLinkReader\b|\brunLinkReader\b|\bexecuteLinkReader\b/)
})

test('Link Reader chat integration keeps modelContent and visibleText as the primary chat flow', () => {
  assert.match(chatSource, /\bmodelContent\b/)
  assert.match(chatSource, /\bvisibleText\b/)
  assert.match(chatSource, /store\.sendMessage\([^)]*visibleText[\s\S]*modelContent/)
})

test('Link Reader chat integration should attach normalized result rather than replace old flow', () => {
  assert.match(chatSource, /\bnormalizeLinkReaderResult\b/)
  assert.match(chatSource, /\bmodelContent\b/)
  assert.match(chatSource, /\bvisibleText\b/)
  assert.doesNotMatch(chatSource, /modelContent\s*=\s*normalizeLinkReaderResult/)
  assert.doesNotMatch(chatSource, /visibleText\s*=\s*normalizeLinkReaderResult/)
})

test('no_parallel_impl guard documents the second-round Link Reader scope', () => {
  assert.ok(NO_PARALLEL_IMPL_RULES.includes('Do not create a second Link Reader implementation.'))
  assert.ok(NO_PARALLEL_IMPL_RULES.includes('Do not bypass assistant_fetch_url.'))
  assert.ok(NO_PARALLEL_IMPL_RULES.includes('Do not rewrite scripts/dev-api.js for this integration.'))
  assert.ok(
    NO_PARALLEL_IMPL_RULES.includes(
      'Attach normalizeLinkReaderResult output beside the existing modelContent / visibleText flow.',
    ),
  )
})
