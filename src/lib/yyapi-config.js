export const YYAPI_PROVIDER_KEY = 'yyapi'

const USER_API_OVERRIDE_KEY = 'superclaw_api_base_url'

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

function stripApiVersion(url) {
  return cleanUrl(url).replace(/\/v\d+(?:\/)?$/i, '')
}

export function getUserApiOrigin() {
  return safeLocalStorageGet(USER_API_OVERRIDE_KEY) || viteEnv('VITE_USER_API_BASE_URL')
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
  return viteEnv('VITE_YYAPI_BASE_URL')
}

export function getYyapiAuthBaseUrl() {
  return viteEnv('VITE_YYAPI_AUTH_BASE_URL') || stripApiVersion(getYyapiBaseUrl())
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
