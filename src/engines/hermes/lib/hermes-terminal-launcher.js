export const HERMES_TERMINAL_GATEWAY_NOT_READY_MESSAGE =
  'Hermes Gateway 尚未就绪，请先启动 Gateway。'

export const HERMES_TERMINAL_UNAVAILABLE_MESSAGE =
  'Hermes 终端对话暂不可用，当前只支持普通聊天。'

function statusText(value) {
  return String(value || '').trim().toLowerCase()
}

function hasReadyFlag(value) {
  if (!value || typeof value !== 'object') return false
  if (value.gatewayRunning === true) return true
  if (value.running === true) return true
  if (value.ready === true) return true
  if (value.live === true) return true
  if (value.ok === true) return true
  const status = statusText(value.status || value.state || value.health)
  return status === 'ready' || status === 'running' || status === 'live' || status === 'ok'
}

export function isHermesGatewayReadyForTerminal({ info, health } = {}) {
  return hasReadyFlag(info) || hasReadyFlag(health)
}

function notifyUser(notify, message, type) {
  if (typeof notify === 'function') {
    notify(message, type)
  }
}

export function openHermesTerminalLauncher({
  info,
  health,
  route = null,
  navigate,
  notify,
} = {}) {
  if (!isHermesGatewayReadyForTerminal({ info, health })) {
    notifyUser(notify, HERMES_TERMINAL_GATEWAY_NOT_READY_MESSAGE, 'warning')
    return {
      ok: false,
      reason: 'gateway_not_ready',
      message: HERMES_TERMINAL_GATEWAY_NOT_READY_MESSAGE,
    }
  }

  if (!route) {
    notifyUser(notify, HERMES_TERMINAL_UNAVAILABLE_MESSAGE, 'info')
    return {
      ok: false,
      reason: 'terminal_unavailable',
      message: HERMES_TERMINAL_UNAVAILABLE_MESSAGE,
    }
  }

  if (typeof navigate !== 'function') {
    notifyUser(notify, HERMES_TERMINAL_UNAVAILABLE_MESSAGE, 'info')
    return {
      ok: false,
      reason: 'navigate_unavailable',
      message: HERMES_TERMINAL_UNAVAILABLE_MESSAGE,
    }
  }

  navigate(route)
  return {
    ok: true,
    reason: 'opened',
    route,
  }
}
