import { Stage56MessageType } from "./types.js";

export function isStage56CardMessage(message = {}) {
  return [
    Stage56MessageType.LIVE_REPLY_CARD,
    Stage56MessageType.LIVE_REPLY_CONFIRMATION_CARD,
    Stage56MessageType.VIDEO_CANDIDATE_CARD,
    Stage56MessageType.VIDEO_DECOMPOSE_CARD,
    Stage56MessageType.MATERIAL_RECORD_CARD,
  ].includes(message.type);
}

export function renderStage56CardMessage(message = {}, handlers = {}) {
  if (message.type === Stage56MessageType.LIVE_REPLY_CARD) return renderLiveReplyCard(message.card || message, handlers);
  if (message.type === Stage56MessageType.LIVE_REPLY_CONFIRMATION_CARD) return renderLiveReplyConfirmationCard(message.card || message, handlers);
  if (message.type === Stage56MessageType.VIDEO_CANDIDATE_CARD) return renderVideoCandidateCard(message.card || message, handlers);
  if (message.type === Stage56MessageType.VIDEO_DECOMPOSE_CARD) return renderVideoDecomposeCard(message.card || message, handlers);
  if (message.type === Stage56MessageType.MATERIAL_RECORD_CARD) return renderMaterialRecordCard(message.card || message, handlers);
  return document.createTextNode("");
}

export function renderStage56CardMessageHtml(message = {}) {
  if (message.type === Stage56MessageType.LIVE_REPLY_CARD) return renderLiveReplyCardHtml(message.card || message);
  if (message.type === Stage56MessageType.LIVE_REPLY_CONFIRMATION_CARD) return renderLiveReplyConfirmationCardHtml(message.card || message);
  if (message.type === Stage56MessageType.VIDEO_CANDIDATE_CARD) return renderVideoCandidateCardHtml(message.card || message);
  if (message.type === Stage56MessageType.VIDEO_DECOMPOSE_CARD) return renderVideoDecomposeCardHtml(message.card || message);
  if (message.type === Stage56MessageType.MATERIAL_RECORD_CARD) return renderMaterialRecordCardHtml(message.card || message);
  return "";
}

function renderLiveReplyCard(card = {}, handlers = {}) {
  const root = createRoot("stage56-live-reply-card");
  root.appendChild(createTitle("直播公屏回复建议"));
  root.appendChild(createSmall(`${card.platform || "直播间"} · ${card.replies?.length || 0} 条建议`));
  root.appendChild(createBlock("公屏问题", summarizeComments(card.classified || card.comments || [])));
  root.appendChild(createBlock("回复建议", summarizeReplies(card.replies || [])));
  if (card.note) root.appendChild(createNote(card.note));
  root.appendChild(createActions([
    createButton("复制回复", () => handlers.onCopy?.(summarizeReplies(card.replies || []))),
  ]));
  return root;
}

function renderLiveReplyConfirmationCard(card = {}, handlers = {}) {
  const root = createRoot("stage56-live-confirm-card");
  root.appendChild(createTitle(card.title || "公屏回复发送前确认"));
  root.appendChild(createSmall(card.platform || "直播间"));
  root.appendChild(createBlock("观众问题", card.comment || ""));
  root.appendChild(createBlock("回复草稿", card.reply || ""));
  root.appendChild(createNote(card.description || "发送前必须由用户确认。"));
  root.appendChild(createActions([
    createButton("我手动发送", () => handlers.onManualSend?.(card)),
    createButton("取消", () => handlers.onCancel?.(card)),
  ]));
  return root;
}

function renderVideoCandidateCard(card = {}, handlers = {}) {
  const root = createRoot("stage56-video-candidate-card");
  root.appendChild(createTitle("候选视频"));
  root.appendChild(createSmall(`${card.platform || "平台"} · 分数 ${card.score || 0} · ${card.decision || "need_review"}`));
  root.appendChild(createBlock("标题", card.title || ""));
  root.appendChild(createBlock("链接", card.url || ""));
  root.appendChild(createBlock("推荐原因", card.reason || ""));
  root.appendChild(createBlock("可见数据", JSON.stringify(card.visibleMetrics || {}, null, 2)));
  root.appendChild(createActions([
    createButton("复制链接", () => handlers.onCopy?.(card.url || "")),
    createButton("交给 Hermes", () => handlers.onDecompose?.(card)),
  ]));
  return root;
}

function renderVideoDecomposeCard(card = {}, handlers = {}) {
  const root = createRoot("stage56-video-decompose-card");
  root.appendChild(createTitle("视频拆解"));
  root.appendChild(createSmall(`${card.platform || "平台"} · ${card.title || "候选视频"}`));
  if (card.summary) root.appendChild(createBlock("摘要", card.summary));
  root.appendChild(createPre("拆解结果", typeof card.decomposition === "string" ? card.decomposition : JSON.stringify(card.decomposition || {}, null, 2)));
  root.appendChild(createActions([
    createButton("复制拆解", () => handlers.onCopy?.(card.summary || JSON.stringify(card.decomposition || {}, null, 2))),
  ]));
  return root;
}

function renderMaterialRecordCard(card = {}, handlers = {}) {
  const root = createRoot("stage56-material-record-card");
  const record = card.record || {};
  root.appendChild(createTitle("已加入素材库"));
  root.appendChild(createBlock("素材记录", summarizeMaterialRecord(record)));
  root.appendChild(createActions([
    createButton("复制素材信息", () => handlers.onCopy?.(summarizeMaterialRecord(record))),
  ]));
  return root;
}

