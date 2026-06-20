export function isStage3PublishPrepEnabled() {
  return readBooleanEnv([
    "VITE_ENABLE_ECOMMERCE_STAGE3_PUBLISH_PREP",
    "VITE_ENABLE_ECOMMERCE_ASSISTANT",
  ]);
}

export function getStage3PublishUrl(platform) {
  const key = String(platform || "").toLowerCase();
  const envNameByPlatform = {
    douyin: "VITE_STAGE3_DOUYIN_PUBLISH_URL",
    kuaishou: "VITE_STAGE3_KUAISHOU_PUBLISH_URL",
    wechat_channels: "VITE_STAGE3_WECHAT_CHANNELS_PUBLISH_URL",
    xiaohongshu: "VITE_STAGE3_XIAOHONGSHU_PUBLISH_URL",
    tmall: "VITE_STAGE3_TMALL_PUBLISH_URL",
    taobao: "VITE_STAGE3_TAOBAO_PUBLISH_URL",
    pinduoduo: "VITE_STAGE3_PINDUODUO_PUBLISH_URL",
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
