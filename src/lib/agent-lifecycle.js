import { isTauriRuntime } from './tauri-api.js'

async function resolveInvoke() {
  if (!isTauriRuntime()) return null
  if (window.__TAURI__?.core?.invoke) return window.__TAURI__.core.invoke
  if (window.__TAURI__?.tauri?.invoke) return window.__TAURI__.tauri.invoke
  if (window.__TAURI_INTERNALS__?.invoke) return window.__TAURI_INTERNALS__.invoke
  try {
    const mod = await import('@tauri-apps/api/core')
    return mod.invoke
  } catch {
    return null
  }
}

async function stopAgentViaDevApi(agentName) {
  const body = JSON.stringify({ agent: agentName })
  const url = '/__api/dev/agents/stop'
  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    if (ok) return
  }
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  })
}

async function stopAllAgentsViaDevApi() {
  const url = '/__api/dev/agents/stop-all'
  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(url, new Blob(['{}'], { type: 'application/json' }))
    if (ok) return
  }
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    keepalive: true,
  })
}

export async function stopAgentOnPageClose(agentName) {
  try {
    const invoke = await resolveInvoke()
    if (!invoke) {
      await stopAgentViaDevApi(agentName)
      return
    }
    await invoke('stop_agent', { agent: agentName })
  } catch (error) {
    console.warn('[agent-lifecycle] stop_agent failed', agentName, error)
  }
}

export async function stopAllAgentsOnAppExit() {
  try {
    const invoke = await resolveInvoke()
    if (!invoke) {
      await stopAllAgentsViaDevApi()
      return
    }
    await invoke('stop_all_agents')
  } catch (error) {
    console.warn('[agent-lifecycle] stop_all_agents failed', error)
  }
}
