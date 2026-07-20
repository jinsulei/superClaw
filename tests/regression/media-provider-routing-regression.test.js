import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMediaRoutePatch,
  emptyMediaRouteConfig,
  normalizeMediaRouteConfig,
  resolveMediaRoute,
  saveMediaRoute,
} from '../../src/lib/media-provider-routing.js'

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
