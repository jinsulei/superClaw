/**
 * 构建前自动下载 uv 包管理器二进制文件
 *
 * 下载到 src-tauri/resources/ 目录下，Tauri 打包时会将其包含在安装包中。
 * 应用首次启动时自动从安装目录解压使用，无需网络。
 *
 * 用法:
 *   node scripts/download-uv.js          # 下载当前平台对应的 uv 包
 *   node scripts/download-uv.js 0.7.12   # 指定版本
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const PLATFORM_MAP = {
  'win32-x64':               'uv-x86_64-pc-windows-msvc.zip',
  'darwin-arm64':            'uv-aarch64-apple-darwin.tar.gz',
  'darwin-x64':              'uv-x86_64-apple-darwin.tar.gz',
  'linux-x64':               'uv-x86_64-unknown-linux-gnu.tar.gz',
  'linux-arm64':             'uv-aarch64-unknown-linux-gnu.tar.gz',
}

function detectFilename() {
  const key = `${process.platform}-${process.arch}`
  const name = PLATFORM_MAP[key]
  if (!name) {
    console.error(`不支持的平台: ${key}`)
    console.error('支持的平台:', Object.keys(PLATFORM_MAP).join(', '))
    process.exit(1)
  }
  return name
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const protocol = url.startsWith('https') ? https : http

    protocol.get(url, (response) => {
      // 处理重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        fs.unlinkSync(dest)
        return download(response.headers.location, dest).then(resolve).catch(reject)
      }

      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
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
          fs.unlinkSync(dest)
          return reject(new Error(`下载不完整: ${downloaded} / ${total}`))
        }
        process.stdout.write('\r\x1b[K')
        console.log(`✓ 下载完成: ${(downloaded / 1048576).toFixed(1)}MB → ${dest}`)
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      reject(err)
    })
  })
}

async function main() {
  const version = process.argv[2] || '0.7.12'
  const filename = detectFilename()
  const destDir = path.resolve(__dirname, '..', 'src-tauri', 'resources')
  const destPath = path.join(destDir, filename)

  // 已存在则跳过
  if (fs.existsSync(destPath)) {
    const size = (fs.statSync(destPath).size / 1048576).toFixed(1)
    console.log(`✓ uv ${filename} 已存在 (${size}MB)，跳过下载`)
    return
  }

  fs.mkdirSync(destDir, { recursive: true })

  const url = `https://github.com/astral-sh/uv/releases/download/${version}/${filename}`
  console.log(`📦 下载 uv ${version} (${filename})`)
  console.log(`   来自: ${url}`)

  try {
    await download(url, destPath)
  } catch (err) {
    console.error(`✗ 下载失败: ${err.message}`)
    console.error('  你可以手动下载后放入:', destPath)
    process.exit(1)
  }
}

main()
