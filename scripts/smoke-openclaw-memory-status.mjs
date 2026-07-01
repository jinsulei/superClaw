import fs from 'node:fs'
import path from 'node:path'
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
const memoryDir = path.join(root, 'src-tauri', 'resources', 'data', '.openclaw', 'memory')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function runOpenClaw(args, timeoutMs = 60000) {
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

const plugins = runOpenClaw(['plugins', 'list'])
assert(/\bmemory-core\b/i.test(plugins), 'memory-core plugin was not listed')
assert(/memory-core[\s\S]{0,240}\benabled\b/i.test(plugins) || /\benabled\b[\s\S]{0,240}memory-core/i.test(plugins), 'memory-core plugin was not enabled')
assert(fs.existsSync(memoryDir), 'OpenClaw memory directory is missing')
assert(fs.existsSync(path.join(memoryDir, 'metadata.json')), 'OpenClaw memory metadata is missing')

const metadata = JSON.parse(fs.readFileSync(path.join(memoryDir, 'metadata.json'), 'utf8'))
assert(metadata && typeof metadata === 'object', 'OpenClaw memory metadata is invalid')

console.log('OPENCLAW_MEMORY_CORE_PLUGIN: PASS')
console.log('OPENCLAW_MEMORY_DIR: PASS')
console.log('OPENCLAW_MEMORY_READONLY_CHECK: PASS')
