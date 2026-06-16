# SuperClaw 1.0.1 待发布说明

状态：本地构建与 U 盘同步验证完成，尚未上传、发布或推送。

## 主要修复

- 修复截图后 Ctrl+V 可能粘贴两张相同图片的问题。
- 补齐 Hermes、OpenClaw、Claude Code 的双向协作消息结构。
- 增加共享 task/session/memory 结构，协作消息携带 `session_id`、`task_id`、上下文摘要、最近消息和 artifacts。
- OpenClaw、Claude Code 回传结果、错误和主动委派时写回 Hermes 上下文。
- Claude Code 增加 `safe`、`browser_automation`、`takeover` 模式隔离，`takeover` 必须确认，不静默升级。
- OpenClaw 浏览器自动化默认保持单 browser / 单 page 策略，拦截自动多页面扩散。
- 增加项目级统一 OCR Service/Tool，Hermes、OpenClaw、Claude Code 共用一套 OCR 能力。
- OCR 使用离线 Tesseract.js 运行时，懒加载、可关闭，失败时返回可恢复错误，不影响主流程。
- 增加本地共享 memory 持久化目录配置，便携包和 U 盘包使用相对路径。

## 版本

- package version: `1.0.1`
- Tauri version: `1.0.1`
- Cargo crate version: `1.0.1`
- exe ProductVersion/FileVersion: `1.0.1`

## 验证结果

- 源码环境：协作协议测试通过。
- 源码环境：Claude Code 模式测试通过。
- 源码环境：OCR 成功路径和失败路径测试通过。
- 源码环境：截图粘贴去重逻辑模拟测试通过。
- 本地便携包：构建成功。
- 本地便携包：exe 启动验证通过。
- 本地便携包：协作协议测试通过。
- 本地便携包：Claude Code 模式测试通过。
- 本地便携包：OCR 离线识别测试通过。
- U 盘便携包：同步成功。
- U 盘便携包：exe 启动验证通过。
- U 盘便携包：协作协议测试通过。
- U 盘便携包：Claude Code 模式测试通过。
- U 盘便携包：OCR 离线识别测试通过。

## 路径

- 本地便携包：`C:\Users\ZXKJ\Documents\superClaw_code\SuperClaw_Desktop_Client`
- 本地 exe：`C:\Users\ZXKJ\Documents\superClaw_code\SuperClaw_Desktop_Client\superclaw.exe`
- U 盘便携包：`F:\SuperClaw_Desktop_Client`
- U 盘 exe：`F:\SuperClaw_Desktop_Client\superclaw.exe`
- U 盘旧版备份：`F:\SuperClaw_Backups\SuperClaw_Desktop_Client_20260615_183347_before_1.0.1`

## 发布前注意

- 当前未执行 `git push`。
- 当前未创建 GitHub Release。
- 当前未上传服务器、网盘或其他线上位置。
- 上传 / 发布前建议人工再打开 U 盘 exe 做一次关键路径冒烟测试。
