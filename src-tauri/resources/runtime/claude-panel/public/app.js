const $ = (selector) => document.querySelector(selector);

const introOverlay = $("#introOverlay");
const introVideo = $("#introVideo");
const introSkipBtn = $("#introSkipBtn");
const introStatus = $("#introStatus");
const projectSelect = $("#projectSelect");
const projectTabBtn = $("#projectTabBtn");
const projectAddTrigger = $("#projectAddTrigger");
const modelInput = $("#modelInput");
const providerLine = $("#providerLine");
const authDot = $("#authDot");
const authText = $("#authText");
const currentProject = $("#currentProject");
const projectPath = $("#projectPath");
const runStateChip = $("#runStateChip");
const claudePet = $("#claudePet");
const claudePetStatus = $("#claudePetStatus");
const claudePetMood = $("#claudePetMood");
const claudePetBubble = $("#claudePetBubble");
const claudePetStartBtn = $("#claudePetStartBtn");
const claudePetVideo = $("#claudePetVideo");
const topbarPet = $("#topbarPet");
const topbarPetVideo = $("#topbarPetVideo");
const topbarPetLabel = $("#topbarPetLabel");
const sidebarPetDock = $("#sidebarPetDock");
const sidebarPetVideo = $("#sidebarPetVideo");
const sidebarPetTitle = $("#sidebarPetTitle");
const sidebarPetText = $("#sidebarPetText");
const modelChip = $("#modelChip");
const hostChip = $("#hostChip");
const mainModelLabel = $("#mainModelLabel");
const branchModelLabel = $("#branchModelLabel");
const mainModelMenu = $("#mainModelMenu");
const branchModelMenu = $("#branchModelMenu");
const useMainModelBtn = $("#useMainModelBtn");
const branchModelOptions = $("#branchModelOptions");
const versionLine = $("#versionLine");
const hostLine = $("#hostLine");
const modeNote = $("#modeNote");
const modeDetails = $("#modeDetails");
const relayBadge = $("#relayBadge");
const relayWriteState = $("#relayWriteState");
const relayNote = $("#relayNote");
const relayToggle = $("#relayToggle");
const relayForm = $("#relayForm");
const relayName = $("#relayName");
const relayProvider = $("#relayProvider");
const relayBaseUrl = $("#relayBaseUrl");
const relayModel = $("#relayModel");
const relayApiKey = $("#relayApiKey");
const relayEnabled = $("#relayEnabled");
const relaySaveBtn = $("#relaySaveBtn");
const relayTestBtn = $("#relayTestBtn");
const relayTestResult = $("#relayTestResult");
const relayFormNote = $("#relayFormNote");
const diagnosticsBtn = $("#diagnosticsBtn");
const diagnosticsCopyBtn = $("#diagnosticsCopyBtn");
const diagnosticsDownloadBtn = $("#diagnosticsDownloadBtn");
const diagnosticsStatus = $("#diagnosticsStatus");
const diagnosticsOutput = $("#diagnosticsOutput");
const usageGuideBtn = $("#usageGuideBtn");
const faqBtn = $("#faqBtn");
const permissionHelpBtn = $("#permissionHelpBtn");
const configChecklist = $("#configChecklist");
const configChecklistSummary = $("#configChecklistSummary");
const helpDialog = $("#helpDialog");
const helpDialogTitle = $("#helpDialogTitle");
const helpDialogBody = $("#helpDialogBody");
const helpDialogClose = $("#helpDialogClose");
const setupWizard = $("#setupWizard");
const setupMissingList = $("#setupMissingList");
const setupInterfaceType = $("#setupInterfaceType");
const setupApiKey = $("#setupApiKey");
const setupSavedKeyState = $("#setupSavedKeyState");
const setupBaseUrl = $("#setupBaseUrl");
const setupMainModel = $("#setupMainModel");
const setupBranchModel = $("#setupBranchModel");
const setupProjectPath = $("#setupProjectPath");
const setupTestBtn = $("#setupTestBtn");
const setupTestResult = $("#setupTestResult");
const setupSaveBtn = $("#setupSaveBtn");
const setupSkipBtn = $("#setupSkipBtn");
const setupWizardError = $("#setupWizardError");
const setupOpenBtn = $("#setupOpenBtn");
const setupOpenHint = $("#setupOpenHint");
const superclawConsoleLinks = document.querySelectorAll("[data-superclaw-route]");
const accountMenuButton = $("#accountMenuButton");
const accountMenu = $("#accountMenu");
const accountEmailLabel = $("#accountEmailLabel");
const accountInfoDialog = $("#accountInfoDialog");
const accountInfoDialogTitle = $("#accountInfoDialogTitle");
const accountInfoDialogClose = $("#accountInfoDialogClose");
const accountProfilePanel = $("#accountProfilePanel");
const accountContactPanel = $("#accountContactPanel");
const accountDisplayNameInput = $("#accountDisplayNameInput");
const accountSaveNameBtn = $("#accountSaveNameBtn");
const accountChangePasswordBtn = $("#accountChangePasswordBtn");
const contactQrImage = $("#contactQrImage");
const contactQrPlaceholder = $("#contactQrPlaceholder");
const contactNameLabel = $("#contactNameLabel");
const contactWechatLabel = $("#contactWechatLabel");
const contactNoteLabel = $("#contactNoteLabel");
const contactEmailLabel = $("#contactEmailLabel");
const announcementShell = $("#announcementShell");
const announcementTimer = $("#announcementTimer");
const announcementTrack = $("#announcementTrack");
const conversationList = $("#conversationList");
const showArchivedToggle = $("#showArchivedToggle");
const conversationSearchToggleBtn = $("#conversationSearchToggleBtn");
const conversationSearchWrap = $("#conversationSearchWrap");
const conversationSearchInput = $("#conversationSearchInput");
const quickCommands = $("#quickCommands");
const pluginInput = $("#pluginInput");
const pluginPromptBtn = $("#pluginPromptBtn");
const skillInput = $("#skillInput");
const skillPromptBtn = $("#skillPromptBtn");
const installedExtensionsBtn = $("#installedExtensionsBtn");
const extensionsPage = $("#extensionsPage");
const extensionsPageCloseBtn = $("#extensionsPageCloseBtn");
const installedSkillsList = $("#installedSkillsList");
const installedPluginsList = $("#installedPluginsList");
const pluginSummary = $("#pluginSummary");
const skillsSummary = $("#skillsSummary");
const promptForm = $("#promptForm");
const promptInput = $("#promptInput");
const slashCommandMenu = $("#slashCommandMenu");
const temporaryTaskBar = $("#temporaryTaskBar");
const temporaryTaskTitle = $("#temporaryTaskTitle");
const temporaryTaskMeta = $("#temporaryTaskMeta");
const temporaryTaskCancelBtn = $("#temporaryTaskCancelBtn");
const transcript = $("#transcript");
const sendBtn = $("#sendBtn");
const stopBtn = $("#stopBtn");
const refreshBtn = $("#refreshBtn");
const selfTestBtn = $("#selfTestBtn");
const launchBtn = $("#launchBtn");
const versionUpdateBtn = $("#versionUpdateBtn");
const themeToggleBtn = $("#themeToggleBtn");
const themeToggleLabel = $("#themeToggleLabel");
const themePresetButtons = Array.from(document.querySelectorAll("[data-color-theme]"));
const themePresetHint = $("#themePresetHint");
const feishuTutorialBtn = $("#feishuTutorialBtn");
const feishuTutorialStatus = $("#feishuTutorialStatus");
const rightPanelToggleBtn = $("#rightPanelToggleBtn");
const workspaceSearch = $("#workspaceSearch");
const newConversationBtn = $("#newConversationBtn");
const projectNameDialog = $("#projectNameDialog");
const projectNameInput = $("#projectNameInput");
const projectNameCreateBtn = $("#projectNameCreateBtn");
const projectNameCancelBtn = $("#projectNameCancelBtn");
const projectNameError = $("#projectNameError");
const automationForm = $("#automationForm");
const automationName = $("#automationName");
const automationPrompt = $("#automationPrompt");
const automationList = $("#automationList");
const automationCount = $("#automationCount");
const scheduleForm = $("#scheduleForm");
const scheduleName = $("#scheduleName");
const scheduleAt = $("#scheduleAt");
const schedulePrompt = $("#schedulePrompt");
const scheduleEnabled = $("#scheduleEnabled");
const scheduleList = $("#scheduleList");
const scheduleCount = $("#scheduleCount");
const continueToggle = $("#continueToggle");
const permissionMenuButton = $("#permissionMenuButton");
const permissionMenuLabel = $("#permissionMenuLabel");
const permissionMenu = $("#permissionMenu");
const composerPermissionButton = $("#composerPermissionButton");
const composerPermissionLabel = $("#composerPermissionLabel");
const composerPermissionIcon = $("#composerPermissionIcon");
const composerPermissionMenu = $("#composerPermissionMenu");
const toolAccessLabel = $("#toolAccessLabel");
const riskLevelLabel = $("#riskLevelLabel");
const imageUploadInput = $("#imageUploadInput");
const quickAttachBtn = $("#quickAttachBtn");
const voiceModeBtn = $("#voiceModeBtn");
const attachmentPreview = $("#attachmentPreview");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const composerModeButtons = Array.from(document.querySelectorAll("[data-composer-mode]"));
const workspaceTabButtons = Array.from(document.querySelectorAll("[data-workspace-tab]"));
const workspacePanes = Array.from(document.querySelectorAll("[data-workspace-pane]"));
const runPanel = document.querySelector(".run-panel");
const runTabButtons = Array.from(document.querySelectorAll("[data-run-tab]"));

const cwdStorageKey = "cleanClaude.cwd.v2";
const modelStorageKey = "cleanClaude.model";
const conversationsStorageKey = "cleanClaude.conversations.v1";
const rightPanelCollapsedKey = "cleanClaude.rightPanelCollapsed.v1";
const themeStorageKey = "cleanClaude.theme.v1";
const colorThemeStorageKey = "cleanClaude.colorTheme.v1";
const automationsStorageKey = "cleanClaude.automations.v1";
const schedulesStorageKey = "cleanClaude.schedules.v1";
const temporaryTaskStorageKey = "cleanClaude.temporaryTask.v1";
const setupDismissedKey = "cleanClaude.setupDismissed.session";
const superclawBaseStorageKey = "cleanClaude.superclawBase.v1";
const fallbackSuperclawBase = "http://127.0.0.1:1420";
let consoleSwitchProgressFrame = null;
let consoleSwitchProgressTimer = null;
const accountNameStorageKey = "cleanClaude.accountName.v1";
const petSyncStorageKey = "cleanClaude.petSyncEnabled.v1";
const petWorkStartedStorageKey = "cleanClaude.petWorkStartedAt.v1";
const petLastRestStorageKey = "cleanClaude.petLastRestAt.v1";
const browserAccessAlwaysKey = "cleanClaude.browserAccessAlways.session";
const petRestIntervalMs = 45 * 60 * 1000;
const announcementVisibleMs = 60 * 1000;
const slashCommands = [
  { command: "/help", description: "显示可用命令", action: "help" },
  { command: "/status", description: "查看 Gateway 与模型状态", action: "status" },
  { command: "/doctor", description: "生成本地诊断报告", action: "doctor" },
  { command: "/clear", description: "清空当前会话", action: "clear" },
  { command: "/new", description: "新建工程文件", action: "new" },
  { command: "/model", description: "切换主模型 / 分支模型", action: "model" },
  { command: "/permissions", description: "查看权限模式", action: "permissions" },
  { command: "/config", description: "打开接口配置", action: "config" },
  { command: "/init", description: "初始化项目记忆 CLAUDE.md", action: "native" },
  { command: "/memory", description: "打开 Claude 记忆编辑", action: "native" },
  { command: "/compact", description: "压缩当前上下文", action: "native" },
  { command: "/mcp", description: "管理 MCP 连接", action: "native" },
];

function normalizeSuperclawBase(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    const base = url.origin && url.origin !== "null" ? url.origin : `${url.protocol}//${url.host}`;
    if (!url.host || url.host === window.location.host) return "";
    return base.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function resolveSuperclawBase() {
  const params = new URLSearchParams(window.location.search);
  let base = normalizeSuperclawBase(params.get("superclawBase"));
  if (!base) base = normalizeSuperclawBase(document.referrer);
  if (base) {
    try {
      window.localStorage.setItem(superclawBaseStorageKey, base);
    } catch {}
    return base;
  }

  try {
    base = normalizeSuperclawBase(window.localStorage.getItem(superclawBaseStorageKey));
  } catch {
    base = "";
  }
  return base || fallbackSuperclawBase;
}

function getSuperclawTargetCopy(route) {
  const normalizedRoute = String(route || "").startsWith("/") ? String(route || "") : `/${route || ""}`;
  if (normalizedRoute.startsWith("/h/")) {
    return {
      name: "Hermes",
      kicker: "Claude 到 Hermes",
      title: "正在进入 Hermes Agent",
      subtitle: "同步控制台路由和 Hermes 工作区",
    };
  }
  if (normalizedRoute === "/dashboard" || normalizedRoute.startsWith("/dashboard") || normalizedRoute.startsWith("/chat")) {
    return {
      name: "OpenClaw",
      kicker: "Claude 到 OpenClaw",
      title: "正在展开 OpenClaw 工作区",
      subtitle: "同步控制台路由和 OpenClaw 会话区",
    };
  }
  return {
    name: "SuperClaw",
    kicker: "Claude 到 SuperClaw",
    title: "正在进入 SuperClaw",
    subtitle: "同步控制台路由和工作区",
  };
}

function setConsoleSwitchProgress(overlay, value) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fill = overlay?.querySelector("[data-console-switch-fill]");
  const percent = overlay?.querySelector("[data-console-switch-percent]");
  if (fill) fill.style.width = `${pct}%`;
  if (percent) percent.textContent = `${pct}%`;
}

function clearConsoleSwitchProgress() {
  if (consoleSwitchProgressFrame) {
    cancelAnimationFrame(consoleSwitchProgressFrame);
    consoleSwitchProgressFrame = null;
  }
  if (consoleSwitchProgressTimer) {
    clearTimeout(consoleSwitchProgressTimer);
    consoleSwitchProgressTimer = null;
  }
  document.querySelectorAll(".console-switch-progress-overlay").forEach((node) => node.remove());
}

function showConsoleSwitchProgress(route) {
  clearConsoleSwitchProgress();
  const copy = getSuperclawTargetCopy(route);
  const overlay = document.createElement("div");
  overlay.className = "console-switch-progress-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="console-switch-progress-card">
      <div class="console-switch-progress-top">
        <div>
          <div class="console-switch-progress-kicker">${copy.kicker}</div>
          <div class="console-switch-progress-title">${copy.title}</div>
        </div>
        <span class="console-switch-progress-percent" data-console-switch-percent>0%</span>
      </div>
      <div class="console-switch-progress-track">
        <span data-console-switch-fill style="width:0%"></span>
      </div>
      <div class="console-switch-progress-meta">${copy.subtitle}</div>
    </div>`;
  document.body.appendChild(overlay);

  setConsoleSwitchProgress(overlay, 4);
  requestAnimationFrame(() => overlay.classList.add("is-visible"));

  const startedAt = performance.now();
  const duration = 900;
  const tick = (now) => {
    const elapsed = Math.min(now - startedAt, duration);
    const ratio = elapsed / duration;
    const eased = 1 - Math.pow(1 - ratio, 3);
    setConsoleSwitchProgress(overlay, 4 + eased * 88);
    if (ratio < 1) {
      consoleSwitchProgressFrame = requestAnimationFrame(tick);
    }
  };
  consoleSwitchProgressFrame = requestAnimationFrame(tick);
  return overlay;
}

function handleSuperclawConsoleLinkClick(event) {
  if (event.defaultPrevented) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const link = event.currentTarget;
  const href = link?.href;
  if (!href) return;

  event.preventDefault();
  const route = link.dataset.superclawRoute || "/h/chat";
  const overlay = showConsoleSwitchProgress(route);
  consoleSwitchProgressTimer = setTimeout(() => {
    setConsoleSwitchProgress(overlay, 100);
    window.location.assign(href);
  }, 920);
}

function syncSuperclawConsoleLinks() {
  const base = resolveSuperclawBase();
  superclawConsoleLinks.forEach((link) => {
    const route = link.dataset.superclawRoute || "/h/chat";
    const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
    link.href = `${base}/#${normalizedRoute}`;
    if (!link.dataset.switchProgressBound) {
      link.addEventListener("click", handleSuperclawConsoleLinkClick);
      link.dataset.switchProgressBound = "1";
    }
  });
}

const claudePetVideoMap = {
  idle: "/pet-videos/fun/idle-breathe.webm",
  paused: "/pet-videos/fun/idle-breathe.webm",
  rest: "/pet-videos/fun/rest-bounce.webm",
  performance: "/pet-videos/fun/stuck-jitter.webm",
  thinking: "/pet-videos/fun/stuck-jitter.webm",
  encourage: "/pet-videos/fun/idle-breathe.webm",
  celebrate: "/pet-videos/fun/celebrate-pop.webm",
  comfort: "/pet-videos/transparent/05-frustration-cheer.webm",
  grumble: "/pet-videos/transparent/06-repeat-comfort.webm",
  complain: "/pet-videos/transparent/06-repeat-comfort.webm",
  unhappy: "/pet-videos/transparent/07-calm-down.webm",
  verbose: "/pet-videos/transparent/08-relax-food.webm",
  polite: "/pet-videos/transparent/09-polite-reminder.webm",
};
const topbarPetVideoMap = {
  idle: "/pet-videos/topbar/topbar-patrol-alpha.png?v=patrol3",
  working: "/pet-videos/topbar/topbar-patrol-alpha.png?v=patrol3",
  stuck: "/pet-videos/topbar/topbar-patrol-alpha.png?v=patrol3",
};
const claudePetPreviewOrder = ["rest", "performance", "encourage", "celebrate", "comfort", "grumble", "unhappy", "verbose", "polite"];
const petTriggerRules = [
  {
    name: "文明提醒",
    emotion: "polite",
    keywords: ["骂人", "不文明", "脏话"],
    pattern: /(骂人|不文明|脏话|傻|滚|垃圾|妈的|艹|cao|fuck|shit)/i,
    status: "检测到情绪有点上头，先温柔提醒",
    mood: "提醒",
    bubble: "文明一点，我也好干活。",
  },
  {
    name: "卡顿排查",
    emotion: "performance",
    keywords: ["卡顿", "很慢", "无响应", "性能"],
    pattern: /(卡顿|很慢|太慢|无响应|性能|加载慢|跑不动|卡住|电脑慢|当机|宕机)/i,
    status: "运行有点卡，建议先排查问题",
    mood: "排查",
    bubble: "别急，我先看看哪里慢。",
  },
  {
    name: "完成庆祝",
    emotion: "celebrate",
    keywords: ["完成", "成功", "搞定", "通过"],
    pattern: /(完成|成功|搞定|通过|好了|收工|结束|打包好了|跑通)/i,
    status: "任务完成，准备庆祝一下",
    mood: "庆祝",
    bubble: "漂亮，收工！",
  },
  {
    name: "挫折打气",
    emotion: "comfort",
    keywords: ["失败", "报错", "挫折", "崩"],
    pattern: /(失败|报错|错误|挫折|崩|不会|难|问题很大|搞不定|不好用)/i,
    status: "遇到挫折，别急，我陪你继续",
    mood: "打气",
    bubble: "没事，再来一轮。",
  },
  {
    name: "冷静安抚",
    emotion: "unhappy",
    keywords: ["烦", "急", "生气", "崩溃"],
    pattern: /(烦|烦躁|急|生气|崩溃|不开心|火大|难受)/i,
    status: "先缓一口气，再继续处理",
    mood: "冷静",
    bubble: "先别硬刚，咱慢慢来。",
  },
  {
    name: "反复操作",
    emotion: "grumble",
    keywords: ["重复", "反复", "麻烦", "低效"],
    pattern: /(重复|反复|又来|低效|麻烦|折腾|来回|好多遍)/i,
    status: "发现反复操作，我会帮你压缩步骤",
    mood: "吐槽",
    bubble: "又来一遍？我都快背下来了。",
  },
  {
    name: "啰嗦解压",
    emotion: "verbose",
    keywords: ["啰嗦", "太长", "一大堆"],
    pattern: /(啰嗦|太长|一大堆|废话|看不懂|绕)/i,
    status: "内容有点长，我先帮你抓重点",
    mood: "解压",
    bubble: "这段有点啰嗦，但我能扛。",
  },
  {
    name: "持续鼓励",
    emotion: "encourage",
    keywords: ["继续", "加油", "推进", "努力"],
    pattern: /(继续|加油|推进|努力|坚持|冲|开始|安排|做吧|处理)/i,
    status: "持续推进中，我给你打气",
    mood: "鼓励",
    bubble: "稳住，今天能拿下。",
  },
];
const maxUploadBytes = 8 * 1024 * 1024;

const modeNotes = {
  safe: {
    note: "安全对话模式不会读取或修改本地文件。",
    label: "安全对话",
    title: "安全对话模式",
    detail: "AI 只能回答问题、整理方案和生成建议，不读取项目文件，不修改文件，不执行命令。",
    cliMode: "plan",
    toolProfile: "none",
    toolLabel: "无工具",
    risk: "低",
  },
  readOnly: {
    note: "项目分析模式只允许读取当前项目目录。",
    label: "项目分析",
    title: "项目分析模式",
    detail: "AI 可以在已授权项目目录内读取、搜索和分析代码，但不能写文件、删除文件或执行命令。",
    cliMode: "plan",
    toolProfile: "read",
    toolLabel: "只读工具",
    risk: "中",
  },
  browser: {
    note: "浏览器自动化模式只用于打开网页、搜索、点击和读取页面。",
    label: "浏览器自动化",
    title: "浏览器自动化模式",
    detail: "AI 可以在你授权后使用 Playwright 浏览器工具打开网页、搜索、点击、输入和读取页面内容；不会读取本地文件，不会修改控制台源码或客户配置。",
    cliMode: "default",
    toolProfile: "none",
    toolLabel: "浏览器工具",
    risk: "谨慎",
    browserMode: true,
  },
  takeover: {
    note: "接管模式需要先确认，只用于谨慎的桌面辅助。",
    label: "接管模式",
    title: "接管模式",
    detail: "用于帮助客户打开桌面文件、引导页面操作或处理语音指令。此模式不允许修改本控制台源码或客户配置，危险操作仍必须再次确认。",
    cliMode: "default",
    toolProfile: "none",
    toolLabel: "桌面辅助",
    risk: "谨慎",
    caution: true,
  },
  edit: {
    note: "授权修改模式默认锁定，开启后可修改项目文件。",
    label: "授权修改",
    title: "授权修改模式",
    detail: "AI 可以在授权项目目录内读取和修改文件。重要修改前需要确认，删除、覆盖、批量写入仍需再次确认。",
    cliMode: "acceptEdits",
    toolProfile: "edit",
    toolLabel: "读取 + 编辑",
    risk: "高",
    highRisk: true,
  },
  expert: {
    note: "专家命令模式默认锁定，只建议专业用户在可信项目中使用。",
    label: "专家命令",
    title: "专家命令模式",
    detail: "AI 可以编辑文件并执行命令、安装依赖或运行测试。必须管理员解锁、二次确认并记录日志。",
    cliMode: "acceptEdits",
    toolProfile: "command",
    toolLabel: "编辑 + 命令",
    risk: "极高",
    highRisk: true,
  },
};

