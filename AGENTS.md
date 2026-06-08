# AGENTS.md

本文件给智能体和后续维护者快速理解工程使用，不作为客户侧说明文档。

## 项目定位

SuperClaw 是 Tauri 桌面客户端项目，最终交付形态是便携式桌面包。Web dev 仅用于调试，不代表最终交付效果。

## 主要目录

- `src/`: 前端页面、业务流程、模型配置、支付、登录注册等逻辑。
- `src-tauri/src/`: Tauri 命令、本地服务控制、运行时路径、设备信息等桌面侧逻辑。
- `src-tauri/resources/runtime/`: 打包时携带的本地运行时资源。
- `src-tauri/resources/data/`: Hermes / OpenClaw 默认数据与配置模板。
- `scripts/build-desktop-client.ps1`: 便携式桌面包构建脚本。
- `SuperClaw_Desktop_Client/`: 最近生成的便携式桌面包目录。

## 本地后端

当前 v2 后端项目在：

`C:\Users\ZXKJ\Documents\superClaw_all\openclaw-deployer-main`

本地调试时前端在 `localhost` / `127.0.0.1` 会优先请求：

`http://127.0.0.1:3001`

线上后端地址：

`http://124.222.21.44:3001`

yyapi 中转站：

`http://124.222.21.44:3002`

后端代码当前不自动推送远端服务器，改动后需要先在本地 3001 验证。

## 常用命令

前端构建检查：

```powershell
npm run build
```

Tauri dev：

```powershell
npm run tauri:dev
```

便携式桌面包：

```powershell
npm run build:desktop
```

本地后端：

```powershell
cd C:\Users\ZXKJ\Documents\superClaw_all\openclaw-deployer-main
npm run start:server
```

## 关键流程

- 新用户注册走 v2 接口，并在 yyapi 创建用户和默认 API Key。
- 用户未手动改模型时，Hermes、OpenClaw、Claude Code 默认使用 yyapi 返回的第一个模型。
- Hermes 的 yyapi baseUrl 不给用户编辑；OpenClaw 和 Claude Code 默认使用 yyapi，但允许用户自定义供应商、baseUrl 和 token。
- 如果 yyapi 模型列表里不再包含用户当前选择的 yyapi 模型，应切回列表第一个；如果用户切到其他供应商，不自动覆盖。
- 访问密码页已跳过，正常流程不应再显示。
- 支付页默认不显示 0.01 测试金额；只有后端显式设置 `ENABLE_TEST_PAYMENT_AMOUNT=1` 才允许测试金额。
- 充值比例由后端 `PAYMENT_TOKEN_RATIO` 配置，默认 `1 元 = 500000 Token`。

## 激活与 U 盘绑定

当前预留了激活 / U 盘绑定流程和开关，测试阶段不要强制写死。默认应保持兼容现有激活流程，最终交付前再开启强约束。

相关前端开关：

- `superclaw_usb_binding_mode`: `off` / `observe` / `enforce`
- `superclaw_license_activate_endpoint`: `v1` / `v2`

## 修改原则

- 优先小范围改动，避免影响已经可运行的桌面包流程。
- README 面向外部展示，不放过多内部逻辑；内部工程上下文写在本文件。
- 打包版必须尽量打开即用，不要重新要求客户安装 Hermes、OpenClaw、Claude Code 或其他运行时。
- 支付、登录、模型配置这类流程改动后，要同时验证前端构建和本地后端逻辑。
- 不要提交真实 API Key、token、证书、私钥、会话、日志、锁定状态或客户环境数据。
