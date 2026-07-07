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
const pluginInstallStatus = $("#pluginInstallStatus");
const skillInput = $("#skillInput");
const skillPromptBtn = $("#skillPromptBtn");
const installedExtensionsBtn = $("#installedExtensionsBtn");
const extensionsPage = $("#extensionsPage");
const extensionsPageCloseBtn = $("#extensionsPageCloseBtn");
const installedSkillsList = $("#installedSkillsList");
const installedPluginsList = $("#installedPluginsList");
const pagePluginInput = $("#pagePluginInput");
const pagePluginInstallBtn = $("#pagePluginInstallBtn");
const pagePluginInstallStatus = $("#pagePluginInstallStatus");
const skillInstallName = $("#skillInstallName");
const skillInstallContent = $("#skillInstallContent");
const skillInstallOverwrite = $("#skillInstallOverwrite");
const skillInstallTemplateBtn = $("#skillInstallTemplateBtn");
const skillInstallBtn = $("#skillInstallBtn");
const skillInstallStatus = $("#skillInstallStatus");
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
transcript?.classList.add("sc-chat-stage");
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
const rightPanelCloseBtn = $("#rightPanelCloseBtn");
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
const voiceModeBtn = $("#voiceModeBtn");
const attachmentPreview = $("#attachmentPreview");
const composerInputWrap = document.querySelector(".composer-input-wrap");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const composerModeButtons = Array.from(document.querySelectorAll("[data-composer-mode]"));
const workspaceTabButtons = Array.from(document.querySelectorAll("[data-workspace-tab]"));
const workspacePanes = Array.from(document.querySelectorAll("[data-workspace-pane]"));
const runPanel = document.querySelector(".run-panel");
const runTabButtons = Array.from(document.querySelectorAll("[data-run-tab]"));

const cwdStorageKey = "cleanClaude.cwd.v2";
const modelStorageKey = "cleanClaude.model";
const conversationsStorageKey = "cleanClaude.conversations.v1";
const maxConversationMessages = 80;
const CLAUDE_RUN_TIMEOUT_MS = 120000;
const rightPanelCollapsedKey = "cleanClaude.rightPanelCollapsed.v2";
const themeStorageKey = "cleanClaude.theme.v1";
const colorThemeStorageKey = "cleanClaude.colorTheme.v1";
const automationsStorageKey = "cleanClaude.automations.v1";
const schedulesStorageKey = "cleanClaude.schedules.v1";
const temporaryTaskStorageKey = "cleanClaude.temporaryTask.v1";
const automaticScheduleExecutionEnabled = false;
const setupDismissedKey = "cleanClaude.setupDismissed.session";
const superclawBaseStorageKey = "cleanClaude.superclawBase.v1";
const fallbackSuperclawBase = "http://127.0.0.1:1420";
let consoleSwitchProgressFrame = null;
let consoleSwitchProgressTimer = null;
let nativeClaudeRunning = false;
const accountNameStorageKey = "cleanClaude.accountName.v1";
const petSyncStorageKey = "cleanClaude.petSyncEnabled.v1";
const petWorkStartedStorageKey = "cleanClaude.petWorkStartedAt.v1";
const petLastRestStorageKey = "cleanClaude.petLastRestAt.v1";
const browserAccessAlwaysKey = "cleanClaude.browserAccessAlways.session";
const petRestIntervalMs = 45 * 60 * 1000;
const announcementVisibleMs = 60 * 1000;
const fallbackAnnouncementText =
  "遥遥领先科技有限公司郑重承诺，平台用户不断增多，欢迎大家集思广益。现已公开 TOKEN 定价，当前所有 TOKEN 均有专属折扣，欢迎大家使用！";
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
  if (normalizedRoute === "/h/claude-code" || normalizedRoute.startsWith("/h/claude-code")) {
    return {
      name: "Claude Code",
      kicker: "Claude 到原生面板",
      title: "正在进入 Claude Code 原生面板",
      subtitle: "启动并切换到 Claude Code 本地控制台",
    };
  }
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

function isOpenClawSuperclawRoute(route) {
  const normalizedRoute = String(route || "").startsWith("/") ? String(route || "") : `/${route || ""}`;
  return normalizedRoute === "/dashboard"
    || normalizedRoute.startsWith("/dashboard")
    || normalizedRoute === "/chat"
    || normalizedRoute.startsWith("/chat");
}

async function ensureOpenClawGatewayBeforeConsoleSwitch(route) {
  if (!isOpenClawSuperclawRoute(route)) return { skipped: true };

  const base = resolveSuperclawBase();
  let startResult = null;
  try {
    startResult = await startOpenClawGatewayFromSuperclaw(base);
  } catch (error) {
    startResult = {
      ok: false,
      error: error?.name === "AbortError" ? "timeout" : (error?.message || String(error)),
    };
  }

  const readyResult = await waitForOpenClawGatewayReadyFromSuperclaw(base, {
    timeoutMs: 30000,
    intervalMs: 600,
  });
  if (readyResult.ok) {
    return {
      ok: true,
      start: startResult,
      ready: readyResult,
    };
  }
  return {
    ok: false,
    start: startResult,
    ready: readyResult,
    error: readyResult.error || startResult?.error || "openclaw_not_ready",
  };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await resp.json();
    } catch {}
    return { ok: resp.ok, status: resp.status, data };
  } finally {
    window.clearTimeout(timer);
  }
}

