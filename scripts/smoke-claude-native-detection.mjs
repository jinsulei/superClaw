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

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method: "GET", timeout: 6000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), body });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.end();
  });
}

async function waitForStatus(port) {
  let lastError;
  for (let index = 0; index < 40; index += 1) {
    try {
      return await requestJson(port, "/api/status");
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError || new Error("server did not start");
}

function makeMockClaude(dir) {
  const scriptPath = path.join(dir, "mock-claude.mjs");
  fs.writeFileSync(scriptPath, [
    "if (process.argv.includes('--version')) {",
    "  console.log('9.9.9 (Claude Code mock)');",
    "  process.exit(0);",
    "}",
    "console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'mock-session-12345678', model: 'mock-claude', tools: [] }));",
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

function startPanel(port, extraEnv = {}) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      CLEAN_PANEL_DATA_DIR: path.join(os.tmpdir(), `claude-native-detection-${port}`),
      ...extraEnv,
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  return { child, getStderr: () => stderr };
}

async function withPanel(port, env, action) {
  const panel = startPanel(port, env);
  try {
    const status = await waitForStatus(port);
    return await action(status, panel);
  } finally {
    panel.child.kill("SIGTERM");
  }
}

const server = fs.readFileSync(serverPath, "utf8");
assert(server.includes("effectiveMode"), "server status must expose effectiveMode");
assert(server.includes("nativeClaude"), "server status must expose nativeClaude");
assert(server.includes("CLAUDE_PANEL_DISABLE_GLOBAL_CLAUDE"), "server must support no-cli smoke mode");

await withPanel(33201, {
  CLAUDE_PANEL_DISABLE_GLOBAL_CLAUDE: "1",
  CLAUDE_CLI_PATH: path.join(os.tmpdir(), "missing-claude-command.exe"),
}, async (status) => {
  assert(status.status === 200, "status HTTP failed");
  assert(status.data.nativeClaude?.available === false, "native should be unavailable when CLI disabled");
  assert(status.data.effectiveMode === "CLAUDE_PANEL_RELAY", "no-cli mode should report relay");
  assert(!JSON.stringify(status.data).includes("sk-"), "status leaked a key-like value");
});

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-claude-"));
const mockCommand = makeMockClaude(mockDir);
await withPanel(33202, {
  CLAUDE_CLI_PATH: mockCommand,
  CLAUDE_PANEL_DISABLE_GLOBAL_CLAUDE: "1",
}, async (status) => {
  assert(status.status === 200, "mock status HTTP failed");
  assert(status.data.nativeClaude?.available === true, "mock native should be available");
  assert(status.data.effectiveMode === "NATIVE_CLAUDE_CODE", "mock native should become effective mode");
  assert(String(status.data.nativeClaude.path).includes(path.basename(mockCommand)), "mock native path not reported");
});

console.log("CLAUDE_NATIVE_DETECTION_NO_CLI: PASS");
console.log("CLAUDE_NATIVE_DETECTION_WITH_MOCK: PASS");
console.log("CLAUDE_STATUS_MODE_EXPLICIT: PASS");
console.log("CLAUDE_STATUS_NO_KEY_LEAK: PASS");
