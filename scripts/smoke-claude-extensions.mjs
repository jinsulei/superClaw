#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const claude = path.join(root, "src-tauri", "resources", "runtime", "claude-code", "bin", "claude.exe");
const sourceConfig = path.join(root, "src-tauri", "resources", "data", "claude-code", "home", "claude-config");
const auditRoot = fs.mkdtempSync(path.join(os.tmpdir(), "superclaw-claude-extensions-"));
const home = path.join(auditRoot, "home");
const configDir = path.join(home, "claude-config");
const marketplaceDir = path.join(auditRoot, "marketplace");
const pluginDir = path.join(marketplaceDir, "plugins", "superclaw-extension-audit");
const pluginId = "superclaw-extension-audit@superclaw-extension-audit-market";

function fail(message, detail = "") {
  const error = new Error(message);
  error.detail = redact(detail);
  throw error;
}

function redact(value) {
  return String(value || "")
    .replace(/\b(?:sk|ak|ark|Bearer)[-_][A-Za-z0-9._-]{12,}\b/gi, "[REDACTED]")
    .replace(/("?(?:api[_-]?key|token|secret|authorization)"?\s*[:=]\s*)[^\s,}]+/gi, "$1[REDACTED]");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function cleanupAuditRoot() {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(auditRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      return;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * (attempt + 1));
    }
  }
  console.warn(`CLAUDE_EXTENSION_SMOKE_CLEANUP_DEFERRED: ${lastError?.code || "unknown"}`);
}

function copyIfPresent(name) {
  const source = path.join(sourceConfig, name);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(configDir, name));
}

function writeIsolatedSettings() {
  const source = path.join(sourceConfig, "settings.json");
  const settings = fs.existsSync(source) ? JSON.parse(fs.readFileSync(source, "utf8")) : {};
  settings.enabledPlugins = {};
  settings.extraKnownMarketplaces = {};
  writeJson(path.join(configDir, "settings.json"), settings);
}

function run(args, { expect = 0, timeout = 180_000 } = {}) {
  const result = spawnSync(claude, args, {
    cwd: auditRoot,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(home, "AppData", "Roaming"),
      LOCALAPPDATA: path.join(home, "AppData", "Local"),
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_CODE_PROJECTS_DIR: path.join(auditRoot, "projects"),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    },
    encoding: "utf8",
    windowsHide: true,
    timeout,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (result.error) fail(`命令启动失败：claude ${args.slice(0, 3).join(" ")}`, result.error.message);
  if (result.status !== expect) fail(`命令退出码 ${result.status}，期望 ${expect}：claude ${args.slice(0, 3).join(" ")}`, output);
  return output;
}

function parseJson(output, label) {
  try {
    return JSON.parse(String(output || "").replace(/^\uFEFF/, ""));
  } catch {
    fail(`${label} 不是有效 JSON`, output);
  }
}

function installedEntries(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.installed) ? payload.installed : [];
}

