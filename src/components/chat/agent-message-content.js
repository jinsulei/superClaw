import './agent-message-content.css'

const ICONS = {
  agent: '&#129302;',
  ok: '&#9989;',
  warn: '&#9888;&#65039;',
  error: '&#10060;',
  key: '&#128273;',
  link: '&#128279;',
  image: '&#128444;&#65039;',
  file: '&#128193;',
  test: '&#129514;',
  tool: '&#128736;&#65039;',
  step: '&#128073;',
  note: '&#128172;',
  code: '&#128187;',
  detail: '&#128221;',
  heading: '&#128204;',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim()
}

function hasMarkdownStructure(text) {
  return /(?:^|\s)(?:#{1,6}\s+|[-*_]{3,}|[-*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s+|\|[^|\n]+\|)|```|~~~|\*\*|~~|\[[^\]]+\]\([^)]+\)|\$\$/.test(String(text || ''))
}

function sanitizeAgentMarkdownUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return '#'
  if (raw.startsWith('#')) return raw
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const parsed = new URL(raw, 'https://superclaw.local')
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? raw : '#'
  } catch {
    return '#'
  }
}

function sanitizeAgentMarkdownImageUrl(url) {
  const raw = String(url || '').trim().replace(/&amp;/gi, '&')
  if (!raw) return ''
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw
  try {
    const parsed = new URL(raw, 'https://superclaw.local')
    return ['http:', 'https:', 'tauri:', 'asset:'].includes(parsed.protocol) ? raw : ''
  } catch {
    return ''
  }
}

function unwrapOuterMarkdownFence(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const lines = text.split('\n')
  if (lines.length < 3) return text
  const first = lines[0].trim()
  const last = lines[lines.length - 1].trim()
  if (!/^```(?:markdown|md|gfm)\s*$/i.test(first) || last !== '```') return text
  const inner = lines.slice(1, -1).join('\n').trim()
  return hasMarkdownStructure(inner) ? inner : text
}

function protectExistingGfmTableBlocks(text) {
  const lines = String(text || '').split('\n')
  const blocks = []
  const output = []

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i]
    if (isGfmTableRowLine(current) && i + 1 < lines.length && isGfmTableSeparatorLine(lines[i + 1])) {
      const tableRows = [current, lines[i + 1]]
      i += 2
      while (i < lines.length && isGfmTableRowLine(lines[i])) {
        tableRows.push(lines[i])
        i += 1
      }
      i -= 1
      const key = `__AGENT_TABLE_BLOCK_${blocks.length}__`
      blocks.push(tableRows.join('\n'))
      output.push(key)
      continue
    }
    output.push(current)
  }

  return { text: output.join('\n'), blocks }
}

