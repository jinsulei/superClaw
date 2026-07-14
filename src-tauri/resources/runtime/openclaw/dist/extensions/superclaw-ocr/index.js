import { definePluginEntry } from "../../plugin-sdk/plugin-entry.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LANGUAGE = "eng+chi_sim";
const MAX_TIMEOUT_MS = 30_000;
let cachedRuntimeRoot = "";

function runtimeRoot() {
  if (cachedRuntimeRoot) return cachedRuntimeRoot;

  // The source plugin lives under openclaw/dist/extensions, while the
  // packaged plugin is loaded from openclaw/node_modules/<scope>/<package>/
  // dist/extensions. Walk upward to the shared runtime directory instead of
  // relying on a fixed parent count that only works in one of those layouts.
  let cursor = __dirname;
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(cursor, "ocr");
    if (fs.existsSync(path.join(candidate, "ocr-runner.cjs"))
      && fs.existsSync(path.join(candidate, "tessdata"))) {
      cachedRuntimeRoot = cursor;
      return cachedRuntimeRoot;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return path.resolve(__dirname, "../../../..");
}

function resolveRunner() {
  return path.join(runtimeRoot(), "ocr", "ocr-runner.cjs");
}

function resolveTessdata() {
  return path.join(runtimeRoot(), "ocr", "tessdata");
}

function safeTimeout(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1_000), MAX_TIMEOUT_MS) : MAX_TIMEOUT_MS;
}

function runOcr(payload, timeoutMs) {
  const runner = resolveRunner();
  const tessdata = resolveTessdata();
  if (!fs.existsSync(runner)) {
    return Promise.resolve({
      ok: false,
      error: "Bundled OCR runner is missing",
      recoverable: true,
      engine: "tesseract.js",
      systemInstallRequired: false,
    });
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runner, "--stdin"], {
      cwd: path.dirname(runner),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1", TESSDATA_PREFIX: tessdata },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ ok: false, error: "OCR timed out", recoverable: true });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message || String(error), recoverable: true });
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ ok: false, error: stderr || stdout.trim() || "OCR returned no result", recoverable: true });
      }
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

const parameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    imagePath: { type: "string", description: "User-provided image or screenshot path." },
    language: { type: "string", description: "OCR language. Default: eng+chi_sim." },
    sourceType: { type: "string", description: "image, screenshot, clipboard, or browser_page." },
    timeoutMs: { type: "number", description: "OCR timeout in milliseconds, max 30000." },
  },
  required: ["imagePath"],
};

export default definePluginEntry({
  id: "superclaw-ocr",
  name: "SuperClaw OCR",
  description: "Use the one bundled offline OCR engine to read user-provided images and existing screenshots. Do not call it automatically for every attachment.",
  register(api) {
    api.registerTool({
      name: "superclaw_ocr",
      label: "SuperClaw OCR",
      description: "Extract Chinese and English text from a user-provided image or an existing desktop/browser screenshot. Return the OCR result as task evidence; do not open a new browser page.",
      parameters,
      async execute(_toolCallId, params = {}) {
        const imagePath = String(params.imagePath || "").trim();
        const sourceType = String(params.sourceType || "image").trim() || "image";
        if (!imagePath) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "imagePath is required", recoverable: true }) }] };
        }
        const result = await runOcr({
          imagePath,
          sourceType,
          language: String(params.language || DEFAULT_LANGUAGE),
          agent: "openclaw",
        }, safeTimeout(params.timeoutMs));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });
  },
});
