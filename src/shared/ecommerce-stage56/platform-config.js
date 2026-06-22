import { getStage56SearchUrl } from "./feature-flag.js";
import { Stage56Platform } from "./types.js";

export const STAGE56_PLATFORM_CONFIG = Object.freeze({
  [Stage56Platform.DOUYIN]: Object.freeze({
    platform: Stage56Platform.DOUYIN,
    label: "抖音",
    searchUrlEnv: "VITE_STAGE56_DOUYIN_SEARCH_URL",
    searchBoxHints: ["搜索", "请输入关键词", "关键词"],
    liveCommentHints: ["公屏", "评论", "弹幕", "大家都在说"],
    replyInputHints: ["说点什么", "评论", "发送消息", "输入"],
    videoResultHints: ["视频", "点赞", "评论", "收藏", "分享"],
  }),
  [Stage56Platform.KUAISHOU]: Object.freeze({
    platform: Stage56Platform.KUAISHOU,
    label: "快手",
    searchUrlEnv: "VITE_STAGE56_KUAISHOU_SEARCH_URL",
    searchBoxHints: ["搜索", "请输入关键词"],
    liveCommentHints: ["公屏", "评论", "弹幕"],
    replyInputHints: ["说点什么", "评论", "输入"],
    videoResultHints: ["视频", "点赞", "评论", "收藏"],
  }),
  [Stage56Platform.XIAOHONGSHU]: Object.freeze({
    platform: Stage56Platform.XIAOHONGSHU,
    label: "小红书",
    searchUrlEnv: "VITE_STAGE56_XIAOHONGSHU_SEARCH_URL",
    searchBoxHints: ["搜索", "大家都在搜"],
    liveCommentHints: ["评论", "留言"],
    replyInputHints: ["评论", "说点什么"],
    videoResultHints: ["笔记", "点赞", "收藏", "评论"],
  }),
  [Stage56Platform.WECHAT_CHANNELS]: Object.freeze({
    platform: Stage56Platform.WECHAT_CHANNELS,
    label: "视频号",
    searchUrlEnv: "VITE_STAGE56_WECHAT_CHANNELS_SEARCH_URL",
    searchBoxHints: ["搜索", "请输入关键词"],
    liveCommentHints: ["评论", "公屏", "弹幕"],
    replyInputHints: ["评论", "说点什么", "输入"],
    videoResultHints: ["视频", "点赞", "评论", "转发"],
  }),
});

export function getStage56PlatformConfig(platform) {
  const key = String(platform || "").toLowerCase();
  const config = STAGE56_PLATFORM_CONFIG[key];
  if (!config) return null;

  return {
    ...config,
    searchUrl: getStage56SearchUrl(key),
  };
}

export function listStage56Platforms(platforms) {
  const values = Array.isArray(platforms) ? platforms : [platforms];
  const expanded = values.flatMap((platform) => {
    const key = String(platform || "").toLowerCase();

    if (key === Stage56Platform.ALL) {
      return [
        Stage56Platform.DOUYIN,
        Stage56Platform.KUAISHOU,
        Stage56Platform.XIAOHONGSHU,
        Stage56Platform.WECHAT_CHANNELS,
      ];
    }

    return [key];
  });

  return Array.from(
    new Set(
      expanded
        .map((platform) => String(platform || "").toLowerCase())
        .filter((platform) => STAGE56_PLATFORM_CONFIG[platform]),
    ),
  );
}

export function detectStage56Platforms(text = "") {
  const value = String(text || "");

  if (/全平台|所有平台|全部平台/.test(value)) {
    return listStage56Platforms([Stage56Platform.ALL]);
  }

  const platforms = [];

  if (/抖音|douyin/i.test(value)) platforms.push(Stage56Platform.DOUYIN);
  if (/快手|kuaishou/i.test(value)) platforms.push(Stage56Platform.KUAISHOU);
  if (/小红书|xiaohongshu|xhs/i.test(value)) platforms.push(Stage56Platform.XIAOHONGSHU);
  if (/视频号|微信视频号|wechat channels|channels/i.test(value)) platforms.push(Stage56Platform.WECHAT_CHANNELS);

  if (!platforms.length) platforms.push(Stage56Platform.DOUYIN);

  return Array.from(new Set(platforms));
}
