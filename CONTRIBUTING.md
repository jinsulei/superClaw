# SuperClaw 维护说明

本文档用于项目内部开发、测试和交付维护。SuperClaw 当前不是普通 Web 项目，最终产品是便携式桌面客户端，Web 运行只作为调试手段。

## 开发环境

建议环境：

- Windows 10/11
- Node.js 22+
- Rust stable
- Tauri CLI v2
- PowerShell

安装依赖：

```powershell
npm install
```

前端调试：

```powershell
npm run dev
```

桌面调试：

```powershell
npm run tauri:dev
```

桌面打包：

```powershell
npm run build:desktop
```

`build:desktop` 默认跳过运行时下载，使用 `src-tauri/resources` 中已有的本地资源。

## 项目重点

- `src`：前端页面、路由、引擎切换、登录和模型同步。
- `src-tauri/src`：Tauri 命令、本地服务管理、Hermes/OpenClaw/Claude Code 桥接。
- `scripts/dev-api.js`：Web 调试模式下的本地 API fallback。
- `scripts/build-desktop-client.ps1`：便携桌面包构建入口。
- `src-tauri/resources/runtime`：交付包内置运行时资源。
- `src-tauri/resources/data`：交付包内置数据和配置模板。
- `SuperClaw_Desktop_Client`：生成后的便携桌面客户端。

## 维护原则

1. 以便携桌面包为最终验收目标。
2. Web/dev 只用于排查问题，不作为最终交付判断。
3. 不要引入必须联网下载才能启动的运行时依赖。
4. 不要把客户机器路径、开发机路径、日志、锁文件、会话状态打进交付包。
5. 不要把真实 API Key、token、证书、私钥提交到仓库或交付模板。
6. 修改 Hermes/OpenClaw/Claude Code 任一模型流程时，要同时检查三套引擎的同步链路。

## 模型同步约定


## 打包检查

执行：

```powershell
npm run build:desktop
```

打包后检查：

- `SuperClaw_Desktop_Client/superclaw.exe` 存在。
- `resources/runtime/openclaw/openclaw.cmd` 存在。
- `resources/runtime/claude-code/bin/claude.exe` 存在。
- `resources/runtime/claude-panel/server.js` 存在。
- `resources/data/hermes/config.yaml` 中 yyapi provider 为 `openai-api`。
- `resources/data/hermes/.env` 中默认 key 为占位值。
- `resources/data/.openclaw/openclaw.json` 中 yyapi key 为占位值。

## 验证命令

前端构建：

```powershell
npm run build
```

Rust 检查：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

便携包构建：

```powershell
npm run build:desktop
```

## 激活和 U 盘交付

当前激活流程仍处于测试阶段，需要保留开关，不要写死最终限制。


修改激活流程时，不要破坏测试阶段的可用性。

## 文档维护

`README.md` 面向项目说明和交付操作，`CONTRIBUTING.md` 面向内部维护流程。修改模型、激活、打包、运行时路径等核心流程后，请同步更新这两个文件中的相关说明。
