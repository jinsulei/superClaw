import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildTranscriptPipelinePlan,
  formatVideoMaterialPackageForHermes,
  runVideoDownloadTranscriptPipeline,
} from './lib/video-link-analyzer.mjs'
import { getVideoToolchainStatus } from './lib/video-toolchain-runtime.mjs'

const root = process.cwd()
const status = getVideoToolchainStatus(root)
const plan = buildTranscriptPipelinePlan({ root })
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

assert.equal(status.available.ffmpeg, true, 'ffmpeg must be bundled for audio extraction')
assert.equal(status.available.ffprobe, true, 'ffprobe must be bundled for media probing')
assert.equal(status.available.whisperCli, true, 'whisper.cpp CLI must be bundled for ASR')
assert.equal(status.available.whisperModel, true, 'whisper model must be bundled for ASR')
assert.equal(plan.ready, true, 'transcript pipeline base tools should be ready')
assert.equal(plan.requiresDownloadedMedia, true, 'ASR still requires an already downloaded media file')
assert.equal(plan.canRunAfterDownload, true, 'ASR can run only after media download succeeds')
assert.match(plan.tempRoot, /src-tauri[\\/]resources[\\/]data[\\/]video-tools[\\/]tmp$/, 'pipeline temp files must live in ignored runtime data')
assert.equal(typeof runVideoDownloadTranscriptPipeline, 'function', 'real download/transcript pipeline must be exported')

const material = formatVideoMaterialPackageForHermes({
  ok: true,
  kind: 'metadata_extracted',
  platform: 'douyin',
  url: 'https://v.douyin.com/example/',
  materialLevel: 'metadata_only',
  cookiesConfigured: true,
  downloaderAvailable: true,
  transcriptAvailable: false,
  subtitleAvailable: false,
  audioTranscriptAvailable: false,
  frameOcrAvailable: false,
  fullVideoParsingAvailable: false,
  canLimitedAnalyze: true,
  metadata: { title: 'sample title' },
  message: 'metadata extracted',
})

assert.match(material, /materialLevel=metadata_only/, 'metadata-only material must stay explicit')
assert.match(material, /audioTranscriptAvailable=false/, 'metadata-only probe must not claim audio transcript')
assert.match(material, /frameOcrAvailable=false/, 'metadata-only probe must not claim frame OCR')
assert.match(chat, /audioTranscriptAvailable=false/, 'Hermes prompt must not overclaim transcript availability')
assert.match(chat, /frameOcrAvailable=false/, 'Hermes prompt must not overclaim frame OCR availability')

console.log('VIDEO_TRANSCRIPT_PIPELINE: PASS', plan)
