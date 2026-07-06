import { buildDoudianProductDraft } from "./doudian-draft-builder.js";
import { detectStage4Intent } from "./input-parser.js";
import { buildStage4Plan } from "./planner.js";
import {
  Stage4ActionType,
  Stage4MessageType,
  createDoudianListingPrepCard,
  createId,
  createPriceInventoryConfirmationCard,
  createStage4Status,
  createSubmitReviewConfirmationCard,
} from "./types.js";
import { normalizeEcommerceStageGuardResult } from "../ecommerce/safety-policy.js";

const FORBIDDEN_FINAL_ACTIONS = new Set([
  Stage4ActionType.SUBMIT_REVIEW,
  Stage4ActionType.PUBLISH_PRODUCT,
  Stage4ActionType.LIST_PRODUCT,
  Stage4ActionType.CHANGE_PRICE,
  Stage4ActionType.CHANGE_INVENTORY,
]);

export async function runStage4DoudianListing(input = {}, context = {}) {
  const emit = createEmitter(context);
  const browser = context.browser || {};
  const query = input.query || input.userText || input.prompt || "";
  const stageGuard = buildStage4GuardMetadata(input);

  if (stageGuard.ecommerce_guard.blocked) {
    emit(createUnsafeConfirmation(query));
    return {
      ok: false,
      blocked: true,
      reason: stageGuard.ecommerce_guard.reason,
      state: {},
      ...stageGuard,
    };
  }

  const detected = detectStage4Intent(query);

  if (!detected.matched) {
    return {
      ok: false,
      blocked: false,
      reason: detected.reason,
      state: {},
      ...stageGuard,
    };
  }

  if (detected.unsafe) {
    const blockedGuard = buildStage4GuardMetadata({
      ...input,
      action_type: input.action_type || input.actionType || "product_listing_submit",
      risk_level: "high",
    });
    emit(createUnsafeConfirmation(query));
    return {
      ok: false,
      blocked: true,
      reason: detected.reason,
      state: {},
      ...blockedGuard,
    };
  }

  const plan = buildStage4Plan({
    userText: query,
    intent: input.intent,
    images: input.images,
    detailImages: input.detailImages,
    confirmedPriceInventory: Boolean(input.confirmedPriceInventory),
  });
  const draft = buildDoudianProductDraft({
    query,
    productTitle: input.productTitle || detected.productTitle,
    category: input.category || detected.category,
    keywords: input.keywords || [],
    stage2Draft: input.stage2Draft,
    stage3Draft: input.stage3Draft,
    price: input.price || detected.price,
    inventory: input.inventory || detected.inventory,
  });
  const state = {
    query,
    plan,
    draft,
    images: input.images?.length ? input.images : plan.images || detected.images || [],
    detailImages: input.detailImages?.length ? input.detailImages : plan.detailImages || detected.detailImages || [],
    visibleText: null,
    previewScreenshot: null,
    submitButtonFound: false,
    missingUrl: !plan.createUrl && !plan.manageUrl,
    warnings: [],
  };

  emit(createStage4Status("正在执行电商 1.0.2 第四阶段：抖店商品上架准备到提交审核前。"));

  for (const step of plan.steps) {
    if (FORBIDDEN_FINAL_ACTIONS.has(step.type)) {
      emit(createStage4Status(`已拦截最终动作：${step.type}。第四阶段不会自动提交审核、发布商品或上架。`));
      continue;
    }
    await executeStage4Step(step, {
      emit,
      browser,
      state,
    });
  }

  emit(createStage4Status("第四阶段抖店上架准备已完成：已停在提交审核/发布商品/立即上架按钮前。"));

  return {
    ok: true,
    blocked: false,
    intent: plan.intent,
    state,
    ...stageGuard,
  };
}

