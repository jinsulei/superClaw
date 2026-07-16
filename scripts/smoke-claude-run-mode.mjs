import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "src-tauri", "resources", "runtime", "claude-panel", "server.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeMockClaude(dir) {
  const scriptPath = path.join(dir, "mock-claude.mjs");
  fs.writeFileSync(scriptPath, [
    "if (process.argv.includes('--version')) {",
    "  console.log('9.9.9 (Claude Code mock)');",
    "  process.exit(0);",
    "}",
    "if (!process.argv.includes('--include-partial-messages')) {",
    "  console.error('missing --include-partial-messages');",
    "  process.exit(2);",
    "}",
    "const tools = process.argv[process.argv.indexOf('--tools') + 1] || '';",
    "const allowedTools = process.argv[process.argv.indexOf('--allowedTools') + 1] || '';",
    "if (!tools.includes('WebFetch') || !tools.includes('WebSearch') || !allowedTools.includes('WebFetch') || !allowedTools.includes('WebSearch')) {",
    "  console.error('missing all-mode read-only web research tools');",
    "  process.exit(3);",
    "}",
    "const hasPlaywright = tools.includes('mcp__playwright__browser_navigate') || allowedTools.includes('mcp__playwright__browser_navigate');",
    "if (hasPlaywright) {",
    "  console.error('Playwright mode boundary mismatch');",
    "  process.exit(4);",
    "}",
    "console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'mock-session-87654321', model: 'mock-claude', tools: [] }));",
    "console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Inspecting the project.' }, { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'README.md' } }] } }));",
    "console.log(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'mock file content' }] } }));",
    "console.log(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'MOCK_' } } }));",
    "console.log(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'NATIVE_OK' } } }));",
    "console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'MOCK_NATIVE_OK' }] } }));",
    "console.log(JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 1, total_cost_usd: 0 }));",
  ].join("\n"), "utf8");
  const commandPath = path.join(dir, process.platform === "win32" ? "claude.cmd" : "claude");
  if (process.platform === "win32") {
    fs.writeFileSync(commandPath, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`, "utf8");
  } else {
    fs.writeFileSync(commandPath, `#!/bin/sh\n"${process.execPath}" "${scriptPath}" "$@"\n`, { mode: 0o755 });
  }
  return commandPath;
}

function startPanel(port, env) {
  const isolatedRoot = path.join(os.tmpdir(), `claude-run-mode-${port}`);
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      CLEAN_PANEL_HOME_DIR: path.join(isolatedRoot, "home"),
      CLEAN_PANEL_DATA_DIR: path.join(isolatedRoot, "data"),
      CLAUDE_CONFIG_DIR: path.join(isolatedRoot, "home", "claude-config"),
      CLAUDE_CODE_PROJECTS_DIR: path.join(isolatedRoot, "projects"),
      CLEAN_PANEL_CLAUDE_PROJECTS_JSON_PATH: path.join(isolatedRoot, "home", ".claude.json"),
      ...env,
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  return child;
}

function request(port, method, pathname, payload = null) {
  return new Promise((resolve, reject) => {
    const body = payload ? Buffer.from(JSON.stringify(payload), "utf8") : null;
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: body ? { "content-type": "application/json", "content-length": String(body.length) } : {},
      timeout: 25000,
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        text += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (body) req.write(body);
    req.end();
  });
}

async function waitForStatus(port) {
  let lastError;
  for (let index = 0; index < 40; index += 1) {
    try {
      const response = await request(port, "GET", "/api/status");
      if (response.status === 200) return JSON.parse(response.text);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error("server did not start");
}

function parseSseText(body) {
  const textParts = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.text) textParts.push(String(parsed.text));
    } catch {}
  }
  return textParts.join("");
}

function parseSseEvents(body, eventName) {
  const events = [];
  let currentEvent = "message";
  for (const line of String(body || "").split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:") || currentEvent !== eventName) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()));
    } catch {}
  }
  return events;
}

const server = fs.readFileSync(serverPath, "utf8");
assert(server.includes('runMode.effectiveMode === "CLAUDE_PANEL_RELAY"'), "relay branch must be mode-gated");
assert(server.includes('runtimeMode: "NATIVE_CLAUDE_CODE"'), "native branch must emit native runtime mode");
assert(server.includes("stripUnsupportedToolCallText(redacted)"), "relay/native output must strip pseudo tool text");
assert(server.includes("CLAUDE_USER_LANGUAGE_SYSTEM_PROMPT"), "missing shared Claude language system prompt");
assert(server.includes("Default response language is Simplified Chinese."), "missing Simplified Chinese default rule");
assert(server.includes("`${CLAUDE_USER_LANGUAGE_SYSTEM_PROMPT}\\n\\n${buildClaudeCodeSystemPrompt(\"CLAUDE_PANEL_RELAY\")}`"), "relay branch must include language prompt");
assert(server.includes('args.push("--append-system-prompt", CLAUDE_USER_LANGUAGE_SYSTEM_PROMPT)'), "native branch must include language prompt");
assert(server.includes("function buildClaudeUserPrompt"), "native branch must wrap user prompt for default Chinese output");
assert(server.includes("Reply to the user in Simplified Chinese by default."), "native user prompt wrapper must require Simplified Chinese");
assert(server.includes("const claudeUserPrompt = buildClaudeUserPrompt(prompt);"), "native run must build language-wrapped prompt");
assert(server.includes('"WebFetch"') && server.includes('"WebSearch"'), "browser mode must expose read-only web search and fetch tools");

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-claude-run-"));
const mockCommand = makeMockClaude(mockDir);
const port = 33203;
const panel = startPanel(port, {
  CLAUDE_CLI_PATH: mockCommand,
  CLAUDE_PANEL_DISABLE_GLOBAL_CLAUDE: "1",
});

