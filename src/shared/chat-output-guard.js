function stringifyValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function compactStatusText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_*`~\[\]()（）【】{}<>]/g, '')
}

export function isInternalStatusOnlyText(text) {
  const raw = String(text || '').trim()
  if (!raw) return true

  const compact = compactStatusText(raw)
  if ([
    'stopped',
    'stop',
    'cancelled',
    'canceled',
    'aborted',
    'pending',
    'running',
    'completed',
    'failed',
    'heartbeatok',
    'heartbeat_ok',
    'toolcompleted',
    'toolresultsynced',
  ].includes(compact)) {
    return true
  }

  if (/^\[?\s*tool_call\s*\]?$/i.test(raw)) return true
  if (/^工具已完成[，,:\s]*(结果已同步)?$/i.test(raw)) return true
  if (/^结果已同步$/i.test(raw)) return true
  if (/^\(?\s*stopped\s*\)?$/i.test(raw.replace(/[_*`]/g, ''))) return true
  return false
}

export function stripInternalStatusText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter(line => !isInternalStatusOnlyText(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isHermesCollaborationCapabilityQuestion(text) {
  const value = String(text || '').trim()
  if (!value) return false

  const normalized = value
    .replace(/\s+/g, '')
    .replace(/Claude\s*Code/ig, 'ClaudeCode')

  return [
    /协作任务.*是什么/,
    /能做.*协作任务/,
    /(你|Hermes|三个Agent|三Agent|Agent).*怎么.*协作/,
    /(你|Hermes|三个Agent|三Agent|Agent).*如何.*协作/,
    /(你|Hermes).*怎么.*调度/,
    /(你|Hermes).*如何.*调度/,
    /Hermes.*主脑/,
    /主脑.*怎么.*工作/,
    /调度.*OpenClaw/,
    /调度.*ClaudeCode/,
    /OpenClaw.*ClaudeCode.*配合/,
    /OpenClaw.*ClaudeCode.*怎么.*配合/,
    /三个Agent.*协作/,
    /三Agent.*协作/,
    /Agent.*协作.*怎么/,
  ].some(pattern => pattern.test(normalized))
}

export function formatHermesCollaborationCapabilityReply() {
  return [
    '我是 Hermes，负责做主脑和调度。我的协作任务是先读项目和需求，拆成可执行步骤，明确验收标准，再分配给不同执行端。',
    '',
    '1. OpenClaw 负责执行操作，例如浏览器自动化、页面读取、数据采集、桌面操作和流程执行。',
    '2. ClaudeCode 负责代码、脚本、测试、监督、验收和报告。',
    '3. 执行结果或监督结果会回传给我，我负责最终验收；如果结果不达标，我会继续让 OpenClaw 或 ClaudeCode 返工、补充或重新执行。',
    '',
    '简单说：Hermes 负责规划、调度和最终验收，OpenClaw 负责动手执行，ClaudeCode 负责技术处理和监督验收。',
  ].join('\n')
}

export function formatThreeAgentCapabilityBoundaryReply() {
  return [
    'Hermes: main coordinator for planning, collaboration tasks, memory hints, observability, Link Reader, OCR input routing, and final review.',
    'OpenClaw: execution agent for skills, opr, exec, browser/desktop/file/OCR workflows, ecommerce assistance, and tool calls under tools.profile=coding.',
    'Claude Code: engineering agent for safe, browser_automation, and takeover modes with permission_level and requires_confirmation preserved.',
    'All high-risk actions must keep manual confirmation and results must return through Hermes-visible collaboration or observability records.',
  ].join('\n')
}
export function detectReportIntent(text) {
  const value = String(text || '')
  if (/查看图片|看图|图片里|截图里|分析图片|识别图片|图片内容/.test(value)) return 'image_inspect'
  if (/汇报.*进程|现在.*进程|进程状态|端口|后台服务|运行状态|服务状态/.test(value)) return 'process_status'
  if (/汇报.*问题|问题汇报|当前问题|失败原因|阻塞|哪里错|报错/.test(value)) return 'issue_report'
  if (/工作进展|工作进度|汇报进展|汇报进度|做到哪|进度如何/.test(value)) return 'work_progress'
  if (/汇报工作|工作汇报|执行结果|刚才做了|做了什么|总结一下/.test(value)) return 'work_report'
  return 'general'
}

function toolEventKey(event = {}) {
  const id = event.toolCallId || event.tool_call_id || event.callId || event.id || ''
  const request = event.clientRequestId || event.client_request_id || ''
  const run = event.runId || event.run_id || ''
  const name = event.toolName || event.tool || event.tool_name || event.name || ''
  const content = stringifyValue(event.output ?? event.result ?? event.content ?? event.error ?? '').slice(0, 180)
  return id ? `${request}|${run}|${id}` : `${request}|${run}|${name}|${content}`
}

function normalizeToolEvent(event = {}) {
  const status = String(event.status || event.toolStatus || event.event || '').toLowerCase()
  const error = event.error || (status.includes('error') ? event.result || event.output : '')
  return {
    ...event,
    toolCallId: event.toolCallId || event.tool_call_id || event.callId || event.id || '',
    toolName: event.toolName || event.tool || event.tool_name || event.name || 'tool',
    status: error ? 'error' : (status.includes('running') || status.includes('started') ? 'running' : 'done'),
    output: event.output ?? event.result ?? event.content ?? event.toolResult ?? '',
    error,
    preview: event.preview || event.summary || event.message || '',
  }
}

export function dedupeToolEvents(events = []) {
  const ordered = []
  const byKey = new Map()
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw) continue
    const event = normalizeToolEvent(raw)
    const key = toolEventKey(event)
    if (!byKey.has(key)) {
      byKey.set(key, event)
      ordered.push(key)
      continue
    }
    const existing = byKey.get(key)
    byKey.set(key, {
      ...existing,
      ...event,
      args: existing.args ?? event.args,
      output: event.output || existing.output,
      result: event.result || existing.result,
      error: event.error || existing.error,
      preview: event.preview || existing.preview,
      status: event.status === 'error' ? 'error' : (event.status || existing.status),
    })
  }
  return ordered.map(key => byKey.get(key)).filter(Boolean)
}

