import { getAuthStatus } from './auth-session.mjs'

export function getAuthGuardDecision(status = getAuthStatus()) {
  if (!status.authRequired || status.allowAppAccess) {
    return {
      allowAppAccess: true,
      targetRoute: null,
      reason: status.reason || 'authenticated',
    }
  }
  if (!status.activated) {
    return {
      allowAppAccess: false,
      targetRoute: '/activate',
      reason: status.reason || 'activation_required',
    }
  }
  return {
    allowAppAccess: false,
    targetRoute: '/login',
    reason: status.reason || 'login_required',
  }
}

export function getGuardedAuthStatus(env = process.env) {
  const status = getAuthStatus(env)
  return {
    status,
    guard: getAuthGuardDecision(status),
  }
}
