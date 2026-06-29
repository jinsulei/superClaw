import { sanitizeMediaVisibleText, splitMediaProtocol } from '../../../shared/chat-output-guard.js'

export function normalizeHermesStreamText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(normalizeHermesStreamText).join('')
  if (typeof value === 'object') {
    return normalizeHermesStreamText(
      value.delta ?? value.text_delta ?? value.content_delta
      ?? value.output ?? value.result ?? value.content
      ?? value.response ?? value.message ?? value.data ?? ''
    )
  }
  return String(value)
}

export function hermesStreamTextFromEvent(event = {}) {
  return normalizeHermesStreamText(
    event.delta ?? event.text_delta ?? event.content_delta
    ?? event.output ?? event.result ?? event.content
    ?? event.response ?? event.message ?? event.data ?? ''
  )
}

export function hermesEventKind(event = {}) {
  const raw = String(event.event || event.type || event.name || '').toLowerCase()
  if (raw === 'message.final' || raw === 'final') return 'final'
  if (raw === 'run.completed' || raw === 'completed' || raw === 'done') return 'completed'
  if (raw === 'message.delta' || raw === 'delta' || raw === 'text.delta') return 'delta'
  if (raw === 'message') return 'snapshot'
  return raw
}

export function eventMatchesHermesRequest(event = {}, request = {}) {
  const clientRequestId = String(request.clientRequestId || '')
  const runId = String(request.runId || '')
  const eventClientRequestId = String(event.clientRequestId || event.client_request_id || '')
  const eventRunId = String(event.runId || event.run_id || '')
  if (clientRequestId && eventClientRequestId && eventClientRequestId !== clientRequestId) return false
  if (runId && eventRunId && eventRunId !== runId) return false
  return true
}

export class HermesResponseAssembler {
  constructor({ clientRequestId = '', runId = '' } = {}) {
    this.clientRequestId = String(clientRequestId || '')
    this.runId = String(runId || '')
    this.emittedText = ''
    this.finalText = ''
    this.finalSent = false
    this.completedSent = false
    this.closed = false
  }

  adoptRunId(runId) {
    const next = String(runId || '').trim()
    if (next && !this.runId) this.runId = next
    return this.runId
  }

  matches(event = {}) {
    return eventMatchesHermesRequest(event, this)
  }

  diff(incomingText, { mode = 'delta' } = {}) {
    const text = normalizeHermesStreamText(incomingText)
    if (!text) return ''
    const emitted = this.emittedText
    let delta = ''

    if (text === emitted || (emitted && emitted.endsWith(text))) {
      delta = ''
    } else if (text.startsWith(emitted)) {
      delta = text.slice(emitted.length)
    } else if (mode === 'snapshot') {
      delta = ''
    } else {
      delta = text
    }

    this.finalText = preferHermesStreamText(this.finalText, text)
    if (delta) {
      this.emittedText = emitted + delta
      this.finalText = preferHermesStreamText(this.finalText, this.emittedText)
    }
    return delta
  }

  accept(event = {}) {
    if (this.closed) return null
    if (!this.matches(event)) return null
    this.adoptRunId(event.runId || event.run_id)

    const kind = hermesEventKind(event)
    const text = hermesStreamTextFromEvent(event)

    if (kind === 'completed') {
      if (this.completedSent) return null
      const delta = this.diff(text, { mode: 'snapshot' })
      this.completedSent = true
      this.closed = true
      return {
        type: 'completed',
        text: delta,
        output: this.output(),
      }
    }

    if (kind === 'final') {
      if (this.finalSent) return null
      const delta = this.diff(text, { mode: 'snapshot' })
      this.finalSent = true
      return delta
        ? { type: 'delta', text: delta, final: true, output: this.output() }
        : { type: 'final', output: this.output() }
    }

    if (kind === 'delta' || kind === 'snapshot') {
      const delta = this.diff(text, { mode: kind === 'snapshot' || event.snapshot || event.streamMode === 'snapshot' ? 'snapshot' : 'delta' })
      return delta ? { type: 'delta', text: delta, output: this.output() } : null
    }

    return null
  }

