import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  buildVideoToolchainEnv,
  getVideoToolchainStatus,
} from './lib/video-toolchain-runtime.mjs'

const status = getVideoToolchainStatus(process.cwd())
const env = buildVideoToolchainEnv(process.cwd(), { PATH: '', Path: '' })

function run(file, args) {
  return spawnSync(file, args, { encoding: 'utf8', timeout: 15000, env })
}

assert.equal(status.portableReady, true, 'bundled video toolchain base runtime must be portable-ready')
assert.equal(run(status.paths.ytDlp, ['--version']).status, 0, 'yt-dlp must not rely on system PATH')
assert.equal(run(status.paths.ffmpeg, ['-version']).status, 0, 'ffmpeg must not rely on system PATH')
assert.equal(run(status.paths.ffprobe, ['-version']).status, 0, 'ffprobe must not rely on system PATH')
assert.equal(run(status.paths.whisperCli, ['--help']).status, 0, 'whisper.cpp CLI must not rely on Python system PATH')
assert.ok(status.paths.whisperModel.endsWith('ggml-tiny.bin'), 'bundled whisper model must be the repo-local model')

console.log('VIDEO_TOOLCHAIN_BUNDLED_RUNTIME: PASS', {
  portableReady: status.portableReady,
  videoDownloaderAvailable: status.videoDownloaderAvailable,
  mediaProcessingAvailable: status.mediaProcessingAvailable,
  asrAvailable: status.asrAvailable,
  fullVideoParsingAvailable: status.fullVideoParsingAvailable,
})
