import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const source = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const requiredTerms = [
  'let _currentAiBubble = null, _currentAiBubbleRequestId',
  'function hasOpenClawRenderableContent',
  'function removeOpenClawEmptyBubble',
  'function removeCurrentOpenClawStreamBubbleIfEmpty',
  'function getOpenClawStableStreamId',
  'function isOpenClawStreamIdMismatch',
  'const visibleDeltaText = sanitizeOpenClawVisibleReply(extractOpenClawAssistantText(payload) || c?.text || \'\')',
  'if (!hasOpenClawRenderableContent({ visibleText: visibleDeltaText }))',
  'if (isOpenClawStreamIdMismatch(stableStreamId)) return',
  'clientRequestId: stableStreamId',
  '_currentAiBubbleRequestId = stableStreamId',
  'if (_currentAiBubble && !hasContent && removeCurrentOpenClawStreamBubbleIfEmpty())',
  'hasOpenClawRenderableContent({',
  'text: visibleFinalText',
  'screenshotCards: finalScreenshotCards',
  'confirmations: finalConfirmations',
  'const visibleText = sanitizeOpenClawVisibleReply(rawText || \'\')',
  'if (!shouldRenderToolCard && !hasOpenClawRenderableContent({ visibleText })) return',
]

for (const term of requiredTerms) {
  assert(source.includes(term), `missing OpenClaw stream render stability guard: ${term}`)
}

const renderFn = source.slice(
  source.indexOf('function renderCompactAssistantContent'),
  source.indexOf('// 鈹€鈹€ 娴佸紡娓叉煋', source.indexOf('function renderCompactAssistantContent')),
)

assert(renderFn.includes('if (!shouldRenderToolCard && !hasOpenClawRenderableContent({ visibleText })) return'), 'renderCompactAssistantContent must return before clearing empty visible content')
assert(
  renderFn.indexOf('if (!shouldRenderToolCard && !hasOpenClawRenderableContent({ visibleText })) return') <
    renderFn.indexOf('container.innerHTML = \'\''),
  'renderCompactAssistantContent must not clear innerHTML before empty-visible guard',
)

const deltaFn = source.slice(source.indexOf("if (state === 'delta')"), source.indexOf("if (state === 'final')"))
assert(deltaFn.indexOf('const visibleDeltaText') < deltaFn.indexOf('createStreamBubble'), 'delta must sanitize visible text before createStreamBubble')
assert(!/if\s*\(c\?\.text\s*&&[\s\S]{0,500}createStreamBubble/.test(deltaFn), 'delta must not create bubble from raw c.text before sanitize')

assert(!source.includes("import '../engines/hermes/"), 'smoke should not require Hermes edits')
assert(!source.includes("runtime/claude-panel"), 'OpenClaw stream stability fix should not touch Claude panel imports')

console.log('SMOKE_OPENCLAW_STREAM_RENDER_STABILITY_PASS')
