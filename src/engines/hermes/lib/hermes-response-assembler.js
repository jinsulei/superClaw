import { ensureCompleteVisibleReply, sanitizeMediaVisibleText, splitMediaProtocol } from '../../../shared/chat-output-guard.js'

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
  if (b.startsWith(a)) return b
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

  // Some providers emit a closing reasoning tag after the hidden reasoning
  // payload has already been removed upstream. Never show that stray marker
  // as part of the user-facing final answer.
  next = next.replace(/<\/?(?:think|thinking|reasoning|analysis)>\s*/gi, '')
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
export const HERMES_IMAGE_CLARIFY_REPLY = '我已收到图片。你想让我做什么？例如：看图说明、提取文字、检查问题，或按图执行任务。'
export const HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY = '当前模型暂不支持基于上传图片生成新图，你可以改为让我分析这张图，或切换支持图生图的模型。'

export function normalizeHermesImageDetail(detail, provider = '') {
  const value = String(detail || '').toLowerCase().trim()
  if (!value || value === 'auto') return undefined
  if (value === 'low' || value === 'high') return value
  return undefined
}

export function buildHermesImageUrlPayload({ url, base64, mime, detail, provider } = {}) {
  const imageUrl = String(url || '').trim()
    || (base64 ? `data:${mime || 'image/png'};base64,${base64}` : '')
  if (!imageUrl) return null
  const normalizedDetail = normalizeHermesImageDetail(detail, provider)
  const payload = { url: imageUrl }
  if (normalizedDetail) payload.detail = normalizedDetail
  return payload
}

export function detectHermesImageIntent({ text = '', attachments = [] } = {}) {
  const hasImage = (Array.isArray(attachments) ? attachments : []).some((item) => {
    const mime = String(item?.mimeType || item?.mediaType || item?.mime || '').toLowerCase()
    const kind = String(item?.kind || item?.category || item?.type || '').toLowerCase()
    return kind === 'image' || mime.startsWith('image/')
  })
  if (!hasImage) return 'no_image'

  const s = String(text || '').trim()
  if (!s) return 'ask_clarify'
  if (/图生图|按这张图生成|照着这张图生成|基于这张图生成|换风格|风格转换|生成相似|生成新图|image-to-image|img2img/i.test(s)) {
    return 'image_to_image'
  }
  if (/图片里有什么|图里有什么|截图里有什么|画面里|画面中|描述这张图|描述图片|看图说明|看看图片|看看这张图|看一下图片|分析图片内容|分析这张图|这张图.*问题|识别图片|提取图片文字|图片文字|OCR|问题在哪|哪里不对/i.test(s)) {
    return 'image_understanding'
  }
  if (/按照|根据|继续|执行|运行|检查|排查|修复|修改|创建|删除|整理|打开|点击|查找|搜索|读取|写入|改代码|代码|文件|路径|项目|仓库|目录|报错|错误|页面|按钮|进程|gateway|配置|打包|上传|复制|清理|验证/i.test(s)) {
    return 'image_context_task'
  }
  return 'image_context_task'
}

function cleanHermesMarkdownArtifacts(text) {
  return String(text || '')
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      // GFM tables are valid user-visible Markdown. This finalizer runs after
      // streaming completes, so removing pipe-delimited rows here made a table
      // appear while streaming and disappear in the final Hermes reply.
      if (/^\*\*[^*\n]{1,120}\s+\*$/.test(trimmed)) return false
      return true
    })
    .join('\n')
    .replace(/\*\*([^*\n]{1,120})\s+\*/g, '$1')
    .replace(/\*\*([^*\n]{1,120})\*\*/g, '$1')
    .replace(/(^|\n)\s*\*\s*[:\uff1a]?\s*(?=\n|$)/g, '$1')
    .replace(/(^|\n)\s*\*\s*[:\uff1a]\s*/g, '$1')
}

function isHermesGfmTableDivider(line = '') {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || '').trim())
}

function isHermesGfmTableRow(line = '') {
  const value = String(line || '').trim()
  return value.includes('|') && !isHermesGfmTableDivider(value)
}