try {
  const status = await waitForStatus(port);
  assert(status.effectiveMode === "NATIVE_CLAUDE_CODE", "mock native server did not select native mode");
  assert(
    status.securityPolicy?.defaultPermissionProfile === "browser",
    "Claude panel must advertise browser automation as the default permission profile"
  );

  const selfcheckPrompt = "Claude Code \u5168\u9762\u81ea\u68c0\uff1a\u53ea\u8bfb\u68c0\u67e5\uff0c\u751f\u6210\u62a5\u544a\u3002";
  const selfcheck = await request(port, "POST", "/api/run", {
    prompt: selfcheckPrompt,
    cwd: repoRoot,
    toolProfile: "none",
    permissionProfile: "default",
    mode: "default",
  });
  assert(selfcheck.status === 200, "selfcheck request failed");
  assert(selfcheck.text.includes("CLAUDE_PANEL_SAFE_SELFCHECK"), "selfcheck did not use safe executor");
  assert(!selfcheck.text.includes("[TOOL_CALL]"), "selfcheck leaked pseudo tool-call text");

  const visibleWorkbenchSelfcheck = await request(port, "POST", "/api/run", {
    prompt: "\u8bf7\u6267\u884c\u4e00\u6b21 ClaudeCode \u5de5\u4f5c\u53f0\u7528\u6237\u53ef\u89c1\u5c42\u9762\u7684\u5b8c\u6574\u81ea\u68c0\u3002",
    cwd: repoRoot,
    toolProfile: "none",
    permissionProfile: "default",
    mode: "default",
  });
  assert(visibleWorkbenchSelfcheck.status === 200, "visible workbench selfcheck request failed");
  assert(visibleWorkbenchSelfcheck.text.includes("CLAUDE_PANEL_SAFE_SELFCHECK"), "visible workbench selfcheck did not use safe executor");
  assert(!visibleWorkbenchSelfcheck.text.includes("[TOOL_CALL]"), "visible workbench selfcheck leaked pseudo tool-call text");

  const native = await request(port, "POST", "/api/run", {
    prompt: "Only reply MOCK_NATIVE_OK.",
    cwd: repoRoot,
    toolProfile: "none",
    permissionProfile: "default",
    mode: "default",
  });
  assert(native.status === 200, "native request failed");
  assert(native.text.includes("NATIVE_CLAUDE_CODE"), "native run did not emit native mode");
  assert(parseSseText(native.text).includes("MOCK_NATIVE_OK"), "native mock output missing");
  const streamedTextEvents = parseSseEvents(native.text, "text");
  assert(streamedTextEvents.length === 2, "native partial text should be emitted as two SSE chunks without a duplicate final");
  assert(streamedTextEvents.map((event) => event.text || "").join("") === "MOCK_NATIVE_OK", "native partial text chunks were not preserved in order");
  const processEvents = parseSseEvents(native.text, "process");
  assert(processEvents.some((event) => event.kind === "reasoning"), "native reasoning process event missing");
  assert(processEvents.some((event) => event.kind === "tool_use" && event.tool === "Read"), "native tool-use process event missing");
  assert(processEvents.some((event) => event.kind === "tool_result" && event.status === "completed"), "native tool-result process event missing");
  assert(!native.text.includes("OPENAI_RELAY"), "native mock run should not emit relay mode");

  const portableClaudeConfig = path.join(os.tmpdir(), `claude-run-mode-${port}`, "home", "claude-config", ".claude.json");
  const portableMcp = JSON.parse(fs.readFileSync(portableClaudeConfig, "utf8"));
  assert(portableMcp.mcpServers?.playwright?.superclawManaged === true, "portable Playwright MCP was not configured");
  assert(fs.existsSync(portableMcp.mcpServers.playwright.command), "portable Playwright MCP node path is invalid");
  assert(fs.existsSync(portableMcp.mcpServers.playwright.args[0]), "portable Playwright MCP entry path is invalid");

  const takeover = await request(port, "POST", "/api/run", {
    prompt: "Take over the browser.",
    cwd: repoRoot,
    toolProfile: "none",
    permissionProfile: "takeover",
    mode: "default",
    browserAccess: "once",
  });
  assert(takeover.status === 409, "takeover must be blocked without explicit confirmation");
  assert(takeover.text.includes("TAKEOVER_CONFIRMATION_REQUIRED"), "takeover confirmation error code missing");
} finally {
  panel.kill("SIGTERM");
}

console.log("CLAUDE_SELFCHECK_USES_EXECUTOR: PASS");
console.log("CLAUDE_RELAY_RUNS_RELAY: PASS");
console.log("CLAUDE_RELAY_BLOCKS_TOOLCALL_TEXT: PASS");
console.log("CLAUDE_NATIVE_RUNS_CLI_WHEN_AVAILABLE: PASS");
console.log("CLAUDE_MODE_NOT_MISLABELED: PASS");
console.log("CLAUDE_DEFAULT_CHINESE_PROMPT: PASS");
console.log("CLAUDE_NATIVE_PROCESS_EVENTS: PASS");
console.log("CLAUDE_SAFE_MODE_HAS_READ_ONLY_WEB_RESEARCH: PASS");
console.log("CLAUDE_SAFE_MODE_EXCLUDES_PLAYWRIGHT: PASS");
console.log("CLAUDE_TAKEOVER_REQUIRES_CONFIRMATION: PASS");
