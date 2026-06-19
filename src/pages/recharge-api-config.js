export function normalizeApiBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function normalizeUserApiOrigin(value) {
  return normalizeApiBaseUrl(value).replace(/\/api(?:\/v\d+)?$/i, '')
}

export function getUserApiBaseUrl() {
  const envValue =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_USER_API_BASE_URL
      : ''
  const envUserApiValue =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.USER_API_BASE_URL
      : ''

  const appConfig =
    typeof window !== 'undefined' && window.__APP_CONFIG__
      ? window.__APP_CONFIG__
      : {}

  const candidates = [
    envValue,
    envUserApiValue,
    appConfig.USER_API_BASE_URL,
    appConfig.VITE_USER_API_BASE_URL,
    safeLocalStorageGet('VITE_USER_API_BASE_URL'),
    safeLocalStorageGet('USER_API_BASE_URL'),
    safeLocalStorageGet('userApiBaseUrl'),
    safeLocalStorageGet('panel.userApiBaseUrl'),
    safeLocalStorageGet('hermes.userApiBaseUrl'),
    safeLocalStorageGet('openclaw.userApiBaseUrl'),
    safeLocalStorageGet('superclaw_api_base_url'),
  ]

  for (const candidate of candidates) {
    const normalized = normalizeUserApiOrigin(candidate)
    if (normalized) return normalized
  }

  return ''
}

export function setUserApiBaseUrl(value) {
  const normalized = normalizeUserApiOrigin(value)
  if (!normalized) return ''

  try {
    localStorage.setItem('userApiBaseUrl', normalized)
    localStorage.setItem('USER_API_BASE_URL', normalized)
    localStorage.setItem('superclaw_api_base_url', normalized)
  } catch (_) {}

  return normalized
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch (_) {
    return ''
  }
}
