import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync("src-tauri/resources/runtime/claude-panel/server.js", "utf8");
const mcp = readFileSync("src-tauri/resources/runtime/claude-panel/web-research-mcp.js", "utf8");
const smoke = readFileSync("scripts/smoke-claude-web-research-mcp.mjs", "utf8");
const buildDesktop = readFileSync("scripts/build-desktop-client.ps1", "utf8");

test("Claude uses a packaged SuperClaw web research MCP instead of unavailable cloud web tools", () => {
  assert.match(panel, /function ensurePortableWebResearchMcp/);
  assert.match(panel, /superclaw_web_research:\s*\{/);
  assert.match(panel, /args: \[mcpEntry\]/);
  assert.match(panel, /mcp__superclaw_web_research__web_search/);
  assert.match(panel, /mcp__superclaw_web_research__web_fetch/);
  assert.match(panel, /Do not use Claude cloud WebSearch or WebFetch/);
});

test("local web research MCP stays read-only and blocks private network targets", () => {
  assert.match(mcp, /server\.registerTool\(\s*"web_search"/);
  assert.match(mcp, /server\.registerTool\(\s*"web_fetch"/);
  assert.match(mcp, /Local and private network addresses are not available/);
  assert.match(mcp, /host === "localhost"/);
  assert.match(mcp, /\^127\\\./);
  assert.match(mcp, /fetch\(url, \{/);
  assert.doesNotMatch(mcp, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});

test("web research smoke verifies the portable MCP process, public search, and private network block", () => {
  assert.match(smoke, /web_search/);
  assert.match(smoke, /Toutiao trending news/);
  assert.match(smoke, /127\.0\.0\.1:3000/);
  assert.match(smoke, /CLAUDE_WEB_RESEARCH_MCP_PUBLIC_SEARCH: PASS/);
});

test("portable build asserts that the local web research MCP is shipped", () => {
  assert.match(buildDesktop, /runtime\\claude-panel\\web-research-mcp\.js/);
});
