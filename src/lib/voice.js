function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isVoiceInputSupported() {
  return !!getSpeechRecognitionCtor()
}

export function isSpeechPlaybackSupported() {
  return typeof window !== 'undefined'
    && !!window.speechSynthesis
    && typeof window.SpeechSynthesisUtterance === 'function'
}

export const DEFAULT_SPEECH_LANG = 'zh-CN'
export const DEFAULT_SPEECH_RATE = 1

export function normalizeSpeechLang(lang) {
  const value = String(lang || '').trim()
  if (!value) return DEFAULT_SPEECH_LANG
  if (/^zh/i.test(value)) return 'zh-CN'
  return value
}

export function pickChineseVoice(voices = null) {
  if (!isSpeechPlaybackSupported()) return null
  const list = Array.isArray(voices) ? voices : (window.speechSynthesis.getVoices?.() || [])
  if (!list.length) return null
  return list.find(voice => /^zh[-_]?CN$/i.test(voice.lang || ''))
    || list.find(voice => /^zh/i.test(voice.lang || ''))
    || list.find(voice => /Chinese|Mandarin|普通话|中文|中国/i.test(`${voice.name || ''} ${voice.lang || ''}`))
    || null
}

export function sanitizeSpeechPlaybackText(text) {
  const source = String(text || '').replace(/\r\n/g, '\n')
  if (!source.trim()) return ''
  const out = []
  let inFence = false
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()
    if (/^```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (!line) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      continue
    }
    if (/^(the user is asking me|let me think|i need to|we need to|tool_call|tool call|stdout|stderr|traceback|debug:|system:|assistant:)/i.test(line)) continue
    if (/^\[?TOOL_CALL\]?/i.test(line)) continue
    if (/^(powershell|cmd|bash|sh|node|python)\s+/i.test(line)) continue
    out.push(rawLine)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function requestMicrophoneAccess() {
  if (!navigator.mediaDevices?.getUserMedia) return null
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  return stream
}

function stopStream(stream) {
  try {
    stream?.getTracks?.().forEach(track => track.stop())
  } catch {}
}

function recorderMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/wav',
  ]
  if (typeof window === 'undefined' || typeof window.MediaRecorder !== 'function') return ''
  return candidates.find(type => {
    try { return window.MediaRecorder.isTypeSupported(type) } catch { return false }
  }) || ''
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio blob'))
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',').pop() : result)
    }
    reader.readAsDataURL(blob)
  })
}

export function createVoiceInputController(options = {}) {
  const {
    button,
    getLanguage,
    transcribeAudio,
    useModelInput,
    onInterimText,
    onFinalText,
    onStateChange,
    onUnsupported,
    onError,
  } = options

  let recognition = null
  let recorder = null
  let stream = null
  let audioChunks = []
  let state = 'idle'
  let finalTranscript = ''
  let interimTranscript = ''

  function setState(next, detail = null) {
    state = next
    onStateChange?.(next, detail)
  }

  function cleanupRecognition() {
    if (recognition) {
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.onnomatch = null
      recognition = null
    }
    stopStream(stream)
    stream = null
  }

  function cleanupRecorder() {
    if (recorder) {
      recorder.onstart = null
      recorder.ondataavailable = null
      recorder.onerror = null
      recorder.onstop = null
      recorder = null
    }
    audioChunks = []
    stopStream(stream)
    stream = null
  }

  async function startModelRecording() {
    if (typeof transcribeAudio !== 'function') return false
    if (typeof useModelInput === 'function' && !useModelInput()) return false
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') return false
    if (state === 'requesting' || state === 'recording') return true

    finalTranscript = ''
    interimTranscript = ''
    audioChunks = []
    setState('requesting')

    try {
      stream = await requestMicrophoneAccess()
      const preferredType = recorderMimeType()
      recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined)

      recorder.onstart = () => {
        setState('recording')
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunks.push(event.data)
      }

      recorder.onerror = (event) => {
        const code = event?.error?.message || event?.error?.name || 'recorder-error'
        cleanupRecorder()
        setState('error', code)
        onError?.(code)
      }

      recorder.onstop = async () => {
        const chunks = audioChunks.slice()
        const mimeType = recorder?.mimeType || preferredType || 'audio/webm'
        cleanupRecorder()
        setState('requesting', 'transcribing')
        try {
          if (!chunks.length) {
            setState('idle')
            onError?.('no-speech')
            return
          }
          const blob = new Blob(chunks, { type: mimeType })
          const audioBase64 = await blobToBase64(blob)
          const result = await transcribeAudio({
            audioBase64,
            mimeType: blob.type || mimeType,
            language: getLanguage?.() || navigator.language || 'zh-CN',
          })
          const finalText = String(result?.text ?? result ?? '').trim()
          setState('idle')
          if (finalText) onFinalText?.(finalText)
          else onError?.('no-speech')
        } catch (error) {
          const code = error?.message || 'model-transcribe-failed'
          setState('error', code)
          onError?.(code)
        }
      }

      recorder.start()
      return true
    } catch (error) {
      cleanupRecorder()
      const code = error?.name === 'NotAllowedError' ? 'not-allowed' : (error?.message || 'unknown')
      setState(code === 'not-allowed' ? 'denied' : 'error', code)
      onError?.(code)
      return true
    }
  }

  async function start() {
    if (await startModelRecording()) return

    const RecognitionCtor = getSpeechRecognitionCtor()
    if (!RecognitionCtor) {
      setState('unsupported')
      onUnsupported?.()
      return
    }
    if (state === 'requesting' || state === 'recording') return

    finalTranscript = ''
    interimTranscript = ''
    setState('requesting')

    try {
      stream = await requestMicrophoneAccess()
      recognition = new RecognitionCtor()
      recognition.lang = getLanguage?.() || navigator.language || 'zh-CN'
      recognition.interimResults = true
      recognition.continuous = true
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setState('recording')
      }

      recognition.onresult = (event) => {
        let nextFinal = finalTranscript
        let nextInterim = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i]?.[0]?.transcript || ''
          if (event.results[i].isFinal) nextFinal += transcript
          else nextInterim += transcript
        }
        finalTranscript = nextFinal
        interimTranscript = nextInterim
        onInterimText?.((finalTranscript + interimTranscript).trim(), {
          finalTranscript: finalTranscript.trim(),
          interimTranscript: interimTranscript.trim(),
        })
      }

      recognition.onerror = (event) => {
        const code = event?.error || 'unknown'
        cleanupRecognition()
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setState('denied', code)
        } else {
          setState('error', code)
        }
        onError?.(code)
      }

      recognition.onnomatch = () => {
        onError?.('no-speech')
      }

      recognition.onend = () => {
        const finalText = finalTranscript.trim()
        cleanupRecognition()
        setState('idle')
        if (finalText) onFinalText?.(finalText)
        else onError?.('no-speech')
      }

      recognition.start()
    } catch (error) {
      cleanupRecognition()
      const code = error?.name === 'NotAllowedError' ? 'not-allowed' : (error?.message || 'unknown')
      setState(code === 'not-allowed' ? 'denied' : 'error', code)
      onError?.(code)
    }
  }

  function stop() {
    if (recorder && (state === 'requesting' || state === 'recording')) {
      setState('stopping')
      try {
        recorder.stop()
        return
      } catch {}
    }
    if (recognition && (state === 'requesting' || state === 'recording')) {
      setState('stopping')
      try {
        recognition.stop()
        return
      } catch {}
    }
    cleanupRecognition()
    cleanupRecorder()
    setState('idle')
  }

  function toggle() {
    if (state === 'requesting' || state === 'recording') stop()
    else start()
  }

  function destroy() {
    if (button) button.removeEventListener('click', toggle)
    stop()
    cleanupRecognition()
  }

  if (button) button.addEventListener('click', toggle)

  return {
    start,
    stop,
    toggle,
    destroy,
    getState: () => state,
  }
}

export function createSpeechPlaybackController({ onStateChange, onProgress, synthesizeAudio, rate = DEFAULT_SPEECH_RATE } = {}) {
  let activeKey = null
  let activeText = ''
  let activeLang = ''
  let activeAudio = null
  let activeObjectUrl = ''
  let activeUtterance = null
  let activeCharIndex = 0
  let activeSpeechOffset = 0
  let speechTimer = null
  let speechToken = 0
  let speechRate = normalizeSpeechRate(rate)

  function normalizeSpeechRate(value) {
    const next = Number(value)
    if (!Number.isFinite(next)) return 1
    return Math.min(2, Math.max(0.75, next))
  }

  function setState(nextKey) {
    activeKey = nextKey
    onStateChange?.(activeKey)
  }

  function clearSpeechTimer() {
    if (speechTimer) clearInterval(speechTimer)
    speechTimer = null
  }

  function emitProgress(progress, extra = {}) {
    onProgress?.({
      key: activeKey,
      progress: Math.max(0, Math.min(100, Math.round(progress || 0))),
      rate: speechRate,
      ...extra,
    })
  }

  function stop(options = {}) {
    const previousKey = activeKey
    if (activeAudio) {
      try {
        activeAudio.pause()
        activeAudio.removeAttribute('src')
        activeAudio.load?.()
      } catch {}
      activeAudio = null
    }
    activeUtterance = null
    clearSpeechTimer()
    if (activeObjectUrl) {
      try { URL.revokeObjectURL(activeObjectUrl) } catch {}
      activeObjectUrl = ''
    }
    if (isSpeechPlaybackSupported()) {
      try { window.speechSynthesis.cancel() } catch {}
    }
    activeText = ''
    activeLang = ''
    activeCharIndex = 0
    activeSpeechOffset = 0
    if (options.finalProgress) onProgress?.({ key: previousKey, progress: 100, rate: speechRate, done: true })
    else onProgress?.({ key: previousKey, progress: 0, rate: speechRate, cancelled: true })
    setState(null)
  }

  function estimateSpeechProgress(token, offset, length) {
    const startedAt = Date.now()
    const remainingChars = Math.max(1, length - offset)
    const estimatedMs = Math.max(1200, (remainingChars / (11 * speechRate)) * 1000)
    clearSpeechTimer()
    speechTimer = setInterval(() => {
      if (token !== speechToken || !activeKey || !activeText) return
      const ratio = Math.min(0.96, (Date.now() - startedAt) / estimatedMs)
      const index = offset + Math.floor(remainingChars * ratio)
      activeCharIndex = Math.max(activeCharIndex, index)
      emitProgress((activeCharIndex / Math.max(1, activeText.length)) * 100)
    }, 300)
  }

  function speakBrowser({ key, text, lang, offset = 0 }) {
    if (!isSpeechPlaybackSupported()) return false
    const content = sanitizeSpeechPlaybackText(text)
    if (!content) return false
    const safeOffset = Math.max(0, Math.min(offset, content.length - 1))
    const segment = content.slice(safeOffset).trim()
    if (!segment) return false
    speechToken += 1
    const token = speechToken
    activeText = content
    activeLang = normalizeSpeechLang(lang)
    activeCharIndex = safeOffset
    activeSpeechOffset = safeOffset
    const utterance = new SpeechSynthesisUtterance(segment)
    utterance.lang = activeLang
    const voice = pickChineseVoice()
    if (voice) utterance.voice = voice
    utterance.rate = speechRate
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onboundary = (event) => {
      if (token !== speechToken) return
      if (typeof event.charIndex === 'number') {
        activeCharIndex = activeSpeechOffset + event.charIndex
        emitProgress((activeCharIndex / Math.max(1, activeText.length)) * 100)
      }
    }
    utterance.onend = () => {
      if (token === speechToken && activeText === content) stop({ finalProgress: true })
    }
    utterance.onerror = () => {
      if (token === speechToken) stop()
    }
    activeUtterance = utterance
    setState(key)
    emitProgress((safeOffset / Math.max(1, activeText.length)) * 100)
    estimateSpeechProgress(token, safeOffset, content.length)
    window.speechSynthesis.speak(utterance)
    return true
  }

  function speak({ key, text, lang, rate: nextRate } = {}) {
    if (nextRate) speechRate = normalizeSpeechRate(nextRate)
    stop()
    return speakBrowser({ key, text, lang })
  }

  async function speakWithModel({ key, text, lang }) {
    if (typeof synthesizeAudio !== 'function') return false
    const content = sanitizeSpeechPlaybackText(text)
    if (!content) return false
    const audio = await synthesizeAudio({ text: content, lang })
    const mimeType = audio?.mimeType || audio?.mime_type || 'audio/mpeg'
    let src = audio?.url || ''
    if (!src && audio?.audioBase64) src = `data:${mimeType};base64,${audio.audioBase64}`
    if (!src && audio?.audio) src = `data:${mimeType};base64,${audio.audio}`
    if (!src) return false

    stop()
    const player = new Audio(src)
    player.playbackRate = speechRate
    activeAudio = player
    activeText = content
    activeLang = lang || navigator.language || 'zh-CN'
    setState(key)
    emitProgress(0)
    player.ontimeupdate = () => {
      if (activeAudio !== player || !Number.isFinite(player.duration) || player.duration <= 0) return
      emitProgress((player.currentTime / player.duration) * 100)
    }
    player.onended = () => {
      if (activeAudio === player) stop({ finalProgress: true })
    }
    player.onerror = () => {
      if (activeAudio === player) stop()
    }
    await player.play()
    return true
  }

  function toggle({ key, text, lang, rate: nextRate } = {}) {
    if (nextRate) speechRate = normalizeSpeechRate(nextRate)
    if (activeKey === key) {
      stop()
      return 'stopped'
    }
    return speak({ key, text, lang }) ? 'started' : 'unsupported'
  }

  async function toggleAsync({ key, text, lang, rate: nextRate } = {}) {
    if (nextRate) speechRate = normalizeSpeechRate(nextRate)
    if (activeKey === key) {
      stop()
      return 'stopped'
    }
    try {
      if (await speakWithModel({ key, text, lang })) return 'started-model'
    } catch {}
    return toggle({ key, text, lang })
  }

  function setRate(nextRate) {
    speechRate = normalizeSpeechRate(nextRate)
    if (activeAudio) {
      try { activeAudio.playbackRate = speechRate } catch {}
      emitProgress(Number.isFinite(activeAudio.duration) && activeAudio.duration > 0 ? (activeAudio.currentTime / activeAudio.duration) * 100 : 0)
      return
    }
    if (activeUtterance && activeKey && activeText) {
      const key = activeKey
      const text = activeText
      const lang = activeLang
      const offset = Math.max(0, Math.min(activeCharIndex, text.length - 1))
      speechToken += 1
      try { window.speechSynthesis.cancel() } catch {}
      clearSpeechTimer()
      speakBrowser({ key, text, lang, offset })
    }
  }

  return {
    stop,
    toggle,
    toggleAsync,
    setRate,
    isActive: (key) => activeKey === key,
    destroy: stop,
  }
}
