import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyUnifiedModelSelection,
  buildClaudeRelayProjection,
  buildOpenClawModelPatch,
  modelRef,
  normalizeModelSelection,
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

test('MiniMax CN selection canonicalizes the OpenClaw provider key and derives Hermes minimax-cn', () => {
  const normalized = normalizeModelSelection({
    providerId: 'minimax_cn',
    model: 'MiniMax-M3',
    baseUrl: 'https://api.minimaxi.com/v1',
    apiKey: 'k',
  })
  assert.equal(normalized.providerId, 'minimax')
  assert.equal(normalized.hermesProvider, 'minimax-cn')
})

test('MiniMax International selection derives Hermes minimax', () => {
  const normalized = normalizeModelSelection({
    providerId: 'minimax',
    model: 'MiniMax-M3',
    baseUrl: 'https://api.minimax.io/v1',
    apiKey: 'k',
  })
  assert.equal(normalized.providerId, 'minimax')
  assert.equal(normalized.hermesProvider, 'minimax')
})

test('explicit Hermes provider is preserved for non-MiniMax providers', () => {
  const normalized = normalizeModelSelection({
    providerId: 'openai_compatible',
    hermesProvider: 'custom',
    model: 'gpt-4',
    baseUrl: 'https://example.com/v1',
    apiKey: 'k',
  })
  assert.equal(normalized.providerId, 'openai_compatible')
  assert.equal(normalized.hermesProvider, 'custom')
})

test('unknown OpenClaw provider defaults to Hermes custom instead of the raw id', () => {
  const normalized = normalizeModelSelection({
    providerId: 'openai_compatible',
    model: 'gpt-5.6-terra',
    baseUrl: 'https://api.yaoyaolx.com.cn/v1',
    apiKey: 'k',
  })
  assert.equal(normalized.providerId, 'openai_compatible')
  assert.equal(normalized.hermesProvider, 'custom')
})

test('known Hermes provider id is kept when no explicit Hermes provider is given', () => {
  const normalized = normalizeModelSelection({
    providerId: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'k',
  })
  assert.equal(normalized.providerId, 'deepseek')
  assert.equal(normalized.hermesProvider, 'deepseek')
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

test('shared model save remains successful when the OpenClaw reload is temporarily unavailable', async () => {
  const client = fakeClient({
    reloadGateway: async () => { throw new Error('Gateway not running') },
  })
  const result = await applyUnifiedModelSelection(selection, { target: 'default', client })
  assert.deepEqual(result.applied, ['openclaw', 'hermes', 'claude_code'])
  assert.equal(result.rolledBack, false)
  assert.equal(result.deferred.length, 1)
  assert.equal(result.deferred[0].agent, 'openclaw')
  assert.match(result.deferred[0].reason, /Gateway not running/)
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
