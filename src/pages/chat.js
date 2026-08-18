/**
 * 聊天页面 - 完整版，对接 OpenClaw Gateway
 * 支持：流式响应、Markdown 渲染、会话管理、Agent 选择、快捷指令
 */
import { api, invalidate, isTauriRuntime } from '../lib/tauri-api.js'
import { stopAgentOnPageClose } from '../lib/agent-lifecycle.js'
import {
  assertAgentReadyBeforeSend,
  getOpenClawGatewayCopy,
  isOpenClawModelConfigRequired,
  normalizeGatewayUiState,
  probeAgentGateway,
  waitForAgentGatewayReady,
} from '../lib/agent-gateway-status.js'
import { navigate } from '../router.js'
import { wsClient, uuid } from '../lib/ws-client.js'
import { renderMarkdown } from '../lib/markdown.js'
import { renderAgentMessageContent, renderAgentMessageContentInto } from '../components/chat/agent-message-content.js'
import { saveMessage, saveMessages, getLocalMessages, clearSessionMessages, isStorageAvailable } from '../lib/message-db.js'
import { toast } from '../components/toast.js'
import { showModal, showConfirm } from '../components/modal.js'
import { icon as svgIcon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'
import { createSpeechPlaybackController, createVoiceInputController, sanitizeSpeechPlaybackText } from '../lib/voice.js'
import { attachAnchoredImageZoom } from '../lib/anchored-image-zoom.js'
import { COLLAB_TARGETS, buildTaskContext, consumePendingDispatch, createTaskDelegate, createTaskProgress, createTaskResult, detectMediaTask, openCollaborationPanel, resolveMediaExecutionTask, setPendingDispatch, updateCollaborationTask } from '../lib/collaboration.js'
import { clipboardHasImage, getUniqueClipboardImageFiles } from '../lib/clipboard-images.js'
import { ocr, formatOcrResult } from '../lib/ocr-service.js'
import { createGenerationTimeoutManager } from '../engines/openclaw/runtime/generation-timeout.js'
import {
  buildOpenClawEcommerceVisibleReply,
  classifyOpenClawEcommerceRequest,
  shouldAnswerOpenClawEcommerceCapability,
} from '../engines/openclaw/lib/openclaw-ecommerce-assist.js'
import { renderScreenshotCard, renderUserConfirmationCard } from '../shared/life-assistant-ui.js'
import { compactChatMessage } from '../shared/compact-chat-policy.js'
import { SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE, sanitizeVisibleReplyForChinese } from '../lib/visible-reply-language.js'
import {
  buildAgentIdentitySystemPrompt,
  getAgentCapabilityIntro,
  getSafeAgentIdentityReply,
  guardAgentIdentityReply,
} from '../shared/agent-identity-guard.js'
import {
  loadModelVoiceConfig,
  modelVoiceInputReady,
  modelVoiceOutputReady,
  synthesizeWithModelVoice,
  transcribeWithModelVoice,
} from '../lib/model-voice.js'

const RENDER_THROTTLE = 16
const STORAGE_SESSION_KEY = 'superclaw-last-session'
const STORAGE_LAST_ACTIVE_SESSION_KEY = 'superclaw-last-active-session'
const STORAGE_MODEL_KEY = 'superclaw-chat-selected-model'
const STORAGE_SIDEBAR_KEY = 'superclaw-chat-sidebar-open'
const STORAGE_SESSION_NAMES_KEY = 'superclaw-chat-session-names'
const STORAGE_SESSION_WORKFILES_KEY = 'superclaw-chat-session-workfiles'
const STORAGE_LOCAL_SESSIONS_KEY = 'superclaw-chat-local-sessions'
const STORAGE_WORKSPACE_PANEL_KEY = 'superclaw-chat-workspace-open'
const OPENCLAW_COMPACT_COLLAPSED_STORAGE_KEY = 'superclaw-openclaw-manual-collapsed-messages'
const OPENCLAW_CHAT_VIEW_SNAPSHOT_STORAGE_KEY = 'superclaw-openclaw-chat-view-snapshots'
const BROWSER_GATEWAY_PORT = 18789
const BROWSER_GATEWAY_TOKEN = 'superclaw-portable-local'
const OPENCLAW_GATEWAY_SEND_READY_TIMEOUT_MS = 30000
const OPENCLAW_EMPTY_REPLY_FALLBACK = 'OpenClaw \u6ca1\u6709\u6536\u5230\u6709\u6548\u56de\u590d\uff0c\u8bf7\u91cd\u8bd5\u6216\u68c0\u67e5\u6a21\u578b\u914d\u7f6e\u3002'
const OPENCLAW_TOOL_ONLY_FALLBACK = '\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210\uff0c\u4f46\u6ca1\u6709\u751f\u6210\u53ef\u5c55\u793a\u7684\u56de\u7b54\u3002'
const OPENCLAW_TOOL_FAILED_FALLBACK = '\u5de5\u5177\u8c03\u7528\u9047\u5230\u95ee\u9898\uff0c\u672a\u751f\u6210\u53ef\u5c55\u793a\u7684\u56de\u7b54\u3002'
const OPENCLAW_ASSISTANT_FAILED_PLACEHOLDER = '[assistant turn failed before producing content]'
const OPENCLAW_IDENTITY_CONTEXT_START = '[OPENCLAW_IDENTITY_CONTEXT]'
const OPENCLAW_IDENTITY_CONTEXT_END = '[/OPENCLAW_IDENTITY_CONTEXT]'
const OPENCLAW_VISIBLE_REPLY_FORMAT_RULE = [
  '\u7528\u6237\u53ef\u89c1\u56de\u590d\u9ed8\u8ba4\u4f7f\u7528\u7b80\u4f53\u4e2d\u6587\uff0c\u5e76\u5c06\u82f1\u6587\u601d\u8003\u8fc7\u7a0b\u6574\u7406\u6210\u4e2d\u6587\u7ed3\u8bba\u3002',
  '\u666e\u901a\u957f\u56de\u590d\u4f7f\u7528\u6e05\u6670\u7684\u6bb5\u843d\u3001\u9879\u76ee\u7b26\u53f7\u548c\u5fc5\u8981\u5c0f\u6807\u9898\uff0c\u53ef\u4ee5\u9002\u5ea6\u4f7f\u7528\u4e0e\u5185\u5bb9\u76f8\u5173\u7684\u8868\u60c5\u7b26\u53f7\u3002',
  '\u4e0d\u8981\u5c55\u793a\u5185\u90e8\u601d\u8003\u3001\u91cd\u590d\u5ba1\u8ba1\u7406\u7531\u3001CAPABILITY_AUDIT_TRIGGER\u3001scratchpad \u6216 The user is asking \u7c7b\u5206\u6790\u8fc7\u7a0b\u3002',
  '\u5982\u679c\u7528\u6237\u8981\u6c42\u7cbe\u786e\u77ed\u56de\u590d\uff0c\u4f8b\u5982\u201c\u53ea\u56de\u590d OK\u201d\uff0c\u5fc5\u987b\u4fdd\u6301\u7cbe\u786e\u77ed\u56de\u590d\uff0c\u4e0d\u8981\u989d\u5916\u7ed3\u6784\u5316\u3002',
].join('\n')
const OPENCLAW_IDENTITY_PRELUDE = [
  buildAgentIdentitySystemPrompt('openclaw'),
  '你是 SuperClaw 里的 OpenClaw。',
  '你的身份是 OpenClaw，是负责浏览器自动化、桌面控制、文件操作、截图、OCR 辅助操作、工作流执行和工具调用的执行 Agent。',
  '用户问你是谁时，先回答你是 OpenClaw；可以简短说明底层模型只是推理引擎，不要把自己说成只是 MiniMax-M3 或只是模型供应商。',
  '不要自称 Hermes 或 Claude Code。',
  SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE,
  OPENCLAW_VISIBLE_REPLY_FORMAT_RULE,
  '需要真实操作时使用已注册工具和 skills，不要用普通聊天文本假装执行。',
].join('\n')
const OPENCLAW_LOCAL_IDENTITY_ANSWER = [
  '我是 OpenClaw，SuperClaw 里的执行智能体。',
  '',
  '- 角色：实时聊天、桌面协助和工具执行助手',
  '- 能力：浏览器、桌面、文件、截图/OCR、工作流执行和工具调用',
  '- 工作方式：先理解任务，再调用合适工具；高风险动作前等待你的确认',
  '- 底层模型：由当前系统配置提供，不作为我的产品身份',
  '',
  '需要我做什么？',
].join('\n')

const COMMANDS = [
  { title: 'chat.cmdSession', commands: [
    { cmd: '/new', desc: 'chat.cmdNewSession', action: 'exec' },
    { cmd: '/reset', desc: 'chat.cmdResetSession', action: 'exec' },
    { cmd: '/stop', desc: 'chat.cmdStopGen', action: 'exec' },
  ]},
  { title: 'chat.cmdModel', commands: [
    { cmd: '/model ', desc: 'chat.cmdSwitchModel', action: 'fill' },
    { cmd: '/model list', desc: 'chat.cmdListModels', action: 'exec' },
    { cmd: '/model status', desc: 'chat.cmdModelStatus', action: 'exec' },
  ]},
  { title: 'chat.cmdThinkMode', commands: [
    { cmd: '/think off', desc: 'chat.cmdThinkOff', action: 'exec' },
    { cmd: '/think low', desc: 'chat.cmdThinkLow', action: 'exec' },
    { cmd: '/think medium', desc: 'chat.cmdThinkMedium', action: 'exec' },
    { cmd: '/think high', desc: 'chat.cmdThinkHigh', action: 'exec' },
  ]},
  { title: 'chat.cmdFastMode', commands: [
    { cmd: '/fast', desc: 'chat.cmdFastToggle', action: 'exec' },
    { cmd: '/fast on', desc: 'chat.cmdFastOn', action: 'exec' },
    { cmd: '/fast off', desc: 'chat.cmdFastOff', action: 'exec' },
  ]},
  { title: 'chat.cmdVerbose', commands: [
    { cmd: '/verbose off', desc: 'chat.cmdVerboseOff', action: 'exec' },
    { cmd: '/verbose low', desc: 'chat.cmdVerboseLow', action: 'exec' },
    { cmd: '/verbose high', desc: 'chat.cmdVerboseHigh', action: 'exec' },
    { cmd: '/reasoning off', desc: 'chat.cmdReasoningOff', action: 'exec' },
    { cmd: '/reasoning low', desc: 'chat.cmdReasoningLow', action: 'exec' },
    { cmd: '/reasoning medium', desc: 'chat.cmdReasoningMedium', action: 'exec' },
    { cmd: '/reasoning high', desc: 'chat.cmdReasoningHigh', action: 'exec' },
  ]},
  { title: 'chat.cmdInfo', commands: [
    { cmd: '/help', desc: 'chat.cmdHelp', action: 'exec' },
    { cmd: '/status', desc: 'chat.cmdStatus', action: 'exec' },
    { cmd: '/context', desc: 'chat.cmdContext', action: 'exec' },
  ]},
]

let _sessionKey = null, _page = null, _messagesEl = null, _textarea = null
let _sendBtn = null, _statusDot = null, _typingEl = null, _scrollBtn = null
let _sessionListEl = null, _cmdPanelEl = null, _attachPreviewEl = null, _fileInputEl = null
let _modelSelectEl = null
let _voiceBtn = null, _voiceInputController = null, _voicePlaybackController = null
let _modelVoiceConfig = null
let _voicePlaybackKey = null
let _voiceRate = Number(localStorage.getItem('superclaw-hermes-voice-rate') || '1') || 1
let _currentAiBubble = null, _currentAiBubbleRequestId = '', _currentAiText = '', _currentAiStreamRawText = '', _currentAiImages = [], _currentAiVideos = [], _currentAiAudios = [], _currentAiFiles = [], _currentAiTools = [], _currentAiTimeline = [], _currentRunId = null
let _isStreaming = false, _isSending = false, _messageQueue = [], _streamStartTime = 0
let _lastRenderTime = 0, _renderPending = false, _lastRenderedAiText = '', _lastHistoryHash = ''
let _autoScrollEnabled = true, _lastScrollTop = 0, _touchStartY = 0, _scrollFrame = null, _scrollForce = false, _scrollPointerActive = false
let _messagesMutationObserver = null, _messageResizeObserver = null

function endOpenClawScrollPointerInteraction() {
  _scrollPointerActive = false
}

function observeOpenClawMessageRowsForResize() {
  if (!_messageResizeObserver || !_messagesEl) return
  _messagesEl.querySelectorAll('.msg, .typing-indicator').forEach(node => {
    if (node.dataset.openclawResizeObserved === 'true') return
    node.dataset.openclawResizeObserved = 'true'
    _messageResizeObserver.observe(node)
  })
}

function bindOpenClawAutoScrollObservers() {
  _messagesMutationObserver?.disconnect()
  _messageResizeObserver?.disconnect()
  _messagesMutationObserver = null
  _messageResizeObserver = null
  if (!_messagesEl) return

  if (typeof ResizeObserver === 'function') {
    _messageResizeObserver = new ResizeObserver(() => scrollToBottom())
  }
  if (typeof MutationObserver === 'function') {
    _messagesMutationObserver = new MutationObserver(() => {
      observeOpenClawMessageRowsForResize()
      scrollToBottom()
    })
    _messagesMutationObserver.observe(_messagesEl, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  }
  observeOpenClawMessageRowsForResize()
}
let _isLoadingHistory = false
let _streamSafetyTimer = null, _unsubEvent = null, _unsubReady = null, _unsubStatus = null, _unsubReconnectStuck = null
let _chatSnapshotLifecycleBound = false
let _seenRunIds = new Set()
let _pageActive = false
let _openClawSidebarActionHandler = null
let _sendInputLocked = false
let _activeClientRequestId = null
let _activeOpenClawUserText = ''
let _activeOpenClawRun = null
let _openClawProgressHistoryTimer = null
let _openClawProgressHistoryInFlight = false
let _initialOpenClawHistoryTimers = []
let _lastSendFingerprint = ''
let _lastSendAt = 0
let _lastVisibleUserText = ''
const _inFlightRequestIds = new Set()
const _activeOpenClawSendFingerprints = new Set()
const _requestFingerprintById = new Map()
const _seenChatEventKeys = new Set()
const _recentAssistantFinals = new Map()
const _renderedMessageKeysBySession = new Map()
const _chatViewSnapshotsBySession = new Map()
const OPENCLAW_SEND_DEDUPE_WINDOW_MS = 1200
const OPENCLAW_FINAL_DEDUPE_WINDOW_MS = 5000
const OPENCLAW_CHAT_VIEW_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const OPENCLAW_CHAT_VIEW_SNAPSHOT_STORAGE_LIMIT = 350000
const OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION = 4
// Native tool turns can take longer than a minute before the model produces
// its final summary. Keep a real hard stop, but do not finalize a healthy
// Gateway run before its configured execution window has had time to finish.
const OPENCLAW_ACTIVE_RUN_WATCHDOG_MS = 5 * 60 * 1000
const OPENCLAW_RUN_TIMEOUT_MS = OPENCLAW_ACTIVE_RUN_WATCHDOG_MS
const _toolEventTimes = new Map()
const _toolEventData = new Map()
const _toolRunIndex = new Map()
const _toolEventSeen = new Set()

function loadOpenClawManualCompactCollapsed() {
  try {
    const raw = localStorage.getItem(OPENCLAW_COMPACT_COLLAPSED_STORAGE_KEY)
    const list = JSON.parse(raw || '[]')
    return new Set(Array.isArray(list) ? list.filter(Boolean).map(String) : [])
  } catch {
    return new Set()
  }
}

function saveOpenClawManualCompactCollapsed(keys) {
  try {
    localStorage.setItem(OPENCLAW_COMPACT_COLLAPSED_STORAGE_KEY, JSON.stringify([...keys]))
  } catch {}
}

function isOpenClawManualCompactCollapsed(key) {
  if (!key) return false
  return loadOpenClawManualCompactCollapsed().has(String(key))
}

function setOpenClawManualCompactCollapsed(key, collapsed) {
  if (!key) return
  const keys = loadOpenClawManualCompactCollapsed()
  if (collapsed) keys.add(String(key))
  else keys.delete(String(key))
  saveOpenClawManualCompactCollapsed(keys)
}
let _errorTimer = null, _lastErrorMsg = null
let _responseWatchdog = null, _postFinalCheck = null
let _ultimateTimer = null, _sendTimestamp = 0, _lastResponseActivityAt = 0
let _generationTimeoutManager = null, _manualStopRequested = false
let _openClawPendingResponse = false, _openClawActiveRequestClosed = true
let _lastOpenClawTransientRecoveryAt = 0
let _openClawTransientRecoveryTimer = null
let _openClawToolFinalRecoveryTimer = null
let _attachments = []
const _openClawMediaDataUrlCache = new Map()
const OPENCLAW_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
const OPENCLAW_DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'json', 'ppt', 'pptx', 'html', 'htm',
])
let _pasteHandler = null
let _hasEverConnected = false
let _openClawGatewayUiState = 'stopped'
let _openClawGatewayProbe = null
let _openClawGatewayError = ''
let _openClawGatewayActionBusy = false
let _openClawGatewayAutoStartPromise = null
let _openClawGatewayConvergenceTimers = []
let _openClawGatewayProgress = 0
let _openClawGatewayLastReadyReason = ''
let _availableModels = []
let _primaryModel = ''
let _selectedModel = ''
let _isApplyingModel = false

// ── 托管 Agent ──
const HOSTED_STATUS = { IDLE: 'idle', RUNNING: 'running', WAITING: 'waiting_reply', PAUSED: 'paused', ERROR: 'error' }
const HOSTED_SESSIONS_KEY = 'superclaw-hosted-agent-sessions'
const HOSTED_SYSTEM_PROMPT = `你是一个托管调度 Agent。你的职责是：根据用户设定的目标，持续引导 OpenClaw AI Agent 完成任务。
规则：
1. 你每一轮只输出一条简洁的指令（1-3 句话），发给 OpenClaw 执行
2. 根据 OpenClaw 的回复评估进展，决定下一步指令
3. 如果任务已完成或无法继续，回复包含"完成"或"停止"来结束循环
4. 不要重复相同的指令，不要输出解释性文字，只输出下一步要执行的指令`
const HOSTED_DEFAULTS = { enabled: false, prompt: '', autoRunAfterTarget: true, stopPolicy: 'self', maxSteps: 50, stepDelayMs: 1200, retryLimit: 2, autoStopMinutes: 0 }
const HOSTED_RUNTIME_DEFAULT = { status: HOSTED_STATUS.IDLE, stepCount: 0, lastRunAt: 0, lastRunId: '', lastError: '', pending: false, errorCount: 0 }
const HOSTED_CONTEXT_MAX = 30
const HOSTED_COMPRESS_THRESHOLD = 20
let _hostedBtn = null, _hostedPanelEl = null, _hostedBadgeEl = null
let _hostedPromptEl = null, _hostedMaxStepsEl = null, _hostedStepDelayEl = null, _hostedRetryLimitEl = null
let _hostedAutoStopEl = null
let _hostedSaveBtn = null, _hostedStopBtn = null, _hostedCloseBtn = null
let _hostedDefaults = null
let _hostedSessionConfig = null
let _hostedBoundSessionKey = null
let _hostedRuntime = { ...HOSTED_RUNTIME_DEFAULT }
let _hostedBusy = false
let _hostedAbort = null
let _hostedLastTargetTs = 0
let _hostedAutoStopTimer = null
let _hostedStartTime = 0
let _workspaceBtn = null, _workspacePanelEl = null, _workspaceAgentBadgeEl = null, _workspaceAgentTitleEl = null
let _workspacePathEl = null, _workspaceCoreListEl = null, _workspaceTreeEl = null, _workspaceCurrentFileEl = null
let _workspaceMetaEl = null, _workspaceEditorEl = null, _workspacePreviewEl = null, _workspaceEmptyEl = null
let _workspaceSaveBtn = null, _workspaceReloadBtn = null, _workspacePreviewBtn = null
let _workspaceInfo = null, _workspaceCoreFiles = [], _workspaceTreeCache = new Map(), _workspaceExpandedDirs = new Set()
let _workspaceCurrentAgentId = 'main', _workspaceCurrentFile = null, _workspacePreviewMode = false, _workspaceDirty = false
let _workspaceLoadedContent = '', _workspaceLoading = false
let _workspaceLoadSeq = 0, _workspaceOpenSeq = 0
let _collabDispatchBusy = false
let _collabDispatchInterval = null
let _collabDispatchStorageHandler = null

export async function render() {
  const page = document.createElement('div')
  page.className = 'page chat-page openclaw-chat'
  page.dataset.agent = 'openclaw'
  _pageActive = true
  _page = page
  if (_openClawSidebarActionHandler) window.removeEventListener('superclaw:openclaw-sidebar-action', _openClawSidebarActionHandler)
  _openClawSidebarActionHandler = event => { void handleOpenClawSidebarAction(event?.detail || {}) }
  window.addEventListener('superclaw:openclaw-sidebar-action', _openClawSidebarActionHandler)

  page.innerHTML = `
    <div class="chat-main">
      <div class="chat-header">
        <div class="chat-status">
          <span class="status-dot" id="chat-status-dot"></span>
          <span class="chat-title" id="chat-title">${t('chat.chatTitle')}</span>
        </div>
        <div class="chat-header-actions">
          <div class="chat-model-group">
            <select class="form-input" id="chat-model-select" style="width:200px;max-width:28vw;padding:6px 10px;font-size:var(--font-size-xs)">
              <option value="">${t('chat.loadingModels')}</option>
            </select>
            <button class="btn btn-sm btn-ghost" id="btn-refresh-models" title="${t('chat.refreshModels')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            </button>
          </div>
          <button class="btn btn-sm btn-ghost chat-workspace-trigger" id="btn-chat-workspace" title="${t('chat.openWorkspace')}">
            ${svgIcon('folder', 16)}
            <span class="chat-workspace-trigger-label">${t('chat.workspace')}</span>
            <span class="chat-workspace-trigger-agent" id="chat-workspace-trigger-agent">main</span>
          </button>
          <button class="btn btn-sm btn-ghost" id="btn-cmd" title="${t('chat.shortcuts')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/></svg>
          </button>
          <button class="btn btn-sm btn-ghost" id="btn-reset-session" title="${t('chat.resetSession')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
          </button>
        </div>
      </div>
      <div class="chat-workspace-panel" id="chat-workspace-panel" style="display:none">
        <div class="chat-workspace-header">
          <div class="chat-workspace-header-copy">
            <div class="chat-workspace-title-row">
              <strong>${t('chat.workspaceFiles')}</strong>
              <span class="chat-workspace-agent-badge" id="chat-workspace-agent-badge">main</span>
            </div>
            <div class="chat-workspace-agent-title" id="chat-workspace-agent-title"></div>
            <div class="chat-workspace-path" id="chat-workspace-path"></div>
          </div>
          <div class="chat-workspace-header-actions">
            <button class="chat-workspace-icon-btn" id="chat-workspace-refresh" title="${t('common.refresh')}">${svgIcon('refresh-cw', 14)}</button>
            <button class="chat-workspace-icon-btn" id="chat-workspace-close" title="${t('common.close')}">${svgIcon('x', 14)}</button>
          </div>
        </div>
        <div class="chat-workspace-body">
          <div class="chat-workspace-sidebar-pane">
            <div class="chat-workspace-section">
              <div class="chat-workspace-section-title">${t('chat.coreFiles')}</div>
              <div class="chat-workspace-core-list" id="chat-workspace-core-list"></div>
            </div>
            <div class="chat-workspace-section">
              <div class="chat-workspace-section-title">${t('chat.workspaceExplorer')}</div>
              <div class="chat-workspace-tree" id="chat-workspace-tree"></div>
            </div>
          </div>
          <div class="chat-workspace-editor-pane">
            <div class="chat-workspace-editor-toolbar">
              <div class="chat-workspace-current-file" id="chat-workspace-current-file">${t('chat.selectWorkspaceFile')}</div>
              <div class="chat-workspace-editor-actions">
                <button class="btn btn-sm btn-ghost" id="chat-workspace-reload" disabled>${svgIcon('refresh-cw', 14)} ${t('chat.reloadWorkspaceFile')}</button>
                <button class="btn btn-sm btn-ghost" id="chat-workspace-preview-toggle" disabled>${svgIcon('eye', 14)} <span id="chat-workspace-preview-label">${t('chat.previewWorkspaceFile')}</span></button>
                <button class="btn btn-sm btn-primary" id="chat-workspace-save" disabled>${t('common.save')}</button>
              </div>
            </div>
            <div class="chat-workspace-editor-meta" id="chat-workspace-editor-meta"></div>
            <textarea class="chat-workspace-editor" id="chat-workspace-editor" spellcheck="false" disabled placeholder="${t('chat.selectWorkspaceFile')}"></textarea>
            <div class="chat-workspace-preview" id="chat-workspace-preview" style="display:none"></div>
            <div class="chat-workspace-empty" id="chat-workspace-empty">${t('chat.workspaceEmptyState')}</div>
          </div>
        </div>
      </div>
      <div class="chat-messages sc-chat-stage" id="chat-messages">
        <div class="typing-indicator" id="typing-indicator" style="display:none">
          <span></span><span></span><span></span>
          <span class="typing-hint"></span>
        </div>
      </div>
      <button class="chat-scroll-btn" id="chat-scroll-btn" style="display:none">↓</button>
      <div class="chat-cmd-panel" id="chat-cmd-panel" style="display:none"></div>
      <div class="chat-attachments-preview" id="chat-attachments-preview" style="display:none"></div>
      <div class="chat-input-area">
        <div class="openclaw-composer-row">
        <input type="file" id="chat-file-input" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.ppt,.pptx" multiple style="display:none">
        <button class="chat-attach-btn" id="chat-attach-btn" title="上传图片或文件">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <button class="chat-voice-btn" id="chat-voice-btn" type="button" title="${t('chat.voiceInput')}" aria-label="${t('chat.voiceInput')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M19 10a7 7 0 0 1-14 0"/><path d="M12 17v4"/><path d="M8 21h8"/></svg>
        </button>
        <div class="chat-input-wrapper">
          <textarea id="chat-input" rows="1" placeholder="${t('chat.inputPlaceholder')}"></textarea>
        </div>
        <button class="chat-send-btn" id="chat-send-btn" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        <button class="chat-hosted-btn btn btn-sm btn-ghost" id="chat-hosted-btn" title="${t('chat.hostedAgent')}">
          <span class="chat-hosted-label">⊕</span>
          <span class="chat-hosted-badge idle" id="chat-hosted-badge">${t('chat.hostedBadge')}</span>
        </button>
      </div>
        </div>
      <div class="hosted-agent-panel" id="hosted-agent-panel" style="display:none">
        <div class="hosted-agent-header">
          <strong>${t('chat.hostedAgent')}</strong>
          <button class="hosted-agent-close" id="hosted-agent-close" title="${t('common.close')}">&times;</button>
        </div>
        <div class="hosted-agent-body">
          <div class="form-group">
            <label class="form-label" style="color:var(--accent);font-weight:600">${t('chat.taskGoal')}</label>
            <textarea class="form-input hosted-agent-prompt" id="hosted-agent-prompt" rows="3" placeholder="${t('chat.taskGoalPlaceholder')}"></textarea>
            <div class="form-hint">${t('chat.hostedHint')}</div>
          </div>
          <div class="ha-slider-group">
            <div class="ha-slider-label">${t('chat.maxReplies')} <span class="ha-slider-val" id="ha-steps-val">50</span></div>
            <input type="range" class="ha-slider" id="hosted-agent-max-steps" min="5" max="205" step="5" value="50">
            <div class="ha-slider-ticks"><span>5</span><span>50</span><span>100</span><span>200</span><span>∞</span></div>
          </div>
          <div class="ha-timer-group">
            <div class="ha-timer-header">
              <span>${t('chat.timerAutoStop')}</span>
              <label class="ha-toggle"><input type="checkbox" id="hosted-agent-timer-on"><span class="ha-toggle-track"></span></label>
            </div>
            <div class="ha-timer-body" id="ha-timer-body" style="display:none">
              <input type="range" class="ha-slider" id="hosted-agent-auto-stop" min="5" max="120" step="5" value="30">
              <div class="ha-slider-ticks"><span>5m</span><span>30m</span><span>60m</span><span>120m</span></div>
              <div class="ha-countdown" id="ha-countdown" style="display:none">
                <div class="ha-countdown-bar"><div class="ha-countdown-fill" id="ha-countdown-fill"></div></div>
                <span class="ha-countdown-text" id="ha-countdown-text">${t('chat.remaining')} --:--</span>
              </div>
            </div>
          </div>
          <input type="hidden" id="hosted-agent-step-delay" value="1200">
          <input type="hidden" id="hosted-agent-retry" value="2">
        </div>
        <div class="hosted-agent-actions">
          <button class="btn btn-primary" id="hosted-agent-save" style="flex:1">${t('chat.startHosted')}</button>
        </div>
        <div class="hosted-agent-footer" id="hosted-agent-status">${t('chat.ready')}</div>
      </div>
      <div class="chat-disconnect-bar" id="chat-disconnect-bar" style="display:none">${t('chat.disconnected')}</div>
      <div class="chat-connect-overlay" id="chat-connect-overlay" style="display:none">
        <div class="chat-connect-card">
          <div class="chat-connect-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>
          </div>
          <div class="chat-connect-title" id="chat-connect-title">正在检查 OpenClaw 状态</div>
          <div class="chat-connect-desc" id="chat-connect-desc">正在确认 Gateway 和模型配置...</div>
          <div class="chat-connect-actions">
            <button class="btn btn-primary btn-sm" id="btn-fix-connect" style="display:none">${t('chat.fixAndReconnect')}</button>
            <!-- HIDDEN: Gateway settings entry is intentionally not exposed in the customer panel. -->
          </div>
          <div class="chat-connect-hint">请稍候，正在读取本地配置。</div>
        </div>
      </div>
    </div>
  `

  _messagesEl = page.querySelector('#chat-messages')
  _textarea = page.querySelector('#chat-input')
  _sendBtn = page.querySelector('#chat-send-btn')
  _statusDot = page.querySelector('#chat-status-dot')
  _typingEl = page.querySelector('#typing-indicator')
  _scrollBtn = page.querySelector('#chat-scroll-btn')
  _sessionListEl = null
  _cmdPanelEl = page.querySelector('#chat-cmd-panel')
  _attachPreviewEl = page.querySelector('#chat-attachments-preview')
  _fileInputEl = page.querySelector('#chat-file-input')
  _modelSelectEl = page.querySelector('#chat-model-select')
  _voiceBtn = page.querySelector('#chat-voice-btn')
  _hostedBtn = page.querySelector('#chat-hosted-btn')
  _hostedBadgeEl = page.querySelector('#chat-hosted-badge')
  bindOpenClawAutoScrollObservers()
  _hostedPanelEl = page.querySelector('#hosted-agent-panel')
  _hostedPromptEl = page.querySelector('#hosted-agent-prompt')
  _hostedMaxStepsEl = page.querySelector('#hosted-agent-max-steps')
  _hostedStepDelayEl = page.querySelector('#hosted-agent-step-delay')
  _hostedRetryLimitEl = page.querySelector('#hosted-agent-retry')
  _hostedAutoStopEl = page.querySelector('#hosted-agent-auto-stop')
  _hostedSaveBtn = page.querySelector('#hosted-agent-save')
  _hostedCloseBtn = page.querySelector('#hosted-agent-close')
  _workspaceBtn = page.querySelector('#btn-chat-workspace')
  _workspacePanelEl = page.querySelector('#chat-workspace-panel')
  _workspaceAgentBadgeEl = page.querySelector('#chat-workspace-agent-badge')
  _workspaceAgentTitleEl = page.querySelector('#chat-workspace-agent-title')
  _workspacePathEl = page.querySelector('#chat-workspace-path')
  _workspaceCoreListEl = page.querySelector('#chat-workspace-core-list')
  _workspaceTreeEl = page.querySelector('#chat-workspace-tree')
  _workspaceCurrentFileEl = page.querySelector('#chat-workspace-current-file')
  _workspaceMetaEl = page.querySelector('#chat-workspace-editor-meta')
  _workspaceEditorEl = page.querySelector('#chat-workspace-editor')
  _workspacePreviewEl = page.querySelector('#chat-workspace-preview')
  _workspaceEmptyEl = page.querySelector('#chat-workspace-empty')
  _workspaceSaveBtn = page.querySelector('#chat-workspace-save')
  _workspaceReloadBtn = page.querySelector('#chat-workspace-reload')
  _workspacePreviewBtn = page.querySelector('#chat-workspace-preview-toggle')
  const snapshotSessionKey = resolveGatewaySessionKey(
    // `superclaw-last-active-session` is updated only when the user opens a
    // conversation. The local-session list can also be touched by background
    // collaboration work, so it must not replace the conversation the user
    // was actually viewing when the app was closed or the Gateway reconnects.
    localStorage.getItem(STORAGE_LAST_ACTIVE_SESSION_KEY) ||
    localStorage.getItem(STORAGE_SESSION_KEY) ||
    getMostRecentLocalSessionKey() ||
    wsClient.sessionKey || ''
  )
  if (snapshotSessionKey) {
    // The DOM snapshot is optional, but the selected session is not. Keep the
    // saved key even when sessionStorage was cleared by an app restart, so the
    // Gateway ready callback loads that conversation rather than main.
    _sessionKey = snapshotSessionKey
    restoreOpenClawChatSnapshot(snapshotSessionKey, 'render')
  }
  bindOpenClawChatSnapshotLifecycle()
  bindEvents(page)
  try {
    const pendingAction = sessionStorage.getItem('superclaw-openclaw-sidebar-action')
    if (pendingAction) {
      sessionStorage.removeItem('superclaw-openclaw-sidebar-action')
      void handleOpenClawSidebarAction(JSON.parse(pendingAction))
    }
  } catch {}
  setupVoiceControls()
  bindConnectOverlay(page)
  const workspaceOpen = getWorkspacePanelOpen()
  applyWorkspacePanelVisibility(workspaceOpen)
  if (!workspaceOpen) syncWorkspaceContext(false)

  // 首次使用引导提示
  showPageGuide(_messagesEl)

  loadHostedDefaults().then(() => { loadHostedSessionConfig(); renderHostedPanel(); updateHostedBadge() })
  loadModelOptions()
  // The native registry is available before Gateway finishes its handshake.
  // Populate the sidebar immediately so a restart never looks like all
  // conversations disappeared while the service is still coming online.
  refreshSessionList()
  // The portable JSONL is the durable source of truth. Start rendering the
  // selected conversation immediately instead of waiting for the Gateway;
  // this keeps the active chat visible during a slow service startup.
  if (snapshotSessionKey) void loadHistory(snapshotSessionKey)
  // 非阻塞：先返回 DOM，后台连接 Gateway
  startCollaborationDispatchWatcher()
  scheduleOpenClawGatewayUiConvergence('render')
  return page
}

const GUIDE_KEY = 'superclaw-guide-chat-dismissed'

function showPageGuide(container) {
  if (localStorage.getItem(GUIDE_KEY)) return
  if (!container || container.querySelector('.chat-page-guide')) return
  const guide = document.createElement('div')
  guide.className = 'chat-page-guide'
  guide.innerHTML = `
    <div class="chat-guide-inner">
      <div class="chat-guide-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </div>
      <div class="chat-guide-content">
        <b>${t('chat.guideTitle')}</b>
        <p>${t('chat.guideDesc')}</p>
      </div>
      <button class="chat-guide-close" title="${t('chat.guideClose')}">&times;</button>
    </div>
  `
  guide.querySelector('.chat-guide-close').onclick = () => {
    localStorage.setItem(GUIDE_KEY, '1')
    guide.remove()
  }
  container.insertBefore(guide, container.firstChild)
}

// ── 事件绑定 ──

function applyVoiceButtonState(state) {
  if (!_voiceBtn) return
  const listening = state === 'recording' || state === 'requesting' || state === 'stopping'
  _voiceBtn.classList.toggle('is-listening', listening)
  _voiceBtn.title = listening ? t('chat.voiceListening') : t('chat.voiceInput')
  _voiceBtn.setAttribute('aria-label', _voiceBtn.title)
}

function syncVoiceDraft(text) {
  if (!_textarea) return
  _textarea.value = text || ''
  _textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

function syncMessageVoiceButtons(activeKey = _voicePlaybackKey) {
  _voicePlaybackKey = activeKey || null
  _messagesEl?.querySelectorAll('.msg-voice-btn').forEach((btn) => {
    const active = !!_voicePlaybackKey && btn.dataset.voiceKey === _voicePlaybackKey
    btn.classList.toggle('is-speaking', active)
    const label = btn.querySelector('.msg-voice-label')
    if (label) label.textContent = active ? '停止' : '朗读'
    btn.title = active ? t('chat.voiceStopSpeak') : t('chat.voiceSpeak')
    btn.setAttribute('aria-label', btn.title)
  })
}

function persistOpenClawVoiceRate(nextRate) {
  const parsed = Number(nextRate)
  _voiceRate = Number.isFinite(parsed) ? Math.min(2, Math.max(0.75, parsed)) : 1
  localStorage.setItem('superclaw-hermes-voice-rate', String(_voiceRate))
  _voicePlaybackController?.setRate(_voiceRate)
  _messagesEl?.querySelectorAll('.openclaw-read-rate').forEach((select) => {
    if (Math.abs(Number(select.value) - _voiceRate) > 0.001) select.value = String(_voiceRate)
  })
}

function setupVoiceControls() {
  _voiceInputController?.destroy()
  _voicePlaybackController?.destroy()
  loadModelVoiceConfig({ force: true }).then(config => { _modelVoiceConfig = config }).catch(() => {})
  _voiceInputController = createVoiceInputController({
    button: _voiceBtn,
    getLanguage: () => _modelVoiceConfig?.input?.language || navigator.language || 'zh-CN',
    useModelInput: () => modelVoiceInputReady(_modelVoiceConfig),
    transcribeAudio: async (payload) => {
      const result = await transcribeWithModelVoice(payload)
      return result?.text || ''
    },
    onStateChange: (state) => {
      applyVoiceButtonState(state)
      if (state === 'requesting') toast(t('chat.voiceProcessing'), 'info')
    },
    onInterimText: (text) => syncVoiceDraft(text),
    onFinalText: (text) => {
      syncVoiceDraft(text)
      if (text && text.trim()) toast('语音已写入输入框，可修改后发送', 'success')
    },
    onUnsupported: () => toast(t('chat.voiceUnsupported'), 'warning'),
    onError: (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'denied') toast(t('chat.voiceDenied'), 'warning')
      else if (code === 'no-speech') toast(t('chat.voiceNoSpeech'), 'warning')
      else if (code && code !== 'aborted') toast(`${t('chat.voiceUnsupported')}: ${code}`, 'warning')
    },
  })
  _voicePlaybackController = createSpeechPlaybackController({
    synthesizeAudio: async ({ text }) => {
      if (!modelVoiceOutputReady(_modelVoiceConfig)) return null
      return synthesizeWithModelVoice({
        text,
        voice: _modelVoiceConfig?.output?.voice,
        format: _modelVoiceConfig?.output?.format,
      })
    },
    onStateChange: (activeKey) => {
      syncMessageVoiceButtons(activeKey)
    },
  })
  applyVoiceButtonState('idle')
}

function bindEvents(page) {
  if (_modelSelectEl) {
    _modelSelectEl.addEventListener('change', () => {
      _selectedModel = _modelSelectEl.value
      if (_selectedModel) localStorage.setItem(STORAGE_MODEL_KEY, _selectedModel)
      else localStorage.removeItem(STORAGE_MODEL_KEY)
      applySelectedModel()
    })
  }

  _textarea.addEventListener('input', () => {
    _textarea.style.height = 'auto'
    _textarea.style.height = Math.min(_textarea.scrollHeight, 150) + 'px'
    updateSendState()
    // 输入 / 时显示指令面板
    if (_textarea.value === '/') showCmdPanel()
    else if (!_textarea.value.startsWith('/')) hideCmdPanel()
  })

  _textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) sendMessage(e)
    if (e.key === 'Escape') hideCmdPanel()
  })

  _sendBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (_isStreaming) stopGeneration()
    else sendMessage(e)
  })

  if (_hostedBtn) _hostedBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHostedPanel() })
  if (_hostedCloseBtn) _hostedCloseBtn.addEventListener('click', () => hideHostedPanel())
  if (_hostedSaveBtn) _hostedSaveBtn.addEventListener('click', () => toggleHostedRun())
  // 滑块实时值显示
  if (_hostedMaxStepsEl) _hostedMaxStepsEl.addEventListener('input', () => {
    const valEl = page.querySelector('#ha-steps-val')
    if (valEl) valEl.textContent = parseInt(_hostedMaxStepsEl.value) >= 205 ? '∞' : _hostedMaxStepsEl.value
  })
  // 定时器开关
  const timerToggle = page.querySelector('#hosted-agent-timer-on')
  const timerBody = page.querySelector('#ha-timer-body')
  if (timerToggle && timerBody) {
    timerToggle.addEventListener('change', () => { timerBody.style.display = timerToggle.checked ? '' : 'none' })
  }

  page.querySelector('#btn-new-session')?.addEventListener('click', () => showNewSessionDialog())
  if (sessionStorage.getItem('superclaw-openclaw-new-session-request') === '1') {
    sessionStorage.removeItem('superclaw-openclaw-new-session-request')
    setTimeout(() => showNewSessionDialog(), 0)
  }
  page.querySelector('#btn-cmd').addEventListener('click', () => toggleCmdPanel())
  page.querySelector('#btn-reset-session').addEventListener('click', () => resetCurrentSession())
  page.querySelector('#btn-refresh-models')?.addEventListener('click', () => loadModelOptions(true))
  _workspaceBtn?.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (getWorkspacePanelOpen() && _workspaceDirty) {
      const yes = await confirmWorkspaceDiscardIfNeeded()
      if (!yes) return
      discardWorkspaceChanges()
    }
    toggleWorkspacePanel()
  })
  page.querySelector('#chat-workspace-close')?.addEventListener('click', async () => {
    if (_workspaceDirty) {
      const yes = await confirmWorkspaceDiscardIfNeeded()
      if (!yes) return
      discardWorkspaceChanges()
    }
    toggleWorkspacePanel(false)
  })
  page.querySelector('#chat-workspace-refresh')?.addEventListener('click', async () => {
    if (_workspaceDirty) {
      const yes = await confirmWorkspaceDiscardIfNeeded()
      if (!yes) return
      discardWorkspaceChanges()
    }
    loadWorkspacePanelData(true)
  })
  _workspaceCoreListEl?.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-core-path]')
    if (!item) return
    const relativePath = item.dataset.corePath || ''
    if (!relativePath) return
    if (item.dataset.coreExists === '1') await openWorkspaceFile(relativePath, { kind: 'core' })
    else {
      const yes = await confirmWorkspaceDiscardIfNeeded()
      if (!yes) return
      discardWorkspaceChanges()
      prepareWorkspaceDraftFile(relativePath, { kind: 'core' })
    }
  })
  _workspaceTreeEl?.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-tree-toggle]')
    if (toggle) {
      try {
        await toggleWorkspaceDirectory(toggle.dataset.treeToggle || '')
      } catch (err) {
        toast(`${t('chat.workspaceLoadFailed')}: ${err?.message || err}`, 'error')
      }
      return
    }
    const link = e.target.closest('[data-tree-path]')
    if (!link) return
    const relativePath = link.dataset.treePath || ''
    if (!relativePath) return
    if (link.dataset.treeType === 'dir') {
      try {
        await toggleWorkspaceDirectory(relativePath)
      } catch (err) {
        toast(`${t('chat.workspaceLoadFailed')}: ${err?.message || err}`, 'error')
      }
      return
    }
    await openWorkspaceFile(relativePath, { kind: 'tree' })
  })
  _workspaceEditorEl?.addEventListener('input', () => {
    if (!_workspaceCurrentFile || !_workspaceEditorEl) return
    _workspaceDirty = _workspaceEditorEl.value !== _workspaceLoadedContent
    if (_workspacePreviewMode) renderWorkspacePreview()
    updateWorkspaceEditorState()
  })
  _workspaceEditorEl?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      saveWorkspaceCurrentFile()
    }
  })
  _workspaceReloadBtn?.addEventListener('click', () => reloadWorkspaceCurrentFile())
  _workspacePreviewBtn?.addEventListener('click', () => toggleWorkspacePreview())
  _workspaceSaveBtn?.addEventListener('click', () => saveWorkspaceCurrentFile())

  // 文件上传
  page.querySelector('#chat-attach-btn').addEventListener('click', () => _fileInputEl.click())
  _fileInputEl.addEventListener('change', handleFileSelect)
  bindImagePasteHandlers()
  bindOpenClawImageDropHandlers(page)
  // 粘贴图片（Ctrl+V）
  _textarea.addEventListener('paste', handlePaste)

  _messagesEl.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = _messagesEl
    _scrollBtn.style.display = (scrollHeight - scrollTop - clientHeight < 80) ? 'none' : 'flex'
    // Growing streamed content can move scrollTop without user input. Only
    // pause following when an upward move happens during pointer interaction.
    if (_scrollPointerActive && scrollTop < _lastScrollTop - 2) _autoScrollEnabled = false
    if (isAtBottom()) _autoScrollEnabled = true
    _lastScrollTop = scrollTop
  })
  _messagesEl.addEventListener('pointerdown', () => { _scrollPointerActive = true })
  window.addEventListener('pointerup', endOpenClawScrollPointerInteraction)
  window.addEventListener('pointercancel', endOpenClawScrollPointerInteraction)
  _messagesEl.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) _autoScrollEnabled = false
  })
  _messagesEl.addEventListener('wheel', (e) => {
    if (e.deltaY < 0) _autoScrollEnabled = false
  }, { passive: true })
  _messagesEl.addEventListener('touchstart', (e) => {
    _touchStartY = e.touches?.[0]?.clientY || 0
  }, { passive: true })
  _messagesEl.addEventListener('touchmove', (e) => {
    const y = e.touches?.[0]?.clientY || 0
    if (y > _touchStartY + 2) _autoScrollEnabled = false
  }, { passive: true })
  _scrollBtn.addEventListener('click', () => {
    _autoScrollEnabled = true
    scrollToBottom(true)
  })
  _messagesEl.addEventListener('click', async (e) => {
    const voiceBtn = e.target.closest('.msg-voice-btn')
    if (voiceBtn) {
      e.stopPropagation()
      const msgWrap = voiceBtn.closest('.msg')
      const bubble = msgWrap?.querySelector('.msg-bubble .msg-text')
      const text = getOpenClawAssistantContentText(bubble)
      if (!text.trim()) return
      const status = await _voicePlaybackController?.toggleAsync({ key: voiceBtn.dataset.voiceKey, text, lang: 'zh-CN', rate: _voiceRate })
      if (status === 'started') toast(t('chat.voiceFallbackTts'), 'info')
      else if (status === 'unsupported') toast('当前环境不支持文本朗读。', 'warning')
      return
    }
    const rateSelect = e.target.closest('.openclaw-read-rate')
    if (rateSelect) {
      e.stopPropagation()
      persistOpenClawVoiceRate(rateSelect.value)
      return
    }
    const codeCopyBtn = e.target.closest('.agent-message-code-copy')
    if (codeCopyBtn) {
      e.preventDefault()
      e.stopPropagation()
      const code = codeCopyBtn.closest('.agent-message-code-block')?.querySelector('code')
      const copied = await copyText(code?.textContent || '')
      const label = codeCopyBtn.querySelector('.hm-chat-code-copy-label')
      codeCopyBtn.dataset.copyState = copied ? 'success' : 'error'
      if (label) label.textContent = copied ? 'Copied' : 'Failed'
      setTimeout(() => {
        delete codeCopyBtn.dataset.copyState
        if (label) label.textContent = 'Copy'
      }, 1500)
      return
    }
    const copyBtn = e.target.closest('.msg-copy-btn')
    if (copyBtn) {
      e.stopPropagation()
      const msgWrap = copyBtn.closest('.msg')
      const bubble = msgWrap?.querySelector('.msg-bubble')
      if (bubble) {
        const text = getOpenClawAssistantContentText(bubble)
        navigator.clipboard.writeText(text.trim()).then(() => {
          copyBtn.classList.add('copied')
          copyBtn.innerHTML = svgIcon('check', 12)
          setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.innerHTML = svgIcon('copy', 12) }, 1500)
        }).catch(() => {})
      }
      return
    }
    hideCmdPanel()
  })
  _messagesEl.addEventListener('change', (e) => {
    const rateSelect = e.target.closest('.openclaw-read-rate')
    if (!rateSelect) return
    e.stopPropagation()
    persistOpenClawVoiceRate(rateSelect.value)
  })
}

async function loadModelOptions(showToast = false) {
  if (!_modelSelectEl) return
  // 显示加载状态
  _modelSelectEl.innerHTML = `<option value="">${t('chat.loadingModels')}</option>`
  _modelSelectEl.disabled = true
  try {
    invalidate('read_openclaw_config')
    const configPromise = api.readOpenclawConfig()
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout(8s)')), 8000))
    const config = await Promise.race([configPromise, timeoutPromise])
    const providers = config?.models?.providers || {}
    _primaryModel = config?.agents?.defaults?.model?.primary || ''
    const models = []
    const seen = new Set()
    if (_primaryModel) {
      seen.add(_primaryModel)
      models.push(_primaryModel)
    }
    for (const [providerKey, provider] of Object.entries(providers)) {
      for (const item of (provider?.models || [])) {
        const modelId = typeof item === 'string' ? item : item?.id
        if (!modelId) continue
        const full = `${providerKey}/${modelId}`
        if (seen.has(full)) continue
        seen.add(full)
        models.push(full)
      }
    }
    _availableModels = models
    const saved = localStorage.getItem(STORAGE_MODEL_KEY) || ''
    _selectedModel = models.includes(saved) ? saved : (_primaryModel || models[0] || '')
    renderModelSelect()
    if (showToast) toast(`${t('chat.refreshModels')} (${models.length})`, 'success')
  } catch (e) {
    _availableModels = []
    _primaryModel = ''
    _selectedModel = ''
    renderModelSelect(`${t('common.loadFailed')}: ${e.message || e}`)
    if (showToast) toast(`${t('common.loadFailed')}: ${e.message || e}`, 'error')
  }
}

function renderModelSelect(errorText = '') {
  if (!_modelSelectEl) return
  if (!_availableModels.length) {
    _modelSelectEl.innerHTML = `<option value="">${escapeAttr(errorText || t('chat.loadingModels'))}</option>`
    _modelSelectEl.disabled = true
    _modelSelectEl.title = errorText || ''
    return
  }
  _modelSelectEl.disabled = _isApplyingModel
  _modelSelectEl.innerHTML = _availableModels.map(full => {
    const suffix = full === _primaryModel ? ` ${t('chat.defaultSuffix')}` : ''
    return `<option value="${escapeAttr(full)}" ${full === _selectedModel ? 'selected' : ''}>${full}${suffix}</option>`
  }).join('')
  _modelSelectEl.title = _selectedModel || ''
}

function escapeAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function normalizeOpenClawSessionKey(key) {
  const raw = String(key || '').trim()
  if (!raw || raw === 'main') return 'agent:main:main'
  if (raw.startsWith('agent:')) return raw
  return `agent:main:${raw}`
}

function isOpenClawCurrentSessionKey(key) {
  return normalizeOpenClawSessionKey(key) === normalizeOpenClawSessionKey(_sessionKey)
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(text || ''))
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = String(text || '')
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

function buildOpenclawWorkFileMeta(rawName, agentId = 'main', workspaceInfo = null) {
  const spec = cleanWorkFileSpec(rawName)
  if (!spec) return null
  const targetAgent = agentId || 'main'
  const displayRoot = targetAgent === 'main'
    ? '~/.openclaw/workspace'
    : `~/.openclaw/agents/${targetAgent}/workspace`
  const displayPath = `${displayRoot}/${spec.relativePath}`
  const displayDir = spec.relativeDir ? `${displayRoot}/${spec.relativeDir}` : displayRoot
  const workspacePath = workspaceInfo?.workspacePath || workspaceInfo?.path || ''
  const sep = workspacePath.includes('\\') ? '\\' : '/'
  const absolutePath = workspacePath
    ? joinFsPath(sep, workspacePath, ...spec.relativePath.split('/'))
    : displayPath
  const absoluteDir = workspacePath
    ? joinFsPath(sep, workspacePath, ...(spec.relativeDir ? spec.relativeDir.split('/') : []))
    : displayDir
  return {
    title: spec.fileName,
    agentId: targetAgent,
    relativePath: spec.relativePath,
    workFileName: spec.fileName,
    workFilePath: absolutePath,
    workFileDir: absoluteDir,
    workFileDisplayPath: displayPath,
    workFileDisplayDir: displayDir,
  }
}

/** 本地会话别名缓存 */
function getSessionNames() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SESSION_NAMES_KEY) || '{}') } catch { return {} }
}
function setSessionName(key, name) {
  const names = getSessionNames()
  if (name) names[key] = name
  else delete names[key]
  localStorage.setItem(STORAGE_SESSION_NAMES_KEY, JSON.stringify(names))
}
function getDisplayLabel(key) {
  const custom = getSessionNames()[key]
  return custom || parseSessionLabel(key)
}

function getSessionWorkFiles() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SESSION_WORKFILES_KEY) || '{}') } catch { return {} }
}

function setSessionWorkFile(key, meta) {
  if (!key) return
  const data = getSessionWorkFiles()
  if (meta) data[key] = meta
  else delete data[key]
  localStorage.setItem(STORAGE_SESSION_WORKFILES_KEY, JSON.stringify(data))
}

function getSessionWorkFile(key) {
  return getSessionWorkFiles()[key] || null
}

function getLocalSessions() {
  try {
    const rows = JSON.parse(localStorage.getItem(STORAGE_LOCAL_SESSIONS_KEY) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function getMostRecentLocalSessionKey() {
  const rows = getLocalSessions()
    .filter(row => normalizeOpenClawSessionKey(row?.sessionKey || row?.key))
    .sort((a, b) => Number(b?.updatedAt || b?.lastActivity || 0) - Number(a?.updatedAt || a?.lastActivity || 0))
  return normalizeOpenClawSessionKey(rows[0]?.sessionKey || rows[0]?.key || '')
}

function saveLocalSessions(rows) {
  localStorage.setItem(STORAGE_LOCAL_SESSIONS_KEY, JSON.stringify((rows || []).slice(0, 80)))
}

function upsertLocalSession(key, agentId, title) {
  key = normalizeOpenClawSessionKey(key)
  const now = Date.now()
  const rows = getLocalSessions().filter(s => normalizeOpenClawSessionKey(s.sessionKey || s.key) !== key)
  rows.unshift({
    sessionKey: key,
    key,
    agentId: agentId || parseSessionAgent(key) || 'main',
    title: title || parseSessionLabel(key),
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    localOnly: true,
  })
  saveLocalSessions(rows)
}

function removeLocalSession(key) {
  const targetKey = normalizeOpenClawSessionKey(key)
  saveLocalSessions(getLocalSessions().filter(s => normalizeOpenClawSessionKey(s.sessionKey || s.key) !== targetKey))
}

function isLocalSession(key) {
  const targetKey = normalizeOpenClawSessionKey(key)
  return getLocalSessions().some(s => normalizeOpenClawSessionKey(s.sessionKey || s.key) === targetKey)
}

function mergeLocalSessions(remoteSessions) {
  const map = new Map()
  for (const s of getLocalSessions()) {
    const key = normalizeOpenClawSessionKey(s.sessionKey || s.key)
    if (key) map.set(key, s)
  }
  for (const s of remoteSessions || []) {
    const key = normalizeOpenClawSessionKey(s.sessionKey || s.key)
    if (!key) continue
    const local = map.get(key)
    map.set(key, local ? { ...local, ...s, sessionKey: key, key, localOnly: false } : { ...s, sessionKey: key, key })
  }
  return Array.from(map.values())
}

function sessionDisplayTitle(key, fallbackLabel = '') {
  const meta = getSessionWorkFile(key)
  return meta?.workFileName || getDisplayLabel(key) || fallbackLabel || key
}

function sessionDisplayPath(key) {
  const meta = getSessionWorkFile(key)
  return meta?.workFileDisplayPath || meta?.workFilePath || ''
}

function getSidebarOpen() {
  return localStorage.getItem(STORAGE_SIDEBAR_KEY) === '1'
}

function setSidebarOpen(open) {
  localStorage.setItem(STORAGE_SIDEBAR_KEY, open ? '1' : '0')
}

function getWorkspacePanelOpen() {
  return localStorage.getItem(STORAGE_WORKSPACE_PANEL_KEY) === '1'
}

function setWorkspacePanelOpen(open) {
  localStorage.setItem(STORAGE_WORKSPACE_PANEL_KEY, open ? '1' : '0')
}

function formatWorkspaceFileSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatWorkspaceFileTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function isMarkdownWorkspaceFile(relativePath) {
  return /\.(md|markdown|mdx)$/i.test(relativePath || '')
}

async function confirmWorkspaceDiscardIfNeeded() {
  if (!_workspaceDirty) return true
  return showConfirm(t('chat.confirmDiscardWorkspaceChanges'))
}

function discardWorkspaceChanges() {
  if (!_workspaceCurrentFile) {
    _workspaceDirty = false
    updateWorkspaceEditorState()
    return
  }
  if (_workspaceEditorEl) _workspaceEditorEl.value = _workspaceLoadedContent
  _workspaceDirty = false
  if (_workspacePreviewMode) renderWorkspacePreview()
  updateWorkspaceEditorState()
}

function getCurrentWorkspaceAgentId() {
  return parseSessionAgent(_sessionKey) || wsClient.snapshot?.sessionDefaults?.defaultAgentId || 'main'
}

function getWorkspaceAgentTitle() {
  if (_sessionKey) return getDisplayLabel(_sessionKey)
  if (_workspaceCurrentAgentId === 'main') return t('chat.mainSession')
  return _workspaceCurrentAgentId || t('chat.workspace')
}

async function syncWorkspaceContext(reload = true) {
  const nextAgentId = getCurrentWorkspaceAgentId()
  const prevAgentId = _workspaceCurrentAgentId
  _workspaceCurrentAgentId = nextAgentId || 'main'

  const triggerAgentEl = _page?.querySelector('#chat-workspace-trigger-agent')
  if (triggerAgentEl) triggerAgentEl.textContent = _workspaceCurrentAgentId
  if (_workspaceAgentBadgeEl) _workspaceAgentBadgeEl.textContent = _workspaceCurrentAgentId
  if (_workspaceAgentTitleEl) {
    _workspaceAgentTitleEl.textContent = getWorkspaceAgentTitle()
  }

  if (!_workspacePanelEl || !getWorkspacePanelOpen()) return
  if (!reload && prevAgentId === _workspaceCurrentAgentId && _workspaceInfo) return

  if (prevAgentId !== _workspaceCurrentAgentId) {
    _workspaceDirty = false
    _workspaceCurrentFile = null
  }

  await loadWorkspacePanelData(prevAgentId === _workspaceCurrentAgentId)
}

function applyWorkspacePanelVisibility(open) {
  if (!_workspacePanelEl) return
  _workspacePanelEl.style.display = open ? '' : 'none'
  _workspaceBtn?.classList.toggle('is-active', open)
  if (open) syncWorkspaceContext(true)
}

function toggleWorkspacePanel(force) {
  const nextOpen = typeof force === 'boolean' ? force : !getWorkspacePanelOpen()
  setWorkspacePanelOpen(nextOpen)
  applyWorkspacePanelVisibility(nextOpen)
}

function renderWorkspacePanelMeta() {
  if (_workspaceAgentBadgeEl) _workspaceAgentBadgeEl.textContent = _workspaceCurrentAgentId
  if (_workspaceAgentTitleEl) {
    _workspaceAgentTitleEl.textContent = getWorkspaceAgentTitle()
  }
  if (_workspacePathEl) {
    const path = _workspaceInfo?.workspacePath || ''
    _workspacePathEl.textContent = path || t('chat.workspaceUnavailable')
    _workspacePathEl.title = path || ''
  }
}

function renderWorkspaceCoreFiles() {
  if (!_workspaceCoreListEl) return
  if (!_workspaceCoreFiles.length) {
    _workspaceCoreListEl.innerHTML = `<div class="chat-workspace-note">${t('chat.workspaceNoCoreFiles')}</div>`
    return
  }

  _workspaceCoreListEl.innerHTML = _workspaceCoreFiles.map(file => {
    const active = _workspaceCurrentFile?.relativePath === file.name ? ' active' : ''
    const status = file.exists ? t('common.edit') : t('common.add')
    return `
      <button class="chat-workspace-core-item${active}" data-core-path="${escapeAttr(file.name)}" data-core-exists="${file.exists ? '1' : '0'}" title="${escapeAttr(file.path || file.name)}">
        <span class="chat-workspace-core-icon">${svgIcon(file.exists ? 'file-text' : 'file-plain', 14)}</span>
        <span class="chat-workspace-core-copy">
          <span class="chat-workspace-core-name">${escapeAttr(file.name)}</span>
          <span class="chat-workspace-core-status ${file.exists ? 'exists' : 'missing'}">${status}</span>
        </span>
      </button>
    `
  }).join('')
}

function renderWorkspaceTreeNode(entry, depth) {
  const isDir = entry.type === 'dir'
  const expanded = isDir && _workspaceExpandedDirs.has(entry.relativePath)
  const active = _workspaceCurrentFile?.relativePath === entry.relativePath ? ' active' : ''
  const children = expanded
    ? (_workspaceTreeCache.get(entry.relativePath) || []).map(child => renderWorkspaceTreeNode(child, depth + 1)).join('')
    : ''

  return `
    <div class="chat-workspace-tree-node">
      <div class="chat-workspace-tree-row${active}" style="padding-left:${12 + depth * 14}px">
        ${isDir
          ? `<button class="chat-workspace-tree-toggle" data-tree-toggle="${escapeAttr(entry.relativePath)}">${expanded ? '▾' : '▸'}</button>`
          : '<span class="chat-workspace-tree-toggle is-spacer"></span>'}
        <button class="chat-workspace-tree-link" data-tree-path="${escapeAttr(entry.relativePath)}" data-tree-type="${entry.type}" data-tree-editable="${entry.editable ? '1' : '0'}" title="${escapeAttr(entry.relativePath)}">
          ${svgIcon(isDir ? 'folder' : (entry.previewable ? 'file-text' : 'file'), 14)}
          <span class="chat-workspace-tree-name">${escapeAttr(entry.name)}</span>
        </button>
      </div>
      ${children}
    </div>
  `
}

function renderWorkspaceTree() {
  if (!_workspaceTreeEl) return
  const rootEntries = _workspaceTreeCache.get('') || []
  if (!rootEntries.length) {
    _workspaceTreeEl.innerHTML = `<div class="chat-workspace-note">${t('chat.workspaceTreeEmpty')}</div>`
    return
  }
  _workspaceTreeEl.innerHTML = rootEntries.map(entry => renderWorkspaceTreeNode(entry, 0)).join('')
}

function renderWorkspacePreview() {
  if (!_workspacePreviewEl || !_workspaceEditorEl) return
  _workspacePreviewEl.innerHTML = renderMarkdown(_workspaceEditorEl.value || '')
}

function updateWorkspaceEditorState() {
  const hasFile = !!_workspaceCurrentFile
  const canSaveDraft = hasFile && _workspaceCurrentFile?.exists === false
  if (_workspaceCurrentFileEl) {
    _workspaceCurrentFileEl.textContent = hasFile
      ? `${_workspaceCurrentFile.relativePath}${_workspaceDirty ? ' *' : ''}`
      : t('chat.selectWorkspaceFile')
  }
  if (_workspaceSaveBtn) _workspaceSaveBtn.disabled = !hasFile || (!canSaveDraft && !_workspaceDirty) || _workspaceLoading
  if (_workspaceReloadBtn) _workspaceReloadBtn.disabled = !hasFile || _workspaceLoading
  if (_workspacePreviewBtn) _workspacePreviewBtn.disabled = !hasFile || !_workspaceCurrentFile?.previewable || _workspaceLoading
  const previewLabelEl = _page?.querySelector('#chat-workspace-preview-label')
  if (previewLabelEl) previewLabelEl.textContent = _workspacePreviewMode ? t('chat.editWorkspaceFile') : t('chat.previewWorkspaceFile')
  if (_workspaceEditorEl) {
    _workspaceEditorEl.disabled = !hasFile || _workspaceLoading
    _workspaceEditorEl.style.display = hasFile && !_workspacePreviewMode ? '' : 'none'
  }
  if (_workspacePreviewEl) {
    _workspacePreviewEl.style.display = hasFile && _workspacePreviewMode ? '' : 'none'
  }
  if (_workspaceEmptyEl) {
    _workspaceEmptyEl.style.display = hasFile ? 'none' : ''
  }
  if (hasFile && _workspacePreviewMode) renderWorkspacePreview()
}

function resetWorkspaceEditor(emptyText = t('chat.workspaceEmptyState')) {
  _workspaceCurrentFile = null
  _workspacePreviewMode = false
  _workspaceDirty = false
  _workspaceLoadedContent = ''
  if (_workspaceMetaEl) _workspaceMetaEl.textContent = ''
  if (_workspaceEditorEl) {
    _workspaceEditorEl.value = ''
    _workspaceEditorEl.placeholder = t('chat.selectWorkspaceFile')
  }
  if (_workspacePreviewEl) {
    _workspacePreviewEl.innerHTML = ''
    _workspacePreviewEl.style.display = 'none'
  }
  if (_workspaceEmptyEl) _workspaceEmptyEl.textContent = emptyText
  renderWorkspaceCoreFiles()
  renderWorkspaceTree()
  updateWorkspaceEditorState()
}

function prepareWorkspaceDraftFile(relativePath, options = {}) {
  const { kind = 'core', previewable = isMarkdownWorkspaceFile(relativePath) } = options
  _workspaceCurrentFile = { agentId: _workspaceCurrentAgentId, relativePath, kind, previewable, exists: false }
  _workspacePreviewMode = false
  _workspaceDirty = false
  _workspaceLoadedContent = ''
  if (_workspaceEditorEl) {
    _workspaceEditorEl.value = ''
    _workspaceEditorEl.placeholder = t('chat.workspaceDraftHint')
  }
  if (_workspaceMetaEl) _workspaceMetaEl.textContent = t('chat.workspaceDraftHint')
  renderWorkspaceCoreFiles()
  renderWorkspaceTree()
  updateWorkspaceEditorState()
}

async function loadWorkspacePanelData(preserveCurrentFile = false) {
  if (!_workspaceCoreListEl || !_workspaceTreeEl) return
  const loadSeq = ++_workspaceLoadSeq
  const agentId = _workspaceCurrentAgentId || 'main'
  _workspaceLoading = true
  renderWorkspacePanelMeta()
  _workspaceCoreListEl.innerHTML = `<div class="chat-workspace-note">${t('common.loading')}</div>`
  _workspaceTreeEl.innerHTML = `<div class="chat-workspace-note">${t('common.loading')}</div>`
  updateWorkspaceEditorState()

  try {
    const previousFile = preserveCurrentFile ? _workspaceCurrentFile : null
    const [info, coreFiles, rootEntries] = await Promise.all([
      api.getAgentWorkspaceInfo(agentId),
      api.listAgentFiles(agentId),
      api.listAgentWorkspaceEntries(agentId, ''),
    ])

    if (loadSeq !== _workspaceLoadSeq || agentId !== _workspaceCurrentAgentId) return

    _workspaceInfo = info || null
    _workspaceCoreFiles = Array.isArray(coreFiles) ? coreFiles : []
    _workspaceTreeCache = new Map([['', Array.isArray(rootEntries) ? rootEntries : []]])
    _workspaceExpandedDirs = new Set()
    renderWorkspacePanelMeta()
    renderWorkspaceCoreFiles()
    renderWorkspaceTree()

    if (previousFile && previousFile.agentId === agentId) {
      if (previousFile.kind === 'core' && previousFile.exists === false) {
        prepareWorkspaceDraftFile(previousFile.relativePath, previousFile)
      } else {
        await openWorkspaceFile(previousFile.relativePath, { kind: previousFile.kind, force: true, silent: true })
      }
    } else {
      resetWorkspaceEditor(t('chat.workspaceEmptyState'))
    }
  } catch (e) {
    if (loadSeq !== _workspaceLoadSeq || agentId !== _workspaceCurrentAgentId) return
    _workspaceInfo = null
    _workspaceCoreFiles = []
    _workspaceTreeCache = new Map([['', []]])
    _workspaceExpandedDirs = new Set()
    resetWorkspaceEditor(t('chat.workspaceUnavailable'))
    renderWorkspacePanelMeta()
    const message = e?.message || String(e)
    _workspaceCoreListEl.innerHTML = `<div class="chat-workspace-note is-error">${escapeAttr(message)}</div>`
    _workspaceTreeEl.innerHTML = `<div class="chat-workspace-note is-error">${escapeAttr(message)}</div>`
    toast(`${t('chat.workspaceLoadFailed')}: ${message}`, 'error')
  } finally {
    if (loadSeq !== _workspaceLoadSeq) return
    _workspaceLoading = false
    updateWorkspaceEditorState()
  }
}

async function toggleWorkspaceDirectory(relativePath) {
  if (!relativePath) return
  if (_workspaceExpandedDirs.has(relativePath)) {
    _workspaceExpandedDirs.delete(relativePath)
    renderWorkspaceTree()
    return
  }

  try {
    if (!_workspaceTreeCache.has(relativePath)) {
      const entries = await api.listAgentWorkspaceEntries(_workspaceCurrentAgentId, relativePath)
      _workspaceTreeCache.set(relativePath, Array.isArray(entries) ? entries : [])
    }

    _workspaceExpandedDirs.add(relativePath)
    renderWorkspaceTree()
  } catch (e) {
    toast(`${t('common.loadFailed')}: ${e?.message || e}`, 'error')
  }
}

async function openWorkspaceFile(relativePath, options = {}) {
  const { kind = 'tree', force = false, silent = false } = options
  if (!force && !(await confirmWorkspaceDiscardIfNeeded())) return
  const openSeq = ++_workspaceOpenSeq
  const agentId = _workspaceCurrentAgentId

  try {
    const file = await api.readAgentWorkspaceFile(agentId, relativePath)
    if (openSeq !== _workspaceOpenSeq || agentId !== _workspaceCurrentAgentId) return
    _workspaceCurrentFile = {
      agentId,
      relativePath,
      kind,
      previewable: !!file.previewable,
      exists: true,
    }
    _workspaceLoadedContent = file.content || ''
    _workspacePreviewMode = false
    _workspaceDirty = false

    if (_workspaceEditorEl) {
      _workspaceEditorEl.value = _workspaceLoadedContent
      _workspaceEditorEl.placeholder = t('chat.selectWorkspaceFile')
    }

    const metaParts = []
    if (typeof file.size === 'number') metaParts.push(formatWorkspaceFileSize(file.size))
    const timeText = formatWorkspaceFileTime(file.mtime)
    if (timeText) metaParts.push(timeText)
    if (_workspaceMetaEl) _workspaceMetaEl.textContent = metaParts.join(' · ')

    renderWorkspaceCoreFiles()
    renderWorkspaceTree()
    updateWorkspaceEditorState()
  } catch (e) {
    if (openSeq !== _workspaceOpenSeq || agentId !== _workspaceCurrentAgentId) return
    if (!silent) toast(`${t('chat.workspaceOpenFailed')}: ${e?.message || e}`, 'error')
  }
}

async function reloadWorkspaceCurrentFile(force = false) {
  if (!_workspaceCurrentFile) return
  if (!force && !(await confirmWorkspaceDiscardIfNeeded())) return
  if (_workspaceCurrentFile.kind === 'core' && _workspaceCurrentFile.exists === false) {
    prepareWorkspaceDraftFile(_workspaceCurrentFile.relativePath, _workspaceCurrentFile)
    return
  }
  await openWorkspaceFile(_workspaceCurrentFile.relativePath, { kind: _workspaceCurrentFile.kind, force: true })
}

function toggleWorkspacePreview() {
  if (!_workspaceCurrentFile?.previewable) return
  _workspacePreviewMode = !_workspacePreviewMode
  updateWorkspaceEditorState()
}

async function saveWorkspaceCurrentFile() {
  if (!_workspaceCurrentFile || !_workspaceEditorEl) return
  const text = _workspaceEditorEl.value
  const wasExisting = _workspaceCurrentFile.exists !== false
  try {
    await api.writeAgentWorkspaceFile(_workspaceCurrentAgentId, _workspaceCurrentFile.relativePath, text)
    _workspaceCurrentFile = { ..._workspaceCurrentFile, exists: true }
    _workspaceLoadedContent = text
    _workspaceDirty = false
    try {
      await loadWorkspacePanelData(true)
    } catch (refreshError) {
      console.warn('[chat] workspace refresh after save failed:', refreshError)
    }
    toast(wasExisting ? t('common.saveSuccess') : t('chat.workspaceFileCreated'), 'success')
  } catch (e) {
    toast(`${t('common.saveFailed')}: ${e?.message || e}`, 'error')
  }
}

async function applySelectedModel() {
  if (!_selectedModel) {
    toast(t('chat.loadingModels'), 'warning')
    return
  }
  if (!wsClient.gatewayReady || !_sessionKey) {
    toast(t('chat.gatewayNotReadySend'), 'warning')
    return
  }
  _isApplyingModel = true
  renderModelSelect()
  try {
    await wsClient.chatSend(_sessionKey, `/model ${_selectedModel}`)
    toast(`${_selectedModel}`, 'success')
  } catch (e) {
    toast(`${t('chat.sendFailed')}${e.message || e}`, 'error')
  } finally {
    _isApplyingModel = false
    renderModelSelect()
  }
}

// ── 连接引导遮罩 ──

function hasOpenClawGatewayReadySignal(probe) {
  if (!probe) return false
  const status = String(probe.status || probe.state || '').toLowerCase()
  const healthStatus = String(probe.health?.status || probe.healthStatus || '').toLowerCase()
  const healthReady = healthStatus === 'live'
    || healthStatus === 'ready'
    || probe.health?.live === true
    || probe.health?.ready === true
    || probe.healthLive === true
  const portListening = probe.portListening === true || probe.listening === true
  if (probe.needsSetup || status === 'stopped' || status === 'error') return false
  if (probe.error && probe.ready !== true && probe.connected !== true && probe.verified !== true) return false
  return probe.ready === true
    || probe.connected === true
    || probe.verified === true
    || (portListening && healthReady)
    || status === 'ready'
    || status === 'connected'
    || status === 'live'
    || healthReady
}

async function probeOpenClawGatewayHealthForSend() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1800)
  let webError = null
  try {
    const res = await fetch('http://127.0.0.1:18789/health', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
    const status = String(json?.status || json?.state || '').toLowerCase()
    const live = res.ok && (status === 'live' || status === 'ready' || json?.ok === true || json?.ready === true)
    return {
      ready: live,
      connected: live,
      verified: live,
      portListening: true,
      listening: true,
      status: live ? 'live' : 'error',
      healthStatus: status,
      health: json || { status },
      error: live ? null : (json?.error || json?.message || `HTTP ${res.status}`),
    }
  } catch (error) {
    webError = error
  } finally {
    clearTimeout(timer)
  }

  if (isTauriRuntime()) {
    try {
      const services = await api.getServicesStatus()
      const gateway = Array.isArray(services)
        ? services.find(item => item?.label === 'ai.openclaw.gateway') || services[0]
        : null
      const running = gateway?.running === true && gateway?.owned_by_current_instance !== false
      if (running) {
        return {
          ready: true,
          connected: true,
          verified: true,
          portListening: true,
          listening: true,
          status: 'live',
          healthStatus: 'service-running',
          health: { ok: true, status: 'service-running', service: gateway?.label || 'ai.openclaw.gateway' },
          pid: gateway?.pid || null,
          error: null,
        }
      }
      return {
        ready: false,
        connected: false,
        verified: false,
        portListening: Boolean(gateway?.pid),
        listening: Boolean(gateway?.pid),
        status: 'error',
        healthStatus: 'service-stopped',
        error: webError?.message || 'OpenClaw Gateway service is not running',
      }
    } catch (error) {
      webError = error || webError
    }
  }

  return {
    ready: false,
    connected: false,
    verified: false,
    portListening: false,
    listening: false,
    status: 'error',
    healthStatus: 'error',
    error: webError?.message || String(webError || 'OpenClaw Gateway health probe failed'),
  }
}

function clearOpenClawTransientConnectionUi() {
  const bar = document.getElementById('chat-disconnect-bar')
  if (bar) {
    bar.style.display = 'none'
    bar.textContent = ''
  }
  const overlay = document.getElementById('chat-connect-overlay')
  if (overlay) overlay.style.display = 'none'
}

function markOpenClawGatewayReady(reason = 'ready', details = {}) {
  _hasEverConnected = true
  _openClawGatewayLastReadyReason = reason
  setOpenClawGatewayUiState('ready', { ...details, error: '', progress: 100 })
  clearOpenClawTransientConnectionUi()
  // A model save/restart can make Gateway ready while the chat route remains
  // mounted. Re-enter durable history recovery here; relying on a later
  // session switch leaves the page blank until the user performs that switch.
  if (_pageActive && _messagesEl && _sessionKey && countDisplayedChatMessages() === 0) {
    scheduleInitialOpenClawHistoryLoad()
  }
}

function reconcileOpenClawGatewayAfterTransientStatus(reason = 'transient') {
  probeAgentGateway('openclaw', { timeoutMs: 1500 }).then(async probe => {
    if (!_pageActive) return
    if (hasOpenClawGatewayReadySignal(probe)) {
      markOpenClawGatewayReady(`${reason}-probe-ready`, { probe })
      return
    }
    const transientText = `${probe?.error || ''} ${probe?.message || ''}`
    if (_hasEverConnected || isOpenClawGatewayAbortErrorText(transientText)) {
      const health = await probeOpenClawGatewayHealthForSend().catch(() => null)
      if (!_pageActive) return
      if (hasOpenClawGatewayReadySignal(health)) {
        markOpenClawGatewayReady(`${reason}-health-ready`, { probe: health })
        return
      }
    }
    const state = normalizeGatewayUiState(probe)
    setOpenClawGatewayUiState(state, { probe, error: probe?.error || '' })
  }).catch(async error => {
    if (!_pageActive) return
    if (isOpenClawTransientProbeError(error)) {
      const health = await probeOpenClawGatewayHealthForSend().catch(() => null)
      if (!_pageActive) return
      if (hasOpenClawGatewayReadySignal(health)) {
        markOpenClawGatewayReady(`${reason}-health-ready`, { probe: health })
        return
      }
    }
    setOpenClawGatewayUiState(_hasEverConnected ? 'error' : 'checking', {
      error: error?.message || String(error),
    })
  })
}

function setOpenClawGatewayUiState(nextState, details = {}) {
  const requestedState = nextState || 'stopped'
  const readyByProbe = hasOpenClawGatewayReadySignal(details.probe)
  const readyByWs = (requestedState === 'checking' || requestedState === 'starting')
    && wsClient.connected
    && wsClient.gatewayReady
  const detailText = `${details.error || ''} ${details.probe?.error || ''} ${details.probe?.message || ''}`
  const recoverableAbortError = requestedState === 'error'
    && isOpenClawGatewayAbortErrorText(detailText)
    && (wsClient.connected || wsClient.gatewayReady)
  _openClawGatewayUiState = readyByProbe || readyByWs || recoverableAbortError ? 'ready' : requestedState
  if (details.probe) _openClawGatewayProbe = details.probe
  if (_openClawGatewayUiState === 'ready') {
    _hasEverConnected = true
    _openClawGatewayError = ''
  } else if (details.error !== undefined) {
    _openClawGatewayError = details.error || ''
  }
  if (details.progress !== undefined) {
    _openClawGatewayProgress = Math.max(0, Math.min(100, Number(details.progress) || 0))
  } else if (_openClawGatewayUiState === 'starting') {
    _openClawGatewayProgress = Math.max(_openClawGatewayProgress, 20)
  } else if (_openClawGatewayUiState === 'checking') {
    _openClawGatewayProgress = Math.max(_openClawGatewayProgress, 65)
  } else if (_openClawGatewayUiState === 'ready') {
    _openClawGatewayProgress = 100
  } else if (_openClawGatewayUiState === 'stopped' || _openClawGatewayUiState === 'needs_setup' || _openClawGatewayUiState === 'error') {
    _openClawGatewayProgress = 0
  }
  updateOpenClawGatewayUi()
  updateSendState()
}

function updateOpenClawGatewayUi() {
  const detail = _openClawGatewayError || _openClawGatewayProbe?.message || _openClawGatewayProbe?.error || ''
  const copy = getOpenClawGatewayCopy(_openClawGatewayUiState, detail)
  const overlay = document.getElementById('chat-connect-overlay')
  const title = document.getElementById('chat-connect-title')
  const desc = document.getElementById('chat-connect-desc')
  const bar = document.getElementById('chat-disconnect-bar')
  const action = document.getElementById('btn-fix-connect')
  const hint = document.querySelector('.chat-connect-hint')

  const progressSuffix = (_openClawGatewayUiState === 'starting' || _openClawGatewayUiState === 'checking')
    ? `（${Math.max(1, Math.min(99, _openClawGatewayProgress || 1))}%）`
    : ''
  const descText = _openClawGatewayUiState === 'error' && detail
    ? copy.desc
    : `${copy.desc}${progressSuffix}`

  if (title) title.textContent = copy.title
  if (desc) desc.textContent = descText
  if (hint) {
    if (_openClawGatewayUiState === 'stopped') hint.textContent = '点击“启动 Gateway”后，系统会自动检查服务是否真正可用。'
    else if (_openClawGatewayUiState === 'starting' || _openClawGatewayUiState === 'checking') hint.textContent = '正在确认 Gateway 状态，请稍候。'
    else if (_openClawGatewayUiState === 'needs_setup') hint.textContent = '无需登录或激活；请先配置模型服务商和 API Key。'
    else if (_openClawGatewayUiState === 'error') hint.textContent = '请重新启动 Gateway，系统会重新执行可用性检查。'
    else hint.textContent = ''
  }
  if (action) {
    const isModelConfigAction = copy.showModelConfigButton === true
    action.textContent = _openClawGatewayActionBusy && !isModelConfigAction ? '启动中...' : copy.action || '重新检查'
    action.disabled = (_openClawGatewayActionBusy && !isModelConfigAction) || _openClawGatewayUiState === 'ready'
    action.style.display = !_openClawGatewayActionBusy && (copy.showStartButton || copy.showReconnectButton || isModelConfigAction) ? '' : 'none'
  }

  if (_openClawGatewayUiState === 'ready') {
    clearOpenClawTransientConnectionUi()
    updateStatusDot('ready')
    return
  }

  const shouldBlockChat = !_hasEverConnected
    && (_openClawGatewayUiState === 'stopped'
      || _openClawGatewayUiState === 'starting'
      || _openClawGatewayUiState === 'checking'
      || _openClawGatewayUiState === 'needs_setup'
      || _openClawGatewayUiState === 'error')

  if (overlay) overlay.style.display = shouldBlockChat ? 'flex' : 'none'
  if (bar) {
    bar.textContent = `${copy.title} —— ${descText}`
    bar.style.display = 'flex'
  }
  updateStatusDot(_openClawGatewayUiState === 'starting' || _openClawGatewayUiState === 'checking' ? 'connecting' : 'offline')
}

async function refreshOpenClawGatewayUiState() {
  const probe = await probeAgentGateway('openclaw', { timeoutMs: 1800 })
  let effectiveProbe = probe
  let state = hasOpenClawGatewayReadySignal(probe) ? 'ready' : normalizeGatewayUiState(probe)
  if (state !== 'ready' && state !== 'needs_setup') {
    const healthProbe = await probeOpenClawGatewayHealthForSend().catch(() => null)
    if (hasOpenClawGatewayReadySignal(healthProbe)) {
      effectiveProbe = healthProbe
      state = 'ready'
    }
  }
  if (state === 'ready') markOpenClawGatewayReady('dev-status-ready', { probe: effectiveProbe })
  else setOpenClawGatewayUiState(state, { probe, error: probe?.error || '' })
  return effectiveProbe
}

async function finalizeOpenClawProgressReady() {
  setOpenClawGatewayUiState('checking', { error: '', progress: 75 })
  const probe = await waitForAgentGatewayReady('openclaw', { attempts: 14, delayMs: 600, timeoutMs: 2000 })
  let effectiveProbe = probe
  let nextState = hasOpenClawGatewayReadySignal(probe) ? 'ready' : normalizeGatewayUiState(probe)
  if (nextState !== 'ready' && nextState !== 'needs_setup') {
    const healthProbe = await probeOpenClawGatewayHealthForSend().catch(() => null)
    if (hasOpenClawGatewayReadySignal(healthProbe)) {
      effectiveProbe = healthProbe
      nextState = 'ready'
    }
  }
  if (nextState === 'ready') markOpenClawGatewayReady('health-live', { probe: effectiveProbe })
  else setOpenClawGatewayUiState(nextState, { probe, error: probe?.error || '', progress: 85 })
  return { ok: nextState === 'ready', state: nextState, probe: effectiveProbe }
}

async function startOpenClawGateway() {
  if (isTauriRuntime()) {
    await api.startService('ai.openclaw.gateway')
    return { ok: true, agent: 'openclaw', status: 'starting' }
  }

  const res = await fetch('/__api/dev/agents/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent: 'openclaw' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || data.message || data.code || 'OpenClaw Gateway 启动失败')
    err.data = data
    throw err
  }
  return data
}

async function startOrRepairOpenClawGateway() {
  if (_openClawGatewayActionBusy) return false
  _openClawGatewayActionBusy = true
  setOpenClawGatewayUiState('starting', { error: '', progress: 20 })
  try {
    await startOpenClawGateway()
    setOpenClawGatewayUiState('checking', { error: '', progress: 60 })
    const result = await finalizeOpenClawProgressReady()
    if (!result.ok) return false

    wsClient.disconnect()
    await connectGateway({ skipProbe: true })
    await waitForOpenClawGatewayReady(15000)
    markOpenClawGatewayReady('manual-start-ready', { probe: result.probe })
    return true
  } catch (error) {
    const message = error?.message || String(error)
    const state = error?.data?.status === 'needs_setup' ? 'needs_setup' : 'error'
    setOpenClawGatewayUiState(state, { error: message, probe: error?.data?.current || null })
    toast(message, 'error')
    return false
  } finally {
    _openClawGatewayActionBusy = false
    updateOpenClawGatewayUi()
  }
}

function clearOpenClawGatewayUiConvergenceTimers() {
  for (const timer of _openClawGatewayConvergenceTimers) {
    clearTimeout(timer)
  }
  _openClawGatewayConvergenceTimers = []
}

function scheduleOpenClawGatewayUiConvergence(reason = 'render') {
  clearOpenClawGatewayUiConvergenceTimers()
  const pageRef = _page
  const delays = [0, 250, 1000]
  for (const delay of delays) {
    const timer = setTimeout(() => {
      _openClawGatewayConvergenceTimers = _openClawGatewayConvergenceTimers.filter(item => item !== timer)
      if (!_pageActive || _page !== pageRef || !pageRef?.isConnected) return
      ;(async () => {
        const healthProbe = await probeOpenClawGatewayHealthForSend().catch(() => null)
        if (!_pageActive || _page !== pageRef || !pageRef?.isConnected) return
        if (hasOpenClawGatewayReadySignal(healthProbe)) {
          markOpenClawGatewayReady(`${reason}-health-converged-ready`, { probe: healthProbe })
          updateSendState()
          return
        }
        const probe = await probeAgentGateway('openclaw', { timeoutMs: 1800 }).catch(() => null)
        if (!_pageActive || _page !== pageRef || !pageRef?.isConnected) return
        if (hasOpenClawGatewayReadySignal(probe)) {
          markOpenClawGatewayReady(`${reason}-converged-ready`, { probe })
          updateSendState()
          return
        }
        if (delay === 0 && _openClawGatewayUiState !== 'ready') {
          setOpenClawGatewayUiState('checking', { error: '', progress: 5 })
        } else {
          updateOpenClawGatewayUi()
          updateSendState()
        }
        autoStartOpenClawGatewayOnEnter().catch(error => {
          if (!_pageActive || _page !== pageRef || _openClawGatewayUiState === 'ready') return
          setOpenClawGatewayUiState('error', { error: error?.message || String(error) })
        })
      })()
    }, delay)
    _openClawGatewayConvergenceTimers.push(timer)
  }
  _openClawGatewayLastReadyReason = `${reason}-scheduled`
}

async function syncOpenClawModelConfigAndReprobe() {
  // 模型配置可能尚未写入（新注册 / 早退 boot 未执行 sync）：先同步一次再重新探测。
  if (typeof window.__superclaw_sync_default_model_settings === 'function') {
    try {
      await window.__superclaw_sync_default_model_settings()
    } catch (err) {
      console.warn('[chat] needs_setup 模型配置同步失败:', err?.message || err)
    }
  }
  return refreshOpenClawGatewayUiState()
}

async function autoStartOpenClawGatewayOnEnter() {
  if (_openClawGatewayAutoStartPromise) return _openClawGatewayAutoStartPromise
  _openClawGatewayAutoStartPromise = (async () => {
    const probe = await refreshOpenClawGatewayUiState()
    if (!_pageActive) return false
    const state = hasOpenClawGatewayReadySignal(probe) ? 'ready' : normalizeGatewayUiState(probe)
    if (state === 'ready') {
      await connectGateway({ skipProbe: true })
      markOpenClawGatewayReady('auto-enter-ready', { probe })
      return true
    }
    if (state === 'needs_setup') {
      // 同步模型配置后重试，避免新用户因配置未写入而进不了聊天
      const syncedProbe = await syncOpenClawModelConfigAndReprobe()
      if (!_pageActive) return false
      if (hasOpenClawGatewayReadySignal(syncedProbe)) {
        await connectGateway({ skipProbe: true })
        markOpenClawGatewayReady('auto-enter-synced-ready', { probe: syncedProbe })
        return true
      }
      const syncedState = hasOpenClawGatewayReadySignal(syncedProbe) ? 'ready' : normalizeGatewayUiState(syncedProbe)
      if (syncedState === 'needs_setup') return false
      return startOrRepairOpenClawGateway()
    }
    const healthProbe = await probeOpenClawGatewayHealthForSend().catch(() => null)
    if (!_pageActive) return false
    if (hasOpenClawGatewayReadySignal(healthProbe)) {
      await connectGateway({ skipProbe: true })
      markOpenClawGatewayReady('auto-enter-health-ready', { probe: healthProbe })
      return true
    }
    if (state === 'checking') {
      const result = await finalizeOpenClawProgressReady()
      if (!result.ok || !_pageActive) return false
      await connectGateway({ skipProbe: true })
      markOpenClawGatewayReady('auto-enter-finalized', { probe: result.probe })
      return true
    }
    return startOrRepairOpenClawGateway()
  })().finally(() => {
    _openClawGatewayAutoStartPromise = null
  })
  return _openClawGatewayAutoStartPromise
}

// 事件总线兜底：HMR/页面重挂载可能导致 wsClient.onReconnectStuck 订阅丢失，
// 这里在模块级注册一个 window 事件监听，收到「重连卡住」信号就主动拉起 Gateway。
;(function bindOpenClawReconnectStuckWindowFallback() {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  const handler = async (e) => {
    const attempts = e?.detail?.attempts || 0
    if (!_pageActive) return
    // main.js 已在进行全局恢复时，本页不再重复拉起，避免双启动。
    if (window.__superclawGatewayRecovering) return
    window.__superclawGatewayRecovering = true
    try {
      console.log(`[chat] 收到重连卡住事件 (${attempts})，主动尝试拉起 Gateway...`)
      await autoStartOpenClawGatewayOnEnter()
    } catch (err) {
      if (!_pageActive || _openClawGatewayUiState === 'ready') return
      setOpenClawGatewayUiState('error', { error: err?.message || String(err) })
    } finally {
      window.__superclawGatewayRecovering = false
    }
  }
  // 避免 HMR 重复注册：先移除上一次的处理器，再注册新的。
  if (window.__superclawReconnectStuckChatHandler) {
    window.removeEventListener('superclaw:openclaw-reconnect-stuck', window.__superclawReconnectStuckChatHandler)
  }
  window.__superclawReconnectStuckChatHandler = handler
  window.addEventListener('superclaw:openclaw-reconnect-stuck', handler)
})()

function bindConnectOverlay(page) {
  const fixBtn = page.querySelector('#btn-fix-connect')

  if (fixBtn) {
    fixBtn.addEventListener('click', async () => {
      if (_openClawGatewayUiState === 'needs_setup') {
        navigate('/models')
        return
      }
      await startOrRepairOpenClawGateway()
    })
  }
}

// ── 文件上传 ──

async function handleFileSelect(e) {
  const files = Array.from(e.target.files || [])
  await handleOpenClawAttachmentFiles(files)
  _fileInputEl.value = ''
}

async function handlePaste(e) {
  if (!clipboardHasImage(e)) return
  e.preventDefault()
  e.stopImmediatePropagation?.()
  const files = await getUniqueClipboardImageFiles(e)
  await handleOpenClawImageFiles(files, { defaultNamePrefix: 'paste' })
}

async function handleOpenClawImageFiles(files, options = {}) {
  const imageFiles = Array.from(files || [])
  if (!imageFiles.length) return
  for (const file of imageFiles) {
    if (!String(file.type || '').startsWith('image/')) {
      toast(t('chat.imageOnly'), 'warning')
      continue
    }
    if (file.size > OPENCLAW_ATTACHMENT_MAX_BYTES) {
      toast(`${file.name || 'image'} > 20MB`, 'warning')
      continue
    }
    try {
      const attachment = await createOpenClawImageAttachmentFromFile(file, options)
      _attachments.push(attachment)
      renderAttachments()
    } catch (error) {
      console.warn('[OpenClaw] read image failed', error)
      toast(`${t('chat.readFileFailed')} ${file.name || ''}`.trim(), 'error')
    }
  }
  updateSendState()
}

function getOpenClawAttachmentExtension(file = {}) {
  const name = String(file?.name || '')
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return String(match?.[1] || '').toLowerCase()
}

function getOpenClawAttachmentCategory(file = {}) {
  if (String(file?.type || '').startsWith('image/')) return 'image'
  return OPENCLAW_DOCUMENT_EXTENSIONS.has(getOpenClawAttachmentExtension(file)) ? 'document' : ''
}

async function createOpenClawDocumentAttachmentFromFile(file) {
  const content = await fileToBase64(file)
  return normalizeOpenClawAttachment({
    category: 'document',
    type: 'document',
    mimeType: file?.type || 'application/octet-stream',
    fileName: file?.name || `document-${Date.now()}`,
    size: file?.size || 0,
    content,
  })
}

async function handleOpenClawAttachmentFiles(files, options = {}) {
  const candidates = Array.from(files || [])
  if (!candidates.length) return
  for (const file of candidates) {
    const category = getOpenClawAttachmentCategory(file)
    if (!category) {
      toast(`暂不支持附件：${file?.name || '未知文件'}`, 'warning')
      continue
    }
    if (file.size > OPENCLAW_ATTACHMENT_MAX_BYTES) {
      toast(`${file.name || 'file'} > 20MB`, 'warning')
      continue
    }
    try {
      const attachment = category === 'image'
        ? await createOpenClawImageAttachmentFromFile(file, options)
        : await createOpenClawDocumentAttachmentFromFile(file)
      _attachments.push(attachment)
      renderAttachments()
    } catch (error) {
      console.warn('[OpenClaw] read attachment failed', error)
      toast(`${t('chat.readFileFailed')} ${file?.name || ''}`.trim(), 'error')
    }
  }
  updateSendState()
}

function bindImagePasteHandlers() {
  if (_pasteHandler) document.removeEventListener('paste', _pasteHandler, true)
  _pasteHandler = (e) => {
    if (!_pageActive || !_page?.isConnected || !_page.contains(e.target)) return
    if (!clipboardHasImage(e)) return
    handlePaste(e)
  }
  document.addEventListener('paste', _pasteHandler, true)
}

function hasOpenClawAttachmentTransfer(event) {
  const items = Array.from(event?.dataTransfer?.items || [])
  if (items.some(item => item.kind === 'file')) return true
  return Array.from(event?.dataTransfer?.files || []).some(file => getOpenClawAttachmentCategory(file))
}

function setOpenClawDragState(active) {
  _page?.classList?.toggle('openclaw-image-drag-over', !!active)
}

function bindOpenClawImageDropHandlers(page) {
  if (!page) return
  const onDrag = (event) => {
    if (!hasOpenClawAttachmentTransfer(event)) return
    event.preventDefault()
    event.stopPropagation()
    setOpenClawDragState(true)
  }
  const onLeave = (event) => {
    if (event.relatedTarget && page.contains(event.relatedTarget)) return
    setOpenClawDragState(false)
  }
  const onDrop = async (event) => {
    if (!hasOpenClawAttachmentTransfer(event)) return
    event.preventDefault()
    event.stopPropagation()
    setOpenClawDragState(false)
    const files = Array.from(event.dataTransfer?.files || []).filter(file => getOpenClawAttachmentCategory(file))
    await handleOpenClawAttachmentFiles(files, { defaultNamePrefix: 'drop' })
  }
  page.addEventListener('dragenter', onDrag)
  page.addEventListener('dragover', onDrag)
  page.addEventListener('dragleave', onLeave)
  page.addEventListener('drop', onDrop)
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl)
      if (!match) { reject(new Error('invalid data URL')); return }
      resolve(match[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function parseImageDataUrl(dataUrl, fallbackMime = 'image/png') {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''))
  if (!match) return { mimeType: fallbackMime || 'image/png', content: '' }
  return { mimeType: match[1] || fallbackMime || 'image/png', content: match[2] || '' }
}

function isOpenClawWindowsImagePath(value = '') {
  return /^[A-Za-z]:[\\/]/.test(String(value || '').trim())
}

function isOpenClawFileImageUrl(value = '') {
  return /^file:\/\//i.test(String(value || '').trim())
}

function isOpenClawGatewayMediaRoute(value = '') {
  return /^\/api\/chat\/media\/outgoing\//i.test(String(value || '').trim())
}

function isOpenClawSafeImageSrc(value = '') {
  const src = String(value || '').trim()
  if (!src) return false
  if (/^(data:image\/|blob:|https?:\/\/|\/api\/|app:|asset:|tauri:)/i.test(src)) return true
  if (isOpenClawWindowsImagePath(src) || isOpenClawFileImageUrl(src)) return false
  return false
}

function openClawAttachmentMediaPath(att = {}) {
  const candidates = [
    att.generatedMediaPath,
    att.mediaPath,
    att.savedPath,
    att.localPath,
    att.filePath,
    att.path,
    att.imageUrl,
    att.previewUrl,
    att.url,
    att.source?.url,
  ]
  for (const candidate of candidates) {
    const value = String(candidate || '').trim()
    if (!value) continue
    if (isOpenClawGatewayMediaRoute(value)) return value
    if (isOpenClawSafeImageSrc(value)) continue
    if (isOpenClawWindowsImagePath(value) || isOpenClawFileImageUrl(value) || /[\\/][^\\/]+\.(png|jpe?g|webp|gif)$/i.test(value)) {
      return value
    }
  }
  return ''
}

function openClawAttachmentImageSrc(att = {}) {
  const direct = att.imageUrl || att.previewUrl || att.url || att.image_url?.url || att.source?.url || ''
  if (isOpenClawGatewayMediaRoute(direct)) return ''
  if (isOpenClawSafeImageSrc(direct)) return direct
  const data = att.data || att.content || att.source?.data || ''
  if (data) return `data:${att.mimeType || att.mediaType || att.media_type || att.mime || 'image/png'};base64,${data}`
  return ''
}

function normalizeOpenClawAttachment(att = {}) {
  const category = String(att.category || att.type || 'image').toLowerCase()
  const mimeType = att.mimeType || att.mediaType || att.media_type || att.mime || ''
  return {
    category,
    type: category,
    mimeType,
    fileName: att.fileName || att.filename || att.name || '',
    size: att.size || 0,
    content: att.content || att.data || att.source?.data || '',
    imageUrl: att.imageUrl || att.previewUrl || att.url || att.image_url?.url || att.source?.url || '',
    previewUrl: att.previewUrl || '',
    url: att.url || '',
    mediaPath: att.mediaPath || '',
    savedPath: att.savedPath || '',
    localPath: att.localPath || '',
    filePath: att.filePath || '',
    path: att.path || '',
    fallbackMediaPath: att.fallbackMediaPath || '',
    workspaceOutputPath: att.workspaceOutputPath || '',
    generatedMediaPath: att.generatedMediaPath || '',
    createdAt: att.createdAt || new Date().toISOString(),
  }
}

function serializeOpenClawAttachments(attachments = []) {
  return (attachments || [])
    .map(normalizeOpenClawAttachment)
    .filter(att => att.content || att.imageUrl || att.url || openClawAttachmentMediaPath(att))
}

async function createOpenClawImageAttachmentFromFile(file, options = {}) {
  const dataUrl = await fileToDataUrl(file)
  const parsed = parseImageDataUrl(dataUrl, file?.type || 'image/png')
  const imageId = `openclaw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let savedPath = ''
  try {
    savedPath = await api.saveImage(imageId, dataUrl)
  } catch (error) {
    console.warn('[OpenClaw] save image failed, falling back to embedded data URL', error)
  }
  return normalizeOpenClawAttachment({
    category: 'image',
    type: 'image',
    mimeType: parsed.mimeType,
    fileName: file?.name || `${options.defaultNamePrefix || 'image'}-${Date.now()}.png`,
    size: file?.size || 0,
    content: parsed.content,
    imageUrl: dataUrl,
    previewUrl: dataUrl,
    savedPath,
  })
}

function showOpenClawImageLoadError(target) {
  const hint = document.createElement('div')
  hint.className = 'msg-img-error'
  hint.textContent = '图片预览加载失败，请检查文件是否存在。'
  target.replaceWith(hint)
}

function createOpenClawImageElement(att = {}) {
  const normalized = normalizeOpenClawAttachment(att)
  const src = openClawAttachmentImageSrc(normalized)
  const fallbackMediaPath = String(normalized.fallbackMediaPath || '').trim()
  const mediaPath = fallbackMediaPath || openClawAttachmentMediaPath(normalized)
  const img = document.createElement('img')
  img.className = 'msg-img'
  img.alt = normalized.fileName || 'image'
  img.onerror = () => showOpenClawImageLoadError(img)
  img.onclick = () => { if (img.src) showLightbox(img.src) }
  if (src) {
    img.src = src
    return img
  }
  if (!mediaPath) return null

  const wrap = document.createElement('div')
  wrap.className = 'msg-img-loading'
  wrap.textContent = '正在加载图片...'
  img.hidden = true
  wrap.appendChild(img)
  ;(async () => {
    try {
      let dataUrl = _openClawMediaDataUrlCache.get(mediaPath)
      if (!dataUrl) {
        dataUrl = await loadOpenClawMediaDataUrl(normalized, mediaPath)
        _openClawMediaDataUrlCache.set(mediaPath, dataUrl)
      }
      img.src = dataUrl
      img.hidden = false
      wrap.textContent = ''
      wrap.appendChild(img)
    } catch (error) {
      console.warn('[OpenClaw] image load failed', error)
      showOpenClawImageLoadError(wrap)
    }
  })()
  return wrap
}

/**
 * Try every media loader that can resolve a generated OpenClaw image, in
 * priority order, until one succeeds. The same file path may be loadable by
 * only one of the loaders depending on the runtime mode:
 *   - openclaw_load_local_media allows the portable `.openclaw/media` dir and
 *     the generated media output dir (resources/data/generated/media).
 *   - hermes_load_media_image has the broadest allowlist and also covers both
 *     dev (.dev-data/generated/media) and release generated dirs.
 * A single loader failing (e.g. a missing `.openclaw/media` root) must not
 * prevent a valid generated image from rendering.
 */
async function loadOpenClawMediaDataUrl(normalized = {}, mediaPath = '') {
  const seen = new Set()
  const candidates = []
  const push = (fn, key) => {
    if (!key || seen.has(key)) return
    seen.add(key)
    candidates.push(fn)
  }
  if (normalized.generatedMediaPath) {
    push(() => api.loadOpenclawLocalMedia(normalized.generatedMediaPath), `local:${normalized.generatedMediaPath}`)
  }
  if (normalized.fallbackMediaPath) {
    push(() => api.loadOpenclawLocalMedia(normalized.fallbackMediaPath), `local:${normalized.fallbackMediaPath}`)
  }
  if (isOpenClawGatewayMediaRoute(mediaPath)) {
    push(() => api.loadOpenclawGatewayMedia(mediaPath), `gateway:${mediaPath}`)
  }
  if (mediaPath && !isOpenClawGatewayMediaRoute(mediaPath)) {
    push(() => api.loadHermesMediaImage(mediaPath), `hermes:${mediaPath}`)
    push(() => api.loadOpenclawLocalMedia(mediaPath), `local:${mediaPath}`)
  }
  let lastError = null
  for (const candidate of candidates) {
    try {
      const dataUrl = await candidate()
      if (dataUrl) return dataUrl
    } catch (error) {
      lastError = error
      console.warn('[OpenClaw] media loader failed, trying next loader', error)
    }
  }
  throw lastError || new Error('No OpenClaw media loader succeeded')
}

function getOpenClawAttachmentDataUrl(att = {}) {
  const normalized = normalizeOpenClawAttachment(att)
  const content = String(normalized.content || '').trim()
  if (!content) return ''
  if (!isOpenClawPdfAttachment(normalized)) return ''
  return `data:application/pdf;base64,${content}`
}

function isOpenClawPdfAttachment(att = {}) {
  const mime = String(att?.mimeType || att?.mime || '').toLowerCase()
  return mime === 'application/pdf' || getOpenClawAttachmentExtension({ name: att?.fileName || att?.name || '' }) === 'pdf'
}

function extractOpenClawWorkspaceOutputFiles(text = '') {
  const files = []
  const seen = new Set()
  // 匹配 Windows 本地绝对路径文件（任意扩展名，含未知类型），兼容反斜杠/正斜杠。
  // 不再局限于 workspace 目录与已知扩展名白名单：只要 AI 返回了本地文件路径，
  // 就按附件卡片展示（打开/下载）。
  const outputPathPattern = /(?:[a-zA-Z]:[\\/][^\r\n`"<>|]*?\.[A-Za-z0-9]{1,10})(?![A-Za-z0-9\\/.])/g
  for (const match of String(text || '').matchAll(outputPathPattern)) {
    const path = String(match[0] || '').trim()
    if (!path || seen.has(path.toLowerCase())) continue
    seen.add(path.toLowerCase())
    const parts = path.split(/[\\/]/)
    const fileName = parts[parts.length - 1] || 'OpenClaw 输出文件'
    const item = {
      name: fileName,
      fileName,
      mimeType: 'application/octet-stream',
    }
    // workspace 内的输出仍走受控的 workspace 命令；其余本地路径走通用打开/下载。
    if (/\\workspace\\/i.test(path)) item.workspaceOutputPath = path
    else item.localPath = path
    files.push(item)
  }
  return files
}

// The Gateway persists generated image outputs as a portable MEDIA:<path> line
// in the final assistant text. When the injected image-content frame is skipped
// or the short-lived outgoing media URL has already expired, this recovers the
// same image straight from the portable media directory.
function extractOpenClawMediaImagePaths(text = '') {
  const images = []
  const seen = new Set()
  const mediaPattern = /(?:^|\n)\s*MEDIA:\s*(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/gi
  for (const match of String(text || '').matchAll(mediaPattern)) {
    const path = String(match[1] || match[2] || match[3] || '').trim()
    if (!path) continue
    if (!/\.(png|jpe?g|gif|webp)$/i.test(path)) continue
    const key = path.toLowerCase().replace(/\\/g, '/')
    if (seen.has(key)) continue
    seen.add(key)
    const fileName = path.split(/[\\/]/).pop() || 'image'
    images.push({
      mediaType: 'image/png',
      generatedMediaPath: path,
      mediaPath: path,
      fileName,
    })
  }
  return images
}

// History snapshots and final stream frames do not always carry the same
// attachment metadata. The final text remains the portable source of truth
// for workspace outputs, so derive those cards at every assistant render path.
function appendOpenClawOutputFiles(el, files = [], text = '') {
  const provided = Array.isArray(files) ? files : []
  appendFilesToEl(el, [...provided, ...extractOpenClawWorkspaceOutputFiles(text)])
}

function openOpenClawPdfPreview(att = {}) {
  const dataUrl = getOpenClawAttachmentDataUrl(att)
  if (!dataUrl) {
    toast('该 PDF 暂不可预览，但已随本轮任务发送给 OpenClaw。', 'warning')
    return
  }
  document.querySelector('.openclaw-file-preview')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'openclaw-file-preview'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  const panel = document.createElement('div')
  panel.className = 'openclaw-file-preview__panel'
  const title = document.createElement('strong')
  title.textContent = att.fileName || att.name || 'PDF 预览'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'openclaw-file-preview__close'
  close.setAttribute('aria-label', '关闭 PDF 预览')
  close.textContent = '×'
  const frame = document.createElement('iframe')
  frame.className = 'openclaw-file-preview__frame'
  frame.title = title.textContent
  frame.src = dataUrl
  const dismiss = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = event => { if (event.key === 'Escape') dismiss() }
  close.addEventListener('click', dismiss)
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss() })
  document.addEventListener('keydown', onKey)
  panel.append(title, close, frame)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)
}

function createOpenClawFileCard(att = {}, options = {}) {
  const normalized = normalizeOpenClawAttachment(att)
  const card = document.createElement('div')
  card.className = 'msg-file-card sc-document-card'
  const extension = getOpenClawAttachmentExtension({ name: normalized.fileName })
  const documentType = ({ pdf: 'pdf', doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel', csv: 'excel', ppt: 'ppt', pptx: 'ppt', html: 'html', htm: 'html' })[extension] || 'file'
  const icon = document.createElement('span')
  icon.className = `msg-file-icon sc-document-card__type is-${documentType}`
  icon.textContent = ({ pdf: 'PDF', word: 'W', excel: 'X', ppt: 'PPT', html: 'HTML' })[documentType] || 'FILE'
  const info = document.createElement('div')
  info.className = 'msg-file-info'
  const name = document.createElement('span')
  name.className = 'msg-file-name sc-document-card__name'
  name.textContent = normalized.fileName || '附件'
  info.appendChild(name)
  if (normalized.size) {
    const size = document.createElement('span')
    size.className = 'msg-file-size sc-document-card__size'
    size.textContent = formatFileSize(normalized.size)
    info.appendChild(size)
  }
  card.append(icon, info)
  const localOutputPath = normalized.workspaceOutputPath || normalized.generatedMediaPath || normalized.localPath || normalized.filePath || normalized.path
  if (localOutputPath) {
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'msg-file-preview-btn sc-document-card__action'
    open.title = '打开文件'
    open.setAttribute('aria-label', '打开文件')
    open.innerHTML = svgIcon('eye', 14)
    open.addEventListener('click', async event => {
      event.stopPropagation()
      if (!isTauriRuntime()) {
        toast('请在桌面客户端中打开本地输出文件。', 'warning')
        return
      }
      try {
        if (normalized.workspaceOutputPath) await api.openclawOpenWorkspaceOutput(normalized.workspaceOutputPath)
        else await api.assistantOpenPath(localOutputPath)
      } catch (error) {
        toast(`打开文件失败：${error?.message || error}`, 'error')
      }
    })
    const download = document.createElement('button')
    download.type = 'button'
    download.className = 'msg-file-preview-btn sc-document-card__action'
    download.title = '下载文件'
    download.setAttribute('aria-label', '下载文件')
    download.innerHTML = svgIcon('download', 14)
    download.addEventListener('click', async event => {
      event.stopPropagation()
      if (!isTauriRuntime()) {
        toast('请在桌面客户端中导出本地输出文件。', 'warning')
        return
      }
      try {
        const result = normalized.workspaceOutputPath
          ? await api.openclawDownloadWorkspaceOutput(normalized.workspaceOutputPath)
          : await api.assistantDownloadPath(localOutputPath)
        toast(`已保存到下载目录：${result?.fileName || normalized.fileName}`, 'success')
      } catch (error) {
        toast(`下载文件失败：${error?.message || error}`, 'error')
      }
    })
    card.append(open, download)
  }
  if (options.preview !== false && isOpenClawPdfAttachment(normalized)) {
    const preview = document.createElement('button')
    preview.type = 'button'
    preview.className = 'msg-file-preview-btn'
    preview.textContent = '预览 PDF'
    preview.addEventListener('click', event => {
      event.stopPropagation()
      openOpenClawPdfPreview(normalized)
    })
    card.appendChild(preview)
  }
  return card
}

function renderAttachments() {
  if (!_attachPreviewEl) return
  if (!_attachments.length) {
    _attachPreviewEl.style.display = 'none'
    _attachPreviewEl.innerHTML = ''
    return
  }
  _attachPreviewEl.style.display = 'flex'
  _attachPreviewEl.innerHTML = ''
  _attachments.forEach((att, idx) => {
    const item = document.createElement('div')
    item.className = 'chat-attachment-item'
    item.title = att.fileName || 'image'
    const imageEl = String(att.category || att.type || '').toLowerCase() === 'image' ? createOpenClawImageElement(att) : null
    if (imageEl) {
      item.appendChild(imageEl)
    } else {
      item.classList.add('is-file')
      item.appendChild(createOpenClawFileCard(att, { preview: false }))
    }
    const del = document.createElement('button')
    del.className = 'chat-attachment-del'
    del.type = 'button'
    del.dataset.idx = String(idx)
    del.textContent = '×'
    del.addEventListener('click', () => {
      _attachments.splice(idx, 1)
      renderAttachments()
    })
    item.appendChild(del)
    _attachPreviewEl.appendChild(item)
  })
  const ocrBtn = document.createElement('button')
  ocrBtn.className = 'btn btn-secondary btn-sm'
  ocrBtn.id = 'chat-ocr-attachments'
  ocrBtn.type = 'button'
  ocrBtn.textContent = '识别文字'
  _attachPreviewEl.appendChild(ocrBtn)
  _attachPreviewEl.querySelector('#chat-ocr-attachments')?.addEventListener('click', runOcrForAttachments)
  updateSendState()
}

// ── Gateway 连接 ──

async function runOcrForAttachments() {
  const att = _attachments.find(item => item?.content)
  if (!att) {
    toast('请先添加一张图片', 'warning')
    return
  }
  const btn = _attachPreviewEl?.querySelector('#chat-ocr-attachments')
  if (btn) btn.disabled = true
  try {
    const dataUrl = `data:${att.mimeType || 'image/png'};base64,${att.content}`
    const result = await ocr.extractTextFromImageData(dataUrl, {
      mimeType: att.mimeType || 'image/png',
      sourceType: 'image',
    })
    const text = formatOcrResult(result)
    if (result.ok && result.text) {
      const insert = `[OCR]\n${result.text}\n[/OCR]`
      _textarea.value = _textarea.value.trim() ? `${_textarea.value.trim()}\n\n${insert}` : insert
      _textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await copyText(result.text).catch(() => false)
      const task = currentCollaborationTask()
      if (task?.taskId) {
        const artifacts = [{
          type: 'ocr_text',
          path: att.savedPath || att.fileName || att.name || 'openclaw-ocr-image',
          text: result.text,
        }]
        const context = buildOpenClawCollaborationContext(task, result.text, artifacts)
        createTaskResult({
          taskId: task.taskId,
          sessionId: context.session_id,
          fromAgent: COLLAB_TARGETS.openclaw,
          toAgent: COLLAB_TARGETS.hermes,
          title: 'OpenClaw OCR completed',
          content: result.text,
          tool: 'ocr',
          context,
          artifacts,
        })
      }
      toast('OCR 识别完成，结果已加入输入框', 'success')
    } else {
      toast(text, 'warning')
    }
  } catch (error) {
    toast(`OCR 失败：${error?.message || error}`, 'warning')
  } finally {
    if (btn) btn.disabled = false
  }
}

function isOcrIntentText(text) {
  return /(ocr|识别文字|文字识别|读取图片文字|图片里的字|截图文字|报错截图|UI 截图|ui截图)/i.test(String(text || ''))
}

async function runOcrForAttachmentData(att) {
  if (!att?.content) return null
  const dataUrl = `data:${att.mimeType || 'image/png'};base64,${att.content}`
  const result = await ocr.extractTextFromImageData(dataUrl, {
    mimeType: att.mimeType || 'image/png',
    sourceType: 'image',
  })
  const task = currentCollaborationTask()
  if (task?.taskId) {
    const artifacts = [{
      type: 'ocr_text',
      path: att.savedPath || att.fileName || att.name || 'openclaw-ocr-attachment',
      text: result.ok ? result.text : result.error,
    }]
    const context = buildOpenClawCollaborationContext(task, result.ok ? result.text : result.error, artifacts)
    createTaskResult({
      taskId: task.taskId,
      sessionId: context.session_id,
      fromAgent: COLLAB_TARGETS.openclaw,
      toAgent: COLLAB_TARGETS.hermes,
      title: result.ok ? 'OpenClaw OCR completed' : 'OpenClaw OCR failed',
      content: result.ok ? result.text : result.error,
      failed: !result.ok,
      tool: 'ocr',
      context,
      artifacts,
    })
  }
  return result
}

async function connectGateway(options = {}) {
  try {
    // 清理旧的订阅，避免重复监听
    if (_unsubStatus) { _unsubStatus(); _unsubStatus = null }
    if (_unsubReady) { _unsubReady(); _unsubReady = null }
    if (_unsubEvent) { _unsubEvent(); _unsubEvent = null }
    if (_unsubReconnectStuck) { _unsubReconnectStuck(); _unsubReconnectStuck = null }

    if (!options.skipProbe) {
      const probe = await refreshOpenClawGatewayUiState()
      const state = hasOpenClawGatewayReadySignal(probe) ? 'ready' : normalizeGatewayUiState(probe)
      if (state === 'stopped' || state === 'needs_setup' || state === 'error') {
        if (isOpenClawGenerationActive()) {
          scheduleOpenClawTransientRecovery(`connect-probe-${state}`, { notify: false, delayMs: 1200 })
          return
        }
        if (wsClient.connected || wsClient.connecting || wsClient.gatewayReady) wsClient.disconnect()
        return
      }
      if (state === 'checking') {
        const waited = await waitForAgentGatewayReady('openclaw', { attempts: 4, delayMs: 500, timeoutMs: 1500 })
        const waitedState = hasOpenClawGatewayReadySignal(waited) ? 'ready' : normalizeGatewayUiState(waited)
        if (waitedState === 'ready') markOpenClawGatewayReady('connect-wait-ready', { probe: waited })
        else setOpenClawGatewayUiState(waitedState, { probe: waited, error: waited?.error || '' })
        if (waitedState !== 'ready') return
      }
    }

    // 订阅状态变化（订阅式，返回 unsub）
    _unsubStatus = wsClient.onStatusChange((status, errorMsg) => {
      if (!_pageActive) return
      updateStatusDot(status)
      const bar = document.getElementById('chat-disconnect-bar')
      if (status === 'ready' || status === 'connected') {
        markOpenClawGatewayReady('ws-status-ready')
        // WS 已连接，主动刷新 Gateway 状态以消除顶部横条延迟
        import('../lib/app-state.js').then(m => {
          m.confirmGatewayRunningFromLiveConnection?.()
          return m.refreshGatewayStatus()
        }).catch(() => {})
      } else if (status === 'error') {
        // 连接错误：显示引导遮罩而非底部条
        if (bar) bar.style.display = 'none'
        probeOpenClawGatewayHealthForSend().then(health => {
          if (!_pageActive) return
          if (hasOpenClawGatewayReadySignal(health)) {
            markOpenClawGatewayReady('ws-error-health-ready', { probe: health })
            return
          }
          if (bar) bar.style.display = 'none'
          setOpenClawGatewayUiState('error', { error: errorMsg || t('chat.connectFailed') })
        }).catch(() => {
          if (!_pageActive) return
          if (bar) bar.style.display = 'none'
          setOpenClawGatewayUiState('error', { error: errorMsg || t('chat.connectFailed') })
        })
      } else if (status === 'reconnecting' || status === 'disconnected') {
        // 首次连接或多次重连失败时，显示引导遮罩而非底部小条
        scheduleOpenClawTransientRecovery(`ws-${status}`, { notify: false })
        reconcileOpenClawGatewayAfterTransientStatus(`ws-${status}`)
      } else {
        if (bar) bar.style.display = 'none'
      }
    })

    _unsubReady = wsClient.onReady((hello, sessionKey, err) => {
      if (!_pageActive) return
      const overlay = document.getElementById('chat-connect-overlay')
      if (err?.error) {
        if (overlay) overlay.style.display = 'flex'
        setOpenClawGatewayUiState('error', { error: err.message || t('chat.connectFailed') })
        return
      }
      markOpenClawGatewayReady('ws-ready')
      showTyping(false)  // Gateway 就绪后关闭加载动画
      // 重连后恢复：保留当前 sessionKey，不重复加载历史
      if (!_sessionKey) {
        _sessionKey = resolveGatewaySessionKey(sessionKey)
        updateSessionTitle()
        scheduleInitialOpenClawHistoryLoad()
      } else {
        syncWorkspaceContext(false)
        scheduleInitialOpenClawHistoryLoad()
      }
      // 始终刷新会话列表（无论是否有 sessionKey）
      refreshSessionList()
      maybeConsumeCollaborationDispatch()
    })

    _unsubEvent = wsClient.onEvent((msg) => {
      if (!_pageActive) return
      handleEvent(msg)
    })

    // 连续多次 WS 重连失败时，主动尝试拉起/修复 Gateway（而不是干等下一次重连）
    _unsubReconnectStuck = wsClient.onReconnectStuck((attempts) => {
      if (!_pageActive) return
      // 与 main.js 的全局恢复 + 本页 window 兜底共用同一把锁，避免重复拉起 Gateway。
      if (window.__superclawGatewayRecovering) return
      window.__superclawGatewayRecovering = true
      console.log(`[chat] WS 重连卡住 (${attempts})，主动尝试拉起 Gateway...`)
      autoStartOpenClawGatewayOnEnter().catch(err => {
        if (!_pageActive || _openClawGatewayUiState === 'ready') return
        setOpenClawGatewayUiState('error', { error: err?.message || String(err) })
      }).finally(() => {
        window.__superclawGatewayRecovering = false
      })
    })

    // 如果已连接且 Gateway 就绪，直接复用
    if (wsClient.connected && wsClient.gatewayReady) {
      _sessionKey = resolveGatewaySessionKey(wsClient.sessionKey)
      markOpenClawGatewayReady('reuse-existing-ws')
      showTyping(false)  // 确保关闭加载动画
      updateSessionTitle()
      scheduleInitialOpenClawHistoryLoad()
      refreshSessionList()
      maybeConsumeCollaborationDispatch()
      return
    }

    // 如果正在连接中（重连等），等待 onReady 回调即可
    if (wsClient.connected || wsClient.connecting || wsClient.gatewayReady) return

    // 未连接，发起新连接
    let config
    try {
      config = await api.readOpenclawConfig()
    } catch {
      // openclaw.json 不存在（首次安装），自动创建默认配置
      console.log('[chat] 未检测到 openclaw.json，尝试自动初始化...')
      await api.initOpenclawConfig().catch(() => {})
      config = await api.readOpenclawConfig().catch(() => ({}))
    }
    const gw = config?.gateway || {}
    const host = `127.0.0.1:${gw.port || BROWSER_GATEWAY_PORT}`
    const token = gw.auth?.token || gw.authToken || (!isTauriRuntime() ? BROWSER_GATEWAY_TOKEN : '')
    wsClient.connect(host, token)
  } catch (e) {
    toast(`${t('common.loadFailed')}: ${e.message}`, 'error')
  }
}

// ── 会话管理 ──

function waitForOpenClawGatewayReady(timeoutMs = OPENCLAW_GATEWAY_SEND_READY_TIMEOUT_MS) {
  if (wsClient.gatewayReady && _sessionKey) return Promise.resolve(true)
  return new Promise((resolve, reject) => {
    let done = false
    let unsubscribe = null
    let timer = null
    const finish = (err = null) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      if (unsubscribe) unsubscribe()
      if (err) reject(err)
      else resolve(true)
    }
    timer = setTimeout(() => {
      finish(new Error('OpenClaw Gateway 启动超时，请点击重新连接'))
    }, timeoutMs)
    unsubscribe = wsClient.onReady((hello, sessionKey, err) => {
      if (err?.error) {
        finish(new Error(err.message || 'OpenClaw Gateway 连接失败'))
        return
      }
      if (sessionKey && !_sessionKey) _sessionKey = resolveGatewaySessionKey(sessionKey)
      if (wsClient.gatewayReady && _sessionKey) finish()
    })
    if (wsClient.gatewayReady && _sessionKey) finish()
  })
}

async function ensureOpenClawGatewayReadyForSend() {
  ensureReadySessionKey()
  if (_openClawGatewayUiState === 'ready' && wsClient.gatewayReady && _sessionKey) {
    markOpenClawGatewayReady('send-ws-ready')
    return true
  }
  let statusProbe = await probeAgentGateway('openclaw', { timeoutMs: 1800 })
  if (isOpenClawModelConfigRequired(statusProbe)) {
    // 配置可能尚未写入（新注册 / 早退 boot 未执行 sync）：先同步一次再探测，避免误拦截
    const syncedProbe = await syncOpenClawModelConfigAndReprobe().catch(() => null)
    if (syncedProbe && !isOpenClawModelConfigRequired(syncedProbe)) {
      statusProbe = syncedProbe
    } else {
      setOpenClawGatewayUiState('needs_setup', {
        probe: syncedProbe || statusProbe,
        error: (syncedProbe || statusProbe)?.message || (syncedProbe || statusProbe)?.error || '',
      })
      toast('OpenClaw 模型配置未完成，请先到模型设置中配置服务商、API Key 和主模型。', 'warning')
      return false
    }
  }
  const healthProbe = hasOpenClawGatewayReadySignal(statusProbe)
    ? statusProbe
    : await probeOpenClawGatewayHealthForSend()
  const readyProbe = hasOpenClawGatewayReadySignal(statusProbe) || hasOpenClawGatewayReadySignal(healthProbe)
  if (readyProbe) {
    markOpenClawGatewayReady('send-probe-ready', {
      probe: hasOpenClawGatewayReadySignal(healthProbe) ? healthProbe : statusProbe,
    })
  }
  const readyCheck = await assertAgentReadyBeforeSend('openclaw', { attempts: 2, delayMs: 300, timeoutMs: 1500 })
  const readyCheckState = hasOpenClawGatewayReadySignal(readyCheck.state) ? 'ready' : normalizeGatewayUiState(readyCheck.state)
  if (readyCheckState === 'ready') markOpenClawGatewayReady('send-ready-check', { probe: readyCheck.state })
  else {
    setOpenClawGatewayUiState(readyCheckState, {
      probe: readyCheck.state,
      error: readyCheck.state?.error || '',
    })
  }
  if (isOpenClawModelConfigRequired(readyCheck.state)) {
    toast(readyCheck.message || 'OpenClaw 模型配置未完成，请先到模型设置中配置服务商、API Key 和主模型。', 'warning')
    return false
  }
  if (!readyCheck.ok && !readyProbe && !hasOpenClawGatewayReadySignal(readyCheck.state)) {
    toast(readyCheck.message || 'OpenClaw Gateway 尚未就绪。', 'warning')
    return false
  }
  if (wsClient.gatewayReady && _sessionKey) return true
  toast('Gateway 已启动，正在检查服务是否可用...', 'warning')
  showTyping(true)
  try {
    if (!wsClient.gatewayReady && (wsClient.connected || wsClient.connecting) && !isOpenClawGenerationActive()) wsClient.disconnect()
    await connectGateway({ skipProbe: true })
    await waitForOpenClawGatewayReady()
    markOpenClawGatewayReady('send-ready-wait')
    showTyping(false)
    return true
  } catch (error) {
    showTyping(false)
    const message = error?.message || 'OpenClaw Gateway 启动超时，请点击重新连接'
    setOpenClawGatewayUiState('error', { error: message })
    appendSystemMessage(message)
    toast(message, 'error')
    return false
  }
}

async function refreshSessionList() {
  const fallbackCurrentSession = _sessionKey
    ? [{ sessionKey: _sessionKey, key: _sessionKey, updatedAt: Date.now(), localOnly: true }]
    : []
  try {
    const [gatewayResult, localResult] = await Promise.allSettled([
      wsClient.gatewayReady ? wsClient.sessionsList(50) : Promise.resolve({ sessions: [] }),
      isTauriRuntime() ? api.listOpenclawRawSessions(80) : Promise.resolve({ sessions: [] }),
    ])
    const gatewaySessions = gatewayResult.status === 'fulfilled'
      ? (gatewayResult.value?.sessions || gatewayResult.value || [])
      : []
    const localSessions = localResult.status === 'fulfilled'
      ? (localResult.value?.sessions || localResult.value || [])
      : []
    const sessions = [
      ...(Array.isArray(gatewaySessions) ? gatewaySessions : []),
      ...(Array.isArray(localSessions) ? localSessions : []),
    ]
    renderSessionList(mergeLocalSessions(sessions.length ? sessions : fallbackCurrentSession))
  } catch (e) {
    console.error('[chat] refreshSessionList error:', e)
    renderSessionList(mergeLocalSessions([...getLocalSessions(), ...fallbackCurrentSession]))
  }
}

function startCollaborationDispatchWatcher() {
  if (!_collabDispatchInterval) {
    _collabDispatchInterval = setInterval(() => {
      maybeConsumeCollaborationDispatch().catch(err => console.warn('[collaboration] dispatch poll failed:', err))
    }, 1000)
  }
  if (!_collabDispatchStorageHandler) {
    _collabDispatchStorageHandler = (event) => {
      if (event?.key && event.key !== 'superclaw-collab-pending-dispatch-v1') return
      setTimeout(() => {
        maybeConsumeCollaborationDispatch().catch(err => console.warn('[collaboration] dispatch wake failed:', err))
      }, 0)
    }
    window.addEventListener('storage', _collabDispatchStorageHandler)
    window.addEventListener('focus', _collabDispatchStorageHandler)
  }
  setTimeout(() => {
    maybeConsumeCollaborationDispatch().catch(err => console.warn('[collaboration] dispatch initial check failed:', err))
  }, 0)
}

function stopCollaborationDispatchWatcher() {
  if (_collabDispatchInterval) {
    clearInterval(_collabDispatchInterval)
    _collabDispatchInterval = null
  }
  if (_collabDispatchStorageHandler) {
    window.removeEventListener('storage', _collabDispatchStorageHandler)
    window.removeEventListener('focus', _collabDispatchStorageHandler)
    _collabDispatchStorageHandler = null
  }
}

async function maybeConsumeCollaborationDispatch() {
  if (_collabDispatchBusy || !_pageActive || !wsClient.gatewayReady) return
  // Claude's native 3020 panel has a different WebView origin and therefore
  // cannot write this page's localStorage directly. Import its portable
  // handoff rows before consuming the normal collaboration queue.
  try {
    let bridge = null
    if (isTauriRuntime()) {
      bridge = await api.claudeCollaborationDrain()
    } else {
      const response = await fetch('http://127.0.0.1:3020/api/collaboration/drain', { method: 'POST' })
      if (response.ok) bridge = await response.json()
    }
    for (const task of Array.isArray(bridge?.tasks) ? bridge.tasks : []) {
      if (!task?.taskId || !task?.message) continue
      setPendingDispatch(task)
    }
  } catch (error) {
    console.warn('[collaboration] Claude media bridge drain failed:', error)
  }
  const pending = consumePendingDispatch(COLLAB_TARGETS.openclaw)
  if (!pending) return
  const message = String(pending.message || '').trim()
  const mediaPrompt = String(pending.media_prompt || '').trim()
  if (!message && !mediaPrompt) return

  _collabDispatchBusy = true
  try {
    const taskId = pending.taskId || `collab-${Date.now().toString(36)}`
    const stage = pending.stage || 'execute'
    rememberOpenClawCollaborationOrigin(taskId, pending)
    const collabContext = buildTaskContext({
      sessionId: pending.session_id || pending.sessionId || _sessionKey,
      taskId,
      context: pending.context || {},
      artifacts: pending.artifacts || [],
      content: pending.message || '',
    })
    const title = pending.title || `[${stage === 'review' ? '验收' : '执行'}] OpenClaw · ${taskId}`
    const key = `agent:main:collaboration/${stage}/${taskId}.md`
    setSessionName(key, title)
    upsertLocalSession(key, 'main', title)
    await switchSession(key, { forceWorkspace: true })
    refreshSessionList()
    updateCollaborationTask(taskId, {
      status: stage === 'review' ? 'reviewer_running' : 'executor_running',
      [stage === 'review' ? 'openclawReviewSessionKey' : 'openclawSessionKey']: key,
      openedAt: Date.now(),
      context: collabContext,
      artifacts: collabContext.artifacts,
    })
    const progressMessage = createTaskProgress({
      taskId,
      sessionId: collabContext.session_id,
      fromAgent: COLLAB_TARGETS.openclaw,
      toAgent: COLLAB_TARGETS.hermes,
      title,
      content: `${stage === 'review' ? 'OpenClaw review' : 'OpenClaw execution'} started in session ${key}`,
      context: collabContext,
      artifacts: collabContext.artifacts,
    })
    // The isolated OpenClaw runner has a different WebView localStorage area.
    // Mirror the acceptance event to the portable queue so Hermes can show
    // real progress before the media tool has finished.
    if (isTauriRuntime()) {
      void api.collaborationMessageAppend(progressMessage).catch(error => {
        console.warn('[collaboration] durable OpenClaw progress handoff failed:', error)
      })
    }
    const nativeMediaTask = pending.media_type
      ? {
          media_type: pending.media_type,
          prompt: mediaPrompt || message,
          title: pending.title || '媒体协作任务',
          inputPath: pending.input_path || null,
        }
      : null
    const dispatchText = mediaPrompt || message
    if (_isSending || _isStreaming) {
      _messageQueue.push({ text: dispatchText, attachments: [], forceNativeMediaTask: nativeMediaTask })
      toast('协作任务已进入 OpenClaw 队列。', 'success')
    } else {
      // Media execution is a deterministic local route. Never send a media
      // dispatch as an instruction for the chat model to "decide" whether to
      // call a tool: it must invoke the configured media provider here.
      await doSend(dispatchText, [], createOpenClawClientRequestId(), undefined, nativeMediaTask)
      toast('协作任务已派发给 OpenClaw。', 'success')
    }
  } catch (err) {
    toast(`协作派单失败：${err?.message || err}`, 'error')
  } finally {
    _collabDispatchBusy = false
  }
}

function resolveGatewaySessionKey(gatewaySessionKey) {
  const fallback = normalizeOpenClawSessionKey(gatewaySessionKey || wsClient.sessionKey || 'agent:main:main')
  const saved = normalizeOpenClawSessionKey(
    localStorage.getItem(STORAGE_LAST_ACTIVE_SESSION_KEY) ||
    localStorage.getItem(STORAGE_SESSION_KEY)
  )
  if (!saved || saved === fallback) return fallback
  const defaults = wsClient.snapshot?.sessionDefaults || {}
  const known = new Set([
    fallback,
    defaults.mainSessionKey,
    defaults.defaultSessionKey,
    defaults.lastSessionKey,
  ].filter(Boolean).map(normalizeOpenClawSessionKey))
  if (known.has(saved)) return saved
  const savedAgent = parseSessionAgent(saved)
  const fallbackAgent = parseSessionAgent(fallback)
  // Work-file and collaboration sessions include a path after the agent id.
  // They are still valid portable session keys and must win over the Gateway
  // default when restoring the user's last active conversation.
  if (savedAgent && savedAgent === fallbackAgent) {
    return saved
  }
  localStorage.setItem(STORAGE_SESSION_KEY, fallback)
  return fallback
}

function renderSessionList(sessions) {
  const sortedSessions = [...sessions].sort((a, b) => (b.updatedAt || b.lastActivity || 0) - (a.updatedAt || a.lastActivity || 0))
  const sidebarSessions = sortedSessions.map(session => {
    const key = normalizeOpenClawSessionKey(session.sessionKey || session.key || '')
    return { ...session, sessionKey: key, title: sessionDisplayTitle(key, parseSessionLabel(key)) }
  })
  window.dispatchEvent(new CustomEvent('superclaw:openclaw-sessions', { detail: { sessions: sidebarSessions } }))
  if (!_sessionListEl) return
  if (!sessions.length) {
    _sessionListEl.innerHTML = `<div class="chat-session-empty">${t('chat.noSessions')}</div>`
    return
  }
  _sessionListEl.innerHTML = sortedSessions.map(s => {
  const key = normalizeOpenClawSessionKey(s.sessionKey || s.key || '')
  const active = isOpenClawCurrentSessionKey(key) ? ' active' : ''
    const label = parseSessionLabel(key)
    const ts = s.updatedAt || s.lastActivity || s.createdAt || 0
    const timeStr = ts ? formatSessionTime(ts) : ''
    const msgCount = s.messageCount || s.messages || 0
    const agentId = parseSessionAgent(key)
    const displayLabel = sessionDisplayTitle(key, label)
    const workPath = sessionDisplayPath(key)
    const cpCount = s.compactionCheckpointCount || 0
    return `<div class="chat-session-card${active}" data-key="${escapeAttr(key)}" data-session-key="${escapeAttr(key)}">
      <div class="chat-session-card-header">
        <span class="chat-session-label" title="${t('chat.doubleClickRename')}">${escapeAttr(displayLabel)}</span>
        <div style="display:flex;gap:2px;align-items:center">
          ${cpCount > 0 ? `<button class="chat-session-del" data-compaction="${escapeAttr(key)}" title="${t('chat.compactionHistory')}" style="color:var(--text-tertiary);font-size:11px">⟳${cpCount}</button>` : ''}
          <button class="chat-session-del chat-session-more" data-menu="${escapeAttr(key)}" title="更多操作">${svgIcon('list', 13)}</button>
          <button class="chat-session-del" data-del="${escapeAttr(key)}" title="${t('common.delete')}">×</button>
        </div>
      </div>
      <div class="chat-session-card-meta">
        ${agentId && agentId !== 'main' ? `<span class="chat-session-agent">${escapeAttr(agentId)}</span>` : ''}
        ${workPath ? `<span class="chat-session-path" title="${escapeAttr(workPath)}">${escapeAttr(workPath)}</span>` : ''}
        ${msgCount > 0 ? `<span>${msgCount} msgs</span>` : ''}
        ${timeStr ? `<span>${timeStr}</span>` : ''}
      </div>
    </div>`
  }).join('')

  if (!_sessionListEl._openClawSessionClickBound) {
    _sessionListEl.addEventListener('click', handleOpenClawSessionListClick, true)
    _sessionListEl._openClawSessionClickBound = true
  }
  _sessionListEl.onclick = handleOpenClawSessionListClick
  _sessionListEl.ondblclick = (e) => {
    const labelEl = e.target.closest('.chat-session-label')
    if (!labelEl) return
    const card = labelEl.closest('[data-session-key], [data-key]')
    if (!card) return
    e.stopPropagation()
    renameSession(card.dataset.sessionKey || card.dataset.key, labelEl)
  }
}

function handleOpenClawSessionListClick(e) {
  const cpBtn = e.target.closest('[data-compaction]')
  if (cpBtn) { e.stopPropagation(); showCompactionHistory(cpBtn.dataset.compaction); return }
  const menuBtn = e.target.closest('[data-menu]')
  if (menuBtn) {
    e.stopPropagation()
    const rect = menuBtn.getBoundingClientRect()
    openSessionContextMenu(rect.right, rect.bottom + 4, menuBtn.dataset.menu)
    return
  }
  const delBtn = e.target.closest('[data-del]')
  if (delBtn) { e.stopPropagation(); deleteSession(delBtn.dataset.del); return }
  const item = e.target.closest('.chat-session-card[data-session-key], .chat-session-card[data-key]')
  if (!item) return
  e.preventDefault()
  e.stopPropagation()
  const clickedKey = item.dataset.sessionKey || item.dataset.key
  void switchSession(normalizeOpenClawSessionKey(clickedKey))
}

function syncOpenClawSessionListActiveState(activeSessionKey = _sessionKey) {
  if (!_sessionListEl) return
  const target = normalizeOpenClawSessionKey(activeSessionKey || _sessionKey)
  _sessionListEl.querySelectorAll('.chat-session-card[data-session-key], .chat-session-card[data-key]').forEach(card => {
    const key = card.dataset.sessionKey || card.dataset.key
    card.classList.toggle('active', normalizeOpenClawSessionKey(key) === target)
  })
}

function formatSessionTime(ts) {
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diffMs = now - d
  if (diffMs < 60000) return t('chat.justNow')
  if (diffMs < 3600000) return t('chat.minutesAgo', { n: Math.floor(diffMs / 60000) })
  if (diffMs < 86400000) return t('chat.hoursAgo', { n: Math.floor(diffMs / 3600000) })
  if (diffMs < 604800000) return t('chat.daysAgo', { n: Math.floor(diffMs / 86400000) })
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

function parseSessionAgent(key) {
  const parts = (key || '').split(':')
  return parts.length >= 2 ? parts[1] : ''
}

function parseSessionLabel(key) {
  const parts = (key || '').split(':')
  if (parts.length < 3) return key || t('common.unknown')
  const agent = parts[1] || 'main'
  const channel = parts.slice(2).join(':')
  if (agent === 'main' && channel === 'main') return t('chat.mainSession')
  if (agent === 'main') return channel
  return `${agent} / ${channel}`
}

async function switchSession(newKey, options = {}) {
  const { forceWorkspace = false } = options
  const targetSessionKey = normalizeOpenClawSessionKey(newKey)
  if (!targetSessionKey || isOpenClawCurrentSessionKey(targetSessionKey)) return false
  snapshotCurrentChatState('switch-session')
  _voicePlaybackController?.stop()
  syncMessageVoiceButtons(null)
  const nextAgentId = parseSessionAgent(targetSessionKey) || 'main'
  if (!forceWorkspace && _workspaceDirty && nextAgentId !== _workspaceCurrentAgentId) {
    const yes = await confirmWorkspaceDiscardIfNeeded()
    if (!yes) return false
    discardWorkspaceChanges()
  }
  _sessionKey = targetSessionKey
  localStorage.setItem(STORAGE_SESSION_KEY, targetSessionKey)
  localStorage.setItem(STORAGE_LAST_ACTIVE_SESSION_KEY, targetSessionKey)
  const currentLocalSession = getLocalSessions().find(row => normalizeOpenClawSessionKey(row?.sessionKey || row?.key) === targetSessionKey)
  upsertLocalSession(targetSessionKey, nextAgentId, currentLocalSession?.title || parseSessionLabel(targetSessionKey))
  _lastHistoryHash = ''
  syncOpenClawSessionListActiveState(targetSessionKey)
  resetStreamState()
  updateSessionTitle()
  clearMessages()
  loadHistory(targetSessionKey)
  refreshSessionList()
  return true
}

async function showNewSessionDialog() {
  const defaultAgent = wsClient.snapshot?.sessionDefaults?.defaultAgentId || 'main'

  // 先用默认选项立即显示弹窗
  const initialOptions = [
    { value: 'main', label: `main ${t('chat.defaultSuffix')}` },
    { value: '__new__', label: `+ ${t('chat.newAgent')}` }
  ]

  showModal({
    title: '创建工程文件',
    fields: [
      { name: 'name', label: '工程文件名称', value: '', placeholder: '例如：产品方案 或 项目/需求说明.md', hint: '创建后会显示在左侧会话栏，文件保存在 OpenClaw 工作区。' },
      { name: 'agent', label: 'Agent', type: 'select', value: defaultAgent, options: initialOptions },
    ],
    onConfirm: async (result) => {
      const rawName = (result.name || '').trim()
      if (!rawName) { toast('请先输入工程文件名称', 'warning'); return }
      const agent = result.agent || defaultAgent
      if (agent === '__new__') {
        navigate('/agents')
        toast(t('chat.createAgentHint'), 'info')
        return
      }
      let workspaceInfo = null
      try { workspaceInfo = await api.getAgentWorkspaceInfo(agent) } catch (err) {
        console.warn('[chat] 读取工作区信息失败，使用显示路径继续:', err)
      }
      const meta = buildOpenclawWorkFileMeta(rawName, agent, workspaceInfo)
      if (!meta) { toast('工程文件名称不可用，请重新输入', 'warning'); return }
      const key = `agent:${agent}:${meta.relativePath}`
      let exists = false
      try {
        try {
          const entries = await api.listAgentWorkspaceEntries(agent, meta.relativeDir || '')
          exists = Array.isArray(entries) && entries.some(entry => entry?.type === 'file' && entry?.name === meta.workFileName)
        } catch {}
        if (!exists) {
          await api.writeAgentWorkspaceFile(agent, meta.relativePath, '')
        }
      } catch (err) {
        toast(`工程文件创建失败：${err?.message || err}`, 'error')
        return
      }
      setSessionWorkFile(key, meta)
      setSessionName(key, meta.workFileName)
      upsertLocalSession(key, agent, meta.workFileName)
      const switched = await switchSession(key, { forceWorkspace: true })
      if (switched || _sessionKey === key) {
        refreshSessionList()
        toast(exists ? '已使用现有工程文件' : '工程文件已创建', 'success')
      }
    }
  })

  // 异步加载完整 Agent 列表并更新下拉框
  try {
    const agents = await api.listAgents()
    const agentOptions = agents.map(a => ({
      value: a.id,
      label: `${a.id}${a.isDefault ? ` ${t('chat.defaultSuffix')}` : ''}${a.identityName ? ' — ' + a.identityName.split(',')[0] : ''}`
    }))
    agentOptions.push({ value: '__new__', label: `+ ${t('chat.newAgent')}` })

    // 更新弹窗中的下拉框选项
    const selectEl = document.querySelector('.modal-overlay [data-name="agent"]')
    if (selectEl) {
      const currentValue = selectEl.value
      selectEl.innerHTML = agentOptions.map(o =>
        `<option value="${o.value}" ${o.value === currentValue ? 'selected' : ''}>${o.label}</option>`
      ).join('')
    }
  } catch (e) {
    console.warn('[chat] 加载 Agent 列表失败:', e)
  }
}

function showChatContextMenu(x, y, items) {
  const existing = document.querySelector('.chat-ctxmenu')
  if (existing) existing.remove()
  const menu = document.createElement('div')
  menu.className = 'chat-ctxmenu'
  menu.innerHTML = items.map((item, idx) => `
    <button class="chat-ctxmenu-item ${item.danger ? 'is-danger' : ''}" data-idx="${idx}">
      ${item.icon || ''}
      <span>${escapeAttr(item.label)}</span>
    </button>
  `).join('')
  document.body.appendChild(menu)
  const rect = menu.getBoundingClientRect()
  const vw = window.innerWidth || 1024
  const vh = window.innerHeight || 768
  menu.style.left = `${Math.max(8, Math.min(x, vw - rect.width - 8))}px`
  menu.style.top = `${Math.max(8, Math.min(y, vh - rect.height - 8))}px`

  const close = () => menu.remove()
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-ctxmenu-item')
    if (!btn) return
    const item = items[Number(btn.dataset.idx)]
    close()
    item?.action?.()
  })
  setTimeout(() => {
    document.addEventListener('click', close, { once: true })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close()
    }, { once: true })
  }, 0)
}

function openSessionContextMenu(x, y, key) {
  const meta = getSessionWorkFile(key)
  const items = []
  if (meta?.workFilePath) {
    items.push(
      {
        label: '打开工程文件夹',
        icon: svgIcon('folder', 13),
        action: async () => {
          try {
            await api.assistantOpenPath(meta.workFileDir || meta.workFilePath)
            toast('已打开工程文件夹', 'success')
          } catch (err) {
            toast(`打开文件夹失败：${err?.message || err}`, 'error')
          }
        },
      },
      {
        label: '复制工程文件路径',
        icon: svgIcon('copy', 13),
        action: async () => {
          const ok = await copyText(meta.workFilePath)
          toast(ok ? t('common.copied') : '复制失败', ok ? 'success' : 'error')
        },
      }
    )
  }
  items.push(
    {
      label: '重命名会话',
      icon: svgIcon('file-text', 13),
      action: () => {
        const labelEl = _sessionListEl?.querySelector(`[data-key="${CSS.escape(key)}"] .chat-session-label`)
        if (labelEl) renameSession(key, labelEl)
      },
    },
    {
      label: t('common.delete'),
      icon: svgIcon('trash', 13),
      danger: true,
      action: () => deleteSession(key),
    }
  )
  showChatContextMenu(x, y, items)
}

async function deleteSession(key) {
  const mainKey = wsClient.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main'
  if (key === mainKey) { toast(t('chat.cannotDeleteMain'), 'warning'); return }
  const label = parseSessionLabel(key)
  const yes = await showConfirm(t('chat.confirmDeleteSession', { label }))
  if (!yes) return
  try {
    try {
      await wsClient.sessionsDelete(key)
    } catch (err) {
      if (!isLocalSession(key)) throw err
    }
    removeLocalSession(key)
    setSessionWorkFile(key, null)
    setSessionName(key, '')
    toast(t('chat.sessionDeleted'), 'success')
    // 删除当前激活会话：等待切换完成后再刷新列表，避免 fire-and-forget
    // 导致列表仍显示已删除会话。删除非激活会话同样刷新。
    if (key === _sessionKey) {
      await switchSession(mainKey, { forceWorkspace: true })
    }
    refreshSessionList()
  } catch (e) {
    toast(`${t('common.operationFailed')}: ${e.message}`, 'error')
  }
}

async function handleOpenClawSidebarAction(action = {}) {
  const type = String(action.type || '')
  const key = normalizeOpenClawSessionKey(action.key || '')
  if (!key) return
  if (type === 'delete') {
    await deleteSession(key)
    return
  }
  if (type === 'rename') {
    const current = getDisplayLabel(key)
    showModal({
      title: '重命名会话',
      fields: [{ name: 'title', label: '会话标题', value: current }],
      onConfirm: async (result) => {
        const next = String(result?.title || '').trim()
        setSessionName(key, next && next !== parseSessionLabel(key) ? next : '')
        if (key === _sessionKey) updateSessionTitle()
        refreshSessionList()
        toast(t('chat.sessionRenamed'), 'success')
      },
    })
  }
}

// ===== 4.9: Sessions Compaction History =====
async function showCompactionHistory(key) {
  if (!key || !wsClient.gatewayReady) return
  const label = getDisplayLabel(key)
  toast(t('chat.compactionLoading'), 'info')
  try {
    const result = await wsClient.sessionsCompactionList(key)
    const checkpoints = result?.checkpoints || []
    if (!checkpoints.length) {
      toast(t('chat.compactionEmpty'), 'info')
      return
    }
    const listHtml = checkpoints.map((cp, idx) => {
      const id = cp.id || cp.checkpointId || `cp-${idx}`
      const ts = cp.timestamp || cp.createdAt || 0
      const timeStr = ts ? new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts).toLocaleString() : '—'
      const tokensBefore = cp.tokensBefore ?? '—'
      const tokensAfter = cp.tokensAfter ?? '—'
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border-primary);display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:500">#${idx + 1} · ${escapeAttr(timeStr)}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${tokensBefore} → ${tokensAfter} tokens</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="btn btn-sm btn-secondary" data-cp-branch="${escapeAttr(id)}">${t('chat.compactionBranch')}</button>
          <button class="btn btn-sm btn-warning" data-cp-restore="${escapeAttr(id)}">${t('chat.compactionRestore')}</button>
        </div>
      </div>`
    }).join('')

    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `<div class="modal" style="max-width:520px;max-height:80vh;overflow:auto">
      <div class="modal-header"><h3>${escapeAttr(t('chat.compactionHistory'))}: ${escapeAttr(label)}</h3></div>
      <div class="modal-body" style="padding:0 var(--space-md)">${listHtml}</div>
      <div class="modal-footer"><button class="btn btn-secondary" data-cp-close>${t('common.close')}</button></div>
    </div>`
    document.body.appendChild(overlay)

    overlay.addEventListener('click', async (e) => {
      if (e.target === overlay || e.target.closest('[data-cp-close]')) {
        overlay.remove()
        return
      }
      const branchBtn = e.target.closest('[data-cp-branch]')
      if (branchBtn) {
        branchBtn.disabled = true
        try {
          const res = await wsClient.sessionsCompactionBranch(key, branchBtn.dataset.cpBranch)
          toast(t('chat.compactionBranchDone'), 'success')
          overlay.remove()
          if (res?.key) void switchSession(res.key)
          else refreshSessionList()
        } catch (err) {
          toast(`${t('common.operationFailed')}: ${err.message}`, 'error')
          branchBtn.disabled = false
        }
        return
      }
      const restoreBtn = e.target.closest('[data-cp-restore]')
      if (restoreBtn) {
        const yes = await showConfirm(t('chat.compactionConfirmRestore'))
        if (!yes) return
        restoreBtn.disabled = true
        try {
          await wsClient.sessionsCompactionRestore(key, restoreBtn.dataset.cpRestore)
          toast(t('chat.compactionRestoreDone'), 'success')
          overlay.remove()
          if (key === _sessionKey) {
            clearMessages()
            _lastHistoryHash = ''
            loadHistory()
          }
          refreshSessionList()
        } catch (err) {
          toast(`${t('common.operationFailed')}: ${err.message}`, 'error')
          restoreBtn.disabled = false
        }
      }
    })
  } catch (e) {
    const msg = String(e?.message || e || '').toLowerCase()
    if (msg.includes('unknown method') || msg.includes('not found') || msg.includes('unsupported')) {
      toast(t('chat.compactionUnsupported'), 'warning')
    } else {
      toast(`${t('common.operationFailed')}: ${e.message}`, 'error')
    }
  }
}

async function resetCurrentSession() {
  if (!_sessionKey) return
  const label = getDisplayLabel(_sessionKey)
  const yes = await showConfirm(t('chat.confirmResetSession', { label }))
  if (!yes) return
  try {
    await wsClient.sessionsReset(_sessionKey)
    if (isStorageAvailable()) {
      clearSessionMessages(_sessionKey).catch(error => {
        console.warn('[chat] clear local session messages failed:', error?.message || error)
      })
    }
    clearMessages()
    _lastHistoryHash = ''
    appendSystemMessage(t('chat.sessionResetDone'))
    toast(t('chat.sessionResetDone'), 'success')
  } catch (e) {
    toast(`${t('common.operationFailed')}: ${e.message}`, 'error')
  }
}

function updateSessionTitle() {
  const el = _page?.querySelector('#chat-title')
  if (el) el.textContent = getDisplayLabel(_sessionKey)
  syncWorkspaceContext(false)
}

function renameSession(key, labelEl) {
  const current = getDisplayLabel(key)
  const input = document.createElement('input')
  input.type = 'text'
  input.value = current
  input.className = 'chat-session-rename-input'
  input.style.cssText = 'width:100%;padding:2px 6px;border:1px solid var(--accent);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px;outline:none'
  const originalText = labelEl.textContent
  labelEl.textContent = ''
  labelEl.appendChild(input)
  input.focus()
  input.select()

  let done = false
  const finish = () => {
    if (done) return
    done = true
    const newName = input.value.trim()
    if (newName && newName !== parseSessionLabel(key)) {
      setSessionName(key, newName)
      toast(t('chat.sessionRenamed'), 'success')
    } else if (!newName || newName === parseSessionLabel(key)) {
      setSessionName(key, '') // clear custom name
    }
    labelEl.textContent = getDisplayLabel(key)
    // 如果是当前会话，同步更新顶部标题
    if (key === _sessionKey) updateSessionTitle()
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur() }
    if (e.key === 'Escape') { input.value = originalText; input.blur() }
  })
}

// ── 快捷指令面板 ──

function showCmdPanel() {
  if (!_cmdPanelEl) return
  let html = ''
  for (const group of COMMANDS) {
    html += `<div class="cmd-group-title">${t(group.title)}</div>`
    for (const c of group.commands) {
      html += `<div class="cmd-item" data-cmd="${c.cmd}" data-action="${c.action}">
        <span class="cmd-name">${c.cmd}</span>
        <span class="cmd-desc">${t(c.desc)}</span>
      </div>`
    }
  }
  _cmdPanelEl.innerHTML = html
  _cmdPanelEl.style.display = 'block'
  _cmdPanelEl.onclick = (e) => {
    const item = e.target.closest('.cmd-item')
    if (!item) return
    hideCmdPanel()
    if (item.dataset.action === 'fill') {
      _textarea.value = item.dataset.cmd
      _textarea.focus()
      updateSendState()
    } else {
      _textarea.value = item.dataset.cmd
      sendMessage()
    }
  }
}

function hideCmdPanel() {
  if (_cmdPanelEl) _cmdPanelEl.style.display = 'none'
}

function toggleCmdPanel() {
  if (_cmdPanelEl?.style.display === 'block') hideCmdPanel()
  else { _textarea.value = '/'; showCmdPanel(); _textarea.focus() }
}

// ── 消息发送 ──

function parseOpenClawSlashCommand(input) {
  const raw = String(input || '')
  const trimmed = raw.trimStart()
  const lower = trimmed.toLowerCase()
  if (lower === '/hermes' || lower.startsWith('/hermes ')) {
    return {
      type: 'delegate-hermes',
      payload: trimmed.slice('/hermes'.length).trim(),
    }
  }
  if (lower === '/delegate-hermes' || lower.startsWith('/delegate-hermes ')) {
    return {
      type: 'delegate-hermes',
      payload: trimmed.slice('/delegate-hermes'.length).trim(),
    }
  }
  return null
}

function isOpenClawIdentityQuestion(input) {
  const raw = String(input || '').trim()
  const text = raw.replace(/\s+/g, ' ')
  if (!text || text.length > 160) return false
  if (/```|执行包|当前仓库|禁止|报告|步骤|检查|目标[:：]|OpenClaw 全面自检指令/i.test(text)) return false
  return /你是谁|你是誰|你叫什么|你叫什麼|你是什么|你是什麼|介绍下自己|介绍一下自己|介绍下你自己|介绍一下你自己|自我介绍|你的身份|身份定位|who are you|what are you|introduce yourself/i.test(text)
}

function appendOpenClawLocalIdentityAnswer(text, attachments = [], clientRequestId = createOpenClawClientRequestId()) {
  const now = Date.now()
  const identityAnswer = guardAgentIdentityReply({
    agentName: 'openclaw',
    userText: text,
    assistantText: OPENCLAW_LOCAL_IDENTITY_ANSWER || getSafeAgentIdentityReply('openclaw'),
  })
  // appendUserMessage(text, attachments) still renders the original user text; metadata keeps restore dedupe precise.
  appendUserMessage(text, attachments, new Date(now), {
    dedupeKey: `openclaw-user-${clientRequestId}`,
    sessionKey: _sessionKey,
    clientRequestId,
    userMessageId: `openclaw-user-${clientRequestId}`,
    createdAt: now,
  })
  saveMessage({
    id: `openclaw-user-${clientRequestId}`,
    sessionKey: _sessionKey,
    role: 'user',
    content: text,
    timestamp: now,
    createdAt: now,
    clientRequestId,
    attachments: attachments?.length ? serializeOpenClawAttachments(attachments) : undefined,
  })
  appendAiMessage(identityAnswer)
  saveMessage({
    id: `openclaw-local-identity-${clientRequestId}`,
    sessionKey: _sessionKey,
    role: 'assistant',
    content: identityAnswer,
    timestamp: now + 1,
  })
}

function isOpenClawDirectHighRiskText(text) {
  return /(?:\u4ed8\u6b3e|\u652f\u4ed8|\u4e0b\u5355|\u63d0\u4ea4\u8ba2\u5355|\u786e\u8ba4\u652f\u4ed8|\u76f4\u63a5\u4ed8|\u76f4\u63a5\u4e0b\u5355|\u626b\u7801\u652f\u4ed8|\u81ea\u52a8\u4ed8|\u81ea\u52a8\u4e0b\u5355|pay|payment|purchase|submit\s+order)/i.test(String(text || ''))
}

function isOpenClawBrowserScreenshotIntent(text) {
  return /(?:\u622a\u56fe|\u8bfb\u53d6|\u6293\u53d6|\u6253\u5f00|\u9875\u9762|\u6296\u5e97|\u6296\u97f3|\u5c0f\u7ea2\u4e66|\u516c\u4f17\u53f7|\u6d4f\u89c8\u5668|screenshot|browser|web\s?page|crawl|scrape)/i.test(String(text || ''))
}

function isOpenClawBrowserAutomationTraceText(text) {
  return /(?:\u6211\u6765\u64cd\u4f5c\u6d4f\u89c8\u5668|\u542f\u52a8\u6d4f\u89c8\u5668|\u5df2\u6253\u5f00\u6296\u5e97|\u6d4f\u89c8\u5668\u5df2\u8d77\u6765|CDP|tabs?|navigate|browser|screenshot|Douyin|DouDian|\u6296\u5e97|\u7b49\u9875\u9762\u6e32\u67d3|\u7136\u540e\u622a\u56fe)/i.test(String(text || ''))
}

function buildOpenClawToolUnavailableReply(userText = '') {
  // A screenshot task can finish by writing a file, so the absence of an
  // inline image is never proof that native execution failed. Gateway owns
  // tool availability and final-state reporting.
  void userText
  return ''
}

function isOpenClawExecutionRequest(text) {
  const value = String(text || '').trim()
  if (!value) return false
  const hasExecutionVerb = /(?:\u8dd1|\u6267\u884c|\u6d4b\u8bd5|\u68c0\u6d4b|\u68c0\u67e5|\u8dd1\u4e00\u904d|\u7ed9\u6211\u8dd1|\u5e2e\u6211\u8dd1|run|execute|test|check|smoke|gate)/i.test(value)
  const hasExecutionTarget = /(?:P0|P1|P2|P3|P4|P0\s*[-~到至]\s*P4|check-p0-p4|priority\s+gate|\u95e8\u7981|\u5b8c\u6574\u6027|\u547d\u4ee4|\u7ec8\u7aef|\u5de5\u5177|\u811a\u672c|tool|command|terminal|script)/i.test(value)
  return hasExecutionVerb && hasExecutionTarget
}

function isOpenClawExecutionEvidenceText(text) {
  const value = String(text || '')
  if (!value) return false
  return /(?:toolResult|tool_run|command_run|task_event|stdout\s*[:=]|stderr\s*[:=]|exit\s*code\s*[:=]|exitCode\s*[:=]|\u9000\u51fa\u7801\s*[:=：]|\u547d\u4ee4\u8f93\u51fa\s*[:=：]|\u7ec8\u7aef\u8f93\u51fa\s*[:=：]|\u6267\u884c\u7ed3\u679c\s*[:=：])/.test(value)
}

function getOpenClawExactShortReplyTarget(text) {
  const value = String(text || '').trim().replace(/\s+/g, ' ')
  if (!value || value.length > 80) return ''
  const received = value.match(/(?:只回复|只回答|仅回复|仅回答).{0,10}(?:两个字|2\s*个字).{0,8}(收到)/i)
  if (received) return received[1]
  const quoted = value.match(/(?:只回复|只回答|仅回复|仅回答).{0,12}[“"']([^“”"'\s]{1,8})[”"']/i)
  return quoted?.[1] || ''
}

function normalizeOpenClawExactShortReply(userText, assistantText) {
  const stableUserText = String(userText || '').trim().replace(/\s+/g, ' ')
  const asksExactReply = /(?:\u53ea\u56de\u590d|\u53ea\u56de\u7b54|\u4ec5\u56de\u590d|\u4ec5\u56de\u7b54)/i.test(stableUserText)
  const asksShortLength = /(?:\u4e24\u4e2a\u5b57|2\s*\u4e2a\u5b57)/i.test(stableUserText)
  const stableTarget = asksExactReply && asksShortLength && /\u6536\u5230/.test(stableUserText) ? '\u6536\u5230' : ''
  const target = stableTarget || getOpenClawExactShortReplyTarget(userText)
  if (!target) return assistantText
  const current = String(assistantText || '').trim()
  return current === target ? assistantText : target
}

function isOpenClawWorkspaceBootstrapContamination(text) {
  const value = String(text || '')
  if (!value) return false
  return /(?:BOOTSTRAP\.md|bootstrap\s+脚本|workspace\s+里|工作区里|刚上线|刚醒来|我是谁|你是谁|先打个招呼|身份脚本|启动引导)/i.test(value)
}

function isOpenClawExecutionPromiseOnlyReply(text) {
  const value = String(text || '').trim()
  if (!value || isOpenClawExecutionEvidenceText(value)) return false
  if (isOpenClawWorkspaceBootstrapContamination(value)) return true
  const promisesExecution = /(?:\u6211\u6765|\u8ba9\u6211|\u6211\u4f1a|\u7ed9\u4f60|\u5e2e\u4f60|\u9a6c\u4e0a|\u5f00\u59cb|\u5148|\u8986\u76d6|\u6211\u81ea\u5df1\u5b9a|\u8dd1\u4e00\u904d|\u6267\u884c\u4e00\u904d|I'll|I will|let me|starting)/i.test(value)
  const mentionsExecution = /(?:P0|P1|P2|P3|P4|\u5b8c\u6574\u6027|\u5de5\u5177\u94fe|\u6587\u4ef6\u7cfb\u7edf|\u7f51\u7edc|\u6267\u884c\u8fb9\u754c|\u8eab\u4efd|\u8bb0\u5fc6|tool|command|terminal|execute)/i.test(value)
  return promisesExecution && mentionsExecution
}

function buildOpenClawExecutionUnavailableReply(userText = '') {
  if (!isOpenClawExecutionRequest(userText)) return ''
  return [
    '\u8fd9\u6b21\u6ca1\u6709\u62ff\u5230 tool_run\u3001command_run\u3001task_event \u6216\u7ec8\u7aef\u8f93\u51fa\uff0c\u6240\u4ee5\u6211\u4e0d\u4f1a\u628a\u53e3\u5934\u627f\u8bfa\u5f53\u6210\u5df2\u6267\u884c\u6210\u529f\u3002',
    '\u8bf7\u68c0\u67e5 OpenClaw Gateway\u3001exec \u5de5\u5177\u6743\u9650\u3001\u6253\u5305\u8def\u5f84\u4e2d\u7684\u811a\u672c\u662f\u5426\u53ef\u7528\uff1b\u5982\u679c\u6267\u884c\u5668\u4e0d\u53ef\u7528\uff0cUI \u5fc5\u987b\u663e\u793a\u660e\u786e\u5931\u8d25\u539f\u56e0\uff0c\u4e0d\u80fd\u53ea\u663e\u793a\u201c\u6211\u6765\u8dd1\u201d\u3002',
  ].join('\n\n')
}

function buildOpenClawHighRiskSafetyReply() {
  return [
    '\u8fd9\u7c7b\u64cd\u4f5c\u5c5e\u4e8e\u9ad8\u98ce\u9669\u52a8\u4f5c\uff0c\u6211\u4e0d\u4f1a\u4ee3\u4f60\u81ea\u52a8\u4ed8\u6b3e\u3001\u4e0b\u5355\u6216\u63d0\u4ea4\u8ba2\u5355\u3002',
    '\u6211\u53ef\u4ee5\u5e2e\u4f60\u68c0\u67e5\u9875\u9762\u4fe1\u606f\u3001\u6574\u7406\u5546\u54c1\u6216\u8ba2\u5355\u8981\u70b9\uff0c\u4f46\u6700\u7ec8\u652f\u4ed8\u548c\u63d0\u4ea4\u5fc5\u987b\u7531\u4f60\u624b\u52a8\u786e\u8ba4\u3002',
  ].join('\n\n')
}

function isOpenClawSkillsQuestion(text) {
  const value = String(text || '').trim()
  if (!value || value.length > 120) return false
  return (
    /\bskills?\b/i.test(value) ||
    /(?:\u6280\u80fd\u5305|\u6280\u80fd\u5217\u8868|\u6280\u80fd\u6e05\u5355)/i.test(value) ||
    /(?:\u5f53\u524d|\u53ef\u7528|\u6709\u54ea\u4e9b|\u6709\u4ec0\u4e48|\u4ecb\u7ecd|\u8bf4\u660e|\u5217\u51fa|\u67e5\u770b|\u67e5\u8be2).{0,10}\u6280\u80fd(?!\u529b)/i.test(value) ||
    /\u6280\u80fd(?!\u529b).{0,10}(?:\u5f53\u524d|\u53ef\u7528|\u6709\u54ea\u4e9b|\u6709\u4ec0\u4e48|\u4ecb\u7ecd|\u8bf4\u660e|\u5217\u51fa|\u67e5\u770b|\u67e5\u8be2)/i.test(value)
  )
}

function isOpenClawNativeInspectionRequest(text) {
  const value = String(text || '').trim()
  if (!value || value.length > 220) return false
  return /(?:check|inspect|audit|verify).{0,80}(?:channel|wechat|plugin|installed|config|openclaw\.json)|(?:\u68c0\u67e5|\u67e5\u770b|\u6838\u5bf9|\u786e\u8ba4).{0,36}(?:\u6d88\u606f\u6e20\u9053|\u5fae\u4fe1|\u63d2\u4ef6|\u5df2\u5b89\u88c5|\u914d\u7f6e|openclaw\.json)/i.test(value)
}

function isOpenClawCapabilitySummaryQuestion(text) {
  const value = String(text || '').trim()
  if (!value || value.length > 80) return false
  if (isOpenClawSkillsQuestion(value)) return false
  if (/(?:\u7535\u5546|\u8d22\u52a1|\u4ed8\u6b3e|\u652f\u4ed8|\u4e0b\u5355|\u622a\u56fe|\u8bfb\u53d6|\u6253\u5f00|\u9875\u9762)/i.test(value)) return false
  if (/(?:检查|查看|汇总|确认|介绍|说下).{0,12}(?:当前)?能力|(?:当前)?能力.{0,12}(?:检查|汇总|清单|结论)|能力清单|能力列表/i.test(value)) return true
  return /(?:\u4f60\u6709\u4ec0\u4e48\u6280\u80fd|\u6709\u54ea\u4e9b\u6280\u80fd|\u53ef\u7528\u7684\s*skills?|\u6280\u80fd\u5217\u8868|\u4f60\u80fd\u505a\u4ec0\u4e48|\u4f60\u6709\u4ec0\u4e48\u80fd\u529b|what can you do|skills?)/i.test(value)
}

function isOpenClawBroadCapabilityQuestion(text) {
  const value = String(text || '').trim()
  if (!value || value.length > 160) return false
  if (isOpenClawSkillsQuestion(value) || isOpenClawCapabilitySummaryQuestion(value)) return true
  return [
    /\b(?:skills?|opr|exec|collaboration|capabilit(?:y|ies)|tools?\.profile)\b/i,
    /(?:功能|能力|技能|权限|工具|协作|安全|确认|边界|电商).{0,16}(?:说明|介绍|清单|列表|有哪些|有什么|能做什么|怎么用|怎么协作)/i,
    /(?:你|OpenClaw).{0,16}(?:功能|能力|技能|权限|工具|协作|电商).{0,16}(?:说明|介绍|有哪些|有什么|能做什么)/i,
    /(?:协作任务|工具权限|安全确认|能力口径|当前能力|执行边界)/i,
  ].some(pattern => pattern.test(value))
}

function isOpenClawOcrCapabilityQuestion(text) {
  const value = String(text || '').trim()
  if (!value || value.length > 80) return false
  return /(?:OCR|识别文字|读图|图片识别|截图识别).{0,20}(?:能力|可以|能不能|能否|会不会|有没有|支持吗)|(?:你有|是否有|有没有|能不能|能否|会不会).{0,20}(?:OCR|识别文字|读图|图片识别|截图识别)/i.test(value)
}

function buildOpenClawOcrCapabilityReply() {
  return '当前具备 OCR 相关能力：可以识别上传图片或截图中的文字，也可以配合浏览器/桌面截图读取页面内容。需要识别哪张图或哪个窗口时，请直接告诉我。'
}

function isOpenClawFinanceCapabilityQuestion(text) {
  const value = String(text || '').trim()
  if (!value || value.length > 80) return false
  return /(?:\u8d22\u52a1|\u8d26\u5355|\u62a5\u8868|\u5bf9\u8d26|\u53d1\u7968).{0,20}(?:\u5e2e|\u80fd\u505a|\u80fd\u7ed9|\u80fd\u5e72|\u80fd\u529b)|(?:\u5e2e|\u80fd\u505a|\u80fd\u7ed9|\u80fd\u5e72).{0,20}(?:\u8d22\u52a1|\u8d26\u5355|\u62a5\u8868|\u5bf9\u8d26|\u53d1\u7968)/i.test(value)
}

function buildOpenClawFinanceCapabilityReply() {
  return [
    '\u8d22\u52a1\u4e0a\uff0c\u6211\u53ef\u4ee5\u5e2e\u4f60\u505a\u6570\u636e\u8bfb\u53d6\u3001\u6574\u7406\u548c\u5bf9\u8d26\u7c7b\u5de5\u4f5c\u3002',
    '\u4f8b\u5982\uff1a\u8bfb\u53d6\u8d26\u5355\u6216\u9875\u9762\u4fe1\u606f\u3001\u6574\u7406 Excel/CSV\u3001\u5bf9\u6bd4\u6536\u652f\u3001\u68c0\u67e5\u53d1\u7968\u548c\u751f\u6210\u62a5\u8868\u8349\u7a3f\u3002',
    '\u6d89\u53ca\u767b\u5f55\u3001\u4ed8\u6b3e\u3001\u63d0\u4ea4\u6216\u5220\u9664\u7684\u52a8\u4f5c\uff0c\u6211\u4f1a\u5148\u505c\u4e0b\u6765\u8ba9\u4f60\u624b\u52a8\u786e\u8ba4\u3002',
  ].join('\n\n')
}

function buildOpenClawCapabilitySummaryReply() {
  return getAgentCapabilityIntro('openclaw') || [
    '我是 OpenClaw Agent，主要负责浏览器、桌面和工具执行类任务。',
    '当前能力口径：tools.profile=coding；包括 skills、opr、exec、collaboration、电商 ecommerce 辅助、OCR、文件/表格和网页读取。',
    '安全 safety 边界：付款、下单、发布、登录、删除、私信/发送等高风险动作必须等待人工确认。',
  ].join('\n\n')
}

function maybeHandleOpenClawLocalAnswer(text) {
  const value = String(text || '').trim()
  if (!value) return { handled: false }
  const ecommerce = classifyOpenClawEcommerceRequest(value)
  if (ecommerce.blocked || isOpenClawDirectHighRiskText(value)) {
    return {
      handled: true,
      kind: 'safety',
      reply: buildOpenClawEcommerceVisibleReply(value) || buildOpenClawHighRiskSafetyReply(),
    }
  }
  if (isOpenClawBroadCapabilityQuestion(value)) {
    return {
      handled: true,
      kind: 'capability',
      reply: buildOpenClawCapabilitySummaryReply(),
    }
  }
  if (shouldAnswerOpenClawEcommerceCapability(value)) {
    return {
      handled: true,
      kind: 'ecommerce',
      reply: buildOpenClawEcommerceVisibleReply(value),
    }
  }
  if (isOpenClawOcrCapabilityQuestion(value)) {
    return {
      handled: true,
      kind: 'ocr-capability',
      reply: buildOpenClawOcrCapabilityReply(),
    }
  }
  if (isOpenClawFinanceCapabilityQuestion(value)) {
    return {
      handled: true,
      kind: 'finance',
      reply: buildOpenClawFinanceCapabilityReply(),
    }
  }
  if (isOpenClawSkillsQuestion(value)) {
    return { handled: false, kind: 'skills-intent' }
  }
  if (isOpenClawCapabilitySummaryQuestion(value)) {
    return {
      handled: true,
      kind: 'capability',
      reply: buildOpenClawCapabilitySummaryReply(),
    }
  }
  return { handled: false }
}

function clearOpenClawRuntimeForLocalAnswer(clientRequestId = '') {
  showTyping(false)
  _cancelResponseWatchdog()
  clearGenerationTimeoutManager()
  clearTimeout(_streamSafetyTimer)
  _openClawPendingResponse = false
  _openClawActiveRequestClosed = true
  stopOpenClawProgressHistoryPolling()
  _isSending = false
  _isStreaming = false
  _manualStopRequested = false
  if (clientRequestId) _inFlightRequestIds.delete(clientRequestId)
  if (_activeClientRequestId === clientRequestId) _activeClientRequestId = null
  _currentAiBubble = null
  _currentAiText = ''
  _currentAiStreamRawText = ''
  _currentAiImages = []
  _currentAiVideos = []
  _currentAiAudios = []
  _currentAiFiles = []
  _currentAiTools = []
  _currentAiBubbleRequestId = ''
  _currentRunId = null
  finishOpenClawActiveRun('completed', 'local-answer')
  _sendTimestamp = 0
  _lastResponseActivityAt = 0
  updateSendState()
}

function scheduleOpenClawBrowserToolFallback(clientRequestId = '', userText = '') {
  if (!isOpenClawBrowserScreenshotIntent(userText)) return
  clearTimeout(_streamSafetyTimer)
  _streamSafetyTimer = setTimeout(() => {
    if (clientRequestId && _activeClientRequestId && _activeClientRequestId !== clientRequestId) return
    if (!_openClawPendingResponse && !_isSending && !_isStreaming) return
    if (hasOpenClawAssistantVisibleContentForRequest(clientRequestId)) return
    const fallback = buildOpenClawToolUnavailableReply(userText)
    if (!fallback) return
    appendAiMessage(fallback, new Date(), [], [], [], [], [], [], [], {
      dedupeKey: `openclaw-browser-tool-fallback-${clientRequestId || Date.now()}`,
      sessionKey: _sessionKey,
    })
    saveMessage({
      id: `openclaw-browser-tool-fallback-${clientRequestId || uuid()}`,
      sessionKey: _sessionKey,
      role: 'assistant',
      content: fallback,
      timestamp: Date.now(),
    })
    clearOpenClawGenerationState('browser-tool-unavailable-fallback', clientRequestId)
    resetStreamState()
    processMessageQueue()
  }, 12000)
}

function appendOpenClawLocalAnswer(text, attachments = [], clientRequestId = createOpenClawClientRequestId(), local = {}) {
  const reply = completeOpenClawVisibleReply(local.reply || '', text)
  if (!reply) return false
  const now = Date.now()
  clearOpenClawRuntimeForLocalAnswer(clientRequestId)
  _lastVisibleUserText = text
  appendUserMessage(text, attachments, new Date(now), {
    dedupeKey: `openclaw-user-${clientRequestId}`,
    sessionKey: _sessionKey,
    clientRequestId,
    userMessageId: `openclaw-user-${clientRequestId}`,
    createdAt: now,
  })
  saveMessage({
    id: `openclaw-user-${clientRequestId}`,
    sessionKey: _sessionKey,
    role: 'user',
    content: text,
    timestamp: now,
    createdAt: now,
    clientRequestId,
    attachments: attachments?.length ? serializeOpenClawAttachments(attachments) : undefined,
  })
  appendAiMessage(reply, new Date(now + 1), [], [], [], [], [], [], [], {
    dedupeKey: `openclaw-local-${local.kind || 'answer'}-${clientRequestId}`,
    sessionKey: _sessionKey,
  })
  saveMessage({
    id: `openclaw-local-${local.kind || 'answer'}-${clientRequestId}`,
    sessionKey: _sessionKey,
    role: 'assistant',
    content: reply,
    timestamp: now + 1,
  })
  return true
}

function appendOpenClawLocalEcommerceAnswer(text, attachments = [], clientRequestId = createOpenClawClientRequestId()) {
  const local = maybeHandleOpenClawLocalAnswer(text)
  if (!local.handled) return false
  return appendOpenClawLocalAnswer(text, attachments, clientRequestId, local)
}

function appendHermesDelegationCapabilityAnswer(text, attachments = []) {
  appendUserMessage(text, attachments)
  appendSystemMessage([
    '可以把工作交给 Hermes 执行。',
    '',
    '当前可用方式：',
    '1. 在 OpenClaw 输入 `/hermes 任务内容` 或 `/delegate-hermes 任务内容`，会把任务写入 Hermes 执行队列。',
    '2. Hermes 页面里的“协作任务”可以把任务分配给 OpenClaw 或 Claude Code。',
    '3. OpenClaw / Claude Code 可以向 Hermes 回传进度、结果、失败原因，或继续委派。',
    '',
    '准确结论：可委派到 Hermes；系统会打开 Hermes 面板并自动启动执行。它仍不是无界面后台 worker，执行过程在 Hermes 会话里可见。',
  ].join('\n'))
}

function createOpenClawClientRequestId() {
  return `openclaw-${uuid()}`
}

function withOpenClawIdentityPrelude(prompt) {
  const body = String(prompt || '').trim()
  // Keep regular OpenClaw requests clean. Identity questions are answered locally,
  // and injecting this hidden context into every Gateway request bloats history and
  // can pollute the runtime prompt when legacy text is not decoded correctly.
  return body
}

function stripOpenClawIdentityPrelude(text) {
  const raw = String(text || '')
  const legacyIdentitySource = raw.includes(OPENCLAW_IDENTITY_CONTEXT_START) ? raw : raw
  const escapedStart = OPENCLAW_IDENTITY_CONTEXT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = OPENCLAW_IDENTITY_CONTEXT_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return legacyIdentitySource
    .replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '')
    .replace(/^User:\s*/i, '')
    .trim()
}

function stripOpenClawRuntimePromptBlocks(text) {
  let next = stripOpenClawIdentityPrelude(text)
  const blockNames = [
    'BROWSER_TOOL_TRIGGER',
    'DESKTOP_CONTROL_TRIGGER',
    'OPENCLAW_TOOL_TRIGGER',
    'NATIVE_INSPECTION_REQUIRED',
    'CAPABILITY_AUDIT_TRIGGER',
    'OPENCLAW_IDENTITY_CONTEXT',
    // These are transport-only attachment instructions appended before the
    // native Gateway run. They must never affect the visible prompt or the
    // active-turn fingerprint used to attach live tool frames to the UI.
    'DOCUMENT_ATTACHMENT_CONTEXT',
    // Image-upload transport blocks are injected by buildAttachmentTriggeredPrompt.
    // They are appended to the sent user text and persisted in native history,
    // so they must be stripped too or the history fingerprint can never match
    // the visible bubble fingerprint and the active turn never finalizes.
    'IMAGE_ATTACHMENT_CONTEXT',
    '图片识别触发',
  ]
  for (const name of blockNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    next = next.replace(new RegExp(`\\s*\\[${escaped}\\][\\s\\S]*?\\[/${escaped}\\]\\s*`, 'gi'), ' ')
  }
  return next
    .replace(/\s*\[(?:BROWSER_TOOL_TRIGGER|DESKTOP_CONTROL_TRIGGER|OPENCLAW_TOOL_TRIGGER|NATIVE_INSPECTION_REQUIRED|CAPABILITY_AUDIT_TRIGGER|OPENCLAW_IDENTITY_CONTEXT|DOCUMENT_ATTACHMENT_CONTEXT|IMAGE_ATTACHMENT_CONTEXT|图片识别触发)\][\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripOpenClawHistoryUserTimestamp(text = '') {
  return String(text || '')
    .replace(/^\[[A-Z][a-z]{2}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+GMT[+-]\d+\]\s*/u, '')
    .trim()
}

function openClawVisibleUserText(text) {
  return stripOpenClawHistoryUserTimestamp(stripOpenClawRuntimePromptBlocks(text))
}

const OPENCLAW_INTERNAL_REASONING_VISIBLE_FALLBACK =
  '\u6211\u4f1a\u7528\u4e2d\u6587\u76f4\u63a5\u7ed9\u7ed3\u8bba\uff1a\u5185\u90e8\u601d\u8003\u548c\u5ba1\u8ba1\u8fc7\u7a0b\u5df2\u9690\u85cf\u3002\u8bf7\u91cd\u65b0\u53d1\u9001\u95ee\u9898\uff0c\u6211\u4f1a\u53ea\u4fdd\u7559\u6700\u7ec8\u4e2d\u6587\u7ed3\u8bba\u3002'

const OPENCLAW_INTERNAL_REASONING_PATTERNS = [
  /\bCAPABILITY_AUDIT_TRIGGER\b/i,
  /\bThe user is asking\b/i,
  /\bThe user keeps asking\b/i,
  /\bThe user wants\b/i,
  /\bI've been running\b/i,
  /\bI have been running\b/i,
  /\bI should\b/i,
  /\bI need to\b/i,
  /\bI think\b/i,
  /\bLet me\b/i,
  /\bActually,?\s+I\b/i,
  /\bHUGE red flag\b/i,
  /\bred flag\b/i,
  /\bsocial engineering\b/i,
  /\bscam attempt\b/i,
  /\bReply in Simplified Chinese\b/i,
  /\bInspect currently available tools\b/i,
  /\bUse skill_manager\b/i,
  /\bOnly call skill_manager\b/i,
  /\bAcknowledge the request\b/i,
  /\bGive the concise summary\b/i,
  /\bAsk if there'?s\b/i,
  /\binternal reasoning\b/i,
  /\bscratchpad\b/i,
  /\bpolicy analysis\b/i,
]

function normalizeOpenClawReasoningProbeLine(line) {
  return String(line || '')
    .replace(/^[\s>*\-+•\u2022\u2705\u2611\ufe0f\u261d\ufe0f\u{1f449}\u{1f4ac}]+/gu, '')
    .trim()
}

function containsOpenClawInternalReasoningOutput(text) {
  const value = String(text || '')
  if (!value) return false
  return OPENCLAW_INTERNAL_REASONING_PATTERNS.some(pattern => pattern.test(value))
}

function isMostlyEnglishOpenClawReasoningLine(line) {
  const value = normalizeOpenClawReasoningProbeLine(line)
  if (!value) return false
  const latinWords = (value.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) || []).length
  const chineseChars = (value.match(/[\u3400-\u9fff]/g) || []).length
  return latinWords >= 8 && chineseChars < 4
}

function isOpenClawInternalReasoningLine(line) {
  const value = normalizeOpenClawReasoningProbeLine(line)
  if (!value) return false
  return OPENCLAW_INTERNAL_REASONING_PATTERNS.some(pattern => pattern.test(value))
}

function stripOpenClawInternalReasoningOutput(text) {
  const value = String(text || '')
  if (!value) return ''
  let next = value
    .replace(/\[CAPABILITY_AUDIT_TRIGGER\][\s\S]*?\[\/CAPABILITY_AUDIT_TRIGGER\]/gi, '')
    .replace(/<scratchpad>[\s\S]*?<\/scratchpad>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')

  if (!containsOpenClawInternalReasoningOutput(next)) return next.trim()

  const lines = next.split(/\r?\n/)
  const kept = []
  let droppingEnglishReasoning = false
  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      if (kept.length) kept.push('')
      continue
    }
    const isReasoning = isOpenClawInternalReasoningLine(trimmed)
    if (isReasoning || (droppingEnglishReasoning && isMostlyEnglishOpenClawReasoningLine(trimmed))) {
      droppingEnglishReasoning = true
      continue
    }
    droppingEnglishReasoning = false
    kept.push(rawLine)
  }

  next = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return next
}

function stripOpenClawInternalProcessText(text) {
  const preserveShortLiteral = isOpenClawSafeShortLiteralReply(text)
  const cleaned = []
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line) continue
    if (isInternalToolPlaceholderText(line, { allowShortLiteral: preserveShortLiteral })) continue
    if (/^(?:_?\(?stopped\)?_?|HEARTBEAT_OK|heartbeat_ok)$/i.test(line)) continue
    if (/(?:\u5185\u90e8\u63a8\u7406|\u98ce\u9669\u5206\u6790|\u6267\u884c\u8fc7\u7a0b|\u5de5\u5177\u8c03\u7528\u8fc7\u7a0b).{0,12}(?:\u5df2\u9690\u85cf|\u4e0d\u5c55\u793a)/.test(line)) continue
    if (/(?:\u5c55\u5f00\u8be6\u60c5|\u6536\u8d77\u8be6\u60c5|\u7ed3\u679c\u5df2\u540c\u6b65|\u5df2\u540c\u6b65\u5230\u4e0b\u65b9\u8be6\u60c5|\u56de\u590d\u7b49\u5f85\u65f6\u95f4\u8f83\u957f|\u53ef\u80fd\u4ecd\u5728\u751f\u6210|\u672c\u6b21\u56de\u590d\u5df2\u505c\u6b62|\u751f\u6210\u5df2\u505c\u6b62)/.test(line)) continue
    line = line
      .replace(/(?:\u5c55\u5f00\u8be6\u60c5|\u6536\u8d77\u8be6\u60c5|\u7ed3\u679c\u5df2\u540c\u6b65(?:\u5230\u4e0b\u65b9\u8be6\u60c5)?)/g, '')
      .replace(/\bTool\s+tool\b/gi, '')
      .replace(/\bHEARTBEAT_OK\b/gi, '')
      .trim()
    if (!line) continue
    cleaned.push(line)
  }
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function isOpenClawFriendlyToolSummaryText(text) {
  const value = String(text || '').trim()
  if (!value) return false
  return /^(?:Skills\s*\u67e5\u8be2(?:\u6210\u529f|\u5df2\u5b8c\u6210)|[\s\S]{0,40}\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210)[\s\S]{0,360}$/i.test(value)
}

function isOpenClawToolDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search || '')
    const value = params.get('openclawToolDebug') ||
      params.get('debugOpenClawTools') ||
      localStorage.getItem('superclaw-openclaw-tool-debug') ||
      ''
    return /^(?:1|true|yes|on)$/i.test(String(value).trim())
  } catch {
    return false
  }
}

function isOpenClawTransientProbeError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  const name = String(error?.name || '').toLowerCase()
  return name === 'aborterror'
    || message.includes('abort')
    || message.includes('aborted')
    || message.includes('signal is aborted')
    || message.includes('timeout')
    || message.includes('timed out')
}

function isOpenClawToolLikeMessage(message = {}) {
  const role = String(message?.role || '').toLowerCase()
  const type = String(message?.type || message?.kind || '').toLowerCase()
  const text = String(message?.content || message?.text || '').trim()
  if (role === 'tool' || role === 'toolresult') return true
  if (type === 'tool' || type === 'tool_result' || type === 'toolresult') return true
  if (type === 'terminal') return true
  if (message?.toolCall || message?.toolResult || message?.terminal) return true
  if (/^\s*\u5de5\u5177\u8c03\u7528\u5df2\u5b8c\u6210[.!?\u3002\uff01\uff1f]*\s*$/.test(text)) return true
  if (/^tool call completed\.?$/i.test(text)) return true
  if (/^tool completed\.?$/i.test(text)) return true
  if (/^(?:stdout|stderr|terminal)\s*[:=]/i.test(text)) return true
  return false
}

function shouldRenderOpenClawToolMessage(message = {}) {
  return isOpenClawToolLikeMessage(message)
}

function isOpenClawPlainCapabilitySummaryText(text) {
  const value = String(text || '').trim()
  if (!value) return false
  return /OpenClaw Agent/.test(value) &&
    /\u4e3b\u8981\u8d1f\u8d23(?:\u6d4f\u89c8\u5668|\u684c\u9762|\u5de5\u5177)/.test(value) &&
    /\u5e38\u7528\u80fd\u529b\u5305\u62ec/.test(value)
}

function isOpenClawToolOnlySummaryText(text) {
  const value = String(text || '').trim()
  if (!value) return true
  if (isOpenClawPlainCapabilitySummaryText(value)) return false
  if (isOpenClawFriendlyToolSummaryText(value)) return true
  if (isInternalToolPlaceholderText(value)) return true
  return /(?:\u7ed3\u679c\u5df2\u540c\u6b65|\u5de5\u5177(?:\u6267\u884c|\u8c03\u7528)?\u6210\u529f|Tool\s+tool|tool_result|tool call|raw json|stdout|stderr)/i.test(value)
}

function isOpenClawExactLiteralReplyRequest(text) {
  const value = String(text || '').trim()
  if (!value) return false
  return /^(?:only\s+reply|reply\s+only|just\s+reply|respond\s+only)\s+["'`]?[A-Za-z0-9_.-]{1,40}["'`]?[.!?]?\s*$/i.test(value)
    || /^(?:\u53ea|\u4ec5|\u53ea\u9700|\u4ec5\u9700|\u53ea\u8981|\u53ea\u9700\u8981)?\s*(?:\u56de\u590d|\u56de\u7b54|\u8f93\u51fa)\s*["'`]?[A-Za-z0-9_.-]{1,40}["'`]?[。.!?？]?\s*$/.test(value)
}

function isOpenClawSafeShortLiteralReply(text) {
  return /^(?:OK|YES|NO|DONE|PASS|FAIL|READY|SUCCESS|ERROR|SKIPPED)$/i.test(String(text || '').trim())
}

function stripOpenClawRepeatedLeadingStatusGlyphs(text) {
  const raw = String(text || '')
  const leadingSpace = raw.match(/^\s*/)?.[0] || ''
  const body = raw.slice(leadingSpace.length)
  const statusGlyph = String.raw`(?:[\u2705\u2611\u2714\u2713\u26a0]\ufe0f?)`
  const literalMatch = body.match(new RegExp(`^(?:${statusGlyph}\\s*)+([A-Za-z0-9_.-]{1,40})\\s*$`, 'u'))
  if (literalMatch && isOpenClawSafeShortLiteralReply(literalMatch[1])) {
    return `${leadingSpace}${literalMatch[1].toUpperCase()}`
  }
  const match = body.match(new RegExp(`^(?:${statusGlyph}\\s*){2,}`, 'u'))
  if (!match) return raw
  return `${leadingSpace}${body.slice(match[0].length).trimStart()}`
}

function getOpenClawRequestedShortLiteral(text) {
  const value = String(text || '').trim()
  if (!value) return ''
  const exactTarget = getOpenClawExactShortReplyTarget(value)
  if (exactTarget) return exactTarget
  const match = value.match(/^(?:only\s+reply|reply\s+only|just\s+reply|respond\s+only)\s+["'`]?([A-Za-z0-9_.-]{1,40})["'`]?[.!?]?\s*$/i)
    || value.match(/(?:\u56de\u590d|\u56de\u7b54|\u8f93\u51fa)\s*["'`]?([A-Za-z0-9_.-]{1,40})["'`]?/i)
  const literal = match?.[1]?.trim() || ''
  return isOpenClawSafeShortLiteralReply(literal) ? literal.toUpperCase() : ''
}

function recoverOpenClawSilentReplyForExactLiteral(text, userText = _activeOpenClawUserText) {
  if (!/^\s*NO_REPLY\s*$/i.test(String(text || ''))) return ''
  return getOpenClawRequestedShortLiteral(userText)
}

function isOpenClawAssistantFailurePlaceholderText(text) {
  return String(text || '').trim() === OPENCLAW_ASSISTANT_FAILED_PLACEHOLDER
}

function sanitizeOpenClawVisibleReply(text, userText = _activeOpenClawUserText || _lastVisibleUserText) {
  const silentLiteral = recoverOpenClawSilentReplyForExactLiteral(text, userText)
  if (silentLiteral) return silentLiteral
  const visibleInput = stripOpenClawRepeatedLeadingStatusGlyphs(text)
  const withoutBlocks = stripOpenClawInternalBlocks(visibleInput)
  const withoutReasoning = stripOpenClawInternalReasoningOutput(withoutBlocks)
  // A tool-use prelude can be entirely internal prose. Keep it empty so the
  // real tool cards and final answer render instead of replacing the turn with
  // a misleading generic retry message.
  const safeInput = withoutReasoning || (containsOpenClawInternalReasoningOutput(visibleInput) ? '' : visibleInput)
  return stripOpenClawRawToolLines(stripOpenClawInternalReasoningOutput(stripOpenClawInternalProcessText(
    sanitizeVisibleReplyForChinese(safeInput, userText, {
      agent: 'openclaw',
      allowEnglish: isOpenClawExactLiteralReplyRequest(userText) || isOpenClawSafeShortLiteralReply(text),
      preserveNonReasoningEnglish: !containsOpenClawInternalReasoningOutput(safeInput),
    })
  )))
}

// Gateway history may include a tool-call block as a standalone text line.
// Keep the agent's written progress sentence, but reserve machine tool names
// for the execution timeline so they never read like an assistant response.
function stripOpenClawRawToolLines(text) {
  const rawToolName = /^(?:web_(?:search|fetch)|browser(?:_[a-z0-9_-]+)?|exec|command|process|shell|terminal|bash|powershell|cmd|python|node|playwright|puppeteer|superclaw_[a-z0-9_-]+|video_generate|image_generate|ocr(?:_[a-z0-9_-]+)?)$/i
  return String(text || '')
    .split(/\r?\n/)
    .filter(line => !rawToolName.test(line.trim().replace(/^[*-]\s*/, '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function completeOpenClawVisibleReply(text, userText = _lastVisibleUserText) {
  return sanitizeOpenClawVisibleReply(text, userText)
}

function extractOpenClawTextPart(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(item => extractOpenClawTextPart(item))
      .filter(Boolean)
      .join('\n')
  }
  if (typeof value !== 'object') return ''
  if (typeof value.text === 'string') return value.text
  if (typeof value.content === 'string') return value.content
  if (typeof value.value === 'string') return value.value
  if (typeof value.output === 'string') return value.output
  if (typeof value.output_text === 'string') return value.output_text
  if (typeof value.outputText === 'string') return value.outputText
  if (typeof value.reply === 'string') return value.reply
  if (typeof value.response === 'string') return value.response
  if (typeof value.result === 'string') return value.result
  if (typeof value.finalText === 'string') return value.finalText
  if (value.type === 'text' && typeof value.text === 'string') return value.text
  if (value.type === 'output_text' && typeof value.text === 'string') return value.text
  if (Array.isArray(value.content)) return extractOpenClawTextPart(value.content)
  if (Array.isArray(value.output)) return extractOpenClawTextPart(value.output)
  if (Array.isArray(value.result)) return extractOpenClawTextPart(value.result)
  if (Array.isArray(value.parts)) return extractOpenClawTextPart(value.parts)
  if (value.message) return extractOpenClawTextPart(value.message)
  if (value.delta) return extractOpenClawTextPart(value.delta)
  if (value.data) return extractOpenClawTextPart(value.data)
  return ''
}

function extractOpenClawAssistantText(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) return extractOpenClawTextPart(payload)

  const candidates = [
    payload.content,
    payload.text,
    payload.output_text,
    payload.outputText,
    payload.reply,
    payload.response,
    payload.result,
    payload.assistantTexts,
    payload.data?.assistantTexts,
    payload.artifacts?.assistantTexts,
    payload.data?.artifacts?.assistantTexts,
    payload.trace?.assistantTexts,
    payload.trace?.artifacts?.assistantTexts,
    payload.message?.assistantTexts,
    payload.message?.data?.assistantTexts,
    payload.message?.artifacts?.assistantTexts,
    payload.delta,
    payload.delta?.content,
    payload.delta?.text,
    payload.message,
    payload.message?.content,
    payload.message?.text,
    payload.data?.content,
    payload.data?.text,
    payload.data?.message,
    payload.data?.message?.content,
    payload.data,
    payload.event,
    payload.event?.content,
    payload.event?.text,
    payload.choices?.[0]?.message,
    payload.choices?.[0]?.message?.content,
    payload.choices?.[0]?.message?.text,
    payload.choices?.[0]?.delta,
    payload.choices?.[0]?.delta?.content,
    payload.choices?.[0]?.delta?.text,
    payload.choices?.[0]?.text,
  ]

  for (const candidate of candidates) {
    const text = extractOpenClawTextPart(candidate).trim()
    if (isOpenClawAssistantFailurePlaceholderText(text)) continue
    if (text) return text
  }
  return ''
}

function stripOpenClawInternalBlocks(text) {
  if (!text) return ''
  let next = stripThinkingTags(String(text))
  // A Gateway portable image line (MEDIA:<path>) is an internal output marker,
  // not assistant prose. The image itself is rendered separately through
  // extractOpenClawMediaImagePaths, so drop the raw line from visible text.
  next = next.replace(/(^|\n)[ \t]*MEDIA:[ \t]*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]*?)[ \t]*(?:\r?\n|$)/gi, '$1')
  // OpenClaw inline directive tags ([[reply_to_current]], [[reply_to:<id>]],
  // [[audio_as_voice]]) are gateway command markers, not assistant prose. The
  // runtime strips them for display; mirror that here so they never leak into
  // the chat (e.g. `[[reply_to_current]] 当然可以` renders as `当然可以`).
  next = next.replace(/\[\[\s*(?:reply_to_current|reply_to\s*:\s*[^\]\n]+)\s*\]\]/gi, '')
  next = next.replace(/\[\[\s*audio_as_voice\s*\]\]/gi, '')
  next = next.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
  next = next.replace(/```tool[\s\S]*?```/gi, '')
  next = next.replace(/```terminal[\s\S]*?```/gi, '')

  const visibleAnchor = next.match(/(?:^|\n)\s*(?:[#>\-\s]*)(?:\u5f53\u524d\u53ef\u7528\u80fd\u529b|\u7cbe\u7b80\u7248|\u7ed3\u8bba|\u53ef\u7528\u80fd\u529b|\u6211\u7684\u80fd\u529b|OpenClaw\s*\u53ef\u7528\u80fd\u529b)/)
  if (visibleAnchor && visibleAnchor.index > 0) {
    next = next.slice(visibleAnchor.index).trim()
  }

  const finalMarkers = [
    /(?:\u6700\u7ec8\u7b54\u590d|\u6700\u7ec8\u56de\u7b54|\u7ed9\u7528\u6237\u7684\u56de\u7b54|\u7b54\u590d)[:\uff1a]\s*([\s\S]+)$/i,
    /(?:final answer|final response)[:\uff1a]\s*([\s\S]+)$/i,
  ]
  for (const marker of finalMarkers) {
    const match = next.match(marker)
    if (match?.[1]?.trim()) {
      next = match[1].trim()
      break
    }
  }

  const internalOnlyPatterns = [
    /^\s*the user is asking me\b/i,
    /^\s*the user is asking\b/i,
    /^\s*the user wants\b/i,
    /^\s*i'?ve been running\b/i,
    /^\s*let me think\b/i,
    /^\s*i need to\b/i,
    /^\s*i should\b/i,
    /^\s*actually,\s*i should\b/i,
    /^\s*looking at\b/i,
    /^\s*wait,\s*looking\b/i,
    /^\s*this is a (huge )?red flag\b/i,
    /^\s*policy analysis\b/i,
    /^\s*internal reasoning\b/i,
    /^\s*scratchpad\b/i,
  ]

  return next
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return true
      return !internalOnlyPatterns.some(pattern => pattern.test(trimmed))
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeOpenClawVisibleAssistantText(payload, options = {}) {
  const raw = extractOpenClawAssistantText(payload)
  const userText = options.userText || _activeOpenClawUserText || _lastVisibleUserText
  const silentLiteral = recoverOpenClawSilentReplyForExactLiteral(raw, userText)
  if (silentLiteral) {
    return {
      text: silentLiteral,
      usedFallback: false,
      rawWasEmpty: false,
    }
  }
  const cleaned = stripOpenClawInternalBlocks(raw).trim()
  if (cleaned) {
    return {
      text: cleaned,
      usedFallback: false,
      rawWasEmpty: !raw.trim(),
    }
  }
  return {
    text: options.fallback ?? OPENCLAW_EMPTY_REPLY_FALLBACK,
    usedFallback: true,
    rawWasEmpty: !raw.trim(),
  }
}

function isOpenClawInternalReasoningLeak(text) {
  return containsOpenClawInternalReasoningOutput(text) ||
    /^(?:The user wants|User wants|The user is asking|I need to|I should|I think|Let me|We need to|Need to)\b/i.test(String(text || '').trim())
}

function isOpenClawMarkdownTableFragment(text) {
  const value = String(text || '').trim()
  if (!value) return false
  const pipeCount = (value.match(/\|/g) || []).length
  if (pipeCount < 3) return false
  if (/\|\s*-{2,}\s*\|/.test(value)) return true
  if (/(?:工具|能力|Skills?|可用|说明|结果|exec|browser|desktop|ocr|stdout|stderr)/i.test(value) && /\|[^|\n]*$/.test(value)) return true
  return false
}

function isOpenClawNumberedListFragment(text) {
  const value = String(text || '').trim()
  if (!value) return false
  const promisesMultipleItems = /(?:两条|二条|三条|四条|几条|多条|两种|二种|三种|几种|多种|如下|包括|路径|方式|步骤|清单)/.test(value)
  const hasFirstItem = /(?:^|\s|[：:])1[.、]/.test(value)
  const hasSecondItem = /(?:^|\s)2[.、]/.test(value)
  const endsCleanly = /[。！？.!?）)]$/.test(value)
  return promisesMultipleItems && hasFirstItem && !hasSecondItem && !endsCleanly
}

function isOpenClawLetteredListFragment(text) {
  const value = String(text || '').trim()
  if (!value) return false
  const promisesMultipleItems = /(?:两条|二条|三条|四条|几条|多条|两种|二种|三种|几种|多种|路径|方式|步骤|清单)/.test(value)
  const hasA = /(?:^|\s|[：:；;])A[.、\s]/i.test(value)
  const hasB = /(?:^|\s|[：:；;])B[.、\s]/i.test(value)
  const hasC = /(?:^|\s|[：:；;])C[.、\s]/i.test(value)
  const expectsThreeOrMore = /(?:三条|四条|几条|多条|三种|几种|多种)/.test(value)
  const danglingShortItem = /(?:[：:；;]\s*)?[A-Z][.、\s]+.{0,6}[给到要把发][。.!?]$/i.test(value)
  return promisesMultipleItems && hasA && ((!hasB) || (expectsThreeOrMore && !hasC) || danglingShortItem)
}

function buildOpenClawCapabilitySummaryFallback(userText = '', text = '') {
  const scope = `${userText}\n${text}`
  if (/OCR|识别|图片|截图|文字/i.test(scope)) {
    return '当前具备 OCR 相关能力：可以识别上传图片或截图中的文字，也可以配合浏览器/桌面截图读取页面内容。需要识别哪张图或哪个窗口时，请直接告诉我。'
  }
  if (/电商|抖店|小红书|订单|商品|付款|支付/.test(scope)) return ''
  if (!/(能力|工具|可用|OCR|截图|浏览器|桌面|协作|Skills?|skill|tool|能做|能帮|检查一下当前)/i.test(scope)) return ''
  return '当前可用：浏览器/桌面协助、文件与工作区处理、命令执行、截图/OCR、Skills 和工具调用。涉及登录、付款、提交、删除等高风险动作时，我会先停下来让你确认。'
}

function looksIncompleteOpenClawVisibleReply(text) {
  const value = String(text || '').trim()
  if (!value) return true
  if (isOpenClawMarkdownTableFragment(value)) return true
  if (isOpenClawNumberedListFragment(value)) return true
  if (isOpenClawLetteredListFragment(value)) return true
  if (/[、，,：:；;]$/.test(value)) return true
  if (/(?:包括|例如|如下|生成|导出|整理|读取|截图|利润表|资产负债表|现金流量表|工具|页面)$/.test(value)) return true
  if (/\([^)]*$/.test(value)) return true
  if (/^\|.+\|$/.test(value.split(/\r?\n/).pop() || '')) return true
  return false
}

function repairIncompleteOpenClawVisibleReply(text, userText = _lastVisibleUserText) {
  const value = String(text || '').trim()
  const incomplete = looksIncompleteOpenClawVisibleReply(value)
  const reasoningLeak = isOpenClawInternalReasoningLeak(value)
  if (!incomplete && !reasoningLeak) return value
  const unavailable = buildOpenClawToolUnavailableReply(userText)
  if (unavailable) return unavailable
  const capabilityFallback = buildOpenClawCapabilitySummaryFallback(userText, value)
  if (capabilityFallback) return capabilityFallback
  const base = value
    .replace(/[、，,：:；;\s]+$/, '。')
    .trim()
  if (!base) {
    return '这次没有拿到完整的可用结果，我不会把半截内容当成已完成。请你再发一次问题，我会重新整理成完整结论。'
  }
  return [
    base,
    '',
    '如果你给我具体页面、文件或目标，我可以继续按步骤整理；涉及登录、付款、提交或删除等高风险动作时，我会先停下来让你确认。',
  ].join('\n')
}

function getOpenClawSendFingerprint(text, attachments = []) {
  const attSig = (attachments || []).map(a => [
    a.category || a.type || '',
    a.mimeType || a.mime || '',
    a.fileName || a.name || '',
    a.content ? String(a.content).length : '',
    a.imageUrl || a.previewUrl || a.url || a.mediaPath || a.savedPath || a.localPath || a.filePath || a.path || '',
  ].join(':')).join('|')
  return `${String(text || '').trim()}::${attSig}`
}

function getOpenClawRequestFingerprint(text, attachments = []) {
  const session = _sessionKey || wsClient.sessionKey || 'agent:main:main'
  return `openclaw:${session}:${getOpenClawSendFingerprint(text, attachments)}`
}

function hasQueuedOpenClawRequestFingerprint(fingerprint) {
  if (!fingerprint) return false
  return _messageQueue.some(item => {
    if (typeof item === 'string') return getOpenClawRequestFingerprint(item, []) === fingerprint
    return item?.requestFingerprint === fingerprint ||
      getOpenClawRequestFingerprint(item?.text || '', item?.attachments || []) === fingerprint
  })
}

function isOpenClawDuplicatePendingRequest(fingerprint) {
  return Boolean(fingerprint && (
    _activeOpenClawSendFingerprints.has(fingerprint) ||
    hasQueuedOpenClawRequestFingerprint(fingerprint)
  ))
}

function rememberOpenClawRequestFingerprint(requestId, fingerprint) {
  if (!requestId || !fingerprint) return
  _requestFingerprintById.set(requestId, fingerprint)
  _activeOpenClawSendFingerprints.add(fingerprint)
}

function releaseOpenClawRequestFingerprint(requestId = null) {
  if (requestId) {
    const fingerprint = _requestFingerprintById.get(requestId)
    if (fingerprint) _activeOpenClawSendFingerprints.delete(fingerprint)
    _requestFingerprintById.delete(requestId)
    return
  }
  if (_activeClientRequestId) releaseOpenClawRequestFingerprint(_activeClientRequestId)
}

function purgeQueuedOpenClawRequestFingerprint(fingerprint) {
  if (!fingerprint || !_messageQueue.length) return
  _messageQueue = _messageQueue.filter(item => {
    if (typeof item === 'string') return getOpenClawRequestFingerprint(item, []) !== fingerprint
    const itemFingerprint = item?.requestFingerprint ||
      getOpenClawRequestFingerprint(item?.text || '', item?.attachments || [])
    return itemFingerprint !== fingerprint
  })
}

function isOpenClawGenerationActive() {
  return Boolean(
    _openClawPendingResponse ||
    _isSending ||
    _isStreaming ||
    _activeClientRequestId ||
    _currentAiBubble
  )
}

function createOpenClawActiveRun(input = {}) {
  const startedAt = Date.now()
  const openclawTurnId = input.openclawTurnId || createOpenClawTurnId()
  _activeOpenClawRun = {
    openclawTurnId,
    runId: input.runId || null,
    clientRequestId: input.clientRequestId || _activeClientRequestId || '',
    sessionKey: input.sessionKey || _sessionKey || '',
    userMessageId: input.userMessageId || '',
    assistantMessageId: input.assistantMessageId || '',
    userMessageIndex: Number.isFinite(input.userMessageIndex) ? input.userMessageIndex : -1,
    userText: input.userText || _activeOpenClawUserText || _lastVisibleUserText || '',
    userTextFingerprint: normalizeOpenClawPromptFingerprint(input.userText || _activeOpenClawUserText || _lastVisibleUserText || ''),
    promptHash: normalizeOpenClawPromptFingerprint(input.userText || _activeOpenClawUserText || _lastVisibleUserText || ''),
    accumulatedText: input.accumulatedText || '',
    status: input.status || 'pending',
    startedAt,
    updatedAt: startedAt,
  }
  return _activeOpenClawRun
}

function updateOpenClawActiveRun(patch = {}) {
  if (!_activeOpenClawRun) return null
  if (patch.clientRequestId && _activeOpenClawRun.clientRequestId && patch.clientRequestId !== _activeOpenClawRun.clientRequestId) return _activeOpenClawRun
  _activeOpenClawRun = {
    ..._activeOpenClawRun,
    ...patch,
    updatedAt: Date.now(),
  }
  if (patch.userText && !patch.userTextFingerprint) {
    _activeOpenClawRun.userTextFingerprint = normalizeOpenClawPromptFingerprint(patch.userText)
    _activeOpenClawRun.promptHash = _activeOpenClawRun.userTextFingerprint
  }
  return _activeOpenClawRun
}

function getOpenClawNativeRunId(value = {}) {
  return String(
    value?.runId ||
    value?.run_id ||
    value?.data?.runId ||
    value?.data?.run_id ||
    value?.run?.id ||
    '',
  )
}

function bindOpenClawNativeRun(value = {}, clientRequestId = _activeClientRequestId) {
  const runId = getOpenClawNativeRunId(value)
  if (!runId || !clientRequestId || clientRequestId !== _activeClientRequestId) return ''
  _currentRunId = runId
  updateOpenClawActiveRun({ clientRequestId, runId })
  return runId
}

function finishOpenClawActiveRun(status = 'completed', reason = '') {
  if (!_activeOpenClawRun) return null
  _activeOpenClawRun.status = status
  _activeOpenClawRun.reason = reason
  _activeOpenClawRun.updatedAt = Date.now()
  const finished = _activeOpenClawRun
  _activeOpenClawRun = null
  return finished
}

function isAbortLikeError(error) {
  const message = String(error?.message || error || '')
  return error?.name === 'AbortError'
    || /aborted/i.test(message)
    || /signal is aborted/i.test(message)
}

function isOpenClawGatewayConnectivityError(error) {
  const message = String(error?.message || error || '')
  return /ECONNREFUSED|ECONNRESET|ENOTFOUND|socket hang up|WebSocket.*closed|connection refused/i.test(message)
}

function isOpenClawGatewayAbortErrorText(value) {
  return /signal is aborted|aborted without reason|websocket.*(?:abort|close)|gateway.*(?:restart|reload|disconnect)|connection.*(?:abort|closed|reset)/i.test(String(value || ''))
}

function isOpenClawRuntimeReadyForAbortRecovery() {
  return Boolean(
    wsClient?.gatewayReady ||
    wsClient?.connected ||
    _openClawGatewayUiState === 'ready' ||
    hasOpenClawGatewayReadySignal(_openClawGatewayProbe)
  )
}

function shouldTreatOpenClawAbortAsRecoverable({ error, gatewayReady = false, wsReady = false, activeRun = false } = {}) {
  if (!isAbortLikeError(error)) return false
  if (!activeRun) return false
  return Boolean(gatewayReady || wsReady || isOpenClawRuntimeReadyForAbortRecovery())
}

function isOpenClawActiveRunErrorText(value) {
  return /ReplyRunAlreadyActiveError|reply run already active|run already active|already active for agent/i.test(String(value || ''))
}

function clearOpenClawTransientRecoveryTimer() {
  if (!_openClawTransientRecoveryTimer) return
  clearTimeout(_openClawTransientRecoveryTimer)
  _openClawTransientRecoveryTimer = null
}

function clearOpenClawToolFinalRecoveryTimer() {
  if (!_openClawToolFinalRecoveryTimer) return
  clearTimeout(_openClawToolFinalRecoveryTimer)
  _openClawToolFinalRecoveryTimer = null
}

function scheduleOpenClawToolFinalRecovery(requestId = null) {
  if (!_activeOpenClawRun || !_sessionKey || _openClawToolFinalRecoveryTimer) return false
  const activeRequestId = requestId || _activeOpenClawRun.clientRequestId || _activeClientRequestId || null
  _openClawToolFinalRecoveryTimer = setTimeout(() => {
    _openClawToolFinalRecoveryTimer = null
    if (!isOpenClawGenerationActive()) return
    if (activeRequestId && _activeClientRequestId && activeRequestId !== _activeClientRequestId) return
    recoverOpenClawAssistantFromHistoryBeforeFallback('tool-final-history-recovery', activeRequestId, {
      attempts: 40,
      delayMs: 1000,
    }).catch(error => {
      console.warn('[chat] OpenClaw tool final history recovery failed:', error)
    })
  }, 700)
  return true
}

function scheduleOpenClawTransientRecovery(reason = 'transient-disconnect', options = {}) {
  if (!isOpenClawGenerationActive()) return false
  clearOpenClawTransientRecoveryTimer()
  const delayMs = Math.max(1000, Number(options.delayMs || 8000))
  _openClawTransientRecoveryTimer = setTimeout(() => {
    _openClawTransientRecoveryTimer = null
    if (!isOpenClawGenerationActive()) return
    recoverOpenClawGenerationAfterTransientDisconnect(reason, options).catch(error => {
      console.warn('[chat] OpenClaw delayed transient recovery failed:', error)
    })
  }, delayMs)
  return true
}

async function recoverOpenClawGenerationAfterTransientDisconnect(reason = 'transient-disconnect', options = {}) {
  if (!isOpenClawGenerationActive()) return false
  clearOpenClawTransientRecoveryTimer()
  const requestId = _activeClientRequestId
  const fingerprint = requestId ? _requestFingerprintById.get(requestId) : null
  if (fingerprint) purgeQueuedOpenClawRequestFingerprint(fingerprint)
  const now = Date.now()
  const shouldNotify = options.notify !== false && now - _lastOpenClawTransientRecoveryAt > 5000
  _lastOpenClawTransientRecoveryAt = now
  clearOpenClawGenerationState(reason, requestId)
  resetStreamState()
  if (shouldNotify && !isOpenClawRuntimeReadyForAbortRecovery()) {
    toast(options.message || 'OpenClaw 连接中断，已恢复发送状态；如果回复没有完整显示，请重试或继续。', 'warning')
  }
  if (_sessionKey && _messagesEl && _pageActive) {
    try {
      showTyping(true, t('chat.aiThinking'))
      const recovered = await recoverOpenClawAssistantFromHistoryBeforeFallback(reason, requestId, {
        attempts: options.attempts || 10,
        delayMs: options.delayMs || 900,
      })
      if (recovered) return true
    } catch (error) {
      console.warn('[chat] OpenClaw transient recovery history merge failed:', error)
    }
  }
  if (_currentAiBubble && _currentAiText) {
    renderCompactAssistantContent(_currentAiText, _currentAiBubble, { phase: 'incomplete' })
  } else if (getOpenClawRequestedShortLiteral(_activeOpenClawUserText || _lastVisibleUserText)) {
    const literal = getOpenClawRequestedShortLiteral(_activeOpenClawUserText || _lastVisibleUserText)
    appendAiMessage(literal, new Date(), [], [], [], [], [], [], [], {
      dedupeKey: getOpenClawHistoryDisplayDedupeKey('assistant', literal, Date.now()),
      sessionKey: _sessionKey,
    })
    clearOpenClawGenerationState(`${reason}-literal-recovered`, requestId)
    resetStreamState()
    updateSendState()
    return true
  } else if (isOpenClawRuntimeReadyForAbortRecovery() && !_manualStopRequested) {
    const deferCount = Number(options.deferCount || 0)
    if (deferCount < 4) {
      showTyping(true, t('chat.aiThinking'))
      scheduleOpenClawTransientRecovery(`${reason}-deferred`, {
        ...options,
        notify: false,
        attempts: Math.max(6, Number(options.attempts || 0)),
        delayMs: Math.max(1200, Number(options.delayMs || 0)),
        deferCount: deferCount + 1,
      })
      return true
    }
  } else if (_messagesEl && _pageActive) {
    appendSystemMessage('请求已中断，但 OpenClaw Gateway 仍在线。请重试，或稍后刷新会话查看是否已生成结果。')
  }
  clearOpenClawGenerationState(`${reason}-recover-failed`, requestId)
  updateSendState()
  return true
}

function rememberBounded(set, key, limit = 400) {
  if (!key) return
  set.add(key)
  if (set.size > limit) {
    const first = set.values().next().value
    set.delete(first)
  }
}

function normalizeOpenClawMessageText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hashOpenClawMessageText(value) {
  const text = normalizeOpenClawMessageText(value)
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i)
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`
}

function getOpenClawToolDisplayText(tools = []) {
  return (Array.isArray(tools) ? tools : [])
    .map(tool => normalizeOpenClawMessageText(tool?.output ?? tool?.result ?? tool?.content ?? tool?.name ?? tool?.id ?? ''))
    .filter(Boolean)
    .join('|')
}

function getOpenClawDisplayFingerprint(message = {}) {
  const role = (message.role === 'tool' || message.role === 'toolResult') ? 'assistant' : (message.role || '')
  const rawText = message.text ?? message.content ?? ''
  const visibleText = role === 'user' ? openClawVisibleUserText(rawText) : sanitizeOpenClawVisibleReply(rawText)
  const text = normalizeOpenClawMessageText(visibleText)
  const toolText = getOpenClawToolDisplayText(message.tools)
  const mediaSig = [
    message.images?.length || 0,
    message.videos?.length || 0,
    message.audios?.length || 0,
    message.files?.length || 0,
    message.screenshotCards?.length || 0,
    message.confirmations?.length || 0,
  ].join(':')
  const hasMedia = mediaSig !== '0:0:0:0:0:0'
  const body = text || toolText || (hasMedia ? mediaSig : '')
  return body ? hashOpenClawMessageText(body) : ''
}

function getOpenClawMessageDedupeKey(message = {}, sessionKey = _sessionKey) {
  const session = message.sessionKey || sessionKey || ''
  const role = (message.role === 'tool' || message.role === 'toolResult') ? 'assistant' : (message.role || '')
  const display = getOpenClawDisplayFingerprint(message)
  const runId = message.runId || message.run_id || ''
  if (role === 'assistant' && runId && display) return `${session}|run:${runId}|display:${display}`
  const stableId = message.id || message.messageId || message.message_id || ''
  if (stableId) return `${session}|id:${stableId}`
  const eventId = message.eventId || message.event_id || ''
  if (eventId) return `${session}|event:${eventId}`
  const requestId = message.idempotencyKey || message.clientRequestId || message.requestId || ''
  if (requestId) return `${session}|request:${requestId}:${role}`
  if (runId && display) return `${session}|run:${runId}:${role}:${display}`
  const ts = normalizeTime(message.timestamp || message.createdAt || message.created_at || 0)
  if (display && ts) return `${session}|display:${role}:${display}:${Math.floor(ts / 1000)}`
  if (role === 'user') return ''
  return display ? `${session}|display:${role}:${display}` : ''
}

function getOpenClawHistoryDisplayDedupeKey(message = {}, sessionKey = _sessionKey) {
  const session = message.sessionKey || sessionKey || ''
  const role = (message.role === 'tool' || message.role === 'toolResult') ? 'assistant' : (message.role || '')
  const display = getOpenClawDisplayFingerprint(message)
  if (!session || !role || !display) return ''
  const ts = normalizeTime(message.timestamp || message.createdAt || message.created_at || 0)
  if (role === 'user' && !ts) return ''
  const bucket = ts ? Math.floor(ts / 1000) : 'no-ts'
  return `${session}|history-display:${role}:${display}:${bucket}`
}

function getRenderedMessageSet(sessionKey = _sessionKey) {
  const key = normalizeOpenClawSessionKey(sessionKey || _sessionKey)
  if (!_renderedMessageKeysBySession.has(key)) _renderedMessageKeysBySession.set(key, new Set())
  return _renderedMessageKeysBySession.get(key)
}

function hasRenderedOpenClawMessage(sessionKey, dedupeKey) {
  if (!dedupeKey) return false
  const key = normalizeOpenClawSessionKey(sessionKey || _sessionKey)
  const set = _renderedMessageKeysBySession.get(key)
  if (set?.has(dedupeKey)) return true
  return hasVisibleRenderedOpenClawMessage(key, dedupeKey)
}

function hasVisibleRenderedOpenClawMessage(sessionKey, dedupeKey) {
  if (!dedupeKey || !_messagesEl) return false
  const targetSessionKey = normalizeOpenClawSessionKey(sessionKey || _sessionKey)
  return Array.from(_messagesEl.querySelectorAll('[data-openclaw-message-key]')).some(node => (
    normalizeOpenClawSessionKey(node.dataset.openclawSessionKey || _sessionKey) === targetSessionKey &&
    node.dataset.openclawMessageKey === dedupeKey
  ))
}

function getOpenClawDedupeKeyParts(dedupeKey = '') {
  const raw = String(dedupeKey || '')
  if (!raw) return {}
  const session = raw.includes('|') ? raw.slice(0, raw.indexOf('|')) : ''
  let match = raw.match(/\|history-display:([^:|]+):(.+):([^:|]+)$/)
  if (match) return { session, role: match[1], display: match[2] }
  match = raw.match(/\|display:([^:|]+):(.+):([^:|]+)$/)
  if (match) return { session, role: match[1], display: match[2] }
  match = raw.match(/\|run:[^|]+\|display:(.+)$/)
  if (match) return { session, role: 'assistant', display: match[1] }
  match = raw.match(/\|run:[^:|]+:([^:|]+):(.+)$/)
  if (match) return { session, role: match[1], display: match[2] }
  return { session }
}

const OPENCLAW_HISTORY_USER_DUPLICATE_WINDOW_MS = 3000
const OPENCLAW_CONSECUTIVE_USER_RESTORE_DUPLICATE_WINDOW_MS = 10000

function getOpenClawMessageExplicitCreatedTime(message = {}) {
  return (
    parseOpenClawMessageTime(message.createdAt) ||
    parseOpenClawMessageTime(message.created_at) ||
    parseOpenClawMessageTime(message.timestamp) ||
    parseOpenClawMessageTime(message.time) ||
    parseOpenClawMessageTime(message.message?.createdAt) ||
    parseOpenClawMessageTime(message.message?.created_at) ||
    parseOpenClawMessageTime(message.message?.timestamp) ||
    0
  )
}

function isNearDuplicateOpenClawUserMessage(prev = {}, next = {}) {
  if (!prev || !next) return false
  if (prev.role !== 'user' || next.role !== 'user') return false
  const prevSession = normalizeOpenClawSessionKey(prev.sessionKey || _sessionKey)
  const nextSession = normalizeOpenClawSessionKey(next.sessionKey || _sessionKey)
  if (prevSession !== nextSession) return false
  const prevText = normalizeOpenClawPromptFingerprint(openClawVisibleUserText(prev.text || prev.content || ''))
  const nextText = normalizeOpenClawPromptFingerprint(openClawVisibleUserText(next.text || next.content || ''))
  if (!prevText || prevText !== nextText) return false
  const prevTime = getOpenClawMessageExplicitCreatedTime(prev)
  const nextTime = getOpenClawMessageExplicitCreatedTime(next)
  if (!prevTime || !nextTime) return false
  if (Math.abs(prevTime - nextTime) > OPENCLAW_HISTORY_USER_DUPLICATE_WINDOW_MS) return false
  return true
}

function isConsecutiveOpenClawUserRestoreDuplicate(prev = {}, next = {}) {
  if (!prev || !next) return false
  if (prev.role !== 'user' || next.role !== 'user') return false
  const prevSession = normalizeOpenClawSessionKey(prev.sessionKey || _sessionKey)
  const nextSession = normalizeOpenClawSessionKey(next.sessionKey || _sessionKey)
  if (prevSession !== nextSession) return false
  const prevText = normalizeOpenClawPromptFingerprint(openClawVisibleUserText(prev.text || prev.content || ''))
  const nextText = normalizeOpenClawPromptFingerprint(openClawVisibleUserText(next.text || next.content || ''))
  if (!prevText || prevText !== nextText) return false
  const prevTime = getOpenClawMessageExplicitCreatedTime(prev)
  const nextTime = getOpenClawMessageExplicitCreatedTime(next)
  if (!prevTime || !nextTime) return false
  return Math.abs(prevTime - nextTime) <= OPENCLAW_CONSECUTIVE_USER_RESTORE_DUPLICATE_WINDOW_MS
}

function collapseNearDuplicateOpenClawUsers(messages = []) {
  const result = []
  for (const msg of messages || []) {
    if (msg?.role !== 'user') {
      result.push(msg)
      continue
    }
    const previous = result[result.length - 1]
    if (isConsecutiveOpenClawUserRestoreDuplicate(previous, msg)) {
      result[result.length - 1] = mergeOpenClawHistoryMessage(previous, msg)
      continue
    }
    const duplicateIndex = result.findIndex(existing => isNearDuplicateOpenClawUserMessage(existing, msg))
    if (duplicateIndex >= 0) {
      result[duplicateIndex] = mergeOpenClawHistoryMessage(result[duplicateIndex], msg)
      continue
    }
    result.push(msg)
  }
  return result
}

function hasVisibleOpenClawUserNearDuplicate(msg = {}) {
  if (!msg || !_messagesEl || msg.role !== 'user') return false
  const targetSession = normalizeOpenClawSessionKey(msg.sessionKey || _sessionKey)
  const targetText = normalizeOpenClawPromptFingerprint(openClawVisibleUserText(msg.text || msg.content || ''))
  if (!targetText) return false
  const targetTime = getOpenClawMessageExplicitCreatedTime(msg)
  const visibleRows = Array.from(_messagesEl.querySelectorAll('.msg-user, .msg-ai'))
  const previousRow = visibleRows[visibleRows.length - 1]
  if (previousRow?.classList?.contains('msg-user')) {
    const previousText = normalizeOpenClawPromptFingerprint(previousRow.dataset?.openclawUserFingerprint || previousRow.innerText || previousRow.textContent || '')
    const previousTime = parseOpenClawMessageTime(previousRow.dataset?.openclawCreatedAt || previousRow.dataset?.openclawTimestamp)
    const previousSession = normalizeOpenClawSessionKey(previousRow.dataset?.openclawSessionKey || _sessionKey)
    if (
      previousSession === targetSession &&
      previousText &&
      previousText === targetText &&
      previousTime &&
      targetTime &&
      Math.abs(previousTime - targetTime) <= OPENCLAW_CONSECUTIVE_USER_RESTORE_DUPLICATE_WINDOW_MS
    ) return true
  }
  return Array.from(_messagesEl.querySelectorAll('.msg-user')).some(row => {
    if (normalizeOpenClawSessionKey(row.dataset?.openclawSessionKey || _sessionKey) !== targetSession) return false
    const rowText = normalizeOpenClawPromptFingerprint(row.dataset?.openclawUserFingerprint || row.innerText || row.textContent || '')
    if (!rowText || rowText !== targetText) return false
    const rowTime = parseOpenClawMessageTime(row.dataset?.openclawCreatedAt || row.dataset?.openclawTimestamp)
    if (!rowTime || !targetTime) return false
    if (Math.abs(rowTime - targetTime) > OPENCLAW_HISTORY_USER_DUPLICATE_WINDOW_MS) return false
    return true
  })
}

function hasVisibleOpenClawAssistantAfterLastUserWithDisplay(sessionKey, displayKey) {
  if (!displayKey || !_messagesEl) return false
  const rows = Array.from(_messagesEl.querySelectorAll('.msg-user, .msg-ai, [data-openclaw-message-key]'))
  const lastUserIndex = rows.map(row => row.classList?.contains('msg-user')).lastIndexOf(true)
  if (lastUserIndex < 0) return false
  for (const row of rows.slice(lastUserIndex + 1)) {
    if (!row.classList?.contains('msg-ai')) continue
    if (row.dataset?.openclawSessionKey !== (sessionKey || '')) continue
    const rowDisplay = row.dataset.openclawDisplayKey || getOpenClawDedupeKeyParts(row.dataset.openclawMessageKey).display || ''
    const rowRole = row.dataset.openclawMessageRole || getOpenClawDedupeKeyParts(row.dataset.openclawMessageKey).role || 'assistant'
    if (rowRole === 'assistant' && rowDisplay === displayKey) return true
  }
  return false
}

function markRenderedOpenClawMessage(wrap, sessionKey, dedupeKey) {
  if (!dedupeKey) return
  const normalizedSessionKey = normalizeOpenClawSessionKey(sessionKey || _sessionKey)
  const set = getRenderedMessageSet(normalizedSessionKey)
  rememberBounded(set, dedupeKey, 600)
  if (wrap?.dataset) {
    wrap.dataset.openclawSessionKey = normalizedSessionKey
    wrap.dataset.openclawMessageKey = dedupeKey
    const parts = getOpenClawDedupeKeyParts(dedupeKey)
    if (parts.display) wrap.dataset.openclawDisplayKey = parts.display
    if (parts.role) wrap.dataset.openclawMessageRole = parts.role
  }
}

function clearRenderedOpenClawMessages(sessionKey = _sessionKey) {
  _renderedMessageKeysBySession.delete(normalizeOpenClawSessionKey(sessionKey || _sessionKey))
}

function getChatEventText(payload) {
  const c = extractChatContent(payload?.message)
  return String(c?.text || '')
}

function getChatEventSequence(payload) {
  const candidates = [
    payload?.sequence,
    payload?.seq,
    payload?.data?.sequence,
    payload?.data?.seq,
    payload?.message?.sequence,
    payload?.message?.seq,
  ]
  return candidates.find(value => value !== undefined && value !== null && value !== '') ?? null
}

function getChatEventDedupeKey(payload, eventId = '') {
  if (!payload) return ''
  const messageId = payload.message?.id || payload.messageId || payload.id || ''
  if (payload.state === 'delta') {
    const sequence = getChatEventSequence(payload)
    const sessionKey = payload.sessionKey || _sessionKey || ''
    const runId = payload.runId || ''
    if (sequence !== null) return `delta:${sessionKey}:${runId}:${messageId}:${sequence}`

    const timestamp = payload._openClawSourceEventTimestamp || payload.ts || payload.data?.timestamp || payload.data?.ts || ''
    if (timestamp) return `delta:${sessionKey}:${runId}:${messageId}:${timestamp}`

    const cumulativeText = String(payload._openClawCumulativeMessageText || '')
    if (cumulativeText) {
      return [
        'delta-text',
        sessionKey,
        runId,
        messageId,
        cumulativeText.length,
        cumulativeText.slice(0, 80),
        cumulativeText.slice(-80),
      ].join(':')
    }

    const isIncrementalDelta = payload._openClawIncrementalDelta === true
      || typeof payload.deltaText === 'string'
      || typeof payload.data?.deltaText === 'string'
    if (isIncrementalDelta) return ''

    const text = getChatEventText(payload)
    if (text) {
      return [
        'delta-text',
        sessionKey,
        runId,
        messageId,
        text.length,
        text.slice(0, 80),
        text.slice(-80),
      ].join(':')
    }

    // Some gateway builds reuse both the event id and message id for every
    // incremental frame. With no sequence, timestamp, or cumulative text,
    // deduping that stream would discard every chunk after the first one.
    return ''
  }
  if (eventId) return `event:${eventId}`
  if (messageId) return `message:${payload.state || ''}:${payload.runId || ''}:${messageId}`
  const text = getChatEventText(payload)
  if (!text && payload.state !== 'complete' && payload.state !== 'aborted') return ''
  return [
    payload.sessionKey || _sessionKey || '',
    payload.state || '',
    payload.runId || '',
    text.length,
    text.slice(0, 80),
    text.slice(-80),
  ].join('|')
}

function getAssistantFinalFingerprint(payload, text, tools = []) {
  const toolSig = (tools || []).map(t => t.id || t.name || '').join(',')
  return [
    payload?.sessionKey || _sessionKey || '',
    payload?.runId || payload?.clientRequestId || payload?.idempotencyKey || payload?.requestId || payload?.message?.id || '',
    String(text || '').trim(),
    toolSig,
  ].join('|')
}

function isDuplicateRecentAssistantFinal(fingerprint) {
  if (!fingerprint) return false
  const now = Date.now()
  for (const [key, ts] of _recentAssistantFinals) {
    if (now - ts > OPENCLAW_FINAL_DEDUPE_WINDOW_MS) _recentAssistantFinals.delete(key)
  }
  return _recentAssistantFinals.has(fingerprint)
}

function rememberAssistantFinal(fingerprint) {
  if (!fingerprint) return
  _recentAssistantFinals.set(fingerprint, Date.now())
  if (_recentAssistantFinals.size > 80) {
    const first = _recentAssistantFinals.keys().next().value
    _recentAssistantFinals.delete(first)
  }
}

async function sendMessage(event) {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }
  if (_sendInputLocked) return
  _sendInputLocked = true
  setTimeout(() => {
    _sendInputLocked = false
    updateSendState()
  }, 350)
  let text = _textarea.value.trim()
  if (!text && !_attachments.length) return
  const attachments = [..._attachments]
  const clientRequestId = createOpenClawClientRequestId()
  const sendFingerprint = getOpenClawSendFingerprint(text, attachments)
  const requestFingerprint = getOpenClawRequestFingerprint(text, attachments)
  const now = Date.now()
  if (isOpenClawDuplicatePendingRequest(requestFingerprint)) {
    toast('同一会话里已有相同请求正在处理，请等待当前回复完成。', 'warning')
    updateSendState()
    return
  }
  if (sendFingerprint && _lastSendFingerprint === sendFingerprint && now - _lastSendAt < OPENCLAW_SEND_DEDUPE_WINDOW_MS) {
    return
  }
  _lastSendFingerprint = sendFingerprint
  _lastSendAt = now
  // === 乐观 UI：清空输入框，让回车反馈立即出现（不等待任何异步操作）===
  _textarea.value = ''
  _textarea.style.height = 'auto'
  updateSendState()
  _attachments = []
  renderAttachments()
  hideCmdPanel()
  const slashCommand = parseOpenClawSlashCommand(text)
  if (slashCommand?.type === 'delegate-hermes') {
    const content = slashCommand.payload
    if (content) {
      const task = currentCollaborationTask()
      const taskId = task?.taskId || `openclaw-${Date.now().toString(36)}`
      const context = buildOpenClawCollaborationContext({ taskId, stage: task?.stage || 'delegate' }, content)
      createTaskDelegate({
        taskId,
        parentTaskId: task?.taskId || null,
        sessionId: context.session_id,
        fromAgent: COLLAB_TARGETS.openclaw,
        toAgent: COLLAB_TARGETS.hermes,
        title: 'OpenClaw delegated task to Hermes',
        content,
        context,
      })
      setPendingDispatch({
        target: COLLAB_TARGETS.hermes,
        taskId,
        parentTaskId: task?.taskId || null,
        sessionId: context.session_id,
        fromAgent: COLLAB_TARGETS.openclaw,
        stage: 'execute',
        title: 'OpenClaw delegated task to Hermes',
        message: content,
        context,
      })
      appendUserMessage(text, attachments)
      appendSystemMessage('已委派给 Hermes 执行队列。Hermes 面板打开后会自动接单执行。')
      openCollaborationPanel(COLLAB_TARGETS.hermes, taskId, {
        title: `Hermes 执行 - ${taskId}`,
      }).catch(err => {
        toast(`Hermes 面板打开失败：${err?.message || err}`, 'warning')
      })
      toast('已委派给 Hermes 执行队列', 'success')
      return
    }
    appendHermesDelegationCapabilityAnswer(text, attachments)
    appendSystemMessage('请在 `/hermes` 或 `/delegate-hermes` 后写清楚要交给 Hermes 的任务内容。')
    return
  }
  // 忙碌时直接入队（不显示用户消息，等出队时由 doSend 渲染），输入框已清空
  if (_openClawPendingResponse || _isSending || _isStreaming) {
    if (!hasQueuedOpenClawRequestFingerprint(requestFingerprint)) {
      _messageQueue.push({ text, attachments, clientRequestId, requestFingerprint })
    }
    return
  }
  // === 乐观 UI：立即渲染用户消息，不等媒体分类 / Gateway 检查 ===
  const openclawTurnId = createOpenClawTurnId()
  const userMessageId = `openclaw-user-${clientRequestId}`
  const assistantMessageId = `openclaw-assistant-${clientRequestId}`
  const userCreatedAt = Date.now()
  appendUserMessage(text, attachments, new Date(userCreatedAt), {
    dedupeKey: userMessageId,
    sessionKey: _sessionKey,
    openclawTurnId,
    clientRequestId,
    userMessageId,
    createdAt: userCreatedAt,
  })
  scrollToBottom(true)
  // 后台完成媒体意图分类与 Gateway 就绪检查，不再阻塞 UI
  const nativeMediaTask = await resolveOpenClawNativeMediaTask(text, attachments)
  if (_openClawPendingResponse || _isSending || _isStreaming) {
    if (!hasQueuedOpenClawRequestFingerprint(requestFingerprint)) {
      _messageQueue.push({ text, attachments, clientRequestId, requestFingerprint, forceNativeMediaTask: nativeMediaTask })
    }
    return
  }
  if (!nativeMediaTask && !(await ensureOpenClawGatewayReadyForSend())) {
    rollbackOptimisticOpenClawSend(text, attachments, userMessageId)
    return
  }
  doSend(text, attachments, clientRequestId, requestFingerprint, nativeMediaTask, {
    userMessageShown: true,
    openclawTurnId,
    userMessageId,
    assistantMessageId,
  })
}

async function doSend(text, attachments = [], clientRequestId = createOpenClawClientRequestId(), requestFingerprint = getOpenClawRequestFingerprint(text, attachments), forcedNativeMediaTask = null, options = {}) {
  const skipUserMessage = options.userMessageShown === true
  const nativeMediaTask = forcedNativeMediaTask || await resolveOpenClawNativeMediaTask(text, attachments)
  if (!nativeMediaTask && !(await ensureOpenClawGatewayReadyForSend())) {
    if (skipUserMessage) rollbackOptimisticOpenClawSend(text, attachments, options.userMessageId)
    return
  }
  if (isOpenClawDuplicatePendingRequest(requestFingerprint)) {
    updateSendState()
    return
  }
  if (_inFlightRequestIds.has(clientRequestId)) return
  // Every new turn follows its answer by default. A deliberate upward scroll
  // during generation still disables following until the user returns below.
  _autoScrollEnabled = true
  _scrollForce = false
  // A turn owns all of its timers. Never let an unresolved callback or elapsed
  // timestamp from the previous turn carry into this request.
  _cancelResponseWatchdog()
  clearGenerationTimeoutManager()
  clearInterval(_typingElapsedInterval)
  _typingElapsedInterval = null
  clearTimeout(_postFinalCheck)
  _postFinalCheck = null
  _sendTimestamp = Date.now()
  _lastResponseActivityAt = _sendTimestamp
  _inFlightRequestIds.add(clientRequestId)
  rememberOpenClawRequestFingerprint(clientRequestId, requestFingerprint)
  _activeClientRequestId = clientRequestId
  _activeOpenClawUserText = text
  _openClawPendingResponse = true
  _openClawActiveRequestClosed = false
  _lastVisibleUserText = text
  _currentAiBubble = null
  _currentAiBubbleRequestId = ''
  _currentAiText = ''
  _currentAiStreamRawText = ''
  _lastRenderedAiText = ''
  _currentAiImages = []
  _currentAiVideos = []
  _currentAiAudios = []
  _currentAiFiles = []
  _currentAiTools = []
  _currentAiTimeline = []
  _currentRunId = null
  const openclawTurnId = options.openclawTurnId || createOpenClawTurnId()
  const userMessageId = options.userMessageId || `openclaw-user-${clientRequestId}`
  const assistantMessageId = options.assistantMessageId || `openclaw-assistant-${clientRequestId}`
  const userMessageIndex = _messagesEl ? _messagesEl.querySelectorAll('.msg-user, .msg-ai').length : -1
  createOpenClawActiveRun({
    openclawTurnId,
    clientRequestId,
    sessionKey: _sessionKey,
    userMessageId,
    assistantMessageId,
    userMessageIndex,
    userText: text,
    status: 'pending',
  })
  if (!nativeMediaTask && !(await ensureOpenClawGatewayReadyForSend())) {
    _inFlightRequestIds.delete(clientRequestId)
    releaseOpenClawRequestFingerprint(clientRequestId)
    if (_activeClientRequestId === clientRequestId) _activeClientRequestId = null
    _openClawPendingResponse = false
    _openClawActiveRequestClosed = true
    finishOpenClawActiveRun('failed', 'gateway-not-ready')
    if (skipUserMessage) rollbackOptimisticOpenClawSend(text, attachments, userMessageId)
    updateSendState()
    return
  }
  const sendText = withOpenClawIdentityPrelude(buildAttachmentTriggeredPrompt(text, attachments))
  const userCreatedAt = Date.now()
  if (!skipUserMessage) {
    appendUserMessage(text, attachments, new Date(userCreatedAt), {
      dedupeKey: userMessageId,
      sessionKey: _sessionKey,
      openclawTurnId,
      clientRequestId,
      userMessageId,
      createdAt: userCreatedAt,
    })
  }
  saveMessage({
    id: userMessageId, sessionKey: _sessionKey, role: 'user', content: text, timestamp: userCreatedAt,
    createdAt: userCreatedAt,
    openclawTurnId,
    clientRequestId,
    attachments: attachments?.length ? serializeOpenClawAttachments(attachments) : undefined
  })
  const initialTaskSummary = redactOpenClawVisibleSensitiveText(text).replace(/\s+/g, ' ').trim()
  recordOpenClawRunStep('plan', `开始处理：${initialTaskSummary.slice(0, 180)}${initialTaskSummary.length > 180 ? '...' : ''}`, 'running', 'initial-plan')
  renderOpenClawLiveTimeline()
  showTyping(true)
  scrollToBottom(true)
  if (nativeMediaTask) {
    _isSending = true
    try {
      await executeOpenClawNativeMediaTask(nativeMediaTask, {
        clientRequestId,
        openclawTurnId,
        assistantMessageId,
      })
    } finally {
      _isSending = false
      updateSendState()
    }
    return
  }
  _isSending = true
  _startResponseWatchdog()
  startOpenClawProgressHistoryPolling()
  startGenerationTimeoutManager()
  try {
    const sendResult = await wsClient.chatSend(_sessionKey, sendText, attachments.length ? attachments : undefined, {
      idempotencyKey: clientRequestId,
      clientRequestId,
    })
    bindOpenClawNativeRun(sendResult, clientRequestId)
  } catch (err) {
    if (shouldTreatOpenClawAbortAsRecoverable({
      error: err,
      gatewayReady: isOpenClawRuntimeReadyForAbortRecovery(),
      wsReady: wsClient.connected || wsClient.gatewayReady,
      activeRun: _activeClientRequestId === clientRequestId || !_openClawActiveRequestClosed,
    })) {
      await recoverOpenClawGenerationAfterTransientDisconnect('send-abort-recovery', {
        notify: false,
        attempts: 10,
        delayMs: 900,
      })
      return
    }
    showTyping(false)
    _cancelResponseWatchdog()
    clearGenerationTimeoutManager()
    _sendTimestamp = 0
    _lastResponseActivityAt = 0
    if (_textarea && !_textarea.value.trim()) {
      _textarea.value = text
      _textarea.style.height = 'auto'
      _textarea.style.height = Math.min(_textarea.scrollHeight, 150) + 'px'
    }
    if (attachments?.length) {
      _attachments = [...attachments, ..._attachments]
      renderAttachments()
    }
    _inFlightRequestIds.delete(clientRequestId)
    releaseOpenClawRequestFingerprint(clientRequestId)
    if (_activeClientRequestId === clientRequestId) _activeClientRequestId = null
    _openClawPendingResponse = false
    _openClawActiveRequestClosed = true
    finishOpenClawActiveRun('failed', 'send-error')
    const message = err?.message || String(err)
    if (/ReplyRunAlreadyActiveError|run already active|already active/i.test(message)) {
      appendSystemMessage('OpenClaw 已有任务正在执行，已阻止重复发送。请等待当前任务完成或稍后重试。')
    } else {
      appendSystemMessage(`${t('chat.sendFailed')}${message}`)
    }
  } finally {
    _isSending = false
    updateSendState()
  }
}

// 乐观 UI 回滚：Gateway/媒体检查失败时，移除刚显示的用户消息并恢复输入框与附件。
function rollbackOptimisticOpenClawSend(text, attachments = [], userMessageId = '') {
  if (userMessageId && _messagesEl) {
    const normalizedSessionKey = normalizeOpenClawSessionKey(_sessionKey)
    const target = Array.from(_messagesEl.querySelectorAll('[data-userMessageId]'))
      .find(el => el.dataset.userMessageId === userMessageId)
    if (target) {
      const dedupeKey = target.dataset.openclawMessageKey
      target.remove()
      if (dedupeKey) {
        const set = _renderedMessageKeysBySession.get(normalizedSessionKey)
        if (set) set.delete(dedupeKey)
      }
    }
  }
  if (_textarea && !_textarea.value.trim()) {
    _textarea.value = text
    _textarea.style.height = 'auto'
    _textarea.style.height = Math.min(_textarea.scrollHeight, 150) + 'px'
  }
  if (attachments?.length) {
    _attachments = [...attachments, ..._attachments]
    renderAttachments()
  }
  updateSendState()
}

async function resolveOpenClawNativeMediaTask(text, attachments = []) {
  // OpenClaw owns the same semantic decision as Hermes. A visual brief may be
  // planning-only; a current request to deliver the image must bypass the
  // chat model and call the configured native media executor exactly once.
  const context = {
    recent_messages: getOpenClawRecentMessagesForContext(12).map(item => ({
      role: item.role,
      content: String(item.content || '').slice(0, 1600),
      timestamp: item.timestamp,
    })),
  }
  try {
    const intent = await api.mediaClassifyIntent(text, context)
    const task = resolveMediaExecutionTask({ text, attachments }, intent)
    return task?.media_type === 'text_to_image' || task?.media_type === 'image_to_image' ? task : null
  } catch (error) {
    // Classification is advisory. If it is temporarily unavailable, preserve
    // deterministic direct media execution for a clearly executable task.
    console.warn('[openclaw-media] intent classification unavailable:', error)
    const task = resolveMediaExecutionTask({ text, attachments })
    return task?.media_type === 'text_to_image' || task?.media_type === 'image_to_image' ? task : null
  }
}

function openClawNativeMediaFileName(path = '', kind = 'media') {
  const clean = String(path || '').replace(/[\\/]+$/, '')
  return clean.split(/[\\/]/).pop() || `${kind}-output`
}

function withOpenClawMediaTimeout(promise, timeoutMs = 135000) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('图片生成请求超过 135 秒未返回。请检查媒体模型额度、网络或稍后重试。')), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function executeOpenClawNativeMediaTask(task, renderMeta = {}) {
  const taskLabel = task.media_type === 'image_to_video' ? '图生视频' : task.media_type === 'text_to_video' ? '文生视频' : task.title || '媒体生成'
  const sourceRequired = task.media_type === 'image_to_video'
  if (sourceRequired && !task.inputPath) {
    const message = '视频未生成：本轮图片附件没有可供本地媒体引擎读取的文件路径。请重新粘贴或上传图片后重试。'
    recordOpenClawRunStep('tool', taskLabel, 'failed', `native-media-${renderMeta.clientRequestId}`, { detail: '缺少图片源文件路径' })
    appendAiMessage(message, new Date(), [], [], [], [], [], [], [], {
      ...renderMeta,
      dedupeKey: `openclaw-native-media-failed-${renderMeta.clientRequestId}`,
      sessionKey: _sessionKey,
      executionTimeline: [..._currentAiTimeline],
    })
    saveMessage({
      id: renderMeta.assistantMessageId || `openclaw-native-media-failed-${Date.now()}`,
      sessionKey: _sessionKey,
      role: 'assistant',
      content: message,
      timestamp: Date.now(),
      createdAt: Date.now(),
      clientRequestId: renderMeta.clientRequestId,
      status: 'failed',
    })
    clearOpenClawGenerationState('native-media-failed-missing-source', renderMeta.clientRequestId)
    processMessageQueue()
    return
  }

  recordOpenClawRunStep('tool', taskLabel, 'running', `native-media-${renderMeta.clientRequestId}`, { detail: '正在提交图片生成请求，等待媒体服务返回图片文件。' })
  renderOpenClawLiveTimeline()
  try {
    const result = await withOpenClawMediaTimeout(
      api.mediaGenerate(task.media_type, task.prompt, task.inputPath || null, {})
    )
    const outputPath = String(result?.path || '').trim()
    if (!result?.ok || !outputPath) throw new Error('媒体引擎没有返回可用的输出文件')
    recordOpenClawRunStep('tool', taskLabel, 'completed', `native-media-${renderMeta.clientRequestId}`, { detail: `已生成：${openClawNativeMediaFileName(outputPath, task.media_type)}` })
    const isImage = task.media_type === 'text_to_image' || task.media_type === 'image_to_image'
    const output = {
      category: isImage ? 'image' : 'file',
      type: isImage ? 'image' : 'file',
      fileName: openClawNativeMediaFileName(outputPath, task.media_type),
      name: openClawNativeMediaFileName(outputPath, task.media_type),
      mediaPath: outputPath,
      generatedMediaPath: outputPath,
      mimeType: isImage ? 'image/png' : /video/.test(task.media_type) ? 'video/mp4' : 'audio/mpeg',
    }
    const message = `${taskLabel}已生成完成。文件已保存到：\n\`${outputPath}\``
    appendAiMessage(message, new Date(), isImage ? [output] : [], [], [], isImage ? [] : [output], [], [], [], {
      ...renderMeta,
      dedupeKey: `openclaw-native-media-${renderMeta.clientRequestId}`,
      sessionKey: _sessionKey,
      executionTimeline: [..._currentAiTimeline],
    })
    saveMessage({
      id: renderMeta.assistantMessageId || `openclaw-native-media-${Date.now()}`,
      sessionKey: _sessionKey,
      role: 'assistant',
      content: message,
      timestamp: Date.now(),
      createdAt: Date.now(),
      clientRequestId: renderMeta.clientRequestId,
      attachments: [output],
      status: 'completed',
    })
    returnOpenClawCollaborationResult({
      runId: renderMeta.clientRequestId,
      content: message,
      artifacts: [{
        type: isImage ? 'image' : 'file',
        category: isImage ? 'image' : 'file',
        path: outputPath,
        mediaPath: outputPath,
        mimeType: output.mimeType,
        fileName: output.fileName,
        created_at: new Date().toISOString(),
      }],
    })
    clearOpenClawGenerationState('native-media-completed', renderMeta.clientRequestId)
  } catch (error) {
    const reason = redactOpenClawVisibleSensitiveText(error?.message || String(error) || '未知错误')
    const groupDisabled = /image generation is not enabled for this group/i.test(reason)
    const visibleReason = groupDisabled
      ? 'yyapi 已识别到 gpt-image-2，但当前 API Key 所属分组未开通图片生成能力。请在 yyapi 后台为该分组启用 Images/图片生成权限，或切换到已开通该能力的令牌。'
      : reason
    const message = `${taskLabel}未生成：${visibleReason}`
    recordOpenClawRunStep('tool', taskLabel, 'failed', `native-media-${renderMeta.clientRequestId}`, { detail: visibleReason })
    appendAiMessage(message, new Date(), [], [], [], [], [], [], [], {
      ...renderMeta,
      dedupeKey: `openclaw-native-media-failed-${renderMeta.clientRequestId}`,
      sessionKey: _sessionKey,
      executionTimeline: [..._currentAiTimeline],
    })
    saveMessage({
      id: renderMeta.assistantMessageId || `openclaw-native-media-failed-${Date.now()}`,
      sessionKey: _sessionKey,
      role: 'assistant',
      content: message,
      timestamp: Date.now(),
      createdAt: Date.now(),
      clientRequestId: renderMeta.clientRequestId,
      status: 'failed',
      error: { code: groupDisabled ? 'MEDIA_GROUP_NOT_ENABLED' : 'OPENCLAW_NATIVE_MEDIA_FAILED', reason: visibleReason },
    })
    returnOpenClawCollaborationResult({ runId: renderMeta.clientRequestId, content: message, failed: true })
    clearOpenClawGenerationState('native-media-failed', renderMeta.clientRequestId)
  }
  processMessageQueue()
}

function buildAttachmentTriggeredPrompt(text, attachments = []) {
  const base = String(text || '').trim() || '请分析我刚才粘贴或上传的图片。'
  let toolPrompt = buildIntentTriggeredToolPrompt(base)
  const hasImage = attachments.some(item => {
    const category = String(item?.category || item?.type || '').toLowerCase()
    const mime = String(item?.mimeType || item?.mime || '').toLowerCase()
    return category === 'image' || mime.startsWith('image/')
  })
  const documents = attachments.filter(item => {
    const category = String(item?.category || item?.type || '').toLowerCase()
    const mime = String(item?.mimeType || item?.mime || '').toLowerCase()
    return category === 'document' || (!mime.startsWith('image/') && Boolean(item?.content || item?.data))
  })
  if (documents.length) {
    const names = documents.map(item => String(item?.fileName || item?.name || 'attachment')).join(', ')
    toolPrompt = [
      toolPrompt,
      '',
      '[DOCUMENT_ATTACHMENT_CONTEXT]',
      `The user attached portable document files: ${names}. The Gateway staged them for this exact native run and exposes their paths through MediaPath/MediaPaths.`,
      'Use the shared SuperClaw file service for .xlsx, .docx, .pptx, and .pdf: its portable CLI is superclaw-file.cmd (preview, replace, clean-excel, watermark). Inspect before answering. For an edit request, preserve the original, write a new output file in the workspace or attachment output directory, verify the result, and report the output path and what changed.',
      'Do not say a file is unavailable until you have checked MediaPath/MediaPaths. Do not ask the user to upload again when this turn already includes the attachment.',
      '[/DOCUMENT_ATTACHMENT_CONTEXT]',
    ].join('\n')
  }
  if (!hasImage) return toolPrompt
  const mediaTask = detectMediaTask({ text: base, attachments })
  const mediaPath = attachments
    .map(item => openClawAttachmentMediaPath(item))
    .find(Boolean)
  if (mediaTask?.media_type === 'image_to_video') {
    return [
      toolPrompt,
      '',
      '[MEDIA_ATTACHMENT_CONTEXT]',
      `This is an image-to-video request. The exact source image for this turn is ${JSON.stringify(mediaPath || '')}.`,
      `Call superclaw_generate_video once with imagePath=${JSON.stringify(mediaPath || '')}; do not use exec, shell, filesystem search, or recursive scans to rediscover the attachment.`,
      'If the source path is empty or the media tool fails, state the concrete failure and do not claim that a video was generated.',
      '[/MEDIA_ATTACHMENT_CONTEXT]',
    ].join('\n')
  }
  const ocrPath = attachments
    .map(item => openClawAttachmentMediaPath(item))
    .find(Boolean)
  const ocrRequested = isOcrIntentText(base)
  const ocrInstruction = ocrRequested && ocrPath
    ? `The user explicitly requested OCR. Call superclaw_ocr with imagePath=${JSON.stringify(ocrPath)} and sourceType="image". Use its returned text as evidence; do not ask the UI to OCR the attachment.`
    : ocrRequested
      ? 'The user explicitly requested OCR, but no durable local image path is available. Explain that the attachment was delivered and ask the user to use the explicit OCR action or reattach the image; do not invent OCR text.'
      : 'Do not run OCR automatically. Use the supplied image attachment only when the user explicitly asks to read text from it.'
  return [
    toolPrompt,
    '',
    '[IMAGE_ATTACHMENT_CONTEXT]',
    ocrInstruction,
    '[/IMAGE_ATTACHMENT_CONTEXT]',
    '[图片识别触发]',
    '本轮用户粘贴或上传了图片附件。请直接调用可用的视觉/图片识别工具读取图片，并基于图片内容回答；不要等待用户再次确认。',
    '这个能力只在本轮图片输入时触发，普通文字聊天不要加载视觉工具。若当前工具链无法读取图片，请用中文明确说明。',
    '如果当前 OpenClaw 模型暂未确认支持直接图片理解，请用中文回复：图片已作为附件保存，当前模型暂不支持直接图片理解，可以切换支持视觉的模型，或使用 OCR 工具识别后再分析。',
    '[/图片识别触发]',
  ].join('\n')
}

function buildIntentTriggeredToolPrompt(text) {
  const base = String(text || '').trim()
  if (!base) return base
  const lower = base.toLowerCase()
  // Collaboration transport text is an already-approved execution request.
  const collaborationExecutionIntent = /superclaw\s*.*(?:collaboration|协作)/i.test(base)
  const skillsIntent = isOpenClawSkillsQuestion(base)
  const nativeInspectionIntent = isOpenClawNativeInspectionRequest(base)
  const capabilityAuditIntent =
    !collaborationExecutionIntent && (skillsIntent ||
    /(能不能|能否|可以吗|可不可以|会不会|有没有|是否具备|能做吗|能做什么|缺什么|需要什么|安装什么|装什么|工具|插件|skills?|skill|plugin|tool|能力|调用|检索).{0,40}(工具|插件|skills?|skill|plugin|tool|能力|调用|安装|联网|上网|安全|检查|检索)|(?:工具|插件|skills?|skill|plugin|tool|能力|调用|安装|联网|上网|安全|检查|检索).{0,40}(能不能|能否|可以吗|可不可以|会不会|有没有|是否具备|缺什么|需要什么|安装什么|装什么)/i.test(base)
    )
  const hasUrl = /https?:\/\//i.test(base)
  const desktopIntent =
    /(桌面端|客户端|本地应用|应用程序|桌面应用|app)\s*(里|上|中)?\s*(打开|搜索|点击|输入|查看|读取|采集|操作)/i.test(base) ||
    /(打开|搜索|点击|输入|查看|读取|采集|操作).{0,18}(桌面端|客户端|本地应用|应用程序|桌面应用|app)/i.test(base) ||
    /(抖音|快手|小红书|飞书|钉钉|微信|qq).{0,18}(客户端|桌面端|app|应用|打开|搜索|点击|输入|查看|采集)/i.test(base)
  const browserIntent =
    hasUrl ||
    /(浏览器|网页|网站|网址|链接|页面|打开网页|打开网站|搜索网页|网上搜索|联网搜索|网页搜索|抓取|读取链接|浏览)/i.test(base) ||
    /\b(browser|website|web page|url|search web|open url|navigate|scrape)\b/i.test(lower)
  const blocks = [base]
  if (nativeInspectionIntent) {
    blocks.push(
      '',
      '[NATIVE_INSPECTION_REQUIRED]',
      'This is a read-only execution request. Execute it now with native tools; do not reply with a plan or say that you will inspect.',
      'Call skill_manager action=audit for installed skills. When the request concerns a channel, plugin, or OpenClaw configuration, use exec only for read-only inspection of the current portable workspace/config/plugin state.',
      'Do not install, enable, modify, restart, or delete anything. The final answer must include the observed tool evidence and a concrete conclusion.',
      '[/NATIVE_INSPECTION_REQUIRED]',
    )
  }
  if (capabilityAuditIntent) {
    blocks.push(
      '',
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
    blocks.push(
      '',
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
    blocks.push(
      '',
      '[BROWSER_TOOL_TRIGGER]',
      '本轮用户明确要求浏览器/网页/链接/搜索/抓取。若工具列表里有 browser，请调用真实 browser 工具完成打开、搜索、读取、点击或页面快照；不要输出 <tool_call>、XML 或伪工具文本。',
      '浏览器自动化必须复用同一个专用浏览器窗口/标签：先检查已有 tab/current page；能 navigate 当前页就不要 open 新窗口/新标签；同一任务最多保留一个自动化页面，禁止反复打开多个浏览器或多个独立页面。',
      '基础顺序：tabs/current -> focus/reuse -> navigate -> snapshot/read visible text -> click/type/wait when needed；失败时用中文说明具体失败原因和下一步。',
      '普通聊天不要触发 browser 工具。',
      '[/BROWSER_TOOL_TRIGGER]',
    )
  }
  return blocks.join('\n')
}

function ensureReadySessionKey() {
  if (!_sessionKey && wsClient.gatewayReady) {
    _sessionKey = resolveGatewaySessionKey(wsClient.sessionKey)
    updateSessionTitle()
    refreshSessionList()
  }
}

function processMessageQueue() {
  if (_messageQueue.length === 0 || _openClawPendingResponse || _isSending || _isStreaming) return
  const msg = _messageQueue.shift()
  if (typeof msg === 'string') doSend(msg, [])
  else doSend(msg.text, msg.attachments || [], msg.clientRequestId || createOpenClawClientRequestId(), msg.requestFingerprint, msg.forceNativeMediaTask || null)
}

function currentCollaborationTask() {
  const match = /^agent:[^:]+:collaboration\/([^/]+)\/(.+)\.md$/.exec(String(_sessionKey || ''))
  if (!match) return null
  return { stage: match[1], taskId: match[2], origin: getOpenClawCollaborationOrigin(match[2]) }
}

function getOpenClawCollaborationOrigins() {
  try {
    const rows = JSON.parse(localStorage.getItem('superclaw-openclaw-collaboration-origins-v1') || '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function rememberOpenClawCollaborationOrigin(taskId, pending = {}) {
  if (!taskId) return
  const rows = getOpenClawCollaborationOrigins().filter(item => item?.taskId !== taskId)
  rows.push({
    taskId,
    fromAgent: pending.fromAgent || pending.from_agent || COLLAB_TARGETS.hermes,
    panelConversationId: pending.sessionId || pending.session_id || '',
    createdAt: Date.now(),
  })
  localStorage.setItem('superclaw-openclaw-collaboration-origins-v1', JSON.stringify(rows.slice(-100)))
}

function getOpenClawCollaborationOrigin(taskId) {
  return getOpenClawCollaborationOrigins().find(item => item?.taskId === taskId) || null
}

function getOpenClawRecentMessagesForContext(limit = 50) {
  try {
    const messages = getLocalMessages(_sessionKey, limit)
    if (Array.isArray(messages)) return messages.slice(-limit)
  } catch {}
  return []
}

function buildOpenClawCollaborationContext(task, content = '', artifacts = []) {
  return buildTaskContext({
    sessionId: _sessionKey,
    taskId: task?.taskId,
    summary: content,
    recent_messages: getOpenClawRecentMessagesForContext(50).map(item => ({
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
    })),
    artifacts,
    content,
  })
}

function markCollaborationReturnOnce(taskId, runId, kind) {
  const key = `${taskId}:${runId || 'no-run'}:${kind}`
  let rows = []
  try { rows = JSON.parse(localStorage.getItem('superclaw-openclaw-returned-collab-v1') || '[]') } catch {}
  if (rows.includes(key)) return false
  rows.push(key)
  localStorage.setItem('superclaw-openclaw-returned-collab-v1', JSON.stringify(rows.slice(-200)))
  return true
}

function returnOpenClawCollaborationResult({ runId, content, failed = false, artifacts = [] } = {}) {
  const task = currentCollaborationTask()
  if (!task?.taskId) return
  const body = String(content || '').trim()
  if (!body) return
  if (!markCollaborationReturnOnce(task.taskId, runId || body.slice(0, 80), failed ? 'error' : 'result')) return
  const context = buildOpenClawCollaborationContext(task, body, artifacts)
  const target = task.origin?.fromAgent === COLLAB_TARGETS.claudeCode ? COLLAB_TARGETS.claudeCode : COLLAB_TARGETS.hermes
  const resultMessage = createTaskResult({
    taskId: task.taskId,
    sessionId: context.session_id,
    fromAgent: COLLAB_TARGETS.openclaw,
    toAgent: target,
    title: `${task.stage === 'review' ? 'OpenClaw review' : 'OpenClaw execution'} ${failed ? 'failed' : 'completed'}`,
    content: body,
    failed,
    context,
    artifacts,
  })
  if (isTauriRuntime()) {
    void api.collaborationMessageAppend(resultMessage).catch(error => {
      console.warn('[collaboration] durable OpenClaw result handoff failed:', error)
    })
  }
  updateCollaborationTask(task.taskId, {
    status: failed ? 'failed' : (task.stage === 'review' ? 'review_completed' : 'executor_completed'),
    [task.stage === 'review' ? 'openclawReviewResultAt' : 'openclawResultAt']: Date.now(),
    context,
  })
  if (target === COLLAB_TARGETS.claudeCode) {
    void publishOpenClawResultToClaudePanel({
      taskId: task.taskId,
      conversationId: task.origin?.panelConversationId || '',
      content: body,
      failed,
      artifacts: context.artifacts,
    })
  }
}

async function publishOpenClawResultToClaudePanel(result) {
  try {
    const payload = { ...result, toAgent: COLLAB_TARGETS.claudeCode }
    if (isTauriRuntime()) {
      await api.claudeCollaborationResultAppend(payload)
      return
    }
    await fetch('http://127.0.0.1:3020/api/collaboration/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.warn('[collaboration] Claude media result publish failed:', error)
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

function normalizeOpenClawToolValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return stripAnsi(value)
  return stripAnsi(safeStringify(value))
}

function redactOpenClawVisibleSensitiveText(value) {
  return String(value || '')
    .replace(/\b(?:sk|sk-proj|rk|xox[baprs])-[A-Za-z0-9_./+=-]{12,}\b/gi, '[已隐藏]')
    .replace(/(authorization\s*:\s*)(?!Bearer\b|Basic\b)[^\s,"'};]+/gi, '$1[已隐藏]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9_./+=-]{12,}\b/gi, '$1 [已隐藏]')
    .replace(/((?:api[_-]?key|token|secret|password|passwd|cookie)\s*(?:=|:|\s)\s*["']?)[^\s,"'};]+/gi, '$1[已隐藏]')
    .replace(/(--?(?:api[_-]?key|token|secret|password|cookie)\s+)[^\s]+/gi, '$1[已隐藏]')
}

function getOpenClawToolCommandPreview(tool = {}) {
  const rawName = String(tool.toolName || tool.tool_name || tool.name || tool.tool || '').toLowerCase()
  if (!/(?:^|[_-])(exec|shell|terminal|command|bash|powershell|cmd)(?:$|[_-])/.test(rawName)) return ''
  const input = tool.input ?? tool.args ?? tool.arguments ?? tool.params ?? tool.parameters ?? null
  let command = ''
  if (typeof input === 'string') command = input
  else if (input && typeof input === 'object') {
    const value = input.command ?? input.cmd ?? input.script ?? input.commandLine ?? input.command_line ?? input.shellCommand ?? input.shell_command
    if (typeof value === 'string') command = value
    else if (Array.isArray(input.argv)) command = input.argv.join(' ')
  }
  const visible = redactOpenClawVisibleSensitiveText(command).trim()
  return visible.length > 4000 ? `${visible.slice(0, 4000)}\n...` : visible
}

function getOpenClawToolInputPreview(tool = {}, maxLength = 160) {
  const input = tool.input ?? tool.args ?? tool.arguments ?? tool.params ?? tool.parameters ?? null
  if (input == null) return ''
  const rawName = String(tool.toolName || tool.tool_name || tool.name || tool.tool || '').toLowerCase()
  let value = ''
  if (typeof input === 'string') value = input
  else if (input && typeof input === 'object') {
    const keys = /(?:search|query)/.test(rawName)
      ? ['query', 'q', 'keyword', 'keywords', 'url', 'path']
      : /(?:write|edit|patch|read|file|folder|directory)/.test(rawName)
        ? ['path', 'filePath', 'file_path', 'target', 'filename', 'name']
        : /(?:browser|navigate|open|fetch)/.test(rawName)
          ? ['url', 'href', 'target', 'path']
          : ['command', 'cmd', 'script', 'commandLine', 'command_line', 'path', 'url', 'query', 'prompt']
    for (const key of keys) {
      const candidate = input[key]
      if (typeof candidate === 'string' && candidate.trim()) {
        value = candidate
        break
      }
    }
    if (!value && Array.isArray(input.argv)) value = input.argv.join(' ')
  }
  const visible = redactOpenClawVisibleSensitiveText(value).replace(/\s+/g, ' ').trim()
  return visible.length > maxLength ? `${visible.slice(0, maxLength)}...` : visible
}

function collectOpenClawToolText(tools = [], fallbackText = '') {
  const parts = []
  const push = (value) => {
    const text = normalizeOpenClawToolValue(value).trim()
    if (text) parts.push(text)
  }
  ;(Array.isArray(tools) ? tools : []).forEach(tool => {
    push(tool?.output)
    push(tool?.result)
    push(tool?.content)
    push(tool?.error)
    push(tool?.name)
  })
  push(fallbackText)
  return parts.join('\n\n').trim()
}

function isInternalToolPlaceholderText(value, options = {}) {
  const raw = String(value || '').trim()
  if (!raw) return true
  const compact = raw
    .toLowerCase()
    .replace(/[\s_*`~\[\](){}<>:：。，,.!?！？-]+/g, '')
  if (['tool', 'tooltool', 'toolresult', 'toolcompleted', 'toolresultsynced', 'heartbeatok', 'heartbeat_ok'].includes(compact)) return true
  if (/^\[?\s*tool_call\s*\]?$/i.test(raw)) return true
  if (/^\s*Tool\s+tool(?:\s+(?:success|ok|completed|done))?\s*$/i.test(raw)) return true
  if (options.allowShortLiteral !== true && /^\s*(?:success|ok|completed|done)\s*$/i.test(raw)) return true
  if (/^\s*\u5de5\u5177(?:\u6267\u884c)?\u6210\u529f\s*$/i.test(raw)) return true
  if (/^\s*\u5de5\u5177\u5df2\u5b8c\u6210\s*$/i.test(raw)) return true
  if (/^\s*\u7ed3\u679c\u5df2\u540c\u6b65(?:\u5230\u4e0b\u65b9\u8be6\u60c5)?\s*$/i.test(raw)) return true
  if (/^\s*\u7ed3\u679c\u5df2\u6536\u8d77\u5728\u5361\u7247\u4e2d\s*$/i.test(raw)) return true
  return false
}

function getOpenClawToolDisplayName(tool = {}) {
  const values = [
    tool.displayName,
    tool.title,
    tool.label,
    tool.name,
    tool.toolName,
    tool.tool_name,
    tool.tool,
    tool.id,
    tool.tool_call_id,
  ]
  for (const value of values) {
    const text = String(value || '').trim()
    if (!text) continue
    if (/^(tool|tool_call|tool_result|result|output|success|ok|done|completed)$/i.test(text)) continue
    if (/^[a-z0-9_-]{16,}$/i.test(text)) continue
    const normalized = text.toLowerCase().replace(/[\s.-]+/g, '_')
    const labels = {
      web_search: '检索公开资料',
      web_fetch: '读取网页内容',
      browser: '浏览网页',
      browser_open: '打开网页',
      browser_navigate: '浏览网页',
      browser_screenshot: '读取当前页面',
      exec: '执行本地操作',
      command: '执行命令',
      process: '等待任务结果',
      shell: '执行本地操作',
      terminal: '执行本地操作',
      bash: '执行本地操作',
      powershell: '执行本地操作',
      cmd: '执行本地操作',
      playwright: '浏览网页',
      puppeteer: '浏览网页',
      ocr: '识别图片文字',
      superclaw_ocr: '识别图片文字',
      superclaw_generate_image: '生成图片',
      image_generate: '生成图片',
      superclaw_generate_video: '生成视频',
      video_generate: '生成视频',
      superclaw_generate_music: '生成音乐',
      superclaw_generate_speech: '生成语音',
    }
    return labels[normalized] || text
  }
  return ''
}

function getOpenClawToolProgressLabel(tool = {}) {
  const name = getOpenClawToolDisplayName(tool) || '调用工具'
  const rawName = String(tool.toolName || tool.tool_name || tool.name || tool.tool || '').trim().toLowerCase().replace(/[\s.-]+/g, '_')
  const command = getOpenClawToolCommandPreview(tool)
  if (command) return `执行命令：${command.replace(/\s+/g, ' ').slice(0, 220)}`
  const input = getOpenClawToolInputPreview(tool)
  const actions = {
    web_search: '检索资料', web_fetch: '读取网页', browser: '浏览网页',
    browser_open: '打开网页', browser_navigate: '跳转网页', browser_screenshot: '读取当前页面',
    exec: '执行本地命令', command: '执行命令', shell: '执行本地命令', terminal: '执行本地命令',
    bash: '执行本地命令', powershell: '执行 PowerShell 命令', cmd: '执行命令提示符命令',
    process: '检查后台任务', playwright: '浏览网页', puppeteer: '浏览网页',
    ocr: '识别图片文字', superclaw_ocr: '识别图片文字',
    superclaw_generate_image: '生成图片', image_generate: '生成图片',
    superclaw_generate_video: '生成视频', video_generate: '生成视频',
    write: '写入文件', write_file: '写入文件', edit: '修改文件', edit_file: '修改文件',
    read: '读取文件', read_file: '读取文件', search_files: '检索文件',
  }
  const action = actions[rawName] || name
  return input ? `${action}：${input}` : action
}

function stripRawOpenClawToolText(text) {
  const cleaned = []
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line) continue
    if (isInternalToolPlaceholderText(line)) continue
    line = line
      .replace(/\bTool\s+tool\b/gi, '')
      .replace(/\[?\s*tool_call\s*\]?/gi, '')
      .replace(/\u5de5\u5177(?:\u6267\u884c)?\u6210\u529f[，,。.、\s]*/g, '')
      .replace(/\u5de5\u5177\u5df2\u5b8c\u6210[，,。.、\s]*/g, '')
      .replace(/\u7ed3\u679c\u5df2\u540c\u6b65(?:\u5230\u4e0b\u65b9\u8be6\u60c5)?[，,。.、\s]*/g, '')
      .replace(/\u7ed3\u679c\u5df2\u6536\u8d77\u5728\u5361\u7247\u4e2d[，,。.、\s]*/g, '')
      .replace(/\u5c55\u5f00\u8be6\u60c5/g, '')
      .replace(/\u67e5\u770b\u5de5\u5177\u8be6\u60c5/g, '')
      .trim()
    if (!line) continue
    if (/^(?:[·•|\s-]*\d{1,2}:\d{2}(?:\s*[·•|]\s*)?)?(?:⏱\s*)?\d+(?:\.\d+)?s?$/.test(line)) continue
    if (/^\|?\s*-{2,}\s*(?:\|\s*-{2,}\s*)+\|?$/.test(line)) continue
    if (/^\|.*\|$/.test(line)) continue
    if (/^\s*(?:tool_result|tool result|tool_call|tool call|arguments|parameters|raw json|json|stdout|stderr)\s*[:=]/i.test(line)) continue
    if (/^\s*[\[{]/.test(line)) continue
    cleaned.push(line)
  }
  const value = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return value.length > 1200 ? `${value.slice(0, 1200)}...` : value
}

function extractOpenClawSkillsCount(text, skillNames = []) {
  const raw = String(text || '')
  const matches = [
    raw.match(/\btotal\s*[:=]\s*(\d+)/i),
    raw.match(/\bcount\s*[:=]\s*(\d+)/i),
    raw.match(/\bskills?\s*[:=]\s*(\d+)/i),
    raw.match(/\u5df2\u53d1\u73b0\s*(\d+)\s*\u4e2a\u6280\u80fd\u5305/),
    raw.match(/\u5171\s*(\d+)\s*\u4e2a\u6280\u80fd\u5305/),
  ].filter(Boolean)
  for (const match of matches) {
    const count = Number(match?.[1])
    if (Number.isFinite(count) && count > 0) return count
  }
  return Array.isArray(skillNames) ? skillNames.length : 0
}

function isOpenClawSkillsToolResult(info = {}) {
  const raw = String(info.rawText || '')
  return Boolean(
    info.skillNames?.length ||
    /\b(skills?_?(?:list|check|search|view)|skill_manager|SKILL\.md)\b/i.test(raw) ||
    /(?:^|[\\/])skills[\\/]/i.test(raw) ||
    /\u6280\u80fd\u5305|\u6280\u80fd\u5217\u8868|Skills\s*\u67e5\u8be2/i.test(raw)
  )
}

function formatOpenClawToolResultForUser(info = {}) {
  if (info.failed) {
    return '\u5de5\u5177\u8c03\u7528\u9047\u5230\u95ee\u9898\uff0c\u8bf7\u5c55\u5f00\u67e5\u770b\u8be6\u7ec6\u4fe1\u606f\u3002'
  }
  if (isOpenClawSkillsToolResult(info)) {
    const count = extractOpenClawSkillsCount(info.rawText, info.skillNames)
    if (count > 0) {
      return `Skills \u67e5\u8be2\u6210\u529f\u3002\u5df2\u53d1\u73b0 ${count} \u4e2a\u6280\u80fd\u5305\u3002\u4f60\u53ef\u4ee5\u5728 Skills \u9875\u9762\u67e5\u770b\u8be6\u60c5\uff0c\u6216\u7ee7\u7eed\u544a\u8bc9\u6211\u8981\u542f\u7528\u3001\u5220\u9664\u3001\u5378\u8f7d\u54ea\u4e2a Skill\u3002`
    }
    return 'Skills \u67e5\u8be2\u5df2\u5b8c\u6210\u3002\u7ed3\u679c\u5df2\u6574\u7406\u5230 Skills \u5217\u8868\uff0c\u8bf7\u5728 Skills \u9875\u9762\u67e5\u770b\u8be6\u60c5\u3002'
  }
  // The timeline already records ordinary tool completion. Avoid repeating a
  // generic success line in the card body when there is no user-facing result.
  return ''
}

function normalizeOpenClawSkillName(value) {
  let name = String(value || '')
    .replace(/[`*_]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^[\s#|:：,，.;；\-]+|[\s#|:：,，.;；\-]+$/g, '')
    .trim()
  if (!name) return ''
  name = name.replace(/\\/g, '/')
  const skillPathMatch = name.match(/(?:^|\/)skills\/([^/\s|,，:：]+)(?:\/SKILL\.md)?$/i)
    || name.match(/(?:^|\/)([^/\s|,，:：]+)\/SKILL\.md$/i)
  if (skillPathMatch) name = skillPathMatch[1]
  if (!name || name.length > 64) return ''
  if (/^(id|no|name|title|skill|skills|path|status|ready|description|desc|total|tool|result|output|success|ok|true|false|null|undefined)$/i.test(name)) return ''
  if (/^(openclaw|hermes|claude|superclaw)$/i.test(name)) return ''
  if (/^\d+$/.test(name)) return ''
  if (/^-+$/.test(name)) return ''
  return name
}

function parseOpenClawSkillNamesFromToolText(text) {
  const raw = String(text || '')
  const names = []
  const seen = new Set()
  const add = (value) => {
    const name = normalizeOpenClawSkillName(value)
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    names.push(name)
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^\|?\s*-{2,}/.test(trimmed)) continue
    if (trimmed.includes('|')) {
      const cells = trimmed.split('|').map(cell => cell.trim()).filter(Boolean)
      if (!cells.length) continue
      const candidates = cells.filter(cell => !/^\d+$/.test(cell) && !/^(id|no|name|title|skill|skills|path|status|ready|description|desc)$/i.test(cell))
      if (candidates.length) add(candidates[0])
      continue
    }
    const named = trimmed.match(/(?:name|title|skill|技能|技能包)\s*[:：=]\s*["']?([^"',，|]+)["']?/i)
    if (named) {
      add(named[1])
      continue
    }
    const pathMatch = trimmed.match(/(?:^|[\\/])skills[\\/]+([^\\/|\s,，:：]+)(?:[\\/]|$)/i)
    if (pathMatch) add(pathMatch[1])
  }

  for (const match of raw.matchAll(/["'](?:name|title|skill|id)["']\s*:\s*["']([^"']+)["']/gi)) {
    add(match[1])
  }

  return names.slice(0, 80)
}

function getOpenClawToolResultInfo(tools = [], fallbackText = '') {
  const list = Array.isArray(tools) ? tools.filter(Boolean) : []
  const rawText = collectOpenClawToolText(list, fallbackText)
  const failed = list.some(tool => tool?.status === 'error' || tool?.isError) || /\b(error|failed|exception|traceback)\b/i.test(rawText)
  const skillNames = parseOpenClawSkillNamesFromToolText(rawText)
  const last = list[list.length - 1] || {}
  const toolDisplayName = getOpenClawToolDisplayName(last)
  const looksLikeSkillResult = skillNames.length > 0
    || /\b(skills?_?(?:list|check|search|view)|skill_manager|SKILL\.md)\b/i.test(rawText)
    || /技能包|技能列表|已发现\s*\d+\s*个技能|total\s*[:=]\s*\d+/i.test(rawText)
  return {
    failed,
    rawText,
    safeRawText: stripRawOpenClawToolText(rawText),
    skillNames,
    isSkillsResult: looksLikeSkillResult,
    toolCount: list.length,
    skillCount: extractOpenClawSkillsCount(rawText, skillNames),
    toolName: toolDisplayName,
    toolDisplayName,
  }
}

function recordOpenClawRunStep(kind, label, status = 'running', stepId = '', extra = {}) {
  const text = String(label || '').trim()
  if (!text) return
  const key = `${kind}:${stepId || text}`
  const current = _currentAiTimeline.find(step => step.key === key)
  if (current) {
    current.status = status || current.status
    if (extra.detail) current.detail = String(extra.detail).trim()
    return
  }
  const previous = _currentAiTimeline[_currentAiTimeline.length - 1]
  if (previous && previous.kind === kind && previous.label === text) {
    previous.status = status || previous.status
    previous.repeatCount = Number(previous.repeatCount || 1) + 1
    previous.time = Date.now()
    if (extra.detail) previous.detail = String(extra.detail).trim()
    return
  }
  _currentAiTimeline.push({
    key,
    kind,
    label: text,
    status,
    detail: String(extra.detail || '').trim(),
    repeatCount: 1,
    time: Date.now(),
  })
}

function mergeOpenClawExecutionTimelines(...sources) {
  const merged = []
  const indexByKey = new Map()
  for (const source of sources) {
    for (const rawStep of Array.isArray(source) ? source : []) {
      if (!rawStep || typeof rawStep !== 'object') continue
      const label = String(rawStep.label || '').trim()
      if (!label) continue
      const key = String(rawStep.key || `${rawStep.kind || 'task'}:${label}`)
      if (indexByKey.has(key)) {
        const index = indexByKey.get(key)
        merged[index] = { ...merged[index], ...rawStep, key, label }
        continue
      }
      indexByKey.set(key, merged.length)
      merged.push({ ...rawStep, key, label })
    }
  }
  return merged
}

function recordOpenClawProgressNarrative(text = '', stepId = '') {
  const value = getOpenClawProgressNarrativeLabel(text)
  if (!value || isOpenClawVisibleTextInternalAuditOnly(value)) return
  // Tool-use prose is visible execution context, not a final answer. Keep it
  // in the collapsible run timeline so users can see what is happening while
  // the native agent continues to work.
  recordOpenClawRunStep('progress', value.slice(0, 600), 'completed', `narrative-${stepId || value.slice(0, 120)}`)
}

function getOpenClawProgressNarrativeLabel(text = '') {
  return sanitizeOpenClawVisibleReply(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getOpenClawVisibleProgressFromEvent(data = {}) {
  // Providers use different names for a public reasoning summary. These are
  // intentionally summary fields only: raw chain-of-thought and internal
  // prompt payloads continue through the normal internal-content filter.
  const candidates = [
    data.reasoning_summary,
    data.reasoningSummary,
    data.public_reasoning,
    data.publicReasoning,
    data.explanation,
    data.plan,
    data.summary,
    data.title,
    data.message,
    data.content,
    data.text,
    data.delta,
  ]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const label = getOpenClawProgressNarrativeLabel(candidate)
    if (!label || isOpenClawVisibleTextInternalAuditOnly(label)) continue
    return label.slice(0, 600)
  }
  return ''
}

// While a native task is running, JSONL contains tool-use frames before the
// terminal assistant reply exists. Do not pass this live source through the
// history compactor first: that compactor intentionally folds tool frames into
// the eventual final reply and would otherwise leave the UI looking idle.
function hydrateOpenClawLiveHistoryProgress(historyMessages = []) {
  // Keep native JSONL frames separate here. A single OpenClaw run normally
  // writes several assistant/toolUse records before its terminal assistant
  // record. The display deduper intentionally folds those records together,
  // so using it during a live run can hide progress or make an intermediate
  // sentence look like the final answer.
  const messages = sortOpenClawMessagesChronologically((historyMessages || []).map((rawMsg, sourceIndex) => {
    const msg = normalizeOpenClawHistoryRecord(rawMsg)
    const content = extractContent(msg)
    return {
      ...msg,
      text: content.text,
      tools: content.tools || [],
      _openClawOriginalIndex: sourceIndex,
    }
  }))
  const activeUserText = _activeOpenClawRun?.userText || _activeOpenClawUserText || _lastVisibleUserText
  const activeFingerprint = normalizeOpenClawPromptFingerprint(activeUserText)
  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user' && openClawVisibleUserText(messages[index]?.text || '')) {
      latestUserIndex = index
      break
    }
  }
  if (latestUserIndex < 0) return false
  const latestUserText = openClawVisibleUserText(messages[latestUserIndex]?.text || '')
  if (!activeFingerprint || normalizeOpenClawPromptFingerprint(latestUserText) !== activeFingerprint) return false

  const timelineBefore = JSON.stringify((_currentAiTimeline || []).map(step => [step?.key, step?.status, step?.label]))
  let changed = false
  for (const message of messages.slice(latestUserIndex + 1)) {
    if (message?.role === 'assistant' && isOpenClawToolUseMessage(message)) {
      recordOpenClawProgressNarrative(message.text || '', message.id || message.messageId)
      if (message.tools?.length) hydrateOpenClawRunTimelineFromTools(message.tools)
      changed = true
      continue
    }
    if (message?.role === 'tool' || message?.role === 'toolResult') {
      hydrateOpenClawRunTimelineFromToolResult(message)
      changed = true
      continue
    }
    if (message?.tools?.length) {
      hydrateOpenClawRunTimelineFromTools(message.tools)
      changed = true
    }
  }
  const timelineChanged = changed && timelineBefore !== JSON.stringify((_currentAiTimeline || []).map(step => [step?.key, step?.status, step?.label]))
  if (timelineChanged) renderOpenClawLiveTimeline()
  return timelineChanged
}

// Gateway stores native work as a sequence of assistant toolUse frames then a
// terminal assistant frame. Keep those frames attached to the terminal reply
// so restoring history cannot lose the process card after a page switch.
function attachOpenClawExecutionTimeline(messages = []) {
  const visible = []
  let steps = []
  let tools = []
  const flush = (message) => {
    if (!steps.length && !tools.length) return message
    const next = {
      ...message,
      executionTimeline: [
        ...steps.map(step => ({ ...step })),
        ...(Array.isArray(message.executionTimeline) ? message.executionTimeline : []),
      ],
      tools: [...tools, ...(Array.isArray(message.tools) ? message.tools : [])],
    }
    steps = []
    tools = []
    return next
  }
  for (const rawMessage of messages || []) {
    if (!rawMessage || typeof rawMessage !== 'object') continue
    const normalized = normalizeOpenClawHistoryRecord(rawMessage)
    const content = extractContent(normalized)
    const message = {
      ...normalized,
      text: content.text,
      tools: content.tools || normalized.tools || [],
    }
    if (message.role === 'user') {
      steps = []
      tools = []
      visible.push(message)
      continue
    }
    if (message.role === 'assistant' && isOpenClawToolUseMessage(message)) {
      const narrative = getOpenClawProgressNarrativeLabel(message.text || '')
      if (narrative && !isOpenClawVisibleTextInternalAuditOnly(narrative)) {
        steps.push({ key: `progress:${message.id || message.messageId || steps.length}`, kind: 'progress', label: narrative.slice(0, 600), status: 'completed' })
      }
      for (const [index, tool] of (message.tools || []).entries()) {
        const id = String(tool?.id || tool?.toolCallId || tool?.tool_call_id || index)
        const label = getOpenClawToolProgressLabel(tool) || '工具调用'
        tools.push(tool)
        steps.push({ key: `tool:${id}`, kind: 'tool', label, status: tool?.status === 'error' || tool?.isError ? 'error' : 'completed' })
      }
      continue
    }
    if (message.role === 'tool' || message.role === 'toolResult') {
      const toolCallId = String(message.toolCallId || message.tool_call_id || message.id || '')
      const matchingStep = toolCallId
        ? steps.find(step => step.key === `tool:${toolCallId}`)
        : null
      if (matchingStep) {
        matchingStep.status = message.isError || message.status === 'error' ? 'error' : 'completed'
      }
      // Tool output belongs to the execution card. Keeping it as a visible
      // assistant candidate lets long outputs merge over the real final.
      continue
    }
    visible.push(message.role === 'assistant' ? flush(message) : message)
  }
  return visible
}

function hydrateOpenClawRunTimelineFromTools(tools = []) {
  for (const [index, tool] of (tools || []).entries()) {
    const id = tool?.id || tool?.tool_call_id || `history-${index}`
    const status = tool?.status || (tool?.isError ? 'error' : 'running')
    const name = getOpenClawToolProgressLabel(tool) || '工具调用'
    upsertTool(_currentAiTools, {
      ...tool,
      id,
      name,
      status,
    })
    if (_activeOpenClawRun) _activeOpenClawRun.sawToolCall = true
    recordOpenClawRunStep('tool', name, status, id)
  }
}

function hydrateOpenClawRunTimelineFromToolResult(message = {}) {
  const id = String(message.toolCallId || message.tool_call_id || message.id || '')
  const status = message.isError || message.status === 'error' ? 'error' : 'completed'
  const name = getOpenClawToolProgressLabel({
    name: message.toolName || message.tool_name || message.name || '',
    toolName: message.toolName || message.tool_name || message.name || '',
  }) || 'tool'
  const output = String(message.text || message.output || message.result || '').trim()
  const stepId = id || `history-result-${_currentAiTools.length}`
  upsertTool(_currentAiTools, {
    id: stepId,
    name,
    output: output.slice(0, 2400),
    status,
  })
  if (_activeOpenClawRun) _activeOpenClawRun.sawToolCall = true
  recordOpenClawRunStep('tool', name, status, stepId)
}

function collapseOpenClawRunTimeline(container) {
  const timeline = container?.querySelector?.('.openclaw-run-timeline')
  if (!timeline) return
  timeline.removeAttribute('open')
  const title = timeline.querySelector?.('summary > span:nth-child(2)')
  if (title?.textContent?.trim() === '正在执行') title.textContent = '执行过程'
}

function ensureOpenClawRunTimelineBubble() {
  if (_currentAiBubble) return _currentAiBubble
  const requestId = String(
    _currentAiBubbleRequestId ||
    _activeClientRequestId ||
    _activeOpenClawRun?.clientRequestId ||
    _activeOpenClawRun?.runId ||
    '',
  )
  if (!requestId) return null
  _currentAiBubble = createStreamBubble({
    clientRequestId: requestId,
    requestId,
    sessionKey: _activeOpenClawRun?.sessionKey || _sessionKey,
    openclawTurnId: _activeOpenClawRun?.openclawTurnId || '',
    assistantMessageId: _activeOpenClawRun?.assistantMessageId || requestId,
    dedupeKey: requestId,
  })
  if (_currentAiBubble) _currentAiBubbleRequestId = requestId
  return _currentAiBubble
}

function renderOpenClawLiveTimeline() {
  const bubble = ensureOpenClawRunTimelineBubble()
  if (!bubble) return false
  const existing = bubble.querySelector?.('.openclaw-tool-result-card')
  const wasOpen = existing?.open === true
  if (existing) existing.remove()
  const rendered = renderOpenClawToolResultCard(bubble, _currentAiTools)
  // The process card has its own progress information. The stream cursor is
  // an extra flashing block below it, while the dedicated typing dots remain.
  bubble.querySelector?.('.stream-cursor')?.remove()
  const replacement = bubble.querySelector?.('.openclaw-tool-result-card')
  if (replacement && wasOpen) replacement.open = true
  return rendered
}

function shouldRenderOpenClawToolResultCard(tools = [], fallbackText = '') {
  if (!isOpenClawToolDebugEnabled()) return false
  if ((!tools || tools.length === 0) && isOpenClawPlainCapabilitySummaryText(fallbackText)) return false
  if ((!tools || tools.length === 0) && isOpenClawFriendlyToolSummaryText(fallbackText)) return false
  const info = getOpenClawToolResultInfo(tools, fallbackText)
  if (info.toolCount > 0) return true
  if (!info.rawText) return false
  if (isInternalToolPlaceholderText(info.rawText)) return true
  if (/\u5de5\u5177(?:\u6267\u884c|\u8c03\u7528)|\u7ed3\u679c\u5df2\u540c\u6b65|\u7ed3\u679c\u5df2\u6536\u8d77|Tool\s+tool|tool_result|tool result/i.test(info.rawText)) return true
  if (/\bTool\s+tool\b|工具执行|工具返回|tool_result|tool result/i.test(info.rawText)) return true
  if (/\b(skills?_?(?:list|check|search|view)|skill_manager|SKILL\.md)\b/i.test(info.rawText)) return true
  if (/\|\s*[-\w./\\ ]+\s*\|/.test(info.rawText) && info.skillNames.length > 1) return true
  if (/已发现\s*\d+\s*个技能|total\s*[:=]\s*\d+/i.test(info.rawText) && info.skillNames.length > 0) return true
  return false
}

function ensureOpenClawToolResultCardStyles() {
  if (document.getElementById('openclaw-tool-result-card-styles')) return
  const style = document.createElement('style')
  style.id = 'openclaw-tool-result-card-styles'
  style.textContent = `
    .openclaw-tool-result-card {
      display: grid;
      gap: 10px;
      margin: 0 0 10px;
      padding: 12px 14px;
      border: 1px solid color-mix(in srgb, var(--border, #d6dee9) 78%, transparent);
      border-radius: 12px;
      background: color-mix(in srgb, var(--chat-assistant-bg, #fff8fb) 86%, var(--chat-page-bg, #eef4fa));
      color: var(--text-primary);
    }
    .openclaw-run-timeline > summary {
      display: flex;
      align-items: center;
      min-width: 0;
      min-height: 20px;
      gap: 6px;
      cursor: pointer;
      list-style: none;
      font-size: 12px;
      line-height: 1.15;
      font-weight: 650;
    }
    .openclaw-run-timeline > summary::-webkit-details-marker { display: none; }
    .openclaw-run-timeline > summary::marker { content: ''; }
    /* Keep the summary in exactly the same box in both states, without the
       grid row gap left below a closed details element. */
    .openclaw-run-timeline:not([open]) { display: block; gap: 0; margin: 0 0 10px; padding: 12px 14px; }
    .openclaw-run-timeline__meta { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-tertiary); font-size: 11px; font-weight: 500; }
    .openclaw-run-timeline__toggle { margin-left: auto; display: inline-flex; align-items: center; color: var(--text-tertiary); transition: transform .16s ease; }
    .openclaw-run-timeline[open] .openclaw-run-timeline__toggle { transform: rotate(90deg); }
    .openclaw-run-timeline__steps { display: grid; gap: 7px; margin: 4px 0 0; padding: 0; list-style: none; }
    .openclaw-run-timeline__step { display: flex; align-items: baseline; gap: 8px; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
    .openclaw-run-timeline__dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--accent, #168c76); }
    .openclaw-run-timeline__step.is-error .openclaw-run-timeline__dot { background: var(--error, #d14d5a); }
    .openclaw-tool-result-card__header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-weight: 800;
      line-height: 1.4;
    }
    .openclaw-tool-result-card__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--accent, #168c76);
    }
    .openclaw-tool-result-card__summary {
      margin: 0;
      color: var(--text-secondary);
      line-height: 1.6;
    }
    .openclaw-tool-result-card__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .openclaw-tool-result-card__chip {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 3px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent, #168c76) 11%, transparent);
      color: color-mix(in srgb, var(--accent, #168c76) 80%, var(--text-primary));
      font-size: 12px;
      line-height: 1.4;
      font-weight: 650;
    }
  `
  document.head.appendChild(style)
}

function renderOpenClawToolResultCard(container, tools = [], fallbackText = '', timelineOverride = null) {
  if (!container) return false
  const info = getOpenClawToolResultInfo(tools, fallbackText)
  const hasTimelineOverride = Array.isArray(timelineOverride) && timelineOverride.length > 0
  if (!info.toolCount && !info.rawText && !_currentAiTimeline.length && !hasTimelineOverride) return false
  ensureOpenClawToolResultCardStyles()
  const title = info.failed
    ? '\u5de5\u5177\u8c03\u7528\u9047\u5230\u95ee\u9898'
    : (isOpenClawSkillsToolResult(info) ? 'Skills \u67e5\u8be2\u6210\u529f' : '\u6267\u884c\u8fc7\u7a0b')
  const count = info.skillNames.length
  const summary = formatOpenClawToolResultForUser(info)
  const active = _openClawPendingResponse || _isSending || _isStreaming
  const timeline = hasTimelineOverride
    ? timelineOverride
    : (_currentAiTimeline.length
      ? _currentAiTimeline
      : tools.map((tool, index) => ({
      key: `tool:${tool?.id || index}`,
      kind: 'tool',
      label: getOpenClawToolProgressLabel(tool) || '工具调用',
      status: tool?.status === 'error' || tool?.isError ? 'error' : 'completed',
      })))
  const timelineToolCount = timeline.filter(step => step.kind === 'tool').length
  const displayedToolCount = Math.max(info.toolCount, timelineToolCount)
  const card = document.createElement('details')
  card.className = 'openclaw-tool-result-card openclaw-run-timeline'
  if (active) card.open = true
  const chips = count
    ? `<div class="openclaw-tool-result-card__chips">${info.skillNames.slice(0, 24).map(name => `<span class="openclaw-tool-result-card__chip">${escapeHtml(name)}</span>`).join('')}${count > 24 ? `<span class="openclaw-tool-result-card__chip">+${count - 24}</span>` : ''}</div>`
    : ''
  const steps = timeline.map(step => {
    const statusHint = step.status === 'error'
      ? ' 此步骤未完成，错误详情已保留。'
      : (step.status === 'running' ? ' 正在进行。' : '')
    const repeatSuffix = Number(step.repeatCount || 1) > 1 ? `（连续 ${step.repeatCount} 次）` : ''
    return `
    <li class="openclaw-run-timeline__step ${step.status === 'error' ? 'is-error' : (step.status === 'running' ? 'is-running' : '')}">
      <span class="openclaw-run-timeline__dot"></span><span>${escapeHtml(`${step.label}${repeatSuffix}${statusHint}`)}</span>
    </li>
  `
  }).join('')
  card.innerHTML = `
    <summary>
      <span class="openclaw-tool-result-card__icon">${svgIcon(info.failed ? 'alert-triangle' : 'wrench', 14)}</span>
      <span>${active ? '正在执行' : title}</span>
      <span class="openclaw-run-timeline__meta">${timeline.length} 个步骤 · ${displayedToolCount} 次工具调用</span>
      <span class="openclaw-run-timeline__toggle" aria-hidden="true">${svgIcon('chevron-right', 14)}</span>
    </summary>
    <ul class="openclaw-run-timeline__steps">${steps}</ul>
    ${summary ? `<p class="openclaw-tool-result-card__summary">${summary}</p>` : ''}
    ${chips}
  `
  // Keep the process summary above the final assistant text for both live
  // streaming bubbles and restored history bubbles.
  container.insertBefore(card, container.firstChild)
  return true
}

function buildToolOnlyAssistantReply(tools = []) {
  const list = Array.isArray(tools) ? tools.filter(Boolean) : []
  if (!list.length) return ''
  const toolInfo = getOpenClawToolResultInfo(list)
  const unavailableReply = buildOpenClawToolUnavailableReply(_lastVisibleUserText)
  if (unavailableReply && (toolInfo.failed || !toolInfo.safeRawText)) {
    return unavailableReply
  }
  if (!toolInfo.failed) {
    return OPENCLAW_TOOL_ONLY_FALLBACK
  }
  return OPENCLAW_TOOL_FAILED_FALLBACK
  const last = list[list.length - 1] || {}
  const name = last.name || last.toolName || last.id || '工具'
  const failed = last.status === 'error' || last.isError
  const statusText = failed ? '执行时遇到错误' : '已经执行完成'
  const output = previewToolValue(last.output ?? last.result ?? last.content ?? last.error)
  if (failed) {
    return [
      `我根据刚才的上下文去执行了 ${name}，但工具返回了错误。`,
      output ? `错误信息：${output}` : '当前没有拿到可展开的错误详情。',
      '我会基于这个结果继续排查原因；如果你给的是要操作桌面或网页的指令，下一步应先确认对应工具权限和目标窗口是否可用。',
    ].join('\n')
  }
  return [
    `我根据刚才的上下文执行了 ${name}，${statusText}。`,
    output ? `我读到的结果是：${output}` : '这次工具没有返回可展开的正文结果，我会继续按当前问题补充判断，而不是停在“我看看”。',
    '如果这是排查任务，我会继续给出原因、影响和下一步处理；如果是执行任务，我会继续完成后汇报结果。',
  ].join('\n')
}

function showOpenClawGenerationNotice(message) {
  if (!_messagesEl || !_typingEl) return
  let notice = _messagesEl.querySelector('[data-openclaw-generation-notice]')
  if (!notice) {
    notice = document.createElement('div')
    notice.setAttribute('data-openclaw-generation-notice', '1')
    notice.className = 'openclaw-generation-notice'
    _messagesEl.insertBefore(notice, _typingEl)
  }
  notice.textContent = message
  notice.hidden = false
  scrollToBottom(true)
}

function clearOpenClawGenerationNotice() {
  const notice = _messagesEl?.querySelector('[data-openclaw-generation-notice]')
  if (notice) {
    notice.hidden = true
    notice.textContent = ''
  }
}

function showOpenClawGenerationActions() {
  if (!_messagesEl || !_typingEl) return
  let actions = _messagesEl.querySelector('[data-openclaw-generation-actions]')
  if (!actions) {
    actions = document.createElement('div')
    actions.setAttribute('data-openclaw-generation-actions', '1')
    actions.className = 'openclaw-generation-actions'
    actions.innerHTML = `
      <button type="button" data-action="wait">继续等待</button>
      <button type="button" data-action="stop">停止生成</button>
      <button type="button" data-action="continue">继续生成</button>
    `
    actions.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]')
      if (!button) return
      const action = button.getAttribute('data-action')

      if (action === 'wait') {
        clearOpenClawGenerationNotice()
        actions.hidden = true
        _generationTimeoutManager?.markHeartbeat()
      } else if (action === 'stop') {
        stopGeneration()
        actions.hidden = true
      } else if (action === 'continue') {
        actions.hidden = true
        clearOpenClawGenerationNotice()
        appendSystemMessage('请继续输入“继续”，或重新发送需要续写的内容。')
      }
    })
    _messagesEl.insertBefore(actions, _typingEl)
  }
  actions.hidden = false
  scrollToBottom(true)
}

function hideOpenClawGenerationActions() {
  const actions = _messagesEl?.querySelector('[data-openclaw-generation-actions]')
  if (actions) actions.hidden = true
}

function hasOpenClawVisibleAssistantNode(node) {
  if (!node || node.hidden) return false
  if (node.querySelector?.('img, video, audio, .msg-file-card')) return true
  const timeline = node.querySelector?.('.openclaw-run-timeline')
  if (timeline) {
    const bubble = node.classList?.contains('msg-bubble') ? node : node.querySelector?.('.msg-bubble')
    // A live timeline is progress, not a completed assistant reply. Treating
    // it as final would stop history recovery before Gateway writes the result.
    if (timeline.open || bubble?.dataset?.openclawPending === 'true') return false
    return bubble?.dataset?.openclawCompleted === 'true'
  }
  if (node.querySelector?.('.msg-tool')) return true
  const text = normalizeOpenClawMessageText(getOpenClawAssistantContentText(node))
    .replace(/\bOpenClaw\b/g, '')
    .replace(/\bTool\b/g, '')
    .replace(/继续等待|停止生成|继续生成|回复等待时间较长|可能仍在生成/g, '')
    .trim()
  return !!text
}

function isOpenClawTransientFallbackText(text = '') {
  const value = normalizeOpenClawMessageText(text)
  if (!value) return false
  return value === normalizeOpenClawMessageText(OPENCLAW_EMPTY_REPLY_FALLBACK) ||
    value === normalizeOpenClawMessageText(OPENCLAW_TOOL_ONLY_FALLBACK) ||
    value === normalizeOpenClawMessageText(OPENCLAW_TOOL_FAILED_FALLBACK) ||
    value.includes('这次没有拿到完整的可用结果') ||
    value.includes('没有收到有效回复') ||
    value.includes('没有生成可展示的回答')
}

function getOpenClawMarkdownTableLines(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(line => {
      const pipeIndex = line.indexOf('|')
      return pipeIndex >= 0 ? line.slice(pipeIndex).trim() : line
    })
    .filter(line => /^\|.*\|$/.test(line))
}

function isOpenClawMarkdownTableSeparatorLine(line = '') {
  return /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(String(line || '').trim())
}

function isOpenClawHalfMarkdownTable(text = '') {
  const value = String(text || '').trim()
  if (!value) return false
  if (/^\|\s*功能\s*\|\s*状态\s*\|\s*说明\s*\|?\s*$/.test(value)) return true
  const tableLines = getOpenClawMarkdownTableLines(value)
  if (!tableLines.length) return false
  const hasSeparator = tableLines.some(isOpenClawMarkdownTableSeparatorLine)
  if (tableLines.length === 1) return true
  if (hasSeparator && tableLines.length < 3) return true
  if (!hasSeparator && tableLines.some(line => /^\|\s*功能\s*\|\s*状态\s*\|\s*说明\s*\|?$/.test(line))) return true
  return false
}

function isOpenClawCompleteMarkdownTable(text = '') {
  const tableLines = getOpenClawMarkdownTableLines(text)
  if (tableLines.length < 3) return false
  return tableLines.some(isOpenClawMarkdownTableSeparatorLine)
}

function isOpenClawIncompleteVisibleText(text = '') {
  const value = normalizeOpenClawMessageText(text)
    .replace(/\bOpenClaw\b/g, '')
    .replace(/\bTool\b/g, '')
    .trim()
  if (!value) return true
  if (/^[|`*_~:：,，.。!！?？\-—\s]+$/.test(value)) return true
  if (isOpenClawHalfMarkdownTable(text)) return true
  const raw = String(text || '').trim()
  const inlineTicks = (raw.match(/`/g) || []).length
  if (inlineTicks % 2 === 1) return true
  const fences = (raw.match(/```/g) || []).length
  if (fences % 2 === 1) return true
  if (/[，、：:；;（(`]$/.test(raw)) return true
  const incompleteTail = [
    /例如\s*$/,
    /包括\s*$/,
    /如下\s*$/,
    /本机控制[:：`]?\s*$/,
    /浏览器自动化[:：]?\s*$/,
    /工具调用[:：]?\s*$/,
  ]
  if (incompleteTail.some(pattern => pattern.test(raw))) return true
  const rawLines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const startsTable = rawLines.some(line => /^\|/.test(line))
  if (startsTable && !isOpenClawCompleteMarkdownTable(text)) return true
  return false
}

function isOpenClawVisibleTextInternalAuditOnly(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return false
  if (!containsOpenClawInternalReasoningOutput(raw) && !isOpenClawInternalReasoningLeak(raw)) return false
  const stripped = stripOpenClawInternalReasoningOutput(stripOpenClawInternalBlocks(raw)).trim()
  if (!stripped) return true
  const cleaned = sanitizeOpenClawVisibleReply(raw).trim()
  if (!cleaned) return true
  if (normalizeOpenClawMessageText(cleaned) === normalizeOpenClawMessageText(OPENCLAW_INTERNAL_REASONING_VISIBLE_FALLBACK)) return true
  const chineseChars = (cleaned.match(/[\u3400-\u9fff]/g) || []).length
  const latinWords = (cleaned.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) || []).length
  return chineseChars < 8 && latinWords >= 16
}

function isOpenClawTextClearlyIncomplete(text = '') {
  return isOpenClawIncompleteVisibleText(text) || isOpenClawHalfMarkdownTable(text)
}

function openClawVisibleCompletenessScore(text = '') {
  const value = String(text || '').trim()
  if (!value) return 0
  let score = Math.min(value.length, 2000)
  if (isOpenClawCompleteMarkdownTable(value)) score += 5000
  if (isOpenClawHalfMarkdownTable(value)) score -= 5000
  if (isOpenClawTextClearlyIncomplete(value)) score -= 2000
  if (isOpenClawVisibleTextInternalAuditOnly(value)) score -= 10000
  return score
}

function normalizeOpenClawPromptFingerprint(text = '') {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

function createOpenClawTurnId() {
  return `oc-turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getOpenClawTurnKey(input = {}) {
  const turnId = input.openclawTurnId || input.turnId || ''
  if (turnId) return `turn:${turnId}`
  const sessionKey = input.sessionKey || input.sessionId || input.conversationId || ''
  const req = input.clientRequestId || input.client_request_id || input.requestId || input.idempotencyKey || input.runId || input.run_id || ''
  if (sessionKey && req) return `req:${sessionKey}:${req}`
  const assistantId = input.assistantMessageId || input.messageId || input.id || ''
  if (assistantId) return `assistant:${assistantId}`
  return ''
}

function isSameOpenClawTurn(a, b) {
  const ka = getOpenClawTurnKey(a)
  const kb = getOpenClawTurnKey(b)
  return Boolean(ka && kb && ka === kb)
}

function isSameOpenClawRequestId(actual = '', expected = '') {
  const left = String(actual || '').trim()
  const right = String(expected || '').trim()
  if (!left || !right) return false
  return left === right || left === `${right}:user` || left === `${right}:assistant`
}

function getOpenClawTurnIdentity(input = {}) {
  const sessionKey = input.sessionKey || input.sessionId || input.conversationId || _sessionKey || ''
  const openclawTurnId = input.openclawTurnId || input.turnId || ''
  if (openclawTurnId) return `${sessionKey}|turn:${openclawTurnId}`
  const clientRequestId = input.clientRequestId || input.client_request_id || input.requestId || input.idempotencyKey || ''
  if (clientRequestId) return `${sessionKey}|request:${clientRequestId}`
  const runId = input.runId || input.run_id || ''
  if (runId) return `${sessionKey}|run:${runId}`
  const previousUserId = input.userMessageId || input._openClawPreviousUserId || ''
  if (previousUserId) return `${sessionKey}|user:${previousUserId}`
  const previousUserFingerprint = input.userFingerprint || input._openClawPreviousUserFingerprint || ''
  if (previousUserFingerprint) return `${sessionKey}|prompt:${previousUserFingerprint}`
  return ''
}

function normalizeOpenClawAssistantTextForDedupe(text = '') {
  return normalizeVisibleOpenClawText(sanitizeOpenClawVisibleReply(text || ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function isSameOpenClawAssistantTurn(a = {}, b = {}) {
  if (!a || !b || a.role !== 'assistant' || b.role !== 'assistant') return false
  const turnA = getOpenClawTurnIdentity(a)
  const turnB = getOpenClawTurnIdentity(b)
  if (turnA && turnB && turnA === turnB) return true
  const userA = a._openClawPreviousUserId || a.userMessageId || ''
  const userB = b._openClawPreviousUserId || b.userMessageId || ''
  if (userA && userB && userA === userB && isOpenClawSameSession(a, b)) return true
  const promptA = a._openClawPreviousUserFingerprint || ''
  const promptB = b._openClawPreviousUserFingerprint || ''
  if (promptA && promptB && promptA === promptB && isOpenClawSameSession(a, b)) return true
  return false
}

function findExistingOpenClawAssistantForTurn(messages = [], candidate = {}) {
  if (!candidate || candidate.role !== 'assistant') return -1
  const candidateText = normalizeOpenClawAssistantTextForDedupe(candidate.text || candidate.content || '')
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const current = messages[index]
    if (!current || current.role === 'user') {
      if (!isSameOpenClawAssistantTurn(current, candidate)) break
      continue
    }
    if (current.role !== 'assistant') continue
    if (isSameOpenClawAssistantTurn(current, candidate)) return index
    const currentText = normalizeOpenClawAssistantTextForDedupe(current.text || current.content || '')
    if (candidateText && currentText && candidateText === currentText && isOpenClawSameSession(current, candidate)) return index
  }
  return -1
}

function mergeOpenClawAssistantMessage(existing, incoming) {
  return mergeOpenClawHistoryMessage(existing, incoming)
}

function collapseDuplicateOpenClawAssistantsWithinUserTurn(messages = []) {
  const result = []
  let lastUser = null
  let lastUserIndex = -1
  for (const raw of messages || []) {
    if (!raw) continue
    const msg = { ...raw }
    if (msg.role === 'user') {
      const visibleUser = openClawVisibleUserText(msg.text || msg.content || '')
      const userFingerprint = normalizeOpenClawPromptFingerprint(visibleUser)
      msg._openClawTurnOrderIndex = result.length
      result.push(msg)
      lastUser = msg
      lastUserIndex = result.length - 1
      continue
    }
    if (msg.role === 'assistant' && lastUser) {
      msg._openClawPreviousUserId = msg._openClawPreviousUserId || lastUser.id || lastUser.messageId || lastUser.dedupeKey || ''
      msg._openClawPreviousUserIndex = Number.isFinite(msg._openClawPreviousUserIndex) ? msg._openClawPreviousUserIndex : lastUserIndex
      msg._openClawPreviousUserFingerprint = msg._openClawPreviousUserFingerprint || normalizeOpenClawPromptFingerprint(openClawVisibleUserText(lastUser.text || lastUser.content || ''))
      const existingIndex = findExistingOpenClawAssistantForTurn(result, msg)
      if (existingIndex >= 0) {
        result[existingIndex] = mergeOpenClawAssistantMessage(result[existingIndex], msg)
        continue
      }
    }
    msg._openClawTurnOrderIndex = result.length
    result.push(msg)
  }
  return result
}

function getOpenClawPromptIntent(text = '') {
  const value = String(text || '')
  if (/只回复\s*OK|只返回\s*OK|only\s+reply\s+OK/i.test(value)) return 'literal_ok'
  if (/表格|Markdown\s*表格|功能.*状态.*说明|状态.*说明.*功能/i.test(value)) return 'markdown_table'
  if (/分\s*\d+\s*点|说明.*能力|浏览器自动化能力|列出\s*\d+\s*点/i.test(value)) return 'long_list'
  return 'general'
}

function isOpenClawCandidateCompatibleWithPrompt(candidateText, userText) {
  const intent = getOpenClawPromptIntent(userText)
  const text = sanitizeOpenClawVisibleReply(candidateText || '').trim()
  if (!text) return false
  if (intent === 'literal_ok') {
    return /^(?:✅\s*)?OK\s*$/i.test(text)
  }
  if (intent === 'markdown_table') {
    return isOpenClawCompleteMarkdownTable(text) || isOpenClawHalfMarkdownTable(text)
  }
  if (intent === 'long_list') {
    return text.length > 80 && !/^(?:✅\s*)?OK\s*$/i.test(text)
  }
  return true
}

function isOpenClawSameSession(a = {}, b = {}) {
  const as = a.sessionKey || _sessionKey || ''
  const bs = b.sessionKey || _sessionKey || ''
  return !as || !bs || as === bs
}

function isOpenClawToolUseMessage(message = {}) {
  const reason = String(message?.stopReason || message?.stop_reason || message?.message?.stopReason || '').trim()
  return /^(?:toolUse|tool_use|tool-call|tool_call)$/i.test(reason)
}

function isOpenClawNativeTerminalAssistant(message = {}) {
  const normalized = normalizeOpenClawHistoryRecord(message)
  if (normalized?.role !== 'assistant') return false
  if (normalized?.trajectoryFinal === true || normalized?._openClawTrajectoryFinal === true) return true
  const reason = String(normalized?.stopReason || normalized?.stop_reason || '').trim()
  return /^(?:stop|end|ended|complete|completed)$/i.test(reason)
}

function getOpenClawStrongHistoryMatchReason(msg = {}, activeRun = _activeOpenClawRun) {
  if (!msg || msg.role !== 'assistant' || !activeRun) return ''
  if (!isOpenClawSameSession(msg, activeRun)) return ''
  // Once both sides have a prompt fingerprint, a mismatch is authoritative.
  // Never let a coincidentally equal array position or reused message slot
  // attach the previous turn's assistant reply to the current request.
  if (
    activeRun.userTextFingerprint &&
    msg._openClawPreviousUserFingerprint &&
    msg._openClawPreviousUserFingerprint !== activeRun.userTextFingerprint
  ) {
    return ''
  }
  if (activeRun.assistantMessageId && [msg.id, msg.messageId, msg.assistantMessageId].includes(activeRun.assistantMessageId)) {
    return 'assistantMessageId'
  }
  if (activeRun.openclawTurnId && (msg.openclawTurnId === activeRun.openclawTurnId || msg.turnId === activeRun.openclawTurnId)) {
    return 'openclawTurnId'
  }
  if (activeRun.clientRequestId && [msg.clientRequestId, msg.requestId, msg.idempotencyKey].includes(activeRun.clientRequestId)) {
    return 'clientRequestId'
  }
  if (activeRun.clientRequestId && isSameOpenClawRequestId(msg._openClawPreviousUserRequestId, activeRun.clientRequestId)) {
    return 'previousUserRequestId'
  }
  if (activeRun.runId && msg.runId && msg.runId === activeRun.runId) {
    return 'runId'
  }
  if (activeRun.userMessageId && msg._openClawPreviousUserId && msg._openClawPreviousUserId === activeRun.userMessageId) {
    return 'previousUserId'
  }
  if (
    activeRun.userTextFingerprint &&
    msg._openClawPreviousUserFingerprint &&
    msg._openClawPreviousUserFingerprint === activeRun.userTextFingerprint
  ) {
    return 'previousUserFingerprint'
  }
  return ''
}

function isStrongOpenClawHistoryCandidate(msg = {}, activeRun = _activeOpenClawRun) {
  if (!getOpenClawStrongHistoryMatchReason(msg, activeRun)) return false
  const text = sanitizeOpenClawVisibleReply(msg.text || '')
  if (!isOpenClawCandidateCompatibleWithPrompt(text, activeRun?.userText || _activeOpenClawUserText || _lastVisibleUserText)) return false
  const messageTime = getOpenClawMessageCreatedTime(msg)
  if (messageTime && activeRun?.startedAt && messageTime < activeRun.startedAt - 5000) return false
  return true
}

function isRecoverableOpenClawCurrentDraft() {
  if (!_currentAiBubble) return false
  const row = _currentAiBubble.closest?.('.msg') || _currentAiBubble
  // A newly submitted native task initially contains only the execution
  // timeline. Reading the whole bubble here mistakes labels such as
  // "AI is thinking" for assistant prose and blocks the durable-history
  // fallback after the native panel has already produced its final answer.
  const assistantContent = _currentAiBubble.querySelector?.('[data-openclaw-assistant-content="true"]') || null
  const text = sanitizeOpenClawVisibleReply(
    assistantContent?.innerText || assistantContent?.textContent || _currentAiText || ''
  )
  return (
    !assistantContent ||
    row?.dataset?.openclawIncomplete === 'true' ||
    _currentAiBubble?.dataset?.openclawIncomplete === 'true' ||
    !text ||
    isOpenClawTransientFallbackText(text) ||
    isOpenClawTextClearlyIncomplete(text)
  )
}

function canRecoverOpenClawDraftFromLatestHistory(msg = {}) {
  if (!msg || msg.role !== 'assistant' || !_currentAiBubble) return false
  const recoveringToolTurn = Boolean(_activeOpenClawRun?.sawToolCall)
  if (!isRecoverableOpenClawCurrentDraft() && !recoveringToolTurn) return false
  if (!isOpenClawSameSession(msg, _activeOpenClawRun || { sessionKey: _sessionKey })) return false
  // An explicit terminal record after the exact current user turn is the
  // portable runtime's source of truth even when Gateway omits request ids.
  // Trust the runtime stop reason over text heuristics: a final answer can
  // legitimately end with a colon/comma (e.g. a MEDIA:<path> output line is
  // stripped from visible text, leaving a colon-terminated sentence behind),
  // which would otherwise be mistaken for an unfinished reply.
  if (msg._openClawAuthoritativeTerminal && msg._openClawAfterLatestHistoryUser) return true
  const text = sanitizeOpenClawVisibleReply(msg.text || '')
  if (!text || isOpenClawVisibleTextInternalAuditOnly(msg.text || '') || isOpenClawTextClearlyIncomplete(text)) return false
  if (_activeOpenClawRun && isStrongOpenClawHistoryCandidate(msg, _activeOpenClawRun)) return true
  if (recoveringToolTurn) return false
  if (!msg._openClawAfterLatestHistoryUser) return false
  const userText = _activeOpenClawRun?.userText || _activeOpenClawUserText || _lastVisibleUserText || getOpenClawLastVisibleUserText()
  return isOpenClawCandidateCompatibleWithPrompt(text, userText)
}

function ensureOpenClawHistoryRecoveryBubble(msg = {}) {
  if (_currentAiBubble) return true
  if (!msg || msg.role !== 'assistant') return false
  if (!(_activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming)) return false
  if (!isOpenClawSameSession(msg, _activeOpenClawRun || { sessionKey: _sessionKey })) return false
  const text = sanitizeOpenClawVisibleReply(msg.text || '')
  if (!text || isOpenClawVisibleTextInternalAuditOnly(msg.text || '') || isOpenClawTextClearlyIncomplete(text)) return false
  if (_activeOpenClawRun && !isStrongOpenClawHistoryCandidate(msg, _activeOpenClawRun)) return false
  const stableStreamId = _activeOpenClawRun?.clientRequestId ||
    _activeClientRequestId ||
    msg.clientRequestId ||
    msg.requestId ||
    msg.idempotencyKey ||
    msg.runId ||
    msg.messageId ||
    msg.id ||
    ''
  _currentAiBubble = createStreamBubble({
    clientRequestId: stableStreamId,
    requestId: stableStreamId,
    sessionKey: msg.sessionKey || _sessionKey,
    openclawTurnId: _activeOpenClawRun?.openclawTurnId || msg.openclawTurnId || '',
    assistantMessageId: msg.messageId || msg.id || stableStreamId,
    dedupeKey: msg.displayDedupeKey || msg.dedupeKey || msg.messageId || msg.id || stableStreamId,
  })
  if (!_currentAiBubble) return false
  _currentAiBubbleRequestId = stableStreamId
  return true
}

function chooseBestOpenClawAssistantText(candidates = [], options = {}) {
  const userText = options.userText || _activeOpenClawUserText || _lastVisibleUserText
  const cleaned = (candidates || [])
    .map(value => String(value || ''))
    .filter(Boolean)
    .map(value => sanitizeOpenClawVisibleReply(value, userText))
    .filter(Boolean)
    .filter(value => !isOpenClawVisibleTextInternalAuditOnly(value))
  if (!cleaned.length) return ''
  return cleaned
    .map((value, index) => ({ value, index, score: openClawVisibleCompletenessScore(value) }))
    .sort((a, b) => (b.score - a.score) || (b.value.length - a.value.length) || (a.index - b.index))[0].value
}

function chooseOpenClawCompletionText(input = {}) {
  const userText = input.userText || _activeOpenClawUserText || _lastVisibleUserText
  return chooseBestOpenClawAssistantText([
    input.accumulated,
    input.finalText,
    ...(input.historyTexts || []),
    ...(input.snapshotTexts || []),
  ], { userText })
}

function hasOpenClawMeaningfulAssistantNode(node) {
  if (!hasOpenClawVisibleAssistantNode(node)) return false
  const text = normalizeOpenClawMessageText(getOpenClawAssistantContentText(node))
    .replace(/\bOpenClaw\b/g, '')
    .replace(/\bTool\b/g, '')
    .trim()
  if (isOpenClawTransientFallbackText(text)) return false
  if (isOpenClawIncompleteVisibleText(text)) return false
  return true
}

function hasOpenClawRenderableContent(input = {}) {
  return !!(
    String(input.visibleText || '').trim() ||
    String(input.text || '').trim() ||
    String(input.content || '').trim() ||
    String(input.message || '').trim() ||
    input.media?.length ||
    input.attachments?.length ||
    input.toolCards?.length ||
    input.images?.length ||
    input.videos?.length ||
    input.audios?.length ||
    input.files?.length ||
    input.tools?.length ||
    input.screenshotCards?.length ||
    input.confirmations?.length ||
    input.confirmationCard ||
    input.confirmation
  )
}

function removeOpenClawEmptyBubble(bubble) {
  if (!bubble) return false
  const row = bubble.closest?.('.msg') || bubble.closest?.('.message-row') || bubble.closest?.('.message') || bubble.closest?.('.assistant-message') || bubble
  if (!row || hasOpenClawVisibleAssistantNode(row)) return false
  row.remove()
  return true
}

function removeCurrentOpenClawStreamBubbleIfEmpty() {
  if (!removeOpenClawEmptyBubble(_currentAiBubble)) return false
  _currentAiBubble = null
  _currentAiBubbleRequestId = ''
  _lastRenderedAiText = ''
  return true
}

function getOpenClawStableStreamId(event = {}, fallback = '') {
  return String(
    event.clientRequestId ||
    event.requestId ||
    event.idempotencyKey ||
    fallback ||
    event.runId ||
    event.id ||
    event.messageId ||
    event.message?.id ||
    ''
  )
}

function hasOpenClawExplicitRequestId(event = {}) {
  return Boolean(event.clientRequestId || event.requestId || event.idempotencyKey)
}

function isOpenClawEventBoundToActiveRequest(event = {}) {
  const activeRequestId = String(_activeClientRequestId || _activeOpenClawRun?.clientRequestId || '')
  const activeRunId = String(_currentRunId || _activeOpenClawRun?.runId || '')
  const eventRunId = getOpenClawNativeRunId(event)
  const eventRequestIds = [
    event?.clientRequestId,
    event?.requestId,
    event?.idempotencyKey,
    event?.data?.clientRequestId,
    event?.data?.requestId,
    event?.data?.idempotencyKey,
  ]
    .filter(Boolean)
    .map(value => String(value))
  if (activeRequestId && (eventRequestIds.includes(activeRequestId) || eventRunId === activeRequestId)) return true
  if (activeRunId && eventRunId === activeRunId) return true
  return false
}

function shouldIgnoreOpenClawUnboundChatEvent(event = {}, state = '', incomingText = '') {
  if (!['delta', 'final', 'aborted', 'error'].includes(String(state || ''))) return false
  const expectingResponse = !_openClawActiveRequestClosed || _openClawPendingResponse || _isSending || _isStreaming
  if (!expectingResponse && !_activeClientRequestId) return true
  if (expectingResponse && (_activeClientRequestId || _activeOpenClawRun)) {
    // A reconnect can replay the previous run's final before the current run's
    // first frame. Only a request/run id tied to this turn may mutate its draft.
    // Unidentified events remain recoverable from authoritative JSONL history.
    if (!isOpenClawEventBoundToActiveRequest(event)) return true
  }
  if (hasOpenClawExplicitRequestId(event)) return false
  if (
    _activeClientRequestId &&
    isOpenClawBrowserAutomationTraceText(incomingText) &&
    !isOpenClawBrowserScreenshotIntent(_lastVisibleUserText)
  ) {
    return true
  }
  return false
}

function shouldUseOpenClawEmptyReplyFallback(requestId = null) {
  if (_currentAiBubble) return true
  if (requestId && _activeClientRequestId && requestId !== _activeClientRequestId) return false
  return Boolean(
    _openClawPendingResponse ||
    _isSending ||
    _isStreaming ||
    (requestId && requestId === _activeClientRequestId)
  )
}

function isOpenClawStreamIdMismatch(event = {}, stableStreamId = '') {
  const activeSessionKey = normalizeOpenClawSessionKey(_activeOpenClawRun?.sessionKey || _sessionKey)
  const eventSessionKey = normalizeOpenClawSessionKey(event?.sessionKey || '')
  if (activeSessionKey && eventSessionKey && activeSessionKey !== eventSessionKey) return true

  if ((_activeClientRequestId || _activeOpenClawRun) && !isOpenClawEventBoundToActiveRequest(event)) return true
  if (!_currentAiBubbleRequestId || !stableStreamId || _currentAiBubbleRequestId === stableStreamId) return false

  // OpenClaw can emit a tool-use prelude and its final assistant reply with
  // different message/request ids. A shared run id still means the same turn;
  // some final events do not repeat the client request id at all.
  const activeRunId = String(_currentRunId || _activeOpenClawRun?.runId || '')
  const eventRunId = String(event?.runId || '')
  if (activeRunId && eventRunId && activeRunId === eventRunId) return false
  if (activeRunId && eventRunId && activeRunId !== eventRunId) return true

  if (isOpenClawEventBoundToActiveRequest(event)) return false

  // Do not drop a current final merely because it uses an assistant-message id.
  // A foreign event is only safe to reject once this turn is no longer active.
  return !isOpenClawGenerationActive()
}

function hasOpenClawAssistantVisibleContentForRequest(requestId = null) {
  if (requestId && _activeClientRequestId && requestId !== _activeClientRequestId) return false
  if (hasOpenClawMeaningfulAssistantNode(_currentAiBubble?.closest?.('.msg') || _currentAiBubble)) return true
  if (!_messagesEl) return false
  const rows = Array.from(_messagesEl.querySelectorAll('.msg-user, .msg-ai'))
  let afterLastUser = false
  let hasVisibleAssistant = false
  for (const row of rows) {
    if (row.classList.contains('msg-user')) {
      afterLastUser = true
      hasVisibleAssistant = false
      continue
    }
    if (afterLastUser && row.classList.contains('msg-ai') && hasOpenClawMeaningfulAssistantNode(row)) {
      hasVisibleAssistant = true
    }
  }
  return hasVisibleAssistant
}

function waitOpenClawMs(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

async function recoverOpenClawAssistantFromHistoryBeforeFallback(reason = 'history-recovery', requestId = null, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 4))
  const delayMs = Math.max(0, Number(options.delayMs || 900))
  for (let index = 0; index < attempts; index += 1) {
    _lastHistoryHash = ''
    await loadHistory()
    if (hasOpenClawAssistantVisibleContentForRequest(requestId)) {
      clearOpenClawGenerationState(`${reason}-history-visible`, requestId)
      resetStreamState()
      processMessageQueue()
      return true
    }
    try {
      const history = await wsClient.chatHistory(_sessionKey, 200)
      if (completeOpenClawCurrentDraftFromLatestHistory(history?.messages || [])) {
        clearOpenClawGenerationState(`${reason}-history-direct-complete`, requestId)
        processMessageQueue()
        return true
      }
    } catch (error) {
      console.warn('[chat] OpenClaw direct history completion failed:', error)
    }
    if (index < attempts - 1) await waitOpenClawMs(delayMs)
  }
  return false
}

function clearOpenClawGenerationState(reason = 'completed', requestId = null) {
  if (requestId && _activeClientRequestId && requestId !== _activeClientRequestId) return false
  _openClawPendingResponse = false
  _openClawActiveRequestClosed = true
  _isSending = false
  _isStreaming = false
  _manualStopRequested = reason === 'stopped' ? true : _manualStopRequested
  _cancelResponseWatchdog()
  clearGenerationTimeoutManager()
  clearTimeout(_streamSafetyTimer)
  clearOpenClawTransientRecoveryTimer()
  clearOpenClawToolFinalRecoveryTimer()
  if (requestId) releaseOpenClawRequestFingerprint(requestId)
  else releaseOpenClawRequestFingerprint()
  if (_activeClientRequestId) _inFlightRequestIds.delete(_activeClientRequestId)
  if (requestId) _inFlightRequestIds.delete(requestId)
  _activeClientRequestId = null
  _activeOpenClawUserText = ''
  _currentRunId = null
  _currentAiBubbleRequestId = ''
  finishOpenClawActiveRun(
    reason === 'stopped' ? 'aborted' : (reason.includes('failed') || reason.includes('error') ? 'failed' : 'completed'),
    reason
  )
  _sendTimestamp = 0
  _lastResponseActivityAt = 0
  clearOpenClawGenerationNotice()
  hideOpenClawGenerationActions()
  showTyping(false)
  updateSendState()
  return true
}

function maybeShowOpenClawLongResponseWarning(message, requestId = null, options = {}) {
  if (requestId && _activeClientRequestId && requestId !== _activeClientRequestId) return false
  if (_openClawActiveRequestClosed) return false
  if (!_openClawPendingResponse && !_isSending && !_isStreaming) return false
  const liveTimeline = _currentAiBubble?.querySelector?.('.openclaw-run-timeline[open]')
  if (liveTimeline) return false
  if (hasOpenClawAssistantVisibleContentForRequest(requestId)) {
    // Visible text can be an intermediate native delta. Its presence is not a
    // terminal signal and must never close a long tool run.
    return false
  }
  showOpenClawGenerationNotice(message)
  showTyping(true, message)
  if (options.actions) showOpenClawGenerationActions()
  return true
}

function clearGenerationTimeoutManager() {
  if (_generationTimeoutManager) {
    _generationTimeoutManager.stop()
    _generationTimeoutManager = null
  } else {
    clearOpenClawGenerationNotice()
    hideOpenClawGenerationActions()
  }
}

function startGenerationTimeoutManager() {
  clearGenerationTimeoutManager()
  _manualStopRequested = false
  const requestId = _activeClientRequestId
  _generationTimeoutManager = createGenerationTimeoutManager({
    onFirstTokenSlow: ({ message }) => {
      maybeShowOpenClawLongResponseWarning(message, requestId)
    },
    onIdleTimeout: ({ message }) => {
      maybeShowOpenClawLongResponseWarning(message, requestId, { actions: true })
    },
    onClearNotice: () => {
      clearOpenClawGenerationNotice()
      hideOpenClawGenerationActions()
    },
  })
  _generationTimeoutManager.start()
}

function markGenerationProgress() {
  _generationTimeoutManager?.markProgress()
}

function markGenerationHeartbeat() {
  _generationTimeoutManager?.markHeartbeat()
}

function stopGeneration() {
  _manualStopRequested = true
  const requestId = _activeClientRequestId
  _generationTimeoutManager?.stop()
  if (_currentRunId) wsClient.chatAbort(_sessionKey, _currentRunId).catch(() => {})
  clearOpenClawGenerationState('stopped', requestId)
}

// ── 事件处理（参照 clawapp 实现） ──

function isOpenClawChatEvent(event) {
  return event === 'chat' || event === 'chat.message'
}

// Recent OpenClaw gateways emit assistant output through the structured
// `agent` stream while older builds use `chat.message`. Keep one renderer for
// both transports: the execution card still consumes tool/plan events, while
// only assistant output is normalized into the regular chat stream below.
function normalizeOpenClawAgentChatEvent(payload = {}) {
  const stream = String(payload?.stream || '').trim().toLowerCase()
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  const outputStreams = new Set(['assistant', 'message', 'text', 'delta', 'output', 'final'])
  if (!outputStreams.has(stream)) return null

  const nativeDeltaText = typeof data.deltaText === 'string'
    ? data.deltaText
    : (typeof payload.deltaText === 'string' ? payload.deltaText : null)
  const rawText = extractOpenClawAssistantText(data)
  if (!rawText && nativeDeltaText == null) return null
  const phase = String(data?.state || data?.phase || '').trim().toLowerCase()
  const isFinal = stream === 'final' || data?.done === true || ['final', 'complete', 'completed', 'end', 'ended'].includes(phase)
  const replaceDelta = nativeDeltaText != null && (data.replace === true || payload.replace === true)
  const legacyIncrementalDelta = data.delta != null && data.content == null && data.text == null && data.output == null && data.result == null
  const isIncrementalDelta = nativeDeltaText != null ? !replaceDelta : legacyIncrementalDelta
  const streamingText = nativeDeltaText != null
    ? nativeDeltaText
    : (legacyIncrementalDelta ? extractOpenClawTextPart(data.delta) : rawText)
  const cumulativeMessageText = nativeDeltaText != null
    ? extractOpenClawTextPart(data.message ?? payload.message)
    : ''
  const message = {
    content: streamingText,
    text: streamingText,
    stopReason: data.stopReason || data.stop_reason || '',
  }

  return {
    sessionKey: payload.sessionKey || data.sessionKey || '',
    runId: payload.runId || data.runId || '',
    clientRequestId: payload.clientRequestId || data.clientRequestId || '',
    requestId: payload.requestId || data.requestId || '',
    idempotencyKey: payload.idempotencyKey || data.idempotencyKey || '',
    timestamp: payload.ts || data.ts || Date.now(),
    _openClawSourceEventTimestamp: payload.ts || data.ts || null,
    sequence: payload.sequence ?? payload.seq ?? data.sequence ?? data.seq ?? null,
    state: isFinal ? 'final' : 'delta',
    _openClawIncrementalDelta: isIncrementalDelta,
    _openClawReplaceDelta: replaceDelta,
    _openClawCumulativeMessageText: cumulativeMessageText,
    _openClawRawDeltaText: streamingText,
    message: {
      ...message,
      id: data.message?.id || data.messageId || payload.message?.id || payload.messageId || '',
    },
  }
}

function mergeOpenClawStreamingText(currentText = '', incomingText = '', incremental = false, options = {}) {
  const current = String(currentText || '')
  const incoming = String(incomingText || '')
  const cumulative = String(options?.cumulativeMessageText || '')
  if (options?.replace === true) return incoming
  if (!incoming) return current
  if (!current) return cumulative || incoming
  if (incremental && cumulative) {
    const prefixLength = cumulative.length - incoming.length
    if (prefixLength !== current.length || cumulative.slice(0, prefixLength) !== current) return cumulative
  }
  if (incoming.startsWith(current)) return incoming
  if (current.startsWith(incoming) || current.endsWith(incoming)) return current
  return incremental ? `${current}${incoming}` : incoming
}

function handleEvent(msg) {
  const { event, payload } = msg
  if (!payload) return

  // ── 处理所有 agent 事件（OpenClaw 4.5+ 结构化进度） ──
  if (event === 'agent') {
    const agentSessionKey = normalizeOpenClawSessionKey(payload.sessionKey || '')
    const currentSessionKey = normalizeOpenClawSessionKey(_activeOpenClawRun?.sessionKey || _sessionKey)
    const generationActive = isOpenClawGenerationActive()
    if (agentSessionKey && currentSessionKey && agentSessionKey !== currentSessionKey) return
    if (generationActive && !isOpenClawEventBoundToActiveRequest(payload)) {
      console.log('[chat] skipped stale OpenClaw progress event:', payload.stream || '', payload.runId || '')
      return
    }
    if (!generationActive && !_hostedSessionConfig?.enabled) return
    // 任何 agent 事件都说明 OpenClaw 在活跃处理，重置看门狗
    _resetWatchdogOnActivity()
    markGenerationProgress()

    const stream = payload?.stream
    const data = payload?.data || {}

    // tool 事件（已有逻辑）
    if (stream === 'tool' && data.toolCallId) {
      const ts = payload.ts
      const toolCallId = data.toolCallId
      const runKey = `${payload.runId}:${toolCallId}`
      if (_toolEventSeen.has(runKey)) return
      _toolEventSeen.add(runKey)
      if (ts) _toolEventTimes.set(toolCallId, ts)
      const current = _toolEventData.get(toolCallId) || {}
      if (data.args && current.input == null) current.input = data.args
      if (data.meta && current.output == null) current.output = data.meta
      if (typeof data.isError === 'boolean' && current.status == null) current.status = data.isError ? 'error' : 'ok'
      if (current.time == null) current.time = ts || null
      _toolEventData.set(toolCallId, current)
      const toolLabel = getOpenClawToolProgressLabel({
        name: data.name || data.toolName || 'tool',
        toolName: data.name || data.toolName || '',
        input: current.input || null,
      }) || '工具调用'
      upsertTool(_currentAiTools, {
        id: toolCallId,
        name: toolLabel,
        toolName: data.name || data.toolName || '',
        input: current.input || null,
        output: current.output || null,
        status: current.status || 'running',
        time: current.time || null,
      })
      recordOpenClawRunStep('tool', toolLabel, current.status || 'running', toolCallId)
      renderOpenClawLiveTimeline()
      if (payload.runId) {
        const list = _toolRunIndex.get(payload.runId) || []
        if (!list.includes(toolCallId)) list.push(toolCallId)
        _toolRunIndex.set(payload.runId, list)
      }
      if (toolLabel && !_isStreaming) {
        showTyping(true, `正在${toolLabel}`)
      }
    }

    // lifecycle 事件：处理开始/结束
    if (stream === 'lifecycle') {
      const phase = data.phase
      if (phase === 'start' && !_isStreaming) {
        showTyping(true, t('chat.aiProcessing'))
      }
      if (phase === 'end' && (_activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming)) {
        // The native runtime emits lifecycle:end before its trailing chat
        // final frame. If that projection is delayed or filtered, recover the
        // durable JSONL/trajectory result immediately instead of leaving the
        // SuperClaw bubble in a permanent thinking state.
        const lifecycleRequestId = _activeClientRequestId || _activeOpenClawRun?.clientRequestId || null
        startOpenClawProgressHistoryPolling()
        recoverOpenClawAssistantFromHistoryBeforeFallback('agent-lifecycle-end', lifecycleRequestId, {
          attempts: 10,
          delayMs: 250,
        }).catch(error => {
          console.warn('[chat] lifecycle final history recovery failed:', error)
        })
      }
    }

    // item 事件（4.5+ 结构化执行步骤：tool/command/patch/search/analysis）
    if (stream === 'item') {
      const title = data.title || data.name || ''
      const kind = data.kind || ''
      if ((data.phase === 'start' || data.phase === 'update') && !_isStreaming) {
        const hint = kind === 'command' ? t('chat.commandRunning')
          : kind === 'search' ? t('chat.aiSearching')
          : kind === 'analysis' ? t('chat.aiAnalyzing')
          : title ? t('chat.aiExecuting', { title })
          : t('chat.aiProcessing')
        showTyping(true, hint)
        recordOpenClawRunStep(kind || 'task', title || hint, data.phase === 'start' ? 'running' : 'completed')
        renderOpenClawLiveTimeline()
      }
    }

    // plan 事件（4.5+ 计划更新）
    if (stream === 'plan' && !_isStreaming) {
      showTyping(true, t('chat.aiPlanning'))
      const plan = getOpenClawVisibleProgressFromEvent(data)
      recordOpenClawRunStep('plan', plan ? `计划更新：${plan}` : '正在规划执行步骤。', 'running', data.id || data.stepId || 'gateway-plan')
      renderOpenClawLiveTimeline()
    }

    // approval 事件（操作审批）
    if (stream === 'approval' && !_isStreaming) {
      showTyping(true, t('chat.waitingApproval'))
    }

    // thinking 事件（推理/思考）
    if (stream === 'thinking' && !_isStreaming) {
      showTyping(true, t('chat.aiThinking'))
      const thought = getOpenClawVisibleProgressFromEvent(data)
      recordOpenClawRunStep('analysis', thought ? `推理摘要：${thought}` : '正在分析任务并确定下一步。', 'running', data.id || data.stepId || 'gateway-reasoning')
      renderOpenClawLiveTimeline()
    }

    // command_output 事件（命令输出增量）
    if (stream === 'command_output' && !_isStreaming) {
      showTyping(true, t('chat.commandRunning'))
    }

    // compaction 事件
    if (stream === 'compaction') {
      showCompactionHint(true)
    }

    // error 事件：Agent 运行失败（如 yyapi 403 余额不足、429 限流、401、超时）。
    // 必须识别错误类型并持久化展示，绝不能只做一闪而过的 typing 提示，
    // 否则用户只会看到"超时/无反应"，误以为系统故障。
    if (stream === 'error' && data.message) {
      const errMsg = String(data.message || '')
      const friendly = formatStuckSessionError({
        error: errMsg,
        errorType: /timeout|aborted|idle/i.test(errMsg) ? 'timeout' : undefined,
      })
      const display = friendly || `AI 执行出错：${errMsg.slice(0, 300)}`
      if (_currentAiBubble && (_isStreaming || _isSending || _openClawPendingResponse)) {
        _currentAiText = display
        renderCompactAssistantContent(display, _currentAiBubble, { phase: 'error' })
        _lastRenderedAiText = display
        _isStreaming = false
        _isSending = false
        _openClawPendingResponse = false
        showTyping(false)
        clearOpenClawGenerationNotice()
        hideOpenClawGenerationActions()
        updateSendState()
        finishOpenClawActiveRun('failed', 'llm-error-stream')
        processMessageQueue()
      } else {
        showTyping(true, `⚠ ${display}`)
      }
    }
  }

  if (event === 'agent') {
    // The native OpenClaw panel receives assistant prose on the `agent`
    // channel in newer gateway builds. Previously SuperClaw treated that
    // channel as progress-only, leaving its chat view stuck on "thinking".
    // Route only text-bearing assistant frames into the existing guarded
    // chat renderer so session/request isolation stays identical to legacy
    // `chat.message` events.
    const agentChatPayload = normalizeOpenClawAgentChatEvent(payload)
    if (agentChatPayload) handleChatEvent(agentChatPayload, msg.id)
  }

  if (isOpenClawChatEvent(event)) handleChatEvent(payload, msg.id)

  // Compaction 状态指示：上游 2026.3.12 新增 status_reaction 事件
  if (event === 'chat.status_reaction' || event === 'status_reaction') {
    const reaction = payload.reaction || payload.emoji || ''
    if (reaction.includes('compact') || reaction === '🗜️' || reaction === '📦') {
      showCompactionHint(true)
    } else if (!reaction || reaction === 'thinking' || reaction === '💭') {
      showCompactionHint(false)
    }
  }
}

function handleChatEvent(payload, eventId = '') {
  const payloadSessionKey = payload.sessionKey ? normalizeOpenClawSessionKey(payload.sessionKey) : ''
  const currentSessionKey = normalizeOpenClawSessionKey(_sessionKey)
  const hostedRawSessionKey = getHostedBoundSessionKey()
  const hostedSessionKey = hostedRawSessionKey ? normalizeOpenClawSessionKey(hostedRawSessionKey) : ''
  const isCurrentSession = !payloadSessionKey || !currentSessionKey || payloadSessionKey === currentSessionKey
  const isHostedSession = !!payloadSessionKey && !!hostedSessionKey && payloadSessionKey === hostedSessionKey

  // sessionKey 过滤：当前会话照常渲染；托管绑定会话在后台继续驱动循环
  if (!isCurrentSession && !isHostedSession) return
  const eventKey = getChatEventDedupeKey(payload, eventId)
  if (eventKey && _seenChatEventKeys.has(eventKey)) {
    console.log('[chat] skipped duplicate chat event:', eventKey)
    return
  }
  rememberBounded(_seenChatEventKeys, eventKey, 600)

  if (!isCurrentSession && isHostedSession) {
    if (payload.state === 'final' && shouldCaptureHostedTarget(payload)) {
      const c = extractChatContent(payload.message)
      const capturedText = c?.text || ''
      if (capturedText) {
        appendHostedTarget(capturedText)
        if (detectStopFromText(capturedText)) {
          stopHostedAgent()
        } else {
          maybeTriggerHostedRun()
        }
      }
    }

    if (payload.state === 'error' && _hostedSessionConfig?.enabled) {
      _hostedRuntime.errorCount = (_hostedRuntime.errorCount || 0) + 1
      _hostedRuntime.lastError = payload.errorMessage || payload.error?.message || t('common.error')
      _hostedRuntime.pending = false
      if (_hostedRuntime.errorCount >= _hostedSessionConfig.retryLimit) {
        _hostedRuntime.status = HOSTED_STATUS.ERROR
      }
      persistHostedRuntime()
      updateHostedBadge()
    }
    return
  }

  const { state } = payload
  const runId = payload.runId
  const terminalRequestId = payload.clientRequestId || payload.idempotencyKey || _activeClientRequestId
  const incomingEventText = getChatEventText(payload)
  if (shouldIgnoreOpenClawUnboundChatEvent(payload, state, incomingEventText)) {
    console.log('[chat] skipped unbound stale OpenClaw event:', state, runId || eventId || '')
    return
  }

  // 重复 run 过滤：跳过已完成的 runId 的后续事件（Gateway 可能对同一消息触发多个 run）
  if (runId && state === 'final' && _seenRunIds.has(runId)) {
    console.log('[chat] 跳过重复 final, runId:', runId)
    clearOpenClawGenerationState('duplicate-final', terminalRequestId)
    return
  }
  if (runId && state === 'delta' && _seenRunIds.has(runId) && !_isStreaming) {
    console.log('[chat] 跳过已完成 run 的 delta, runId:', runId)
    return
  }

  if (state === 'delta') {
    markOpenClawGatewayReady('chat-delta')
    clearOpenClawTransientRecoveryTimer()
    markGenerationProgress()
    _resetWatchdogOnActivity()
    const c = extractChatContent(payload.message)
    const stableStreamId = getOpenClawStableStreamId(payload, terminalRequestId)
    if (isOpenClawStreamIdMismatch(payload, stableStreamId)) return
    if (c?.images?.length) _currentAiImages = c.images
    if (c?.videos?.length) _currentAiVideos = c.videos
    if (c?.audios?.length) _currentAiAudios = c.audios
    if (c?.files?.length) _currentAiFiles = c.files
    if (c?.tools?.length) {
      _currentAiTools = c.tools
      updateOpenClawActiveRun({ sawToolCall: true })
      scheduleOpenClawToolFinalRecovery(terminalRequestId)
    }
    const visibleDeltaFallbackText = isOpenClawAssistantFailurePlaceholderText(c?.text) ? '' : (c?.text || '')
    const nativeDeltaText = typeof payload.deltaText === 'string'
      ? payload.deltaText
      : (typeof payload.data?.deltaText === 'string' ? payload.data.deltaText : null)
    const nativeReplaceDelta = nativeDeltaText != null && (payload.replace === true || payload.data?.replace === true)
    const nativeCumulativeMessageText = nativeDeltaText != null
      ? extractOpenClawTextPart(payload.message ?? payload.data?.message)
      : ''
    const rawDeltaText = nativeDeltaText != null
      ? nativeDeltaText
      : payload._openClawRawDeltaText != null
      ? payload._openClawRawDeltaText
      : (extractOpenClawAssistantText(payload) || visibleDeltaFallbackText)
    _currentAiStreamRawText = mergeOpenClawStreamingText(
      _currentAiStreamRawText,
      rawDeltaText,
      nativeDeltaText != null ? !nativeReplaceDelta : payload._openClawIncrementalDelta === true,
      {
        replace: nativeDeltaText != null ? nativeReplaceDelta : payload._openClawReplaceDelta === true,
        cumulativeMessageText: nativeDeltaText != null
          ? nativeCumulativeMessageText
          : (payload._openClawCumulativeMessageText || ''),
      },
    )
    const visibleDeltaText = sanitizeOpenClawVisibleReply(_currentAiStreamRawText)
    if (isOpenClawBrowserScreenshotIntent(_lastVisibleUserText) && isOpenClawBrowserAutomationTraceText(visibleDeltaText)) {
      return
    }
    if (!hasOpenClawRenderableContent({ visibleText: visibleDeltaText })) {
      removeCurrentOpenClawStreamBubbleIfEmpty()
      return
    }
    if (visibleDeltaText && visibleDeltaText !== _currentAiText) {
      showTyping(false)
      if (!_currentAiBubble) {
        _currentAiBubble = createStreamBubble({
          clientRequestId: stableStreamId,
          requestId: stableStreamId,
          dedupeKey: getOpenClawMessageDedupeKey({
            role: 'assistant',
            state,
            runId,
            sessionKey: payload.sessionKey || _sessionKey,
            requestId: payload.requestId,
            clientRequestId: payload.clientRequestId,
            idempotencyKey: payload.idempotencyKey || terminalRequestId,
          }),
          sessionKey: _sessionKey,
          openclawTurnId: _activeOpenClawRun?.openclawTurnId || '',
          assistantMessageId: _activeOpenClawRun?.assistantMessageId || '',
        })
        if (!_currentAiBubble) return
        _currentAiBubbleRequestId = stableStreamId
        _currentRunId = payload.runId
        updateOpenClawActiveRun({
          clientRequestId: terminalRequestId,
          runId: payload.runId || _activeOpenClawRun?.runId || null,
          assistantMessageId: stableStreamId,
          status: 'streaming',
        })
        _isStreaming = true
        _streamStartTime = Date.now()
        updateSendState()
      }
      _currentAiText = visibleDeltaText
      updateOpenClawActiveRun({
        clientRequestId: terminalRequestId,
        runId: payload.runId || _activeOpenClawRun?.runId || null,
        assistantMessageId: _currentAiBubbleRequestId || stableStreamId,
        accumulatedText: _currentAiText,
        status: 'streaming',
      })
      throttledRender()
    }
    return
  }

  if (state === 'final') {
    markOpenClawGatewayReady('chat-final')
    clearOpenClawTransientRecoveryTimer()
    _cancelResponseWatchdog()
    clearGenerationTimeoutManager()
    const c = extractChatContent(payload.message)
    if (isOpenClawToolUseMessage(payload.message || payload)) {
      recordOpenClawProgressNarrative(extractOpenClawAssistantText(payload.message) || c?.text || '', payload.message?.id || eventId || payload.runId)
      if (c?.tools?.length) {
        _currentAiTools = c.tools
        updateOpenClawActiveRun({ sawToolCall: true, status: 'running' })
        hydrateOpenClawRunTimelineFromTools(c.tools)
        renderOpenClawLiveTimeline()
      }
      showTyping(true, t('chat.aiExecuting'))
      startOpenClawProgressHistoryPolling()
      return
    }
    // Native OpenClaw can emit text-bearing `final` frames between tool calls.
    // Keep the turn alive until portable history records an explicit terminal
    // assistant stop; otherwise the WebView closes on an intermediate step.
    if (_activeOpenClawRun?.sawToolCall && !isOpenClawNativeTerminalAssistant(payload.message || payload)) {
      recordOpenClawProgressNarrative(
        extractOpenClawAssistantText(payload.message) || getChatEventText(payload) || '',
        payload.message?.id || eventId || payload.runId,
      )
      showTyping(true, t('chat.aiExecuting'))
      renderOpenClawLiveTimeline()
      startOpenClawProgressHistoryPolling()
      return
    }
    const stableStreamId = getOpenClawStableStreamId(payload, terminalRequestId)
    if (isOpenClawStreamIdMismatch(payload, stableStreamId)) return
    updateOpenClawActiveRun({
      clientRequestId: terminalRequestId,
      runId: payload.runId || _activeOpenClawRun?.runId || null,
      assistantMessageId: _currentAiBubbleRequestId || stableStreamId,
    })
    const accumulatedBeforeFinal = _currentAiText || ''
    const activeFinalUserText = _activeOpenClawUserText || _lastVisibleUserText
    const normalizedFinal = normalizeOpenClawVisibleAssistantText(payload, { fallback: '', userText: activeFinalUserText })
    const visibleFinalFallbackText = isOpenClawAssistantFailurePlaceholderText(c?.text) ? '' : (c?.text || '')
    const rawFinalText = normalizedFinal.usedFallback ? visibleFinalFallbackText : normalizedFinal.text
    _currentAiText = chooseOpenClawCompletionText({
      accumulated: accumulatedBeforeFinal,
      finalText: rawFinalText || accumulatedBeforeFinal,
      userText: activeFinalUserText,
    })
    const finalText = _currentAiText || ''
    const finalImages = c?.images || []
    const finalVideos = c?.videos || []
    const finalAudios = c?.audios || []
    const finalFiles = c?.files || []
    const finalScreenshotCards = c?.screenshotCards || []
    const finalConfirmations = c?.confirmations || []
    let finalTools = c?.tools || []
    if (!finalTools.length && runId) {
      const ids = _toolRunIndex.get(runId) || []
      finalTools = ids.map(id => mergeToolEventData({ id, name: 'tool' })).filter(Boolean)
    }
    if (finalImages.length) _currentAiImages = finalImages
    if (finalVideos.length) _currentAiVideos = finalVideos
    if (finalAudios.length) _currentAiAudios = finalAudios
    if (finalFiles.length) _currentAiFiles = finalFiles
    if (finalTools.length) _currentAiTools = finalTools
    if (!finalText && !_currentAiText && finalTools.length) {
      _currentAiText = buildToolOnlyAssistantReply(finalTools)
    }
    const exactShortPreFinalText = normalizeOpenClawExactShortReply(activeFinalUserText, _currentAiText)
    if (exactShortPreFinalText !== _currentAiText) {
      _currentAiText = exactShortPreFinalText
    }
    if (_currentAiText && isOpenClawTextClearlyIncomplete(_currentAiText)) {
      keepOpenClawIncompleteFinalPending(_currentAiText, terminalRequestId, stableStreamId)
      recoverOpenClawAssistantFromHistoryBeforeFallback('incomplete-final-history-recovery', terminalRequestId, { attempts: 12, delayMs: 500 }).catch(error => {
        console.warn('[chat] incomplete final history recovery failed:', error)
      })
      return
    }
    if (_currentAiText) {
      _currentAiText = completeOpenClawVisibleReply(_currentAiText, activeFinalUserText)
    }
    let visibleFinalText = _currentAiText || finalText
    if (
      isOpenClawExecutionRequest(activeFinalUserText) &&
      isOpenClawExecutionPromiseOnlyReply(visibleFinalText) &&
      !(finalTools.length || _currentAiTools.length)
    ) {
      _currentAiText = buildOpenClawExecutionUnavailableReply(activeFinalUserText) || _currentAiText
      visibleFinalText = _currentAiText || visibleFinalText
    }
    const exactShortFinalText = normalizeOpenClawExactShortReply(activeFinalUserText, visibleFinalText)
    if (exactShortFinalText !== visibleFinalText) {
      _currentAiText = exactShortFinalText
      visibleFinalText = exactShortFinalText
    }
    let hasContent = hasOpenClawRenderableContent({
      text: visibleFinalText,
      images: _currentAiImages,
      videos: _currentAiVideos,
      audios: _currentAiAudios,
      files: _currentAiFiles,
      tools: finalTools.length ? finalTools : _currentAiTools,
      screenshotCards: finalScreenshotCards,
      confirmations: finalConfirmations,
    })
    if (visibleFinalText && isOpenClawTextClearlyIncomplete(visibleFinalText)) {
      keepOpenClawIncompleteFinalPending(visibleFinalText, terminalRequestId, stableStreamId)
      recoverOpenClawAssistantFromHistoryBeforeFallback('incomplete-visible-final-history-recovery', terminalRequestId, { attempts: 12, delayMs: 500 }).catch(error => {
        console.warn('[chat] incomplete visible final history recovery failed:', error)
      })
      return
    }
    if (!hasContent && shouldUseOpenClawEmptyReplyFallback(terminalRequestId)) {
      removeCurrentOpenClawStreamBubbleIfEmpty()
      recoverOpenClawAssistantFromHistoryBeforeFallback('history-visible-assistant-after-empty-final', terminalRequestId).then(recovered => {
        if (!recovered) _startResponseWatchdog()
      }).catch(error => {
        console.warn('[chat] empty final history recovery failed:', error)
        _startResponseWatchdog()
      })
      return
    }
    const assistantFingerprint = getAssistantFinalFingerprint(payload, finalText || _currentAiText, finalTools.length ? finalTools : _currentAiTools)
    const assistantDedupeKey = getOpenClawMessageDedupeKey({
      id: payload.message?.id,
      messageId: payload.messageId,
      eventId: payload.eventId,
      runId,
      sessionKey: payload.sessionKey || _sessionKey,
      state,
      role: 'assistant',
      text: finalText || _currentAiText,
      images: finalImages.length ? finalImages : _currentAiImages,
      videos: finalVideos.length ? finalVideos : _currentAiVideos,
      audios: finalAudios.length ? finalAudios : _currentAiAudios,
      files: finalFiles.length ? finalFiles : _currentAiFiles,
      tools: finalTools.length ? finalTools : _currentAiTools,
      screenshotCards: finalScreenshotCards,
      confirmations: finalConfirmations,
      timestamp: payload.timestamp || Date.now(),
    })
    if (!_currentAiBubble && assistantDedupeKey && hasRenderedOpenClawMessage(_sessionKey, assistantDedupeKey)) {
      console.log('[chat] skipped duplicate rendered assistant final:', assistantDedupeKey)
      clearOpenClawGenerationState('duplicate-rendered-final', terminalRequestId)
      return
    }
    if (!_currentAiBubble && isDuplicateRecentAssistantFinal(assistantFingerprint)) {
      console.log('[chat] skipped duplicate assistant final')
      clearOpenClawGenerationState('duplicate-assistant-final', terminalRequestId)
      return
    }
    // 忽略空 final（Gateway 会为一条消息触发多个 run，部分是空 final）
    if (_currentAiBubble && !hasContent && removeCurrentOpenClawStreamBubbleIfEmpty()) {
      clearOpenClawGenerationState('empty-final', terminalRequestId)
      resetStreamState()
      processMessageQueue()
      return
    }
    if (!_currentAiBubble && !hasContent) {
      clearOpenClawGenerationState('empty-final', terminalRequestId)
      return
    }
    // 标记 runId 为已处理，防止重复
    if (runId) {
      _seenRunIds.add(runId)
      if (_seenRunIds.size > 200) {
        const first = _seenRunIds.values().next().value
        _seenRunIds.delete(first)
      }
    }
    showTyping(false)
    // 如果流式阶段没有创建 bubble，从 final message 中提取
    if (!_currentAiBubble && hasContent) {
      _currentAiBubble = createStreamBubble({
        clientRequestId: stableStreamId,
        requestId: stableStreamId,
        dedupeKey: assistantDedupeKey,
        sessionKey: _sessionKey,
        openclawTurnId: _activeOpenClawRun?.openclawTurnId || '',
        assistantMessageId: _activeOpenClawRun?.assistantMessageId || '',
      })
      if (!_currentAiBubble) {
        clearOpenClawGenerationState('duplicate-final-bubble', terminalRequestId)
        resetStreamState()
        processMessageQueue()
        return
      }
      _currentAiBubbleRequestId = stableStreamId
      _currentAiText = _currentAiText || finalText
    } else if (_currentAiBubble && assistantDedupeKey) {
      if (!_currentAiBubbleRequestId) _currentAiBubbleRequestId = stableStreamId
      markRenderedOpenClawMessage(_currentAiBubble.closest('.msg'), _sessionKey, assistantDedupeKey)
    }
    if (_currentAiBubble) {
      if (_currentAiText && _currentAiText !== _lastRenderedAiText) {
        renderCompactAssistantContent(_currentAiText, _currentAiBubble, { phase: 'completed' })
        _lastRenderedAiText = _currentAiText
      }
      appendImagesToEl(_currentAiBubble, _currentAiImages)
      appendVideosToEl(_currentAiBubble, _currentAiVideos)
      appendAudiosToEl(_currentAiBubble, _currentAiAudios)
      appendOpenClawOutputFiles(_currentAiBubble, _currentAiFiles, _currentAiText)
      appendToolsToEl(_currentAiBubble, finalTools.length ? finalTools : _currentAiTools)
      collapseOpenClawRunTimeline(_currentAiBubble)
      appendLifeAssistantCardsToEl(_currentAiBubble, finalScreenshotCards, finalConfirmations)
    }
    // 添加时间戳 + 耗时 + token 消耗
    const wrapper = _currentAiBubble?.parentElement
    if (wrapper) {
      const meta = document.createElement('div')
      meta.className = 'msg-meta sc-msg-meta'
      let parts = [`<span class="msg-time">${formatTime(new Date())}</span>`]
      // 计算响应耗时
      let durStr = ''
      if (payload.durationMs) {
        durStr = (payload.durationMs / 1000).toFixed(1) + 's'
      } else if (_streamStartTime) {
        durStr = ((Date.now() - _streamStartTime) / 1000).toFixed(1) + 's'
      }
      if (durStr) parts.push(`<span class="meta-sep">·</span><span class="msg-duration">⏱ ${durStr}</span>`)
      // token 消耗（从 payload.usage 或 payload.message.usage 提取）
      const usage = payload.usage || payload.message?.usage || null
      if (usage) {
        const inp = usage.input_tokens || usage.prompt_tokens || 0
        const out = usage.output_tokens || usage.completion_tokens || 0
        const total = usage.total_tokens || (inp + out)
        if (total > 0) {
          let tokenStr = `${total} tokens`
          if (inp && out) tokenStr = `↑${inp} ↓${out}`
          parts.push(`<span class="meta-sep">·</span><span class="msg-tokens">${tokenStr}</span>`)
        }
      }
      parts.push(`<button class="msg-copy-btn" title="${t('common.copy')}">${svgIcon('copy', 12)}</button>`)
      meta.innerHTML = parts.join('')
      const group = _currentAiBubble?.closest('.sc-msg-group') || wrapper
      group.appendChild(meta)
    }
    if (_currentAiText || _currentAiImages.length) {
      rememberAssistantFinal(assistantFingerprint)
      saveMessage({
        id: payload.runId || uuid(), sessionKey: _sessionKey, role: 'assistant',
        content: _currentAiText, timestamp: Date.now(),
        attachments: _currentAiImages.map(i => ({ category: 'image', mimeType: i.mediaType || 'image/png', url: i.url, content: i.data })).filter(a => a.url || a.content)
      })
      returnOpenClawCollaborationResult({
        runId: payload.runId,
        content: _currentAiText || finalText,
        failed: getOpenClawToolResultInfo(finalTools.length ? finalTools : _currentAiTools, _currentAiText || finalText).failed,
        artifacts: _currentAiImages.map(image => ({
          type: 'image',
          path: image.url || '',
          text: image.alt || image.name || 'OpenClaw generated image',
          created_at: new Date().toISOString(),
        })).filter(item => item.path),
      })
    }
    // 托管 Agent：捕获 AI 回复，检测停止信号，决定是否继续
    if (shouldCaptureHostedTarget(payload)) {
      const capturedText = finalText || _currentAiText || ''
      if (capturedText) {
        appendHostedTarget(capturedText)
        if (detectStopFromText(capturedText)) {
          appendHostedOutput(t('chat.hostedAutoStopSignal'))
          stopHostedAgent()
        } else {
          maybeTriggerHostedRun()
        }
      }
    }
    clearOpenClawGenerationState(finalTools.length || _currentAiTools.length ? 'tool-result-completed' : 'final-completed', terminalRequestId)
    resetStreamState()
    _schedulePostFinalCheck()
    processMessageQueue()
    return
  }

  if (state === 'aborted') {
    const hasIncompleteDraft = _currentAiBubble && _currentAiText && isOpenClawIncompleteVisibleText(_currentAiText)
    showTyping(hasIncompleteDraft, hasIncompleteDraft ? t('chat.aiThinking') : undefined)
    clearGenerationTimeoutManager()
    if (_currentAiBubble && _currentAiText && !isOpenClawIncompleteVisibleText(_currentAiText)) {
      renderCompactAssistantContent(_currentAiText, _currentAiBubble, { phase: 'completed' })
      _lastRenderedAiText = _currentAiText
      clearOpenClawGenerationState('aborted-after-visible-content', terminalRequestId)
      resetStreamState()
      processMessageQueue()
      return
    }
    if (!_manualStopRequested) {
      removeCurrentOpenClawStreamBubbleIfEmpty()
      recoverOpenClawAssistantFromHistoryBeforeFallback('aborted-before-fallback', terminalRequestId, {
        attempts: hasIncompleteDraft ? 10 : 4,
        delayMs: hasIncompleteDraft ? 1000 : 900,
      }).then(recovered => {
        if (recovered) return
        const fallback = buildOpenClawToolUnavailableReply(_lastVisibleUserText) ||
          '\u8fd9\u6b21\u6ca1\u6709\u62ff\u5230\u5b8c\u6574\u7684\u53ef\u7528\u7ed3\u679c\uff0c\u6211\u4e0d\u4f1a\u628a\u5b83\u5047\u88c5\u6210\u5df2\u5b8c\u6210\u3002\u8bf7\u91cd\u8bd5\uff0c\u6216\u5148\u68c0\u67e5 OpenClaw Gateway \u548c\u76f8\u5173\u5de5\u5177\u662f\u5426\u53ef\u7528\u3002'
        appendAiMessage(fallback, new Date(), [], [], [], [], [], [], [], {
          dedupeKey: `openclaw-aborted-fallback-${terminalRequestId || Date.now()}`,
          sessionKey: _sessionKey,
        })
        clearOpenClawGenerationState('aborted-fallback', terminalRequestId)
        resetStreamState()
        processMessageQueue()
      }).catch(error => {
        console.warn('[chat] aborted history recovery failed:', error)
        const fallback = buildOpenClawToolUnavailableReply(_lastVisibleUserText) ||
          '\u8fd9\u6b21\u6ca1\u6709\u62ff\u5230\u5b8c\u6574\u7684\u53ef\u7528\u7ed3\u679c\uff0c\u6211\u4e0d\u4f1a\u628a\u5b83\u5047\u88c5\u6210\u5df2\u5b8c\u6210\u3002\u8bf7\u91cd\u8bd5\uff0c\u6216\u5148\u68c0\u67e5 OpenClaw Gateway \u548c\u76f8\u5173\u5de5\u5177\u662f\u5426\u53ef\u7528\u3002'
        appendAiMessage(fallback, new Date(), [], [], [], [], [], [], [], {
          dedupeKey: `openclaw-aborted-fallback-${terminalRequestId || Date.now()}`,
          sessionKey: _sessionKey,
        })
        clearOpenClawGenerationState('aborted-fallback', terminalRequestId)
        resetStreamState()
        processMessageQueue()
      })
      return
    }
    appendSystemMessage(t('chat.generationStopped'))
    clearOpenClawGenerationState('stopped', terminalRequestId)
    resetStreamState()
    processMessageQueue()
    return
  }

  if (state === 'error') {
    const errMsg = payload.errorMessage || payload.error?.message || t('common.error')

    if (shouldTreatOpenClawAbortAsRecoverable({
      error: errMsg,
      gatewayReady: isOpenClawRuntimeReadyForAbortRecovery(),
      wsReady: wsClient.connected || wsClient.gatewayReady,
      activeRun: isOpenClawGenerationActive(),
    })) {
      recoverOpenClawGenerationAfterTransientDisconnect('chat-error-abort-recovery', {
        notify: false,
        attempts: 10,
        delayMs: 900,
      }).catch(error => {
        console.warn('[chat] OpenClaw abort recovery failed:', error)
      })
      return
    }

    if (isOpenClawGatewayAbortErrorText(errMsg) || isOpenClawActiveRunErrorText(errMsg)) {
      recoverOpenClawGenerationAfterTransientDisconnect('chat-error-recovery', {
        notify: isOpenClawGatewayConnectivityError(errMsg),
        message: 'OpenClaw 连接中断，已恢复发送状态；如果回复没有完整显示，请重试或继续。',
      }).catch(error => {
        console.warn('[chat] OpenClaw chat error recovery failed:', error)
      })
      if (isOpenClawActiveRunErrorText(errMsg)) {
        appendSystemMessage('OpenClaw 已有任务正在执行，已阻止重复发送。请等待当前任务完成或稍后重试。')
      }
      return
    }

    // 连接级错误（origin/pairing/auth）拦截，不作为聊天消息显示
    if (/origin not allowed|NOT_PAIRED|PAIRING_REQUIRED|auth.*fail/i.test(errMsg)) {
      console.warn('[chat] 拦截连接级错误，不显示为聊天消息:', errMsg)
      const overlay = document.getElementById('chat-connect-overlay')
      if (overlay) overlay.style.display = 'flex'
      setOpenClawGatewayUiState('error', { error: t('chat.connectionRejected') })
      return
    }

    // 防抖：如果是相同错误且在 2 秒内，忽略（避免重复显示）
    const now = Date.now()
    if (_lastErrorMsg === errMsg && _errorTimer && (now - _errorTimer < 2000)) {
      console.warn('[chat] 忽略重复错误:', errMsg)
      return
    }
    _lastErrorMsg = errMsg
    _errorTimer = now

    const hasIncompleteDraft = _currentAiBubble && _currentAiText && isOpenClawIncompleteVisibleText(_currentAiText)
    if ((_isStreaming || _currentAiBubble) && !hasIncompleteDraft) {
      console.warn('[chat] streaming error after visible assistant content, keeping rendered reply:', errMsg)
      clearOpenClawGenerationState('error-after-visible-content', terminalRequestId)
      return
    }
    if (hasIncompleteDraft) {
      console.warn('[chat] streaming error while assistant draft is incomplete, waiting for history recovery:', errMsg)
      showTyping(true, t('chat.aiThinking'))
      clearGenerationTimeoutManager()
      recoverOpenClawAssistantFromHistoryBeforeFallback('error-before-fallback', terminalRequestId, {
        attempts: 10,
        delayMs: 1000,
      }).then(recovered => {
        if (recovered) return
        showTyping(false)
        appendSystemMessage(`${t('chat.errorPrefix')}${errMsg}`)
        resetStreamState()
        processMessageQueue()
      }).catch(error => {
        console.warn('[chat] error history recovery failed:', error)
        showTyping(false)
        appendSystemMessage(`${t('chat.errorPrefix')}${errMsg}`)
        resetStreamState()
        processMessageQueue()
      })
      return
    }

    showTyping(false)
    clearGenerationTimeoutManager()
    returnOpenClawCollaborationResult({
      runId: payload.runId,
      content: errMsg,
      failed: true,
    })
    appendSystemMessage(`${t('chat.errorPrefix')}${errMsg}`)
    resetStreamState()
    processMessageQueue()
    return
  }
}

/** 从 Gateway message 对象提取文本和所有媒体（参照 clawapp extractContent） */
function extractChatContent(message) {
  if (!message || typeof message !== 'object') return null
  const tools = []
  const screenshotCards = []
  const confirmations = []
  collectToolsFromMessage(message, tools)
  if (message.type === 'screenshot_card' || message.card?.type === 'screenshot_card') {
    const card = message.card || message
    if (card?.imageUrl) screenshotCards.push(card)
  }
  if (message.type === 'user_confirmation' || message.confirmation?.type === 'user_confirmation') {
    confirmations.push(message.confirmation || message)
  }
  if (message.role === 'tool' || message.role === 'toolResult') {
    const output = typeof message.content === 'string' ? message.content : null
    if (!tools.length) {
      tools.push({
        name: message.name || message.tool || message.tool_name || message.toolName || 'tool',
        input: message.input || message.args || message.parameters || null,
        output: output || message.output || message.result || null,
        status: message.status || 'ok',
      })
    } else if (output && !tools[0].output) {
      tools[0].output = output
    }
    return { text: '', images: [], videos: [], audios: [], files: [], tools, screenshotCards, confirmations }
  }
  const content = message.content
  if (typeof content === 'string') return { text: stripOpenClawRuntimePromptBlocks(stripThinkingTags(content)), images: [], videos: [], audios: [], files, tools, screenshotCards, confirmations }
  if (Array.isArray(content)) {
    const texts = [], images = [], videos = [], audios = [], files = []
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
      else if (block.type === 'screenshot_card') {
        const card = block.card || block
        if (card?.imageUrl) screenshotCards.push(card)
      }
      else if (block.type === 'user_confirmation') {
        confirmations.push(block.confirmation || block)
      }
      else if (block.type === 'image' && !block.omitted) {
        if (block.data) images.push({ mediaType: block.mimeType || 'image/png', data: block.data })
        else if (block.source?.type === 'base64' && block.source.data) images.push({ mediaType: block.source.media_type || 'image/png', data: block.source.data })
        else if (block.url || block.source?.url) images.push({ url: block.url || block.source.url, mediaType: block.mimeType || 'image/png' })
      }
      else if (block.type === 'image_url' && block.image_url?.url) images.push({ url: block.image_url.url, mediaType: 'image/png' })
      else if (block.type === 'video') {
        if (block.data) videos.push({ mediaType: block.mimeType || 'video/mp4', data: block.data })
        else if (block.url) videos.push({ url: block.url, mediaType: block.mimeType || 'video/mp4' })
      }
      else if (block.type === 'audio' || block.type === 'voice') {
        if (block.data) audios.push({ mediaType: block.mimeType || 'audio/mpeg', data: block.data, duration: block.duration })
        else if (block.url) audios.push({ url: block.url, mediaType: block.mimeType || 'audio/mpeg', duration: block.duration })
      }
      else if (block.type === 'file' || block.type === 'document') {
        files.push({ url: block.url || '', name: block.fileName || block.name || 'file', mimeType: block.mimeType || '', size: block.size, data: block.data })
      }
      else if (block.type === 'tool' || block.type === 'tool_use' || block.type === 'tool_call' || block.type === 'toolCall') {
        const callId = block.id || block.tool_call_id || block.toolCallId
        upsertTool(tools, {
          id: callId,
          name: block.name || block.tool || block.tool_name || block.toolName || 'tool',
          input: block.input || block.args || block.parameters || block.arguments || null,
          output: null,
          status: block.status || 'ok',
          time: resolveToolTime(callId, message.timestamp),
        })
      }
      else if (block.type === 'tool_result' || block.type === 'toolResult') {
        const resId = block.id || block.tool_call_id || block.toolCallId
        upsertTool(tools, {
          id: resId,
          name: block.name || block.tool || block.tool_name || block.toolName || 'tool',
          input: block.input || block.args || null,
          output: block.output || block.result || block.content || null,
          status: block.status || 'ok',
          time: resolveToolTime(resId, message.timestamp),
        })
      }
    }
    if (tools.length) {
      tools.forEach(t => {
        if (typeof t.input === 'string') t.input = stripAnsi(t.input)
        if (typeof t.output === 'string') t.output = stripAnsi(t.output)
      })
    }
    // 从 mediaUrl/mediaUrls 提取
    const mediaUrls = message.mediaUrls || (message.mediaUrl ? [message.mediaUrl] : [])
    for (const url of mediaUrls) {
      if (!url) continue
      if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(url)) videos.push({ url, mediaType: 'video/mp4' })
      else if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(url)) audios.push({ url, mediaType: 'audio/mpeg' })
      else if (/\.(jpe?g|png|gif|webp|heic|svg)(\?|$)/i.test(url)) images.push({ url, mediaType: 'image/png' })
      else files.push({ url, name: url.split('/').pop().split('?')[0] || 'file', mimeType: '' })
    }
    const text = texts.length ? stripOpenClawRuntimePromptBlocks(stripThinkingTags(texts.join('\n'))) : ''
    return { text, images, videos, audios, files, tools, screenshotCards, confirmations }
  }
  if (screenshotCards.length || confirmations.length) {
    return { text: '', images: [], videos: [], audios: [], files: [], tools: [], screenshotCards, confirmations }
  }
  if (typeof message.text === 'string') return { text: stripOpenClawRuntimePromptBlocks(stripThinkingTags(message.text)), images: [], videos: [], audios: [], files: [], tools: [], screenshotCards, confirmations }
  return null
}

function stripAnsi(text) {
  if (!text) return ''
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function stripThinkingTags(text) {
  const safe = stripAnsi(text)
  return safe
    .replace(/<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi, '')
    .replace(/Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi, '')
    .replace(/\[Queued messages while agent was busy\]\s*---\s*Queued #\d+\s*/gi, '')
    .trim()
}

function normalizeTime(raw) {
  if (!raw) return null
  if (raw instanceof Date) return raw.getTime()
  if (typeof raw === 'string') {
    const num = Number(raw)
    if (!Number.isNaN(num)) raw = num
    else {
      const parsed = Date.parse(raw)
      return Number.isNaN(parsed) ? null : parsed
    }
  }
  if (typeof raw === 'number' && raw < 1e12) return raw * 1000
  return raw
}

function resolveToolTime(toolId, messageTimestamp) {
  const eventTs = toolId ? _toolEventTimes.get(toolId) : null
  return normalizeTime(eventTs) || normalizeTime(messageTimestamp) || null
}

function getToolTime(tool) {
  const raw = tool?.end_time || tool?.endTime || tool?.timestamp || tool?.time || tool?.started_at || tool?.startedAt || null
  return normalizeTime(raw)
}

function safeStringify(value) {
  if (value == null) return ''
  const seen = new WeakSet()
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'bigint') return val.toString()
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]'
        seen.add(val)
      }
      return val
    }, 2)
  } catch {
    try { return String(value) } catch { return '' }
  }
}

function formatTime(date) {
  const now = new Date()
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  if (isToday) return `${h}:${m}`
  const mon = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${mon}-${day} ${h}:${m}`
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** 创建流式 AI 气泡 */
function createStreamBubble(meta = {}) {
  if (!_messagesEl || !_typingEl) return null
  const sessionKey = meta.sessionKey || _sessionKey || ''
  if (meta.dedupeKey && hasRenderedOpenClawMessage(sessionKey, meta.dedupeKey)) return null
  const requestId = String(meta.clientRequestId || meta.requestId || meta.idempotencyKey || meta.dedupeKey || '')
  showTyping(false)
  _lastRenderedAiText = ''
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-ai sc-msg-row assistant'
  if (requestId) wrap.dataset.requestId = requestId
  if (meta.openclawTurnId) wrap.dataset.openclawTurnId = meta.openclawTurnId
  if (meta.clientRequestId) wrap.dataset.clientRequestId = meta.clientRequestId
  if (meta.assistantMessageId) wrap.dataset.assistantMessageId = meta.assistantMessageId
  markRenderedOpenClawMessage(wrap, sessionKey, meta.dedupeKey)
  const group = document.createElement('div')
  group.className = 'sc-msg-group assistant'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble sc-msg-bubble assistant'
  bubble.dataset.compactKey = meta.dedupeKey || ''
  if (requestId) bubble.dataset.requestId = requestId
  if (meta.openclawTurnId) bubble.dataset.openclawTurnId = meta.openclawTurnId
  if (meta.clientRequestId) bubble.dataset.clientRequestId = meta.clientRequestId
  if (meta.assistantMessageId) bubble.dataset.assistantMessageId = meta.assistantMessageId
  setOpenClawAssistantRenderState(bubble, 'streaming', { compactAllowed: false, hasMarkdownTable: false })
  bubble.innerHTML = '<span class="stream-cursor"></span>'
  group.appendChild(createOpenClawRoleLine('assistant'))
  group.appendChild(bubble)
  wrap.appendChild(group)
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
  return bubble
}

function createOpenClawRoleLine(role = 'assistant') {
  const line = document.createElement('div')
  line.className = `openclaw-role-line ${role}`
  const badge = document.createElement('span')
  badge.className = `openclaw-role-badge ${role}`
  const iconName = role === 'tool' ? 'wrench' : 'terminal'
  const label = role === 'tool' ? 'Tool' : 'OpenClaw'
  badge.innerHTML = `<span class="openclaw-role-icon">${svgIcon(iconName, 13)}</span><span>${label}</span>`
  line.appendChild(badge)
  return line
}

function hasOpenClawMarkdownTable(text = '') {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let i = 0; i < lines.length - 1; i += 1) {
    const current = lines[i]
    const next = lines[i + 1]
    if (current.includes('|') && /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(next)) {
      return true
    }
  }
  return false
}

function getOpenClawAssistantContentText(node) {
  const root = node?.querySelector?.('[data-openclaw-assistant-content="true"]') || node
  return root?.innerText || root?.textContent || ''
}

function getOpenClawAssistantMarkdownSource(node) {
  const root = node?.querySelector?.('[data-openclaw-assistant-content="true"]') || node
  return root?.dataset?.openclawRawMarkdown || ''
}

function getOpenClawMessageCompactKey(container, rawText = '') {
  const bubble = container?.classList?.contains('msg-bubble') ? container : container?.closest?.('.msg-bubble')
  const wrap = container?.closest?.('.msg')
  const existing = container?.dataset?.compactKey || bubble?.dataset?.compactKey || wrap?.dataset?.openclawMessageKey || bubble?.dataset?.requestId || wrap?.dataset?.requestId || ''
  if (existing) return String(existing)
  const fallback = `openclaw-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (container?.dataset) container.dataset.compactKey = fallback
  if (bubble?.dataset) bubble.dataset.compactKey = fallback
  return fallback
}

function setOpenClawAssistantRenderState(container, state = 'completed', flags = {}) {
  const bubble = container?.classList?.contains('msg-bubble') ? container : container?.closest?.('.msg-bubble')
  const wrap = container?.closest?.('.msg')
  const group = container?.closest?.('.sc-msg-group')
  const targets = [bubble, wrap, group].filter(Boolean)
  for (const target of targets) {
    target.classList?.toggle('is-streaming', state === 'streaming')
    target.classList?.toggle('is-completed', state === 'completed')
    target.classList?.toggle('is-incomplete', state === 'incomplete')
    target.classList?.toggle('has-markdown-table', !!flags.hasMarkdownTable)
    if (target.dataset) {
      target.dataset.openclawMessageState = state
      target.dataset.openclawPending = state === 'streaming' ? 'true' : 'false'
      target.dataset.openclawStreaming = state === 'streaming' ? 'true' : 'false'
      target.dataset.openclawCompleted = state === 'completed' ? 'true' : 'false'
      target.dataset.openclawIncomplete = state === 'incomplete' ? 'true' : 'false'
      target.dataset.openclawCompactAllowed = flags.compactAllowed ? 'true' : 'false'
      target.dataset.openclawHasMarkdownTable = flags.hasMarkdownTable ? 'true' : 'false'
    }
  }
}

function renderCompactAssistantContent(rawText, container, options = {}) {
  if (!container) return
  // Reconciliation can repaint final text after a native tool run. Detach the
  // process card before clearing the text container, then keep it at the top.
  const retainedExecutionTimeline = container.querySelector?.('.openclaw-run-timeline') || null
  retainedExecutionTimeline?.remove()
  const visibleText = sanitizeOpenClawVisibleReply(rawText || '')
  const existingToolCard = container.closest?.('.msg-bubble')?.querySelector('.openclaw-tool-result-card')
  const shouldRenderToolCard = shouldRenderOpenClawToolResultCard([], rawText)
  if (!shouldRenderToolCard && !hasOpenClawRenderableContent({ visibleText })) return
  if (shouldRenderToolCard) {
    container.innerHTML = ''
    if (retainedExecutionTimeline) container.appendChild(retainedExecutionTimeline)
    else if (!existingToolCard) renderOpenClawToolResultCard(container, [], rawText)
    return
  }
  const phase = options.phase || 'completed'
  const isStreaming = phase === 'streaming'
  const isIncomplete = phase === 'incomplete'
  const hasMarkdownTable = hasOpenClawMarkdownTable(visibleText)
  const compact = compactChatMessage(visibleText)
  const compactKey = getOpenClawMessageCompactKey(container, visibleText)
  const canToggle = !isStreaming && !hasMarkdownTable && !!compact.collapsed
  const manualCollapsed = canToggle && isOpenClawManualCompactCollapsed(compactKey)
  const compactAllowed = canToggle
  if (!compact.preview && !compact.content) return
  container.innerHTML = ''

  const wrapper = document.createElement('div')
  wrapper.className = isStreaming ? 'assistant-stream-message' : 'assistant-compact-message'
  if (!isStreaming) wrapper.classList.add(canToggle && manualCollapsed ? 'is-collapsed' : 'is-expanded')

  const content = document.createElement('div')
  content.className = 'assistant-compact-message__content'
  content.dataset.openclawAssistantContent = 'true'
  content.dataset.openclawRawMarkdown = visibleText
  const normalizeOpenClawReadableRows = (text) => String(text || '')
    .replace(/\s+(?=(?:我能做什么|我的能力|主要能力|工作方式|底层模型|产品身份|需要我做什么)[：:])/g, '\n\n')
    .replace(/([。！？；;])\s*(?=(?:🌐|🖥️?|💻|📁|📂|🔍|🧠|⚙️|🛠️?|📌|✅|🔑|🧭|💡|🖼️?|📝))/g, '$1\n')
    .replace(/\s+(?=(?:🌐|🖥️?|💻|📁|📂|🔍|🧠|⚙️|🛠️?|📌|✅|🔑|🧭|💡|🖼️?|📝)\s*[\u4e00-\u9fffA-Za-z0-9][^：:\n]{0,18}[：:])/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const renderContent = (text) => {
    renderAgentMessageContentInto(content, {
      agent: 'openclaw',
      content: normalizeOpenClawReadableRows(text),
      details: compact.toolLines.join('\n'),
      markdown: true,
    })
  }
  renderContent(isStreaming ? visibleText : (manualCollapsed ? compact.preview : visibleText))
  if (compact.preview || compact.content) wrapper.appendChild(content)

  if (canToggle) {
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'assistant-compact-message__toggle'
    toggle.dataset.openclawControl = 'collapse-toggle'
    toggle.textContent = manualCollapsed ? '\u5c55\u5f00\u8be6\u60c5' : '\u6536\u8d77\u8be6\u60c5'
    toggle.addEventListener('click', () => {
      const expanded = wrapper.classList.toggle('is-expanded')
      wrapper.classList.toggle('is-collapsed', !expanded)
      setOpenClawManualCompactCollapsed(compactKey, !expanded)
      toggle.textContent = expanded ? '\u6536\u8d77\u8be6\u60c5' : '\u5c55\u5f00\u8be6\u60c5'
      renderContent(expanded ? visibleText : compact.preview)
    })
    wrapper.appendChild(toggle)
  }

  container.appendChild(wrapper)
  if (retainedExecutionTimeline) container.insertBefore(retainedExecutionTimeline, wrapper)
  const bubble = container.classList?.contains('msg-bubble') ? container : container.closest?.('.msg-bubble')
  container.classList?.toggle('has-markdown-table', hasMarkdownTable)
  bubble?.classList?.toggle('has-markdown-table', hasMarkdownTable)
  setOpenClawAssistantRenderState(container, isStreaming ? 'streaming' : (isIncomplete ? 'incomplete' : 'completed'), {
    compactAllowed,
    hasMarkdownTable,
  })
}

// ── 流式渲染（节流） ──

function keepOpenClawIncompleteFinalPending(visibleText = '', requestId = null, stableStreamId = '') {
  if (!visibleText) return false
  if (!_currentAiBubble) {
    _currentAiBubble = createStreamBubble({
      clientRequestId: stableStreamId || requestId || createOpenClawClientRequestId(),
      requestId: stableStreamId || requestId || '',
      sessionKey: _sessionKey,
    })
    if (!_currentAiBubble) return false
    _currentAiBubbleRequestId = stableStreamId || requestId || ''
  }
  _currentAiText = visibleText
  renderCompactAssistantContent(_currentAiText, _currentAiBubble, { phase: 'incomplete' })
  _lastRenderedAiText = _currentAiText
  const row = _currentAiBubble.closest?.('.msg')
  if (row?.dataset) delete row.dataset.openclawStreamingDraft
  _openClawPendingResponse = false
  _isSending = false
  _isStreaming = false
  _cancelResponseWatchdog()
  clearGenerationTimeoutManager()
  clearTimeout(_streamSafetyTimer)
  clearOpenClawTransientRecoveryTimer()
  if (requestId) releaseOpenClawRequestFingerprint(requestId)
  if (requestId) _inFlightRequestIds.delete(requestId)
  if (_activeClientRequestId === requestId) _activeClientRequestId = null
  _openClawActiveRequestClosed = true
  updateOpenClawActiveRun({
    clientRequestId: requestId || _activeOpenClawRun?.clientRequestId || '',
    assistantMessageId: _currentAiBubbleRequestId || stableStreamId || requestId || '',
    accumulatedText: _currentAiText,
    status: 'incomplete',
  })
  finishOpenClawActiveRun('incomplete', 'incomplete-final')
  showTyping(false)
  updateSendState()
  return true
}

function throttledRender() {
  if (_renderPending) return
  const now = performance.now()
  if (now - _lastRenderTime >= RENDER_THROTTLE) {
    doRender()
  } else {
    _renderPending = true
    requestAnimationFrame(() => { _renderPending = false; doRender() })
  }
}

function doRender() {
  _lastRenderTime = performance.now()
  const text = _currentAiText || ''
  if (!_currentAiBubble || !text || text === _lastRenderedAiText) return
  renderCompactAssistantContent(text, _currentAiBubble, { phase: 'streaming' })
  _lastRenderedAiText = text
  scrollToBottom()
}

// ── 响应看门狗：防止页面卡在等待状态 ──
const WATCHDOG_INTERVAL = 15000  // 15s 轮询间隔
const ULTIMATE_TIMEOUT = 180000  // 3 分钟长等待提示

function isOpenClawResponseIdleTimedOut(lastActivityAt, sendTimestamp, nowTimestamp = Date.now(), timeoutMs = OPENCLAW_ACTIVE_RUN_WATCHDOG_MS) {
  const activityAt = Number(lastActivityAt || sendTimestamp || nowTimestamp)
  return Number(nowTimestamp) - activityAt >= Number(timeoutMs)
}

function buildOpenClawRunTimeoutFallback(timeoutMs = OPENCLAW_RUN_TIMEOUT_MS) {
  const seconds = Math.max(1, Math.round(Number(timeoutMs || OPENCLAW_RUN_TIMEOUT_MS) / 1000))
  return `OpenClaw had no new output or execution progress for ${seconds}s. The run was finalized so it will not stay in processing forever. Please retry, or refresh the session to check whether a late result was saved.`
}

function finalizeOpenClawRunTimeoutState(reason = 'openclaw-run-timeout', requestId = null, options = {}) {
  const activeRequestId = requestId || _activeOpenClawRun?.clientRequestId || _activeClientRequestId || _currentAiBubbleRequestId || null
  if (activeRequestId && _activeClientRequestId && activeRequestId !== _activeClientRequestId) return false
  if (_openClawActiveRequestClosed && !_openClawPendingResponse && !_isSending && !_isStreaming) return false

  const message = options.message || buildOpenClawRunTimeoutFallback(options.timeoutMs || OPENCLAW_RUN_TIMEOUT_MS)
  const now = Date.now()
  const hasVisibleAssistant = activeRequestId ? hasOpenClawAssistantVisibleContentForRequest(activeRequestId) : false

  if (_currentAiBubble) {
    if (!_currentAiText) _currentAiText = message
    renderCompactAssistantContent(_currentAiText, _currentAiBubble, { phase: 'incomplete' })
    _lastRenderedAiText = _currentAiText
  } else if (!hasVisibleAssistant) {
    appendAiMessage(message, new Date(now), [], [], [], [], [], [], [], {
      dedupeKey: `openclaw-run-timeout-${activeRequestId || now}`,
      sessionKey: _sessionKey,
    })
  }

  if (_sessionKey && !hasVisibleAssistant) {
    saveMessage({
      id: `openclaw-run-timeout-${activeRequestId || now}`,
      sessionKey: _sessionKey,
      role: 'assistant',
      content: message,
      timestamp: now,
      createdAt: now,
      clientRequestId: activeRequestId || undefined,
      status: 'failed',
      error: {
        code: 'OPENCLAW_RUN_TIMEOUT',
        reason,
      },
    })
  }

  updateOpenClawActiveRun({
    clientRequestId: activeRequestId || '',
    assistantMessageId: _currentAiBubbleRequestId || `openclaw-run-timeout-${activeRequestId || now}`,
    accumulatedText: _currentAiText || message,
    status: 'failed',
    reason,
  })
  clearOpenClawGenerationState('openclaw-run-timeout-error', activeRequestId)
  processMessageQueue()
  return true
}

// === 卡死会话修复 ===
// 当 Agent 因 LLM API 错误（如 yyapi 403 余额不足）异常退出时，
// sessions.json 的 status 可能保持 "running" 不更新，导致前端无法发新消息。
// 此函数通过 HTTP 调用 dev-api.js 的 repair_stuck_sessions 端点修复 sessions.json，
// 并返回修复结果（包含错误信息）供前端展示给用户。
async function repairStuckOpenClawSessions() {
  // Tauri 桌面版：调用 Rust 端 repair_stuck_sessions 命令（打包版没有 dev-api）。
  // 浏览器调试模式：回退到 dev-api 的 HTTP 端点。
  if (isTauriRuntime()) {
    try {
      const result = await api.repairStuckSessions()
      return result || { repaired: [] }
    } catch {
      return { repaired: [] }
    }
  }
  try {
    const res = await fetch('/__api/repair_stuck_sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return { repaired: [] }
    const data = await res.json()
    return data || { repaired: [] }
  } catch {
    return { repaired: [] }
  }
}

// 将卡死会话的错误信息转换为用户可读的中文提示
function formatStuckSessionError(repairedInfo) {
  if (!repairedInfo?.error) return null
  const err = String(repairedInfo.error)
  // yyapi 余额不足
  if (/403|余额|扣费|额度|insufficient.*balance|quota/i.test(err)) {
    return 'AI 模型调用失败：账户余额不足，请充值后重试。'
  }
  // 429 限流
  if (/429|rate.*limit|too.*many.*request/i.test(err)) {
    return 'AI 模型调用失败：请求频率超限，请稍后重试。'
  }
  // API Key 问题
  if (/401|unauthorized|api.*key|invalid.*key/i.test(err)) {
    return 'AI 模型调用失败：API Key 无效或已过期，请检查模型配置。'
  }
  // 网络问题
  if (/timeout|econnrefused|enotfound|network|connect/i.test(err)) {
    return 'AI 模型调用失败：网络连接异常，请检查网络后重试。'
  }
  // 超时无响应
  if (repairedInfo.errorType === 'timeout') {
    return 'AI 回复超时，会话已自动恢复。请重新发送消息。'
  }
  // 其他错误
  return `AI 执行出错：${err.slice(0, 200)}`
}

async function settleOpenClawActiveRunFromWatchdog(reason = 'active-run-watchdog', expectedRequestId = null) {
  const requestId = expectedRequestId || _activeOpenClawRun?.clientRequestId || _activeClientRequestId || _currentAiBubbleRequestId || null
  if (expectedRequestId && expectedRequestId !== _activeClientRequestId) return false
  if (!_sessionKey || !_messagesEl) return false

  // 先尝试修复卡死的 sessions.json，并提取错误信息
  let stuckError = null
  try {
    const repairResult = await repairStuckOpenClawSessions()
    const repairedForCurrent = (repairResult?.repaired || []).find(
      r => normalizeOpenClawSessionKey(r.sessionKey) === normalizeOpenClawSessionKey(_sessionKey)
    )
    if (repairedForCurrent) {
      stuckError = formatStuckSessionError(repairedForCurrent)
      console.warn('[chat] 检测到卡死会话并已修复:', repairedForCurrent)
    }
  } catch (error) {
    console.debug('[chat] repair stuck sessions failed:', error?.message || error)
  }

  try {
    const recovered = await recoverOpenClawAssistantFromHistoryBeforeFallback(reason, requestId, {
      attempts: 2,
      delayMs: 500,
    })
    if (recovered) return true
  } catch (error) {
    console.warn('[chat] OpenClaw active run watchdog recovery failed:', error)
  }

  if (expectedRequestId && expectedRequestId !== _activeClientRequestId) return false

  if (reason === 'active-run-watchdog-timeout') {
    // 如果有卡死错误信息，优先展示
    if (stuckError) {
      if (_currentAiBubble) {
        _currentAiText = stuckError
        renderCompactAssistantContent(stuckError, _currentAiBubble, { phase: 'error' })
        _lastRenderedAiText = stuckError
      } else {
        appendAiMessage(stuckError, new Date(), [], [], [], [], [], [], [], {
          dedupeKey: `openclaw-stuck-error-${requestId || Date.now()}`,
          sessionKey: _sessionKey,
        })
      }
      _openClawPendingResponse = false
      _openClawActiveRequestClosed = true
      _isSending = false
      _isStreaming = false
      if (requestId) {
        _inFlightRequestIds.delete(requestId)
        releaseOpenClawRequestFingerprint(requestId)
      }
      _activeClientRequestId = null
      finishOpenClawActiveRun('failed', 'stuck-session-error')
      showTyping(false)
      clearOpenClawGenerationNotice()
      hideOpenClawGenerationActions()
      updateSendState()
      processMessageQueue()
      return true
    }
    return finalizeOpenClawRunTimeoutState('active-run-watchdog-timeout', requestId)
  }

  // 如果有卡死错误信息，优先展示错误而不是通用"未完成"提示
  if (stuckError) {
    if (_currentAiBubble) {
      _currentAiText = stuckError
      renderCompactAssistantContent(stuckError, _currentAiBubble, { phase: 'error' })
      _lastRenderedAiText = stuckError
    } else {
      appendAiMessage(stuckError, new Date(), [], [], [], [], [], [], [], {
        dedupeKey: `openclaw-stuck-error-${requestId || Date.now()}`,
        sessionKey: _sessionKey,
      })
    }
  } else if (_currentAiBubble && _currentAiText) {
    renderCompactAssistantContent(_currentAiText, _currentAiBubble, { phase: 'incomplete' })
    _lastRenderedAiText = _currentAiText
  } else if (_currentAiBubble) {
    const fallback = '这次回复没有完整结束。请重试，或刷新会话查看是否已生成结果。'
    _currentAiText = fallback
    renderCompactAssistantContent(fallback, _currentAiBubble, { phase: 'incomplete' })
    _lastRenderedAiText = fallback
  } else {
    appendAiMessage('这次回复没有完整结束。请重试，或刷新会话查看是否已生成结果。', new Date(), [], [], [], [], [], [], [], {
      dedupeKey: `openclaw-watchdog-incomplete-${requestId || Date.now()}`,
      sessionKey: _sessionKey,
    })
  }

  _openClawPendingResponse = false
  _openClawActiveRequestClosed = true
  _isSending = false
  _isStreaming = false
  if (requestId) {
    _inFlightRequestIds.delete(requestId)
    releaseOpenClawRequestFingerprint(requestId)
  }
  _activeClientRequestId = null
  finishOpenClawActiveRun(_currentAiText ? 'incomplete' : 'failed', reason)
  recoverOpenClawAssistantFromHistoryBeforeFallback('post-incomplete-fallback-history-recovery', requestId, {
    attempts: 12,
    delayMs: 500,
  }).catch(error => {
    console.warn('[chat] post incomplete fallback history recovery failed:', error)
  })
  showTyping(false)
  clearOpenClawGenerationNotice()
  hideOpenClawGenerationActions()
  updateSendState()
  processMessageQueue()
  return true
}

function _startResponseWatchdog() {
  // 只清除轮询定时器，不清除等待提示定时器（持续到收到响应或用户手动停止）
  clearTimeout(_responseWatchdog)
  _responseWatchdog = null
  _sendTimestamp = _sendTimestamp || Date.now()
  _lastResponseActivityAt = _lastResponseActivityAt || _sendTimestamp
  const requestId = _activeClientRequestId

  // 首轮长时间无 chat 回复时只提示，不自动结束
  if (!_ultimateTimer) {
    _ultimateTimer = setTimeout(() => {
      _ultimateTimer = null
      if (!requestId || requestId !== _activeClientRequestId) return
      if (_sessionKey && _pageActive) {
        console.warn('[chat] 长时间无 chat 回复，显示可恢复等待提示')
        const message = '回复等待时间较长，可能仍在生成。你可以继续等待，或手动停止后重试。'
        if (maybeShowOpenClawLongResponseWarning(message, requestId, { actions: true })) {
          _startResponseWatchdog()
        }
      }
    }, ULTIMATE_TIMEOUT)
  }

  _responseWatchdog = setTimeout(async () => {
    _responseWatchdog = null
    if (!requestId || requestId !== _activeClientRequestId) return
    // 如果还在等待（未开始流式），强制刷新历史
    if (!_openClawActiveRequestClosed && (_openClawPendingResponse || _isSending || _isStreaming) && _sessionKey && _messagesEl && _pageActive) {
      const idleDuration = Date.now() - (_lastResponseActivityAt || _sendTimestamp)
      if (hasOpenClawAssistantVisibleContentForRequest(requestId) && idleDuration < OPENCLAW_ACTIVE_RUN_WATCHDOG_MS) {
        markGenerationProgress()
        _startResponseWatchdog()
        return
      }
      const elapsed = Math.round((Date.now() - _sendTimestamp) / 1000)
      const idleElapsed = Math.round((Date.now() - (_lastResponseActivityAt || _sendTimestamp)) / 1000)
      console.log(`[chat] OpenClaw watchdog: total=${elapsed}s idle=${idleElapsed}s`)
      if (isOpenClawResponseIdleTimedOut(_lastResponseActivityAt, _sendTimestamp)) {
        await settleOpenClawActiveRunFromWatchdog('active-run-watchdog-timeout', requestId)
        return
      }
      const oldHash = _lastHistoryHash
      _lastHistoryHash = ''
      await loadHistory()
      if (requestId !== _activeClientRequestId) return
      // 如果历史有更新，关闭 typing 指示器
      if (_lastHistoryHash && _lastHistoryHash !== oldHash) {
        if (hasOpenClawAssistantVisibleContentForRequest(requestId)) {
          markGenerationProgress()
          _startResponseWatchdog()
        } else {
          showTyping(true, t('chat.aiThinking'))
          _startResponseWatchdog()
        }
      } else {
        // 历史没更新，更新 typing 提示显示已等待时间
        if (elapsed >= 30) {
          maybeShowOpenClawLongResponseWarning(`${t('chat.stillWaiting')} (${t('chat.elapsedTime', { seconds: elapsed })})`, requestId)
        }
        // 继续等待，再设一轮看门狗
        _startResponseWatchdog()
      }
    }
  }, WATCHDOG_INTERVAL)
}

function _resetWatchdogOnActivity() {
  if (!_activeClientRequestId || _openClawActiveRequestClosed) return
  _lastResponseActivityAt = Date.now()
  clearTimeout(_responseWatchdog)
  _responseWatchdog = null
  _startResponseWatchdog()
}

// Gateway progress frames are not guaranteed to reach every WebView build.
// While a run is active, consult the authoritative local history separately
// from the response watchdog so heartbeat events cannot postpone UI progress.
function stopOpenClawProgressHistoryPolling() {
  if (_openClawProgressHistoryTimer) clearInterval(_openClawProgressHistoryTimer)
  _openClawProgressHistoryTimer = null
  _openClawProgressHistoryInFlight = false
}

function startOpenClawProgressHistoryPolling() {
  if (_openClawProgressHistoryTimer) return
  const refresh = async () => {
    if (!_activeOpenClawRun || _openClawActiveRequestClosed || !_sessionKey || !_messagesEl || !_pageActive) {
      stopOpenClawProgressHistoryPolling()
      return
    }
    if (_openClawProgressHistoryInFlight || _isLoadingHistory) return
    _openClawProgressHistoryInFlight = true
    try {
      // In packaged Tauri, JSONL plus the portable session registry is the
      // native source of truth. Some completed tool-only runs do not emit a
      // final assistant frame back to this WebView, so check it before the
      // Gateway projection keeps the typing state alive indefinitely.
      if (isTauriRuntime()) {
        try {
          const raw = await api.readOpenclawRawHistory(_sessionKey, 300)
          const rawMessages = raw?.messages || []
          if (hydrateOpenClawLiveHistoryProgress(rawMessages)) _resetWatchdogOnActivity()
          if (completeOpenClawCurrentDraftFromLatestHistory(rawMessages)) {
            stopOpenClawProgressHistoryPolling()
            processMessageQueue()
            return
          }
          if (completeOpenClawTerminalToolOnlyRun(raw)) {
            stopOpenClawProgressHistoryPolling()
            processMessageQueue()
            return
          }
          // 卡死会话检测：如果 sessionStatus 仍为 "running" 但已超过 5 分钟无活动，
          // 说明 Agent 可能已崩溃（如 yyapi 余额不足），主动触发修复并结束等待状态
          if (raw?.sessionStatus === 'running' && !isOpenClawNativeSessionTerminal(raw?.sessionStatus)) {
            const startedAt = _sendTimestamp || (_activeOpenClawRun?.startedAt) || 0
            const idleMs = Date.now() - (_lastResponseActivityAt || startedAt || Date.now())
            if (idleMs > OPENCLAW_ACTIVE_RUN_WATCHDOG_MS) {
              console.warn(`[chat] 检测到卡死会话 (idle=${Math.round(idleMs / 1000)}s)，触发修复`)
              const repairResult = await repairStuckOpenClawSessions()
              const repairedForCurrent = (repairResult?.repaired || []).find(
                r => normalizeOpenClawSessionKey(r.sessionKey) === normalizeOpenClawSessionKey(_sessionKey)
              )
              if (repairedForCurrent) {
                const errorMsg = formatStuckSessionError(repairedForCurrent) || '会话已自动恢复，请重新发送消息。'
                stopOpenClawProgressHistoryPolling()
                if (_currentAiBubble) {
                  _currentAiText = errorMsg
                  renderCompactAssistantContent(errorMsg, _currentAiBubble, { phase: 'error' })
                  _lastRenderedAiText = errorMsg
                } else {
                  appendAiMessage(errorMsg, new Date(), [], [], [], [], [], [], [], {
                    dedupeKey: `openclaw-stuck-error-${_activeClientRequestId || Date.now()}`,
                    sessionKey: _sessionKey,
                  })
                }
                clearOpenClawGenerationState('stuck-session-detected', _activeClientRequestId)
                showTyping(false)
                clearOpenClawGenerationNotice()
                hideOpenClawGenerationActions()
                updateSendState()
                processMessageQueue()
                return
              }
            }
          }
        } catch (error) {
          console.debug('[chat] OpenClaw portable raw completion check skipped:', error?.message || error)
        }
      }
      // Tauri reads the authoritative local JSONL above and must not depend
      // on a transient WebSocket-ready flag. The Gateway can finish a native
      // task while its UI socket is reconnecting; skipping the raw read here
      // leaves a completed terminal reply stuck in "thinking" until timeout.
      if (!wsClient.gatewayReady) return
      const history = await wsClient.chatHistory(_sessionKey, 200)
      const messages = history?.messages || []
      if (hydrateOpenClawLiveHistoryProgress(messages)) _resetWatchdogOnActivity()
      // This deliberately bypasses the normal cache/merge fast-path. During
      // an active task we need the latest native tool records immediately.
      if (completeOpenClawCurrentDraftFromLatestHistory(messages)) {
        stopOpenClawProgressHistoryPolling()
        processMessageQueue()
        return
      }
      mergeHistoryIntoCurrentMessages(messages)
    } catch (error) {
      console.debug('[chat] OpenClaw progress history refresh skipped:', error?.message || error)
    } finally {
      _openClawProgressHistoryInFlight = false
    }
  }
  _openClawProgressHistoryTimer = setInterval(refresh, 2500)
  refresh()
}

function isOpenClawNativeSessionTerminal(status) {
  return /^(?:done|completed|error|failed|aborted|cancelled)$/i.test(String(status || '').trim())
}

function completeOpenClawTerminalToolOnlyRun(rawHistory = {}) {
  if (!isOpenClawNativeSessionTerminal(rawHistory?.sessionStatus)) return false
  if (!(_activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming)) return false

  const messages = dedupeHistoryStable(attachOpenClawExecutionTimeline(rawHistory?.messages || []))
  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user' && openClawVisibleUserText(messages[index]?.text || '')) {
      latestUserIndex = index
      break
    }
  }
  if (latestUserIndex < 0) return false
  const latestUserText = openClawVisibleUserText(messages[latestUserIndex]?.text || '')
  const activeUserText = _activeOpenClawRun?.userText || _activeOpenClawUserText || _lastVisibleUserText
  if (!latestUserText || normalizeOpenClawPromptFingerprint(latestUserText) !== normalizeOpenClawPromptFingerprint(activeUserText)) return false

  const afterUser = messages.slice(latestUserIndex + 1).filter(message => message?.role === 'assistant')
  if (!afterUser.length) return false
  const terminal = afterUser[afterUser.length - 1]
  const terminalText = sanitizeOpenClawVisibleReply(terminal.text || '')
  // A real final reply must stay on the normal completion path. This fallback
  // is only for native runs whose durable terminal record is a tool result.
  if (terminalText && !isOpenClawToolOnlySummaryText(terminalText)) return false
  const terminalTools = terminal.tools || []
  if (!terminalTools.length) return false

  const requestId = _activeClientRequestId || _activeOpenClawRun?.clientRequestId || ''
  if (!_currentAiBubble) {
    _currentAiBubble = createStreamBubble({
      clientRequestId: requestId || terminal.runId || terminal.id || 'openclaw-terminal-tool-only',
      requestId: requestId || terminal.runId || terminal.id || 'openclaw-terminal-tool-only',
      sessionKey: _sessionKey,
      openclawTurnId: _activeOpenClawRun?.openclawTurnId || '',
      assistantMessageId: terminal.id || terminal.messageId || requestId,
      dedupeKey: terminal.displayDedupeKey || terminal.dedupeKey || terminal.id || terminal.messageId || requestId,
    })
    if (!_currentAiBubble) return false
  }
  _currentAiTools = terminalTools
  _currentAiTimeline = mergeOpenClawExecutionTimelines(_currentAiTimeline, terminal.executionTimeline)
  _currentAiText = buildToolOnlyAssistantReply(terminalTools)
  renderCompactAssistantContent(_currentAiText, _currentAiBubble, { phase: 'completed' })
  appendToolsToEl(_currentAiBubble, terminalTools, _currentAiTimeline)
  collapseOpenClawRunTimeline(_currentAiBubble)
  clearOpenClawGenerationState('native-terminal-tool-only', requestId)
  resetStreamState()
  return true
}

function _cancelResponseWatchdog() {
  clearTimeout(_responseWatchdog)
  _responseWatchdog = null
  _cancelUltimateTimer()
}

function _cancelUltimateTimer() {
  clearTimeout(_ultimateTimer)
  _ultimateTimer = null
}

function _schedulePostFinalCheck() {
  clearTimeout(_postFinalCheck)
  _postFinalCheck = setTimeout(async () => {
    _postFinalCheck = null
    if (_sessionKey && _messagesEl && _pageActive && !_isStreaming && !_isSending) {
      _lastHistoryHash = ''
      await loadHistory()
    }
  }, 2000)
}

// ensureAiBubble 已被 createStreamBubble 替代

function resetStreamState() {
  _cancelResponseWatchdog()
  stopOpenClawProgressHistoryPolling()
  clearGenerationTimeoutManager()
  clearTimeout(_streamSafetyTimer)
  clearOpenClawTransientRecoveryTimer()
  clearInterval(_typingElapsedInterval)
  _typingElapsedInterval = null
  const preserveIncompleteDraft = _currentAiBubble && _currentAiText && isOpenClawTextClearlyIncomplete(_currentAiText)
  const incompleteDraftRequestId = preserveIncompleteDraft ? (_activeClientRequestId || _currentAiBubbleRequestId || '') : ''
  if (_currentAiBubble && (_currentAiText || _currentAiImages.length || _currentAiVideos.length || _currentAiAudios.length || _currentAiFiles.length || _currentAiTools.length)) {
    renderCompactAssistantContent(_currentAiText, _currentAiBubble, { phase: preserveIncompleteDraft ? 'incomplete' : 'completed' })
    _lastRenderedAiText = _currentAiText
    appendImagesToEl(_currentAiBubble, _currentAiImages)
    appendVideosToEl(_currentAiBubble, _currentAiVideos)
    appendAudiosToEl(_currentAiBubble, _currentAiAudios)
    appendOpenClawOutputFiles(_currentAiBubble, _currentAiFiles, _currentAiText)
  appendToolsToEl(_currentAiBubble, _currentAiTools)
    collapseOpenClawRunTimeline(_currentAiBubble)
  }
  releaseOpenClawRequestFingerprint()
  _renderPending = false
  _lastRenderTime = 0
  _lastRenderedAiText = ''
  if (!preserveIncompleteDraft) {
    _currentAiBubble = null
    _currentAiBubbleRequestId = ''
    _currentAiText = ''
    _currentAiStreamRawText = ''
    _currentAiImages = []
    _currentAiVideos = []
    _currentAiAudios = []
    _currentAiFiles = []
    _currentAiTools = []
    _currentAiTimeline = []
  }
  if (_activeClientRequestId) _inFlightRequestIds.delete(_activeClientRequestId)
  _activeClientRequestId = null
  _activeOpenClawUserText = ''
  finishOpenClawActiveRun(preserveIncompleteDraft ? 'incomplete' : 'completed', preserveIncompleteDraft ? 'reset-preserve-incomplete' : 'reset')
  _openClawPendingResponse = false
  _openClawActiveRequestClosed = true
  if (!preserveIncompleteDraft) _currentRunId = null
  _isStreaming = false
  _streamStartTime = 0
  _lastErrorMsg = null
  _errorTimer = null
  _sendTimestamp = 0
  _lastResponseActivityAt = 0
  showTyping(false)
  updateSendState()
  if (preserveIncompleteDraft) {
    recoverOpenClawAssistantFromHistoryBeforeFallback('reset-incomplete-history-recovery', incompleteDraftRequestId || null, { attempts: 12, delayMs: 500 }).catch(error => {
      console.warn('[chat] reset incomplete history recovery failed:', error)
    })
  }
}

// ── 历史消息加载 ──

function pruneOpenClawChatViewSnapshots() {
  const now = Date.now()
  for (const [key, snapshot] of _chatViewSnapshotsBySession) {
    if (snapshot?.schemaVersion !== OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION || !snapshot?.timestamp || now - snapshot.timestamp > OPENCLAW_CHAT_VIEW_SNAPSHOT_TTL_MS) {
      _chatViewSnapshotsBySession.delete(key)
    }
  }
  pruneStoredOpenClawChatViewSnapshots(now)
}

function readStoredOpenClawChatViewSnapshots() {
  try {
    const raw = sessionStorage.getItem(OPENCLAW_CHAT_VIEW_SNAPSHOT_STORAGE_KEY)
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStoredOpenClawChatViewSnapshots(snapshots) {
  try {
    sessionStorage.setItem(OPENCLAW_CHAT_VIEW_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots || {}))
  } catch {}
}

function pruneStoredOpenClawChatViewSnapshots(now = Date.now()) {
  const snapshots = readStoredOpenClawChatViewSnapshots()
  let changed = false
  for (const [key, snapshot] of Object.entries(snapshots)) {
    if (snapshot?.schemaVersion !== OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION || !snapshot?.timestamp || now - snapshot.timestamp > OPENCLAW_CHAT_VIEW_SNAPSHOT_TTL_MS) {
      delete snapshots[key]
      changed = true
    }
  }
  if (changed) writeStoredOpenClawChatViewSnapshots(snapshots)
}

function openClawSnapshotHasRenderableMessages(snapshot = {}) {
  return !!(
    snapshot?.html ||
    (Array.isArray(snapshot?.messages) && snapshot.messages.length)
  )
}

function persistOpenClawChatViewSnapshot(snapshot) {
  if (!snapshot?.sessionKey || !openClawSnapshotHasRenderableMessages(snapshot)) return
  const serialized = JSON.stringify(snapshot)
  if (serialized.length > OPENCLAW_CHAT_VIEW_SNAPSHOT_STORAGE_LIMIT) return
  const snapshots = readStoredOpenClawChatViewSnapshots()
  snapshots[snapshot.sessionKey] = snapshot
  writeStoredOpenClawChatViewSnapshots(snapshots)
}

function getOpenClawChatViewSnapshot(sessionKey) {
  const key = sessionKey || ''
  if (!key) return null
  const memorySnapshot = _chatViewSnapshotsBySession.get(key)
  if (openClawSnapshotHasRenderableMessages(memorySnapshot) && memorySnapshot.schemaVersion === OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION) return memorySnapshot
  const storedSnapshot = readStoredOpenClawChatViewSnapshots()[key]
  if (!openClawSnapshotHasRenderableMessages(storedSnapshot)) return null
  if (storedSnapshot.schemaVersion !== OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION || !storedSnapshot.timestamp || Date.now() - storedSnapshot.timestamp > OPENCLAW_CHAT_VIEW_SNAPSHOT_TTL_MS) {
    pruneStoredOpenClawChatViewSnapshots()
    return null
  }
  _chatViewSnapshotsBySession.set(key, storedSnapshot)
  return storedSnapshot
}

function stripOpenClawSnapshotHtml(value = '') {
  const holder = document.createElement('div')
  holder.innerHTML = String(value || '')
  holder.querySelectorAll('script, style, template, noscript').forEach(node => node.remove())
  return extractOpenClawSnapshotTextFromNode(holder)
}

function openClawCellText(node) {
  return String(node?.innerText || node?.textContent || '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

function openClawTableToMarkdown(table) {
  const rows = Array.from(table?.querySelectorAll?.('tr') || [])
    .map(row => Array.from(row.querySelectorAll('th,td')).map(openClawCellText))
    .filter(cells => cells.length)
  if (!rows.length) return ''
  const width = Math.max(...rows.map(row => row.length))
  const normalizeRow = row => {
    const cells = [...row]
    while (cells.length < width) cells.push('')
    return `| ${cells.join(' | ')} |`
  }
  const separator = `| ${Array.from({ length: width }).map(() => '---').join(' | ')} |`
  return [normalizeRow(rows[0]), separator, ...rows.slice(1).map(normalizeRow)].join('\n')
}

function extractOpenClawSnapshotTextFromNode(node) {
  if (!node) return ''
  const holder = node.cloneNode(true)
  holder.querySelectorAll('script, style, template, noscript, .assistant-compact-message__toggle, [data-openclaw-control], .msg-meta, .sc-msg-meta').forEach(el => el.remove())
  holder.querySelectorAll('table').forEach(table => {
    const markdown = openClawTableToMarkdown(table)
    table.replaceWith(document.createTextNode(markdown ? `\n${markdown}\n` : '\n'))
  })
  holder.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')))
  holder.querySelectorAll('p, div, section, article, header, footer, h1, h2, h3, h4, h5, h6, blockquote, pre, ul, ol, li').forEach(el => {
    el.insertBefore(document.createTextNode('\n'), el.firstChild)
    el.appendChild(document.createTextNode('\n'))
  })
  return String(holder.textContent || '')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sanitizeRestoredOpenClawAssistantText(bubble) {
  if (!bubble) return ''
  const rawText = getOpenClawAssistantContentText(bubble) || stripOpenClawSnapshotHtml(bubble.innerHTML || '')
  if (!rawText || isOpenClawVisibleTextInternalAuditOnly(rawText)) return ''
  const cleanText = sanitizeOpenClawVisibleReply(rawText)
  if (!cleanText || isOpenClawVisibleTextInternalAuditOnly(cleanText)) return ''
  if (isOpenClawTextClearlyIncomplete(cleanText)) return ''
  return cleanText
}

function collectOpenClawVisibleMessagesForSnapshot() {
  if (!_messagesEl) return []
  const rows = Array.from(_messagesEl.querySelectorAll('.msg-user, .msg-ai'))
  const messages = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const bubble = row.querySelector('.msg-bubble')
    if (!bubble) continue
    const isAssistant = row.classList?.contains('msg-ai')
    const isUser = row.classList?.contains('msg-user')
    if (!isAssistant && !isUser) continue
    const rawText = isAssistant
      ? (getOpenClawAssistantMarkdownSource(bubble) || extractOpenClawSnapshotTextFromNode(bubble.querySelector('[data-openclaw-assistant-content="true"]') || bubble))
      : openClawVisibleUserText(extractOpenClawSnapshotTextFromNode(bubble))
    const text = isAssistant ? sanitizeOpenClawVisibleReply(rawText) : openClawVisibleUserText(rawText)
    if (!text) continue
    if (isAssistant && (isOpenClawVisibleTextInternalAuditOnly(text) || isOpenClawTextClearlyIncomplete(text))) continue
    const executionTimeline = isAssistant
      ? collectOpenClawExecutionTimelineFromBubble(bubble)
      : []
    messages.push({
      role: isAssistant ? 'assistant' : 'user',
      text,
      content: text,
      sessionKey: row.dataset?.openclawSessionKey || _sessionKey,
      openclawTurnId: row.dataset?.openclawTurnId || '',
      clientRequestId: row.dataset?.clientRequestId || '',
      assistantMessageId: row.dataset?.assistantMessageId || '',
      timestamp: Number(row.dataset?.openclawTimestamp || 0) || Date.now() + index,
      orderIndex: index,
      displayDedupeKey: row.dataset?.openclawDisplayDedupeKey || row.dataset?.openclawMessageKey || '',
      dedupeKey: row.dataset?.openclawMessageKey || '',
      executionTimeline,
      renderMode: isAssistant ? 'markdown' : 'text',
      contentFormat: isAssistant ? 'markdown' : 'text',
    })
  }
  return collapseConsecutiveOpenClawAssistantDuplicates(messages)
}

function collectOpenClawExecutionTimelineFromBubble(bubble) {
  if (!bubble) return []
  return Array.from(bubble.querySelectorAll('.openclaw-run-timeline__step'))
    .map((step, index) => {
      const label = String(step.textContent || '').replace(/\s+/g, ' ').trim()
      if (!label) return null
      return {
        key: `snapshot:${index}:${label.slice(0, 120)}`,
        kind: /tool|\u5de5\u5177/i.test(label) ? 'tool' : 'progress',
        label: label.slice(0, 600),
        status: step.classList.contains('is-error') ? 'error' : (step.classList.contains('is-running') ? 'running' : 'completed'),
      }
    })
    .filter(Boolean)
}

function normalizeOpenClawSnapshotMessage(raw = {}, index = 0) {
  const role = raw.role === 'assistant' ? 'assistant' : (raw.role === 'user' ? 'user' : '')
  if (!role) return null
  const rawText = raw.text || raw.content || raw.markdownText || stripOpenClawSnapshotHtml(raw.renderedHtml || raw.html || '')
  const text = role === 'assistant' ? sanitizeOpenClawVisibleReply(rawText) : openClawVisibleUserText(rawText)
  if (!text) return null
  if (role === 'assistant' && (isOpenClawVisibleTextInternalAuditOnly(text) || isOpenClawTextClearlyIncomplete(text))) return null
  const msg = {
    ...raw,
    role,
    text,
    content: text,
    rawText: text,
    markdownText: role === 'assistant' ? text : '',
    renderedHtml: '',
    html: '',
    sessionKey: raw.sessionKey || _sessionKey,
    timestamp: raw.timestamp || raw.createdAt || raw.created_at || Date.now() + index,
    orderIndex: Number.isFinite(raw.orderIndex) ? raw.orderIndex : index,
    renderMode: role === 'assistant' ? 'markdown' : 'text',
    contentFormat: role === 'assistant' ? 'markdown' : 'text',
    _openClawOriginalIndex: index,
  }
  msg.dedupeKey = msg.dedupeKey || getOpenClawMessageDedupeKey(msg)
  msg.displayDedupeKey = msg.displayDedupeKey || getOpenClawHistoryDisplayDedupeKey(msg)
  return msg
}

function collapseConsecutiveOpenClawAssistantDuplicates(messages = []) {
  const result = []
  for (const raw of messages || []) {
    if (!raw) continue
    const current = { ...raw }
    const previous = result[result.length - 1]
    if (previous?.role === 'assistant' && current.role === 'assistant') {
      const prevText = normalizeOpenClawAssistantTextForDedupe(previous.text || previous.content || '')
      const nextText = normalizeOpenClawAssistantTextForDedupe(current.text || current.content || '')
      const sameTurn = isSameOpenClawAssistantTurn(previous, current)
      const sameText = prevText && nextText && prevText === nextText
      const partial = isOpenClawPartialAssistantText(previous.text || previous.content || '', current.text || current.content || '') ||
        isOpenClawPartialAssistantText(current.text || current.content || '', previous.text || previous.content || '')
      if (sameTurn || sameText || partial) {
        result[result.length - 1] = mergeOpenClawAssistantMessage(previous, current)
        continue
      }
    }
    result.push(current)
  }
  return result
}

function normalizeOpenClawMessagesForRestore(messages = []) {
  return collapseConsecutiveOpenClawAssistantDuplicates(
    (messages || [])
      .map((msg, index) => normalizeOpenClawSnapshotMessage(msg, index))
      .filter(Boolean),
  )
}

function openClawSnapshotHtmlToMessages(html = '') {
  const holder = document.createElement('div')
  holder.innerHTML = String(html || '')
  return Array.from(holder.querySelectorAll('.msg-user, .msg-ai')).map((row, index) => {
    const bubble = row.querySelector('.msg-bubble')
    if (!bubble) return null
    const role = row.classList?.contains('msg-ai') ? 'assistant' : 'user'
    const text = role === 'assistant'
      ? (getOpenClawAssistantMarkdownSource(bubble) || extractOpenClawSnapshotTextFromNode(bubble.querySelector('[data-openclaw-assistant-content="true"]') || bubble))
      : extractOpenClawSnapshotTextFromNode(bubble)
    return {
      role,
      text,
      content: text,
      sessionKey: row.dataset?.openclawSessionKey || _sessionKey,
      openclawTurnId: row.dataset?.openclawTurnId || '',
      clientRequestId: row.dataset?.clientRequestId || '',
      assistantMessageId: row.dataset?.assistantMessageId || '',
      timestamp: Number(row.dataset?.openclawTimestamp || 0) || Date.now() + index,
      orderIndex: index,
      displayDedupeKey: row.dataset?.openclawDisplayDedupeKey || row.dataset?.openclawMessageKey || '',
      dedupeKey: row.dataset?.openclawMessageKey || '',
    }
  }).filter(Boolean)
}

function snapshotCurrentChatState(reason = '') {
  if (!_sessionKey || !_messagesEl) return false
  pruneOpenClawChatViewSnapshots()
  const hasVisibleMessages = !!_messagesEl.querySelector('.msg-user, .msg-ai')
  const hasDraft = !!(_currentAiText || _currentAiBubble || _isStreaming || _isSending || _messageQueue.length)
  if (!hasVisibleMessages && !hasDraft) return false
  const draftWrap = _currentAiBubble?.closest?.('.msg')
  if (draftWrap?.dataset) draftWrap.dataset.openclawStreamingDraft = '1'
  const html = Array.from(_messagesEl.children)
    .filter(node => node?.id !== 'typing-indicator' && !node.classList?.contains('chat-page-guide'))
    .map(node => node.outerHTML)
    .join('')
  const messages = collectOpenClawVisibleMessagesForSnapshot()
  if (!html && !messages.length && !hasDraft) return false
  const snapshot = {
    schemaVersion: OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION,
    sessionKey: _sessionKey,
    html,
    messages,
    currentAiText: _currentAiText,
    currentAiImages: [...(_currentAiImages || [])],
    currentAiVideos: [...(_currentAiVideos || [])],
    currentAiAudios: [...(_currentAiAudios || [])],
    currentAiFiles: [...(_currentAiFiles || [])],
    currentAiTools: [...(_currentAiTools || [])],
    currentRunId: _currentRunId,
    currentAiBubbleRequestId: _currentAiBubbleRequestId,
    isStreaming: _isStreaming,
    isSending: _isSending,
    messageQueue: [...(_messageQueue || [])],
    streamStartTime: _streamStartTime,
    lastRenderedAiText: _lastRenderedAiText,
    lastHistoryHash: _lastHistoryHash,
    timestamp: Date.now(),
    reason,
  }
  _chatViewSnapshotsBySession.set(_sessionKey, snapshot)
  persistOpenClawChatViewSnapshot(snapshot)
  return true
}

function restoreOpenClawChatSnapshot(sessionKey, reason = '') {
  const key = normalizeOpenClawSessionKey(sessionKey)
  if (!key || !_messagesEl || !_typingEl) return false
  pruneOpenClawChatViewSnapshots()
  const snapshot = getOpenClawChatViewSnapshot(key)
  if (!openClawSnapshotHasRenderableMessages(snapshot)) return false
  if (_messagesEl.querySelector('.msg-user, .msg-ai')) return false
  const sourceMessages = Array.isArray(snapshot.messages) && snapshot.messages.length
    ? snapshot.messages
    : openClawSnapshotHtmlToMessages(snapshot.html || '')
  const restoredMessages = normalizeOpenClawMessagesForRestore(sourceMessages)
  restoredMessages.forEach(msg => appendOpenClawHistoryMessage(msg))
  _sessionKey = key
  _currentAiText = snapshot.currentAiText || ''
  _currentAiImages = [...(snapshot.currentAiImages || [])]
  _currentAiVideos = [...(snapshot.currentAiVideos || [])]
  _currentAiAudios = [...(snapshot.currentAiAudios || [])]
  _currentAiFiles = [...(snapshot.currentAiFiles || [])]
  _currentAiTools = [...(snapshot.currentAiTools || [])]
  _currentRunId = snapshot.currentRunId || null
  _currentAiBubbleRequestId = snapshot.currentAiBubbleRequestId || ''
  _isStreaming = !!snapshot.isStreaming
  _isSending = !!snapshot.isSending
  _messageQueue = [...(snapshot.messageQueue || [])]
  _streamStartTime = snapshot.streamStartTime || 0
  _lastRenderedAiText = snapshot.lastRenderedAiText || _currentAiText || ''
  _lastHistoryHash = snapshot.lastHistoryHash || ''
  _currentAiBubble = _messagesEl.querySelector('[data-openclaw-streaming-draft="1"] .msg-bubble') || null
  updateSendState()
  scrollToBottom(true)
  console.debug('[chat] restored OpenClaw chat view snapshot:', { sessionKey: key, reason })
  return true
}

function handleOpenClawChatSnapshotLifecycle(reason = 'page-lifecycle') {
  try { snapshotCurrentChatState(reason) } catch {}
}

function bindOpenClawChatSnapshotLifecycle() {
  if (_chatSnapshotLifecycleBound) return
  _chatSnapshotLifecycleBound = true
  window.addEventListener('pagehide', () => handleOpenClawChatSnapshotLifecycle('pagehide'))
  window.addEventListener('superclaw:before-engine-switch', () => {
    handleOpenClawChatSnapshotLifecycle('engine-switch')
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handleOpenClawChatSnapshotLifecycle('visibility-hidden')
  })
}

function shouldProtectCurrentMessagesFromHistory(historyMessages = []) {
  if (!_messagesEl) return false
  if (_isStreaming || _isSending || _currentAiText || _currentAiBubble || _messageQueue.length > 0) return true
  const displayedCount = countDisplayedChatMessages()
  return displayedCount > 0 && Array.isArray(historyMessages) && historyMessages.length > 0 && displayedCount > historyMessages.length
}

function normalizeVisibleOpenClawText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function getOpenClawLastVisibleUserText() {
  if (!_messagesEl) return ''
  const users = Array.from(_messagesEl.querySelectorAll('.msg-user .msg-bubble'))
  const last = users[users.length - 1]
  return normalizeOpenClawPromptFingerprint(last?.innerText || last?.textContent || '')
}

function getOpenClawLastVisibleUserCreatedTime() {
  if (!_messagesEl) return 0
  const users = Array.from(_messagesEl.querySelectorAll('.msg-user'))
  const last = users[users.length - 1]
  return parseOpenClawMessageTime(last?.dataset?.openclawCreatedAt || last?.dataset?.openclawTimestamp)
}

function hasVisibleOpenClawHistoryMessage(msg) {
  if (!msg || !_messagesEl) return false
  const dedupeKey = msg.displayDedupeKey || msg.dedupeKey
  const sessionKey = normalizeOpenClawSessionKey(msg.sessionKey || _sessionKey)
  if (dedupeKey && hasVisibleRenderedOpenClawMessage(sessionKey, dedupeKey)) return true
  if (msg.role === 'user' && hasVisibleOpenClawUserNearDuplicate(msg)) return true
  if (msg.role === 'assistant') {
    if (_activeOpenClawRun && !isStrongOpenClawHistoryCandidate(msg, _activeOpenClawRun)) return false
    const displayKey = getOpenClawDedupeKeyParts(dedupeKey).display
    return hasVisibleOpenClawAssistantAfterLastUserWithDisplay(sessionKey, displayKey)
  }
  const targetText = normalizeVisibleOpenClawText(msg.role === 'assistant'
    ? sanitizeOpenClawVisibleReply(msg.text || '')
    : openClawVisibleUserText(msg.text || ''))
  if (!targetText) return false
  const selector = msg.role === 'assistant' ? '.msg-ai .msg-bubble' : '.msg-user .msg-bubble'
  return Array.from(_messagesEl.querySelectorAll(selector)).some(node => normalizeVisibleOpenClawText(getOpenClawAssistantContentText(node)) === targetText)
}

function isOpenClawPartialAssistantText(currentText, nextText) {
  const current = normalizeVisibleOpenClawText(currentText)
  const next = normalizeVisibleOpenClawText(nextText)
  if (!current || !next || current === next) return false
  if (next.length <= current.length) return false
  if (isOpenClawSafeShortLiteralReply(current)) return false
  if (next.startsWith(current)) return true
  if (isOpenClawIncompleteVisibleText(current) && next.includes(current.slice(0, Math.min(20, current.length)))) return true
  if (current.endsWith('|') && next.includes('|') && next.length > current.length + 20) return true
  return false
}

function replaceOpenClawPartialAssistantAfterLastUser(msg = {}) {
  if (!_messagesEl || msg.role !== 'assistant') return false
  const lastVisibleUserCreatedTime = getOpenClawLastVisibleUserCreatedTime()
  if (lastVisibleUserCreatedTime && getOpenClawMessageCreatedTime(msg) < lastVisibleUserCreatedTime) return false
  const finalText = sanitizeOpenClawVisibleReply(msg.text || '')
  if (!finalText || isOpenClawVisibleTextInternalAuditOnly(msg.text || '') || isOpenClawTextClearlyIncomplete(finalText)) return false
  const canUseLatestHistoryFallback = !_activeOpenClawRun && msg._openClawAfterLatestHistoryUser
  if (_activeOpenClawRun && !isStrongOpenClawHistoryCandidate(msg, _activeOpenClawRun)) return false
  const rows = Array.from(_messagesEl.querySelectorAll('.msg-user, .msg-ai'))
  const lastUserIndex = rows.map(row => row.classList?.contains('msg-user')).lastIndexOf(true)
  if (lastUserIndex < 0) return false
  const afterLastUser = rows.slice(lastUserIndex + 1).filter(row => row.classList?.contains('msg-ai'))
  for (const row of afterLastUser) {
    if (row.dataset?.openclawSessionKey !== (msg.sessionKey || _sessionKey || '')) continue
    const bubble = row.querySelector('.msg-bubble')
    if (!bubble) continue
    const existingText = sanitizeOpenClawVisibleReply(getOpenClawAssistantContentText(bubble))
    const existingIsRecoverable = (
      row.dataset?.openclawIncomplete === 'true' ||
      bubble.dataset?.openclawIncomplete === 'true' ||
      isOpenClawTransientFallbackText(existingText) ||
      isOpenClawTextClearlyIncomplete(existingText)
    )
    if (!isOpenClawPartialAssistantText(existingText, finalText) && !(canUseLatestHistoryFallback && existingIsRecoverable)) continue
    renderCompactAssistantContent(finalText, bubble, { phase: 'completed' })
    appendImagesToEl(bubble, msg.images || [])
    appendVideosToEl(bubble, msg.videos || [])
    appendAudiosToEl(bubble, msg.audios || [])
    appendOpenClawOutputFiles(bubble, msg.files || [], finalText)
    appendLifeAssistantCardsToEl(bubble, msg.screenshotCards || [], msg.confirmations || [])
    markRenderedOpenClawMessage(row, msg.sessionKey || _sessionKey, msg.displayDedupeKey || msg.dedupeKey)
    return true
  }
  return false
}

function findOpenClawAssistantRowAfterLastUser(candidate = {}) {
  if (!_messagesEl || candidate.role !== 'assistant') return null
  const rows = Array.from(_messagesEl.querySelectorAll('.msg-user, .msg-ai'))
  const lastUserIndex = rows.map(row => row.classList?.contains('msg-user')).lastIndexOf(true)
  if (lastUserIndex < 0) return null
  const candidateSession = candidate.sessionKey || _sessionKey || ''
  const candidateText = normalizeOpenClawAssistantTextForDedupe(candidate.text || '')
  const candidateTurn = getOpenClawTurnIdentity(candidate)
  for (const row of rows.slice(lastUserIndex + 1)) {
    if (!row.classList?.contains('msg-ai')) continue
    if (row.dataset?.openclawSessionKey !== candidateSession) continue
    const rowTurn = getOpenClawTurnIdentity({
      sessionKey: row.dataset.openclawSessionKey,
      openclawTurnId: row.dataset.openclawTurnId,
      clientRequestId: row.dataset.clientRequestId,
      assistantMessageId: row.dataset.assistantMessageId,
    })
    if (candidateTurn && rowTurn && candidateTurn === rowTurn) return row
    const bubble = row.querySelector('.msg-bubble')
    const rowText = normalizeOpenClawAssistantTextForDedupe(getOpenClawAssistantContentText(bubble))
    if (candidateText && rowText && candidateText === rowText) return row
    if (isOpenClawPartialAssistantText(rowText, candidateText)) return row
  }
  return null
}

function mergeOpenClawAssistantIntoVisibleRow(row, msg = {}) {
  if (!row || msg.role !== 'assistant') return false
  const bubble = row.querySelector('.msg-bubble')
  if (!bubble) return false
  const existingText = getOpenClawAssistantContentText(bubble)
  const merged = mergeOpenClawAssistantMessage(
    {
      role: 'assistant',
      text: existingText,
      images: [],
      videos: [],
      audios: [],
      files: [],
      tools: [],
      screenshotCards: [],
      confirmations: [],
      timestamp: row.dataset?.openclawTimestamp,
    },
    msg,
  )
  const finalText = sanitizeOpenClawVisibleReply(merged.text || msg.text || '')
  if (!finalText) return false
  renderCompactAssistantContent(finalText, bubble, { phase: 'completed' })
  appendImagesToEl(bubble, msg.images || [])
  appendVideosToEl(bubble, msg.videos || [])
  appendAudiosToEl(bubble, msg.audios || [])
  appendOpenClawOutputFiles(bubble, msg.files || [], finalText)
  appendLifeAssistantCardsToEl(bubble, msg.screenshotCards || [], msg.confirmations || [])
  markRenderedOpenClawMessage(row, msg.sessionKey || _sessionKey, msg.displayDedupeKey || msg.dedupeKey)
  return true
}

function isOpenClawHistoryTransientFallbackMessage(msg = {}) {
  if (!msg || msg.role !== 'assistant') return false
  if (msg.images?.length || msg.videos?.length || msg.audios?.length || msg.files?.length || msg.screenshotCards?.length || msg.confirmations?.length) return false
  const rawText = msg.text || msg.content || ''
  if (isOpenClawVisibleTextInternalAuditOnly(rawText)) return true
  if (isOpenClawAssistantFailurePlaceholderText(rawText)) return true
  if (!rawText && msg.tools?.length) return false
  const visibleText = completeOpenClawVisibleReply(rawText)
  return isOpenClawTransientFallbackText(visibleText) || isOpenClawTextClearlyIncomplete(visibleText)
}

function appendOpenClawHistoryMessage(msg) {
  if (!msg || !msg.role) return false
  if (!msg.text && !msg.images?.length && !msg.videos?.length && !msg.audios?.length && !msg.files?.length && !msg.tools?.length && !msg.screenshotCards?.length && !msg.confirmations?.length) return false
  if (isOpenClawHistoryTransientFallbackMessage(msg)) return false
  if (msg.role === 'assistant') {
    const lastVisibleUserCreatedTime = getOpenClawLastVisibleUserCreatedTime()
    if (lastVisibleUserCreatedTime && getOpenClawMessageCreatedTime(msg) < lastVisibleUserCreatedTime) return false
  }
  const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
  const dedupeKey = msg.displayDedupeKey || msg.dedupeKey
    if (msg.role === 'user') {
    const userAtts = msg.images?.length
      ? msg.images.map(i => normalizeOpenClawAttachment({
        category: 'image',
        mimeType: i.mediaType || i.media_type || i.mimeType || 'image/png',
        content: i.data || i.source?.data || '',
        imageUrl: i.imageUrl || i.previewUrl || i.url || i.image_url?.url || i.source?.url || '',
        mediaPath: i.mediaPath || '',
        savedPath: i.savedPath || '',
        localPath: i.localPath || '',
        filePath: i.filePath || '',
        path: i.path || '',
        generatedMediaPath: i.generatedMediaPath || '',
        fallbackMediaPath: i.fallbackMediaPath || '',
        fileName: i.fileName || i.filename || i.name || '',
      })).filter(a => a.content || a.imageUrl || openClawAttachmentMediaPath(a))
      : []
    appendUserMessage(openClawVisibleUserText(msg.text || ''), userAtts, msgTime, {
      dedupeKey,
      sessionKey: msg.sessionKey || _sessionKey,
      fromHistory: true,
    })
    return true
  }
  if (msg.role === 'assistant') {
    const finalText = sanitizeOpenClawVisibleReply(msg.text || '')
    if (isOpenClawVisibleTextInternalAuditOnly(msg.text || '') || (finalText && isOpenClawTextClearlyIncomplete(finalText))) return false
    if (replaceOpenClawPartialAssistantAfterLastUser(msg)) return true
    appendAiMessage(msg.text || '', msgTime, msg.images || [], msg.videos || [], msg.audios || [], msg.files || [], msg.tools || [], msg.screenshotCards || [], msg.confirmations || [], {
      dedupeKey,
      sessionKey: msg.sessionKey || _sessionKey,
      fromHistory: true,
      executionTimeline: msg.executionTimeline || [],
    })
    return true
  }
  return false
}

function completeStreamingDraftFromHistory(msg) {
  if (!_currentAiBubble || msg?.role !== 'assistant') return false
  if (isOpenClawVisibleTextInternalAuditOnly(msg.text || '')) return false
  if (!canRecoverOpenClawDraftFromLatestHistory(msg)) return false
  const recoveryUserText = _activeOpenClawRun?.userText || _activeOpenClawUserText || _lastVisibleUserText
  // A terminal native history record is authoritative. The current draft can
  // contain a replayed prior-run final or an early partial frame after a
  // reconnect, so never let a longer draft win over the durable native reply.
  const historyText = sanitizeOpenClawVisibleReply(msg.text || '', recoveryUserText)
  const finalText = normalizeOpenClawExactShortReply(recoveryUserText, historyText)
  const terminalAuthoritative = msg._openClawAuthoritativeTerminal === true && msg._openClawAfterLatestHistoryUser === true
  // A terminal native record (stopReason=stop) is authoritative over trailing
  // punctuation heuristics: visible text may end with a stripped MEDIA:<path>
  // line and still be the complete final answer.
  if (!finalText || (!terminalAuthoritative && isOpenClawTextClearlyIncomplete(finalText))) return false
  const visibleDraftText = finalText || msg.text || ((msg.tools?.length && !isOpenClawToolDebugEnabled()) ? OPENCLAW_TOOL_ONLY_FALLBACK : '')
  renderCompactAssistantContent(visibleDraftText, _currentAiBubble, { phase: 'completed' })
  appendImagesToEl(_currentAiBubble, msg.images || [])
  appendVideosToEl(_currentAiBubble, msg.videos || [])
  appendAudiosToEl(_currentAiBubble, msg.audios || [])
  appendOpenClawOutputFiles(_currentAiBubble, msg.files || [], visibleDraftText)
  _currentAiTimeline = mergeOpenClawExecutionTimelines(_currentAiTimeline, msg.executionTimeline)
  const completedTools = msg.tools?.length ? msg.tools : _currentAiTools
  appendToolsToEl(_currentAiBubble, completedTools || [], _currentAiTimeline)
  appendLifeAssistantCardsToEl(_currentAiBubble, msg.screenshotCards || [], msg.confirmations || [])
  const wrap = _currentAiBubble.closest('.msg')
  if (wrap?.dataset) delete wrap.dataset.openclawStreamingDraft
  markRenderedOpenClawMessage(wrap, msg.sessionKey || _sessionKey, msg.displayDedupeKey || msg.dedupeKey)
  const group = _currentAiBubble.closest('.sc-msg-group') || wrap
  if (group && !Array.from(group.children).some(node => node.classList?.contains('msg-meta'))) {
    const meta = document.createElement('div')
    meta.className = 'msg-meta sc-msg-meta'
    meta.innerHTML = `<span class="msg-time">${formatTime(msg.timestamp ? new Date(msg.timestamp) : new Date())}</span><button class="msg-copy-btn" title="${t('common.copy')}">${svgIcon('copy', 12)}</button>`
    group.appendChild(meta)
  }
  collapseOpenClawRunTimeline(_currentAiBubble)
  _currentAiBubble = null
  _currentAiText = ''
  _currentAiStreamRawText = ''
  _currentAiImages = []
  _currentAiVideos = []
  _currentAiAudios = []
  _currentAiFiles = []
  _currentAiTools = []
  _currentRunId = null
  _isStreaming = false
  _isSending = false
  _openClawPendingResponse = false
  _openClawActiveRequestClosed = true
  _activeClientRequestId = null
  stopOpenClawProgressHistoryPolling()
  _cancelResponseWatchdog()
  clearGenerationTimeoutManager()
  showTyping(false)
  finishOpenClawActiveRun('completed', 'history-completed-current-draft')
  _messageQueue = []
  updateSendState()
  return true
}

function completeOpenClawCurrentDraftFromLatestHistory(historyMessages = []) {
  const deduped = dedupeHistoryStable(attachOpenClawExecutionTimeline(historyMessages))
  const latestUserIndex = deduped.reduce((latest, msg, index) => (
    msg?.role === 'user' && openClawVisibleUserText(msg.text || '') ? index : latest
  ), -1)
  if (latestUserIndex < 0) return false
  const latestHistoryUserText = openClawVisibleUserText(deduped[latestUserIndex]?.text || '')
  const latestHistoryUserFingerprint = normalizeOpenClawPromptFingerprint(latestHistoryUserText)
  const expectedUserFingerprint = getOpenClawLastVisibleUserText() || normalizeOpenClawPromptFingerprint(
    _activeOpenClawUserText || _activeOpenClawRun?.userText || _lastVisibleUserText,
  )
  // chat.history may still end at the previous turn for a short time after
  // send/reconnect. Do not finalize anything until the native log contains
  // the exact user turn currently visible in the WebView.
  if (expectedUserFingerprint && latestHistoryUserFingerprint !== expectedUserFingerprint) return false
  let previousUserIndex = -1
  let previousUserText = ''
  let previousUserId = ''
  for (let index = latestUserIndex; index < deduped.length; index += 1) {
    const msg = deduped[index]
    if (msg?.role === 'user') {
      const userText = openClawVisibleUserText(msg.text || '')
      if (!userText) continue
      previousUserIndex = index
      previousUserText = userText
      previousUserId = msg.id || msg.messageId || msg.dedupeKey || ''
      msg._openClawRequestId = msg.clientRequestId || msg.requestId || msg.idempotencyKey || ''
      continue
    }
    if (msg?.role !== 'assistant') continue
    msg._openClawPreviousUserFingerprint = normalizeOpenClawPromptFingerprint(previousUserText)
    msg._openClawPreviousUserId = previousUserId
    msg._openClawPreviousUserRequestId = deduped[previousUserIndex]?._openClawRequestId || ''
    msg._openClawPreviousUserIndex = previousUserIndex
    msg._openClawAfterLatestHistoryUser = previousUserIndex >= 0 && previousUserIndex === latestUserIndex
    if (msg._openClawNativeRole === 'tool' || msg._openClawNativeRole === 'toolResult') continue
    if (isOpenClawToolUseMessage(msg)) {
      recordOpenClawProgressNarrative(msg.text || '', msg.id || msg.messageId)
      if (msg.tools?.length) {
        hydrateOpenClawRunTimelineFromTools(msg.tools)
        renderOpenClawLiveTimeline()
      }
      continue
    }
    const requiresNativeTerminal = Boolean(_activeOpenClawRun?.sawToolCall || _currentAiTools.length || _currentAiTimeline.length)
    msg._openClawAuthoritativeTerminal = isOpenClawNativeTerminalAssistant(msg)
    if (requiresNativeTerminal && !msg._openClawAuthoritativeTerminal) continue
    if (msg._openClawAfterLatestHistoryUser && msg.tools?.length) {
      hydrateOpenClawRunTimelineFromTools(msg.tools)
      // chat.history is the authoritative fallback when Gateway event frames
      // do not reach the WebView. Hydration alone only changes memory; render
      // immediately so a running native task visibly advances in the UI.
      renderOpenClawLiveTimeline()
    }
    if (!_currentAiBubble && !ensureOpenClawHistoryRecoveryBubble(msg)) continue
    if (completeStreamingDraftFromHistory(msg)) return true
  }
  return false
}

function mergeHistoryIntoCurrentMessages(historyMessages = []) {
  if (!_messagesEl) return 0
  historyMessages = attachOpenClawExecutionTimeline(historyMessages)
  if (_activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming) {
    return completeOpenClawCurrentDraftFromLatestHistory(historyMessages) ? 1 : 0
  }
  if (_currentAiBubble && _currentAiText && isOpenClawTextClearlyIncomplete(_currentAiText)) {
    return completeOpenClawCurrentDraftFromLatestHistory(historyMessages) ? 1 : 0
  }
  let merged = 0
  let lastHistoryUserText = ''
  let lastHistoryUserRequestId = ''
  const lastVisibleUserFingerprint = getOpenClawLastVisibleUserText()
  const lastVisibleUserCreatedTime = getOpenClawLastVisibleUserCreatedTime()
  const stableHistoryMessages = collapseNearDuplicateOpenClawUsers(
    collapseConsecutiveOpenClawAssistantDuplicates(historyMessages || [])
  )
  for (const msg of stableHistoryMessages) {
    if (msg?.role === 'user') {
      lastHistoryUserText = openClawVisibleUserText(msg.text || '')
      if (lastHistoryUserText) {
        _lastVisibleUserText = lastHistoryUserText
        msg._openClawRequestId = msg.clientRequestId || msg.requestId || msg.idempotencyKey || ''
        lastHistoryUserRequestId = msg._openClawRequestId
      }
    } else if (lastHistoryUserText) {
      _lastVisibleUserText = lastHistoryUserText
      msg._openClawPreviousUserFingerprint = normalizeOpenClawPromptFingerprint(lastHistoryUserText)
      msg._openClawPreviousUserRequestId = lastHistoryUserRequestId
      msg._openClawAfterLatestHistoryUser = !!lastVisibleUserFingerprint &&
        msg._openClawPreviousUserFingerprint === lastVisibleUserFingerprint
    }
    if (
      msg?.role === 'assistant' &&
      msg._openClawAfterLatestHistoryUser &&
      (_activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming) &&
      msg.tools?.length
    ) {
      hydrateOpenClawRunTimelineFromTools(msg.tools)
      renderOpenClawLiveTimeline()
    }
    if (
      msg?.role === 'assistant' &&
      lastVisibleUserCreatedTime &&
      getOpenClawMessageCreatedTime(msg) < lastVisibleUserCreatedTime
    ) {
      continue
    }
    if (
      msg?.role === 'assistant' &&
      lastVisibleUserFingerprint &&
      lastHistoryUserText &&
      normalizeOpenClawPromptFingerprint(lastHistoryUserText) !== lastVisibleUserFingerprint &&
      !_currentAiBubble
    ) {
      continue
    }
    if (isOpenClawHistoryTransientFallbackMessage(msg)) continue
    if (completeStreamingDraftFromHistory(msg)) {
      merged += 1
      continue
    }
    const sameTurnRow = msg?.role === 'assistant' ? findOpenClawAssistantRowAfterLastUser(msg) : null
    if (sameTurnRow && mergeOpenClawAssistantIntoVisibleRow(sameTurnRow, msg)) {
      merged += 1
      continue
    }
    if (hasVisibleOpenClawHistoryMessage(msg)) continue
    if (appendOpenClawHistoryMessage(msg)) merged += 1
  }
  if (merged > 0) scrollToBottom()
  return merged
}

function clearInitialOpenClawHistoryLoadTimers() {
  _initialOpenClawHistoryTimers.forEach(timer => clearTimeout(timer))
  _initialOpenClawHistoryTimers = []
}

async function restoreOpenClawStartupSessionFromRawRegistry() {
  if (!isTauriRuntime()) return _sessionKey
  try {
    const result = await api.listOpenclawRawSessions(80)
    const sessions = Array.isArray(result?.sessions) ? result.sessions : []
    const currentKey = normalizeOpenClawSessionKey(_sessionKey)
    const currentStillExists = sessions.some(session => (
      normalizeOpenClawSessionKey(session?.sessionKey || session?.key) === currentKey
    ))
    if (currentStillExists || !sessions.length) return currentKey

    const latest = [...sessions].sort((a, b) => (
      Number(b?.updatedAt || b?.lastActivity || b?.createdAt || 0) -
      Number(a?.updatedAt || a?.lastActivity || a?.createdAt || 0)
    ))[0]
    const recoveredKey = normalizeOpenClawSessionKey(latest?.sessionKey || latest?.key)
    if (!recoveredKey) return currentKey

    _sessionKey = recoveredKey
    localStorage.setItem(STORAGE_SESSION_KEY, recoveredKey)
    localStorage.setItem(STORAGE_LAST_ACTIVE_SESSION_KEY, recoveredKey)
    upsertLocalSession(recoveredKey, parseSessionAgent(recoveredKey) || 'main', parseSessionLabel(recoveredKey))
    updateSessionTitle()
    syncOpenClawSessionListActiveState(recoveredKey)
    return recoveredKey
  } catch (error) {
    console.debug('[chat] raw OpenClaw session registry unavailable:', error?.message || error)
    return _sessionKey
  }
}

function scheduleInitialOpenClawHistoryLoad() {
  clearInitialOpenClawHistoryLoadTimers()
  if (!_sessionKey || !_messagesEl) return
  for (const delayMs of [0, 900, 2500, 5000]) {
    const timer = setTimeout(async () => {
      const startupSessionKey = await restoreOpenClawStartupSessionFromRawRegistry()
      if (!_pageActive || !isOpenClawCurrentSessionKey(startupSessionKey)) return
      // Gateway can emit ready before its session projection is populated.
      // Refresh the projection first, then retry only an empty initial view.
      if (countDisplayedChatMessages() > 0) return
      await refreshSessionList()
      if (!_pageActive || !isOpenClawCurrentSessionKey(startupSessionKey) || countDisplayedChatMessages() > 0) return
      _lastHistoryHash = ''
      loadHistory(startupSessionKey)
    }, delayMs)
    _initialOpenClawHistoryTimers.push(timer)
  }
}

function renderOpenClawRecoveredHistory(rawMessages, requestedSessionKey, localMessages = []) {
  const authoritativeMessages = attachOpenClawExecutionTimeline(rawMessages)
  const deduped = localMessages.length
    ? dedupeHistoryStable([...localMessages, ...authoritativeMessages])
    : dedupeHistoryStable(authoritativeMessages)
  if (!deduped.length || !isOpenClawCurrentSessionKey(requestedSessionKey)) return false

  clearMessages()
  deduped.forEach(msg => {
    if (!msg.text && !msg.images?.length && !msg.videos?.length && !msg.audios?.length && !msg.files?.length && !msg.tools?.length && !msg.screenshotCards?.length && !msg.confirmations?.length) return
    const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
    if (msg.role === 'user') {
      const userAttachments = [
        ...(msg.images || []).map(img => normalizeOpenClawAttachment({
          category: 'image',
          mimeType: img.mediaType || img.media_type || img.mimeType || 'image/png',
          content: img.data || img.source?.data || '',
          imageUrl: img.imageUrl || img.previewUrl || img.url || img.image_url?.url || img.source?.url || '',
          mediaPath: img.mediaPath || '',
          savedPath: img.savedPath || '',
          localPath: img.localPath || '',
          filePath: img.filePath || '',
          path: img.path || '',
          generatedMediaPath: img.generatedMediaPath || '',
          fallbackMediaPath: img.fallbackMediaPath || '',
          fileName: img.fileName || img.filename || img.name || '',
        })),
        ...(msg.videos || []).map(video => ({ ...video, category: 'video' })),
        ...(msg.audios || []).map(audio => ({ ...audio, category: 'audio' })),
        ...(msg.files || []).map(file => ({ ...file, category: file.category || 'file' })),
      ]
      appendUserMessage(openClawVisibleUserText(msg.text || ''), userAttachments.length ? userAttachments : null, msgTime, {
        dedupeKey: msg.dedupeKey,
        sessionKey: msg.sessionKey || requestedSessionKey,
        fromHistory: true,
      })
    } else if (msg.role === 'assistant' && !isOpenClawHistoryTransientFallbackMessage(msg)) {
      appendAiMessage(msg.text, msgTime, msg.images, msg.videos, msg.audios, msg.files, msg.tools, msg.screenshotCards, msg.confirmations, {
        dedupeKey: msg.dedupeKey,
        sessionKey: msg.sessionKey || requestedSessionKey,
        fromHistory: true,
        executionTimeline: msg.executionTimeline || [],
      })
    }
  })
  _lastHistoryHash = deduped.map(msg => `${msg.dedupeKey || msg.id || msg.timestamp || ''}:${msg.role}:${(msg.text || '').length}`).join('|')
  saveMessages(authoritativeMessages.map(message => cachedHistoryMessage(message, requestedSessionKey)))
  scrollToBottom()
  return true
}

async function loadHistory(sessionKey = _sessionKey) {
  const requestedSessionKey = normalizeOpenClawSessionKey(sessionKey)
  if (!requestedSessionKey || !_messagesEl) return
  const isLoadHistoryForCurrentSession = () => isOpenClawCurrentSessionKey(requestedSessionKey)
  _isLoadingHistory = true
  let hasExisting = _messagesEl.querySelector('.msg-user, .msg-ai')
  let localDedupedForSession = []

  // The portable session JSONL is authoritative. Read it before IndexedDB so
  // a stale WebView snapshot cannot paint a different session over this one.
  let rawHistory = null
  if (isTauriRuntime()) {
    try {
      const raw = await api.readOpenclawRawHistory(requestedSessionKey, 5_000)
      if (Array.isArray(raw?.messages) && raw.messages.length) rawHistory = raw.messages
    } catch (error) {
      console.debug('[chat] raw OpenClaw history unavailable:', error?.message || error)
    }
  }

  if (isStorageAvailable()) {
    const local = await getLocalMessages(requestedSessionKey, 200)
    if (!_messagesEl || !isLoadHistoryForCurrentSession()) {
      _isLoadingHistory = false
      return
    }
    // IndexedDB also holds native-media turns that are executed locally and
    // never reach the Gateway's portable JSONL. Always merge those local rows
    // so they survive session restore even when the Gateway history is
    // non-empty; dedupeHistoryStable drops rows the Gateway already contains.
    if (local.length) {
      const localDeduped = dedupeHistoryStable(local)
      localDedupedForSession = localDeduped
      if (_activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming) {
        mergeHistoryIntoCurrentMessages(localDeduped)
        hasExisting = _messagesEl.querySelector('.msg-user, .msg-ai')
      } else if (!hasExisting) {
        clearMessages()
        localDeduped.forEach(msg => {
          if (!isLoadHistoryForCurrentSession()) return
          if (!msg.text && !msg.images?.length && !msg.videos?.length && !msg.audios?.length && !msg.files?.length && !msg.tools?.length && !msg.screenshotCards?.length && !msg.confirmations?.length) return
          if (isOpenClawHistoryTransientFallbackMessage(msg)) return
          const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
          if (msg.role === 'user') {
            const userAttachments = [
              ...(msg.images || []).map(img => normalizeOpenClawAttachment({
                category: 'image',
                mimeType: img.mediaType || img.media_type || img.mimeType || 'image/png',
                content: img.data || img.source?.data || '',
                imageUrl: img.imageUrl || img.previewUrl || img.url || img.image_url?.url || img.source?.url || '',
                mediaPath: img.mediaPath || '',
                savedPath: img.savedPath || '',
                localPath: img.localPath || '',
                filePath: img.filePath || '',
                path: img.path || '',
                generatedMediaPath: img.generatedMediaPath || '',
                fallbackMediaPath: img.fallbackMediaPath || '',
                fileName: img.fileName || img.filename || img.name || '',
              })).filter(a => a.content || a.imageUrl || openClawAttachmentMediaPath(a)),
              ...(msg.videos || []).map(video => ({ ...video, category: 'video' })),
              ...(msg.audios || []).map(audio => ({ ...audio, category: 'audio' })),
              ...(msg.files || []).map(file => ({ ...file, category: file.category || 'file' })),
            ]
            appendUserMessage(openClawVisibleUserText(msg.text || ''), userAttachments.length ? userAttachments : null, msgTime, {
              dedupeKey: msg.displayDedupeKey || msg.dedupeKey,
              sessionKey: msg.sessionKey || requestedSessionKey,
              fromHistory: true,
            })
          }
          else if (msg.role === 'assistant') {
            appendAiMessage(msg.text || '', msgTime, msg.images || [], msg.videos || [], msg.audios || [], msg.files || [], msg.tools || [], msg.screenshotCards || [], msg.confirmations || [], {
              dedupeKey: msg.displayDedupeKey || msg.dedupeKey,
              sessionKey: msg.sessionKey || requestedSessionKey,
              fromHistory: true,
              executionTimeline: msg.executionTimeline || [],
            })
          }
        })
        scrollToBottom()
        hasExisting = _messagesEl.querySelector('.msg-user, .msg-ai')
      }
    }
  }
  // A Gateway "ready" handshake does not guarantee that chat.history is
  // available yet. For an idle restored session, the portable JSONL is the
  // authoritative record and must be painted before a slow or incomplete
  // Gateway history projection can leave the conversation looking empty.
  const hasActiveOpenClawHistoryGeneration = Boolean(
    _activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming || _currentAiBubble
  )
  if (rawHistory?.length && !hasActiveOpenClawHistoryGeneration && isLoadHistoryForCurrentSession()) {
    renderOpenClawRecoveredHistory(rawHistory, requestedSessionKey, localDedupedForSession)
    _isLoadingHistory = false
    return
  }
  // The Gateway can report ready before its session projection is rebuilt;
  // rawHistory above remains the durable source in that interval.
  if (!wsClient.gatewayReady) {
    if (rawHistory?.length && isLoadHistoryForCurrentSession()) {
      renderOpenClawRecoveredHistory(rawHistory, requestedSessionKey, localDedupedForSession)
    }
    _isLoadingHistory = false
    return
  }
  try {
    const result = await wsClient.chatHistory(requestedSessionKey, 200)
    if (!isLoadHistoryForCurrentSession()) return
    if (!result?.messages?.length && !rawHistory?.length) {
      if (_messagesEl && !_messagesEl.querySelector('.msg')) appendSystemMessage(t('chat.noMessages'))
      return
    }
    let authoritativeMessages = rawHistory?.length ? rawHistory : result.messages
    authoritativeMessages = attachOpenClawExecutionTimeline(authoritativeMessages)
    const remoteDeduped = dedupeHistoryStable(authoritativeMessages)
    const deduped = localDedupedForSession.length
      ? dedupeHistoryStable([...localDedupedForSession, ...authoritativeMessages])
      : remoteDeduped
    const displayedCount = countDisplayedChatMessages()
    const hasActiveOpenClawGeneration = Boolean(_activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming || _currentAiBubble)
    const refreshIsSparse = hasExisting
      && hasActiveOpenClawGeneration
      && _messageQueue.length === 0
      && deduped.length > 0
      && displayedCount > deduped.length
    if (refreshIsSparse) {
      console.warn('[chat] sparse history refresh merged to preserve visible messages:', {
        sessionKey: requestedSessionKey,
        displayedCount,
        historyCount: deduped.length,
      })
      mergeHistoryIntoCurrentMessages(deduped)
      saveMessages(authoritativeMessages.map(message => cachedHistoryMessage(message, requestedSessionKey)))
      return
    }
    const hash = deduped
      .map(m => `${m.dedupeKey || m.displayDedupeKey || m.id || m.messageId || m.runId || m.timestamp || ''}:${m.role}:${(m.text || '').length}:${m.images?.length || 0}:${m.videos?.length || 0}:${m.audios?.length || 0}:${m.files?.length || 0}:${m.tools?.length || 0}`)
      .join('|')
    const hasIncompleteDraft = _currentAiBubble && _currentAiText && isOpenClawTextClearlyIncomplete(_currentAiText)
    _lastHistoryHash = hash

    // A native run can finish in Gateway before its final chat event reaches
    // the WebView. Complete the active turn from the authoritative history
    // before normal history merging, otherwise a live progress card can keep
    // the UI in the executing state after the real result already exists.
    if ((_activeOpenClawRun || _openClawPendingResponse || _isSending || _isStreaming) &&
      completeOpenClawCurrentDraftFromLatestHistory(remoteDeduped)) {
      saveMessages(authoritativeMessages.map(message => cachedHistoryMessage(message, requestedSessionKey)))
      return
    }

    // A restored WebView snapshot is only a temporary offline/draft fallback.
    // Once Gateway returns authoritative history for an idle session, rebuild
    // from it so stale snapshots cannot hide or reorder real conversations.
    if (hasActiveOpenClawGeneration || shouldProtectCurrentMessagesFromHistory(deduped)) {
      mergeHistoryIntoCurrentMessages(deduped)
      saveMessages(authoritativeMessages.map(message => cachedHistoryMessage(message, requestedSessionKey)))
      _isLoadingHistory = false
      return
    }

    clearMessages()
    let hasOmittedImages = false
    deduped.forEach(msg => {
      if (!msg.text && !msg.images?.length && !msg.videos?.length && !msg.audios?.length && !msg.files?.length && !msg.tools?.length && !msg.screenshotCards?.length && !msg.confirmations?.length) return
      const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
      if (msg.role === 'user') {
        const userAtts = msg.images?.length
          ? msg.images.map(i => normalizeOpenClawAttachment({
            category: 'image',
            mimeType: i.mediaType || i.media_type || i.mimeType || 'image/png',
            content: i.data || i.source?.data || '',
            imageUrl: i.imageUrl || i.previewUrl || i.url || i.image_url?.url || i.source?.url || '',
            mediaPath: i.mediaPath || '',
            savedPath: i.savedPath || '',
            localPath: i.localPath || '',
            filePath: i.filePath || '',
            path: i.path || '',
            generatedMediaPath: i.generatedMediaPath || '',
            fallbackMediaPath: i.fallbackMediaPath || '',
            fileName: i.fileName || i.filename || i.name || '',
          })).filter(a => a.content || a.imageUrl || openClawAttachmentMediaPath(a))
          : []
        if (msg.images?.length && !userAtts.length) hasOmittedImages = true
        appendUserMessage(openClawVisibleUserText(msg.text || ''), userAtts, msgTime, {
          dedupeKey: msg.dedupeKey,
          sessionKey: msg.sessionKey || requestedSessionKey,
          fromHistory: true,
        })
      } else if (msg.role === 'assistant') {
        if (isOpenClawHistoryTransientFallbackMessage(msg)) return
        appendAiMessage(msg.text, msgTime, msg.images, msg.videos, msg.audios, msg.files, msg.tools, msg.screenshotCards, msg.confirmations, {
          dedupeKey: msg.dedupeKey,
          sessionKey: msg.sessionKey || requestedSessionKey,
          fromHistory: true,
          executionTimeline: msg.executionTimeline || [],
        })
      }
    })
    if (hasOmittedImages) {
      appendSystemMessage(t('chat.imageHistoryHint'))
    }
    saveMessages(authoritativeMessages.map(message => cachedHistoryMessage(message, requestedSessionKey)))
    scrollToBottom()
  } catch (e) {
    console.error('[chat] loadHistory error:', e)
    if (_messagesEl && !_messagesEl.querySelector('.msg')) appendSystemMessage(`${t('common.loadFailed')}: ${e.message}`)
  } finally {
    _isLoadingHistory = false
  }
}

function countDisplayedChatMessages() {
  if (!_messagesEl) return 0
  return _messagesEl.querySelectorAll('.msg-user, .msg-ai').length
}

function normalizeOpenClawHistoryRecord(msg = {}) {
  const inner = msg?.message
  if (!inner || typeof inner !== 'object') return msg || {}
  if (!inner.role && inner.content == null && inner.text == null) return msg || {}
  return {
    ...inner,
    id: inner.id || msg.id,
    messageId: inner.messageId || msg.messageId || msg.id,
    eventId: inner.eventId || msg.eventId,
    runId: inner.runId || msg.runId,
    stopReason: inner.stopReason || inner.stop_reason || msg.stopReason || msg.stop_reason,
    idempotencyKey: inner.idempotencyKey || msg.idempotencyKey,
    clientRequestId: inner.clientRequestId || msg.clientRequestId,
    requestId: inner.requestId || msg.requestId,
    openclawTurnId: inner.openclawTurnId || inner.turnId || msg.openclawTurnId || msg.turnId,
    assistantMessageId: inner.assistantMessageId || msg.assistantMessageId,
    userMessageId: inner.userMessageId || msg.userMessageId,
    sessionKey: inner.sessionKey || msg.sessionKey,
    state: inner.state || msg.state,
    type: inner.type || msg.type,
    timestamp: inner.timestamp || msg.timestamp,
    attachments: inner.attachments || msg.attachments,
    executionTimeline: inner.executionTimeline || msg.executionTimeline,
  }
}

function dedupeHistory(messages) {
  const deduped = []
  for (const rawMsg of messages) {
    const msg = normalizeOpenClawHistoryRecord(rawMsg)
    const role = (msg.role === 'tool' || msg.role === 'toolResult') ? 'assistant' : msg.role
    const c = extractContent(msg)
    if (!c.text && !c.images.length && !c.videos.length && !c.audios.length && !c.files.length && !c.tools.length && !c.screenshotCards.length && !c.confirmations.length) continue
    const tools = (c.tools || []).map(t => {
      const id = t.id || t.tool_call_id
      const time = t.time || resolveToolTime(id, msg.timestamp)
      return { ...t, time, messageTimestamp: msg.timestamp }
    })
    const last = deduped[deduped.length - 1]
    if (last && last.role === role) {
      if (role === 'assistant') {
        const item = { role, text: c.text, images: c.images, videos: c.videos, audios: c.audios, files: c.files, tools, screenshotCards: c.screenshotCards, confirmations: c.confirmations, timestamp: msg.timestamp, runId: msg.runId }
        if (shouldMergeAdjacentOpenClawAssistant(last, item)) {
          deduped[deduped.length - 1] = mergeOpenClawHistoryMessage(last, item)
        } else {
          deduped.push(item)
        }
        continue
        // 同文本去重（Gateway 重试产生的重复回复）
        // 不同文本则合并
        last.text = [last.text, c.text].filter(Boolean).join('\n')
        last.images = [...(last.images || []), ...c.images]
        last.videos = [...(last.videos || []), ...c.videos]
        last.audios = [...(last.audios || []), ...c.audios]
        last.files = [...(last.files || []), ...c.files]
        last.screenshotCards = [...(last.screenshotCards || []), ...c.screenshotCards]
        last.confirmations = [...(last.confirmations || []), ...c.confirmations]
        tools.forEach(t => upsertTool(last.tools, t))
        continue
      }
    }
    deduped.push({ role, text: c.text, images: c.images, videos: c.videos, audios: c.audios, files: c.files, tools, screenshotCards: c.screenshotCards, confirmations: c.confirmations, timestamp: msg.timestamp })
  }
  return deduped
}

function parseOpenClawMessageTime(value) {
  const time = normalizeTime(value)
  return Number.isFinite(time) && time > 0 ? time : 0
}

function getOpenClawMessageCreatedTime(message = {}, fallbackIndex = 0) {
  return (
    parseOpenClawMessageTime(message.createdAt) ||
    parseOpenClawMessageTime(message.created_at) ||
    parseOpenClawMessageTime(message.timestamp) ||
    parseOpenClawMessageTime(message.time) ||
    parseOpenClawMessageTime(message.message?.createdAt) ||
    parseOpenClawMessageTime(message.message?.created_at) ||
    parseOpenClawMessageTime(message.message?.timestamp) ||
    (Number.isFinite(message.orderIndex) ? Number(message.orderIndex) : 0) ||
    (Number.isFinite(message.sequence) ? Number(message.sequence) : 0) ||
    (Number.isFinite(message.seq) ? Number(message.seq) : 0) ||
    (fallbackIndex + 1)
  )
}

function getOpenClawRoleOrder(message = {}) {
  if (message.role === 'user') return 10
  if (message.role === 'assistant') return 20
  return 30
}

function sortOpenClawMessagesChronologically(messages = []) {
  return [...(messages || [])].sort((a, b) => {
    const at = getOpenClawMessageCreatedTime(a, a?._openClawOriginalIndex || 0)
    const bt = getOpenClawMessageCreatedTime(b, b?._openClawOriginalIndex || 0)
    if (at !== bt) return at - bt
    const ar = getOpenClawRoleOrder(a)
    const br = getOpenClawRoleOrder(b)
    if (ar !== br) return ar - br
    return (a?._openClawOriginalIndex || 0) - (b?._openClawOriginalIndex || 0)
  })
}

function dedupeHistoryStable(messages) {
  const deduped = []
  const indexByKey = new Map()
  const indexByDisplayKey = new Map()
  for (let sourceIndex = 0; sourceIndex < (messages || []).length; sourceIndex += 1) {
    const rawMsg = messages[sourceIndex]
    const msg = normalizeOpenClawHistoryRecord(rawMsg)
    const role = (msg.role === 'tool' || msg.role === 'toolResult') ? 'assistant' : msg.role
    const c = extractContent(msg)
    if (!c.text && !c.images.length && !c.videos.length && !c.audios.length && !c.files.length && !c.tools.length && !c.screenshotCards.length && !c.confirmations.length) continue
    const tools = (c.tools || []).map(t => {
      const id = t.id || t.tool_call_id
      const time = t.time || resolveToolTime(id, msg.timestamp)
      return { ...t, time, messageTimestamp: msg.timestamp }
    })
    const item = {
      id: msg.id,
      messageId: msg.messageId,
      eventId: msg.eventId,
      runId: msg.runId,
      stopReason: msg.stopReason,
      idempotencyKey: msg.idempotencyKey,
      clientRequestId: msg.clientRequestId,
      requestId: msg.requestId,
      openclawTurnId: msg.openclawTurnId || msg.turnId,
      assistantMessageId: msg.assistantMessageId,
      userMessageId: msg.userMessageId,
      sessionKey: msg.sessionKey || _sessionKey,
      type: msg.type,
      state: msg.state,
      createdAt: msg.createdAt || msg.created_at,
      created_at: msg.created_at || msg.createdAt,
      updatedAt: msg.updatedAt || msg.updated_at,
      updated_at: msg.updated_at || msg.updatedAt,
      orderIndex: msg.orderIndex,
      sequence: msg.sequence,
      seq: msg.seq,
      role,
      _openClawNativeRole: msg.role,
      _openClawTrajectoryFinal: msg.trajectoryFinal === true || msg._openClawTrajectoryFinal === true,
      text: c.text,
      images: c.images,
      videos: c.videos,
      audios: c.audios,
      files: c.files,
      tools,
      executionTimeline: Array.isArray(msg.executionTimeline) ? msg.executionTimeline : [],
      screenshotCards: c.screenshotCards,
      confirmations: c.confirmations,
      timestamp: msg.timestamp,
      _openClawOriginalIndex: sourceIndex,
    }
    item.dedupeKey = getOpenClawMessageDedupeKey(item)
    item.displayDedupeKey = getOpenClawHistoryDisplayDedupeKey(item)
    if (item.displayDedupeKey && indexByDisplayKey.has(item.displayDedupeKey)) {
      const idx = indexByDisplayKey.get(item.displayDedupeKey)
      deduped[idx] = mergeOpenClawHistoryMessage(deduped[idx], item)
      if (item.dedupeKey) indexByKey.set(item.dedupeKey, idx)
      continue
    }
    if (item.dedupeKey && indexByKey.has(item.dedupeKey)) {
      const idx = indexByKey.get(item.dedupeKey)
      deduped[idx] = mergeOpenClawHistoryMessage(deduped[idx], item)
      if (item.displayDedupeKey) indexByDisplayKey.set(item.displayDedupeKey, idx)
      continue
    }
    const last = deduped[deduped.length - 1]
    if (last && last.role === role) {
      if (role === 'assistant') {
        if (shouldMergeAdjacentOpenClawAssistant(last, item)) {
          deduped[deduped.length - 1] = mergeOpenClawHistoryMessage(last, item)
          if (item.dedupeKey) indexByKey.set(item.dedupeKey, deduped.length - 1)
          if (item.displayDedupeKey) indexByDisplayKey.set(item.displayDedupeKey, deduped.length - 1)
          continue
        }
      }
    }
    deduped.push(item)
    if (item.dedupeKey) indexByKey.set(item.dedupeKey, deduped.length - 1)
    if (item.displayDedupeKey) indexByDisplayKey.set(item.displayDedupeKey, deduped.length - 1)
  }
  return collapseNearDuplicateOpenClawUsers(
    collapseDuplicateOpenClawAssistantsWithinUserTurn(sortOpenClawMessagesChronologically(deduped))
  )
}

function shouldMergeAdjacentOpenClawAssistant(prev, next) {
  if (!prev || !next || prev.role !== 'assistant' || next.role !== 'assistant') return false
  if (prev.runId && next.runId && prev.runId === next.runId) return true
  if ((prev.tools?.length || 0) > 0 || (next.tools?.length || 0) > 0) return true
  return false
}

function isOpenClawGatewayMediaItem(item = {}) {
  return /^\/api\/chat\/media\/outgoing\//i.test(String(item?.url || item?.imageUrl || item?.image_url?.url || '').trim())
}

function isOpenClawLocalMediaImageItem(item = {}) {
  const value = String(
    item?.generatedMediaPath ||
    item?.mediaPath ||
    item?.savedPath ||
    item?.localPath ||
    item?.filePath ||
    item?.path ||
    item?.fallbackMediaPath ||
    ''
  ).trim()
  if (!value) return false
  if (isOpenClawGatewayMediaRoute(value)) return false
  if (isOpenClawWindowsImagePath(value) || isOpenClawFileImageUrl(value)) return true
  return /[\\/][^\\/]+\.(png|jpe?g|webp|gif)$/i.test(value)
}

function getOpenClawMediaDedupeKey(item = {}) {
  const url = item?.url || item?.imageUrl || item?.image_url?.url || item?.source?.url || ''
  const data = item?.data || item?.source?.data || ''
  if (url) return `url:${url}`
  if (data) return `data:${data}`
  const path = item?.generatedMediaPath || item?.mediaPath || item?.savedPath || item?.localPath || item?.filePath || item?.path || ''
  if (path) return `path:${String(path).toLowerCase().replace(/\\/g, '/')}`
  return JSON.stringify(item || {})
}

function mergeOpenClawUniqueMedia(a = [], b = []) {
  const combined = [...(a || []), ...(b || [])]
  const gatewayImages = combined.filter(item => isOpenClawGatewayMediaItem(item))
  const localImages = combined.filter(item => !isOpenClawGatewayMediaItem(item) && isOpenClawLocalMediaImageItem(item))
  if (gatewayImages.length && localImages.length >= gatewayImages.length) {
    // The Gateway injects the generated output as a short-lived
    // /api/chat/media/outgoing/ URL, while the final assistant text carries the
    // same output as a portable MEDIA:<path> line. When both representations
    // land on the same message, keep the portable local path and drop the
    // ephemeral Gateway URL so a single generated image does not render twice.
    const result = []
    const seen = new Set()
    for (const item of combined) {
      if (isOpenClawGatewayMediaItem(item)) continue
      const key = getOpenClawMediaDedupeKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      result.push(item)
    }
    return result
  }
  const result = []
  const seen = new Set()
  for (const item of combined) {
    const key = getOpenClawMediaDedupeKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function mergeOpenClawHistoryMessage(prev, next) {
  if (!prev) return next
  if (!next) return prev
  const prevVisible = sanitizeOpenClawVisibleReply(prev.text || '')
  const nextVisible = sanitizeOpenClawVisibleReply(next.text || '')
  let text = chooseBestOpenClawAssistantText([prev.text, next.text, prevVisible, nextVisible])
  if (prevVisible && nextVisible && isOpenClawToolOnlySummaryText(nextVisible) && !isOpenClawToolOnlySummaryText(prevVisible)) {
    text = prev.text || prevVisible
  } else if (prevVisible && nextVisible && isOpenClawToolOnlySummaryText(prevVisible) && !isOpenClawToolOnlySummaryText(nextVisible)) {
    text = next.text || nextVisible
  } else if (!text) {
    const sameText = normalizeOpenClawMessageText(prevVisible || prev.text) === normalizeOpenClawMessageText(nextVisible || next.text)
    text = sameText
      ? (prev.text || next.text || '')
      : [prev.text, next.text].filter(Boolean).join('\n')
  }
  const tools = [...(prev.tools || [])]
  ;(next.tools || []).forEach(t => upsertTool(tools, t))
  const executionTimeline = [...(prev.executionTimeline || [])]
  const timelineKeys = new Set(executionTimeline.map(step => step?.key || `${step?.kind}:${step?.label}`))
  for (const step of next.executionTimeline || []) {
    const key = step?.key || `${step?.kind}:${step?.label}`
    if (timelineKeys.has(key)) continue
    timelineKeys.add(key)
    executionTimeline.push(step)
  }
  return {
    ...prev,
    ...next,
    role: prev.role || next.role,
    text,
    images: mergeOpenClawUniqueMedia(prev.images, next.images),
    videos: mergeOpenClawUniqueMedia(prev.videos, next.videos),
    audios: mergeOpenClawUniqueMedia(prev.audios, next.audios),
    files: mergeOpenClawUniqueMedia(prev.files, next.files),
    screenshotCards: mergeOpenClawUniqueMedia(prev.screenshotCards, next.screenshotCards),
    confirmations: mergeOpenClawUniqueMedia(prev.confirmations, next.confirmations),
    tools,
    executionTimeline,
    stopReason: next.stopReason || prev.stopReason,
    timestamp: prev.timestamp || next.timestamp,
    dedupeKey: prev.dedupeKey || next.dedupeKey,
    displayDedupeKey: prev.displayDedupeKey || next.displayDedupeKey,
  }
}

function cachedHistoryMessage(m, sessionKey = _sessionKey) {
  m = normalizeOpenClawHistoryRecord(m)
  const c = extractContent(m)
  const role = (m.role === 'tool' || m.role === 'toolResult') ? 'assistant' : m.role
  const attachments = [
    ...(c.images || []).map(i => normalizeOpenClawAttachment({
      category: 'image',
      mimeType: i.mediaType || i.media_type || i.mimeType || 'image/png',
      content: i.data || i.source?.data || '',
      imageUrl: i.imageUrl || i.previewUrl || i.url || i.image_url?.url || i.source?.url || '',
      mediaPath: i.mediaPath || '',
      savedPath: i.savedPath || '',
      localPath: i.localPath || '',
      filePath: i.filePath || '',
      path: i.path || '',
      fallbackMediaPath: i.fallbackMediaPath || '',
      generatedMediaPath: i.generatedMediaPath || '',
      fileName: i.fileName || i.filename || i.name || '',
    })),
  ].filter(item => item.content || item.imageUrl || openClawAttachmentMediaPath(item))
  return {
    id: m.id || uuid(),
    // An async request can finish after the user switches sessions. Preserve
    // the request's session rather than using the mutable global at save time.
    sessionKey: normalizeOpenClawSessionKey(m.sessionKey || sessionKey),
    role,
    content: c?.text || '',
    timestamp: m.timestamp || Date.now(),
    attachments: attachments.length ? attachments : undefined,
    tools: c?.tools?.length ? c.tools : undefined,
    executionTimeline: Array.isArray(m.executionTimeline) && m.executionTimeline.length
      ? m.executionTimeline
      : undefined,
  }
}

function openClawAttachmentToImage(att = {}) {
  const normalized = normalizeOpenClawAttachment(att)
  if (!normalized.content && !normalized.imageUrl && !openClawAttachmentMediaPath(normalized)) return null
  return {
    mediaType: normalized.mimeType || 'image/png',
    data: normalized.content || '',
    url: normalized.imageUrl || normalized.url || '',
    imageUrl: normalized.imageUrl || '',
    previewUrl: normalized.previewUrl || '',
    mediaPath: normalized.mediaPath || '',
    savedPath: normalized.savedPath || '',
    localPath: normalized.localPath || '',
    filePath: normalized.filePath || '',
    path: normalized.path || '',
    fallbackMediaPath: normalized.fallbackMediaPath || '',
    generatedMediaPath: normalized.generatedMediaPath || '',
    fileName: normalized.fileName || '',
  }
}

function collectOpenClawContentImages(content, initial = []) {
  const images = [...(initial || [])]
  if (!Array.isArray(content)) return images
  for (const block of content) {
    if (block?.type === 'image' && !block.omitted) {
      if (block.data) images.push({ mediaType: block.mimeType || 'image/png', data: block.data })
      else if (block.source?.type === 'base64' && block.source.data) images.push({ mediaType: block.source.media_type || 'image/png', data: block.source.data })
      else if (block.url || block.source?.url || block.imageUrl || block.savedPath || block.mediaPath || block.localPath || block.generatedMediaPath) {
        images.push({
          url: block.url || block.source?.url || block.imageUrl || '',
          imageUrl: block.imageUrl || block.url || block.source?.url || '',
          mediaType: block.mimeType || block.mediaType || 'image/png',
          savedPath: block.savedPath || '',
          mediaPath: block.mediaPath || '',
          localPath: block.localPath || '',
          filePath: block.filePath || '',
          path: block.path || '',
          fallbackMediaPath: block.fallbackMediaPath || '',
          generatedMediaPath: block.generatedMediaPath || '',
          fileName: block.fileName || block.filename || block.name || '',
        })
      }
    } else if (block?.type === 'image_url' && block.image_url?.url) {
      images.push({ url: block.image_url.url, mediaType: 'image/png' })
    }
  }
  // Native history exposes images both in content and in attachments. Keep one
  // rendering target per actual image while retaining either representation.
  return mergeOpenClawUniqueMedia([], images)
}

function collectOpenClawAttachmentImages(msg = {}) {
  return (Array.isArray(msg.attachments) ? msg.attachments : [])
    .map(openClawAttachmentToImage)
    .filter(Boolean)
}

function extractContent(msg) {
  msg = normalizeOpenClawHistoryRecord(msg)
  const tools = []
  const screenshotCards = []
  const confirmations = []
  const attachmentImages = collectOpenClawAttachmentImages(msg)
  collectToolsFromMessage(msg, tools)
  if (msg?.type === 'screenshot_card' || msg?.card?.type === 'screenshot_card') {
    const card = msg.card || msg
    if (card?.imageUrl) screenshotCards.push(card)
  }
  if (msg?.type === 'user_confirmation' || msg?.confirmation?.type === 'user_confirmation') {
    const confirmation = msg.confirmation || msg
    confirmations.push(confirmation)
  }
  if (msg.role === 'tool' || msg.role === 'toolResult') {
    const output = typeof msg.content === 'string' ? msg.content : null
    if (!tools.length) {
      upsertTool(tools, {
        id: msg.id || msg.tool_call_id || msg.toolCallId,
        name: msg.name || msg.tool || msg.tool_name || msg.toolName || 'tool',
        input: msg.input || msg.args || msg.parameters || null,
        output: output || msg.output || msg.result || null,
        status: msg.status || 'ok',
        time: resolveToolTime(msg.tool_call_id || msg.toolCallId || msg.id, msg.timestamp),
      })
    } else if (output && !tools[0].output) {
      tools[0].output = output
    }
    return {
      text: '',
      images: collectOpenClawContentImages(msg.content, attachmentImages),
      videos: [],
      audios: [],
      files: [],
      tools,
      screenshotCards,
      confirmations,
    }
  }
  if (msg.role === 'assistant') {
    const artifactText = extractOpenClawAssistantText({
      assistantTexts: msg.assistantTexts,
      data: msg.data,
      artifacts: msg.artifacts,
      trace: msg.trace,
      message: {
        assistantTexts: msg.message?.assistantTexts,
        data: msg.message?.data,
        artifacts: msg.message?.artifacts,
      },
    })
    if (artifactText) {
      const visibleArtifactText = stripThinkingTags(artifactText)
      return {
        text: visibleArtifactText,
        images: mergeOpenClawUniqueMedia([], [
          ...collectOpenClawContentImages(msg.content, attachmentImages),
          ...extractOpenClawMediaImagePaths(visibleArtifactText),
        ]),
        videos: [],
        audios: [],
        files: extractOpenClawWorkspaceOutputFiles(visibleArtifactText),
        tools,
        screenshotCards,
        confirmations,
      }
    }
  }
  if (Array.isArray(msg.content)) {
    const texts = [], images = [...attachmentImages], videos = [], audios = [], files = []
    for (const block of msg.content) {
      if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
      else if (block.type === 'screenshot_card') {
        const card = block.card || block
        if (card?.imageUrl) screenshotCards.push(card)
      }
      else if (block.type === 'user_confirmation') {
        confirmations.push(block.confirmation || block)
      }
      else if (block.type === 'image' && !block.omitted) {
        if (block.data) images.push({ mediaType: block.mimeType || 'image/png', data: block.data })
        else if (block.source?.type === 'base64' && block.source.data) images.push({ mediaType: block.source.media_type || 'image/png', data: block.source.data })
        else if (block.url || block.source?.url || block.imageUrl || block.savedPath || block.mediaPath || block.localPath || block.generatedMediaPath) {
          images.push({
            url: block.url || block.source?.url || block.imageUrl || '',
            imageUrl: block.imageUrl || block.url || block.source?.url || '',
            mediaType: block.mimeType || block.mediaType || 'image/png',
            savedPath: block.savedPath || '',
            mediaPath: block.mediaPath || '',
            localPath: block.localPath || '',
            filePath: block.filePath || '',
            path: block.path || '',
            fallbackMediaPath: block.fallbackMediaPath || '',
            generatedMediaPath: block.generatedMediaPath || '',
            fileName: block.fileName || block.filename || block.name || '',
          })
        }
      }
      else if (block.type === 'image_url' && block.image_url?.url) images.push({ url: block.image_url.url, mediaType: 'image/png' })
      else if (block.type === 'video') {
        if (block.data) videos.push({ mediaType: block.mimeType || 'video/mp4', data: block.data })
        else if (block.url) videos.push({ url: block.url, mediaType: block.mimeType || 'video/mp4' })
      }
      else if (block.type === 'audio' || block.type === 'voice') {
        if (block.data) audios.push({ mediaType: block.mimeType || 'audio/mpeg', data: block.data, duration: block.duration })
        else if (block.url) audios.push({ url: block.url, mediaType: block.mimeType || 'audio/mpeg', duration: block.duration })
      }
      else if (block.type === 'file' || block.type === 'document') {
        files.push({ url: block.url || '', name: block.fileName || block.name || 'file', mimeType: block.mimeType || '', size: block.size, data: block.data })
      }
      else if (block.type === 'tool' || block.type === 'tool_use' || block.type === 'tool_call' || block.type === 'toolCall') {
        const callId = block.id || block.tool_call_id || block.toolCallId
        upsertTool(tools, {
          id: callId,
          name: block.name || block.tool || block.tool_name || block.toolName || 'tool',
          input: block.input || block.args || block.parameters || block.arguments || null,
          output: null,
          status: block.status || 'ok',
          time: resolveToolTime(callId, msg.timestamp),
        })
      }
      else if (block.type === 'tool_result' || block.type === 'toolResult') {
        const resId = block.id || block.tool_call_id || block.toolCallId
        upsertTool(tools, {
          id: resId,
          name: block.name || block.tool || block.tool_name || block.toolName || 'tool',
          input: block.input || block.args || null,
          output: block.output || block.result || block.content || null,
          status: block.status || 'ok',
          time: resolveToolTime(resId, msg.timestamp),
        })
      }
    }
    if (tools.length) {
      tools.forEach(t => {
        if (typeof t.input === 'string') t.input = stripAnsi(t.input)
        if (typeof t.output === 'string') t.output = stripAnsi(t.output)
      })
    }
    const mediaUrls = msg.mediaUrls || (msg.mediaUrl ? [msg.mediaUrl] : [])
    for (const url of mediaUrls) {
      if (!url) continue
      if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(url)) videos.push({ url, mediaType: 'video/mp4' })
      else if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(url)) audios.push({ url, mediaType: 'audio/mpeg' })
      else if (/\.(jpe?g|png|gif|webp|heic|svg)(\?|$)/i.test(url)) images.push({ url, mediaType: 'image/png' })
      else files.push({ url, name: url.split('/').pop().split('?')[0] || 'file', mimeType: '' })
    }
    const text = stripThinkingTags(texts.join('\n'))
    const visibleText = isOpenClawAssistantFailurePlaceholderText(text) ? '' : text
    return {
      text: visibleText,
      images: mergeOpenClawUniqueMedia([], [
        ...images,
        ...extractOpenClawMediaImagePaths(visibleText),
      ]),
      videos,
      audios,
      files: [...files, ...extractOpenClawWorkspaceOutputFiles(visibleText)],
      tools,
      screenshotCards,
      confirmations,
    }
  }
  const text = typeof msg.text === 'string' ? msg.text : (typeof msg.content === 'string' ? msg.content : '')
  const visibleText = stripThinkingTags(text)
  const safeVisibleText = isOpenClawAssistantFailurePlaceholderText(visibleText) ? '' : visibleText
  return {
    text: safeVisibleText,
    images: mergeOpenClawUniqueMedia([], [
      ...attachmentImages,
      ...extractOpenClawMediaImagePaths(safeVisibleText),
    ]),
    videos: [],
    audios: [],
    files: extractOpenClawWorkspaceOutputFiles(safeVisibleText),
    tools,
    screenshotCards,
    confirmations,
  }
}

// ── DOM 操作 ──

function appendUserMessage(text, attachments = [], msgTime, renderMeta = {}) {
  if (!_messagesEl || !_typingEl) return
  const sessionKey = normalizeOpenClawSessionKey(renderMeta.sessionKey || _sessionKey)
  if (renderMeta.dedupeKey && hasRenderedOpenClawMessage(sessionKey, renderMeta.dedupeKey)) return
  const displayText = openClawVisibleUserText(text)
  const historyCandidate = {
    role: 'user',
    text: displayText,
    content: displayText,
    sessionKey,
    timestamp: msgTime,
    createdAt: renderMeta.createdAt || msgTime,
    clientRequestId: renderMeta.clientRequestId || '',
    openclawTurnId: renderMeta.openclawTurnId || '',
    userMessageId: renderMeta.userMessageId || '',
    dedupeKey: renderMeta.dedupeKey || '',
  }
  if (renderMeta.fromHistory === true && hasVisibleOpenClawUserNearDuplicate(historyCandidate)) return
  if (displayText) _lastVisibleUserText = displayText
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-user sc-msg-row user'
  if (displayText) wrap.dataset.openclawUserFingerprint = normalizeOpenClawPromptFingerprint(displayText)
  if (msgTime) wrap.dataset.openclawTimestamp = String(normalizeTime(msgTime) || '')
  if (renderMeta.createdAt || msgTime) wrap.dataset.openclawCreatedAt = String(normalizeTime(renderMeta.createdAt || msgTime) || '')
  if (renderMeta.openclawTurnId) wrap.dataset.openclawTurnId = renderMeta.openclawTurnId
  if (renderMeta.clientRequestId) wrap.dataset.clientRequestId = renderMeta.clientRequestId
  if (renderMeta.userMessageId) wrap.dataset.userMessageId = renderMeta.userMessageId
  markRenderedOpenClawMessage(wrap, sessionKey, renderMeta.dedupeKey)
  const group = document.createElement('div')
  group.className = 'sc-msg-group user'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble sc-msg-bubble user'

  if (attachments && attachments.length > 0) {
    const mediaContainer = document.createElement('div')
    mediaContainer.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap'
    attachments.forEach(att => {
      const cat = att.category || att.type || 'image'
      const src = att.data ? `data:${att.mimeType || att.mediaType || 'image/png'};base64,${att.data}`
        : att.content ? `data:${att.mimeType || 'image/png'};base64,${att.content}`
        : isOpenClawSafeImageSrc(att.url || '') ? att.url : ''
      if (cat === 'image') {
        const imageEl = createOpenClawImageElement(att)
        if (imageEl) mediaContainer.appendChild(imageEl)
      } else if (cat === 'video' && src) {
        const video = document.createElement('video')
        video.src = src
        video.className = 'msg-video'
        video.controls = true
        video.preload = 'metadata'
        video.playsInline = true
        mediaContainer.appendChild(video)
      } else if (cat === 'audio' && src) {
        const audio = document.createElement('audio')
        audio.src = src
        audio.className = 'msg-audio'
        audio.controls = true
        audio.preload = 'metadata'
        mediaContainer.appendChild(audio)
      } else if (att.fileName || att.name) {
        mediaContainer.appendChild(createOpenClawFileCard(att))
      }
    })
    if (mediaContainer.children.length) bubble.appendChild(mediaContainer)
  }

  if (displayText) {
    const textNode = document.createElement('div')
    textNode.textContent = displayText
    bubble.appendChild(textNode)
  }

  const meta = document.createElement('div')
  meta.className = 'msg-meta sc-msg-meta'
  meta.innerHTML = `<button class="msg-copy-btn" title="${t('common.copy')}">${svgIcon('copy', 12)}</button><span class="msg-time">${formatTime(msgTime || new Date())}</span>`

  group.appendChild(bubble)
  group.appendChild(meta)
  wrap.appendChild(group)
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
}

function appendAiMessage(text, msgTime, images, videos, audios, files, tools, screenshotCards = [], confirmations = [], renderMeta = {}) {
  if (!_messagesEl || !_typingEl) return
  const hasVisibleNonToolContent = Boolean(
    images?.length ||
    videos?.length ||
    audios?.length ||
    files?.length ||
    screenshotCards?.length ||
    confirmations?.length
  )
  const hasNonTextContent = Boolean(
    hasVisibleNonToolContent ||
    tools?.length
  )
  const normalizedText = normalizeOpenClawVisibleAssistantText(text || '', {
    fallback: hasNonTextContent ? '' : OPENCLAW_EMPTY_REPLY_FALLBACK,
  })
  text = normalizedText.text ? completeOpenClawVisibleReply(normalizedText.text) : ''
  if (!hasOpenClawRenderableContent({
    text,
    images,
    videos,
    audios,
    files,
    tools,
    screenshotCards,
    confirmations,
  })) return
  const sessionKey = normalizeOpenClawSessionKey(renderMeta.sessionKey || _sessionKey)
  if (renderMeta.dedupeKey) {
    const alreadyRendered = renderMeta.fromHistory === true
      ? hasVisibleRenderedOpenClawMessage(sessionKey, renderMeta.dedupeKey)
      : hasRenderedOpenClawMessage(sessionKey, renderMeta.dedupeKey)
    if (alreadyRendered) return
  }
  const sameTurnRow = findOpenClawAssistantRowAfterLastUser({
    role: 'assistant',
    text,
    images,
    videos,
    audios,
    files,
    tools,
    screenshotCards,
    confirmations,
    sessionKey,
    dedupeKey: renderMeta.dedupeKey,
    displayDedupeKey: renderMeta.displayDedupeKey || renderMeta.dedupeKey,
    openclawTurnId: renderMeta.openclawTurnId,
    clientRequestId: renderMeta.clientRequestId,
    assistantMessageId: renderMeta.assistantMessageId,
    timestamp: msgTime,
  })
  if (sameTurnRow && mergeOpenClawAssistantIntoVisibleRow(sameTurnRow, {
    role: 'assistant',
    text,
    images,
    videos,
    audios,
    files,
    tools,
    screenshotCards,
    confirmations,
    sessionKey,
    dedupeKey: renderMeta.dedupeKey,
    displayDedupeKey: renderMeta.displayDedupeKey || renderMeta.dedupeKey,
    timestamp: msgTime,
  })) return
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-ai sc-msg-row assistant'
  if (renderMeta.openclawTurnId) wrap.dataset.openclawTurnId = renderMeta.openclawTurnId
  if (renderMeta.clientRequestId) wrap.dataset.clientRequestId = renderMeta.clientRequestId
  if (renderMeta.assistantMessageId) wrap.dataset.assistantMessageId = renderMeta.assistantMessageId
  if (msgTime) wrap.dataset.openclawTimestamp = String(msgTime instanceof Date ? msgTime.getTime() : msgTime)
  markRenderedOpenClawMessage(wrap, sessionKey, renderMeta.dedupeKey)
  const group = document.createElement('div')
  group.className = 'sc-msg-group assistant'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble sc-msg-bubble assistant'
  if (renderMeta.openclawTurnId) bubble.dataset.openclawTurnId = renderMeta.openclawTurnId
  if (renderMeta.clientRequestId) bubble.dataset.clientRequestId = renderMeta.clientRequestId
  if (renderMeta.assistantMessageId) bubble.dataset.assistantMessageId = renderMeta.assistantMessageId
  if (tools?.length || renderMeta.executionTimeline?.length) appendToolsToEl(bubble, tools, renderMeta.executionTimeline)
  appendLifeAssistantCardsToEl(bubble, screenshotCards, confirmations)
  const textEl = document.createElement('div')
  textEl.className = 'msg-text'
  textEl.dataset.compactKey = renderMeta.dedupeKey || ''
  renderCompactAssistantContent(text || '', textEl, { phase: 'completed' })
  bubble.appendChild(textEl)
  appendImagesToEl(bubble, images)
  appendVideosToEl(bubble, videos)
  appendAudiosToEl(bubble, audios)
  appendOpenClawOutputFiles(bubble, files, text)
  // 图片点击灯箱
  bubble.querySelectorAll('img').forEach(img => { if (!img.onclick) img.onclick = () => showLightbox(img.src) })

  const meta = document.createElement('div')
  meta.className = 'msg-meta sc-msg-meta'
  const canSpeak = !!sanitizeSpeechPlaybackText(text || '')
  const voiceKey = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const voiceRates = [0.75, 1, 1.25, 1.5, 2]
  const voiceOptions = voiceRates.map(rate => `<option value="${rate}" ${Math.abs(_voiceRate - rate) < 0.001 ? 'selected' : ''}>${rate}x</option>`).join('')
  meta.innerHTML = `<span class="msg-time">${formatTime(msgTime || new Date())}</span>${canSpeak ? `<button class="msg-voice-btn" data-voice-key="${escapeAttr(voiceKey)}" title="${t('chat.voiceSpeak')}" aria-label="${t('chat.voiceSpeak')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M19 10a7 7 0 0 1-14 0"/><path d="M12 17v4"/><path d="M8 21h8"/></svg><span class="msg-voice-label">朗读</span></button><select class="openclaw-read-rate" aria-label="朗读速度">${voiceOptions}</select>` : ''}<button class="msg-copy-btn" title="${t('common.copy')}">${svgIcon('copy', 12)}</button>`

  group.appendChild(createOpenClawRoleLine('assistant'))
  group.appendChild(bubble)
  group.appendChild(meta)
  wrap.appendChild(group)
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
}

function appendLifeAssistantCardsToEl(el, screenshotCards = [], confirmations = []) {
  if (!el) return
  if (Array.isArray(screenshotCards)) {
    screenshotCards.forEach(card => {
      if (card?.imageUrl) el.appendChild(renderScreenshotCard(card))
    })
  }
  if (Array.isArray(confirmations)) {
    confirmations.forEach(confirmation => {
      el.appendChild(renderUserConfirmationCard(confirmation))
    })
  }
}

/** 渲染图片到消息气泡（支持 Anthropic/OpenAI/直接格式） */
function appendImagesToEl(el, images) {
  if (!images?.length) return
  const container = document.createElement('div')
  container.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap'
  images.forEach(img => {
    const imgEl = createOpenClawImageElement(img)
    if (imgEl) container.appendChild(imgEl)
  })
  if (container.children.length) el.appendChild(container)
}

/** 渲染视频到消息气泡 */
function appendVideosToEl(el, videos) {
  if (!videos?.length) return
  videos.forEach(vid => {
    const videoEl = document.createElement('video')
    videoEl.className = 'msg-video'
    videoEl.controls = true
    videoEl.preload = 'metadata'
    videoEl.playsInline = true
    if (vid.data) videoEl.src = `data:${vid.mediaType};base64,${vid.data}`
    else if (vid.url) videoEl.src = vid.url
    el.appendChild(videoEl)
  })
}

/** 渲染音频到消息气泡 */
function appendAudiosToEl(el, audios) {
  if (!audios?.length) return
  audios.forEach(aud => {
    const audioEl = document.createElement('audio')
    audioEl.className = 'msg-audio'
    audioEl.controls = true
    audioEl.preload = 'metadata'
    if (aud.data) audioEl.src = `data:${aud.mediaType};base64,${aud.data}`
    else if (aud.url) audioEl.src = aud.url
    el.appendChild(audioEl)
  })
}

/** 渲染文件卡片到消息气泡 */
function appendFilesToEl(el, files) {
  if (!files?.length) return
  files.forEach(f => {
    const workspaceOutputPath = String(f.workspaceOutputPath || '')
    if (workspaceOutputPath && Array.from(el.querySelectorAll?.('[data-openclaw-output-path]') || []).some(card => card.dataset.openclawOutputPath === workspaceOutputPath)) return
    const card = createOpenClawFileCard({
      ...f,
      fileName: f.fileName || f.name || 'file',
      mimeType: f.mimeType || f.mediaType || 'application/octet-stream',
      content: f.content || f.data || '',
    })
    if (workspaceOutputPath) card.dataset.openclawOutputPath = workspaceOutputPath
    if (f.url) {
      card.style.cursor = 'pointer'
      card.onclick = () => window.open(f.url, '_blank')
    } else if (f.data && !isOpenClawPdfAttachment(f)) {
      card.style.cursor = 'pointer'
      card.onclick = () => {
        const a = document.createElement('a')
        a.href = `data:${f.mimeType || 'application/octet-stream'};base64,${f.data}`
        a.download = f.name || 'file'
        a.click()
      }
    }
    el.appendChild(card)
  })
}

function mergeToolEventData(entry) {
  const id = entry?.id || entry?.tool_call_id
  if (!id) return entry
  const extra = _toolEventData.get(id)
  if (!extra) return entry
  if (entry.input == null && extra.input != null) entry.input = extra.input
  if (entry.output == null && extra.output != null) entry.output = extra.output
  if (entry.status == null && extra.status != null) entry.status = extra.status
  if (entry.time == null) entry.time = extra.time || _toolEventTimes.get(id) || null
  return entry
}

function upsertTool(tools, entry) {
  if (!entry) return
  const id = entry.id || entry.tool_call_id
  let target = null
  if (id) target = tools.find(t => t.id === id || t.tool_call_id === id)
  if (!target && entry.name) target = tools.find(t => t.name === entry.name && !t.output)
  if (target) {
    if (entry.input != null && target.input == null) target.input = entry.input
    if (entry.output != null && target.output == null) target.output = entry.output
    if (entry.status && target.status == null) target.status = entry.status
    if (entry.time && target.time == null) target.time = entry.time
    return
  }
  tools.push(mergeToolEventData(entry))
}

function collectToolsFromMessage(message, tools) {
  if (!message || !tools) return
  const toolCalls = message.tool_calls || message.toolCalls || message.tools
  if (Array.isArray(toolCalls)) {
    toolCalls.forEach(call => {
      const fn = call.function || null
      const name = call.name || call.tool || call.tool_name || fn?.name
      const input = call.input || call.args || call.parameters || call.arguments || fn?.arguments || null
      const callId = call.id || call.tool_call_id
      upsertTool(tools, {
        id: callId,
        name: name || 'tool',
        input,
        output: null,
        status: call.status || 'ok',
        time: resolveToolTime(callId, message?.timestamp),
      })
    })
  }
  const toolResults = message.tool_results || message.toolResults
  if (Array.isArray(toolResults)) {
    toolResults.forEach(res => {
      const resId = res.id || res.tool_call_id
      upsertTool(tools, {
        id: resId,
        name: res.name || res.tool || res.tool_name || 'tool',
        input: res.input || res.args || null,
        output: res.output || res.result || res.content || null,
        status: res.status || 'ok',
        time: resolveToolTime(resId, message?.timestamp),
      })
    })
  }
}

/** 渲染工具调用到消息气泡 */
function appendToolsToEl(el, tools, timelineOverride = null) {
  if (!el) return
  const existing = el.querySelector?.('.msg-tool, .openclaw-tool-result-card')
  const hasTimelineOverride = Array.isArray(timelineOverride) && timelineOverride.length > 0
  if (!tools?.length) {
    if (_currentAiTimeline.length || hasTimelineOverride) {
      if (existing) existing.remove()
      renderOpenClawToolResultCard(el, [], '', timelineOverride)
      return
    }
    if (existing) existing.remove()
    return
  }
  if (existing) existing.remove()
  renderOpenClawToolResultCard(el, tools, '', timelineOverride)
  return
  const container = document.createElement('div')
  container.className = 'msg-tool'
  tools.forEach(tool => {
    const details = document.createElement('details')
    details.className = 'msg-tool-item'
    const summary = document.createElement('summary')
    const status = tool.status === 'error' ? t('chat.toolFailed') : t('chat.toolSuccess')
    const statusClass = tool.status === 'error' ? 'is-error' : 'is-success'
    const timeValue = getToolTime(tool) || resolveToolTime(tool.id || tool.tool_call_id, tool.messageTimestamp)
    const timeText = timeValue ? formatTime(new Date(timeValue)) : ''
    summary.className = 'openclaw-tool-summary'
    summary.innerHTML = `<span class="openclaw-tool-badge"><span class="openclaw-tool-icon">${svgIcon('wrench', 12)}</span><span>Tool</span></span><span class="openclaw-tool-name">${escapeHtml(tool.name || 'tool')}</span><span class="openclaw-tool-status ${statusClass}">${escapeHtml(status)}</span>${timeText ? `<span class="openclaw-tool-time">${escapeHtml(timeText)}</span>` : ''}`
    const body = document.createElement('div')
    body.className = 'msg-tool-body'
    const inputJson = stripAnsi(safeStringify(tool.input))
    const outputJson = stripAnsi(safeStringify(tool.output))
    body.innerHTML = `<div class="msg-tool-block"><div class="msg-tool-title">${t('chat.toolParams')}</div><pre>${escapeHtml(inputJson || '-')}</pre></div>`
      + `<div class="msg-tool-block"><div class="msg-tool-title">${t('chat.toolResult')}</div><pre>${escapeHtml(outputJson || '-')}</pre></div>`
    details.appendChild(summary)
    details.appendChild(body)
    container.appendChild(details)
  })
  if (existing) existing.remove()
  el.insertBefore(container, el.firstChild)
}

/** 图片灯箱查看 */
function showLightbox(src) {
  const existing = document.querySelector('.chat-lightbox')
  if (existing) existing.remove()
  const lb = document.createElement('div')
  lb.className = 'chat-lightbox'
  lb.setAttribute('role', 'dialog')
  lb.setAttribute('aria-modal', 'true')
  const image = document.createElement('img')
  image.className = 'chat-lightbox-img'
  image.src = src
  image.alt = '图片预览'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'chat-lightbox-close'
  close.setAttribute('aria-label', '关闭图片预览')
  close.textContent = '×'
  const zoomController = attachAnchoredImageZoom({
    viewport: lb,
    image,
    step: 0.15,
  })
  const dismiss = () => {
    zoomController.destroy()
    lb.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (e) => { if (e.key === 'Escape') dismiss() }
  close.addEventListener('click', dismiss)
  lb.addEventListener('click', event => { if (event.target === lb) dismiss() })
  lb.append(image, close)
  document.body.appendChild(lb)
  // ESC 关闭
  document.addEventListener('keydown', onKey)
}

function appendSystemMessage(text) {
  if (!_messagesEl || !_typingEl) return
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-system sc-msg-row system'
  wrap.textContent = text
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
}

function clearMessages() {
  if (!_messagesEl) return
  _messagesEl.querySelectorAll('.msg').forEach(m => m.remove())
  clearRenderedOpenClawMessages(_sessionKey)
  _autoScrollEnabled = true
  _lastScrollTop = 0
}

let _typingElapsedInterval = null
function showTyping(show, hint) {
  if (_typingEl) {
    _typingEl.style.display = show ? 'flex' : 'none'
    // 更新提示文字（如工具调用状态）
    const hintEl = _typingEl.querySelector('.typing-hint')
    if (hintEl) hintEl.textContent = hint || ''

    // 管理已用时间显示
    let elapsedEl = _typingEl.querySelector('.typing-elapsed')
    if (show && _sendTimestamp) {
      if (!elapsedEl) {
        elapsedEl = document.createElement('span')
        elapsedEl.className = 'typing-elapsed'
        _typingEl.appendChild(elapsedEl)
      }
      const updateElapsed = () => {
        if (!_sendTimestamp || !_typingEl) return
        const sec = Math.round((Date.now() - _sendTimestamp) / 1000)
        if (sec >= 5 && elapsedEl) elapsedEl.textContent = t('chat.elapsedTime', { seconds: sec })
      }
      updateElapsed()
      clearInterval(_typingElapsedInterval)
      _typingElapsedInterval = setInterval(updateElapsed, 5000)
    } else {
      clearInterval(_typingElapsedInterval)
      _typingElapsedInterval = null
      if (elapsedEl) elapsedEl.textContent = ''
    }
  }
  if (show) scrollToBottom()
}

function showCompactionHint(show) {
  let hint = _page?.querySelector('#compaction-hint')
  if (show && !hint && _messagesEl) {
    hint = document.createElement('div')
    hint.id = 'compaction-hint'
    hint.className = 'msg msg-system compaction-hint'
    hint.innerHTML = `🗜️ ${t('chat.compacting')}`
    _messagesEl.insertBefore(hint, _typingEl)
    scrollToBottom()
  } else if (!show && hint) {
    hint.remove()
  }
}

function scrollToBottom(force = false) {
  if (!_messagesEl) return
  if (force) {
    _autoScrollEnabled = true
    _scrollForce = true
  }
  if (!force && !_autoScrollEnabled && !_scrollForce) return
  if (_scrollFrame) return

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  const followBottom = () => {
    if (!_messagesEl || (!_scrollForce && !_autoScrollEnabled)) {
      _scrollFrame = null
      _scrollForce = false
      return
    }

    _scrollForce = false
    const target = Math.max(0, _messagesEl.scrollHeight - _messagesEl.clientHeight)
    const distance = target - _messagesEl.scrollTop
    if (reduceMotion || Math.abs(distance) < 1) {
      _messagesEl.scrollTop = target
      _lastScrollTop = _messagesEl.scrollTop
      _scrollFrame = null
      return
    }

    // Keep one animation chasing the latest layout height. Process cards and
    // Markdown can grow several times per response; restarting native smooth
    // scrolling for every mutation causes visible flashing.
    _messagesEl.scrollTop += distance * 0.22
    _lastScrollTop = _messagesEl.scrollTop
    _scrollFrame = requestAnimationFrame(followBottom)
  }

  _scrollFrame = requestAnimationFrame(followBottom)
}

function isAtBottom() {
  if (!_messagesEl) return true
  return _messagesEl.scrollHeight - _messagesEl.scrollTop - _messagesEl.clientHeight < 80
}

function updateSendState() {
  if (!_sendBtn || !_textarea) return
  if (_isStreaming) {
    _sendBtn.disabled = false
    _sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
    _sendBtn.title = t('chat.cmdStopGen')
  } else {
    const gatewayCanSend = _openClawGatewayUiState === 'ready'
    _sendBtn.disabled = _sendInputLocked || _openClawPendingResponse || _isSending || _openClawGatewayUiState !== 'ready' || !gatewayCanSend || (!_textarea.value.trim() && !_attachments.length)
    _sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
    _sendBtn.title = t('chat.send')
  }
}

function updateStatusDot(status) {
  if (!_statusDot) return
  _statusDot.className = 'status-dot'
  if (status === 'ready' || status === 'connected') _statusDot.classList.add('online')
  else if (status === 'connecting' || status === 'reconnecting') _statusDot.classList.add('connecting')
  else _statusDot.classList.add('offline')
}

// ── 托管 Agent 核心逻辑 ──

function toggleHostedPanel() {
  if (!_hostedPanelEl) return
  const next = _hostedPanelEl.style.display !== 'block'
  _hostedPanelEl.style.display = next ? 'block' : 'none'
  if (next) renderHostedPanel()
}

function hideHostedPanel() {
  if (_hostedPanelEl) _hostedPanelEl.style.display = 'none'
}

function getHostedSessionKey() {
  return _sessionKey || localStorage.getItem(STORAGE_SESSION_KEY) || 'agent:main:main'
}

function getHostedBoundSessionKey() {
  return _hostedSessionConfig?.boundSessionKey || _hostedBoundSessionKey || ''
}

async function loadHostedDefaults() {
  try {
    const panel = await api.readPanelConfig()
    _hostedDefaults = panel?.hostedAgent?.default || null
  } catch { _hostedDefaults = null }
}

function loadHostedSessionConfig() {
  let data = {}
  try { data = JSON.parse(localStorage.getItem(HOSTED_SESSIONS_KEY) || '{}') } catch { data = {} }
  const key = getHostedSessionKey()
  const current = data[key] || {}
  _hostedSessionConfig = { ...HOSTED_DEFAULTS, ..._hostedDefaults, ...current }
  if (_hostedSessionConfig.enabled && !_hostedSessionConfig.boundSessionKey) {
    _hostedSessionConfig.boundSessionKey = key
  }
  _hostedBoundSessionKey = _hostedSessionConfig.boundSessionKey || null
  if (!_hostedSessionConfig.state) _hostedSessionConfig.state = { ...HOSTED_RUNTIME_DEFAULT }
  if (!_hostedSessionConfig.history) _hostedSessionConfig.history = []
  _hostedRuntime = { ...HOSTED_RUNTIME_DEFAULT, ..._hostedSessionConfig.state }
  updateHostedBadge()
}

function saveHostedSessionConfig(nextConfig, key = null) {
  let data = {}
  try { data = JSON.parse(localStorage.getItem(HOSTED_SESSIONS_KEY) || '{}') } catch { data = {} }
  data[key || getHostedSessionKey()] = nextConfig
  localStorage.setItem(HOSTED_SESSIONS_KEY, JSON.stringify(data))
}

function persistHostedRuntime(persistKey = null) {
  if (!_hostedSessionConfig) return
  _hostedSessionConfig.state = { ..._hostedRuntime }
  const key = persistKey || getHostedBoundSessionKey() || getHostedSessionKey()
  saveHostedSessionConfig(_hostedSessionConfig, key)
}

function updateHostedBadge() {
  if (!_hostedBadgeEl || !_hostedSessionConfig) return
  const status = _hostedRuntime.status || HOSTED_STATUS.IDLE
  const enabled = _hostedSessionConfig.enabled
  let text = t('chat.hostedNotEnabled'), cls = 'chat-hosted-badge'
  if (!enabled) { text = t('chat.hostedNotEnabled'); cls += ' idle' }
  else if (status === HOSTED_STATUS.RUNNING) { text = t('chat.hostedRunning'); cls += ' running' }
  else if (status === HOSTED_STATUS.WAITING) { text = t('chat.hostedWaiting'); cls += ' waiting' }
  else if (status === HOSTED_STATUS.PAUSED) { text = t('chat.hostedPaused'); cls += ' paused' }
  else if (status === HOSTED_STATUS.ERROR) { text = t('chat.hostedErrorStatus'); cls += ' error' }
  else { text = t('chat.hostedStandby'); cls += ' idle' }
  _hostedBadgeEl.className = cls
  _hostedBadgeEl.textContent = text
}

let _countdownInterval = null

function renderHostedPanel() {
  if (!_hostedPanelEl || !_hostedSessionConfig) return
  const isRunning = _hostedSessionConfig.enabled && _hostedRuntime.status !== HOSTED_STATUS.IDLE
  if (_hostedPromptEl) { _hostedPromptEl.value = _hostedSessionConfig.prompt || ''; _hostedPromptEl.disabled = isRunning }
  if (_hostedMaxStepsEl) {
    _hostedMaxStepsEl.value = _hostedSessionConfig.maxSteps || HOSTED_DEFAULTS.maxSteps
    _hostedMaxStepsEl.disabled = isRunning
    const valEl = _hostedPanelEl.querySelector('#ha-steps-val')
    if (valEl) valEl.textContent = _hostedMaxStepsEl.value
  }
  if (_hostedAutoStopEl) { _hostedAutoStopEl.value = _hostedSessionConfig.autoStopMinutes || 30; _hostedAutoStopEl.disabled = isRunning }
  const timerToggle = _hostedPanelEl.querySelector('#hosted-agent-timer-on')
  const timerBody = _hostedPanelEl.querySelector('#ha-timer-body')
  if (timerToggle) { timerToggle.checked = (_hostedSessionConfig.autoStopMinutes || 0) > 0; timerToggle.disabled = isRunning }
  if (timerBody) timerBody.style.display = timerToggle?.checked ? '' : 'none'
  if (_hostedSaveBtn) {
    _hostedSaveBtn.textContent = isRunning ? `⏹ ${t('chat.stopHosted')}` : `▶ ${t('chat.startHosted')}`
    _hostedSaveBtn.className = isRunning ? 'btn btn-ghost' : 'btn btn-primary'
    _hostedSaveBtn.style.flex = '1'
  }
  // 主按钮同时作为停止按钮，无需额外 stop btn
  // 状态栏
  const statusEl = _hostedPanelEl.querySelector('#hosted-agent-status')
  if (statusEl) {
    let msg = t('chat.ready')
    if (_hostedRuntime.lastError) msg = `${t('chat.errorPrefix')}${_hostedRuntime.lastError}`
    else if (isRunning) {
      const remaining = Math.max(0, _hostedSessionConfig.maxSteps - _hostedRuntime.stepCount)
      msg = `${t('chat.hostedRunning')} · ${t('chat.remaining')} ${remaining}`
    }
    statusEl.textContent = msg
  }
  // 倒计时
  updateCountdown()
}

function updateCountdown() {
  const cdEl = _hostedPanelEl?.querySelector('#ha-countdown')
  const fillEl = _hostedPanelEl?.querySelector('#ha-countdown-fill')
  const textEl = _hostedPanelEl?.querySelector('#ha-countdown-text')
  if (!cdEl || !fillEl || !textEl) return
  if (!_hostedAutoStopTimer || !_hostedStartTime || !_hostedSessionConfig?.autoStopMinutes) {
    cdEl.style.display = 'none'
    clearInterval(_countdownInterval); _countdownInterval = null
    return
  }
  cdEl.style.display = ''
  const totalMs = _hostedSessionConfig.autoStopMinutes * 60000
  const elapsed = Date.now() - _hostedStartTime
  const remaining = Math.max(0, totalMs - elapsed)
  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100))
  fillEl.style.width = pct + '%'
  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  textEl.textContent = `${t('chat.remaining')} ${mins}:${secs.toString().padStart(2, '0')}`
  if (!_countdownInterval) {
    _countdownInterval = setInterval(() => updateCountdown(), 1000)
  }
  if (remaining <= 0) { clearInterval(_countdownInterval); _countdownInterval = null }
}

function toggleHostedRun() {
  if (!_hostedSessionConfig) return
  if (_hostedSessionConfig.enabled && _hostedRuntime.status !== HOSTED_STATUS.IDLE) {
    stopHostedAgent()
  } else {
    startHostedAgent()
  }
}

async function startHostedAgent() {
  if (!_hostedSessionConfig) return
  const prompt = (_hostedPromptEl?.value || '').trim()
  if (!prompt) { toast(t('chat.enterTaskGoal'), 'warning'); return }
  const rawSteps = parseInt(_hostedMaxStepsEl?.value || HOSTED_DEFAULTS.maxSteps, 10)
  const maxSteps = rawSteps >= 205 ? 999999 : Math.max(1, rawSteps)
  const stepDelayMs = Math.max(200, parseInt(_hostedStepDelayEl?.value || HOSTED_DEFAULTS.stepDelayMs, 10))
  const retryLimit = Math.max(0, parseInt(_hostedRetryLimitEl?.value || HOSTED_DEFAULTS.retryLimit, 10))
  const timerOn = _page?.querySelector('#hosted-agent-timer-on')?.checked
  const autoStopMinutes = timerOn ? Math.max(0, parseInt(_hostedAutoStopEl?.value || 0, 10)) : 0
  const boundSessionKey = getHostedSessionKey()
  _hostedBoundSessionKey = boundSessionKey
  _hostedSessionConfig = { ..._hostedSessionConfig, prompt, enabled: true, maxSteps, stepDelayMs, retryLimit, autoStopMinutes, boundSessionKey }
  const sysContent = HOSTED_SYSTEM_PROMPT + '\n\nUser goal: ' + prompt
  if (!_hostedSessionConfig.history?.length) _hostedSessionConfig.history = [{ role: 'system', content: sysContent }]
  else if (_hostedSessionConfig.history[0]?.role === 'system') _hostedSessionConfig.history[0].content = sysContent
  else _hostedSessionConfig.history.unshift({ role: 'system', content: sysContent })
  _hostedRuntime = { ...HOSTED_RUNTIME_DEFAULT, status: HOSTED_STATUS.RUNNING }
  _hostedStartTime = Date.now()
  persistHostedRuntime()
  renderHostedPanel()
  updateHostedBadge()
  // 启动定时停止
  clearTimeout(_hostedAutoStopTimer)
  if (autoStopMinutes > 0) {
    _hostedAutoStopTimer = setTimeout(() => {
      appendHostedOutput(t('chat.hostedTimerExpired', { min: autoStopMinutes }))
      stopHostedAgent()
    }, autoStopMinutes * 60000)
  }
  if (!wsClient.gatewayReady || !_sessionKey) { toast(t('chat.gatewayNotReadySend'), 'warning'); return }
  toast(t('chat.hostedStarted'), 'success')
  runHostedAgentStep()
}

function stopHostedAgent() {
  if (!_hostedSessionConfig) return
  const boundSessionKey = getHostedBoundSessionKey() || getHostedSessionKey()
  if (_hostedAbort) { _hostedAbort.abort(); _hostedAbort = null }
  clearTimeout(_hostedAutoStopTimer); _hostedAutoStopTimer = null
  clearInterval(_countdownInterval); _countdownInterval = null
  _hostedBusy = false
  _hostedSessionConfig.enabled = false
  _hostedRuntime.status = HOSTED_STATUS.IDLE
  _hostedRuntime.pending = false
  _hostedRuntime.stepCount = 0
  _hostedRuntime.lastError = ''
  _hostedRuntime.errorCount = 0
  _hostedStartTime = 0
  persistHostedRuntime(boundSessionKey)
  _hostedBoundSessionKey = null
  renderHostedPanel()
  updateHostedBadge()
  toast(t('chat.hostedStopped'), 'info')
}

function shouldCaptureHostedTarget(payload) {
  if (!_hostedSessionConfig?.enabled) return false
  const hostedSessionKey = getHostedBoundSessionKey()
  if (payload?.sessionKey && hostedSessionKey && payload.sessionKey !== hostedSessionKey) return false
  if (_hostedRuntime.status === HOSTED_STATUS.PAUSED || _hostedRuntime.status === HOSTED_STATUS.ERROR || _hostedRuntime.status === HOSTED_STATUS.IDLE) return false
  if (payload?.message?.role && payload.message.role !== 'assistant') return false
  const ts = payload?.timestamp || Date.now()
  if (ts && ts === _hostedLastTargetTs) return false
  _hostedLastTargetTs = ts
  return true
}

function appendHostedTarget(text) {
  if (!_hostedSessionConfig) return
  if (!_hostedSessionConfig.history) _hostedSessionConfig.history = []
  _hostedSessionConfig.history.push({ role: 'target', content: text, ts: Date.now() })
  persistHostedRuntime()
}

function maybeTriggerHostedRun() {
  if (!_hostedSessionConfig?.enabled) return
  if (_hostedRuntime.status === HOSTED_STATUS.IDLE || _hostedRuntime.status === HOSTED_STATUS.PAUSED || _hostedRuntime.status === HOSTED_STATUS.ERROR) return
  if (_hostedRuntime.pending || _hostedBusy) return
  if (!wsClient.gatewayReady) { _hostedRuntime.status = HOSTED_STATUS.PAUSED; persistHostedRuntime(); updateHostedBadge(); renderHostedPanel(); return }
  _hostedRuntime.status = HOSTED_STATUS.IDLE
  runHostedAgentStep()
}

function compressHostedContext() {
  if (!_hostedSessionConfig?.history) return
  const history = _hostedSessionConfig.history
  if (history.length <= HOSTED_COMPRESS_THRESHOLD) return
  const sysEntry = history[0]?.role === 'system' ? history[0] : null
  const recent = history.slice(-8)
  const older = history.slice(sysEntry ? 1 : 0, -8)
  const summary = older.map(h => `[${h.role}] ${(h.content || '').slice(0, 80)}`).join('\n')
  const compressed = []
  if (sysEntry) compressed.push(sysEntry)
  compressed.push({ role: 'user', content: `[Context summary - compressed ${older.length} entries]\n${summary}`, ts: Date.now() })
  compressed.push(...recent)
  _hostedSessionConfig.history = compressed
  persistHostedRuntime()
}

function buildHostedMessages() {
  compressHostedContext()
  const history = _hostedSessionConfig?.history || []
  const mapped = history.slice(-HOSTED_CONTEXT_MAX).map(item => {
    if (item.role === 'system') return { role: 'system', content: item.content }
    if (item.role === 'assistant') return { role: 'assistant', content: item.content }
    return { role: 'user', content: item.content }
  })
  const hasUserMsg = mapped.some(m => m.role === 'user' || m.role === 'assistant')
  if (!hasUserMsg && _hostedSessionConfig?.prompt) {
    mapped.push({ role: 'user', content: _hostedSessionConfig.prompt })
  }
  return mapped
}

function detectStopFromText(text) {
  if (!text) return false
  return /\b(完成|无需继续|结束|停止|done|stop|final)\b/i.test(text)
}

async function runHostedAgentStep() {
  if (_hostedBusy || !_hostedSessionConfig?.enabled) return
  const prompt = (_hostedSessionConfig.prompt || '').trim()
  const hostedSessionKey = getHostedBoundSessionKey() || getHostedSessionKey()
  if (!prompt) return
  if (!wsClient.gatewayReady || !hostedSessionKey) {
    _hostedRuntime.status = HOSTED_STATUS.PAUSED
    _hostedRuntime.lastError = 'Gateway not ready'
    persistHostedRuntime(); updateHostedBadge()
    appendHostedOutput(t('chat.hostedNeedIntervention'))
    return
  }
  if (_hostedRuntime.errorCount >= _hostedSessionConfig.retryLimit) {
    _hostedRuntime.status = HOSTED_STATUS.ERROR
    persistHostedRuntime(); updateHostedBadge()
    appendHostedOutput(t('chat.hostedErrorThreshold'))
    return
  }
  if (_hostedRuntime.stepCount >= _hostedSessionConfig.maxSteps) {
    _hostedRuntime.status = HOSTED_STATUS.IDLE
    persistHostedRuntime(); updateHostedBadge()
    return
  }
  _hostedBusy = true
  _hostedRuntime.pending = true
  _hostedRuntime.status = HOSTED_STATUS.RUNNING
  _hostedRuntime.lastRunAt = Date.now()
  _hostedRuntime.lastRunId = uuid()
  persistHostedRuntime(); updateHostedBadge()

  const delay = _hostedSessionConfig.stepDelayMs || HOSTED_DEFAULTS.stepDelayMs
  if (delay > 0) await new Promise(r => setTimeout(r, delay))

  try {
    const messages = buildHostedMessages()
    let resultText = ''
    await callHostedAI(messages, (chunk) => { resultText += chunk })

    _hostedRuntime.stepCount += 1
    _hostedRuntime.errorCount = 0
    _hostedRuntime.lastError = ''

    _hostedSessionConfig.history.push({ role: 'assistant', content: resultText, ts: Date.now() })
    persistHostedRuntime()
    appendHostedOutput(resultText + ` | step=${_hostedRuntime.stepCount}`)

    // 如果 AI 回复中有「执行命令」类内容，通过 Gateway 发送给 Agent
    const instruction = resultText.trim()
    if (instruction && !detectStopFromText(instruction)) {
      _hostedRuntime.status = HOSTED_STATUS.WAITING
      _hostedRuntime.pending = false
      persistHostedRuntime(); updateHostedBadge()
      // 将指令发给 Gateway Agent
      try { await wsClient.chatSend(hostedSessionKey, instruction) } catch {}
    } else {
      _hostedRuntime.status = HOSTED_STATUS.IDLE
      _hostedRuntime.pending = false
      persistHostedRuntime(); updateHostedBadge()
    }
  } catch (e) {
    _hostedRuntime.errorCount = (_hostedRuntime.errorCount || 0) + 1
    _hostedRuntime.lastError = e.message || String(e)
    _hostedRuntime.pending = false
    if (_hostedRuntime.errorCount >= _hostedSessionConfig.retryLimit) {
      _hostedRuntime.status = HOSTED_STATUS.ERROR
      persistHostedRuntime(); updateHostedBadge()
      appendHostedOutput(t('chat.hostedNeedIntervention', { reason: _hostedRuntime.lastError }))
      return
    }
    persistHostedRuntime(); updateHostedBadge()
    setTimeout(() => { _hostedBusy = false; runHostedAgentStep() }, delay)
    return
  } finally {
    _hostedBusy = false
  }
}

async function callHostedAI(messages, onChunk) {
  let config
  try {
    const raw = localStorage.getItem('superclaw-assistant')
    const stored = raw ? JSON.parse(raw) : {}
    config = { baseUrl: stored.baseUrl || '', apiKey: stored.apiKey || '', model: stored.model || '', temperature: stored.temperature || 0.7, apiType: stored.apiType || 'openai-completions' }
  } catch { config = { baseUrl: '', apiKey: '', model: '', temperature: 0.7, apiType: 'openai-completions' } }

  if (!config.baseUrl || !config.model) throw new Error(t('chat.hostedModelNotConfigured'))

  const apiType = normalizeHostedApiType(config.apiType)
  const base = normalizeHostedBaseUrl(config.baseUrl, apiType)
  if (_hostedAbort) { _hostedAbort.abort(); _hostedAbort = null }
  _hostedAbort = new AbortController()
  const signal = _hostedAbort.signal
  const timeout = setTimeout(() => { if (_hostedAbort) _hostedAbort.abort() }, 120000)

  try {
    const headers = { 'Content-Type': 'application/json' }
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`
    const body = { model: config.model, messages, stream: true, temperature: config.temperature || 0.7 }
    const resp = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      let errMsg = `API error ${resp.status}`
      try { errMsg = JSON.parse(errText).error?.message || errMsg } catch {}
      throw new Error(errMsg)
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') return
        try { const json = JSON.parse(data); if (json.choices?.[0]?.delta?.content) onChunk(json.choices[0].delta.content) } catch {}
      }
    }
  } finally {
    clearTimeout(timeout)
    _hostedAbort = null
  }
}

function normalizeHostedApiType(raw) {
  const type = (raw || '').trim()
  if (type === 'anthropic' || type === 'anthropic-messages') return 'anthropic-messages'
  if (type === 'google-gemini' || type === 'google-generative-ai') return 'google-generative-ai'
  if (type === 'ollama') return 'ollama'
  return 'openai-completions'
}

function normalizeHostedBaseUrl(raw, apiType) {
  let base = (raw || '').trim()
  if (!base) throw new Error(t('chat.hostedModelNotConfigured'))
  if (/^\/\//.test(base)) base = `http:${base}`
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(base) && /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^/\s]+:\d+)(?:\/|$)/i.test(base)) {
    base = `http://${base}`
  }
  let url
  try {
    url = new URL(base)
  } catch {
    throw new Error(t('chat.hostedModelUrlInvalid'))
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname === 'tauri.localhost') {
    throw new Error(t('chat.hostedModelUrlInvalid'))
  }
  base = `${url.origin}${url.pathname}`
    .replace(/\/+$/, '')
    .replace(/\/api\/chat\/?$/, '')
    .replace(/\/api\/generate\/?$/, '')
    .replace(/\/api\/tags\/?$/, '')
    .replace(/\/api\/?$/, '')
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/completions\/?$/, '')
    .replace(/\/responses\/?$/, '')
    .replace(/\/messages\/?$/, '')
    .replace(/\/models\/?$/, '')
  const type = normalizeHostedApiType(apiType)
  if (type === 'anthropic-messages') {
    if (!base.endsWith('/v1')) base += '/v1'
    return base
  }
  if (type === 'google-generative-ai') return base
  if (/:(11434)$/i.test(base) && !base.endsWith('/v1')) return `${base}/v1`
  return base
}

function appendHostedOutput(text) {
  if (!text || !_messagesEl || !_typingEl) return
  const hostedSessionKey = getHostedBoundSessionKey()
  if (hostedSessionKey && _sessionKey && hostedSessionKey !== _sessionKey) return
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-system msg-hosted'
  wrap.textContent = `[${t('chat.hostedAgent')}] ${text}`
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
}

// ── 页面离开清理 ──

export function cleanup() {
  if (_openClawSidebarActionHandler) {
    window.removeEventListener('superclaw:openclaw-sidebar-action', _openClawSidebarActionHandler)
    _openClawSidebarActionHandler = null
  }
  snapshotCurrentChatState('cleanup')
  clearOpenClawGatewayUiConvergenceTimers()

  // OpenClaw Gateway is an app-level service.
  // Regular route changes, page unmounts, and opening the dashboard must not stop it.
  // Only real app exit or an explicit user stop action should stop the agent.
  const shouldStopOpenClawGatewayOnCleanup =
    window.__SUPERCLAW_APP_EXITING__ === true ||
    window.__SUPERCLAW_EXPLICIT_STOP_OPENCLAW_GATEWAY__ === true ||
    window.__SUPERCLAW_EXPLICIT_STOP_AGENT__ === true

  if (shouldStopOpenClawGatewayOnCleanup) {
    stopAgentOnPageClose('openclaw')
  }
  const keepActiveOpenClawRun = isOpenClawGenerationActive()
  _pageActive = false
  stopCollaborationDispatchWatcher()
  if (_pasteHandler) {
    document.removeEventListener('paste', _pasteHandler, true)
    _pasteHandler = null
  }
  if (_unsubEvent) { _unsubEvent(); _unsubEvent = null }
  if (_unsubReady) { _unsubReady(); _unsubReady = null }
  if (_unsubStatus) { _unsubStatus(); _unsubStatus = null }
  if (_unsubReconnectStuck) { _unsubReconnectStuck(); _unsubReconnectStuck = null }
  clearTimeout(_streamSafetyTimer)
  if (_scrollFrame) {
    cancelAnimationFrame(_scrollFrame)
    _scrollFrame = null
  }
  _messagesMutationObserver?.disconnect()
  _messageResizeObserver?.disconnect()
  _messagesMutationObserver = null
  _messageResizeObserver = null
  window.removeEventListener('pointerup', endOpenClawScrollPointerInteraction)
  window.removeEventListener('pointercancel', endOpenClawScrollPointerInteraction)
  _scrollPointerActive = false
  _scrollForce = false
  _voiceInputController?.destroy()
  _voicePlaybackController?.destroy()
  _voiceInputController = null
  _voicePlaybackController = null
  clearInterval(_typingElapsedInterval)
  _typingElapsedInterval = null
  _cancelResponseWatchdog()
  clearInitialOpenClawHistoryLoadTimers()
  _sendTimestamp = 0
  _lastResponseActivityAt = 0
  clearTimeout(_postFinalCheck)
  _postFinalCheck = null
  if (_hostedAbort) { _hostedAbort.abort(); _hostedAbort = null }
  _sessionKey = null
  _page = null
  _messagesEl = null
  _textarea = null
  _sendBtn = null
  _statusDot = null
  _typingEl = null
  _scrollBtn = null
  _sessionListEl = null
  _cmdPanelEl = null
  _voiceBtn = null
  _modelVoiceConfig = null
  _currentAiBubble = null
  if (!keepActiveOpenClawRun) {
    _currentAiText = ''
    _currentAiStreamRawText = ''
    _lastRenderedAiText = ''
    _currentAiImages = []
    _currentAiVideos = []
    _currentAiAudios = []
    _currentAiFiles = []
    _currentAiTools = []
    _activeClientRequestId = null
    _activeOpenClawUserText = ''
    _inFlightRequestIds.clear()
    _seenChatEventKeys.clear()
    _recentAssistantFinals.clear()
    _renderedMessageKeysBySession.clear()
    _sendInputLocked = false
    _lastSendFingerprint = ''
    _lastSendAt = 0
    _currentRunId = null
    _isStreaming = false
    _isSending = false
    _messageQueue = []
  }
  _lastHistoryHash = ''
  _hostedBtn = null
  _hostedPanelEl = null
  _hostedBadgeEl = null
  _hostedPromptEl = null
  _hostedEnableEl = null
  _hostedMaxStepsEl = null
  _hostedStepDelayEl = null
  _hostedRetryLimitEl = null
  _hostedSaveBtn = null
  _hostedPauseBtn = null
  _hostedStopBtn = null
  _hostedCloseBtn = null
  _hostedGlobalSyncEl = null
  _hostedSessionConfig = null
  _hostedDefaults = null
  _hostedRuntime = { ...HOSTED_RUNTIME_DEFAULT }
  _hostedBusy = false
  _workspaceBtn = null
  _workspacePanelEl = null
  _workspaceAgentBadgeEl = null
  _workspaceAgentTitleEl = null
  _workspacePathEl = null
  _workspaceCoreListEl = null
  _workspaceTreeEl = null
  _workspaceCurrentFileEl = null
  _workspaceMetaEl = null
  _workspaceEditorEl = null
  _workspacePreviewEl = null
  _workspaceEmptyEl = null
  _workspaceSaveBtn = null
  _workspaceReloadBtn = null
  _workspacePreviewBtn = null
  _workspaceInfo = null
  _workspaceCoreFiles = []
  _workspaceTreeCache = new Map()
  _workspaceExpandedDirs = new Set()
  _workspaceCurrentAgentId = 'main'
  _workspaceCurrentFile = null
  _workspacePreviewMode = false
  _workspaceDirty = false
  _workspaceLoadedContent = ''
  _workspaceLoading = false
  _workspaceLoadSeq = 0
  _workspaceOpenSeq = 0
}
