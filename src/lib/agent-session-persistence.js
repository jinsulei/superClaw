export function selectStableActiveSession({ sessions = [], savedActiveId = '', currentActiveId = '' } = {}) {
  const list = Array.isArray(sessions) ? sessions.filter(item => item && item.id) : []
  if (!list.length) return null

  const byId = new Map(list.map(item => [String(item.id), item]))
  const current = currentActiveId ? byId.get(String(currentActiveId)) : null
  if (current) return current

  const saved = savedActiveId ? byId.get(String(savedActiveId)) : null
  if (saved) return saved

  return list.slice().sort((a, b) => {
    const bt = Number(b.lastActiveAt || b.updatedAt || b.createdAt || 0)
    const at = Number(a.lastActiveAt || a.updatedAt || a.createdAt || 0)
    return bt - at
  })[0] || null
}

export function isValidOpenClawSessionKey(value) {
  return /^agent:[^:]+:[^:]+$/.test(String(value || ''))
}

export function resolveStableOpenClawSessionKey({
  currentSessionKey = '',
  savedSessionKey = '',
  gatewaySessionKey = '',
  knownSessionKeys = [],
} = {}) {
  const fallback = gatewaySessionKey || knownSessionKeys.find(Boolean) || 'agent:main:main'
  const known = new Set([fallback, ...knownSessionKeys].filter(Boolean).map(String))
  if (currentSessionKey && (known.has(currentSessionKey) || isValidOpenClawSessionKey(currentSessionKey))) {
    return currentSessionKey
  }
  if (savedSessionKey && (known.has(savedSessionKey) || sameAgent(savedSessionKey, fallback))) {
    return savedSessionKey
  }
  return fallback
}

export function shouldCreateInitialSession(sessions = []) {
  return !Array.isArray(sessions) || sessions.filter(item => item && item.id).length === 0
}

function sameAgent(a, b) {
  if (!isValidOpenClawSessionKey(a) || !isValidOpenClawSessionKey(b)) return false
  return String(a).split(':')[1] === String(b).split(':')[1]
}
