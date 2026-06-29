import { execSync } from 'node:child_process'
import fs from 'node:fs'

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`)
    process.exitCode = 1
  } else {
    console.log(`[PASS] ${message}`)
  }
}

function gitLines(command) {
  try {
    return execSync(command, { encoding: 'utf8' })
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const dirty = gitLines('git diff --name-only')
const untracked = gitLines('git ls-files --others --exclude-standard')
const changed = [...new Set([...dirty, ...untracked])]

const historicalNonOpenClaw = changed.filter(file =>
  /^src\/engines\/hermes\//.test(file) ||
  /^src-tauri\/resources\/runtime\/claude-panel\//.test(file) ||
  /claude/i.test(file) && !/^scripts\/smoke-openclaw/.test(file)
)

if (historicalNonOpenClaw.length) {
  console.log('[INFO] Non-OpenClaw dirty files already exist in the worktree; this smoke reports them but only gates the OpenClaw start-chain patch.')
  for (const file of historicalNonOpenClaw) console.log(`[INFO] existing dirty: ${file}`)
}

const devApi = read('scripts/dev-api.js')
const chat = read('src/pages/chat.js')

assert(devApi.includes('async function startDevAgent'), 'dev-api contains dev agent start entry')
assert(devApi.includes("agent !== 'openclaw'"), 'dev-api real start remains scoped to OpenClaw')
assert(devApi.includes('prepareOpenClawGatewayLaunchConfig'), 'OpenClaw launch config normalization is scoped in dev-api')
assert(devApi.includes("openclawEnvSecretRef('OPENCLAW_MINIMAX_API_KEY')"), 'OpenClaw launch config uses env SecretRef')
assert(devApi.includes('OPENCLAW_CONFIG_PATH: launchConfig.path'), 'OpenClaw child receives normalized config path')
assert(devApi.includes('OPENCLAW_MINIMAX_API_KEY') && devApi.includes('MINIMAX_API_KEY') && devApi.includes('MINIMAX_CN_API_KEY'), 'OpenClaw start accepts the three temporary key env names')
assert(chat.includes('async function startOpenClawGateway'), 'OpenClaw page has one explicit start gateway entry')
assert(chat.includes('/__api/dev/agents/start'), 'OpenClaw Web dev path calls dev start endpoint')
assert(chat.includes("assertAgentReadyBeforeSend('openclaw'"), 'OpenClaw send path gates on readiness')

const dangerousGlobalKills = [
  /taskkill\s+\/IM\s+node\.exe/i,
  /taskkill\s+\/IM\s+python\.exe/i,
  /Stop-Process\s+-Name\s+node/i,
  /Stop-Process\s+-Name\s+python/i,
  /killall\s+node/i,
  /killall\s+python/i,
]

for (const pattern of dangerousGlobalKills) {
  assert(!pattern.test(devApi), `dev-api must not contain dangerous global kill: ${pattern}`)
}

if (process.exitCode) {
  console.error('\nopenclaw source scope smoke failed')
  process.exit(process.exitCode)
}

console.log('\nopenclaw source scope smoke passed')
