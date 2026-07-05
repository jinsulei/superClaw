import { ECOMMERCE_EXECUTION_STATUS } from '../../../shared/ecommerce/execution-types.js'

const URL_RE = /https?:\/\/[^\s)\]'"<>]+/gi
const SOCIAL_NEEDS_BROWSER_RE = /(?:douyin|iesdouyin|xiaohongshu|xhslink|weixin|mp\.weixin|kuaishou|v\.kuaishou)/i
const GITHUB_RE = /github\.com/i
const VIDEO_RE = /(?:video|v=|douyin|kuaishou|bilibili|youtube|youtu\.be|xhslink|xiaohongshu|weixin|channels)/i
const SENSITIVE_KEY_RE = /(?:api[_-]?key|token|cookie|secret|access[_-]?token|refresh[_-]?token|password)/i
const SENSITIVE_VALUE_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|fake-(?:api-key|token|cookie|secret|access-token|refresh-token|password)-should-be-redacted)\b/gi

function parseUrl(url = '') {
  try {
    return new URL(String(url || '').trim())
  } catch {
    return null
  }
}

function isPrivateIpv4(hostname = '') {
  const parts = String(hostname || '').split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b, c, d] = parts
  return a === 10
    || a === 127
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || (a === 0 && b === 0 && c === 0 && d === 0)
}

function linkReaderId(value = '') {
  return String(value || 'link_reader')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'link_reader'
}

function isoNow() {
  return new Date().toISOString()
}

export function classifyLinkReaderPlatform(url = '') {
  const parsed = parseUrl(url)
  const host = (parsed?.hostname || String(url || '')).toLowerCase()
  const value = String(url || '').toLowerCase()

  if (host.includes('douyin') || host.includes('iesdouyin')) {
    return { platform: 'douyin', platform_id: 'douyin', content_type: 'short_video' }
  }
  if (host.includes('kuaishou')) {
    return { platform: 'kuaishou', platform_id: 'kuaishou', content_type: 'short_video' }
  }
  if (host.includes('xiaohongshu') || host.includes('xhslink')) {
    return { platform: 'xiaohongshu', platform_id: 'xiaohongshu', content_type: 'social_post' }
  }
  if ((host.includes('weixin') && value.includes('channels')) || host.includes('channels.weixin.qq.com')) {
    return { platform: 'shipinhao', platform_id: 'wechat_channels', content_type: 'short_video' }
  }
  if (host.includes('bilibili')) {
    return { platform: 'bilibili', platform_id: 'bilibili', content_type: 'video' }
  }
  if (host.includes('youtube') || host === 'youtu.be') {
    return { platform: 'youtube', platform_id: 'youtube', content_type: 'video' }
  }
  if (host.includes('tiktok')) {
    return { platform: 'tiktok', platform_id: 'tiktok', content_type: 'short_video' }
  }
  return {
    platform: parsed ? 'webpage' : 'unknown',
    platform_id: parsed ? 'webpage' : 'unknown',
    content_type: parsed ? 'webpage' : 'unknown',
  }
}

export function extractHermesEcommerceLinks(text = '') {
  return Array.from(String(text || '').matchAll(URL_RE), (match) => match[0].replace(/[.,;，。；]+$/, ''))
}

export function classifyHermesEcommerceLink(url = '') {
  const value = String(url || '')
  const platformInfo = classifyLinkReaderPlatform(value)
  if (!value) return { platform: 'none', status: ECOMMERCE_EXECUTION_STATUS.MISSING }
  if (SOCIAL_NEEDS_BROWSER_RE.test(value)) {
    return {
      platform: 'social_login_or_visual_required',
      source_platform: platformInfo.platform,
      platform_id: platformInfo.platform_id,
      content_type: platformInfo.content_type,
      status: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
      reason: 'SOCIAL_LINK_REQUIRES_LOGIN_OR_BROWSER_VISUAL_CHECK',
    }
  }
  if (GITHUB_RE.test(value)) {
    return {
      platform: 'github',
      source_platform: 'github',
      platform_id: 'github',
      content_type: 'webpage',
      status: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
      reason: 'GITHUB_LINK_REQUIRES_HTTP_STATUS_CHECK',
    }
  }
  return {
    platform: VIDEO_RE.test(value) ? 'video_or_webpage' : 'webpage',
    source_platform: platformInfo.platform,
    platform_id: platformInfo.platform_id,
    content_type: platformInfo.content_type,
    status: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    reason: 'LINK_READER_REQUIRES_FETCH_OR_BROWSER_TOOL',
  }
}

export function classifyLinkReaderUrlSafety(url = '') {
  const raw = String(url || '').trim()
  if (!raw) {
    return { safe: false, reason: 'URL_EMPTY', normalized_url: null, blocked_category: 'empty' }
  }

  const parsed = parseUrl(raw)
  if (!parsed) {
    return { safe: false, reason: 'URL_PARSE_FAILED', normalized_url: null, blocked_category: 'invalid_url' }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      safe: false,
      reason: 'URL_PROTOCOL_NOT_ALLOWED',
      normalized_url: parsed.toString(),
      blocked_category: 'protocol',
    }
  }

  const host = String(parsed.hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { safe: false, reason: 'URL_LOCALHOST_BLOCKED', normalized_url: parsed.toString(), blocked_category: 'localhost' }
  }
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') {
    return { safe: false, reason: 'URL_LOOPBACK_BLOCKED', normalized_url: parsed.toString(), blocked_category: 'loopback' }
  }
  if (isPrivateIpv4(host)) {
    return { safe: false, reason: 'URL_PRIVATE_IP_BLOCKED', normalized_url: parsed.toString(), blocked_category: 'private_ip' }
  }

  return { safe: true, reason: 'URL_ALLOWED', normalized_url: parsed.toString(), blocked_category: null }
}

