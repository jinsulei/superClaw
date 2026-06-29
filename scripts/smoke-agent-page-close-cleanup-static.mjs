import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

function mustContain(path, pattern, label) {
  const text = read(path)
  if (pattern instanceof RegExp) {
    assert.match(text, pattern, `${label} missing in ${path}`)
  } else {
    assert.ok(text.includes(pattern), `${label} missing in ${path}`)
  }
}

mustContain('src-tauri/src/agent_lifecycle.rs', 'MANAGED_AGENTS', 'managed registry')
mustContain('src-tauri/src/agent_lifecycle.rs', 'register_managed_agent', 'register function')
mustContain('src-tauri/src/agent_lifecycle.rs', 'stop_managed_agent', 'stop agent function')
mustContain('src-tauri/src/agent_lifecycle.rs', 'stop_all_managed_agents', 'stop all function')
mustContain('src-tauri/src/agent_lifecycle.rs', 'registry_file_path', 'persistent registry file path')
mustContain('src-tauri/src/agent_lifecycle.rs', 'persist_registry_map', 'registry persistence')
mustContain('src-tauri/src/agent_lifecycle.rs', 'load_registry_records', 'startup registry load')
mustContain('src-tauri/src/agent_lifecycle.rs', 'process_details', 'pid existence and process detail check')
mustContain('src-tauri/src/agent_lifecycle.rs', 'record_belongs_to_managed_root', 'stale ownership validation')
mustContain('src-tauri/src/agent_lifecycle.rs', 'cleanup_stale_managed_agents_on_startup', 'startup stale cleanup')
mustContain('src-tauri/src/agent_lifecycle.rs', '.args(["/PID", &pid.to_string(), "/T", "/F"])', 'pid-scoped taskkill')
mustContain('src-tauri/src/agent_lifecycle.rs', 'ownership could not be verified', 'unverified stale process skip')

mustContain('src-tauri/src/lib.rs', 'mod agent_lifecycle;', 'agent lifecycle module')
mustContain('src-tauri/src/lib.rs', 'async fn stop_agent', 'stop_agent command')
mustContain('src-tauri/src/lib.rs', 'async fn stop_all_agents', 'stop_all_agents command')
mustContain('src-tauri/src/lib.rs', 'stop_agent,', 'stop_agent invoke handler')
mustContain('src-tauri/src/lib.rs', 'stop_all_agents,', 'stop_all_agents invoke handler')
mustContain('src-tauri/src/lib.rs', 'WindowEvent::CloseRequested', 'CloseRequested cleanup')
mustContain('src-tauri/src/lib.rs', 'RunEvent::Exit', 'RunEvent Exit cleanup')
mustContain('src-tauri/src/lib.rs', /stop_all_managed_agents\(\)/, 'app exit cleanup call')

mustContain('src-tauri/src/commands/hermes.rs', 'ManagedAgent::Hermes', 'Hermes process registration')
mustContain('src-tauri/src/commands/service.rs', 'ManagedAgent::OpenClaw', 'OpenClaw process registration')
mustContain('src-tauri/src/commands/claude_code.rs', 'ManagedAgent::ClaudeCode', 'ClaudeCode process registration')

mustContain('src/lib/agent-lifecycle.js', 'stopAgentOnPageClose', 'frontend stop helper')
mustContain('src/lib/agent-lifecycle.js', "invoke('stop_agent'", 'frontend stop_agent invoke')
mustContain('src/lib/agent-lifecycle.js', "invoke('stop_all_agents'", 'frontend stop_all_agents invoke')
mustContain('src/lib/agent-lifecycle.js', '/__api/dev/agents/stop', 'web dev stop endpoint')
mustContain('src/lib/agent-lifecycle.js', '/__api/dev/agents/stop-all', 'web dev stop-all endpoint')
mustContain('src/lib/agent-lifecycle.js', 'navigator.sendBeacon', 'web dev beacon cleanup')
mustContain('src/lib/agent-lifecycle.js', 'keepalive: true', 'web dev keepalive cleanup')
mustContain('src/engines/hermes/pages/chat.js', "stopAgentOnPageClose('hermes')", 'Hermes page cleanup')
mustContain('src/pages/chat.js', "stopAgentOnPageClose('openclaw')", 'OpenClaw page cleanup')
mustContain('src/engines/hermes/pages/claude-code.js', "stopAgentOnPageClose('claudecode')", 'ClaudeCode page cleanup')

mustContain('scripts/dev-api.js', "cmd === 'dev/agents/stop'", 'dev stop route')
mustContain('scripts/dev-api.js', "cmd === 'dev/agents/stop-all'", 'dev stop-all route')
mustContain('scripts/dev-api.js', "cmd === 'dev/agents/status'", 'dev status route')
mustContain('scripts/dev-api.js', 'isLocalRequest', 'localhost-only dev lifecycle guard')
mustContain('scripts/dev-api.js', 'isVerifiedDevAgentProcess', 'verified dev process ownership')
mustContain('scripts/dev-api.js', 'getPortProcessDetails', 'port process readonly lookup')
mustContain('scripts/dev-api.js', 'stopVerifiedDevPid', 'verified pid stop')
mustContain('scripts/dev-api.js', 'taskkill\', [\'/F\', \'/T\', \'/PID\'', 'pid-scoped dev taskkill')

const changedLifecycleFiles = [
  'src-tauri/src/agent_lifecycle.rs',
  'src-tauri/src/lib.rs',
  'scripts/dev-api.js',
  'src/lib/agent-lifecycle.js',
  'src/engines/hermes/pages/chat.js',
  'src/pages/chat.js',
  'src/engines/hermes/pages/claude-code.js',
]

const forbidden = [
  /taskkill\s+\/IM\s+node\.exe/i,
  /taskkill\s+\/IM\s+python\.exe/i,
  /Stop-Process\s+-Name\s+node/i,
  /Stop-Process\s+-Name\s+python/i,
  /killall\s+node/i,
  /killall\s+python/i,
  /Get-NetTCPConnection[\s\S]{0,160}Stop-Process/i,
  /LocalPort[\s\S]{0,160}Stop-Process/i,
]

for (const path of changedLifecycleFiles) {
  const text = read(path)
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(text), `dangerous global kill found in ${path}: ${pattern}`)
  }
}

console.log('PASS smoke-agent-page-close-cleanup-static')
