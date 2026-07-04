import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
const devApi = readFileSync(resolve(root, 'scripts/dev-api.js'), 'utf8')

const requiredChatPhrases = [
  'materialLevel=metadata_only',
  'repoBundledAvailable=partial',
  'videoToolchainPartial=true',
  'systemPathAvailable=ignored_for_portable',
  'portableReady=false',
  'packagedRuntimeAvailable=false',
  'fullVideoParsingAvailable=false',
  'ocrRuntimeAvailable=false',
  'ffmpegAvailable=true',
  'ffprobeAvailable=true',
  'mediaProcessingAvailable=true',
  'videoDownloadAvailable=false',
  'videoDownloaderAvailable=false',
  'asrAvailable=false',
  'subtitleExtractorAvailable=false',
  'frameOcrAvailable=false',
  'transcriptAvailable=false',
  'missingTools=video_downloader,asr,subtitle_extractor,video_frame_pipeline',
  'OCR runtime 只能识别已取得的图片/截图文字',
  '不能视为 U 盘绿色版可用',
  '不能单独生成视频逐字稿、字幕、音频转写或视频分镜',
  '缺 yt-dlp/视频下载器、ASR、字幕提取器和视频抽帧流水线时',
  '短视频/社媒链接必须判定为 metadata_only',
  '当前未内置完整视频解析工具链',
  '仍缺 yt-dlp/视频下载器、ASR、字幕提取器、视频抽帧与视频帧 OCR',
  '有限时间轴推断',
  '金句/重点推断',
  '直播口播改写',
  '主动反问用户是否要基于现有公开字段仿写一版',
  '提炼金句/卖点',
  '改成直播间口播',
  '补充逐字稿/截图后继续完整拆解',
  '基于公开字段推断',
  '不能写成真实逐字稿或真实时间戳',
  '已经完成视频 OCR',
  '已经拿到完整分镜',
  '已经完成完整视频拆解',
]

for (const phrase of requiredChatPhrases) {
  assert.ok(chat.includes(phrase), `Missing Hermes video material tool-limit phrase: ${phrase}`)
}

const completenessStart = chat.indexOf('function formatVideoMaterialCompletenessRules')
const appendStart = chat.indexOf('function appendUserSupplement')
assert.ok(completenessStart >= 0, 'Video material completeness function must exist')
assert.ok(appendStart > completenessStart, 'Video material completeness block must be bounded')
const completenessBlock = chat.slice(completenessStart, appendStart)

assert.ok(completenessBlock.includes('materialLevel=metadata_only'), 'Video/social material status must stay metadata-only')
assert.ok(completenessBlock.includes('transcriptAvailable=false'), 'Video/social material must not claim transcript availability')
assert.ok(completenessBlock.includes('frameOcrAvailable=false'), 'Video/social material must not claim frame OCR availability')
assert.match(
  completenessBlock,
  /missingTools=video_downloader,asr,subtitle_extractor,video_frame_pipeline/,
  'Missing video tools must be explicitly listed',
)
assert.match(
  completenessBlock,
  /OCR runtime[\s\S]*图片\/截图文字[\s\S]*不能单独生成视频逐字稿/,
  'OCR runtime must be separated from full video parsing capability',
)
assert.doesNotMatch(
  completenessBlock,
  /已完整解析视频|已读取视频正文|已获取逐字稿|已完成完整视频拆解/,
  'Tool-limit rules must not overclaim full video parsing',
)

const requiredDevApiPhrases = [
  'materialLevel=metadata_only',
  'repoBundledAvailable=partial',
  'videoToolchainPartial=true',
  'systemPathAvailable=ignored_for_portable',
  'portableReady=false',
  'packagedRuntimeAvailable=false',
  'fullVideoParsingAvailable=false',
  'ffmpegAvailable=true',
  'ffprobeAvailable=true',
  'mediaProcessingAvailable=true',
  'videoDownloadAvailable=false',
  'transcriptAvailable=false',
  'frameOcrAvailable=false',
  'missingTools=video_downloader,asr,subtitle_extractor,video_frame_pipeline',
  '这不等于完整解析视频',
  '即使共享 OCR runtime 已补齐',
  '不能单独生成视频逐字稿、字幕、音频转写、完整分镜或视频帧 OCR',
  '当前未内置完整视频解析工具链',
  '仍缺 yt-dlp/视频下载器、ASR、字幕提取器、视频抽帧与视频帧 OCR',
  '有限时间轴推断',
  '金句/重点推断',
  '直播口播改写建议',
  '主动反问用户是否要基于现有公开字段仿写一版',
]

for (const phrase of requiredDevApiPhrases) {
  assert.ok(devApi.includes(phrase), `Missing Hermes backend video material tool-limit phrase: ${phrase}`)
}

assert.doesNotMatch(chat + devApi, /sk-[A-Za-z0-9_-]{20,}/, 'Video material tool-limit fix must not contain API keys')
assert.doesNotMatch(
  completenessBlock,
  /OpenClaw配置缺失|ClaudeCode|build-desktop-client/,
  'Video material completeness rules must stay scoped to Hermes video material prompts',
)

console.log('HERMES_VIDEO_MATERIAL_TOOL_LIMIT: PASS')
