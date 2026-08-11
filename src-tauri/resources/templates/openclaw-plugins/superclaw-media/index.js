import { definePluginEntry } from '../../plugin-sdk/plugin-entry.js'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const readJson = (file, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

const routeKinds = new Set([
  'text_to_image',
  'image_to_image',
  'text_to_video',
  'image_to_video',
  'text_to_speech',
  'text_to_music',
  'image_understanding',
])
const YYAPI_PROVIDER_ID = 'yyapi'
const YYAPI_IMAGE_MODEL_ID = 'gpt-image-2'
// 即梦 (Jidu/Dreamina) 主流模型关键词。Seedream 是生图模型，Seedance 是生视频模型。
// 按子串做大小写不敏感匹配，与 src/lib/media-provider-routing.js 保持一致。
const SEEDREAM_KEYWORDS = ['seedream', 'doubao-seedream']
const SEEDANCE_KEYWORDS = ['seedance', 'doubao-seedance', 'seedans']

function providerModelIds(provider) {
  return (Array.isArray(provider?.models) ? provider.models : [])
    .map(entry => String(typeof entry === 'string' ? entry : entry?.id || entry?.model || '').trim())
    .filter(Boolean)
}

function providerHasCredentials(provider) {
  return Boolean(
    String(provider?.baseUrl || provider?.base_url || '').trim() &&
    String(provider?.apiKey || provider?.api_key || provider?.key || '').trim(),
  )
}

function isMiniMaxProvider(providerId, provider) {
  const id = String(providerId || '').toLowerCase()
  const baseUrl = String(provider?.baseUrl || provider?.base_url || '').toLowerCase()
  return id.includes('minimax') || baseUrl.includes('api.minimax.io') || baseUrl.includes('api.minimaxi.com')
}

function portableRoot() {
  const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(process.cwd(), 'resources', 'data', '.openclaw', 'openclaw.json')
  const root = path.resolve(path.dirname(configPath), '..')
  const mediaConfigPath = process.env.SUPERCLAW_MEDIA_CONFIG_PATH || path.join(root, 'media', 'media-routes.json')
  return { configPath, root, mediaConfigPath }
}

/**
 * Generalize media provider auto-detection across every configured provider,
 * mirroring src/lib/media-provider-routing.js. A user's explicit media route
 * always wins (handled by configuredRoute); this fills capabilities from
 * model-list keywords so yyapi/gpt-image-2, MiniMax and 即梦 can coexist.
 *
 * Image priority: gpt-image-2 > MiniMax > Seedream.
 * Video priority: MiniMax > Seedance.
 */
function autoDetectMediaRoutes(config) {
  const providers = config?.models?.providers || {}
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
  if (seedreamProviders.length) {
    const r = seedreamProviders[0]
    mark('image_to_image', { providerId: r.providerId, model: r.model, protocol: 'openai-images', enabled: true })
  }
  if (minimaxProviders.length) {
    const r = minimaxProviders[0]
    for (const kind of ['text_to_image', 'text_to_video', 'image_to_video', 'text_to_speech', 'text_to_music', 'image_understanding']) {
      mark(kind, { providerId: r.providerId, model: r.model, protocol: 'minimax-cli', enabled: true })
    }
  }
  if (seedanceProviders.length) {
    const r = seedanceProviders[0]
    mark('text_to_video', { providerId: r.providerId, model: r.model, protocol: 'openai-video', enabled: true })
    mark('image_to_video', { providerId: r.providerId, model: r.model, protocol: 'openai-video', enabled: true })
  }
  return routes
}

function providerUsable(config, route) {
  const provider = config?.models?.providers?.[route?.providerId]
  return Boolean(
    provider &&
    String(provider.baseUrl || provider.base_url || '').trim() &&
    String(provider.apiKey || provider.api_key || provider.key || '').trim(),
  )
}

function configuredRoute(kind) {
  if (!routeKinds.has(kind)) throw new Error(`Unsupported media route: ${kind}`)
  const { configPath, root, mediaConfigPath } = portableRoot()
  const config = readJson(configPath)
  const routes = readJson(mediaConfigPath).routes || {}
  let selected = routes[kind]
  // Mirror the native Rust media route resolution: a user who is actively on
  // yyapi must not have a legacy MiniMax text-to-image route silently take
  // over. Explicit non-legacy routes still win, and non-image media keeps its
  // configured route.
  if (kind === 'text_to_image') {
    const primary = String(config?.agents?.defaults?.model?.primary || '').trim().toLowerCase()
    if (primary.startsWith('yyapi/')) {
      const auto = autoDetectMediaRoutes(config).text_to_image
      if (auto) selected = auto
    }
  }
  if (!selected) selected = autoDetectMediaRoutes(config)[kind]
  if (!selected?.enabled) throw new Error(`Media route '${kind}' is not configured. Configure it in Models first.`)
  // An explicitly-configured media route always wins, but only while its
  // provider still exists and is fully configured. After a provider rename
  // (e.g. minimax_cn/yyapi -> minimax), the stale reference must not hard-fail;
  // fall back to the auto-detected route for this kind.
  if (!providerUsable(config, selected)) {
    const auto = autoDetectMediaRoutes(config)[kind]
    if (auto?.enabled && providerUsable(config, auto)) selected = auto
  }
  const provider = config.models?.providers?.[selected.providerId]
  const baseUrl = String(provider?.baseUrl || provider?.base_url || '').replace(/\/$/, '')
  const apiKey = String(provider?.apiKey || provider?.api_key || provider?.key || '').trim()
  if (!baseUrl || !apiKey) throw new Error('The selected media provider is missing Base URL or API Key.')
  return { selected, baseUrl, apiKey, outputDir: path.join(root, 'generated', 'media') }
}

function isOfficialMiniMax(baseUrl) {
  const value = String(baseUrl || '').toLowerCase()
  return value.includes('api.minimax.io') || value.includes('api.minimaxi.com')
}

function minimaxRegion(baseUrl) {
  return String(baseUrl || '').toLowerCase().includes('minimaxi.com') ? 'cn' : 'global'
}

function mmxScript() {
  const runtime = path.dirname(process.execPath)
  const script = path.join(runtime, 'node_modules', 'mmx-cli', 'dist', 'mmx.mjs')
  if (!fs.existsSync(script)) throw new Error('Bundled MiniMax media CLI was not found. Rebuild the portable runtime.')
  return script
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
      else reject(new Error(stderr.trim() || stdout.trim() || `MiniMax media CLI exited with ${code}`))
    })
  })
}

