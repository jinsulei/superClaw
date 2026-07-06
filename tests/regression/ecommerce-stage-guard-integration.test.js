import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runStage1DesktopAssist } from "../../src/shared/ecommerce-stage1/runner.js";
import { runStage2LowRiskOps } from "../../src/shared/ecommerce-stage2/runner.js";
import { runStage3PublishPrep } from "../../src/shared/ecommerce-stage3/runner.js";
import { runStage4DoudianListing } from "../../src/shared/ecommerce-stage4/runner.js";
import { runStage56Ops } from "../../src/shared/ecommerce-stage56/runner.js";

const repoRoot = process.cwd();

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertUnifiedGuardResult(result, actionType, { blocked }) {
  assert.equal(result.ecommerce_guard?.action_type, actionType);
  assert.equal(Boolean(result.ecommerce_guard?.blocked), blocked);
  assert.equal(Boolean(result.blocked), blocked);
  assert.ok(result.ecommerce_result, "normalized ecommerce result should be attached");
  assert.ok(Array.isArray(result.task_events), "task_events should be exposed");
  assert.ok(result.task_events.length > 0, "task_events should not be empty");
  assert.ok(Array.isArray(result.tool_runs), "tool_runs should be exposed");
  assert.ok(result.tool_runs.length > 0, "tool_runs should not be empty");
}

test("all ecommerce stage runners use the unified guard wrapper without replacing local guards", () => {
  const stageFiles = [
    "src/shared/ecommerce-stage1/runner.js",
    "src/shared/ecommerce-stage2/runner.js",
    "src/shared/ecommerce-stage3/runner.js",
    "src/shared/ecommerce-stage4/runner.js",
    "src/shared/ecommerce-stage56/runner.js",
  ];

  for (const file of stageFiles) {
    const source = readSource(file);
    assert.match(source, /normalizeEcommerceStageGuardResult|classifyEcommerceActionGuard/);
    assert.doesNotMatch(source, /class\s+.*Ecommerce.*Runner|new\s+.*Ecommerce.*Runner/);
  }

  assert.match(readSource("src/shared/ecommerce-stage1/runner.js"), /guardStage1Action/);
  assert.match(readSource("src/shared/ecommerce-stage2/runner.js"), /containsHighRiskText|HIGH_RISK_TEXT_BLOCKED_BY_STAGE1/);
  assert.match(readSource("src/shared/ecommerce-stage3/runner.js"), /FORBIDDEN_FINAL_ACTIONS/);
  assert.match(readSource("src/shared/ecommerce-stage4/runner.js"), /FORBIDDEN_FINAL_ACTIONS/);
  assert.match(readSource("src/shared/ecommerce-stage56/runner.js"), /FORBIDDEN_ACTIONS/);
});

test("high risk stage actions are marked by the unified Action Guard", async () => {
  const cases = [
    {
      actionType: "send_wechat_message",
      run: () => runStage1DesktopAssist({ action_type: "send_wechat_message", query: "stage1 high risk fixture" }),
    },
    {
      actionType: "publish_video",
      run: () => runStage2LowRiskOps({ action_type: "publish_video", query: "stage2 high risk fixture" }),
    },
    {
      actionType: "publish_video",
      run: () => runStage3PublishPrep({ action_type: "publish_video", query: "stage3 high risk fixture" }),
    },
    {
      actionType: "change_product_price",
      run: () => runStage4DoudianListing({ action_type: "change_product_price", query: "stage4 high risk fixture" }),
    },
    {
      actionType: "send_live_comment",
      run: () => runStage56Ops({ action_type: "send_live_comment", query: "stage56 high risk fixture" }),
    },
  ];

  for (const entry of cases) {
    const result = await entry.run();
    assertUnifiedGuardResult(result, entry.actionType, { blocked: true });
    assert.equal(result.ecommerce_guard.requires_confirmation, true);
  }
});

test("low risk read draft and prepare actions are not blocked", async () => {
  const cases = [
    {
      actionType: "read_dashboard",
      run: () => runStage1DesktopAssist({ action_type: "read_dashboard", query: "stage1 safe read fixture" }),
    },
    {
      actionType: "generate_product_suggestion",
      run: () => runStage2LowRiskOps({ action_type: "generate_product_suggestion", query: "stage2 safe analysis fixture" }),
    },
    {
      actionType: "prepare_publish_draft",
      run: () => runStage3PublishPrep({ action_type: "prepare_publish_draft", query: "stage3 safe draft fixture" }),
    },
    {
      actionType: "prepare_product_listing",
      run: () => runStage4DoudianListing({ action_type: "prepare_product_listing", query: "stage4 safe prepare fixture" }),
    },
    {
      actionType: "generate_reply_draft",
      run: () => runStage56Ops({ action_type: "generate_reply_draft", query: "stage56 safe draft fixture" }),
    },
  ];

  for (const entry of cases) {
    const result = await entry.run();
    assertUnifiedGuardResult(result, entry.actionType, { blocked: false });
  }
});
