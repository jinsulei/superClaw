const TASKS_KEY = 'superclaw-collab-tasks-v1'
const PENDING_KEY = 'superclaw-collab-pending-dispatch-v1'
const MESSAGES_KEY = 'superclaw-agent-task-messages-v1'
const MEMORY_KEY = 'superclaw-shared-agent-memory-v1'

export const SHARED_MEMORY_CONFIG = {
  enabled: true,
  store: 'local',
  portable: true,
  path: 'data/memory',
  maxRecentMessages: 50,
  maxSummaryLength: 8000,
  persistTaskContext: true,
  persistAgentMessages: true,
  sharedForAgents: ['hermes', 'openclaw', 'claude_code'],
}

export const COLLAB_TARGETS = {
  openclaw: 'openclaw',
  claudeCode: 'claude-code',
  hermes: 'hermes',
}

export const CLAUDE_CODE_MODES = {
  safe: 'safe',
  browserAutomation: 'browser_automation',
  takeover: 'takeover',
}

const CLAUDE_CODE_MODE_ALIASES = {
  safe: CLAUDE_CODE_MODES.safe,
  restricted: CLAUDE_CODE_MODES.safe,
  browser: CLAUDE_CODE_MODES.browserAutomation,
  browsermode: CLAUDE_CODE_MODES.browserAutomation,
  browserautomation: CLAUDE_CODE_MODES.browserAutomation,
  browser_automation: CLAUDE_CODE_MODES.browserAutomation,
  automation: CLAUDE_CODE_MODES.browserAutomation,
  browser_only: CLAUDE_CODE_MODES.browserAutomation,
  takeover: CLAUDE_CODE_MODES.takeover,
  full_control: CLAUDE_CODE_MODES.takeover,
}

export const CLAUDE_CODE_ECOMMERCE_ASSIST_SCOPE = Object.freeze({
  runtime_chain: 'user -> Hermes -> OpenClaw -> browser/desktop -> screenshot/result -> Hermes -> user confirmation',
  claude_code_role: 'dev_debug_test_package_assistant',
  allowed: [
    'source_inspection',
    'bug_fixing',
    'smoke_tests',
    'build_verification',
    'exe_packaging',
    'skills_plugins_config',
    'openclaw_hermes_failure_diagnosis',
  ],
  forbidden_runtime_actions: [
    'doudian_listing',
    'publish',
    'upload',
    'payment',
    'comment',
    'live_reply_send',
    'like',
    'follow',
    'private_message',
    'restricted_download',
  ],
})

const CLAUDE_CODE_DEV_ASSIST_RE = /源码|代码|修\s*bug|bug|smoke|测试|test|build|构建|打包|EXE|exe|skills?|插件|配置|诊断|调试|debug|日志|报错|失败|检查|验证|package|release/i
const ECOMMERCE_DOMAIN_RE = /电商|抖店|抖音|douyin|快手|kuaishou|小红书|xiaohongshu|视频号|微信视频号|直播|公屏|弹幕|商品|店铺|橱窗|小黄车|热词|种草|素材库|巡检|爆款/i
const ECOMMERCE_RUNTIME_ACTION_RE = /打开|搜索|查询|查|读取|截图|输入|填写|上传|发布|提交|上架|付款|评论|回复|公屏回复|私信|点赞|关注|下载|刷视频|巡检|拆解|保存素材|生成话术|生成标题|执行|操作/i

export function classifyClaudeCodeEcommercePolicy(input = {}) {
  const text = collectPolicyText(input)
  const hasEcommerceDomain = ECOMMERCE_DOMAIN_RE.test(text)
  const hasRuntimeAction = ECOMMERCE_RUNTIME_ACTION_RE.test(text)
  const isDevAssist = CLAUDE_CODE_DEV_ASSIST_RE.test(text)
  const blocked = hasEcommerceDomain && hasRuntimeAction && !isDevAssist

  return {
    blocked,
    reason: blocked ? 'CLAUDE_CODE_ECOMMERCE_RUNTIME_BLOCKED' : 'CLAUDE_CODE_SCOPE_OK',
    runtime_chain: CLAUDE_CODE_ECOMMERCE_ASSIST_SCOPE.runtime_chain,
    claude_code_role: CLAUDE_CODE_ECOMMERCE_ASSIST_SCOPE.claude_code_role,
    message: blocked
      ? 'Claude Code is limited to dev/debug/test/package assistance for ecommerce. Runtime ecommerce actions must go through Hermes -> OpenClaw -> browser/desktop -> Hermes -> user confirmation.'
      : '',
  }
}

