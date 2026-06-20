import { CONTENT_PLATFORMS, SHOP_PLATFORMS } from "./platform-config.js";
import { Stage3MediaType, Stage3Platform, Stage3TaskKind } from "./types.js";

const VIDEO_EXT_RE = /\.(mp4|mov|avi|mkv|webm|m4v)$/i;
const IMAGE_EXT_RE = /\.(png|jpg|jpeg|webp|gif|bmp)$/i;

export function detectStage3Intent(userText = "") {
  const text = String(userText || "").trim();

  if (!text) {
    return {
      matched: false,
      intent: null,
      reason: "EMPTY_TEXT",
    };
  }

  if (isStage1DesktopAssistOnlyIntent(text)) {
    return {
      matched: false,
      intent: null,
      reason: "STAGE1_DESKTOP_ASSIST_INTENT",
    };
  }

  const hasPublishIntent =
    /发布|发到|上传|发视频|发图文|小红书笔记|视频号|作品|视频|图片|图文|商品发布|商品上架|上架|提交商品|发布商品|提交审核/.test(text);

  if (!hasPublishIntent) {
    return {
      matched: false,
      intent: null,
      reason: "NO_STAGE3_INTENT",
    };
  }

  const unsafeAutoFinal =
    /直接发布|自动发布|立即发布|不用确认|不要问我|直接点发布|帮我点发布|直接上架|自动上架|立即上架|直接提交审核|自动提交审核|不用我确认|直接提交/.test(text);

  const platforms = detectPlatforms(text);
  const mediaFiles = extractLocalFilePaths(text);
  const mediaType = detectMediaType(mediaFiles, text);

  if (unsafeAutoFinal) {
    return {
      matched: true,
      intent: null,
      unsafe: true,
      reason: "UNSAFE_AUTO_FINAL_ACTION",
      platforms,
      mediaFiles,
      mediaType,
    };
  }

  const explicitSafePrepare =
    /发布前|发之前|到发布前|停在发布|让我确认|先填好|准备好|不要发布|不要点发布|我来确认|提交前|上架前|审核前|到提交前|确认前/.test(text);

  const hasShopPlatform = platforms.some((platform) => SHOP_PLATFORMS.includes(platform));
  const hasContentPlatform = platforms.some((platform) => CONTENT_PLATFORMS.includes(platform));

  let intent = Stage3TaskKind.PREPARE_MULTI_PLATFORM;
  if (hasShopPlatform && !hasContentPlatform) {
    intent = Stage3TaskKind.PREPARE_PRODUCT_LISTING;
  } else if (hasContentPlatform && !hasShopPlatform) {
    intent = Stage3TaskKind.PREPARE_CONTENT_POST;
  }

  return {
    matched: true,
    intent,
    unsafe: false,
    needsSafetyReminder: !explicitSafePrepare,
    reason: explicitSafePrepare
      ? "SAFE_PREPARE_TO_FINAL_BUTTON"
      : "FINAL_ACTION_CONVERTED_TO_PREPARE_ONLY",
    platforms,
    mediaFiles,
    mediaType,
  };
}

function isStage1DesktopAssistOnlyIntent(text = "") {
  const value = String(text || "");
  const hasDesktopAssistHint =
    /截图|截屏|发到聊天|当前页面|看看页面|浏览器页面|这个页面|看一下页面|可见文字|页面文字|读取页面|读一下页面|网页内容|按钮|输入框|页面元素|优惠券|外卖/.test(value);
  if (!hasDesktopAssistHint) return false;

  const hasExplicitPublishOrCommerceTarget =
    /发布|上传|上架|提交审核|商品发布|商品上架|提交商品|抖音|快手|视频号|小红书|天猫|淘宝|拼多多|douyin|kuaishou|xiaohongshu|xhs|tmall|taobao|pdd/i.test(value);
  const hasLocalMediaFile =
    /[A-Za-z]:\\[^\s"'“”<>|]+\.(?:mp4|mov|avi|mkv|webm|m4v|png|jpg|jpeg|webp|gif|bmp)|\/[^\s"'“”<>|]+\.(?:mp4|mov|avi|mkv|webm|m4v|png|jpg|jpeg|webp|gif|bmp)/i.test(
      value,
    );

  return !hasExplicitPublishOrCommerceTarget && !hasLocalMediaFile;
}

