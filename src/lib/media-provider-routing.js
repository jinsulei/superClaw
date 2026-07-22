export const MEDIA_ROUTE_KINDS = new Set([
  'text_to_image',
  'image_to_image',
  'text_to_video',
  'image_to_video',
  'text_to_speech',
  'text_to_music',
  'image_understanding',
])

export const MEDIA_ROUTE_PROTOCOLS = new Set([
  'openai-images',
  'openai-video',
  'minimax-cli',
  'custom',
])

export const MEDIA_CAPABILITIES = {
  'openai-images': new Set(['text_to_image', 'image_to_image']),
  'openai-video': new Set(['text_to_video', 'image_to_video']),
  // Keep this list aligned with the officially bundled mmx-cli. MiniMax does
  // not currently expose a generic image-to-image command through that CLI.
  'minimax-cli': new Set([
    'text_to_image',
    'text_to_video',
    'image_to_video',
    'text_to_speech',
    'text_to_music',
    'image_understanding',
  ]),
  custom: new Set(MEDIA_ROUTE_KINDS),
}
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
    if (!MEDIA_ROUTE_KINDS.has(kind)) throw new Error(`Unsupported media route kind: ${kind}`)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Media route '${kind}' must be an object`)
    if (Object.keys(raw).some(key => FORBIDDEN_FIELDS.has(key))) {
      throw new Error(`Media route '${kind}' must reference an existing provider and must not contain credentials or Base URL`)
    }
    const providerId = clean(raw.providerId)
    const model = clean(raw.model)
    const protocol = clean(raw.protocol)
    if (!providerId || !model || !protocol) throw new Error(`Media route '${kind}' is incomplete`)
    if (!MEDIA_ROUTE_PROTOCOLS.has(protocol)) throw new Error(`Unsupported media route protocol: ${protocol}`)
    if (!MEDIA_CAPABILITIES[protocol]?.has(kind)) {
      throw new Error(`Media protocol '${protocol}' does not support '${kind}'`)
    }
    normalized[kind] = { providerId, model, protocol, enabled: raw.enabled !== false }
  }
  return { version: 1, routes: normalized }
}

export function buildMediaRoutePatch(currentConfig, kind, route) {
  if (!MEDIA_ROUTE_KINDS.has(kind)) throw new Error(`Unsupported media route kind: ${kind}`)
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

export function protocolForMediaProvider(providerId, provider, kind) {
  const isMiniMax = isMiniMaxProvider(providerId, provider)
  if (isMiniMax && MEDIA_CAPABILITIES['minimax-cli'].has(kind)) return 'minimax-cli'
  if (kind === 'text_to_image' || kind === 'image_to_image') return 'openai-images'
  if (kind === 'text_to_video' || kind === 'image_to_video') return 'openai-video'
  return 'custom'
}

function isMiniMaxProvider(providerId, provider) {
  const id = clean(providerId).toLowerCase()
  const baseUrl = clean(provider?.baseUrl || provider?.base_url).toLowerCase()
  return id.includes('minimax') || baseUrl.includes('api.minimax.io') || baseUrl.includes('api.minimaxi.com')
}

/**
 * Build the complete capability map from one media provider selection. The
 * underlying config remains per-capability so adapters can route safely, but
 * the UI never asks customers to choose the same provider/model repeatedly.
 */
export function buildMediaRoutesForProvider(providerId, provider, model) {
  const id = clean(providerId)
  const selectedModel = clean(model)
  if (!id || !selectedModel) return {}

  const routes = {}
  for (const kind of MEDIA_ROUTE_KINDS) {
    // Do not silently map an unsupported MiniMax capability to an unrelated
    // OpenAI adapter. MiniMax CLI has no generic image-to-image command.
    if (isMiniMaxProvider(id, provider) && !MEDIA_CAPABILITIES['minimax-cli'].has(kind)) continue
    const protocol = protocolForMediaProvider(id, provider, kind)
    if (!MEDIA_CAPABILITIES[protocol]?.has(kind)) continue
    routes[kind] = { providerId: id, model: selectedModel, protocol, enabled: true }
  }
  return routes
}

export async function saveMediaRoute(kind, route, client) {
  const current = await client.mediaConfigRead()
  const config = buildMediaRoutePatch(current, kind, route)
  // This is portable app data, not openclaw.json. No Gateway reload is allowed.
  return client.mediaConfigWrite(config)
}
