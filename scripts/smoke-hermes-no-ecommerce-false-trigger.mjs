import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyHermesEcommerceWorkflowIntent,
  shouldRunHermesEcommerceWorkflow,
} from "../src/engines/hermes/lib/ecommerce-workflow-guard.js";

const imagePathQuestion = "\u4f60\u68c0\u6d4b\u4e0b\u56fe\u751f\u56fe\u662f\u628a\u56fe\u7247\u7ed9\u5230\u73b0\u5728\u7684\u5bf9\u8bdd\u6846\uff0c\u8fd8\u662f\u628a\u56fe\u7247\u62c9\u5230\u804a\u5929\u6846\u5185\uff1f\u7ed9\u6211\u6c47\u62a5\u4e0b\u6574\u4f53\u7684\u8def\u5f84";
const technicalQuestion = "\u5e2e\u6211\u68c0\u67e5 Hermes \u5f53\u524d\u804a\u5929\u8f93\u5165\u6846\u4e3a\u4ec0\u4e48\u6ca1\u6709\u6e05\u7a7a\u3002";
const explicitEcommerce = "\u5f00\u59cb\u7535\u5546\u6d41\u7a0b\uff0c\u51c6\u5907\u6296\u97f3\u5546\u54c1\u53d1\u5e03\uff0c\u4f46\u4e0d\u8981\u70b9\u51fb\u6700\u7ec8\u53d1\u5e03\u6309\u94ae\u3002";
const softCommerceWords = "\u5e2e\u6211\u5206\u6790\u56fe\u7247\u4e0a\u4f20\u8def\u5f84\u548c\u6296\u97f3\u5546\u54c1\u56fe\u5728\u804a\u5929\u6846\u91cc\u7684\u663e\u793a\u95ee\u9898\u3002";

const imageDecision = classifyHermesEcommerceWorkflowIntent(imagePathQuestion);
assert.equal(imageDecision.allowed, false);
assert.notEqual(imageDecision.reason, "EXPLICIT_ECOMMERCE_WORKFLOW");
console.log("HERMES_IMAGE_PATH_NO_ECOMMERCE: PASS");

const techDecision = classifyHermesEcommerceWorkflowIntent(technicalQuestion);
assert.equal(techDecision.allowed, false);
assert.equal(techDecision.reason, "TECH_OR_PATH_QUESTION_STAYS_IN_CHAT");
console.log("HERMES_TECH_CHAT_NO_ECOMMERCE: PASS");

const softDecision = classifyHermesEcommerceWorkflowIntent(softCommerceWords);
assert.equal(softDecision.allowed, false);
assert.equal(softDecision.channel, "hermes-chat");
console.log("HERMES_SOFT_WORDS_NO_ECOMMERCE: PASS");

const explicitDecision = classifyHermesEcommerceWorkflowIntent(explicitEcommerce);
assert.equal(explicitDecision.allowed, true);
assert.equal(shouldRunHermesEcommerceWorkflow(explicitEcommerce), true);
assert.equal(explicitDecision.channel, "ecommerce-workflow");
console.log("HERMES_EXPLICIT_ECOMMERCE_ALLOWED: PASS");

const pendingDecision = classifyHermesEcommerceWorkflowIntent("\u4f60\u662f\u8c01\uff1f", {
  hasPendingEcommerceTask: true,
});
assert.equal(pendingDecision.allowed, false);
assert.equal(pendingDecision.pendingRequiresConfirmation, true);
assert.equal(shouldRunHermesEcommerceWorkflow("\u7ee7\u7eed\u7535\u5546\u4efb\u52a1", {
  hasPendingEcommerceTask: true,
}), true);
console.log("HERMES_PENDING_TASK_NO_AUTO_RESUME: PASS");

const chatSource = readFileSync(new URL("../src/engines/hermes/pages/chat.js", import.meta.url), "utf8");
const maybeRunStart = chatSource.indexOf("async function maybeRunEcommerceStage");
const guardIndex = chatSource.indexOf("classifyHermesEcommerceWorkflowIntent(userText)", maybeRunStart);
const stage2Index = chatSource.indexOf("detectStage2Intent(userText)", maybeRunStart);
assert.ok(maybeRunStart > 0, "maybeRunEcommerceStage is missing");
assert.ok(guardIndex > maybeRunStart, "Hermes ecommerce guard is missing");
assert.ok(stage2Index > guardIndex, "Hermes ecommerce guard must run before stage detectors");
assert.ok(chatSource.includes("HERMES_STALE_WORKFLOW_OUTPUT_DROPPED"));
assert.ok(chatSource.includes("channel: 'ecommerce-workflow'"));
assert.ok(chatSource.includes("activeEcommerceWorkflowRunId"));
console.log("HERMES_STALE_WORKFLOW_DROPPED: PASS");

console.log("smoke-hermes-no-ecommerce-false-trigger passed");
