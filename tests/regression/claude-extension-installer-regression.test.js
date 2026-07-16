import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync("src-tauri/resources/runtime/claude-panel/server.js", "utf8");
const app = readFileSync("src-tauri/resources/runtime/claude-panel/public/app.js", "utf8");
const html = readFileSync("src-tauri/resources/runtime/claude-panel/public/index.html", "utf8");
const styles = readFileSync("src-tauri/resources/runtime/claude-panel/public/styles.css", "utf8");
const rust = readFileSync("src-tauri/src/commands/claude_code.rs", "utf8");
const smoke = readFileSync("scripts/smoke-claude-extensions.mjs", "utf8");
const buildDesktop = readFileSync("scripts/build-desktop-client.ps1", "utf8");

test("portable Claude skills use the native CLAUDE_CONFIG_DIR skills path", () => {
  assert.match(server, /path\.join\(CLAUDE_RUNTIME_CONFIG_DIR, "skills"\)/);
  assert.match(rust, /"CLEAN_PANEL_CLAUDE_SKILLS_DIR",\s*home\.join\("claude-config"\)\.join\("skills"\)/s);
  assert.match(server, /migrateLegacyClaudeSkills/);
  assert.match(server, /LEGACY_CLAUDE_SKILLS_DIR/);
});

test("skill installation validates frontmatter and verifies the native directory", () => {
  assert.match(server, /SKILL\.md 缺少 YAML frontmatter/);
  assert.match(server, /description:\\s\*/);
  assert.match(server, /temporaryFile[\s\S]*?renameSync\(temporaryFile, skillFile\)/);
  assert.match(server, /Skill 写入后未通过原生目录校验/);
  assert.match(server, /path\.relative\(HOME, skillFile\)/);
});

test("plugin and skill packages follow search then explicit candidate install", () => {
  assert.match(server, /\/api\/extensions\/search/);
  assert.match(server, /\/api\/extensions\/install/);
  assert.match(server, /plugin", "list", "--available", "--json"/);
  assert.match(server, /extensionSearches\.set\(searchId/);
  assert.match(server, /搜索结果已过期，请重新搜索后再选择安装/);
  assert.match(server, /search\.results\.find\(\(item\) => item\.id === pluginId\)/);
  assert.match(server, /"plugin", "install", pluginId, "--scope", "user"/);
  assert.match(server, /安装命令已结束，但 Claude Code 已安装列表中没有找到该能力/);
});

test("official marketplace is registered only as part of explicit search", () => {
  assert.match(server, /OFFICIAL_CLAUDE_MARKETPLACE_SOURCE = "anthropics\/claude-plugins-official"/);
  assert.match(server, /async function handleExtensionSearch[\s\S]*?ensureOfficialMarketplace\(\)/);
  assert.doesNotMatch(server, /ensureOfficialMarketplace\(\);\s*server\.listen/);
});

test("extension UI separates search, selection and installation", () => {
  assert.match(html, /id="extensionSearchInput"/);
  assert.match(html, /id="extensionSearchBtn"/);
  assert.match(html, /id="extensionSearchResults"/);
  assert.match(html, /data-extension-kind="plugin"/);
  assert.match(html, /data-extension-kind="skill"/);
  assert.doesNotMatch(html, /id="pagePluginInput"/);
  assert.match(app, /async function searchExtensions\(/);
  assert.match(app, /function extensionResultCard\(/);
  assert.match(app, /function localizedExtensionDescription\(item = \{\}\)/);
  assert.match(app, /installButton\.textContent = item\.installed \? "已安装" : "选择安装"/);
  assert.match(app, /body: JSON\.stringify\(\{ searchId, pluginId: item\.id \}\)/);
  assert.match(app, /refreshInstalledExtensions\(\{ expectPluginId: data\.pluginId \|\| item\.id \}\)/);
  assert.match(app, /installedIds\.has\(expected\)/);
});

test("extension result rendering is text-safe and responsive", () => {
  assert.match(app, /description\.textContent = localizedExtensionDescription\(item\)/);
  assert.match(app, /description\.title = `英文原文：\$\{item\.description\}`/);
  assert.match(app, /source\.textContent = `来源：/);
  assert.doesNotMatch(app, /extensionSearchResults\.innerHTML\s*=/);
  assert.match(styles, /\.extension-search-results\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(styles, /\.extension-search-results\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 360px\), 1fr\)\)/);
  assert.match(styles, /\.extension-search-result\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.extension-search-result[\s\S]*?grid-template-columns:\s*1fr/);
});

test("extension page fully hides chat and expanded execution details", () => {
  assert.match(app, /document\.body\.classList\.add\("extensions-page-mode"\)/);
  assert.match(app, /if \(transcript\) transcript\.hidden = true/);
  assert.match(styles, /body\.extensions-page-mode\.conversation-mode #transcript\.transcript\[hidden\][\s\S]*?display:\s*none !important/);
});

test("real smoke covers native marketplace, plugin, skill, failure and uninstall", () => {
  assert.match(smoke, /plugin", "marketplace", "add"/);
  assert.match(smoke, /plugin", "list", "--available", "--json"/);
  assert.match(smoke, /SUPERCLAW_PLUGIN_SKILL_OK/);
  assert.match(smoke, /SUPERCLAW_STANDALONE_SKILL_OK/);
  assert.match(smoke, /missing-extension@superclaw-extension-audit-market/);
  assert.match(smoke, /plugin", "uninstall"/);
  assert.match(smoke, /settings\.extraKnownMarketplaces = \{\}/);
  assert.match(smoke, /fs\.rmSync\(auditRoot, \{ recursive: true, force: true, maxRetries: 3, retryDelay: 250 \}\)/);
});

test("packaging keeps valid skills but excludes development plugin caches", () => {
  assert.match(buildDesktop, /claude-config\\plugins/);
  assert.match(buildDesktop, /Assert-NoPackagedUserState/);
  assert.doesNotMatch(buildDesktop, /Remove-IfExists \(Join-Path \$ClaudeCodeHome "claude-config\\skills"\)/);
});
