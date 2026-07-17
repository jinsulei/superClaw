"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { McpServer } = require("../openclaw/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js");
const { StdioServerTransport } = require("../openclaw/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js");
const z = require("../openclaw/node_modules/zod");

const SENSITIVE_NAMES = /^(?:\.env(?:\..*)?|id_rsa|id_ed25519|credentials\.json|token\.json)$/i;
const LOCAL_OPEN_STATE_PATH = path.resolve(__dirname, "..", "..", "data", "claude-panel", "local-desktop-open.json");

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function readPortableOpenState() {
  try {
    const state = JSON.parse(fs.readFileSync(LOCAL_OPEN_STATE_PATH, "utf8"));
    if (state?.enabled !== true || Number(state.expiresAt || 0) < Date.now()) return null;
    const roots = Array.isArray(state.roots)
      ? state.roots.map((item) => path.resolve(String(item || ""))).filter(Boolean)
      : [];
    return roots.length ? { roots } : null;
  } catch {
    return null;
  }
}

function allowedRoots() {
  const state = readPortableOpenState();
  if (state) return state.roots;
  try {
    const parsed = JSON.parse(process.env.SUPERCLAW_CLAUDE_DESKTOP_OPEN_ROOTS || "[]");
    return Array.isArray(parsed)
      ? parsed.map((item) => path.resolve(String(item || ""))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function findUniqueApprovedBasename(fileName, roots) {
  const expected = String(fileName || "").trim().toLowerCase();
  if (!expected || SENSITIVE_NAMES.test(expected)) return "";
  const matches = [];
  const visit = (dir, depth) => {
    if (depth > 3 || matches.length > 1) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length > 1) return;
      const candidate = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === expected) {
        matches.push(candidate);
      } else if (entry.isDirectory()) {
        visit(candidate, depth + 1);
      }
    }
  };
  for (const root of roots) visit(root, 0);
  if (matches.length !== 1) return "";
  return matches[0];
}

function resolveApprovedTarget(rawPath) {
  const state = readPortableOpenState();
  if (process.env.SUPERCLAW_CLAUDE_DESKTOP_OPEN_ENABLED !== "1" && !state) {
    throw new Error("Local file opening has not been approved for this run.");
  }
  const roots = allowedRoots();
  const requested = path.resolve(String(rawPath || ""));
  const fallback = !fs.existsSync(requested)
    ? findUniqueApprovedBasename(path.basename(requested), roots)
    : "";
  const resolved = fallback || requested;
  if (!resolved || !fs.existsSync(resolved)) throw new Error("The requested local file does not exist.");
  const target = fs.realpathSync(resolved);
  if (SENSITIVE_NAMES.test(path.basename(target))) throw new Error("Sensitive files cannot be opened through this tool.");
  if (!roots.some((root) => isInside(target, root))) {
    throw new Error("The requested path is outside the approved project and upload folders.");
  }
  return target;
}

function openWithSystem(target) {
  if (process.platform === "win32") {
    spawn("explorer.exe", [target], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
}

function result(text, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

const server = new McpServer({ name: "superclaw-local-desktop", version: "1.0.0" });

server.registerTool(
  "open_local_file",
  {
    description: "Open a user-approved local file with the system default application. Only use for a file the user explicitly asked to open.",
    // Claude Code can emit either `path` or `file_path` for a local-open
    // request. Accept both spellings so the portable bridge does not turn a
    // valid user-approved path into the runtime working directory.
    inputSchema: {
      path: z.string().min(1).max(4096).optional().describe("Absolute path to an approved file or folder"),
      file_path: z.string().min(1).max(4096).optional().describe("Absolute path to an approved file or folder"),
    },
  },
  async ({ path: rawPath, file_path: filePath }) => {
    try {
      const target = resolveApprovedTarget(rawPath || filePath);
      openWithSystem(target);
      return result(`Opened local path: ${target}`);
    } catch (error) {
      return result(`Could not open local path: ${error?.message || "unknown error"}`, true);
    }
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("SuperClaw local desktop MCP failed:", error?.stack || error);
  process.exit(1);
});
