/**
 * Hermes Agent — Skills browser (editorial luxury re-write)
 *
 * Mirrors the official `hermes-web-ui` Skills view:
 *   GET    /api/hermes/skills                       → { categories: [...] }
 *   PUT    /api/hermes/skills/toggle                → enable/disable
 *   GET    /api/hermes/skills/:cat/:skill/files     → attached files
 *   GET    /api/hermes/skills/<path>                → file content
 *
 * Layout:
 *   ┌ hero ───────────────────────────────────────────────────┐
 *   │ eyebrow + big-serif title + search + skill count         │
 *   ├─ sidebar (categories + skills) ┬─ detail (markdown + files)
 *   │ collapsible, toggle switches   │   breadcrumb when viewing
 *   │                                │   an attached file
 *   └────────────────────────────────┴──────────────────────────┘
 *
 * Extras beyond the official UI:
 *   - Collapsible categories (persist in memory only)
 *   - File browser with breadcrumb + back button (Vue parity)
 *   - Inline toggle switches use stable loading state per skill
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function candyNoteHtml(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  return raw
    .split(/(\s+|[A-Za-z_][A-Za-z0-9_.-]*|\d+(?:\.\d+)*|[/:：、，。；;,.()（）\[\]{}<>|+*-])/g)
    .filter(part => part.length > 0)
    .map(part => {
      if (/^\s+$/.test(part)) return escHtml(part)
      let cls = 'hm-candy-word'
      if (/^[/:：、，。；;,.()（）\[\]{}<>|+*-]$/.test(part)) cls = 'hm-candy-punc'
      else if (/^\d+(?:\.\d+)*$/.test(part)) cls = 'hm-candy-number'
      else if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(part)) cls = 'hm-candy-code'
      return `<span class="hm-candy-token ${cls}">${escHtml(part)}</span>`
    })
    .join('')
}

function skillSlugHtml(slug) {
  if (!slug) return ''
  return [
    '<span class="hm-candy-token hm-candy-label">标识</span>',
    '<span class="hm-candy-token hm-candy-punc">：</span>',
    `<span class="hm-candy-token hm-candy-slug-value">${escHtml(slug)}</span>`,
  ].join('')
}

/**
 * Minimal, dependency-free Markdown renderer. Matches the feature-set used
 * across Hermes pages (memory/skills) so the look is consistent. Supports:
 *   - fenced code blocks (```lang\ncode```)
 *   - inline `code`, **bold**, *italic*
 *   - `# / ## / ### / ####` headings
 *   - unordered list (`- item`) → `<li>`
 *   - `[text](url)` → `<a>`
 * Anything else is escaped and rendered as plain text with `<br>` for newlines.
 */
function mdToHtml(text) {
  if (!text) return ''
  // First pass: extract code blocks so inner contents aren't mangled by other
  // replacers. We keep a placeholder token and restore at the end.
  const blocks = []
  let out = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = blocks.push({ lang, code }) - 1
    return `\u0000CODEBLOCK_${idx}\u0000`
  })
  out = out
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^(?:\s*[-*]\s+(.+))(?:\n\s*[-*]\s+(.+))*/gm, (m) =>
      '<ul>' + m.trim().split(/\n\s*[-*]\s+/).map(li => `<li>${li.replace(/^[-*]\s+/, '')}</li>`).join('') + '</ul>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
  // Restore code blocks.
  out = out.replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_, i) => {
    const { lang, code } = blocks[Number(i)]
    return `<pre><code class="lang-${escHtml(lang)}">${escHtml(code)}</code></pre>`
  })
  return `<p>${out}</p>`
}

const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="11" height="11"><polyline points="6 9 12 15 18 9"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="13" height="13"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
  empty: '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.35"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
}

const INSTALL_PRESETS = [
  {
    id: 'sql',
    icon: '🗄️',
    title: 'SQL 工作台',
    badge: '数据库',
    desc: '给 Hermes 补上 SQL 安装、表结构检查、只读查询和安全写入流程。',
    search: 'sql-workbench',
  },
  {
    id: 'opencloud',
    icon: '☁️',
    title: 'OpenCloud Skills',
    badge: 'OpenClaw',
    desc: '给 OpenCloud / OpenClaw 目标智能体安装、启用并验证 Skills。',
    search: 'opencloud-skill-installer',
  },
  {
    id: 'cloudpro',
    icon: '✨',
    title: 'CloudPro Skills',
    badge: 'CloudCode',
    desc: '给 CloudPro / CloudCode 面板安装 Skills，并在不支持时改走 Hermes 代理。',
    search: 'cloudpro-skill-installer',
  },
]

/** Cross-platform basename (handles `/` and `\\`). */
function basename(p) {
  if (!p) return ''
  const s = String(p).replace(/\\/g, '/')
  const idx = s.lastIndexOf('/')
  return idx >= 0 ? s.slice(idx + 1) : s
}

const CATEGORY_TRANSLATIONS_ZH = {
  '.hub': '技能市场',
  apple: 'Apple / macOS',
  'autonomous-ai-agents': '自主 AI 智能体',
  creative: '创意制作',
  'data-science': '数据科学',
  devops: '运维自动化',
  diagramming: '图表绘制',
  dogfood: '内部测试',
  domain: '领域知识',
  email: '邮件处理',
  external: '外部工具',
  gaming: '游戏',
  gifs: 'GIF 动图',
  github: 'GitHub 工作流',
  'index-cache': '索引缓存',
  'inference-sh': '推理服务',
  mcp: 'MCP 集成',
  media: '媒体处理',
  mlops: '机器学习运维',
  'mlops/evaluation': '模型评估',
  'mlops/inference': '模型推理',
  'mlops/models': '模型工具',
  'mlops/research': '机器学习研究',
  'note-taking': '笔记管理',
  productivity: '效率工具',
  'red-teaming': '安全红队',
  research: '研究检索',
  'smart-home': '智能家居',
  'social-media': '社交媒体',
  'software-development': '软件开发',
  yuanbao: '元宝',
}

