import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runStage56Ops } from "../../src/shared/ecommerce-stage56/runner.js";
import { classifyEcommerceActionGuard } from "../../src/shared/ecommerce/safety-policy.js";

const repoRoot = process.cwd();
const sensitiveValues = [
  "13800138000",
  "88 Fixture Road, Hangzhou",
  "WX202607060001",
  "fixture_wechat_id",
  "fake-token-should-be-redacted",
  "fake-secret-should-be-redacted",
];

const sensitiveVisibleText = [
  "Customer: Hello, is size M available?",
  "Customer phone: 13800138000",
  "Address: 88 Fixture Road, Hangzhou",
  "Order: WX202607060001",
  "WeChat: fixture_wechat_id",
  "token: fake-token-should-be-redacted",
  "secret: fake-secret-should-be-redacted",
].join("\n");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value);
  for (const sensitive of sensitiveValues) {
    assert.equal(serialized.includes(sensitive), false, `${sensitive} must be redacted`);
  }
}

test("Stage56 live reply output attaches WeChat Customer Ops normalizer result", async () => {
  const result = await runStage56Ops({
    query: "鐩存挱 鍏睆 瑙備紬闂",
    action_type: "generate_reply_draft",
    task_id: "stage56-wechat-fixture-task",
    customer_name: "Fixture Customer",
  }, {
    browser: {
      captureScreenshot: async () => ({ imageUrl: "memory://stage56-wechat-screenshot" }),
      readVisibleText: async () => ({ text: sensitiveVisibleText, title: "Live Room", url: "https://example.invalid/live" }),
      typeIntoByHints: async () => ({ ok: true, field: "live_reply_draft" }),
    },
    ocr: async () => sensitiveVisibleText,
  });

  assert.equal(result.blocked, false);
  assert.equal(result.wechat_customer_message?.platform, "wechat");
  assert.equal(result.wechat_customer_message?.channel, "wechat");
  assert.ok(result.wechat_customer_result, "Stage56 should attach normalized WeChat Customer Ops result");
  assert.ok(result.reply_draft, "Stage56 should expose reply_draft");
  assert.equal(result.reply_draft.status, "draft");
  assert.equal(result.reply_draft.auto_send, false);
  assert.equal(result.reply_draft.requires_confirmation, true);
  assert.ok(Array.isArray(result.task_events));
  assert.ok(result.task_events.length > 0);
  assert.ok(Array.isArray(result.tool_runs));
  assert.ok(result.tool_runs.length > 0);
  assertNoSensitiveValues({
    wechat_customer_message: result.wechat_customer_message,
    wechat_customer_result: result.wechat_customer_result,
    reply_draft: result.reply_draft,
    task_events: result.task_events,
    tool_runs: result.tool_runs,
  });
});

test("Stage56 WeChat send and private message actions remain blocked or confirmation-gated", async () => {
  for (const action_type of ["send_wechat_message", "send_private_message"]) {
    const guard = classifyEcommerceActionGuard({
      action_type,
      permission_level: "L2",
      risk_level: "high",
      text: "send WeChat customer message from Stage56",
    });
    assert.ok(guard.blocked || guard.requires_confirmation);
    assert.notEqual(guard.allowed, true);

    const result = await runStage56Ops({
      query: "鐩存挱 鍏睆 瑙備紬闂",
      action_type,
      task_id: `stage56-${action_type}`,
    });
    assert.ok(result.blocked || result.ecommerce_guard?.requires_confirmation);
    assert.notEqual(result.ecommerce_guard?.allowed, true);
  }
});

test("Stage56 keeps existing runner and forbidden action boundaries", () => {
  const runner = readSource("src/shared/ecommerce-stage56/runner.js");
  const devApi = readSource("scripts/dev-api.js");
  const chat = readSource("src/engines/hermes/pages/chat.js");

  assert.match(runner, /FORBIDDEN_ACTIONS/);
  assert.match(runner, /normalizeWeChatCustomerMessage|normalizeWechatCustomerMessage/);
  assert.match(runner, /normalizeWeChatCustomerOpsResult|normalizeWechatCustomerOpsResult/);
  assert.doesNotMatch(runner, /class\s+.*WeChat.*Runner|new\s+.*WeChat.*Runner/);
  assert.doesNotMatch(devApi, /normalizeWeChatCustomerOpsResult|wechat-customer-stage56/);
  assert.doesNotMatch(chat, /normalizeWeChatCustomerOpsResult|wechat-customer-stage56/);
  assert.equal(runner.includes("runtime/data/secrets"), false);
});
