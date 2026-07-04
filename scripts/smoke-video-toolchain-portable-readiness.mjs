import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  buildVideoToolchainEnv,
  getVideoToolchainStatus,
} from './lib/video-toolchain-runtime.mjs'

const root = process.cwd()
const status = getVideoToolchainStatus(root)
const env = buildVideoToolchainEnv(root)
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
const devApi = readFileSync(resolve(root, 'scripts/dev-api.js'), 'utf8')

function runExe(file, args) {
  return spawnSync(file, args, { encoding: 'utf8', timeout: 15000, env })
}

assert.equal(status.available.ytDlp, true, 'bundled yt-dlp must exist')
assert.equal(status.available.ffmpeg, true, 'bundled ffmpeg must exist')
assert.equal(status.available.ffprobe, true, 'bundled ffprobe must exist')
assert.equal(status.available.whisperCli, true, 'bundled whisper.cpp CLI must exist')
assert.equal(status.available.whisperModel, true, 'bundled whisper.cpp tiny model must exist')

assert.equal(runExe(status.paths.ytDlp, ['--version']).status, 0, 'bundled yt-dlp must execute')
assert.equal(runExe(status.paths.ffmpeg, ['-version']).status, 0, 'bundled ffmpeg must execute')
assert.equal(runExe(status.paths.ffprobe, ['-version']).status, 0, 'bundled ffprobe must execute')
assert.equal(runExe(status.paths.whisperCli, ['--help']).status, 0, 'bundled whisper.cpp CLI must execute')

assert.equal(status.videoDownloaderAvailable, true, 'video downloader is bundled')
assert.equal(status.mediaProcessingAvailable, true, 'media processing tools are bundled')
assert.equal(status.asrAvailable, true, 'ASR base runtime is bundled')
assert.equal(status.subtitleExtractorAvailable, true, 'subtitle extraction via yt-dlp is available when platform exposes subtitles')
assert.equal(status.portableReady, true, 'portable base video tools should be ready')
assert.equal(status.fullVideoParsingAvailable, false, 'full video parsing must remain false until runtime pipeline/cookies/frame OCR are implemented')

const requiredPhrases = [
  'repoBundledAvailable=true',
  'portableReady=true',
  'packagedRuntimeAvailable=true',
  'ffmpegAvailable=true',
  'ffprobeAvailable=true',
  'videoDownloaderAvailable=true',
  'videoDownloadAvailable=conditional',
  'asrAvailable=true',
  'subtitleExtractorAvailable=conditional',
  'fullVideoParsingAvailable=false',
  'cookieOrLoginMayBeRequired=true',
  'frameOcrAvailable=false',
]

for (const phrase of requiredPhrases) {
  assert.ok(chat.includes(phrase), `Missing portable video phrase in Hermes chat: ${phrase}`)
  assert.ok(devApi.includes(phrase), `Missing portable video phrase in dev-api fallback: ${phrase}`)
}

assert.doesNotMatch(chat + devApi, /sk-[A-Za-z0-9_-]{20,}/, 'Video toolchain readiness must not contain API keys')

console.log('VIDEO_TOOLCHAIN_PORTABLE_READINESS: PASS', {
  available: status.available,
  paths: status.paths,
  portableReady: status.portableReady,
  fullVideoParsingAvailable: status.fullVideoParsingAvailable,
})
