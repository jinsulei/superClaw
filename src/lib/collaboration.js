const TASKS_KEY = 'superclaw-collab-tasks-v1'
const PENDING_KEY = 'superclaw-collab-pending-dispatch-v1'

export const COLLAB_TARGETS = {
  openclaw: 'openclaw',
  claudeCode: 'claude-code',
  hermes: 'hermes',
}

export function listCollaborationTasks() {
  try {
    const rows = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
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
  const task = {
    id: `collab-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    goal,
    title: input.title || shortGoal(goal),
    source: input.source || COLLAB_TARGETS.hermes,
    executor: input.executor || COLLAB_TARGETS.openclaw,
    reviewer: input.reviewer || COLLAB_TARGETS.claudeCode,
    plan: Array.isArray(input.plan) && input.plan.length ? input.plan : splitCollaborationTask(goal, input),
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
  }
  return saveCollaborationTask(task)
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
    steps.push('桌面端优先：先枚举并激活用户已打开的本地 App 窗口，必要时截图读取画面；找不到窗口时再说明原因并建议网页兜底。')
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
        '- 如果目标是抖音/快手/小红书等桌面客户端，优先操作用户已经打开的桌面客户端；只有找不到客户端或无法激活时，才说明原因并建议 fallback 到网页。',
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
  const payload = {
    ...dispatch,
    createdAt: Date.now(),
  }
  const queue = readPendingQueue()
    .filter(item => !(item?.taskId === payload.taskId && item?.target === payload.target && item?.stage === payload.stage))
  queue.push(payload)
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue.slice(-20)))
  return payload
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
