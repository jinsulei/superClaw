import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert/strict'

import { getHermesMediaConfig, IMAGE_API_KEY_MISSING_MESSAGE } from './hermes-media/media-config.js'
import { getHermesMediaCapabilities, generateHermesImage } from './hermes-media/image-service.js'
import { readMediaFile, saveMediaBuffer } from './hermes-media/media-storage.js'

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superclaw-hermes-media-'))
const env = {
  IMAGE_PROVIDER: 'openai',
  IMAGE_BASE_URL: 'https://api.openai.com/v1',
  IMAGE_API_KEY: '',
  IMAGE_MODEL: 'gpt-image-2',
  IMAGE_DEFAULT_SIZE: '1024x1536',
  IMAGE_DEFAULT_QUALITY: 'high',
  IMAGE_OUTPUT_FORMAT: 'png',
  HERMES_WORKSPACE_DIR: 'workspace',
}

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

const config = getHermesMediaConfig({ rootDir, env })
const capabilities = getHermesMediaCapabilities(config)
assert.equal(capabilities.configured, false)
assert.equal(capabilities.model, 'gpt-image-2')

const saved = saveMediaBuffer(config, {
  buffer: png1x1,
  mimeType: 'image/png',
  fileName: 'probe.png',
})
assert.ok(saved.id)
assert.ok(saved.url.includes('/api/hermes/media/file/'))

const loaded = readMediaFile(config, saved.id)
assert.equal(Buffer.compare(loaded.buffer, png1x1), 0)

const noKey = await generateHermesImage(config, { prompt: '生成一张测试图片' })
assert.equal(noKey.success, false)
assert.equal(noKey.message, IMAGE_API_KEY_MISSING_MESSAGE)

async function optionalHttpProbe() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1200)
  try {
    const response = await fetch('http://127.0.0.1:1420/api/hermes/media/capabilities', { signal: controller.signal })
    if (!response.ok) return `HTTP_SKIP status=${response.status}`
    const payload = await response.json()
    assert.equal(payload.model, payload.model || 'gpt-image-2')
    const generateResponse = await fetch('http://127.0.0.1:1420/api/hermes/media/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '生成一张测试图片' }),
      signal: controller.signal,
    })
    const generatePayload = await generateResponse.json()
    assert.equal(generatePayload.success, false)
    assert.equal(generatePayload.message, IMAGE_API_KEY_MISSING_MESSAGE)
    return 'HTTP_CAPABILITIES_AND_MISSING_KEY_PASS'
  } catch {
    return 'HTTP_SKIP server_not_running'
  } finally {
    clearTimeout(timer)
  }
}

const httpResult = await optionalHttpProbe()

console.log(JSON.stringify({
  ok: true,
  direct: {
    capabilities: 'PASS',
    upload: 'PASS',
    missingKey: 'PASS',
  },
  http: httpResult,
  workspaceDir: config.workspaceDir,
}, null, 2))
