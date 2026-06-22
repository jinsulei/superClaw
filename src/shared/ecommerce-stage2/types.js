export const Stage2TaskKind = Object.freeze({
  PLATFORM_TREND_SEARCH: "platform_trend_search",
  TREND_INSIGHT: "trend_insight",
  GENERATE_PRODUCT_TITLES: "generate_product_titles",
  GENERATE_SHORT_VIDEO_TITLES: "generate_short_video_titles",
  GENERATE_SELLING_POINTS: "generate_selling_points",
  VIDEO_LINK_DECOMPOSE: "video_link_decompose",
  LOW_RISK_CONTENT_PACK: "low_risk_content_pack",
});

export const Stage2ActionType = Object.freeze({
  STATUS: "status",
  OPEN_PLATFORM_PAGE: "open_platform_page",
  FIND_SEARCH_INPUT: "find_search_input",
  TYPE_KEYWORD: "type_keyword",
  PRESS_ENTER: "press_enter",
  WAIT_FOR_LOAD: "wait_for_load",
  READ_VISIBLE_TEXT: "read_visible_text",
  CAPTURE_SCREENSHOT: "capture_screenshot",
  EXTRACT_TRENDS: "extract_trends",
  GENERATE_PRODUCT_TITLES: "generate_product_titles",
  GENERATE_SHORT_VIDEO_TITLES: "generate_short_video_titles",
  GENERATE_SELLING_POINTS: "generate_selling_points",
  GENERATE_PLATFORM_DRAFTS: "generate_platform_drafts",
  VIDEO_LINK_TO_HERMES: "video_link_to_hermes",
  SUMMARIZE_LOW_RISK_RESULT: "summarize_low_risk_result",
});

export const Stage2MessageType = Object.freeze({
  STATUS: "status",
  TREND_INSIGHT_CARD: "trend_insight_card",
  CONTENT_DRAFT_CARD: "content_draft_card",
  VIDEO_LINK_CARD: "video_link_card",
  ERROR: "error",
});

export function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createTrendInsightCard({
  id,
  title = "热词洞察",
  source = "",
  platform = "general",
  platformLabel = "",
  query = "",
  keyword = "",
  keywords = [],
  groups = {},
  resultHints = [],
  screenshot = null,
  missingUrl = false,
  note = "",
  createdAt = Date.now(),
}) {
  return {
    type: Stage2MessageType.TREND_INSIGHT_CARD,
    id: id || createId("trend"),
    title,
    source,
    platform,
    platformLabel,
    query,
    keyword,
    keywords,
    groups,
    resultHints,
    screenshot,
    missingUrl,
    note,
    createdAt,
  };
}

export function createContentDraftCard({
  id,
  title = "内容草稿",
  category = "",
  product = "",
  query = "",
  keyword = "",
  platform = "general",
  platformLabel = "",
  productTitles = [],
  shortVideoTitles = [],
  liveScripts = [],
  xiaohongshuNotes = [],
  sellingPoints = [],
  platformDrafts = [],
  note = "",
  createdAt = Date.now(),
}) {
  return {
    type: Stage2MessageType.CONTENT_DRAFT_CARD,
    id: id || createId("draft"),
    title,
    category,
    product,
    query,
    keyword,
    platform,
    platformLabel,
    productTitles,
    shortVideoTitles,
    liveScripts,
    xiaohongshuNotes,
    sellingPoints,
    platformDrafts,
    note,
    createdAt,
  };
}

export function createVideoLinkCard({
  id,
  title = "视频链接拆解",
  url = "",
  platform = "",
  status = "pending",
  summary = "",
  decomposition = null,
  screenshot = null,
  note = "",
  createdAt = Date.now(),
}) {
  return {
    type: Stage2MessageType.VIDEO_LINK_CARD,
    id: id || createId("video"),
    title,
    url,
    platform,
    status,
    summary,
    decomposition,
    screenshot,
    note,
    createdAt,
  };
}

export function createStage2Status(content, extra = {}) {
  return {
    role: "assistant",
    type: Stage2MessageType.STATUS,
    content,
    createdAt: Date.now(),
    ...extra,
  };
}
