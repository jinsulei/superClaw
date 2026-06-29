const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])
const DEFAULT_MINIMAX_PROVIDER_PROFILE = 'minimax-cn'

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
    provider: value('VITE_SUPERCLAW_MINIMAX_PROVIDER', 'superclaw_minimax_provider', DEFAULT_MINIMAX_PROVIDER_PROFILE),
    model: value('VITE_SUPERCLAW_MINIMAX_MODEL', 'superclaw_minimax_model', 'MiniMax-M3'),
    baseUrl: value('VITE_SUPERCLAW_MINIMAX_BASE_URL', 'superclaw_minimax_base_url', 'https://api.minimaxi.com/v1'),
    cnBaseUrl: 'https://api.minimaxi.com/v1',
  }
}