function protectHermesGfmTableBlocks(text = '') {
  const lines = String(text || '').split('\n')
  const blocks = []
  const output = []
  for (let index = 0; index < lines.length; index += 1) {
    if (isHermesGfmTableRow(lines[index]) && isHermesGfmTableDivider(lines[index + 1])) {
      const rows = [lines[index], lines[index + 1]]
      index += 2
      while (index < lines.length && isHermesGfmTableRow(lines[index])) {
        rows.push(lines[index])
        index += 1
      }
      index -= 1
      const key = `__HERMES_GFM_TABLE_${blocks.length}__`
      blocks.push(rows.join('\n'))
      output.push(key)
      continue
    }
    output.push(lines[index])
  }
  return { text: output.join('\n'), blocks }
}

function restoreHermesGfmTableBlocks(text = '', blocks = []) {
  return String(text || '').replace(/__HERMES_GFM_TABLE_(\d+)__/g, (_, index) => blocks[Number(index)] || '')
}

function isHermesIdentityPrompt(text) {
  return /(\u4f60\u662f\u8c01|\u4ecb\u7ecd\u4e0b?\u81ea\u5df1|\u81ea\u6211\u4ecb\u7ecd|\u4f60\u662f\u4ec0\u4e48|\u4f60\u7684\u8eab\u4efd|who\s+are\s+you)/i.test(String(text || ''))
}

export function isBriefAllowedHermesQuestion(text) {
  return /只回复|简短回答|一句话|不要解释|yes or no|OK/i.test(String(text || ''))
}

export function shouldHermesUseDetailedAnswer(text) {
  return /详细|展开|步骤|完整|方案|排查|原因|为什么|怎么修|如何解决|工作进展|汇报问题|检查结果|详细介绍|详细说|展开说|列出步骤|给我完整计划|工作流程|能力边界/i.test(String(text || ''))
}

function isHermesDetailedPrompt(text) {
  return shouldHermesUseDetailedAnswer(text)
}

export function isHermesStructuredReplyIntent(userText = '', text = '') {
  const prompt = String(userText || '')
  const body = String(text || '')
  return (
    /skills?|技能|能力清单|你能做什么|可用工具|工具列表|工作进展|工作汇报|汇报问题|排查结果|检查结果|当前进程|有哪些能力|能力盘点|工具结果/i.test(prompt)
    || /当前可用\s*Skills|已加载.*skills?|skill_view|devops\/|minimax-image-generation/i.test(body)
  )
}

export function isHermesSkillsLikeReply(text = '') {
  return /当前可用\s*Skills|已加载.*skills?|skill_view|devops\/|minimax-image-generation/i.test(String(text || ''))
}

export function shouldKeepHermesStructuredLength(userText = '', text = '') {
  return isHermesStructuredReplyIntent(userText, text) || isHermesSkillsLikeReply(text)
}

