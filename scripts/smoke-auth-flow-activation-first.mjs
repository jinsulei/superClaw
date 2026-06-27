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

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8')
}

function assertTextContains(file, terms) {
  const text = read(file)
  for (const term of terms) {
    assert.equal(text.includes(term), true, `${file} missing ${term}`)
  }
}

function runRealYyapiStaticChecks() {
  for (const file of [
    'src/lib/user-api.js',
    'src/lib/yyapi-config.js',
    'src/lib/license-binding.js',
    'src/pages/claim.js',
    'src/pages/profile.js',
  ]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), file)), true, `${file} must exist`)
  }

  assertTextContains('src/pages/activate.js', [
    'activateCode',
    'prepareActivationBinding',
    "sessionStorage.setItem('superclaw_activation_code'",
    "navigateToAuth('register')",
  ])

  assertTextContains('src/pages/login.js', [
    'login({ username, password })',
    'setToken(result.token)',
    'setStoredUser(result.user)',
    'superclaw_yyapi_username',
    '__superclaw_sync_default_model_settings',
    "navigateTo('dashboard')",
    "new CustomEvent('superclaw:login')",
  ])

  assertTextContains('src/pages/register.js', [
    'registerV2',
    'superclaw_activation_code',
    'new_api_key',
    "localStorage.setItem('superclaw_yyapi_key'",
    "navigateToAuth('claim')",
  ])

  assertTextContains('src/main.js', [
    "registerRoute('/activate'",
    "registerRoute('/login'",
    "registerRoute('/register'",
    "registerRoute('/claim'",
    'getDefaultYyapiProfile',
    "configureHermes('custom'",
    'configureClaudeCodeRelay',
  ])

  assertTextContains('src/pages/models.js', [
    'yyapi-token-panel',
    'getTokenList',
    'getFullTokenKey',
    'autoInitYYApi',
  ])

  console.log('AUTH_REAL_YYAPI_FLOW_STATIC: PASS')
}

runReleaseActivationFirst()
runLoginAfterActivation()
runAppAfterLogin()
runDevBypass()
runRealYyapiStaticChecks()
