import { buildStage3Plan } from "./planner.js";
import {
  Stage3ActionType,
  Stage3MessageType,
  createId,
  createPlatformConfirmationCard,
  createPlatformPrepCard,
  createStage3Status,
} from "./types.js";

const FORBIDDEN_FINAL_ACTIONS = new Set([
  Stage3ActionType.CLICK_PUBLISH,
  Stage3ActionType.PUBLISH_CONTENT,
  Stage3ActionType.SUBMIT_LISTING,
  Stage3ActionType.LIST_PRODUCT,
  Stage3ActionType.SUBMIT_REVIEW,
]);

export async function runStage3PublishPrep(input = {}, context = {}) {
  const emit = createEmitter(context);
  const browser = context.browser || {};
  const query = input.query || input.userText || input.prompt || "";
  const plan = buildStage3Plan({
    userText: query,
    intent: input.intent,
    platforms: input.platforms,
    mediaFiles: input.mediaFiles,
    product: input.product,
    keywords: input.keywords,
    stage2Draft: input.stage2Draft,
  });

  if (!plan.matched) {
    return {
      ok: false,
      blocked: false,
      reason: plan.reason,
      state: {},
    };
  }

  if (plan.unsafe) {
    emit(createUnsafeConfirmation(query, plan));
    return {
      ok: false,
      blocked: true,
      reason: plan.reason,
      state: {},
    };
  }

  emit(createStage3Status(`正在执行电商 1.0.2 第三阶段：多平台发布/商品准备到确认前。平台：${plan.platforms.join("、")}`));

  const state = {
    query,
    intent: plan.intent,
    platformStates: new Map(),
    browserWarnings: [],
  };

  for (const platformPlan of plan.platformPlans) {
    state.platformStates.set(platformPlan.platform, {
      ...platformPlan,
      visibleText: null,
      previewScreenshot: null,
      finalButtonFound: false,
      missingUrl: !platformPlan.config.publishUrl,
      warnings: [],
    });

    for (const step of platformPlan.steps) {
      if (FORBIDDEN_FINAL_ACTIONS.has(step.type)) {
        emit(createStage3Status(`已拦截最终动作：${step.type}。第三阶段不会自动发布、提交或上架。`));
        continue;
      }
      await executeStage3Step(step, {
        emit,
        browser,
        state,
      });
    }
  }

  emit(createStage3Status("第三阶段准备已完成：已停在最终按钮前，没有点击发布、提交审核、上架、付款、评论或私信。"));

  return {
    ok: true,
    blocked: false,
    intent: plan.intent,
    state: {
      ...state,
      platformStates: Object.fromEntries(state.platformStates.entries()),
    },
  };
}

