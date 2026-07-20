import { api } from './tauri-api.js'

const AGENTS = new Set(['hermes', 'openclaw', 'claude_code'])

function clean(value) {
  return String(value || '').trim()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

export function modelRef(providerId, model) {
  const provider = clean(providerId)
  const modelId = clean(model)
  return provider && modelId ? `${provider}/${modelId}` : ''
}

export function normalizeModelSelection(input = {}) {
  const providerId = clean(input.providerId || input.provider)
  const model = clean(input.model)
  const baseUrl = clean(input.baseUrl).replace(/\/+$/, '')
  const apiKey = clean(input.apiKey)
  const api = clean(input.api) || 'openai-completions'
  if (!providerId || !model || !baseUrl) {
    throw new Error('服务商、模型和 Base URL 不能为空')
  }
  return {
    providerId,
    hermesProvider: clean(input.hermesProvider) || providerId,
    model,
    baseUrl,
    api,
    apiKey,
    name: clean(input.name) || providerId,
    models: Array.isArray(input.models) ? input.models : [],
  }
}

function normalizeProviderModels(selection, previous = {}) {
  const existing = Array.isArray(previous.models) ? previous.models : []
  const supplied = selection.models.filter(Boolean)
  const models = supplied.length ? supplied : existing
  if (models.some(item => (typeof item === 'string' ? item : item?.id) === selection.model)) return models
  return [...models, { id: selection.model, name: selection.model, input: ['text', 'image'] }]
}

/**
 * Update only a selected provider and, optionally, OpenClaw's normal chat model.
 * Media routes deliberately never touch fallbacks: OpenClaw treats fallbacks as
 * automatic chat failover candidates.
 */
export function buildOpenClawModelPatch(currentConfig, input, options = {}) {
  const selection = normalizeModelSelection(input)
  const config = clone(currentConfig)
  const applyChatModel = options.applyChatModel !== false
  const reference = modelRef(selection.providerId, selection.model)

  config.models ||= {}
  config.models.providers ||= {}
  const previousProvider = config.models.providers[selection.providerId] || {}
  const provider = {
    ...previousProvider,
    baseUrl: selection.baseUrl,
    api: selection.api,
    models: normalizeProviderModels(selection, previousProvider),
  }
  if (selection.apiKey) provider.apiKey = selection.apiKey
  config.models.providers[selection.providerId] = provider

  if (applyChatModel) {
    config.agents ||= {}
    config.agents.defaults ||= {}
    config.agents.defaults.model ||= {}
    config.agents.defaults.model.primary = reference
    // Keep the existing fallback chain exactly as the user configured it.
    if (!Array.isArray(config.agents.defaults.model.fallbacks)) {
      config.agents.defaults.model.fallbacks = []
    }
    config.agents.defaults.models ||= {}
    config.agents.defaults.models[reference] ||= {}
  }

  return { config, selection, reference }
}

export function buildClaudeRelayProjection(input) {
  const selection = normalizeModelSelection(input)
  return {
    enabled: true,
    interfaceType: 'relay',
    name: selection.name,
    provider: selection.api === 'anthropic-messages' ? 'anthropic' : 'openai-compatible',
    defaultProvider: selection.providerId,
    baseUrl: selection.baseUrl,
    apiKey: selection.apiKey,
    model: selection.model,
    models: [selection.model],
    branchModels: [selection.model],
    managedBy: 'superclaw-unified-model-routing',
  }
}

function targetAgents(target) {
  if (target === 'default') return ['hermes', 'openclaw', 'claude_code']
  if (!AGENTS.has(target)) throw new Error('未知的 Agent 配置目标')
  return [target]
}

/**
 * Apply a model selection without crossing an individual Agent override.
 * Callers use target="default" only for the explicit Hermes “set defaults” action.
 */
export async function applyUnifiedModelSelection(input, options = {}) {
  const target = options.target || 'default'
  const client = options.client || api
  const selectedAgents = targetAgents(target)
  const selection = normalizeModelSelection(input)
  const result = { selection, applied: [], skipped: [], rolledBack: false }
  let previousOpenClaw = null

  try {
    if (selectedAgents.includes('openclaw')) {
      previousOpenClaw = await client.readOpenclawConfig()
      const patch = buildOpenClawModelPatch(previousOpenClaw, selection)
      // Do not queue a restart until the complete cross-agent apply succeeds.
      await client.writeOpenclawConfig(patch.config, false)
      result.applied.push('openclaw')
    }

    if (selectedAgents.includes('hermes')) {
      await client.configureHermes(selection.hermesProvider, selection.apiKey, selection.model, selection.baseUrl)
      result.applied.push('hermes')
    }

    if (selectedAgents.includes('claude_code')) {
      const relay = buildClaudeRelayProjection(selection)
      const relayResult = await client.configureClaudeCodeRelay({ ...relay, force: options.forceClaudeRelay === true })
      if (relayResult?.configured === false) {
        result.skipped.push({ agent: 'claude_code', reason: relayResult.reason || 'relay-not-updated' })
      } else {
        result.applied.push('claude_code')
      }
    }

    if (selectedAgents.includes('openclaw')) {
      await client.reloadGateway()
    }
    return result
  } catch (error) {
    if (previousOpenClaw) {
      try {
        await client.writeOpenclawConfig(previousOpenClaw, false)
        await client.reloadGateway()
        result.rolledBack = true
      } catch (rollbackError) {
        console.error('[unified-model-routing] OpenClaw rollback failed', rollbackError)
      }
    }
    error.modelRoutingResult = result
    throw error
  }
}
