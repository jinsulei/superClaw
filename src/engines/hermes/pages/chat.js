/**
 * Hermes Chat — editorial luxury re-write (Phase 4).
 *
 * Layout matches the official `hermes-web-ui`'s ChatPanel:
 *   ┌────────────────┬──────────────────────────────────────────────┐
 *   │ SessionList    │ Header: title · source · new-chat button     │
 *   │ (groups +      ├──────────────────────────────────────────────┤
 *   │  pinned +      │ MessageList (user / assistant / tool)         │
 *   │  live badge)   │                                              │
 *   │                ├──────────────────────────────────────────────┤
 *   │                │ ChatInput (textarea + slash menu + send)      │
 *   └────────────────┴──────────────────────────────────────────────┘
 *
 * State lives in `chat-store.js`; this module only does DOM + events.
 */
import { t } from '../../../lib/i18n.js'
import { api, invalidate, isTauriRuntime } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { showConfirm, showContentModal } from '../../../components/modal.js'
import { getChatStore, getSourceLabel } from '../lib/chat-store.js'
import { classifyHermesEcommerceWorkflowIntent } from '../lib/ecommerce-workflow-guard.js'
import {
  COLLAB_TARGETS,
  buildTaskContext,
  buildExecutionBrief,
  buildReviewBrief,
  createTaskRequest,
  createCollaborationTask,
  createTaskProgress,
  createTaskResult,
  consumePendingDispatch,
  listAgentTaskMessages,
  normalizeClaudeCodeMode,
  openCollaborationPanel,
  setPendingDispatch,
  shortGoal,
  targetLabel,
  updateCollaborationTask,
} from '../../../lib/collaboration.js'
import { createSpeechPlaybackController, createVoiceInputController } from '../../../lib/voice.js'
import { clipboardHasImage, getUniqueClipboardImageFiles } from '../../../lib/clipboard-images.js'
import { ocr, formatOcrResult } from '../../../lib/ocr-service.js'
import { compactChatMessage } from '../../../shared/compact-chat-policy.js'
import {
  loadModelVoiceConfig,
  modelVoiceInputReady,
  modelVoiceOutputReady,
  synthesizeWithModelVoice,
  transcribeWithModelVoice,
} from '../../../lib/model-voice.js'
import { renderScreenshotCardHtml, renderUserConfirmationCardHtml } from '../../../shared/life-assistant-ui.js'
import { isStage1DesktopAssistEnabled } from '../../../shared/ecommerce-stage1/feature-flag.js'
import { detectStage1Intent } from '../../../shared/ecommerce-stage1/planner.js'
import { runStage1DesktopAssist } from '../../../shared/ecommerce-stage1/runner.js'
import { Stage1MessageType } from '../../../shared/ecommerce-stage1/types.js'
import { isStage2LowRiskEnabled } from '../../../shared/ecommerce-stage2/feature-flag.js'
import { detectStage2Intent } from '../../../shared/ecommerce-stage2/planner.js'
import { runStage2LowRiskOps } from '../../../shared/ecommerce-stage2/runner.js'
import { Stage2MessageType } from '../../../shared/ecommerce-stage2/types.js'
import { renderStage2CardMessageHtml } from '../../../shared/ecommerce-stage2/chat-cards.js'
import { isStage3PublishPrepEnabled } from '../../../shared/ecommerce-stage3/feature-flag.js'
import { detectStage3Intent } from '../../../shared/ecommerce-stage3/input-parser.js'
import { runStage3PublishPrep } from '../../../shared/ecommerce-stage3/runner.js'
import { Stage3MessageType } from '../../../shared/ecommerce-stage3/types.js'
import { renderStage3CardMessageHtml } from '../../../shared/ecommerce-stage3/chat-cards.js'
import { isStage4DoudianListingEnabled } from '../../../shared/ecommerce-stage4/feature-flag.js'
import { detectStage4Intent } from '../../../shared/ecommerce-stage4/input-parser.js'
import { runStage4DoudianListing } from '../../../shared/ecommerce-stage4/runner.js'
import { Stage4MessageType } from '../../../shared/ecommerce-stage4/types.js'
import { renderStage4CardMessageHtml } from '../../../shared/ecommerce-stage4/chat-cards.js'
import {
  isStage5LiveAssistEnabled,
  isStage6VideoPatrolEnabled,
} from '../../../shared/ecommerce-stage56/feature-flag.js'
import { detectStage56Intent } from '../../../shared/ecommerce-stage56/video-patrol.js'
import { runStage56Ops } from '../../../shared/ecommerce-stage56/runner.js'
import { Stage56MessageType } from '../../../shared/ecommerce-stage56/types.js'
import { renderStage56CardMessageHtml } from '../../../shared/ecommerce-stage56/chat-cards.js'

// ----------------------------------------------------------- helpers

function renderEcommerceStageCardHtml(message = {}) {
  if ([
    Stage2MessageType.TREND_INSIGHT_CARD,
    Stage2MessageType.CONTENT_DRAFT_CARD,
    Stage2MessageType.VIDEO_LINK_CARD,
  ].includes(message.type)) return renderStage2CardMessageHtml(message)

  if ([
    Stage3MessageType.PLATFORM_PREP_CARD,
    Stage3MessageType.PLATFORM_CONFIRMATION_CARD,
  ].includes(message.type)) return renderStage3CardMessageHtml(message)

  if ([
    Stage4MessageType.DOUDIAN_LISTING_PREP_CARD,
    Stage4MessageType.PRICE_INVENTORY_CONFIRMATION_CARD,
    Stage4MessageType.SUBMIT_REVIEW_CONFIRMATION_CARD,
  ].includes(message.type)) return renderStage4CardMessageHtml(message)

  if ([
    Stage56MessageType.LIVE_REPLY_CARD,
    Stage56MessageType.LIVE_REPLY_CONFIRMATION_CARD,
    Stage56MessageType.VIDEO_CANDIDATE_CARD,
    Stage56MessageType.VIDEO_DECOMPOSE_CARD,
    Stage56MessageType.MATERIAL_RECORD_CARD,
  ].includes(message.type)) return renderStage56CardMessageHtml(message)

  return ''
}

let _tauriListenFn = null
async function tauriListen(event, cb) {
  if (!isTauriRuntime()) return () => {}
  if (!_tauriListenFn) {
    const mod = await import('@tauri-apps/api/event')
    _tauriListenFn = mod.listen
  }
  return _tauriListenFn(event, cb)
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeRegExp(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sanitizeMarkdownUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return '#'
  if (raw.startsWith('#')) return raw
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const u = new URL(raw, window.location.origin)
    if (['http:', 'https:', 'mailto:'].includes(u.protocol)) return raw
  } catch {}
  return '#'
}

/** Minimal Markdown → HTML (supports fenced code, bold/italic, headings, lists, links). */
function mdToHtml(text) {
  if (!text) return ''
  const blocks = []
  let out = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = blocks.push({ lang, code }) - 1
    return `\u0000CB_${idx}\u0000`
  })
  out = out
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^#### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^(?:\s*[-*]\s+(.+))(?:\n\s*[-*]\s+(.+))*/gm, (m) =>
      '<ul>' + m.trim().split(/\n\s*[-*]\s+/).map(li => `<li>${li.replace(/^[-*]\s+/, '')}</li>`).join('') + '</ul>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      `<a href="${escAttr(sanitizeMarkdownUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
  out = out.replace(/\u0000CB_(\d+)\u0000/g, (_, i) => {
    const { lang, code } = blocks[Number(i)]
    return `<pre class="hm-chat-code-block"><button type="button" class="hm-chat-code-copy" title="${escAttr(t('engine.chatCopyCode'))}">${escHtml(t('engine.chatCopyMessageShort'))}</button><code class="lang-${escHtml(lang)}">${escHtml(code)}</code></pre>`
  })
  return `<p>${out}</p>`
}

