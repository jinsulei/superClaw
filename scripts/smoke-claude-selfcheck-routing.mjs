import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "src-tauri", "resources", "runtime", "claude-panel", "server.js");
const scriptPath = path.join(repoRoot, "scripts", "claudecode-full-selfcheck.mjs");
const server = fs.readFileSync(serverPath, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const handleRunStart = server.indexOf("async function handleRun");
const handleRunBody = handleRunStart >= 0 ? server.slice(handleRunStart, server.indexOf("function handleStatus", handleRunStart)) : "";

assert(server.includes("function convertSelfcheckPromptToExecutor"), "missing convertSelfcheckPromptToExecutor");
assert(server.includes("function handleClaudeSelfcheckRun"), "missing handleClaudeSelfcheckRun");
assert(server.includes("scripts/claudecode-full-selfcheck.mjs"), "missing selfcheck script reference");
assert(handleRunBody.includes("convertSelfcheckPromptToExecutor(prompt)"), "handleRun does not route selfcheck prompt");
assert(handleRunBody.indexOf("convertSelfcheckPromptToExecutor(prompt)") < handleRunBody.indexOf("handleOpenAiRelayRun"), "selfcheck route must run before relay");

const samplePrompt = "Claude Code 全面自检：安全对话、浏览器自动化、接管模式、生成报告、只读检查。";
assert(server.includes("/Claude\\s*Code\\s*\\u5168\\u9762\\u81ea\\u68c0/i"), "missing Claude Code full selfcheck trigger");
assert(!server.includes("eval("), "server should not eval tool text");

const result = spawnSync(process.execPath, [
  scriptPath,
  "--json",
  "--skip-api-run",
  "--cwd",
  repoRoot,
  "--panel-url",
  "http://127.0.0.1:3020",
  "--source",
  "smoke",
], {
  cwd: repoRoot,
  encoding: "utf8",
  windowsHide: true,
  timeout: 30000,
});

assert(result.status === 0, `selfcheck script failed: ${result.stderr || result.stdout}`);
const parsed = JSON.parse(result.stdout);
const combined = JSON.stringify(parsed);
assert(parsed.reportPath && fs.existsSync(parsed.reportPath), "selfcheck report was not created");
assert(!combined.includes(samplePrompt), "selfcheck output echoed the source prompt");
assert(!combined.includes("[TOOL_CALL]"), "selfcheck output leaked raw pseudo tool-call text");

console.log("CLAUDE_SELFCHECK_ROUTED: PASS");
console.log("CLAUDE_SELFCHECK_NOT_ECHOED: PASS");
console.log("CLAUDE_SELFCHECK_NO_PSEUDO_TOOLCALL_TEXT: PASS");
console.log("CLAUDE_SELFCHECK_REPORT_CREATED: PASS");
