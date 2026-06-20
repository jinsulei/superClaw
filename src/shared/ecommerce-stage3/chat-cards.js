import { Stage3MessageType } from "./types.js";

export function isStage3CardMessage(message = {}) {
  return [
    Stage3MessageType.PLATFORM_PREP_CARD,
    Stage3MessageType.PLATFORM_CONFIRMATION_CARD,
  ].includes(message.type);
}

export function renderStage3CardMessage(message = {}, handlers = {}) {
  if (message.type === Stage3MessageType.PLATFORM_PREP_CARD) {
    return renderPlatformPrepCard(message.card || message, handlers);
  }
  if (message.type === Stage3MessageType.PLATFORM_CONFIRMATION_CARD) {
    return renderPlatformConfirmationCard(message.card || message, handlers);
  }
  return document.createTextNode("");
}

export function renderStage3CardMessageHtml(message = {}) {
  if (message.type === Stage3MessageType.PLATFORM_PREP_CARD) return renderPlatformPrepCardHtml(message.card || message);
  if (message.type === Stage3MessageType.PLATFORM_CONFIRMATION_CARD) return renderPlatformConfirmationCardHtml(message.card || message);
  return "";
}

export function renderPlatformPrepCard(card = {}, handlers = {}) {
  const root = createCardRoot("stage3-platform-prep-card");
  root.appendChild(createTitle(`${card.platformLabel || "平台"}准备卡`));
  root.appendChild(createSmallText(`${kindLabel(card.platformKind)} · ${card.finalButtonFound ? "已定位最终按钮" : "最终按钮未定位或未接入"}`));
  root.appendChild(createBlock("标题", card.title));
  root.appendChild(createBlock("正文/详情", card.description));
  root.appendChild(createBlock("标签/关键词", [...(card.tags || []), ...(card.productKeywords || [])].join(" ")));
  root.appendChild(createBlock("卖点", (card.sellingPoints || []).join("\n")));
  root.appendChild(createBlock("素材", (card.mediaFiles || []).join("\n")));
  if (card.note) root.appendChild(createNote(card.note));
  root.appendChild(createActions([
    createButton("复制草稿", () => handlers.onCopy?.(serializeCard(card))),
    createButton("查看截图", () => handlers.onOpenScreenshot?.(card.previewScreenshot)),
  ]));
  return root;
}

export function renderPlatformConfirmationCard(card = {}, handlers = {}) {
  const root = createCardRoot("stage3-platform-confirmation-card");
  root.appendChild(createTitle(card.title || "最终操作前确认"));
  root.appendChild(createSmallText(`${card.platformLabel || "平台"} · 第三阶段不会自动执行最终动作`));
  root.appendChild(createBlock("确认说明", card.description));
  root.appendChild(createBlock("待你手动确认的动作", card.action?.label || card.action?.type || "发布/提交/上架"));
  if (card.mediaFiles?.length) root.appendChild(createBlock("素材", card.mediaFiles.join("\n")));
  root.appendChild(createActions([
    createButton("我手动处理", () => handlers.onManualFinalAction?.(card)),
    createButton("取消", () => handlers.onCancel?.(card)),
  ]));
  return root;
}

export function renderPlatformPrepCardHtml(card = {}) {
  return `
    <div class="stage3-card stage3-platform-prep-card">
      <div class="stage3-card__title">${escapeHtml(card.platformLabel || "平台")}准备卡</div>
      <div class="stage3-card__small">${escapeHtml(kindLabel(card.platformKind))} · ${card.finalButtonFound ? "已定位最终按钮" : "最终按钮未定位或未接入"}</div>
      ${renderBlockHtml("标题", card.title)}
      ${renderBlockHtml("正文/详情", card.description)}
      ${renderBlockHtml("标签/关键词", [...(card.tags || []), ...(card.productKeywords || [])].join(" "))}
      ${renderBlockHtml("卖点", (card.sellingPoints || []).join("\n"))}
      ${renderBlockHtml("素材", (card.mediaFiles || []).join("\n"))}
      ${renderScreenshotHtml(card.previewScreenshot)}
      ${card.note ? `<div class="stage3-card__note">${escapeHtml(card.note)}</div>` : ""}
    </div>
  `;
}

export function renderPlatformConfirmationCardHtml(card = {}) {
  return `
    <div class="stage3-card stage3-platform-confirmation-card">
      <div class="stage3-card__title">${escapeHtml(card.title || "最终操作前确认")}</div>
      <div class="stage3-card__small">${escapeHtml(card.platformLabel || "平台")} · 第三阶段不会自动执行最终动作</div>
      ${renderBlockHtml("确认说明", card.description)}
      ${renderBlockHtml("待你手动确认的动作", card.action?.label || card.action?.type || "发布/提交/上架")}
      ${renderBlockHtml("素材", (card.mediaFiles || []).join("\n"))}
      ${renderScreenshotHtml(card.previewScreenshot)}
    </div>
  `;
}

function createCardRoot(extraClass) {
  const root = document.createElement("div");
  root.className = `stage3-card ${extraClass}`;
  return root;
}

function createTitle(text) {
  const title = document.createElement("div");
  title.className = "stage3-card__title";
  title.textContent = text;
  return title;
}

function createSmallText(text) {
  const el = document.createElement("div");
  el.className = "stage3-card__small";
  el.textContent = text;
  return el;
}

function createNote(text) {
  const note = document.createElement("div");
  note.className = "stage3-card__note";
  note.textContent = text;
  return note;
}

function createBlock(title, body) {
  const section = document.createElement("div");
  section.className = "stage3-card__block";
  const heading = document.createElement("div");
  heading.className = "stage3-card__block-title";
  heading.textContent = title;
  const content = document.createElement("div");
  content.className = "stage3-card__block-body";
  content.textContent = body || "未填写或暂未接入";
  section.appendChild(heading);
  section.appendChild(content);
  return section;
}

function createActions(buttons) {
  const actions = document.createElement("div");
  actions.className = "stage3-card__actions";
  for (const button of buttons) actions.appendChild(button);
  return actions;
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage3-card__button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderBlockHtml(title, body) {
  const value = String(body || "").trim();
  if (!value) return "";
  return `
    <div class="stage3-card__block">
      <div class="stage3-card__block-title">${escapeHtml(title)}</div>
      <div class="stage3-card__block-body">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderScreenshotHtml(screenshot = null) {
  const imageUrl = screenshot?.imageUrl || screenshot?.url || screenshot?.path || "";
  if (!imageUrl) return "";
  return `<img class="stage3-card__image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(screenshot?.title || "最终操作前截图")}" loading="lazy">`;
}

function serializeCard(card = {}) {
  return [
    `${card.platformLabel || "平台"}准备卡`,
    `标题：${card.title || ""}`,
    `正文/详情：${card.description || ""}`,
    `标签/关键词：${[...(card.tags || []), ...(card.productKeywords || [])].join(" ")}`,
    `卖点：${(card.sellingPoints || []).join("；")}`,
    `素材：${(card.mediaFiles || []).join("；")}`,
  ].join("\n");
}

function kindLabel(kind) {
  return kind === "shop" ? "电商商品" : "内容发布";
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
