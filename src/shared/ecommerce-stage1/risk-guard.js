import {
  RiskLevel,
  Stage1ActionType,
  createUserConfirmation,
} from "./types.js";

const HIGH_RISK_ACTIONS = new Set([
  Stage1ActionType.PAY,
  Stage1ActionType.SUBMIT_ORDER,
  Stage1ActionType.PUBLISH_CONTENT,
  Stage1ActionType.LIST_PRODUCT,
  Stage1ActionType.DELIST_PRODUCT,
  Stage1ActionType.CHANGE_PRICE,
  Stage1ActionType.CHANGE_INVENTORY,
  Stage1ActionType.DELETE_CONTENT,
  Stage1ActionType.SEND_COMMENT,
  Stage1ActionType.SEND_LIVE_REPLY,
  Stage1ActionType.SEND_PRIVATE_MESSAGE,
  Stage1ActionType.LOGIN,
  Stage1ActionType.ENTER_PASSWORD,
  Stage1ActionType.ENTER_PAYMENT_PASSWORD,
  Stage1ActionType.ENTER_VERIFICATION_CODE,
  Stage1ActionType.AUTHORIZE_ACCOUNT,
  Stage1ActionType.UPLOAD_PRIVATE_FILE,
]);

const HIGH_RISK_TEXT_PATTERNS = [
  /付款|支付|扫码支付|支付密码|收银台/,
  /提交订单|确认订单|下单|购买|立即购买/,
  /发布视频|发布图文|立即发布|发到抖音|发到快手|发到小红书|发布到抖音|发布到快手|发布到小红书|发布内容/,
  /商品上架|提交审核|发布商品|上架商品/,
  /商品下架|下架商品|删除商品/,
  /修改价格|改价格|修改库存|改库存/,
  /删除文件|删除内容|删除素材/,
  /回复公屏|发送评论|发评论|自动回复|回复所有评论|私信|发私信/,
  /登录|验证码|密码|授权账号|授权第三方/,
];

export function normalizeActionType(action) {
  return String(action?.type || action?.name || action?.action || "").trim();
}

export function containsHighRiskText(text) {
  const value = String(text || "");
  if (!value.trim()) return false;
  return HIGH_RISK_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

export function isHighRiskAction(action) {
  const type = normalizeActionType(action);
  if (!type) return false;
  if (HIGH_RISK_ACTIONS.has(type)) return true;

  const label = [
    action?.label,
    action?.title,
    action?.description,
    action?.prompt,
  ]
    .filter(Boolean)
    .join(" ");

  return containsHighRiskText(`${type} ${label}`);
}

export function guardStage1Action(action) {
  if (!action) {
    return {
      allowed: false,
      risk: RiskLevel.HIGH,
      reason: "EMPTY_ACTION",
      confirmation: createUserConfirmation({
        title: "操作为空",
        description: "没有可执行的动作，已阻止。",
        action,
      }),
    };
  }

  if (isHighRiskAction(action)) {
    return {
      allowed: false,
      risk: RiskLevel.HIGH,
      reason: "HIGH_RISK_ACTION",
      confirmation: createUserConfirmation({
        title: "高风险操作需要确认",
        description: buildHighRiskDescription(action),
        amount: action.amount,
        platform: action.platform,
        items: action.items || [],
        action,
      }),
    };
  }

  return {
    allowed: true,
    risk: RiskLevel.LOW,
    reason: "LOW_RISK_ACTION",
    confirmation: null,
  };
}

function buildHighRiskDescription(action) {
  const platform = action.platform ? `平台：${action.platform}\n` : "";
  const amount = action.amount ? `金额：${action.amount}\n` : "";
  const label = action.label || action.name || action.type || "未知操作";

  return [
    platform,
    amount,
    `OpenClaw 准备执行：${label}`,
    "涉及付款、发布、上架、下架、账号、验证码、密码、评论发送或隐私的动作，必须由用户确认。",
  ]
    .filter(Boolean)
    .join("\n");
}
