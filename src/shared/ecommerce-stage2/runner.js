import {
  generateLiveScripts,
  generatePlatformDrafts,
  generateProductTitles,
  generateSellingPoints,
  generateShortVideoTitles,
  generateXiaohongshuNotes,
} from "./content-generator.js";
import { buildStage2Plan, detectPlatformFromUserText, detectStage2Intent, extractStage2Keyword } from "./planner.js";
import {
  Stage2ActionType,
  Stage2MessageType,
  createContentDraftCard,
  createStage2Status,
  createTrendInsightCard,
  createVideoLinkCard,
} from "./types.js";
import { buildTrendInsight, guessPlatformFromUrl } from "./trend-parser.js";
import { normalizeEcommerceStageGuardResult } from "../ecommerce/safety-policy.js";

export async function runStage2LowRiskOps(input = {}, context = {}) {
  const emit = createEmitter(context);
  const browser = context.browser || {};
  const hermes = context.hermes || {};
  const query = input.query || input.userText || input.prompt || "";
  const stageGuard = buildStage2GuardMetadata(input);

  if (stageGuard.ecommerce_guard.blocked) {
    emit(createStage2Status("E-Commerce Action Guard blocked this Stage2 action until human confirmation."));
    return {
      ok: false,
      blocked: true,
      reason: stageGuard.ecommerce_guard.reason,
      state: {},
      ...stageGuard,
    };
  }

  const detected = detectStage2Intent(query);

  if (!detected.matched) {
    if (detected.reason === "HIGH_RISK_TEXT_BLOCKED_BY_STAGE1") {
      const blockedGuard = buildStage2GuardMetadata({
        ...input,
        action_type: input.action_type || input.actionType || "publish_video",
        risk_level: "high",
      });
      emit(createStage2Status("第二阶段只允许搜索、读取、截图和生成文案；涉及发布、上架、付款、评论、私信等动作已停止，并交给第一阶段安全确认。"));
      return {
        ok: false,
        blocked: true,
        reason: detected.reason,
        state: {},
        ...blockedGuard,
      };
    }

    return {
      ok: false,
      blocked: false,
      reason: detected.reason,
      state: {},
      ...stageGuard,
    };
  }

  const platform = input.platform || detectPlatformFromUserText(query);
  const keyword = input.keyword || input.category || input.product || extractStage2Keyword(query, platform);
  const plan = buildStage2Plan({
    intent: input.intent || detected.intent,
    userText: query,
    platform,
    keyword,
  });

  const state = {
    query,
    keyword,
    category: input.category || keyword,
    product: input.product || "",
    platform: plan.platform || platform,
    platformLabel: plan.platformLabel || "",
    searchUrl: plan.searchUrl || "",
    missingUrl: Boolean(plan.missingUrl),
    visibleText: null,
    screenshot: null,
    trends: null,
    drafts: null,
    video: null,
    browserWarnings: [],
  };

  emit(createStage2Status(`正在执行电商 1.0.2 第二阶段低风险能力：${plan.platformLabel || plan.intent}`));

  for (const step of plan.steps) {
    await executeStage2Step(step, {
      emit,
      browser,
      hermes,
      state,
    });
  }

  emit(createStage2Status("第二阶段低风险电商分析已完成。未执行发布、上架、付款、评论、私信或下载受限内容。"));

  return {
    ok: true,
    blocked: false,
    intent: plan.intent,
    state,
    ...stageGuard,
  };
}

