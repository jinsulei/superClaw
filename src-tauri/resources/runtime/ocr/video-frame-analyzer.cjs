#!/usr/bin/env node
'use strict'

// SuperClaw local video download + frame-extraction (抽帧) analysis helper.
//
// Bundled under resources/runtime/ocr/ so it can reuse the shared OCR runtime
// (tesseract.js + tessdata) and the portable video toolchain
// (resources/runtime/video-tools/yt-dlp, ffmpeg, ffprobe).
//
// Usage:
//   node video-frame-analyzer.cjs --url <video-url> --work-dir <dir> [--frames 6]
//
// Emits a single JSON object on stdout:
//   success:  { ok:true, duration, title, frames:[{time,timeLabel,text}], workDir }
//   login:    { ok:false, loginRequired:true, errorCode:"LOGIN_REQUIRED", message }
//   failure:  { ok:false, errorCode, message }
//
// Cleanup contract: when --work-dir is supplied the caller owns the directory
// and must delete it after reading the result (this also covers the case where
// the process is killed by a timeout, so `finally` never runs). When --work-dir
// is omitted the script creates a temp directory and removes it itself.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

const OCR_RUNTIME_DIR = __dirname
const VIDEO_TOOLS_DIR = path.join(OCR_RUNTIME_DIR, '..', 'video-tools')
const YTDLP = path.join(
  VIDEO_TOOLS_DIR,
  'yt-dlp',
  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
)
const FFPROBE = path.join(
  VIDEO_TOOLS_DIR,
  'ffmpeg',
  'bin',
  process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
)
const FFMPEG = path.join(
  VIDEO_TOOLS_DIR,
  'ffmpeg',
  'bin',
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)
const TESSDATA_DIR = path.join(OCR_RUNTIME_DIR, 'tessdata')
const DEFAULT_FRAMES = 6
const MAX_FRAMES = 12
const MAX_FILESIZE_MB = 300

// Set the same tessdata prefix the shared OCR runner uses so tesseract.js
// can resolve language data even if createWorker's langPath is bypassed.
process.env.TESSDATA_PREFIX = TESSDATA_DIR
process.env.NO_UPDATE_NOTIFIER = '1'

function jsonOut(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  process.exitCode = exitCode
}

function fail(errorCode, message, extra = {}) {
  jsonOut({ ok: false, errorCode, message: String(message || errorCode), ...extra }, 1)
}

function parseArgs(argv) {
  const args = { frames: DEFAULT_FRAMES }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--url') {
      args.url = argv[i + 1] || ''
      i += 1
    } else if (item === '--work-dir') {
      args.workDir = argv[i + 1] || ''
      i += 1
    } else if (item === '--frames') {
      const n = parseInt(argv[i + 1], 10)
      if (Number.isFinite(n) && n > 0) args.frames = n
      i += 1
    } else if (item === '--cookies-from-browser') {
      args.cookiesFromBrowser = argv[i + 1] || ''
      i += 1
    } else if (item === '--cookies-file') {
      args.cookiesFile = argv[i + 1] || ''
      i += 1
    } else if (item === '--cdp-port') {
      const n = parseInt(argv[i + 1], 10)
      if (Number.isFinite(n) && n > 0) args.cdpPort = n
      i += 1
    } else if (item === '--keep') {
      args.keep = true
    }
  }
  return args
}

// yt-dlp / platform anti-bot responses that mean "sign in to continue".
function detectLoginRequired(text) {
  if (!text) return false
  const patterns = [
    /\bsign\s*in\b/i,
    /\blog\s*in\b/i,
    /\bcookies?\b/i,
    /请\s*登录/i,
    /需要登录/i,
    /登录后(才能|才可|方可|观看|查看)/i,
    /登录态/i,
    /未登录/i,
    /验证码/i,
    /confirm you('| a)re not a bot/i,
    /human verification/i,
    /not a bot/i,
    /only available to (registered|members|users)/i,
    /member(s)?[- ]only/i,
    /requires (a )?login/i,
  ]
  return patterns.some((re) => re.test(text))
}

// yt-dlp browser-cookie extraction failures (DB locked, unsupported browser, etc.).
function detectCookieReadFailure(text) {
  if (!text) return false
  const patterns = [
    /unable to extract cookies/i,
    /failed to copy .*cookie/i,
    /could not copy .*cookie/i,
    /cookie database/i,
    /no cookies/i,
    /extracting cookies from .* (failed|error)/i,
    /unsupported browser/i,
    /not a valid browser name/i,
    /browser .* not (found|installed|set up)/i,
  ]
  return patterns.some((re) => re.test(text))
}

// yt-dlp cookie DECRYPTION failures. Newer Chrome/Edge encrypt cookies with
// DPAPI + App-Bound Encryption (ABE); external tools often cannot decrypt them
// even when the browser is fully closed. This is a DIFFERENT failure than the
// "database is locked while the browser is running" case, and closing the
// browser does NOT fix it -- so we must give the user different guidance.
function detectCookieDecryptFailure(text) {
  if (!text) return false
  const patterns = [
    /failed to decrypt/i,
    /could not decrypt/i,
    /unable to decrypt/i,
    /decrypt(ing|ed)? .*(fail|error)/i,
    /error .*decrypt/i,
    /dpapi/i,
    /cryptunprotect/i,
    /app[- ]bound/i,
    /encrypted cookies?/i,
    /encryption .*(fail|error|unsupported)/i,
    /v(10|11|20) (cookie|key)/i,
  ]
  return patterns.some((re) => re.test(text))
}

function runTool(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout || 180000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  })
  return result
}