function limitHermesStructuredLines(text, maxNonEmpty = 12) {
  const kept = []
  let nonEmpty = 0
  for (const line of String(text || '').split('\n')) {
    if (line.trim()) nonEmpty += 1
    kept.push(line)
    if (nonEmpty >= maxNonEmpty) break
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function stripHermesInternalVisibleNoise(text) {
  return String(text || '')
    .replace(/结果已同步到下方详情。?/g, '')
    .replace(/工具已完成[，,]\s*结果已同步/g, '')
    .replace(/\btool\s+tool\b/gi, '工具调用')
    .replace(/HEARTBEAT_OK/g, '')
    .replace(/\[TOOL_CALL\][^\n]*/gi, '')
    .replace(/^\s*---+\s*$/gm, '')
    .trim()
}

function formatHermesSkillsStructuredReply(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^\s*#+\s*$/gm, '')
    .replace(/^\s*(?:📌|⚠️|✅|💬)\s*$/gm, '')
    .replace(/\s*(📦\s*[a-z0-9][a-z0-9._/@-]{2,}\s*(?:用途|说明|描述)\s*[:：])/gi, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const entries = []
  const entryPattern = /📦\s*([a-z0-9][a-z0-9._/@-]{2,})\s*(?:用途|说明|描述)\s*[:：]\s*([\s\S]*?)(?=\n📦\s*[a-z0-9][a-z0-9._/@-]{2,}\s*(?:用途|说明|描述)\s*[:：]|$)/gi
  let match
  while ((match = entryPattern.exec(cleaned))) {
    const name = String(match[1] || '').trim()
    let desc = String(match[2] || '')
      .replace(/\s*(?:触发|适用|调用)\s*[:：][\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (desc.length > 68) desc = `${desc.slice(0, 68).replace(/[，。；：、\s]*$/, '')}。`
    if (name) entries.push(`📦 **${name}** — ${desc || '可用 Skill'}`)
  }

  if (entries.length) {
    return limitHermesStructuredLines([
      '📌 当前可用 Skills',
      '',
      ...entries.slice(0, 10),
      '',
      '👉 需要查看或使用哪个 Skill，直接告诉我名字。',
    ].join('\n'), 14)
  }

  const lines = cleaned
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^[-*#]?$/.test(line))
    .filter(line => !/^(?:📌|⚠️|✅|💬)$/.test(line))
    .slice(0, 10)

  return limitHermesStructuredLines([
    '📌 当前可用 Skills',
    '',
    ...lines,
    '',
    '👉 需要查看或使用哪个 Skill，直接告诉我名字。',
  ].join('\n'), 14)
}

export function formatHermesStructuredReply(text = '', userText = '') {
  let raw = stripHermesInternalVisibleNoise(tidyHermesMarkdown(stripHermesRawToolText(text)))
  if (!raw) return ''

  if (/skill|skills|Skill|Skills|技能列表|能力清单|当前可用|可用.*(?:技能|能力|工具)|工具列表/i.test(`${userText}\n${raw}`)) {
    return formatHermesSkillsStructuredReply(raw)
  }

  if (/📌|📁|🛠|🧰|✅|👉|##|当前可用|完整列表|账户|开发者工具|网络|任务/.test(raw)) {
    return limitHermesStructuredLines(raw)
  }

  const scope = `${userText}\n${raw}`
  if (/skill|skills|技能列表|能力清单|当前可用|可用.*(?:技能|能力|工具)|工具列表/i.test(scope)) {
    const lines = raw
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^[-*]?$/.test(line))
      .slice(0, 10)

    return limitHermesStructuredLines([
      '📌 当前可用能力',
      '',
      lines.join('\n') || '我已整理当前可用能力，但没有拿到更详细的分类结果。',
      '',
      '👉 你告诉我要用哪一项，我可以直接继续处理。',
    ].join('\n'))
  }

  if (/进展|汇报|排查|检查|进程|状态|问题/i.test(scope)) {
    const lines = raw
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 6)

    return limitHermesStructuredLines([
      '📌 检查结果',
      '',
      ...lines,
      '',
      '👉 需要我继续下一步的话，直接告诉我。',
    ].join('\n'))
  }

  return raw
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

function compactHermesOrdinaryReply(text, { maxLength = 420, maxLines = 5 } = {}) {
  let next = compactHermesWhitespace(text)
  if (!next) return ''

  const lines = next
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)

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

  if (isBriefAllowedHermesQuestion(prompt)) {
    next = removeHermesVerboseTemplateLines(next)
    return compactHermesWhitespace(next)
  }

  if (shouldKeepHermesStructuredLength(prompt, next)) {
    return formatHermesStructuredReply(next, prompt)
  }

  if (!detailed) next = removeHermesVerboseTemplateLines(next)

  return compactHermesWhitespace(next)
}

export function enforceHermesReplyLength(text, userText = '') {
  const styled = applyHermesCleanReplyStyle(tidyHermesMarkdown(normalizeHermesStreamText(text)), { userText })
  if (isBriefAllowedHermesQuestion(userText)) return styled
  return ensureCompleteVisibleReply(completeHermesReplyIfNeeded(styled, { userText }), {
    agent: 'hermes',
    userText,
    maxChars: 760,
  })
}

export function tidyHermesMarkdown(text) {
  const protectedTables = protectHermesGfmTableBlocks(cleanHermesMarkdownArtifacts(stripHermesRawToolText(text)))
  const tidied = compactHermesWhitespace(protectedTables.text)
    .replace(/([^\n])(\s*)(#{1,4}\s+)/g, '$1\n\n$3')
    .replace(/([^\n])(\s*)([-*]\s+)/g, '$1\n$3')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return restoreHermesGfmTableBlocks(tidied, protectedTables.blocks)
}

export function looksHermesReplyIncomplete(text) {
  const s = String(text || '').trim()
  if (!s) return true
  if (/[:：,，;；]$/.test(s)) return true
  if (/^\s*[-*]\s*$/.test(s)) return true
  if (/```[^`]*$/.test(s)) return true
  if (s.includes('|---') && /\|\s*$/.test(s)) return true
  if (/(下一步|建议|结果|原因)\s*[:：]\s*$/.test(s)) return true
  return false
}

export function completeHermesReplyIfNeeded(text, options = {}) {
  // Finalization may run through several layers. Keep it idempotent and never
  // invent a generic tail from a partial stream snapshot.
  return tidyHermesMarkdown(text)
}

export function mapHermesErrorToUserMessage(error) {
  let raw = ''
  if (typeof error === 'string') raw = error
  else {
    try { raw = JSON.stringify(error || {}) } catch { raw = String(error || '') }
  }

  if (/invalid image detail:\s*auto|invalid params.*image detail/i.test(raw)) {
    return '图片参数不兼容，已自动调整图片请求格式。请重新发送图片，或补充你想让我分析图片的哪一部分。'
  }
  if (/api key|unauthorized|permission|401|403/i.test(raw)) {
    return '任务失败：模型或接口权限不可用，请检查当前模型配置。'
  }
  if (/timeout|timed out|超时/i.test(raw)) {
    return '任务超时：当前请求没有在预期时间内完成，请稍后重试或换个问法。'
  }
  if (/unsupported|not support|不支持/i.test(raw)) {
    return '当前模型暂不支持这个能力。你可以换个问法，或切换支持该能力的模型。'
  }
  return '任务失败：当前请求没有成功完成，请稍后重试。'
}

export function isHermesTaskStatusQuestion(text) {
  return /执行完没有|完成了吗|现在怎么样|进展|工作进展|还在做吗|有没有结果|做完了吗|现在到哪了/i.test(String(text || ''))
}

export function getHermesTaskStatusSummary({ activeTask = null, toolEvents = [], failedTasks = [] } = {}) {
  const task = activeTask || null
  if (task?.status === 'running') {
    const lastStep = stripHermesToolProcessText(task.lastStep) || '正在处理当前任务'
    return `还在执行中。\n\n当前进度：${lastStep}\n\n我会在完成或失败时给你最终结果。`
  }
  if (task?.status === 'success') {
    return `已经执行完成。\n\n结果：${task.summary || '任务已完成。'}\n\n如果你要继续，我可以接着处理下一步。`
  }
  if (task?.status === 'failed') {
    return `任务失败。\n\n原因：${task.error || '当前任务没有成功完成。'}\n\n你可以换个问法，或让我重新执行。`
  }

  const toolSummary = formatHermesToolSummaryForUser({ toolEvents })
  if (toolSummary) return toolSummary

  const failures = Array.isArray(failedTasks) ? failedTasks : []
  if (failures.length) {
    const last = failures[failures.length - 1] || {}
    return `上一轮任务失败。\n\n原因：${last.error || last.message || '未拿到明确错误。'}\n\n你可以让我重新执行。`
  }

  return '当前没有正在执行的 Hermes 任务。'
}

export function isHermesDebugToolsVisible() {
  try {
    return globalThis?.localStorage?.getItem('DEBUG_HERMES_TOOLS') === '1'
  } catch {
    return false
  }
}

export function isHermesInternalToolText(text) {
  const s = String(text || '').trim()
  if (!s) return true

  return (
    /^execute_code\b/i.test(s)
    || /^search_files\b/i.test(s)
    || /^read_file\b/i.test(s)
    || /^tool_result\b/i.test(s)
    || /^tool[_\s-]?call\b/i.test(s)
    || /^tool\s+tool$/i.test(s)
    || /^\[TOOL_CALL\]/i.test(s)
    || /HEARTBEAT_OK/i.test(s)
    || /^\(?_?stopped_?\)?$/i.test(s)
    || /_\((?:stopped|running|done)\)_/i.test(s)
    || /toolCallId|tool_call_id|clientRequestId|runId|arguments/i.test(s)
    || /^stdout\s*[:：]/i.test(s)
    || /^stderr\s*[:：]/i.test(s)
    || /^工具\s*[:：]/.test(s)
    || /^参数\s*[:：]/.test(s)
    || /结果已同步到/.test(s)
    || /工具(?:执行|调用).*(?:中|完成|成功|失败)/.test(s)
    || /调用了.*工具/.test(s)
    || /正在调用工具|先检查|继续查|跑命令/.test(s)
    || (/^[{[]/.test(s) && /[}\]]\s*$/.test(s))
    || (/^[{[]/.test(s) && /(?:tool|arguments|args|stdout|stderr|result|provider)/i.test(s))
  )
}

export function stripHermesToolProcessText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => {
      const s = line.trim()
      if (!s) return false
      if (isHermesInternalToolText(s)) return false
      if (/^>\s*(execute_code|search_files|read_file|tool_result)/i.test(s)) return false
      if (/^(execute_code|search_files|read_file|tool_result)\s*[:：]/i.test(s)) return false
      if (/^(stdout|stderr)\s*[:：]/i.test(s)) return false
      if (/^(工具|参数|执行过程|工作过程)\s*[:：]/.test(s)) return false
      if (/^(raw json|tool args|provider error)\s*[:：]/i.test(s)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractHermesToolVisibleText(event) {
  if (!event) return ''
  const failed = event.status === 'error' || event.toolStatus === 'error' || event.error
  const raw = event.visibleText
    ?? event.userVisibleText
    ?? event.summary
    ?? event.message
    ?? event.text
    ?? event.resultText
    ?? event.output
    ?? event.result
    ?? event.content
    ?? event.error
    ?? ''

  let text = ''
  if (typeof raw === 'string') text = raw
  else if (raw && typeof raw === 'object') {
    text = raw.visibleText
      || raw.userVisibleText
      || raw.summary
      || raw.message
      || raw.text
      || raw.resultText
      || ''
  } else {
    text = String(raw || '')
  }

  text = stripHermesToolProcessText(text)
  if (text) return text
  return failed ? mapHermesErrorToUserMessage(event.error || raw || 'tool failed') : ''
}

export function summarizeHermesToolResultForUser({ userText = '', toolEvents = [] } = {}) {
  const list = Array.isArray(toolEvents) ? toolEvents.filter(Boolean) : []
  if (!list.length) return ''

  const failed = list.some(item => item.status === 'error' || item.toolStatus === 'error' || item.error)
  const cleaned = []
  for (const event of list) {
    const text = extractHermesToolVisibleText(event)
    if (text && !cleaned.includes(text)) cleaned.push(text)
  }

  const joined = cleaned.join('\n\n').trim()
  const taskLike = /进程|状态|检查|排查|汇报|skills?|技能|能力|工具/i.test(String(userText || ''))
  if (joined) {
    if (taskLike) {
      return tidyHermesMarkdown([
        failed ? '任务遇到问题。' : '检查已完成。',
        '',
        joined,
      ].join('\n'))
    }
    return tidyHermesMarkdown(joined)
  }

  if (taskLike) {
    return failed
      ? '检查失败：当前工具没有返回可展示的错误详情，请确认目标是否可访问后重试。'
      : '检查已完成，但没有拿到可展示的详细结果。'
  }
  if (failed) return '任务失败：当前工具没有返回可展示的错误详情，请确认目标是否可访问后重试。'
  return '任务已完成，但没有拿到可展示的详细结果。'
}

export function normalizeHermesUserVisibleAnswer({ text = '', userText = '', toolEvents = [] } = {}) {
  let visible = stripHermesToolProcessText(text)
  if (!visible && Array.isArray(toolEvents) && toolEvents.length) {
    visible = summarizeHermesToolResultForUser({ userText, toolEvents })
  }
  return normalizeHermesVisibleReply(visible, { userText, prompt: userText, toolEvents })
}

export function formatHermesToolSummaryForUser({ userText = '', toolEvents = [] } = {}) {
  const list = Array.isArray(toolEvents) ? toolEvents.filter(Boolean) : []
  if (!list.length) return ''
  return summarizeHermesToolResultForUser({ userText, toolEvents: list })

  const failed = list.some(item => item.status === 'error' || item.toolStatus === 'error' || item.error)
  const names = [...new Set(list.map(item => item.toolName || item.tool || item.name || 'tool').filter(Boolean))]
    .slice(0, 3)
  if (shouldKeepHermesStructuredLength(userText, names.join('\n'))) {
    const skillLike = /skills?|技能|能力|工具列表|可用工具|你能做什么/i.test(userText)
    const title = skillLike ? '📌 当前可用 Skills' : '📌 检查结果'
    const body = names.length
      ? names.map(name => `${name} — ${failed ? '调用遇到问题' : '已完成调用'}`).join('\n')
      : failed ? '工具调用遇到问题。' : '工具调用已完成。'
    const next = skillLike ? '👉 需要用哪个 Skill，直接告诉我。' : '👉 需要我继续下一步的话，直接告诉我。'
    return limitHermesStructuredLines([title, '', body, '', next].join('\n'))
  }

  const nameText = names.join(' / ')
  const heading = failed
    ? '\u5de5\u5177\u8c03\u7528\u9047\u5230\u95ee\u9898\u3002'
    : '\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210\u3002'
  const detail = nameText
    ? `\u5de5\u5177\u7ed3\u679c\uff1a${nameText}\u3002`
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
  let visible = stripHermesToolProcessText(stripHermesRawToolText(visibleText || raw))

  if (imageTask) {
    return sanitizeHermesImageReply([...mediaLines, visible].filter(Boolean).join('\n'), {
      imageTask: true,
      maxLength: options.maxLength || 140,
    })
  }

  visible = tidyHermesMarkdown(visible)
  if (!visible && raw) {
    const repaired = ensureCompleteVisibleReply(raw, {
      agent: 'hermes',
      userText: options.userText || options.prompt || '',
      maxChars: options.maxLength || 760,
    })
    if (repaired) return repaired
  }
  if (visible) {
    const styled = applyHermesCleanReplyStyle(visible, options)
    if (isBriefAllowedHermesQuestion(options.userText || options.prompt)) return styled
    return ensureCompleteVisibleReply(completeHermesReplyIfNeeded(styled, options), {
      agent: 'hermes',
      userText: options.userText || options.prompt || '',
      maxChars: options.maxLength || 760,
    })
  }
  const fallback = applyHermesCleanReplyStyle(formatHermesToolSummaryForUser({
    userText: options.userText || options.prompt || '',
    toolEvents: options.toolEvents || [],
  }), options)
  return ensureCompleteVisibleReply(completeHermesReplyIfNeeded(fallback, { ...options, toolResult: true }), {
    agent: 'hermes',
    userText: options.userText || options.prompt || '',
    maxChars: options.maxLength || 760,
  })
}

export function splitHermesVisibleAndDetails(rawText, toolEvents = []) {
  return {
    visible: normalizeHermesVisibleReply(rawText, { toolEvents }),
    details: isHermesDebugToolsVisible() ? toolEvents.map(item => ({
      name: item.toolName || item.tool || item.name || 'tool',
      args: stringifyHermesValue(item.args ?? item.arguments ?? item.input),
      result: stringifyHermesValue(item.result ?? item.output ?? item.content ?? item.error),
      status: item.status || item.toolStatus || (item.error ? 'error' : 'done'),
    })) : [],
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
