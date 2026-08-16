#!/usr/bin/env node
'use strict'

// SuperClaw managed-browser cookie helper (Chrome DevTools Protocol).
//
// Chrome/Edge now encrypt their cookies with App-Bound Encryption (v20),
// which NO external tool (including yt-dlp's --cookies-from-browser) can
// decrypt offline. The only fully-automatic way to reuse a logged-in session
// is to read cookies from INSIDE the browser process via CDP. This module:
//
//   * launches a managed Edge/Chrome window with a temp --user-data-dir profile
//     (Edge blocks CDP on the real/default profile, but a custom profile works),
//   * lets the user log into the platform in that window,
//   * on a later run, connects to the same browser over CDP, navigates to the
//     target video page, and dumps a Netscape cookies.txt file for yt-dlp.
//
// CLI usage (all output is a single JSON line on stdout):
//   node browser-cookies.cjs --open-login --url <url> [--browser edge|chrome] [--profile <dir>] [--port <port>]
//   node browser-cookies.cjs --dump-cookies --port <port> --target-url <url> --out <cookies.txt> [--settle-ms 4000]
//   node browser-cookies.cjs --close --port <port>
//   node browser-cookies.cjs --find-browser [--browser edge|chrome]

const fs = require('fs')
const os = require('os')
const path = require('path')
const net = require('net')
const { spawn } = require('child_process')

function findBrowserPath(browser) {
  const b = String(browser || 'edge').toLowerCase()
  const env = process.env || {}
  const pfX86 = env['PROGRAMFILES(X86)'] || env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const pf64 = env['PROGRAMFILES'] || env['ProgramFiles'] || 'C:\\Program Files'
  const lad = env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local')
  const candidates =
    b === 'chrome'
      ? [
          path.join(pf64, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(pfX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(lad, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ]
      : [
          path.join(pfX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          path.join(pf64, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          path.join(lad, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch {}
  }
  return null
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      lastErr = new Error('HTTP ' + res.status)
    } catch (e) {
      lastErr = e
    }
    await sleep(300)
  }
  throw new Error('CDP endpoint timeout: ' + url + (lastErr ? ' (' + lastErr.message + ')' : ''))
}

function sendCdp(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      let data
      try {
        data = JSON.parse(ev.data)
      } catch {
        return
      }
      if (data.id === id) {
        ws.removeEventListener('message', onMessage)
        if (data.error) reject(new Error(method + ': ' + JSON.stringify(data.error)))
        else resolve(data.result)
      }
    }
    ws.addEventListener('message', onMessage)
    try {
      ws.send(JSON.stringify({ id, method, params }))
    } catch (e) {
      ws.removeEventListener('message', onMessage)
      reject(e)
    }
  })
}

async function connectCdp(port, timeoutMs) {
  await waitForJson(`http://127.0.0.1:${port}/json/version`, timeoutMs || 20000)
  const list = await waitForJson(`http://127.0.0.1:${port}/json/list`, 5000)
  const page = list.find((t) => t.type === 'page') || list[0]
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error('No page target on CDP port ' + port)
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  return { ws, page }
}

function launchManagedBrowser({ browser, profileDir, port, url, headless, timeoutMs }) {
  const exe = findBrowserPath(browser)
  if (!exe) throw new Error('未找到 ' + browser + ' 浏览器，无法打开内置登录窗口')
  fs.mkdirSync(profileDir, { recursive: true })

  const args = []
  if (headless) args.push('--headless=new')
  args.push(
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--remote-debugging-port=' + port,
    '--remote-allow-origins=*',
    '--user-data-dir=' + profileDir,
    '--profile-directory=Default',
    'about:blank',
  )
  const child = spawn(exe, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: !!headless,
  })
  if (child.unref) child.unref()

  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('浏览器启动超时（CDP 未就绪）'))
      }
    }, timeoutMs || 25000)

    const poll = async () => {
      try {
        await waitForJson(`http://127.0.0.1:${port}/json/version`, 3000)
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve({ exe })
        }
      } catch {
        if (!settled && child.exitCode !== null) {
          settled = true
          clearTimeout(timer)
          reject(new Error('浏览器启动后立即退出'))
        }
      }
    }
    // Poll every 400ms until CDP is reachable.
    const interval = setInterval(() => {
      if (settled) {
        clearInterval(interval)
        return
      }
      poll()
    }, 400)
    poll()
  })
}

function cookiesToNetscape(cookies) {
  const lines = [
    '# Netscape HTTP Cookie File',
    '# This file was generated by SuperClaw managed-browser login.',
    '',
  ]
  for (const c of cookies || []) {
    if (!c || !c.name || !c.value) continue
    const domain = String(c.domain || '').trim()
    if (!domain) continue
    const hostOnly = !!c.hostOnly
    const domainField = hostOnly ? domain : domain.startsWith('.') ? domain : '.' + domain
    const includeSub = hostOnly ? 'FALSE' : 'TRUE'
    const secure = c.secure ? 'TRUE' : 'FALSE'
    let expires = Math.floor(Number(c.expires) || 0)
    if (expires < 0) expires = 0
    const httpOnlyPrefix = c.httpOnly ? '#HttpOnly_' : ''
    const line = [
      httpOnlyPrefix + domainField,
      includeSub,
      c.path || '/',
      secure,
      String(expires),
      c.name,
      c.value,
    ].join('\t')
    lines.push(line)
  }
  return lines.join('\n')
}