const CATEGORY_DESCRIPTIONS_ZH = {
  '.hub': '用于发现、下载和管理技能包。',
  apple: 'Apple 与 macOS 相关的自动化技能。',
  'autonomous-ai-agents': '用于委派、编排和运行自主 AI 智能体。',
  creative: '用于图像、图表、视觉设计和创意内容生成。',
  'data-science': '用于数据分析、可视化和交互式探索。',
  devops: '用于部署、自动化、监控和工作流编排。',
  diagramming: '用于架构图、流程图和手绘风格图表。',
  dogfood: '用于产品自测、探索性 QA 和反馈闭环。',
  domain: '用于特定业务或知识领域的专用流程。',
  email: '用于邮件搜索、发送、整理和自动化处理。',
  external: '用于连接外部工具或浏览器能力。',
  gaming: '用于游戏、服务器和模拟器相关任务。',
  gifs: '用于动图搜索、下载和处理。',
  github: '用于仓库、PR、Issue、评审和发布流程。',
  'index-cache': '用于索引、缓存和本地知识检索。',
  'inference-sh': '用于推理服务和模型调用工作流。',
  mcp: '用于 MCP 服务、工具和协议集成。',
  media: '用于视频、音频、音乐和媒体内容处理。',
  mlops: '用于模型训练、部署、评估和运维。',
  'note-taking': '用于笔记、知识库和多会话协作。',
  productivity: '用于文档、表格、演示和日常效率工具。',
  'red-teaming': '用于安全测试和模型红队评估。',
  research: '用于论文、资料、市场和知识检索。',
  'smart-home': '用于智能家居设备和自动化控制。',
  'social-media': '用于社交平台内容和账号工作流。',
  'software-development': '用于编码、调试、测试、计划和代码评审。',
  yuanbao: '用于元宝群组、成员和消息任务。',
}

const SKILL_NAME_TRANSLATIONS_ZH = {
  '1password': '1Password 密码管理',
  'architecture-diagram': '架构图技能',
  'ascii-art': 'ASCII 艺术技能',
  'ascii-video': 'ASCII 视频制作流程',
  'baoyu-comic': '宝玉知识漫画',
  'baoyu-infographic': '宝玉信息图',
  'blogwatcher': '博客监控',
  'browser': '浏览器自动化',
  'claude-code': 'Claude Code 委派',
  'claude-design': 'Claude CLI/API 智能体设计',
  'codebase-inspection': '代码库检查',
  'codex': 'Codex CLI 委派',
  'comfyui': 'ComfyUI 生成工作流',
  'debugging-hermes-tui-commands': 'Hermes TUI 命令调试',
  'design-md': 'DESIGN.md 设计规范',
  'dspy': 'DSPy 程序优化',
  'excalidraw': 'Excalidraw 手绘图',
  'gif-search': 'GIF 搜索',
  'github-auth': 'GitHub 认证',
  'github-code-review': 'GitHub 代码评审',
  'github-issues': 'GitHub Issue 管理',
  'github-pr-workflow': 'GitHub PR 流程',
  'github-repo-management': 'GitHub 仓库管理',
  'google-workspace': 'Google Workspace',
  'heartmula': 'HeartMuLa 音乐生成',
  'hermes-agent': 'Hermes Agent 配置',
  'hermes-agent-skill-authoring': 'Hermes 技能编写',
  'himalaya': 'Himalaya 邮件 CLI',
  'huggingface-hub': 'Hugging Face Hub',
  'humanizer': '文本人味化',
  'ideation': '创意发散',
  'jupyter-live-kernel': 'Jupyter 实时内核',
  'sql-workbench': 'SQL 工作台',
  'kanban-orchestrator': '看板编排器',
  'kanban-worker': '看板工作者',
  'linear': 'Linear 项目管理',
  'llama-cpp': 'llama.cpp 本地推理',
  'llm-wiki': 'LLM Wiki 知识库',
  'macos-computer-use': 'macOS 电脑操作',
  'manim-video': 'Manim 动画视频',
  'maps': '地图与地理服务',
  'nano-pdf': 'PDF 轻量编辑',
  'native-mcp': '原生 MCP 客户端',
  'node-inspect-debugger': 'Node 调试器',
  'notion': 'Notion 工作流',
  'obsidian': 'Obsidian 笔记',
  'ocr-and-documents': 'OCR 与文档处理',
  'opencode': 'OpenCode CLI 委派',
  'opencloud-skill-installer': 'OpenCloud Skills 安装器',
  'cloudpro-skill-installer': 'CloudPro Skills 安装器',
  'openhue': 'OpenHue 智能灯',
  'p5js': 'p5.js 创意编程',
  'pixel-art': '像素艺术',
  'plan': '计划模式',
  'pokemon-player': 'Pokemon 自动玩家',
  'polymarket': 'Polymarket 市场查询',
  'popular-web-designs': '热门网页设计系统',
  'powerpoint': 'PowerPoint 演示文稿',
  'pretext': 'Pretext 创意演示',
  'requesting-code-review': '请求代码评审',
  'segment-anything-model': 'SAM 图像分割',
  'sketch': '快速 HTML 草图',
  'songsee': '音频可视化分析',
  'songwriting-and-ai-music': '歌词与 AI 音乐',
  'spotify': 'Spotify 音乐控制',
  'spike': '技术探索实验',
  'subagent-driven-development': '子智能体驱动开发',
  'systematic-debugging': '系统化调试',
  'teams-meeting-pipeline': 'Teams 会议摘要流程',
  'test-driven-development': '测试驱动开发',
  'touchdesigner-mcp': 'TouchDesigner MCP 控制',
  'webhook-subscriptions': 'Webhook 订阅',
  'weights-and-biases': 'Weights & Biases',
  'writing-plans': '编写实施计划',
  'youtube-content': 'YouTube 内容处理',
}

const SKILL_DESC_TRANSLATIONS_ZH = {
  'claude-code': '把编码任务委派给 Claude Code CLI。',
  codex: '把编码任务委派给 OpenAI Codex CLI。',
  'hermes-agent': '配置、扩展和排查 Hermes Agent。',
  opencode: '把编码或评审任务委派给 OpenCode CLI。',
  'architecture-diagram': '生成深色主题的架构图、云架构图和基础设施图。',
  'ascii-art': '生成 ASCII 艺术、字符画和图片转字符效果。',
  'ascii-video': '把视频或音频转换成彩色 ASCII 视频/GIF。',
  'claude-design': '为 CLI/API 智能体设计一次性 HTML 页面、原型或方案。',
  humanizer: '把文本改得更自然、更像真人表达。',
  ideation: '用约束和发散方法生成项目创意。',
  p5js: '制作 p5.js 草图、生成艺术和交互视觉。',
  'popular-web-designs': '参考真实设计系统生成网页视觉。',
  sketch: '快速生成 HTML 草图或多个设计方案。',
  'github-code-review': '审查 PR、差异和潜在问题。',
  'github-pr-workflow': '处理分支、提交、PR、CI 和合并流程。',
  'native-mcp': '配置 MCP 服务并注册工具。',
  'jupyter-live-kernel': '通过实时 Jupyter 内核做交互式 Python 分析。',
  'sql-workbench': '安装和使用 SQL 工具，支持 SQLite、PostgreSQL、MySQL、DuckDB 查询与结构分析。',
  'opencloud-skill-installer': '给 OpenCloud / OpenClaw 智能体安装、启用并验证 Skills。',
  'cloudpro-skill-installer': '给 CloudPro / CloudCode 面板安装和验证 Skills。',
  'obsidian': '读取、搜索和编辑 Obsidian 笔记库。',
  'ocr-and-documents': '从 PDF、扫描件和文档中提取内容。',
  'systematic-debugging': '按阶段定位根因并修复问题。',
  'test-driven-development': '按红绿重构流程编写和验证代码。',
  'writing-plans': '把实现方案拆成可执行的小任务。',
}

