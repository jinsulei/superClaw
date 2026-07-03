import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const source = readFileSync(resolve(root, 'src-tauri/resources/runtime/claude-panel/public/app.js'), 'utf8')

const ensureStart = source.indexOf('async function ensureOpenClawGatewayBeforeConsoleSwitch')
const ensureEnd = source.indexOf('async function fetchJsonWithTimeout', ensureStart)
const ensureBody = source.slice(ensureStart, ensureEnd)

const preflightIndex = ensureBody.indexOf('await probeOpenClawGatewayStatusFromSuperclaw(base)')
const startIndex = ensureBody.indexOf('await startOpenClawGatewayFromSuperclaw(base)')
const waitIndex = ensureBody.indexOf('await waitForOpenClawGatewayReadyFromSuperclaw(base')

assert.ok(ensureStart >= 0, 'Claude panel must guard OpenClaw console switch')
assert.ok(preflightIndex >= 0, 'OpenClaw switch must preflight dev status before starting')
assert.ok(startIndex > preflightIndex, 'OpenClaw start must happen after needs_setup preflight')
assert.ok(waitIndex > startIndex, 'OpenClaw ready wait must happen after start path')
assert.match(ensureBody, /if \(preflight\?\.needsSetup\) return preflight/, 'needs_setup preflight must return before start')
assert.match(ensureBody, /if \(startStatus\.needsSetup\) return startStatus/, 'needs_setup start response must return before wait-ready')

assert.match(source, /function\s+normalizeOpenClawGatewaySetupRequired\s*\(/, 'OpenClaw needs_setup normalizer is required')
assert.match(source, /openclaw_model_config_required/, 'OpenClaw switch must expose a stable config-missing kind')
assert.match(source, /OPENCLAW_MODEL_CONFIG_REQUIRED/, 'OpenClaw switch must preserve explicit config guard code')
assert.match(source, /请先配置 OpenClaw 模型 Key。/, 'OpenClaw switch must show model key setup guidance')

const probeStart = source.indexOf('async function probeOpenClawGatewayReady')
const probeEnd = source.indexOf('function waitMs', probeStart)
const probeBody = source.slice(probeStart, probeEnd)
assert.ok(
  probeBody.indexOf('normalizeOpenClawGatewaySetupRequired(status.data') >= 0 &&
    probeBody.indexOf('normalizeOpenClawGatewaySetupRequired(status.data') < probeBody.indexOf('isOpenClawGatewayReadyStatus(status.data)'),
  'ready probe must check needs_setup before ready/live'
)

const waitStart = source.indexOf('async function waitForOpenClawGatewayReadyFromSuperclaw')
const waitEnd = source.indexOf('function setConsoleSwitchError', waitStart)
const waitBody = source.slice(waitStart, waitEnd)
assert.ok(
  waitBody.indexOf('if (last.needsSetup) return last') > waitBody.indexOf('if (last.ok) return last') &&
    waitBody.indexOf('if (last.needsSetup) return last') < waitBody.indexOf('await waitMs(intervalMs)'),
  'ready wait must stop immediately on needs_setup instead of timing out'
)

const messageStart = source.indexOf('function openClawConsoleSwitchErrorMessage')
const messageEnd = source.indexOf('async function navigateAfterOpenClawReady', messageStart)
const messageBody = source.slice(messageStart, messageEnd)
assert.ok(
  messageBody.indexOf('result?.needsSetup') >= 0 &&
    messageBody.indexOf('OpenClaw 正在启动但未 ready') > messageBody.indexOf('result?.needsSetup'),
  'needs_setup message must be handled before generic starting timeout'
)

console.log('OPENCLAW_SWITCH_NEEDS_SETUP_GUARD: PASS')
