import { detectStage56Platforms } from "./platform-config.js";
import { CandidateDecision, Stage56TaskKind } from "./types.js";

const DEFAULT_PATROL_OPTIONS = Object.freeze({
  durationMinutes: 10,
  maxCandidates: 10,
  minScore: 6,
});

const UNSAFE_PATROL_RE = /自动评论|帮我评论|发评论|自动回复|回复所有评论|自动发送|点赞|自动点赞|关注|自动关注|私信|下载|搬运|发布|发到|上架|付款|验证码|密码/;

export function detectStage56Intent(userText = "") {
  const text = String(userText || "").trim();

  if (!text) {
    return {
      matched: false,
      intent: null,
      reason: "EMPTY_TEXT",
    };
  }

  if (isStage1DesktopAssistHandoff(text)) {
    return {
      matched: false,
      intent: null,
      reason: "STAGE1_DESKTOP_ASSIST_INTENT",
    };
  }

  if (UNSAFE_PATROL_RE.test(text)) {
    return {
      matched: true,
      intent: null,
      unsafe: true,
      reason: "UNSAFE_STAGE56_ACTION",
      platforms: detectStage56Platforms(text),
    };
  }

  if (/直播|公屏|弹幕|观众问题|帮我回复|回复话术/.test(text)) {
    return {
      matched: true,
      intent: Stage56TaskKind.LIVE_COMMENT_ASSIST,
      unsafe: false,
      reason: "LIVE_COMMENT_ASSIST",
      platforms: detectStage56Platforms(text),
    };
  }

  if (/刷视频|巡检|爆款|素材|找视频|找灵感|拆解视频|候选视频|找同类|找同行/.test(text)) {
    return {
      matched: true,
      intent: Stage56TaskKind.VIDEO_INSPIRATION_PATROL,
      unsafe: false,
      reason: "VIDEO_INSPIRATION_PATROL",
      platforms: detectStage56Platforms(text),
    };
  }

  return {
    matched: false,
    intent: null,
    reason: "NO_STAGE56_INTENT",
  };
}

function isStage1DesktopAssistHandoff(text = "") {
  const value = String(text || "");
  const asksForPageCapture =
    /截图|截屏|当前页面|浏览器页面|看看页面|看一下页面|这个页面/.test(value);
  const asksForChatReturn =
    /发到聊天|发给我|发送给我|发到这里|回传|贴到聊天/.test(value);
  const asksForPlatformPublish =
    /发布|发到抖音|发到快手|发到小红书|发到视频号|上传|上架|提交审核/.test(value);

  return asksForPageCapture && asksForChatReturn && !asksForPlatformPublish;
}

export function parsePatrolOptions(userText = "") {
  const text = String(userText || "");
  const durationMatch = text.match(/(\d+)\s*(分钟|分|min|minutes)/i);
  const countMatch = text.match(/(?:最多|找|保存|收集)?\s*(\d+)\s*(条|个|个视频)/);
  const keywords = extractKeywords(text);

  return {
    ...DEFAULT_PATROL_OPTIONS,
    durationMinutes: durationMatch ? Number(durationMatch[1]) : DEFAULT_PATROL_OPTIONS.durationMinutes,
    maxCandidates: countMatch ? Math.min(Number(countMatch[1]), 50) : DEFAULT_PATROL_OPTIONS.maxCandidates,
    keywords,
  };
}

export function extractVideoCandidatesFromText(text = "", { platform = "", screenshot = null } = {}) {
  const value = String(text || "");
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = [];
  const urls = extractUrls(value);

  for (const url of urls) {
    const urlIndex = lines.findIndex((line) => line.includes(url) || normalizeUrl(line).includes(url));
    const title = findNearestTitle(lines, urlIndex);
    const metrics = parseVisibleMetrics(lines.slice(Math.max(0, urlIndex - 3), urlIndex + 4).join(" "));
    const candidate = scoreVideoCandidate({
      platform,
      url,
      title,
      author: findAuthor(lines, urlIndex),
      screenshot,
      visibleMetrics: metrics,
    });
    candidates.push(candidate);
  }

  if (!candidates.length && lines.length) {
    const title = lines.find((line) => /显瘦|穿搭|爆款|种草|好物|教程|分享|测评|同款/.test(line)) || lines[0];
    candidates.push(scoreVideoCandidate({
      platform,
      url: "",
      title,
      author: "",
      screenshot,
      visibleMetrics: parseVisibleMetrics(value),
    }));
  }

  return dedupeCandidates(candidates).slice(0, 20);
}

