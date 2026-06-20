import { Stage2MessageType } from "./types.js";

export function isStage2CardMessage(message = {}) {
  return [
    Stage2MessageType.TREND_INSIGHT_CARD,
    Stage2MessageType.CONTENT_DRAFT_CARD,
    Stage2MessageType.VIDEO_LINK_CARD,
  ].includes(message.type);
}

export function renderStage2CardMessage(message = {}, handlers = {}) {
  if (message.type === Stage2MessageType.TREND_INSIGHT_CARD) {
    return renderTrendInsightCard(message.card || message, handlers);
  }
  if (message.type === Stage2MessageType.CONTENT_DRAFT_CARD) {
    return renderContentDraftCard(message.card || message, handlers);
  }
  if (message.type === Stage2MessageType.VIDEO_LINK_CARD) {
    return renderVideoLinkCard(message.card || message, handlers);
  }
  return document.createTextNode("");
}

export function renderStage2CardMessageHtml(message = {}) {
  if (message.type === Stage2MessageType.TREND_INSIGHT_CARD) return renderTrendInsightCardHtml(message.card || message);
  if (message.type === Stage2MessageType.CONTENT_DRAFT_CARD) return renderContentDraftCardHtml(message.card || message);
  if (message.type === Stage2MessageType.VIDEO_LINK_CARD) return renderVideoLinkCardHtml(message.card || message);
  return "";
}

export function renderTrendInsightCard(card = {}, handlers = {}) {
  const root = createCardRoot("stage2-trend-card");
  root.appendChild(createTitle(card.title || "热词洞察"));
  root.appendChild(createSmallText(`${card.platformLabel || card.source || "平台"} · ${card.keyword || card.query || "关键词"}`));
  root.appendChild(createChips((card.keywords || []).slice(0, 12).map((item) => item.keyword || item)));
  root.appendChild(createListBlock("热词", card.groups?.hotKeywords || card.keywords || []));
  root.appendChild(createListBlock("关联词", card.groups?.relatedKeywords || []));
  root.appendChild(createListBlock("飙升词", card.groups?.risingKeywords || []));
  root.appendChild(createListBlock("评论区关键词", card.groups?.commentKeywords || []));
  root.appendChild(createListBlock("商品标题关键词", card.groups?.productTitleKeywords || []));
  if (card.note) root.appendChild(createNote(card.note));
  root.appendChild(createActions([
    createButton("复制热词", () => handlers.onCopy?.((card.keywords || []).map((x) => x.keyword || x).join("、"))),
  ]));
  return root;
}

export function renderContentDraftCard(card = {}, handlers = {}) {
  const root = createCardRoot("stage2-draft-card");
  root.appendChild(createTitle(card.title || "内容草稿"));
  if (card.keyword || card.platformLabel) root.appendChild(createSmallText(`${card.platformLabel || "平台"} · ${card.keyword || card.category || ""}`));
  root.appendChild(createListBlock("商品标题", card.productTitles));
  root.appendChild(createListBlock("短视频标题", card.shortVideoTitles));
  root.appendChild(createListBlock("直播话术", card.liveScripts));
  root.appendChild(createListBlock("小红书种草文案", card.xiaohongshuNotes));
  root.appendChild(createListBlock("商品卖点", card.sellingPoints));

  if (card.platformDrafts?.length) {
    const section = document.createElement("div");
    section.className = "stage2-card__section";
    const title = document.createElement("div");
    title.className = "stage2-card__section-title";
    title.textContent = "平台草稿";
    section.appendChild(title);
    for (const draft of card.platformDrafts) {
      const item = document.createElement("div");
      item.className = "stage2-card__draft";
      item.textContent = `${draft.platform}：${draft.title}\n${draft.body}`;
      section.appendChild(item);
    }
    root.appendChild(section);
  }

  if (card.note) root.appendChild(createNote(card.note));
  root.appendChild(createActions([
    createButton("复制全部", () => handlers.onCopy?.(serializeDraft(card))),
  ]));
  return root;
}

