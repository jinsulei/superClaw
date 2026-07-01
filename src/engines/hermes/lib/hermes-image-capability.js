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
