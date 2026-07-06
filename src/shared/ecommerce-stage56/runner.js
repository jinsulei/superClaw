import { extractLiveComments, classifyLiveComments, generateLiveReplies } from "./live-comment-assist.js";
import { createMaterialRecord, saveMaterialRecord } from "./material-store.js";
import { buildStage56Plan } from "./planner.js";
import { getStage56PlatformConfig } from "./platform-config.js";
import {
  Stage56ActionType,
  Stage56MessageType,
  Stage56TaskKind,
  createId,
  createLiveReplyCard,
  createLiveReplyConfirmationCard,
  createMaterialRecordCard,
  createStage56Status,
  createVideoCandidateCard,
  createVideoDecomposeCard,
} from "./types.js";
import { normalizeEcommerceStageGuardResult } from "../ecommerce/safety-policy.js";
import { detectStage56Intent, extractVideoCandidatesFromText, scoreVideoCandidates } from "./video-patrol.js";

const FORBIDDEN_ACTIONS = new Set([
  Stage56ActionType.SEND_COMMENT,
  Stage56ActionType.SEND_LIVE_REPLY,
  Stage56ActionType.LIKE_VIDEO,
  Stage56ActionType.FOLLOW_AUTHOR,
  Stage56ActionType.PRIVATE_MESSAGE,
  Stage56ActionType.DOWNLOAD_RESTRICTED_CONTENT,
  Stage56ActionType.PUBLISH_CONTENT,
]);

export async function runStage56Ops(input = {}, context = {}) {
  const emit = createEmitter(context);
  const browser = context.browser || {};
  const query = input.query || input.userText || input.prompt || "";
  const stageGuard = buildStage56GuardMetadata(input);

  if (stageGuard.ecommerce_guard.blocked) {
    emit(createUnsafeConfirmation(query, { platforms: input.platforms || [] }));
    return {
      ok: false,
      blocked: true,
      reason: stageGuard.ecommerce_guard.reason,
      state: {},
      ...stageGuard,
    };
  }

  const detected = detectStage56Intent(query);

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
    const blockedGuard = buildStage56GuardMetadata({
      ...input,
      action_type: input.action_type || input.actionType || "send_live_comment",
      risk_level: "high",
    });
    emit(createUnsafeConfirmation(query, detected));
    return {
      ok: false,
      blocked: true,
      reason: detected.reason,
      state: {},
      ...blockedGuard,
    };
  }

  const plan = buildStage56Plan({
    userText: query,
    intent: input.intent || detected.intent,
    platforms: input.platforms || detected.platforms,
  });
  const state = {
    query,
    intent: plan.intent,
    platforms: plan.platforms || detected.platforms || [],
    productInfo: input.productInfo || {},
    live: {
      screenshot: null,
      visibleText: null,
      ocrText: "",
      comments: [],
      classified: [],
      replies: [],
    },
    patrol: {
      byPlatform: new Map(),
      selectedCandidates: [],
      decompositions: [],
      materialRecords: [],
    },
    warnings: [],
  };

  emit(createStage56Status(`正在执行电商 1.0.2 第五/第六阶段：${plan.intent}`));

  if (plan.intent === Stage56TaskKind.LIVE_COMMENT_ASSIST) {
    await runLiveAssist(plan, { emit, browser, context, state, input });
  } else if (plan.intent === Stage56TaskKind.VIDEO_INSPIRATION_PATROL) {
    await runVideoPatrol(plan, { emit, browser, context, state });
  }

  emit(createStage56Status("第五/第六阶段已完成：未自动发送、点赞、关注、评论、下载或发布。"));

  return {
    ok: true,
    blocked: false,
    intent: plan.intent,
    state: {
      ...state,
      patrol: {
        ...state.patrol,
        byPlatform: Object.fromEntries(state.patrol.byPlatform.entries()),
      },
    },
    ...stageGuard,
  };
}

