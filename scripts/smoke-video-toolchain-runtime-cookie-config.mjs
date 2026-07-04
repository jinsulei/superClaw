import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  detectVideoPlatform,
  getVideoCookiePaths,
  resolveVideoCookiesFile,
} from './lib/video-toolchain-runtime.mjs'

const root = process.cwd()
const runtime = readFileSync(resolve(root, 'scripts/lib/video-toolchain-runtime.mjs'), 'utf8')
const analyzer = readFileSync(resolve(root, 'scripts/lib/video-link-analyzer.mjs'), 'utf8')

assert.equal(detectVideoPlatform('https://v.douyin.com/FKohEovsEfA/'), 'douyin')
assert.equal(detectVideoPlatform('https://www.xiaohongshu.com/explore/abc'), 'xiaohongshu')
assert.equal(detectVideoPlatform('https://v.kuaishou.com/example'), 'kuaishou')

const paths = getVideoCookiePaths(root, 'douyin', {})
assert.ok(paths.platform.endsWith('src-tauri\\resources\\data\\video-tools\\cookies\\douyin.cookies.txt') || paths.platform.endsWith('src-tauri/resources/data/video-tools/cookies/douyin.cookies.txt'))
assert.equal(resolveVideoCookiesFile({ root, platform: 'douyin', env: {} }), null, 'missing cookies should stay null')

const ignoredPaths = [
  'src-tauri/resources/data/video-tools/cookies/douyin.cookies.txt',
  'src-tauri/resources/data/video-tools/cookies/xiaohongshu.cookies.txt',
  'src-tauri/resources/data/video-tools/cookies/kuaishou.cookies.txt',
  'src-tauri/resources/data/video-tools/cookies/default.cookies.txt',
  'src-tauri/resources/data/video-tools/tmp/sample.tmp',
]

for (const file of ignoredPaths) {
  const res = spawnSync('git', ['check-ignore', '-v', file], { cwd: root, encoding: 'utf8' })
  assert.equal(res.status, 0, `${file} must be ignored by git`)
}

assert.match(runtime, /VIDEO_TOOLCHAIN_COOKIES_FILE/, 'runtime must support explicit local cookie path')
assert.match(analyzer, /--cookies/, 'yt-dlp invocation must accept an ignored cookies file')
assert.doesNotMatch(runtime + analyzer, /Netscape HTTP Cookie File[\s\S]*\tTRUE\t/i, 'source must not contain cookie file contents')
assert.doesNotMatch(runtime + analyzer, /sk-[A-Za-z0-9_-]{20,}/, 'source must not contain API keys')

console.log('VIDEO_TOOLCHAIN_RUNTIME_COOKIE_CONFIG: PASS')
