import assert from "node:assert/strict";

import {
  Stage3MessageType,
  Stage3Platform,
  createPlatformConfirmationCard,
  createPlatformPrepCard,
} from "../src/shared/ecommerce-stage3/types.js";
import {
  CONTENT_PLATFORMS,
  SHOP_PLATFORMS,
  listStage3Platforms,
} from "../src/shared/ecommerce-stage3/platform-config.js";
import {
  detectMediaType,
  detectPlatforms,
  detectStage3Intent,
  extractLocalFilePaths,
} from "../src/shared/ecommerce-stage3/input-parser.js";
import {
  buildStage3Drafts,
  buildStage3PlatformDraft,
} from "../src/shared/ecommerce-stage3/draft-builder.js";
import { buildStage3Plan } from "../src/shared/ecommerce-stage3/planner.js";
import { runStage3PublishPrep } from "../src/shared/ecommerce-stage3/runner.js";

const prepCard = createPlatformPrepCard({
  platform: Stage3Platform.DOUYIN,
  platformLabel: "抖音",
  title: "测试标题",
});
assert.equal(prepCard.type, Stage3MessageType.PLATFORM_PREP_CARD);

const confirmCard = createPlatformConfirmationCard({
  platform: Stage3Platform.DOUYIN,
  platformLabel: "抖音",
});
assert.equal(confirmCard.type, Stage3MessageType.PLATFORM_CONFIRMATION_CARD);

assert.ok(CONTENT_PLATFORMS.includes(Stage3Platform.WECHAT_CHANNELS));
assert.ok(SHOP_PLATFORMS.includes(Stage3Platform.TMALL));
assert.ok(SHOP_PLATFORMS.includes(Stage3Platform.TAOBAO));
assert.ok(SHOP_PLATFORMS.includes(Stage3Platform.PINDUODUO));

const allPlatforms = listStage3Platforms([Stage3Platform.ALL]);
assert.ok(allPlatforms.includes(Stage3Platform.DOUYIN));
assert.ok(allPlatforms.includes(Stage3Platform.KUAISHOU));
assert.ok(allPlatforms.includes(Stage3Platform.WECHAT_CHANNELS));
assert.ok(allPlatforms.includes(Stage3Platform.XIAOHONGSHU));
assert.ok(allPlatforms.includes(Stage3Platform.TMALL));
assert.ok(allPlatforms.includes(Stage3Platform.TAOBAO));
assert.ok(allPlatforms.includes(Stage3Platform.PINDUODUO));

const platforms = detectPlatforms("帮我把这个视频发到抖音、快手、视频号、小红书，发布前让我确认");
assert.ok(platforms.includes(Stage3Platform.DOUYIN));
assert.ok(platforms.includes(Stage3Platform.KUAISHOU));
assert.ok(platforms.includes(Stage3Platform.WECHAT_CHANNELS));
assert.ok(platforms.includes(Stage3Platform.XIAOHONGSHU));

const shopPlatforms = detectPlatforms("帮我把商品准备到天猫、淘宝、拼多多，上架前让我确认");
assert.ok(shopPlatforms.includes(Stage3Platform.TMALL));
assert.ok(shopPlatforms.includes(Stage3Platform.TAOBAO));
assert.ok(shopPlatforms.includes(Stage3Platform.PINDUODUO));

const files = extractLocalFilePaths('帮我把 "D:\\素材\\video.mp4" 发到抖音，发布前让我确认');
assert.equal(files.length, 1);
assert.equal(detectMediaType(files), "video");

const safeDetected = detectStage3Intent('帮我把 "D:\\素材\\video.mp4" 发到视频号，发布前让我确认');
assert.equal(safeDetected.matched, true);
assert.equal(safeDetected.unsafe, false);

const stage1ScreenshotDetected = detectStage3Intent("帮我看看当前浏览器页面，截图发到聊天里");
assert.equal(stage1ScreenshotDetected.matched, false);
assert.equal(stage1ScreenshotDetected.reason, "STAGE1_DESKTOP_ASSIST_INTENT");

const unsafeDetected = detectStage3Intent('帮我把 "D:\\素材\\video.mp4" 直接发布到抖音，不用确认');
assert.equal(unsafeDetected.matched, true);
assert.equal(unsafeDetected.unsafe, true);

const shopDetected = detectStage3Intent('帮我把 "D:\\素材\\main.jpg" 发布到淘宝，提交前让我确认');
assert.equal(shopDetected.matched, true);
assert.equal(shopDetected.unsafe, false);
assert.ok(shopDetected.platforms.includes(Stage3Platform.TAOBAO));

const douyinDraft = buildStage3PlatformDraft({
  platform: Stage3Platform.DOUYIN,
  query: "显瘦 通勤 女装 衬衫",
  product: "衬衫",
});
assert.ok(douyinDraft.title);
assert.ok(douyinDraft.description);
assert.ok(douyinDraft.tags.length > 0);

const taobaoDraft = buildStage3PlatformDraft({
  platform: Stage3Platform.TAOBAO,
  query: "显瘦 通勤 女装 衬衫",
  product: "衬衫",
});
assert.equal(taobaoDraft.kind, "shop");
assert.ok(taobaoDraft.productKeywords.length > 0);
assert.ok(taobaoDraft.sellingPoints.length > 0);

