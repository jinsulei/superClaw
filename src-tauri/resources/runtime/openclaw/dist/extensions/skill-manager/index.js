import { definePluginEntry } from "../../plugin-sdk/plugin-entry.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";

const inflateRawAsync = promisify(inflateRaw);
const COS_BASE = "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com";
const API_BASE = "https://lightmake.site/api/v1";
const CLAWHUB_API_BASE = "https://clawhub.ai/api/v1";
const INDEX_TTL_MS = 10 * 60 * 1000;

let indexCache = null;

function normalizeSlug(slug) {
  const value = String(slug || "").trim();
  if (!value) throw new Error("skill slug is required");
  if (value.includes("..") || value.includes("/") || value.includes("\\")) {
    throw new Error(`invalid skill slug: ${value}`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`invalid skill slug: ${value}`);
  }
  return value;
}

function openclawHome() {
  const candidates = [
    process.env.OPENCLAW_HOME,
    process.env.OPENCLAW_STATE_DIR,
    process.env.SUPERCLAW_OPENCLAW_HOME,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.resolve(String(candidate));
    if (resolved) return resolved;
  }
  return path.join(os.homedir(), ".openclaw");
}

function openclawSkillsDir() {
  const fromEnv = process.env.OPENCLAW_SKILLS_DIR || process.env.SUPERCLAW_OPENCLAW_SKILLS_DIR;
  if (fromEnv) return path.resolve(String(fromEnv));
  return path.join(openclawHome(), "skills");
}

function auditLogPath() {
  return path.join(openclawHome(), "logs", "skill-manager-audit.jsonl");
}

function writeAudit(event) {
  try {
    const filePath = auditLogPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`, "utf8");
  } catch {
    // Audit logging must never break the user flow.
  }
}

function listInstalledSkills() {
  const dir = openclawSkillsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      const skillDir = path.join(dir, entry.name);
      const skillMd = path.join(skillDir, "SKILL.md");
      return {
        slug: entry.name,
        path: skillDir,
        hasSkillMd: fs.existsSync(skillMd),
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

async function fetchIndex() {
  if (indexCache && Date.now() - indexCache.ts < INDEX_TTL_MS) return indexCache.items;
  const resp = await fetch(`${COS_BASE}/skills.json`, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`SkillHub index failed: HTTP ${resp.status}`);
  const data = await resp.json();
  const items = Array.isArray(data) ? data : (Array.isArray(data?.skills) ? data.skills : []);
  indexCache = { ts: Date.now(), items };
  return items;
}

async function searchSkills(query, limit = 10) {
  const q = String(query || "").trim();
  if (!q) return [];
  const max = Math.max(1, Math.min(30, Number(limit) || 10));
  const [legacy, current] = await Promise.allSettled([
    searchLegacySkills(q, max),
    searchClawHubSkills(q, max),
  ]);
  const results = [];
  if (legacy.status === "fulfilled") results.push(...legacy.value);
  if (current.status === "fulfilled") results.push(...current.value);
  const merged = dedupeSkills(results).slice(0, max);
  if (merged.length) return merged;

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const items = await fetchIndex();
  return dedupeSkills(items.filter((item) => {
    const text = [
      item.slug,
      item.name,
      item.displayName,
      item.display_name,
      item.summary,
      item.description,
    ].filter(Boolean).join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  })).slice(0, max);
}

async function downloadZip(slug) {
  const errors = [];
  const attempts = [
    () => downloadFromClawHub(slug),
    () => downloadFromUrl(`${COS_BASE}/skills/${encodeURIComponent(slug)}.zip`, "legacy-cos"),
    () => downloadFromUrl(`${API_BASE}/download?slug=${encodeURIComponent(slug)}`, "legacy-api"),
  ];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  throw new Error(`SkillHub download failed: ${errors.join("; ")}`);
}

async function searchLegacySkills(query, limit) {
  const resp = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`legacy search HTTP ${resp.status}`);
  const data = await resp.json();
  return (Array.isArray(data?.results) ? data.results : []).map((item) => ({
    ...item,
    source: item.source || "legacy-skillhub",
  }));
}

async function searchClawHubSkills(query, limit) {
  const resp = await fetch(`${CLAWHUB_API_BASE}/skills?search=${encodeURIComponent(query)}&limit=${limit}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`clawhub search HTTP ${resp.status}`);
  const data = await resp.json();
  return (Array.isArray(data?.items) ? data.items : []).map((item) => ({
    ...item,
    name: item.name || item.displayName,
    displayName: item.displayName || item.name || item.slug,
    version: item.latestVersion?.version || item.tags?.latest || item.version,
    source: "clawhub",
  }));
}

