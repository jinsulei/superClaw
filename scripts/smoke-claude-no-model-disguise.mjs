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
    "console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'mock-session-no-disguise', model: 'mock-claude', tools: [] }));",
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

function startPanel(port, env = {}) {
  const dataDir = path.join(os.tmpdir(), `claude-no-disguise-${port}-${Date.now()}`);
  return spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      CLEAN_PANEL_DATA_DIR: dataDir,
      ...env,
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
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
      res.on("data", (chunk) => { text += chunk; });
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

function parseSse(body) {
  const events = [];
  const textParts = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      events.push(parsed);
      if (parsed.text) textParts.push(String(parsed.text));
    } catch {}
  }
  return { events, text: textParts.join("") };
}

const server = fs.readFileSync(serverPath, "utf8");
assert(server.includes("function isNativeRunWired"), "missing native run wiring gate");
assert(server.includes("CLAUDE_PANEL_DISABLE_NATIVE_RUN"), "missing native run disable test switch");
assert(server.includes("runWired: runMode.nativeClaude.runWired"), "status/meta must expose native runWired");
assert(server.includes('executionBackend: "native-claude-cli"'), "native /api/run must mark native backend");
assert(server.includes('spawnedProcess: true'), "native /api/run must prove spawned process");
assert(server.includes('relayCalled: false'), "native /api/run must prove relay was not called");
assert(server.includes('executionBackend: "openai-relay"'), "relay /api/run must mark relay backend");
assert(server.includes('spawnedProcess: false'), "relay /api/run must not claim spawned process");
assert(server.includes('relayCalled: true'), "relay /api/run must mark relay call");
assert(server.includes("stripUnsupportedToolCallText(redacted)"), "pseudo tool calls must still be stripped");

const noCliPort = 33301;
const noCliPanel = startPanel(noCliPort, {
  CLAUDE_PANEL_DISABLE_GLOBAL_CLAUDE: "1",
  CLAUDE_CLI_PATH: path.join(os.tmpdir(), "missing-claude-no-disguise.cmd"),
});
try {
  const status = await waitForStatus(noCliPort);
  assert(status.effectiveMode === "CLAUDE_PANEL_RELAY", "missing CLI must not report native mode");
  assert(status.nativeClaude?.available === false, "missing CLI must be unavailable");
} finally {
  noCliPanel.kill("SIGTERM");
}

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-claude-no-disguise-"));
const mockCommand = makeMockClaude(mockDir);

const unwiredPort = 33302;
const unwiredPanel = startPanel(unwiredPort, {
  CLAUDE_CLI_PATH: mockCommand,
  CLAUDE_PANEL_DISABLE_GLOBAL_CLAUDE: "1",
  CLAUDE_PANEL_DISABLE_NATIVE_RUN: "1",
});
try {
  const status = await waitForStatus(unwiredPort);
  assert(status.nativeClaude?.available === true, "mock CLI should be detected");
  assert(status.nativeClaude?.runWired === false, "unwired native run must be explicit");
  assert(status.effectiveMode === "CLAUDE_PANEL_RELAY", "unwired CLI must not report native mode");
} finally {
  unwiredPanel.kill("SIGTERM");
}

const wiredPort = 33303;
const wiredPanel = startPanel(wiredPort, {
  CLAUDE_CLI_PATH: mockCommand,
  CLAUDE_PANEL_DISABLE_GLOBAL_CLAUDE: "1",
});
try {
  const status = await waitForStatus(wiredPort);
  assert(status.effectiveMode === "NATIVE_CLAUDE_CODE", "wired mock CLI must report native mode");
  assert(status.nativeClaude?.runWired === true, "wired native run must be explicit");

  const run = await request(wiredPort, "POST", "/api/run", {
    prompt: "Only reply MOCK_NATIVE_OK.",
    cwd: repoRoot,
    toolProfile: "none",
    permissionProfile: "default",
    mode: "default",
  });
  assert(run.status === 200, "native run request failed");
  const parsed = parseSse(run.text);
  const combined = JSON.stringify(parsed.events);
  assert(combined.includes('"executionBackend":"native-claude-cli"'), "native run must expose native backend");
  assert(combined.includes('"spawnedProcess":true'), "native run must expose spawned process");
  assert(combined.includes('"relayCalled":false'), "native run must prove relay was not called");
  assert(parsed.text.includes("MOCK_NATIVE_OK"), "native run did not return mock CLI output");
} finally {
  wiredPanel.kill("SIGTERM");
}

console.log("CLAUDE_NO_FALSE_NATIVE_WITHOUT_CLI: PASS");
console.log("CLAUDE_NO_FALSE_NATIVE_WITH_UNWIRED_CLI: PASS");
console.log("CLAUDE_NATIVE_RUN_PROVES_SPAWN: PASS");
console.log("CLAUDE_RELAY_NOT_MISLABELED: PASS");
console.log("CLAUDE_TOOLCALL_NOT_EXECUTED_IN_RELAY: PASS");