function readableToolLine(event = {}) {
  const name = event.toolName || event.name || 'tool'
  const failed = event.status === 'error' || event.error
  const resultText = stringifyValue(event.error || event.output || event.result || event.preview || '').replace(/\s+/g, ' ').trim()
  const shortResult = resultText.length > 160 ? `${resultText.slice(0, 160)}...` : resultText
  if (failed) return `- ${name}：执行失败${shortResult ? `，${shortResult}` : ''}`
  return `- ${name}：已完成${shortResult ? `，结果：${shortResult}` : ''}`
}

export function formatToolResultsForUser({ userText = '', toolEvents = [], fallback = '' } = {}) {
  const tools = dedupeToolEvents(toolEvents)
  const safeFallback = stripInternalStatusText(fallback)
  if (!tools.length) return safeFallback

  const intent = detectReportIntent(userText)
  const lines = tools.map(readableToolLine)
  const hasError = tools.some(t => t.status === 'error' || t.error)
  let title = '工具调用已完成。'

  if (intent === 'process_status') title = '我检查了当前进程/服务状态。'
  else if (intent === 'work_progress') title = '当前工作进展如下。'
  else if (intent === 'issue_report') title = hasError ? '当前问题如下。' : '这轮没有发现新的阻断问题。'
  else if (intent === 'work_report') title = '这轮执行结果如下。'
  else if (intent === 'image_inspect') title = '图片相关检查结果如下。'

  return [title, ...lines].join('\n')
}

export function splitMediaProtocol(text) {
  const mediaLines = []
  const visibleLines = []
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^\s*MEDIA\s*:/i.test(line)) mediaLines.push(line.trim())
    else visibleLines.push(line)
  }
  return { mediaLines, visibleText: visibleLines.join('\n').trim() }
}

