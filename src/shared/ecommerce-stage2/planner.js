import { containsHighRiskText } from "../ecommerce-stage1/risk-guard.js";
import { getStage2PlatformUrl } from "./feature-flag.js";
import { getTrendPlatformSource, Stage2Platform } from "./platform-sources.js";
import { Stage2ActionType, Stage2TaskKind } from "./types.js";
import { extractUrls } from "./trend-parser.js";

const STAGE2_HIGH_RISK_RE = /发布|发到|上架|下架|付款|支付|下单|改价|修改价格|改库存|修改库存|验证码|密码|登录|评论|回复公屏|私信|提交审核|自动发|自动上|自动付|自动评/;

export function detectPlatformFromUserText(userText = "") {
  const text = String(userText || "").toLowerCase();

  if (/巨量算数|抖音指数|douyin|抖音/.test(text)) return Stage2Platform.DOUYIN;
  if (/小红书|xiaohongshu|xhs/.test(text)) return Stage2Platform.XIAOHONGSHU;
  if (/快手|kuaishou/.test(text)) return Stage2Platform.KUAISHOU;
  if (/抖店|doudian|fxg|商品标题关键词|商品标题|店铺/.test(text)) return Stage2Platform.DOUDIAN;
  return Stage2Platform.GENERAL;
}