async function runLiveAssist(plan, { emit, browser, context, state, input }) {
  for (const step of plan.steps) {
    if (FORBIDDEN_ACTIONS.has(step.type)) continue;

    switch (step.type) {
      case Stage56ActionType.CAPTURE_LIVE_SCREEN: {
        emit(createStage56Status("正在截图直播间..."));
        const result = await safeCall(browser.captureScreenshot, [], null);
        state.live.screenshot = result;
        if (!result) rememberWarning(state, "直播截图能力未接入");
        break;
      }

      case Stage56ActionType.READ_LIVE_VISIBLE_TEXT: {
        emit(createStage56Status("正在读取直播间可见文字..."));
        const result = await safeCall(browser.readVisibleText, [], {
          text: "",
          title: "",
          url: "",
          error: "BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED",
        });
        state.live.visibleText = result;
        rememberBrowserWarning(state, result);
        break;
      }

      case Stage56ActionType.OCR_LIVE_SCREENSHOT: {
        state.live.ocrText = await runOptionalOcr(context.ocr, state.live.screenshot);
        break;
      }

      case Stage56ActionType.EXTRACT_LIVE_COMMENTS: {
        const text = [state.live.visibleText?.text, state.live.ocrText].filter(Boolean).join("\n");
        state.live.comments = extractLiveComments(text);
        break;
      }

      case Stage56ActionType.CLASSIFY_LIVE_COMMENTS: {
        state.live.classified = classifyLiveComments(state.live.comments);
        break;
      }

      case Stage56ActionType.GENERATE_LIVE_REPLIES: {
        state.live.replies = generateLiveReplies(state.live.classified, state.productInfo);
        emit({
          role: "assistant",
          type: Stage56MessageType.LIVE_REPLY_CARD,
          card: createLiveReplyCard({
            platform: state.platforms[0] || "",
            screenshot: state.live.screenshot,
            comments: state.live.comments,
            classified: state.live.classified,
            replies: state.live.replies,
            note: buildLiveNote(state),
          }),
          createdAt: Date.now(),
        });
        break;
      }

      case Stage56ActionType.FILL_LIVE_REPLY_DRAFT: {
        if (input.allowDraftFill === false) break;
        const firstReply = state.live.replies.find((reply) => reply.reply);
        if (!firstReply) break;
        emit(createStage56Status("正在把第一条回复填入输入框草稿，但不会发送..."));
        const config = getStage56PlatformConfig(state.platforms[0]);
        const result = await safeCall(browser.typeIntoByHints, [{
          hints: config?.replyInputHints || ["评论", "输入"],
          value: firstReply.reply,
          platform: state.platforms[0] || "",
          field: "live_reply_draft",
        }], {
          ok: false,
          error: "BROWSER_TYPE_INTO_NOT_CONNECTED",
        });
        rememberBrowserWarning(state, result);
        break;
      }

      case Stage56ActionType.STOP_BEFORE_SEND_LIVE_REPLY: {
        const firstReply = state.live.replies.find((reply) => reply.reply);
        if (firstReply) {
          emit({
            role: "assistant",
            type: Stage56MessageType.LIVE_REPLY_CONFIRMATION_CARD,
            card: createLiveReplyConfirmationCard({
              platform: state.platforms[0] || "",
              comment: firstReply.comment,
              reply: firstReply.reply,
              questionType: firstReply.questionType,
              action: {
                type: Stage56ActionType.SEND_LIVE_REPLY,
                label: "需要你手动确认后发送",
              },
            }),
            createdAt: Date.now(),
          });
        }
        emit(createStage56Status("已停在发送前，绝不会自动发送公屏回复。"));
        break;
      }

      default:
        break;
    }
  }
}

