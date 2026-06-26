import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function pass(label) {
  console.log(`${label}: PASS`)
}

function assertPass(label, condition, message) {
  assert.ok(condition, message || label)
  pass(label)
}

const devApi = read('scripts/dev-api.js')
const claudePanel = read('src-tauri/resources/runtime/claude-panel/server.js')
const claudePage = read('src/engines/hermes/pages/claude-code.js')
const openclawCiao = read('src-tauri/resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/@homebridge/ciao/lib/NetworkManager.js')

function blockBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle)
  if (start < 0) return ''
  const end = text.indexOf(endNeedle, start)
  return end < 0 ? text.slice(start) : text.slice(start, end + endNeedle.length)
}

assertPass(
  'OPENCLAW_AUTO_SPAWN_BACKGROUND_GUARD',
  devApi.includes('function automaticAgentSpawnOptions') &&
    devApi.includes('windowsHide: true') &&
    devApi.includes('detached: false') &&
    devApi.includes('normalizeBackgroundStdio(options.stdio)') &&
    /spawnOpenclaw\([^]*automaticAgentSpawnOptions\(rest\)/.test(devApi) &&
    /spawnOpenclawSync\([^]*automaticAgentSpawnOptions\(rest\)/.test(devApi),
  'OpenClaw automatic spawn calls must pass through the background guard.',
)

assertPass(
  'HERMES_AUTO_GATEWAY_BACKGROUND',
  (() => {
    const block = blockBetween(devApi, 'const child = spawn(gatewaySpec.command, gatewaySpec.args', 'child.unref()')
    return block.includes("stdio: ['ignore', logFd, logFd]") &&
      block.includes('windowsHide: true') &&
      !block.includes('detached: true')
  })(),
  'Hermes automatic gateway startup should be hidden and not detached as a visible terminal.',
)

assertPass(
  'HERMES_AUTO_DASHBOARD_BACKGROUND',
  (() => {
    const block = blockBetween(devApi, 'const child = spawn(dashboardSpec.command, dashboardSpec.args', 'child.unref()')
    return block.includes("stdio: ['ignore', out, err]") &&
      block.includes('windowsHide: true') &&
      !block.includes('detached: true')
  })(),
  'Hermes automatic dashboard startup should be hidden and not detached as a visible terminal.',
)

assertPass(
  'CLAUDE_AUTO_COMMANDS_BACKGROUND',
  claudePanel.includes('function hiddenClaudeSpawnOptions') &&
    claudePanel.includes('windowsHide: true') &&
    claudePanel.includes('detached: false') &&
    /function spawnClaudeSync\([^]*hiddenClaudeSpawnOptions\(options\)/.test(claudePanel) &&
    /function spawnClaude\([^]*hiddenClaudeSpawnOptions\(options\)/.test(claudePanel) &&
    /const child = spawnClaude\([^]*stdio: \["ignore", "pipe", "pipe"\],[^]*windowsHide: true,[^]*\}\)/.test(claudePanel),
  'Claude Panel automatic run path must use hidden spawn options.',
)

assertPass(
  'NO_AUTO_WT_EXE',
  !/wt\.exe|WindowsTerminal/i.test(devApi + claudePanel),
  'Automatic agent paths must not launch Windows Terminal.',
)

assertPass(
  'NO_STDIO_INHERIT_IN_AGENT_RUNTIME',
  !/stdio:\s*['"]inherit['"]/.test(devApi + claudePanel),
  'Agent runtime should not inherit stdio for automatic commands.',
)

assertPass(
  'OPENCLAW_CIAO_ARP_WINDOWS_HIDE',
  /exec\("arp -a[^"]*",\s*\{\s*windowsHide:\s*true\s*\}/.test(openclawCiao),
  '@homebridge/ciao arp probes must keep windowsHide:true to avoid cmd flashes.',
)

assertPass(
  'MANUAL_NATIVE_TERMINAL_BUTTON_EXISTS',
  claudePage.includes("cloudcode-open-native") &&
    claudePage.includes('openNative(page)') &&
    claudePanel.includes('/api/native-claude-terminal') &&
    claudePanel.includes('cmd.exe", "/k"') &&
    claudePanel.includes('windowsHide: false'),
  'The manual native terminal button/path must remain available.',
)

console.log('smoke-agent-no-terminal-popup passed')
