# SuperClaw 1.0.1 交付文件清单

状态：待用户确认后再上传 / 发布。

## 本地构建产物

- `C:\Users\ZXKJ\Documents\superClaw_code\SuperClaw_Desktop_Client\superclaw.exe`
- `C:\Users\ZXKJ\Documents\superClaw_code\SuperClaw_Desktop_Client\resources\`
- `C:\Users\ZXKJ\Documents\superClaw_code\SuperClaw_Desktop_Client\resources\runtime\openclaw\`
- `C:\Users\ZXKJ\Documents\superClaw_code\SuperClaw_Desktop_Client\resources\runtime\claude-code\`
- `C:\Users\ZXKJ\Documents\superClaw_code\SuperClaw_Desktop_Client\resources\runtime\ocr\`
- `C:\Users\ZXKJ\Documents\superClaw_code\SuperClaw_Desktop_Client\resources\data\memory\memory-config.json`

## U 盘产物

- `F:\SuperClaw_Desktop_Client\superclaw.exe`
- `F:\SuperClaw_Desktop_Client\resources\`
- `F:\SuperClaw_Desktop_Client\resources\runtime\openclaw\`
- `F:\SuperClaw_Desktop_Client\resources\runtime\claude-code\`
- `F:\SuperClaw_Desktop_Client\resources\runtime\ocr\`
- `F:\SuperClaw_Desktop_Client\resources\data\memory\memory-config.json`

## 备份

- `F:\SuperClaw_Backups\SuperClaw_Desktop_Client_20260615_183347_before_1.0.1`

## 验证命令摘要

- `node scripts\test-collaboration.mjs`
- `node scripts\test-claude-code-modes.mjs`
- `npm run build`
- `npm run build:desktop`
- 使用本地包内 `resources\runtime\openclaw\node.exe` 调用 `resources\runtime\ocr\ocr-runner.cjs`
- 使用 U 盘包内 `resources\runtime\openclaw\node.exe` 调用 `resources\runtime\ocr\ocr-runner.cjs`

## 清理确认

- 本地包 `resources\data` 下启动验证产生的 `.log` / `.pid` / `.tmp` 已清理。
- U 盘包 `resources\data` 下启动验证产生的 `.log` / `.pid` / `.tmp` 已清理。
- U 盘同步时清除了旧包残留的 workspace、旧 OpenClaw 状态、设备绑定状态和日志。
- 未执行上传、发布、推送或线上覆盖。
