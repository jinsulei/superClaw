import { Stage4MessageType } from "./types.js";

export function isStage4CardMessage(message = {}) {
  return [
    Stage4MessageType.DOUDIAN_LISTING_PREP_CARD,
    Stage4MessageType.PRICE_INVENTORY_CONFIRMATION_CARD,
    Stage4MessageType.SUBMIT_REVIEW_CONFIRMATION_CARD,
  ].includes(message.type);
}

export function renderStage4CardMessage(message = {}, handlers = {}) {
  if (message.type === Stage4MessageType.DOUDIAN_LISTING_PREP_CARD) {
    return renderDoudianListingPrepCard(message.card || message, handlers);
  }
  if (message.type === Stage4MessageType.PRICE_INVENTORY_CONFIRMATION_CARD) {
    return renderPriceInventoryConfirmationCard(message.card || message, handlers);
  }
  if (message.type === Stage4MessageType.SUBMIT_REVIEW_CONFIRMATION_CARD) {
    return renderSubmitReviewConfirmationCard(message.card || message, handlers);
  }
  return document.createTextNode("");
}

export function renderStage4CardMessageHtml(message = {}) {
  if (message.type === Stage4MessageType.DOUDIAN_LISTING_PREP_CARD) return renderDoudianListingPrepCardHtml(message.card || message);
  if (message.type === Stage4MessageType.PRICE_INVENTORY_CONFIRMATION_CARD) return renderPriceInventoryConfirmationCardHtml(message.card || message);
  if (message.type === Stage4MessageType.SUBMIT_REVIEW_CONFIRMATION_CARD) return renderSubmitReviewConfirmationCardHtml(message.card || message);
  return "";
}

export function renderDoudianListingPrepCard(card = {}, handlers = {}) {
  const root = createCardRoot("stage4-doudian-listing-card");
  root.appendChild(createTitle("抖店上架准备卡"));
  root.appendChild(createSmallText(card.submitButtonFound ? "已定位提交审核按钮，未点击" : "提交审核按钮未定位或未接入"));
  root.appendChild(createBlock("商品标题", card.productTitle));
  root.appendChild(createBlock("类目", card.category || "待确认"));
  root.appendChild(createBlock("商品详情", card.description));
  root.appendChild(createBlock("卖点", (card.sellingPoints || []).join("\n")));
  root.appendChild(createBlock("规格", (card.specs || []).join("\n")));
  root.appendChild(createBlock("价格/库存", `价格：${card.price || "待确认"}\n库存：${card.inventory || "待确认"}`));
  root.appendChild(createBlock("图片", [...(card.images || []), ...(card.detailImages || [])].join("\n")));
  if (card.note) root.appendChild(createNote(card.note));
  root.appendChild(createActions([
    createButton("复制上架草稿", () => handlers.onCopy?.(serializeListing(card))),
    createButton("查看截图", () => handlers.onOpenScreenshot?.(card.previewScreenshot)),
  ]));
  return root;
}

export function renderPriceInventoryConfirmationCard(card = {}, handlers = {}) {
  const root = createCardRoot("stage4-price-inventory-card");
  root.appendChild(createTitle(card.title || "价格和库存需要确认"));
  root.appendChild(createSmallText(card.productTitle || "抖店商品"));
  root.appendChild(createBlock("确认说明", card.description));
  root.appendChild(createBlock("价格/库存", `价格：${card.price || "待确认"}\n库存：${card.inventory || "待确认"}`));
  root.appendChild(createActions([
    createButton("确认价格库存", () => handlers.onConfirmPriceInventory?.(card)),
    createButton("取消", () => handlers.onCancel?.(card)),
  ]));
  return root;
}

export function renderSubmitReviewConfirmationCard(card = {}, handlers = {}) {
  const root = createCardRoot("stage4-submit-review-card");
  root.appendChild(createTitle(card.title || "提交审核 / 发布商品前确认"));
  root.appendChild(createSmallText(card.productTitle || "抖店商品"));
  root.appendChild(createBlock("确认说明", card.description));
  root.appendChild(createBlock("类目", card.category || "待确认"));
  root.appendChild(createBlock("价格/库存", `价格：${card.price || "待确认"}\n库存：${card.inventory || "待确认"}`));
  root.appendChild(createActions([
    createButton("我手动提交", () => handlers.onManualSubmitReview?.(card)),
    createButton("取消", () => handlers.onCancel?.(card)),
  ]));
  return root;
}