const errorHelp = {
  MISSING_API_KEY: {
    title: "API Key 未填写",
    message: "当前还没有配置 API Key，暂时不能调用模型或进行真实连接测试。",
    suggestion: "请在设置里临时输入 API Key 后再测试。测试不会保存或完整显示 API Key。",
  },
  MISSING_BASE_URL: {
    title: "接口地址未填写",
    message: "接口地址 / 中转站地址为空，无法发起请求。",
    suggestion: "请填写服务商提供的接口地址，一般以 http:// 或 https:// 开头。",
  },
  MISSING_MODEL: {
    title: "主模型未填写",
    message: "当前没有填写主模型名称，无法判断要请求哪个模型。",
    suggestion: "请填写服务商支持的模型名称；不确定时先使用服务商文档里的默认模型。",
  },
  INVALID_API_KEY: {
    title: "API Key 无效",
    message: "当前 API Key 无法通过验证。",
    suggestion: "请检查是否复制完整、前后是否有空格、Key 是否过期或额度不足。如果使用中转站，请确认这是中转站提供的 Key。",
  },
  INVALID_BASE_URL: {
    title: "接口地址格式不正确",
    message: "当前接口地址不是有效 URL，或者协议不符合要求。",
    suggestion: "请确认地址以 http:// 或 https:// 开头，不要填写官网登录页面地址。",
  },
  BASE_URL_UNREACHABLE: {
    title: "接口地址无法访问",
    message: "当前接口地址路径不可用，服务端没有找到可测试的模型接口。",
    suggestion: "请检查 Base URL 是否填写正确；如果服务商要求 /v1，请带上 /v1。",
  },
  MODEL_NOT_FOUND: {
    title: "模型不可用",
    message: "模型名称可能写错，或者当前 Key 没有该模型权限。",
    suggestion: "请核对模型名称，或换成服务商支持的模型再试。",
  },
  TIMEOUT: {
    title: "请求超时",
    message: "连接测试等待时间过长，接口没有及时响应。",
    suggestion: "请检查网络或中转站稳定性，稍后再试。",
  },
  RATE_LIMITED: {
    title: "请求受限",
    message: "当前请求过于频繁，或者账号额度不足。",
    suggestion: "请稍后再试，或检查账号余额和接口限速。",
  },
  SERVER_ERROR: {
    title: "服务端异常",
    message: "接口服务返回了 5xx 错误。",
    suggestion: "请稍后重试；如果一直失败，请联系接口服务商检查中转站状态。",
  },
  NETWORK_ERROR: {
    title: "网络连接失败",
    message: "本地服务无法访问该接口地址。",
    suggestion: "请检查地址是否填写正确、网络是否可用，以及中转站服务是否在线。",
  },
  UNKNOWN_ERROR: {
    title: "未知错误",
    message: "请求失败，但没有识别出明确原因。",
    suggestion: "请查看诊断报告，确认 API Key、接口地址和模型是否填写正确。",
  },
  400: {
    title: "请求参数错误",
    message: "通常是参数填写不完整或格式不正确。",
    suggestion: "请检查路径、模型、接口地址等必填内容，按页面提示补齐即可。",
  },
  401: {
    title: "认证失败",
    message: "接口拒绝了当前 API Key。",
    suggestion: "请重新复制 API Key，确认没有多余空格，或检查 Key 是否过期。",
  },
  403: {
    title: "无访问权限",
    message: "当前 Key 没有访问该接口或模型的权限。",
    suggestion: "请检查账号权限、模型授权和中转站套餐。",
  },
  404: {
    title: "接口路径不存在",
    message: "接口地址路径不可用。",
    suggestion: "请确认 Base URL，不要填写官网页面地址；如果服务商要求 /v1，请带上 /v1。",
  },
  408: {
    title: "请求超时",
    message: "接口响应超时。",
    suggestion: "请检查网络或中转站稳定性。",
  },
  423: {
    title: "功能已锁定",
    message: "当前功能被安全策略锁定。",
    suggestion: "这是保护机制，不是软件坏了。高权限和写入类接口需要管理员授权后才能开启。",
  },
  429: {
    title: "请求受限",
    message: "当前请求过于频繁或额度不足。",
    suggestion: "请稍后再试，或检查账号余额和接口限速。",
  },
  500: {
    title: "接口服务异常",
    message: "接口服务内部错误。",
    suggestion: "请稍后重试，或联系接口服务商。",
  },
  502: {
    title: "网关异常",
    message: "中转站或上游模型服务不可用。",
    suggestion: "请稍后重试，或检查中转站状态。",
  },
  503: {
    title: "服务暂不可用",
    message: "接口服务暂时不可用。",
    suggestion: "请稍后重试，或联系服务商确认状态。",
  },
};

const usageGuideSections = [
  ["一、第一次怎么使用", ["打开控制台。", "填写或稍后填写 API Key。", "填写接口地址 / 中转站地址。", "填写主模型。", "填写分支模型。", "选择项目路径。", "点击测试连接。", "测试成功后开始使用。"]],
  ["二、API Key 是什么", ["API Key 可以理解为你的接口使用凭证。软件不会内置你的 API Key，也不会完整显示你的 API Key。保存后只显示隐藏形式，例如 sk-****abcd。"]],
  ["三、接口地址 / 中转站地址是什么", ["如果你使用官方接口，可以填写官方接口地址。如果你购买的是第三方 API 中转服务，需要填写中转站提供的接口地址。地址一般以 http:// 或 https:// 开头。"]],
  ["四、主模型是什么", ["主模型负责核心思考、复杂任务、整体规划和主要回答。建议选择能力更强的模型。"]],
  ["五、分支模型是什么", ["分支模型负责辅助任务、简单任务和低成本任务。可以选择速度更快、成本更低的模型。如果不知道怎么选，可以先和主模型填一样。"]],
  ["六、项目路径是什么", ["项目路径是你希望 AI 读取和分析的项目文件夹。为了安全，软件只允许在你授权的项目目录内工作，不会默认访问系统目录。"]],
  ["七、为什么要测试连接", ["测试连接用于确认 API Key、接口地址和模型是否可用。测试通过后，说明当前配置可以正常请求模型。"]],
  ["八、为什么高权限默认锁定", ["高权限可能涉及读取、修改文件或执行命令。为了保护你的项目和电脑安全，默认不会开放。只有在你明确理解风险并授权后，才建议使用。"]],
  ["九、诊断报告有什么用", ["诊断报告用于排查问题，只包含运行状态、配置状态和错误摘要，不会包含完整 API Key 或客户文件内容。"]],
  ["十、图片上传保存在哪里", ["上传的图片仅保存在本机配置目录，用于当前会话分析，不会自动上传到外部服务器。"]],
];

const faqSections = [
  ["API Key 填了为什么连接失败？", ["检查是否复制完整，前后是否有空格。", "检查 Key 是否过期、是否有额度。", "检查是否填错了接口服务商。", "如果使用中转站，请确认填写的是中转站提供的 Key。"]],
  ["中转站地址应该怎么填？", ["填写服务商提供的接口地址，一般以 http:// 或 https:// 开头。", "不要填写官网登录页面地址。", "如果服务商要求 /v1，需要带上 /v1。"]],
  ["主模型和分支模型有什么区别？", ["主模型负责重要任务、复杂任务和主要回答。", "分支模型负责辅助任务、简单任务和低成本任务。", "不知道怎么选时，可以先都填同一个模型。"]],
  ["为什么测试连接显示模型不可用？", ["模型名称可能写错。", "当前 Key 没有该模型权限。", "中转站暂不支持该模型。", "可以换一个服务商支持的模型再试。"]],
  ["为什么不能选择系统目录？", ["系统目录涉及电脑安全。", "软件只允许访问用户授权的项目目录。", "建议选择自己的项目文件夹。", "不要选择 C:\\Windows、C:\\Program Files 等系统目录。"]],
  ["为什么专家命令模式打不开？", ["专家命令模式属于高风险功能，可能执行命令或修改文件。", "客户普通版本默认锁定。", "如需开启，需要管理员或高级授权。"]],
  ["诊断报告会不会泄露我的 API Key？", ["不会显示完整 API Key，只显示隐藏形式。", "不包含客户文件内容。", "主要用于排查配置和运行状态。"]],
  ["出现 400 是什么意思？", ["通常是参数填写不完整或格式不正确。", "比如路径为空、模型为空、接口地址为空。", "按页面提示补齐即可。"]],
  ["出现 423 是什么意思？", ["表示当前功能被安全锁定。", "常见于高权限、写入类接口、管理员功能。", "这是保护机制，不是软件坏了。"]],
  ["上传图片为什么会弹提示？", ["因为图片会保存到本机目录用于分析。", "软件需要提前告知用户。", "不会自动上传到外部服务器。"]],
];

const permissionGuideSections = [
  ["安全对话模式", ["AI 只能回答问题，不会读取或修改你的项目文件。适合普通聊天和咨询。", "后端参数：toolProfile=none。"]],
  ["浏览器自动化模式", ["AI 可以在你授权后打开网页、搜索、点击、输入和读取页面内容。", "后端参数：permissionProfile=browser；toolProfile=none。"]],
  ["接管模式", ["用于帮助客户打开桌面文件、引导操作和接收语音指令。", "开启前会弹出确认，不会修改本控制台源码或客户配置，危险操作仍需二次确认。"]],
  ["授权修改模式", ["AI 可以在你授权的项目目录内修改文件。建议在备份项目后使用。普通客户默认不可直接开启。", "后端参数：toolProfile=edit，默认安全锁定。"]],
  ["专家命令模式", ["AI 可能执行命令、安装依赖或进行高级操作。该模式风险较高，普通客户默认锁定。", "后端参数：toolProfile=command，默认安全锁定。"]],
];

const dangerousConversationActions = new Set(["delete"]);
const conversationActionLabels = {
  pin: "置顶聊天",
  archive: "归档",
  rename: "重命名",
  delete: "删除",
};

let activeMode = "safe";
let highRiskToolsLocked = true;
let runController = null;
let voiceRecognition = null;
let voiceListening = false;
let latestVoiceCapability = null;
let voiceReplyPending = false;
let browserModeAccepted = false;
let takeoverModeAccepted = false;
let pendingToolAuthorization = null;
let slashCommandIndex = 0;
let activeAssistantMessage = null;
let assistantTextBuffer = "";
let assistantTextFlushTimer = null;
let transcriptScrollFrame = null;
let conversationRenderFrame = null;
let conversationsSaveTimer = null;
let relayWritable = false;
let currentConversationId = null;
let conversations = loadConversations();
let conversationSearchTerm = "";
let openConversationMenuId = null;
let selectedAttachments = [];
let automations = loadStoredList(automationsStorageKey);
let schedules = loadStoredList(schedulesStorageKey);
let temporaryTask = loadTemporaryTask();
let currentMainModel = "";
let currentBranchModels = [];
let latestStatus = null;
let latestRelay = null;
let lastRelayTestResult = null;
let lastDiagnosticsReport = "";
let managedProjectFolders = [];
let workStartedAt = 0;
let lastRestNudgeAt = 0;
let lastPetPrompt = "";
let petSyncEnabled = false;
let petSlowTimer = null;
let claudePetPreviewIndex = 0;
let lastClaudePetEmotion = "";
let lastPetDraftSignature = "";
let petCountdownStartedNoticeShown = Boolean(workStartedAt);
let petPopupTimer = null;
let announcementHideTimer = null;
let announcementCountdownTimer = null;

if (!Number.isFinite(workStartedAt)) workStartedAt = 0;
if (!Number.isFinite(lastRestNudgeAt)) lastRestNudgeAt = 0;

function basename(filePath) {
  return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;
}

function hideIntroOverlay() {
  if (!introOverlay) return;
  introOverlay.hidden = true;
  if (introVideo) {
    introVideo.pause();
    introVideo.currentTime = 0;
  }
}

function initIntroVideo() {
  if (!introOverlay || !introVideo) return;
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    hideIntroOverlay();
  };

  introSkipBtn?.addEventListener("click", finish);
  introVideo.addEventListener("ended", finish);
  introVideo.addEventListener("error", finish);
  const playIntro = async () => {
    if (completed) return;
    introOverlay.hidden = false;
    if (introStatus) introStatus.textContent = "开场动画播放中";
    try {
      introVideo.currentTime = 0;
      await introVideo.play();
    } catch {
      if (introStatus) introStatus.textContent = "点击跳过进入控制台";
    }
  };

  introOverlay.hidden = false;
  introVideo.addEventListener("canplay", playIntro, { once: true });
  if (introVideo.readyState >= 2) {
    window.setTimeout(playIntro, 0);
  } else {
    window.setTimeout(playIntro, 350);
  }
  setTimeout(finish, 18000);
}

function chineseProjectName(projectPath, fallback = "") {
  const name = basename(projectPath || fallback || "");
  const map = {
    "claude-code-giehub": "Claude Code 工程",
    "clean-claude-panel": "控制面板工程",
  };
  return map[name] || name || "未命名工程";
}

function makeId() {
  return window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function setConversationLayout(active) {
  document.body.classList.toggle("conversation-mode", active);
  document.body.classList.toggle("home-mode", !active);
}

function setEmptyState() {
  setConversationLayout(false);
  transcript.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-card">
        <video class="empty-state-pet" src="/intro/opening-welcome-transparent.webm" muted playsinline autoplay preload="metadata"></video>
      </div>
    </div>`;
  playEmptyStateIntroOnce();
}

function playEmptyStateIntroOnce() {
  const card = transcript.querySelector(".empty-state-card");
  const video = transcript.querySelector(".empty-state-pet");
  if (!card || !video) return;

  card.classList.remove("intro-finished");
  const title = card.querySelector(".empty-state-title");
  if (title) title.hidden = true;
  video.hidden = false;
  const finish = () => {
    video.pause();
    video.hidden = true;
    if (title) title.hidden = true;
    card.classList.add("intro-finished");
  };
  video.addEventListener("ended", finish, { once: true });
  video.addEventListener("error", finish, { once: true });
  try {
    video.currentTime = 0;
  } catch {}
  video.play().catch(() => {
    finish();
  });
}

function clearEmptyState() {
  setConversationLayout(true);
  const empty = transcript.querySelector(".empty-state");
  if (empty) empty.remove();
}

function renderAnnouncement(text) {
  const content = String(text || "").trim();
  window.clearTimeout(announcementHideTimer);
  window.clearInterval(announcementCountdownTimer);
  announcementShell.hidden = !content;
  announcementTrack.innerHTML = "";
  if (announcementTimer) announcementTimer.textContent = "60 秒后隐藏";
  if (!content) return;

  for (let index = 0; index < 2; index += 1) {
    const item = document.createElement("span");
    item.textContent = content;
    announcementTrack.append(item);
  }
  const startedAt = Date.now();
  announcementCountdownTimer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const remainingSeconds = Math.max(0, Math.ceil((announcementVisibleMs - elapsed) / 1000));
    if (announcementTimer) announcementTimer.textContent = `${remainingSeconds} 秒后隐藏`;
    if (remainingSeconds <= 0) window.clearInterval(announcementCountdownTimer);
  }, 1000);
  announcementHideTimer = window.setTimeout(() => {
    window.clearInterval(announcementCountdownTimer);
    announcementShell.hidden = true;
  }, announcementVisibleMs);
}

async function loadAnnouncement() {
  const res = await fetch(`/api/announcement?t=${Date.now()}`, { cache: "no-store" });
  const data = await res.json();
  renderAnnouncement(data.text || "");
}

function accountDisplayName() {
  return window.localStorage.getItem(accountNameStorageKey) || "本地账户";
}

function renderAccountMenu() {
  const name = accountDisplayName();
  if (accountEmailLabel) accountEmailLabel.textContent = name;
  if (accountDisplayNameInput) accountDisplayNameInput.value = name;
}

function openAccountMenu() {
  accountMenu.hidden = false;
  accountMenuButton.setAttribute("aria-expanded", "true");
}

function closeAccountMenu() {
  accountMenu.hidden = true;
  accountMenuButton.setAttribute("aria-expanded", "false");
  accountMenu.querySelectorAll(".account-menu-item.is-open").forEach((item) => item.classList.remove("is-open"));
}

function toggleAccountMenu() {
  if (accountMenu.hidden) openAccountMenu();
  else closeAccountMenu();
}

function closeAccountInfoDialog() {
  if (accountInfoDialog) accountInfoDialog.hidden = true;
  if (accountProfilePanel) accountProfilePanel.hidden = true;
  if (accountContactPanel) accountContactPanel.hidden = true;
  accountMenu?.querySelectorAll(".account-menu-item.is-open").forEach((item) => item.classList.remove("is-open"));
}

function openAccountInfoDialog(type) {
  closeAccountMenu();
  if (!accountInfoDialog) return;
  const isContact = type === "contact";
  if (accountInfoDialogTitle) accountInfoDialogTitle.textContent = isContact ? "联系我们" : "个人账户";
  accountInfoDialog.hidden = false;
  if (accountProfilePanel) accountProfilePanel.hidden = isContact;
  if (accountContactPanel) accountContactPanel.hidden = !isContact;
  if (isContact) {
    loadContactCard();
  } else {
    renderAccountMenu();
    window.setTimeout(() => accountDisplayNameInput?.focus(), 60);
  }
}

function toggleAccountProfile() {
  openAccountInfoDialog("profile");
}

async function loadContactCard() {
  try {
    const res = await fetch(`/api/contact-card?t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const contact = data.contact || {};
    if (contactNameLabel) contactNameLabel.textContent = contact.name || "客服名称待配置";
    if (contactWechatLabel) contactWechatLabel.textContent = contact.wechat || "微信号待配置";
    if (contactNoteLabel) contactNoteLabel.textContent = contact.note || data.note || "后续可接入售后二维码、微信名称和客户服务入口。";
    if (contactEmailLabel) contactEmailLabel.textContent = contact.email || "邮箱待配置";
    if (contactQrImage && contactQrPlaceholder) {
      if (contact.qrCode) {
        contactQrImage.src = contact.qrCode;
        contactQrImage.hidden = false;
        contactQrPlaceholder.hidden = true;
      } else {
        contactQrImage.hidden = true;
        contactQrPlaceholder.hidden = false;
      }
    }
  } catch (error) {
    if (contactNameLabel) contactNameLabel.textContent = "联系方式读取失败";
    if (contactWechatLabel) contactWechatLabel.textContent = "请稍后重试";
    if (contactNoteLabel) contactNoteLabel.textContent = error.message || "联系接口暂不可用";
    if (contactEmailLabel) contactEmailLabel.textContent = "邮箱读取失败";
    if (contactQrImage) contactQrImage.hidden = true;
    if (contactQrPlaceholder) {
      contactQrPlaceholder.hidden = false;
      contactQrPlaceholder.textContent = "读取失败";
    }
  }
}

function toggleAccountContact() {
  openAccountInfoDialog("contact");
}

function saveAccountName() {
  const value = accountDisplayNameInput.value.trim() || "本地账户";
  window.localStorage.setItem(accountNameStorageKey, value.slice(0, 32));
  renderAccountMenu();
  addMessage("system", "个人账户", "名字已保存到本机。");
}

function eyeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function openPasswordDialog() {
  closeAccountMenu();
  closeAccountInfoDialog();
  const overlay = document.createElement("div");
  overlay.className = "password-dialog-overlay";
  overlay.innerHTML = `
    <form class="password-dialog" id="passwordDialogForm">
      <div class="password-dialog-title">修改访问密码</div>
      <div class="password-dialog-desc">此处修改的是 SuperClaw 控制面板访问密码，修改后下次进入统一面板生效。</div>
      <label class="password-dialog-field">
        <span>当前密码</span>
        <div class="password-dialog-input">
          <input id="panelOldPassword" type="password" autocomplete="current-password" />
          <button type="button" data-toggle-password="#panelOldPassword" title="显示密码">${eyeIcon()}</button>
        </div>
      </label>
      <label class="password-dialog-field">
        <span>新密码</span>
        <div class="password-dialog-input">
          <input id="panelNewPassword" type="password" autocomplete="new-password" />
          <button type="button" data-toggle-password="#panelNewPassword" title="显示密码">${eyeIcon()}</button>
        </div>
      </label>
      <label class="password-dialog-field">
        <span>确认新密码</span>
        <div class="password-dialog-input">
          <input id="panelConfirmPassword" type="password" autocomplete="new-password" />
          <button type="button" data-toggle-password="#panelConfirmPassword" title="显示密码">${eyeIcon()}</button>
        </div>
      </label>
      <div class="password-dialog-error" id="passwordDialogError" hidden></div>
      <div class="password-dialog-actions">
        <button type="button" class="secondary" id="passwordDialogCancel">取消</button>
        <button type="submit" class="primary" id="passwordDialogSubmit">保存</button>
      </div>
    </form>
  `;
  document.body.append(overlay);

  const form = overlay.querySelector("#passwordDialogForm");
  const errorEl = overlay.querySelector("#passwordDialogError");
  const submitBtn = overlay.querySelector("#passwordDialogSubmit");
  const close = () => overlay.remove();
  overlay.querySelector("#passwordDialogCancel").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = overlay.querySelector(btn.dataset.togglePassword);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const oldPassword = overlay.querySelector("#panelOldPassword").value;
    const newPassword = overlay.querySelector("#panelNewPassword").value;
    const confirmPassword = overlay.querySelector("#panelConfirmPassword").value;
    if (newPassword !== confirmPassword) {
      errorEl.textContent = "两次输入的新密码不一致";
      errorEl.hidden = false;
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "保存中...";
    errorEl.hidden = true;
    try {
      const res = await fetch("/api/panel-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      close();
      addMessage("system", "修改密码", "访问密码已更新。");
    } catch (error) {
      errorEl.textContent = error.message || "密码修改失败";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "保存";
    }
  });
}

function safeHostFromUrl(value) {
  try {
    return new URL(String(value || "")).host.toLowerCase();
  } catch {
    return "";
  }
}

