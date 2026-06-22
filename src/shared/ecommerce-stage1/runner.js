import { guardStage1Action } from "./risk-guard.js";
import {
  Stage1ActionType,
  Stage1MessageType,
  createScreenshotCard,
  createStage1Status,
} from "./types.js";
import { buildStage1Plan } from "./planner.js";

export async function runStage1DesktopAssist(input = {}, context = {}) {
  const emit = createEmitter(context);
  const browser = context.browser || {};

  const plan = buildStage1Plan({
    intent: input.intent,
    userText: input.query || input.userText || input.prompt || "",
  });

  emit(createStage1Status(`正在执行电商 1.0.2 第一阶段桌面代办：${plan.intent}`));

  const state = {
    visibleText: null,
    screenshot: null,
    targets: null,
  };

  for (const step of plan.steps) {
    const guardedAction = step.type === Stage1ActionType.REQUIRE_CONFIRMATION ? step.action : step;
    const guard = guardStage1Action(guardedAction);

    if (!guard.allowed) {
      emit({
        role: "assistant",
        type: Stage1MessageType.USER_CONFIRMATION,
        confirmation: guard.confirmation,
        createdAt: Date.now(),
      });

      return {
        ok: false,
        blocked: true,
        reason: guard.reason,
        confirmation: guard.confirmation,
        state,
      };
    }

    await executeStage1Step(step, { emit, browser, state });
  }

  emit(createStage1Status("电商 1.0.2 第一阶段桌面代办已完成。"));

  return {
    ok: true,
    blocked: false,
    intent: plan.intent,
    state,
  };
}

export async function continueStage1AfterConfirmation(confirmation, context = {}) {
  const emit = createEmitter(context);
  emit(createStage1Status("已收到确认。第一阶段仅保留继续执行接口，不会自动执行高风险动作。", {
    confirmationId: confirmation?.id || "",
  }));

  return {
    ok: false,
    blocked: true,
    reason: "STAGE1_CONTINUE_PLACEHOLDER",
    confirmation,
  };
}

async function executeStage1Step(step, { emit, browser, state }) {
  switch (step.type) {
    case Stage1ActionType.STATUS: {
      emit(createStage1Status(step.content || step.label || "正在处理..."));
      return null;
    }

    case Stage1ActionType.READ_VISIBLE_TEXT: {
      emit(createStage1Status("正在读取当前页面可见文字..."));

      const result = await safeCallBrowser(browser.readVisibleText, {
        text: "",
        url: "",
        title: "",
      });

      state.visibleText = result;

      emit({
        role: "assistant",
        type: Stage1MessageType.PAGE_TEXT,
        content: formatVisibleTextSummary(result),
        pageText: result,
        createdAt: Date.now(),
      });

      return result;
    }

    case Stage1ActionType.CAPTURE_SCREENSHOT: {
      emit(createStage1Status("正在截图当前页面..."));

      const result = await safeCallBrowser(browser.captureScreenshot, null);

      if (!result) {
        emit({
          role: "assistant",
          type: Stage1MessageType.ERROR,
          content: "当前浏览器/桌面截图能力还没有接入，已跳过截图。",
          createdAt: Date.now(),
        });
        return null;
      }

      state.screenshot = result;

      const card = createScreenshotCard({
        title: result.title || "当前页面截图",
        imageUrl: result.imageUrl || result.url || result.path || "",
        pageUrl: result.pageUrl || result.currentUrl || result.sourceUrl || "",
        source: result.source || "OpenClaw",
        note: result.note || "这是 OpenClaw 当前看到的页面。",
      });

      emit({
        role: "assistant",
        type: Stage1MessageType.SCREENSHOT_CARD,
        card,
        createdAt: Date.now(),
      });

      return result;
    }

    case Stage1ActionType.FIND_INTERACTIVE_TARGETS: {
      emit(createStage1Status("正在查找页面按钮、输入框和链接..."));

      const result = await safeCallBrowser(browser.findInteractiveTargets, {
        buttons: [],
        inputs: [],
        links: [],
      });

      state.targets = result;

      emit({
        role: "assistant",
        type: Stage1MessageType.STATUS,
        content: formatTargetsSummary(result),
        targets: result,
        createdAt: Date.now(),
      });

      return result;
    }

    case Stage1ActionType.SUMMARIZE_PAGE: {
      emit({
        role: "assistant",
        type: Stage1MessageType.STATUS,
        content: buildSafeSummary(state),
        createdAt: Date.now(),
      });
      return null;
    }

    default: {
      emit(createStage1Status(`第一阶段暂不支持该动作：${step.type || "unknown"}`));
      return null;
    }
  }
}

function createEmitter(context) {
  const emit = typeof context.emit === "function" ? context.emit : null;

  return (event) => {
    if (!emit) return;
    emit(event);
  };
}

async function safeCallBrowser(fn, fallback) {
  if (typeof fn !== "function") {
    return fallback && typeof fallback === "object"
      ? { ...fallback, error: "BROWSER_CAPABILITY_NOT_CONNECTED" }
      : fallback;
  }

  try {
    const result = await fn();
    return result ?? fallback;
  } catch (error) {
    return fallback && typeof fallback === "object"
      ? { ...fallback, error: error?.message || String(error) }
      : fallback;
  }
}

function formatVisibleTextSummary(result) {
  const text = String(result?.text || "").trim();
  const error = result?.error ? `\n读取异常：${result.error}` : "";

  if (!text) {
    return `已尝试读取当前页面，但暂时没有拿到可见文字。${error}`;
  }

  const preview = text.length > 500 ? `${text.slice(0, 500)}...` : text;

  return `已读取当前页面可见文字：\n${preview}${error}`;
}

function formatTargetsSummary(result) {
  const buttons = result?.buttons?.length || 0;
  const inputs = result?.inputs?.length || 0;
  const links = result?.links?.length || 0;
  const error = result?.error ? `\n识别异常：${result.error}` : "";

  return `已识别页面元素：按钮 ${buttons} 个，输入框 ${inputs} 个，链接 ${links} 个。${error}`;
}

function buildSafeSummary(state) {
  const hasText = Boolean(String(state.visibleText?.text || "").trim());
  const hasShot = Boolean(state.screenshot?.imageUrl || state.screenshot?.path || state.screenshot?.url);

  return [
    "已完成低风险页面检查。",
    hasText ? "已读取页面文字。" : "未读取到明确页面文字。",
    hasShot ? "已生成截图卡片。" : "截图能力暂未接入或截图失败。",
    "涉及付款、发布、上架、下架、删除、登录、验证码、密码或评论发送时，我会先请求你确认。",
  ].join("\n");
}