export function renderDoudianListingPrepCardHtml(card = {}) {
  return `
    <div class="stage4-card stage4-doudian-listing-card">
      <div class="stage4-card__title">抖店上架准备卡</div>
      <div class="stage4-card__small">${card.submitButtonFound ? "已定位提交审核按钮，未点击" : "提交审核按钮未定位或未接入"}</div>
      ${renderBlockHtml("商品标题", card.productTitle)}
      ${renderBlockHtml("类目", card.category || "待确认")}
      ${renderBlockHtml("商品详情", card.description)}
      ${renderBlockHtml("卖点", (card.sellingPoints || []).join("\n"))}
      ${renderBlockHtml("规格", (card.specs || []).join("\n"))}
      ${renderBlockHtml("价格/库存", `价格：${card.price || "待确认"}\n库存：${card.inventory || "待确认"}`)}
      ${renderBlockHtml("图片", [...(card.images || []), ...(card.detailImages || [])].join("\n"))}
      ${renderScreenshotHtml(card.previewScreenshot)}
      ${card.note ? `<div class="stage4-card__note">${escapeHtml(card.note)}</div>` : ""}
    </div>
  `;
}

export function renderPriceInventoryConfirmationCardHtml(card = {}) {
  return `
    <div class="stage4-card stage4-price-inventory-card">
      <div class="stage4-card__title">${escapeHtml(card.title || "价格和库存需要确认")}</div>
      <div class="stage4-card__small">${escapeHtml(card.productTitle || "抖店商品")}</div>
      ${renderBlockHtml("确认说明", card.description)}
      ${renderBlockHtml("价格/库存", `价格：${card.price || "待确认"}\n库存：${card.inventory || "待确认"}`)}
    </div>
  `;
}

export function renderSubmitReviewConfirmationCardHtml(card = {}) {
  return `
    <div class="stage4-card stage4-submit-review-card">
      <div class="stage4-card__title">${escapeHtml(card.title || "提交审核 / 发布商品前确认")}</div>
      <div class="stage4-card__small">${escapeHtml(card.productTitle || "抖店商品")}</div>
      ${renderBlockHtml("确认说明", card.description)}
      ${renderBlockHtml("类目", card.category || "待确认")}
      ${renderBlockHtml("价格/库存", `价格：${card.price || "待确认"}\n库存：${card.inventory || "待确认"}`)}
      ${renderScreenshotHtml(card.previewScreenshot)}
    </div>
  `;
}

function createCardRoot(extraClass) {
  const root = document.createElement("div");
  root.className = `stage4-card ${extraClass}`;
  return root;
}

function createTitle(text) {
  const el = document.createElement("div");
  el.className = "stage4-card__title";
  el.textContent = text;
  return el;
}

function createSmallText(text) {
  const el = document.createElement("div");
  el.className = "stage4-card__small";
  el.textContent = text;
  return el;
}

function createBlock(title, body) {
  const root = document.createElement("div");
  root.className = "stage4-card__block";
  const heading = document.createElement("div");
  heading.className = "stage4-card__block-title";
  heading.textContent = title;
  const content = document.createElement("div");
  content.className = "stage4-card__block-body";
  content.textContent = body || "未填写或暂未接入";
  root.appendChild(heading);
  root.appendChild(content);
  return root;
}

function createNote(text) {
  const el = document.createElement("div");
  el.className = "stage4-card__note";
  el.textContent = text;
  return el;
}

function createActions(buttons) {
  const root = document.createElement("div");
  root.className = "stage4-card__actions";
  for (const button of buttons) root.appendChild(button);
  return root;
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage4-card__button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderBlockHtml(title, body) {
  const value = String(body || "").trim();
  if (!value) return "";
  return `
    <div class="stage4-card__block">
      <div class="stage4-card__block-title">${escapeHtml(title)}</div>
      <div class="stage4-card__block-body">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderScreenshotHtml(screenshot = null) {
  const imageUrl = screenshot?.imageUrl || screenshot?.url || screenshot?.path || "";
  if (!imageUrl) return "";
  return `<img class="stage4-card__image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(screenshot?.title || "抖店提交审核前截图")}" loading="lazy">`;
}

function serializeListing(card) {
  return [
    `商品标题：${card.productTitle || ""}`,
    "",
    `类目：${card.category || ""}`,
    "",
    "商品详情：",
    card.description || "",
    "",
    "卖点：",
    ...(card.sellingPoints || []),
    "",
    "规格：",
    ...(card.specs || []),
    "",
    `价格：${card.price || "待确认"}`,
    `库存：${card.inventory || "待确认"}`,
    "",
    "图片：",
    ...(card.images || []),
    ...(card.detailImages || []),
    "",
    card.note || "",
  ].filter(Boolean).join("\n");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