function resolveUsagePortal() {
  const relayHost = safeHostFromUrl(latestRelay?.baseUrl);
  const identity = [
    latestStatus?.baseHost,
    latestRelay?.baseUrl,
    latestRelay?.provider,
    latestRelay?.name,
    currentMainModel,
    modelInput.value,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (identity.includes("minimaxi") || identity.includes("minimax")) {
    const domain = identity.includes("minimaxi") ? "platform.minimaxi.com" : "platform.minimax.io";
    return {
      label: "MiniMax Token Plan",
      url: `https://${domain}/user-center/payment/token-plan`,
      note: "已根据当前 MiniMax 模型打开包月 / Token Plan 页面。",
    };
  }
  if (identity.includes("openai")) {
    return {
      label: "OpenAI Usage",
      url: "https://platform.openai.com/usage",
      note: "已根据当前 OpenAI 配置打开用量页面。",
    };
  }
  if (identity.includes("anthropic") || identity.includes("claude")) {
    return {
      label: "Anthropic Usage",
      url: "https://console.anthropic.com/settings/usage",
      note: "已根据当前 Claude / Anthropic 配置打开用量页面。",
    };
  }
  if (identity.includes("deepseek")) {
    return {
      label: "DeepSeek Usage",
      url: "https://platform.deepseek.com/usage",
      note: "已根据当前 DeepSeek 配置打开用量页面。",
    };
  }
  if (identity.includes("moonshot") || identity.includes("kimi")) {
    return {
      label: "Moonshot Console",
      url: "https://platform.moonshot.cn/console/account",
      note: "已根据当前 Moonshot / Kimi 配置打开账号控制台。",
    };
  }
  if (relayHost && latestRelay?.baseUrl) {
    return {
      label: relayHost,
      url: latestRelay.baseUrl,
      note: "未识别到固定服务商，已打开当前中转站地址。",
    };
  }
  return {
    label: "接口配置",
    url: "",
    note: "当前还没有可跳转的服务商地址，请先在右侧配置接口地址 / 中转站地址。",
  };
}

async function openUsagePortal() {
  closeAccountMenu();
  const portal = resolveUsagePortal();
  if (!portal.url) {
    addMessage("system", "剩余用量", portal.note);
    if (document.body.classList.contains("right-panel-collapsed")) toggleRightPanel();
    return;
  }
  if (window.cleanClaudeDesktop?.openExternal) {
    try {
      const result = await window.cleanClaudeDesktop.openExternal(portal.url);
      if (result?.ok) {
        addMessage("system", "剩余用量", `${portal.note}\n已在系统浏览器打开：${portal.url}`);
        return;
      }
    } catch {
      // Fall through to browser window.open fallback.
    }
  }
  const opened = window.open(portal.url, "_blank", "noopener,noreferrer");
  const suffix = opened ? `已打开：${portal.url}` : `浏览器阻止了新窗口，请手动打开：${portal.url}`;
  addMessage("system", "剩余用量", `${portal.note}\n${suffix}`);
}

function handleAccountAction(action) {
  if (action === "profile") {
    toggleAccountProfile();
    return;
  }
  if (action === "contact") {
    toggleAccountContact();
    return;
  }
  if (action === "settings") {
    closeAccountMenu();
    if (document.body.classList.contains("right-panel-collapsed")) toggleRightPanel();
    const runPanel = document.querySelector(".run-panel");
    if (runPanel) runPanel.scrollTo({ top: 0, behavior: "smooth" });
    const relaySection = document.querySelector(".relay-section");
    if (relaySection) {
      window.setTimeout(() => relaySection.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    }
    addMessage("system", "设置", "已打开右侧设置区域，并定位到接口与运行配置。");
    return;
  }
  if (action === "usage") {
    openUsagePortal();
    return;
    addMessage("system", "剩余用量", "用量查询接口已预留，后续可接入账号后台。");
    return;
  }
  if (action === "logout") {
    closeAccountMenu();
    addMessage("system", "退出登录", "退出登录接口已预留。当前不会清除 API Key 或本机配置。");
  }
}

function scheduleTranscriptScroll() {
  if (!transcript || transcriptScrollFrame) return;
  transcriptScrollFrame = requestAnimationFrame(() => {
    transcriptScrollFrame = null;
    transcript.scrollTop = transcript.scrollHeight;
  });
}

function scheduleConversationRender() {
  if (conversationRenderFrame) return;
  conversationRenderFrame = requestAnimationFrame(() => {
    conversationRenderFrame = null;
    renderConversations();
  });
}

function flushAssistantTextBuffer() {
  if (!assistantTextBuffer) return;
  if (!activeAssistantMessage) {
    activeAssistantMessage = addMessage("assistant", "Claude");
  }
  const chunk = assistantTextBuffer;
  assistantTextBuffer = "";
  activeAssistantMessage.body.textContent += chunk;
  renderAuthorizationCard(activeAssistantMessage.message, activeAssistantMessage.body.textContent);
  scheduleTranscriptScroll();
}

function scheduleAssistantTextFlush() {
  if (assistantTextFlushTimer) return;
  assistantTextFlushTimer = setTimeout(() => {
    assistantTextFlushTimer = null;
    flushAssistantTextBuffer();
  }, 32);
}

function isRuntimeSummaryMessage(kind, title, text = "") {
  const raw = `${title || ""}\n${text || ""}`;
  return kind === "system"
    && /(已完成|运行成功|运行耗时|价格|费用|用量|耗时|cost|total_cost|\$\s*\d)/i.test(raw)
    && /(运行成功|运行耗时|价格|费用|用量|耗时|cost|total_cost|\$\s*\d)/i.test(raw);
}

function removeRuntimeSummaryMessages() {
  if (!transcript) return;
  for (const message of transcript.querySelectorAll(".message.system")) {
    const text = message.textContent || "";
    if (isRuntimeSummaryMessage("system", "", text)) message.remove();
  }
}

function addMessage(kind, title, text = "") {
  if (isRuntimeSummaryMessage(kind, title, text)) {
    const placeholder = document.createElement("span");
    return { message: placeholder, body: placeholder };
  }
  clearEmptyState();
  const message = document.createElement("article");
  message.className = `message ${kind}`;
  const head = document.createElement("div");
  head.className = "message-head";
  head.textContent = kind === "user" && ["你", "我", "用户"].includes(title) ? "操作者" : title;
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;
  message.append(head, body);
  transcript.append(message);
  scheduleTranscriptScroll();
  return { message, body };
}

function closeSlashCommandMenu() {
  if (!slashCommandMenu) return;
  slashCommandMenu.hidden = true;
  slashCommandMenu.innerHTML = "";
}

function slashCommandQuery() {
  const value = promptInput.value;
  if (!value.startsWith("/")) return null;
  if (/[\s\n]/.test(value)) return null;
  return value.toLowerCase();
}

function matchingSlashCommands() {
  const query = slashCommandQuery();
  if (query === null) return [];
  const compact = query.replace(/^\//, "");
  return slashCommands.filter((item) => {
    const command = item.command.toLowerCase();
    return command.startsWith(query) || command.slice(1).startsWith(compact);
  });
}

function renderSlashCommandMenu() {
  if (!slashCommandMenu) return;
  const matches = matchingSlashCommands();
  if (!matches.length || document.activeElement !== promptInput) {
    closeSlashCommandMenu();
    return;
  }
  slashCommandIndex = Math.min(slashCommandIndex, matches.length - 1);
  slashCommandMenu.innerHTML = "";
  matches.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slash-command-item${index === slashCommandIndex ? " is-active" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === slashCommandIndex));
    button.dataset.command = item.command;

    const command = document.createElement("span");
    command.className = "slash-command-name";
    command.textContent = item.command;

    const description = document.createElement("span");
    description.className = "slash-command-description";
    description.textContent = item.description;

    button.append(command, description);
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectSlashCommand(item);
    });
    slashCommandMenu.append(button);
  });
  slashCommandMenu.hidden = false;
  slashCommandMenu.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
}

function selectSlashCommand(item) {
  const needsArgument = item.command === "/compact";
  promptInput.value = `${item.command}${needsArgument ? " " : ""}`;
  closeSlashCommandMenu();
  promptInput.focus();
}

function slashCommandHelpSections() {
  return slashCommands.map((item) => [item.command, [item.description]]);
}

function clearCurrentTranscript() {
  activeAssistantMessage = null;
  currentConversationId = null;
  transcript.innerHTML = "";
  setEmptyState();
}

function showStatusSummary() {
  const status = latestStatus || {};
  addMessage(
    "system",
    "状态",
    [
      `Claude Code：${status.claudeVersion || "未检测到版本"}`,
      `模型：${modelInput.value || status.model || "未配置"}`,
      `接口：${status.baseHost || "本地配置"}`,
      `认证：${status.authConfigured ? "已连接" : "未检测到认证"}`,
      `高权限：${status.securityPolicy?.highRiskLocked === false ? "已开启，请谨慎" : "已锁定，安全"}`,
    ].join("\n")
  );
}

async function executeSlashCommand(prompt) {
  const [commandName] = String(prompt || "").trim().split(/\s+/);
  const item = slashCommands.find((command) => command.command === commandName);
  if (!item || item.action === "native") return false;

  if (item.action === "help") {
    openHelpDialog("常用斜杠命令", slashCommandHelpSections());
  } else if (item.action === "status") {
    await loadStatus().catch(() => {});
    showStatusSummary();
  } else if (item.action === "doctor") {
    setRunSection("diagnostics");
    await generateDiagnostics();
    addMessage("system", "诊断", "已生成诊断报告，右侧诊断区域可复制或下载。");
  } else if (item.action === "clear") {
    clearCurrentTranscript();
  } else if (item.action === "new") {
    openProjectNameDialog();
  } else if (item.action === "model") {
    modelInput.focus();
    addMessage("system", "模型", "已定位到模型设置。可以切换主模型或分支模型。");
  } else if (item.action === "permissions") {
    setRunSection("permissions");
    openPermissionMenu();
    permissionMenuButton.scrollIntoView({ block: "center", behavior: "smooth" });
  } else if (item.action === "config") {
    if (document.body.classList.contains("right-panel-collapsed")) {
      window.localStorage.setItem(rightPanelCollapsedKey, "false");
      applyRightPanelState();
    }
    setRunSection("environment");
    relayForm.hidden = false;
    relayBaseUrl.focus();
    addMessage("system", "接口配置", "已打开右侧接口配置区域。");
  }
  return true;
}

function translateClaudeChoices(text) {
  return String(text)
    .replace(/\bYes, allow\b/gi, "本次允许")
    .replace(/\bYes, always allow\b/gi, "始终允许")
    .replace(/\bAlways allow\b/gi, "始终允许")
    .replace(/\bNo, deny\b/gi, "拒绝")
    .replace(/\bYes, I accept\b/g, "是，我接受")
    .replace(/\bNo, exit\b/g, "否，退出")
    .replace(/\bYes\b/g, "是")
    .replace(/\bNo\b/g, "否")
    .replace(/\bAllow\b/g, "允许")
    .replace(/\bDeny\b/g, "拒绝")
    .replace(/\bApprove\b/g, "批准")
    .replace(/\bReject\b/g, "拒绝")
    .replace(/\bDo you want to proceed\?/g, "是否继续？")
    .replace(/\bProceed\?/g, "是否继续？")
    .replace(/\bAccept\?/g, "是否接受？")
    .replace(/\bCancel\b/g, "取消")
    .replace(/\bConfirm\b/g, "确认");
}

window.translateClaudeChoices = translateClaudeChoices;

function isBrowserAuthorizationRequest(text) {
  const value = String(text || "");
  if (!value.trim()) return false;
  const mentionsBrowserTool = /mcp__playwright|browser_|Playwright|浏览器|网页|网站|网络访问|访问网络/i.test(value);
  const asksAuthorization = /授权|允许|确认|是否|approve|allow|permission|authorize|proceed/i.test(value);
  return mentionsBrowserTool && asksAuthorization;
}

function authorizationRequestType(text) {
  const value = String(text || "");
  if (!value.trim()) return "";
  if (isBrowserAuthorizationRequest(value)) return "browser";

  const hasChoiceText = /本次允许|始终允许|拒绝|是\/否|是否|yes|no|always allow|allow once|deny/i.test(value);
  const asksConfirmation =
    /是否(继续|允许|授权|接受|执行|打开|使用)|请(确认|选择|授权)|需要.{0,16}(确认|授权).{0,8}(吗|？|\?)|等待.{0,8}确认|do you want|proceed\?|accept\?|allow\?|authorize|permission/i.test(value);
  if (hasChoiceText && asksConfirmation) return "generic";
  return "";
}

function browserAuthorizationPrompt(choice) {
  if (choice === "deny") {
    return [
      "我拒绝本次浏览器网络访问授权。",
      "请不要调用浏览器自动化工具，改用中文文字说明下一步需要我手动怎么做。",
    ].join("\n");
  }

  const scopeText = choice === "always" ? "本会话始终允许" : "本次允许";
  return [
    `我确认：${scopeText}你使用 Playwright 浏览器自动化工具访问网络。`,
    "请继续执行上一步打开网页、搜索、点击、读取页面内容等浏览器任务。",
    "不要再次询问同一个浏览器访问授权；如果涉及登录、扫码、支付、提交隐私信息或上传本地文件，必须再次用中文等待我确认。",
    "全程使用简体中文回复。",
  ].join("\n");
}

function genericAuthorizationPrompt(choice) {
  if (choice === "deny") {
    return [
      "我拒绝本次操作授权。",
      "请不要继续执行上一步需要确认的操作，改用中文说明原因和我可以手动完成的步骤。",
    ].join("\n");
  }

  const scopeText = choice === "always" ? "本会话对同类低风险操作始终允许" : "本次允许";
  return [
    `我确认：${scopeText}你继续执行上一条消息中明确请求确认的操作。`,
    "请不要提升权限，不要突破当前权限模式，不要修改控制台源码或客户配置。",
    "如果涉及删除、覆盖、批量写入、命令执行、安装依赖、上传文件、登录、扫码、支付或提交隐私信息，仍必须再次用中文等待我确认。",
    "全程使用简体中文回复。",
  ].join("\n");
}

async function submitToolAuthorization(choice) {
  const current = pendingToolAuthorization;
  pendingToolAuthorization = null;
  const authorizationType = current?.type || "generic";
  if (authorizationType === "browser" && choice === "always") {
    window.sessionStorage.setItem(browserAccessAlwaysKey, "true");
  }
  if (current?.card) {
    current.card.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    current.card.classList.add("is-used");
  }
  const nextPrompt =
    authorizationType === "browser" ? browserAuthorizationPrompt(choice) : genericAuthorizationPrompt(choice);
  if (choice === "deny") {
    await startRun(nextPrompt, { permissionProfile: "safe", toolProfile: "none" });
    return;
  }
  if (authorizationType === "browser") {
    browserModeAccepted = true;
    await startRun(nextPrompt, {
      permissionProfile: "browser",
      toolProfile: "none",
      browserAccess: choice === "always" ? "always" : "once",
    });
    return;
  }
  const currentConfig = modeNotes[activeMode] || modeNotes.safe;
  await startRun(nextPrompt, {
    permissionProfile: activeMode,
    toolProfile: currentConfig.toolProfile,
  });
}

function renderAuthorizationCard(targetMessage, text) {
  if (!targetMessage || targetMessage.dataset.authorizationCard === "shown") return;
  const type = authorizationRequestType(text);
  if (!type) return;
  targetMessage.dataset.authorizationCard = "shown";
  const card = document.createElement("div");
  card.className = "tool-authorization-card";
  const title = type === "browser" ? "浏览器自动化授权" : "操作授权确认";
  const description =
    type === "browser"
      ? "Claude Code 想使用浏览器打开网页或搜索内容。请选择授权范围。"
      : "Claude Code 需要你确认是否继续执行上一步操作。请选择授权范围。";
  card.innerHTML = `
    <div class="tool-authorization-copy">
      <strong>${title}</strong>
      <span>${description}</span>
    </div>
    <div class="tool-authorization-actions">
      <button type="button" data-tool-auth="once">本次允许</button>
      <button type="button" data-tool-auth="always">始终允许</button>
      <button type="button" data-tool-auth="deny">拒绝</button>
    </div>
  `;
  targetMessage.append(card);
  pendingToolAuthorization = { card, text, type };
}

function appendAssistantText(text) {
  const translatedText = translateClaudeChoices(text);
  if (!activeAssistantMessage && !translatedText.trim()) return;
  assistantTextBuffer += translatedText;
  scheduleAssistantTextFlush();
}

function setRunState(state, label) {
  runStateChip.className = `pill run-state ${state}`;
  runStateChip.textContent = label;
  updateTopbarPetState(state);
  updateClaudePetStateV2(state, label);
}

function updateTopbarPetState(state) {
  if (!topbarPet) return;
  const nextState = state === "thinking" ? "working" : state === "error" ? "stuck" : "idle";
  const labelMap = {
    idle: "待机",
    working: "工作中",
    stuck: "当机",
  };
  topbarPet.dataset.state = nextState;
  if (topbarPetLabel) topbarPetLabel.textContent = labelMap[nextState] || labelMap.idle;
  playTopbarPetVideo(nextState);
}

function playTopbarPetVideo(state) {
  if (!topbarPetVideo) return;
  const source = topbarPetVideoMap[state] || topbarPetVideoMap.idle;
  if (topbarPetVideo.getAttribute("src") !== source) {
    topbarPetVideo.src = source;
  }
}

function updateClaudePetState(state, label) {
  if (!claudePet) return;
  const stateCopy = {
    idle: { status: "准备就绪，等待指令", mood: "待命" },
    thinking: { status: "正在思考，请稍等", mood: "工作中" },
    done: { status: "任务已完成，可以继续", mood: "完成" },
    error: { status: "运行异常，请查看提示", mood: "异常" },
    stopped: { status: "已停止，等待下一步", mood: "已停止" },
  };
  const copy = stateCopy[state] || { status: label || "状态同步中", mood: label || "同步" };
  claudePet.dataset.state = state || "idle";
  if (claudePetStatus) claudePetStatus.textContent = copy.status;
  if (claudePetMood) claudePetMood.textContent = copy.mood;
}

function updateClaudePetStateV2(state, label) {
  if (!claudePet) return;
  if (!petSyncEnabled) {
    applyPetSyncUi();
    return;
  }

  const stateCopy = {
    idle: { status: "准备就绪，等待指令", mood: "待命", bubble: "点我，我会跟着工作状态动起来。", emotion: "idle" },
    thinking: { status: "正在思考，请稍等", mood: "工作中", bubble: "让我想想，这事有点意思。", emotion: "thinking" },
    done: { status: "任务已完成，可以继续", mood: "庆祝", bubble: "漂亮，收工！", emotion: "celebrate" },
    error: { status: "遇到挫折，别急，我陪你继续", mood: "安慰", bubble: "没事，再来一次。", emotion: "comfort" },
    stopped: { status: "已停止，等待下一步", mood: "不开心", bubble: "先刹车，别把事情弄乱。", emotion: "unhappy" },
  };
  const copy = stateCopy[state] || { status: label || "状态同步中", mood: label || "同步", bubble: label || "同步中", emotion: state || "idle" };
  setClaudePetEmotion(copy.emotion, copy.status, copy.mood, copy.bubble);
}

function formatPetCountdown(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 1) return `${minutes} 分钟`;
  return `${seconds} 秒`;
}

function petCountdownText(prefix = "后台计时中") {
  if (!workStartedAt) return "输入第一个字后开始 45 分钟休息倒计时";
  const elapsed = Date.now() - workStartedAt;
  const remaining = petRestIntervalMs - (elapsed % petRestIntervalMs);
  return `${prefix} · 距休息提醒 ${formatPetCountdown(remaining)}`;
}

function updateSidebarPetCaption(text) {
  if (!sidebarPetText) return;
  sidebarPetText.textContent = text || "";
}

function triggerPetEntrance() {
  [claudePet, sidebarPetDock].forEach((node) => {
    if (!node) return;
    node.classList.remove("is-entering");
    void node.offsetWidth;
    node.classList.add("is-entering");
  });
}

function closePetPopup() {
  window.clearTimeout(petPopupTimer);
  document.body.classList.remove("pet-popup-active");
  sidebarPetDock?.classList.remove("is-visible", "is-entering");
  claudePet?.classList.remove("is-visible", "is-entering");
  if (sidebarPetDock) sidebarPetDock.hidden = true;
}

function hidePetPopup(delay = 6200) {
  window.clearTimeout(petPopupTimer);
  petPopupTimer = window.setTimeout(closePetPopup, delay);
}

function showPetPopup() {
  if (sidebarPetDock) sidebarPetDock.hidden = false;
  document.body.classList.add("pet-popup-active");
  sidebarPetDock?.classList.add("is-visible");
  triggerPetEntrance();
  hidePetPopup();
}

function startPetWorkCountdown(source = "input") {
  if (!workStartedAt) {
    workStartedAt = Date.now();
    lastRestNudgeAt = 0;
    window.localStorage.setItem(petWorkStartedStorageKey, String(workStartedAt));
    window.localStorage.removeItem(petLastRestStorageKey);
  }
  updateSidebarPetCaption("");
}

function matchPetTrigger(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return null;
  return petTriggerRules.find((rule) => rule.pattern.test(text)) || null;
}

function setClaudePetEmotion(emotion, status, mood, bubble) {
  if (!claudePet) return;
  const nextEmotion = emotion || "idle";
  const changed = nextEmotion !== lastClaudePetEmotion;
  lastClaudePetEmotion = nextEmotion;
  claudePet.dataset.state = nextEmotion;
  claudePet.dataset.emotion = nextEmotion;
  playClaudePetVideo(nextEmotion);
  if (changed) triggerPetEntrance();
  if (status && claudePetStatus) claudePetStatus.textContent = status;
  if (mood && claudePetMood) claudePetMood.textContent = mood;
  if (bubble && claudePetBubble) claudePetBubble.textContent = bubble;
  updateSidebarPetCaption(bubble || "");
  showPetPopup();
}

function playClaudePetVideo(emotion) {
  if (!claudePetVideo) return;
  const source = claudePetVideoMap[emotion];
  if (!source) {
    claudePetVideo.hidden = true;
    claudePetVideo.removeAttribute("src");
    syncSidebarPetVideo(null);
    return;
  }
  if (!claudePetVideo.src.endsWith(source)) {
    claudePetVideo.src = source;
    claudePetVideo.load();
  }
  claudePetVideo.hidden = false;
  syncSidebarPetVideo(source, emotion);
  const playPromise = claudePetVideo.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {
      claudePetVideo.hidden = true;
    });
  }
}

function syncSidebarPetVideo(source, emotion) {
  if (!sidebarPetVideo) return;
  if (!source) {
    sidebarPetVideo.hidden = true;
    sidebarPetVideo.removeAttribute("src");
    return;
  }
  if (!sidebarPetVideo.src.endsWith(source)) {
    sidebarPetVideo.src = source;
    sidebarPetVideo.load();
  }
  sidebarPetVideo.hidden = false;
  const playPromise = sidebarPetVideo.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {
      sidebarPetVideo.hidden = true;
    });
  }
  const titleMap = {
    idle: "持续鼓励",
    paused: "待启动",
    rest: "休息提醒",
    performance: "卡顿排查",
    thinking: "工作中",
    encourage: "持续鼓励",
    celebrate: "完成庆祝",
    comfort: "挫折打气",
    grumble: "温柔安抚",
    complain: "温柔安抚",
    unhappy: "冷静一下",
    verbose: "休闲解压",
    polite: "文明提醒",
  };
  if (sidebarPetTitle) sidebarPetTitle.textContent = titleMap[emotion] || "桌面宠物";
}