async function startOpenClawGatewayFromSuperclaw(base) {
  const resp = await fetchJsonWithTimeout(`${base}/__api/dev/agents/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "openclaw" }),
  }, 15000);
  return {
    ok: resp.ok && resp.data?.ok !== false,
    status: resp.status,
    data: resp.data,
  };
}

function isOpenClawGatewayReadyStatus(data) {
  if (!data || typeof data !== "object") return false;
  return data.ready === true ||
    data.connected === true ||
    data.verified === true ||
    String(data.status || "").toLowerCase() === "ready" ||
    data.health?.ready === true ||
    String(data.health?.status || "").toLowerCase() === "live";
}

async function probeOpenClawGatewayReady(base) {
  try {
    const status = await fetchJsonWithTimeout(`${base}/__api/dev/agents/status?agent=openclaw`, {}, 2500);
    if (status.ok && isOpenClawGatewayReadyStatus(status.data)) {
      return { ok: true, source: "dev-status", data: status.data };
    }
  } catch (error) {
    // Health below is a fallback; ignore transient status failures.
  }
  try {
    const health = await fetchJsonWithTimeout("http://127.0.0.1:18789/health", {}, 2500);
    if (health.ok && (health.data?.ready === true || String(health.data?.status || "").toLowerCase() === "live")) {
      return { ok: true, source: "health", data: health.data };
    }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
  return { ok: false, error: "openclaw_not_ready" };
}

function waitMs(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function waitForOpenClawGatewayReadyFromSuperclaw(base, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const intervalMs = Number(options.intervalMs || 600);
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await probeOpenClawGatewayReady(base);
    if (last.ok) return last;
    await waitMs(intervalMs);
  }
  return {
    ok: false,
    error: "OpenClaw is starting but did not become ready in time.",
    last,
  };
}

function setConsoleSwitchError(overlay, message) {
  setConsoleSwitchProgress(overlay, 100);
  const meta = overlay?.querySelector(".console-switch-progress-meta");
  if (meta) meta.textContent = message;
  const title = overlay?.querySelector(".console-switch-progress-title");
  if (title) title.textContent = "OpenClaw 暂未 ready";
}

function openClawConsoleSwitchErrorMessage(result) {
  if (result?.error === "timeout") return "OpenClaw 启动超时，请稍后重试。";
  if (result?.error) return `OpenClaw 正在启动但未 ready：${result.error}`;
  return "OpenClaw 正在启动但未 ready，请稍后重试。";
}

async function navigateAfterOpenClawReady(route, href, overlay) {
  const startResult = await ensureOpenClawGatewayBeforeConsoleSwitch(route);
  if (startResult?.ok === false) {
    console.warn("[claude-panel] OpenClaw pre-start before console switch failed:", startResult);
    setConsoleSwitchError(overlay, openClawConsoleSwitchErrorMessage(startResult));
    return false;
  }
  setConsoleSwitchProgress(overlay, 100);
  window.location.assign(href);
  return true;
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
  consoleSwitchProgressTimer = setTimeout(async () => {
    setConsoleSwitchProgress(overlay, 92);
    await navigateAfterOpenClawReady(route, href, overlay);
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
const maxUploadBytes = 25 * 1024 * 1024;
const attachmentAccept = "image/*,.txt,.md,.json,.csv,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp";
const attachmentExtensions = new Set(["txt", "md", "json", "csv", "pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg", "webp"]);

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

const LOCAL_FILE_DELETE_CONFIRM_TEXT = "确认删除本地文件";
const dangerousConversationActions = new Set(["delete-local-files"]);
const conversationActionLabels = {
  pin: "置顶聊天",
  archive: "归档",
  rename: "重命名",
  delete: "从列表移除",
  "delete-local-files": "删除本地文件",
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
let activeRunConversationId = null;
let conversations = loadConversations();
let conversationSearchTerm = "";
let openConversationMenuId = null;
let selectedAttachments = [];
let composerDragDepth = 0;
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
  if (!introOverlay || !introVideo) return Promise.resolve();
  let completed = false;
  let resolved = false;
  let resolveStarted = () => {};
  const started = new Promise((resolve) => {
    resolveStarted = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
  });
  const finish = () => {
    if (completed) return;
    completed = true;
    hideIntroOverlay();
    resolveStarted();
  };

  introSkipBtn?.addEventListener("click", finish);
  introVideo.addEventListener("ended", finish);
  introVideo.addEventListener("error", finish);
  const playIntro = async () => {
    if (completed) return;
    introOverlay.hidden = false;
    if (introStatus) introStatus.textContent = "开场动画播放中";
    resolveStarted();
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
  window.setTimeout(resolveStarted, 800);
  setTimeout(finish, 18000);
  return started;
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
  renderAnnouncement(data.text || fallbackAnnouncementText);
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

function shouldShowRawClaudeCodeToolCalls() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("debugToolCalls") === "1"
      || window.localStorage?.getItem("claude-panel-show-raw-tool-calls") === "true";
  } catch {
    return false;
  }
}

function formatClaudeCodeToolCallForZh(content) {
  const text = String(content || "");
  if (!text || shouldShowRawClaudeCodeToolCalls()) return text;

  const xmlToolNameMap = {
    Explore: "\u9879\u76ee\u63a2\u7d22",
    explore: "\u9879\u76ee\u63a2\u7d22",
    search_files: "\u641c\u7d22\u6587\u4ef6",
    read_file: "\u8bfb\u53d6\u6587\u4ef6",
    write_file: "\u5199\u5165\u6587\u4ef6",
    edit_file: "\u7f16\u8f91\u6587\u4ef6",
    run_command: "\u8fd0\u884c\u547d\u4ee4",
    list_files: "\u5217\u51fa\u6587\u4ef6",
    browser_snapshot: "\u83b7\u53d6\u9875\u9762\u5feb\u7167",
    browser_take_screenshot: "\u83b7\u53d6\u9875\u9762\u622a\u56fe",
    browser_tabs: "\u68c0\u67e5\u6d4f\u89c8\u5668\u6807\u7b7e\u9875",
    browser_console_messages: "\u68c0\u67e5\u63a7\u5236\u53f0\u6d88\u606f",
    browser_network_requests: "\u68c0\u67e5\u7f51\u7edc\u8bf7\u6c42",
  };

  const xmlParamLabelMap = {
    message: "\u4efb\u52a1",
    path: "\u8def\u5f84",
    pattern: "\u5339\u914d\u89c4\u5219",
    query: "\u67e5\u8be2",
    command: "\u547d\u4ee4",
    file: "\u6587\u4ef6",
    url: "\u94fe\u63a5",
  };

  const decodeToolText = (value) => String(value || "")
    .trim()
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");

  const formatXmlToolCall = (toolName, body) => {
    const displayName = xmlToolNameMap[toolName] || toolName || "\u5185\u90e8\u5de5\u5177";
    const lines = [`\u6b63\u5728\u6267\u884c\u5de5\u5177\uff1a${displayName}`];
    const paramRegex = /<parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;
    let match = paramRegex.exec(body || "");
    while (match) {
      const label = xmlParamLabelMap[match[1].trim()] || match[1].trim();
      const value = decodeToolText(match[2]);
      if (value) lines.push(`${label}\uff1a${value}`);
      match = paramRegex.exec(body || "");
    }
    return lines.join("\n");
  };

  const functionCallMatch = text.match(
    /<function-call>\s*<invoke\s+name=["']([^"']+)["'][^>]*>\s*([\s\S]*?)<\/invoke>\s*<\/function-call>/i
  );
  if (functionCallMatch) {
    return formatXmlToolCall(functionCallMatch[1].trim(), functionCallMatch[2]);
  }

  const invokeOnlyMatch = text.match(/<invoke\s+name=["']([^"']+)["'][^>]*>\s*([\s\S]*?)<\/invoke>/i);
  if (invokeOnlyMatch) {
    return formatXmlToolCall(invokeOnlyMatch[1].trim(), invokeOnlyMatch[2]);
  }

  if (/<\/?(function-call|invoke|parameter)\b/i.test(text)) {
    return "\u6b63\u5728\u6267\u884c\u5185\u90e8\u5de5\u5177\uff0c\u8bf7\u7a0d\u5019\u2026";
  }

  const toolNameMap = {
    search_files: "搜索文件",
    read_file: "读取文件",
    write_file: "写入文件",
    edit_file: "编辑文件",
    run_command: "运行命令",
    list_files: "列出文件",
  };

  const formatBody = (body) => String(body || "")
    .trim()
    .replace(/^path:/gim, "路径：")
    .replace(/^pattern:/gim, "匹配规则：")
    .replace(/^query:/gim, "查询：")
    .replace(/^command:/gim, "命令：")
    .replace(/^file:/gim, "文件：");

  const searchFilesMatch = text.match(
    /<search_files>\s*path:\s*([\s\S]*?)\s*pattern:\s*([\s\S]*?)\s*<\/search_files>/i
  );
  if (searchFilesMatch) {
    const path = searchFilesMatch[1].trim();
    const pattern = searchFilesMatch[2].trim();
    return [
      "正在搜索文件：",
      `路径：${path}`,
      `匹配规则：${pattern}`,
    ].join("\n");
  }

  const genericToolMatch = text.match(/<([a-zA-Z0-9_-]+)>\s*([\s\S]*?)\s*<\/\1>/);
  if (genericToolMatch) {
    const toolName = genericToolMatch[1];
    const body = genericToolMatch[2].trim();
    const looksLikeToolParams = /^[a-zA-Z_][\w-]*\s*:/m.test(body);
    if (toolNameMap[toolName] || looksLikeToolParams) {
      const displayName = toolNameMap[toolName] || toolName;
      return `正在执行工具：${displayName}\n${formatBody(body)}`;
    }
  }

  const pendingToolMatch = text.match(/<([a-zA-Z0-9_-]+)>\s*([\s\S]*)$/);
  if (pendingToolMatch && !new RegExp(`</${pendingToolMatch[1]}>`, "i").test(text)) {
    const toolName = pendingToolMatch[1];
    if (toolNameMap[toolName]) return `正在执行工具：${toolNameMap[toolName]}`;
  }

  return text;
}

const COMPACT_CHAT_OPTIONS = Object.freeze({
  maxPreviewChars: 220,
  maxPreviewLines: 5,
  maxVisibleBullets: 3,
  collapseWhenChars: 420,
  collapseWhenLines: 8,
  collapseWhenCodeBlocks: 1,
});

const COMPACT_TOOL_STATUS_RE = /^\s*(exec|tool|browser|bash|shell|python|powershell|cmd|node|npm|cargo)\b[^\n]{0,24}?(成功|success|done|完成|ok|passed|通过)(?:\b|$|[\s·:：|.-])/i;
const COMPACT_CODE_BLOCK_RE = /```[\s\S]*?```/g;

function normalizeCompactChatText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const COMPACT_CODE_PLACEHOLDER_RE = /^__CODE_BLOCK_\d+__$/;
const COMPACT_HEADING_RE = /^#{1,6}\s+/;
const COMPACT_BULLET_RE = /^\s*[-*•]\s+(.+)$/;
const COMPACT_NUMBERED_RE = /^\s*\d+[.)]\s+/;
const COMPACT_TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const COMPACT_TABLE_SEPARATOR_RE = /^\s*\|?[\s:-]+\|[\s|:-]*\|?\s*$/;

function isStandaloneCompactLine(line) {
  const text = String(line || "").trim();
  return COMPACT_HEADING_RE.test(text)
    || COMPACT_BULLET_RE.test(text)
    || COMPACT_NUMBERED_RE.test(text)
    || COMPACT_CODE_PLACEHOLDER_RE.test(text)
    || COMPACT_TABLE_ROW_RE.test(text)
    || COMPACT_TABLE_SEPARATOR_RE.test(text);
}

function isCompactSectionHeading(line) {
  const text = String(line || "").trim();
  if (!text || isStandaloneCompactLine(text)) return false;
  if (text.length > 18) return false;
  return !/[。！？!?；;,，、]$/.test(text);
}

function cleanCompactBulletText(line) {
  const match = String(line || "").match(COMPACT_BULLET_RE);
  return (match?.[1] || "")
    .replace(/\s+/g, " ")
    .replace(/[。；;]\s*$/g, "")
    .trim();
}

function canCompactBulletItems(items) {
  return items.length >= 2
    && items.length <= 8
    && items.every((item) => item && item.length <= 72 && !COMPACT_CODE_PLACEHOLDER_RE.test(item));
}

function compactShortBulletSections(text) {
  const lines = String(text || "").split("\n");
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || "";
    const nextBulletIndex = COMPACT_BULLET_RE.test(nextLine)
      ? index + 1
      : (!nextLine.trim() && COMPACT_BULLET_RE.test(lines[index + 2] || "") ? index + 2 : -1);

    if (isCompactSectionHeading(line) && nextBulletIndex > -1) {
      const bullets = [];
      let cursor = nextBulletIndex;
      while (cursor < lines.length && COMPACT_BULLET_RE.test(lines[cursor])) {
        bullets.push(cleanCompactBulletText(lines[cursor]));
        cursor += 1;
      }
      if (canCompactBulletItems(bullets)) {
        const heading = line.trim().replace(/[：:]\s*$/g, "");
        output.push(`${heading}：${bullets.join("；")}。`);
        index = cursor - 1;
        continue;
      }
    }

    if (COMPACT_BULLET_RE.test(line)) {
      const bullets = [];
      let cursor = index;
      while (cursor < lines.length && COMPACT_BULLET_RE.test(lines[cursor])) {
        bullets.push(cleanCompactBulletText(lines[cursor]));
        cursor += 1;
      }
      if (canCompactBulletItems(bullets)) {
        output.push(`${bullets.join("；")}。`);
        index = cursor - 1;
        continue;
      }
    }

    output.push(line);
  }

  return output.join("\n");
}

function compactMarkdownSpacing(rawText) {
  const text = String(rawText ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const codeBlocks = [];
  const protectedText = text.replace(COMPACT_CODE_BLOCK_RE, (block) => {
    const key = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(block);
    return key;
  });

  const normalized = protectedText
    .split("\n")
    .map((line) => line.trimEnd())
    .reduce((lines, line) => {
      const trimmed = line.trim();
      const previous = lines[lines.length - 1] || "";

      if (!trimmed) {
        if (previous !== "") lines.push("");
        return lines;
      }

      if (isStandaloneCompactLine(trimmed)) {
        lines.push(trimmed);
        return lines;
      }

      if (previous && previous !== "" && !isStandaloneCompactLine(previous)) {
        lines[lines.length - 1] = `${previous} ${trimmed}`;
      } else {
        lines.push(trimmed);
      }

      return lines;
    }, [])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return compactShortBulletSections(normalized)
    .replace(/__CODE_BLOCK_(\d+)__/g, (_, index) => codeBlocks[Number(index)] || "")
    .replace(/(\n#{1,6} .+)\n{2,}/g, "$1\n")
    .replace(/\n{2,}([-*•]\s+)/g, "\n$1")
    .replace(/([-*•].+)\n{2,}/g, "$1\n");
}

function splitCompactToolStatusLines(text) {
  const lines = normalizeCompactChatText(text).split("\n");
  const toolLines = [];
  const contentLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (COMPACT_TOOL_STATUS_RE.test(trimmed)) toolLines.push(trimmed);
    else contentLines.push(line);
  }
  return { toolLines, content: contentLines.join("\n").trim() };
}

function shouldCollapseCompactMessage(text, options = {}) {
  const opts = { ...COMPACT_CHAT_OPTIONS, ...options };
  const normalized = normalizeCompactChatText(text);
  if (!normalized) return false;
  const lineCount = normalized.split("\n").length;
  const codeBlockCount = (normalized.match(COMPACT_CODE_BLOCK_RE) || []).length;
  return normalized.length > opts.collapseWhenChars
    || lineCount > opts.collapseWhenLines
    || codeBlockCount >= opts.collapseWhenCodeBlocks;
}

function createCompactPanelPreview(text, options = {}) {
  const opts = { ...COMPACT_CHAT_OPTIONS, ...options };
  const normalized = normalizeCompactChatText(text);
  if (!normalized) return "";
  const noCode = normalized.replace(COMPACT_CODE_BLOCK_RE, "[代码块已折叠]");
  const lines = noCode.split("\n");
  const previewLines = [];
  let bulletCount = 0;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (previewLines.length && previewLines[previewLines.length - 1] !== "") previewLines.push("");
      continue;
    }
    const isBullet = /^\s*[-*•]\s+/.test(line);
    if (isBullet) {
      bulletCount += 1;
      if (bulletCount > opts.maxVisibleBullets) continue;
    }
    previewLines.push(line);
    if (previewLines.filter(Boolean).length >= opts.maxPreviewLines) break;
  }
  let preview = previewLines.join("\n").trim();
  if (preview.length > opts.maxPreviewChars) preview = `${preview.slice(0, opts.maxPreviewChars).trim()}...`;
  return preview;
}

const PANEL_LAYOUT_BULLET_RE = new RegExp("^\\s*[-*\\u2022]\\s+(.+)$");
const PANEL_LAYOUT_CODE_TOKEN_RE = /^__PANEL_CODE_BLOCK_\d+__$/;
const PANEL_LAYOUT_HEADING_RE = /^#{1,6}\s+/;
const PANEL_LAYOUT_NUMBERED_RE = /^\s*\d+[.)]\s+/;
const PANEL_LAYOUT_TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const PANEL_LAYOUT_TABLE_SEPARATOR_RE = /^\s*\|?[\s:-]+\|[\s|:-]*\|?\s*$/;
const PANEL_LAYOUT_SENTENCE_END_RE = /[\u3002\uFF01\uFF1F!?；;,，、]$/;
const PANEL_LAYOUT_TRAILING_COLON_RE = /[\uFF1A:]\s*$/g;
const PANEL_LAYOUT_TRAILING_ITEM_PUNCT_RE = /[\u3002\uFF1B;]\s*$/g;
const PANEL_LAYOUT_PLAIN_HEADING_RE = /^[\u4e00-\u9fffA-Za-z0-9 +/&_-]{2,18}$/;

function isPanelLayoutStandaloneLine(line) {
  const text = String(line || "").trim();
  return PANEL_LAYOUT_HEADING_RE.test(text)
    || PANEL_LAYOUT_BULLET_RE.test(text)
    || PANEL_LAYOUT_NUMBERED_RE.test(text)
    || PANEL_LAYOUT_CODE_TOKEN_RE.test(text)
    || PANEL_LAYOUT_TABLE_ROW_RE.test(text)
    || PANEL_LAYOUT_TABLE_SEPARATOR_RE.test(text);
}

function isPanelLayoutHeading(line) {
  const text = String(line || "").trim();
  return !!text
    && text.length <= 18
    && !isPanelLayoutStandaloneLine(text)
    && !PANEL_LAYOUT_SENTENCE_END_RE.test(text);
}

function isPanelLayoutPlainHeading(line) {
  const text = String(line || "").trim().replace(PANEL_LAYOUT_TRAILING_COLON_RE, "");
  return isPanelLayoutHeading(text) && PANEL_LAYOUT_PLAIN_HEADING_RE.test(text);
}

function cleanPanelLayoutBullet(line) {
  const match = String(line || "").match(PANEL_LAYOUT_BULLET_RE);
  return (match?.[1] || "")
    .replace(/\s+/g, " ")
    .replace(PANEL_LAYOUT_TRAILING_ITEM_PUNCT_RE, "")
    .trim();
}

function canCompactPanelBullets(items) {
  return items.length >= 2
    && items.length <= 8
    && items.every((item) => item && item.length <= 72 && !PANEL_LAYOUT_CODE_TOKEN_RE.test(item));
}

function compactPanelBulletSections(text) {
  const lines = String(text || "").split("\n");
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || "";
    const nextBulletIndex = PANEL_LAYOUT_BULLET_RE.test(nextLine)
      ? index + 1
      : (!nextLine.trim() && PANEL_LAYOUT_BULLET_RE.test(lines[index + 2] || "") ? index + 2 : -1);

    if (isPanelLayoutHeading(line) && nextBulletIndex > -1) {
      const bullets = [];
      let cursor = nextBulletIndex;
      while (cursor < lines.length && PANEL_LAYOUT_BULLET_RE.test(lines[cursor])) {
        bullets.push(cleanPanelLayoutBullet(lines[cursor]));
        cursor += 1;
      }
      if (canCompactPanelBullets(bullets)) {
        const heading = line.trim().replace(PANEL_LAYOUT_TRAILING_COLON_RE, "");
        output.push(`${heading}\uFF1A${bullets.join("\uFF1B")}\u3002`);
        index = cursor - 1;
        continue;
      }
    }

    const nextContentIndex = nextLine.trim() ? index + 1 : index + 2;
    const nextContentLine = lines[nextContentIndex] || "";
    if (
      isPanelLayoutPlainHeading(line)
      && nextContentLine.trim()
      && !isPanelLayoutStandaloneLine(nextContentLine)
      && nextContentLine.trim().length <= 180
    ) {
      const heading = line.trim().replace(PANEL_LAYOUT_TRAILING_COLON_RE, "");
      output.push(`${heading}\uFF1A${nextContentLine.trim()}`);
      index = nextContentIndex;
      continue;
    }

    if (PANEL_LAYOUT_BULLET_RE.test(line)) {
      const bullets = [];
      let cursor = index;
      while (cursor < lines.length && PANEL_LAYOUT_BULLET_RE.test(lines[cursor])) {
        bullets.push(cleanPanelLayoutBullet(lines[cursor]));
        cursor += 1;
      }
      if (canCompactPanelBullets(bullets)) {
        output.push(`${bullets.join("\uFF1B")}\u3002`);
        index = cursor - 1;
        continue;
      }
    }
    output.push(line);
  }
  return output.join("\n");
}

function compactPanelMarkdownSpacing(rawText) {
  const text = String(rawText ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const codeBlocks = [];
  const protectedText = text.replace(COMPACT_CODE_BLOCK_RE, (block) => {
    const key = `__PANEL_CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(block);
    return key;
  });
  const normalized = protectedText
    .split("\n")
    .map((line) => line.trimEnd())
    .reduce((lines, line) => {
      const trimmed = line.trim();
      const previous = lines[lines.length - 1] || "";
      if (!trimmed) {
        if (previous !== "") lines.push("");
        return lines;
      }
      if (isPanelLayoutStandaloneLine(trimmed)) {
        lines.push(trimmed);
        return lines;
      }
      if (previous && previous !== "" && !isPanelLayoutStandaloneLine(previous)) {
        lines[lines.length - 1] = `${previous} ${trimmed}`;
      } else {
        lines.push(trimmed);
      }
      return lines;
    }, [])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return compactPanelBulletSections(normalized)
    .replace(/__PANEL_CODE_BLOCK_(\d+)__/g, (_, index) => codeBlocks[Number(index)] || "")
    .replace(/(\n#{1,6} .+)\n{2,}/g, "$1\n")
    .replace(/\n{2,}([-*\u2022]\s+)/g, "\n$1")
    .replace(/([-*\u2022].+)\n{2,}/g, "$1\n");
}

function compactClaudePanelMessage(rawText, options = {}) {
  const { toolLines, content } = splitCompactToolStatusLines(rawText);
  const layoutContent = compactPanelMarkdownSpacing(content);
  const collapsed = shouldCollapseCompactMessage(layoutContent, options);
  return {
    content: layoutContent,
    preview: collapsed ? createCompactPanelPreview(layoutContent, options) : layoutContent,
    collapsed,
    toolLines,
    toolSummary: toolLines.length > 0 ? `工具日志 ${toolLines.length} 条` : "",
  };
}

function splitClaudeThinkingBlocks(rawText) {
  const source = String(rawText || "");
  const thoughts = [];
  const visible = source.replace(/<think\b[^>]*>([\s\S]*?)(?:<\/think>|$)/gi, (_, thought) => {
    const text = String(thought || "").trim();
    if (text) thoughts.push(text);
    return "";
  });
  return {
    visibleText: visible.replace(/\n{3,}/g, "\n\n").trim(),
    thoughts,
  };
}

function renderThinkingBlocks(thoughts, wrapper, options = {}) {
  if (!Array.isArray(thoughts) || thoughts.length === 0 || !wrapper) return;
  const details = document.createElement("details");
  details.className = `assistant-thinking-block${options.streaming ? " is-thinking" : ""}`;
  const summary = document.createElement("summary");
  summary.innerHTML = options.streaming
    ? '<span>正在思考</span><i class="thinking-dots" aria-hidden="true"><b></b><b></b><b></b></i><em>生成中</em>'
    : "<span>思考过程</span><em>已折叠</em>";
  const content = document.createElement("div");
  content.className = "assistant-thinking-block__content";
  content.textContent = thoughts.join("\n\n");
  details.append(summary, content);
  wrapper.appendChild(details);
}

function maskAgentMessageSensitiveText(text) {
  return String(text || "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-****")
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, "Bearer ****")
    .replace(/((?:api[_-]?key|token|secret|MINIMAX_API_KEY|OPENAI_API_KEY|CLAUDE_API_KEY)\s*[:=]\s*)[A-Za-z0-9._-]{8,}/gi, "$1****");
}

