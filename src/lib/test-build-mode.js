const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])

function clean(value) {
  return String(value || '').trim()
}

function viteEnv(name) {
  try {
    return clean(import.meta.env?.[name] || '')
  } catch {
    return ''
  }
}

function storageValue(key) {
  try {
    return clean(localStorage.getItem(key) || '')
  } catch {
    return ''
  }
}

function flag(name, storageKey, fallback = false) {
  const envValue = viteEnv(name)
  if (envValue) return TRUE_VALUES.has(envValue.toLowerCase())
  const localValue = storageValue(storageKey)
  if (localValue) return TRUE_VALUES.has(localValue.toLowerCase())
  return fallback
}

function value(name, storageKey, fallback = '') {
  return viteEnv(name) || storageValue(storageKey) || fallback
}

export function isTestBuildMode() {
  return flag('VITE_SUPERCLAW_TEST_BUILD', 'superclaw_test_build')
}

export function isAuthBypassEnabled() {
  return flag('VITE_SUPERCLAW_SKIP_AUTH', 'superclaw_skip_auth', isTestBuildMode())
}

export function isActivationBypassEnabled() {
  return flag('VITE_SUPERCLAW_SKIP_ACTIVATION', 'superclaw_skip_activation', isTestBuildMode())
}

export function isYyapiDisabled() {
  return flag('VITE_SUPERCLAW_DISABLE_YYAPI', 'superclaw_disable_yyapi', isTestBuildMode())
}

export function getForcedProvider() {
  return value(
    'VITE_SUPERCLAW_FORCE_PROVIDER',
    'superclaw_force_provider',
    isTestBuildMode() ? 'minimax' : '',
  ).toLowerCase()
}

export function isMiniMaxOnlyMode() {
  return getForcedProvider() === 'minimax'
}

export function getMiniMaxDefaultConfig() {
  return {
    provider: 'minimax',
    model: value('VITE_SUPERCLAW_MINIMAX_MODEL', 'superclaw_minimax_model', 'MiniMax-M3'),
    baseUrl: value('VITE_SUPERCLAW_MINIMAX_BASE_URL', 'superclaw_minimax_base_url', 'https://api.minimax.io/v1'),
    cnBaseUrl: 'https://api.minimaxi.com/v1',
  }
}

export function getTestUser() {
  return {
    id: 'test-user',
    username: 'test-user',
    name: '测试版用户',
    plan: 'test',
    authBypassed: true,
  }
}