async function executeStage4Step(step, { emit, browser, state }) {
  switch (step.type) {
    case Stage4ActionType.STATUS: {
      emit(createStage4Status(step.content || step.label || "正在处理..."));
      return null;
    }

    case Stage4ActionType.OPEN_DOUDIAN_PRODUCT_PAGE: {
      const targetUrl = step.createUrl || step.manageUrl || "";
      if (!targetUrl) {
        emit(createStage4Status("抖店商品发布/管理入口未配置。你可以先手动打开抖店新增商品页面，我会继续尝试填写和截图。"));
        state.missingUrl = true;
        return null;
      }
      emit(createStage4Status("正在打开抖店商品发布/管理页面..."));
      const result = await safeCall(browser.open, [targetUrl], {
        ok: false,
        url: targetUrl,
        error: "BROWSER_OPEN_NOT_CONNECTED",
      });
      rememberWarning(state, result);
      const wait = await safeCall(browser.waitForLoad, [], {
        ok: false,
        error: "BROWSER_WAIT_FOR_LOAD_NOT_CONNECTED",
      });
      rememberWarning(state, wait);
      return result;
    }

    case Stage4ActionType.READ_VISIBLE_TEXT: {
      emit(createStage4Status("正在读取抖店页面可见文字..."));
      const result = await safeCall(browser.readVisibleText, [], {
        text: "",
        title: "",
        url: state.plan.createUrl || state.plan.manageUrl || "",
        error: "BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED",
      });
      state.visibleText = result;
      rememberWarning(state, result);
      return result;
    }

    case Stage4ActionType.ENTER_CREATE_PRODUCT_PAGE: {
      if (step.enabled === false) return null;
      emit(createStage4Status("正在尝试进入抖店新增商品页面..."));
      const result = await safeCall(browser.clickByTextHints, [{
        hints: ["新增商品", "发布商品", "创建商品", "添加商品"],
        note: "只进入新增商品页面，不点击提交审核。",
      }], {
        ok: false,
        error: "BROWSER_CLICK_CREATE_PRODUCT_NOT_CONNECTED",
      });
      rememberWarning(state, result);
      return result;
    }

    case Stage4ActionType.UPLOAD_PRODUCT_IMAGES: {
      emit(createStage4Status("正在上传商品主图/详情图..."));
      const files = Array.from(new Set([...(state.images || []), ...(state.detailImages || [])]));
      const result = await safeCall(browser.uploadMediaByHints, [{
        files,
        hints: step.hints || [],
        platform: "doudian",
      }], {
        ok: false,
        files,
        platform: "doudian",
        error: "BROWSER_UPLOAD_MEDIA_NOT_CONNECTED",
      });
      rememberWarning(state, result);
      return result;
    }

    case Stage4ActionType.FILL_PRODUCT_TITLE: {
      return fillField({ emit, browser, state, step, field: step.type, value: state.draft.productTitle });
    }

    case Stage4ActionType.FILL_PRODUCT_DESCRIPTION: {
      return fillField({ emit, browser, state, step, field: step.type, value: state.draft.description });
    }

    case Stage4ActionType.FILL_PRODUCT_SELLING_POINTS: {
      return fillField({ emit, browser, state, step, field: step.type, value: state.draft.sellingPoints.join("\n") });
    }

    case Stage4ActionType.FILL_PRODUCT_CATEGORY_PLACEHOLDER: {
      emit(createStage4Status(`抖店类目需要按平台规则选择，当前占位：${state.draft.category || "待确认"}。不会自动提交类目。`));
      return null;
    }

    case Stage4ActionType.FILL_PRODUCT_SPECS_PLACEHOLDER: {
      emit(createStage4Status(`规格信息暂作为占位：${state.draft.specs.join("；")}。不会自动确认规格。`));
      return null;
    }

    case Stage4ActionType.REQUIRE_PRICE_INVENTORY_CONFIRMATION: {
      emit({
        role: "assistant",
        type: Stage4MessageType.PRICE_INVENTORY_CONFIRMATION_CARD,
        card: createPriceInventoryConfirmationCard({
          productTitle: state.draft.productTitle,
          price: state.draft.price,
          inventory: state.draft.inventory,
          action: {
            type: Stage4ActionType.FILL_PRICE_INVENTORY_AFTER_CONFIRMATION,
            label: "确认后才允许填写价格/库存",
          },
        }),
        createdAt: Date.now(),
      });
      return null;
    }

    case Stage4ActionType.FILL_PRICE_INVENTORY_AFTER_CONFIRMATION: {
      emit(createStage4Status("已收到价格/库存确认，准备填写价格和库存。"));
      const priceResult = await fillField({
        emit,
        browser,
        state,
        step,
        field: "price",
        value: state.draft.price,
        hints: ["价格", "售价", "商品价格"],
      });
      const inventoryResult = await fillField({
        emit,
        browser,
        state,
        step,
        field: "inventory",
        value: state.draft.inventory,
        hints: ["库存", "数量", "商品库存"],
      });
      return { priceResult, inventoryResult };
    }

    case Stage4ActionType.CAPTURE_LISTING_PREVIEW: {
      emit(createStage4Status("正在截图抖店提交审核前页面..."));
      const result = await safeCall(browser.captureScreenshot, [], null);
      state.previewScreenshot = result;
      if (!result) {
        rememberWarning(state, { error: "BROWSER_CAPTURE_SCREENSHOT_NOT_CONNECTED" });
        emit({
          role: "assistant",
          type: Stage4MessageType.ERROR,
          content: "抖店截图能力暂未接入，已继续生成准备卡和确认卡。",
          createdAt: Date.now(),
        });
      }
      return result;
    }

    case Stage4ActionType.STOP_BEFORE_SUBMIT_REVIEW: {
      emit(createStage4Status("正在定位提交审核/发布商品/立即上架按钮，但不会点击..."));
      const result = await safeCall(browser.findByTextHints, [{
        hints: step.hints || ["提交审核", "发布商品", "立即上架", "提交"],
        platform: "doudian",
      }], {
        found: false,
        platform: "doudian",
        error: "BROWSER_FIND_SUBMIT_BUTTON_NOT_CONNECTED",
      });
      state.submitButtonFound = Boolean(result?.found);
      rememberWarning(state, result);
      emit(createStage4Status("已停在提交审核/发布商品/立即上架按钮前，最终动作需要你手动确认。"));
      return result;
    }

    case Stage4ActionType.CREATE_LISTING_PREP_CARD: {
      const card = createPrepCard(state);
      emit({
        role: "assistant",
        type: Stage4MessageType.DOUDIAN_LISTING_PREP_CARD,
        card,
        createdAt: Date.now(),
      });
      return card;
    }

    case Stage4ActionType.CREATE_SUBMIT_CONFIRMATION_CARD: {
      const card = createSubmitCard(state);
      emit({
        role: "assistant",
        type: Stage4MessageType.SUBMIT_REVIEW_CONFIRMATION_CARD,
        card,
        createdAt: Date.now(),
      });
      return card;
    }

    default: {
      emit(createStage4Status(`第四阶段暂不支持该动作：${step.type || "unknown"}`));
      return null;
    }
  }
}

