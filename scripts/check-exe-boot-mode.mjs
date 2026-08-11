#!/usr/bin/env node
// Verify a superclaw.exe is a PRODUCTION (custom-protocol) build, not a dev-mode build.
//
// A dev-mode build (e.g. from a bare `cargo build --release` without the
// tauri/custom-protocol feature) boots WebView2 pointed at config.build.dev_url
// (http://localhost:1420), which is not running in production => "localhost refused connection".
// A production build boots at http://tauri.localhost/ (the tauri:// custom protocol).
//
// This is the ground-truth guard used by scripts/verify-portable-package.ps1.
//
// Usage:
//   node check-exe-boot-mode.mjs --exe <path> [--port 9333] [--timeout 25000] [--keep-alive]
//
// Exit codes:
//   0 = production mode (boots at tauri.localhost)
//   1 = dev-mode build (boots at the dev server URL) -> FAIL
//   2 = could not determine (no WebView target / unexpected URL) -> FAIL

import { spawn, execFileSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import path from 'node:path'

function argVal(name, dflt) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const exe = argVal('--exe', '')
const port = Number(argVal('--port', '9333'))
const timeout = Number(argVal('--timeout', '25000'))
const keepAlive = process.argv.includes('--keep-alive')

if (!exe) {
  console.error('ERROR: --exe <path> is required')
  process.exit(2)
}

let exeAbs
try {
  exeAbs = path.resolve(exe)
  accessSync(exeAbs, constants.F_OK)
} catch {
  console.error(`ERROR: executable not found: ${exe}`)
  process.exit(2)
}

// Kill any running superclaw so single-instance won't just focus an existing window.
try { execFileSync('taskkill', ['/IM', 'superclaw.exe', '/F'], { stdio: 'ignore' }) } catch { /* nothing running */ }

// Free the chosen CDP port in case a stale process is listening on it.
try {
  const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' })
  for (const line of out.split(/\r?\n/)) {
    if (line.includes(`:${port}`) && line.includes('LISTENING')) {
      const pid = line.trim().split(/\s+/).pop()
      if (pid && /^\d+$/.test(pid)) {
        try { execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
      }
    }
  }
} catch { /* netstat unavailable */ }

console.log(`Booting ${exeAbs}`)
const child = spawn(exeAbs, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  detached: true,
  stdio: 'ignore',
})

const startedAt = Date.now()
let targetUrl = null
let lastErr = null

async function pollForPage() {
  while (Date.now() - startedAt < timeout) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.url && t.url !== 'about:blank')
      if (page) {
        targetUrl = page.url
        return
      }
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 500))
  }
}

await pollForPage()

function killTree() {
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* gone */ }
  try { execFileSync('taskkill', ['/IM', 'superclaw.exe', '/F'], { stdio: 'ignore' }) } catch { /* gone */ }
}

let code = 2
if (!targetUrl) {
  console.error(`ERROR: no WebView page target appeared within ${timeout}ms. Last error: ${lastErr?.message || 'none'}`)
} else {
  console.log(`EXE loaded URL: ${targetUrl}`)
  const isProd = targetUrl.startsWith('http://tauri.localhost') || targetUrl.startsWith('tauri://') || targetUrl.startsWith('tauri.localhost')
  const isDev = /localhost:\d{4,5}/.test(targetUrl) || targetUrl.startsWith('http://127.0.0.1:')
  if (isProd) {
    console.log('MODE: production (custom-protocol) OK')
    code = 0
  } else if (isDev) {
    console.error('MODE: DEV (missing tauri/custom-protocol feature) FAIL')
    console.error('This EXE was built in dev mode and will fail in production: it tries to load')
    console.error('the Vite dev server that is not running. Rebuild with `npm run tauri:build`')
    console.error('(do NOT use a bare `cargo build --release` for the production EXE).')
    code = 1
  } else {
    console.error(`MODE: unknown URL scheme (${targetUrl})`)
    code = 2
  }
}

if (!keepAlive) killTree()
process.exit(code)
