import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const chatSource = readFileSync('src/pages/chat.js', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')
const openClawResultRegressionSource = readFileSync('tests/regression/openclaw-result-rendering-regression.test.js', 'utf8')

test('OpenClaw run timeout has a stable final-state cleanup helper', () => {
  assert.match(chatSource, /OPENCLAW_RUN_TIMEOUT_MS/)
  assert.match(chatSource, /finalizeOpenClawRunTimeoutState/)
  assert.match(chatSource, /openclaw-run-timeout/)
})

test('OpenClaw timeout is user-visible and not only console logging', () => {
  const helper = chatSource.slice(
    chatSource.indexOf('function finalizeOpenClawRunTimeoutState'),
    chatSource.indexOf('function _startResponseWatchdog'),
  )

  assert.match(helper, /appendAiMessage|appendSystemMessage/)
  assert.match(helper, /timeout|timed out|incomplete/i)
  assert.doesNotMatch(helper, /console\.(warn|error)\([^)]*timeout[^)]*\)\s*$/i)
})

test('OpenClaw timeout clears pending sending streaming typing and active run state', () => {
  const helper = chatSource.slice(
    chatSource.indexOf('function finalizeOpenClawRunTimeoutState'),
    chatSource.indexOf('function _startResponseWatchdog'),
  )

  assert.match(helper, /_openClawPendingResponse\s*=\s*false/)
  assert.match(helper, /_isSending\s*=\s*false/)
  assert.match(helper, /_isStreaming\s*=\s*false/)
  assert.match(helper, /showTyping\(false\)/)
  assert.match(helper, /finishOpenClawActiveRun\([^)]*(failed|incomplete)/s)
  assert.match(helper, /_activeClientRequestId\s*=\s*null/)
})

test('watchdog timeout path uses OpenClaw final-state helper', () => {
  assert.match(chatSource, /OPENCLAW_ACTIVE_RUN_WATCHDOG_MS/)
  assert.match(chatSource, /settleOpenClawActiveRunFromWatchdog/)
  assert.match(chatSource, /finalizeOpenClawRunTimeoutState\([^)]*active-run-watchdog-timeout/s)
})

test('OpenClaw full result rendering and collaboration dispatch remain anchored', () => {
  assert.match(openClawResultRegressionSource, /full_content/)
  assert.match(openClawResultRegressionSource, /fullContent/)
  assert.match(openClawResultRegressionSource, /full content entry points|full result marker/i)
  assert.match(chatSource, /consumePendingDispatch\(COLLAB_TARGETS\.openclaw\)/)
  assert.match(chatSource, /setPendingDispatch/)
})

test('OpenClaw timeout regression is release-gated and avoids forbidden scopes', () => {
  assert.match(releaseGateSource, /openclaw-run-timeout-final-state-regression\.test\.js/)

  const forbiddenRuntimePaths = [
    'src-tauri/resources/runtime/openclaw',
    '.openclaw/openclaw.json',
    'scripts/dev-api.js',
    'package.json',
    'tauri.conf.json',
  ]
  for (const forbiddenPath of forbiddenRuntimePaths) {
    assert.equal(chatSource.includes(forbiddenPath), false, `chat.js must not reference ${forbiddenPath}`)
  }
})
