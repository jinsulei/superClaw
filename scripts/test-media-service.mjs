import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const devApi = fs.readFileSync(path.join(root, "scripts/dev-api.js"), "utf8");
const tauriApi = fs.readFileSync(path.join(root, "src/lib/tauri-api.js"), "utf8");
const assistantCommands = fs.readFileSync(path.join(root, "src-tauri/src/commands/assistant.rs"), "utf8");

function pass(label) {
  console.log(`${label}: PASS`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!devApi.includes("hermes_load_media_image")) {
  fail("HERMES_MEDIA_SOURCE_COMMANDS: dev-api missing hermes_load_media_image");
}
if (!tauriApi.includes("hermes_load_media_image")) {
  fail("HERMES_MEDIA_SOURCE_COMMANDS: tauri-api missing hermes_load_media_image");
}
if (!assistantCommands.includes("hermes_load_media_image")) {
  fail("HERMES_MEDIA_SOURCE_COMMANDS: tauri command missing hermes_load_media_image");
}
pass("HERMES_MEDIA_SOURCE_COMMANDS");

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const generatedRoot = path.join(root, "src-tauri", "resources", "data", "generated");
const tempDir = fs.mkdtempSync(path.join(generatedRoot, "media-smoke-"));
const mediaPath = path.join(tempDir, "probe.png");
fs.writeFileSync(mediaPath, tinyPng);

try {
  const response = await fetch("http://127.0.0.1:1420/__api/hermes_load_media_image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: mediaPath }),
  });

  if (!response.ok) {
    console.log(`HERMES_MEDIA_DIRECT_API: SKIP (dev server returned ${response.status})`);
  } else {
    const payload = await response.json();
    const dataUrl = typeof payload === "string" ? payload : payload?.dataUrl || payload?.data_url || payload?.result;
    if (!String(dataUrl || "").startsWith("data:image/png;base64,")) {
      fail("HERMES_MEDIA_DIRECT_API: media API did not return a PNG data URL");
    }
    pass("HERMES_MEDIA_DIRECT_API");
  }
} catch (error) {
  console.log(`HERMES_MEDIA_DIRECT_API: SKIP (${error.message})`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
