import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const hermesChatPath = path.join(root, 'src', 'engines', 'hermes', 'pages', 'chat.js')
const voicePath = path.join(root, 'src', 'lib', 'voice.js')
const cssPath = path.join(root, 'src', 'style', 'chat.css')

const read = (file) => fs.readFileSync(file, 'utf8')
const chat = read(chatPath)
const hermesChat = read(hermesChatPath)
const voice = read(voicePath)
const css = read(cssPath)

function pass(label) {
  console.log(`${label}: PASS`)
}

function fail(label, message) {
  console.error(`${label}: FAIL`)
  if (message) console.error(message)
  process.exitCode = 1
}

function assert(label, condition, message) {
  if (condition) pass(label)
  else fail(label, message)
}

assert(
  'OPENCLAW_TTS_BUTTON_EXISTS',
  chat.includes('msg-voice-btn') &&
    chat.includes('msg-voice-label') &&
    chat.includes('朗读') &&
    chat.includes('停止') &&
    css.includes('.openclaw-chat .msg-voice-btn'),
  'OpenClaw assistant messages must expose a visible Chinese read/stop button.',
)

assert(
  'OPENCLAW_TTS_RATE_MATCHES_HERMES',
  hermesChat.includes('superclaw-hermes-voice-rate') &&
    chat.includes('superclaw-hermes-voice-rate') &&
    chat.includes('openclaw-read-rate') &&
    chat.includes('rate: _voiceRate'),
  'OpenClaw must reuse the Hermes voice rate storage key and pass the selected rate to playback.',
)

assert(
  'OPENCLAW_TTS_LANG_ZH_CN',
  voice.includes("DEFAULT_SPEECH_LANG = 'zh-CN'") &&
    voice.includes('normalizeSpeechLang') &&
    voice.includes('pickChineseVoice') &&
    chat.includes("lang: 'zh-CN'"),
  'OpenClaw playback must request zh-CN and the shared helper must prefer Chinese voices.',
)

assert(
  'OPENCLAW_TTS_NO_REASONING_OR_TOOLCALL',
  voice.includes('sanitizeSpeechPlaybackText') &&
    voice.includes('the user is asking me') &&
    voice.includes('let me think') &&
    voice.includes('tool_call') &&
    voice.includes('stdout') &&
    voice.includes('stderr') &&
    chat.includes('sanitizeSpeechPlaybackText'),
  'Shared playback text must filter reasoning, tool calls, stdout, and stderr before speaking.',
)

assert(
  'OPENCLAW_TTS_STOP_WORKS',
  voice.includes('window.speechSynthesis.cancel()') &&
    chat.includes('syncMessageVoiceButtons(null)') &&
    chat.includes('_voicePlaybackController?.stop()'),
  'Stop/cancel logic must call speechSynthesis.cancel and reset OpenClaw button state.',
)

assert(
  'HERMES_TTS_STILL_WORKS',
  hermesChat.includes('hm-chat-msg-voice') &&
    hermesChat.includes('hm-chat-read-rate') &&
    hermesChat.includes('voicePlaybackController.toggleAsync') &&
    hermesChat.includes('superclaw-hermes-voice-rate'),
  'Hermes TTS button and rate controls must remain present.',
)