async function executeStage2Step(step, { emit, browser, hermes, state }) {
  switch (step.type) {
    case Stage2ActionType.STATUS: {
      if (step.missingUrl) state.missingUrl = true;
      emit(createStage2Status(step.content || step.label || "正在处理..."));
      return null;
    }

    case Stage2ActionType.OPEN_PLATFORM_PAGE: {
      emit(createStage2Status(`正在打开${step.platformLabel || "平台"}热词入口...`));
      const result = await safeCallBrowser(browser.open, [step.url], {
        ok: false,
        url: step.url,
        error: "BROWSER_OPEN_NOT_CONNECTED",
      });
      rememberBrowserWarning(state, result);
      return result;
    }

    case Stage2ActionType.FIND_SEARCH_INPUT: {
      emit(createStage2Status("正在查找搜索框..."));
      const result = await safeCallBrowser(browser.findInputByHints, [step.hints || []], {
        ok: false,
        hints: step.hints || [],
        error: "BROWSER_FIND_INPUT_NOT_CONNECTED",
      });
      rememberBrowserWarning(state, result);
      return result;
    }

    case Stage2ActionType.TYPE_KEYWORD: {
      emit(createStage2Status(`正在输入搜索关键词：${step.keyword || state.keyword || state.query}`));
      const result = await safeCallBrowser(browser.type, [step.keyword || state.keyword || state.query], {
        ok: false,
        text: step.keyword || state.keyword || state.query,
        error: "BROWSER_TYPE_NOT_CONNECTED",
      });
      rememberBrowserWarning(state, result);
      return result;
    }

    case Stage2ActionType.PRESS_ENTER: {
      emit(createStage2Status("正在提交搜索..."));
      const result = await safeCallBrowser(browser.press, [step.key || "Enter"], {
        ok: false,
        key: step.key || "Enter",
        error: "BROWSER_PRESS_NOT_CONNECTED",
      });
      rememberBrowserWarning(state, result);
      return result;
    }

    case Stage2ActionType.WAIT_FOR_LOAD: {
      emit(createStage2Status("正在等待结果加载..."));
      const result = await safeCallBrowser(browser.waitForLoad, [], {
        ok: false,
        error: "BROWSER_WAIT_FOR_LOAD_NOT_CONNECTED",
      });
      rememberBrowserWarning(state, result);
      return result;
    }

    case Stage2ActionType.READ_VISIBLE_TEXT: {
      emit(createStage2Status("正在读取页面可见文字..."));
      const result = await safeCallBrowser(browser.readVisibleText, [], {
        text: "",
        url: state.searchUrl || "",
        title: "",
        error: "BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED",
      });
      state.visibleText = result;
      rememberBrowserWarning(state, result);
      return result;
    }

    case Stage2ActionType.CAPTURE_SCREENSHOT: {
      emit(createStage2Status("正在截图结果页..."));
      const result = await safeCallBrowser(browser.captureScreenshot, [], null);
      state.screenshot = result;

      if (!result) {
        rememberBrowserWarning(state, { error: "BROWSER_CAPTURE_SCREENSHOT_NOT_CONNECTED" });
        emit({
          role: "assistant",
          type: Stage2MessageType.ERROR,
          content: "当前浏览器截图能力暂未接入，已继续用页面文字生成低风险热词与文案。",
          createdAt: Date.now(),
        });
      }

      return result;
    }

    case Stage2ActionType.EXTRACT_TRENDS: {
      const visibleText = String(state.visibleText?.text || "");
      const insight = buildTrendInsight({
        text: visibleText,
        query: state.query,
        keyword: state.keyword,
        source: state.platformLabel,
      });
      state.trends = insight;

      emit({
        role: "assistant",
        type: Stage2MessageType.TREND_INSIGHT_CARD,
        card: createTrendInsightCard({
          title: `${state.platformLabel || "平台"}热词洞察`,
          source: state.platformLabel,
          platform: state.platform,
          platformLabel: state.platformLabel,
          query: state.query,
          keyword: state.keyword,
          keywords: insight.keywords,
          groups: insight.groups,
          resultHints: step.resultHints || [],
          screenshot: state.screenshot,
          missingUrl: state.missingUrl,
          note: buildTrendNote(insight.note, state),
        }),
        createdAt: Date.now(),
      });

      return insight;
    }

    case Stage2ActionType.GENERATE_PRODUCT_TITLES:
    case Stage2ActionType.GENERATE_SHORT_VIDEO_TITLES:
    case Stage2ActionType.GENERATE_SELLING_POINTS:
    case Stage2ActionType.GENERATE_PLATFORM_DRAFTS: {
      state.drafts = buildDrafts(state);
      if (step.type !== Stage2ActionType.GENERATE_PLATFORM_DRAFTS) return state.drafts;

      emit({
        role: "assistant",
        type: Stage2MessageType.CONTENT_DRAFT_CARD,
        card: createContentDraftCard({
          title: `${state.platformLabel || "电商"}内容草稿`,
          category: state.category,
          product: state.product,
          query: state.query,
          keyword: state.keyword,
          platform: state.platform,
          platformLabel: state.platformLabel,
          ...state.drafts,
          note: "这些都是低风险文案草稿，只用于参考和复制，不会自动发布、上架或提交。",
        }),
        createdAt: Date.now(),
      });

      return state.drafts;
    }

    case Stage2ActionType.VIDEO_LINK_TO_HERMES: {
      const url = step.url || "";
      const platform = guessPlatformFromUrl(url);
      emit(createStage2Status("正在将视频链接交给 Hermes 拆解能力..."));

      let card;
      if (typeof hermes.decomposeVideoLink === "function") {
        const decomposition = await safeCallBrowser(hermes.decomposeVideoLink, [{ url, platform }], null);
        card = createVideoLinkCard({
          url,
          platform,
          status: decomposition ? "done" : "pending",
          summary: decomposition ? "Hermes 已返回视频链接拆解结果。" : "Hermes 链接读取能力暂未返回结果。",
          decomposition,
          note: "第二阶段只读取和分析链接，不下载、不搬运、不发布。",
        });
      } else {
        card = createVideoLinkCard({
          url,
          platform,
          status: "pending",
          summary: "Hermes 链接读取能力暂未接入，已保留为低风险拆解卡。",
          note: "可以在 Hermes link reader 接入后继续拆解；当前不会下载受限内容。",
        });
      }

      state.video = card;
      emit({
        role: "assistant",
        type: Stage2MessageType.VIDEO_LINK_CARD,
        card,
        createdAt: Date.now(),
      });
      return card;
    }

    case Stage2ActionType.SUMMARIZE_LOW_RISK_RESULT: {
      emit(createStage2Status(buildSafeSummary(state)));
      return null;
    }

    default: {
      emit(createStage2Status(`第二阶段暂不支持该动作：${step.type || "unknown"}`));
      return null;
    }
  }
}

