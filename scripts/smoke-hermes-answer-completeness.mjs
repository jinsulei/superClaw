import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /function\s+formatVideoMaterialCompletenessRules\s*\(/,
  'Hermes must centralize material completeness rules for video/social links',
)

const requiredPhrases = [
  'MATERIAL_COMPLETENESS_REQUIREMENT',
  'materialLevel=metadata_only',
  'transcriptAvailable=false',
  'ocrAvailable=false',
  'subtitleAvailable=false',
  'audioTranscriptAvailable=false',
  '不能只回一句“只能拿到公开字段”',
  '当前不是模型不会回答，而是素材不足',
  '已获取素材',
  '标题、作者、描述、话题、互动数据、热门评论、页面公开字段',
  '未获取素材',
  '视频逐字稿',
  '字幕',
  '音频转写',
  '画面 OCR',
  '完整视频正文',
  '分镜内容',
  '当前版本没有稳定视频解析器/逐字稿提取器',
  '只能基于公开字段做有限分析',
  '选题判断、评论反馈分析、账号内容定位、粗略卖点拆解、爆点方向判断',
  '视频逐字稿、字幕、口播文本、视频截图、商品信息或链接正文',
  '补充素材后继续完整拆解',
  '禁止声称已经完整读取视频',
  '已经解析视频正文',
  '已经获取逐字稿',
  '已经完成视频拆解',
]

for (const phrase of requiredPhrases) {
  assert.ok(chat.includes(phrase), `Missing Hermes answer completeness phrase: ${phrase}`)
}

const workflowStart = chat.indexOf('function formatShortVideoWorkflowInstructions')
const fallbackStart = chat.indexOf('function formatVideoLinkFallbackPrompt')
const analysisStart = chat.indexOf('function formatVideoLinkAnalysisRequest')
const successStart = chat.indexOf('function formatVideoLinkSuccessPrompt')
const fetchedStart = chat.indexOf('function formatFetchedLinkForPrompt')

assert.ok(workflowStart >= 0, 'Short video workflow prompt must exist')
assert.ok(fallbackStart >= 0, 'Video fallback prompt must exist')
assert.ok(analysisStart >= 0, 'Video analysis prompt must exist')
assert.ok(successStart >= 0, 'Video success prompt must exist')

const workflowBlock = chat.slice(workflowStart, fallbackStart)
const fallbackBlock = chat.slice(fallbackStart, analysisStart)
const analysisBlock = chat.slice(analysisStart, successStart)
const successBlock = chat.slice(successStart, fetchedStart)

assert.match(
  workflowBlock,
  /formatVideoMaterialCompletenessRules\(platform\)/,
  'Workflow instructions must require a complete material-insufficiency answer',
)
assert.match(
  fallbackBlock,
  /formatVideoMaterialCompletenessRules\(platform\)/,
  'Video fallback prompt must include material completeness requirements',
)
assert.match(
  analysisBlock,
  /formatVideoMaterialCompletenessRules\(platform\)/,
  'Video/social link analysis prompt must include material completeness requirements',
)
assert.match(
  successBlock,
  /formatVideoMaterialCompletenessRules\(platform\)/,
  'Video link success prompt must still avoid overclaiming complete video parsing',
)

assert.match(
  chat,
  /if\s*\(\s*fetchStatus\.kind\s*!==\s*['"]link_fetch_success['"]\s*\)/,
  'Ordinary webpage fetch failures must not be treated as complete content',
)
assert.match(
  chat,
  /model_config_missing/,
  'Model unavailable state must remain separate from link/material state',
)
assert.doesNotMatch(chat, /sk-[A-Za-z0-9_-]{20,}/, 'Hermes answer completeness source must not contain real API keys')
assert.doesNotMatch(chat, /OpenClaw\s+配置缺失跳转提示|Claude\s+原生入口/, 'This fix must not add OpenClaw or Claude task text')

console.log('HERMES_ANSWER_COMPLETENESS: PASS')