// Cookie-related failures that a fresh (even anonymous) browser session may fix.
// Douyin/Kuaishou often demand "Fresh cookies (not necessarily logged in) are
// needed" -- i.e. a fresh anonymous `ttwid`/`passport_csrf_token` from a real
// browser visit. yt-dlp's --cookies-from-browser also fails on a locked cookie
// DB (browser running) and on Chrome/Edge App-Bound-Encrypted cookies.
function shouldAutoRetryWithCookies(text) {
  if (!text) return false
  return detectCookieReadFailure(text) || detectCookieDecryptFailure(text) || detectLoginRequired(text)
}

// Automatically generate a fresh Netscape cookies.txt by launching a HEADLESS
// managed Edge/Chrome (temp profile + CDP), navigating to the target URL, and
// dumping the cookies the page sets (anonymous session cookies like ttwid).
// This is the fully-automatic path for public videos -- it does NOT require the
// user to open a login window or copy cookies. The temp profile is deleted.
async function autoGenerateCookies(url, workDir) {
  let bc
  try {
    bc = require('./browser-cookies.cjs')
  } catch {
    return ''
  }
  const port = await bc.pickFreePort()
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-auto-cookies-'))
  try {
    await bc.launchManagedBrowser({
      browser: 'edge',
      profileDir,
      port,
      url,
      headless: true,
      timeoutMs: 25000,
    })
    const dumpOut = path.join(workDir, 'auto-cookies.txt')
    await bc.dumpCookiesToFile({
      port,
      targetUrl: url,
      outFile: dumpOut,
      timeoutMs: 20000,
      settleMs: 8000,
    })
    return dumpOut
  } finally {
    try {
      await bc.closeBrowser(port).catch(() => {})
    } catch {}
    try {
      fs.rmSync(profileDir, { recursive: true, force: true })
    } catch {}
  }
}

// Run the bundled yt-dlp download step. `cookiesFilePath` (plaintext Netscape
// cookies.txt) takes precedence; otherwise falls back to --cookies-from-browser.
function runYtDlp(args, workDir, cookiesFilePath) {
  const outputTemplate = path.join(workDir, 'video.%(ext)s')
  const dlArgs = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--print', '%(title)s',
    // --print implies --simulate in yt-dlp, which would suppress the actual
    // download. --no-simulate restores the download so we get the title AND
    // the video file (fixes DOWNLOAD_FAILED: 视频已下载，但未找到可分析的媒体文件).
    '--no-simulate',
    '-f', 'mp4/best',
    '--max-filesize', `${MAX_FILESIZE_MB}M`,
    '--socket-timeout', '15',
    '--retries', '2',
    '--fragment-retries', '2',
    '-o', outputTemplate,
  ]
  if (cookiesFilePath) {
    dlArgs.push('--cookies', cookiesFilePath)
  } else if (args.cookiesFromBrowser) {
    dlArgs.push('--cookies-from-browser', args.cookiesFromBrowser)
  }
  dlArgs.push(args.url)
  return runTool(YTDLP, dlArgs, { timeout: 180000 })
}

function findDownloadedVideo(dir) {
  const videoExts = new Set([
    '.mp4',
    '.mkv',
    '.webm',
    '.mov',
    '.flv',
    '.avi',
    '.m4v',
    '.ts',
  ])
  let best = null
  let bestSize = -1
  let entries = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return null
  }
  for (const name of entries) {
    if (name.endsWith('.part') || name.endsWith('.ytdl')) continue
    const full = path.join(dir, name)
    let stat
    try {
      stat = fs.statSync(full)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    const ext = path.extname(name).toLowerCase()
    if (videoExts.has(ext) || ext === '') {
      if (stat.size > bestSize) {
        best = full
        bestSize = stat.size
      }
    }
  }
  return best
}

