import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const CHAT_JS_PATH = 'src/engines/hermes/pages/chat.js'
const DEV_API_PATH = 'scripts/dev-api.js'
const TAURI_API_PATH = 'src/lib/tauri-api.js'

const chatSource = readFileSync(CHAT_JS_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')
const tauriApiSource = readFileSync(TAURI_API_PATH, 'utf8')

const ordinaryFailureBranch = chatSource.match(
  /if\s*\(\s*fetchStatus\.kind\s*!==\s*['"]link_fetch_success['"]\s*\)\s*{[\s\S]*?toast\(['"]链接读取失败或超时，已生成有限分析提示。['"][\s\S]*?return\s*[\r\n]+\s*}/,
)?.[0] || ''

function stripJsComments(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

test('ordinary Link Reader failure branch is present and keeps limited reply formatting', () => {
  assert.ok(ordinaryFailureBranch, 'chat.js must keep the ordinary link fetch_failed / timeout branch')
  assert.match(ordinaryFailureBranch, /\bformatLinkFetchLimitedReply\s*\(/)
  assert.match(chatSource, /\bfunction\s+formatLinkFetchLimitedReply\s*\(/)
})

test('ordinary Link Reader failure branch preserves normalized metadata before returning', () => {
  assert.match(chatSource, /\bnormalizeLinkReaderResult\b/)
  assert.match(chatSource, /\bbuildLinkReaderNormalizedMetadata\b/)
  assert.match(ordinaryFailureBranch, /\bnormalizedLinkReaderResult\b/)
  assert.match(ordinaryFailureBranch, /\blinkReaderResult\s*:\s*normalizedLinkReaderResult\b/)
  assert.match(ordinaryFailureBranch, /metadata\s*:\s*{[\s\S]*link_reader_result\s*:\s*normalizedLinkReaderResult/)
})

test('ordinary Link Reader failure branch must not only push plain assistant text then return', () => {
  assert.doesNotMatch(
    stripJsComments(ordinaryFailureBranch),
    /store\.pushLocalAssistant\s*\(\s*formatLinkFetchLimitedReply\s*\(\s*url\s*,\s*fetchStatus\s*\)\s*\)[\s\S]*?return/,
    'fetch_failed / timeout must keep metadata, not only a plain text assistant message',
  )
})

test('ordinary Link Reader failure branch keeps the existing fetch path', () => {
  assert.match(chatSource, /\bassistantFetchUrlWithTimeout\s*\(\s*url\s*\)/)
  assert.match(tauriApiSource, /assistantFetchUrl:\s*\(url\)\s*=>\s*invoke\('assistant_fetch_url'/)
  assert.match(devApiSource, /\bassistant_fetch_url\b/)
  assert.doesNotMatch(chatSource, /\bfetch\s*\(\s*url\s*\)/)
})

test('ordinary Link Reader status metadata must not fabricate rich materials', () => {
  assert.doesNotMatch(ordinaryFailureBranch, /transcript\s*:\s*['"`][^'"`]+/)
  assert.doesNotMatch(ordinaryFailureBranch, /ocr\s*:\s*['"`][^'"`]+/)
  assert.doesNotMatch(ordinaryFailureBranch, /asr\s*:\s*['"`][^'"`]+/)
  assert.doesNotMatch(ordinaryFailureBranch, /comments\s*:\s*\[[^\]]+\]/)
  assert.match(chatSource, /transcript_available:\s*false/)
  assert.match(chatSource, /frame_ocr_available:\s*hasOcrText/)
  assert.match(chatSource, /audio_transcript_available:\s*false/)
})

test('Link Reader status UI regression keeps no_parallel_impl constraints', () => {
  assert.doesNotMatch(chatSource, /\bclass\s+.*LinkReader\b/)
  assert.doesNotMatch(chatSource, /\bnew\s+.*LinkReader\b/)
  assert.doesNotMatch(chatSource, /\bcreateLinkReader\b|\brunLinkReader\b|\bexecuteLinkReader\b/)
  assert.doesNotMatch(chatSource, /scripts\/dev-api|dev-api\.js/)
  assert.doesNotMatch(chatSource, /runtime\/data\/secrets|relay-config\.json|\.env/)
})
