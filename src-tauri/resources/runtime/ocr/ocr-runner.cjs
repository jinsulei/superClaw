#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ENGINE = 'tesseract.js'
const RUNTIME_DIR = __dirname
const DEFAULT_TESSDATA_DIR = path.join(RUNTIME_DIR, 'tessdata')
const TESSDATA_DIR = path.resolve(process.env.TESSDATA_PREFIX || DEFAULT_TESSDATA_DIR)
const SUPPORTED_LANGUAGES = ['eng', 'chi_sim']
const DEFAULT_LANGUAGE = 'eng+chi_sim'
const MIN_LANG_BYTES = {
  eng: 500 * 1024,
  chi_sim: 1000 * 1024,
}

function jsonOut(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  process.exitCode = exitCode
}

function fail(errorCode, message, extra = {}, exitCode = 1) {
  jsonOut({
    ok: false,
    engine: ENGINE,
    errorCode,
    message: String(message || errorCode),
    recoverable: true,
    ...extra,
  }, exitCode)
}

function parseArgs(argv) {
  const args = { flags: new Set() }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (!item.startsWith('--')) continue
    const key = item.slice(2)
    if (['health', 'json', 'stdin'].includes(key)) {
      args.flags.add(key)
    } else {
      args[key] = argv[i + 1] || ''
      i += 1
    }
  }
  return args
}

function languageParts(language) {
  return String(language || DEFAULT_LANGUAGE)
    .split('+')
    .map(part => part.trim())
    .filter(Boolean)
}

function normalizeLanguage(language) {
  const parts = languageParts(language)
  const unsupported = parts.filter(part => !SUPPORTED_LANGUAGES.includes(part))
  if (unsupported.length) {
    throw new Error(`Unsupported OCR language: ${unsupported.join(', ')}`)
  }
  return parts.length ? parts.join('+') : DEFAULT_LANGUAGE
}

function languageFile(lang) {
  return path.join(TESSDATA_DIR, `${lang}.traineddata.gz`)
}

function checkLanguageFiles(language = DEFAULT_LANGUAGE) {
  const missing = []
  const invalid = []
  for (const lang of languageParts(language)) {
    const file = languageFile(lang)
    if (!fs.existsSync(file)) {
      missing.push(file)
      continue
    }
    const stat = fs.statSync(file)
    if (stat.size < (MIN_LANG_BYTES[lang] || 100 * 1024)) {
      invalid.push(`${file} (${stat.size} bytes)`)
    }
  }
  return { missing, invalid }
}

function loadTesseract() {
  try {
    return require('tesseract.js')
  } catch (error) {
    const msg = error && error.message ? error.message : String(error)
    throw new Error(`tesseract.js is not installed for shared OCR runtime: ${msg}`)
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

function imageInputFromDataUrl(value) {
  const text = String(value || '')
  const match = text.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return text
  return Buffer.from(match[2], 'base64')
}

async function runHealth() {
  const tessdataDirExists = fs.existsSync(TESSDATA_DIR) && fs.statSync(TESSDATA_DIR).isDirectory()
  const fileCheck = checkLanguageFiles(DEFAULT_LANGUAGE)
  let packageReady = false
  let packageError = ''
  try {
    loadTesseract()
    packageReady = true
  } catch (error) {
    packageError = error.message || String(error)
  }
  const ok = tessdataDirExists && packageReady && fileCheck.missing.length === 0 && fileCheck.invalid.length === 0
  jsonOut({
    ok,
    engine: ENGINE,
    runtime: 'node',
    languages: SUPPORTED_LANGUAGES,
    defaultLanguage: DEFAULT_LANGUAGE,
    tessdataDir: TESSDATA_DIR,
    tessdataDirExists,
    runnerReady: packageReady,
    packageReady,
    packageError,
    missing: fileCheck.missing,
    invalid: fileCheck.invalid,
  }, ok ? 0 : 1)
}

async function recognize(request) {
  const started = Date.now()
  const language = normalizeLanguage(request.lang || request.language || DEFAULT_LANGUAGE)
  const agent = String(request.agent || 'openclaw')
  const sourceType = String(request.sourceType || 'image')
  const fileCheck = checkLanguageFiles(language)
  if (fileCheck.missing.length || fileCheck.invalid.length) {
    fail('OCR_TESSDATA_MISSING', 'OCR language data is missing or invalid', {
      language,
      missing: fileCheck.missing,
      invalid: fileCheck.invalid,
      source: { type: sourceType, path: request.imagePath || '', agent },
    })
    return
  }

  let imageInput = null
  let sourcePath = ''
  if (request.imagePath) {
    sourcePath = path.resolve(String(request.imagePath))
    if (!fs.existsSync(sourcePath)) {
      fail('OCR_IMAGE_MISSING', 'OCR image file is missing', {
        source: { type: sourceType, path: sourcePath, agent },
      })
      return
    }
    imageInput = sourcePath
  } else if (request.imageData) {
    imageInput = imageInputFromDataUrl(request.imageData)
  } else {
    fail('OCR_IMAGE_MISSING', 'OCR request requires imagePath or imageData', {
      source: { type: sourceType, path: '', agent },
    })
    return
  }

  try {
    const Tesseract = loadTesseract()
    const result = await Tesseract.recognize(imageInput, language, {
      langPath: TESSDATA_DIR,
      gzip: true,
      cacheMethod: 'none',
    })
    const data = result && result.data ? result.data : {}
    jsonOut({
      ok: true,
      engine: ENGINE,
      runtime: 'node',
      language,
      agent,
      text: String(data.text || ''),
      confidence: Number(data.confidence || 0),
      durationMs: Date.now() - started,
      source: { type: sourceType, path: sourcePath, agent },
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    fail('OCR_ENGINE_ERROR', error && error.message ? error.message : String(error), {
      language,
      source: { type: sourceType, path: sourcePath, agent },
      durationMs: Date.now() - started,
    })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.flags.has('health')) {
    await runHealth()
    return
  }

  let request = {}
  if (args.flags.has('stdin') || (!args.image && !args.imageData && !args['image-data'])) {
    const input = (await readStdin()).trim()
    if (!input) {
      fail('OCR_IMAGE_MISSING', 'OCR stdin request is empty')
      return
    }
    try {
      request = JSON.parse(input)
    } catch (error) {
      fail('OCR_ENGINE_ERROR', `Invalid OCR stdin JSON: ${error.message || error}`)
      return
    }
  } else {
    request = {
      imagePath: args.image,
      imageData: args.imageData || args['image-data'],
      lang: args.lang,
      agent: args.agent,
      sourceType: args.sourceType,
    }
  }

  await recognize(request)
}

main().catch(error => {
  fail('OCR_ENGINE_ERROR', error && error.message ? error.message : String(error))
})
