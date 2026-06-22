import { containsHighRiskText } from "./risk-guard.js";
import { Stage1ActionType, Stage1TaskKind } from "./types.js";

export function detectStage1Intent(userText = "") {
  const text = String(userText || "").trim();

  if (!text) {
    return {
      matched: false,
      intent: null,
      reason: "EMPTY_TEXT",
    };
  }

  if (containsHighRiskText(text)) {
    return {
      matched: true,
      intent: Stage1TaskKind.HIGH_RISK_CONFIRM_ONLY,
      reason: "HIGH_RISK_TEXT",
    };
  }

  if (isStage56VideoPatrolIntent(text)) {
    return {
      matched: false,
      intent: null,
      reason: "STAGE56_VIDEO_PATROL_INTENT",
    };
  }

  if (/截图|截屏|发到聊天|当前页面|看看页面|浏览器页面|这个页面|看一下页面/.test(text)) {
    return {
      matched: true,
      intent: Stage1TaskKind.SCREENSHOT_TO_CHAT,
      reason: "SCREENSHOT_OR_LOOK_PAGE",
    };
  }

  if (/可见文字|页面文字|读取页面|读一下页面|网页内容/.test(text)) {
    return {
      matched: true,
      intent: Stage1TaskKind.READ_VISIBLE_TEXT,
      reason: "READ_VISIBLE_TEXT",
    };
  }

  if (/按钮|输入框|上传入口|可点击|页面元素/.test(text)) {
    return {
      matched: true,
      intent: Stage1TaskKind.FIND_INTERACTIVE_TARGETS,
      reason: "FIND_INTERACTIVE_TARGETS",
    };
  }

  if (/优惠券|满减|红包|折扣|便宜点|优惠/.test(text)) {
    return {
      matched: true,
      intent: Stage1TaskKind.FIND_COUPON_HINTS,
      reason: "FIND_COUPON_HINTS",
    };
  }

  if (/外卖|美团|饿了么|点餐|点个/.test(text)) {
    return {
      matched: true,
      intent: Stage1TaskKind.ORDER_FOOD_SAFE_PREPARE,
      reason: "ORDER_FOOD_SAFE_PREPARE",
    };
  }

  if (/主播|衣服|穿搭|看图|图片|识别|截图分析/.test(text)) {
    return {
      matched: true,
      intent: Stage1TaskKind.DESCRIBE_IMAGE_OR_SCREEN,
      reason: "DESCRIBE_IMAGE_OR_SCREEN",
    };
  }

  return {
    matched: false,
    intent: null,
    reason: "NO_STAGE1_INTENT",
  };
}

function isStage56VideoPatrolIntent(text = "") {
  const value = String(text || "");
  return /刷\s*\d*\s*(分钟|分|min|minutes)?|巡检|爆款素材|爆款.*素材|找视频|找灵感|拆解视频|候选视频|找同类|找同行|好的链接|链接交给\s*Hermes|素材库/i.test(value);
}

export function buildStage1Plan({ intent, userText = "" } = {}) {
  const text = String(userText || "");
  const taskIntent = intent || detectStage1Intent(text).intent || Stage1TaskKind.LOOK_AT_PAGE;

  if (taskIntent === Stage1TaskKind.HIGH_RISK_CONFIRM_ONLY) {
    return {
      intent: taskIntent,
      userText: text,
      steps: [
        {
          type: Stage1ActionType.REQUIRE_CONFIRMATION,
          label: "用户请求包含高风险动作，第一阶段只做确认，不自动执行。",
          action: {
            type: inferHighRiskActionType(text),
            label: text || "高风险动作",
          },
        },
      ],
    };
  }

  const steps = [];

  steps.push({
    type: Stage1ActionType.STATUS,
    label: "准备读取当前页面",
    content: "我先查看当前页面状态。",
  });

  if (
    taskIntent === Stage1TaskKind.LOOK_AT_PAGE ||
    taskIntent === Stage1TaskKind.SCREENSHOT_TO_CHAT ||
    taskIntent === Stage1TaskKind.FIND_COUPON_HINTS ||
    taskIntent === Stage1TaskKind.ORDER_FOOD_SAFE_PREPARE ||
    taskIntent === Stage1TaskKind.DESCRIBE_IMAGE_OR_SCREEN
  ) {
    steps.push({
      type: Stage1ActionType.READ_VISIBLE_TEXT,
      label: "读取当前页面可见文字",
    });

    steps.push({
      type: Stage1ActionType.CAPTURE_SCREENSHOT,
      label: "截图当前页面",
    });
  }

  if (taskIntent === Stage1TaskKind.READ_VISIBLE_TEXT) {
    steps.push({
      type: Stage1ActionType.READ_VISIBLE_TEXT,
      label: "读取当前页面可见文字",
    });
  }

  if (
    taskIntent === Stage1TaskKind.FIND_INTERACTIVE_TARGETS ||
    taskIntent === Stage1TaskKind.FIND_COUPON_HINTS
  ) {
    steps.push({
      type: Stage1ActionType.FIND_INTERACTIVE_TARGETS,
      label: "查找按钮、输入框、链接和可点击入口",
    });
  }

  if (taskIntent === Stage1TaskKind.FIND_COUPON_HINTS) {
    steps.push({
      type: Stage1ActionType.SUMMARIZE_PAGE,
      label: "总结可能的优惠位置",
    });
  }

  if (taskIntent === Stage1TaskKind.ORDER_FOOD_SAFE_PREPARE) {
    steps.push({
      type: Stage1ActionType.SUMMARIZE_PAGE,
      label: "整理外卖页面可见信息，不能自动付款",
    });

    steps.push({
      type: Stage1ActionType.REQUIRE_CONFIRMATION,
      label: "如果进入下单、提交订单或付款，必须用户确认",
      action: {
        type: Stage1ActionType.SUBMIT_ORDER,
        label: "提交订单 / 付款前确认",
        platform: "外卖平台",
      },
    });
  }

  return {
    intent: taskIntent,
    userText: text,
    steps: dedupeSteps(steps),
  };
}

function dedupeSteps(steps) {
  const result = [];
  const seen = new Set();

  for (const step of steps) {
    const key = `${step.type}:${step.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(step);
  }

  return result;
}

function inferHighRiskActionType(text) {
  if (/付款|支付|提交订单|下单|购买/.test(text)) return Stage1ActionType.SUBMIT_ORDER;
  if (/发布|发到抖音|发到快手|发到小红书/.test(text)) return Stage1ActionType.PUBLISH_CONTENT;
  if (/上架|提交审核/.test(text)) return Stage1ActionType.LIST_PRODUCT;
  if (/下架/.test(text)) return Stage1ActionType.DELIST_PRODUCT;
  if (/改价格|修改价格/.test(text)) return Stage1ActionType.CHANGE_PRICE;
  if (/改库存|修改库存/.test(text)) return Stage1ActionType.CHANGE_INVENTORY;
  if (/删除/.test(text)) return Stage1ActionType.DELETE_CONTENT;
  if (/验证码/.test(text)) return Stage1ActionType.ENTER_VERIFICATION_CODE;
  if (/支付密码/.test(text)) return Stage1ActionType.ENTER_PAYMENT_PASSWORD;
  if (/密码/.test(text)) return Stage1ActionType.ENTER_PASSWORD;
  if (/登录/.test(text)) return Stage1ActionType.LOGIN;
  if (/评论|公屏/.test(text)) return Stage1ActionType.SEND_COMMENT;
  if (/私信/.test(text)) return Stage1ActionType.SEND_PRIVATE_MESSAGE;
  return Stage1ActionType.REQUIRE_CONFIRMATION;
}