function renderLiveReplyCardHtml(card = {}) {
  return `
    <div class="stage56-card stage56-live-reply-card">
      <div class="stage56-card__title">直播公屏回复建议</div>
      <div class="stage56-card__small">${escapeHtml(card.platform || "直播间")} · ${card.replies?.length || 0} 条建议</div>
      ${renderBlockHtml("公屏问题", summarizeComments(card.classified || card.comments || []))}
      ${renderBlockHtml("回复建议", summarizeReplies(card.replies || []))}
      ${renderScreenshotHtml(card.screenshot)}
      ${card.note ? `<div class="stage56-card__note">${escapeHtml(card.note)}</div>` : ""}
    </div>
  `;
}

function renderLiveReplyConfirmationCardHtml(card = {}) {
  return `
    <div class="stage56-card stage56-live-confirm-card">
      <div class="stage56-card__title">${escapeHtml(card.title || "公屏回复发送前确认")}</div>
      <div class="stage56-card__small">${escapeHtml(card.platform || "直播间")}</div>
      ${renderBlockHtml("观众问题", card.comment || "")}
      ${renderBlockHtml("回复草稿", card.reply || "")}
      ${card.description ? `<div class="stage56-card__note">${escapeHtml(card.description)}</div>` : ""}
    </div>
  `;
}

function renderVideoCandidateCardHtml(card = {}) {
  return `
    <div class="stage56-card stage56-video-candidate-card">
      <div class="stage56-card__title">候选视频</div>
      <div class="stage56-card__small">${escapeHtml(card.platform || "平台")} · 分数 ${escapeHtml(card.score || 0)} · ${escapeHtml(card.decision || "need_review")}</div>
      ${renderBlockHtml("标题", card.title || "")}
      ${renderBlockHtml("链接", card.url || "")}
      ${renderBlockHtml("推荐原因", card.reason || "")}
      ${renderBlockHtml("可见数据", JSON.stringify(card.visibleMetrics || {}, null, 2))}
      ${renderScreenshotHtml(card.screenshot)}
    </div>
  `;
}

function renderVideoDecomposeCardHtml(card = {}) {
  return `
    <div class="stage56-card stage56-video-decompose-card">
      <div class="stage56-card__title">视频拆解</div>
      <div class="stage56-card__small">${escapeHtml(card.platform || "平台")} · ${escapeHtml(card.title || "候选视频")}</div>
      ${renderBlockHtml("摘要", card.summary || "")}
      ${renderPreHtml("拆解结果", typeof card.decomposition === "string" ? card.decomposition : JSON.stringify(card.decomposition || {}, null, 2))}
      ${renderScreenshotHtml(card.screenshot)}
    </div>
  `;
}

function renderMaterialRecordCardHtml(card = {}) {
  const record = card.record || {};
  return `
    <div class="stage56-card stage56-material-record-card">
      <div class="stage56-card__title">已加入素材库</div>
      ${renderBlockHtml("素材记录", summarizeMaterialRecord(record))}
    </div>
  `;
}

function createRoot(extraClass) {
  const root = document.createElement("div");
  root.className = `stage56-card ${extraClass}`;
  return root;
}

function createTitle(text) {
  const el = document.createElement("div");
  el.className = "stage56-card__title";
  el.textContent = text;
  return el;
}

function createSmall(text) {
  const el = document.createElement("div");
  el.className = "stage56-card__small";
  el.textContent = text;
  return el;
}

function createBlock(label, value) {
  const root = document.createElement("div");
  root.className = "stage56-card__block";
  const title = document.createElement("div");
  title.className = "stage56-card__block-title";
  title.textContent = label;
  const body = document.createElement("div");
  body.className = "stage56-card__block-body";
  body.textContent = value || "";
  root.appendChild(title);
  root.appendChild(body);
  return root;
}

function createPre(label, value) {
  const root = createBlock(label, "");
  const pre = document.createElement("pre");
  pre.className = "stage56-card__pre";
  pre.textContent = value || "";
  root.appendChild(pre);
  return root;
}

function createNote(text) {
  const el = document.createElement("div");
  el.className = "stage56-card__note";
  el.textContent = text;
  return el;
}

function createActions(buttons) {
  const root = document.createElement("div");
  root.className = "stage56-card__actions";
  for (const button of buttons) root.appendChild(button);
  return root;
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage56-card__button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderBlockHtml(label, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `
    <div class="stage56-card__block">
      <div class="stage56-card__block-title">${escapeHtml(label)}</div>
      <div class="stage56-card__block-body">${escapeHtml(text)}</div>
    </div>
  `;
}

function renderPreHtml(label, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `
    <div class="stage56-card__block">
      <div class="stage56-card__block-title">${escapeHtml(label)}</div>
      <pre class="stage56-card__pre">${escapeHtml(text)}</pre>
    </div>
  `;
}

function renderScreenshotHtml(screenshot = null) {
  const imageUrl = screenshot?.imageUrl || screenshot?.url || screenshot?.path || "";
  if (!imageUrl) return "";
  return `<img class="stage56-card__image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(screenshot?.title || "页面截图")}" loading="lazy">`;
}

function summarizeComments(comments = []) {
  return comments.map((item, index) => `${index + 1}. ${item.text || item.comment || item} ${item.questionType ? `(${item.questionType})` : ""}`).join("\n");
}

function summarizeReplies(replies = []) {
  return replies.map((item, index) => `${index + 1}. ${item.comment || ""}\n回复：${item.reply || ""}`).join("\n\n");
}

function summarizeMaterialRecord(record = {}) {
  return [
    `标题：${record.title || ""}`,
    `平台：${record.platform || ""}`,
    `链接：${record.url || ""}`,
    `作者：${record.author || ""}`,
    `分数：${record.score || 0}`,
    `推荐原因：${record.reason || ""}`,
    record.riskNote || "",
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
