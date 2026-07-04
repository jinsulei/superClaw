import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import {
  buildVideoToolchainEnv,
  detectVideoPlatform,
  getVideoToolchainStatus,
  resolveVideoCookiesFile,
} from './video-toolchain-runtime.mjs'

const DEFAULT_TIMEOUT_MS = 35000
const DEFAULT_PIPELINE_TIMEOUT_MS = 10 * 60 * 1000

function compact(value, limit = 800) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function pick(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value)
}

export function classifyYtDlpError(text = '') {
  const raw = String(text || '')
  const lower = raw.toLowerCase()
  if (/fresh cookies.*needed|cookies.*needed|cookies? required|cookie.*required|login required|sign in|please log in|not logged in|account required|HTTP Error 403|forbidden|anti-bot|captcha|verify you are human/i.test(raw)) {
    return 'cookie_required'
  }
  if (/timed out|timeout|read operation timed out|connection.*reset|network is unreachable|unable to download webpage|temporary failure|econnreset|socket/i.test(raw)) {
    return 'network_or_timeout'
  }
  if (/unsupported url|no suitable extractor|not a valid url/i.test(raw)) {
    return 'unsupported_url'
  }
  if (/private|paywall|permission|access denied|unavailable/i.test(lower)) {
    return 'access_denied'
  }
  return 'fetch_failed'
}

function normalizeMetadata(json = {}) {
  const title = pick(json.title).trim()
  const description = pick(json.description).trim()
  const uploader = pick(json.uploader || json.channel || json.creator).trim()
  const duration = json.duration || json.duration_string || null
  const webpageUrl = pick(json.webpage_url || json.original_url).trim()
  const thumbnail = pick(json.thumbnail).trim()
  return {
    title,
    description,
    uploader,
    duration,
    webpageUrl,
    thumbnail,
    viewCount: json.view_count ?? null,
    likeCount: json.like_count ?? null,
    commentCount: json.comment_count ?? null,
    tags: Array.isArray(json.tags) ? json.tags.slice(0, 20) : [],
    categories: Array.isArray(json.categories) ? json.categories.slice(0, 10) : [],
  }
}

function materialBase({ url, platform, status, cookiesFile }) {
  return {
    ok: false,
    kind: status,
    platform,
    url,
    materialLevel: 'metadata_only',
    downloaderAvailable: true,
    cookiesConfigured: Boolean(cookiesFile),
    transcriptAvailable: false,
    subtitleAvailable: false,
    audioTranscriptAvailable: false,
    frameOcrAvailable: false,
    fullVideoParsingAvailable: false,
    canLimitedAnalyze: true,
    metadata: {},
    transcript: '',
    subtitles: [],
    missing: [
      'platform_access_or_cookies',
      'verified_download',
      'subtitle_extraction',
      'audio_transcript',
      'frame_ocr_pipeline',
    ],
  }
}

