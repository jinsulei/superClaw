export const Stage56Platform = Object.freeze({
  DOUYIN: "douyin",
  KUAISHOU: "kuaishou",
  XIAOHONGSHU: "xiaohongshu",
  WECHAT_CHANNELS: "wechat_channels",
  ALL: "all",
});

export const Stage56TaskKind = Object.freeze({
  LIVE_COMMENT_ASSIST: "live_comment_assist",
  VIDEO_INSPIRATION_PATROL: "video_inspiration_patrol",
  MATERIAL_LIBRARY_SAVE: "material_library_save",
  VIDEO_LINK_DECOMPOSE: "video_link_decompose",
});

export const Stage56ActionType = Object.freeze({
  STATUS: "status",

  CAPTURE_LIVE_SCREEN: "capture_live_screen",
  READ_LIVE_VISIBLE_TEXT: "read_live_visible_text",
  OCR_LIVE_SCREENSHOT: "ocr_live_screenshot",
  EXTRACT_LIVE_COMMENTS: "extract_live_comments",
  CLASSIFY_LIVE_COMMENTS: "classify_live_comments",
  GENERATE_LIVE_REPLIES: "generate_live_replies",
  FILL_LIVE_REPLY_DRAFT: "fill_live_reply_draft",
  STOP_BEFORE_SEND_LIVE_REPLY: "stop_before_send_live_reply",

  OPEN_VIDEO_PLATFORM: "open_video_platform",
  SEARCH_VIDEO_KEYWORD: "search_video_keyword",
  READ_VIDEO_PAGE: "read_video_page",
  CAPTURE_VIDEO_SCREENSHOT: "capture_video_screenshot",
  EXTRACT_VIDEO_CANDIDATES: "extract_video_candidates",
  SCORE_VIDEO_CANDIDATES: "score_video_candidates",
  SEND_VIDEO_TO_HERMES: "send_video_to_hermes",
  SAVE_TO_MATERIAL_LIBRARY: "save_to_material_library",

  SEND_COMMENT: "send_comment",
  SEND_LIVE_REPLY: "send_live_reply",
  LIKE_VIDEO: "like_video",
  FOLLOW_AUTHOR: "follow_author",
  PRIVATE_MESSAGE: "private_message",
  DOWNLOAD_RESTRICTED_CONTENT: "download_restricted_content",
  PUBLISH_CONTENT: "publish_content",
});

export const Stage56MessageType = Object.freeze({
  STATUS: "status",
  LIVE_REPLY_CARD: "live_reply_card",
  LIVE_REPLY_CONFIRMATION_CARD: "live_reply_confirmation_card",
  VIDEO_CANDIDATE_CARD: "video_candidate_card",
  VIDEO_DECOMPOSE_CARD: "video_decompose_card",
  MATERIAL_RECORD_CARD: "material_record_card",
  ERROR: "error",
});

export const LiveQuestionType = Object.freeze({
  SIZE: "size",
  PRICE: "price",
  MATERIAL: "material",
  SHIPPING: "shipping",
  AFTER_SALE: "after_sale",
  MATCHING: "matching",
  PRODUCT_LINK: "product_link",
  GENERAL: "general",
  RISKY: "risky",
});

export const CandidateDecision = Object.freeze({
  COLLECT: "collect",
  IGNORE: "ignore",
  NEED_REVIEW: "need_review",
});

export function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createStage56Status(content, extra = {}) {
  return {
    role: "assistant",
    type: Stage56MessageType.STATUS,
    content,
    createdAt: Date.now(),
    ...extra,
  };
}

export function createLiveReplyCard({
  id,
  platform = "",
  screenshot = null,
  comments = [],
  classified = [],
  replies = [],
  note = "",
  createdAt = Date.now(),
}) {
  return {
    type: Stage56MessageType.LIVE_REPLY_CARD,
    id: id || createId("live_reply"),
    platform,
    screenshot,
    comments,
    classified,
    replies,
    note,
    createdAt,
  };
}

export function createLiveReplyConfirmationCard({
  id,
  platform = "",
  comment = "",
  reply = "",
  questionType = "",
  action,
  createdAt = Date.now(),
}) {
  return {
    type: Stage56MessageType.LIVE_REPLY_CONFIRMATION_CARD,
    id: id || createId("live_confirm"),
    title: "公屏回复发送前确认",
    description:
      "回复已生成并可填入输入框，但第五阶段不会自动发送。发送前必须由用户确认。",
    platform,
    comment,
    reply,
    questionType,
    action,
    createdAt,
  };
}

export function createVideoCandidateCard({
  id,
  platform = "",
  url = "",
  title = "",
  author = "",
  screenshot = null,
  visibleMetrics = {},
  reason = "",
  score = 0,
  decision = CandidateDecision.NEED_REVIEW,
  collectedAt = Date.now(),
}) {
  return {
    type: Stage56MessageType.VIDEO_CANDIDATE_CARD,
    id: id || createId("video_candidate"),
    platform,
    url,
    title,
    author,
    screenshot,
    visibleMetrics,
    reason,
    score,
    decision,
    collectedAt,
  };
}

export function createVideoDecomposeCard({
  id,
  platform = "",
  url = "",
  title = "",
  decomposition = null,
  summary = "",
  screenshot = null,
  createdAt = Date.now(),
}) {
  return {
    type: Stage56MessageType.VIDEO_DECOMPOSE_CARD,
    id: id || createId("video_decompose"),
    platform,
    url,
    title,
    decomposition,
    summary,
    screenshot,
    createdAt,
  };
}

export function createMaterialRecordCard({
  id,
  record,
  createdAt = Date.now(),
}) {
  return {
    type: Stage56MessageType.MATERIAL_RECORD_CARD,
    id: id || createId("material_record"),
    record,
    createdAt,
  };
}
