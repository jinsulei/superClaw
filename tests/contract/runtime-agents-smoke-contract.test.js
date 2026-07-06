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

test('release gate includes only the contract test and not the local runtime smoke', () => {
  const gate = readText('scripts/check-release-gates.mjs')
  assert.match(gate, /node['"],\s*['"]--test['"],\s*['"]tests\/contract\/runtime-agents-smoke-contract\.test\.js/)
  assert.doesNotMatch(gate, /node['"],\s*['"]scripts\/smoke-runtime-agents\.mjs/)
})