function newestFile(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => ({ path: path.join(dir, entry.name), mtime: fs.statSync(path.join(dir, entry.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return files[0]?.path || ''
}

async function runMiniMax(kind, params, route) {
  if (!isOfficialMiniMax(route.baseUrl)) {
    throw new Error('MiniMax media requires an official MiniMax Global or China Base URL, not a relay URL.')
  }
  fs.mkdirSync(route.outputDir, { recursive: true })
  const prompt = String(params?.prompt || '').trim()
  const imagePath = String(params?.imagePath || '').trim()
  if (!prompt) throw new Error('A media prompt is required.')
  const args = [mmxScript()]
  let outputPath = ''
  if (kind === 'text_to_image') {
    args.push('image', 'generate', '--prompt', prompt, '--out-dir', route.outputDir)
    if (params?.aspectRatio) args.push('--aspect-ratio', String(params.aspectRatio))
  } else if (kind === 'text_to_video' || kind === 'image_to_video') {
    args.push('video', 'generate', '--prompt', prompt)
    if (kind === 'image_to_video') {
      if (!imagePath) throw new Error('Image-to-video requires imagePath.')
      args.push('--first-frame', imagePath)
    }
    outputPath = path.join(route.outputDir, `video-${Date.now()}.mp4`)
    args.push('--download', outputPath)
  } else if (kind === 'text_to_speech') {
    outputPath = path.join(route.outputDir, `speech-${Date.now()}.mp3`)
    args.push('speech', 'synthesize', '--text', prompt, '--out', outputPath)
    if (params?.voice) args.push('--voice', String(params.voice))
  } else if (kind === 'text_to_music') {
    outputPath = path.join(route.outputDir, `music-${Date.now()}.mp3`)
    args.push('music', 'generate', '--prompt', prompt, '--instrumental', '--out', outputPath)
  } else if (kind === 'image_understanding') {
    if (!imagePath) throw new Error('Image understanding requires imagePath.')
    args.push('vision', 'describe', '--image', imagePath, '--prompt', prompt)
  } else {
    throw new Error(`MiniMax CLI does not support '${kind}'.`)
  }
  args.push('--api-key', route.apiKey, '--region', minimaxRegion(route.baseUrl), '--output', 'json', '--quiet', '--non-interactive', '--no-color')
  const result = await run(process.execPath, args)
  const details = (() => { try { return JSON.parse(result.stdout) } catch { return { output: result.stdout } } })()
  if (kind === 'image_understanding') {
    const text = String(details?.text || result.stdout || '').trim()
    return { text, details, artifacts: [] }
  }
  const artifact = outputPath || newestFile(route.outputDir)
  if (!artifact || !fs.existsSync(artifact)) throw new Error('MiniMax media completed without an output file.')
  return { text: `Media generated: ${artifact}`, details, artifacts: [{ type: kind.includes('image') ? 'image' : 'file', path: artifact }] }
}

async function downloadBytes(url, apiKey, label) {
  let response = await fetch(url)
  if (response.status === 401 && apiKey) {
    response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  }
  if (!response.ok) throw new Error(`Failed to download generated ${label} (HTTP ${response.status})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) throw new Error(`Generated ${label} URL returned empty data.`)
  return bytes
}

async function downloadImageUrl(url, apiKey) {
  return downloadBytes(url, apiKey, 'image')
}

async function generateOpenAiImage(params, route) {
  const prompt = String(params?.prompt || '').trim()
  if (!prompt || prompt.length > 8000) throw new Error('Image prompt must be between 1 and 8000 characters.')
  const endpoint = route.baseUrl.endsWith('/v1') ? `${route.baseUrl}/images/generations` : `${route.baseUrl}/v1/images/generations`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${route.apiKey}` },
    body: JSON.stringify({ model: route.selected.model, prompt, size: params?.size || '1024x1024', response_format: 'b64_json', output_format: 'png' }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || `Image provider request failed (${response.status})`)
  let bytes = Buffer.alloc(0)
  const encoded = payload?.data?.[0]?.b64_json
  if (encoded) {
    bytes = Buffer.from(encoded, 'base64')
  } else if (payload?.data?.[0]?.url) {
    bytes = await downloadImageUrl(payload.data[0].url, route.apiKey)
  } else {
    throw new Error('Image provider did not return savable image data.')
  }
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('Generated image is empty or exceeds 25MB.')
  fs.mkdirSync(route.outputDir, { recursive: true })
  const file = path.join(route.outputDir, `image-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
  fs.writeFileSync(file, bytes)
  return { text: `Image generated: ${file}`, encoded, artifacts: [{ type: 'image', path: file }] }
}

// ---------------------------------------------------------------------------
// OpenAI-style video adapter (即梦 Seedance and other relays). Mirrors the pure
// endpoint/parse semantics in src/lib/media-provider-routing.js so the plugin,
// the Web debug server and the native Rust command all share the same shape.
// ---------------------------------------------------------------------------

function videoEndpoints(baseUrl) {
  const root = String(baseUrl || '').replace(/\/+$/, '')
  if (!root) return { submit: '', pollBase: '', ark: false }
  if (root.includes('/api/v3')) {
    return { submit: `${root}/contents/generations/tasks`, pollBase: `${root}/contents/generations/tasks/`, ark: true }
  }
  if (root.endsWith('/v1')) {
    return { submit: `${root}/videos/generations`, pollBase: `${root}/videos/generations/`, ark: false }
  }
  return { submit: `${root}/v1/videos/generations`, pollBase: `${root}/v1/videos/generations/`, ark: false }
}

function toDataUrl(imagePath) {
  const value = String(imagePath || '').trim()
  if (!value) return ''
  if (/^(https?:|data:)/i.test(value)) return value
  const file = path.resolve(value)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Image file not found: ${value}`)
  if (fs.statSync(file).size > 25 * 1024 * 1024) throw new Error('Source image for video is larger than 25MB.')
  const ext = path.extname(file).toLowerCase()
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
}

async function saveVideoResult(item, route) {
  let bytes = Buffer.alloc(0)
  let encoded = ''
  if (item.b64_json) {
    encoded = String(item.b64_json)
    bytes = Buffer.from(encoded, 'base64')
  } else if (item.url) {
    bytes = await downloadBytes(item.url, route.apiKey, 'video')
  } else {
    throw new Error('Video provider did not return downloadable video data.')
  }
  if (!bytes.length || bytes.length > 500 * 1024 * 1024) throw new Error('Generated video is empty or exceeds 500MB.')
  fs.mkdirSync(route.outputDir, { recursive: true })
  const file = path.join(route.outputDir, `video-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`)
  fs.writeFileSync(file, bytes)
  return { text: `Video generated: ${file}`, encoded, artifacts: [{ type: 'file', path: file }] }
}

async function generateOpenAiVideo(params, route) {
  const prompt = String(params?.prompt || '').trim()
  if (!prompt || prompt.length > 8000) throw new Error('Video prompt must be between 1 and 8000 characters.')
  const imageDataUrl = toDataUrl(params?.imagePath)
  const endpoints = videoEndpoints(route.baseUrl)
  if (!endpoints.submit) throw new Error('Video provider Base URL is invalid.')
  const body = { model: route.selected.model }
  if (endpoints.ark) {
    body.content = [{ type: 'text', text: prompt }]
    if (imageDataUrl) body.content.push({ type: 'image_url', image_url: { url: imageDataUrl } })
  } else {
    body.prompt = prompt
    if (imageDataUrl) body.image_url = imageDataUrl
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${route.apiKey}` }
  if (endpoints.ark) headers['X-MultiModal-Async'] = '1'
  const submit = await fetch(endpoints.submit, { method: 'POST', headers, body: JSON.stringify(body) })
  const submitPayload = await submit.json().catch(() => ({}))
  if (!submit.ok) throw new Error(submitPayload?.error?.message || `Video provider submit failed (HTTP ${submit.status})`)
  const data = Array.isArray(submitPayload.data) ? submitPayload.data : []
  const first = data[0] || {}
  if (first.url || first.b64_json) return saveVideoResult(first, route)
  const taskId = String(submitPayload.id || submitPayload.task_id || submitPayload.output?.task_id || submitPayload.request_id || '').trim()
  if (!taskId) throw new Error('Video provider did not return a task id or a direct video.')
  const deadline = Date.now() + 600000
  const pollEndpoint = `${endpoints.pollBase}${encodeURIComponent(taskId)}`
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    const poll = await fetch(pollEndpoint, { headers })
    const pollPayload = await poll.json().catch(() => ({}))
    if (!poll.ok) throw new Error(pollPayload?.error?.message || `Video provider poll failed (HTTP ${poll.status})`)
    const status = String(pollPayload.status || pollPayload.task_status || pollPayload.output?.status || '').toLowerCase()
    const videoUrl = String(
      pollPayload.data?.[0]?.url ||
      pollPayload.video_url ||
      pollPayload.content?.video_url ||
      pollPayload.output?.video_url ||
      pollPayload.results?.video_url ||
      '',
    ).trim()
    if (videoUrl) return saveVideoResult({ url: videoUrl }, route)
    if (status.includes('fail') || status.includes('cancel') || status.includes('error')) {
      throw new Error(pollPayload?.error?.message || pollPayload.error_message || pollPayload.output?.error_message || `Video task failed with status '${status}'.`)
    }
    if (status.includes('succeed') || status === 'success' || status === 'done') {
      throw new Error('Video task succeeded without a downloadable URL.')
    }
  }
  throw new Error('Video generation timed out after 10 minutes.')
}

async function execute(kind, params) {
  if (kind === 'text_to_video' && String(params?.imagePath || '').trim()) {
    const { mediaConfigPath } = portableRoot()
    const hasImageToVideoRoute = Boolean(readJson(mediaConfigPath).routes?.image_to_video?.enabled)
    if (hasImageToVideoRoute) kind = 'image_to_video'
  }
  const route = configuredRoute(kind)
  if (route.selected.protocol === 'minimax-cli') return runMiniMax(kind, params, route)
  if (route.selected.protocol === 'openai-images' && kind === 'text_to_image') return generateOpenAiImage(params, route)
  if (route.selected.protocol === 'openai-video' && (kind === 'text_to_video' || kind === 'image_to_video')) return generateOpenAiVideo(params, route)
  throw new Error(`The '${route.selected.protocol}' adapter cannot execute '${kind}' in this build.`)
}

function toolResult(result) {
  const content = [{ type: 'text', text: result.text }]
  if (result.encoded) content.push({ type: 'image', data: result.encoded, mimeType: 'image/png' })
  return { content, details: { media: { artifacts: result.artifacts || [] } } }
}

const toolDefinitions = [
  { name: 'superclaw_generate_image', kind: 'text_to_image', description: 'Generate an image using the independently configured media route.', properties: { prompt: { type: 'string' }, size: { type: 'string' }, aspectRatio: { type: 'string' } }, required: ['prompt'] },
  { name: 'superclaw_generate_video', kind: 'text_to_video', description: 'Generate a video. Provide imagePath only when the configured image-to-video route is selected.', properties: { prompt: { type: 'string' }, imagePath: { type: 'string' } }, required: ['prompt'] },
  { name: 'superclaw_generate_speech', kind: 'text_to_speech', description: 'Generate speech from text using the independently configured media route.', properties: { prompt: { type: 'string' }, voice: { type: 'string' } }, required: ['prompt'] },
  { name: 'superclaw_generate_music', kind: 'text_to_music', description: 'Generate instrumental music from a prompt using the independently configured media route.', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
  { name: 'superclaw_describe_image', kind: 'image_understanding', description: 'Describe or extract information from an image using the independently configured media route.', properties: { prompt: { type: 'string' }, imagePath: { type: 'string' } }, required: ['prompt', 'imagePath'] },
]

export default definePluginEntry({
  id: 'superclaw-media',
  name: 'SuperClaw Media',
  register(api) {
    for (const tool of toolDefinitions) {
      api.registerTool({
        name: tool.name,
        label: tool.name.replace('superclaw_', '').replaceAll('_', ' '),
        description: tool.description,
        parameters: { type: 'object', additionalProperties: false, properties: tool.properties, required: tool.required },
        async execute(_id, params) { return toolResult(await execute(tool.kind, params)) },
      })
    }
  },
})
