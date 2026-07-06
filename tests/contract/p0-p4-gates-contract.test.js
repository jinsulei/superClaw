import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildP0P4GateReport,
  formatP0P4GateReport,
  normalizeP0P4Mode,
  sanitizeP0P4Issue,
} from '../../scripts/check-p0-p4-gates.mjs'
import { devFixture, fakeSecretValue, releaseFixture } from './fixtures/p0-p4-gates.fixture.js'

test('dev mode treats deferred plaintext secrets as warning rather than blocker', () => {
  const report = buildP0P4GateReport(devFixture)

  assert.equal(report.mode, 'dev')
  assert.equal(report.blocked, false)
  assert.equal(report.summary.P0, 0)

  const secretIssue = report.issues.find(issue => issue.code === 'plaintext_secret_deferred')
  assert.ok(secretIssue)
  assert.equal(secretIssue.severity, 'P2')
  assert.deepEqual(secretIssue.blocking_in, ['release'])
  assert.match(secretIssue.detail, /gateway\.auth\.token/)
  assert.doesNotMatch(JSON.stringify(report), new RegExp(fakeSecretValue))
})

test('release mode promotes release blockers to P0 without leaking secret values', () => {
  const report = buildP0P4GateReport(releaseFixture)
  const output = formatP0P4GateReport(report)

  assert.equal(report.mode, 'release')
  assert.equal(report.blocked, true)
  assert.ok(report.summary.P0 >= 3)
  assert.ok(report.issues.some(issue => issue.code === 'plaintext_secret_release_blocker'))
  assert.ok(report.issues.some(issue => issue.code === 'runtime_data_secrets_packaging_risk'))
  assert.ok(report.issues.some(issue => issue.code === 'exe_usb_smoke_missing'))
  assert.match(output, /gateway\.auth\.token/)
  assert.doesNotMatch(output, new RegExp(fakeSecretValue))
  assert.doesNotMatch(output, /should-never-print/)
})

test('issue sanitizer keeps key paths and removes secret-bearing values', () => {
  const issue = sanitizeP0P4Issue({
    severity: 'P0',
    code: 'secret_probe',
    title: 'secret probe',
    detail: 'gateway.auth.token',
    blocking_in: ['release'],
    suggestion: 'migrate secret',
    value: fakeSecretValue,
    apiKey: 'fake-api-key-should-never-print',
    token: 'fake-token-should-never-print',
    secret: 'fake-secret-should-never-print',
    key_path: 'gateway.auth.token',
  })

  const serialized = JSON.stringify(issue)
  assert.equal(issue.key_path, 'gateway.auth.token')
  assert.doesNotMatch(serialized, /should-never-print/)
  assert.doesNotMatch(serialized, new RegExp(fakeSecretValue))
})

test('mode parser supports dev and release with safe default', () => {
  assert.equal(normalizeP0P4Mode(['node', 'script', '--mode=dev']), 'dev')
  assert.equal(normalizeP0P4Mode(['node', 'script', '--mode=release']), 'release')
  assert.equal(normalizeP0P4Mode(['node', 'script']), 'dev')
})

test('release gate includes only the contract test and not the local P0-P4 script', () => {
  const source = readFileSync(new URL('../../scripts/check-release-gates.mjs', import.meta.url), 'utf8')

  assert.match(source, /tests\/contract\/p0-p4-gates-contract\.test\.js/)
  assert.doesNotMatch(source, /node['"],\s*['"]scripts\/check-p0-p4-gates\.mjs/)
})
