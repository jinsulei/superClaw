# SuperClaw

SuperClaw 是一个面向客户交付的便携式桌面客户端，集成 Hermes Agent、OpenClaw 和 Claude Code 三套本地引擎。

## 当前交付形态

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

如果用户未手动修改 yyapi 模型，默认使用 yyapi 返回的第一个模型。若 yyapi 模型列表变化，当前模型不存在时会自动切换到新的第一个模型。

## 激活与便携交付

项目预留了激活/访问控制流程，当前测试阶段保留开关，不做最终强制锁死。最终交付预期：


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
