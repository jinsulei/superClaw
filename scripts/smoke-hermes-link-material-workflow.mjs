import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const chat = readFileSync(resolve(process.cwd(), 'src/engines/hermes/pages/chat.js'), 'utf8')
const chatDiff = execSync('git diff -- src/engines/hermes/pages/chat.js', { encoding: 'utf8' })

assert.match(
  chat,
  /口播\/字幕：[\s\S]*想要方向：仿写\/改写 \/ 标题 \/ 口播稿 \/ 分镜 \/ 发布文案/,
  'Hermes material template must ask for transcript/caption and desired rewrite direction'
)
assert.match(
  chat,
  /如果读取到视频内容，请先按这些维度拆解：[\s\S]*开场钩子[\s\S]*内容结构和推进顺序[\s\S]*口播、字幕、关键信息和观点/,
  'Hermes must support structured video/material breakdown when text is available'
)
assert.match(
  chat,
  /仿写\/改写时保留核心内容、关键信息和观点，优化标题、开场、口播结构、转场、节奏和整体表达/,
  'Hermes must support optimization and rewrite from provided material'
)
assert.match(
  chat,
  /【素材逐字稿】[\s\S]*复制逐字稿/,
  'Hermes must expose readable transcript/material text when extracted'
)
assert.match(
  chat,
  /transcriptAvailable: false[\s\S]*subtitleAvailable: false[\s\S]*audioTranscriptAvailable: false[\s\S]*frameOcrAvailable: false/,
  'Hermes must mark missing transcript, subtitle, ASR and frame OCR instead of faking them'
)
assert.doesNotMatch(
  chat,
  /已完整解析视频|已获取视频逐字稿|已完成字幕提取|已完成音频转写|已完成视频帧 OCR/,
  'Hermes must not claim full video parsing without real transcript/OCR/ASR'
)
assert.doesNotMatch(
  chatDiff,
  /IMAGE_API_KEY|image_generation|image generation|image_edit|image edit|img2img|image-to-image|text-to-image|gpt-image|gpt-image-2|minimax-image-generation|generateImage|editImage|media\/generate|media\/image|hermes-media|图生图|文生图|改图|生图|生成图片|生成海报|图片生成/i,
  'This Hermes link-reader change must not add image generation, image editing, or IMAGE_API_KEY capabilities'
)
assert.doesNotMatch(
  chatDiff,
  /生成图片素材|生成封面图|生成海报|按参考图改图|图生图|文生图|改图/,
  'This Hermes link-reader change must keep rewrite material text-only'
)
assert.doesNotMatch(
  chat,
  /124\.222\.21\.44|G:\\|restore-hermes-chat-features|openai\/gpt-5\.5|�|Ã|Â|â€|鏂|涓|鍔|鎵|绛/,
  'Hermes link reader workflow must not contain old paths, old IPs, OpenAI fallback, or mojibake'
)

console.log('HERMES_LINK_TRANSCRIPT_FROM_PROVIDED_TEXT: PASS')
console.log('HERMES_LINK_NO_FAKE_TRANSCRIPT: PASS')
console.log('HERMES_LINK_MATERIAL_BREAKDOWN: PASS')
console.log('HERMES_LINK_MATERIAL_OPTIMIZATION: PASS')
console.log('HERMES_LINK_MATERIAL_REWRITE: PASS')
console.log('HERMES_LINK_READER_NO_IMAGE_TO_IMAGE_SYNC: PASS')
console.log('HERMES_LINK_READER_NO_TEXT_TO_IMAGE_SYNC: PASS')
console.log('HERMES_LINK_READER_NO_IMAGE_API_KEY_TOUCH: PASS')
console.log('HERMES_LINK_READER_NO_IMAGE_GENERATION_ROUTE: PASS')
console.log('HERMES_LINK_REWRITE_IS_TEXT_ONLY: PASS')
console.log('HERMES_LINK_READER_NO_GARBLED_TEXT: PASS')
