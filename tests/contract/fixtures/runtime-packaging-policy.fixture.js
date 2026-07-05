export const allowedPortableResources = [
  'resources/runtime/',
  'resources/bin/',
  'resources/templates/',
  'resources/data/ocr/ocr-config.json',
  'resources/data/.openclaw',
  'resources/data/hermes',
  'resources/data/claude-panel',
]

export const forbiddenPortablePatterns = [
  '.env',
  'relay-config.json',
  'auth.json',
  'gateway-owner.json',
  'clawpanel-device-key.json',
  '*.db',
  '*.sqlite',
  'logs',
  'sessions',
  'memories',
  'cache',
  'pid',
  'lock',
  'node_modules',
  'src-tauri/target',
  'data/',
  'uv-python/',
  'uv-tools/',
  'C:\\Users\\',
  'Documents',
  'feature-agent-runtime-orchestration-image',
  'restore-hermes',
  'superclaw-1.0.5',
  'superclaw-1.0.6',
]

export const forbiddenResourceGlobs = [
  'resources/data/**/*',
  'src-tauri/resources/data/**/*',
  'data/**/*',
  'uv-python/**/*',
  'uv-tools/**/*',
  'node_modules/**/*',
]

export const preferredPortableBuildScript = 'scripts/build-desktop-client.ps1'

export const legacyPortableScripts = [
  'scripts/package-portable.ps1',
  'scripts/package-portable-fixed.ps1',
]

export const sensitiveKeyNames = [
  'key',
  'token',
  'secret',
  'password',
  'access_token',
  'refresh_token',
  'cookie',
  'authorization',
  'relay_config',
  'minimax_key',
  'openai_key',
  'anthropic_key',
]

