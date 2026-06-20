export const Stage4TaskKind = Object.freeze({
  PREPARE_DOUDIAN_LISTING: "prepare_doudian_listing",
  OPTIMIZE_DOUDIAN_PRODUCT: "optimize_doudian_product",
  PRICE_INVENTORY_CONFIRM_ONLY: "price_inventory_confirm_only",
});

export const Stage4ActionType = Object.freeze({
  STATUS: "status",
  OPEN_DOUDIAN_PRODUCT_PAGE: "open_doudian_product_page",
  READ_VISIBLE_TEXT: "read_visible_text",
  ENTER_CREATE_PRODUCT_PAGE: "enter_create_product_page",

  UPLOAD_PRODUCT_IMAGES: "upload_product_images",
  FILL_PRODUCT_TITLE: "fill_product_title",
  FILL_PRODUCT_CATEGORY_PLACEHOLDER: "fill_product_category_placeholder",
  FILL_PRODUCT_DESCRIPTION: "fill_product_description",
  FILL_PRODUCT_SELLING_POINTS: "fill_product_selling_points",
  FILL_PRODUCT_SPECS_PLACEHOLDER: "fill_product_specs_placeholder",

  REQUIRE_PRICE_INVENTORY_CONFIRMATION: "require_price_inventory_confirmation",
  FILL_PRICE_INVENTORY_AFTER_CONFIRMATION: "fill_price_inventory_after_confirmation",

  CAPTURE_LISTING_PREVIEW: "capture_listing_preview",
  STOP_BEFORE_SUBMIT_REVIEW: "stop_before_submit_review",
  CREATE_LISTING_PREP_CARD: "create_listing_prep_card",
  CREATE_SUBMIT_CONFIRMATION_CARD: "create_submit_confirmation_card",

  SUBMIT_REVIEW: "submit_review",
  PUBLISH_PRODUCT: "publish_product",
  LIST_PRODUCT: "list_product",
  CHANGE_PRICE: "change_price",
  CHANGE_INVENTORY: "change_inventory",
});

export const Stage4MessageType = Object.freeze({
  STATUS: "status",
  DOUDIAN_LISTING_PREP_CARD: "doudian_listing_prep_card",
  PRICE_INVENTORY_CONFIRMATION_CARD: "price_inventory_confirmation_card",
  SUBMIT_REVIEW_CONFIRMATION_CARD: "submit_review_confirmation_card",
  ERROR: "error",
});

export const Stage4MediaType = Object.freeze({
  PRODUCT_IMAGES: "product_images",
  DETAIL_IMAGES: "detail_images",
  MIXED_IMAGES: "mixed_images",
  UNKNOWN: "unknown",
});

export function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createStage4Status(content, extra = {}) {
  return {
    role: "assistant",
    type: Stage4MessageType.STATUS,
    content,
    createdAt: Date.now(),
    ...extra,
  };
}

export function createDoudianListingPrepCard({
  id,
  productTitle = "",
  category = "",
  description = "",
  sellingPoints = [],
  specs = [],
  price = "",
  inventory = "",
  images = [],
  detailImages = [],
  previewScreenshot = null,
  submitButtonFound = false,
  note = "",
  createdAt = Date.now(),
}) {
  return {
    type: Stage4MessageType.DOUDIAN_LISTING_PREP_CARD,
    id: id || createId("doudian_prep"),
    productTitle,
    category,
    description,
    sellingPoints,
    specs,
    price,
    inventory,
    images,
    detailImages,
    previewScreenshot,
    submitButtonFound,
    note,
    createdAt,
  };
}

export function createPriceInventoryConfirmationCard({
  id,
  productTitle = "",
  price = "",
  inventory = "",
  action,
  createdAt = Date.now(),
}) {
  return {
    type: Stage4MessageType.PRICE_INVENTORY_CONFIRMATION_CARD,
    id: id || createId("price_inventory_confirm"),
    title: "价格和库存需要确认",
    description:
      "价格和库存属于高风险字段。第四阶段不会在未确认的情况下自动填写或修改价格库存。",
    productTitle,
    price,
    inventory,
    action,
    createdAt,
  };
}

export function createSubmitReviewConfirmationCard({
  id,
  productTitle = "",
  category = "",
  price = "",
  inventory = "",
  previewScreenshot = null,
  action,
  createdAt = Date.now(),
}) {
  return {
    type: Stage4MessageType.SUBMIT_REVIEW_CONFIRMATION_CARD,
    id: id || createId("submit_review_confirm"),
    title: "提交审核 / 发布商品前确认",
    description:
      "商品信息已经准备到提交审核/发布商品按钮前。第四阶段不会自动点击提交审核、发布商品或立即上架。",
    productTitle,
    category,
    price,
    inventory,
    previewScreenshot,
    action,
    createdAt,
  };
}