export function isClaudeCodeEcommerceRuntimeBlocked(input = {}) {
  return classifyClaudeCodeEcommercePolicy(input).blocked
}

export function routeEcommerceCollaborationTargets(input = {}) {
  const executor = normalizeAgentId(input.executor || COLLAB_TARGETS.openclaw)
  const reviewer = normalizeAgentId(input.reviewer || COLLAB_TARGETS.claudeCode)
  const policy = classifyClaudeCodeEcommercePolicy(input)
  let nextExecutor = executor
  let nextReviewer = reviewer
  const notices = []

  if (policy.blocked && executor === COLLAB_TARGETS.claudeCode) {
    nextExecutor = COLLAB_TARGETS.openclaw
    notices.push('executor_routed_from_claude_code_to_openclaw')
  }

  if (policy.blocked && reviewer === COLLAB_TARGETS.claudeCode) {
    nextReviewer = COLLAB_TARGETS.hermes
    notices.push('reviewer_routed_from_claude_code_to_hermes')
  }

  return {
    executor: nextExecutor,
    reviewer: nextReviewer,
    policy,
    changed: nextExecutor !== executor || nextReviewer !== reviewer,
    notices,
  }
}

export function normalizeClaudeCodeMode(input = {}) {
  const raw = typeof input === 'string' ? input : (input.mode || input.claudeCodeMode || input.permission_mode || input.permissionMode || '')
  const key = String(raw || CLAUDE_CODE_MODES.safe).trim().replace(/[-\s]+/g, '_').toLowerCase()
  const mode = CLAUDE_CODE_MODE_ALIASES[key] || CLAUDE_CODE_MODE_ALIASES[key.replace(/_/g, '')] || CLAUDE_CODE_MODES.safe
  const unknown = !!raw && !CLAUDE_CODE_MODE_ALIASES[key] && !CLAUDE_CODE_MODE_ALIASES[key.replace(/_/g, '')]
  if (mode === CLAUDE_CODE_MODES.takeover) {
    return { mode, permission_level: 'full_control', requires_confirmation: true, warning: unknown ? 'unknown_mode_fallback_to_safe' : null }
  }
  if (mode === CLAUDE_CODE_MODES.browserAutomation) {
    return {
      mode,
      permission_level: 'browser_only',
      requires_confirmation: false,
      single_browser: true,
      single_page: true,
      allow_popup: false,
      requires_confirmation_for_extra_page: true,
      warning: unknown ? 'unknown_mode_fallback_to_safe' : null,
    }
  }
  return { mode: CLAUDE_CODE_MODES.safe, permission_level: 'restricted', requires_confirmation: false, warning: unknown ? 'unknown_mode_fallback_to_safe' : null }
}

export function listCollaborationTasks() {
  try {
    const rows = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

export function listAgentTaskMessages(filter = {}) {
  try {
    const rows = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]')
    const list = Array.isArray(rows) ? rows : []
    return list.filter(item => {
      if (filter.toAgent && item.to_agent !== filter.toAgent) return false
      if (filter.fromAgent && item.from_agent !== filter.fromAgent) return false
      if (filter.taskId && item.task_id !== filter.taskId) return false
      if (filter.messageType && item.message_type !== filter.messageType) return false
      return true
    })
  } catch {
    return []
  }
}

export function listSharedMemory(filter = {}) {
  try {
    const rows = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]')
    const list = Array.isArray(rows) ? rows : []
    return list.filter(item => {
      if (filter.sessionId && item.session_id !== filter.sessionId) return false
      if (filter.taskId && item.task_id !== filter.taskId) return false
      if (filter.agent && item.from_agent !== filter.agent && item.to_agent !== filter.agent) return false
      return true
    })
  } catch {
    return []
  }
}

