import fs from 'node:fs'

const statusSource = fs.readFileSync('src/lib/agent-gateway-status.js', 'utf8')
const wsSource = fs.readFileSync('src/lib/ws-client.js', 'utf8')
const dashboardSource = fs.readFileSync('src/pages/dashboard.js', 'utf8')
const chatSource = fs.readFileSync('src/pages/chat.js', 'utf8')
const devApiSource = fs.readFileSync('scripts/dev-api.js', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`)
    process.exit(1)
  }
}

assert(statusSource.includes('shouldSuppressAgentGatewayReconnect'), 'gateway helper must expose reconnect suppression')
const normalizeStart = statusSource.indexOf('export function normalizeGatewayUiState')
const normalizeEnd = statusSource.indexOf('export function pickAgentStatusPayload')
const normalizeBody = statusSource.slice(normalizeStart, normalizeEnd)
const needsSetupIndex = normalizeBody.indexOf('raw.needsSetup')
const readyIndex = normalizeBody.indexOf('raw.ready === true')
assert(needsSetupIndex >= 0 && readyIndex >= 0 && needsSetupIndex < readyIndex, 'needs_setup must be checked before ready in normalizeGatewayUiState')
assert(wsSource.includes('setReconnectSuppressed'), 'wsClient must support reconnect suppression')
assert(wsSource.includes('reconnectSuppressedReason'), 'wsClient must expose reconnect suppression reason')
assert(wsSource.includes('_canReconnect()'), 'wsClient delayed reconnects must use _canReconnect')
assert(dashboardSource.includes('shouldSuppressAgentGatewayReconnect(probe)'), 'dashboard must stop ws connect on needs_setup')
assert(dashboardSource.includes('wsClient.setReconnectSuppressed'), 'dashboard must suppress ws reconnect on needs_setup')
assert(chatSource.includes('suppressOpenClawReconnectForConfig'), 'chat must have a single needs_setup suppression path')
assert(chatSource.includes("status === 'config_missing'"), 'chat ws status handler must handle config_missing')
assert(devApiSource.includes('OPENCLAW_MODEL_CONFIG_REQUIRED'), 'dev-api must preserve OpenClaw config guard')
assert(devApiSource.includes("shouldReconnect: false"), 'dev-api must mark needs_setup as non-reconnectable')
assert(devApiSource.includes("kind: 'gateway_not_started_because_config_missing'"), 'dev-api must expose config-missing gateway kind')

console.log('PASS smoke-openclaw-needs-setup-no-ws-reconnect')
