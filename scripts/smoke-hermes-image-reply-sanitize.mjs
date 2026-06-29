import assert from 'node:assert/strict'
import { sanitizeHermesImageReply } from './dev-api.js'
import { sanitizeHermesImageReply as sanitizeUiHermesImageReply } from '../src/engines/hermes/lib/hermes-response-assembler.js'

const generationOnly = sanitizeHermesImageReply('I cannot generate images in this build.', {
  input: 'generate an image',
})
assert.equal(generationOnly, 'I cannot generate images in this build.')

const promptLeak = sanitizeHermesImageReply('image prompt: pink tennis poster\nMEDIA:C:\\tmp\\out.jpeg', {
  imageTask: true,
})
assert.ok(promptLeak.includes('MEDIA:C:\\tmp\\out.jpeg'))
assert.ok(!/image prompt|pink tennis poster/i.test(promptLeak.replace(/^MEDIA:.*$/m, '')))
assert.ok(promptLeak.includes('图片已生成。'))

const jsonLeak = sanitizeHermesImageReply('MEDIA:C:\\tmp\\out.jpeg\n{"prompt":"secret","image_prompt":"secret"}', {
  imageTask: true,
})
assert.ok(jsonLeak.includes('MEDIA:C:\\tmp\\out.jpeg'))
assert.ok(!/prompt|image_prompt|secret/i.test(jsonLeak.replace(/^MEDIA:.*$/m, '')))

const longText = sanitizeHermesImageReply(`MEDIA:C:\\tmp\\out.jpeg\n${'这是一段很长的图片解释。'.repeat(40)}`, {
  imageTask: true,
})
assert.ok(longText.length < 180)
assert.ok(longText.includes('图片已生成。'))

const normal = sanitizeHermesImageReply('普通聊天回复，不是图片任务。', { input: '你好' })
assert.equal(normal, '普通聊天回复，不是图片任务。')

const uiSanitized = sanitizeUiHermesImageReply('MEDIA:C:\\tmp\\out.jpeg\nnegative_prompt: bad', {
  imageTask: true,
})
assert.ok(uiSanitized.includes('MEDIA:C:\\tmp\\out.jpeg'))
assert.ok(!/negative_prompt|bad/i.test(uiSanitized.replace(/^MEDIA:.*$/m, '')))

console.log('PASS smoke-hermes-image-reply-sanitize')
