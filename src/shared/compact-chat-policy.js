import { compactMarkdownSpacing } from './chat-text-layout.js'

const DEFAULT_OPTIONS = Object.freeze({
  maxPreviewChars: 220,
  maxPreviewLines: 5,
  maxVisibleBullets: 3,
  collapseWhenChars: 420,
  collapseWhenLines: 8,
  collapseWhenCodeBlocks: 1,
})

const TOOL_STATUS_RE = /^\s*(exec|tool|browser|bash|shell|python|powershell|cmd|node|npm|cargo)\b[^\n]{0,24}?(成功|success|done|完成|ok|passed|通过)(?:\b|$|[\s·:：|.-])/i
const CODE_BLOCK_RE = /```[\s\S]*?```/g

export function normalizeChatText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitToolStatusLines(text) {
  const lines = normalizeChatText(text).split('\n')
  const toolLines = []
  const contentLines = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (TOOL_STATUS_RE.test(trimmed)) {
      toolLines.push(trimmed)
    } else {
      contentLines.push(line)
    }
  }

  return {
    toolLines,
    content: contentLines.join('\n').trim(),
  }
}

export function shouldCollapseMessage(text, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const normalized = normalizeChatText(text)
  if (!normalized) return false

  const lineCount = normalized.split('\n').length
  const codeBlockCount = (normalized.match(CODE_BLOCK_RE) || []).length

  return normalized.length > opts.collapseWhenChars
    || lineCount > opts.collapseWhenLines
    || codeBlockCount >= opts.collapseWhenCodeBlocks
}

export function createCompactPreview(text, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const normalized = normalizeChatText(text)
  if (!normalized) return ''

  const noCode = normalized.replace(CODE_BLOCK_RE, '[代码块已折叠]')
  const lines = noCode.split('\n')
  const previewLines = []
  let bulletCount = 0

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (!line.trim()) {
      if (previewLines.length && previewLines[previewLines.length - 1] !== '') {
        previewLines.push('')
      }
      continue
    }

    const isBullet = /^\s*[-*•]\s+/.test(line)
    if (isBullet) {
      bulletCount += 1
      if (bulletCount > opts.maxVisibleBullets) continue
    }

    previewLines.push(line)

    if (previewLines.filter(Boolean).length >= opts.maxPreviewLines) break
  }

  let preview = previewLines.join('\n').trim()
  if (preview.length > opts.maxPreviewChars) {
    preview = `${preview.slice(0, opts.maxPreviewChars).trim()}...`
  }

  return preview
}

export function compactChatMessage(rawText, options = {}) {
  const { toolLines, content } = splitToolStatusLines(rawText)
  // Normalize only the display text; raw message persistence remains unchanged.
  const layoutContent = compactMarkdownSpacing(content)
  const collapsed = shouldCollapseMessage(layoutContent, options)

  return {
    content: layoutContent,
    preview: collapsed ? createCompactPreview(layoutContent, options) : layoutContent,
    collapsed,
    toolLines,
    toolSummary: toolLines.length > 0 ? `工具日志 ${toolLines.length} 条` : '',
  }
}
