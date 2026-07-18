/**
 * Hermes Chat Store — reactive state for sessions, messages and streaming.
 *
 * Mirrors the shape of `hermes-web-ui`'s Pinia `chat` store in a dependency-
 * free, vanilla JS pub/sub style. A single instance is exported (`chatStore`);
 * the page subscribes via `chatStore.subscribe(listener)` and receives a
 * notification on every mutation.
 *
 * Responsibilities:
 *   - Load sessions from the backend (via `api.hermesSessionsSummaryList`) and merge
 *     with local-only sessions that haven't been flushed yet.
 *   - Load + map a session's messages (role/content/tool details).
 *   - Handle streaming via Tauri's `hermes-run-*` events, accumulating delta
 *     text into an assistant message and tracking live tool calls.
 *   - Persist session summaries + per-session messages to `localStorage` so
 *     reopening the page renders instantly while server data revalidates.
 *   - Manage pinned sessions + collapsed groups (UI prefs).
 *
 * Non-responsibilities (left for the page):
 *   - Rendering (the store never touches the DOM).
 *   - File attachment uploads (kept out of scope for Phase 4).
 *   - Full tmux-like run resume (Tauri events are in-process and reliable).
 */
import { api, isTauriRuntime } from '../../../lib/tauri-api.js'
import { selectStableActiveSession } from '../../../lib/agent-session-persistence.js'
import {
  mapAgentGatewayStatusToAgentRun,
  mapTaskBoundAgentHeartbeat,
} from '../../../lib/agent-gateway-status.js'
import { mapCollaborationTaskMessageToTaskEvents } from '../../../lib/collaboration.js'
import { SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE, sanitizeVisibleReplyForChinese } from '../../../lib/visible-reply-language.js'
import {
  dedupeToolEvents,
  formatHermesCollaborationCapabilityReply,
  isHermesCollaborationCapabilityQuestion,
  stripInternalStatusText,
} from '../../../shared/chat-output-guard.js'
import {
  buildAgentIdentitySystemPrompt,
  guardAgentIdentityReply,
} from '../../../shared/agent-identity-guard.js'
import {
  detectHermesImageIntent,
  completeHermesReplyIfNeeded,
  formatHermesToolSummaryForUser,
  getHermesTaskStatusSummary,
  getHermesAssistantMessageId,
  HERMES_IMAGE_CLARIFY_REPLY,
  HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY,
  HermesResponseAssembler,
  isHermesDebugToolsVisible,
  isHermesTaskStatusQuestion,
  mapHermesErrorToUserMessage,
  normalizeHermesStreamText,
  normalizeHermesVisibleReply as normalizeHermesVisibleReplyText,
  splitHermesMediaLines,
} from './hermes-response-assembler.js'

// Normal user turns are executed by the bundled Hermes Agent. Frontend-only
// capability/status answers are retained below solely for compatibility tests.
const HERMES_NATIVE_EXECUTION_ONLY = true
import {
  buildHermesMemoryContext,
  handleHermesMemoryCommand,
} from './hermes-memory-store.js'
import {
  buildHermesImageCapabilityStatus,
  formatHermesImageCapabilityReply,
  formatHermesImageCapabilityReadFailureReply,
  isHermesImageCapabilityQuestion,
  normalizeGenerationModelCapability,
  normalizeGenerationPrompt,
  normalizeGenerationResult,
} from './hermes-image-capability.js'

const formatToolResultsForUser = formatHermesToolSummaryForUser

// ---------- constants ----------

const STORAGE_PROFILE = 'hermes_chat_profile_v1'
const STORAGE_SESSIONS_PREFIX = 'hermes_chat_sessions_v2_'
const STORAGE_ACTIVE_PREFIX = 'hermes_chat_active_v2_'
const STORAGE_PINNED_PREFIX = 'hermes_chat_pinned_'
const STORAGE_COLLAPSED_PREFIX = 'hermes_chat_collapsed_groups_'
const STORAGE_MSGS_PREFIX = 'hermes_chat_msgs_v2_'
const STORAGE_DELETED_PREFIX = 'hermes_chat_deleted_sessions_v1_'
const LIVE_BADGE_WINDOW_MS = 5 * 60 * 1000  // 5 min
const HISTORY_MAX_TURNS = 6
const HISTORY_MAX_CHARS = 10000
const HISTORY_ASSISTANT_MAX_CHARS = 1600
const HISTORY_ASSISTANT_OMITTED_MARKER = '[previous assistant response omitted to avoid replay]'
const FIRST_SEND_SESSION_HOLD_MS = 45 * 1000
const HERMES_EXACT_SHORT_LOCAL_TAIL_HOLD_MS = 12 * 1000
const DELETED_SESSION_TTL_MS = 24 * 60 * 60 * 1000
// This is an idle watchdog, not a wall-clock deadline. Native Hermes runs can
// legitimately take time while tools work or a user reviews an approval.
const HERMES_RUN_TIMEOUT_MS = 5 * 60 * 1000
const HERMES_RUN_RECOVERY_DELAY_MS = 30 * 1000
const HERMES_GENERIC_RETRY_FALLBACK_TEXT = '\u8fd9\u6b21\u56de\u590d\u6ca1\u6709\u5b8c\u6574\u751f\u6210\u3002\u8bf7\u4f60\u518d\u53d1\u4e00\u6b21\u95ee\u9898\uff0c\u6211\u4f1a\u91cd\u65b0\u6574\u7406\u6210\u5b8c\u6574\u7ed3\u8bba\u3002'
const HERMES_REASONING_PLACEHOLDER = '\u6b63\u5728\u5206\u6790\u4efb\u52a1\u5e76\u51c6\u5907\u4e0b\u4e00\u6b65\u3002'
const HERMES_MEDIA_RETURN_HARD_INSTRUCTION = [
  'CURRENT-CHAT MEDIA RETURN IS A REQUIRED TOOL ACTION FOR THIS TURN.',
  'Do not answer with a capability explanation. Do not use send_message, MEDIA:, MEDIA_DATA:, or vision_analyze as a substitute.',
  'When the request asks to generate a simple PNG containing text, call superclaw_return_media exactly once with its text argument. Do not use terminal or a sandbox path for that simple case. For an existing screenshot or generated image file, call it with the verified absolute path.',
  'The successful superclaw_return_media result is the only evidence that the image reached the current SuperClaw chat. Keep the final text empty or to one short caption after the successful tool call.',
].join('\n')
const HERMES_VISIBLE_EXECUTION_NARRATION = /^(?:\u6211(?:\u6765|\u5148|\u4f1a|\u6b63\u5728)(?:\u770b\u770b|\u67e5\u770b|\u68c0\u67e5|\u641c\u4e00\u4e0b|\u641c\u7d22|\u8bfb\u53d6|\u6838\u5bf9|\u5b9a\u4f4d|\u5206\u6790|\u786e\u8ba4|\u5c1d\u8bd5|\u83b7\u53d6|\u5904\u7406|\u6574\u7406|\u6267\u884c)|\u8ba9\u6211(?:\u5148|\u518d|\u53bb)?(?:\u770b\u770b|\u67e5\u770b|\u68c0\u67e5|\u641c\u4e00\u4e0b|\u641c\u7d22|\u8bfb\u53d6|\u6838\u5bf9|\u5b9a\u4f4d|\u5206\u6790|\u786e\u8ba4|\u5c1d\u8bd5|\u83b7\u53d6|\u5904\u7406|\u6574\u7406|\u6267\u884c)|(?:\u63a5\u4e0b\u6765|\u4e0b\u4e00\u6b65|\u5148)(?:\u6211|\u4f1a|\u9700\u8981|\u5c1d\u8bd5|\u67e5\u770b|\u68c0\u67e5|\u641c\u7d22|\u8bfb\u53d6|\u5b9a\u4f4d|\u786e\u8ba4|\u6267\u884c)|(?:\u6b63\u5728|\u51c6\u5907)(?:\u67e5\u770b|\u68c0\u67e5|\u641c\u7d22|\u8bfb\u53d6|\u5b9a\u4f4d|\u5206\u6790|\u786e\u8ba4|\u5c1d\u8bd5|\u6267\u884c|\u5904\u7406)|\u62b1\u6b49[\u2014\u2013-]|\u627e\u5230\u539f\u56e0\u4e86|\u8fd9\u6b21\u6362\u6210)/
const HERMES_REPLY_STYLE_INSTRUCTION = [
  SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE,
  '\u56de\u590d\u98ce\u683c\uff1a\u8bf7\u4f7f\u7528\u7b80\u4f53\u4e2d\u6587\uff0c\u53ef\u4ee5\u5728\u6807\u9898\u3001\u91cd\u70b9\u6216\u5206\u6bb5\u5904\u9002\u5ea6\u52a0\u5165\u5c11\u91cf\u8868\u60c5\u6216\u5c0f\u56fe\u6807\uff08\u4f8b\u5982 \ud83e\udd16\u3001\ud83d\udccc\u3001\u2705\u3001\ud83e\udded\u3001\ud83d\udca1\uff09\u3002',
  '\u4fdd\u6301\u81ea\u7136\u3001\u514b\u5236\u3001\u53ef\u8bfb\uff1a\u4e0d\u8981\u6bcf\u53e5\u90fd\u52a0\u8868\u60c5\uff0c\u4e0d\u8981\u5806\u780c\u56fe\u6807\uff0c\u4e0d\u8981\u5f71\u54cd\u4e13\u4e1a\u6027\u548c\u4fe1\u606f\u51c6\u786e\u6027\u3002',
  'The Hermes chat UI supports standard Markdown rendering. When structure helps, you may use Markdown headings, lists, tables, blockquotes, links, inline code, and fenced code blocks. Do not claim the interface only supports plain text.',
].join('\n')

const SOURCE_LABELS = {
  telegram: 'Telegram',
  api_server: 'API Server',
  cli: 'CLI',
  discord: 'Discord',
  slack: 'Slack',
  matrix: 'Matrix',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  email: 'Email',
  sms: 'SMS',
  dingtalk: 'DingTalk',
  feishu: 'Feishu',
  wecom: 'WeCom',
  weixin: 'WeChat',
  bluebubbles: 'iMessage',
  mattermost: 'Mattermost',
  cron: 'Cron',
}

