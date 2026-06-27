import assert from 'assert/strict'
import fs from 'fs'
import path from 'path'
import {
  activateAuthSession,
  getAuthStatus,
  loginAuthSession,
  logoutAuthSession,
  resetAuthSession,
} from './lib/auth-session.mjs'
import { getAuthGuardDecision } from './lib/auth-guard.mjs'

function assertPublicPayload(payload, ...privateValues) {
  const json = JSON.stringify(payload)
  for (const value of privateValues) {
    assert.equal(json.includes(value), false, 'auth payload leaked private input')
  }
}

function runDevBypassCheck() {
  const env = {
    SUPERCLAW_MODE: 'dev',
    MODEL_SOURCE: 'direct',
    AUTH_REQUIRED: 'false',
  }
  resetAuthSession(env)
  const status = getAuthStatus(env)
  const guard = getAuthGuardDecision(status)
  assert.equal(status.authRequired, false)
  assert.equal(status.loggedIn, false)
  assert.equal(status.allowAppAccess, true)
  assert.equal(guard.allowAppAccess, true)
  console.log('AUTH_KIT_PHASE2_DEV_BYPASS_PASS')
}

function runReleaseGuardCheck() {
  const env = {
    SUPERCLAW_MODE: 'release',
    MODEL_SOURCE: 'yyapi',
    AUTH_REQUIRED: 'true',
    YYAPI_ENABLED: 'true',
  }
  resetAuthSession(env)
  let status = getAuthStatus(env)
  let guard = getAuthGuardDecision(status)
  assert.equal(status.authRequired, true)
  assert.equal(status.allowAppAccess, false)
  assert.equal(guard.targetRoute, '/login')

  const passwordInput = 'phase2-private-password'
  status = loginAuthSession({ username: 'phase2-user', password: passwordInput }, env)
  guard = getAuthGuardDecision(status)
  assert.equal(status.loggedIn, true)
  assert.equal(status.activated, false)
  assert.equal(status.allowAppAccess, false)
  assert.equal(guard.targetRoute, '/activate')
  assertPublicPayload(status, passwordInput)

  const activationInput = 'phase2-activation-code'
  status = activateAuthSession({ activationCode: activationInput }, env)
  guard = getAuthGuardDecision(status)
  assert.equal(status.loggedIn, true)
  assert.equal(status.activated, true)
  assert.equal(status.allowAppAccess, true)
  assert.equal(guard.targetRoute, null)
  assertPublicPayload(status, passwordInput, activationInput)

  status = logoutAuthSession(env)
  guard = getAuthGuardDecision(status)
  assert.equal(status.loggedIn, false)
  assert.equal(status.allowAppAccess, false)
  assert.equal(guard.targetRoute, '/login')
  console.log('AUTH_KIT_PHASE2_RELEASE_GUARD_PASS')
}

function assertTextContains(file, terms) {
  const fullPath = path.join(process.cwd(), file)
  const text = fs.readFileSync(fullPath, 'utf8')
  for (const term of terms) {
    assert.equal(text.includes(term), true, `${file} missing ${term}`)
  }
}

function runStaticIntegrationCheck() {
  for (const file of [
    'src/lib/auth-session.js',
    'src/pages/login.js',
    'src/pages/register.js',
    'src/pages/activate.js',
    'scripts/lib/auth-session.mjs',
    'scripts/lib/auth-guard.mjs',
  ]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), file)), true, `${file} must exist`)
  }
  assertTextContains('scripts/dev-api.js', [
    '/api/auth/status',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/activate',
  ])
  assertTextContains('src/main.js', [
    "registerRoute('/login'",
    "registerRoute('/register'",
    "registerRoute('/activate'",
    'fetchAuthStatus',
    'checkRemoteAuth',
  ])
  console.log('AUTH_KIT_PHASE2_STATIC_INTEGRATION_PASS')
}

function runNoForbiddenMarkerCheck() {
  const files = [
    'src/lib/auth-session.js',
    'src/pages/login.js',
    'src/pages/register.js',
    'src/pages/activate.js',
    'scripts/lib/auth-session.mjs',
    'scripts/lib/auth-guard.mjs',
    'scripts/smoke-auth-yyapi-kit-phase2.mjs',
  ]
  const legacyEndpointPattern = /124\.222\.21\.44/
  const viteKeyMarker = ['VITE', 'MINIMAX', 'API', 'KEY'].join('_')
  for (const file of files) {
    const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    assert.equal(legacyEndpointPattern.test(text), false, `${file} contains a legacy endpoint`)
    assert.equal(text.includes(viteKeyMarker), false, `${file} contains a forbidden frontend key marker`)
  }
  console.log('AUTH_KIT_PHASE2_NO_FORBIDDEN_MARKERS_PASS')
}

runDevBypassCheck()
runReleaseGuardCheck()
runStaticIntegrationCheck()
runNoForbiddenMarkerCheck()