function dedupeSkills(items) {
  const seen = new Set();
  const merged = [];
  for (const item of items) {
    const slug = String(item?.slug || "").trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    merged.push(item);
  }
  return merged;
}

async function downloadFromClawHub(slug) {
  const resp = await fetch(`${CLAWHUB_API_BASE}/skills/${encodeURIComponent(slug)}/install`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const text = await safeResponseText(resp);
    throw new Error(`clawhub install HTTP ${resp.status}${text ? `: ${text}` : ""}`);
  }
  const data = await resp.json();
  const downloadUrl = data?.archive?.downloadUrl;
  if (data?.installKind !== "archive" || typeof downloadUrl !== "string" || !downloadUrl) {
    throw new Error("clawhub install did not return an archive download URL");
  }
  return await downloadFromUrl(downloadUrl, "clawhub");
}

async function downloadFromUrl(url, source) {
  const resp = await fetch(url, {
    headers: { accept: "application/zip,application/octet-stream,*/*" },
    signal: AbortSignal.timeout(30000),
  });
  const buf = Buffer.from(await resp.arrayBuffer());
  if (!resp.ok) throw new Error(`${source} HTTP ${resp.status}: ${bufferPreview(buf)}`);
  if (!isZip(buf)) throw new Error(`${source} response is not a zip: ${bufferPreview(buf)}`);
  return buf;
}

async function safeResponseText(resp) {
  try {
    return (await resp.text()).slice(0, 200);
  } catch {
    return "";
  }
}

function isZip(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function bufferPreview(buf) {
  return buf.subarray(0, 120).toString("utf8").replace(/\s+/g, " ").trim();
}

function parseZipEntries(buf) {
  const entries = [];
  let offset = 0;
  const sigLocal = 0x04034b50;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== sigLocal) break;
    const gpFlag = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataOffset = offset + 30 + nameLen + extraLen;
    entries.push({ name, isDir: name.endsWith("/"), method, compressedSize, dataOffset });
    if ((gpFlag & 0x08) && compressedSize === 0) break;
    offset = dataOffset + compressedSize;
  }
  return entries;
}

function singleRootPrefix(entries) {
  let root = null;
  for (const entry of entries) {
    const first = String(entry.name || "").split("/")[0];
    if (!first) continue;
    const prefix = `${first}/`;
    if (root == null) root = prefix;
    else if (!entry.name.startsWith(root)) return null;
  }
  return root;
}

async function extractZip(zipBuf, targetDir) {
  const entries = parseZipEntries(zipBuf);
  if (!entries.length) throw new Error("zip is empty or unsupported");
  const root = singleRootPrefix(entries);
  const targetRoot = path.resolve(targetDir);
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const entry of entries) {
    let name = String(entry.name || "").replace(/\\/g, "/");
    if (!name || name.includes("..")) continue;
    if (root) {
      if (!name.startsWith(root)) continue;
      name = name.slice(root.length);
      if (!name) continue;
    }
    const outPath = path.resolve(targetRoot, name);
    if (outPath !== targetRoot && !outPath.startsWith(`${targetRoot}${path.sep}`)) continue;
    if (entry.isDir) {
      fs.mkdirSync(outPath, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    let data;
    if (entry.method === 0) {
      data = zipBuf.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
    } else if (entry.method === 8) {
      data = await inflateRawAsync(zipBuf.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize));
    } else {
      continue;
    }
    fs.writeFileSync(outPath, data);
  }
}