const TRANSLATION_TERMS_ZH = {
  ai: 'AI',
  agent: '智能体',
  agents: '智能体',
  autonomous: '自主',
  architecture: '架构',
  diagram: '图',
  diagrams: '图',
  skill: '技能',
  skills: '技能',
  ascii: 'ASCII',
  art: '艺术',
  video: '视频',
  production: '制作',
  pipeline: '流程',
  claude: 'Claude',
  code: '代码',
  codex: 'Codex',
  cli: 'CLI',
  api: 'API',
  hermes: 'Hermes',
  agentic: '智能体',
  orchestration: '编排',
  orchestrator: '编排器',
  opencode: 'OpenCode',
  open: '开放',
  macos: 'macOS',
  computer: '电脑',
  use: '操作',
  browser: '浏览器',
  web: '网页',
  search: '搜索',
  data: '数据',
  sql: 'SQL',
  database: '数据库',
  science: '科学',
  opencloud: 'OpenCloud',
  openclaw: 'OpenClaw',
  cloudpro: 'CloudPro',
  cloudcode: 'CloudCode',
  github: 'GitHub',
  review: '评审',
  issue: 'Issue',
  issues: 'Issue',
  pr: 'PR',
  workflow: '流程',
  workflows: '流程',
  repo: '仓库',
  repository: '仓库',
  management: '管理',
  auth: '认证',
  debug: '调试',
  debugging: '调试',
  testing: '测试',
  driven: '驱动',
  development: '开发',
  plan: '计划',
  planning: '计划',
  writing: '编写',
  systematic: '系统化',
  node: 'Node',
  inspect: '检查',
  debugger: '调试器',
  mcp: 'MCP',
  native: '原生',
  client: '客户端',
  pdf: 'PDF',
  document: '文档',
  documents: '文档',
  ocr: 'OCR',
  image: '图像',
  images: '图像',
  generation: '生成',
  design: '设计',
  creative: '创意',
  comic: '漫画',
  infographic: '信息图',
  music: '音乐',
  songwriting: '作词',
  audio: '音频',
  media: '媒体',
  youtube: 'YouTube',
  content: '内容',
  spotify: 'Spotify',
  email: '邮件',
  note: '笔记',
  taking: '记录',
  productivity: '效率',
  research: '研究',
  smart: '智能',
  home: '家居',
  social: '社交',
  red: '红队',
  teaming: '测试',
  inference: '推理',
  model: '模型',
  models: '模型',
  mlops: '机器学习运维',
  evaluation: '评估',
  cache: '缓存',
  index: '索引',
  webhook: 'Webhook',
  subscriptions: '订阅',
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
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .toLowerCase()
}

const HERMES_DISABLED_IMAGE_GENERATION_SKILLS = new Set([
  'comfyui',
  'image-gen',
  'image-generation',
  'image_gen',
  'stable-diffusion',
])

function isHermesImageGenerationSkill(skill = {}) {
  const candidates = [
    skill.slug,
    skill.name,
    skill.file,
    skill.path,
  ].map(value => normalizeSkillKey(value)).filter(Boolean)
  return candidates.some(key => HERMES_DISABLED_IMAGE_GENERATION_SKILLS.has(key))
}

function withoutHermesImageGenerationSkills(list = []) {
  return (list || []).map(cat => ({
    ...cat,
    skills: (cat.skills || []).filter(skill => !isHermesImageGenerationSkill(skill)),
  })).filter(cat => (cat.skills || []).length > 0)
}

function cleanSkillDescription(desc) {
  const text = String(desc || '').trim()
  if (!text || /^[-—_]+$/.test(text)) return ''
  if (/^name\s*:/i.test(text)) return ''
  return text
}

function splitTranslationWords(text) {
  return String(text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[()：:,.，。]+/g, ' ')
    .split(/[\s_\-/]+/)
    .map(x => x.trim())
    .filter(Boolean)
}

function joinTranslationWords(parts) {
  return parts.reduce((out, part) => {
    if (!out) return part
    const needsSpace = /[A-Za-z0-9)]$/.test(out) || /^[A-Za-z0-9(]/.test(part)
    return out + (needsSpace ? ' ' : '') + part
  }, '')
}

function autoTranslateTitle(text, fallbackKey = '') {
  const raw = String(text || '').trim()
  if (!raw && !fallbackKey) return ''
  if (hasChineseText(raw)) return raw
  const key = normalizeSkillKey(fallbackKey || raw)
  if (SKILL_NAME_TRANSLATIONS_ZH[key]) return SKILL_NAME_TRANSLATIONS_ZH[key]
  const words = splitTranslationWords(raw || key)
  const translated = words
    .filter(w => !/^(for|and|or|the|a|an|with|to|of)$/i.test(w))
    .map(w => TRANSLATION_TERMS_ZH[w.toLowerCase()] || w)
  return joinTranslationWords(translated) || raw || key
}

function categoryDisplay(category) {
  const key = String(category || '').trim()
  const label = CATEGORY_TRANSLATIONS_ZH[key] || autoTranslateTitle(key, key)
  const labelLower = label.toLowerCase()
  const keyLower = key.toLowerCase()
  const original = label && key && labelLower !== keyLower && !labelLower.includes(keyLower) ? key.toUpperCase() : ''
  return {
    key,
    label,
    original,
    description: CATEGORY_DESCRIPTIONS_ZH[key] || '',
  }
}