/** Pretty-print JSON-ish tool payload; fallback to raw string. */
function prettyJson(val) {
  if (val == null || val === '') return ''
  if (typeof val === 'string') {
    const s = val.trim()
    if (s.startsWith('{') || s.startsWith('[')) {
      try { return JSON.stringify(JSON.parse(s), null, 2) } catch {}
    }
    return val
  }
  try { return JSON.stringify(val, null, 2) } catch { return String(val) }
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (!Number.isFinite(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const mo = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return mo
}

function sessionDisplayTitle(s) {
  return s.workFileName || s.title || t('engine.chatNewSession')
}

function sessionDisplayPath(s) {
  return s.workFileDisplayPath || s.workFilePath || ''
}

function parseAssistantSystemInfo(raw) {
  const text = String(raw || '')
  const home = text.match(/^Home:\s*(.+)$/mi)?.[1]?.trim() || ''
  const sep = text.match(/^Path separator:\s*(.+)$/mi)?.[1]?.trim() || (home.includes('\\') ? '\\' : '/')
  return { home, sep }
}

function joinFsPath(sep, ...parts) {
  const clean = parts
    .filter(Boolean)
    .map((part, idx) => {
      const s = String(part)
      if (idx === 0) return s.replace(/[\\/]+$/g, '')
      return s.replace(/^[\\/]+|[\\/]+$/g, '')
    })
    .filter(Boolean)
  return clean.join(sep || '/')
}

function cleanWorkFileSpec(raw) {
  const input = String(raw || '').trim().replace(/^['"]|['"]$/g, '')
  if (!input) return null
  const parts = input
    .split(/[\\/]+/)
    .map(part => part
      .replace(/[<>:"|?*\u0000-\u001F]/g, '-')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(part => part && part !== '.' && part !== '..')
  if (!parts.length) return null
  let fileName = parts.pop()
  if (!/\.[A-Za-z0-9]{1,10}$/.test(fileName)) fileName += '.md'
  parts.push(fileName)
  const relativePath = parts.join('/')
  const relativeDir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  return { fileName, relativePath, relativeDir }
}

function buildWorkFileMeta(rawName, systemInfoText = '') {
  const spec = cleanWorkFileSpec(rawName)
  if (!spec) return null
  const { home, sep } = parseAssistantSystemInfo(systemInfoText)
  const relParts = spec.relativePath.split('/')
  const displayPath = `~/.hermes/workspace/${spec.relativePath}`
  const displayDir = spec.relativeDir ? `~/.hermes/workspace/${spec.relativeDir}` : '~/.hermes/workspace'
  const absolutePath = home
    ? joinFsPath(sep, home, '.hermes', 'workspace', ...relParts)
    : displayPath
  const absoluteDir = home
    ? joinFsPath(sep, home, '.hermes', 'workspace', ...(spec.relativeDir ? spec.relativeDir.split('/') : []))
    : displayDir
  return {
    title: spec.fileName,
    workFileName: spec.fileName,
    workFilePath: absolutePath,
    workFileDir: absoluteDir,
    workFileDisplayPath: displayPath,
  }
}

/** Compact token formatter — `1234567 → "1.2M"`, `12345 → "12.3k"`, `42 → "42"`. */
function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(Math.round(n))
}

/** USD cost formatter — `0.0042 → "$0.0042"`, `0.51 → "$0.51"`, `12.3 → "$12.30"`. */
function formatCost(usd) {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return ''
  if (usd < 0.01) return '$' + usd.toFixed(4)
  if (usd < 1) return '$' + usd.toFixed(3)
  return '$' + usd.toFixed(2)
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

function extractFirstHttpUrl(text) {
  const raw = String(text || '')
  const m = raw.match(/https?:\/\/[^\s"'<>，。；、]+/i)
  if (!m) return ''
  try {
    return new URL(m[0]).toString()
  } catch {
    return ''
  }
}

function isVideoShareUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return [
      'douyin.com',
      'iesdouyin.com',
      'tiktok.com',
      'kuaishou.com',
      'xiaohongshu.com',
      'xhslink.com',
      'bilibili.com',
      'youtube.com',
      'youtu.be',
    ].some(domain => host === domain || host.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

function videoPlatformLabel(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('douyin') || host.includes('iesdouyin')) return '抖音'
    if (host.includes('kuaishou')) return '快手'
    if (host.includes('xiaohongshu') || host.includes('xhslink')) return '小红书'
    if (host.includes('tiktok')) return 'TikTok'
    if (host.includes('bilibili')) return 'B 站'
    if (host.includes('youtube') || host === 'youtu.be') return 'YouTube'
  } catch {}
  return '短视频平台'
}

function isFetchedContentFailure(text) {
  return /抓取失败|抓取超时|读取失败|无法读取|无法抓取|timeout|timed out|fetch failed|network error|econnreset|socket hang up|und_err|connection reset|连接被断开/i.test(String(text || ''))
}

function formatShortVideoWorkflowInstructions(platform = '短视频平台') {
  return [
    '重要补充：如果第一次 browser_navigate 只返回首页、登录态、短内容或空内容，不要立即失败；必须继续尝试 browser_snapshot，再用 browser_console 读取 document.title、meta description、JSON-LD、document.body.innerText 的前 8000 字。',
    '如果后台浏览器没有继承用户桌面抖音/快手/小红书登录态，要明确说明是隔离浏览器未拿到原生页上下文；再进入素材补充流程，不要把“抓取超时”当成最终回答。',
    `本轮用户提供的是${platform}等短视频/外部视频链接。`,
    '目标流程必须固定：先做“文字型视频拆解”，再询问用户是否继续做仿写/改写，或要生成标题、口播稿、分镜、拍摄清单、发布文案等具体模块。',
    '如果普通链接抓取没有读取到视频画面、口播、字幕或正文，不要编造视频细节，也不要只回复“抓取失败”。',
    '失败时的优先动作是“用户授权页面读取”：如果工具列表里有 browser、browser_navigate、browser_snapshot、computer_use 或类似浏览器工具，先尝试读取用户已经打开或授权打开页面中的公开可见信息。',
    '页面读取要保持后台/隐式处理：不要在聊天中展示、嵌入、截图回传、保存截图、播放或主动建议打开抖音/快手/小红书页面，不保存账号 Cookie，不绕过登录、付费、权限、robots 或平台限制，只把读取到的标题、字幕、页面文本、封面说明等转成文字结果。',
    '如果浏览器读取工具不可用，或页面读取仍失败，再用中文说明“暂时拿不到视频正文”，然后直接给用户一个素材补充模板。素材补充只要画面描述、字幕/口播、核心观点，不要主动要求截图。不要问“你觉得哪条路方便”。',
    '如果用户已经表达想做仿写/改写/优化，则在拿到素材后直接继续产出，不要反复确认同一个意图。',
    '仿写/改写时保留核心内容、关键信息和观点，优化标题、开场、口播结构、转场、节奏和整体表达，做到内容核心不变、呈现更自然完整。',
    '',
    '如果读取到视频内容，请先按这些维度拆解：',
    '1. 核心主题与目标受众',
    '2. 开场钩子',
    '3. 内容结构和推进顺序',
    '4. 画面、镜头、人物动作或场景信息',
    '5. 口播、字幕、关键信息和观点',
    '6. 情绪节奏、转场和记忆点',
    '7. 可复用核心与可优化点',
    '',
    '如果最终仍缺少素材，请给用户一个可直接粘贴的素材模板：',
    '【视频素材】',
    `平台：${platform}`,
    '标题：',
    '画面描述/关键画面：',
    '口播/字幕：',
    '核心观点：',
    '想要方向：仿写/改写 / 标题 / 口播稿 / 分镜 / 发布文案',
    '[/视频素材]',
  ].join('\n')
}

function appendUserSupplement(block, supplement) {
  const extra = String(supplement || '').trim()
  if (!extra) return block
  return [
    block,
    '',
    '[用户补充要求]',
    extra,
    '[/用户补充要求]',
  ].join('\n')
}

function buildIntentTriggeredToolInstructions(text) {
  const base = String(text || '').trim()
  if (!base) return ''
  const lower = base.toLowerCase()
  const capabilityAuditIntent =
    /(能不能|能否|可以吗|可不可以|会不会|有没有|是否具备|能做吗|能做什么|缺什么|需要什么|安装什么|装什么|工具|插件|skills?|skill|plugin|tool|能力|调用|检索).{0,40}(工具|插件|skills?|skill|plugin|tool|能力|调用|安装|联网|上网|安全|检查|检索)|(?:工具|插件|skills?|skill|plugin|tool|能力|调用|安装|联网|上网|安全|检查|检索).{0,40}(能不能|能否|可以吗|可不可以|会不会|有没有|是否具备|缺什么|需要什么|安装什么|装什么)/i.test(base)
  const hasUrl = /https?:\/\//i.test(base)
  const desktopIntent =
    /(桌面端|客户端|本地应用|应用程序|桌面应用|app)\s*(里|上|中)?\s*(打开|搜索|点击|输入|查看|读取|采集|操作)/i.test(base) ||
    /(打开|搜索|点击|输入|查看|读取|采集|操作).{0,18}(桌面端|客户端|本地应用|应用程序|桌面应用|app)/i.test(base) ||
    /(抖音|快手|小红书|飞书|钉钉|微信|qq).{0,18}(客户端|桌面端|app|应用|打开|搜索|点击|输入|查看|采集)/i.test(base)
  const browserIntent =
    hasUrl ||
    /(浏览器|网页|网站|网址|链接|页面|打开网页|打开网站|搜索网页|网上搜索|联网搜索|网页搜索|抓取|读取链接|浏览)/i.test(base) ||
    /\b(browser|website|web page|url|search web|open url|navigate|scrape)\b/i.test(lower)
  const lines = []
  if (capabilityAuditIntent) {
    lines.push(
      '[CAPABILITY_AUDIT_TRIGGER]',
      'The user is asking whether a task can be done or what tool/plugin/skill is needed. Before promising execution, inspect the currently available tools, plugins, and skills from this runtime/tool list.',
      'If the tool list contains skill_manager, use skill_manager action=audit for local capability checks, and action=search for SkillHub lookup when the user asks what skill is needed.',
      'Only call skill_manager action=install after the latest user message explicitly agrees to install that exact skill. Set consent=true only after that explicit approval.',
      'Reply in Simplified Chinese with: 1) current available capability, 2) missing tool/plugin/skill if any, 3) whether web search is needed, 4) security risks, 5) a clear question asking for user consent before searching, downloading, installing, enabling, or changing configuration.',
      'Do not install, download, enable plugins, edit config, run shell commands, or browse the web until the user explicitly agrees in the next message. If the required capability is not native, say that clearly instead of outputting fake tool_call/XML text.',
      'Do not ask for raw exec unless there is no safer dedicated tool. Skills are prompt packs; installing a skill does not install system binaries or grant shell access.',
      'If the task can be done with existing tools, say which exact tool/plugin/skill will be used and what result you will report after execution.',
      '[/CAPABILITY_AUDIT_TRIGGER]',
    )
  }
  if (desktopIntent) {
    lines.push(
      '[DESKTOP_CONTROL_TRIGGER]',
      '本轮用户明确要求操作桌面端/客户端/本地应用。若工具列表里有 desktop_control，请优先调用 desktop_control，不要改用浏览器，也不要把 <tool_call>、XML 或伪代码当作文字输出。',
      '执行顺序：先 action=list_windows 查找窗口；找到目标后再 activate；需要读取画面、价格、数量、字幕、直播间或当前状态时，必须再 action=screenshot，并基于返回图片继续分析；需要搜索时再 click/type_text/press_key。',
      '注意：任务栏托盘里有图标但没有展开主窗口时，list_windows 可能看不到目标。不要因此断定“客户端未打开”；请先说明“当前工具只能枚举可见窗口，目标可能在托盘/后台”，再尝试通过已打开窗口、任务栏/前台窗口或用户已恢复窗口继续操作。',
      '若目标是抖音、快手、小红书、微信、飞书、钉钉、QQ 等桌面客户端，必须优先操作用户已打开的桌面客户端；只有在桌面工具确实无法激活可见窗口，且用户同意网页兜底时，才改用浏览器。',
      '普通聊天、文案、表格、解释类问题不要触发 desktop_control。',
      '[/DESKTOP_CONTROL_TRIGGER]',
    )
  }
  if (browserIntent && !desktopIntent) {
    lines.push(
      '[BROWSER_TOOL_TRIGGER]',
      '本轮用户明确要求浏览器/网页/链接/搜索/抓取。若工具列表里有 browser、web、browser_navigate、browser_snapshot 等工具，请调用真实工具完成打开、搜索、读取、点击或页面快照；不要输出 <tool_call>、XML 或伪工具文本。',
      '浏览器自动化必须复用同一个专用浏览器窗口/标签：先检查已有 tab/current page；能 navigate 当前页就不要 open 新窗口/新标签；同一任务最多保留一个自动化页面，禁止反复打开多个浏览器或多个独立页面。',
      '基础顺序：tabs/current -> focus/reuse -> navigate -> snapshot/read visible text -> click/type/wait when needed；失败时用中文说明具体失败原因和下一步。',
      '普通聊天不要触发 browser/web 工具。',
      '[/BROWSER_TOOL_TRIGGER]',
    )
  }
  return lines.join('\n')
}

function stripFirstHttpUrl(text) {
  return String(text || '').replace(/https?:\/\/[^\s"'<>，。；、]+/i, '').trim()
}

function formatVideoLinkFallbackPrompt(url, failureText) {
  const platform = videoPlatformLabel(url)
  return [
    '[视频链接]',
    `平台: ${platform}`,
    `URL: ${url}`,
    `读取状态: ${failureText || '抓取失败，暂时无法直接读取视频内容'}`,
    '下一步: 优先后台读取用户已打开或授权打开页面的公开信息；不要展示、截图保存、播放或建议打开平台页面。若仍失败，进入素材补充流程。',
    '处理目标: 先做文字型拆解，再询问是否继续仿写/改写或生成标题、口播稿、分镜、拍摄清单、发布文案。',
    '[/视频链接]',
  ].join('\n')
}

function formatVideoLinkAnalysisRequest(url, fetchedContent = '') {
  const platform = videoPlatformLabel(url)
  const clipped = String(fetchedContent || '').trim()
  const lines = [
    '[SHORT_VIDEO_LINK_REQUEST]',
    '[视频链接分析请求]',
    `平台: ${platform}`,
    `URL: ${url}`,
    '来源: 用户通过加号入口提交，已授权后台读取该链接或用户已打开页面中的公开可见信息。',
    '读取策略: 优先使用 browser_navigate / browser_snapshot / computer_use 等可用后台浏览器工具读取公开可见信息；不要展示、播放、嵌入、截图回传、保存或主动建议打开平台页面。',
    '读取兜底: browser_navigate 后如果只拿到首页、登录态、空白页或很短的结果，必须继续调用 browser_snapshot 和 browser_console 读取标题、meta、JSON-LD、可见正文；只有这些都失败后才进入素材补充流程。',
    '合规边界: 不保存账号 Cookie，不保存或提及平台截图，不主动要求用户提供截图，不询问是否打开平台页面，不绕过登录、付费、权限、robots 或平台限制；只把公开可见的标题、字幕、口播、页面文字、封面说明等转成文字结果。',
    '处理目标: 先做文字型视频拆解，再询问是否继续仿写/改写，或生成标题、口播稿、分镜、拍摄清单、发布文案。',
  ]
  if (clipped && !isFetchedContentFailure(clipped)) {
    lines.push('', '[前置读取内容]', clipped, '[/前置读取内容]')
  } else if (clipped) {
    lines.push('', `前置读取状态: ${clipped}`)
  }
  lines.push('[/视频链接分析请求]', '[/SHORT_VIDEO_LINK_REQUEST]')
  return lines.join('\n')
}

function formatVideoLinkSuccessPrompt(url, clipped) {
  const platform = videoPlatformLabel(url)
  return [
    '[视频链接内容]',
    `平台: ${platform}`,
    `URL: ${url}`,
    '',
    clipped || '（视频链接内容为空）',
    '[/视频链接内容]',
  ].join('\n')
}

function formatFetchedLinkForPrompt(url, content) {
  const text = String(content || '').trim()
  const limit = 30000
  const clipped = text.length > limit
    ? text.slice(0, limit) + '\n\n[内容过长，已截断]'
    : text
  if (isVideoShareUrl(url)) {
    if (!clipped || isFetchedContentFailure(clipped)) {
      return formatVideoLinkFallbackPrompt(url, clipped)
    }
    return formatVideoLinkSuccessPrompt(url, clipped)
  }
  return [
    '[外部链接内容]',
    `URL: ${url}`,
    '',
    clipped || '（链接内容为空）',
    '[/外部链接内容]',
  ].join('\n')
}

const MATERIAL_PREVIEW_LIMIT = 260
const MATERIAL_FULL_LIMIT = 18000

function parseMaybeJson(value) {
  if (value == null) return null
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return null
  if (!text.startsWith('{') && !text.startsWith('[')) return text
  try { return JSON.parse(text) } catch { return text }
}

function normalizeMaterialText(value) {
  return String(value ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function pushMaterialPiece(pieces, label, value) {
  const text = normalizeMaterialText(value)
  if (!text || text.length < 3) return
  pieces.push(label ? `${label}\n${text}` : text)
}

function materialValueToPieces(value, pieces, meta, depth = 0) {
  if (value == null || depth > 4) return
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    pushMaterialPiece(pieces, '', value)
    return
  }
  if (Array.isArray(value)) {
    value.slice(0, 24).forEach(item => materialValueToPieces(item, pieces, meta, depth + 1))
    return
  }
  if (typeof value !== 'object') return

  const title = value.title || value.name || value.heading
  const url = value.url || value.href || value.finalUrl
  if (title && !meta.title) meta.title = normalizeMaterialText(title)
  if (url && !meta.url) meta.url = String(url)

  for (const key of ['title', 'description', 'content', 'text', 'innerText', 'bodyText', 'snapshot', 'caption', 'captions', 'transcript', 'result', 'message', 'error']) {
    if (value[key] == null) continue
    const before = pieces.length
    materialValueToPieces(value[key], pieces, meta, depth + 1)
    if (key === 'error' && pieces.length > before) pieces[pieces.length - 1] = `读取错误\n${pieces[pieces.length - 1]}`
  }

  if (value.ld || value.jsonLd || value.structuredData) {
    const structured = value.ld || value.jsonLd || value.structuredData
    pushMaterialPiece(pieces, '结构化信息', prettyJson(structured))
  }
}

function uniqueMaterialLines(text) {
  const seen = new Set()
  const out = []
  for (const block of normalizeMaterialText(text).split(/\n{2,}/)) {
    const clean = normalizeMaterialText(block)
    if (!clean) continue
    const key = clean.slice(0, 180)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return out.join('\n\n')
}

function extractToolMaterial(m) {
  const name = String(m?.toolName || m?.name || '')
  if (!name.startsWith('browser_')) return null
  const payload = parseMaybeJson(m.toolResult ?? m.result ?? m.content)
  const args = parseMaybeJson(m.toolArgs ?? m.arguments)
  const pieces = []
  const meta = { tool: name }

  if (args?.url) meta.requestUrl = String(args.url)
  if (args?.expression) meta.expression = String(args.expression)

  materialValueToPieces(payload, pieces, meta)
  if (payload?.success === false && payload?.error) pushMaterialPiece(pieces, '读取错误', payload.error)

  const text = uniqueMaterialLines(pieces.join('\n\n')).slice(0, MATERIAL_FULL_LIMIT)
  return {
    tool: name,
    title: meta.title || '',
    url: meta.url || meta.requestUrl || '',
    expression: meta.expression || '',
    text,
    ok: !!text && !/抓取失败|抓取超时|read ECONNRESET|timeout|timed out/i.test(text),
  }
}

function turnMaterialId(userMessage, index) {
  return `mat_${String(userMessage?.id || index).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function countFilledMaterialFields(text) {
  return normalizeMaterialText(text)
    .split('\n')
    .map(line => line.replace(/\*\*/g, '').replace(/^[-*]\s*/, '').trim())
    .filter(line => /^(视频标题|标题|平台|时长|发布者|作者|主题|发布时间|互动数据)\s*[：:]\s*\S+/.test(line))
    .length
}

function assistantTextHasExtractedMaterial(text) {
  const clean = normalizeMaterialText(text)
  if (/成功.{0,10}(获取|解析|拿到|读取).{0,12}视频|以下是拆解结果|视频内容.*拆解/.test(clean)) return true
  if (!clean || /素材不足|暂时拿不到视频正文|需要你补充素材|登录|验证码|反爬|访问受限/.test(clean)) return false
  return clean.length >= 120 && countFilledMaterialFields(clean) >= 2
}

function assistantTextHasMaterialFailure(text) {
  const clean = normalizeMaterialText(text)
  return /素材不足|没有拿到完整|暂时拿不到视频正文|需要你补充素材|抓取失败|抓取超时|登录|验证码|反爬|访问受限/.test(clean)
}

function formatCapturedMaterialAsTranscript(rawText) {
  if (!rawText || typeof rawText !== 'string') return ''
  const cleaned = rawText
    .trim()
    .replace(/\n?---+\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/```[\s\S]*?```/g, block => block.replace(/```/g, '').trim())

  const lines = cleaned
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(line => line.replace(/^#{1,4}\s*/, '').replace(/\*\*/g, '').replace(/^[-*]\s*/, '').trim())
    .map(line => line.replace(/^\|?\s*/, '').replace(/\s*\|?\s*$/, '').replace(/\s*\|\s*/g, ' / '))
    .filter(Boolean)
    .filter(line => !/^视频拆解$/.test(line))

  if (!lines.length) return rawText

  const info = []
  const body = []
  const infoPattern = /^(视频标题|标题|平台|时长|发布者|作者|发布时间|获赞|互动数据)\s*[：:]/
  for (const line of lines) {
    if (infoPattern.test(line)) info.push(line)
    else body.push(line)
  }

  const parts = ['【素材逐字稿】']
  if (info.length) parts.push(['基础信息', ...info].join('\n'))
  if (body.length) parts.push(['正文素材', ...body].join('\n'))
  return parts.join('\n\n')
}

function collectTurnMaterial(messages, index) {
  const user = messages[index]
  if (!user || user.role !== 'user') return null
  const url = extractFirstHttpUrl(user.content)
  if (!url || !isVideoShareUrl(url)) return null

  const platform = videoPlatformLabel(url)
  const tools = []
  const pieces = []
  let assistantText = ''
  let resolvedUrl = ''
  let title = ''

  for (let i = index + 1; i < messages.length; i += 1) {
    const m = messages[i]
    if (m.role === 'user') break
    if (m.role === 'tool') {
      const material = extractToolMaterial(m)
      if (!material) continue
      tools.push(material.tool)
      if (material.url && !resolvedUrl) resolvedUrl = material.url
      if (material.title && !title) title = material.title
      if (material.text) pieces.push(material.text)
    } else if (m.role === 'assistant' && m.content) {
      assistantText = [assistantText, normalizeMaterialText(m.content)].filter(Boolean).join('\n\n')
    }
  }

  const fullText = uniqueMaterialLines(pieces.join('\n\n')).slice(0, MATERIAL_FULL_LIMIT)
  const fallbackText = normalizeMaterialText(assistantText).slice(0, 3600)
  const hasMaterial = fullText.length >= 80
  const assistantHasMaterial = assistantTextHasExtractedMaterial(fallbackText)
  const assistantHasFailure = assistantTextHasMaterialFailure(fallbackText)
  if (!hasMaterial && !assistantHasMaterial && !assistantHasFailure) return null

  const displayText = hasMaterial ? fullText : fallbackText
  const status = hasMaterial || assistantHasMaterial ? 'ready' : 'partial'
  const reason = hasMaterial || assistantHasMaterial
    ? '已读取到可整理的视频页面素材。'
    : '这次没有拿到完整原生页素材，只保留了失败原因和后续补充模板。'
  const preview = normalizeMaterialText(displayText).slice(0, MATERIAL_PREVIEW_LIMIT)

  return {
    id: turnMaterialId(user, index),
    platform,
    url,
    resolvedUrl,
    title,
    status,
    reason,
    preview,
    fullText: displayText,
    tools: Array.from(new Set(tools)),
  }
}

function formatSelectedImageForPrompt(file, savedPath) {
  return [
    '[图片/视觉输入]',
    '用户通过输入框右侧的曲别针按钮添加了一张图片。',
    `文件名: ${file?.name || 'image'}`,
    `类型: ${file?.type || 'image/*'}`,
    `大小: ${file?.size || 0} bytes`,
    `本地路径: ${savedPath}`,
    '本轮已触发图片识别。请直接调用可用的视觉/图片读取能力分析这张图片，不要等待用户再次确认；该能力只在本轮图片输入时触发。',
    '如果当前模型或工具链不支持图片识别，请用中文明确说明当前无法看图。',
    '[/图片/视觉输入]',
  ].join('\n')
}

function formatSelectedFileForPrompt(file, content) {
  const text = String(content || '')
  const limit = 30000
  const clipped = text.length > limit
    ? text.slice(0, limit) + '\n\n[文件内容过长，已截断]'
    : text
  return [
    '[文件内容]',
    `文件名: ${file?.name || 'file'}`,
    `类型: ${file?.type || 'text/plain'}`,
    `大小: ${file?.size || 0} bytes`,
    '',
    clipped || '（文件内容为空）',
    '[/文件内容]',
  ].join('\n')
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function parseImageDataUrl(dataUrl, fallbackMime = 'image/png') {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''))
  if (!match) return { mimeType: fallbackMime || 'image/png', content: String(dataUrl || '') }
  return { mimeType: match[1] || fallbackMime || 'image/png', content: match[2] || '' }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsText(file)
  })
}

function isReadableTextFile(file) {
  if (String(file?.type || '').startsWith('text/')) return true
  return /\.(txt|md|markdown|json|csv|log|yaml|yml|toml|ini|xml|html|css|js|jsx|ts|tsx|py|rs|go|java|sql|sh|bat|cmd|ps1)$/i.test(file?.name || '')
}

// ----------------------------------------------------------- icons

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="10" height="10"><polyline points="9 18 15 12 9 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M5 8h14"/><path d="M8 3h8v5l3 5H5l3-5z"/></svg>',
  spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" stroke-linecap="round"><circle cx="12" cy="12" r="8" opacity="0.25"/><path d="M20 12a8 8 0 0 0-8-8"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="12" height="12"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>',
  checkboxOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>',
  checkboxOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.18"/><polyline points="7 12 11 16 17 8"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  sidebar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
}

const SLASH_COMMANDS = [
  { cmd: '/help',    desc: 'chatSlashHelpDesc' },
  { cmd: '/status',  desc: 'chatSlashStatusDesc' },
  { cmd: '/memory',  desc: 'chatSlashMemoryDesc' },
  { cmd: '/skills',  desc: 'chatSlashSkillsDesc' },
  { cmd: '/clear',   desc: 'chatSlashClearDesc' },
  { cmd: '/new',     desc: 'chatSlashNewDesc' },
]

// ----------------------------------------------------------- rename modal

/**
 * Lightweight rename modal (used by sidebar context menu). Returns the new
 * title on confirm, or `null` on cancel. Mirrors `showConfirm`'s pattern
 * so we don't need Vue-style reactivity.
 */
function showRenameModal(current) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal hm-chat-rename-modal" style="max-width:420px">
        <div class="modal-title">${escHtml(t('engine.chatRenameSession'))}</div>
        <div class="modal-body">
          <input type="text" class="hm-input hm-chat-rename-input"
                 value="${escAttr(current || '')}"
                 placeholder="${escHtml(t('engine.chatEnterNewTitle'))}"/>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" data-act="cancel">${escHtml(t('common.cancel'))}</button>
          <button class="btn btn-primary btn-sm" data-act="ok">${escHtml(t('common.confirm'))}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const input = overlay.querySelector('.hm-chat-rename-input')
    input?.focus()
    input?.select()

    const close = (v) => { overlay.remove(); resolve(v) }
    const confirm = () => {
      const v = input?.value.trim() || ''
      if (!v) { input?.focus(); return }
      close(v)
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null)
    })
    overlay.querySelector('[data-act="cancel"]').onclick = () => close(null)
    overlay.querySelector('[data-act="ok"]').onclick = confirm
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirm() }
      else if (e.key === 'Escape') close(null)
    })
  })
}

function showWorkFileModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal hm-chat-workfile-modal" style="max-width:460px">
        <div class="modal-title">${escHtml(t('engine.chatCreateWorkFile'))}</div>
        <div class="modal-body">
          <label class="hm-chat-workfile-field">
            <span>${escHtml(t('engine.chatWorkFileName'))}</span>
            <input type="text" class="hm-input hm-chat-workfile-input"
                   placeholder="${escHtml(t('engine.chatWorkFilePlaceholder'))}"/>
          </label>
          <div class="hm-chat-workfile-preview" id="hm-chat-workfile-preview">
            ~/.hermes/workspace/
          </div>
          <div class="hm-chat-workfile-error" id="hm-chat-workfile-error" hidden></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" data-act="cancel">${escHtml(t('common.cancel'))}</button>
          <button class="btn btn-primary btn-sm" data-act="ok">${escHtml(t('engine.chatCreateWorkFileConfirm'))}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const input = overlay.querySelector('.hm-chat-workfile-input')
    const preview = overlay.querySelector('#hm-chat-workfile-preview')
    const error = overlay.querySelector('#hm-chat-workfile-error')
    input?.focus()

    const updatePreview = () => {
      const spec = cleanWorkFileSpec(input?.value || '')
      if (preview) preview.textContent = spec ? `~/.hermes/workspace/${spec.relativePath}` : '~/.hermes/workspace/'
      if (error) {
        error.hidden = true
        error.textContent = ''
      }
    }
    const close = (v) => { overlay.remove(); resolve(v) }
    const confirm = () => {
      const spec = cleanWorkFileSpec(input?.value || '')
      if (!spec) {
        if (error) {
          error.textContent = t('engine.chatWorkFileNameRequired')
          error.hidden = false
        }
        input?.focus()
        return
      }
      close(input.value.trim())
    }

    input?.addEventListener('input', updatePreview)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null)
    })
    overlay.querySelector('[data-act="cancel"]').onclick = () => close(null)
    overlay.querySelector('[data-act="ok"]').onclick = confirm
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirm() }
      else if (e.key === 'Escape') close(null)
    })
    updatePreview()
  })
}

// ----------------------------------------------------------- context menu

function showContextMenu(x, y, items) {
  const existing = document.querySelector('.hm-chat-ctxmenu')
  if (existing) existing.remove()
  const menu = document.createElement('div')
  menu.className = 'hm-chat-ctxmenu'
  menu.innerHTML = items.map((it, i) => `
    <button class="hm-chat-ctxmenu-item ${it.danger ? 'is-danger' : ''}" data-idx="${i}">
      ${it.icon || ''}<span>${escHtml(it.label)}</span>
    </button>
  `).join('')

  document.body.appendChild(menu)
  // Position + clamp to viewport.
  const rect = menu.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  menu.style.left = Math.min(x, vw - rect.width - 8) + 'px'
  menu.style.top = Math.min(y, vh - rect.height - 8) + 'px'

  const close = () => {
    menu.remove()
    document.removeEventListener('click', onDocClick, true)
    document.removeEventListener('keydown', onKey)
  }
  const onDocClick = (e) => {
    if (!menu.contains(e.target)) close()
  }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true)
    document.addEventListener('keydown', onKey)
  }, 0)
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.hm-chat-ctxmenu-item')
    if (!btn) return
    const idx = Number(btn.dataset.idx)
    close()
    items[idx]?.action?.()
  })
}

