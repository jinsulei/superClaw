import { getStage3PlatformConfig, isShopPlatform, listStage3Platforms } from "./platform-config.js";
import { buildStage3PlatformDraft } from "./draft-builder.js";
import { detectStage3Intent, extractKeywordHints, extractLocalFilePaths, extractProductName } from "./input-parser.js";
import { Stage3ActionType, Stage3TaskKind } from "./types.js";

export function buildStage3Plan({
  userText = "",
  intent,
  platforms,
  mediaFiles,
  product,
  keywords,
  stage2Draft = null,
} = {}) {
  const text = String(userText || "");
  const detected = detectStage3Intent(text);

  if (!detected.matched) {
    return {
      matched: false,
      unsafe: false,
      intent: null,
      reason: detected.reason,
      steps: [],
      platformPlans: [],
    };
  }

  const requestedPlatforms = listStage3Platforms(platforms?.length ? platforms : detected.platforms);
  const files = mediaFiles?.length ? mediaFiles : detected.mediaFiles || extractLocalFilePaths(text);
  const productName = product || extractProductName(text);
  const keywordList = keywords?.length ? keywords : extractKeywordHints(text);
  const taskIntent = intent || detected.intent || inferIntentFromPlatforms(requestedPlatforms);

  if (detected.unsafe) {
    return {
      matched: true,
      unsafe: true,
      intent: taskIntent,
      reason: detected.reason,
      platforms: requestedPlatforms,
      mediaFiles: files,
      mediaType: detected.mediaType,
      steps: [
        {
          type: Stage3ActionType.STATUS,
          label: "拦截最终发布/上架请求",
          content: "第三阶段只能准备到最终按钮前，不能自动发布、提交审核或上架。",
        },
      ],
      platformPlans: [],
    };
  }

  const platformPlans = requestedPlatforms.map((platform) =>
    buildSinglePlatformPlan({
      platform,
      userText: text,
      mediaFiles: files,
      mediaType: detected.mediaType,
      product: productName,
      keywords: keywordList,
      stage2Draft,
    }),
  ).filter(Boolean);

  return {
    matched: true,
    unsafe: false,
    intent: taskIntent,
    reason: detected.reason,
    platforms: requestedPlatforms,
    mediaFiles: files,
    mediaType: detected.mediaType,
    product: productName,
    keywords: keywordList,
    steps: platformPlans.flatMap((plan) => plan.steps),
    platformPlans,
  };
}

