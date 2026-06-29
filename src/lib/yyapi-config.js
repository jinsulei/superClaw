export const YYAPI_PROVIDER_KEY = 'yyapi'

const USER_API_OVERRIDE_KEY = 'superclaw_api_base_url'
const DEFAULT_USER_API_ORIGIN = 'http://124.222.21.44:3001'
const DEFAULT_YYAPI_BASE_URL = 'http://124.222.21.44:3002/v1'
const DEFAULT_YYAPI_AUTH_BASE_URL = 'http://124.222.21.44:3002'

function cleanUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function viteEnv(name) {
  return cleanUrl(import.meta.env?.[name] || '')
}

function safeLocalStorageGet(key) {
  try {
    return cleanUrl(localStorage.getItem(key) || '')
  } catch {
    return ''
  }
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(cleanUrl(value))
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  } catch {
    return false
  }
}

function localUserApiAllowed() {
  if (viteEnv('VITE_SUPERCLAW_ALLOW_LOCAL_USER_API') === '1') return true
  try {
    return localStorage.getItem('superclaw_allow_local_user_api') === '1'
  } catch {
    return false
  }
}

function stripApiVersion(url) {
  return cleanUrl(url).replace(/\/v\d+(?:\/)?$/i, '')
}

export function getUserApiOrigin() {
  const configured = safeLocalStorageGet(USER_API_OVERRIDE_KEY) || viteEnv('VITE_USER_API_BASE_URL')
  if (configured && (!isLoopbackUrl(configured) || localUserApiAllowed())) return configured
  return DEFAULT_USER_API_ORIGIN
}

export function getUserApiBaseUrl() {
  const origin = getUserApiOrigin()
  return origin ? `${origin}/api` : ''
}

export function getUserApiBaseUrlV2() {
  const origin = getUserApiOrigin()
  return origin ? `${origin}/api/v2` : ''
}

export function getYyapiBaseUrl() {
  return viteEnv('VITE_YYAPI_BASE_URL') || DEFAULT_YYAPI_BASE_URL
}

export function getYyapiAuthBaseUrl() {
  return viteEnv('VITE_YYAPI_AUTH_BASE_URL') || stripApiVersion(getYyapiBaseUrl()) || DEFAULT_YYAPI_AUTH_BASE_URL
}

export function getYyapiLoginUrl() {
  const origin = getYyapiAuthBaseUrl()
  return origin ? `${origin}/api/user/login` : ''
}

export function getYyapiConsoleUrl() {
  const origin = getYyapiAuthBaseUrl()
  return origin ? `${origin}/console` : ''
}

export function isYyapiBaseUrl(url) {
  const configured = getYyapiBaseUrl()
  return !!configured && cleanUrl(url) === cleanUrl(configured)
}
