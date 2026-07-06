function clean(value) {
  return String(value || '').trim()
}

function lower(value) {
  return clean(value).toLowerCase()
}

function arrayIncludesImage(values) {
  return Array.isArray(values) && values.some((item) => /^(image|vision|图片|图像)$/i.test(clean(item)))
}

function truthyCapability(value) {
  if (value === true) return true
  if (!value || typeof value !== 'object') return false
  return value.available === true || value.enabled === true || value.ready === true || value.supported === true
}

function findProvider(providers = [], providerId = '') {
  const id = lower(providerId)
  return (Array.isArray(providers) ? providers : []).find((provider) => lower(provider?.id || provider?.provider || provider?.name) === id) || null
}

function findModelEntry(provider = {}, modelId = '') {
  const target = lower(modelId)
  const models = Array.isArray(provider?.models) ? provider.models : []
  return models.find((item) => {
    const id = typeof item === 'string' ? item : (item?.id || item?.model || item?.name)
    return lower(id) === target
  }) || null
}

function modelCapabilities(modelEntry = null) {
  const entry = typeof modelEntry === 'string' ? { id: modelEntry } : (modelEntry || {})
  const caps = entry.capabilities || entry.capability || {}
  const input = entry.input || entry.inputs || entry.modalities || entry.supportedInputs || []
  const output = entry.output || entry.outputs || entry.outputModalities || entry.supportedOutputs || []
  const tools = entry.tools || entry.features || []

  return {
    chat: truthyCapability(caps.chat) || lower(entry.type || entry.mode).includes('chat') || true,
    vision:
      truthyCapability(caps.vision)
      || truthyCapability(caps.image_understanding)
      || arrayIncludesImage(input)
      || arrayIncludesImage(entry.inputModalities),
    image_generation:
      truthyCapability(caps.image_generation)
      || truthyCapability(caps.imageGeneration)
      || truthyCapability(caps.text_to_image)
      || arrayIncludesImage(output)
      || (Array.isArray(tools) && tools.some((item) => /image[_-]?generation|text[_-]?to[_-]?image/i.test(clean(item)))),
    image_edit:
      truthyCapability(caps.image_edit)
      || truthyCapability(caps.imageEdit)
      || truthyCapability(caps.image_to_image)
      || (Array.isArray(tools) && tools.some((item) => /image[_-]?edit|image[_-]?to[_-]?image|img2img/i.test(clean(item)))),
  }
}

function flattenSkills(skills = []) {
  const list = Array.isArray(skills?.value) ? skills.value : Array.isArray(skills) ? skills : []
  const flat = []
  for (const item of list) {
    if (Array.isArray(item?.skills)) flat.push(...item.skills)
    else flat.push(item)
  }
  return flat
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return [value]
}

function stableGenerationState(value, fallback = 'planned') {
  const state = lower(value || fallback)
  if (['implemented', 'partial', 'planned', 'reserved', 'unknown'].includes(state)) return state
  return fallback
}

function nonExecutableGenerationState(value, fallback = 'planned') {
  const state = stableGenerationState(value, fallback)
  if (state === 'implemented' || state === 'partial') return fallback
  return state
}

function generationCapabilityState({ supported = false, configured = false, executable = false, fallback = 'planned' } = {}) {
  if (!supported) return stableGenerationState(fallback)
  if (executable) return 'partial'
  return configured ? 'partial' : stableGenerationState(fallback)
}

function isUnsafeGenerationPath(value) {
  const text = clean(value)
  if (!text) return false
  return /^[a-z]:[\\/]/i.test(text)
    || /^\\\\/.test(text)
    || /^\//.test(text)
    || /^file:/i.test(text)
    || /(?:^|[\\/])(?:runtime[\\/]data[\\/]secrets|src-tauri[\\/]resources[\\/]data[\\/]secrets|node_modules|src-tauri[\\/]target)(?:[\\/]|$)/i.test(text)
    || /(?:^|[\\/])(?:\.env|relay-config\.json)(?:$|[\\/])/i.test(text)
    || /fake[-_\s]?generated|generated[-_\s]?fake|exported/i.test(text)
}

function sanitizeGenerationPath(value) {
  const text = clean(value)
  if (!text) return null
  if (isUnsafeGenerationPath(text)) return null
  return text
}

