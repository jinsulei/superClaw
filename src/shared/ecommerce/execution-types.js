export const ECOMMERCE_EXECUTION_STATUS = Object.freeze({
  REAL: 'real',
  STUB_ONLY: 'stub_only',
  MISSING: 'missing',
  BLOCKED_BY_SAFETY: 'blocked_by_safety',
  NEEDS_TOOLING: 'needs_tooling',
})

export const ECOMMERCE_AGENT_ROLE = Object.freeze({
  OPENCLAW_RUNTIME: 'openclaw_runtime_executor',
  HERMES_SUPERVISOR: 'hermes_supervisor',
  CLAUDECODE_DEV_ASSIST: 'claudecode_dev_assist',
})

export const ECOMMERCE_PLATFORMS = Object.freeze([
  'douyin',
  'kuaishou',
  'shipinhao',
  'xiaohongshu',
  'taobao',
  'tmall',
  'pdd',
  'doudian',
])

export const ECOMMERCE_TASK_TYPES = Object.freeze({
  BROWSER_AUTOMATION: 'browser_automation',
  OCR_READ: 'ocr_read',
  PLATFORM_HOTWORD_SEARCH: 'platform_hotword_search',
  SHOP_MANAGEMENT: 'shop_management',
  PUBLISH_FLOW: 'publish_flow',
  COMMENT_REPLY: 'comment_reply',
  VIDEO_LINK_PATROL: 'video_link_patrol',
  HERMES_LINK_READER: 'hermes_link_reader',
  HERMES_OPENCLAW_SUPERVISOR: 'hermes_openclaw_supervisor',
  SCHEDULER_SUPERVISION: 'scheduler_supervision',
  CLAUDECODE_DEV_ASSIST: 'claudecode_dev_assist',
})

export const ECOMMERCE_EXECUTION_GAP_ITEMS = Object.freeze([
  {
    id: 1,
    type: ECOMMERCE_TASK_TYPES.BROWSER_AUTOMATION,
    label: 'Browser automation execution chain',
    owner: ECOMMERCE_AGENT_ROLE.OPENCLAW_RUNTIME,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.REAL,
    sourceFiles: [
      'src-tauri/resources/runtime/openclaw/dist/extensions/desktop-control/index.js',
      'src/shared/ecommerce-stage1/runner.js',
      'src/shared/ecommerce-stage2/runner.js',
      'src/shared/ecommerce-stage4/runner.js',
    ],
  },
  {
    id: 2,
    type: ECOMMERCE_TASK_TYPES.OCR_READ,
    label: 'OCR read chain',
    owner: ECOMMERCE_AGENT_ROLE.OPENCLAW_RUNTIME,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.REAL,
    sourceFiles: [
      'src-tauri/resources/runtime/ocr/ocr-runner.cjs',
      'src-tauri/src/commands/ocr.rs',
      'src/lib/ocr-service.js',
      'src/shared/ecommerce-stage56/runner.js',
    ],
  },
  {
    id: 3,
    type: ECOMMERCE_TASK_TYPES.PLATFORM_HOTWORD_SEARCH,
    label: 'Platform hotword search',
    owner: ECOMMERCE_AGENT_ROLE.OPENCLAW_RUNTIME,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    sourceFiles: ['src/shared/ecommerce-stage2/runner.js'],
  },
  {
    id: 4,
    type: ECOMMERCE_TASK_TYPES.SHOP_MANAGEMENT,
    label: 'Doudian and shop management',
    owner: ECOMMERCE_AGENT_ROLE.OPENCLAW_RUNTIME,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    sourceFiles: ['src/shared/ecommerce-stage4/runner.js'],
  },
  {
    id: 5,
    type: ECOMMERCE_TASK_TYPES.PUBLISH_FLOW,
    label: 'Video and material publish flow',
    owner: ECOMMERCE_AGENT_ROLE.OPENCLAW_RUNTIME,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY,
    sourceFiles: ['src/shared/ecommerce-stage3/runner.js'],
  },
  {
    id: 6,
    type: ECOMMERCE_TASK_TYPES.COMMENT_REPLY,
    label: 'Comment and live chat reply draft',
    owner: ECOMMERCE_AGENT_ROLE.OPENCLAW_RUNTIME,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.BLOCKED_BY_SAFETY,
    sourceFiles: ['src/shared/ecommerce-stage56/runner.js'],
  },
  {
    id: 7,
    type: ECOMMERCE_TASK_TYPES.VIDEO_LINK_PATROL,
    label: 'Video patrol and candidate link filtering',
    owner: ECOMMERCE_AGENT_ROLE.OPENCLAW_RUNTIME,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    sourceFiles: ['src/shared/ecommerce-stage56/runner.js'],
  },
  {
    id: 8,
    type: ECOMMERCE_TASK_TYPES.HERMES_LINK_READER,
    label: 'Hermes link reader and video breakdown',
    owner: ECOMMERCE_AGENT_ROLE.HERMES_SUPERVISOR,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.NEEDS_TOOLING,
    sourceFiles: ['src/engines/hermes/lib/hermes-ecommerce-link-reader.js'],
  },
  {
    id: 9,
    type: ECOMMERCE_TASK_TYPES.HERMES_OPENCLAW_SUPERVISOR,
    label: 'Hermes supervises OpenClaw',
    owner: ECOMMERCE_AGENT_ROLE.HERMES_SUPERVISOR,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.STUB_ONLY,
    sourceFiles: [
      'src/engines/hermes/lib/hermes-ecommerce-orchestrator.js',
      'src/engines/hermes/lib/hermes-openclaw-supervisor.js',
    ],
  },
  {
    id: 10,
    type: ECOMMERCE_TASK_TYPES.SCHEDULER_SUPERVISION,
    label: 'Scheduled task supervision',
    owner: ECOMMERCE_AGENT_ROLE.HERMES_SUPERVISOR,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.MISSING,
    sourceFiles: [],
  },
  {
    id: 11,
    type: ECOMMERCE_TASK_TYPES.CLAUDECODE_DEV_ASSIST,
    label: 'ClaudeCode ecommerce development assistance',
    owner: ECOMMERCE_AGENT_ROLE.CLAUDECODE_DEV_ASSIST,
    currentStatus: ECOMMERCE_EXECUTION_STATUS.STUB_ONLY,
    sourceFiles: [
      'src-tauri/resources/runtime/claude-panel/ecommerce-dev-assist.js',
      'src-tauri/resources/runtime/claude-panel/ecommerce-code-assist.js',
    ],
  },
])

export function getEcommerceExecutionGapItems() {
  return ECOMMERCE_EXECUTION_GAP_ITEMS.map((item) => ({
    ...item,
    sourceFiles: item.sourceFiles.slice(),
  }))
}

export function getEcommerceTaskType(value = '') {
  const normalized = String(value || '').trim()
  return Object.values(ECOMMERCE_TASK_TYPES).includes(normalized) ? normalized : null
}
