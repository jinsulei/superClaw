import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const chat = readFileSync(resolve(process.cwd(), 'src/engines/hermes/pages/chat.js'), 'utf8')
const devApi = readFileSync(resolve(process.cwd(), 'scripts/dev-api.js'), 'utf8')

assert.match(devApi, /function\s+isShortVideoShareUrl\s*\(/, 'dev-api must identify short video/social links')
assert.match(devApi, /douyin\.com[\s\S]*iesdouyin\.com[\s\S]*kuaishou\.com[\s\S]*xiaohongshu\.com[\s\S]*xhslink\.com/, 'dev-api must include Douyin/Kuaishou/Xiaohongshu domains')
assert.match(devApi, /function\s+requestTextWithRedirects\s*\(/, 'dev-api must support redirect-following fetches')
assert.match(devApi, /const\s+redirected\s*=\s*new URL\(location,\s*nextUrl\)\.toString\(\)/, 'short links must follow 301/302 Location headers')
assert.match(devApi, /\[短视频页面可读取信息\][\s\S]*最终链接:[\s\S]*读取方式: 页面元信息兜底/, 'video fetch must return readable metadata fallback')

assert.match(chat, /function\s+isVideoShareUrl\s*\(/, 'Hermes chat must identify video/social links')
assert.match(chat, /function\s+formatVideoLinkAnalysisRequest\s*\(/, 'Hermes chat must format video link analysis requests')
assert.match(chat, /async\s+function\s+buildHermesVideoLinkAnalysisPayload\s*\(/, 'Hermes chat must build a shared video-link payload')
assert.match(chat, /fetchedContent\s*=\s*await\s+assistantFetchUrlWithTimeout\(url\)/, 'video link chain must first try assistantFetchUrl with a timeout')
assert.match(chat, /fetchStatus\.kind\s*===\s*['"]link_fetch_success['"][\s\S]*metadata_only 有限分析/, 'video link chain must distinguish success from metadata_only fallback')
assert.match(chat, /const\s+directUrl\s*=\s*extractFirstHttpUrl\(text\)[\s\S]*isVideoShareUrl\(directUrl\)[\s\S]*buildHermesVideoLinkAnalysisPayload\(directUrl/, 'direct pasted video links must use the shared video-link payload')
assert.match(chat, /el\.querySelector\('#hm-chat-link-read'\)[\s\S]*handleReadLink/, '+ link reader button must still call handleReadLink')
assert.match(chat, /handleReadLink[\s\S]*buildHermesVideoLinkAnalysisPayload\(url/, '+ link reader video links must use the shared video-link payload')
assert.doesNotMatch(chat, /已完整解析视频|已获取视频逐字稿|已完成字幕提取|已完成音频转写|已完成视频帧 OCR/, 'Hermes must not claim full video parsing')

console.log('HERMES_VIDEO_LINK_NO_FAKE_FULL_ANALYSIS: PASS')
console.log('HERMES_VIDEO_LINK_READER_CHAIN: PASS')
