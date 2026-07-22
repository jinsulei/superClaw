import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMediaRoutePatch,
  buildMediaRoutesForProvider,
  emptyMediaRouteConfig,
  normalizeMediaRouteConfig,
  protocolForMediaProvider,
  resolveMediaRoute,
  saveMediaRoute,
} from '../../src/lib/media-provider-routing.js'
import { buildOpenClawMediaTaskPrompt, detectTextToImageTask } from '../../src/lib/collaboration.js'

const imageRoute = {
  providerId: 'image_provider',
  model: 'image-model-v1',
  protocol: 'openai-images',
  enabled: true,
}

test('media routes are portable app data and never carry credentials', () => {
  const config = buildMediaRoutePatch(emptyMediaRouteConfig(), 'text_to_image', imageRoute)
  assert.deepEqual(config, { version: 1, routes: { text_to_image: imageRoute } })
  assert.throws(
    () => normalizeMediaRouteConfig({ routes: { text_to_image: { ...imageRoute, apiKey: 'secret' } } }),
    /must not contain credentials/i,
  )
})

test('media route resolves an existing provider without exposing its key', () => {
  const result = resolveMediaRoute(
    { routes: { text_to_image: imageRoute } },
    { models: { providers: { image_provider: { baseUrl: 'https://example.test/v1', apiKey: 'hidden', models: [{ id: 'image-model-v1' }] } } } },
    'text_to_image',
  )
  assert.equal(result.ready, true)
  assert.deepEqual(result.provider, { id: 'image_provider', baseUrl: 'https://example.test/v1', api: 'openai-completions' })
  assert.equal(JSON.stringify(result).includes('hidden'), false)
})

test('media routes do not modify OpenClaw chat primary or fallbacks', () => {
  const openclaw = {
    agents: { defaults: { model: { primary: 'yyapi/gpt-5.4', fallbacks: ['yyapi/gpt-5.5'] } } },
    models: { providers: { image_provider: { baseUrl: 'https://example.test/v1', apiKey: 'hidden', models: [{ id: 'image-model-v1' }] } } },
  }
  const before = JSON.stringify(openclaw)
  const resolved = resolveMediaRoute({ routes: { text_to_image: imageRoute } }, openclaw, 'text_to_image')
  assert.equal(resolved.ready, true)
  assert.equal(JSON.stringify(openclaw), before)
})

test('saving a media route only calls its dedicated portable config bridge', async () => {
  const calls = []
  const client = {
    mediaConfigRead: async () => emptyMediaRouteConfig(),
    mediaConfigWrite: async (config) => { calls.push(config); return { ok: true, config } },
  }
  await saveMediaRoute('text_to_image', imageRoute, client)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { version: 1, routes: { text_to_image: imageRoute } })
})

test('MiniMax uses its dedicated portable CLI adapter without changing chat routing', () => {
  const minimax = { baseUrl: 'https://api.minimaxi.com/v1', apiKey: 'hidden', models: [{ id: 'MiniMax-M3' }] }
  assert.equal(protocolForMediaProvider('minimax_cn', minimax, 'text_to_image'), 'minimax-cli')
  assert.equal(protocolForMediaProvider('minimax_cn', minimax, 'image_to_video'), 'minimax-cli')
  assert.equal(protocolForMediaProvider('minimax_cn', minimax, 'image_to_image'), 'openai-images')
  const route = { providerId: 'minimax_cn', model: 'MiniMax-M3', protocol: 'minimax-cli', enabled: true }
  assert.deepEqual(normalizeMediaRouteConfig({ routes: { text_to_music: route } }), { version: 1, routes: { text_to_music: route } })
  assert.throws(
    () => normalizeMediaRouteConfig({ routes: { image_to_image: route } }),
    /does not support/i,
  )
})

test('one media provider selection expands only to its supported capabilities', () => {
  const minimax = { baseUrl: 'https://api.minimaxi.com/v1', apiKey: 'hidden', models: [{ id: 'MiniMax-M3' }] }
  const routes = buildMediaRoutesForProvider('minimax_cn', minimax, 'MiniMax-M3')
  assert.deepEqual(Object.keys(routes).sort(), [
    'image_to_video',
    'image_understanding',
    'text_to_image',
    'text_to_music',
    'text_to_speech',
    'text_to_video',
  ])
  assert.equal(routes.text_to_image.protocol, 'minimax-cli')
  assert.equal(routes.image_to_image, undefined)
})

test('text-to-image requests become an isolated OpenClaw collaboration task', () => {
  const task = detectTextToImageTask({ text: '生成一张郑州夏日城市海报' })
  assert.deepEqual(task, {
    media_type: 'text_to_image',
    prompt: '生成一张郑州夏日城市海报',
    title: '文生图协作任务',
  })
  const prompt = buildOpenClawMediaTaskPrompt(task)
  assert.match(prompt, /superclaw_generate_image/)
  assert.match(prompt, /生成一张郑州夏日城市海报/)
  assert.equal(detectTextToImageTask({ text: '分析我上传的图片', attachments: [{ name: 'source.png' }] }), null)
})