async function runVideoPatrol(plan, { emit, browser, context, state }) {
  const candidatesByPlatform = new Map();

  for (const step of plan.steps) {
    if (FORBIDDEN_ACTIONS.has(step.type)) continue;

    switch (step.type) {
      case Stage56ActionType.OPEN_VIDEO_PLATFORM: {
        const platformState = getOrCreatePlatformState(state, step.platform);
        platformState.platformLabel = step.platformLabel;
        platformState.searchUrl = step.searchUrl || "";
        if (!step.searchUrl) {
          emit(createStage56Status(`${step.platformLabel}搜索入口未配置；可以先手动打开页面，我会回退到读取当前页面。`));
          break;
        }
        emit(createStage56Status(`正在打开${step.platformLabel}搜索页...`));
        const result = await safeCall(browser.open, [step.searchUrl], {
          ok: false,
          error: "BROWSER_OPEN_NOT_CONNECTED",
        });
        rememberBrowserWarning(state, result);
        const wait = await safeCall(browser.waitForLoad, [], {
          ok: false,
          error: "BROWSER_WAIT_FOR_LOAD_NOT_CONNECTED",
        });
        rememberBrowserWarning(state, wait);
        break;
      }

      case Stage56ActionType.SEARCH_VIDEO_KEYWORD: {
        const keyword = (step.keywords || plan.options?.keywords || []).join(" ") || state.query;
        emit(createStage56Status(`正在搜索${step.platformLabel}关键词：${keyword}`));
        const result = await safeCall(browser.typeIntoByHints, [{
          hints: step.hints || ["搜索"],
          value: keyword,
          platform: step.platform,
          field: "video_search_keyword",
        }], {
          ok: false,
          error: "BROWSER_TYPE_INTO_NOT_CONNECTED",
        });
        rememberBrowserWarning(state, result);
        const pressed = await safeCall(browser.press, ["Enter"], {
          ok: false,
          error: "BROWSER_PRESS_NOT_CONNECTED",
        });
        rememberBrowserWarning(state, pressed);
        break;
      }

      case Stage56ActionType.READ_VIDEO_PAGE: {
        const platformState = getOrCreatePlatformState(state, step.platform);
        const result = await safeCall(browser.readVisibleText, [], {
          text: "",
          error: "BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED",
        });
        platformState.visibleText = result;
        rememberBrowserWarning(state, result);
        break;
      }

      case Stage56ActionType.CAPTURE_VIDEO_SCREENSHOT: {
        const platformState = getOrCreatePlatformState(state, step.platform);
        const result = await safeCall(browser.captureScreenshot, [], null);
        platformState.screenshot = result;
        if (!result) rememberWarning(state, "视频页面截图能力未接入");
        break;
      }

      case Stage56ActionType.EXTRACT_VIDEO_CANDIDATES: {
        const platformState = getOrCreatePlatformState(state, step.platform);
        const candidates = extractVideoCandidatesFromText(platformState.visibleText?.text || "", {
          platform: step.platform,
          screenshot: platformState.screenshot,
        });
        platformState.candidates = candidates;
        candidatesByPlatform.set(step.platform, candidates);
        break;
      }

      case Stage56ActionType.SCORE_VIDEO_CANDIDATES: {
        const platformState = getOrCreatePlatformState(state, step.platform);
        platformState.candidates = scoreVideoCandidates(platformState.candidates || candidatesByPlatform.get(step.platform) || []);
        for (const candidate of platformState.candidates.slice(0, plan.options?.maxCandidates || 10)) {
          emit({
            role: "assistant",
            type: Stage56MessageType.VIDEO_CANDIDATE_CARD,
            card: createVideoCandidateCard(candidate),
            createdAt: Date.now(),
          });
        }
        state.patrol.selectedCandidates.push(...platformState.candidates.filter((candidate) => candidate.decision !== "ignore"));
        break;
      }

      case Stage56ActionType.SEND_VIDEO_TO_HERMES: {
        const platformState = getOrCreatePlatformState(state, step.platform);
        const candidates = (platformState.candidates || []).filter((candidate) => candidate.decision !== "ignore");
        for (const candidate of candidates.slice(0, plan.options?.maxCandidates || 10)) {
          const decomposition = await decomposeCandidate(candidate, context.hermes);
          const card = createVideoDecomposeCard({
            platform: candidate.platform,
            url: candidate.url,
            title: candidate.title,
            decomposition,
            summary: decomposition?.hook || decomposition?.summary || "已生成低风险拆解摘要。",
            screenshot: candidate.screenshot,
          });
          state.patrol.decompositions.push({ candidate, decomposition });
          emit({
            role: "assistant",
            type: Stage56MessageType.VIDEO_DECOMPOSE_CARD,
            card,
            createdAt: Date.now(),
          });
        }
        break;
      }

      case Stage56ActionType.SAVE_TO_MATERIAL_LIBRARY: {
        const platformState = getOrCreatePlatformState(state, step.platform);
        const candidates = (platformState.candidates || []).filter((candidate) => candidate.decision !== "ignore");
        for (const candidate of candidates.slice(0, plan.options?.maxCandidates || 10)) {
          const decomposition = state.patrol.decompositions.find((item) => item.candidate === candidate)?.decomposition || null;
          const record = await saveMaterialRecord({
            ...candidate,
            decomposition,
            tags: plan.options?.keywords || [],
          }, {
            materialStore: context.materialStore,
            materialRecords: context.materialRecords || context.materialRecordsRef || context.materials,
          });
          state.patrol.materialRecords.push(record);
          emit({
            role: "assistant",
            type: Stage56MessageType.MATERIAL_RECORD_CARD,
            card: createMaterialRecordCard({ record }),
            createdAt: Date.now(),
          });
        }
        break;
      }

      default:
        break;
    }
  }
}