export function normalizeGenerationModelCapability(input = {}) {
  const status = input.capabilities || input.status || input
  const caps = status.capabilities || input.model_capabilities || {}
  const provider = clean(input.provider || status.provider)
  const model = clean(input.model || input.model_id || status.model)
  const endpointCallable = status.endpointCallable === true || input.endpoint_callable === true
  const modelConfigured = status.modelConfigured === true || Boolean(provider && model)
  const textToImageSupported = caps.image_generation === true || caps.text_to_image === true

  return {
    provider,
    model,
    model_id: model,
    adapter_name: clean(input.adapter_name || input.adapter || 'hermes_image_capability_wrapper'),
    capabilities: {
      text_to_image: generationCapabilityState({
        supported: textToImageSupported,
        configured: modelConfigured,
        executable: endpointCallable && textToImageSupported,
        fallback: 'partial',
      }),
      image_to_image: nonExecutableGenerationState(input.image_to_image_state, 'planned'),
      image_to_video: nonExecutableGenerationState(input.image_to_video_state, 'planned'),
      ppt: nonExecutableGenerationState(input.ppt_state, 'planned'),
    },
    executable: {
      text_to_image: endpointCallable && textToImageSupported,
      image_to_image: false,
      image_to_video: false,
      ppt: false,
    },
    notes: [
      'Model Adapter boundary only; this helper does not execute generation.',
      'image_to_image, image_to_video, and ppt stay non-executable until dedicated contracts exist.',
    ],
  }
}

export function normalizeGenerationPrompt(input = {}) {
  return {
    task_id: clean(input.task_id || input.taskId),
    goal: clean(input.goal || input.hermes_goal || input.prompt),
    style: clean(input.style),
    output_type: clean(input.output_type || input.outputType || 'text_to_image'),
    aspect_ratio: clean(input.aspect_ratio || input.aspectRatio),
    page_count: Number.isFinite(Number(input.page_count || input.pageCount)) ? Number(input.page_count || input.pageCount) : null,
    input_assets: asArray(input.input_assets || input.inputAssets).map((asset) => ({
      asset_id: clean(asset?.asset_id || asset?.id),
      kind: clean(asset?.kind || asset?.type),
      source: clean(asset?.source || 'user'),
      path: sanitizeGenerationPath(asset?.path),
    })),
    acceptance_criteria: asArray(input.acceptance_criteria || input.acceptanceCriteria).map(clean).filter(Boolean),
    model_id: clean(input.model_id || input.modelId || input.model),
    provider: clean(input.provider),
    forbidden_actions: asArray(input.forbidden_actions || input.forbiddenActions).map(clean).filter(Boolean),
    adapter_policy: {
      preserve_hermes_instruction: true,
      openclaw_memory_must_not_replace_instruction: true,
      no_parallel_generation_runner: true,
    },
  }
}

export function normalizeGenerationResult(input = {}) {
  const status = stableGenerationState(input.status, 'planned')
  const artifacts = asArray(input.artifacts).map((artifact) => {
    const uri = sanitizeGenerationPath(artifact?.uri)
    if (!uri) return null
    return {
      artifact_id: clean(artifact?.artifact_id || artifact?.id),
      kind: clean(artifact?.kind || artifact?.type),
      uri,
      summary: clean(artifact?.summary || artifact?.title),
    }
  }).filter(Boolean)

  return {
    task_id: clean(input.task_id || input.taskId),
    status: status === 'implemented' ? 'planned' : status,
    artifacts,
    task_events: asArray(input.task_events || input.taskEvents),
    tool_runs: asArray(input.tool_runs || input.toolRuns),
    acceptance_summary: input.acceptance_summary || input.acceptanceSummary || {
      status: 'not_evaluated',
      reason: 'Generation acceptance has not been evaluated yet.',
    },
  }
}

export function isHermesImageCapabilityQuestion(text = '') {
  const s = clean(text)
  if (!s) return false
  return /(?:能不能|可以|支持|会不会|有没有|是否).{0,12}(?:文生图|图生图|识图|看图|读图|图片生成|生成图片|图片编辑|改图|图像生成|图像编辑|vision|image generation|image edit)|(?:文生图|图生图|识图|图片生成|生成图片|图片编辑|改图).{0,12}(?:能力|可用|支持|能用|能不能)/i.test(s)
}