function probeDuration(file) {
  const result = runTool(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
    { timeout: 30000 },
  )
  if (result.status !== 0) return 0
  const value = parseFloat(String(result.stdout || '').trim())
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function probeTitle(file) {
  const result = runTool(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'format_tags=title', '-of', 'default=noprint_wrappers=1:nokey=1', file],
    { timeout: 30000 },
  )
  if (result.status !== 0) return ''
  return String(result.stdout || '').trim()
}

function extractFrames(file, workDir, duration, frameCount) {
  const count = Math.max(1, Math.min(frameCount || DEFAULT_FRAMES, MAX_FRAMES))
  const frames = []
  if (!duration || duration <= 0) {
    const out = path.join(workDir, 'frame-0.png')
    runTool(FFMPEG, ['-y', '-ss', '0', '-i', file, '-frames:v', '1', '-q:v', '2', out], {
      timeout: 60000,
    })
    frames.push({ time: 0, file: out })
    return frames
  }
  for (let i = 0; i < count; i += 1) {
    const time = count === 1 ? 0 : (i / (count - 1)) * duration
    const out = path.join(workDir, `frame-${i}.png`)
    runTool(FFMPEG, ['-y', '-ss', String(time), '-i', file, '-frames:v', '1', '-q:v', '2', out], {
      timeout: 60000,
    })
    frames.push({ time, file: out })
  }
  return frames
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0')
  const s = (total % 60)
    .toString()
    .padStart(2, '0')
  return `${m}:${s}`
}

