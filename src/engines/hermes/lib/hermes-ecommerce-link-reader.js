import { ECOMMERCE_EXECUTION_STATUS } from '../../../shared/ecommerce/execution-types.js'

const URL_RE = /https?:\/\/[^\s)\]'"<>]+/gi
const SOCIAL_NEEDS_BROWSER_RE = /(?:douyin|iesdouyin|xiaohongshu|xhslink|weixin|mp\.weixin|kuaishou|v\.kuaishou)/i
const GITHUB_RE = /github\.com/i
const VIDEO_RE = /(?:video|v=|douyin|kuaishou|bilibili|youtube|xhslink|xiaohongshu)/i

export function extractHermesEcommerceLinks(text = '') {
  return Array.from(String(text || '').matchAll(URL_RE), (match) => match[0].replace(/[.,;，。；]+$/, ''))
}

export function classifyHermesEcommerceLink(url = '') {
  const value = String(url || '')
  if (!value) return { platform: 'none', status: ECOMMERCE_EXECUTION_STATUS.MISSING }
  if (SOCIAL_NEEDS_BROWSER_RE.test(value)) {
    return {
      platform: 'social_login_or_visual_required',
      status: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
      reason: 'SOCIAL_LINK_REQUIRES_LOGIN_OR_BROWSER_VISUAL_CHECK',
    }
  }
  if (GITHUB_RE.test(value)) {
    return {
      platform: 'github',
      status: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
      reason: 'GITHUB_LINK_REQUIRES_HTTP_STATUS_CHECK',
    }
  }
  return {
    platform: VIDEO_RE.test(value) ? 'video_or_webpage' : 'webpage',
    status: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    reason: 'LINK_READER_REQUIRES_FETCH_OR_BROWSER_TOOL',
  }
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
