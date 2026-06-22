import assert from "node:assert/strict";

import {
  Stage2ActionType,
  Stage2MessageType,
  createContentDraftCard,
  createTrendInsightCard,
  createVideoLinkCard,
} from "../src/shared/ecommerce-stage2/types.js";
import {
  generateLiveScripts,
  generatePlatformDrafts,
  generateProductTitles,
  generateSellingPoints,
  generateShortVideoTitles,
  generateXiaohongshuNotes,
} from "../src/shared/ecommerce-stage2/content-generator.js";
import {
  buildPlatformTrendSearchPlan,
  buildStage2Plan,
  detectPlatformFromUserText,
  detectStage2Intent,
  extractStage2Keyword,
} from "../src/shared/ecommerce-stage2/planner.js";
import { runStage2LowRiskOps } from "../src/shared/ecommerce-stage2/runner.js";
import {
  buildTrendInsight,
  extractKeywordsFromText,
  extractUrls,
  guessPlatformFromUrl,
} from "../src/shared/ecommerce-stage2/trend-parser.js";

const trendCard = createTrendInsightCard({
  keywords: [{ keyword: "显瘦", score: 10 }],
});
assert.equal(trendCard.type, Stage2MessageType.TREND_INSIGHT_CARD);

const draftCard = createContentDraftCard({
  productTitles: ["早春显瘦衬衫女"],
});
assert.equal(draftCard.type, Stage2MessageType.CONTENT_DRAFT_CARD);

const videoCard = createVideoLinkCard({
  url: "https://www.douyin.com/video/test",
});
assert.equal(videoCard.type, Stage2MessageType.VIDEO_LINK_CARD);

const urls = extractUrls("帮我拆解 https://www.douyin.com/video/123");
assert.equal(urls.length, 1);
assert.equal(guessPlatformFromUrl(urls[0]), "douyin");

assert.equal(detectPlatformFromUserText("帮我查抖音女装热词"), "douyin");
assert.equal(detectPlatformFromUserText("帮我查巨量算数女装热词"), "douyin");
assert.equal(detectPlatformFromUserText("帮我查小红书早春穿搭热词"), "xiaohongshu");
assert.equal(detectPlatformFromUserText("帮我查快手微胖穿搭标题"), "kuaishou");
assert.equal(detectPlatformFromUserText("帮我查抖店衬衫商品标题关键词"), "doudian");
assert.equal(detectPlatformFromUserText("帮我查春装热词"), "general");

assert.equal(extractStage2Keyword("帮我查抖音女装热词", "douyin"), "女装");
assert.equal(extractStage2Keyword("帮我查小红书早春穿搭热词", "xiaohongshu"), "早春穿搭");
assert.equal(extractStage2Keyword("帮我查快手微胖穿搭标题", "kuaishou"), "微胖穿搭");
assert.equal(extractStage2Keyword("帮我查抖店衬衫商品标题关键词", "doudian"), "衬衫");

const keywords = extractKeywordsFromText("显瘦 通勤 微胖穿搭 早春穿搭 显瘦 显瘦 高级感 评论区 问爆");
assert.ok(keywords.some((item) => item.keyword.includes("显瘦")));

const insight = buildTrendInsight({
  text: "显瘦 通勤 微胖穿搭 早春穿搭 高级感 爆款 关联搜索 评论区问爆 衬衫标题关键词",
  query: "女装热词",
  keyword: "女装",
});
assert.ok(insight.keywords.length > 0);
assert.ok(insight.groups.hotKeywords.length > 0);
assert.ok(insight.groups.productTitleKeywords.length > 0);

const productTitles = generateProductTitles({
  keywords: insight.keywords,
  category: "女装",
  product: "衬衫",
});
assert.ok(productTitles.length > 0);

const videoTitles = generateShortVideoTitles({
  keywords: insight.keywords,
  category: "女装",
  product: "衬衫",
});
assert.ok(videoTitles.length >= 5);

const sellingPoints = generateSellingPoints({
  keywords: insight.keywords,
  category: "女装",
  product: "衬衫",
});
assert.ok(sellingPoints.length > 0);

const liveScripts = generateLiveScripts({
  keywords: insight.keywords,
  category: "女装",
  product: "衬衫",
});
assert.ok(liveScripts.length > 0);

const xhsNotes = generateXiaohongshuNotes({
  keywords: insight.keywords,
  category: "女装",
  product: "衬衫",
});
assert.ok(xhsNotes.length > 0);

const platformDrafts = generatePlatformDrafts({
  keywords: insight.keywords,
  category: "女装",
  product: "衬衫",
});
assert.equal(platformDrafts.length, 4);

const detectedTrend = detectStage2Intent("帮我查抖音女装热词");
assert.equal(detectedTrend.matched, true);

const detectedLink = detectStage2Intent("帮我拆解这个视频 https://www.douyin.com/video/123");
assert.equal(detectedLink.matched, true);

const risky = detectStage2Intent("帮我把这个视频发布到抖音");
assert.equal(risky.matched, false);

process.env.VITE_STAGE2_DOUYIN_TREND_URL = "https://example.test/douyin-trend";
const plan = buildPlatformTrendSearchPlan({
  userText: "帮我查抖音女装热词",
});
assert.equal(plan.platform, "douyin");
assert.equal(plan.keyword, "女装");
assert.ok(plan.steps.some((step) => step.type === Stage2ActionType.OPEN_PLATFORM_PAGE));
assert.ok(plan.steps.some((step) => step.type === Stage2ActionType.FIND_SEARCH_INPUT));
assert.ok(plan.steps.some((step) => step.type === Stage2ActionType.TYPE_KEYWORD));
assert.ok(plan.steps.some((step) => step.type === Stage2ActionType.PRESS_ENTER));
assert.ok(plan.steps.some((step) => step.type === Stage2ActionType.WAIT_FOR_LOAD));

