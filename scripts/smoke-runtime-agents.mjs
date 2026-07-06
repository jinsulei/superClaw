#!/usr/bin/env node
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

const SENSITIVE_KEY_RE = /token|api[_-]?key|secret|cookie|password|access[_-]?token|refresh[_-]?token/i
const SENSITIVE_VALUE_RE = /(fake-[A-Za-z0-9_-]*(?:token|apiKey|secret|cookie)[A-Za-z0-9_-]*|sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{8,})/gi

export function redactRuntimeSmokePayload(value) {
  if (Array.isArray(value)) return value.map(redactRuntimeSmokePayload)
  if (value && typeof value === 'object') {
    const output = {}
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : redactRuntimeSmokePayload(entry)
    }
    return output
  }
  if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_RE, '[REDACTED]')
  return value
}

export function parseGatewayStatus(text = '') {
  const value = String(text)
  const tokenMismatch = /token mismatch|令牌不匹配|未授权|unauthorized/i.test(value)
  const connectivityOk = /Connectivity probe:\s*ok/i.test(value)
  const runtimeRunning = /Runtime:\s*running/i.test(value) || connectivityOk
  const failures = []
  const warnings = []

  if (tokenMismatch) failures.push({ code: 'gateway_token_mismatch', message: 'Gateway token mismatch.' })
  if (!connectivityOk) failures.push({ code: 'gateway_probe_failed', message: 'Gateway connectivity probe is not ok.' })
  if (!runtimeRunning) warnings.push({ code: 'gateway_runtime_not_reported_running', message: 'Gateway runtime is not reported as running.' })
  if (/Service config issue|Service config looks out of date or non-standard/i.test(value)) {
    warnings.push({ code: 'service_config_non_standard', message: 'OpenClaw service config is non-standard.' })
  }

  return {
    ok: failures.length === 0,
    connectivity_ok: connectivityOk,
    runtime_running: runtimeRunning,
    token_mismatch: tokenMismatch,
    warnings,
    failures,
  }
}

export function parseDoctorOutput(text = '') {
  const value = String(text)
  const lower = value.toLowerCase()
  const failures = []
  const warnings = []

  if (/(bootstrap|agents\.md|heartbeat\.md|identity\.md|soul\.md|tools\.md|user\.md)[^.\n]*(truncated|截断)|truncated[^.\n]*(bootstrap|agents\.md|heartbeat\.md|identity\.md|soul\.md|tools\.md|user\.md)|截断[^.\n]*(bootstrap|agents\.md|heartbeat\.md|identity\.md|soul\.md|tools\.md|user\.md)/i.test(value)) {
    failures.push({ code: 'bootstrap_truncated', message: 'OpenClaw bootstrap content is reported as truncated.' })
  }
  if (/token mismatch|令牌不匹配|未授权/i.test(value)) {
    failures.push({ code: 'gateway_token_mismatch', message: 'Doctor output reports gateway token mismatch.' })
  }
  if (lower.includes('plaintext secret-bearing config fields')) {
    warnings.push({ code: 'plaintext_secret_deferred', message: 'Plaintext secret-bearing fields remain deferred.' })
  }
  if (/No command owner is configured|commands\.ownerAllowFrom/i.test(value)) {
    warnings.push({ code: 'command_owner_missing', message: 'Command owner is not configured.' })
  }
  if (/tool policy removed .*tools\.profile \(coding\)|tools\.profile=coding|via tools\.profile \(coding\)/i.test(value)) {
    warnings.push({ code: 'tools_profile_coding_trimmed_tools', message: 'coding profile trims non-development tools.' })
  }

  return {
    ok: failures.length === 0,
    warnings,
    failures,
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      windowsHide: true,
      shell: options.shell === true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}` })
    })
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

function testTcp(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const done = (ok) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

function summarizeCommandResult(result) {
  return {
    exit_code: result.code,
    stdout_chars: result.stdout.length,
    stderr_chars: result.stderr.length,
  }
}

async function runRuntimeAgentsSmoke() {
  const openclawCmd = path.join(repoRoot, 'src-tauri', 'resources', 'runtime', 'openclaw', 'openclaw.cmd')
  const checks = []
  const warnings = []
  const failures = []

  const portReachable = await testTcp('127.0.0.1', 18789)
  checks.push({ name: '18789 reachable', passed: portReachable })
  if (!portReachable) failures.push({ code: 'port_18789_unreachable', message: '127.0.0.1:18789 is not reachable.' })

  const gatewayStatusResult = await runCommand(openclawCmd, ['gateway', 'status'], { shell: true })
  const gatewayParsed = parseGatewayStatus(`${gatewayStatusResult.stdout}\n${gatewayStatusResult.stderr}`)
  checks.push({ name: 'OpenClaw gateway status ok', passed: gatewayParsed.ok, detail: summarizeCommandResult(gatewayStatusResult) })
  warnings.push(...gatewayParsed.warnings)
  failures.push(...gatewayParsed.failures)

  const profileResult = await runCommand(openclawCmd, ['config', 'get', 'tools.profile'], { shell: true })
  const profile = profileResult.stdout.trim()
  const profileOk = profile === 'coding'
  checks.push({ name: 'tools.profile is coding', passed: profileOk, detail: { value: profile || null } })
  if (!profileOk) failures.push({ code: 'tools_profile_not_coding', message: 'tools.profile is not coding.' })

  const doctorResult = await runCommand(openclawCmd, ['doctor', '--lint'], { shell: true })
  const doctorParsed = parseDoctorOutput(`${doctorResult.stdout}\n${doctorResult.stderr}`)
  checks.push({ name: 'OpenClaw doctor has no bootstrap truncation or token mismatch', passed: doctorParsed.ok, detail: summarizeCommandResult(doctorResult) })
  warnings.push(...doctorParsed.warnings)
  failures.push(...doctorParsed.failures)

  const claudeModes = await runCommand(process.execPath, ['scripts/test-claude-code-modes.mjs'])
  checks.push({ name: 'Claude Code modes smoke', passed: claudeModes.code === 0, detail: summarizeCommandResult(claudeModes) })
  if (claudeModes.code !== 0) failures.push({ code: 'claude_modes_failed', message: 'Claude Code modes smoke failed.' })

  const collaboration = await runCommand(process.execPath, ['scripts/test-collaboration.mjs'])
  checks.push({ name: 'Collaboration smoke', passed: collaboration.code === 0, detail: summarizeCommandResult(collaboration) })
  if (collaboration.code !== 0) failures.push({ code: 'collaboration_smoke_failed', message: 'Collaboration smoke failed.' })

  const summary = redactRuntimeSmokePayload({
    ok: failures.length === 0,
    checked_at: new Date().toISOString(),
    scope: 'runtime-agents-smoke',
    checks,
    warnings,
    failures,
  })

  console.log(JSON.stringify(summary, null, 2))
  return summary.ok ? 0 : 1
}

if (path.resolve(process.argv[1] || '') === __filename) {
  const code = await runRuntimeAgentsSmoke()
  process.exitCode = code
}
