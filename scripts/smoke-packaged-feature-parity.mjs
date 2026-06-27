import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function pass(label) {
  console.log(`${label}: PASS`);
}

function assertContains(rel, needle, label) {
  const text = read(rel);
  if (!text.includes(needle)) {
    fail(`${label}: missing ${needle} in ${rel}`);
    return false;
  }
  return true;
}

function assertMatch(rel, pattern, label) {
  const text = read(rel);
  if (!pattern.test(text)) {
    fail(`${label}: pattern ${pattern} not found in ${rel}`);
    return false;
  }
  return true;
}

function collectTextFiles(dir, suffixes = [".js", ".html", ".css"]) {
  const output = [];
  if (!fs.existsSync(dir)) {
    return output;
  }

  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
        output.push(full);
      }
    }
  }

  return output;
}

function assertDistMarker(marker, label) {
  const distDir = path.join(root, "dist");
  if (!fs.existsSync(distDir)) {
    console.log(`${label}: SKIP (dist not built)`);
    return true;
  }

  const haystack = collectTextFiles(distDir)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  if (!haystack.includes(marker)) {
    fail(`${label}: missing ${marker} in dist`);
    return false;
  }

  pass(label);
  return true;
}

function assertNoSensitiveLeak(files) {
  const patterns = [
    /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}/,
    /Bearer\s+[A-Za-z0-9._-]{20,}/,
    new RegExp("VITE_" + "MINIMAX_API_KEY" + "\\s*=\\s*[\"'][^\"']+[\"']"),
    new RegExp("MINIMAX" + "_API_KEY" + "\\s*=\\s*[\"'][^\"']+[\"']"),
    new RegExp("IMAGE" + "_API_KEY" + "\\s*=\\s*[\"'][^\"']+[\"']"),
    /124\.222\.21\.44/,
  ];

  for (const rel of files) {
    const text = read(rel);
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        fail(`PACKAGED_FEATURES_NO_KEY_LEAK: sensitive pattern ${pattern} found in ${rel}`);
        return false;
      }
    }
  }

  pass("PACKAGED_FEATURES_NO_KEY_LEAK");
  return true;
}

const hermesChat = "src/engines/hermes/pages/chat.js";
const tauriApi = "src/lib/tauri-api.js";
const devApi = "scripts/dev-api.js";
const assistantCommands = "src-tauri/src/commands/assistant.rs";
const tauriLib = "src-tauri/src/lib.rs";
const modelPage = "src/pages/models.js";
const minimaxConfig = "src/lib/minimax-test-config.js";
const desktopBuild = "scripts/build-desktop-client.ps1";

let ok = true;

const hermesDragOk = [
  assertContains(hermesChat, "handleDroppedAttachments", "PACKAGED_HERMES_IMAGE_DRAG_ENTRY"),
  assertContains(hermesChat, "dragenter", "PACKAGED_HERMES_IMAGE_DRAG_ENTRY"),
  assertContains(hermesChat, "dragover", "PACKAGED_HERMES_IMAGE_DRAG_ENTRY"),
  assertContains(hermesChat, "drop", "PACKAGED_HERMES_IMAGE_DRAG_ENTRY"),
  assertContains(hermesChat, "pendingAttachments", "PACKAGED_HERMES_IMAGE_DRAG_ENTRY"),
].every(Boolean);
if (hermesDragOk) pass("PACKAGED_HERMES_IMAGE_DRAG_ENTRY");
ok = hermesDragOk && ok;

const mediaRouteOk = [
  assertContains(hermesChat, "api.saveImage", "PACKAGED_HERMES_MEDIA_UPLOAD_ROUTE"),
  assertContains(hermesChat, "MEDIA:", "PACKAGED_HERMES_MEDIA_UPLOAD_ROUTE"),
  assertContains(hermesChat, "loadHermesMediaImage", "PACKAGED_HERMES_MEDIA_UPLOAD_ROUTE"),
  assertContains(tauriApi, "hermes_load_media_image", "PACKAGED_HERMES_MEDIA_UPLOAD_ROUTE"),
  assertContains(devApi, "hermes_load_media_image", "PACKAGED_HERMES_MEDIA_UPLOAD_ROUTE"),
].every(Boolean);
if (mediaRouteOk) pass("PACKAGED_HERMES_MEDIA_UPLOAD_ROUTE");
ok = mediaRouteOk && ok;

