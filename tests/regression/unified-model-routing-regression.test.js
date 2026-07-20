import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyUnifiedModelSelection,
  buildClaudeRelayProjection,
  buildOpenClawModelPatch,
  modelRef,
} from '../../src/lib/unified-model-routing.js'

const selection = {
  providerId: 'minimax',
  name: 'MiniMax',
  baseUrl: 'https://api.minimaxi.com/v1/',
  apiKey: 'test-key',
  api: 'openai-completions',
  model: 'MiniMax-M3',
}

test('unified model patch updates only the selected provider and primary model', () => {
  const original = {
    models: {
      providers: {
        yyapi: { baseUrl: 'https://yyapi.example/v1', apiKey: 'yy-key', api: 'openai-completions', models: [{ id: 'gpt-5.4' }] },
      },
    },
    agents: {
      defaults: {
        model: { primary: 'yyapi/gpt-5.4', fallbacks: ['yyapi/gpt-5.5'] },
      },
    },
    gateway: { port: 18789, auth: { mode: 'token', token: 'keep-me' } },
  }

  const { config, reference } = buildOpenClawModelPatch(original, selection)
  assert.equal(reference, 'minimax/MiniMax-M3')
  assert.equal(config.agents.defaults.model.primary, reference)
  assert.deepEqual(config.agents.defaults.model.fallbacks, ['yyapi/gpt-5.5'])
  assert.deepEqual(config.models.providers.yyapi, original.models.providers.yyapi)
  assert.equal(config.gateway.auth.token, 'keep-me')
  assert.equal(original.agents.defaults.model.primary, 'yyapi/gpt-5.4')
})

test('media-only provider registration never changes the Gateway chat route', () => {
  const original = {
    agents: { defaults: { model: { primary: 'yyapi/gpt-5.4', fallbacks: ['yyapi/gpt-5.5'] } } },
  }
  const { config } = buildOpenClawModelPatch(original, selection, { applyChatModel: false })
  assert.equal(config.agents.defaults.model.primary, 'yyapi/gpt-5.4')
  assert.deepEqual(config.agents.defaults.model.fallbacks, ['yyapi/gpt-5.5'])
  assert.equal(config.models.providers.minimax.baseUrl, 'https://api.minimaxi.com/v1')
})

test('Claude relay is a projection of the shared provider rather than a second provider record', () => {
  const relay = buildClaudeRelayProjection(selection)
  assert.equal(relay.defaultProvider, 'minimax')
  assert.equal(relay.model, 'MiniMax-M3')
  assert.deepEqual(relay.branchModels, ['MiniMax-M3'])
  assert.equal(relay.managedBy, 'superclaw-unified-model-routing')
  assert.equal(modelRef('minimax', 'MiniMax-M3'), 'minimax/MiniMax-M3')
})

test('Hermes provider identity can differ from the shared OpenClaw provider key', async () => {
  const client = fakeClient()
  await applyUnifiedModelSelection({ ...selection, providerId: 'openai_compatible', hermesProvider: 'custom' }, { target: 'hermes', client })
  assert.equal(client.calls[0][1], 'custom')
})

function fakeClient(overrides = {}) {
  const calls = []
  const current = {
    models: { providers: {} },
    agents: { defaults: { model: { primary: 'yyapi/gpt-5.4', fallbacks: ['yyapi/gpt-5.5'] } } },
    gateway: { port: 18789 },
  }
  return {
    calls,
    readOpenclawConfig: async () => current,
    writeOpenclawConfig: async (config, reload) => calls.push(['writeOpenclawConfig', config, reload]),
    reloadGateway: async () => calls.push(['reloadGateway']),
    configureHermes: async (...args) => calls.push(['configureHermes', ...args]),
    configureClaudeCodeRelay: async config => {
      calls.push(['configureClaudeCodeRelay', config])
      return { configured: true }
    },
    ...overrides,
  }
}

test('individual Hermes and Claude saves never reload the OpenClaw Gateway', async () => {
  const hermesClient = fakeClient()
  await applyUnifiedModelSelection(selection, { target: 'hermes', client: hermesClient })
  assert.deepEqual(hermesClient.calls.map(call => call[0]), ['configureHermes'])

  const claudeClient = fakeClient()
  await applyUnifiedModelSelection(selection, { target: 'claude_code', client: claudeClient })
  assert.deepEqual(claudeClient.calls.map(call => call[0]), ['configureClaudeCodeRelay'])
})

test('OpenClaw save writes a minimal patch then performs one Gateway reload', async () => {
  const client = fakeClient()
  await applyUnifiedModelSelection(selection, { target: 'openclaw', client })
  assert.deepEqual(client.calls.map(call => call[0]), ['writeOpenclawConfig', 'reloadGateway'])
  assert.equal(client.calls[0][2], false)
  assert.deepEqual(client.calls[0][1].agents.defaults.model.fallbacks, ['yyapi/gpt-5.5'])
})

test('cross-agent failure restores the prior OpenClaw configuration before reporting failure', async () => {
  const client = fakeClient({
    configureHermes: async () => { throw new Error('Hermes rejected model') },
  })
  await assert.rejects(
    applyUnifiedModelSelection(selection, { target: 'default', client }),
    /Hermes rejected model/
  )
  assert.deepEqual(client.calls.map(call => call[0]), [
    'writeOpenclawConfig',
    'writeOpenclawConfig',
    'reloadGateway',
  ])
  assert.equal(client.calls[1][1].agents.defaults.model.primary, 'yyapi/gpt-5.4')
})
