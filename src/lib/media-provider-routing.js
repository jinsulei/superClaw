const ROUTE_KINDS = new Set(['text_to_image', 'image_to_image', 'text_to_video', 'image_to_video'])
const ROUTE_PROTOCOLS = new Set(['openai-images', 'openai-video', 'custom'])
const FORBIDDEN_FIELDS = new Set(['apiKey', 'api_key', 'token', 'authorization', 'baseUrl', 'base_url'])

function clean(value) {
  return String(value || '').trim()
}

function copy(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

export function emptyMediaRouteConfig() {
  return { version: 1, routes: {} }
}

export function normalizeMediaRouteConfig(input = {}) {
  const routes = input?.routes && typeof input.routes === 'object' && !Array.isArray(input.routes)
    ? input.routes
    : {}
  const normalized = {}
  for (const [kind, raw] of Object.entries(routes)) {
    if (!ROUTE_KINDS.has(kind)) throw new Error(`Unsupported media route kind: ${kind}`)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Media route '${kind}' must be an object`)
    if (Object.keys(raw).some(key => FORBIDDEN_FIELDS.has(key))) {
      throw new Error(`Media route '${kind}' must reference an existing provider and must not contain credentials or Base URL`)
    }
    const providerId = clean(raw.providerId)
    const model = clean(raw.model)
    const protocol = clean(raw.protocol)
    if (!providerId || !model || !protocol) throw new Error(`Media route '${kind}' is incomplete`)
    if (!ROUTE_PROTOCOLS.has(protocol)) throw new Error(`Unsupported media route protocol: ${protocol}`)
    normalized[kind] = { providerId, model, protocol, enabled: raw.enabled !== false }
  }
  return { version: 1, routes: normalized }
}

export function buildMediaRoutePatch(currentConfig, kind, route) {
  if (!ROUTE_KINDS.has(kind)) throw new Error(`Unsupported media route kind: ${kind}`)
  const next = normalizeMediaRouteConfig(copy(currentConfig))
  next.routes[kind] = normalizeMediaRouteConfig({ routes: { [kind]: route } }).routes[kind]
  return next
}

/**
 * Resolve a media route against the existing OpenClaw provider registry.
 * Credentials deliberately stay in the native provider config and never cross
 * this frontend boundary; changing a media route never changes chat routing.
 */
export function resolveMediaRoute(mediaConfig, openclawConfig, kind) {
  const config = normalizeMediaRouteConfig(mediaConfig)
  const route = config.routes[kind]
  if (!route || route.enabled === false) return { ready: false, reason: 'route-not-configured', route: null }
  const provider = openclawConfig?.models?.providers?.[route.providerId]
  if (!provider) return { ready: false, reason: 'provider-not-found', route }
  const baseUrl = clean(provider.baseUrl || provider.base_url)
  const hasApiKey = Boolean(clean(provider.apiKey || provider.api_key || provider.key))
  const models = Array.isArray(provider.models) ? provider.models : []
  const modelKnown = models.length === 0 || models.some(item => clean(typeof item === 'string' ? item : item?.id || item?.model) === route.model)
  if (!baseUrl) return { ready: false, reason: 'provider-base-url-missing', route }
  if (!hasApiKey) return { ready: false, reason: 'provider-key-missing', route }
  if (!modelKnown) return { ready: false, reason: 'provider-model-not-found', route }
  return {
    ready: true,
    route,
    provider: { id: route.providerId, baseUrl, api: clean(provider.api) || 'openai-completions' },
  }
}

export async function saveMediaRoute(kind, route, client) {
  const current = await client.mediaConfigRead()
  const config = buildMediaRoutePatch(current, kind, route)
  // This is portable app data, not openclaw.json. No Gateway reload is allowed.
  return client.mediaConfigWrite(config)
}
