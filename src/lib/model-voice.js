import { api } from './tauri-api.js'

let cachedConfig = null
let cachedAt = 0
const CACHE_TTL = 15000

export async function loadModelVoiceConfig({ force = false } = {}) {
  if (!force && cachedConfig && Date.now() - cachedAt < CACHE_TTL) return cachedConfig
  try {
    cachedConfig = await api.hermesVoiceConfigRead()
  } catch {
    cachedConfig = null
  }
  cachedAt = Date.now()
  return cachedConfig
}

export function clearModelVoiceConfigCache() {
  cachedConfig = null
  cachedAt = 0
}

export function modelVoiceInputReady(config = cachedConfig) {
  return !!config?.inputReady
}

export function modelVoiceOutputReady(config = cachedConfig) {
  return !!config?.outputReady
}

export async function transcribeWithModelVoice(payload) {
  const config = await loadModelVoiceConfig()
  if (!modelVoiceInputReady(config)) return null
  return api.hermesVoiceTranscribe(payload)
}

export async function synthesizeWithModelVoice(payload) {
  const config = await loadModelVoiceConfig()
  if (!modelVoiceOutputReady(config)) return null
  return api.hermesVoiceSynthesize(payload)
}