function chooseAgentMessageIcon(line, index, type) {
  const text = String(line || "").toLowerCase();
  if (/error|failed|失败|错误|报错|不可|不能|超时|风险|危险|警告|warning/.test(text)) return "⚠️";
  if (/success|ok|pass|完成|成功|通过|已连接|正常|可以/.test(text)) return "✅";
  if (/api key|apikey|token|secret|密钥|授权|登录|鉴权/.test(text)) return "🔑";
  if (/https?:\/\/|localhost|127\.0\.0\.1|baseurl|base url|链接|地址|url/.test(text)) return "🔗";
  if (/图片|图像|截图|生图|image|vision|ocr|media/.test(text)) return "🖼️";
  if (/文件|目录|路径|config|env|配置|保存|本地/.test(text)) return "📁";
  if (/测试|验证|检查|排查|诊断|smoke|build/.test(text)) return "🧪";
  if (/工具|执行|修复|修改|处理|命令|shell|terminal|gateway|agent/.test(text)) return "🛠️";
  if (/步骤|第一|第二|第三|然后|最后|下一步/.test(text)) return "👉";
  if (type === "heading") return "📌";
  if (type === "list") return "👉";
  return index % 3 === 0 ? "💬" : (index % 3 === 1 ? "✅" : "🤖");
}

