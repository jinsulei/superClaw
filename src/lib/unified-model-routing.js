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

// MiniMax provider keys: OpenClaw stores one canonical `minimax` provider
// (the region lives in base_url), while Hermes keeps region-specific ids
// (`minimax` for International, `minimax-cn` for China) that also key the
// Hermes credential pool. Legacy variants (`minimax_cn`, `minimax-cn`,
// `minimax-portal*`) all resolve back to the canonical `minimax` on the
// OpenClaw side so a CN MiniMax key never spawns a duplicate provider record.
const MINIMAX_PROVIDER_RE = /^minimax(-cn)?(-portal)?$|^minimax_cn$/

// Hermes provider registry ids (src-tauri/src/commands/hermes_providers.rs).
// An OpenClaw provider whose id is NOT one of these is a custom OpenAI-compatible
// endpoint and must be configured in Hermes as the `custom` provider — passing
// the raw OpenClaw id (e.g. `yyapi`, `openai_compatible`) produces a
// `model.provider` value Hermes cannot resolve to a usable API key.
const HERMES_KNOWN_PROVIDER_RE = /^(anthropic|openai-api|gemini|deepseek|xai|minimax|minimax-cn|huggingface|copilot|zai|kimi-coding|alibaba|xiaomi|openrouter|ai-gateway|opencode-zen|opencode-go|kilocode|nous|openai-codex|qwen-oauth|copilot-acp|custom)$/

function canonicalOpenClawProviderId(providerId) {
  return MINIMAX_PROVIDER_RE.test(providerId) ? 'minimax' : providerId
}

function deriveHermesProvider(providerId, baseUrl) {
  if (MINIMAX_PROVIDER_RE.test(providerId)) {
    return String(baseUrl || '').includes('api.minimaxi.com') ? 'minimax-cn' : 'minimax'
  }
  return HERMES_KNOWN_PROVIDER_RE.test(providerId) ? providerId : 'custom'
}

export function normalizeModelSelection(input = {}) {
  const rawProviderId = clean(input.providerId || input.provider)
  const model = clean(input.model)
  const baseUrl = clean(input.baseUrl).replace(/\/+$/, '')
  const apiKey = clean(input.apiKey)
  const api = clean(input.api) || 'openai-completions'
  if (!rawProviderId || !model || !baseUrl) {
    throw new Error('服务商、模型和 Base URL 不能为空')
  }
  const providerId = canonicalOpenClawProviderId(rawProviderId)
  const explicitHermesProvider = clean(input.hermesProvider)
  const hermesProvider = explicitHermesProvider || deriveHermesProvider(rawProviderId, baseUrl)
  return {
    providerId,
    hermesProvider,
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

  // MiniMax web_search wiring: OpenClaw's MiniMax plugin does not reuse
  // models.providers.*.apiKey for web search. It needs its own plugin-scoped
  // credential (plugins.entries.minimax.config.webSearch.apiKey) plus an
  // explicit tools.web.search.provider, otherwise the gateway reports
  // "web_search is disabled or no provider is available."
  if (/^minimax(-cn)?(-portal)?$|^minimax_cn$/.test(selection.providerId) && selection.apiKey) {
    const region = selection.baseUrl.includes('api.minimaxi.com') ? 'cn' : 'global'
    config.plugins ||= {}
    config.plugins.allow ||= []
    if (!config.plugins.allow.includes('minimax')) config.plugins.allow.push('minimax')
    config.plugins.entries ||= {}
    config.plugins.entries.minimax ||= {}
    config.plugins.entries.minimax.enabled = true
    config.plugins.entries.minimax.config ||= {}
    config.plugins.entries.minimax.config.webSearch ||= {}
    config.plugins.entries.minimax.config.webSearch.apiKey = selection.apiKey
    config.plugins.entries.minimax.config.webSearch.region = region
    config.tools ||= {}
    config.tools.web ||= {}
    config.tools.web.search ||= {}
    config.tools.web.search.provider = 'minimax'
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
  const result = { selection, applied: [], skipped: [], deferred: [], rolledBack: false }
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
      // Persisting a shared model selection must not be reported as a Hermes or
      // Claude configuration failure merely because OpenClaw is currently
      // stopped or still starting. The saved config is picked up on its next
      // successful Gateway start.
      try {
        await client.reloadGateway()
      } catch (error) {
        result.deferred.push({
          agent: 'openclaw',
          reason: String(error?.message || error || 'gateway-reload-unavailable'),
        })
      }
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