export function isSafeLinkReaderUrl(url = '') {
  return classifyLinkReaderUrlSafety(url).safe === true
}

export function redactLinkReaderPayload(value) {
  if (value == null) return value
  if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_RE, '[REDACTED]')
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => redactLinkReaderPayload(item))

  const out = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : redactLinkReaderPayload(item)
  }
  return out
}

export function normalizeLinkReaderResult(material = {}) {
  const safeMaterial = redactLinkReaderPayload(material && typeof material === 'object' ? material : {})
  const url = String(safeMaterial.url || '')
  const platformInfo = classifyLinkReaderPlatform(url)
  const materialLevel = safeMaterial.material_level || (safeMaterial.status === 'failed' ? 'fetch_failed' : 'metadata_only')
  const status = safeMaterial.status || (materialLevel === 'fetch_failed' ? 'failed' : 'partial')
  const taskId = safeMaterial.task_id || `link_reader_${linkReaderId(url || platformInfo.platform)}`
  const now = isoNow()
  const visibleText = String(safeMaterial.visible_text || safeMaterial.title || url || 'Link Reader result').trim()
  const failed = status === 'failed' || materialLevel === 'fetch_failed'

  const result = {
    url,
    platform: safeMaterial.platform || platformInfo.platform,
    status,
    material_level: materialLevel,
    metadata: {
      title: safeMaterial.title || '',
      description: safeMaterial.description || '',
      keywords: Array.isArray(safeMaterial.keywords) ? safeMaterial.keywords : [],
      cover: safeMaterial.cover || '',
    },
    visible_text: visibleText,
    transcript_available: safeMaterial.transcript_available === true,
    subtitle_available: safeMaterial.subtitle_available === true,
    audio_transcript_available: safeMaterial.audio_transcript_available === true,
    frame_ocr_available: safeMaterial.frame_ocr_available === true,
    top_comments: Array.isArray(safeMaterial.top_comments)
      ? safeMaterial.top_comments.filter(comment => comment?.type === 'comment')
      : [],
    title: safeMaterial.title || '',
    duration: safeMaterial.duration || null,
    quotes: Array.isArray(safeMaterial.quotes) ? safeMaterial.quotes : [],
    timeline: Array.isArray(safeMaterial.timeline) ? safeMaterial.timeline : [],
    next_actions: Array.isArray(safeMaterial.next_actions) ? safeMaterial.next_actions : [],
    task_events: Array.isArray(safeMaterial.task_events) ? safeMaterial.task_events : [],
    tool_runs: Array.isArray(safeMaterial.tool_runs) ? safeMaterial.tool_runs : [],
    material_limitations: Array.isArray(safeMaterial.material_limitations) ? safeMaterial.material_limitations : [],
    error_code: safeMaterial.error_code || '',
    error_message: safeMaterial.error_message || '',
  }

  if (!result.task_events.length) {
    result.task_events = [{
      event_id: `${taskId}_event_${failed ? 'failed' : 'created'}`,
      task_id: taskId,
      task_type: 'link_reader',
      event_type: failed ? 'task_failed' : 'task_created',
      actor: 'hermes',
      source: 'hermes.link_reader.wrapper',
      status: failed ? 'failed' : 'created',
      visible_text: result.visible_text,
      raw_payload: safeMaterial,
      visibility: 'normal',
      severity: failed ? 'warning' : 'info',
      created_at: now,
    }]
  }

  if (!result.tool_runs.length) {
    result.tool_runs = [{
      tool_run_id: `${taskId}_tool_assistant_fetch_url`,
      task_id: taskId,
      tool_name: 'assistant_fetch_url',
      provider: 'local',
      status: failed ? 'failed' : 'completed',
      input_summary: url,
      output_summary: result.visible_text,
      error_code: result.error_code || undefined,
      error_message: result.error_message || undefined,
      started_at: now,
      completed_at: now,
    }]
  }

  return redactLinkReaderPayload(result)
}

export function buildHermesEcommerceLinkReadPlan(text = '', tools = {}) {
  const links = extractHermesEcommerceLinks(text)
  if (!links.length) {
    return {
      matched: false,
      reader: 'hermes',
      status: ECOMMERCE_EXECUTION_STATUS.MISSING,
      reason: 'NO_LINK_FOUND',
      links: [],
    }
  }

  const canFetch = tools.fetch === true || tools.webFetch === true || tools.browser === true
  const canVisual = tools.browser === true || tools.screenshot === true
  const details = links.map((url) => {
    const classified = classifyHermesEcommerceLink(url)
    if (classified.platform === 'social_login_or_visual_required' && !canVisual) {
      return {
        url,
        ...classified,
        userVisibleFallback: 'Need login, screenshot, or browser visual mode; do not pretend the page was fetched.',
      }
    }
    if (!canFetch && !canVisual) {
      return {
        url,
        ...classified,
        userVisibleFallback: 'No link reader is connected; ask for screenshot or browser access.',
      }
    }
    return {
      url,
      ...classified,
      status: ECOMMERCE_EXECUTION_STATUS.REAL,
      reason: 'LINK_READER_TOOL_AVAILABLE',
    }
  })

  return {
    matched: true,
    reader: 'hermes',
    status: details.every((item) => item.status === ECOMMERCE_EXECUTION_STATUS.REAL)
      ? ECOMMERCE_EXECUTION_STATUS.REAL
      : ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    links: details,
    noFakeExecution: true,
  }
}
