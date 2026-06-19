export const FIRST_TOKEN_TIMEOUT_MS = 60_000
export const STREAM_IDLE_TIMEOUT_MS = 120_000

export function createGenerationTimeoutManager(options = {}) {
  const {
    firstTokenTimeoutMs = FIRST_TOKEN_TIMEOUT_MS,
    streamIdleTimeoutMs = STREAM_IDLE_TIMEOUT_MS,
    onFirstTokenSlow = () => {},
    onIdleTimeout = () => {},
    onClearNotice = () => {},
  } = options

  let firstTokenTimer = null
  let idleTimer = null
  let hasReceivedAnyChunk = false
  let stopped = false

  function start() {
    clear()
    stopped = false
    hasReceivedAnyChunk = false

    firstTokenTimer = setTimeout(() => {
      if (!stopped && !hasReceivedAnyChunk) {
        onFirstTokenSlow({
          message: '模型响应较慢，仍在等待中……',
        })
      }
    }, firstTokenTimeoutMs)
  }

  function markProgress() {
    if (stopped) return

    hasReceivedAnyChunk = true

    if (firstTokenTimer) {
      clearTimeout(firstTokenTimer)
      firstTokenTimer = null
    }

    onClearNotice()
    resetIdleTimer()
  }

  function markHeartbeat() {
    if (stopped) return
    resetIdleTimer()
  }

  function resetIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
    }

    idleTimer = setTimeout(() => {
      if (!stopped) {
        onIdleTimeout({
          message: '回复等待时间较长，可能仍在生成。你可以继续等待，或手动停止后重试。',
          actions: ['wait', 'stop', 'continue'],
        })
      }
    }, streamIdleTimeoutMs)
  }

  function clear() {
    if (firstTokenTimer) {
      clearTimeout(firstTokenTimer)
      firstTokenTimer = null
    }

    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }

    onClearNotice()
  }

  function stop() {
    stopped = true
    clear()
  }

  function isWaitingForFirstToken() {
    return !hasReceivedAnyChunk
  }

  return {
    start,
    markProgress,
    markHeartbeat,
    clear,
    stop,
    isWaitingForFirstToken,
  }
}
