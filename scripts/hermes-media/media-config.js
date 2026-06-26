import path from 'path'

export const IMAGE_API_KEY_MISSING_CODE = 'IMAGE_API_KEY_NOT_CONFIGURED'
export const IMAGE_API_KEY_MISSING_MESSAGE = '尚未配置图片模型 API Key'

function clean(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeBaseUrl(value) {
  return clean(value, 'https://api.openai.com/v1').replace(/\/+$/, '')
}

function resolveWorkspaceDir(rootDir, env) {
  const raw = clean(env.HERMES_WORKSPACE_DIR, 'workspace')
  return path.isAbsolute(raw) ? raw : path.join(rootDir, raw)
}

export function getHermesMediaConfig({ rootDir = process.cwd(), env = process.env } = {}) {
  const workspaceDir = resolveWorkspaceDir(rootDir, env)
  const apiKey = clean(env.IMAGE_API_KEY)
  const outputFormat = clean(env.IMAGE_OUTPUT_FORMAT, 'png').replace(/^\.+/, '').toLowerCase() || 'png'

  return {
    provider: clean(env.IMAGE_PROVIDER, 'openai'),
    baseUrl: normalizeBaseUrl(env.IMAGE_BASE_URL),
    apiKey,
    hasApiKey: !!apiKey,
    model: clean(env.IMAGE_MODEL, 'gpt-image-2'),
    defaultSize: clean(env.IMAGE_DEFAULT_SIZE, '1024x1536'),
    defaultQuality: clean(env.IMAGE_DEFAULT_QUALITY, 'high'),
    outputFormat,
    workspaceDir,
    mediaDir: path.join(workspaceDir, 'hermes-media'),
  }
}

export function publicHermesMediaCapabilities(config = getHermesMediaConfig()) {
  return {
    ok: true,
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    defaultSize: config.defaultSize,
    defaultQuality: config.defaultQuality,
    outputFormat: config.outputFormat,
    configured: !!config.hasApiKey,
    hasApiKey: !!config.hasApiKey,
    workspaceDir: config.workspaceDir,
    supports: {
      upload: true,
      textToImage: true,
      imageToImage: true,
      localFileRoute: true,
    },
    missingKeyMessage: config.hasApiKey ? '' : IMAGE_API_KEY_MISSING_MESSAGE,
  }
}