export function buildHermesImageCapabilityStatus({
  effectiveModelConfig = {},
  hermesConfig = {},
  providers = [],
  skills = [],
  env = {},
  imageProviderAdapters = [],
} = {}) {
  const provider = clean(effectiveModelConfig.provider || hermesConfig.provider || hermesConfig.model?.provider)
  const model = clean(effectiveModelConfig.model || hermesConfig.model || hermesConfig.model_raw || hermesConfig.model?.default)
  const providerEntry = findProvider(providers, provider)
  const modelEntry = findModelEntry(providerEntry, model)
  const capabilities = modelCapabilities(modelEntry || { id: model })
  const skillInstalled = flattenSkills(skills).some((skill) => {
    const scope = [
      skill?.slug,
      skill?.name,
      skill?.file,
      skill?.category,
      skill?.path,
      skill?.description,
    ].map(clean).join('\n')
    return /image|图片|图像|文生图|图生图|minimax-image-generation/i.test(scope)
  })
  const modelConfigured = Boolean(provider && model && (effectiveModelConfig.status === 'ready' || hermesConfig.config_exists !== false))
  const rawImageKey = clean(env.IMAGE_API_KEY || env.OPENAI_IMAGE_API_KEY || env.MINIMAX_IMAGE_API_KEY)
  const equivalentImageKey = clean(env.MINIMAX_API_KEY || env.MINIMAX_CN_API_KEY || env.OPENAI_API_KEY || hermesConfig.api_key)
  const apiKeyConfigured = Boolean(rawImageKey || equivalentImageKey || effectiveModelConfig.apiKeyConfigured)
  const adapterNames = [
    ...imageProviderAdapters,
    providerEntry?.imageAdapter,
    providerEntry?.adapter,
    providerEntry?.imageProvider,
    providerEntry?.endpoints?.image_generation,
    providerEntry?.endpoints?.image_edit,
  ].map(clean).filter(Boolean)
  const imageProviderAdapter = adapterNames.some((name) => /image|vision|generation|edit|minimax/i.test(name))
    || Boolean(
      providerEntry
      && (
        truthyCapability(providerEntry.capabilities?.image_generation)
        || truthyCapability(providerEntry.capabilities?.image_edit)
        || truthyCapability(providerEntry.capabilities?.vision)
      )
    )
  const endpointCallable = Boolean(
    modelConfigured
    && apiKeyConfigured
    && imageProviderAdapter
    && (capabilities.vision || capabilities.image_generation || capabilities.image_edit)
  )
  const capabilityReady = Boolean(endpointCallable)

  return {
    provider,
    model,
    skillInstalled,
    modelConfigured,
    apiKeyConfigured,
    endpointCallable,
    capabilityReady,
    imageProviderAdapter,
    capabilities,
  }
}

export function formatHermesImageCapabilityReply(status = {}) {
  const ready = status.capabilityReady === true
  const caps = status.capabilities || {}
  const support = [
    `识图=${caps.vision && status.endpointCallable ? '可用' : '不可用'}`,
    `文生图=${caps.image_generation && status.endpointCallable ? '可用' : '不可用'}`,
    `图生图=${caps.image_edit && status.endpointCallable ? '可用' : '不可用'}`,
  ].join('，')

  const lines = [
    ready ? '图片能力检查：当前可用。' : '图片能力检查：暂未就绪。',
    `skillInstalled：${status.skillInstalled ? '是' : '否'}`,
    `modelConfigured：${status.modelConfigured ? '是' : '否'}${status.provider || status.model ? `（${[status.provider, status.model].filter(Boolean).join(' / ')}）` : ''}`,
    `apiKeyConfigured：${status.apiKeyConfigured ? '是' : '否'}`,
    `endpointCallable：${status.endpointCallable ? '是' : '否'}`,
    `capabilityReady：${status.capabilityReady ? '是' : '否'}`,
    support,
  ]

  if (!ready && status.skillInstalled && (!status.modelConfigured || !status.apiKeyConfigured || !status.endpointCallable)) {
    lines.push('已安装图像生成 skill，但当前没有检测到可调用的图片模型/API Key，所以暂时不能真实出图。')
  } else if (!ready) {
    lines.push('当前没有检测到可调用的图片模型端点。请先配置支持图片能力的 provider、模型和对应 Key。')
  }

  return lines.join('\n')
}

export function formatHermesImageCapabilityReadFailureReply() {
  return '暂时无法读取图片能力配置。你仍可以继续普通聊天；如需文生图或图生图，请检查图片模型和 API Key 配置。'
}
