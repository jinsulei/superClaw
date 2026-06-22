import { defineConfig } from 'vite'
import { devApiPlugin } from './scripts/dev-api.js'
import fs from 'fs'
import path from 'path'
import { homedir } from 'os'

// 读取 package.json 版本号，构建时注入前端
const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// 查找 openclaw.json（便携优先，其次用户目录）
function findOpenclawConfig() {
  // 便携模式：resources/data/.openclaw/openclaw.json
  const portablePaths = [
    path.join(process.cwd(), 'resources', 'data', '.openclaw', 'openclaw.json'),
    path.join(process.cwd(), 'src-tauri', 'resources', 'data', '.openclaw', 'openclaw.json'),
  ]
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p
  }
  // 用户目录兜底
  return path.join(homedir(), '.openclaw', 'openclaw.json')
}

// 读取 Gateway 端口（启动时读取一次）
// 注意：Gateway 默认端口是 18789，不是 18790
let gatewayPort = 18789
try {
  const cfgPath = findOpenclawConfig()
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''))
    // 端口必须 > 0 且 < 65536
    const port = cfg?.gateway?.port
    if (port && typeof port === 'number' && port > 0 && port < 65536) {
      gatewayPort = port
    }
  }
} catch (e) {
  console.warn('[vite] 读取 Gateway 端口配置失败，使用默认端口 18789:', e.message)
}

console.log(`[vite] Gateway WebSocket 代理目标: ws://127.0.0.1:${gatewayPort}`)

function isGatewayStartupRefusal(err) {
  return err && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')
}

export default defineConfig({
  plugins: [devApiPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        '**/data/**',           // 便携数据目录（hermes-source 解压等），避免 Vite 触发页面刷新
        '**/uv-python/**',      // Python 缓存目录
        '**/uv-tools/**',       // uv tool 安装目录
        '**/SuperClaw_Desktop_Client/**',
        '**/src-tauri/resources/bin/**',
        '**/src-tauri/resources/data/**',
        '**/src-tauri/resources/portable/**',
        '**/src-tauri/resources/runtime/**',
        '**/src-tauri/target/**',
        '**/resources/bin/**',
        '**/resources/data/**',
        '**/resources/portable/**',
        '**/resources/runtime/**',
      ],
    },
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${gatewayPort}`,
        ws: true,
        changeOrigin: true,
        timeout: 30000,
        configure: (proxy, options) => {
          // Vite's default proxy error logger treats the normal Gateway startup
          // window as a compiler error. Replace it so ECONNREFUSED/ECONNRESET
          // stay quiet while real proxy errors remain visible.
          proxy.removeAllListeners('error')
          proxy.on('proxyReqWs', (proxyReq, req, socket) => {
            socket.setTimeout(30000)
            socket.on('timeout', () => {
              console.warn('[vite/ws] WebSocket 超时，关闭连接')
              socket.destroy()
            })
          })
          proxy.on('error', (err, req, socket) => {
            if (isGatewayStartupRefusal(err)) {
              console.debug(`[vite/ws] Gateway 暂未就绪，等待重连: ${err.code}`)
            } else {
              console.warn(`[vite/ws] 代理错误: ${err.code} ${err.message}`)
            }
            // WebSocket 升级后 socket 是 net.Socket，无 headersSent
            if (socket && !socket.destroyed) {
              socket.destroy()
            }
          })
        },
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_', 'USER_API_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'terser' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    terserOptions: {
      compress: {
        drop_console: false,
        keep_fnames: false,
        keep_classnames: false,
      },
      mangle: {
        toplevel: true,
        properties: false,
        keep_fnames: false,
        keep_classnames: false,
      },
      format: {
        comments: false,
      },
    },
  },
})
