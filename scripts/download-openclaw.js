#!/usr/bin/env node
/**
 * 构建前自动下载 standalone OpenClaw（含内置 Node.js 运行时）
 *
 * 下载到 src-tauri/resources/runtime/openclaw/ 目录下，
 * Tauri 打包时会将此目录包含在安装包中。
 * 应用启动时直接使用内置的 OpenClaw 和 Node.js，无需用户单独安装。
 *
 * 用法:
 *   node scripts/download-openclaw.js              # 下载推荐的稳定版
 *   node scripts/download-openclaw.js 2026.5.6     # 指定版本
 *   node scripts/download-openclaw.js --skip-if-exists  # 已存在则跳过
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const os = require('os')
const { spawnSync } = require('child_process')

const PLATFORM_MAP = {
  'win32-x64':  'win-x64',
  'darwin-arm64': 'mac-arm64',
  'darwin-x64': 'mac-x64',
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function detectPlatform() {
  const key = `${process.platform}-${process.arch}`
  const name = PLATFORM_MAP[key]
  if (!name) {
    console.error(`不支持的平台: ${key}`)
    console.error('支持的平台:', Object.keys(PLATFORM_MAP).join(', '))
    process.exit(1)
  }
  return name
}

function loadVersionPolicy() {
  const policyPath = path.resolve(__dirname, '..', 'openclaw-version-policy.json')
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'))
}

function loadPackageJson() {
  const pkgPath = path.resolve(__dirname, '..', 'package.json')
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
}

function parseVersion(v) {
  return String(v || '').split('.').map(n => parseInt(n, 10) || 0)
}

function destDir() {
  return path.resolve(__dirname, '..', 'src-tauri', 'resources', 'runtime', 'openclaw')
}

function makeStagingDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'superclaw-openclaw-download-'))
}

function makeBackupDir(targetDir) {
  const parent = path.dirname(targetDir)
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '')
  let candidate = path.join(parent, `openclaw.__backup_${stamp}`)
  let index = 0
  while (fs.existsSync(candidate)) {
    index += 1
    candidate = path.join(parent, `openclaw.__backup_${stamp}_${index}`)
  }
  return candidate
}

function requiredRuntimeFiles(runtimeDir) {
  const binFile = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw'
  const nodeFile = process.platform === 'win32' ? 'node.exe' : 'node'
  return {
    binFile,
    nodeFile,
    binPath: path.join(runtimeDir, binFile),
    nodePath: path.join(runtimeDir, nodeFile),
  }
}

function validateRuntimeDir(runtimeDir) {
  const required = requiredRuntimeFiles(runtimeDir)
  const missing = []
  if (!fs.existsSync(required.binPath)) missing.push(required.binFile)
  if (!fs.existsSync(required.nodePath)) missing.push(required.nodeFile)
  if (missing.length) {
    throw new Error(`Staging runtime validation failed. Missing: ${missing.join(', ')} in ${runtimeDir}`)
  }
}

function moveDirectory(sourceDir, targetDir) {
  try {
    fs.renameSync(sourceDir, targetDir)
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      fs.cpSync(sourceDir, targetDir, { recursive: true })
      fs.rmSync(sourceDir, { recursive: true, force: true })
      return
    }
    throw err
  }
}

function replaceTargetRuntime(stagingRuntimeDir, targetDir) {
  const backupDir = makeBackupDir(targetDir)
  let oldTargetMoved = false

  try {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    if (fs.existsSync(targetDir)) {
      fs.renameSync(targetDir, backupDir)
      oldTargetMoved = true
    }
    moveDirectory(stagingRuntimeDir, targetDir)
    if (oldTargetMoved && fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true })
    }
    return { backupDir, restored: false }
  } catch (err) {
    let restored = !oldTargetMoved
    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true })
      }
      if (oldTargetMoved && fs.existsSync(backupDir)) {
        fs.renameSync(backupDir, targetDir)
        restored = true
      }
    } catch (restoreErr) {
      err.message = `${err.message}; restore failed: ${restoreErr.message}`
      restored = false
    }
    err.backupDir = backupDir
    err.existingRuntimePreserved = restored
    throw err
  }
}

// ---------------------------------------------------------------------------
// HTTP 下载
// ---------------------------------------------------------------------------

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const protocol = url.startsWith('https') ? https : http

    protocol.get(url, (response) => {
      // 处理重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        return download(response.headers.location, dest).then(resolve).catch(reject)
      }

      if (response.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        return reject(new Error(`下载失败 (HTTP ${response.statusCode})`))
      }

      const total = parseInt(response.headers['content-length'], 10) || 0
      let downloaded = 0
      let lastLog = 0

      response.on('data', (chunk) => {
        downloaded += chunk.length
        if (total && Date.now() - lastLog > 2000) {
          lastLog = Date.now()
          const pct = (downloaded / total * 100).toFixed(1)
          process.stdout.write(`\r  下载中... ${pct}% (${(downloaded / 1048576).toFixed(1)}MB / ${(total / 1048576).toFixed(1)}MB)`)
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        if (total && downloaded !== total) {
          try { fs.unlinkSync(dest) } catch {}
          return reject(new Error(`下载不完整: ${downloaded} / ${total}`))
        }
        process.stdout.write('\r\x1b[K')
        console.log(`✓ 下载完成: ${(downloaded / 1048576).toFixed(1)}MB`)
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      try { fs.unlinkSync(dest) } catch {}
      reject(err)
    })
  })
}

// ---------------------------------------------------------------------------
// 解压
// ---------------------------------------------------------------------------

function extractZip(zipPath, targetDir) {
  console.log('  解压 zip ...')
  const result = spawnSync('powershell', [
    '-NoProfile', '-Command',
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force`
  ], { windowsHide: true, stdio: 'pipe' })
  if (result.status !== 0) {
    throw new Error(`解压失败: ${result.stderr?.toString() || result.stdout?.toString() || '未知错误'}`)
  }

  // 处理嵌套的 openclaw/ 目录（standalone 包可能有一层 openclaw/ 嵌套）
  const nested = path.join(targetDir, 'openclaw')
  if (fs.existsSync(nested) && fs.existsSync(path.join(nested, 'node.exe'))) {
    for (const entry of fs.readdirSync(nested)) {
      const src = path.join(nested, entry)
      const dst = path.join(targetDir, entry)
      if (fs.existsSync(dst)) {
        fs.rmSync(dst, { recursive: true, force: true })
      }
      fs.renameSync(src, dst)
    }
    fs.rmSync(nested, { recursive: true, force: true })
  }
}

function extractTarGz(tgzPath, targetDir) {
  console.log('  解压 tar.gz ...')
  const result = spawnSync('tar', ['-xzf', tgzPath, '-C', targetDir, '--strip-components=1'], {
    windowsHide: true, stdio: 'pipe'
  })
  if (result.status !== 0) {
    throw new Error(`解压失败: ${result.stderr?.toString() || '未知错误'}`)
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const skipIfExists = process.argv.includes('--skip-if-exists')
  const installDir = destDir()
  let stage = 'initializing'
  let stagingRoot = ''
  let stagingRuntimeDir = ''
  let metadataUrl = ''
  let packageUrl = ''
  let backupDir = ''

  try {
    const versionPolicy = loadVersionPolicy()
    const standaloneCfg = versionPolicy?.standalone
    if (!standaloneCfg?.enabled || !standaloneCfg?.baseUrl) {
      throw new Error('openclaw-version-policy.json standalone config is unavailable or disabled')
    }

    const platform = detectPlatform()
    const pkg = loadPackageJson()
    const panelVersion = pkg.version

    let recommendedVersion = versionPolicy?.default?.chinese?.recommended
    const panelEntry = versionPolicy?.panels?.[panelVersion]
    if (panelEntry?.chinese?.recommended) {
      recommendedVersion = panelEntry.chinese.recommended
    }

    const version = process.argv[2] || recommendedVersion
    if (!version) {
      throw new Error('Unable to determine OpenClaw version from policy or command line')
    }

    const currentRequired = requiredRuntimeFiles(installDir)
    if (skipIfExists && fs.existsSync(currentRequired.binPath) && fs.existsSync(currentRequired.nodePath)) {
      console.log('OpenClaw ' + version + ' already exists at ' + installDir + '; skipped.')
      return
    }

    stage = 'staging'
    stagingRoot = makeStagingDir()
    stagingRuntimeDir = path.join(stagingRoot, 'runtime')
    if (fs.existsSync(stagingRuntimeDir)) {
      throw new Error('Staging directory already exists: ' + stagingRuntimeDir)
    }
    fs.mkdirSync(stagingRuntimeDir, { recursive: true })

    stage = 'metadata'
    metadataUrl = standaloneCfg.baseUrl + '/latest.json'
    console.log('Downloading OpenClaw metadata...')
    console.log('  URL: ' + metadataUrl)

    const manifestResp = await fetch(metadataUrl)
    if (!manifestResp.ok) {
      throw new Error('OpenClaw metadata is unavailable (HTTP ' + manifestResp.status + ')')
    }
    const manifest = await manifestResp.json()

    const editionObj = manifest?.editions?.zh
    const remoteVersion = editionObj?.version || manifest.version
    if (!remoteVersion) {
      throw new Error('OpenClaw metadata is missing version')
    }

    if (version !== 'latest') {
      const remoteParts = parseVersion(remoteVersion)
      const reqParts = parseVersion(version)
      const match = remoteParts[0] === reqParts[0] &&
        remoteParts[1] === reqParts[1] &&
        remoteParts[2] === reqParts[2]
      if (!match) {
        console.warn('  Warning: remote version ' + remoteVersion + ' differs from requested version ' + version + '; using requested archive name')
      }
    }

    const actualVersion = version === 'latest' ? remoteVersion : version
    const archivePrefix = editionObj ? 'openclaw-zh' : 'openclaw'
    const manifestBaseUrl = editionObj?.base_url || manifest.base_url
    const policyBaseUrl = String(standaloneCfg.baseUrl || '').replace(/\/+$/, '')
    const remoteBase = manifestBaseUrl || (
      /\/download$/i.test(policyBaseUrl) ? policyBaseUrl : policyBaseUrl + '/' + actualVersion
    )
    const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
    const filename = archivePrefix + '-' + actualVersion + '-' + platform + '.' + ext
    packageUrl = remoteBase + '/' + filename
    const archivePath = path.join(stagingRoot, filename)

    stage = 'package-download'
    console.log('Downloading OpenClaw package...')
    console.log('  URL: ' + packageUrl)
    console.log('  Staging: ' + stagingRoot)
    await download(packageUrl, archivePath)

    stage = 'extract'
    console.log('Extracting to staging...')
    if (process.platform === 'win32') {
      extractZip(archivePath, stagingRuntimeDir)
    } else {
      extractTarGz(archivePath, stagingRuntimeDir)
    }

    stage = 'staging-validation'
    console.log('Validating staging runtime...')
    validateRuntimeDir(stagingRuntimeDir)

    stage = 'target-replace'
    console.log('Replacing target runtime atomically...')
    const replaceResult = replaceTargetRuntime(stagingRuntimeDir, installDir)
    backupDir = replaceResult.backupDir

    stage = 'ready'
    const sizeMb = (getDirSize(installDir) / 1048576).toFixed(1)
    console.log('OpenClaw runtime ready (' + sizeMb + 'MB)')
    console.log('  Target: ' + installDir)
  } catch (err) {
    if (typeof err.existingRuntimePreserved === 'undefined') {
      err.existingRuntimePreserved = true
    }
    err.stage = stage
    err.metadataUrl = metadataUrl
    err.packageUrl = packageUrl
    err.stagingRoot = stagingRoot
    err.targetDir = installDir
    err.backupDir = err.backupDir || backupDir
    throw err
  } finally {
    if (stagingRoot && fs.existsSync(stagingRoot)) {
      try { fs.rmSync(stagingRoot, { recursive: true, force: true }) } catch {}
    }
  }
}
function getDirSize(dir) {
  let total = 0
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        total += getDirSize(p)
      } else if (entry.isFile()) {
        total += fs.statSync(p).size
      }
    }
  } catch {}
  return total
}

// Node 18+ 内置 fetch，低版本需要 polyfill
async function fetch(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          text: async () => body,
          json: async () => JSON.parse(body),
        })
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

main().catch(err => {
  console.error('OpenClaw runtime download failed')
  console.error('Stage: ' + (err.stage || 'unknown'))
  if (err.metadataUrl) console.error('Metadata URL: ' + err.metadataUrl)
  if (err.packageUrl) console.error('Package URL: ' + err.packageUrl)
  if (err.stagingRoot) console.error('Staging path: ' + err.stagingRoot)
  if (err.targetDir) console.error('Target path: ' + err.targetDir)
  if (err.backupDir) console.error('Backup path: ' + err.backupDir)
  console.error('Existing runtime preserved: ' + (err.existingRuntimePreserved !== false))
  console.error('Error: ' + err.message)
  process.exit(1)
})