async function ocrFrames(frames) {
  const results = []
  let worker = null
  try {
    const Tesseract = require('tesseract.js')
    worker = await Tesseract.createWorker('eng+chi_sim', 1, {
      langPath: TESSDATA_DIR,
      gzip: true,
      cacheMethod: 'none',
      logger: () => {},
    })
    for (const frame of frames) {
      let text = ''
      try {
        if (fs.existsSync(frame.file) && (fs.statSync(frame.file).size || 0) > 0) {
          const result = await worker.recognize(frame.file)
          text = String((result && result.data && result.data.text) || '').trim()
        }
      } catch {
        text = ''
      }
      results.push({ time: frame.time, text })
    }
  } catch {
    for (const frame of frames) results.push({ time: frame.time, text: '' })
  } finally {
    if (worker && typeof worker.terminate === 'function') {
      try {
        await worker.terminate()
      } catch {}
    }
  }
  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.url) {
    fail('URL_REQUIRED', 'Missing --url')
    return
  }

  if (!fs.existsSync(YTDLP)) {
    fail('YTDLP_MISSING', 'yt-dlp 未内置，无法下载视频')
    return
  }
  if (!fs.existsSync(FFMPEG) || !fs.existsSync(FFPROBE)) {
    fail('FFMPEG_MISSING', 'ffmpeg/ffprobe 未内置，无法抽帧')
    return
  }

  const createdWorkDir = !args.workDir
  const workDir = args.workDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sc-video-analysis-'))
  fs.mkdirSync(workDir, { recursive: true })

  try {
    // 1. Download the video with the bundled yt-dlp.
    //    Cookie precedence:
    //      * --cookies-file <path>          : plaintext Netscape cookies.txt
    //      * --cdp-port <port>              : dump cookies from the managed login
    //        browser (browser-cookies.cjs via CDP) into a fresh cookies.txt
    //      * --cookies-from-browser <name>  : yt-dlp's built-in browser reader
    //        (legacy; fails on Chrome/Edge App-Bound Encrypted cookies)
    let cookiesFilePath = args.cookiesFile || ''
    const usedManagedCdp = !!(args.cdpPort && !cookiesFilePath)
    if (args.cdpPort && !cookiesFilePath) {
      try {
        const bc = require('./browser-cookies.cjs')
        const dumpOut = path.join(workDir, 'cookies.txt')
        await bc.dumpCookiesToFile({
          port: args.cdpPort,
          targetUrl: args.url,
          outFile: dumpOut,
          timeoutMs: 20000,
          settleMs: 5000,
        })
        cookiesFilePath = dumpOut
      } catch (err) {
        fail(
          'LOGIN_WINDOW_CLOSED',
          '内置登录窗口已关闭或无法连接，请重新打开内置登录窗口并登录后重试。原始信息: ' +
            (err && err.message ? err.message : String(err)),
        )
        return
      }
    }

    // First download attempt with whatever cookie source was supplied.
    let dl = runYtDlp(args, workDir, cookiesFilePath)
    let dlOut = `${dl.stdout || ''}\n${dl.stderr || ''}`

    // Fully-automatic fallback: when yt-dlp fails with cookie/login errors
    // (locked cookie DB, DPAPI/App-Bound decrypt failure, "Fresh cookies are
    // needed") and no managed/caller-supplied cookies were already used, spin
    // up a HEADLESS managed browser to mint fresh anonymous cookies and retry.
    // This makes public Douyin/Kuaishou/etc. videos work without requiring the
    // user to open a login window or copy cookies.
    if (
      dl.status !== 0 &&
      !usedManagedCdp &&
      !args.cookiesFile &&
      shouldAutoRetryWithCookies(dlOut)
    ) {
      try {
        const autoCookies = await autoGenerateCookies(args.url, workDir)
        if (autoCookies && fs.existsSync(autoCookies)) {
          cookiesFilePath = autoCookies
          dl = runYtDlp(args, workDir, cookiesFilePath)
          dlOut = `${dl.stdout || ''}\n${dl.stderr || ''}`
        }
      } catch (err) {
        // Ignore auto-cookie failures; fall through to error handling below.
      }
    }

    if (dl.status !== 0 || dl.error) {
      if (detectCookieReadFailure(dlOut)) {
        if (detectCookieDecryptFailure(dlOut)) {
          jsonOut({
            ok: false,
            errorCode: 'COOKIE_DECRYPT_FAILED',
            message: `无法解密浏览器（${args.cookiesFromBrowser || '当前所选'}）的登录态 Cookie。这是新版 Chrome/Edge 的 Cookie 加密（DPAPI / App-Bound Encryption）导致的，关闭浏览器也无法解决。建议改用“打开内置登录窗口”，在工具内置的浏览器窗口中登录后即可自动读取登录态下载视频。原始信息: ${dlOut.slice(0, 1000)}`,
          })
          return
        }
        jsonOut({
          ok: false,
          errorCode: 'COOKIE_READ_FAILED',
          message: `无法读取浏览器（${args.cookiesFromBrowser || '当前所选'}）的登录态，可能是浏览器正在运行导致 Cookie 数据库被占用。请先关闭该浏览器后再重试，或改用“打开内置登录窗口”。原始信息: ${dlOut.slice(0, 1000)}`,
        })
        return
      }
      if (detectLoginRequired(dlOut)) {
        jsonOut({
          ok: false,
          loginRequired: true,
          errorCode: 'LOGIN_REQUIRED',
          message: dlOut.slice(0, 1500),
        })
        return
      }
      fail('DOWNLOAD_FAILED', dlOut.slice(0, 1500))
      return
    }

    // Title comes from yt-dlp `--print %(title)s` (first non-[tag] stdout line).
    let title = ''
    const stdoutLines = String(dl.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    for (const line of stdoutLines) {
      if (!/^\[(download|info|youtube|generic)\]/i.test(line)) {
        title = line
        break
      }
    }

    const videoFile = findDownloadedVideo(workDir)
    if (!videoFile) {
      fail('DOWNLOAD_FAILED', '视频已下载，但未找到可分析的媒体文件')
      return
    }

    // 2. Probe duration + title.
    const duration = probeDuration(videoFile)
    if (!title) title = probeTitle(videoFile) || path.basename(videoFile)

    // 3. Extract evenly-spaced frames.
    const frames = extractFrames(videoFile, workDir, duration, args.frames)

    // 4. OCR each frame (eng + chi_sim).
    const ocrResults = await ocrFrames(frames)

    jsonOut({
      ok: true,
      duration,
      title,
      frames: ocrResults.map((frame) => ({
        time: frame.time,
        timeLabel: formatTime(frame.time),
        text: frame.text,
      })),
      workDir,
    })
  } catch (err) {
    fail('ANALYZER_ERROR', err && err.message ? err.message : String(err))
  } finally {
    // Only clean up when we created the temp dir. With --work-dir the caller
    // owns cleanup so it also runs after a timeout kill.
    if (createdWorkDir && !args.keep) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true })
      } catch {}
    }
  }
}

main().catch((err) => {
  fail('ANALYZER_ERROR', err && err.message ? err.message : String(err))
})