async function fillField({ emit, browser, state, step, field, value, hints = null }) {
  emit(createStage4Status(`正在填写抖店字段：${fieldLabel(field)}...`));
  const result = await safeCall(browser.typeIntoByHints, [{
    hints: hints || step.hints || [],
    value: value || "",
    platform: "doudian",
    field,
  }], {
    ok: false,
    field,
    platform: "doudian",
    error: "BROWSER_TYPE_INTO_NOT_CONNECTED",
  });
  rememberWarning(state, result);
  return result;
}

function createPrepCard(state) {
  return createDoudianListingPrepCard({
    productTitle: state.draft.productTitle,
    category: state.draft.category,
    description: state.draft.description,
    sellingPoints: state.draft.sellingPoints,
    specs: state.draft.specs,
    price: state.draft.price,
    inventory: state.draft.inventory,
    images: state.images,
    detailImages: state.detailImages,
    previewScreenshot: state.previewScreenshot,
    submitButtonFound: state.submitButtonFound,
    note: buildCardNote(state),
  });
}

function createSubmitCard(state) {
  return createSubmitReviewConfirmationCard({
    productTitle: state.draft.productTitle,
    category: state.draft.category,
    price: state.draft.price,
    inventory: state.draft.inventory,
    previewScreenshot: state.previewScreenshot,
    action: {
      type: Stage4ActionType.SUBMIT_REVIEW,
      label: "需要你手动确认的提交审核/发布商品/立即上架动作",
    },
  });
}

