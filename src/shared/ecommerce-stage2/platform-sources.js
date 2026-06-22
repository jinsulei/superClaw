export const Stage2Platform = Object.freeze({
  DOUYIN: "douyin",
  XIAOHONGSHU: "xiaohongshu",
  KUAISHOU: "kuaishou",
  DOUDIAN: "doudian",
  GENERAL: "general",
});

export const TREND_PLATFORM_SOURCES = Object.freeze({
  [Stage2Platform.DOUYIN]: Object.freeze({
    label: "抖音指数 / 巨量算数",
    envKey: "VITE_STAGE2_DOUYIN_TREND_URL",
    configKey: "stage2DouyinTrendUrl",
    searchBoxHints: ["搜索", "请输入关键词", "关键词"],
    resultHints: ["热词", "趋势", "关联词", "飙升词"],
  }),
  [Stage2Platform.XIAOHONGSHU]: Object.freeze({
    label: "小红书",
    envKey: "VITE_STAGE2_XIAOHONGSHU_SEARCH_URL",
    configKey: "stage2XiaohongshuSearchUrl",
    searchBoxHints: ["搜索", "大家都在搜"],
    resultHints: ["笔记", "相关搜索", "热门"],
  }),
  [Stage2Platform.KUAISHOU]: Object.freeze({
    label: "快手",
    envKey: "VITE_STAGE2_KUAISHOU_SEARCH_URL",
    configKey: "stage2KuaishouSearchUrl",
    searchBoxHints: ["搜索"],
    resultHints: ["视频", "直播", "相关"],
  }),
  [Stage2Platform.DOUDIAN]: Object.freeze({
    label: "抖店",
    envKey: "VITE_STAGE2_DOUDIAN_SEARCH_URL",
    configKey: "stage2DoudianSearchUrl",
    searchBoxHints: ["商品", "标题", "关键词"],
    resultHints: ["类目", "商品", "标题"],
  }),
  [Stage2Platform.GENERAL]: Object.freeze({
    label: "通用搜索",
    envKey: "VITE_STAGE2_GENERAL_SEARCH_URL",
    configKey: "stage2GeneralSearchUrl",
    searchBoxHints: ["搜索"],
    resultHints: ["结果"],
  }),
});

export function getTrendPlatformSource(platform = Stage2Platform.GENERAL) {
  return TREND_PLATFORM_SOURCES[platform] || TREND_PLATFORM_SOURCES[Stage2Platform.GENERAL];
}

export function listTrendPlatformSources() {
  return Object.entries(TREND_PLATFORM_SOURCES).map(([platform, source]) => ({
    platform,
    ...source,
  }));
}
