# SuperClaw Agent 默认存档内容说明

本文档说明 SuperClaw 绿色版中 Hermes、OpenClaw、Claude Code 三类 agent 的默认文档、记忆、偏好和规则应该保存什么内容。

原则：

- 路径和文件名必须兼容原生程序读取逻辑。
- 内容可以加入 SuperClaw 自己的协作规则，但不要破坏官方约定。
- 不保存 API Key、token、证书、私钥、密码、客户隐私原文。
- 普通聊天不加载全部文件；只在启动、切换 agent、任务派单、记忆页查看时按需读取。

## 一、OpenClaw Agent

### 生效路径

绿色版路径：

```text
resources/data/.openclaw/workspace/
```

运行时环境：

```text
OPENCLAW_HOME=resources/data/.openclaw
OPENCLAW_STATE_DIR=resources/data/.openclaw
OPENCLAW_CONFIG_PATH=resources/data/.openclaw/openclaw.json
```

### 文件清单和默认存档内容

#### AGENTS.md

用途：

- OpenClaw 的核心工作规则。
- 告诉 OpenClaw 启动后应该读哪些记忆文件。
- 定义执行边界、工具调用边界、工作区规则、长期记忆规则。

默认应该存：

- OpenClaw 的角色：执行 agent。
- 工作区范围：只能在当前项目或用户指定路径内操作。
- 工具调用原则：普通聊天不主动塞入所有工具；只有文件、浏览器、桌面、命令、截图、语音、表格等明确意图才调用。
- 任务完成格式：改了什么、文件列表、测试结果、风险。
- 与 Hermes 协作：接收 Hermes 派单，执行后回传报告。

不要存：

- API Key。
- 本机绝对路径，除非是绿色版相对路径说明。
- 客户个人聊天原文。

#### SOUL.md

用途：

- OpenClaw 的人格、语气、协作方式。
- 让它在执行任务时保持稳定风格。

默认应该存：

- 执行型 agent 人设：直接、稳、重检查。
- 说话偏好：中文、简洁、先做事后汇报。
- 风险边界： destructive 操作先确认。
- 面向客户时不暴露内部实现细节。

不要存：

- 模型配置。
- 工具白名单。
- 长期事实记忆。

#### USER.md

用途：

- 用户偏好、沟通习惯、业务背景。

默认应该存：

- 用户喜欢中文、简洁、直接。
- 用户关注打包、绿色版、U 盘可用、响应速度。
- 用户希望工具按意图触发，不希望每次聊天塞满工具。
- 用户希望 OpenClaw 真的执行，而不是只说“我看看”。

不要存：

- 用户手机号、账号、真实客户资料。
- 完整 API Key。

#### TOOLS.md

用途：

- 本机或绿色版可用工具说明。
- 给 OpenClaw 知道什么时候能用浏览器、桌面控制、文件、命令、图片识别等能力。

默认应该存：

- 浏览器自动化：用户明确要求网页、链接、搜索、页面读取时才用。
- 桌面控制：用户明确要求打开本地 app、操作桌面客户端时才用。
- 文件工具：用户要求读写、打包、修改源码时才用。
- 图片识别：用户粘贴截图或上传图片时才用。
- 语音输入：由麦克风触发，停止语音后只填入输入框，不默认发送。

不要存：

- 每次都启用的工具长列表。
- 不存在或未安装的工具能力。

#### MEMORY.md

用途：

- OpenClaw 的长期、稳定、已经沉淀过的项目记忆。
- 不是实时日志。

默认应该存：

- 当前产品：SuperClaw 桌面外壳。
- OpenClaw 职责：执行任务、改文件、运行检查、调用桌面或浏览器工具。
- Hermes 职责：规划、派单、最终验收。
- 速度策略：普通聊天轻量，工具按需触发。
- 已验证的长期结论：比如绿色版路径、U 盘运行要求、不能依赖用户全局目录。

不要存：

