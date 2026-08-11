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
export const YYAPI_PROVIDER_ID = 'yyapi'
export const YYAPI_IMAGE_MODEL_ID = 'gpt-image-2'
// 即梦 (Jidu/Dreamina) 主流模型关键词。Seedream 是生图模型，Seedance 是生视频模型。
// 按子串做大小写不敏感匹配。
export const SEEDREAM_KEYWORDS = ['seedream', 'doubao-seedream']
export const SEEDANCE_KEYWORDS = ['seedance', 'doubao-seedance', 'seedans']

function clean(value) {
  return String(value || '').trim()
}

function copy(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function providerModelId(entry) {
  return clean(typeof entry === 'string' ? entry : entry?.id || entry?.model)
}

function providerModelIds(provider) {
  return (Array.isArray(provider?.models) ? provider.models : [])
    .map(providerModelId)
    .filter(Boolean)
}

// Only fill an otherwise-unconfigured text-to-image route. A user's explicit
// media route always wins, and no chat or credential setting is modified.
export function autoYyapiTextImageRoute(openclawConfig) {
  const provider = openclawConfig?.models?.providers?.[YYAPI_PROVIDER_ID]
  if (!provider) return null
  const model = (Array.isArray(provider.models) ? provider.models : [])
    .map(providerModelId)
    .find(id => id.toLowerCase() === YYAPI_IMAGE_MODEL_ID)
  if (!model) return null
  if (!clean(provider.baseUrl || provider.base_url) || !clean(provider.apiKey || provider.api_key || provider.key)) return null
  return { providerId: YYAPI_PROVIDER_ID, model, protocol: 'openai-images', enabled: true, implicit: true }
}

function providerHasCredentials(provider) {
  return Boolean(
    clean(provider?.baseUrl || provider?.base_url) &&
    clean(provider?.apiKey || provider?.api_key || provider?.key),
  )
}

/**
 * Generalize media provider auto-detection across every configured provider.
 * A user's explicit media route always wins (handled by callers); this fills
 * capabilities from model-list keywords so yyapi/gpt-image-2, MiniMax and
 * 即梦 (Seedream/Seedance) can coexist:
 *
 * - gpt-image-2        -> text_to_image          (openai-images)
 * - Seedream           -> text_to_image, image_to_image (openai-images)
 * - Seedance           -> text_to_video, image_to_video (openai-video)
 * - MiniMax provider   -> minimax-cli capabilities
 *
 * Image priority: gpt-image-2 > MiniMax > Seedream.
 * Video priority: MiniMax > Seedance.
 * Non-image, non-MiniMax capabilities are never synthesized for a relay.
 */
export function autoDetectMediaRoutes(openclawConfig) {
  const providers = openclawConfig?.models?.providers || {}
  const routes = {}
  const mark = (kind, route) => {
    if (!routes[kind]) routes[kind] = { ...route, implicit: true }
  }

  const gptImageProviders = []
  const minimaxProviders = []
  const seedreamProviders = []
  const seedanceProviders = []

  for (const [providerId, provider] of Object.entries(providers)) {
    if (!provider || typeof provider !== 'object' || !providerHasCredentials(provider)) continue
    const modelIds = providerModelIds(provider)
    const lowerIds = modelIds.map(id => id.toLowerCase())
    if (isMiniMaxProvider(providerId, provider)) {
      minimaxProviders.push({ providerId, model: modelIds[0] || 'MiniMax' })
    }
    if (lowerIds.some(id => id === YYAPI_IMAGE_MODEL_ID)) {
      const model = modelIds.find(id => id.toLowerCase() === YYAPI_IMAGE_MODEL_ID)
      gptImageProviders.push({ providerId, model })
    }
    if (lowerIds.some(id => SEEDREAM_KEYWORDS.some(keyword => id.includes(keyword)))) {
      const model = modelIds.find(id => SEEDREAM_KEYWORDS.some(keyword => id.toLowerCase().includes(keyword)))
      seedreamProviders.push({ providerId, model })
    }
    if (lowerIds.some(id => SEEDANCE_KEYWORDS.some(keyword => id.includes(keyword)))) {
      const model = modelIds.find(id => SEEDANCE_KEYWORDS.some(keyword => id.toLowerCase().includes(keyword)))
      seedanceProviders.push({ providerId, model })
    }
  }

  // text_to_image priority: gpt-image-2 > MiniMax > Seedream
  if (gptImageProviders.length) {
    const r = gptImageProviders[0]
    mark('text_to_image', { providerId: r.providerId, model: r.model, protocol: 'openai-images', enabled: true })
  } else if (minimaxProviders.length) {
    const r = minimaxProviders[0]
    mark('text_to_image', { providerId: r.providerId, model: r.model, protocol: 'minimax-cli', enabled: true })
  } else if (seedreamProviders.length) {
    const r = seedreamProviders[0]
    mark('text_to_image', { providerId: r.providerId, model: r.model, protocol: 'openai-images', enabled: true })
  }

  // image_to_image: Seedream only (gpt-image-2/relay image-to-image is not synthesized).
  if (seedreamProviders.length) {
    const r = seedreamProviders[0]
    mark('image_to_image', { providerId: r.providerId, model: r.model, protocol: 'openai-images', enabled: true })
  }

  // MiniMax fills every minimax-cli capability (image routes above are already
  // reserved by higher-priority providers and mark() will not overwrite them).
  if (minimaxProviders.length) {
    const r = minimaxProviders[0]
    for (const kind of MEDIA_CAPABILITIES['minimax-cli']) {
      mark(kind, { providerId: r.providerId, model: r.model, protocol: 'minimax-cli', enabled: true })
    }
  }

  // Video priority: MiniMax (set above) > Seedance.
  if (seedanceProviders.length) {
    const r = seedanceProviders[0]
    mark('text_to_video', { providerId: r.providerId, model: r.model, protocol: 'openai-video', enabled: true })
    mark('image_to_video', { providerId: r.providerId, model: r.model, protocol: 'openai-video', enabled: true })
  }

  return routes
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
function mediaProviderUsable(openclawConfig, route) {
  const provider = openclawConfig?.models?.providers?.[route?.providerId]
  return Boolean(
    provider &&
    clean(provider.baseUrl || provider.base_url) &&
    clean(provider.apiKey || provider.api_key || provider.key),
  )
}

export function resolveMediaRoute(mediaConfig, openclawConfig, kind) {
  const config = normalizeMediaRouteConfig(mediaConfig)
  let route = config.routes[kind] || autoDetectMediaRoutes(openclawConfig)[kind] || null
  if (!route || route.enabled === false) return { ready: false, reason: 'route-not-configured', route: null }
  // An explicitly-configured media route always wins, but only while its
  // provider still exists and is fully configured. After a provider rename
  // (e.g. minimax_cn/yyapi -> minimax), the stale reference must not break
  // media generation; fall back to the auto-detected route for this kind.
  if (!mediaProviderUsable(openclawConfig, route)) {
    const detected = autoDetectMediaRoutes(openclawConfig)[kind]
    if (detected && detected.enabled !== false && mediaProviderUsable(openclawConfig, detected)) {
      route = detected
    }
  }
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

  if (id === YYAPI_PROVIDER_ID && selectedModel.toLowerCase() === YYAPI_IMAGE_MODEL_ID) {
    return {
      text_to_image: { providerId: id, model: selectedModel, protocol: 'openai-images', enabled: true },
    }
  }

  const lowerModel = selectedModel.toLowerCase()
  if (SEEDREAM_KEYWORDS.some(keyword => lowerModel.includes(keyword))) {
    return {
      text_to_image: { providerId: id, model: selectedModel, protocol: 'openai-images', enabled: true },
      image_to_image: { providerId: id, model: selectedModel, protocol: 'openai-images', enabled: true },
    }
  }
  if (SEEDANCE_KEYWORDS.some(keyword => lowerModel.includes(keyword))) {
    return {
      text_to_video: { providerId: id, model: selectedModel, protocol: 'openai-video', enabled: true },
      image_to_video: { providerId: id, model: selectedModel, protocol: 'openai-video', enabled: true },
    }
  }

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

// ---------------------------------------------------------------------------
// OpenAI-style video adapter helpers (即梦 Seedance and other relays).
// These are pure functions so the routing lib, the OpenClaw plugin and the
// native Rust command can each share the same endpoint/parse semantics and be
// unit tested without a live provider.
// ---------------------------------------------------------------------------

/**
 * Build submit + poll endpoints for an OpenAI-compatible or Volcengine Ark
 * video provider. baseUrl may end with `/v1` (relay) or `/api/v3` (Ark).
 */
export function buildVideoEndpoints(baseUrl) {
  const root = clean(baseUrl).replace(/\/+$/, '')
  if (!root) return { submit: '', pollBase: '', ark: false }
  if (root.includes('/api/v3')) {
    return { submit: `${root}/contents/generations/tasks`, pollBase: `${root}/contents/generations/tasks/`, ark: true }
  }
  if (root.endsWith('/v1')) {
    return { submit: `${root}/videos/generations`, pollBase: `${root}/videos/generations/`, ark: false }
  }
  return { submit: `${root}/v1/videos/generations`, pollBase: `${root}/v1/videos/generations/`, ark: false }
}

export function buildVideoPollEndpoint(baseUrl, taskId) {
  const { pollBase } = buildVideoEndpoints(baseUrl)
  if (!pollBase) return ''
  return `${pollBase}${encodeURIComponent(String(taskId || '').trim())}`
}

/**
 * Build the request body for a video generation task.
 * - Ark (content array) and relay (flat { model, prompt }) shapes are both
 *   produced depending on the endpoint kind.
 * - imagePath is passed as an image_url data URL for image-to-video.
 */
export function buildVideoRequestBody(model, prompt, { imageDataUrl, ark = false } = {}) {
  const body = { model }
  if (ark) {
    body.content = [{ type: 'text', text: prompt }]
    if (imageDataUrl) body.content.push({ type: 'image_url', image_url: { url: imageDataUrl } })
  } else {
    body.prompt = prompt
    if (imageDataUrl) body.image_url = imageDataUrl
  }
  return body
}

/**
 * Parse a submit response into a sync result or an async task id.
 * Relay sync returns data[0].url / data[0].b64_json; async returns id/task_id.
 */
export function parseVideoResponse(payload = {}) {
  const data = Array.isArray(payload.data) ? payload.data : []
  const first = data[0] || {}
  if (first.url) return { taskId: '', videoUrl: String(first.url), videoB64: '' }
  if (first.b64_json) return { taskId: '', videoUrl: '', videoB64: String(first.b64_json) }
  const taskId = String(payload.id || payload.task_id || payload.output?.task_id || payload.request_id || '').trim()
  if (taskId) return { taskId, videoUrl: '', videoB64: '' }
  return { taskId: '', videoUrl: '', videoB64: '' }
}

/**
 * Parse a poll response into { status, videoUrl, error }.
 * Handles relay data[0].url and Ark content.video_url / output.video_url.
 */
export function parseVideoPollResponse(payload = {}) {
  const status = String(payload.status || payload.task_status || payload.output?.status || '').toLowerCase()
  const data = Array.isArray(payload.data) ? payload.data : []
  const videoUrl = String(
    data[0]?.url ||
    payload.video_url ||
    payload.content?.video_url ||
    payload.output?.video_url ||
    payload.results?.video_url ||
    '',
  ).trim()
  const error = String(payload.error?.message || payload.error_message || payload.output?.error_message || '').trim()
  return { status, videoUrl, error }
}