try {
  if (!fs.existsSync(claude)) fail("便携 Claude Code CLI 不存在");
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.join(home, "AppData", "Roaming"), { recursive: true });
  fs.mkdirSync(path.join(home, "AppData", "Local"), { recursive: true });
  writeIsolatedSettings();
  copyIfPresent(".claude.json");

  writeJson(path.join(marketplaceDir, ".claude-plugin", "marketplace.json"), {
    name: "superclaw-extension-audit-market",
    owner: { name: "SuperClaw" },
    plugins: [{
      name: "superclaw-extension-audit",
      source: "./plugins/superclaw-extension-audit",
      description: "Deterministic local plugin used to verify portable Claude plugin loading.",
      version: "1.0.0",
    }],
  });
  writeJson(path.join(pluginDir, ".claude-plugin", "plugin.json"), {
    name: "superclaw-extension-audit",
    description: "SuperClaw portable plugin smoke test",
    version: "1.0.0",
  });
  writeText(path.join(pluginDir, "skills", "extension-audit", "SKILL.md"), [
    "---",
    "name: extension-audit",
    "description: Deterministic smoke test for the portable Claude plugin loader",
    "disable-model-invocation: true",
    "---",
    "",
    "When invoked, reply with exactly SUPERCLAW_PLUGIN_SKILL_OK and nothing else.",
  ].join("\n"));
  writeText(path.join(configDir, "skills", "superclaw-standalone-audit", "SKILL.md"), [
    "---",
    "name: superclaw-standalone-audit",
    "description: Deterministic smoke test for the portable Claude skill directory",
    "disable-model-invocation: true",
    "---",
    "",
    "When invoked, reply with exactly SUPERCLAW_STANDALONE_SKILL_OK and nothing else.",
  ].join("\n"));

  run(["plugin", "validate", marketplaceDir]);
  run(["plugin", "marketplace", "add", marketplaceDir]);
  const marketplaces = parseJson(run(["plugin", "marketplace", "list", "--json"]), "Marketplace 列表");
  if (!marketplaces.some((item) => item?.name === "superclaw-extension-audit-market")) fail("本地 Marketplace 未注册");

  const available = parseJson(run(["plugin", "list", "--available", "--json"]), "可安装插件列表");
  if (!available.available?.some((item) => item?.pluginId === pluginId)) fail("测试插件未进入可安装候选列表");

  run(["plugin", "install", pluginId, "--scope", "user"]);
  const installed = installedEntries(parseJson(run(["plugin", "list", "--json"]), "已安装插件列表"));
  if (!installed.some((item) => item?.pluginId === pluginId || item?.id === pluginId || item?.name === "superclaw-extension-audit")) {
    fail("安装命令成功，但原生插件列表没有测试插件", JSON.stringify(installed, null, 2));
  }
  const details = run(["plugin", "details", pluginId]);
  if (!/extension-audit|skill/i.test(details)) fail("插件详情没有发现测试 Skill", details);

  const badInstall = spawnSync(claude, ["plugin", "install", "missing-extension@superclaw-extension-audit-market"], {
    cwd: auditRoot,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(home, "AppData", "Roaming"),
      LOCALAPPDATA: path.join(home, "AppData", "Local"),
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_CODE_PROJECTS_DIR: path.join(auditRoot, "projects"),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    },
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  if (badInstall.status === 0) fail("不存在的插件被错误报告为安装成功");

  const pluginUse = run([
    "-p",
    "/superclaw-extension-audit:extension-audit",
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
  ], { timeout: 180_000 });
  if (!pluginUse.includes("SUPERCLAW_PLUGIN_SKILL_OK")) fail("插件 Skill 已安装但未被原生 Claude 调用", pluginUse);

  const standaloneUse = run([
    "-p",
    "/superclaw-standalone-audit",
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
  ], { timeout: 180_000 });
  if (!standaloneUse.includes("SUPERCLAW_STANDALONE_SKILL_OK")) fail("独立 Skill 未从 CLAUDE_CONFIG_DIR/skills 加载", standaloneUse);

  run(["plugin", "uninstall", pluginId]);
  const afterUninstall = installedEntries(parseJson(run(["plugin", "list", "--json"]), "卸载后插件列表"));
  if (afterUninstall.some((item) => item?.pluginId === pluginId || item?.id === pluginId || item?.name === "superclaw-extension-audit")) {
    fail("测试插件卸载后仍出现在原生列表中");
  }

  console.log("CLAUDE_EXTENSION_SMOKE_OK");
  console.log("marketplace_search=ok");
  console.log("plugin_install_verify=ok");
  console.log("plugin_skill_native_use=ok");
  console.log("standalone_skill_native_use=ok");
  console.log("invalid_install_rollback=ok");
  console.log("plugin_uninstall_verify=ok");
} catch (error) {
  console.error(`CLAUDE_EXTENSION_SMOKE_FAILED: ${error.message}`);
  if (error.detail) console.error(error.detail.slice(0, 4000));
  process.exitCode = 1;
} finally {
  cleanupAuditRoot();
}