const genericPlan = buildStage2Plan({
  userText: "帮我查一下今天女装类目的热词，生成 10 个短视频标题",
});
assert.ok(genericPlan.steps.some((step) => step.type === Stage2ActionType.READ_VISIBLE_TEXT));
assert.ok(genericPlan.steps.some((step) => step.type === Stage2ActionType.CAPTURE_SCREENSHOT));
assert.ok(genericPlan.steps.some((step) => step.type === Stage2ActionType.EXTRACT_TRENDS));

const browserCalls = [];
const events = [];
const mockContext = {
  emit: (event) => events.push(event),
  browser: {
    open: async (url) => {
      browserCalls.push(["open", url]);
      return { ok: true, url };
    },
    findInputByHints: async (hints) => {
      browserCalls.push(["findInputByHints", hints]);
      return { ok: true, hints };
    },
    type: async (text) => {
      browserCalls.push(["type", text]);
      return { ok: true, text };
    },
    press: async (key) => {
      browserCalls.push(["press", key]);
      return { ok: true, key };
    },
    waitForLoad: async () => {
      browserCalls.push(["waitForLoad"]);
      return { ok: true };
    },
    readVisibleText: async () => ({
      text: "显瘦 通勤 微胖穿搭 早春穿搭 高级感 爆款 好物推荐 关联搜索 评论区问爆 衬衫标题关键词",
      title: "测试热词页",
      url: "https://example.test/trend",
    }),
    captureScreenshot: async () => ({
      imageUrl: "file:///tmp/stage2-trend.png",
      title: "测试热词截图",
      pageUrl: "https://example.test/trend",
      source: "mock-browser",
    }),
  },
  hermes: {
    decomposeVideoLink: async ({ url }) => ({
      url,
      hook: "前三秒展示前后对比",
      structure: ["开头痛点", "商品展示", "用户反馈", "行动引导"],
      keywords: ["显瘦", "通勤", "微胖"],
    }),
  },
};

const result = await runStage2LowRiskOps(
  {
    query: "帮我查抖音女装热词",
  },
  mockContext,
);

assert.equal(result.ok, true);
assert.equal(result.blocked, false);
assert.deepEqual(browserCalls.slice(0, 5).map(([name]) => name), [
  "open",
  "findInputByHints",
  "type",
  "press",
  "waitForLoad",
]);
assert.deepEqual(browserCalls[0], ["open", "https://example.test/douyin-trend"]);
assert.deepEqual(browserCalls[2], ["type", "女装"]);
assert.deepEqual(browserCalls[3], ["press", "Enter"]);
assert.ok(events.some((event) => event.type === Stage2MessageType.TREND_INSIGHT_CARD));
assert.ok(events.some((event) => event.type === Stage2MessageType.CONTENT_DRAFT_CARD));

delete process.env.VITE_STAGE2_XIAOHONGSHU_SEARCH_URL;
delete process.env.VITE_STAGE2_TREND_SOURCE_URL;
const fallbackEvents = [];
const fallbackBrowserCalls = [];
const fallbackResult = await runStage2LowRiskOps(
  {
    query: "帮我查小红书早春穿搭热词",
  },
  {
    emit: (event) => fallbackEvents.push(event),
    browser: {
      readVisibleText: async () => {
        fallbackBrowserCalls.push("readVisibleText");
        return {
          text: "早春穿搭 小个子 高级感 种草 平价 评论区问爆",
          title: "手动打开的小红书页面",
          url: "https://example.test/manual",
        };
      },
      captureScreenshot: async () => {
        fallbackBrowserCalls.push("captureScreenshot");
        return {
          imageUrl: "file:///tmp/stage2-xhs.png",
          title: "手动页截图",
          source: "mock-browser",
        };
      },
    },
  },
);

assert.equal(fallbackResult.ok, true);
assert.equal(fallbackResult.state.missingUrl, true);
assert.ok(fallbackEvents.some((event) => String(event.content || "").includes("该平台热词搜索入口未配置")));
assert.deepEqual(fallbackBrowserCalls, ["readVisibleText", "captureScreenshot"]);
assert.ok(fallbackEvents.some((event) => event.type === Stage2MessageType.TREND_INSIGHT_CARD));

const linkEvents = [];
const linkResult = await runStage2LowRiskOps(
  {
    query: "帮我拆解这个视频 https://www.douyin.com/video/123",
  },
  {
    ...mockContext,
    emit: (event) => linkEvents.push(event),
  },
);

assert.equal(linkResult.ok, true);
assert.ok(linkEvents.some((event) => event.type === Stage2MessageType.VIDEO_LINK_CARD));

const riskyEvents = [];
const riskyResult = await runStage2LowRiskOps(
  {
    query: "帮我把这个视频发布到抖音",
  },
  {
    ...mockContext,
    emit: (event) => riskyEvents.push(event),
  },
);

assert.equal(riskyResult.ok, false);
assert.equal(riskyResult.blocked, true);
assert.ok(riskyEvents.some((event) => String(event.content || "").includes("第二阶段只允许")));

console.log("smoke:ecommerce-stage2 passed");
