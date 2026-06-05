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

export function createSpeechPlaybackController({ onStateChange, synthesizeAudio } = {}) {
  let activeKey = null
  let activeText = ''
  let activeAudio = null
  let activeObjectUrl = ''

  function setState(nextKey) {
    activeKey = nextKey
    onStateChange?.(activeKey)
  }

  function stop() {
    if (activeAudio) {
      try {
        activeAudio.pause()
        activeAudio.removeAttribute('src')
        activeAudio.load?.()
      } catch {}
      activeAudio = null
    }
    if (activeObjectUrl) {
      try { URL.revokeObjectURL(activeObjectUrl) } catch {}
      activeObjectUrl = ''
    }
    if (isSpeechPlaybackSupported()) {
      try { window.speechSynthesis.cancel() } catch {}
    }
    activeText = ''
    setState(null)
  }

  function speak({ key, text, lang }) {
    if (!isSpeechPlaybackSupported()) return false
    const content = String(text || '').trim()
    if (!content) return false
    stop()
    const utterance = new SpeechSynthesisUtterance(content)
    utterance.lang = lang || navigator.language || 'zh-CN'
    utterance.onend = () => {
      if (activeText === content) stop()
    }
    utterance.onerror = () => stop()
    activeText = content
    setState(key)
    window.speechSynthesis.speak(utterance)
    return true
  }

  async function speakWithModel({ key, text, lang }) {
    if (typeof synthesizeAudio !== 'function') return false
    const content = String(text || '').trim()
    if (!content) return false
    const audio = await synthesizeAudio({ text: content, lang })
    const mimeType = audio?.mimeType || audio?.mime_type || 'audio/mpeg'
    let src = audio?.url || ''
    if (!src && audio?.audioBase64) src = `data:${mimeType};base64,${audio.audioBase64}`
    if (!src && audio?.audio) src = `data:${mimeType};base64,${audio.audio}`
    if (!src) return false

    stop()
    const player = new Audio(src)
    activeAudio = player
    activeText = content
    setState(key)
    player.onended = () => {
      if (activeAudio === player) stop()
    }
    player.onerror = () => {
      if (activeAudio === player) stop()
    }
    await player.play()
    return true
  }

  function toggle({ key, text, lang }) {
    if (activeKey === key) {
      stop()
      return 'stopped'
    }
    return speak({ key, text, lang }) ? 'started' : 'unsupported'
  }

  async function toggleAsync({ key, text, lang }) {
    if (activeKey === key) {
      stop()
      return 'stopped'
    }
    try {
      if (await speakWithModel({ key, text, lang })) return 'started-model'
    } catch {}
    return toggle({ key, text, lang })
  }

  return {
    stop,
    toggle,
    toggleAsync,
    isActive: (key) => activeKey === key,
    destroy: stop,
  }
}
