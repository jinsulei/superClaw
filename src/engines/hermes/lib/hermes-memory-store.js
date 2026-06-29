const HERMES_MEMORY_STORAGE_KEY = 'hermes_agent_memory_store_v1'
const HERMES_MEMORY_MAX_ITEMS = 300
const HERMES_MEMORY_CONTEXT_LIMIT = 6
const HERMES_MEMORY_CONFIRM_CLEAR = '确认清空记忆'
export const HERMES_MEMORY_FILE_NAME = 'user-memory.json'

const SAFE_MEMORY_TYPES = Object.freeze([
  'user_preference',
  'project_rule',
  'agent_rule',
  'workflow_preference',
])

const ALLOWED_MEMORY_SCOPES = Object.freeze(['hermes', 'shared_safe'])
const ALLOWED_MEMORY_SOURCES = Object.freeze(['explicit', 'user_command', 'migrated_safe'])

export const HERMES_MEMORY_TYPES = SAFE_MEMORY_TYPES

let memoryFallbackState = null

function nowIso() {
  return new Date().toISOString()
}

function uid(prefix = 'mem') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function getProcessEnv() {
  try {
    return globalThis?.process?.env || {}
  } catch {
    return {}
  }
}

function joinPath(base, ...parts) {
  const root = String(base || '').replace(/[\\/]+$/g, '')
  const sep = root.includes('\\') ? '\\' : '/'
  const tail = parts
    .map(part => String(part || '').replace(/^[\\/]+|[\\/]+$/g, ''))
    .filter(Boolean)
    .join(sep)
  return tail ? `${root}${sep}${tail}` : root
}

export function getHermesMemoryDir() {
  const env = getProcessEnv()
  if (env.HERMES_MEMORY_DIR) return String(env.HERMES_MEMORY_DIR)
  if (env.SUPERCLAW_PORTABLE_DATA_DIR) return joinPath(env.SUPERCLAW_PORTABLE_DATA_DIR, 'hermes', 'memory')
  const appData = env.APPDATA || env.LOCALAPPDATA
  if (appData) return joinPath(appData, 'SuperClaw', 'hermes', 'memory')
  return joinPath('.runtime', 'hermes', 'memory')
}

export function getHermesMemoryPath() {
  return joinPath(getHermesMemoryDir(), HERMES_MEMORY_FILE_NAME)
}

function hasStorage() {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage
  } catch {
    return false
  }
}

function safeReadStorage() {
  if (!hasStorage()) return null
  try {
    return localStorage.getItem(HERMES_MEMORY_STORAGE_KEY)
  } catch {
    return null
  }
}

function safeWriteStorage(value) {
  if (!hasStorage()) {
    memoryFallbackState = value
    return
  }
  try {
    localStorage.setItem(HERMES_MEMORY_STORAGE_KEY, JSON.stringify(value))
  } catch {
    memoryFallbackState = value
  }
}

function defaultState() {
  return {
    version: 1,
    enabled: true,
    updatedAt: nowIso(),
    pendingClear: false,
    items: [],
  }
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' ? raw : defaultState()
  const items = Array.isArray(state.items) ? state.items : []
  return {
    version: 1,
    enabled: state.enabled !== false,
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : nowIso(),
    pendingClear: state.pendingClear === true,
    items: items.map(normalizeMemoryItem).filter(Boolean).slice(0, HERMES_MEMORY_MAX_ITEMS),
  }
}

function normalizeMemoryItem(item) {
  if (!item || typeof item !== 'object') return null
  const rawText = item.text || item.content || item.value || ''
  if (containsSensitiveMemoryText(rawText)) return null
  const text = sanitizeMemoryText(rawText)
  if (!text) return null
  const type = normalizeMemoryType(item.type || inferMemoryType(text))
  if (!type || isBlockedMemoryType(type)) return null
  const scope = normalizeScope(item.scope)
  const source = normalizeSource(item.source)
  return {
    id: String(item.id || uid()),
    type,
    scope,
    text,
    tags: Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean).slice(0, 12) : [],
    enabled: item.enabled !== false,
    source,
    confidence: normalizeConfidence(item.confidence),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso(),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
  }
}

