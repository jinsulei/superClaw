export function isStage5LiveAssistEnabled() {
  return readBooleanEnv([
    "VITE_ENABLE_ECOMMERCE_STAGE5_LIVE_ASSIST",
    "VITE_ENABLE_ECOMMERCE_ASSISTANT",
  ]);
}

export function isStage6VideoPatrolEnabled() {
  return readBooleanEnv([
    "VITE_ENABLE_ECOMMERCE_STAGE6_VIDEO_PATROL",
    "VITE_ENABLE_ECOMMERCE_ASSISTANT",
  ]);
}

export function getStage56SearchUrl(platform) {
  const key = String(platform || "").toLowerCase();
  const envNameByPlatform = {
    douyin: "VITE_STAGE56_DOUYIN_SEARCH_URL",
    kuaishou: "VITE_STAGE56_KUAISHOU_SEARCH_URL",
    xiaohongshu: "VITE_STAGE56_XIAOHONGSHU_SEARCH_URL",
    wechat_channels: "VITE_STAGE56_WECHAT_CHANNELS_SEARCH_URL",
  };

  const envName = envNameByPlatform[key];
  if (!envName) return "";

  return readEnv(envName) || "";
}

function readBooleanEnv(names) {
  return names.some((name) => {
    const value = readEnv(name);
    return value === true || String(value).toLowerCase() === "true";
  });
}

function readEnv(name) {
  const values = [];

  try {
    values.push(import.meta.env?.[name]);
  } catch {
    // non-vite runtime
  }

  try {
    values.push(globalThis?.window?.SUPERCLAW_CONFIG?.[name]);
    values.push(globalThis?.window?.SUPERCLAW_CONFIG?.[toCamelCase(name)]);
  } catch {
    // non-browser runtime
  }

  try {
    if (typeof process !== "undefined") values.push(process.env?.[name]);
  } catch {
    // browser runtime
  }

  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toCamelCase(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/^vite_/, "")
    .replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}