// ----------------------------------------------------------- main render

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-chat-page'
  el.dataset.engine = 'hermes'

  const store = getChatStore()

  // Local UI-only state (not in store).
  let sidebarOpen = !window.matchMedia('(max-width: 768px)').matches
  const expandedToolIds = new Set()   // tool message ids (persist across redraws)
  const expandedMaterialIds = new Set()
  let materialCards = new Map()
  let showSlash = false
  let slashFilter = ''
  let linkMenuOpen = false
  let linkDraft = ''
  let linkBusy = false
  let linkError = ''
  let pendingAttachmentInstructions = ''
  let pendingAttachments = []
  let attachmentDragActive = false
  let attachmentDragDepth = 0
  let gwOnline = false
  let currentModel = ''
  let statusRefreshInFlight = false
  let unlistenGatewayStatus = null
  const mobileQuery = window.matchMedia('(max-width: 720px)')

  // Input state must live outside the textarea DOM node because every draw()
  // rebuilds innerHTML. Without this, typing `/` would wipe the composed text
  // when the slash menu triggers a redraw.
  let inputValue = ''
  let inputFocused = false
  let inputCaret = 0                  // caret position restored after re-render
  let lastActiveSessionId = store.state.activeSessionId
  let forceScrollBottom = true
  let lastRenderedStreaming = store.state.streaming
  let drawFrame = null
  let suppressTextareaCaptureUntil = 0
  let hermesSendInFlight = false
  let activeEcommerceWorkflowRunId = null
  let drawMode = 'full'
  const renderedInboxMessages = new Set(JSON.parse(localStorage.getItem('superclaw-hermes-rendered-task-messages-v1') || '[]'))
  let voiceInputState = 'idle'
  let voicePlaybackKey = null
  let voiceRate = Number(localStorage.getItem('superclaw-hermes-voice-rate') || '1') || 1
  let modelVoiceConfig = null
  const voiceInputId = 'hm-chat-voice'
  const voiceInputController = createVoiceInputController({
    getLanguage: () => modelVoiceConfig?.input?.language || navigator.language || 'zh-CN',
    useModelInput: () => modelVoiceInputReady(modelVoiceConfig),
    transcribeAudio: async (payload) => {
      const result = await transcribeWithModelVoice(payload)
      return result?.text || ''
    },
    onStateChange: (next) => {
      voiceInputState = next
      if (next === 'requesting') toast(t('engine.chatVoiceProcessing'), 'info')
      draw()
    },
    onInterimText: (text) => {
      inputValue = text
      inputCaret = inputValue.length
      inputFocused = true
      draw()
    },
    onFinalText: (text) => {
      inputValue = text
      inputCaret = inputValue.length
      inputFocused = true
      draw()
      if (text && text.trim()) toast('语音已写入输入框，可修改后发送', 'success')
    },
    onUnsupported: () => toast(t('engine.chatVoiceUnsupported'), 'warning'),
    onError: (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'denied') toast(t('engine.chatVoiceDenied'), 'warning')
      else if (code === 'no-speech') toast(t('engine.chatVoiceNoSpeech'), 'warning')
      else if (code && code !== 'aborted') toast(`${t('engine.chatVoiceUnsupported')}: ${code}`, 'warning')
    },
  })
  const voicePlaybackController = createSpeechPlaybackController({
    synthesizeAudio: async ({ text }) => {
      if (!modelVoiceOutputReady(modelVoiceConfig)) return null
      return synthesizeWithModelVoice({
        text,
        voice: modelVoiceConfig?.output?.voice,
        format: modelVoiceConfig?.output?.format,
      })
    },
    onStateChange: (nextKey) => {
      voicePlaybackKey = nextKey
      el.querySelectorAll('.hm-chat-msg-voice').forEach((btn) => {
        const active = !!nextKey && btn.dataset.voiceMid === nextKey
        btn.classList.toggle('is-speaking', active)
        btn.title = active ? t('engine.chatVoiceStopSpeak') : t('engine.chatVoiceSpeak')
      })
      draw()
    },
  })

  function inboxMessageKey(message) {
    return [
      message.task_id || '',
      message.message_type || '',
      message.from_agent || '',
      message.updated_at || message.created_at || '',
      String(message.content || '').slice(0, 80),
    ].join('|')
  }

  function persistRenderedInboxMessages() {
    localStorage.setItem('superclaw-hermes-rendered-task-messages-v1', JSON.stringify(Array.from(renderedInboxMessages).slice(-300)))
  }

  function renderHermesInboxMessages() {
    const rows = listAgentTaskMessages({ toAgent: COLLAB_TARGETS.hermes })
      .filter(item => ['task_request', 'task_result', 'task_error', 'task_delegate'].includes(item.message_type))
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    const fresh = rows.filter(item => !renderedInboxMessages.has(inboxMessageKey(item)))
    if (!fresh.length) return
    if (!store.activeSession()) store.newChat({ title: 'Hermes 协作收件箱' })
    for (const item of fresh) {
      const key = inboxMessageKey(item)
      renderedInboxMessages.add(key)
      const label = item.message_type === 'task_error' ? '错误回传'
        : item.message_type === 'task_delegate' ? '任务委派'
        : item.message_type === 'task_request' ? '任务请求'
        : '结果回传'
      store.pushLocalAssistant([
        `## ${label}`,
        '',
        `- 任务：${item.task_id || ''}`,
        `- 来源：${targetLabel(item.from_agent)}`,
        `- 状态：${item.status || ''}`,
        item.mode ? `- Claude Code mode: ${item.mode}` : '',
        item.permission_level ? `- Permission level: ${item.permission_level}` : '',
        item.requires_confirmation ? '- Requires confirmation: true' : '',
        item.mode_warning ? `- Mode warning: ${item.mode_warning}` : '',
        item.tool ? `- 工具：${item.tool}` : '',
        item.title ? `- 标题：${item.title}` : '',
        '',
        item.content || '（没有正文）',
      ].filter(Boolean).join('\n'))
    }
    persistRenderedInboxMessages()
    forceScrollBottom = true
    scheduleDraw('full')
  }

  let hermesDispatchBusy = false

  async function consumeHermesExecutionDispatch() {
    if (hermesDispatchBusy || store.state.streaming) return
    const pending = consumePendingDispatch(COLLAB_TARGETS.hermes)
    if (!pending?.message) return
    hermesDispatchBusy = true
    const taskId = pending.taskId || `hermes-${Date.now().toString(36)}`
    const sessionId = pending.session_id || pending.sessionId
    const context = buildTaskContext({
      sessionId,
      taskId,
      context: pending.context || {},
      artifacts: pending.artifacts || [],
      content: pending.message,
    })
    const title = pending.title || `Hermes delegated task ${taskId}`
    try {
      if (!store.activeSession()) store.newChat({ title: `Hermes 执行 - ${shortGoal(pending.message)}` })
      createTaskProgress({
        taskId,
        sessionId: context.session_id,
        fromAgent: COLLAB_TARGETS.hermes,
        toAgent: pending.fromAgent || pending.from_agent || COLLAB_TARGETS.hermes,
        title: `${title} started`,
        content: 'Hermes has accepted the delegated task and started execution.',
        context,
        artifacts: context.artifacts,
      })
      forceScrollBottom = true
      await store.sendMessage(String(pending.message || '').trim(), {
        instructions: [
          'This message is a delegated task for Hermes from the SuperClaw collaboration queue.',
          'Execute the task directly, report concrete progress/results, and do not merely acknowledge receipt.',
          `Task id: ${taskId}`,
          pending.stage ? `Stage: ${pending.stage}` : '',
          pending.parentTaskId || pending.parent_task_id ? `Parent task: ${pending.parentTaskId || pending.parent_task_id}` : '',
        ].filter(Boolean).join('\n'),
      })
      createTaskResult({
        taskId,
        sessionId: context.session_id,
        fromAgent: COLLAB_TARGETS.hermes,
        toAgent: pending.fromAgent || pending.from_agent || COLLAB_TARGETS.hermes,
        title: `${title} accepted`,
        content: 'Hermes execution run was started. See the active Hermes chat session for live output.',
        context,
        artifacts: context.artifacts,
      })
      updateCollaborationTask(taskId, { status: 'hermes_running', hermesStartedAt: Date.now(), context, artifacts: context.artifacts })
    } catch (err) {
      createTaskResult({
        taskId,
        sessionId: context.session_id,
        fromAgent: COLLAB_TARGETS.hermes,
        toAgent: pending.fromAgent || pending.from_agent || COLLAB_TARGETS.hermes,
        title: `${title} failed`,
        content: err?.message || String(err),
        failed: true,
        context,
        artifacts: context.artifacts,
      })
      toast(`Hermes 执行委派任务失败：${err?.message || err}`, 'error')
    } finally {
      hermesDispatchBusy = false
      scheduleDraw('full')
    }
  }

  // Multi-select for batch session deletion. When non-null, the sidebar
  // switches into "selection mode": a checkbox appears on every row and
  // selecting items doesn't switch sessions.
  let selectionMode = false
  const selected = new Set()

  // Profile switcher dropdown (for Hermes multi-profile / multi-agent).
  let profileMenuOpen = false

  // Session search modal state. `null` means closed.
  // { query: string, selectedIdx: number }
  let searchState = null

  const onPasteImage = async (event) => {
    if (!el.isConnected || !el.contains(event.target)) return
    if (!clipboardHasImage(event)) return
    event.preventDefault()
    event.stopImmediatePropagation?.()
    const files = await getUniqueClipboardImageFiles(event)
    await handlePickAttachments(files)
  }
  document.addEventListener('paste', onPasteImage, true)

  function dragEventHasFiles(event) {
    const transfer = event?.dataTransfer
    if (!transfer) return false
    if (transfer.files?.length) return true
    return Array.from(transfer.types || []).includes('Files')
  }

  function setAttachmentDragActive(active) {
    attachmentDragActive = !!active
    el.classList.toggle('is-attachment-drag-over', attachmentDragActive)
    el.querySelector('.hm-chat-input-area')?.classList.toggle('is-drag-over', attachmentDragActive)
  }

  async function handleDroppedAttachments(event) {
    if (!dragEventHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    attachmentDragDepth = 0
    setAttachmentDragActive(false)
    await handlePickAttachments(Array.from(event.dataTransfer?.files || []))
  }

  el.addEventListener('dragenter', (event) => {
    if (!dragEventHasFiles(event)) return
    event.preventDefault()
    attachmentDragDepth += 1
    setAttachmentDragActive(true)
  })
  el.addEventListener('dragover', (event) => {
    if (!dragEventHasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setAttachmentDragActive(true)
  })
  el.addEventListener('dragleave', (event) => {
    if (!dragEventHasFiles(event)) return
    attachmentDragDepth = Math.max(0, attachmentDragDepth - 1)
    if (attachmentDragDepth === 0) setAttachmentDragActive(false)
  })
  el.addEventListener('drop', handleDroppedAttachments)

  function scheduleDraw(mode = 'full') {
    if (mode === 'full') drawMode = 'full'
    else if (drawMode !== 'full') drawMode = 'messages'
    if (drawFrame != null) return
    drawFrame = requestAnimationFrame(() => {
      const nextMode = drawMode
      drawFrame = null
      drawMode = 'messages'
      if (nextMode === 'messages' && drawMessagesOnly()) return
      draw()
    })
  }

  function scheduleStoreDraw() {
    const canPatchMessages =
      store.state.streaming &&
      store.state.activeSessionId === lastActiveSessionId &&
      store.state.streaming === lastRenderedStreaming
    scheduleDraw(canPatchMessages ? 'messages' : 'full')
  }

  async function refreshHermesRuntimeStatus(force = false) {
    if (statusRefreshInFlight) return
    statusRefreshInFlight = true
    try {
      invalidate('check_hermes')
      const info = await api.checkHermes()
      const nextOnline = !!info?.gatewayRunning
      const nextModel = info?.model || ''
      const changed = nextOnline !== gwOnline || nextModel !== currentModel
      gwOnline = nextOnline
      currentModel = nextModel
      if (force || changed) scheduleDraw('full')
    } catch {
      const changed = gwOnline || currentModel
      gwOnline = false
      currentModel = ''
      if (force || changed) scheduleDraw('full')
    } finally {
      statusRefreshInFlight = false
    }
  }

  const onVisibilityRefreshStatus = () => {
    if (!document.hidden) refreshHermesRuntimeStatus(true)
  }

  function applyHermesRuntimeStatusEvent(payload = {}) {
    const nextOnline = !!payload.running
    const nextModel = payload.model || currentModel
    const changed = nextOnline !== gwOnline || nextModel !== currentModel
    gwOnline = nextOnline
    currentModel = nextModel
    if (changed) scheduleDraw('full')
  }

  // --- initial session load + model meta ---
  store.loadSessions().then(() => {
    renderHermesInboxMessages()
    scheduleDraw('full')
  })
  store.loadProfiles().then(() => scheduleDraw('full')).catch(() => {})
  refreshHermesRuntimeStatus(true)
  document.addEventListener('visibilitychange', onVisibilityRefreshStatus)
  tauriListen('hermes-gateway-status', (event) => {
    applyHermesRuntimeStatusEvent(event?.payload || {})
  }).then(unlisten => { unlistenGatewayStatus = unlisten }).catch(() => {})
  loadModelVoiceConfig({ force: true }).then(config => {
    modelVoiceConfig = config
    scheduleDraw('full')
  }).catch(() => {})

  // ----------------------------------------------------------- subscription

  // Store subscription → `draw()` on mutation. rAF-batched inside the store
  // so a burst of events (streaming deltas) collapses into a single redraw.
  const unsubscribe = store.subscribe(() => scheduleStoreDraw())

  // Teardown + mount-observer are set up near the end of render() (after
  // `onGlobalKey` is defined). We avoid attaching a MutationObserver here
  // to prevent a double-teardown path.

  // ----------------------------------------------------------- rendering

  function renderSessionItem(s) {
    const isActive = s.id === store.state.activeSessionId
    const isStreaming = store.isSessionStreaming(s.id)
    const isRecent = !isStreaming && store.isSessionRecentlyActive(s.id)
    const isLive = isStreaming || isRecent
    const isPinned = store.state.pinned.has(s.id)
    const isSelected = selected.has(s.id)
    const workPath = sessionDisplayPath(s)
    // IMPORTANT: outer wrapper is a `<div role="button">`, NOT a `<button>`.
    // Nesting a real <button class="hm-chat-session-del"> inside another
    // <button> is invalid HTML — the parser silently closes the outer
    // button at the inner button's start tag, hoisting the delete control
    // out of the row. That's why delete clicks did nothing in the wild.
    return `
      <div class="hm-chat-session-item ${isActive ? 'is-active' : ''} ${isLive ? 'is-live' : ''} ${isSelected ? 'is-selected' : ''}"
           role="button" tabindex="0"
           data-sid="${escAttr(s.id)}">
        ${selectionMode ? `
          <button class="hm-chat-session-check hm-chat-session-action ${isSelected ? 'is-on' : ''}"
                  data-sid-check="${escAttr(s.id)}"
                  aria-pressed="${isSelected ? 'true' : 'false'}"
                  title="${escHtml(t(isSelected ? 'engine.chatDeselect' : 'engine.chatSelect'))}">
            ${isSelected ? ICONS.checkboxOn : ICONS.checkboxOff}
          </button>
        ` : ''}
        <div class="hm-chat-session-main">
          <div class="hm-chat-session-title-row">
            ${isStreaming ? `<span class="hm-chat-session-spinner" aria-hidden="true">${ICONS.spinner}</span>` : ''}
            ${isPinned ? `<span class="hm-chat-session-pin" aria-hidden="true">${ICONS.pin}</span>` : ''}
            <span class="hm-chat-session-title">${escHtml(sessionDisplayTitle(s))}</span>
            ${isLive ? `<span class="hm-chat-session-live ${isStreaming ? 'is-generating' : 'is-recent'}"><span class="hm-chat-live-dot"></span>${escHtml(t(isStreaming ? 'engine.chatGenerating' : 'engine.chatRecentlyActive'))}</span>` : ''}
          </div>
          <div class="hm-chat-session-meta">
            ${s.model ? `<span class="hm-chat-session-model">${escHtml(s.model)}</span>` : ''}
            ${workPath ? `<span class="hm-chat-session-path" title="${escAttr(workPath)}">${escHtml(workPath)}</span>` : ''}
            <span class="hm-chat-session-time">${escHtml(formatTime(s.updatedAt || s.createdAt))}</span>
          </div>
        </div>
        ${selectionMode ? '' : `
          <div class="hm-chat-session-actions" aria-label="${escAttr(t('engine.chatSessionActions'))}">
            <button class="hm-chat-session-menu hm-chat-session-action"
                    data-sid-menu="${escAttr(s.id)}"
                    title="${escHtml(t('engine.chatMoreActions'))}">
              ${ICONS.more}
            </button>
            <button class="hm-chat-session-del hm-chat-session-action"
                    data-sid-del="${escAttr(s.id)}"
                    title="${escHtml(t('engine.chatDeleteSession'))}">
              ${ICONS.trash}<span>${escHtml(t('engine.chatDeleteShort'))}</span>
            </button>
          </div>
        `}
      </div>
    `
  }

  function visibleSessionIds() {
    return store.state.sessions.map(s => s.id)
  }

  function renderProfileSwitcher() {
    const profiles = store.state.profiles || []
    const active = store.state.activeProfile || 'default'
    if (!profiles.length) {
      // Fallback: even when CLI doesn't expose profiles, surface the active
      // one so the user knows what they're talking to.
      return `
        <button class="hm-chat-profile-toggle" id="hm-chat-profile-toggle" type="button" disabled
                title="${escHtml(t('engine.chatProfileSingle'))}">
          ${ICONS.layers}
          <span class="hm-chat-profile-name">${escHtml(active)}</span>
        </button>
      `
    }
    return `
      <button class="hm-chat-profile-toggle ${profileMenuOpen ? 'is-open' : ''}" id="hm-chat-profile-toggle" type="button"
              aria-haspopup="menu" aria-expanded="${profileMenuOpen ? 'true' : 'false'}"
              title="${escHtml(t('engine.chatProfileTooltip'))}">
        ${ICONS.layers}
        <span class="hm-chat-profile-name">${escHtml(active)}</span>
        <span class="hm-chat-profile-caret">${ICONS.chevron}</span>
      </button>
      ${profileMenuOpen ? `
        <div class="hm-chat-profile-menu" role="menu">
          <div class="hm-chat-profile-menu-head">${escHtml(t('engine.chatProfileMenuHead'))}</div>
          ${profiles.map(p => `
            <button class="hm-chat-profile-item ${p.name === active ? 'is-active' : ''}"
                    role="menuitem"
                    data-profile="${escAttr(p.name)}"
                    ${store.state.streaming ? 'disabled' : ''}
                    title="${escHtml(p.model || '')}">
              <span class="hm-chat-profile-item-name">${escHtml(p.name)}</span>
              ${p.gatewayRunning ? `<span class="hm-chat-profile-item-badge">${escHtml(t('engine.chatProfileRunning'))}</span>` : ''}
              ${p.name === active ? `<span class="hm-chat-profile-item-active" aria-hidden="true">${ICONS.check}</span>` : ''}
            </button>
          `).join('')}
          <div class="hm-chat-profile-menu-foot">${escHtml(t('engine.chatProfileMenuFoot'))}</div>
        </div>
      ` : ''}
    `
  }

  function renderSidebar() {
    const { pinned, groups } = store.groupedSessions()
    const sessionsEmpty = store.state.sessions.length === 0
    const allIds = visibleSessionIds()
    const allSelected = selectionMode && allIds.length > 0 && allIds.every(id => selected.has(id))
    return `
      <aside class="hm-chat-sidebar ${sidebarOpen ? '' : 'is-collapsed'} ${selectionMode ? 'is-select-mode' : ''}">
        <div class="hm-chat-sidebar-profile">
          ${renderProfileSwitcher()}
        </div>
        <div class="hm-chat-sidebar-head">
          <span class="hm-chat-sidebar-title">${escHtml(t('engine.chatSessions'))}</span>
          <div class="hm-chat-sidebar-head-actions">
            <button class="hm-chat-select-toggle ${selectionMode ? 'is-active' : ''}" id="hm-chat-select-toggle"
                    title="${escHtml(t(selectionMode ? 'engine.chatExitSelect' : 'engine.chatBulkSelect'))}"
                    aria-pressed="${selectionMode ? 'true' : 'false'}">
              ${selectionMode ? ICONS.close : ICONS.check}
            </button>
            <button class="hm-chat-new-btn" title="${escHtml(t('engine.chatNewChat'))}" ${selectionMode ? 'disabled' : ''}>
              ${ICONS.plus}
            </button>
          </div>
        </div>
        ${selectionMode ? `
          <div class="hm-chat-bulkbar">
            <button class="hm-chat-bulkbar-select-all" id="hm-chat-bulk-select-all"
                    aria-pressed="${allSelected ? 'true' : 'false'}">
              ${allSelected ? ICONS.checkboxOn : ICONS.checkboxOff}
              <span>${escHtml(t(allSelected ? 'engine.chatSelectNone' : 'engine.chatSelectAll'))}</span>
            </button>
            <span class="hm-chat-bulkbar-count">${escHtml(t('engine.chatSelectedCount').replace('{n}', String(selected.size)))}</span>
            <button class="hm-chat-bulkbar-delete" id="hm-chat-bulk-delete" ${selected.size === 0 ? 'disabled' : ''}>
              ${ICONS.trash}<span>${escHtml(t('engine.chatBulkDelete'))}</span>
            </button>
          </div>
        ` : `<div class="hm-chat-sidebar-tip">${escHtml(t('engine.chatSessionManageHint'))}</div>`}
        <div class="hm-chat-sidebar-body">
          ${store.state.loading && sessionsEmpty ? `<div class="hm-chat-sidebar-loading">${escHtml(t('engine.chatLoading'))}</div>` : ''}
          ${!store.state.loading && sessionsEmpty ? `<div class="hm-chat-sidebar-empty">${escHtml(t('engine.chatNoSessions'))}</div>` : ''}
          ${pinned.length ? `
            <div class="hm-chat-group">
              <div class="hm-chat-group-head hm-chat-group-head--static">
                <span class="hm-chat-group-label">${escHtml(t('engine.chatPinned'))}</span>
                <span class="hm-chat-group-count">${pinned.length}</span>
              </div>
              ${pinned.map(renderSessionItem).join('')}
            </div>
          ` : ''}
          ${groups.map(g => {
            const isCollapsed = store.state.collapsed.has(g.source)
            return `
              <div class="hm-chat-group">
                <button class="hm-chat-group-head ${isCollapsed ? 'is-collapsed' : ''}" data-group="${escAttr(g.source)}">
                  <span class="hm-chat-group-arrow">${ICONS.chevron}</span>
                  <span class="hm-chat-group-label">${escHtml(g.label)}</span>
                  <span class="hm-chat-group-count">${g.sessions.length}</span>
                </button>
                ${!isCollapsed ? g.sessions.map(renderSessionItem).join('') : ''}
              </div>
            `
          }).join('')}
        </div>
      </aside>
    `
  }

  function renderToolMessage(m) {
    const expanded = expandedToolIds.has(m.id)
    const hasResult = m.toolResult != null && String(m.toolResult).trim() !== ''
    const missingResult = !hasResult && m.toolStatus !== 'running' && m.toolStatus !== 'error'
    const hasDetails = !!(m.toolArgs || hasResult || missingResult || m.toolStatus === 'error')
    const preview = m.toolPreview
      || (m.toolStatus === 'error' ? '执行失败 / 可查看详情' : '')
      || (missingResult ? t('engine.chatToolNoResultShort') : '')
    return `
      <div class="hm-chat-msg hm-chat-msg--tool" data-mid="${escAttr(m.id)}">
        <div class="hm-chat-tool-line ${hasDetails ? 'is-expandable' : ''}" data-tool-toggle="${escAttr(m.id)}">
          ${hasDetails
            ? `<span class="hm-chat-tool-chevron ${expanded ? 'is-open' : ''}">${ICONS.chevron}</span>`
            : `<span class="hm-chat-tool-icon">${ICONS.tool}</span>`}
          <span class="hm-chat-tool-name">${escHtml(m.toolName || 'tool')}</span>
          ${!expanded && preview ? `<span class="hm-chat-tool-preview">${escHtml(preview)}</span>` : ''}
          ${m.toolStatus === 'running' ? `<span class="hm-chat-tool-spinner"></span>` : ''}
          ${m.toolStatus === 'error' ? `<span class="hm-chat-tool-err">${escHtml(t('engine.chatErrorBadge'))}</span>` : ''}
          ${missingResult ? `<span class="hm-chat-tool-warn">${escHtml(t('engine.chatToolNoResultBadge'))}</span>` : ''}
        </div>
        ${expanded && hasDetails ? `
          <div class="hm-chat-tool-details">
            ${m.toolArgs ? `
              <div class="hm-chat-tool-section">
                <div class="hm-chat-tool-label">${escHtml(t('engine.chatArguments'))}</div>
                <pre class="hm-chat-tool-code">${escHtml(prettyJson(m.toolArgs))}</pre>
              </div>
            ` : ''}
            ${hasResult ? `
              <div class="hm-chat-tool-section">
                <div class="hm-chat-tool-label">${escHtml(t('engine.chatResult'))}</div>
                <pre class="hm-chat-tool-code">${escHtml(prettyJson(m.toolResult))}</pre>
              </div>
            ` : ''}
            ${m.toolStatus === 'error' && !hasResult ? `
              <div class="hm-chat-tool-section">
                <div class="hm-chat-tool-label">${escHtml(t('engine.chatResult'))}</div>
                <pre class="hm-chat-tool-code">执行失败，后端未返回错误详情</pre>
              </div>
            ` : ''}
            ${missingResult ? `
              <div class="hm-chat-tool-section">
                <div class="hm-chat-tool-label">${escHtml(t('engine.chatResult'))}</div>
                <pre class="hm-chat-tool-code">${escHtml(t('engine.chatToolNoResultDetail'))}</pre>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `
  }

  function renderMaterialBubble(material) {
    if (!material) return ''
    materialCards.set(material.id, material)
    const expanded = expandedMaterialIds.has(material.id)
    const title = material.status === 'ready' ? '已抓取素材' : '素材不足'
    const tone = material.status === 'ready' ? 'is-ready' : 'is-partial'
    const expandedText = formatCapturedMaterialAsTranscript(material.fullText) || material.fullText
    const source = material.resolvedUrl && material.resolvedUrl !== material.url
      ? material.resolvedUrl
      : material.url
    return `
      <div class="hm-chat-material ${tone}" data-material-card="${escAttr(material.id)}">
        <div class="hm-chat-material-head">
          <div>
            <div class="hm-chat-material-title">
              <span class="hm-chat-material-dot" aria-hidden="true"></span>
              ${escHtml(title)}
            </div>
            <div class="hm-chat-material-meta">
              <span>${escHtml(material.platform)}</span>
              ${material.tools.length ? `<span>${escHtml(material.tools.join(' / '))}</span>` : ''}
              ${source ? `<span title="${escAttr(source)}">${escHtml(source)}</span>` : ''}
            </div>
          </div>
          <button type="button"
                  class="hm-chat-material-action"
                  data-material-${expanded ? 'collapse' : 'expand'}="${escAttr(material.id)}">
            ${expanded ? '收起' : '展开完整素材'}
          </button>
        </div>
        ${material.title ? `<div class="hm-chat-material-subtitle">${escHtml(material.title)}</div>` : ''}
        <div class="hm-chat-material-reason">${escHtml(material.reason)}</div>
        <div class="hm-chat-material-preview">${escHtml(material.preview)}${material.fullText.length > material.preview.length ? '…' : ''}</div>
        ${expanded ? `
          <div class="hm-chat-material-full">
            <div class="hm-chat-material-full-head">
              <span>素材逐字稿</span>
              <button type="button" class="hm-chat-material-copy" data-material-copy="${escAttr(material.id)}">
                ${ICONS.copy}<span>复制逐字稿</span>
              </button>
            </div>
            <pre>${escHtml(expandedText)}</pre>
          </div>
        ` : ''}
      </div>
    `
  }

  function toolRowName(m) {
    return String(m?.toolName || m?.name || '').trim()
  }

  function toolRowStatus(m) {
    return String(m?.toolStatus || m?.status || '').trim().toLowerCase()
  }

  function toolRowHasResult(m) {
    const v = m?.toolResult ?? m?.result ?? m?.content
    return v != null && String(v).trim() !== ''
  }

  function shouldHideToolRow(m) {
    const name = toolRowName(m)
    const status = toolRowStatus(m)
    const failed = status === 'error' || status === 'failed' || status === 'failure'
    const emptyDone = !toolRowHasResult(m) && status !== 'running'
    if (name.startsWith('browser_')) return true
    if (name === 'skill_view' || name === 'session_search') return failed || emptyDone
    return failed || emptyDone
  }

  function renderCompactAssistantHtml(rawText) {
    const compact = compactChatMessage(rawText)
    const previewHtml = compact.preview ? mdToHtml(compact.preview) : ''
    const fullHtml = compact.content ? mdToHtml(compact.content) : ''
    const canToggle = !!compact.collapsed
    const toolHtml = compact.toolLines.length ? `
      <details class="tool-log-summary">
        <summary>${escHtml(compact.toolSummary)}</summary>
        <pre>${escHtml(compact.toolLines.join('\n'))}</pre>
      </details>
    ` : ''
    const toggleHtml = canToggle ? `
      <button type="button" class="assistant-compact-message__toggle" data-compact-toggle>
        收起详情
      </button>
    ` : ''

    return `
      <div class="assistant-compact-message ${canToggle ? 'is-expanded' : ''}">
        ${canToggle && previewHtml ? `<div class="assistant-compact-message__content assistant-compact-message__preview" hidden>${previewHtml}</div>` : ''}
        <div class="assistant-compact-message__content assistant-compact-message__full">${fullHtml}</div>
        ${toggleHtml}
        ${toolHtml}
      </div>
    `
  }

  function renderMessage(m) {
    if (m.role === 'tool') return shouldHideToolRow(m) ? '' : renderToolMessage(m)
    if (m.role === 'system') {
      return `
        <div class="hm-chat-msg hm-chat-msg--system sc-msg-row system" data-mid="${escAttr(m.id)}">
          <div class="hm-chat-msg-bubble sc-msg-bubble system">
            <div class="hm-chat-msg-content">${mdToHtml(m.content)}</div>
          </div>
        </div>
      `
    }
    const isUser = m.role === 'user'
    const canCopy = !!(m.content || '').trim()
    const canSpeak = !isUser && canCopy
    const lifeAssistantHtml = [
      ...(Array.isArray(m.screenshotCards) ? m.screenshotCards.map(renderScreenshotCardHtml) : []),
      ...(Array.isArray(m.confirmations) ? m.confirmations.map(renderUserConfirmationCardHtml) : []),
      m.type === 'screenshot_card' && m.card ? renderScreenshotCardHtml(m.card) : '',
      m.type === 'user_confirmation' && m.confirmation ? renderUserConfirmationCardHtml(m.confirmation) : '',
    ].filter(Boolean).join('')
    const ecommerceCardHtml = renderEcommerceStageCardHtml(m)
    const messageContentHtml = [
      renderMessageAttachments(m.attachments || []),
      (m.content || '').trim() ? (isUser ? mdToHtml(m.content) : renderCompactAssistantHtml(m.content)) : '',
      lifeAssistantHtml,
      ecommerceCardHtml,
      m.isStreaming && !m.content ? '<span class="hm-chat-streaming-dots"><span></span><span></span><span></span></span>' : '',
    ].filter(Boolean).join('')
    return `
      <div class="hm-chat-msg hm-chat-msg--${escHtml(m.role)} sc-msg-row ${isUser ? 'user' : 'assistant'}" data-mid="${escAttr(m.id)}">
        <div class="hm-chat-msg-body">
          ${!isUser ? `<div class="hm-chat-msg-avatar" aria-hidden="true">H</div>` : ''}
          <div class="hm-chat-msg-content-wrap sc-msg-group ${isUser ? 'user' : 'assistant'}">
            <div class="hm-chat-msg-bubble sc-msg-bubble ${isUser ? 'user' : 'assistant'}">
              <div class="hm-chat-msg-content">${messageContentHtml}</div>
            </div>
            <div class="hm-chat-msg-footer sc-msg-meta">
              ${isUser && canCopy ? `
                <button class="hm-chat-msg-copy" data-copy-mid="${escAttr(m.id)}" title="${escHtml(t('engine.chatCopyMessage'))}">
                  ${ICONS.copy}<span>${escHtml(t('engine.chatCopyMessageShort'))}</span>
                </button>
              ` : ''}
              <span class="hm-chat-msg-time">${escHtml(formatTime(m.timestamp))}</span>
              ${!isUser && canSpeak ? `
                <span class="hm-chat-voice-tools">
                <button class="hm-chat-msg-copy hm-chat-msg-voice ${voicePlaybackKey === m.id ? 'is-speaking' : ''}" data-voice-mid="${escAttr(m.id)}" title="${escHtml(voicePlaybackKey === m.id ? t('engine.chatVoiceStopSpeak') : t('engine.chatVoiceSpeak'))}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M19 10a7 7 0 0 1-14 0"/><path d="M12 17v4"/><path d="M8 21h8"/></svg><span>${escHtml(t('engine.chatVoiceSpeak'))}</span>
                </button>
                <select class="hm-chat-read-rate" data-voice-rate-mid="${escAttr(m.id)}" aria-label="朗读速度">
                  ${[0.75, 1, 1.25, 1.5, 2].map(rate => `<option value="${rate}" ${Math.abs(voiceRate - rate) < 0.001 ? 'selected' : ''}>${rate}x</option>`).join('')}
                </select>
                </span>
              ` : ''}
              ${!isUser && canCopy ? `
                <button class="hm-chat-msg-copy" data-copy-mid="${escAttr(m.id)}" title="${escHtml(t('engine.chatCopyMessage'))}">
                  ${ICONS.copy}<span>${escHtml(t('engine.chatCopyMessageShort'))}</span>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `
  }

  function attachmentImageSrc(att) {
    if (!att) return ''
    if (att.dataUrl) return att.dataUrl
    if (att.url) return att.url
    const data = att.content || att.data
    if (!data) return ''
    return `data:${att.mimeType || att.mediaType || 'image/png'};base64,${data}`
  }

  function renderMessageAttachments(attachments = []) {
    const images = (attachments || []).filter(att => {
      const category = String(att?.category || att?.type || '').toLowerCase()
      const mime = String(att?.mimeType || att?.mediaType || att?.mime || '').toLowerCase()
      return category === 'image' || mime.startsWith('image/')
    })
    if (!images.length) return ''
    return `
      <div class="hm-chat-attachments">
        ${images.map(att => {
          const src = attachmentImageSrc(att)
          if (!src) return ''
          return `
            <figure class="hm-chat-attachment-image">
              <img src="${escAttr(src)}" alt="${escAttr(att.fileName || att.name || 'image')}">
              ${att.fileName || att.name ? `<figcaption>${escHtml(att.fileName || att.name)}</figcaption>` : ''}
            </figure>
          `
        }).join('')}
      </div>
    `
  }

  function renderPendingAttachments() {
    if (!pendingAttachments.length) return ''
    return `
      <div class="hm-chat-pending-attachments">
        ${pendingAttachments.map((att, idx) => `
          <div class="hm-chat-pending-image">
            <img src="${escAttr(attachmentImageSrc(att))}" alt="${escAttr(att.fileName || 'image')}">
            <span>${escHtml(att.fileName || 'image')}</span>
            <button type="button" data-remove-attachment="${idx}" title="Remove image">${ICONS.close}</button>
          </div>
        `).join('')}
      </div>
    `
  }

  function renderLiveTools() {
    if (!store.state.streaming) return ''
    const tools = store.state.liveTools.filter(tc => !shouldHideToolRow(tc))
    return `
      <div class="hm-chat-streaming">
        <div class="hm-chat-streaming-mark">
          <span class="hm-chat-streaming-pulse"></span>
          <span class="hm-chat-streaming-label">${escHtml(t('engine.chatThinking'))}</span>
        </div>
        ${tools.length ? `
          <div class="hm-chat-live-tools">
            ${tools.slice().reverse().map(tc => `
              <div class="hm-chat-live-tool">
                <span class="hm-chat-live-tool-icon">${ICONS.tool}</span>
                <span class="hm-chat-live-tool-name">${escHtml(tc.name)}</span>
                ${tc.preview ? `<span class="hm-chat-live-tool-preview">${escHtml(tc.preview)}</span>` : ''}
                ${tc.status === 'running' ? `<span class="hm-chat-tool-spinner"></span>` : ''}
                ${tc.status === 'error' ? `<span class="hm-chat-tool-err">${escHtml(t('engine.chatErrorBadge'))}</span>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `
  }

  function renderMessages() {
    const s = store.activeSession()
    if (!s) {
      return `<div class="hm-chat-messages-empty">${escHtml(t('engine.chatNewSession'))}</div>`
    }
    if (store.state.loadingMessages) {
      return `
        <div class="hm-chat-messages-empty">
          <div class="hm-chat-empty-title">${escHtml(t('engine.chatLoadingMessages'))}</div>
          <div class="hm-chat-empty-sub">${escHtml(t('engine.chatLoadingMessagesSub'))}</div>
        </div>
      `
    }
    if (!s.messages.length && !store.state.streaming) {
      return `
        <div class="hm-chat-messages-empty">
          <div class="hm-chat-empty-title">${escHtml(t('engine.chatEmptyTitle'))}</div>
          <div class="hm-chat-empty-sub">${escHtml(t('engine.chatEmptySub'))}</div>
        </div>
      `
    }
    materialCards = new Map()
    const rows = []
    s.messages.forEach((m, i) => {
      rows.push(renderMessage(m))
      const material = collectTurnMaterial(s.messages, i)
      if (material) rows.push(renderMaterialBubble(material))
    })
    return rows.join('') + renderLiveTools()
  }

  function renderSlashMenu() {
    if (!showSlash) return ''
    const filtered = SLASH_COMMANDS.filter(c => !slashFilter || c.cmd.includes(slashFilter))
    if (!filtered.length) return ''
    return `
      <div class="hm-chat-slash-menu">
        ${filtered.map(c => `
          <button class="hm-chat-slash-item" data-cmd="${escAttr(c.cmd)}">
            <span class="hm-chat-slash-cmd">${escHtml(c.cmd)}</span>
            <span class="hm-chat-slash-desc">${escHtml(t('engine.' + c.desc))}</span>
          </button>
        `).join('')}
      </div>
    `
  }

  function renderLinkMenu() {
    if (!linkMenuOpen) return ''
    return `
      <div class="hm-chat-link-menu">
        <div class="hm-chat-link-row">
          <input id="hm-chat-link-input" class="hm-chat-link-input" type="text"
                 value="${escAttr(linkDraft)}"
                 placeholder="粘贴 http/https 链接">
          <button class="hm-chat-link-read" id="hm-chat-link-read" ${linkBusy ? 'disabled' : ''}>
            ${linkBusy ? '处理中...' : '读取链接'}
          </button>
        </div>
        <p class="hm-chat-link-hint">支持抓取并分析抖音、快手、小红书等 http/https 链接；读取后会先整理素材，再询问是否继续拆解、仿写或优化。</p>
        <div class="hm-chat-link-actions">
          <button class="hm-chat-link-close" id="hm-chat-link-close" ${linkBusy ? 'disabled' : ''}>关闭</button>
        </div>
        ${linkError ? `<div class="hm-chat-link-error">${escHtml(linkError)}</div>` : ''}
      </div>
    `
  }

  function renderInput() {
    const active = store.activeSession()
    const streaming = store.state.streaming
    const placeholder = streaming
      ? t('engine.chatStreamingPlaceholder')
      : t('engine.chatInputPlaceholder')
    // NOTE: textarea is NOT disabled during streaming — the user should still
    // be able to compose the next message while the agent is thinking. The
    // Send button is hidden/swapped instead.
    // The keyboard shortcut hint now lives inside the placeholder so we
    // don't render a duplicate row beneath the textarea (the prior layout
    // looked like "套娃" — same hint shown twice). Slash menu still pops
    // up above when the user types `/`.
    //
    // Token usage strip — only when there's an active session with real
    // usage. Mirrors hermes-web-ui's input-top-bar (sans context-length
    // bar, which requires a server-side endpoint we don't have).
    const totalIn = active?.inputTokens || 0
    const totalOut = active?.outputTokens || 0
    const totalCache = (active?.cacheReadTokens || 0) + (active?.cacheWriteTokens || 0)
    const cost = active?.estimatedCostUsd
    const showUsage = !!active && (totalIn + totalOut + totalCache) > 0
    return `
      <div class="hm-chat-input-area ${attachmentDragActive ? 'is-drag-over' : ''}">
        ${renderSlashMenu()}
        ${renderLinkMenu()}
        ${renderPendingAttachments()}
        ${showUsage ? `
          <div class="hm-chat-usage-bar" title="${escAttr(t('engine.chatUsageTooltip'))}">
            <span class="hm-chat-usage-pill" data-kind="in">
              <span class="hm-chat-usage-label">${escHtml(t('engine.chatUsageIn'))}</span>
              <span class="hm-chat-usage-value">${formatTokens(totalIn)}</span>
            </span>
            <span class="hm-chat-usage-pill" data-kind="out">
              <span class="hm-chat-usage-label">${escHtml(t('engine.chatUsageOut'))}</span>
              <span class="hm-chat-usage-value">${formatTokens(totalOut)}</span>
            </span>
            ${totalCache > 0 ? `
              <span class="hm-chat-usage-pill" data-kind="cache">
                <span class="hm-chat-usage-label">${escHtml(t('engine.chatUsageCache'))}</span>
                <span class="hm-chat-usage-value">${formatTokens(totalCache)}</span>
              </span>` : ''}
            ${cost ? `
              <span class="hm-chat-usage-pill" data-kind="cost">
                <span class="hm-chat-usage-value">${escHtml(formatCost(cost))}</span>
              </span>` : ''}
          </div>` : ''}
        <div class="hm-chat-input-wrap ${streaming ? 'is-streaming' : ''}">
          <button class="hm-chat-attach-btn" id="hm-chat-link-open"
                  type="button"
                  aria-label="读取链接"
                  title="读取链接">
            ${ICONS.plus}
          </button>
          <button class="hm-chat-voice-btn ${voiceInputState === 'recording' || voiceInputState === 'requesting' || voiceInputState === 'stopping' ? 'is-listening' : ''}"
                  id="${voiceInputId}"
                  type="button"
                  aria-label="${escAttr(voiceInputState === 'recording' || voiceInputState === 'requesting' || voiceInputState === 'stopping' ? t('engine.chatVoiceListening') : t('engine.chatVoiceInput'))}"
                  title="${escAttr(voiceInputState === 'recording' || voiceInputState === 'requesting' || voiceInputState === 'stopping' ? t('engine.chatVoiceListening') : t('engine.chatVoiceInput'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M19 10a7 7 0 0 1-14 0"/><path d="M12 17v4"/><path d="M8 21h8"/></svg>
          </button>
          <textarea id="hm-chat-input" class="hm-chat-input"
                    placeholder="${escAttr(placeholder)}"
                    rows="1">${escHtml(inputValue)}</textarea>
          <div class="hm-chat-input-actions">
            ${streaming
              ? `<button class="hm-chat-stop-btn" id="hm-chat-stop" type="button" title="${escHtml(t('engine.chatStop'))}">
                   ${ICONS.stop}
                 </button>`
              : `<button class="hm-chat-send-btn" id="hm-chat-send" type="button"
                         ${hermesSendInFlight || (!inputValue.trim() && !pendingAttachments.length) ? 'disabled' : ''}
                         title="${escHtml(t('engine.chatSend'))}">
                  ${ICONS.send}
                 </button>`}
            <input id="hm-chat-file-input" type="file" multiple hidden>
          </div>
        </div>
      </div>
    `
  }

  function renderHeader() {
    const active = store.activeSession()
    const title = active ? sessionDisplayTitle(active) : t('engine.chatNewSession')
    const source = active?.source && active.source !== '__local__' ? getSourceLabel(active.source) : ''
    const workPath = active ? sessionDisplayPath(active) : ''
    return `
      <header class="hm-chat-header">
        <div class="hm-chat-header-left">
          <button class="hm-chat-toggle-sidebar ${sidebarOpen ? '' : 'is-collapsed'}" id="hm-chat-toggle-sidebar"
                  aria-pressed="${sidebarOpen ? 'true' : 'false'}"
                  title="${escHtml(sidebarOpen ? t('engine.chatHideSessions') : t('engine.chatShowSessions'))}">
            ${ICONS.sidebar}
            <span>${escHtml(sidebarOpen ? t('engine.chatHideSessions') : t('engine.chatShowSessions'))}</span>
          </button>
          <div class="hm-chat-header-title-wrap">
            <span class="hm-chat-header-title">${escHtml(title)}</span>
            ${workPath ? `<span class="hm-chat-source-badge hm-chat-work-path-badge" title="${escAttr(workPath)}">${escHtml(workPath)}</span>` : ''}
            ${source ? `<span class="hm-chat-source-badge">${escHtml(source)}</span>` : ''}
          </div>
        </div>
        <div class="hm-chat-header-right">
          <div class="hm-chat-gw-status ${gwOnline ? 'is-online' : 'is-offline'}"
               title="${escHtml(gwOnline ? t('engine.chatGatewayOnline') : t('engine.chatGatewayOffline'))}">
            <span class="hm-chat-gw-dot"></span>
            <span class="hm-chat-gw-label">GATEWAY</span>
            <span class="hm-chat-gw-text">${escHtml(gwOnline ? t('engine.chatGatewayOnlineShort') : t('engine.chatGatewayOfflineShort'))}</span>
            ${currentModel ? `<span class="hm-chat-gw-model">${escHtml(currentModel)}</span>` : ''}
          </div>
          <button class="hm-btn hm-btn--primary hm-btn--sm hm-chat-collab-btn" id="hm-chat-collab-open"
                  title="Hermes 拆分任务并下发给 OpenClaw / Claude Code">
            协作任务
          </button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-search-open"
                  title="${escHtml(t('engine.chatSearchShortcut'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-copy-id"
                  ${!active ? 'disabled' : ''}
                  title="${escHtml(t('engine.chatCopySessionId'))}">
            ${ICONS.copy}
          </button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-new-chat">
            ${ICONS.plus}<span>${escHtml(t('engine.chatNewChat'))}</span>
          </button>
        </div>
      </header>
    `
  }

  // ----------------------------------------------------------- draw

  function draw() {
    const scrollTop = el.querySelector('.hm-chat-messages')?.scrollTop
    const wasNearBottom = isMessagesNearBottom()
    const activeSessionId = store.state.activeSessionId
    const activeChanged = activeSessionId !== lastActiveSessionId
    if (activeChanged) {
      lastActiveSessionId = activeSessionId
      forceScrollBottom = true
    }

    const activeInput = document.activeElement?.id === 'hm-chat-input' && el.contains(document.activeElement)
      ? document.activeElement
      : null
    const suppressTextareaCapture = hermesSendInFlight || Date.now() < suppressTextareaCaptureUntil
    if (activeInput && !suppressTextareaCapture) {
      inputFocused = true
      inputValue = activeInput.value
      inputCaret = activeInput.selectionStart || inputValue.length
    } else if (activeInput && suppressTextareaCapture) {
      activeInput.value = inputValue
      try { activeInput.setSelectionRange(inputCaret, inputCaret) } catch {}
    }

    el.innerHTML = `
      <div class="hm-chat-shell ${sidebarOpen ? '' : 'is-sidebar-collapsed'}">
        <div class="hm-chat-sidebar-backdrop" id="hm-chat-sidebar-backdrop"></div>
        ${renderSidebar()}
        <section class="hm-chat-main">
          ${renderHeader()}
          <div class="hm-chat-messages sc-chat-stage" id="hm-chat-messages">
            ${renderMessages()}
          </div>
          <button class="hm-chat-jump-bottom" id="hm-chat-jump-bottom" type="button">
            <span>↓</span>${escHtml(t('engine.chatJumpBottom'))}
          </button>
          ${renderInput()}
        </section>
      </div>
    `
    bind()

    // Restore / auto-scroll.
    const msgsEl = el.querySelector('.hm-chat-messages')
    if (msgsEl) {
      if (forceScrollBottom || wasNearBottom) {
        msgsEl.scrollTop = msgsEl.scrollHeight
        // 只在有实际消息内容时才消耗 forceScrollBottom 标记。
        // 首次 draw() 时 store 尚未加载，内容为空（scrollHeight=0），
        // 此时如果直接消耗标记，等消息加载完毕后第二次 draw() 就不会滚到底部了。
        if (msgsEl.scrollHeight > 0) {
          forceScrollBottom = false
        }
      } else if (scrollTop != null) {
        msgsEl.scrollTop = scrollTop
      }
      updateJumpButton()
    }

    // Restore textarea focus + caret position after every redraw so typing
    // remains smooth even when store mutations trigger a full DOM rebuild.
    const input = el.querySelector('#hm-chat-input')
    if (input) {
      if (inputFocused) {
        input.focus()
        try {
          const pos = Math.min(inputCaret, inputValue.length)
          input.setSelectionRange(pos, pos)
        } catch { /* selection unsupported for the current state */ }
      }
      autoResize(input)
    }
    lastRenderedStreaming = store.state.streaming

    // Draw search modal on top if open.
    drawSearchModal()

    const linkInput = el.querySelector('#hm-chat-link-input')
    if (linkInput && linkMenuOpen) {
      linkInput.focus()
      try {
        const pos = linkDraft.length
        linkInput.setSelectionRange(pos, pos)
      } catch {}
    }
  }

  function isMessagesNearBottom(threshold = 120) {
    const m = el.querySelector('.hm-chat-messages')
    if (!m) return true
    return m.scrollHeight - m.scrollTop - m.clientHeight < threshold
  }

  function updateJumpButton() {
    const btn = el.querySelector('#hm-chat-jump-bottom')
    if (!btn) return
    btn.classList.toggle('is-visible', !isMessagesNearBottom(180))
  }

  function drawMessagesOnly() {
    const msgsEl = el.querySelector('.hm-chat-messages')
    if (!msgsEl || !el.querySelector('.hm-chat-shell')) return false
    const scrollTop = msgsEl.scrollTop
    const wasNearBottom = isMessagesNearBottom()
    msgsEl.innerHTML = renderMessages()
    bindMessageActions()
    if (forceScrollBottom || wasNearBottom) {
      msgsEl.scrollTop = msgsEl.scrollHeight
      if (msgsEl.scrollHeight > 0) forceScrollBottom = false
    } else {
      msgsEl.scrollTop = scrollTop
    }
    updateJumpButton()
    lastRenderedStreaming = store.state.streaming
    return true
  }

  // ----------------------------------------------------------- event binding

  function toggleSelected(sid) {
    if (!sid) return
    if (selected.has(sid)) selected.delete(sid)
    else selected.add(sid)
    draw()
  }

  function bindMessageActions() {
    el.querySelectorAll('[data-copy-mid]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const mid = btn.dataset.copyMid
        const s = store.activeSession()
        const msg = s?.messages.find(m => m.id === mid)
        if (!msg?.content) return
        const ok = await copyText(msg.content)
        toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
      })
    })

    el.querySelectorAll('[data-voice-mid]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const mid = btn.dataset.voiceMid
        const s = store.activeSession()
        const msg = s?.messages.find(m => m.id === mid)
        const text = msg?.content || ''
        if (!text.trim()) return
        const status = await voicePlaybackController.toggleAsync({ key: mid, text, rate: voiceRate })
        if (status === 'started') toast(t('engine.chatVoiceFallbackTts'), 'info')
        else if (status === 'unsupported') toast(t('engine.chatVoicePlaybackUnsupported'), 'warning')
      })
    })

    el.querySelectorAll('[data-voice-rate-mid]').forEach(select => {
      select.addEventListener('click', (e) => e.stopPropagation())
      select.addEventListener('change', (e) => {
        e.stopPropagation()
        voiceRate = Number(select.value) || 1
        localStorage.setItem('superclaw-hermes-voice-rate', String(voiceRate))
        voicePlaybackController.setRate(voiceRate)
        draw()
      })
    })

    el.querySelectorAll('.hm-chat-code-copy').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const code = btn.closest('pre')?.querySelector('code')?.textContent || ''
        if (!code) return
        const ok = await copyText(code)
        toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
      })
    })

    el.querySelectorAll('[data-material-expand]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.materialExpand
        if (!id || expandedMaterialIds.has(id)) return
        const ok = await showConfirm('展开后会显示本次后台读取到的完整页面文案和公开素材，是否继续？')
        if (!ok) return
        expandedMaterialIds.add(id)
        draw()
      })
    })

    el.querySelectorAll('[data-material-collapse]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.dataset.materialCollapse
        if (!id) return
        expandedMaterialIds.delete(id)
        draw()
      })
    })

    el.querySelectorAll('[data-material-copy]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.materialCopy
        const material = materialCards.get(id)
        if (!material?.fullText) return
        const ok = await copyText(material.fullText)
        toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
      })
    })

    el.querySelectorAll('[data-tool-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toolToggle
        if (expandedToolIds.has(id)) expandedToolIds.delete(id)
        else expandedToolIds.add(id)
        draw()
      })
    })

    el.querySelectorAll('[data-compact-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const wrapper = btn.closest('.assistant-compact-message')
        if (!wrapper) return
        const expanded = wrapper.classList.toggle('is-expanded')
        wrapper.classList.toggle('is-collapsed', !expanded)
        const preview = wrapper.querySelector('.assistant-compact-message__preview')
        const full = wrapper.querySelector('.assistant-compact-message__full')
        if (preview) preview.hidden = expanded
        if (full) full.hidden = !expanded
        btn.textContent = expanded ? '收起详情' : '展开详情'
      })
    })
  }

  function bind() {
    // --- Sidebar header ---
    el.querySelector('.hm-chat-new-btn')?.addEventListener('click', () => {
      handleNewWorkFileSession()
    })
    el.querySelector('#hm-chat-toggle-sidebar')?.addEventListener('click', () => {
      sidebarOpen = !sidebarOpen
      draw()
    })
    el.querySelector('#hm-chat-sidebar-backdrop')?.addEventListener('click', () => {
      sidebarOpen = false
      draw()
    })
    const msgsEl = el.querySelector('#hm-chat-messages')
    msgsEl?.addEventListener('scroll', updateJumpButton)
    el.querySelector('#hm-chat-jump-bottom')?.addEventListener('click', () => {
      if (!msgsEl) return
      msgsEl.scrollTop = msgsEl.scrollHeight
      updateJumpButton()
    })

    // --- Group collapse ---
    el.querySelectorAll('.hm-chat-group-head[data-group]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Don't collapse when clicking static-header style.
        if (btn.classList.contains('hm-chat-group-head--static')) return
        const src = btn.dataset.group
        store.toggleCollapsed(src)
      })
    })

    // --- Session select ---
    el.querySelectorAll('.hm-chat-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.hm-chat-session-action')) return
        const sid = item.dataset.sid
        if (!sid) return
        if (selectionMode) {
          toggleSelected(sid)
          return
        }
        if (sid !== store.state.activeSessionId) {
          forceScrollBottom = true
          store.switchSession(sid)
          if (mobileQuery.matches) sidebarOpen = false
        }
      })
      item.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (e.target.closest('.hm-chat-session-action')) return
        e.preventDefault()
        const sid = item.dataset.sid
        if (!sid) return
        if (selectionMode) {
          toggleSelected(sid)
          return
        }
        if (sid !== store.state.activeSessionId) {
          forceScrollBottom = true
          store.switchSession(sid)
          if (mobileQuery.matches) sidebarOpen = false
        }
      })
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const sid = item.dataset.sid
        openSessionContextMenu(e.clientX, e.clientY, sid)
      })
    })

    // --- Selection mode controls ---
    el.querySelector('#hm-chat-select-toggle')?.addEventListener('click', () => {
      selectionMode = !selectionMode
      if (!selectionMode) selected.clear()
      profileMenuOpen = false
      draw()
    })
    el.querySelectorAll('[data-sid-check]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        toggleSelected(btn.dataset.sidCheck)
      })
    })
    el.querySelector('#hm-chat-bulk-select-all')?.addEventListener('click', () => {
      const ids = visibleSessionIds()
      const allSelected = ids.length > 0 && ids.every(id => selected.has(id))
      if (allSelected) selected.clear()
      else for (const id of ids) selected.add(id)
      draw()
    })
    el.querySelector('#hm-chat-bulk-delete')?.addEventListener('click', async () => {
      if (selected.size === 0) return
      const ok = await showConfirm(t('engine.chatConfirmBulkDelete').replace('{n}', String(selected.size)))
      if (!ok) return
      const ids = Array.from(selected)
      const result = await store.bulkDeleteSessions(ids)
      selected.clear()
      const skipped = result.skipped.length
      const failed = result.failed.length
      const deleted = result.deleted.length
      if (deleted > 0 && failed === 0 && skipped === 0) {
        toast(t('engine.chatBulkDeleted').replace('{n}', String(deleted)), 'success')
      } else if (deleted > 0) {
        toast(t('engine.chatBulkPartial')
          .replace('{n}', String(deleted))
          .replace('{f}', String(failed + skipped)), 'success')
      } else {
        toast(t('engine.chatBulkFailed'), 'error')
      }
      if (failed === 0) selectionMode = false
      draw()
    })

    // --- Profile switcher ---
    el.querySelector('#hm-chat-profile-toggle')?.addEventListener('click', (e) => {
      const btn = e.currentTarget
      if (btn?.disabled) return
      profileMenuOpen = !profileMenuOpen
      draw()
    })
    el.querySelectorAll('[data-profile]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const name = btn.dataset.profile
        profileMenuOpen = false
        if (!name || name === store.state.activeProfile) {
          draw()
          return
        }
        if (store.state.streaming) {
          toast(t('engine.chatProfileSwitchBlocked'), 'error')
          draw()
          return
        }
        try {
          await store.switchProfile(name)
          toast(t('engine.chatProfileSwitched').replace('{name}', name), 'success')
        } catch (err) {
          toast((err?.message || String(err)), 'error')
        }
      })
    })

    el.querySelectorAll('.hm-chat-session-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const sid = btn.dataset.sidMenu
        const rect = btn.getBoundingClientRect()
        openSessionContextMenu(rect.left, rect.bottom + 4, sid)
      })
    })

    // --- Session delete ---
    el.querySelectorAll('.hm-chat-session-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const sid = btn.dataset.sidDel
        const ok = await showConfirm(t('engine.chatConfirmDelete'))
        if (!ok) return
        try {
          await store.deleteSession(sid)
          toast(t('engine.chatSessionDeleted'), 'success')
        } catch (err) {
          const msg = err?.message === 'RUNNING_SESSION' ? t('engine.chatDeleteRunningBlocked') : (err?.message || err)
          toast(t('engine.chatDeleteFailed') + ': ' + msg, 'error')
        }
      })
    })

    bindMessageActions()

    // --- Header actions ---
    el.querySelector('#hm-chat-new-chat')?.addEventListener('click', () => {
      handleNewWorkFileSession()
    })
    el.querySelector('#hm-chat-collab-open')?.addEventListener('click', () => openCollaborationDialog())
    el.querySelector('#hm-chat-search-open')?.addEventListener('click', () => openSearch())
    el.querySelector('#hm-chat-copy-id')?.addEventListener('click', async () => {
      const s = store.activeSession()
      if (!s) return
      try {
        const ok = await copyText(s.id)
        toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
      } catch { toast(t('engine.chatCopyFailed'), 'error') }
    })

    // --- Input ---
    //
    // We track the composed text in `inputValue` (outside the DOM) so it
    // survives redraws triggered by streaming updates or slash-menu toggles.
    // The textarea's `value` is authoritative only between events; on the
    // next draw() the markup re-seeds it from `inputValue`.
    const input = el.querySelector('#hm-chat-input')
    if (input) {
      // Event ordering: focus / blur → keydown → input. We update the state
      // on BOTH input (value) and selectionchange proxies (keydown/keyup) to
      // keep caret restore accurate.
      input.addEventListener('focus', () => { inputFocused = true })
      input.addEventListener('blur', () => { inputFocused = false })
      input.addEventListener('keyup', () => { inputCaret = input.selectionStart || 0 })
      input.addEventListener('click', () => { inputCaret = input.selectionStart || 0 })

      input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          handleSend(e)
          return
        }
        if (e.key === 'Escape' && showSlash) {
          showSlash = false
          draw()
        }
      })

      input.addEventListener('input', () => {
        inputValue = input.value
        inputCaret = input.selectionStart || inputValue.length
        const sendBtn = el.querySelector('#hm-chat-send')
        if (sendBtn) sendBtn.disabled = !inputValue.trim() || !!store.state.streaming || hermesSendInFlight
        const wasShowing = showSlash
        if (inputValue.startsWith('/') && !inputValue.includes(' ')) {
          showSlash = true
          slashFilter = inputValue
        } else if (showSlash) {
          showSlash = false
        }
        // Only call draw() when the slash menu visibility actually changes —
        // otherwise a plain keystroke would trigger an expensive full rebuild.
        if (wasShowing !== showSlash || (showSlash && slashFilter !== inputValue)) {
          draw()
        } else {
          autoResize(input)
        }
      })
    }

    const voiceBtn = el.querySelector(`#${voiceInputId}`)
    if (voiceBtn) {
      voiceBtn.addEventListener('click', (e) => {
        e.preventDefault()
        voiceInputController.toggle()
      })
    }

    el.querySelector('#hm-chat-link-open')?.addEventListener('click', async () => {
      linkMenuOpen = !linkMenuOpen
      linkError = ''
      inputFocused = false
      if (linkMenuOpen && !linkDraft) {
        try {
          const clip = await navigator.clipboard?.readText?.()
          const url = extractFirstHttpUrl(clip)
          if (url) linkDraft = url
        } catch {}
      }
      draw()
    })
    el.querySelector('#hm-chat-link-close')?.addEventListener('click', () => {
      linkMenuOpen = false
      linkError = ''
      inputFocused = true
      draw()
    })
    const linkInput = el.querySelector('#hm-chat-link-input')
    if (linkInput) {
      linkInput.addEventListener('input', () => {
        linkDraft = linkInput.value
        linkError = ''
      })
      linkInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleReadLink()
        } else if (e.key === 'Escape') {
          linkMenuOpen = false
          inputFocused = true
          draw()
        }
      })
    }
    el.querySelector('#hm-chat-link-read')?.addEventListener('click', handleReadLink)
    const fileInput = el.querySelector('#hm-chat-file-input')
    fileInput?.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || [])
      fileInput.value = ''
      await handlePickAttachments(files)
    })

    el.querySelectorAll('[data-remove-attachment]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.removeAttachment)
        if (Number.isInteger(idx)) pendingAttachments.splice(idx, 1)
        if (!pendingAttachments.length) pendingAttachmentInstructions = ''
        inputFocused = true
        draw()
      })
    })

    el.querySelector('#hm-chat-send')?.addEventListener('click', handleSend)
    el.querySelector('#hm-chat-stop')?.addEventListener('click', () => {
      store.stopStreaming()
      toast(t('engine.chatStopped'), 'success')
    })

    el.querySelectorAll('.hm-chat-slash-item').forEach(item => {
      item.addEventListener('click', () => {
        const cmd = item.dataset.cmd
        inputValue = cmd + ' '
        inputCaret = inputValue.length
        inputFocused = true
        showSlash = false
        draw()
      })
    })
  }

  function autoResize(input) {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 160) + 'px'
  }

  async function handleReadLink() {
    if (linkBusy) return
    const url = extractFirstHttpUrl(linkDraft)
    if (!url) {
      linkError = '请输入有效的 http/https 链接'
      draw()
      return
    }
    linkBusy = true
    linkError = ''
    draw()
    try {
      const supplement = inputValue.trim()
      linkMenuOpen = false
      linkDraft = ''
      if (isVideoShareUrl(url)) {
        const platform = videoPlatformLabel(url)
        const visibleText = supplement
          ? `${supplement}\n${url}`
          : `请分析这个${platform}视频链接：${url}`
        const modelContent = appendUserSupplement(formatVideoLinkAnalysisRequest(url), supplement)
        const instructions = formatShortVideoWorkflowInstructions(platform)
        resetInput()
        forceScrollBottom = true
        draw()
        await store.sendMessage(visibleText, { modelContent, instructions })
        toast('已开始后台读取并拆解视频链接', 'success')
      } else {
        const content = await api.assistantFetchUrl(url)
        const visibleText = supplement
          ? `${supplement}\n${url}`
          : `请分析这个链接：${url}`
        const modelContent = appendUserSupplement(formatFetchedLinkForPrompt(url, content), supplement)
        resetInput()
        forceScrollBottom = true
        draw()
        await store.sendMessage(visibleText, { modelContent })
        toast('已开始分析链接内容', 'success')
      }
    } catch (e) {
      const message = e?.message || String(e)
      if (isVideoShareUrl(url)) {
        const platform = videoPlatformLabel(url)
        const supplement = inputValue.trim()
        const visibleText = supplement
          ? `${supplement}\n${url}`
          : `请分析这个${platform}视频链接：${url}`
        const modelContent = appendUserSupplement(formatVideoLinkAnalysisRequest(url, `抓取失败: ${message}`), supplement)
        linkMenuOpen = false
        linkDraft = ''
        resetInput()
        forceScrollBottom = true
        draw()
        await store.sendMessage(visibleText, {
          modelContent,
          instructions: formatShortVideoWorkflowInstructions(platform),
        })
        toast('已交给 Hermes 后台继续读取', 'warning')
      } else {
        linkError = message
      }
    } finally {
      linkBusy = false
      draw()
    }
  }

  async function handlePickAttachment(file) {
    if (linkBusy) return
    const isImage = file?.type?.startsWith('image/')
    const isText = isReadableTextFile(file)
    if (!isImage && !isText) {
      linkError = '请选择图片或常见文本文件'
      toast(linkError, 'warning')
      draw()
      return
    }
    const maxImageBytes = 8 * 1024 * 1024
    const maxTextBytes = 1024 * 1024
    if (isImage && file.size > maxImageBytes) {
      linkError = '图片过大，请选择 8MB 以内的图片'
      toast(linkError, 'warning')
      draw()
      return
    }
    if (isText && file.size > maxTextBytes) {
      linkError = '文件过大，请选择 1MB 以内的文本文件'
      toast(linkError, 'warning')
      draw()
      return
    }
    linkBusy = true
    linkError = ''
    draw()
    try {
      let block = ''
      let nextInstructions = ''
      if (isImage) {
        const dataUrl = await readFileAsDataUrl(file)
        const parsed = parseImageDataUrl(dataUrl, file?.type || 'image/png')
        const imageId = `hermes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const savedPath = await api.saveImage(imageId, dataUrl)
        pendingAttachments.push({
          category: 'image',
          type: 'image',
          mimeType: parsed.mimeType,
          fileName: file?.name || `paste-${Date.now()}.png`,
          content: parsed.content,
          dataUrl,
          savedPath,
        })
        block = ''
        nextInstructions = [
          '本轮用户通过输入框右侧的曲别针按钮主动添加了图片，已经触发图片/视觉识别。',
          '请直接调用可用的视觉/图片读取能力分析该图片，不要等待用户再次确认；普通文本对话不要主动启用视觉。',
          '如果当前模型或工具链不支持图片识别，请用中文明确说明当前无法看图。',
        ].join('\n')
      } else {
        const content = await readFileAsText(file)
        block = formatSelectedFileForPrompt(file, content)
        nextInstructions = '本轮用户通过输入框右侧的曲别针按钮主动添加了文本文件，请优先结合该文件内容回答。'
      }
      if (block) {
        const prefix = inputValue.trim() ? '\n\n' : ''
        const insertAt = Math.max(0, Math.min(inputCaret || inputValue.length, inputValue.length))
        inputValue = inputValue.slice(0, insertAt) + prefix + block + inputValue.slice(insertAt)
        inputCaret = insertAt + prefix.length + block.length
      }
      inputFocused = true
      linkMenuOpen = false
      linkDraft = ''
      pendingAttachmentInstructions = nextInstructions
      toast(isImage ? '图片已加入输入框' : '文件内容已加入输入框', 'success')
    } catch (e) {
      linkError = e?.message || String(e)
      toast(linkError, 'error')
    } finally {
      linkBusy = false
      draw()
    }
  }

  async function handlePickAttachments(files) {
    const list = Array.from(files || []).filter(Boolean)
    if (!list.length) return
    for (const file of list) {
      await handlePickAttachment(file)
    }
  }

  function openSessionContextMenu(x, y, sid) {
    const s = store.state.sessions.find(sess => sess.id === sid)
    if (!s) return
    const isPinned = store.state.pinned.has(sid)
    const workItems = s.workFilePath ? [
      {
        label: t('engine.chatOpenWorkFolder'),
        icon: ICONS.folder,
        action: async () => {
          try {
            await api.assistantOpenPath(s.workFileDir || s.workFilePath)
            toast(t('engine.chatWorkFolderOpened'), 'success')
          } catch (err) {
            toast(`${t('engine.chatOpenWorkFolderFailed')}: ${err?.message || err}`, 'error')
          }
        },
      },
      {
        label: t('engine.chatCopyWorkFilePath'),
        icon: ICONS.copy,
        action: async () => {
          const ok = await copyText(s.workFilePath)
          toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
        },
      },
    ] : []
    showContextMenu(x, y, [
      {
        label: isPinned ? t('engine.chatUnpin') : t('engine.chatPin'),
        icon: ICONS.pin,
        action: () => store.togglePinned(sid),
      },
      ...workItems,
      {
        label: t('engine.chatRename'),
        action: async () => {
          const next = await showRenameModal(s.title)
          if (next == null) return
          const ok = await store.renameSession(sid, next)
          if (ok) toast(t('engine.chatRenamed'), 'success')
          else toast(t('engine.chatRenameFailed'), 'error')
        },
      },
      {
        label: t('engine.chatCopySessionId'),
        icon: ICONS.copy,
        action: async () => {
          try {
            const ok = await copyText(sid)
            toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
          } catch { toast(t('engine.chatCopyFailed'), 'error') }
        },
      },
      {
        label: t('engine.chatDeleteSession'),
        icon: ICONS.trash,
        danger: true,
        action: async () => {
          const ok = await showConfirm(t('engine.chatConfirmDelete'))
          if (!ok) return
          try {
            await store.deleteSession(sid)
            toast(t('engine.chatSessionDeleted'), 'success')
          } catch (err) {
            const msg = err?.message === 'RUNNING_SESSION' ? t('engine.chatDeleteRunningBlocked') : (err?.message || err)
            toast(t('engine.chatDeleteFailed') + ': ' + msg, 'error')
          }
        },
      },
    ])
  }

  // ----------------------------------------------------------- slash handlers

  /**
   * Reset the composed input state and redraw. Called after a send, slash
   * command, or `/clear`, `/new` shortcut.
   */
  function resetInput() {
    inputValue = ''
    inputCaret = 0
    showSlash = false
    slashFilter = ''
    pendingAttachmentInstructions = ''
    pendingAttachments = []
  }

  function createClientRequestId() {
    try {
      if (crypto?.randomUUID) return crypto.randomUUID()
    } catch {}
    return `hm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }

  function clearLiveTextareaDomValue() {
    const input = el.querySelector('#hm-chat-input')
    if (!input) return
    input.value = ''
    try { input.setSelectionRange(0, 0) } catch {}
    autoResize(input)
  }

  function restoreLiveTextareaDomValue(value, caret = 0) {
    const input = el.querySelector('#hm-chat-input')
    if (!input) return
    input.value = value || ''
    const pos = Math.max(0, Math.min(caret || input.value.length, input.value.length))
    try { input.setSelectionRange(pos, pos) } catch {}
    autoResize(input)
  }

  async function handleNewWorkFileSession() {
    if (store.state.streaming) return
    const rawName = await showWorkFileModal()
    if (rawName == null) return
    let systemInfo = ''
    try { systemInfo = await api.assistantSystemInfo() } catch {}
    const meta = buildWorkFileMeta(rawName, systemInfo)
    if (!meta) return

    try {
      let exists = false
      try {
        const dirList = await api.assistantListDir(meta.workFileDir)
        const fileRe = new RegExp(`^\\[FILE\\]\\s+${escapeRegExp(meta.workFileName)}(?:\\s|$|\\()`, 'm')
        exists = fileRe.test(String(dirList || ''))
      } catch {}
      if (!exists) {
        await api.assistantWriteFile(meta.workFilePath, '')
      }
      store.newChat(meta)
      sidebarOpen = true
      forceScrollBottom = true
      inputFocused = false
      resetInput()
      draw()
      toast(exists ? t('engine.chatWorkFileUsingExisting') : t('engine.chatWorkFileCreated'), 'success')
    } catch (err) {
      toast(`${t('engine.chatWorkFileCreateFailed')}: ${err?.message || err}`, 'error')
    }
  }

  function normalizeCollaborationGoal(text) {
    return String(text || '')
      .replace(/^\s*\[(?:协作任务|协作派单)\]\s*/i, '')
      .trim()
  }

  function isCollaborationTaskRequest(text) {
    return /^\s*\[(?:协作任务|协作派单)\]/i.test(String(text || ''))
  }

  function isOcrIntent(text) {
    return /(ocr|识别文字|文字识别|读取图片文字|图片里的字|截图文字|报错截图|UI 截图|ui截图)/i.test(String(text || ''))
  }

  async function runHermesAttachmentOcr(attachments = []) {
    const image = attachments.find(item => item?.dataUrl || item?.content || item?.savedPath)
    if (!image) return null
    const result = image.savedPath
      ? await ocr.extractTextFromImage(image.savedPath, { sourceType: 'image' })
      : await ocr.extractTextFromImageData(image.dataUrl || `data:${image.mimeType || 'image/png'};base64,${image.content}`, {
          mimeType: image.mimeType || 'image/png',
          sourceType: 'image',
        })
    createTaskResult({
      taskId: `ocr-${Date.now().toString(36)}`,
      sessionId: store.activeSession?.()?.id,
      fromAgent: COLLAB_TARGETS.hermes,
      toAgent: COLLAB_TARGETS.hermes,
      title: result.ok ? 'Hermes OCR completed' : 'Hermes OCR failed',
      content: result.ok ? result.text : result.error,
      failed: !result.ok,
      tool: 'ocr',
      artifacts: [{
        type: 'ocr_text',
        path: image.savedPath || image.fileName || 'clipboard-image',
        text: result.ok ? result.text : result.error,
      }],
    })
    return result
  }

  function createEcommerceBrowserContext(stageLabel = 'OpenClaw') {
    const notConnected = `${stageLabel} browser adapter is not connected in this Hermes page.`
    const fail = (extra = {}) => ({ ok: false, error: notConnected, ...extra })
    return {
      open: async (url) => fail({ url }),
      waitForLoad: async () => fail(),
      readVisibleText: async () => ({ text: '', title: '', url: '', error: notConnected }),
      captureScreenshot: async () => null,
      findInteractiveTargets: async (input = {}) => ({
        buttons: [],
        inputs: [],
        links: [],
        error: notConnected,
        ...input,
      }),
      findInputByHints: async (hints = []) => fail({ hints }),
      type: async (text) => fail({ text }),
      press: async (key) => fail({ key }),
      uploadMediaByHints: async (input = {}) => fail(input),
      typeIntoByHints: async (input = {}) => fail(input),
      findByTextHints: async (input = {}) => ({ found: false, error: notConnected, ...input }),
      clickByTextHints: async (input = {}) => fail(input),
    }
  }

  function pushEcommerceAssistantMessage(message = {}) {
    if (typeof store.pushLocalAssistantMessage === 'function') {
      store.pushLocalAssistantMessage(message)
      return
    }
    const content = String(message.content || message.card?.note || message.confirmation?.description || '').trim()
    if (content) store.pushLocalAssistant(content)
  }

  function appendEcommerceEvent(event) {
    if (!event) return
    if (event.channel === 'ecommerce-workflow' && event.runId && event.runId !== activeEcommerceWorkflowRunId) {
      console.warn('HERMES_STALE_WORKFLOW_OUTPUT_DROPPED', {
        eventRunId: event.runId,
        activeRunId: activeEcommerceWorkflowRunId,
        type: event.type,
      })
      return
    }
    const type = event.type
    if (type === Stage1MessageType.SCREENSHOT_CARD) {
      pushEcommerceAssistantMessage({
        type,
        card: event.card || event,
        content: '',
        createdAt: event.createdAt || Date.now(),
      })
      return
    }
    if (type === Stage1MessageType.USER_CONFIRMATION || type === 'user_confirmation') {
      pushEcommerceAssistantMessage({
        type: Stage1MessageType.USER_CONFIRMATION,
        confirmation: event.confirmation || event.card || event,
        content: '',
        createdAt: event.createdAt || Date.now(),
      })
      return
    }
    if (renderEcommerceStageCardHtml(event)) {
      pushEcommerceAssistantMessage({
        type,
        card: event.card || event,
        content: '',
        createdAt: event.createdAt || Date.now(),
      })
      return
    }
    const content = String(event.content || event.message || '').trim()
    if (content) store.pushLocalAssistant(content)
  }

  async function executeEcommerceRunner(stageLabel, userText, runner, input = {}, context = {}) {
    const runId = `ecommerce-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    activeEcommerceWorkflowRunId = runId
    store.pushLocalUser(userText)
    resetInput()
    forceScrollBottom = true
    draw()
    try {
      await runner(
        { query: userText, userText, ...input },
        {
          emit: (event) => appendEcommerceEvent({
            ...event,
            runId,
            channel: 'ecommerce-workflow',
          }),
          browser: createEcommerceBrowserContext(stageLabel),
          ...context,
        },
      )
    } catch (err) {
      pushEcommerceAssistantMessage({
        type: 'error',
        content: `${stageLabel} failed: ${err?.message || err}`,
        createdAt: Date.now(),
      })
    } finally {
      if (activeEcommerceWorkflowRunId === runId) activeEcommerceWorkflowRunId = null
      forceScrollBottom = true
      draw()
    }
    return true
  }

  async function maybeRunEcommerceStage(userText) {
    const workflowDecision = classifyHermesEcommerceWorkflowIntent(userText)
    if (!workflowDecision.allowed) {
      if (workflowDecision.pendingRequiresConfirmation) {
        store.pushLocalAssistant('检测到未完成电商任务，但不会自动继续。请明确回复“继续电商任务”后再恢复。')
      }
      return false
    }

    if (isStage2LowRiskEnabled()) {
      const detected = detectStage2Intent(userText)
      if (detected.matched) {
        return executeEcommerceRunner(
          'Ecommerce Stage2',
          userText,
          runStage2LowRiskOps,
          { intent: detected.intent },
          { hermes: {} },
        )
      }
    }

    if (isStage4DoudianListingEnabled()) {
      const detected = detectStage4Intent(userText)
      if (detected.matched) {
        return executeEcommerceRunner('Ecommerce Stage4', userText, runStage4DoudianListing, {
          intent: detected.intent,
          images: detected.images,
          detailImages: detected.detailImages,
          productTitle: detected.productTitle,
          category: detected.category,
          price: detected.price,
          inventory: detected.inventory,
        })
      }
    }

    if (isStage3PublishPrepEnabled()) {
      const detected = detectStage3Intent(userText)
      if (detected.matched) {
        return executeEcommerceRunner('Ecommerce Stage3', userText, runStage3PublishPrep, {
          intent: detected.intent,
          mediaFiles: detected.mediaFiles,
          platforms: detected.platforms,
        })
      }
    }

    if (isStage1DesktopAssistEnabled()) {
      const detected = detectStage1Intent(userText)
      if (detected.matched) {
        return executeEcommerceRunner('Ecommerce Stage1', userText, runStage1DesktopAssist, {
          intent: detected.intent,
        })
      }
    }

    const stage56 = detectStage56Intent(userText)
    if (stage56.matched) {
      const canRunLive = stage56.intent === 'live_comment_assist' && isStage5LiveAssistEnabled()
      const canRunPatrol = stage56.intent === 'video_inspiration_patrol' && isStage6VideoPatrolEnabled()
      const canRunUnsafeGuard = stage56.unsafe && (isStage5LiveAssistEnabled() || isStage6VideoPatrolEnabled())
      if (canRunLive || canRunPatrol || canRunUnsafeGuard) {
        return executeEcommerceRunner(
          'Ecommerce Stage56',
          userText,
          runStage56Ops,
          { intent: stage56.intent, platforms: stage56.platforms },
          { hermes: {}, ocr: null, materialRecords: [] },
        )
      }
    }

    return false
  }

  function dispatchCollaborationTask({
    goal,
    executor = COLLAB_TARGETS.openclaw,
    reviewer = COLLAB_TARGETS.claudeCode,
    claudeCodeMode = 'safe',
    openReviewPanel = true,
    closeOverlay = null,
  } = {}) {
    const cleanGoal = normalizeCollaborationGoal(goal)
    if (!cleanGoal) {
      toast('请先填写任务目标。', 'warning')
      return false
    }
    const claudeMode = normalizeClaudeCodeMode(claudeCodeMode)
    const activeSession = store.activeSession?.()
    const sessionId = activeSession?.id
    const recentMessages = (activeSession?.messages || []).slice(-50).map(item => ({
      role: item.role,
      content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content || ''),
      timestamp: item.timestamp || item.createdAt || null,
    }))
    const sharedContext = buildTaskContext({
      sessionId,
      summary: cleanGoal,
      recent_messages: recentMessages,
      important_facts: [
        `executor=${executor}`,
        `reviewer=${reviewer}`,
        `claude_code_mode=${claudeMode.mode}`,
      ],
      artifacts: pendingAttachments.map(item => ({
        type: item?.type || item?.category || 'file',
        path: item?.savedPath || item?.fileName || item?.name || '',
        text: item?.ocrText || '',
      })),
      content: cleanGoal,
    })
    const task = createCollaborationTask({
      goal: cleanGoal,
      sessionId,
      context: sharedContext,
      artifacts: sharedContext.artifacts,
      executor,
      reviewer,
      source: COLLAB_TARGETS.hermes,
      claudeCodeMode: claudeMode.mode,
    })
    createTaskRequest({
      taskId: task.id,
      sessionId,
      fromAgent: COLLAB_TARGETS.hermes,
      toAgent: executor,
      title: shortGoal(cleanGoal),
      content: cleanGoal,
      context: sharedContext,
      artifacts: sharedContext.artifacts,
      mode: executor === COLLAB_TARGETS.claudeCode ? claudeMode.mode : undefined,
      permission_level: executor === COLLAB_TARGETS.claudeCode ? claudeMode.permission_level : undefined,
      requires_confirmation: executor === COLLAB_TARGETS.claudeCode ? claudeMode.requires_confirmation : undefined,
    })
    const brief = buildExecutionBrief(task)
    const reviewBrief = buildReviewBrief(task, '执行方完成后，请读取执行会话交接内容，再按验收要求复核。')
    updateCollaborationTask(task.id, {
      status: 'dispatched',
      lastDispatchedTo: executor,
      dispatchedAt: Date.now(),
      reviewPanelRequested: openReviewPanel,
      claudeCodeMode: claudeMode.mode,
      claudeCodePermissionLevel: claudeMode.permission_level,
      claudeCodeRequiresConfirmation: claudeMode.requires_confirmation,
      context: sharedContext,
      artifacts: sharedContext.artifacts,
    })
    setPendingDispatch({
      target: executor,
      taskId: task.id,
      sessionId,
      stage: 'execute',
      title: `[执行] ${targetLabel(executor)} · ${shortGoal(cleanGoal)}`,
      message: brief,
      context: sharedContext,
      artifacts: sharedContext.artifacts,
      mode: executor === COLLAB_TARGETS.claudeCode ? claudeMode.mode : undefined,
      permission_level: executor === COLLAB_TARGETS.claudeCode ? claudeMode.permission_level : undefined,
      requires_confirmation: executor === COLLAB_TARGETS.claudeCode ? claudeMode.requires_confirmation : undefined,
    })
    if (openReviewPanel && reviewer !== executor) {
      setPendingDispatch({
        target: reviewer,
        taskId: task.id,
        sessionId,
        stage: 'review',
        title: `[验收] ${targetLabel(reviewer)} · ${shortGoal(cleanGoal)}`,
        message: reviewBrief,
        context: sharedContext,
        artifacts: sharedContext.artifacts,
        mode: reviewer === COLLAB_TARGETS.claudeCode ? claudeMode.mode : undefined,
        permission_level: reviewer === COLLAB_TARGETS.claudeCode ? claudeMode.permission_level : undefined,
        requires_confirmation: reviewer === COLLAB_TARGETS.claudeCode ? claudeMode.requires_confirmation : undefined,
      })
    }

    if (!store.activeSession()) store.newChat({ title: 'Hermes 协作总控' })
    store.pushLocalUser(`[协作任务]\n${cleanGoal}`)
    store.pushLocalAssistant([
      `已创建协作任务：${task.id}`,
      `Hermes 已拆分：${Array.isArray(task.plan) ? task.plan.length : 0} 个子任务`,
      `执行方：${targetLabel(executor)}`,
      `验收方：${targetLabel(reviewer)}`,
      `验收面板：${openReviewPanel && reviewer !== executor ? '已打开待命' : '暂不打开'}`,
      '',
      '我会先把拆分后的任务单发给执行方；执行完成后，再由验收方复核，最后回到 Hermes 做最终审核。',
    ].join('\n'))

    closeOverlay?.()
    resetInput()
    forceScrollBottom = true
    draw()
    openCollaborationPanel(executor, task.id, {
      title: `${targetLabel(executor)} 执行面板 - ${shortGoal(cleanGoal)}`,
    }).then(() => {
      if (openReviewPanel && reviewer !== executor) {
        setTimeout(() => {
          openCollaborationPanel(reviewer, `${task.id}-review`, {
            title: `${targetLabel(reviewer)} 验收面板 - ${shortGoal(cleanGoal)}`,
          }).catch(err => {
            toast(`打开验收面板失败：${err?.message || err}`, 'error')
          })
        }, 350)
      }
      if (executor === COLLAB_TARGETS.claudeCode) {
        return copyText(brief).then(ok => {
          if (ok) toast('Claude Code 执行面板已打开，协作任务单已复制。', 'success')
        }).catch(() => {})
      }
      toast(`${targetLabel(executor)} 执行面板已打开。`, 'success')
    }).catch(err => {
      toast(`打开执行面板失败：${err?.message || err}`, 'error')
    })
    return true
  }

  function openCollaborationDialog() {
    if (store.state.streaming) {
      toast('Hermes 正在回复，完成后再创建协作任务。', 'warning')
      return
    }
    const defaultGoal = normalizeCollaborationGoal(inputValue)
    const overlay = showContentModal({
      title: 'Hermes 协作任务',
      width: 620,
      content: `
        <div class="form-group">
          <label class="form-label">任务目标</label>
          <textarea class="form-input" id="hm-collab-goal" rows="5"
            placeholder="写清楚要做什么、涉及哪个项目、希望谁执行和谁验收。"
            style="min-height:132px;resize:vertical">${escHtml(defaultGoal)}</textarea>
          <div class="form-hint">Hermes 会先拆分子任务，再生成任务单；执行方新开可见会话，做完后交给验收方和 Hermes 最终审核。</div>
        </div>
        <div class="form-group">
          <label class="form-label">执行方</label>
          <select class="form-input" id="hm-collab-executor">
            <option value="${COLLAB_TARGETS.openclaw}">OpenClaw：改文件、跑命令、执行任务</option>
            <option value="${COLLAB_TARGETS.claudeCode}">Claude Code：原生代码面板/终端能力</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">验收方</label>
          <select class="form-input" id="hm-collab-reviewer">
            <option value="${COLLAB_TARGETS.claudeCode}">Claude Code：代码验收</option>
            <option value="${COLLAB_TARGETS.openclaw}">OpenClaw：执行结果复核</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Claude Code 模式</label>
          <select class="form-input" id="hm-collab-claude-mode">
            <option value="safe" selected>安全模式：受限执行，不允许浏览器/接管</option>
            <option value="browser_automation">浏览器自动化：仅浏览器，单页面</option>
            <option value="takeover">接管模式：完全控制，需要确认</option>
          </select>
          <div class="form-hint">默认使用安全模式；接管模式必须显式确认，不能静默运行。</div>
        </div>
        <label class="form-check" style="align-items:flex-start;gap:10px;margin-top:4px">
          <input type="checkbox" id="hm-collab-open-review" checked style="margin-top:3px">
          <span>
            同时打开验收方待命面板
            <span class="form-hint" style="display:block;margin-top:4px">
              执行方先做事，验收方面板先拿到验收单；执行完成后可直接在该面板继续复核。
            </span>
          </span>
        </label>
      `,
      buttons: [
        { id: 'hm-collab-create', label: '拆分并下发', className: 'hm-btn hm-btn--primary hm-btn--sm' },
      ],
    })
    overlay.querySelector('#hm-collab-create')?.addEventListener('click', () => {
      const goal = overlay.querySelector('#hm-collab-goal')?.value?.trim() || ''
      const executor = overlay.querySelector('#hm-collab-executor')?.value || COLLAB_TARGETS.openclaw
      const reviewer = overlay.querySelector('#hm-collab-reviewer')?.value || COLLAB_TARGETS.claudeCode
      const claudeCodeMode = overlay.querySelector('#hm-collab-claude-mode')?.value || 'safe'
      const openReviewPanel = !!overlay.querySelector('#hm-collab-open-review')?.checked
      dispatchCollaborationTask({
        goal,
        executor,
        reviewer,
        claudeCodeMode,
        openReviewPanel,
        closeOverlay: () => overlay.close(),
      })
    })
  }

  async function handleSend(event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    const attachments = pendingAttachments.slice()
    let text = inputValue.trim()
    if ((!text && !attachments.length) || store.state.streaming || hermesSendInFlight) return
    if (!text && attachments.length) text = '请分析我刚刚上传或粘贴的图片。'

    // Local slash commands short-circuit before going to the agent.
    if (text === '/clear') {
      store.clearActive()
      resetInput(); draw(); return
    }
    if (text === '/new') {
      store.newChat()
      resetInput(); draw(); return
    }
    if (text === '/help') {
      store.pushLocalUser(text)
      store.pushLocalAssistant(
        [
          `**${t('engine.chatSlashTitle')}**`,
          '',
          '`/help` — ' + t('engine.chatSlashHelpDesc'),
          '`/status` — ' + t('engine.chatSlashStatusDesc'),
          '`/memory` — ' + t('engine.chatSlashMemoryDesc'),
          '`/skills` — ' + t('engine.chatSlashSkillsDesc'),
          '`/clear` — ' + t('engine.chatSlashClearDesc'),
          '`/new` — ' + t('engine.chatSlashNewDesc'),
        ].join('\n')
      )
      resetInput(); draw(); return
    }
    if (text === '/status') {
      store.pushLocalUser(text)
      try {
        const info = await api.checkHermes()
        const gw = info?.gatewayRunning ? '✅' : '❌'
        const port = info?.gatewayPort || 8642
        const model = info?.model || '—'
        store.pushLocalAssistant([
          `**${t('engine.chatSlashStatusTitle')}**`,
          '',
          `- ${t('engine.chatSlashGateway')}: ${gw}`,
          `- ${t('engine.chatSlashPort')}: \`${port}\``,
          `- ${t('engine.chatSlashModel')}: \`${model}\``,
        ].join('\n'))
      } catch (e) {
        store.pushLocalAssistant('⚠️ ' + (e?.message || e))
      }
      resetInput(); draw(); return
    }
    if (text === '/memory' || text === '/skills') {
      store.pushLocalUser(text)
      const target = text === '/memory' ? '/h/memory' : '/h/skills'
      store.pushLocalAssistant(
        t('engine.chatSlashRedirect').replace('{page}', `\`${target}\``)
      )
      window.location.hash = '#' + target
      resetInput(); draw(); return
    }

    hermesSendInFlight = true
    const clientRequestId = createClientRequestId()
    const restoreText = inputValue
    const restoreCaret = inputCaret
    const restoreAttachments = pendingAttachments.slice()
    const restoreInstructions = pendingAttachmentInstructions
    let draftCleared = false
    const clearDraftForSend = () => {
      if (draftCleared) return
      forceScrollBottom = true
      resetInput()
      inputFocused = true
      inputCaret = 0
      suppressTextareaCaptureUntil = Date.now() + 10000
      clearLiveTextareaDomValue()
      draftCleared = true
      console.debug('[HermesChat] draft cleared', {
        sessionId: store.state.activeSessionId || 'pending-new-session',
        clientRequestId,
        length: restoreText.length,
      })
      draw()
    }

    if (isCollaborationTaskRequest(text)) {
      clearDraftForSend()
      dispatchCollaborationTask({ goal: text })
      hermesSendInFlight = false
      return
    }

    let ecommerceHandled = false
    try {
      ecommerceHandled = await maybeRunEcommerceStage(text)
    } catch (err) {
      hermesSendInFlight = false
      throw err
    }
    if (ecommerceHandled) {
      clearDraftForSend()
      hermesSendInFlight = false
      return
    }

    let sendInstructions = [
      restoreInstructions,
      buildIntentTriggeredToolInstructions(text),
    ].filter(Boolean).join('\n\n')
    try {
      clearDraftForSend()

    // Normal user message → start agent run.
    if (attachments.length && isOcrIntent(text)) {
      const ocrResult = await runHermesAttachmentOcr(attachments)
      if (ocrResult) {
        const ocrBlock = formatOcrResult(ocrResult)
        sendInstructions = [
          sendInstructions,
          'The following OCR result was produced by the shared SuperClaw OCR service. Use it as task context; if it failed, continue normally and explain the OCR failure only when relevant.',
          ocrBlock,
        ].filter(Boolean).join('\n\n')
        store.pushLocalAssistant(ocrBlock)
      }
    }
      await store.sendMessage(text, {
        clientRequestId,
        instructions: sendInstructions || null,
        attachments,
      })
    } catch (err) {
      suppressTextareaCaptureUntil = 0
      inputValue = restoreText
      inputCaret = restoreCaret
      pendingAttachments = restoreAttachments
      pendingAttachmentInstructions = restoreInstructions
      restoreLiveTextareaDomValue(restoreText, restoreCaret)
      toast(err?.message || String(err), 'error')
      throw err
    } finally {
      hermesSendInFlight = false
      suppressTextareaCaptureUntil = Date.now() + 250
      inputFocused = true
      inputCaret = inputValue.length
      draw()
    }
  }

  // ----------------------------------------------------------- search modal
  //
  // Triggered by Ctrl/Cmd + K anywhere on the chat page (or header button).
  // Lives as a detached overlay rendered into `document.body` so it survives
  // the main chat redraws and is easy to dismiss with outside clicks.

  let searchOverlay = null

  function openSearch() {
    if (searchState) return
    searchState = { query: '', selectedIdx: 0 }
    draw()
  }

  function closeSearch() {
    searchState = null
    if (searchOverlay) {
      searchOverlay.remove()
      searchOverlay = null
    }
  }

  function searchResults() {
    if (!searchState) return []
    const q = searchState.query.trim()
    // Empty query → show recent sessions (first 15) so the modal isn't blank.
    if (!q) {
      return store.state.sessions.slice(0, 15).map(session => ({
        session,
        score: 0,
        snippet: session.title || t('engine.chatNewSession'),
      }))
    }
    return store.searchSessions(q, 20)
  }

  function drawSearchModal() {
    if (!searchState) {
      if (searchOverlay) { searchOverlay.remove(); searchOverlay = null }
      return
    }
    const results = searchResults()
    const idx = Math.min(searchState.selectedIdx, Math.max(0, results.length - 1))
    searchState.selectedIdx = idx

    if (!searchOverlay) {
      searchOverlay = document.createElement('div')
      searchOverlay.className = 'hm-chat-search-overlay'
      document.body.appendChild(searchOverlay)
    }

    searchOverlay.innerHTML = `
      <div class="hm-chat-search-panel" data-engine="hermes">
        <div class="hm-chat-search-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="hm-chat-search-icon">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="hm-chat-search-input" id="hm-chat-search-input"
                 value="${escAttr(searchState.query)}"
                 placeholder="${escAttr(t('engine.chatSearchPlaceholder'))}"/>
          <kbd class="hm-chat-search-kbd">Esc</kbd>
        </div>
        <div class="hm-chat-search-results" id="hm-chat-search-results">
          ${results.length === 0 ? `
            <div class="hm-chat-search-empty">${escHtml(t('engine.chatSearchEmpty'))}</div>
          ` : results.map((r, i) => {
            const s = r.session
            const src = s.source && s.source !== '__local__' ? getSourceLabel(s.source) : ''
            return `
              <button class="hm-chat-search-item ${i === idx ? 'is-active' : ''}" data-sid="${escAttr(s.id)}" data-idx="${i}">
                <div class="hm-chat-search-item-main">
                  <div class="hm-chat-search-item-title">
                    ${escHtml(s.title || t('engine.chatNewSession'))}
                    ${src ? `<span class="hm-chat-search-item-src">${escHtml(src)}</span>` : ''}
                  </div>
                  ${r.snippet && r.snippet !== s.title ? `
                    <div class="hm-chat-search-item-snippet">${escHtml(r.snippet)}</div>
                  ` : ''}
                </div>
                <div class="hm-chat-search-item-meta">
                  ${s.model ? `<span class="hm-chat-search-item-model">${escHtml(s.model)}</span>` : ''}
                  <span class="hm-chat-search-item-time">${escHtml(formatTime(s.updatedAt))}</span>
                </div>
              </button>
            `
          }).join('')}
        </div>
        <div class="hm-chat-search-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> ${escHtml(t('engine.chatSearchNavigate'))}</span>
          <span><kbd>Enter</kbd> ${escHtml(t('engine.chatSearchOpen'))}</span>
        </div>
      </div>
    `

    const inputEl = searchOverlay.querySelector('#hm-chat-search-input')
    inputEl?.focus()
    try {
      const pos = searchState.query.length
      inputEl?.setSelectionRange(pos, pos)
    } catch {}

    inputEl?.addEventListener('input', () => {
      searchState.query = inputEl.value
      searchState.selectedIdx = 0
      drawSearchModal()
    })

    searchOverlay.addEventListener('mousedown', (e) => {
      if (e.target === searchOverlay) closeSearch()
    }, { once: true })

    searchOverlay.querySelectorAll('.hm-chat-search-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sid
        selectSearchResult(sid)
      })
      btn.addEventListener('mouseenter', () => {
        searchState.selectedIdx = Number(btn.dataset.idx)
        // Cheap class swap instead of full redraw.
        searchOverlay.querySelectorAll('.hm-chat-search-item').forEach(b =>
          b.classList.toggle('is-active', Number(b.dataset.idx) === searchState.selectedIdx))
      })
    })
  }

  function selectSearchResult(sid) {
    if (!sid) return
    forceScrollBottom = true
    store.switchSession(sid)
    if (mobileQuery.matches) sidebarOpen = false
    closeSearch()
  }

  // --- Global keyboard: Ctrl/Cmd+K opens search, keys navigate when open ---
  function onGlobalKey(e) {
    if (!el.isConnected) return
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform)
    const mod = isMac ? e.metaKey : e.ctrlKey
    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      if (searchState) closeSearch()
      else openSearch()
      return
    }
    if (!searchState) return
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const results = searchResults()
      if (!results.length) return
      searchState.selectedIdx = (searchState.selectedIdx + 1) % results.length
      drawSearchModal()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const results = searchResults()
      if (!results.length) return
      searchState.selectedIdx = (searchState.selectedIdx - 1 + results.length) % results.length
      drawSearchModal()
    } else if (e.key === 'Enter') {
      const results = searchResults()
      const hit = results[searchState.selectedIdx]
      if (hit) {
        e.preventDefault()
        selectSearchResult(hit.session.id)
      }
    }
  }
  document.addEventListener('keydown', onGlobalKey)

  // Close profile menu on outside click (capture so menu's own click handlers
  // still get to run before we close).
  function onGlobalClick(e) {
    const screenshotButton = e.target?.closest?.('[data-open-screenshot]')
    if (screenshotButton) {
      const url = screenshotButton.getAttribute('data-open-screenshot')
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    if (!profileMenuOpen) return
    if (!el.isConnected) return
    const wrap = el.querySelector('.hm-chat-sidebar-profile')
    if (wrap && wrap.contains(e.target)) return
    profileMenuOpen = false
    draw()
  }
  document.addEventListener('click', onGlobalClick)
  const onInboxMessage = (event) => {
    if (!event?.detail || event.detail.to_agent === COLLAB_TARGETS.hermes) renderHermesInboxMessages()
    consumeHermesExecutionDispatch().catch(err => {
      toast(`Hermes 执行队列读取失败：${err?.message || err}`, 'error')
    })
  }
  window.addEventListener('superclaw-agent-task-message', onInboxMessage)
  window.addEventListener('storage', onInboxMessage)

  // Detach the global listener + close modal on unmount. A single
  // MutationObserver watches our parent; when `el` is detached, we run the
  // full teardown (stream listeners, subscription, search modal, keydown).
  const teardown = () => {
    document.removeEventListener('keydown', onGlobalKey)
    document.removeEventListener('click', onGlobalClick)
    document.removeEventListener('paste', onPasteImage, true)
    document.removeEventListener('visibilitychange', onVisibilityRefreshStatus)
    window.removeEventListener('superclaw-agent-task-message', onInboxMessage)
    window.removeEventListener('storage', onInboxMessage)
    if (unlistenGatewayStatus) { unlistenGatewayStatus(); unlistenGatewayStatus = null }
    if (drawFrame != null) {
      cancelAnimationFrame(drawFrame)
      drawFrame = null
    }
    voiceInputController.destroy()
    voicePlaybackController.destroy()
    closeSearch()
    unsubscribe()
    store.detachStreamListeners()
  }
  const mountObserver = new MutationObserver(() => {
    if (!el.isConnected) { teardown(); mountObserver.disconnect() }
  })
  requestAnimationFrame(() => {
    if (el.parentNode) mountObserver.observe(el.parentNode, { childList: true })
  })

  // Seed the initial draw (before store load resolves).
  draw()
  renderHermesInboxMessages()
  consumeHermesExecutionDispatch().catch(err => {
    toast(`Hermes 执行队列读取失败：${err?.message || err}`, 'error')
  })
  return el
}
