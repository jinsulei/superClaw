#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const node = path.join(root, "src-tauri", "resources", "runtime", "openclaw", process.platform === "win32" ? "node.exe" : "node");
const entry = path.join(root, "src-tauri", "resources", "runtime", "claude-panel", "web-research-mcp.js");

function callMcp(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [entry], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const responses = new Map();
    let buffer = "";
    let stderr = "";
    const timer = setTimeout(() => finish(new Error(`MCP smoke timed out. ${stderr}`)), 35_000);
    const finish = (error) => {
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(responses);
    };
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => finish(error));
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let payload;
        try { payload = JSON.parse(line); } catch { continue; }
        if (payload.id === 1) {
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
          for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
        } else if (payload.id) {
          responses.set(payload.id, payload);
          if (responses.size === requests.length) finish();
        }
      }
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "superclaw-smoke", version: "1.0.0" } },
    })}\n`);
  });
}

assert.ok(process.platform !== "win32" || node.endsWith("node.exe"), "portable Windows node path must be selected");
const responses = await callMcp([
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "web_search", arguments: { query: "Toutiao trending news" } } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "web_fetch", arguments: { url: "http://127.0.0.1:3000" } } },
]);

const tools = responses.get(2)?.result?.tools?.map((tool) => tool.name).sort() || [];
assert.deepEqual(tools, ["web_fetch", "web_search"], "local MCP must expose exactly the two read-only tools");
assert.equal(responses.get(3)?.result?.isError, false, "public web search must return a real result");
assert.match(responses.get(3)?.result?.content?.[0]?.text || "", /"results"/, "search result must include structured results");
assert.equal(responses.get(4)?.result?.isError, true, "private network fetch must be blocked");
assert.match(responses.get(4)?.result?.content?.[0]?.text || "", /Local and private network addresses/, "private network block must be explicit");

console.log("CLAUDE_WEB_RESEARCH_MCP_TOOLS: PASS");
console.log("CLAUDE_WEB_RESEARCH_MCP_PUBLIC_SEARCH: PASS");
console.log("CLAUDE_WEB_RESEARCH_MCP_PRIVATE_NETWORK_BLOCK: PASS");
