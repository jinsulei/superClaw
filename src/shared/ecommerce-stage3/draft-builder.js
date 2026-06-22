import { getStage3PlatformConfig, isShopPlatform, listStage3Platforms } from "./platform-config.js";
import { Stage3PlatformKind } from "./types.js";

const DEFAULT_KEYWORDS = ["显瘦", "通勤", "百搭", "质感", "日常"];

export function buildStage3PlatformDraft({
  platform,
  query = "",
  product = "",
  keywords = [],
  stage2Draft = null,
} = {}) {
  const config = getStage3PlatformConfig(platform);
  if (!config) return null;

  const normalizedKeywords = normalizeKeywords([
    ...normalizeKeywords(keywords),
    ...extractKeywordsFromDraft(stage2Draft),
    ...extractKeywords(query),
    ...DEFAULT_KEYWORDS,
  ]).slice(0, 10);
  const main = product || inferProduct(query, normalizedKeywords) || "商品";

  if (isShopPlatform(config.platform)) {
    return buildShopDraft(config, main, normalizedKeywords, query, stage2Draft);
  }

  return buildContentDraft(config, main, normalizedKeywords, query, stage2Draft);
}

export function buildStage3Drafts({
  platforms = [],
  query = "",
  product = "",
  keywords = [],
  stage2Draft = null,
} = {}) {
  return listStage3Platforms(platforms).map((platform) =>
    buildStage3PlatformDraft({
      platform,
      query,
      product,
      keywords,
      stage2Draft,
    }),
  ).filter(Boolean);
}

function buildContentDraft(config, main, keywords, query, stage2Draft) {
  const [k1, k2, k3, k4] = keywords;
  const titleByPlatform = {
    douyin: `${main}这样搭，真的很${k1}`,
    kuaishou: `${main}别瞎买，先看这个上身效果`,
    wechat_channels: `${main}日常实穿分享：${k1}又${k2}`,
    xiaohongshu: `${main}种草｜${k1}${k2}的日常搭配`,
  };
  const descriptionByPlatform = {
    douyin: `开头展示效果，再讲 ${k1}、${k2}、${k3} 三个点。适合想要快速看上身效果的人。`,
    kuaishou: `这款${main}比较适合日常穿，重点看版型和舒适度。想要${k1}、${k2}的可以重点看。`,
    wechat_channels: `今天分享一款适合日常场景的${main}。它的关键词是${k1}、${k2}和${k3}，整体更偏稳妥实穿。`,
    xiaohongshu: `先说适合谁：想要${k1}、${k2}、不费力搭配的姐妹可以看。优点写清楚，避坑点也保留，整体做真实体验感。`,
  };

  return {
    platform: config.platform,
    platformLabel: config.label,
    kind: Stage3PlatformKind.CONTENT,
    title: stage2Draft?.shortVideoTitles?.[0] || titleByPlatform[config.platform] || `${main}${k1}分享`,
    description: stage2Draft?.platformDrafts?.find((item) => item.platform === config.platform)?.body || descriptionByPlatform[config.platform] || query,
    tags: keywords.slice(0, 6).map((word) => word.startsWith("#") ? word : `#${word}`),
    sellingPoints: [],
    productKeywords: [],
    style: config.style,
  };
}

function buildShopDraft(config, main, keywords, query, stage2Draft) {
  const [k1, k2, k3, k4] = keywords;
  const title = stage2Draft?.productTitles?.[0] || `${k1}${k2}${main} ${k3}${k4}日常款`;
  const sellingPoints = unique([
    ...(stage2Draft?.sellingPoints || []),
    `突出${k1}、${k2}和${k3}，让搜索关键词和卖点保持一致。`,
    "详情页建议按适合人群、版型/材质、使用场景、尺码建议来组织。",
    "价格和库存第三阶段不自动填写，需要用户手动确认。",
  ]).slice(0, 6);

  return {
    platform: config.platform,
    platformLabel: config.label,
    kind: Stage3PlatformKind.SHOP,
    title,
    description: `商品详情建议：\n1. 核心卖点：${sellingPoints[0] || `${k1}${k2}`}\n2. 适合场景：日常、通勤、出门搭配。\n3. 适合人群：关注${k1}、${k2}和${k3}的用户。\n4. 购买提示：尺码、颜色、材质以页面实际填写为准。`,
    tags: keywords.slice(0, 5),
    sellingPoints,
    productKeywords: unique([main, ...keywords]).slice(0, 10),
    style: config.style,
    sourceQuery: query,
  };
}

function normalizeKeywords(input = []) {
  const arr = Array.isArray(input) ? input : [input];
  return unique(
    arr
      .map((item) => typeof item === "string" ? item : item?.keyword || item?.title || "")
      .join(" ")
      .split(/[\s,，、|｜/#]+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && word.length <= 18),
  );
}

function extractKeywords(text = "") {
  const matches = String(text || "").match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) || [];
  return matches.filter((word) => !/帮我|发布|上传|视频|图片|抖音|快手|视频号|小红书|天猫|淘宝|拼多多|确认|提交|上架|商品|素材/.test(word));
}

function extractKeywordsFromDraft(draft = null) {
  if (!draft) return [];
  return normalizeKeywords([
    ...(draft.keywords || []),
    ...(draft.productTitles || []),
    ...(draft.shortVideoTitles || []),
    ...(draft.sellingPoints || []),
  ]);
}

function inferProduct(query, keywords) {
  const text = String(query || "");
  const match = text.match(/(?:商品|产品|宝贝|主推|发布|上架)(?:标题|名|名称)?[：:\s]*([\u4e00-\u9fa5A-Za-z0-9]{2,16})/);
  if (match?.[1] && !/到|前|让我|直接|上传|发布|上架/.test(match[1])) return match[1];
  return keywords.find((word) => !DEFAULT_KEYWORDS.includes(word)) || "";
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}
