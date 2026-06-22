export const Stage1TaskKind = Object.freeze({
  LOOK_AT_PAGE: "look_at_page",
  SCREENSHOT_TO_CHAT: "screenshot_to_chat",
  READ_VISIBLE_TEXT: "read_visible_text",
  FIND_INTERACTIVE_TARGETS: "find_interactive_targets",
  FIND_COUPON_HINTS: "find_coupon_hints",
  ORDER_FOOD_SAFE_PREPARE: "order_food_safe_prepare",
  DESCRIBE_IMAGE_OR_SCREEN: "describe_image_or_screen",
  HIGH_RISK_CONFIRM_ONLY: "high_risk_confirm_only",
});

export const Stage1ActionType = Object.freeze({
  STATUS: "status",
  READ_VISIBLE_TEXT: "read_visible_text",
  CAPTURE_SCREENSHOT: "capture_screenshot",
  FIND_INTERACTIVE_TARGETS: "find_interactive_targets",
  SUMMARIZE_PAGE: "summarize_page",
  REQUIRE_CONFIRMATION: "require_confirmation",

  PAY: "pay",
  SUBMIT_ORDER: "submit_order",
  PUBLISH_CONTENT: "publish_content",
  LIST_PRODUCT: "list_product",
  DELIST_PRODUCT: "delist_product",
  CHANGE_PRICE: "change_price",
  CHANGE_INVENTORY: "change_inventory",
  DELETE_CONTENT: "delete_content",
  SEND_COMMENT: "send_comment",
  SEND_LIVE_REPLY: "send_live_reply",
  SEND_PRIVATE_MESSAGE: "send_private_message",
  LOGIN: "login",
  ENTER_PASSWORD: "enter_password",
  ENTER_PAYMENT_PASSWORD: "enter_payment_password",
  ENTER_VERIFICATION_CODE: "enter_verification_code",
  AUTHORIZE_ACCOUNT: "authorize_account",
  UPLOAD_PRIVATE_FILE: "upload_private_file",
});

export const RiskLevel = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

export const Stage1MessageType = Object.freeze({
  STATUS: "status",
  SCREENSHOT_CARD: "screenshot_card",
  USER_CONFIRMATION: "user_confirmation",
  PAGE_TEXT: "page_text",
  ERROR: "error",
});

export function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createScreenshotCard({
  id,
  title,
  imageUrl,
  source = "",
  note = "",
  pageUrl = "",
  createdAt = Date.now(),
  risk = RiskLevel.LOW,
}) {
  return {
    type: Stage1MessageType.SCREENSHOT_CARD,
    id: id || createId("shot"),
    title: title || "页面截图",
    imageUrl: imageUrl || "",
    source,
    pageUrl,
    note,
    createdAt,
    risk,
  };
}

export function createUserConfirmation({
  id,
  title,
  description,
  amount,
  platform,
  items = [],
  action,
  risk = RiskLevel.HIGH,
}) {
  return {
    type: Stage1MessageType.USER_CONFIRMATION,
    id: id || createId("confirm"),
    title: title || "需要你确认",
    description: description || "该操作需要用户确认后才能继续。",
    amount,
    platform,
    items,
    action,
    risk,
    createdAt: Date.now(),
  };
}

export function createStage1Status(content, extra = {}) {
  return {
    role: "assistant",
    type: Stage1MessageType.STATUS,
    content,
    createdAt: Date.now(),
    ...extra,
  };
}
