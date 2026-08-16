import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

const ANALYZER_PATH = 'src-tauri/resources/runtime/ocr/video-frame-analyzer.cjs'
const BROWSER_COOKIES_PATH = 'src-tauri/resources/runtime/ocr/browser-cookies.cjs'
const ASSISTANT_RS_PATH = 'src-tauri/src/commands/assistant.rs'
const LIB_RS_PATH = 'src-tauri/src/lib.rs'
const CHAT_JS_PATH = 'src/engines/hermes/pages/chat.js'
const DEV_API_PATH = 'scripts/dev-api.js'
const TAURI_API_PATH = 'src/lib/tauri-api.js'

function read(relativePath) {
  assert.ok(existsSync(relativePath), `missing ${relativePath}`)
  return readFileSync(relativePath, 'utf8')
}

const analyzerSource = read(ANALYZER_PATH)
const browserCookiesSource = read(BROWSER_COOKIES_PATH)
const assistantRs = read(ASSISTANT_RS_PATH)
const libRs = read(LIB_RS_PATH)
const chatSource = read(CHAT_JS_PATH)
const devApiSource = read(DEV_API_PATH)
const tauriApiSource = read(TAURI_API_PATH)

test('local video analyzer script exists and bundles the cleanup + login contract', () => {
  assert.match(analyzerSource, /yt-dlp/, 'analyzer should use bundled yt-dlp')
  assert.match(analyzerSource, /ffprobe/, 'analyzer should probe with bundled ffprobe')
  assert.match(analyzerSource, /ffmpeg/, 'analyzer should extract frames with bundled ffmpeg')
  assert.match(analyzerSource, /tesseract/, 'analyzer should OCR frames with tesseract.js')
  // Requirement #4: downloaded files must be deleted after analysis.
  assert.match(analyzerSource, /caller owns the directory/, 'with --work-dir the caller owns cleanup so it survives a timeout kill')
  assert.match(analyzerSource, /timeout kill/, 'cleanup contract explicitly covers a timeout kill')
  assert.match(analyzerSource, /rmSync\(workDir/, 'script removes its own temp dir when it created it')
  // Requirement #2: login-required detection.
  assert.match(analyzerSource, /loginRequired\s*:\s*true/, 'analyzer surfaces loginRequired flag')
  assert.match(analyzerSource, /detectLoginRequired/, 'analyzer has login-required detection')
})

test('Rust backend defines and registers assistant_analyze_video_url', () => {
  assert.match(assistantRs, /pub\s+async\s+fn\s+assistant_analyze_video_url\b/)
  assert.match(assistantRs, /LOGIN_REQUIRED/, 'Rust surfaces LOGIN_REQUIRED error code')
  assert.match(assistantRs, /UNSUPPORTED_PLATFORM/, 'Rust rejects non-target platforms (no VPN-required platforms)')
  assert.match(assistantRs, /remove_dir_all\(&work_dir\)/, 'Rust cleans up the temp work dir after analysis')
  assert.match(libRs, /assistant::assistant_analyze_video_url/)
})

test('frontend api surface exposes assistantAnalyzeVideoUrl', () => {
  assert.match(tauriApiSource, /assistantAnalyzeVideoUrl:\s*\(url/)
  assert.match(tauriApiSource, /invoke\('assistant_analyze_video_url'/)
})

test('dev-api mirror implements analyzeVideoUrl and registers the command', () => {
  assert.match(devApiSource, /function\s+analyzeVideoUrl\b/)
  assert.match(devApiSource, /async\s+assistant_analyze_video_url\b/)
  assert.match(devApiSource, /'assistant_analyze_video_url'/)
  assert.match(devApiSource, /rmSync\(workDir/, 'dev mirror cleans up temp work dir after analysis')
  assert.match(devApiSource, /JSON\.parse\(stdout\)/, 'dev mirror passes through the analyzer JSON result (incl. loginRequired)')
  assert.match(devApiSource, /--cdp-port/, 'dev mirror forwards cdpPort to the analyzer')
})

test('dev-api mirror implements the managed-login commands', () => {
  assert.match(devApiSource, /function\s+managedLogin\b/, 'dev mirror has managedLogin helper')
  assert.match(devApiSource, /function\s+managedLoginClose\b/, 'dev mirror has managedLoginClose helper')
  assert.match(devApiSource, /--open-login/, 'dev mirror launches the managed browser login window')
  assert.match(devApiSource, /--close/, 'dev mirror closes the managed browser')
  assert.match(devApiSource, /assistant_managed_login\b/, 'dev mirror registers assistant_managed_login')
  assert.match(devApiSource, /assistant_managed_login_close\b/, 'dev mirror registers assistant_managed_login_close')
})

test('Hermes chat integration drives local video analysis for supported platforms', () => {
  assert.match(chatSource, /function\s+isLocalAnalyzerSupportedPlatform\b/)
  assert.match(chatSource, /function\s+analyzeVideoUrlWithTimeout\b/)
  assert.match(chatSource, /function\s+formatLocalVideoAnalysisForPrompt\b/)
  assert.match(chatSource, /function\s+videoLinkReadToast\b/)
  // Requirement #1: only non-VPN platforms (douyin/kuaishou/xiaohongshu/bilibili).
  assert.match(chatSource, /isLocalAnalyzerSupportedPlatform\b[\s\S]*?\.some\(/)
  assert.match(chatSource, /bilibili\.com/, 'bilibili is a supported local-analyzer platform')
  assert.match(chatSource, /loginRequired/, 'login-required state is surfaced in chat flow')
  // Requirement #3: reuse existing Hermes analysis flow, do not bypass assistant_fetch_url.
  assert.match(chatSource, /\bassistantFetchUrlWithTimeout\b/, 'public fetch fallback remains wired')
  assert.match(chatSource, /\bformatVideoLinkAnalysisRequest\b/, 'existing analysis request formatter is reused')
  assert.match(chatSource, /\bbuildHermesVideoLinkAnalysisPayload\b/, 'existing payload builder drives the flow')
  assert.doesNotMatch(chatSource, /\bfetch\s*\(\s*url\s*\)/)
})

test('video analyzer supports only non-VPN target platforms in the Rust guard', () => {
  assert.match(assistantRs, /douyin/, 'douyin supported')
  assert.match(assistantRs, /kuaishou/, 'kuaishou supported')
  assert.match(assistantRs, /xiaohongshu/, 'xiaohongshu supported')
  assert.match(assistantRs, /bilibili/, 'bilibili supported')
  // YouTube/TikTok are not part of the local-download guard, so they must not
  // be listed in the `supported` host set for the analyzer command.
  const supportedHostSet = assistantRs.split('assistant_analyze_video_url')[1] || ''
  const hostGuard = supportedHostSet.slice(0, supportedHostSet.indexOf('let ocr_runtime'))
  assert.doesNotMatch(hostGuard, /youtube/, 'YouTube must not be a local-analyzer platform')
  assert.doesNotMatch(hostGuard, /tiktok/, 'TikTok must not be a local-analyzer platform')
})

test('managed-browser cookie helper exists and speaks CDP for login-gated downloads', () => {
  assert.match(browserCookiesSource, /Chrome DevTools Protocol/, 'helper is CDP-based')
  assert.match(browserCookiesSource, /Network\.getAllCookies/, 'helper dumps cookies via CDP getAllCookies')
  assert.match(browserCookiesSource, /--remote-debugging-port/, 'helper launches browser with remote debugging')
  assert.match(browserCookiesSource, /cookiesToNetscape/, 'helper serializes Netscape cookies.txt for yt-dlp')
  assert.match(browserCookiesSource, /dumpCookiesToFile/, 'helper exports dumpCookiesToFile')
  assert.match(browserCookiesSource, /--open-login/, 'helper has open-login mode')
  assert.match(browserCookiesSource, /--dump-cookies/, 'helper has dump-cookies mode')
  assert.match(browserCookiesSource, /--close/, 'helper has close mode')
})

test('analyzer accepts --cdp-port / --cookies-file and surfaces LOGIN_WINDOW_CLOSED', () => {
  assert.match(analyzerSource, /--cdp-port/, 'analyzer parses --cdp-port')
  assert.match(analyzerSource, /--cookies-file/, 'analyzer parses --cookies-file')
  assert.match(analyzerSource, /dumpCookiesToFile/, 'analyzer dumps managed-browser cookies via CDP')
  assert.match(analyzerSource, /LOGIN_WINDOW_CLOSED/, 'analyzer reports LOGIN_WINDOW_CLOSED when the login window died')
  assert.match(analyzerSource, /--cookies/, 'analyzer feeds the dumped cookies.txt to yt-dlp')
})

test('Rust backend exposes managed-login commands and threads cdp_port', () => {
  assert.match(assistantRs, /assistant_managed_login\b/, 'Rust has assistant_managed_login')
  assert.match(assistantRs, /assistant_managed_login_close\b/, 'Rust has assistant_managed_login_close')
  assert.match(assistantRs, /cdp_port:\s*Option<u64>/, 'analyze command accepts cdp_port')
  assert.match(assistantRs, /--cdp-port/, 'analyze command forwards --cdp-port to the analyzer')
  assert.match(libRs, /assistant::assistant_managed_login\b/, 'managed login is registered')
  assert.match(libRs, /assistant::assistant_managed_login_close\b/, 'managed login close is registered')
})

test('frontend api surface exposes the managed-login commands', () => {
  assert.match(tauriApiSource, /assistantManagedLogin:\s*\(url/, 'tauri-api exposes assistantManagedLogin')
  assert.match(tauriApiSource, /assistantManagedLoginClose:\s*\(port/, 'tauri-api exposes assistantManagedLoginClose')
})

test('Hermes chat drives the managed-login window and retries with the CDP port', () => {
  assert.match(chatSource, /showVideoLoginModal\b/, 'login modal exists')
  assert.match(chatSource, /打开内置登录窗口/, 'login modal offers the managed-browser window')
  assert.match(chatSource, /assistantManagedLogin\(/, 'login modal calls assistantManagedLogin')
  assert.match(chatSource, /mode:\s*'managed'/, 'login modal resolves a managed mode with the CDP port')
  assert.match(chatSource, /managedLogin\s*=\s*\{\s*port/, 'call sites pass managedLogin.port into the retry')
  assert.match(chatSource, /assistantManagedLoginClose\(/, 'call sites close the managed window after retry')
  assert.match(chatSource, /analyzeVideoUrlWithTimeout\(url,\s*cookiesBrowser,\s*managedLogin\)/, 'analyzer receives managedLogin')
})

test('analyzer auto-generates fresh cookies via headless CDP on cookie/login failures', () => {
  assert.match(analyzerSource, /function\s+shouldAutoRetryWithCookies\b/, 'analyzer detects cookie/login retryable failures')
  assert.match(analyzerSource, /function\s+autoGenerateCookies\b/, 'analyzer auto-generates cookies')
  assert.match(analyzerSource, /headless:\s*true/, 'auto cookie generation runs headless')
  assert.match(analyzerSource, /sc-auto-cookies-/, 'auto cookie browser uses a temp profile')
  assert.match(analyzerSource, /rmSync\(profileDir/, 'auto cookie temp profile is cleaned up')
  assert.match(analyzerSource, /Fresh cookies/, 'analyzer documents the Douyin fresh-cookie requirement')
  assert.match(analyzerSource, /cookiesFilePath\s*=\s*autoCookies/, 'auto-generated cookies are used for the yt-dlp retry')
  // The auto fallback must not override an explicit --cdp-port (managed login) session.
  assert.match(analyzerSource, /!usedManagedCdp/, 'auto fallback is skipped when a managed CDP session is already in use')
})

test('Hermes chat prefers public-fetch content over a local-analyzer error', () => {
  const snippet = chatSource.slice(chatSource.indexOf('// 2) 公开页面抓取'))
  assert.match(snippet, /isFetchedContentFailure\(content\)/, 'chat checks whether public-fetch content is a failure')
  assert.match(snippet, /fetchedContent\s*=\s*content/, 'chat overwrites analyzer error with successful public-fetch content')
  assert.match(snippet, /if\s*\(!fetchedContent\)/, 'chat keeps the analyzer error only when public fetch also fails')
})
