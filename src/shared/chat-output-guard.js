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