function autoTranslateDescription(sourceDesc, title, categoryLabel) {
  if (hasChineseText(sourceDesc)) return sourceDesc
  const lower = String(sourceDesc || '').toLowerCase()
  const name = title || '该技能'
  if (lower.includes('github') || lower.includes('pull request') || lower.includes(' pr ')) {
    return `用于${name}相关的 GitHub 工作流。`
  }
  if (lower.includes('code') || lower.includes('debug') || lower.includes('test') || lower.includes('cli')) {
    return `用于${name}相关的软件开发任务。`
  }
  if (lower.includes('diagram') || lower.includes('chart') || lower.includes('draw')) {
    return `用于${name}相关的图表和结构化表达。`
  }
  if (lower.includes('image') || lower.includes('video') || lower.includes('audio') || lower.includes('design')) {
    return `用于${name}相关的创意与媒体任务。`
  }
  if (lower.includes('data') || lower.includes('notebook') || lower.includes('jupyter')) {
    return `用于${name}相关的数据分析任务。`
  }
  if (lower.includes('search') || lower.includes('research') || lower.includes('paper')) {
    return `用于${name}相关的信息检索和研究任务。`
  }
  if (lower.includes('home') || lower.includes('automation') || lower.includes('assistant')) {
    return `用于${name}相关的自动化和助手任务。`
  }
  return categoryLabel ? `用于${categoryLabel}中的${name}任务。` : `用于${name}相关任务。`
}

function skillDisplay(skill, category) {
  const key = normalizeSkillKey(skill?.slug || skill?.file || skill?.path || skill?.name)
  const originalName = String(skill?.name || key || '').trim()
  const title = SKILL_NAME_TRANSLATIONS_ZH[key] || autoTranslateTitle(originalName, key)
  const sourceDesc = cleanSkillDescription(skill?.description)
  const cat = categoryDisplay(category || skill?.category || '')
  const desc = SKILL_DESC_TRANSLATIONS_ZH[key]
    || (sourceDesc ? autoTranslateDescription(sourceDesc, title, cat.label) : '')
    || (cat.label ? `用于${cat.label}相关任务。` : `用于${title}相关任务。`)
  const original = originalName && originalName !== title ? originalName : ''
  return { key, title, original, desc }
}

const TOOLSET_DESCRIPTIONS_ZH = {
  web: '🔍 网页搜索与内容抓取',
  browser: '🌐 浏览器自动化操作',
  terminal: '💻 终端与进程管理',
  file: '📁 文件读写与搜索',
  code_execution: '⚡ 代码执行环境',
  vision: '👁️ 图片识别与视觉分析',
  video: '🎬 视频内容分析',
  video_gen: '🎬 视频生成',
  x_search: '🐦 X / Twitter 搜索',
  moa: '🧠 多智能体协作',
  tts: '🔊 文字转语音',
  skills: '📚 技能查看与管理',
  skills_hub: '📦 技能搜索与下载',
  skill_hub: '📦 技能搜索与下载',
  todo: '📋 任务规划与清单',
  memory: '💾 长期记忆',
  session_search: '🔎 会话搜索',
  clarify: '❓ 澄清问题',
  delegation: '👥 任务委派',
  cronjob: '⏰ 定时任务',
  messaging: '📨 跨平台消息',
  homeassistant: '🏠 智能家居',
  spotify: '🎵 Spotify 音乐',
  discord: '💬 Discord 读取与参与',
  discord_admin: '🛡️ Discord 服务器管理',
  yuanbao: '🤖 元宝',
  computer_use: '🖱️ 电脑操作（macOS）',
}