  output() {
    return preferHermesStreamText(this.finalText, this.emittedText)
  }

  abort() {
    this.closed = true
  }
}

export function preferHermesStreamText(current, candidate) {
  const a = String(current || '')
  const b = String(candidate || '')
  if (!b.trim()) return a
  if (!a.trim()) return b
  if (b === a || a.endsWith(b)) return a
  if (b.startsWith(a) || b.length > a.length) return b
  return a
}

export function getHermesAssistantMessageId(clientRequestId) {
  const id = String(clientRequestId || '').trim()
  return `${id || 'unknown'}-assistant`
}

export function upsertHermesAssistantMessage(messages, message) {
  const list = Array.isArray(messages) ? messages : []
  const incoming = message || {}
  const requestId = String(incoming.clientRequestId || incoming.client_request_id || '').trim()
  const id = String(incoming.id || (requestId ? getHermesAssistantMessageId(requestId) : '')).trim()
  const existing = list.find(item => {
    if (!item || item.role !== 'assistant') return false
    if (id && item.id === id) return true
    if (requestId && String(item.clientRequestId || item.client_request_id || '') === requestId) return true
    return false
  })
  if (existing) {
    Object.assign(existing, incoming, {
      id: existing.id || id,
      role: 'assistant',
      clientRequestId: existing.clientRequestId || requestId || incoming.clientRequestId,
    })
    return existing
  }
  const next = {
    id: id || `assistant-${Date.now()}`,
    role: 'assistant',
    ...incoming,
  }
  if (requestId) next.clientRequestId = requestId
  list.push(next)
  return next
}

function stringifyHermesValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function compactHermesWhitespace(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripHermesRawToolText(text) {
  let next = String(text || '')

  next = next.replace(/```(?:json|tool|tools|output|result)?\s*[\s\S]*?(?:tool_call|toolCallId|tool_call_id|arguments|image_prompt|negative_prompt|prompt)[\s\S]*?```/gi, '')
  next = next.replace(/^\s*[{[][\s\S]{0,2400}(?:tool_call|toolCallId|tool_call_id|arguments|image_prompt|negative_prompt|prompt)[\s\S]{0,2400}[}\]]\s*$/gim, '')

  const lines = next.split('\n').filter(line => {
    const trimmed = line.trim()
    if (!trimmed) return true
    if (/^\[?\s*TOOL_CALL\s*\]?$/i.test(trimmed)) return false
    if (/^Tool\s+tool\s+(success|succeeded|done|completed|ok|failed|error)/i.test(trimmed)) return false
    if (/^(exec|tool|browser|bash|shell|python|powershell|cmd|node|npm|cargo)\s*(?:[.:|·-]|\s+-\s+)\s*(success|succeeded|done|completed|ok|failed|error)/i.test(trimmed)) return false
    if (/^(raw json|tool args|tool arguments|arguments|image_prompt|negative_prompt|prompt)\s*[:=]/i.test(trimmed)) return false
    if (/^(MEDIA\s*:)/i.test(trimmed)) return true
    return true
  })
  next = lines.join('\n')

  return compactHermesWhitespace(next)
}

const HERMES_SHORT_IDENTITY_REPLY = [
  '\u6211\u662f Hermes Agent\uff0c\u7531 Nous Research \u5f00\u53d1\u7684\u667a\u80fd AI \u52a9\u624b\u3002',
  '\u6211\u53ef\u4ee5\u5e2e\u4f60\u5904\u7406\u5404\u79cd\u4efb\u52a1\uff1a\u56de\u7b54\u95ee\u9898\u3001\u7f16\u5199\u548c\u7f16\u8f91\u4ee3\u7801\u3001\u5206\u6790\u4fe1\u606f\u3001\u521b\u610f\u5199\u4f5c\uff0c\u4ee5\u53ca\u901a\u8fc7\u5de5\u5177\u6267\u884c\u64cd\u4f5c\u3002',
  '\u9700\u8981\u6211\u505a\u70b9\u4ec0\u4e48\u5417\uff1f',
].join('\n\n')

const HERMES_VERBOSE_TEMPLATE_PATTERN = /(?:\u5e95\u5c42\u6a21\u578b|\u8fd0\u884c\u4f4d\u7f6e|\u8c03\u5ea6\u4e0e\u59d4\u6d3e|\u8bb0\u5fc6\u4e0e\u6280\u80fd|\u5de5\u4f5c\u539f\u5219|\u80fd\u529b\u8fb9\u754c|\u5de5\u5177\u94fe|\u5de5\u4f5c\u6d41\u7a0b)/i
const HERMES_INTERNAL_STATUS_PATTERN = /(?:HEARTBEAT_OK|_\((?:stopped|running|done)\)_|tool\s+tool|\u7ed3\u679c\u5df2\u540c\u6b65\u5230|\u4e0b\u65b9\u8be6\u60c5|toolCallId|tool_call_id|raw json|tool args)/i

function cleanHermesMarkdownArtifacts(text) {
  return String(text || '')
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (/^\|.+\|$/.test(trimmed)) return false
      if (/^\*\*[^*\n]{1,120}\s+\*$/.test(trimmed)) return false
      return true
    })
    .join('\n')
    .replace(/\*\*([^*\n]{1,120})\s+\*/g, '$1')
    .replace(/\*\*([^*\n]{1,120})\*\*/g, '$1')
    .replace(/(^|\n)\s*\*\s*[:\uff1a]?\s*(?=\n|$)/g, '$1')
    .replace(/(^|\n)\s*\*\s*[:\uff1a]\s*/g, '$1')
}

