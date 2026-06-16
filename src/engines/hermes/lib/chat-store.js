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

// ---------- constants ----------

const STORAGE_PROFILE = 'hermes_chat_profile_v1'
const STORAGE_SESSIONS_PREFIX = 'hermes_chat_sessions_v2_'
const STORAGE_ACTIVE_PREFIX = 'hermes_chat_active_v2_'
const STORAGE_PINNED_PREFIX = 'hermes_chat_pinned_'
const STORAGE_COLLAPSED_PREFIX = 'hermes_chat_collapsed_groups_'
const STORAGE_MSGS_PREFIX = 'hermes_chat_msgs_v2_'
const LIVE_BADGE_WINDOW_MS = 5 * 60 * 1000  // 5 min

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

export function getSourceLabel(source) {
  if (!source) return ''
  return SOURCE_LABELS[source] || source
}

// ---------- helpers ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
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

function loadJson(key) {
  try {
    const raw = safeGet(key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function saveJson(key, value) {
  try { safeSet(key, JSON.stringify(value)) } catch {}
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
  if (typeof content === 'string') return { text: content, attachments: [] }
  if (!Array.isArray(content)) {
    try { return { text: JSON.stringify(content || ''), attachments: [] } }
    catch { return { text: String(content || ''), attachments: [] } }
  }

  const texts = []
  const attachments = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const type = String(part.type || '').toLowerCase()
    if ((type === 'text' || type === 'input_text' || !type) && typeof part.text === 'string') {
      texts.push(part.text)
      continue
    }

    const imageUrl = part.image_url?.url || part.url || part.source?.url || ''
    const imageData = part.data || part.source?.data || ''
    if (type === 'image_url' || type === 'input_image' || type === 'image') {
      const mimeType = part.mimeType || part.media_type || part.source?.media_type || 'image/png'
      if (imageUrl || imageData) {
        attachments.push({
          category: 'image',
          type: 'image',
          mimeType,
          url: imageUrl,
          content: imageData,
          fileName: part.fileName || part.name || 'image',
        })
      }
    }
  }
  return { text: texts.join('\n'), attachments }
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
    if (m.role === 'assistant' && !content.trim() && !normalized.attachments.length) continue

    // Plain user/assistant/system message.
    out.push({
      id: String(m.id || uid()),
      role: m.role || 'assistant',
      content,
      timestamp: ts,
      attachments: normalized.attachments,
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
      prev.content = joinAssistantChunks(prev.content, msg.content)
      if (msg.attachments?.length) {
        prev.attachments = [...(prev.attachments || []), ...msg.attachments]
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

function shouldPreferFinalOutput(current, finalOutput) {
  const cur = String(current || '').trim()
  const fin = String(finalOutput || '').trim()
  if (!fin) return false
  if (!cur) return true
  if (fin.startsWith(cur)) return true
  if (fin.length >= cur.length + 12) return true
  return false
}

/** Convert a backend session summary into the store's canonical shape. */
function mapSessionSummary(s) {
  const localCached = s || {}
  return {
    id: s.id || s.session_id || '',
    title: s.title || '',
    source: s.source || '',
    model: s.model || '',
    messageCount: s.message_count || 0,
    createdAt: parseEpochMs(s.created_at || s.started_at),
    updatedAt: parseEpochMs(s.updated_at || s.last_active || s.ended_at || s.created_at || s.started_at),
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
  backend.title = backend.title || local.title
  backend.workFileName = backend.workFileName || local.workFileName
  backend.workFilePath = backend.workFilePath || local.workFilePath
  backend.workFileDir = backend.workFileDir || local.workFileDir
  backend.workFileDisplayPath = backend.workFileDisplayPath || local.workFileDisplayPath
  backend.updatedAt = Math.max(backend.updatedAt || 0, local.updatedAt || 0, Date.now())
  backend.lastActiveAt = Math.max(backend.lastActiveAt || 0, local.lastActiveAt || 0, Date.now())
}

// ---------- Tauri event bridge ----------
//
// Streaming relies on Tauri's `hermes-run-*` events. In Web mode (远程浏览器
// 访问 SuperClaw）these events don't exist — and importing
// `@tauri-apps/api/event` itself touches `window.__TAURI_INTERNALS__.transformCallback`
// which crashes with "Cannot read properties of undefined (reading 'transformCallback')".
//
// To stay safe we short-circuit to a no-op unsubscriber when not running inside
// Tauri. Streaming via SSE is a future Web-mode improvement (issue #260).

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
    pendingAssistantId: null,  // id of the currently streaming assistant message
    error: null,
    profiles: [],
    activeProfile: safeGet(STORAGE_PROFILE) || 'default',
    loadingProfiles: false,

    // Live tool calls for the current run (shown in the streaming indicator).
    liveTools: [],             // [{ id, name, status, preview, args, result }]

    // UI prefs (persisted).
    pinned: new Set(loadJson(STORAGE_PINNED_PREFIX + profileKey(safeGet(STORAGE_PROFILE) || 'default')) || []),
    collapsed: new Set(loadJson(STORAGE_COLLAPSED_PREFIX + profileKey(safeGet(STORAGE_PROFILE) || 'default')) || []),
  }

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

  /** Force an immediate, unbatched notification (used by deterministic tests). */
  function notifySync() {
    scheduled = false
    flushNotify()
  }

  // --- persistence ---
  const sessionsKey = () => STORAGE_SESSIONS_PREFIX + profileKey(state.activeProfile)
  const activeKey = () => STORAGE_ACTIVE_PREFIX + profileKey(state.activeProfile)
  const pinnedKey = () => STORAGE_PINNED_PREFIX + profileKey(state.activeProfile)
  const collapsedKey = () => STORAGE_COLLAPSED_PREFIX + profileKey(state.activeProfile)
  const messagesKey = (sid) => STORAGE_MSGS_PREFIX + profileKey(state.activeProfile) + '_' + sid

  function persistSessions() {
    saveJson(sessionsKey(), state.sessions.map(s => ({ ...s, messages: [] })))
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
  function loadSessionsCache() {
    const cached = loadJson(sessionsKey())
    if (Array.isArray(cached) && cached.length) {
      state.sessions = cached
      const savedActive = safeGet(activeKey())
      const target = savedActive && cached.find(s => s.id === savedActive)
      if (target) {
        const msgs = loadJson(messagesKey(target.id))
        if (Array.isArray(msgs)) target.messages = msgs
        state.activeSessionId = target.id
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
      const fresh = (Array.isArray(list) ? list : []).map(mapSessionSummary)
      const freshIds = new Set(fresh.map(s => s.id))

      // Preserve cached messages for sessions still present on the server.
      const prevMsgs = new Map(state.sessions.map(s => [s.id, s.messages]))
      for (const s of fresh) {
        const prev = prevMsgs.get(s.id)
        if (prev?.length) s.messages = prev
      }

      // Keep local-only sessions that the backend still does not know about.
      // Hermes may create the real backend session with a different id after
      // the first run; merge the temporary local row into the matching backend
      // row so the sidebar does not show duplicate conversations.
      const localOnly = []
      for (const local of state.sessions.filter(s => s.source === '__local__' && !freshIds.has(s.id))) {
        const match = fresh.find(s => sessionLooksLikeBackendMatch(local, s, state.activeSessionId, state.runningSessionId))
        if (match) {
          mergeLocalSessionIntoBackend(local, match)
          if (state.activeSessionId === local.id) {
            state.activeSessionId = match.id
            safeSet(activeKey(), match.id)
          }
          if (state.runningSessionId === local.id) state.runningSessionId = match.id
          safeRemove(messagesKey(local.id))
        } else {
          localOnly.push(local)
        }
      }
      state.sessions = [...localOnly, ...fresh]
      persistSessions()

      if (!state.activeSessionId || !state.sessions.some(s => s.id === state.activeSessionId)) {
        if (state.sessions.length) {
          await switchSession(state.sessions[0].id)
        } else {
          createLocalSession()
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
      const serverIsAhead = serverUsers > localUsers
        || (serverUsers === localUsers && (!localTail.trim() || serverTail.length >= localTail.length))
      if (force || serverIsAhead) {
        target.messages = mapped
        if (target.source === '__local__') target.source = detail.source || 'api_server'
        if (detail.title && !target.workFileName) target.title = detail.title
        persistActiveMessages()
      }
      forceRemoteRefreshIds.delete(sid)
    } catch {
      // Session may not exist on server yet (local-only) — that's fine.
    }
  }

  function createLocalSession(meta = {}) {
    const s = {
      id: uid(),
      title: meta.title || meta.workFileName || '',
      source: '__local__',
      model: '',
      messageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      endedAt: null,
      lastActiveAt: undefined,
      workFileName: meta.workFileName || '',
      workFilePath: meta.workFilePath || '',
      workFileDir: meta.workFileDir || '',
      workFileDisplayPath: meta.workFileDisplayPath || '',
      messages: [],
    }
    state.sessions.unshift(s)
    state.activeSessionId = s.id
    safeSet(activeKey(), s.id)
    persistSessions()
    notify()
    return s
  }

  function adoptBackendSessionId(currentId, backendSessionId) {
    const nextId = String(backendSessionId || '').trim()
    if (!currentId || !nextId || nextId === currentId) return currentId
    const current = state.sessions.find(s => s.id === currentId)
    if (!current) return currentId

    const existing = state.sessions.find(s => s.id === nextId)
    let target = current
    if (existing && existing !== current) {
      const existingMessageIds = new Set((existing.messages || []).map(m => m.id).filter(Boolean))
      const movedMessages = (current.messages || []).filter(m => !m.id || !existingMessageIds.has(m.id))
      existing.messages = [...(existing.messages || []), ...movedMessages]
      existing.title = existing.title || current.title
      existing.workFileName = existing.workFileName || current.workFileName
      existing.workFilePath = existing.workFilePath || current.workFilePath
      existing.workFileDir = existing.workFileDir || current.workFileDir
      existing.workFileDisplayPath = existing.workFileDisplayPath || current.workFileDisplayPath
      existing.updatedAt = Math.max(existing.updatedAt || 0, current.updatedAt || 0, Date.now())
      existing.lastActiveAt = Math.max(existing.lastActiveAt || 0, current.lastActiveAt || 0, Date.now())
      state.sessions = state.sessions.filter(s => s !== current)
      target = existing
    } else {
      current.id = nextId
      current.source = current.source === '__local__' ? 'api_server' : (current.source || 'api_server')
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
    createLocalSession(meta)
  }

  async function deleteSession(sessionId) {
    if (state.streaming && sessionId === state.runningSessionId) {
      throw new Error('RUNNING_SESSION')
    }
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
      createLocalSession()
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
          createLocalSession()
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
  const forceRemoteRefreshIds = new Set()
  async function attachStreamListeners(runSessionId) {
    detachStreamListeners()
    let trackedSessionId = runSessionId
    const adoptEventSession = (payload = {}) => {
      const next = payload.session_id || payload.sessionId || payload.id || ''
      trackedSessionId = adoptBackendSessionId(trackedSessionId, next)
    }
    const runSession = () => state.sessions.find(x => x.id === trackedSessionId) || null
    const u0 = await tauriListen('hermes-run-started', (e) => {
      adoptEventSession(e?.payload || {})
    })
    const u1 = await tauriListen('hermes-run-delta', (e) => {
      const delta = e?.payload?.delta || ''
      if (!delta) return
      const s = runSession()
      if (!s) return
      let msg = s.messages.find(m => m.id === state.pendingAssistantId)
      if (!msg) {
        msg = { id: uid(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true }
        s.messages.push(msg)
        state.pendingAssistantId = msg.id
      }
      msg.content += delta
      notify()
    })
    const u2 = await tauriListen('hermes-run-tool', (e) => {
      const evt = e?.payload || {}
      const evtType = evt.event || ''
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
          id: uid(),
          name: toolName,
          status: 'running',
          preview,
          args: input,
          result: null,
          error: null,
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
      notify()
    })
    const u3 = await tauriListen('hermes-run-done', (e) => {
      adoptEventSession(e?.payload || {})
      const s = runSession()
      if (!s) { cleanupAfterRun(); return }
      const runTools = [...state.liveTools]

      // Commit finished tool calls as messages in the transcript.
      if (runTools.length) {
        for (const t of runTools) {
          s.messages.push({
            id: uid(),
            role: 'tool',
            content: '',
            timestamp: Date.now(),
            toolName: t.name,
            toolPreview: t.preview || undefined,
            toolArgs: stringifyMaybe(t.args),
            toolResult: stringifyMaybe(t.result ?? t.error),
            toolStatus: t.error ? 'error' : 'done',
          })
        }
      }

      // Finalize the streaming assistant message.
      let msg = s.messages.find(m => m.id === state.pendingAssistantId)
      if (!msg && runTools.length) {
        msg = { id: uid(), role: 'assistant', content: '', timestamp: Date.now() }
        s.messages.push(msg)
      }
      if (msg) {
        delete msg.isStreaming
        if (!msg.content.trim()) msg.content = summarizeToolOnlyReply(runTools) || '(empty)'
      }

      // Update session metadata.
      s.updatedAt = Date.now()
      s.lastActiveAt = Date.now()
      updateSessionTitleFromFirstUser(s)

      persistSessionMessages(s.id)
      persistSessions()
      cleanupAfterRun()
    })
    const u4 = await tauriListen('hermes-run-error', (e) => {
      const err = e?.payload?.error || 'unknown error'
      adoptEventSession(e?.payload || {})
      const s = runSession()
      if (s) {
        s.messages.push({
          id: uid(),
          role: 'system',
          content: `⚠️ Agent run failed: ${err}`,
          timestamp: Date.now(),
        })
        persistSessionMessages(s.id)
      }
      cleanupAfterRun()
    })
    unlisteners.push(u0, u1, u2, u3, u4)
  }

  function detachStreamListeners() {
    for (const u of unlisteners) {
      try { u() } catch {}
    }
    unlisteners.length = 0
  }

  function appendStreamDelta(runSessionId, delta) {
    if (!delta) return
    const s = state.sessions.find(x => x.id === runSessionId)
    if (!s) return
    let msg = s.messages.find(m => m.id === state.pendingAssistantId)
    if (!msg) {
      msg = { id: uid(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true }
      s.messages.push(msg)
      state.pendingAssistantId = msg.id
    }
    msg.content += delta
    notify()
  }

  function extractStreamValue(obj, keys) {
    for (const k of keys) {
      if (obj[k] != null && obj[k] !== '') return obj[k]
    }
    return null
  }

  function applyStreamToolEvent(evt) {
    const evtType = evt.event || ''
    const toolName = evt.tool || evt.tool_name || evt.name || 'tool'
    const preview = evt.preview || evt.detail || evt.message || ''
    if (evtType === 'tool.started') {
      const input = extractStreamValue(evt, ['input', 'args', 'arguments', 'parameters', 'params', 'data'])
      state.liveTools.push({
        id: uid(),
        name: toolName,
        status: 'running',
        preview,
        args: input,
        result: null,
        error: null,
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
    notify()
  }

  function completeStreamRun(runSessionId, output = '') {
    const s = state.sessions.find(x => x.id === runSessionId)
    if (!s) { cleanupAfterRun(); return }
    const runTools = [...state.liveTools]
    if (runTools.length) {
      for (const t of runTools) {
        s.messages.push({
          id: uid(),
          role: 'tool',
          content: '',
          timestamp: Date.now(),
          toolName: t.name,
          toolPreview: t.preview || undefined,
          toolArgs: stringifyMaybe(t.args),
          toolResult: stringifyMaybe(t.result ?? t.error),
          toolStatus: t.error ? 'error' : 'done',
        })
      }
    }
    let msg = s.messages.find(m => m.id === state.pendingAssistantId)
    const finalOutput = typeof output === 'string' ? output : ''
    if (!msg && (finalOutput.trim() || runTools.length)) {
      msg = { id: uid(), role: 'assistant', content: finalOutput, timestamp: Date.now(), isStreaming: true }
      s.messages.push(msg)
      state.pendingAssistantId = msg.id
    }
    if (msg) {
      delete msg.isStreaming
      if (shouldPreferFinalOutput(msg.content, finalOutput)) msg.content = finalOutput
      if (!msg.content.trim()) msg.content = summarizeToolOnlyReply(runTools) || '(empty)'
    }
    s.updatedAt = Date.now()
    s.lastActiveAt = Date.now()
    updateSessionTitleFromFirstUser(s)
    persistSessionMessages(s.id)
    persistSessions()
    cleanupAfterRun()
  }

  function replaceStreamOutput(runSessionId, output = '') {
    const finalOutput = typeof output === 'string' ? output : ''
    if (!finalOutput.trim()) return
    const s = state.sessions.find(x => x.id === runSessionId)
    if (!s) return
    let msg = s.messages.find(m => m.id === state.pendingAssistantId)
    if (!msg) {
      msg = { id: uid(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true }
      s.messages.push(msg)
      state.pendingAssistantId = msg.id
    }
    msg.content = finalOutput
    notify()
  }

  function failStreamRun(runSessionId, err) {
    const s = state.sessions.find(x => x.id === runSessionId)
    if (s) {
      s.messages.push({
        id: uid(),
        role: 'system',
        content: `⚠️ Agent run failed: ${err || 'unknown error'}`,
        timestamp: Date.now(),
      })
      persistSessionMessages(s.id)
    }
    cleanupAfterRun()
  }

  function handleStreamEvent(runSessionId, evt) {
    const eventType = evt?.event || ''
    const effectiveSessionId = adoptBackendSessionId(runSessionId, evt?.session_id || evt?.sessionId || '')
    if (eventType === 'run.started') {
      return
    }
    if (eventType === 'message.delta') {
      appendStreamDelta(effectiveSessionId, evt.delta || '')
    } else if (eventType === 'tool.started' || eventType === 'tool.completed' || eventType === 'tool.progress' || eventType === 'tool.error') {
      applyStreamToolEvent(evt)
    } else if (eventType === 'message.final') {
      replaceStreamOutput(effectiveSessionId, evt.output || '')
    } else if (eventType === 'run.completed') {
      completeStreamRun(effectiveSessionId, evt.output || '')
    } else if (eventType === 'run.failed') {
      failStreamRun(effectiveSessionId, evt.error || 'unknown error')
    }
  }

  function cleanupAfterRun() {
    const completedSessionId = state.runningSessionId
    if (completedSessionId) forceRemoteRefreshIds.add(completedSessionId)
    state.streaming = false
    state.runningSessionId = null
    state.pendingAssistantId = null
    state.liveTools = []
    streamAbortController = null
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
   *   2. Convert the in-flight assistant message to its current content +
   *      an explicit " (stopped)" suffix.
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
    const s = state.sessions.find(x => x.id === state.runningSessionId) || activeSession()
    if (s) {
      const msg = s.messages.find(m => m.id === state.pendingAssistantId)
      if (msg) {
        delete msg.isStreaming
        if (!msg.content.trim()) {
          msg.content = '_(stopped)_'
        } else if (!msg.content.endsWith('(stopped)')) {
          msg.content = msg.content.trimEnd() + ' _(stopped)_'
        }
      }
      // Commit any finished tool calls we already know about so they aren't
      // lost when we detach listeners.
      for (const t of state.liveTools) {
        if (t.status === 'done' || t.status === 'error') {
          s.messages.push({
            id: uid(),
            role: 'tool',
            content: '',
            timestamp: Date.now(),
            toolName: t.name,
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
    cleanupAfterRun()
  }

  function updateSessionTitleFromFirstUser(s) {
    if (s.workFileName) {
      s.title = s.workFileName
      return
    }
    if (s.title) return
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

  function normalizeAttachments(items = []) {
    if (!Array.isArray(items)) return []
    return items
      .map(item => {
        const category = String(item?.category || item?.type || '').toLowerCase() || 'file'
        const mimeType = item?.mimeType || item?.mediaType || item?.mime || ''
        const content = item?.content || item?.data || ''
        const url = item?.url || ''
        if (!content && !url) return null
        return {
          category,
          type: category,
          mimeType,
          fileName: item?.fileName || item?.name || '',
          content,
          url,
        }
      })
      .filter(Boolean)
  }

  async function sendMessage(content, opts = {}) {
    const attachments = normalizeAttachments(opts.attachments || [])
    const text = (content || '').trim() || (attachments.length ? '请分析我刚刚上传或粘贴的图片。' : '')
    const runText = (opts.modelContent || text).trim()
    const displayText = (opts.displayContent || text).trim()
    if ((!runText && !attachments.length) || state.streaming) return
    let s = activeSession()
    if (!s) {
      s = createLocalSession()
    }

    const userMessage = {
      id: uid(),
      role: 'user',
      content: displayText || text,
      timestamp: Date.now(),
    }
    if (runText !== userMessage.content) userMessage.modelContent = runText
    if (attachments.length) userMessage.attachments = attachments

    // Append user-visible message. modelContent is used only for future context.
    s.messages.push(userMessage)
    updateSessionTitleFromFirstUser(s)
    s.updatedAt = Date.now()
    s.lastActiveAt = Date.now()
    persistActiveMessages()
    persistSessions()

    state.streaming = true
    state.runningSessionId = s.id
    state.liveTools = []
    state.pendingAssistantId = null
    notify()

    try {
      const conversationHistory = Array.isArray(opts.conversationHistory)
        ? opts.conversationHistory
        : null

      if (isTauriRuntime()) {
        await attachStreamListeners(s.id)
        await api.hermesAgentRun(runText, s.id, conversationHistory, opts.instructions || null, attachments)
      } else {
        streamAbortController = new AbortController()
        await api.hermesAgentRunStream(
          runText,
          s.id,
          conversationHistory,
          opts.instructions || null,
          attachments,
          (evt) => handleStreamEvent(s.id, evt),
          { signal: streamAbortController.signal },
        )
      }
    } catch (e) {
      if (e?.name === 'AbortError') return
      s.messages.push({
        id: uid(),
        role: 'system',
        content: `⚠️ ${e?.message || e}`,
        timestamp: Date.now(),
      })
      persistSessionMessages(s.id)
      cleanupAfterRun()
    }
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
    deleteSession,
    bulkDeleteSessions,
    renameSession,
    togglePinned,
    toggleCollapsed,
    sendMessage,
    stopStreaming,
    pushLocalAssistant,
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
