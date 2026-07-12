#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

const gates = [
  {
    group: 'Regression',
    commands: [
      ['node', '--test', 'tests/regression/link-reader-regression.test.js'],
      ['node', '--test', 'tests/regression/link-reader-status-ui-regression.test.js'],
      ['node', '--test', 'tests/regression/collaboration-watch-tasks.test.js'],
      ['node', '--test', 'tests/regression/collaboration-watch-integration.test.js'],
      ['node', '--test', 'tests/regression/collaboration-heartbeat-integration.test.js'],
      ['node', '--test', 'tests/regression/collaboration-watchdog-runner-integration.test.js'],
      ['node', '--test', 'tests/regression/collaboration-resume-dispatch-integration.test.js'],
      ['node', '--test', 'tests/regression/runtime-observability-bridge-integration.test.js'],
      ['node', '--test', 'tests/regression/hermes-history-contamination-regression.test.js'],
      ['node', '--test', 'tests/regression/hermes-run-timeout-final-state-regression.test.js'],
      ['node', '--test', 'tests/regression/openclaw-run-timeout-final-state-regression.test.js'],
      ['node', '--test', 'tests/regression/openclaw-tools-profile-effective-regression.test.js'],
      ['node', '--test', 'tests/regression/openclaw-native-execution-policy-regression.test.js'],
      ['node', '--test', 'tests/regression/openclaw-portable-device-identity-regression.test.js'],
      ['node', '--test', 'tests/regression/openclaw-portable-device-handshake-regression.test.js'],
      ['node', '--test', 'tests/regression/packaged-runtime-functionality-parity-regression.test.js'],
      ['node', '--test', 'tests/regression/agent-capability-intro-routing-regression.test.js'],
      ['node', '--test', 'tests/regression/ecommerce-ops-regression.test.js'],
      ['node', '--test', 'tests/regression/ecommerce-stage-guard-integration.test.js'],
      ['node', '--test', 'tests/regression/generation-ppt-regression.test.js'],
      ['node', '--test', 'tests/regression/generation-ppt-chat-integration.test.js'],
      ['node', '--test', 'tests/regression/generation-executor-boundary-integration.test.js'],
      ['node', '--test', 'tests/regression/wechat-customer-ops-regression.test.js'],
      ['node', '--test', 'tests/regression/wechat-customer-stage56-integration.test.js'],
      ['node', '--test', 'tests/regression/wechat-ocr-runtime-bridge-integration.test.js'],
      ['node', '--test', 'tests/regression/frontend-observability-regression.test.js'],
      ['node', '--test', 'tests/regression/frontend-observability-chat-integration.test.js'],
      ['node', '--test', 'tests/regression/openclaw-result-rendering-regression.test.js'],
    ],
  },
  {
    group: 'Contract',
    commands: [
      ['node', '--test', 'tests/contract/runtime-packaging-gate.test.js'],
      ['node', '--test', 'tests/contract/build-desktop-client-safety-contract.test.js'],
      ['node', '--test', 'tests/contract/portable-runtime-source-acceptance-contract.test.js'],
      ['node', '--test', 'tests/contract/observability-contract.test.js'],
      ['node', '--test', 'tests/contract/collaboration-observability-wrapper.test.js'],
      ['node', '--test', 'tests/contract/hermes-tool-runs-wrapper.test.js'],
      ['node', '--test', 'tests/contract/agent-runs-wrapper.test.js'],
      ['node', '--test', 'tests/contract/runtime-agents-smoke-contract.test.js'],
      ['node', '--test', 'tests/contract/p0-p4-gates-contract.test.js'],
    ],
  },
  {
    group: 'Smoke',
    commands: [
      ['node', 'scripts/test-collaboration.mjs'],
      ['node', 'scripts/smoke-hermes-ecommerce-link-reader.mjs'],
      ['node', 'scripts/smoke-hermes-link-reader-status.mjs'],
      ['node', 'scripts/smoke-hermes-link-material-workflow.mjs'],
      ['node', 'scripts/smoke-hermes-video-link-reader-chain.mjs'],
      ['node', 'scripts/smoke-ecommerce-stage1.mjs'],
      ['node', 'scripts/smoke-ecommerce-stage2.mjs'],
      ['node', 'scripts/smoke-ecommerce-stage3.mjs'],
      ['node', 'scripts/smoke-ecommerce-stage4.mjs'],
      ['node', 'scripts/smoke-ecommerce-stage56.mjs'],
    ],
  },
]

function commandLabel(command) {
  return command.join(' ')
}

function commandTargetExists(command) {
  const target = command[0] === 'node' && command[1] === '--test' ? command[2] : command[1]
  if (!target) return true
  return existsSync(path.join(repoRoot, target))
}

function normalizeCommand(command) {
  if (command[0] !== 'node') return command
  return [process.execPath, ...command.slice(1)]
}

function runCommand(command) {
  return new Promise(resolve => {
    const [executable, ...args] = normalizeCommand(command)
    const child = spawn(executable, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    })

    child.on('error', error => {
      resolve({ status: 'failed', error })
    })

    child.on('close', code => {
      resolve({ status: code === 0 ? 'passed' : 'failed', code })
    })
  })
}

const results = []

for (const gate of gates) {
  console.log(`\n=== ${gate.group} ===`)

  for (const command of gate.commands) {
    const label = commandLabel(command)

    if (!commandTargetExists(command)) {
      console.log(`[SKIP] ${label}`)
      results.push({ group: gate.group, label, status: 'skipped' })
      continue
    }

    console.log(`[RUN ] ${label}`)
    const result = await runCommand(command)
    const statusLabel = result.status === 'passed' ? 'PASS' : 'FAIL'
    console.log(`[${statusLabel}] ${label}`)

    results.push({
      group: gate.group,
      label,
      status: result.status,
      code: result.code,
      error: result.error,
    })
  }
}

const passed = results.filter(result => result.status === 'passed')
const failed = results.filter(result => result.status === 'failed')
const skipped = results.filter(result => result.status === 'skipped')

console.log('\n=== Release Gate Summary ===')
console.log(`total: ${results.length}`)
console.log(`passed: ${passed.length}`)
console.log(`failed: ${failed.length}`)
console.log(`skipped: ${skipped.length}`)

if (failed.length > 0) {
  console.log('\nfailed commands:')
  for (const result of failed) {
    const suffix = typeof result.code === 'number' ? ` (exit ${result.code})` : ''
    console.log(`- [${result.group}] ${result.label}${suffix}`)
    if (result.error) console.log(`  ${result.error.message}`)
  }
}

if (skipped.length > 0) {
  console.log('\nskipped commands:')
  for (const result of skipped) {
    console.log(`- [${result.group}] ${result.label}`)
  }
}

process.exitCode = failed.length > 0 ? 1 : 0
