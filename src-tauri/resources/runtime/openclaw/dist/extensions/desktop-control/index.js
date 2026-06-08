import { definePluginEntry } from "../../plugin-sdk/plugin-entry.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveAgentPath() {
  const fromEnv = process.env.SUPERCLAW_DESKTOP_CONTROL_AGENT;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return path.resolve(__dirname, "../../../../../bin/desktop-control-agent.exe");
}

function runAgent(payload) {
  const exe = resolveAgentPath();
  return new Promise((resolve) => {
    if (!fs.existsSync(exe)) {
      resolve({
        ok: false,
        message: `desktop-control-agent.exe not found: ${exe}`,
        data: {},
      });
      return;
    }
    const child = spawn(exe, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
    }, 8000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, message: err.message, data: {} });
    });
    child.on("close", () => {
      clearTimeout(timer);
      const text = stdout.trim();
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve({ ok: false, message: stderr || text || "desktop-control-agent returned no json", data: {} });
      }
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

const parameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["status", "list_windows", "activate", "click", "type_text", "press_key"],
      description: "Desktop action to perform.",
    },
    query: {
      type: "string",
      description:
        "Window title or class substring, for example Douyin/\u6296\u97f3, Feishu/\u98de\u4e66, DingTalk/\u9489\u9489, QQ, Chrome.",
    },
    text: {
      type: "string",
      description: "Text to type for type_text.",
    },
    key: {
      type: "string",
      description: "Key to press for press_key: Enter, Tab, Escape, Backspace, Space.",
    },
    x: {
      type: "number",
      description: "Window-relative X coordinate for click.",
    },
    y: {
      type: "number",
      description: "Window-relative Y coordinate for click.",
    },
    limit: {
      type: "number",
      description: "Maximum number of windows to return.",
    },
  },
  required: ["action"],
};

export default definePluginEntry({
  id: "desktop-control",
  name: "Desktop Control",
  description: "Control already-open Windows desktop apps through the portable SuperClaw sidecar.",
  register(api) {
    api.registerTool({
      name: "desktop_control",
      label: "Desktop Control",
      description: [
        "Control already-open Windows desktop applications via the bundled SuperClaw sidecar.",
        "Use this when the user asks to operate a desktop client, local app, native app, already-open app, or a local logged-in app.",
        "For desktop-client tasks involving Douyin/\u6296\u97f3, Kuaishou/\u5feb\u624b, Xiaohongshu/\u5c0f\u7ea2\u4e66, Feishu/\u98de\u4e66, DingTalk/\u9489\u9489, QQ, WeChat/\u5fae\u4fe1, or other installed apps, prefer desktop_control over browser.",
        "When the user asks to search or inspect a platform that may have a desktop client, call action=list_windows first; if the target app is present, use desktop_control. If the app is not present or cannot be activated, then fall back to the browser tool.",
        "Start with list_windows to find the exact window title, then activate/click/type_text/press_key.",
        "Use browser only when the user explicitly asks for a web page, website, browser tab, or browser automation.",
        "Do not use for normal chat, tables, copywriting, or browser-only tasks.",
      ].join(" "),
      parameters,
      async execute(_toolCallId, params) {
        const result = await runAgent(params ?? {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    });
  },
});
