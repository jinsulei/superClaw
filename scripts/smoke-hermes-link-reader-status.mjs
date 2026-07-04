import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

assert.match(chat, /function\s+classifyHermesLinkFetchStatus\s*\(/, 'Hermes link reader must classify fetch results')
assert.match(chat, /const\s+HERMES_LINK_FETCH_TIMEOUT_MS\s*=\s*15000/, 'Hermes link reader must cap fetch at 15 seconds')
assert.match(chat, /function\s+withHermesLinkTimeout\s*\(/, 'Hermes link reader must wrap slow fetches with timeout')
assert.match(chat, /async\s+function\s+assistantFetchUrlWithTimeout\s*\(/, 'Hermes link reader must use a timeout-aware fetch helper')
assert.match(chat, /function\s+formatLinkFetchLimitedReply\s*\(/, 'Hermes link reader must produce a final limited reply on fetch failure')
assert.match(chat, /async\s+function\s+buildHermesVideoLinkAnalysisPayload\s*\(/, 'Hermes video links must share a payload builder')
assert.match(chat, /link_fetch_success/, 'Hermes link reader must expose link_fetch_success')
assert.match(chat, /link_fetch_failed/, 'Hermes link reader must expose link_fetch_failed')
assert.match(chat, /link_fetch_timeout/, 'Hermes link reader must expose link_fetch_timeout')

assert.match(
  chat,
  /网页抓取失败：抓取超时，请稍后重试或换一个链接/,
  'Fetch timeout must be shown as a fetch-layer failure'
)
assert.match(
  chat,
  /if\s*\(\s*fetchStatus\.kind\s*!==\s*['"]link_fetch_success['"]\s*\)/,
  'Fetch failure text must not be treated as successfully read content'
)
assert.match(
  chat,
  /store\.pushLocalUser\(visibleText\)[\s\S]*store\.pushLocalAssistant\(formatLinkFetchLimitedReply\(url,\s*fetchStatus\)\)/,
  'Fetch failure must finalize with a visible local assistant reply'
)
assert.match(
  chat,
  /toast\('链接读取失败或超时，已生成有限分析提示。',\s*'warning'\)/,
  'Fetch failure must not leave the link reader stuck in processing'
)
assert.match(
  chat,
  /当前版本不会直接解析视频正文、画面或字幕/,
  'Social/video link fallback must not claim full video parsing'
)
assert.match(
  chat,
  /materialLevel:\s*\$\{materialLevel\}/,
  'Social/video prompt must expose materialLevel'
)
assert.match(
  chat,
  /transcriptAvailable: false[\s\S]*subtitleAvailable: false[\s\S]*audioTranscriptAvailable: false[\s\S]*frameOcrAvailable: false/,
  'Social/video prompt must expose missing transcript, subtitle, ASR and frame OCR'
)
assert.match(
  chat,
  /metadata_only 有限分析/,
  'Social/video link toast must clearly describe fallback behavior'
)
assert.match(
  chat,
  /assistantFetchUrlWithTimeout\(url\)/,
  'Ordinary web links must still use assistantFetchUrl'
)
assert.match(
  chat,
  /fetchedContent\s*=\s*await\s+assistantFetchUrlWithTimeout\(url\)/,
  'Video/social links must also try assistantFetchUrl before fallback analysis'
)
assert.match(
  chat,
  /const\s+directUrl\s*=\s*extractFirstHttpUrl\(text\)[\s\S]*directUrl\s*&&\s*isVideoShareUrl\(directUrl\)/,
  'Direct pasted video/social links must enter the same fallback analysis route'
)
assert.match(
  chat,
  /modelContent:\s*payload\.modelContent[\s\S]*instructions:\s*\[[\s\S]*payload\.instructions/,
  'Direct video/social link route must pass fetched material into Hermes model content'
)
assert.doesNotMatch(chat, /OpenClaw 模型配置未完成|Claude relay 未配置/, 'Hermes link reader prompt must not mention other agents')
assert.doesNotMatch(chat, /sk-[A-Za-z0-9_-]{20,}/, 'Smoke must not allow real API keys in Hermes chat source')

console.log('HERMES_LINK_READER_TIMEOUT_FINALIZES: PASS')
console.log('HERMES_LINK_READER_FETCH_FAILS_TO_METADATA_ONLY: PASS')
console.log('HERMES_VIDEO_LINK_NO_FAKE_FULL_ANALYSIS: PASS')
console.log('HERMES_LINK_READER_STATUS: PASS')