export function compactHermesHistoryContentForPrompt(role, content) {
  const text = String(content || '').trim()
  if (!text) return ''
  if (role !== 'assistant') return text
  const visible = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
    .replace(/```(?:tool|trace|debug|analysis|reasoning)\n[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!visible) return HISTORY_ASSISTANT_OMITTED_MARKER
  if (visible.length <= HISTORY_ASSISTANT_MAX_CHARS) return visible
  return `${visible.slice(0, HISTORY_ASSISTANT_MAX_CHARS).trim()}\n${HISTORY_ASSISTANT_OMITTED_MARKER}`
}

// Hermes sometimes exposes a user-visible work narration through message.delta
// instead of a reasoning.available summary. It is not a final answer; keep it
// in the execution trace so the transcript stays concise after completion.
export function extractHermesVisibleExecutionNarration(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim()
  if (!text || text.length > 900) return ''
  if (/```|^\s*(?:#|>|[-*+]\s|\d+\.\s)|\|.*\|/m.test(text)) return ''
  const compact = text.replace(/\s+/g, ' ')
  if (!HERMES_VISIBLE_EXECUTION_NARRATION.test(compact)) return ''
  return compact
}

export function stripHermesVisibleExecutionNarration(reply, executionTrace = []) {
  let text = String(reply || '')
  const narrations = (Array.isArray(executionTrace) ? executionTrace : [])
    .filter(step => step?.kind === 'reasoning' && step?.source === 'stream-visible')
    .map(step => String(step.summary || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

  for (const narration of narrations) {
    // These are exact user-visible stream fragments previously stored in the
    // execution trace. Do not use broad semantic removal on the final answer.
    text = text.split(narration).join('')
  }
  return text.replace(/^\s*\n+|\n{3,}/g, match => match.includes('\n\n\n') ? '\n\n' : '').trim()
}

function hermesVisibleNarrationEventId(clientRequestId, narration) {
  let hash = 0
  for (const char of String(narration || '')) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0
  return `${clientRequestId}:reasoning:visible:${hash.toString(36)}`
}

function isHermesLongTaskRequest(text) {
  const value = String(text || '').trim()
  if (!value) return false
  if (/(?:\u53ea\u56de\u590d|\u53ea\u7b54|\u53ea\u8f93\u51fa|reply\s+only|only\s+reply|answer\s+only).{0,20}(?:\u4e24\u4e2a\u5b57|\u4e00\u53e5|OK|ok|\u6536\u5230)/i.test(value)) return false
  if (/(?:markdown|md\s*格式|\u6807\u9898|\u5217\u8868|\u5f15\u7528|\u4ee3\u7801\u5757|\u8868\u683c)/i.test(value)
    && /(?:\u56de\u590d|\u6e32\u67d3|\u683c\u5f0f|\u6837\u5f0f|\u663e\u793a|\u6d4b\u8bd5|reply|render|format)/i.test(value)) return false
  const hasAction = /(?:\u8dd1|\u6267\u884c|\u751f\u6210|\u5199\u5165|\u521b\u5efa|\u5904\u7406|\u68c0\u6d4b|\u68c0\u67e5|\u67e5\u8be2|\u641c\u7d22|\u67e5\u770b|\u8bfb\u53d6|\u6253\u5f00|\u83b7\u53d6|\u4e0b\u8f7d|\u5b89\u88c5|\u4fee\u590d|\u89e3\u51b3|\u5206\u6790|\u6574\u7406|\u5bfc\u51fa|\u8c03\u7528|\u53d1\u8d77|\u7ee7\u7eed|run|execute|generate|create|write|check|test|smoke|audit|export|dispatch|search|fetch|read|open|install|fix|continue)/i.test(value)
  const hasLongTaskTarget = /(?:P0|P1|P2|P3|P4|P0\s*[-~\u5230\u81f3]\s*P4|check-p0-p4|release\s+gate|preflight|runtime\s+smoke|\u957f\u4efb\u52a1|\u6267\u884c\u4efb\u52a1|\u95e8\u7981|\u5b8c\u6574\u6027|\u811a\u672c|\u547d\u4ee4|\u7ec8\u7aef|\u5de5\u5177|\u534f\u4f5c|\u4ea7\u7269|\u6587\u4ef6|\u6587\u6863|\u9875\u9762|\u7f51\u9875|\u6570\u636e|\u7ed3\u679c|\u4fe1\u606f|\u5929\u6c14|\u65b0\u95fb|task_event|tool_run|agent_run|checkpoint|tool|command|terminal|script|artifact)/i.test(value)
  return hasAction && hasLongTaskTarget
}

function getHermesExactShortReplyTarget(text) {
  const value = String(text || '').trim().replace(/\s+/g, ' ')
  if (!value || value.length > 80) return ''
  const asksExactReply = /(?:\u53ea\u56de\u590d|\u53ea\u56de\u7b54|\u4ec5\u56de\u590d|\u4ec5\u56de\u7b54|\u53ea\u7b54|\u53ea\u8f93\u51fa|reply\s+only|only\s+reply|answer\s+only)/i.test(value)
  const asksShortLength = /(?:\u4e24\u4e2a\u5b57|2\s*\u4e2a\u5b57)/i.test(value)
  if (asksExactReply && asksShortLength && /\u6536\u5230/.test(value)) return '\u6536\u5230'
  if (asksExactReply && /\u6536\u5230/.test(value)) return '\u6536\u5230'
  if (!asksExactReply) return ''
  const quoted = value.match(/(?:\u53ea\u56de\u590d|\u53ea\u56de\u7b54|\u4ec5\u56de\u590d|\u4ec5\u56de\u7b54|\u53ea\u7b54|\u53ea\u8f93\u51fa|reply\s+only|only\s+reply|answer\s+only).{0,12}["'`\u201c\u201d\u300c\u300d]([^"'`\u201c\u201d\u300c\u300d\s]{1,8})["'`\u201c\u201d\u300c\u300d]/i)
  return quoted?.[1] || ''
}

function normalizeHermesExactShortReply(userText, assistantText) {
  const target = getHermesExactShortReplyTarget(userText)
  if (!target) return assistantText
  const current = String(assistantText || '').trim()
  return current === target ? assistantText : target
}

function stripHermesReplyOnlyDirectiveForHistory(text) {
  return String(text || '')
    .replace(/[\s,，.。;；:：!！?？-]*(?:请)?(?:只|仅)(?:回复|回答|输出|答)(?:\s*(?:两个字|2\s*个字|一句话|一行|one\s+line|two\s+words))?[\s:："'“”‘’「」]*收到[\s"'“”‘’「」.。!！?？]*$/i, '')
    .replace(/[\s,，.。;；:：!！?？-]*(?:reply\s+only|only\s+reply|answer\s+only)[\s:："'“”‘’「」]*(?:received|ok|收到)[\s"'“”‘’「」.。!！?？]*$/i, '')
    .trim()
}

function markHermesExactShortLocalTail(session, userText = '') {
  const target = getHermesExactShortReplyTarget(userText)
  if (!session || !target) return false
  session.protectLocalTailUntil = Date.now() + HERMES_EXACT_SHORT_LOCAL_TAIL_HOLD_MS
  session.protectedLocalTailReply = target
  return true
}

function hasHermesProtectedLocalTail(session) {
  return !!(
    session
    && Number(session.protectLocalTailUntil || 0) > Date.now()
    && String(session.protectedLocalTailReply || '').trim()
  )
}

function stripHermesGenericRetryFallback(text) {
  const value = String(text || '')
  if (!value.includes(HERMES_GENERIC_RETRY_FALLBACK_TEXT)) return value
  return value
    .replaceAll(HERMES_GENERIC_RETRY_FALLBACK_TEXT, '')
    .replace(/^\s*[。.!！？?,，:：;；-]+\s*/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isHermesExecutionEvidenceText(text) {
  const value = String(text || '')
  if (!value) return false
  return /(?:task_event|tool_run|agent_run|checkpoint|toolResult|stdout|stderr|exit\s*code|exitCode|\u547d\u4ee4\u8f93\u51fa|\u7ec8\u7aef\u8f93\u51fa|\u6267\u884c\u7ed3\u679c|\u5b8c\u6574\u6027\u62a5\u544a|\u6d4b\u8bd5\u62a5\u544a|P0\s*[:：]|P1\s*[:：]|P2\s*[:：]|P3\s*[:：]|P4\s*[:：])/.test(value)
}

function isHermesPromiseOnlyLongTaskReply(text) {
  const value = String(text || '').trim()
  if (!value || isHermesExecutionEvidenceText(value)) return false
  const promisesWork = /(?:\u6211\u6765|\u6211\u4f1a|\u597d\u7684|\u597d[，,]|\u5f00\u59cb|\u9a6c\u4e0a|\u7ed9\u4f60|\u5e2e\u4f60|\u5148|\u63a5\u4e0b\u6765|I'll|I will|let me|starting)/i.test(value)
  const mentionsTask = /(?:\u5904\u7406|\u6267\u884c|\u8dd1|\u6d4b\u8bd5|\u68c0\u67e5|\u67e5\u8be2|\u641c\u7d22|\u67e5\u770b|\u8bfb\u53d6|\u6253\u5f00|\u83b7\u53d6|\u5206\u6790|\u751f\u6210|\u6574\u7406|\u7ee7\u7eed|P0|P1|P2|P3|P4|task|tool|command|script|artifact|search|fetch|read|open)/i.test(value)
  return promisesWork && mentionsTask
}

function hasHermesExecutionEvidence(message = {}, tools = []) {
  return !!(
    (Array.isArray(tools) && tools.length) ||
    (Array.isArray(message.task_events) && message.task_events.length) ||
    (Array.isArray(message.taskEvents) && message.taskEvents.length) ||
    (Array.isArray(message.tool_runs) && message.tool_runs.length) ||
    (Array.isArray(message.toolRuns) && message.toolRuns.length) ||
    (Array.isArray(message.agent_runs) && message.agent_runs.length) ||
    (Array.isArray(message.agentRuns) && message.agentRuns.length) ||
    message.checkpoint_id ||
    message.checkpointId ||
    isHermesExecutionEvidenceText(message.content)
  )
}

function buildHermesLongTaskUnavailableReply(userText = '') {
  if (!isHermesLongTaskRequest(userText)) return ''
  return [
    '\u8fd9\u6b21\u957f\u4efb\u52a1\u6ca1\u6709\u62ff\u5230 task_event\u3001tool_run\u3001agent_run \u6216 checkpoint \u7b49\u6267\u884c\u8bc1\u636e\uff0c\u6240\u4ee5\u6211\u4e0d\u4f1a\u628a\u201c\u6211\u6765\u505a\u201d\u8fd9\u7c7b\u53e3\u5934\u627f\u8bfa\u5f53\u6210\u4efb\u52a1\u5b8c\u6210\u3002',
    '\u53ef\u80fd\u539f\u56e0\uff1a\u5f53\u524d\u6253\u5305\u7248\u6267\u884c\u5668\u672a\u542f\u52a8\u3001\u957f\u4efb\u52a1\u672a\u521b\u5efa\u3001\u5de5\u5177\u94fe\u4e0d\u53ef\u7528\uff0c\u6216\u8fd0\u884c\u8d85\u65f6\u3002\u8bf7\u68c0\u67e5 Hermes \u6267\u884c\u5668\u3001\u5de5\u5177\u94fe\u548c\u534f\u4f5c\u4efb\u52a1\u72b6\u6001\u540e\u91cd\u8bd5\u3002',
  ].join('\n\n')
}

function applyHermesPromiseOnlyTaskGuard(message, userText, tools = [], clientRequestId = '') {
  if (!message || !isHermesLongTaskRequest(userText)) return false
  if (!isHermesPromiseOnlyLongTaskReply(message.content) || hasHermesExecutionEvidence(message, tools)) return false

  message.content = sanitizeHermesVisibleReply(buildHermesLongTaskUnavailableReply(userText), userText)
  message.error = message.content
  message.task_events = [
    ...(Array.isArray(message.task_events) ? message.task_events : []),
    {
      event_id: `evt-hermes-long-task-no-evidence-${clientRequestId || Date.now()}`,
      task_id: clientRequestId || '',
      event_type: 'task_failed',
      actor: 'hermes',
      source: 'hermes.chat_store.long_task_guard',
      status: 'failed',
      visible_text: message.content,
      severity: 'error',
      created_at: new Date().toISOString(),
    },
  ]
  return true
}

export function buildHermesGenerationStatusMetadata(input = {}) {
  const capability = normalizeGenerationModelCapability(input)
  const prompt = normalizeGenerationPrompt({
    ...input,
    forbidden_actions: [
      ...(Array.isArray(input.forbidden_actions) ? input.forbidden_actions : []),
      ...(Array.isArray(input.forbiddenActions) ? input.forbiddenActions : []),
      'create_local_export_file',
      'read_runtime_data_secrets',
    ],
  })
  const result = normalizeGenerationResult({
    ...input,
    status: input.status || capability.capabilities?.[prompt.output_type] || 'planned',
    artifacts: capability.executable?.[prompt.output_type] === true ? input.artifacts : [],
    task_events: input.task_events || input.taskEvents || [],
    tool_runs: input.tool_runs || input.toolRuns || [],
    acceptance_summary: input.acceptance_summary || input.acceptanceSummary,
  })

  return {
    source: 'hermes.chat_store.generation_status',
    status: result.status,
    capability,
    prompt,
    result,
    task_events: result.task_events,
    tool_runs: result.tool_runs,
    acceptance_summary: result.acceptance_summary,
    adapter_policy: prompt.adapter_policy,
  }
}

export function getSourceLabel(source) {
  if (!source) return ''
  return SOURCE_LABELS[source] || source
}

// ---------- helpers ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function stableIsoTime(value, fallback = null) {
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  if (fallback) return stableIsoTime(fallback)
  return new Date().toISOString()
}

function isSensitiveToolRunKey(key) {
  return /api[_-]?key|access[_-]?token|refresh[_-]?token|token|cookie|secret|password/i.test(String(key || ''))
}

function redactHermesSensitiveVisibleText(value) {
  return String(value ?? '')
    .replace(/((?:api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|cookie|secret|password|MINIMAX_API_KEY|OPENAI_API_KEY|CLAUDE_API_KEY)\s*[:=]\s*)["']?[^"'\s,;，；\]}]{8,}["']?/gi, '$1[REDACTED]')
    .replace(/\b(?:sk|sk-cp|sk-proj)-[A-Za-z0-9._=-]{12,}\b/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]')
    .replace(/[A-Z]:\\Users\\[^"'\r\n]+?(?=(?:\\(?:config\.yaml|\.env|openclaw\.json|relay-config\.json)|["'\r\n]|$))/gi, '[REDACTED_PATH]')
    .replace(/[A-Z]:\\[^"'\r\n]*(?:config\.yaml|\.env|openclaw\.json|relay-config\.json)/gi, '[REDACTED_PATH]')
    .replace(/\/[^"'\r\n]*(?:config\.yaml|\.env|openclaw\.json|relay-config\.json)/gi, '[REDACTED_PATH]')
}

// `MEDIA:` is an internal desktop attachment envelope. Keep its path long
// enough for the renderer to load the file, while still applying the normal
// redactor to all user-visible prose. The chat renderer consumes the envelope
// and never prints this path as message text.
export function preserveHermesMediaProtocol(value, transform = (text) => text) {
  const { mediaLines, visibleText } = splitHermesMediaLines(String(value ?? ''))
  const visible = transform(visibleText)
  return [...mediaLines, visible].filter(Boolean).join('\n')
}

function sanitizeToolRunText(value) {
  return redactHermesSensitiveVisibleText(value).replace(
    /(fake-[a-z0-9-]*(?:api-key|token|cookie|secret|access-token|refresh-token|password)[a-z0-9-]*)/gi,
    '[REDACTED]',
  )
}

function sanitizeFrontendObservabilityText(value) {
  return sanitizeToolRunText(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, '[REDACTED]')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '[REDACTED]')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '[REDACTED]')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '[REDACTED]')
    .replace(/private (?:model )?reasoning/gi, '[REDACTED]')
    .replace(/private chain of thought/gi, '[REDACTED]')
    .replace(/[A-Z]:\\Users\\[^"'\s]+/gi, '[REDACTED_PATH]')
    .replace(/\/Users\/[^"'\s]+/gi, '[REDACTED_PATH]')
    .replace(/(?:runtime\/data\/secrets|src-tauri\/resources\/data\/secrets|relay-config\.json|\.env)/gi, '[REDACTED_PATH]')
}

function summarizeToolRunValue(value) {
  if (value == null || value === '') return ''
  const redacted = redactToolRunPayload(value)
  const text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted)
  return sanitizeToolRunText(text)
}

function stableToolRunErrorCode(error, fallback = 'TOOL_RUN_FAILED') {
  const raw = typeof error === 'object' && error
    ? (error.code || error.error_code || error.name || fallback)
    : (error || fallback)
  const code = String(raw || fallback)
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  return code || fallback
}

export function normalizeToolRunStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'started') return 'started'
  if (value === 'running') return 'running'
  if (value === 'done' || value === 'complete' || value === 'completed' || value === 'success' || value === 'succeeded') return 'completed'
  if (value === 'error' || value === 'failed' || value === 'failure') return 'failed'
  if (value === 'cancelled' || value === 'canceled') return 'cancelled'
  return 'running'
}

export function redactToolRunPayload(value) {
  if (Array.isArray(value)) return value.map(item => redactToolRunPayload(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (isSensitiveToolRunKey(key)) return [key, '[REDACTED]']
      return [key, redactToolRunPayload(item)]
    }))
  }
  if (typeof value === 'string') return sanitizeToolRunText(value)
  return value
}

export function redactFrontendObservabilityPayload(value) {
  if (Array.isArray(value)) return value.map(item => redactFrontendObservabilityPayload(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (isSensitiveToolRunKey(key) || /hidden[_-]?reasoning|reasoning|chain[_-]?of[_-]?thought|local[_-]?path/i.test(String(key || ''))) {
        return [key, '[REDACTED]']
      }
      return [key, redactFrontendObservabilityPayload(item)]
    }))
  }
  if (typeof value === 'string') return sanitizeFrontendObservabilityText(value)
  return value
}

export const redactObservabilityViewModelPayload = redactFrontendObservabilityPayload

export function mapHermesLiveToolToToolRun(liveTool = {}) {
  const status = normalizeToolRunStatus(liveTool.status)
  const startedAt = stableIsoTime(liveTool.started_at || liveTool.created_at || liveTool.timestamp || liveTool.updated_at)
  const completedAt = status === 'completed' || status === 'failed' || status === 'cancelled'
    ? stableIsoTime(liveTool.completed_at || liveTool.updated_at || liveTool.finished_at || liveTool.timestamp, startedAt)
    : null
  const error = liveTool.error || liveTool.error_message || null

  return {
    tool_run_id: String(liveTool.tool_run_id || liveTool.id || liveTool.toolCallId || liveTool.tool_call_id || `${liveTool.runId || liveTool.run_id || 'hermes'}:tool`),
    task_id: String(liveTool.task_id || liveTool.taskId || liveTool.runId || liveTool.run_id || liveTool.clientRequestId || liveTool.client_request_id || 'hermes-tool-task'),
    tool_name: String(liveTool.tool_name || liveTool.toolName || liveTool.name || liveTool.tool || 'tool'),
    provider: String(liveTool.provider || 'hermes'),
    status,
    input_summary: summarizeToolRunValue(liveTool.args ?? liveTool.input ?? liveTool.arguments ?? liveTool.parameters ?? ''),
    output_summary: summarizeToolRunValue(liveTool.result ?? liveTool.output ?? ''),
    error_code: status === 'failed' ? stableToolRunErrorCode(error) : null,
    error_message: status === 'failed' ? summarizeToolRunValue(typeof error === 'object' && error ? (error.message || error) : error) : null,
    started_at: startedAt,
    completed_at: completedAt,
  }
}

export function mapHermesToolMessageToToolRun(message = {}) {
  const status = normalizeToolRunStatus(message.toolStatus || message.status)
  const startedAt = stableIsoTime(message.started_at || message.created_at || message.timestamp || message.updated_at)
  const completedAt = status === 'completed' || status === 'failed' || status === 'cancelled'
    ? stableIsoTime(message.completed_at || message.updated_at || message.timestamp, startedAt)
    : null

  return {
    tool_run_id: String(message.tool_run_id || message.id || message.toolCallId || message.tool_call_id || `${message.runId || message.run_id || 'hermes'}:tool-message`),
    task_id: String(message.task_id || message.taskId || message.runId || message.run_id || message.clientRequestId || message.client_request_id || 'hermes-tool-task'),
    tool_name: String(message.toolName || message.tool_name || message.name || message.tool || 'tool'),
    provider: String(message.provider || 'hermes'),
    status,
    input_summary: summarizeToolRunValue(message.toolArgs ?? message.args ?? message.arguments ?? ''),
    output_summary: summarizeToolRunValue(message.toolResult ?? message.result ?? message.content ?? ''),
    error_code: status === 'failed' ? stableToolRunErrorCode(message.error || message.toolResult || message.content) : null,
    error_message: status === 'failed' ? summarizeToolRunValue(message.error || message.toolResult || message.content || '') : null,
    started_at: startedAt,
    completed_at: completedAt,
  }
}

function visibleFrontendEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .filter(event => event && event.visibility !== 'hidden_sensitive')
    .filter(event => event.visibility !== 'audit_only')
}

function frontendEventPriority(event = {}) {
  if (event.event_type === 'approval_required' || event.status === 'waiting_human') return 100
  if (event.status === 'failed' || event.status === 'blocked') return 90
  if (event.status === 'recovering') return 80
  if (event.status === 'running') return 70
  if (event.status === 'completed') return 60
  return 10
}

function pickFrontendProgressEvent(events = []) {
  const visible = visibleFrontendEvents(events)
  if (!visible.length) return null
  return visible
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const priority = frontendEventPriority(b.event) - frontendEventPriority(a.event)
      if (priority !== 0) return priority
      return b.index - a.index
    })[0].event
}

function normalizeFrontendAgentStatus(status = '') {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'agent_heartbeat' || value === 'heartbeat') return 'running'
  if (['created', 'running', 'waiting_human', 'recovering', 'completed', 'failed', 'cancelled', 'blocked'].includes(value)) return value
  if (value === 'ready' || value === 'connected' || value === 'online' || value === 'ok') return 'running'
  if (value === 'error' || value === 'offline' || value === 'disconnected') return 'failed'
  return value || 'running'
}

export function buildFrontendProgressBubbleViewModel(input = {}) {
  const mode = input.mode === 'debug' ? 'debug' : 'normal'
  const events = visibleFrontendEvents(input.task_events || input.taskEvents || [])
  const selected = pickFrontendProgressEvent(events)
  const taskId = selected?.task_id || events.find(event => event?.task_id)?.task_id || input.task_id || input.taskId || ''
  const status = selected?.event_type === 'approval_required'
    ? 'waiting_human'
    : normalizeFrontendAgentStatus(selected?.status || input.status || 'running')
  const summary = sanitizeFrontendObservabilityText(
    selected?.visible_text
      || selected?.message
      || selected?.event_type
      || input.summary
      || 'Task is running.',
  )

  return {
    mode,
    task_id: taskId,
    status,
    severity: selected?.severity || (status === 'waiting_human' ? 'warning' : 'info'),
    summary,
    event_type: selected?.event_type || '',
    actor: selected?.actor || '',
    source: selected?.source || '',
    updated_at: selected?.created_at || '',
    events: events.map(event => ({
      event_id: event.event_id || '',
      event_type: event.event_type || '',
      status: normalizeFrontendAgentStatus(event.status || ''),
      severity: event.severity || 'info',
      visible_text: sanitizeFrontendObservabilityText(event.visible_text || ''),
      created_at: event.created_at || '',
    })),
  }
}

export const buildProgressBubbleViewModel = buildFrontendProgressBubbleViewModel
export const mapTaskEventsToProgressBubbleViewModel = buildFrontendProgressBubbleViewModel

export function buildFrontendDebugRowViewModel(input = {}) {
  const mode = input.mode === 'normal' ? 'normal' : 'debug'
  const toolRuns = Array.isArray(input.tool_runs) ? input.tool_runs : (input.toolRuns || [])
  const rows = toolRuns.map(run => {
    const redacted = redactFrontendObservabilityPayload(run || {})
    return {
      tool_run_id: String(redacted.tool_run_id || ''),
      task_id: String(redacted.task_id || ''),
      tool_name: String(redacted.tool_name || redacted.toolName || ''),
      provider: String(redacted.provider || ''),
      status: normalizeToolRunStatus(redacted.status),
      error_code: redacted.error_code || null,
      error_message: redacted.error_message ? sanitizeFrontendObservabilityText(redacted.error_message) : null,
      input_summary: sanitizeFrontendObservabilityText(redacted.input_summary || ''),
      output_summary: sanitizeFrontendObservabilityText(redacted.output_summary || ''),
      started_at: redacted.started_at || '',
      completed_at: redacted.completed_at || null,
    }
  })

  return {
    mode,
    rows,
  }
}

export const buildDebugRowViewModel = buildFrontendDebugRowViewModel
export const mapToolRunsToDebugRowViewModel = buildFrontendDebugRowViewModel

export function buildFrontendAgentStatusViewModel(input = {}) {
  const mode = input.mode === 'debug' ? 'debug' : 'normal'
  const agentRuns = Array.isArray(input.agent_runs) ? input.agent_runs : (input.agentRuns || [])
  const agents = agentRuns.map(run => {
    const redacted = redactFrontendObservabilityPayload(run || {})
    const status = normalizeFrontendAgentStatus(redacted.status)
    const row = {
      agent_name: String(redacted.agent_name || redacted.agentName || ''),
      status,
      current_step: sanitizeFrontendObservabilityText(redacted.current_step || ''),
      heartbeat_at: redacted.heartbeat_at || null,
      resume_supported: Boolean(redacted.resume_supported),
    }
    if (mode === 'debug') {
      row.agent_run_id = String(redacted.agent_run_id || '')
      row.task_id = String(redacted.task_id || '')
      row.adapter_name = String(redacted.adapter_name || '')
      row.error_code = redacted.error_code || null
      row.error_message = redacted.error_message ? sanitizeFrontendObservabilityText(redacted.error_message) : null
    }
    return row
  })

  return {
    mode,
    agents,
  }
}

export const buildAgentStatusViewModel = buildFrontendAgentStatusViewModel
export const mapAgentRunsToAgentStatusViewModel = buildFrontendAgentStatusViewModel

function withoutRawPayload(value) {
  if (Array.isArray(value)) return value.map(item => withoutRawPayload(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'raw_payload' && key !== 'rawPayload')
      .map(([key, item]) => [key, withoutRawPayload(item)]))
  }
  return value
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

export function buildRuntimeObservabilityBridge(input = {}) {
  const agentStatuses = safeArray(input.agent_statuses || input.agentStatuses)
  const heartbeats = safeArray(input.heartbeats || input.task_heartbeats || input.taskHeartbeats)
  const taskMessages = safeArray(input.task_messages || input.taskMessages)
  const liveTools = safeArray(input.live_tools || input.liveTools)
  const toolMessages = safeArray(input.tool_messages || input.toolMessages)

  const agentRuns = [
    ...agentStatuses.map(status => mapAgentGatewayStatusToAgentRun(status)),
  ]
  const taskEvents = []

  for (const heartbeat of heartbeats) {
    const mapped = mapTaskBoundAgentHeartbeat(heartbeat)
    if (mapped.agent_run) agentRuns.push(mapped.agent_run)
    taskEvents.push(...safeArray(mapped.task_events))
  }

  for (const message of taskMessages) {
    taskEvents.push(...mapCollaborationTaskMessageToTaskEvents(message))
  }

  const toolRuns = [
    ...liveTools.map(tool => mapHermesLiveToolToToolRun(tool)),
    ...toolMessages.map(message => mapHermesToolMessageToToolRun(message)),
  ]

  return {
    source: 'hermes.runtime_observability_bridge',
    agent_runs: redactFrontendObservabilityPayload(withoutRawPayload(agentRuns)),
    task_events: redactFrontendObservabilityPayload(withoutRawPayload(taskEvents)),
    tool_runs: redactFrontendObservabilityPayload(withoutRawPayload(toolRuns)),
  }
}

function safeGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}
function safeRemove(key) {
  try { localStorage.removeItem(key) } catch {}
}

function withHermesReplyStyleInstruction(instructions) {
  const identityPrompt = buildAgentIdentitySystemPrompt('hermes')
  const base = typeof instructions === 'string' ? instructions.trim() : ''
  const parts = []
  if (identityPrompt && !base.includes(identityPrompt)) parts.push(identityPrompt)
  if (base) parts.push(base)
  if (!base.includes(HERMES_REPLY_STYLE_INSTRUCTION)) parts.push(HERMES_REPLY_STYLE_INSTRUCTION)
  return parts.join('\n\n')
}

function buildHermesCurrentTurnBoundaryInstruction(currentInput = '', history = []) {
  const current = String(currentInput || '').trim()
  const historyCount = Array.isArray(history) ? history.length : 0
  const lines = [
    'Current-turn boundary:',
    '- Treat conversationHistory only as background memory and continuity context.',
    '- Answer the latest user input only; do not re-answer old user messages from conversationHistory unless the latest input explicitly asks you to review prior messages.',
    '- If prior user messages appear in history, assume they were already handled when paired with assistant history.',
    '- Do not say you received many questions just because history contains multiple older user messages.',
  ]
  if (historyCount) lines.push(`- conversationHistory items supplied: ${historyCount}. They are not new tasks.`)
  if (current) lines.push(`- Latest user input: ${current.slice(0, 500)}`)
  if (isHermesLongTaskRequest(current)) {
    lines.push(
      '- Execution contract: this is an actionable task. Do not finalize with a plan, intent, or "I will check/do it" statement.',
      '- Invoke the available tool now when a tool is needed; then return the observed result, artifact, or concrete blocker.',
      '- A task is complete only after an execution result is available. If execution is unavailable, say exactly which tool, permission, or dependency blocked it; do not imply that work will continue in the background.',
    )
  }
  if (/(?:天气|气温|降雨|下雨|weather|forecast|temperature)/i.test(current)) {
    lines.push(
      '- Weather lookup rule: use at most one read-only public weather fetch and answer from that result.',
      '- Do not run Python, python3, Node.js, PowerShell, shell scripts, or a second terminal parsing command for weather data.',
      '- If the first fetch already returned JSON or text, parse it directly in the model response. Do not request interactive command approval.',
    )
  }
  if (/(?:\u4eca\u65e5\u5934\u6761|\u5934\u6761|\u70ed\u699c|\u70ed\u641c|\u65b0\u95fb.*(?:\u524d|\u6392\u884c)|(?:toutiao|headline|news).*(?:top|ranking))/i.test(current)) {
    lines.push(
      '- News/ranking lookup rule: use one read-only public fetch, with at most one fallback source only when the first source is unavailable.',
      '- If a fetch already returned JSON, HTML, or text, extract the requested top items directly in the model response.',
      '- Do not call execute_code, Python, python3, Node.js, PowerShell, shell scripts, or create a parsing file merely to process fetched news/ranking data.',
      '- Do not request interactive command approval for a read-only news/ranking lookup. State the source and any freshness limitation in the final answer.',
    )
  }
  return lines.join('\n')
}

function isHermesCurrentChatMediaReturnRequest(text = '') {
  const value = String(text || '').trim()
  if (!value) return false
  return /(?:\u76f4\u63a5|\u4f5c\u4e3a|\u8fd4\u56de|\u53d1\u9001|\u56de\u4f20|\u663e\u793a).{0,28}(?:\u5f53\u524d)?(?:\u804a\u5929|\u5bf9\u8bdd|\u6c14\u6ce1|\u7a97\u53e3).{0,28}(?:\u56fe\u7247|\u622a\u56fe|\u622a\u5c4f|png|jpe?g|webp|gif)|(?:\u751f\u6210|\u521b\u5efa|\u7ed8\u5236|\u622a\u53d6).{0,48}(?:\u56fe\u7247|\u622a\u56fe|\u622a\u5c4f|png|jpe?g|webp|gif).{0,48}(?:\u5f53\u524d)?(?:\u804a\u5929|\u5bf9\u8bdd|\u8fd4\u56de|\u53d1\u9001|\u56de\u4f20|\u663e\u793a)|\b(?:generate|create|return|send|show).{0,64}(?:image|screenshot|png|jpe?g|webp|gif).{0,64}(?:chat|conversation|bubble|return|send|show)\b/i.test(value)
}

function isHermesEphemeralMediaSession(sessionOrId = '') {
  const session = sessionOrId && typeof sessionOrId === 'object' ? sessionOrId : {}
  const id = String(typeof sessionOrId === 'string' ? sessionOrId : (session.id || session.session_id || '')).trim()
  const visibleText = [session.title, session.preview, session.content]
    .map(value => String(value || ''))
    .join('\n')
  // These prefixes were only used by the prior media bridge probes. Keep the
  // detector deliberately narrow: normal user sessions must never disappear
  // merely because they happen to mention an image.
  if (id.includes('--chat-media--') || /^(?:media-protocol|raw-media|media-e2e)-/i.test(id)) return true
  return /\bsuperclaw_return_media\b|C:\\tmp\\hello_sandbox\.png|HELLO FROM SANDBOX/i.test(visibleText)
}

function loadJson(key) {
  try {
    const raw = safeGet(key)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      backupCorruptJson(key, raw)
      return null
    }
  } catch { return null }
}
function saveJson(key, value) {
  try { safeSet(key, JSON.stringify(value)) } catch {}
}

function backupCorruptJson(key, raw) {
  if (!key || !raw) return
  const backupKey = `${key}.corrupt.${Date.now()}`
  safeSet(backupKey, String(raw).slice(0, 500000))
}

function profileKey(profile) {
  return encodeURIComponent(profile || 'default')
}

function parseEpochMs(value) {
  if (typeof value === 'number') {
    // Seconds vs milliseconds heuristic.
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

function normalizeHermesMessageContent(content) {
  if (typeof content === 'string') return { text: content, attachments: [], screenshotCards: [], confirmations: [] }
  if (!Array.isArray(content)) {
    try { return { text: JSON.stringify(content || ''), attachments: [], screenshotCards: [], confirmations: [] } }
    catch { return { text: String(content || ''), attachments: [], screenshotCards: [], confirmations: [] } }
  }

  const texts = []
  const attachments = []
  const screenshotCards = []
  const confirmations = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const type = String(part.type || '').toLowerCase()
    if ((type === 'text' || type === 'input_text' || !type) && typeof part.text === 'string') {
      texts.push(part.text)
      continue
    }
    if (type === 'screenshot_card') {
      const card = part.card || part
      if (card?.imageUrl) screenshotCards.push(card)
      continue
    }
    if (type === 'user_confirmation') {
      confirmations.push(part.confirmation || part)
      continue
    }

    const imageUrl = part.image_url?.url || part.imageUrl || part.previewUrl || part.url || part.source?.url || ''
    const imageData = part.data || part.source?.data || ''
    const mediaPath = part.mediaPath || part.savedPath || part.localPath || part.filePath || part.path || ''
    if (type === 'image_url' || type === 'input_image' || type === 'image') {
      const mimeType = part.mimeType || part.media_type || part.source?.media_type || 'image/png'
      if (imageUrl || imageData || mediaPath) {
        attachments.push({
          category: 'image',
          type: 'image',
          mimeType,
          imageUrl,
          previewUrl: part.previewUrl || '',
          url: imageUrl,
          content: imageData,
          fileName: part.fileName || part.name || 'image',
          mediaPath: part.mediaPath || '',
          savedPath: part.savedPath || '',
          localPath: part.localPath || '',
          filePath: part.filePath || '',
          path: part.path || '',
        })
      }
    }
  }
  return { text: texts.join('\n'), attachments, screenshotCards, confirmations }
}

// ---------- message mapping ----------

/**
 * Convert Hermes CLI-exported messages (mixed roles + tool_calls) into the
 * flat display list we render. Matches `hermes-web-ui`'s `mapHermesMessages`.
 */
function mapHermesMessages(msgs) {
  if (!Array.isArray(msgs)) return []

  const toolNameMap = new Map()
  const toolArgsMap = new Map()
  for (const m of msgs) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc.id) {
          if (tc.function?.name) toolNameMap.set(tc.id, tc.function.name)
          if (tc.function?.arguments) toolArgsMap.set(tc.id, tc.function.arguments)
        }
      }
    }
  }

  const out = []
  for (const m of msgs) {
    const ts = parseEpochMs(m.timestamp || m.created_at)

    // Assistant message whose only payload is tool_calls — emit placeholder
    // tool messages, the actual tool responses will fill them in.
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length && !(m.content || '').trim()) {
      for (const tc of m.tool_calls) {
        out.push({
          id: String(m.id) + '_' + tc.id,
          role: 'tool',
          content: '',
          timestamp: ts,
          toolName: tc.function?.name || 'tool',
          toolArgs: tc.function?.arguments || undefined,
          toolStatus: 'done',
        })
      }
      continue
    }

    if (m.role === 'tool') {
      const tcId = m.tool_call_id || ''
      const toolName = m.tool_name || toolNameMap.get(tcId) || 'tool'
      const toolArgs = toolArgsMap.get(tcId) || undefined
      let preview = ''
      if (m.content) {
        try {
          const parsed = JSON.parse(m.content)
          preview = parsed.url || parsed.title || parsed.preview || parsed.summary || ''
        } catch {
          preview = String(m.content).slice(0, 80)
        }
      }
      const phIdx = out.findIndex(x => x.role === 'tool' && x.toolName === toolName && !x.toolResult && x.id.includes('_' + tcId))
      if (phIdx !== -1) out.splice(phIdx, 1)
      out.push({
        id: String(m.id),
        role: 'tool',
        content: '',
        timestamp: ts,
        toolName,
        toolArgs,
        toolPreview: typeof preview === 'string' ? (preview.slice(0, 100) || undefined) : undefined,
        toolResult: m.content || undefined,
        toolStatus: 'done',
      })
      continue
    }

    const normalized = normalizeHermesMessageContent(m.content)
    const content = normalized.text
    if (m.role === 'assistant' && !content.trim() && !normalized.attachments.length && !normalized.screenshotCards.length && !normalized.confirmations.length) continue

    // Plain user/assistant/system message.
    out.push({
      id: String(m.id || uid()),
      role: m.role || 'assistant',
      content,
      timestamp: ts,
      clientRequestId: m.clientRequestId || m.client_request_id || '',
      attachments: normalized.attachments,
      screenshotCards: normalized.screenshotCards,
      confirmations: normalized.confirmations,
    })
  }
  return collapseConsecutiveAssistantMessages(out)
}

function joinAssistantChunks(left, right) {
  const a = String(left || '')
  const b = String(right || '')
  if (!a.trim()) return b
  if (!b.trim()) return a
  if (b.startsWith(a)) return b
  if (a.endsWith(b)) return a
  const needsSpace = !/\s$/.test(a) && !/^\s|^[，。！？、；：,.!?;:)]/.test(b)
  return a + (needsSpace ? ' ' : '') + b
}

function collapseConsecutiveAssistantMessages(messages) {
  const out = []
  for (const msg of Array.isArray(messages) ? messages : []) {
    const prev = out[out.length - 1]
    if (msg?.role === 'assistant' && prev?.role === 'assistant') {
      const prevRequestId = String(prev.clientRequestId || prev.client_request_id || '')
      const nextRequestId = String(msg.clientRequestId || msg.client_request_id || '')
      if (prevRequestId || nextRequestId) {
        if (prevRequestId !== nextRequestId) {
          out.push(msg)
          continue
        }
      }
      prev.content = joinAssistantChunks(prev.content, msg.content)
      if (msg.attachments?.length) {
        prev.attachments = [...(prev.attachments || []), ...msg.attachments]
      }
      if (msg.screenshotCards?.length) {
        prev.screenshotCards = [...(prev.screenshotCards || []), ...msg.screenshotCards]
      }
      if (msg.confirmations?.length) {
        prev.confirmations = [...(prev.confirmations || []), ...msg.confirmations]
      }
      prev.timestamp = Math.max(Number(prev.timestamp || 0), Number(msg.timestamp || 0)) || prev.timestamp
      continue
    }
    out.push(msg)
  }
  return out
}

function lastTurnAssistantText(messages) {
  const list = Array.isArray(messages) ? messages : []
  let start = -1
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.role === 'user') { start = i; break }
  }
  let text = ''
  for (let i = start + 1; i < list.length; i += 1) {
    if (list[i]?.role !== 'assistant') continue
    text = joinAssistantChunks(text, list[i].content || '')
  }
  return text
}

function lastAssistantMessage(messages) {
  const list = Array.isArray(messages) ? messages : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.role === 'assistant') return list[i]
  }
  return null
}

function hasHermesLocalRunTail(session) {
  const message = lastAssistantMessage(session?.messages)
  return !!(
    message
    && message.role === 'assistant'
    && hermesMessageRequestId(message)
    && !message.isStreaming
    && String(message.content || '').trim()
  )
}

function hasHermesLocalTranscript(session) {
  return Array.isArray(session?.messages) && session.messages.some(message => (
    message
    && (message.role === 'user' || message.role === 'assistant')
    && String(message.content || '').trim()
  ))
}

function shouldPreferFinalOutput(current, finalOutput) {
  const cur = String(current || '').trim()
  const fin = String(finalOutput || '').trim()
  if (!fin) return false
  if (!cur) return true
  if (fin.startsWith(cur)) return true
  return false
}

function normalizeHermesLeakComparableText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hermesMessageRequestId(message = {}) {
  return String(message?.clientRequestId || message?.client_request_id || '').trim()
}

function isHermesBackendOrphanAssistant(message = {}) {
  const content = String(message.content || '')
  const isKnownReplayContamination = /print\(["']hello["']\)/i.test(content)
    && /模型或接口权限不可用|model.*permission|api.*permission|Invalid token|401|403/i.test(content)
  return !!(
    message
    && message.role === 'assistant'
    && !hermesMessageRequestId(message)
    && !Number(message.timestamp || 0)
    && isKnownReplayContamination
  )
}

function hermesPriorAssistantLeakFragments(session, clientRequestId = '') {
  const requestId = String(clientRequestId || '').trim()
  const fragments = []
  for (const message of Array.isArray(session?.messages) ? session.messages : []) {
    if (!message || message.role !== 'assistant') continue
    if (requestId && hermesMessageRequestId(message) === requestId) continue
    const text = normalizeHermesLeakComparableText(message.content || '')
    if (text.length < 80) continue
    fragments.push(text.slice(0, 220))
    if (text.length > 440) fragments.push(text.slice(Math.max(0, text.length - 220)))
  }
  return fragments
}

function containsHermesPriorAssistantLeak(session, text = '', clientRequestId = '') {
  const haystack = normalizeHermesLeakComparableText(text)
  if (haystack.length < 80) return false
  return hermesPriorAssistantLeakFragments(session, clientRequestId)
    .some(fragment => fragment.length >= 80 && haystack.includes(fragment))
}

function trimHermesFinalAtPriorAssistantLeak(session, text = '', clientRequestId = '') {
  let result = String(text || '')
  const requestId = String(clientRequestId || '').trim()
  for (const message of Array.isArray(session?.messages) ? session.messages : []) {
    if (!message || message.role !== 'assistant') continue
    if (requestId && hermesMessageRequestId(message) === requestId) continue
    const raw = String(message.content || '')
    const candidates = raw
      .split(/\n{2,}|(?<=。)|(?<=！)|(?<=？)/)
      .map(part => part.trim())
      .filter(part => part.length >= 60)
    for (const candidate of candidates) {
      const index = result.indexOf(candidate)
      if (index > 0) {
        result = result.slice(0, index).trim()
        break
      }
    }
  }
  return result
}

function chooseHermesFinalOutput({ session, current = '', finalOutput = '', clientRequestId = '', prompt = '', executionTrace = [] } = {}) {
  const cur = String(current || '')
  const fin = stripHermesVisibleExecutionNarration(finalOutput, executionTrace)
  if (!fin.trim()) return cur
  if (getHermesExactShortReplyTarget(prompt)) return normalizeHermesExactShortReply(prompt, fin)

  const trimmedFinal = trimHermesFinalAtPriorAssistantLeak(session, fin, clientRequestId)
  if (trimmedFinal.trim() && trimmedFinal.trim() !== fin.trim()) {
    if (!cur.trim() || trimmedFinal.startsWith(cur) || cur.startsWith(trimmedFinal)) return trimmedFinal
    return cur
  }

  if (containsHermesPriorAssistantLeak(session, fin, clientRequestId)) return cur || ''
  if (!cur.trim()) return fin
  if (fin.startsWith(cur)) return fin
  if (cur.startsWith(fin)) return cur
  return cur
}

function normalizeJoinedSourceSessionFields(raw = {}) {
  const session = raw || {}
  const out = { ...session }
  const id = String(out.id || out.session_id || '').trim()
  const source = String(out.source || '').trim()
  const sourceIdMatch = /^(api_server|local|cron|web|desktop|cli)\s+(.+)$/i
  const sourceMatch = source.match(sourceIdMatch)
  const idMatch = id.match(sourceIdMatch)

  if (sourceMatch && (!id || id === source || idMatch)) {
    out.source = sourceMatch[1]
    out.id = sourceMatch[2].trim()
  } else if (idMatch) {
    out.source = out.source || idMatch[1]
    out.id = idMatch[2].trim()
  }
  return out
}

function titleFromSummaryFields(s) {
  const title = String(s.title || '').trim()
  const preview = String(s.preview || '').trim()
  if (title && !isPlaceholderSessionTitle(title)) return title
  if (preview && !isPlaceholderSessionTitle(preview)) return preview
  return title
}

/** Convert a backend session summary into the store's canonical shape. */
function mapSessionSummary(raw) {
  const s = normalizeJoinedSourceSessionFields(raw)
  const localCached = s || {}
  return {
    id: s.id || s.session_id || '',
    title: titleFromSummaryFields(s),
    source: s.source || '',
    model: s.model || '',
    messageCount: s.message_count || 0,
    createdAt: parseEpochMs(s.created_at || s.started_at),
    updatedAt: parseEpochMs(s.updated_at || s.last_active || s.ended_at || s.created_at || s.started_at),
    preview: s.preview || '',
    endedAt: s.ended_at != null ? parseEpochMs(s.ended_at) : null,
    lastActiveAt: s.last_active != null ? parseEpochMs(s.last_active) : undefined,
    // Usage analytics — surfaced from `hermes sessions export` JSONL
    // (Rust command at hermes.rs::hermes_sessions_list). Match the Hermes
    // CLI naming so other consumers (Usage page) can reuse the same fields.
    inputTokens: Number(s.input_tokens || 0),
    outputTokens: Number(s.output_tokens || 0),
    cacheReadTokens: Number(s.cache_read_tokens || 0),
    cacheWriteTokens: Number(s.cache_write_tokens || 0),
    estimatedCostUsd: typeof s.estimated_cost_usd === 'number' ? s.estimated_cost_usd : null,
    workFileName: localCached.workFileName || '',
    workFilePath: localCached.workFilePath || '',
    workFileDir: localCached.workFileDir || '',
    workFileDisplayPath: localCached.workFileDisplayPath || '',
    messages: [],
  }
}

function compactSessionText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function isPlaceholderSessionTitle(title) {
  const value = String(title || '').trim().toLowerCase()
  if (!value) return true
  return value === 'new chat'
    || value === 'untitled'
    || value === '\u65b0\u4f1a\u8bdd'
    || value === '\u65b0\u5bf9\u8bdd'
}

function deriveSessionTitleFromText(text) {
  const raw = String(text || '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  return raw.slice(0, 40) + (raw.length > 40 ? '...' : '')
}

function firstUserText(session) {
  const msg = (session?.messages || []).find(m => m?.role === 'user' && String(m.content || '').trim())
  return compactSessionText(msg?.content)
}

function sessionLooksLikeBackendMatch(local, fresh, activeId, runningId) {
  if (!local || !fresh || local.id === fresh.id || local.source !== '__local__') return false
  const first = firstUserText(local)
  if (!first) return false
  const title = compactSessionText(fresh.title)
  const updated = Number(fresh.updatedAt || fresh.createdAt || 0)
  const localStarted = Number(local.createdAt || local.updatedAt || 0)
  const closeInTime = updated && localStarted && Math.abs(updated - localStarted) < 10 * 60 * 1000
  const titleMatches = title && (first.startsWith(title) || title.startsWith(first.slice(0, Math.min(24, first.length))))
  const activeMatch = local.id === activeId || local.id === runningId
  return !!titleMatches && (closeInTime || activeMatch)
}

function mergeLocalSessionIntoBackend(local, backend) {
  const backendIds = new Set((backend.messages || []).map(m => m.id).filter(Boolean))
  const moved = (local.messages || []).filter(m => !m.id || !backendIds.has(m.id))
  if (moved.length) backend.messages = [...moved, ...(backend.messages || [])]
  if (isPlaceholderSessionTitle(backend.title) && !isPlaceholderSessionTitle(local.title)) backend.title = local.title
  backend.workFileName = backend.workFileName || local.workFileName
  backend.workFilePath = backend.workFilePath || local.workFilePath
  backend.workFileDir = backend.workFileDir || local.workFileDir
  backend.workFileDisplayPath = backend.workFileDisplayPath || local.workFileDisplayPath
  backend.updatedAt = Math.max(backend.updatedAt || 0, local.updatedAt || 0, Date.now())
  backend.lastActiveAt = Math.max(backend.lastActiveAt || 0, local.lastActiveAt || 0, Date.now())
  backend.clientRequestId = backend.clientRequestId || local.clientRequestId || ''
  backend.optimistic = false
  backend.pendingBackendIndexUntil = 0
}

function messageMergeKey(message) {
  if (!message) return ''
  if (message.id && !String(message.id).startsWith('local_')) return `id:${message.id}`
  const role = message.role || ''
  const content = String(message.content || message.toolResult || message.toolPreview || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
  return `${role}:${content}`
}

function mergeHermesMessages(localMessages = [], serverMessages = []) {
  const merged = Array.isArray(localMessages) ? localMessages.slice() : []
  const localIsManaged = merged.some(m => hermesMessageRequestId(m))
  const seen = new Set(merged.map(messageMergeKey).filter(Boolean))
  const seenText = new Set(
    merged
      .map(m => `${m?.role || ''}:${String(m?.content || '').replace(/\s+/g, ' ').trim().slice(0, 240)}`)
      .filter(key => key !== ':'),
  )

  for (const msg of Array.isArray(serverMessages) ? serverMessages : []) {
    if (localIsManaged && isHermesBackendOrphanAssistant(msg)) continue
    const key = messageMergeKey(msg)
    const textKey = `${msg?.role || ''}:${String(msg?.content || '').replace(/\s+/g, ' ').trim().slice(0, 240)}`
    if ((key && seen.has(key)) || (textKey !== ':' && seenText.has(textKey))) continue
    merged.push(msg)
    if (key) seen.add(key)
    if (textKey !== ':') seenText.add(textKey)
  }
  return collapseConsecutiveAssistantMessages(merged)
}

// ---------- Tauri event bridge ----------
//
// Streaming relies on Tauri's `hermes-run-*` events. In Web mode (远程浏览器
// 访问 SuperClaw）these events don't exist — and importing
// `@tauri-apps/api/event` itself touches `window.__TAURI_INTERNALS__.transformCallback`
// which crashes with "Cannot read properties of undefined (reading 'transformCallback')".
//
// To stay safe we short-circuit to a no-op unsubscriber when not running inside
// Tauri. Web/dev receives the same run events through hermesAgentRunStream;
// only the native Tauri event subscription is intentionally skipped there.

let _listenFn = null
async function tauriListen(event, cb) {
  if (!isTauriRuntime()) return () => {}
  if (!_listenFn) {
    const mod = await import('@tauri-apps/api/event')
    _listenFn = mod.listen
  }
  return _listenFn(event, cb)
}

// ---------- store implementation ----------

function createStore() {
  // --- state ---
  const state = {
    sessions: [],
    activeSessionId: null,
    loading: false,
    loadingMessages: false,
    streaming: false,
    runningSessionId: null,
    runningClientRequestId: null,
    pendingAssistantId: null,  // id of the currently streaming assistant message
    error: null,
    taskStatus: { status: 'idle', lastStep: '', summary: '', error: '', updatedAt: 0 },
    // Native Hermes pauses a run for high-impact commands. Keep that request
    // separate from chat text so approving it never creates a fake user turn.
    pendingApproval: null,
    profiles: [],
    activeProfile: safeGet(STORAGE_PROFILE) || 'default',
    loadingProfiles: false,

    // Live tool calls for the current run (shown in the streaming indicator).
    liveTools: [],             // [{ id, name, status, preview, args, result }]

    // UI prefs (persisted).
    pinned: new Set(loadJson(STORAGE_PINNED_PREFIX + profileKey(safeGet(STORAGE_PROFILE) || 'default')) || []),
    collapsed: new Set(loadJson(STORAGE_COLLAPSED_PREFIX + profileKey(safeGet(STORAGE_PROFILE) || 'default')) || []),
  }

  const inFlightSendByRequestId = new Map()
  const userMessageByRequestId = new Map()
  const assistantMessageByRequestId = new Map()
  const visibleUserPromptByRequestId = new Map()

  // --- subscription ---
  //
  // Uses rAF-batched notify so a burst of mutations (e.g. streaming delta +
  // tool events) produces a single redraw per frame instead of one per event.
  // This avoids the visual stutter + scroll jitter seen in Phase 4.
  const listeners = new Set()
  let scheduled = false
  function subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }
  function flushNotify() {
    scheduled = false
    for (const fn of listeners) {
      try { fn(state) } catch (e) { console.error('chatStore listener error:', e) }
    }
  }
  function notify() {
    if (scheduled) return
    scheduled = true
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flushNotify)
    } else {
      setTimeout(flushNotify, 0)
    }
  }

  function previewToolValue(value, maxLen = 180) {
    if (value == null) return ''
    let text = ''
    if (typeof value === 'string') text = value
    else {
      try { text = JSON.stringify(value) } catch { text = String(value) }
    }
    text = text.replace(/\s+/g, ' ').trim()
    return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
  }

  function summarizeToolOnlyReply(tools = []) {
    const guarded = formatToolResultsForUser({
      userText: currentVisibleUserPrompt(),
      toolEvents: dedupeToolEvents(tools),
    })
    if (guarded.trim()) return guarded

    const list = Array.isArray(tools) ? tools.filter(Boolean) : []
    if (!list.length) return ''
    const last = list[list.length - 1] || {}
    const name = last.name || last.toolName || last.id || '工具'
    const failed = last.status === 'error' || !!last.error
    const output = previewToolValue(last.result ?? last.output ?? last.content ?? last.error)
    if (failed) {
      return [
        `我根据刚才的上下文去执行了 ${name}，但工具返回了错误。`,
        output ? `错误信息：${output}` : '当前没有拿到可展开的错误详情。',
        '我会基于这个结果继续排查原因；如果你给的是要操作桌面或网页的指令，下一步应先确认对应工具权限和目标窗口是否可用。',
      ].join('\n')
    }
    return [
      `我根据刚才的上下文执行了 ${name}，已经执行完成。`,
      output ? `我读到的结果是：${output}` : '这次工具没有返回可展开的正文结果，我会继续按当前问题补充判断，而不是停在“我看看”。',
      '如果这是排查任务，我会继续给出原因、影响和下一步处理；如果是执行任务，我会继续完成后汇报结果。',
    ].join('\n')
  }

  function currentVisibleUserPrompt() {
    const requestId = state.runningClientRequestId
    return requestId ? (visibleUserPromptByRequestId.get(requestId) || '') : ''
  }

  function taskSession() {
    return state.sessions.find(x => x.id === state.runningSessionId)
      || activeSession()
      || null
  }

  function rememberHermesTaskStatus(session, patch = {}) {
    if (!session) return null
    const next = {
      ...(session.hermesTaskStatus || {}),
      ...patch,
      updatedAt: Date.now(),
    }
    session.hermesTaskStatus = next
    state.taskStatus = next
    return next
  }

  function currentHermesTaskStatus() {
    const s = activeSession()
    if (state.streaming) {
      const last = [...(state.liveTools || [])].reverse().find(Boolean)
      return {
        status: 'running',
        lastStep: last?.preview || last?.name || '正在处理当前任务',
        summary: '',
        error: '',
      }
    }
    return s?.hermesTaskStatus || state.taskStatus || null
  }

  function recordHermesToolProgress(evtType, toolName, preview, evt = {}) {
    const s = taskSession()
    if (!s) return
    const name = toolName || 'tool'
    if (evtType === 'tool.started') {
      rememberHermesTaskStatus(s, {
        status: 'running',
        lastStep: `${name}${preview ? `：${preview}` : ' 正在执行'}`,
        error: '',
      })
      return
    }
    if (evtType === 'tool.completed') {
      const failed = Boolean(evt.error)
      rememberHermesTaskStatus(s, {
        status: failed ? 'failed' : 'running',
        lastStep: failed ? `${name} 执行失败` : `${name} 已完成，正在整理结果`,
        summary: failed ? '' : (preview || `${name} 已完成`),
        error: failed ? (typeof evt.error === 'string' ? evt.error : stringifyMaybe(evt.error)) : '',
      })
      return
    }
    if (evtType === 'tool.error') {
      rememberHermesTaskStatus(s, {
        status: 'failed',
        lastStep: `${name} 执行失败`,
        error: stringifyMaybe(evt.error || preview || '工具执行失败'),
      })
      return
    }
    if (evtType === 'tool.progress' && preview) {
      rememberHermesTaskStatus(s, {
        status: 'running',
        lastStep: `${name}：${preview}`,
      })
    }
  }

  function buildHermesTaskStatusReply(userText = '') {
    const s = activeSession()
    return sanitizeHermesVisibleReply(getHermesTaskStatusSummary({
      activeTask: currentHermesTaskStatus(),
      toolEvents: state.liveTools.length ? state.liveTools : (s?.toolEvents || []),
      failedTasks: s?.failedTasks || [],
    }), userText)
  }

  function finalizeHermesRequestState({
    status = 'success',
    reason = '',
    clientRequestId = null,
    error = null,
    summary = '',
  } = {}) {
    if (clientRequestId && state.runningClientRequestId && clientRequestId !== state.runningClientRequestId) {
      return null
    }
    const s = taskSession()
    if (s) {
      rememberHermesTaskStatus(s, {
        status,
        reason,
        summary,
        error: error ? mapHermesErrorToUserMessage(error) : '',
      })
    }
    cleanupAfterRun({ status, reason, error, summary })
    return { status, reason, error }
  }

  function createHermesRunTimeoutError(timeoutMs = HERMES_RUN_TIMEOUT_MS) {
    const seconds = Math.max(1, Math.round(Number(timeoutMs || HERMES_RUN_TIMEOUT_MS) / 1000))
    const error = new Error(`Hermes run timeout after ${seconds}s`)
    error.code = 'HERMES_RUN_TIMEOUT'
    error.timeout_ms = timeoutMs
    return error
  }

  function clearHermesRunTimeoutGuard() {
    if (hermesRunTimeoutTimer) {
      clearTimeout(hermesRunTimeoutTimer)
      hermesRunTimeoutTimer = null
    }
  }

  function startHermesRunTimeoutGuard({ clientRequestId, sessionId, timeoutMs = HERMES_RUN_TIMEOUT_MS } = {}) {
    clearHermesRunTimeoutGuard()
    hermesRunTimeoutTimer = setTimeout(() => {
      void handleHermesRunTimeout({ clientRequestId, sessionId, timeoutMs })
    }, timeoutMs)
  }

  function touchHermesRunWatchdog({ clientRequestId = state.runningClientRequestId, sessionId = state.runningSessionId } = {}) {
    if (!state.streaming || !clientRequestId) return
    hermesRunRecoveryAttempts = 0
    startHermesRunTimeoutGuard({ clientRequestId, sessionId })
  }

  async function handleHermesRunTimeout({ clientRequestId, sessionId, timeoutMs = HERMES_RUN_TIMEOUT_MS } = {}) {
    if (clientRequestId && state.runningClientRequestId && state.runningClientRequestId !== clientRequestId) return false
    if (!state.streaming && !state.runningClientRequestId) return false
    if (hermesRunRecoveryInFlight) return false
    hermesRunRecoveryInFlight = true
    const s = state.sessions.find(item => item.id === (sessionId || state.runningSessionId)) || taskSession() || activeSession()
    if (s) {
      rememberHermesTaskStatus(s, {
        status: 'recovering',
        lastStep: '暂时没有新输出，正在检查任务状态并继续等待',
        summary: `已等待 ${Math.max(1, Math.round(timeoutMs / 1000))} 秒，未主动终止任务。`,
      })
      recordAssistantExecutionEvent(s, clientRequestId || state.runningClientRequestId, 'run.progress', {
        message: '暂时没有新输出，正在检查 Gateway、工具执行和授权状态。',
      })
      notify()
    }
    const runId = String(activeHermesRunId || activeResponseAssembler?.runId || '').trim()
    try {
      await api.hermesHealthCheck().catch(() => null)
      if (!runId) {
        hermesRunRecoveryAttempts += 1
        startHermesRunTimeoutGuard({ clientRequestId, sessionId, timeoutMs: HERMES_RUN_RECOVERY_DELAY_MS })
        return true
      }
      const snapshot = await api.hermesApiProxy('GET', `/v1/runs/${encodeURIComponent(runId)}`)
      if (state.runningClientRequestId !== clientRequestId) return false
      const status = String(snapshot?.status || '').toLowerCase()
      if (status === 'completed') {
        completeStreamRun(sessionId || state.runningSessionId, String(snapshot?.output || ''), clientRequestId)
        return true
      }
      if (status === 'failed' || status === 'cancelled') {
        failStreamRun(sessionId || state.runningSessionId, snapshot?.error || `Hermes run ${status}`, clientRequestId)
        return true
      }
      if (status === 'waiting_for_approval') {
        setPendingHermesApproval({
          run_id: runId,
          description: '任务正在等待你的授权。选择授权范围后会从当前步骤继续。',
          choices: ['once', 'session', 'always', 'deny'],
        })
        return true
      }
      hermesRunRecoveryAttempts += 1
      if (s) {
        rememberHermesTaskStatus(s, {
          status: 'running',
          lastStep: hermesRunRecoveryAttempts > 1 ? '任务仍在后台执行，继续等待新进展' : '任务仍在执行，已恢复等待',
        })
      }
      startHermesRunTimeoutGuard({ clientRequestId, sessionId, timeoutMs: HERMES_RUN_TIMEOUT_MS })
      return true
    } catch {
      hermesRunRecoveryAttempts += 1
      if (s) {
        rememberHermesTaskStatus(s, {
          status: 'recovering',
          lastStep: '暂时无法读取任务状态，正在保留现场并重试',
          error: '',
        })
      }
      startHermesRunTimeoutGuard({ clientRequestId, sessionId, timeoutMs: HERMES_RUN_RECOVERY_DELAY_MS })
      return true
    } finally {
      hermesRunRecoveryInFlight = false
    }
  }

  function sanitizeHermesVisibleReply(text, prompt = currentVisibleUserPrompt(), options = {}) {
    if (options.streaming === true) {
      const streamText = normalizeHermesStreamText(text)
      return preserveHermesMediaProtocol(streamText, (mediaFreeText) => {
        const visibleStream = sanitizeVisibleReplyForChinese(mediaFreeText, prompt, { agent: 'hermes' })
        const guardedStream = guardAgentIdentityReply({
          agentName: 'hermes',
          userText: prompt,
          assistantText: visibleStream,
        })
        return stripHermesGenericRetryFallback(redactHermesSensitiveVisibleText(guardedStream))
      })
    }
    return preserveHermesMediaProtocol(text, (mediaFreeText) => {
      const visible = sanitizeVisibleReplyForChinese(mediaFreeText, prompt, { agent: 'hermes' })
      const normalized = normalizeHermesVisibleReplyText(visible, {
        prompt,
        userText: prompt,
        toolEvents: state.liveTools,
      })
      const guarded = guardAgentIdentityReply({
        agentName: 'hermes',
        userText: prompt,
        assistantText: normalized,
      })
      const redacted = stripHermesGenericRetryFallback(redactHermesSensitiveVisibleText(guarded))
      return completeHermesReplyIfNeeded(redacted, {
        userText: prompt,
        toolEvents: state.liveTools,
      })
    })
  }

  /** Force an immediate, unbatched notification (used by deterministic tests). */
  function notifySync() {
    scheduled = false
    flushNotify()
  }

  function shouldKeepPendingSession(session, freshIds) {
    if (!session || freshIds.has(session.id)) return false
    if (!session.clientRequestId) return false
    if (!Array.isArray(session.messages) || !session.messages.length) return false
    const holdUntil = Number(session.pendingBackendIndexUntil || 0)
    return state.streaming
      || state.runningSessionId === session.id
      || state.activeSessionId === session.id
      || holdUntil > Date.now()
  }

  function needsImmediateSession(meta = {}) {
    return !!(
      meta.forceCreate
      || meta.forceLocal
      || meta.createEmpty
      || meta.title
      || meta.workFileName
      || meta.workFilePath
      || meta.workFileDir
      || meta.workFileDisplayPath
    )
  }

  function touchPendingSession(session, clientRequestId) {
    if (!session || !clientRequestId) return
    session.clientRequestId = session.clientRequestId || clientRequestId
    session.optimistic = true
    session.pendingBackendIndexUntil = Math.max(
      Number(session.pendingBackendIndexUntil || 0),
      Date.now() + FIRST_SEND_SESSION_HOLD_MS,
    )
  }

  function findAssistantMessage(session, clientRequestId) {
    if (!session) return null
    const mappedId = clientRequestId ? assistantMessageByRequestId.get(clientRequestId) : ''
    if (mappedId) {
      const mapped = session.messages.find(m => m.id === mappedId)
      if (mapped) return mapped
    }
    if (clientRequestId) {
      const exact = session.messages.find(m => m.role === 'assistant' && m.clientRequestId === clientRequestId)
        || session.messages.find(m => m.role === 'assistant' && m.id === getHermesAssistantMessageId(clientRequestId))
      return exact || null
    }
    if (state.pendingAssistantId) {
      const pending = session.messages.find(m => m.id === state.pendingAssistantId)
      if (pending) return pending
    }
    return null
  }

  function ensureAssistantMessage(session, clientRequestId) {
    let msg = findAssistantMessage(session, clientRequestId)
    if (!msg) {
      msg = {
        id: clientRequestId ? getHermesAssistantMessageId(clientRequestId) : uid(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      }
      if (clientRequestId) msg.clientRequestId = clientRequestId
      session.messages.push(msg)
    }
    state.pendingAssistantId = msg.id
    if (clientRequestId) assistantMessageByRequestId.set(clientRequestId, msg.id)
    return msg
  }

  // --- persistence ---
  const sessionsKey = () => STORAGE_SESSIONS_PREFIX + profileKey(state.activeProfile)
  const activeKey = () => STORAGE_ACTIVE_PREFIX + profileKey(state.activeProfile)
  const pinnedKey = () => STORAGE_PINNED_PREFIX + profileKey(state.activeProfile)
  const collapsedKey = () => STORAGE_COLLAPSED_PREFIX + profileKey(state.activeProfile)
  const messagesKey = (sid) => STORAGE_MSGS_PREFIX + profileKey(state.activeProfile) + '_' + sid
  const deletedKey = () => STORAGE_DELETED_PREFIX + profileKey(state.activeProfile)

  function persistSessions() {
    saveJson(sessionsKey(), state.sessions.map(s => ({ ...s, messages: [] })))
  }

  function loadDeletedSessionMap() {
    const now = Date.now()
    const raw = loadJson(deletedKey()) || {}
    const out = {}
    for (const [id, ts] of Object.entries(raw)) {
      const when = Number(ts || 0)
      if (id && when && now - when <= DELETED_SESSION_TTL_MS) out[id] = when
    }
    if (Object.keys(out).length !== Object.keys(raw).length) saveJson(deletedKey(), out)
    return out
  }

  function isDeletedSessionId(sessionId) {
    if (!sessionId) return false
    return Object.prototype.hasOwnProperty.call(loadDeletedSessionMap(), sessionId)
  }

  function rememberDeletedSession(sessionId) {
    if (!sessionId) return
    const deleted = loadDeletedSessionMap()
    deleted[sessionId] = Date.now()
    saveJson(deletedKey(), deleted)
  }
  function persistActiveMessages() {
    persistSessionMessages(state.activeSessionId)
  }
  function persistSessionMessages(sessionId) {
    const sid = sessionId
    if (!sid) return
    const s = state.sessions.find(x => x.id === sid)
    if (s) saveJson(messagesKey(sid), s.messages)
  }
  function normalizeHermesRestoredMessages(messages = []) {
    if (!Array.isArray(messages)) return []
    const hasManagedTurns = messages.some(message => hermesMessageRequestId(message))
    return messages
      .map(message => {
        if (!message || typeof message !== 'object') return null
        if (message.isStreaming === true) return null
        if (hasManagedTurns && isHermesBackendOrphanAssistant(message)) return null
        return {
          ...message,
          content: message.role === 'assistant' ? stripHermesGenericRetryFallback(message.content) : message.content,
          isStreaming: undefined,
        }
      })
      .filter(Boolean)
      .filter(message => !(message.role === 'assistant' && !String(message.content || '').trim()))
      .map(message => {
        const next = { ...message }
        delete next.isStreaming
        return next
      })
  }
  function loadSessionsCache() {
    const cached = loadJson(sessionsKey())
    if (Array.isArray(cached) && cached.length) {
      // Older builds persisted a separate backend session for each current-chat
      // media return. Treat those rows as implementation artifacts everywhere
      // we hydrate the sidebar, including the immediate localStorage paint.
      const visibleCached = cached.filter(session => !isHermesEphemeralMediaSession(session))
      state.sessions = visibleCached
      state.pendingAssistantId = null
      const savedActive = safeGet(activeKey())
      const target = selectStableActiveSession({
        sessions: visibleCached,
        savedActiveId: savedActive,
        currentActiveId: state.activeSessionId,
      })
      if (target) {
        const msgs = loadJson(messagesKey(target.id))
        if (Array.isArray(msgs)) {
          const normalized = normalizeHermesRestoredMessages(msgs)
          target.messages = normalized
          if (normalized.length !== msgs.length) saveJson(messagesKey(target.id), normalized)
        }
        state.activeSessionId = target.id
        safeSet(activeKey(), target.id)
      }
    }
  }

  function loadProfilePrefs() {
    state.pinned = new Set(loadJson(pinnedKey()) || [])
    state.collapsed = new Set(loadJson(collapsedKey()) || [])
  }

  function savePinned() { saveJson(pinnedKey(), [...state.pinned]) }
  function saveCollapsed() { saveJson(collapsedKey(), [...state.collapsed]) }

  // --- derived queries ---
  function activeSession() {
    return state.sessions.find(s => s.id === state.activeSessionId) || null
  }

  function isSessionLive(sessionId) {
    return isSessionStreaming(sessionId) || isSessionRecentlyActive(sessionId)
  }

  function isSessionStreaming(sessionId) {
    return state.streaming && sessionId === state.runningSessionId
  }

  function isSessionRecentlyActive(sessionId) {
    const s = state.sessions.find(x => x.id === sessionId)
    if (!s?.lastActiveAt) return false
    return Date.now() - s.lastActiveAt <= LIVE_BADGE_WINDOW_MS
  }

  /** Group sessions by source. Pinned ones go in a separate bucket. */
  function groupedSessions() {
    const pinnedList = state.sessions
      .filter(s => state.pinned.has(s.id))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

    const bySource = new Map()
    for (const s of state.sessions) {
      if (state.pinned.has(s.id)) continue
      const key = s.source || ''
      if (!bySource.has(key)) bySource.set(key, [])
      bySource.get(key).push(s)
    }

    const sortKey = (src) => {
      if (src === 'api_server') return -1
      if (src === '') return 0
      if (src === 'cron') return 999
      return 1
    }

    const keys = [...bySource.keys()].sort((a, b) => {
      const ka = sortKey(a)
      const kb = sortKey(b)
      if (ka !== kb) return ka - kb
      return a.localeCompare(b)
    })

    const groups = keys.map(src => ({
      source: src,
      label: src ? getSourceLabel(src) : 'Local',
      sessions: bySource.get(src).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    }))

    return { pinned: pinnedList, groups }
  }

  // --- actions ---
  async function loadSessions() {
    state.loading = true
    notify()
    try {
      // Use the lightweight summary endpoint for sidebar hydration; full
      // message bodies still load lazily via `hermesSessionDetail`.
      const list = await api.hermesSessionsSummaryList(null, 80, state.activeProfile)
      const fresh = (Array.isArray(list) ? list : [])
        .map(mapSessionSummary)
        // Older builds created a distinct backend session for every current-
        // chat media return. They are implementation artifacts, not user
        // conversations, so keep them out of the sidebar without deleting
        // backend history that may still be useful for diagnosis.
        .filter(s => !isDeletedSessionId(s.id) && !isHermesEphemeralMediaSession(s))
      const freshIds = new Set(fresh.map(s => s.id))

      // Preserve local metadata for sessions still present on the server. The
      // Hermes summary export may lag or omit titles, while the UI already
      // generated a stable local title from the first user message.
      const prevSessions = new Map(state.sessions.map(s => [s.id, s]))
      for (const s of fresh) {
        const prev = prevSessions.get(s.id)
        if (prev?.messages?.length) s.messages = prev.messages
        if (prev?.title && !isPlaceholderSessionTitle(prev.title) && isPlaceholderSessionTitle(s.title)) {
          s.title = prev.title
        }
        if (!s.workFileName && prev?.workFileName) s.workFileName = prev.workFileName
        if (!s.workFilePath && prev?.workFilePath) s.workFilePath = prev.workFilePath
        if (!s.workFileDir && prev?.workFileDir) s.workFileDir = prev.workFileDir
        if (!s.workFileDisplayPath && prev?.workFileDisplayPath) s.workFileDisplayPath = prev.workFileDisplayPath
        if (!s.lastActiveAt && prev?.lastActiveAt) s.lastActiveAt = prev.lastActiveAt
        if (prev?.clientRequestId) s.clientRequestId = prev.clientRequestId
        s.optimistic = false
        s.pendingBackendIndexUntil = 0
      }

      // Keep local-only sessions that the backend still does not know about.
      // Hermes may create the real backend session with a different id after
      // the first run; merge the temporary local row into the matching backend
      // row so the sidebar does not show duplicate conversations.
      const retained = []
      for (const local of state.sessions.filter(s => (
        !freshIds.has(s.id) && !isHermesEphemeralMediaSession(s)
      ))) {
        const isLocal = local.source === '__local__'
        const match = isLocal
          ? fresh.find(s => sessionLooksLikeBackendMatch(local, s, state.activeSessionId, state.runningSessionId))
          : null
        if (match) {
          const previousId = local.id
          mergeLocalSessionIntoBackend(local, match)
          if (state.activeSessionId === previousId) {
            state.activeSessionId = match.id
            safeSet(activeKey(), match.id)
          }
          if (state.runningSessionId === previousId) state.runningSessionId = match.id
          safeRemove(messagesKey(previousId))
        } else {
          if (isLocal || shouldKeepPendingSession(local, freshIds)) {
            retained.push(local)
          }
        }
      }
      const retainedIds = new Set()
      const kept = []
      for (const session of retained) {
        if (!session?.id || retainedIds.has(session.id) || freshIds.has(session.id)) continue
        retainedIds.add(session.id)
        kept.push(session)
      }
      state.sessions = [...kept, ...fresh]
      persistSessions()

      if (!state.activeSessionId || !state.sessions.some(s => s.id === state.activeSessionId)) {
        const target = selectStableActiveSession({
          sessions: state.sessions,
          savedActiveId: safeGet(activeKey()),
          currentActiveId: state.activeSessionId,
        })
        if (target) {
          await switchSession(target.id)
        } else {
          state.activeSessionId = null
          safeRemove(activeKey())
          persistSessions()
          notify()
        }
      } else {
        // Refresh active session messages.
        await refreshActiveMessages()
      }
    } catch (e) {
      state.error = e?.message || String(e)
    } finally {
      state.loading = false
      notify()
    }
  }

  async function loadProfiles() {
    state.loadingProfiles = true
    notify()
    try {
      const data = await api.hermesProfilesList()
      const profiles = Array.isArray(data?.profiles) ? data.profiles : []
      state.profiles = profiles
      const active = data?.active || profiles.find(p => p.active)?.name || state.activeProfile || 'default'
      if (active !== state.activeProfile) {
        state.activeProfile = active
        safeSet(STORAGE_PROFILE, active)
        state.sessions = []
        state.activeSessionId = null
        loadProfilePrefs()
        loadSessionsCache()
      }
    } finally {
      state.loadingProfiles = false
      notify()
    }
  }

  async function switchProfile(name) {
    if (!name || name === state.activeProfile || state.streaming) return
    await api.hermesProfileUse(name)
    state.activeProfile = name
    safeSet(STORAGE_PROFILE, name)
    state.sessions = []
    state.activeSessionId = null
    state.liveTools = []
    loadProfilePrefs()
    loadSessionsCache()
    notify()
    await loadProfiles()
    await loadSessions()
  }

  async function refreshActiveMessages(options = {}) {
    const sid = state.activeSessionId
    if (!sid) return
    if (state.streaming && state.runningSessionId === sid) return
    const target = state.sessions.find(s => s.id === sid)
    if (!target) return
    const force = Boolean(options.force || forceRemoteRefreshIds.has(sid))
    // Skip remote fetch for local-only sessions — the backend doesn't know them.
    if (target.source === '__local__' && !force) return
    if (hasHermesProtectedLocalTail(target)) {
      forceRemoteRefreshIds.delete(sid)
      return
    }

    try {
      const detail = await api.hermesSessionDetail(sid)
      if (!detail) return
      const mapped = mapHermesMessages(detail.messages || [])

      // Heuristic: only overwrite if server view has >= user turns + content
      const local = target.messages || []
      const localUsers = local.filter(m => m.role === 'user').length
      const serverUsers = mapped.filter(m => m.role === 'user').length
      const localTail = lastTurnAssistantText(local)
      const serverTail = lastTurnAssistantText(mapped)
      if (hasHermesProtectedLocalTail(target) && localTail.trim() === String(target.protectedLocalTailReply || '').trim()) {
        forceRemoteRefreshIds.delete(sid)
        return
      }
      const hasLocalTranscript = hasHermesLocalTranscript(target)
      const serverIsAhead = serverUsers > localUsers
        || (serverUsers === localUsers && (!localTail.trim() || serverTail.length >= localTail.length))
      const skipMessageMerge = hasLocalTranscript && !options.forceServerMessages
      if ((force || serverIsAhead) && !skipMessageMerge) {
        // Hermes session export can lag behind the live SSE stream for a few
        // seconds. Never replace the local transcript with a shorter server
        // snapshot; merge server-only records into what the user has already
        // seen so history cannot disappear after a post-run refresh.
        target.messages = mergeHermesMessages(local, mapped)
        if (target.source === '__local__') target.source = detail.source || 'api_server'
        if (detail.title && !target.workFileName && !isPlaceholderSessionTitle(detail.title)) {
          target.title = detail.title
        } else {
          updateSessionTitleFromFirstUser(target)
        }
        persistActiveMessages()
      } else if (skipMessageMerge) {
        if (target.source === '__local__') target.source = detail.source || 'api_server'
        if (detail.title && !target.workFileName && !isPlaceholderSessionTitle(detail.title)) {
          target.title = detail.title
        } else {
          updateSessionTitleFromFirstUser(target)
        }
      }
      forceRemoteRefreshIds.delete(sid)
    } catch {
      // Session may not exist on server yet (local-only) — that's fine.
    }
  }

  function createLocalSession(meta = {}) {
    const now = Date.now()
    const id = meta.id || uid()
    const s = {
      id,
      sessionId: id,
      session_id: id,
      profile: meta.profile || state.activeProfile || 'default',
      title: meta.title || meta.workFileName || '',
      source: '__local__',
      model: '',
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      endedAt: null,
      lastActiveAt: undefined,
      optimistic: Boolean(meta.optimistic || meta.clientRequestId),
      clientRequestId: meta.clientRequestId || '',
      pendingBackendIndexUntil: meta.clientRequestId ? now + FIRST_SEND_SESSION_HOLD_MS : 0,
      protectLocalTailUntil: 0,
      protectedLocalTailReply: '',
      forceEmptyHistoryOnce: Boolean(meta.createEmpty || meta.forceLocal),
      preventBackendSessionAdoption: Boolean(meta.createEmpty || meta.forceLocal),
      workFileName: meta.workFileName || '',
      workFilePath: meta.workFilePath || '',
      workFileDir: meta.workFileDir || '',
      workFileDisplayPath: meta.workFileDisplayPath || '',
      messages: [],
      pendingTools: {},
      failedTasks: [],
      toolEvents: [],
    }
    state.sessions.unshift(s)
    state.activeSessionId = s.id
    safeSet(activeKey(), s.id)
    persistSessions()
    notify()
    return s
  }

  function createEmptySession(meta = {}) {
    if (state.streaming) return null
    detachStreamListeners()
    streamAbortController = null
    activeResponseAssembler = null
    state.runningSessionId = null
    state.runningClientRequestId = null
    state.pendingAssistantId = null
    state.liveTools = []
    assistantMessageByRequestId.clear()
    return createLocalSession({
      ...meta,
      createEmpty: true,
      forceLocal: true,
      profile: meta.profile || state.activeProfile || 'default',
      title: meta.title || '',
    })
  }

  function adoptBackendSessionId(currentId, backendSessionId) {
    const nextId = String(backendSessionId || '').trim()
    if (!currentId || !nextId || nextId === currentId) return currentId
    const current = state.sessions.find(s => s.id === currentId)
    if (!current) return currentId
    if (current.preventBackendSessionAdoption) return currentId

    const existing = state.sessions.find(s => s.id === nextId)
    let target = current
    if (existing && existing !== current) {
      const existingMessageIds = new Set((existing.messages || []).map(m => m.id).filter(Boolean))
      const movedMessages = (current.messages || []).filter(m => !m.id || !existingMessageIds.has(m.id))
      existing.messages = [...(existing.messages || []), ...movedMessages]
      if (isPlaceholderSessionTitle(existing.title) && !isPlaceholderSessionTitle(current.title)) existing.title = current.title
      existing.workFileName = existing.workFileName || current.workFileName
      existing.workFilePath = existing.workFilePath || current.workFilePath
      existing.workFileDir = existing.workFileDir || current.workFileDir
      existing.workFileDisplayPath = existing.workFileDisplayPath || current.workFileDisplayPath
      existing.updatedAt = Math.max(existing.updatedAt || 0, current.updatedAt || 0, Date.now())
      existing.lastActiveAt = Math.max(existing.lastActiveAt || 0, current.lastActiveAt || 0, Date.now())
      existing.optimistic = current.optimistic || existing.optimistic || false
      existing.clientRequestId = existing.clientRequestId || current.clientRequestId || ''
      existing.pendingBackendIndexUntil = Math.max(
        Number(existing.pendingBackendIndexUntil || 0),
        Number(current.pendingBackendIndexUntil || 0),
        Date.now() + FIRST_SEND_SESSION_HOLD_MS,
      )
      existing.protectLocalTailUntil = Math.max(
        Number(existing.protectLocalTailUntil || 0),
        Number(current.protectLocalTailUntil || 0),
      )
      existing.protectedLocalTailReply = existing.protectedLocalTailReply || current.protectedLocalTailReply || ''
      state.sessions = state.sessions.filter(s => s !== current)
      target = existing
    } else {
      current.id = nextId
      current.source = current.source === '__local__' ? 'api_server' : (current.source || 'api_server')
      current.optimistic = true
      current.pendingBackendIndexUntil = Math.max(
        Number(current.pendingBackendIndexUntil || 0),
        Date.now() + FIRST_SEND_SESSION_HOLD_MS,
      )
      target = current
    }

    if (state.activeSessionId === currentId) {
      state.activeSessionId = nextId
      safeSet(activeKey(), nextId)
    }
    if (state.runningSessionId === currentId) state.runningSessionId = nextId
    if (forceRemoteRefreshIds.has(currentId)) {
      forceRemoteRefreshIds.delete(currentId)
      forceRemoteRefreshIds.add(nextId)
    }
    persistSessionMessages(nextId)
    safeRemove(messagesKey(currentId))
    persistSessions()
    notify()
    return nextId
  }

  async function switchSession(sessionId) {
    state.activeSessionId = sessionId
    safeSet(activeKey(), sessionId)
    const target = state.sessions.find(s => s.id === sessionId)
    if (!target) { notify(); return }

    // Instant render: hydrate from cache if messages are empty.
    if (!target.messages?.length) {
      const cached = loadJson(messagesKey(sessionId))
      if (Array.isArray(cached) && cached.length) target.messages = cached
    }

    const needsBlocking = !target.messages?.length && target.source !== '__local__'
    if (needsBlocking) state.loadingMessages = true
    notify()

    await refreshActiveMessages()
    state.loadingMessages = false
    notify()
  }

  function newChat(meta = {}) {
    if (state.streaming) return
    if (needsImmediateSession(meta)) {
      createLocalSession(meta)
      return
    }
    state.activeSessionId = null
    safeRemove(activeKey())
    notify()
  }

  async function deleteSession(sessionId) {
    if (state.streaming && sessionId === state.runningSessionId) {
      throw new Error('RUNNING_SESSION')
    }
    rememberDeletedSession(sessionId)
    const target = state.sessions.find(s => s.id === sessionId)
    if (target && target.source !== '__local__') {
      await api.hermesSessionDelete(sessionId)
    }
    state.sessions = state.sessions.filter(s => s.id !== sessionId)
    state.pinned.delete(sessionId)
    savePinned()
    safeRemove(messagesKey(sessionId))
    persistSessions()

    if (state.activeSessionId === sessionId) {
      if (state.sessions.length) {
        await switchSession(state.sessions[0].id)
        return
      }
      state.activeSessionId = null
      safeRemove(activeKey())
      persistSessions()
      notify()
      return
    }
    notify()
  }

  /**
   * Delete multiple sessions sequentially. The Hermes CLI doesn't expose a
   * batch endpoint, so we call `hermesSessionDelete` one-by-one for backend-
   * backed sessions and remove local-only ones in memory. The currently
   * streaming session (if any) is reported in `skipped` instead of failing.
   *
   * Returns `{ deleted, skipped, failed }`.
   */
  async function bulkDeleteSessions(sessionIds) {
    const ids = Array.from(new Set((sessionIds || []).filter(Boolean)))
    const deleted = []
    const skipped = []
    const failed = []
    for (const sid of ids) {
      if (state.streaming && sid === state.runningSessionId) {
        skipped.push(sid)
        continue
      }
      rememberDeletedSession(sid)
      const target = state.sessions.find(s => s.id === sid)
      if (!target) {
        skipped.push(sid)
        continue
      }
      try {
        if (target.source !== '__local__') {
          await api.hermesSessionDelete(sid)
        }
        deleted.push(sid)
      } catch (e) {
        failed.push({ id: sid, error: e?.message || String(e) })
      }
    }
    if (deleted.length) {
      const deletedSet = new Set(deleted)
      state.sessions = state.sessions.filter(s => !deletedSet.has(s.id))
      for (const sid of deleted) {
        state.pinned.delete(sid)
        safeRemove(messagesKey(sid))
      }
      savePinned()
      persistSessions()
      if (state.activeSessionId && deletedSet.has(state.activeSessionId)) {
        if (state.sessions.length) {
          await switchSession(state.sessions[0].id)
        } else {
          state.activeSessionId = null
          safeRemove(activeKey())
          persistSessions()
          notify()
        }
      } else {
        notify()
      }
    } else {
      notify()
    }
    return { deleted, skipped, failed }
  }

  async function renameSession(sessionId, title) {
    const trimmed = (title || '').trim()
    if (!trimmed) return false
    const target = state.sessions.find(s => s.id === sessionId)
    if (!target) return false
    // Remote-only if the session is persisted.
    if (target.source !== '__local__') {
      try { await api.hermesSessionRename(sessionId, trimmed) }
      catch { return false }
    }
    target.title = trimmed
    target.updatedAt = Date.now()
    persistSessions()
    notify()
    return true
  }

  function togglePinned(sessionId) {
    if (state.pinned.has(sessionId)) state.pinned.delete(sessionId)
    else state.pinned.add(sessionId)
    savePinned()
    notify()
  }

  function toggleCollapsed(source) {
    if (state.collapsed.has(source)) state.collapsed.delete(source)
    else state.collapsed.add(source)
    saveCollapsed()
    notify()
  }

  // ---------- streaming ----------

  const unlisteners = []
  let streamAbortController = null
  let activeResponseAssembler = null
  let hermesRunTimeoutTimer = null
  let hermesRunRecoveryInFlight = false
  let hermesRunRecoveryAttempts = 0
  let activeHermesRunId = ''
  let pendingHermesStopPromise = null
  const forceRemoteRefreshIds = new Set()

  function stopActiveHermesServerRun(reason = 'client-stop') {
    const runId = String(activeHermesRunId || activeResponseAssembler?.runId || '').trim()
    if (!runId) return Promise.resolve(false)
    if (pendingHermesStopPromise?.runId === runId) return pendingHermesStopPromise.promise

    const promise = api.hermesApiProxy(
      'POST',
      `/v1/runs/${encodeURIComponent(runId)}/stop`,
      JSON.stringify({ reason }),
    )
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        if (pendingHermesStopPromise?.runId === runId) pendingHermesStopPromise = null
        if (activeHermesRunId === runId) activeHermesRunId = ''
      })
    pendingHermesStopPromise = { runId, promise }
    return promise
  }

  function executionEventText(evt = {}, eventType = '') {
    // The runtime can include private chain-of-thought in reasoning.available.
    // Keep the chat transparent through visible progress and tool records, but
    // never persist or render hidden reasoning verbatim.
    if (eventType === 'reasoning.available') {
      const visible = evt.visible_text ?? evt.visibleText ?? evt.userVisibleText ?? evt.summary ?? evt.preview
      if (typeof visible === 'string' && visible.trim()) {
        return sanitizeFrontendObservabilityText(visible).slice(0, 500)
      }
      return '正在分析任务并准备下一步。'
    }
    const value = evt.reasoning
      ?? evt.thinking
      ?? evt.preview
      ?? evt.detail
      ?? evt.message
      ?? evt.delta
      ?? evt.output
      ?? evt.result
      ?? ''
    if (typeof value === 'boolean' || value == null) return ''
    return typeof value === 'string' ? value.trim() : stringifyMaybe(value).trim()
  }

  function normalizeExecutionArtifacts(evt = {}) {
    const raw = [
      ...(Array.isArray(evt.artifacts) ? evt.artifacts : []),
      ...(Array.isArray(evt.files) ? evt.files : []),
      ...(evt.artifact ? [evt.artifact] : []),
      ...(evt.file ? [evt.file] : []),
    ]
    const seen = new Set()
    return raw.map((item) => {
      const value = typeof item === 'string' ? { path: item } : (item && typeof item === 'object' ? item : {})
      const rawPath = String(value.relative_path || value.relativePath || value.path || value.file_path || value.filePath || '').trim()
      // Conversation state can move from a dev tree to an EXE or USB drive.
      // Keep relative paths intact, but reduce absolute host paths to a filename
      // so a saved trace never suggests that a previous machine path is reusable.
      const normalizedPath = rawPath.replace(/\\/g, '/')
      const isAbsolutePath = /^[A-Za-z]:\//.test(normalizedPath) || normalizedPath.startsWith('/')
      const path = isAbsolutePath
        ? normalizedPath.split('/').filter(Boolean).pop() || ''
        : normalizedPath.replace(/^\.\//, '')
      const text = String(value.text || value.summary || value.description || '').trim().slice(0, 4000)
      const type = String(value.type || value.kind || (path ? 'file' : 'result')).trim() || 'result'
      if (!path && !text) return null
      const key = `${type}:${path}:${text.slice(0, 120)}`
      if (seen.has(key)) return null
      seen.add(key)
      return { type, path, text, created_at: stableIsoTime(value.created_at || value.createdAt) }
    }).filter(Boolean).slice(-20)
  }

  function attachHermesReturnedMedia(session, clientRequestId, evt = {}) {
    const toolName = String(evt.tool || evt.tool_name || evt.name || '').trim()
    if (toolName !== 'superclaw_return_media') return ''
    const raw = evt.output ?? evt.result ?? evt.content ?? evt.response ?? evt.data
    let payload = raw
    if (typeof raw === 'string') {
      try { payload = JSON.parse(raw) } catch { return '' }
    }
    const media = payload?.media
    const mediaPath = String(media?.path || '').trim()
    const mimeType = String(media?.mime_type || media?.mimeType || '').trim().toLowerCase()
    if (!payload?.ok || !mediaPath || !/^image\/(?:png|jpeg|webp|gif)$/.test(mimeType)) return ''
    const message = ensureAssistantMessage(session, clientRequestId)
    const attachments = Array.isArray(message.attachments) ? message.attachments : []
    if (!attachments.some(item => String(item?.mediaPath || '') === mediaPath)) {
      attachments.push({
        category: 'image',
        type: 'image',
        mediaPath,
        mimeType,
        fileName: String(media?.file_name || media?.fileName || 'generated-image').trim(),
        caption: String(media?.caption || '').trim(),
      })
      message.attachments = attachments
    }
    return mediaPath
  }

  function normalizeHermesToolEventName(eventName) {
    const name = String(eventName || '').trim()
    if (name === 'tool.start') return 'tool.started'
    if (name === 'tool.complete') return 'tool.completed'
    return name
  }

  async function hydrateHermesReturnedMedia(sessionId, clientRequestId, mediaPath) {
    const path = String(mediaPath || '').trim()
    if (!path) return
    try {
      const dataUrl = await api.loadHermesMediaImage(path)
      if (!/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(String(dataUrl || ''))) return
      const session = state.sessions.find(item => item.id === sessionId)
      if (!session) return
      const message = ensureAssistantMessage(session, clientRequestId)
      const attachment = (message.attachments || []).find(item => String(item?.mediaPath || '') === path)
      if (!attachment || attachment.dataUrl === dataUrl) return
      attachment.dataUrl = dataUrl
      persistSessionMessages(session.id)
      notify()
    } catch (error) {
      // The rendered media-path loader remains available as a retry path. A
      // failed preview must never make the assistant response itself fail.
      console.warn('[Hermes] current-chat media preload failed', error)
    }
  }

  function recordAssistantExecutionEvent(session, clientRequestId, eventType, evt = {}) {
    if (!session || !clientRequestId) return
    const message = ensureAssistantMessage(session, clientRequestId)
    const trace = Array.isArray(message.executionTrace) ? message.executionTrace : []
    const toolName = String(evt.tool || evt.tool_name || evt.name || '').trim()
    const kind = eventType.startsWith('tool.')
      ? 'tool'
      : eventType === 'reasoning.available'
        ? 'reasoning'
        : 'progress'
    const rawEventId = String(
      evt.toolCallId
      || evt.tool_call_id
      || evt.event_id
      || evt.id
      || (kind === 'tool' && toolName ? `${clientRequestId}:${toolName}` : ''),
    ).trim()
    const status = eventType === 'tool.started'
      ? 'running'
      : eventType === 'tool.error' || eventType === 'run.failed'
        ? 'failed'
        : eventType === 'tool.completed'
          ? 'completed'
          : 'progress'
    const text = executionEventText(evt, eventType)
    const isVisibleStreamNarration = kind === 'reasoning' && evt.source === 'stream-visible'
    const isGenericReasoning = kind === 'reasoning' && text === HERMES_REASONING_PLACEHOLDER
    const eventId = isGenericReasoning
      ? `${clientRequestId}:reasoning:pending`
      : (rawEventId || (kind === 'reasoning' ? `${clientRequestId}:reasoning:pending` : ''))
    let existing = eventId ? trace.find(item => item.id === eventId) : null
    // The runtime's reasoning event often arrives without a safe summary. When
    // a later visible narration fragment arrives, replace that generic pending
    // step instead of leaving several "preparing next step" placeholders.
    if (isVisibleStreamNarration && !existing) {
      const pendingId = `${clientRequestId}:reasoning:pending`
      existing = trace.find(item => item.id === pendingId)
      if (existing) existing.id = eventId
    }
    const step = existing || {
      id: eventId || uid(),
      kind,
      title: toolName || (kind === 'reasoning' ? '思考' : '执行进度'),
      status,
      summary: '',
      input: '',
      output: '',
      timestamp: Date.now(),
    }
    step.status = status
    step.updatedAt = Date.now()
    if (isVisibleStreamNarration) step.source = 'stream-visible'
    if (text) step.summary = text
    const input = evt.input ?? evt.args ?? evt.arguments ?? evt.parameters ?? evt.params
    const output = evt.output ?? evt.result ?? evt.content ?? evt.response
    if (input != null && input !== '') step.input = stringifyMaybe(input)
    if (output != null && output !== '' && typeof output !== 'boolean') step.output = stringifyMaybe(output)
    const artifacts = normalizeExecutionArtifacts(evt)
    if (artifacts.length) {
      step.artifacts = artifacts
      const existingArtifacts = Array.isArray(message.artifacts) ? message.artifacts : []
      const byKey = new Map(existingArtifacts.map(item => [`${item.type || ''}:${item.path || ''}:${String(item.text || '').slice(0, 120)}`, item]))
      for (const artifact of artifacts) {
        byKey.set(`${artifact.type}:${artifact.path}:${String(artifact.text || '').slice(0, 120)}`, artifact)
      }
      message.artifacts = Array.from(byKey.values()).slice(-40)
    }
    if (!existing) trace.push(step)
    message.executionTrace = trace.slice(-80)
  }

  function setPendingHermesApproval(payload = {}) {
    const runId = String(payload.run_id || payload.runId || activeHermesRunId || activeResponseAssembler?.runId || '').trim()
    if (!runId) return false
    const choices = Array.isArray(payload.choices)
      ? payload.choices.filter(choice => ['once', 'session', 'always', 'deny'].includes(String(choice || '').toLowerCase()))
      : ['once', 'session', 'always', 'deny']
    state.pendingApproval = {
      runId,
      command: String(payload.command || payload.code || payload.input || '').trim(),
      description: String(payload.description || payload.reason || payload.message || '此操作需要你的授权后才能继续。').trim(),
      choices: choices.length ? choices : ['once', 'session', 'always', 'deny'],
      requestedAt: Date.now(),
      resolving: false,
      error: '',
    }
    const session = state.sessions.find(item => item.id === state.runningSessionId) || null
    if (session) {
      recordAssistantExecutionEvent(session, state.runningClientRequestId, 'approval.request', payload)
      rememberHermesTaskStatus(session, {
        status: 'waiting_human',
        lastStep: '等待授权',
        summary: state.pendingApproval.description,
      })
    }
    clearHermesRunTimeoutGuard()
    notify()
    return true
  }

  function clearPendingHermesApproval(runId = '') {
    if (!state.pendingApproval) return
    if (runId && state.pendingApproval.runId && state.pendingApproval.runId !== runId) return
    state.pendingApproval = null
  }

  async function resolvePendingHermesApproval(choice) {
    const pending = state.pendingApproval
    if (!pending?.runId || pending.resolving) return false
    const normalizedChoice = String(choice || '').trim().toLowerCase()
    if (!pending.choices.includes(normalizedChoice)) throw new Error('当前操作不支持该授权选项')
    state.pendingApproval = { ...pending, resolving: true, error: '' }
    notify()
    try {
      const result = await api.hermesAgentResolveApproval(pending.runId, normalizedChoice)
      clearPendingHermesApproval(pending.runId)
      const session = state.sessions.find(item => item.id === state.runningSessionId) || null
      if (session) {
        recordAssistantExecutionEvent(session, state.runningClientRequestId, 'approval.responded', { choice: normalizedChoice })
        rememberHermesTaskStatus(session, {
          status: 'running',
          lastStep: normalizedChoice === 'deny' ? '已拒绝该操作，等待任务继续' : '已授权，任务继续执行',
        })
      }
      startHermesRunTimeoutGuard({
        clientRequestId: state.runningClientRequestId,
        sessionId: state.runningSessionId,
      })
      notify()
      return result
    } catch (error) {
      if (state.pendingApproval?.runId === pending.runId) {
        state.pendingApproval = { ...pending, resolving: false, error: String(error?.message || error || '提交授权失败') }
      }
      notify()
      throw error
    }
  }

  function finalizeAssistantExecutionTrace(message, status = 'completed') {
    if (!message || !Array.isArray(message.executionTrace)) return
    for (const step of message.executionTrace) {
      if (step?.status === 'running' || step?.status === 'progress') step.status = status
    }
  }

  async function attachStreamListeners(runSessionId, clientRequestId) {
    detachStreamListeners()
    let trackedSessionId = runSessionId
    const adoptEventSession = (payload = {}) => {
      const next = payload.session_id || payload.sessionId || payload.id || ''
      trackedSessionId = adoptBackendSessionId(trackedSessionId, next)
    }
    const acceptRequestEvent = (payload = {}) => {
      if (!state.streaming || !state.runningClientRequestId) return false
      if (clientRequestId && state.runningClientRequestId !== clientRequestId) return false
      if (!activeResponseAssembler) return true
      if (payload.run_id || payload.runId) activeResponseAssembler.adoptRunId(payload.run_id || payload.runId)
      return activeResponseAssembler.matches(payload)
    }
    const runSession = () => state.sessions.find(x => x.id === trackedSessionId) || null
    const u0 = await tauriListen('hermes-run-started', (e) => {
      const payload = e?.payload || {}
      if (!acceptRequestEvent(payload)) return
      activeHermesRunId = String(payload.run_id || payload.runId || activeResponseAssembler?.runId || '').trim()
      adoptEventSession(payload)
      touchHermesRunWatchdog({ clientRequestId, sessionId: trackedSessionId })
    })
    const u1 = await tauriListen('hermes-run-delta', (e) => {
      const payload = e?.payload || {}
      if (!acceptRequestEvent(payload)) return
      const accepted = activeResponseAssembler
        ? activeResponseAssembler.accept({ ...payload, event: 'message.delta' })
        : { text: payload.delta || '' }
      const delta = accepted?.text || ''
      if (!delta) return
      const s = runSession()
      if (!s) return
      const msg = ensureAssistantMessage(s, clientRequestId)
      msg.content = sanitizeHermesVisibleReply(msg.content + delta, currentVisibleUserPrompt(), { streaming: true })
      touchHermesRunWatchdog({ clientRequestId, sessionId: trackedSessionId })
      notify()
    })
    const u2 = await tauriListen('hermes-run-tool', (e) => {
      const evt = e?.payload || {}
      if (!acceptRequestEvent(evt)) return
      const evtType = normalizeHermesToolEventName(evt.event)
      const toolName = evt.tool || evt.tool_name || evt.name || 'tool'
      const preview = evt.preview || evt.detail || evt.message || ''
      const extract = (obj, keys) => {
        for (const k of keys) {
          if (obj[k] != null && obj[k] !== '') return obj[k]
        }
        return null
      }
      if (evtType === 'tool.started') {
        const input = extract(evt, ['input', 'args', 'arguments', 'parameters', 'params', 'data'])
        state.liveTools.push({
          id: evt.toolCallId || evt.tool_call_id || uid(),
          name: toolName,
          status: 'running',
          preview,
          args: input,
          result: null,
          error: null,
          clientRequestId,
          runId: evt.run_id || evt.runId || activeResponseAssembler?.runId || '',
        })
      } else if (evtType === 'tool.completed') {
        const t = state.liveTools.find(x => x.name === toolName && x.status === 'running')
          || [...state.liveTools].reverse().find(x => x.name === toolName)
        if (t) {
          t.status = evt.error ? 'error' : 'done'
          t.preview = evt.error ? (typeof evt.error === 'string' ? evt.error : 'failed') : preview
          t.result = extract(evt, ['output', 'result', 'content', 'data', 'response'])
          if (evt.error) t.error = typeof evt.error === 'string' ? evt.error : JSON.stringify(evt.error)
          if (!t.result && t.error) t.result = t.error
          if (!t.args) t.args = extract(evt, ['input', 'args', 'arguments', 'parameters', 'params'])
        }
      const session = runSession()
      const returnedMediaPath = attachHermesReturnedMedia(session, clientRequestId, evt)
      if (returnedMediaPath) {
        void hydrateHermesReturnedMedia(session?.id, clientRequestId, returnedMediaPath)
      }
      } else if (evtType === 'tool.error') {
        const t = state.liveTools.find(x => x.name === toolName && x.status === 'running')
        if (t) {
          t.status = 'error'
          t.preview = preview || 'failed'
          t.error = evt.error || preview || 'unknown'
          if (!t.result) t.result = t.error
        }
      } else if (evtType === 'tool.progress') {
        const t = state.liveTools.find(x => x.name === toolName && x.status === 'running')
        if (t && preview) t.preview = preview
      }
      recordHermesToolProgress(evtType, toolName, preview, evt)
      recordAssistantExecutionEvent(runSession(), clientRequestId, evtType, evt)
      touchHermesRunWatchdog({ clientRequestId, sessionId: trackedSessionId })
      notify()
    })
    const u3 = await tauriListen('hermes-run-done', (e) => {
      const payload = e?.payload || {}
      if (!acceptRequestEvent(payload)) return
      adoptEventSession(payload)
      const s = runSession()
      if (!s) { cleanupAfterRun(); return }
      const accepted = activeResponseAssembler
        ? activeResponseAssembler.accept({ ...payload, event: 'run.completed' })
        : { output: payload.output || '' }
      if (!accepted) return
      const runTools = dedupeToolEvents([...state.liveTools])

      // Commit finished tool calls as messages in the transcript.
      if (runTools.length && isHermesDebugToolsVisible()) {
        for (const t of runTools) {
          s.messages.push({
            id: uid(),
            role: 'tool',
            content: '',
            timestamp: Date.now(),
            toolName: t.name || t.toolName,
            toolPreview: t.preview || undefined,
            toolArgs: stringifyMaybe(t.args),
            toolResult: stringifyMaybe(t.result ?? t.error),
            toolStatus: t.error ? 'error' : 'done',
            clientRequestId: t.clientRequestId || clientRequestId,
            runId: t.runId || payload.run_id || payload.runId || '',
          })
        }
      }

      // Finalize the streaming assistant message.
      const msg = ensureAssistantMessage(s, clientRequestId)
      if (msg) {
        delete msg.isStreaming
        finalizeAssistantExecutionTrace(msg, 'completed')
        const finalOutput = accepted.output || payload.output || ''
        msg.content = chooseHermesFinalOutput({
          session: s,
          current: msg.content,
          finalOutput,
          clientRequestId,
          prompt: currentVisibleUserPrompt(),
          executionTrace: msg.executionTrace,
        })
        msg.content = sanitizeHermesVisibleReply(msg.content)
        if (!msg.content.trim()) msg.content = summarizeToolOnlyReply(runTools) || '这轮没有收到可展示的正文结果。'
        msg.content = normalizeHermesExactShortReply(currentVisibleUserPrompt(), msg.content)
        markHermesExactShortLocalTail(s, currentVisibleUserPrompt())
        msg.content = completeHermesReplyIfNeeded(msg.content, {
          userText: currentVisibleUserPrompt(),
          toolEvents: runTools,
          toolResult: runTools.length > 0,
        })
        applyHermesPromiseOnlyTaskGuard(msg, currentVisibleUserPrompt(), runTools, clientRequestId)
      }
      const longTaskGuardFailed = !!(msg?.error && Array.isArray(msg.task_events) && msg.task_events.some(event => event?.source === 'hermes.chat_store.long_task_guard'))
      rememberHermesTaskStatus(s, {
        status: longTaskGuardFailed ? 'failed' : 'success',
        lastStep: '任务已完成',
        summary: msg?.content || summarizeToolOnlyReply(runTools) || '任务已完成。',
        error: longTaskGuardFailed ? (msg?.error || msg?.content || '') : '',
      })

      // Update session metadata.
      s.updatedAt = Date.now()
      s.lastActiveAt = Date.now()
      updateSessionTitleFromFirstUser(s)

      persistSessionMessages(s.id)
      persistSessions()
      cleanupAfterRun({ status: longTaskGuardFailed ? 'failed' : 'success', reason: longTaskGuardFailed ? 'long-task-no-evidence' : 'run-completed' })
    })
    const u4 = await tauriListen('hermes-run-error', (e) => {
      const payload = e?.payload || {}
      if (!acceptRequestEvent(payload)) return
      const err = payload.error || 'unknown error'
      adoptEventSession(payload)
      const s = runSession()
      if (s) {
        const msg = ensureAssistantMessage(s, clientRequestId)
        delete msg.isStreaming
        recordAssistantExecutionEvent(s, clientRequestId, 'run.failed', payload)
        finalizeAssistantExecutionTrace(msg, 'failed')
        msg.content = sanitizeHermesVisibleReply(mapHermesErrorToUserMessage(err), currentVisibleUserPrompt())
        rememberHermesTaskStatus(s, {
          status: 'failed',
          lastStep: '任务失败',
          error: mapHermesErrorToUserMessage(err),
        })
        persistSessionMessages(s.id)
      }
      cleanupAfterRun({ status: 'failed', reason: 'run-error', error: err })
    })
    const u5 = await tauriListen('hermes-run-reasoning', (e) => {
      const payload = e?.payload || {}
      if (!acceptRequestEvent(payload)) return
      recordAssistantExecutionEvent(runSession(), clientRequestId, 'reasoning.available', payload)
      touchHermesRunWatchdog({ clientRequestId, sessionId: trackedSessionId })
      notify()
    })
    const u6 = await tauriListen('hermes-run-event', (e) => {
      const payload = e?.payload || {}
      if (!acceptRequestEvent(payload)) return
      const eventType = String(payload.event || '')
      touchHermesRunWatchdog({ clientRequestId, sessionId: trackedSessionId })
      if (eventType === 'approval.request') {
        setPendingHermesApproval(payload)
        return
      }
      if (eventType === 'approval.responded') {
        clearPendingHermesApproval(payload.run_id || payload.runId || '')
      }
      if (!eventType || eventType === 'message.delta' || eventType === 'message.final') return
      recordAssistantExecutionEvent(runSession(), clientRequestId, eventType, payload)
      notify()
    })
    unlisteners.push(u0, u1, u2, u3, u4, u5, u6)
  }

  function detachStreamListeners() {
    for (const u of unlisteners) {
      try { u() } catch {}
    }
    unlisteners.length = 0
  }

  function appendStreamDelta(runSessionId, delta, clientRequestId = state.runningClientRequestId) {
    if (!delta) return
    const s = state.sessions.find(x => x.id === runSessionId)
    if (!s) return
    const msg = ensureAssistantMessage(s, clientRequestId)
    const narration = extractHermesVisibleExecutionNarration(delta)
    if (narration && Array.isArray(msg.executionTrace) && msg.executionTrace.length) {
      recordAssistantExecutionEvent(s, clientRequestId, 'reasoning.available', {
        event_id: hermesVisibleNarrationEventId(clientRequestId, narration),
        visible_text: narration,
        source: 'stream-visible',
      })
      notify()
      return
    }
    msg.content = sanitizeHermesVisibleReply(msg.content + delta, currentVisibleUserPrompt(), { streaming: true })
    notify()
  }

  function acceptActiveStreamEvent(evt = {}) {
    if (!activeResponseAssembler) return null
    return activeResponseAssembler.accept(evt)
  }

  function extractStreamValue(obj, keys) {
    for (const k of keys) {
      if (obj[k] != null && obj[k] !== '') return obj[k]
    }
    return null
  }

  function applyStreamToolEvent(evt) {
    if (activeResponseAssembler && !activeResponseAssembler.matches(evt)) return
    const evtType = normalizeHermesToolEventName(evt.event)
    const toolName = evt.tool || evt.tool_name || evt.name || 'tool'
    const preview = evt.preview || evt.detail || evt.message || ''
    const session = state.sessions.find(x => x.id === state.runningSessionId)
    if (evtType === 'tool.started') {
      const input = extractStreamValue(evt, ['input', 'args', 'arguments', 'parameters', 'params', 'data'])
      state.liveTools.push({
        id: evt.toolCallId || evt.tool_call_id || uid(),
        name: toolName,
        status: 'running',
        preview,
        args: input,
        result: null,
        error: null,
        clientRequestId: state.runningClientRequestId,
        runId: evt.run_id || evt.runId || activeResponseAssembler?.runId || '',
      })
    } else if (evtType === 'tool.completed') {
      const t = state.liveTools.find(x => x.name === toolName && x.status === 'running')
        || [...state.liveTools].reverse().find(x => x.name === toolName)
      if (t) {
        t.status = evt.error ? 'error' : 'done'
        t.preview = evt.error ? (typeof evt.error === 'string' ? evt.error : 'failed') : preview
        t.result = extractStreamValue(evt, ['output', 'result', 'content', 'data', 'response'])
        if (evt.error) t.error = typeof evt.error === 'string' ? evt.error : JSON.stringify(evt.error)
        if (!t.result && t.error) t.result = t.error
        if (!t.args) t.args = extractStreamValue(evt, ['input', 'args', 'arguments', 'parameters', 'params'])
      }
      const returnedMediaPath = attachHermesReturnedMedia(session, state.runningClientRequestId, evt)
      if (returnedMediaPath) {
        void hydrateHermesReturnedMedia(session?.id, state.runningClientRequestId, returnedMediaPath)
      }
    } else if (evtType === 'tool.error') {
      const t = state.liveTools.find(x => x.name === toolName && x.status === 'running')
      if (t) {
        t.status = 'error'
        t.preview = preview || 'failed'
        t.error = evt.error || preview || 'unknown'
        if (!t.result) t.result = t.error
      }
    } else if (evtType === 'tool.progress') {
      const t = state.liveTools.find(x => x.name === toolName && x.status === 'running')
      if (t && preview) t.preview = preview
    }
    recordHermesToolProgress(evtType, toolName, preview, evt)
    recordAssistantExecutionEvent(session, state.runningClientRequestId, evtType, evt)
    notify()
  }

  function completeStreamRun(runSessionId, output = '', clientRequestId = state.runningClientRequestId) {
    const s = state.sessions.find(x => x.id === runSessionId)
    if (!s) { cleanupAfterRun(); return }
      const runTools = dedupeToolEvents([...state.liveTools])
    if (runTools.length && isHermesDebugToolsVisible()) {
      for (const t of runTools) {
        s.messages.push({
          id: uid(),
          role: 'tool',
          content: '',
          timestamp: Date.now(),
          toolName: t.name || t.toolName,
          toolPreview: t.preview || undefined,
          toolArgs: stringifyMaybe(t.args),
          toolResult: stringifyMaybe(t.result ?? t.error),
          toolStatus: t.error ? 'error' : 'done',
          clientRequestId: t.clientRequestId || clientRequestId,
          runId: t.runId || activeResponseAssembler?.runId || '',
        })
      }
    }
    const finalOutput = typeof output === 'string' ? output : ''
    const msg = ensureAssistantMessage(s, clientRequestId)
    if (msg) {
      delete msg.isStreaming
      finalizeAssistantExecutionTrace(msg, 'completed')
      msg.content = chooseHermesFinalOutput({
        session: s,
        current: msg.content,
        finalOutput,
        clientRequestId,
        prompt: currentVisibleUserPrompt(),
        executionTrace: msg.executionTrace,
      })
      msg.content = sanitizeHermesVisibleReply(msg.content)
      if (!msg.content.trim()) msg.content = summarizeToolOnlyReply(runTools) || '这轮没有收到可展示的正文结果。'
      msg.content = normalizeHermesExactShortReply(currentVisibleUserPrompt(), msg.content)
      markHermesExactShortLocalTail(s, currentVisibleUserPrompt())
      msg.content = completeHermesReplyIfNeeded(msg.content, {
        userText: currentVisibleUserPrompt(),
        toolEvents: runTools,
        toolResult: runTools.length > 0,
      })
      applyHermesPromiseOnlyTaskGuard(msg, currentVisibleUserPrompt(), runTools, clientRequestId)
    }
    rememberHermesTaskStatus(s, {
      status: msg?.error ? 'failed' : 'success',
      lastStep: '任务已完成',
      summary: msg?.content || summarizeToolOnlyReply(runTools) || '任务已完成。',
      error: msg?.error || '',
    })
    s.updatedAt = Date.now()
    s.lastActiveAt = Date.now()
    updateSessionTitleFromFirstUser(s)
    persistSessionMessages(s.id)
    persistSessions()
    cleanupAfterRun({ status: msg?.error ? 'failed' : 'success', reason: msg?.error ? 'long-task-no-evidence' : 'run-completed' })
  }

  function replaceStreamOutput(runSessionId, output = '', clientRequestId = state.runningClientRequestId) {
    const finalOutput = typeof output === 'string' ? output : ''
    if (!finalOutput.trim()) return
    const s = state.sessions.find(x => x.id === runSessionId)
    if (!s) return
    const msg = ensureAssistantMessage(s, clientRequestId)
    msg.content = sanitizeHermesVisibleReply(chooseHermesFinalOutput({
      session: s,
      current: msg.content,
      finalOutput,
      clientRequestId,
      prompt: currentVisibleUserPrompt(),
      executionTrace: msg.executionTrace,
    }))
    notify()
  }

  function failStreamRun(runSessionId, err, clientRequestId = state.runningClientRequestId) {
    const s = state.sessions.find(x => x.id === runSessionId)
    if (s) {
      const msg = ensureAssistantMessage(s, clientRequestId)
      delete msg.isStreaming
      recordAssistantExecutionEvent(s, clientRequestId, 'run.failed', { error: err })
      finalizeAssistantExecutionTrace(msg, 'failed')
      msg.content = sanitizeHermesVisibleReply(mapHermesErrorToUserMessage(err || 'unknown error'), currentVisibleUserPrompt())
      rememberHermesTaskStatus(s, {
        status: 'failed',
        lastStep: '任务失败',
        error: mapHermesErrorToUserMessage(err || 'unknown error'),
      })
      persistSessionMessages(s.id)
    }
    cleanupAfterRun({ status: 'failed', reason: 'run-failed', error: err })
  }

  function shouldAcceptStreamEvent(runSessionId) {
    if (!state.streaming || !state.runningClientRequestId) return false
    if (!state.runningSessionId) return true
    return runSessionId === state.runningSessionId
  }

  function handleStreamEvent(runSessionId, evt) {
    const eventType = evt?.event || ''
    const activeRunSessionId = state.runningSessionId || runSessionId
    const effectiveSessionId = adoptBackendSessionId(activeRunSessionId, evt?.session_id || evt?.sessionId || '')
    if (eventType === 'run.started') {
      activeHermesRunId = String(evt?.run_id || evt?.runId || activeResponseAssembler?.runId || '').trim()
      touchHermesRunWatchdog({ sessionId: effectiveSessionId })
      return
    }
    if (!shouldAcceptStreamEvent(effectiveSessionId)) {
      return
    }
    if (activeResponseAssembler && !activeResponseAssembler.matches(evt)) {
      return
    }
    const eventRequestId = state.runningClientRequestId
    touchHermesRunWatchdog({ clientRequestId: eventRequestId, sessionId: effectiveSessionId })
    if (eventType === 'approval.request') {
      setPendingHermesApproval(evt)
    } else if (eventType === 'approval.responded') {
      clearPendingHermesApproval(evt.run_id || evt.runId || '')
      notify()
    } else if (eventType === 'message.delta') {
      const accepted = acceptActiveStreamEvent(evt)
      if (accepted?.text) appendStreamDelta(effectiveSessionId, accepted.text, eventRequestId)
    } else if (eventType === 'tool.started' || eventType === 'tool.completed' || eventType === 'tool.progress' || eventType === 'tool.error') {
      applyStreamToolEvent(evt)
    } else if (eventType === 'reasoning.available' || eventType === 'run.progress') {
      const session = state.sessions.find(x => x.id === effectiveSessionId)
      recordAssistantExecutionEvent(session, eventRequestId, eventType, evt)
      notify()
    } else if (eventType === 'message.final') {
      const accepted = acceptActiveStreamEvent(evt)
      if (!accepted) return
      replaceStreamOutput(effectiveSessionId, accepted.output || evt.output || evt.content || evt.message || '', eventRequestId)
    } else if (eventType === 'run.completed') {
      const accepted = acceptActiveStreamEvent(evt)
      if (!accepted) return
      completeStreamRun(effectiveSessionId, accepted.output || evt.output || '', eventRequestId)
    } else if (eventType === 'run.failed') {
      failStreamRun(effectiveSessionId, evt.error || 'unknown error', eventRequestId)
    }
  }

  function cleanupAfterRun(meta = {}) {
    clearHermesRunTimeoutGuard()
    const completedSessionId = state.runningSessionId
    const s = completedSessionId ? state.sessions.find(x => x.id === completedSessionId) : null
    if (s && meta.status && meta.status !== 'success') {
      rememberHermesTaskStatus(s, {
        status: meta.status,
        reason: meta.reason || '',
        error: meta.error ? mapHermesErrorToUserMessage(meta.error) : '',
        summary: meta.summary || '',
      })
    }
    if (completedSessionId) forceRemoteRefreshIds.add(completedSessionId)
    state.streaming = false
    state.runningSessionId = null
    state.runningClientRequestId = null
    state.pendingAssistantId = null
    state.pendingApproval = null
    state.liveTools = []
    hermesRunRecoveryAttempts = 0
    hermesRunRecoveryInFlight = false
    streamAbortController = null
    activeResponseAssembler = null
    activeHermesRunId = ''
    detachStreamListeners()
    notify()
    refreshSessionsAfterRun()
  }

  function refreshSessionsAfterRun() {
    for (const delay of [350, 1600, 3200]) {
      setTimeout(() => {
        if (!state.streaming) loadSessions().catch(() => {})
      }, delay)
    }
  }

  /**
   * User-triggered cancel of the streaming run.
   *
   * The backend `hermes_agent_run` command doesn't expose a server-side
   * cancel (SSE loop runs to completion), so we:
   *   1. Detach local event listeners — any remaining deltas are ignored.
   *   2. Keep current visible content or write a short cancelled note.
   *   3. Flip `streaming` off so the UI switches the Stop button back to
   *      Send.
   *
   * The server still finishes its run in the background (typically within
   * a few seconds) — on next `refreshActiveMessages` the authoritative
   * server transcript overwrites our local tail, which is fine.
   */
  function stopStreaming() {
    if (!state.streaming) return
    if (streamAbortController) {
      try { streamAbortController.abort() } catch {}
    }
    void stopActiveHermesServerRun('user-stop')
    if (activeResponseAssembler) activeResponseAssembler.abort()
    const s = state.sessions.find(x => x.id === state.runningSessionId) || activeSession()
    if (s) {
      const msg = s.messages.find(m => m.id === state.pendingAssistantId)
      if (msg) {
        delete msg.isStreaming
        msg.content = stripInternalStatusText(msg.content)
        if (!msg.content.trim()) msg.content = '本轮已取消。需要的话，你可以重新发送。'
      }
      // Commit any finished tool calls we already know about so they aren't
      // lost when we detach listeners.
      for (const t of isHermesDebugToolsVisible() ? dedupeToolEvents(state.liveTools) : []) {
        if (t.status === 'done' || t.status === 'error') {
          s.messages.push({
            id: uid(),
            role: 'tool',
            content: '',
            timestamp: Date.now(),
            toolName: t.name || t.toolName,
            toolPreview: t.preview || undefined,
            toolArgs: stringifyMaybe(t.args),
            toolResult: stringifyMaybe(t.result ?? t.error),
            toolStatus: t.error ? 'error' : 'done',
          })
        }
      }
      s.updatedAt = Date.now()
      persistSessionMessages(s.id)
      persistSessions()
    }
    cleanupAfterRun({ status: 'cancelled', reason: 'user-stop' })
  }

  function updateSessionTitleFromFirstUser(s) {
    if (s.workFileName) {
      s.title = s.workFileName
      return
    }
    if (s.title && !isPlaceholderSessionTitle(s.title)) return
    const firstUser = s.messages.find(m => m.role === 'user')
    if (firstUser?.content) {
      const raw = firstUser.content.replace(/\n+/g, ' ').trim()
      s.title = raw.slice(0, 40) + (raw.length > 40 ? '…' : '')
    }
  }

  function stringifyMaybe(val) {
    if (val == null) return undefined
    if (typeof val === 'string') return val
    try { return JSON.stringify(val) } catch { return String(val) }
  }

  function messageTextForHistory(message, role = '') {
    if (!message || message.isStreaming) return ''
    const raw = message.modelContent || message.content || ''
    let text = typeof raw === 'string' ? raw : stringifyMaybe(raw)
    text = String(text || '').trim()
    if (role === 'user') text = stripHermesReplyOnlyDirectiveForHistory(text)
    if (!text && Array.isArray(message.attachments) && message.attachments.length) {
      text = message.attachments
        .map(item => item?.fileName || item?.name || item?.type || item?.category || 'attachment')
        .filter(Boolean)
        .map(name => `[attachment: ${name}]`)
        .join('\n')
    }
    return compactHermesHistoryContentForPrompt(role, text)
  }

  function normalizeHermesHistoryComparableText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  function isSameHermesHistoryText(left = '', right = '') {
    const a = normalizeHermesHistoryComparableText(left)
    const b = normalizeHermesHistoryComparableText(right)
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
  }

  function sanitizeHermesConversationHistoryForRun(history = [], currentInput = '') {
    if (!Array.isArray(history)) return null
    const cleaned = []
    for (const item of history) {
      const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : ''
      const content = String(item?.content || '').trim()
      if (!role || !content) continue
      if (role === 'user' && isSameHermesHistoryText(content, currentInput)) continue
      const prev = cleaned[cleaned.length - 1]
      if (prev?.role === role && isSameHermesHistoryText(prev.content, content)) continue
      cleaned.push({ role, content })
    }
    return cleaned.length ? cleaned : null
  }

  function buildDefaultConversationHistory(session, currentMessageId) {
    const messages = Array.isArray(session?.messages) ? session.messages : []
    const completedTurns = []
    let pendingUser = null

    for (const message of messages) {
      if (!message || message.id === currentMessageId || message.isStreaming) continue
      const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : ''
      if (!role) continue
      const content = messageTextForHistory(message, role)
      if (!content) continue
      if (role === 'user') {
        pendingUser = { role, content }
        continue
      }
      if (!pendingUser) continue
      completedTurns.push([pendingUser, { role, content }])
      pendingUser = null
    }

    const selectedTurns = []
    let totalChars = 0
    for (let i = completedTurns.length - 1; i >= 0 && selectedTurns.length < HISTORY_MAX_TURNS; i -= 1) {
      const turn = completedTurns[i]
      const size = turn[0].content.length + turn[1].content.length
      if (selectedTurns.length && totalChars + size > HISTORY_MAX_CHARS) break
      totalChars += size
      selectedTurns.push(turn)
    }

    const selected = selectedTurns.reverse().flat()
    return sanitizeHermesConversationHistoryForRun(selected, session?.messages?.find(m => m.id === currentMessageId)?.content || '')
  }

  function normalizeAttachments(items = []) {
    if (!Array.isArray(items)) return []
    return items
      .map(item => {
        const category = String(item?.category || item?.type || '').toLowerCase() || 'file'
        const mimeType = item?.mimeType || item?.mediaType || item?.mime || ''
        const content = item?.content || item?.data || ''
        const imageUrl = item?.imageUrl || item?.previewUrl || item?.url || ''
        const mediaPath = item?.mediaPath || item?.savedPath || item?.localPath || item?.filePath || item?.path || ''
        if (!content && !imageUrl && !mediaPath) return null
        return {
          category,
          type: category,
          mimeType,
          fileName: item?.fileName || item?.name || '',
          content,
          imageUrl: item?.imageUrl || '',
          previewUrl: item?.previewUrl || '',
          url: item?.url || '',
          mediaPath: item?.mediaPath || '',
          savedPath: item?.savedPath || '',
          localPath: item?.localPath || '',
          filePath: item?.filePath || '',
          path: item?.path || '',
        }
      })
      .filter(Boolean)
  }

  function envEntriesToObject(entries) {
    const out = {}
    if (!Array.isArray(entries)) return out
    for (const item of entries) {
      if (Array.isArray(item)) out[item[0]] = item[1]
      else if (item && typeof item === 'object') out[item.key || item.name] = item.value
    }
    return out
  }

  async function buildHermesImageCapabilityLocalReply() {
    const settled = await Promise.allSettled([
      api.getEffectiveModelConfig ? api.getEffectiveModelConfig('hermes') : Promise.resolve(null),
      api.hermesReadConfig(),
      api.hermesListProviders(),
      api.hermesSkillsList(),
      api.hermesEnvReadUnmanaged(),
    ])

    const valueAt = (index, fallback) => (
      settled[index]?.status === 'fulfilled' ? settled[index].value : fallback
    )

    const effectiveModelConfig = valueAt(0, {}) || {}
    const hermesConfig = valueAt(1, {}) || {}
    const providersRaw = valueAt(2, [])
    const skillsRaw = valueAt(3, [])
    const envRaw = valueAt(4, [])
    const providers = Array.isArray(providersRaw?.value) ? providersRaw.value : providersRaw
    const skills = Array.isArray(skillsRaw?.value) ? skillsRaw.value : skillsRaw

    const status = buildHermesImageCapabilityStatus({
      effectiveModelConfig,
      hermesConfig,
      providers,
      skills,
      env: envEntriesToObject(envRaw),
    })
    return formatHermesImageCapabilityReply(status)
  }

  async function sendMessage(content, opts = {}) {
    const attachments = normalizeAttachments(opts.attachments || [])
    const rawText = (content || '').trim()
    const imageIntent = detectHermesImageIntent({ text: rawText, attachments })
    const text = rawText || (attachments.length && imageIntent === 'image_understanding' ? '请分析我刚刚上传或粘贴的图片。' : '')
    const runText = (opts.modelContent || text).trim()
    const displayText = (opts.displayContent || text).trim()
    if (!runText && !attachments.length) return
    const clientRequestId = String(opts.clientRequestId || uid())
    const isolateNativeMediaRun = Boolean(opts.isolateNativeMediaRun || isHermesCurrentChatMediaReturnRequest(runText || displayText))
    if (inFlightSendByRequestId.has(clientRequestId)) {
      return inFlightSendByRequestId.get(clientRequestId)
    }
    if (!HERMES_NATIVE_EXECUTION_ONLY && isHermesCollaborationCapabilityQuestion(rawText)) {
      let collabSession = activeSession()
      if (!collabSession) {
        collabSession = createLocalSession({
          title: deriveSessionTitleFromText(displayText || runText || rawText),
          optimistic: false,
          clientRequestId,
        })
      }
      const userMessage = {
        id: `user-${clientRequestId}`,
        role: 'user',
        content: displayText || rawText,
        timestamp: Date.now(),
        clientRequestId,
      }
      if (!collabSession.messages.some(m => m.id === userMessage.id)) {
        collabSession.messages.push(userMessage)
      }
      collabSession.messages.push({
        id: getHermesAssistantMessageId(clientRequestId),
        role: 'assistant',
        content: formatHermesCollaborationCapabilityReply(),
        timestamp: Date.now(),
        clientRequestId,
      })
      updateSessionTitleFromFirstUser(collabSession)
      collabSession.updatedAt = Date.now()
      collabSession.lastActiveAt = Date.now()
      persistActiveMessages()
      persistSessions()
      notify()
      visibleUserPromptByRequestId.delete(clientRequestId)
      return Promise.resolve({ status: 'success', reason: 'collaboration-capability-answer' })
    }
    if (!HERMES_NATIVE_EXECUTION_ONLY && isHermesImageCapabilityQuestion(rawText)) {
      let imageCapabilitySession = activeSession()
      if (!imageCapabilitySession) {
        imageCapabilitySession = createLocalSession({
          title: deriveSessionTitleFromText(displayText || runText || rawText),
          optimistic: false,
          clientRequestId,
        })
      }
      const userMessage = {
        id: `user-${clientRequestId}`,
        role: 'user',
        content: displayText || rawText,
        timestamp: Date.now(),
        clientRequestId,
      }
      if (!imageCapabilitySession.messages.some(m => m.id === userMessage.id)) {
        imageCapabilitySession.messages.push(userMessage)
      }
      let reply = ''
      try {
        reply = await buildHermesImageCapabilityLocalReply()
      } catch {
        reply = formatHermesImageCapabilityReadFailureReply()
      }
      imageCapabilitySession.messages.push({
        id: getHermesAssistantMessageId(clientRequestId),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
        clientRequestId,
      })
      updateSessionTitleFromFirstUser(imageCapabilitySession)
      imageCapabilitySession.updatedAt = Date.now()
      imageCapabilitySession.lastActiveAt = Date.now()
      persistActiveMessages()
      persistSessions()
      notify()
      visibleUserPromptByRequestId.delete(clientRequestId)
      return Promise.resolve({ status: 'success', reason: 'image-capability-check' })
    }
    const memoryCommandReply = handleHermesMemoryCommand(rawText)
    if (!HERMES_NATIVE_EXECUTION_ONLY && memoryCommandReply) {
      const visibleMemoryReply = normalizeHermesExactShortReply(displayText || runText || rawText, memoryCommandReply)
      let memorySession = activeSession()
      if (!memorySession) {
        memorySession = createLocalSession({
          title: deriveSessionTitleFromText(displayText || runText || rawText),
          optimistic: false,
          clientRequestId,
        })
      }
      const userMessage = {
        id: `user-${clientRequestId}`,
        role: 'user',
        content: displayText || rawText,
        timestamp: Date.now(),
        clientRequestId,
      }
      if (!memorySession.messages.some(m => m.id === userMessage.id)) {
        memorySession.messages.push(userMessage)
      }
      memorySession.messages.push({
        id: getHermesAssistantMessageId(clientRequestId),
        role: 'assistant',
        content: visibleMemoryReply,
        timestamp: Date.now(),
        clientRequestId,
      })
      markHermesExactShortLocalTail(memorySession, displayText || runText || rawText)
      updateSessionTitleFromFirstUser(memorySession)
      memorySession.updatedAt = Date.now()
      memorySession.lastActiveAt = Date.now()
      persistActiveMessages()
      persistSessions()
      notify()
      visibleUserPromptByRequestId.delete(clientRequestId)
      return Promise.resolve({ status: 'success', reason: 'memory-command' })
    }
    if (!HERMES_NATIVE_EXECUTION_ONLY && isHermesTaskStatusQuestion(rawText)) {
      let statusSession = activeSession()
      if (!statusSession) {
        statusSession = createLocalSession({
          title: deriveSessionTitleFromText(displayText || runText || rawText),
          optimistic: false,
          clientRequestId,
        })
      }
      const userMessage = {
        id: `user-${clientRequestId}`,
        role: 'user',
        content: displayText || rawText,
        timestamp: Date.now(),
        clientRequestId,
      }
      if (!statusSession.messages.some(m => m.id === userMessage.id)) {
        statusSession.messages.push(userMessage)
      }
      const reply = buildHermesTaskStatusReply(displayText || rawText)
      statusSession.messages.push({
        id: getHermesAssistantMessageId(clientRequestId),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
        clientRequestId,
      })
      updateSessionTitleFromFirstUser(statusSession)
      statusSession.updatedAt = Date.now()
      statusSession.lastActiveAt = Date.now()
      persistActiveMessages()
      persistSessions()
      notify()
      visibleUserPromptByRequestId.delete(clientRequestId)
      return Promise.resolve({ status: 'success', reason: 'status-report' })
    }
    if (state.streaming) {
      await stopActiveHermesServerRun('superseded-by-new-request')
      if (streamAbortController) {
        try { streamAbortController.abort() } catch {}
      }
      if (activeResponseAssembler) activeResponseAssembler.abort()
      state.streaming = false
      state.runningSessionId = null
      state.runningClientRequestId = null
      state.pendingAssistantId = null
      state.liveTools = []
      detachStreamListeners()
    }
    visibleUserPromptByRequestId.set(clientRequestId, displayText || runText)
    let s = activeSession()
    let forceEmptyHistory = false
    if (!s) {
      s = createLocalSession({
        title: deriveSessionTitleFromText(displayText || runText),
        optimistic: true,
        clientRequestId,
      })
    } else {
      forceEmptyHistory = Boolean(s.forceEmptyHistoryOnce)
      touchPendingSession(s, clientRequestId)
      if (isPlaceholderSessionTitle(s.title)) {
        s.title = deriveSessionTitleFromText(displayText || runText)
      }
      if (forceEmptyHistory) s.forceEmptyHistoryOnce = false
    }
    if (getHermesExactShortReplyTarget(displayText || runText)) {
      forceEmptyHistory = true
    }
    // A previous native Hermes turn may have concluded that it cannot attach
    // media. Do not let that stale conclusion become system-like context for
    // an explicit current-chat image return. The current visible and native
    // session stay the same; only this turn's supplied history is empty.
    if (isolateNativeMediaRun) forceEmptyHistory = true

    const userMessage = {
      id: `user-${clientRequestId}`,
      role: 'user',
      content: displayText || text,
      timestamp: Date.now(),
      clientRequestId,
    }
    if (runText !== userMessage.content) userMessage.modelContent = runText
    if (attachments.length) userMessage.attachments = attachments

    // Append user-visible message. modelContent is used only for future context.
    if (!s.messages.some(m => m.id === userMessage.id)) {
      s.messages.push(userMessage)
      userMessageByRequestId.set(clientRequestId, userMessage.id)
    }
    const imageIntentReply = !HERMES_NATIVE_EXECUTION_ONLY && imageIntent === 'ask_clarify'
      ? HERMES_IMAGE_CLARIFY_REPLY
      : !HERMES_NATIVE_EXECUTION_ONLY && imageIntent === 'image_to_image'
        ? HERMES_IMAGE_TO_IMAGE_UNSUPPORTED_REPLY
        : ''
    if (imageIntentReply) {
      s.messages.push({
        id: getHermesAssistantMessageId(clientRequestId),
        role: 'assistant',
        content: imageIntentReply,
        timestamp: Date.now(),
        clientRequestId,
      })
      updateSessionTitleFromFirstUser(s)
      s.updatedAt = Date.now()
      s.lastActiveAt = Date.now()
      persistActiveMessages()
      persistSessions()
      notify()
      visibleUserPromptByRequestId.delete(clientRequestId)
      return
    }
    const assistantMessage = ensureAssistantMessage(s, clientRequestId)
    updateSessionTitleFromFirstUser(s)
    s.updatedAt = Date.now()
    s.lastActiveAt = Date.now()
    persistActiveMessages()
    persistSessions()

    state.streaming = true
    state.runningSessionId = s.id
    state.runningClientRequestId = clientRequestId
    state.liveTools = []
    state.pendingAssistantId = assistantMessage.id
    activeResponseAssembler = new HermesResponseAssembler({ clientRequestId })
    startHermesRunTimeoutGuard({ clientRequestId, sessionId: s.id })
    notify()

    const runPromise = Promise.resolve().then(async () => {
    try {
      if (pendingHermesStopPromise) await pendingHermesStopPromise.promise
      const requestedHistory = Array.isArray(opts.conversationHistory)
        ? sanitizeHermesConversationHistoryForRun(opts.conversationHistory, runText || displayText)
        : buildDefaultConversationHistory(s, userMessage.id)
      // The portable runtime does not reliably persist native Hermes sessions.
      // Supply bounded, completed app turns by default; exact-short prompts
      // remain isolated so old instructions cannot override the latest turn.
      const conversationHistory = forceEmptyHistory ? null : requestedHistory
      const suppliedInstructions = typeof opts.instructions === 'string' ? opts.instructions.trim() : ''
      const currentTurnInstructions = buildHermesCurrentTurnBoundaryInstruction(
        runText || displayText,
        conversationHistory || [],
      )
      const runInstructions = withHermesReplyStyleInstruction(
        [
          suppliedInstructions,
          isolateNativeMediaRun ? HERMES_MEDIA_RETURN_HARD_INSTRUCTION : '',
          currentTurnInstructions,
        ].filter(Boolean).join('\n\n'),
      )
      const nativeSessionId = s.id

      if (isTauriRuntime()) {
        await attachStreamListeners(s.id, clientRequestId)
        await api.hermesAgentRun(runText, nativeSessionId, conversationHistory, runInstructions, attachments, { clientRequestId, agentName: 'hermes' })
      } else {
        streamAbortController = new AbortController()
        await api.hermesAgentRunStream(
          runText,
          nativeSessionId,
          conversationHistory,
          runInstructions,
          attachments,
          (evt) => handleStreamEvent(s.id, evt),
          { signal: streamAbortController.signal, clientRequestId, agentName: 'hermes' },
        )
      }
    } catch (e) {
      if (e?.name === 'AbortError') return
      // A stopped Tauri invoke can fail after a newer turn has started. Do not
      // let that stale SSE error overwrite or clean up the current request.
      if (state.runningClientRequestId !== clientRequestId) {
        return { status: 'stale', reason: 'superseded-run-error' }
      }
      userMessage.status = 'error'
      const friendlyError = mapHermesErrorToUserMessage(e?.message || e)
      assistantMessage.error = friendlyError
      delete assistantMessage.isStreaming
      if (!assistantMessage.content.trim()) assistantMessage.content = sanitizeHermesVisibleReply(friendlyError, displayText || runText)
      rememberHermesTaskStatus(s, {
        status: 'failed',
        lastStep: '任务失败',
        error: friendlyError,
      })
      persistSessionMessages(s.id)
      cleanupAfterRun({ status: 'failed', reason: 'send-error', error: e })
      throw e
    } finally {
      inFlightSendByRequestId.delete(clientRequestId)
      visibleUserPromptByRequestId.delete(clientRequestId)
    }
    })
    inFlightSendByRequestId.set(clientRequestId, runPromise)
    return runPromise
  }

  /** Utility: push an inline assistant message (used by /slash local replies). */
  function pushLocalAssistant(content) {
    const s = activeSession()
    if (!s) return
    s.messages.push({ id: uid(), role: 'assistant', content, timestamp: Date.now() })
    updateSessionTitleFromFirstUser(s)
    s.updatedAt = Date.now()
    persistActiveMessages()
    persistSessions()
    notify()
  }

  function pushLocalAssistantMessage(message = {}) {
    const s = activeSession()
    if (!s) return
    s.messages.push({
      id: message.id || uid(),
      role: 'assistant',
      content: typeof message.content === 'string' ? message.content : '',
      timestamp: message.timestamp || message.createdAt || Date.now(),
      ...message,
    })
    updateSessionTitleFromFirstUser(s)
    s.updatedAt = Date.now()
    persistActiveMessages()
    persistSessions()
    notify()
  }

  function pushLocalUser(content) {
    const s = activeSession()
    if (!s) return
    s.messages.push({ id: uid(), role: 'user', content, timestamp: Date.now() })
    updateSessionTitleFromFirstUser(s)
    s.updatedAt = Date.now()
    persistActiveMessages()
    persistSessions()
    notify()
  }

  function clearActive() {
    const s = activeSession()
    if (!s) return
    s.messages = []
    s.title = ''
    persistActiveMessages()
    persistSessions()
    notify()
  }

  /**
   * Fuzzy search across loaded sessions. Returns up to `limit` hits sorted
   * by match strength. We only search in-memory data (title + cached first
   * user message) — no network round-trip — so this is instant even with
   * hundreds of sessions.
   */
  function searchSessions(query, limit = 20) {
    const q = (query || '').trim()
    if (!q) return []
    const hits = []
    for (const s of state.sessions) {
      const m = fuzzyMatchSession(s, q)
      if (m) hits.push({ session: s, score: m.score, snippet: m.snippet })
    }
    hits.sort((a, b) => b.score - a.score || (b.session.updatedAt || 0) - (a.session.updatedAt || 0))
    return hits.slice(0, limit)
  }

  // ---------- bootstrap ----------

  loadSessionsCache()

  return {
    // readonly state access
    get state() { return state },
    activeSession,
    isSessionLive,
    isSessionStreaming,
    isSessionRecentlyActive,
    groupedSessions,
    subscribe,

    // actions
    loadSessions,
    refreshActiveMessages,
    switchSession,
    newChat,
    createEmptySession,
    deleteSession,
    bulkDeleteSessions,
    renameSession,
    togglePinned,
    toggleCollapsed,
    sendMessage,
    stopStreaming,
    resolvePendingHermesApproval,
    pushLocalAssistant,
    pushLocalAssistantMessage,
    pushLocalUser,
    clearActive,
    searchSessions,
    loadProfiles,
    switchProfile,

    // lifecycle
    detachStreamListeners,
    notifySync,
  }
}

/**
 * Fuzzy score a single session against `query`. Used by `store.searchSessions`.
 * Returns `null` when nothing matches, or `{ score, snippet }` otherwise.
 *
 * Scoring weights:
 *   - title substring hit  → +20 (strongest)
 *   - first-user content   → +10 (with highlight window snippet)
 *   - id prefix            → +5
 *   - model name           → +3
 */
function fuzzyMatchSession(session, query) {
  const q = query.toLowerCase()
  const title = (session.title || '').toLowerCase()
  const model = (session.model || '').toLowerCase()
  const id = session.id.toLowerCase()
  const firstUser = (session.messages || []).find(m => m.role === 'user')?.content || ''
  const preview = firstUser.slice(0, 240).toLowerCase()

  let score = 0
  let snippet = ''
  if (title.includes(q)) { score += 20; snippet = session.title }
  if (preview.includes(q)) {
    const idx = preview.indexOf(q)
    const start = Math.max(0, idx - 20)
    const end = Math.min(preview.length, idx + q.length + 40)
    const raw = firstUser.slice(start, end)
    if (!snippet) snippet = (start > 0 ? '…' : '') + raw + (end < firstUser.length ? '…' : '')
    score += 10
  }
  if (model.includes(q)) score += 3
  if (id.startsWith(q)) score += 5
  return score > 0 ? { score, snippet: snippet || session.title || '(untitled)' } : null
}

// Single-instance singleton (same shape as Pinia).
let _store = null
export function getChatStore() {
  if (!_store) _store = createStore()
  return _store
}
