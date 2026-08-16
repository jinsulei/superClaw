import { api, isTauriRuntime } from './tauri-api.js'

const MODE_KEY = 'superclaw_usb_binding_mode'
const ENDPOINT_KEY = 'superclaw_license_activate_endpoint'
const LAST_CONTEXT_KEY = 'superclaw_last_usb_binding_context'

const MODES = new Set(['off', 'observe', 'enforce'])

export function getUsbBindingMode() {
  const mode = localStorage.getItem(MODE_KEY) || 'off'
  return MODES.has(mode) ? mode : 'off'
}

export function getLicenseActivateEndpoint() {
  return localStorage.getItem(ENDPOINT_KEY) === 'v2' ? 'v2' : 'v1'
}

export async function prepareActivationBinding() {
  const mode = getUsbBindingMode()
  if (mode === 'off') {
    return { mode, context: null, options: {} }
  }

  const context = await readUsbContext()
  persistLastContext({ mode, context, recordedAt: new Date().toISOString() })

  if (mode === 'enforce' && !context.enforcementReady) {
    const reason = context.isRemovable === false
      ? '当前程序没有运行在U盘中，请从交付U盘内启动后再激活。'
      : '当前设备无法读取U盘序列号，暂不能完成绑定激活。'
    return { mode, context, blockingError: reason, options: {} }
  }

  const useV2License = mode === 'enforce' && getLicenseActivateEndpoint() === 'v2'
  return {
    mode,
    context,
    options: useV2License ? { endpoint: 'v2', usb: context } : {},
  }
}

async function readUsbContext() {
  if (!isTauriRuntime()) {
    return {
      platform: 'web',
      available: false,
      enforcementReady: false,
      isRemovable: false,
      reason: 'Web 调试模式无法读取U盘序列号。',
    }
  }
  return api.getUsbBindingContext()
}

function persistLastContext(payload) {
  try {
    localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify(payload))
  } catch {
    // localStorage may be unavailable in restricted webviews.
  }
}
