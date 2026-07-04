import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  classifyYtDlpError,
  formatVideoMaterialPackageForHermes,
} from './lib/video-link-analyzer.mjs'

const root = process.cwd()
const devApi = readFileSync(resolve(root, 'scripts/dev-api.js'), 'utf8')
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

assert.equal(
  classifyYtDlpError('ERROR: [Douyin] Fresh cookies are needed'),
  'cookie_required',
  'yt-dlp fresh-cookie errors must become cookie_required',
)
assert.equal(
  classifyYtDlpError('HTTP Error 403: Forbidden. Sign in to confirm your age'),
  'cookie_required',
  'login/403 errors must become cookie_required',
)

const block = formatVideoMaterialPackageForHermes({
  ok: false,
  kind: 'cookie_required',
  platform: 'douyin',
  url: 'https://v.douyin.com/example/',
  materialLevel: 'metadata_only',
  cookiesConfigured: false,
  downloaderAvailable: true,
  transcriptAvailable: false,
  subtitleAvailable: false,
  audioTranscriptAvailable: false,
  frameOcrAvailable: false,
  fullVideoParsingAvailable: false,
  canLimitedAnalyze: true,
  metadata: {},
  message: 'Fresh cookies are needed',
})

assert.match(block, /\[VIDEO_MATERIAL_PACKAGE\]/, 'material package must be explicit')
assert.match(block, /failureKind=cookie_required/, 'cookie errors must be visible to Hermes')
assert.match(block, /cookieRequired=true/, 'cookie-required state must be explicit')
assert.match(block, /transcriptAvailable=false/, 'must not claim transcript')
assert.match(block, /fullVideoParsingAvailable=false/, 'must not claim full parsing')
assert.match(block, /canLimitedAnalyze=true/, 'Hermes must still be able to do limited analysis')
assert.doesNotMatch(block, /sk-[A-Za-z0-9_-]{20,}|Cookie:\s*\S+/i, 'package must not expose secrets')

assert.match(devApi, /analyzeVideoLink\(rawUrl/, 'dev-api must call bundled video analyzer for video links')
assert.match(devApi, /formatVideoMaterialPackageForHermes\(material\)/, 'dev-api must return a Hermes material package')
assert.match(chat, /VIDEO_MATERIAL_PACKAGE/, 'Hermes chat must recognize video material packages')
assert.match(chat, /social_video_link_fallback/, 'cookie-required packages should enter fallback analysis, not hard fail')

console.log('VIDEO_COOKIE_REQUIRED_HANDLING: PASS')
