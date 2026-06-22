export function isStage4DoudianListingEnabled() {
  return readBooleanEnv([
    "VITE_ENABLE_ECOMMERCE_STAGE4_DOUDIAN_LISTING",
    "VITE_ENABLE_ECOMMERCE_ASSISTANT",
  ]);
}

export function getDoudianProductCreateUrl() {
  return readEnv("VITE_STAGE4_DOUDIAN_PRODUCT_CREATE_URL") || "";
}

export function getDoudianProductManageUrl() {
  return readEnv("VITE_STAGE4_DOUDIAN_PRODUCT_MANAGE_URL") || "";
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