async function executeStage3Step(step, { emit, browser, state }) {
  const platformState = state.platformStates.get(step.platform);

  switch (step.type) {
    case Stage3ActionType.STATUS: {
      if (step.missingUrl && platformState) platformState.missingUrl = true;
      emit(createStage3Status(step.content || step.label || "正在处理..."));
      return null;
    }

    case Stage3ActionType.OPEN_PLATFORM_PAGE: {
      emit(createStage3Status(`正在打开${step.platformLabel}发布/商品编辑页...`));
      const result = await safeCall(browser.open, [step.url], {
        ok: false,
        url: step.url,
        error: "BROWSER_OPEN_NOT_CONNECTED",
      });
      rememberWarning(platformState, result);
      const wait = await safeCall(browser.waitForLoad, [], {
        ok: false,
        error: "BROWSER_WAIT_FOR_LOAD_NOT_CONNECTED",
      });
      rememberWarning(platformState, wait);
      return result;
    }

    case Stage3ActionType.READ_VISIBLE_TEXT: {
      emit(createStage3Status(`正在读取${step.platformLabel}页面可见文字...`));
      const result = await safeCall(browser.readVisibleText, [], {
        text: "",
        title: "",
        url: platformState?.config?.publishUrl || "",
        error: "BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED",
      });
      if (platformState) platformState.visibleText = result;
      rememberWarning(platformState, result);
      return result;
    }

    case Stage3ActionType.UPLOAD_MEDIA:
    case Stage3ActionType.FILL_PRODUCT_IMAGES: {
      const files = step.files || platformState?.mediaFiles || [];
      emit(createStage3Status(`正在为${step.platformLabel}上传素材/商品图...`));
      const result = await safeCall(browser.uploadMediaByHints, [{
        files,
        hints: step.hints || [],
        platform: step.platform,
      }], {
        ok: false,
        files,
        platform: step.platform,
        error: "BROWSER_UPLOAD_MEDIA_NOT_CONNECTED",
      });
      rememberWarning(platformState, result);
      return result;
    }

    case Stage3ActionType.FILL_TITLE:
    case Stage3ActionType.FILL_DESCRIPTION:
    case Stage3ActionType.FILL_TAGS:
    case Stage3ActionType.FILL_PRODUCT_TITLE:
    case Stage3ActionType.FILL_PRODUCT_DESCRIPTION:
    case Stage3ActionType.FILL_PRODUCT_SELLING_POINTS:
    case Stage3ActionType.FILL_PRODUCT_KEYWORDS: {
      emit(createStage3Status(`正在填写${step.platformLabel}字段：${fieldLabel(step.type)}...`));
      const result = await safeCall(browser.typeIntoByHints, [{
        hints: step.hints || [],
        value: step.value || "",
        platform: step.platform,
        field: step.type,
      }], {
        ok: false,
        field: step.type,
        platform: step.platform,
        error: "BROWSER_TYPE_INTO_NOT_CONNECTED",
      });
      rememberWarning(platformState, result);
      return result;
    }

    case Stage3ActionType.PRICE_INVENTORY_PLACEHOLDER: {
      emit(createStage3Status(`${step.platformLabel}价格和库存不会自动填写，请在确认后手动处理。`));
      return null;
    }

    case Stage3ActionType.SELECT_COVER_PLACEHOLDER: {
      emit(createStage3Status(`${step.platformLabel}封面选择暂作为占位，不自动裁剪或自动确认封面。`));
      return null;
    }

    case Stage3ActionType.CAPTURE_PREVIEW: {
      emit(createStage3Status(`正在截图${step.platformLabel}最终操作前页面...`));
      const result = await safeCall(browser.captureScreenshot, [], null);
      if (platformState) platformState.previewScreenshot = result;
      if (!result) {
        rememberWarning(platformState, { error: "BROWSER_CAPTURE_SCREENSHOT_NOT_CONNECTED" });
        emit({
          role: "assistant",
          type: Stage3MessageType.ERROR,
          content: `${step.platformLabel}截图能力暂未接入，已继续生成准备卡和确认卡。`,
          createdAt: Date.now(),
        });
      }
      return result;
    }

    case Stage3ActionType.STOP_BEFORE_FINAL_SUBMIT: {
      emit(createStage3Status(`正在定位${step.platformLabel}最终按钮，但不会点击...`));
      const result = await safeCall(browser.findByTextHints, [{
        hints: step.hints || [],
        platform: step.platform,
      }], {
        found: false,
        platform: step.platform,
        error: "BROWSER_FIND_FINAL_BUTTON_NOT_CONNECTED",
      });
      if (platformState) platformState.finalButtonFound = Boolean(result?.found);
      rememberWarning(platformState, result);
      emit(createStage3Status(`${step.platformLabel}已停在最终按钮前；后续发布/提交/上架必须由你手动确认。`));
      return result;
    }

    case Stage3ActionType.CREATE_PREP_CARD: {
      const card = createPrepCard(platformState);
      emit({
        role: "assistant",
        type: Stage3MessageType.PLATFORM_PREP_CARD,
        card,
        createdAt: Date.now(),
      });
      return card;
    }

    case Stage3ActionType.CREATE_CONFIRMATION_CARD: {
      const card = createConfirmationCard(platformState);
      emit({
        role: "assistant",
        type: Stage3MessageType.PLATFORM_CONFIRMATION_CARD,
        card,
        createdAt: Date.now(),
      });
      return card;
    }

    default: {
      emit(createStage3Status(`第三阶段暂不支持该动作：${step.type || "unknown"}`));
      return null;
    }
  }
}