export function buildTaskContext(input = {}) {
  const sessionId = input.session_id || input.sessionId || input.session?.id || getDefaultSessionId()
  const taskId = input.task_id || input.taskId || ''
  const base = normalizeContext(input.context || {})
  const history = listAgentTaskMessages({ taskId }).slice(0, SHARED_MEMORY_CONFIG.maxRecentMessages)
  const recent = base.recent_messages.length ? base.recent_messages : history.map(item => ({
    from_agent: item.from_agent,
    to_agent: item.to_agent,
    message_type: item.message_type,
    status: item.status,
    title: item.title,
    content: item.content,
    created_at: item.created_at,
  }))
  const artifacts = mergeArtifacts(base.artifacts, input.artifacts)
  return {
    summary: clampText(base.summary || input.summary || shortGoal(input.content || input.title || taskId, 120), SHARED_MEMORY_CONFIG.maxSummaryLength),
    recent_messages: recent.slice(0, SHARED_MEMORY_CONFIG.maxRecentMessages),
    important_facts: Array.isArray(base.important_facts) ? base.important_facts.slice(0, 100) : [],
    artifacts,
    session_id: sessionId,
    task_id: taskId,
  }
}

export function saveAgentTaskMessage(message = {}) {
  const now = new Date().toISOString()
  const taskId = message.task_id || message.taskId || `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const sessionId = message.session_id || message.sessionId || getDefaultSessionId()
  const fromAgent = normalizeAgentId(message.from_agent || message.fromAgent || COLLAB_TARGETS.hermes)
  const requestedToAgent = normalizeAgentId(message.to_agent || message.toAgent || COLLAB_TARGETS.hermes)
  const messageType = message.message_type || message.messageType || (message.memory_update ? 'memory_update' : 'task_result')
  const policy = requestedToAgent === COLLAB_TARGETS.claudeCode && messageType === 'task_request'
    ? classifyClaudeCodeEcommercePolicy(message)
    : null
  const toAgent = policy?.blocked ? COLLAB_TARGETS.hermes : requestedToAgent
  const isClaudeMessage = fromAgent === COLLAB_TARGETS.claudeCode || toAgent === COLLAB_TARGETS.claudeCode || !!message.mode || !!message.claudeCodeMode
  const modeInfo = isClaudeMessage ? normalizeClaudeCodeMode(message) : null
  const artifacts = normalizeArtifacts(message.artifacts)
  const context = buildTaskContext({ ...message, task_id: taskId, session_id: sessionId, artifacts })
  const content = policy?.blocked
    ? `${String(message.content || '')}\n\n[policy] ${policy.message}`
    : String(message.content || '')
  const row = {
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: message.parent_task_id || message.parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    requested_to_agent: policy?.blocked ? requestedToAgent : null,
    message_type: messageType,
    mode: modeInfo?.mode || message.mode || null,
    permission_level: modeInfo?.permission_level || message.permission_level || message.permissionLevel || null,
    requires_confirmation: modeInfo ? !!modeInfo.requires_confirmation : !!(message.requires_confirmation || message.requiresConfirmation),
    mode_warning: modeInfo?.warning || message.mode_warning || message.modeWarning || null,
    policy_blocked: !!policy?.blocked,
    policy_reason: policy?.blocked ? policy.reason : null,
    runtime_chain: policy?.blocked ? policy.runtime_chain : null,
    tool: message.tool || null,
    status: policy?.blocked ? 'blocked' : (message.status || 'completed'),
    title: message.title || shortGoal(message.content || taskId),
    content,
    context,
    artifacts,
    created_at: message.created_at || now,
    updated_at: now,
  }
  const rows = listAgentTaskMessages()
    .filter(item => !(item.task_id === row.task_id && item.message_type === row.message_type && item.from_agent === row.from_agent && item.content === row.content))
  rows.unshift(row)
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(rows.slice(0, 200)))
  saveSharedMemoryEntry(row)
  window.dispatchEvent(new CustomEvent('superclaw-agent-task-message', { detail: row }))
  return row
}

export function createTaskRequest({ fromAgent, toAgent, title, content, parentTaskId, taskId, sessionId, context, artifacts, mode, permission_level, permissionLevel, requires_confirmation, requiresConfirmation } = {}) {
  return saveAgentTaskMessage({
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    mode,
    permission_level: permission_level || permissionLevel,
    requires_confirmation: requires_confirmation ?? requiresConfirmation,
    message_type: 'task_request',
    status: 'pending',
    title,
    content,
    context,
    artifacts,
  })
}

export function createTaskProgress({ fromAgent, toAgent, title, content, parentTaskId, taskId, sessionId, context, artifacts, mode, permission_level, permissionLevel, requires_confirmation, requiresConfirmation } = {}) {
  return saveAgentTaskMessage({
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    mode,
    permission_level: permission_level || permissionLevel,
    requires_confirmation: requires_confirmation ?? requiresConfirmation,
    message_type: 'task_progress',
    status: 'running',
    title,
    content,
    context,
    artifacts,
  })
}

export function createTaskResult({ fromAgent, toAgent, title, content, parentTaskId, taskId, sessionId, context, artifacts, failed = false, tool = null, mode, permission_level, permissionLevel, requires_confirmation, requiresConfirmation } = {}) {
  return saveAgentTaskMessage({
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    mode,
    permission_level: permission_level || permissionLevel,
    requires_confirmation: requires_confirmation ?? requiresConfirmation,
    message_type: failed ? 'task_error' : 'task_result',
    tool,
    status: failed ? 'failed' : 'completed',
    title,
    content,
    context,
    artifacts,
  })
}

export function createTaskDelegate({ fromAgent, toAgent = COLLAB_TARGETS.hermes, title, content, parentTaskId, taskId, sessionId, context, artifacts, mode, permission_level, permissionLevel, requires_confirmation, requiresConfirmation } = {}) {
  return saveAgentTaskMessage({
    session_id: sessionId,
    task_id: taskId,
    parent_task_id: parentTaskId || null,
    from_agent: fromAgent,
    to_agent: toAgent,
    mode,
    permission_level: permission_level || permissionLevel,
    requires_confirmation: requires_confirmation ?? requiresConfirmation,
    message_type: 'task_delegate',
    status: 'delegated',
    title,
    content,
    context,
    artifacts,
  })
}

export function saveCollaborationTask(task) {
  const rows = listCollaborationTasks().filter(item => item.id !== task.id)
  rows.unshift(task)
  localStorage.setItem(TASKS_KEY, JSON.stringify(rows.slice(0, 100)))
  return task
}

export function updateCollaborationTask(id, patch = {}) {
  const rows = listCollaborationTasks()
  const idx = rows.findIndex(item => item.id === id)
  if (idx < 0) return null
  rows[idx] = { ...rows[idx], ...patch, updatedAt: Date.now() }
  localStorage.setItem(TASKS_KEY, JSON.stringify(rows.slice(0, 100)))
  return rows[idx]
}

export function createCollaborationTask(input = {}) {
  const goal = String(input.goal || '').trim()
  const createdAt = Date.now()
  const claudeMode = normalizeClaudeCodeMode(input.claudeCodeMode || input.mode || CLAUDE_CODE_MODES.safe)
  const routed = routeEcommerceCollaborationTargets(input)
  const sessionId = input.session_id || input.sessionId || getDefaultSessionId()
  const context = buildTaskContext({ ...input, session_id: sessionId, content: goal })
  const task = {
    id: `collab-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    session_id: sessionId,
    goal,
    title: input.title || shortGoal(goal),
    source: input.source || COLLAB_TARGETS.hermes,
    executor: routed.executor,
    reviewer: routed.reviewer,
    requestedExecutor: input.executor || COLLAB_TARGETS.openclaw,
    requestedReviewer: input.reviewer || COLLAB_TARGETS.claudeCode,
    policyReason: routed.policy.reason,
    policyNotices: routed.notices,
    claudeCodeMode: claudeMode.mode,
    claudeCodePermissionLevel: claudeMode.permission_level,
    claudeCodeRequiresConfirmation: claudeMode.requires_confirmation,
    context,
    artifacts: normalizeArtifacts(input.artifacts),
    plan: Array.isArray(input.plan) && input.plan.length ? input.plan : splitCollaborationTask(goal, input),
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
  }
  return saveCollaborationTask(task)
}

