import { Stage1MessageType } from "./types.js";

export function isStage1CardMessage(message) {
  return (
    message?.type === Stage1MessageType.SCREENSHOT_CARD ||
    message?.type === Stage1MessageType.USER_CONFIRMATION
  );
}

export function renderStage1CardMessage(message, handlers = {}) {
  if (message?.type === Stage1MessageType.SCREENSHOT_CARD) {
    return renderScreenshotCard(message.card, handlers);
  }

  if (message?.type === Stage1MessageType.USER_CONFIRMATION) {
    return renderConfirmationCard(message.confirmation, handlers);
  }

  return null;
}

export function renderScreenshotCard(card = {}, handlers = {}) {
  const root = document.createElement("div");
  root.className = "stage1-card stage1-screenshot-card";

  const header = document.createElement("div");
  header.className = "stage1-card__header";

  const title = document.createElement("div");
  title.className = "stage1-card__title";
  title.textContent = card.title || "页面截图";

  const time = document.createElement("div");
  time.className = "stage1-card__time";
  time.textContent = formatTime(card.createdAt);

  header.appendChild(title);
  header.appendChild(time);

  const image = document.createElement("img");
  image.className = "stage1-screenshot-card__image";
  image.src = card.imageUrl || "";
  image.alt = card.title || "页面截图";
  image.loading = "lazy";

  const note = document.createElement("div");
  note.className = "stage1-card__note";
  note.textContent = card.note || "";

  const footer = document.createElement("div");
  footer.className = "stage1-card__actions";

  const openButton = createButton("放大查看", () => {
    if (typeof handlers.onOpenScreenshot === "function") {
      handlers.onOpenScreenshot(card);
      return;
    }

    if (card.imageUrl) {
      window.open(card.imageUrl, "_blank", "noopener,noreferrer");
    }
  });

  const saveButton = createButton("保存", () => {
    handlers.onSaveScreenshot?.(card);
  });

  footer.appendChild(openButton);
  footer.appendChild(saveButton);

  root.appendChild(header);
  if (card.imageUrl) root.appendChild(image);
  if (card.note) root.appendChild(note);
  root.appendChild(footer);

  return root;
}

export function renderConfirmationCard(confirmation = {}, handlers = {}) {
  const root = document.createElement("div");
  root.className = "stage1-card stage1-confirmation-card";

  const title = document.createElement("div");
  title.className = "stage1-card__title";
  title.textContent = confirmation.title || "需要你确认";

  const desc = document.createElement("div");
  desc.className = "stage1-card__note";
  desc.textContent = confirmation.description || "该操作需要确认。";

  const meta = document.createElement("div");
  meta.className = "stage1-confirmation-card__meta";

  if (confirmation.platform) {
    meta.appendChild(createMetaItem("平台", confirmation.platform));
  }

  if (confirmation.amount) {
    meta.appendChild(createMetaItem("金额", confirmation.amount));
  }

  const actions = document.createElement("div");
  actions.className = "stage1-card__actions";

  const approve = createButton("确认继续", () => {
    handlers.onConfirm?.(confirmation);
    root.dispatchEvent(
      new CustomEvent("stage1-confirmation:approve", {
        detail: confirmation,
        bubbles: true,
      }),
    );
  });
  approve.classList.add("stage1-card__button--primary");

  const reject = createButton("取消", () => {
    handlers.onReject?.(confirmation);
    root.dispatchEvent(
      new CustomEvent("stage1-confirmation:reject", {
        detail: confirmation,
        bubbles: true,
      }),
    );
  });
  reject.classList.add("stage1-card__button--danger");

  actions.appendChild(approve);
  actions.appendChild(reject);

  root.appendChild(title);
  root.appendChild(desc);
  if (meta.childNodes.length) root.appendChild(meta);
  root.appendChild(actions);

  return root;
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage1-card__button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createMetaItem(label, value) {
  const item = document.createElement("div");
  item.className = "stage1-confirmation-card__meta-item";
  item.textContent = `${label}：${value}`;
  return item;
}

function formatTime(value) {
  try {
    return new Date(value || Date.now()).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
