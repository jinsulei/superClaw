export const Stage3Platform = Object.freeze({
  DOUYIN: "douyin",
  KUAISHOU: "kuaishou",
  WECHAT_CHANNELS: "wechat_channels",
  XIAOHONGSHU: "xiaohongshu",
  TMALL: "tmall",
  TAOBAO: "taobao",
  PINDUODUO: "pinduoduo",

  ALL_CONTENT: "all_content",
  ALL_SHOP: "all_shop",
  ALL: "all",
});

export const Stage3PlatformKind = Object.freeze({
  CONTENT: "content",
  SHOP: "shop",
});

export const Stage3TaskKind = Object.freeze({
  PREPARE_CONTENT_POST: "prepare_content_post",
  PREPARE_PRODUCT_LISTING: "prepare_product_listing",
  PREPARE_MULTI_PLATFORM: "prepare_multi_platform",
});

export const Stage3ActionType = Object.freeze({
  STATUS: "status",

  OPEN_PLATFORM_PAGE: "open_platform_page",
  READ_VISIBLE_TEXT: "read_visible_text",

  UPLOAD_MEDIA: "upload_media",
  FILL_TITLE: "fill_title",
  FILL_DESCRIPTION: "fill_description",
  FILL_TAGS: "fill_tags",

  FILL_PRODUCT_TITLE: "fill_product_title",
  FILL_PRODUCT_DESCRIPTION: "fill_product_description",
  FILL_PRODUCT_SELLING_POINTS: "fill_product_selling_points",
  FILL_PRODUCT_KEYWORDS: "fill_product_keywords",
  FILL_PRODUCT_IMAGES: "fill_product_images",

  PRICE_INVENTORY_PLACEHOLDER: "price_inventory_placeholder",
  SELECT_COVER_PLACEHOLDER: "select_cover_placeholder",

  CAPTURE_PREVIEW: "capture_preview",
  STOP_BEFORE_FINAL_SUBMIT: "stop_before_final_submit",
  CREATE_PREP_CARD: "create_prep_card",
  CREATE_CONFIRMATION_CARD: "create_confirmation_card",

  CLICK_PUBLISH: "click_publish",
  PUBLISH_CONTENT: "publish_content",
  SUBMIT_LISTING: "submit_listing",
  LIST_PRODUCT: "list_product",
  SUBMIT_REVIEW: "submit_review",
});

export const Stage3MessageType = Object.freeze({
  STATUS: "status",
  PLATFORM_PREP_CARD: "platform_prep_card",
  PLATFORM_CONFIRMATION_CARD: "platform_confirmation_card",
  ERROR: "error",
});

export const Stage3MediaType = Object.freeze({
  VIDEO: "video",
  IMAGE: "image",
  MIXED: "mixed",
  PRODUCT_IMAGES: "product_images",
  UNKNOWN: "unknown",
});

export function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createStage3Status(content, extra = {}) {
  return {
    role: "assistant",
    type: Stage3MessageType.STATUS,
    content,
    createdAt: Date.now(),
    ...extra,
  };
}

export function createPlatformPrepCard({
  id,
  platform,
  platformLabel,
  platformKind,
  mediaFiles = [],
  mediaType = Stage3MediaType.UNKNOWN,
  title = "",
  description = "",
  tags = [],
  sellingPoints = [],
  productKeywords = [],
  draft = null,
  previewScreenshot = null,
  publishUrl = "",
  finalButtonFound = false,
  note = "",
  createdAt = Date.now(),
}) {
  return {
    type: Stage3MessageType.PLATFORM_PREP_CARD,
    id: id || createId("platform_prep"),
    platform,
    platformLabel,
    platformKind,
    mediaFiles,
    mediaType,
    title,
    description,
    tags,
    sellingPoints,
    productKeywords,
    draft,
    previewScreenshot,
    publishUrl,
    finalButtonFound,
    note,
    createdAt,
  };
}

export function createPlatformConfirmationCard({
  id,
  platform,
  platformLabel,
  platformKind,
  title,
  description,
  tags = [],
  sellingPoints = [],
  mediaFiles = [],
  previewScreenshot = null,
  action,
  createdAt = Date.now(),
}) {
  return {
    type: Stage3MessageType.PLATFORM_CONFIRMATION_CARD,
    id: id || createId("platform_confirm"),
    platform,
    platformLabel,
    platformKind,
    title: title || "最终操作前确认",
    description:
      description ||
      "内容已经准备到最终按钮前。第三阶段不会自动点击发布、提交、上架或审核。",
    tags,
    sellingPoints,
    mediaFiles,
    previewScreenshot,
    action,
    createdAt,
  };
}
