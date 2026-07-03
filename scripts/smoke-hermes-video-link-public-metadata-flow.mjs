import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /function\s+assistantTextHasPublicMetadataAnalysis\s*\(/,
  'Hermes must classify public metadata analysis separately from complete video material',
)
assert.match(
  chat,
  /toolHasLimitedMetadata/,
  'Hermes material card must detect short-video metadata fallback',
)
assert.match(
  chat,
  /公开字段可分析/,
  'Hermes material card must not label public metadata as generic material insufficiency',
)
assert.match(
  chat,
  /api\.assistantFetchUrl\(directVideoUrl\)/,
  'Directly pasted short-video links must fetch public metadata before model analysis',
)
assert.match(
  chat,
  /formatVideoLinkAnalysisRequest\(directVideoUrl,\s*fetchedContent\)/,
  'Directly pasted short-video links must pass fetched metadata into the video analysis prompt',
)
assert.match(
  chat,
  /formatShortVideoWorkflowInstructions\(platform\)/,
  'Directly pasted short-video links must use the same short-video workflow instructions as the plus menu',
)
assert.match(
  chat,
  /formatVideoLinkAnalysisRequest\(url,\s*fetchedContent\)/,
  'Plus-menu short-video links must pass fetched metadata into the video analysis prompt',
)
assert.doesNotMatch(
  chat,
  /用户已打开(?:抖音|快手|小红书|桌面|客户端)|用户已经打开(?:抖音|快手|小红书|桌面|客户端)|继承用户桌面|后台浏览器没有继承/,
  'Hermes video-link flow must not assume the user opened a desktop app',
)
assert.doesNotMatch(chat, /sk-[A-Za-z0-9_-]{20,}/, 'Hermes video-link flow must not contain real API keys')

console.log('HERMES_VIDEO_LINK_PUBLIC_METADATA_FLOW: PASS')