export function analyzeVideoLink(url, {
  root = process.cwd(),
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  enableDownload = false,
} = {}) {
  const platform = detectVideoPlatform(url)
  const status = getVideoToolchainStatus(root)
  const cookiesFile = resolveVideoCookiesFile({ root, platform, env })
  if (!status.available.ytDlp) {
    return {
      ...materialBase({ url, platform, status: 'tool_missing', cookiesFile }),
      downloaderAvailable: false,
      message: 'bundled yt-dlp is missing',
    }
  }

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '20',
  ]
  if (!enableDownload) args.push('--skip-download')
  if (cookiesFile) args.push('--cookies', cookiesFile)
  args.push(url)

  const result = spawnSync(status.paths.ytDlp, args, {
    cwd: root,
    env: buildVideoToolchainEnv(root, env),
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 5 * 1024 * 1024,
  })

  const stdout = String(result.stdout || '')
  const stderr = String(result.stderr || '')
  if (result.error) {
    const kind = result.error.code === 'ETIMEDOUT' ? 'network_or_timeout' : 'fetch_failed'
    return {
      ...materialBase({ url, platform, status: kind, cookiesFile }),
      message: compact(result.error.message),
      ytDlpExitCode: result.status ?? null,
    }
  }
  if (result.status !== 0) {
    const kind = classifyYtDlpError(`${stderr}\n${stdout}`)
    return {
      ...materialBase({ url, platform, status: kind, cookiesFile }),
      message: compact(stderr || stdout || `yt-dlp exited with ${result.status}`),
      ytDlpExitCode: result.status,
    }
  }

  let parsed = null
  try {
    const jsonLine = stdout.split(/\r?\n/).find(line => line.trim().startsWith('{')) || stdout
    parsed = JSON.parse(jsonLine)
  } catch (err) {
    return {
      ...materialBase({ url, platform, status: 'metadata_parse_failed', cookiesFile }),
      message: compact(err.message),
      rawPreview: compact(stdout, 500),
      ytDlpExitCode: result.status,
    }
  }

  const metadata = normalizeMetadata(parsed)
  const subtitles = [
    ...Object.keys(parsed.subtitles || {}),
    ...Object.keys(parsed.automatic_captions || {}),
  ].slice(0, 20)
  const hasMetadata = Boolean(metadata.title || metadata.description || metadata.uploader || metadata.tags.length)
  return {
    ...materialBase({ url, platform, status: hasMetadata ? 'metadata_extracted' : 'metadata_empty', cookiesFile }),
    ok: hasMetadata,
    metadata,
    subtitleAvailable: subtitles.length > 0,
    subtitles,
    missing: [
      ...(subtitles.length ? [] : ['subtitles']),
      'downloaded_media',
      'audio_transcript',
      'frame_ocr_pipeline',
    ],
    message: hasMetadata
      ? 'metadata extracted by bundled yt-dlp'
      : 'yt-dlp returned no useful public metadata',
    ytDlpExitCode: result.status,
  }
}

export function buildTranscriptPipelinePlan({ root = process.cwd() } = {}) {
  const status = getVideoToolchainStatus(root)
  const tempRoot = resolve(root, 'src-tauri/resources/data/video-tools/tmp')
  const ready = Boolean(status.available.ffmpeg && status.available.ffprobe && status.available.whisperCli && status.available.whisperModel)
  return {
    ready,
    tempRoot,
    ffmpegAvailable: status.available.ffmpeg,
    ffprobeAvailable: status.available.ffprobe,
    whisperCliAvailable: status.available.whisperCli,
    whisperModelAvailable: status.available.whisperModel,
    requiresDownloadedMedia: true,
    canRunAfterDownload: ready,
  }
}

function runTool(file, args, { root, env, timeoutMs }) {
  const result = spawnSync(file, args, {
    cwd: root,
    env: buildVideoToolchainEnv(root, env),
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    const err = new Error(compact(result.error?.message || result.stderr || result.stdout || `${file} exited with ${result.status}`, 1600))
    err.status = result.status
    err.stdout = result.stdout
    err.stderr = result.stderr
    throw err
  }
  return result
}

function newestDownloadedFile(dir) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && !/\.part$|\.ytdl$|\.json$|\.txt$/i.test(entry.name))
    .map(entry => {
      const file = join(dir, entry.name)
      const stat = statSync(file)
      return { file, mtimeMs: stat.mtimeMs, size: stat.size }
    })
    .filter(item => item.size > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files[0]?.file || null
}