function previewNextClaudePetVideo() {
  if (!petSyncEnabled) return;
  claudePetPreviewIndex = (claudePetPreviewIndex + 1) % claudePetPreviewOrder.length;
  const emotion = claudePetPreviewOrder[claudePetPreviewIndex];
  const previewCopy = {
    rest: ["工作 45 分钟提醒", "休息", "伸个懒腰，喝口水。"],
    performance: ["运行卡顿排查", "排查", "我先看看哪里慢。"],
    encourage: ["持续努力鼓励", "鼓励", "拿铁给你，继续冲。"],
    celebrate: ["完成工作庆祝", "庆祝", "漂亮，收工！"],
    comfort: ["遭遇挫折打气", "打气", "没事，再来一轮。"],
    grumble: ["反复操作安抚", "安抚", "麻烦归麻烦，咱能拆。"],
    unhappy: ["用户烦躁冷静", "冷静", "先缓一口气。"],
    verbose: ["体验不佳解压", "解压", "歇一下，别硬刚。"],
    polite: ["文明用语提醒", "提醒", "文明一点，我也好干活。"],
  };
  const copy = previewCopy[emotion] || ["宠物动画预览", "预览", "我换个动作。"];
  setClaudePetEmotion(emotion, copy[0], copy[1], copy[2]);
  updateSidebarPetCaption(copy[2]);
}

window.previewNextClaudePetVideo = previewNextClaudePetVideo;
window.cleanClaudePetTriggers = petTriggerRules.map(({ name, emotion, keywords }) => ({ name, emotion, keywords }));

function applyPetSyncUi() {
  if (!claudePet) return;
  claudePet.classList.toggle("is-syncing", petSyncEnabled);
  document.body.classList.toggle("pet-active", petSyncEnabled);
  if (claudePetStartBtn) {
    claudePetStartBtn.textContent = petSyncEnabled ? "同步中" : "启动动画";
    claudePetStartBtn.setAttribute("aria-pressed", String(petSyncEnabled));
  }
  if (petSyncEnabled && claudePetVideo && !claudePetVideo.getAttribute("src")) {
    playClaudePetVideo("encourage");
  }
  if (!petSyncEnabled) {
    playClaudePetVideo("paused");
    closePetPopup();
  }
  updateSidebarPetCaption("");
}

function togglePetSync() {
  petSyncEnabled = !petSyncEnabled;
  window.localStorage.setItem(petSyncStorageKey, String(petSyncEnabled));
  if (petSyncEnabled) {
    startPetWorkCountdown("manual");
    setClaudePetEmotion("encourage", "动画已启动，会同步工作状态", "同步中", "好，开始盯进度。");
  }
  applyPetSyncUi();
}

function inspectPromptForPetMood(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return;
  startPetWorkCountdown("send");
  const compact = text.replace(/\s+/g, " ").slice(0, 180);
  if (lastPetPrompt && compact === lastPetPrompt) {
    setClaudePetEmotion("complain", "发现重复输入，我会帮你压缩思路", "吐槽", "又来一遍？我都快背下来了。");
  } else {
    const trigger = matchPetTrigger(text);
    if (trigger) {
      setClaudePetEmotion(trigger.emotion, trigger.status, trigger.mood, trigger.bubble);
    }
  }
  lastPetPrompt = compact;
}

function inspectDraftForPetMood() {
  const text = promptInput.value.trim();
  if (!text) return;
  startPetWorkCountdown("input");
  const trigger = matchPetTrigger(text);
  const signature = trigger ? trigger.emotion : "counting";
  if (signature === lastPetDraftSignature) return;
  lastPetDraftSignature = signature;
  if (trigger) {
    setClaudePetEmotion(trigger.emotion, trigger.status, trigger.mood, trigger.bubble);
  } else {
    updateSidebarPetCaption("");
  }
}

function checkWorkRestReminder() {
  if (!workStartedAt) {
    updateSidebarPetCaption("");
    return;
  }
  const now = Date.now();
  updateSidebarPetCaption("");
  if (now - workStartedAt >= petRestIntervalMs && now - lastRestNudgeAt > 20 * 60 * 1000) {
    lastRestNudgeAt = now;
    workStartedAt = now;
    window.localStorage.setItem(petWorkStartedStorageKey, String(workStartedAt));
    window.localStorage.setItem(petLastRestStorageKey, String(lastRestNudgeAt));
    setClaudePetEmotion("rest", "休息提醒", "休息", "45 分钟了，稍微休息一下吧，主人。");
  }
}

function setRunning(running) {
  sendBtn.disabled = running;
  launchBtn.disabled = running;
  selfTestBtn.disabled = running;
  stopBtn.disabled = !running;
  promptInput.disabled = running;
  projectSelect.disabled = running;
  modelInput.disabled = running;
}

function loadConversations() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(conversationsStorageKey) || "[]");
    return Array.isArray(parsed)
      ? parsed.map((conversation) => ({
          ...conversation,
          status: normalizeConversationStatus(conversation.status),
          pinned: Boolean(conversation.pinned),
          archived: Boolean(conversation.archived),
        }))
      : [];
  } catch {
    return [];
  }
}

function normalizeConversationStatus(status) {
  if (!status) return "已完成";
  if (status === "success" || status === "完成") return "已完成";
  if (status === "错误") return "运行异常";
  if (status === "运行中") return "正在思考";
  return status;
}

function persistConversationsNow() {
  window.localStorage.setItem(conversationsStorageKey, JSON.stringify(conversations.slice(0, 120)));
}

function saveConversations(immediate = false) {
  if (immediate) {
    if (conversationsSaveTimer) {
      clearTimeout(conversationsSaveTimer);
      conversationsSaveTimer = null;
    }
    persistConversationsNow();
    return;
  }
  if (conversationsSaveTimer) return;
  conversationsSaveTimer = setTimeout(() => {
    conversationsSaveTimer = null;
    persistConversationsNow();
  }, 120);
}

window.addEventListener("pagehide", () => saveConversations(true));
window.addEventListener("beforeunload", () => saveConversations(true));

function loadStoredList(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredList(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value.slice(0, 120)));
}

function loadTemporaryTask() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(temporaryTaskStorageKey) || "null");
    if (!parsed || typeof parsed !== "object" || !parsed.runAt || !parsed.prompt) return null;
    if (parsed.completedAt || parsed.cancelledAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveTemporaryTask(task) {
  temporaryTask = task || null;
  if (temporaryTask) {
    window.localStorage.setItem(temporaryTaskStorageKey, JSON.stringify(temporaryTask));
  } else {
    window.localStorage.removeItem(temporaryTaskStorageKey);
  }
  renderTemporaryTask();
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createConversationTitle(text) {
  const firstLine = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine || "新对话").replace(/\s+/g, " ").slice(0, 42);
}

function createConversation(prompt, titleSource = prompt) {
  const conversation = {
    id: makeId(),
    title: createConversationTitle(titleSource),
    prompt,
    createdAt: new Date().toISOString(),
    status: "正在思考",
    archived: false,
    pinned: false,
    result: "",
  };
  conversations.unshift(conversation);
  currentConversationId = conversation.id;
  saveConversations();
  renderConversations();
}

function findProjectConversation(projectPath) {
  const normalized = String(projectPath || "").trim().toLowerCase();
  if (!normalized) return null;
  return conversations.find((conversation) => String(conversation.projectPath || "").trim().toLowerCase() === normalized);
}

function projectConversationTitle(projectPath, fallback = "") {
  return chineseProjectName(projectPath, fallback || "新工程文件");
}

function conversationDisplayTitle(conversation) {
  const managed = managedProjectFolders.find(
    (item) => String(item.path || "").trim().toLowerCase() === String(conversation.projectPath || "").trim().toLowerCase()
  );
  if (managed?.name) return managed.name;
  if (conversation.projectPath) return projectConversationTitle(conversation.projectPath, conversation.title);
  return conversation.title || "新建对话";
}

function ensureProjectConversation(projectPath, titleSource = "") {
  const normalizedPath = String(projectPath || "").trim();
  if (!normalizedPath) return null;
  const existing = findProjectConversation(normalizedPath);
  if (existing) {
    currentConversationId = existing.id;
    return existing;
  }
  const conversation = {
    id: makeId(),
    title: projectConversationTitle(normalizedPath, titleSource),
    prompt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "准备就绪",
    archived: false,
    pinned: false,
    result: "",
    projectPath: normalizedPath,
    kind: "project",
  };
  conversations.unshift(conversation);
  currentConversationId = conversation.id;
  saveConversations();
  renderConversations();
  return conversation;
}

function createOrUpdateProjectConversation(prompt, titleSource = prompt) {
  const projectPathValue = projectSelect.value || "";
  const existing = findProjectConversation(projectPathValue);
  if (existing) {
    currentConversationId = existing.id;
    updateCurrentConversation({
      title: existing.title || projectConversationTitle(projectPathValue, titleSource),
      prompt,
      updatedAt: new Date().toISOString(),
      status: "正在思考",
      archived: false,
      projectPath: projectPathValue,
      kind: "project",
    });
    return;
  }
  createConversation(prompt, projectPathValue ? projectConversationTitle(projectPathValue, titleSource) : titleSource);
  updateCurrentConversation({
    title: projectPathValue ? projectConversationTitle(projectPathValue, titleSource) : createConversationTitle(titleSource),
    updatedAt: new Date().toISOString(),
    projectPath: projectPathValue,
    kind: projectPathValue ? "project" : "conversation",
  });
}

function updateCurrentConversation(patch) {
  if (!currentConversationId) return;
  conversations = conversations.map((conversation) =>
    conversation.id === currentConversationId ? { ...conversation, ...patch } : conversation
  );
  saveConversations();
  scheduleConversationRender();
}

function getConversation(id) {
  return conversations.find((conversation) => conversation.id === id);
}

function showConversation(conversation) {
  currentConversationId = conversation.id;
  if (conversation.projectPath) {
    const hasOption = Array.from(projectSelect.options).some((option) => option.value === conversation.projectPath);
    if (hasOption) {
      projectSelect.value = conversation.projectPath;
      updateCurrentProject();
    }
  }
  transcript.innerHTML = "";
  addMessage("user", "你", conversation.prompt || "");
  if (conversation.result) {
    addMessage("assistant", "Claude", conversation.result);
  } else {
    addMessage("system", normalizeConversationStatus(conversation.status), "这条对话还没有完整输出。");
  }
  removeRuntimeSummaryMessages();
  setRunState(statusToRunState(conversation.status), normalizeConversationStatus(conversation.status));
  renderConversations();
}

function statusToRunState(status) {
  const normalized = normalizeConversationStatus(status);
  if (normalized === "正在思考") return "thinking";
  if (normalized === "运行异常" || normalized === "连接中断") return "error";
  if (normalized === "已停止") return "stopped";
  if (normalized === "已完成") return "done";
  return "idle";
}

function renderConversations() {
  const showArchived = showArchivedToggle.checked;
  const search = conversationSearchTerm.trim().toLowerCase();
  const visible = conversations
    .filter((conversation) => Boolean(conversation.projectPath))
    .filter((conversation) => showArchived || !conversation.archived)
    .filter((conversation) => {
      if (!search) return true;
      return [conversation.title, conversation.prompt, conversation.result, conversation.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt) - new Date(a.createdAt));

  conversationList.innerHTML = "";

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "quiet-note";
    empty.textContent = search ? "没有匹配对话" : showArchived ? "没有归档对话" : "还没有对话";
    conversationList.append(empty);
    return;
  }

  for (const conversation of visible) {
    const card = document.createElement("div");
    card.className = [
      "conversation-card",
      conversation.id === currentConversationId ? "active" : "",
      conversation.archived ? "archived" : "",
      conversation.pinned ? "pinned" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const head = document.createElement("div");
    head.className = "conversation-card-head";

    const title = document.createElement("button");
    title.className = "conversation-card-title";
    title.type = "button";
    title.textContent = `${conversation.pinned ? "置顶 · " : ""}${conversationDisplayTitle(conversation)}`;
    title.addEventListener("click", () => showConversation(conversation));

    const more = document.createElement("button");
    more.className = "conversation-more-button";
    more.type = "button";
    more.setAttribute("aria-label", "更多对话操作");
    more.textContent = "...";
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      openConversationMenuId = openConversationMenuId === conversation.id ? null : conversation.id;
      renderConversations();
    });

    head.append(title, more);

    const meta = document.createElement("div");
    meta.className = "conversation-card-meta";
    meta.textContent = `${conversation.id === currentConversationId ? "当前工程" : "工程文件"} · ${formatTime(conversation.updatedAt || conversation.createdAt)}`;

    card.append(head, meta);

    if (openConversationMenuId === conversation.id) {
      card.append(createConversationMenu(conversation));
    }

    conversationList.append(card);
  }
}

function menuIcon(name) {
  const icons = {
    share: '<path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 15v4h14v-4" />',
    group: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M19 8v6" /><path d="M16 11h6" />',
    rename: '<path d="m14 5 5 5" /><path d="M4 20h5L19 10l-5-5L4 15v5Z" />',
    folder: '<path d="M4 6h6l2 2h8v10a2 2 0 0 1-2 2H4Z" />',
    pin: '<path d="m15 4 5 5-4 4v5l-2 2-5-5-5 5-1-1 5-5-5-5 2-2h5Z" />',
    archive: '<rect x="4" y="4" width="16" height="4" rx="1" /><path d="M6 8v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />',
    delete: '<path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 15h10l1-15" /><path d="M10 11v6" /><path d="M14 11v6" />',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ""}</svg>`;
}

function createConversationMenu(conversation) {
  const menu = document.createElement("div");
  menu.className = "conversation-menu";
  menu.addEventListener("click", (event) => event.stopPropagation());

  const items = [
    ["share", "分享", () => handleConversationAction(conversation.id, "share")],
    ["group", "开始群聊", () => handleConversationAction(conversation.id, "group")],
    ["rename", "重命名", () => handleConversationAction(conversation.id, "rename")],
    ["folder", "移至项目", () => handleConversationAction(conversation.id, "move"), false, true],
    ["pin", conversation.pinned ? "取消置顶" : "置顶聊天", () => handleConversationAction(conversation.id, "pin")],
    ["archive", conversation.archived ? "取消归档" : "归档", () => handleConversationAction(conversation.id, "archive")],
    ["delete", "删除", () => handleConversationAction(conversation.id, "delete"), true],
  ];

  for (const [icon, label, action, danger, arrow] of items) {
    if (icon === "pin") menu.append(createMenuDivider());
    const button = document.createElement("button");
    button.className = `conversation-menu-item${danger ? " danger" : ""}`;
    button.type = "button";
    button.innerHTML = `${menuIcon(icon)}<span>${label}</span>${arrow ? '<span class="menu-arrow">›</span>' : ""}`;
    button.addEventListener("click", action);
    menu.append(button);
  }

  return menu;
}

function createMenuDivider() {
  const divider = document.createElement("div");
  divider.className = "conversation-menu-divider";
  return divider;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

function isManagedProjectPath(projectPath) {
  const normalized = String(projectPath || "").trim().toLowerCase();
  return Boolean(normalized) && managedProjectFolders.some((item) => String(item.path || "").trim().toLowerCase() === normalized);
}

function removeConversationRecord(id) {
  conversations = conversations.filter((item) => item.id !== id);
  if (currentConversationId === id) {
    currentConversationId = null;
    setEmptyState();
    setRunState("idle", "准备就绪");
  }
  saveConversations();
}

async function deleteProjectConversation(conversation) {
  const displayTitle = conversationDisplayTitle(conversation);
  if (!conversation.projectPath || !isManagedProjectPath(conversation.projectPath)) {
    const confirmed = window.confirm(
      `「${displayTitle}」不是本面板新建的工程文件夹。为了保护客户文件，本次只从左侧移除记录，不删除磁盘文件。是否继续？`
    );
    if (confirmed) {
      removeConversationRecord(conversation.id);
      addMessage("system", "工程文件", "已从左侧移除记录；原始项目文件夹没有被删除。");
    }
    return;
  }

  const confirmed = window.confirm(
    `确认删除「${displayTitle}」吗？这会同时删除这个工程文件对应的文件夹，删除后不可恢复。`
  );
  if (!confirmed) return;

  const res = await fetch("/api/project-folders", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: conversation.projectPath,
      confirmName: conversation.projectPath.split(/[\\/]/).filter(Boolean).pop() || displayTitle,
    }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(result.error || "工程文件删除失败");
  }
  managedProjectFolders = result.folders || [];
  renderProjectOptions(result.projects || []);
  removeConversationRecord(conversation.id);
  addMessage("system", "工程文件", `已删除工程文件夹：${result.project?.name || displayTitle}`);
}

async function handleConversationAction(id, action) {
  const conversation = getConversation(id);
  if (!conversation) return;
  openConversationMenuId = null;

  if (action === "share") {
    const content = `# ${conversation.title}\n\n${conversation.prompt}\n\n${conversation.result || ""}`;
    try {
      await copyText(content);
      addMessage("system", "分享", "已复制当前对话内容；导出接口已预留。");
    } catch {
      addMessage("system", "分享", "复制能力不可用，分享 / 导出接口已预留。");
    }
  }

  if (action === "group") {
    addMessage("system", "开始群聊", "多人会话接口已预留，后续可接入群聊成员和共享上下文。");
  }

  if (action === "rename") {
    const nextTitle = window.prompt("请输入新的对话标题", conversation.title);
    if (nextTitle && nextTitle.trim()) {
      conversation.title = nextTitle.trim().slice(0, 80);
      saveConversations();
    }
  }

  if (action === "move") {
    addMessage("system", "移至项目", "项目选择二级菜单已预留，后续可接入项目列表和移动接口。");
  }

  if (action === "pin") {
    conversation.pinned = !conversation.pinned;
    saveConversations();
  }

  if (action === "archive") {
    conversation.archived = !conversation.archived;
    saveConversations();
  }

  if (action === "delete") {
    try {
      await deleteProjectConversation(conversation);
    } catch (error) {
      addMessage("error", "工程文件删除失败", error.message || "工程文件删除失败");
    }
    renderConversations();
    return;
    const confirmed = window.confirm(`确认删除「${conversation.title}」吗？此操作会移除本地会话记录。`);
    if (confirmed) {
      conversations = conversations.filter((item) => item.id !== id);
      if (currentConversationId === id) {
        currentConversationId = null;
        setEmptyState();
        setRunState("idle", "准备就绪");
      }
      saveConversations();
    }
  }

  renderConversations();
}

function createConversationTask(action, conversationId, runAt, name) {
  const conversation = getConversation(conversationId);
  if (!conversation) return null;
  return {
    id: makeId(),
    type: "conversation-action",
    action,
    conversationId,
    name: name || `${conversationActionLabels[action] || "对话操作"}：${conversation.title}`,
    prompt: `${conversationActionLabels[action] || "对话操作"}「${conversation.title}」`,
    runAt,
    repeatRule: "不重复",
    enabled: true,
    completedAt: "",
    createdAt: new Date().toISOString(),
    projectPath: projectSelect.value,
    permissionMode: activeMode,
    risk: dangerousConversationActions.has(action) ? "高风险：执行前必须二次确认" : "低风险：仅修改本地会话状态",
  };
}

function renderAutomations() {
  automationCount.textContent = String(automations.length);
  automationList.innerHTML = "";

  if (!automations.length) {
    const empty = document.createElement("div");
    empty.className = "quiet-note";
    empty.textContent = "还没有自动化";
    automationList.append(empty);
    return;
  }

  for (const item of automations) {
    automationList.append(
      createTaskRow(item, [
        { label: "启动", action: () => startRun(item.prompt) },
        { label: "填入", action: () => fillPrompt(item.prompt) },
        {
          label: "删除",
          danger: true,
          action: () => {
            automations = automations.filter((automation) => automation.id !== item.id);
            saveStoredList(automationsStorageKey, automations);
            renderAutomations();
          },
        },
      ])
    );
  }
}

function renderSchedules() {
  scheduleCount.textContent = String(schedules.length);
  scheduleList.innerHTML = "";

  if (!schedules.length) {
    const empty = document.createElement("div");
    empty.className = "quiet-note";
    empty.textContent = "还没有定时任务";
    scheduleList.append(empty);
    return;
  }

  for (const item of schedules) {
    const metaParts = [
      item.enabled ? "启用" : "暂停",
      formatSchedule(item.runAt),
      item.repeatRule || "不重复",
      item.risk || "执行前按权限策略确认",
    ];
    scheduleList.append(
      createTaskRow(
        {
          ...item,
          prompt: `${metaParts.join(" · ")} · ${item.prompt || ""}`,
        },
        [
          {
            label: item.enabled ? "暂停" : "恢复",
            action: () => {
              schedules = schedules.map((schedule) =>
                schedule.id === item.id ? { ...schedule, enabled: !schedule.enabled, completedAt: "" } : schedule
              );
              saveStoredList(schedulesStorageKey, schedules);
              renderSchedules();
            },
          },
          { label: "重试", action: () => runScheduleNow(item) },
          {
            label: "删除",
            danger: true,
            action: () => {
              const confirmed = window.confirm(`确认删除定时任务「${item.name || "未命名"}」吗？`);
              if (!confirmed) return;
              schedules = schedules.filter((schedule) => schedule.id !== item.id);
              saveStoredList(schedulesStorageKey, schedules);
              renderSchedules();
            },
          },
        ]
      )
    );
  }
}

