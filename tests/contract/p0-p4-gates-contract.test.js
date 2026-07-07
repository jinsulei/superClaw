import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildP0P4GateReport,
  formatP0P4GateReport,
  normalizeP0P4CandidatePath,
  normalizeP0P4Mode,
  sanitizeP0P4Issue,
  scanReleaseCandidate,
} from '../../scripts/check-p0-p4-gates.mjs'
import {
  cleanCandidateFixture,
  devFixture,
  dirtyCandidateFixture,
  fakeSecretValue,
  releaseFixture,
  releaseNoCandidateFixture,
} from './fixtures/p0-p4-gates.fixture.js'

function writeFixtureFile(filePath, content = 'fixture') {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

test('dev mode treats deferred plaintext secrets as warning rather than blocker', () => {
  const report = buildP0P4GateReport(devFixture)

  assert.equal(report.mode, 'dev')
  assert.equal(report.blocked, false)
  assert.equal(report.summary.P0, 0)

  const secretIssue = report.issues.find(issue => issue.code === 'plaintext_secret_deferred')
  assert.ok(secretIssue)
  assert.equal(secretIssue.severity, 'P2')
  assert.deepEqual(secretIssue.blocking_in, ['release-candidate'])
  assert.match(secretIssue.detail, /gateway\.auth\.token/)
  assert.doesNotMatch(JSON.stringify(report), new RegExp(fakeSecretValue))
})

test('release mode promotes release blockers to P0 without leaking secret values', () => {
  const report = buildP0P4GateReport(releaseFixture)
  const output = formatP0P4GateReport(report)

  assert.equal(report.mode, 'release')
  assert.equal(report.blocked, true)
  assert.ok(report.summary.P0 >= 2)
  assert.ok(report.issues.some(issue => issue.code === 'release_candidate_missing'))
  assert.ok(report.issues.some(issue => issue.code === 'runtime_data_secrets_packaging_risk'))
  assert.ok(report.issues.some(issue => issue.code === 'exe_usb_smoke_missing'))
  assert.ok(report.issues.some(issue => issue.code === 'plaintext_secret_deferred'))
  assert.ok(!report.issues.some(issue => issue.code === 'plaintext_secret_release_blocker'))
  assert.match(output, /gateway\.auth\.token/)
  assert.doesNotMatch(output, new RegExp(fakeSecretValue))
  assert.doesNotMatch(output, /should-never-print/)
})

test('release without candidate blocks smoke/candidate readiness but not private config secrets', () => {
  const report = buildP0P4GateReport(releaseNoCandidateFixture)
  const output = formatP0P4GateReport(report)

  assert.equal(report.mode, 'release')
  assert.equal(report.blocked, true)
  assert.ok(report.issues.some(issue => issue.code === 'release_candidate_missing'))
  assert.ok(report.issues.some(issue => issue.code === 'exe_usb_smoke_missing'))
  assert.ok(report.issues.some(issue => issue.code === 'plaintext_secret_deferred'))
  assert.ok(!report.issues.some(issue => issue.code === 'plaintext_secret_release_blocker'))
  assert.doesNotMatch(output, new RegExp(fakeSecretValue))
})

test('clean release candidate does not trigger package secret leak blockers', () => {
  const report = buildP0P4GateReport(cleanCandidateFixture)

  assert.equal(report.mode, 'release')
  assert.equal(report.blocked, false)
  assert.equal(report.summary.P0, 0)
  assert.ok(!report.issues.some(issue => issue.code === 'release_candidate_secret_leak'))
  assert.ok(!report.issues.some(issue => issue.code === 'release_candidate_user_state_leak'))
})

test('dirty release candidate blocks release without leaking secret values', () => {
  const report = buildP0P4GateReport(dirtyCandidateFixture)
  const output = formatP0P4GateReport(report)

  assert.equal(report.mode, 'release')
  assert.equal(report.blocked, true)
  assert.ok(report.issues.some(issue => issue.code === 'release_candidate_secret_leak'))
  assert.ok(report.issues.some(issue => issue.code === 'release_candidate_user_state_leak'))
  assert.match(output, /gateway\.auth\.token/)
  assert.match(output, /runtime\/data\/secrets/)
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

test('candidate parser supports explicit release candidate paths', () => {
  assert.equal(normalizeP0P4CandidatePath(['node', 'script']), '')
  assert.equal(
    normalizeP0P4CandidatePath(['node', 'script', '--candidate=C:\\tmp\\SuperClaw_Desktop_Client']),
    'C:\\tmp\\SuperClaw_Desktop_Client',
  )
})

test('release candidate scanner accepts placeholders and blocks real candidate leaks', () => {
  const root = path.join(os.tmpdir(), `p0-p4-candidate-${process.pid}-${Date.now()}`)
  const cleanRoot = path.join(root, 'clean')
  const dirtyRoot = path.join(root, 'dirty')

  try {
    mkdirSync(path.join(cleanRoot, 'resources/data/.openclaw'), { recursive: true })
    writeFileSync(
      path.join(cleanRoot, 'resources/data/.openclaw/openclaw.json'),
      JSON.stringify({
        gateway: { auth: { token: '${OPENCLAW_GATEWAY_TOKEN}' } },
        models: { providers: { minimax: { apiKey: '' } } },
      }),
    )
    mkdirSync(path.join(cleanRoot, 'resources/data/claude-panel'), { recursive: true })
    writeFileSync(
      path.join(cleanRoot, 'resources/data/claude-panel/relay-config.json'),
      JSON.stringify({ apiKey: 'REPLACE_ME' }),
    )

    mkdirSync(path.join(dirtyRoot, 'resources/data/.openclaw'), { recursive: true })
    writeFileSync(
      path.join(dirtyRoot, 'resources/data/.openclaw/openclaw.json'),
      JSON.stringify({
        gateway: { auth: { token: fakeSecretValue } },
        models: { providers: { minimax: { apiKey: 'minimax-fake-api-key-should-never-print' } } },
      }),
    )
    mkdirSync(path.join(dirtyRoot, 'resources/data/hermes'), { recursive: true })
    writeFileSync(path.join(dirtyRoot, 'resources/data/hermes/.env'), `TOKEN=${fakeSecretValue}`)
    mkdirSync(path.join(dirtyRoot, 'resources/runtime/data/secrets'), { recursive: true })
    writeFileSync(path.join(dirtyRoot, 'resources/runtime/data/secrets/key.json'), fakeSecretValue)
    mkdirSync(path.join(dirtyRoot, 'resources/data/sessions'), { recursive: true })
    writeFileSync(path.join(dirtyRoot, 'resources/data/sessions/session.db'), 'sqlite')

    const clean = scanReleaseCandidate(cleanRoot)
    const dirty = scanReleaseCandidate(dirtyRoot)

    assert.equal(clean.candidatePresent, true)
    assert.deepEqual(clean.candidateSecretLeaks, [])
    assert.deepEqual(clean.candidateUserStateHits, [])
    assert.equal(dirty.candidatePresent, true)
    assert.ok(dirty.candidateSecretLeaks.length >= 2)
    assert.ok(dirty.candidateUserStateHits.length >= 1)
    assert.doesNotMatch(JSON.stringify(dirty), new RegExp(fakeSecretValue))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('release candidate scanner ignores dependency source sessions and cache modules', () => {
  const root = path.join(os.tmpdir(), `p0-p4-candidate-user-state-${process.pid}-${Date.now()}`)
  const cleanRoot = path.join(root, 'clean-dependency-source')
  const dirtyRoot = path.join(root, 'dirty-real-user-state')

  try {
    const dependencySourceFiles = [
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/plugin-sdk/src/config/sessions/index.js',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/plugin-sdk/src/config/sessions/index.d.ts',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/plugin-sdk/src/config/sessions/index.js.map',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/plugin-sdk/src/config/cache/cache.js',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/plugin-sdk/src/config/cache/cache.d.ts',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/plugin-sdk/src/config/cache/cache.js.map',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/@anthropic-ai/sdk/resources/beta/sessions/events.js',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/@anthropic-ai/sdk/resources/beta/sessions/events.d.ts',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/@anthropic-ai/sdk/resources/beta/sessions/events.d.mts',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/@anthropic-ai/sdk/resources/beta/sessions/events.js.map',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/@anthropic-ai/sdk/src/resources/beta/sessions/threads/index.js',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/undici/lib/web/cookies/index.js',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/undici/lib/web/cookies/index.d.ts',
      'resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/node_modules/undici/lib/web/cookies/index.js.map',
    ]

    for (const relativePath of dependencySourceFiles) {
      writeFixtureFile(path.join(cleanRoot, relativePath), 'export const value = true\n')
    }

    writeFixtureFile(path.join(dirtyRoot, 'resources/data/sessions/session.db'), 'sqlite')
    writeFixtureFile(path.join(dirtyRoot, 'resources/data/cache/blob.bin'), 'cache')
    writeFixtureFile(path.join(dirtyRoot, 'resources/data/browser-profile/Cookies'), 'cookies')
    writeFixtureFile(path.join(dirtyRoot, 'resources/data/browser-profile/Network/Cookies'), 'cookies')
    writeFixtureFile(path.join(dirtyRoot, 'resources/data/browser-profile/cookies.sqlite'), 'sqlite')
    writeFixtureFile(path.join(dirtyRoot, 'resources/data/logs/openclaw.log'), 'log')
    writeFixtureFile(path.join(dirtyRoot, 'resources/runtime/data/secrets/key.json'), fakeSecretValue)
    writeFixtureFile(path.join(dirtyRoot, 'resources/data/hermes/.env'), `TOKEN=${fakeSecretValue}`)
    writeFixtureFile(
      path.join(dirtyRoot, 'resources/data/.openclaw/openclaw.json'),
      JSON.stringify({
        gateway: { auth: { token: fakeSecretValue } },
        models: { providers: { minimax: { apiKey: 'minimax-fake-api-key-should-never-print' } } },
      }),
    )
    writeFixtureFile(
      path.join(dirtyRoot, 'resources/data/claude-panel/relay-config.json'),
      JSON.stringify({ apiKey: fakeSecretValue }),
    )

    const clean = scanReleaseCandidate(cleanRoot)
    const dirty = scanReleaseCandidate(dirtyRoot)

    assert.equal(clean.candidatePresent, true)
    assert.deepEqual(clean.candidateUserStateHits, [])

    assert.equal(dirty.candidatePresent, true)
    assert.ok(dirty.candidateUserStateHits.some(hit => hit.path.includes('resources/data/sessions')))
    assert.ok(dirty.candidateUserStateHits.some(hit => hit.path.includes('resources/data/cache')))
    assert.ok(dirty.candidateUserStateHits.some(hit => hit.path.includes('resources/data/browser-profile')))
    assert.ok(dirty.candidateUserStateHits.some(hit => hit.path.includes('Network/Cookies')))
    assert.ok(dirty.candidateUserStateHits.some(hit => hit.path.includes('cookies.sqlite')))
    assert.ok(dirty.candidateUserStateHits.some(hit => hit.path.includes('resources/data/logs')))
    assert.ok(dirty.candidateSecretLeaks.some(hit => hit.path.includes('resources/runtime/data/secrets')))
    assert.ok(dirty.candidateSecretLeaks.some(hit => hit.path.endsWith('.env')))
    assert.ok(dirty.candidateSecretLeaks.some(hit => hit.key_path === 'gateway.auth.token'))
    assert.ok(dirty.candidateSecretLeaks.some(hit => hit.key_path === 'apiKey'))
    assert.doesNotMatch(JSON.stringify(dirty), new RegExp(fakeSecretValue))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('release gate includes only the contract test and not the local P0-P4 script', () => {
  const source = readFileSync(new URL('../../scripts/check-release-gates.mjs', import.meta.url), 'utf8')

  assert.match(source, /tests\/contract\/p0-p4-gates-contract\.test\.js/)
  assert.doesNotMatch(source, /node['"],\s*['"]scripts\/check-p0-p4-gates\.mjs/)
})
