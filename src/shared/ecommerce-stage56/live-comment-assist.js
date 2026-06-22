import { LiveQuestionType } from "./types.js";

const RISK_PATTERNS = [
  /验证码|密码|支付|银行卡|私下交易|加微信|转账|退款到私下|绕过平台/,
  /绝对|百分百|保证治好|永久有效|全网最低|包赚|稳赚/,
];

export function extractLiveComments(text = "") {
  const value = String(text || "").replace(/\r\n/g, "\n");
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const comments = [];

  for (const line of lines) {
    if (line.length < 2) continue;
    if (/^(主播|系统|公告|关注|点赞|进入直播间)/.test(line)) continue;

    const cleaned = line.replace(/^[\u4e00-\u9fa5A-Za-z0-9_]{1,16}[:：]\s*/, "").trim();
    if (!cleaned) continue;

    if (
      /码|多大|价格|多少钱|发货|包邮|材质|面料|链接|怎么买|怎么拍|退换|售后|搭配|适合|颜色|尺码|验证码|密码/.test(cleaned) ||
      cleaned.endsWith("?") ||
      cleaned.endsWith("？")
    ) {
      comments.push({
        id: `comment_${comments.length + 1}`,
        text: cleaned,
        raw: line,
      });
    }
  }

  return dedupeComments(comments).slice(0, 20);
}

export function classifyLiveComment(commentText = "") {
  const text = String(commentText || "");

  if (RISK_PATTERNS.some((pattern) => pattern.test(text))) return LiveQuestionType.RISKY;
  if (/尺码|多大|码数|身高|体重|胖|瘦|大一码|小一码/.test(text)) return LiveQuestionType.SIZE;
  if (/价格|多少钱|几块|贵|便宜|优惠|券|满减/.test(text)) return LiveQuestionType.PRICE;
  if (/材质|面料|会不会起球|透不透|厚不厚|薄不薄|舒服吗/.test(text)) return LiveQuestionType.MATERIAL;
  if (/发货|几天到|包邮|运费|物流|什么时候发/.test(text)) return LiveQuestionType.SHIPPING;
  if (/退|换|售后|质量问题|不合适/.test(text)) return LiveQuestionType.AFTER_SALE;
  if (/搭配|怎么穿|配什么|颜色|适合/.test(text)) return LiveQuestionType.MATCHING;
  if (/链接|怎么买|怎么拍|在哪拍|有没有车|上链接/.test(text)) return LiveQuestionType.PRODUCT_LINK;

  return LiveQuestionType.GENERAL;
}

export function classifyLiveComments(comments = []) {
  return comments.map((comment) => ({
    ...comment,
    questionType: classifyLiveComment(comment.text || comment),
  }));
}

export function generateLiveReply({ commentText = "", questionType = LiveQuestionType.GENERAL, productInfo = {} } = {}) {
  const productName = productInfo.name || productInfo.title || "这款";
  const shipping = productInfo.shipping || "发货时效以页面显示为准";
  const afterSale = productInfo.afterSale || "支持按平台规则处理售后";

  if (questionType === LiveQuestionType.RISKY) {
    return "这个问题涉及账号、支付、验证码或平台规则，我不能直接处理。建议按平台正规流程操作。";
  }

  if (questionType === LiveQuestionType.SIZE) {
    return `${productName}尺码建议按平时尺码参考，如果喜欢宽松一点可以大一码；具体还要看身高体重和穿着习惯。`;
  }

  if (questionType === LiveQuestionType.PRICE) {
    return `${productName}当前价格和优惠以页面显示为准，你可以先看下券和满减，合适再拍。`;
  }

  if (questionType === LiveQuestionType.MATERIAL) {
    return `${productName}材质信息建议以详情页为准，重点可以看面料、厚薄和上身舒适度。`;
  }

  if (questionType === LiveQuestionType.SHIPPING) {
    return `${shipping}，具体到货时间以你下单页面显示为准。`;
  }

  if (questionType === LiveQuestionType.AFTER_SALE) {
    return `${afterSale}，如果尺码或质量有问题，建议按平台售后流程处理。`;
  }

  if (questionType === LiveQuestionType.MATCHING) {
    return `${productName}比较适合日常搭配，可以配基础款下装或外套，想要通勤感就选简洁颜色。`;
  }

  if (questionType === LiveQuestionType.PRODUCT_LINK) {
    return "可以看直播间商品入口或小黄车，具体规格和优惠以页面显示为准。";
  }

  return `这个问题可以参考商品详情页信息，重点看尺码、材质、价格和发货说明。`;
}

export function generateLiveReplies(classifiedComments = [], productInfo = {}) {
  return classifiedComments.map((comment) => ({
    commentId: comment.id,
    comment: comment.text,
    questionType: comment.questionType,
    reply: generateLiveReply({
      commentText: comment.text,
      questionType: comment.questionType,
      productInfo,
    }),
    requiresUserConfirm: true,
  }));
}

function dedupeComments(comments) {
  const seen = new Set();
  const result = [];

  for (const comment of comments) {
    const key = comment.text;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(comment);
  }

  return result;
}