export function renderVideoLinkCard(card = {}, handlers = {}) {
  const root = createCardRoot("stage2-video-card");
  root.appendChild(createTitle(card.title || "视频链接拆解"));
  root.appendChild(createSmallText(`平台：${card.platform || "unknown"} · 状态：${card.status || "pending"}`));
  const url = document.createElement("div");
  url.className = "stage2-card__url";
  url.textContent = card.url || "";
  root.appendChild(url);
  if (card.summary) root.appendChild(createNote(card.summary));
  if (card.decomposition) {
    const pre = document.createElement("pre");
    pre.className = "stage2-card__pre";
    pre.textContent = typeof card.decomposition === "string" ? card.decomposition : JSON.stringify(card.decomposition, null, 2);
    root.appendChild(pre);
  }
  if (card.note) root.appendChild(createNote(card.note));
  root.appendChild(createActions([
    createButton("复制链接", () => handlers.onCopy?.(card.url || "")),
    createButton("交给 Hermes", () => handlers.onDecompose?.(card)),
  ]));
  return root;
}

export function renderTrendInsightCardHtml(card = {}) {
  const chips = (card.keywords || []).slice(0, 12).map((item) => item.keyword || item);
  return `
    <div class="stage2-card stage2-trend-card">
      <div class="stage2-card__title">${escapeHtml(card.title || "热词洞察")}</div>
      <div class="stage2-card__small">${escapeHtml(card.platformLabel || card.source || "平台")} · ${escapeHtml(card.keyword || card.query || "关键词")}</div>
      ${renderChipsHtml(chips)}
      ${renderListBlockHtml("热词", card.groups?.hotKeywords || card.keywords || [])}
      ${renderListBlockHtml("关联词", card.groups?.relatedKeywords || [])}
      ${renderListBlockHtml("飙升词", card.groups?.risingKeywords || [])}
      ${renderListBlockHtml("评论区关键词", card.groups?.commentKeywords || [])}
      ${renderListBlockHtml("商品标题关键词", card.groups?.productTitleKeywords || [])}
      ${renderScreenshotHtml(card.screenshot)}
      ${card.note ? `<div class="stage2-card__note">${escapeHtml(card.note)}</div>` : ""}
    </div>
  `;
}

export function renderContentDraftCardHtml(card = {}) {
  return `
    <div class="stage2-card stage2-draft-card">
      <div class="stage2-card__title">${escapeHtml(card.title || "内容草稿")}</div>
      ${(card.keyword || card.platformLabel) ? `<div class="stage2-card__small">${escapeHtml(card.platformLabel || "平台")} · ${escapeHtml(card.keyword || card.category || "")}</div>` : ""}
      ${renderListBlockHtml("商品标题", card.productTitles)}
      ${renderListBlockHtml("短视频标题", card.shortVideoTitles)}
      ${renderListBlockHtml("直播话术", card.liveScripts)}
      ${renderListBlockHtml("小红书种草文案", card.xiaohongshuNotes)}
      ${renderListBlockHtml("商品卖点", card.sellingPoints)}
      ${renderPlatformDraftsHtml(card.platformDrafts || [])}
      ${card.note ? `<div class="stage2-card__note">${escapeHtml(card.note)}</div>` : ""}
    </div>
  `;
}

export function renderVideoLinkCardHtml(card = {}) {
  return `
    <div class="stage2-card stage2-video-card">
      <div class="stage2-card__title">${escapeHtml(card.title || "视频链接拆解")}</div>
      <div class="stage2-card__small">平台：${escapeHtml(card.platform || "unknown")} · 状态：${escapeHtml(card.status || "pending")}</div>
      <div class="stage2-card__url">${escapeHtml(card.url || "")}</div>
      ${card.summary ? `<div class="stage2-card__note">${escapeHtml(card.summary)}</div>` : ""}
      ${card.decomposition ? `<pre class="stage2-card__pre">${escapeHtml(typeof card.decomposition === "string" ? card.decomposition : JSON.stringify(card.decomposition, null, 2))}</pre>` : ""}
      ${card.note ? `<div class="stage2-card__note">${escapeHtml(card.note)}</div>` : ""}
    </div>
  `;
}

