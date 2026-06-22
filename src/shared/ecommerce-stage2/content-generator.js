export function generateProductTitles({ keywords = [], category = "", product = "", platform = "general" } = {}) {
  const words = normalizeKeywordList(keywords);
  const main = product || category || words[0] || "商品";
  const k1 = words[0] || "显瘦";
  const k2 = words[1] || "通勤";
  const k3 = words[2] || "百搭";
  const k4 = words[3] || "质感";
  const channelSuffix = platform === "doudian" ? "抖店标题关键词版" : "电商标题关键词版";

  return unique([
    `${k1}${k2}${main}`,
    `${k1}${k3}${main}女`,
    `${k2}${k4}${main}新款`,
    `早春${k1}${main} ${k3}日常款`,
    `${main}${k1}${k2} ${k4}高级感`,
    `${main}${k1}${k3} ${channelSuffix}`,
  ]).slice(0, 8);
}

export function generateShortVideoTitles({ keywords = [], category = "", product = "", platform = "general" } = {}) {
  const words = normalizeKeywordList(keywords);
  const main = product || category || words[0] || "这件";
  const k1 = words[0] || "显瘦";
  const k2 = words[1] || "通勤";
  const k3 = words[2] || "百搭";

  const conversational = platform === "kuaishou"
    ? [
        `${main}别瞎买，先看这个上身效果`,
        `微胖姐妹看过来，这种版型真不挑人`,
        `这件${main}挺实在，日常穿不费劲`,
      ]
    : [];

  return unique([
    ...conversational,
    `${main}这样搭，真的很${k1}`,
    `微胖也能穿出${k2}感，关键在这件`,
    `这件${main}，日常穿也太${k3}了`,
    `早春不知道穿什么？试试这个${main}`,
    `${k1}不是玄学，上身效果一看就懂`,
    `上班通勤别乱买，这种版型更实穿`,
    `普通人也能穿出高级感，重点是版型`,
    `这套搭配不挑人，日常出门直接穿`,
    `想要舒服又好看，可以先看这件`,
    `评论区问爆的${main}，优点我整理好了`,
  ]).slice(0, 12);
}

export function generateSellingPoints({ keywords = [], category = "", product = "", imageText = "" } = {}) {
  const words = normalizeKeywordList(`${normalizeKeywordList(keywords).join(" ")} ${imageText}`.split(/\s+/));
  const main = product || category || "商品";
  const dynamic = [];

  if (hasAny(words, ["显瘦", "遮肉", "微胖"])) {
    dynamic.push("版型方向可以突出显瘦、遮肉、微胖友好。");
  }

  if (hasAny(words, ["通勤", "上班", "日常"])) {
    dynamic.push("场景方向可以突出通勤、上班、日常都能穿。");
  }

  if (hasAny(words, ["百搭", "基础", "简约"])) {
    dynamic.push("搭配方向可以突出百搭、不挑人、衣柜利用率高。");
  }

  if (hasAny(words, ["质感", "高级感", "显白"])) {
    dynamic.push("视觉方向可以突出质感、高级感、显白或上镜效果。");
  }

  return unique([
    ...dynamic,
    `适合日常使用，${main}的核心卖点可以围绕实用、好搭和场景感展开。`,
    "如果页面或图片里有版型、材质、颜色信息，可以进一步提炼成更具体的卖点。",
  ]).slice(0, 8);
}

export function generateLiveScripts({ keywords = [], category = "", product = "" } = {}) {
  const words = normalizeKeywordList(keywords);
  const main = product || category || words[0] || "这款";
  const k1 = words[0] || "显瘦";
  const k2 = words[1] || "百搭";
  const k3 = words[2] || "通勤";

  return unique([
    `姐妹们先看版型，${main}主打${k1}，不是只看图片好看。`,
    `如果你平时想要${k2}一点，这款可以重点看肩线、腰线和长度。`,
    `上班、出门、日常都能用，${k3}场景会比较友好。`,
    `评论区如果问尺码，建议围绕身高体重和想要的宽松度来选。`,
  ]);
}

export function generateXiaohongshuNotes({ keywords = [], category = "", product = "" } = {}) {
  const words = normalizeKeywordList(keywords);
  const main = product || category || words[0] || "好物";
  const tags = words.slice(0, 6).map((word) => `#${word}`).join(" ");

  return unique([
    `${main}种草｜普通人也能直接照着用的搭配思路\n先说适合谁：想要日常、百搭、不过分夸张的姐妹可以看。优点可以写版型、颜色、搭配场景，避坑点写尺码和适合身形。${tags}`,
    `${main}笔记标题：早春穿搭不费力，关键词是版型和场景\n正文方向：开头给真实场景，中间列 3 个优点，结尾给适合人群。${tags}`,
  ]);
}

export function generatePlatformDrafts({ keywords = [], category = "", product = "", platform = "general" } = {}) {
  const titles = generateShortVideoTitles({ keywords, category, product, platform });
  const productTitles = generateProductTitles({ keywords, category, product, platform });
  const liveScripts = generateLiveScripts({ keywords, category, product });
  const xhsNotes = generateXiaohongshuNotes({ keywords, category, product });
  const words = normalizeKeywordList(keywords);
  const tags = words.slice(0, 6).map((word) => `#${word}`);

  return [
    {
      platform: "douyin",
      title: titles[0],
      body: `开头展示效果，对比上身前后，再讲 2-3 个核心卖点。${tags.slice(0, 4).join(" ")}`,
    },
    {
      platform: "kuaishou",
      title: titles[1] || titles[0],
      body: `口语化讲真实使用感，重点说适合谁、解决什么问题、怎么买不踩坑。${tags.slice(0, 4).join(" ")}`,
    },
    {
      platform: "xiaohongshu",
      title: productTitles[0],
      body: xhsNotes[0],
    },
    {
      platform: "live",
      title: `${product || category || "商品"}直播讲解`,
      body: liveScripts.join("\n"),
    },
  ];
}

function normalizeKeywordList(input = []) {
  const arr = Array.isArray(input) ? input : [input];
  return unique(
    arr
      .map((item) => {
        if (typeof item === "string") return item;
        return item?.keyword || "";
      })
      .join(" ")
      .split(/[\s,，、|｜/]+/)
      .map((word) => word.trim())
      .filter(Boolean),
  ).slice(0, 20);
}

function hasAny(words, hints) {
  return words.some((word) => hints.some((hint) => word.includes(hint)));
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}
