#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const MARKER = 'SUPERCLAW_CDP_FILE_DROP'

function readArg(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : ''
}

function findSingleFile(dir, prefix) {
  const matches = fs.readdirSync(dir)
    .filter(name => name.startsWith(prefix) && name.endsWith('.js'))
    .map(name => path.join(dir, name))
  if (matches.length !== 1) {
    throw new Error(`Expected one ${prefix}*.js in ${dir}, found ${matches.length}`)
  }
  return matches[0]
}

function findFileContaining(dir, prefix, needle) {
  const matches = fs.readdirSync(dir)
    .filter(name => name.startsWith(prefix) && name.endsWith('.js'))
    .map(name => path.join(dir, name))
    .filter(filePath => fs.readFileSync(filePath, 'utf8').includes(needle))
  if (matches.length !== 1) {
    throw new Error(`Expected one ${prefix}*.js containing ${needle} in ${dir}, found ${matches.length}`)
  }
  return matches[0]
}

function replaceOnce(source, needle, replacement, label) {
  const count = source.split(needle).length - 1
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`)
  return source.replace(needle, replacement)
}

function patchFile(filePath, transform) {
  const source = fs.readFileSync(filePath, 'utf8')
  if (source.includes(MARKER)) return false
  const patched = transform(source)
  if (patched === source || !patched.includes(MARKER)) {
    throw new Error(`Patch did not apply to ${filePath}`)
  }
  fs.writeFileSync(filePath, patched, 'utf8')
  return true
}

function patchSchema(source) {
  source = replaceOnce(
    source,
    'const BROWSER_SNAPSHOT_MODES = ["efficient"];',
    'const BROWSER_SNAPSHOT_MODES = ["efficient"];\nconst BROWSER_UPLOAD_MODES = ["auto", "input", "drop"]; // SUPERCLAW_CDP_FILE_DROP',
    'browser upload mode enum',
  )
  return replaceOnce(
    source,
    '\tinputRef: Type.Optional(Type.String()),',
    '\tinputRef: Type.Optional(Type.String()),\n\tuploadMode: optionalStringEnum(BROWSER_UPLOAD_MODES),',
    'browser upload mode schema',
  )
}

function patchPluginService(source) {
  source = replaceOnce(
    source,
    '\t\t\t\t\tconst element = readStringParam(params, "element");\n\t\t\t\t\tconst { targetId, timeoutMs } = readOptionalTargetAndTimeout(params);',
    '\t\t\t\t\tconst element = readStringParam(params, "element");\n\t\t\t\t\tconst uploadMode = readStringParam(params, "uploadMode") || "auto"; // SUPERCLAW_CDP_FILE_DROP\n\t\t\t\t\tconst { targetId, timeoutMs } = readOptionalTargetAndTimeout(params);',
    'browser upload action parameters',
  )
  source = replaceOnce(
    source,
    '\t\t\t\t\t\t\telement,\n\t\t\t\t\t\t\ttargetId,\n\t\t\t\t\t\t\ttimeoutMs',
    '\t\t\t\t\t\t\telement,\n\t\t\t\t\t\t\tuploadMode,\n\t\t\t\t\t\t\ttargetId,\n\t\t\t\t\t\t\ttimeoutMs',
    'proxied browser upload body',
  )
  return replaceOnce(
    source,
    '\t\t\t\t\t\telement,\n\t\t\t\t\t\ttargetId,\n\t\t\t\t\t\ttimeoutMs,\n\t\t\t\t\t\tprofile',
    '\t\t\t\t\t\telement,\n\t\t\t\t\t\tuploadMode,\n\t\t\t\t\t\ttargetId,\n\t\t\t\t\t\ttimeoutMs,\n\t\t\t\t\t\tprofile',
    'direct browser upload body',
  )
}

function patchRoutes(source) {
  source = replaceOnce(
    source,
    '\t\tconst element = toStringOrEmpty(body.element) || void 0;\n\t\tconst paths = toStringArray(body.paths) ?? [];',
    '\t\tconst element = toStringOrEmpty(body.element) || void 0;\n\t\tconst uploadMode = toStringOrEmpty(body.uploadMode) || "auto"; // SUPERCLAW_CDP_FILE_DROP\n\t\tconst paths = toStringArray(body.paths) ?? [];',
    'file chooser route upload mode',
  )
  source = replaceOnce(
    source,
    '\t\tif (!paths.length) return jsonError(res, 400, "paths are required");',
    '\t\tif (!paths.length) return jsonError(res, 400, "paths are required");\n\t\tif (!["auto", "input", "drop"].includes(uploadMode)) return jsonError(res, 400, "uploadMode must be auto, input, or drop");',
    'file chooser upload mode validation',
  )
  source = replaceOnce(
    source,
    '\t\t\t\tif (getBrowserProfileCapabilities(profileCtx.profile).usesChromeMcp) {\n\t\t\t\t\tif (element) return jsonError(res, 501, EXISTING_SESSION_LIMITS.hooks.uploadElement);',
    '\t\t\t\tif (getBrowserProfileCapabilities(profileCtx.profile).usesChromeMcp) {\n\t\t\t\t\tif (uploadMode === "drop") return jsonError(res, 501, "CDP drag-and-drop upload is unavailable for existing-session profiles; use uploadMode=input with a file input reference");\n\t\t\t\t\tif (element) return jsonError(res, 501, EXISTING_SESSION_LIMITS.hooks.uploadElement);',
    'existing session upload capability guard',
  )
  return replaceOnce(
    source,
    '\t\t\t\tif (inputRef || element) {\n\t\t\t\t\tif (ref) return jsonError(res, 400, "ref cannot be combined with inputRef/element");\n\t\t\t\t\tawait pw.setInputFilesViaPlaywright({',
    '\t\t\t\tif (uploadMode === "drop") {\n\t\t\t\t\tif (inputRef) return jsonError(res, 400, "inputRef is not valid for uploadMode=drop; use ref or element");\n\t\t\t\t\tif (!ref && !element) return jsonError(res, 400, "ref or element is required for uploadMode=drop");\n\t\t\t\t\tawait pw.dropFilesViaCdp({\n\t\t\t\t\t\tcdpUrl,\n\t\t\t\t\t\ttargetId: tab.targetId,\n\t\t\t\t\t\tref,\n\t\t\t\t\t\telement,\n\t\t\t\t\t\tpaths: resolvedPaths\n\t\t\t\t\t});\n\t\t\t\t} else if (inputRef || element) {\n\t\t\t\t\tif (ref) return jsonError(res, 400, "ref cannot be combined with inputRef/element");\n\t\t\t\t\tawait pw.setInputFilesViaPlaywright({',
    'CDP file drop route',
  )
}

function patchPlaywright(source) {
  const implementation = `async function dropFilesViaCdp(opts) {\n\tconst page = await getPageForTargetId(opts);\n\tensurePageState(page);\n\trestoreRoleRefsForTarget({\n\t\tcdpUrl: opts.cdpUrl,\n\t\ttargetId: opts.targetId,\n\t\tpage\n\t});\n\tif (!opts.paths.length) throw new Error("paths are required");\n\tconst ref = normalizeOptionalString(opts.ref) ?? "";\n\tconst element = normalizeOptionalString(opts.element) ?? "";\n\tif (ref && element) throw new Error("ref and element are mutually exclusive");\n\tif (!ref && !element) throw new Error("ref or element is required");\n\tconst resolvedResult = await resolveStrictExistingUploadPaths({ requestedPaths: opts.paths });\n\tif (!resolvedResult.ok) throw new Error(resolvedResult.error);\n\tconst locator = ref ? refLocator(page, ref) : page.locator(element).first();\n\tconst box = await locator.boundingBox();\n\tif (!box) throw new Error("Upload drop target is not visible");\n\tconst x = box.x + box.width / 2;\n\tconst y = box.y + box.height / 2;\n\tconst files = resolvedResult.paths;\n\tconst data = {\n\t\titems: files.map((filePath) => ({\n\t\t\tmimeType: "application/octet-stream",\n\t\t\tdata: "",\n\t\t\ttitle: path.basename(filePath),\n\t\t\tbaseURL: ""\n\t\t})),\n\t\tfiles,\n\t\tdragOperationsMask: 1\n\t};\n\tawait withPlaywrightPageCdpSession(page, async (session) => {\n\t\tfor (const type of ["dragEnter", "dragOver", "drop"]) {\n\t\t\tawait session.send("Input.dispatchDragEvent", { type, x, y, data });\n\t\t}\n\t});\n}\n// SUPERCLAW_CDP_FILE_DROP\n`
  source = replaceOnce(
    source,
    'async function setInputFilesViaPlaywright(opts) {',
    `${implementation}async function setInputFilesViaPlaywright(opts) {`,
    'CDP file drop implementation',
  )
  return replaceOnce(
    source,
    'export { armDialogViaPlaywright, armFileUploadViaPlaywright,',
    'export { armDialogViaPlaywright, armFileUploadViaPlaywright, dropFilesViaCdp,',
    'CDP file drop export',
  )
}

const root = path.resolve(readArg('--runtime-root') || 'src-tauri/resources/runtime/openclaw')
const dist = path.join(root, 'node_modules', '@qingchencloud', 'openclaw-zh', 'dist')
if (!fs.existsSync(dist)) throw new Error(`OpenClaw runtime dist not found: ${dist}`)

const patches = [
  [findFileContaining(dist, 'browser-tool.schema-', 'const BROWSER_TOOL_ACTIONS = ['), patchSchema],
  [findFileContaining(dist, 'plugin-service-', 'case "upload": {'), patchPluginService],
  [findFileContaining(dist, 'routes-', 'app.post("/hooks/file-chooser"'), patchRoutes],
  [findFileContaining(dist, 'pw-ai-', 'async function setInputFilesViaPlaywright(opts)'), patchPlaywright],
]

let changed = 0
for (const [filePath, transform] of patches) {
  if (patchFile(filePath, transform)) changed += 1
}
console.log(`[openclaw-upload-patch] ready (${changed} file${changed === 1 ? '' : 's'} updated): ${dist}`)