function createTaskRow(item, actions) {
  const row = document.createElement("div");
  row.className = "automation-item";

  const title = document.createElement("div");
  title.className = "automation-item-title";
  title.textContent = item.name || "未命名";

  const actionGroup = document.createElement("div");
  actionGroup.className = "automation-actions";

  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tiny-button${action.danger ? " danger" : ""}`;
    button.textContent = action.label;
    button.addEventListener("click", action.action);
    actionGroup.append(button);
  }

  const meta = document.createElement("div");
  meta.className = "automation-item-meta";
  meta.textContent = item.prompt || "";

  row.append(title, actionGroup, meta);
  return row;
}

function formatSchedule(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未设置时间";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderProjectOptions(projects) {
  projectSelect.innerHTML = "";
  for (const project of projects || []) {
    const option = document.createElement("option");
    option.value = project.path;
    option.textContent = `${chineseProjectName(project.path, project.name)}  ·  ${project.path}`;
    projectSelect.append(option);
  }
  const knownPaths = new Set((projects || []).map((project) => String(project.path || "").trim().toLowerCase()).filter(Boolean));
  const beforeCount = conversations.length;
  conversations = conversations.filter((conversation) => {
    if (!conversation.projectPath) return true;
    return knownPaths.has(String(conversation.projectPath).trim().toLowerCase());
  });
  if (conversations.length !== beforeCount) saveConversations();
  syncProjectConversationCards(projects || []);
}

function syncProjectConversationCards(projects) {
  let changed = false;
  for (const project of projects || []) {
    if (!project?.path || findProjectConversation(project.path)) continue;
    conversations.push({
      id: makeId(),
      title: projectConversationTitle(project.path, project.name),
      prompt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "准备就绪",
      archived: false,
      pinned: false,
      result: "",
      projectPath: project.path,
      kind: "project",
    });
    changed = true;
  }
  if (changed) {
    saveConversations();
    renderConversations();
  }
}

function uniqueModels(models) {
  const seen = new Set();
  return models
    .map((model) => String(model || "").trim())
    .filter(Boolean)
    .filter((model) => {
      const key = model.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function setModelMenuOpen(menu, button, open) {
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
}

function closeModelGuideMenus() {
  setModelMenuOpen(mainModelMenu, modelChip, false);
  setModelMenuOpen(branchModelMenu, hostChip, false);
}

function updateModelSwitchLabels() {
  const activeModel = String(modelInput.value || "").trim();
  const mainModel = currentMainModel || activeModel || "默认模型";
  mainModelLabel.textContent = mainModel;
  mainModelLabel.title = mainModel;

  const usingBranch = activeModel && activeModel.toLowerCase() !== mainModel.toLowerCase();
  const branchLabel = usingBranch ? activeModel : "自动分支";
  branchModelLabel.textContent = branchLabel;
  branchModelLabel.title = usingBranch
    ? `当前使用分支模型：${activeModel}`
    : "当前跟随主模型；点击可选择分支模型";
}

function setActiveModel(model) {
  const nextModel = String(model || "").trim();
  if (!nextModel) return;
  modelInput.value = nextModel;
  window.localStorage.setItem(modelStorageKey, nextModel);
  updateModelSwitchLabels();
  renderBranchModelOptions();
  closeModelGuideMenus();
}

function renderBranchModelOptions() {
  branchModelOptions.innerHTML = "";
  const activeModel = String(modelInput.value || "").trim();
  const mainModel = currentMainModel || activeModel || "";

  const followMain = document.createElement("button");
  followMain.type = "button";
  const followsMain = !activeModel || activeModel.toLowerCase() === mainModel.toLowerCase();
  followMain.className = `model-option ${followsMain ? "is-active" : ""}`;
  const followTitle = document.createElement("span");
  followTitle.textContent = "自动分支";
  const followDetail = document.createElement("small");
  followDetail.textContent = "跟随当前主模型";
  followMain.append(followTitle, followDetail);
  followMain.addEventListener("click", () => setActiveModel(mainModel));
  branchModelOptions.append(followMain);

  const branchModels = uniqueModels(currentBranchModels.filter((model) => model.toLowerCase() !== mainModel.toLowerCase()));
  if (!branchModels.length) {
    const note = document.createElement("div");
    note.className = "model-guide-note";
    note.textContent = "暂未检测到可切换分支。后续可通过模型配置接口下发分支列表。";
    branchModelOptions.append(note);
    return;
  }

  for (const model of branchModels) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `model-option ${activeModel.toLowerCase() === model.toLowerCase() ? "is-active" : ""}`;
    const title = document.createElement("span");
    title.textContent = model;
    const detail = document.createElement("small");
    detail.textContent = "切换为主模型分支";
    option.append(title, detail);
    option.addEventListener("click", () => setActiveModel(model));
    branchModelOptions.append(option);
  }
}

async function loadManagedProjectFolders() {
  const res = await fetch("/api/project-folders", { cache: "no-store" });
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  managedProjectFolders = Array.isArray(data.folders) ? data.folders : [];
  let changed = false;
  for (const folder of managedProjectFolders) {
    const conversation = ensureProjectConversation(folder.path, folder.name);
    if (conversation && folder.name && conversation.title !== folder.name) {
      conversation.title = folder.name;
      changed = true;
    }
  }
  if (changed) {
    saveConversations();
    renderConversations();
  }
}

async function loadStatus() {
  const res = await fetch("/api/status", { cache: "no-store" });
  const status = await res.json();
  latestStatus = status;

  const model = status.model || "默认模型";
  const host = status.baseHost || "本地配置";
  const storedModel = window.localStorage.getItem(modelStorageKey) || model;
  currentMainModel = model;
  currentBranchModels = uniqueModels([...(Array.isArray(status.modelBranches) ? status.modelBranches : []), storedModel]);

  providerLine.textContent = `${model} · ${host}`;
  modelInput.value = storedModel;
  updateModelSwitchLabels();
  renderBranchModelOptions();
  versionLine.textContent = status.claudeVersion || "未检测到版本";
  hostLine.textContent = host;
  pluginSummary.textContent = status.plugins?.summary || "未检测到插件信息";
  skillsSummary.textContent = Array.isArray(status.skills)
    ? `${status.skills.length} 个：${status.skills.slice(0, 3).join("、")}${status.skills.length > 3 ? "..." : ""}`
    : "未检测到 skills";

  authDot.className = `dot ${status.authConfigured ? "ok" : "bad"}`;
  authText.textContent = status.authConfigured
    ? `已连接 · ${status.claudeVersion || "Claude Code"}`
    : "未检测到认证";

  const versionLocked = status.reservedFeatures?.versionUpdate?.locked !== false;
  versionUpdateBtn.textContent = versionLocked ? "版本更新：等待外部指令" : "版本更新：管理员通道已启用";
  versionUpdateBtn.classList.toggle("unlocked", !versionLocked);
  highRiskToolsLocked = status.securityPolicy?.highRiskLocked !== false;
  applyPermissionLocks();

  renderProjectOptions(status.projects || []);
  await loadManagedProjectFolders().catch(() => {
    managedProjectFolders = [];
  });

  const currentPath = window.localStorage.getItem(cwdStorageKey);
  if (currentPath && Array.from(projectSelect.options).some((option) => option.value === currentPath)) {
    projectSelect.value = currentPath;
  }

  updateCurrentProject();
  await loadRelayConfig().catch(() => {
    relayBadge.textContent = "接口异常";
    relayWriteState.textContent = "无法读取";
    relayNote.textContent = "请检查本地面板服务日志。";
  });
  renderConfigChecklist();
  maybeShowSetupWizard();
}

async function loadRelayConfig() {
  const res = await fetch("/api/relay-config", { cache: "no-store" });
  const relay = await res.json();
  const runtimeConfig = relay.runtimeConfig || {};
  const displayConfig = relay.config?.baseUrl || relay.config?.apiKeyConfigured ? relay.config : runtimeConfig;
  latestRelay = { ...relay, savedConfig: relay.config, config: displayConfig };
  relayWritable = Boolean(relay.writable);
  relayBadge.classList.toggle("enabled", relayWritable);
  relayBadge.textContent = relayWritable ? "接口已启用" : "接口预留";
  relayWriteState.textContent = relayWritable ? "可写入" : "未启用";

  const configuredText = displayConfig?.baseUrl
    ? `当前运行 ${displayConfig.baseUrl}${displayConfig.apiKeyConfigured ? `，Key ${displayConfig.apiKeyMasked || "已隐藏"}` : ""}`
    : "尚未保存中转站配置。";
  relayNote.textContent = relay.note ? `${relay.note} ${configuredText}` : configuredText;
  applyRelayConfigToForm(latestRelay);
  renderConfigChecklist();
}

function applyRelayConfigToForm(relay) {
  const config = relay.config || {};
  relayName.value = config.name || "";
  relayProvider.value = config.provider || "anthropic-compatible";
  relayBaseUrl.value = config.baseUrl || "";
  relayModel.value = config.model || "";
  relayApiKey.value = "";
  relayApiKey.placeholder = config.apiKeyConfigured ? "已保存 Key，留空不改" : "可选：技术测试时临时输入 API Key";
  relayEnabled.checked = Boolean(config.enabled);

  const fields = [relayName, relayProvider, relayBaseUrl, relayModel, relayApiKey, relayEnabled, relayTestBtn];
  for (const field of fields) {
    field.disabled = false;
  }
  relaySaveBtn.disabled = !relayWritable;

  relayFormNote.textContent = relayWritable
    ? "保存后会写入本机用户配置，API Key 不会在页面回显。"
    : "当前可以填写并测试连接；API Key 可临时用于测试，不会因为测试写入配置。保存写入仍需设置 CLEAN_PANEL_RELAY_CONFIG_ENABLED=1。";
}

async function saveRelayConfig(event) {
  event.preventDefault();
  if (!relayWritable) {
    relayFormNote.textContent = "当前未启用写入，配置不会保存。";
    return;
  }

  relaySaveBtn.disabled = true;
  relayFormNote.textContent = "保存中...";

  try {
    const res = await fetch("/api/relay-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: relayEnabled.checked,
        name: relayName.value,
        provider: relayProvider.value,
        baseUrl: relayBaseUrl.value,
        model: relayModel.value,
        apiKey: relayApiKey.value,
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || "保存失败");
    }
    relayFormNote.textContent = "已保存，API Key 已隐藏。";
    await loadRelayConfig();
  } catch (error) {
    relayFormNote.textContent = error.message;
    relaySaveBtn.disabled = false;
  }
}

function relayPayloadFromForm() {
  return {
    interfaceType: "relay",
    provider: relayProvider.value,
    baseUrl: relayBaseUrl.value.trim(),
    model: relayModel.value.trim(),
    apiKey: relayApiKey.value,
  };
}

function setupPayloadFromForm() {
  return {
    interfaceType: setupInterfaceType.value,
    provider: "anthropic-compatible",
    baseUrl: setupBaseUrl.value.trim(),
    model: setupMainModel.value.trim(),
    branchModels: setupBranchModel.value.trim(),
    apiKey: setupApiKey.value,
  };
}

function setInlineResult(element, message, ok = false) {
  element.textContent = message || "";
  element.dataset.state = ok ? "ok" : "error";
}

function getErrorHelp(code, httpStatus) {
  return errorHelp[code] || errorHelp[String(httpStatus || "")] || errorHelp.UNKNOWN_ERROR;
}

function formatErrorHelp(result = {}, httpStatus) {
  const help = getErrorHelp(result.code, httpStatus);
  const title = result.title || help.title;
  const message = result.message || result.error || help.message;
  const suggestion = result.suggestion || help.suggestion;
  return `${title}：${message}\n建议：${suggestion}`;
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function checklistRow(label, state, detail) {
  const row = document.createElement("div");
  row.className = "checklist-row";
  row.dataset.state = state;

  const name = document.createElement("span");
  name.textContent = label;

  const value = document.createElement("strong");
  value.textContent = state;

  const note = document.createElement("small");
  note.textContent = detail;

  row.append(name, value, note);
  return row;
}

function effectiveBranchModels(relayConfig = latestRelay?.config || {}, status = latestStatus || {}) {
  relayConfig = relayConfig && typeof relayConfig === "object" ? relayConfig : {};
  status = status && typeof status === "object" ? status : {};
  const branches = [
    ...(Array.isArray(relayConfig.branchModels) ? relayConfig.branchModels : []),
    ...(Array.isArray(status.modelBranches) ? status.modelBranches : []),
  ].filter(Boolean);
  if (branches.length) return branches;

  const fallbackModel = relayConfig.model || status.model || modelInput?.value || "";
  return fallbackModel ? [fallbackModel] : [];
}

function renderConfigChecklist() {
  if (!configChecklist) return;
  const relayConfig = latestRelay?.config || {};
  const baseUrl = relayConfig.baseUrl || (latestStatus?.baseHost ? `https://${latestStatus.baseHost}` : "");
  const mainModel = relayConfig.model || latestStatus?.model || "";
  const branchModels = effectiveBranchModels(relayConfig, latestStatus);
  const selectedProject = projectSelect?.value || "";
  const apiKeyReady = Boolean(relayConfig.apiKeyConfigured || latestStatus?.authConfigured);
  const apiKeyDetail = relayConfig.apiKeyConfigured
    ? relayConfig.apiKeyMasked || "已隐藏"
    : latestStatus?.authConfigured
      ? "已配置，已隐藏"
      : "未配置（基础界面可用，调用模型前需要）";
  const rows = [
    ["API Key", apiKeyReady ? "已完成" : "未完成", apiKeyDetail],
    ["接口地址", baseUrl ? "已完成" : "未完成", baseUrl || "请填写接口地址 / 中转站地址"],
    ["接口地址格式", baseUrl ? (isValidHttpUrl(baseUrl) ? "已完成" : "失败") : "需要检查", baseUrl ? (isValidHttpUrl(baseUrl) ? "格式有效" : "请使用 http:// 或 https:// 开头的完整地址") : "填写后自动检查"],
    ["主模型", mainModel ? "已完成" : "未完成", mainModel || "请填写主模型"],
    ["分支模型", branchModels.length ? "已完成" : "未完成", branchModels[0] || "不知道怎么选时可与主模型相同"],
    ["项目路径", selectedProject ? "已完成" : "未完成", selectedProject || "请选择或添加项目文件夹"],
    ["项目路径有效性", selectedProject ? "已完成" : "需要检查", selectedProject ? "已在项目列表中" : "选择后由后端校验"],
    [
      "测试连接",
      lastRelayTestResult ? (lastRelayTestResult.ok ? "已完成" : "失败") : "需要检查",
      lastRelayTestResult ? lastRelayTestResult.message || "已有测试结果" : "点击测试连接后更新状态",
    ],
    ["高权限", highRiskToolsLocked ? "已完成" : "需要检查", highRiskToolsLocked ? "已锁定，安全" : "管理员已开启，请谨慎使用"],
    ["诊断报告", lastDiagnosticsReport ? "已完成" : "需要检查", lastDiagnosticsReport ? "可生成、复制和下载" : "点击生成诊断报告"],
  ];

  if (configChecklistSummary) {
    const done = rows.filter(([, state]) => state === "已完成").length;
    const failed = rows.filter(([, state]) => state === "失败").length;
    const unfinished = rows.filter(([, state]) => state === "未完成").length;
    const pending = rows.filter(([, state]) => state === "需要检查").length;
    const summary = failed
      ? `${done}/${rows.length} 完成，${failed} 项失败`
      : unfinished
        ? `${done}/${rows.length} 完成，${unfinished} 项未完成`
        : pending
          ? `${done}/${rows.length} 完成，${pending} 项待检查`
          : `${done}/${rows.length} 已完成`;
    configChecklistSummary.textContent = summary;
    configChecklistSummary.dataset.state = failed ? "失败" : unfinished ? "未完成" : pending ? "需要检查" : "已完成";
  }

  configChecklist.innerHTML = "";
  for (const [label, state, detail] of rows) {
    configChecklist.append(checklistRow(label, state, detail));
  }
}

async function loadFeishuTutorialStatus() {
  if (!feishuTutorialBtn || !feishuTutorialStatus) return;
  feishuTutorialBtn.disabled = true;
  feishuTutorialStatus.textContent = "正在检测教程接口";

  try {
    const res = await fetch("/api/feishu-tutorial", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const configured = Boolean(data.configured && data.tutorialUrl);
    feishuTutorialStatus.textContent = configured
      ? "已接入飞书教程，点击可打开"
      : data.message || "飞书教程接口已预留，尚未配置";
    feishuTutorialBtn.disabled = !configured;
    feishuTutorialBtn.dataset.state = configured ? "ready" : "reserved";
    feishuTutorialBtn.onclick = () => {
      if (!configured) return;
      window.open(data.tutorialUrl, "_blank", "noopener,noreferrer");
    };
  } catch {
    feishuTutorialStatus.textContent = "飞书教程接口检测失败，请稍后重试";
    feishuTutorialBtn.disabled = true;
    feishuTutorialBtn.dataset.state = "error";
  }
}

function applyCompactRightPanelDefaults() {
  document.querySelectorAll(".right-compact-details").forEach((panel) => {
    panel.open = false;
  });
}

function renderHelpSections(sections) {
  helpDialogBody.innerHTML = "";
  for (const [title, paragraphs] of sections) {
    const section = document.createElement("section");
    section.className = "help-topic";

    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);

    if (paragraphs.length === 1) {
      const paragraph = document.createElement("p");
      paragraph.textContent = paragraphs[0];
      section.append(paragraph);
    } else {
      const list = document.createElement("ol");
      for (const item of paragraphs) {
        const li = document.createElement("li");
        li.textContent = item;
        list.append(li);
      }
      section.append(list);
    }
    helpDialogBody.append(section);
  }
}

function openHelpDialog(title, sections) {
  helpDialogTitle.textContent = title;
  renderHelpSections(sections);
  helpDialog.hidden = false;
}

function closeHelpDialog() {
  helpDialog.hidden = true;
}

