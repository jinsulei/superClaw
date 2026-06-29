import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(rel) {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) return ''
  return fs.readFileSync(p, 'utf8')
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`[PASS] ${msg}`)
  }
}

function has(text, re) {
  return re.test(text)
}

const gatewayHelper = read('src/lib/agent-gateway-status.js')
const lifecycle = read('src/lib/agent-lifecycle.js')
const devApi = read('scripts/dev-api.js')
const outputGuard = read('src/shared/chat-output-guard.js')

assert(gatewayHelper, 'agent-gateway-status.js exists')
assert(has(gatewayHelper, /hermes[\s\S]*8642/i), 'Hermes port 8642 configured')
assert(has(gatewayHelper, /openclaw[\s\S]*18789/i), 'OpenClaw port 18789 configured')
assert(has(gatewayHelper, /(claudecode|claude)[\s\S]*3020/i), 'ClaudeCode port 3020 configured')

assert(has(gatewayHelper, /probeAgentGateway/), 'probeAgentGateway exists')
assert(has(gatewayHelper, /waitForAgentGatewayReady/), 'waitForAgentGatewayReady exists')
assert(has(gatewayHelper, /assertAgentReadyBeforeSend/), 'assertAgentReadyBeforeSend exists')
assert(has(gatewayHelper, /needsSetup|needs_setup/), 'needs setup state handled')
assert(has(gatewayHelper, /portListening/), 'port listening is separated from ready')
assert(has(gatewayHelper, /ready/), 'ready state exists')

assert(lifecycle, 'agent-lifecycle.js exists')
assert(has(lifecycle, /stopAgentOnPageClose/), 'stopAgentOnPageClose exists')
assert(has(lifecycle, /__api\/dev\/agents\/stop/), 'Web dev stop endpoint used')

assert(devApi, 'dev-api.js exists')
assert(has(devApi, /dev\/agents\/status/), 'dev agents status endpoint exists')
assert(has(devApi, /dev\/agents\/stop/), 'dev agents stop endpoint exists')
assert(has(devApi, /localhost|127\.0\.0\.1|::1/), 'dev endpoints restrict localhost')
assert(has(devApi, /verified|cwd|commandLine|ExecutablePath|repo/i), 'dev status verifies process ownership')
assert(has(devApi, /needsSetup|needs_setup|ready|portListening/), 'dev status exposes ready/needsSetup/portListening')

assert(outputGuard, 'chat-output-guard.js exists')
assert(has(outputGuard, /isInternalStatusOnlyText/), 'internal status filter exists')
assert(has(outputGuard, /formatToolResultsForUser/), 'tool report formatter exists')

assert(!/taskkill\s+\/IM\s+node\.exe/i.test(devApi), 'no dangerous taskkill node.exe')
assert(!/taskkill\s+\/IM\s+python\.exe/i.test(devApi), 'no dangerous taskkill python.exe')
assert(!/Stop-Process\s+-Name\s+node/i.test(devApi), 'no Stop-Process node')
assert(!/Stop-Process\s+-Name\s+python/i.test(devApi), 'no Stop-Process python')
assert(!/killall\s+node/i.test(devApi), 'no killall node')
assert(!/killall\s+python/i.test(devApi), 'no killall python')

const srcFiles = []
function walk(dir) {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) return
  for (const item of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(abs, item.name)
    if (item.isDirectory()) walk(path.relative(root, p))
    else if (/\.(js|jsx|ts|tsx|vue|svelte)$/.test(item.name)) {
      srcFiles.push(path.relative(root, p))
    }
  }
}
walk('src')

const combinedSrc = srcFiles.map(f => read(f)).join('\n')

assert(/probeAgentGateway|assertAgentReadyBeforeSend/.test(combinedSrc), 'frontend uses gateway readiness helper')
assert(/stopAgentOnPageClose\(\s*['"]hermes['"]\s*\)/.test(combinedSrc), 'Hermes page closes Hermes agent')
assert(/stopAgentOnPageClose\(\s*['"]openclaw['"]\s*\)/.test(combinedSrc), 'OpenClaw page closes OpenClaw agent')
assert(/stopAgentOnPageClose\(\s*['"]claudecode['"]\s*\)/.test(combinedSrc), 'ClaudeCode page closes ClaudeCode agent')

if (process.exitCode) {
  console.error('\nthree-agent gateway switching smoke failed')
  process.exit(process.exitCode)
}

console.log('\nthree-agent gateway switching smoke passed')
