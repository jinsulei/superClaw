import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
const devApi = readFileSync(resolve(root, 'scripts/dev-api.js'), 'utf8')

const repoPaths = {
  ffmpeg: [
    'src-tauri/resources/bin/ffmpeg.exe',
    'src-tauri/resources/runtime/ffmpeg/ffmpeg.exe',
    'src-tauri/resources/runtime/video-tools/ffmpeg.exe',
    'src-tauri/resources/runtime/video-tools/ffmpeg/bin/ffmpeg.exe',
  ],
  ffprobe: [
    'src-tauri/resources/bin/ffprobe.exe',
    'src-tauri/resources/runtime/ffmpeg/ffprobe.exe',
    'src-tauri/resources/runtime/video-tools/ffprobe.exe',
    'src-tauri/resources/runtime/video-tools/ffmpeg/bin/ffprobe.exe',
  ],
  ytdlp: [
    'src-tauri/resources/bin/yt-dlp.exe',
    'src-tauri/resources/runtime/video-tools/yt-dlp.exe',
    'src-tauri/resources/runtime/ytdlp/yt-dlp.exe',
  ],
  asr: [
    'src-tauri/resources/runtime/asr',
    'src-tauri/resources/runtime/whisper',
    'src-tauri/resources/runtime/video-tools/whisper.exe',
  ],
}

function anyRepoPath(paths) {
  return paths.some(p => existsSync(resolve(root, p)))
}

function hasCommand(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5000 })
  return result.status === 0
}

const repoBundled = {
  ffmpeg: anyRepoPath(repoPaths.ffmpeg),
  ffprobe: anyRepoPath(repoPaths.ffprobe),
  ytdlp: anyRepoPath(repoPaths.ytdlp),
  asr: anyRepoPath(repoPaths.asr),
}

const systemPath = {
  ffmpeg: hasCommand('ffmpeg', ['-version']),
  ffprobe: hasCommand('ffprobe', ['-version']),
  ytdlp: hasCommand('yt-dlp', ['--version']),
  whisper: hasCommand('whisper', ['--help']),
}

const ocrRuntime = {
  runner: existsSync(resolve(root, 'src-tauri/resources/runtime/ocr/ocr-runner.cjs')),
  tesseractJs: existsSync(resolve(root, 'src-tauri/resources/runtime/ocr/node_modules/tesseract.js/package.json')),
  tesseractCore: existsSync(resolve(root, 'src-tauri/resources/runtime/ocr/node_modules/tesseract.js-core/package.json')),
  wasm: existsSync(resolve(root, 'src-tauri/resources/runtime/ocr/node_modules/tesseract.js-core/tesseract-core.wasm')),
}

assert.equal(repoBundled.ffmpeg, true, 'Current branch should include bundled ffmpeg')
assert.equal(repoBundled.ffprobe, true, 'Current branch should include bundled ffprobe')
assert.equal(repoBundled.ytdlp, false, 'Current branch must not claim bundled yt-dlp')
assert.equal(repoBundled.asr, false, 'Current branch must not claim bundled ASR')

assert.ok(
  typeof systemPath.ffmpeg === 'boolean' && typeof systemPath.ytdlp === 'boolean',
  'System PATH tool detection must be separated from portable readiness',
)

const requiredPhrases = [
  'repoBundledAvailable=partial',
  'ffmpegAvailable=true',
  'ffprobeAvailable=true',
  'systemPathAvailable=ignored_for_portable',
  'portableReady=false',
  'packagedRuntimeAvailable=false',
  'fullVideoParsingAvailable=false',
  'transcriptAvailable=false',
  'frameOcrAvailable=false',
  'missingTools=video_downloader,asr,subtitle_extractor,video_frame_pipeline',
  'videoToolchainPartial=true',
  'mediaProcessingAvailable=true',
  'videoDownloadAvailable=false',
  '系统 PATH',
  '不能视为 U 盘绿色版可用',
  '不能单独生成视频逐字稿、字幕、音频转写',
  '短视频/社媒链接必须判定为 metadata_only',
]

for (const phrase of requiredPhrases) {
  assert.ok(chat.includes(phrase), `Missing portable toolchain phrase in Hermes chat: ${phrase}`)
  assert.ok(devApi.includes(phrase), `Missing portable toolchain phrase in dev-api fallback: ${phrase}`)
}

assert.ok(ocrRuntime.runner, 'Shared OCR runner should exist as source/runtime skeleton')
assert.equal(
  ocrRuntime.tesseractJs && ocrRuntime.tesseractCore && ocrRuntime.wasm,
  false,
  'This branch must not vendor OCR runtime node_modules; that belongs to the OCR dependency branch',
)

assert.doesNotMatch(chat + devApi, /sk-[A-Za-z0-9_-]{20,}/, 'Video toolchain readiness must not contain API keys')

console.log('VIDEO_TOOLCHAIN_PORTABLE_READINESS: PASS', {
  repoBundled,
  systemPath,
  ocrRuntime,
  portableReady: false,
  videoToolchainPartial: true,
  mediaProcessingAvailable: true,
  videoDownloadAvailable: false,
  materialLevel: 'metadata_only',
})
