# SuperClaw 日志按天记录 + 当天错误日志上传方案（v2）

> 日期：2026-08-12 ｜ 状态：待评审
> 目标：错误日志按天切割（每天一个文件），用户可一键上传"当天错误日志"用于问题排查。
> v2 更新：保留 15 天；上传含当天正常日志尾部；上传前预览/勾选排除项；新增后端接口规范（六）。

---

## 一、现状盘点（已核实代码）

### 1.1 OpenClaw（日志由 Rust 托管，全部在 `{openclaw_dir}/logs/`）

| 文件 | 内容 | 写入方 | 轮转 |
|---|---|---|---|
| `gateway.log` | Gateway 进程 stdout（OpenClaw node 运行时输出） | `service.rs:1013` OpenOptions append | ❌ 无（开发目录已 1.2MB，持续增长） |
| `gateway.err.log` | Gateway 进程 stderr（错误输出） | `service.rs:1019` / `service.rs:1705` append | ❌ 无（已 119KB） |
| `guardian.log` | 后端守护（自动重启/自愈）日志 | `service.rs:539 guardian_log()` append | ❌ 无 |
| `guardian-backup.log` | 配置备份记录 | `logs.rs:16` log_path 映射（存在但未活跃写入） | ❌ 无 |
| `config-audit.jsonl` | 配置变更审计 | dev-api/Rust | ❌ 无 |
| `stability/*.json` | 启动失败快照（`openclaw-stability-<时间戳>-<pid>-<事件>.json`） | gateway observer | ✅ 天然按事件时间戳命名 |

- 前端日志查看器 `src/pages/logs.js`：tab = `gateway / gateway-err / guardian / guardian-backup / config-audit`
- 读取命令 `read_log_tail`（`logs.rs:24`）：`log_path()` 映射**固定文件名**，从尾部最多读 1MB、取 N 行

### 1.2 Hermes（Python 引擎 + Rust 托管）

| 文件 | 内容 | 写入方 | 轮转 |
|---|---|---|---|
| `logs/agent.log` | INFO+ 主活动日志 | Python `hermes_logging.py` RotatingFileHandler | ✅ 按大小 5MB × 3（可配） |
| `logs/errors.log` | WARNING+ 错误日志 | 同上（固定 2MB × 2） | ✅ 按大小 |
| `logs/gateway.log` | gateway 组件日志（mode=gateway） | 同上（5MB × 3） | ✅ 按大小 |
| `gateway-run.log` | Gateway 进程 stdout **和** stderr 合并 | `hermes.rs:383` 同一文件句柄 append | ❌ 无 |
| `logs/gateway-exit-diag.log` | 网关异常退出诊断 | Rust | ❌ 无 |

- `config.yaml` 已支持 `logging.{level, max_size_mb, backup_count}`（`hermes_logging.py:_read_logging_config` 读取）
- **无 `TimedRotatingFileHandler`（按天）——Hermes 只有按大小轮转**
- 前端 `/h/logs`（`src/engines/hermes/pages/logs.js`）：`hermes_logs_list / hermes_logs_read / hermes_logs_download`
- `hermes_logs_download`（`hermes.rs:7115`）是**本地下载**到 `下载/ClawPanel/`，**不是上传**

### 1.3 上传 / 反馈通道

- ❌ **没有任何日志上传机制**：无 upload 命令、无反馈入口
- 唯一导出：Hermes `hermes_logs_download`（本地保存）、记忆导出 `export_memory_zip`

### 1.4 现状结论

1. **OpenClaw 日志无任何轮转**，`gateway.log` 单文件无限增长（已 1.2MB），错误日志 `gateway.err.log` 与正常日志混杂在同一生命周期
2. **Hermes 有按大小轮转**（RotatingFileHandler），但**没有按天**；且进程级 stderr 与 stdout 合并进同一个 `gateway-run.log`，无法单独取"当天错误"
3. 两套引擎的"错误日志"形态不统一：OpenClaw 靠 stderr 重定向文件，Hermes 靠 Python 级 WARNING+ 过滤
4. 用户无法上传日志，排查问题只能口头描述

---

## 二、设计目标