export function getDefaultSessionId() {
  try {
    const key = 'superclaw-active-agent-session-id'
    let current = localStorage.getItem(key)
    if (!current) {
      current = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem(key, current)
    }
    return current
  } catch {
    return `session-${Date.now().toString(36)}`
  }
}

function normalizeAgentId(agent) {
  const value = String(agent || '').trim()
  if (value === COLLAB_TARGETS.claudeCode || value === 'claude_code' || value === 'claudeCode') return COLLAB_TARGETS.claudeCode
  if (value === COLLAB_TARGETS.openclaw) return COLLAB_TARGETS.openclaw
  if (value === COLLAB_TARGETS.hermes) return COLLAB_TARGETS.hermes
  return value || COLLAB_TARGETS.hermes
}

function collectPolicyText(input = {}) {
  if (typeof input === 'string') return input
  const value = input && typeof input === 'object' ? input : {}
  const context = value.context && typeof value.context === 'object' ? value.context : {}
  const parts = [
    value.goal,
    value.title,
    value.content,
    value.message,
    value.summary,
    context.summary,
    ...(Array.isArray(context.important_facts) ? context.important_facts : []),
    ...(Array.isArray(value.important_facts) ? value.important_facts : []),
  ]
  return parts.filter(Boolean).join('\n')
}

