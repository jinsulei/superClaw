import assert from 'node:assert/strict'
import {
  compactChatMessage,
  createCompactPreview,
  normalizeChatText,
  shouldCollapseMessage,
  splitToolStatusLines,
} from '../src/shared/compact-chat-policy.js'

assert.equal(normalizeChatText('a\n\n\nb'), 'a\n\nb')

const withTools = splitToolStatusLines(`exec · 成功 · 06:32
tool · 成功 · 06:33
OCR 可用。`)

assert.deepEqual(withTools.toolLines, [
  'exec · 成功 · 06:32',
  'tool · 成功 · 06:33',
])
assert.equal(withTools.content, 'OCR 可用。')

const longText = `可以通过 OCR 识别图片、截图、文档里的文字。

使用方式：
- 读取图片中的文字
- 截图识别
- 多语言支持
- 提取文档图片的文字
- 识别表格

你可以把图片发来，或者告诉我图片路径。

\`\`\`js
console.log("ocr demo")
\`\`\`

如果还需要批量处理，我可以继续协助。`

assert.equal(shouldCollapseMessage(longText), true)

const compact = compactChatMessage(`exec · 成功 · 06:32
tool · 成功 · 06:33
${longText}`)

assert.equal(compact.collapsed, true)
assert.equal(compact.toolLines.length, 2)
assert.equal(compact.toolSummary, '工具日志 2 条')
assert.ok(compact.preview.length < longText.length)
assert.ok(compact.preview.includes('OCR'))

const shortText = 'OCR 可用。把图片发来，我可以识别里面的文字。'
const shortCompact = compactChatMessage(shortText)
assert.equal(shortCompact.collapsed, false)
assert.equal(shortCompact.preview, shortText)

const preview = createCompactPreview(longText, {
  maxPreviewLines: 3,
  maxVisibleBullets: 2,
  maxPreviewChars: 120,
})
assert.ok(preview.split('\n').filter(Boolean).length <= 3)
assert.ok(preview.length <= 123)

console.log('compact chat smoke test passed')
