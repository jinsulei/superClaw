import { getDoudianProductCreateUrl, getDoudianProductManageUrl } from "./feature-flag.js";
import { detectStage4Intent } from "./input-parser.js";
import { Stage4ActionType, Stage4TaskKind } from "./types.js";

export function buildStage4Plan({
  userText = "",
  intent = null,
  images = null,
  detailImages = null,
  confirmedPriceInventory = false,
} = {}) {
  const text = String(userText || "");
  const detected = detectStage4Intent(text);

  if (!detected.matched) {
    return {
      matched: false,
      unsafe: false,
      reason: detected.reason,
      intent: null,
      steps: [],
    };
  }

  if (detected.unsafe) {
    return {
      matched: true,
      unsafe: true,
      reason: detected.reason,
      intent: null,
      steps: [
        {
          type: Stage4ActionType.STOP_BEFORE_SUBMIT_REVIEW,
          label: "用户请求自动提交审核/发布商品/上架，第四阶段禁止。",
        },
      ],
    };
  }

  const resolvedImages = images || detected.images || [];
  const resolvedDetailImages = detailImages || detected.detailImages || resolvedImages || [];
  const taskIntent = intent || detected.intent || Stage4TaskKind.PREPARE_DOUDIAN_LISTING;
  const createUrl = getDoudianProductCreateUrl();
  const manageUrl = getDoudianProductManageUrl();

  const steps = [
    {
      type: Stage4ActionType.STATUS,
      label: "准备抖店商品上架到提交审核前",
      content:
        "我会打开抖店商品页面、上传图片、填写标题和详情，但不会自动提交审核、发布商品或上架。",
    },
    {
      type: Stage4ActionType.OPEN_DOUDIAN_PRODUCT_PAGE,
      label: "打开抖店商品发布页面",
      createUrl,
      manageUrl,
      missingUrl: !createUrl && !manageUrl,
    },
    {
      type: Stage4ActionType.READ_VISIBLE_TEXT,
      label: "读取抖店页面状态",
    },
    {
      type: Stage4ActionType.ENTER_CREATE_PRODUCT_PAGE,
      label: "进入新增商品页面",
      enabled: !createUrl,
    },
    {
      type: Stage4ActionType.UPLOAD_PRODUCT_IMAGES,
      label: "上传商品主图/详情图",
      images: resolvedImages,
      detailImages: resolvedDetailImages,
      hints: ["上传主图", "商品主图", "上传图片", "详情图", "商品图片"],
    },
    {
      type: Stage4ActionType.FILL_PRODUCT_TITLE,
      label: "填写商品标题",
      hints: ["商品标题", "标题", "宝贝标题"],
    },
    {
      type: Stage4ActionType.FILL_PRODUCT_CATEGORY_PLACEHOLDER,
      label: "类目选择占位",
    },
    {
      type: Stage4ActionType.FILL_PRODUCT_DESCRIPTION,
      label: "填写商品详情",
      hints: ["商品详情", "详情描述", "详情页", "商品描述"],
    },
    {
      type: Stage4ActionType.FILL_PRODUCT_SELLING_POINTS,
      label: "填写商品卖点",
      hints: ["商品卖点", "卖点", "关键词", "营销卖点"],
    },
    {
      type: Stage4ActionType.FILL_PRODUCT_SPECS_PLACEHOLDER,
      label: "规格信息占位",
    },
    {
      type: Stage4ActionType.REQUIRE_PRICE_INVENTORY_CONFIRMATION,
      label: "价格库存确认",
    },
  ];

  if (confirmedPriceInventory) {
    steps.push({
      type: Stage4ActionType.FILL_PRICE_INVENTORY_AFTER_CONFIRMATION,
      label: "确认后填写价格库存",
      hints: ["价格", "售价", "库存", "数量"],
    });
  }

  steps.push(
    {
      type: Stage4ActionType.CAPTURE_LISTING_PREVIEW,
      label: "截图提交审核前页面",
    },
    {
      type: Stage4ActionType.STOP_BEFORE_SUBMIT_REVIEW,
      label: "停在提交审核/发布商品/立即上架按钮前",
      hints: ["提交审核", "发布商品", "立即上架", "提交"],
    },
    {
      type: Stage4ActionType.CREATE_LISTING_PREP_CARD,
      label: "生成抖店上架准备卡",
    },
    {
      type: Stage4ActionType.CREATE_SUBMIT_CONFIRMATION_CARD,
      label: "生成提交审核前确认卡",
    },
  );

  return {
    matched: true,
    unsafe: false,
    reason: detected.reason,
    intent: taskIntent,
    createUrl,
    manageUrl,
    images: resolvedImages,
    detailImages: resolvedDetailImages,
    confirmedPriceInventory,
    detected,
    steps,
  };
}
