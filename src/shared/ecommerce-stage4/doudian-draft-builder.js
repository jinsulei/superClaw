export function buildDoudianProductDraft({
  query = "",
  productTitle = "",
  category = "",
  keywords = [],
  stage2Draft = null,
  stage3Draft = null,
  price = "",
  inventory = "",
} = {}) {
  const words = normalizeWords([
    ...keywords,
    ...String(query || "").split(/[\s,，、#]+/),
  ]);
  const product = productTitle || inferProduct(query) || "商品";
  const title = shorten(
    pickFirst(
      productTitle,
      stage2Draft?.productTitles,
      stage3Draft?.title,
      [`${joinWords(words.slice(0, 3), " ")} ${product}`],
      [`${product} 日常百搭 实用款`],
    ),
    50,
  );
  const sellingPoints = buildSellingPoints(words, product);

  return {
    productTitle: title,
    category: category || inferCategory(query),
    description: buildDescription({ product, words, sellingPoints }),
    sellingPoints,
    specs: buildSpecs({ query, words }),
    productKeywords: normalizeWords([product, ...words]).slice(0, 12),
    price,
    inventory,
  };
}

function buildDescription({ product, words, sellingPoints }) {
  const keywordText = joinWords(words.slice(0, 6), "、") || "实用、好搭、场景明确";

  return [
    `${product}适合日常使用，核心卖点可以围绕${keywordText}展开。`,
    "",
    "推荐详情页结构：",
    "1. 适合人群：说明适合什么用户和使用场景。",
    "2. 核心卖点：突出版型、材质、颜色、功能或搭配价值。",
    "3. 规格说明：补充颜色、尺码、材质、数量等信息。",
    "4. 使用建议：说明搭配、保养、使用或注意事项。",
    "",
    ...sellingPoints.map((point) => `- ${point}`),
  ].join("\n");
}

function buildSellingPoints(words, product) {
  const points = [];

  if (hasAny(words, ["显瘦", "遮肉", "微胖"])) {
    points.push("版型方向可以突出显瘦、遮肉、微胖友好。");
  }

  if (hasAny(words, ["通勤", "上班", "日常"])) {
    points.push("场景方向可以突出通勤、上班、日常都能用。");
  }

  if (hasAny(words, ["百搭", "基础", "简约"])) {
    points.push("搭配方向可以突出百搭、不挑人、使用率高。");
  }

  if (hasAny(words, ["质感", "高级感", "显白"])) {
    points.push("视觉方向可以突出质感、高级感、上镜效果。");
  }

  points.push(`${product}的描述应避免夸大宣传，重点写真实卖点、适合人群和清晰规格。`);

  return Array.from(new Set(points)).slice(0, 8);
}

function buildSpecs({ query, words }) {
  const specs = [];

  if (/颜色|黑色|白色|灰色|蓝色|粉色|红色|绿色/.test(query)) {
    specs.push("颜色：请按实际商品颜色填写。");
  } else {
    specs.push("颜色：待确认。");
  }

  if (/尺码|S码|M码|L码|XL|均码/.test(query)) {
    specs.push("尺码：请按实际尺码填写。");
  } else {
    specs.push("尺码/规格：待确认。");
  }

  if (hasAny(words, ["棉", "涤纶", "牛仔", "雪纺", "针织"])) {
    specs.push("材质：请按商品实际材质填写。");
  } else {
    specs.push("材质：待确认。");
  }

  return specs;
}

function normalizeWords(items = []) {
  return Array.from(
    new Set(
      items
        .flatMap((item) => String(item || "").split(/[\s,，、#]+/))
        .map((word) => word.trim())
        .filter((word) => word.length >= 2 && word.length <= 16)
        .filter((word) => !/帮我|上架|抖店|提交前|确认|价格|库存|素材|商品/.test(word)),
    ),
  ).slice(0, 16);
}

function joinWords(words = [], sep = "、") {
  return normalizeWords(words).join(sep);
}

function pickFirst(...groups) {
  for (const group of groups) {
    if (Array.isArray(group) && group.length) return group[0];
    if (typeof group === "string" && group.trim()) return group.trim();
  }
  return "";
}

function shorten(value = "", max = 50) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function inferProduct(text = "") {
  const matched = String(text || "").match(/(衬衫|连衣裙|半身裙|牛仔裤|外套|T恤|口红|面膜|零食|收纳盒|耳机|手机壳|鞋|包|商品|好物)/);
  return matched?.[1] || "";
}

function inferCategory(text = "") {
  if (/女装|穿搭|衣服|衬衫|裙|裤|外套|T恤/.test(text)) return "女装";
  if (/美妆|口红|粉底|护肤|面膜/.test(text)) return "美妆";
  if (/食品|零食|饮料/.test(text)) return "食品";
  if (/家居|收纳|家具/.test(text)) return "家居";
  if (/数码|手机|电脑|耳机/.test(text)) return "数码";
  return "";
}

function hasAny(words, hints) {
  return words.some((word) => hints.some((hint) => word.includes(hint)));
}