async function decomposeCandidate(candidate, hermes = {}) {
  if (typeof hermes?.decomposeVideoLink === "function" && candidate.url) {
    return hermes.decomposeVideoLink({
      url: candidate.url,
      platform: candidate.platform,
      title: candidate.title,
    });
  }

  return {
    url: candidate.url,
    hook: "根据公开可见标题和页面文字生成的低风险拆解。",
    structure: ["开头钩子", "场景展示", "卖点说明", "互动引导"],
    hotWords: extractHotWords(candidate.title),
    imitateSuggestion: "只参考公开表达结构和选题方向，不下载、不搬运、不直接复刻。",
  };
}

function extractHotWords(text = "") {
  return Array.from(new Set((String(text || "").match(/[\u4e00-\u9fa5A-Za-z0-9]{2,8}/g) || []).slice(0, 8)));
}

function getOrCreatePlatformState(state, platform) {
  if (!state.patrol.byPlatform.has(platform)) {
    state.patrol.byPlatform.set(platform, {
      platform,
      visibleText: null,
      screenshot: null,
      candidates: [],
    });
  }
  return state.patrol.byPlatform.get(platform);
}

function buildLiveNote(state) {
  const warnings = state.warnings.length ? `\n占位提示：${Array.from(new Set(state.warnings)).join("；")}` : "";
  return `已生成公屏回复建议。回复可填入输入框，但不会自动发送。${warnings}`;
}

function createUnsafeConfirmation(query, detected) {
  return {
    role: "assistant",
    type: "user_confirmation",
    confirmation: {
      id: createId("stage56_block"),
      title: "已拦截自动互动/下载/发布请求",
      description: "第五/第六阶段只做读取、截图、整理、拆解和保存公开摘要，不会自动评论、发送、点赞、关注、私信、下载或发布。",
      platform: (detected.platforms || []).join("、") || "多平台",
      action: {
        type: Stage56ActionType.SEND_COMMENT,
        label: query || "自动互动请求",
      },
      risk: "high",
      createdAt: Date.now(),
    },
    createdAt: Date.now(),
  };
}

function createEmitter(context) {
  const emit = typeof context.emit === "function" ? context.emit : null;
  return (event) => {
    if (emit) emit(event);
  };
}

function buildStage56GuardMetadata(input = {}) {
  return normalizeEcommerceStageGuardResult({
    ...input,
    stage: "stage56",
    action_type: input.action_type || input.actionType || "generate_reply_draft",
    text: input.query || input.userText || input.prompt || "",
    source: "ecommerce.stage56.runner",
  });
}

async function runOptionalOcr(ocr, screenshot) {
  if (!ocr || !screenshot) return "";

  try {
    if (typeof ocr === "function") return String(await ocr(screenshot) || "");
    if (typeof ocr.recognize === "function") return String(await ocr.recognize(screenshot) || "");
    if (typeof ocr.imageToText === "function") return String(await ocr.imageToText(screenshot) || "");
  } catch {
    return "";
  }

  return "";
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

function rememberBrowserWarning(state, result) {
  if (!result?.error) return;
  rememberWarning(state, result.error);
}

function rememberWarning(state, warning) {
  if (!warning) return;
  const readable = {
    BROWSER_OPEN_NOT_CONNECTED: "打开平台页面能力未接入",
    BROWSER_WAIT_FOR_LOAD_NOT_CONNECTED: "等待加载能力未接入",
    BROWSER_READ_VISIBLE_TEXT_NOT_CONNECTED: "读取页面文字能力未接入",
    BROWSER_TYPE_INTO_NOT_CONNECTED: "输入框填写能力未接入",
    BROWSER_PRESS_NOT_CONNECTED: "键盘提交能力未接入",
    BROWSER_CAPABILITY_NOT_CONNECTED: "浏览器能力未接入",
  }[warning] || warning;
  state.warnings.push(readable);
}
