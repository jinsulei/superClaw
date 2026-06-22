import assert from "node:assert/strict";

import {
  Stage56MessageType,
  Stage56Platform,
  createLiveReplyCard,
  createLiveReplyConfirmationCard,
  createMaterialRecordCard,
  createVideoCandidateCard,
  createVideoDecomposeCard,
} from "../src/shared/ecommerce-stage56/types.js";
import {
  classifyLiveComment,
  classifyLiveComments,
  extractLiveComments,
  generateLiveReplies,
} from "../src/shared/ecommerce-stage56/live-comment-assist.js";
import {
  detectStage56Intent,
  extractVideoCandidatesFromText,
  parsePatrolOptions,
} from "../src/shared/ecommerce-stage56/video-patrol.js";
import {
  createMaterialRecord,
  saveMaterialRecord,
} from "../src/shared/ecommerce-stage56/material-store.js";
import { buildStage56Plan } from "../src/shared/ecommerce-stage56/planner.js";
import { runStage56Ops } from "../src/shared/ecommerce-stage56/runner.js";

const liveCard = createLiveReplyCard({
  comments: [],
  replies: [],
});
assert.equal(liveCard.type, Stage56MessageType.LIVE_REPLY_CARD);

const confirmCard = createLiveReplyConfirmationCard({
  comment: "多少钱",
  reply: "价格以页面为准",
});
assert.equal(confirmCard.type, Stage56MessageType.LIVE_REPLY_CONFIRMATION_CARD);

const videoCard = createVideoCandidateCard({
  platform: Stage56Platform.DOUYIN,
  title: "微胖女生这样穿真的显瘦",
});
assert.equal(videoCard.type, Stage56MessageType.VIDEO_CANDIDATE_CARD);

const decomposeCard = createVideoDecomposeCard({
  url: "https://www.douyin.com/video/123",
});
assert.equal(decomposeCard.type, Stage56MessageType.VIDEO_DECOMPOSE_CARD);

const materialCard = createMaterialRecordCard({
  record: createMaterialRecord({ title: "测试素材" }),
});
assert.equal(materialCard.type, Stage56MessageType.MATERIAL_RECORD_CARD);

const comments = extractLiveComments(`用户A：这个多大码？
用户B：多少钱？
用户C：发货快吗？
系统：欢迎进入直播间`);
assert.ok(comments.length >= 3);

assert.equal(classifyLiveComment("这个多大码？"), "size");
assert.equal(classifyLiveComment("多少钱？"), "price");
assert.equal(classifyLiveComment("验证码是多少？"), "risky");

const classified = classifyLiveComments(comments);
const replies = generateLiveReplies(classified, {
  title: "通勤衬衫",
});
assert.ok(replies.length >= 3);
assert.ok(replies.every((reply) => reply.requiresUserConfirm === true));

const liveDetected = detectStage56Intent("帮我看直播公屏问题，组织回复，发送前让我确认");
assert.equal(liveDetected.matched, true);
assert.equal(liveDetected.intent, "live_comment_assist");

const patrolDetected = detectStage56Intent("我休息一会儿，帮我刷30分钟抖音微胖穿搭爆款素材");
assert.equal(patrolDetected.matched, true);
assert.equal(patrolDetected.intent, "video_inspiration_patrol");

const unsafeDetected = detectStage56Intent("帮我自动评论这个视频");
assert.equal(unsafeDetected.matched, true);
assert.equal(unsafeDetected.unsafe, true);

const unsafeAutoReplyDetected = detectStage56Intent("帮我自动回复所有评论，不用确认");
assert.equal(unsafeAutoReplyDetected.matched, true);
assert.equal(unsafeAutoReplyDetected.unsafe, true);

const stage1ScreenshotDetected = detectStage56Intent("帮我看看当前浏览器页面，截图发到聊天里");
assert.equal(stage1ScreenshotDetected.matched, false);
assert.equal(stage1ScreenshotDetected.reason, "STAGE1_DESKTOP_ASSIST_INTENT");

const options = parsePatrolOptions("刷30分钟，最多找10条微胖穿搭");
assert.equal(options.durationMinutes, 30);
assert.ok(options.maxCandidates >= 10);