export function shortGoal(text, maxLen = 24) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return '协作任务'
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw
}

export function targetLabel(target) {
  if (target === COLLAB_TARGETS.openclaw) return 'OpenClaw'
  if (target === COLLAB_TARGETS.claudeCode) return 'Claude Code'
  if (target === COLLAB_TARGETS.hermes) return 'Hermes'
  return target || 'Agent'
}

function hasDesktopGoal(text) {
  const raw = String(text || '')
  return /(桌面端|客户端|本地应用|应用程序|\bapp\b|抖音|快手|小红书|飞书|钉钉|微信|QQ)/i.test(raw)
}

function hasRecurringGoal(text) {
  const raw = String(text || '')
  return /(每\s*\d+\s*(秒|分钟|小时|天)|定时|循环|轮询|持续|一直|自动换)/i.test(raw)
}

function hasCodeGoal(text) {
  const raw = String(text || '')
  return /(代码|源码|文件|修复|修改|构建|打包|测试|接口|报错|bug|编译|仓库|git)/i.test(raw)
}

function hasVisionGoal(text) {
  const raw = String(text || '')
  return /(图片|截图|画面|识别|红框|粘贴|视觉|图里|图中)/i.test(raw)
}

export function splitCollaborationTask(goal, input = {}) {
  const raw = String(goal || '').trim()
  const executor = targetLabel(input.executor || COLLAB_TARGETS.openclaw)
  const reviewer = targetLabel(input.reviewer || COLLAB_TARGETS.claudeCode)
  const steps = [
    `确认目标和上下文：读取当前会话、项目路径、已有配置和用户明确限制，先复述要解决的问题。`,
  ]

  if (hasDesktopGoal(raw)) {
    steps.push('桌面端优先：先枚举并激活用户已打开的本地 App 窗口，必要时截图读取画面；如果只在托盘/后台发现痕迹，不要判定未打开，先要求恢复/激活可见窗口，再决定是否网页兜底。')
  }
  if (hasVisionGoal(raw)) {
    steps.push('图片/截图处理：把粘贴或上传的图片作为视觉输入读取，提取关键文字、按钮、错误和用户标注区域。')
  }
  if (hasCodeGoal(raw)) {
    steps.push('代码与文件处理：定位相关源码/配置，最小范围修改，避免改动无关文件或覆盖用户本地配置。')
  }
  if (hasRecurringGoal(raw)) {
    steps.push('持续/定时处理：先跑通一次完整流程并回报，再判断是否需要后台定时任务或轮询执行器。')
  }

  steps.push(`${executor} 执行：按子任务逐项完成，并输出修改文件、命令、截图/日志或失败原因。`)
  steps.push(`${reviewer} 验收：对照验收标准复核，明确通过/不通过/需要补充。`)
  steps.push('Hermes 终审：读取执行和验收结果，给出最终结论、残留风险和下一步建议。')
  return steps
}

