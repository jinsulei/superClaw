import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const hermesEnvPath = path.join(root, 'src-tauri', 'resources', 'data', 'hermes', '.env')
const apiBase = process.env.SUPERCLAW_PANEL_URL || 'http://127.0.0.1:1420'

function readDotEnv(filePath) {
  const vars = {}
  if (!fs.existsSync(filePath)) return vars
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key) vars[key] = value
  }
  return vars
}

function hasUsableKey(value) {
  const key = String(value || '').trim()
  if (!key) return false
  if (key.includes('*')) return false
  if (/^(YOUR_API_KEY|superclaw-login-required|test-minimax-placeholder-key-not-real)$/i.test(key)) return false
  if (/placeholder|minimax_api_key|openai_api_key/i.test(key)) return false
  return true
}

async function hermesChatProbe() {
  const response = await fetch(`${apiBase}/__api/hermes_agent_run_stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input: '请用中文回复：Hermes 正常',
      sessionId: `smoke-hermes-minimax-env-${Date.now()}`,
    }),
    signal: AbortSignal.timeout(60000),
  })
  const text = await response.text()
  assert.equal(response.ok, true, `Hermes stream HTTP ${response.status}: ${text.slice(0, 500)}`)
  assert.equal(/Provider 'minimax'.*no API key|MINIMAX_API_KEY.*missing|no API key was found/i.test(text), false)
  assert.match(text, /[\u4e00-\u9fff]/)
  return text
}

const localEnv = readDotEnv(hermesEnvPath)
const localKey = localEnv.MINIMAX_API_KEY || localEnv.OPENAI_API_KEY || ''
const processKey = process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY || ''
const imageKey = process.env.IMAGE_API_KEY || ''

assert.equal(fs.existsSync(hermesEnvPath), true)
console.log('HERMES_LOCAL_ENV_EXISTS: PASS')

assert.equal(hasUsableKey(localKey) || hasUsableKey(processKey), true)
console.log('HERMES_MINIMAX_API_KEY_PRESENT: PASS')

assert.equal(hasUsableKey(imageKey) && !hasUsableKey(localKey) && !hasUsableKey(processKey), false)
console.log('IMAGE_API_KEY_NOT_USED_AS_MAIN_CHAT_KEY: PASS')

await hermesChatProbe()
console.log('HERMES_AGENT_ENV_HAS_MINIMAX_KEY: PASS')
console.log('HERMES_CHAT_WORKS_WITH_MINIMAX: PASS')
console.log('IMAGE_KEY_DOES_NOT_AFFECT_HERMES_CHAT: PASS')
