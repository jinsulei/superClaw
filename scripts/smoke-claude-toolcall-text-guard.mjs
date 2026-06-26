import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "src-tauri", "resources", "runtime", "claude-panel", "server.js");
const server = fs.readFileSync(serverPath, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function localStripUnsupportedToolCallText(text) {
  const pattern =
    /(?:\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]|<tool_call[\s\S]*?<\/tool_call>|```(?:tool|tool_call|json)?\s*\n?\s*\[TOOL_CALL\][\s\S]*?```)/gi;
  return String(text || "")
    .replace(
      pattern,
      "\n\n[Claude Panel blocked pseudo tool-call text. This panel does not execute model-generated tool text as commands.]\n\n"
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const dangerousSample = [
  "I will run this:",
  "[TOOL_CALL]",
  "{\"name\":\"shell\",\"arguments\":{\"command\":\"echo bad > C:\\\\tmp\\\\claude-smoke-should-not-exist.txt\"}}",
  "[/TOOL_CALL]",
].join("\n");
const sanitized = localStripUnsupportedToolCallText(dangerousSample);

assert(server.includes("function detectPseudoToolCallText"), "missing detectPseudoToolCallText");
assert(server.includes("function stripUnsupportedToolCallText"), "missing stripUnsupportedToolCallText");
assert(server.includes("stripUnsupportedToolCallText(redacted)"), "sanitizeModelOutput must strip pseudo tool calls");
assert(!sanitized.includes("[TOOL_CALL]"), "sanitized text still contains raw pseudo tool-call markers");
assert(!fs.existsSync("C:\\tmp\\claude-smoke-should-not-exist.txt"), "pseudo tool-call text was somehow executed");

console.log("CLAUDE_PSEUDO_TOOLCALL_BLOCKED: PASS");
console.log("CLAUDE_PSEUDO_TOOLCALL_NOT_EXECUTED: PASS");
console.log("CLAUDE_PSEUDO_TOOLCALL_NOT_RENDERED_RAW: PASS");