function splitPluginSummary(summary = "") {
  return String(summary || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizePluginLine(line = "") {
  const text = String(line || "").trim();
  if (!text) return "";
  if (/no plugins installed/i.test(text)) return "暂未检测到已安装插件";
  if (/claude plugin install/i.test(text)) return "需要安装插件时，可在右侧输入插件名称并生成安装指令";
  return text;
}

const SKILL_TOGGLE_STORAGE_KEY = "cleanClaudePanel.skillToggleState";

const SKILL_DESCRIPTION_PATTERNS = [
  ["adguardhome", "广告过滤与家庭网络服务管理辅助技能。"],
  ["anygen", "内容生成辅助技能，可用于生成脚本、文本或素材指令。"],
  ["audacity", "音频编辑工具辅助技能。"],
  ["blender", "Blender 三维建模与渲染辅助技能。"],
  ["browser", "浏览器与网页操作辅助技能。"],
  ["calibre", "电子书管理与转换辅助技能。"],
  ["chromadb", "向量数据库 Chroma 管理辅助技能。"],
  ["cloudanalyzer", "云资源分析与排查辅助技能。"],
  ["cloudcompare", "点云与三维数据处理辅助技能。"],
  ["comfyui", "ComfyUI 工作流与图像生成辅助技能。"],
  ["dify-workflow", "Dify 工作流管理辅助技能。"],
  ["drawio", "流程图与架构图绘制辅助技能。"],
  ["eth2-quickstart", "以太坊相关开发环境辅助技能。"],
  ["exa", "搜索与资料检索辅助技能。"],
  ["firefly-iii", "Firefly III 财务管理辅助技能。"],
  ["freecad", "FreeCAD 建模辅助技能。"],
  ["gimp", "GIMP 图像编辑辅助技能。"],
  ["godot", "Godot 游戏开发辅助技能。"],
  ["inkscape", "Inkscape 矢量图编辑辅助技能。"],
  ["intelwatch", "系统与硬件状态观察辅助技能。"],
  ["iterm2", "iTerm2 终端控制辅助技能。"],
  ["kdenlive", "Kdenlive 视频剪辑辅助技能。"],
  ["krita", "Krita 绘画与图片处理辅助技能。"],
  ["libreoffice", "LibreOffice 文档处理辅助技能。"],
  ["lldb", "LLDB 调试辅助技能。"],
  ["macrocli", "宏命令与批量操作辅助技能。"],
  ["mailchimp", "Mailchimp 营销邮件管理辅助技能。"],
  ["mermaid", "Mermaid 图表生成辅助技能。"],
  ["minimax", "MiniMax 模型与接口调用辅助技能。"],
  ["mubu", "幕布文档与大纲辅助技能。"],
  ["musescore", "MuseScore 曲谱编辑辅助技能。"],
  ["n8n", "n8n 自动化流程辅助技能。"],
  ["notebooklm", "NotebookLM 资料整理辅助技能。"],
  ["novita", "Novita 模型服务辅助技能。"],
  ["nsight", "NVIDIA Nsight 图形调试辅助技能。"],
  ["obs-studio", "OBS 直播与录制辅助技能。"],
  ["obsidian", "Obsidian 笔记与知识库辅助技能。"],
  ["ollama", "Ollama 本地模型管理辅助技能。"],
  ["openscreen", "屏幕或展示相关辅助技能。"],
  ["pm2", "PM2 进程管理辅助技能。"],
  ["qgis", "QGIS 地理信息处理辅助技能。"],
  ["quietshrink", "媒体压缩与轻量处理辅助技能。"],
  ["rekordbox", "Rekordbox 音乐管理辅助技能。"],
  ["renderdoc", "RenderDoc 图形调试辅助技能。"],
  ["safari", "Safari 浏览器辅助技能。"],
  ["seaclip", "图文检索与素材理解辅助技能。"],
  ["shotcut", "Shotcut 视频剪辑辅助技能。"],
  ["slay-the-spire", "游戏或策略内容辅助技能。"],
  ["threemf", "3MF 三维文件处理辅助技能。"],
  ["unrealinsights", "Unreal Insights 性能分析辅助技能。"],
  ["videocaptioner", "视频字幕与字幕处理辅助技能。"],
  ["wiremock", "WireMock 接口模拟辅助技能。"],
  ["zoom", "Zoom 会议辅助技能。"],
  ["zotero", "Zotero 文献管理辅助技能。"],
  ["cli-hub-meta-skill", "技能库索引与 CLI 技能管理辅助能力。"],
];

function skillDescription(name = "") {
  const normalized = String(name || "").toLowerCase();
  const hit = SKILL_DESCRIPTION_PATTERNS.find(([keyword]) => normalized.includes(keyword));
  return hit ? hit[1] : "已安装的本机技能，可在需要时辅助 Claude Code 完成对应任务。";
}

function readSkillToggleState() {
  try {
    return JSON.parse(localStorage.getItem(SKILL_TOGGLE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSkillToggleState(state) {
  try {
    localStorage.setItem(SKILL_TOGGLE_STORAGE_KEY, JSON.stringify(state || {}));
  } catch {
    // localStorage may be unavailable in a restricted embedded browser.
  }
}

function skillIsEnabled(name = "") {
  const state = readSkillToggleState();
  return state[String(name || "")] !== false;
}

function setSkillEnabled(name = "", enabled = true) {
  const state = readSkillToggleState();
  state[String(name || "")] = Boolean(enabled);
  writeSkillToggleState(state);
}

function extensionListItem(text, type = "skill") {
  const item = document.createElement("div");
  item.className = `installed-extension-item ${type}`;

  const badge = document.createElement("span");
  badge.className = "installed-extension-badge";
  badge.textContent = type === "plugin" ? "插件" : "已安装";

  const name = document.createElement("strong");
  name.textContent = text;

  const note = document.createElement("small");
  note.textContent = type === "plugin"
    ? "已检测到的插件信息"
    : skillDescription(text);

  item.append(badge, name, note);

  if (type === "skill") {
    const actions = document.createElement("div");
    actions.className = "installed-extension-actions";

    const uninstall = document.createElement("button");
    uninstall.className = "skill-uninstall-button";
    uninstall.type = "button";
    uninstall.textContent = "卸载";
    uninstall.title = "生成卸载指令，执行前仍需确认";
    uninstall.addEventListener("click", () => {
      fillPrompt(`请卸载 Claude Code Skill：${text}。先说明将删除的位置、风险和影响，等待我确认后再执行。`);
      closeInstalledExtensionsPage();
    });

    const toggle = document.createElement("label");
    toggle.className = "skill-enable-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = skillIsEnabled(text);
    const slider = document.createElement("span");
    slider.className = "skill-enable-slider";
    const toggleText = document.createElement("em");
    toggleText.textContent = checkbox.checked ? "开启" : "暂停";
    checkbox.addEventListener("change", () => {
      setSkillEnabled(text, checkbox.checked);
      toggleText.textContent = checkbox.checked ? "开启" : "暂停";
      item.classList.toggle("is-skill-disabled", !checkbox.checked);
    });
    toggle.append(checkbox, slider, toggleText);
    item.classList.toggle("is-skill-disabled", !checkbox.checked);
    actions.append(uninstall, toggle);
    item.append(actions);
  }

  return item;
}

function renderInstalledExtensionList(container, items, type) {
  if (!container) return;
  container.innerHTML = "";
  for (const item of items) {
    container.append(extensionListItem(item, type));
  }
}

function installedExtensionItems(status = latestStatus || {}) {
  const pluginItems = splitPluginSummary(status.plugins?.summary)
    .map(normalizePluginLine)
    .filter(Boolean);
  const skills = Array.isArray(status.skills)
    ? status.skills.map((skill) => String(skill || "").trim()).filter(Boolean)
    : [];

  return {
    plugins: pluginItems.length ? pluginItems : ["暂未检测到已安装插件"],
    skills: skills.length ? skills : ["暂未检测到已安装 Skill"],
  };
}

function closeInstalledExtensionsPage() {
  document.body.classList.remove("extensions-page-mode");
  if (extensionsPage) extensionsPage.hidden = true;
  if (transcript) transcript.hidden = false;
  if (promptForm) promptForm.hidden = false;
}

function installedExtensionsSections(status = latestStatus || {}) {
  const pluginLines = splitPluginSummary(status.plugins?.summary);
  const pluginItems = pluginLines.length ? pluginLines : ["未检测到已安装插件，或 Claude Code 插件列表暂不可用。"];
  const skills = Array.isArray(status.skills) && status.skills.length
    ? status.skills
    : ["未检测到已安装 Skill。"];

  return [
    ["插件", pluginItems],
    ["Skills", skills],
    [
      "说明",
      [
        "这里是只读查看页，只显示本机当前检测到的插件与 Skills，不会安装、删除或修改任何内容。",
        "如果刚安装完插件或 Skill，请点击右侧刷新或重新打开本页面查看最新状态。",
      ],
    ],
  ];
}

async function openInstalledExtensionsView() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error("无法读取插件与 Skills 状态");
    latestStatus = await res.json();
    pluginSummary.textContent = latestStatus.plugins?.summary || "未检测到插件信息";
    skillsSummary.textContent = Array.isArray(latestStatus.skills)
      ? `${latestStatus.skills.length} 个：${latestStatus.skills.slice(0, 3).join("、")}${latestStatus.skills.length > 3 ? "..." : ""}`
      : "未检测到 Skills";
    const items = installedExtensionItems(latestStatus);
    renderInstalledExtensionList(installedSkillsList, items.skills, "skill");
    renderInstalledExtensionList(installedPluginsList, items.plugins, "plugin");
    closeHelpDialog();
    document.body.classList.add("extensions-page-mode");
    if (transcript) transcript.hidden = true;
    if (promptForm) promptForm.hidden = true;
    if (extensionsPage) extensionsPage.hidden = false;
  } catch (error) {
    renderInstalledExtensionList(installedSkillsList, ["读取失败，请确认本地服务正常运行后重试"], "skill");
    renderInstalledExtensionList(installedPluginsList, [error.message || "无法读取当前插件与 Skills 信息"], "plugin");
    document.body.classList.add("extensions-page-mode");
    if (transcript) transcript.hidden = true;
    if (promptForm) promptForm.hidden = true;
    if (extensionsPage) extensionsPage.hidden = false;
  }
}

function validateRelayTestPayload(payload) {
  if (!String(payload.baseUrl || "").trim()) return "接口地址不能为空";
  if (!String(payload.model || "").trim()) return "主模型不能为空";
  return "";
}

async function testRelayConnection(payload, outputElement, button) {
  const validationError = validateRelayTestPayload(payload);
  if (validationError) {
    setInlineResult(outputElement, validationError, false);
    return false;
  }

  outputElement.textContent = "正在测试连接...";
  outputElement.dataset.state = "";
  button.disabled = true;
  try {
    const res = await fetch("/api/test-relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({ ok: false, message: "未知错误，请查看诊断日志" }));
    lastRelayTestResult = {
      ok: Boolean(result.ok),
      code: result.code || "",
      message: result.message || result.error || "",
      suggestion: result.suggestion || "",
      checkedAt: result.checkedAt || new Date().toISOString(),
    };
    setInlineResult(
      outputElement,
      result.ok ? result.message || "连接成功，可以正常使用" : formatErrorHelp(result, res.status),
      Boolean(result.ok)
    );
    renderConfigChecklist();
    return Boolean(result.ok);
  } catch (error) {
    lastRelayTestResult = {
      ok: false,
      code: "NETWORK_ERROR",
      message: error.message,
      suggestion: "请检查本地服务是否正常运行，稍后再试。",
      checkedAt: new Date().toISOString(),
    };
    setInlineResult(outputElement, formatErrorHelp(lastRelayTestResult), false);
    renderConfigChecklist();
    return false;
  } finally {
    button.disabled = false;
  }
}

function setupMissingItems() {
  const relayConfig = latestRelay?.config || {};
  const branchModels = effectiveBranchModels(relayConfig, latestStatus);
  const missing = [];
  if (!(latestStatus?.baseHost || relayConfig.baseUrl)) missing.push("接口地址 / 中转站地址未配置");
  if (!(latestStatus?.model || relayConfig.model)) missing.push("主模型未配置");
  if (!branchModels.length) missing.push("分支模型未配置");
  if (!projectSelect.value) missing.push("项目路径未配置");
  return missing;
}

function fillSetupWizardDefaults() {
  const relayConfig = latestRelay?.config || {};
  setupBaseUrl.value = setupBaseUrl.value || relayConfig.baseUrl || (latestStatus?.baseHost ? `https://${latestStatus.baseHost}` : "");
  setupMainModel.value = setupMainModel.value || relayConfig.model || latestStatus?.model || "";
  const branchModels = effectiveBranchModels(relayConfig, latestStatus);
  setupBranchModel.value = setupBranchModel.value || branchModels[0] || setupMainModel.value || "";
  setupProjectPath.value = setupProjectPath.value || projectSelect.value || "";
  setupSavedKeyState.textContent = relayConfig.apiKeyConfigured
    ? `已保存 API Key：${relayConfig.apiKeyMasked || "已隐藏"}，页面不会回显完整 Key。`
    : "API Key 可暂不填写；基础界面和诊断仍可使用。真实测试或调用模型前再临时填写。";
}

function openSetupWizard() {
  if (!setupWizard) return;
  const missing = setupMissingItems();
  setupMissingList.textContent = missing.length
    ? `检测到还缺少：${missing.join("、")}。完成后即可进入主界面。`
    : "当前基础配置已完成，可继续查看或调整接口、模型和项目路径。";
  fillSetupWizardDefaults();
  setupWizard.hidden = false;
}

function maybeShowSetupWizard() {
  if (!setupWizard) return;
  const missing = setupMissingItems();
  if (setupOpenHint) {
    setupOpenHint.textContent = missing.length
      ? `检测到还缺少：${missing.join("、")}。点击“控制面板配置”打开。`
      : "接口、模型和项目配置已完成；需要修改时点击打开。";
  }
  if (setupOpenBtn) {
    setupOpenBtn.classList.toggle("primary", missing.length > 0);
  }
}

function hideSetupWizard() {
  setupWizard.hidden = true;
}

function showSetupError(message) {
  setupWizardError.textContent = message;
  setupWizardError.hidden = !message;
}

function validateSetupForm() {
  if (!setupBaseUrl.value.trim()) return "接口地址不能为空";
  if (!setupMainModel.value.trim()) return "主模型不能为空";
  if (!setupBranchModel.value.trim()) return "分支模型不能为空；如果没有分支模型，请填写与主模型相同的模型名";
  if (!setupProjectPath.value.trim()) return "项目路径不能为空";
  return "";
}

async function saveSetupWizard() {
  const validationError = validateSetupForm();
  if (validationError) {
    showSetupError(validationError);
    return;
  }

  setupSaveBtn.disabled = true;
  showSetupError("");
  setupTestResult.textContent = setupTestResult.textContent || "建议先测试连接。";

  try {
    const configRes = await fetch("/api/setup-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(setupPayloadFromForm()),
    });
    const configResult = await configRes.json().catch(() => ({}));
    if (!configRes.ok && configRes.status !== 409) throw new Error(configResult.error || "接口配置保存失败");
    if (configRes.status === 409) {
      setupTestResult.textContent = "检测到已有接口配置，已保留原配置，不覆盖客户设置。";
    }

    const projectRes = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: setupProjectPath.value.trim() }),
    });
    const projectResult = await projectRes.json().catch(() => ({}));
    if (!projectRes.ok) throw new Error(projectResult.error || "项目路径保存失败");

    await loadStatus();
    window.sessionStorage.setItem(setupDismissedKey, "1");
    hideSetupWizard();
    addMessage("system", "首次配置", "配置已保存，API Key 不作为客户版强制项，项目路径已加入白名单。");
  } catch (error) {
    showSetupError(error.message || "首次配置保存失败");
  } finally {
    setupSaveBtn.disabled = false;
  }
}

function deriveDiagnosticIssues(data) {
  const issues = [];
  if (!data?.service?.ok) {
    issues.push({ code: "SERVICE_UNHEALTHY", level: "error", text: "Claude 控制台服务异常或未返回健康状态。" });
  }
  if (!data?.configuration?.authConfigured) {
    issues.push({ code: "MISSING_API_KEY", level: "error", text: "API Key 未配置，真实连接测试或调用模型前需要配置。" });
  }
  if (!data?.configuration?.baseUrlConfigured) {
    issues.push({ code: "MISSING_BASE_URL", level: "error", text: "Base URL / 中转站地址未配置。" });
  }
  if (!data?.configuration?.mainModel) {
    issues.push({ code: "MISSING_MODEL", level: "error", text: "主模型未配置。" });
  }
  if (!Array.isArray(data?.configuration?.branchModels) || !data.configuration.branchModels.filter(Boolean).length) {
    issues.push({ code: "MISSING_BRANCH_MODEL", level: "warn", text: "分支模型未配置；需要自动分支时请补齐。" });
  }
  if (!data?.configuration?.projectCount) {
    issues.push({ code: "MISSING_PROJECT_PATH", level: "warn", text: "尚未添加项目工程路径。" });
  }
  if (data?.security?.highRiskLocked) {
    issues.push({ code: "HIGH_RISK_LOCKED", level: "info", text: "高权限工具保持锁定，这是客户版推荐安全状态。" });
  }
  return issues;
}

function updateDiagnosticsStatus(state, message, codeText = "") {
  if (!diagnosticsStatus) return;
  diagnosticsStatus.dataset.state = state;
  diagnosticsStatus.innerHTML = `<strong>${message}</strong><span>${codeText}</span>`;
}

function formatDiagnosticsReport(data) {
  const selectedProject = projectSelect.value || "未选择";
  const test = lastRelayTestResult
    ? `${lastRelayTestResult.ok ? "成功" : "失败"}：${lastRelayTestResult.message}${lastRelayTestResult.suggestion ? `；建议：${lastRelayTestResult.suggestion}` : ""}`
    : "尚未测试";
  const issues = deriveDiagnosticIssues(data);
  const blockingIssues = issues.filter((item) => item.level === "error" || item.level === "warn");
  const resultCode = blockingIssues.length ? blockingIssues.map((item) => item.code).join(" / ") : "DIAG_OK";
  const resultText = blockingIssues.length ? "需要处理" : "通过";
  const recommendations = data.recommendations?.length ? data.recommendations : ["暂无建议"];
  const recentErrors = data.recentErrors?.length
    ? data.recentErrors.flatMap((item) => [`${item.file}:`, ...item.lines.map((line) => `  ${line}`)])
    : ["未检测到最近错误日志"];
  return [
    `诊断结果：${resultText}`,
    `诊断代码：${resultCode}`,
    `生成时间：${new Date(data.generatedAt || Date.now()).toLocaleString("zh-CN")}`,
    `软件版本：${data.softwareVersion || "未知"}`,
    `服务状态：${data.service?.ok ? "正常" : "异常"}`,
    `当前端口：${data.service?.port || ""}`,
    `API Key：${data.configuration?.authConfigured ? data.configuration?.apiKeyMasked || "已配置，已隐藏" : "未配置（基础界面可用，调用模型前需要）"}`,
    `Base URL：${data.configuration?.baseUrlConfigured ? "已配置" : "未配置"}`,
    `主模型：${data.configuration?.mainModel || "未配置"}`,
    `分支模型：${(data.configuration?.branchModels || []).join("、") || "未配置"}`,
    `项目路径：${selectedProject}`,
    `toolProfile 默认值：${data.security?.defaultToolProfile || "none"}`,
    `高权限锁定：${data.security?.highRiskLocked ? "是" : "否"}`,
    `最近接口测试：${test}`,
    "",
    "错误代码明细：",
    ...(issues.length ? issues.map((item) => `- [${item.level.toUpperCase()}] ${item.code}：${item.text}`) : ["- [OK] DIAG_OK：未发现基础配置问题。"]),
    "",
    "诊断建议：",
    ...recommendations.map((item) => `- ${item}`),
    "",
    "最近审计摘要：",
    ...(data.recentAudit || []).map((item) => `- ${item.time || ""} ${item.feature || ""} ${item.action || ""} ${item.result || ""}`),
    "",
    "最近错误摘要：",
    ...recentErrors,
  ].join("\n");
}

async function generateDiagnostics() {
  setRunSection("diagnostics");
  diagnosticsOutput.hidden = false;
  diagnosticsOutput.dataset.state = "running";
  diagnosticsOutput.textContent = "正在生成诊断报告...";
  updateDiagnosticsStatus("running", "自检运行中", "正在收集服务、配置和日志");
  diagnosticsCopyBtn.disabled = true;
  diagnosticsDownloadBtn.disabled = true;
  try {
    const res = await fetch("/api/diagnostics", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `诊断接口异常：HTTP ${res.status}`);
    const issues = deriveDiagnosticIssues(data);
    const blockingIssues = issues.filter((item) => item.level === "error" || item.level === "warn");
    const resultCode = blockingIssues.length ? blockingIssues.map((item) => item.code).join(" / ") : "DIAG_OK";
    lastDiagnosticsReport = formatDiagnosticsReport(data);
    diagnosticsOutput.dataset.state = blockingIssues.length ? "warning" : "ok";
    diagnosticsOutput.textContent = lastDiagnosticsReport;
    updateDiagnosticsStatus(blockingIssues.length ? "warning" : "ok", blockingIssues.length ? "发现需处理项" : "自检通过", resultCode);
    diagnosticsCopyBtn.disabled = false;
    diagnosticsDownloadBtn.disabled = false;
    renderConfigChecklist();
  } catch (error) {
    lastDiagnosticsReport = `诊断结果：失败\n诊断代码：DIAGNOSTICS_API_FAILED\n错误代码明细：\n- [ERROR] DIAGNOSTICS_API_FAILED：${error.message || "诊断接口无法访问"}\n`;
    diagnosticsOutput.dataset.state = "error";
    diagnosticsOutput.textContent = lastDiagnosticsReport;
    updateDiagnosticsStatus("error", "自检失败", "DIAGNOSTICS_API_FAILED");
    renderConfigChecklist();
  }
}

async function copyDiagnosticsReport() {
  if (!lastDiagnosticsReport) return;
  try {
    await navigator.clipboard.writeText(lastDiagnosticsReport);
    diagnosticsOutput.textContent = `${lastDiagnosticsReport}\n\n已复制诊断报告。`;
  } catch {
    diagnosticsOutput.textContent = `${lastDiagnosticsReport}\n\n复制失败，请手动选中报告内容复制。`;
  }
}

function downloadDiagnosticsReport() {
  if (!lastDiagnosticsReport) return;
  const blob = new Blob([lastDiagnosticsReport], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clean-claude-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function updateCurrentProject() {
  const selected = projectSelect.value || "";
  currentProject.textContent = selected ? chineseProjectName(selected) : "未选择工程文件";
  projectPath.textContent = selected;
  if (selected) window.localStorage.setItem(cwdStorageKey, selected);
  renderConfigChecklist();
}

async function addProjectPath() {
  const input = window.prompt("请输入项目工程文件夹路径", projectSelect.value || "");
  const projectPathValue = String(input || "").trim();
  if (!projectPathValue) return;

  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: projectPathValue }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || "项目路径保存失败");
    }
    renderProjectOptions(result.projects || [result.project]);
    projectSelect.value = result.project.path;
    updateCurrentProject();
    ensureProjectConversation(result.project.path, result.project.name);
    addMessage("system", "项目", `已增加项目工程路径：${result.project.path}`);
  } catch (error) {
    addMessage("error", "项目路径无效", error.message || "项目路径保存失败");
  }
}

function openProjectNameDialog() {
  if (!projectNameDialog) return;
  projectNameDialog.hidden = false;
  projectNameError.hidden = true;
  projectNameError.textContent = "";
  projectNameInput.value = "";
  setTimeout(() => projectNameInput.focus(), 0);
}

function closeProjectNameDialog() {
  if (!projectNameDialog) return;
  projectNameDialog.hidden = true;
  projectNameError.hidden = true;
  projectNameError.textContent = "";
}

function localizeProjectNameError(message) {
  const text = String(message || "").trim();
  if (!text) return "工程文件创建失败，请稍后重试。";
  if (/Cannot read properties of null/i.test(text) || /modelBranches/i.test(text)) {
    return "工程文件已创建，但界面状态同步失败。请刷新页面后重试。";
  }
  if (/Failed to fetch/i.test(text)) {
    return "本地服务连接失败，请检查控制面板服务是否正常运行。";
  }
  if (/Unexpected token/i.test(text)) {
    return "服务返回格式异常，请刷新页面后重试。";
  }
  if (/TypeError|ReferenceError|Cannot\s+/i.test(text)) {
    return "工程文件已处理，但界面同步时出现异常。请刷新页面后再试。";
  }
  return text;
}

function showProjectNameError(message) {
  projectNameError.textContent = localizeProjectNameError(message);
  projectNameError.hidden = false;
}

async function createManagedProjectFromDialog() {
  const name = projectNameInput.value.trim();
  if (!name) {
    showProjectNameError("请先输入工程文件名");
    return;
  }

  projectNameCreateBtn.disabled = true;
  projectNameError.hidden = true;
  projectNameError.textContent = "";
  try {
    const res = await fetch("/api/project-folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || "工程文件创建失败");

    const project = result.project || {};
    if (!project.path) throw new Error("工程文件创建失败：服务没有返回项目路径");

    closeProjectNameDialog();

    try {
      managedProjectFolders = Array.isArray(result.folders) ? result.folders : managedProjectFolders;
      renderProjectOptions(result.projects || [project]);
      projectSelect.value = project.path;
      updateCurrentProject();
      const conversation = ensureProjectConversation(project.path, project.name);
      if (conversation) {
        conversation.title = project.name;
        conversation.status = "准备就绪";
        saveConversations();
        showConversation(conversation);
      }
    } catch (syncError) {
      console.warn("Project created, but UI sync failed:", syncError);
      closeProjectNameDialog();
      loadManagedProjectFolders().catch(() => {});
    }
  } catch (error) {
    const message = error.message || "";
    if (/Cannot read properties of null/i.test(message) || /modelBranches/i.test(message)) {
      closeProjectNameDialog();
      await loadStatus().catch(() => {});
      await loadManagedProjectFolders().catch(() => {});
      renderConversations();
      return;
    }
    showProjectNameError(message || "工程文件创建失败");
  } finally {
    projectNameCreateBtn.disabled = false;
  }
}

function isModeLocked(mode) {
  const config = modeNotes[mode];
  return Boolean(config?.highRisk && highRiskToolsLocked);
}

function confirmAssistedMode(mode) {
  const config = modeNotes[mode] || modeNotes.takeover;
  const isBrowser = mode === "browser";
  return window.confirm(
    [
      `你即将开启${config.label}。`,
      "",
      isBrowser
        ? "此模式用于浏览器自动化：打开网页、搜索、点击、输入和读取页面。"
        : "此模式用于谨慎的桌面辅助：打开文件、引导操作、配合语音指令。",
      "它不会修改本控制台源码，也不会修改客户配置。",
      "涉及删除、覆盖、命令执行、上传敏感数据等危险动作时，仍必须再次确认。",
      "",
      "是否继续？",
    ].join("\n")
  );
}

function setMode(mode) {
  const requestedMode = modeNotes[mode] ? mode : "safe";
  if (isModeLocked(requestedMode)) {
    const title = modeNotes[requestedMode]?.title || "高权限模式";
    addMessage(
      "system",
      "权限已锁定",
      `${title}当前默认锁定。需要管理员外部授权后才能使用，且不会修改控制台源码或客户配置。`
    );
    closePermissionMenu();
    closeComposerPermissionMenu();
    return;
  }
  const browserOrTakeoverMode = requestedMode === "browser" || requestedMode === "takeover";
  const currentModeAccepted = requestedMode === "browser" ? browserModeAccepted : takeoverModeAccepted;
  if (browserOrTakeoverMode && activeMode !== requestedMode && !currentModeAccepted) {
    if (!confirmAssistedMode(requestedMode)) {
      addMessage("system", modeNotes[requestedMode].label, `已取消开启${modeNotes[requestedMode].label}。`);
      closePermissionMenu();
      closeComposerPermissionMenu();
      return;
    }
    if (requestedMode === "browser") browserModeAccepted = true;
    if (requestedMode === "takeover") takeoverModeAccepted = true;
    addMessage("system", modeNotes[requestedMode].label, `已开启${modeNotes[requestedMode].label}。此模式不会修改控制台源码或客户配置。`);
  }
  activeMode = requestedMode;
  for (const button of modeButtons) {
    button.classList.toggle("is-active", button.dataset.mode === activeMode);
  }
  for (const button of composerModeButtons) {
    button.classList.toggle("is-active", button.dataset.composerMode === activeMode);
  }
  const config = modeNotes[activeMode] || modeNotes.default;
  permissionMenuLabel.textContent = config.label;
  composerPermissionLabel.textContent = config.label;
  composerPermissionButton.dataset.activeMode = activeMode;
  composerPermissionIcon.innerHTML = composerModeIcon(activeMode);
  modeNote.textContent = config.note;
  modeDetails.innerHTML = `<strong>${config.title}</strong><span>${config.detail}</span><span>toolProfile（工具权限档位）：${config.toolProfile}；后端参数保持不变。</span>`;
  toolAccessLabel.textContent = config.toolLabel;
  riskLevelLabel.textContent = config.risk;
  riskLevelLabel.dataset.risk = config.risk;
  renderConfigChecklist();
}

function applyPermissionLocks() {
  for (const button of [...modeButtons, ...composerModeButtons]) {
    const mode = button.dataset.mode || button.dataset.composerMode;
    const locked = isModeLocked(mode);
    const caution = Boolean(modeNotes[mode]?.caution);
    button.disabled = locked;
    button.classList.toggle("is-locked", locked);
    button.classList.toggle("is-caution", caution);
    if (locked) {
      button.title = "高权限模式默认锁定，需要管理员启用后才能使用";
    } else if (caution) {
      button.title = "谨慎使用：开启前需要确认，只用于桌面辅助";
    } else {
      button.removeAttribute("title");
    }
  }
  if (isModeLocked(activeMode)) {
    activeMode = "safe";
  }
  setMode(activeMode);
}

function composerModeIcon(mode) {
  if (mode === "readOnly") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7Z" /><path d="m9 12 2 2 4-5" /></svg>';
  }
  if (mode === "browser" || mode === "takeover") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" /><path d="M9 11h6" /><path d="M9 15h4" /></svg>';
  }
  if (mode === "edit" || mode === "expert") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7Z" /><path d="M12 8v5" /><path d="M12 17h.01" /></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V6a2 2 0 0 1 4 0v4" /><path d="M11 10V5a2 2 0 0 1 4 0v6" /><path d="M15 11V7a2 2 0 0 1 4 0v6" /><path d="M7 11a2 2 0 0 0-4 0v2a8 8 0 0 0 8 8h2a6 6 0 0 0 6-6v-2" /></svg>';
}

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function speechRecognitionAvailable() {
  return Boolean(getSpeechRecognitionConstructor());
}