function stripAgentMessageMarkdownPrefix(line) {
  return String(line || "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)、]\s+/, "")
    .replace(/^>\s+/, "")
    .trim();
}

function isAgentMessageHeadingLine(line) {
  const value = String(line || "").trim();
  return /^#{1,6}\s+/.test(value) || /^(结论|总结|结果|注意|警告|风险|原因|方案|建议|配置|设置|步骤|流程|下一步|示例)[:：]/.test(value);
}

function isAgentMessageListLine(line) {
  const value = String(line || "").trim();
  return /^[-*]\s+/.test(value) || /^\d+[.)、]\s+/.test(value);
}

function escapeClaudeMarkdownHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appendMarkdownFragment(parent, fragment) {
  if (!parent || !fragment) return;
  parent.appendChild(fragment);
}

function renderClaudeMarkdownInline(text) {
  const fragment = document.createDocumentFragment();
  const source = String(text || "");
  const pattern = /(`([^`\n]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
    }
    const code = match[2];
    const strong = match[3] || match[4];
    const emphasis = match[5] || match[6];
    if (code != null) {
      const node = document.createElement("code");
      node.className = "claude-inline-code";
      node.textContent = code;
      fragment.appendChild(node);
    } else if (strong != null) {
      const node = document.createElement("strong");
      node.className = "claude-markdown-strong";
      node.textContent = strong;
      fragment.appendChild(node);
    } else if (emphasis != null) {
      const node = document.createElement("em");
      node.className = "claude-markdown-em";
      node.textContent = emphasis;
      fragment.appendChild(node);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < source.length) {
    fragment.appendChild(document.createTextNode(source.slice(lastIndex)));
  }
  return fragment;
}

function appendClaudeMarkdownRow(parent, line, index, type = "paragraph") {
  const row = document.createElement(type === "paragraph" ? "p" : "div");
  row.className = `agent-message-row agent-message-${type}`;
  const icon = document.createElement("span");
  icon.className = "agent-message-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = chooseAgentMessageIcon(line, index, type);
  const text = document.createElement("span");
  text.className = "agent-message-text";
  appendMarkdownFragment(text, renderClaudeMarkdownInline(stripAgentMessageMarkdownPrefix(line)));
  row.append(icon, text);
  parent.appendChild(row);
}

function appendClaudeCodeBlock(parent, codeText, lang = "") {
  const pre = document.createElement("pre");
  pre.className = "claude-code-block";
  if (lang) {
    pre.dataset.lang = lang;
    const label = document.createElement("span");
    label.className = "claude-code-lang";
    label.textContent = lang;
    pre.appendChild(label);
  }
  const code = document.createElement("code");
  code.textContent = String(codeText || "");
  pre.appendChild(code);
  parent.appendChild(pre);
}

function renderClaudeMarkdownBlocks(value, parent) {
  if (!parent) return;
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  let blockIndex = 0;
  let paragraph = [];
  let list = null;
  let codeFence = null;

  const flushParagraph = () => {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (!text) return;
    for (const line of text.split("\n")) {
      appendClaudeMarkdownRow(parent, line, blockIndex, "paragraph");
      blockIndex += 1;
    }
  };
  const flushList = () => {
    if (!list) return;
    parent.appendChild(list);
    list = null;
    blockIndex += 1;
  };

  for (const rawLine of lines) {
    const fence = rawLine.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (fence) {
      if (codeFence) {
        appendClaudeCodeBlock(parent, codeFence.lines.join("\n"), codeFence.lang);
        codeFence = null;
        blockIndex += 1;
      } else {
        flushParagraph();
        flushList();
        codeFence = { lang: fence[1] || "", lines: [] };
      }
      continue;
    }
    if (codeFence) {
      codeFence.lines.push(rawLine);
      continue;
    }

    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(6, heading[1].length);
      const headingNode = document.createElement("h" + level);
      headingNode.className = "claude-markdown-heading";
      appendMarkdownFragment(headingNode, renderClaudeMarkdownInline(heading[2]));
      parent.appendChild(headingNode);
      blockIndex += 1;
      continue;
    }

    const listItem = line.match(/^[-*\u2022]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      if (!list) {
        list = document.createElement(/^\d+[.)]\s+/.test(line) ? "ol" : "ul");
        list.className = "claude-markdown-list";
      }
      const item = document.createElement("li");
      appendMarkdownFragment(item, renderClaudeMarkdownInline(listItem[1]));
      list.appendChild(item);
      continue;
    }

    paragraph.push(rawLine);
  }

  if (codeFence) {
    appendClaudeCodeBlock(parent, codeFence.lines.join("\n"), codeFence.lang);
    blockIndex += 1;
  }
  flushParagraph();
  flushList();
}

function appendAgentMessageRow(parent, line, index, type = "paragraph") {
  const row = document.createElement(type === "paragraph" ? "p" : "div");
  row.className = `agent-message-row agent-message-${type}`;
  const icon = document.createElement("span");
  icon.className = "agent-message-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = chooseAgentMessageIcon(line, index, type);
  const text = document.createElement("span");
  text.className = "agent-message-text";
  text.textContent = stripAgentMessageMarkdownPrefix(line);
  row.append(icon, text);
  parent.appendChild(row);
}

function renderClaudeAgentMessageContent(value, body, details = "") {
  if (!body) return;
  body.innerHTML = "";
  const finalText = maskAgentMessageSensitiveText(String(value || "").trim());
  const detailText = maskAgentMessageSensitiveText(String(details || "").trim());
  if (finalText) {
    const message = document.createElement("div");
    message.className = "agent-message-content";
    message.dataset.agent = "claude";
    const messageBody = document.createElement("div");
    messageBody.className = "agent-message-body";
    renderClaudeMarkdownBlocks(finalText, messageBody);
    message.appendChild(messageBody);
    body.appendChild(message);
  }
  if (detailText) {
    const detail = document.createElement("details");
    detail.className = "agent-message-detail";
    const summary = document.createElement("summary");
    summary.innerHTML = "<span aria-hidden=\"true\">📝</span><span>查看分析详情</span>";
    const panel = document.createElement("pre");
    panel.className = "agent-message-detail-panel";
    panel.textContent = detailText;
    detail.append(summary, panel);
    body.appendChild(detail);
  }
}

function renderCompactClaudePanelMessage(rawText, body, options = {}) {
  if (!body) return;
  const parsed = splitClaudeThinkingBlocks(rawText);
  const compact = compactClaudePanelMessage(parsed.visibleText);
  body.innerHTML = "";
  body.dataset.visibleText = parsed.visibleText || "";

  const wrapper = document.createElement("div");
  wrapper.className = "assistant-compact-message";
  if (compact.collapsed) wrapper.classList.add("is-collapsed");

  const detailText = [
    ...(Array.isArray(parsed.thoughts) ? parsed.thoughts : []),
    ...(Array.isArray(compact.toolLines) ? compact.toolLines : []),
  ].join("\n\n");

  const content = document.createElement("div");
  content.className = "assistant-compact-message__content";
  const renderContent = (value) => {
    renderClaudeAgentMessageContent(value || "", content, detailText);
  };
  renderContent(compact.preview);
  if (compact.preview || compact.content) wrapper.appendChild(content);

  if (compact.collapsed) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "assistant-compact-message__toggle";
    toggle.textContent = "展开详情";
    toggle.addEventListener("click", () => {
      const expanded = wrapper.classList.toggle("is-expanded");
      wrapper.classList.toggle("is-collapsed", !expanded);
      toggle.textContent = expanded ? "收起详情" : "展开详情";
      renderContent(expanded ? compact.content : compact.preview);
    });
    wrapper.appendChild(toggle);
  }

  body.appendChild(wrapper);
}