export function detectPlatforms(text = "") {
  const value = String(text || "");

  if (/全平台|所有平台|全部平台/.test(value)) {
    return [...CONTENT_PLATFORMS, ...SHOP_PLATFORMS];
  }

  if (/全内容平台|所有内容平台|短视频平台|内容平台/.test(value)) {
    return [...CONTENT_PLATFORMS];
  }

  if (/全电商平台|所有电商平台|店铺平台|卖货平台/.test(value)) {
    return [...SHOP_PLATFORMS];
  }

  const platforms = [];

  if (/抖音|douyin/i.test(value)) platforms.push(Stage3Platform.DOUYIN);
  if (/快手|kuaishou/i.test(value)) platforms.push(Stage3Platform.KUAISHOU);
  if (/视频号|微信视频号|wechat channels|wechat_channel|channels/i.test(value)) platforms.push(Stage3Platform.WECHAT_CHANNELS);
  if (/小红书|xiaohongshu|xhs/i.test(value)) platforms.push(Stage3Platform.XIAOHONGSHU);
  if (/天猫|tmall/i.test(value)) platforms.push(Stage3Platform.TMALL);
  if (/淘宝|taobao/i.test(value)) platforms.push(Stage3Platform.TAOBAO);
  if (/拼多多|pdd|pinduoduo/i.test(value)) platforms.push(Stage3Platform.PINDUODUO);

  if (!platforms.length) {
    if (/商品|上架|店铺|宝贝|主图|详情页|提交审核|发布商品/.test(value)) {
      platforms.push(Stage3Platform.TAOBAO);
    } else {
      platforms.push(Stage3Platform.DOUYIN);
    }
  }

  return Array.from(new Set(platforms));
}

export function extractLocalFilePaths(text = "") {
  const value = String(text || "");
  const quoted = Array.from(
    value.matchAll(/["“']([^"“”']+\.(?:mp4|mov|avi|mkv|webm|m4v|png|jpg|jpeg|webp|gif|bmp))["”']/gi),
  ).map((match) => match[1]);
  const windows =
    value.match(/[A-Za-z]:\\[^\s"'“”<>|]+\.(?:mp4|mov|avi|mkv|webm|m4v|png|jpg|jpeg|webp|gif|bmp)/gi) || [];
  const unix =
    value.match(/\/[^\s"'“”<>|]+\.(?:mp4|mov|avi|mkv|webm|m4v|png|jpg|jpeg|webp|gif|bmp)/gi) || [];

  return Array.from(new Set([...quoted, ...windows, ...unix]));
}

export function detectMediaType(files = [], text = "") {
  const list = Array.isArray(files) ? files : [];
  const hasVideo = list.some((file) => VIDEO_EXT_RE.test(file));
  const hasImage = list.some((file) => IMAGE_EXT_RE.test(file));
  const body = String(text || "");

  if (hasVideo && hasImage) return Stage3MediaType.MIXED;
  if (hasVideo) return Stage3MediaType.VIDEO;
  if (hasImage && /商品图|主图|详情图|宝贝图|产品图/.test(body)) return Stage3MediaType.PRODUCT_IMAGES;
  if (hasImage) return Stage3MediaType.IMAGE;
  if (/视频/.test(body)) return Stage3MediaType.VIDEO;
  if (/商品图|主图|详情图|宝贝图|产品图/.test(body)) return Stage3MediaType.PRODUCT_IMAGES;
  if (/图片|图文|照片/.test(body)) return Stage3MediaType.IMAGE;
  return Stage3MediaType.UNKNOWN;
}

export function extractProductName(text = "") {
  const value = String(text || "")
    .replace(/["“'][^"“”']+\.(?:mp4|mov|avi|mkv|webm|m4v|png|jpg|jpeg|webp|gif|bmp)["”']/gi, " ")
    .replace(/[A-Za-z]:\\[^\s"'“”<>|]+\.(?:mp4|mov|avi|mkv|webm|m4v|png|jpg|jpeg|webp|gif|bmp)/gi, " ")
    .replace(/\/[^\s"'“”<>|]+\.(?:mp4|mov|avi|mkv|webm|m4v|png|jpg|jpeg|webp|gif|bmp)/gi, " ");

  const match = value.match(/(?:商品|产品|宝贝|主推|发布|上架)(?:标题|名|名称)?[：:\s]*([\u4e00-\u9fa5A-Za-z0-9]{2,16})/);
  if (match?.[1] && !/到|前|让我|直接|上传|发布|上架/.test(match[1])) return match[1];

  const candidates = value.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,16}/g) || [];
  return candidates.find((word) => !/帮我|发布|上传|视频|图片|抖音|快手|视频号|小红书|天猫|淘宝|拼多多|确认|提交|上架|商品/.test(word)) || "";
}

export function extractKeywordHints(text = "") {
  const value = String(text || "");
  const words = value.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) || [];
  return Array.from(new Set(words.filter((word) => !/帮我|发布|上传|视频|图片|平台|确认|提交|上架|商品|抖音|快手|视频号|小红书|天猫|淘宝|拼多多|素材/.test(word)))).slice(0, 12);
}