export function sanitizeMediaVisibleText(text, options = {}) {
  const raw = String(text || '')
  const { mediaLines, visibleText } = splitMediaProtocol(raw)
  const isImageTask = Boolean(options.imageTask || mediaLines.length)
  if (!isImageTask) return raw

  const unsafe = /(^|\b)(prompt|image_prompt|negative_prompt)\b|图片提示词|提示词\s*[:：]|生成提示词|raw\s*json|tool\s*args|^\s*[{[]/i.test(visibleText)
  const maxLength = Number(options.maxLength || 140)
  let visible = visibleText
  if (!visible || unsafe || visible.length > maxLength) {
    visible = mediaLines.length ? '图片已生成。' : '图片内容已处理。'
  }
  return [...mediaLines, visible].filter(Boolean).join('\n')
}

export function normalizeAssistantVisibleText({ text = '', userText = '', toolEvents = [] } = {}) {
  const mediaCleaned = sanitizeMediaVisibleText(text)
  const cleaned = stripInternalStatusText(mediaCleaned)
  if (cleaned) return cleaned
  return formatToolResultsForUser({ userText, toolEvents, fallback: cleaned })
}

export function looksIncompleteVisibleReply(text = '') {
  const s = String(text || '').trim()
  if (!s) return true

  if (/[:：,，;；、]$/.test(s)) return true
  if (/^\s*[-*]\s*$/.test(s)) return true
  if (/\n\s*[-*]\s*$/.test(s)) return true
  if (/^#{1,6}\s*$/.test(s)) return true
  if (/(下一步|建议|结果|原因|怎么拼|能做什么)\s*[:：]\s*$/.test(s)) return true

  const codeFenceCount = (s.match(/```/g) || []).length
  if (codeFenceCount % 2 === 1) return true

  if (/\|\s*$/.test(s)) return true

  const lines = s.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let i = 0; i < lines.length - 1; i += 1) {
    const header = lines[i]
    const sep = lines[i + 1]
    const isTableHeader = /^\|.+\|$/.test(header)
    const isTableSep = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(sep)
    if (isTableHeader && isTableSep) {
      const dataRows = lines.slice(i + 2).filter(line => /^\|.+\|$/.test(line) && !/^\|\s*\|?\s*$/.test(line))
      if (!dataRows.length) return true
    }
  }

  return false
}

export function trimAtSafeSentenceBoundary(text = '', maxChars = 520) {
  const s = String(text || '').trim()
  if (!s || s.length <= maxChars) return s

  const clipped = s.slice(0, Math.max(1, maxChars))
  const idx = Math.max(
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？'),
    clipped.lastIndexOf('\n'),
  )

  if (idx > 120) return clipped.slice(0, idx + 1).trim()
  return `${clipped.replace(/[，,；;：:\s|]*$/, '').trim()}。`
}

function isEcommerceVisibleReplyContext(text = '') {
  return /电商|外卖|美团|饿了么|热词|店铺|商品|订单|评论|发布|上下架|抖音|抖店|快手|小红书|淘宝|天猫|拼多多|ecommerce|shop|order/i.test(String(text || ''))
}

function repairIncompleteVisibleReply(text = '', { agent = '', userText = '' } = {}) {
  const s = String(text || '').trim()
  const context = `${userText}\n${s}`

  if (isEcommerceVisibleReplyContext(context)) {
    if (/openclaw/i.test(agent)) {
      return [
        'OpenClaw 不是电商平台本身，但可以作为执行层 Agent，配合现有工具处理电商相关任务。',
        '',
        '可以协助：',
        '- 热词、关键词、店铺、商品、订单、评论等页面信息检查。',
        '- 读取页面、截图、整理可见内容并生成结构化摘要。',
        '- 生成商品文案、评论回复、公屏回复、操作建议等草稿。',
        '- 配合浏览器或桌面操作完成可控的页面协助任务。',
        '',
        '安全边界：付款、下单、发布、上下架、登录、删除、自动评论或私信，都需要你确认并手动完成。',
        '',
        '你告诉我要处理的平台和目标，我再继续。',
      ].join('\n')
    }

    if (/hermes/i.test(agent)) {
      return [
        'Hermes 可以负责电商任务的理解、拆解和监督，但不会自动替你付款或发布高风险内容。',
        '',
        '可以协助：',
        '- 根据截图、链接或文字拆解电商问题。',
        '- 整理热词、素材、文案、评论回复和操作思路。',
        '- 给 OpenClaw 生成安全的执行指令，并检查结果是否符合目标。',
        '- 外卖或页面协助会停在付款、发布、删除等高风险动作之前。',
        '',
        '你告诉我要处理的平台和目标，我再继续。',
      ].join('\n')
    }
  }

  const safe = trimAtSafeSentenceBoundary(s, 520)
  if (/hermes/i.test(String(agent || ''))) {
    return safe || s
  }
  if (!safe || looksIncompleteVisibleReply(safe)) {
    return '这次回复没有完整生成。请你再发一次问题，我会重新整理成完整结论。'
  }
  return safe
}

export function ensureCompleteVisibleReply(text = '', options = {}) {
  const raw = String(text || '').trim()
  if (!raw) return ''

  if (/hermes/i.test(String(options.agent || ''))) {
    return raw.replace(/\n{3,}/g, '\n\n').trim()
  }

  let next = trimAtSafeSentenceBoundary(raw, Number(options.maxChars || 680))
  if (looksIncompleteVisibleReply(next)) {
    next = repairIncompleteVisibleReply(next, options)
  }

  return String(next || '').replace(/\n{3,}/g, '\n\n').trim()
}
