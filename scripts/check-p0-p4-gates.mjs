#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')

const priorityKeys = ['P0', 'P1', 'P2', 'P3', 'P4']
const secretValueKeys = new Set(['value', 'token', 'apiKey', 'secret', 'password', 'credential'])

export function normalizeP0P4Mode(argv = process.argv) {
  const modeArg = argv.find(arg => arg.startsWith('--mode='))
  const mode = modeArg ? modeArg.slice('--mode='.length).trim().toLowerCase() : 'dev'
  return mode === 'release' ? 'release' : 'dev'
}

export function normalizeP0P4CandidatePath(argv = process.argv) {
  const candidateArg = argv.find(arg => arg.startsWith('--candidate='))
  return candidateArg ? candidateArg.slice('--candidate='.length).trim() : ''
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  })

  return {
    command: [command, ...args].join(' '),
    code: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    ok: result.status === 0,
  }
}

function runNode(args) {
  return run(process.execPath, args)
}

function testPort(host, port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port })
    const finish = passed => {
      socket.destroy()
      resolve(passed)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function asList(value) {
  return Array.isArray(value) ? value : []
}

function issue(input) {
  return sanitizeP0P4Issue(input)
}

export function sanitizeP0P4Issue(input = {}) {
  const sanitized = {}
  for (const [key, value] of Object.entries(input)) {
    if (secretValueKeys.has(key)) continue
    if (key.toLowerCase().includes('secret') && key !== 'secret_key_path') continue
    if (key.toLowerCase().includes('token') && key !== 'key_path') continue
    if (key.toLowerCase().includes('apikey') && key !== 'key_path') continue
    sanitized[key] = value
  }
  sanitized.severity = priorityKeys.includes(sanitized.severity) ? sanitized.severity : 'P4'
  sanitized.blocking_in = asList(sanitized.blocking_in)
  return sanitized
}

function pushIssue(issues, input) {
  issues.push(issue(input))
}

function buildSummary(issues) {
  const summary = Object.fromEntries(priorityKeys.map(priority => [priority, 0]))
  for (const item of issues) summary[item.severity] += 1
  return summary
}

function redactCommandOutput(output) {
  return String(output || '')
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, '[REDACTED_SECRET]')
    .replace(/(sk-proj-[A-Za-z0-9_-]+)/g, '[REDACTED_SECRET]')
    .replace(/([A-Za-z0-9_-]*(?:token|secret|apikey|apiKey)[A-Za-z0-9_-]*\s*[:=]\s*)["']?[^"'\s,}]+/gi, '$1[REDACTED_SECRET]')
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/')
}

function isBlankOrTemplateSecret(value) {
  if (value === null || value === undefined) return true
  const text = String(value).trim()
  if (!text) return true
  if (/^\$\{[A-Z0-9_]+\}$/i.test(text)) return true
  if (/^(REPLACE_ME|PLACEHOLDER|YOUR_[A-Z0-9_]+|CHANGE_ME|TODO)$/i.test(text)) return true
  if (/^<[^<>]+>$/.test(text)) return true
  return false
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function addCandidateSecretLeak(leaks, filePath, keyPath) {
  leaks.push({
    path: toPosixPath(filePath),
    key_path: keyPath,
  })
}

function addCandidateUserStateHit(hits, filePath, reason) {
  hits.push({
    path: toPosixPath(filePath),
    reason,
  })
}

function getNestedValue(root, keyPath) {
  return keyPath.split('.').reduce((current, key) => current?.[key], root)
}

function scanOpenClawConfigForLeaks(relativePath, parsed, leaks) {
  const directSecretKeys = ['gateway.auth.token', 'gateway.auth.password']
  for (const keyPath of directSecretKeys) {
    const value = getNestedValue(parsed, keyPath)
    if (!isBlankOrTemplateSecret(value)) addCandidateSecretLeak(leaks, relativePath, keyPath)
  }

  const providers = parsed?.models?.providers || {}
  for (const providerName of Object.keys(providers)) {
    const apiKey = providers[providerName]?.apiKey
    if (!isBlankOrTemplateSecret(apiKey)) {
      addCandidateSecretLeak(leaks, relativePath, `models.providers.${providerName}.apiKey`)
    }
  }
}

function scanRelayConfigForLeaks(relativePath, parsed, leaks) {
  const value = parsed?.apiKey
  if (!isBlankOrTemplateSecret(value)) addCandidateSecretLeak(leaks, relativePath, 'apiKey')
}

function looksLikeCandidateUserState(relativePath) {
  const normalized = toPosixPath(relativePath).toLowerCase()
  if (isDependencySourceUserStateName(normalized)) return ''
  if (/(^|\/)(cookies|login data|history|session\.db)$/.test(normalized)) return 'browser profile'
  if (/(^|\/)(logs?|sessions?|browser-profile|user-data|cache)(\/|$)/.test(normalized)) return 'user state'
  if (/\.(log|db|sqlite|sqlite3)$/.test(normalized)) return 'logs/db/sessions'
  return ''
}

function isDependencySourceUserStateName(normalizedPath) {
  if (!normalizedPath.includes('/node_modules/')) return false
  if (!/\/(src|dist|lib|resources|cjs|esm|types|dist-es|dist-types)\//.test(normalizedPath)) return false
  if (!/\/(sessions?|cache|cookies)(\/|$)/.test(normalizedPath)) return false

  const basename = normalizedPath.split('/').pop() || ''
  if (/^(sessions?|cache|cookies)$/.test(basename)) return true
  if (!basename.includes('.')) return true
  return /\.(cjs|mjs|js|jsx|ts|tsx|cts|mts|d\.ts|d\.cts|d\.mts|map)$/.test(normalizedPath)
}

function looksLikeCandidateSecretPath(relativePath) {
  const normalized = toPosixPath(relativePath).toLowerCase()
  if (/(^|\/)\.env(\.|$|\/)?/.test(normalized)) return '.env'
  if (/(^|\/)runtime\/data\/secrets(\/|$)/.test(normalized)) return 'runtime/data/secrets'
  if (/(^|\/)resources\/data\/secrets(\/|$)/.test(normalized)) return 'resources/data/secrets'
  return ''
}

function scanCandidateFile(candidateRoot, absolutePath, leaks, userStateHits) {
  const relativePath = toPosixPath(path.relative(candidateRoot, absolutePath))
  const secretPathKey = looksLikeCandidateSecretPath(relativePath)
  if (secretPathKey) addCandidateSecretLeak(leaks, relativePath, secretPathKey)

  const userStateReason = looksLikeCandidateUserState(relativePath)
  if (userStateReason) addCandidateUserStateHit(userStateHits, relativePath, userStateReason)

  const basename = path.basename(absolutePath).toLowerCase()
  if (!['openclaw.json', 'relay-config.json'].includes(basename)) return

  const parsed = safeJsonParse(readFileSync(absolutePath, 'utf8'))
  if (!parsed) return
  if (basename === 'openclaw.json') scanOpenClawConfigForLeaks(relativePath, parsed, leaks)
  if (basename === 'relay-config.json') scanRelayConfigForLeaks(relativePath, parsed, leaks)
}

function walkCandidate(candidateRoot, currentPath, leaks, userStateHits) {
  for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      const relativePath = toPosixPath(path.relative(candidateRoot, absolutePath))
      const secretPathKey = looksLikeCandidateSecretPath(relativePath)
      if (secretPathKey) addCandidateSecretLeak(leaks, relativePath, secretPathKey)
      const userStateReason = looksLikeCandidateUserState(relativePath)
      if (userStateReason) addCandidateUserStateHit(userStateHits, relativePath, userStateReason)
      walkCandidate(candidateRoot, absolutePath, leaks, userStateHits)
      continue
    }
    if (entry.isFile()) scanCandidateFile(candidateRoot, absolutePath, leaks, userStateHits)
  }
}

function uniqueCandidateFindings(findings) {
  const seen = new Set()
  return findings.filter(finding => {
    const key = `${finding.path}|${finding.key_path || finding.reason || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function scanReleaseCandidate(candidatePath) {
  const candidateRoot = path.resolve(String(candidatePath || ''))
  if (!candidatePath || !existsSync(candidateRoot)) {
    return {
      candidatePath: candidatePath || '',
      candidatePresent: false,
      candidateSecretLeaks: [],
      candidateUserStateHits: [],
    }
  }

  const stats = statSync(candidateRoot)
  if (!stats.isDirectory()) {
    return {
      candidatePath: candidateRoot,
      candidatePresent: false,
      candidateSecretLeaks: [],
      candidateUserStateHits: [],
    }
  }

  const candidateSecretLeaks = []
  const candidateUserStateHits = []
  walkCandidate(candidateRoot, candidateRoot, candidateSecretLeaks, candidateUserStateHits)

  return {
    candidatePath: candidateRoot,
    candidatePresent: true,
    candidateSecretLeaks: uniqueCandidateFindings(candidateSecretLeaks),
    candidateUserStateHits: uniqueCandidateFindings(candidateUserStateHits),
  }
}

export function buildP0P4GateReport(input = {}) {
  const mode = input.mode === 'release' ? 'release' : 'dev'
  const issues = []
  const git = input.git || {}
  const gates = input.gates || {}
  const openclaw = input.openclaw || {}
  const packaging = input.packaging || {}
  const regression = input.regression || {}
  const docs = input.docs || {}
  const stash = asList(input.stash)

  if (git.clean === false) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'git_worktree_dirty',
      title: 'Git working tree is not clean',
      detail: 'Uncommitted changes exist before release gate evaluation.',
      blocking_in: mode === 'release' ? ['release'] : ['release'],
      suggestion: 'Commit, stash, or explicitly isolate changes before continuing.',
    })
  }

  if (gates.releaseGatePassed === false) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'release_gate_failed',
      title: 'Release Gate failed',
      detail: 'scripts/check-release-gates.mjs did not pass.',
      blocking_in: ['dev', 'release'],
      suggestion: 'Fix failing gate before continuing.',
    })
  }

  if (gates.preflightPassed === false) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'preflight_failed',
      title: 'Preflight failed',
      detail: 'scripts/preflight-release.ps1 did not pass.',
      blocking_in: ['dev', 'release'],
      suggestion: 'Fix preflight failures before continuing.',
    })
  }

  if (gates.runtimeSmokePassed === false) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'runtime_smoke_failed',
      title: 'Runtime agents smoke failed',
      detail: 'scripts/smoke-runtime-agents.mjs did not pass.',
      blocking_in: ['dev', 'release'],
      suggestion: 'Restore gateway/runtime health before continuing.',
    })
  }

  if (openclaw.gatewayReachable === false) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'openclaw_gateway_unreachable',
      title: 'OpenClaw gateway is unreachable',
      detail: '127.0.0.1:18789 is not reachable.',
      blocking_in: ['dev', 'release'],
      suggestion: 'Start or restart the OpenClaw gateway without changing secrets.',
    })
  }

  if (openclaw.tokenMismatch === true) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'gateway_token_mismatch',
      title: 'OpenClaw gateway token mismatch',
      detail: 'Gateway status reported token mismatch.',
      blocking_in: ['dev', 'release'],
      suggestion: 'Restart stale gateway process; do not print or rotate token during this gate.',
    })
  }

  if (openclaw.bootstrapTruncated === true) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'bootstrap_truncation_regressed',
      title: 'OpenClaw bootstrap truncation regressed',
      detail: 'doctor output indicates bootstrap truncation.',
      blocking_in: ['dev', 'release'],
      suggestion: 'Restore bootstrap limits before continuing.',
    })
  }

  const secretPaths = asList(openclaw.plaintextSecretKeyPaths).map(item => {
    if (typeof item === 'string') return item
    return item?.key_path || item?.path || 'unknown.secret.path'
  })
  if (secretPaths.length > 0) {
    pushIssue(issues, {
      severity: 'P2',
      code: 'plaintext_secret_deferred',
      title: 'Private plaintext secret fields remain deferred',
      detail: `Secret-bearing key paths: ${secretPaths.join(', ')}`,
      blocking_in: ['release-candidate'],
      suggestion: 'Keep development secrets private; release candidates are checked separately for leaks.',
      key_path: secretPaths.join(', '),
    })
  }

  if (mode === 'release' && packaging.candidatePresent !== true) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'release_candidate_missing',
      title: 'Release candidate path is missing',
      detail: 'Release mode requires --candidate=<path> before package secret acceptance can pass.',
      blocking_in: ['release'],
      suggestion: 'Provide a built release candidate or USB output path for secret and user-state scanning.',
    })
  }

  for (const leak of asList(packaging.candidateSecretLeaks)) {
    const filePath = leak?.path || leak?.file || 'unknown-candidate-path'
    const keyPath = leak?.key_path || leak?.keyPath || 'unknown.secret.path'
    pushIssue(issues, {
      severity: 'P0',
      code: 'release_candidate_secret_leak',
      title: 'Release candidate contains secret-bearing data',
      detail: `${filePath}: ${keyPath}`,
      blocking_in: ['release'],
      suggestion: 'Remove real secrets from the release candidate; use blank values or environment placeholders.',
      key_path: keyPath,
    })
  }

  for (const hit of asList(packaging.candidateUserStateHits)) {
    const filePath = hit?.path || hit?.file || 'unknown-candidate-path'
    pushIssue(issues, {
      severity: 'P0',
      code: 'release_candidate_user_state_leak',
      title: 'Release candidate contains user state',
      detail: `${filePath}: ${hit?.reason || 'user state'}`,
      blocking_in: ['release'],
      suggestion: 'Remove browser profiles, logs, databases, sessions, and caches from the release candidate.',
    })
  }

  if (packaging.runtimeDataSecretsMayBePackaged === true) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'runtime_data_secrets_packaging_risk',
      title: 'runtime/data/secrets may enter package',
      detail: 'A runtime/data/secrets path is present or suspected.',
      blocking_in: ['release'],
      suggestion: 'Remove or exclude secret-bearing runtime data before packaging.',
    })
  }

  if (packaging.exeUsbSmokeAccepted === false && mode === 'release') {
    pushIssue(issues, {
      severity: 'P0',
      code: 'exe_usb_smoke_missing',
      title: 'EXE / USB smoke acceptance missing',
      detail: 'Release mode requires EXE / USB smoke acceptance before shipping.',
      blocking_in: ['release'],
      suggestion: 'Run and record EXE / USB smoke in the release validation stage.',
    })
  }

  for (const hit of asList(openclaw.oldPathHits)) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'old_openclaw_path_regressed',
      title: 'Old OpenClaw path reference detected',
      detail: String(hit).replace(/token|secret|apiKey/gi, '[REDACTED_KEY]'),
      blocking_in: ['dev', 'release'],
      suggestion: 'Remove newopenclaw / claw_client path regressions.',
    })
  }

  for (const changedPath of asList(git.packageTauriRuntimeSecretChanges)) {
    pushIssue(issues, {
      severity: 'P0',
      code: 'restricted_path_modified',
      title: 'Restricted package / tauri / runtime / secrets path modified',
      detail: changedPath,
      blocking_in: ['dev', 'release'],
      suggestion: 'Revert or isolate restricted path changes before continuing.',
    })
  }

  for (const testPath of asList(regression.unregisteredRegressionTests)) {
    pushIssue(issues, {
      severity: 'P1',
      code: 'regression_not_in_release_gate',
      title: 'Regression test is not included in Release Gate',
      detail: testPath,
      blocking_in: ['release'],
      suggestion: 'Add the regression test to scripts/check-release-gates.mjs.',
    })
  }

  if (stash.length > 0) {
    pushIssue(issues, {
      severity: 'P1',
      code: 'stash_requires_human_confirmation',
      title: 'Stash exists and requires human confirmation',
      detail: `${stash.length} stash item(s) present.`,
      blocking_in: ['release'],
      suggestion: 'Review stash ownership before release; do not auto-apply.',
    })
  }

  if (regression.chatJsChangedWithoutFocusedTest === true) {
    pushIssue(issues, {
      severity: 'P1',
      code: 'chat_js_change_without_focused_test',
      title: 'chat.js changed without focused test',
      detail: 'chat.js is sensitive and needs targeted regression coverage.',
      blocking_in: ['dev', 'release'],
      suggestion: 'Add or run focused chat integration tests.',
    })
  }

  if (regression.scriptsDevApiChanged === true) {
    pushIssue(issues, {
      severity: 'P1',
      code: 'scripts_dev_api_modified',
      title: 'scripts/dev-api.js changed',
      detail: 'dev-api changes are outside this gate baseline.',
      blocking_in: ['dev', 'release'],
      suggestion: 'Audit dev-api changes separately.',
    })
  }

  if (openclaw.scheduledTaskNonStandardButRunning === true || openclaw.serviceConfigNonStandard === true) {
    pushIssue(issues, {
      severity: 'P2',
      code: 'service_config_non_standard',
      title: 'OpenClaw service config is non-standard',
      detail: 'Gateway is running, but service/task config is non-standard.',
      blocking_in: [],
      suggestion: 'Document or normalize task config during a controlled runtime maintenance task.',
    })
  }

  if (openclaw.commandOwnerMissing === true) {
    pushIssue(issues, {
      severity: 'P2',
      code: 'command_owner_missing',
      title: 'OpenClaw command-owner is not configured',
      detail: 'commands.ownerAllowFrom is missing.',
      blocking_in: [],
      suggestion: 'Configure command-owner after secret handling is settled.',
    })
  }

  if (openclaw.codingProfileTrimsTools === true) {
    pushIssue(issues, {
      severity: 'P2',
      code: 'tools_profile_coding_trimmed_tools',
      title: 'tools.profile=coding trims non-development tools',
      detail: 'coding profile intentionally disables some non-development tools.',
      blocking_in: [],
      suggestion: 'Keep coding for development; evaluate full only under trusted operator control.',
    })
  }

  if (input.nodeOrViteWarnings === true) {
    pushIssue(issues, {
      severity: 'P2',
      code: 'node_vite_warnings_present',
      title: 'Node / Vite non-blocking warnings present',
      detail: 'Warnings were observed but did not fail build or tests.',
      blocking_in: [],
      suggestion: 'Track warning cleanup separately.',
    })
  }

  if (docs.releaseChecklistMissingP0P4 === true) {
    pushIssue(issues, {
      severity: 'P3',
      code: 'release_checklist_missing_p0_p4',
      title: 'Release checklist has not synced P0-P4 gate',
      detail: 'P0-P4 baseline may need documentation once stabilized.',
      blocking_in: [],
      suggestion: 'Update release checklist after gate policy stabilizes.',
    })
  }

  if (docs.runtimeManifestNeedsReview === true) {
    pushIssue(issues, {
      severity: 'P3',
      code: 'runtime_manifest_needs_review',
      title: 'Runtime manifest still has needs_review items',
      detail: 'RUNTIME_MANIFEST contains review debt.',
      blocking_in: [],
      suggestion: 'Clear needs_review entries before release readiness.',
    })
  }

  if (docs.registryDocsDrift === true) {
    pushIssue(issues, {
      severity: 'P3',
      code: 'registry_docs_drift',
      title: 'Registry/docs drift detected',
      detail: 'Registry documentation may not match implementation.',
      blocking_in: [],
      suggestion: 'Audit registry docs before final release.',
    })
  }

  if (input.experience?.openclawCapabilityIntroTooNarrow === true) {
    pushIssue(issues, {
      severity: 'P3',
      code: 'openclaw_capability_intro_too_narrow',
      title: 'OpenClaw capability introduction is too narrow',
      detail: 'Current wording does not fully explain skills / opr / exec / collaboration capabilities.',
      blocking_in: [],
      suggestion: 'Update product-facing capability wording later; do not change persona or runtime in this gate.',
    })
  }

  pushIssue(issues, {
    severity: 'P4',
    code: 'log_optimization_followup',
    title: 'Log optimization follow-up',
    detail: 'Optional cleanup for terser gate and smoke logs.',
    blocking_in: [],
    suggestion: 'Optimize logs after release blockers are cleared.',
  })

  pushIssue(issues, {
    severity: 'P4',
    code: 'performance_optimization_followup',
    title: 'Performance optimization follow-up',
    detail: 'Optional performance tuning remains out of this gate baseline.',
    blocking_in: [],
    suggestion: 'Profile after functional release gates are stable.',
  })

  pushIssue(issues, {
    severity: 'P4',
    code: 'ui_copy_cleanup_followup',
    title: 'UI copy cleanup follow-up',
    detail: 'Optional UI wording cleanup remains outside P0-P3.',
    blocking_in: [],
    suggestion: 'Handle copy polish separately.',
  })

  const summary = buildSummary(issues)
  const blocked = issues.some(item => item.severity === 'P0' && item.blocking_in.includes(mode))

  return {
    ok: !blocked,
    blocked,
    mode,
    summary,
    issues,
  }
}

function hasPath(root, segments) {
  return segments.some(segment => existsSync(path.join(root, segment)))
}

async function collectLocalP0P4Input(mode, candidatePath = '') {
  const status = run('git', ['status', '--porcelain'])
  const stashResult = run('git', ['stash', 'list', '-n', '5'])
  const releaseGate = runNode(['scripts/check-release-gates.mjs'])
  const preflight = run('cmd.exe', [
    '/d',
    '/s',
    '/c',
    'chcp 65001>nul && powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preflight-release.ps1',
  ])
  const runtimeSmoke = runNode(['scripts/smoke-runtime-agents.mjs'])
  const gatewayReachable = await testPort('127.0.0.1', 18789)

  const statusLines = status.stdout.split(/\r?\n/).filter(Boolean)
  const restrictedChanges = statusLines
    .map(line => line.slice(3).trim())
    .filter(filePath => /^(package\.json|src-tauri\/tauri\.conf\.json|src-tauri\\tauri\.conf\.json|runtime[\\/]|src-tauri[\\/]resources[\\/](runtime|data)[\\/]secrets|scripts[\\/]dev-api\.js)/i.test(filePath))

  const smokeOutput = `${runtimeSmoke.stdout}\n${runtimeSmoke.stderr}`
  const smokeJson = parseSmokeJson(runtimeSmoke.stdout)
  const smokeWarnings = asList(smokeJson?.warnings).map(warning => warning.code)
  const smokeText = smokeOutput.toLowerCase()

  const runtimeSecretsMayBePackaged = hasPath(repoRoot, [
    'runtime/data/secrets',
    'src-tauri/resources/runtime/data/secrets',
    'src-tauri/resources/data/secrets',
  ])

  const candidateScan = candidatePath ? scanReleaseCandidate(candidatePath) : {
    candidatePath: '',
    candidatePresent: false,
    candidateSecretLeaks: [],
    candidateUserStateHits: [],
  }

  return {
    mode,
    git: {
      clean: status.ok && statusLines.length === 0,
      packageTauriRuntimeSecretChanges: restrictedChanges,
    },
    stash: stashResult.stdout.split(/\r?\n/).filter(Boolean),
    gates: {
      releaseGatePassed: releaseGate.ok,
      preflightPassed: preflight.ok,
      runtimeSmokePassed: runtimeSmoke.ok,
    },
    openclaw: {
      gatewayReachable,
      tokenMismatch: smokeHasFailure(smokeJson, 'gateway_token_mismatch') || smokeText.includes('gateway_token_mismatch'),
      bootstrapTruncated: smokeHasFailedCheck(smokeJson, 'bootstrap') || smokeHasFailure(smokeJson, 'bootstrap_truncation'),
      plaintextSecretKeyPaths: smokeWarnings.includes('plaintext_secret_deferred')
        ? ['gateway.auth.token', 'models.providers.minimax.apiKey']
        : [],
      oldPathHits: detectOldOpenClawPaths(),
      serviceConfigNonStandard: smokeWarnings.includes('service_config_non_standard'),
      scheduledTaskNonStandardButRunning: smokeWarnings.includes('service_config_non_standard'),
      commandOwnerMissing: smokeWarnings.includes('command_owner_missing'),
      codingProfileTrimsTools: smokeWarnings.includes('tools_profile_coding_trimmed_tools'),
    },
    packaging: {
      runtimeDataSecretsMayBePackaged: runtimeSecretsMayBePackaged,
      exeUsbSmokeAccepted: process.env.SUPERCLAW_EXE_USB_SMOKE_ACCEPTED === '1',
      ...candidateScan,
    },
    regression: {
      unregisteredRegressionTests: [],
      chatJsChangedWithoutFocusedTest: statusLines.some(line => /src[\\/]engines[\\/]hermes[\\/]pages[\\/]chat\.js$/i.test(line)),
      scriptsDevApiChanged: statusLines.some(line => /scripts[\\/]dev-api\.js$/i.test(line)),
    },
    docs: {
      releaseChecklistMissingP0P4: true,
      runtimeManifestNeedsReview: false,
      registryDocsDrift: false,
    },
    experience: {
      openclawCapabilityIntroTooNarrow: true,
    },
    nodeOrViteWarnings: /\bwarning\b/i.test(releaseGate.stderr) || /\bwarning\b/i.test(preflight.stderr),
  }
}

function parseSmokeJson(stdout) {
  const text = String(stdout || '').trim()
  if (!text.startsWith('{')) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function smokeHasFailure(smokeJson, codePart) {
  return asList(smokeJson?.failures).some(failure => String(failure.code || failure.name || '').includes(codePart))
}

function smokeHasFailedCheck(smokeJson, namePart) {
  return asList(smokeJson?.checks).some(check => !check.passed && String(check.name || '').toLowerCase().includes(namePart))
}

function detectOldOpenClawPaths() {
  const roots = [
    '.openclaw',
    'src-tauri/resources/data/.openclaw',
    'src-tauri/resources/runtime/openclaw',
  ]
  const hits = []
  for (const root of roots) {
    if (!existsSync(path.join(repoRoot, root))) continue
    const result = run('git', ['grep', '-n', '-I', '-E', 'newopenclaw|claw_client', '--', root])
    if (result.ok && result.stdout.trim()) {
      hits.push(...result.stdout.split(/\r?\n/).filter(Boolean).map(line => redactCommandOutput(line)))
    }
  }
  return hits
}

export function formatP0P4GateReport(report) {
  const lines = []
  lines.push(`P0-P4 gate baseline (${report.mode})`)
  lines.push(`ok: ${report.ok}`)
  lines.push(`blocked: ${report.blocked}`)
  lines.push('')
  for (const priority of priorityKeys) {
    const issues = report.issues.filter(item => item.severity === priority)
    lines.push(`${priority}: ${issues.length}`)
    for (const item of issues) {
      lines.push(`- [${item.code}] ${item.title}`)
      lines.push(`  detail: ${item.detail}`)
      lines.push(`  blocking_in: ${item.blocking_in.length ? item.blocking_in.join(', ') : 'none'}`)
      lines.push(`  suggestion: ${item.suggestion}`)
    }
    lines.push('')
  }
  return redactCommandOutput(lines.join('\n'))
}

async function main() {
  const mode = normalizeP0P4Mode()
  const candidatePath = normalizeP0P4CandidatePath()
  const input = await collectLocalP0P4Input(mode, candidatePath)
  const report = buildP0P4GateReport(input)
  console.log(formatP0P4GateReport(report))
  process.exitCode = report.blocked ? 1 : 0
}

if (path.resolve(__filename) === path.resolve(process.argv[1] || '')) {
  main().catch(error => {
    console.error(redactCommandOutput(error?.message || String(error)))
    process.exitCode = 1
  })
}
