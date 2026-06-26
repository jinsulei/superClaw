const PUBLISH_OR_LISTING_WORD_RE = /(?:\u53d1\u5e03|\u4e0a\u67b6|\u63d0\u4ea4\u5ba1\u6838|\u5546\u54c1\u53d1\u5e03|\u5546\u54c1\u4e0a\u67b6|\u65b0\u589e\u5546\u54c1|\u521b\u5efa\u5546\u54c1|\u53d1\u5230.{0,8}(?:\u6296\u97f3|\u5feb\u624b|\u5c0f\u7ea2\u4e66|\u89c6\u9891\u53f7|douyin|kuaishou|xiaohongshu|xhs))/i;
const PLATFORM_OR_COMMERCE_WORD_RE = /(?:\u7535\u5546|\u6296\u97f3|\u6296\u5e97|\u5feb\u624b|\u89c6\u9891\u53f7|\u5c0f\u7ea2\u4e66|\u6dd8\u5b9d|\u5929\u732b|\u62fc\u591a\u591a|douyin|doudian|kuaishou|xiaohongshu|xhs|taobao|tmall|pdd|ecommerce)/i;
const EXPLICIT_START_WORD_RE = /(?:\u5f00\u59cb|\u6267\u884c|\u542f\u52a8|\u8fdb\u5165|\u5e2e\u6211|\u8bf7|\u6211\u8981|\u51c6\u5907|\u505a\u4e00\u4e2a|\u7ed9\u6211\u505a)/i;
const EXPLICIT_ECOMMERCE_FLOW_RE = /(?:\u5f00\u59cb|\u6267\u884c|\u542f\u52a8|\u8fdb\u5165|\u51c6\u5907).{0,24}(?:\u7535\u5546|\u7535\u5546\s*1\.0\.2|ecommerce(?:\s+workflow)?|\u7535\u5546\u6d41\u7a0b|\u7535\u5546\u4efb\u52a1)/i;
const EXPLICIT_RESUME_RE = /(?:\u7ee7\u7eed|\u6062\u590d).{0,18}(?:\u7535\u5546|\u7535\u5546\u4efb\u52a1|\u7535\u5546\u6d41\u7a0b|ecommerce(?:\s+workflow)?|workflow)/i;
const WORKFLOW_ID_RE = /(?:workflow|task)[-_ ]?id\s*[:=]\s*[A-Za-z0-9:_-]{6,}/i;
const ANALYSIS_OR_TECH_QUESTION_RE = /(?:\u68c0\u6d4b|\u68c0\u67e5|\u6392\u67e5|\u4e3a\u4ec0\u4e48|\u600e\u4e48|\u8def\u5f84|\u94fe\u8def|\u5bf9\u8bdd\u6846|\u804a\u5929\u6846|\u8f93\u5165\u6846|\u56fe\u751f\u56fe|\u56fe\u7247\u8def\u5f84|Hermes|OpenClaw|Claude|UI|hook|workflow\s*\u8bef\u89e6\u53d1)/i;
const SOFT_COMMERCE_WORD_RE = /(?:\u56fe\u7247|\u4e0a\u4f20|\u8def\u5f84|\u5bf9\u8bdd\u6846|\u804a\u5929\u6846|\u56fe\u751f\u56fe|\u7d20\u6750|\u6807\u9898|\u7b80\u4ecb|\u6807\u7b7e|\u6296\u97f3|\u5546\u54c1|douyin)/i;

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isExplicitHermesEcommerceResumeIntent(userText = "") {
  const text = normalizeText(userText);
  return Boolean(text && (EXPLICIT_RESUME_RE.test(text) || WORKFLOW_ID_RE.test(text)));
}

export function isExplicitHermesEcommerceWorkflowIntent(userText = "") {
  const text = normalizeText(userText);
  if (!text) return false;
  if (isExplicitHermesEcommerceResumeIntent(text)) return true;
  if (EXPLICIT_ECOMMERCE_FLOW_RE.test(text)) return true;

  const hasExplicitStart = EXPLICIT_START_WORD_RE.test(text);
  const hasPublishOrListing = PUBLISH_OR_LISTING_WORD_RE.test(text);
  const hasPlatformOrCommerce = PLATFORM_OR_COMMERCE_WORD_RE.test(text);

  if (hasExplicitStart && hasPublishOrListing && hasPlatformOrCommerce) return true;
  if (hasPublishOrListing && hasPlatformOrCommerce && /(?:\u4f46|\u4e0d\u8981|\u53d1\u5e03\u524d|\u4e0a\u67b6\u524d|\u63d0\u4ea4\u524d|\u8ba9\u6211\u786e\u8ba4|\u786e\u8ba4\u524d)/.test(text)) return true;

  return false;
}

export function classifyHermesEcommerceWorkflowIntent(userText = "", options = {}) {
  const text = normalizeText(userText);
  const hasPendingEcommerceTask = Boolean(options.hasPendingEcommerceTask);
  const explicitResume = isExplicitHermesEcommerceResumeIntent(text);
  const explicitWorkflow = isExplicitHermesEcommerceWorkflowIntent(text);

  if (hasPendingEcommerceTask && !explicitResume) {
    return {
      allowed: false,
      reason: "PENDING_ECOMMERCE_REQUIRES_EXPLICIT_RESUME",
      pendingRequiresConfirmation: true,
    };
  }

  if (explicitWorkflow) {
    return {
      allowed: true,
      reason: explicitResume ? "EXPLICIT_ECOMMERCE_RESUME" : "EXPLICIT_ECOMMERCE_WORKFLOW",
      channel: "ecommerce-workflow",
    };
  }

  if (ANALYSIS_OR_TECH_QUESTION_RE.test(text)) {
    return {
      allowed: false,
      reason: "TECH_OR_PATH_QUESTION_STAYS_IN_CHAT",
      channel: "hermes-chat",
    };
  }

  if (SOFT_COMMERCE_WORD_RE.test(text)) {
    return {
      allowed: false,
      reason: "SOFT_COMMERCE_WORDS_REQUIRE_EXPLICIT_WORKFLOW",
      channel: "hermes-chat",
    };
  }

  return {
    allowed: false,
    reason: "NO_EXPLICIT_ECOMMERCE_WORKFLOW",
    channel: "hermes-chat",
  };
}

export function shouldRunHermesEcommerceWorkflow(userText = "", options = {}) {
  return classifyHermesEcommerceWorkflowIntent(userText, options).allowed;
}