function createPrepCard(platformState = {}) {
  const draft = platformState.draft || {};
  return createPlatformPrepCard({
    platform: platformState.platform,
    platformLabel: platformState.platformLabel,
    platformKind: platformState.kind,
    mediaFiles: platformState.mediaFiles || [],
    mediaType: platformState.mediaType,
    title: draft.title || "",
    description: draft.description || "",
    tags: draft.tags || [],
    sellingPoints: draft.sellingPoints || [],
    productKeywords: draft.productKeywords || [],
    draft,
    previewScreenshot: platformState.previewScreenshot,
    publishUrl: platformState.config?.publishUrl || "",
    finalButtonFound: Boolean(platformState.finalButtonFound),
    note: buildCardNote(platformState),
  });
}

function createConfirmationCard(platformState = {}) {
  const draft = platformState.draft || {};
  return createPlatformConfirmationCard({
    platform: platformState.platform,
    platformLabel: platformState.platformLabel,
    platformKind: platformState.kind,
    title: `${platformState.platformLabel || "平台"}最终操作前确认`,
    description: "内容/商品资料已经准备到最终按钮前。第三阶段不会自动点击发布、提交审核或上架。",
    tags: draft.tags || [],
    sellingPoints: draft.sellingPoints || [],
    mediaFiles: platformState.mediaFiles || [],
    previewScreenshot: platformState.previewScreenshot,
    action: {
      type: platformState.kind === "shop" ? Stage3ActionType.SUBMIT_LISTING : Stage3ActionType.PUBLISH_CONTENT,
      label: "需要你手动确认的最终动作",
    },
  });
}

function createUnsafeConfirmation(query, plan) {
  return {
    role: "assistant",
    type: "user_confirmation",
    confirmation: {
      id: createId("stage3_block"),
      title: "第三阶段已拦截最终发布/上架动作",
      description: "你的请求包含直接发布、提交审核或上架。第三阶段只能准备到最终按钮前，必须由你手动确认最终动作。",
      platform: (plan.platforms || []).join("、") || "多平台",
      action: {
        type: Stage3ActionType.PUBLISH_CONTENT,
        label: query || "最终发布/上架动作",
      },
      risk: "high",
      createdAt: Date.now(),
    },
    createdAt: Date.now(),
  };
}

function buildCardNote(platformState = {}) {
  const warnings = (platformState.warnings || []).length
    ? `\n占位提示：${Array.from(new Set(platformState.warnings)).join("；")}`
    : "";
  const missing = platformState.missingUrl
    ? "\n发布/商品编辑入口未配置，已按手动打开页面的回退方式继续准备。"
    : "";
  return `已准备到最终按钮前，不会自动发布、提交审核或上架。${missing}${warnings}`.trim();
}

function fieldLabel(type) {
  return {
    [Stage3ActionType.FILL_TITLE]: "标题",
    [Stage3ActionType.FILL_DESCRIPTION]: "简介/正文",
    [Stage3ActionType.FILL_TAGS]: "标签/话题",
    [Stage3ActionType.FILL_PRODUCT_TITLE]: "商品标题",
    [Stage3ActionType.FILL_PRODUCT_DESCRIPTION]: "商品详情",
    [Stage3ActionType.FILL_PRODUCT_SELLING_POINTS]: "商品卖点",
    [Stage3ActionType.FILL_PRODUCT_KEYWORDS]: "商品关键词",
  }[type] || type;
}

function createEmitter(context) {
  const emit = typeof context.emit === "function" ? context.emit : null;
  return (event) => {
    if (emit) emit(event);
  };
}

async function safeCall(fn, args = [], fallback) {
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

function rememberWarning(platformState, result) {
  const error = result?.error;
  if (!error || !platformState) return;
  const readable = {
    BROWSER_OPEN_NOT_CONNECTED: "打开平台页能力未接入",
    BROWSER_WAIT_FOR_LOAD_NOT_CONNECTED: "等待加载能力未接入",
    BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED: "读取页面文字能力未接入",
    BROWSER_UPLOAD_MEDIA_NOT_CONNECTED: "上传素材能力未接入",
    BROWSER_TYPE_INTO_NOT_CONNECTED: "填写字段能力未接入",
    BROWSER_FIND_FINAL_BUTTON_NOT_CONNECTED: "定位最终按钮能力未接入",
    BROWSER_CAPTURE_SCREENSHOT_NOT_CONNECTED: "截图能力未接入",
    BROWSER_CAPABILITY_NOT_CONNECTED: "浏览器能力未接入",
  }[error] || error;

  platformState.warnings.push(readable);
}