function flushAssistantTextBuffer() {
  if (!assistantTextBuffer) return;
  if (!activeAssistantMessage) {
    activeAssistantMessage = addMessage("assistant", "Claude");
  }
  const chunk = assistantTextBuffer;
  assistantTextBuffer = "";
  activeAssistantMessage.rawText = `${activeAssistantMessage.rawText || ""}${chunk}`;
  renderCompactClaudePanelMessage(formatClaudeCodeToolCallForZh(activeAssistantMessage.rawText), activeAssistantMessage.body, { streaming: true });
  renderAuthorizationCard(activeAssistantMessage.message, activeAssistantMessage.rawText);
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
    if (isRuntimeSummaryMessage("system", "", text)) {
      const row = message.closest(".message-row");
      (row || message).remove();
    }
  }
}

function addMessage(kind, title, text = "") {
  if (isRuntimeSummaryMessage(kind, title, text)) {
    const placeholder = document.createElement("span");
    return { message: placeholder, body: placeholder };
  }
  clearEmptyState();
  const row = document.createElement("div");
  row.className = `message-row ${kind} sc-msg-row ${kind}`;
  const message = document.createElement("article");
  message.className = `message ${kind} sc-msg-bubble ${kind}`;
  const head = document.createElement("div");
  head.className = "message-head";
  head.textContent = kind === "user" && ["你", "我", "用户"].includes(title) ? "操作者" : title;
  const body = document.createElement("div");
  body.className = "message-body";
  const displayText = formatClaudeCodeToolCallForZh(text);
  if (kind === "user") body.textContent = displayText;
  else renderCompactClaudePanelMessage(displayText, body);
  message.append(head, body);
  row.append(message);
  transcript.append(row);
  scheduleTranscriptScroll();
  return { row, message, body, rawText: String(text || "") };
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
  const effectiveMode = status.effectiveMode || status.runtimeMode || "CLAUDE_PANEL_RELAY";
  const modeLabel = effectiveMode === "NATIVE_CLAUDE_CODE"
    ? "Claude Code · Native CLI"
    : effectiveMode === "SAFE_SELFCHECK_EXECUTOR"
      ? "Claude Panel · Safe Selfcheck"
      : "Claude Panel · Relay 模式";
  addMessage(
    "system",
    "状态",
    [
      `当前模式：${modeLabel}`,
      `Claude CLI：${status.nativeClaude?.available ? status.nativeClaude.version || "已检测到" : "未检测到"}`,
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

function isExplicitBrowserTask(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (/(桌面端|客户端|本地应用|应用程序|桌面应用|app).{0,18}(打开|搜索|点击|输入|查看|读取|采集|操作)|(?:打开|搜索|点击|输入|查看|读取|采集|操作).{0,18}(桌面端|客户端|本地应用|应用程序|桌面应用|app)/i.test(value)) {
    return false;
  }
  return /https?:\/\//i.test(value) ||
    /(浏览器|网页|网站|网址|链接|页面|打开网页|打开网站|搜索网页|网上搜索|联网搜索|网页搜索|抓取|读取链接|浏览)/i.test(value) ||
    /\b(browser|website|web page|url|search web|open url|navigate|scrape)\b/i.test(value);
}

function implicitBrowserRunOverrides(prompt, overrides = {}) {
  if (overrides.permissionProfile || overrides.toolProfile || overrides.browserAccess) return overrides;
  if (!isExplicitBrowserTask(prompt)) return overrides;
  browserModeAccepted = true;
  return {
    ...overrides,
    permissionProfile: "browser",
    toolProfile: "none",
    browserAccess: window.sessionStorage.getItem(browserAccessAlwaysKey) === "true" ? "always" : "once",
  };
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
  stopBtn.disabled = !running && !nativeClaudeRunning;
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
          messages: Array.isArray(conversation.messages) ? conversation.messages : [],
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
  const compacted = conversations.slice(0, 120).map((conversation) => ({
    ...conversation,
    messages: compactConversationMessages(conversation.messages || []),
  }));
  window.localStorage.setItem(conversationsStorageKey, JSON.stringify(compacted));
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

function normalizeConversationMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && typeof message === "object")
    .map((message) => ({
      id: message.id || makeId(),
      role: ["user", "assistant", "system", "error"].includes(message.role) ? message.role : "system",
      title: String(message.title || ""),
      content: String(message.content || ""),
      timestamp: message.timestamp || new Date().toISOString(),
    }))
    .filter((message) => message.content.trim());
}

function compactConversationMessages(messages) {
  const list = normalizeConversationMessages(messages);
  if (list.length <= maxConversationMessages) return list;
  const keep = list.slice(-maxConversationMessages);
  return [
    {
      id: `summary-${Date.now()}`,
      role: "system",
      title: "上下文已压缩",
      content: `已压缩 ${list.length - keep.length} 条更早的界面记录；真正的连续上下文继续由 Claude Code 原生 session 续接。`,
      timestamp: new Date().toISOString(),
    },
    ...keep,
  ];
}

function appendConversationMessage(conversationId, role, title, content) {
  const text = String(content || "").trim();
  if (!conversationId || !text) return;
  conversations = conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    const messages = compactConversationMessages([
      ...(conversation.messages || []),
      {
        id: makeId(),
        role,
        title,
        content: text,
        timestamp: new Date().toISOString(),
      },
    ]);
    return {
      ...conversation,
      messages,
      updatedAt: new Date().toISOString(),
    };
  });
  saveConversations();
  scheduleConversationRender();
}

function appendCurrentConversationMessage(role, title, content) {
  appendConversationMessage(currentConversationId, role, title, content);
}