async function loadVoiceCapabilities() {
  try {
    const res = await fetch("/api/voice-capabilities", { cache: "no-store" });
    latestVoiceCapability = await res.json();
  } catch {
    latestVoiceCapability = {
      ok: false,
      providerVoice: { available: false },
      browserVoice: { speechToText: speechRecognitionAvailable(), textToSpeech: "speechSynthesis" in window },
    };
  }
  updateVoiceButtonHint();
  return latestVoiceCapability;
}

function voiceModeDescription() {
  const browserReady = speechRecognitionAvailable();
  const nativeReady = Boolean(latestVoiceCapability?.providerVoice?.available);
  if (browserReady) {
    return nativeReady
      ? "语音对话：本地麦克风可用，模型语音接口已检测到可接入"
      : "语音对话：使用本地麦克风听写，自动发送给当前模型";
  }
  if (nativeReady) return "语音对话：浏览器听写不可用，模型原生语音接口已预留";
  return "语音对话：当前环境暂不支持麦克风听写";
}

function updateVoiceButtonHint() {
  if (!voiceModeBtn) return;
  const ready = speechRecognitionAvailable();
  voiceModeBtn.classList.toggle("is-ready", ready);
  voiceModeBtn.title = voiceListening ? "正在听你说话，点击停止" : voiceModeDescription();
  voiceModeBtn.setAttribute("aria-label", voiceModeBtn.title);
}

function setVoiceListening(active) {
  voiceListening = active;
  if (!voiceModeBtn) return;
  voiceModeBtn.classList.toggle("is-active", active);
  voiceModeBtn.setAttribute("aria-pressed", String(active));
  updateVoiceButtonHint();
}

function appendVoiceText(text) {
  const transcriptText = String(text || "").trim();
  if (!transcriptText) return;
  const current = promptInput.value;
  const spacer = current && !/\s$/.test(current) ? " " : "";
  promptInput.value = `${current}${spacer}${transcriptText}`;
  promptInput.dispatchEvent(new Event("input", { bubbles: true }));
  promptInput.focus();
}

function speakVoiceReply(text) {
  const reply = String(text || "").replace(/\s+/g, " ").trim();
  if (!reply || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(reply.slice(0, 900));
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

async function submitPromptText(prompt, options = {}) {
  const text = String(prompt || "").trim();
  if (!text) return;
  if (await executeSlashCommand(text)) {
    promptInput.value = "";
    closeSlashCommandMenu();
    return;
  }
  if (createTemporaryTaskFromPrompt(text, options.source)) {
    promptInput.value = "";
    closeSlashCommandMenu();
    return;
  }
  if (tryCreateScheduleFromPrompt(text)) {
    promptInput.value = "";
    return;
  }
  await startRun(text, options.source === "voice" ? { voiceInput: true } : {});
}

async function handleVoiceTranscript(text) {
  const transcriptText = String(text || "").trim();
  if (!transcriptText) return;
  appendVoiceText(transcriptText);
  if (runController) {
    addMessage("system", "语音对话", "已识别语音，但上一条请求还在运行。文字已先放入输入框，稍后可以发送。");
    return;
  }
  addMessage("system", "语音对话", `已识别：${transcriptText}\n正在发送给 Claude Code。`);
  await submitPromptText(transcriptText, { source: "voice" });
}

function stopVoiceMode() {
  if (voiceRecognition && voiceListening) {
    voiceRecognition.stop();
  }
  setVoiceListening(false);
}

async function toggleVoiceMode() {
  if (voiceListening) {
    stopVoiceMode();
    return;
  }
  await loadVoiceCapabilities();
  const SpeechRecognition = getSpeechRecognitionConstructor();
  if (!SpeechRecognition) {
    const nativeText = latestVoiceCapability?.providerVoice?.available
      ? "检测到当前模型可能支持原生语音接口，后续可通过 /api/voice-capabilities 接入。"
      : "当前主模型没有检测到明确的原生语音接口。";
    addMessage("system", "语音对话", `当前运行环境暂不支持本地麦克风听写。${nativeText}`);
    return;
  }
  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "zh-CN";
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = false;
  voiceRecognition.maxAlternatives = 1;
  voiceRecognition.onstart = () => {
    setVoiceListening(true);
    addMessage("system", "语音对话", "正在听你说话。识别完成后会自动发送给 Claude Code，权限沿用当前模式。");
  };
  voiceRecognition.onresult = (event) => {
    const result = event.results?.[0]?.[0]?.transcript || "";
    handleVoiceTranscript(result).catch((error) => {
      addMessage("error", "语音对话", error.message || "语音发送失败。");
    });
  };
  voiceRecognition.onerror = (event) => {
    const reason = event.error === "not-allowed"
      ? "浏览器没有麦克风权限，请允许麦克风后再试。"
      : "语音识别暂时不可用，可以先用键盘输入；后续模型原生语音接口会从能力探测入口接入。";
    addMessage("error", "语音对话", reason);
  };
  voiceRecognition.onend = () => setVoiceListening(false);
  try {
    voiceRecognition.start();
  } catch (error) {
    setVoiceListening(false);
    addMessage("error", "语音对话", error.message || "语音对话启动失败。");
  }
}

function openPermissionMenu() {
  permissionMenu.hidden = false;
  permissionMenuButton.setAttribute("aria-expanded", "true");
}

function closePermissionMenu() {
  permissionMenu.hidden = true;
  permissionMenuButton.setAttribute("aria-expanded", "false");
}

function togglePermissionMenu() {
  if (permissionMenu.hidden) openPermissionMenu();
  else closePermissionMenu();
}

function openComposerPermissionMenu() {
  composerPermissionMenu.hidden = false;
  composerPermissionButton.setAttribute("aria-expanded", "true");
}

function closeComposerPermissionMenu() {
  composerPermissionMenu.hidden = true;
  composerPermissionButton.setAttribute("aria-expanded", "false");
}

function toggleComposerPermissionMenu() {
  if (composerPermissionMenu.hidden) openComposerPermissionMenu();
  else closeComposerPermissionMenu();
}

function applyRightPanelState() {
  const collapsed = window.localStorage.getItem(rightPanelCollapsedKey) === "true";
  document.body.classList.toggle("right-panel-collapsed", collapsed);
  rightPanelToggleBtn.classList.toggle("is-active", collapsed);
  rightPanelToggleBtn.title = collapsed ? "显示右侧设置" : "隐藏右侧设置";
  rightPanelToggleBtn.setAttribute("aria-label", rightPanelToggleBtn.title);
}

function toggleRightPanel() {
  const collapsed = !document.body.classList.contains("right-panel-collapsed");
  window.localStorage.setItem(rightPanelCollapsedKey, String(collapsed));
  applyRightPanelState();
}

function setRunSection(section = "install") {
  if (!runPanel) return;
  const active = section || "install";
  runPanel.dataset.activeRunSection = active;
  runTabButtons.forEach((button) => {
    const selected = button.dataset.runTab === active;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
}

function setWorkspaceTab(tabName) {
  for (const button of workspaceTabButtons) {
    button.classList.toggle("is-active", button.dataset.workspaceTab === tabName);
  }
  for (const pane of workspacePanes) {
    pane.classList.toggle("is-active", pane.dataset.workspacePane === tabName);
  }
}

const colorThemeNames = {
  original: "原色",
  default: "Default",
  midnight: "Midnight",
  ember: "Ember",
  mono: "Mono",
  cyberpunk: "Cyberpunk",
  rose: "Rose",
};

const colorThemeHints = {
  original: "原色会保持当前控制台配色。",
  default: "Default 使用清爽蓝绿配色，适合日常工作。",
  midnight: "Midnight 使用沉稳深色，适合夜间工作。",
  ember: "Ember 使用暖橙暗红，适合高能任务。",
  mono: "Mono 使用灰白黑中性色，适合长时间阅读。",
  cyberpunk: "Cyberpunk 使用青紫霓虹，适合科技感界面。",
  rose: "Rose 使用柔粉玫瑰色，适合轻柔视觉。",
};

const colorThemeBaseMode = {
  default: "light",
  mono: "light",
  rose: "light",
  midnight: "dark",
  ember: "dark",
  cyberpunk: "dark",
};

function normalizeColorTheme(value) {
  return Object.prototype.hasOwnProperty.call(colorThemeNames, value) ? value : "original";
}

function applyColorTheme() {
  const nextTheme = normalizeColorTheme(window.localStorage.getItem(colorThemeStorageKey) || "original");
  document.documentElement.dataset.colorTheme = nextTheme;
  for (const button of themePresetButtons) {
    const selected = button.dataset.colorTheme === nextTheme;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  if (themePresetHint) {
    themePresetHint.textContent = colorThemeHints[nextTheme] || colorThemeHints.original;
  }
}

function setColorTheme(theme) {
  const nextTheme = normalizeColorTheme(theme);
  const baseMode = colorThemeBaseMode[nextTheme];
  if (baseMode) {
    window.localStorage.setItem(themeStorageKey, baseMode);
    applyTheme();
  }
  window.localStorage.setItem(colorThemeStorageKey, nextTheme);
  applyColorTheme();
}

function applyTheme() {
  const theme = window.localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  themeToggleLabel.textContent = theme === "dark" ? "白色" : "深色";
  themeToggleBtn.title = theme === "dark" ? "切换到白色" : "切换到深色";
  themeToggleBtn.setAttribute("aria-label", themeToggleBtn.title);
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  window.localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme();
  applyColorTheme();
}

function startNewConversation() {
  currentConversationId = null;
  activeAssistantMessage = null;
  promptInput.value = "";
  setRunState("idle", "准备就绪");
  setEmptyState();
  promptInput.focus();
}

function submitPromptFromButton() {
  promptForm.requestSubmit();
}

function scheduleNextDefaultTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  scheduleAt.value = localDate.toISOString().slice(0, 16);
}

function saveAutomation(event) {
  event.preventDefault();
  const prompt = automationPrompt.value.trim();
  if (!prompt) {
    automationPrompt.focus();
    return;
  }

  automations.unshift({
    id: makeId(),
    name: automationName.value.trim() || "自动化",
    prompt,
    createdAt: new Date().toISOString(),
  });
  saveStoredList(automationsStorageKey, automations);
  automationForm.reset();
  renderAutomations();
}

function saveSchedule(event) {
  event.preventDefault();
  const prompt = schedulePrompt.value.trim();
  const runAt = scheduleAt.value;
  if (!prompt) {
    schedulePrompt.focus();
    return;
  }
  if (!runAt) {
    scheduleAt.focus();
    return;
  }

  schedules.unshift({
    id: makeId(),
    name: scheduleName.value.trim() || "定时任务",
    prompt,
    runAt,
    repeatRule: "不重复",
    enabled: scheduleEnabled.checked,
    completedAt: "",
    createdAt: new Date().toISOString(),
    projectPath: projectSelect.value,
    permissionMode: activeMode,
    risk: "执行前遵循权限模式和安全确认策略",
  });
  saveStoredList(schedulesStorageKey, schedules);
  scheduleForm.reset();
  scheduleEnabled.checked = true;
  scheduleNextDefaultTime();
  renderSchedules();
}

function formatCountdown(targetDate) {
  const delta = new Date(targetDate).getTime() - Date.now();
  if (!Number.isFinite(delta)) return "时间无效";
  if (delta <= 0) return "即将执行";
  const totalMinutes = Math.ceil(delta / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days} 天 ${hours} 小时后`;
  if (hours) return `${hours} 小时 ${minutes} 分钟后`;
  return `${minutes} 分钟后`;
}

function extractTemporaryTaskPrompt(text) {
  let content = String(text || "")
    .replace(/临时任务|临时|定时器|计时器|定时|提醒|早上|上午|中午|下午|晚上|今天|明天/g, " ")
    .replace(/\d{1,2}\s*[:：点.]\s*\d{0,2}\s*分?/g, " ")
    .replace(/到点|到时候|的时候|帮我|请你|请|执行|启动|开始|一下/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return content || "请执行我口述的临时任务。";
}

function renderTemporaryTask() {
  if (!temporaryTaskBar) return;
  if (!temporaryTask || temporaryTask.completedAt || temporaryTask.cancelledAt) {
    temporaryTaskBar.hidden = true;
    return;
  }
  temporaryTaskBar.hidden = false;
  temporaryTaskTitle.textContent = temporaryTask.name || "口述临时任务";
  temporaryTaskMeta.textContent = `${formatSchedule(temporaryTask.runAt)} · ${formatCountdown(temporaryTask.runAt)}`;
}

function cancelTemporaryTask() {
  if (!temporaryTask) return;
  const name = temporaryTask.name || "临时任务";
  saveTemporaryTask(null);
  addMessage("system", "临时任务", `已取消：${name}`);
}

function createTemporaryTaskFromPrompt(text, source = "text") {
  const prompt = String(text || "").trim();
  const wantsTemporaryTask = /临时任务|临时|计时器|定时器|口述任务/.test(prompt);
  if (!wantsTemporaryTask) return false;
  const runDate = nextDateForRequest(prompt);
  if (!runDate) {
    addMessage("error", "临时任务", "没有识别到执行时间。可以这样说：临时任务，早上 7 点 15 分，帮我检查项目状态。");
    return true;
  }
  const taskPrompt = extractTemporaryTaskPrompt(prompt);
  const details = [
    "检测到你想创建临时任务：",
    "",
    `执行时间：${runDate.toLocaleString("zh-CN")}`,
    `执行内容：${taskPrompt}`,
    `来源：${source === "voice" ? "语音口述" : "文本输入"}`,
    "",
    "临时任务会显示在输入框上方，到点后自动发送给 Claude Code。",
    "是否保存？",
  ].join("\n");
  if (!window.confirm(details)) {
    addMessage("system", "临时任务", "已取消创建临时任务。");
    return true;
  }
  saveTemporaryTask({
    id: makeId(),
    name: taskPrompt.slice(0, 22) || "口述临时任务",
    prompt: taskPrompt,
    runAt: runDate.toISOString(),
    source,
    createdAt: new Date().toISOString(),
    projectPath: projectSelect.value,
    permissionMode: activeMode,
  });
  addMessage("system", "临时任务", `已保存：${taskPrompt}，执行时间 ${formatSchedule(runDate.toISOString())}。`);
  return true;
}

function parseClock(text) {
  const match = text.match(/(\d{1,2})\s*[:：点.]\s*(\d{0,2})/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === "" ? 0 : Number(match[2]);
  if (/下午|晚上/.test(text) && hour < 12) hour += 12;
  if (/凌晨|早上|上午/.test(text) && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function nextDateForRequest(text) {
  const clock = parseClock(text);
  if (!clock) return null;
  const date = new Date();
  date.setSeconds(0, 0);

  if (/明天/.test(text)) {
    date.setDate(date.getDate() + 1);
  } else if (/每周[一二三四五六日天]/.test(text)) {
    const weekdayMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    const weekday = weekdayMap[text.match(/每周([一二三四五六日天])/)?.[1]];
    const delta = (weekday - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + delta);
  }

  date.setHours(clock.hour, clock.minute, 0, 0);
  if (!/明天|每周/.test(text) && date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function repeatRuleForRequest(text) {
  if (/每天|每日/.test(text)) return "每天";
  const weekly = text.match(/每周([一二三四五六日天])/);
  if (weekly) return `每周${weekly[1]}`;
  return "不重复";
}

function parseConversationAction(text) {
  if (/删除/.test(text)) return "delete";
  if (/归档/.test(text)) return "archive";
  if (/置顶/.test(text)) return "pin";
  if (/重命名/.test(text)) return "rename";
  return "";
}

function tryCreateScheduleFromPrompt(text) {
  const prompt = text.trim();
  const runDate = nextDateForRequest(prompt);
  const looksLikeSchedule = /定时|提醒|明天|今天|每天|每日|每周|\d{1,2}\s*[:：点.]\s*\d{0,2}/.test(prompt);
  if (!looksLikeSchedule || !runDate) return false;

  const action = parseConversationAction(prompt);
  const repeatRule = repeatRuleForRequest(prompt);
  const risk = action
    ? dangerousConversationActions.has(action)
      ? "高风险：删除类对话操作执行前会再次确认"
      : "低风险：仅修改本地会话状态"
    : "执行前遵循权限模式；删除、覆盖、安装依赖、联网推送、发送敏感数据前必须二次确认";
  const activeConversation = currentConversationId ? getConversation(currentConversationId) : conversations[0];

  const details = [
    "检测到你想创建定时任务，请确认：",
    "",
    `任务名称：${action ? conversationActionLabels[action] : "Claude Code 定时执行"}`,
    `执行时间：${runDate.toLocaleString("zh-CN")}`,
    `重复规则：${repeatRule}`,
    `执行内容：${prompt}`,
    `项目路径：${projectSelect.value || "未选择"}`,
    `权限模式：${modeNotes[activeMode]?.title || "默认"}`,
    `风险提示：${risk}`,
    "",
    "确认后才会保存任务。",
  ].join("\n");

  const confirmed = window.confirm(details);
  if (!confirmed) {
    addMessage("system", "定时任务", "已取消创建定时任务。");
    return true;
  }

  const task =
    action && activeConversation
      ? createConversationTask(action, activeConversation.id, runDate.toISOString(), `${conversationActionLabels[action]}：${activeConversation.title}`)
      : {
          id: makeId(),
          name: prompt.slice(0, 28) || "定时任务",
          prompt,
          runAt: runDate.toISOString(),
          repeatRule,
          enabled: true,
          completedAt: "",
          createdAt: new Date().toISOString(),
          projectPath: projectSelect.value,
          permissionMode: activeMode,
          risk,
        };

  if (!task) {
    addMessage("error", "定时任务", "没有可操作的当前对话，无法创建对话操作任务。");
    return true;
  }

  schedules.unshift(task);
  saveStoredList(schedulesStorageKey, schedules);
  renderSchedules();
  setWorkspaceTab("schedule");
  addMessage("system", "定时任务", `已保存：${task.name}，执行时间 ${formatSchedule(task.runAt)}。`);
  return true;
}

function nextRepeatTime(schedule) {
  if (schedule.repeatRule === "每天") {
    const next = new Date(schedule.runAt);
    next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  const weekly = String(schedule.repeatRule || "").match(/^每周/);
  if (weekly) {
    const next = new Date(schedule.runAt);
    next.setDate(next.getDate() + 7);
    return next.toISOString();
  }
  return "";
}

function completeSchedule(schedule, result) {
  const nextRunAt = nextRepeatTime(schedule);
  schedules = schedules.map((item) =>
    item.id === schedule.id
      ? {
          ...item,
          runAt: nextRunAt || item.runAt,
          completedAt: nextRunAt ? "" : new Date().toISOString(),
          enabled: Boolean(nextRunAt),
          lastResult: result,
        }
      : item
  );
  saveStoredList(schedulesStorageKey, schedules);
  renderSchedules();
}

function executeConversationTask(schedule) {
  const conversation = getConversation(schedule.conversationId);
  if (!conversation) {
    completeSchedule(schedule, "对话不存在");
    addMessage("error", "定时任务失败", "目标对话不存在，已停止该任务。");
    return;
  }

  if (dangerousConversationActions.has(schedule.action)) {
    const confirmed = window.confirm(`定时任务正在尝试${conversationActionLabels[schedule.action]}「${conversation.title}」。确认执行吗？`);
    if (!confirmed) {
      completeSchedule(schedule, "用户取消高风险操作");
      addMessage("system", "定时任务", "已取消本次高风险对话操作。");
      return;
    }
  }

  if (schedule.action === "pin") conversation.pinned = true;
  if (schedule.action === "archive") conversation.archived = true;
  if (schedule.action === "rename") {
    conversation.title = `${conversation.title}（定时重命名）`.slice(0, 80);
  }
  if (schedule.action === "delete") {
    conversations = conversations.filter((item) => item.id !== conversation.id);
    if (currentConversationId === conversation.id) currentConversationId = null;
  }

  saveConversations();
  renderConversations();
  completeSchedule(schedule, "执行完成");
  addMessage("system", "定时任务", `已执行：${schedule.name}`);
}

function runScheduleNow(schedule) {
  if (schedule.type === "conversation-action") {
    executeConversationTask(schedule);
    return;
  }
  startRun(schedule.prompt, { permissionProfile: schedule.permissionMode || activeMode });
}

function checkSchedules() {
  checkTemporaryTask();
  if (runController) return;
  const now = Date.now();
  const due = schedules.find((schedule) => {
    if (!schedule.enabled || schedule.completedAt) return false;
    const runAt = new Date(schedule.runAt).getTime();
    return Number.isFinite(runAt) && runAt <= now;
  });
  if (!due) return;

  if (due.type === "conversation-action") {
    executeConversationTask(due);
    return;
  }

  completeSchedule(due, "已触发执行");
  startRun(due.prompt, { permissionProfile: due.permissionMode || activeMode });
}

function checkTemporaryTask() {
  renderTemporaryTask();
  if (!temporaryTask || temporaryTask.completedAt || temporaryTask.cancelledAt) return;
  if (runController) return;
  const runAt = new Date(temporaryTask.runAt).getTime();
  if (!Number.isFinite(runAt) || runAt > Date.now()) return;

  const due = temporaryTask;
  saveTemporaryTask({ ...due, completedAt: new Date().toISOString() });
  addMessage("system", "临时任务", `到点执行：${due.name || due.prompt}`);
  startRun(due.prompt, {
    permissionProfile: due.permissionMode || activeMode,
    toolProfile: modeNotes[due.permissionMode || activeMode]?.toolProfile || modeNotes.safe.toolProfile,
  });
}

async function readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const packets = buffer.split("\n\n");
    buffer = packets.pop() || "";
    for (const packet of packets) {
      handlePacket(packet);
    }
  }
}

function handlePacket(packet) {
  let event = "message";
  let data = "";
  for (const line of packet.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }

  let payload = {};
  try {
    payload = data ? JSON.parse(data) : {};
  } catch {
    payload = { text: data };
  }

  if (event === "text") {
    appendAssistantText(payload.text || "");
  } else if (event === "stderr") {
    const text = payload.text || "";
    if (!isRuntimeSummaryMessage("system", "运行信息", text)) {
      addMessage("system", "运行信息", text);
    }
  } else if (event === "error") {
    flushAssistantTextBuffer();
    setRunState("error", "运行异常");
    addMessage("error", "运行异常", payload.text || "执行失败");
    updateCurrentConversation({ status: "运行异常", result: payload.text || "执行失败" });
  } else if (event === "done") {
    flushAssistantTextBuffer();
    removeRuntimeSummaryMessages();
    const replyText = activeAssistantMessage?.body?.textContent || "";
    setRunState("done", "已完成");
    updateCurrentConversation({
      status: "已完成",
      result: replyText,
    });
    if (voiceReplyPending) {
      speakVoiceReply(replyText || "已完成。");
      voiceReplyPending = false;
    }
  }
}

function attachmentSummary() {
  if (!selectedAttachments.length) return "";
  const paths = selectedAttachments
    .map((item) => `- ${item.name}：${item.path || "上传路径缺失"}`)
    .join("\n");
  return [
    "",
    "",
    "[本次对话包含图片附件，已保存到本机路径：",
    paths,
    "请把这些路径作为本次对话的图片附件处理。若需要读取或查看图片，请遵循当前权限模式先说明操作。]",
  ].join("\n");
}

function clearAttachments() {
  for (const item of selectedAttachments) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
  selectedAttachments = [];
  imageUploadInput.value = "";
  renderAttachmentPreview();
}

function confirmHighRiskRun(config) {
  if (!config.highRisk) return true;
  const confirmed = window.confirm(
    [
      "你即将开启高权限模式。",
      "",
      "开启后，AI 可能会读取、修改、创建项目文件，并调用本地工具完成代码修改任务。",
      "请确认你已经备份项目，并且只在可信项目目录中使用。",
      "",
      "是否继续？",
    ].join("\n")
  );
  if (!confirmed) return false;
  const typed = window.prompt("请输入：我已理解风险");
  return typed === "我已理解风险";
}

async function startRun(prompt, overrides = {}) {
  if (!prompt || runController) return;
  if (!projectSelect.value) {
    addMessage("error", "请选择对话", "请先在左侧选择一个对话，或点击左上角 + 新建对话后再发送。");
    openProjectNameDialog();
    return;
  }

  const permissionConfig = modeNotes[overrides.permissionProfile || activeMode] || modeNotes.safe;
  if (permissionConfig.highRisk && highRiskToolsLocked) {
    addMessage("error", "权限已锁定", "高权限工具当前未启用，无法执行授权修改或专家命令模式。");
    return;
  }
  const riskAccepted = Boolean(overrides.riskAccepted) || confirmHighRiskRun(permissionConfig);
  if (permissionConfig.highRisk && !riskAccepted) {
    addMessage("system", "已取消", "未完成风险确认，本次高权限请求已取消。");
    return;
  }

  activeAssistantMessage = null;
  assistantTextBuffer = "";
  if (assistantTextFlushTimer) {
    clearTimeout(assistantTextFlushTimer);
    assistantTextFlushTimer = null;
  }
  const finalPrompt = `${prompt}${attachmentSummary()}`;
  inspectPromptForPetMood(prompt);
  createOrUpdateProjectConversation(finalPrompt, prompt);
  addMessage("user", "你", finalPrompt);
  if (selectedAttachments.length) {
    addMessage("system", "附件", "图片已上传到本机，并已把本地路径随本次消息发送给 Claude Code。");
  }
  clearAttachments();
  promptInput.value = "";
  modelInput.value = modelInput.value.trim();
  window.localStorage.setItem(modelStorageKey, modelInput.value);

  runController = new AbortController();
  voiceReplyPending = Boolean(overrides.voiceInput);
  setRunning(true);
  setRunState("thinking", "正在思考");
  clearTimeout(petSlowTimer);
  petSlowTimer = setTimeout(() => {
    if (runController) {
      setClaudePetEmotion("performance", "响应有点慢，正在继续处理", "无奈", "这速度，连我壳都等热了。");
    }
  }, 45000);

  try {
    const requestedPermissionProfile = overrides.permissionProfile || activeMode;
    const browserModeRequested = requestedPermissionProfile === "browser" || requestedPermissionProfile === "takeover";
    const browserModeConfirmed =
      requestedPermissionProfile === "browser"
        ? browserModeAccepted
        : requestedPermissionProfile === "takeover"
          ? takeoverModeAccepted
          : false;
    const browserAccess =
      overrides.browserAccess ||
      (browserModeRequested && window.sessionStorage.getItem(browserAccessAlwaysKey) === "true"
        ? "always"
        : browserModeRequested && browserModeConfirmed
          ? "once"
        : "none");
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: finalPrompt,
        cwd: projectSelect.value,
        model: modelInput.value,
        mode: overrides.mode || permissionConfig.cliMode,
        permissionProfile: overrides.permissionProfile || activeMode,
        toolProfile: overrides.toolProfile || permissionConfig.toolProfile,
        browserAccess,
        riskAccepted,
        continueSession: continueToggle.checked,
        ...overrides,
      }),
      signal: runController.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "请求失败" }));
      const body = formatErrorHelp({ code: error.code || String(response.status), message: error.error || error.message, suggestion: error.suggestion }, response.status);
      setRunState("error", "运行异常");
      addMessage("error", "运行异常", body);
      updateCurrentConversation({ status: "运行异常", result: body });
      return;
    }

    await readSse(response);
  } catch (error) {
    if (error.name !== "AbortError") {
      setRunState("error", "连接中断");
      addMessage("error", "连接中断", error.message);
      updateCurrentConversation({ status: "连接中断", result: error.message });
    } else {
      setRunState("stopped", "已停止");
      addMessage("system", "已停止", "请求已取消。");
      updateCurrentConversation({ status: "已停止" });
    }
  } finally {
    flushAssistantTextBuffer();
    if (runController && voiceReplyPending && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    voiceReplyPending = false;
    clearTimeout(petSlowTimer);
    petSlowTimer = null;
    runController = null;
    activeAssistantMessage = null;
    setRunning(false);
    promptInput.focus();
  }
}

function typedToolAuthorizationChoice(prompt) {
  if (!pendingToolAuthorization) return "";
  const text = String(prompt || "").trim().toLowerCase();
  if (/^(是|允许|同意|确认|可以|yes|y|allow|approve)$/.test(text)) return "once";
  if (/^(始终允许|一直允许|总是允许|以后都允许|always|always allow)$/.test(text)) return "always";
  if (/^(否|不|拒绝|取消|no|n|deny|reject|cancel)$/.test(text)) return "deny";
  return "";
}

async function runPrompt(event) {
  event.preventDefault();
  const prompt = promptInput.value.trim() || (selectedAttachments.length ? "请查看我上传的图片。" : "");
  if (!prompt) return;
  const authorizationChoice = typedToolAuthorizationChoice(prompt);
  if (authorizationChoice) {
    promptInput.value = "";
    closeSlashCommandMenu();
    await submitToolAuthorization(authorizationChoice);
    return;
  }
  if (await executeSlashCommand(prompt)) {
    promptInput.value = "";
    closeSlashCommandMenu();
    return;
  }
  if (createTemporaryTaskFromPrompt(prompt)) {
    promptInput.value = "";
    closeSlashCommandMenu();
    return;
  }
  if (tryCreateScheduleFromPrompt(prompt)) {
    promptInput.value = "";
    return;
  }
  await startRun(prompt);
}

function fillPrompt(text) {
  promptInput.value = text;
  closeSlashCommandMenu();
  promptInput.focus();
}

async function runQuickCommand(button) {
  const prompt = String(button?.dataset?.prompt || "").trim();
  if (!prompt) return;
  const label = button.querySelector("span")?.textContent?.trim() || "快捷指令";
  const permissionProfile = button.dataset.permissionProfile || "readOnly";
  const permissionConfig = modeNotes[permissionProfile] || modeNotes.readOnly;

  fillPrompt(prompt);
  if (runController) {
    addMessage("system", "快捷指令", `Claude Code 正在处理上一条任务，已把「${label}」放入输入框，稍后可以发送。`);
    return;
  }

  await startRun(prompt, {
    source: "quick-command",
    permissionProfile,
    mode: button.dataset.cliMode || permissionConfig.cliMode,
    toolProfile: button.dataset.toolProfile || permissionConfig.toolProfile,
  });
}

function openConversationSearch() {
  conversationSearchWrap.hidden = false;
  conversationSearchWrap.closest(".conversation-section")?.classList.add("is-searching");
  conversationSearchInput.focus();
}

function closeConversationSearch() {
  conversationSearchWrap.hidden = true;
  conversationSearchWrap.closest(".conversation-section")?.classList.remove("is-searching");
  conversationSearchInput.value = "";
  if (workspaceSearch) workspaceSearch.value = "";
  conversationSearchTerm = "";
  renderConversations();
}

function syncConversationSearch(value) {
  conversationSearchTerm = value;
  conversationSearchInput.value = value;
  if (workspaceSearch) workspaceSearch.value = value;
  renderConversations();
}

function renderAttachmentPreview() {
  attachmentPreview.innerHTML = "";
  attachmentPreview.hidden = selectedAttachments.length === 0;
  for (const attachment of selectedAttachments) {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    const image = document.createElement("img");
    image.src = attachment.previewUrl;
    image.alt = attachment.name;

    const text = document.createElement("span");
    text.textContent = attachment.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", "移除附件");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      selectedAttachments = selectedAttachments.filter((item) => item.id !== attachment.id);
      URL.revokeObjectURL(attachment.previewUrl);
      renderAttachmentPreview();
    });

    chip.append(image, text, remove);
    attachmentPreview.append(chip);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

async function uploadImageFile(file) {
  const dataUrl = await fileToDataUrl(file);
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      files: [
        {
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
        },
      ],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.files?.[0]) {
    throw new Error(result.error || "图片上传失败");
  }
  return result.files[0];
}

async function handleImageUpload() {
  const files = Array.from(imageUploadInput.files || []);
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      addMessage("error", "附件类型不支持", `${file.name} 不是图片文件，暂不支持上传。`);
      continue;
    }
    if (file.size > maxUploadBytes) {
      addMessage("error", "图片过大", `${file.name} 超过 8MB，请压缩后再上传。`);
      continue;
    }
    const previewUrl = URL.createObjectURL(file);
    try {
      const uploaded = await uploadImageFile(file);
      selectedAttachments.push({
        id: uploaded.id || makeId(),
        name: uploaded.name || file.name,
        size: uploaded.size || file.size,
        type: uploaded.mimeType || file.type,
        path: uploaded.path,
        previewUrl,
      });
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      addMessage("error", "图片上传失败", error.message || "图片上传失败");
    }
  }
  imageUploadInput.value = "";
  renderAttachmentPreview();
}

function requestScreenshot() {
  fetch("/api/screenshot", { cache: "no-store" }).catch(() => {});
  addMessage("system", "截图", "已触发截图快捷键；/api/screenshot 接口已预留，后续可扩展保存本地、复制截图或上传截图。");
}

async function copyCurrentConversation() {
  const conversation = currentConversationId ? getConversation(currentConversationId) : conversations[0];
  if (!conversation) return;
  const content = `# ${conversation.title}\n\n${conversation.prompt}\n\n${conversation.result || ""}`;
  try {
    await copyText(content);
    addMessage("system", "复制", "已复制当前对话内容。");
  } catch {
    addMessage("system", "复制", "当前浏览器不允许直接复制，复制接口已预留。");
  }
}

function selectTranscriptText() {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(transcript);
  selection.removeAllRanges();
  selection.addRange(range);
}

function appendAdvancedAccessCommand() {
  const button = document.createElement("button");
  button.className = "quick-command";
  button.type = "button";
  button.dataset.prompt =
    "管理员授权高级访问模式指令模板：仅当外部管理员开关 CLEAN_PANEL_ADMIN_ACCESS_ENABLED=1 且本会话明确显示已授权时，才允许访问项目文件、执行命令、运行测试和修改代码。不得内置或回显完整密钥；不得绕过系统/用户确认；删除、覆盖、批量写入、安装依赖、联网推送、发送敏感数据前必须二次确认；命令必须限定在已选项目目录内；执行前说明风险、允许列表/拒绝列表和回滚方案，并记录审计日志。";
  button.innerHTML = `${menuIcon("pin")}<span>高级访问模板</span>`;
  quickCommands.append(button);
}

projectSelect.addEventListener("change", updateCurrentProject);
projectAddTrigger.addEventListener("click", addProjectPath);
promptForm.addEventListener("submit", runPrompt);
modelChip.addEventListener("click", (event) => {
  event.stopPropagation();
  const willOpen = mainModelMenu.hidden;
  closeModelGuideMenus();
  setModelMenuOpen(mainModelMenu, modelChip, willOpen);
});
hostChip.addEventListener("click", (event) => {
  event.stopPropagation();
  const willOpen = branchModelMenu.hidden;
  closeModelGuideMenus();
  setModelMenuOpen(branchModelMenu, hostChip, willOpen);
});
useMainModelBtn.addEventListener("click", () => setActiveModel(currentMainModel || modelInput.value));
modelInput.addEventListener("input", () => {
  updateModelSwitchLabels();
  renderBranchModelOptions();
});
refreshBtn.addEventListener("click", () => loadStatus().catch((error) => addMessage("error", "错误", error.message)));
themeToggleBtn.addEventListener("click", toggleTheme);
themePresetButtons.forEach((button) => {
  button.addEventListener("click", () => setColorTheme(button.dataset.colorTheme));
});
selfTestBtn.addEventListener("click", () => {
  startRun("自测：不要读取文件，不要调用工具，只回复三行：PANEL_OK。2. Yes。3. No。不要额外解释。", {
    toolProfile: "none",
    permissionProfile: "safe",
    continueSession: false,
    mode: "plan",
  });
});
stopBtn.addEventListener("click", () => {
  if (runController) runController.abort();
});
newConversationBtn.addEventListener("click", openProjectNameDialog);
launchBtn.addEventListener("click", submitPromptFromButton);
versionUpdateBtn.addEventListener("click", () => {
  addMessage("system", "版本更新", "版本更新只能由外部管理员指令触发，客户端按钮仅展示状态。");
});
if (workspaceSearch) {
  workspaceSearch.addEventListener("input", () => syncConversationSearch(workspaceSearch.value));
}
conversationSearchInput.addEventListener("input", () => syncConversationSearch(conversationSearchInput.value));
conversationSearchToggleBtn.addEventListener("click", () => {
  if (conversationSearchWrap.hidden) openConversationSearch();
  else closeConversationSearch();
});
automationForm.addEventListener("submit", saveAutomation);
scheduleForm.addEventListener("submit", saveSchedule);
rightPanelToggleBtn.addEventListener("click", toggleRightPanel);
runTabButtons.forEach((button) => {
  button.addEventListener("click", () => setRunSection(button.dataset.runTab || "install"));
});
permissionMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePermissionMenu();
});
composerPermissionButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleComposerPermissionMenu();
});
relayToggle.addEventListener("click", () => {
  relayForm.hidden = !relayForm.hidden;
  relayToggle.textContent = relayForm.hidden ? "配置中转站" : "收起配置";
});
relayForm.addEventListener("submit", saveRelayConfig);
relayTestBtn.addEventListener("click", () => testRelayConnection(relayPayloadFromForm(), relayTestResult, relayTestBtn));
diagnosticsBtn.addEventListener("click", generateDiagnostics);
diagnosticsCopyBtn.addEventListener("click", copyDiagnosticsReport);
diagnosticsDownloadBtn.addEventListener("click", downloadDiagnosticsReport);
usageGuideBtn.addEventListener("click", () => openHelpDialog("使用说明", usageGuideSections));
faqBtn.addEventListener("click", () => openHelpDialog("FAQ 常见问题", faqSections));
permissionHelpBtn.addEventListener("click", () => openHelpDialog("权限模式说明", permissionGuideSections));
helpDialogClose.addEventListener("click", closeHelpDialog);
helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) closeHelpDialog();
});
setupTestBtn.addEventListener("click", () => testRelayConnection(setupPayloadFromForm(), setupTestResult, setupTestBtn));
setupSaveBtn.addEventListener("click", saveSetupWizard);
setupOpenBtn?.addEventListener("click", openSetupWizard);
setupSkipBtn.addEventListener("click", () => {
  window.sessionStorage.setItem(setupDismissedKey, "1");
  hideSetupWizard();
});
projectNameCreateBtn.addEventListener("click", createManagedProjectFromDialog);
projectNameCancelBtn.addEventListener("click", closeProjectNameDialog);
projectNameDialog.addEventListener("click", (event) => {
  if (event.target === projectNameDialog) closeProjectNameDialog();
});
projectNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createManagedProjectFromDialog();
  if (event.key === "Escape") closeProjectNameDialog();
});
accountMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAccountMenu();
});
accountMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-account-action]");
  if (!button) return;
  event.stopPropagation();
  handleAccountAction(button.dataset.accountAction);
});
accountInfoDialogClose?.addEventListener("click", closeAccountInfoDialog);
accountInfoDialog?.addEventListener("click", (event) => {
  if (event.target === accountInfoDialog) closeAccountInfoDialog();
});
accountSaveNameBtn.addEventListener("click", saveAccountName);
accountChangePasswordBtn.addEventListener("click", (event) => {
  event.stopImmediatePropagation();
  openPasswordDialog();
}, true);
accountChangePasswordBtn.addEventListener("click", () => {
  addMessage("system", "修改密码", "修改密码接口已预留。为安全起见，前端不会保存真实密码。");
});
claudePetStartBtn?.addEventListener("click", togglePetSync);
topbarPet?.addEventListener("click", () => {
  topbarPet.hidden = true;
});
claudePet?.querySelector(".claude-pet-stage")?.addEventListener("click", () => {
  if (!petSyncEnabled) {
    togglePetSync();
  } else {
    previewNextClaudePetVideo();
  }
});
sidebarPetDock?.addEventListener("click", () => {
  if (!petSyncEnabled) {
    togglePetSync();
  } else {
    previewNextClaudePetVideo();
  }
});
showArchivedToggle.addEventListener("change", renderConversations);
quickCommands.addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  runQuickCommand(button).catch((error) => {
    addMessage("error", "快捷指令", error.message || "快捷指令发送失败");
  });
});
pluginPromptBtn.addEventListener("click", () => {
  const plugin = pluginInput.value.trim() || "插件名";
  setMode("expert");
  fillPrompt(`请安装 Claude Code 插件：${plugin}。先说明将执行的命令和风险，等待我确认后再安装。`);
});
skillPromptBtn.addEventListener("click", () => {
  const skill = skillInput.value.trim() || "skill 名称或仓库地址";
  setMode("expert");
  fillPrompt(`请安装 Claude Code skill：${skill}。先说明来源、安装位置和风险，等待我确认后再安装。`);
});
installedExtensionsBtn?.addEventListener("click", openInstalledExtensionsView);
extensionsPageCloseBtn?.addEventListener("click", closeInstalledExtensionsPage);
quickAttachBtn.addEventListener("click", () => {
  const confirmed = window.confirm(
    "图片将仅保存在本机配置目录，用于当前会话分析，不会自动上传到外部服务器。是否继续选择图片？"
  );
  if (confirmed) imageUploadInput.click();
});
voiceModeBtn?.addEventListener("click", toggleVoiceMode);
temporaryTaskCancelBtn?.addEventListener("click", cancelTemporaryTask);
imageUploadInput.addEventListener("change", handleImageUpload);

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
    closePermissionMenu();
    closeComposerPermissionMenu();
  });
}

