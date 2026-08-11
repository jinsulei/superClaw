import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..')
const pluginTemplate = path.join(
  root,
  'src-tauri/resources/templates/openclaw-plugins/superclaw-media/index.js',
)

// Build a throwaway portable layout: openclaw.json + media-routes.json plus a
// copied plugin whose `../../plugin-sdk/plugin-entry.js` import resolves to a
// tiny mock SDK that captures the registered tool entry.
function makeHarness({ routes, provider }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superclaw-jidu-'))
  const openclawDir = path.join(tmp, '.openclaw')
  const mediaDir = path.join(tmp, 'media')
  const pluginDir = path.join(tmp, 'plugin', 'superclaw-media')
  const sdkDir = path.join(tmp, 'plugin-sdk')
  fs.mkdirSync(openclawDir, { recursive: true })
  fs.mkdirSync(mediaDir, { recursive: true })
  fs.mkdirSync(pluginDir, { recursive: true })
  fs.mkdirSync(sdkDir, { recursive: true })

  const configPath = path.join(openclawDir, 'openclaw.json')
  const mediaConfigPath = path.join(mediaDir, 'media-routes.json')
  fs.writeFileSync(
    configPath,
    JSON.stringify({ models: { providers: provider } }, null, 2),
  )
  fs.writeFileSync(
    mediaConfigPath,
    JSON.stringify({ version: 1, routes }, null, 2),
  )
  fs.copyFileSync(pluginTemplate, path.join(pluginDir, 'index.js'))
  fs.writeFileSync(
    path.join(sdkDir, 'plugin-entry.js'),
    "export function definePluginEntry(definition) { globalThis.__SUPERCLAW_PLUGIN_DEF__ = definition }\n",
  )
  return {
    tmp,
    configPath,
    mediaConfigPath,
    pluginIndex: path.join(pluginDir, 'index.js'),
  }
}

async function loadVideoTool(harness) {
  delete globalThis.__SUPERCLAW_PLUGIN_DEF__
  await import(`file://${harness.pluginIndex}?t=${Date.now()}`)
  const definition = globalThis.__SUPERCLAW_PLUGIN_DEF__
  assert.ok(definition, 'plugin should register via the mock SDK')
  const tools = []
  definition.register({ registerTool(tool) { tools.push(tool) } })
  const video = tools.find((tool) => tool.name === 'superclaw_generate_video')
  assert.ok(video, 'plugin should register superclaw_generate_video')
  return video
}

// Set the portable config paths for the duration of one test; the plugin's
// configuredRoute reads them at execute time, not at import time.
async function withHarnessEnv(harness, fn) {
  const prevConfig = process.env.OPENCLAW_CONFIG_PATH
  const prevMedia = process.env.SUPERCLAW_MEDIA_CONFIG_PATH
  process.env.OPENCLAW_CONFIG_PATH = harness.configPath
  process.env.SUPERCLAW_MEDIA_CONFIG_PATH = harness.mediaConfigPath
  try {
    return await fn()
  } finally {
    process.env.OPENCLAW_CONFIG_PATH = prevConfig
    process.env.SUPERCLAW_MEDIA_CONFIG_PATH = prevMedia
  }
}

test('即梦 plugin video adapter drives the Ark submit + poll + download flow', async () => {
  const harness = makeHarness({
    provider: {
      jimeng: {
        baseUrl: 'https://ark.mock/api/v3',
        apiKey: 'secret',
        models: [{ id: 'doubao-seedance-1-0-pro' }],
      },
    },
    routes: {
      text_to_video: {
        providerId: 'jimeng',
        model: 'doubao-seedance-1-0-pro',
        protocol: 'openai-video',
        enabled: true,
      },
    },
  })
  const videoTool = await loadVideoTool(harness)

  const originalFetch = global.fetch
  let pollCount = 0
  global.fetch = async (url, options) => {
    const target = String(url)
    if (options?.method === 'POST' && target.endsWith('/contents/generations/tasks')) {
      return { ok: true, status: 200, json: async () => ({ id: 'task-123' }) }
    }
    if (target.includes('/contents/generations/tasks/task-123')) {
      pollCount += 1
      if (pollCount === 1) {
        return { ok: true, status: 200, json: async () => ({ status: 'queued' }) }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'succeeded', content: { video_url: 'http://mock/video.mp4' } }),
      }
    }
    if (target === 'http://mock/video.mp4') {
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('FAKE-MP4-BYTES').buffer }
    }
    throw new Error(`Unexpected fetch: ${target}`)
  }
  try {
    const result = await withHarnessEnv(harness, () =>
      videoTool.execute('session-1', { prompt: 'a cat walking on the moon' }),
    )
    assert.ok(pollCount >= 2, 'the adapter should poll at least once before success')
    const artifact = result.details.media.artifacts[0]
    assert.ok(artifact, 'the video result should include an artifact')
    assert.ok(fs.existsSync(artifact.path), `video file should exist at ${artifact.path}`)
    assert.equal(fs.readFileSync(artifact.path, 'utf8'), 'FAKE-MP4-BYTES')
    assert.match(String(result.content[0].text), /Video generated:/)
  } finally {
    global.fetch = originalFetch
    fs.rmSync(harness.tmp, { recursive: true, force: true })
  }
})

test('即梦 plugin video adapter handles a relay sync result without polling', async () => {
  const harness = makeHarness({
    provider: {
      jimeng: {
        baseUrl: 'https://relay.mock/v1',
        apiKey: 'secret',
        models: [{ id: 'seedance-1-0-pro' }],
      },
    },
    routes: {
      text_to_video: {
        providerId: 'jimeng',
        model: 'seedance-1-0-pro',
        protocol: 'openai-video',
        enabled: true,
      },
    },
  })
  const videoTool = await loadVideoTool(harness)

  const originalFetch = global.fetch
  global.fetch = async (url, options) => {
    const target = String(url)
    if (options?.method === 'POST' && target.endsWith('/v1/videos/generations')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ url: 'http://mock/sync.mp4' }] }),
      }
    }
    if (target === 'http://mock/sync.mp4') {
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('SYNC-MP4').buffer }
    }
    throw new Error(`Unexpected fetch: ${target}`)
  }
  try {
    const result = await withHarnessEnv(harness, () =>
      videoTool.execute('session-2', { prompt: 'a boat on the sea' }),
    )
    const artifact = result.details.media.artifacts[0]
    assert.ok(fs.existsSync(artifact.path))
    assert.equal(fs.readFileSync(artifact.path, 'utf8'), 'SYNC-MP4')
  } finally {
    global.fetch = originalFetch
    fs.rmSync(harness.tmp, { recursive: true, force: true })
  }
})