function isHermesIdentityPrompt(text) {
  return /(\u4f60\u662f\u8c01|\u4ecb\u7ecd\u4e0b?\u81ea\u5df1|\u81ea\u6211\u4ecb\u7ecd|\u4f60\u662f\u4ec0\u4e48|\u4f60\u7684\u8eab\u4efd|who\s+are\s+you)/i.test(String(text || ''))
}

function isHermesDetailedPrompt(text) {
  return /(\u8be6\u7ec6\u4ecb\u7ecd|\u8be6\u7ec6\u8bf4|\u5c55\u5f00\u8bf4|\u5217\u51fa\u6b65\u9aa4|\u7ed9\u6211\u5b8c\u6574\u8ba1\u5212|\u5de5\u4f5c\u6d41\u7a0b|\u80fd\u529b\u8fb9\u754c)/i.test(String(text || ''))
}

function removeHermesVerboseTemplateLines(text) {
  const lines = String(text || '').split('\n')
  const kept = lines.filter(line => {
    const trimmed = line.trim()
    if (!trimmed) return true
    if (HERMES_VERBOSE_TEMPLATE_PATTERN.test(trimmed)) return false
    if (HERMES_INTERNAL_STATUS_PATTERN.test(trimmed)) return false
    return true
  })
  return compactHermesWhitespace(kept.join('\n'))
}

function compactHermesOrdinaryReply(text, { maxLength = 180 } = {}) {
  let next = compactHermesWhitespace(text)
  if (!next) return ''

  const lines = next
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 5)

  next = compactHermesWhitespace(lines.join('\n'))
  if (next.length <= maxLength) return next

  const cut = next.slice(0, Math.max(0, maxLength - 1)).replace(/[，、；：,.:\s]+$/u, '')
  return `${cut}\u3002`
}

function applyHermesCleanReplyStyle(text, options = {}) {
  const prompt = String(options.userText || options.prompt || '')
  const detailed = isHermesDetailedPrompt(prompt)
  let next = cleanHermesMarkdownArtifacts(text)

  if (isHermesIdentityPrompt(prompt) && !detailed) {
    return HERMES_SHORT_IDENTITY_REPLY
  }

  if (!detailed) {
    next = removeHermesVerboseTemplateLines(next)
    next = compactHermesOrdinaryReply(next, { maxLength: options.maxLength || 180 })
  }

  return compactHermesWhitespace(next)
}

