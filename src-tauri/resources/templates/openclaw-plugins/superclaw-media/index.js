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

function portableRoot() {
  const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(process.cwd(), 'resources', 'data', '.openclaw', 'openclaw.json')
  const root = path.resolve(path.dirname(configPath), '..')
  const mediaConfigPath = process.env.SUPERCLAW_MEDIA_CONFIG_PATH || path.join(root, 'media', 'media-routes.json')
  return { configPath, root, mediaConfigPath }
}

function configuredRoute(kind) {
  if (!routeKinds.has(kind)) throw new Error(`Unsupported media route: ${kind}`)
  const { configPath, root, mediaConfigPath } = portableRoot()
  const selected = readJson(mediaConfigPath).routes?.[kind]
  if (!selected?.enabled) throw new Error(`Media route '${kind}' is not configured. Configure it in Models first.`)
  const provider = readJson(configPath).models?.providers?.[selected.providerId]
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

async function generateOpenAiImage(params, route) {
  const prompt = String(params?.prompt || '').trim()
  if (!prompt || prompt.length > 8000) throw new Error('Image prompt must be between 1 and 8000 characters.')
  const endpoint = route.baseUrl.endsWith('/v1') ? `${route.baseUrl}/images/generations` : `${route.baseUrl}/v1/images/generations`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${route.apiKey}` },
    body: JSON.stringify({ model: route.selected.model, prompt, size: params?.size || '1024x1024', response_format: 'b64_json' }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || `Image provider request failed (${response.status})`)
  const encoded = payload?.data?.[0]?.b64_json
  if (!encoded) throw new Error('Image provider did not return savable image data.')
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('Generated image is empty or exceeds 25MB.')
  fs.mkdirSync(route.outputDir, { recursive: true })
  const file = path.join(route.outputDir, `image-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
  fs.writeFileSync(file, bytes)
  return { text: `Image generated: ${file}`, encoded, artifacts: [{ type: 'image', path: file }] }
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
