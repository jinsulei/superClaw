#!/usr/bin/env node
// Evaluate a JS expression in the page target exposed by WebView2 CDP.
// Usage: node cdp-eval.mjs --expr "document.body.dataset.activeEngine" [--port 9333]
// Prints the JSON result of Runtime.evaluate (result.value / result.description).

import { readFileSync } from 'node:fs'

function argVal(name, dflt) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : dflt
}

let expr = argVal('--expr', '')
const exprFile = argVal('--file', '')
const port = Number(argVal('--port', '9333'))

if (!expr && exprFile) {
  try { expr = readFileSync(exprFile, 'utf8') } catch (e) { console.error('ERROR: cannot read --file:', e.message); process.exit(2) }
}
if (!expr) {
  console.error('ERROR: --expr <js> (or --file <path>) is required')
  process.exit(2)
}

const targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())
const page = targets.find(t => t.type === 'page' && t.url && t.url !== 'about:blank')
if (!page?.webSocketDebuggerUrl) {
  console.error('ERROR: no page target found on CDP port ' + port)
  process.exit(2)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
const timeout = setTimeout(() => { console.error('ERROR: CDP eval timeout'); process.exit(2) }, 10000)

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    },
  }))
})

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id === 1) {
    clearTimeout(timeout)
    const r = msg.result?.result
    if (r?.value !== undefined) {
      const out = typeof r.value === 'string' ? r.value : JSON.stringify(r.value, null, 2)
      console.log(out)
    } else {
      console.log(JSON.stringify({ type: r?.type, description: r?.description, unserializableValue: r?.unserializableValue }, null, 2))
    }
    ws.close()
    process.exit(r?.value === undefined ? 1 : 0)
  }
})

ws.addEventListener('error', (e) => {
  clearTimeout(timeout)
  console.error('ERROR: CDP WebSocket error:', e?.message || 'unknown')
  process.exit(2)
})