const mediaCommandOk = [
  assertContains(assistantCommands, "hermes_load_media_image", "PACKAGED_HERMES_MEDIA_LOAD_COMMAND"),
  assertContains(tauriLib, "assistant::hermes_load_media_image", "PACKAGED_HERMES_MEDIA_LOAD_COMMAND"),
].every(Boolean);
if (mediaCommandOk) pass("PACKAGED_HERMES_MEDIA_LOAD_COMMAND");
ok = mediaCommandOk && ok;

const minimaxEntryOk = [
  assertContains(modelPage, "minimax-test-panel", "PACKAGED_OPENCLAW_MINIMAX_TEST_ENTRY"),
  assertContains(modelPage, "btn-save-minimax-test", "PACKAGED_OPENCLAW_MINIMAX_TEST_ENTRY"),
  assertContains(modelPage, "btn-test-minimax-test", "PACKAGED_OPENCLAW_MINIMAX_TEST_ENTRY"),
  assertContains(modelPage, "btn-reload-minimax-test", "PACKAGED_OPENCLAW_MINIMAX_TEST_ENTRY"),
  assertContains(modelPage, "minimax-test-result", "PACKAGED_OPENCLAW_MINIMAX_TEST_ENTRY"),
  assertMatch(modelPage, /isMiniMaxOnlyMode\(\)\s*\|\|\s*isTestBuildMode\(\)/, "PACKAGED_OPENCLAW_MINIMAX_TEST_ENTRY"),
].every(Boolean);
if (minimaxEntryOk) pass("PACKAGED_OPENCLAW_MINIMAX_TEST_ENTRY");
ok = minimaxEntryOk && ok;

const minimaxApiOk = [
  assertContains(modelPage, "openai-completions", "PACKAGED_OPENCLAW_MINIMAX_TEST_API"),
  assertContains(modelPage, "MiniMax 模型连接测试成功", "PACKAGED_OPENCLAW_MINIMAX_TEST_API"),
  assertContains(modelPage, "尚未配置 MiniMax API Key", "PACKAGED_OPENCLAW_MINIMAX_TEST_API"),
  assertContains(devApi, "read_minimax_test_config", "PACKAGED_OPENCLAW_MINIMAX_TEST_API"),
  assertContains(devApi, "save_minimax_test_config", "PACKAGED_OPENCLAW_MINIMAX_TEST_API"),
  assertContains(minimaxConfig, "https://api.minimaxi.com/v1", "PACKAGED_OPENCLAW_MINIMAX_TEST_API"),
  assertContains(minimaxConfig, "MiniMax-M3", "PACKAGED_OPENCLAW_MINIMAX_TEST_API"),
].every(Boolean);
if (minimaxApiOk) pass("PACKAGED_OPENCLAW_MINIMAX_TEST_API");
ok = minimaxApiOk && ok;

const testFlagsOk = [
  assertContains(desktopBuild, "VITE_SUPERCLAW_TEST_BUILD", "PACKAGED_TEST_BUILD_FLAGS"),
  assertContains(desktopBuild, "VITE_SUPERCLAW_FORCE_PROVIDER", "PACKAGED_TEST_BUILD_FLAGS"),
  assertContains(desktopBuild, "VITE_ENABLE_ECOMMERCE_ASSISTANT", "PACKAGED_TEST_BUILD_FLAGS"),
].every(Boolean);
if (testFlagsOk) pass("PACKAGED_TEST_BUILD_FLAGS");
ok = testFlagsOk && ok;

ok = assertDistMarker("btn-test-minimax-test", "PACKAGED_DIST_OPENCLAW_MINIMAX_TEST_ENTRY") && ok;
ok = assertDistMarker("hermes_load_media_image", "PACKAGED_DIST_HERMES_MEDIA_LOAD") && ok;
ok = assertDistMarker("dragenter", "PACKAGED_DIST_HERMES_DRAG_ENTRY") && ok;

if (exists(hermesChat) && !read(hermesChat).includes("IMAGE_API_KEY")) {
  pass("PACKAGED_IMAGE_NO_KEY_SAFE");
} else {
  fail("PACKAGED_IMAGE_NO_KEY_SAFE: Hermes media display must not require IMAGE_API_KEY");
  ok = false;
}

if (read(modelPage).includes("尚未配置 MiniMax API Key")) {
  pass("PACKAGED_MINIMAX_TEST_NO_KEY_SAFE");
} else {
  fail("PACKAGED_MINIMAX_TEST_NO_KEY_SAFE: missing no-key user feedback");
  ok = false;
}

ok = assertNoSensitiveLeak([
  hermesChat,
  tauriApi,
  devApi,
  assistantCommands,
  tauriLib,
  modelPage,
  minimaxConfig,
  desktopBuild,
]) && ok;

if (!ok || process.exitCode) {
  process.exit(process.exitCode || 1);
}