for (const button of composerModeButtons) {
  button.addEventListener("click", () => {
    setMode(button.dataset.composerMode);
    closePermissionMenu();
    closeComposerPermissionMenu();
  });
}

for (const button of workspaceTabButtons) {
  button.addEventListener("click", () => {
    const isActiveProject = button.dataset.workspaceTab === "project" && button.classList.contains("is-active");
    if (isActiveProject) {
      addProjectPath();
      return;
    }
    setWorkspaceTab(button.dataset.workspaceTab);
  });
}

promptInput.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  const slashOpen = slashCommandMenu && !slashCommandMenu.hidden;
  if (slashOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    const matches = matchingSlashCommands();
    if (!matches.length) return;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    slashCommandIndex = (slashCommandIndex + delta + matches.length) % matches.length;
    renderSlashCommandMenu();
    return;
  }
  if (slashOpen && event.key === "Enter") {
    event.preventDefault();
    const matches = matchingSlashCommands();
    if (matches[slashCommandIndex]) selectSlashCommand(matches[slashCommandIndex]);
    return;
  }
  if (slashOpen && event.key === "Escape") {
    event.preventDefault();
    closeSlashCommandMenu();
    return;
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    promptForm.requestSubmit();
  }
});

promptInput.addEventListener("input", () => {
  inspectDraftForPetMood();
  slashCommandIndex = 0;
  renderSlashCommandMenu();
});

transcript.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tool-auth]");
  if (!button) return;
  event.preventDefault();
  submitToolAuthorization(button.dataset.toolAuth);
});

promptInput.addEventListener("focus", renderSlashCommandMenu);

document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;

  if (event.key === "Escape") {
    openConversationMenuId = null;
    closeSlashCommandMenu();
    closeModelGuideMenus();
    closePermissionMenu();
    closeComposerPermissionMenu();
    closeAccountMenu();
    closeAccountInfoDialog();
    closeHelpDialog();
    if (voiceListening) stopVoiceMode();
    if (!conversationSearchWrap.hidden) closeConversationSearch();
    renderConversations();
    return;
  }

  if (!modifier) return;

  const key = event.key.toLowerCase();
  if (key === "k") {
    event.preventDefault();
    promptInput.focus();
    return;
  }

  if (key === "l") {
    event.preventDefault();
    openConversationSearch();
    return;
  }

  if (key === "enter") {
    event.preventDefault();
    promptForm.requestSubmit();
    return;
  }

  if (key === "a" && event.shiftKey) {
    event.preventDefault();
    selectTranscriptText();
    return;
  }

  if (key === "a") {
    if (document.activeElement === promptInput) return;
    event.preventDefault();
    promptInput.focus();
    promptInput.select();
    return;
  }

  if (key === "s" && event.shiftKey) {
    event.preventDefault();
    requestScreenshot();
    return;
  }

  if (key === "c") {
    const selection = String(window.getSelection?.() || "");
    if (selection) return;
    event.preventDefault();
    copyCurrentConversation();
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".conversation-menu") && !event.target.closest(".conversation-more-button")) {
    if (openConversationMenuId) {
      openConversationMenuId = null;
      renderConversations();
    }
  }

  if (!event.target.closest(".permission-dropdown")) {
    closePermissionMenu();
  }

  if (!event.target.closest(".composer-permission")) {
    closeComposerPermissionMenu();
  }

  if (!event.target.closest(".model-switcher")) {
    closeModelGuideMenus();
  }

  if (!event.target.closest(".account-dock")) {
    closeAccountMenu();
  }

  if (!event.target.closest(".composer-input-wrap")) {
    closeSlashCommandMenu();
  }
});

hideIntroOverlay();
setEmptyState();
setRunState("idle", "准备就绪");
applyTheme();
applyColorTheme();
syncSuperclawConsoleLinks();
setMode(activeMode);
setWorkspaceTab("project");
setRunSection("install");
applyRightPanelState();
scheduleNextDefaultTime();
appendAdvancedAccessCommand();
renderConversations();
removeRuntimeSummaryMessages();
renderAutomations();
renderSchedules();
renderTemporaryTask();
renderConfigChecklist();
applyCompactRightPanelDefaults();
renderAccountMenu();
applyPetSyncUi();
loadFeishuTutorialStatus();
loadVoiceCapabilities().catch(() => updateVoiceButtonHint());
setInterval(checkSchedules, 30000);
setInterval(renderTemporaryTask, 30000);
setInterval(checkWorkRestReminder, 60000);
loadAnnouncement().catch(() => renderAnnouncement(""));
loadStatus().catch((error) => addMessage("error", "错误", error.message));