function renderTaskPlan(task) {
  const plan = Array.isArray(task.plan) && task.plan.length ? task.plan : splitCollaborationTask(task.goal, task)
  return plan.map((item, index) => `${index + 1}. ${item}`).join('\n')
}

export function buildExecutionBrief(task) {
  const executor = targetLabel(task.executor)
  const reviewer = targetLabel(task.reviewer)
  const desktopGoal = hasDesktopGoal(task.goal)
  const recurringGoal = hasRecurringGoal(task.goal)
  const executionKickoff = []
  if (task.executor === COLLAB_TARGETS.claudeCode) {
    executionKickoff.push(
      '## Claude Code scope',
      '- Claude Code is only for source inspection, bug fixes, smoke tests, build verification, EXE packaging, Skills/plugin config, and OpenClaw/Hermes failure diagnosis.',
      '- Do not use Claude Code to execute ecommerce runtime actions such as Doudian listing, publishing, uploading, payment, commenting, live public-screen replies, likes, follows, private messages, or restricted downloads.',
      `- Ecommerce runtime chain: ${CLAUDE_CODE_ECOMMERCE_ASSIST_SCOPE.runtime_chain}.`,
      '',
    )
  }
  if (task.executor === COLLAB_TARGETS.openclaw) {
    executionKickoff.push(
      '## 执行启动要求',
      '- 这是一张执行任务单，不是咨询问题。收到后必须立即开始执行，不能只回复“我看看”“我来处理”。',
      '- 如果当前工具无法完成，必须明确说明缺少哪个工具/插件/权限，以及下一步需要用户如何授权或补齐。',
    )
    if (desktopGoal) {
      executionKickoff.push(
        '- 本任务明确涉及桌面端/客户端/本地 App。第一步必须尝试调用 desktop_control，先 action=list_windows 查找目标窗口，再 activate 目标窗口。',
        '- 不要优先改用浏览器，也不要把 <tool_call>、XML 或伪工具调用当作普通文字输出。',
        '- 如果目标是抖音/快手/小红书等桌面客户端，优先操作用户已经打开的桌面客户端；任务栏托盘里有图标但没有展开窗口时，不能判定“未打开”，应说明当前桌面工具只能枚举可见窗口，并让用户恢复/激活主窗口后继续。',
        '- 只有桌面客户端确实无法激活，且用户同意网页兜底时，才改用浏览器。浏览器自动化必须复用同一个专用窗口/标签，禁止反复打开多个浏览器或多个独立页面。',
        '- 如果任务需要读取画面中的价格、数量、直播间信息，激活窗口后必须调用 desktop_control 的 action=screenshot，并基于返回的图片结果继续分析；如果截图失败，明确说明失败原因，不能编造采集结果。',
      )
    }
    if (recurringGoal) {
      executionKickoff.push(
        '- 本任务包含定时/循环要求。先完成一次可执行流程验证并回报结果；持续每 N 分钟执行需要后台定时执行器支持，不能只靠一次聊天消息长期运行。',
      )
    }
    executionKickoff.push('')
  }
  return [
    '# Hermes 协作任务单',
    '',
    `任务编号：${task.id}`,
    `执行方：${executor}`,
    `验收方：${reviewer}`,
    `最终审核：Hermes`,
    '',
    '## 目标',
    task.goal || '（未填写）',
    '',
    '## Hermes 拆分的子任务',
    renderTaskPlan(task),
    '',
    ...executionKickoff,
    '## 执行规则',
    '1. 先读取当前上下文和相关文件，再动手。',
    '2. 只做本任务相关改动，不要改无关文件。',
    '3. 如果需要浏览器、桌面控制、截图识别、文件读写或命令执行，只在用户意图明确时调用对应能力。',
    '4. 如果缺少工具、插件、skills 或权限，先说明缺什么和风险，再询问是否安装或启用。',
    '5. 做完后必须给出可验收结果，不要停在“我看看”。',
    '',
    '## 交接格式',
    '- 完成内容：',
    '- 修改文件：',
    '- 运行命令 / 测试结果：',
    '- 发现的问题：',
    '- 需要 Hermes 最终审核的点：',
  ].join('\n')
}

