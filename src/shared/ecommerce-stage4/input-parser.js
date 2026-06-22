import { Stage4MediaType, Stage4TaskKind } from "./types.js";

const IMAGE_EXT_RE = /\.(png|jpg|jpeg|webp|gif|bmp)$/i;

export function detectStage4Intent(userText = "") {
  const text = String(userText || "").trim();

  if (!text) {
    return {
      matched: false,
      intent: null,
      reason: "EMPTY_TEXT",
    };
  }

  const hasDoudian = /抖店|douyin shop|doudian|抖音小店|小店后台/i.test(text);
  const hasOtherShopPlatform = /淘宝|天猫|拼多多|taobao|tmall|pinduoduo|pdd/i.test(text);
  const hasListingIntent = /上架|发布商品|商品发布|新增商品|创建商品|提交审核|商品详情|商品标题|主图|详情图/.test(text);

  if (hasOtherShopPlatform && !hasDoudian) {
    return {
      matched: false,
      intent: null,
      reason: "NON_DOUDIAN_PLATFORM",
    };
  }

  if (!hasDoudian && !hasListingIntent) {
    return {
      matched: false,
      intent: null,
      reason: "NO_DOUDIAN_LISTING_INTENT",
    };
  }

  const unsafeAutoSubmit =
    /直接提交|自动提交|立即提交|提交审核不用确认|直接发布商品|自动发布商品|直接上架|自动上架|不用我确认|不用确认/.test(text);

  const images = extractImagePaths(text);
  const productTitle = extractProductTitle(text);
  const category = extractCategory(text);
  const price = extractPrice(text);
  const inventory = extractInventory(text);
  const mediaType = detectMediaType(images);

  if (unsafeAutoSubmit) {
    return {
      matched: true,
      intent: null,
      unsafe: true,
      reason: "UNSAFE_AUTO_SUBMIT_REVIEW_REQUEST",
      images,
      detailImages: images,
      productTitle,
      category,
      price,
      inventory,
      mediaType,
    };
  }

  const explicitSafePrepare =
    /提交前|审核前|上架前|发布前|让我确认|先填好|准备好|不要提交|不要发布|不要上架|到提交审核前|确认前/.test(text);

  return {
    matched: true,
    intent: Stage4TaskKind.PREPARE_DOUDIAN_LISTING,
    unsafe: false,
    needsSafetyReminder: !explicitSafePrepare,
    reason: explicitSafePrepare ? "SAFE_PREPARE_TO_SUBMIT_REVIEW" : "LISTING_INTENT_CONVERTED_TO_PREPARE_ONLY",
    images,
    detailImages: images,
    productTitle,
    category,
    price,
    inventory,
    mediaType,
  };
}

export function extractImagePaths(text = "") {
  const value = String(text || "");
  const quoted = Array.from(
    value.matchAll(/["“']([^"“”']+\.(?:png|jpg|jpeg|webp|gif|bmp))["”']/gi),
  ).map((match) => match[1]);
  const windows =
    value.match(/[A-Za-z]:\\[^\s"'“”<>|]+\.(?:png|jpg|jpeg|webp|gif|bmp)/gi) || [];
  const unix =
    value.match(/\/[^\s"'“”<>|]+\.(?:png|jpg|jpeg|webp|gif|bmp)/gi) || [];

  return Array.from(new Set([...quoted, ...windows, ...unix]));
}

export function detectMediaType(images = []) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) return Stage4MediaType.UNKNOWN;
  return list.length > 1 ? Stage4MediaType.MIXED_IMAGES : Stage4MediaType.PRODUCT_IMAGES;
}

export function extractProductTitle(text = "") {
  const value = String(text || "");
  const explicit = value.match(/(?:标题|商品标题)[:：]\s*([^\n。；;]+)/);
  if (explicit?.[1]) return explicit[1].trim();

  const product = value.match(/(衬衫|连衣裙|半身裙|牛仔裤|外套|T恤|口红|面膜|零食|收纳盒|耳机|手机壳|鞋|包|商品|好物)/);
  return product?.[1] || "";
}

export function extractCategory(text = "") {
  const value = String(text || "");
  if (/女装|衬衫|裙|裤|穿搭|衣服|外套|T恤/.test(value)) return "女装";
  if (/男装/.test(value)) return "男装";
  if (/美妆|口红|面膜|护肤/.test(value)) return "美妆";
  if (/食品|零食|饮料/.test(value)) return "食品";
  if (/家居|收纳|家具/.test(value)) return "家居";
  if (/数码|耳机|手机|电脑/.test(value)) return "数码";
  return "";
}

export function extractPrice(text = "") {
  const value = String(text || "");
  const matched = value.match(/(?:价格|售价|卖|定价)[:：]?\s*¥?\s*(\d+(?:\.\d{1,2})?)/);
  return matched?.[1] || "";
}

export function extractInventory(text = "") {
  const value = String(text || "");
  const matched = value.match(/(?:库存|数量)[:：]?\s*(\d+)/);
  return matched?.[1] || "";
}

export function assertSafeImages(files = []) {
  const list = Array.isArray(files) ? files : [];
  const unsafe = list.filter((file) => !IMAGE_EXT_RE.test(file));

  return {
    ok: unsafe.length === 0,
    unsafe,
  };
}
