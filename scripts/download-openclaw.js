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

  const versionPolicy = loadVersionPolicy()
  const standaloneCfg = versionPolicy?.standalone
  if (!standaloneCfg?.enabled || !standaloneCfg?.baseUrl) {
    console.error('✗ openclaw-version-policy.json 中 standalone 配置不可用或未启用')
    process.exit(1)
  }

  const platform = detectPlatform()
  const pkg = loadPackageJson()
  const panelVersion = pkg.version

  // 从版本策略中查找当前面板版本对应的推荐版本
  let recommendedVersion = versionPolicy?.default?.chinese?.recommended
  const panelEntry = versionPolicy?.panels?.[panelVersion]
  if (panelEntry?.chinese?.recommended) {
    recommendedVersion = panelEntry.chinese.recommended
  }

  const version = process.argv[2] || recommendedVersion
  if (!version) {
    console.error('✗ 无法确定 OpenClaw 版本，请在 openclaw-version-policy.json 中配置或通过命令行参数指定')
    process.exit(1)
  }

  const installDir = destDir()

  // 如果已存在，可以选择跳过
  const binFile = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw'
  if (skipIfExists && fs.existsSync(path.join(installDir, binFile))) {
    console.log(`✓ OpenClaw ${version} 已存在于 ${installDir}，跳过下载`)
    return
  }

  // 清理并创建目录
  if (fs.existsSync(installDir)) {
    fs.rmSync(installDir, { recursive: true, force: true })
  }
  fs.mkdirSync(installDir, { recursive: true })

  // 第一步: 下载 latest.json 获取最新版本信息
  const manifestUrl = `${standaloneCfg.baseUrl}/latest.json`
  console.log(`📦 获取版本清单: ${manifestUrl}`)

  const manifestResp = await fetch(manifestUrl)
  if (!manifestResp.ok) {
    throw new Error(`版本清单不可用 (HTTP ${manifestResp.status})`)
  }
  const manifest = await manifestResp.json()

  const editionObj = manifest?.editions?.zh
  const remoteVersion = editionObj?.version || manifest.version
  if (!remoteVersion) {
    throw new Error('版本清单缺少 version 字段')
  }

  // 版本匹配检查（如果指定了非 latest 版本）
  if (version !== 'latest') {
    const remoteParts = parseVersion(remoteVersion)
    const reqParts = parseVersion(version)
    const match = remoteParts[0] === reqParts[0] &&
      remoteParts[1] === reqParts[1] &&
      remoteParts[2] === reqParts[2]
    if (!match) {
      console.warn(`  警告: 远程版本 ${remoteVersion} 与请求版本 ${version} 不一致，使用远程版本`)
    }
  }

  const actualVersion = version === 'latest' ? remoteVersion : version
  const archivePrefix = editionObj ? 'openclaw-zh' : 'openclaw'
  const manifestBaseUrl = editionObj?.base_url || manifest.base_url
  const policyBaseUrl = String(standaloneCfg.baseUrl || '').replace(/\/+$/, '')
  const remoteBase = manifestBaseUrl || (
    /\/download$/i.test(policyBaseUrl) ? policyBaseUrl : `${policyBaseUrl}/${actualVersion}`
  )
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
  const filename = `${archivePrefix}-${actualVersion}-${platform}.${ext}`
  const downloadUrl = `${remoteBase}/${filename}`

  console.log(`📦 下载 OpenClaw ${actualVersion} (${platform})`)
  console.log(`   到: ${installDir}`)

  // 下载到临时文件
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'openclaw-'))
  const tmpPath = path.join(tmpDir, filename)

  try {
    await download(downloadUrl, tmpPath)

    // 解压
    if (process.platform === 'win32') {
      extractZip(tmpPath, installDir)
    } else {
      extractTarGz(tmpPath, installDir)
    }

    // 验证
    if (!fs.existsSync(path.join(installDir, binFile))) {
      throw new Error('解压后未找到 openclaw 可执行文件')
    }

    // 验证 Node.js 存在
    const nodeFile = process.platform === 'win32' ? 'node.exe' : 'node'
    if (!fs.existsSync(path.join(installDir, nodeFile))) {
      console.warn('  注意: 未找到内置 Node.js 运行时，可能不是 standalone 版本')
    }

    const sizeMb = (getDirSize(installDir) / 1048576).toFixed(1)
    console.log(`✓ OpenClaw ${actualVersion} 安装完成 (${sizeMb}MB)`)
    console.log(`  安装目录: ${installDir}`)
  } finally {
    // 清理临时文件
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
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
      resolve(res)
    }).on('error', reject)
  })
}

main().catch(err => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
