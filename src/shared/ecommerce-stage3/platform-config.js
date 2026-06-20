import { getStage3PublishUrl } from "./feature-flag.js";
import { Stage3Platform, Stage3PlatformKind } from "./types.js";

export const CONTENT_PLATFORMS = Object.freeze([
  Stage3Platform.DOUYIN,
  Stage3Platform.KUAISHOU,
  Stage3Platform.WECHAT_CHANNELS,
  Stage3Platform.XIAOHONGSHU,
]);

export const SHOP_PLATFORMS = Object.freeze([
  Stage3Platform.TMALL,
  Stage3Platform.TAOBAO,
  Stage3Platform.PINDUODUO,
]);

export const STAGE3_PLATFORM_CONFIG = Object.freeze({
  [Stage3Platform.DOUYIN]: Object.freeze({
    platform: Stage3Platform.DOUYIN,
    kind: Stage3PlatformKind.CONTENT,
    label: "抖音",
    publishUrlEnv: "VITE_STAGE3_DOUYIN_PUBLISH_URL",
    titleHints: ["标题", "作品标题", "请输入标题"],
    descriptionHints: ["简介", "描述", "添加描述", "说点什么"],
    tagHints: ["话题", "标签", "添加话题", "#"],
    uploadHints: ["上传视频", "上传作品", "选择视频", "上传"],
    coverHints: ["封面", "选择封面", "设置封面"],
    finalButtonHints: ["发布", "立即发布"],
    style: "短、直接、有钩子，前 3 秒抓注意力。",
  }),
  [Stage3Platform.KUAISHOU]: Object.freeze({
    platform: Stage3Platform.KUAISHOU,
    kind: Stage3PlatformKind.CONTENT,
    label: "快手",
    publishUrlEnv: "VITE_STAGE3_KUAISHOU_PUBLISH_URL",
    titleHints: ["标题", "作品标题", "请输入标题"],
    descriptionHints: ["简介", "描述", "说点什么", "文案"],
    tagHints: ["话题", "标签", "#"],
    uploadHints: ["上传视频", "上传作品", "选择视频", "上传"],
    coverHints: ["封面", "选择封面", "设置封面"],
    finalButtonHints: ["发布", "立即发布"],
    style: "接地气、口语化、有真实感。",
  }),
  [Stage3Platform.WECHAT_CHANNELS]: Object.freeze({
    platform: Stage3Platform.WECHAT_CHANNELS,
    kind: Stage3PlatformKind.CONTENT,
    label: "视频号",
    publishUrlEnv: "VITE_STAGE3_WECHAT_CHANNELS_PUBLISH_URL",
    titleHints: ["标题", "作品标题", "请输入标题"],
    descriptionHints: ["描述", "简介", "说点什么", "视频描述"],
    tagHints: ["话题", "标签", "#"],
    uploadHints: ["上传视频", "上传", "选择视频"],
    coverHints: ["封面", "设置封面"],
    finalButtonHints: ["发表", "发布", "提交"],
    style: "稳重、可信、适合私域和熟人社交传播。",
  }),
  [Stage3Platform.XIAOHONGSHU]: Object.freeze({
    platform: Stage3Platform.XIAOHONGSHU,
    kind: Stage3PlatformKind.CONTENT,
    label: "小红书",
    publishUrlEnv: "VITE_STAGE3_XIAOHONGSHU_PUBLISH_URL",
    titleHints: ["标题", "笔记标题", "填写标题"],
    descriptionHints: ["正文", "笔记正文", "分享你的经验", "描述"],
    tagHints: ["话题", "标签", "添加话题", "#"],
    uploadHints: ["上传图片", "上传视频", "选择图片", "选择视频", "上传"],
    coverHints: ["封面", "设置封面"],
    finalButtonHints: ["发布", "立即发布"],
    style: "种草感、体验感、生活化，有使用场景。",
  }),
  [Stage3Platform.TMALL]: Object.freeze({
    platform: Stage3Platform.TMALL,
    kind: Stage3PlatformKind.SHOP,
    label: "天猫",
    publishUrlEnv: "VITE_STAGE3_TMALL_PUBLISH_URL",
    titleHints: ["商品标题", "宝贝标题", "标题"],
    descriptionHints: ["商品详情", "详情描述", "详情页", "卖点描述"],
    tagHints: ["关键词", "属性词", "卖点", "标签"],
    uploadHints: ["上传主图", "上传图片", "商品图片", "主图", "详情图"],
    coverHints: ["主图", "商品主图"],
    finalButtonHints: ["提交审核", "发布商品", "立即上架", "提交"],
    style: "品牌感、可信度、参数清楚、转化导向。",
  }),
  [Stage3Platform.TAOBAO]: Object.freeze({
    platform: Stage3Platform.TAOBAO,
    kind: Stage3PlatformKind.SHOP,
    label: "淘宝",
    publishUrlEnv: "VITE_STAGE3_TAOBAO_PUBLISH_URL",
    titleHints: ["商品标题", "宝贝标题", "标题"],
    descriptionHints: ["商品详情", "详情描述", "卖点", "详情页"],
    tagHints: ["关键词", "属性词", "卖点", "标签"],
    uploadHints: ["上传主图", "上传图片", "商品图片", "主图", "详情图"],
    coverHints: ["主图", "商品主图"],
    finalButtonHints: ["发布商品", "立即上架", "提交审核", "提交"],
    style: "搜索关键词清楚、卖点直接、适合自然流量搜索。",
  }),
  [Stage3Platform.PINDUODUO]: Object.freeze({
    platform: Stage3Platform.PINDUODUO,
    kind: Stage3PlatformKind.SHOP,
    label: "拼多多",
    publishUrlEnv: "VITE_STAGE3_PINDUODUO_PUBLISH_URL",
    titleHints: ["商品标题", "标题"],
    descriptionHints: ["商品详情", "商品描述", "卖点", "详情"],
    tagHints: ["关键词", "属性", "卖点", "标签"],
    uploadHints: ["上传主图", "上传图片", "商品图片", "主图", "详情图"],
    coverHints: ["主图", "商品主图"],
    finalButtonHints: ["提交审核", "发布商品", "立即上架", "提交"],
    style: "价格感、利益点、规格清楚、转化直接。",
  }),
});

export function getStage3PlatformConfig(platform) {
  const key = String(platform || "").toLowerCase();
  const config = STAGE3_PLATFORM_CONFIG[key];
  if (!config) return null;

  return {
    ...config,
    publishUrl: getStage3PublishUrl(key),
  };
}

export function listStage3Platforms(platforms) {
  const values = Array.isArray(platforms) ? platforms : [platforms];
  const expanded = values.flatMap((platform) => {
    const key = String(platform || "").toLowerCase();
    if (key === Stage3Platform.ALL) return [...CONTENT_PLATFORMS, ...SHOP_PLATFORMS];
    if (key === Stage3Platform.ALL_CONTENT) return CONTENT_PLATFORMS;
    if (key === Stage3Platform.ALL_SHOP) return SHOP_PLATFORMS;
    return [key];
  });

  return Array.from(
    new Set(
      expanded
        .map((platform) => String(platform || "").toLowerCase())
        .filter((platform) => STAGE3_PLATFORM_CONFIG[platform]),
    ),
  );
}

export function isContentPlatform(platform) {
  return CONTENT_PLATFORMS.includes(String(platform || "").toLowerCase());
}

export function isShopPlatform(platform) {
  return SHOP_PLATFORMS.includes(String(platform || "").toLowerCase());
}
