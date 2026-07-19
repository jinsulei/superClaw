import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  doctorWithBootstrapTruncation,
  doctorWithDeferredWarnings,
  fakeSensitivePayload,
  gatewayStatusOk,
  gatewayStatusTokenMismatch,
} from './fixtures/runtime-agents-smoke.fixture.js'

import {
  parseDoctorOutput,
  parseGatewayStatus,
  redactRuntimeSmokePayload,
} from '../../scripts/smoke-runtime-agents.mjs'

const repoRoot = process.cwd()

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('gateway status parser accepts Connectivity probe ok', () => {
  const parsed = parseGatewayStatus(gatewayStatusOk)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.connectivity_ok, true)
  assert.equal(parsed.token_mismatch, false)
  assert.ok(parsed.warnings.some((warning) => warning.code === 'service_config_non_standard'))
})

test('gateway status parser rejects token mismatch', () => {
  const parsed = parseGatewayStatus(gatewayStatusTokenMismatch)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.token_mismatch, true)
  assert.ok(parsed.failures.some((failure) => failure.code === 'gateway_token_mismatch'))
})

test('gateway status parser accepts a portable foreground gateway without a scheduled service', () => {
  const parsed = parseGatewayStatus([
    'Service: Scheduled Task (missing)',
    'Runtime: stopped (ERROR: The system cannot find the file specified.)',
    '- pid 43288: openclaw.mjs gateway run',
    'Listening: 127.0.0.1:18789',
  ].join('\n'))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.connectivity_ok, true)
  assert.equal(parsed.runtime_running, true)
})

test('doctor parser fails bootstrap truncation but defers plaintext secret warnings', () => {
  const bootstrap = parseDoctorOutput(doctorWithBootstrapTruncation)
  assert.equal(bootstrap.ok, false)
  assert.ok(bootstrap.failures.some((failure) => failure.code === 'bootstrap_truncated'))

  const deferred = parseDoctorOutput(doctorWithDeferredWarnings)
  assert.equal(deferred.ok, true)
  assert.ok(deferred.warnings.some((warning) => warning.code === 'plaintext_secret_deferred'))
  assert.ok(deferred.warnings.some((warning) => warning.code === 'command_owner_missing'))
  assert.ok(deferred.warnings.some((warning) => warning.code === 'tools_profile_coding_trimmed_tools'))
})

test('runtime smoke redaction never exposes token, apiKey, secret, or cookie values', () => {
  const redacted = JSON.stringify(redactRuntimeSmokePayload(fakeSensitivePayload))
  assert.ok(!redacted.includes('fake-token-should-be-redacted'))
  assert.ok(!redacted.includes('fake-apiKey-should-be-redacted'))
  assert.ok(!redacted.includes('fake-secret-should-be-redacted'))
  assert.ok(!redacted.includes('fake-cookie-should-be-redacted'))
  assert.match(redacted, /\[REDACTED\]/)
})

test('runtime smoke uses the same portable OpenClaw environment as the desktop runtime', () => {
  const source = readText('scripts/smoke-runtime-agents.mjs')
  for (const marker of [
    'openclawPortableSmokeEnv',
    'OPENCLAW_HOME',
    'OPENCLAW_STATE_DIR',
    'OPENCLAW_CONFIG_PATH',
    'OPENCLAW_LOG_DIR',
    'USERPROFILE',
  ]) {
    assert.match(source, new RegExp(marker), `runtime smoke must use portable ${marker}`)
  }
  assert.match(source, /env: openclawEnv/, 'OpenClaw CLI probes must use the portable environment')
  assert.match(source, /cwd: path\.join\(repoRoot, 'src-tauri', 'resources', 'data', '\.openclaw'\)/, 'OpenClaw CLI probes must run inside portable data')
})

test('release gate includes only the contract test and not the local runtime smoke', () => {
  const gate = readText('scripts/check-release-gates.mjs')
  assert.match(gate, /node['"],\s*['"]--test['"],\s*['"]tests\/contract\/runtime-agents-smoke-contract\.test\.js/)
  assert.doesNotMatch(gate, /node['"],\s*['"]scripts\/smoke-runtime-agents\.mjs/)
})
