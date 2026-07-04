import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

export function getVideoToolchainPaths(root = repoRoot) {
  const base = resolve(root, 'src-tauri/resources/runtime/video-tools')
  return {
    root: base,
    ytDlp: resolve(base, 'yt-dlp/yt-dlp.exe'),
    ffmpeg: resolve(base, 'ffmpeg/bin/ffmpeg.exe'),
    ffprobe: resolve(base, 'ffmpeg/bin/ffprobe.exe'),
    whisperCli: resolve(base, 'whisper.cpp/whisper-cli.exe'),
    whisperModel: resolve(base, 'whisper.cpp/models/ggml-tiny.bin'),
  }
}

export function getVideoToolchainStatus(root = repoRoot) {
  const paths = getVideoToolchainPaths(root)
  const available = {
    ytDlp: existsSync(paths.ytDlp),
    ffmpeg: existsSync(paths.ffmpeg),
    ffprobe: existsSync(paths.ffprobe),
    whisperCli: existsSync(paths.whisperCli),
    whisperModel: existsSync(paths.whisperModel),
  }
  return {
    paths,
    available,
    videoDownloaderAvailable: available.ytDlp,
    mediaProcessingAvailable: available.ffmpeg && available.ffprobe,
    asrAvailable: available.whisperCli && available.whisperModel,
    subtitleExtractorAvailable: available.ytDlp,
    portableReady: available.ytDlp && available.ffmpeg && available.ffprobe && available.whisperCli && available.whisperModel,
    fullVideoParsingAvailable: false,
    fullVideoParsingReason: 'portable tools are bundled, but platform cookies/login, downloader success, ASR execution, subtitle extraction, and frame OCR still need a runtime pipeline',
  }
}

export function buildVideoToolchainEnv(root = repoRoot, baseEnv = process.env) {
  const { paths } = getVideoToolchainStatus(root)
  const pathPrefix = [
    dirname(paths.ytDlp),
    dirname(paths.ffmpeg),
    dirname(paths.whisperCli),
  ]
  const oldPath = baseEnv.PATH || baseEnv.Path || ''
  return {
    ...baseEnv,
    PATH: [...pathPrefix, oldPath].filter(Boolean).join(';'),
    Path: [...pathPrefix, oldPath].filter(Boolean).join(';'),
    YTDLP_BINARY: paths.ytDlp,
    FFMPEG_BINARY: paths.ffmpeg,
    FFPROBE_BINARY: paths.ffprobe,
    WHISPER_CPP_BINARY: paths.whisperCli,
    WHISPER_CPP_MODEL: paths.whisperModel,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  }
}