const candidates = extractVideoCandidatesFromText(`微胖女生这样穿真的显瘦
点赞 1.2万 评论 399 收藏 888
https://www.douyin.com/video/123`, {
  platform: "douyin",
  screenshot: { imageUrl: "file:///tmp/shot.png" },
});
assert.ok(candidates.length > 0);
assert.ok(candidates[0].score > 0);

const materialRecords = [];
const saved = await saveMaterialRecord(
  {
    title: "微胖女生这样穿真的显瘦",
    platform: "douyin",
    url: "https://www.douyin.com/video/123",
  },
  {
    materialRecords,
  },
);
assert.equal(materialRecords.length, 1);
assert.equal(saved.title, "微胖女生这样穿真的显瘦");

const livePlan = buildStage56Plan({
  userText: "帮我看直播公屏问题，组织回复，发送前让我确认",
});
assert.equal(livePlan.matched, true);
assert.equal(livePlan.intent, "live_comment_assist");

const patrolPlan = buildStage56Plan({
  userText: "我休息一会儿，帮我刷30分钟抖音微胖穿搭爆款素材",
});
assert.equal(patrolPlan.matched, true);
assert.equal(patrolPlan.intent, "video_inspiration_patrol");

const liveEvents = [];
const mockBrowser = {
  readVisibleText: async () => ({
    text: "用户A：这个多大码？\n用户B：多少钱？\n用户C：发货快吗？",
    title: "直播间",
    url: "https://example.test/live",
  }),
  captureScreenshot: async () => ({
    imageUrl: "file:///tmp/live.png",
    title: "直播截图",
    pageUrl: "https://example.test/live",
    source: "mock-browser",
  }),
  typeIntoByHints: async () => ({ ok: true }),
};

const liveResult = await runStage56Ops(
  {
    query: "帮我看直播公屏问题，组织回复，发送前让我确认",
    productInfo: { title: "通勤衬衫" },
  },
  {
    emit: (event) => liveEvents.push(event),
    browser: mockBrowser,
  },
);
assert.equal(liveResult.ok, true);
assert.ok(liveEvents.some((event) => event.type === Stage56MessageType.LIVE_REPLY_CARD));
assert.ok(liveEvents.some((event) => event.type === Stage56MessageType.LIVE_REPLY_CONFIRMATION_CARD));

const patrolEvents = [];
const patrolMaterials = [];
const patrolResult = await runStage56Ops(
  {
    query: "我休息一会儿，帮我刷10分钟抖音微胖穿搭爆款素材",
    platforms: ["douyin"],
  },
  {
    emit: (event) => patrolEvents.push(event),
    browser: {
      open: async () => ({ ok: true }),
      waitForLoad: async () => ({ ok: true }),
      typeIntoByHints: async () => ({ ok: true }),
      press: async () => ({ ok: true }),
      readVisibleText: async () => ({
        text: "微胖女生这样穿真的显瘦\n点赞 1.2万 评论 399 收藏 888\nhttps://www.douyin.com/video/123",
      }),
      captureScreenshot: async () => ({
        imageUrl: "file:///tmp/video.png",
        title: "视频截图",
      }),
    },
    hermes: {
      decomposeVideoLink: async ({ url }) => ({
        url,
        hook: "前三秒展示前后对比",
        structure: ["痛点", "上身展示", "评论引导"],
      }),
    },
    materialRecords: patrolMaterials,
  },
);

assert.equal(patrolResult.ok, true);
assert.ok(patrolEvents.some((event) => event.type === Stage56MessageType.VIDEO_CANDIDATE_CARD));
assert.ok(patrolEvents.some((event) => event.type === Stage56MessageType.VIDEO_DECOMPOSE_CARD));
assert.ok(patrolEvents.some((event) => event.type === Stage56MessageType.MATERIAL_RECORD_CARD));
assert.ok(patrolMaterials.length > 0);

const unsafeEvents = [];
const unsafeResult = await runStage56Ops(
  {
    query: "帮我自动评论这个视频",
  },
  {
    emit: (event) => unsafeEvents.push(event),
    browser: mockBrowser,
  },
);
assert.equal(unsafeResult.ok, false);
assert.equal(unsafeResult.blocked, true);
assert.ok(unsafeEvents.some((event) => event.type === "user_confirmation"));

console.log("smoke:ecommerce-stage56 passed");
