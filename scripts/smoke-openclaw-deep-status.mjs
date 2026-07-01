import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const openclawRuntimeDir = path.join(
  root,
  'src-tauri',
  'resources',
  'runtime',
  'openclaw',
)
const openclawCmd = path.join(openclawRuntimeDir, process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw')
const openclawNode = path.join(openclawRuntimeDir, process.platform === 'win32' ? 'node.exe' : 'node')
const openclawEntrypoints = [
  path.join(openclawRuntimeDir, 'openclaw.mjs'),
  path.join(openclawRuntimeDir, 'node_modules', '@qingchencloud', 'openclaw-zh', 'openclaw.mjs'),
  path.join(openclawRuntimeDir, 'node_modules', 'openclaw', 'openclaw.mjs'),
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function runOpenClaw(args, timeoutMs = 90000) {
  const entrypoint = openclawEntrypoints.find(candidate => fs.existsSync(candidate))
  const command = entrypoint && fs.existsSync(openclawNode) ? openclawNode : openclawCmd
  const commandArgs = entrypoint && fs.existsSync(openclawNode) ? [entrypoint, ...args] : args
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  })
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  if (result.error) throw result.error
  assert(result.status === 0, `openclaw ${args.join(' ')} exited ${result.status}: ${output.slice(0, 1000)}`)
  return output
}

const status = runOpenClaw(['status', '--deep'])
assert(/Gateway|gateway|Health|health|Plugin compatibility/i.test(status), 'deep status did not include expected sections')
assert(/Plugin compatibility/i.test(status), 'deep status did not report plugin compatibility')

const audit = runOpenClaw(['security', 'audit'])
assert(/Summary/i.test(audit), 'security audit did not include a summary')
assert(/0\s+critical/i.test(audit), 'security audit reported critical issues')

console.log('OPENCLAW_DEEP_STATUS: PASS')
console.log('OPENCLAW_PLUGIN_COMPATIBILITY_AUDIT: PASS')
console.log('OPENCLAW_SECURITY_AUDIT_CRITICALS: 0')
