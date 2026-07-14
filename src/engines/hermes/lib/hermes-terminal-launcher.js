export const HERMES_TERMINAL_UNAVAILABLE_MESSAGE =
  'Hermes 原生终端暂不可用，请检查便携运行时是否完整。'

function notifyUser(notify, message, type) {
  if (typeof notify === 'function') notify(message, type)
}

export async function openHermesTerminalLauncher({ launch, notify } = {}) {
  if (typeof launch !== 'function') {
    notifyUser(notify, HERMES_TERMINAL_UNAVAILABLE_MESSAGE, 'info')
    return {
      ok: false,
      reason: 'launcher_unavailable',
      message: HERMES_TERMINAL_UNAVAILABLE_MESSAGE,
    }
  }

  try {
    const result = await launch()
    return {
      ok: result?.ok !== false,
      reason: 'opened',
      result,
    }
  } catch (error) {
    const message = String(error?.message || error || HERMES_TERMINAL_UNAVAILABLE_MESSAGE)
    notifyUser(notify, message, 'error')
    return {
      ok: false,
      reason: 'launch_failed',
      message,
    }
  }
}