function createCardRoot(extraClass) {
  const root = document.createElement("div");
  root.className = `stage2-card ${extraClass}`;
  return root;
}

function createTitle(text) {
  const title = document.createElement("div");
  title.className = "stage2-card__title";
  title.textContent = text;
  return title;
}

function createSmallText(text) {
  const el = document.createElement("div");
  el.className = "stage2-card__small";
  el.textContent = text;
  return el;
}

function createNote(text) {
  const note = document.createElement("div");
  note.className = "stage2-card__note";
  note.textContent = text;
  return note;
}

function createChips(items = []) {
  const root = document.createElement("div");
  root.className = "stage2-card__chips";
  for (const item of items.filter(Boolean)) {
    const chip = document.createElement("span");
    chip.className = "stage2-card__chip";
    chip.textContent = item;
    root.appendChild(chip);
  }
  return root;
}

function createListBlock(titleText, items = []) {
  const normalized = normalizeItems(items);
  const section = document.createElement("div");
  section.className = "stage2-card__section";
  const title = document.createElement("div");
  title.className = "stage2-card__section-title";
  title.textContent = titleText;
  const list = document.createElement("ol");
  list.className = "stage2-card__list";
  for (const item of normalized) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
  section.appendChild(title);
  section.appendChild(list);
  return section;
}

function createActions(buttons) {
  const actions = document.createElement("div");
  actions.className = "stage2-card__actions";
  for (const button of buttons) actions.appendChild(button);
  return actions;
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage2-card__button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderChipsHtml(items = []) {
  const chips = normalizeItems(items);
  if (!chips.length) return "";
  return `<div class="stage2-card__chips">${chips.map((item) => `<span class="stage2-card__chip">${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderListBlockHtml(title, items = []) {
  const normalized = normalizeItems(items);
  if (!normalized.length) return "";
  return `
    <div class="stage2-card__section">
      <div class="stage2-card__section-title">${escapeHtml(title)}</div>
      <ol class="stage2-card__list">${normalized.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
    </div>
  `;
}

function renderPlatformDraftsHtml(drafts = []) {
  if (!drafts.length) return "";
  return `
    <div class="stage2-card__section">
      <div class="stage2-card__section-title">平台草稿</div>
      ${drafts.map((draft) => `<div class="stage2-card__draft">${escapeHtml(`${draft.platform}：${draft.title}\n${draft.body}`)}</div>`).join("")}
    </div>
  `;
}

function renderScreenshotHtml(screenshot = null) {
  const imageUrl = screenshot?.imageUrl || screenshot?.url || screenshot?.path || "";
  if (!imageUrl) return "";
  return `<img class="stage2-card__image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(screenshot?.title || "结果页截图")}" loading="lazy">`;
}

function normalizeItems(items = []) {
  const arr = Array.isArray(items) ? items : [items];
  return arr.map((item) => item?.keyword || item?.title || item).filter(Boolean).map(String);
}

function serializeDraft(card) {
  return [
    "商品标题：",
    ...(card.productTitles || []),
    "",
    "短视频标题：",
    ...(card.shortVideoTitles || []),
    "",
    "直播话术：",
    ...(card.liveScripts || []),
    "",
    "小红书种草文案：",
    ...(card.xiaohongshuNotes || []),
    "",
    "商品卖点：",
    ...(card.sellingPoints || []),
    "",
    "平台草稿：",
    ...(card.platformDrafts || []).map((draft) => `${draft.platform}：${draft.title}\n${draft.body}`),
  ].join("\n");
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