export function scoreVideoCandidate(candidate = {}) {
  const title = String(candidate.title || "");
  const metrics = candidate.visibleMetrics || {};
  let score = 0;
  const reasons = [];

  if (/显瘦|穿搭|微胖|早春|通勤|种草|爆款|好物|测评|教程|同款/.test(title)) {
    score += 4;
    reasons.push("标题含电商/内容高相关词");
  }

  if (candidate.url) {
    score += 1;
    reasons.push("可见公开链接");
  }

  const likes = Number(metrics.likes || 0);
  const comments = Number(metrics.comments || 0);
  const saves = Number(metrics.saves || metrics.collects || 0);

  if (likes >= 10000) {
    score += 3;
    reasons.push("点赞较高");
  } else if (likes >= 1000) {
    score += 2;
    reasons.push("点赞有基础");
  }

  if (comments >= 300) {
    score += 2;
    reasons.push("评论互动较强");
  } else if (comments >= 50) {
    score += 1;
    reasons.push("有评论互动");
  }

  if (saves >= 500) {
    score += 2;
    reasons.push("收藏较高");
  }

  const decision = score >= DEFAULT_PATROL_OPTIONS.minScore
    ? CandidateDecision.COLLECT
    : score >= 3
      ? CandidateDecision.NEED_REVIEW
      : CandidateDecision.IGNORE;

  return {
    ...candidate,
    score,
    reason: reasons.join("；") || "候选内容需要人工复核",
    decision,
  };
}

export function scoreVideoCandidates(candidates = []) {
  return candidates.map(scoreVideoCandidate).sort((a, b) => b.score - a.score);
}

export function extractKeywords(text = "") {
  const value = String(text || "")
    .replace(/刷\d+\s*(分钟|分|min|minutes)/gi, " ")
    .replace(/最多|保存|收集|素材|爆款|巡检|找|视频|灵感|帮我|我休息一会儿/g, " ");
  const words = value.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) || [];
  return Array.from(new Set(words.filter((word) => !/抖音|快手|小红书|视频号|平台|分钟|候选/.test(word)))).slice(0, 8);
}

function extractUrls(text = "") {
  const raw = String(text || "")
    .replace(/\]\((https?:\/\/[^)\s]+)\)/g, " $1 ")
    .replace(/https:\/\/\[([^\]]+)\]\(([^)]+)\)/g, "$2");
  const matches = raw.match(/https?:\/\/[^\s"'<>，。！？)）]+/g) || [];
  return Array.from(new Set(matches.map(normalizeUrl)));
}

function normalizeUrl(value = "") {
  return String(value || "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/[),.，。]+$/, "")
    .trim();
}

function findNearestTitle(lines, index) {
  if (index < 0) return lines[0] || "";
  for (let i = index - 1; i >= Math.max(0, index - 4); i -= 1) {
    const line = lines[i];
    if (!/点赞|评论|收藏|分享|https?:\/\//.test(line) && line.length >= 4) return line;
  }
  return lines[index - 1] || lines[0] || "";
}

function findAuthor(lines, index) {
  if (index < 0) return "";
  const nearby = lines.slice(Math.max(0, index - 5), index + 1);
  const authorLine = nearby.find((line) => /作者|博主|达人|@/.test(line));
  return authorLine?.replace(/作者|博主|达人|@|[:：]/g, "").trim() || "";
}

function parseVisibleMetrics(text = "") {
  const value = String(text || "");
  return {
    likes: parseMetric(value.match(/点赞\s*([0-9.]+万?)/)?.[1]),
    comments: parseMetric(value.match(/评论\s*([0-9.]+万?)/)?.[1]),
    saves: parseMetric(value.match(/收藏\s*([0-9.]+万?)/)?.[1]),
    shares: parseMetric(value.match(/分享|转发\s*([0-9.]+万?)/)?.[1]),
  };
}

function parseMetric(value = "") {
  const text = String(value || "");
  if (!text) return 0;
  const numeric = Number(text.replace(/万/g, ""));
  if (Number.isNaN(numeric)) return 0;
  return text.includes("万") ? Math.round(numeric * 10000) : numeric;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const result = [];

  for (const candidate of candidates) {
    const key = candidate.url || candidate.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  return result;
}
