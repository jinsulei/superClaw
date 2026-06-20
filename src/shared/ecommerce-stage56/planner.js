import { getStage56PlatformConfig, listStage56Platforms } from "./platform-config.js";
import { parsePatrolOptions, detectStage56Intent } from "./video-patrol.js";
import { Stage56ActionType, Stage56TaskKind } from "./types.js";

export function buildStage56Plan({
  userText = "",
  intent = null,
  platforms = null,
} = {}) {
  const text = String(userText || "");
  const detected = detectStage56Intent(text);

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
      intent: detected.intent,
      platforms: detected.platforms,
      steps: [
        {
          type: Stage56ActionType.STATUS,
          label: "拦截自动互动/下载/发布请求",
          content: "第五/第六阶段不会自动评论、发送、点赞、关注、私信、下载或发布。",
        },
      ],
    };
  }

  const taskIntent = intent || detected.intent;
  const selectedPlatforms = listStage56Platforms(platforms?.length ? platforms : detected.platforms);

  if (taskIntent === Stage56TaskKind.LIVE_COMMENT_ASSIST) {
    return {
      matched: true,
      unsafe: false,
      reason: detected.reason,
      intent: taskIntent,
      platforms: selectedPlatforms,
      steps: [
        { type: Stage56ActionType.CAPTURE_LIVE_SCREEN, label: "截图直播间" },
        { type: Stage56ActionType.READ_LIVE_VISIBLE_TEXT, label: "读取直播间可见文字" },
        { type: Stage56ActionType.OCR_LIVE_SCREENSHOT, label: "OCR 直播截图" },
        { type: Stage56ActionType.EXTRACT_LIVE_COMMENTS, label: "提取公屏问题" },
        { type: Stage56ActionType.CLASSIFY_LIVE_COMMENTS, label: "分类公屏问题" },
        { type: Stage56ActionType.GENERATE_LIVE_REPLIES, label: "生成回复话术" },
        { type: Stage56ActionType.FILL_LIVE_REPLY_DRAFT, label: "填入回复草稿但不发送" },
        { type: Stage56ActionType.STOP_BEFORE_SEND_LIVE_REPLY, label: "发送前停止并确认" },
      ],
    };
  }

  const options = parsePatrolOptions(text);
  const steps = selectedPlatforms.flatMap((platform) => {
    const config = getStage56PlatformConfig(platform);
    return [
      {
        type: Stage56ActionType.OPEN_VIDEO_PLATFORM,
        platform,
        platformLabel: config?.label || platform,
        searchUrl: config?.searchUrl || "",
        missingUrl: !config?.searchUrl,
        label: `打开${config?.label || platform}搜索页`,
      },
      {
        type: Stage56ActionType.SEARCH_VIDEO_KEYWORD,
        platform,
        platformLabel: config?.label || platform,
        hints: config?.searchBoxHints || ["搜索"],
        keywords: options.keywords,
        label: `搜索${config?.label || platform}关键词`,
      },
      {
        type: Stage56ActionType.READ_VIDEO_PAGE,
        platform,
        platformLabel: config?.label || platform,
        label: "读取视频页面",
      },
      {
        type: Stage56ActionType.CAPTURE_VIDEO_SCREENSHOT,
        platform,
        platformLabel: config?.label || platform,
        label: "截图视频页面",
      },
      {
        type: Stage56ActionType.EXTRACT_VIDEO_CANDIDATES,
        platform,
        platformLabel: config?.label || platform,
        label: "提取候选视频",
      },
      {
        type: Stage56ActionType.SCORE_VIDEO_CANDIDATES,
        platform,
        platformLabel: config?.label || platform,
        label: "候选视频评分",
      },
      {
        type: Stage56ActionType.SEND_VIDEO_TO_HERMES,
        platform,
        platformLabel: config?.label || platform,
        label: "交给 Hermes 拆解",
      },
      {
        type: Stage56ActionType.SAVE_TO_MATERIAL_LIBRARY,
        platform,
        platformLabel: config?.label || platform,
        label: "保存素材库记录",
      },
    ];
  });

  return {
    matched: true,
    unsafe: false,
    reason: detected.reason,
    intent: taskIntent,
    platforms: selectedPlatforms,
    options,
    steps,
  };
}
