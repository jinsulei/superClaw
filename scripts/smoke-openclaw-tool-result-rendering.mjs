import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const source = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const requiredTerms = [
  'isInternalToolPlaceholderText',
  'getOpenClawToolDisplayName',
  'stripRawOpenClawToolText',
  'extractOpenClawSkillsCount',
  'isOpenClawSkillsToolResult',
  'formatOpenClawToolResultForUser',
  'const summary = formatOpenClawToolResultForUser(info)',
  'const raw = info.safeRawText',
  'return formatOpenClawToolResultForUser(toolInfo)',
  'hasOpenClawRenderableContent',
  'removeCurrentOpenClawStreamBubbleIfEmpty',
  'const visibleDeltaText = sanitizeOpenClawVisibleReply(c?.text || \'\')',
  'if (!hasOpenClawRenderableContent({ text, images, videos, audios, files, tools, screenshotCards, confirmations })) return',
]

for (const term of requiredTerms) {
  assert(source.includes(term), `missing OpenClaw tool rendering guard: ${term}`)
}

const forbiddenSnippets = [
  "toolName: last.name || last.toolName || last.id || 'tool'",
  "const raw = info.rawText || '\\u6682\\u65e0\\u53ef\\u5c55\\u5f00\\u7684\\u8be6\\u60c5'",
  "'\\u7ed3\\u679c\\u5df2\\u540c\\u6b65\\u5230\\u4e0b\\u65b9\\u8be6\\u60c5\\u3002'",
]

for (const snippet of forbiddenSnippets) {
  assert(!source.includes(snippet), `forbidden old OpenClaw tool rendering snippet remains: ${snippet}`)
}

assert(/Tool\\s\+tool/.test(source), 'Tool tool placeholder filter is missing')
assert(/Skills \\u67e5\\u8be2\\u6210\\u529f/.test(source), 'Skills friendly summary is missing')
assert(/openclaw-tool-result-card__details/.test(source), 'OpenClaw tool details card is missing')

console.log('OPENCLAW_TOOL_RESULT_RENDERING_SMOKE_PASS')