async function installSkill(slug, force = false) {
  const safeSlug = normalizeSlug(slug);
  const skillsDir = openclawSkillsDir();
  const targetDir = path.join(skillsDir, safeSlug);
  if (fs.existsSync(targetDir)) {
    if (!force) {
      return { installed: false, alreadyInstalled: true, slug: safeSlug, path: targetDir };
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(skillsDir, { recursive: true });
  const zip = await downloadZip(safeSlug);
  await extractZip(zip, targetDir);
  if (!fs.existsSync(path.join(targetDir, "SKILL.md"))) {
    throw new Error(`installed skill has no SKILL.md: ${safeSlug}`);
  }
  return { installed: true, alreadyInstalled: false, slug: safeSlug, path: targetDir };
}

const parameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["audit", "search", "install"],
      description: "audit local skills, search SkillHub, or install one SkillHub skill after explicit user consent.",
    },
    query: {
      type: "string",
      description: "Search query for action=search.",
    },
    slug: {
      type: "string",
      description: "SkillHub slug for action=install.",
    },
    limit: {
      type: "number",
      description: "Maximum search results. Default 10, max 30.",
    },
    force: {
      type: "boolean",
      description: "Replace an existing skill with the same slug. Default false.",
    },
    consent: {
      type: "boolean",
      description: "Must be true only after the user explicitly agrees to install the skill in the latest user message.",
    },
    reason: {
      type: "string",
      description: "Why this skill is needed for the user's task.",
    },
  },
  required: ["action"],
};

export default definePluginEntry({
  id: "skill-manager",
  name: "Skill Manager",
  description: "Audit, search, and install OpenClaw skills safely.",
  register(api) {
    api.registerTool({
      name: "skill_manager",
      label: "Skill Manager",
      description: [
        "Use this tool only when the user asks about missing skills, plugin/tool capability, or explicitly asks to install a skill.",
        "For normal chat, do not call it.",
        "First call action=audit or action=search to inspect local skills or SkillHub.",
        "For action=install, the latest user message must explicitly approve installation; set consent=true only then.",
        "This tool never runs shell commands, npm, PowerShell, brew, go, uv, or dependency installers.",
        "If a skill needs extra binaries or credentials, report the missing dependency and ask the user before any external installation.",
      ].join(" "),
      parameters,
      async execute(_toolCallId, params = {}) {
        const action = String(params.action || "").trim();
        if (action === "audit") {
          const result = {
            ok: true,
            openclawHome: openclawHome(),
            skillsDir: openclawSkillsDir(),
            installed: listInstalledSkills(),
            safety: {
              shell: false,
              dependencyInstall: false,
              requiresConsentForInstall: true,
            },
          };
          writeAudit({ action, ok: true, installedCount: result.installed.length });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        if (action === "search") {
          const results = await searchSkills(params.query, params.limit);
          const result = { ok: true, query: String(params.query || ""), results };
          writeAudit({ action, ok: true, query: result.query, count: results.length });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        if (action === "install") {
          if (params.consent !== true) {
            const result = {
              ok: false,
              requiresConsent: true,
              message: "Installation is blocked until the user explicitly agrees in the latest message.",
              slug: params.slug || "",
            };
            writeAudit({ action, ok: false, reason: "missing_consent", slug: params.slug || "" });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          const result = await installSkill(params.slug, params.force === true);
          writeAudit({ action, ok: true, slug: result.slug, path: result.path, reason: params.reason || "" });
          return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...result }, null, 2) }] };
        }
        throw new Error(`unsupported skill_manager action: ${action}`);
      },
    });
  },
});