function appendActiveRunConversationMessage(role, title, content) {
  appendConversationMessage(activeRunConversationId || currentConversationId, role, title, content);
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
    nativeSessionId: "",
    messages: [],
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
    nativeSessionId: "",
    messages: [],
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

function updateConversationById(id, patch) {
  if (!id) return;
  conversations = conversations.map((conversation) =>
    conversation.id === id ? { ...conversation, ...patch } : conversation
  );
  saveConversations();
  scheduleConversationRender();
}

function updateCurrentConversation(patch) {
  updateConversationById(currentConversationId, patch);
}

function updateActiveRunConversation(patch) {
  updateConversationById(activeRunConversationId || currentConversationId, patch);
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
  const messages = normalizeConversationMessages(conversation.messages || []);
  if (messages.length) {
    for (const message of messages) {
      addMessage(message.role, message.title || (message.role === "user" ? "你" : message.role === "assistant" ? "Claude" : "记录"), message.content);
    }
  } else if (conversation.prompt || conversation.result) {
    if (conversation.prompt) addMessage("user", "你", conversation.prompt);
    if (conversation.result) addMessage("assistant", "Claude", conversation.result);
  } else {
    addMessage("system", normalizeConversationStatus(conversation.status), "这个工程文件还没有开始对话。");
  }
  removeRuntimeSummaryMessages();
  setRunState(statusToRunState(conversation.status), normalizeConversationStatus(conversation.status));
  renderConversations();
}

function restoreLastConversation() {
  const latest = conversations
    .filter((conversation) => !conversation.archived)
    .slice()
    .sort((a, b) => {
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return bTime - aTime;
    })[0];
  if (latest) {
    showConversation(latest);
    return true;
  }
  return false;
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
      return [
        conversation.title,
        conversation.prompt,
        conversation.result,
        conversation.status,
        ...(conversation.messages || []).map((message) => `${message.title || ""} ${message.content || ""}`),
      ]
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
    ["delete", "从列表移除", () => handleConversationAction(conversation.id, "delete")],
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

  if (conversation.projectPath) {
    menu.append(createMenuDivider());
    menu.append(createConversationDangerZone(conversation));
  }

  return menu;
}

function createConversationDangerZone(conversation) {
  const details = document.createElement("details");
  details.className = "conversation-danger-zone";

  const summary = document.createElement("summary");
  summary.textContent = "危险操作";
  details.append(summary);

  const pathText = document.createElement("div");
  pathText.className = "conversation-danger-path";
  pathText.textContent = conversation.projectPath;
  details.append(pathText);

  const button = document.createElement("button");
  button.className = "conversation-menu-item danger";
  button.type = "button";
  button.innerHTML = `${menuIcon("delete")}<span>删除本地文件</span>`;
  button.addEventListener("click", () => handleConversationAction(conversation.id, "delete-local-files"));
  details.append(button);

  return details;
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

function sameProjectPath(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function shouldAutoCreateProjectForPrompt(overrides = {}) {
  const selected = projectSelect.value || "";
  if (overrides.source === "quick-command") return false;
  if (!selected) return true;
  if (!isManagedProjectPath(selected)) return true;
  const activeConversation = currentConversationId ? getConversation(currentConversationId) : null;
  if (!activeConversation) return false;
  return !sameProjectPath(activeConversation.projectPath, selected);
}

async function createManagedProjectFromPrompt(prompt) {
  const name = createConversationTitle(prompt || "新工程文件");
  const res = await fetch("/api/project-folders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || "工程文件创建失败");

  const project = result.project || {};
  if (!project.path) throw new Error("工程文件创建失败：服务没有返回项目路径");
  managedProjectFolders = Array.isArray(result.folders) ? result.folders : managedProjectFolders;
  renderProjectOptions(result.projects || [project]);
  projectSelect.value = project.path;
  updateCurrentProject();
  const conversation = ensureProjectConversation(project.path, project.name || name);
  if (conversation) {
    conversation.title = project.name || name;
    conversation.status = "准备就绪";
    conversation.kind = "project";
    conversation.projectPath = project.path;
    conversation.messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    saveConversations();
    renderConversations();
  }
  return conversation;
}

async function ensureProjectForPrompt(prompt, overrides = {}) {
  if (!shouldAutoCreateProjectForPrompt(overrides)) return true;
  try {
    const conversation = await createManagedProjectFromPrompt(prompt);
    if (conversation) return true;
  } catch (error) {
    addMessage("error", "工程文件创建失败", error.message || "无法自动创建工程文件，请手动新建后再发送。");
    openProjectNameDialog();
    return false;
  }
  return false;
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

function removeProjectConversationFromList(conversation) {
  const displayTitle = conversationDisplayTitle(conversation);
  removeConversationRecord(conversation.id);
  addMessage("system", "工程文件", `已从列表移除「${displayTitle}」；磁盘文件没有被删除。`);
}

async function deleteLocalProjectFiles(conversation) {
  const displayTitle = conversationDisplayTitle(conversation);
  if (!conversation.projectPath) {
    throw new Error("当前记录没有本地项目路径，不能删除本地文件");
  }

  const confirmText = window.prompt(
    [
      "危险操作：将把本地项目文件夹移动到隔离区。",
      `完整路径：${conversation.projectPath}`,
      `请输入：${LOCAL_FILE_DELETE_CONFIRM_TEXT}`,
    ].join("\n")
  );
  if (confirmText !== LOCAL_FILE_DELETE_CONFIRM_TEXT) {
    addMessage("system", "工程文件", "未输入确认文本，已取消删除本地文件。");
    return;
  }

  const res = await fetch("/api/project-folders", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: conversation.projectPath,
      confirmText,
    }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(result.error || "工程文件删除失败");
  }
  managedProjectFolders = result.folders || [];
  renderProjectOptions(result.projects || []);
  removeConversationRecord(conversation.id);
  addMessage(
    "system",
    "工程文件",
    `已移动到隔离区，原路径已移除。${result.project?.quarantinePath ? `隔离区：${result.project.quarantinePath}` : ""}`
  );
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
    removeProjectConversationFromList(conversation);
    renderConversations();
    return;
  }

  if (action === "delete-local-files") {
    try {
      await deleteLocalProjectFiles(conversation);
    } catch (error) {
      addMessage("error", "工程文件删除失败", error.message || "工程文件删除失败");
    }
    renderConversations();
    return;
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
      nativeSessionId: "",
      messages: [],
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
  const effectiveMode = status.effectiveMode || status.runtimeMode || "CLAUDE_PANEL_RELAY";
  const modeLabel = effectiveMode === "NATIVE_CLAUDE_CODE"
    ? "Claude Code · Native CLI"
    : effectiveMode === "SAFE_SELFCHECK_EXECUTOR"
      ? "Claude Panel · Safe Selfcheck"
      : "Claude Panel · Relay 模式";
  const storedModel = window.localStorage.getItem(modelStorageKey) || model;
  currentMainModel = model;
  currentBranchModels = uniqueModels([...(Array.isArray(status.modelBranches) ? status.modelBranches : []), storedModel]);

  providerLine.textContent = `${modeLabel} · ${model} · ${host}`;
  modelInput.value = storedModel;
  updateModelSwitchLabels();
  renderBranchModelOptions();
  versionLine.textContent = effectiveMode === "NATIVE_CLAUDE_CODE"
    ? `${status.nativeClaude?.version || status.claudeVersion || "未检测到版本"} · Native CLI`
    : `${status.claudeVersion || "未检测到版本"} · Relay`;
  hostLine.textContent = `${host} · ${modeLabel}`;
  pluginSummary.textContent = status.plugins?.summary || "未检测到插件信息";
  skillsSummary.textContent = Array.isArray(status.skills)
    ? `${status.skills.length} 个：${status.skills.slice(0, 3).join("、")}${status.skills.length > 3 ? "..." : ""}`
    : "未检测到 skills";

  authDot.className = `dot ${status.authConfigured ? "ok" : "bad"}`;
  authText.textContent = status.authConfigured
    ? `已连接 · ${modeLabel}`
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

function installedPluginItemsFromSummary(summary = "") {
  const lines = String(summary || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pluginLines = lines
    .filter((line) => /^>\s+/.test(line))
    .map((line) => line.replace(/^>\s+/, "").trim())
    .filter(Boolean);
  if (pluginLines.length) return pluginLines;
  return lines
    .filter((line) => !/^(installed plugins:?|version:|scope:|status:)/i.test(line))
    .filter((line) => !/no plugins installed|claude plugin install/i.test(line))
    .filter((line) => !/^[-=]+$/.test(line));
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

function skillInstallTemplate(name = "") {
  const title = String(name || "").trim() || "my-skill";
  return [
    `# ${title}`,
    "",
    "## When to use",
    "Use this skill when the user asks for a clearly related workflow.",
    "",
    "## Instructions",
    "- Clarify the user's goal when required.",
    "- Prefer project-local files and portable paths.",
    "- Keep changes focused and verify the result.",
    "",
  ].join("\n");
}

function setSkillInstallStatus(message = "", ok = true) {
  if (!skillInstallStatus) return;
  skillInstallStatus.textContent = message;
  skillInstallStatus.dataset.state = ok ? "ok" : "error";
}

function setPluginInstallStatus(message = "", ok = true) {
  if (!pluginInstallStatus) return;
  pluginInstallStatus.textContent = message;
  pluginInstallStatus.dataset.state = ok ? "ok" : "error";
}

async function installPluginFromPanel() {
  if (!pluginInput || !pluginPromptBtn) return;
  const plugin = pluginInput.value.trim();
  if (!plugin) {
    setPluginInstallStatus("请先填写插件名称", false);
    pluginInput.focus();
    return;
  }
  pluginPromptBtn.disabled = true;
  setPluginInstallStatus("正在通过便携式 Claude Code 安装插件...");
  try {
    const res = await fetch("/api/plugins/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plugin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || "插件安装失败");
    }
    setPluginInstallStatus(`已安装插件：${data.plugin || plugin}`);
    if (data.plugins?.summary) pluginSummary.textContent = data.plugins.summary;
    await openInstalledExtensionsView();
  } catch (error) {
    setPluginInstallStatus(error.message || "插件安装失败", false);
  } finally {
    pluginPromptBtn.disabled = false;
  }
}

function setPagePluginInstallStatus(message = "", ok = true) {
  if (!pagePluginInstallStatus) return;
  pagePluginInstallStatus.textContent = message;
  pagePluginInstallStatus.dataset.state = ok ? "ok" : "error";
}

async function installPluginFromExtensionsPage() {
  if (!pagePluginInput || !pagePluginInstallBtn) return;
  const plugin = pagePluginInput.value.trim();
  if (!plugin) {
    setPagePluginInstallStatus("请先填写插件名称", false);
    pagePluginInput.focus();
    return;
  }
  pagePluginInstallBtn.disabled = true;
  setPagePluginInstallStatus("正在通过便携式 Claude Code 安装插件...");
  try {
    const res = await fetch("/api/plugins/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plugin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const methodHint = res.status === 405 ? "插件安装接口请求方法不匹配，请重启 Claude Code 面板服务后再试。" : "";
      throw new Error(data.error || methodHint || "插件安装失败");
    }
    setPagePluginInstallStatus(`已安装插件：${data.plugin || plugin}`);
    if (data.plugins?.summary) pluginSummary.textContent = data.plugins.summary;
    await openInstalledExtensionsView();
  } catch (error) {
    setPagePluginInstallStatus(error.message || "插件安装失败", false);
  } finally {
    pagePluginInstallBtn.disabled = false;
  }
}

async function installSkillFromPanel() {
  if (!skillInstallName || !skillInstallBtn) return;
  const name = skillInstallName.value.trim();
  if (!name) {
    setSkillInstallStatus("请先填写 Skill 名称", false);
    skillInstallName.focus();
    return;
  }
  skillInstallBtn.disabled = true;
  setSkillInstallStatus("正在安装 Skill...");
  try {
    const res = await fetch("/api/skills/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        content: skillInstallContent?.value || "",
        overwrite: Boolean(skillInstallOverwrite?.checked),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || "Skill 安装失败");
    }
    setSkillInstallStatus(`已安装 Skill：${data.name || name}`);
    if (skillInstallContent) skillInstallContent.value = "";
    await openInstalledExtensionsView();
  } catch (error) {
    setSkillInstallStatus(error.message || "Skill 安装失败", false);
  } finally {
    skillInstallBtn.disabled = false;
  }
}

function installedExtensionItems(status = latestStatus || {}) {
  const pluginItems = installedPluginItemsFromSummary(status.plugins?.summary);
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
  const pluginLines = installedPluginItemsFromSummary(status.plugins?.summary);
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
    resizePromptInput();
    closeSlashCommandMenu();
    return;
  }
  if (createTemporaryTaskFromPrompt(text, options.source)) {
    promptInput.value = "";
    resizePromptInput();
    closeSlashCommandMenu();
    return;
  }
  if (tryCreateScheduleFromPrompt(text, { source: options.source || "chat_input" })) {
    promptInput.value = "";
    resizePromptInput();
    return;
  }
  await startRun(text, options.source === "voice" ? { voiceInput: true } : {});
}

async function handleVoiceTranscript(text) {
  const transcriptText = String(text || "").trim();
  if (!transcriptText) return;
  appendVoiceText(transcriptText);
  addMessage("system", "语音对话", `已识别：${transcriptText}\n文字已放入输入框，可修改后手动发送。`);
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
    addMessage("system", "语音对话", "正在听你说话。停止后会把文字放入输入框，可修改后再发送。");
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
  const stored = window.localStorage.getItem(rightPanelCollapsedKey);
  const collapsed = stored === null ? true : stored === "true";
  if (stored === null) window.localStorage.setItem(rightPanelCollapsedKey, "true");
  document.body.classList.toggle("right-panel-collapsed", collapsed);
  rightPanelToggleBtn.classList.toggle("is-active", collapsed);
  rightPanelToggleBtn.title = collapsed ? "显示右侧边栏" : "隐藏右侧边栏";
  rightPanelToggleBtn.setAttribute("aria-label", rightPanelToggleBtn.title);
  rightPanelToggleBtn.setAttribute("aria-pressed", String(!collapsed));
}

function toggleRightPanel() {
  const collapsed = !document.body.classList.contains("right-panel-collapsed");
  window.localStorage.setItem(rightPanelCollapsedKey, String(collapsed));
  applyRightPanelState();
}

function closeRightPanel() {
  window.localStorage.setItem(rightPanelCollapsedKey, "true");
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
  resizePromptInput();
  setRunState("idle", "准备就绪");
  setEmptyState();
  promptInput.focus();
}

function submitPromptFromButton() {
  promptForm.requestSubmit();
}

async function startNativeClaudeTerminal({ overlay } = {}) {
  if (overlay) setConsoleSwitchProgress(overlay, 35);
  const cwd = projectSelect?.value || "";
  const response = await fetch("/api/native-claude/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.message || "Claude Code 原生终端启动失败");
  }
  nativeClaudeRunning = true;
  setRunning(Boolean(runController));
  if (overlay) {
    setConsoleSwitchProgress(overlay, 100);
    consoleSwitchProgressTimer = setTimeout(clearConsoleSwitchProgress, 520);
  }
  addMessage("system", "Claude Code 原生终端", payload.message || "已打开 Claude Code 原生终端。");
  return payload;
}

async function openNativeClaudeTerminalFromShortcut() {
  const overlay = showConsoleSwitchProgress("/h/claude-code");
  try {
    await startNativeClaudeTerminal({ overlay });
    consoleSwitchProgressTimer = setTimeout(clearConsoleSwitchProgress, 520);
  } catch (error) {
    clearConsoleSwitchProgress();
    addMessage("error", "Claude Code 原生终端", error.message || "Claude Code 原生终端启动失败");
  }
}

async function stopNativeClaudeTerminal({ silent = false } = {}) {
  const response = await fetch("/api/native-claude/stop", { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  nativeClaudeRunning = false;
  setRunning(Boolean(runController));
  if (!response.ok || payload.ok === false) {
    const message = payload.error || payload.message || "Claude Code 原生终端关闭失败";
    if (!silent) addMessage("error", "Claude Code 原生终端", message);
    throw new Error(message);
  }
  if (!silent) addMessage("system", "Claude Code 原生终端", payload.message || "Claude Code 原生终端已关闭。");
  return payload;
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

const manualScheduleSources = new Set(["chat_input", "user_message", "manual_chat"]);

function isManualScheduleCommand(text, source = "chat_input") {
  return manualScheduleSources.has(String(source || "")) && String(text || "").trim() === "定时任务";
}

function tryCreateScheduleFromPrompt(text, options = {}) {
  const source = options.source || "chat_input";
  const prompt = String(text || "").trim();
  if (!isManualScheduleCommand(prompt, source)) return false;
  if (typeof scheduleNextDefaultTime === "function") scheduleNextDefaultTime();
  setWorkspaceTab("schedule");
  addMessage("system", "定时任务", "已打开定时任务面板。请填写任务名称、执行时间和指令后保存。");
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
  renderTemporaryTask();
  if (!automaticScheduleExecutionEnabled) return;
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
    if (text.trim()) console.warn("[ClaudeCode stderr]", text);
  } else if (event === "error") {
    flushAssistantTextBuffer();
    if (activeAssistantMessage?.body) {
      renderCompactClaudePanelMessage(formatClaudeCodeToolCallForZh(activeAssistantMessage.rawText || ""), activeAssistantMessage.body, { streaming: false });
    }
    setRunState("error", "运行异常");
    addMessage("error", "运行异常", payload.text || "执行失败");
    appendActiveRunConversationMessage("error", "运行异常", payload.text || "执行失败");
    updateActiveRunConversation({ status: "运行异常", result: payload.text || "执行失败" });
  } else if (event === "done") {
    flushAssistantTextBuffer();
    if (activeAssistantMessage?.body) {
      renderCompactClaudePanelMessage(formatClaudeCodeToolCallForZh(activeAssistantMessage.rawText || ""), activeAssistantMessage.body, { streaming: false });
    }
    removeRuntimeSummaryMessages();
    const replyText = activeAssistantMessage?.body?.dataset?.visibleText
      || activeAssistantMessage?.body?.querySelector(".assistant-compact-message__content")?.textContent
      || "";
    setRunState("done", "已完成");
    appendActiveRunConversationMessage("assistant", "Claude", replyText || "已完成。");
    updateActiveRunConversation({
      status: "已完成",
      result: replyText,
    });
    if (voiceReplyPending) {
      speakVoiceReply(replyText || "已完成。");
      voiceReplyPending = false;
    }
  } else if (event === "meta") {
    if (payload.sessionId) {
      updateActiveRunConversation({
        nativeSessionId: payload.sessionId,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

function attachmentSummary() {
  if (!selectedAttachments.length) return "";
  const lines = selectedAttachments
    .map((item) => {
      const status = item.path ? `uploaded local path: ${item.path}` : "frontend metadata only; file content was not uploaded";
      return `- ${item.name} (${formatFileSize(item.size)}, ${item.kind || "file"}): ${status}`;
    })
    .join("\n");
  return [
    "",
    "",
    "[本次对话包含本地附件元信息。图片可能包含本机上传路径；非图片文件只保留前端元信息，尚未持久化或上传。除非存在可读路径，否则不要声称已经读取文件内容。]",
    lines,
  ].join("\n");
}

function clearAttachments() {
  for (const item of selectedAttachments) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
  selectedAttachments = [];
  if (imageUploadInput) imageUploadInput.value = "";
  renderAttachmentPreview();
}

function formatFileSize(size) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImageFile(file) {
  return String(file?.type || "").startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file?.name || "");
}

function isSupportedAttachmentFile(file) {
  if (!file) return false;
  if (isImageFile(file)) return true;
  const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  return attachmentExtensions.has(ext);
}

function makeAttachmentMetadata(item) {
  return {
    id: item.id,
    name: item.name,
    size: item.size,
    type: item.type,
    lastModified: item.lastModified,
    kind: item.kind || (String(item.type || "").startsWith("image/") ? "image" : "file"),
    path: item.path || "",
    localPreviewUrl: item.previewUrl || "",
    uploaded: Boolean(item.path),
    localOnly: !item.path,
  };
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
  overrides = implicitBrowserRunOverrides(prompt, overrides);
  const projectReady = await ensureProjectForPrompt(prompt, overrides);
  if (!projectReady) return;
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
  const outgoingAttachments = selectedAttachments.map(makeAttachmentMetadata);
  inspectPromptForPetMood(prompt);
  createOrUpdateProjectConversation(finalPrompt, prompt);
  activeRunConversationId = currentConversationId;
  appendActiveRunConversationMessage("user", "你", finalPrompt);
  addMessage("user", "你", finalPrompt);
  if (selectedAttachments.length) {
    addMessage("system", "附件", "已把附件元信息随本次消息发送给 Claude Code；未上传的文件只保留前端元信息。");
  }
  modelInput.value = modelInput.value.trim();
  window.localStorage.setItem(modelStorageKey, modelInput.value);

  runController = new AbortController();
  let runTimedOut = false;
  const runTimeoutTimer = setTimeout(() => {
    if (!runController) return;
    runTimedOut = true;
    runController.abort();
  }, CLAUDE_RUN_TIMEOUT_MS);
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
    const activeConversation = currentConversationId ? getConversation(currentConversationId) : null;
    const resumeSessionId = activeConversation?.nativeSessionId || "";
    const continueSession = Object.prototype.hasOwnProperty.call(overrides, "continueSession")
      ? Boolean(overrides.continueSession)
      : Boolean(resumeSessionId);
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: finalPrompt,
        agentName: "claudecode",
        agent_name: "claudecode",
        cwd: projectSelect.value,
        model: modelInput.value,
        mode: overrides.mode || permissionConfig.cliMode,
        permissionProfile: overrides.permissionProfile || activeMode,
        toolProfile: overrides.toolProfile || permissionConfig.toolProfile,
        browserAccess,
        riskAccepted,
        continueSession,
        resumeSessionId,
        attachments: outgoingAttachments,
        ...overrides,
      }),
      signal: runController.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "请求失败" }));
      const body = formatErrorHelp({ code: error.code || String(response.status), message: error.error || error.message, suggestion: error.suggestion }, response.status);
      setRunState("error", "运行异常");
      addMessage("error", "运行异常", body);
      appendActiveRunConversationMessage("error", "运行异常", body);
      updateActiveRunConversation({ status: "运行异常", result: body });
      return;
    }

    clearAttachments();
    promptInput.value = "";
    resizePromptInput();
    await readSse(response);
  } catch (error) {
    if (error.name === "AbortError" && runTimedOut) {
      const timeoutMessage = "ClaudeCode request timed out before a final response. Please check model configuration, relay connectivity, or retry.";
      setRunState("error", "Request timed out");
      addMessage("error", "Request timed out", timeoutMessage);
      appendActiveRunConversationMessage("error", "Request timed out", timeoutMessage);
      updateActiveRunConversation({ status: "Request timed out", result: timeoutMessage });
    } else if (error.name !== "AbortError") {
      setRunState("error", "连接中断");
      addMessage("error", "连接中断", error.message);
      appendActiveRunConversationMessage("error", "连接中断", error.message);
      updateActiveRunConversation({ status: "连接中断", result: error.message });
    } else {
      setRunState("stopped", "已停止");
      addMessage("system", "已停止", "请求已取消。");
      updateActiveRunConversation({ status: "已停止" });
    }
  } finally {
    clearTimeout(runTimeoutTimer);
    flushAssistantTextBuffer();
    if (runController && voiceReplyPending && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    voiceReplyPending = false;
    clearTimeout(petSlowTimer);
    petSlowTimer = null;
    runController = null;
    activeRunConversationId = null;
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
  const prompt = promptInput.value.trim() || (selectedAttachments.length ? "请查看我添加的附件。" : "");
  if (!prompt) return;
  const authorizationChoice = typedToolAuthorizationChoice(prompt);
  if (authorizationChoice) {
    promptInput.value = "";
    resizePromptInput();
    closeSlashCommandMenu();
    await submitToolAuthorization(authorizationChoice);
    return;
  }
  if (await executeSlashCommand(prompt)) {
    promptInput.value = "";
    resizePromptInput();
    closeSlashCommandMenu();
    return;
  }
  if (createTemporaryTaskFromPrompt(prompt)) {
    promptInput.value = "";
    resizePromptInput();
    closeSlashCommandMenu();
    return;
  }
  if (tryCreateScheduleFromPrompt(prompt, { source: "chat_input" })) {
    promptInput.value = "";
    resizePromptInput();
    return;
  }
  await startRun(prompt);
}

function fillPrompt(text) {
  promptInput.value = text;
  resizePromptInput();
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
  if (selectedAttachments.length) {
    const label = document.createElement("span");
    label.className = "attachment-chip";
    label.textContent = "已添加文件";
    attachmentPreview.append(label);
  }
  for (const attachment of selectedAttachments) {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    if (attachment.kind === "image" && attachment.previewUrl) {
      const image = document.createElement("img");
      image.src = attachment.previewUrl;
      image.alt = attachment.name;
      chip.append(image);
    }

    const text = document.createElement("span");
    text.textContent = `${attachment.name} · ${formatFileSize(attachment.size)}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", "移除附件");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      selectedAttachments = selectedAttachments.filter((item) => item.id !== attachment.id);
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      renderAttachmentPreview();
    });

    chip.append(text, remove);
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

function clipboardImageFiles(event) {
  return Array.from(event?.clipboardData?.items || [])
    .filter((item) => String(item.type || "").startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
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

async function addAttachmentFile(file) {
  if (!isSupportedAttachmentFile(file)) {
    addMessage("error", "附件类型不支持", `${file.name} 暂不支持添加。`);
    return;
  }
  if (file.size > maxUploadBytes) {
    addMessage("error", "文件过大", `${file.name} 文件过大，最大支持 25MB`);
    return;
  }

  const isImage = isImageFile(file);
  const previewUrl = isImage ? URL.createObjectURL(file) : "";

  if (!isImage) {
    selectedAttachments.push({
      id: makeId(),
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      lastModified: file.lastModified,
      kind: "file",
      file,
      previewUrl,
      path: "",
      localOnly: true,
    });
    return;
  }

  try {
    const uploaded = await uploadImageFile(file);
    selectedAttachments.push({
      id: uploaded.id || makeId(),
      name: uploaded.name || file.name,
      size: uploaded.size || file.size,
      type: uploaded.mimeType || file.type,
      lastModified: file.lastModified,
      kind: "image",
      file,
      path: uploaded.path || "",
      previewUrl,
      localOnly: !uploaded.path,
    });
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    addMessage("error", "图片上传失败", error.message || "图片上传失败");
  }
}

async function handleAttachmentFiles(files) {
  const list = Array.from(files || []);
  for (const file of list) {
    await addAttachmentFile(file);
  }
  if (imageUploadInput) imageUploadInput.value = "";
  renderAttachmentPreview();
}

async function handleImageUpload() {
  const files = Array.from(imageUploadInput.files || []);
  await handleAttachmentFiles(files);
}

async function handleImagePaste(event) {
  const files = clipboardImageFiles(event);
  if (!files.length) return;
  event.preventDefault();
  await handleAttachmentFiles(files);
}

async function handleComposerDrop(event) {
  const files = Array.from(event?.dataTransfer?.files || []);
  if (!files.length) return;
  event.preventDefault();
  composerDragDepth = 0;
  setComposerDragActive(false);
  await handleAttachmentFiles(files);
}

function setComposerDragActive(active) {
  if (!composerInputWrap) return;
  composerInputWrap.classList.toggle("is-drag-over", Boolean(active));
  composerInputWrap.style.outline = active ? "1px solid rgba(245, 158, 11, 0.75)" : "";
  composerInputWrap.style.background = active ? "rgba(245, 158, 11, 0.08)" : "";
}

function hasDraggedFiles(event) {
  return Array.from(event?.dataTransfer?.types || []).includes("Files");
}

function resizePromptInput() {
  if (!promptInput) return;
  const style = window.getComputedStyle(promptInput);
  const lineHeight = Number.parseFloat(style.lineHeight) || 23;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const maxHeight = Math.ceil(lineHeight * 3 + paddingTop + paddingBottom);

  promptInput.style.height = "auto";
  promptInput.style.maxHeight = `${maxHeight}px`;
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, maxHeight)}px`;
  promptInput.style.overflowY = promptInput.scrollHeight > maxHeight ? "auto" : "hidden";
}

function requestScreenshot() {
  fetch("/api/screenshot", { cache: "no-store" }).catch(() => {});
  addMessage("system", "截图", "已触发截图快捷键；/api/screenshot 接口已预留，后续可扩展保存本地、复制截图或上传截图。");
}

async function copyCurrentConversation() {
  const conversation = currentConversationId ? getConversation(currentConversationId) : conversations[0];
  if (!conversation) return;
  const messages = normalizeConversationMessages(conversation.messages || []);
  const transcriptText = messages.length
    ? messages.map((message) => `## ${message.title || message.role}\n\n${message.content}`).join("\n\n")
    : `${conversation.prompt}\n\n${conversation.result || ""}`;
  const content = `# ${conversation.title}\n\n${transcriptText}`;
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
  const icon = menuIcon("pin").replace("<svg ", '<svg class="quick-icon" ');
  button.innerHTML = `${icon}<span>高级访问模板</span>`;
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
stopBtn.addEventListener("click", async () => {
  const hadRun = Boolean(runController);
  if (runController) runController.abort();
  try {
    await stopNativeClaudeTerminal({ silent: hadRun && !nativeClaudeRunning });
  } catch {
    // stopNativeClaudeTerminal already reports the visible error.
  }
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
rightPanelCloseBtn?.addEventListener("click", closeRightPanel);
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
  const nativeButton = event.target.closest("[data-native-claude]");
  if (nativeButton) {
    event.preventDefault();
    event.stopPropagation();
    openNativeClaudeTerminalFromShortcut();
    return;
  }

  const button = event.target.closest("[data-prompt]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  runQuickCommand(button).catch((error) => {
    addMessage("error", "快捷指令", error.message || "快捷指令发送失败");
  });
});
pluginPromptBtn.addEventListener("click", () => {
  installPluginFromPanel().catch((error) => {
    setPluginInstallStatus(error.message || "插件安装失败", false);
  });
});
skillPromptBtn.addEventListener("click", () => {
  if (skillInstallName && skillInput?.value.trim()) {
    skillInstallName.value = skillInput.value.trim();
  }
  openInstalledExtensionsView();
});
installedExtensionsBtn?.addEventListener("click", openInstalledExtensionsView);
extensionsPageCloseBtn?.addEventListener("click", closeInstalledExtensionsPage);
pagePluginInstallBtn?.addEventListener("click", () => {
  installPluginFromExtensionsPage().catch((error) => {
    setPagePluginInstallStatus(error.message || "插件安装失败", false);
  });
});
skillInstallTemplateBtn?.addEventListener("click", () => {
  if (skillInstallContent) skillInstallContent.value = skillInstallTemplate(skillInstallName?.value || "");
  setSkillInstallStatus("已填入基础模板，可按需修改后安装");
});
skillInstallBtn?.addEventListener("click", () => {
  installSkillFromPanel().catch((error) => {
    setSkillInstallStatus(error.message || "Skill 安装失败", false);
  });
});
voiceModeBtn?.addEventListener("click", toggleVoiceMode);
temporaryTaskCancelBtn?.addEventListener("click", cancelTemporaryTask);
if (imageUploadInput) {
  imageUploadInput.accept = attachmentAccept;
  imageUploadInput.multiple = true;
}
if (promptForm && imageUploadInput && !$("#attachmentPickerBtn")) {
  const attachmentPickerBtn = document.createElement("button");
  attachmentPickerBtn.id = "attachmentPickerBtn";
  attachmentPickerBtn.className = "attachment-entry";
  attachmentPickerBtn.type = "button";
  attachmentPickerBtn.title = "选择图片或文件";
  attachmentPickerBtn.setAttribute("aria-label", "选择图片或文件");
  attachmentPickerBtn.textContent = "+";
  promptForm.insertBefore(attachmentPickerBtn, voiceModeBtn || composerInputWrap);
  attachmentPickerBtn.addEventListener("click", () => imageUploadInput.click());
}
imageUploadInput?.addEventListener("change", handleImageUpload);
document.addEventListener("paste", handleImagePaste, true);
composerInputWrap?.addEventListener("dragenter", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  composerDragDepth += 1;
  setComposerDragActive(true);
});
composerInputWrap?.addEventListener("dragover", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  setComposerDragActive(true);
});
composerInputWrap?.addEventListener("dragleave", (event) => {
  if (!hasDraggedFiles(event)) return;
  composerDragDepth = Math.max(0, composerDragDepth - 1);
  if (composerDragDepth === 0) setComposerDragActive(false);
});
composerInputWrap?.addEventListener("drop", (event) => {
  handleComposerDrop(event).catch((error) => addMessage("error", "附件", error.message || "附件添加失败"));
});

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
  if (event.isComposing || event.keyCode === 229) return;
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
  resizePromptInput();
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

const introStarted = initIntroVideo();
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
removeRuntimeSummaryMessages();
renderAutomations();
renderSchedules();
renderTemporaryTask();
renderConfigChecklist();
applyCompactRightPanelDefaults();
renderAccountMenu();
applyPetSyncUi();
resizePromptInput();
loadFeishuTutorialStatus();
loadVoiceCapabilities().catch(() => updateVoiceButtonHint());
setInterval(checkSchedules, 30000);
setInterval(renderTemporaryTask, 30000);
setInterval(checkWorkRestReminder, 60000);
introStarted.finally(() => {
  if (!restoreLastConversation()) renderConversations();
});
loadAnnouncement().catch(() => renderAnnouncement(fallbackAnnouncementText));
loadStatus().catch((error) => addMessage("error", "错误", error.message));
