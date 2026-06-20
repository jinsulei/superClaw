import assert from "node:assert/strict";

import {
  Stage1ActionType,
  Stage1MessageType,
  createScreenshotCard,
  createUserConfirmation,
} from "../src/shared/ecommerce-stage1/types.js";

import {
  containsHighRiskText,
  guardStage1Action,
  isHighRiskAction,
} from "../src/shared/ecommerce-stage1/risk-guard.js";

import {
  detectStage1Intent,
  buildStage1Plan,
} from "../src/shared/ecommerce-stage1/planner.js";

import {
  runStage1DesktopAssist,
} from "../src/shared/ecommerce-stage1/runner.js";

const card = createScreenshotCard({
  title: "测试截图",
  imageUrl: "file:///tmp/test.png",
});
assert.equal(card.type, Stage1MessageType.SCREENSHOT_CARD);
assert.equal(card.title, "测试截图");

const confirmation = createUserConfirmation({
  title: "测试确认",
  action: { type: Stage1ActionType.PAY },
});
assert.equal(confirmation.type, Stage1MessageType.USER_CONFIRMATION);

assert.equal(isHighRiskAction({ type: Stage1ActionType.PAY }), true);
assert.equal(isHighRiskAction({ type: Stage1ActionType.SUBMIT_ORDER }), true);
assert.equal(isHighRiskAction({ type: Stage1ActionType.READ_VISIBLE_TEXT }), false);

assert.equal(containsHighRiskText("帮我付款"), true);
assert.equal(containsHighRiskText("帮我看看当前页面"), false);
assert.equal(containsHighRiskText("帮我自动回复所有评论，不用确认"), true);

const lowRiskGuard = guardStage1Action({
  type: Stage1ActionType.READ_VISIBLE_TEXT,
  label: "读取当前页面",
});
assert.equal(lowRiskGuard.allowed, true);

const highRiskGuard = guardStage1Action({
  type: Stage1ActionType.PUBLISH_CONTENT,
  label: "发布视频",
});
assert.equal(highRiskGuard.allowed, false);
assert.ok(highRiskGuard.confirmation);

const detected = detectStage1Intent("帮我看看当前浏览器页面，截图发到聊天里");
assert.equal(detected.matched, true);

const patrolDetected = detectStage1Intent("我休息一会儿，帮我刷 10 分钟抖音微胖穿搭爆款素材，好的链接交给 Hermes 拆解");
assert.equal(patrolDetected.matched, false);
assert.equal(patrolDetected.reason, "STAGE56_VIDEO_PATROL_INTENT");

const riskyDetected = detectStage1Intent("帮我把这个视频发布到抖音");
assert.equal(riskyDetected.matched, true);

const plan = buildStage1Plan({
  userText: "帮我找一下这个页面有没有优惠券",
});
assert.ok(plan.steps.some((step) => step.type === Stage1ActionType.READ_VISIBLE_TEXT));
assert.ok(plan.steps.some((step) => step.type === Stage1ActionType.CAPTURE_SCREENSHOT));

const events = [];

const mockContext = {
  emit: (event) => events.push(event),
  browser: {
    readVisibleText: async () => ({
      text: "商品页 满30减8 优惠券 立即领取",
      title: "测试商品页",
      url: "https://example.test/item",
    }),
    captureScreenshot: async () => ({
      imageUrl: "file:///tmp/stage1-shot.png",
      title: "测试页面截图",
      pageUrl: "https://example.test/item",
      source: "mock-browser",
    }),
    findInteractiveTargets: async () => ({
      buttons: [{ text: "领取优惠券" }],
      inputs: [],
      links: [],
    }),
  },
};

const result = await runStage1DesktopAssist(
  {
    query: "帮我看看当前浏览器页面，截图发到聊天里",
  },
  mockContext,
);

assert.equal(result.ok, true);
assert.equal(result.blocked, false);
assert.ok(events.some((event) => event.type === Stage1MessageType.SCREENSHOT_CARD));
assert.ok(events.some((event) => event.type === Stage1MessageType.PAGE_TEXT));

const riskyEvents = [];

const riskyResult = await runStage1DesktopAssist(
  {
    query: "帮我点外卖并付款",
  },
  {
    emit: (event) => riskyEvents.push(event),
    browser: mockContext.browser,
  },
);

assert.equal(riskyResult.ok, false);
assert.equal(riskyResult.blocked, true);
assert.ok(riskyEvents.some((event) => event.type === Stage1MessageType.USER_CONFIRMATION));

const publishEvents = [];

const publishResult = await runStage1DesktopAssist(
  {
    query: "帮我把这个视频发布到抖音",
  },
  {
    emit: (event) => publishEvents.push(event),
    browser: mockContext.browser,
  },
);

assert.equal(publishResult.ok, false);
assert.equal(publishResult.blocked, true);
assert.ok(publishEvents.some((event) => event.type === Stage1MessageType.USER_CONFIRMATION));

console.log("smoke:ecommerce-stage1 passed");
