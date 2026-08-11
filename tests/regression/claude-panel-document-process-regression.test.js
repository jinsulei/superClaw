import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync("src-tauri/resources/runtime/claude-panel/server.js", "utf8");
const app = readFileSync("src-tauri/resources/runtime/claude-panel/public/app.js", "utf8");
const page = readFileSync("src-tauri/resources/runtime/claude-panel/public/index.html", "utf8");
const styles = readFileSync("src-tauri/resources/runtime/claude-panel/public/styles.css", "utf8");

test("Claude panel accepts PPTX and routes portable Office documents through the shared reader", () => {
  assert.match(panel, /"\.pptx"/);
  assert.match(panel, /presentationml\.presentation/);
  assert.match(panel, /mcp__superclaw_local_desktop__inspect_local_document/);
  assert.match(page, /\.pptx/);
  assert.match(app, /"pptx"/);
});

test("Claude planning text is moved into the execution card when a tool call follows", () => {
  assert.match(app, /shouldCaptureNarrative/);
  assert.match(app, /payload\.kind === "reasoning" \|\| payload\.kind === "tool_use"/);
  assert.match(app, /title: "执行说明"/);
  assert.match(app, /captureActiveAssistantTextForProcess\(\)/);
});

test("browser authorization preserves browser automation when a task also needs local commands", () => {
  assert.match(panel, /"mcp__playwright__browser_run_code_unsafe"/);
  assert.match(panel, /\["none", "read", "audit", "edit", "command"\]\.includes\(toolProfile\)/);
  assert.match(app, /const keepsBrowserTools = originalProfile === "browser" \|\| originalProfile === "takeover"/);
  assert.match(app, /overrides\.permissionProfile = keepsBrowserTools \? originalProfile : "expert"/);
});

test("browser automation defaults to local read access and exposes its controlled download directory", () => {
  assert.match(app, /permissionProfile: "browser",\s*\/\/ Browser automation[\s\S]*?toolProfile: "read"/);
  assert.match(app, /authorizationType === "browser"[\s\S]*?overrides\.toolProfile = "read"/);
  assert.match(panel, /const BROWSER_OUTPUT_DIR = path\.join\(APP_CONFIG_DIR, "browser-output"\)/);
  assert.match(panel, /\[UPLOAD_DIR, BROWSER_OUTPUT_DIR, \.\.\.getExecutionRoots\(\)\]/);
  assert.match(panel, /Browser automation downloads are saved to this deterministic SuperClaw output directory/);
});

test("takeover uses the complete task tool profile only after the user has confirmed it", () => {
  assert.match(app, /takeover:[\s\S]*?toolProfile: "command"/);
  assert.match(app, /takeoverAlreadyConfirmed/);
  assert.match(panel, /TAKEOVER_EXECUTION_SYSTEM_PROMPT/);
});

test("safe mode keeps local audit and diagnostic commands read-only", () => {
  assert.match(panel, /audit: \["Glob", "Grep", "Read", "LS", "Bash", "BashOutput", "KillBash"\]/);
  assert.match(panel, /本次是只读审计运行/);
  assert.match(panel, /禁止 Edit、Write、MultiEdit/);
  assert.match(app, /toolProfile: "audit"/);
  assert.match(app, /\["audit", "command"\]\.includes\(permissionConfig\?\.toolProfile\)/);
});

test("Claude output document cards can open or download approved PPTX files", () => {
  assert.match(panel, /function handlePanelDocumentDownload/);
  assert.match(panel, /function handlePanelDocumentOpen/);
  assert.match(panel, /function documentAttachmentDisposition\(filePath\)/);
  assert.match(panel, /function findPortableDocumentByName\(fileName, roots\)/);
  assert.match(panel, /findPortableDocumentByName\(path\.basename\(requested\), roots\)/);
  assert.match(panel, /filename\*=UTF-8''\$\{encodeURIComponent\(fileName\)\}/);
  assert.match(panel, /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/);
  assert.match(app, /\/api\/local-document\/open/);
  assert.match(app, /download\.href = `\/api\/local-document\?path=/);
  assert.match(app, /document-output-card__actions/);
  assert.match(app, /replaceClaudeLocalDocumentPathsForDisplay/);
  assert.match(app, /card\.addEventListener\("click", openDocument\)/);
  assert.match(app, /ppt: "PPT"/);
  assert.match(app, /download\.innerHTML = '<svg/);
});

test("plain Claude planning text is buffered until it is known to be final or execution narration", () => {
  assert.match(panel, /A native turn can emit a plain planning envelope/);
  assert.match(panel, /pendingAssistantText = \[pendingAssistantText, sanitizeModelOutput\(turnText/);
  assert.match(panel, /const executionNarrative = \[pendingAssistantText, turnText\]/);
  assert.match(panel, /"--headless"/);
});

test("Claude panel prevents a double submit from creating two native reply runs", () => {
  assert.match(app, /let runStartInFlight = false/);
  assert.match(app, /if \(!prompt \|\| runController \|\| runStartInFlight\) return/);
  assert.match(app, /const releaseStartLock = \(\) => \{ runStartInFlight = false; \}/);
  assert.match(app, /activeRunFinalized && \(event === "text" \|\| event === "process" \|\| event === "done"\)/);
  assert.match(app, /activeRunFinalized = true/);
});

test("Claude thinking and tool execution render as ordered process steps", () => {
  assert.match(app, /function renderExecutionProcessBlocks\(entries, thoughts, wrapper/);
  assert.match(app, /\[\[sc-process:\$\{kind\}\]\]/);
  assert.match(app, /function isStructuredExecutionPayload\(value\)/);
  assert.match(app, /const isActiveStep = Boolean\(options\.streaming\) && index === normalizedEntries\.length - 1/);
  assert.match(app, /summarizeExecutionPayload\(entry\.detail\)/);
  assert.match(app, /const label = entry\.kind === "tool_result"/);
  assert.match(app, /isCommand \? " is-command" : ""/);
  assert.match(styles, /assistant-thinking-block__params/);
  assert.match(styles, /\.assistant-thinking-block__item\.is-active::after/);
  assert.match(styles, /max-height: none/);
});

test("Claude reasoning narration goes to the execution process instead of replacing the final reply", () => {
  assert.match(panel, /function processNarrativeSummary\(text\)/);
  assert.match(panel, /containsReasoningLeakText\(turnText\)/);
  assert.match(panel, /text: processNarrativeSummary\(turnText\)/);
  assert.match(panel, /if \(visibleText\) writeEvent\(res, "text", \{ text: visibleText \}\)/);
  assert.doesNotMatch(panel, /我会用中文直接给结论：内部推理和风险分析过程已隐藏/);
});
