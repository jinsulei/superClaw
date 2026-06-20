import assert from "node:assert/strict";

import {
  Stage4MessageType,
  createDoudianListingPrepCard,
  createPriceInventoryConfirmationCard,
  createSubmitReviewConfirmationCard,
} from "../src/shared/ecommerce-stage4/types.js";
import {
  detectStage4Intent,
  extractImagePaths,
  extractInventory,
  extractPrice,
} from "../src/shared/ecommerce-stage4/input-parser.js";
import { buildDoudianProductDraft } from "../src/shared/ecommerce-stage4/doudian-draft-builder.js";
import { buildStage4Plan } from "../src/shared/ecommerce-stage4/planner.js";
import { runStage4DoudianListing } from "../src/shared/ecommerce-stage4/runner.js";

const prepCard = createDoudianListingPrepCard({
  productTitle: "测试商品",
});
assert.equal(prepCard.type, Stage4MessageType.DOUDIAN_LISTING_PREP_CARD);

const priceCard = createPriceInventoryConfirmationCard({
  productTitle: "测试商品",
  price: "89",
  inventory: "100",
});
assert.equal(priceCard.type, Stage4MessageType.PRICE_INVENTORY_CONFIRMATION_CARD);

const submitCard = createSubmitReviewConfirmationCard({
  productTitle: "测试商品",
});
assert.equal(submitCard.type, Stage4MessageType.SUBMIT_REVIEW_CONFIRMATION_CARD);

const images = extractImagePaths('帮我把 "D:\\素材\\main.jpg" 上架到抖店，提交前让我确认');
assert.equal(images.length, 1);
assert.equal(images[0], "D:\\素材\\main.jpg");

assert.equal(extractPrice("价格 89 库存 100"), "89");
assert.equal(extractPrice("价格89，库存100"), "89");
assert.equal(extractInventory("价格 89 库存 100"), "100");
assert.equal(extractInventory("价格89，库存100"), "100");

const safeDetected = detectStage4Intent('帮我把 "D:\\素材\\main.jpg" 上架到抖店，标题你帮我优化，提交前让我确认');
assert.equal(safeDetected.matched, true);
assert.equal(safeDetected.unsafe, false);

const unsafeDetected = detectStage4Intent("帮我把这个商品直接提交审核，不用确认");
assert.equal(unsafeDetected.matched, true);
assert.equal(unsafeDetected.unsafe, true);

const otherShopDetected = detectStage4Intent("帮我把这个商品发布到淘宝，提交前让我确认");
assert.equal(otherShopDetected.matched, false);

const draft = buildDoudianProductDraft({
  query: "显瘦 通勤 女装 衬衫 价格89 库存100",
  productTitle: "早春显瘦通勤衬衫女",
  category: "女装",
  price: "89",
  inventory: "100",
});
assert.ok(draft.productTitle);
assert.ok(draft.description);
assert.ok(draft.sellingPoints.length > 0);
assert.ok(draft.specs.length > 0);

const plan = buildStage4Plan({
  userText: '帮我把 "D:\\素材\\main.jpg" 上架到抖店，价格89，库存100，提交前让我确认',
});
assert.equal(plan.matched, true);
assert.equal(plan.unsafe, false);
assert.ok(plan.steps.some((step) => step.type === "upload_product_images"));
assert.ok(plan.steps.some((step) => step.type === "require_price_inventory_confirmation"));
assert.ok(plan.steps.some((step) => step.type === "stop_before_submit_review"));
assert.equal(plan.steps.some((step) => step.type === "fill_price_inventory_after_confirmation"), false);

const confirmedPlan = buildStage4Plan({
  userText: '帮我把 "D:\\素材\\main.jpg" 上架到抖店，价格89，库存100，提交前让我确认',
  confirmedPriceInventory: true,
});
assert.ok(confirmedPlan.steps.some((step) => step.type === "fill_price_inventory_after_confirmation"));

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
        text: "抖店 商品标题 商品详情 主图 提交审核",
        title: "抖店商品发布页",
        url: "https://example.test/doudian",
      };
    },
    clickByTextHints: async ({ hints, note }) => {
      browserCalls.push(["clickByTextHints", hints, note]);
      return { ok: true };
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
        imageUrl: "file:///tmp/doudian-preview.png",
        title: "抖店提交审核前预览",
        pageUrl: "https://example.test/doudian",
        source: "mock-browser",
      };
    },
  },
};

const result = await runStage4DoudianListing(
  {
    query: '帮我把 "D:\\素材\\main.jpg" 上架到抖店，价格89，库存100，提交前让我确认',
    images: ["D:\\素材\\main.jpg"],
    productTitle: "早春显瘦通勤衬衫女",
    category: "女装",
    price: "89",
    inventory: "100",
    keywords: ["显瘦", "通勤", "女装"],
  },
  mockContext,
);

assert.equal(result.ok, true);
assert.equal(result.blocked, false);
assert.ok(events.some((event) => event.type === Stage4MessageType.PRICE_INVENTORY_CONFIRMATION_CARD));
assert.ok(events.some((event) => event.type === Stage4MessageType.DOUDIAN_LISTING_PREP_CARD));
assert.ok(events.some((event) => event.type === Stage4MessageType.SUBMIT_REVIEW_CONFIRMATION_CARD));

const calledFinalSubmit = browserCalls.some((call) => {
  const joined = String(call.join(" ")).toLowerCase();
  return (
    joined.includes("submit_review") ||
    joined.includes("publish_product") ||
    joined.includes("list_product") ||
    joined.includes("click_submit")
  );
});
assert.equal(calledFinalSubmit, false);

const unsafeEvents = [];
const unsafeResult = await runStage4DoudianListing(
  {
    query: "帮我把这个商品直接提交审核，不用确认",
  },
  {
    ...mockContext,
    emit: (event) => unsafeEvents.push(event),
  },
);

assert.equal(unsafeResult.ok, false);
assert.equal(unsafeResult.blocked, true);
assert.ok(unsafeEvents.some((event) => event.type === "user_confirmation"));

console.log("smoke:ecommerce-stage4 passed");
