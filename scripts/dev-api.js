/**
 * ClawPanel 开发模式 API 插件
 * 在 Vite 开发服务器上提供真实 API 端点，替代 mock 数据
 * 使浏览器模式能真正管理 OpenClaw 实例
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { homedir, networkInterfaces } from 'os'
import { execSync, spawn, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import net from 'net'
import http from 'http'
import https from 'https'
import crypto from 'crypto'
import * as skillhubSdk from './lib/skillhub-sdk.js'
import {
  assertDirectModelConfigWritable,
  getEffectiveModelConfig,
} from './lib/model-config-source-guard.mjs'
import { getRuntimeMode } from './lib/runtime-mode.mjs'
import { readYyapiConfig, yyapiRelaySummary } from './lib/yyapi-config.mjs'
import {
  activateAuthSession,
  getAuthStatus,
  loginAuthSession,
  logoutAuthSession,
} from './lib/auth-session.mjs'
import { getAuthGuardDecision } from './lib/auth-guard.mjs'
import {
  DEFAULT_MODEL_PROVIDER_PROFILE_ID,
  buildOpenClawProviderConfig,
  envForProviderProfile,
  getModelProviderProfile,
  hermesProviderIdForProfile,
  managedEnvKeysForProviderProfile,
  modelDefinitionForProfile,
  modelRefForProfile,
  normalizeProviderProfileConfig,
  openClawProviderIdForProfile,
  providerProfileForBaseUrl,
} from '../src/lib/model-provider-profiles.js'
import { sanitizeMediaVisibleText } from '../src/shared/chat-output-guard.js'
import {
  buildAgentIdentitySystemPrompt,
  guardAgentIdentityReply,
  normalizeAgentIdentityName,
} from '../src/shared/agent-identity-guard.js'
const DOCKER_TASK_TIMEOUT_MS = 10 * 60 * 1000

function resolveAgentIdentityName(input, fallback = 'hermes') {
  return normalizeAgentIdentityName(input) || normalizeAgentIdentityName(fallback) || fallback
}

function withAgentIdentityInstructions(instructions, agentName) {
  const identityPrompt = buildAgentIdentitySystemPrompt(agentName)
  const base = typeof instructions === 'string' ? instructions.trim() : ''
  if (!identityPrompt) return base
  if (!base) return identityPrompt
  if (base.includes(identityPrompt)) return base
  return `${identityPrompt}\n\n${base}`
}

function sanitizeAgentIdentityOutput(text, agentName, userText) {
  return guardAgentIdentityReply({
    agentName,
    userText,
    assistantText: text,
  })
}

// ---------------------------------------------------------------------------
// Hermes Agent// ---------------------------------------------------------------------------
// Hermes Agent — 路径 / 工具函数
// ---------------------------------------------------------------------------
const HERMES_DEFAULT_PORT = 8642

function hermesHome() {
  // 1. 环境变量优先
  if (process.env.HERMES_HOME) return process.env.HERMES_HOME
  // 2. Dev/Tauri source tree: <app_root>/src-tauri/resources/data/hermes/
  const devPath = path.join(appRootDir(), 'src-tauri', 'resources', 'data', 'hermes')
  if (fs.existsSync(devPath)) return devPath
  // 3. 新便携结构：<app_root>/resources/data/hermes/
  const newPath = path.join(appRootDir(), 'resources', 'data', 'hermes')
  if (fs.existsSync(newPath)) return newPath
  // 4. 旧便携/Dev：<app_root>/data/hermes/
  return path.join(appRootDir(), 'data', 'hermes')
}

/** Resolve memory kind (memory|user|soul) to the file Hermes reads on startup. */
function hermesMemoryFilePath(kind) {
  const home = hermesHome()
  switch (kind) {
    case 'memory': return path.join(home, 'memories', 'MEMORY.md')
    case 'user':   return path.join(home, 'memories', 'USER.md')
    case 'soul':   return path.join(home, 'SOUL.md')
    default:       return null
  }
}

/** 应用根目录（Vite dev: 项目根目录，便携: exe 所在目录） */
function appRootDir() {
  return process.cwd()
}

function envFlag(name) {
  const value = String(process.env[name] || '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(value)
}

function isServerTestBuild() {
  return envFlag('SUPERCLAW_TEST_BUILD') || envFlag('VITE_SUPERCLAW_TEST_BUILD')
}

function isPathInside(parent, child) {
  const parentPath = path.resolve(parent)
  const childPath = path.resolve(child)
  return childPath === parentPath || childPath.startsWith(parentPath + path.sep)
}

const HERMES_MEDIA_EXTENSIONS = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
])

function normalizeLocalMediaPath(input) {
  let value = String(input || '').trim().replace(/^["']|["']$/g, '')
  if (/^file:\/\//i.test(value)) {
    value = value.replace(/^file:\/\//i, '')
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(value)) value = value.slice(1)
    try { value = decodeURIComponent(value) } catch {}
  }
  return path.resolve(value)
}

function hermesMediaRoots() {
  const roots = [
    path.join(appRootDir(), 'src-tauri', 'resources', 'data', 'generated'),
    path.join(appRootDir(), 'resources', 'data', 'generated'),
    path.join(OPENCLAW_DIR, 'clawpanel', 'images'),
    path.join(hermesHome(), 'generated'),
    path.join(hermesHome(), 'image_cache'),
  ]
  return Array.from(new Set(roots.map(root => path.resolve(root))))
}

function readHermesMediaImageDataUrl(rawPath) {
  if (!rawPath) throw new Error('MEDIA path is required')
  const filePath = normalizeLocalMediaPath(rawPath)
  const ext = path.extname(filePath).toLowerCase()
  const mime = HERMES_MEDIA_EXTENSIONS.get(ext)
  if (!mime) throw new Error(`Unsupported MEDIA image type: ${ext || '(none)'}`)
  if (!fs.existsSync(filePath)) throw new Error(`MEDIA file not found: ${rawPath}`)
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error(`MEDIA path is not a file: ${rawPath}`)
  if (stat.size > 20 * 1024 * 1024) throw new Error('MEDIA image is larger than 20MB')
  const allowed = hermesMediaRoots().some(root => isPathInside(root, filePath))
  if (!allowed) throw new Error('MEDIA image path is outside allowed Hermes generated directories')
  const b64 = fs.readFileSync(filePath).toString('base64')
  return `data:${mime};base64,${b64}`
}

function isHermesMediaRouteTraversal(routePath) {
  const normalized = path.normalize(String(routePath || '').replace(/\\/g, '/'))
  return normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')
}

function resolveHermesMediaRoutePath(routePath) {
  let value = String(routePath || '').trim()
  if (!value) throw new Error('MEDIA route path is required')
  try { value = decodeURIComponent(value) } catch {}
  value = value.replace(/^["']|["']$/g, '')
  if (!value || value.includes('\0')) throw new Error('Invalid MEDIA route path')
  if (isHermesMediaRouteTraversal(value)) throw new Error('MEDIA route path traversal is not allowed')
  if (/^file:\/\//i.test(value) || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    return normalizeLocalMediaPath(value)
  }
  const relativePath = path.normalize(value)
  if (path.isAbsolute(relativePath) || isHermesMediaRouteTraversal(relativePath)) {
    throw new Error('MEDIA route path traversal is not allowed')
  }
  const roots = hermesMediaRoots()
  for (const root of roots) {
    const candidate = path.resolve(root, relativePath)
    if (isPathInside(root, candidate) && fs.existsSync(candidate)) return candidate
  }
  return path.resolve(roots[0], relativePath)
}

function sendHermesMediaFileResponse(req, res, url) {
  const prefix = '/api/hermes/media/file/'
  if (req.method !== 'GET' || !url.pathname.startsWith(prefix)) return false
  try {
    const routePath = url.pathname.slice(prefix.length) || url.searchParams.get('path') || ''
    const filePath = resolveHermesMediaRoutePath(routePath)
    const dataUrl = readHermesMediaImageDataUrl(filePath)
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) throw new Error('MEDIA image route failed to encode image')
    res.statusCode = 200
    res.setHeader('Content-Type', match[1])
    res.setHeader('Cache-Control', 'no-store')
    res.end(Buffer.from(match[2], 'base64'))
  } catch (error) {
    const message = error?.message || String(error)
    const status = /not found|inaccessible|does not exist/i.test(message) ? 404 : 403
    sendJsonResponse(res, status, { error: message })
  }
  return true
}

function uvBinDir() {
  // 新结构优先：<app_root>/resources/bin/
  const newPath = path.join(appRootDir(), 'resources', 'bin')
  if (fs.existsSync(newPath)) return newPath
  // 回退：<app_root>/bin/（Dev 模式或旧/MSI 部署）
  return path.join(appRootDir(), 'bin')
}

// ---------------------------------------------------------------------------
// 便携模式路径工具
// ---------------------------------------------------------------------------

/** uv tool 安装目录 新结构: <app_root>/resources/uv-tools/  旧结构: <app_root>/uv-tools/ */
function uvToolDir() {
  const runtimePath = path.join(appRootDir(), 'resources', 'runtime', 'uv-tools')
  if (fs.existsSync(runtimePath)) return runtimePath
  const devRuntimePath = path.join(appRootDir(), 'src-tauri', 'resources', 'runtime', 'uv-tools')
  if (fs.existsSync(devRuntimePath)) return devRuntimePath
  const newPath = path.join(appRootDir(), 'resources', 'uv-tools')
  if (fs.existsSync(newPath)) return newPath
  return path.join(appRootDir(), 'uv-tools')
}

/** uv tool 安装的可执行文件目录 */
function uvToolBinDir() {
  return path.join(uvToolDir(), 'bin')
}

/** uv Python 安装缓存目录 新结构: <app_root>/resources/uv-python/  旧结构: <app_root>/uv-python/ */
function uvPythonDir() {
  const runtimePath = path.join(appRootDir(), 'resources', 'runtime', 'uv-python')
  if (fs.existsSync(runtimePath)) return runtimePath
  const devRuntimePath = path.join(appRootDir(), 'src-tauri', 'resources', 'runtime', 'uv-python')
  if (fs.existsSync(devRuntimePath)) return devRuntimePath
  const newPath = path.join(appRootDir(), 'resources', 'uv-python')
  if (fs.existsSync(newPath)) return newPath
  return path.join(appRootDir(), 'uv-python')
}

function existingPortableDirs(kind) {
  return [...new Set([
    path.join(appRootDir(), 'resources', 'runtime', kind),
    path.join(appRootDir(), 'src-tauri', 'resources', 'runtime', kind),
    path.join(appRootDir(), 'resources', kind),
    path.join(appRootDir(), 'src-tauri', 'resources', kind),
    path.join(appRootDir(), kind),
  ].map(p => path.resolve(p)))].filter(p => fs.existsSync(p))
}

function ocrResourcesDir() {
  const candidates = [
    path.join(appRootDir(), 'resources'),
    path.join(appRootDir(), 'src-tauri', 'resources'),
  ]
  return candidates.find(dir => fs.existsSync(path.join(dir, 'runtime', 'ocr', 'ocr-runner.cjs'))) || candidates[1]
}

function readOcrConfig() {
  const resDir = ocrResourcesDir()
  const configPath = path.join(resDir, 'data', 'ocr', 'ocr-config.json')
  const fallback = {
    ocr: {
      enabled: true,
      offline: true,
      lazyLoad: true,
      engine: 'tesseract.js',
      languages: ['eng', 'chi_sim'],
      defaultLanguage: 'eng+chi_sim',
      timeoutMs: 30000,
      maxImageSize: 4096,
      failSafe: true,
      sharedForAgents: ['hermes', 'openclaw', 'claude_code'],
      runtimePath: 'runtime/ocr',
      languagePath: 'runtime/ocr/tessdata',
    },
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (parsed?.ocr) return parsed
  } catch {}
  return fallback
}

function ocrFail(sourceType, sourcePath, error) {
  return {
    ok: false,
    error: String(error || 'OCR failed'),
    recoverable: true,
    source: { type: sourceType || 'image', path: sourcePath || '' },
  }
}

function runOcrRunner(request = {}) {
  const root = readOcrConfig()
  const cfg = root.ocr || {}
  const sourceType = request.sourceType || 'image'
  const sourcePath = request.imagePath || ''
  if (cfg.enabled === false) return ocrFail(sourceType, sourcePath, 'OCR is disabled')
  const resDir = ocrResourcesDir()
  const runtimeDir = path.join(resDir, cfg.runtimePath || 'runtime/ocr')
  const runner = path.join(runtimeDir, 'ocr-runner.cjs')
  const tessdata = path.join(resDir, cfg.languagePath || 'runtime/ocr/tessdata')
  if (!fs.existsSync(runner)) return ocrFail(sourceType, sourcePath, 'OCR runner is missing')
  if (!fs.existsSync(path.join(tessdata, 'eng.traineddata.gz')) || !fs.existsSync(path.join(tessdata, 'chi_sim.traineddata.gz'))) {
    return ocrFail(sourceType, sourcePath, 'OCR language data is missing')
  }
  if (request.imagePath && fs.existsSync(request.imagePath)) {
    const stat = fs.statSync(request.imagePath)
    const maxBytes = Number(cfg.maxImageSize || 4096) * Number(cfg.maxImageSize || 4096) * 4
    if (maxBytes > 0 && stat.size > maxBytes) return ocrFail(sourceType, sourcePath, 'image is larger than OCR maxImageSize budget')
  }
  const payload = {
    imagePath: request.imagePath || null,
    imageData: request.imageData || null,
    mimeType: request.mimeType || null,
      sourceType,
    language: request.language || cfg.defaultLanguage || 'eng+chi_sim',
    defaultLanguage: cfg.defaultLanguage || 'eng+chi_sim',
      agent: request.agent || 'openclaw',
    }
  const child = spawnSync(process.execPath, [runner], {
    cwd: runtimeDir,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: Number(request.timeoutMs || cfg.timeoutMs || 30000),
    windowsHide: true,
    env: { ...process.env, TESSDATA_PREFIX: tessdata, NO_UPDATE_NOTIFIER: '1' },
  })
  if (child.error) return ocrFail(sourceType, sourcePath, child.error.message)
  const out = String(child.stdout || '').trim()
  if (!out) return ocrFail(sourceType, sourcePath, String(child.stderr || 'OCR returned no output'))
  try { return JSON.parse(out) } catch (e) { return ocrFail(sourceType, sourcePath, `parse OCR output failed: ${e.message}`) }
}

function findHermesPythonHome(pythonRoot) {
  const direct = path.join(pythonRoot, 'python', isWindows ? 'python.exe' : 'bin/python')
  if (fs.existsSync(direct)) return path.dirname(direct)
  for (const entry of fs.readdirSync(pythonRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(pythonRoot, entry.name, isWindows ? 'python.exe' : 'bin/python')
    if (fs.existsSync(candidate)) return path.dirname(candidate)
  }
  return ''
}

function hermesPortablePython() {
  for (const root of existingPortableDirs('uv-python')) {
    const home = findHermesPythonHome(root)
    if (!home) continue
    const exe = path.join(home, isWindows ? 'python.exe' : 'bin/python')
    if (fs.existsSync(exe)) return exe
  }
  return ''
}

function hermesAgentSitePackages() {
  for (const root of existingPortableDirs('uv-tools')) {
    const site = path.join(root, 'hermes-agent', 'Lib', 'site-packages')
    if (fs.existsSync(path.join(site, 'hermes_cli'))) return site
  }
  return ''
}

function hermesBundledRuntimeDir() {
  for (const root of [
    path.join(appRootDir(), 'resources', 'runtime', 'hermes-agent'),
    path.join(appRootDir(), 'src-tauri', 'resources', 'runtime', 'hermes-agent'),
    path.join(appRootDir(), 'resources', 'uv-tools', 'hermes-agent'),
    path.join(appRootDir(), 'src-tauri', 'resources', 'uv-tools', 'hermes-agent'),
  ]) {
    if (fs.existsSync(root)) return root
  }
  return ''
}

function hermesBundledExecutable() {
  const root = hermesBundledRuntimeDir()
  if (!root) return ''
  const candidates = isWindows
    ? [path.join(root, 'Scripts', 'hermes.exe'), path.join(root, 'Scripts', 'hermes-agent.exe')]
    : [path.join(root, 'bin', 'hermes'), path.join(root, 'bin', 'hermes-agent')]
  return candidates.find(candidate => fs.existsSync(candidate)) || ''
}

function hermesBundledPythonExecutable() {
  const root = hermesBundledRuntimeDir()
  if (!root) return ''
  const candidate = isWindows ? path.join(root, 'Scripts', 'python.exe') : path.join(root, 'bin', 'python')
  return fs.existsSync(candidate) ? candidate : ''
}

function isBadHermesLauncher(exePath) {
  if (!exePath) return false
  return exePath.replace(/\\/g, '/').toLowerCase().includes('/.local/bin/hermes.exe')
}

function hermesSystemExecutable() {
  const bundled = hermesBundledExecutable()
  if (bundled && !isBadHermesLauncher(bundled)) return bundled
  const error = new Error('HERMES_BUNDLED_RUNTIME_MISSING: bundled Hermes runtime is required for green/test builds.')
  error.code = 'HERMES_BUNDLED_RUNTIME_MISSING'
  throw error
}

function hermesCommandSpec(args = []) {
  patchHermesPyvenvCfgs()
  const env = hermesRuntimeEnv()
  const python = hermesBundledPythonExecutable()
  if (python) {
    return {
      command: python,
      args: ['-m', 'hermes_cli.main', ...args],
      env,
      cwd: hermesBundledRuntimeDir() || path.dirname(python),
    }
  }
  const executable = hermesSystemExecutable()
  return { command: executable, args, env, cwd: path.dirname(executable) }
}

function patchHermesPyvenvCfgs() {
  const toolRoots = existingPortableDirs('uv-tools')
  const pythonRoots = existingPortableDirs('uv-python')
  const pythonHome = pythonRoots.map(findHermesPythonHome).find(Boolean)
  if (!pythonHome) return
  const patchCfg = (cfgPath) => {
    if (!fs.existsSync(cfgPath)) return
    let content = fs.readFileSync(cfgPath, 'utf8')
    const nextLine = `home = ${pythonHome}`
    const newline = content.includes('\r\n') ? '\r\n' : '\n'
    const rest = content
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(line => {
        const trimmed = line.replace(/^\uFEFF/, '').trim()
        if (!trimmed) return true
        if (/^home\s*=/i.test(trimmed)) return false
        if (/uv-python[\\/]+python/i.test(trimmed)) return false
        return true
      })
    const nextContent = [nextLine, ...rest].join(newline).replace(/\s*$/, newline)
    if (content === nextContent) return
    fs.writeFileSync(cfgPath, nextContent, 'utf8')
  }
  for (const root of [
    hermesBundledRuntimeDir(),
    ...existingPortableDirs(path.join('runtime', 'hermes-agent')),
  ].filter(Boolean)) {
    patchCfg(path.join(root, 'pyvenv.cfg'))
  }
  for (const toolRoot of toolRoots) {
    for (const entry of fs.readdirSync(toolRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const cfgPath = path.join(toolRoot, entry.name, 'pyvenv.cfg')
      patchCfg(cfgPath)
    }
  }
}

// ---------------------------------------------------------------------------
// 预部署 bundle 支持（开箱即用）
// ---------------------------------------------------------------------------

/**
 * 查找预部署资源根目录（包含 uv-tools/ 子目录即视为预部署 bundle）
 * 查找顺序：src-tauri/resources/ → exe 同级 resources/
 * @returns {string|null}
 */
function bundledDeployDir() {
  // 1. Dev 模式：src-tauri/resources/
  const devDir = path.join(appRootDir(), 'src-tauri', 'resources')
  if (fs.existsSync(path.join(devDir, 'uv-tools'))) return devDir
  // 2. 便携/安装模式：exe 同级 resources/
  const portableDir = path.join(appRootDir(), 'resources')
  if (portableDir !== devDir && fs.existsSync(path.join(portableDir, 'uv-tools'))) return portableDir
  return null
}

/**
 * 递归复制目录
 * @param {string} src
 * @param {string} dst
 */
function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}

function hasVisibleEntries(dir) {
  try {
    return fs.readdirSync(dir).some(name => !String(name).startsWith('.'))
  } catch {
    return false
  }
}

function sameCanonicalDir(a, b) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b)
  } catch {
    return false
  }
}

function bundledSkillSources() {
  const root = appRootDir()
  return [
    path.join(root, 'resources', 'data', 'hermes-source', 'hermes-agent-main', 'skills'),
    path.join(root, 'resources', 'data', 'hermes', 'skills'),
    path.join(root, 'data', 'hermes-source', 'hermes-agent-main', 'skills'),
    path.join(root, 'data', 'hermes', 'skills'),
    path.join(root, 'src-tauri', 'resources', 'data', 'hermes-source', 'hermes-agent-main', 'skills'),
    path.join(root, 'src-tauri', 'resources', 'data', 'hermes', 'skills'),
  ]
}

function ensureBuiltinHermesSkills() {
  const target = path.join(hermesHome(), 'skills')
  const source = bundledSkillSources().find(candidate =>
    fs.existsSync(candidate) &&
    hasVisibleEntries(candidate) &&
    !sameCanonicalDir(candidate, target)
  )

  if (!source) {
    return { seeded: false, reason: 'source_not_found', target }
  }

  fs.mkdirSync(target, { recursive: true })
  let filesCopied = 0
  let filesSkipped = 0
  let dirsCreated = 0
  const copyMissing = (src, dst) => {
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(dst, { recursive: true })
      dirsCreated += 1
    }
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name)
      const dstPath = path.join(dst, entry.name)
      if (entry.isDirectory()) {
        copyMissing(srcPath, dstPath)
      } else if (!fs.existsSync(dstPath)) {
        fs.copyFileSync(srcPath, dstPath)
        filesCopied += 1
      } else {
        filesSkipped += 1
      }
    }
  }
  copyMissing(source, target)
  let categories = 0
  try { categories = fs.readdirSync(target).length } catch {}
  return {
    seeded: filesCopied > 0,
    merged: true,
    count: { categories, filesCopied, filesSkipped, dirsCreated },
    source,
    target,
  }
}

/**
 * 从内置资源复制预部署组件到应用根目录
 * 支持三种模式：
 *   1. 新便携模式（推荐）：组件统一在 app_root/resources/ 下，无需复制
 *   2. 旧便携模式（兼容）：组件在 app_root/ 下（遗留结构），无需复制
 *   3. Bundle 部署模式（MSI）：从 resources/ 复制到 appRoot/
 * @returns {boolean} true 表示组件就绪且 hermes 可用
 */
function setupFromBundle() {
  const appRoot = appRootDir()

  // 模式 1：新便携模式 — 组件统一在 resources/ 子目录下
  const resDir = path.join(appRoot, 'resources')
  if (fs.existsSync(path.join(resDir, 'uv-tools', 'hermes-agent')) && fs.existsSync(path.join(resDir, 'bin'))) {
    const result = runHermesSilent('hermes', ['version'])
    if (result.ok) {
      console.log(`[setupFromBundle] ✓ 新便携模式 Hermes Agent 就绪: ${result.output.trim()}`)
      return true
    }
    console.error('[setupFromBundle] ⚠ 新便携目录存在但 hermes 不可用，尝试旧结构')
  }

  // 模式 2：旧便携模式 — 组件直接放在 appRoot 下
  const hermesAgentDir = path.join(appRoot, 'uv-tools', 'hermes-agent')
  const binDir = path.join(appRoot, 'bin')
  if (fs.existsSync(hermesAgentDir) && fs.existsSync(binDir)) {
    const result = runHermesSilent('hermes', ['version'])
    if (result.ok) {
      console.log(`[setupFromBundle] ✓ 旧便携模式 Hermes Agent 就绪: ${result.output.trim()}`)
      return true
    }
    console.error('[setupFromBundle] ⚠ 旧便携目录存在但 hermes 不可用，尝试 bundle 部署')
  }

  // 模式 3：Bundle 部署模式 — 从 resources/ 复制到 appRoot/
  const bundledRoot = bundledDeployDir()
  if (!bundledRoot) return false

  console.log(`[setupFromBundle] 发现预部署 bundle: ${bundledRoot}`)

  // 1. 复制 uv-tools/
  const srcUvTools = path.join(bundledRoot, 'uv-tools')
  const dstUvTools = path.join(appRoot, 'uv-tools')
  if (fs.existsSync(srcUvTools) && !fs.existsSync(dstUvTools)) {
    try {
      copyDirRecursive(srcUvTools, dstUvTools)
      console.log('[setupFromBundle] ✓ uv-tools 已部署')
    } catch (e) {
      console.error(`[setupFromBundle] 复制 uv-tools 失败: ${e.message}`)
      return false
    }
  }

  // 2. 复制 uv-python/
  const srcUvPython = path.join(bundledRoot, 'uv-python')
  const dstUvPython = path.join(appRoot, 'uv-python')
  if (fs.existsSync(srcUvPython) && !fs.existsSync(dstUvPython)) {
    try {
      copyDirRecursive(srcUvPython, dstUvPython)
      console.log('[setupFromBundle] ✓ uv-python 已部署')
    } catch (e) {
      console.error(`[setupFromBundle] 复制 uv-python 失败: ${e.message}`)
    }
  }

  // 3. 复制 data/hermes/
  const srcHermes = path.join(bundledRoot, 'data', 'hermes')
  const dstHermes = path.join(appRoot, 'data', 'hermes')
  if (fs.existsSync(srcHermes) && !fs.existsSync(dstHermes)) {
    try {
      fs.mkdirSync(path.dirname(dstHermes), { recursive: true })
      copyDirRecursive(srcHermes, dstHermes)
      console.log('[setupFromBundle] ✓ data/hermes 已部署')
    } catch (e) {
      console.error(`[setupFromBundle] 复制 data/hermes 失败: ${e.message}`)
    }
  }

  // 4. 复制 bin/
  const srcBin = path.join(bundledRoot, 'bin')
  const dstBin = path.join(appRoot, 'bin')
  if (fs.existsSync(srcBin) && !fs.existsSync(dstBin)) {
    try {
      copyDirRecursive(srcBin, dstBin)
      console.log('[setupFromBundle] ✓ bin 已部署')
    } catch (e) {
      console.error(`[setupFromBundle] 复制 bin 失败: ${e.message}`)
      return false
    }
  }

  // 验证 hermes-agent 是否可用
  const result = runHermesSilent('hermes', ['version'])
  if (result.ok) {
    console.log(`[setupFromBundle] ✓ Hermes Agent 就绪: ${result.output.trim()}`)
    return true
  }

  console.error('[setupFromBundle] ⚠ hermes 命令不可用，将尝试正常安装')
  return false
}

/**
 * 准备 uv Python 缓存目录：清理 .temp/ 残留 + 尝试从本地压缩包预缓存 Python
 * @returns {string|null} 缓存目录路径，null 表示便携缓存不可用（使用 uv 默认 ~/.uv/python/）
 */
function prepareUvPythonDir() {
  const dir = uvPythonDir()
  // 清理上次失败残留的 .temp/ 目录（权限冲突常见原因）
  const tempDir = path.join(dir, '.temp')
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (e) {
      console.warn(`⚠️ .temp/ 清理失败 (继续使用便携缓存): ${e.message}`)
    }
  }
  // 确保目标目录存在（uv 会自动写入到此目录）
  try { fs.mkdirSync(dir, { recursive: true }) } catch { return null }
  // 尝试从本地 resources/cpython-*.tar.gz 预缓存 Python 解释器（避免网络下载）
  extractBundledPython(dir)
  return dir
}

/**
 * 查找内置 Python 压缩包路径
 * @returns {string|null}
 */
function bundledPythonArchivePath() {
  const searchDirs = []
  // 1. Dev 模式：src-tauri/resources/
  const devDir = path.join(appRootDir(), 'src-tauri', 'resources')
  searchDirs.push(devDir)
  // 2. 便携/安装模式：exe 同级 resources/
  const portableDir = path.join(appRootDir(), 'resources')
  if (portableDir !== devDir) searchDirs.push(portableDir)

  for (const d of searchDirs) {
    try {
      const entries = fs.readdirSync(d)
      for (const entry of entries) {
        if (entry.startsWith('cpython-') && entry.endsWith('.tar.gz')) {
          return path.join(d, entry)
        }
      }
    } catch {}
  }
  return null
}

/**
 * 在 UV_PYTHON_INSTALL_DIR 中查找本地缓存的 Python 3.11 可执行文件路径
 * @param {string} uvPythonDir
 * @returns {string|null}
 */
function findCachedPython(uvPythonDir) {
  try {
    const entries = fs.readdirSync(uvPythonDir)
    for (const e of entries) {
      const pythonExe = path.join(uvPythonDir, e, 'python.exe')
      if (fs.existsSync(pythonExe)) return pythonExe
    }
  } catch {}
  return null
}

/**
 * 从本地 resources/cpython-*.tar.gz 预缓存 Python 到 uv-python/ 目录
 * Windows: 优先使用 PowerShell 的 .NET System.Formats.Tar（比 tar.exe 可靠）
 * Unix: 使用系统 tar 命令
 * 这是 best-effort 操作，失败时 uv 会自动从网络下载
 * @param {string} targetDir - uv-python 目录路径
 */
function extractBundledPython(targetDir) {
  const archivePath = bundledPythonArchivePath()
  if (!archivePath) {
    console.log('[extractBundledPython] 未找到本地 Python 压缩包，将使用网络下载')
    return
  }
  console.log(`[extractBundledPython] 发现本地 Python 压缩包: ${archivePath}`)

  // 检查是否已解压
  try {
    const entries = fs.readdirSync(targetDir)
    for (const e of entries) {
      const pythonExe = path.join(targetDir, e, 'python.exe')
      if (fs.existsSync(pythonExe)) {
        console.log('[extractBundledPython] Python 已存在缓存目录中，跳过解压')
        return
      }
    }
  } catch { /* 目录可能还不存在 */ }

  // 确保目标目录存在
  try { fs.mkdirSync(targetDir, { recursive: true }) } catch { return }

  if (process.platform === 'win32') {
    // Windows：优先使用 PowerShell .NET API（比 tar.exe 更可靠地处理 cpython-standalone 目录结构）
    try {
      const psCode = [
        `$src = '${archivePath.replace(/'/g, "''")}'`,
        `$dest = '${targetDir.replace(/'/g, "''")}'`,
        'Add-Type -AssemblyName System.Formats.Tar -ErrorAction Stop',
        '$in = [System.IO.File]::OpenRead($src)',
        '$gz = [System.IO.Compression.GZipStream]::new($in, [System.IO.Compression.CompressionMode]::Decompress)',
        'try {',
        '  [System.Formats.Tar.TarFile]::ExtractToDirectory($gz, $dest, $true)',
        '  Write-Output "OK"',
        '} finally {',
        '  $gz.Close()',
        '  $in.Close()',
        '}'
      ].join('; ')
      const base64 = Buffer.from(psCode, 'utf-8').toString('base64')
      execSync(`powershell -NoProfile -EncodedCommand ${base64}`, { stdio: 'pipe', timeout: 120000 })
      console.log('[extractBundledPython] ✓ Python 预缓存成功 (PowerShell .NET)')
      return
    } catch (e) {
      console.warn(`[extractBundledPython] PowerShell .NET 解压失败: ${e.message}，尝试 tar.exe 备用`)
    }

    // Fallback: 使用 Windows tar.exe
    try {
      execSync(`tar -xzf "${archivePath}" -C "${targetDir}"`, { stdio: 'pipe', timeout: 120000 })
      console.log('[extractBundledPython] ✓ Python 预缓存成功 (tar.exe)')
      return
    } catch (e) {
      console.warn(`[extractBundledPython] tar.exe 解压失败: ${e.message}`)
    }
  } else {
    // Unix (Linux/macOS)：系统 tar 命令
    try {
      execSync(`tar -xzf "${archivePath}" -C "${targetDir}"`, { stdio: 'pipe', timeout: 120000 })
      console.log('[extractBundledPython] ✓ Python 预缓存成功')
      return
    } catch (e) {
      console.warn(`[extractBundledPython] 解压失败: ${e.message}`)
    }
  }

  console.log('[extractBundledPython] 所有解压方式均失败，uv 将尝试网络下载')
}

/** 查找应用 resources 目录（优先 src-tauri/resources/ 开发模式，其次 resources/ 便携模式） */
function appResourcesDir() {
  const explicit = String(process.env.SUPERCLAW_RESOURCES_DIR || '').trim()
  if (explicit) {
    const resolved = path.resolve(explicit)
    const allowed = [
      path.resolve(appRootDir(), 'src-tauri', 'resources'),
      path.resolve(appRootDir(), 'resources'),
    ]
    if (!allowed.some(dir => resolved === dir)) {
      throw new Error('SUPERCLAW_RESOURCES_DIR must point to this worktree resources directory')
    }
    if (fs.existsSync(resolved)) return resolved
  }
  const devDir = path.join(appRootDir(), 'src-tauri', 'resources')
  if (fs.existsSync(devDir)) return devDir
  const portableDir = path.join(appRootDir(), 'resources')
  if (fs.existsSync(portableDir)) return portableDir
  return null
}

function testConfigHomeDir() {
  if (!isServerTestBuild()) return null
  const resDir = appResourcesDir() || path.join(appRootDir(), 'src-tauri', 'resources')
  const dataDir = path.join(resDir, 'data')
  const explicit = String(process.env.SUPERCLAW_TEST_CONFIG_HOME || '').trim()
  const target = explicit ? path.resolve(explicit) : path.join(dataDir, '.openclaw')
  if (!isPathInside(dataDir, target)) {
    throw new Error('SUPERCLAW_TEST_CONFIG_HOME must stay inside this worktree resources/data directory')
  }
  return target
}

/** 便携模式下内置 OpenClaw 运行时目录（含 Node.js）例: resources/runtime/openclaw/ */
function bundledOpenclawBinDir() {
  const resDir = appResourcesDir()
  if (!resDir) return null
  const dir = path.join(resDir, 'runtime', 'openclaw')
  return fs.existsSync(dir) ? dir : null
}

/** 便携模式下的 OpenClaw 数据目录 例: resources/data/.openclaw/ */
function portableOpenclawDataDir() {
  const testDir = testConfigHomeDir()
  if (testDir) return testDir
  const resDir = appResourcesDir()
  if (!resDir) return null
  const dir = path.join(resDir, 'data', '.openclaw')
  if (fs.existsSync(dir) || bundledOpenclawBinDir()) return dir
  return null
}

function ensureOpenClawWorkspaceIdentity(resourcesRoot, dataRoot) {
  const templateDir = path.join(resourcesRoot, 'templates', 'openclaw-workspace')
  const workspaceDir = path.join(dataRoot, '.openclaw', 'workspace')
  const files = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md']

  for (const file of files) {
    const source = path.join(templateDir, file)
    const target = path.join(workspaceDir, file)
    if (!fs.existsSync(source)) continue

    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (!fs.existsSync(target)) {
      fs.copyFileSync(source, target)
      continue
    }

    const current = fs.readFileSync(target, 'utf8')
    if (!current.trim()) {
      fs.copyFileSync(source, target)
    }
  }
}

function ensurePortableOpenClawWorkspaceIdentity() {
  const portableDir = portableOpenclawDataDir()
  if (!portableDir || path.resolve(OPENCLAW_DIR) !== path.resolve(portableDir)) return

  const resourcesRoot = appResourcesDir() || path.join(appRootDir(), 'src-tauri', 'resources')
  const dataRoot = path.dirname(portableDir)
  ensureOpenClawWorkspaceIdentity(resourcesRoot, dataRoot)
}

// ---------------------------------------------------------------------------

/** 内置 uv 包路径（Dev: src-tauri/resources/，便携: 根目录 resources/） */
function bundledUvArchivePath() {
  // 1. 项目根目录 resources/（便携模式）
  const p1 = path.join(appRootDir(), 'resources', uvArchiveFilename())
  if (fs.existsSync(p1)) return p1
  // 2. src-tauri/resources/（Dev 模式）
  const p2 = path.join(appRootDir(), 'src-tauri', 'resources', uvArchiveFilename())
  if (fs.existsSync(p2)) return p2
  return p1
}

function uvArchiveFilename() {
  if (isWindows) return 'uv-x86_64-pc-windows-msvc.zip'
  if (isMac) {
    return process.arch === 'arm64' ? 'uv-aarch64-apple-darwin.tar.gz' : 'uv-x86_64-apple-darwin.tar.gz'
  }
  return process.arch === 'arm64' ? 'uv-aarch64-unknown-linux-gnu.tar.gz' : 'uv-x86_64-unknown-linux-gnu.tar.gz'
}

function uvCachedArchivePath() {
  return path.join(appRootDir(), 'cache', uvArchiveFilename())
}

/** 内置 Hermes Agent 源码包路径（Dev: src-tauri/resources/，便携: 根目录 resources/） */
function bundledHermesArchivePath() {
  const fname = 'hermes-agent-main.zip'
  const p1 = path.join(appRootDir(), 'resources', fname)
  if (fs.existsSync(p1)) return p1
  const p2 = path.join(appRootDir(), 'src-tauri', 'resources', fname)
  if (fs.existsSync(p2)) return p2
  return p1
}

/** 解压 hermes-agent-main.zip 到临时目录，返回解压后的目录路径 */
function extractHermesZip(zipPath) {
  const extractDir = path.join(appRootDir(), 'data', 'hermes-source')
  // 清理旧的解压目录
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true })
  fs.mkdirSync(extractDir, { recursive: true })

  if (isWindows) {
    const psCmd = `Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`
    const result = spawnSync('powershell', ['-Command', psCmd], { timeout: 30000, windowsHide: true })
    if (result.status !== 0) throw new Error(`zip 解压失败: ${(result.stderr || '').trim()}`)
  } else {
    // Unix: unzip（zip 文件用 unzip，不是 tar）
    const result = spawnSync('unzip', ['-o', zipPath, '-d', extractDir], { timeout: 30000 })
    if (result.status !== 0) throw new Error(`zip 解压失败: ${(result.stderr || '').trim()}`)
  }

  // zip 顶层包含 hermes-agent-main/ 目录
  const extracted = path.join(extractDir, 'hermes-agent-main')
  if (fs.existsSync(extracted)) return extracted
  return extractDir
}

function hermesEnhancedPath() {
  const current = process.env.PATH || ''
  const home = homedir()
  const extra = [uvBinDir(), uvToolBinDir()]
  if (isWindows) {
    for (const dir of hermesPortableGitPathEntries()) extra.push(dir)
    const appdata = process.env.APPDATA || ''
    if (appdata) extra.push(path.join(appdata, 'uv', 'tools', 'bin'))
    extra.push(path.join(home, '.local', 'bin'))
    extra.push(path.join(home, '.cargo', 'bin'))
  } else {
    extra.push(path.join(home, '.local', 'bin'))
    extra.push(path.join(home, '.cargo', 'bin'))
    extra.push('/usr/local/bin')
  }
  const sep = isWindows ? ';' : ':'
  return [...extra, current].filter(Boolean).join(sep)
}

let _hermesGitBashPath

function hermesPortableGitRoots() {
  const roots = []
  if (process.env.HERMES_PORTABLE_GIT_ROOT) roots.push(process.env.HERMES_PORTABLE_GIT_ROOT)
  roots.push(path.join(appRootDir(), 'resources', 'portable', 'git'))
  roots.push(path.join(appRootDir(), 'src-tauri', 'resources', 'portable', 'git'))
  return [...new Set(roots.map(p => path.resolve(p)))].filter(p => fs.existsSync(p))
}

function hermesPortableGitPathEntries() {
  if (!isWindows) return []
  const entries = []
  for (const root of hermesPortableGitRoots()) {
    for (const rel of ['cmd', 'bin', path.join('usr', 'bin')]) {
      const full = path.join(root, rel)
      if (fs.existsSync(full)) entries.push(full)
    }
  }
  return entries
}

function hermesBashWorks(bashPath) {
  if (!bashPath || !fs.existsSync(bashPath)) return false
  try {
    let root = path.dirname(path.dirname(bashPath))
    if (path.basename(root).toLowerCase() === 'usr') root = path.dirname(root)
    const env = {
      ...process.env,
      CHERE_INVOKING: '1',
      MSYSTEM: process.env.MSYSTEM || 'MINGW64',
      PATH: [
        path.join(root, 'cmd'),
        path.join(root, 'bin'),
        path.join(root, 'usr', 'bin'),
        process.env.PATH || '',
      ].filter(Boolean).join(';'),
    }
    const r = spawnSync(bashPath, ['-lc', 'printf HERMES_BASH_OK'], {
      env,
      timeout: 5000,
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return r.status === 0 && String(r.stdout || '').includes('HERMES_BASH_OK')
  } catch {
    return false
  }
}

function hermesGitBashPath() {
  if (!isWindows) return ''
  if (_hermesGitBashPath !== undefined) return _hermesGitBashPath
  const candidates = []
  for (const root of hermesPortableGitRoots()) {
    candidates.push(path.join(root, 'bin', 'bash.exe'))
    candidates.push(path.join(root, 'usr', 'bin', 'bash.exe'))
  }
  candidates.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'))
  candidates.push(path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'))
  candidates.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'))
  _hermesGitBashPath = [...new Set(candidates)].find(hermesBashWorks) || ''
  return _hermesGitBashPath
}

function normalizeHermesMiniMaxBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (raw.includes('api.minimaxi.com')) return 'https://api.minimaxi.com/v1'
  if (raw.includes('api.minimax.io')) return 'https://api.minimax.io/v1'
  return raw.replace(/\/anthropic$/i, '/v1')
}

function hermesProviderUsesMiniMax(provider) {
  return String(provider || '').trim().toLowerCase().includes('minimax')
}

function hermesRuntimeEnv(extra = {}) {
  const localEnv = readDotEnvVars(path.join(hermesHome(), '.env'))
  const defaultProfile = normalizeProviderProfileConfig({
    providerId: localEnv.SUPERCLAW_MODEL_PROVIDER_PROFILE || process.env.SUPERCLAW_MODEL_PROVIDER_PROFILE || DEFAULT_MODEL_PROVIDER_PROFILE_ID,
    baseUrl: localEnv.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || undefined,
    model: localEnv.OPENAI_MODEL || process.env.OPENAI_MODEL || undefined,
  })
  const hermesProvider = localEnv.HERMES_PROVIDER || process.env.HERMES_PROVIDER || hermesProviderIdForProfile(defaultProfile)
  const minimaxBaseUrl = normalizeHermesMiniMaxBaseUrl(
    localEnv.MINIMAX_BASE_URL
      || localEnv.MINIMAX_CN_BASE_URL
      || process.env.MINIMAX_BASE_URL
      || process.env.MINIMAX_CN_BASE_URL
      || localEnv.OPENAI_BASE_URL
      || process.env.OPENAI_BASE_URL
      || defaultProfile.baseUrl
  )
  const minimaxApiKey = localEnv.MINIMAX_API_KEY
    || localEnv.MINIMAX_CN_API_KEY
    || process.env.MINIMAX_API_KEY
    || process.env.MINIMAX_CN_API_KEY
    || localEnv.OPENAI_API_KEY
    || process.env.OPENAI_API_KEY
    || ''
  const openAiBaseUrl = hermesProviderUsesMiniMax(hermesProvider)
    ? minimaxBaseUrl
    : (localEnv.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || minimaxBaseUrl)
  const env = {
    ...process.env,
    ...localEnv,
    PATH: hermesEnhancedPath(),
    HERMES_PROVIDER: hermesProvider,
    OPENAI_BASE_URL: openAiBaseUrl,
    OPENAI_MODEL: localEnv.OPENAI_MODEL || process.env.OPENAI_MODEL || defaultProfile.model,
    OPENAI_API_KEY: localEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || minimaxApiKey,
    SUPERCLAW_FORCE_PROVIDER: localEnv.SUPERCLAW_FORCE_PROVIDER || process.env.SUPERCLAW_FORCE_PROVIDER || defaultProfile.group,
    SUPERCLAW_MODEL_PROVIDER_PROFILE: defaultProfile.providerId,
    SUPERCLAW_MODEL_PROVIDER_GROUP: defaultProfile.group,
    MINIMAX_API_KEY: minimaxApiKey,
    MINIMAX_BASE_URL: minimaxBaseUrl,
    MINIMAX_CN_BASE_URL: localEnv.MINIMAX_CN_BASE_URL || process.env.MINIMAX_CN_BASE_URL || minimaxBaseUrl,
    ...extra,
  }
  const bash = hermesGitBashPath()
  if (bash) env.HERMES_GIT_BASH_PATH = bash
  return env
}

function hermesGatewayPort() {
  const configPath = path.join(hermesHome(), 'config.yaml')
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    for (const line of content.split('\n')) {
      const m = line.trim().match(/^api_server_port:\s*(\d+)/)
      if (m) { const p = parseInt(m[1], 10); if (p > 0) return p }
    }
  } catch {}
  return HERMES_DEFAULT_PORT
}

function hermesGatewayUrl() {
  try {
    const cfg = readPanelConfig()
    const url = cfg?.hermes?.gatewayUrl
    if (url && typeof url === 'string' && url.trim()) return url.trim().replace(/\/+$/, '')
  } catch {}
  return `http://127.0.0.1:${hermesGatewayPort()}`
}

function hermesGatewayCustomUrl() {
  try {
    const cfg = readPanelConfig()
    const url = cfg?.hermes?.gatewayUrl
    if (url && typeof url === 'string' && url.trim()) return url.trim().replace(/\/+$/, '')
  } catch {}
  return ''
}

function isLoopbackGatewayUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '127.0.0.1' || host.startsWith('127.')
  } catch {
    return false
  }
}

function runHermesSilent(program, args, timeout = 15000) {
  try {
    let command = program
    let commandArgs = args
    let env = hermesRuntimeEnv()
    let cwd
    if (program === 'hermes') {
      const spec = hermesCommandSpec(args)
      command = spec.command
      commandArgs = spec.args
      env = spec.env
      cwd = spec.cwd
    }
    const result = spawnSync(command, commandArgs, {
      env,
      cwd,
      timeout,
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (result.status === 0) return { ok: true, stdout: (result.stdout || '').trim() }
    return { ok: false, stderr: (result.stderr || '').trim() }
  } catch (e) {
    return { ok: false, stderr: String(e) }
  }
}

let _hermesGwProcess = null

function normalizeForCompare(value) {
  return String(value || '').replace(/\//g, '\\').toLowerCase()
}

function inspectHermesGatewayPortOwners(port = hermesGatewayPort()) {
  if (!isWindows) {
    return { portablePids: [], hermesPids: [], foreignPids: [], listeningPids: [] }
  }
  let output = ''
  try { output = execSync('netstat -ano', { windowsHide: true }).toString() } catch {}
  const listeningPids = parseWindowsListeningPids(output, port)
  const bundledRuntimeSig = normalizeForCompare(hermesBundledRuntimeDir())
  const bundledExeSig = normalizeForCompare(hermesBundledExecutable())
  const portablePids = []
  const hermesPids = []
  const foreignPids = []
  for (const pid of listeningPids) {
    const commandLine = readWindowsProcessCommandLine(pid)
    const text = normalizeForCompare(commandLine)
    const looksHermes = text.includes('hermes') && text.includes('gateway')
    const looksPortable = looksHermes && (
      (bundledRuntimeSig && text.includes(bundledRuntimeSig))
      || (bundledExeSig && text.includes(bundledExeSig))
    )
    if (looksPortable) portablePids.push(pid)
    else if (looksHermes) hermesPids.push(pid)
    else if (commandLine) foreignPids.push(pid)
  }
  return {
    portablePids: [...new Set(portablePids)].sort((a, b) => a - b),
    hermesPids: [...new Set(hermesPids)].sort((a, b) => a - b),
    foreignPids: [...new Set(foreignPids)].sort((a, b) => a - b),
    listeningPids: [...new Set(listeningPids)].sort((a, b) => a - b),
  }
}

function killWindowsProcessTree(pid) {
  if (!isWindows || !Number.isInteger(Number(pid))) return
  try {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
      windowsHide: true,
      timeout: 5000,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
  } catch {}
}

const DEV_AGENT_DEFAULT_PORTS = {
  hermes: 8642,
  openclaw: 18789,
  claudecode: 3020,
}

function isLocalRequest(req) {
  const ip = String(req.socket?.remoteAddress || '').toLowerCase()
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost'
}

function normalizeAgentName(agent) {
  const x = String(agent || '').trim().toLowerCase()
  if (x === 'hermes') return 'hermes'
  if (x === 'openclaw') return 'openclaw'
  if (x === 'claudecode' || x === 'claude-code' || x === 'claude_code' || x === 'claude') return 'claudecode'
  return null
}

function getAgentDefaultPort(agent) {
  return DEV_AGENT_DEFAULT_PORTS[agent] || null
}

function localDevAgentFeature(agent) {
  if (agent === 'hermes') return ['hermes_cli', 'hermes-agent', 'uv-python']
  if (agent === 'openclaw') return ['openclaw', 'gateway run']
  if (agent === 'claudecode') return ['claude-panel', 'clean-claude-panel', 'server.js']
  return []
}

function getManagedDevChild(agent) {
  if (agent === 'hermes') return _hermesGwProcess || null
  if (agent === 'claudecode') return _claudePanelChild || null
  return null
}

function clearManagedDevChild(agent, child) {
  if (agent === 'hermes' && _hermesGwProcess === child) _hermesGwProcess = null
  if (agent === 'claudecode' && _claudePanelChild === child) _claudePanelChild = null
}

function getPortProcessDetails(port) {
  const targetPort = Number(port)
  if (!Number.isInteger(targetPort) || targetPort <= 0) return null

  if (isWindows) {
    const script = [
      `$c=Get-NetTCPConnection -LocalPort ${targetPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
      'if($c){',
      '  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"',
      '  [pscustomobject]@{pid=$c.OwningProcess; executablePath=$p.ExecutablePath; commandLine=$p.CommandLine} | ConvertTo-Json -Compress',
      '}',
    ].join('; ')
    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    })
    const raw = String(result.stdout || '').trim()
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return {
        pid: Number(parsed.pid || parsed.Pid || parsed.ProcessId || 0),
        executablePath: String(parsed.executablePath || parsed.ExecutablePath || ''),
        commandLine: String(parsed.commandLine || parsed.CommandLine || ''),
      }
    } catch {
      return null
    }
  }

  try {
    const raw = execSync(`lsof -nP -iTCP:${targetPort} -sTCP:LISTEN -Fp 2>/dev/null | head -n 1`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim()
    const pid = Number(raw.replace(/^p/, ''))
    if (!Number.isInteger(pid) || pid <= 0) return null
    const commandLine = execSync(`ps -p ${pid} -o command= 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }).trim()
    return { pid, executablePath: '', commandLine }
  } catch {
    return null
  }
}

function isVerifiedDevAgentProcess(agent, details) {
  if (!details?.pid) return false
  const repoRoot = normalizeForCompare(appRootDir())
  const text = normalizeForCompare(`${details.executablePath || ''}\n${details.commandLine || ''}`)
  if (!repoRoot || !text.includes(repoRoot)) return false
  return localDevAgentFeature(agent).some(feature => text.includes(normalizeForCompare(feature)))
}

function stopVerifiedDevPid(agent, details) {
  if (!isVerifiedDevAgentProcess(agent, details)) {
    return {
      ok: false,
      agent,
      stopped: false,
      pid: details?.pid || null,
      reason: 'unverified-port',
      warning: 'Process ownership could not be verified; skipped.',
    }
  }

  if (isWindows) {
    killWindowsProcessTree(details.pid)
  } else {
    try { process.kill(details.pid, 'SIGTERM') } catch {}
  }
  return { ok: true, agent, stopped: true, pid: details.pid, reason: 'verified-port' }
}

async function stopDevAgent(agentInput) {
  const agent = normalizeAgentName(agentInput)
  if (!agent) return { ok: false, stopped: false, reason: 'unsupported-agent' }

  if (agent === 'openclaw') {
    try {
      await handlers.stop_service({ label: 'ai.openclaw.gateway' })
      return { ok: true, agent, stopped: true, pid: null, reason: 'managed' }
    } catch (error) {
      const details = getPortProcessDetails(getAgentDefaultPort(agent))
      if (!details) return { ok: true, agent, stopped: false, pid: null, reason: 'not-running', warning: error?.message || String(error) }
      const fallback = stopVerifiedDevPid(agent, details)
      if (!fallback.ok) fallback.warning = fallback.warning || error?.message || String(error)
      return fallback
    }
  }

  const child = getManagedDevChild(agent)
  if (child?.pid) {
    const pid = Number(child.pid)
    clearManagedDevChild(agent, child)
    if (isWindows) killWindowsProcessTree(pid)
    else { try { process.kill(pid, 'SIGTERM') } catch {} }
    return { ok: true, agent, stopped: true, pid, reason: 'managed' }
  }

  const details = getPortProcessDetails(getAgentDefaultPort(agent))
  if (!details) return { ok: true, agent, stopped: false, pid: null, reason: 'not-running' }
  return stopVerifiedDevPid(agent, details)
}

async function waitForDevAgentReady(agent, options = {}) {
  const attempts = Number(options.attempts || 40)
  const delayMs = Number(options.delayMs || 500)
  let last = null
  for (let i = 0; i < attempts; i++) {
    last = await createDevAgentStatus(agent)
    if (last.ready || last.needsSetup) return last
    if (last.status === 'error' && !(agent === 'openclaw' && last.portListening && last.verified)) return last
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return last || await createDevAgentStatus(agent)
}

async function startDevAgent(agentInput) {
  const agent = normalizeAgentName(agentInput)
  if (!agent) return { ok: false, started: false, status: 'error', reason: 'unsupported-agent' }

  if (agent !== 'openclaw') {
    return { ok: false, agent, started: false, status: 'error', reason: 'start-not-implemented' }
  }

  const current = await createDevAgentStatus(agent)
  if (current.ready) return { ok: true, agent, started: false, status: 'ready', current }

  let minimaxConfig = null
  try {
    minimaxConfig = requireOpenClawMiniMaxGatewayConfig()
  } catch (error) {
    const code = error?.code || 'OPENCLAW_GATEWAY_CONFIG_ERROR'
    const status = code === 'OPENCLAW_MINIMAX_API_KEY_REQUIRED' ? 'needs_setup' : 'error'
    return {
      ok: false,
      agent,
      started: false,
      status,
      needsSetup: status === 'needs_setup',
      code,
      error: error?.message || String(error),
    }
  }

  try {
    const runtime = await getLocalGatewayRuntime('ai.openclaw.gateway')
    if (runtime?.running) {
      ensureOwnedGatewayOrThrow(runtime.pid || null)
    } else if (isMac) {
      macStartService('ai.openclaw.gateway')
    } else if (isLinux) {
      linuxStartGateway()
    } else {
      winStartGateway()
    }

    const ready = await waitForDevAgentReady(agent, { attempts: 40, delayMs: 500 })
    if (ready.ready) {
      return {
        ok: true,
        agent,
        started: true,
        status: 'ready',
        pid: ready.pid || null,
        keyFingerprint: openclawMiniMaxKeyFingerprint(minimaxConfig.apiKey),
        current: ready,
      }
    }
    return {
      ok: false,
      agent,
      started: true,
      status: ready.status || 'checking',
      error: ready.error || ready.message || 'OpenClaw Gateway started but is not ready yet.',
      current: ready,
    }
  } catch (error) {
    const latest = await createDevAgentStatus(agent).catch(() => null)
    return {
      ok: false,
      agent,
      started: false,
      status: latest?.status || 'error',
      error: error?.message || String(error),
      code: error?.code || undefined,
      current: latest,
    }
  }
}

async function stopAllDevAgents() {
  const results = []
  for (const agent of ['hermes', 'openclaw', 'claudecode']) {
    try {
      results.push(await stopDevAgent(agent))
    } catch (error) {
      results.push({ ok: false, agent, stopped: false, reason: 'error', error: error?.message || String(error) })
    }
  }
  return { ok: results.every(item => item.ok !== false), results }
}

function detectAgentNeedsSetup(probe) {
  const text = JSON.stringify({
    status: probe?.status || '',
    message: probe?.message || '',
    error: probe?.error || '',
    body: probe?.body || null,
  }).toLowerCase()
  return /OPENCLAW_MINIMAX_API_KEY_REQUIRED|api key|missing.*key|no api key|unknown provider|needs_setup|未配置|配置未完成|minimax.*key/i.test(text)
}

async function probeLocalAgentHttp(agent, port, timeoutMs = 1500) {
  const paths = agent === 'claudecode'
    ? ['/api/status', '/health', '/api/health']
    : ['/health', '/status', '/api/status']

  for (const probePath of paths) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(`http://127.0.0.1:${port}${probePath}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      let body = null
      try {
        body = await resp.json()
      } catch {
        body = { text: await resp.text().catch(() => '') }
      }
      if (resp.status === 404) continue
      const statusText = String(body?.status || body?.state || '').toLowerCase()
      const ready = resp.ok && (
        body?.ok === true
        || body?.ready === true
        || statusText === 'ok'
        || statusText === 'ready'
        || statusText === 'live'
        || statusText === 'running'
        || agent === 'claudecode'
      )
      return {
        ready,
        httpOk: resp.ok,
        status: statusText || (resp.ok ? 'ready' : 'not_ready'),
        path: probePath,
        body,
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        // Try the next conventional status path before reporting the probe error.
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    ready: false,
    httpOk: false,
    status: 'no_health_endpoint',
    message: 'No health/status endpoint responded.',
  }
}

async function createDevAgentStatus(agent) {
  const port = getAgentDefaultPort(agent)
  const details = getPortProcessDetails(port)
  const portListening = !!details?.pid
  const verified = !!details && isVerifiedDevAgentProcess(agent, details)
  const base = {
    ok: true,
    agent,
    port,
    pid: details?.pid || null,
    portListening,
    listening: portListening,
    verified,
    ready: false,
    connected: false,
    needsSetup: false,
    status: 'stopped',
    message: '',
    error: null,
  }

  if (agent === 'openclaw') {
    try {
      const minimaxConfig = openclawMiniMaxGatewayConfig()
      if (!minimaxConfig.apiKey) {
        return {
          ...base,
          needsSetup: true,
          status: 'needs_setup',
          message: 'OpenClaw 模型或 Key 未配置，请先完成配置。',
          error: 'OPENCLAW_MINIMAX_API_KEY_REQUIRED',
        }
      }
    } catch (error) {
      return {
        ...base,
        status: 'error',
        message: error?.message || 'OpenClaw 模型配置检查失败。',
        error: error?.code || error?.message || String(error),
      }
    }
  }

  if (!portListening) {
    base.message = 'Agent port is not listening.'
    return base
  }

  if (!verified) {
    base.status = 'listening_unverified'
    base.message = 'Port is listening, but process ownership could not be verified.'
    return base
  }

  const probe = agent === 'openclaw'
    ? await probeOpenclawGatewayHealth(port, 5000)
    : await probeLocalAgentHttp(agent, port, 1500)
  const needsSetup = detectAgentNeedsSetup(probe)
  const ready = !!probe.ready && !needsSetup
  const status = needsSetup
    ? 'needs_setup'
    : ready
      ? 'ready'
      : agent === 'openclaw'
        ? (probe.httpOk || portListening && verified ? 'checking' : 'error')
        : 'checking'

  return {
    ...base,
    ready,
    connected: ready,
    needsSetup,
    status,
    message: needsSetup
      ? '模型或网关配置未完成，请先完成配置。'
      : ready
        ? 'Gateway ready.'
        : probe.message || `Health probe not ready: ${probe.status || 'unknown'}`,
    error: probe.error || null,
    health: {
      ready: !!probe.ready,
      httpOk: !!probe.httpOk,
      status: probe.status || 'unknown',
      path: probe.path || '/health',
    },
  }
}

async function devAgentsStatus(agentInput = null) {
  const singleAgent = normalizeAgentName(agentInput)
  if (agentInput && !singleAgent) {
    return { ok: false, error: 'unsupported-agent', agent: agentInput }
  }
  if (singleAgent) return createDevAgentStatus(singleAgent)

  const agents = {}
  for (const agent of ['hermes', 'openclaw', 'claudecode']) {
    agents[agent] = await createDevAgentStatus(agent)
  }
  return { ok: true, agents }
}

async function waitHermesPortClosed(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await _tcpProbe('127.0.0.1', port, 300))) return true
    await new Promise(r => setTimeout(r, 300))
  }
  return false
}

function safeDirName(name, fallback = 'imported-skill') {
  const base = String(name || '').replace(/\.[^.]+$/, '')
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return cleaned || fallback
}

function readSkillTitle(skillMdPath) {
  try {
    const raw = fs.readFileSync(skillMdPath, 'utf8').replace(/^\uFEFF/, '')
    const m = raw.match(/^#\s+(.+)$/m)
    return (m?.[1] || '').trim()
  } catch {
    return ''
  }
}

function visibleDirEntries(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('__MACOSX') && e.name !== '.DS_Store')
}

function findSkillMdFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name.startsWith('__MACOSX')) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) findSkillMdFiles(full, out)
    else if (entry.isFile() && entry.name === 'SKILL.md') out.push(full)
  }
  return out
}

function extractZipArchive(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`
  const args = isWindows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zipPath=${psQuote(zipPath)}; $destPath=${psQuote(destDir)}; $destFull=[IO.Path]::GetFullPath($destPath); if(-not $destFull.EndsWith([IO.Path]::DirectorySeparatorChar)){ $destFull += [IO.Path]::DirectorySeparatorChar }; $zip=[IO.Compression.ZipFile]::OpenRead($zipPath); try { foreach($entry in $zip.Entries){ if([string]::IsNullOrWhiteSpace($entry.FullName)){ continue }; $target=[IO.Path]::GetFullPath([IO.Path]::Combine($destPath, $entry.FullName)); if(-not $target.StartsWith($destFull, [StringComparison]::OrdinalIgnoreCase)){ throw "ZIP entry path escapes target: $($entry.FullName)" } } } finally { $zip.Dispose() }; Expand-Archive -LiteralPath $zipPath -DestinationPath $destPath -Force`]
    : ['-q', zipPath, '-d', destDir]
  const program = isWindows ? 'powershell.exe' : 'unzip'
  const result = spawnSync(program, args, {
    timeout: 60000,
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`ZIP 解压失败${detail ? `: ${detail}` : ''}`)
  }
}

function copySkillDir(srcDir, dstDir) {
  fs.rmSync(dstDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dstDir), { recursive: true })
  fs.cpSync(srcDir, dstDir, { recursive: true, force: true, errorOnExist: false })
}

function installSingleSkillDir(srcDir, sourceName) {
  const title = readSkillTitle(path.join(srcDir, 'SKILL.md'))
  const baseName = path.basename(srcDir)
  const parentName = path.basename(path.dirname(srcDir))
  const transientName = baseName === 'extract' || baseName.startsWith('hermes-skill-') || parentName.startsWith('hermes-skill-')
  const seed = transientName ? (title || sourceName) : (baseName || title || sourceName)
  const slug = safeDirName(seed, safeDirName(title || sourceName || 'imported-skill'))
  const target = path.join(hermesHome(), 'skills', 'external', slug)
  copySkillDir(srcDir, target)
  return target
}

function installHermesSkillPackage(extractDir, sourceName = 'imported-skill') {
  let root = extractDir
  const entries = visibleDirEntries(root)
  if (entries.length === 1 && entries[0].isDirectory()) root = path.join(root, entries[0].name)

  const skillMdFiles = findSkillMdFiles(root)
  if (skillMdFiles.length === 0) {
    throw new Error('这不是有效 Hermes skill 包：ZIP 中未找到 SKILL.md')
  }

  const skillsDir = path.join(hermesHome(), 'skills')
  fs.mkdirSync(skillsDir, { recursive: true })

  if (fs.existsSync(path.join(root, 'SKILL.md'))) {
    installSingleSkillDir(root, sourceName)
    return handlers.hermes_skills_list()
  }

  const childDirs = visibleDirEntries(root).filter(e => e.isDirectory())
  const categoryLike = childDirs.some(cat => {
    const catDir = path.join(root, cat.name)
    return visibleDirEntries(catDir).some(sub => sub.isDirectory() && fs.existsSync(path.join(catDir, sub.name, 'SKILL.md')))
  })
  if (categoryLike) {
    for (const entry of visibleDirEntries(root)) {
      const src = path.join(root, entry.name)
      const dst = path.join(skillsDir, entry.name)
      if (entry.isDirectory()) copySkillDir(src, dst)
      else if (entry.isFile()) fs.copyFileSync(src, dst)
    }
    return handlers.hermes_skills_list()
  }

  const immediateSkills = childDirs.filter(entry => fs.existsSync(path.join(root, entry.name, 'SKILL.md')))
  if (immediateSkills.length === 0) {
    throw new Error('这不是有效 Hermes skill 包：SKILL.md 必须位于技能目录内')
  }
  for (const entry of immediateSkills) {
    installSingleSkillDir(path.join(root, entry.name), entry.name)
  }
  return handlers.hermes_skills_list()
}

function cleanCliText(text) {
  return String(text || '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\r/g, '')
    .trim()
}

function githubSkillUrlToIdentifier(url) {
  let u
  try { u = new URL(url) } catch { return '' }
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return ''
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length < 2) return ''
  const owner = parts[0]
  const repo = parts[1]
  const marker = (parts[2] || '').toLowerCase()
  if (!marker) return ''
  if (marker !== 'tree' && marker !== 'blob') return ''
  const rest = parts.slice(4)
  if (!rest.length) return ''
  if ((rest[rest.length - 1] || '').toLowerCase() === 'skill.md') rest.pop()
  if (!rest.length) return ''
  return `${owner}/${repo}/${rest.join('/')}`
}

function normalizeHermesSkillInstallSpec(input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('请输入 skill 标识、GitHub 链接、SKILL.md 链接或 ZIP 链接')
  if (/^https?:\/\//i.test(raw)) {
    const converted = githubSkillUrlToIdentifier(raw)
    return converted || raw
  }
  return raw.replace(/^github:/i, '').replace(/^skills\.sh\//i, 'skills-sh/')
}

function isLikelyZipUrl(url) {
  try {
    const u = new URL(url)
    return /\.zip(?:$|\?)/i.test(u.pathname + u.search)
  } catch {
    return false
  }
}

function installHermesSkillWithCli(identifier, force = false) {
  const spec = normalizeHermesSkillInstallSpec(identifier)
  const args = ['skills', 'install', spec, '--yes']
  if (force) args.push('--force')
  const result = runHermesSilent('hermes', args, 180000)
  if (!result.ok) {
    const detail = cleanCliText(result.stderr || result.stdout)
    throw new Error(detail || 'Hermes 在线安装 skill 失败')
  }
  return {
    spec,
    output: cleanCliText(result.stdout || result.stderr),
    skills: handlers.hermes_skills_list(),
  }
}

const VOICE_CONFIG_MASK = '__SUPERCLAW_VOICE_KEY_MASKED__'

function defaultVoiceConfig() {
  return {
    provider: 'openai-compatible',
    apiFormat: 'openai',
    baseUrl: '',
    authType: 'bearer',
    authHeader: 'Authorization',
    apiKeyEnv: 'VOICE_API_KEY',
    apiKey: '',
    input: {
      enabled: false,
      model: 'whisper-1',
      path: '/audio/transcriptions',
      language: 'zh-CN',
    },
    output: {
      enabled: false,
      model: 'tts-1',
      path: '/audio/speech',
      voice: 'alloy',
      format: 'mp3',
    },
  }
}

function hermesVoiceConfigPath() {
  return path.join(hermesHome(), 'voice.json')
}

function cleanVoiceString(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max)
}

function readVoiceConfigRaw() {
  const cfgPath = hermesVoiceConfigPath()
  if (!fs.existsSync(cfgPath)) return defaultVoiceConfig()
  try {
    return normalizeVoiceConfig(JSON.parse(fs.readFileSync(cfgPath, 'utf8')))
  } catch {
    return defaultVoiceConfig()
  }
}

function normalizeVoiceConfig(input = {}, existing = null) {
  const base = defaultVoiceConfig()
  const current = existing || {}
  const rawKey = cleanVoiceString(input.apiKey, 8000)
  const apiKey = rawKey === VOICE_CONFIG_MASK ? cleanVoiceString(current.apiKey, 8000) : rawKey
  const apiFormat = cleanVoiceString(input.apiFormat || base.apiFormat, 40).toLowerCase()
  const authType = cleanVoiceString(input.authType || base.authType, 40).toLowerCase()
  return {
    provider: cleanVoiceString(input.provider || base.provider, 120),
    apiFormat: ['openai', 'json'].includes(apiFormat) ? apiFormat : base.apiFormat,
    baseUrl: cleanVoiceString(input.baseUrl || '', 2000).replace(/\/+$/, ''),
    authType: ['bearer', 'header', 'none'].includes(authType) ? authType : base.authType,
    authHeader: cleanVoiceString(input.authHeader || base.authHeader, 120) || base.authHeader,
    apiKeyEnv: cleanVoiceString(input.apiKeyEnv || base.apiKeyEnv, 120),
    apiKey,
    input: {
      enabled: input.input?.enabled === true,
      model: cleanVoiceString(input.input?.model || base.input.model, 300),
      path: cleanVoiceString(input.input?.path || base.input.path, 1000),
      language: cleanVoiceString(input.input?.language || base.input.language, 80),
    },
    output: {
      enabled: input.output?.enabled === true,
      model: cleanVoiceString(input.output?.model || base.output.model, 300),
      path: cleanVoiceString(input.output?.path || base.output.path, 1000),
      voice: cleanVoiceString(input.output?.voice || base.output.voice, 300),
      format: cleanVoiceString(input.output?.format || base.output.format, 40).replace(/[^a-z0-9_-]/gi, '') || base.output.format,
    },
  }
}

function resolveVoiceApiKey(config) {
  const envName = cleanVoiceString(config.apiKeyEnv, 120)
  if (envName && process.env[envName]) return process.env[envName]
  return cleanVoiceString(config.apiKey, 8000)
}

function maskVoiceConfig(config) {
  const normalized = normalizeVoiceConfig(config)
  const key = resolveVoiceApiKey(normalized)
  const baseReady = !!normalized.baseUrl && (normalized.authType === 'none' || !!key)
  return {
    ...normalized,
    apiKey: normalized.apiKey ? VOICE_CONFIG_MASK : '',
    apiKeyMasked: !!normalized.apiKey,
    envKeyAvailable: !!(normalized.apiKeyEnv && process.env[normalized.apiKeyEnv]),
    configured: baseReady,
    inputReady: baseReady && normalized.input.enabled,
    outputReady: baseReady && normalized.output.enabled,
  }
}

function writeVoiceConfig(config) {
  const current = readVoiceConfigRaw()
  const next = normalizeVoiceConfig(config, current)
  const cfgPath = hermesVoiceConfigPath()
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
  fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2), 'utf8')
  return maskVoiceConfig(next)
}

function voiceEndpoint(config, kind) {
  const raw = kind === 'input' ? config.input.path : config.output.path
  if (/^https?:\/\//i.test(raw)) return raw
  return `${config.baseUrl.replace(/\/+$/, '')}/${String(raw || '').replace(/^\/+/, '')}`
}

function voiceAuthHeaders(config) {
  const key = resolveVoiceApiKey(config)
  if (config.authType === 'none') return {}
  if (!key) throw new Error('Voice API Key 未配置')
  if (config.authType === 'header' && config.authHeader && config.authHeader !== 'Authorization') {
    return { [config.authHeader]: key }
  }
  return { Authorization: `Bearer ${key}` }
}

function voiceTimeoutSignal(ms = 60000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

async function parseVoiceJsonResponse(resp) {
  const text = await resp.text()
  let json = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!resp.ok) {
    const msg = json.error?.message || json.error || json.message || `HTTP ${resp.status}`
    throw new Error(String(msg))
  }
  return json
}

async function voiceTranscribe({ audioBase64, mimeType, language } = {}) {
  const config = readVoiceConfigRaw()
  if (!config.input.enabled) throw new Error('语音输入模型未启用')
  if (!config.baseUrl) throw new Error('语音模型 Base URL 未配置')
  if (!audioBase64) throw new Error('没有收到录音内容')
  const endpoint = voiceEndpoint(config, 'input')
  const timeout = voiceTimeoutSignal(90000)
  try {
    if (config.apiFormat === 'json') {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...voiceAuthHeaders(config) },
        body: JSON.stringify({
          model: config.input.model,
          audio: audioBase64,
          mime_type: mimeType || 'audio/webm',
          language: language || config.input.language,
        }),
        signal: timeout.signal,
      })
      const json = await parseVoiceJsonResponse(resp)
      const text = json.text || json.transcription || json.result?.text || json.data?.text || ''
      return { text: String(text || '').trim() }
    }

    const form = new FormData()
    form.append('model', config.input.model)
    if (language || config.input.language) form.append('language', language || config.input.language)
    const blob = new Blob([Buffer.from(audioBase64, 'base64')], { type: mimeType || 'audio/webm' })
    form.append('file', blob, `speech.${String(mimeType || 'webm').includes('mp4') ? 'mp4' : 'webm'}`)
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: voiceAuthHeaders(config),
      body: form,
      signal: timeout.signal,
    })
    const json = await parseVoiceJsonResponse(resp)
    const text = json.text || json.transcription || json.result?.text || json.data?.text || ''
    return { text: String(text || '').trim() }
  } finally {
    timeout.done()
  }
}

function mimeFromVoiceFormat(format, fallback = 'audio/mpeg') {
  const f = String(format || '').toLowerCase()
  if (f === 'wav') return 'audio/wav'
  if (f === 'opus') return 'audio/opus'
  if (f === 'aac') return 'audio/aac'
  if (f === 'flac') return 'audio/flac'
  if (f === 'pcm') return 'audio/pcm'
  if (f === 'mp3') return 'audio/mpeg'
  return fallback
}

async function voiceSynthesize({ text, voice, format } = {}) {
  const config = readVoiceConfigRaw()
  if (!config.output.enabled) throw new Error('语音输出模型未启用')
  if (!config.baseUrl) throw new Error('语音模型 Base URL 未配置')
  const input = cleanVoiceString(text, 12000)
  if (!input) throw new Error('没有可朗读的文本')
  const endpoint = voiceEndpoint(config, 'output')
  const timeout = voiceTimeoutSignal(90000)
  const outputFormat = cleanVoiceString(format || config.output.format || 'mp3', 40)
  try {
    const payload = config.apiFormat === 'json'
      ? { model: config.output.model, text: input, input, voice: voice || config.output.voice, format: outputFormat }
      : { model: config.output.model, input, voice: voice || config.output.voice, response_format: outputFormat }
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...voiceAuthHeaders(config) },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    })
    const contentType = resp.headers.get('content-type') || ''
    if (contentType.toLowerCase().startsWith('audio/')) {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const bytes = Buffer.from(await resp.arrayBuffer())
      return { audioBase64: bytes.toString('base64'), mimeType: contentType.split(';')[0] || mimeFromVoiceFormat(outputFormat) }
    }
    const json = await parseVoiceJsonResponse(resp)
    const audioBase64 = json.audioBase64 || json.audio || json.audio_base64 || json.data?.audioBase64 || json.data?.audio || ''
    const url = json.url || json.audioUrl || json.audio_url || json.data?.url || ''
    return {
      audioBase64,
      url,
      mimeType: json.mimeType || json.mime_type || json.data?.mimeType || mimeFromVoiceFormat(outputFormat),
    }
  } finally {
    timeout.done()
  }
}

const __dev_dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_OPENCLAW_DIR = path.join(homedir(), '.openclaw')
let OPENCLAW_DIR = DEFAULT_OPENCLAW_DIR
let CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json')
let MCP_CONFIG_PATH = path.join(OPENCLAW_DIR, 'mcp.json')
let LOGS_DIR = path.join(OPENCLAW_DIR, 'logs')
let BACKUPS_DIR = path.join(OPENCLAW_DIR, 'backups')
let DEVICE_KEY_FILE = path.join(OPENCLAW_DIR, 'clawpanel-device-key.json')
let DEVICES_DIR = path.join(OPENCLAW_DIR, 'devices')
let PAIRED_PATH = path.join(DEVICES_DIR, 'paired.json')
const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'
const SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing', 'operator.read', 'operator.write']
const CLUSTER_TOKEN = 'clawpanel-cluster-secret-2026'
const PANEL_CONFIG_PATH = path.join(DEFAULT_OPENCLAW_DIR, 'clawpanel.json')
/** 动态获取实际 clawpanel.json 路径（便携模式优先） */
function panelConfigFilePath() {
  const portableDir = portableOpenclawDataDir()
  if (portableDir) {
    const p = path.join(portableDir, 'clawpanel.json')
    if (fs.existsSync(p)) return p
    // 便携目录存在但 clawpanel.json 不存在，也在便携目录下创建
    return p
  }
  return PANEL_CONFIG_PATH
}

/** 动态获取面板状态目录（便携模式优先） */
function panelStateDir() {
  const cfgPath = panelConfigFilePath()
  return path.dirname(cfgPath)
}
function dockerNodesPath() { return path.join(panelStateDir(), 'docker-nodes.json') }
function instancesPath() { return path.join(panelStateDir(), 'instances.json') }
const DEFAULT_DOCKER_SOCKET = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'
const DEFAULT_OPENCLAW_IMAGE = 'ghcr.io/qingchencloud/openclaw'
const PANEL_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dev_dirname, '..', 'package.json'), 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
})()
const VERSION_POLICY_PATH = path.join(__dev_dirname, '..', 'openclaw-version-policy.json')
function openclawGatewayPlatform() {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macos'
  return process.platform
}
function normalizeCustomOpenclawDir(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const expanded = trimmed.startsWith('~/') ? path.join(homedir(), trimmed.slice(2)) : trimmed
  return path.resolve(expanded)
}

function applyOpenclawPathConfig(panelConfig) {
  const customDir = normalizeCustomOpenclawDir(panelConfig?.openclawDir)
  if (customDir) {
    OPENCLAW_DIR = customDir
  } else if (portableOpenclawDataDir()) {
    OPENCLAW_DIR = portableOpenclawDataDir()
    if (!fs.existsSync(OPENCLAW_DIR)) fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
  } else {
    OPENCLAW_DIR = DEFAULT_OPENCLAW_DIR
  }
  CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json')
  MCP_CONFIG_PATH = path.join(OPENCLAW_DIR, 'mcp.json')
  LOGS_DIR = path.join(OPENCLAW_DIR, 'logs')
  BACKUPS_DIR = path.join(OPENCLAW_DIR, 'backups')
  DEVICE_KEY_FILE = path.join(OPENCLAW_DIR, 'clawpanel-device-key.json')
  DEVICES_DIR = path.join(OPENCLAW_DIR, 'devices')
  PAIRED_PATH = path.join(DEVICES_DIR, 'paired.json')
  process.env.OPENCLAW_HOME = OPENCLAW_DIR
  process.env.OPENCLAW_STATE_DIR = OPENCLAW_DIR
  process.env.OPENCLAW_CONFIG_PATH = CONFIG_PATH
  try {
    ensurePortableOpenClawWorkspaceIdentity()
  } catch (error) {
    console.warn(`[OpenClaw] workspace identity template sync skipped: ${error?.message || error}`)
  }
  return { path: OPENCLAW_DIR, isCustom: !!customDir }
}

function normalizeCliPath(raw) {
  if (typeof raw !== 'string') return null
  const expanded = expandHomePath(raw.trim())
  if (!expanded) return null
  return path.resolve(expanded)
}

function canonicalCliPath(raw) {
  const normalized = normalizeCliPath(raw)
  if (!normalized) return null
  try {
    return fs.realpathSync.native(normalized)
  } catch {
    return normalized
  }
}

function scanCliIdentity(rawPath) {
  const normalized = normalizeCliPath(rawPath)
  if (!normalized) return null
  let identityPath = normalized
  if (isWindows) {
    const base = path.basename(normalized).toLowerCase()
    if (base === 'openclaw' || base === 'openclaw.exe' || base === 'openclaw.ps1') {
      const cmdPath = path.join(path.dirname(normalized), 'openclaw.cmd')
      if (fs.existsSync(cmdPath)) identityPath = cmdPath
    }
  }
  return canonicalCliPath(identityPath) || identityPath
}

function isRejectedCliPath(cliPath) {
  const lower = String(cliPath || '').replace(/\\/g, '/').toLowerCase()
  return lower.includes('/.cherrystudio/') || lower.includes('cherry-studio')
}

function addCliCandidate(candidates, seen, rawPath) {
  const normalized = normalizeCliPath(rawPath)
  if (!normalized || !fs.existsSync(normalized) || isRejectedCliPath(normalized)) return
  const identity = scanCliIdentity(normalized) || normalized
  const key = isWindows ? identity.toLowerCase() : identity
  if (seen.has(key)) return
  seen.add(key)
  candidates.push(normalized)
}

function findCommandPath(command) {
  try {
    const output = execSync(isWindows ? `where ${command}` : `which ${command} 2>/dev/null`, {
      timeout: 3000,
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!output) return null
    const first = output.split(/\r?\n/).map(line => line.trim()).find(Boolean)
    return first || null
  } catch {
    return null
  }
}

const HERMES_DELETED_SESSION_TTL_MS = 24 * 60 * 60 * 1000

function hermesDeletedSessionsPath() {
  return path.join(hermesHome(), '.superclaw-deleted-sessions.json')
}

function readHermesDeletedSessions() {
  const now = Date.now()
  const file = hermesDeletedSessionsPath()
  let raw = {}
  try {
    if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {}
  } catch {
    raw = {}
  }
  const out = {}
  for (const [id, ts] of Object.entries(raw)) {
    const when = Number(ts || 0)
    if (id && when && now - when <= HERMES_DELETED_SESSION_TTL_MS) out[id] = when
  }
  if (Object.keys(out).length !== Object.keys(raw).length) {
    try { fs.writeFileSync(file, JSON.stringify(out, null, 2)) } catch {}
  }
  return out
}

function rememberHermesDeletedSession(sessionId) {
  const id = String(sessionId || '').trim()
  if (!id) return
  const deleted = readHermesDeletedSessions()
  deleted[id] = Date.now()
  try {
    fs.mkdirSync(path.dirname(hermesDeletedSessionsPath()), { recursive: true })
    fs.writeFileSync(hermesDeletedSessionsPath(), JSON.stringify(deleted, null, 2))
  } catch {}
}

function isHermesDeletedSessionId(sessionId) {
  const id = String(sessionId || '').trim()
  return !!id && Object.prototype.hasOwnProperty.call(readHermesDeletedSessions(), id)
}

function isHermesSmokeOrFixtureSession(session = {}) {
  const id = String(session.id || session.session_id || '').toLowerCase()
  const title = String(session.title || session.name || '').toLowerCase()
  const source = String(session.source || '').toLowerCase()
  const preview = String(session.preview || '').toLowerCase()
  const marker = `${id} ${title} ${source} ${preview}`
  if (marker.includes('codex-hermes')) return true
  if (marker.includes('yyapi-test')) return true
  return ['smoke', 'test', 'fixture', 'yyapi-test'].includes(source)
}

function isHermesPlaceholderSessionText(value) {
  const text = String(value || '').trim().toLowerCase()
  return !text
    || text === '-'
    || text === '\u2014'
    || text === 'new chat'
    || text === 'untitled'
    || text === '\u65b0\u4f1a\u8bdd'
    || text === '\u65b0\u5bf9\u8bdd'
}

function normalizeHermesSessionForUi(session = {}) {
  const out = { ...session }
  const id = String(out.id || out.session_id || '').trim()
  const source = String(out.source || '').trim()
  const sourceIdPattern = /^(api_server|local|cron|web|desktop|cli)\s+(.+)$/i
  const sourceMatch = source.match(sourceIdPattern)
  const idMatch = id.match(sourceIdPattern)

  if (sourceMatch && (!id || id === source || idMatch)) {
    out.source = sourceMatch[1]
    out.id = sourceMatch[2].trim()
  } else if (idMatch) {
    out.source = out.source || idMatch[1]
    out.id = idMatch[2].trim()
  }

  if (isHermesPlaceholderSessionText(out.title) && !isHermesPlaceholderSessionText(out.preview)) {
    out.title = String(out.preview || '').trim()
  }
  return out
}

function filterHermesSessionsForUi(sessions = []) {
  return (Array.isArray(sessions) ? sessions : [])
    .map(session => normalizeHermesSessionForUi(session))
    .filter(session => !isHermesDeletedSessionId(session.id || session.session_id))
    .filter(session => !isHermesSmokeOrFixtureSession(session))
}

function normalizeCommandPath(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const expanded = expandHomePath(trimmed)
  if (!expanded) return null
  const looksLikePath =
    trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.') || /^~[\\/]/.test(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)
  return looksLikePath ? path.resolve(expanded) : expanded
}

function readConfiguredGitPath() {
  return normalizeCommandPath(readPanelConfig()?.gitPath || '')
}

function resolveGitExecutable() {
  const gitPath = readConfiguredGitPath()
  const isCustom = !!gitPath
  const isPathLike = !!gitPath && (gitPath.includes('/') || gitPath.includes('\\') || /^[A-Za-z]:[\\/]/.test(gitPath))
  return { gitPath: gitPath || 'git', isCustom, isPathLike }
}

function buildGitCommandEnv(extraEnv = {}, resolved = resolveGitExecutable()) {
  const env = { ...process.env, ...(extraEnv || {}) }
  if (resolved.isCustom && resolved.isPathLike) {
    const dir = path.dirname(resolved.gitPath)
    env.PATH = [dir, env.PATH || ''].filter(Boolean).join(path.delimiter)
  }
  if (resolved.isCustom) env.GIT = resolved.gitPath
  return env
}

function runGitSync(args, options = {}) {
  const resolved = resolveGitExecutable()
  const env = buildGitCommandEnv(options.env, resolved)
  const result = spawnSync(resolved.gitPath, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
    env,
  })
  return { ...resolved, result }
}

function readConfiguredOpenclawSearchPaths() {
  const entries = readPanelConfig()?.openclawSearchPaths
  if (!Array.isArray(entries)) return []
  const paths = []
  const seen = new Set()
  for (const entry of entries) {
    const normalized = normalizeCustomOpenclawDir(entry)
    if (!normalized) continue
    const key = isWindows ? normalized.toLowerCase() : normalized
    if (seen.has(key)) continue
    seen.add(key)
    paths.push(normalized)
  }
  return paths
}

function addConfiguredOpenclawCandidates(candidates, seen) {
  for (const configured of readConfiguredOpenclawSearchPaths()) {
    const resolved = resolveOpenclawCliInput(configured)
    if (resolved) addCliCandidate(candidates, seen, resolved)
  }
}

function detectWindowsShimSource(cliPath) {
  if (!isWindows) return null
  const normalized = normalizeCliPath(cliPath)
  if (!normalized || !fs.existsSync(normalized)) return null
  try {
    const lower = fs.readFileSync(normalized, 'utf8').toLowerCase()
    if (lower.includes('@qingchencloud') || lower.includes('openclaw-zh')) return 'npm-zh'
    if (lower.includes('/node_modules/openclaw/') || lower.includes('\\node_modules\\openclaw\\')) return 'npm-official'
  } catch {}
  return null
}

function classifyCliSource(cliPath) {
  const normalized = normalizeCliPath(cliPath)
  if (!normalized) return null
  const lower = normalized.replace(/\\/g, '/').toLowerCase()
  if (lower.includes('/programs/openclaw/') || lower.includes('/openclaw-bin/') || lower.includes('/opt/openclaw/') || lower.includes('/runtime/openclaw/')) return 'standalone'
  if (lower.includes('openclaw-zh') || lower.includes('@qingchencloud')) return 'npm-zh'
  if (isWindows) {
    const shimSource = detectWindowsShimSource(normalized)
    if (shimSource) return shimSource
  }
  if (lower.includes('/npm/') || lower.includes('/node_modules/')) return 'npm-official'
  if (lower.includes('/homebrew/') || lower.includes('/usr/local/bin/') || lower.includes('/usr/bin/')) return 'npm-global'
  return 'unknown'
}

function normalizeCliInstallSource(cliSource) {
  if (cliSource === 'standalone' || cliSource === 'npm-zh') return 'chinese'
  if (cliSource === 'npm-official' || cliSource === 'npm-global') return 'official'
  return 'unknown'
}

function detectStandaloneSourceFromDir(dir) {
  try {
    const versionFile = path.join(dir, 'VERSION')
    if (fs.existsSync(versionFile)) {
      const pairs = Object.create(null)
      for (const line of fs.readFileSync(versionFile, 'utf8').split(/\r?\n/)) {
        const eq = line.indexOf('=')
        if (eq > 0) pairs[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim().toLowerCase()
      }
      const pkg = pairs.package || ''
      const edition = pairs.edition || ''
      if (pkg.includes('openclaw-zh') || pkg.includes('@qingchencloud')) return 'chinese'
      if (pkg === 'openclaw') return 'official'
      if (['zh', 'zh-cn', 'chinese', 'cn'].includes(edition)) return 'chinese'
      if (['en', 'official'].includes(edition)) return 'official'
    }
  } catch {}
  if (fs.existsSync(path.join(dir, 'node_modules', '@qingchencloud', 'openclaw-zh', 'package.json'))) return 'chinese'
  if (fs.existsSync(path.join(dir, 'node_modules', 'openclaw', 'package.json'))) return 'official'
  return null
}

function detectStandaloneSourceFromCliPath(cliPath) {
  const normalized = normalizeCliPath(cliPath)
  return normalized ? detectStandaloneSourceFromDir(path.dirname(normalized)) : null
}

function readVersionFromInstallation(cliPath) {
  const resolved = canonicalCliPath(cliPath)
  if (!resolved || !fs.existsSync(resolved)) return null
  const dir = path.dirname(resolved)
  const versionFile = path.join(dir, 'VERSION')
  try {
    if (fs.existsSync(versionFile)) {
      const lines = fs.readFileSync(versionFile, 'utf8').split(/\r?\n/)
      for (const line of lines) {
        if (line.startsWith('openclaw_version=')) {
          const version = line.split('=').slice(1).join('=').trim()
          if (version) return version
        }
      }
    }
  } catch {}
  const cliSource = classifyCliSource(resolved)
  const pkgNames = (cliSource === 'standalone' || cliSource === 'npm-zh')
    ? [path.join('@qingchencloud', 'openclaw-zh'), 'openclaw']
    : ['openclaw', path.join('@qingchencloud', 'openclaw-zh')]
  const pkgRoots = [path.join(dir, 'node_modules')]
  const parentDir = path.dirname(dir)
  if (parentDir && parentDir !== dir) pkgRoots.push(path.join(parentDir, 'node_modules'))
  for (const root of pkgRoots) {
    for (const pkgName of pkgNames) {
      const pkgPath = path.join(root, pkgName, 'package.json')
      try {
        if (!fs.existsSync(pkgPath)) continue
        const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
        if (version) return version
      } catch {}
    }
  }
  return null
}

function readWhereWhichOpenclawCandidates() {
  try {
    const cmd = isWindows ? 'where openclaw' : 'which -a openclaw 2>/dev/null'
    const output = execSync(cmd, { timeout: 3000, windowsHide: true, encoding: 'utf8' }).trim()
    if (!output) return []
    return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function readWindowsNpmGlobalPrefix() {
  if (!isWindows) return null
  const envPrefix = String(process.env.NPM_CONFIG_PREFIX || '').trim()
  if (envPrefix && envPrefix.toLowerCase() !== 'undefined') return envPrefix
  try {
    const prefix = execSync('npm config get prefix', { timeout: 5000, windowsHide: true, encoding: 'utf8' }).trim()
    if (prefix && prefix.toLowerCase() !== 'undefined') return prefix
  } catch {}
  return null
}

function addCommonOpenclawCandidates(candidates, seen) {
  // 便携模式：内置 OpenClaw CLI
  const bundledDir = bundledOpenclawBinDir()
  if (bundledDir) {
    addCliCandidate(candidates, seen, path.join(bundledDir, isWindows ? 'openclaw.cmd' : 'openclaw'))
  }
  if (isWindows) {
    const appdata = process.env.APPDATA || ''
    const localappdata = process.env.LOCALAPPDATA || ''
    const programFiles = process.env.ProgramFiles || ''
    const programFilesX86 = process.env['ProgramFiles(x86)'] || ''
    const userProfile = process.env.USERPROFILE || homedir()
    const standaloneDir = standaloneInstallDir()
    if (appdata) {
      addCliCandidate(candidates, seen, path.join(appdata, 'npm', 'openclaw.cmd'))
      addCliCandidate(candidates, seen, path.join(appdata, 'npm', 'openclaw'))
    }
    const customPrefix = readWindowsNpmGlobalPrefix()
    if (customPrefix) {
      addCliCandidate(candidates, seen, path.join(customPrefix, 'openclaw.cmd'))
      addCliCandidate(candidates, seen, path.join(customPrefix, 'openclaw.exe'))
      addCliCandidate(candidates, seen, path.join(customPrefix, 'openclaw'))
    }
    if (localappdata) {
      addCliCandidate(candidates, seen, path.join(localappdata, 'Programs', 'OpenClaw', 'openclaw.cmd'))
      addCliCandidate(candidates, seen, path.join(localappdata, 'OpenClaw', 'openclaw.cmd'))
      addCliCandidate(candidates, seen, path.join(localappdata, 'Programs', 'nodejs', 'openclaw.cmd'))
    }
    addCliCandidate(candidates, seen, path.join(standaloneDir, 'openclaw.cmd'))
    addCliCandidate(candidates, seen, path.join(standaloneDir, 'openclaw.exe'))
    addCliCandidate(candidates, seen, path.join(userProfile, '.openclaw-bin', 'openclaw.cmd'))
    if (programFiles) {
      addCliCandidate(candidates, seen, path.join(programFiles, 'nodejs', 'openclaw.cmd'))
      addCliCandidate(candidates, seen, path.join(programFiles, 'OpenClaw', 'openclaw.cmd'))
    }
    if (programFilesX86) {
      addCliCandidate(candidates, seen, path.join(programFilesX86, 'nodejs', 'openclaw.cmd'))
    }
    for (const drive of ['C', 'D', 'E', 'F', 'G']) {
      addCliCandidate(candidates, seen, `${drive}:\\OpenClaw\\openclaw.cmd`)
      addCliCandidate(candidates, seen, `${drive}:\\AI\\OpenClaw\\openclaw.cmd`)
    }
    return
  }

  const home = homedir()
  addCliCandidate(candidates, seen, path.join(home, '.openclaw-bin', 'openclaw'))
  addCliCandidate(candidates, seen, path.join(home, '.npm-global', 'bin', 'openclaw'))
  addCliCandidate(candidates, seen, path.join(home, '.local', 'bin', 'openclaw'))
  addCliCandidate(candidates, seen, path.join(home, '.nvm', 'current', 'bin', 'openclaw'))
  addCliCandidate(candidates, seen, path.join(home, '.volta', 'bin', 'openclaw'))
  addCliCandidate(candidates, seen, path.join(home, '.fnm', 'current', 'bin', 'openclaw'))
  addCliCandidate(candidates, seen, path.join(home, 'bin', 'openclaw'))
  addCliCandidate(candidates, seen, '/opt/openclaw/openclaw')
  addCliCandidate(candidates, seen, '/opt/homebrew/bin/openclaw')
  addCliCandidate(candidates, seen, '/usr/local/bin/openclaw')
  addCliCandidate(candidates, seen, '/usr/bin/openclaw')
  addCliCandidate(candidates, seen, '/snap/bin/openclaw')
}

function collectPreferredCliCandidates() {
  const candidates = []
  const seen = new Set()
  const bundledDir = bundledOpenclawBinDir()
  if (bundledDir) {
    addCliCandidate(candidates, seen, path.join(bundledDir, isWindows ? 'openclaw.cmd' : 'openclaw'))
  }
  addConfiguredOpenclawCandidates(candidates, seen)
  for (const candidate of readWhereWhichOpenclawCandidates()) addCliCandidate(candidates, seen, candidate)
  const envPath = process.env.PATH || ''
  for (const dir of envPath.split(path.delimiter)) {
    const trimmed = dir.trim()
    if (!trimmed) continue
    if (isWindows) {
      addCliCandidate(candidates, seen, path.join(trimmed, 'openclaw.cmd'))
      addCliCandidate(candidates, seen, path.join(trimmed, 'openclaw'))
    } else {
      addCliCandidate(candidates, seen, path.join(trimmed, 'openclaw'))
    }
  }
  if (!isWindows) addCliCandidate(candidates, seen, findOpenclawBin())
  addCommonOpenclawCandidates(candidates, seen)
  return candidates
}

function collectAllCliCandidates() {
  const candidates = []
  const seen = new Set()
  addConfiguredOpenclawCandidates(candidates, seen)
  addCommonOpenclawCandidates(candidates, seen)
  for (const candidate of collectPreferredCliCandidates()) addCliCandidate(candidates, seen, candidate)
  return candidates
}

function readBoundOpenclawCliPath() {
  const normalized = normalizeCliPath(readPanelConfig()?.openclawCliPath || '')
  if (!normalized || !fs.existsSync(normalized) || isRejectedCliPath(normalized)) return null
  return normalized
}

function bundledOpenclawCliPath() {
  const bundledDir = bundledOpenclawBinDir()
  if (!bundledDir) return null
  const cliPath = normalizeCliPath(path.join(bundledDir, isWindows ? 'openclaw.cmd' : 'openclaw'))
  if (!cliPath || !fs.existsSync(cliPath) || isRejectedCliPath(cliPath)) return null
  return cliPath
}

function resolveOpenclawCliPath() {
  const bundled = bundledOpenclawCliPath()
  if (bundled) return bundled
  const bound = readBoundOpenclawCliPath()
  if (bound) return bound
  return collectPreferredCliCandidates()[0] || null
}

function scanAllOpenclawInstallations(activePath = resolveOpenclawCliPath()) {
  const activeIdentity = scanCliIdentity(activePath)
  return collectAllCliCandidates().map(candidate => ({
    path: candidate,
    source: classifyCliSource(candidate) || 'unknown',
    version: readVersionFromInstallation(candidate),
    active: !!activeIdentity && scanCliIdentity(candidate) === activeIdentity,
  })).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const sourceCmp = String(a.source || '').localeCompare(String(b.source || ''))
    if (sourceCmp !== 0) return sourceCmp
    return String(a.path || '').localeCompare(String(b.path || ''))
  })
}

function resolveOpenclawCliInput(rawPath) {
  const normalized = normalizeCliPath(rawPath)
  if (!normalized) return null
  if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
    const candidates = isWindows
      ? [path.join(normalized, 'openclaw.cmd'), path.join(normalized, 'openclaw.exe'), path.join(normalized, 'openclaw')]
      : [path.join(normalized, 'openclaw')]
    for (const candidate of candidates) {
      const resolved = normalizeCliPath(candidate)
      if (resolved && fs.existsSync(resolved) && !isRejectedCliPath(resolved)) return resolved
    }
    return null
  }
  if (!fs.existsSync(normalized) || isRejectedCliPath(normalized)) return null
  return normalized
}

function openclawProcessSpec(args = []) {
  const cliPath = resolveOpenclawCliPath()
  if (!cliPath) throw new Error('openclaw CLI 未安装')
  if (isWindows) {
    const cliArg = /[\s&()]/.test(cliPath) ? `"${cliPath}"` : cliPath
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', cliArg, ...args],
    }
  }
  return { command: cliPath, args }
}

function readDotEnvVars(envPath) {
  const vars = {}
  try {
    if (!fs.existsSync(envPath)) return vars
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq > 0) vars[t.slice(0, eq).trim()] = t.slice(eq + 1)
    }
  } catch {}
  return vars
}

function isPlaceholderApiKey(value) {
  const key = String(value || '').trim()
  const lower = key.toLowerCase()
  return !key
    || key.includes('*')
    || key.includes('鈥')
    || key.startsWith('${')
    || key.startsWith('%')
    || key.startsWith('<')
    || lower === 'maskedkey'
    || lower === 'your_api_key'
    || lower === 'replace_me'
    || lower === 'superclaw-login-required'
    || lower === 'test-minimax-placeholder-key-not-real'
    || lower.includes('placeholder')
    || lower.includes('minimax_api_key')
    || lower.includes('openai_api_key')
}

function normalizeApiKey(value) {
  if (value == null || typeof value === 'object') return ''
  let key = String(value || '').trim()
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim()
  }
  return isPlaceholderApiKey(key) ? '' : key
}

function pickOpenClawMiniMaxApiKey(...values) {
  for (const value of values) {
    const key = normalizeApiKey(value)
    if (key) return key
  }
  return ''
}

function resolveOpenClawMiniMaxConfig(resourcesRoot, dataRoot) {
  const safeResourcesRoot = resourcesRoot ? path.resolve(resourcesRoot) : null
  const safeDataRoot = dataRoot ? path.resolve(dataRoot) : null
  if (!safeResourcesRoot || !safeDataRoot || !isPathInside(safeResourcesRoot, safeDataRoot)) {
    return { provider: MINIMAX_TEST_DEFAULTS.providerId, baseUrl: MINIMAX_TEST_DEFAULTS.baseUrl, model: MINIMAX_TEST_DEFAULTS.model, apiKey: '' }
  }

  const openclawPath = path.join(safeDataRoot, '.openclaw', 'openclaw.json')
  const agentModelsPath = path.join(safeDataRoot, '.openclaw', 'agents', 'main', 'agent', 'models.json')
  const openclaw = readJsonFileRelaxed(openclawPath) || {}
  const agentModels = readJsonFileRelaxed(agentModelsPath) || {}
  const openclawProviderId = openClawProviderIdForProfile(MINIMAX_TEST_DEFAULTS)
  const apiKey = pickOpenClawMiniMaxApiKey(
    process.env.OPENCLAW_MINIMAX_API_KEY,
    process.env.MINIMAX_CN_API_KEY,
    process.env.MINIMAX_API_KEY,
    process.env.OPENAI_API_KEY,
    openclaw.providers?.minimax?.apiKey,
    openclaw.models?.providers?.[openclawProviderId]?.apiKey,
    openclaw.modelProviders?.minimax?.apiKey,
    openclaw.providerConfigs?.minimax?.apiKey,
    openclaw.env?.MINIMAX_API_KEY,
    openclaw.env?.OPENAI_API_KEY,
    agentModels.providers?.[openclawProviderId]?.apiKey,
    agentModels.minimax?.apiKey,
    agentModels.models?.providers?.[openclawProviderId]?.apiKey
  )
  const provider = openclaw.models?.providers?.[openclawProviderId] || {}
  const normalized = normalizeProviderProfileConfig({
    providerId: MINIMAX_TEST_DEFAULTS.providerId,
    baseUrl: provider.baseUrl || MINIMAX_TEST_DEFAULTS.baseUrl,
    model: provider.models?.[0]?.id || provider.models?.[0]?.model || MINIMAX_TEST_DEFAULTS.model,
  })

  return {
    provider: normalized.providerId,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    apiKey,
    paths: { openclaw: openclawPath, openclawAgent: agentModelsPath },
  }
}

function openclawMiniMaxKeyFingerprint(apiKey) {
  const key = normalizeApiKey(apiKey)
  return key ? crypto.createHash('sha256').update(key).digest('hex').slice(0, 8) : ''
}

function openclawMiniMaxGatewayConfig() {
  const resourcesRoot = appResourcesDir() || path.join(appRootDir(), 'src-tauri', 'resources')
  const dataRoot = path.join(resourcesRoot, 'data')
  const directConfig = resolveOpenClawMiniMaxConfig(resourcesRoot, dataRoot)
  const effective = getEffectiveModelConfig('openclaw', {
    directConfig: {
      ...directConfig,
      configPath: directConfig.paths?.openclaw || '',
    },
    configPath: directConfig.paths?.openclaw || '',
  })
  return { ...directConfig, effective }
}

function authYyapiKitEffectiveModelConfig(agentName = 'openclaw', options = {}) {
  const name = cleanMiniMaxValue(agentName || 'openclaw').toLowerCase()
  const env = options.env || process.env
  const yyapiConfig = readYyapiConfig(env, options.yyapiConfig || {})
  let directConfig = options.directConfig || {}
  if (!options.directConfig && name === 'openclaw') {
    const resourcesRoot = appResourcesDir() || path.join(appRootDir(), 'src-tauri', 'resources')
    const dataRoot = path.join(resourcesRoot, 'data')
    const resolved = resolveOpenClawMiniMaxConfig(resourcesRoot, dataRoot)
    directConfig = {
      ...resolved,
      configPath: resolved.paths?.openclaw || '',
    }
  }
  return getEffectiveModelConfig(name, {
    env,
    directConfig,
    yyapiConfig,
    configPath: directConfig.configPath || yyapiConfig.configPath || '',
  })
}

function authYyapiKitRelayConfig(agentName = 'openclaw') {
  const effective = authYyapiKitEffectiveModelConfig(agentName)
  if (effective.modelSource === 'yyapi') {
    return {
      ...yyapiRelaySummary(readYyapiConfig(process.env)),
      effective,
    }
  }
  return {
    mode: 'DIRECT',
    provider: effective.provider,
    baseUrl: effective.baseUrl,
    model: effective.model,
    apiKeyConfigured: effective.apiKeyConfigured,
    apiKeyFingerprint: effective.apiKeyFingerprint,
    status: effective.status,
    code: effective.code,
    effective,
  }
}

async function handleAuthYyapiKitRestApi(req, res, url) {
  if (!url.pathname.startsWith('/api/')) return false
  if (url.pathname === '/api/runtime-mode') {
    if (req.method !== 'GET') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return true
    }
    sendJsonResponse(res, 200, { ok: true, runtime: getRuntimeMode(process.env) })
    return true
  }
  if (url.pathname === '/api/auth/status') {
    if (req.method !== 'GET') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return true
    }
    const status = getAuthStatus(process.env)
    sendJsonResponse(res, 200, { ok: true, status, guard: getAuthGuardDecision(status) })
    return true
  }
  if (url.pathname === '/api/auth/login') {
    if (req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return true
    }
    try {
      const body = await readBody(req)
      const status = loginAuthSession(body, process.env)
      sendJsonResponse(res, 200, {
        ok: true,
        message: '登录状态已保存。',
        status,
        guard: getAuthGuardDecision(status),
      })
    } catch (error) {
      sendJsonResponse(res, 400, {
        ok: false,
        code: error.code || 'AUTH_LOGIN_FAILED',
        message: error.message || '登录失败',
      })
    }
    return true
  }
  if (url.pathname === '/api/auth/logout') {
    if (req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return true
    }
    const status = logoutAuthSession(process.env)
    sendJsonResponse(res, 200, {
      ok: true,
      message: '已退出登录。',
      status,
      guard: getAuthGuardDecision(status),
    })
    return true
  }
  if (url.pathname === '/api/auth/activate') {
    if (req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return true
    }
    try {
      const body = await readBody(req)
      const status = activateAuthSession(body, process.env)
      sendJsonResponse(res, 200, {
        ok: true,
        message: '激活状态已保存。',
        status,
        guard: getAuthGuardDecision(status),
      })
    } catch (error) {
      sendJsonResponse(res, 400, {
        ok: false,
        code: error.code || 'AUTH_ACTIVATION_FAILED',
        message: error.message || '激活失败',
      })
    }
    return true
  }
  if (url.pathname === '/api/effective-model-config') {
    if (req.method !== 'GET') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return true
    }
    const agent = url.searchParams.get('agent') || 'openclaw'
    sendJsonResponse(res, 200, { ok: true, config: authYyapiKitEffectiveModelConfig(agent) })
    return true
  }
  if (url.pathname === '/api/relay-config') {
    if (req.method !== 'GET') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return true
    }
    const agent = url.searchParams.get('agent') || 'openclaw'
    sendJsonResponse(res, 200, { ok: true, relay: authYyapiKitRelayConfig(agent) })
    return true
  }
  if (url.pathname === '/api/test-relay') {
    if (req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return true
    }
    const body = await readBody(req)
    const agent = cleanMiniMaxValue(body.agent || body.agentName || url.searchParams.get('agent') || 'openclaw')
    const effective = authYyapiKitEffectiveModelConfig(agent)
    sendJsonResponse(res, 200, {
      ok: effective.status === 'ready',
      language: 'zh-CN',
      message: effective.status === 'ready' ? '模型配置检查通过。' : '模型配置未就绪。',
      code: effective.code,
      config: effective,
    })
    return true
  }
  return false
}

function openclawMiniMaxGatewayEnv() {
  const minimaxConfig = openclawMiniMaxGatewayConfig()
  if (minimaxConfig.effective?.modelSource !== 'direct') return {}
  if (minimaxConfig.effective?.status !== 'ready') return {}
  if (!minimaxConfig.apiKey) return {}
  return {
    ...envForProviderProfile(minimaxConfig, minimaxConfig.apiKey),
    SUPERCLAW_MINIMAX_BASE_URL: minimaxConfig.baseUrl,
    SUPERCLAW_MINIMAX_MODEL: minimaxConfig.model,
  }
}

function requireOpenClawMiniMaxGatewayConfig() {
  const minimaxConfig = openclawMiniMaxGatewayConfig()
  if (minimaxConfig.effective?.status === 'config_conflict') {
    const error = new Error('OpenClaw 模型配置冲突：当前 release/yyapi 模式要求 yyapi 接管，但检测到 direct MiniMax 配置仍在生效。')
    error.code = 'CONFIG_CONFLICT'
    error.details = minimaxConfig.effective
    throw error
  }
  if (minimaxConfig.effective?.modelSource === 'yyapi' && minimaxConfig.effective?.status !== 'ready') {
    const error = new Error('OpenClaw 模型配置未就绪：当前 release/yyapi 模式必须由 yyapi 提供模型配置，禁止 fallback 到 direct MiniMax。')
    error.code = minimaxConfig.effective?.code || 'YYAPI_MODEL_CONFIG_REQUIRED'
    error.details = minimaxConfig.effective
    throw error
  }
  if (!minimaxConfig.apiKey) {
    const error = new Error('OpenClaw MiniMax API Key 未配置，请先在模型设置中保存 MiniMax API Key。')
    error.code = 'OPENCLAW_MINIMAX_API_KEY_REQUIRED'
    throw error
  }
  return minimaxConfig
}

function openclawGatewayLaunchConfigDir() {
  const rootHash = crypto.createHash('sha256').update(appRootDir()).digest('hex').slice(0, 12)
  return path.join(os.tmpdir(), 'superclaw-openclaw-gateway-config', rootHash)
}

function openclawGatewayLaunchConfigPath() {
  return path.join(openclawGatewayLaunchConfigDir(), 'openclaw.gateway.json')
}

function openclawEnvSecretRef(name) {
  return { source: 'env', provider: 'default', id: name }
}

function normalizeOpenClawGatewayModelEntry(input, defaults = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const fallbackModel = defaults.model || MINIMAX_TEST_DEFAULTS.model
  const id = String(source.id || source.model || fallbackModel).trim() || fallbackModel
  return {
    ...source,
    id,
    name: String(source.name || id),
    api: String(source.api || defaults.api || 'openai-completions'),
    reasoning: source.reasoning !== undefined ? source.reasoning : true,
    input: Array.isArray(source.input) && source.input.length ? source.input : ['text'],
    contextWindow: Number(source.contextWindow || defaults.contextWindow || 204800),
    maxTokens: Number(source.maxTokens || defaults.maxTokens || 131072),
  }
}

function normalizeOpenClawGatewayProvider(input, defaults = {}) {
  const provider = input && typeof input === 'object' ? { ...input } : {}
  const fallbackModel = defaults.model || MINIMAX_TEST_DEFAULTS.model
  const modelId = String(
    provider.model ||
    provider.models?.[0]?.id ||
    provider.models?.[0]?.model ||
    fallbackModel
  ).trim() || fallbackModel

  delete provider.model
  delete provider.type
  delete provider.name
  provider.baseUrl = String(provider.baseUrl || defaults.baseUrl || MINIMAX_TEST_DEFAULTS.baseUrl)
  provider.api = String(provider.api || defaults.api || 'openai-completions')
  provider.apiKey = openclawEnvSecretRef('OPENCLAW_MINIMAX_API_KEY')
  provider.models = Array.isArray(provider.models) && provider.models.length
    ? provider.models.map(model => normalizeOpenClawGatewayModelEntry(model, {
      api: provider.api,
      model: modelId,
      contextWindow: defaults.contextWindow,
      maxTokens: defaults.maxTokens,
    }))
    : [normalizeOpenClawGatewayModelEntry({ id: modelId }, {
      api: provider.api,
      contextWindow: defaults.contextWindow,
      maxTokens: defaults.maxTokens,
    })]

  return provider
}

function prepareOpenClawGatewayLaunchConfig(minimaxConfig = requireOpenClawMiniMaxGatewayConfig()) {
  if (!fs.existsSync(CONFIG_PATH)) return { path: CONFIG_PATH, generated: false, reason: 'source_config_missing' }
  const cfg = JSON.parse(decodeJsonFileContent(CONFIG_PATH))
  cfg.models = cfg.models && typeof cfg.models === 'object' ? { ...cfg.models } : {}
  cfg.models.providers = cfg.models.providers && typeof cfg.models.providers === 'object'
    ? { ...cfg.models.providers }
    : {}
  normalizeOpenClawMiniMaxProviderAliases(cfg)

  const directDefaults = {
    api: 'openai-completions',
    baseUrl: minimaxConfig.baseUrl || 'https://api.minimaxi.com/v1',
    model: minimaxConfig.model || MINIMAX_TEST_DEFAULTS.model,
    apiKeyEnv: normalizeProviderProfileConfig(minimaxConfig).env.openClawApiKey,
    contextWindow: 204800,
    maxTokens: 131072,
  }

  const openclawProviderId = openClawProviderIdForProfile(minimaxConfig)
  const sourceProvider = cfg.models.providers[openclawProviderId] && typeof cfg.models.providers[openclawProviderId] === 'object'
    ? cfg.models.providers[openclawProviderId]
    : {}
  const fallbackProvider = cfg.models.providers['minimax-cn'] && typeof cfg.models.providers['minimax-cn'] === 'object'
    ? cfg.models.providers['minimax-cn']
    : {}
  cfg.models.providers[openclawProviderId] = normalizeOpenClawGatewayProvider({
    ...fallbackProvider,
    ...sourceProvider,
    baseUrl: sourceProvider.baseUrl || fallbackProvider.baseUrl || directDefaults.baseUrl,
    api: sourceProvider.api || fallbackProvider.api || directDefaults.api,
    models: Array.isArray(sourceProvider.models) && sourceProvider.models.length
      ? sourceProvider.models
      : fallbackProvider.models,
  }, directDefaults)

  delete cfg.models.providers['minimax-cn']
  delete cfg.models.mode
  delete cfg.models.default
  delete cfg.models.defaultProvider
  delete cfg.models.defaultModel

  const dir = openclawGatewayLaunchConfigDir()
  fs.mkdirSync(dir, { recursive: true })
  const target = openclawGatewayLaunchConfigPath()
  fs.writeFileSync(target, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
  return { path: target, generated: true, provider: openclawProviderId, model: directDefaults.model, baseUrl: directDefaults.baseUrl }
}

function openclawRuntimeEnv(extra = {}) {
  return {
    ...process.env,
    OPENCLAW_HOME: OPENCLAW_DIR,
    OPENCLAW_STATE_DIR: OPENCLAW_DIR,
    OPENCLAW_CONFIG_PATH: CONFIG_PATH,
    ...readDotEnvVars(path.join(OPENCLAW_DIR, '.env')),
    ...openclawMiniMaxGatewayEnv(),
    ...(extra || {}),
  }
}

function normalizeBackgroundStdio(stdio) {
  if (!stdio || stdio === 'inherit') return ['ignore', 'pipe', 'pipe']
  return stdio
}

function automaticAgentSpawnOptions(options = {}) {
  return {
    ...options,
    windowsHide: true,
    detached: false,
    stdio: normalizeBackgroundStdio(options.stdio),
  }
}

function spawnOpenclaw(args, options = {}) {
  const spec = openclawProcessSpec(args)
  const { env, ...rest } = options
  return spawn(spec.command, spec.args, {
    ...automaticAgentSpawnOptions(rest),
    env: openclawRuntimeEnv(env),
  })
}

function spawnOpenclawSync(args, options = {}) {
  const spec = openclawProcessSpec(args)
  const { env, ...rest } = options
  return spawnSync(spec.command, spec.args, {
    ...automaticAgentSpawnOptions(rest),
    env: openclawRuntimeEnv(env),
  })
}

function openclawResultOutput(result) {
  return [result?.stdout, result?.stderr].map(value => value == null ? '' : String(value)).join('').trim()
}

function ensureSuccessfulOpenclaw(result, action) {
  if (result?.error) throw new Error(`${action}: ${result.error.message || result.error}`)
  if (typeof result?.status === 'number' && result.status !== 0) {
    throw new Error(`${action}: ${openclawResultOutput(result) || `exit code ${result.status}`}`)
  }
  return result
}

function execOpenclawSync(args, options = {}, action = `执行 openclaw ${args.join(' ')} 失败`) {
  const result = spawnOpenclawSync(args, { encoding: 'utf8', ...options })
  return openclawResultOutput(ensureSuccessfulOpenclaw(result, action))
}

const GIT_HTTPS_REWRITES = [
  'ssh://git@github.com/',
  'ssh://git@github.com',
  'ssh://git@://github.com/',
  'git@github.com:',
  'git://github.com/',
  'git+ssh://git@github.com/'
]

// === 异步任务存储 ===
const _taskStore = new Map()   // taskId → task object
const MAX_TASK_HISTORY = 50
const _agentScriptSyncCache = new Map() // `${endpoint}:${containerId}` → 脚本 hash

function createTask(containerId, containerName, nodeId, message) {
  const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const task = {
    id,
    containerId,
    containerName: containerName || containerId.slice(0, 12),
    nodeId: nodeId || null,
    message,
    status: 'running',   // running | completed | error
    result: null,
    error: null,
    events: [],
    startedAt: Date.now(),
    completedAt: null,
  }
  _taskStore.set(id, task)
  // 清理旧任务
  if (_taskStore.size > MAX_TASK_HISTORY) {
    const oldest = [..._taskStore.keys()].slice(0, _taskStore.size - MAX_TASK_HISTORY)
    oldest.forEach(k => _taskStore.delete(k))
  }
  return task
}

// 语义化版本比较
function parseVersion(value) {
  return String(value || '').split(/[^0-9]/).filter(Boolean).map(Number)
}
function versionCompare(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}
function versionGe(a, b) {
  return versionCompare(a, b) >= 0
}
function versionGt(a, b) {
  return versionCompare(a, b) > 0
}

// 提取基础版本号（去掉 -zh.x / -nightly.xxx 等后缀）
function baseVersion(v) {
  return String(v || '').split('-')[0]
}

// 判断 CLI 版本是否与推荐版匹配（考虑汉化版 -zh.x 后缀差异）
function versionsMatch(cliVer, recommended) {
  if (cliVer === recommended) return true
  return baseVersion(cliVer) === baseVersion(recommended)
}

// 判断推荐版是否真的比当前版本更新（忽略 -zh.x 后缀）
function recommendedIsNewer(recommended, current) {
  return versionGt(baseVersion(recommended), baseVersion(current))
}

function loadVersionPolicy() {
  try {
    return JSON.parse(fs.readFileSync(VERSION_POLICY_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function r2Config() {
  const policy = loadVersionPolicy()
  return policy?.r2 || { enabled: false }
}

function standaloneConfig() {
  const policy = loadVersionPolicy()
  return policy?.standalone || { enabled: false }
}

function findPanelPolicyEntry(policy, currentVersion) {
  const exact = policy?.panels?.[currentVersion]
  if (exact) return exact

  const currentParts = parseVersion(currentVersion)
  if (currentParts.length < 2) return null

  let matched = null
  let matchedParts = null
  for (const [version, entry] of Object.entries(policy?.panels || {})) {
    const parts = parseVersion(version)
    if (parts.length < 2) continue
    if (parts[0] !== currentParts[0] || parts[1] !== currentParts[1]) continue
    if (versionCompare(version, currentVersion) > 0) continue
    if (!matchedParts || compareParsedVersion(parts, matchedParts) > 0) {
      matched = entry
      matchedParts = parts
    }
  }
  return matched
}

function compareParsedVersion(a = [], b = []) {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = Number(a[i] || 0)
    const bv = Number(b[i] || 0)
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

function standalonePlatformKey() {
  const arch = process.arch
  const plat = process.platform
  if (plat === 'win32' && arch === 'x64') return 'win-x64'
  if (plat === 'darwin' && arch === 'arm64') return 'mac-arm64'
  if (plat === 'darwin' && arch === 'x64') return 'mac-x64'
  if (plat === 'linux' && arch === 'x64') return 'linux-x64'
  if (plat === 'linux' && arch === 'arm64') return 'linux-arm64'
  return 'unknown'
}

function standaloneInstallDir() {
  if (isWindows) return path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenClaw')
  return path.join(os.homedir(), '.openclaw-bin')
}

async function _tryStandaloneInstall(version, logs, overrideBaseUrl = null) {
  const cfg = standaloneConfig()
  if (!cfg.enabled || !cfg.baseUrl) return false
  const platform = standalonePlatformKey()
  if (platform === 'unknown') throw new Error('当前平台不支持 standalone 安装包')
  const installDir = standaloneInstallDir()

  logs.push('📦 尝试 standalone 独立安装包（汉化版专属，自带 Node.js 运行时，无需 npm）')
  logs.push('查询最新版本...')
  const manifestUrl = `${cfg.baseUrl}/latest.json`
  const resp = await globalThis.fetch(manifestUrl, { signal: AbortSignal.timeout(10000) })
  if (!resp.ok) throw new Error(`standalone 清单不可用 (HTTP ${resp.status})`)
  const manifest = await resp.json()

  // 兼容两种 latest.json 格式：
  // 新格式（CI 生成）: { "editions": { "zh": { "version": "...", "base_url": "..." } } }
  // 旧格式（兼容）:   { "version": "...", "base_url": "..." }
  const editionObj = manifest?.editions?.zh
  const remoteVersion = editionObj?.version || manifest.version
  if (!remoteVersion) throw new Error('standalone 清单缺少 version 字段')
  if (version !== 'latest' && !versionsMatch(remoteVersion, version)) {
    throw new Error(`standalone 版本 ${remoteVersion} 与请求版本 ${version} 不匹配`)
  }

  const archivePrefix = editionObj ? 'openclaw-zh' : 'openclaw'
  const manifestBaseUrl = editionObj?.base_url || manifest.base_url
  const remoteBase = overrideBaseUrl || manifestBaseUrl || `${cfg.baseUrl}/${remoteVersion}`
  const ext = isWindows ? 'zip' : 'tar.gz'
  const filename = `${archivePrefix}-${remoteVersion}-${platform}.${ext}`
  const downloadUrl = `${remoteBase}/${filename}`

  logs.push(`从 CDN 下载: ${filename}`)

  const tmpPath = path.join(os.tmpdir(), filename)
  const dlResp = await globalThis.fetch(downloadUrl, { signal: AbortSignal.timeout(600000) })
  if (!dlResp.ok) throw new Error(`standalone 下载失败 (HTTP ${dlResp.status})`)
  const buffer = Buffer.from(await dlResp.arrayBuffer())
  const sizeMb = (buffer.length / 1048576).toFixed(0)
  logs.push(`下载完成 (${sizeMb}MB)，解压安装中...`)
  fs.writeFileSync(tmpPath, buffer)

  // 清理旧安装 & 解压
  if (fs.existsSync(installDir)) {
    fs.rmSync(installDir, { recursive: true, force: true })
  }
  fs.mkdirSync(installDir, { recursive: true })

  if (isWindows) {
    // Windows: 用 PowerShell 解压 zip
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tmpPath}' -DestinationPath '${installDir}' -Force"`, { windowsHide: true })
    // 处理嵌套 openclaw/ 目录
    const nested = path.join(installDir, 'openclaw')
    if (fs.existsSync(nested) && fs.existsSync(path.join(nested, 'node.exe'))) {
      for (const entry of fs.readdirSync(nested)) {
        fs.renameSync(path.join(nested, entry), path.join(installDir, entry))
      }
      fs.rmSync(nested, { recursive: true, force: true })
    }
  } else {
    // Unix: tar 解压
    execSync(`tar -xzf "${tmpPath}" -C "${installDir}" --strip-components=1`, { windowsHide: true })
  }

  try { fs.unlinkSync(tmpPath) } catch {}

  // 验证
  const binFile = isWindows ? 'openclaw.cmd' : 'openclaw'
  if (!fs.existsSync(path.join(installDir, binFile))) {
    throw new Error('standalone 解压后未找到 openclaw 可执行文件')
  }

  logs.push(`✅ standalone 安装完成 (${remoteVersion})`)
  logs.push(`安装目录: ${installDir}`)
  return true
}

function r2PlatformKey() {
  const arch = process.arch // x64, arm64, etc.
  const plat = process.platform // linux, darwin, win32
  if (plat === 'win32' && arch === 'x64') return 'win-x64'
  if (plat === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (plat === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (plat === 'linux' && arch === 'x64') return 'linux-x64'
  if (plat === 'linux' && arch === 'arm64') return 'linux-arm64'
  return 'unknown'
}

async function _tryR2Install(version, source, logs) {
  const r2 = r2Config()
  if (!r2.enabled || !r2.baseUrl) return false
  const platform = r2PlatformKey()

  logs.push('尝试从 CDN 加速下载...')
  const manifestUrl = `${r2.baseUrl}/latest.json`
  const resp = await globalThis.fetch(manifestUrl, { signal: AbortSignal.timeout(10000) })
  if (!resp.ok) throw new Error(`CDN 清单不可用 (HTTP ${resp.status})`)
  const manifest = await resp.json()

  const sourceKey = source === 'official' ? 'official' : 'chinese'
  const sourceObj = manifest?.[sourceKey]
  if (!sourceObj) throw new Error(`CDN 无 ${sourceKey} 配置`)

  const cdnVersion = sourceObj.version || version
  if (version !== 'latest' && !versionsMatch(cdnVersion, version)) {
    throw new Error(`CDN 版本 ${cdnVersion} 与请求版本 ${version} 不匹配`)
  }

  // 优先平台特定预装归档（直接解压，零网络依赖），其次通用 tarball（需要 npm install）
  const asset = (platform !== 'unknown') ? sourceObj.assets?.[platform] : null
  const tarball = sourceObj.tarball
  const useAsset = !!asset?.url
  const useTarball = !useAsset && !!tarball?.url

  if (!useAsset && !useTarball) {
    throw new Error(`CDN 无 ${sourceKey} 可用归档（平台: ${platform}）`)
  }

  const archiveUrl = useAsset ? asset.url : tarball.url
  const expectedSha = useAsset ? (asset.sha256 || '') : (tarball.sha256 || '')
  const expectedSize = useAsset ? (asset.size || 0) : (tarball.size || 0)
  const sizeMb = expectedSize ? `${(expectedSize / 1048576).toFixed(0)}MB` : '未知大小'
  const mode = useAsset ? `${platform} 预装归档` : '通用 tarball'
  logs.push(`CDN 下载: ${cdnVersion} (${mode}, ${sizeMb})`)

  // 下载到临时文件
  const tmpPath = path.join(os.tmpdir(), `openclaw-cdn.tgz`)
  const dlResp = await globalThis.fetch(archiveUrl, { signal: AbortSignal.timeout(300000) })
  if (!dlResp.ok) throw new Error(`CDN 下载失败 (HTTP ${dlResp.status})`)
  const buffer = Buffer.from(await dlResp.arrayBuffer())
  fs.writeFileSync(tmpPath, buffer)

  // SHA256 校验
  if (expectedSha) {
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')
    if (hash !== expectedSha) {
      fs.unlinkSync(tmpPath)
      throw new Error(`SHA256 校验失败: 期望 ${expectedSha}, 实际 ${hash}`)
    }
    logs.push('SHA256 校验通过 ✓')
  }

  if (useTarball) {
    // 通用 tarball 模式：npm install -g ./file.tgz（全平台通用，npm 自动处理原生模块）
    logs.push('通用 tarball 模式，执行 npm install...')
    const npmBin = isWindows ? 'npm.cmd' : 'npm'
    try {
      execSync(`${npmBin} install -g "${tmpPath}" --force 2>&1`, { timeout: 120000, windowsHide: true })
      logs.push('npm install 完成 ✓')
    } catch (e) {
      try { fs.unlinkSync(tmpPath) } catch {}
      throw new Error('npm install -g tarball 失败: ' + (e.stderr?.toString() || e.message).slice(-300))
    }
  } else {
    // 平台特定归档模式：直接解压到 npm 全局 node_modules
    let modulesDir
    if (isWindows) {
      const prefix = readWindowsNpmGlobalPrefix() || path.join(process.env.APPDATA || '', 'npm')
      modulesDir = path.join(prefix, 'node_modules')
    } else if (isMac) {
      modulesDir = fs.existsSync('/opt/homebrew/lib/node_modules')
        ? '/opt/homebrew/lib/node_modules'
        : '/usr/local/lib/node_modules'
    } else {
      try {
        const prefix = execSync('npm config get prefix', { encoding: 'utf8', timeout: 5000 }).trim()
        modulesDir = path.join(prefix, 'lib', 'node_modules')
      } catch {
        modulesDir = '/usr/local/lib/node_modules'
      }
    }
    if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir, { recursive: true })

    const qcDir = path.join(modulesDir, '@qingchencloud')
    if (fs.existsSync(qcDir)) fs.rmSync(qcDir, { recursive: true, force: true })

    logs.push(`解压到 ${modulesDir}`)
    execSync(`tar -xzf "${tmpPath}" -C "${modulesDir}"`, { timeout: 60000, windowsHide: true })

    // 归档内目录可能是 qingchencloud/（Windows tar 不支持 @ 前缀），需要重命名
    const noAtDir = path.join(modulesDir, 'qingchencloud')
    if (fs.existsSync(noAtDir) && !fs.existsSync(qcDir)) {
      fs.renameSync(noAtDir, qcDir)
      logs.push('目录已修正: qingchencloud → @qingchencloud')
    }

    // 创建 bin 链接
    let binDir
    if (isWindows) {
      binDir = readWindowsNpmGlobalPrefix() || path.join(process.env.APPDATA || '', 'npm')
    } else if (isMac) {
      binDir = fs.existsSync('/opt/homebrew/bin') ? '/opt/homebrew/bin' : '/usr/local/bin'
    } else {
      try {
        const prefix = execSync('npm config get prefix', { encoding: 'utf8', timeout: 5000 }).trim()
        binDir = path.join(prefix, 'bin')
      } catch {
        binDir = '/usr/local/bin'
      }
    }
    const openclawJs = path.join(modulesDir, '@qingchencloud', 'openclaw-zh', 'bin', 'openclaw.js')
    if (fs.existsSync(openclawJs)) {
      if (isWindows) {
        const cmdContent = `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "${openclawJs}" %*\r\n`
        fs.writeFileSync(path.join(binDir, 'openclaw.cmd'), cmdContent)
      } else {
        const linkPath = path.join(binDir, 'openclaw')
        try { fs.unlinkSync(linkPath) } catch {}
        fs.symlinkSync(openclawJs, linkPath)
        try { fs.chmodSync(openclawJs, 0o755) } catch {}
        try { fs.chmodSync(linkPath, 0o755) } catch {}
      }
      logs.push('bin 链接已创建 ✓')
    }
  }

  // 清理临时文件
  try { fs.unlinkSync(tmpPath) } catch {}

  logs.push(`✅ CDN 加速安装完成，当前版本: ${cdnVersion}`)
  return true
}

function recommendedVersionFor(source = 'chinese') {
  const policy = loadVersionPolicy()
  const panelEntry = findPanelPolicyEntry(policy, PANEL_VERSION)
  return panelEntry?.[source]?.recommended
    || policy?.default?.[source]?.recommended
    || null
}

function npmPackageName(source = 'chinese') {
  return source === 'official' ? 'openclaw' : '@qingchencloud/openclaw-zh'
}

function getConfiguredNpmRegistry() {
  const regFile = path.join(OPENCLAW_DIR, 'npm-registry.txt')
  try {
    if (fs.existsSync(regFile)) {
      const value = fs.readFileSync(regFile, 'utf8').trim()
      if (value) return value
    }
  } catch {}
  return 'https://registry.npmmirror.com'
}

function pickRegistryForPackage(pkg) {
  const configured = getConfiguredNpmRegistry()
  if (pkg.includes('openclaw-zh')) {
    // 汉化版优先用配置的源（通常是 npmmirror.com），不再默认 fallback 到海外 npmjs.org
    // Docker 容器内网络受限时，海外源会 ETIMEDOUT
    return configured
  }
  return configured
}

function configureGitHttpsRules() {
  try { runGitSync(['config', '--global', '--unset-all', 'url.https://github.com/.insteadOf'], { timeout: 5000 }) } catch {}
  let success = 0
  for (const from of GIT_HTTPS_REWRITES) {
    try {
      const { result } = runGitSync(['config', '--global', '--add', 'url.https://github.com/.insteadOf', from], { timeout: 5000 })
      if (!result?.error && result?.status === 0) success++
    } catch {}
  }
  return success
}

function buildGitInstallEnv() {
  const env = buildGitCommandEnv({
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o IdentitiesOnly=yes',
    GIT_ALLOW_PROTOCOL: 'https:http:file',
    GIT_CONFIG_COUNT: String(GIT_HTTPS_REWRITES.length),
  })
  GIT_HTTPS_REWRITES.forEach((from, idx) => {
    env[`GIT_CONFIG_KEY_${idx}`] = 'url.https://github.com/.insteadOf'
    env[`GIT_CONFIG_VALUE_${idx}`] = from
  })
  return env
}

function parseSkillFrontmatterFile(skillMdPath) {
  try {
    const raw = fs.readFileSync(skillMdPath, 'utf8').replace(/\r\n/g, '\n')
    if (!raw.startsWith('---\n')) return {}
    const end = raw.indexOf('\n---\n', 4)
    if (end < 0) return {}
    const frontmatter = raw.slice(4, end)
    const result = {}
    for (const line of frontmatter.split('\n')) {
      const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/)
      if (!match) continue
      result[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
    }
    return result
  } catch {
    return {}
  }
}

function resolveAgentSkillsDir(agentId) {
  const id = (agentId || '').trim()
  if (!id || id === 'main') return null
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    const ws = resolveAgentWorkspace(config, id)
    return path.join(ws, 'skills')
  } catch {
    return path.join(OPENCLAW_DIR, 'agents', id, 'workspace', 'skills')
  }
}

function validateOpenClawSkillDeleteName(name) {
  const n = String(name || '').trim()
  if (!n || n.includes('..') || n.includes('/') || n.includes('\\')) {
    throw new Error('无效的 OpenClaw Skill 名称')
  }
  if (['.', '.git', 'node_modules'].includes(n.toLowerCase())) {
    throw new Error('拒绝删除危险 Skill 路径')
  }
  return n
}

function assertSafeOpenClawSkillPath(skillDir, allowedRoots) {
  const target = path.resolve(skillDir)
  const lowerTarget = isWindows ? target.toLowerCase() : target
  if (/[\\/]\.git(?:[\\/]|$)/i.test(target) || /[\\/]node_modules(?:[\\/]|$)/i.test(target)) {
    throw new Error('拒绝删除仓库或依赖目录')
  }
  for (const root of allowedRoots.filter(Boolean)) {
    const resolvedRoot = path.resolve(root)
    const lowerRoot = isWindows ? resolvedRoot.toLowerCase() : resolvedRoot
    const relative = path.relative(lowerRoot, lowerTarget)
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return true
    }
  }
  throw new Error('拒绝删除 OpenClaw Skills 根目录之外的路径')
}

function isExistingDirectory(dir) {
  try {
    return !!dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function openclawBundledSkillDirCandidates(openclawRoot) {
  if (!openclawRoot) return []
  return [
    path.join(openclawRoot, 'skills'),
    path.join(openclawRoot, 'node_modules', 'openclaw', 'skills'),
    path.join(openclawRoot, 'node_modules', '@qingchencloud', 'openclaw-zh', 'skills'),
  ]
}

function openclawExtensionSkillDirCandidates(openclawRoot) {
  if (!openclawRoot) return []
  const candidates = []
  const extensionRoots = [
    path.join(openclawRoot, 'dist', 'extensions'),
    path.join(openclawRoot, 'node_modules', 'openclaw', 'dist', 'extensions'),
    path.join(openclawRoot, 'node_modules', '@qingchencloud', 'openclaw-zh', 'dist', 'extensions'),
  ]
  for (const extensionRoot of extensionRoots) {
    if (!isExistingDirectory(extensionRoot)) continue
    for (const entry of fs.readdirSync(extensionRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      candidates.push(path.join(extensionRoot, entry.name, 'skills'))
    }
  }
  return candidates
}

function collectLocalSkillRoots(agentSkillsDir) {
  const roots = []
  const seen = new Set()
  const pushRoot = (dir, source, bundled = false) => {
    if (!dir) return
    const normalized = path.resolve(dir)
    const key = isWindows ? normalized.toLowerCase() : normalized
    if (seen.has(key)) return
    seen.add(key)
    roots.push({ dir: normalized, source, bundled })
  }

  if (agentSkillsDir) {
    pushRoot(agentSkillsDir, 'Agent 自定义', false)
  } else {
    pushRoot(path.join(OPENCLAW_DIR, 'skills'), 'OpenClaw 自定义', false)
  }
  pushRoot(path.join(OPENCLAW_DIR, 'plugin-skills'), 'openclaw-extra', true)
  pushRoot(path.join(homedir(), '.claude', 'skills'), 'Claude 自定义', false)

  const bundledRuntimeDir = bundledOpenclawBinDir()
  if (bundledRuntimeDir) {
    for (const bundledDir of openclawBundledSkillDirCandidates(bundledRuntimeDir)) {
      if (isExistingDirectory(bundledDir)) pushRoot(bundledDir, 'openclaw-bundled', true)
    }
    for (const extraDir of openclawExtensionSkillDirCandidates(bundledRuntimeDir)) {
      if (isExistingDirectory(extraDir)) pushRoot(extraDir, 'openclaw-extra', true)
    }
  }

  const cliPath = resolveOpenclawCliPath()
  if (cliPath) {
    const resolvedCli = canonicalCliPath(cliPath) || cliPath
    const cliDir = path.dirname(resolvedCli)
    const pkgRoots = [cliDir, path.dirname(cliDir)]
    for (const pkgRoot of pkgRoots) {
      for (const bundledDir of openclawBundledSkillDirCandidates(pkgRoot)) {
        if (isExistingDirectory(bundledDir)) pushRoot(bundledDir, 'openclaw-bundled', true)
      }
      for (const extraDir of openclawExtensionSkillDirCandidates(pkgRoot)) {
        if (isExistingDirectory(extraDir)) pushRoot(extraDir, 'openclaw-extra', true)
      }
    }
  }

  if (isWindows) {
    const prefix = readWindowsNpmGlobalPrefix() || path.join(process.env.APPDATA || '', 'npm')
    for (const pkg of ['openclaw', path.join('@qingchencloud', 'openclaw-zh')]) {
      const bundledDir = path.join(prefix, 'node_modules', pkg, 'skills')
      if (isExistingDirectory(bundledDir)) {
        pushRoot(bundledDir, 'openclaw-bundled', true)
      }
    }
  }

  return roots
}

function scanSingleSkill(root, name) {
  const skillPath = path.join(root.dir, name)
  const skillMd = path.join(skillPath, 'SKILL.md')
  const packageJson = path.join(skillPath, 'package.json')
  if (!fs.existsSync(skillMd) && !fs.existsSync(packageJson)) return null

  const result = {
    name,
    source: root.source,
    bundled: !!root.bundled,
    filePath: skillPath,
    description: '',
    eligible: true,
    disabled: false,
    blockedByAllowlist: false,
    requirements: { bins: [], anyBins: [], env: [], config: [], os: [] },
    missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
    install: [],
  }

  try {
    if (fs.existsSync(packageJson)) {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'))
      if (pkg.description) result.description = pkg.description
      if (pkg.homepage) result.homepage = pkg.homepage
      if (pkg.version) result.version = pkg.version
      if (pkg.author) result.author = typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name || '')
    }
  } catch {}

  const frontmatter = parseSkillFrontmatterFile(skillMd)
  if (frontmatter.description) result.description = frontmatter.description
  if (frontmatter.fullPath) result.fullPath = frontmatter.fullPath
  if (frontmatter.emoji) result.emoji = frontmatter.emoji

  return result
}

function scanLocalSkillsFallback(agentSkillsDir = null) {
  const roots = collectLocalSkillRoots(agentSkillsDir)
  const skills = []
  const seen = new Set()
  const scannedRoots = []

  for (const root of roots) {
    if (!fs.existsSync(root.dir) || !fs.statSync(root.dir).isDirectory()) continue
    scannedRoots.push(root.dir)
    for (const entry of fs.readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const key = isWindows ? entry.name.toLowerCase() : entry.name
      if (seen.has(key)) continue
      const skill = scanSingleSkill(root, entry.name)
      if (!skill) continue
      seen.add(key)
      skills.push(skill)
    }
  }

  skills.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  const eligible = skills.filter(s => s.eligible && !s.disabled)
  const missingRequirements = skills.filter(s => !s.eligible && !s.disabled && !s.blockedByAllowlist)
  const disabled = skills.filter(s => s.disabled)
  const blocked = skills.filter(s => s.blockedByAllowlist && !s.disabled)

  return {
    skills,
    source: 'local-scan',
    cliAvailable: false,
    summary: {
      total: skills.length,
      eligible: eligible.length,
      disabled: disabled.length,
      blocked: blocked.length,
      missingRequirements: missingRequirements.length,
    },
    eligible,
    disabled,
    blocked,
    missingRequirements,
    diagnostic: {
      status: 'scanned',
      scannedAt: new Date().toISOString(),
      scannedRoots,
      cli: null,
    },
  }
}

function detectInstalledSource() {
  const activeCliPath = resolveOpenclawCliPath()
  const activeCliSource = classifyCliSource(activeCliPath)
  if (activeCliSource === 'standalone') return detectStandaloneSourceFromCliPath(activeCliPath) || 'chinese'
  const activeSource = normalizeCliInstallSource(activeCliSource)
  if (activeSource !== 'unknown') return activeSource
  if (isMac) {
    // ARM Homebrew
    try {
      const target = fs.readlinkSync('/opt/homebrew/bin/openclaw')
      if (String(target).includes('openclaw-zh')) return 'chinese'
      return 'official'
    } catch {}
    // Intel Homebrew
    try {
      const target = fs.readlinkSync('/usr/local/bin/openclaw')
      if (String(target).includes('openclaw-zh')) return 'chinese'
      return 'official'
    } catch {}
    // standalone
    const saDir = standaloneInstallDir()
    if (fs.existsSync(path.join(saDir, 'openclaw')) || fs.existsSync(path.join(saDir, 'VERSION'))) return detectStandaloneSourceFromDir(saDir) || 'chinese'
    if (fs.existsSync('/opt/openclaw/openclaw')) return detectStandaloneSourceFromDir('/opt/openclaw') || 'chinese'
    // findOpenclawBin fallback
    const bin = findOpenclawBin()
    if (bin) {
      const lower = bin.replace(/\\/g, '/').toLowerCase()
      if (lower.includes('/openclaw-bin/') || lower.includes('/opt/openclaw/')) return detectStandaloneSourceFromCliPath(bin) || 'chinese'
      if (lower.includes('openclaw-zh') || lower.includes('@qingchencloud')) return 'chinese'
      return 'official'
    }
    return 'official'
  }
  if (isWindows) {
    const saDir = standaloneInstallDir()
    if (fs.existsSync(path.join(saDir, 'openclaw.cmd')) || fs.existsSync(path.join(saDir, 'VERSION'))) return detectStandaloneSourceFromDir(saDir) || 'chinese'
    try {
      const npmPrefix = readWindowsNpmGlobalPrefix()
      if (npmPrefix) {
        const shimSource = detectWindowsShimSource(path.join(npmPrefix, 'openclaw.cmd'))
        if (shimSource) return normalizeCliInstallSource(shimSource)
        const zhDir = path.join(npmPrefix, 'node_modules', '@qingchencloud', 'openclaw-zh')
        if (fs.existsSync(zhDir)) return 'chinese'
      }
    } catch {}
    return 'official'
  }
  try {
    const npmBin = isWindows ? 'npm.cmd' : 'npm'
    const out = execSync(`${npmBin} list -g @qingchencloud/openclaw-zh --depth=0 2>&1`, { timeout: 10000, windowsHide: true }).toString()
    if (out.includes('openclaw-zh@')) return 'chinese'
  } catch {}
  return 'official'
}

function getLocalOpenclawVersion() {
  let current = readVersionFromInstallation(resolveOpenclawCliPath())
  if (!current) {
    try {
      const saDir = standaloneInstallDir()
      const bin = isWindows ? path.join(saDir, 'openclaw.cmd') : path.join(saDir, 'openclaw')
      if (fs.existsSync(bin) || fs.existsSync(path.join(saDir, 'VERSION'))) {
        current = readVersionFromInstallation(bin)
      }
    } catch {}
  }
  if (isMac) {
    // ARM Homebrew
    try {
      const target = fs.readlinkSync('/opt/homebrew/bin/openclaw')
      const pkgPath = path.resolve('/opt/homebrew/bin', target, '..', 'package.json')
      current = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
    } catch {}
    // Intel Homebrew
    if (!current) {
      try {
        const target = fs.readlinkSync('/usr/local/bin/openclaw')
        const pkgPath = path.resolve('/usr/local/bin', target, '..', 'package.json')
        current = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
      } catch {}
    }
    // standalone
    if (!current) {
      try {
        const saDir = standaloneInstallDir()
        const vf = path.join(saDir, 'VERSION')
        if (fs.existsSync(vf)) {
          const lines = fs.readFileSync(vf, 'utf8').split('\n')
          for (const l of lines) { if (l.startsWith('openclaw_version=')) { current = l.split('=')[1]?.trim(); break } }
        }
        if (!current) {
          const pkg = path.join(saDir, 'node_modules', '@qingchencloud', 'openclaw-zh', 'package.json')
          if (fs.existsSync(pkg)) current = JSON.parse(fs.readFileSync(pkg, 'utf8')).version
        }
      } catch {}
    }
  }
  if (!current && isWindows) {
    try {
      const npmPrefix = readWindowsNpmGlobalPrefix()
      if (npmPrefix) {
        for (const pkg of [path.join('@qingchencloud', 'openclaw-zh'), 'openclaw']) {
          const pkgPath = path.join(npmPrefix, 'node_modules', pkg, 'package.json')
          if (fs.existsSync(pkgPath)) {
            current = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
            if (current) break
          }
        }
      }
    } catch {}
  }
  if (!current) {
    try {
      const result = spawnOpenclawSync(['status', '--json'], { timeout: 2000, windowsHide: true, encoding: 'utf8', cwd: homedir() })
      const output = openclawResultOutput(result)
      const parsed = JSON.parse(output.slice(output.indexOf('{')))
      current = parsed?.runtimeVersion || null
    } catch {}
  }
  if (!current) {
    try {
      const result = spawnOpenclawSync(['--version'], { timeout: 3000, windowsHide: true, encoding: 'utf8', cwd: homedir() })
      const output = openclawResultOutput(result)
      current = output.trim().split(/\s+/).find(w => /^\d/.test(w)) || null
    } catch {}
  }
  return current || null
}

async function getLatestVersionFor(source = 'chinese') {
  const pkg = npmPackageName(source)
  const encodedPkg = pkg.replace('/', '%2F').replace('@', '%40')
  const firstRegistry = pickRegistryForPackage(pkg)
  const registries = [...new Set([firstRegistry, 'https://registry.npmjs.org'])]
  for (const registry of registries) {
    try {
      const resp = await fetch(`${registry}/${encodedPkg}/latest`, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) })
      if (!resp.ok) continue
      const data = await resp.json()
      if (data?.version) return data.version
    } catch {}
  }
  return null
}

// === 访问密码 & Session 管理 ===

const _sessions = new Map() // token → { expires }
const SESSION_TTL = 24 * 60 * 60 * 1000 // 24h
const AUTH_EXEMPT = new Set(['auth_check', 'auth_login', 'auth_logout'])

// 登录限速：防暴力破解（IP 级别，5次失败后锁定60秒）
const _loginAttempts = new Map() // ip → { count, lockedUntil }
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 60 * 1000 // 60s

function checkLoginRateLimit(ip) {
  const now = Date.now()
  const record = _loginAttempts.get(ip)
  if (!record) return null
  if (record.lockedUntil && now < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - now) / 1000)
    return `登录失败次数过多，请 ${remaining} 秒后再试`
  }
  if (record.lockedUntil && now >= record.lockedUntil) {
    _loginAttempts.delete(ip)
  }
  return null
}

function recordLoginFailure(ip) {
  const record = _loginAttempts.get(ip) || { count: 0, lockedUntil: null }
  record.count++
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION
    record.count = 0
  }
  _loginAttempts.set(ip, record)
}

function clearLoginAttempts(ip) {
  _loginAttempts.delete(ip)
}

// 从 CLI 输出中提取 JSON（跳过 Node 警告、npm 更新提示等非 JSON 行）
function extractCliJson(text) {
  // 快速路径：整个文本就是合法 JSON
  try { return JSON.parse(text) } catch {}
  // 找到第一个 { 或 [ 开始尝试解析
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{' || ch === '[') {
      // 找到匹配的闭合位置
      let depth = 0, end = -1
      const close = ch === '{' ? '}' : ']'
      let inStr = false, esc = false
      for (let j = i; j < text.length; j++) {
        const c = text[j]
        if (esc) { esc = false; continue }
        if (c === '\\' && inStr) { esc = true; continue }
        if (c === '"' && !esc) { inStr = !inStr; continue }
        if (inStr) continue
        if (c === ch) depth++
        else if (c === close) { depth--; if (depth === 0) { end = j; break } }
      }
      if (end > i) {
        try { return JSON.parse(text.slice(i, end + 1)) } catch {}
      }
    }
  }
  throw new Error('解析失败: 输出中未找到有效 JSON')
}

// 配置缓存：避免每次请求同步读磁盘（TTL 2秒，写入时立即失效）
let _panelConfigCache = null
let _panelConfigCacheTime = 0
const CONFIG_CACHE_TTL = 2000 // 2s

function readPanelConfig() {
  const now = Date.now()
  if (_panelConfigCache && (now - _panelConfigCacheTime) < CONFIG_CACHE_TTL) {
    applyOpenclawPathConfig(_panelConfigCache)
    return JSON.parse(JSON.stringify(_panelConfigCache))
  }
  try {
    // 便携模式优先：resources/data/.openclaw/clawpanel.json
    const effectivePath = panelConfigFilePath()
    if (fs.existsSync(effectivePath)) {
      _panelConfigCache = JSON.parse(fs.readFileSync(effectivePath, 'utf8'))
      _panelConfigCacheTime = now
      applyOpenclawPathConfig(_panelConfigCache)
      return JSON.parse(JSON.stringify(_panelConfigCache))
    }
  } catch {}
  applyOpenclawPathConfig({})
  return {}
}

function normalizeDockerEndpoint(raw) {
  if (typeof raw !== 'string') return null
  let value = raw.trim()
  if (!value) return null
  if (/^http:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      return `tcp://${parsed.host}`
    } catch {
      return null
    }
  }
  if (/^tcp:\/\//i.test(value)) return value
  if (/^unix:\/\//i.test(value)) value = value.replace(/^unix:\/\//i, '')
  if (/^npipe:\/\//i.test(value)) value = value.replace(/^npipe:/i, '').replace(/^\/{2,}/, '//')
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2))
  if (isWindows && /^\\\\\.\\pipe\\/.test(value)) {
    return value.replace(/^\\\\\.\\pipe\\/, '//./pipe/').replace(/\\/g, '/')
  }
  return value
}

function readDockerRuntimeConfig() {
  const panelConfig = readPanelConfig()
  const endpoint = normalizeDockerEndpoint(
    typeof panelConfig?.dockerEndpoint === 'string' && panelConfig.dockerEndpoint.trim()
      ? panelConfig.dockerEndpoint
      : (process.env.DOCKER_HOST || DEFAULT_DOCKER_SOCKET)
  ) || DEFAULT_DOCKER_SOCKET
  const configuredImage = typeof panelConfig?.dockerDefaultImage === 'string'
    ? panelConfig.dockerDefaultImage.trim()
    : ''
  const envImage = (process.env.OPENCLAW_DOCKER_IMAGE || '').trim()
  return {
    endpoint,
    image: configuredImage || envImage || DEFAULT_OPENCLAW_IMAGE,
  }
}

function defaultDockerEndpoint() {
  return readDockerRuntimeConfig().endpoint
}

function defaultDockerImage() {
  return readDockerRuntimeConfig().image
}

function defaultLocalDockerNode() {
  const endpoint = defaultDockerEndpoint()
  return {
    id: 'local',
    name: '本机',
    type: endpoint.startsWith('tcp://') ? 'tcp' : 'socket',
    endpoint,
  }
}

function invalidateConfigCache() {
  _panelConfigCache = null
  _panelConfigCacheTime = 0
}

applyOpenclawPathConfig(readPanelConfig())

function getAccessPassword() {
  return readPanelConfig().accessPassword || ''
}

function parseCookies(req) {
  const obj = {}
  ;(req.headers.cookie || '').split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=')
    if (k) try { obj[k] = decodeURIComponent(v.join('=')) } catch (_) { obj[k] = v.join('=') }
  })
  return obj
}

function normalizeHostValue(value = '') {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.startsWith('[')) return raw.slice(1).split(']')[0]
  return raw.split(':')[0]
}

function normalizeSocketAddress(value = '') {
  const raw = String(value || '').trim().toLowerCase()
  return raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw
}

function isLoopbackHostHeader(req) {
  const host = normalizeHostValue(req?.headers?.host || '')
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function isLoopbackSocketAddress(value = '') {
  const address = normalizeSocketAddress(value)
  return address === '127.0.0.1' || address === '::1' || address === 'localhost'
}

function isLoopbackRequest(req) {
  return isLoopbackSocketAddress(req?.socket?.remoteAddress)
    && isLoopbackSocketAddress(req?.socket?.localAddress)
    && isLoopbackHostHeader(req)
}

function isAuthenticated(req) {
  return isLoopbackRequest(req)
}

function checkPasswordStrength(pw) {
  if (!pw || pw.length < 6) return '密码至少 6 位'
  if (pw.length > 64) return '密码不能超过 64 位'
  if (/^\d+$/.test(pw)) return '密码不能是纯数字'
  const weak = ['123456', '654321', 'password', 'admin', 'qwerty', 'abc123', '111111', '000000', 'letmein', 'welcome', 'clawpanel', 'openclaw']
  if (weak.includes(pw.toLowerCase())) return '密码太常见，请换一个更安全的密码'
  return null // 通过
}

function isUnsafePath(p) {
  return !p || p.includes('..') || p.includes('\0') || path.isAbsolute(p)
}

const MAX_BODY_SIZE = 32 * 1024 * 1024 // voice uploads may contain base64 audio

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) { req.destroy(); resolve({}); return }
      body += chunk
    })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) }
      catch { resolve({}) }
    })
  })
}

function readBodyRaw(req) {
  return new Promise((resolve) => {
    let body = ''
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) { req.destroy(); resolve(''); return }
      body += chunk
    })
    req.on('end', () => resolve(body))
  })
}

function sendJsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function appVersionManifestPath() {
  return path.join(OPENCLAW_DIR, 'clawpanel', 'app-version.json')
}

function normalizeAppVersionManifest(input = {}) {
  const latestVersion = String(input.latest_version || input.latestVersion || input.version || '').trim()
  const downloadUrl = String(input.download_url || input.downloadUrl || '').trim()
  const sha256 = String(input.sha256 || input.hash || '').trim().replace(/^sha256:/i, '')
  return {
    latest_version: latestVersion,
    version: latestVersion,
    download_url: downloadUrl,
    downloadUrl,
    sha256,
    hash: sha256,
    force_update: Boolean(input.force_update ?? input.forceUpdate),
    forceUpdate: Boolean(input.force_update ?? input.forceUpdate),
    notes: String(input.notes || input.changelog || '').trim(),
    changelog: String(input.notes || input.changelog || '').trim(),
    minAppVersion: String(input.minAppVersion || input.min_app_version || '0.0.0').trim() || '0.0.0',
    updatedAt: input.updatedAt || new Date().toISOString(),
  }
}

function readAppVersionManifest() {
  const file = appVersionManifestPath()
  if (!fs.existsSync(file)) {
    return normalizeAppVersionManifest({
      latest_version: PANEL_VERSION,
      notes: 'No update manifest configured.',
      updatedAt: null,
    })
  }
  try {
    return normalizeAppVersionManifest(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return normalizeAppVersionManifest({ latest_version: PANEL_VERSION, notes: 'Invalid update manifest.' })
  }
}

function writeAppVersionManifest(input) {
  const manifest = normalizeAppVersionManifest(input)
  if (!manifest.latest_version) throw new Error('latest_version is required')
  const dir = path.dirname(appVersionManifestPath())
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(appVersionManifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

function appVersionCheckPayload(currentVersion = PANEL_VERSION, manifest = readAppVersionManifest()) {
  const current = String(currentVersion || PANEL_VERSION || '0.0.0').trim()
  const latest = String(manifest.latest_version || manifest.version || '').trim()
  const compatible = versionGe(current, manifest.minAppVersion || '0.0.0')
  const needUpdate = Boolean(latest && compatible && versionGt(latest, current))
  return {
    current_version: current,
    currentVersion: current,
    latest_version: latest,
    latestVersion: latest,
    need_update: needUpdate,
    hasUpdate: needUpdate,
    force_update: Boolean(manifest.force_update || manifest.forceUpdate),
    forceUpdate: Boolean(manifest.force_update || manifest.forceUpdate),
    download_url: manifest.download_url || manifest.downloadUrl || '',
    downloadUrl: manifest.download_url || manifest.downloadUrl || '',
    sha256: manifest.sha256 || manifest.hash || '',
    hash: manifest.sha256 || manifest.hash || '',
    notes: manifest.notes || manifest.changelog || '',
    changelog: manifest.notes || manifest.changelog || '',
    compatible,
    manifest,
  }
}

async function handleAppVersionApi(req, res, url) {
  if (url.pathname === '/api/client/version') {
    const current = url.searchParams.get('current') || url.searchParams.get('currentVersion') || PANEL_VERSION
    sendJsonResponse(res, 200, appVersionCheckPayload(current))
    return true
  }

  if (url.pathname === '/api/admin/version') {
    if (!isAuthenticated(req)) {
      sendJsonResponse(res, 401, { error: 'AUTH_REQUIRED' })
      return true
    }
    if (req.method === 'GET') {
      sendJsonResponse(res, 200, {
        success: true,
        path: appVersionManifestPath(),
        version: readAppVersionManifest(),
      })
      return true
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const payload = await readBody(req)
      try {
        const manifest = writeAppVersionManifest(payload)
        sendJsonResponse(res, 200, { success: true, path: appVersionManifestPath(), version: manifest })
      } catch (e) {
        sendJsonResponse(res, 400, { error: e.message || String(e) })
      }
      return true
    }
    sendJsonResponse(res, 405, { error: 'Method not allowed' })
    return true
  }

  return false
}

function getUid() {
  if (!isMac) return 0
  return execSync('id -u').toString().trim()
}

function isInvalidOpenClawProviderModel(modelId) {
  const raw = String(modelId || '').trim()
  const lower = raw.toLowerCase()
  return !raw
    || raw === '默认模型'
    || raw === '默认'
    || lower === 'default model'
    || lower === 'undefined'
    || lower === 'null'
}

function normalizeOpenClawLegacyConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return

  config.plugins = config.plugins && typeof config.plugins === 'object' && !Array.isArray(config.plugins)
    ? config.plugins
    : {}
  delete config.plugins.allow
  config.plugins.bundledDiscovery = 'compat'

  const provider = config?.models?.providers?.minimax
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return

  const modelId = normalizeOpenClawModelId(
    provider.models?.[0]?.id ||
    provider.models?.[0]?.model ||
    provider.model
  )
  const normalized = {
    api: provider.api || 'openai-completions',
    baseUrl: provider.baseUrl,
    models: Array.isArray(provider.models) && provider.models.length
      ? provider.models.map(item => ({
        ...item,
        id: normalizeOpenClawModelId(item?.id || item?.model || modelId),
        name: normalizeOpenClawModelId(item?.name || item?.id || item?.model || modelId),
        api: item?.api || provider.api || 'openai-completions',
      }))
      : [{
        ...miniMaxOpenClawModelDefinition(),
        id: modelId,
        name: modelId,
      }],
  }
  if (Object.prototype.hasOwnProperty.call(provider, 'apiKey')) {
    normalized.apiKey = provider.apiKey
  }
  config.models.providers.minimax = normalized
}

function stripUiFields(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config
  // 清理根层级 ClawPanel 内部字段（version info 等），避免污染 openclaw.json
  // Issue #89: 这些字段被写入 openclaw.json 后导致 Gateway 无法启动（Unknown config keys）
  const uiRootKeys = [
    'current', 'latest', 'recommended', 'update_available',
    'latest_update_available', 'is_recommended', 'ahead_of_recommended',
    'panel_version', 'source', 'qqbot', 'profiles',
  ]
  for (const key of uiRootKeys) {
    delete config[key]
  }
  if (config.auth && typeof config.auth === 'object' && !Array.isArray(config.auth)) {
    delete config.auth.profiles
  }
  if (config.agents && typeof config.agents === 'object' && !Array.isArray(config.agents)) {
    delete config.agents.profiles
    if (Array.isArray(config.agents.list)) {
      for (const agent of config.agents.list) {
        if (!agent || typeof agent !== 'object' || Array.isArray(agent)) continue
        delete agent.current
        delete agent.latest
        delete agent.update_available
      }
    }
  }
  // 清理模型测试相关的临时字段
  if (config?.models?.providers && typeof config.models.providers === 'object' && !Array.isArray(config.models.providers)) {
    const normalizedProviders = {}
    for (const [key, provider] of Object.entries(config.models.providers)) {
      const normalizedKey = String(key).toLowerCase()
      normalizedProviders[normalizedKey] = normalizedProviders[normalizedKey]
        ? mergeConfigsPreservingFields(normalizedProviders[normalizedKey], provider)
        : provider
    }
    config.models.providers = normalizedProviders
  }
  normalizeOpenClawLegacyConfig(config)
  if (config?.models?.primary?.provider) config.models.primary.provider = String(config.models.primary.provider).toLowerCase()
  if (config?.models?.default?.provider) config.models.default.provider = String(config.models.default.provider).toLowerCase()
  if (config?.agents?.defaults?.models && typeof config.agents.defaults.models === 'object' && !Array.isArray(config.agents.defaults.models)) {
    const normalizedDefaultModels = {}
    for (const [key, value] of Object.entries(config.agents.defaults.models)) {
      const normalizedKey = String(key).toLowerCase()
      normalizedDefaultModels[normalizedKey] = normalizedDefaultModels[normalizedKey]
        ? mergeConfigsPreservingFields(normalizedDefaultModels[normalizedKey], value)
        : value
    }
    config.agents.defaults.models = normalizedDefaultModels
  }
  const providers = config?.models?.providers
  if (providers) {
    for (const p of Object.values(providers)) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue
      delete p.managed
      if (!Array.isArray(p.models)) continue
      for (const m of p.models) {
        if (typeof m !== 'object') continue
        delete m.lastTestAt
        delete m.latency
        delete m.testStatus
        delete m.testError
        if (!m.name && m.id) m.name = m.id
      }
    }
  }
  return config
}

function cleanLoadedConfig(config) {
  const before = JSON.stringify(config)
  const cleaned = stripUiFields(config)
  if (fs.existsSync(CONFIG_PATH) && JSON.stringify(cleaned) !== before) {
    writeOpenclawConfigFile(cleaned)
  }
  return cleaned
}

// === Ed25519 设备密钥管理 ===

function getOrCreateDeviceKey() {
  if (fs.existsSync(DEVICE_KEY_FILE)) {
    const data = JSON.parse(fs.readFileSync(DEVICE_KEY_FILE, 'utf8'))
    // 从存储的 hex 密钥重建 Node.js KeyObject
    const privDer = Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'), // PKCS8 Ed25519 header
      Buffer.from(data.secretKey, 'hex'),
    ])
    const privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' })
    return { deviceId: data.deviceId, publicKey: data.publicKey, privateKey }
  }
  // 生成新密钥对
  const keyPair = crypto.generateKeyPairSync('ed25519')
  const pubDer = keyPair.publicKey.export({ type: 'spki', format: 'der' })
  const privDer = keyPair.privateKey.export({ type: 'pkcs8', format: 'der' })
  const pubRaw = pubDer.slice(-32)
  const privRaw = privDer.slice(-32)
  const deviceId = crypto.createHash('sha256').update(pubRaw).digest('hex')
  const publicKey = Buffer.from(pubRaw).toString('base64url')
  const secretHex = Buffer.from(privRaw).toString('hex')
  const keyData = { deviceId, publicKey, secretKey: secretHex }
  if (!fs.existsSync(OPENCLAW_DIR)) fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
  fs.writeFileSync(DEVICE_KEY_FILE, JSON.stringify(keyData, null, 2))
  return { deviceId, publicKey, privateKey: keyPair.privateKey }
}

function getLocalIps() {
  const ips = []
  const ifaces = networkInterfaces()
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address)
    }
  }
  return ips
}

const CALIBRATION_RESET_INHERIT_KEYS = [
  'agents',
  'auth',
  'bindings',
  'browser',
  'channels',
  'commands',
  'env',
  'hooks',
  'models',
  'plugins',
  'session',
  'skills',
  'tools',
  'wizard',
]

function requiredControlUiOrigins() {
  const origins = [
    'tauri://localhost',
    'https://tauri.localhost',
    'http://tauri.localhost',
    'http://localhost',
    'http://localhost:1420',
    'http://127.0.0.1:1420',
    'http://localhost:18777',
    'http://127.0.0.1:18777',
  ]
  for (const ip of getLocalIps()) {
    origins.push(`http://${ip}:1420`)
    origins.push(`http://${ip}:18777`)
  }
  return [...new Set(origins)]
}

function calibrationLastTouchedVersion() {
  return recommendedVersionFor('chinese') || '2026.1.1'
}

function calibrationDefaultWorkspace() {
  return path.join(OPENCLAW_DIR, 'workspace')
}

function generateCalibrationToken() {
  return `cp-${crypto.randomBytes(16).toString('hex')}`
}

const OPENCLAW_DIRECT_TOOL_ALLOWLIST = ['browser', 'desktop_control', 'skill_manager', 'exec', 'process']
const OPENCLAW_DIRECT_EXEC_CONFIG = { host: 'gateway', security: 'full', ask: 'off' }
const OPENCLAW_STATUS_ENABLED_PLUGINS = [
  'browser',
  'desktop-control',
  'skill-manager',
  'duckduckgo',
  'exa',
  'firecrawl',
  'perplexity',
  'searxng',
  'tavily',
  'llm-task',
  'memory-core',
  'active-memory',
  'memory-wiki',
]
const OPENCLAW_WEB_SEARCH_PLUGIN_IDS = ['duckduckgo', 'exa', 'firecrawl', 'perplexity', 'searxng', 'tavily']
const OPENCLAW_MEMORY_PLUGIN_IDS = ['memory-core', 'active-memory', 'memory-wiki']
const OPENCLAW_PORTABLE_TOOL_PLUGINS = ['desktop-control', 'skill-manager']

function sha256File(filePath) {
  try {
    if (!fs.existsSync(filePath)) return ''
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return ''
  }
}

function copyDirExactSync(sourceDir, destinationDir) {
  if (fs.existsSync(destinationDir)) fs.rmSync(destinationDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(destinationDir), { recursive: true })
  fs.cpSync(sourceDir, destinationDir, { recursive: true, force: true })
}

function copyFileIfDifferentSync(sourcePath, destinationPath) {
  if (sha256File(sourcePath) && sha256File(sourcePath) === sha256File(destinationPath)) return false
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  fs.copyFileSync(sourcePath, destinationPath)
  return true
}

function ensurePortableOpenClawTools() {
  const runtimeDir = bundledOpenclawBinDir()
  const resourcesDir = appResourcesDir()
  if (!runtimeDir || !resourcesDir) return { ok: false, skipped: true, reason: 'missing-runtime-or-resources' }

  const sourceExtensions = path.join(runtimeDir, 'dist', 'extensions')
  const runtimeExtensions = path.join(runtimeDir, 'node_modules', '@qingchencloud', 'openclaw-zh', 'dist', 'extensions')
  const installed = []
  for (const pluginId of OPENCLAW_PORTABLE_TOOL_PLUGINS) {
    const source = path.join(sourceExtensions, pluginId)
    const destination = path.join(runtimeExtensions, pluginId)
    const sourceManifest = path.join(source, 'openclaw.plugin.json')
    const sourceEntry = path.join(source, 'index.js')
    if (!fs.existsSync(sourceManifest) || !fs.existsSync(sourceEntry)) {
      throw new Error(`OpenClaw portable plugin source is missing: ${pluginId}`)
    }
    const destManifest = path.join(destination, 'openclaw.plugin.json')
    const destEntry = path.join(destination, 'index.js')
    if (sha256File(sourceManifest) !== sha256File(destManifest) || sha256File(sourceEntry) !== sha256File(destEntry)) {
      copyDirExactSync(source, destination)
    }
    installed.push(pluginId)
  }

  const sidecarSource = path.join(resourcesDir, 'bin', 'desktop-control-agent.exe')
  const sidecarDestination = path.join(runtimeDir, 'bin', 'desktop-control-agent.exe')
  if (!fs.existsSync(sidecarSource)) throw new Error(`OpenClaw desktop-control sidecar is missing: ${sidecarSource}`)
  const sidecarCopied = copyFileIfDifferentSync(sidecarSource, sidecarDestination)

  let configChanged = false
  if (fs.existsSync(CONFIG_PATH)) {
    const cfg = JSON.parse(decodeJsonFileContent(CONFIG_PATH))
    cfg.plugins = cfg.plugins && typeof cfg.plugins === 'object' && !Array.isArray(cfg.plugins) ? cfg.plugins : {}
    cfg.plugins.entries = cfg.plugins.entries && typeof cfg.plugins.entries === 'object' && !Array.isArray(cfg.plugins.entries) ? cfg.plugins.entries : {}
    for (const pluginId of ['browser', ...OPENCLAW_PORTABLE_TOOL_PLUGINS]) {
      const current = cfg.plugins.entries[pluginId] && typeof cfg.plugins.entries[pluginId] === 'object' && !Array.isArray(cfg.plugins.entries[pluginId])
        ? cfg.plugins.entries[pluginId]
        : {}
      if (current.enabled !== true || cfg.plugins.entries[pluginId] !== current) {
        cfg.plugins.entries[pluginId] = { ...current, enabled: true }
        configChanged = true
      }
    }
    if (Object.prototype.hasOwnProperty.call(cfg.plugins, 'allow')) {
      delete cfg.plugins.allow
      configChanged = true
    }
    if (cfg.plugins.bundledDiscovery !== 'compat') {
      cfg.plugins.bundledDiscovery = 'compat'
      configChanged = true
    }
    if (configChanged) fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
  }

  return { ok: true, installed, sidecar: fs.existsSync(sidecarDestination), sidecarCopied, configChanged }
}

function normalizeOpenClawDirectTools(tools, { includeExecConfig = false } = {}) {
  const next = tools && typeof tools === 'object' && !Array.isArray(tools) ? tools : {}
  next.profile = 'minimal'
  next.alsoAllow = [...OPENCLAW_DIRECT_TOOL_ALLOWLIST]
  if (includeExecConfig) next.exec = { ...(next.exec && typeof next.exec === 'object' && !Array.isArray(next.exec) ? next.exec : {}), ...OPENCLAW_DIRECT_EXEC_CONFIG }
  for (const denyKey of ['deny', 'alsoDeny']) {
    if (Array.isArray(next[denyKey])) next[denyKey] = next[denyKey].filter(tool => String(tool || '').trim() !== 'exec')
  }
  return next
}

function decodeJsonFileContent(filePath) {
  const raw = fs.readFileSync(filePath)
  if (raw.length >= 3 && raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
    return raw.subarray(3).toString('utf8')
  }
  return raw.toString('utf8')
}

function readJsonFileRelaxed(filePath) {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(decodeJsonFileContent(filePath))
  } catch {
    return null
  }
}

function calibrationHasUsableGatewayAuth(auth) {
  const mode = auth?.mode
  if (mode === 'token') return !!String(auth?.token || '').trim()
  if (mode === 'password') return !!String(auth?.password || '').trim()
  return false
}

function calibrationRichnessScore(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 0
  let score = 0
  if (config.models?.providers && Object.keys(config.models.providers).length) score += 4
  if (config.agents?.defaults) score += 2
  if (Array.isArray(config.agents?.list) && config.agents.list.length) score += 3
  if (config.channels && Object.keys(config.channels).length) score += 2
  if (Array.isArray(config.bindings) && config.bindings.length) score += 2
  if (config.plugins?.entries && Object.keys(config.plugins.entries).length) score += 2
  if (config.plugins?.installs && Object.keys(config.plugins.installs).length) score += 2
  if (config.env && Object.keys(config.env).length) score += 1
  if (calibrationHasUsableGatewayAuth(config.gateway?.auth)) score += 3
  if (Array.isArray(config.gateway?.controlUi?.allowedOrigins) && config.gateway.controlUi.allowedOrigins.length) score += 1
  return score
}

function selectCalibrationSource(current, backup) {
  if (current && backup) {
    return calibrationRichnessScore(backup) > calibrationRichnessScore(current)
      ? ['backup', backup]
      : ['current', current]
  }
  if (current) return ['current', current]
  if (backup) return ['backup', backup]
  return ['empty', {}]
}

function buildCalibrationBaseline() {
  return {
    $schema: 'https://openclaw.ai/schema/config.json',
    meta: { lastTouchedVersion: calibrationLastTouchedVersion() },
    models: { providers: {} },
    agents: {
      defaults: {
        workspace: calibrationDefaultWorkspace(),
        contextInjection: 'never',
        bootstrapMaxChars: 300,
        bootstrapTotalMaxChars: 800,
        thinkingDefault: 'off',
        verboseDefault: 'off',
      },
      list: [
        {
          id: 'main',
          name: 'Main Agent',
          workspace: 'workspace',
          skillsLimits: { maxSkillsPromptChars: 12000 },
          tools: {
            profile: 'minimal',
            alsoAllow: [...OPENCLAW_DIRECT_TOOL_ALLOWLIST],
          },
          thinkingDefault: 'off',
          verboseDefault: 'off',
        },
      ],
    },
    bindings: [],
    channels: {},
    commands: {
      native: 'auto',
      nativeSkills: 'auto',
      ownerDisplay: 'raw',
      restart: true,
    },
    plugins: {
      entries: {
        browser: { enabled: true },
        'desktop-control': { enabled: true },
        'skill-manager': { enabled: true },
      },
    },
    session: { dmScope: 'per-channel-peer' },
    skills: {
      entries: {},
      limits: { maxSkillsPromptChars: 12000 },
    },
    tools: {
      profile: 'minimal',
      alsoAllow: [...OPENCLAW_DIRECT_TOOL_ALLOWLIST],
      exec: { ...OPENCLAW_DIRECT_EXEC_CONFIG },
      sessions: { visibility: 'agent' },
    },
    gateway: {
      mode: 'local',
      bind: 'loopback',
      port: 18789,
      auth: {
        mode: 'token',
        token: generateCalibrationToken(),
      },
      remote: {
        token: generateCalibrationToken(),
      },
      controlUi: {
        enabled: true,
        allowedOrigins: requiredControlUiOrigins(),
        allowInsecureAuth: true,
      },
    },
  }
}

function ensurePortableDesktopToolDefaults(config) {
  config.plugins = config.plugins && typeof config.plugins === 'object' && !Array.isArray(config.plugins) ? config.plugins : {}
  config.plugins.entries = config.plugins.entries && typeof config.plugins.entries === 'object' && !Array.isArray(config.plugins.entries)
    ? config.plugins.entries
    : {}
  for (const pluginId of OPENCLAW_STATUS_ENABLED_PLUGINS) {
    if (!bundledOpenClawExtensionExists(pluginId)) continue
    config.plugins.entries[pluginId] = { ...(config.plugins.entries[pluginId] || {}), enabled: true }
  }

  config.skills = config.skills && typeof config.skills === 'object' && !Array.isArray(config.skills) ? config.skills : {}
  config.skills.entries = config.skills.entries && typeof config.skills.entries === 'object' && !Array.isArray(config.skills.entries) ? config.skills.entries : {}
  config.skills.limits = config.skills.limits && typeof config.skills.limits === 'object' && !Array.isArray(config.skills.limits) ? config.skills.limits : {}
  config.skills.limits.maxSkillsPromptChars = 12000

  config.tools = config.tools && typeof config.tools === 'object' && !Array.isArray(config.tools) ? config.tools : {}
  config.tools = normalizeOpenClawDirectTools(config.tools, { includeExecConfig: true })
  config.tools.sessions = config.tools.sessions && typeof config.tools.sessions === 'object' && !Array.isArray(config.tools.sessions) ? config.tools.sessions : {}
  config.tools.sessions.visibility = 'agent'

  config.agents = config.agents && typeof config.agents === 'object' && !Array.isArray(config.agents) ? config.agents : {}
  config.agents.defaults = config.agents.defaults && typeof config.agents.defaults === 'object' && !Array.isArray(config.agents.defaults) ? config.agents.defaults : {}
  delete config.agents.defaults.skills
  config.agents.defaults.contextInjection = 'never'
  config.agents.defaults.bootstrapMaxChars = 300
  config.agents.defaults.bootstrapTotalMaxChars = 800
  config.agents.defaults.thinkingDefault = 'off'
  config.agents.defaults.verboseDefault = 'off'
  config.agents.list = Array.isArray(config.agents.list) ? config.agents.list : []

  let mainAgent = config.agents.list.find(agent => String(agent?.id || 'main') === 'main')
  if (!mainAgent) {
    mainAgent = {
      id: 'main',
      name: 'Main Agent',
      workspace: 'workspace',
    }
    config.agents.list.unshift(mainAgent)
  }
  delete mainAgent.skills
  mainAgent.skillsLimits = { ...(mainAgent.skillsLimits || {}), maxSkillsPromptChars: 12000 }
  mainAgent.tools = mainAgent.tools && typeof mainAgent.tools === 'object' && !Array.isArray(mainAgent.tools) ? mainAgent.tools : {}
  mainAgent.tools = normalizeOpenClawDirectTools(mainAgent.tools, { includeExecConfig: true })
  mainAgent.thinkingDefault = 'off'
  mainAgent.verboseDefault = 'off'

  return config
}

function applyResetInheritance(baseConfig, seed) {
  const config = { ...baseConfig }
  const inheritedKeys = []
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) return [config, inheritedKeys]
  for (const key of CALIBRATION_RESET_INHERIT_KEYS) {
    if (key in seed) {
      config[key] = seed[key]
      inheritedKeys.push(key)
    }
  }
  if (seed.tools?.web) {
    config.tools = config.tools && typeof config.tools === 'object' && !Array.isArray(config.tools) ? config.tools : {}
    config.tools.web = seed.tools.web
    inheritedKeys.push('tools.web')
  }
  return [config, inheritedKeys]
}

function normalizeCalibratedConfig(input) {
  const config = input && typeof input === 'object' && !Array.isArray(input) ? input : buildCalibrationBaseline()
  const origins = requiredControlUiOrigins()
  config.$schema = 'https://openclaw.ai/schema/config.json'
  config.meta = config.meta && typeof config.meta === 'object' && !Array.isArray(config.meta) ? config.meta : {}
  config.meta.lastTouchedVersion = calibrationLastTouchedVersion()
  config.meta.lastTouchedAt = new Date().toISOString()

  config.models = config.models && typeof config.models === 'object' && !Array.isArray(config.models) ? config.models : {}
  config.models.providers = config.models.providers && typeof config.models.providers === 'object' && !Array.isArray(config.models.providers) ? config.models.providers : {}

  config.agents = config.agents && typeof config.agents === 'object' && !Array.isArray(config.agents) ? config.agents : {}
  config.agents.defaults = config.agents.defaults && typeof config.agents.defaults === 'object' && !Array.isArray(config.agents.defaults) ? config.agents.defaults : {}
  if (!String(config.agents.defaults.workspace || '').trim()) config.agents.defaults.workspace = calibrationDefaultWorkspace()
  if (!Array.isArray(config.agents.list)) config.agents.list = []

  if (!Array.isArray(config.bindings)) config.bindings = []
  config.channels = config.channels && typeof config.channels === 'object' && !Array.isArray(config.channels) ? config.channels : {}
  config.commands = config.commands && typeof config.commands === 'object' && !Array.isArray(config.commands) ? config.commands : {}
  if (!String(config.commands.native || '').trim()) config.commands.native = 'auto'
  if (!String(config.commands.nativeSkills || '').trim()) config.commands.nativeSkills = 'auto'
  if (!String(config.commands.ownerDisplay || '').trim()) config.commands.ownerDisplay = 'raw'
  if (typeof config.commands.restart !== 'boolean') config.commands.restart = true
  config.plugins = config.plugins && typeof config.plugins === 'object' && !Array.isArray(config.plugins) ? config.plugins : {}
  config.session = config.session && typeof config.session === 'object' && !Array.isArray(config.session) ? config.session : {}
  if (!String(config.session.dmScope || '').trim()) config.session.dmScope = 'per-channel-peer'
  config.skills = config.skills && typeof config.skills === 'object' && !Array.isArray(config.skills) ? config.skills : {}
  config.skills.entries = config.skills.entries && typeof config.skills.entries === 'object' && !Array.isArray(config.skills.entries) ? config.skills.entries : {}

  config.tools = config.tools && typeof config.tools === 'object' && !Array.isArray(config.tools) ? config.tools : {}
  if (!String(config.tools.profile || '').trim()) config.tools.profile = 'minimal'
  config.tools.sessions = config.tools.sessions && typeof config.tools.sessions === 'object' && !Array.isArray(config.tools.sessions) ? config.tools.sessions : {}
  if (!String(config.tools.sessions.visibility || '').trim()) config.tools.sessions.visibility = 'agent'

  config.gateway = config.gateway && typeof config.gateway === 'object' && !Array.isArray(config.gateway) ? config.gateway : {}
  if (!String(config.gateway.mode || '').trim()) config.gateway.mode = 'local'
  const port = Number(config.gateway.port)
  config.gateway.port = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 18789
  if (!String(config.gateway.bind || '').trim()) config.gateway.bind = 'loopback'
  if (!calibrationHasUsableGatewayAuth(config.gateway.auth)) {
    config.gateway.auth = {
      mode: 'token',
      token: generateCalibrationToken(),
    }
  }
  config.gateway.remote = config.gateway.remote && typeof config.gateway.remote === 'object' && !Array.isArray(config.gateway.remote) ? config.gateway.remote : {}
  const authToken = String(config.gateway.auth?.token || '').trim()
  if (authToken && String(config.gateway.remote.token || '').trim() !== authToken) {
    config.gateway.remote.token = authToken
  }
  config.gateway.controlUi = config.gateway.controlUi && typeof config.gateway.controlUi === 'object' && !Array.isArray(config.gateway.controlUi) ? config.gateway.controlUi : {}
  const existingOrigins = Array.isArray(config.gateway.controlUi.allowedOrigins) ? config.gateway.controlUi.allowedOrigins.filter(Boolean) : []
  config.gateway.controlUi.allowedOrigins = [...new Set([...existingOrigins, ...origins])]
  config.gateway.controlUi.enabled = true
  config.gateway.controlUi.allowInsecureAuth = true

  return ensurePortableDesktopToolDefaults(config)
}

function calibrateOpenclawConfig(mode = 'inherit') {
  const normalizedMode = mode === 'reinitialize' ? 'reset' : String(mode || 'inherit').trim()
  if (normalizedMode !== 'inherit' && normalizedMode !== 'reset') {
    throw new Error('mode 必须是 inherit 或 reset')
  }
  if (!fs.existsSync(OPENCLAW_DIR)) fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
  const warnings = []
  let preBackup = null
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      preBackup = handlers.create_backup().name || null
    } catch (error) {
      warnings.push(`修复前备份失败: ${error?.message || error}`)
    }
  }
  const current = readJsonFileRelaxed(CONFIG_PATH)
  const backup = readJsonFileRelaxed(CONFIG_PATH + '.bak')
  const [source, seed] = selectCalibrationSource(current, backup)

  let calibrated
  let inheritedKeys
  if (normalizedMode === 'inherit') {
    inheritedKeys = seed && typeof seed === 'object' && !Array.isArray(seed) ? Object.keys(seed) : []
    calibrated = mergeConfigsPreservingFields(buildCalibrationBaseline(), seed || {})
  } else {
    ;[calibrated, inheritedKeys] = applyResetInheritance(buildCalibrationBaseline(), seed || {})
  }
  inheritedKeys = [...new Set(inheritedKeys)].sort()
  calibrated = stripUiFields(normalizeCalibratedConfig(calibrated))
  const serialized = JSON.stringify(calibrated, null, 2)
  fs.writeFileSync(CONFIG_PATH, serialized)
  fs.writeFileSync(CONFIG_PATH + '.bak', serialized)
  return {
    mode: normalizedMode,
    source,
    backup: preBackup,
    inheritedKeys,
    warnings,
    message: normalizedMode === 'inherit' ? '配置已按继承模式校准' : '配置已按完全初始化修复模式校准',
  }
}

// === Raw WebSocket（支持 Origin header，绕过 Gateway origin 检查）===
function rawWsConnect(host, port, wsPath) {
  return new Promise((ok, no) => {
    const key = crypto.randomBytes(16).toString('base64')
    const req = http.request({ hostname: host, port, path: wsPath, method: 'GET', headers: {
      'Connection': 'Upgrade', 'Upgrade': 'websocket', 'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': key, 'Origin': 'http://localhost',
    } })
    req.on('upgrade', (_, socket) => ok(socket))
    req.on('response', (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => no(new Error(`HTTP ${res.statusCode}`))) })
    req.on('error', no)
    req.setTimeout(5000, () => { req.destroy(); no(new Error('ws connect timeout')) })
    req.end()
  })
}

function wsReadFrame(socket, timeout = 8000) {
  return new Promise((ok, no) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(t)
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      socket.removeListener('close', onClose)
    }
    const finish = (fn) => (value) => {
      if (settled) return
      settled = true
      cleanup()
      fn(value)
    }
    const t = setTimeout(finish(no), timeout, new Error('ws read timeout'))
    let buf = Buffer.alloc(0)
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]); if (buf.length < 2) return
      let len = buf[1] & 0x7f, off = 2
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4 }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10 }
      if (buf.length < off + len) return
      finish(ok)(buf.slice(off, off + len).toString('utf8'))
    }
    const onError = finish(no)
    const onClose = finish(no)
    socket.on('data', onData)
    socket.on('error', onError)
    socket.on('close', () => onClose(new Error('ws closed')))
  })
}

function wsSendFrame(socket, text) {
  const p = Buffer.from(text, 'utf8'), mask = crypto.randomBytes(4)
  let h
  if (p.length < 126) { h = Buffer.alloc(2); h[0] = 0x81; h[1] = 0x80 | p.length }
  else { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0x80 | 126; h.writeUInt16BE(p.length, 2) }
  const m = Buffer.alloc(p.length); for (let i = 0; i < p.length; i++) m[i] = p[i] ^ mask[i % 4]
  socket.write(Buffer.concat([h, mask, m]))
}

function wsReadLoop(socket, onMessage, timeoutMs = DOCKER_TASK_TIMEOUT_MS) {
  let buf = Buffer.alloc(0), done = false
  const timer = setTimeout(() => { done = true; socket.destroy() }, timeoutMs)
  const cancel = () => { done = true; clearTimeout(timer); try { socket.destroy() } catch {} }
  socket.on('data', (chunk) => {
    if (done) return
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f
      let len = buf[1] & 0x7f, off = 2
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4 }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10 }
      if (buf.length < off + len) return
      const payload = buf.slice(off, off + len)
      buf = buf.slice(off + len)
      if (opcode === 0x08) { done = true; clearTimeout(timer); socket.destroy(); return } // close
      if (opcode === 0x09) { // ping → 回 pong
        const mask = crypto.randomBytes(4)
        const h = Buffer.alloc(2); h[0] = 0x8A; h[1] = 0x80 | payload.length
        const m = Buffer.alloc(payload.length); for (let i = 0; i < payload.length; i++) m[i] = payload[i] ^ mask[i % 4]
        try { socket.write(Buffer.concat([h, mask, m])) } catch {}
        continue
      }
      if (opcode === 0x01) onMessage(payload.toString('utf8')) // text
    }
  })
  socket.on('error', () => { done = true; clearTimeout(timer) })
  socket.on('close', () => { done = true; clearTimeout(timer) })
  return cancel
}

function patchGatewayOrigins() {
  if (!fs.existsSync(CONFIG_PATH)) return false
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const origins = requiredControlUiOrigins()
  const existing = config?.gateway?.controlUi?.allowedOrigins || []
  // 合并：保留用户已有的 origins，只追加 ClawPanel 需要的
  const merged = [...new Set([...existing, ...origins])]
  // 幂等：已包含所有需要的 origin 时跳过写入
  if (origins.every(o => existing.includes(o))) return false
  if (!config.gateway) config.gateway = {}
  if (!config.gateway.controlUi) config.gateway.controlUi = {}
  config.gateway.controlUi.allowedOrigins = merged
  writeOpenclawConfigFile(config)
  return true
}

function readOpenclawConfigOptional() {
  ensureOpenclawConfigFile()
  if (!fs.existsSync(CONFIG_PATH)) return {}
  return cleanLoadedConfig(JSON.parse(decodeJsonFileContent(CONFIG_PATH)))
}

function readOpenclawConfigRequired() {
  ensureOpenclawConfigFile()
  if (!fs.existsSync(CONFIG_PATH)) throw new Error('openclaw.json 不存在')
  return cleanLoadedConfig(JSON.parse(decodeJsonFileContent(CONFIG_PATH)))
}

function ensureOpenclawConfigFile() {
  if (fs.existsSync(CONFIG_PATH)) {
    ensureOpenClawExecApprovalsFile()
    return false
  }
  if (!fs.existsSync(OPENCLAW_DIR)) fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
  const backupPath = CONFIG_PATH + '.bak'
  if (fs.existsSync(backupPath)) {
    const backupContent = fs.readFileSync(backupPath, 'utf8')
    writeOpenclawConfigFile(JSON.parse(backupContent), { preserveExisting: false })
    return true
  }
  const defaultConfig = stripUiFields(normalizeCalibratedConfig(buildCalibrationBaseline()))
  writeOpenclawConfigFile(defaultConfig, { preserveExisting: false })
  return true
}

function mergeConfigsPreservingFields(existing, next) {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return next
  if (!next || typeof next !== 'object' || Array.isArray(next)) return next
  const merged = { ...existing }
  for (const [key, value] of Object.entries(next)) {
    const prev = existing[key]
    if (prev && typeof prev === 'object' && !Array.isArray(prev) && value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeConfigsPreservingFields(prev, value)
    } else {
      merged[key] = value
    }
  }
  return merged
}

function writeOpenclawConfigFile(config, options = {}) {
  if (!fs.existsSync(OPENCLAW_DIR)) fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
  ensureOpenClawExecApprovalsFile()
  const preserveExisting = options.preserveExisting !== false
  const base = preserveExisting && fs.existsSync(CONFIG_PATH)
    ? mergeConfigsPreservingFields(JSON.parse(decodeJsonFileContent(CONFIG_PATH)), config)
    : config
  if (base?.models && typeof base.models === 'object' && !Array.isArray(base.models)) {
    delete base.models.mode
    delete base.models.default
    delete base.models.defaultProvider
    delete base.models.defaultModel
  }
  normalizeOpenClawMiniMaxModel(base)
  const cleaned = stripUiFields(base)
  if (cleaned?.models && typeof cleaned.models === 'object' && !Array.isArray(cleaned.models)) {
    delete cleaned.models.mode
    delete cleaned.models.default
    delete cleaned.models.defaultProvider
    delete cleaned.models.defaultModel
  }
  normalizeOpenClawMiniMaxModel(cleaned)
  if (fs.existsSync(CONFIG_PATH)) fs.copyFileSync(CONFIG_PATH, CONFIG_PATH + '.bak')
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf8')
}

function ensureOpenClawExecApprovalsFile() {
  if (!fs.existsSync(OPENCLAW_DIR)) fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
  const approvalsPath = path.join(OPENCLAW_DIR, 'exec-approvals.json')
  const desired = { version: 1, defaults: { security: 'full', ask: 'off', askFallback: 'full' } }
  const current = readJsonFileRelaxed(approvalsPath) || {}
  const next = mergeConfigsPreservingFields(current, desired)
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    fs.writeFileSync(approvalsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  }
}

function ensureAgentsList(config) {
  if (!config.agents) config.agents = {}
  if (!Array.isArray(config.agents.list)) config.agents.list = []
  return config.agents.list
}

function expandHomePath(input) {
  return typeof input === 'string' && input.startsWith('~/')
    ? path.join(homedir(), input.slice(2))
    : input
}

function findAgentConfig(config, id) {
  const agentsList = Array.isArray(config.agents?.list) ? config.agents.list : []
  return agentsList.find(a => (a?.id || 'main').trim() === id) || null
}

function resolveDefaultWorkspace(config) {
  return expandHomePath(config.agents?.defaults?.workspace) || path.join(OPENCLAW_DIR, 'workspace')
}

function ensureOpenClawWorkspaceConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false
  let changed = false
  config.agents = config.agents && typeof config.agents === 'object' && !Array.isArray(config.agents) ? config.agents : {}
  config.agents.defaults = config.agents.defaults && typeof config.agents.defaults === 'object' && !Array.isArray(config.agents.defaults) ? config.agents.defaults : {}
  const defaultWorkspace = path.join(OPENCLAW_DIR, 'workspace')
  const configuredDefault = String(config.agents.defaults.workspace || '').trim()
  if (!configuredDefault || !path.isAbsolute(expandHomePath(configuredDefault) || '')) {
    config.agents.defaults.workspace = defaultWorkspace
    changed = true
  }
  config.agents.list = Array.isArray(config.agents.list) ? config.agents.list : []
  let mainAgent = config.agents.list.find(agent => String(agent?.id || 'main') === 'main')
  if (!mainAgent) {
    mainAgent = { id: 'main', name: 'Main Agent' }
    config.agents.list.unshift(mainAgent)
    changed = true
  }
  const mainWorkspace = String(mainAgent.workspace || '').trim()
  if (!mainWorkspace || !path.isAbsolute(expandHomePath(mainWorkspace) || '')) {
    mainAgent.workspace = config.agents.defaults.workspace || defaultWorkspace
    changed = true
  }
  return changed
}

function ensureOpenClawWorkspaceDir(workspaceDir) {
  const status = { exists: false, writable: false, warning: null }
  try {
    if (!workspaceDir || typeof workspaceDir !== 'string') {
      status.warning = 'workspaceDir is empty'
      return status
    }
    fs.mkdirSync(workspaceDir, { recursive: true })
    const stat = fs.statSync(workspaceDir)
    status.exists = stat.isDirectory()
    if (!status.exists) {
      status.warning = 'workspace path is not a directory'
      return status
    }
    const testPath = path.join(workspaceDir, `.workspace-write-test-${process.pid}-${Date.now()}.tmp`)
    fs.writeFileSync(testPath, 'ok', 'utf8')
    fs.unlinkSync(testPath)
    status.writable = true
  } catch (err) {
    status.warning = err?.message || String(err)
    status.exists = !!(workspaceDir && fs.existsSync(workspaceDir))
  }
  return status
}

function bundledOpenClawExtensionExists(pluginId) {
  const candidates = [
    path.join(appRootDir(), 'src-tauri', 'resources', 'runtime', 'openclaw', 'dist', 'extensions', pluginId),
    path.join(appRootDir(), 'resources', 'runtime', 'openclaw', 'dist', 'extensions', pluginId),
  ]
  return candidates.some(dir => fs.existsSync(path.join(dir, 'openclaw.plugin.json')) || fs.existsSync(dir))
}

function ensureOpenClawStatusPluginDefaults(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false
  let changed = false
  config.plugins = config.plugins && typeof config.plugins === 'object' && !Array.isArray(config.plugins) ? config.plugins : {}
  config.plugins.entries = config.plugins.entries && typeof config.plugins.entries === 'object' && !Array.isArray(config.plugins.entries)
    ? config.plugins.entries
    : {}
  for (const pluginId of OPENCLAW_STATUS_ENABLED_PLUGINS) {
    if (!bundledOpenClawExtensionExists(pluginId)) continue
    const current = config.plugins.entries[pluginId] && typeof config.plugins.entries[pluginId] === 'object' && !Array.isArray(config.plugins.entries[pluginId])
      ? config.plugins.entries[pluginId]
      : {}
    if (current.enabled !== true) {
      config.plugins.entries[pluginId] = { ...current, enabled: true }
      changed = true
    } else if (config.plugins.entries[pluginId] !== current) {
      config.plugins.entries[pluginId] = current
      changed = true
    }
  }
  return changed
}

function pluginEntryHasConfiguredSecret(entry, keys) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
  const queue = [entry, entry.config, entry.webSearch, entry.config?.webSearch]
  for (const obj of queue) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue
    for (const key of keys) {
      if (typeof obj[key] === 'string' && obj[key].trim()) return true
    }
  }
  return false
}

function summarizeOpenClawPluginStatus(config) {
  const entries = config?.plugins?.entries && typeof config.plugins.entries === 'object' ? config.plugins.entries : {}
  const webSearch = {}
  for (const pluginId of OPENCLAW_WEB_SEARCH_PLUGIN_IDS) {
    const entry = entries[pluginId] || {}
    const needsApiKey = ['exa', 'firecrawl', 'perplexity', 'tavily'].includes(pluginId)
    const needsUrl = pluginId === 'searxng'
    webSearch[pluginId] = {
      installed: bundledOpenClawExtensionExists(pluginId),
      enabled: entry.enabled === true,
      usable: entry.enabled === true && (!needsApiKey || pluginEntryHasConfiguredSecret(entry, ['apiKey', 'api_key'])) && (!needsUrl || pluginEntryHasConfiguredSecret(entry, ['baseUrl', 'base_url', 'url'])),
      missingApiKey: entry.enabled === true && needsApiKey && !pluginEntryHasConfiguredSecret(entry, ['apiKey', 'api_key']),
      missingUrl: entry.enabled === true && needsUrl && !pluginEntryHasConfiguredSecret(entry, ['baseUrl', 'base_url', 'url']),
    }
  }
  const memory = {}
  for (const pluginId of OPENCLAW_MEMORY_PLUGIN_IDS) {
    const entry = entries[pluginId] || {}
    memory[pluginId] = {
      installed: bundledOpenClawExtensionExists(pluginId),
      enabled: entry.enabled === true,
      status: bundledOpenClawExtensionExists(pluginId) ? (entry.enabled === true ? 'enabled' : 'disabled') : 'missing',
    }
  }
  return { webSearch, memory }
}

function ensureOpenClawMemoryFiles() {
  const memoryDir = path.join(OPENCLAW_DIR, 'memory')
  const status = { path: memoryDir, exists: false, writable: false, files: {} }
  try {
    fs.mkdirSync(memoryDir, { recursive: true })
    const metadataPath = path.join(memoryDir, 'metadata.json')
    const readmePath = path.join(memoryDir, 'README.md')
    if (!fs.existsSync(metadataPath)) {
      fs.writeFileSync(metadataPath, JSON.stringify({ version: 1, kind: 'openclaw-memory', createdAt: new Date().toISOString() }, null, 2), 'utf8')
    }
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, '# OpenClaw Memory\n\nThis directory stores OpenClaw memory files.\n', 'utf8')
    }
    const testPath = path.join(memoryDir, `.memory-write-test-${process.pid}-${Date.now()}.tmp`)
    fs.writeFileSync(testPath, 'ok', 'utf8')
    fs.unlinkSync(testPath)
    status.exists = true
    status.writable = true
    status.files.metadata = fs.existsSync(metadataPath)
    status.files.readme = fs.existsSync(readmePath)
  } catch (err) {
    status.warning = err?.message || String(err)
    status.exists = fs.existsSync(memoryDir)
  }
  return status
}

function resolveAgentDir(config, id) {
  const agent = findAgentConfig(config, id)
  const customDir = expandHomePath(agent?.agentDir || null)
  if (customDir) return customDir
  return id === 'main' ? OPENCLAW_DIR : path.join(OPENCLAW_DIR, 'agents', id)
}

function resolveAgentWorkspace(config, id) {
  const agent = findAgentConfig(config, id)
  const workspace = expandHomePath(agent?.workspace || null)
  if (workspace) return workspace
  return id === 'main' ? resolveDefaultWorkspace(config) : path.join(resolveAgentDir(config, id), 'workspace')
}

const WORKSPACE_TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'mdx', 'txt', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'log', 'csv', 'env', 'gitignore', 'gitattributes', 'editorconfig', 'js', 'mjs', 'cjs', 'ts',
  'tsx', 'jsx', 'html', 'htm', 'css', 'scss', 'less', 'rs', 'py', 'sh', 'bash', 'zsh', 'fish',
  'ps1', 'bat', 'cmd', 'sql', 'xml', 'java', 'kt', 'go', 'rb', 'php', 'c', 'cc', 'cpp', 'h',
  'hpp', 'vue', 'svelte', 'lock', 'sample'
])

const WORKSPACE_TEXT_BASENAMES = new Set([
  'dockerfile',
  'makefile',
  'readme',
  'license',
  '.env',
  '.env.local',
  '.env.example',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.npmrc'
])

const WORKSPACE_PREVIEW_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])
const MAX_WORKSPACE_FILE_SIZE = 1024 * 1024

function normalizeWorkspaceRelativePath(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  if (path.isAbsolute(trimmed)) throw new Error('不允许使用绝对路径')
  const normalized = path.normalize(trimmed).replace(/\\/g, '/')
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('不允许访问工作区外部路径')
  }
  return normalized.split('/').filter(part => part && part !== '.').join('/')
}

function resolveAgentWorkspaceChild(config, id, relativePath = '') {
  const root = resolveAgentWorkspace(config, id)
  const normalized = normalizeWorkspaceRelativePath(relativePath)
  return {
    root,
    relativePath: normalized,
    fullPath: normalized ? path.join(root, normalized) : root,
  }
}

function isWorkspaceTextFile(filePath) {
  const base = path.basename(filePath).toLowerCase()
  const ext = path.extname(base).replace(/^\./, '')
  return WORKSPACE_TEXT_EXTENSIONS.has(ext) || WORKSPACE_TEXT_BASENAMES.has(base)
}

function isWorkspacePreviewableFile(filePath) {
  const ext = path.extname(filePath).replace(/^\./, '').toLowerCase()
  return WORKSPACE_PREVIEW_EXTENSIONS.has(ext)
}

function looksBinaryBuffer(buffer) {
  return buffer.subarray(0, Math.min(buffer.length, 512)).includes(0)
}

function toWorkspaceRelativePath(root, fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/')
}

function resolveMemoryDir(config, agentId, category) {
  const workspace = resolveAgentWorkspace(config, agentId || 'main')
  if (category === 'archive') return path.join(path.dirname(workspace), 'workspace-memory')
  if (category === 'core') return workspace
  return path.join(workspace, category || 'memory')
}

function resolveMemoryPathCandidates(config, agentId, filePath) {
  return ['memory', 'archive', 'core'].map(category => path.join(resolveMemoryDir(config, agentId || 'main', category), filePath))
}

function isManagedMemoryFile(name) {
  return /\.(md|txt|json|jsonl)$/i.test(name)
}

function collectMemoryFiles(baseDir, currentDir, files, category) {
  if (!fs.existsSync(currentDir)) return
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const full = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      if (category !== 'core') collectMemoryFiles(baseDir, full, files, category)
      continue
    }
    if (!isManagedMemoryFile(entry.name)) continue
    files.push(path.relative(baseDir, full).replace(/\\/g, '/'))
  }
}

const QQBOT_DEFAULT_ACCOUNT_ID = 'default'

function platformStorageKey(platform) {
  switch (platform) {
    case 'dingtalk':
    case 'dingtalk-connector':
      return 'dingtalk-connector'
    case 'weixin':
      return 'openclaw-weixin'
    default:
      return platform
  }
}

function platformListId(platform) {
  switch (platform) {
    case 'dingtalk-connector':
      return 'dingtalk'
    case 'openclaw-weixin':
      return 'weixin'
    default:
      return platform
  }
}

function platformBindingChannel(platform) {
  const storageKey = platformStorageKey(platform)
  if (storageKey === 'dingtalk-connector') return 'dingtalk-connector'
  if (storageKey === 'openclaw-weixin') return 'openclaw-weixin'
  return platformListId(storageKey)
}

function channelHasQqbotCredentials(entry) {
  return !!(entry && typeof entry === 'object' && (entry.appId || entry.clientSecret || entry.appSecret || entry.token))
}

function resolvePlatformConfigEntry(channelRoot, platform, accountId) {
  if (!channelRoot || typeof channelRoot !== 'object') return null
  const accountKey = typeof accountId === 'string' ? accountId.trim() : ''
  if (accountKey) return channelRoot.accounts?.[accountKey] || channelRoot
  if (platformStorageKey(platform) === 'qqbot' && !channelHasQqbotCredentials(channelRoot)) {
    return channelRoot.accounts?.[QQBOT_DEFAULT_ACCOUNT_ID] || channelRoot
  }
  return channelRoot
}

function listPlatformAccounts(channelRoot) {
  if (!channelRoot || typeof channelRoot !== 'object' || !channelRoot.accounts || typeof channelRoot.accounts !== 'object') {
    return []
  }
  return Object.entries(channelRoot.accounts)
    .map(([accountId, value]) => {
      const entry = { accountId }
      const displayId = value?.appId || value?.clientId || value?.account || null
      if (displayId) entry.appId = displayId
      return entry
    })
    .sort((a, b) => (a.accountId || '').localeCompare(b.accountId || ''))
}

const DEFAULT_MESSAGE_CHANNELS = ['telegram', 'signal', 'slack', 'irc', 'matrix', 'mattermost', 'imessage']
const CHANNEL_REQUIRED_FIELDS = {
  telegram: ['botToken', 'chatId'],
  slack: ['botToken', 'channelId'],
  signal: ['phoneNumber', 'signalCliPath'],
  irc: ['server', 'port', 'nickname', 'channel'],
  matrix: ['homeserver', 'accessToken', 'roomId'],
  mattermost: ['serverUrl', 'token', 'channelId'],
}

function channelConfigHasRequiredFields(platform, entry) {
  if (!entry || typeof entry !== 'object') return false
  const fields = CHANNEL_REQUIRED_FIELDS[platformListId(platform)] || []
  if (!fields.length) return false
  return fields.every(key => typeof entry[key] === 'string' && entry[key].trim())
}

function normalizeMessageChannelEntry(id, val) {
  const platformId = platformListId(id)
  const unsupported = platformId === 'imessage'
  const configured = !unsupported && channelConfigHasRequiredFields(platformId, val)
  return {
    id: platformId,
    installed: !unsupported,
    unsupported,
    disabledReason: unsupported ? '不支持当前平台' : '',
    configured,
    enabled: configured && val?.enabled === true,
    accounts: listPlatformAccounts(val),
  }
}

function normalizeBindingMatchValue(value) {
  if (Array.isArray(value)) {
    const normalized = value.map(item => normalizeBindingMatchValue(item)).filter(item => item !== undefined)
    if (normalized.every(item => typeof item === 'string')) return [...normalized].sort()
    return normalized
  }
  if (value && typeof value === 'object') {
    const result = {}
    for (const key of Object.keys(value).sort()) {
      if (key === 'peer') {
        const peer = value[key]
        if (typeof peer === 'string' && peer.trim()) {
          result.peer = { kind: 'direct', id: peer.trim() }
        } else if (peer && typeof peer === 'object' && typeof peer.id === 'string' && peer.id.trim()) {
          result.peer = {
            kind: typeof peer.kind === 'string' && peer.kind.trim() ? peer.kind.trim() : 'direct',
            id: peer.id.trim(),
          }
        }
        continue
      }
      const normalized = normalizeBindingMatchValue(value[key])
      if (normalized === undefined) continue
      if (key === 'accountId' && (normalized === '' || normalized === null)) continue
      if (typeof normalized === 'string' && !normalized.trim()) continue
      result[key] = normalized
    }
    return result
  }
  if (typeof value === 'string') return value.trim()
  return value
}

function jsonValueEquals(left, right) {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => jsonValueEquals(item, right[index]))
  }
  if (left && typeof left === 'object' && right && typeof right === 'object') {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && jsonValueEquals(left[key], right[key]))
  }
  return false
}

function buildBindingMatch(channel, accountId, bindingConfig) {
  const match = {
    channel,
    ...(accountId ? { accountId } : {}),
  }
  if (bindingConfig && typeof bindingConfig === 'object') {
    for (const [key, value] of Object.entries(bindingConfig)) {
      if (key === 'peer') {
        if (typeof value === 'string' && value.trim()) {
          match.peer = { kind: 'direct', id: value.trim() }
        } else if (value && typeof value === 'object' && value.id) {
          match.peer = { kind: value.kind || 'direct', id: value.id }
        }
      } else if (key !== 'accountId' && key !== 'channel' && value !== undefined && value !== null) {
        match[key] = value
      }
    }
  }
  return normalizeBindingMatchValue(match)
}

function bindingIdentityMatches(binding, agentId, targetMatch) {
  if ((binding?.agentId || 'main') !== (agentId || 'main')) return false
  return jsonValueEquals(
    normalizeBindingMatchValue(binding?.match || {}),
    normalizeBindingMatchValue(targetMatch || {}),
  )
}

function triggerGatewayReloadNonBlocking(reason) {
  setTimeout(() => {
    try {
      handlers.reload_gateway()
    } catch (e) {
      console.warn(`[dev-api] Gateway reload skipped after ${reason}: ${e.message || e}`)
    }
  }, 0)
}

// Gateway 重启的单飞行锁 + 2s 冷却（配合前端 gateway-restart-queue.js 的 3s 防抖）
// 避免 issue #243 / #240：前端穿透节流时，后端也能合并重复请求
let _gwRestartInflight = null
let _gwRestartLastFinishedAt = 0
const GW_RESTART_COOLDOWN_MS = 2000

async function guardedGatewayRestart(source = 'unknown') {
  if (process.env.DISABLE_GATEWAY_SPAWN === '1' || process.env.DISABLE_GATEWAY_SPAWN === 'true') {
    throw new Error('本地 Gateway 启动已禁用（DISABLE_GATEWAY_SPAWN=1）')
  }
  if (!isMac && !isLinux) {
    throw new Error('Windows 请使用 Tauri 桌面应用')
  }

  // 进行中的调用：复用同一个 Promise，不重复执行
  if (_gwRestartInflight) {
    return _gwRestartInflight
  }

  // 冷却期：刚重启完 2 秒内直接返回合并提示
  if (Date.now() - _gwRestartLastFinishedAt < GW_RESTART_COOLDOWN_MS) {
    return 'Gateway 刚重启过，本次请求已合并（冷却中）'
  }

  _gwRestartInflight = (async () => {
    try {
      await handlers.restart_service({ label: 'ai.openclaw.gateway' })
      return 'Gateway 已重启'
    } finally {
      _gwRestartLastFinishedAt = Date.now()
      _gwRestartInflight = null
    }
  })()

  return _gwRestartInflight
}

// === macOS 服务管理 ===

function macCheckService(label) {
  try {
    const uid = getUid()
    const output = execSync(`launchctl print gui/${uid}/${label} 2>&1`).toString()
    let state = '', pid = null
    for (const line of output.split('\n')) {
      if (!line.startsWith('\t') || line.startsWith('\t\t')) continue
      const trimmed = line.trim()
      if (trimmed.startsWith('pid = ')) pid = parseInt(trimmed.slice(6)) || null
      if (trimmed.startsWith('state = ')) state = trimmed.slice(8).trim()
    }
    // 有 PID 则用 kill -0 验证进程是否存活（比 state 字符串更可靠）
    if (pid) {
      try { execSync(`kill -0 ${pid} 2>&1`); return { running: true, pid } } catch {}
    }
    // 无 PID 时 fallback 到 pgrep（launchctl 可能还没刷出 PID）
    if (state === 'running' || state === 'waiting') {
      try {
        const pgrepOut = execSync(`pgrep -f "openclaw.*gateway" 2>/dev/null`).toString().trim()
        if (pgrepOut) {
          const fallbackPid = parseInt(pgrepOut.split('\n')[0]) || null
          if (fallbackPid) return { running: true, pid: fallbackPid }
        }
      } catch {}
    }
    return { running: state === 'running', pid }
  } catch {
    return { running: false, pid: null }
  }
}

function macStartService(label) {
  const uid = getUid()
  const plistPath = path.join(homedir(), `Library/LaunchAgents/${label}.plist`)
  if (!fs.existsSync(plistPath)) throw new Error(`plist 不存在: ${plistPath}`)
  try { execSync(`launchctl bootstrap gui/${uid} "${plistPath}" 2>&1`) } catch {}
  try { execSync(`launchctl kickstart gui/${uid}/${label} 2>&1`) } catch {}
}

function macStopService(label) {
  const uid = getUid()
  try { execSync(`launchctl bootout gui/${uid}/${label} 2>&1`) } catch {}
}

function macRestartService(label) {
  const uid = getUid()
  const plistPath = path.join(homedir(), `Library/LaunchAgents/${label}.plist`)
  try { execSync(`launchctl bootout gui/${uid}/${label} 2>&1`) } catch {}
  // 等待进程退出
  for (let i = 0; i < 15; i++) {
    const { running } = macCheckService(label)
    if (!running) break
    execSync('sleep 0.2')
  }
  try { execSync(`launchctl bootstrap gui/${uid} "${plistPath}" 2>&1`) } catch {}
  try { execSync(`launchctl kickstart -k gui/${uid}/${label} 2>&1`) } catch {}
}

// === Windows 服务管理 ===

function parseWindowsListeningPids(output, port) {
  const portSuffix = `:${port}`
  const pids = new Set()
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (!line.includes('LISTENING') && !line.includes('侦听')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 5) continue
    if (!parts[1]?.endsWith(portSuffix)) continue
    const pid = Number.parseInt(parts[4], 10)
    if (Number.isInteger(pid) && pid > 0) pids.add(pid)
  }
  return [...pids].sort((a, b) => a - b)
}

function looksLikeGatewayCommandLine(commandLine) {
  const text = String(commandLine || '').toLowerCase()
  return text.includes('openclaw') && text.includes('gateway')
}

function readWindowsProcessCommandLine(pid) {
  const script = `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; if ($p) { [Console]::Out.Write($p.CommandLine) }`
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8',
  })
  if (result.status !== 0) return ''
  return String(result.stdout || '').trim()
}

function inspectWindowsPortOwners(port = readGatewayPort()) {
  const output = execSync('netstat -ano', { windowsHide: true }).toString()
  const listeningPids = parseWindowsListeningPids(output, port)
  const gatewayPids = []
  const foreignPids = []

  for (const pid of listeningPids) {
    const commandLine = readWindowsProcessCommandLine(pid)
    if (looksLikeGatewayCommandLine(commandLine)) gatewayPids.push(pid)
    else if (commandLine) foreignPids.push(pid)  // 只有确实读到非 Gateway 命令行时才归为 foreign
    else gatewayPids.push(pid)  // 命令行读不到时，假定为 Gateway（避免权限问题导致误报）
  }

  return {
    gatewayPids: [...new Set(gatewayPids)].sort((a, b) => a - b),
    foreignPids: [...new Set(foreignPids)].sort((a, b) => a - b),
  }
}

function formatPidList(pids) {
  return pids.map(String).join(', ')
}

function winStartGateway() {
  const port = readGatewayPort()
  ensurePortableOpenClawTools()
  const { gatewayPids, foreignPids } = inspectWindowsPortOwners(port)
  if (gatewayPids.length) {
    ensureOwnedGatewayOrThrow(gatewayPids[0])
    writeGatewayOwner(gatewayPids[0])
    return
  }
  if (foreignPids.length) {
    throw new Error(`端口 ${port} 已被非 Gateway 进程占用 (PID: ${formatPidList(foreignPids)})，已阻止启动`)
  }

  // 确保日志目录存在
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true })
  const logPath = path.join(LOGS_DIR, 'gateway.log')
  const errPath = path.join(LOGS_DIR, 'gateway.err.log')
  const out = fs.openSync(logPath, 'a')
  const err = fs.openSync(errPath, 'a')

  // 写入启动标记到日志
  const timestamp = new Date().toISOString()
  fs.appendFileSync(logPath, `\n[${timestamp}] [ClawPanel] Starting Gateway on Windows...\n`)
  const minimaxConfig = requireOpenClawMiniMaxGatewayConfig()
  const launchConfig = prepareOpenClawGatewayLaunchConfig(minimaxConfig)
  fs.appendFileSync(logPath, `[${timestamp}] [ClawPanel] OpenClaw MiniMax env: hasMiniMaxKey=true keyFingerprint=${openclawMiniMaxKeyFingerprint(minimaxConfig.apiKey)} baseUrl=${minimaxConfig.baseUrl} model=${minimaxConfig.model}\n`)
  if (launchConfig.generated) {
    fs.appendFileSync(logPath, `[${timestamp}] [ClawPanel] OpenClaw Gateway launch config normalized: path=${launchConfig.path} provider=${launchConfig.provider} baseUrl=${launchConfig.baseUrl} model=${launchConfig.model}\n`)
  }

  // 用 cmd.exe /c 启动，不用 shell: true（避免额外 cmd.exe 进程链导致终端闪烁）
  const child = spawnOpenclaw(['gateway', 'run'], {
    stdio: ['ignore', out, err],
    windowsHide: true,
    cwd: appRootDir(),
    env: {
      ...openclawMiniMaxGatewayEnv(),
      OPENCLAW_CONFIG_PATH: launchConfig.path,
    },
  })
  child.unref()
}

async function winStopGateway() {
  const port = readGatewayPort()
  const { gatewayPids, foreignPids } = inspectWindowsPortOwners(port)
  if (!gatewayPids.length) {
    if (foreignPids.length) {
      throw new Error(`端口 ${port} 当前由非 Gateway 进程占用 (PID: ${formatPidList(foreignPids)})，已拒绝停止以避免误杀`)
    }
    return
  }

  spawnOpenclawSync(['gateway', 'stop'], {
    windowsHide: true,
    cwd: appRootDir(),
    encoding: 'utf8',
  })

  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 300))
    if (!(await winCheckGateway()).running) return
  }

  for (const pid of gatewayPids) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { timeout: 5000, windowsHide: true })
    } catch {}
  }

  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 300))
    if (!(await winCheckGateway()).running) return
  }

  throw new Error(`停止失败：Gateway 仍占用端口 ${port}`)
}

// 仅当占用端口的确实是 OpenClaw Gateway 时才视为运行
async function winCheckGateway() {
  const port = readGatewayPort()
  const { gatewayPids } = inspectWindowsPortOwners(port)
  return {
    running: gatewayPids.length > 0,
    pid: gatewayPids[0] || null,
  }
}

function readGatewayPort() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    return config?.gateway?.port || 18789
  } catch {
    return 18789
  }
}

function isOpenclawGatewayHealthReady(body) {
  if (!body || typeof body !== 'object') return false
  const status = String(body.status || '').toLowerCase()
  return body.ok === true || body.ready === true || status === 'live' || status === 'ready'
}

async function probeOpenclawGatewayHealth(port = readGatewayPort(), timeoutMs = 2500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = `http://127.0.0.1:${port}/health`
  try {
    const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    let body = null
    try {
      body = await resp.json()
    } catch {
      body = { text: await resp.text().catch(() => '') }
    }
    const ready = resp.ok && isOpenclawGatewayHealthReady(body)
    return {
      ready,
      httpOk: resp.ok,
      status: typeof body?.status === 'string' ? body.status : ready ? 'ready' : 'not_ready',
      body,
    }
  } catch (error) {
    return {
      ready: false,
      httpOk: false,
      status: 'error',
      error: error?.message || String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

function gatewayOwnerFilePath() {
  return path.join(OPENCLAW_DIR, 'gateway-owner.json')
}

function normalizePathTextForCompare(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const normalized = text.replace(/\//g, '\\').replace(/\\+/g, '\\')
  return isWindows ? normalized.toLowerCase() : normalized
}

function normalizePathForCompare(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  let resolved
  try {
    resolved = path.resolve(value)
  } catch {
    resolved = value
  }
  try {
    resolved = fs.realpathSync.native(resolved)
  } catch {}
  return normalizePathTextForCompare(resolved)
}

function pathsMatchForCompare(left, right) {
  const a = normalizePathForCompare(left)
  const b = normalizePathForCompare(right)
  return !!a && !!b && a === b
}

function normalizeGatewayOwnerRecord(owner) {
  if (!owner || typeof owner !== 'object') return null
  return {
    ...owner,
    cliPath: owner.cliPath || owner.cli_path || null,
    openclawDir: owner.openclawDir || owner.openclaw_dir || '',
    startedAt: owner.startedAt || owner.started_at || '',
    startedBy: owner.startedBy || owner.started_by || '',
  }
}

function readGatewayOwner() {
  try {
    const ownerPath = gatewayOwnerFilePath()
    if (!fs.existsSync(ownerPath)) return null
    return normalizeGatewayOwnerRecord(JSON.parse(fs.readFileSync(ownerPath, 'utf8')))
  } catch (error) {
    console.warn(`[gateway-owner] read failed: ${error?.message || error}`)
    return null
  }
}

function currentGatewayOwnerSignature() {
  return {
    port: readGatewayPort(),
    cliPath: canonicalCliPath(resolveOpenclawCliPath()),
    openclawDir: path.resolve(OPENCLAW_DIR),
  }
}

function matchesCurrentGatewayOwnerSignature(owner) {
  if (!owner || owner.startedBy !== 'clawpanel') return false
  const current = currentGatewayOwnerSignature()
  if (Number(owner.port || 0) !== current.port) return false
  if (!pathsMatchForCompare(owner.openclawDir, current.openclawDir)) return false
  // 仅当双方都有 cliPath 且不同时才视为不匹配；任一侧缺失时放宽为兼容（向后兼容旧记录/未绑定 CLI）
  if (owner.cliPath && current.cliPath && !pathsMatchForCompare(owner.cliPath, current.cliPath)) return false
  return true
}

function gatewayOwnerPidNeedsRefresh(owner, pid = null) {
  if (!matchesCurrentGatewayOwnerSignature(owner)) return false
  if (!Number.isInteger(pid) || pid <= 0) return false
  return !Number.isInteger(owner?.pid) || Number(owner.pid) !== Number(pid)
}

function isCurrentGatewayOwner(owner, pid = null) {
  return matchesCurrentGatewayOwnerSignature(owner)
}

function writeGatewayOwner(pid = null) {
  const ownerPath = gatewayOwnerFilePath()
  const ownerDir = path.dirname(ownerPath)
  if (!fs.existsSync(ownerDir)) fs.mkdirSync(ownerDir, { recursive: true })
  const current = currentGatewayOwnerSignature()
  fs.writeFileSync(ownerPath, JSON.stringify({
    ...current,
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    startedAt: new Date().toISOString(),
    startedBy: 'clawpanel',
  }, null, 2), 'utf8')
}

function clearGatewayOwner() {
  try {
    const ownerPath = gatewayOwnerFilePath()
    if (fs.existsSync(ownerPath)) fs.unlinkSync(ownerPath)
  } catch {}
}

function gatewayOwnerMismatchReason(owner) {
  const current = currentGatewayOwnerSignature()
  if (!owner) return 'missing owner'
  if (owner.startedBy !== 'clawpanel') return `startedBy mismatch: ${owner.startedBy || '(empty)'}`
  if (Number(owner.port || 0) !== current.port) return `port mismatch: ${owner.port || '(empty)'} != ${current.port}`
  if (!pathsMatchForCompare(owner.openclawDir, current.openclawDir)) return 'openclawDir mismatch'
  if (owner.cliPath && current.cliPath && !pathsMatchForCompare(owner.cliPath, current.cliPath)) return 'cliPath mismatch'
  return 'unknown mismatch'
}

function windowsGatewayPidBelongsToCurrentProject(pid) {
  if (!isWindows || !Number.isInteger(Number(pid))) return false
  const commandLine = readWindowsProcessCommandLine(Number(pid))
  if (!looksLikeGatewayCommandLine(commandLine)) return false
  const text = normalizePathTextForCompare(commandLine)
  const candidates = [
    bundledOpenclawBinDir(),
    resolveOpenclawCliPath() ? path.dirname(resolveOpenclawCliPath()) : null,
    appResourcesDir(),
    appRootDir(),
  ].map(normalizePathForCompare).filter(Boolean)
  return candidates.some(candidate => text.includes(candidate))
}

function shouldAutoClaimGateway(owner, pid = null) {
  const current = currentGatewayOwnerSignature()
  if (!owner) {
    return !isWindows || windowsGatewayPidBelongsToCurrentProject(pid)
  }
  // owner 文件存在但签名不完全匹配 → 仅按 port + openclaw_dir 判断
  if (Number(owner.port || 0) === current.port && pathsMatchForCompare(owner.openclawDir, current.openclawDir)) {
    return true
  }
  if (Number(owner.port || 0) === current.port && windowsGatewayPidBelongsToCurrentProject(pid)) {
    console.warn(`[gateway-owner] ${gatewayOwnerMismatchReason(owner)}; reclaiming bundled Gateway PID ${pid || 'unknown'}`)
    return true
  }
  console.warn(`[gateway-owner] ${gatewayOwnerMismatchReason(owner)}; keeping Gateway as foreign`)
  return false
}

function foreignGatewayError(pid = null) {
  const port = readGatewayPort()
  const pidText = pid ? ` (PID: ${pid})` : ''
  return new Error(`检测到端口 ${port} 上已有其他 OpenClaw Gateway 正在运行${pidText}，且不属于当前面板实例。为避免误接管，请先关闭该实例，或将当前 CLI/目录绑定到它对应的安装。`)
}

function ensureOwnedGatewayOrThrow(pid = null) {
  const owner = readGatewayOwner()
  if (isCurrentGatewayOwner(owner, pid)) {
    if (gatewayOwnerPidNeedsRefresh(owner, pid)) writeGatewayOwner(pid)
    return true
  }
  // 无有效 owner 或签名不匹配 → 尝试自动认领（端口 + 数据目录匹配即可）
  if (shouldAutoClaimGateway(owner, pid)) {
    writeGatewayOwner(pid)
    return true
  }
  throw foreignGatewayError(pid)
}

async function getLocalGatewayRuntime(label = 'ai.openclaw.gateway') {
  if (isMac) return macCheckService(label)
  if (isLinux) return linuxCheckGateway()
  return winCheckGateway()
}

async function waitForGatewayReady(label = 'ai.openclaw.gateway', timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastHealth = null
  while (Date.now() < deadline) {
    const status = await getLocalGatewayRuntime(label)
    if (status?.running) {
      ensureOwnedGatewayOrThrow(status.pid || null)
      lastHealth = await probeOpenclawGatewayHealth()
      if (lastHealth.ready) {
        writeGatewayOwner(status.pid || null)
        return { ...status, health_ready: true, health_status: lastHealth.status }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const detail = lastHealth?.status ? ` health=${lastHealth.status}` : ''
  throw new Error(`OpenClaw Gateway 启动超时，请点击重新连接。${detail} 日志：${path.join(LOGS_DIR, 'gateway.err.log')}`)
}

async function waitForGatewayRunning(label = 'ai.openclaw.gateway', timeoutMs = 30000) {
  return waitForGatewayReady(label, timeoutMs)
}

async function waitForGatewayStopped(label = 'ai.openclaw.gateway', timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const status = await getLocalGatewayRuntime(label)
    if (!status?.running) {
      clearGatewayOwner()
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  return false
}

// === Linux 服务管理 ===

/**
 * 扫描常见 Node 版本管理器路径查找 openclaw 二进制文件。
 * 解决 systemd 服务环境中 PATH 不含 nvm/volta/fnm 路径的问题。
 */
function findOpenclawBin() {
  try {
    return execSync('which openclaw 2>/dev/null', { stdio: 'pipe' }).toString().trim()
  } catch {}

  const home = homedir()
  const candidates = [
    '/usr/local/bin/openclaw',
    '/usr/bin/openclaw',
    '/snap/bin/openclaw',
    path.join(home, '.local/bin/openclaw'),
    // npm 全局安装路径（修复 #156：systemd 服务缺少 PATH 时 which 失败）
    path.join(home, '.npm-global/bin/openclaw'),
    path.join(home, '.npm/bin/openclaw'),
  ]

  // nvm
  const nvmDir = process.env.NVM_DIR || path.join(home, '.nvm')
  const nvmVersions = path.join(nvmDir, 'versions/node')
  if (fs.existsSync(nvmVersions)) {
    try {
      for (const entry of fs.readdirSync(nvmVersions)) {
        candidates.push(path.join(nvmVersions, entry, 'bin/openclaw'))
      }
    } catch {}
  }

  // volta
  candidates.push(path.join(home, '.volta/bin/openclaw'))

  // nodenv
  candidates.push(path.join(home, '.nodenv/shims/openclaw'))

  // fnm
  const fnmDir = process.env.FNM_DIR || path.join(home, '.local/share/fnm')
  const fnmVersions = path.join(fnmDir, 'node-versions')
  if (fs.existsSync(fnmVersions)) {
    try {
      for (const entry of fs.readdirSync(fnmVersions)) {
        candidates.push(path.join(fnmVersions, entry, 'installation/bin/openclaw'))
      }
    } catch {}
  }

  // /usr/local/lib/nodejs（手动安装的 Node.js）
  const nodejsLib = '/usr/local/lib/nodejs'
  if (fs.existsSync(nodejsLib)) {
    try {
      for (const entry of fs.readdirSync(nodejsLib)) {
        candidates.push(path.join(nodejsLib, entry, 'bin/openclaw'))
      }
    } catch {}
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function linuxCheckGateway() {
  const port = readGatewayPort()
  // ss 查端口监听
  try {
    const out = execSync(`ss -tlnp 'sport = :${port}' 2>/dev/null`, { timeout: 3000 }).toString().trim()
    const pidMatch = out.match(/pid=(\d+)/)
    if (pidMatch) {
      const pid = parseInt(pidMatch[1])
      // 修复 #151: 验证进程是否是 OpenClaw，避免与其他占用同端口的程序冲突
      let isOpenClaw = false
      try {
        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ')
        isOpenClaw = /openclaw/i.test(cmdline)
      } catch {
        isOpenClaw = true // 无法读取进程信息时保守认为是
      }
      return { running: true, pid, manageable: isOpenClaw }
    }
    if (out.includes(`:${port}`)) return { running: true, pid: null, manageable: false }
  } catch {}
  // fallback: lsof
  try {
    const out = execSync(`lsof -i :${port} -t 2>/dev/null`, { timeout: 3000 }).toString().trim()
    if (out) {
      const pid = parseInt(out.split('\n')[0]) || null
      return { running: !!pid, pid }
    }
  } catch {}
  // fallback: /proc/net/tcp
  try {
    const hexPort = port.toString(16).toUpperCase().padStart(4, '0')
    const tcp = fs.readFileSync('/proc/net/tcp', 'utf8')
    if (tcp.includes(`:${hexPort}`)) return { running: true, pid: null }
  } catch {}
  return { running: false, pid: null }
}

function linuxStartGateway() {
  ensurePortableOpenClawTools()
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true })
  const logPath = path.join(LOGS_DIR, 'gateway.log')
  const errPath = path.join(LOGS_DIR, 'gateway.err.log')
  const out = fs.openSync(logPath, 'a')
  const err = fs.openSync(errPath, 'a')

  const timestamp = new Date().toISOString()
  fs.appendFileSync(logPath, `\n[${timestamp}] [ClawPanel] Starting Gateway on Linux...\n`)
  const minimaxConfig = requireOpenClawMiniMaxGatewayConfig()
  fs.appendFileSync(logPath, `[${timestamp}] [ClawPanel] OpenClaw MiniMax env: hasMiniMaxKey=true keyFingerprint=${openclawMiniMaxKeyFingerprint(minimaxConfig.apiKey)} baseUrl=${minimaxConfig.baseUrl} model=${minimaxConfig.model}\n`)

  const child = spawnOpenclaw(['gateway', 'run'], {
    stdio: ['ignore', out, err],
    shell: false,
    cwd: homedir(),
    env: openclawMiniMaxGatewayEnv(),
  })
  child.unref()
}

function linuxStopGateway() {
  const { running, pid, manageable } = linuxCheckGateway()
  if (!running || !pid) throw new Error('Gateway 未运行')
  // 修复 #151: 检测到非 OpenClaw 进程占用端口时拒绝操作
  if (manageable === false) throw new Error(`端口已被其他进程 (PID ${pid}) 占用，无法操作`)
  ensureOwnedGatewayOrThrow(pid)
  try {
    process.kill(pid, 'SIGTERM')
  } catch (e) {
    try { process.kill(pid, 'SIGKILL') } catch {}
    throw new Error('停止失败: ' + (e.message || e))
  }
}

// === Docker Socket 通信 ===

function dockerRequest(method, apiPath, body = null, endpoint = null) {
  return new Promise((resolve, reject) => {
    const opts = { path: apiPath, method, headers: { 'Content-Type': 'application/json' } }
    const target = normalizeDockerEndpoint(endpoint) || defaultDockerEndpoint()
    if (target.startsWith('tcp://')) {
      const url = new URL(target.replace('tcp://', 'http://'))
      opts.hostname = url.hostname
      opts.port = parseInt(url.port) || 2375
    } else {
      opts.socketPath = target
    }
    const req = http.request(opts, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', (e) => reject(new Error('Docker 连接失败: ' + e.message)))
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Docker API 超时')) })
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// Docker exec 附着模式：运行命令并捕获 stdout/stderr（解析多路复用流）
function dockerExecRun(containerId, cmd, endpoint = null, timeout = DOCKER_TASK_TIMEOUT_MS) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. 创建 exec
      const createResp = await dockerRequest('POST', `/containers/${containerId}/exec`, {
        AttachStdout: true, AttachStderr: true, Cmd: cmd,
      }, endpoint)
      if (createResp.status >= 400) return reject(new Error(`exec create: ${createResp.status} ${createResp.data?.message || ''}`))
      const execId = createResp.data?.Id
      if (!execId) return reject(new Error('no exec ID'))

      // 2. 启动 exec（附着模式，捕获输出流）
      const opts = {
        path: `/exec/${execId}/start`, method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
      const target = normalizeDockerEndpoint(endpoint) || defaultDockerEndpoint()
      if (target.startsWith('tcp://')) {
        const url = new URL(target.replace('tcp://', 'http://'))
        opts.hostname = url.hostname
        opts.port = parseInt(url.port) || 2375
      } else {
        opts.socketPath = target
      }

      const req = http.request(opts, (res) => {
        let stdout = '', stderr = ''
        let buf = Buffer.alloc(0)

        res.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk])
          // 解析 Docker 多路复用流：[type(1), 0(3), size(4)] + payload
          while (buf.length >= 8) {
            const streamType = buf[0] // 1=stdout, 2=stderr
            const size = buf.readUInt32BE(4)
            if (buf.length < 8 + size) break
            const payload = buf.slice(8, 8 + size).toString('utf8')
            buf = buf.slice(8 + size)
            if (streamType === 1) stdout += payload
            else if (streamType === 2) stderr += payload
          }
        })

        res.on('end', () => resolve({ stdout, stderr }))
        res.on('error', reject)
      })

      req.on('error', reject)
      req.setTimeout(timeout, () => { req.destroy(); reject(new Error('exec timeout')) })
      req.write(JSON.stringify({ Detach: false, Tty: false }))
      req.end()
    } catch (e) { reject(e) }
  })
}

// 查找 clawpanel-agent.cjs 脚本并注入到容器（.cjs 避免容器内 ESM 冲突）
function findAgentScript() {
  const candidates = [
    path.resolve(__dev_dirname, '../openclaw-docker/full/clawpanel-agent.cjs'),
    path.resolve(__dev_dirname, '../openclaw-docker/full/clawpanel-agent.js'),
    path.resolve(__dev_dirname, '../../openclaw-docker/full/clawpanel-agent.cjs'),
    path.resolve(__dev_dirname, '../../openclaw-docker/full/clawpanel-agent.js'),
    path.resolve(__dev_dirname, '../clawpanel-agent.cjs'),
    path.resolve(__dev_dirname, '../clawpanel-agent.js'),
    path.resolve(__dev_dirname, 'clawpanel-agent.cjs'),
    path.resolve(__dev_dirname, 'clawpanel-agent.js'),
  ]
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue
    const content = fs.readFileSync(p, 'utf8')
    return {
      path: p,
      content,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
    }
  }
  return null
}

function getAgentSyncCacheKey(containerId, endpoint) {
  return `${normalizeDockerEndpoint(endpoint) || defaultDockerEndpoint()}:${containerId}`
}

function createContainerShellExec(containerId, endpoint) {
  return async (shellCmd) => {
    const createResp = await dockerRequest('POST', `/containers/${containerId}/exec`, {
      AttachStdout: true, AttachStderr: true, Cmd: ['sh', '-c', shellCmd],
    }, endpoint)
    if (createResp.status >= 400) throw new Error(`exec 失败: ${createResp.status}`)
    const execId = createResp.data?.Id
    if (!execId) throw new Error('exec ID 缺失')
    await dockerRequest('POST', `/exec/${execId}/start`, { Detach: true }, endpoint)
    await new Promise(r => setTimeout(r, 300))
  }
}

async function injectAgentToContainer(containerId, endpoint, cExecFn, agentScript = null) {
  const source = agentScript || findAgentScript()
  if (!source) {
    console.warn('[agent] clawpanel-agent.cjs 未找到，跳过注入')
    return false
  }
  const b64 = Buffer.from(source.content, 'utf8').toString('base64')
  await cExecFn(`echo '${b64}' | base64 -d > /app/clawpanel-agent.cjs`)
  console.log(`[agent] agent 已同步 → ${containerId.slice(0, 12)} (${source.hash.slice(0, 8)})`)
  _agentScriptSyncCache.set(getAgentSyncCacheKey(containerId, endpoint), source.hash)
  return true
}

async function syncAgentToContainerIfNeeded(containerId, endpoint, cExecFn) {
  const source = findAgentScript()
  if (!source) {
    console.warn('[agent] 本地 agent 脚本缺失，跳过自动同步')
    return false
  }

  const cacheKey = getAgentSyncCacheKey(containerId, endpoint)
  if (_agentScriptSyncCache.get(cacheKey) === source.hash) {
    return true
  }

  return injectAgentToContainer(containerId, endpoint, cExecFn, source)
}

function withLocalDockerNode(nodes) {
  const list = Array.isArray(nodes)
    ? nodes.filter(Boolean).map(node => {
      const endpoint = node?.id === 'local'
        ? defaultDockerEndpoint()
        : (normalizeDockerEndpoint(node?.endpoint) || node?.endpoint)
      if (!endpoint) return { ...node }
      return {
        ...node,
        endpoint,
        type: endpoint.startsWith('tcp://') ? 'tcp' : 'socket',
      }
    })
    : []
  const local = defaultLocalDockerNode()
  const index = list.findIndex(node => node.id === 'local')
  if (index >= 0) list[index] = { ...list[index], ...local }
  else list.unshift(local)
  return list
}

function readDockerNodes() {
  if (!fs.existsSync(dockerNodesPath())) {
    return withLocalDockerNode([])
  }
  try {
    const data = JSON.parse(fs.readFileSync(dockerNodesPath(), 'utf8'))
    return withLocalDockerNode(data.nodes || [])
  } catch {
    return withLocalDockerNode([])
  }
}

function saveDockerNodes(nodes) {
  const panelDir = path.dirname(dockerNodesPath())
  if (!fs.existsSync(panelDir)) fs.mkdirSync(panelDir, { recursive: true })
  const persisted = (Array.isArray(nodes) ? nodes : [])
    .filter(node => node && node.id !== 'local')
    .map(node => {
      const endpoint = normalizeDockerEndpoint(node.endpoint) || node.endpoint
      return {
        ...node,
        endpoint,
        type: String(endpoint || '').startsWith('tcp://') ? 'tcp' : 'socket',
      }
    })
  fs.writeFileSync(dockerNodesPath(), JSON.stringify({ nodes: persisted }, null, 2))
}

function isDockerAvailable() {
  const endpoint = defaultDockerEndpoint()
  if (isWindows || endpoint.startsWith('tcp://')) return true // named pipe / TCP 端点无法直接 stat
  return fs.existsSync(endpoint)
}

// === 镜像拉取进度追踪 ===
const _pullProgress = new Map()

// === 实例注册表 ===

const DEFAULT_LOCAL_INSTANCE = { id: 'local', name: '本机', type: 'local', endpoint: null, gatewayPort: 18789, addedAt: 0, note: '' }

function readInstances() {
  if (!fs.existsSync(instancesPath())) {
    return { activeId: 'local', instances: [{ ...DEFAULT_LOCAL_INSTANCE }] }
  }
  try {
    const data = JSON.parse(fs.readFileSync(instancesPath(), 'utf8'))
    if (!data.instances?.length) data.instances = [{ ...DEFAULT_LOCAL_INSTANCE }]
    if (!data.instances.find(i => i.id === 'local')) data.instances.unshift({ ...DEFAULT_LOCAL_INSTANCE })
    if (!data.activeId || !data.instances.find(i => i.id === data.activeId)) data.activeId = 'local'
    return data
  } catch {
    return { activeId: 'local', instances: [{ ...DEFAULT_LOCAL_INSTANCE }] }
  }
}

function saveInstances(data) {
  const panelDir = path.dirname(instancesPath())
  if (!fs.existsSync(panelDir)) fs.mkdirSync(panelDir, { recursive: true })
  fs.writeFileSync(instancesPath(), JSON.stringify(data, null, 2))
}

function getActiveInstance() {
  const data = readInstances()
  return data.instances.find(i => i.id === data.activeId) || data.instances[0]
}

async function proxyToInstance(instance, cmd, body) {
  const url = `${instance.endpoint}/__api/${cmd}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await resp.text()
  try { return JSON.parse(text) }
  catch { return text }
}

async function proxyStreamToInstance(instance, cmd, body, req, res) {
  const controller = new AbortController()
  res.on('close', () => controller.abort())
  const upstream = await fetch(`${instance.endpoint}/__api/${cmd}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
  res.statusCode = upstream.status
  const contentType = upstream.headers.get('content-type') || 'application/x-ndjson; charset=utf-8'
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  if (!upstream.body) {
    res.end(await upstream.text())
    return
  }
  const reader = upstream.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) res.write(Buffer.from(value))
    }
  } finally {
    try { reader.releaseLock() } catch {}
    if (!res.writableEnded && !res.destroyed) res.end()
  }
}

async function instanceHealthCheck(instance) {
  const result = { id: instance.id, online: false, version: null, gatewayRunning: false, lastCheck: Date.now() }
  if (instance.type === 'local') {
    result.online = true
    try {
      const services = await handlers.get_services_status()
      result.gatewayRunning = services?.[0]?.running === true
    } catch {}
    try {
      const ver = await handlers.get_version_info()
      result.version = ver?.current
    } catch {}
    return result
  }
  // Docker 类型实例：通过 Docker API 检查容器状态
  if (instance.type === 'docker' && instance.containerId) {
    try {
      const nodes = readDockerNodes()
      const node = instance.nodeId ? nodes.find(n => n.id === instance.nodeId) : nodes[0]
      if (node) {
        const resp = await dockerRequest('GET', `/containers/${instance.containerId}/json`, null, node.endpoint)
        if (resp.status < 400 && resp.data?.State?.Running) {
          result.online = true
          result.gatewayRunning = true
        }
      }
    } catch {}
    return result
  }

  if (!instance.endpoint) return result
  try {
    const resp = await fetch(`${instance.endpoint}/__api/check_installation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    })
    if (resp.ok) {
      const data = await resp.json()
      result.online = true
      result.version = data?.version || null
    }
  } catch {}
  if (result.online) {
    try {
      const resp = await fetch(`${instance.endpoint}/__api/get_services_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      })
      if (resp.ok) {
        const services = await resp.json()
        result.gatewayRunning = services?.[0]?.running === true
      }
    } catch {}
  }
  return result
}

// 始终在本机处理的命令（不代理到远程实例）
const ALWAYS_LOCAL = new Set([
  'instance_list', 'instance_add', 'instance_remove', 'instance_set_active',
  'instance_health_check', 'instance_health_all',
  'docker_info', 'docker_list_containers', 'docker_create_container',
  'docker_start_container', 'docker_stop_container', 'docker_restart_container',
  'docker_remove_container', 'docker_rebuild_container', 'docker_container_logs', 'docker_container_exec', 'docker_init_worker', 'docker_gateway_chat', 'docker_agent', 'docker_agent_broadcast', 'docker_dispatch_task', 'docker_dispatch_broadcast', 'docker_task_status', 'docker_task_list', 'docker_pull_image', 'docker_pull_status',
  'docker_list_images', 'docker_list_nodes', 'docker_add_node', 'docker_remove_node',
  'docker_cluster_overview',
  'auth_check', 'auth_login', 'auth_logout',
  'read_panel_config', 'write_panel_config',
  'get_deploy_mode',
  'assistant_exec', 'assistant_read_file', 'assistant_write_file',
  'assistant_list_dir', 'assistant_open_path', 'assistant_system_info', 'assistant_list_processes',
  'assistant_check_port', 'assistant_web_search', 'assistant_fetch_url',
  'assistant_ensure_data_dir', 'assistant_save_image', 'assistant_load_image', 'assistant_delete_image',
  'hermes_load_media_image',
  'get_effective_model_config',
  'read_minimax_test_config', 'save_minimax_test_config', 'configure_claude_code_relay',
  'payment_request',
])

// === 工具函数 ===

// 清理 base URL：去掉尾部斜杠和已知端点路径，防止路径重复
function _normalizeBaseUrl(raw) {
  let base = (raw || '').replace(/\/+$/, '')
  base = base.replace(/\/(api\/chat|api\/generate|api\/tags|api|chat\/completions|completions|responses|messages|models)\/?$/, '')
  base = base.replace(/\/(api\/chat|api\/generate|api\/tags|api|chat\/completions|completions|responses|messages|models)\/?$/, '')
  base = base.replace(/\/+$/, '')
  if (/:11434$/i.test(base)) return `${base}/v1`
  return base
}

function isValidEnvKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key || '')
}

function modelApiKeyEnvRef(raw) {
  const value = String(raw || '').trim()
  if (value.startsWith('${') && value.endsWith('}')) {
    const key = value.slice(2, -1)
    if (isValidEnvKey(key)) return key
    throw new Error(`无效的环境变量引用: ${value}`)
  }
  if (value.startsWith('$')) {
    const key = value.slice(1)
    if (isValidEnvKey(key)) return key
  }
  return null
}

function parseDotenvLine(line) {
  let text = String(line || '').trim().replace(/^\uFEFF/, '')
  if (!text || text.startsWith('#')) return null
  if (text.startsWith('export ')) text = text.slice(7).trim()
  const eq = text.indexOf('=')
  if (eq < 0) return null
  const key = text.slice(0, eq).trim()
  if (!isValidEnvKey(key)) return null
  let value = text.slice(eq + 1).trim()
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      value = value.slice(1, -1)
    }
  }
  return [key, value]
}

function modelEnvValues() {
  const values = {}
  const cfg = readOpenclawConfigOptional()
  if (cfg.env && typeof cfg.env === 'object' && !Array.isArray(cfg.env)) {
    for (const [key, value] of Object.entries(cfg.env)) {
      if (!isValidEnvKey(key)) continue
      if (typeof value === 'string') values[key] = value
      else if (typeof value === 'number' || typeof value === 'boolean') values[key] = String(value)
    }
  }
  const envPath = path.join(OPENCLAW_DIR, '.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const parsed = parseDotenvLine(line)
      if (parsed && values[parsed[0]] === undefined) values[parsed[0]] = parsed[1]
    }
  }
  return values
}

const MINIMAX_TEST_DEFAULTS = normalizeProviderProfileConfig({
  providerId: DEFAULT_MODEL_PROVIDER_PROFILE_ID,
})

function cleanMiniMaxValue(value) {
  return String(value || '').trim()
}

function cleanMiniMaxBaseUrl(value) {
  return cleanMiniMaxValue(value).replace(/\/+$/, '')
}

function maskMiniMaxApiKey(value) {
  const key = cleanMiniMaxValue(value)
  if (!key) return ''
  if (key.length <= 10) return `${key.slice(0, 2)}****`
  return `${key.slice(0, 6)}****${key.slice(-4)}`
}

function normalizeMiniMaxTestPayload(input = {}) {
  const rawBaseUrl = cleanMiniMaxBaseUrl(input.baseUrl || MINIMAX_TEST_DEFAULTS.baseUrl)
  const allowedBaseUrls = [
    MINIMAX_TEST_DEFAULTS.baseUrl,
    MINIMAX_TEST_DEFAULTS.cnBaseUrl,
    MINIMAX_TEST_DEFAULTS.intlBaseUrl,
  ].filter(Boolean)
  const baseUrl = allowedBaseUrls.includes(rawBaseUrl)
    ? rawBaseUrl
    : MINIMAX_TEST_DEFAULTS.baseUrl
  const out = normalizeProviderProfileConfig({
    providerId: input.providerId || providerProfileForBaseUrl(baseUrl).id,
    model: input.model || MINIMAX_TEST_DEFAULTS.model,
    baseUrl,
  })
  const apiKey = cleanMiniMaxValue(input.apiKey)
  if (apiKey && !apiKey.includes('***')) out.apiKey = apiKey
  return out
}

function assertPathInside(parent, child) {
  const root = path.resolve(parent)
  const target = path.resolve(child)
  const rootKey = root.toLowerCase()
  const targetKey = target.toLowerCase()
  if (targetKey !== rootKey && !targetKey.startsWith(rootKey + path.sep.toLowerCase())) {
    throw new Error(`Refusing to write outside resources data: ${target}`)
  }
  return target
}

function miniMaxResourcesDir() {
  const explicit = cleanMiniMaxValue(process.env.SUPERCLAW_RESOURCES_DIR)
  const candidates = [
    explicit,
    path.join(appRootDir(), 'resources'),
    path.join(appRootDir(), 'src-tauri', 'resources'),
  ].filter(Boolean)
  const home = homedir()
  const blocked = [
    os.tmpdir(),
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    path.join(home, 'AppData'),
  ].map(p => path.resolve(p).toLowerCase())
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    const key = resolved.toLowerCase()
    if (blocked.some(dir => key === dir || key.startsWith(dir + path.sep.toLowerCase()))) continue
    if (fs.existsSync(resolved) || candidate === candidates[candidates.length - 1]) return resolved
  }
  throw new Error('No safe resources directory found for MiniMax test config')
}

function miniMaxDataDir() {
  const dir = path.join(miniMaxResourcesDir(), 'data')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function miniMaxDataPath(...segments) {
  const dataDir = miniMaxDataDir()
  return assertPathInside(dataDir, path.join(dataDir, ...segments))
}

function miniMaxProviderForBaseUrl(baseUrl) {
  return hermesProviderIdForProfile({ baseUrl })
}

function miniMaxOpenAiBaseUrlForBaseUrl(baseUrl) {
  return normalizeProviderProfileConfig({ baseUrl }).baseUrl
}

function miniMaxModelRef() {
  return modelRefForProfile(MINIMAX_TEST_DEFAULTS)
}

function isInvalidOpenClawModelId(modelId) {
  const raw = String(modelId || '').trim()
  const lower = raw.toLowerCase()
  return !raw
    || raw === '默认模型'
    || raw === '默认'
    || lower === 'default model'
    || lower === 'undefined'
    || lower === 'null'
}

function normalizeOpenClawModelId(modelId, fallback = MINIMAX_TEST_DEFAULTS.model) {
  return isInvalidOpenClawModelId(modelId) ? fallback : String(modelId).trim()
}

function normalizeOpenClawModelRef(modelRef, fallback = miniMaxModelRef()) {
  return isInvalidOpenClawModelId(modelRef) ? fallback : String(modelRef).trim()
}

function normalizeOpenClawMiniMaxProviderAliases(config) {
  const providers = config?.models?.providers
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return false
  const canonicalProviderId = openClawProviderIdForProfile(MINIMAX_TEST_DEFAULTS)
  const aliases = ['minimax-cn', 'minimax_cn'].filter(id => id !== canonicalProviderId)
  let changed = false
  const canonical = providers[canonicalProviderId] && typeof providers[canonicalProviderId] === 'object'
    ? providers[canonicalProviderId]
    : {}
  for (const alias of aliases) {
    const source = providers[alias]
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    providers[canonicalProviderId] = {
      ...source,
      ...canonical,
      apiKey: cleanMiniMaxValue(canonical.apiKey) || cleanMiniMaxValue(source.apiKey),
      baseUrl: cleanMiniMaxBaseUrl(canonical.baseUrl) || cleanMiniMaxBaseUrl(source.baseUrl),
      models: Array.isArray(canonical.models) && canonical.models.length ? canonical.models : source.models,
    }
    delete providers[alias]
    changed = true
  }
  const rewriteRef = (value) => String(value || '').trim().replace(/^minimax-cn\//i, `${canonicalProviderId}/`)
  const defaults = config?.agents?.defaults
  if (defaults?.model && typeof defaults.model === 'object') {
    const nextPrimary = rewriteRef(defaults.model.primary)
    if (nextPrimary && nextPrimary !== defaults.model.primary) {
      defaults.model.primary = nextPrimary
      changed = true
    }
    if (Array.isArray(defaults.model.fallbacks)) {
      const next = defaults.model.fallbacks.map(rewriteRef).filter(Boolean)
      if (JSON.stringify(next) !== JSON.stringify(defaults.model.fallbacks)) {
        defaults.model.fallbacks = next
        changed = true
      }
    }
  }
  if (defaults?.models && typeof defaults.models === 'object' && !Array.isArray(defaults.models)) {
    for (const key of Object.keys(defaults.models)) {
      const nextKey = rewriteRef(key)
      if (nextKey && nextKey !== key) {
        defaults.models[nextKey] = defaults.models[nextKey] || defaults.models[key]
        delete defaults.models[key]
        changed = true
      }
    }
  }
  const agents = Array.isArray(config?.agents?.list) ? config.agents.list : []
  for (const agent of agents) {
    if (!agent?.model || typeof agent.model !== 'object') continue
    const nextPrimary = rewriteRef(agent.model.primary)
    if (nextPrimary && nextPrimary !== agent.model.primary) {
      agent.model.primary = nextPrimary
      changed = true
    }
    if (Array.isArray(agent.model.fallbacks)) {
      const next = agent.model.fallbacks.map(rewriteRef).filter(Boolean)
      if (JSON.stringify(next) !== JSON.stringify(agent.model.fallbacks)) {
        agent.model.fallbacks = next
        changed = true
      }
    }
  }
  return changed
}

function normalizeOpenClawMiniMaxModel(config) {
  normalizeOpenClawMiniMaxProviderAliases(config)
  const providerId = openClawProviderIdForProfile(MINIMAX_TEST_DEFAULTS)
  const provider = config?.models?.providers?.[providerId]
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return false
  let changed = false
  const modelId = normalizeOpenClawModelId(
    provider.models?.[0]?.id ||
    provider.models?.[0]?.model ||
    provider.model
  )
  if ('model' in provider) {
    delete provider.model
    changed = true
  }
  if ('type' in provider) {
    delete provider.type
    changed = true
  }
  if ('name' in provider && String(provider.name || '').toLowerCase().includes('minimax')) {
    delete provider.name
    changed = true
  }
  if (!Array.isArray(provider.models) || !provider.models.length) {
    provider.models = [miniMaxOpenClawModelDefinition()]
    changed = true
  } else {
    provider.models = provider.models.map(item => ({
      ...item,
      id: normalizeOpenClawModelId(item?.id || item?.model || modelId),
      name: normalizeOpenClawModelId(item?.name || item?.id || item?.model || modelId),
      api: item?.api || provider.api || 'openai-completions',
    }))
  }
  return changed
}

function miniMaxOpenClawModelDefinition() {
  return modelDefinitionForProfile(MINIMAX_TEST_DEFAULTS)
}

function ensureMiniMaxOpenClawConfig(config, normalized, apiKey) {
  const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  if (!cfg.models || typeof cfg.models !== 'object' || Array.isArray(cfg.models)) cfg.models = {}
  delete cfg.models.mode
  if (!cfg.models.providers || typeof cfg.models.providers !== 'object' || Array.isArray(cfg.models.providers)) {
    cfg.models.providers = {}
  }
  const providerId = openClawProviderIdForProfile(normalized)
  const previousMiniMaxProvider = cfg.models.providers[providerId] && typeof cfg.models.providers[providerId] === 'object' && !Array.isArray(cfg.models.providers[providerId])
    ? cfg.models.providers[providerId]
    : {}
  cfg.models.providers[providerId] = {
    ...buildOpenClawProviderConfig(normalized, apiKey),
    models: Array.isArray(previousMiniMaxProvider.models) && previousMiniMaxProvider.models.length
      ? previousMiniMaxProvider.models.map(item => ({
        ...item,
        id: normalizeOpenClawModelId(item?.id || item?.model),
        name: normalizeOpenClawModelId(item?.name || item?.id || item?.model),
        api: item?.api || normalized.api || 'openai-completions',
      }))
      : [modelDefinitionForProfile(normalized)],
  }
  normalizeOpenClawMiniMaxModel(cfg)
  if (apiKey) cfg.models.providers[providerId].apiKey = apiKey
  delete cfg.models.default
  delete cfg.models.defaultProvider
  delete cfg.models.defaultModel

  if (!cfg.agents || typeof cfg.agents !== 'object' || Array.isArray(cfg.agents)) cfg.agents = {}
  if (!cfg.agents.defaults || typeof cfg.agents.defaults !== 'object' || Array.isArray(cfg.agents.defaults)) {
    cfg.agents.defaults = {}
  }
  if (!cfg.agents.defaults.model || typeof cfg.agents.defaults.model !== 'object' || Array.isArray(cfg.agents.defaults.model)) {
    cfg.agents.defaults.model = {}
  }
  cfg.agents.defaults.model.primary = normalizeOpenClawModelRef(miniMaxModelRef())
  if (!Array.isArray(cfg.agents.defaults.model.fallbacks)) cfg.agents.defaults.model.fallbacks = []
  cfg.agents.defaults.model.fallbacks = cfg.agents.defaults.model.fallbacks.filter(item => item !== miniMaxModelRef())
  if (!cfg.agents.defaults.models || typeof cfg.agents.defaults.models !== 'object' || Array.isArray(cfg.agents.defaults.models)) {
    cfg.agents.defaults.models = {}
  }
  cfg.agents.defaults.models[miniMaxModelRef()] = cfg.agents.defaults.models[miniMaxModelRef()] || {}
  return cfg
}

function readMiniMaxEnvFile(envPath) {
  const env = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const parsed = parseDotenvLine(line)
    if (parsed) env[parsed[0]] = parsed[1]
  }
  return env
}

function readMiniMaxPlainConfig() {
  try { applyOpenclawPathConfig(readPanelConfig()) } catch {}
  const cfg = readOpenclawConfigOptional()
  const providerId = openClawProviderIdForProfile(MINIMAX_TEST_DEFAULTS)
  const provider = cfg?.models?.providers?.[providerId] || {}
  const hermesEnvPath = miniMaxDataPath('hermes', '.env')
  const hermesEnv = readMiniMaxEnvFile(hermesEnvPath)
  const relayPath = miniMaxDataPath('claude-panel', 'relay-config.json')
  const relay = readJsonFileRelaxed(relayPath) || {}
  const apiKey = cleanMiniMaxValue(provider.apiKey)
    || cleanMiniMaxValue(hermesEnv.MINIMAX_API_KEY)
    || cleanMiniMaxValue(hermesEnv.MINIMAX_CN_API_KEY)
    || cleanMiniMaxValue(hermesEnv.OPENAI_API_KEY)
    || cleanMiniMaxValue(relay.apiKey)
  const baseUrl = miniMaxOpenAiBaseUrlForBaseUrl(
    cleanMiniMaxBaseUrl(hermesEnv.MINIMAX_BASE_URL)
      || cleanMiniMaxBaseUrl(hermesEnv.MINIMAX_CN_BASE_URL)
      || cleanMiniMaxBaseUrl(hermesEnv.OPENAI_BASE_URL)
      || cleanMiniMaxBaseUrl(relay.baseUrl)
      || cleanMiniMaxBaseUrl(provider.baseUrl)
      || MINIMAX_TEST_DEFAULTS.baseUrl
  )
  return {
    cfg,
    provider,
    hermesEnv,
    relay,
    apiKey,
    baseUrl,
    paths: {
      openclaw: CONFIG_PATH,
      openclawAgent: miniMaxDataPath('.openclaw', 'agents', 'main', 'agent', 'models.json'),
      hermes: hermesEnvPath,
      claudePanel: relayPath,
    },
  }
}

function miniMaxStatusFromPlain(plain, overrides = {}) {
  const baseUrl = cleanMiniMaxBaseUrl(overrides.baseUrl || plain.baseUrl || MINIMAX_TEST_DEFAULTS.baseUrl)
  const apiKey = cleanMiniMaxValue(overrides.apiKey || plain.apiKey)
  const provider = plain.provider || {}
  const relay = plain.relay || {}
  const env = plain.hermesEnv || {}
  return {
    providerId: normalized.providerId,
    providerName: normalized.providerName,
    model: normalized.model,
    baseUrl,
    cnBaseUrl: MINIMAX_TEST_DEFAULTS.cnBaseUrl,
    hasApiKey: !!apiKey,
    maskedKey: apiKey ? maskMiniMaxApiKey(apiKey) : '',
    synced: {
      openclaw: miniMaxOpenAiBaseUrlForBaseUrl(provider.baseUrl) === baseUrl
        && provider.api === 'openai-completions',
      openclawAgent: (plain.cfg?.agents?.defaults?.model?.primary || '') === miniMaxModelRef()
        || fs.existsSync(plain.paths?.openclawAgent || ''),
      hermes: env.HERMES_PROVIDER === miniMaxProviderForBaseUrl(baseUrl)
        || !!env.MINIMAX_API_KEY
        || !!env.MINIMAX_CN_API_KEY
        || env.OPENAI_MODEL === normalized.model,
      claudePanel: String(relay.managedBy || '').startsWith('superclaw-provider-profile:')
        || relay.managedBy === 'superclaw-minimax-test'
        || relay.defaultProvider === normalized.providerId
        || String(relay.name || '').toLowerCase().includes('minimax'),
    },
  }
}

function writeMiniMaxAgentModels(normalized, apiKey) {
  const target = miniMaxDataPath('.openclaw', 'agents', 'main', 'agent', 'models.json')
  const current = readJsonFileRelaxed(target) || {}
  delete current.mode
  delete current.models
  if (!current.providers || typeof current.providers !== 'object' || Array.isArray(current.providers)) {
    current.providers = {}
  }
  const providerId = openClawProviderIdForProfile(normalized)
  current.providers[providerId] = buildOpenClawProviderConfig(
    normalized,
    apiKey || current.providers[providerId]?.apiKey || ''
  )
  if (!apiKey && !current.providers[providerId].apiKey) delete current.providers[providerId].apiKey
  delete current.defaultProvider
  delete current.defaultModel
  delete current.primary
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  return target
}

function writeMiniMaxHermesEnv(normalized, apiKey) {
  const target = miniMaxDataPath('hermes', '.env')
  const providerId = miniMaxProviderForBaseUrl(normalized.baseUrl)
  const managed = [
    ...managedEnvKeysForProviderProfile(normalized),
    'HERMES_PROVIDER',
    'GATEWAY_ALLOW_ALL_USERS',
    'API_SERVER_KEY',
  ]
  const profileEnv = envForProviderProfile(normalized, apiKey)
  const pairs = [
    ['HERMES_PROVIDER', providerId],
    ...Object.entries(profileEnv),
    ['GATEWAY_ALLOW_ALL_USERS', 'true'],
    ['API_SERVER_KEY', 'clawpanel-local'],
  ]
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, _mergeEnvFile(current, managed, pairs), 'utf8')
  return target
}

function writeMiniMaxHermesConfig(normalized) {
  const target = miniMaxDataPath('hermes', 'config.yaml')
  const providerId = miniMaxProviderForBaseUrl(normalized.baseUrl)
  const content = `# Hermes Agent configuration (managed by ClawPanel)
model:
  default: ${normalized.model}
  provider: ${providerId}
  api_mode: chat_completions
  base_url: ${normalized.baseUrl}
platform_toolsets:
  api_server:
    - hermes-api-server
terminal:
  backend: local
platforms:
  api_server:
    enabled: true
`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
  return target
}

function writeMiniMaxClaudeRelay(config = {}) {
  const normalized = normalizeMiniMaxTestPayload(config)
  const apiKey = cleanMiniMaxValue(config.apiKey)
  const profile = getModelProviderProfile(normalized.providerId)
  const target = miniMaxDataPath('claude-panel', 'relay-config.json')
  const current = readJsonFileRelaxed(target) || {}
  const next = {
    ...current,
    enabled: true,
    interfaceType: cleanMiniMaxValue(config.interfaceType) || 'relay',
    name: cleanMiniMaxValue(config.name) || normalized.providerName,
    provider: cleanMiniMaxValue(config.provider) || profile.agent.claudeProvider,
    defaultProvider: cleanMiniMaxValue(config.defaultProvider) || normalized.providerId,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    branchModels: Array.isArray(config.branchModels) && config.branchModels.length
      ? config.branchModels.map(item => cleanMiniMaxValue(item)).filter(Boolean)
      : [normalized.model],
    managedBy: cleanMiniMaxValue(config.managedBy) || profile.agent.managedBy,
    updatedAt: new Date().toISOString(),
  }
  if (apiKey) next.apiKey = apiKey
  else if (current.apiKey) next.apiKey = current.apiKey
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { configured: true, skipped: false, provider: next.provider, model: next.model, path: target }
}

function saveMiniMaxTestConfigLocal(input = {}) {
  const normalized = normalizeMiniMaxTestPayload(input)
  assertDirectModelConfigWritable('minimax-test-config')
  const plain = readMiniMaxPlainConfig()
  const apiKey = normalized.apiKey || plain.apiKey
  const nextConfig = ensureMiniMaxOpenClawConfig(plain.cfg, normalized, apiKey)
  writeOpenclawConfigFile(nextConfig, { preserveExisting: false })
  const agentPath = writeMiniMaxAgentModels(normalized, apiKey)
  const hermesPath = writeMiniMaxHermesEnv(normalized, apiKey)
  const hermesConfigPath = writeMiniMaxHermesConfig(normalized)
  const relayResult = writeMiniMaxClaudeRelay({
    ...normalized,
    apiKey,
    branchModels: [normalized.model],
  })
  return {
    ...miniMaxStatusFromPlain(readMiniMaxPlainConfig(), { baseUrl: normalized.baseUrl, apiKey }),
    paths: {
      openclaw: CONFIG_PATH,
      openclawAgent: agentPath,
      hermes: hermesPath,
      hermesConfig: hermesConfigPath,
      claudePanel: relayResult.path,
    },
  }
}

function readMiniMaxTestConfigLocal() {
  return miniMaxStatusFromPlain(readMiniMaxPlainConfig())
}

function resolveModelApiKey(apiKey) {
  const key = modelApiKeyEnvRef(apiKey)
  if (!key) return apiKey || ''
  const values = modelEnvValues()
  if (values[key]) return values[key]
  if (process.env[key]) return process.env[key]
  throw new Error(`API Key 引用了环境变量 ${key}，但未在 openclaw.json env、~/.openclaw/.env 或当前进程环境中找到`)
}

// 从 SSE 流文本中累积 OpenAI 风格的 delta.content / delta.reasoning_content
// 同时兼容 Anthropic streaming (content_block_delta)
// 格式示例：
//   data: {"choices":[{"delta":{"content":"你好"}}]}
//   data: {"choices":[{"delta":{"content":"，"}}]}
//   data: [DONE]
function _extractSseReply(text) {
  if (!text) return ''
  let content = ''
  let reasoning = ''
  let sawDataLine = false
  for (const line of text.split('\n')) {
    let data
    if (line.startsWith('data: ')) data = line.slice(6)
    else if (line.startsWith('data:')) data = line.slice(5)
    else continue
    sawDataLine = true
    data = data.trim()
    if (!data || data === '[DONE]') continue
    try {
      const v = JSON.parse(data)
      // OpenAI / 兼容后端：choices[0].delta.content
      const delta = v?.choices?.[0]?.delta
      if (delta) {
        if (typeof delta.content === 'string') content += delta.content
        if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content
      }
      // Anthropic streaming: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
      if (v?.type === 'content_block_delta' && typeof v?.delta?.text === 'string') {
        content += v.delta.text
      }
    } catch {}
  }
  if (!sawDataLine) return ''
  if (content) return content
  if (reasoning) return '上游只返回了推理内容，已隐藏内部推理；请重新发起请求或检查模型配置。'
  return ''
}

// === 后端内存缓存（ARM 设备性能优化）===
// 防止短时间内重复 spawn CLI 进程，显著降低 CPU 占用
const _serverCache = new Map()
function serverCached(key, ttlMs, fn) {
  const entry = _serverCache.get(key)
  if (entry && Date.now() - entry.ts < ttlMs) return entry.val
  // in-flight 去重：同一 key 正在执行中，复用 Promise
  if (entry && entry.pending) return entry.pending
  const result = fn()
  if (result && typeof result.then === 'function') {
    // async
    const pending = result.then(val => {
      _serverCache.set(key, { val, ts: Date.now() })
      return val
    }).catch(err => {
      _serverCache.delete(key)
      throw err
    })
    _serverCache.set(key, { ...(entry || {}), pending })
    return pending
  }
  // sync
  _serverCache.set(key, { val: result, ts: Date.now() })
  return result
}

function isShortVideoShareUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    return [
      'douyin.com',
      'iesdouyin.com',
      'tiktok.com',
      'kuaishou.com',
      'xiaohongshu.com',
      'xhslink.com',
      'bilibili.com',
      'youtube.com',
      'youtu.be',
    ].some(domain => host === domain || host.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

function shortVideoPlatformLabel(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    if (host.includes('douyin') || host.includes('iesdouyin')) return '抖音'
    if (host.includes('kuaishou')) return '快手'
    if (host.includes('xiaohongshu') || host.includes('xhslink')) return '小红书'
    if (host.includes('tiktok')) return 'TikTok'
    if (host.includes('bilibili')) return 'B 站'
    if (host.includes('youtube') || host === 'youtu.be') return 'YouTube'
  } catch {}
  return '短视频平台'
}

function htmlEntityDecode(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
}

function compactText(text, limit = 1200) {
  const cleaned = htmlEntityDecode(text)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}...` : cleaned
}

function extractMetaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta\\b[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\b[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return compactText(m[1], 2000)
  }
  return ''
}

function extractQuotedJsonField(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`["']${escaped}["']\\s*:\\s*["']((?:\\\\.|[^"'\\\\])*)["']`, 'i')
  const m = html.match(re)
  return m?.[1] ? compactText(m[1], 2000) : ''
}

function extractReadablePageMetadata(html) {
  const title = compactText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', 500)
  const fields = {
    title: extractMetaContent(html, 'og:title') || extractMetaContent(html, 'twitter:title') || title,
    description:
      extractMetaContent(html, 'og:description') ||
      extractMetaContent(html, 'description') ||
      extractMetaContent(html, 'twitter:description') ||
      extractQuotedJsonField(html, 'desc') ||
      extractQuotedJsonField(html, 'description'),
    keywords: extractMetaContent(html, 'keywords'),
    image: extractMetaContent(html, 'og:image') || extractMetaContent(html, 'twitter:image'),
  }
  const textSample = compactText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
    1200
  )
  return { ...fields, textSample }
}

function requestTextWithRedirects(rawUrl, { timeout = 10000, maxBytes = 120000, redirects = 4 } = {}) {
  return new Promise((resolve, reject) => {
    const visit = (nextUrl, left) => {
      let parsed
      try {
        parsed = new URL(nextUrl)
      } catch {
        reject(new Error(`无效 URL: ${nextUrl}`))
        return
      }
      const mod = parsed.protocol === 'http:' ? http : https
      const req = mod.get(nextUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
          'Accept': 'text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
          'Referer': `${parsed.protocol}//${parsed.hostname}/`,
        },
        timeout,
      }, (res) => {
        const status = res.statusCode || 0
        const location = res.headers.location
        if (location && status >= 300 && status < 400 && left > 0) {
          res.resume()
          const redirected = new URL(location, nextUrl).toString()
          visit(redirected, left - 1)
          return
        }
        let data = ''
        res.setEncoding('utf8')
        res.on('data', c => {
          data += c
          if (data.length > maxBytes) {
            req.destroy()
            resolve({ body: data.slice(0, maxBytes), finalUrl: nextUrl, status, truncated: true })
          }
        })
        res.on('end', () => resolve({ body: data, finalUrl: nextUrl, status, truncated: false }))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('抓取超时')) })
    }
    visit(rawUrl, redirects)
  })
}

async function fetchReadableUrlContent(rawUrl) {
  const isVideo = isShortVideoShareUrl(rawUrl)
  let readerError = ''

  try {
    const jinaUrl = 'https://r.jina.ai/' + rawUrl
    const { body } = await requestTextWithRedirects(jinaUrl, { timeout: 15000, maxBytes: 100000, redirects: 2 })
    const content = compactText(body, 100000)
    if (content && !/抓取失败|抓取超时|读取失败|无法读取|无法抓取|timeout|timed out|fetch failed|network error|econnreset|socket hang up|und_err|connection reset|连接被断开/i.test(content)) {
      return content
    }
    readerError = content || 'Reader 返回空内容'
  } catch (err) {
    readerError = err?.message || String(err)
  }

  if (!isVideo) {
    return `抓取失败: ${readerError}`
  }

  try {
    const direct = await requestTextWithRedirects(rawUrl, { timeout: 12000, maxBytes: 150000, redirects: 6 })
    const meta = extractReadablePageMetadata(direct.body || '')
    const hasUsefulMeta = [meta.title, meta.description, meta.keywords, meta.textSample].some(v => String(v || '').trim())
    if (!hasUsefulMeta) {
      return `抓取失败: ${readerError || '未读取到页面内容'}`
    }
    const lines = [
      '[短视频页面可读取信息]',
      `平台: ${shortVideoPlatformLabel(rawUrl)}`,
      `原始链接: ${rawUrl}`,
      `最终链接: ${direct.finalUrl || rawUrl}`,
      '读取方式: 页面元信息兜底',
    ]
    if (meta.title) lines.push(`标题: ${meta.title}`)
    if (meta.description) lines.push(`描述: ${meta.description}`)
    if (meta.keywords) lines.push(`关键词: ${meta.keywords}`)
    if (meta.image) lines.push(`封面图: ${meta.image}`)
    if (meta.textSample) lines.push('', '[页面文本摘录]', meta.textSample, '[/页面文本摘录]')
    lines.push(
      '',
      '[读取限制]',
      '当前只读取到了短视频分享页的公开标题、描述、封面或页面文本片段；如果缺少口播、字幕和完整画面，请先基于已读信息做文字拆解。若具备用户授权的浏览器/页面读取工具，可继续从用户已打开或授权打开的页面读取公开可见信息，但不要在聊天中展示或播放平台页面。',
      '[/读取限制]',
      '[/短视频页面可读取信息]'
    )
    return lines.join('\n')
  } catch (err) {
    return `抓取失败: ${readerError || err?.message || String(err)}`
  }
}

// === API Handlers ===

function paymentApiBaseUrl() {
  return String(process.env.PAYMENT_API_BASE_URL || process.env.VITE_PAYMENT_API_BASE_URL || '').trim().replace(/\/+$/, '')
}

async function forwardPaymentRequest(action, payload = {}) {
  const baseUrl = paymentApiBaseUrl()
  if (!baseUrl) {
    const err = new Error('PAYMENT_API_NOT_CONFIGURED')
    err.statusCode = 503
    err.code = 'PAYMENT_API_NOT_CONFIGURED'
    throw err
  }
  const url = baseUrl + '/payment/' + encodeURIComponent(action || '')
  const resp = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'SuperClaw-TestBuild' },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(30000),
  })
  const text = await resp.text()
  let json
  try { json = JSON.parse(text || '{}') } catch { json = { raw: text } }
  if (!resp.ok) {
    const err = new Error(json?.error || json?.message || text || ('Payment API HTTP ' + resp.status))
    err.statusCode = resp.status
    err.payload = json
    throw err
  }
  return json
}

function redactAgentToolText(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, 'Bearer ***')
    .replace(/(MINIMAX_API_KEY|OPENAI_API_KEY|IMAGE_API_KEY)\s*=\s*["']?[^"'\s]+/gi, '$1=***')
}

function writeAgentToolLog({ agent = 'assistant', title = 'tool', command = '', cwd = '', stdout = '', stderr = '', exitCode = 0 } = {}) {
  const now = new Date()
  const jobId = `${now.toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`
  const dir = path.join(appRootDir(), 'logs', 'agent-tools')
  fs.mkdirSync(dir, { recursive: true })
  const logPath = path.join(dir, `${jobId}.log`)
  fs.writeFileSync(logPath, [
    `jobId=${jobId}`,
    `agent=${agent}`,
    `title=${title}`,
    `cwd=${cwd || ''}`,
    `startedAt=${now.toISOString()}`,
    `finishedAt=${new Date().toISOString()}`,
    `exitCode=${exitCode}`,
    '',
    '[command]',
    redactAgentToolText(command),
    '',
    '[stdout]',
    redactAgentToolText(stdout),
    '',
    '[stderr]',
    redactAgentToolText(stderr),
  ].join('\n'), 'utf8')
  return { jobId, logPath }
}

const handlers = {
  health() {
    return { ok: true, mode: 'dev-api', noUserSystem: true, provider: 'minimax' }
  },

  get_effective_model_config({ agentName } = {}) {
    const name = cleanMiniMaxValue(agentName || 'openclaw')
    if (name === 'openclaw') return openclawMiniMaxGatewayConfig().effective
    return getEffectiveModelConfig(name, {})
  },

  async payment_request({ action, payload } = {}) {
    return forwardPaymentRequest(action, payload || {})
  },

  // 配置读写
  read_openclaw_config() {
    const cfg = readOpenclawConfigRequired()
    let changed = ensureOpenClawWorkspaceConfig(cfg)
    changed = ensureOpenClawStatusPluginDefaults(cfg) || changed
    changed = normalizeOpenClawMiniMaxModel(cfg) || changed
    ensureOpenClawWorkspaceDir(resolveDefaultWorkspace(cfg))
    ensureOpenClawMemoryFiles()
    if (changed) writeOpenclawConfigFile(cfg)
    return cfg
  },

  calibrate_openclaw_config({ mode } = {}) {
    return calibrateOpenclawConfig(mode)
  },

  write_openclaw_config({ config }) {
    writeOpenclawConfigFile(config)
    return true
  },

  read_minimax_test_config() {
    return readMiniMaxTestConfigLocal()
  },

  save_minimax_test_config({ config } = {}) {
    return saveMiniMaxTestConfigLocal(config || {})
  },

  read_mcp_config() {
    if (!fs.existsSync(MCP_CONFIG_PATH)) return {}
    return JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'))
  },

  write_mcp_config({ config }) {
    fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2))
    return true
  },

  claude_code_status() {
    return claudeCodeStatus()
  },

  async claude_code_start() {
    return startClaudePanel()
  },

  async claude_code_native_start({ cwd } = {}) {
    return startNativeClaudeTerminal(cwd)
  },

  claude_code_stop() {
    return {
      stopped: true,
      mode: 'cli',
      message: 'No Claude Code panel process is managed by SuperClaw.',
    }
  },

  configure_claude_code_relay({ config } = {}) {
    assertDirectModelConfigWritable('claude-code')
    const payload = config || {}
    const baseUrl = cleanMiniMaxBaseUrl(payload.baseUrl)
    const apiKey = cleanMiniMaxValue(payload.apiKey)
    const model = cleanMiniMaxValue(payload.model || MINIMAX_TEST_DEFAULTS.model)
    if (!baseUrl || !apiKey || !model) {
      return {
        configured: false,
        skipped: true,
        reason: 'missing-base-url-api-key-or-model',
        path: miniMaxDataPath('claude-panel', 'relay-config.json'),
      }
    }
    return writeMiniMaxClaudeRelay({
      ...payload,
      baseUrl,
      apiKey,
      model,
      branchModels: Array.isArray(payload.branchModels) ? payload.branchModels : (Array.isArray(payload.models) ? payload.models : [model]),
      managedBy: cleanMiniMaxValue(payload.managedBy)
        || getModelProviderProfile(normalizeProviderProfileConfig({ baseUrl, model }).providerId).agent.managedBy,
    })
  },

  claude_code_native_stop() {
    return stopNativeClaudeTerminal()
  },

  // 服务管理（10s 服务端缓存 + in-flight 去重，ARM 设备关键优化）
  get_services_status() {
    return serverCached('svc_status', 10000, async () => {
      const label = 'ai.openclaw.gateway'
      let { running, pid } = isMac ? macCheckService(label) : isLinux ? linuxCheckGateway() : await winCheckGateway()

      // 通用兜底：进程检测说没运行，但端口实际在监听 → Gateway 已在运行
      if (!running) {
        const port = readGatewayPort()
        const portOpen = await new Promise(resolve => {
          const sock = net.createConnection(port, '127.0.0.1', () => { sock.destroy(); resolve(true) })
          sock.on('error', () => resolve(false))
          sock.setTimeout(2000, () => { sock.destroy(); resolve(false) })
        })
        if (portOpen) { running = true }
      }

      const processRunning = !!running
      const health = processRunning
        ? await probeOpenclawGatewayHealth(readGatewayPort(), 1800)
        : { ready: false, httpOk: false, status: 'stopped' }
      running = processRunning && health.ready

      const cliInstalled = !!resolveOpenclawCliPath()
      const owner = readGatewayOwner()
      let ownedByCurrentInstance = processRunning && isCurrentGatewayOwner(owner, pid || null)
      if (ownedByCurrentInstance && gatewayOwnerPidNeedsRefresh(owner, pid || null)) {
        writeGatewayOwner(pid || null)
      }
      // 自动认领：Gateway 在运行但无有效 owner，且端口 + 数据目录匹配
      if (processRunning && !ownedByCurrentInstance && shouldAutoClaimGateway(owner, pid || null)) {
        writeGatewayOwner(pid || null)
        ownedByCurrentInstance = true
      }
      const ownership = !processRunning ? 'stopped' : ownedByCurrentInstance ? 'owned' : 'foreign'

      return [{
        label,
        running,
        process_running: processRunning,
        pid,
        description: 'OpenClaw Gateway',
        cli_installed: cliInstalled,
        ownership,
        owned_by_current_instance: ownedByCurrentInstance,
        health_ready: health.ready,
        health_http_ok: health.httpOk,
        health_status: health.status,
      }]
    })
  },

  async start_service({ label }) {
    // 修复 #159: Docker 双容器模式下禁止本地启动 Gateway
    if (process.env.DISABLE_GATEWAY_SPAWN === '1' || process.env.DISABLE_GATEWAY_SPAWN === 'true') {
      throw new Error('本地 Gateway 启动已禁用（DISABLE_GATEWAY_SPAWN=1），请使用远程 Gateway')
    }
    const status = await getLocalGatewayRuntime(label)
    if (status?.running) {
      if (status.manageable === false) {
        throw new Error(`端口 ${readGatewayPort()} 已被其他进程 (PID ${status.pid}) 占用，无法操作`)
      }
      ensureOwnedGatewayOrThrow(status.pid || null)
      writeGatewayOwner(status.pid || null)
      await waitForGatewayReady(label)
      return true
    }
    if (isMac) {
      macStartService(label)
      await waitForGatewayReady(label)
      return true
    }
    if (isLinux) {
      linuxStartGateway()
      await waitForGatewayReady(label)
      return true
    }
    winStartGateway()
    await waitForGatewayReady(label)
    return true
  },

  async claim_gateway() {
    const label = 'ai.openclaw.gateway'
    const status = await getLocalGatewayRuntime(label)
    if (!status?.running) throw new Error('Gateway 未运行，无需认领')
    writeGatewayOwner(status.pid || null)
    serverCacheInvalidate('svc_status')
    return true
  },

  async stop_service({ label }) {
    const status = await getLocalGatewayRuntime(label)
    if (status?.running) {
      if (status.manageable === false) {
        throw new Error(`端口 ${readGatewayPort()} 已被其他进程 (PID ${status.pid}) 占用，无法操作`)
      }
      ensureOwnedGatewayOrThrow(status.pid || null)
    }
    if (isMac) {
      macStopService(label)
      if (!(await waitForGatewayStopped(label))) throw new Error('Gateway 停止超时')
      return true
    }
    if (isLinux) {
      linuxStopGateway()
      if (!(await waitForGatewayStopped(label))) throw new Error('Gateway 停止超时')
      return true
    }
    await winStopGateway()
    clearGatewayOwner()
    return true
  },

  async restart_service({ label }) {
    const status = await getLocalGatewayRuntime(label)
    if (status?.running) {
      if (status.manageable === false) {
        throw new Error(`端口 ${readGatewayPort()} 已被其他进程 (PID ${status.pid}) 占用，无法操作`)
      }
      ensureOwnedGatewayOrThrow(status.pid || null)
    }
    await handlers.stop_service({ label })
    await handlers.start_service({ label })
    return true
  },

  async reload_gateway() {
    return guardedGatewayRestart('reload_gateway')
  },

  async restart_gateway() {
    return guardedGatewayRestart('restart_gateway')
  },

  // === 消息渠道管理 ===

  list_configured_platforms() {
    if (!fs.existsSync(CONFIG_PATH)) return []
    const cfg = readOpenclawConfigOptional()
    const channels = cfg.channels || {}
    return Object.entries(channels)
      .map(([id, val]) => normalizeMessageChannelEntry(id, val))
      .filter(row => row.configured || (Array.isArray(row.accounts) && row.accounts.length > 0))
  },

  read_platform_config({ platform, accountId }) {
    if (!fs.existsSync(CONFIG_PATH)) return { exists: false }
    const cfg = readOpenclawConfigOptional()
    const storageKey = platformStorageKey(platform)
    const channelRoot = cfg.channels?.[storageKey]
    const saved = resolvePlatformConfigEntry(channelRoot, platform, accountId)
    if (!saved) return { exists: false }
    const form = {}
    if (platform === 'qqbot') {
      const t = saved.token || ''
      const [appIdFromToken, ...rest] = t.split(':')
      const appId = saved.appId || appIdFromToken || ''
      const clientSecret = saved.clientSecret || saved.appSecret || (rest.length ? rest.join(':') : '')
      if (!appId && !clientSecret) return { exists: false }
      if (appId) form.appId = appId
      if (clientSecret) form.clientSecret = clientSecret
    } else if (platform === 'telegram') {
      if (saved.botToken) form.botToken = saved.botToken
      if (saved.chatId) form.chatId = saved.chatId
      if (saved.allowFrom) form.allowedUsers = saved.allowFrom.join(', ')
    } else if (platform === 'discord') {
      if (saved.token) form.token = saved.token
      const gid = saved.guilds && Object.keys(saved.guilds)[0]
      if (gid) form.guildId = gid
    } else if (platform === 'feishu') {
      if (saved.appId) form.appId = saved.appId
      if (saved.appSecret) form.appSecret = saved.appSecret
      if (saved.domain) form.domain = saved.domain
    } else {
      for (const [k, v] of Object.entries(saved)) {
        if (k !== 'enabled' && k !== 'accounts' && typeof v === 'string') form[k] = v
      }
      if (platform === 'signal') {
        if (!form.phoneNumber && saved.account) form.phoneNumber = saved.account
        if (!form.signalCliPath && saved.cliPath) form.signalCliPath = saved.cliPath
      }
    }
    return { exists: true, values: form }
  },

  save_messaging_platform({ platform, form, accountId }) {
    if (!fs.existsSync(CONFIG_PATH)) throw new Error('openclaw.json 不存在')
    const cfg = readOpenclawConfigRequired()
    if (!cfg.channels) cfg.channels = {}
    const storageKey = platformStorageKey(platform)
    const normalizedAccountId = typeof accountId === 'string' ? accountId.trim() : ''
    const setRootChannelEntry = (entry) => {
      const current = cfg.channels?.[storageKey]
      // 合并模式：保留用户通过 CLI 或手动编辑的自定义字段（streaming, retry, dmPolicy 等）
      if (current && typeof current === 'object') {
        cfg.channels[storageKey] = { ...current, ...entry }
      } else {
        cfg.channels[storageKey] = entry
      }
    }
    const setAccountChannelEntry = (entry) => {
      const current = cfg.channels?.[storageKey] && typeof cfg.channels[storageKey] === 'object'
        ? cfg.channels[storageKey]
        : { enabled: true }
      current.enabled = true
      if (!current.accounts || typeof current.accounts !== 'object') current.accounts = {}
      current.accounts[normalizedAccountId] = entry
      cfg.channels[storageKey] = current
    }
    const entry = { enabled: true }
    if (platform === 'qqbot') {
      const clientSecret = form.clientSecret || form.appSecret
      if (!form.appId || !clientSecret) throw new Error('AppID 和 ClientSecret 不能为空')
      const current = cfg.channels.qqbot && typeof cfg.channels.qqbot === 'object' ? cfg.channels.qqbot : { enabled: true }
      current.enabled = true
      delete current.appId
      delete current.clientSecret
      delete current.appSecret
      delete current.token
      if (!current.accounts || typeof current.accounts !== 'object') current.accounts = {}
      const accountKey = normalizedAccountId || QQBOT_DEFAULT_ACCOUNT_ID
      current.accounts[accountKey] = {
        appId: form.appId,
        clientSecret,
        token: `${form.appId}:${clientSecret}`,
        enabled: true,
      }
      cfg.channels.qqbot = current
    } else if (platform === 'telegram') {
      entry.botToken = form.botToken
      entry.chatId = form.chatId
      if (form.allowedUsers) entry.allowFrom = form.allowedUsers.split(',').map(s => s.trim()).filter(Boolean)
    } else if (platform === 'discord') {
      entry.token = form.token
      if (form.guildId) {
        const ck = form.channelId || '*'
        entry.guilds = { [form.guildId]: { users: ['*'], requireMention: true, channels: { [ck]: { allow: true, requireMention: true } } } }
      }
    } else if (platform === 'feishu') {
      entry.appId = form.appId
      entry.appSecret = form.appSecret
      entry.connectionMode = 'websocket'
      if (form.domain) entry.domain = form.domain
      if (normalizedAccountId) {
        setAccountChannelEntry(entry)
      } else {
        setRootChannelEntry(entry)
      }
    } else if (platform === 'dingtalk' || platform === 'dingtalk-connector') {
      Object.assign(entry, form)
      if (normalizedAccountId) {
        setAccountChannelEntry(entry)
      } else {
        setRootChannelEntry(entry)
      }
    } else {
      Object.assign(entry, form)
      if (platform === 'signal') {
        entry.account = form.phoneNumber || form.account || ''
        entry.cliPath = form.signalCliPath || form.cliPath || ''
      }
      setRootChannelEntry(entry)
    }

    if (platform !== 'qqbot' && platform !== 'feishu' && platform !== 'dingtalk' && platform !== 'dingtalk-connector') {
      // 合并模式：保留用户通过 CLI 或手动编辑的自定义字段
      const existing = cfg.channels[storageKey]
      if (DEFAULT_MESSAGE_CHANNELS.includes(platformListId(platform))) {
        entry.configured = channelConfigHasRequiredFields(platform, entry)
        entry.enabled = entry.configured === true
      }
      cfg.channels[storageKey] = (existing && typeof existing === 'object')
        ? { ...existing, ...entry }
        : entry
      // Discord: 仅在首次创建时设置默认值，不覆盖用户已有的设置
      if (platform === 'discord') {
        const d = cfg.channels[storageKey]
        if (!d.groupPolicy) d.groupPolicy = 'allowlist'
        if (!d.dm) d.dm = { enabled: false }
        if (!d.retry) d.retry = { attempts: 3, minDelayMs: 500, maxDelayMs: 30000, jitter: 0.1 }
      }
    }

    writeOpenclawConfigFile(cfg)
    triggerGatewayReloadNonBlocking('save_messaging_platform')
    return { ok: true }
  },

  remove_messaging_platform({ platform, accountId }) {
    if (!fs.existsSync(CONFIG_PATH)) throw new Error('openclaw.json 不存在')
    const cfg = readOpenclawConfigRequired()
    const storageKey = platformStorageKey(platform)
    const bindingChannel = platformBindingChannel(platform)
    const normalizedAccountId = typeof accountId === 'string' ? accountId.trim() : ''

    if (normalizedAccountId) {
      if (cfg.channels?.[storageKey]?.accounts && typeof cfg.channels[storageKey].accounts === 'object') {
        delete cfg.channels[storageKey].accounts[normalizedAccountId]
      }
    } else if (cfg.channels) {
      delete cfg.channels[storageKey]
    }

    if (Array.isArray(cfg.bindings)) {
      cfg.bindings = cfg.bindings.filter(b => {
        if (b.match?.channel !== bindingChannel) return true
        if (normalizedAccountId) return (b.match?.accountId || '') !== normalizedAccountId
        return false
      })
    }

    writeOpenclawConfigFile(cfg)
    triggerGatewayReloadNonBlocking('remove_messaging_platform')
    return { ok: true }
  },

  toggle_messaging_platform({ platform, enabled }) {
    if (!fs.existsSync(CONFIG_PATH)) throw new Error('openclaw.json 不存在')
    const cfg = readOpenclawConfigRequired()
    const storageKey = platformStorageKey(platform)
    if (!cfg.channels?.[storageKey]) throw new Error(`平台 ${platform} 未配置`)
    cfg.channels[storageKey].enabled = enabled
    writeOpenclawConfigFile(cfg)
    triggerGatewayReloadNonBlocking('toggle_messaging_platform')
    return { ok: true }
  },

  async verify_bot_token({ platform, form }) {
    const platformId = platformListId(platform)
    const required = CHANNEL_REQUIRED_FIELDS[platformId] || []
    const missing = required.filter(key => !String(form?.[key] || '').trim())
    if (missing.length) {
      return { valid: false, code: 'CONFIG_MISSING', errors: ['请先配置凭证'] }
    }
    if (platform === 'feishu') {
      const domain = (form.domain || '').trim()
      const base = domain === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn'
      try {
        const resp = await fetch(`${base}/open-apis/auth/v3/tenant_access_token/internal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: form.appId, app_secret: form.appSecret }),
          signal: AbortSignal.timeout(15000),
        })
        const body = await resp.json()
        if (body.code === 0) return { valid: true, errors: [], details: [`App ID: ${form.appId}`] }
        return { valid: false, errors: [body.msg || '凭证无效'] }
      } catch (e) {
        return { valid: false, errors: [`飞书 API 连接失败: ${e.message}`] }
      }
    }
    if (platform === 'qqbot') {
      try {
        const clientSecret = form.clientSecret || form.appSecret
        const resp = await fetch('https://bots.qq.com/app/getAppAccessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId: form.appId, clientSecret }),
          signal: AbortSignal.timeout(15000),
        })
        const body = await resp.json()
        if (body.access_token) return { valid: true, errors: [], details: [`AppID: ${form.appId}`] }
        return { valid: false, errors: [body.message || body.msg || '凭证无效'] }
      } catch (e) {
        return { valid: false, errors: [`QQ Bot API 连接失败: ${e.message}`] }
      }
    }
    if (platform === 'telegram') {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${form.botToken}/getMe`, { signal: AbortSignal.timeout(15000) })
        const body = await resp.json()
        if (body.ok) return { valid: true, errors: [], details: [`Bot: @${body.result?.username}`] }
        return { valid: false, errors: [body.description || 'Token 无效'] }
      } catch (e) {
        return { valid: false, errors: [`Telegram API 连接失败: ${e.message}`] }
      }
    }
    if (['slack', 'signal', 'irc', 'matrix', 'mattermost'].includes(platformId)) {
      return { valid: false, code: 'CONFIG_PRESENT', warnings: ['配置已保存；真实连接测试尚未接入。'] }
    }
    if (platform === 'discord') {
      try {
        const resp = await fetch('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bot ${form.token}` },
          signal: AbortSignal.timeout(15000),
        })
        if (resp.status === 401) return { valid: false, errors: ['Bot Token 无效'] }
        const body = await resp.json()
        if (body.bot) return { valid: true, errors: [], details: [`Bot: @${body.username}`] }
        return { valid: false, errors: ['提供的 Token 不属于 Bot 账号'] }
      } catch (e) {
        return { valid: false, errors: [`Discord API 连接失败: ${e.message}`] }
      }
    }
    return { valid: true, warnings: ['该平台暂不支持在线校验'] }
  },

  install_qqbot_plugin({ version } = {}) {
    const spec = version ? `@tencent-connect/openclaw-qqbot@${version}` : '@tencent-connect/openclaw-qqbot@latest'
    try {
      execOpenclawSync(['plugins', 'install', spec], { timeout: 600000, cwd: homedir(), windowsHide: true }, 'QQBot 插件安装失败')
      return '安装成功'
    } catch (e) {
      throw new Error('QQBot 插件安装失败: ' + (e.message || e))
    }
  },

  list_all_plugins() {
    const cfg = readOpenclawConfigOptional()
    const entries = cfg.plugins?.entries || {}
    const allowArr = cfg.plugins?.allow || []
    const extDir = path.join(OPENCLAW_DIR, 'extensions')
    const plugins = []
    const seen = new Set()

    // Scan extensions directory
    if (fs.existsSync(extDir)) {
      for (const name of fs.readdirSync(extDir)) {
        if (name.startsWith('.')) continue
        const p = path.join(extDir, name)
        if (!fs.statSync(p).isDirectory()) continue
        const hasMarker = fs.existsSync(path.join(p, 'package.json')) || fs.existsSync(path.join(p, 'plugin.ts')) || fs.existsSync(path.join(p, 'index.js'))
        if (!hasMarker) continue
        seen.add(name)
        const entryCfg = entries[name]
        const enabled = !!entryCfg?.enabled || allowArr.includes(name)
        const allowed = enabled
        let version = null, description = null
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'))
          version = pkg.version || null
          description = pkg.description || null
        } catch {}
        plugins.push({ id: name, installed: true, builtin: false, enabled, allowed, version, description, config: entryCfg?.config || null })
      }
    }

    // Include entries from config not found in extensions dir
    for (const [pid, val] of Object.entries(entries)) {
      if (seen.has(pid)) continue
      seen.add(pid)
      const enabled = !!val?.enabled || allowArr.includes(pid)
      plugins.push({ id: pid, installed: false, builtin: false, enabled, allowed: enabled, version: null, description: null, config: val?.config || null })
    }

    plugins.sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0) || a.id.localeCompare(b.id))
    return { plugins }
  },

  toggle_plugin({ pluginId, enabled }) {
    if (!pluginId || !pluginId.trim()) throw new Error('pluginId 不能为空')
    const pid = pluginId.trim()
    const cfg = readOpenclawConfigOptional()
    if (!cfg.plugins) cfg.plugins = {}
    if (!cfg.plugins.entries) cfg.plugins.entries = {}
    cfg.plugins.bundledDiscovery = 'compat'

    if (enabled) {
      if (!cfg.plugins.entries[pid]) cfg.plugins.entries[pid] = {}
      cfg.plugins.entries[pid].enabled = true
    } else {
      if (cfg.plugins.entries[pid]) cfg.plugins.entries[pid].enabled = false
    }
    delete cfg.plugins.allow

    writeOpenclawConfigFile(cfg)
    return { ok: true, enabled, pluginId: pid }
  },

  install_plugin({ packageName }) {
    if (!packageName || !packageName.trim()) throw new Error('包名不能为空')
    const spec = packageName.trim()
    try {
      execOpenclawSync(['plugins', 'install', spec], { timeout: 120000, cwd: homedir(), windowsHide: true }, `插件 ${spec} 安装失败`)
      return { ok: true, output: '安装成功' }
    } catch (e) {
      throw new Error(`插件安装失败: ${e.message || e}`)
    }
  },

  get_channel_plugin_status({ pluginId }) {
    if (!pluginId || !pluginId.trim()) throw new Error('pluginId 不能为空')
    const pid = pluginId.trim()
    const pluginDir = path.join(OPENCLAW_DIR, 'plugins', 'node_modules', pid)
    const installed = fs.existsSync(pluginDir) && fs.existsSync(path.join(pluginDir, 'package.json'))
    // 检测是否为内置插件
    let builtin = false
    try {
      const result = spawnOpenclawSync(['plugins', 'list'], { timeout: 10000, encoding: 'utf8', cwd: homedir(), windowsHide: true })
      const output = (result.stdout || '') + (result.stderr || '')
      if (result.status === 0 && output.includes(pid) && output.includes('built-in')) builtin = true
    } catch {}
    const cfg = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}
    const allowArr = cfg.plugins?.allow || []
    const enabled = !!cfg.plugins?.entries?.[pid]?.enabled || allowArr.includes(pid)
    const allowed = enabled
    const backupDir = path.join(OPENCLAW_DIR, 'plugin-backups', pid)
    const legacyBackup = path.join(OPENCLAW_DIR, 'plugins', 'node_modules', `${pid}.bak`)
    return {
      installed, builtin, path: pluginDir,
      allowed, enabled,
      legacyBackupDetected: fs.existsSync(backupDir) || fs.existsSync(legacyBackup),
    }
  },

  install_channel_plugin({ packageName, pluginId, version }) {
    if (!packageName || !pluginId) throw new Error('packageName 和 pluginId 不能为空')
    const spec = version ? `${packageName.trim()}@${version}` : packageName.trim()
    try {
      execOpenclawSync(['plugins', 'install', spec], { timeout: 120000, cwd: homedir(), windowsHide: true }, `插件 ${pluginId} 安装失败`)
      return '安装成功'
    } catch (e) {
      throw new Error(`插件 ${pluginId} 安装失败: ` + (e.message || e))
    }
  },

  async pairing_list_channel({ channel }) {
    if (!channel || !channel.trim()) throw new Error('channel 不能为空')
    try {
      const output = execOpenclawSync(['pairing', 'list', channel.trim()], { timeout: 15000, encoding: 'utf8', cwd: homedir(), windowsHide: true }, '执行 openclaw pairing list 失败')
      return output.trim() || '暂无待审批请求'
    } catch (e) {
      throw new Error('执行 openclaw pairing list 失败: ' + (e.stderr || e.message || e))
    }
  },

  async pairing_approve_channel({ channel, code, notify }) {
    if (!channel || !channel.trim()) throw new Error('channel 不能为空')
    if (!code || !code.trim()) throw new Error('配对码不能为空')
    const args = ['pairing', 'approve', channel.trim(), code.trim().toUpperCase()]
    if (notify) args.push('--notify')
    try {
      const output = execOpenclawSync(args, { timeout: 15000, encoding: 'utf8', cwd: homedir(), windowsHide: true }, '执行 openclaw pairing approve 失败')
      return output.trim() || '操作完成'
    } catch (e) {
      throw new Error('执行 openclaw pairing approve 失败: ' + (e.stderr || e.message || e))
    }
  },

  // === 实例管理 ===

  instance_list() {
    const data = readInstances()
    return data
  },

  instance_add({ name, type, endpoint, gatewayPort, containerId, nodeId, note }) {
    if (!name) throw new Error('实例名称不能为空')
    if (!endpoint) throw new Error('端点地址不能为空')
    const data = readInstances()
    const id = type === 'docker' ? `docker-${(containerId || Date.now().toString(36)).slice(0, 12)}` : `remote-${Date.now().toString(36)}`
    if (data.instances.find(i => i.endpoint === endpoint)) throw new Error('该端点已存在')
    data.instances.push({
      id, name, type: type || 'remote', endpoint,
      gatewayPort: gatewayPort || 18789,
      containerId: containerId || null,
      nodeId: nodeId || null,
      addedAt: Math.floor(Date.now() / 1000),
      note: note || '',
    })
    saveInstances(data)
    return { id, name }
  },

  instance_remove({ id }) {
    if (id === 'local') throw new Error('本机实例不可删除')
    const data = readInstances()
    data.instances = data.instances.filter(i => i.id !== id)
    if (data.activeId === id) data.activeId = 'local'
    saveInstances(data)
    return true
  },

  instance_set_active({ id }) {
    const data = readInstances()
    if (!data.instances.find(i => i.id === id)) throw new Error('实例不存在')
    data.activeId = id
    saveInstances(data)
    return { activeId: id }
  },

  async instance_health_check({ id }) {
    const data = readInstances()
    const instance = data.instances.find(i => i.id === id)
    if (!instance) throw new Error('实例不存在')
    return instanceHealthCheck(instance)
  },

  async instance_health_all() {
    const data = readInstances()
    const results = await Promise.allSettled(data.instances.map(i => instanceHealthCheck(i)))
    return results.map((r, idx) => r.status === 'fulfilled' ? r.value : { id: data.instances[idx].id, online: false, lastCheck: Date.now() })
  },

  // === Docker 集群管理 ===

  async docker_test_endpoint({ endpoint } = {}) {
    if (!endpoint) throw new Error('请提供端点地址')
    const resp = await dockerRequest('GET', '/info', null, endpoint)
    if (resp.status !== 200) throw new Error('Docker 守护进程未响应')
    const d = resp.data
    return {
      ServerVersion: d.ServerVersion,
      Containers: d.Containers,
      Images: d.Images,
      OS: d.OperatingSystem,
    }
  },

  async docker_info({ nodeId } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const resp = await dockerRequest('GET', '/info', null, node.endpoint)
    if (resp.status !== 200) throw new Error('Docker 守护进程未响应')
    const d = resp.data
    return {
      nodeId: node.id, nodeName: node.name,
      containers: d.Containers, containersRunning: d.ContainersRunning,
      containersPaused: d.ContainersPaused, containersStopped: d.ContainersStopped,
      images: d.Images, serverVersion: d.ServerVersion,
      os: d.OperatingSystem, arch: d.Architecture,
      cpus: d.NCPU, memory: d.MemTotal,
    }
  },

  async docker_list_containers({ nodeId, all = true } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const query = all ? '?all=true' : ''
    const resp = await dockerRequest('GET', `/containers/json${query}`, null, node.endpoint)
    if (resp.status !== 200) throw new Error('获取容器列表失败')
    return (resp.data || []).map(c => ({
      id: c.Id?.slice(0, 12),
      name: (c.Names?.[0] || '').replace(/^\//, ''),
      image: c.Image,
      state: c.State,
      status: c.Status,
      ports: (c.Ports || []).map(p => p.PublicPort ? `${p.PublicPort}→${p.PrivatePort}` : `${p.PrivatePort}`).join(', '),
      created: c.Created,
      nodeId: node.id, nodeName: node.name,
    }))
  },

  async docker_create_container({ nodeId, name, image, tag = 'latest', panelPort = 1420, gatewayPort = 18789, envVars = {}, volume = true } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const imgFull = `${image || defaultDockerImage()}:${tag}`
    const containerName = name || `openclaw-${Date.now().toString(36)}`
    const env = Object.entries(envVars).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`)
    const portBindings = {}
    const exposedPorts = {}
    if (panelPort) {
      portBindings['1420/tcp'] = [{ HostPort: String(panelPort) }]
      exposedPorts['1420/tcp'] = {}
    }
    if (gatewayPort) {
      portBindings['18789/tcp'] = [{ HostPort: String(gatewayPort) }]
      exposedPorts['18789/tcp'] = {}
    }
    const config = {
      Image: imgFull,
      Env: env,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: volume ? [`openclaw-data-${containerName}:/root/.openclaw`] : [],
      },
    }
    const query = `?name=${encodeURIComponent(containerName)}`
    const resp = await dockerRequest('POST', `/containers/create${query}`, config, node.endpoint)
    if (resp.status === 404) {
      // Image not found, need to pull first
      throw new Error(`镜像 ${imgFull} 不存在，请先拉取`)
    }
    if (resp.status !== 201) throw new Error(resp.data?.message || '创建容器失败')
    // Auto-start
    const startResp = await dockerRequest('POST', `/containers/${resp.data.Id}/start`, null, node.endpoint)
    if (startResp.status !== 204 && startResp.status !== 304) {
      throw new Error('容器已创建但启动失败')
    }
    const containerId = resp.data.Id?.slice(0, 12)

    // 自动注册为可管理实例
    if (panelPort) {
      const endpoint = `http://127.0.0.1:${panelPort}`
      const instData = readInstances()
      if (!instData.instances.find(i => i.endpoint === endpoint)) {
        instData.instances.push({
          id: `docker-${containerId}`,
          name: containerName,
          type: 'docker',
          endpoint,
          gatewayPort: gatewayPort || 18789,
          containerId,
          nodeId: node.id,
          addedAt: Math.floor(Date.now() / 1000),
          note: `Image: ${imgFull}`,
        })
        saveInstances(instData)
      }
    }

    return { id: containerId, name: containerName, started: true, instanceId: `docker-${containerId}` }
  },

  async docker_start_container({ nodeId, containerId } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const resp = await dockerRequest('POST', `/containers/${containerId}/start`, null, node.endpoint)
    if (resp.status !== 204 && resp.status !== 304) throw new Error(resp.data?.message || '启动失败')
    return true
  },

  async docker_stop_container({ nodeId, containerId } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const resp = await dockerRequest('POST', `/containers/${containerId}/stop`, null, node.endpoint)
    if (resp.status !== 204 && resp.status !== 304) throw new Error(resp.data?.message || '停止失败')
    return true
  },

  async docker_restart_container({ nodeId, containerId } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const resp = await dockerRequest('POST', `/containers/${containerId}/restart`, null, node.endpoint)
    if (resp.status !== 204) throw new Error(resp.data?.message || '重启失败')
    return true
  },

  async docker_remove_container({ nodeId, containerId, force = false } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const query = force ? '?force=true&v=true' : '?v=true'
    const resp = await dockerRequest('DELETE', `/containers/${containerId}${query}`, null, node.endpoint)
    if (resp.status !== 204) throw new Error(resp.data?.message || '删除失败')

    // 自动移除对应的实例注册
    const instData = readInstances()
    const instId = `docker-${containerId}`
    const before = instData.instances.length
    instData.instances = instData.instances.filter(i => i.id !== instId && i.containerId !== containerId)
    if (instData.instances.length < before) {
      if (instData.activeId === instId) instData.activeId = 'local'
      saveInstances(instData)
    }

    return true
  },

  // 重建容器（保留配置，拉取最新镜像重新创建）
  async docker_rebuild_container({ nodeId, containerId, pullLatest = true } = {}) {
    if (!containerId) throw new Error('缺少 containerId')
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')

    // 1. 检查容器详情
    const inspectResp = await dockerRequest('GET', `/containers/${containerId}/json`, null, node.endpoint)
    if (inspectResp.status >= 400) throw new Error('容器不存在或无法访问')
    const info = inspectResp.data
    const oldName = (info.Name || '').replace(/^\//, '')
    const oldImage = info.Config?.Image || ''
    const oldEnv = info.Config?.Env || []
    const oldPortBindings = info.HostConfig?.PortBindings || {}
    const oldBinds = info.HostConfig?.Binds || []
    const oldRestartPolicy = info.HostConfig?.RestartPolicy || { Name: 'unless-stopped' }
    const oldExposedPorts = info.Config?.ExposedPorts || {}

    // 从名字推断角色
    const role = (() => {
      const n = oldName.toLowerCase()
      for (const r of ['coder', 'translator', 'writer', 'analyst', 'custom']) {
        if (n.includes(r)) return r
      }
      return 'general'
    })()

    console.log(`[rebuild] ${oldName} (${containerId.slice(0, 12)}) — image: ${oldImage}`)

    // 2. 拉取最新镜像（可选）
    if (pullLatest && oldImage) {
      const [img, tag] = oldImage.includes(':') ? oldImage.split(':') : [oldImage, 'latest']
      try {
        const pullResp = await dockerRequest('POST', `/images/create?fromImage=${encodeURIComponent(img)}&tag=${encodeURIComponent(tag)}`, null, node.endpoint)
        if (pullResp.status < 300) console.log(`[rebuild] 镜像已更新: ${oldImage}`)
      } catch (e) {
        console.warn(`[rebuild] 镜像拉取失败(继续使用本地): ${e.message}`)
      }
    }

    // 3. 停止并移除旧容器
    await dockerRequest('POST', `/containers/${containerId}/stop`, null, node.endpoint).catch(() => {})
    await new Promise(r => setTimeout(r, 1000))
    const rmResp = await dockerRequest('DELETE', `/containers/${containerId}?force=true`, null, node.endpoint)
    if (rmResp.status !== 204 && rmResp.status !== 404) {
      throw new Error(`移除旧容器失败: ${rmResp.data?.message || rmResp.status}`)
    }

    // 移除旧实例注册
    const instData = readInstances()
    const instId = `docker-${containerId.slice(0, 12)}`
    instData.instances = instData.instances.filter(i => i.id !== instId && i.containerId !== containerId)
    saveInstances(instData)

    // 4. 创建新容器（相同配置）
    const newConfig = {
      Image: oldImage,
      Env: oldEnv,
      ExposedPorts: oldExposedPorts,
      HostConfig: {
        PortBindings: oldPortBindings,
        RestartPolicy: oldRestartPolicy,
        Binds: oldBinds,
      },
    }
    const query = `?name=${encodeURIComponent(oldName)}`
    const createResp = await dockerRequest('POST', `/containers/create${query}`, newConfig, node.endpoint)
    if (createResp.status !== 201) throw new Error(`创建新容器失败: ${createResp.data?.message || createResp.status}`)
    const newId = createResp.data?.Id

    // 5. 启动新容器
    const startResp = await dockerRequest('POST', `/containers/${newId}/start`, null, node.endpoint)
    if (startResp.status !== 204 && startResp.status !== 304) throw new Error('新容器启动失败')

    const newCid = newId?.slice(0, 12) || newId

    // 6. 注册实例
    const panelPort = oldPortBindings['1420/tcp']?.[0]?.HostPort
    if (panelPort) {
      const endpoint = `http://127.0.0.1:${panelPort}`
      if (!instData.instances.find(i => i.endpoint === endpoint)) {
        instData.instances.push({
          id: `docker-${newCid}`, name: oldName, type: 'docker',
          endpoint, gatewayPort: oldPortBindings['18789/tcp']?.[0]?.HostPort || 18789,
          containerId: newCid, nodeId: node.id,
          addedAt: Math.floor(Date.now() / 1000), note: `Rebuilt: ${oldImage}`,
        })
        saveInstances(instData)
      }
    }

    // 7. 初始化（同步配置 + 注入 agent）
    await new Promise(r => setTimeout(r, 3000))
    try {
      await handlers.docker_init_worker({ nodeId, containerId: newId, role })
    } catch (e) {
      console.warn(`[rebuild] 初始化警告: ${e.message}`)
    }

    console.log(`[rebuild] ${oldName} 重建完成: ${containerId.slice(0, 12)} → ${newCid}`)
    return { id: newCid, name: oldName, rebuilt: true, role }
  },

  async docker_gateway_chat({ nodeId, containerId, message, timeout = DOCKER_TASK_TIMEOUT_MS } = {}) {
    if (!containerId || !message) throw new Error('缺少 containerId 或 message')
    // 1. 查找容器的 Gateway 端口
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const resp = await dockerRequest('GET', `/containers/${containerId}/json`, null, node.endpoint)
    if (resp.status >= 400) throw new Error('容器不存在或无法访问')
    const ports = resp.data?.NetworkSettings?.Ports || {}
    const gwBinding = ports['18789/tcp']
    if (!gwBinding || !gwBinding[0]?.HostPort) throw new Error('该容器没有暴露 Gateway 端口 (18789)')
    const gwPort = gwBinding[0].HostPort

    // 2. TCP 端口预检 — 快速判断 Gateway 是否在监听，失败则自动修复
    const containerName = resp.data?.Name?.replace(/^\//, '') || containerId.slice(0, 12)
    const tcpCheck = (port) => new Promise((resolve, reject) => {
      const sock = net.connect({ host: '127.0.0.1', port, timeout: 5000 })
      sock.on('connect', () => { sock.destroy(); resolve() })
      sock.on('timeout', () => { sock.destroy(); reject(new Error('timeout')) })
      sock.on('error', (e) => reject(e))
    })
    try {
      await tcpCheck(gwPort)
    } catch {
      // Gateway 未运行 → 自动修复：同步配置 + 重启 Gateway
      console.log(`[gateway-chat] ${containerName}: Gateway 未响应，自动修复中...`)
      try {
        await handlers.docker_init_worker({ nodeId, containerId, role: 'general' })
        // 等待 Gateway 启动
        await new Promise(r => setTimeout(r, 8000))
        await tcpCheck(gwPort)
        console.log(`[gateway-chat] ${containerName}: 自动修复成功`)
      } catch (e2) {
        throw new Error(`${containerName}: Gateway 自动修复失败 — ${e2.message}`)
      }
    }

    // 3. Raw WebSocket 连接 Gateway（带 Origin header + 固定 CLUSTER_TOKEN，含重试）
    let socket
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        socket = await rawWsConnect('127.0.0.1', parseInt(gwPort), '/ws')
        break
      } catch (e) {
        if (attempt === 3) throw new Error(`${containerName}: WebSocket 连接失败 — ${e.message}`)
        console.log(`[gateway-chat] ${containerName}: WS 连接失败(${attempt}/3)，${attempt * 2}s 后重试...`)
        await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }
    console.log(`[gateway-chat] WebSocket 已连接 ws://127.0.0.1:${gwPort}/ws`)

    // 3a. 读取 connect.challenge
    const challengeRaw = await wsReadFrame(socket, 8000)
    const challenge = JSON.parse(challengeRaw)
    if (challenge.event !== 'connect.challenge') throw new Error('Gateway 未发送 challenge')

    // 3b. 发送 connect 帧（固定 token + 完整设备签名）
    const connectFrame = handlers.create_connect_frame({ nonce: challenge.payload?.nonce || '', gatewayToken: CLUSTER_TOKEN })
    wsSendFrame(socket, JSON.stringify(connectFrame))

    // 3c. 读取 connect 响应
    const connectRespRaw = await wsReadFrame(socket, 8000)
    const connectResp = JSON.parse(connectRespRaw)
    if (!connectResp.ok) {
      socket.destroy()
      const errMsg = connectResp.error?.message || 'Gateway 握手失败'
      throw new Error(`${containerName}: ${errMsg}`)
    }
    console.log(`[gateway-chat] 握手成功: ${containerName}`)
    const defaults = connectResp.payload?.snapshot?.sessionDefaults
    const sessionKey = defaults?.mainSessionKey || `agent:${defaults?.defaultAgentId || 'main'}:cluster-task`

    // 4. 发送聊天消息
    const chatId = `chat-${Date.now().toString(36)}`
    wsSendFrame(socket, JSON.stringify({
      type: 'req', id: chatId, method: 'chat.send',
      params: { sessionKey, message, deliver: false, idempotencyKey: chatId }
    }))

    // 5. 读取聊天回复流
    console.log(`[gateway-chat] 消息已发送，等待 AI 回复: ${containerName}`)
    return new Promise((resolve, reject) => {
      let result = '', done = false
      const cancel = wsReadLoop(socket, (data) => {
        let msg
        try { msg = JSON.parse(data) } catch { return }
        // 诊断日志：显示所有收到的消息类型
        const msgInfo = msg.type === 'event' ? `event:${msg.event} state=${msg.payload?.state || ''}` : `${msg.type} id=${msg.id} ok=${msg.ok}`
        console.log(`[gateway-chat] ${containerName} ← ${msgInfo}`)
        if (msg.type === 'event' && msg.event === 'chat') {
          const p = msg.payload
          if (p?.state === 'delta') {
            const content = p.message?.content
            if (typeof content === 'string' && content.length > result.length) result = content
          }
          if (p?.state === 'final') {
            const content = p.message?.content
            if (typeof content === 'string' && content) result = content
            done = true; cancel()
            resolve({ ok: true, result })
          }
          if (p?.state === 'error') {
            done = true; cancel()
            const errDetail = p.error?.message || p.message?.content || p.errorMessage || JSON.stringify(p).slice(0, 300)
            console.error(`[gateway-chat] ${containerName} AI error payload:`, JSON.stringify(p).slice(0, 500))
            reject(new Error(`${containerName}: AI 错误 — ${errDetail}`))
          }
        }
        if (msg.type === 'res' && !msg.ok) {
          done = true; cancel()
          const errMsg = msg.error?.message || '任务发送失败'
          if (errMsg.includes('no model') || errMsg.includes('model'))
            reject(new Error(`${containerName}: 未配置模型 — 请先在容器面板中配置 AI 模型`))
          else
            reject(new Error(`${containerName}: ${errMsg}`))
        }
      }, timeout)
      // 超时兜底
      setTimeout(() => {
        if (!done) { done = true; cancel(); resolve({ ok: true, result: result || '（无回复）' }) }
      }, timeout)
    })
  },

  // === Docker Agent 通道（容器内专属控制代理）===
  async docker_agent({ nodeId, containerId, cmd } = {}) {
    if (!containerId) throw new Error('缺少 containerId')
    if (!cmd || !cmd.cmd) throw new Error('缺少 cmd')
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')

    const cmdJson = JSON.stringify(cmd)
    const timeout = cmd.timeout || (cmd.cmd === 'task.run' ? DOCKER_TASK_TIMEOUT_MS : 30000)
    const cid12 = containerId.slice(0, 12)

    const runAgent = async () => {
      const execResult = await dockerExecRun(
        containerId,
        ['node', '/app/clawpanel-agent.cjs', cmdJson],
        node.endpoint,
        timeout,
      )
      return execResult
    }

    const cExec = createContainerShellExec(containerId, node.endpoint)

    console.log(`[agent] ${cid12} → ${cmd.cmd}`)
    let execResult
    try {
      await syncAgentToContainerIfNeeded(containerId, node.endpoint, cExec)
      execResult = await runAgent()
    } catch (e) {
      // exec 本身失败（如 node 未找到模块），尝试自动注入
      throw new Error(`容器代理执行失败: ${e.message}`)
    }

    // 检查 agent 是否缺失（stdout 空 + stderr 含 "Cannot find module"）
    if (!execResult.stdout.trim() && execResult.stderr.includes('Cannot find module')) {
      console.log(`[agent] ${cid12}: agent 未安装，自动注入中...`)
      const injected = await injectAgentToContainer(containerId, node.endpoint, cExec)
      if (!injected) throw new Error('容器代理未安装且无法自动注入 — 请先执行征召(init-worker)')
      execResult = await runAgent()
    }

    // 解析 NDJSON 输出
    const lines = execResult.stdout.split('\n').filter(l => l.trim())
    const events = []
    for (const line of lines) {
      try { events.push(JSON.parse(line)) } catch {}
    }

    if (execResult.stderr) {
      console.warn(`[agent] ${cid12} stderr: ${execResult.stderr.slice(0, 300)}`)
    }

    // 提取最终结果
    const error = events.find(e => e.type === 'error')
    if (error) {
      const err = new Error(error.message || '容器代理执行失败')
      err.events = events
      throw err
    }

    const final = events.find(e => e.type === 'final')
    const result = events.find(e => e.type === 'result')

    if (final) return { ok: true, result: final.text, events }
    if (result) {
      if (result.ok) return { ok: true, ...result, events }
      const err = new Error(result.message || '容器代理执行失败')
      err.events = events
      throw err
    }

    const tailTypes = events.slice(-3).map(e => e.type || 'unknown').join(', ')
    const err = new Error(
      tailTypes
        ? `容器代理未返回最终结果（最后事件: ${tailTypes}）`
        : '容器代理未返回任何结果',
    )
    err.events = events
    throw err
  },

  // === Docker Agent 批量广播 ===
  async docker_agent_broadcast({ nodeId, containerIds, message, timeout = DOCKER_TASK_TIMEOUT_MS } = {}) {
    if (!containerIds || !containerIds.length) throw new Error('缺少 containerIds')
    if (!message) throw new Error('缺少 message')

    const cmd = { cmd: 'task.run', message, timeout }
    const results = await Promise.allSettled(
      containerIds.map(cid =>
        handlers.docker_agent({ nodeId, containerId: cid, cmd })
          .then(r => ({ containerId: cid, ...r }))
      )
    )

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      return { containerId: containerIds[i], ok: false, error: r.reason?.message || '未知错误' }
    })
  },

  // === 异步任务派发（非阻塞，立即返回 taskId） ===
  async docker_dispatch_task({ nodeId, containerId, containerName, message, timeout = DOCKER_TASK_TIMEOUT_MS } = {}) {
    if (!containerId) throw new Error('缺少 containerId')
    if (!message) throw new Error('缺少 message')

    const task = createTask(containerId, containerName, nodeId, message)
    console.log(`[dispatch] 任务已派发 → ${task.containerName} (${task.id})`)

    // 后台异步执行，不阻塞返回
    const cmd = { cmd: 'task.run', message, timeout }
    handlers.docker_agent({ nodeId, containerId, cmd })
      .then(r => {
        task.status = 'completed'
        task.result = r
        task.events = r.events || []
        task.completedAt = Date.now()
        console.log(`[dispatch] 任务完成 ✓ ${task.containerName} (${task.id}) — ${((task.completedAt - task.startedAt) / 1000).toFixed(1)}s`)
      })
      .catch(e => {
        task.status = 'error'
        task.error = e.message || String(e)
        task.events = e.events || []
        task.completedAt = Date.now()
        console.error(`[dispatch] 任务失败 ✗ ${task.containerName} (${task.id}): ${task.error}`)
      })

    return { taskId: task.id, containerId, containerName: task.containerName, status: 'running' }
  },

  // 批量异步派发（多个容器）
  async docker_dispatch_broadcast({ nodeId, targets, message, timeout = DOCKER_TASK_TIMEOUT_MS } = {}) {
    if (!targets || !targets.length) throw new Error('缺少 targets')
    if (!message) throw new Error('缺少 message')

    const taskIds = []
    for (const t of targets) {
      const result = await handlers.docker_dispatch_task({
        nodeId: t.nodeId || nodeId,
        containerId: t.containerId,
        containerName: t.containerName,
        message,
        timeout,
      })
      taskIds.push(result)
    }
    return taskIds
  },

  // 查询单个任务状态
  docker_task_status({ taskId } = {}) {
    if (!taskId) throw new Error('缺少 taskId')
    const task = _taskStore.get(taskId)
    if (!task) throw new Error('任务不存在')
    return {
      id: task.id,
      containerId: task.containerId,
      containerName: task.containerName,
      message: task.message,
      status: task.status,
      result: task.result,
      error: task.error,
      events: task.events,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      elapsed: task.completedAt ? task.completedAt - task.startedAt : Date.now() - task.startedAt,
    }
  },

  // 查询所有任务列表
  docker_task_list({ containerId, status } = {}) {
    let tasks = [..._taskStore.values()]
    if (containerId) tasks = tasks.filter(t => t.containerId === containerId)
    if (status) tasks = tasks.filter(t => t.status === status)
    // 按时间倒序
    tasks.sort((a, b) => b.startedAt - a.startedAt)
    return tasks.map(t => ({
      id: t.id,
      containerId: t.containerId,
      containerName: t.containerName,
      message: t.message,
      status: t.status,
      error: t.error,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      elapsed: t.completedAt ? t.completedAt - t.startedAt : Date.now() - t.startedAt,
      hasResult: !!t.result,
    }))
  },

  async docker_init_worker({ nodeId, containerId, role = 'general' } = {}) {
    if (!containerId) throw new Error('缺少 containerId')
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')

    const results = { config: false, personality: false, files: [] }

    // helper: base64 encode string
    const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')

    // helper: exec command in container
    const cExec = async (cmd) => {
      const createResp = await dockerRequest('POST', `/containers/${containerId}/exec`, {
        AttachStdout: true, AttachStderr: true, Cmd: ['sh', '-c', cmd]
      }, node.endpoint)
      if (createResp.status >= 400) throw new Error(`exec 失败: ${createResp.status}`)
      const execId = createResp.data?.Id
      if (!execId) return
      await dockerRequest('POST', `/exec/${execId}/start`, { Detach: true }, node.endpoint)
      // 给 exec 一点时间完成
      await new Promise(r => setTimeout(r, 300))
    }

    // 1. 同步 openclaw.json（模型 + API Key 配置）
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const localConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
        // 只同步 OpenClaw 认识的字段，避免 Unrecognized key 导致 Gateway 崩溃
        const syncConfig = {}
        if (localConfig.meta) syncConfig.meta = localConfig.meta // 保持原始 meta，不加自定义字段
        if (localConfig.env) syncConfig.env = localConfig.env
        if (localConfig.models) {
          // 容器内 127.0.0.1/localhost 指向容器自身，需替换为 host.docker.internal 访问宿主机
          syncConfig.models = JSON.parse(JSON.stringify(localConfig.models, (k, v) => {
            if (k === 'baseUrl' && typeof v === 'string') {
              return v.replace(/\/\/127\.0\.0\.1([:/])/g, '//host.docker.internal$1')
                      .replace(/\/\/localhost([:/])/g, '//host.docker.internal$1')
            }
            return v
          }))
        }
        if (localConfig.auth) syncConfig.auth = localConfig.auth
        // Gateway 配置：只设置 controlUi（允许连接），不复制 host/bind 等本机特定字段
        syncConfig.gateway = {
          port: 18789,
          mode: 'local',
          bind: 'lan',
          auth: { mode: 'token', token: CLUSTER_TOKEN },
          controlUi: { allowedOrigins: ['*'], allowInsecureAuth: true },
        }

        const configB64 = b64(JSON.stringify(syncConfig, null, 2))
        await cExec(`mkdir -p /root/.openclaw && echo '${configB64}' | base64 -d > /root/.openclaw/openclaw.json`)
        results.config = true
        results.files.push('openclaw.json')
        console.log(`[init-worker] 配置已同步 → ${containerId.slice(0, 12)}`)
      }
    } catch (e) {
      console.warn(`[init-worker] 配置同步失败: ${e.message}`)
    }

    // 2. 注入设备配对信息（绕过 Gateway 手动配对要求）
    try {
      const { deviceId, publicKey } = getOrCreateDeviceKey()
      const platform = openclawGatewayPlatform()
      const nowMs = Date.now()
      const pairedData = {}
      pairedData[deviceId] = {
        deviceId, publicKey, platform, deviceFamily: 'desktop',
        clientId: 'openclaw-control-ui', clientMode: 'ui',
        role: 'operator', roles: ['operator'],
        scopes: SCOPES, approvedScopes: SCOPES, tokens: {},
        createdAtMs: nowMs, approvedAtMs: nowMs,
      }
      const pairedB64 = b64(JSON.stringify(pairedData, null, 2))
      await cExec(`mkdir -p /root/.openclaw/devices && echo '${pairedB64}' | base64 -d > /root/.openclaw/devices/paired.json`)
      results.files.push('devices/paired.json')
      console.log(`[init-worker] 设备配对已注入 → ${containerId.slice(0, 12)}`)
    } catch (e) {
      console.warn(`[init-worker] 设备配对注入失败: ${e.message}`)
    }

    // 3. 角色性格注入（SOUL.md + IDENTITY.md + AGENTS.md）
    try {
      // 角色性格模板
      const ROLE_SOULS = {
        general: { identity: '# 龙虾步兵\n通用作战单位，隶属统帅龙虾军团', soul: '# 龙虾步兵 · 性格\n\n## 核心\n- 忠诚可靠，执行力强\n- 能处理各类任务：写作、编程、翻译、分析\n- 回复简洁专业\n- 主动报告任务进展\n\n## 边界\n- 尊重隐私，不泄露信息\n- 不确定时先询问统帅\n- 每次回复聚焦任务本身' },
        coder: { identity: '# 龙虾突击兵\n编程作战专家，隶属统帅龙虾军团', soul: '# 龙虾突击兵 · 性格\n\n## 核心\n- 精通多种编程语言和框架\n- 代码质量第一，回复包含可运行示例\n- 擅长调试、重构、Code Review\n- 主动提示潜在问题和最佳实践\n\n## 边界\n- 修改文件前先理解上下文\n- 不跳过测试\n- 不引入不必要的依赖' },
        translator: { identity: '# 龙虾翻译官\n多语言作战专家，隶属统帅龙虾军团', soul: '# 龙虾翻译官 · 性格\n\n## 核心\n- 精通中英日韩法德西等主流语言互译\n- 追求信达雅，翻译精准\n- 保留原文语境和风格\n- 对专业术语严格把关\n\n## 边界\n- 不确定的术语标注原文\n- 不过度意译\n- 保持文体一致性' },
        writer: { identity: '# 龙虾文书官\n写作任务专家，隶属统帅龙虾军团', soul: '# 龙虾文书官 · 性格\n\n## 核心\n- 文思敏捷，创意丰富\n- 能调整语气适应不同场景\n- 精通博客、技术文档、营销文案等\n- 善于讲故事，引人入胜\n\n## 边界\n- 不抄袭\n- 保持原创性\n- 注重可读性和准确性' },
        analyst: { identity: '# 龙虾参谋\n数据分析专家，隶属统帅龙虾军团', soul: '# 龙虾参谋 · 性格\n\n## 核心\n- 逻辑清晰，善用数据说话\n- 结论有理有据，给出可行建议\n- 善用图表和结构化格式呈现\n- 擅长统计分析、商业分析、竞品分析\n\n## 边界\n- 不编造数据\n- 区分相关性和因果性\n- 标注不确定性' },
        custom: { identity: '# 龙虾特种兵\n特殊任务执行者，隶属统帅龙虾军团', soul: '# 龙虾特种兵 · 性格\n\n## 核心\n- 灵活多变，适应力强\n- 按需配置技能\n- 不拘泥形式，主动寻找最优解\n\n## 边界\n- 行动前确认方向\n- 不超出授权范围' },
      }

      const roleSoul = ROLE_SOULS[role] || ROLE_SOULS.general

      // 每个兵种独立的 AGENTS.md（操作指令）
      const ROLE_AGENTS = {
        general: '# 操作指令\n\n你是龙虾军团的步兵，接受统帅通过 ClawPanel 下达的任务指令。\n\n## 规则\n- 收到任务后立即执行，完成后简要汇报结果\n- 如果任务不清楚，先确认再行动\n- 保持回复简洁，重点突出\n- 你有独立的记忆空间，会自动记录重要信息',
        coder: '# 操作指令\n\n你是龙虾军团的突击兵，专精编程作战。\n\n## 规则\n- 收到编程任务后，先分析需求再写代码\n- 代码必须可运行，包含必要的注释\n- 主动进行错误处理和边界检查\n- 如果涉及多个文件，说明修改顺序\n- 完成后给出测试建议\n\n## 专长\n- 全栈开发、API 设计、数据库优化\n- Bug 定位与修复、代码重构\n- 性能优化、安全审计',
        translator: '# 操作指令\n\n你是龙虾军团的翻译官，专精多语言互译。\n\n## 规则\n- 翻译要信达雅，保持原文风格\n- 专业术语保留原文标注\n- 长文分段翻译，保持上下文一致\n- 文学作品注重意境传达\n- 技术文档注重准确性\n\n## 专长\n- 中英日韩法德西等主流语言\n- 技术文档、文学作品、商务邮件',
        writer: '# 操作指令\n\n你是龙虾军团的文书官，专精写作任务。\n\n## 规则\n- 根据场景调整语气和风格\n- 注重结构清晰、逻辑连贯\n- 创意写作要有个性和亮点\n- 技术文档要准确严谨\n- 营销文案要抓住痛点\n\n## 专长\n- 博客文章、技术文档、营销文案\n- 故事创作、剧本、诗歌\n- SEO 优化、社交媒体内容',
        analyst: '# 操作指令\n\n你是龙虾军团的参谋，专精数据分析和战略规划。\n\n## 规则\n- 用数据说话，结论必须有依据\n- 区分事实、推断和假设\n- 善用表格和结构化格式呈现\n- 给出可执行的建议\n- 标注不确定性和风险\n\n## 专长\n- 市场分析、竞品研究、用户画像\n- 数据可视化、统计分析\n- 商业计划、策略建议',
        custom: '# 操作指令\n\n你是龙虾军团的特种兵，执行特殊任务。\n\n## 规则\n- 灵活应对各类非标准任务\n- 行动前确认方向\n- 不超出授权范围\n- 主动寻找最优解决方案',
      }

      const wsFiles = {
        'SOUL.md': roleSoul.soul,
        'IDENTITY.md': roleSoul.identity,
        'AGENTS.md': ROLE_AGENTS[role] || ROLE_AGENTS.general,
      }

      // 写入兵种专属文件（不复制本机的 TOOLS.md/USER.md/记忆，每个士兵独立发展）
      await cExec('mkdir -p /root/.openclaw/workspace')
      for (const [fname, content] of Object.entries(wsFiles)) {
        const encoded = b64(content)
        await cExec(`echo '${encoded}' | base64 -d > /root/.openclaw/workspace/${fname}`)
        results.files.push(`workspace/${fname}`)
      }
      results.personality = true
      console.log(`[init-worker] 兵种配置注入完成 (${role}) → ${containerId.slice(0, 12)}`)
    } catch (e) {
      console.warn(`[init-worker] 兵种配置注入失败: ${e.message}`)
    }

    // 4.5 注入 ClawPanel Agent（容器内专属控制代理）
    try {
      await injectAgentToContainer(containerId, node.endpoint, cExec)
      results.files.push('clawpanel-agent.cjs')
    } catch (e) {
      console.warn(`[init-worker] Agent 注入失败: ${e.message}`)
    }

    // 5. 重启 Gateway
    try {
      // 停止旧 Gateway
      await cExec('pkill -f openclaw-gateway 2>/dev/null; pkill -f "openclaw gateway" 2>/dev/null; sleep 1')
      // 启动新 Gateway — 作为独立 Detach exec 的主进程（不能 nohup &，shell 退出会 SIGTERM 杀子进程）
      // --force 确保端口被占用时也能启动
      await cExec('mkdir -p /root/.openclaw/logs && exec openclaw gateway --force >> /root/.openclaw/logs/gateway.log 2>&1')
      console.log(`[init-worker] Gateway 已重启 → ${containerId.slice(0, 12)}`)
    } catch (e) {
      console.warn(`[init-worker] Gateway 重启失败: ${e.message}`)
    }

    return results
  },

  async docker_container_exec({ nodeId, containerId, cmd } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    if (!containerId) throw new Error('缺少 containerId')
    if (!cmd || !Array.isArray(cmd)) throw new Error('cmd 必须是字符串数组')
    // Step 1: 创建 exec 实例
    const createResp = await dockerRequest('POST', `/containers/${containerId}/exec`, {
      AttachStdout: true, AttachStderr: true, Cmd: cmd
    }, node.endpoint)
    if (createResp.status >= 400) throw new Error(`exec 创建失败: ${JSON.stringify(createResp.data)}`)
    const execId = createResp.data?.Id
    if (!execId) throw new Error('exec 创建失败: 无 ID')
    // Step 2: 启动 exec
    const startResp = await dockerRequest('POST', `/exec/${execId}/start`, { Detach: true }, node.endpoint)
    if (startResp.status >= 400) throw new Error(`exec 启动失败: ${JSON.stringify(startResp.data)}`)
    return { ok: true, execId }
  },

  async docker_container_logs({ nodeId, containerId, tail = 200 } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const resp = await dockerRequest('GET', `/containers/${containerId}/logs?stdout=true&stderr=true&tail=${tail}`, null, node.endpoint)
    // Docker logs 返回带 stream header 的原始字节，简单清理
    let logs = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    // 去除 Docker stream 帧头（每 8 字节一个 header）
    logs = logs.replace(/[\x00-\x08]/g, '').replace(/\r/g, '')
    return logs
  },

  async docker_pull_image({ nodeId, image, tag = 'latest', requestId } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const baseImage = image || defaultDockerImage()
    const imgFull = `${baseImage}:${tag}`
    const rid = requestId || `pull-${Date.now()}`
    _pullProgress.set(rid, { status: 'connecting', image: imgFull, layers: {}, message: '连接 Docker...', percent: 0 })
    const endpoint = normalizeDockerEndpoint(node.endpoint) || defaultDockerEndpoint()
    const apiPath = `/images/create?fromImage=${encodeURIComponent(baseImage)}&tag=${tag}`
    try {
      await new Promise((resolve, reject) => {
        const opts = { path: apiPath, method: 'POST', headers: { 'Content-Type': 'application/json' } }
        if (endpoint && endpoint.startsWith('tcp://')) {
          const url = new URL(endpoint.replace('tcp://', 'http://'))
          opts.hostname = url.hostname
          opts.port = parseInt(url.port) || 2375
        } else {
          opts.socketPath = endpoint
        }
        const req = http.request(opts, (res) => {
          if (res.statusCode !== 200) {
            let errData = ''
            res.on('data', chunk => errData += chunk)
            res.on('end', () => {
              const err = (() => { try { return JSON.parse(errData).message } catch { return `HTTP ${res.statusCode}` } })()
              _pullProgress.set(rid, { ..._pullProgress.get(rid), status: 'error', message: err })
              reject(new Error(err))
            })
            return
          }
          _pullProgress.set(rid, { ..._pullProgress.get(rid), status: 'pulling', message: '正在拉取镜像层...' })
          let lastError = null
          res.on('data', (chunk) => {
            const text = chunk.toString()
            for (const line of text.split('\n').filter(Boolean)) {
              try {
                const obj = JSON.parse(line)
                if (obj.error) { lastError = obj.error; continue }
                const p = _pullProgress.get(rid)
                if (obj.id && obj.progressDetail) {
                  p.layers[obj.id] = {
                    status: obj.status || '',
                    current: obj.progressDetail.current || 0,
                    total: obj.progressDetail.total || 0,
                  }
                }
                if (obj.status) p.message = obj.id ? `${obj.id}: ${obj.status}` : obj.status
                // 计算总体进度
                const layers = Object.values(p.layers)
                if (layers.length > 0) {
                  const totalBytes = layers.reduce((s, l) => s + (l.total || 0), 0)
                  const currentBytes = layers.reduce((s, l) => s + (l.current || 0), 0)
                  p.percent = totalBytes > 0 ? Math.round((currentBytes / totalBytes) * 100) : 0
                  p.layerCount = layers.length
                  p.completedLayers = layers.filter(l => l.status === 'Pull complete' || l.status === 'Already exists').length
                }
                _pullProgress.set(rid, p)
              } catch {}
            }
          })
          res.on('end', () => {
            if (lastError) {
              _pullProgress.set(rid, { ..._pullProgress.get(rid), status: 'error', message: lastError })
              reject(new Error(lastError))
            } else {
              _pullProgress.set(rid, { ..._pullProgress.get(rid), status: 'done', message: '拉取完成', percent: 100 })
              resolve()
            }
          })
        })
        req.on('error', (e) => {
          _pullProgress.set(rid, { ..._pullProgress.get(rid), status: 'error', message: e.message })
          reject(new Error('Docker 连接失败: ' + e.message))
        })
        req.setTimeout(600000, () => {
          _pullProgress.set(rid, { ..._pullProgress.get(rid), status: 'error', message: '超时' })
          req.destroy()
          reject(new Error('镜像拉取超时（10分钟）'))
        })
        req.end()
      })
    } finally {
      // 30秒后清理进度数据
      setTimeout(() => _pullProgress.delete(rid), 30000)
    }
    return { message: `镜像 ${imgFull} 拉取完成`, requestId: rid }
  },

  docker_pull_status({ requestId } = {}) {
    if (!requestId) return { status: 'unknown' }
    return _pullProgress.get(requestId) || { status: 'unknown' }
  },

  async docker_list_images({ nodeId } = {}) {
    const nodes = readDockerNodes()
    const node = nodeId ? nodes.find(n => n.id === nodeId) : nodes[0]
    if (!node) throw new Error('节点不存在')
    const resp = await dockerRequest('GET', '/images/json', null, node.endpoint)
    if (resp.status !== 200) throw new Error('获取镜像列表失败')
    return (resp.data || [])
      .filter(img => (img.RepoTags || []).some(t => t.includes('openclaw')))
      .map(img => ({
        id: img.Id?.replace('sha256:', '').slice(0, 12),
        tags: img.RepoTags || [],
        size: img.Size,
        created: img.Created,
      }))
  },

  // Docker 节点管理
  docker_list_nodes() {
    return readDockerNodes()
  },

  async docker_add_node({ name, endpoint }) {
    if (!name || !endpoint) throw new Error('节点名称和地址不能为空')
    const normalizedEndpoint = normalizeDockerEndpoint(endpoint)
    if (!normalizedEndpoint) throw new Error('Docker 节点地址格式无效')
    // 验证连接
    try {
      await dockerRequest('GET', '/info', null, normalizedEndpoint)
    } catch (e) {
      throw new Error(`无法连接到 ${endpoint}: ${e.message}`)
    }
    const nodes = readDockerNodes()
    const id = 'node-' + Date.now().toString(36)
    const type = normalizedEndpoint.startsWith('tcp://') ? 'tcp' : 'socket'
    nodes.push({ id, name, type, endpoint: normalizedEndpoint })
    saveDockerNodes(nodes)
    return { id, name, type, endpoint: normalizedEndpoint }
  },

  docker_remove_node({ nodeId }) {
    if (nodeId === 'local') throw new Error('不能删除本机节点')
    const nodes = readDockerNodes().filter(n => n.id !== nodeId)
    saveDockerNodes(nodes)
    return true
  },

  // 集群概览（聚合所有节点）
  async docker_cluster_overview() {
    const nodes = readDockerNodes()
    const results = []
    for (const node of nodes) {
      try {
        const infoResp = await dockerRequest('GET', '/info', null, node.endpoint)
        const ctResp = await dockerRequest('GET', '/containers/json?all=true', null, node.endpoint)
        const containers = (ctResp.data || []).map(c => ({
          id: c.Id?.slice(0, 12),
          name: (c.Names?.[0] || '').replace(/^\//, ''),
          image: c.Image, state: c.State, status: c.Status,
          ports: (c.Ports || []).map(p => p.PublicPort ? `${p.PublicPort}→${p.PrivatePort}` : `${p.PrivatePort}`).join(', '),
        }))
        const d = infoResp.data || {}
        results.push({
          ...node, online: true,
          dockerVersion: d.ServerVersion, os: d.OperatingSystem,
          cpus: d.NCPU, memory: d.MemTotal,
          totalContainers: d.Containers, runningContainers: d.ContainersRunning,
          stoppedContainers: d.ContainersStopped,
          containers,
        })
      } catch (e) {
        results.push({ ...node, online: false, error: e.message, containers: [] })
      }
    }
    return results
  },

  // 部署模式检测
  get_deploy_mode() {
    const inDocker = fs.existsSync('/.dockerenv') || (process.env.CLAWPANEL_MODE === 'docker')
    const dockerAvailable = isDockerAvailable()
    return { inDocker, dockerAvailable, mode: inDocker ? 'docker' : 'local' }
  },

  // 安装检测
  check_installation() {
    const inDocker = fs.existsSync('/.dockerenv')
    return { installed: fs.existsSync(CONFIG_PATH), path: OPENCLAW_DIR, platform: isMac ? 'macos' : process.platform, inDocker }
  },

  check_git() {
    const { gitPath, isCustom, result } = runGitSync(['--version'], { timeout: 5000 })
    const detectedPath = isCustom ? gitPath : findCommandPath('git')
    try {
      if (result?.error || result?.status !== 0) throw new Error(result?.error?.message || result?.stderr || result?.stdout || 'git not found')
      const ver = String(result.stdout || result.stderr || '').trim()
      const match = ver.match(/(\d+\.\d+[\.\d]*)/)
      return { installed: true, version: match ? match[1] : ver, path: detectedPath, isCustom }
    } catch {
      return { installed: false, version: null, path: detectedPath, isCustom }
    }
  },

  scan_git_paths() {
    const candidates = [
      ['/usr/bin/git', 'SYSTEM'],
      ['/usr/local/bin/git', 'SYSTEM'],
      ['/opt/homebrew/bin/git', 'BREW'],
      ['/Library/Developer/CommandLineTools/usr/bin/git', 'XCODE_CLT'],
      ['/snap/bin/git', 'SNAP'],
    ]
    const found = []
    const seen = new Set()
    for (const [p, source] of candidates) {
      if (!fs.existsSync(p) || seen.has(p)) continue
      seen.add(p)
      try {
        const ver = cp.execSync(`"${p}" --version`, { timeout: 5000 }).toString().trim()
        found.push({ path: p, version: ver, source })
      } catch {}
    }
    return found
  },

  auto_install_git() {
    // Web 模式下不自动安装系统软件，返回指引
    throw new Error('Web 部署模式下请手动安装 Git：\n- Ubuntu/Debian: sudo apt install git\n- CentOS/RHEL: sudo yum install git\n- macOS: xcode-select --install')
  },

  configure_git_https() {
    try {
      const success = configureGitHttpsRules()
      if (!success) throw new Error('Git 未安装或写入失败')
      return `已配置 Git HTTPS 替代 SSH（${success}/${GIT_HTTPS_REWRITES.length} 条规则）`
    } catch (e) {
      throw new Error('配置失败: ' + (e.message || e))
    }
  },

  async probe_gateway_port() {
    const port = readGatewayPort()
    return new Promise(resolve => {
      const sock = net.createConnection({ host: '127.0.0.1', port, timeout: 3000 })
      sock.on('connect', () => { sock.destroy(); resolve(true) })
      sock.on('error', () => resolve(false))
      sock.on('timeout', () => { sock.destroy(); resolve(false) })
    })
  },

  // @homebridge/ciao windowsHide bug — Windows only. Linux/macOS stubs return false.
  // See https://github.com/homebridge/ciao/issues/64 and PR #65.
  check_ciao_windowshide_bug() {
    const platform = process.platform
    if (platform !== 'win32') {
      return {
        affected: false,
        platform,
        version: null,
        networkManagerPath: null,
        detail: 'Non-Windows platform — bug does not manifest here.',
      }
    }
    // Web 模式极少跑在 Windows 上，这里提供最小桩实现保持接口一致
    return {
      affected: false,
      platform,
      version: null,
      networkManagerPath: null,
      detail: 'Ciao bug detection is only performed in the Tauri desktop build.',
    }
  },

  async diagnose_gateway_connection() {
    const steps = []
    const ocDir = OPENCLAW_DIR
    const configPath = path.join(ocDir, 'openclaw.json')
    const port = readGatewayPort()

    // 1. 配置文件
    const t1 = Date.now()
    try {
      const content = fs.readFileSync(configPath, 'utf-8')
      const val = JSON.parse(content)
      steps.push({ name: 'config', ok: !!val.gateway, message: val.gateway ? '配置文件有效，含 gateway 配置' : '配置文件缺少 gateway 段', durationMs: Date.now() - t1 })
    } catch (e) {
      steps.push({ name: 'config', ok: false, message: `配置文件异常: ${e.message}`, durationMs: Date.now() - t1 })
    }

    // 2. 设备密钥
    const t2 = Date.now()
    const keyPath = path.join(ocDir, 'clawpanel-device-key.json')
    const keyExists = fs.existsSync(keyPath)
    steps.push({ name: 'device_key', ok: keyExists, message: keyExists ? '设备密钥存在' : '设备密钥不存在', durationMs: Date.now() - t2 })

    // 3. allowedOrigins
    const t3 = Date.now()
    try {
      const val = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const origins = val?.gateway?.controlUi?.allowedOrigins
      if (Array.isArray(origins) && origins.length > 0) {
        steps.push({ name: 'allowed_origins', ok: true, message: `allowedOrigins: ${JSON.stringify(origins)}`, durationMs: Date.now() - t3 })
      } else {
        steps.push({ name: 'allowed_origins', ok: false, message: '未配置 allowedOrigins', durationMs: Date.now() - t3 })
      }
    } catch {
      steps.push({ name: 'allowed_origins', ok: false, message: '配置文件不可读', durationMs: Date.now() - t3 })
    }

    // 4. TCP 端口
    const t4 = Date.now()
    const tcpOk = await new Promise(resolve => {
      const sock = net.createConnection({ host: '127.0.0.1', port, timeout: 3000 })
      sock.on('connect', () => { sock.destroy(); resolve(true) })
      sock.on('error', () => resolve(false))
      sock.on('timeout', () => { sock.destroy(); resolve(false) })
    })
    steps.push({ name: 'tcp_port', ok: tcpOk, message: tcpOk ? `端口 ${port} 可达` : `端口 ${port} 不可达`, durationMs: Date.now() - t4 })

    // 5. HTTP /health
    const t5 = Date.now()
    let httpOk = false
    let httpMsg = ''
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(5000) })
      httpOk = resp.ok
      httpMsg = `HTTP /health 返回 ${resp.status}`
    } catch (e) {
      httpMsg = `HTTP /health 请求失败: ${e.message}`
    }
    steps.push({ name: 'http_health', ok: httpOk, message: httpMsg, durationMs: Date.now() - t5 })

    // 6. 错误日志
    const t6 = Date.now()
    const errLogPath = path.join(ocDir, 'logs', 'gateway.err.log')
    if (fs.existsSync(errLogPath)) {
      const stat = fs.statSync(errLogPath)
      if (stat.size === 0) {
        steps.push({ name: 'err_log', ok: true, message: '错误日志为空（正常）', durationMs: Date.now() - t6 })
      } else {
        const buf = Buffer.alloc(Math.min(1024, stat.size))
        const fd = fs.openSync(errLogPath, 'r')
        fs.readSync(fd, buf, 0, buf.length, Math.max(0, stat.size - buf.length))
        fs.closeSync(fd)
        const tail = buf.toString('utf-8').toLowerCase()
        const hasFatal = tail.includes('fatal') || tail.includes('eaddrinuse') || tail.includes('config invalid')
        steps.push({ name: 'err_log', ok: !hasFatal, message: hasFatal ? `错误日志含关键错误 (${stat.size} bytes)` : `错误日志存在但无致命错误 (${stat.size} bytes)`, durationMs: Date.now() - t6 })
      }
    } else {
      steps.push({ name: 'err_log', ok: true, message: '无错误日志（正常）', durationMs: Date.now() - t6 })
    }

    // env
    let authMode = 'none'
    try {
      const val = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const auth = val?.gateway?.auth
      if (auth?.token) authMode = 'token'
      else if (auth?.password) authMode = 'password'
    } catch {}
    let errLogExcerpt = ''
    try {
      const buf = fs.readFileSync(errLogPath)
      errLogExcerpt = buf.slice(Math.max(0, buf.length - 2048)).toString('utf-8')
    } catch {}

    const overallOk = steps.every(s => s.ok)
    const failed = steps.filter(s => !s.ok).map(s => s.name)
    return {
      steps,
      env: {
        openclawDir: ocDir,
        configExists: fs.existsSync(configPath),
        port,
        authMode,
        deviceKeyExists: keyExists,
        gatewayOwner: null,
        errLogExcerpt,
      },
      overallOk,
      summary: overallOk ? '所有检查项通过' : `以下检查未通过: ${failed.join(', ')}`,
    }
  },

  guardian_status() {
    // Web 模式没有 Guardian 守护进程
    return { enabled: false, giveUp: false }
  },

  invalidate_path_cache() {
    return true
  },

  check_node() {
    try {
      const ver = execSync('node --version 2>&1', { windowsHide: true }).toString().trim()
      return { installed: true, version: ver, path: findCommandPath('node') }
    } catch {
      return { installed: false, version: null, path: null }
    }
  },

  // 运行时状态摘要（轻量实现：直接读 openclaw.json + 端口检测，不 spawn CLI 进程）
  // ARM 设备上 `openclaw status --json` 是最大 CPU 消耗源（每次 spawn ~380M Node.js 进程）
  get_status_summary() {
    return serverCached('status_summary', 60000, () => {
      try {
        if (!fs.existsSync(CONFIG_PATH)) return { error: 'openclaw.json 不存在' }
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
        const channels = cfg.channels || {}
        const channelSummary = Object.entries(channels).map(([id, val]) =>
          `${id}: ${val?.enabled !== false ? 'configured' : 'disabled'}`
        )
        const agents = cfg.agents?.list || []
        const defaultModel = cfg.agents?.defaults?.model?.primary || ''
        const version = (() => {
          // 尝试读取本地安装的 package.json 获取版本号（不 spawn CLI）
          try {
            for (const pkgName of ['@qingchencloud/openclaw-zh', 'openclaw']) {
              const winNodeModules = readWindowsNpmGlobalPrefix()
                ? [path.join(readWindowsNpmGlobalPrefix(), 'node_modules')]
                : [path.join(process.env.APPDATA || '', 'npm', 'node_modules')]
              const candidates = isMac
                ? ['/opt/homebrew/lib/node_modules', '/usr/local/lib/node_modules']
                : isWindows
                  ? winNodeModules
                  : ['/usr/local/lib/node_modules']
              for (const base of candidates) {
                const pkgJson = path.join(base, pkgName, 'package.json')
                if (fs.existsSync(pkgJson)) {
                  return JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version || null
                }
              }
            }
          } catch {}
          return null
        })()
        return {
          runtimeVersion: version,
          heartbeat: {
            defaultAgentId: 'main',
            agents: [
              { agentId: 'main', enabled: true },
              ...agents.map(a => ({ agentId: a.id || a, enabled: true }))
            ]
          },
          channelSummary,
          sessions: {
            defaults: { model: defaultModel }
          },
          source: 'file-read'
        }
      } catch (e) {
        return { error: e.message || String(e) }
      }
    })
  },

  // 版本信息
  async get_version_info() {
    let source = detectInstalledSource()
    const current = getLocalOpenclawVersion()
    // 兜底：版本号含 -zh 则一定是汉化版
    if (current && current.includes('-zh') && source !== 'chinese') source = 'chinese'
    const cli_path = resolveOpenclawCliPath()
    const cli_source = classifyCliSource(cli_path) || null
    if (source === 'unknown') {
      const cliInstallSource = cli_source === 'standalone'
        ? (detectStandaloneSourceFromCliPath(cli_path) || 'chinese')
        : normalizeCliInstallSource(cli_source)
      if (cliInstallSource !== 'unknown') source = cliInstallSource
    }
    const latest = source === 'unknown' ? null : await getLatestVersionFor(source)
    const recommended = source === 'unknown' ? null : recommendedVersionFor(source)
    const all_installations = scanAllOpenclawInstallations(cli_path)

    return {
      current,
      latest,
      recommended,
      update_available: current && recommended ? recommendedIsNewer(recommended, current) : !!recommended,
      latest_update_available: current && latest ? recommendedIsNewer(latest, current) : !!latest,
      is_recommended: !!current && !!recommended && versionsMatch(current, recommended),
      ahead_of_recommended: !!current && !!recommended && recommendedIsNewer(current, recommended),
      panel_version: PANEL_VERSION,
      source,
      cli_path,
      cli_source,
      all_installations
    }
  },

  // 模型测试
  async test_model({ baseUrl, apiKey, modelId, apiType = 'openai-completions' }) {
    const type = ['anthropic', 'anthropic-messages'].includes(apiType) ? 'anthropic-messages'
      : apiType === 'google-gemini' ? 'google-gemini'
      : 'openai-completions'
    apiKey = resolveModelApiKey(apiKey)
    let base = _normalizeBaseUrl(baseUrl)
    // 仅 Anthropic 强制补 /v1，OpenAI 兼容类不强制（火山引擎等用 /v3）
    if (type === 'anthropic-messages' && !/\/v1$/i.test(base)) base += '/v1'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    try {
      let resp
      if (type === 'anthropic-messages') {
        const headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' }
        if (apiKey) headers['x-api-key'] = apiKey
        resp = await fetch(`${base}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 16,
          }),
          signal: controller.signal
        })
      } else if (type === 'google-gemini') {
        resp = await fetch(`${base}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey || '')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] }),
          signal: controller.signal
        })
      } else {
        const headers = { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity', 'Accept': 'text/event-stream' }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
        resp = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 16,
            stream: true
          }),
          signal: controller.signal
        })
      }
      clearTimeout(timeout)
      if (!resp.ok) {
        const text = await resp.text()
        let msg = `HTTP ${resp.status}`
        try {
          const parsed = JSON.parse(text)
          msg = parsed.error?.message || parsed.message || msg
        } catch {}
        if (resp.status === 401 || resp.status === 403) throw new Error(msg)
        return `⚠ 连接正常（API 返回 ${resp.status}，部分模型对简单测试不兼容，不影响实际使用）`
      }
      const text = await resp.text()
      const sseReply = _extractSseReply(text)
      if (sseReply) return sseReply

      let data = null
      try {
        data = JSON.parse(text)
      } catch (e) {
        throw new Error(`响应不是有效 JSON/SSE: ${e.message}`)
      }
      const anthropicText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
      const geminiText = data.candidates?.[0]?.content?.parts?.map?.(p => p.text).filter(Boolean).join('') || ''
      const content = data.choices?.[0]?.message?.content
      const reasoning = data.choices?.[0]?.message?.reasoning_content
      return anthropicText || geminiText || content || (reasoning ? '上游只返回了推理内容，已隐藏内部推理；请重新发起请求或检查模型配置。' : '（无回复内容）')
    } catch (e) {
      clearTimeout(timeout)
      if (e.name === 'AbortError') throw new Error('请求超时 (30s)')
      throw e
    }
  },

  // 模型测试（详细版 #Compat-1）：返回 {success, status, reqUrl, reqBody, respBody, reply, error, elapsedMs, usedApi}
  async test_model_verbose({ baseUrl, apiKey, modelId, apiType = 'openai-completions' }) {
    const type = ['anthropic', 'anthropic-messages'].includes(apiType) ? 'anthropic-messages'
      : apiType === 'google-gemini' ? 'google-gemini'
      : 'openai-completions'
    apiKey = resolveModelApiKey(apiKey)
    let base = _normalizeBaseUrl(baseUrl)
    if (type === 'anthropic-messages' && !/\/v1$/i.test(base)) base += '/v1'
    const t0 = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)

    // Accept-Encoding: identity 禁止响应压缩，规避 Node fetch 对某些压缩格式的解码异常
    // （和 Rust test_model_verbose 保持行为一致）
    let usedApi, reqUrl, reqBody, headers, realUrl
    if (type === 'anthropic-messages') {
      usedApi = 'Anthropic Messages'
      reqUrl = `${base}/messages`
      realUrl = reqUrl
      reqBody = { model: modelId, messages: [{ role: 'user', content: '你好，请用一句话回复' }], max_tokens: 200 }
      headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'Accept-Encoding': 'identity' }
      if (apiKey) headers['x-api-key'] = apiKey
    } else if (type === 'google-gemini') {
      usedApi = 'Gemini'
      reqUrl = `${base}/models/${encodeURIComponent(modelId)}:generateContent?key=***`
      realUrl = `${base}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey || '')}`
      reqBody = { contents: [{ role: 'user', parts: [{ text: '你好，请用一句话回复' }] }] }
      headers = { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' }
    } else {
      // OpenAI 兼容路径用 stream:true：部分兼容网关的 non-streaming 分支对某些模型
      // 会返回 200 + 空 body，而 streaming 分支所有 provider 都稳定支持，与真实对话一致
      usedApi = 'Chat Completions (SSE)'
      reqUrl = `${base}/chat/completions`
      realUrl = reqUrl
      reqBody = { model: modelId, messages: [{ role: 'user', content: '你好，请用一句话回复' }], max_tokens: 200, stream: true }
      headers = { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity', 'Accept': 'text/event-stream' }
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    }

    let resp
    try {
      resp = await fetch(realUrl, { method: 'POST', headers, body: JSON.stringify(reqBody), signal: controller.signal })
    } catch (e) {
      clearTimeout(timer)
      const elapsedMs = Date.now() - t0
      const error = e.name === 'AbortError' ? '请求超时 (30s)' : (e.message || String(e))
      return { success: false, status: 0, reqUrl, reqBody, respHeaders: null, respBody: '', respRawHex: '', respByteCount: 0, reply: '', error, elapsedMs, usedApi }
    }
    clearTimeout(timer)
    const elapsedMs = Date.now() - t0
    const status = resp.status
    // 抓取响应头
    const respHeaders = {}
    for (const [k, v] of resp.headers.entries()) respHeaders[k] = v
    // 先拿字节，再自己 UTF-8 decode，失败时给 hex dump
    let respBody = ''
    let respRawHex = ''
    let respByteCount = 0
    let decodeErr = null
    try {
      const buf = new Uint8Array(await resp.arrayBuffer())
      respByteCount = buf.length
      respRawHex = Array.from(buf.slice(0, 200)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      try {
        respBody = new TextDecoder('utf-8', { fatal: true }).decode(buf)
      } catch (e) {
        // UTF-8 严格解码失败，给 lossy 版本
        respBody = new TextDecoder('utf-8').decode(buf)
        decodeErr = `响应体 UTF-8 解码失败: ${e.message} | 字节数=${respByteCount}`
      }
    } catch (e) {
      decodeErr = `读取响应字节失败: ${e.message}`
    }

    // 先尝试 SSE 累积（OpenAI stream:true / Anthropic streaming），再回退到单 JSON
    let reply = _extractSseReply(respBody)
    if (!reply) {
      try {
        const v = JSON.parse(respBody)
        if (Array.isArray(v.content)) {
          reply = v.content.filter(b => b.type === 'text').map(b => b.text).join('')
        }
        if (!reply && v.candidates?.[0]?.content?.parts) {
          reply = v.candidates[0].content.parts.map(p => p.text).filter(Boolean).join('')
        }
        if (!reply && v.choices?.[0]?.message) {
          const msg = v.choices[0].message
          reply = msg.content || (msg.reasoning_content ? '上游只返回了推理内容，已隐藏内部推理；请重新发起请求或检查模型配置。' : '')
        }
        if (!reply && v.output?.text) reply = v.output.text
      } catch {}
    }

    const success = resp.ok && !!reply && !decodeErr
    let error = null
    if (decodeErr) {
      error = decodeErr
    } else if (!resp.ok) {
      try {
        const v = JSON.parse(respBody)
        error = v.error?.message || v.message || `HTTP ${status}`
      } catch { error = `HTTP ${status}` }
    } else if (!reply) {
      error = 'API 已响应但未解析出内容'
    }
    return { success, status, reqUrl, reqBody, respHeaders, respBody, respRawHex, respByteCount, reply, error, elapsedMs, usedApi }
  },

  async list_remote_models({ baseUrl, apiKey, apiType = 'openai-completions' }) {
    const type = ['anthropic', 'anthropic-messages'].includes(apiType) ? 'anthropic-messages'
      : apiType === 'google-gemini' ? 'google-gemini'
      : 'openai-completions'
    apiKey = resolveModelApiKey(apiKey)
    let base = _normalizeBaseUrl(baseUrl)
    // 仅 Anthropic 强制补 /v1，OpenAI 兼容类不强制（火山引擎等用 /v3）
    if (type === 'anthropic-messages' && !/\/v1$/i.test(base)) base += '/v1'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      let resp
      if (type === 'anthropic-messages') {
        const headers = { 'anthropic-version': '2023-06-01' }
        if (apiKey) headers['x-api-key'] = apiKey
        resp = await fetch(`${base}/models`, { headers, signal: controller.signal })
      } else if (type === 'google-gemini') {
        resp = await fetch(`${base}/models?key=${encodeURIComponent(apiKey || '')}`, { signal: controller.signal })
      } else {
        const headers = {}
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
        resp = await fetch(`${base}/models`, { headers, signal: controller.signal })
      }
      clearTimeout(timeout)
      if (!resp.ok) {
        // 404/405/501 = 服务商不支持 /models 接口，给用户友好提示
        const code = resp.status
        if (code === 404 || code === 405 || code === 501) {
          throw new Error('[NOT_SUPPORTED] 该服务商不支持自动获取模型列表，请手动输入模型 ID')
        }
        const text = await resp.text().catch(() => '')
        let msg = `HTTP ${resp.status}`
        try {
          const parsed = JSON.parse(text)
          msg = parsed.error?.message || parsed.message || msg
        } catch {}
        throw new Error(msg)
      }
      const data = await resp.json()
      const ids = (data.data || []).map(m => m.id)
        .concat((data.models || []).map(m => (m.name || '').replace(/^models\//, '')))
        .filter(Boolean)
        .sort()
      if (!ids.length) throw new Error('该服务商返回了空的模型列表')
      return ids
    } catch (e) {
      clearTimeout(timeout)
      if (e.name === 'AbortError') throw new Error('请求超时 (15s)')
      throw e
    }
  },

  // 日志
  read_log_tail({ logName, lines = 100 }) {
    const logFiles = {
      'gateway': 'gateway.log',
      'gateway-err': 'gateway.err.log',
      'guardian': 'guardian.log',
      'guardian-backup': 'guardian-backup.log',
      'config-audit': 'config-audit.jsonl',
    }
    const file = logFiles[logName] || logFiles['gateway']
    const logPath = path.join(LOGS_DIR, file)
    if (!fs.existsSync(logPath)) return ''
    try {
      return execSync(`tail -${lines} "${logPath}" 2>&1`, { windowsHide: true }).toString()
    } catch {
      const content = fs.readFileSync(logPath, 'utf8')
      return content.split('\n').slice(-lines).join('\n')
    }
  },

  search_log({ logName, query, maxResults = 50 }) {
    const logFiles = {
      'gateway': 'gateway.log',
      'gateway-err': 'gateway.err.log',
    }
    const file = logFiles[logName] || logFiles['gateway']
    const logPath = path.join(LOGS_DIR, file)
    if (!fs.existsSync(logPath)) return []
    // 纯 JS 实现，避免 shell 命令注入
    const content = fs.readFileSync(logPath, 'utf8')
    const queryLower = (query || '').toLowerCase()
    const matched = content.split('\n').filter(line => line.toLowerCase().includes(queryLower))
    return matched.slice(-maxResults)
  },

  // Agent 管理
  list_agents() {
    // 从 openclaw.json 的 agents.list[] 读取完整配置
    const cfg = readOpenclawConfigOptional()
    if (ensureOpenClawWorkspaceConfig(cfg)) writeOpenclawConfigFile(cfg)
    const agentsList = Array.isArray(cfg.agents?.list) ? cfg.agents.list : []
    const defaults = cfg.agents?.defaults || {}

    if (agentsList.length === 0) {
      // 无 agents.list 配置 → 回退扫描目录模式
      const mainWorkspace = resolveDefaultWorkspace(cfg)
      const result = [{ id: 'main', isDefault: true, identityName: null, identityEmoji: null, model: null, workspace: mainWorkspace, workspaceStatus: ensureOpenClawWorkspaceDir(mainWorkspace) }]
      const agentsDir = path.join(OPENCLAW_DIR, 'agents')
      if (fs.existsSync(agentsDir)) {
        try {
          for (const entry of fs.readdirSync(agentsDir)) {
            if (entry === 'main') continue
            const p = path.join(agentsDir, entry)
            if (fs.statSync(p).isDirectory()) {
              const workspace = path.join(agentsDir, entry, 'workspace')
              result.push({ id: entry, isDefault: false, identityName: null, identityEmoji: null, model: null, workspace, workspaceStatus: ensureOpenClawWorkspaceDir(workspace) })
            }
          }
        } catch {}
      }
      return result
    }

    // 从 agents.list[] 读取
    const hasMain = agentsList.some(a => (a?.id || 'main').trim() === 'main')
    const allAgents = hasMain
      ? agentsList
      : [{ id: 'main', default: true, workspace: resolveDefaultWorkspace(cfg) }, ...agentsList]

    return allAgents.filter(a => a && typeof a === 'object').map((a, idx) => {
      const id = (a.id || 'main').trim()
      const isDefault = a.default === true || id === 'main' || (idx === 0 && !allAgents.some(x => x.default === true))
      // 模型：可以是 string 或 { primary, fallbacks }
      let model = a.model || defaults.model || null
      if (model && typeof model === 'object') model = model.primary || JSON.stringify(model)
      const workspace = expandHomePath(a.workspace) || resolveAgentWorkspace(cfg, id)
      return {
        id,
        isDefault,
        identityName: a.identity?.name || a.name || null,
        identityEmoji: a.identity?.emoji || null,
        model,
        workspace,
        workspaceStatus: ensureOpenClawWorkspaceDir(workspace),
        thinkingDefault: a.thinkingDefault || defaults.thinkingDefault || null,
      }
    })
  },

  // Agent 详情（完整配置）
  get_agent_detail({ id }) {
    if (!id) throw new Error('Agent ID 不能为空')
    const cfg = readOpenclawConfigOptional()
    const defaults = cfg.agents?.defaults || {}
    const bindings = Array.isArray(cfg.bindings) ? cfg.bindings : []

    // 查找 agent 配置
    let agent = findAgentConfig(cfg, id)
    if (!agent && id === 'main') {
      // main agent 可能不在 list 中
      agent = { id: 'main', default: true }
    }
    if (!agent) throw new Error(`Agent "${id}" 不存在`)

    // 解析工作区路径
    const actualWorkspace = resolveAgentWorkspace(cfg, id)

    // 获取绑定
    const agentBindings = bindings.filter(b => (b.agentId || 'main') === id)

    return {
      id,
      isDefault: agent.default === true || id === 'main',
      name: agent.name || null,
      identity: agent.identity || null,
      model: agent.model || defaults.model || null,
      workspace: actualWorkspace,
      workspaceRaw: agent.workspace || null,
      thinkingDefault: agent.thinkingDefault || defaults.thinkingDefault || null,
      reasoningDefault: agent.reasoningDefault || defaults.reasoningDefault || null,
      fastModeDefault: agent.fastModeDefault ?? null,
      skills: agent.skills || null,
      heartbeat: agent.heartbeat || null,
      groupChat: agent.groupChat || null,
      subagents: agent.subagents || null,
      sandbox: agent.sandbox || null,
      tools: agent.tools || null,
      params: agent.params || null,
      runtime: agent.runtime || null,
      bindings: agentBindings,
      defaults,
    }
  },

  // Agent 工作区文件列表
  list_agent_files({ id }) {
    if (!id) throw new Error('Agent ID 不能为空')
    const cfg = readOpenclawConfigOptional()
    const workspaceDir = resolveAgentWorkspace(cfg, id)

    // Bootstrap 文件列表
    const BOOTSTRAP_FILES = [
      { name: 'AGENTS.md', desc: 'Agent 规则' },
      { name: 'SOUL.md', desc: '灵魂/人格' },
      { name: 'TOOLS.md', desc: '工具白名单' },
      { name: 'IDENTITY.md', desc: '身份信息' },
      { name: 'USER.md', desc: '用户上下文' },
      { name: 'HEARTBEAT.md', desc: '心跳指令' },
      { name: 'BOOTSTRAP.md', desc: '初始化引导' },
      { name: 'MEMORY.md', desc: '记忆存储' },
    ]

    return BOOTSTRAP_FILES.map(f => {
      const filePath = path.join(workspaceDir, f.name)
      const exists = fs.existsSync(filePath)
      let size = 0, mtime = null
      if (exists) {
        try {
          const stat = fs.statSync(filePath)
          size = stat.size
          mtime = stat.mtime.toISOString()
        } catch {}
      }
      return { name: f.name, desc: f.desc, exists, size, mtime, path: filePath }
    })
  },

  // 读取 Agent 工作区文件
  read_agent_file({ id, name }) {
    if (!id) throw new Error('Agent ID 不能为空')
    if (!name) throw new Error('文件名不能为空')
    // 安全性：只允许读取预定义的 bootstrap 文件
    const ALLOWED = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'USER.md', 'HEARTBEAT.md', 'BOOTSTRAP.md', 'MEMORY.md']
    if (!ALLOWED.includes(name)) throw new Error('不允许读取此文件')

    const cfg = readOpenclawConfigOptional()
    const workspaceDir = resolveAgentWorkspace(cfg, id)

    const filePath = path.join(workspaceDir, name)
    if (!fs.existsSync(filePath)) return { exists: false, content: '' }
    return { exists: true, content: fs.readFileSync(filePath, 'utf8') }
  },

  // 写入 Agent 工作区文件
  write_agent_file({ id, name, content }) {
    if (!id) throw new Error('Agent ID 不能为空')
    if (!name) throw new Error('文件名不能为空')
    const ALLOWED = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'USER.md', 'HEARTBEAT.md', 'BOOTSTRAP.md', 'MEMORY.md']
    if (!ALLOWED.includes(name)) throw new Error('不允许写入此文件')
    if (typeof content !== 'string') throw new Error('内容必须是字符串')

    const cfg = readOpenclawConfigOptional()
    const workspaceDir = resolveAgentWorkspace(cfg, id)

    // 确保目录存在
    if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true })
    fs.writeFileSync(path.join(workspaceDir, name), content, 'utf8')
    return { ok: true }
  },

  get_agent_workspace_info({ id }) {
    if (!id) throw new Error('Agent ID 不能为空')
    const cfg = readOpenclawConfigOptional()
    if (ensureOpenClawWorkspaceConfig(cfg)) writeOpenclawConfigFile(cfg)
    const workspaceDir = resolveAgentWorkspace(cfg, id)
    const workspaceStatus = ensureOpenClawWorkspaceDir(workspaceDir)
    return {
      agentId: id,
      workspacePath: workspaceDir,
      exists: workspaceStatus.exists,
      writable: workspaceStatus.writable,
      warning: workspaceStatus.warning,
      isDefault: id === 'main',
    }
  },

  list_agent_workspace_entries({ id, relativePath }) {
    if (!id) throw new Error('Agent ID 不能为空')
    const cfg = readOpenclawConfigOptional()
    const { root, fullPath } = resolveAgentWorkspaceChild(cfg, id, relativePath || '')
    if (!fs.existsSync(root)) return []
    if (!fs.existsSync(fullPath)) throw new Error('目录不存在')
    const stat = fs.statSync(fullPath)
    if (!stat.isDirectory()) throw new Error('目标不是目录')

    return fs.readdirSync(fullPath, { withFileTypes: true })
      .map(entry => {
        const absPath = path.join(fullPath, entry.name)
        const meta = fs.statSync(absPath)
        const isDir = meta.isDirectory()
        return {
          name: entry.name,
          relativePath: toWorkspaceRelativePath(root, absPath),
          type: isDir ? 'dir' : 'file',
          size: isDir ? 0 : meta.size,
          mtime: meta.mtime?.toISOString?.() || null,
          editable: !isDir && isWorkspaceTextFile(absPath),
          previewable: !isDir && isWorkspacePreviewableFile(absPath),
        }
      })
      .sort((a, b) => {
        const rankA = a.type === 'dir' ? 0 : 1
        const rankB = b.type === 'dir' ? 0 : 1
        return rankA - rankB || a.name.localeCompare(b.name)
      })
  },

  read_agent_workspace_file({ id, relativePath }) {
    if (!id) throw new Error('Agent ID 不能为空')
    const cfg = readOpenclawConfigOptional()
    const { relativePath: normalized, fullPath } = resolveAgentWorkspaceChild(cfg, id, relativePath || '')
    if (!normalized) throw new Error('文件路径不能为空')
    if (!fs.existsSync(fullPath)) throw new Error('文件不存在')
    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) throw new Error('目标不是文件')
    if (stat.size > MAX_WORKSPACE_FILE_SIZE) throw new Error('文件过大，暂不支持在面板中打开')
    const buffer = fs.readFileSync(fullPath)
    if (looksBinaryBuffer(buffer)) throw new Error('暂不支持在面板中打开二进制文件')
    return {
      relativePath: normalized,
      path: fullPath,
      size: stat.size,
      mtime: stat.mtime?.toISOString?.() || null,
      editable: true,
      previewable: isWorkspacePreviewableFile(fullPath),
      content: buffer.toString('utf8'),
    }
  },

  write_agent_workspace_file({ id, relativePath, content }) {
    if (!id) throw new Error('Agent ID 不能为空')
    if (typeof content !== 'string') throw new Error('内容必须是字符串')
    const cfg = readOpenclawConfigOptional()
    const { relativePath: normalized, fullPath } = resolveAgentWorkspaceChild(cfg, id, relativePath || '')
    if (!normalized) throw new Error('文件路径不能为空')
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf8')
    return { ok: true, relativePath: normalized, size: Buffer.byteLength(content, 'utf8') }
  },

  // 更新 Agent 概览配置（写入 openclaw.json agents.list[]）
  update_agent_config({ id, config }) {
    if (!id) throw new Error('Agent ID 不能为空')
    if (!config || typeof config !== 'object') throw new Error('配置不能为空')
    const cfg = readOpenclawConfigRequired()
    const agentsList = ensureAgentsList(cfg)

    let agentIdx = agentsList.findIndex(a => (a.id || 'main').trim() === id)
    if (agentIdx < 0 && id === 'main') {
      // main agent 不存在则创建
      agentsList.unshift({ id: 'main' })
      agentIdx = 0
    }
    if (agentIdx < 0) throw new Error(`Agent "${id}" 不存在于配置中`)

    const agent = agentsList[agentIdx]

    // 合并允许修改的字段
    if (config.name !== undefined) {
      if (config.name == null || config.name === '') delete agent.name
      else agent.name = config.name
    }
    if (config.identity !== undefined) {
      if (config.identity == null) {
        delete agent.identity
      } else {
        if (!agent.identity || typeof agent.identity !== 'object') agent.identity = {}
        if (config.identity.name !== undefined) {
          if (config.identity.name == null || config.identity.name === '') delete agent.identity.name
          else agent.identity.name = config.identity.name
        }
        if (config.identity.emoji !== undefined) {
          if (config.identity.emoji == null || config.identity.emoji === '') delete agent.identity.emoji
          else agent.identity.emoji = config.identity.emoji
        }
        if (!Object.keys(agent.identity).length) delete agent.identity
      }
    }
    if (config.model !== undefined) {
      if (config.model == null) delete agent.model
      else agent.model = config.model
    }
    if (config.thinkingDefault !== undefined) {
      if (config.thinkingDefault == null || config.thinkingDefault === '') delete agent.thinkingDefault
      else agent.thinkingDefault = config.thinkingDefault
    }
    if (config.reasoningDefault !== undefined) {
      if (config.reasoningDefault == null || config.reasoningDefault === '') delete agent.reasoningDefault
      else agent.reasoningDefault = config.reasoningDefault
    }
    if (config.skills !== undefined) {
      if (config.skills == null) delete agent.skills
      else agent.skills = config.skills
    }
    if (config.tools !== undefined) {
      if (config.tools == null) delete agent.tools
      else agent.tools = config.tools
    }

    // 写入
    writeOpenclawConfigFile(cfg)
    triggerGatewayReloadNonBlocking('update_agent_config')
    return { ok: true }
  },

  // Agent 渠道绑定管理
  list_all_bindings() {
    const cfg = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}
    const bindings = cfg.bindings || []
    return { bindings }
  },

  get_agent_bindings({ agentId } = {}) {
    const cfg = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}
    const all = Array.isArray(cfg.bindings) ? cfg.bindings : []
    const bindings = agentId ? all.filter(b => b?.agentId === agentId) : all
    return { bindings }
  },

  delete_agent_all_bindings({ agentId } = {}) {
    if (!agentId) throw new Error('agentId required')
    const cfg = readOpenclawConfigOptional()
    const before = Array.isArray(cfg.bindings) ? cfg.bindings.length : 0
    cfg.bindings = (cfg.bindings || []).filter(b => b?.agentId !== agentId)
    const removed = before - cfg.bindings.length
    if (removed > 0) {
      writeOpenclawConfigFile(cfg)
      triggerGatewayReloadNonBlocking('delete_agent_all_bindings')
    }
    return { ok: true, removed }
  },

  save_agent_binding({ agentId, channel, accountId, bindingConfig }) {
    const cfg = readOpenclawConfigOptional()
    if (!cfg.bindings) cfg.bindings = []
    const bindings = cfg.bindings

    const targetMatch = buildBindingMatch(channel, accountId, bindingConfig)
    const newBinding = {
      type: 'route',
      agentId,
      match: targetMatch,
    }

    let found = false
    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i]
      if (bindingIdentityMatches(b, agentId, targetMatch)) {
        bindings[i] = newBinding
        found = true
        break
      }
    }
    if (!found) {
      bindings.push(newBinding)
    }

    writeOpenclawConfigFile(cfg)
    triggerGatewayReloadNonBlocking('save_agent_binding')
    return { ok: true }
  },

  delete_agent_binding({ agentId, channel, accountId, bindingConfig }) {
    const cfg = readOpenclawConfigOptional()
    if (!cfg.bindings) cfg.bindings = []
    const bindings = cfg.bindings
    const targetMatch = buildBindingMatch(channel, accountId, bindingConfig)

    const before = bindings.length
    cfg.bindings = bindings.filter(b => !bindingIdentityMatches(b, agentId, targetMatch))

    writeOpenclawConfigFile(cfg)
    triggerGatewayReloadNonBlocking('delete_agent_binding')
    return { ok: true, removed: before - cfg.bindings.length }
  },

  // 记忆文件
  list_memory_files({ category, agent_id, agentId }) {
    const cfg = readOpenclawConfigOptional()
    const targetAgentId = agent_id || agentId || 'main'
    const dir = resolveMemoryDir(cfg, targetAgentId, category)
    if (!fs.existsSync(dir)) return []
    const files = []
    collectMemoryFiles(dir, dir, files, category || 'memory')
    files.sort()
    return files
  },

  read_memory_file({ path: filePath, agent_id, agentId }) {
    if (isUnsafePath(filePath)) throw new Error('非法路径')
    const cfg = readOpenclawConfigOptional()
    const targetAgentId = agent_id || agentId || 'main'
    const full = resolveMemoryPathCandidates(cfg, targetAgentId, filePath).find(candidate => fs.existsSync(candidate))
    if (!full) return ''
    return fs.readFileSync(full, 'utf8')
  },

  write_memory_file({ path: filePath, content, category, agent_id, agentId }) {
    if (isUnsafePath(filePath)) throw new Error('非法路径')
    const cfg = readOpenclawConfigOptional()
    const targetAgentId = agent_id || agentId || 'main'
    const full = category
      ? path.join(resolveMemoryDir(cfg, targetAgentId, category), filePath)
      : (resolveMemoryPathCandidates(cfg, targetAgentId, filePath).find(candidate => fs.existsSync(candidate))
          || path.join(resolveMemoryDir(cfg, targetAgentId, 'memory'), filePath))
    const dir = path.dirname(full)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(full, content)
    return true
  },

  delete_memory_file({ path: filePath, agent_id, agentId }) {
    if (isUnsafePath(filePath)) throw new Error('非法路径')
    const cfg = readOpenclawConfigOptional()
    const targetAgentId = agent_id || agentId || 'main'
    const full = resolveMemoryPathCandidates(cfg, targetAgentId, filePath).find(candidate => fs.existsSync(candidate))
    if (!full) return true
    if (fs.existsSync(full)) fs.unlinkSync(full)
    return true
  },

  export_memory_zip({ category, agent_id, agentId }) {
    throw new Error('ZIP 导出仅在 Tauri 桌面应用中可用')
  },

  // 备份管理
  list_backups() {
    if (!fs.existsSync(BACKUPS_DIR)) return []
    return fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(name => {
        const stat = fs.statSync(path.join(BACKUPS_DIR, name))
        return { name, size: stat.size, created_at: Math.floor((stat.birthtimeMs || stat.mtimeMs) / 1000) }
      })
      .sort((a, b) => b.created_at - a.created_at)
  },

  create_backup() {
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const name = `openclaw-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`
    fs.copyFileSync(CONFIG_PATH, path.join(BACKUPS_DIR, name))
    return { name, size: fs.statSync(path.join(BACKUPS_DIR, name)).size }
  },

  restore_backup({ name }) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) throw new Error('非法文件名')
    const src = path.join(BACKUPS_DIR, name)
    if (!fs.existsSync(src)) throw new Error('备份不存在')
    if (fs.existsSync(CONFIG_PATH)) handlers.create_backup()
    writeOpenclawConfigFile(JSON.parse(fs.readFileSync(src, 'utf8')))
    return true
  },

  delete_backup({ name }) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) throw new Error('非法文件名')
    const p = path.join(BACKUPS_DIR, name)
    if (fs.existsSync(p)) fs.unlinkSync(p)
    return true
  },

  // Vision 补丁
  patch_model_vision() {
    if (!fs.existsSync(CONFIG_PATH)) return false
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    let changed = false
    const providers = config?.models?.providers
    if (providers) {
      for (const p of Object.values(providers)) {
        if (!Array.isArray(p.models)) continue
        for (const m of p.models) {
          if (typeof m === 'object' && !m.input) {
            m.input = ['text', 'image']
            changed = true
          }
        }
      }
    }
    if (changed) {
      writeOpenclawConfigFile(config)
    }
    return changed
  },

  // Gateway 安装/卸载
  install_gateway() {
    if (!resolveOpenclawCliPath()) throw new Error('openclaw CLI 未安装')
    return execOpenclawSync(['gateway', 'install'], { windowsHide: true, cwd: homedir() }, 'Gateway 服务安装失败') || 'Gateway 服务已安装'
  },

  async list_openclaw_versions({ source = 'chinese' } = {}) {
    const pkg = npmPackageName(source)
    const encodedPkg = pkg.replace('/', '%2F').replace('@', '%40')
    const firstRegistry = pickRegistryForPackage(pkg)
    const registries = [...new Set([firstRegistry, 'https://registry.npmjs.org'])]
    let lastError = null
    for (const registry of registries) {
      try {
        const resp = await fetch(`${registry}/${encodedPkg}`, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        const versions = Object.keys(data.versions || {})
        versions.sort((a, b) => versionCompare(b, a))
        const recommended = recommendedVersionFor(source)
        if (recommended) {
          const pos = versions.indexOf(recommended)
          if (pos >= 0) {
            versions.splice(pos, 1)
            versions.unshift(recommended)
          } else {
            versions.unshift(recommended)
          }
        }
        return versions
      } catch (e) {
        lastError = e
      }
    }
    throw new Error('查询版本失败: ' + (lastError?.message || lastError || 'unknown error'))
  },

  async upgrade_openclaw({ source = 'chinese', version, method = 'auto' } = {}) {
    const currentSource = detectInstalledSource()
    const pkg = npmPackageName(source)
    const recommended = recommendedVersionFor(source)
    const ver = version || recommended || 'latest'
    const oldPkg = npmPackageName(currentSource)
    const needUninstallOld = currentSource !== source && oldPkg !== pkg
    const npmBin = isWindows ? 'npm.cmd' : 'npm'
    const registry = pickRegistryForPackage(pkg)
    const logs = []

    // ── standalone 安装（auto / standalone-r2 / standalone-github） ──
    const tryStandalone = source !== 'official' && ['auto', 'standalone-r2', 'standalone-github'].includes(method)
    if (tryStandalone) {
      const githubReleaseBase = `https://github.com/qingchencloud/openclaw-standalone/releases/download/v${ver}`
      if (method === 'standalone-github') {
        // standalone-github 模式：只走 GitHub
        try {
          const saResult = await _tryStandaloneInstall(ver, logs, githubReleaseBase)
          if (saResult) {
            logs.push('✅ standalone (GitHub) 安装完成')
            return logs.join('\n')
          }
        } catch (e) {
          throw new Error(`standalone 安装失败: ${e.message}`)
        }
      } else {
        // auto / standalone-r2 模式：R2 CDN → GitHub Releases fallback
        let cdnErr = null
        try {
          const saResult = await _tryStandaloneInstall(ver, logs, null)
          if (saResult) {
            logs.push('✅ standalone (CDN) 安装完成')
            return logs.join('\n')
          }
        } catch (e) {
          cdnErr = e.message
          logs.push(`CDN 下载失败（${cdnErr}），尝试从 GitHub Releases 下载...`)
        }
        // Fallback: GitHub Releases
        if (cdnErr) {
          try {
            const saResult = await _tryStandaloneInstall(ver, logs, githubReleaseBase)
            if (saResult) {
              logs.push('✅ standalone (GitHub) 安装完成')
              return logs.join('\n')
            }
          } catch (e) {
            if (method === 'auto') {
              logs.push(`standalone 不可用（GitHub: ${e.message}），降级到 npm 安装...`)
            } else {
              throw new Error(`standalone 安装失败: CDN=${cdnErr}, GitHub=${e.message}`)
            }
          }
        }
      }
    }

    // ── npm install（兜底或用户明确选择） ──

    if (!version && recommended) {
      logs.push(`ClawPanel ${PANEL_VERSION} 默认绑定 OpenClaw 稳定版: ${recommended}`)
    }
    const gitConfigured = configureGitHttpsRules()
    const gitEnv = buildGitInstallEnv()
    logs.push(`Git HTTPS 规则已就绪 (${gitConfigured}/${GIT_HTTPS_REWRITES.length})`)
    const runInstall = (targetRegistry) => execSync(
      `${npmBin} install -g ${pkg}@${ver} --force --registry ${targetRegistry} --verbose 2>&1`,
      { timeout: 120000, windowsHide: true, env: gitEnv }
    ).toString()
    try {
      let out
      try {
        out = runInstall(registry)
      } catch (e) {
        if (registry !== 'https://registry.npmjs.org') {
          logs.push('镜像源安装失败，自动切换到 npm 官方源重试...')
          out = runInstall('https://registry.npmjs.org')
        } else {
          throw e
        }
      }
      if (needUninstallOld) {
        try { execSync(`${npmBin} uninstall -g ${oldPkg} 2>&1`, { timeout: 60000, windowsHide: true }) } catch {}
      }
      logs.push(`安装完成 (${pkg}@${ver})`)
      return `${logs.join('\n')}\n${out.slice(-400)}`
    } catch (e) {
      throw new Error('安装失败: ' + (e.stderr?.toString() || e.message).slice(-300))
    }
  },

  uninstall_openclaw({ cleanConfig = false } = {}) {
    const npmBin = isWindows ? 'npm.cmd' : 'npm'
    // 清理 standalone 安装
    const saDir = standaloneInstallDir()
    if (fs.existsSync(saDir)) {
      try { fs.rmSync(saDir, { recursive: true, force: true }) } catch {}
    }
    // 清理 npm 安装
    try { execSync(`${npmBin} uninstall -g openclaw 2>&1`, { timeout: 60000, windowsHide: true }) } catch {}
    try { execSync(`${npmBin} uninstall -g @qingchencloud/openclaw-zh 2>&1`, { timeout: 60000, windowsHide: true }) } catch {}
    if (cleanConfig && fs.existsSync(OPENCLAW_DIR)) {
      try { fs.rmSync(OPENCLAW_DIR, { recursive: true, force: true }) } catch {}
    }
    return cleanConfig ? 'OpenClaw 已完全卸载（包括配置文件）' : 'OpenClaw 已卸载（配置文件保留）'
  },

  uninstall_gateway() {
    if (isMac) {
      const uid = getUid()
      try { execSync(`launchctl bootout gui/${uid}/ai.openclaw.gateway 2>&1`) } catch {}
      const plist = path.join(homedir(), 'Library/LaunchAgents/ai.openclaw.gateway.plist')
      if (fs.existsSync(plist)) fs.unlinkSync(plist)
    }
    return 'Gateway 服务已卸载'
  },

  // 自动初始化配置文件（CLI 已装但 openclaw.json 不存在时）
  init_openclaw_config() {
    if (fs.existsSync(CONFIG_PATH)) return { created: false, message: '配置文件已存在' }
    const restored = fs.existsSync(CONFIG_PATH + '.bak')
    ensureOpenclawConfigFile()
    return restored
      ? { created: false, restored: true, message: '已从 openclaw.json.bak 恢复配置文件' }
      : { created: true, restored: false, message: '配置文件已创建' }
  },

  get_deploy_config() {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      const gw = config.gateway || {}
      return { gatewayUrl: `http://127.0.0.1:${gw.port || 18789}`, authToken: gw.auth?.token || '', version: null }
    } catch {
      return { gatewayUrl: 'http://127.0.0.1:18789', authToken: '', version: null }
    }
  },

  get_npm_registry() {
    const regFile = path.join(OPENCLAW_DIR, 'npm-registry.txt')
    if (fs.existsSync(regFile)) return fs.readFileSync(regFile, 'utf8').trim() || 'https://registry.npmmirror.com'
    return 'https://registry.npmmirror.com'
  },

  set_npm_registry({ registry }) {
    fs.writeFileSync(path.join(OPENCLAW_DIR, 'npm-registry.txt'), registry.trim())
    return true
  },

  // Skills 管理（纯本地扫描，不依赖 CLI）
  skills_list({ agent_id } = {}) {
    const agentDir = resolveAgentSkillsDir(agent_id)
    return scanLocalSkillsFallback(agentDir)
  },
  skills_info({ name, agent_id } = {}) {
    const n = String(name || '').trim()
    const agentDir = resolveAgentSkillsDir(agent_id)
    const fallback = scanLocalSkillsFallback(agentDir).skills.find(skill => skill.name === n)
    if (fallback) return fallback
    throw new Error(`Skill「${n}」不存在`)
  },
  skills_check() {
    const data = scanLocalSkillsFallback()
    return {
      total: data.skills.length,
      ready: (data.eligible || []).length,
      missingDeps: (data.missingRequirements || []).length,
      skills: data.skills,
    }
  },
  skills_install_dep({ kind, spec }) {
    const cmds = {
      brew: `brew install ${spec?.formula || ''}`,
      node: `npm install -g ${spec?.package || ''}`,
      go: `go install ${spec?.module || ''}`,
      uv: `uv tool install ${spec?.package || ''}`,
    }
    const cmd = cmds[kind]
    if (!cmd) throw new Error(`不支持的安装类型: ${kind}`)
    try {
      const out = execSync(cmd, { encoding: 'utf8', timeout: 120000 })
      return { success: true, output: out.trim() }
    } catch (e) {
      throw new Error(`安装失败: ${e.message || e}`)
    }
  },
  skills_uninstall({ name, agent_id } = {}) {
    const safeName = validateOpenClawSkillDeleteName(name)
    const agentDir = resolveAgentSkillsDir(agent_id)
    const baseDir = agentDir || path.join(OPENCLAW_DIR, 'skills')
    const skillDir = path.join(baseDir, safeName)
    assertSafeOpenClawSkillPath(skillDir, [baseDir])
    if (!fs.existsSync(skillDir)) throw new Error(`Skill「${safeName}」不存在`)
    fs.rmSync(skillDir, { recursive: true, force: true })
    return { success: true, name: safeName }
  },
  // SkillHub SDK（内置 HTTP，不依赖 CLI）
  async skillhub_search({ query, limit }) {
    return await skillhubSdk.search(query, limit || 20)
  },
  async skillhub_index() {
    return await skillhubSdk.fetchIndex()
  },
  async skillhub_install({ slug, agent_id } = {}) {
    const agentDir = resolveAgentSkillsDir(agent_id)
    const skillsDir = agentDir || path.join(OPENCLAW_DIR, 'skills')
    if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true })
    const installedPath = await skillhubSdk.install(slug, skillsDir)
    return { success: true, slug, path: installedPath }
  },

  // 设备配对 + Gateway 握手
  auto_pair_device() {
    const originsChanged = patchGatewayOrigins()
    const { deviceId, publicKey } = getOrCreateDeviceKey()
    if (!fs.existsSync(DEVICES_DIR)) fs.mkdirSync(DEVICES_DIR, { recursive: true })
    let paired = {}
    if (fs.existsSync(PAIRED_PATH)) paired = JSON.parse(fs.readFileSync(PAIRED_PATH, 'utf8'))
    const platform = openclawGatewayPlatform()
    if (paired[deviceId]) {
      if (paired[deviceId].platform !== platform) {
        paired[deviceId].platform = platform
        paired[deviceId].deviceFamily = 'desktop'
        fs.writeFileSync(PAIRED_PATH, JSON.stringify(paired, null, 2))
        return { message: '设备已配对（已修正平台字段）', changed: true }
      }
      return { message: '设备已配对', changed: originsChanged }
    }
    const nowMs = Date.now()
    paired[deviceId] = {
      deviceId, publicKey, platform, deviceFamily: 'desktop',
      clientId: 'openclaw-control-ui', clientMode: 'ui',
      role: 'operator', roles: ['operator'],
      scopes: SCOPES, approvedScopes: SCOPES, tokens: {},
      createdAtMs: nowMs, approvedAtMs: nowMs,
    }
    fs.writeFileSync(PAIRED_PATH, JSON.stringify(paired, null, 2))
    return { message: '设备配对成功', changed: true }
  },

  check_pairing_status() {
    if (!fs.existsSync(DEVICE_KEY_FILE)) return { paired: false }
    const keyData = JSON.parse(fs.readFileSync(DEVICE_KEY_FILE, 'utf8'))
    if (!fs.existsSync(PAIRED_PATH)) return { paired: false }
    const paired = JSON.parse(fs.readFileSync(PAIRED_PATH, 'utf8'))
    return { paired: !!paired[keyData.deviceId] }
  },

  create_connect_frame({ nonce, gatewayToken }) {
    const { deviceId, publicKey, privateKey } = getOrCreateDeviceKey()
    const signedAt = Date.now()
    const platform = openclawGatewayPlatform()
    const minProtocolVersion = 3
    const maxProtocolVersion = 4
    const scopesStr = SCOPES.join(',')
    const payloadStr = `v3|${deviceId}|openclaw-control-ui|ui|operator|${scopesStr}|${signedAt}|${gatewayToken || ''}|${nonce || ''}|${platform}|desktop`
    const signature = crypto.sign(null, Buffer.from(payloadStr), privateKey)
    const sigB64 = Buffer.from(signature).toString('base64url')
    const idHex = (signedAt & 0xFFFFFFFF).toString(16).padStart(8, '0')
    const rndHex = Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0')
    return {
      type: 'req',
      id: `connect-${idHex}-${rndHex}`,
      method: 'connect',
      params: {
        minProtocol: minProtocolVersion, maxProtocol: maxProtocolVersion,
        client: { id: 'openclaw-control-ui', version: PANEL_VERSION, platform, deviceFamily: 'desktop', mode: 'ui' },
        role: 'operator', scopes: SCOPES, caps: ['tool-events'],
        auth: { token: gatewayToken || '' },
        device: { id: deviceId, publicKey, signedAt, nonce: nonce || '', signature: sigB64 },
        locale: 'zh-CN', userAgent: `ClawPanel/${PANEL_VERSION} (web)`,
      },
    }
  },
  // 数据目录 & 图片存储
  assistant_ensure_data_dir() {
    const dataDir = path.join(OPENCLAW_DIR, 'clawpanel')
    for (const sub of ['images', 'sessions', 'cache']) {
      const dir = path.join(dataDir, sub)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }
    return dataDir
  },

  assistant_save_image({ id, data }) {
    const dir = path.join(OPENCLAW_DIR, 'clawpanel', 'images')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const pureB64 = data.includes(',') ? data.split(',')[1] : data
    const ext = data.startsWith('data:image/png') ? 'png'
      : data.startsWith('data:image/gif') ? 'gif'
      : data.startsWith('data:image/webp') ? 'webp' : 'jpg'
    const filepath = path.join(dir, `${id}.${ext}`)
    fs.writeFileSync(filepath, Buffer.from(pureB64, 'base64'))
    return filepath
  },

  assistant_load_image({ id }) {
    const dir = path.join(OPENCLAW_DIR, 'clawpanel', 'images')
    for (const ext of ['jpg', 'png', 'gif', 'webp', 'jpeg']) {
      const filepath = path.join(dir, `${id}.${ext}`)
      if (fs.existsSync(filepath)) {
        const bytes = fs.readFileSync(filepath)
        const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        return `data:${mime};base64,${bytes.toString('base64')}`
      }
    }
    throw new Error(`图片 ${id} 不存在`)
  },

  hermes_load_media_image({ path: mediaPath }) {
    return readHermesMediaImageDataUrl(mediaPath)
  },

  assistant_delete_image({ id }) {
    const dir = path.join(OPENCLAW_DIR, 'clawpanel', 'images')
    for (const ext of ['jpg', 'png', 'gif', 'webp', 'jpeg']) {
      const filepath = path.join(dir, `${id}.${ext}`)
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath)
    }
    return null
  },

  ocr_get_config() {
    const root = readOcrConfig()
    const resDir = ocrResourcesDir()
    return {
      ...root,
      runtimeDir: path.join(resDir, root.ocr?.runtimePath || 'runtime/ocr'),
      languageDir: path.join(resDir, root.ocr?.languagePath || 'runtime/ocr/tessdata'),
    }
  },

  ocr_set_enabled({ enabled } = {}) {
    const resDir = ocrResourcesDir()
    const configPath = path.join(resDir, 'data', 'ocr', 'ocr-config.json')
    const root = readOcrConfig()
    root.ocr = root.ocr || {}
    root.ocr.enabled = !!enabled
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(root, null, 2))
    return handlers.ocr_get_config()
  },

  ocr_extract_text(request = {}) {
    return runOcrRunner(request)
  },

  // === AI 助手工具（Web 模式真实执行） ===

  assistant_exec({ command, cwd }) {
    if (!command) throw new Error('命令不能为空')
    // 安全限制：禁止危险命令
    const dangerous = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'format ', 'del /f /s /q C:']
    if (dangerous.some(d => command.includes(d))) throw new Error('危险命令已被拦截')
    const opts = { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true }
    if (cwd) opts.cwd = cwd
    try {
      const output = execSync(command, opts).toString()
      writeAgentToolLog({ agent: 'assistant', title: 'assistant_exec', command, cwd: opts.cwd || appRootDir(), stdout: output, stderr: '', exitCode: 0 })
      return output || '（命令已执行，无输出）'
    } catch (e) {
      const stderr = e.stderr?.toString() || ''
      const stdout = e.stdout?.toString() || ''
      writeAgentToolLog({ agent: 'assistant', title: 'assistant_exec', command, cwd: opts.cwd || appRootDir(), stdout, stderr, exitCode: e.status || 1 })
      return `退出码: ${e.status || 1}\n${stdout}${stderr ? '\n[stderr] ' + stderr : ''}`
    }
  },

  assistant_read_file({ path: filePath }) {
    if (!filePath) throw new Error('路径不能为空')
    const expanded = filePath.startsWith('~/') ? path.join(homedir(), filePath.slice(2)) : filePath
    if (!fs.existsSync(expanded)) throw new Error(`文件不存在: ${filePath}`)
    const stat = fs.statSync(expanded)
    if (stat.size > 1024 * 1024) throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，最大 1MB`)
    return fs.readFileSync(expanded, 'utf8')
  },

  assistant_write_file({ path: filePath, content }) {
    if (!filePath) throw new Error('路径不能为空')
    const expanded = filePath.startsWith('~/') ? path.join(homedir(), filePath.slice(2)) : filePath
    const dir = path.dirname(expanded)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(expanded, content || '')
    return `已写入 ${filePath} (${Buffer.byteLength(content || '', 'utf8')} 字节)`
  },

  assistant_list_dir({ path: dirPath }) {
    if (!dirPath) throw new Error('路径不能为空')
    const expanded = dirPath.startsWith('~/') ? path.join(homedir(), dirPath.slice(2)) : dirPath
    if (!fs.existsSync(expanded)) throw new Error(`目录不存在: ${dirPath}`)
    const entries = fs.readdirSync(expanded, { withFileTypes: true })
    return entries.map(e => {
      if (e.isDirectory()) return `[DIR]  ${e.name}/`
      try {
        const stat = fs.statSync(path.join(expanded, e.name))
        const size = stat.size < 1024 ? `${stat.size} B` : stat.size < 1048576 ? `${(stat.size / 1024).toFixed(1)} KB` : `${(stat.size / 1048576).toFixed(1)} MB`
        return `[FILE] ${e.name} (${size})`
      } catch {
        return `[FILE] ${e.name}`
      }
    }).join('\n') || '（空目录）'
  },

  assistant_open_path({ path: targetPath }) {
    if (!targetPath) throw new Error('路径不能为空')
    const expanded = targetPath.startsWith('~/') ? path.join(homedir(), targetPath.slice(2)) : targetPath
    if (!fs.existsSync(expanded)) throw new Error(`路径不存在: ${targetPath}`)
    const opener = process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open'
    const child = spawn(opener, [expanded], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()
    return `已打开 ${targetPath}`
  },

  assistant_system_info() {
    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
    const arch = process.arch
    const home = homedir()
    const hostname = os.hostname()
    const shell = process.platform === 'win32' ? 'powershell / cmd' : (process.env.SHELL || '/bin/bash')
    const sep = path.sep
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1)
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1)
    const cpus = os.cpus()
    const cpuModel = cpus[0]?.model || '未知'
    const lines = [
      `OS: ${platform}`,
      `Arch: ${arch}`,
      `Home: ${home}`,
      `Hostname: ${hostname}`,
      `Shell: ${shell}`,
      `Path separator: ${sep}`,
      `CPU: ${cpuModel} (${cpus.length} 核)`,
      `Memory: ${freeMem}GB free / ${totalMem}GB total`,
    ]
    // Node.js 版本
    try {
      const nodeVer = execSync('node --version 2>&1', { windowsHide: true }).toString().trim()
      lines.push(`Node.js: ${nodeVer}`)
    } catch {}
    return lines.join('\n')
  },

  assistant_list_processes({ filter }) {
    try {
      if (isWindows) {
        const cmd = filter
          ? `tasklist /FI "IMAGENAME eq ${filter}*" /FO CSV /NH 2>nul`
          : 'tasklist /FO CSV /NH 2>nul | more +1'
        const output = execSync(cmd, { timeout: 5000, windowsHide: true }).toString().trim()
        return output || '（无匹配进程）'
      } else {
        const cmd = filter
          ? `ps aux | head -1 && ps aux | grep -i "${filter}" | grep -v grep`
          : 'ps aux | head -20'
        const output = execSync(cmd, { timeout: 5000 }).toString().trim()
        return output || '（无匹配进程）'
      }
    } catch (e) {
      return e.stdout?.toString() || '（无匹配进程）'
    }
  },

  assistant_check_port({ port }) {
    if (!port) throw new Error('端口号不能为空')
    try {
      if (isWindows) {
        const output = execSync(`netstat -ano | findstr :${port}`, { timeout: 5000, windowsHide: true }).toString().trim()
        return output ? `端口 ${port} 已被占用（正在监听）\n${output}` : `端口 ${port} 未被占用（空闲）`
      } else {
        const output = execSync(`ss -tlnp 'sport = :${port}' 2>/dev/null || lsof -i :${port} 2>/dev/null`, { timeout: 5000 }).toString().trim()
        // ss 输出第一行是表头，需要检查是否有第二行
        const lines = output.split('\n').filter(l => l.trim())
        if (lines.length > 1 || output.includes(`:${port}`)) {
          return `端口 ${port} 已被占用（正在监听）\n${output}`
        }
        return `端口 ${port} 未被占用（空闲）`
      }
    } catch {
      return `端口 ${port} 未被占用（空闲）`
    }
  },

  // === AI 助手联网搜索工具 ===

  async assistant_web_search({ query, max_results = 5 }) {
    if (!query) throw new Error('搜索关键词不能为空')
    try {
      // 使用 DuckDuckGo HTML 搜索
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const https = require('https')
      const http = require('http')
      const fetchModule = url.startsWith('https') ? https : http
      const html = await new Promise((resolve, reject) => {
        const req = fetchModule.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 10000 }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // 跟随重定向
            const rUrl = res.headers.location.startsWith('http') ? res.headers.location : `https://html.duckduckgo.com${res.headers.location}`
            fetchModule.get(rUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res2) => {
              let d = ''; res2.on('data', c => d += c); res2.on('end', () => resolve(d))
            }).on('error', reject)
            return
          }
          let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(data))
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('搜索超时')) })
      })

      // 解析搜索结果
      const results = []
      const regex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
      let match
      while ((match = regex.exec(html)) !== null && results.length < max_results) {
        const rawUrl = match[1]
        const title = match[2].replace(/<[^>]+>/g, '').trim()
        const snippet = match[3].replace(/<[^>]+>/g, '').trim()
        // DuckDuckGo 的 URL 需要解码
        let finalUrl = rawUrl
        try {
          const uddg = new URL(rawUrl, 'https://duckduckgo.com').searchParams.get('uddg')
          if (uddg) finalUrl = decodeURIComponent(uddg)
        } catch {}
        if (title && finalUrl) {
          results.push({ title, url: finalUrl, snippet })
        }
      }

      if (results.length === 0) {
        return `搜索「${query}」未找到相关结果。`
      }

      let output = `搜索「${query}」找到 ${results.length} 条结果：\n\n`
      results.forEach((r, i) => {
        output += `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}\n\n`
      })
      return output
    } catch (err) {
      return `搜索失败: ${err.message}。请检查网络连接。`
    }
  },

  async assistant_fetch_url({ url }) {
    if (!url) throw new Error('URL 不能为空')
    if (!url.startsWith('http://') && !url.startsWith('https://')) throw new Error('URL 必须以 http:// 或 https:// 开头')
    return fetchReadableUrlContent(url)
  },

  // === 面板配置（Web 模式） ===

  get_openclaw_dir() {
    const panelConfig = readPanelConfig()
    const info = applyOpenclawPathConfig(panelConfig)
    return {
      path: info.path,
      isCustom: info.isCustom,
      configExists: fs.existsSync(CONFIG_PATH),
    }
  },

  read_panel_config() {
    return readPanelConfig()
  },

  write_panel_config({ config }) {
    const nextConfig = config && typeof config === 'object' ? { ...config } : {}
    if (typeof nextConfig.openclawDir === 'string') {
      const trimmed = nextConfig.openclawDir.trim()
      if (trimmed) nextConfig.openclawDir = trimmed
      else delete nextConfig.openclawDir
    } else if (nextConfig.openclawDir == null) {
      delete nextConfig.openclawDir
    }
    for (const key of ['dockerEndpoint', 'dockerDefaultImage']) {
      if (typeof nextConfig[key] === 'string') {
        const trimmed = nextConfig[key].trim()
        if (trimmed) nextConfig[key] = trimmed
        else delete nextConfig[key]
      } else if (nextConfig[key] == null) {
        delete nextConfig[key]
      }
    }
    const cfgPath = panelConfigFilePath()
    const panelDir = path.dirname(cfgPath)
    if (!fs.existsSync(panelDir)) fs.mkdirSync(panelDir, { recursive: true })
    fs.writeFileSync(cfgPath, JSON.stringify(nextConfig, null, 2))
    invalidateConfigCache()
    applyOpenclawPathConfig(nextConfig)
    return true
  },

  test_proxy({ url }) {
    const cfg = readPanelConfig()
    const proxyUrl = cfg?.networkProxy?.url
    if (!proxyUrl) throw new Error('未配置代理地址')
    return { ok: true, status: 200, elapsed_ms: 0, proxy: proxyUrl, target: url || 'N/A (Web模式不支持代理测试)' }
  },

  // === Agent 管理（Web 模式） ===

  add_agent({ name, model, workspace }) {
    if (!name) throw new Error('Agent 名称不能为空')
    const cfg = readOpenclawConfigRequired()
    const agentsList = ensureAgentsList(cfg)
    if (agentsList.some(a => (a?.id || 'main').trim() === name)) throw new Error(`Agent "${name}" 已存在`)

    const agentDir = path.join(OPENCLAW_DIR, 'agents', name)
    const workspacePath = expandHomePath(workspace || null) || path.join(agentDir, 'workspace')
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true })
    if (!fs.existsSync(workspacePath)) fs.mkdirSync(workspacePath, { recursive: true })

    const entry = { id: name, workspace: workspacePath }
    if (model) entry.model = { primary: model }
    agentsList.push(entry)

    writeOpenclawConfigFile(cfg)
    triggerGatewayReloadNonBlocking('add_agent')
    return handlers.list_agents()
  },

  delete_agent({ id }) {
    if (!id || id === 'main') throw new Error('不能删除默认 Agent')
    const cfg = readOpenclawConfigRequired()
    const agentDir = resolveAgentDir(cfg, id)
    const agentsList = ensureAgentsList(cfg)
    const before = agentsList.length
    cfg.agents.list = agentsList.filter(a => (a?.id || 'main').trim() !== id)
    if (before === cfg.agents.list.length) throw new Error(`Agent "${id}" 不存在`)
    if (cfg.agents?.profiles && typeof cfg.agents.profiles === 'object') delete cfg.agents.profiles[id]

    writeOpenclawConfigFile(cfg)
    if (fs.existsSync(agentDir)) fs.rmSync(agentDir, { recursive: true, force: true })
    triggerGatewayReloadNonBlocking('delete_agent')
    return true
  },

  update_agent_identity({ id, name, emoji }) {
    if (!id) throw new Error('Agent ID 不能为空')
    const config = readOpenclawConfigRequired()
    const agentsList = ensureAgentsList(config)

    let agent = agentsList.find(a => (a.id || 'main').trim() === id)
    if (!agent) {
      // 不存在则新建条目
      agent = { id }
      agentsList.push(agent)
    }
    if (!agent.identity || typeof agent.identity !== 'object') agent.identity = {}
    if (name !== undefined) {
      if (name) agent.identity.name = name
      else delete agent.identity.name
    }
    if (emoji !== undefined) {
      if (emoji) agent.identity.emoji = emoji
      else delete agent.identity.emoji
    }
    if (!Object.keys(agent.identity).length) delete agent.identity

    writeOpenclawConfigFile(config)

    const identityFile = path.join(resolveAgentWorkspace(config, id), 'IDENTITY.md')
    if (fs.existsSync(identityFile)) {
      try { fs.unlinkSync(identityFile) } catch {}
    }

    triggerGatewayReloadNonBlocking('update_agent_identity')
    return true
  },

  update_agent_model({ id, model }) {
    if (!id) throw new Error('Agent ID 不能为空')
    const config = readOpenclawConfigRequired()
    const agentsList = ensureAgentsList(config)

    let agent = agentsList.find(a => (a.id || 'main').trim() === id)
    if (!agent) {
      agent = { id }
      agentsList.push(agent)
    }
    if (model) agent.model = { primary: model }
    else delete agent.model

    writeOpenclawConfigFile(config)
    triggerGatewayReloadNonBlocking('update_agent_model')
    return true
  },

  backup_agent({ id }) {
    if (!id) throw new Error('Agent ID 不能为空')
    const cfg = readOpenclawConfigOptional()
    const primaryDir = id === 'main' ? resolveAgentWorkspace(cfg, id) : resolveAgentDir(cfg, id)
    const fallbackDir = resolveAgentWorkspace(cfg, id)
    const sourceDir = fs.existsSync(primaryDir) ? primaryDir : fallbackDir
    if (!fs.existsSync(sourceDir)) return '工作区为空，无需备份'
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const name = `agent-${id}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.tar`
    const archivePath = path.join(BACKUPS_DIR, name)
    try {
      execSync(`tar -cf "${archivePath}" -C "${sourceDir}" .`, { timeout: 30000 })
      return archivePath
    } catch (e) {
      throw new Error('备份失败: ' + (e.message || e))
    }
  },

  // === 初始设置工具（Web 模式） ===

  check_node_at_path({ nodeDir }) {
    const nodeBin = path.join(nodeDir, isWindows ? 'node.exe' : 'node')
    if (!fs.existsSync(nodeBin)) throw new Error(`未在 ${nodeDir} 找到 node`)
    try {
      const ver = execSync(`"${nodeBin}" --version 2>&1`, { timeout: 5000, windowsHide: true }).toString().trim()
      return { installed: true, version: ver, path: nodeBin }
    } catch (e) {
      throw new Error('node 检测失败: ' + e.message)
    }
  },

  scan_node_paths() {
    const results = []
    const candidates = isWindows
      ? ['C:\\Program Files\\nodejs', 'C:\\Program Files (x86)\\nodejs']
      : ['/usr/local/bin', '/usr/bin', '/opt/homebrew/bin', path.join(homedir(), '.nvm/versions/node'), path.join(homedir(), '.volta/bin')]
    for (const p of candidates) {
      const nodeBin = path.join(p, isWindows ? 'node.exe' : 'node')
      if (fs.existsSync(nodeBin)) {
        try {
          const ver = execSync(`"${nodeBin}" --version 2>&1`, { timeout: 5000, windowsHide: true }).toString().trim()
          results.push({ path: p, version: ver })
        } catch {}
      }
    }
    return results
  },

  scan_openclaw_paths() {
    return scanAllOpenclawInstallations()
  },

  check_openclaw_at_path({ cliPath }) {
    const resolved = resolveOpenclawCliInput(cliPath)
    if (!resolved) {
      return { installed: false, path: null, version: null, source: null }
    }
    return {
      installed: true,
      path: resolved,
      version: readVersionFromInstallation(resolved),
      source: classifyCliSource(resolved) || 'unknown',
    }
  },

  save_custom_node_path({ nodeDir }) {
    const cfg = readPanelConfig()
    cfg.customNodePath = nodeDir
    if (!fs.existsSync(OPENCLAW_DIR)) fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
    fs.writeFileSync(panelConfigFilePath(), JSON.stringify(cfg, null, 2))
    invalidateConfigCache()
    return true
  },

  // === 访问密码认证 ===
  auth_check() {
    const pw = getAccessPassword()
    return { required: !!pw, authenticated: false /* 由中间件覆写 */ }
  },
  auth_login() { throw new Error('由中间件处理') },
  auth_logout() { throw new Error('由中间件处理') },
  auth_set_password({ password }) {
    const cfg = readPanelConfig()
    cfg.accessPassword = password || ''
    fs.writeFileSync(panelConfigFilePath(), JSON.stringify(cfg, null, 2))
    // 清除所有 session（密码变更后强制重新登录）
    _sessions.clear()
    return true
  },

  async check_panel_update() {
    const sources = [
      { api: 'https://api.github.com/repos/qingchencloud/clawpanel/releases/latest', releases: 'https://github.com/qingchencloud/clawpanel/releases', name: 'github' },
      { api: 'https://gitee.com/api/v5/repos/QtCodeCreators/clawpanel/releases/latest', releases: 'https://gitee.com/QtCodeCreators/clawpanel/releases', name: 'gitee' },
    ]
    let lastErr = ''
    for (const src of sources) {
      try {
        const resp = await globalThis.fetch(src.api, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'ClawPanel' },
        })
        if (!resp.ok) { lastErr = `${src.name}: HTTP ${resp.status}`; continue }
        const json = await resp.json()
        const tag = (json.tag_name || '').replace(/^v/, '').trim()
        if (!tag) { lastErr = `${src.name}: 未找到版本号`; continue }
        return { latest: tag, url: json.html_url || src.releases, source: src.name, downloadUrl: 'https://claw.qt.cool' }
      } catch (e) { lastErr = `${src.name}: ${e.message}`; continue }
    }
    return { latest: null, url: 'https://github.com/qingchencloud/clawpanel/releases', error: lastErr }
  },

  write_env_file({ path: p, config }) {
    const expanded = p.startsWith('~/') ? path.join(homedir(), p.slice(2)) : p
    if (!expanded.startsWith(OPENCLAW_DIR)) throw new Error(`只允许写入 ${OPENCLAW_DIR} 下的文件`)
    const dir = path.dirname(expanded)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(expanded, config)
    return true
  },

  // =========================================================================
  // Hermes Agent 命令
  // =========================================================================

  check_python() {
    const result = { platform: isWindows ? 'win-x64' : isMac ? 'mac-arm64' : 'linux-x64' }
    const candidates = isWindows
      ? [['py', ['-3', '--version']], ['python', ['--version']], ['python3', ['--version']]]
      : [['python3', ['--version']], ['python', ['--version']]]
    let found = false
    for (const [cmd, args] of candidates) {
      const r = runHermesSilent(cmd, args)
      if (r.ok) {
        const m = r.stdout.match(/(\d+)\.(\d+)\.(\d+)/)
        if (m) {
          const [, maj, min, pat] = m.map(Number)
          result.installed = true
          result.version = `${maj}.${min}.${pat}`
          result.versionOk = maj >= 3 && min >= 11
          result.pythonCmd = cmd
          result.path = findCommandPath(cmd)
          found = true
          break
        }
      }
    }
    if (!found) {
      result.installed = false; result.version = null; result.versionOk = false; result.path = null; result.pythonCmd = null
    }
    result.hasPip = runHermesSilent('pip', ['--version']).ok || runHermesSilent('pip3', ['--version']).ok
    result.hasPipx = runHermesSilent('pipx', ['--version']).ok
    const uvPath = path.join(uvBinDir(), isWindows ? 'uv.exe' : 'uv')
    result.hasUv = fs.existsSync(uvPath) || runHermesSilent('uv', ['--version']).ok
    result.hasGit = runHermesSilent('git', ['--version']).ok
    result.hasBrew = !isWindows && runHermesSilent('brew', ['--version']).ok
    return result
  },

  async check_hermes() {
    const home = hermesHome()
    const result = {}
    // 1. 检测 hermes CLI
    let r = runHermesSilent('hermes', ['version'])
    if (!r.ok) r = runHermesSilent('hermes', ['--version'])
    if (r.ok) {
      const verMatch = r.stdout.split(/\s+/).find(s => /^v?\d/.test(s)) || r.stdout
      result.installed = true
      result.version = verMatch.replace(/^v/, '')
      result.path = hermesBundledExecutable()
    } else {
      result.installed = false; result.version = null; result.path = null
    }
    // 2. managed
    const managed = process.env.HERMES_MANAGED
    if (managed) {
      const l = managed.trim().toLowerCase()
      result.managed = ['true','1','yes','nix','nixos'].includes(l) ? 'NixOS' : ['brew','homebrew'].includes(l) ? 'Homebrew' : 'unknown'
    } else {
      result.managed = fs.existsSync(path.join(home, '.managed')) ? 'NixOS' : null
    }
    // 3. 配置文件
    const configPath = path.join(home, 'config.yaml')
    const envPath = path.join(home, '.env')
    result.configExists = fs.existsSync(configPath)
    result.envExists = fs.existsSync(envPath)
    result.hermesHome = home
    // 4. 读取 model
    try {
      const content = fs.readFileSync(configPath, 'utf8')
      let inModel = false
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('model:')) {
          const val = trimmed.slice(6).trim().replace(/^["']|["']$/g, '')
          if (val) { result.model = val; break }
          inModel = true; continue
        }
        if (inModel) {
          if (!/^\s/.test(line) && trimmed) break
          if (trimmed.startsWith('default:')) {
            result.model = trimmed.slice(8).trim().replace(/^["']|["']$/g, '')
          }
        }
      }
    } catch {}
    // 5. Gateway 运行检测
    const port = hermesGatewayPort()
    const gwUrl = hermesGatewayUrl()
    let gatewayRunning = false
    try {
      const sock = new net.Socket()
      gatewayRunning = await new Promise(resolve => {
        sock.setTimeout(800)
        sock.connect(port, '127.0.0.1', () => { sock.destroy(); resolve(true) })
        sock.on('error', () => { sock.destroy(); resolve(false) })
        sock.on('timeout', () => { sock.destroy(); resolve(false) })
      })
    } catch { gatewayRunning = false }
    result.gatewayRunning = gatewayRunning
    result.gatewayPort = port
    result.gatewayUrl = gwUrl
    // Portable/dev fallback: if a bundled config exists or the gateway is already
    // healthy, do not send the UI back to the first-run installer just because
    // `hermes version` is not on PATH.
    if (!result.installed && (result.configExists || gatewayRunning)) {
      result.installed = true
      result.version = gatewayRunning ? 'gateway' : 'bundled'
      result.path = result.path || null
      result.managed = result.managed || 'portable'
    }
    return result
  },

  async install_hermes({ method = 'uv-tool', extras = [] } = {}) {
    // Step 0: 检查预部署 bundle（开箱即用模式）
    if (setupFromBundle()) {
      const result = runHermesSilent('hermes', ['version'])
      const ver = result.ok ? result.output.trim() : 'bundled'
      console.log(`✅ 检测到预部署组件，Hermes Agent ${ver} 就绪`)
      return ver
    }

    // 1. 查找 uv
    const uvPath = path.join(uvBinDir(), isWindows ? 'uv.exe' : 'uv')
    let uv = fs.existsSync(uvPath) ? uvPath : null
    if (!uv && runHermesSilent('uv', ['--version']).ok) uv = 'uv'
    // 1b. 检查内置 uv 包（Dev: src-tauri/resources/，便携: 根目录 resources/）
    if (!uv) {
      const bundledZip = bundledUvArchivePath()
      if (fs.existsSync(bundledZip)) {
        console.log(`📦 发现内置 uv 包: ${bundledZip}`)
        const binDir = uvBinDir()
        fs.mkdirSync(binDir, { recursive: true })
        if (isWindows) {
          const psCmd = `Expand-Archive -Path '${bundledZip}' -DestinationPath '${binDir}' -Force`
          const psResult = spawnSync('powershell', ['-Command', psCmd], { timeout: 30000, windowsHide: true })
          if (psResult.status === 0 && fs.existsSync(uvPath)) {
            uv = uvPath
            console.log(`✓ uv 已从内置资源解压: ${uvPath}`)
          } else {
            console.warn(`⚠️ 内置资源解压失败: ${(psResult.stderr || '').trim()}`)
          }
        } else {
          const tarResult = spawnSync('tar', ['-xzf', bundledZip, '-C', binDir], { timeout: 30000 })
          if (tarResult.status === 0 && fs.existsSync(uvPath)) {
            uv = uvPath
            console.log(`✓ uv 已从内置资源解压: ${uvPath}`)
          } else {
            console.warn(`⚠️ 内置资源解压失败: ${(tarResult.stderr || '').trim()}`)
          }
        }
      }
    }
    // 1c. 检查本地缓存包
    if (!uv) {
      const cacheZip = uvCachedArchivePath()
      if (fs.existsSync(cacheZip)) {
        console.log(`📦 发现本地缓存 uv 包: ${cacheZip}`)
        const binDir = uvBinDir()
        fs.mkdirSync(binDir, { recursive: true })
        if (isWindows) {
          // 使用 PowerShell Expand-Archive 解压（Windows 内置命令）
          const psCmd = `Expand-Archive -Path '${cacheZip}' -DestinationPath '${binDir}' -Force`
          const psResult = spawnSync('powershell', ['-Command', psCmd], { timeout: 30000, windowsHide: true })
          if (psResult.status === 0 && fs.existsSync(uvPath)) {
            uv = uvPath
            console.log(`✓ uv 已从本地缓存解压: ${uvPath}`)
          } else {
            console.warn(`⚠️ 缓存解压失败: ${(psResult.stderr || '').trim()}`)
          }
        } else {
          // Unix: tar -xzf
          const tarResult = spawnSync('tar', ['-xzf', cacheZip, '-C', binDir], { timeout: 30000 })
          if (tarResult.status === 0 && fs.existsSync(uvPath)) {
            uv = uvPath
            console.log(`✓ uv 已从本地缓存解压: ${uvPath}`)
          } else {
            console.warn(`⚠️ 缓存解压失败: ${(tarResult.stderr || '').trim()}`)
          }
        }
      }
    }
    if (!uv) throw new Error('uv 未安装。请先安装 uv (https://docs.astral.sh/uv/) 或使用 Tauri 桌面版自动下载')

    // 确保 web extras 始终包含（gateway 需要 aiohttp）
    if (!extras.includes('web')) {
      console.log('🔌 自动添加 web 扩展（aiohttp，Gateway 必需）')
      extras = [...extras, 'web']
    }

    // 1d. 检查本地 hermes-agent-main.zip（优先使用，避免网络下载）
    let localSource = null
    const bundledZip = bundledHermesArchivePath()
    if (fs.existsSync(bundledZip)) {
      console.log(`📦 发现本地 Hermes Agent 源码包: ${bundledZip}`)
      try {
        localSource = extractHermesZip(bundledZip)
        console.log(`✓ 本地源码包已解压到: ${localSource}`)
      } catch (e) {
        console.warn(`⚠️ 本地源码包解压失败: ${e.message}，将尝试从 GitHub 安装`)
      }
    }

    // 2. 安装
    const sourceUrl = localSource
      ? `file:///${localSource.replace(/\\/g, '/').replace(/^\/+/, '')}`
      : 'git+https://github.com/NousResearch/hermes-agent.git'
    const pkg = extras.length
      ? `hermes-agent[${extras.join(',')}] @ ${sourceUrl}`
      : `hermes-agent @ ${sourceUrl}`
    const env = hermesRuntimeEnv()
    if (!localSource) env.GIT_TERMINAL_PROMPT = '0'
    // 便携模式：设置 UV_TOOL_DIR，使 hermes.exe 安装到 <app_root>/uv-tools/bin/
    fs.mkdirSync(uvToolDir(), { recursive: true })
    env.UV_TOOL_DIR = uvToolDir()
    // 便携模式：设置 HERMES_HOME，使配置文件写到 <app_root>/data/hermes/
    fs.mkdirSync(hermesHome(), { recursive: true })
    env.HERMES_HOME = hermesHome()
    // 便携模式：设置 UV_PYTHON_INSTALL_DIR 并尝试使用本地缓存的 Python 可执行文件
    const _pyDir = prepareUvPythonDir()
    let pythonArg = '3.11'  // 默认用版本号
    if (_pyDir) {
      env.UV_PYTHON_INSTALL_DIR = _pyDir
      const cachedPython = findCachedPython(_pyDir)
      if (cachedPython) {
        pythonArg = cachedPython
        console.log(`[install_hermes] ✓ 使用本地缓存 Python: ${cachedPython}`)
      } else {
        console.log('[install_hermes] ℹ Python 缓存目录已准备，等待 uv 自行下载 Python 3.11...')
      }
    }
    // 限制 HTTP 超时，防止网络问题导致无限挂起
    env.UV_HTTP_TIMEOUT = '120'
    env.UV_CONCURRENT_DOWNLOADS = '4'
    const hasWeb = extras.includes('web')
    const installArgs = method === 'uv-pip'
      ? ['pip', 'install', pkg]
      : ['tool', 'install', '--force', pkg, '--python', pythonArg, '--with', 'croniter', ...(hasWeb ? ['--with', 'aiohttp'] : [])]
    const result = spawnSync(uv, installArgs, {
      env,
      timeout: 600000,
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (result.status !== 0) throw new Error(`安装失败: ${(result.stderr || '').trim()}`)
    // 3. 验证
    const ver = runHermesSilent('hermes', ['version'])
    if (ver.ok) return ver.stdout
    throw new Error('安装完成但验证失败: hermes version 不可用')
  },

  async configure_hermes({ provider, apiKey, model, baseUrl } = {}) {
    const home = hermesHome()
    fs.mkdirSync(home, { recursive: true })
    for (const d of ['cron','sessions','logs','memories','skills','pairing','hooks','image_cache','audio_cache']) {
      fs.mkdirSync(path.join(home, d), { recursive: true })
    }
    const providerName = String(provider || 'custom').trim() || 'custom'
    const lowerProvider = providerName.toLowerCase()
    const modelStr = model || (['minimax', 'minimax-cn'].includes(lowerProvider) ? 'MiniMax-M3' : 'gpt-5.5')
    const baseUrlValue = baseUrl && baseUrl.trim() ? baseUrl.trim().replace(/\/+$/, '') : ''
    const isOpenAiChat = ['custom', 'openai', 'openai-api', 'openrouter', 'deepseek', 'minimax', 'minimax-cn'].includes(lowerProvider)
    const providerLine = `  provider: ${providerName}\n${isOpenAiChat ? '  api_mode: chat_completions\n' : ''}`
    const baseUrlLine = baseUrlValue ? `  base_url: ${baseUrlValue}\n` : ''
    const customProvidersBlock = ''
    // config.yaml
    const configPath = path.join(home, 'config.yaml')
    let configContent
    if (fs.existsSync(configPath)) {
      const existing = fs.readFileSync(configPath, 'utf8')
      configContent = _mergeHermesConfigYaml(existing, modelStr, baseUrlLine, providerLine, customProvidersBlock)
    } else {
      configContent = `# Hermes Agent configuration (managed by ClawPanel)\nmodel:\n  default: ${modelStr}\n${providerLine}${baseUrlLine}platform_toolsets:\n  api_server:\n    - hermes-api-server\nterminal:\n  backend: local\nplatforms:\n  api_server:\n    enabled: true\n${customProvidersBlock}`
    }
    fs.writeFileSync(configPath, configContent)
    // .env
    const envKey = lowerProvider === 'minimax-cn'
      ? 'MINIMAX_CN_API_KEY'
      : lowerProvider === 'minimax'
        ? 'MINIMAX_API_KEY'
        : lowerProvider === 'deepseek'
          ? 'DEEPSEEK_API_KEY'
          : lowerProvider === 'anthropic'
            ? 'ANTHROPIC_API_KEY'
            : lowerProvider === 'openrouter'
              ? 'OPENROUTER_API_KEY'
              : 'OPENAI_API_KEY'
    const baseEnvKey = lowerProvider === 'minimax-cn'
      ? 'MINIMAX_CN_BASE_URL'
      : lowerProvider === 'minimax'
        ? 'MINIMAX_BASE_URL'
        : lowerProvider === 'deepseek'
          ? 'DEEPSEEK_BASE_URL'
          : lowerProvider === 'anthropic'
            ? 'ANTHROPIC_BASE_URL'
            : lowerProvider === 'openrouter'
              ? 'OPENROUTER_BASE_URL'
              : 'OPENAI_BASE_URL'
    const managedKeys = ['OPENAI_API_KEY','ANTHROPIC_API_KEY','OPENROUTER_API_KEY','DEEPSEEK_API_KEY','MINIMAX_API_KEY','MINIMAX_CN_API_KEY','CUSTOM_API_KEY','OPENAI_BASE_URL','ANTHROPIC_BASE_URL','OPENROUTER_BASE_URL','DEEPSEEK_BASE_URL','MINIMAX_BASE_URL','MINIMAX_CN_BASE_URL','CUSTOM_BASE_URL','GATEWAY_ALLOW_ALL_USERS','API_SERVER_KEY']
    const newPairs = [[envKey, apiKey], ['GATEWAY_ALLOW_ALL_USERS', 'true'], ['API_SERVER_KEY', 'clawpanel-local']]
    if (['minimax', 'minimax-cn'].includes(lowerProvider)) {
      newPairs.push(['MINIMAX_API_KEY', apiKey], ['MINIMAX_CN_API_KEY', apiKey])
    }
    if (baseUrlValue) {
      newPairs.push([baseEnvKey, baseUrlValue])
      if (['minimax', 'minimax-cn'].includes(lowerProvider)) {
        newPairs.push(['MINIMAX_BASE_URL', baseUrlValue], ['MINIMAX_CN_BASE_URL', baseUrlValue])
      }
    }
    const envPath = path.join(home, '.env')
    let envContent
    if (fs.existsSync(envPath)) {
      const existing = fs.readFileSync(envPath, 'utf8')
      envContent = _mergeEnvFile(existing, managedKeys, newPairs)
    } else {
      envContent = newPairs.map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
    }
    fs.writeFileSync(envPath, envContent)
    return '配置已保存'
  },

  async hermes_gateway_action({ action } = {}) {
    const port = hermesGatewayPort()
    if (action === 'start') {
      // Guardian: ensure platforms.api_server.enabled:true before start.
      // Mirrors Rust's ensure_api_server_enabled (see hermes.rs).
      try { handlers._hermesEnsureApiServerEnabled() } catch (e) {
        console.warn('[hermes guardian] patch failed:', e.message || e)
      }
      // 检测是否已运行
      const alive = await _tcpProbe('127.0.0.1', port, 300)
      if (alive) {
        const owners = inspectHermesGatewayPortOwners(port)
        if (!isWindows || owners.portablePids.length) return 'Gateway 已在运行'
        if (owners.hermesPids.length) {
          console.warn(`[hermes guardian] replacing non-portable Hermes Gateway on ${port}: PID ${formatPidList(owners.hermesPids)}`)
          for (const pid of owners.hermesPids) killWindowsProcessTree(pid)
          if (!(await waitHermesPortClosed(port))) throw new Error(`Gateway 端口 ${port} 被非便携 Hermes 占用，无法释放`)
        } else if (owners.foreignPids.length) {
          throw new Error(`Gateway 端口 ${port} 被其他进程占用 (PID: ${formatPidList(owners.foreignPids)})`)
        } else {
          throw new Error(`Gateway 端口 ${port} 已占用，但无法确认归属`)
        }
      }
      // 启动
      const home = hermesHome()
      const envVars = hermesRuntimeEnv({ HERMES_HOME: home })
      const envPath = path.join(home, '.env')
      if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
          const t = line.trim()
          if (!t || t.startsWith('#')) continue
          const eq = t.indexOf('=')
          if (eq > 0) envVars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
        }
      }
      const logPath = path.join(home, 'gateway-run.log')
      const logFd = fs.openSync(logPath, 'a')
      const gatewaySpec = hermesCommandSpec(['gateway', 'run'])
      const child = spawn(gatewaySpec.command, gatewaySpec.args, {
        cwd: gatewaySpec.cwd || home,
        env: {
          ...gatewaySpec.env,
          ...envVars,
          PYTHONPATH: gatewaySpec.env.PYTHONPATH || envVars.PYTHONPATH,
          VIRTUAL_ENV: gatewaySpec.env.VIRTUAL_ENV || envVars.VIRTUAL_ENV,
        },
        stdio: ['ignore', logFd, logFd],
        windowsHide: true,
      })
      child.unref()
      _hermesGwProcess = child
      // 等端口可达
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 500))
        if (await _tcpProbe('127.0.0.1', port, 500)) {
          fs.closeSync(logFd)
          return 'Gateway 已启动'
        }
      }
      fs.closeSync(logFd)
      throw new Error('Gateway 启动后端口未就绪')
    }
    if (action === 'stop') {
      if (_hermesGwProcess) { try { _hermesGwProcess.kill() } catch {} _hermesGwProcess = null }
      const r = runHermesSilent('hermes', ['gateway', 'stop'])
      if (isWindows) {
        const owners = inspectHermesGatewayPortOwners(port)
        for (const pid of [...owners.portablePids, ...owners.hermesPids]) killWindowsProcessTree(pid)
        try { spawnSync('taskkill', ['/F', '/IM', 'hermes.exe'], { windowsHide: true, timeout: 5000 }) } catch {}
      }
      return 'Gateway 已停止'
    }
    if (action === 'restart') {
      await handlers.hermes_gateway_action({ action: 'stop' })
      for (let i = 0; i < 20; i++) {
        if (!(await _tcpProbe('127.0.0.1', port, 300))) break
        await new Promise(r => setTimeout(r, 300))
      }
      return await handlers.hermes_gateway_action({ action: 'start' })
    }
    if (action === 'status') {
      const r = runHermesSilent('hermes', ['gateway', 'status'])
      return r.ok ? r.stdout : 'unknown'
    }
    throw new Error(`不支持的操作: ${action}`)
  },

  async _hermesEnsureGatewayReady() {
    const customUrl = hermesGatewayCustomUrl()
    if (customUrl && !isLoopbackGatewayUrl(customUrl)) return
    const port = hermesGatewayPort()
    if (await _tcpProbe('127.0.0.1', port, 300)) {
      const owners = inspectHermesGatewayPortOwners(port)
      if (!isWindows || owners.portablePids.length) return
    }
    await handlers.hermes_gateway_action({ action: 'start' })
  },

  async hermes_health_check() {
    const url = `${hermesGatewayUrl()}/health`
    const resp = await globalThis.fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'ClawPanel-Web' } })
    if (!resp.ok) throw new Error(`Gateway 返回 HTTP ${resp.status}`)
    return await resp.json()
  },

  async hermes_api_proxy({ method, path: reqPath, body, headers: customHeaders } = {}) {
    const url = `${hermesGatewayUrl()}${reqPath}`
    const opts = { method: method || 'GET', headers: { 'User-Agent': 'ClawPanel-Web' } }
    const timeout = (reqPath.includes('/chat/completions') || reqPath.includes('/responses')) ? 120000 : 30000
    opts.signal = AbortSignal.timeout(timeout)
    // Auto-inject API_SERVER_KEY from .env if available
    try {
      const envContent = fs.readFileSync(path.join(hermesHome(), '.env'), 'utf8')
      const m = envContent.match(/^API_SERVER_KEY=(.+)$/m)
      if (m) opts.headers['Authorization'] = `Bearer ${m[1].trim()}`
    } catch {}
    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE')) {
      opts.body = typeof body === 'string' ? body : JSON.stringify(body)
      opts.headers['Content-Type'] = 'application/json'
    }
    if (customHeaders && typeof customHeaders === 'object') {
      for (const [k, v] of Object.entries(customHeaders)) { if (typeof v === 'string') opts.headers[k] = v }
    }
    const resp = await globalThis.fetch(url, opts)
    const text = await resp.text()
    let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
    if (resp.status >= 400) throw new Error(json?.error?.message || json?.error || text)
    return json
  },

  async hermes_agent_run({ input, sessionId, conversationHistory, instructions, attachments, agentName, agent_name } = {}) {
    // Web 模式下简化实现：POST /v1/runs 然后轮询或直接返回
    await handlers._hermesEnsureGatewayReady()
    const gwUrl = hermesGatewayUrl()
    const home = hermesHome()
    let apiKey = ''
    try {
      const envContent = fs.readFileSync(path.join(home, '.env'), 'utf8')
      const m = envContent.match(/^API_SERVER_KEY=(.+)$/m)
      if (m) apiKey = m[1].trim()
    } catch {}
    const effectiveAgentName = resolveAgentIdentityName(agentName || agent_name, 'hermes')
    const payload = { input: _buildHermesRunInput(input, attachments), agentName: effectiveAgentName, agent_name: effectiveAgentName }
    if (sessionId) payload.session_id = sessionId
    const bridgedHistory = Array.isArray(conversationHistory)
      ? conversationHistory
      : _buildHermesConversationHistoryFromSession(sessionId, input || '')
    if (Array.isArray(bridgedHistory)) payload.conversation_history = bridgedHistory
    const effectiveInstructions = withAgentIdentityInstructions(instructions, effectiveAgentName)
    if (effectiveInstructions) payload.instructions = effectiveInstructions
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'ClawPanel-Web' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const resp = await globalThis.fetch(`${gwUrl}/v1/runs`, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) { const t = await resp.text(); throw new Error(`HTTP ${resp.status}: ${t}`) }
    const body = await resp.json()
    return body.run_id || JSON.stringify(body)
  },

  hermes_read_config() {
    const home = hermesHome()
    const configPath = path.join(home, 'config.yaml')
    const envPath = path.join(home, '.env')
    let modelName = '', baseUrl = '', provider = '', apiKey = ''
    try {
      const content = fs.readFileSync(configPath, 'utf8')
      let inModel = false
      for (const line of content.split('\n')) {
        const t = line.trim()
        if (t.startsWith('model:')) {
          inModel = true
          const v = t.slice(6).trim().replace(/^["']|["']$/g, '')
          if (v && !v.includes(':')) modelName = v
          continue
        }
        if (inModel) {
          if (t.startsWith('default:')) modelName = t.slice(8).trim().replace(/^["']|["']$/g, '')
          else if (t.startsWith('base_url:')) baseUrl = t.slice(9).trim().replace(/^["']|["']$/g, '')
          else if (t.startsWith('provider:')) provider = t.slice(9).trim().replace(/^["']|["']$/g, '')
          else if (t && !t.startsWith('#') && !t.startsWith('-') && !/^\s/.test(line)) inModel = false
        }
      }
    } catch {}
    try {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const env = {}
      for (const line of envContent.split('\n')) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const eq = t.indexOf('=')
        if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1)
      }
      const p = String(provider || '').toLowerCase()
      if (p === 'deepseek') apiKey = env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY || apiKey
      else if (p === 'minimax-cn') apiKey = env.MINIMAX_CN_API_KEY || env.MINIMAX_API_KEY || apiKey
      else if (p === 'minimax') apiKey = env.MINIMAX_API_KEY || env.MINIMAX_CN_API_KEY || apiKey
      else if (p === 'anthropic') apiKey = env.ANTHROPIC_API_KEY || apiKey
      else if (p === 'openrouter') apiKey = env.OPENROUTER_API_KEY || apiKey
      else apiKey = env.OPENAI_API_KEY || env.CUSTOM_API_KEY || env.DEEPSEEK_API_KEY || env.ANTHROPIC_API_KEY || env.OPENROUTER_API_KEY || apiKey

      if (!baseUrl) {
        if (p === 'deepseek') baseUrl = env.DEEPSEEK_BASE_URL || env.OPENAI_BASE_URL || ''
        else if (p === 'minimax-cn') baseUrl = env.MINIMAX_CN_BASE_URL || env.MINIMAX_BASE_URL || ''
        else if (p === 'minimax') baseUrl = env.MINIMAX_BASE_URL || env.MINIMAX_CN_BASE_URL || ''
        else if (p === 'anthropic') baseUrl = env.ANTHROPIC_BASE_URL || ''
        else if (p === 'openrouter') baseUrl = env.OPENROUTER_BASE_URL || env.OPENAI_BASE_URL || ''
        else baseUrl = env.OPENAI_BASE_URL || env.DEEPSEEK_BASE_URL || env.ANTHROPIC_BASE_URL || env.OPENROUTER_BASE_URL || ''
      }
    } catch {}
    const displayModel = modelName.includes('/') ? modelName.slice(modelName.indexOf('/') + 1) : modelName
    return { model: displayModel, model_raw: modelName, base_url: baseUrl, provider, api_key: apiKey, config_exists: fs.existsSync(configPath) }
  },

  // Web-mode stub: the authoritative 22-provider registry lives in Rust.
  // Web mode is primarily used for remote admin on headless Linux where
  hermes_list_providers() {
    return [
      {
        id: 'minimax',
        name: 'MiniMax',
        authType: 'api_key',
        baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
        baseUrlEnvVar: 'MINIMAX_BASE_URL',
        apiKeyEnvVars: ['MINIMAX_API_KEY'],
        transport: 'openai_chat',
        modelsProbe: 'openai',
        models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5'],
        isAggregator: false,
        cliAuthHint: '',
      },
      {
        id: 'minimax-cn',
        name: 'MiniMax (CN)',
        authType: 'api_key',
        baseUrl: process.env.MINIMAX_CN_BASE_URL || 'https://api.minimaxi.com/v1',
        baseUrlEnvVar: 'MINIMAX_CN_BASE_URL',
        apiKeyEnvVars: ['MINIMAX_CN_API_KEY'],
        transport: 'openai_chat',
        modelsProbe: 'openai',
        models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5'],
        isAggregator: false,
        cliAuthHint: '',
      },
      {
        id: 'openai-api',
        name: 'OpenAI Compatible',
        authType: 'api_key',
        baseUrl: process.env.OPENAI_BASE_URL || '',
        baseUrlEnvVar: 'OPENAI_BASE_URL',
        apiKeyEnvVars: ['OPENAI_API_KEY', 'CUSTOM_API_KEY'],
        transport: 'openai_chat',
        modelsProbe: 'openai',
        models: [],
        isAggregator: true,
        cliAuthHint: '',
      },
      {
        id: 'custom',
        name: 'Custom OpenAI-Compatible',
        authType: 'api_key',
        baseUrl: '',
        baseUrlEnvVar: 'OPENAI_BASE_URL',
        apiKeyEnvVars: ['OPENAI_API_KEY', 'CUSTOM_API_KEY'],
        transport: 'openai_chat',
        modelsProbe: 'openai',
        models: [],
        isAggregator: true,
        cliAuthHint: '',
      },
    ]
  },

  // -----------------------------------------------------------------------
  // api_server guardian (Step 5) — mirror of Rust's config_has_api_server_enabled
  // + patch_yaml_ensure_api_server + ensure_api_server_enabled. Called before
  // every `hermes gateway run` so that an upgrade / manual edit that drops
  // `platforms.api_server.enabled: true` is auto-healed.
  // -----------------------------------------------------------------------
  _hermesConfigHasApiServerEnabled(raw) {
    let inPlatforms = false
    let inApiServer = false
    for (const origLine of raw.split('\n')) {
      const hash = origLine.indexOf('#')
      const line = hash >= 0 ? origLine.slice(0, hash) : origLine
      const trimmed = line.replace(/\s+$/, '')
      if (!trimmed) continue
      const indent = trimmed.length - trimmed.trimStart().length
      if (indent === 0) {
        inPlatforms = trimmed.trimStart().startsWith('platforms:')
        inApiServer = false
        continue
      }
      if (!inPlatforms) continue
      if (indent <= 2) {
        inApiServer = trimmed.trimStart().startsWith('api_server:')
        continue
      }
      if (!inApiServer) continue
      const t = trimmed.trimStart()
      if (t.startsWith('enabled:')) {
        const v = t.slice(8).trim().replace(/^['"]|['"]$/g, '').toLowerCase()
        return ['true', 'yes', 'on', '1'].includes(v)
      }
    }
    return false
  },

  _hermesPatchYamlEnsureApiServer(raw) {
    if (handlers._hermesConfigHasApiServerEnabled(raw)) return raw
    const lines = raw.split('\n')
    const out = []
    let platformsFound = false
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.replace(/\s+$/, '')
      const indent = trimmed.length - trimmed.trimStart().length
      if (indent === 0 && trimmed.trimStart().startsWith('platforms:')) {
        out.push(line)
        platformsFound = true
        i++
        const accumulated = []
        let skipping = false
        while (i < lines.length) {
          const l = lines[i]
          const t = l.replace(/\s+$/, '')
          const ind = t.length - t.trimStart().length
          if (ind === 0 && t !== '') break
          if (ind <= 2) skipping = t.trimStart().startsWith('api_server:')
          if (!skipping) accumulated.push(l)
          i++
        }
        out.push('  api_server:')
        out.push('    enabled: true')
        out.push(...accumulated)
        continue
      }
      out.push(line)
      i++
    }
    if (!platformsFound) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      out.push('platforms:')
      out.push('  api_server:')
      out.push('    enabled: true')
    }
    let content = out.join('\n')
    if (!content.endsWith('\n')) content += '\n'
    return content
  },

  _hermesEnsureApiServerEnabled() {
    const configPath = path.join(hermesHome(), 'config.yaml')
    if (!fs.existsSync(configPath)) return
    const raw = fs.readFileSync(configPath, 'utf8')
    if (handlers._hermesConfigHasApiServerEnabled(raw)) return
    const ts = Math.floor(Date.now() / 1000)
    const backupPath = configPath + `.bak-${ts}`
    try { fs.writeFileSync(backupPath, raw) } catch {}
    const patched = handlers._hermesPatchYamlEnsureApiServer(raw)
    fs.writeFileSync(configPath, patched)
    console.warn(`[hermes guardian] patched config.yaml (api_server.enabled). Backup: ${backupPath}`)
  },

  // =========================================================================  // =========================================================================
  // .env editor (Step 4) — Web-mode implementations mirroring Rust behavior.
  // The managed-key list is duplicated here since Rust's hermes_providers is
  // not accessible from Node. Keep in sync with
  //   src-tauri/src/commands/hermes_providers.rs::all_managed_env_keys
  // whenever new providers are added to the registry.
  // =========================================================================
  _hermesManagedEnvKeys() {
    return [
      // Anthropic
      'ANTHROPIC_API_KEY', 'ANTHROPIC_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN',
      // Gemini
      'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GEMINI_BASE_URL',
      // DeepSeek
      'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL',
      // Z.AI / GLM
      'GLM_API_KEY', 'ZAI_API_KEY', 'Z_AI_API_KEY', 'GLM_BASE_URL',
      // Kimi
      'KIMI_API_KEY', 'KIMI_BASE_URL',
      // xAI
      'XAI_API_KEY', 'XAI_BASE_URL',
      // MiniMax intl + CN
      'MINIMAX_API_KEY', 'MINIMAX_BASE_URL',
      'MINIMAX_CN_API_KEY', 'MINIMAX_CN_BASE_URL',
      // Alibaba DashScope
      'DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL',
      // Hugging Face
      'HF_TOKEN', 'HF_BASE_URL',
      // Xiaomi
      'XIAOMI_API_KEY', 'XIAOMI_BASE_URL',
      // AI Gateway
      'AI_GATEWAY_API_KEY', 'AI_GATEWAY_BASE_URL',
      // OpenCode Zen + Go
      'OPENCODE_ZEN_API_KEY', 'OPENCODE_ZEN_BASE_URL',
      'OPENCODE_GO_API_KEY', 'OPENCODE_GO_BASE_URL',
      // Kilocode
      'KILOCODE_API_KEY', 'KILOCODE_BASE_URL',
      // Copilot (PAT)
      'COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN',
      // OpenRouter
      'OPENROUTER_API_KEY', 'OPENAI_BASE_URL',
      // Copilot ACP
      'COPILOT_ACP_BASE_URL',
      // Custom placeholder
      'CUSTOM_API_KEY', 'OPENAI_API_KEY',
      // ClawPanel-specific
      'GATEWAY_ALLOW_ALL_USERS', 'API_SERVER_KEY',
    ]
  },

  hermes_env_read_unmanaged() {
    const envPath = path.join(hermesHome(), '.env')
    if (!fs.existsSync(envPath)) return []
    const raw = fs.readFileSync(envPath, 'utf8')
    const managed = new Set(handlers._hermesManagedEnvKeys())
    const seen = new Set()
    const out = []
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const key = t.slice(0, eq).trim()
      if (!key || managed.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push([key, t.slice(eq + 1)])
    }
    return out
  },

  hermes_env_set({ key, value } = {}) {
    key = (key || '').trim()
    if (!key) throw new Error('Key cannot be empty')
    if (!/^[A-Z0-9_]+$/i.test(key)) {
      throw new Error(`Invalid env var key '${key}': only [A-Z0-9_] are allowed`)
    }
    const managed = new Set(handlers._hermesManagedEnvKeys())
    if (managed.has(key)) {
      throw new Error(`'${key}' is managed by ClawPanel; please configure it via the provider setup page`)
    }
    const envPath = path.join(hermesHome(), '.env')
    fs.mkdirSync(path.dirname(envPath), { recursive: true })
    const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
    const lines = raw.split('\n')
    const out = []
    let replaced = false
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) { out.push(line); continue }
      const eq = t.indexOf('=')
      if (eq > 0 && t.slice(0, eq).trim() === key && !replaced) {
        out.push(`${key}=${value == null ? '' : value}`)
        replaced = true
        continue
      }
      out.push(line)
    }
    if (!replaced) out.push(`${key}=${value == null ? '' : value}`)
    let content = out.join('\n')
    if (!content.endsWith('\n')) content += '\n'
    fs.writeFileSync(envPath, content)
    return null
  },

  hermes_env_delete({ key } = {}) {
    key = (key || '').trim()
    if (!key) throw new Error('Key cannot be empty')
    const managed = new Set(handlers._hermesManagedEnvKeys())
    if (managed.has(key)) {
      throw new Error(`'${key}' is managed by ClawPanel; please configure it via the provider setup page`)
    }
    const envPath = path.join(hermesHome(), '.env')
    if (!fs.existsSync(envPath)) return null
    const raw = fs.readFileSync(envPath, 'utf8')
    const lines = raw.split('\n')
    const out = []
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) { out.push(line); continue }
      const eq = t.indexOf('=')
      if (eq > 0 && t.slice(0, eq).trim() === key) continue
      out.push(line)
    }
    let content = out.join('\n')
    if (!content.endsWith('\n')) content += '\n'
    fs.writeFileSync(envPath, content)
    return null
  },

  hermes_env_reveal({ key } = {}) {
    key = (key || '').trim()
    if (!key) throw new Error('Key cannot be empty')
    const envPath = path.join(hermesHome(), '.env')
    if (!fs.existsSync(envPath)) throw new Error('.env not found')
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq > 0 && t.slice(0, eq).trim() === key) return { key, value: t.slice(eq + 1) }
    }
    throw new Error(`${key} not found in .env`)
  },

  hermes_config_raw_read() {
    const configPath = path.join(hermesHome(), 'config.yaml')
    return { yaml: fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '' }
  },

  hermes_config_raw_write({ yamlText } = {}) {
    const configPath = path.join(hermesHome(), 'config.yaml')
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    if (fs.existsSync(configPath)) fs.copyFileSync(configPath, `${configPath}.bak-${Math.floor(Date.now() / 1000)}`)
    fs.writeFileSync(configPath, yamlText || '')
    return { ok: true }
  },

  hermes_voice_config_read() {
    return maskVoiceConfig(readVoiceConfigRaw())
  },

  hermes_voice_config_write({ config } = {}) {
    return writeVoiceConfig(config || {})
  },

  async hermes_voice_transcribe({ audioBase64, mimeType, language } = {}) {
    return voiceTranscribe({ audioBase64, mimeType, language })
  },

  async hermes_voice_synthesize({ text, voice, format } = {}) {
    return voiceSynthesize({ text, voice, format })
  },

  hermes_dashboard_themes() {
    const configPath = path.join(hermesHome(), 'config.yaml')
    const raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : ''
    const active = (raw.match(/^\s*theme:\s*["']?([^"'\n#]+)["']?/m)?.[1] || 'default').trim()
    const themes = [
      { name: 'default', label: 'Default', description: 'Hermes default dashboard theme' },
      { name: 'midnight', label: 'Midnight', description: 'Dark blue dashboard theme' },
      { name: 'ember', label: 'Ember', description: 'Warm dashboard theme' },
      { name: 'mono', label: 'Mono', description: 'Monochrome dashboard theme' },
      { name: 'cyberpunk', label: 'Cyberpunk', description: 'Neon dashboard theme' },
      { name: 'rose', label: 'Rose', description: 'Soft rose dashboard theme' },
    ]
    const dir = path.join(hermesHome(), 'dashboard-themes')
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (!/\.ya?ml$/i.test(file)) continue
        const name = path.basename(file).replace(/\.ya?ml$/i, '')
        if (!themes.some(t => t.name === name)) themes.push({ name, label: name, description: 'User dashboard theme' })
      }
    }
    return { themes, active }
  },

  hermes_dashboard_theme_set({ name } = {}) {
    name = (name || '').trim()
    if (!name) throw new Error('Theme name cannot be empty')
    const configPath = path.join(hermesHome(), 'config.yaml')
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    const raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : ''
    let content
    if (/^dashboard:\s*$/m.test(raw)) {
      content = /^\s+theme:/m.test(raw)
        ? raw.replace(/^(\s+)theme:.*$/m, `$1theme: ${name}`)
        : raw.replace(/^dashboard:\s*$/m, `dashboard:\n  theme: ${name}`)
    } else {
      content = `${raw.replace(/\s*$/, '')}\n\ndashboard:\n  theme: ${name}\n`
    }
    fs.writeFileSync(configPath, content)
    return { ok: true, theme: name }
  },

  hermes_dashboard_plugins() {
    const root = path.join(hermesHome(), 'plugins')
    if (!fs.existsSync(root)) return []
    const out = []
    const seen = new Set()
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name)
      const manifest = path.join(dir, 'dashboard', 'manifest.json')
      if (!fs.existsSync(manifest)) continue
      try {
        const data = JSON.parse(fs.readFileSync(manifest, 'utf8'))
        const id = data.name || name
        if (!id || seen.has(id)) continue
        seen.add(id)
        out.push({
          name: id,
          label: data.label || id,
          description: data.description || '',
          icon: data.icon || 'Puzzle',
          version: data.version || '0.0.0',
          tab: data.tab || { path: `/${id}`, position: 'end' },
          slots: data.slots || [],
          entry: data.entry || 'dist/index.js',
          css: data.css || null,
          has_api: !!data.api,
          source: 'user',
        })
      } catch {}
    }
    return out
  },

  hermes_dashboard_plugins_rescan() {
    return { ok: true, count: handlers.hermes_dashboard_plugins().length }
  },

  async hermes_dashboard_probe() {
    const port = handlers._hermesDashboardPort()
    const running = await _tcpProbe('127.0.0.1', port, 800)
    return { running, port }
  },

  // 共用：解析 dashboard.port（缩进感知，避免误匹配 gateway 块的 port）
  _hermesDashboardPort() {
    let port = 9119
    try {
      const cfg = path.join(hermesHome(), 'config.yaml')
      if (fs.existsSync(cfg)) {
        const raw = fs.readFileSync(cfg, 'utf8')
        let inDashboard = false
        for (const line of raw.split('\n')) {
          const t = line.trim()
          if (!t || t.startsWith('#')) continue
          const indent = line.length - line.trimStart().length
          if (indent === 0) { inDashboard = t === 'dashboard:' || t.startsWith('dashboard:'); continue }
          if (inDashboard && t.startsWith('port:')) {
            const p = parseInt(t.replace(/^port:/, '').trim(), 10)
            if (Number.isFinite(p) && p > 0) { port = p; break }
          }
        }
      }
    } catch {}
    return port
  },

  async hermes_dashboard_start() {
    const port = handlers._hermesDashboardPort()
    // 1. 已运行？
    if (await _tcpProbe('127.0.0.1', port, 500)) {
      return { started: true, already_running: true, port }
    }
    // 2. 清残留 PID
    if (handlers._dashPid) {
      try { process.kill(handlers._dashPid, 'SIGKILL') } catch {}
      handlers._dashPid = 0
    }
    const home = hermesHome()
    const logPath = path.join(home, 'dashboard-run.log')
    let out, err
    try {
      out = fs.openSync(logPath, 'w')
      err = fs.openSync(logPath, 'a')
    } catch (e) {
      throw new Error(`创建日志文件失败: ${e.message || e}`)
    }
    // 注入 .env
    const envVars = hermesRuntimeEnv()
    const envPath = path.join(home, '.env')
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const eq = t.indexOf('=')
        if (eq > 0) envVars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
      }
    }
    const dashboardSpec = hermesCommandSpec(['dashboard'])
    const child = spawn(dashboardSpec.command, dashboardSpec.args, {
      cwd: dashboardSpec.cwd || home,
      env: {
        ...dashboardSpec.env,
        ...envVars,
        PYTHONPATH: dashboardSpec.env.PYTHONPATH || envVars.PYTHONPATH,
        VIRTUAL_ENV: dashboardSpec.env.VIRTUAL_ENV || envVars.VIRTUAL_ENV,
      },
      stdio: ['ignore', out, err],
      windowsHide: true,
    })
    child.unref()
    const pid = child.pid
    handlers._dashPid = pid

    let earlyExitCode = null
    let earlyExitFlag = false
    child.once('exit', (code) => { earlyExitCode = code; earlyExitFlag = true })

    // 3. 等待 - 端口起来 / 进程提前死 / 超时（90s 覆盖首次 npm build）
    const deadline = Date.now() + 90000
    while (Date.now() < deadline) {
      if (earlyExitFlag) {
        handlers._dashPid = 0
        const raw = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
        const tail = raw.split('\n').slice(-40).join('\n')
        const lower = raw.toLowerCase()
        let kind = 'spawn_failed'
        if (lower.includes('web ui dependencies not installed')
          || lower.includes("no module named 'fastapi'")
          || (lower.includes('import error') && lower.includes('fastapi'))) {
          kind = 'deps_missing'
        } else if (lower.includes("no module named 'fcntl'")
          || lower.includes("no module named 'termios'")
          || lower.includes("no module named 'pty'")
          || lower.includes("no module named 'tty'")
          || lower.includes("no module named 'pwd'")
          || lower.includes("no module named 'grp'")) {
          // Hermes 上游 bug: pty_bridge.py / memory_tool.py 在 Windows 上 import POSIX-only 模块
          // https://github.com/NousResearch/hermes-agent/issues/5246
          kind = 'posix_only_module'
        } else if (lower.includes('address already in use')
          || lower.includes('address in use')
          || (lower.includes('port') && lower.includes('already in use'))) {
          kind = 'port_in_use'
        }
        return { started: false, kind, exit_code: earlyExitCode, port, log_tail: tail }
      }
      if (await _tcpProbe('127.0.0.1', port, 300)) {
        return { started: true, already_running: false, port, pid }
      }
      await new Promise(r => setTimeout(r, 500))
    }
    // 超时
    const raw = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
    const tail = raw.split('\n').slice(-40).join('\n')
    return { started: false, kind: 'timeout', port, pid, log_tail: tail }
  },

  async hermes_dashboard_stop() {
    if (!handlers._dashPid) return false
    try {
      if (isWindows) {
        spawnSync('taskkill', ['/F', '/PID', String(handlers._dashPid)], { windowsHide: true })
      } else {
        process.kill(handlers._dashPid, 'SIGKILL')
      }
      handlers._dashPid = 0
      return true
    } catch {
      handlers._dashPid = 0
      return false
    }
  },

  hermes_toolsets_list() {
    const r = runHermesSilent('hermes', ['tools', 'list', '--platform', 'cli'])
    if (r.ok && String(r.stdout || '').trim()) return { raw: r.stdout }
    const defaultOff = new Set(['moa', 'homeassistant', 'spotify', 'discord', 'discord_admin', 'video', 'video_gen', 'x_search'])
    const builtin = [
      ['web', '🔍 Web Search & Scraping (duckduckgo enabled; API-key providers stay disabled)'],
      ['browser', '🌐 Browser Automation'],
      ['terminal', '💻 Terminal & Process Management'],
      ['file', '📁 File IO & Search'],
      ['code_execution', '⚡ Code Execution'],
      ['vision', '👁️ Vision Analysis'],
      ['video', '🎬 Video Analysis'],
      ['video_gen', '🎬 Video Generation'],
      ['x_search', '🐦 X / Twitter Search'],
      ['moa', '🧠 Multi-Agent Collaboration'],
      ['tts', '🔊 Text To Speech'],
      ['skills', '📚 Skill View & Management'],
      ['skills_hub', '📦 Skill Search & Download'],
      ['todo', '📋 Todo Planning'],
      ['memory', '💾 Long-Term Memory'],
      ['session_search', '🔎 Session Search'],
      ['clarify', '❓ Clarifying Questions'],
      ['delegation', '👥 Task Delegation'],
      ['cronjob', '⏰ Cron Jobs'],
      ['messaging', '📨 Cross-Platform Messaging'],
      ['homeassistant', '🏠 Home Assistant'],
      ['spotify', '🎵 Spotify'],
      ['discord', '💬 Discord'],
      ['discord_admin', '🛡️ Discord Admin'],
      ['yuanbao', '🤖 Yuanbao'],
      ['computer_use', '🖱️ Computer Use'],
    ]
    const raw = [
      'Built-in toolsets (cli):',
      ...builtin.map(([name, desc]) => `  ${defaultOff.has(name) ? '✗ disabled' : '✓ enabled'}  ${name}  ${desc}`),
      'Search backends:',
      '  ✓ enabled   duckduckgo  No API key required',
      '  ✗ disabled  exa  API key required',
      '  ✗ disabled  firecrawl  API key required',
      '  ✗ disabled  perplexity  API key required',
      '  ✗ disabled  searxng  endpoint not configured',
      '  ✗ disabled  tavily  API key required',
    ].join('\n')
    return { raw }
  },

  hermes_cron_jobs_list() {
    const jobsPath = path.join(hermesHome(), 'cron', 'jobs.json')
    if (!fs.existsSync(jobsPath)) return []
    return JSON.parse(fs.readFileSync(jobsPath, 'utf8'))
  },

  async hermes_fetch_models({ baseUrl, apiKey, apiType, provider: _provider } = {}) {
    const api = apiType || 'openai'
    let base = baseUrl.replace(/\/+$/, '')
    for (const suffix of ['/chat/completions', '/completions', '/responses', '/messages', '/models']) {
      if (base.endsWith(suffix)) base = base.slice(0, -suffix.length)
    }
    const headers = { 'User-Agent': 'ClawPanel-Web' }
    let url
    if (api.includes('anthropic')) {
      if (!base.endsWith('/v1')) base += '/v1'
      url = `${base}/models`
      headers['anthropic-version'] = '2023-06-01'
      headers['x-api-key'] = apiKey
    } else if (api.includes('google')) {
      url = `${base}/models?key=${apiKey}`
    } else {
      url = `${base}/models`
      headers['Authorization'] = `Bearer ${apiKey}`
    }
    const resp = await globalThis.fetch(url, { headers, signal: AbortSignal.timeout(15000) })
    if (!resp.ok) { const t = await resp.text(); throw new Error(`HTTP ${resp.status}: ${t.slice(0, 200)}`) }
    const data = await resp.json()
    let models
    if (api.includes('google')) {
      models = (data.models || []).map(m => (m.name || '').replace('models/', '')).filter(Boolean)
    } else {
      models = (data.data || []).map(m => m.id).filter(Boolean)
    }
    return models.sort()
  },

  hermes_update_model({ model, provider } = {}) {
    const configPath = path.join(hermesHome(), 'config.yaml')
    const content = fs.readFileSync(configPath, 'utf8')
    const lines = content.split('\n')
    const out = []
    let inModel = false
    let defaultWritten = false
    let providerWritten = false
    let defaultIndent = '  '

    for (const line of lines) {
      const t = line.trim()
      if (t.startsWith('model:')) {
        inModel = true
        out.push(line)
        continue
      }
      if (inModel) {
        const isIndented = line.startsWith('  ') || line.startsWith('\t')
        if (!isIndented && t && !t.startsWith('#')) {
          // leaving model block — flush provider if needed
          if (provider && provider !== 'custom' && !providerWritten) {
            out.push(`${defaultIndent}provider: ${provider}`)
            providerWritten = true
          }
          inModel = false
          out.push(line)
          continue
        }
        if (t.startsWith('default:')) {
          const indentLen = line.length - line.trimStart().length
          defaultIndent = ' '.repeat(indentLen)
          out.push(`${defaultIndent}default: ${model}`)
          defaultWritten = true
          continue
        }
        if (t.startsWith('provider:')) {
          if (provider && provider !== 'custom') {
            const indentLen = line.length - line.trimStart().length
            out.push(`${' '.repeat(indentLen)}provider: ${provider}`)
            providerWritten = true
            continue
          }
          if (provider === 'custom') continue  // drop
          // no new provider → keep old
          out.push(line)
          providerWritten = true
          continue
        }
      }
      out.push(line)
    }

    // still in model block at EOF
    if (inModel && provider && provider !== 'custom' && !providerWritten) {
      out.push(`${defaultIndent}provider: ${provider}`)
    }

    if (!defaultWritten) throw new Error('config.yaml 中未找到 model.default 字段')

    let newContent = out.join('\n')
    if (!newContent.endsWith('\n')) newContent += '\n'
    fs.writeFileSync(configPath, newContent)
    return `模型已切换为 ${model}`
  },

  async hermes_detect_environments() {
    const result = { wsl2: { available: false }, docker: { available: false } }
    // Docker
    const dockerR = runHermesSilent('docker', ['info', '--format', '{{.ServerVersion}}'])
    if (dockerR.ok) {
      result.docker.available = true
      result.docker.version = dockerR.stdout
    }
    return result
  },

  hermes_set_gateway_url({ url } = {}) {
    const cfg = readPanelConfig()
    if (!cfg.hermes || typeof cfg.hermes !== 'object') cfg.hermes = {}
    if (url && url.trim()) {
      cfg.hermes.gatewayUrl = url.trim()
    } else {
      delete cfg.hermes.gatewayUrl
    }
    const cfgPath = panelConfigFilePath()
    if (!fs.existsSync(path.dirname(cfgPath))) fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
    return `Gateway URL 已设置: ${hermesGatewayUrl()}`
  },

  // =========================================================================
  // Hermes Sessions / Logs / Skills / Memory
  // =========================================================================

  hermes_sessions_list({ source, limit, profile } = {}) {
    const args = []
    if (profile) args.push('--profile', profile)
    args.push('sessions', 'export', '-')
    if (source) args.push('--source', source)
    const r = runHermesSilent('hermes', args)
    if (!r.ok) return []
    const sessions = []
    for (const line of r.stdout.split('\n')) {
      const t = line.trim()
      if (!t) continue
      try {
        const obj = JSON.parse(t)
        // `started_at` may arrive as POSIX seconds from the Hermes CLI. Fall
        // back to parsing `created_at` as ISO8601 so the Usage view can group
        // sessions by day even on older Hermes builds.
        let startedAt = typeof obj.started_at === 'number' ? obj.started_at : 0
        if (!startedAt && obj.created_at) {
          const ms = Date.parse(obj.created_at)
          if (!Number.isNaN(ms)) startedAt = Math.floor(ms / 1000)
        }
        sessions.push({
          id: obj.session_id || obj.id || '',
          title: obj.title || obj.name || '',
          source: obj.source || '',
          model: obj.model || '',
          created_at: obj.created_at || obj.createdAt || '',
          updated_at: obj.updated_at || obj.updatedAt || '',
          message_count: obj.message_count || (obj.messages ? obj.messages.length : 0),
          // Usage analytics fields (match Rust backend shape).
          started_at: startedAt,
          input_tokens: Number(obj.input_tokens || 0),
          output_tokens: Number(obj.output_tokens || 0),
          cache_read_tokens: Number(obj.cache_read_tokens || 0),
          cache_write_tokens: Number(obj.cache_write_tokens || 0),
          estimated_cost_usd: typeof obj.estimated_cost_usd === 'number' ? obj.estimated_cost_usd : null,
          actual_cost_usd: typeof obj.actual_cost_usd === 'number' ? obj.actual_cost_usd : null,
        })
      } catch {}
    }
    sessions.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const filtered = filterHermesSessionsForUi(sessions)
    if (limit && limit > 0) return filtered.slice(0, limit)
    return filtered
  },

  hermes_sessions_summary_list({ source, limit, profile } = {}) {
    const lim = Math.max(1, Math.min(Number(limit || 80), 500))
    const args = []
    if (profile) args.push('--profile', profile)
    args.push('sessions', 'list', '--limit', String(lim))
    if (source) args.push('--source', source)
    const r = runHermesSilent('hermes', args)
    if (!r.ok) return []
    const sessions = []
    let hasTitles = false
    for (const line of r.stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'No sessions found.' || trimmed.startsWith('─')) continue
      if (trimmed.includes('Title') && trimmed.includes('Preview') && trimmed.includes('ID')) { hasTitles = true; continue }
      if (trimmed.includes('Preview') && trimmed.includes('Last Active') && trimmed.includes('ID')) { hasTitles = false; continue }
      const cols = trimmed.split(/\s{2,}/).filter(Boolean)
      if (cols.length < 3) continue
      const id = cols[cols.length - 1]
      if (!id) continue
      if (hasTitles) {
        sessions.push({
          id,
          title: cols[0] === '—' ? '' : cols[0],
          source: source || '',
          model: '',
          created_at: '',
          updated_at: '',
          last_active_label: cols[2] || '',
          preview: cols[1] || '',
          message_count: 0,
          input_tokens: 0,
          output_tokens: 0,
        })
      } else {
        sessions.push({
          id,
          title: '',
          source: cols[2] || source || '',
          model: '',
          created_at: '',
          updated_at: '',
          last_active_label: cols[1] || '',
          preview: cols[0] || '',
          message_count: 0,
          input_tokens: 0,
          output_tokens: 0,
        })
      }
    }
    return filterHermesSessionsForUi(sessions)
  },

  async hermes_usage_analytics({ days = 30, profile } = {}) {
    days = Math.max(1, Math.min(Number(days || 30), 365))
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400
    const sessions = await handlers.hermes_sessions_list({ profile })
    const daily = new Map()
    const byModel = new Map()
    const totals = {
      total_input: 0,
      total_output: 0,
      total_cache_read: 0,
      total_cache_write: 0,
      total_estimated_cost: 0,
      total_actual_cost: 0,
      total_sessions: 0,
      total_api_calls: 0,
    }
    for (const s of Array.isArray(sessions) ? sessions : []) {
      const started = Number(s.started_at || 0)
      if (started > 0 && started < cutoff) continue
      const input = Number(s.input_tokens || 0)
      const output = Number(s.output_tokens || 0)
      const cacheRead = Number(s.cache_read_tokens || 0)
      const cacheWrite = Number(s.cache_write_tokens || 0)
      const estimated = Number(s.estimated_cost_usd || 0)
      const actual = Number(s.actual_cost_usd || 0)
      totals.total_input += input
      totals.total_output += output
      totals.total_cache_read += cacheRead
      totals.total_cache_write += cacheWrite
      totals.total_estimated_cost += estimated
      totals.total_actual_cost += actual
      totals.total_sessions += 1
      const day = started > 0 ? new Date(started * 1000).toISOString().slice(0, 10) : 'unknown'
      if (!daily.has(day)) daily.set(day, { day, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, estimated_cost: 0, actual_cost: 0, sessions: 0 })
      const d = daily.get(day)
      d.input_tokens += input
      d.output_tokens += output
      d.cache_read_tokens += cacheRead
      d.estimated_cost += estimated
      d.actual_cost += actual
      d.sessions += 1
      const model = s.model || ''
      if (model) {
        // 规范化模型名：去掉 provider/ 前缀
        // 例如 "anthropic/claude-opus-4.6" → "claude-opus-4.6"
        const slashIdx = model.lastIndexOf('/')
        const modelKey = slashIdx >= 0 ? model.slice(slashIdx + 1) : model
        if (!byModel.has(modelKey)) byModel.set(modelKey, { model: modelKey, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, estimated_cost: 0, sessions: 0 })
        const m = byModel.get(modelKey)
        m.input_tokens += input
        m.output_tokens += output
        m.cache_read_tokens += cacheRead
        m.estimated_cost += estimated
        m.sessions += 1
      }
    }
    return {
      daily: [...daily.values()],
      by_model: [...byModel.values()].sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens)),
      totals,
      period_days: days,
      skills: {
        summary: { total_skill_loads: 0, total_skill_edits: 0, total_skill_actions: 0, distinct_skills_used: 0 },
        top_skills: [],
      },
    }
  },

  hermes_session_detail({ sessionId, profile } = {}) {
    if (!sessionId) throw new Error('sessionId is required')
    const args = []
    if (profile) args.push('--profile', profile)
    args.push('sessions', 'export', '-', '--session-id', sessionId)
    const r = runHermesSilent('hermes', args)
    if (!r.ok) throw new Error('Failed to read sessions')
    for (const line of r.stdout.split('\n')) {
      const t = line.trim()
      if (!t) continue
      try {
        const obj = JSON.parse(t)
        if ((obj.session_id || obj.id) === sessionId) {
          const session = {
            id: obj.session_id || obj.id,
            title: obj.title || obj.name || '',
            source: obj.source || '',
            model: obj.model || '',
            created_at: obj.created_at || '',
            messages: (obj.messages || []).map(m => ({
              role: m.role || '',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
              timestamp: m.timestamp || m.created_at || '',
            })),
          }
          if (isHermesDeletedSessionId(session.id) || isHermesSmokeOrFixtureSession(session)) break
          return session
        }
      } catch {}
    }
    throw new Error('Session not found')
  },

  hermes_session_delete({ sessionId, profile } = {}) {
    if (!sessionId) throw new Error('sessionId is required')
    rememberHermesDeletedSession(sessionId)
    const args = []
    if (profile) args.push('--profile', profile)
    args.push('sessions', 'delete', sessionId, '--yes')
    const r = runHermesSilent('hermes', args)
    if (!r.ok) throw new Error(`Failed to delete session: ${r.stderr || 'unknown error'}`)
    return 'ok'
  },

  hermes_session_rename({ sessionId, title, profile } = {}) {
    if (!sessionId || !title) throw new Error('sessionId and title are required')
    const args = []
    if (profile) args.push('--profile', profile)
    args.push('sessions', 'rename', sessionId, title)
    const r = runHermesSilent('hermes', args)
    if (!r.ok) throw new Error(`Failed to rename session: ${r.stderr || 'unknown error'}`)
    return 'ok'
  },

  hermes_profiles_list() {
    const r = runHermesSilent('hermes', ['profile', 'list'])
    if (!r.ok) return { active: 'default', profiles: [] }
    let active = 'default'
    const profiles = []
    for (const line of r.stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.includes('Profile') || trimmed.startsWith('─') || trimmed.startsWith('-')) continue
      const isActive = trimmed.startsWith('◆')
      const row = trimmed.replace(/^◆/, '').trim()
      const parts = row.split(/\s+/)
      if (parts.length < 3) continue
      const name = parts[0]
      if (name !== 'default' && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) continue
      const gatewayIdx = parts.findIndex(p => p === 'running' || p === 'stopped')
      if (gatewayIdx <= 1) continue
      const model = parts.slice(1, gatewayIdx).join(' ')
      const alias = parts[gatewayIdx + 1] || ''
      if (isActive) active = name
      profiles.push({
        name,
        active: isActive,
        model: model === '—' ? '' : model,
        gatewayRunning: parts[gatewayIdx] === 'running',
        alias: alias === '—' ? '' : alias,
      })
    }
    if (!profiles.some(p => p.active)) {
      const d = profiles.find(p => p.name === 'default')
      if (d) d.active = true
    }
    return { active, profiles }
  },

  hermes_profile_use({ name } = {}) {
    if (!name) throw new Error('name is required')
    const r = runHermesSilent('hermes', ['profile', 'use', name])
    if (!r.ok) throw new Error(`Failed to switch profile: ${r.stderr || 'unknown error'}`)
    return 'ok'
  },

  hermes_logs_list() {
    const logsDir = path.join(hermesHome(), 'logs')
    const readFromDisk = () => {
      if (!fs.existsSync(logsDir)) return []
      try {
        return fs.readdirSync(logsDir)
          .filter(f => /\.(log|txt|jsonl)$/i.test(f) && !/[\\/]/.test(f))
          .map(f => {
            const stat = fs.statSync(path.join(logsDir, f))
            return { name: f, size: stat.size, modified: stat.mtime.toISOString() }
          })
          .sort((a, b) => b.modified.localeCompare(a.modified))
      } catch { return [] }
    }

    const diskFiles = readFromDisk()
    if (diskFiles.length) return diskFiles

    const r = runHermesSilent('hermes', ['logs', 'list'])
    if (!r.ok) {
      // Fallback: read log files from ~/.hermes/logs/
      return readFromDisk()
    }
    // Parse CLI output
    const files = []
    for (const line of r.stdout.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('─') || t.startsWith('Name') || t.startsWith('=')) continue
      const parts = t.split(/\s{2,}/)
      const name = (parts[0] || '').trim()
      if (!/\.(log|txt|jsonl)$/i.test(name) || /[\\/]/.test(name) || name.endsWith(':')) continue
      files.push({ name, size: parts[1] || '', modified: parts[2] || '' })
    }
    return files
  },

  hermes_logs_read({ name, lines = 200, level } = {}) {
    if (!name) throw new Error('请选择一个日志文件')
    if (/[\\/]/.test(String(name)) || !/\.(log|txt|jsonl)$/i.test(String(name))) {
      throw new Error('日志文件名无效')
    }
    const args = ['logs', name, '-n', String(lines)]
    if (level) args.push('--level', level)
    const r = runHermesSilent('hermes', args)
    if (!r.ok) {
      // Fallback: direct file read
      const logPath = path.join(hermesHome(), 'logs', name)
      if (!fs.existsSync(logPath)) throw new Error(`日志文件不存在：${name}`)
      const content = fs.readFileSync(logPath, 'utf8')
      const allLines = content.split('\n')
      const tail = allLines.slice(-lines)
      return tail.map(line => {
        const m = line.match(/^(\S+\s+\S+)\s+(\w+)\s+(.*)/)
        return m ? { timestamp: m[1], level: m[2], message: m[3], raw: line } : { raw: line }
      }).filter(e => e.raw.trim())
    }
    return r.stdout.split('\n').filter(l => l.trim()).map(line => {
      const m = line.match(/^(\S+\s+\S+)\s+(\w+)\s+(.*)/)
      return m ? { timestamp: m[1], level: m[2], message: m[3], raw: line } : { raw: line }
    })
  },

  // 解析 ~/.hermes/config.yaml 中 `skills.disabled` 列表（与 Rust 端
  // commands/hermes.rs:read_disabled_skills 同语义；缩进感知）
  _readHermesDisabledSkills() {
    const configPath = path.join(hermesHome(), 'config.yaml')
    if (!fs.existsSync(configPath)) return []
    let raw
    try { raw = fs.readFileSync(configPath, 'utf8') } catch { return [] }
    const out = []
    let inSkills = false
    let inDisabled = false
    for (let line of raw.split('\n')) {
      // 去掉行内注释
      const hash = line.indexOf('#')
      if (hash >= 0) line = line.slice(0, hash)
      const trimmedFull = line.replace(/\s+$/, '')
      if (!trimmedFull) continue
      const indent = trimmedFull.length - trimmedFull.trimStart().length
      const body = trimmedFull.trimStart()
      if (indent === 0) {
        inSkills = body.startsWith('skills:')
        inDisabled = false
      } else if (inSkills && indent === 2 && body.startsWith('disabled:')) {
        inDisabled = true
      } else if (inSkills && inDisabled && indent >= 4 && body.startsWith('- ')) {
        const name = body.replace(/^-\s+/, '').trim().replace(/^["']|["']$/g, '')
        if (name) out.push(name)
      }
    }
    return out
  },

  hermes_skills_list() {
    ensureBuiltinHermesSkills()
    const skillsDir = path.join(hermesHome(), 'skills')
    if (!fs.existsSync(skillsDir)) return []
    const disabled = handlers._readHermesDisabledSkills()
    const isEnabled = (name) => !disabled.includes(name)

    const categories = []
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        if (entry.isDirectory()) {
          const catDir = path.join(skillsDir, entry.name)
          // Category description from DESCRIPTION.md if present
          let catDesc = ''
          try {
            const dmPath = path.join(catDir, 'DESCRIPTION.md')
            if (fs.existsSync(dmPath)) {
              const raw = fs.readFileSync(dmPath, 'utf8')
              const heading = raw.match(/^#\s+(.+)/m)
              catDesc = (heading ? heading[1] : raw.trim().split('\n')[0] || '').trim().slice(0, 200)
            }
          } catch {}

          const skills = []
          for (const sub of fs.readdirSync(catDir, { withFileTypes: true })) {
            if (sub.name === 'DESCRIPTION.md') continue

            // v0.14.1 structured skill: SKILL.md inside a directory
            if (sub.isDirectory()) {
              const skillMd = path.join(catDir, sub.name, 'SKILL.md')
              if (!fs.existsSync(skillMd)) continue
              const content = fs.readFileSync(skillMd, 'utf8')
              const nameMatch = content.match(/^#\s+(.+)/m)
              const descMatch = content.match(/^[^#\n].{10,}/m)
              skills.push({
                file: sub.name,
                name: nameMatch ? nameMatch[1].trim() : sub.name,
                slug: sub.name,
                description: descMatch ? descMatch[0].trim().slice(0, 200) : '',
                path: skillMd,
                skill_dir: path.join(catDir, sub.name),
                isDir: true,
                enabled: isEnabled(sub.name),
              })
              continue
            }

            if (!sub.name.endsWith('.md')) continue
            const filePath = path.join(catDir, sub.name)
            const content = fs.readFileSync(filePath, 'utf8')
            const nameMatch = content.match(/^#\s+(.+)/m)
            const descMatch = content.match(/^[^#\n].{10,}/m)
            const slug = sub.name.replace(/\.md$/, '')
            skills.push({
              file: sub.name,
              name: nameMatch ? nameMatch[1].trim() : slug,
              slug,
              description: descMatch ? descMatch[0].trim().slice(0, 200) : '',
              path: filePath,
              isDir: false,
              enabled: isEnabled(slug),
            })
          }

          if (skills.length > 0) {
            skills.sort((a, b) => a.name.localeCompare(b.name))
            categories.push({ category: entry.name, description: catDesc, skills })
          }
        } else if (entry.name.endsWith('.md') && entry.name !== 'DESCRIPTION.md') {
          const filePath = path.join(skillsDir, entry.name)
          const content = fs.readFileSync(filePath, 'utf8')
          const nameMatch = content.match(/^#\s+(.+)/m)
          const slug = entry.name.replace(/\.md$/, '')
          categories.push({
            category: '_root',
            description: '',
            skills: [{
              file: entry.name,
              name: nameMatch ? nameMatch[1].trim() : slug,
              slug,
              description: '',
              path: filePath,
              isDir: false,
              enabled: isEnabled(slug),
            }],
          })
        }
      }
    } catch {}
    categories.sort((a, b) => a.category.localeCompare(b.category))
    return categories
  },

  hermes_ensure_builtin_skills() {
    return ensureBuiltinHermesSkills()
  },

  async hermes_skill_install({ sourceType, sourceData } = {}) {
    const type = String(sourceType || '').trim().toLowerCase()
    if (!['url', 'zip', 'online'].includes(type)) throw new Error('仅支持 online、url 或 zip 安装')

    if (type === 'online' && !isLikelyZipUrl(sourceData)) {
      const installed = installHermesSkillWithCli(sourceData)
      return installed.skills
    }
    const installType = type === 'online' ? 'url' : type

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-skill-'))
    const zipPath = path.join(tempRoot, 'skill.zip')
    const extractDir = path.join(tempRoot, 'extract')
    let sourceName = 'imported-skill'
    try {
      if (installType === 'url') {
        const url = String(sourceData || '').trim()
        if (!/^https?:\/\//i.test(url)) {
          const installed = installHermesSkillWithCli(url)
          return installed.skills
        }
        if (!isLikelyZipUrl(url)) {
          const installed = installHermesSkillWithCli(url)
          return installed.skills
        }
        const u = new URL(url)
        sourceName = safeDirName(path.basename(decodeURIComponent(u.pathname || '')) || 'downloaded-skill')
        const resp = await globalThis.fetch(url, { signal: AbortSignal.timeout(60000) })
        if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`)
        fs.writeFileSync(zipPath, Buffer.from(await resp.arrayBuffer()))
      } else {
        const base64 = String(sourceData || '').trim()
        if (!base64) throw new Error('ZIP 内容为空')
        fs.writeFileSync(zipPath, Buffer.from(base64, 'base64'))
      }
      if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) throw new Error('ZIP 内容为空')
      extractZipArchive(zipPath, extractDir)
      return installHermesSkillPackage(extractDir, sourceName)
    } finally {
      try { fs.rmSync(tempRoot, { recursive: true, force: true }) } catch {}
    }
  },

  hermes_skill_detail({ filePath } = {}) {
    if (!filePath) throw new Error('filePath is required')
    const skillsDir = path.join(hermesHome(), 'skills')
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(skillsDir)) throw new Error('Access denied')
    if (!fs.existsSync(resolved)) throw new Error('Skill file not found')
    return fs.readFileSync(resolved, 'utf8')
  },

  hermes_skill_toggle({ name, enabled } = {}) {
    if (!name) throw new Error('Skill name is required')
    const configPath = path.join(hermesHome(), 'config.yaml')
    if (!fs.existsSync(configPath)) throw new Error('config.yaml not found')
    const raw = fs.readFileSync(configPath, 'utf8')
    // Backup
    const backup = path.join(hermesHome(), `config.yaml.bak-${Math.floor(Date.now() / 1000)}`)
    try { fs.writeFileSync(backup, raw) } catch {}
    const patched = patchHermesYamlToggleSkill(raw, name, !!enabled)
    fs.writeFileSync(configPath, patched)
    return { ok: true, skill: name, enabled: !!enabled, backup }
  },

  hermes_skill_files({ category, skill } = {}) {
    if (!category || !skill) throw new Error('category and skill are required')
    const skillDir = path.join(hermesHome(), 'skills', category, skill)
    if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) return []
    const out = []
    const walk = (root, relBase) => {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (relBase === '' && entry.name === 'SKILL.md') continue
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name
        const full = path.join(root, entry.name)
        const isDir = entry.isDirectory()
        out.push({ path: rel, name: entry.name, isDir })
        if (isDir) walk(full, rel)
      }
    }
    walk(skillDir, '')
    out.sort((a, b) => a.path.localeCompare(b.path))
    return out
  },

  hermes_skill_write({ filePath, content } = {}) {
    if (!filePath) throw new Error('filePath is required')
    if (content == null) throw new Error('content is required')
    const skillsDir = path.join(hermesHome(), 'skills')
    const targetAbs = path.isAbsolute(filePath) ? filePath : path.join(skillsDir, filePath)
    const parent = path.dirname(targetAbs)
    fs.mkdirSync(parent, { recursive: true })
    const parentReal = fs.realpathSync(parent)
    const skillsReal = fs.realpathSync(skillsDir)
    if (!parentReal.startsWith(skillsReal)) throw new Error('Access denied')
    fs.writeFileSync(targetAbs, content, 'utf8')
    return 'ok'
  },

  hermes_memory_read({ type = 'memory' } = {}) {
    const filePath = hermesMemoryFilePath(type)
    if (!filePath) throw new Error(`Invalid memory kind '${type}' (expected memory|user|soul)`)
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf8')
  },

  hermes_memory_write({ type = 'memory', content } = {}) {
    if (content == null) throw new Error('content is required')
    const filePath = hermesMemoryFilePath(type)
    if (!filePath) throw new Error(`Invalid memory kind '${type}' (expected memory|user|soul)`)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
    return 'ok'
  },

  hermes_memory_read_all() {
    const readSection = (kind) => {
      const p = hermesMemoryFilePath(kind)
      if (!p) return ['', null]
      if (!fs.existsSync(p)) return ['', null]
      const content = fs.readFileSync(p, 'utf8')
      const mtime = Math.floor(fs.statSync(p).mtimeMs / 1000)
      return [content, mtime]
    }
    const [memory, memory_mtime] = readSection('memory')
    const [user, user_mtime] = readSection('user')
    const [soul, soul_mtime] = readSection('soul')
    return { memory, user, soul, memory_mtime, user_mtime, soul_mtime }
  },

  hermes_logs_download({ name, saveToDisk = false } = {}) {
    if (!name) throw new Error('log file name is required')
    // Reject traversal (mirror the Rust-side check)
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid log file name')
    }
    const logsDir = path.join(hermesHome(), 'logs')
    const filePath = path.join(logsDir, name)
    const resolved = fs.realpathSync(filePath)
    const canonDir = fs.realpathSync(logsDir)
    if (!resolved.startsWith(canonDir)) throw new Error('Access denied')
    const content = fs.readFileSync(resolved, 'utf8')
    if (!saveToDisk) return content
    const outDir = path.join(os.homedir(), 'Downloads', 'ClawPanel')
    fs.mkdirSync(outDir, { recursive: true })
    const safeName = name.replace(/[\\/:*?"<>|]/g, '_')
    const outPath = path.join(outDir, safeName)
    fs.writeFileSync(outPath, content)
    return { path: outPath }
  },

  async update_hermes() {
    const uvPath = path.join(uvBinDir(), isWindows ? 'uv.exe' : 'uv')
    const uv = fs.existsSync(uvPath) ? uvPath : 'uv'

    // 优先使用本地 hermes-agent-main.zip
    let localSource = null
    const bundledZip = bundledHermesArchivePath()
    if (fs.existsSync(bundledZip)) {
      console.log(`📦 发现本地 Hermes Agent 源码包: ${bundledZip}`)
      try {
        localSource = extractHermesZip(bundledZip)
        console.log(`✓ 本地源码包已解压到: ${localSource}`)
      } catch (e) {
        console.warn(`⚠️ 本地源码包解压失败: ${e.message}，将尝试从 GitHub`)
      }
    }

    const sourceUrl = localSource
      ? `file:///${localSource.replace(/\\/g, '/').replace(/^\/+/, '')}`
      : 'git+https://github.com/NousResearch/hermes-agent.git'
    const pkg = `hermes-agent[web] @ ${sourceUrl}`
    const env = hermesRuntimeEnv()
    if (!localSource) env.GIT_TERMINAL_PROMPT = '0'
    // 便携模式：设置 UV_TOOL_DIR，使 hermes.exe 安装到 <app_root>/uv-tools/bin/
    fs.mkdirSync(uvToolDir(), { recursive: true })
    env.UV_TOOL_DIR = uvToolDir()
    // 便携模式：设置 HERMES_HOME
    fs.mkdirSync(hermesHome(), { recursive: true })
    env.HERMES_HOME = hermesHome()
    // 便携模式：设置 UV_PYTHON_INSTALL_DIR 并尝试使用本地缓存的 Python 可执行文件
    const _pyDir = prepareUvPythonDir()
    let pythonArg = '3.11'
    if (_pyDir) {
      env.UV_PYTHON_INSTALL_DIR = _pyDir
      const cachedPython = findCachedPython(_pyDir)
      if (cachedPython) {
        pythonArg = cachedPython
        console.log(`[update_hermes] ✓ 使用本地缓存 Python: ${cachedPython}`)
      }
    }
    const result = spawnSync(uv, ['tool', 'install', '--reinstall', pkg, '--python', pythonArg, '--with', 'croniter', '--with', 'aiohttp'], {
      env,
      timeout: 600000, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (result.status !== 0) throw new Error(`升级失败: ${(result.stderr || '').trim()}`)
    return '升级完成'
  },

  async uninstall_hermes({ cleanConfig = false } = {}) {
    const uvPath = path.join(uvBinDir(), isWindows ? 'uv.exe' : 'uv')
    const uv = fs.existsSync(uvPath) ? uvPath : 'uv'
    const result = spawnSync(uv, ['tool', 'uninstall', 'hermes-agent'], {
      env: hermesRuntimeEnv({ UV_TOOL_DIR: uvToolDir() }),
      timeout: 60000, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (result.status !== 0) throw new Error(`卸载失败: ${(result.stderr || '').trim()}`)
    // 清理 venv
    const venvDir = path.join(appRootDir(), 'data', 'hermes-venv')
    if (fs.existsSync(venvDir)) fs.rmSync(venvDir, { recursive: true, force: true })
    if (cleanConfig) {
      const home = hermesHome()
      if (fs.existsSync(home)) fs.rmSync(home, { recursive: true, force: true })
    }
    return 'Hermes Agent 已卸载'
  },

  // ============================================================================
  // Web 模式兼容 stub —— 桌面专属或尚未移植的命令
  // ----------------------------------------------------------------------------
  // 返回安全默认值（避免 UI 报错）或抛出明确错误（仅在用户主动触发时显示）。
  // 这些命令的 Rust 端实现位于 src-tauri/src/commands/* ，移植后请删除对应 stub。
  // ============================================================================

  // —— 前端热更新（Tauri 桌面专属，浏览器刷新即得最新）——
  check_frontend_update() { return { hasUpdate: false } },
  download_frontend_update() { throw new Error('Web 模式无需前端热更新，刷新浏览器即可') },
  rollback_frontend_update() { throw new Error('Web 模式不支持前端热更新回滚') },
  get_update_status() { return { status: 'idle', mode: 'web' } },
  // —— 应用重启（Web 端由 tauri-api.js 包装层直接调 location.reload，到这里说明绕过了包装）——
  relaunch_app() { throw new Error('Web 模式请直接刷新浏览器') },

  // —— Cloudflare Tunnel / ClawApp 安装（Tauri 桌面专属）——
  install_cftunnel() { throw new Error('Web 模式不支持安装 Cloudflare Tunnel，请使用桌面客户端') },
  cftunnel_action() { throw new Error('Web 模式不支持操作 Cloudflare Tunnel，请使用桌面客户端') },
  get_cftunnel_status() { return { installed: false, running: false, mode: 'web' } },
  get_cftunnel_logs() { return '' },
  install_clawapp() { throw new Error('Web 模式不支持安装 ClawApp 移动端，请使用桌面客户端') },
  get_clawapp_status() { return { installed: false, mode: 'web' } },

  // —— 渠道插件状态/操作（暂未在 Node 实现，先抛友好错误）——
  check_weixin_plugin_status() {
    // 静默返回未安装即可，UI 会显示"未安装"
    return { installed: false, version: null, plugin: null }
  },
  diagnose_channel() {
    return { ok: false, error: 'Web 模式暂未实现渠道诊断，请使用桌面客户端' }
  },
  run_channel_action() {
    throw new Error('Web 模式暂未实现渠道操作，请使用桌面客户端')
  },
  repair_qqbot_channel_setup() {
    throw new Error('Web 模式暂未实现 QQ Bot 自动修复，请使用桌面客户端')
  },

  // —— 系统体检（暂未在 Node 实现）——
  doctor_check() {
    return { success: false, output: '', errors: 'Web 模式暂未实现 openclaw doctor，请使用桌面客户端' }
  },
  doctor_fix() {
    return { success: false, output: '', errors: 'Web 模式暂未实现 openclaw doctor --fix，请使用桌面客户端' }
  },

  // —— 配置/Skills 校验（暂未在 Node 实现）——
  validate_openclaw_config() {
    // 至少做一次基本 JSON 形状校验
    try {
      const cfg = readOpenclawConfigOptional()
      if (!cfg || typeof cfg !== 'object') throw new Error('配置文件为空或格式错误')
      let changed = ensureOpenClawWorkspaceConfig(cfg)
      changed = ensureOpenClawStatusPluginDefaults(cfg) || changed
      const workspaceDir = resolveDefaultWorkspace(cfg)
      const workspaceStatus = ensureOpenClawWorkspaceDir(workspaceDir)
      const memoryFiles = ensureOpenClawMemoryFiles()
      if (changed) writeOpenclawConfigFile(cfg)
      const warnings = []
      if (!workspaceStatus.exists) warnings.push(`工作区目录不存在: ${workspaceDir}`)
      else if (!workspaceStatus.writable) warnings.push(`工作区目录不可写: ${workspaceDir}`)
      const skillsData = scanLocalSkillsFallback()
      const installedSkills = skillsData.skills.filter(skill => !skill.bundled && skill.eligible && !skill.disabled)
      return {
        ok: true,
        warnings,
        workspace: { path: workspaceDir, ...workspaceStatus },
        skills: {
          installed: installedSkills.length,
          enabledCallable: installedSkills.length,
          totalVisible: skillsData.skills.length,
          builtin: skillsData.skills.filter(skill => skill.bundled).length,
        },
        plugins: summarizeOpenClawPluginStatus(cfg),
        memoryFiles,
      }
    } catch (e) {
      return { ok: false, errors: [String(e?.message || e)] }
    }
  },
  skills_validate() {
    throw new Error('Web 模式暂未实现 Skills 校验，请使用桌面客户端')
  },
}

// Hermes 配置合并辅助函数
function _mergeHermesConfigYaml(existing, modelStr, baseUrlLine, providerLine = '', customProvidersBlock = '') {
  const lines = existing.split('\n')
  const result = []
  let inModel = false, written = false, i = 0
  while (i < lines.length) {
    const line = lines[i], t = line.trim()
    if (_isHermesModelProviderSection(t)) {
      i++
      while (i < lines.length) {
        const next = lines[i], nt = next.trim()
        if (!nt) { i++; continue }
        if (next.startsWith('  ') || next.startsWith('\t')) { i++; continue }
        break
      }
      continue
    }
    if (t === 'model:' || t.startsWith('model:')) {
      inModel = true; written = true
      result.push('model:')
      result.push(`  default: ${modelStr}`)
      if (providerLine) result.push(providerLine.trimEnd())
      if (baseUrlLine) result.push(baseUrlLine.trimEnd())
      i++
      while (i < lines.length) {
        const next = lines[i], nt = next.trim()
        if (!nt) { i++; continue }
        if (next.startsWith('  ') || next.startsWith('\t')) { i++; continue }
        break
      }
      continue
    }
    if (inModel && t && !line.startsWith('  ') && !line.startsWith('\t')) inModel = false
    if (!inModel) result.push(line)
    i++
  }
  if (!written) {
    result.push('model:')
    result.push(`  default: ${modelStr}`)
    if (providerLine) result.push(providerLine.trimEnd())
    if (baseUrlLine) result.push(baseUrlLine.trimEnd())
  }
  let final = result.join('\n')
  if (!final.includes('platform_toolsets:')) final += '\nplatform_toolsets:\n  api_server:\n    - hermes-api-server\n'
  if (!final.includes('terminal:')) final += 'terminal:\n  backend: local\n'
  if (!final.includes('platforms:')) final += 'platforms:\n  api_server:\n    enabled: true\n'
  if (customProvidersBlock && customProvidersBlock.trim()) {
    if (!final.endsWith('\n')) final += '\n'
    final += customProvidersBlock
  }
  if (!final.endsWith('\n')) final += '\n'
  return final
}

function _isHermesModelProviderSection(trimmed) {
  return trimmed === 'custom_providers:'
    || trimmed.startsWith('custom_providers:')
    || trimmed === 'providers:'
    || trimmed.startsWith('providers:')
    || trimmed === 'fallback_providers:'
    || trimmed.startsWith('fallback_providers:')
    || trimmed === 'credential_pool_strategies:'
    || trimmed.startsWith('credential_pool_strategies:')
    || trimmed === 'auxiliary:'
    || trimmed.startsWith('auxiliary:')
}

function _mergeEnvFile(existing, managedKeys, newPairs) {
  const result = []
  for (const line of existing.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) { result.push(line); continue }
    const eq = t.indexOf('=')
    if (eq > 0 && managedKeys.includes(t.slice(0, eq).trim())) continue
    result.push(line)
  }
  for (const [k, v] of newPairs) result.push(`${k}=${v}`)
  let content = result.join('\n')
  if (!content.endsWith('\n')) content += '\n'
  return content
}

function _tcpProbe(host, port, timeoutMs) {
  return new Promise(resolve => {
    const sock = new net.Socket()
    sock.setTimeout(timeoutMs)
    sock.connect(port, host, () => { sock.destroy(); resolve(true) })
    sock.on('error', () => { sock.destroy(); resolve(false) })
    sock.on('timeout', () => { sock.destroy(); resolve(false) })
  })
}

function _httpJsonProbe(targetUrl, timeoutMs = 1500) {
  return new Promise(resolve => {
    let done = false
    let req = null
    const finish = (ok) => {
      if (done) return
      done = true
      resolve(ok)
    }
    try {
      const url = new URL(targetUrl)
      req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        timeout: timeoutMs,
      }, res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
          if (body.length > 65536 && req) req.destroy()
        })
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return finish(false)
          try {
            JSON.parse(body)
            finish(true)
          } catch {
            finish(false)
          }
        })
      })
      req.on('timeout', () => { req.destroy(); finish(false) })
      req.on('error', () => finish(false))
      req.end()
    } catch {
      finish(false)
    }
  })
}

function claudeCodeResourcesDir() {
  const candidates = [
    path.join(appRootDir(), 'src-tauri', 'resources'),
    path.join(appRootDir(), 'resources'),
  ]
  return candidates.find(dir => fs.existsSync(path.join(dir, 'runtime', 'claude-code', 'bin'))) || candidates[0]
}

function claudeCodePaths() {
  const resources = claudeCodeResourcesDir()
  const exeName = process.platform === 'win32' ? 'claude.exe' : 'claude'
  return {
    resources,
    claude: path.join(resources, 'runtime', 'claude-code', 'bin', exeName),
    homeDir: path.join(resources, 'data', 'claude-code', 'home'),
    projectsDir: path.join(resources, 'data', 'claude-code', 'projects'),
  }
}

let _claudePanelChild = null
let _nativeClaudeChild = null
const NATIVE_CLAUDE_WINDOW_TITLE = 'SuperClaw Claude Code Native'

function claudePanelPaths(paths = claudeCodePaths()) {
  const port = Number(process.env.CLEAN_PANEL_PORT || process.env.CLAUDE_PANEL_PORT || 3020)
  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    dir: path.join(paths.resources, 'runtime', 'claude-panel'),
    server: path.join(paths.resources, 'runtime', 'claude-panel', 'server.js'),
    dataDir: path.join(paths.resources, 'data', 'claude-panel'),
    panelConfig: path.join(paths.resources, 'data', '.openclaw', 'clawpanel.json'),
  }
}

async function claudePanelRunning(panel = claudePanelPaths()) {
  if (!(await _tcpProbe('127.0.0.1', panel.port, 800))) return false
  const baseUrl = String(panel.url || `http://127.0.0.1:${panel.port}/`).replace(/\/+$/, '')
  return _httpJsonProbe(`${baseUrl}/api/status`, 2000)
}

async function waitForClaudePanel(panel, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await claudePanelRunning(panel)) return true
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  return false
}

function claudePanelEnv(paths, panel) {
  const appData = path.join(paths.homeDir, 'AppData', 'Roaming')
  const localAppData = path.join(paths.homeDir, 'AppData', 'Local')
  fs.mkdirSync(appData, { recursive: true })
  fs.mkdirSync(localAppData, { recursive: true })
  fs.mkdirSync(panel.dataDir, { recursive: true })
  fs.mkdirSync(path.join(paths.homeDir, '.claude'), { recursive: true })
  const claudeBin = path.dirname(paths.claude)
  return {
    ...process.env,
    PORT: String(panel.port),
    CLEAN_PANEL_ADMIN_PORT: String(panel.port + 1),
    CLEAN_PANEL_HOME_DIR: paths.homeDir,
    CLEAN_PANEL_DATA_DIR: panel.dataDir,
    CLEAN_PANEL_CLAUDE_SETTINGS_PATH: path.join(paths.homeDir, '.claude', 'settings.json'),
    CLEAN_PANEL_CLAUDE_PROJECTS_JSON_PATH: path.join(paths.homeDir, '.claude.json'),
    CLEAN_PANEL_CLAUDE_SKILLS_DIR: path.join(paths.homeDir, '.claude', 'skills'),
    CLAUDE_CLI_PATH: paths.claude,
    CLAUDE_CONFIG_DIR: path.join(paths.homeDir, 'claude-config'),
    CLAUDE_CODE_PROJECTS_DIR: paths.projectsDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    SUPERCLAW_PANEL_CONFIG_PATH: panel.panelConfig,
    HOME: paths.homeDir,
    USERPROFILE: paths.homeDir,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    PATH: `${claudeBin}${path.delimiter}${process.env.PATH || ''}`,
  }
}

function claudeCompatibleModelEnv(paths = claudeCodePaths()) {
  const out = {}
  const panel = claudePanelPaths(paths)
  const relayPath = panel.relayConfig || path.join(panel.dataDir, 'relay-config.json')
  const relay = readJsonFileRelaxed(relayPath) || {}
  const relayKey = cleanMiniMaxValue(relay.apiKey)
  const relayBaseUrl = cleanMiniMaxBaseUrl(relay.baseUrl)
  const relayModel = cleanMiniMaxValue(relay.model || relay.branchModels?.[0] || '')
  if (relay.enabled !== false && relayKey && relayBaseUrl) {
    out.ANTHROPIC_API_KEY = relayKey
    out.ANTHROPIC_AUTH_TOKEN = relayKey
    out.ANTHROPIC_BASE_URL = relayBaseUrl
    if (relayModel) {
      out.ANTHROPIC_MODEL = relayModel
      out.ANTHROPIC_DEFAULT_HAIKU_MODEL = relayModel
      out.ANTHROPIC_DEFAULT_SONNET_MODEL = relayModel
      out.ANTHROPIC_DEFAULT_OPUS_MODEL = relayModel
    }
    return out
  }

  const hermesEnv = readEnvFile(path.join(hermesHome(), '.env'))
  const key = cleanMiniMaxValue(hermesEnv.MINIMAX_API_KEY || hermesEnv.MINIMAX_CN_API_KEY)
  const baseUrl = cleanMiniMaxBaseUrl(hermesEnv.MINIMAX_BASE_URL || hermesEnv.MINIMAX_CN_BASE_URL)
  const model = cleanMiniMaxValue(hermesEnv.OPENAI_MODEL || MINIMAX_TEST_DEFAULTS.model)
  if (!key || !baseUrl) return out
  out.MINIMAX_API_KEY = key
  out.MINIMAX_BASE_URL = baseUrl
  out.ANTHROPIC_API_KEY = key
  out.ANTHROPIC_AUTH_TOKEN = key
  out.ANTHROPIC_BASE_URL = baseUrl
  out.ANTHROPIC_MODEL = model
  out.ANTHROPIC_DEFAULT_HAIKU_MODEL = model
  out.ANTHROPIC_DEFAULT_SONNET_MODEL = model
  out.ANTHROPIC_DEFAULT_OPUS_MODEL = model
  return out
}

async function startClaudePanel() {
  const status = await claudeCodeStatus()
  const paths = status.paths
  const panel = status.panel
  if (!panel.installed) throw new Error('Claude 控制台 UI 资源缺失：resources/runtime/claude-panel/server.js')
  if (panel.running) {
    return { started: false, mode: 'panel', url: panel.url, panelUrl: panel.url, status }
  }

  const env = claudePanelEnv(paths, panel)
  _claudePanelChild = spawn(process.execPath, [panel.server], {
    cwd: panel.dir,
    env,
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
  })
  if (typeof _claudePanelChild.unref === 'function') _claudePanelChild.unref()

  const ready = await waitForClaudePanel(panel)
  if (!ready) {
    throw new Error(`Claude 控制台启动超时：${panel.url}`)
  }
  const nextStatus = await claudeCodeStatus()
  return { started: true, mode: 'panel', url: panel.url, panelUrl: panel.url, status: nextStatus }
}

function quoteCmd(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`
}

function writeNativeClaudeLauncher({ paths, runCwd }) {
  const launcherPath = path.join(paths.homeDir, 'run-claude-native.cmd')
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    `title ${NATIVE_CLAUDE_WINDOW_TITLE}`,
    `cd /d ${quoteCmd(runCwd)}`,
    `set "HOME=${paths.homeDir}"`,
    `set "USERPROFILE=${paths.homeDir}"`,
    `set "APPDATA=${path.join(paths.homeDir, 'AppData', 'Roaming')}"`,
    `set "LOCALAPPDATA=${path.join(paths.homeDir, 'AppData', 'Local')}"`,
    `set "CLAUDE_CONFIG_DIR=${path.join(paths.homeDir, 'claude-config')}"`,
    `set "CLAUDE_CODE_PROJECTS_DIR=${paths.projectsDir}"`,
    'set "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1"',
    `set "PATH=${path.dirname(paths.claude)};%PATH%"`,
    quoteCmd(paths.claude),
  ]
  fs.writeFileSync(launcherPath, lines.join('\r\n'), 'utf8')
  return launcherPath
}

function resolveNativeClaudeCwd(cwd, fallback) {
  const requested = String(cwd || '').trim()
  if (requested) {
    try {
      const resolved = path.resolve(requested)
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved
    } catch {}
  }
  return fallback
}

async function startNativeClaudeTerminal(cwd) {
  const status = await claudeCodeStatus()
  const paths = status.paths || claudeCodePaths()
  if (!fs.existsSync(paths.claude)) {
    throw new Error(`Claude Code CLI 缺失：${paths.claude}`)
  }

  const runCwd = resolveNativeClaudeCwd(cwd, paths.projectsDir)
  const env = {
    ...process.env,
    HOME: paths.homeDir,
    USERPROFILE: paths.homeDir,
    APPDATA: path.join(paths.homeDir, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(paths.homeDir, 'AppData', 'Local'),
    CLAUDE_CONFIG_DIR: path.join(paths.homeDir, 'claude-config'),
    CLAUDE_CODE_PROJECTS_DIR: paths.projectsDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    PATH: `${path.dirname(paths.claude)}${path.delimiter}${process.env.PATH || ''}`,
    ...claudeCompatibleModelEnv(paths),
  }
  fs.mkdirSync(env.APPDATA, { recursive: true })
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true })
  fs.mkdirSync(path.join(paths.homeDir, '.claude'), { recursive: true })

  if (!isWindows) {
    const child = spawn(paths.claude, [], {
      cwd: runCwd,
      env,
      detached: true,
      stdio: 'ignore',
    })
    if (typeof child.unref === 'function') child.unref()
    return { ok: true, started: true, mode: 'native', cwd: runCwd, command: paths.claude }
  }

  const child = spawn(paths.claude, [], {
    cwd: runCwd,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  _nativeClaudeChild = child
  if (typeof child.unref === 'function') child.unref()
  return {
    ok: true,
    started: true,
    mode: 'native',
    cwd: runCwd,
    command: paths.claude,
    message: 'Claude Code native CLI is running in the background.',
    pid: child.pid || null,
    background: true,
    status,
  }
}

function stopNativeClaudeTerminal() {
  if (_nativeClaudeChild?.pid) {
    const pid = _nativeClaudeChild.pid
    _nativeClaudeChild = null
    const result = spawnSync('taskkill.exe', ['/F', '/T', '/PID', String(pid)], {
      encoding: 'utf8',
      windowsHide: true,
    })
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    if (result.status === 0) return { ok: true, stopped: true, message: 'Claude Code native background process stopped.', output, pid }
  }
  if (!isWindows) {
    return { ok: true, stopped: false, message: '当前平台未绑定 Claude Code 原生终端关闭动作。' }
  }
  const result = spawnSync('taskkill.exe', ['/F', '/T', '/FI', `WINDOWTITLE eq ${NATIVE_CLAUDE_WINDOW_TITLE}*`], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
  const noTask = /no tasks|没有运行|找不到|not found/i.test(output)
  if (result.status === 0 || noTask) {
    return {
      ok: true,
      stopped: !noTask,
      message: noTask ? '没有发现正在运行的 Claude Code 原生终端。' : 'Claude Code 原生终端已关闭。',
      output,
      windowTitle: NATIVE_CLAUDE_WINDOW_TITLE,
    }
  }
  throw new Error(output || '关闭 Claude Code 原生终端失败。')
}

async function claudeCodeStatus() {
  const paths = claudeCodePaths()
  fs.mkdirSync(paths.homeDir, { recursive: true })
  fs.mkdirSync(paths.projectsDir, { recursive: true })
  const env = {
    ...process.env,
    HOME: paths.homeDir,
    USERPROFILE: paths.homeDir,
    APPDATA: path.join(paths.homeDir, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(paths.homeDir, 'AppData', 'Local'),
    CLAUDE_CONFIG_DIR: path.join(paths.homeDir, 'claude-config'),
    CLAUDE_CODE_PROJECTS_DIR: paths.projectsDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ...claudeCompatibleModelEnv(paths),
  }
  fs.mkdirSync(env.APPDATA, { recursive: true })
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true })

  let version = null
  let versionError = ''
  if (fs.existsSync(paths.claude)) {
    const probe = spawnSync(paths.claude, ['--version'], {
      cwd: paths.projectsDir,
      env,
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    })
    const output = String(probe.stdout || probe.stderr || '').trim()
    if (probe.status === 0) version = output
    else versionError = output || probe.error?.message || `exit ${probe.status}`
  } else {
    versionError = 'Claude Code CLI file is missing'
  }

  const panel = claudePanelPaths(paths)
  const panelRunning = await claudePanelRunning(panel)
  const cliInstalled = fs.existsSync(paths.claude)
  const panelInstalled = fs.existsSync(panel.server)
  const panelRelayConnected = panelInstalled && panelRunning

  return {
    installed: cliInstalled || panelInstalled,
    connected: !!version || panelRelayConnected,
    running: panelRunning,
    mode: 'panel',
    runtimeMode: 'OPENAI_RELAY',
    needsPanel: true,
    message: 'Claude Code UI panel relay is available through the portable clean-claude-panel runtime.',
    version: version || (panelInstalled ? 'Claude Code Panel relay' : null),
    versionError: cliInstalled ? versionError : '',
    paths,
    url: panel.url,
    panelUrl: panel.url,
    panel: {
      installed: panelInstalled,
      running: panelRunning,
      url: panel.url,
      port: panel.port,
      dir: panel.dir,
      server: panel.server,
      dataDir: panel.dataDir,
    },
  }
}

// === Vite 插件 ===

// 初始化：密码检测 + 启动日志 + 定时清理
function _initApi() {
  const cfg = readPanelConfig()
  if (!cfg.accessPassword && !cfg.ignoreRisk) {
    cfg.ignoreRisk = true
    delete cfg.mustChangePassword
    if (!fs.existsSync(OPENCLAW_DIR)) fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
    fs.writeFileSync(panelConfigFilePath(), JSON.stringify(cfg, null, 2))
    invalidateConfigCache()
    console.log('[api] 首次启动：已跳过本地访问密码')
  }
  const pw = getAccessPassword()
  console.log('[api] API 已启动，配置目录:', OPENCLAW_DIR)
  console.log('[api] 平台:', isMac ? 'macOS' : process.platform)
  console.log('[api] 访问密码:', pw ? '已设置' : (cfg.ignoreRisk ? '无视风险模式（无密码）' : '未设置'))

  // 定时清理过期 session 和登录限速记录（每 10 分钟）
  setInterval(() => {
    const now = Date.now()
    for (const [token, session] of _sessions) {
      if (now > session.expires) _sessions.delete(token)
    }
    for (const [ip, record] of _loginAttempts) {
      if (record.lockedUntil && now >= record.lockedUntil) _loginAttempts.delete(ip)
    }
  }, 10 * 60 * 1000)
}

function _readHermesApiServerKey() {
  try {
    const envContent = fs.readFileSync(path.join(hermesHome(), '.env'), 'utf8')
    const m = envContent.match(/^API_SERVER_KEY=(.+)$/m)
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}

function _buildHermesRunInput(input, attachments = []) {
  const text = String(input || '').trim()
  const parts = []
  if (text) parts.push({ type: 'text', text })

  for (const item of Array.isArray(attachments) ? attachments : []) {
    const category = String(item?.category || item?.type || '').toLowerCase()
    const mimeType = String(item?.mimeType || item?.mediaType || item?.mime || 'image/png')
    if (category !== 'image' && !mimeType.toLowerCase().startsWith('image/')) continue

    let url = String(item?.url || item?.dataUrl || '').trim()
    const data = String(item?.content || item?.data || '').trim()
    if (!url && data) {
      url = data.startsWith('data:image/') ? data : `data:${mimeType};base64,${data}`
    }
    const lower = url.toLowerCase()
    if (!lower.startsWith('data:image/') && !lower.startsWith('http://') && !lower.startsWith('https://')) continue
    parts.push({ type: 'image_url', image_url: { url, detail: 'auto' } })
  }

  const hasImage = parts.some(part => part.type === 'image_url')
  if (!hasImage) return text
  if (!parts.some(part => part.type === 'text')) {
    parts.unshift({ type: 'text', text: '请分析我刚刚上传或粘贴的图片。' })
  }
  return [{ role: 'user', content: parts }]
}

const HERMES_HISTORY_MAX_MESSAGES = 24
const HERMES_HISTORY_MAX_CHARS = 12000

function _safeHermesSessionId(sessionId) {
  return String(sessionId || '').replace(/[^A-Za-z0-9._-]/g, '')
}

function _readHermesSessionMessages(sessionId) {
  const safeId = _safeHermesSessionId(sessionId)
  if (!safeId) return []
  const sessionPath = path.join(hermesHome(), 'sessions', `session_${safeId}.json`)
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionPath, 'utf8'))
    return Array.isArray(parsed.messages) ? parsed.messages : []
  } catch {
    return []
  }
}

function _normalizeHermesHistoryText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function _sameHermesHistoryText(left, right) {
  const a = _normalizeHermesHistoryText(left)
  const b = _normalizeHermesHistoryText(right)
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
}

function _compactHermesHistoryContent(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    const parts = []
    for (const item of content) {
      if (typeof item === 'string') {
        if (item.trim()) parts.push(item.trim())
        continue
      }
      if (!item || typeof item !== 'object') continue
      const type = String(item.type || '').toLowerCase()
      if ((type === 'text' || type === 'input_text' || !type) && typeof item.text === 'string') {
        if (item.text.trim()) parts.push(item.text.trim())
        continue
      }
      if (type === 'image' || type === 'input_image' || type === 'image_url' || item.image_url || item.source?.data) {
        parts.push('[image]')
      }
    }
    return parts.join('\n').trim()
  }
  if (content && typeof content === 'object') {
    return String(content.text || content.content || content.output || content.message || '').trim()
  }
  return ''
}

function _buildHermesConversationHistoryFromSession(sessionId, currentInput = '') {
  const messages = _readHermesSessionMessages(sessionId)
  if (!messages.length) return []

  const history = []
  let totalChars = 0
  for (const msg of messages) {
    const role = String(msg?.role || '').toLowerCase()
    if (!['system', 'user', 'assistant'].includes(role)) continue
    const content = _compactHermesHistoryContent(msg?.content)
    if (!content) continue
    history.push({ role, content })
  }

  while (history.length && history[history.length - 1].role === 'user' && _sameHermesHistoryText(history[history.length - 1].content, currentInput)) {
    history.pop()
  }

  const selected = []
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i]
    const size = String(item.content || '').length
    if (selected.length >= HERMES_HISTORY_MAX_MESSAGES) break
    if (selected.length && totalChars + size > HERMES_HISTORY_MAX_CHARS) break
    selected.push(item)
    totalChars += size
  }
  return selected.reverse()
}

function _readHermesExportSession(sessionId, timeout = 60000) {
  const safeId = _safeHermesSessionId(sessionId)
  if (!safeId) return null
  const result = runHermesSilent('hermes', ['sessions', 'export', '-', '--session-id', safeId], timeout)
  if (!result.ok || !result.stdout) return null
  let latest = null
  for (const line of result.stdout.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) continue
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object') latest = parsed
    } catch {}
  }
  return latest
}

function _hermesContentText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        return item.text || item.content || item.output || item.message || ''
      }
      return ''
    }).join('')
  }
  if (content && typeof content === 'object') {
    return content.text || content.content || content.output || content.message || ''
  }
  return ''
}

function _joinHermesAssistantText(left, right) {
  const a = String(left || '')
  const b = String(right || '')
  if (!a.trim()) return b
  if (!b.trim()) return a
  if (b.startsWith(a)) return b
  if (a.endsWith(b)) return a
  const needsSpace = /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b)
  return a + (needsSpace ? ' ' : '') + b
}

function _lastTurnHermesTailFromMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return { user: '', assistant: '', tools: [], messageCount: 0 }
  }
  let start = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') { start = i; break }
  }
  let assistant = ''
  const tools = []
  for (let i = Math.max(0, start + 1); i < messages.length; i += 1) {
    const msg = messages[i]
    if (msg?.role === 'assistant') {
      const content = _hermesContentText(msg.content)
      if (content.trim()) assistant = _joinHermesAssistantText(assistant, content)
    }
    if (msg?.role === 'tool') {
      const output = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
      if (String(output || '').trim()) {
        tools.push({
          tool: msg.name || msg.tool_name || msg.toolName || 'tool',
          output,
          tool_call_id: msg.tool_call_id || msg.call_id || '',
        })
      }
    }
  }
  return {
    user: start >= 0 ? _hermesContentText(messages[start]?.content) : '',
    assistant,
    tools,
    messageCount: messages.length,
  }
}

function _lastTurnHermesExportTail(sessionId, timeout = 60000) {
  const exported = _readHermesExportSession(sessionId, timeout)
  return _lastTurnHermesTailFromMessages(exported?.messages || [])
}

function _preferHermesCompletion(current, candidate) {
  const a = String(current || '')
  const b = String(candidate || '')
  if (!b.trim()) return a
  if (!a.trim()) return b
  if (b.length <= a.length) return a
  if (b.startsWith(a) || b.includes(a)) return b
  if (a.length <= 8 && b.length >= a.length + 4) return b
  if (b.length >= a.length + 24) return b
  return a
}

function _roughHermesTextMatches(left, right) {
  const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const a = norm(left)
  const b = norm(right)
  if (!a || !b) return true
  return a === b || a.includes(b) || b.includes(a)
}

function _lastTurnHermesToolOutputs(sessionId) {
  const messages = _readHermesSessionMessages(sessionId)
  if (!messages.length) return []
  let start = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') { start = i; break }
  }
  const tools = []
  for (let i = start + 1; i < messages.length; i += 1) {
    const msg = messages[i]
    if (msg?.role !== 'tool') continue
    const tool = msg.name || msg.tool_name || msg.toolName || 'tool'
    const output = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
    if (!String(output || '').trim()) continue
    tools.push({
      tool,
      output,
      tool_call_id: msg.tool_call_id || msg.call_id || '',
    })
  }
  return tools
}

function _lastTurnHermesAssistantOutput(sessionId) {
  const messages = _readHermesSessionMessages(sessionId)
  return _lastTurnHermesTailFromMessages(messages).assistant
}

function _lastTurnHermesAssistantOutputFresh(sessionId, input, afterMessageCount, current = '', timeoutMs = 12000) {
  const started = Date.now()
  let best = String(current || '')
  if (!afterMessageCount) return best
  while (Date.now() - started < timeoutMs) {
    const tail = _lastTurnHermesExportTail(sessionId, 15000)
    const isFresh = !afterMessageCount || tail.messageCount > afterMessageCount
    const isSameTurn = _roughHermesTextMatches(tail.user, input)
    if (isFresh && isSameTurn && tail.assistant.trim()) {
      best = _preferHermesCompletion(best, tail.assistant)
      if (best.length > String(current || '').length || String(current || '').trim().length >= 8) return best
    }
    _sleepSync(500)
  }
  return best
}

function _assistantOutputFromHermesTools(sessionId) {
  const tools = _lastTurnHermesToolOutputs(sessionId)
  if (!tools.length) return ''
  const last = tools[tools.length - 1]
  const toolName = String(last.tool || 'tool')
  let parsed = null
  try { parsed = JSON.parse(last.output) } catch {}
  if (parsed && typeof parsed === 'object') {
    const ok = parsed.ok !== false
    if (toolName.includes('cloudcode')) {
      const text = String(parsed.text || (Array.isArray(parsed.errors) ? parsed.errors.join('\n') : '') || '').trim()
      const status = ok ? 'CloudCode 已执行完成' : 'CloudCode 执行失败'
      return `${status}${text ? `：\n${text}` : '，结果可在工具详情里查看。'}\n\n需要我帮你把 CloudCode 页面单独打开吗？`
    }
    if (toolName.includes('openclaw')) {
      const text = String(parsed.text || parsed.stdout || parsed.result?.text || parsed.result?.output || '').trim()
      const status = ok ? 'OpenClaw 已执行完成' : 'OpenClaw 执行失败'
      return `${status}${text ? `：\n${text}` : '，结果可在工具详情里查看。'}\n\n需要我帮你把 OpenClaw 页面单独打开吗？`
    }
    if (toolName === 'superclaw_status') {
      const openclaw = parsed.openclaw?.healthy ? '正常' : '异常'
      const cloudcode = parsed.cloudcode?.healthy ? '正常' : '异常'
      return `状态检查完成：OpenClaw ${openclaw}，CloudCode ${cloudcode}。如果你要让我派发具体任务，我会继续调用对应工作端执行。`
    }
  }
  return `${toolName} 已执行完成，结果可在工具详情里查看。`
}

function _sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  } catch {}
}

function _waitForHermesSessionTail(sessionId, timeoutMs = 180000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (_lastTurnHermesToolOutputs(sessionId).length || _lastTurnHermesAssistantOutput(sessionId).trim()) return true
    _sleepSync(500)
  }
  return false
}

function _writeStreamEvent(res, event) {
  if (res.writableEnded || res.destroyed) return
  res.write(JSON.stringify(event) + '\n')
}

function _endStream(res) {
  if (!res.writableEnded && !res.destroyed) res.end()
}

function normalizeHermesStreamText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(normalizeHermesStreamText).join('')
  if (value && typeof value === 'object') {
    return normalizeHermesStreamText(
      value.delta ?? value.text_delta ?? value.content_delta
      ?? value.output ?? value.result ?? value.content
      ?? value.response ?? value.message ?? value.data ?? ''
    )
  }
  return String(value)
}

function createHermesStreamDedupeState() {
  return { emittedText: '', finalText: '', finalSent: false, terminalSent: false }
}

function emitHermesStreamDelta(state, incomingText, options = {}) {
  const text = normalizeHermesStreamText(incomingText)
  if (!text) return ''
  const mode = options.mode === 'snapshot' ? 'snapshot' : 'delta'
  const emitted = String(state.emittedText || '')
  let delta = ''

  if (text === emitted || (emitted && emitted.endsWith(text))) {
    delta = ''
  } else if (text.startsWith(emitted)) {
    delta = text.slice(emitted.length)
  } else if (mode === 'snapshot') {
    delta = ''
  } else {
    delta = text
  }

  state.finalText = _preferHermesCompletion(state.finalText, text)
  if (delta) {
    state.emittedText = emitted + delta
    state.finalText = _preferHermesCompletion(state.finalText, state.emittedText)
  }
  return delta
}

function finalizeHermesStreamMessage(state, finalText = '') {
  const delta = emitHermesStreamDelta(state, finalText, { mode: 'snapshot' })
  const output = _preferHermesCompletion(state.finalText, state.emittedText)
  const final = Boolean(output && !state.finalSent)
  if (final) state.finalSent = true
  return { delta, output, final }
}

function finalizeHermesStreamDedupe(state, finalText = '') {
  const message = finalizeHermesStreamMessage(state, finalText)
  const terminal = !state.terminalSent
  if (terminal) state.terminalSent = true
  return { ...message, terminal }
}

function _splitHermesMediaLines(text) {
  const mediaLines = []
  const visibleLines = []
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^\s*MEDIA\s*:/i.test(line)) mediaLines.push(line.trim())
    else visibleLines.push(line)
  }
  return { mediaLines, visibleText: visibleLines.join('\n').trim() }
}

function sanitizeHermesImageReply(text, options = {}) {
  return sanitizeMediaVisibleText(text, {
    imageTask: options.imageTask,
    maxLength: options.maxLength || 140,
  })

  const raw = String(text || '')
  const { mediaLines, visibleText } = _splitHermesMediaLines(raw)
  const imageTask = Boolean(options.imageTask || mediaLines.length)
  if (!imageTask) return raw

  const unsafeVisible = /(^|\b)(prompt|image_prompt|negative_prompt)\b|图片提示词|提示词\s*[:：]|生成提示词|raw json|tool args|^\s*[{[]/i.test(visibleText)
  const maxLength = Number(options.maxLength || 140)
  let cleaned = visibleText

  if (!cleaned || unsafeVisible || cleaned.length > maxLength) {
    cleaned = mediaLines.length ? '图片已返回。' : '图片内容已返回。'
  }

  return [...mediaLines, cleaned].filter(Boolean).join('\n')
}

async function _handleHermesAgentRunStream(req, res, args = {}) {
  const controller = new AbortController()
  // Keep the Hermes run alive even if the browser stream goes quiet. The
  // /events endpoint may return empty just before the model finishes, and we
  // poll /v1/runs/{id} below for the authoritative final output.

  let runId = ''
  let finalOutput = ''
  let emittedOutput = ''
  let upstreamRunCompleted = false
  let sessionStartMessageCount = 0
  const emittedToolOutputs = new Set()
  const streamDedupe = createHermesStreamDedupeState()
  try {
    const gwUrl = hermesGatewayUrl()
    await handlers._hermesEnsureGatewayReady()
    if (args.sessionId) sessionStartMessageCount = _readHermesSessionMessages(args.sessionId).length || 0
    const apiKey = _readHermesApiServerKey()
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'ClawPanel-Web' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const effectiveAgentName = resolveAgentIdentityName(args.agentName || args.agent_name, 'hermes')
    const payload = {
      input: _buildHermesRunInput(args.input || '', args.attachments || []),
      agentName: effectiveAgentName,
      agent_name: effectiveAgentName,
    }
    if (args.sessionId) payload.session_id = args.sessionId
    const bridgedHistory = Array.isArray(args.conversationHistory)
      ? args.conversationHistory
      : _buildHermesConversationHistoryFromSession(args.sessionId, args.input || '')
    if (Array.isArray(bridgedHistory)) payload.conversation_history = bridgedHistory
    const effectiveInstructions = withAgentIdentityInstructions(args.instructions, effectiveAgentName)
    if (effectiveInstructions) payload.instructions = effectiveInstructions

    const startedResp = await globalThis.fetch(`${gwUrl}/v1/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!startedResp.ok) {
      const text = await startedResp.text()
      throw new Error(`HTTP ${startedResp.status}: ${text}`)
    }
    const started = await startedResp.json()
    runId = started.run_id || started.id || ''
    if (!runId) throw new Error('响应中没有 run_id')
    const responseSessionId = started.session_id || started.sessionId || args.sessionId || null

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()
    _writeStreamEvent(res, { event: 'run.started', run_id: runId, session_id: responseSessionId, clientRequestId: args.clientRequestId || null })

    const eventsResp = await globalThis.fetch(`${gwUrl}/v1/runs/${encodeURIComponent(runId)}/events`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'ClawPanel-Web' } : { 'User-Agent': 'ClawPanel-Web' },
    })
    if (!eventsResp.ok || !eventsResp.body) {
      const text = await eventsResp.text().catch(() => '')
      throw new Error(`SSE HTTP ${eventsResp.status}: ${text}`)
    }

    const reader = eventsResp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const fetchRunCompletion = async (timeoutMs = 120000) => {
      const deadline = Date.now() + timeoutMs
      let best = ''
      while (Date.now() < deadline) {
        if (res.writableEnded || res.destroyed) return best
        let info = null
        try {
          const statusResp = await globalThis.fetch(`${gwUrl}/v1/runs/${encodeURIComponent(runId)}`, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'ClawPanel-Web' } : { 'User-Agent': 'ClawPanel-Web' },
          })
          if (statusResp.ok) info = await statusResp.json()
        } catch (e) {
          if (e?.name === 'AbortError') return best
        }
        const status = String(info?.status || '').toLowerCase()
        const output = valueFrom(info || {}, ['output', 'result', 'content', 'response', 'message', 'data'])
        if (output) best = _preferHermesCompletion(best, output)
        if (status === 'completed' || info?.last_event === 'run.completed') return best
        if (status === 'failed' || info?.last_event === 'run.failed') {
          const err = valueFrom(info || {}, ['error', 'message', 'detail']) || 'Hermes run failed'
          throw new Error(err)
        }
          _writeStreamEvent(res, { event: 'run.progress', run_id: runId, session_id: responseSessionId, status: status || 'running' })
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      return best
    }
    const finishRun = (output = finalOutput) => {
      let completedOutput = typeof output === 'string' ? output : ''
      if (!completedOutput.trim()) {
        completedOutput = _lastTurnHermesAssistantOutputFresh(
          args.sessionId,
          args.input || '',
          sessionStartMessageCount,
          finalOutput,
          3500
        ) || finalOutput || _assistantOutputFromHermesTools(args.sessionId)
      }
      completedOutput = sanitizeAgentIdentityOutput(
        sanitizeHermesImageReply(completedOutput, { input: args.input || '' }),
        effectiveAgentName,
        args.input || '',
      )
      const completed = finalizeHermesStreamDedupe(streamDedupe, completedOutput)
      if (completed.delta) {
        _writeStreamEvent(res, { event: 'message.delta', run_id: runId, session_id: responseSessionId, clientRequestId: args.clientRequestId || null, delta: completed.delta, synthetic: true })
        emittedOutput = streamDedupe.emittedText
        finalOutput = streamDedupe.finalText || streamDedupe.emittedText
      }
      flushSessionToolOutputs()
      const stableOutput = completed.output || completedOutput || finalOutput
      if (completed.final && stableOutput) {
        _writeStreamEvent(res, { event: 'message.final', run_id: runId, clientRequestId: args.clientRequestId || null, output: stableOutput, session_id: responseSessionId })
      }
      if (completed.terminal) {
        _writeStreamEvent(res, { event: 'run.completed', run_id: runId, clientRequestId: args.clientRequestId || null, output: stableOutput, session_id: responseSessionId })
      }
      _endStream(res)
    }
    const textFromValue = (value) => {
      if (typeof value === 'string') return value
      if (Array.isArray(value)) return value.map(textFromValue).join('')
      if (value && typeof value === 'object') {
        return textFromValue(
          value.delta ?? value.text_delta ?? value.content_delta
          ?? value.choices ?? value.text ?? value.content ?? value.output
          ?? value.response ?? value.message ?? value.data ?? ''
        )
      }
      return ''
    }
    const valueFrom = (obj, keys) => {
      for (const key of keys) {
        const value = textFromValue(obj?.[key])
        if (value) return value
      }
      return ''
    }
    const toolOutputKey = (tool) => `${tool.tool || ''}|${tool.tool_call_id || ''}|${String(tool.output || '').slice(0, 80)}`
    const flushSessionToolOutputs = () => {
      for (const tool of _lastTurnHermesToolOutputs(args.sessionId)) {
        const key = toolOutputKey(tool)
        if (emittedToolOutputs.has(key)) continue
        emittedToolOutputs.add(key)
        _writeStreamEvent(res, {
          event: 'tool.completed',
          run_id: runId,
          session_id: responseSessionId,
          tool: tool.tool,
          output: tool.output,
          result: tool.output,
          preview: '工具执行完成',
          synthetic: true,
        })
      }
    }
    const normalizeHermesEvent = (evt) => {
      if (!evt || typeof evt !== 'object') return null
      const eventName = evt.event || evt.type || evt.name || ''
      const delta = valueFrom(evt, ['delta', 'text_delta', 'content_delta', 'choices', 'data'])
      const output = valueFrom(evt, ['output', 'result', 'content', 'response', 'message', 'choices', 'data'])
      const textDelta = delta || output
      if (eventName === 'message.delta' || eventName === 'delta' || eventName === 'text.delta') {
        return { ...evt, event: 'message.delta', delta: textDelta, streamMode: delta ? 'delta' : 'snapshot' }
      }
      if (eventName === 'message' && output) {
        return { ...evt, event: 'message.delta', delta: output, snapshot: true, streamMode: 'snapshot' }
      }
      if (eventName === 'message.final') {
        return { ...evt, event: 'message.final', output }
      }
      if (eventName === 'run.completed' || eventName === 'completed' || eventName === 'done') {
        return { ...evt, event: 'run.completed', output }
      }
      if (eventName === 'run.failed' || eventName === 'failed' || eventName === 'error') {
        return { ...evt, event: 'run.failed', error: evt.error || output || 'unknown error' }
      }
      if (eventName.startsWith('tool.')) return evt
      return evt.event ? evt : (output ? { ...evt, event: 'message.delta', delta: output, snapshot: true, streamMode: 'snapshot' } : evt)
    }
    const handleEventPayload = (data) => {
      if (!data || data === '[DONE]') return false
      let evt
      try { evt = JSON.parse(data) } catch { return false }
      evt = normalizeHermesEvent(evt)
      if (!evt) return false
      if (!evt.run_id) evt.run_id = runId
      if (!evt.session_id && responseSessionId) evt.session_id = responseSessionId
      if (!evt.clientRequestId && args.clientRequestId) evt.clientRequestId = args.clientRequestId
      if (evt.event === 'message.delta' && typeof evt.delta === 'string') {
        const incoming = sanitizeAgentIdentityOutput(
          sanitizeHermesImageReply(evt.delta, { input: args.input || '' }),
          effectiveAgentName,
          args.input || '',
        )
        const delta = emitHermesStreamDelta(streamDedupe, incoming, {
          mode: evt.snapshot || evt.streamMode === 'snapshot' ? 'snapshot' : 'delta',
        })
        if (!delta) return false
        evt.delta = delta
        finalOutput = streamDedupe.finalText || streamDedupe.emittedText
        emittedOutput = streamDedupe.emittedText
      }
      if (evt.event === 'run.completed' && typeof evt.output === 'string' && evt.output) {
        const incoming = sanitizeAgentIdentityOutput(
          sanitizeHermesImageReply(evt.output, { input: args.input || '' }),
          effectiveAgentName,
          args.input || '',
        )
        const missingDelta = emitHermesStreamDelta(streamDedupe, incoming, { mode: 'snapshot' })
        if (missingDelta) {
          _writeStreamEvent(res, { event: 'message.delta', run_id: runId, session_id: responseSessionId, clientRequestId: args.clientRequestId || null, delta: missingDelta, synthetic: true })
          emittedOutput = streamDedupe.emittedText
        }
        finalOutput = streamDedupe.finalText || incoming
      }
      if (evt.event === 'message.final') {
        const incoming = sanitizeAgentIdentityOutput(
          sanitizeHermesImageReply(evt.output || '', { input: args.input || '' }),
          effectiveAgentName,
          args.input || '',
        )
        const finalized = finalizeHermesStreamMessage(streamDedupe, incoming)
        if (finalized.delta) {
          _writeStreamEvent(res, { event: 'message.delta', run_id: runId, session_id: responseSessionId, clientRequestId: args.clientRequestId || null, delta: finalized.delta, synthetic: true })
          emittedOutput = streamDedupe.emittedText
        }
        finalOutput = finalized.output || finalOutput
        if (!finalized.final) return false
        evt.output = finalized.output
      }
      if (evt.event === 'run.completed') {
        upstreamRunCompleted = true
        return false
      }
      if (evt.event === 'tool.completed') {
        const existing = valueFrom(evt, ['output', 'result', 'content', 'data', 'response'])
        if (existing) {
          emittedToolOutputs.add(toolOutputKey({ tool: evt.tool || evt.tool_name || evt.name || 'tool', tool_call_id: evt.tool_call_id || '', output: existing }))
        } else {
          const toolName = evt.tool || evt.tool_name || evt.name || 'tool'
          const found = _lastTurnHermesToolOutputs(args.sessionId).reverse().find(item => item.tool === toolName)
          if (found) {
            evt.output = found.output
            evt.result = found.output
            evt.preview = evt.preview || '工具执行完成'
            emittedToolOutputs.add(toolOutputKey(found))
          }
        }
      }
      _writeStreamEvent(res, evt)
      if (evt.event === 'run.failed') {
        _endStream(res)
        return true
      }
      return false
    }
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          if (line.startsWith('event:')) continue
          const data = line.startsWith('data:') ? line.slice(5).trim() : line
          if (handleEventPayload(data)) return
        }
      }
      const tail = buffer.trim()
      if (tail) handleEventPayload(tail)
    } finally {
      try { reader.releaseLock() } catch {}
    }

    const statusOutput = await fetchRunCompletion(upstreamRunCompleted ? 3000 : 120000)
    if (statusOutput) finalOutput = _preferHermesCompletion(finalOutput, statusOutput)
    finishRun(upstreamRunCompleted ? finalOutput : finalOutput)
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e.message || String(e) }))
      return
    }
    _writeStreamEvent(res, {
      event: 'run.failed',
      run_id: runId || null,
      session_id: responseSessionId,
      error: e.name === 'AbortError' ? 'aborted' : (e.message || String(e)),
    })
    _endStream(res)
  }
}

async function _apiMiddleware(req, res, next) {
  let requestUrl = null
  try {
    requestUrl = new URL(req.url || '/', 'http://127.0.0.1')
  } catch {}
  if (requestUrl && sendHermesMediaFileResponse(req, res, requestUrl)) return
  if (requestUrl && await handleAuthYyapiKitRestApi(req, res, requestUrl)) return

  if (!req.url?.startsWith('/__api/')) return next()

  const rawPath = req.url.slice('/__api/'.length).split(/[?#]/)[0]
  let cmd = ''
  try {
    cmd = decodeURIComponent(rawPath)
  } catch {
    cmd = rawPath
  }
  if (!cmd) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing API command' }))
    return
  }

  if (cmd === 'dev/agents/status') {
    if (!isLocalRequest(req)) {
      sendJsonResponse(res, 403, { error: 'Local requests only' })
      return
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJsonResponse(res, 200, await devAgentsStatus(requestUrl?.searchParams?.get('agent') || null))
    return
  }

  if (cmd === 'dev/agents/start') {
    if (!isLocalRequest(req)) {
      sendJsonResponse(res, 403, { error: 'Local requests only' })
      return
    }
    if (req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return
    }
    const args = await readBody(req)
    const result = await startDevAgent(args.agent)
    sendJsonResponse(res, 200, result)
    return
  }

  if (cmd === 'dev/agents/stop') {
    if (!isLocalRequest(req)) {
      sendJsonResponse(res, 403, { error: 'Local requests only' })
      return
    }
    if (req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return
    }
    const args = await readBody(req)
    sendJsonResponse(res, 200, await stopDevAgent(args.agent))
    return
  }

  if (cmd === 'dev/agents/stop-all') {
    if (!isLocalRequest(req)) {
      sendJsonResponse(res, 403, { error: 'Local requests only' })
      return
    }
    if (req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return
    }
    await readBody(req)
    sendJsonResponse(res, 200, await stopAllDevAgents())
    return
  }

  if (cmd === 'openclaw/skills/delete') {
    if (!isLocalRequest(req)) {
      sendJsonResponse(res, 403, { error: 'Local requests only' })
      return
    }
    if (req.method !== 'POST') {
      sendJsonResponse(res, 405, { error: 'Method not allowed' })
      return
    }
    try {
      const args = await readBody(req)
      const source = String(args.source || '').toLowerCase()
      if (source.includes('claude') || source.includes('hermes')) {
        sendJsonResponse(res, 400, { error: 'Only OpenClaw skills can be deleted' })
        return
      }
      const name = validateOpenClawSkillDeleteName(args.skillId || args.name)
      const result = handlers.skills_uninstall({
        name,
        agent_id: args.agent_id || args.agentId || null,
      })
      sendJsonResponse(res, 200, { ...result, skillId: name })
    } catch (e) {
      sendJsonResponse(res, Number(e.statusCode || e.status || 400) || 400, { error: e.message || String(e), code: e.code || undefined })
    }
    return
  }

  if (cmd === 'hermes_agent_run_stream') {
    try {
      const args = await readBody(req)
      await _handleHermesAgentRunStream(req, res, args)
    } catch (e) {
      if (!res.headersSent) {
        res.statusCode = Number(e.statusCode || e.status || 500) || 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: e.message || String(e), code: e.code || undefined }))
      } else {
        _writeStreamEvent(res, { event: 'run.failed', error: e.message || String(e), code: e.code || undefined })
        _endStream(res)
      }
    }
    return
  }

  const handler = handlers[cmd]

  if (!handler) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: `未实现的命令: ${cmd}` }))
    return
  }

  try {
    const args = await readBody(req)
    const result = await handler(args)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  } catch (e) {
    res.statusCode = Number(e.statusCode || e.status || 500) || 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: e.message || String(e), code: e.code || undefined }))
  }
}

// 导出供 serve.js 独立部署使用
export {
  _initApi,
  _apiMiddleware,
  createHermesStreamDedupeState,
  emitHermesStreamDelta,
  filterHermesSessionsForUi,
  finalizeHermesStreamDedupe,
  finalizeHermesStreamMessage,
  isHermesSmokeOrFixtureSession,
  normalizeHermesStreamText,
  rememberHermesDeletedSession,
  sanitizeHermesImageReply,
  isHermesDeletedSessionId,
}

export function devApiPlugin() {
  let _inited = false
  function ensureInit() {
    if (_inited) return
    _inited = true
    _initApi()
  }
  return {
    name: 'clawpanel-dev-api',
    configureServer(server) {
      ensureInit()
      server.middlewares.use(_apiMiddleware)
    },
    configurePreviewServer(server) {
      ensureInit()
      server.middlewares.use(_apiMiddleware)
    },
  }
}
