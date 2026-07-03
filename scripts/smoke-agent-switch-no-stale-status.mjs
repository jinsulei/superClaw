import fs from 'node:fs'

const chatSource = fs.readFileSync('src/pages/chat.js', 'utf8')
const dashboardSource = fs.readFileSync('src/pages/dashboard.js', 'utf8')
const wsSource = fs.readFileSync('src/lib/ws-client.js', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`)
    process.exit(1)
  }
}

assert(chatSource.includes('_page !== pageRef'), 'chat convergence callbacks must guard stale page refs')
assert(chatSource.includes('clearOpenClawGatewayUiConvergenceTimers()'), 'chat cleanup must clear convergence timers')
assert(chatSource.includes('clearOpenClawTransientRecoveryTimer()'), 'chat cleanup must clear transient recovery timers')
assert(chatSource.includes("reason: 'openclaw-route-switch'"), 'chat route switch must suppress old OpenClaw reconnects')
assert(chatSource.includes('if (!_pageActive) return'), 'chat async callbacks must guard inactive page')
assert(dashboardSource.includes('_dashboardGatewayProbe'), 'dashboard must keep an agent-scoped gateway probe')
assert(dashboardSource.includes('probeAgentGateway'), 'dashboard must probe dev status before ws connect')
assert(wsSource.includes('clearReconnectSuppression'), 'wsClient must resume cleanly after route/key changes')
assert(wsSource.includes('this._clearReconnectTimer()'), 'wsClient suppression must clear pending reconnect timers')

console.log('PASS smoke-agent-switch-no-stale-status')