function createUnsafeConfirmation(query) {
  return {
    role: "assistant",
    type: "user_confirmation",
    confirmation: {
      id: createId("stage4_block"),
      title: "第四阶段已拦截自动提交审核/上架请求",
      description: "你的请求包含直接提交审核、发布商品或上架。第四阶段只能准备到最终按钮前，必须由你手动确认最终动作。",
      platform: "抖店",
      action: {
        type: Stage4ActionType.SUBMIT_REVIEW,
        label: query || "抖店最终提交动作",
      },
      risk: "high",
      createdAt: Date.now(),
    },
    createdAt: Date.now(),
  };
}

function buildCardNote(state) {
  const warnings = state.warnings.length
    ? `\n占位提示：${Array.from(new Set(state.warnings)).join("；")}`
    : "";
  const missing = state.missingUrl
    ? "\n抖店商品发布/管理入口未配置，已按手动打开页面的回退方式继续准备。"
    : "";
  return `已准备到提交审核前，不会自动提交审核、发布商品或上架。价格和库存未确认前不会自动填写。${missing}${warnings}`.trim();
}

function fieldLabel(field) {
  return {
    [Stage4ActionType.FILL_PRODUCT_TITLE]: "商品标题",
    [Stage4ActionType.FILL_PRODUCT_DESCRIPTION]: "商品详情",
    [Stage4ActionType.FILL_PRODUCT_SELLING_POINTS]: "商品卖点",
    price: "价格",
    inventory: "库存",
  }[field] || field;
}

function createEmitter(context) {
  const emit = typeof context.emit === "function" ? context.emit : null;
  return (event) => {
    if (emit) emit(event);
  };
}

function buildStage4GuardMetadata(input = {}) {
  return normalizeEcommerceStageGuardResult({
    ...input,
    stage: "stage4",
    action_type: input.action_type || input.actionType || "prepare_product_listing",
    text: input.query || input.userText || input.prompt || "",
    source: "ecommerce.stage4.runner",
  });
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

function rememberWarning(state, result) {
  const error = result?.error;
  if (!error) return;
  const readable = {
    BROWSER_OPEN_NOT_CONNECTED: "打开抖店页面能力未接入",
    BROWSER_WAIT_FOR_LOAD_NOT_CONNECTED: "等待页面加载能力未接入",
    BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED: "读取页面文字能力未接入",
    BROWSER_CLICK_CREATE_PRODUCT_NOT_CONNECTED: "进入新增商品页能力未接入",
    BROWSER_UPLOAD_MEDIA_NOT_CONNECTED: "上传商品图片能力未接入",
    BROWSER_TYPE_INTO_NOT_CONNECTED: "填写抖店字段能力未接入",
    BROWSER_CAPTURE_SCREENSHOT_NOT_CONNECTED: "截图能力未接入",
    BROWSER_FIND_SUBMIT_BUTTON_NOT_CONNECTED: "定位提交审核按钮能力未接入",
    BROWSER_CAPABILITY_NOT_CONNECTED: "浏览器能力未接入",
  }[error] || error;

  state.warnings.push(readable);
}