function buildDrafts(state) {
  const keywords = state.trends?.keywords || [];
  const common = {
    keywords,
    category: state.category,
    product: state.product,
    platform: state.platform,
  };

  return {
    productTitles: generateProductTitles(common),
    shortVideoTitles: generateShortVideoTitles(common),
    liveScripts: generateLiveScripts(common),
    xiaohongshuNotes: generateXiaohongshuNotes(common),
    sellingPoints: generateSellingPoints({
      ...common,
      imageText: state.visibleText?.text || "",
    }),
    platformDrafts: generatePlatformDrafts(common),
  };
}

function buildTrendNote(note, state) {
  const warnings = state.browserWarnings.length
    ? `\n浏览器接入提示：${Array.from(new Set(state.browserWarnings)).join("；")}`
    : "";
  const missing = state.missingUrl
    ? "\n该平台热词搜索入口未配置，已回退到读取当前页面 + 截图 + 提取热词。"
    : "";

  return `${note || ""}${missing}${warnings}`.trim();
}

function buildSafeSummary(state) {
  const pieces = [
    "已完成第二阶段低风险处理。",
    state.trends?.keywords?.length ? `提取到 ${state.trends.keywords.length} 个候选热词。` : "暂未提取到明显热词。",
    state.screenshot ? "已尝试回传结果页截图。" : "截图能力未接入或截图失败，已跳过。",
    "没有执行发布、上架、付款、评论、私信、登录、提交审核或下载受限内容。",
  ];

  return pieces.join("\n");
}

function createEmitter(context) {
  const emit = typeof context.emit === "function" ? context.emit : null;

  return (event) => {
    if (!emit) return;
    emit(event);
  };
}

function buildStage2GuardMetadata(input = {}) {
  return normalizeEcommerceStageGuardResult({
    ...input,
    stage: "stage2",
    action_type: input.action_type || input.actionType || "generate_product_suggestion",
    text: input.query || input.userText || input.prompt || "",
    source: "ecommerce.stage2.runner",
  });
}

async function safeCallBrowser(fn, args = [], fallback) {
  if (typeof fn !== "function") {
    return fallback && typeof fallback === "object"
      ? { ...fallback, error: fallback.error || "BROWSER_CAPABILITY_NOT_CONNECTED" }
      : fallback;
  }

  try {
    const result = await fn(...args);
    return result ?? fallback;
  } catch (error) {
    return fallback && typeof fallback === "object"
      ? { ...fallback, error: error?.message || String(error) }
      : fallback;
  }
}

function rememberBrowserWarning(state, result) {
  const error = result?.error;
  if (!error) return;
  const readable = {
    BROWSER_OPEN_NOT_CONNECTED: "浏览器打开能力未接入",
    BROWSER_FIND_INPUT_NOT_CONNECTED: "搜索框定位能力未接入",
    BROWSER_TYPE_NOT_CONNECTED: "输入关键词能力未接入",
    BROWSER_PRESS_NOT_CONNECTED: "键盘提交能力未接入",
    BROWSER_WAIT_FOR_LOAD_NOT_CONNECTED: "等待加载能力未接入",
    BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED: "可见文字读取能力未接入",
    BROWSER_CAPTURE_SCREENSHOT_NOT_CONNECTED: "截图能力未接入",
    BROWSER_CAPABILITY_NOT_CONNECTED: "浏览器能力未接入",
  }[error] || error;

  state.browserWarnings.push(readable);
}