- 临时调试过程。
- 单次失败日志全文。
- 未确认的推测。

#### HEARTBEAT.md

用途：

- 心跳、周期检查、主动任务提醒。

默认应该存：

- 启动后轻量自检项。
- Gateway 状态检查。
- 不要写过多内容，避免拖慢启动上下文。

不要存：

- 大段项目说明。
- 任务历史全文。

#### IDENTITY.md

用途：

- OpenClaw 的名字、图标、身份。

默认应该存：

- 名称：OpenClaw。
- 角色：SuperClaw 执行 agent。
- 展示头像或图标路径，尽量使用绿色版相对路径。

#### BOOTSTRAP.md

用途：

- 首次初始化引导。
- 只用于第一次创建工作区或缺失核心文件时。

默认应该存：

- 第一次启动时要创建哪些核心文件。
- 创建完成后不要长期注入。

## 二、Hermes Agent

### 生效路径

绿色版路径：

```text
resources/data/hermes/
```

当前源码中 Hermes 记忆读取关系：

```text
resources/data/hermes/SOUL.md
resources/data/hermes/memories/MEMORY.md
resources/data/hermes/memories/USER.md
```

### 文件清单和默认存档内容

#### SOUL.md

用途：

- Hermes 的人格、沟通风格、总控角色。
- 是 Hermes 的“脑部角色设定”。

默认应该存：

- Hermes 是大脑：读项目、拆需求、制定方案、派单、最终验收。
- Hermes 不直接承担所有执行动作，除非任务很小。
- Hermes 需要把任务拆成目标、输入、输出、验收标准、风险。
- Hermes 需要让 OpenClaw 或 Claude Code 在新控制面板中可见执行。

不要存：

- 模型密钥。
- API 地址。
- 具体用户账号。

#### memories/MEMORY.md

用途：

- Hermes 的长期事实和决策记忆。
- 存经过沉淀的产品规则和协作规则。

默认应该存：

- SuperClaw 的三层架构：
  - Hermes：大脑、规划、审核。
  - OpenClaw：执行、桌面/浏览器/文件操作。
  - Claude Code：原生代码能力、代码审核、终端执行。
- 派单协议：
  - 任务目标。
  - 目标文件。
  - 验收标准。
  - 禁止事项。
  - 交付格式。
- 速度规则：
  - 普通聊天不加载大量 skills。
  - 明确意图时才触发工具。
  - 需要工具时先判断是否已有能力；没有时询问是否安装。
- 打包规则：
  - 绿色版必须 U 盘可运行。
  - 数据放 `resources/data`。
  - 不依赖系统 Node。
  - 不写死密钥。

不要存：

- 每次聊天全文。
- 未脱敏 API Key。
- 客户敏感业务数据。

#### memories/USER.md

用途：

- 用户画像和偏好。

默认应该存：

- 用户偏好中文。
- 用户希望我直接操作、做完检查再汇报。
- 用户重视绿色版、打包、客户可用、速度。
- 用户希望工具能力隐藏在按钮和意图触发后面，而不是每轮对话都塞进去。

不要存：

- 个人隐私。
- 明文账号密码。

#### config.yaml

用途：

- Hermes 配置。
- 包括模型、工具集、TTS、压缩、日志等。

默认应该存：

- provider 名称和模型名称。
- 非密钥配置。
- 默认模型选择。

不要存：

- 明文 API Key。
- token。

#### .env

用途：

- 本地运行密钥。

默认应该存：

- 打包模板中只允许占位符。
- 用户登录或后台接口获取后再写入运行时文件。

不要提交：

- 真实 `.env`。

## 三、Claude Code Agent

### 生效路径

SuperClaw 当前启动代码会把 Claude Code 的便携 HOME 和项目目录设置为：

```text
resources/data/claude-code/home/
resources/data/claude-code/projects/
```

因此默认文档必须放在：