export function buildReviewBrief(task, executionSummary = '') {
  return [
    '# Hermes 协作验收单',
    '',
    `任务编号：${task.id}`,
    `执行方：${targetLabel(task.executor)}`,
    `验收方：${targetLabel(task.reviewer)}`,
    '',
    '## 原始目标',
    task.goal || '（未填写）',
    '',
    '## Hermes 拆分的子任务',
    renderTaskPlan(task),
    '',
    '## 执行方交接',
    executionSummary || '请读取执行会话中的交接内容。',
    '',
    '## 验收要求',
    '1. 对照目标检查是否完成。',
    '2. 检查是否有明显回归、漏改、路径错误、配置污染或密钥泄露。',
    '3. 明确给出：通过 / 不通过 / 需要补充修改。',
    '4. 最后交给 Hermes 做最终审核。',
  ].join('\n')
}

export function setPendingDispatch(dispatch) {
  const requestedTarget = normalizeAgentId(dispatch?.target || COLLAB_TARGETS.hermes)
  const policy = requestedTarget === COLLAB_TARGETS.claudeCode ? classifyClaudeCodeEcommercePolicy(dispatch) : null
  const target = policy?.blocked ? COLLAB_TARGETS.hermes : requestedTarget
  const modeInfo = target === COLLAB_TARGETS.claudeCode ? normalizeClaudeCodeMode(dispatch) : null
  const sessionId = dispatch?.session_id || dispatch?.sessionId || getDefaultSessionId()
  const context = buildTaskContext({ ...dispatch, session_id: sessionId, task_id: dispatch?.taskId || dispatch?.task_id, content: dispatch?.message || dispatch?.content })
  const payload = {
    ...dispatch,
    target,
    requestedTarget: policy?.blocked ? requestedTarget : null,
    session_id: sessionId,
    context,
    artifacts: normalizeArtifacts(dispatch?.artifacts),
    message: policy?.blocked
      ? `${policy.message}\n\n${dispatch?.message || dispatch?.content || ''}`
      : dispatch?.message,
    mode: modeInfo?.mode || dispatch?.mode,
    permission_level: modeInfo?.permission_level || dispatch?.permission_level,
    requires_confirmation: modeInfo ? !!modeInfo.requires_confirmation : !!dispatch?.requires_confirmation,
    mode_warning: modeInfo?.warning || dispatch?.mode_warning || null,
    policy_blocked: !!policy?.blocked,
    policy_reason: policy?.blocked ? policy.reason : null,
    runtime_chain: policy?.blocked ? policy.runtime_chain : null,
    createdAt: Date.now(),
  }
  const queue = readPendingQueue()
    .filter(item => !(item?.taskId === payload.taskId && item?.target === payload.target && item?.stage === payload.stage))
  queue.push(payload)
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue.slice(-20)))
  return payload
}

function normalizeContext(context = {}) {
  const value = context && typeof context === 'object' ? context : {}
  return {
    summary: clampText(value.summary || '', SHARED_MEMORY_CONFIG.maxSummaryLength),
    recent_messages: Array.isArray(value.recent_messages) ? value.recent_messages.slice(0, SHARED_MEMORY_CONFIG.maxRecentMessages) : [],
    important_facts: Array.isArray(value.important_facts) ? value.important_facts : [],
    artifacts: normalizeArtifacts(value.artifacts),
  }
}

function normalizeArtifacts(input = []) {
  const list = Array.isArray(input) ? input : []
  return list
    .filter(Boolean)
    .map(item => {
      const rawPath = String(item.path || item.relativePath || '').replace(/\\/g, '/')
      return {
        type: item.type || 'file',
        path: stripAbsolutePath(rawPath),
        text: item.text || item.content || '',
        created_at: item.created_at || item.createdAt || new Date().toISOString(),
      }
    })
}