function restoreCollapsedMarkdownLineBreaks(value) {
  let text = unwrapOuterMarkdownFence(value)
  if (!text || !hasMarkdownStructure(text)) return text

  const codeBlocks = []
  text = text.replace(/```[\s\S]*?```/g, (block) => {
    const key = `__AGENT_CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(block)
    return key
  })

  const protectedTables = protectExistingGfmTableBlocks(text)
  text = protectedTables.text
  const tableBlocks = protectedTables.blocks

  const sectionLabels = [
    'Python', 'JavaScript', 'TypeScript', 'SQL', 'Mermaid', 'Bash', 'Shell',
    'PowerShell', 'JSON', 'YAML', 'HTML', 'CSS', 'Rust', 'Go', 'Java',
  ].join('|')
  const languageNames = [
    'python', 'javascript', 'typescript', 'sql', 'mermaid', 'bash', 'shell',
    'powershell', 'json', 'yaml', 'html', 'css', 'rust', 'go', 'java',
  ].join('|')

  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+(?=---(?:\s|$))/g, '\n\n')
    .replace(/(^|[^\n])\s+(?=#{1,6}\s+)/g, '$1\n\n')
    .replace(/(#{1,6}\s+[^\n|]+?)\s+(?=\|)/g, '$1\n')
    .replace(/(^|[^\n])\s+(?=[-*]\s+(?:\[[ xX]\]\s+)?)/g, '$1\n')
    .replace(/(^|[^\n#])\s+(?=\d+[.)]\s+)/g, '$1\n')
    .replace(new RegExp(`\\s+(?=(?:${sectionLabels})[：:])`, 'g'), '\n\n')
    .replace(new RegExp(`([：:])\\s+(?=(${languageNames})\\b)`, 'gi'), '$1\n\n')
    .replace(new RegExp(`(^|\\n)(${languageNames})\\s+`, 'gi'), '$1$2\n')
    .replace(/(^|[^\n])\s+(?=>\s+)/g, '$1\n')
    .replace(/(\|[^\n]*?\|)\s+(?=\|)/g, '$1\n')
    .replace(/[ \t]+(\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?)(?=[ \t]+)/g, '\n$1')
    .replace(/([。！？；;])\s+(?=(?:---|#{1,6}\s+|\d+[.)]\s+|[-*]\s+|\|))/g, '$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
    .replace(/__AGENT_TABLE_BLOCK_(\d+)__/g, (_, index) => tableBlocks[Number(index)] || '')
    .replace(/__AGENT_CODE_BLOCK_(\d+)__/g, (_, index) => codeBlocks[Number(index)] || '')
}

function maskSensitiveText(text) {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-****')
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer ****')
    .replace(/((?:api[_-]?key|token|secret|MINIMAX_API_KEY|OPENAI_API_KEY|HERMES_API_KEY)\s*[:=]\s*)[A-Za-z0-9._-]{8,}/gi, '$1****')
}

function splitHiddenBlocks(rawText) {
  let finalText = normalizeText(rawText)
  const hiddenParts = []
  const patterns = [
    /<think>([\s\S]*?)<\/think>/gi,
    /<thinking>([\s\S]*?)<\/thinking>/gi,
    /<reasoning>([\s\S]*?)<\/reasoning>/gi,
    /<analysis>([\s\S]*?)<\/analysis>/gi,
    /<tool_trace>([\s\S]*?)<\/tool_trace>/gi,
    /```(?:tool|trace|debug|analysis|reasoning)\n([\s\S]*?)```/gi,
  ]

  for (const pattern of patterns) {
    finalText = finalText.replace(pattern, (_, inner) => {
      const text = normalizeText(inner)
      if (text) hiddenParts.push(text)
      return ''
    })
  }

  finalText = finalText
    .replace(/^\s*\[(?:debug|trace|tool|reasoning|analysis)[^\]]*\]\s*.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    finalText: maskSensitiveText(finalText),
    hiddenText: maskSensitiveText(hiddenParts.join('\n\n')),
  }
}

function finalContentFromMessage(message, explicitContent) {
  if (explicitContent != null) return normalizeText(explicitContent)
  if (typeof message === 'string') return normalizeText(message)
  if (!message || typeof message !== 'object') return ''
  return normalizeText(
    message.finalContent ??
    message.final ??
    message.modelContent ??
    message.text ??
    message.content ??
    '',
  )
}

function detailContentFromMessage(message, extraDetails) {
  const parts = []
  const push = (value) => {
    const text = normalizeText(value)
    if (text) parts.push(text)
  }
  if (message && typeof message === 'object') {
    push(message.reasoning_content)
    push(message.reasoningContent)
    push(message.thinking)
    push(message.thought)
    push(message.analysis)
    push(message.tool_trace)
    push(message.toolTrace)
    push(message.debug_detail)
    push(message.debugDetail)
    push(message.details)
  }
  push(extraDetails)
  return maskSensitiveText(parts.join('\n\n'))
}

function chooseIcon(line, index, type) {
  const text = String(line || '').toLowerCase()
  if (/error|failed|失败|错误|报错|不可|不能|超时|风险|危险|警告|warning/.test(text)) return ICONS.warn
  if (/success|ok|pass|完成|成功|通过|已连接|正常|可以/.test(text)) return ICONS.ok
  if (/api key|apikey|token|secret|密钥|授权|登录|鉴权/.test(text)) return ICONS.key
  if (/https?:\/\/|localhost|127\.0\.0\.1|baseurl|base url|链接|地址|url/.test(text)) return ICONS.link
  if (/图片|图像|截图|生图|image|vision|ocr|media/.test(text)) return ICONS.image
  if (/文件|目录|路径|config|env|配置|保存|本地/.test(text)) return ICONS.file
  if (/测试|验证|检查|排查|诊断|smoke|build/.test(text)) return ICONS.test
  if (/工具|执行|修复|修改|处理|命令|shell|terminal|gateway|agent/.test(text)) return ICONS.tool
  if (/步骤|第一|第二|第三|然后|最后|下一步/.test(text)) return ICONS.step
  if (type === 'heading') return ICONS.heading
  if (type === 'list') return ICONS.step
  return index % 3 === 0 ? ICONS.note : (index % 3 === 1 ? ICONS.ok : ICONS.agent)
}

function stripMarkdownPrefix(line) {
  return String(line || '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)、]\s+/, '')
    .replace(/^>\s+/, '')
    .trim()
}

function isHeadingLine(line) {
  const value = String(line || '').trim()
  return /^#{1,6}\s+/.test(value) || /^(结论|总结|结果|注意|警告|风险|原因|方案|建议|配置|设置|步骤|流程|下一步|示例)[:：]/.test(value)
}

function isListLine(line) {
  const value = String(line || '').trim()
  return /^[-*]\s+/.test(value) || /^\d+[.)、]\s+/.test(value)
}

function renderInline(rawText) {
  const escaped = escapeHtml(rawText)
  return escaped
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, url) => {
      const safeUrl = sanitizeAgentMarkdownImageUrl(url)
      if (!safeUrl) return `<span class="agent-message-image-ref">${alt || 'image unavailable'}</span>`
      return `<img class="agent-message-markdown-image" src="${escapeHtml(safeUrl)}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, url) => `<a class="agent-message-link" href="${escapeHtml(sanitizeAgentMarkdownUrl(url))}" target="_blank" rel="noreferrer">${label}</a>`)
    .replace(/`([^`]+)`/g, '<code class="agent-message-inline-code">$1</code>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong class="agent-message-strong"><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="agent-message-strong">$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
}

function isGfmTableSeparatorLine(line) {
  const value = String(line || '').replace(/[｜]/g, '|').replace(/[—–]/g, '-').trim()
  // Providers often return a compact table divider (`--`) or Unicode dashes.
  // Treat those as the same GFM structure so the final renderer does not fall
  // back to showing the original pipe-delimited text.
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(value)
}

function isGfmTableRowLine(line) {
  const value = String(line || '').replace(/[｜]/g, '|').trim()
  return value.includes('|') && !isGfmTableSeparatorLine(value)
}

function splitGfmTableRow(line) {
  let value = String(line || '').replace(/[｜]/g, '|').trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  const cells = []
  let cell = ''
  let escaped = false
  for (const ch of value) {
    if (ch === '|' && !escaped) {
      cells.push(cell.trim())
      cell = ''
      continue
    }
    cell += ch
    escaped = ch === '\\' && !escaped
    if (ch !== '\\') escaped = false
  }
  cells.push(cell.trim())
  return cells
}

function gfmColumnAlign(separatorCell = '') {
  const value = String(separatorCell || '').trim()
  const left = value.startsWith(':')
  const right = value.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  return 'left'
}

function renderGfmTable(rows = []) {
  if (rows.length < 2 || !isGfmTableSeparatorLine(rows[1])) return ''
  const headers = splitGfmTableRow(rows[0])
  const separators = splitGfmTableRow(rows[1])
  const bodyRows = rows.slice(2).map(splitGfmTableRow)
  const aligns = headers.map((_, index) => gfmColumnAlign(separators[index]))
  const renderCell = (tag, cell, index) => {
    const align = aligns[index] || 'left'
    return `<${tag} style="text-align:${align}">${renderInline(cell)}</${tag}>`
  }
  const head = `<thead><tr>${headers.map((cell, index) => renderCell('th', cell, index)).join('')}</tr></thead>`
  const body = bodyRows.length
    ? `<tbody>${bodyRows.map(row => `<tr>${headers.map((_, index) => renderCell('td', row[index] || '', index)).join('')}</tr>`).join('')}</tbody>`
    : ''
  return `<div class="agent-message-table-wrap"><table class="agent-message-markdown-table">${head}${body}</table></div>`
}

function renderCodeCopyButton() {
  return [
    '<button type="button" class="hm-chat-code-copy agent-message-code-copy" title="Copy code" aria-label="Copy code">',
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
    '<path d="M8 8.5A2.5 2.5 0 0 1 10.5 6h6A2.5 2.5 0 0 1 19 8.5v8A2.5 2.5 0 0 1 16.5 19h-6A2.5 2.5 0 0 1 8 16.5v-8Z"></path>',
    '<path d="M6 15.5A2.5 2.5 0 0 1 4 13V5.5A2.5 2.5 0 0 1 6.5 3H14a2.5 2.5 0 0 1 2.45 2"></path>',
    '</svg>',
    '<span class="hm-chat-code-copy-label">Copy</span>',
    '</button>',
  ].join('')
}

function splitCodeFences(text) {
  const segments = []
  const re = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g
  let last = 0
  let match
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(last, match.index)
    if (before) segments.push({ type: 'text', content: before })
    segments.push({ type: 'code', language: match[1] || '', content: match[2] || '' })
    last = match.index + match[0].length
  }
  const rest = text.slice(last)
  if (rest) segments.push({ type: 'text', content: rest })
  return segments
}

function renderTextSegment(text, startIndex = 0) {
  const rows = []
  let paragraph = []
  let index = startIndex

  const flushParagraph = () => {
    const content = paragraph.join(' ').trim()
    paragraph = []
    if (!content) return
    const icon = chooseIcon(content, index, 'paragraph')
    rows.push(`<p class="agent-message-row agent-message-paragraph"><span class="agent-message-icon" aria-hidden="true">${icon}</span><span class="agent-message-text">${renderInline(content)}</span></p>`)
    index += 1
  }

  const lines = String(text || '').split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      continue
    }

    if (isGfmTableRowLine(line) && i + 1 < lines.length && isGfmTableSeparatorLine(lines[i + 1])) {
      flushParagraph()
      const tableRows = [rawLine, lines[i + 1]]
      i += 2
      while (i < lines.length && isGfmTableRowLine(lines[i])) {
        tableRows.push(lines[i])
        i += 1
      }
      i -= 1
      rows.push(renderGfmTable(tableRows))
      index += 1
      continue
    }

    if (isHeadingLine(line)) {
      flushParagraph()
      const content = stripMarkdownPrefix(line)
      rows.push(`<div class="agent-message-row agent-message-heading"><span class="agent-message-icon" aria-hidden="true">${chooseIcon(content, index, 'heading')}</span><span class="agent-message-text">${renderInline(content)}</span></div>`)
      index += 1
      continue
    }

    if (isListLine(line)) {
      flushParagraph()
      const content = stripMarkdownPrefix(line)
      rows.push(`<div class="agent-message-row agent-message-list"><span class="agent-message-icon" aria-hidden="true">${chooseIcon(content, index, 'list')}</span><span class="agent-message-text">${renderInline(content)}</span></div>`)
      index += 1
      continue
    }

    paragraph.push(line)
  }

  flushParagraph()
  return rows.join('')
}

function renderFinalText(text) {
  const segments = splitCodeFences(text)
  let textIndex = 0
  return segments.map((segment) => {
    if (segment.type === 'code') {
      return `<pre class="agent-message-code-block">${renderCodeCopyButton()}<code>${escapeHtml(segment.content.trim())}</code></pre>`
    }
    const html = renderTextSegment(segment.content, textIndex)
    textIndex += segment.content.split(/\n+/).filter(line => line.trim()).length
    return html
  }).join('')
}

function renderMarkdownTextSegment(text, { preserveSoftBreaks = false } = {}) {
  const lines = restoreCollapsedMarkdownLineBreaks(text).split('\n')
  const rows = []
  let paragraph = []
  let listType = ''
  let listItems = []
  let itemIndex = 0

  const flushParagraph = () => {
    const content = paragraph.map(renderInline).join(preserveSoftBreaks ? '<br>' : ' ').trim()
    paragraph = []
    if (content) rows.push(`<p>${content}</p>`)
  }

  const flushList = () => {
    if (!listItems.length || !listType) return
    rows.push(`<${listType} class="agent-message-markdown-list">${listItems.map(item => `<li><span class="agent-message-icon" aria-hidden="true">${item.icon}</span><span class="agent-message-text">${item.html}</span></li>`).join('')}</${listType}>`)
    listType = ''
    listItems = []
  }

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    if (isGfmTableRowLine(line) && i + 1 < lines.length && isGfmTableSeparatorLine(lines[i + 1])) {
      flushParagraph()
      flushList()
      const tableRows = [rawLine, lines[i + 1]]
      i += 2
      while (i < lines.length && isGfmTableRowLine(lines[i])) {
        tableRows.push(lines[i])
        i += 1
      }
      i -= 1
      rows.push(renderGfmTable(tableRows))
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const level = Math.min(6, heading[1].length)
      const headingText = heading[2].trim()
      rows.push(`<h${level} class="agent-message-markdown-heading"><span class="agent-message-icon" aria-hidden="true">${chooseIcon(headingText, itemIndex, 'heading')}</span><span class="agent-message-text">${renderInline(headingText)}</span></h${level}>`)
      itemIndex += 1
      continue
    }

    if (/^[-*_]{3,}$/.test(line)) {
      flushParagraph()
      flushList()
      rows.push('<hr>')
      continue
    }

    const task = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/)
    const unordered = line.match(/^[-*]\s+(.+)$/)
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (task || unordered || ordered) {
      flushParagraph()
      const nextType = (task || unordered) ? 'ul' : 'ol'
      if (listType && listType !== nextType) flushList()
      listType = nextType
      if (task) {
        const checked = task[1].trim().toLowerCase() === 'x'
        const taskText = task[2].trim()
        listItems.push({ icon: chooseIcon(taskText, itemIndex, 'list'), html: `<label class="agent-message-task"><input type="checkbox" disabled ${checked ? 'checked' : ''}> <span>${renderInline(taskText)}</span></label>` })
      } else {
        const itemText = (unordered || ordered)[1].trim()
        listItems.push({ icon: chooseIcon(itemText, itemIndex, 'list'), html: renderInline(itemText) })
      }
      itemIndex += 1
      continue
    }

    if (/^>\s+/.test(line)) {
      flushParagraph()
      flushList()
      rows.push(`<blockquote>${renderInline(line.replace(/^>\s+/, '').trim())}</blockquote>`)
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return rows.join('')
}

function renderMarkdownFinalText(text, options = {}) {
  const normalizedText = restoreCollapsedMarkdownLineBreaks(unwrapOuterMarkdownFence(text))
  const segments = splitCodeFences(normalizedText)
  return segments.map((segment) => {
    if (segment.type === 'code') {
      const lang = segment.language ? `<span class="agent-message-code-lang">${escapeHtml(segment.language)}</span>` : ''
      return `<pre class="agent-message-code-block">${renderCodeCopyButton()}${lang}<code>${escapeHtml(segment.content.trim())}</code></pre>`
    }
    return renderMarkdownTextSegment(segment.content, options)
  }).join('')
}

export function renderAgentMessageContent({ agent = 'hermes', message = '', content = null, details = '', markdown = false } = {}) {
  const rawFinal = finalContentFromMessage(message, content)
  const extracted = splitHiddenBlocks(rawFinal)
  const detailText = [extracted.hiddenText, detailContentFromMessage(message, details)]
    .map(normalizeText)
    .filter(Boolean)
    .join('\n\n')

  const finalText = extracted.finalText
  if (!finalText && !detailText) return ''

  const bodyClass = markdown ? 'agent-message-body agent-message-body--markdown markdown-body' : 'agent-message-body'
  const body = finalText
    ? `<div class="${bodyClass}">${markdown ? renderMarkdownFinalText(finalText, { preserveSoftBreaks: agent === 'hermes' }) : renderFinalText(finalText)}</div>`
    : ''
  const detail = detailText
    ? `<details class="agent-message-detail"><summary><span aria-hidden="true">${ICONS.detail}</span><span>查看分析详情</span></summary><pre class="agent-message-detail-panel">${escapeHtml(detailText)}</pre></details>`
    : ''

  return `<div class="agent-message-content" data-agent="${escapeHtml(agent)}">${body}${detail}</div>`
}

export function renderAgentMessageContentInto(container, options = {}) {
  if (!container) return
  container.innerHTML = renderAgentMessageContent(options)
}
