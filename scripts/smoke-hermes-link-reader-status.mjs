import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

assert.match(chat, /function\s+classifyHermesLinkFetchStatus\s*\(/, 'Hermes link reader must classify fetch results')
assert.match(chat, /link_fetch_success/, 'Hermes link reader must expose link_fetch_success')
assert.match(chat, /link_fetch_failed/, 'Hermes link reader must expose link_fetch_failed')
assert.match(chat, /link_fetch_timeout/, 'Hermes link reader must expose link_fetch_timeout')
assert.match(chat, /model_config_missing/, 'Hermes link reader must expose model_config_missing')
assert.match(chat, /gateway_unavailable/, 'Hermes link reader must expose gateway_unavailable')

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
  /linkError\s*=\s*fetchStatus\.message/,
  'Fetch failure must be surfaced in the link menu'
)
assert.match(
  chat,
  /Hermes 模型配置不可用，请先配置 MiniMax API Key/,
  'Model config failures must be reported as model-layer failures'
)
assert.match(
  chat,
  /当前版本不会直接解析视频正文、画面或字幕/,
  'Social/video link fallback must not claim full video parsing'
)
assert.match(
  chat,
  /当前不是完整视频解析器，已交给 Hermes 做文本化分析/,
  'Social/video link toast must clearly describe fallback behavior'
)
assert.match(
  chat,
  /api\.assistantFetchUrl\(url\)/,
  'Ordinary web links must still use assistantFetchUrl'
)
assert.doesNotMatch(chat, /OpenClaw 模型配置未完成|Claude relay 未配置/, 'Hermes link reader prompt must not mention other agents')
assert.doesNotMatch(chat, /sk-[A-Za-z0-9_-]{20,}/, 'Smoke must not allow real API keys in Hermes chat source')

console.log('HERMES_LINK_READER_STATUS: PASS')