export function runVideoDownloadTranscriptPipeline(url, {
  root = process.cwd(),
  env = process.env,
  timeoutMs = DEFAULT_PIPELINE_TIMEOUT_MS,
  keepTemp = false,
} = {}) {
  const platform = detectVideoPlatform(url)
  const status = getVideoToolchainStatus(root)
  const plan = buildTranscriptPipelinePlan({ root })
  const cookiesFile = resolveVideoCookiesFile({ root, platform, env })
  if (!status.available.ytDlp) throw new Error('bundled yt-dlp is missing')
  if (!plan.ready) throw new Error('bundled ffmpeg/ffprobe/whisper runtime is incomplete')
  if (!cookiesFile && platform !== 'generic') {
    const err = new Error('VIDEO_TOOLCHAIN_COOKIES_REQUIRED')
    err.kind = 'cookie_required'
    throw err
  }

  mkdirSync(plan.tempRoot, { recursive: true })
  const tempDir = mkdtempSync(join(plan.tempRoot, `${platform}-`))
  try {
    const outputTemplate = join(tempDir, 'source.%(ext)s')
    const ytdlpArgs = [
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '30',
      '-f', 'bestaudio/best',
      '-o', outputTemplate,
    ]
    if (cookiesFile) ytdlpArgs.push('--cookies', cookiesFile)
    ytdlpArgs.push(url)
    runTool(status.paths.ytDlp, ytdlpArgs, { root, env, timeoutMs })

    const mediaFile = newestDownloadedFile(tempDir)
    if (!mediaFile) throw new Error('VIDEO_DOWNLOAD_OUTPUT_MISSING')

    const probe = runTool(status.paths.ffprobe, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      mediaFile,
    ], { root, env, timeoutMs: 60000 })

    const audioFile = join(tempDir, 'audio.wav')
    runTool(status.paths.ffmpeg, [
      '-y',
      '-i', mediaFile,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      audioFile,
    ], { root, env, timeoutMs })

    const transcriptBase = join(tempDir, 'transcript')
    runTool(status.paths.whisperCli, [
      '-m', status.paths.whisperModel,
      '-f', audioFile,
      '-otxt',
      '-of', transcriptBase,
    ], { root, env, timeoutMs })
    const transcriptFile = `${transcriptBase}.txt`
    const transcript = existsSync(transcriptFile) ? readFileSync(transcriptFile, 'utf8').trim() : ''
    return {
      ok: Boolean(transcript),
      kind: transcript ? 'transcript_extracted' : 'transcript_empty',
      platform,
      url,
      mediaFile,
      transcriptFile,
      transcript,
      ffprobe: probe.stdout,
      tempDir,
      tempKept: keepTemp,
    }
  } finally {
    if (!keepTemp) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

export function formatVideoMaterialPackageForHermes(material = {}) {
  const metadata = material.metadata || {}
  const lines = [
    '[VIDEO_MATERIAL_PACKAGE]',
    `platform=${material.platform || 'generic'}`,
    `url=${material.url || ''}`,
    `status=${material.kind || 'unknown'}`,
    `failureKind=${material.ok ? 'none' : material.kind || 'unknown'}`,
    `materialLevel=${material.materialLevel || 'metadata_only'}`,
    `cookiesConfigured=${Boolean(material.cookiesConfigured)}`,
    `downloaderAvailable=${material.downloaderAvailable !== false}`,
    `transcriptAvailable=${Boolean(material.transcriptAvailable)}`,
    `subtitleAvailable=${Boolean(material.subtitleAvailable)}`,
    `audioTranscriptAvailable=${Boolean(material.audioTranscriptAvailable)}`,
    `frameOcrAvailable=${Boolean(material.frameOcrAvailable)}`,
    `fullVideoParsingAvailable=${Boolean(material.fullVideoParsingAvailable)}`,
    `canLimitedAnalyze=${material.canLimitedAnalyze !== false}`,
  ]
  if (metadata.title) lines.push(`title=${metadata.title}`)
  if (metadata.description) lines.push(`description=${metadata.description}`)
  if (metadata.uploader) lines.push(`uploader=${metadata.uploader}`)
  if (metadata.duration) lines.push(`duration=${metadata.duration}`)
  if (metadata.tags?.length) lines.push(`tags=${metadata.tags.join(', ')}`)
  if (material.message) lines.push(`toolMessage=${compact(material.message, 500)}`)
  if (material.kind === 'cookie_required') {
    lines.push(
      'cookieRequired=true',
      'cookieInstruction=Bundled yt-dlp is available, but this platform requires a fresh user-provided Netscape cookies.txt file in the ignored runtime cookie directory. Do not read browser cookies automatically and do not print cookie contents.',
    )
  }
  lines.push(
    '',
    '[MATERIAL_LIMITS]',
    'Do not claim full video parsing unless transcriptAvailable/subtitleAvailable/audioTranscriptAvailable/frameOcrAvailable is true.',
    'If status is cookie_required, explain that downloader access is blocked by platform login/cookie state, then continue with limited analysis from user-provided share text, URL, title, or metadata.',
    'If only URL is available, say material is insufficient and ask for title, transcript, captions, screenshots, comments, or product text.',
    'Still provide useful limited outputs when possible: topic direction, likely audience, hook inference, key sentence guesses, limited timeline, rewrite direction, and live-sales wording suggestions.',
    '[/MATERIAL_LIMITS]',
    '[/VIDEO_MATERIAL_PACKAGE]',
  )
  return lines.join('\n')
}

export function isVideoMaterialPackage(text = '') {
  return /\[VIDEO_MATERIAL_PACKAGE\]/.test(String(text || ''))
}
