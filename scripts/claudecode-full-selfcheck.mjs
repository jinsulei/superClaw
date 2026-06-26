import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const cwd = path.resolve(args.cwd || process.cwd());
const panelUrl = String(args["panel-url"] || "http://127.0.0.1:3020").replace(/\/+$/, "");
const jsonMode = Boolean(args.json);
const skipApiRun = Boolean(args["skip-api-run"]);
const source = String(args.source || "manual");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function tempRoot() {
  return process.platform === "win32" ? "C:\\tmp" : os.tmpdir();
}

function redact(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer ***")
    .replace(/sk-cp-[A-Za-z0-9_-]{12,}/g, "sk-cp-***")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***")
    .replace(/(api[_-]?key|auth[_-]?token|token|secret|password)(["'\s:=]+)([^"',\s}]{8,})/gi, "$1$2***");
}

function sha8(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
}

function safeRun(command, commandArgs = [], options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    timeout: options.timeoutMs || 8000,
    windowsHide: true,
    shell: false,
  });
  return {
    command,
    args: commandArgs,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal || "",
    stdout: redact(String(result.stdout || "").trim()).slice(0, 1200),
    stderr: redact(String(result.stderr || result.error?.message || "").trim()).slice(0, 1200),
    durationMs: Date.now() - startedAt,
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function findRepoRoot(start) {
  let current = path.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "src-tauri"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

function httpRequest(method, targetUrl, body = null, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === "https:" ? https : http;
    const payload = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const req = client.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          "content-type": "application/json",
          ...(payload ? { "content-length": String(payload.length) } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: res.headers,
            text: redact(text).slice(0, 100000),
          });
        });
      }
    );
    req.on("error", (error) => resolve({ ok: false, status: 0, text: redact(error.message) }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, text: "timeout" });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function parseSseText(sseText) {
  const chunks = [];
  for (const line of String(sseText || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.text) chunks.push(String(parsed.text));
    } catch {}
  }
  return chunks.join("");
}

function summarizeRelayConfig(repoRoot) {
  const candidates = [
    path.join(repoRoot, "src-tauri", "resources", "data", "claude-panel", "relay-config.json"),
    path.join(repoRoot, "src-tauri", "resources", "runtime", "claude-panel", "relay-config.json"),
  ];
  for (const filePath of candidates) {
    const config = readJson(filePath);
    if (!config) continue;
    const apiKey = String(config.apiKey || "");
    return {
      exists: true,
      path: filePath,
      interfaceType: String(config.interfaceType || "relay"),
      provider: String(config.defaultProvider || config.provider || ""),
      model: String(config.model || ""),
      baseUrl: String(config.baseUrl || ""),
      hasApiKey: apiKey.length > 0,
      apiKeyFingerprint: apiKey ? sha8(apiKey) : "",
      isMasked: /\*{3,}|sk-\*\*\*/.test(apiKey),
      isPlaceholder: /YOUR_API_KEY|placeholder|login-required/i.test(apiKey),
    };
  }
  return { exists: false };
}

function listFilePresence(repoRoot) {
  const files = [
    "src-tauri/resources/runtime/claude-panel/server.js",
    "src-tauri/resources/runtime/claude-panel/public/app.js",
    "src-tauri/resources/data/claude-panel/relay-config.json",
    "src-tauri/resources/runtime/claude-panel/package.json",
    "scripts/claudecode-full-selfcheck.mjs",
  ];
  return files.map((relativePath) => ({
    path: relativePath,
    exists: fs.existsSync(path.join(repoRoot, relativePath)),
  }));
}

function getGitInfo(repoRoot) {
  const branch = safeRun("git", ["branch", "--show-current"], { timeoutMs: 5000 });
  const head = safeRun("git", ["log", "--oneline", "-n", "1"], { timeoutMs: 5000 });
  const status = safeRun("git", ["status", "--short"], { timeoutMs: 5000 });
  return {
    branch: branch.ok ? branch.stdout : "",
    head: head.ok ? head.stdout : "",
    dirty: Boolean(status.stdout),
    status: status.stdout,
  };
}

