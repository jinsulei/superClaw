import crypto from 'crypto'
import { cleanRuntimeValue, getRuntimeMode } from './runtime-mode.mjs'

const state = {
  secret: '',
  user: null,
  activated: false,
  createdAt: 0,
}

function nowIso() {
  return new Date().toISOString()
}

function cleanText(value, fallback = '') {
  const text = cleanRuntimeValue(value)
  return text || fallback
}

function publicUser(input = {}) {
  const name = cleanText(input.name || input.username || input.phone || input.email, 'SuperClaw User')
  const idSource = cleanText(input.id || input.userId || input.username || name, 'local-user')
  return {
    id: crypto.createHash('sha256').update(idSource).digest('hex').slice(0, 12),
    name,
    username: cleanText(input.username || name, name),
    phone: cleanText(input.phone),
    email: cleanText(input.email),
  }
}

function publicStatus(runtime = getRuntimeMode(process.env), override = {}) {
  const sessionValid = Boolean(state.secret && state.user)
  const loggedIn = Boolean(override.loggedIn ?? sessionValid)
  const activated = Boolean(override.activated ?? state.activated)
  const authRequired = Boolean(runtime.authRequired)
  const allowAppAccess = !authRequired || (activated && loggedIn)
  let nextStep = 'app'
  let reason = 'auth_not_required'
  if (authRequired && !activated) {
    nextStep = 'activate'
    reason = 'activation_required'
  } else if (authRequired && !loggedIn) {
    nextStep = 'login'
    reason = 'login_required'
  } else if (authRequired) {
    reason = 'authenticated'
  }
  return {
    authRequired,
    loggedIn,
    activated,
    allowAppAccess,
    nextStep,
    sessionValid,
    sessionConfigured: sessionValid,
    user: loggedIn ? publicUser(state.user || {}) : null,
    mode: runtime.superclawMode,
    modelSource: runtime.modelSource,
    yyapiEnabled: runtime.yyapiEnabled,
    reason,
    checkedAt: nowIso(),
  }
}

export function getAuthStatus(env = process.env) {
  return publicStatus(getRuntimeMode(env))
}

export function loginAuthSession(input = {}, env = process.env) {
  const username = cleanText(input.username || input.account || input.phone || input.email)
  const password = cleanText(input.password || input.passcode || input.secret)
  if (!username || !password) {
    const error = new Error('请输入账号和密码。')
    error.code = 'AUTH_LOGIN_INVALID'
    throw error
  }
  state.secret = crypto.randomBytes(24).toString('hex')
  state.user = publicUser({
    username,
    name: cleanText(input.name || username, username),
    phone: cleanText(input.phone),
    email: cleanText(input.email),
  })
  state.activated = Boolean(state.activated || !getRuntimeMode(env).authRequired)
  state.createdAt = Date.now()
  return getAuthStatus(env)
}

export function activateAuthSession(input = {}, env = process.env) {
  const code = cleanText(input.activationCode || input.code || input.license || input.key)
  if (code.length < 4) {
    const error = new Error('请输入有效激活码。')
    error.code = 'AUTH_ACTIVATION_INVALID'
    throw error
  }
  state.activated = true
  return getAuthStatus(env)
}

export function logoutAuthSession(env = process.env) {
  state.secret = ''
  state.user = null
  state.createdAt = 0
  return getAuthStatus(env)
}

export function resetAuthSession(env = process.env) {
  state.activated = false
  return logoutAuthSession(env)
}