async function dumpCookiesToFile({ port, targetUrl, outFile, timeoutMs, settleMs }) {
  const { ws } = await connectCdp(port, timeoutMs || 20000)
  try {
    await sendCdp(ws, 1, 'Network.enable')
    if (targetUrl) {
      await sendCdp(ws, 2, 'Page.navigate', { url: targetUrl }).catch(() => {})
      await sleep(settleMs || 4000)
    }
    const result = await sendCdp(ws, 3, 'Network.getAllCookies')
    const cookies = Array.isArray(result && result.cookies) ? result.cookies : []
    const text = cookiesToNetscape(cookies)
    fs.writeFileSync(outFile, text, 'utf8')
    return { count: cookies.length, outFile }
  } finally {
    try {
      ws.close()
    } catch {}
  }
}

async function closeBrowser(port, timeoutMs) {
  const { ws } = await connectCdp(port, timeoutMs || 10000)
  try {
    await sendCdp(ws, 1, 'Browser.close').catch(() => {})
  } finally {
    try {
      ws.close()
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    const next = () => argv[i + 1] || ''
    if (item === '--open-login') args.mode = 'open-login'
    else if (item === '--dump-cookies') args.mode = 'dump-cookies'
    else if (item === '--close') args.mode = 'close'
    else if (item === '--find-browser') args.mode = 'find-browser'
    else if (item === '--url') { args.url = next(); i += 1 }
    else if (item === '--browser') { args.browser = next(); i += 1 }
    else if (item === '--profile') { args.profile = next(); i += 1 }
    else if (item === '--port') { args.port = Number(next()); i += 1 }
    else if (item === '--target-url') { args.targetUrl = next(); i += 1 }
    else if (item === '--out') { args.out = next(); i += 1 }
    else if (item === '--settle-ms') { args.settleMs = Number(next()); i += 1 }
  }
  return args
}

function jsonOut(value, exitCode = 0) {
  process.stdout.write(JSON.stringify(value) + '\n')
  process.exitCode = exitCode
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.mode === 'open-login') {
    if (!args.url) {
      jsonOut({ ok: false, errorCode: 'ARGS', message: '--open-login 需要 --url' }, 1)
      return
    }
    const browser = args.browser || 'edge'
    const profileDir =
      args.profile || fs.mkdtempSync(path.join(os.tmpdir(), 'sc-managed-login-'))
    const port = args.port || (await pickFreePort())
    try {
      await launchManagedBrowser({ browser, profileDir, port, url: args.url, headless: false })
      // Make sure the first tab is actually on the target URL.
      try {
        const { ws } = await connectCdp(port, 10000)
        await sendCdp(ws, 1, 'Network.enable').catch(() => {})
        await sendCdp(ws, 2, 'Page.navigate', { url: args.url }).catch(() => {})
        try { ws.close() } catch {}
      } catch {}
      jsonOut({ ok: true, profileDir, port, browser })
    } catch (e) {
      jsonOut({ ok: false, errorCode: 'LAUNCH_FAILED', message: e && e.message ? e.message : String(e) }, 1)
    }
    return
  }

  if (args.mode === 'dump-cookies') {
    if (!args.port || !args.out) {
      jsonOut({ ok: false, errorCode: 'ARGS', message: '--dump-cookies 需要 --port 与 --out' }, 1)
      return
    }
    try {
      const r = await dumpCookiesToFile({
        port: args.port,
        targetUrl: args.targetUrl || '',
        outFile: args.out,
        timeoutMs: 15000,
        settleMs: args.settleMs || 4000,
      })
      jsonOut({ ok: true, count: r.count, outFile: r.outFile })
    } catch (e) {
      jsonOut({ ok: false, errorCode: 'CDP_FAILED', message: e && e.message ? e.message : String(e) }, 1)
    }
    return
  }

  if (args.mode === 'close') {
    if (!args.port) {
      jsonOut({ ok: false, errorCode: 'ARGS', message: '--close 需要 --port' }, 1)
      return
    }
    try {
      await closeBrowser(args.port)
      jsonOut({ ok: true, closed: true })
    } catch (e) {
      jsonOut({ ok: false, errorCode: 'CDP_FAILED', message: e && e.message ? e.message : String(e) }, 1)
    }
    return
  }

  if (args.mode === 'find-browser') {
    const exe = findBrowserPath(args.browser || 'edge')
    jsonOut({ ok: !!exe, browser: args.browser || 'edge', path: exe || null })
    return
  }

  jsonOut({ ok: false, errorCode: 'ARGS', message: '未知模式，请使用 --open-login / --dump-cookies / --close / --find-browser' }, 1)
}

// Export for use by video-frame-analyzer.cjs (when required).
module.exports = {
  findBrowserPath,
  pickFreePort,
  connectCdp,
  sendCdp,
  launchManagedBrowser,
  dumpCookiesToFile,
  closeBrowser,
  cookiesToNetscape,
}

if (require.main === module) {
  main().catch((e) => {
    jsonOut({ ok: false, errorCode: 'FATAL', message: e && e.message ? e.message : String(e) }, 1)
  })
}
