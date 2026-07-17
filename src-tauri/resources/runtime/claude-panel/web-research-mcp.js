"use strict";

const { McpServer } = require("../openclaw/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js");
const { StdioServerTransport } = require("../openclaw/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js");
const z = require("../openclaw/node_modules/zod");

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_CHARS = 180_000;
const MAX_RESULTS = 10;

function safeUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("Only a valid public http(s) URL can be fetched.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs can be fetched.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error("Local and private network addresses are not available to read-only web research.");
  }
  return parsed;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function htmlToText(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*/g, "\n")
      .trim()
  ).slice(0, MAX_RESPONSE_CHARS);
}

async function readPublicUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        "User-Agent": "SuperClaw-ReadOnlyResearch/1.0",
      },
    });
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const raw = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      contentType,
      raw,
      text: contentType.includes("html") ? htmlToText(raw) : raw.trim(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractBingResults(html) {
  const results = [];
  const source = String(html || "");
  const pattern = /<li class="b_algo"[^>]*>[\s\S]{0,30000}?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let anchor;
  while ((anchor = pattern.exec(source)) && results.length < MAX_RESULTS) {
    const nearby = source.slice(pattern.lastIndex, pattern.lastIndex + 2400);
    const snippet = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(nearby)?.[1] || "";
    results.push({
      title: htmlToText(anchor[2]),
      url: decodeHtml(anchor[1]),
      snippet: htmlToText(snippet),
    });
  }
  return results;
}

function extractDuckDuckGoResults(html) {
  const results = [];
  const pattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1800}?class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(String(html || ""))) && results.length < MAX_RESULTS) {
    const href = match[1] || match[4] || "";
    const title = match[2] || match[5] || "";
    if (!href || !title) continue;
    results.push({ title: htmlToText(title), url: decodeHtml(href), snippet: htmlToText(match[3] || "") });
  }
  return results;
}

async function searchPublicWeb(query) {
  const encoded = encodeURIComponent(query);
  const sources = [
    { url: `https://www.bing.com/search?q=${encoded}&setlang=zh-Hans`, extract: extractBingResults },
    { url: `https://html.duckduckgo.com/html/?q=${encoded}&kl=cn-zh`, extract: extractDuckDuckGoResults },
  ];
  const errors = [];
  for (const source of sources) {
    try {
      const page = await readPublicUrl(safeUrl(source.url));
      const results = source.extract(page.raw);
      if (results.length) return { source: page.url, results };
      errors.push(`${new URL(source.url).hostname}: no readable results`);
    } catch (error) {
      errors.push(`${new URL(source.url).hostname}: ${error?.message || "request failed"}`);
    }
  }
  throw new Error(`No public search result was available. ${errors.join("; ")}`);
}

function textResult(value, isError = false) {
  return { content: [{ type: "text", text: value }], isError };
}

const server = new McpServer({ name: "superclaw-web-research", version: "1.0.0" });

server.registerTool(
  "web_search",
  {
    description: "Search public web pages through SuperClaw's local read-only research adapter. Use this instead of Claude cloud WebSearch.",
    inputSchema: { query: z.string().min(1).max(500).describe("Search keywords") },
  },
  async ({ query }) => {
    try {
      const result = await searchPublicWeb(query.trim());
      return textResult(JSON.stringify({ query, source: result.source, results: result.results }, null, 2));
    } catch (error) {
      return textResult(`Read-only web search failed: ${error?.message || "unknown error"}`, true);
    }
  }
);

server.registerTool(
  "web_fetch",
  {
    description: "Read a public http(s) page through SuperClaw's local read-only research adapter. Local/private addresses, uploads, logins, and writes are blocked.",
    inputSchema: { url: z.string().min(8).max(2048).describe("Public http(s) URL") },
  },
  async ({ url }) => {
    try {
      const page = await readPublicUrl(safeUrl(url));
      const { raw, ...visiblePage } = page;
      return textResult(JSON.stringify(visiblePage, null, 2), !page.ok);
    } catch (error) {
      return textResult(`Read-only web fetch failed: ${error?.message || "unknown error"}`, true);
    }
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("SuperClaw web research MCP failed:", error?.stack || error);
  process.exit(1);
});
