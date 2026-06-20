import { getTrendPlatformSource, Stage2Platform } from "./platform-sources.js";

const FALLBACK_TREND_URL_KEY = "VITE_STAGE2_TREND_SOURCE_URL";

export function isStage2LowRiskEnabled() {
  const values = [
    readValue("VITE_ENABLE_ECOMMERCE_STAGE2_LOW_RISK", "enableEcommerceStage2LowRisk"),
    readValue("VITE_ENABLE_ECOMMERCE_ASSISTANT", "enableEcommerceAssistant"),
  ];

  return values.some((value) => value === true || String(value).toLowerCase() === "true");
}

export function getStage2TrendSourceUrl() {
  return readValue(FALLBACK_TREND_URL_KEY, "stage2TrendSourceUrl") || "";
}

export function getStage2PlatformUrl(platform = Stage2Platform.GENERAL) {
  const source = getTrendPlatformSource(platform);
  const configured = readValue(source.envKey, source.configKey);
  return configured || getStage2TrendSourceUrl() || "";
}

function readValue(envKey, configKey) {
  const values = [];

  try {
    values.push(import.meta.env?.[envKey]);
  } catch {
    // non-vite runtime
  }

  try {
    values.push(globalThis?.window?.SUPERCLAW_CONFIG?.[configKey]);
  } catch {
    // non-browser runtime
  }

  try {
    if (typeof process !== "undefined") values.push(process.env?.[envKey]);
  } catch {
    // browser runtime
  }

  return values.find((value) => String(value || "").trim()) || "";
}