function toolsetDescription(name, fallback) {
  return TOOLSET_DESCRIPTIONS_ZH[name] || fallback || ''
}

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-skills-page'
  el.dataset.engine = 'hermes'

  // --- State ---
  let categories = []          // [{ category, description, skills: [...] }]
  let loading = true
  let loadError = ''
  let searchQuery = ''
  let collapsed = new Set()    // collapsed category names
  let toggling = new Set()     // slugs currently being toggled

  let activeSkill = null       // the selected `{ category, file, name, slug, description, path, isDir, enabled }`
  let skillContent = ''
  let loadingDetail = false

  let files = []               // attached files (excluding SKILL.md)
  let viewingFile = null       // relative path when browsing an attached file
  let fileContent = ''
  let loadingFile = false

  // Toolsets state — backend returns { raw: <stdout> }; we parse rows on the fly.
  // toolsets is null when never loaded, [] when loaded but empty/parse-failed.
  let toolsets = null          // [{ name, enabled, description }]
  let toolsetsRaw = ''         // raw stdout, kept for fallback display when parsing fails
  let toolsetsLoading = true

  // Install modal state
  let showInstallModal = false
  let installing = false
  let installTab = 'url'
  let installUrl = ''
  let installError = ''
  let installFileName = ''
  let installingPreset = ''

  // ============================================================ loaders

  async function loadSkills() {
    loading = true
    loadError = ''
    draw()
    try {
      // 首次打开时自动填充官方内置 skill（仅目标为空时执行一次）
      await api.hermesEnsureBuiltinSkills()
      categories = await api.hermesSkillsList()
    } catch (e) {
      console.error('Failed to load skills:', e)
      categories = []
      loadError = e?.message || String(e)
      toast(t('engine.skillsLoadFailed') + ': ' + (e?.message || e), 'error')
    }
    loading = false
    draw()
  }

  /**
   * Strip ANSI escape sequences (color/style/cursor) from a string.
   * Hermes' `tools list` may include them when stdout is detected as a TTY,
   * even though we capture via pipe — be defensive.
   */
  function stripAnsi(s) {
    if (!s) return ''
    // Standard CSI sequences: ESC [ ... letter
    return String(s).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
  }

  /**
   * Parse `hermes tools list --platform <p>` stdout. Format observed
   * (Hermes 0.6+):
   *
   *   Built-in toolsets (cli):
   *   ✓ enabled    web              🔍 Web Search & Scraping
   *   ✗ disabled   image_gen        🎨 Image Generation
   *   ...
   *
   * Returns an array; empty array means parse failed or no rows.
   */
  function parseToolsets(raw) {
    const clean = stripAnsi(raw || '')
    const out = []
    for (const line of clean.split(/\r?\n/)) {
      // Use [^\s] explicitly because emoji/multi-codepoint description part needs greedy tail.
      const m = line.match(/^\s*([✓✗])\s+(enabled|disabled)\s+(\S+)\s+(.+?)\s*$/u)
      if (!m) continue
      if (m[3] === 'image_gen') continue
      out.push({
        name: m[3],
        enabled: m[1] === '✓' || m[2] === 'enabled',
        description: toolsetDescription(m[3], m[4]),
      })
    }
    return out
  }

  async function loadToolsets() {
    toolsetsLoading = true
    draw()
    try {
      const r = await api.hermesToolsetsList()
      toolsetsRaw = r?.raw || ''
      toolsets = parseToolsets(toolsetsRaw)
    } catch (e) {
      console.error('Failed to load toolsets:', e)
      toolsetsRaw = ''
      toolsets = []
    } finally {
      toolsetsLoading = false
      draw()
    }
  }

  async function loadDetail(skill) {
    activeSkill = skill
    loadingDetail = true
    viewingFile = null
    fileContent = ''
    files = []
    skillContent = ''
    draw()

    // Kick off attached-file listing in parallel when the skill lives in a
    // directory (`isDir = true`). Legacy flat skills have no attached files.
    const contentPromise = api.hermesSkillDetail(skill.path)
      .then(c => { skillContent = c })
      .catch(e => { skillContent = `⚠️ ${t('engine.skillsLoadFailed')}: ${e?.message || e}` })
    const filesPromise = skill.isDir && skill.category && skill.category !== '_root'
      ? api.hermesSkillFiles(skill.category, skill.slug || skill.file)
          .then(list => { files = (list || []).filter(f => !f.isDir) })
          .catch(() => { files = [] })
      : Promise.resolve()

    await Promise.all([contentPromise, filesPromise])
    loadingDetail = false
    draw()
  }

  async function openFile(relPath) {
    if (!activeSkill?.isDir || !activeSkill.category) return
    viewingFile = relPath
    loadingFile = true
    fileContent = ''
    draw()
    try {
      const dir = activeSkill.skill_dir ||
        (activeSkill.path ? activeSkill.path.replace(/[\\/]SKILL\.md$/i, '') : '')
      const sep = /\\/.test(dir) && !/\//.test(dir) ? '\\' : '/'
      const full = dir ? `${dir}${sep}${relPath.replace(/\//g, sep)}` : relPath
      fileContent = await api.hermesSkillDetail(full)
    } catch (e) {
      fileContent = `⚠️ ${t('engine.skillsFileLoadFailed')}: ${e?.message || e}`
    }
    loadingFile = false
    draw()
  }

  function backToSkill() {
    viewingFile = null
    fileContent = ''
    draw()
  }

  async function handleToggle(skill, nextEnabled) {
    if (toggling.has(skill.slug)) return
    toggling.add(skill.slug)
    draw()
    try {
      await api.hermesSkillToggle(skill.slug, nextEnabled)
      skill.enabled = nextEnabled
      toast(
        nextEnabled ? t('engine.skillsEnabled') : t('engine.skillsDisabled'),
        'success',
      )
    } catch (e) {
      toast(t('engine.skillsToggleFailed') + ': ' + (e?.message || e), 'error')
    } finally {
      toggling.delete(skill.slug)
      draw()
    }
  }

  // ============================================================ derived

  function filteredCategories() {
    const visibleCategories = withoutHermesImageGenerationSkills(categories)
    if (!searchQuery) return visibleCategories
    const q = searchQuery.toLowerCase()
    return visibleCategories.map(cat => ({
      ...cat,
      skills: cat.skills.filter(s => {
        const d = skillDisplay(s, cat.category)
        return [
          s.name,
          s.slug,
          s.description,
          d.title,
          d.original,
          d.desc,
        ].filter(Boolean).some(v => String(v).toLowerCase().includes(q))
      }),
    })).filter(cat => {
      const cd = categoryDisplay(cat.category)
      return cat.skills.length > 0 ||
        [cat.category, cat.description, cd.label, cd.original, cd.description]
          .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    })
  }

  function totalSkillCount() {
    return withoutHermesImageGenerationSkills(categories).reduce((sum, cat) => sum + cat.skills.length, 0)
  }

  function enabledSkillCount() {
    return withoutHermesImageGenerationSkills(categories).reduce(
      (sum, cat) => sum + cat.skills.filter(s => s.enabled !== false).length,
      0,
    )
  }

  // ============================================================ render

  function renderSkillItem(cat, s) {
    const isActive = activeSkill?.path === s.path
    const isToggling = toggling.has(s.slug)
    const isEnabled = s.enabled !== false
    const display = skillDisplay(s, cat.category)
    const slug = s.slug || display.key
    return `
      <button class="hm-skill-item ${isActive ? 'is-active' : ''} ${!isEnabled ? 'is-disabled' : ''}"
              data-path="${escHtml(s.path)}" title="${escHtml(display.original || display.title)}">
        <div class="hm-skill-info">
          <div class="hm-skill-name">${escHtml(display.title)}</div>
          ${display.original ? `<div class="hm-skill-original">${candyNoteHtml(display.original)}</div>` : ''}
          <div class="hm-skill-desc">${candyNoteHtml(display.desc)}</div>
          ${slug ? `<div class="hm-skill-slug">${skillSlugHtml(slug)}</div>` : ''}
        </div>
        <label class="hm-switch ${isEnabled ? 'is-on' : ''} ${isToggling ? 'is-busy' : ''}"
               data-slug="${escHtml(s.slug)}" data-category="${escHtml(cat.category)}"
               title="${isEnabled ? t('engine.skillsDisable') : t('engine.skillsEnable')}">
          <span class="hm-switch-track"></span>
          <span class="hm-switch-thumb"></span>
        </label>
      </button>
    `
  }

  function renderCategory(cat) {
    const display = cat.category === '_root'
      ? { label: t('engine.skillsUncategorized'), original: '', description: '' }
      : categoryDisplay(cat.category)
    const isCollapsed = collapsed.has(cat.category)
    const desc = display.description || cleanSkillDescription(cat.description)
    return `
      <div class="hm-skill-category">
        <button class="hm-skill-cat-header ${isCollapsed ? 'is-collapsed' : ''}" data-cat="${escHtml(cat.category)}">
          <span class="hm-skill-cat-arrow">${ICONS.chevron}</span>
          <span class="hm-skill-cat-name">
            <span class="hm-skill-cat-title">${escHtml(display.label)}</span>
            ${display.original ? `<span class="hm-skill-cat-original">${candyNoteHtml(display.original)}</span>` : ''}
          </span>
          <span class="hm-skill-cat-count">${cat.skills.length}</span>
        </button>
        ${!isCollapsed ? `
          ${desc ? `<div class="hm-skill-cat-desc">${candyNoteHtml(desc)}</div>` : ''}
          <div class="hm-skill-cat-items">
            ${cat.skills.map(s => renderSkillItem(cat, s)).join('')}
          </div>
        ` : ''}
      </div>
    `
  }

  function renderSidebar() {
    const filtered = filteredCategories()
    return `
      <aside class="hm-skills-sidebar">
        <div class="hm-skills-sidebar-search">
          <span class="hm-skills-search-icon">${ICONS.search}</span>
          <input type="text" id="hm-skills-search" class="hm-skills-search-input"
                 placeholder="${t('engine.skillsSearch')}" value="${escHtml(searchQuery)}">
        </div>
        <div class="hm-skills-sidebar-scroll">
          ${loading ? `
            <div class="hm-skills-loading">
              <div class="hm-skel" style="height:18px;width:60%;margin-bottom:10px"></div>
              <div class="hm-skel" style="height:14px;width:85%;margin-bottom:6px"></div>
              <div class="hm-skel" style="height:14px;width:70%;margin-bottom:6px"></div>
              <div class="hm-skel" style="height:14px;width:90%"></div>
            </div>
          ` : ''}
          ${!loading && loadError ? `
            <div class="hm-skills-empty hm-skills-empty--error">
              <div class="hm-skills-empty-title">${t('engine.skillsLoadFailed')}</div>
              <div class="hm-skills-empty-sub">${escHtml(loadError)}</div>
            </div>
          ` : ''}
          ${!loading && !loadError && filtered.length === 0 ? `
            <div class="hm-skills-empty">
              ${searchQuery ? t('engine.skillsNoMatch') : t('engine.skillsEmpty')}
            </div>
          ` : ''}
          ${!loading && !loadError ? filtered.map(renderCategory).join('') : ''}
        </div>
      </aside>
    `
  }

  function renderEmpty(noSkills) {
    if (loadError) {
      return `
        <div class="hm-skills-detail-empty hm-skills-detail-empty--error">
          ${ICONS.empty}
          <div class="hm-skills-detail-empty-title">${t('engine.skillsLoadFailed')}</div>
          <div class="hm-skills-detail-empty-sub">${t('engine.skillsLoadAuthHint')}</div>
          <div class="hm-skills-detail-error">${escHtml(loadError)}</div>
        </div>
      `
    }
    if (noSkills) {
      return `
        <div class="hm-skills-detail-empty">
          ${ICONS.empty}
          <div class="hm-skills-detail-empty-title">暂无可用技能</div>
          <div class="hm-skills-detail-empty-sub">点击右上角「📦 安装技能」安装技能包。</div>
        </div>
      `
    }
    return `
      <div class="hm-skills-detail-empty">
        ${ICONS.empty}
        <div class="hm-skills-detail-empty-title">${t('engine.skillsSelectHint')}</div>
        <div class="hm-skills-detail-empty-sub">${t('engine.skillsSelectSub')}</div>
      </div>
    `
  }

  async function handleInstallFromUrl() {
    const urlInput = document.getElementById('hm-install-url-input')
    if (!urlInput) return
    const url = urlInput.value.trim()
    if (!url) { installError = '请输入 GitHub/official/skills-sh/SKILL.md/ZIP 地址'; draw(); return }
    installing = true
    installError = ''
    draw()
    try {
      const result = await api.hermesSkillInstall('online', url)
      categories = result || []
      loadError = ''
      showInstallModal = false
      installUrl = ''
      installError = ''
      installFileName = ''
      toast('技能安装成功', 'success')
    } catch (e) {
      installError = e?.message || String(e)
    }
    installing = false
    draw()
  }

  async function handleInstallPreset(presetId) {
    const preset = INSTALL_PRESETS.find(item => item.id === presetId)
    if (!preset || installing) return
    installing = true
    installingPreset = preset.id
    installError = ''
    draw()
    try {
      await api.hermesEnsureBuiltinSkills()
      categories = await api.hermesSkillsList()
      searchQuery = preset.search
      loadError = ''
      showInstallModal = false
      installUrl = ''
      installFileName = ''
      toast(`${preset.title} 已安装/已同步`, 'success')
    } catch (e) {
      installError = e?.message || String(e)
    } finally {
      installing = false
      installingPreset = ''
      draw()
    }
  }

  async function handleInstallFromFile(file) {
    if (!file) return
    if (!file.name.endsWith('.zip')) {
      installError = '仅支持 .zip 文件'
      draw()
      return
    }
    installing = true
    installError = ''
    installFileName = file.name
    draw()
    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      const result = await api.hermesSkillInstall('zip', base64)
      categories = result || []
      loadError = ''
      showInstallModal = false
      installUrl = ''
      installError = ''
      installFileName = ''
      toast('技能安装成功', 'success')
    } catch (e) {
      installError = e?.message || String(e)
    }
    installing = false
    draw()
  }

  function renderInstallModal() {
    if (!showInstallModal) return ''
    return `
      <div class="hm-modal-overlay" id="hm-install-overlay">
        <div class="hm-install-modal">
          <div class="hm-install-modal-header">
            <span class="hm-install-modal-title">📦 安装技能</span>
            <button class="hm-install-modal-close" id="hm-install-close">&times;</button>
          </div>
          <div class="hm-install-modal-body">
            <div class="hm-install-presets">
              <div class="hm-install-presets-head">
                <span class="hm-install-presets-title">快捷安装</span>
                <span class="hm-install-presets-sub">内置 Skills 会补缺同步，不覆盖你已有内容。</span>
              </div>
              <div class="hm-install-preset-grid">
                ${INSTALL_PRESETS.map(preset => `
                  <button class="hm-install-preset-card" data-install-preset="${escHtml(preset.id)}" ${installing ? 'disabled' : ''}>
                    <span class="hm-install-preset-icon">${preset.icon}</span>
                    <span class="hm-install-preset-main">
                      <span class="hm-install-preset-title">${escHtml(preset.title)}</span>
                      <span class="hm-install-preset-desc">${escHtml(preset.desc)}</span>
                    </span>
                    <span class="hm-install-preset-side">
                      <span class="hm-install-preset-badge">${escHtml(preset.badge)}</span>
                      <span class="hm-install-preset-action">${installingPreset === preset.id ? '同步中...' : '安装/同步'}</span>
                    </span>
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="hm-install-tabs">
              <button class="hm-install-tab ${installTab === 'url' ? 'is-active' : ''}" data-install-tab="url">在线安装</button>
              <button class="hm-install-tab ${installTab === 'file' ? 'is-active' : ''}" data-install-tab="file">从文件导入</button>
            </div>
            <div class="hm-install-panel">
              ${installTab === 'url' ? `
                <div class="hm-install-url-row">
                  <input type="text" class="hm-install-url-input" id="hm-install-url-input" placeholder="official/security/1password、openai/skills/skill-creator、GitHub 链接、SKILL.md 或 ZIP" value="${escHtml(installUrl)}">
                  <button class="hm-btn hm-btn--primary hm-btn--sm" id="hm-install-url-btn" ${installing ? 'disabled' : ''}>
                    ${installing ? '⏳ 安装中...' : '安装'}
                  </button>
                </div>
                <div class="hm-install-hint">
                  支持 Hermes 官方技能、skills-sh、GitHub 仓库目录、直接 SKILL.md 链接和 ZIP 包。在线安装会先由 Hermes 做安全扫描。
                </div>
              ` : `
                <div class="hm-install-file-row">
                  <input type="file" accept=".zip" id="hm-install-file-input" style="display:none">
                  <button class="hm-btn hm-btn--secondary hm-btn--sm" id="hm-install-file-btn" ${installing ? 'disabled' : ''}>
                    ${installing ? '⏳ 安装中...' : '选择 zip 文件'}
                  </button>
                  ${installFileName ? `<span class="hm-install-file-name">${escHtml(installFileName)}</span>` : ''}
                </div>
              `}
              ${installError ? `<div class="hm-install-error">${escHtml(installError)}</div>` : ''}
            </div>
          </div>
        </div>
      </div>
    `
  }

  function renderToolsets() {
    // 加载中骨架屏
    if (toolsetsLoading) {
      return `
        <section class="hm-toolsets">
          <div class="hm-toolsets-head">
            <div class="hm-toolsets-title-block">
              <div class="hm-toolsets-title">${t('engine.toolsetsTitle')}</div>
              <div class="hm-toolsets-sub">${t('engine.toolsetsSubtitle')}</div>
            </div>
          </div>
          <div class="hm-toolsets-grid">
            ${Array.from({ length: 8 }).map(() =>
              `<div class="hm-toolset-card hm-toolset-card--skel"><div class="hm-skel" style="width:55%;height:14px;margin-bottom:8px"></div><div class="hm-skel" style="width:80%;height:11px"></div></div>`
            ).join('')}
          </div>
        </section>
      `
    }

    const items = toolsets || []
    const activeCount = items.filter(x => x.enabled).length
    const total = items.length

    // 解析失败但有 raw 输出 → 显示原始内容
    if (total === 0 && toolsetsRaw && toolsetsRaw.trim()) {
      return `
        <section class="hm-toolsets">
          <div class="hm-toolsets-head">
            <div class="hm-toolsets-title-block">
              <div class="hm-toolsets-title">${t('engine.toolsetsTitle')}</div>
              <div class="hm-toolsets-sub">${t('engine.toolsetsSubtitle')}</div>
            </div>
            <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-toolsets-refresh">
              ${ICONS.refresh} ${t('engine.skillsRefresh')}
            </button>
          </div>
          <div class="hm-toolsets-fallback">
            <div class="hm-toolsets-fallback-hint">${t('engine.toolsetsParseFailed')}</div>
            <pre class="hm-toolsets-fallback-pre">${escHtml(stripAnsi(toolsetsRaw))}</pre>
          </div>
        </section>
      `
    }

    // 完全空（hermes 没装/版本太老）
    if (total === 0) {
      return `
        <section class="hm-toolsets">
          <div class="hm-toolsets-head">
            <div class="hm-toolsets-title-block">
              <div class="hm-toolsets-title">${t('engine.toolsetsTitle')}</div>
              <div class="hm-toolsets-sub">${t('engine.toolsetsSubtitle')}</div>
            </div>
            <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-toolsets-refresh">
              ${ICONS.refresh} ${t('engine.skillsRefresh')}
            </button>
          </div>
          <div class="hm-toolsets-empty">${t('engine.toolsetsEmpty')}</div>
        </section>
      `
    }

    // 正常态
    const countLabel = t('engine.toolsetsActiveCount')
      .replace('{n}', String(activeCount))
      .replace('{total}', String(total))
    return `
      <section class="hm-toolsets">
        <div class="hm-toolsets-head">
          <div class="hm-toolsets-title-block">
            <div class="hm-toolsets-title">
              ${t('engine.toolsetsTitle')}
              <span class="hm-toolsets-count">${countLabel}</span>
            </div>
            <div class="hm-toolsets-sub">${t('engine.toolsetsSubtitle')}</div>
          </div>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-toolsets-refresh">
            ${ICONS.refresh} ${t('engine.skillsRefresh')}
          </button>
        </div>
        <div class="hm-toolsets-grid">
          ${items.map(it => `
            <div class="hm-toolset-card ${it.enabled ? 'is-on' : 'is-off'}" title="${escHtml(it.description)}">
              <div class="hm-toolset-card-row">
                <span class="hm-toolset-status ${it.enabled ? 'is-on' : 'is-off'}">${it.enabled ? '✓' : '✗'}</span>
                <span class="hm-toolset-name">${escHtml(it.name)}</span>
              </div>
              <div class="hm-toolset-desc">${escHtml(it.description)}</div>
            </div>
          `).join('')}
        </div>
        <div class="hm-toolsets-hint">${t('engine.toolsetsHint')}</div>
      </section>
    `
  }

  function renderDetail() {
    if (!activeSkill) return renderEmpty(categories.length === 0)
    if (loadingDetail) {
      return `
        <div class="hm-skills-detail-body">
          <div class="hm-skel" style="height:24px;width:40%;margin-bottom:18px"></div>
          <div class="hm-skel" style="height:14px;width:100%;margin-bottom:8px"></div>
          <div class="hm-skel" style="height:14px;width:95%;margin-bottom:8px"></div>
          <div class="hm-skel" style="height:14px;width:70%"></div>
        </div>
      `
    }

    const activeDisplay = skillDisplay(activeSkill, activeSkill.category)
    const activeCategory = activeSkill.category && activeSkill.category !== '_root'
      ? categoryDisplay(activeSkill.category)
      : null

    // --- File view (attached file of a skill) ---
    if (viewingFile) {
      return `
        <div class="hm-skills-detail-breadcrumb">
          <button class="hm-skills-back-btn" id="hm-skills-back">
            ${ICONS.back}<span>${t('engine.skillsBackTo')} ${escHtml(activeDisplay.title)}</span>
          </button>
          <span class="hm-skills-breadcrumb-sep">/</span>
          <span class="hm-skills-breadcrumb-path">${escHtml(viewingFile)}</span>
        </div>
        <div class="hm-skills-detail-body">
          ${loadingFile
            ? `<div class="hm-skills-loading">${t('engine.skillsLoading')}</div>`
            : `<div class="hm-skills-markdown">${mdToHtml(fileContent)}</div>`}
        </div>
      `
    }

    // --- Skill content view ---
    return `
      <div class="hm-skills-detail-head">
        <div class="hm-skills-detail-title">
          ${activeCategory ? `
            <span class="hm-skills-title-cat">${escHtml(activeCategory.label)}</span>
            ${activeCategory.original ? `<span class="hm-skills-title-cat-original">${escHtml(activeCategory.original)}</span>` : ''}
            <span class="hm-skills-title-sep">/</span>
          ` : ''}
          <span class="hm-skills-title-name">${escHtml(activeDisplay.title)}</span>
          ${activeDisplay.original ? `<span class="hm-skills-title-original">${escHtml(activeDisplay.original)}</span>` : ''}
          ${activeSkill.enabled === false
            ? `<span class="hm-pill hm-pill--muted hm-skills-status">${t('engine.skillsDisabledTag')}</span>`
            : `<span class="hm-pill hm-pill--ok hm-skills-status">${t('engine.skillsEnabledTag')}</span>`}
        </div>
        <div class="hm-skills-detail-sub">
          ${activeSkill.isDir ? ICONS.folder : ICONS.file}
          <span>${escHtml(activeSkill.file)}</span>
        </div>
      </div>
      <div class="hm-skills-detail-body">
        <div class="hm-skills-markdown">${mdToHtml(skillContent)}</div>
      </div>
      ${files.length > 0 ? `
        <div class="hm-skills-files">
          <div class="hm-skills-files-header">
            <span class="hm-skills-files-label">${t('engine.skillsAttachedFiles')}</span>
            <span class="hm-skills-files-count">${files.length}</span>
          </div>
          <div class="hm-skills-files-list">
            ${files.map(f => `
              <button class="hm-skills-file-chip" data-file="${escHtml(f.path)}" title="${escHtml(f.path)}">
                ${f.isDir ? ICONS.folder : ICONS.file}
                <span>${escHtml(basename(f.path))}</span>
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `
  }

  function draw() {
    const enabled = enabledSkillCount()
    const total = totalSkillCount()
    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">
            <span class="hm-dot hm-dot--idle"></span>
            ${t('engine.skillsEyebrow')}
          </div>
          <h1 class="hm-hero-h1">${t('engine.hermesSkillsTitle')}</h1>
          <div class="hm-hero-sub">~/.hermes/skills/
            ${!loading ? `<span class="hm-skills-count-inline"> · ${loadError ? t('engine.skillsLoadFailed') : `${enabled}/${total} ${t('engine.skillsActive')}`}</span>` : ''}
          </div>
        </div>
        <div class="hm-hero-actions">
          <a class="hm-btn hm-btn--ghost hm-btn--sm" href="https://hermes-agent.nousresearch.com/docs/skills/?utm_source=chatgpt.com" target="_blank" rel="noopener">
            Skills 商城
          </a>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-skills-install">
            📦 安装技能
          </button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-skills-refresh" ${loading ? 'disabled' : ''}>
            ${ICONS.refresh} ${t('engine.skillsRefresh')}
          </button>
        </div>
      </div>

      ${renderToolsets()}

      <div class="hm-skills-layout">
        ${renderSidebar()}
        <section class="hm-skills-main">${renderDetail()}</section>
      </div>

      ${renderInstallModal()}
    `
    bind()
  }

  // ============================================================ bindings

  function bind() {
    el.querySelector('#hm-skills-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value
      draw()
    })

    el.querySelector('#hm-skills-refresh')?.addEventListener('click', () => loadSkills())
    el.querySelector('#hm-toolsets-refresh')?.addEventListener('click', () => loadToolsets())

    el.querySelectorAll('.hm-skill-cat-header').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat
        if (collapsed.has(cat)) collapsed.delete(cat)
        else collapsed.add(cat)
        draw()
      })
    })

    el.querySelectorAll('.hm-skill-item').forEach(item => {
      item.addEventListener('click', (evt) => {
        // Toggle switch clicks should NOT open the skill detail.
        if (evt.target.closest('.hm-switch')) return
        const skillPath = item.dataset.path
        for (const cat of categories) {
          const s = cat.skills.find(x => x.path === skillPath)
          if (s) { loadDetail({ ...s, category: cat.category }); return }
        }
      })
    })

    el.querySelectorAll('.hm-switch').forEach(sw => {
      sw.addEventListener('click', (evt) => {
        evt.stopPropagation()
        if (sw.classList.contains('is-busy')) return
        const slug = sw.dataset.slug
        const catName = sw.dataset.category
        const cat = categories.find(c => c.category === catName)
        const skill = cat?.skills.find(s => s.slug === slug)
        if (!skill) return
        handleToggle(skill, skill.enabled === false)
      })
    })

    el.querySelector('#hm-skills-back')?.addEventListener('click', backToSkill)

    el.querySelectorAll('.hm-skills-file-chip').forEach(chip => {
      chip.addEventListener('click', () => openFile(chip.dataset.file))
    })

    // --- Install modal bindings ---
    el.querySelector('#hm-skills-install')?.addEventListener('click', () => {
      showInstallModal = true
      installError = ''
      installUrl = ''
      installFileName = ''
      installingPreset = ''
      draw()
    })

    el.querySelector('#hm-install-close')?.addEventListener('click', () => {
      showInstallModal = false
      draw()
    })

    el.querySelector('#hm-install-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        showInstallModal = false
        draw()
      }
    })

    el.querySelectorAll('[data-install-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        installTab = btn.dataset.installTab
        installError = ''
        draw()
      })
    })

    el.querySelectorAll('[data-install-preset]').forEach(btn => {
      btn.addEventListener('click', () => handleInstallPreset(btn.dataset.installPreset))
    })

    el.querySelector('#hm-install-url-btn')?.addEventListener('click', handleInstallFromUrl)

    el.querySelector('#hm-install-url-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleInstallFromUrl()
    })

    el.querySelector('#hm-install-file-btn')?.addEventListener('click', () => {
      document.getElementById('hm-install-file-input')?.click()
    })

    el.querySelector('#hm-install-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0]
      if (file) handleInstallFromFile(file)
    })
  }

  loadSkills()
  loadToolsets()
  return el
}
