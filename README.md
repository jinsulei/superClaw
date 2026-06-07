# SuperClaw

SuperClaw 是一个面向客户交付的便携式桌面客户端，集成 Hermes Agent、OpenClaw 和 Claude Code 三套本地引擎。

## 当前交付形态

- 交付目录：`SuperClaw_Desktop_Client`
- 启动程序：`SuperClaw_Desktop_Client/superclaw.exe`
- 默认后台接口：`http://124.222.21.44:3001`
- 默认模型中转站：`http://124.222.21.44:3002/v1`
- 打包命令：`npm run build:desktop`

打包后的客户端应包含本地运行资源，正常情况下不要求客户再安装 Hermes、OpenClaw、Claude Code 或额外引擎。

## 主要目录

- `src`：前端页面和业务逻辑。
- `src-tauri/src`：Tauri 桌面端、本地控制服务和引擎桥接逻辑。
- `src-tauri/resources/runtime/openclaw`：OpenClaw 本地运行时。
- `src-tauri/resources/runtime/claude-code`：Claude Code CLI 本地运行时。
- `src-tauri/resources/runtime/claude-panel`：Claude Code 面板服务。
- `src-tauri/resources/data/hermes`：Hermes 默认数据和配置模板。
- `src-tauri/resources/data/.openclaw`：OpenClaw 默认数据和配置模板。
- `scripts/build-desktop-client.ps1`：便携桌面包构建脚本。
- `SuperClaw_Desktop_Client`：最近一次生成的便携桌面包。

## 本地开发

安装依赖：

```powershell
npm install
```

启动 Web 调试：

```powershell
npm run dev
```

启动 Tauri 桌面调试：

```powershell
npm run tauri:dev
```

Web 调试只用于开发排查，不代表最终交付形态。

## 打包便携桌面版

执行：

```powershell
npm run build:desktop
```

当前 `build:desktop` 默认带 `-SkipRuntimeDownload`，会优先使用项目内已有的本地运行资源，不再打包时下载引擎。

打包完成后运行：

```powershell
.\SuperClaw_Desktop_Client\superclaw.exe
```

## 模型配置流程

用户登录后，系统会从后台获取用户的 yyapi token 和模型列表，并同步到各引擎：

- Hermes：默认使用 yyapi，base_url 固定为 `http://124.222.21.44:3002/v1`，provider 使用 `openai-api`。
- OpenClaw：默认使用 yyapi 的 base_url 和 apiKey，用户可以自定义或新增供应商。
- Claude Code：默认使用 yyapi 的 base_url 和 apiKey，用户可以自定义或新增供应商，并兼容 OpenAI 格式中转站。

如果用户未手动修改 yyapi 模型，默认使用 yyapi 返回的第一个模型。若 yyapi 模型列表变化，当前模型不存在时会自动切换到新的第一个模型。

## 激活与便携交付

项目预留了激活/访问控制流程，当前测试阶段保留开关，不做最终强制锁死。最终交付预期：

- 应用随 U 盘交付给客户。
- 同一个 U 盘换电脑允许使用。
- 从 U 盘复制到其他位置时，后续可按激活策略要求重新激活或限制使用。
- U 盘识别、首次绑定、后台消费激活码等逻辑后续继续完善。

## 安全注意

- 不要把真实 API Key、token、证书、私钥提交到仓库。
- 打包产物中的默认 key 应为占位值，例如 `superclaw-login-required`。
- 发布前检查 `resources/data/hermes/.env` 和 `resources/data/.openclaw/openclaw.json`，确认没有真实密钥。
- 不要把旧日志、会话、锁文件、机器绑定状态一起交付。

## 常用检查

前端构建：

```powershell
npm run build
```

Rust 检查：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

便携包关键文件：

- `SuperClaw_Desktop_Client/superclaw.exe`
- `SuperClaw_Desktop_Client/resources/runtime/openclaw/openclaw.cmd`
- `SuperClaw_Desktop_Client/resources/runtime/claude-code/bin/claude.exe`
- `SuperClaw_Desktop_Client/resources/runtime/claude-panel/server.js`
- `SuperClaw_Desktop_Client/resources/data/hermes/config.yaml`
- `SuperClaw_Desktop_Client/resources/data/.openclaw/openclaw.json`
