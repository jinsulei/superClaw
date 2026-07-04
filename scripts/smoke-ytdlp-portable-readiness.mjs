import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  buildVideoToolchainEnv,
  getVideoToolchainStatus,
} from './lib/video-toolchain-runtime.mjs'

const status = getVideoToolchainStatus(process.cwd())
const env = buildVideoToolchainEnv(process.cwd(), { PATH: '', Path: '' })

const version = spawnSync(status.paths.ytDlp, ['--version'], {
  encoding: 'utf8',
  timeout: 15000,
  env,
})

assert.equal(status.available.ytDlp, true, 'repo bundled yt-dlp must exist')
assert.equal(version.status, 0, 'repo bundled yt-dlp must execute without system PATH')
assert.match((version.stdout || '').trim(), /^\d{4}\.\d{2}\.\d{2}$/, 'yt-dlp version should be date-based')

console.log('YTDLP_PORTABLE_READINESS: PASS', {
  ytDlp: status.paths.ytDlp,
  version: (version.stdout || '').trim(),
})