export function extractStage2Keyword(userText = "", platform = Stage2Platform.GENERAL) {
  const text = String(userText || "");
  const withoutUrls = text.replace(/https?:\/\/[^\s"'<>，。！？)）]+/g, " ");
  const platformWords = {
    [Stage2Platform.DOUYIN]: /抖音指数|巨量算数|抖音|douyin/gi,
    [Stage2Platform.XIAOHONGSHU]: /小红书|xiaohongshu|xhs/gi,
    [Stage2Platform.KUAISHOU]: /快手|kuaishou/gi,
    [Stage2Platform.DOUDIAN]: /抖店|doudian|fxg|店铺/gi,
    [Stage2Platform.GENERAL]: /通用搜索|搜索/gi,
  };

  const cleaned = withoutUrls
    .replace(platformWords[platform] || platformWords[Stage2Platform.GENERAL], " ")
    .replace(/帮我|请帮我|查一下|查查|查询|查|搜索|看看|找一下|分析|根据|这个|一下|今天|当前|页面/g, " ")
    .replace(/热词|趋势词|趋势|关联词|飙升词|关键词|标题关键词|商品标题关键词|商品标题|标题|短视频|视频|直播话术|文案|种草词|种草|卖点|生成|提取/g, " ")
    .replace(/[，。！？、,.!?;:：；()[\]{}<>《》“”"'`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned) return cleaned.slice(0, 40);

  const match = text.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,16}/g) || [];
  return match.find((word) => !/帮我|搜索|查询|热词|标题|关键词|抖音|快手|小红书|抖店/.test(word)) || "";
}

export function detectStage2Intent(userText = "") {
  const text = String(userText || "").trim();
  const urls = extractUrls(text);

  if (!text) {
    return {
      matched: false,
      intent: null,
      reason: "EMPTY_TEXT",
    };
  }

  if (isStage2HighRiskText(text)) {
    return {
      matched: false,
      intent: null,
      reason: "HIGH_RISK_TEXT_BLOCKED_BY_STAGE1",
      urls,
    };
  }

  if (urls.length > 0 && /拆解|分析|视频|链接|爆点|脚本|热词|标题/.test(text)) {
    return {
      matched: true,
      intent: Stage2TaskKind.VIDEO_LINK_DECOMPOSE,
      reason: "VIDEO_LINK_DECOMPOSE",
      urls,
    };
  }

  if (/热词|趋势|巨量算数|抖音指数|关键词|飙升词|关联词|商品标题关键词|种草词|大家都在搜/.test(text)) {
    return {
      matched: true,
      intent: Stage2TaskKind.PLATFORM_TREND_SEARCH,
      reason: "PLATFORM_TREND_SEARCH",
      urls,
    };
  }

  if (/商品标题|标题优化|标题关键词|电商标题/.test(text)) {
    return {
      matched: true,
      intent: Stage2TaskKind.GENERATE_PRODUCT_TITLES,
      reason: "GENERATE_PRODUCT_TITLES",
      urls,
    };
  }

  if (/短视频标题|视频标题|脚本标题|爆款标题/.test(text)) {
    return {
      matched: true,
      intent: Stage2TaskKind.GENERATE_SHORT_VIDEO_TITLES,
      reason: "GENERATE_SHORT_VIDEO_TITLES",
      urls,
    };
  }

  if (/卖点|看图卖点|图片卖点|商品卖点|适合人群|材质|版型|颜色|种草文案|直播话术/.test(text)) {
    return {
      matched: true,
      intent: Stage2TaskKind.GENERATE_SELLING_POINTS,
      reason: "GENERATE_SELLING_POINTS",
      urls,
    };
  }

  return {
    matched: false,
    intent: null,
    reason: "NO_STAGE2_INTENT",
    urls,
  };
}

export function buildPlatformTrendSearchPlan({ userText = "", platform, keyword } = {}) {
  const text = String(userText || "");
  const selectedPlatform = platform || detectPlatformFromUserText(text);
  const source = getTrendPlatformSource(selectedPlatform);
  const searchKeyword = keyword || extractStage2Keyword(text, selectedPlatform);
  const searchUrl = getStage2PlatformUrl(selectedPlatform);
  const steps = [];

  if (searchUrl) {
    steps.push({
      type: Stage2ActionType.OPEN_PLATFORM_PAGE,
      label: `打开${source.label}入口`,
      url: searchUrl,
      platform: selectedPlatform,
      platformLabel: source.label,
    });
    steps.push({
      type: Stage2ActionType.FIND_SEARCH_INPUT,
      label: "查找平台搜索框",
      hints: source.searchBoxHints,
    });
    steps.push({
      type: Stage2ActionType.TYPE_KEYWORD,
      label: `输入关键词：${searchKeyword || text}`,
      keyword: searchKeyword || text,
    });
    steps.push({
      type: Stage2ActionType.PRESS_ENTER,
      label: "提交搜索",
      key: "Enter",
    });
    steps.push({
      type: Stage2ActionType.WAIT_FOR_LOAD,
      label: "等待搜索结果加载",
    });
  } else {
    steps.push({
      type: Stage2ActionType.STATUS,
      label: "平台热词搜索入口未配置",
      content: `该平台热词搜索入口未配置：${source.label}。你可以先手动打开页面，我会回退到读取当前页面 + 截图 + 提取热词。`,
      missingUrl: true,
      platform: selectedPlatform,
      platformLabel: source.label,
    });
  }

  steps.push(
    {
      type: Stage2ActionType.READ_VISIBLE_TEXT,
      label: "读取搜索结果页可见文字",
    },
    {
      type: Stage2ActionType.CAPTURE_SCREENSHOT,
      label: "截图搜索结果页",
    },
    {
      type: Stage2ActionType.EXTRACT_TRENDS,
      label: "提取热词、关联词、飙升词和评论区关键词",
      resultHints: source.resultHints,
    },
    {
      type: Stage2ActionType.GENERATE_PRODUCT_TITLES,
      label: "生成商品标题",
    },
    {
      type: Stage2ActionType.GENERATE_SHORT_VIDEO_TITLES,
      label: "生成短视频标题",
    },
    {
      type: Stage2ActionType.GENERATE_SELLING_POINTS,
      label: "生成商品卖点",
    },
    {
      type: Stage2ActionType.GENERATE_PLATFORM_DRAFTS,
      label: "生成直播话术与小红书种草文案",
    },
    {
      type: Stage2ActionType.SUMMARIZE_LOW_RISK_RESULT,
      label: "总结低风险结果",
    },
  );

  return {
    intent: Stage2TaskKind.PLATFORM_TREND_SEARCH,
    userText: text,
    platform: selectedPlatform,
    platformLabel: source.label,
    keyword: searchKeyword,
    searchUrl,
    missingUrl: !searchUrl,
    searchBoxHints: source.searchBoxHints,
    resultHints: source.resultHints,
    steps,
  };
}

export function buildStage2Plan({ intent, userText = "", platform, keyword } = {}) {
  const text = String(userText || "");
  const detected = detectStage2Intent(text);
  const taskIntent = intent || detected.intent;

  if (!taskIntent) {
    return {
      intent: null,
      userText: text,
      steps: [],
    };
  }

  if (taskIntent === Stage2TaskKind.VIDEO_LINK_DECOMPOSE) {
    const urls = detected.urls || extractUrls(text);
    return {
      intent: taskIntent,
      userText: text,
      urls,
      platform: platform || detectPlatformFromUserText(text),
      steps: [
        {
          type: Stage2ActionType.VIDEO_LINK_TO_HERMES,
          label: "将视频链接交给 Hermes 拆解",
          url: urls[0] || "",
        },
        {
          type: Stage2ActionType.SUMMARIZE_LOW_RISK_RESULT,
          label: "总结视频链接低风险拆解结果",
        },
      ],
    };
  }

  return buildPlatformTrendSearchPlan({
    userText: text,
    platform: platform || detectPlatformFromUserText(text),
    keyword,
  });
}

function isStage2HighRiskText(text) {
  if (containsHighRiskText(text)) return true;
  return STAGE2_HIGH_RISK_RE.test(text);
}