```text
resources/data/claude-code/home/.claude/CLAUDE.md
resources/data/claude-code/home/.claude/settings.json
resources/data/claude-code/projects/CLAUDE.md
resources/data/claude-code/projects/.claude/rules/superclaw.md
```

### 文件清单和默认存档内容

#### projects/CLAUDE.md

用途：

- Claude Code 的项目级记忆。
- 原生 Claude Code 启动在项目目录时会读取。

默认应该存：

- SuperClaw 项目架构。
- Claude Code 的职责：代码理解、代码修改、代码审核、运行测试。
- 工作规则：小步改动、保留用户修改、不写死密钥、不覆盖配置。
- 交付格式：修改内容、文件、测试、风险。

不要存：

- 全量历史聊天。
- OpenClaw/Hermes 的模型密钥。

#### projects/.claude/rules/superclaw.md

用途：

- Claude Code 的项目规则补充。
- 用来说明 SuperClaw 内部协作方式。

默认应该存：

- Hermes 是规划和最终审核。
- Claude Code 是代码执行/审核 worker。
- 只处理当前面板派发任务。
- 完成后必须回传改动、检查、风险。

#### home/.claude/CLAUDE.md

用途：

- Claude Code 用户级偏好。
- 绿色版便携 HOME 下的用户记忆。

默认应该存：

- 用户偏好中文。
- 汇报要简洁。
- 出错要说明原因和下一步。
- 不要擅自删除/覆盖。

#### home/.claude/settings.json

用途：

- Claude Code 用户级设置。

默认应该存：

- 当前建议保持 `{}`。
- 不写不确定字段，避免和 Claude Code 官方 schema 冲突。

不要存：

- 权限绕过配置。
- 真实密钥。
- 本机路径。

## 四、共享记忆建议

为了避免三套 agent 各写各的，建议后续增加统一源：

```text
resources/data/superclaw-memory/shared/
├─ USER.md
├─ PROJECT.md
├─ TOOL_POLICY.md
└─ SAFETY.md
```

同步策略：

- `shared/USER.md` 同步到 Hermes `USER.md`、OpenClaw `USER.md`、Claude `home/.claude/CLAUDE.md` 的用户偏好段。
- `shared/PROJECT.md` 同步到 Hermes `MEMORY.md`、OpenClaw `MEMORY.md`、Claude `projects/CLAUDE.md` 的项目段。
- `shared/TOOL_POLICY.md` 同步到 OpenClaw `TOOLS.md`、Hermes `MEMORY.md`、Claude `rules/superclaw.md`。
- `shared/SAFETY.md` 同步到所有 agent 的安全段。

## 五、更新规则

### 可以自动更新

- 稳定用户偏好。
- 已验证的项目路径。
- 已验证的打包流程。
- 已验证的工具触发规则。
- 多次复用的故障处理结论。

### 需要用户确认后更新

- 用户身份和长期偏好。
- 客户项目资料。
- 自动化/桌面控制权限。
- 删除、覆盖、联网安装相关规则。

### 禁止写入

- 完整 API Key。
- Bearer token。
- 私钥、证书。
- 登录态 cookie。
- 客户隐私原文。
- 远端仓库凭据。

## 六、打包检查要求

打包前检查：

- `resources/data/.openclaw/workspace/MEMORY.md` 存在。
- `resources/data/hermes/memories/MEMORY.md` 存在。
- `resources/data/hermes/memories/USER.md` 存在。
- `resources/data/claude-code/projects/CLAUDE.md` 存在。
- `resources/data/claude-code/home/.claude/CLAUDE.md` 存在。
- `resources/data/claude-code/home/.claude/settings.json` 是合法 JSON。
- 新增文档没有 `sk-`、Bearer、Authorization、明文 api key。

运行时检查：

- OpenClaw 控制面板记忆页能看到 workspace 核心文件。
- Hermes 记忆页能看到 Notes、User、Soul 三块。
- Claude Code 原生启动目录中能读到 `CLAUDE.md`。
