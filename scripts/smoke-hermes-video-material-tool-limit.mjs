import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
const devApi = readFileSync(resolve(root, 'scripts/dev-api.js'), 'utf8')

const requiredSharedPhrases = [
  'materialLevel=metadata_or_tool_extracted',
  'repoBundledAvailable=true',
  'videoToolchainPartial=false',
  'systemPathAvailable=ignored_for_portable',
  'portableReady=true',
  'packagedRuntimeAvailable=true',
  'fullVideoParsingAvailable=false',
  'cookieOrLoginMayBeRequired=true',
  'ffmpegAvailable=true',
  'ffprobeAvailable=true',
  'videoDownloaderAvailable=true',
  'mediaProcessingAvailable=true',
  'videoDownloadAvailable=conditional',
  'asrAvailable=true',
  'subtitleExtractorAvailable=conditional',
  'frameOcrAvailable=false',
  'transcriptAvailable=false',
  'missingTools=platform_cookie_or_login,download_pipeline,subtitle_pipeline,video_frame_pipeline',
  'Portable toolchain status: bundled yt-dlp, ffmpeg, ffprobe, whisper.cpp CLI, and ggml-tiny model are available',
  'Runtime code must prefer these bundled paths over system PATH or Python-installed launchers',
  'bundled tools do not guarantee every Douyin/Xiaohongshu/Kuaishou link can be parsed',
  'fresh cookies',
]

for (const phrase of requiredSharedPhrases) {
  assert.ok(chat.includes(phrase), `Missing Hermes video material phrase: ${phrase}`)
  assert.ok(devApi.includes(phrase), `Missing dev-api video material phrase: ${phrase}`)
}

const completenessStart = chat.indexOf('function formatVideoMaterialCompletenessRules')
const appendStart = chat.indexOf('function appendUserSupplement')
assert.ok(completenessStart >= 0, 'Video material completeness function must exist')
assert.ok(appendStart > completenessStart, 'Video material completeness block must be bounded')
const completenessBlock = chat.slice(completenessStart, appendStart)

assert.ok(completenessBlock.includes('transcriptAvailable=false'), 'A transcript is still false until one is actually extracted')
assert.ok(completenessBlock.includes('frameOcrAvailable=false'), 'Frame OCR is still false until a frame OCR pipeline exists')
assert.ok(completenessBlock.includes('fullVideoParsingAvailable=false'), 'Full video parsing must not be overclaimed')
assert.ok(completenessBlock.includes('videoDownloadAvailable=conditional'), 'Video download must be conditional on platform access')
assert.ok(completenessBlock.includes('cookieOrLoginMayBeRequired=true'), 'Cookie/login limits must be explicit')

assert.doesNotMatch(chat + devApi, /sk-[A-Za-z0-9_-]{20,}/, 'Video material tool-limit fix must not contain API keys')
assert.doesNotMatch(
  completenessBlock,
  /OpenClaw|ClaudeCode|build-desktop-client/,
  'Video material completeness rules must stay scoped to Hermes video material prompts',
)

console.log('HERMES_VIDEO_MATERIAL_TOOL_LIMIT: PASS')
