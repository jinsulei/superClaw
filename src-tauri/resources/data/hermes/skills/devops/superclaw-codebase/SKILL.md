---
name: superclaw-codebase
description: SuperClaw (Tauri 桌面应用) 代码库结构与功能现状速查。触发条件：用户在 SuperClaw 仓库问"X 功能有没有 / 怎么实现的 / 在哪里"、需要在前端 lib/页面/后端 Tauri command 之间定位代码、或者要补齐尚未接通后端的前端占位功能（如 Hermes 图生图）。
---

# SuperClaw 代码库速查

SuperClaw 是 Tauri 桌面客户端，最终交付为便携式桌面包。前端 dev 服务器仅用于调试，不代表最终形态。AGENTS.md 在仓库根 `<PROJECT_ROOT>/AGENTS.md`，里面写了目录约定、常用命令、激活/U 盘绑定、修改原则。

## 关键路径（按工作树组织）

仓库根（注意不是 CWD）：

`<PROJECT_ROOT>`

- `src/`：前端页面、业务流程、模型配置、支付、登录注册
- `src-tauri/src/`：Tauri 命令、本地服务控制、运行时路径、设备信息
- `src-tauri/resources/runtime/`：打包时携带的本地运行时资源
- `src-tauri/resources/data/`：Hermes / OpenClaw 默认数据与配置模板

- Hermes 引擎前端：

- `src/engines/hermes/pages/chat.js`：聊天主页面（拖拽/粘贴/曲别针附件、链接预览、OCR 指令注入、流式发送都在这）
- `src/engines/hermes/lib/`：纯逻辑库，当前实际只有三个文件：`chat-store.js`（状态/会话）、`ecommerce-workflow-guard.js`（电商三阶段守卫）、`providers.js`（供应商配置）
- 命名约定：业务模型 = `*.js`，后端调用层 = `*-api.js`，store = `chat-store.js`
- ⚠️ 历史上曾有过 `image-generation.js` / `image-generation-api.js` 的草稿，但**当前代码里不存在**，别凭印象去找

后端：

- `src-tauri/src/commands/hermes.rs`：所有 Hermes 相关 Tauri command
- v2 后端在 `C:\Users\ZXKJ\Documents\superClaw_all\openclaw-deployer-main`，本地走 `127.0.0.1:3001`

## ⚠️ CWD 陷阱

shell 的工作目录是：

`<PROJECT_ROOT>\src-tauri\resources\runtime\hermes-agent`

这是运行时资源目录，**不是项目根**。用相对路径 `src/` 搜索会失败（路径不存在），必须：

- 用绝对路径（`<PROJECT_ROOT>\src`），或
- 每次 `search_files` 加 `path=.` 显式锚定仓库根，或
- 在工具调用里传 `workdir` 切到项目根

用 `search_files path=src` 在当前 CWD 下会得到 "Path not found: src"。

## 功能状态调查工作流（最重要的一节）

当用户问"X 功能有没有 / 怎么运行的"，按这个顺序定位真相：

1. **前端入口**：用关键词搜 `src/engines/hermes/pages/`，找到 UI 渲染和事件绑定的位置
2. **业务 lib**：搜 `src/engines/hermes/lib/<feature>.js`，看是否只有模型/工具函数
3. **API 调用层**：找 `src/engines/hermes/lib/<feature>-api.js`，**直接读全文**——这个文件通常很短（几十行内），是否真打后端一目了然
4. **Tauri 后端**：在 `src-tauri/src/commands/hermes.rs` 搜 `feature_name / featureName / 图X / 参考X`，**0 命中 = 后端缺**
5. **报告现状**：把"前端有 / API 层是占位 / Tauri command 缺失"三层分别讲清楚，不要混在一起说"实现了"

> 这个工作流源自 2026-06-26 那轮"图生图"调查——当时按上面走完发现前端 UI 全到位但 `requestHermesImageGeneration` 返回占位结果。但**该结论已因代码重构失效**（详见下文 Pitfalls），后续同类调查务必先把工作流的产出当作"待验证假设"，再用 `search_files` / `read_file` 现场复核。

## 已知占位 / 未接通的功能

> ⚠️ **技能维护原则**：下面任何描述都要用 `search_files` / `read_file` 现场验证，**不要凭印象复用**。代码会演进，6 月 26 日写的"图生图"占位描述当前代码里已全部不存在。

### Hermes 图片附件流（当前实际行为，不是图生图）

没有独立的"图生图对话框"。所有图片都走普通对话通道，作为"待发送附件"chip 显示在 textarea 正上方，发送时随文本一起给 Hermes 后端，由后端模型/视觉能力自行处理。

完整链路（行号会漂移，以函数名为准）：

1. **入口** — 三条路都进 `handlePickAttachment(file)`（约 line 2632）：
   - 📎 曲别针按钮、拖拽 `drop`、`Ctrl+V` 粘贴
   - 校验：`isImage` / `isReadableTextFile`，图片 ≤ 8MB、文本 ≤ 1MB
