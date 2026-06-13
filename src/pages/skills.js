/**
 * Skills 页面
 * 本地扫描已安装 Skills + SkillHub SDK 技能商店
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { t } from '../lib/i18n.js'
import { wsClient } from '../lib/ws-client.js'

let _loadSeq = 0
let _selectedAgentId = null // null = default (main)

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const SKILL_NAME_ZH = {
  '1password': '1Password 密码管理',
  'apple-notes': 'Apple 备忘录',
  'apple-reminders': 'Apple 提醒事项',
  'bear-notes': 'Bear 笔记',
  blogwatcher: '博客订阅监控',
  blucli: '蓝牙设备控制',
  browser: '浏览器自动化',
  'claude-code': 'Claude Code 委派',
  codex: 'Codex CLI 委派',
  github: 'GitHub 工作流',
  'github-code-review': 'GitHub 代码评审',
  'github-issues': 'GitHub Issue 管理',
  'github-pr-workflow': 'GitHub PR 流程',
  'hermes-agent': 'Hermes Agent',
  himalaya: 'Himalaya 邮件',
  notion: 'Notion 工作流',
  obsidian: 'Obsidian 笔记',
  opencode: 'OpenCode CLI 委派',
  openhue: 'OpenHue 智能灯',
  ordercli: '订单查询',
  'skill-creator': '技能创建器',
  slack: 'Slack 协作',
  spotify: 'Spotify 音乐控制',
  summarize: '内容摘要',
  taskflow: '任务流编排',
  trello: 'Trello 看板',
  weather: '天气查询',
  xurl: '链接解析',
}

const SKILL_DESC_ZH = {
  '1password': '配置并使用 1Password CLI，完成登录、桌面集成、读取或写入密钥。',
  'apple-notes': '通过 macOS 备忘录 CLI 创建、查看、编辑、删除、搜索、移动或导出 Apple Notes。',
  'apple-reminders': '通过 remindctl 管理 Apple 提醒事项和提醒列表，可列出、添加、编辑、完成或删除。',
  'bear-notes': '通过 grizzly CLI 创建、搜索和管理 Bear 笔记。',
  blogwatcher: '监控博客和 RSS/Atom 订阅源，发现更新后便于后续处理。',
  blucli: '发现、配对、连接、查询和控制蓝牙设备。',
  github: '处理 GitHub 仓库、Issue、PR、评审和发布相关流程。',
  'github-code-review': '审查 PR、差异和代码风险，整理可执行的评审意见。',
  'github-pr-workflow': '处理分支、提交、PR、CI 和合并前后的工作流。',
  'skill-creator': '创建、校验和打包新的 Skill，适合后续扩展技能库。',
  himalaya: '通过 Himalaya CLI 搜索、阅读、发送和整理邮件。',
  notion: '读取、搜索、更新 Notion 页面和数据库。',
  obsidian: '读取、搜索和维护 Obsidian 笔记库。',
  openhue: '控制 Hue 或兼容智能灯，包括查询状态和调整灯光。',
  slack: '搜索、发送和整理 Slack 消息与频道内容。',
  spotify: '控制 Spotify 播放、搜索音乐并管理当前播放队列。',
  weather: '查询天气、预报和城市气象信息。',
}

const TITLE_TERMS_ZH = {
  ai: 'AI',
  agent: '智能体',
  agents: '智能体',
  apple: 'Apple',
  audio: '音频',
  blog: '博客',
  browser: '浏览器',
  calendar: '日历',
  cli: 'CLI',
  code: '代码',
  computer: '电脑',
  data: '数据',
  debug: '调试',
  design: '设计',
  diagram: '图表',
  email: '邮件',
  file: '文件',
  github: 'GitHub',
  google: 'Google',
  image: '图像',
  issue: 'Issue',
  mcp: 'MCP',
  media: '媒体',
  notes: '笔记',
  pdf: 'PDF',
  pr: 'PR',
  reminder: '提醒事项',
  reminders: '提醒事项',
  research: '研究',
  search: '搜索',
  server: '服务器',
  slack: 'Slack',
  task: '任务',
  tasks: '任务',
  video: '视频',
  web: '网页',
  workflow: '流程',
}

function hasChineseText(text) {
  return /[\u3400-\u9fff]/.test(String(text || ''))
}

function normalizeSkillKey(text) {
  return String(text || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.md$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

function cleanSkillText(text) {
  const value = String(text || '').trim()
  if (!value || /^[-—_]+$/.test(value)) return ''
  if (/^name\s*:/i.test(value)) return ''
  return value
}

function autoTranslateTitle(name, key) {
  const raw = String(name || key || '').trim()
  const normalized = normalizeSkillKey(key || raw)
  if (SKILL_NAME_ZH[normalized]) return SKILL_NAME_ZH[normalized]
  if (hasChineseText(raw)) return raw
  const parts = (raw || normalized)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_\-/]+/)
    .filter(Boolean)
    .filter(w => !/^(and|or|for|the|a|an|of|with|via)$/i.test(w))
    .map(w => TITLE_TERMS_ZH[w.toLowerCase()] || w)
  return parts.join(' ') || raw || normalized
}

function inferSkillTarget(lower, title) {
  if (lower.includes('apple notes')) return 'Apple Notes 备忘录'
  if (lower.includes('apple reminders')) return 'Apple 提醒事项'
  if (lower.includes('bear notes')) return 'Bear 笔记'
  if (lower.includes('rss') || lower.includes('atom') || lower.includes('blogs')) return '博客和 RSS/Atom 订阅源'
  if (lower.includes('secret') || lower.includes('password')) return '密钥、密码和登录信息'
  if (lower.includes('github') || lower.includes('pull request') || /\bpr\b/.test(lower)) return 'GitHub 仓库、PR 和 Issue'
  if (lower.includes('email') || lower.includes('message')) return '邮件和消息'
  if (lower.includes('note')) return '笔记内容'
  if (lower.includes('calendar')) return '日历和日程'
  if (lower.includes('file') || lower.includes('document') || lower.includes('pdf')) return '文件和文档'
  if (lower.includes('image') || lower.includes('video') || lower.includes('audio')) return '媒体内容'
  if (lower.includes('browser') || lower.includes('web')) return '网页和浏览器任务'
  if (lower.includes('data') || lower.includes('notebook')) return '数据分析任务'
  if (lower.includes('device') || lower.includes('home')) return '设备和自动化任务'
  return `${title}相关任务`
}

function inferSkillActions(lower) {
  const actions = []
  const add = (keyword, label) => {
    if (lower.includes(keyword) && !actions.includes(label)) actions.push(label)
  }
  add('create', '创建')
  add('add', '新增')
  add('view', '查看')
  add('list', '列出')
  add('read', '读取')
  add('edit', '编辑')
  add('update', '更新')
  add('delete', '删除')
  add('remove', '移除')
  add('search', '搜索')
  add('discover', '发现')
  add('move', '移动')
  add('export', '导出')
  add('monitor', '监控')
  add('manage', '管理')
  add('send', '发送')
  add('download', '下载')
  add('control', '控制')
  add('inject', '写入')
  return actions
}

function autoTranslateDescription(desc, title) {
  const text = cleanSkillText(desc)
  if (hasChineseText(text)) return text
  const lower = text.toLowerCase()
  if (!lower) return `用于${title}相关任务。`

  if (lower.startsWith('set up and use')) {
    return `用于配置并使用 ${title}，处理${inferSkillTarget(lower, title)}。`
  }

  const actions = inferSkillActions(lower)
  if (actions.length) {
    return `用于${actions.join('、')}${inferSkillTarget(lower, title)}。`
  }

  if (lower.includes('cli')) return `通过命令行工具完成${title}相关任务。`
  if (lower.includes('api')) return `通过 API 接入${title}相关能力。`
  if (lower.includes('workflow') || lower.includes('pipeline')) return `用于编排${title}相关流程。`
  return `用于${title}相关任务。`
}

function getSkillDisplay(skill) {
  const key = normalizeSkillKey(skill?.slug || skill?.name || skill?.display_name || skill?.displayName || '')
  const originalName = String(skill?.display_name || skill?.displayName || skill?.name || key || '').trim()
  const titleZh = autoTranslateTitle(originalName, key)
  const originalDesc = cleanSkillText(skill?.summary || skill?.description || '')
  const note = SKILL_DESC_ZH[key] || autoTranslateDescription(originalDesc, titleZh)
  return {
    key,
    titleZh,
    note,
    originalName: originalName && originalName !== titleZh ? originalName : '',
    originalDesc: originalDesc && !hasChineseText(originalDesc) ? originalDesc : '',
    searchText: [originalName, titleZh, note, originalDesc, key].filter(Boolean).join(' '),
  }
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page openclaw-skills-page'

  // 加载 Agent 列表
  let agents = []
  try {
    const list = await api.listAgents()
    if (Array.isArray(list)) agents = list
  } catch {}

  const agentOptions = agents.length > 1
    ? `<div class="skills-agent-selector" style="display:flex;align-items:center;gap:var(--space-xs);margin-bottom:var(--space-sm)">
        <label style="font-size:var(--font-size-sm);color:var(--text-secondary);white-space:nowrap">${t('skills.agentLabel')}</label>
        <select id="skills-agent-select" class="input" style="max-width:220px;font-size:var(--font-size-sm);padding:4px 8px">
          ${agents.map(a => {
            const id = a.id || 'main'
            const name = a.name || a.id || 'main'
            const isDefault = a.default ? ` (${t('skills.allAgents').split('(')[0].trim()})` : ''
            return `<option value="${esc(id)}"${id === (_selectedAgentId || 'main') ? ' selected' : ''}>${esc(name)}${isDefault}</option>`
          }).join('')}
        </select>
      </div>`
    : ''

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('skills.title')}</h1>
      <p class="page-desc">${t('skills.desc')}</p>
    </div>
    ${agentOptions}
    <div class="skills-tabs-row">
      <div class="tab-bar" id="skills-main-tabs">
        <div class="tab active" data-main-tab="installed">${t('skills.tabInstalled')}</div>
        <div class="tab" data-main-tab="store">${t('skills.tabStore')}</div>
      </div>
      <a class="btn btn-secondary btn-sm skills-market-link" href="https://clawhub.ai/" target="_blank" rel="noopener">Skills 商城</a>
    </div>
    <div id="skills-tab-installed" class="config-section">
      <div class="stat-card loading-placeholder" style="height:96px"></div>
    </div>
    <div id="skills-tab-store" class="config-section" style="display:none">
      <div class="clawhub-toolbar" style="margin-bottom:var(--space-sm)">
        <input class="input clawhub-search-input" id="skill-store-search" placeholder="${t('skills.searchPlaceholder')}" type="text" style="flex:1">
        <button class="btn btn-primary btn-sm" data-action="store-search">${t('skills.search')}</button>
        <a class="btn btn-secondary btn-sm" href="https://skillhub.tencent.com" target="_blank" rel="noopener">${t('skills.browse')}</a>
      </div>
      <div id="store-results" class="clawhub-list" style="max-height:calc(100vh - 300px);overflow-y:auto">
        <div class="form-hint" style="padding:var(--space-xl);text-align:center">${t('skills.storeLoading')}</div>
      </div>
    </div>
  `
  bindEvents(page)
  loadSkills(page)

  // Agent 选择器变化时刷新
  const agentSelect = page.querySelector('#skills-agent-select')
  if (agentSelect) {
    agentSelect.addEventListener('change', () => {
      const val = agentSelect.value
      _selectedAgentId = (val === 'main') ? null : val
      _storeIndex = null // 清除商店缓存
      _installedNames = new Set()
      loadSkills(page)
    })
  }

  return page
}

async function loadSkills(page) {
  const el = page.querySelector('#skills-tab-installed')
  if (!el) return
  const seq = ++_loadSeq

  el.innerHTML = `<div class="skills-loading-panel">
    <div class="stat-card loading-placeholder" style="height:96px"></div>
    <div class="form-hint" style="margin-top:8px">${t('skills.loading')}</div>
  </div>`

  try {
    const data = await api.skillsList(_selectedAgentId)
    if (seq !== _loadSeq) return
    renderSkills(el, data)
  } catch (e) {
    if (seq !== _loadSeq) return
    el.innerHTML = `<div class="skills-load-error">
      <div style="color:var(--error);margin-bottom:8px">${t('skills.loadFailed')}: ${esc(e?.message || e)}</div>
      <div class="form-hint" style="margin-bottom:10px">${t('skills.loadFailedHint')}</div>
      <button class="btn btn-secondary btn-sm" data-action="skill-retry">${t('skills.retry')}</button>
    </div>`
  }
}

function renderSkills(el, data) {
  const skills = data?.skills || []
  const cliAvailable = data?.cliAvailable !== false
  const source = data?.source || ''
  const cliDiag = data?.diagnostic?.cli || null
  const eligible = skills.filter(s => s.eligible && !s.disabled)
  const missing = skills.filter(s => !s.eligible && !s.disabled && !s.blockedByAllowlist)
  const disabled = skills.filter(s => s.disabled)
  const blocked = skills.filter(s => s.blockedByAllowlist && !s.disabled)

  const summary = t('skills.summaryDetail', { eligible: eligible.length, missing: missing.length, disabled: disabled.length })

  el.innerHTML = `
    <div class="clawhub-toolbar">
      <input class="input clawhub-search-input" id="skill-filter-input" placeholder="${t('skills.filterPlaceholder')}" type="text">
      <button class="btn btn-secondary btn-sm" data-action="skill-retry">${t('skills.refresh')}</button>
    </div>

    <div class="skills-overview-card">
      <div class="skills-overview-copy">
        <div class="skills-overview-eyebrow">中文批注已开启</div>
        <div class="skills-overview-title">${t('skills.summary', { total: skills.length, detail: summary })}</div>
        <div class="skills-overview-sub">每个 Skill 都会显示中文用途说明；新安装的技能也会根据名称和英文描述自动生成中文批注。</div>
      </div>
      <div class="skills-overview-metrics" aria-label="Skills 状态统计">
        <span class="skills-overview-pill is-ok">${eligible.length} 可用</span>
        <span class="skills-overview-pill is-warn">${missing.length} 缺依赖</span>
        <span class="skills-overview-pill">${disabled.length} 已禁用</span>
      </div>
    </div>

    ${eligible.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--success)">${t('skills.eligibleGroup')} (${eligible.length})</div>
      <div class="clawhub-list skills-scroll-area skills-trending-scroll" id="skills-eligible">
        ${eligible.map(s => renderSkillCard(s, 'eligible')).join('')}
      </div>
    </div>` : ''}

    ${missing.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--warning);display:flex;align-items:center;gap:var(--space-sm)">
        <span>${t('skills.missingGroup')} (${missing.length})</span>
        <button class="btn btn-secondary btn-sm" data-action="skill-ai-fix" style="font-size:var(--font-size-xs);padding:2px 8px">${t('skills.aiFixBtn')}</button>
      </div>
      <div class="clawhub-list skills-scroll-area skills-installed-scroll" id="skills-missing">
        ${missing.map(s => renderSkillCard(s, 'missing')).join('')}
      </div>
    </div>` : ''}

    ${disabled.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--text-tertiary)">${t('skills.disabledGroup')} (${disabled.length})</div>
      <div class="clawhub-list skills-scroll-area skills-search-scroll" id="skills-disabled">
        ${disabled.map(s => renderSkillCard(s, 'disabled')).join('')}
      </div>
    </div>` : ''}

    ${blocked.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--text-tertiary)">${t('skills.blockedGroup')} (${blocked.length})</div>
      <div class="clawhub-list">
        ${blocked.map(s => renderSkillCard(s, 'blocked')).join('')}
      </div>
    </div>` : ''}

    ${!skills.length ? `
    <div class="clawhub-panel">
      <div class="clawhub-empty" style="text-align:center;padding:var(--space-xl)">
        <div style="margin-bottom:var(--space-sm)">${t('skills.noSkills')}</div>
        <div class="form-hint">${t('skills.noSkillsHint')}</div>
      </div>
    </div>` : ''}

    <div id="skill-detail-area"></div>
  `

  // 实时过滤
  const input = el.querySelector('#skill-filter-input')
  if (input) {
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase()
      el.querySelectorAll('.skill-card-item').forEach(card => {
        const name = (card.dataset.name || '').toLowerCase()
        const desc = (card.dataset.desc || '').toLowerCase()
        const note = (card.dataset.note || '').toLowerCase()
        card.style.display = (!q || name.includes(q) || desc.includes(q) || note.includes(q)) ? '' : 'none'
      })
    })
  }
}

function renderSkillCard(skill, status) {
  const emoji = skill.emoji || '📦'
  const name = skill.name || ''
  const desc = skill.description || ''
  const display = getSkillDisplay(skill)
  const source = skill.bundled ? t('skills.bundled') : (skill.source || t('skills.custom'))
  const missingBins = skill.missing?.bins || []
  const missingEnv = skill.missing?.env || []
  const missingConfig = skill.missing?.config || []
  const installOpts = skill.install || []

  let statusBadge = ''
  if (status === 'eligible') statusBadge = `<span class="clawhub-badge installed">${t('skills.eligible')}</span>`
  else if (status === 'missing') statusBadge = `<span class="clawhub-badge" style="background:rgba(245,158,11,0.14);color:#d97706">${t('skills.missingDeps')}</span>`
  else if (status === 'disabled') statusBadge = `<span class="clawhub-badge" style="background:rgba(107,114,128,0.14);color:#6b7280">${t('skills.disabled')}</span>`
  else if (status === 'blocked') statusBadge = `<span class="clawhub-badge" style="background:rgba(239,68,68,0.14);color:#ef4444">${t('skills.blocked')}</span>`

  let missingHtml = ''
  if (missingBins.length) missingHtml += `<div class="form-hint" style="margin-top:4px">${t('skills.missingCmd')}: ${missingBins.map(b => `<code>${esc(b)}</code>`).join(', ')}</div>`
  if (missingEnv.length) missingHtml += `<div class="form-hint" style="margin-top:4px">${t('skills.missingEnv')}: ${missingEnv.map(e => `<code>${esc(e)}</code>`).join(', ')} <span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('skills.missingEnvHint')}</span></div>`
  if (missingConfig.length) missingHtml += `<div class="form-hint" style="margin-top:4px">${t('skills.missingConfig')}: ${missingConfig.map(c => `<code>${esc(c)}</code>`).join(', ')} <span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('skills.missingConfigHint')}</span></div>`

  let installHtml = ''
  if (status === 'missing') {
    if (installOpts.length) {
      installHtml = `<div style="margin-top:6px">${installOpts.map(opt =>
        `<button class="btn btn-primary btn-sm" style="margin-right:6px;margin-top:4px" data-action="skill-install-dep" data-kind="${esc(opt.kind)}" data-install='${esc(JSON.stringify(opt))}' data-skill-name="${esc(name)}">${esc(opt.label)}</button>`
      ).join('')}</div>`
    } else if (missingBins.length && !missingEnv.length && !missingConfig.length) {
      installHtml = `<div class="form-hint" style="margin-top:6px;color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('skills.noAutoInstall')}: ${missingBins.map(b => `<code>brew install ${esc(b)}</code> / <code>npm i -g ${esc(b)}</code>`).join(' / ')}</div>`
    }
  }

  return `
    <div class="clawhub-item skill-card-item openclaw-skill-card" data-name="${esc(name)} ${esc(display.titleZh)}" data-desc="${esc(desc)}" data-note="${esc(display.searchText)}">
      <div class="clawhub-item-main">
        <div class="clawhub-item-title skill-title-row">
          <span class="skill-title-icon">${emoji}</span>
          <span class="skill-title-name">${esc(name)}</span>
          ${display.originalName ? `<span class="skill-title-cn">${esc(display.titleZh)}</span>` : ''}
        </div>
        <div class="clawhub-item-meta skill-source-line">来源：${esc(source)}${skill.homepage ? ` · <a href="${esc(skill.homepage)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(skill.homepage)}</a>` : ''}</div>
        <div class="skill-cn-note">
          <span class="skill-cn-note-label">中文批注</span>
          <span>${esc(display.note)}</span>
        </div>
        ${display.originalDesc ? `<details class="skill-original-desc">
          <summary>英文原文</summary>
          <div>${esc(display.originalDesc)}</div>
        </details>` : ''}
        ${missingHtml}
        ${installHtml}
      </div>
      <div class="clawhub-item-actions">
        <button class="btn btn-secondary btn-sm" data-action="skill-info" data-name="${esc(name)}">${t('skills.detail')}</button>
        ${!skill.bundled ? `<button class="btn btn-sm" style="color:var(--error);border:1px solid var(--error);background:transparent;font-size:var(--font-size-xs)" data-action="skill-uninstall" data-name="${esc(name)}">${t('skills.uninstall')}</button>` : ''}
        ${statusBadge}
      </div>
    </div>
  `
}

async function handleInfo(page, name) {
  const detail = page.querySelector('#skill-detail-area')
  if (!detail) return
  detail.innerHTML = `<div class="form-hint" style="margin-top:var(--space-md)">${t('skills.loadingDetail')}</div>`
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  try {
    let skill = null
    // 优先 Gateway RPC（可获取 ClawHub 远程详情），回退 Tauri 本地
    if (wsClient.connected && wsClient.gatewayReady) {
      try { skill = await wsClient.skillsDetail(name) } catch {}
    }
    if (!skill) skill = await api.skillsInfo(name, _selectedAgentId)
    const s = skill || {}
    const reqs = s.requirements || {}
    const miss = s.missing || {}
    const display = getSkillDisplay(s.name ? s : { ...s, name })

    let reqsHtml = ''
    if (reqs.bins?.length) {
      reqsHtml += `<div style="margin-top:8px"><strong>${t('skills.reqBins')}:</strong> ${reqs.bins.map(b => {
        const ok = !(miss.bins || []).includes(b)
        return `<code style="color:var(--${ok ? 'success' : 'error'})">${ok ? '✓' : '✗'} ${esc(b)}</code>`
      }).join(' ')}</div>`
    }
    if (reqs.env?.length) {
      reqsHtml += `<div style="margin-top:4px"><strong>${t('skills.reqEnv')}:</strong> ${reqs.env.map(e => {
        const ok = !(miss.env || []).includes(e)
        return `<code style="color:var(--${ok ? 'success' : 'error'})">${ok ? '✓' : '✗'} ${esc(e)}</code>`
      }).join(' ')}</div>`
    }

    detail.innerHTML = `
      <div class="clawhub-detail-card">
        <div class="clawhub-detail-title">${esc(s.emoji || '📦')} ${esc(s.name || name)}</div>
        <div class="clawhub-detail-meta">
          ${t('skills.detailSource')}: ${esc(s.source || '')} · ${t('skills.detailPath')}: <code>${esc(s.filePath || '')}</code>
          ${s.homepage ? ` · <a href="${esc(s.homepage)}" target="_blank" rel="noopener">${esc(s.homepage)}</a>` : ''}
        </div>
        <div class="skill-cn-note skill-detail-note">
          <span class="skill-cn-note-label">中文批注</span>
          <span>${esc(display.note)}</span>
        </div>
        ${display.originalDesc ? `<details class="skill-original-desc skill-detail-original">
          <summary>英文原文</summary>
          <div>${esc(display.originalDesc)}</div>
        </details>` : ''}
        ${reqsHtml}
        ${(s.install || []).length && !s.eligible ? `<div style="margin-top:8px"><strong>${t('skills.installOptions')}:</strong> ${s.install.map(i => `<span class="form-hint">→ ${esc(i.label)}</span>`).join(' ')}</div>` : ''}
      </div>
    `
  } catch (e) {
    detail.innerHTML = `<div style="color:var(--error);margin-top:var(--space-md)">${t('skills.detailLoadFailed')}: ${esc(e?.message || e)}</div>`
  }
}

async function handleInstallDep(page, btn) {
  const kind = btn.dataset.kind
  let spec
  try { spec = JSON.parse(btn.dataset.install) } catch { spec = {} }
  const skillName = btn.dataset.skillName || ''
  btn.disabled = true
  btn.textContent = t('skills.installing')
  try {
    await api.skillsInstallDep(kind, spec)
    toast(t('skills.depInstalled', { name: skillName }), 'success')
    await loadSkills(page)
  } catch (e) {
    toast(`${t('skills.installFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = spec.label || t('skills.retry')
  }
}

// ===== 技能商店（SkillHub SDK）=====
let _storeIndex = null // 缓存的全量索引
let _installedNames = new Set() // 已安装的 skill 名称

async function loadStore(page) {
  const results = page.querySelector('#store-results')
  if (!results) return
  results.innerHTML = `<div class="form-hint" style="padding:var(--space-xl);text-align:center">${t('skills.storeLoading')}</div>`
  try {
    _storeIndex = await api.skillhubIndex()
    // 获取已安装列表用于标记
    try {
      const data = await api.skillsList(_selectedAgentId)
      _installedNames = new Set((data?.skills || []).map(s => s.name))
    } catch { _installedNames = new Set() }
    renderStoreItems(results, _storeIndex)
  } catch (e) {
    results.innerHTML = `<div style="color:var(--error);padding:var(--space-lg);text-align:center">${t('skills.storeLoadFailed')}: ${esc(e?.message || e)}</div>`
  }
}

function renderStoreItems(el, items) {
  if (!items?.length) {
    el.innerHTML = `<div class="clawhub-empty" style="padding:var(--space-xl);text-align:center">${t('skills.noResults')}</div>`
    return
  }
  el.innerHTML = items.map(item => {
    const slug = item.slug || ''
    const name = item.display_name || item.displayName || item.name || slug
    const desc = item.summary || item.description || ''
    const display = getSkillDisplay({ ...item, name, description: desc, slug })
    const installed = _installedNames.has(slug)
    return `
      <div class="clawhub-item store-item openclaw-skill-card" data-slug="${esc(slug)}" data-name="${esc(name)} ${esc(display.titleZh)}" data-desc="${esc(desc)} ${esc(display.searchText)}">
        <div class="clawhub-item-main">
          <div class="clawhub-item-title skill-title-row">
            <span class="skill-title-icon">📦</span>
            <span class="skill-title-name">${esc(name)}</span>
            ${display.originalName ? `<span class="skill-title-cn">${esc(display.titleZh)}</span>` : ''}
          </div>
          <div class="skill-cn-note">
            <span class="skill-cn-note-label">中文批注</span>
            <span>${esc(display.note)}</span>
          </div>
          ${display.originalDesc ? `<details class="skill-original-desc">
            <summary>英文原文</summary>
            <div>${esc(display.originalDesc)}</div>
          </details>` : ''}
          ${item.version ? `<div class="clawhub-item-meta">v${esc(item.version)}${item.author ? ` · ${esc(item.author)}` : ''}</div>` : ''}
        </div>
        <div class="clawhub-item-actions">
          ${installed
            ? `<span class="clawhub-badge installed">${t('skills.installed')}</span>`
            : `<button class="btn btn-primary btn-sm" data-action="store-install" data-slug="${esc(slug)}">${t('skills.install')}</button>`
          }
        </div>
      </div>
    `
  }).join('')
}

async function handleStoreSearch(page) {
  const input = page.querySelector('#skill-store-search')
  const results = page.querySelector('#store-results')
  if (!input || !results) return
  const q = input.value.trim().toLowerCase()
  if (!q && _storeIndex) {
    renderStoreItems(results, _storeIndex)
    return
  }
  if (!q) return
  // 客户端过滤已有索引
  if (_storeIndex) {
    const filtered = _storeIndex.filter(item => {
      const slug = (item.slug || '').toLowerCase()
      const name = (item.display_name || item.displayName || '').toLowerCase()
      const desc = (item.summary || item.description || '').toLowerCase()
      const tags = (item.tags || []).join(' ').toLowerCase()
      return slug.includes(q) || name.includes(q) || desc.includes(q) || tags.includes(q)
    })
    renderStoreItems(results, filtered)
    return
  }
  // 没有索引时走服务端搜索（优先 Gateway RPC，回退 Tauri）
  results.innerHTML = `<div class="form-hint" style="padding:var(--space-sm)">${t('skills.searching')}</div>`
  try {
    let items
    if (wsClient.connected && wsClient.gatewayReady) {
      try {
        const res = await wsClient.skillsSearch(input.value.trim(), 30)
        items = res?.results || []
      } catch {
        items = await api.skillhubSearch(input.value.trim())
      }
    } else {
      items = await api.skillhubSearch(input.value.trim())
    }
    renderStoreItems(results, items)
  } catch (e) {
    results.innerHTML = `<div style="color:var(--error);padding:var(--space-sm)">${t('skills.searchFailed')}: ${esc(e?.message || e)}</div>`
  }
}

async function handleStoreInstall(page, btn) {
  const slug = btn.dataset.slug
  btn.disabled = true
  btn.textContent = t('skills.installing')
  try {
    await api.skillhubInstall(slug, _selectedAgentId)
    toast(t('skills.skillInstalled', { name: slug }), 'success')
    btn.textContent = t('skills.installed')
    btn.classList.remove('btn-primary')
    btn.classList.add('btn-secondary')
    _installedNames.add(slug)
    loadSkills(page).catch(() => {})
  } catch (e) {
    toast(`${t('skills.installFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = t('skills.install')
  }
}

async function handleSkillUninstall(page, btn) {
  const name = btn.dataset.name
  if (!name) return
  if (!confirm(t('skills.confirmUninstall', { name }))) return
  btn.disabled = true
  btn.textContent = t('skills.uninstalling')
  try {
    await api.skillsUninstall(name, _selectedAgentId)
    toast(t('skills.uninstalled', { name }), 'success')
    await loadSkills(page)
  } catch (e) {
    toast(`${t('skills.uninstallFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = t('skills.uninstall')
  }
}

function bindEvents(page) {
  // 主 Tab 切换（已安装 / 搜索安装）
  page.querySelectorAll('#skills-main-tabs .tab').forEach(tab => {
    tab.onclick = () => {
      page.querySelectorAll('#skills-main-tabs .tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const key = tab.dataset.mainTab
      page.querySelector('#skills-tab-installed').style.display = key === 'installed' ? '' : 'none'
      page.querySelector('#skills-tab-store').style.display = key === 'store' ? '' : 'none'
      // 切到商店 tab 时加载全量索引
      if (key === 'store') loadStore(page)
    }
  })

  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    switch (btn.dataset.action) {
      case 'skill-retry':
        await loadSkills(page)
        break
      case 'skill-info':
        await handleInfo(page, btn.dataset.name)
        break
      case 'skill-install-dep':
        await handleInstallDep(page, btn)
        break
      case 'store-search':
        await handleStoreSearch(page)
        break
      case 'store-install':
        await handleStoreInstall(page, btn)
        break
      case 'skill-uninstall':
        await handleSkillUninstall(page, btn)
        break
      case 'skill-ai-fix':
        window.location.hash = '#/assistant'
        setTimeout(() => {
          const skillBtn = document.querySelector('.ast-skill-card[data-skill="skills-manager"]')
          if (skillBtn) skillBtn.click()
        }, 500)
        break
    }
  })

  page.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && e.target?.id === 'skill-store-search') {
      e.preventDefault()
      await handleStoreSearch(page)
    }
  })
}
