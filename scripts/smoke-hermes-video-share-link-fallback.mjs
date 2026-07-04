import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /function\s+formatVideoShareFallbackSections\s*\(/,
  'Hermes must have a unified video share fallback formatter',
)

const requiredPhrases = [
  'materialLevel=metadata_only',
  'webpageTextAvailable=',
  'shareTextAvailable=',
  'transcriptAvailable=false',
  'subtitleAvailable=false',
  'audioTranscriptAvailable=false',
  'frameOcrAvailable=false',
  'fullVideoParsingAvailable=false',
  '如果抓取失败、超时、被反爬、跳登录页或只有短链，禁止直接输出“任务失败”',
  '必须进入 metadata_only / fallback 分析',
  '如果用户粘贴了分享文案、标题、多行描述或短视频平台口令',
  '如果用户只给短链且没有标题/正文',
  '输出结构必须包含：1. 当前素材状态；2. 已能基于什么分析；3. 有限分析；4. 限制说明；5. 主动下一步。',
  '选题方向、可能内容结构、受众/场景判断、金句/重点推断、有限时间轴推断、可仿写方向',
  '是否要基于当前公开字段仿写、提炼卖点/金句、改成直播口播',
  '补充逐字稿/字幕/截图/口播文本后继续完整拆解',
  '禁止声称已经完整解析视频',
]

for (const phrase of requiredPhrases) {
  assert.ok(chat.includes(phrase), `Missing video share fallback phrase: ${phrase}`)
}

assert.match(
  chat,
  /formatVideoLinkAnalysisRequest\(url,\s*fetchedContent,\s*supplement\)/,
  'Plus link reader must pass the user share text into the video fallback prompt',
)

assert.match(
  chat,
  /formatVideoLinkAnalysisRequest\(directVideoUrl,\s*fetchedContent,\s*supplement\)/,
  'Direct pasted video links must pass surrounding share text into the video fallback prompt',
)

assert.match(
  chat,
  /formatVideoLinkAnalysisRequest\(url,\s*`抓取失败: \$\{message\}`,\s*supplement\)/,
  'Plus link reader errors must still route to video fallback analysis',
)

for (const domain of ['douyin.com', 'xiaohongshu.com', 'xhslink.com', 'kuaishou.com']) {
  assert.ok(chat.includes(domain), `Video share classifier must include ${domain}`)
}

assert.match(
  chat,
  /await store\.sendMessage\(text,\s*\{[\s\S]*modelContent: sendModelContent \|\| undefined,[\s\S]*instructions: sendInstructions \|\| null/,
  'Direct pasted video links must still go through the normal Hermes send path with history preserved by the store',
)

assert.ok(chat.includes('禁止声称已经完整解析视频'), 'Fallback must forbid overclaiming full video parsing')
assert.doesNotMatch(chat, /OpenClaw配置缺失|Claude relay 未配置|build-desktop-client/)
assert.doesNotMatch(chat, /sk-[A-Za-z0-9_-]{20,}/)

console.log('HERMES_VIDEO_SHARE_LINK_FALLBACK: PASS')