2. **图片分支** — 读 dataURL → `api.saveImage(imageId, dataUrl)` 调 Tauri 落盘 → `pendingAttachments.push({ category:'image', mimeType, fileName, content:base64, dataUrl, savedPath })`
3. **落点** — `renderPendingAttachments()`（约 line 1768）渲染 `hm-chat-pending-attachments` 条，**位置在 textarea 上方**，每张图一个 `hm-chat-pending-image` chip（缩略图 + 文件名 + 删除按钮）
4. **伴随指令** — `pendingAttachmentInstructions = '本轮用户主动添加了图片…请直接调用视觉/图片读取能力分析'`，发送时拼进 `sendInstructions`
5. **Toast** — `'图片已加入输入框'`（`success`）
6. **发送** — `handleSend()`（约 line 3297）：
   - `attachments = pendingAttachments.slice()`
   - 没文字只图时自动填 `'请分析我刚刚上传或粘贴的图片。'`
   - 命中 `isOcrIntent(text)` → 先 `runHermesAttachmentOcr(attachments)` 走 SuperClaw 共享 OCR，结果拼进 `sendInstructions`
   - 走 `store.sendMessage(text, { modelContent, attachments, instructions })`
   - 发完 `pendingAttachments = []` 清空
7. **发送后** — 图以 `m.attachments` 留在对话记录，由 `renderMessageAttachments()` 渲染在用户消息气泡内

辅助函数（按出现顺序）：`attachmentImageSrc` (line 1736)、`renderMessageAttachments` (line 1745)、`renderPendingAttachments` (line 1768)、`runHermesAttachmentOcr` (line 2871)。

**Tauri 后端**：`api.saveImage()` 写入本地（`savedPath`），把图给到后端模型仍走普通 chat 通道，**没有专门 img2img command**。

**真要做"用这张图生成新图"入口时**，改造点：
- `renderPendingAttachments` 每个 chip 加按钮 → 收集 `referenceImage: savedPath|dataUrl` + 风格/比例/数量选项
- 在 `lib/` 新建 `image-generation.js`（草稿模型）+ `image-generation-api.js`（`invoke('hermes_image_generation', { draft })`）
- `src-tauri/src/commands/hermes.rs` 加 `hermes_image_generation` command，返回 `{ ok, urls[], code, message }`
- 结果进 `store.pushLocalAssistant(...)` 当前对话框；按钮放输入框上方不阻塞普通聊天

### Hermes 拖拽

- 聊天输入区附件拖拽：`chat.js` 监听 `dragenter/over/leave/drop`，文件走 `handleDroppedAttachments → handlePickAttachments`
- 助手回退模型排序：`src/pages/assistant.js` 用 HTML5 native `draggable="true"`，`dataTransfer` 携带 index，`drop` 重排 `fallbackDrafts`
- 视觉反馈走 `is-attachment-drag-over` / `is-drag-over` CSS 类，改样式找 `chat.css` / `pages.css`

## 搜索关键词备忘

中文关键词在 JS/Rust 文件里基本搜不到（注释除外），优先用英文；**关键词也要按当前代码实际存在的函数名更新**——历史关键词（如图生图相关）可能全部搜空，碰到这种情况就回退到 `search_files target=files` 看 `lib/` 实际有什么文件。

- 图片附件 → `pendingAttachments` `handlePickAttachment` `attachmentImageSrc` `renderPendingAttachments` `runHermesAttachmentOcr` `isOcrIntent` `dataUrl` `savedPath` `parseImageDataUrl`
- 拖拽 → `dragstart` `dragenter` `dragover` `dragleave` `drop` `dataTransfer` `draggable` `handleDroppedAttachments`
- 聊天发送 → `handleSend` `pushLocalAssistant` `stopStreaming` `store.sendMessage` `chat-store.js` `clearDraftForSend`
- OCR → `runHermesAttachmentOcr` `formatOcrResult` `isOcrIntent` `SuperClaw OCR`
- 电商三阶段 → `ecommerce-workflow-guard.js` `maybeRunEcommerceStage` `ecommerceHandled`

## 修改原则（抄自 AGENTS.md）

- 优先小范围改动，避免影响已经可运行的桌面包流程
- 打包版必须尽量打开即用，不要重新要求客户安装运行时
- 支付、登录、模型配置这类流程改动后，要同时验证前端构建和本地后端逻辑
- 不要提交真实 API Key、token、证书、私钥、会话、日志、锁定状态或客户环境数据

## ⚠️ Pitfalls

- **技能描述的"功能"可能在代码里不存在**：本技能之前描述的"图生图 / img2img"整套（`image-generation.js` 草稿、`requestHermesImageGeneration`、图片旁的「用这张图生成/改图」按钮、`IMAGE_GENERATION_NOT_CONFIGURED` 占位结果）在当前代码里全部不存在。教训：**任何"已知占位 / 未接通的功能"章节里出现的具体文件名、函数名、行号，每次使用前都要 `search_files` + `read_file` 现场验证**，不能凭印象复用。
- **技能里说"line X-Y 有某段代码"时，先 `read_file path=... offset=X limit=Y` 确认范围没漂**——`chat.js` 已经长到 3679 行，块位置会随重构整体下移。
- **CWD 是运行时目录，不是项目根**：用相对路径 `src/` 搜索会失败，必须用绝对路径或 `workdir` 切到 `<PROJECT_ROOT>`。

## 相关参考文件

- `references/hermes-image-attachment-flow.md`：图片从曲别针/拖拽/粘贴到进对话记录的完整代码追踪（具体行号 + 函数签名 + 数据结构）

## 常用命令

```
npm run build              # 前端构建检查
npm run tauri:dev          # Tauri dev
npm run build:desktop      # 便携式桌面包
```

后端：

```
cd C:\Users\ZXKJ\Documents\superClaw_all\openclaw-deployer-main
npm run start:server       # 监听 3001
```