1. **错误日志按天记录**：每天一个错误日志文件，命名含日期（`gateway.err-2026-08-12.log`）
2. **一键上传当天错误日志**：用户在界面点按钮，自动收集当天错误日志 + 环境上下文，打包上传
3. **保留策略**：按天日志保留 **15 天**，防磁盘膨胀
4. **兼容现有前端**：日志查看器默认读当天文件，可切换历史日期；旧的无日期文件不受影响

---

## 三、方案设计

### 3.1 按天日志：Rust 统一接管（核心改动）

新增工具模块 `src-tauri/src/commands/log_rotate.rs`：

```rust
/// 返回当天日志路径：{logs_dir}/{stem}-{YYYY-MM-DD}{ext}
/// 例：gateway.err-2026-08-12.log
pub fn daily_path(logs_dir: &Path, stem: &str, ext: &str) -> PathBuf;

/// 跨天检测：写入前检查是否存在"昨天"的同 stem 文件，存在则滚动。
/// 实现：以"当前已打开/写入的文件名"为准——首次写入某天时若发现旧文件
/// 文件名不含今天日期，先重命名为昨天日期，再写新文件。
pub fn append_daily(logs_dir: &Path, stem: &str, ext: &str, line: &str);

/// 启动时清理 N 天前的按天日志（保留策略）
pub fn prune_daily_logs(logs_dir: &Path, keep_days: u32);
```

**OpenClaw 侧改点（3 处）**：

| 改点 | 原 | 新 |
|---|---|---|
| `service.rs:1013` stdout | `gateway.log` | `gateway-{date}.log` |
| `service.rs:1019/1705` stderr | `gateway.err.log` | `gateway.err-{date}.log` |
| `service.rs:539 guardian_log()` | `guardian.log` | `guardian-{date}.log` |

**Hermes 侧改点（1 处）**：

| 改点 | 原 | 新 |
|---|---|---|
| `hermes.rs:371-384` | stdout+stderr 合并写 `gateway-run.log` | stdout → `gateway-run-{date}.log`；**stderr → `errors-{date}.log`（独立按天错误文件）** |

- Python 级 `errors.log`（WARNING+）保持按大小轮转（引擎内部机制，Rust 不干预）
- 这样 Hermes 有**两个错误来源**：进程级 stderr（按天，Rust 管）+ Python 级 errors.log（按大小，引擎管），上传时合并当天部分

**旧日志处理**：历史上已有的无日期文件（`gateway.log` 等）保留不删，前端仍可读；按天文件出现后前端默认指向当天文件。

### 3.2 前端日志查看器适配

- `src/pages/logs.js`（OpenClaw tab）与 `src/engines/hermes/pages/logs.js`：
  - 增加"日期"下拉（默认今天，列出最近 15 天有日志的日期）
  - `read_log_tail` / `hermes_logs_read` 增加可选 `date` 参数；未传时读当天文件；当天文件不存在回退读旧名文件
- `logs.rs:log_path()` 增加 `gateway-err` 等按天解析逻辑

### 3.3 上传当天错误日志

**入口**：设置页 + 日志页各一个按钮「上传今天的错误日志」

**Rust 命令 `collect_today_error_logs`（新增）**：

1. 收集（按当前日期 `{today}`）：
   - **当天错误日志**：
     - OpenClaw：`gateway.err-{today}.log`（进程 stderr）、`guardian-{today}.log`、`stability/` 今天的快照
     - Hermes：`errors-{today}.log`（新，进程 stderr 按天）、Python `errors.log` 中今天时间戳的行、`gateway-exit-diag.log`
   - **当天正常日志尾部**（还原现场用，默认 ≤512KB/文件）：
     - OpenClaw：`gateway-{today}.log` 尾部
     - Hermes：`gateway-run-{today}.log` 尾部、`agent.log` 中今天的行
2. 附加环境上下文（`manifest.json`）：应用版本、引擎版本、OS、Gateway 状态、配置摘要（**API key 脱敏**）
3. 打包 zip → **用户预览/编辑**（见 3.5）→ 上传

**上传通道**：后端接口见「六、后端上传接口规范」。后端未就绪时，v1 先落本地暂存目录 `{app_data}/log-upload/` 并给出 zip 路径，提示用户手动提交。

