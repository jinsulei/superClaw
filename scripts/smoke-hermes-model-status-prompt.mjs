import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const devApi = readFileSync(resolve(root, 'scripts/dev-api.js'), 'utf8')
const dashboard = readFileSync(resolve(root, 'src/engines/hermes/pages/dashboard.js'), 'utf8')

assert.match(devApi, /function\s+readHermesModelConfigSummary\s*\(/, 'dev-api must summarize Hermes model config without exposing keys')
assert.match(devApi, /keyConfigured/, 'Hermes status must expose keyConfigured')
assert.match(devApi, /modelReady/, 'Hermes status must expose modelReady')
assert.match(devApi, /lastModelError/, 'Hermes status must expose lastModelError')
assert.match(devApi, /model_config_missing/, 'Hermes missing key state must use model_config_missing')
assert.match(devApi, /MINIMAX_API_KEY missing/, 'Hermes missing MiniMax key must be classified without printing a real key')
assert.match(devApi, /Gateway 在线，但 MiniMax API Key 未配置/, 'Hermes missing key message must explain Gateway is online but model config is unavailable')

const hermesBranchStart = devApi.indexOf("if (agent === 'hermes')")
const genericReturnStart = devApi.indexOf('\n  return {\n    ...base,', hermesBranchStart)
const hermesBranch = devApi.slice(hermesBranchStart, genericReturnStart)
assert.ok(hermesBranchStart >= 0, 'createDevAgentStatus must have a Hermes-specific branch')
assert.ok(
  hermesBranch.includes('gatewayReady: ready'),
  'Hermes status must keep gatewayReady tied to gateway health'
)
assert.ok(
  hermesBranch.includes('modelReady: modelStatus.modelReady'),
  'Hermes status must separate modelReady from gatewayReady'
)
assert.ok(
  hermesBranch.includes('keyConfigured: modelStatus.keyConfigured'),
  'Hermes status must include keyConfigured in the Hermes branch'
)

assert.match(dashboard, /data-hermes-model-warning/, 'Hermes dashboard must render a model warning block')
assert.match(dashboard, /info\?\.modelReady === false/, 'Hermes dashboard warning must depend on modelReady=false')
assert.match(dashboard, /模型配置不可用/, 'Hermes dashboard must label model config as unavailable')
assert.doesNotMatch(dashboard, /OpenClaw 模型配置未完成/, 'Hermes dashboard prompt must not mention OpenClaw')
assert.doesNotMatch(dashboard, /Claude relay 未配置/, 'Hermes dashboard prompt must not mention Claude relay')

console.log('HERMES_MODEL_STATUS_PROMPT: PASS')
