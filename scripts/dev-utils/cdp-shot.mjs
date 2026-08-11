#!/usr/bin/env node
// Capture a screenshot of the page target via WebView2 CDP.
// Usage: node cdp-shot.mjs --out out.png [--port 9333]

import { writeFileSync } from 'node:fs'

function argVal(name, dflt) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const out = argVal('--out', 'cdp-shot.png')
const port = Number(argVal('--port', '9333'))

const targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())
const page = targets.find(t => t.type === 'page' && t.url && t.url !== 'about:blank')
if (!page?.webSocketDebuggerUrl) {
  console.error('ERROR: no page target found on CDP port ' + port)
  process.exit(2)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
const timeout = setTimeout(() => { console.error('ERROR: CDP screenshot timeout'); process.exit(2) }, 10000)

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }))
})

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id === 1) {
    clearTimeout(timeout)
    if (msg.result?.data) {
      writeFileSync(out, Buffer.from(msg.result.data, 'base64'))
      console.log('WROTE ' + out + ' (' + msg.result.data.length + ' b64 chars)')
      ws.close()
      process.exit(0)
    } else {
      console.error('ERROR: no screenshot data:', JSON.stringify(msg.error || msg.result))
      ws.close()
      process.exit(2)
    }
  }
})

ws.addEventListener('error', (e) => {
  clearTimeout(timeout)
  console.error('ERROR: CDP WebSocket error:', e?.message || 'unknown')
  process.exit(2)
})