const drafts = buildStage3Drafts({
  platforms: [
    Stage3Platform.DOUYIN,
    Stage3Platform.KUAISHOU,
    Stage3Platform.WECHAT_CHANNELS,
    Stage3Platform.XIAOHONGSHU,
    Stage3Platform.TMALL,
    Stage3Platform.TAOBAO,
    Stage3Platform.PINDUODUO,
  ],
  query: "显瘦 通勤 女装 衬衫",
  product: "衬衫",
});
assert.equal(drafts.length, 7);

const plan = buildStage3Plan({
  userText: '帮我把 "D:\\素材\\video.mp4" 发到抖音、快手、视频号、小红书，发布前让我确认',
});
assert.equal(plan.matched, true);
assert.equal(plan.unsafe, false);
assert.ok(plan.steps.some((step) => step.type === "upload_media"));
assert.ok(plan.steps.some((step) => step.type === "stop_before_final_submit"));

const shopPlan = buildStage3Plan({
  userText: '帮我把 "D:\\素材\\main.jpg" 发布到天猫、淘宝、拼多多，提交前让我确认',
});
assert.equal(shopPlan.matched, true);
assert.equal(shopPlan.unsafe, false);
assert.ok(shopPlan.steps.some((step) => step.type === "fill_product_title"));
assert.ok(shopPlan.steps.some((step) => step.type === "price_inventory_placeholder"));

const events = [];
const browserCalls = [];
const mockContext = {
  emit: (event) => events.push(event),
  browser: {
    open: async (url) => {
      browserCalls.push(["open", url]);
      return { ok: true };
    },
    waitForLoad: async () => {
      browserCalls.push(["waitForLoad"]);
      return { ok: true };
    },
    readVisibleText: async () => {
      browserCalls.push(["readVisibleText"]);
      return {
        text: "发布页 标题 简介 标签 上传 发布",
        title: "发布页",
        url: "https://example.test/publish",
      };
    },
    uploadMediaByHints: async ({ files, hints, platform }) => {
      browserCalls.push(["uploadMediaByHints", files, hints, platform]);
      return { ok: true };
    },
    typeIntoByHints: async ({ hints, value, platform, field }) => {
      browserCalls.push(["typeIntoByHints", hints, value, platform, field]);
      return { ok: true };
    },
    findByTextHints: async ({ hints, platform }) => {
      browserCalls.push(["findByTextHints", hints, platform]);
      return { found: true };
    },
    captureScreenshot: async () => {
      browserCalls.push(["captureScreenshot"]);
      return {
        imageUrl: "file:///tmp/stage3-preview.png",
        title: "最终操作前预览",
        pageUrl: "https://example.test/publish",
        source: "mock-browser",
      };
    },
  },
};

const result = await runStage3PublishPrep(
  {
    query: '帮我把 "D:\\素材\\video.mp4" 发到抖音、快手、视频号、小红书，发布前让我确认',
    platforms: [
      Stage3Platform.DOUYIN,
      Stage3Platform.KUAISHOU,
      Stage3Platform.WECHAT_CHANNELS,
      Stage3Platform.XIAOHONGSHU,
    ],
    mediaFiles: ["D:\\素材\\video.mp4"],
    product: "衬衫",
    keywords: ["显瘦", "通勤", "女装"],
  },
  mockContext,
);

assert.equal(result.ok, true);
assert.equal(result.blocked, false);
assert.ok(events.some((event) => event.type === Stage3MessageType.PLATFORM_PREP_CARD));
assert.ok(events.some((event) => event.type === Stage3MessageType.PLATFORM_CONFIRMATION_CARD));

const shopEvents = [];
const shopResult = await runStage3PublishPrep(
  {
    query: '帮我把 "D:\\素材\\main.jpg" 发布到天猫、淘宝、拼多多，提交前让我确认',
    platforms: [
      Stage3Platform.TMALL,
      Stage3Platform.TAOBAO,
      Stage3Platform.PINDUODUO,
    ],
    mediaFiles: ["D:\\素材\\main.jpg"],
    product: "衬衫",
    keywords: ["显瘦", "通勤", "女装"],
  },
  {
    ...mockContext,
    emit: (event) => shopEvents.push(event),
  },
);

assert.equal(shopResult.ok, true);
assert.equal(shopResult.blocked, false);
assert.ok(shopEvents.some((event) => event.type === Stage3MessageType.PLATFORM_PREP_CARD));
assert.ok(shopEvents.some((event) => event.type === Stage3MessageType.PLATFORM_CONFIRMATION_CARD));

const calledFinalSubmit = browserCalls.some((call) => {
  const joined = String(call.join(" ")).toLowerCase();
  return (
    joined.includes("click_publish") ||
    joined.includes("submit_listing") ||
    joined.includes("publish_content") ||
    joined.includes("list_product")
  );
});
assert.equal(calledFinalSubmit, false);

const unsafeEvents = [];
const unsafeResult = await runStage3PublishPrep(
  {
    query: '帮我把 "D:\\素材\\video.mp4" 直接发布到抖音，不用确认',
  },
  {
    ...mockContext,
    emit: (event) => unsafeEvents.push(event),
  },
);

assert.equal(unsafeResult.ok, false);
assert.equal(unsafeResult.blocked, true);
assert.ok(unsafeEvents.some((event) => event.type === "user_confirmation"));

console.log("smoke:ecommerce-stage3 passed");
