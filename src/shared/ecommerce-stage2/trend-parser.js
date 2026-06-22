const COMMERCE_BOOST_WORDS = [
  "显瘦",
  "通勤",
  "微胖",
  "早春",
  "穿搭",
  "气质",
  "高级感",
  "遮肉",
  "百搭",
  "小个子",
  "大码",
  "修身",
  "宽松",
  "显白",
  "防晒",
  "薄款",
  "爆款",
  "同款",
  "新款",
  "种草",
  "好物",
  "平价",
  "质感",
  "复古",
  "韩系",
  "法式",
  "辣妹",
  "甜酷",
  "日常",
  "上班",
  "直播间",
  "评论区",
  "回购",
  "春夏",
  "秋冬",
  "不挑人",
  "标题",
];

const STOP_WORDS = new Set([
  "这个",
  "那个",
  "我们",
  "你们",
  "他们",
  "一个",
  "没有",
  "可以",
  "进行",
  "当前",
  "页面",
  "点击",
  "按钮",
  "输入",
  "打开",
  "搜索",
  "内容",
  "用户",
  "平台",
  "结果",
  "一下",
  "帮我",
  "根据",
  "生成",
  "读取",
  "截图",
  "热词",
  "关键词",
  "标题",
  "商品",
  "视频",
  "直播",
]);

export function extractUrls(text = "") {
  const value = String(text || "");
  const matches = value.match(/https?:\/\/[^\s"'<>，。！？)）]+/g) || [];
  return Array.from(new Set(matches));
}

export function guessPlatformFromUrl(url = "") {
  const value = String(url || "").toLowerCase();
  if (value.includes("douyin") || value.includes("iesdouyin")) return "douyin";
  if (value.includes("kuaishou")) return "kuaishou";
  if (value.includes("xiaohongshu") || value.includes("xhslink")) return "xiaohongshu";
  if (value.includes("jinritemai") || value.includes("fxg.jinritemai") || value.includes("doudian")) return "doudian";
  if (value.includes("bilibili")) return "bilibili";
  if (value.includes("taobao")) return "taobao";
  if (value.includes("jd.com")) return "jd";
  return "unknown";
}

export function extractKeywordsFromText(text = "", options = {}) {
  const maxKeywords = options.maxKeywords || 28;
  const value = normalizeText(text);
  if (!value) return [];

  const candidates = [];
  const hashTags = value.match(/#[\u4e00-\u9fa5A-Za-z0-9_-]{2,24}/g) || [];
  candidates.push(...hashTags.map((tag) => tag.replace(/^#/, "")));

  const separators = value.split(/\s+/).filter(Boolean);
  candidates.push(...separators);

  const cnChunks = value.match(/[\u4e00-\u9fa5]{2,10}/g) || [];
  candidates.push(...cnChunks);

  const latinWords = value.match(/[A-Za-z][A-Za-z0-9_-]{2,24}/g) || [];
  candidates.push(...latinWords);

  const counter = new Map();

  for (const raw of candidates) {
    const keyword = cleanKeyword(raw);
    if (!isValidKeyword(keyword)) continue;

    const previous = counter.get(keyword) || {
      keyword,
      count: 0,
      score: 0,
      reasons: new Set(),
    };

    previous.count += 1;
    previous.score += scoreKeyword(keyword);
    if (COMMERCE_BOOST_WORDS.some((word) => keyword.includes(word))) {
      previous.reasons.add("电商高相关词");
    }
    if (keyword.length >= 4) previous.reasons.add("信息量较高");

    counter.set(keyword, previous);
  }

  return Array.from(counter.values())
    .map((item) => ({
      keyword: item.keyword,
      count: item.count,
      score: item.score + item.count,
      reasons: Array.from(item.reasons),
    }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.keyword.localeCompare(b.keyword, "zh-CN"))
    .slice(0, maxKeywords);
}

export function buildTrendGroups(keywords = [], text = "") {
  const words = keywords.map((item) => item.keyword || item).filter(Boolean);
  const body = normalizeText(text);

  return {
    hotKeywords: words.slice(0, 10),
    relatedKeywords: pickByHints(words, ["相关", "搭配", "同款", "场景", "人群", "风格", "类目"]),
    risingKeywords: pickByHints(words, ["飙升", "爆", "新款", "早春", "春夏", "趋势", "热搜", "增长"]),
    commentKeywords: pickByHintsFromText(words, body, ["评论", "问爆", "求链接", "怎么买", "好穿", "舒服", "回购"]),
    productTitleKeywords: pickByHints(words, ["显瘦", "通勤", "百搭", "新款", "质感", "大码", "小个子", "遮肉", "衬衫", "女装"]),
    shortVideoKeywords: pickByHints(words, ["爆款", "同款", "穿搭", "微胖", "早春", "显瘦", "种草", "好物"]),
    liveScriptKeywords: pickByHints(words, ["显白", "舒服", "遮肉", "百搭", "质感", "上班", "日常", "直播间"]),
    xiaohongshuKeywords: pickByHints(words, ["种草", "平价", "高级感", "韩系", "法式", "日常", "甜酷", "早春"]),
  };
}

export function buildTrendInsight({ text = "", query = "", keyword = "", source = "" } = {}) {
  const keywords = extractKeywordsFromText(`${keyword}\n${query}\n${text}`);
  const groups = buildTrendGroups(keywords, text);

  return {
    source,
    query,
    keyword,
    keywords,
    groups,
    note:
      keywords.length > 0
        ? "已根据搜索结果页可见文字和用户关键词提取低风险电商热词。"
        : "暂未提取到明显热词，可先手动打开热词页面，或补充更具体的类目关键词。",
  };
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[|｜、，。！？；：,.!?;:()[\]{}<>《》“”"'`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanKeyword(value) {
  return String(value || "")
    .replace(/^#+/, "")
    .replace(/^[\d.、\-\s]+/, "")
    .replace(/[\s]+/g, "")
    .trim();
}

function isValidKeyword(keyword) {
  if (!keyword) return false;
  if (keyword.length < 2) return false;
  if (keyword.length > 24) return false;
  if (STOP_WORDS.has(keyword)) return false;
  if (/^\d+$/.test(keyword)) return false;
  if (/^https?$/i.test(keyword)) return false;
  return true;
}

function scoreKeyword(keyword) {
  let score = 1;

  for (const boost of COMMERCE_BOOST_WORDS) {
    if (keyword.includes(boost)) score += 5;
  }

  if (keyword.length >= 3 && keyword.length <= 8) score += 2;
  if (/^[\u4e00-\u9fa5]+$/.test(keyword)) score += 1;

  return score;
}

function pickByHints(words, hints) {
  const matched = words.filter((word) => hints.some((hint) => word.includes(hint)));
  const merged = [...matched, ...words].filter(Boolean);
  return Array.from(new Set(merged)).slice(0, 8);
}

function pickByHintsFromText(words, text, hints) {
  const matched = words.filter((word) => {
    if (hints.some((hint) => word.includes(hint))) return true;
    return hints.some((hint) => text.includes(hint) && text.includes(word));
  });
  return Array.from(new Set([...matched, ...words])).slice(0, 8);
}
