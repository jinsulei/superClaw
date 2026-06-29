import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildHermesImageUrlPayload,
  detectHermesImageIntent,
  HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY,
  normalizeHermesImageDetail,
} from '../src/engines/hermes/lib/hermes-response-assembler.js'

assert.equal(normalizeHermesImageDetail('auto', 'minimax'), undefined)
assert.equal(normalizeHermesImageDetail('AUTO', 'yyapi'), undefined)
assert.equal(normalizeHermesImageDetail('', 'openai-compatible'), undefined)
assert.equal(normalizeHermesImageDetail('low', 'minimax'), 'low')
assert.equal(normalizeHermesImageDetail('high', 'yyapi'), 'high')
assert.equal(normalizeHermesImageDetail('medium', 'minimax'), undefined)

assert.deepEqual(
  buildHermesImageUrlPayload({
    base64: 'abc',
    mime: 'image/jpeg',
    detail: 'auto',
    provider: 'minimax',
  }),
  { url: 'data:image/jpeg;base64,abc' },
)

assert.deepEqual(
  buildHermesImageUrlPayload({
    url: 'https://example.com/a.png',
    detail: 'high',
    provider: 'minimax',
  }),
  { url: 'https://example.com/a.png', detail: 'high' },
)

const imageAttachment = { category: 'image', mimeType: 'image/png', content: 'abc' }
assert.equal(detectHermesImageIntent({ text: '', attachments: [imageAttachment] }), 'ask_clarify')
assert.equal(detectHermesImageIntent({ text: '帮我看看这张图有什么问题', attachments: [imageAttachment] }), 'image_understanding')
assert.equal(detectHermesImageIntent({ text: '按这张图生成一张类似风格', attachments: [imageAttachment] }), 'image_to_image')
assert.equal(detectHermesImageIntent({ text: '解释一下画面里的按钮', attachments: [imageAttachment] }), 'image_understanding')
assert.equal(detectHermesImageIntent({ text: '没有图片', attachments: [] }), 'no_image')
assert.match(HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY, /暂不支持/)

const devApi = fs.readFileSync('scripts/dev-api.js', 'utf8')
const hermesRs = fs.readFileSync('src-tauri/src/commands/hermes.rs', 'utf8')
assert.doesNotMatch(devApi, /detail\s*:\s*['"]auto['"]/)
assert.doesNotMatch(hermesRs, /"detail"\s*:\s*"auto"/)

console.log('PASS smoke-hermes-image-detail-and-intent')