function buildSinglePlatformPlan({ platform, userText, mediaFiles, mediaType, product, keywords, stage2Draft }) {
  const config = getStage3PlatformConfig(platform);
  if (!config) return null;

  const draft = buildStage3PlatformDraft({
    platform,
    query: userText,
    product,
    keywords,
    stage2Draft,
  });
  const steps = [];

  steps.push({
    type: Stage3ActionType.STATUS,
    platform,
    platformLabel: config.label,
    label: `准备${config.label}`,
    content: `开始准备${config.label}，本阶段只填资料并停在最终按钮前。`,
  });

  if (config.publishUrl) {
    steps.push({
      type: Stage3ActionType.OPEN_PLATFORM_PAGE,
      platform,
      platformLabel: config.label,
      url: config.publishUrl,
      label: `打开${config.label}发布/编辑页`,
    });
  } else {
    steps.push({
      type: Stage3ActionType.STATUS,
      platform,
      platformLabel: config.label,
      missingUrl: true,
      label: `${config.label}发布入口未配置`,
      content: `${config.label}发布/商品编辑入口未配置；你可以先手动打开页面，我会继续尝试上传、填写并截图。`,
    });
  }

  steps.push({
    type: Stage3ActionType.READ_VISIBLE_TEXT,
    platform,
    platformLabel: config.label,
    label: `读取${config.label}页面文字`,
  });

  if (isShopPlatform(platform)) {
    steps.push(
      {
        type: Stage3ActionType.FILL_PRODUCT_IMAGES,
        platform,
        platformLabel: config.label,
        hints: config.uploadHints,
        files: mediaFiles,
        label: `上传${config.label}商品图`,
      },
      {
        type: Stage3ActionType.FILL_PRODUCT_TITLE,
        platform,
        platformLabel: config.label,
        hints: config.titleHints,
        value: draft.title,
        label: `填写${config.label}商品标题`,
      },
      {
        type: Stage3ActionType.FILL_PRODUCT_DESCRIPTION,
        platform,
        platformLabel: config.label,
        hints: config.descriptionHints,
        value: draft.description,
        label: `填写${config.label}商品详情`,
      },
      {
        type: Stage3ActionType.FILL_PRODUCT_SELLING_POINTS,
        platform,
        platformLabel: config.label,
        hints: config.tagHints,
        value: draft.sellingPoints.join("\n"),
        label: `填写${config.label}卖点`,
      },
      {
        type: Stage3ActionType.FILL_PRODUCT_KEYWORDS,
        platform,
        platformLabel: config.label,
        hints: config.tagHints,
        value: draft.productKeywords.join(" "),
        label: `填写${config.label}关键词`,
      },
      {
        type: Stage3ActionType.PRICE_INVENTORY_PLACEHOLDER,
        platform,
        platformLabel: config.label,
        label: "价格库存占位",
      },
    );
  } else {
    steps.push(
      {
        type: Stage3ActionType.UPLOAD_MEDIA,
        platform,
        platformLabel: config.label,
        hints: config.uploadHints,
        files: mediaFiles,
        label: `上传${config.label}素材`,
      },
      {
        type: Stage3ActionType.FILL_TITLE,
        platform,
        platformLabel: config.label,
        hints: config.titleHints,
        value: draft.title,
        label: `填写${config.label}标题`,
      },
      {
        type: Stage3ActionType.FILL_DESCRIPTION,
        platform,
        platformLabel: config.label,
        hints: config.descriptionHints,
        value: draft.description,
        label: `填写${config.label}简介/正文`,
      },
      {
        type: Stage3ActionType.FILL_TAGS,
        platform,
        platformLabel: config.label,
        hints: config.tagHints,
        value: draft.tags.join(" "),
        label: `填写${config.label}标签/话题`,
      },
      {
        type: Stage3ActionType.SELECT_COVER_PLACEHOLDER,
        platform,
        platformLabel: config.label,
        hints: config.coverHints,
        label: "封面选择占位",
      },
    );
  }

  steps.push(
    {
      type: Stage3ActionType.CAPTURE_PREVIEW,
      platform,
      platformLabel: config.label,
      label: `截图${config.label}最终操作前页面`,
    },
    {
      type: Stage3ActionType.STOP_BEFORE_FINAL_SUBMIT,
      platform,
      platformLabel: config.label,
      hints: config.finalButtonHints,
      label: `停在${config.label}最终按钮前`,
    },
    {
      type: Stage3ActionType.CREATE_PREP_CARD,
      platform,
      platformLabel: config.label,
      label: `生成${config.label}准备卡`,
    },
    {
      type: Stage3ActionType.CREATE_CONFIRMATION_CARD,
      platform,
      platformLabel: config.label,
      label: `生成${config.label}确认卡`,
    },
  );

  return {
    platform,
    platformLabel: config.label,
    kind: config.kind,
    config,
    mediaFiles,
    mediaType,
    draft,
    steps,
  };
}

function inferIntentFromPlatforms(platforms = []) {
  const hasShop = platforms.some((platform) => isShopPlatform(platform));
  const hasContent = platforms.some((platform) => !isShopPlatform(platform));
  if (hasShop && !hasContent) return Stage3TaskKind.PREPARE_PRODUCT_LISTING;
  if (hasContent && !hasShop) return Stage3TaskKind.PREPARE_CONTENT_POST;
  return Stage3TaskKind.PREPARE_MULTI_PLATFORM;
}