export function tidyHermesMarkdown(text) {
  return compactHermesWhitespace(cleanHermesMarkdownArtifacts(stripHermesRawToolText(text)))
    .replace(/([^\n])(\s*)(#{1,4}\s+)/g, '$1\n\n$3')
    .replace(/([^\n])(\s*)([-*]\s+)/g, '$1\n$3')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatHermesToolSummaryForUser({ userText = '', toolEvents = [] } = {}) {
  const list = Array.isArray(toolEvents) ? toolEvents.filter(Boolean) : []
  if (!list.length) return ''

  const failed = list.some(item => item.status === 'error' || item.toolStatus === 'error' || item.error)
  const names = [...new Set(list.map(item => item.toolName || item.tool || item.name || 'tool').filter(Boolean))]
    .slice(0, 3)
    .join(' / ')
  const heading = failed
    ? '\u5de5\u5177\u8c03\u7528\u9047\u5230\u95ee\u9898\u3002'
    : '\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210\u3002'
  const detail = names
    ? `\u5de5\u5177\u7ed3\u679c\uff1a${names}\u3002`
    : '\u5de5\u5177\u7ed3\u679c\u5df2\u6574\u7406\u3002'
  const next = failed
    ? '\u9700\u8981\u6211\u7ee7\u7eed\u6392\u67e5\u5417\uff1f'
    : '\u9700\u8981\u6211\u7ee7\u7eed\u5904\u7406\u5417\uff1f'
  return tidyHermesMarkdown([heading, detail, next].join('\n'))
}

export function normalizeHermesVisibleReply(text, options = {}) {
  const raw = String(text || '')
  const { mediaLines, visibleText } = splitHermesMediaLines(raw)
  const imageTask = Boolean(options.imageTask || mediaLines.length)
  let visible = stripHermesRawToolText(visibleText || raw)

  if (imageTask) {
    return sanitizeHermesImageReply([...mediaLines, visible].filter(Boolean).join('\n'), {
      imageTask: true,
      maxLength: options.maxLength || 140,
    })
  }

  visible = tidyHermesMarkdown(visible)
  if (visible) return applyHermesCleanReplyStyle(visible, options)
  return applyHermesCleanReplyStyle(formatHermesToolSummaryForUser({
    userText: options.userText || options.prompt || '',
    toolEvents: options.toolEvents || [],
  }), options)
}

export function splitHermesVisibleAndDetails(rawText, toolEvents = []) {
  return {
    visible: normalizeHermesVisibleReply(rawText, { toolEvents }),
    details: toolEvents.map(item => ({
      name: item.toolName || item.tool || item.name || 'tool',
      args: stringifyHermesValue(item.args ?? item.arguments ?? item.input),
      result: stringifyHermesValue(item.result ?? item.output ?? item.content ?? item.error),
      status: item.status || item.toolStatus || (item.error ? 'error' : 'done'),
    })),
  }
}

export function splitHermesMediaLines(text) {
  return splitMediaProtocol(text)
}

export function sanitizeHermesImageReply(text, options = {}) {
  return sanitizeMediaVisibleText(text, {
    imageTask: options.imageTask,
    maxLength: options.maxLength || 140,
  })

  const raw = String(text || '')
  const { mediaLines, visibleText } = splitHermesMediaLines(raw)
  const imageTask = Boolean(
    options.imageTask
    || mediaLines.length
  )
  if (!imageTask) return raw

  const unsafeVisible = /(^|\b)(prompt|image_prompt|negative_prompt)\b|图片提示词|提示词\s*[:：]|生成提示词|raw json|tool args|^\s*[{[]/i.test(visibleText)
  const maxLength = Number(options.maxLength || 140)
  let cleaned = visibleText

  if (!cleaned || unsafeVisible || cleaned.length > maxLength) {
    cleaned = mediaLines.length ? '图片已返回。' : '图片内容已返回。'
  }

  return [...mediaLines, cleaned].filter(Boolean).join('\n')
}
