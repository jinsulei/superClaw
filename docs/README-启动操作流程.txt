SuperClaw / OpenCloud / Hermes 启动操作流程

一、用途

这个压缩包用于本地恢复和启动当前这版 SuperClaw 项目，包含：

1. SuperClaw 前端源码
2. Tauri 桌面端后端源码
3. OpenClaw 本地运行资源
4. Claude Code CLI 运行资源
5. Claude UI 面板 claude-panel 资源
6. 必要的脚本、配置模板和文档

注意：压缩包不内置真实 API Key，不包含 .env、token、证书、日志和旧打包产物。

二、首次启动前

1. 解压整个 zip，不要只解压单个文件。
2. 路径可以包含中文或空格，但建议先放到桌面或 D 盘，例如：
   D:\SuperClaw-启动源码包
3. 如果只是查看源码，不需要启动服务。
4. 如果要启动开发环境，需要电脑有 Node.js 22+ 和 Rust/Tauri 构建环境。

三、启动前端开发页面

1. 打开 PowerShell。
2. 进入解压后的项目目录。
3. 执行：

   npm run dev

4. 浏览器打开：

   http://127.0.0.1:1420/

四、启动桌面开发客户端

1. 打开 PowerShell。
2. 进入解压后的项目目录。
3. 执行：

   npm run tauri:dev

4. 如果启动失败，先确认：

   npm install

   是否已经执行过，且 Rust/Tauri 环境可用。

五、打包桌面客户端

1. 打开 PowerShell。
2. 进入解压后的项目目录。
3. 执行：

   npm run build:desktop

4. 打包脚本会读取 src-tauri/resources 下的运行资源。

六、关键资源位置

1. 前端源码：
   src

2. Tauri 后端：
   src-tauri/src

3. OpenClaw 运行资源：
   src-tauri/resources/runtime/openclaw

4. Claude Code CLI 运行资源：
   src-tauri/resources/runtime/claude-code

5. Claude UI 面板：
   src-tauri/resources/runtime/claude-panel

6. 打包脚本：
   scripts/build-desktop-client.ps1

7. Tauri 配置：
   src-tauri/tauri.conf.json

七、配置 API Key

不要把真实 API Key 写进源码或提交到仓库。

建议在运行环境或配置页面中设置 API Key。常见变量名示例：

1. DEEPSEEK_API_KEY
2. YYAPI_API_KEY
3. MINIMAX_API_KEY

八、常见问题

1. 页面提示 localhost 拒绝连接：
   说明本地服务没有启动，先执行 npm run dev 或 npm run tauri:dev。

2. Claude Code 面板打不开：
   检查 src-tauri/resources/runtime/claude-panel 是否完整存在。

3. OpenClaw 无法聊天：
   检查 OpenClaw Gateway 是否启动，模型配置和 API Key 是否正确。

4. 打包后切换 OpenClaw 或 Claude Code 失败：
   优先检查资源路径是否完整，尤其是 src-tauri/resources/runtime 下的三个目录。

九、安全提醒

交付或上传前，请再次检查：

1. 不要包含 .env
2. 不要包含 token 文件
3. 不要包含私钥、证书
4. 不要包含真实 sk-、ark-、Bearer token
5. 不要包含旧 zip、旧 dist、旧 release、日志和缓存
