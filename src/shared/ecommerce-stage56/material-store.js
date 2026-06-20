import { createId } from "./types.js";

export function createMaterialRecord({
  id,
  platform = "",
  url = "",
  title = "",
  author = "",
  screenshot = null,
  visibleMetrics = {},
  reason = "",
  score = 0,
  decomposition = null,
  tags = [],
  createdAt = Date.now(),
} = {}) {
  return {
    id: id || createId("material"),
    platform,
    url,
    title,
    author,
    screenshot,
    visibleMetrics,
    reason,
    score,
    decomposition,
    tags,
    createdAt,
    riskNote: "仅保存公开可见摘要、链接和截图引用，不下载受限内容，不搬运发布。",
  };
}

export async function saveMaterialRecord(input = {}, context = {}) {
  const record = createMaterialRecord(input);

  if (typeof context.materialStore?.save === "function") {
    return context.materialStore.save(record);
  }

  if (Array.isArray(context.materialRecords)) {
    context.materialRecords.push(record);
    return record;
  }

  return record;
}
