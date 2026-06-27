import assert from 'assert/strict'
import fs from 'fs'
import path from 'path'
import {
  activateAuthSession,
  getAuthStatus,
  loginAuthSession,
  resetAuthSession,
} from './lib/auth-session.mjs'
import { getAuthGuardDecision } from './lib/auth-guard.mjs'

const releaseEnv = {
  SUPERCLAW_MODE: 'release',
  MODEL_SOURCE: 'yyapi',
  AUTH_REQUIRED: 'true',
  YYAPI_ENABLED: 'true',
}

const devEnv = {
  SUPERCLAW_MODE: 'dev',
  MODEL_SOURCE: 'direct',
  AUTH_REQUIRED: 'false',
}

function defaultRouteFromGuard(status) {
  const guard = getAuthGuardDecision(status)
  return guard.allowAppAccess ? '/dashboard' : guard.targetRoute
}

function runReleaseActivationFirst() {
  resetAuthSession(releaseEnv)
  const status = getAuthStatus(releaseEnv)
  assert.equal(status.authRequired, true)
  assert.equal(status.activated, false)
  assert.equal(status.loggedIn, false)
  assert.equal(status.allowAppAccess, false)
  assert.equal(status.nextStep, 'activate')
  assert.equal(defaultRouteFromGuard(status), '/activate')
  console.log('AUTH_FLOW_ACTIVATION_FIRST: PASS')
}

function runLoginAfterActivation() {
  resetAuthSession(releaseEnv)
  const status = activateAuthSession({ activationCode: 'release-activation-code' }, releaseEnv)
  assert.equal(status.activated, true)
  assert.equal(status.loggedIn, false)
  assert.equal(status.allowAppAccess, false)
  assert.equal(status.nextStep, 'login')
  assert.equal(defaultRouteFromGuard(status), '/login')
  console.log('AUTH_FLOW_LOGIN_AFTER_ACTIVATION: PASS')
}

function runAppAfterLogin() {
  resetAuthSession(releaseEnv)
  activateAuthSession({ activationCode: 'release-activation-code' }, releaseEnv)
  const status = loginAuthSession({ username: 'release-user', password: 'release-password' }, releaseEnv)
  assert.equal(status.activated, true)
  assert.equal(status.loggedIn, true)
  assert.equal(status.allowAppAccess, true)
  assert.equal(status.nextStep, 'app')
  assert.equal(defaultRouteFromGuard(status), '/dashboard')
  console.log('AUTH_FLOW_APP_AFTER_LOGIN: PASS')
}

function runDevBypass() {
  resetAuthSession(devEnv)
  const status = getAuthStatus(devEnv)
  assert.equal(status.authRequired, false)
  assert.equal(status.allowAppAccess, true)
  assert.equal(status.nextStep, 'app')
  assert.equal(defaultRouteFromGuard(status), '/dashboard')
  console.log('AUTH_FLOW_DEV_BYPASS: PASS')
}

function assertTextContains(file, terms) {
  const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  for (const term of terms) {
    assert.equal(text.includes(term), true, `${file} missing ${term}`)
  }
}

function runSpacingAndStaticChecks() {
  assertTextContains('src/lib/auth-session.js', [
    "nextStep = 'activate'",
    "targetRoute: '/activate'",
    "targetRoute: '/login'",
  ])
  assertTextContains('src/pages/activate.js', [
    "navigate('/login')",
    '激活并继续登录',
    '#/register',
  ])
  assertTextContains('src/style/pages.css', [
    '.auth-card',
    'display: flex',
    'flex-direction: column',
    'min-height: 42px',
    '.auth-btn + .auth-btn',
    '.auth-footer-separator',
  ])
  console.log('AUTH_PAGES_SPACING: PASS')
}

runReleaseActivationFirst()
runLoginAfterActivation()
runAppAfterLogin()
runDevBypass()
runSpacingAndStaticChecks()