function mergeArtifacts(...groups) {
  const seen = new Set()
  const merged = []
  for (const item of groups.flatMap(group => normalizeArtifacts(group))) {
    const key = `${item.type}:${item.path}:${item.text.slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged.slice(0, 100)
}

function stripAbsolutePath(path) {
  const raw = String(path || '')
  if (!raw) return ''
  const normalized = raw.replace(/\\/g, '/')
  const idx = normalized.toLowerCase().lastIndexOf('/resources/data/')
  if (idx >= 0) return normalized.slice(idx + '/resources/'.length)
  if (/^[a-z]:\//i.test(normalized)) return normalized.split('/').slice(-2).join('/')
  if (normalized.startsWith('/')) return normalized.split('/').slice(-2).join('/')
  return normalized
}

function clampText(text, maxLen) {
  const raw = String(text || '').trim()
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw
}

function saveSharedMemoryEntry(row) {
  if (!SHARED_MEMORY_CONFIG.enabled) return
  const entry = {
    session_id: row.session_id,
    task_id: row.task_id,
    parent_task_id: row.parent_task_id,
    from_agent: row.from_agent,
    to_agent: row.to_agent,
    mode: row.mode || 'normal',
    message_type: row.message_type,
    status: row.status,
    title: row.title,
    content: row.content,
    context: row.context,
    artifacts: row.artifacts,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
  const rows = listSharedMemory()
    .filter(item => !(item.task_id === entry.task_id && item.message_type === entry.message_type && item.from_agent === entry.from_agent && item.content === entry.content))
  rows.unshift(entry)
  localStorage.setItem(MEMORY_KEY, JSON.stringify(rows.slice(0, 500)))
  persistPortableSharedMemory(rows.slice(0, 500))
}

let portableMemoryWritePending = false
function persistPortableSharedMemory(rows) {
  if (portableMemoryWritePending || typeof window === 'undefined') return
  if (!window.__TAURI_INTERNALS__ && !window.__TAURI__) return
  portableMemoryWritePending = true
  setTimeout(async () => {
    portableMemoryWritePending = false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('shared_memory_write', { content: JSON.stringify(rows, null, 2) })
    } catch (err) {
      console.warn('[collaboration] shared memory portable write failed:', err)
    }
  }, 50)
}

function routeForTarget(target) {
  if (target === COLLAB_TARGETS.openclaw) return '/chat'
  if (target === COLLAB_TARGETS.claudeCode) return '/h/claude-code'
  if (target === COLLAB_TARGETS.hermes) return '/h/chat'
  return '/'
}

function appUrlForRoute(route) {
  const cleanRoute = String(route || '/').startsWith('/') ? route : `/${route}`
  const base = `${window.location.origin || ''}${window.location.pathname || '/'}${window.location.search || ''}`
  return `${base}#${cleanRoute}`
}

export async function openCollaborationPanel(target, taskId, options = {}) {
  const route = routeForTarget(target)
  const label = `superclaw-${target}-${taskId || Date.now()}`
  const title = options.title || `${targetLabel(target)} 控制面板`
  const url = appUrlForRoute(route)

  if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const existing = await WebviewWindow.getByLabel(label).catch(() => null)
      if (existing) {
        await existing.setFocus().catch(() => {})
        return { mode: 'tauri', reused: true, label, url }
      }
      const child = new WebviewWindow(label, {
        url,
        title,
        width: options.width || 1320,
        height: options.height || 860,
        minWidth: 980,
        minHeight: 680,
        resizable: true,
        center: true,
      })
      child.once('tauri://created', () => {})
      child.once('tauri://error', () => {})
      return { mode: 'tauri', reused: false, label, url }
    } catch (err) {
      console.warn('[collaboration] Tauri window open failed, fallback to window.open:', err)
    }
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer,width=1320,height=860')
  return { mode: 'browser', reused: false, label, url, opened: !!opened }
}

export function peekPendingDispatch() {
  return readPendingQueue()[0] || null
}

function readPendingQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
    if (Array.isArray(raw)) return raw.filter(Boolean)
    return raw?.target ? [raw] : []
  } catch {
    return []
  }
}

export function consumePendingDispatch(target) {
  const queue = readPendingQueue()
  const idx = queue.findIndex(item => item?.target === target)
  if (idx < 0) return null
  const [pending] = queue.splice(idx, 1)
  if (queue.length) localStorage.setItem(PENDING_KEY, JSON.stringify(queue))
  else localStorage.removeItem(PENDING_KEY)
  return pending
}