**上传成功** toast「已上传，可联系支持人员处理」；失败给出本地 zip 路径兜底。

### 3.4 保留策略

- 按天日志保留 **15 天**，由 `prune_daily_logs` 在应用启动时清理
- Python 级轮转（agent.log 5MB×3 等）由引擎自身管理，不动

### 3.5 上传前预览 / 编辑（勾选排除项）

点击「上传今天的错误日志」后弹出**上传预览对话框**：

1. **文件清单**：列出将上传的每个文件（名称、大小、行数、来源引擎），默认全部勾选
2. **排除项勾选**：用户可取消勾选不想上传的文件（如怀疑含隐私的日志），排除项记录进 `manifest.json.excluded` 与 `excluded.txt`
3. **内容预览**：点击文件名查看内容（滚动查看，**脱敏后显示**：apiKey/token/Authorization 自动打码）
4. **备注**：可选输入框，随 manifest 上传（用户描述问题现象）
5. **确认上传 / 取消**：确认后打包上传；取消则关闭且不产生上传

---

## 四、实施计划（分 4 个 Phase）

| Phase | 内容 | 涉及文件 | 验证 |
|---|---|---|---|
| **P1** 按天工具 + OpenClaw 改点 | `log_rotate.rs` 新增（保留 15 天）；service.rs 3 处改 append_daily | `src-tauri/src/commands/log_rotate.rs`（新）、`service.rs`、`mod.rs` | cargo check + 跨天滚动单测 |
| **P2** Hermes 进程日志分离 | hermes.rs stderr 独立按天；`/h/logs` 日期选择 | `hermes.rs`、`logs.js`（两个）、`logs.rs` | 启动/停止 gateway 观察文件命名 |
| **P3** 上传（含预览/编辑） | `collect_today_error_logs`（错误+正常尾部）+ 脱敏 + zip + 上传对话框（文件清单勾选排除/预览/备注）+ 上传端点（或本地暂存兜底） | 新 `log_upload.rs`、`settings.js`、`logs.js`、`tauri-api.js` | 手动触发一次，核对 zip 内容与排除项 |
| **P4** 收尾 | 脱敏扫描、prune 15 天保留、旧日志兼容回退、接口联调 | 同上 | 全量回归 + 后端联调 |

---

## 六、后端上传接口规范（给后端实现）

### 6.1 接口定义

```
POST {base_url}/api/v1/log-upload
Content-Type: multipart/form-data
Authorization: Bearer {token}        # 可选；若接入登录态则必填
```

| 表单字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `file` | file | ✅ | zip 包（结构见 6.3），≤20MB |
| `client_id` | string | ✅ | 设备/安装唯一 ID（UUID，本地持久化） |
| `client_version` | string | ✅ | 应用版本，如 `1.0.7` |
| `engine` | string | ✅ | `openclaw` / `hermes` / `both` |
| `upload_date` | string | ✅ | 日志所属本地日期，`YYYY-MM-DD` |
| `remark` | string | ❌ | 用户备注（≤500 字符） |

### 6.2 响应与错误码

**成功（200）**：
```json
{ "code": 0, "data": { "upload_id": "log-20260812-xxxx", "expires_at": "2026-08-19T00:00:00+08:00" } }
```

| HTTP | code | 场景 |
|---|---|---|
| 200 | 0 | 成功，返回 upload_id 与保留到期时间 |
| 400 | 10001 | 缺少 `file` / `client_id` / `upload_date` |
| 400 | 10002 | 文件类型不是 zip |
| 413 | 10003 | 超过 20MB 限制 |
| 429 | 10004 | 频率限制：同一 `client_id` 1 次/分钟 |
| 401 | 10005 | 鉴权失败（接入登录态时） |
| 500 | 10500 | 服务器内部错误 |

### 6.3 zip 包结构（客户端生成）

