import fs from 'node:fs'

const statusSource = fs.readFileSync('src/lib/agent-gateway-status.js', 'utf8')
const devApiSource = fs.readFileSync('scripts/dev-api.js', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`)
    process.exit(1)
  }
}

assert(statusSource.includes('CONFIG_MISSING'), 'status constants must include config_missing')
assert(statusSource.includes('gatewayReady'), 'normalized state must expose gatewayReady')
assert(statusSource.includes('webReady'), 'normalized state must expose webReady')
assert(statusSource.includes('relayReady'), 'normalized state must expose relayReady')
assert(statusSource.includes('modelReady'), 'normalized state must expose modelReady')
assert(statusSource.includes('canConnectWebSocket'), 'normalized state must expose canConnectWebSocket')
assert(statusSource.includes('shouldReconnect'), 'normalized state must expose shouldReconnect')

assert(devApiSource.includes('getClaudeRelayRuntimeStatus'), 'dev-api must split Claude relay runtime status')
assert(devApiSource.includes('panelReady'), 'dev-api must expose Claude panelReady separately')
assert(devApiSource.includes('relayReady'), 'dev-api must expose Claude relayReady separately')
assert(devApiSource.includes('modelReady'), 'dev-api must expose modelReady separately')
assert(!devApiSource.includes('9119 = Hermes Gateway'), 'Hermes 9119 must not be mixed into gateway status comments')
assert(devApiSource.includes("kind: agent === 'openclaw' ? 'gateway' : agent === 'hermes' ? 'gateway' : 'panel'"), 'base kind must separate Claude panel from gateways')

console.log('PASS smoke-agent-gateway-status-separation')
