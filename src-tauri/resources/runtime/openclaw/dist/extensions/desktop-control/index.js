import { definePluginEntry } from "../../plugin-sdk/plugin-entry.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_QUERY_ALIASES = [
  [/douyin|tiktok/i, "抖音"],
  [/kuaishou/i, "快手"],
  [/xiaohongshu|rednote/i, "小红书"],
  [/feishu|lark/i, "飞书"],
  [/dingtalk|dingding/i, "钉钉"],
  [/wechat|weixin/i, "微信"],
];

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

function queryCandidates(payload) {
  const raw = String(payload?.query || payload?.title || "").trim();
  if (!raw) return [""];
  const values = [raw];
  for (const [pattern, alias] of APP_QUERY_ALIASES) {
    if (pattern.test(raw) && !values.includes(alias)) values.push(alias);
  }
  return values;
}

async function runAgentWithFallback(payload) {
  const candidates = queryCandidates(payload);
  let last = null;
  for (const query of candidates) {
    const next = { ...(payload || {}) };
    if (query) next.query = query;
    delete next.title;
    last = await runAgent(next);
    if (last?.ok) return last;
    if (!String(last?.message || "").toLowerCase().includes("window not found")) break;
  }
  return last;
}

function safeFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeTempScript(source) {
  const file = path.join(os.tmpdir(), `superclaw-desktop-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(file, source, "utf8");
  return file;
}

function runScreenshot(payload) {
  const query = String(payload?.query || payload?.title || "").trim();
  const outDir = String(payload?.outputDir || process.env.SUPERCLAW_SCREENSHOT_DIR || path.join(os.homedir(), ".openclaw", "media", "desktop")).trim();
  const outPath = String(payload?.outputPath || path.join(outDir, `desktop-${safeFileStamp()}.png`));
  const maxWidth = Number.isFinite(Number(payload?.maxWidth)) ? Math.max(320, Math.floor(Number(payload.maxWidth))) : 1280;
  const maxHeight = Number.isFinite(Number(payload?.maxHeight)) ? Math.max(240, Math.floor(Number(payload.maxHeight))) : 900;
  const script = String.raw`
param(
  [string]$Query,
  [string]$OutPath,
  [int]$MaxWidth = 1280,
  [int]$MaxHeight = 900
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$signature = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SuperClawWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
Add-Type $signature
$script:target = [IntPtr]::Zero
$script:title = ""
$needle = if ($Query) { $Query.ToLowerInvariant() } else { "" }
$callback = [SuperClawWin32+EnumWindowsProc]{
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if (-not [SuperClawWin32]::IsWindowVisible($hWnd)) { return $true }
  $sb = New-Object System.Text.StringBuilder 512
  [void][SuperClawWin32]::GetWindowText($hWnd, $sb, $sb.Capacity)
  $title = $sb.ToString()
  if ($title -and (($needle -eq "") -or ($title.ToLowerInvariant().Contains($needle)))) {
    $script:target = $hWnd
    $script:title = $title
    return $false
  }
  return $true
}
[void][SuperClawWin32]::EnumWindows($callback, [IntPtr]::Zero)
if ($script:target -eq [IntPtr]::Zero) {
  @{ ok = $false; message = "window not found"; data = @{ query = $Query } } | ConvertTo-Json -Depth 6 -Compress
  exit 0
}
$rect = New-Object SuperClawWin32+RECT
if (-not [SuperClawWin32]::GetWindowRect($script:target, [ref]$rect)) {
  @{ ok = $false; message = "GetWindowRect failed"; data = @{ query = $Query; title = $script:title } } | ConvertTo-Json -Depth 6 -Compress
  exit 0
}
$width = [Math]::Max(1, $rect.Right - $rect.Left)
$height = [Math]::Max(1, $rect.Bottom - $rect.Top)
if ($width -le 1 -or $height -le 1) {
  @{ ok = $false; message = "invalid window rect"; data = @{ query = $Query; title = $script:title; rect = @{ left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom } } } | ConvertTo-Json -Depth 6 -Compress
  exit 0
}
$dir = Split-Path -Parent $OutPath
if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp = New-Object System.Drawing.Bitmap $width, $height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$method = "print_window"
try {
  $hdc = $gfx.GetHdc()
  try {
    $printed = [SuperClawWin32]::PrintWindow($script:target, $hdc, 2)
  } finally {
    $gfx.ReleaseHdc($hdc)
  }
  if (-not $printed) {
    $method = "copy_from_screen"
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
  }
  $saveBmp = $bmp
  $savedWidth = $width
  $savedHeight = $height
  $scale = [Math]::Min($MaxWidth / [double]$width, $MaxHeight / [double]$height)
  if ($scale -lt 1) {
    $savedWidth = [Math]::Max(1, [int][Math]::Round($width * $scale))
    $savedHeight = [Math]::Max(1, [int][Math]::Round($height * $scale))
    $resized = New-Object System.Drawing.Bitmap $savedWidth, $savedHeight
    $rgfx = [System.Drawing.Graphics]::FromImage($resized)
    try {
      $rgfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $rgfx.DrawImage($bmp, 0, 0, $savedWidth, $savedHeight)
    } finally {
      $rgfx.Dispose()
    }
    $saveBmp = $resized
  }
  try {
    $saveBmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    if ($saveBmp -ne $bmp) { $saveBmp.Dispose() }
  }
} finally {
  $gfx.Dispose()
  $bmp.Dispose()
}
@{
  ok = $true
  message = "screenshot saved"
  data = @{
    path = $OutPath
    title = $script:title
    width = $width
    height = $height
    saved_width = $savedWidth
    saved_height = $savedHeight
    method = $method
    rect = @{ left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom }
  }
} | ConvertTo-Json -Depth 6 -Compress
`;
  const ps1 = writeTempScript(script);
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Query", query, "-OutPath", outPath, "-MaxWidth", String(maxWidth), "-MaxHeight", String(maxHeight)], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
    }, 15000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => {
      clearTimeout(timer);
      try { fs.unlinkSync(ps1); } catch {}
      resolve({ ok: false, message: err.message, data: { query, path: outPath } });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try { fs.unlinkSync(ps1); } catch {}
      const text = stdout.trim();
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve({ ok: false, message: stderr || text || `screenshot command exited ${code}`, data: { query, path: outPath } });
      }
    });
  });
}

async function runScreenshotWithFallback(payload) {
  const candidates = queryCandidates(payload);
  let last = null;
  for (const query of candidates) {
    last = await runScreenshot({ ...(payload || {}), query });
    if (last?.ok) return last;
    if (!String(last?.message || "").toLowerCase().includes("window not found")) break;
  }
  return last;
}

const parameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["status", "list_windows", "activate", "click", "type_text", "press_key", "screenshot"],
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
    outputPath: {
      type: "string",
      description: "Optional full PNG output path for screenshot.",
    },
    outputDir: {
      type: "string",
      description: "Optional output directory for screenshot PNG files.",
    },
    maxWidth: {
      type: "number",
      description: "Optional max screenshot width. Default 1280.",
    },
    maxHeight: {
      type: "number",
      description: "Optional max screenshot height. Default 900.",
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
        "When the task requires reading visible prices, quantities, captions, dialogs, or app state, call screenshot for the target window and inspect the returned image result.",
        "Use browser only when the user explicitly asks for a web page, website, browser tab, or browser automation.",
        "Do not use for normal chat, tables, copywriting, or browser-only tasks.",
      ].join(" "),
      parameters,
      async execute(_toolCallId, params) {
        if (params?.action === "screenshot") {
          const result = await runScreenshotWithFallback(params ?? {});
          if (result?.ok && result?.data?.path && fs.existsSync(result.data.path)) {
            const base64 = fs.readFileSync(result.data.path).toString("base64");
            const summary = {
                ok: true,
                message: result.message,
                title: result.data.title,
                path: result.data.path,
                width: result.data.width,
                height: result.data.height,
                saved_width: result.data.saved_width,
                saved_height: result.data.saved_height,
                method: result.data.method,
                rect: result.data.rect,
              };
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(summary, null, 2),
                },
                {
                  type: "image",
                  data: base64,
                  mimeType: "image/png",
                },
              ],
              details: {
                ...result.data,
                media: { mediaUrl: result.data.path },
              },
            };
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        const result = await runAgentWithFallback(params ?? {});
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
