export function isStage1DesktopAssistEnabled() {
  const values = [];

  try {
    values.push(import.meta.env?.VITE_ENABLE_STAGE1_DESKTOP_ASSIST);
    values.push(import.meta.env?.VITE_ENABLE_ECOMMERCE_ASSISTANT);
  } catch {
    // non-vite runtime
  }

  try {
    values.push(globalThis?.window?.SUPERCLAW_CONFIG?.enableStage1DesktopAssist);
    values.push(globalThis?.window?.SUPERCLAW_CONFIG?.enableEcommerceAssistant);
  } catch {
    // non-browser runtime
  }

  try {
    if (typeof process !== "undefined") {
      values.push(process.env.VITE_ENABLE_STAGE1_DESKTOP_ASSIST);
      values.push(process.env.VITE_ENABLE_ECOMMERCE_ASSISTANT);
    }
  } catch {
    // browser runtime
  }

  return values.some((value) => value === true || String(value).toLowerCase() === "true");
}