```
log-YYYYMMDD-<client_id前8位>.zip
├── manifest.json          # 环境上下文（见 6.4）
├── excluded.txt           # 用户勾选排除的文件清单（无则省略）
├── openclaw/
│   ├── gateway.err-YYYY-MM-DD.log      # 当天进程错误（stderr）
│   ├── guardian-YYYY-MM-DD.log         # 当天守护日志
│   ├── gateway-YYYY-MM-DD.log.tail     # 当天正常日志尾部 ≤512KB
│   └── stability-*.json                # 当天启动失败快照
└── hermes/
    ├── errors-YYYY-MM-DD.log           # 当天进程错误（stderr，按天）
    ├── errors.log.today                # Python WARNING+ 中当天行
    ├── gateway-run-YYYY-MM-DD.log.tail # 当天进程输出尾部 ≤512KB
    └── agent.log.today                 # agent.log 中当天的行
```

### 6.4 manifest.json 字段

```json
{
  "app_version": "1.0.7",
  "client_id": "uuid",
  "os": "Windows 11 23H2 (x64)",
  "engine": "both",
  "upload_date": "2026-08-12",
  "upload_at": "2026-08-12T18:00:00+08:00",
  "gateway_status": "running",
  "files": [ { "name": "openclaw/gateway.err-2026-08-12.log", "size": 20480, "lines": 312 } ],
  "excluded": ["hermes/agent.log.today"],
  "remark": "用户备注（可选）",
  "stats": { "error_count": 3, "warn_count": 7 }
}
```

### 6.5 服务端要求（后端实现时遵守）

1. **存储**：对象存储（COS/OSS）或磁盘目录，按 `upload_id` 组织；**TTL 7 天**自动清理
2. **解压安全**：防 zip 路径穿越（拒绝 `../`、绝对路径、符号链接）；仅接受白名单文件类型 `.log/.txt/.json/.tail`
3. **大小/频率限制**：单 zip ≤20MB；同 `client_id` 1 次/分钟
4. **脱敏复核**：服务端可对 manifest 中的 apiKey 字段再次掩码
5. **合规**：日志含用户对话内容与密钥，仅用于问题排查，不可用于训练；默认 7 天后删除；提供 `GET /api/v1/log-upload/{upload_id}` 供支持人员按 ID 拉取

### 6.6 客户端脱敏（上传前）

- 正则脱敏：`sk-[A-Za-z0-9_-]{8,}`、`Bearer [A-Za-z0-9._-]+`、`Authorization:.*`、`apiKey["']?\s*[:=]\s*["'][^"']+`
- Hermes Python 级已由 `RedactingFormatter` 引擎内脱敏，客户端对 Rust 侧日志再兜底一次
- 预览对话框内展示的也是脱敏后内容

---

## 七、待确认事项（已确认项关闭）

| 项 | 结论 |
|---|---|
| ✅ 上传通道 | 无现成后端 → 按「六、后端上传接口规范」由后端实现；v1 客户端先做本地暂存兜底 |
| ✅ 保留天数 | **15 天** |
| ✅ 上传范围 | 当天错误日志 + **当天正常日志尾部**（≤512KB/文件） |
| ✅ 上传前预览 | 文件清单勾选排除项 + 脱敏预览 + 备注，确认后上传 |
| ⏳ 上传按钮位置 | 设置页 + 日志页各一个（默认方案，可再调） |
| ⏳ 接口 base_url | 待后端提供（可在设置页配置或内置默认） |

---

## 附：相关代码位置索引

| 位置 | 说明 |
|---|---|
| `src-tauri/src/commands/logs.rs:7-20` | `log_dir()` / `log_path()` 固定文件名映射 |
| `src-tauri/src/commands/logs.rs:24` | `read_log_tail`（尾部 1MB / N 行） |
| `src-tauri/src/commands/service.rs:1013-1029` | OpenClaw Gateway stdout→gateway.log, stderr→gateway.err.log |
| `src-tauri/src/commands/service.rs:539` | `guardian_log()` append guardian.log |
| `src-tauri/src/commands/hermes.rs:371-384` | Hermes gateway stdout+stderr 合并 → gateway-run.log |
| `src-tauri/src/commands/hermes.rs:7115` | `hermes_logs_download`（本地下载，非上传） |
| `hermes_logging.py:210-260` | agent.log / errors.log / gateway.log RotatingFileHandler 配置 |
| `hermes_logging.py:365` | `_read_logging_config`（config.yaml `logging.*`） |
| `src/pages/logs.js:10-40` | OpenClaw 日志 tab 清单 |
| `src/engines/hermes/pages/logs.js` | Hermes 日志页 |