function getPortSnapshot() {
  if (process.platform !== "win32") {
    return safeRun("sh", ["-lc", "netstat -an | grep -E ':(1420|3020|8642|18789)' || true"], { timeoutMs: 5000 });
  }
  return safeRun("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-NetTCPConnection -State Listen -LocalPort 1420,3020,8642,18789 -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess | ConvertTo-Json -Compress",
  ], { timeoutMs: 7000 });
}

function getToolSnapshot() {
  return {
    node: safeRun(process.execPath, ["--version"], { timeoutMs: 5000 }),
    npm: safeRun("npm.cmd", ["--version"], { timeoutMs: 5000 }),
    git: safeRun("git", ["--version"], { timeoutMs: 5000 }),
    claude: safeRun("where.exe", ["claude"], { timeoutMs: 5000 }),
  };
}

async function main() {
  const repoRoot = findRepoRoot(cwd);
  const outDir = path.join(tempRoot(), `claudecode-full-selfcheck-${timestamp()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "claudecode-full-selfcheck-report.md");

  const statusResp = await httpRequest("GET", `${panelUrl}/api/status`, null, 6000);
  let statusJson = null;
  try {
    statusJson = JSON.parse(statusResp.text);
  } catch {}

  const apiRunResp = skipApiRun
    ? { skipped: true, ok: false, status: 0, text: "" }
    : await httpRequest("POST", `${panelUrl}/api/run`, {
        prompt: "Only reply OK.",
        cwd: repoRoot,
        toolProfile: "none",
        permissionProfile: "default",
        mode: "default",
      }, 16000);

  const apiRunText = parseSseText(apiRunResp.text);
  const git = getGitInfo(repoRoot);
  const relayConfig = summarizeRelayConfig(repoRoot);
  const files = listFilePresence(repoRoot);
  const ports = getPortSnapshot();
  const tools = getToolSnapshot();

  const effectiveMode = statusJson?.effectiveMode || statusJson?.runtimeMode || "";
  const runtimeMode = effectiveMode === "NATIVE_CLAUDE_CODE"
    ? "Native Claude Code CLI"
    : effectiveMode === "CLAUDE_PANEL_RELAY"
      ? "Claude Panel OPENAI_RELAY"
      : "Claude Panel";
  const relayMode = statusJson?.relay?.available || statusJson?.relayConfig?.configured ? "configured" : "not configured";
  const model = statusJson?.relay?.model || statusJson?.relayConfig?.model || statusJson?.model || relayConfig.model || "";
  const baseUrl = statusJson?.relay?.baseUrlPresent
    ? (statusJson?.relayConfig?.baseUrl || relayConfig.baseUrl || statusJson?.baseHost || "")
    : (statusJson?.relayConfig?.baseUrl || relayConfig.baseUrl || "");
  const apiOk = apiRunResp.skipped ? "SKIPPED" : apiRunResp.ok && /OK/i.test(apiRunText) ? "PASS" : "CHECK";
  const shellToolSupport = effectiveMode === "NATIVE_CLAUDE_CODE"
    ? "NATIVE_CLAUDE_CLI_AVAILABLE"
    : "NO_NATIVE_TOOL_BRIDGE_IN_RELAY";

  const summaryItems = [
    `1. Module: ${runtimeMode}.`,
    `2. Source: ${source}.`,
    `3. Repo branch: ${git.branch || "unknown"}.`,
    `4. Repo HEAD: ${git.head || "unknown"}.`,
    `5. Panel status endpoint: ${statusResp.ok ? "PASS" : `CHECK(${statusResp.status})`}.`,
    `6. Relay config: ${relayMode}.`,
    `7. Provider/model: ${relayConfig.provider || statusJson?.relayConfig?.provider || "unknown"} / ${model || "unknown"}.`,
    `8. Base URL: ${baseUrl || "not configured"}.`,
    `9. API key visible state: ${statusJson?.relayConfig?.apiKeyConfigured || relayConfig.hasApiKey ? "configured" : "missing"}.`,
    `10. Native Claude CLI: ${statusJson?.nativeClaude?.available || statusJson?.claudeVersion || tools.claude.ok ? "detected" : "not detected"}.`,
    `11. Real shell tool-call bridge: ${shellToolSupport}.`,
    `12. Browser/desktop/OCR bridge: not directly exposed through Claude Panel relay.`,
    `13. /api/run low-flow OK test: ${apiOk}.`,
    `14. Report: ${reportPath}.`,
  ];

  const report = [
    "# Claude Code full selfcheck",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Repo: ${repoRoot}`,
    `Panel URL: ${panelUrl}`,
    "",
    "## Summary",
    "",
    ...summaryItems.map((line) => `- ${line}`),
    "",
    "## Safety conclusion",
    "",
    "- Model-generated pseudo tool-call text is not treated as executable code.",
    "- This selfcheck uses fixed read-only probes plus an optional low-flow /api/run check.",
    "- No API key, token, or Authorization value is printed.",
    "",
    "## File presence",
    "",
    ...files.map((item) => `- ${item.exists ? "PASS" : "MISS"} ${item.path}`),
    "",
    "## Relay config",
    "",
    `- exists: ${relayConfig.exists ? "yes" : "no"}`,
    `- interfaceType: ${relayConfig.interfaceType || ""}`,
    `- provider: ${relayConfig.provider || ""}`,
    `- model: ${relayConfig.model || ""}`,
    `- baseUrl: ${relayConfig.baseUrl || ""}`,
    `- hasApiKey: ${relayConfig.hasApiKey ? "yes" : "no"}`,
    `- apiKeyFingerprint: ${relayConfig.apiKeyFingerprint || ""}`,
    `- isMasked: ${relayConfig.isMasked ? "yes" : "no"}`,
    `- isPlaceholder: ${relayConfig.isPlaceholder ? "yes" : "no"}`,
    "",
    "## Port snapshot",
    "",
    "```text",
    ports.stdout || ports.stderr || "no port snapshot",
    "```",
    "",
    "## Tool snapshot",
    "",
    `- node: ${tools.node.ok ? tools.node.stdout : tools.node.stderr || "missing"}`,
    `- npm: ${tools.npm.ok ? tools.npm.stdout : tools.npm.stderr || "missing"}`,
    `- git: ${tools.git.ok ? tools.git.stdout : tools.git.stderr || "missing"}`,
    `- claude command: ${tools.claude.ok ? "detected" : "missing"}`,
    "",
    "## /api/run low-flow check",
    "",
    `- skipped: ${apiRunResp.skipped ? "yes" : "no"}`,
    `- status: ${apiRunResp.status}`,
    `- result: ${apiOk}`,
    "",
  ].join("\n");

  fs.writeFileSync(reportPath, report, "utf8");

  const result = {
    ok: Boolean(statusResp.ok && files.every((item) => item.exists) && (skipApiRun || apiRunResp.ok || apiRunResp.status === 400)),
    reportPath,
    summaryItems,
    status: {
      panelStatus: statusResp.status,
      apiRunStatus: apiRunResp.status,
      apiRunResult: apiOk,
      relayMode,
      model,
      baseUrl,
    },
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${summaryItems.join("\n")}\n\nReport: ${reportPath}\n`);
  }
}

main().catch((error) => {
  const root = tempRoot();
  const outDir = path.join(root, `claudecode-full-selfcheck-${timestamp()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "claudecode-full-selfcheck-report.md");
  fs.writeFileSync(reportPath, `# Claude Code full selfcheck\n\nFailed: ${redact(error.stack || error.message)}\n`, "utf8");
  const result = {
    ok: false,
    reportPath,
    summaryItems: [
      "1. Module: Claude Panel.",
      "2. Selfcheck failed before completion.",
      `3. Report: ${reportPath}.`,
    ],
    error: redact(error.message),
  };
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Claude selfcheck failed. Report: ${reportPath}\n`);
  }
  process.exitCode = 1;
});