function normalizeMemoryType(type) {
  const value = String(type || '').trim()
  if (SAFE_MEMORY_TYPES.includes(value)) return value
  if (isBlockedMemoryType(value)) return null
  return 'user_preference'
}

function normalizeScope(scope) {
  const value = String(scope || 'hermes').trim()
  return ALLOWED_MEMORY_SCOPES.includes(value) ? value : 'hermes'
}

function normalizeSource(source) {
  const value = String(source || 'explicit').trim()
  if (value === 'explicit_user') return 'explicit'
  return ALLOWED_MEMORY_SOURCES.includes(value) ? value : 'explicit'
}

function normalizeConfidence(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

export function isBlockedMemoryType(type = '') {
  return [
    'blocked_do_not_store',
    'temporary_context',
    'session_summary',
    'tool_result',
    'tool_lesson',
    'raw_error',
    'stdout',
    'stderr',
  ].includes(String(type || '').trim())
}

export function loadHermesMemoryState() {
  const raw = safeReadStorage()
  if (raw) {
    try {
      return normalizeState(JSON.parse(raw))
    } catch {
      return defaultState()
    }
  }
  return normalizeState(memoryFallbackState || defaultState())
}

export function saveHermesMemoryState(state) {
  const next = normalizeState({ ...state, updatedAt: nowIso() })
  safeWriteStorage(next)
  return next
}

export function clearHermesMemories({ confirmed = false } = {}) {
  const state = loadHermesMemoryState()
  if (!confirmed) {
    return saveHermesMemoryState({ ...state, pendingClear: true })
  }
  return saveHermesMemoryState({ ...defaultState(), enabled: state.enabled !== false })
}

export function setHermesMemoryEnabled(enabled) {
  const state = loadHermesMemoryState()
  return saveHermesMemoryState({ ...state, enabled: enabled !== false, pendingClear: false })
}

export function listHermesMemories(options = {}) {
  const state = loadHermesMemoryState()
  const includeDisabled = options.includeDisabled === true
  const items = includeDisabled ? state.items : state.items.filter(item => item.enabled !== false)
  return items.slice()
}

export function addHermesMemory(input = {}) {
  const state = loadHermesMemoryState()
  if (state.enabled === false) return { ok: false, reason: 'memory_disabled' }

  const text = input.text || input.content || ''
  const type = input.type || inferMemoryType(text)
  if (isBlockedMemoryType(type)) return { ok: false, reason: 'blocked_type' }
  if (containsSensitiveMemoryText(text)) return { ok: false, reason: 'sensitive' }
  if (normalizeSource(input.source) !== 'migrated_safe' && !shouldSaveHermesMemory(text)) {
    return { ok: false, reason: 'not_long_term_memory' }
  }

  const item = normalizeMemoryItem({
    id: input.id || uid(),
    type,
    scope: input.scope,
    text,
    tags: input.tags,
    enabled: input.enabled,
    source: input.source || 'explicit',
    confidence: input.confidence,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
  if (!item) return { ok: false, reason: 'empty_or_unsafe' }

  const existing = state.items.find(candidate => memoryFingerprint(candidate) === memoryFingerprint(item))
  const nextItem = existing
    ? { ...existing, ...item, id: existing.id, createdAt: existing.createdAt, updatedAt: nowIso() }
    : item
  const nextItems = [nextItem, ...state.items.filter(candidate => candidate.id !== nextItem.id)]
    .slice(0, HERMES_MEMORY_MAX_ITEMS)

  saveHermesMemoryState({ ...state, pendingClear: false, items: nextItems })
  return { ok: true, item: nextItem }
}

export function updateHermesMemory(id, patch = {}) {
  const state = loadHermesMemoryState()
  const targetId = String(id || '')
  let updated = null
  const items = state.items.map(item => {
    if (item.id !== targetId) return item
    updated = normalizeMemoryItem({
      ...item,
      ...patch,
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: nowIso(),
    })
    return updated || item
  })
  if (!updated) return { ok: false, reason: 'not_found' }
  saveHermesMemoryState({ ...state, items, pendingClear: false })
  return { ok: true, item: updated }
}

export function deleteHermesMemory(id) {
  const state = loadHermesMemoryState()
  const targetId = String(id || '')
  const before = state.items.length
  const items = state.items.filter(item => item.id !== targetId)
  saveHermesMemoryState({ ...state, items, pendingClear: false })
  return { ok: items.length !== before }
}

export function exportHermesMemoryBackup() {
  const state = loadHermesMemoryState()
  return JSON.stringify({
    version: state.version,
    enabled: state.enabled,
    exportedAt: nowIso(),
    memoryPath: getHermesMemoryPath(),
    items: state.items
      .filter(item => !containsSensitiveMemoryText(item.text))
      .map(item => ({ ...item, text: sanitizeMemoryText(item.text) })),
  }, null, 2)
}

function memoryFingerprint(item) {
  return [
    item.type || '',
    item.scope || '',
    String(item.text || '').trim().replace(/\s+/g, ' ').toLowerCase(),
  ].join('|')
}

export function containsSensitiveMemoryText(text = '') {
  const value = String(text || '')
  return (
    /api[_*-]?key|secret|token|bearer|password|passwd|密码|密钥|验证码|银行卡|身份证|手机号/i.test(value) ||
    /\.env|config\.yaml|config\.json/i.test(value) ||
    /sk-[A-Za-z0-9.*_-]+/i.test(value) ||
    /Bearer\s+[A-Za-z0-9._-]+/i.test(value) ||
    /C:\\tmp\\|F:\\|电商1\.0\.2|SuperClaw-1\.0\.4|release-user-package/i.test(value)
  )
}

export function sanitizeMemoryText(text = '') {
  let value = String(text || '').trim()
  if (!value) return ''
  if (containsSensitiveMemoryText(value)) return ''
  value = value
    .replace(/sk-[A-Za-z0-9.*_-]+/gi, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9.*_-]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key\s*[:=]\s*["'][^"']+["']/gi, 'api_key: [REDACTED]')
    .replace(/token\s*[:=]\s*["'][^"']+["']/gi, 'token: [REDACTED]')
    .replace(/password\s*[:=]\s*["'][^"']+["']/gi, 'password: [REDACTED]')
    .replace(/(api[_-]?key|token|secret|password|passwd|pwd|密码|密钥)\s*[:=]\s*["']?[^"'\s,;]+/gi, '$1=[REDACTED]')
    .replace(/C:\\tmp[^\s，。；;]+/gi, '[REDACTED_PATH]')
    .replace(/F:[^\s，。；;]+/gi, '[REDACTED_PATH]')
    .replace(/C:\\Users\\[^\\\r\n]+\\Documents\\[^\r\n]+/gi, '[REDACTED_LOCAL_PATH]')
    .replace(/src-tauri\/resources\/data\/hermes\/config\.yaml/gi, '[REDACTED_CONFIG]')
    .replace(/src-tauri\\resources\\data\\hermes\\config\.yaml/gi, '[REDACTED_CONFIG]')
    .replace(/(?:[A-Za-z0-9+/]{160,}={0,2})/g, '[REDACTED_LARGE_BLOB]')
  value = value.replace(/\s+/g, ' ').trim()
  if (isUnsafeMemoryText(value)) return ''
  return value.slice(0, 500)
}

function isUnsafeMemoryText(text) {
  const value = String(text || '')
  if (!value) return true
  if (/\.(env|env\.local)\b|config\.ya?ml\b|config\.json\b/i.test(value)) return true
  if (/private[_\s-]?key|certificate|session cookie|auth cookie/i.test(value)) return true
  if (/(失败堆栈|stderr|stdout|traceback|exception|error:|raw_error)/i.test(value)) return true
  return false
}

export function shouldSaveHermesMemory(userText = '') {
  const value = String(userText || '').trim()
  if (!value) return false
  if (containsSensitiveMemoryText(value)) return false
  return /记住|以后都|以后给我|默认|我的习惯|我喜欢|我不喜欢|不要再|别再|以后不要|以后别|固定规则|长期规则/i.test(value)
}

function inferMemoryType(text) {
  const value = String(text || '').toLowerCase()
  if (/项目|工程|repo|repository|workspace|分支|branch|固定规则|长期规则/.test(value)) return 'project_rule'
  if (/工具|tool|执行|命令|workflow|流程/.test(value)) return 'workflow_preference'
  if (/agent|助手|身份|风格/.test(value)) return 'agent_rule'
  return 'user_preference'
}

function tokenize(text) {
  return Array.from(new Set(String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
    .slice(0, 80)))
}

export function shouldSkipMemoryForThisTurn(userText = '') {
  return /不要参考记忆|忽略记忆|临时任务|这次不要记|不要用历史|不要用上下文/i.test(String(userText || ''))
}

export function retrieveHermesRelevantMemories(query, options = {}) {
  const state = loadHermesMemoryState()
  if (state.enabled === false) return []
  const limit = Math.max(1, Math.min(Number(options.limit) || HERMES_MEMORY_CONTEXT_LIMIT, 12))
  const terms = tokenize(query)
  const items = state.items
    .filter(item => item.enabled !== false)
    .filter(item => SAFE_MEMORY_TYPES.includes(item.type))
    .filter(item => ALLOWED_MEMORY_SCOPES.includes(item.scope || 'hermes'))
    .filter(item => !containsSensitiveMemoryText(item.text))
  if (!terms.length) return items.slice(0, limit)
  const scored = items.map(item => {
    const haystack = `${item.type} ${item.scope} ${item.tags.join(' ')} ${item.text}`.toLowerCase()
    let score = item.confidence || 0
    for (const term of terms) {
      if (haystack.includes(term)) score += term.length >= 4 ? 2 : 1
    }
    if (item.type === 'user_preference') score += 0.4
    if (item.type === 'project_rule') score += 0.3
    return { item, score }
  })
  return scored
    .filter(row => row.score > 0.8)
    .sort((a, b) => b.score - a.score || String(b.item.updatedAt).localeCompare(String(a.item.updatedAt)))
    .slice(0, limit)
    .map(row => row.item)
}

export function buildHermesMemoryContext(query, options = {}) {
  const state = loadHermesMemoryState()
  if (state.enabled === false) return ''
  if (shouldSkipMemoryForThisTurn(query)) return ''

  const memories = retrieveHermesRelevantMemories(query, options)
    .filter(item => item && item.enabled !== false)
    .filter(item => SAFE_MEMORY_TYPES.includes(item.type))
    .filter(item => ALLOWED_MEMORY_SCOPES.includes(item.scope || 'hermes'))
    .filter(item => !containsSensitiveMemoryText(item.text))
    .slice(0, HERMES_MEMORY_CONTEXT_LIMIT)

  if (!memories.length) return ''
  return [
    '以下是用户长期偏好和项目记忆，只在相关时参考；当前用户指令优先，不要机械复述：',
    ...memories.map(item => `- ${sanitizeMemoryText(item.text)}`),
  ].join('\n')
}

export function getHermesMemorySourceTrace(query, options = {}) {
  return retrieveHermesRelevantMemories(query, options).map(item => ({
    id: item.id,
    type: item.type,
    scope: item.scope,
    source: item.source,
    updatedAt: item.updatedAt,
    text: sanitizeMemoryText(item.text),
  }))
}

export function classifyHermesMemoryCommand(text) {
  const value = String(text || '').trim()
  if (!value) return { action: 'none' }
  if (value === HERMES_MEMORY_CONFIRM_CLEAR) return { action: 'confirm_clear' }
  if (/^(你)?(现在)?(记住了什么|有什么记忆|列出记忆|查看记忆|显示记忆)/.test(value)) return { action: 'list' }
  if (/^(导出记忆|备份记忆|导出 Hermes 记忆)/i.test(value)) return { action: 'export' }
  if (/^(关闭|停用|禁用).{0,6}记忆/.test(value)) return { action: 'disable' }
  if (/^(开启|启用|打开).{0,6}记忆/.test(value)) return { action: 'enable' }
  if (/^(清空|全部删除|删除全部).{0,6}记忆/.test(value)) return { action: 'clear' }
  const forgetMatch = value.match(/^(忘记|删除记忆|移除记忆)[:：\s]*(.+)$/)
  if (forgetMatch) return { action: 'delete_by_text', text: forgetMatch[2].trim() }
  const addMatch = value.match(/^(记住|请记住|帮我记住|以后记住|保存记忆)[:：\s]*(.+)$/)
  if (addMatch) return { action: 'add', text: addMatch[2].trim() }
  if (/以后(都|默认)?|我的习惯|我喜欢|我不喜欢|不要再|别再/.test(value) && /记住|默认|以后|习惯|偏好|喜欢|不喜欢|不要|别再/.test(value)) {
    return { action: 'add', text: value }
  }
  return { action: 'none' }
}

export function handleHermesMemoryCommand(text) {
  const command = classifyHermesMemoryCommand(text)
  if (command.action === 'none') return null
  if (command.action === 'list') {
    const state = loadHermesMemoryState()
    const items = listHermesMemories().slice(0, 12)
    if (state.enabled === false) return '记忆功能当前已关闭。'
    if (!items.length) return '当前没有保存的 Hermes 记忆。'
    return [
      `当前保存了 ${items.length} 条 Hermes 记忆：`,
      ...items.map((item, index) => `${index + 1}. ${sanitizeMemoryText(item.text)}`),
    ].join('\n')
  }
  if (command.action === 'export') {
    return `记忆备份如下：\n\n\`\`\`json\n${exportHermesMemoryBackup()}\n\`\`\``
  }
  if (command.action === 'disable') {
    setHermesMemoryEnabled(false)
    return '记忆已关闭，后续不会注入或保存新记忆。'
  }
  if (command.action === 'enable') {
    setHermesMemoryEnabled(true)
    return '记忆已开启。'
  }
  if (command.action === 'clear') {
    clearHermesMemories({ confirmed: false })
    return '你确定要清空所有 Hermes 记忆吗？请回复“确认清空记忆”继续。'
  }
  if (command.action === 'confirm_clear') {
    const state = loadHermesMemoryState()
    if (!state.pendingClear) return '当前没有待确认的清空记忆操作。'
    clearHermesMemories({ confirmed: true })
    return 'Hermes 记忆已清空。'
  }
  if (command.action === 'delete_by_text') {
    const needle = String(command.text || '').trim().toLowerCase()
    const items = listHermesMemories({ includeDisabled: true })
    const target = items.find(item => item.id === needle || item.text.toLowerCase().includes(needle))
    if (!target) return '没有找到相关记忆。'
    deleteHermesMemory(target.id)
    return '已忘记相关记忆。'
  }
  if (command.action === 'add') {
    const result = addHermesMemory({ text: command.text, source: 'explicit' })
    if (result.reason === 'memory_disabled') return '记忆已关闭，未写入。'
    if (!result.ok) return '这条内容不适合保存为记忆，我没有写入。'
    return '已记住。'
  }
  return null
}

export function resetHermesMemoryStoreForTest() {
  memoryFallbackState = defaultState()
  if (hasStorage()) {
    try { localStorage.removeItem(HERMES_MEMORY_STORAGE_KEY) } catch {}
  }
}
