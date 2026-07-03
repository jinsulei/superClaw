//! Hermes Agent 安装与管理命令
//!
//! 通过 uv (Astral) 实现零依赖安装：
//!   1. 下载 uv 单文件二进制
//!   2. uv tool install hermes-agent --python 3.11
//!   3. 写入 ~/.hermes/config.yaml + .env
//!
//! 参考：
//!   - uv docs: https://docs.astral.sh/uv/
//!   - Hermes 官方安装: https://hermes-agent.nousresearch.com/docs/getting-started/installation/

use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::OnceLock;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ---------------------------------------------------------------------------
// Gateway Guardian — 进程守护 + 状态追踪
// ---------------------------------------------------------------------------

/// 我们 spawn 的 Gateway 进程 PID（0 表示没有）
static GW_PID: AtomicU32 = AtomicU32::new(0);
/// Guardian 是否正在运行
static GW_GUARDIAN_ACTIVE: AtomicBool = AtomicBool::new(false);
/// 通知 guardian 停止的 flag
static GW_GUARDIAN_STOP: AtomicBool = AtomicBool::new(false);
/// 缓存 AppHandle 供 guardian 发送事件
static GW_APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// 获取 Gateway 的完整 URL（当前本地，未来可扩展为远程）
fn hermes_gateway_custom_url() -> Option<String> {
    super::read_panel_config_value()
        .and_then(|v| {
            v.get("hermes")?
                .get("gatewayUrl")?
                .as_str()
                .map(String::from)
        })
        .filter(|s| !s.trim().is_empty())
        .map(|url| url.trim_end_matches('/').to_string())
}

fn is_loopback_gateway_url(url: &str) -> bool {
    let rest = url
        .trim()
        .strip_prefix("http://")
        .or_else(|| url.trim().strip_prefix("https://"))
        .unwrap_or(url.trim());
    let host = if let Some(stripped) = rest.strip_prefix('[') {
        stripped.split(']').next().unwrap_or("")
    } else {
        rest.split('/')
            .next()
            .unwrap_or("")
            .split(':')
            .next()
            .unwrap_or("")
    };
    let lower = host.trim().to_ascii_lowercase();
    if lower == "localhost" || lower.ends_with(".localhost") {
        return true;
    }
    lower
        .parse::<std::net::IpAddr>()
        .map(|ip| ip.is_loopback())
        .unwrap_or(false)
}

fn hermes_gateway_url() -> String {
    if let Some(url) = hermes_gateway_custom_url() {
        return url;
    }
    let port = hermes_gateway_port();
    format!("http://127.0.0.1:{port}")
}

async fn ensure_managed_gateway_ready(app: &tauri::AppHandle, gw_url: &str) -> Result<(), String> {
    if let Some(url) = hermes_gateway_custom_url() {
        if !is_loopback_gateway_url(&url) {
            return Ok(());
        }
    }
    if gateway_quick_health_check().await {
        start_guardian(app);
        emit_gateway_status(true);
        return Ok(());
    }
    hermes_gateway_action(app.clone(), "start".into())
        .await
        .map(|_| ())
        .map_err(|e| {
            format!(
                "Gateway 未运行且自动启动失败: {e}\nGateway: {gw_url}\n{}",
                hermes_gateway_log_tail(20)
            )
        })
}

fn hermes_gateway_http_client(timeout: std::time::Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .user_agent("ClawPanel")
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())
}

fn reqwest_error_detail(error: &reqwest::Error) -> String {
    use std::error::Error as _;
    let mut detail = error.to_string();
    let mut source = error.source();
    while let Some(item) = source {
        let text = item.to_string();
        if !text.is_empty() && !detail.contains(&text) {
            detail.push_str(": ");
            detail.push_str(&text);
        }
        source = item.source();
    }
    detail
}

fn hermes_gateway_log_tail(limit: usize) -> String {
    let log_path = hermes_home().join("gateway-run.log");
    let content = std::fs::read_to_string(log_path).unwrap_or_default();
    content
        .lines()
        .rev()
        .take(limit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

async fn hermes_run_failure_message(action: &str, gw_url: &str, detail: String) -> String {
    let health_url = format!("{gw_url}/health");
    let health = match hermes_gateway_http_client(std::time::Duration::from_secs(3)) {
        Ok(client) => match client.get(&health_url).send().await {
            Ok(resp) => format!("HTTP {}", resp.status().as_u16()),
            Err(error) => format!("不可达 ({})", reqwest_error_detail(&error)),
        },
        Err(error) => format!("无法创建客户端 ({error})"),
    };
    let log_tail = hermes_gateway_log_tail(12);
    let log_block = if log_tail.trim().is_empty() {
        "最近 Gateway 日志为空".to_string()
    } else {
        format!("最近 Gateway 日志:\n{log_tail}")
    };
    format!(
        "{action}: {detail}\nGateway: {gw_url}\nHealth: {health}\n建议：在 Hermes 服务页点击“重启 Gateway”后重试；如果刚改过模型/API Key，必须重启 Gateway。\n{log_block}"
    )
}

/// 精准杀掉我们 spawn 的 Gateway 进程
fn kill_gateway_pid() -> bool {
    let pid = GW_PID.load(Ordering::SeqCst);
    if pid == 0 {
        return false;
    }
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/F", "/PID", &pid.to_string()]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let ok = cmd.output().map(|o| o.status.success()).unwrap_or(false);
        if ok {
            GW_PID.store(0, Ordering::SeqCst);
        }
        ok
    }
    #[cfg(not(target_os = "windows"))]
    {
        let ok = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if ok {
            GW_PID.store(0, Ordering::SeqCst);
        }
        ok
    }
}

#[cfg(target_os = "windows")]
fn kill_hermes_gateway_port_owner() -> bool {
    let port = hermes_gateway_port();
    let cleaned = crate::agent_lifecycle::cleanup_verified_stale_port_owners(
        port,
        Some(crate::agent_lifecycle::ManagedAgent::Hermes),
        "hermes-gateway-restart",
    );
    if cleaned {
        GW_PID.store(0, Ordering::SeqCst);
    }
    cleaned
}

#[cfg(not(target_os = "windows"))]
fn kill_hermes_gateway_port_owner() -> bool {
    false
}

/// Guardian 后台任务：定期健康检查，失败时自动重启
async fn gateway_guardian_loop() {
    const CHECK_INTERVAL_SECS: u64 = 15;
    const MAX_FAIL_BEFORE_RESTART: u32 = 3;
    const MAX_RESTART_ATTEMPTS: u32 = 5;
    const RESTART_BACKOFF_BASE_SECS: u64 = 5;

    let mut consecutive_fails: u32 = 0;
    let mut restart_count: u32 = 0;
    let mut last_known_running = true;

    loop {
        // 检查是否被要求停止
        if GW_GUARDIAN_STOP.load(Ordering::SeqCst) {
            break;
        }

        tokio::time::sleep(std::time::Duration::from_secs(CHECK_INTERVAL_SECS)).await;

        if GW_GUARDIAN_STOP.load(Ordering::SeqCst) {
            break;
        }

        // 健康检查
        let healthy = gateway_quick_health_check().await;

        if healthy {
            if !last_known_running {
                // 状态恢复
                emit_gateway_status(true);
                last_known_running = true;
            }
            consecutive_fails = 0;
            restart_count = 0; // 稳定运行一段时间后重置重启计数
        } else {
            consecutive_fails += 1;

            if last_known_running && consecutive_fails >= 2 {
                // 状态变为离线
                emit_gateway_status(false);
                last_known_running = false;
            }

            if consecutive_fails >= MAX_FAIL_BEFORE_RESTART {
                if restart_count >= MAX_RESTART_ATTEMPTS {
                    // 超过最大重启次数，放弃
                    emit_guardian_log(&format!(
                        "Gateway 已连续重启 {} 次仍然失败，Guardian 停止自动恢复",
                        restart_count
                    ));
                    break;
                }

                // 指数退避重启
                let backoff = RESTART_BACKOFF_BASE_SECS * (1 << restart_count.min(4));
                emit_guardian_log(&format!(
                    "Gateway 连续 {} 次健康检查失败，{}s 后尝试重启 (第 {} 次)",
                    consecutive_fails,
                    backoff,
                    restart_count + 1
                ));
                tokio::time::sleep(std::time::Duration::from_secs(backoff)).await;

                if GW_GUARDIAN_STOP.load(Ordering::SeqCst) {
                    break;
                }

                // 尝试重启
                match do_restart_gateway().await {
                    Ok(_) => {
                        emit_guardian_log("Gateway 自动重启成功");
                        emit_gateway_status(true);
                        last_known_running = true;
                        consecutive_fails = 0;
                        restart_count += 1;
                    }
                    Err(e) => {
                        emit_guardian_log(&format!("Gateway 自动重启失败: {e}"));
                        restart_count += 1;
                    }
                }
            }
        }
    }

    GW_GUARDIAN_ACTIVE.store(false, Ordering::SeqCst);
}

/// 快速健康检查（TCP + HTTP，1s 超时）
async fn gateway_quick_health_check() -> bool {
    let url = hermes_gateway_url();
    let health_url = format!("{url}/health");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .no_proxy()
        .build();
    match client {
        Ok(c) => c
            .get(&health_url)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// 重启 Gateway（kill 旧进程 → 启动新进程）
async fn wait_gateway_stopped(max_wait_ms: u64) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(max_wait_ms);
    loop {
        if !gateway_quick_health_check().await {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
}

async fn do_restart_gateway() -> Result<(), String> {
    // 1. 杀掉旧进程
    kill_gateway_pid();
    kill_hermes_gateway_port_owner();
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    if !wait_gateway_stopped(3000).await {
        kill_hermes_gateway_port_owner();
        if !wait_gateway_stopped(3000).await {
            return Err("Gateway restart requested, but the old process is still reachable".into());
        }
    }

    // 2. 清理 PID 文件
    let home = hermes_home();
    let pid_file = home.join("gateway.pid");
    if pid_file.exists() {
        let _ = std::fs::remove_file(&pid_file);
    }

    // 3. 修正 uv tool pyvenv.cfg Python 路径，然后启动新进程
    patch_uv_tool_pyvenv_cfgs();
    let enhanced = hermes_enhanced_path();
    let log_path = home.join("gateway-run.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("打开日志失败: {e}"))?;
    let log_err = log_file
        .try_clone()
        .map_err(|e| format!("克隆日志句柄失败: {e}"))?;

    let mut cmd = hermes_command(&["gateway", "run"], &enhanced);
    cmd.stdin(std::process::Stdio::null())
        .stdout(log_file)
        .stderr(log_err);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    // 注入 .env
    let env_path = home.join(".env");
    if let Ok(env_content) = std::fs::read_to_string(&env_path) {
        for line in env_content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, val)) = line.split_once('=') {
                cmd.env(key.trim(), val.trim());
            }
        }
    }

    if let Some(runtime_error) = hermes_portable_runtime_error() {
        let _ = std::fs::write(&log_path, &runtime_error);
        return Err(format!("Hermes gateway run failed: {runtime_error}"));
    }

    let child = cmd.spawn().map_err(|e| {
        format!(
            "Hermes gateway run failed: {e}\n{}",
            hermes_runtime_diagnostics()
        )
    })?;
    GW_PID.store(child.id(), Ordering::SeqCst);
    register_hermes_lifecycle_process(child.id(), &enhanced);

    // 4. 等待端口可达（最多 15s）
    let port = hermes_gateway_port();
    let addr: std::net::SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(500))
            .is_ok()
        {
            return Ok(());
        }
    }
    Err("Gateway 重启后端口未就绪".into())
}

/// 发送 Gateway 状态事件给前端
fn emit_gateway_status(running: bool) {
    if let Some(app) = GW_APP_HANDLE.get() {
        let port = hermes_gateway_port();
        let _ = app.emit(
            "hermes-gateway-status",
            serde_json::json!({
                "running": running,
                "port": port,
                "url": hermes_gateway_url(),
            }),
        );
    }
}

/// 发送 Guardian 日志事件给前端
fn emit_guardian_log(msg: &str) {
    if let Some(app) = GW_APP_HANDLE.get() {
        let _ = app.emit("hermes-guardian-log", msg);
    }
}

/// 启动 Guardian（如果尚未运行）
fn start_guardian(app: &tauri::AppHandle) {
    let _ = GW_APP_HANDLE.set(app.clone());
    if GW_GUARDIAN_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        GW_GUARDIAN_STOP.store(false, Ordering::SeqCst);
        tokio::spawn(gateway_guardian_loop());
    }
}

/// 停止 Guardian
fn stop_guardian() {
    GW_GUARDIAN_STOP.store(true, Ordering::SeqCst);
}

// ---------------------------------------------------------------------------
// 路径工具
// ---------------------------------------------------------------------------

/// Hermes 配置目录
/// - 优先使用 $HERMES_HOME 环境变量（若已设置）
/// - 新便携结构: <app_root>/resources/data/hermes/
/// - 旧便携结构: <app_root>/data/hermes/
/// - Dev 模式兜底: ~/.hermes/（让 dev 环境复用打包版已安装的 Hermes 配置）
fn hermes_home() -> PathBuf {
    if let Ok(h) = std::env::var("HERMES_HOME") {
        return PathBuf::from(h);
    }

    #[cfg(debug_assertions)]
    {
        let dev_home = app_root_dir().join(".dev-data").join("hermes");
        ensure_dev_hermes_home(&dev_home);
        return dev_home;
    }

    #[cfg(not(debug_assertions))]
    {
        // 新结构优先：resources/data/hermes/
        let new_path = app_root_dir().join("resources").join("data").join("hermes");
        if new_path.exists() {
            return new_path;
        }
        app_root_dir().join("data").join("hermes")
    }
}

#[cfg(debug_assertions)]
fn ensure_dev_hermes_home(dev_home: &Path) {
    let _ = std::fs::create_dir_all(dev_home);
    let seed = app_root_dir()
        .join("src-tauri")
        .join("resources")
        .join("data")
        .join("hermes");

    for name in ["config.yaml", ".env", "SOUL.md", "channel_directory.json"] {
        let from = seed.join(name);
        let to = dev_home.join(name);
        if from.is_file() && !to.exists() {
            let _ = std::fs::copy(from, to);
        }
    }

    for name in ["skills", "plugins", "dashboard-themes"] {
        let from = seed.join(name);
        let to = dev_home.join(name);
        if from.is_dir() && !to.exists() {
            let mut stats = CopyMissingStats::default();
            let _ = copy_dir_missing_recursively(&from, &to, &mut stats);
        }
    }
}

/// 应用根目录（便携/Dev 模式）
/// - Dev 模式: 项目根目录（src-tauri/ 的父目录，即 package.json 所在目录）
/// - 便携/安装模式: exe 所在目录
fn app_root_dir() -> PathBuf {
    // Dev 模式优先：编译时确定的项目根目录
    #[cfg(debug_assertions)]
    {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR")); // src-tauri/
        if let Some(parent) = manifest.parent() {
            return parent.to_path_buf();
        }
    }

    // 便携/安装模式：exe 所在目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return dir.to_path_buf();
        }
    }

    // 兜底：当前目录
    std::env::current_dir().unwrap_or_default()
}

/// ClawPanel 管理的 uv 二进制存放路径
/// - 新结构: <app_root>/resources/bin/
/// - 旧结构: <app_root>/bin/（Dev 模式或旧 MSI 部署）
fn uv_bin_dir() -> PathBuf {
    let new_path = app_root_dir().join("resources").join("bin");
    if new_path.exists() {
        return new_path;
    }
    app_root_dir().join("bin")
}

/// uv tool 安装目录
/// - 新结构: <app_root>/resources/uv-tools/
/// - 旧结构: <app_root>/uv-tools/（Dev 模式或旧 MSI 部署）
/// 对应 UV_TOOL_DIR 环境变量，控制 uv tool install 的目标目录
fn uv_tool_dir() -> PathBuf {
    if let Some(resources) = super::app_resources_dir() {
        let runtime_path = resources.join("runtime").join("uv-tools");
        if runtime_path.exists() {
            return runtime_path;
        }
        let legacy_resource_path = resources.join("uv-tools");
        if legacy_resource_path.exists() {
            return legacy_resource_path;
        }
    }

    let new_path = app_root_dir()
        .join("src-tauri")
        .join("resources")
        .join("runtime")
        .join("uv-tools");
    if new_path.exists() {
        return new_path;
    }
    let new_path = app_root_dir().join("resources").join("runtime").join("uv-tools");
    if new_path.exists() {
        return new_path;
    }
    let new_path = app_root_dir().join("resources").join("uv-tools");
    if new_path.exists() {
        return new_path;
    }
    app_root_dir().join("uv-tools")
}

/// uv tool 安装的可执行文件目录（便携模式）
fn uv_tool_bin_dir() -> PathBuf {
    uv_tool_dir().join("bin")
}

/// uv Python 安装缓存目录
/// - 新结构: <app_root>/resources/uv-python/
/// - 旧结构: <app_root>/uv-python/（Dev 模式或旧 MSI 部署）
/// 对应 UV_PYTHON_INSTALL_DIR 环境变量，控制 uv download 的 Python 解释器存放位置
fn uv_python_dir() -> PathBuf {
    if let Some(resources) = super::app_resources_dir() {
        let runtime_path = resources.join("runtime").join("uv-python");
        if runtime_path.exists() {
            return runtime_path;
        }
        let legacy_resource_path = resources.join("uv-python");
        if legacy_resource_path.exists() {
            return legacy_resource_path;
        }
    }

    let new_path = app_root_dir()
        .join("src-tauri")
        .join("resources")
        .join("runtime")
        .join("uv-python");
    if new_path.exists() {
        return new_path;
    }
    let new_path = app_root_dir().join("resources").join("runtime").join("uv-python");
    if new_path.exists() {
        return new_path;
    }
    let new_path = app_root_dir().join("resources").join("uv-python");
    if new_path.exists() {
        return new_path;
    }
    app_root_dir().join("uv-python")
}

/// 准备 uv Python 缓存目录：清理残留临时文件，并尝试从本地压缩包预缓存 Python
/// 返回 Some(path) 表示可用便携缓存（即使 .temp/ 清理失败也会返回 Some）
/// None 仅在目录创建失败时返回（此时 uv 使用默认缓存 ~/.uv/python/）
fn prepare_uv_python_dir() -> Option<PathBuf> {
    let dir = uv_python_dir();

    // 清理上次失败残留的 .temp/ 目录（权限冲突常见原因）
    let temp_dir = dir.join(".temp");
    if temp_dir.exists() {
        match std::fs::remove_dir_all(&temp_dir) {
            Ok(_) => {}
            Err(e) => {
                // 清理失败不要阻断流程，.temp/ 是 uv 下载缓存残留，不影响已解压的 Python
                // 返回 None 会导致 UV_PYTHON_INSTALL_DIR 不设置，Python 预缓存失效
                eprintln!("[prepare_uv_python_dir] ⚠ .temp/ 清理失败 (继续使用便携缓存): {e}");
            }
        }
    }

    // 确保目标目录存在（uv 会自动写入到此目录）
    if std::fs::create_dir_all(&dir).is_err() {
        return None;
    }

    // 尝试从本地 resources/cpython-*.tar.gz 预缓存 Python 解释器
    // 避免 uv 从网络下载（网络经常失败）
    extract_bundled_python(&dir);

    Some(dir)
}

/// 查找内置 Python 压缩包路径（Dev: src-tauri/resources/，便携: exe 同级 resources/）
fn bundled_python_archive_path() -> Option<PathBuf> {
    // 1. exe/app 同级 resources/（便携/安装模式）
    let root = app_root_dir();
    let exe_res_dir = root.join("resources");
    if let Ok(entries) = std::fs::read_dir(&exe_res_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("cpython-") && name_str.ends_with(".tar.gz") {
                return Some(entry.path());
            }
        }
    }

    // 2. Dev 模式：src-tauri/resources/（源代码目录）
    #[cfg(debug_assertions)]
    {
        let dev_res_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        if let Ok(entries) = std::fs::read_dir(&dev_res_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("cpython-") && name_str.ends_with(".tar.gz") {
                    return Some(entry.path());
                }
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// 预部署 bundle 支持（开箱即用）
// ---------------------------------------------------------------------------

/// 预部署资源根目录（包含 uv-tools/、uv-python/、data/、bin/ 等子目录）
/// 查找顺序：exe 同级 resources/ → src-tauri/resources/
fn bundled_deploy_dir() -> Option<PathBuf> {
    // 1. exe/app 同级 resources/（便携/安装模式）
    let root = app_root_dir();
    let exe_res = root.join("resources");
    if exe_res.join("uv-tools").exists() {
        return Some(exe_res);
    }
    // 2. Dev 模式：src-tauri/resources/（源代码目录）
    #[cfg(debug_assertions)]
    {
        let dev_res = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        if dev_res.join("uv-tools").exists() {
            return Some(dev_res);
        }
    }
    None
}

/// 递归复制目录（简单的文件级复制，不保留权限/链接等）
fn copy_dir_recursively(src: &Path, dst: &Path) -> Result<(), String> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)
            .map_err(|e| format!("创建目录 {} 失败: {e}", dst.display()))?;
    }
    for entry in
        std::fs::read_dir(src).map_err(|e| format!("读取目录 {} 失败: {e}", src.display()))?
    {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("获取文件类型失败: {e}"))?;
        let src_path = entry.path();
        let name = entry.file_name();
        let dst_path = dst.join(&name);

        if file_type.is_dir() {
            copy_dir_recursively(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| {
                format!(
                    "复制 {} → {} 失败: {e}",
                    src_path.display(),
                    dst_path.display()
                )
            })?;
        }
    }
    Ok(())
}

#[derive(Default)]
struct CopyMissingStats {
    dirs_created: usize,
    files_copied: usize,
    files_skipped: usize,
}

/// 递归合并目录，只补齐目标中缺失的文件，不覆盖用户已有 skill。
fn copy_dir_missing_recursively(
    src: &Path,
    dst: &Path,
    stats: &mut CopyMissingStats,
) -> Result<(), String> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)
            .map_err(|e| format!("创建目录 {} 失败: {e}", dst.display()))?;
        stats.dirs_created += 1;
    }
    for entry in
        std::fs::read_dir(src).map_err(|e| format!("读取目录 {} 失败: {e}", src.display()))?
    {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("获取文件类型失败: {e}"))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_missing_recursively(&src_path, &dst_path, stats)?;
        } else if dst_path.exists() {
            stats.files_skipped += 1;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| {
                format!(
                    "复制 {} → {} 失败: {e}",
                    src_path.display(),
                    dst_path.display()
                )
            })?;
            stats.files_copied += 1;
        }
    }
    Ok(())
}

/// 从内置资源复制预部署组件到应用根目录
///
/// 支持三种模式：
///   1. **新便携模式**（推荐）：组件统一在 app_root/resources/ 下，无需复制
///   2. **旧便携模式**（兼容）：组件在 app_root/ 下（遗留结构），无需复制
///   3. **Bundle 部署模式**（MSI）：组件在 resources/ 中，首次运行时复制到 app_root/
///
/// 新便携模式目录结构（推荐）：
///   SuperClaw_随身版/
///   ├── superclaw.exe
///   └── resources/
///       ├── bin/uv.exe
///       ├── uv-tools/hermes-agent/
///       ├── uv-python/
///       ├── data/hermes/
///       └── runtime/openclaw/
///
/// 旧便携模式目录结构（兼容）：
///   SuperClaw/
///   ├── superclaw.exe
///   ├── bin/
///   ├── uv-tools/
///   ├── uv-python/
///   └── data/hermes/
///
/// 修正 uv tool 虚拟环境的 pyvenv.cfg 中 Python home 路径
///
/// uv tool install 生成的 pyvenv.cfg 使用相对路径指向 Python 解释器。
/// 当目录结构改变时（从 app_root/uv-tools/ 搬到 resources/uv-tools/），
/// 相对路径的层级会不正确，导致 hermes.exe (uv tool shim) 找不到 Python。
/// 此函数自动检测并修正所有 uv tool 的 pyvenv.cfg 中的 home 路径。
fn patch_uv_tool_pyvenv_cfgs() {
    let tool_dir = uv_tool_dir();
    let python_root = uv_python_dir();
    if !tool_dir.exists() || !python_root.exists() {
        return;
    }

    // 在 uv-python/ 下寻找实际的 Python 安装目录（含 python.exe）
    let python_home = find_python_home(&python_root);
    let python_home = match python_home {
        Some(p) => p,
        None => {
            eprintln!("[patch_pyvenv] ⚠ uv-python 存在但未找到 python.exe，跳过 pyvenv.cfg 修正");
            return;
        }
    };

    let entries = match std::fs::read_dir(&tool_dir) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[patch_pyvenv] ⚠ 读取 uv-tools 失败: {e}");
            return;
        }
    };

    for entry in entries.flatten() {
        let cfg_path = entry.path().join("pyvenv.cfg");
        if !cfg_path.exists() {
            continue;
        }

        let content = match std::fs::read_to_string(&cfg_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[patch_pyvenv] ⚠ 读取 {} 失败: {e}", cfg_path.display());
                continue;
            }
        };

        // Use an absolute Python home. uv's generated relative path can fail
        // on Windows portable layouts, especially when the project path has
        // non-ASCII characters.
        let new_home = python_home.to_string_lossy().to_string();
        let new_home_line = format!("home = {}", new_home);

        // 检查是否需要更新
        let needs_update = !content.lines().any(|l| {
            l.trim().eq_ignore_ascii_case(new_home_line.trim())
                || l.trim()
                    .eq_ignore_ascii_case(&new_home_line.replace('\\', "/"))
        });

        if !needs_update {
            continue; // 已经是正确的路径
        }

        // 检测原始换行符风格
        let line_ending = if content.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };

        // 更新 home 行，保留其他行不变
        let mut updated = String::new();
        let mut found = false;
        let mut first = true;
        for line in content.split('\n') {
            let trimmed = line.trim().trim_end_matches('\r');
            if !first {
                updated.push_str(line_ending);
            }
            first = false;
            if !found && trimmed.starts_with("home") && trimmed.contains('=') {
                updated.push_str(&new_home_line);
                found = true;
            } else {
                updated.push_str(line.trim_end_matches('\r'));
            }
        }

        if !found {
            eprintln!("[patch_pyvenv] ⚠ {} 中未找到 home= 行", cfg_path.display());
            continue;
        }

        if let Err(e) = std::fs::write(&cfg_path, &updated) {
            eprintln!("[patch_pyvenv] ⚠ 写入 {} 失败: {e}", cfg_path.display());
        } else {
            let tool_name = cfg_path
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "?".into());
            eprintln!("[patch_pyvenv] ✓ {} home → {}", tool_name, new_home);
        }
    }
}

/// 在 uv-python/ 目录下查找实际的 Python 安装目录（包含 python.exe 的父目录）
fn find_python_home(python_root: &Path) -> Option<PathBuf> {
    // 常见结构：uv-python/python/python.exe
    let direct = python_root.join("python").join("python.exe");
    if direct.exists() {
        return Some(python_root.join("python"));
    }
    // 常见结构：uv-python/cpython-3.X.Y-windows-x86_64-none/python.exe
    if let Ok(entries) = std::fs::read_dir(python_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("python.exe").exists() {
                return Some(path);
            }
        }
    }
    None
}

/// 返回 true 表示组件就绪且 hermes 已验证可用，后续安装流程可跳过。
fn setup_from_bundle() -> bool {
    let app_root = app_root_dir();

    // 关键修正：在尝试运行 hermes 之前，先修正所有 uv tool 的 pyvenv.cfg Python 路径
    // uv tool shim 依赖 pyvenv.cfg 中的相对路径定位 Python，目录结构改变后路径会偏移
    patch_uv_tool_pyvenv_cfgs();

    // 模式 1：新便携模式 — 组件统一在 resources/ 子目录下
    // 注意：使用 run_silent() 而非 run_at_path()，因为 hermes.exe 是 uv tool 生成的 shim，
    // 使用相对路径引用 Python，需要 CWD 设为 Scripts/ 目录才能正确解析。
    let res = app_root.join("resources");
    if res.join("uv-tools").join("hermes-agent").exists() && res.join("bin").exists() {
        if let Ok(ver) = run_silent("hermes", &["version"]) {
            eprintln!("[setup_from_bundle] ✓ 新便携模式 Hermes Agent 就绪: {ver}");
            return true;
        }
        eprintln!(
            "[setup_from_bundle] ⚠ 新便携目录存在但 hermes 不可用（CWD 可能不正确），尝试旧结构"
        );
    }

    // 模式 2：旧便携模式 — 组件直接放在 app_root 下（U盘直接部署遗留结构）
    if app_root.join("uv-tools").join("hermes-agent").exists() && app_root.join("bin").exists() {
        if let Ok(ver) = run_silent("hermes", &["version"]) {
            eprintln!("[setup_from_bundle] ✓ 旧便携模式 Hermes Agent 就绪: {ver}");
            return true;
        }
        eprintln!("[setup_from_bundle] ⚠ 旧便携目录存在但 hermes 不可用，尝试 bundle 部署");
    }

    // 模式 2.5：新便携布局已预部署 — resources/bin 存在且 hermes config.yaml 就绪
    if res.join("bin").exists() {
        let config_ok = res.join("data").join("hermes").join("config.yaml").exists();
        if config_ok {
            eprintln!("[setup_from_bundle] ✓ 新便携布局已完全部署 (bin + hermes config)，直接跳过 bundle 复制");
            // 即使 run_silent 验证失败，组件文件存在就视为已部署。
            // hermes.exe 可能因便携环境的特殊路径无法运行，但后续 install_hermes()
            // 会直接返回成功（因为 setup_from_bundle 返回 true）。
            return true;
        }
        eprintln!("[setup_from_bundle] ✓ 新便携布局 resources/bin 已就绪，跳过 bundle 复制");
        // 注意：不返回 true，因为 hermes-agent 可能尚未安装（缺少 config.yaml）。
        // 后续 install_hermes() 中的 uv_tool_dir() 会正确找到 resources/uv-tools/，
        // 避免在 app_root 下生成 bin/ uv-tools/ uv-python/ data/ 等冗余目录。
        return false;
    }

    // 模式 3：Bundle 部署模式 — 从 resources/ 复制到 app_root/
    let bundled_root = match bundled_deploy_dir() {
        Some(d) => d,
        None => return false,
    };
    eprintln!(
        "[setup_from_bundle] 发现预部署 bundle: {}",
        bundled_root.display()
    );

    let dst_uv_tools = app_root.join("uv-tools");
    let dst_bin = app_root.join("bin");

    // 1. 复制 uv-tools/
    let src_uv_tools = bundled_root.join("uv-tools");
    if src_uv_tools.exists() && !dst_uv_tools.exists() {
        if let Err(e) = copy_dir_recursively(&src_uv_tools, &dst_uv_tools) {
            eprintln!("[setup_from_bundle] 复制 uv-tools 失败: {e}");
            return false;
        }
        eprintln!("[setup_from_bundle] ✓ uv-tools 已部署");
    }

    // 2. 复制 uv-python/
    let src_uv_python = bundled_root.join("uv-python");
    let dst_uv_python = app_root.join("uv-python");
    if src_uv_python.exists() && !dst_uv_python.exists() {
        if let Err(e) = copy_dir_recursively(&src_uv_python, &dst_uv_python) {
            eprintln!("[setup_from_bundle] 复制 uv-python 失败: {e}");
        } else {
            eprintln!("[setup_from_bundle] ✓ uv-python 已部署");
        }
    }

    // 3. 复制 data/hermes/
    let src_hermes = bundled_root.join("data").join("hermes");
    let dst_hermes = app_root.join("data").join("hermes");
    if src_hermes.exists() && !dst_hermes.exists() {
        let _ = std::fs::create_dir_all(dst_hermes.parent().unwrap());
        if let Err(e) = copy_dir_recursively(&src_hermes, &dst_hermes) {
            eprintln!("[setup_from_bundle] 复制 data/hermes 失败: {e}");
        } else {
            eprintln!("[setup_from_bundle] ✓ data/hermes 已部署");
        }
    }

    // 4. 复制 bin/
    let src_bin = bundled_root.join("bin");
    if src_bin.exists() && !dst_bin.exists() {
        if let Err(e) = copy_dir_recursively(&src_bin, &dst_bin) {
            eprintln!("[setup_from_bundle] 复制 bin 失败: {e}");
            return false;
        }
        eprintln!("[setup_from_bundle] ✓ bin 已部署");
    }

    // 验证 hermes-agent 是否可用
    if let Ok(ver) = run_silent("hermes", &["version"]) {
        eprintln!("[setup_from_bundle] ✓ Hermes Agent 就绪: {ver}");
        return true;
    }

    if dst_uv_tools.join("hermes-agent").exists() {
        eprintln!("[setup_from_bundle] ⚠ uv-tools/hermes-agent 已复制但 hermes 命令不可用");
    }

    false
}

/// 从本地压缩包预缓存 Python 解释器到 uv-python/ 目录
/// 使用 flate2 + tar crate 解压（比 Windows 系统 tar.exe 更可靠，不会丢失目录结构）
/// 这是 best-effort 操作：成功则 uv 跳过网络下载，失败则 uv 自动从网络下载
fn extract_bundled_python(target_dir: &Path) {
    let archive_path = match bundled_python_archive_path() {
        Some(p) => p,
        None => {
            eprintln!("[extract_bundled_python] 未找到本地 Python 压缩包");
            return;
        }
    };

    eprintln!(
        "[extract_bundled_python] 发现本地 Python 压缩包: {}",
        archive_path.display()
    );

    // 检查是否已解压（target_dir 下已有 cpython-*/python.exe）
    let already_extracted = std::fs::read_dir(target_dir)
        .ok()
        .map(|entries| {
            entries.flatten().any(|e| {
                let sub_python = e.path().join("python.exe");
                sub_python.exists()
            })
        })
        .unwrap_or(false);

    if already_extracted {
        eprintln!("[extract_bundled_python] Python 已存在缓存目录中，跳过解压");
        return;
    }

    // 用 flate2 + tar crate 解压（比 Windows 系统 tar.exe 更可靠）
    let file = match std::fs::File::open(&archive_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("[extract_bundled_python] ✗ 无法打开压缩包: {e}");
            return;
        }
    };

    let decoder = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);

    match archive.unpack(target_dir) {
        Ok(_) => {
            // 验证解压结果
            let found = std::fs::read_dir(target_dir)
                .ok()
                .map(|entries| {
                    entries.flatten().any(|e| {
                        let sub_python = e.path().join("python.exe");
                        sub_python.exists()
                    })
                })
                .unwrap_or(false);

            if found {
                eprintln!(
                    "[extract_bundled_python] ✓ Python 预缓存成功: {}",
                    target_dir.display()
                );
            } else {
                eprintln!("[extract_bundled_python] ! 解压完成但未找到 python.exe（目录结构可能不匹配，uv 将尝试网络下载）");
            }
        }
        Err(e) => {
            eprintln!("[extract_bundled_python] ✗ 解压失败 (uv 将尝试网络下载): {e}");
        }
    }
}

/// 在 UV_PYTHON_INSTALL_DIR 中查找本地缓存的 Python 3.11 可执行文件路径
/// uv 默认不扫描目录，只识别自己下载的 Python。我们通过 --python <完整路径> 直接指定
fn find_cached_python(uv_python_dir: &Path) -> Option<String> {
    let entries = std::fs::read_dir(uv_python_dir).ok()?;
    for entry in entries.flatten() {
        let python_exe = entry.path().join("python.exe");
        if python_exe.exists() {
            return Some(python_exe.to_string_lossy().to_string());
        }
    }
    None
}

/// 内置 uv 压缩包路径（Dev: src-tauri/resources/，便携: exe 同级 resources/）
fn bundled_uv_archive_path() -> PathBuf {
    // 1. exe/app 同级 resources/（便携/安装模式）
    let root = app_root_dir();
    let exe_res = root.join("resources").join(uv_archive_filename());
    if exe_res.exists() {
        return exe_res;
    }

    // 2. Dev 模式：src-tauri/resources/（源代码目录）
    #[cfg(debug_assertions)]
    {
        let dev_res = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(uv_archive_filename());
        if dev_res.exists() {
            return dev_res;
        }
    }

    // 默认返回 exe_res（即使不存在，调用方会用 exists() 检查）
    exe_res
}

/// uv 本地缓存路径（应用根目录下的 cache/）
fn uv_cached_archive_path() -> PathBuf {
    app_root_dir().join("cache").join(uv_archive_filename())
}

/// uv 二进制完整路径
fn uv_bin_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        uv_bin_dir().join("uv.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        uv_bin_dir().join("uv")
    }
}

/// 内置 Hermes Agent 源码压缩包路径（Dev: src-tauri/resources/，便携: exe 同级 resources/）
fn bundled_hermes_archive_path() -> PathBuf {
    let fname = "hermes-agent-main.zip";

    // 1. exe/app 同级 resources/（便携/安装模式）
    let root = app_root_dir();
    let exe_res = root.join("resources").join(fname);
    if exe_res.exists() {
        return exe_res;
    }

    // 2. Dev 模式：src-tauri/resources/（源代码目录）
    #[cfg(debug_assertions)]
    {
        let dev_res = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(fname);
        if dev_res.exists() {
            return dev_res;
        }
    }

    exe_res
}

/// 解压 hermes-agent-main.zip 到 <app_root>/data/hermes-source/（便携路径），
/// 返回解压后的 hermes-agent-main 目录路径
fn extract_hermes_zip(zip_path: &Path) -> Result<PathBuf, String> {
    let extract_dir = app_root_dir().join("data").join("hermes-source");
    let _ = std::fs::remove_dir_all(&extract_dir);
    std::fs::create_dir_all(&extract_dir).map_err(|e| format!("创建解压目录失败: {e}"))?;

    use std::io::Read;
    let file = std::fs::File::open(zip_path).map_err(|e| format!("打开 zip 失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取 zip 失败: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("读取 zip 条目 {i} 失败: {e}"))?;
        let Some(out_path) = entry.enclosed_name() else {
            continue;
        };
        let abs_path = extract_dir.join(out_path);

        if entry.is_dir() {
            let _ = std::fs::create_dir_all(&abs_path);
        } else {
            if let Some(parent) = abs_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("创建目录 {} 失败: {e}", parent.display()))?;
            }
            let mut outfile = std::fs::File::create(&abs_path)
                .map_err(|e| format!("创建文件 {} 失败: {e}", abs_path.display()))?;
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("读取 zip 条目失败: {e}"))?;
            std::io::Write::write_all(&mut outfile, &buf)
                .map_err(|e| format!("写入文件失败: {e}"))?;
        }
    }

    // zip 顶层包含 hermes-agent-main/ 目录
    let extracted = extract_dir.join("hermes-agent-main");
    if extracted.exists() {
        Ok(extracted)
    } else {
        // 如果没有顶层目录，直接返回解压目录
        Ok(extract_dir)
    }
}

/// uv 压缩包文件名（按当前编译平台选择）
fn uv_archive_filename() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "uv-x86_64-pc-windows-msvc.zip"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "uv-aarch64-apple-darwin.tar.gz"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "uv-x86_64-apple-darwin.tar.gz"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "uv-x86_64-unknown-linux-gnu.tar.gz"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "uv-aarch64-unknown-linux-gnu.tar.gz"
    }
}

/// uv 下载 URL（按当前编译平台选择）
fn uv_download_url(version: &str) -> String {
    format!(
        "https://github.com/astral-sh/uv/releases/download/{version}/{}",
        uv_archive_filename()
    )
}

/// 便携模式资源路径：<app_resources>/portable/
/// 开发模式下 src-tauri/resources/portable/，打包后 exe_dir/resources/portable/
fn portable_resources_dir() -> Option<PathBuf> {
    super::app_resources_dir().map(|r| r.join("portable"))
}

/// 构建增强 PATH，确保能找到 uv、hermes、python 等
pub fn hermes_enhanced_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = dirs::home_dir().unwrap_or_default();
    let mut extra: Vec<String> = vec![];

    // ClawPanel 管理的 uv 二进制目录
    extra.push(uv_bin_dir().to_string_lossy().to_string());

    // 便携模式：uv tool 安装的可执行文件目录（<app_root>/uv-tools/bin/）
    extra.push(uv_tool_bin_dir().to_string_lossy().to_string());

    // 便携模式：扫描 uv tool 实际安装的子目录 Scripts/
    // uv tool install 将可执行文件放在 <uv_tool_dir>/<name>/Scripts/，
    // 而并非所有安装都会在 uv_tool_bin_dir() (=uv-tools/bin/) 创建 shim，
    // 手动扫描确保 hermes.exe 能被找到
    if let Ok(entries) = std::fs::read_dir(uv_tool_dir()) {
        for entry in entries.flatten() {
            let scripts = entry.path().join("Scripts");
            if scripts.is_dir() {
                extra.push(scripts.to_string_lossy().to_string());
            }
        }
    }

    // 系统级 uv tool 安装的可执行文件目录（兜底）
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        if !appdata.is_empty() {
            // uv 在 Windows 上的默认 tool bin 路径
            extra.push(format!(r"{}\uv\tools\bin", appdata));
        }
        extra.push(format!(r"{}\.local\bin", home.display()));
        // uv 自身的默认安装路径
        extra.push(format!(r"{}\.local\bin", home.display()));
        extra.push(format!(r"{}\.cargo\bin", home.display()));

        // 便携模式：内置的 Git Bash / ripgrep
        if let Some(portable_root) = portable_resources_dir() {
            let git_bin = portable_root.join("git").join("bin");
            if git_bin.is_dir() {
                extra.push(git_bin.to_string_lossy().to_string());
            }
            let git_usrbin = portable_root.join("git").join("usr").join("bin");
            if git_usrbin.is_dir() {
                extra.push(git_usrbin.to_string_lossy().to_string());
            }
            let rg_dir = portable_root.join("rg");
            if rg_dir.is_dir() {
                extra.push(rg_dir.to_string_lossy().to_string());
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        extra.push(format!("{}/.local/bin", home.display()));
        extra.push(format!("{}/.cargo/bin", home.display()));
        extra.push("/usr/local/bin".into());
    }

    let sep = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    let mut parts: Vec<&str> = extra.iter().map(|s| s.as_str()).collect();
    if !current.is_empty() {
        parts.push(&current);
    }
    parts.join(sep)
}

/// 执行命令并获取 stdout（静默，无窗口）
fn run_silent(program: &str, args: &[&str]) -> Result<String, String> {
    let enhanced = hermes_enhanced_path();
    let mut cmd = if program == "hermes" {
        hermes_command(args, &enhanced)
    } else {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .env("PATH", &enhanced)
            // 设置 HERMES_HOME，确保 hermes CLI 能正确找到配置目录（config.yaml 等）
            .env("HERMES_HOME", hermes_home().to_string_lossy().to_string());
        cmd
    };
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().map_err(|e| format!("{program}: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(stderr)
    }
}

/// 在指定路径上执行命令
fn run_at_path(program: &str, args: &[&str], path: &str) -> Result<String, String> {
    let mut cmd = if program == "hermes" {
        hermes_command(args, path)
    } else {
        let mut cmd = Command::new(program);
        cmd.args(args).env("PATH", path);
        cmd
    };
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().map_err(|e| format!("{program}: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// 解析 Python 版本号 "Python X.Y.Z" → (X, Y, Z)
fn parse_python_version(raw: &str) -> Option<(u32, u32, u32)> {
    let version_str = raw.strip_prefix("Python ").unwrap_or(raw);
    let parts: Vec<&str> = version_str.trim().split('.').collect();
    if parts.len() >= 2 {
        let major = parts[0].parse().ok()?;
        let minor = parts[1].parse().ok()?;
        let patch = parts.get(2).and_then(|p| p.parse().ok()).unwrap_or(0);
        Some((major, minor, patch))
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// check_python — 检测 Python 环境
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn check_python() -> Result<Value, String> {
    let enhanced = hermes_enhanced_path();
    let mut result = serde_json::Map::new();

    // 平台标识
    result.insert(
        "platform".into(),
        Value::String(current_platform_key().into()),
    );

    // 尝试多种 Python 命令
    let python_candidates: Vec<(&str, Vec<&str>)> = {
        #[cfg(target_os = "windows")]
        {
            vec![
                ("py", vec!["-3", "--version"]),
                ("python", vec!["--version"]),
                ("python3", vec!["--version"]),
            ]
        }
        #[cfg(not(target_os = "windows"))]
        {
            vec![
                ("python3", vec!["--version"]),
                ("python", vec!["--version"]),
            ]
        }
    };

    let mut found = false;
    for (cmd, args) in &python_candidates {
        if let Ok(ver_str) = run_at_path(cmd, args, &enhanced) {
            if let Some((major, minor, patch)) = parse_python_version(&ver_str) {
                let version = format!("{major}.{minor}.{patch}");
                let version_ok = major >= 3 && minor >= 11;
                result.insert("installed".into(), Value::Bool(true));
                result.insert("version".into(), Value::String(version));
                result.insert("versionOk".into(), Value::Bool(version_ok));
                result.insert("pythonCmd".into(), Value::String(cmd.to_string()));

                // 尝试获取 Python 路径
                let path_result = find_executable_path(cmd, &enhanced);
                result.insert(
                    "path".into(),
                    path_result.map(Value::String).unwrap_or(Value::Null),
                );

                found = true;
                break;
            }
        }
    }

    if !found {
        result.insert("installed".into(), Value::Bool(false));
        result.insert("version".into(), Value::Null);
        result.insert("versionOk".into(), Value::Bool(false));
        result.insert("path".into(), Value::Null);
        result.insert("pythonCmd".into(), Value::Null);
    }

    // 检测 pip
    let has_pip = run_at_path("pip", &["--version"], &enhanced).is_ok()
        || run_at_path("pip3", &["--version"], &enhanced).is_ok();
    result.insert("hasPip".into(), Value::Bool(has_pip));

    // 检测 pipx
    let has_pipx = run_at_path("pipx", &["--version"], &enhanced).is_ok();
    result.insert("hasPipx".into(), Value::Bool(has_pipx));

    // 检测 uv
    let uv_path = uv_bin_path();
    let has_uv = if uv_path.exists() {
        true
    } else {
        run_at_path("uv", &["--version"], &enhanced).is_ok()
    };
    result.insert("hasUv".into(), Value::Bool(has_uv));

    // 检测 git（从 GitHub 安装 hermes-agent 需要 git）
    let has_git = run_at_path("git", &["--version"], &enhanced).is_ok();
    result.insert("hasGit".into(), Value::Bool(has_git));

    // 检测 brew（macOS/Linux）
    #[cfg(not(target_os = "windows"))]
    {
        let has_brew = run_at_path("brew", &["--version"], &enhanced).is_ok();
        result.insert("hasBrew".into(), Value::Bool(has_brew));
    }
    #[cfg(target_os = "windows")]
    {
        result.insert("hasBrew".into(), Value::Bool(false));
    }

    Ok(Value::Object(result))
}

/// 查找可执行文件路径
fn find_executable_path(name: &str, enhanced_path: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("where");
        cmd.arg(name).env("PATH", enhanced_path);
        cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                return stdout.lines().next().map(|s| s.trim().to_string());
            }
        }
        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("which");
        cmd.arg(name).env("PATH", enhanced_path);
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                return Some(stdout.trim().to_string());
            }
        }
        None
    }
}

fn current_platform_key() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "win-x64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "mac-arm64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "mac-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "linux-arm64"
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
    )))]
    {
        "unknown"
    }
}

/// 获取 hermes.exe 所在目录（Scripts/），用于设置子进程 CWD
///
/// uv tool 在 Windows 上生成的 exe 将 Python 路径存储在 pyvenv.cfg 中，
/// 路径是相对路径（如 `..\..\..\uv-python\python`），且解析时依赖 CWD。
/// 因此所有 hermes 子进程的 CWD 都必须设为 exe 所在目录（不是 hermes_home()）。
fn hermes_bin_dir() -> Option<PathBuf> {
    if let Some(dir) = hermes_agent_scripts_dir() {
        return Some(dir);
    }
    let enhanced = hermes_enhanced_path();
    find_executable_path("hermes", &enhanced)
        .and_then(|p| Path::new(&p).parent().map(|d| d.to_path_buf()))
}

fn is_bad_hermes_launcher(path: &str) -> bool {
    path.replace('\\', "/")
        .to_lowercase()
        .contains("/.local/bin/hermes.exe")
}

fn hermes_system_executable(enhanced: &str) -> String {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(raw) = std::env::var_os("HERMES_EXE") {
        candidates.push(PathBuf::from(raw));
    }
    if cfg!(target_os = "windows") {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            let base = PathBuf::from(local_app_data)
                .join("Programs")
                .join("Python");
            for py in ["Python312", "Python311", "Python310"] {
                candidates.push(base.join(py).join("Scripts").join("hermes.exe"));
            }
        }
    }

    for candidate in candidates {
        let raw = candidate.to_string_lossy().to_string();
        if candidate.exists() && !is_bad_hermes_launcher(&raw) {
            return raw;
        }
    }

    if let Some(found) = find_executable_path("hermes", enhanced) {
        if !is_bad_hermes_launcher(&found) {
            return found;
        }
    }

    "hermes".into()
}

fn hermes_agent_runtime_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(resources) = super::app_resources_dir() {
        candidates.push(resources.join("runtime").join("hermes-agent"));
        candidates.push(resources.join("uv-tools").join("hermes-agent"));
    }
    candidates.push(
        app_root_dir()
            .join("src-tauri")
            .join("resources")
            .join("runtime")
            .join("hermes-agent"),
    );
    candidates.push(
        app_root_dir()
            .join("src-tauri")
            .join("resources")
            .join("uv-tools")
            .join("hermes-agent"),
    );
    candidates.push(
        app_root_dir()
            .join("resources")
            .join("runtime")
            .join("hermes-agent"),
    );
    candidates.push(
        app_root_dir()
            .join("resources")
            .join("uv-tools")
            .join("hermes-agent"),
    );
    candidates.push(uv_tool_dir().join("hermes-agent"));

    let mut seen = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

fn hermes_agent_runtime_dir() -> Option<PathBuf> {
    hermes_agent_runtime_candidates().into_iter().find(|dir| {
        dir.join("Lib")
            .join("site-packages")
            .join("hermes_cli")
            .exists()
            || dir
                .join(if cfg!(target_os = "windows") {
                    "Scripts"
                } else {
                    "bin"
                })
                .exists()
    })
}

fn expected_hermes_agent_runtime_dir() -> PathBuf {
    hermes_agent_runtime_candidates()
        .into_iter()
        .next()
        .unwrap_or_else(|| uv_tool_dir().join("hermes-agent"))
}

fn hermes_agent_scripts_dir() -> Option<PathBuf> {
    for root in hermes_agent_runtime_candidates() {
        let dir = root.join(if cfg!(target_os = "windows") {
            "Scripts"
        } else {
            "bin"
        });
        if dir.exists() {
            return Some(dir);
        }
    }
    None
}

fn hermes_agent_python() -> Option<PathBuf> {
    if let Some(home) = find_python_home(&uv_python_dir()) {
        let python = home.join(if cfg!(target_os = "windows") {
            "python.exe"
        } else {
            "bin/python"
        });
        if python.exists() {
            return Some(python);
        }
    }
    let scripts = hermes_agent_scripts_dir()?;
    let python = scripts.join(if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python"
    });
    if python.exists() {
        Some(python)
    } else {
        None
    }
}

fn hermes_agent_site_packages() -> Option<PathBuf> {
    for root in hermes_agent_runtime_candidates() {
        let site = root.join("Lib").join("site-packages");
        if site.join("hermes_cli").exists() {
            return Some(site);
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn patch_hermes_dashboard_windows_chat_notice() {
    let Some(site) = hermes_agent_site_packages() else {
        return;
    };
    let path = site.join("hermes_cli").join("web_server.py");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return;
    };
    if raw.contains("SuperClaw note: use the built-in Hermes chat page") {
        return;
    }
    let needle = "\"\\r\\n\\x1b[31mChat unavailable: the embedded terminal requires a \"";
    if !raw.contains(needle) {
        return;
    }
    let note = concat!(
        "\"\\r\\n\\x1b[36mSuperClaw note: use the built-in Hermes chat page for chatting on native Windows. \"\n",
        "            \"The native dashboard remains available for settings, sessions, logs, skills, and management pages.\\x1b[0m\\r\\n\"\n",
        "            "
    );
    let updated = raw.replacen(needle, &format!("{note}{needle}"), 1);
    if let Err(err) = std::fs::write(&path, updated) {
        eprintln!(
            "[hermes_dashboard] failed to patch Windows chat notice {}: {err}",
            path.display()
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn patch_hermes_dashboard_windows_chat_notice() {}

fn hermes_runtime_diagnostics() -> String {
    let app_root = app_root_dir();
    let resources = app_root.join("resources");
    let python_root = uv_python_dir();
    let tool_root = uv_tool_dir();
    let hermes_root = expected_hermes_agent_runtime_dir();
    let python = hermes_agent_python();
    let site = hermes_agent_site_packages();
    let expected_site = hermes_root
        .join("Lib")
        .join("site-packages")
        .join("hermes_cli");
    let python_children = std::fs::read_dir(&python_root)
        .ok()
        .map(|entries| {
            entries
                .flatten()
                .take(8)
                .map(|entry| entry.file_name().to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "(empty or missing)".to_string());

    format!(
        "Hermes bundled runtime not found.\napp_root={}\nresources_exists={}\nuv_python_dir={}\nuv_python_exists={}\nuv_python_children={}\nresolved_python={}\nuv_tool_dir={}\nuv_tool_exists={}\nhermes_agent_dir={}\nhermes_agent_exists={}\nexpected_hermes_cli={}\nhermes_cli_exists={}",
        app_root.display(),
        resources.is_dir(),
        python_root.display(),
        python_root.is_dir(),
        python_children,
        python
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "(none)".to_string()),
        tool_root.display(),
        tool_root.is_dir(),
        hermes_root.display(),
        hermes_root.is_dir(),
        expected_site.display(),
        site.is_some()
    )
}

fn hermes_portable_runtime_error() -> Option<String> {
    let app_root = app_root_dir();
    let has_portable_layout = app_root.join("resources").is_dir()
        || app_root.join("resources").join("runtime").is_dir()
        || app_root.join("uv-python").is_dir()
        || app_root.join("uv-tools").is_dir();
    let should_require_bundle = has_portable_layout || !cfg!(debug_assertions);
    if should_require_bundle
        && (hermes_agent_python().is_none() || hermes_agent_site_packages().is_none())
    {
        Some(hermes_runtime_diagnostics())
    } else {
        None
    }
}

fn hermes_command(args: &[&str], enhanced: &str) -> std::process::Command {
    let home = hermes_home();
    if let (Some(python), Some(site)) = (hermes_agent_python(), hermes_agent_site_packages()) {
        let cwd = python.parent().map(Path::to_path_buf);
        let mut cmd = std::process::Command::new(python);
        cmd.args(["-m", "hermes_cli.main"])
            .args(args)
            .env("PATH", enhanced)
            .env("HERMES_DISABLE_UPDATE_CHECK", "1")
            .env("HERMES_HOME", home.to_string_lossy().to_string());
        cmd.env("PYTHONPATH", site.to_string_lossy().to_string())
            .env(
                "VIRTUAL_ENV",
                hermes_agent_runtime_dir().unwrap_or_else(expected_hermes_agent_runtime_dir),
            );
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        cmd
    } else {
        let launcher = hermes_system_executable(enhanced);
        let mut cmd = std::process::Command::new(&launcher);
        cmd.args(args)
            .current_dir(hermes_launcher_cwd(&home, Some(&launcher)))
            .env("PATH", enhanced)
            .env("HERMES_DISABLE_UPDATE_CHECK", "1")
            .env("HERMES_HOME", home.to_string_lossy().to_string());
        cmd
    }
}

fn hermes_lifecycle_process_info(enhanced: &str) -> (String, String) {
    let home = hermes_home();
    if let Some(python) = hermes_agent_python() {
        let cwd = python
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| home.clone());
        return (
            cwd.display().to_string(),
            python.display().to_string(),
        );
    }
    let launcher = hermes_system_executable(enhanced);
    let cwd = hermes_launcher_cwd(&home, Some(&launcher));
    (cwd.display().to_string(), launcher)
}

fn register_hermes_lifecycle_process(pid: u32, enhanced: &str) {
    let (cwd, exe) = hermes_lifecycle_process_info(enhanced);
    crate::agent_lifecycle::register_managed_agent(
        crate::agent_lifecycle::ManagedAgent::Hermes,
        pid,
        cwd,
        exe,
        Some(hermes_gateway_port()),
    );
}

fn hermes_tokio_command(args: &[&str], enhanced: &str) -> tokio::process::Command {
    let home = hermes_home();
    if let (Some(python), Some(site)) = (hermes_agent_python(), hermes_agent_site_packages()) {
        let cwd = python.parent().map(Path::to_path_buf);
        let mut cmd = tokio::process::Command::new(python);
        cmd.args(["-m", "hermes_cli.main"])
            .args(args)
            .env("PATH", enhanced)
            .env("HERMES_DISABLE_UPDATE_CHECK", "1")
            .env("HERMES_HOME", home.to_string_lossy().to_string());
        cmd.env("PYTHONPATH", site.to_string_lossy().to_string())
            .env(
                "VIRTUAL_ENV",
                hermes_agent_runtime_dir().unwrap_or_else(expected_hermes_agent_runtime_dir),
            );
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        cmd
    } else {
        let launcher = hermes_system_executable(enhanced);
        let mut cmd = tokio::process::Command::new(&launcher);
        cmd.args(args)
            .current_dir(hermes_launcher_cwd(&home, Some(&launcher)))
            .env("PATH", enhanced)
            .env("HERMES_DISABLE_UPDATE_CHECK", "1")
            .env("HERMES_HOME", home.to_string_lossy().to_string());
        cmd
    }
}

fn hermes_launcher_cwd(home: &Path, launcher: Option<&str>) -> PathBuf {
    if let Some(raw) = launcher {
        let exe = PathBuf::from(raw);
        if exe.is_absolute() {
            if let Some(dir) = exe.parent() {
                return dir.to_path_buf();
            }
        }
    }
    if let Some(dir) = hermes_bin_dir() {
        return dir;
    }
    if let Some(userprofile) = std::env::var_os("USERPROFILE") {
        let dir = PathBuf::from(userprofile);
        if dir.exists() {
            return dir;
        }
    }
    home.to_path_buf()
}

// ---------------------------------------------------------------------------
// check_hermes — 检测 Hermes Agent 安装状态
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn check_hermes() -> Result<Value, String> {
    // 修正 uv tool 的 pyvenv.cfg Python 路径（便携模式下目录结构可能变化）
    patch_uv_tool_pyvenv_cfgs();

    let enhanced = hermes_enhanced_path();
    let mut result = serde_json::Map::new();
    let home = hermes_home();
    let _ = hermes_ensure_builtin_skills();

    // 1. 检测 hermes CLI
    // uv tool 生成的 exe 用相对路径引用 Python（pyvenv.cfg: home = ..\..\..\uv-python\python），
    // 且解析时依赖 CWD，因此必须将 CWD 设为 exe 所在目录（Scripts/）。
    let hermes_version = {
        let mut cmd = hermes_command(&["version"], &enhanced);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let result = cmd.output().map_err(|e| format!("hermes: {e}"));
        let version = result.and_then(|o| {
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
            }
        });
        version.or_else(|_| run_at_path("hermes", &["--version"], &enhanced))
    };

    match hermes_version {
        Ok(ver_raw) => {
            // 提取版本号（格式可能是 "Hermes Agent v0.8.0" 或 "0.8.0"）
            let version = ver_raw
                .split_whitespace()
                .find(|s| {
                    s.starts_with('v') || s.chars().next().is_some_and(|c| c.is_ascii_digit())
                })
                .unwrap_or(&ver_raw)
                .trim_start_matches('v')
                .to_string();
            result.insert("installed".into(), Value::Bool(true));
            result.insert("version".into(), Value::String(version));

            // 获取 hermes 路径
            let path = find_executable_path("hermes", &enhanced);
            result.insert(
                "path".into(),
                path.map(Value::String).unwrap_or(Value::Null),
            );
        }
        Err(_) => {
            // 回退检测：即使 hermes CLI 无法运行，如果 resources/bin + config.yaml 存在，
            // 也视为已部署（同 setup_from_bundle 模式 2.5 逻辑）。
            // 便携打包后 hermes.exe 可能因 pyvenv.cfg 路径问题无法直接运行，
            // 但组件文件确实已经部署到位。
            let app_root = app_root_dir();
            let res = app_root.join("resources");
            let bin_exists = res.join("bin").exists();
            let config_ok = res.join("data").join("hermes").join("config.yaml").exists();
            if bin_exists && config_ok {
                result.insert("installed".into(), Value::Bool(true));
                result.insert("version".into(), Value::String("bundled".into()));
                result.insert("path".into(), Value::Null);
                eprintln!("[check_hermes] hermes CLI 不可用但资源已部署 (bin={bin_exists}, config={config_ok})，视为 installed");
            } else {
                result.insert("installed".into(), Value::Bool(false));
                result.insert("version".into(), Value::Null);
                result.insert("path".into(), Value::Null);
            }
        }
    }

    // 2. 检测安装方式（managed）
    let managed = if let Ok(raw) = std::env::var("HERMES_MANAGED") {
        let lower = raw.trim().to_lowercase();
        match lower.as_str() {
            "true" | "1" | "yes" | "nix" | "nixos" => Some("NixOS"),
            "brew" | "homebrew" => Some("Homebrew"),
            _ => Some("unknown"),
        }
    } else if home.join(".managed").exists() {
        Some("NixOS")
    } else {
        None
    };
    result.insert(
        "managed".into(),
        managed
            .map(|s| Value::String(s.into()))
            .unwrap_or(Value::Null),
    );

    // 3. 配置文件检测
    let config_path = home.join("config.yaml");
    let env_path = home.join(".env");
    result.insert("configExists".into(), Value::Bool(config_path.exists()));
    result.insert("envExists".into(), Value::Bool(env_path.exists()));
    result.insert(
        "hermesHome".into(),
        Value::String(home.to_string_lossy().to_string()),
    );

    // 4. 读取 model 配置（支持 string 和 dict 两种格式）
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        let mut found = false;
        let mut in_model_block = false;
        for line in content.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("model:") {
                let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                if !val.is_empty() {
                    // model: some_string 格式
                    result.insert("model".into(), Value::String(val));
                    found = true;
                    break;
                }
                // model: (空) 后面是 dict 块
                in_model_block = true;
                continue;
            }
            if in_model_block {
                if !line.starts_with(' ') && !line.starts_with('\t') && !trimmed.is_empty() {
                    break; // dict 块结束
                }
                if let Some(rest) = trimmed.strip_prefix("default:") {
                    let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                    if !val.is_empty() {
                        result.insert("model".into(), Value::String(val));
                        found = true;
                    }
                }
            }
        }
        let _ = found; // suppress unused warning
    }

    // 5. Gateway 运行检测（非阻塞，快速超时）— 使用动态 URL 支持远程目标
    let gw_url = hermes_gateway_url();
    let gateway_port = hermes_gateway_port();
    // 从 URL 中提取 host:port 用于 TCP 探测
    let probe_addr = {
        let stripped = gw_url
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .trim_end_matches('/');
        if stripped.contains(':') {
            stripped.to_string()
        } else {
            format!("{stripped}:{gateway_port}")
        }
    };
    let gateway_running = probe_addr
        .parse::<std::net::SocketAddr>()
        .map(|addr| {
            std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(800))
                .is_ok()
        })
        .unwrap_or(false);
    result.insert("gatewayRunning".into(), Value::Bool(gateway_running));
    result.insert("gatewayPort".into(), Value::Number(gateway_port.into()));
    result.insert("gatewayUrl".into(), Value::String(gw_url));

    Ok(Value::Object(result))
}

/// Hermes Gateway 默认端口
fn hermes_gateway_port() -> u16 {
    // 尝试从 config.yaml 读取自定义端口
    let config_path = hermes_home().join("config.yaml");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        // 简单解析 YAML 中的 api_server_port 或 port
        for line in content.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("api_server_port:") {
                if let Ok(port) = rest.trim().parse::<u16>() {
                    if port > 0 {
                        return port;
                    }
                }
            }
        }
    }
    8642 // Hermes 默认端口
}

/// Hermes Dashboard 端口 - 从 config.yaml 的 dashboard.port 读取，默认 9119
fn hermes_dashboard_port() -> u16 {
    let config_path = hermes_home().join("config.yaml");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        let mut in_dashboard = false;
        for line in content.lines() {
            let t = line.trim();
            if t.is_empty() || t.starts_with('#') {
                continue;
            }
            let indent = line.len() - line.trim_start().len();
            if indent == 0 {
                in_dashboard = t == "dashboard:" || t.starts_with("dashboard:");
                continue;
            }
            if in_dashboard && t.starts_with("port:") {
                if let Ok(port) = t.trim_start_matches("port:").trim().parse::<u16>() {
                    if port > 0 {
                        return port;
                    }
                }
            }
        }
    }
    9119 // Hermes Dashboard 默认端口
}

/// 探测 Hermes Dashboard 是否在运行（TCP 连接 127.0.0.1 上的 dashboard 端口）
/// 返回 { running: bool, port: u16 }，前端据此决定是否打开浏览器或提示用户启动
#[tauri::command]
pub async fn hermes_dashboard_probe() -> Result<Value, String> {
    let port = hermes_dashboard_port();
    let addr = format!("127.0.0.1:{port}");
    let socket_addr: std::net::SocketAddr = addr
        .parse()
        .map_err(|e| format!("address parse error: {e}"))?;
    let running = tokio::task::spawn_blocking(move || {
        std::net::TcpStream::connect_timeout(&socket_addr, std::time::Duration::from_millis(800))
            .is_ok()
    })
    .await
    .unwrap_or(false);
    Ok(serde_json::json!({ "running": running, "port": port }))
}

/// 我们 spawn 的 Dashboard 进程 PID（0 = 没有）
static DASH_PID: AtomicU32 = AtomicU32::new(0);

/// 精准杀掉我们 spawn 的 Dashboard 进程（taskkill /F /PID）
fn kill_dashboard_pid() -> bool {
    let pid = DASH_PID.load(Ordering::SeqCst);
    if pid == 0 {
        return false;
    }
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/F", "/PID", &pid.to_string()]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let ok = cmd.output().map(|o| o.status.success()).unwrap_or(false);
        if ok {
            DASH_PID.store(0, Ordering::SeqCst);
        }
        ok
    }
    #[cfg(not(target_os = "windows"))]
    {
        let ok = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if ok {
            DASH_PID.store(0, Ordering::SeqCst);
        }
        ok
    }
}

/// 启动 Hermes Dashboard 服务（`hermes dashboard`），idempotent
/// 行为：
///   1. 端口已可达 → 直接返回 `started: true, already_running: true`
///   2. 否则 spawn `hermes dashboard`，等最多 90s（首次会 npm build 前端）
///   3. 进程提前退出 → 读日志尾部检测 deps_missing / port_in_use
/// 返回 `{ started, kind?, port, pid?, exit_code?, log_tail? }`
#[tauri::command]
pub async fn hermes_dashboard_start() -> Result<Value, String> {
    let port = hermes_dashboard_port();
    let addr_str = format!("127.0.0.1:{port}");
    let socket_addr: std::net::SocketAddr = addr_str
        .parse()
        .map_err(|e| format!("address parse error: {e}"))?;

    // 1. 已运行？
    if std::net::TcpStream::connect_timeout(&socket_addr, std::time::Duration::from_millis(500))
        .is_ok()
    {
        return Ok(serde_json::json!({
            "started": true,
            "already_running": true,
            "port": port,
        }));
    }

    // 2. 清掉残留 PID（来自上一次 spawn）
    let _ = kill_dashboard_pid();

    let home = hermes_home();
    let log_path = home.join("dashboard-run.log");
    let log_file =
        std::fs::File::create(&log_path).map_err(|e| format!("创建日志文件失败: {e}"))?;
    let log_err = log_file
        .try_clone()
        .map_err(|e| format!("克隆日志句柄失败: {e}"))?;

    let enhanced = hermes_enhanced_path();
    patch_hermes_dashboard_windows_chat_notice();
    let mut cmd = hermes_command(&["dashboard"], &enhanced);
    cmd.stdin(std::process::Stdio::null())
        .stdout(log_file)
        .stderr(log_err);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    // 注入 .env（与 gateway 启动一致）
    let env_path = home.join(".env");
    if let Ok(env_content) = std::fs::read_to_string(&env_path) {
        for line in env_content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, val)) = line.split_once('=') {
                cmd.env(key.trim(), val.trim());
            }
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn hermes dashboard failed: {e}"))?;
    let pid = child.id();
    DASH_PID.store(pid, Ordering::SeqCst);

    // 3. 等待 - 端口起来 / 进程提前死 / 超时
    // 90s 是为了覆盖首次启动的 npm build（dashboard 文档说前端没构建会 auto build on first launch）
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);
    while std::time::Instant::now() < deadline {
        // 进程提前退出？
        match child.try_wait() {
            Ok(Some(status)) => {
                DASH_PID.store(0, Ordering::SeqCst);
                let log_raw = std::fs::read_to_string(&log_path).unwrap_or_default();
                let tail = log_raw
                    .lines()
                    .rev()
                    .take(40)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join("\n");
                let lower = log_raw.to_lowercase();
                let kind = if lower.contains("web ui dependencies not installed")
                    || lower.contains("no module named 'fastapi'")
                    || (lower.contains("import error") && lower.contains("fastapi"))
                {
                    "deps_missing"
                } else if lower.contains("no module named 'fcntl'")
                    || lower.contains("no module named 'termios'")
                    || lower.contains("no module named 'pty'")
                    || lower.contains("no module named 'tty'")
                    || lower.contains("no module named 'pwd'")
                    || lower.contains("no module named 'grp'")
                {
                    // Hermes 在 pty_bridge.py / memory_tool.py 等处无条件 import POSIX-only
                    // 标准库（fcntl/termios/pty/tty/pwd/grp），Windows 上根本不存在
                    // 上游 issue：https://github.com/NousResearch/hermes-agent/issues/5246
                    "posix_only_module"
                } else if lower.contains("address already in use")
                    || lower.contains("address in use")
                    || (lower.contains("port") && lower.contains("already in use"))
                {
                    "port_in_use"
                } else {
                    "spawn_failed"
                };
                return Ok(serde_json::json!({
                    "started": false,
                    "kind": kind,
                    "exit_code": status.code(),
                    "port": port,
                    "log_tail": tail,
                }));
            }
            Ok(None) => {
                // 还活着，探端口
                if std::net::TcpStream::connect_timeout(
                    &socket_addr,
                    std::time::Duration::from_millis(300),
                )
                .is_ok()
                {
                    // PID 仍记录在 DASH_PID，供后续 stop 使用
                    return Ok(serde_json::json!({
                        "started": true,
                        "already_running": false,
                        "port": port,
                        "pid": pid,
                    }));
                }
            }
            Err(e) => {
                // try_wait 异常：异常本身罕见，先记录并跳出
                let log_raw = std::fs::read_to_string(&log_path).unwrap_or_default();
                let tail = log_raw
                    .lines()
                    .rev()
                    .take(40)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join("\n");
                return Ok(serde_json::json!({
                    "started": false,
                    "kind": "spawn_failed",
                    "port": port,
                    "log_tail": tail,
                    "error": format!("try_wait error: {e}"),
                }));
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    // 4. 超时（进程还活着但端口没起来；常见于首次构建超过 90s）
    let log_raw = std::fs::read_to_string(&log_path).unwrap_or_default();
    let tail = log_raw
        .lines()
        .rev()
        .take(40)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    Ok(serde_json::json!({
        "started": false,
        "kind": "timeout",
        "port": port,
        "pid": pid,
        "log_tail": tail,
    }))
}

/// 停止我们 spawn 的 Dashboard 进程
#[tauri::command]
pub async fn hermes_dashboard_stop() -> Result<bool, String> {
    Ok(kill_dashboard_pid())
}

// ---------------------------------------------------------------------------
// install_hermes — 一键安装（下载 uv → uv tool install hermes-agent）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn install_hermes(
    app: tauri::AppHandle,
    method: String,
    extras: Vec<String>,
) -> Result<String, String> {
    let _ = app.emit("hermes-install-log", "🚀 开始安装 Hermes Agent...");
    let _ = app.emit("hermes-install-progress", 0u32);

    // Step 0: 检查预部署 bundle（开箱即用模式）
    // 若内置 bundle 包含 uv-tools/hermes-agent/，则复制到 app_root 后跳过安装
    if setup_from_bundle() {
        let ver = run_silent("hermes", &["version"]).unwrap_or_else(|_| "bundled".into());
        let _ = app.emit(
            "hermes-install-log",
            format!("✅ 检测到预部署组件，Hermes Agent {ver} 就绪"),
        );
        let _ = app.emit("hermes-install-progress", 100u32);
        let _ = app.emit(
            "hermes-install-done",
            serde_json::json!({ "success": true, "version": ver, "bundled": true }),
        );
        return Ok(ver);
    }

    // Step 1: 确保 uv 可用
    let uv_path = ensure_uv(&app).await?;
    let _ = app.emit("hermes-install-progress", 20u32);

    // 确保 web extras 始终包含（gateway 需要 aiohttp）
    if !extras.contains(&"web".to_string()) {
        let _ = app.emit(
            "hermes-install-log",
            "🔌 自动添加 web 扩展（aiohttp，Gateway 必需）",
        );
    }
    let mut install_extras = extras.clone();
    if !install_extras.contains(&"web".to_string()) {
        install_extras.push("web".to_string());
    }

    // Step 1b: 检查本地 hermes-agent-main.zip（优先使用，避免网络下载）
    let local_source: Option<String> = {
        let bundled = bundled_hermes_archive_path();
        if bundled.exists() {
            let _ = app.emit("hermes-install-log", "📦 发现本地 Hermes Agent 源码包");
            match extract_hermes_zip(&bundled) {
                Ok(extracted) => {
                    let _ = app.emit(
                        "hermes-install-log",
                        format!("✓ 本地源码包已解压到: {}", extracted.display()),
                    );
                    Some(extracted.to_string_lossy().to_string())
                }
                Err(e) => {
                    let _ = app.emit(
                        "hermes-install-log",
                        format!("⚠️ 本地源码包解压失败: {e}，将尝试从 GitHub 安装"),
                    );
                    None
                }
            }
        } else {
            None
        }
    };

    // Step 2: 执行安装
    match method.as_str() {
        "uv-tool" | "" => {
            install_via_uv_tool(&app, &uv_path, &install_extras, local_source.as_deref()).await?
        }
        "uv-pip" => {
            install_via_uv_pip(&app, &uv_path, &install_extras, local_source.as_deref()).await?
        }
        other => return Err(format!("不支持的安装方式: {other}")),
    };

    let _ = app.emit("hermes-install-progress", 90u32);

    // Step 3: 验证安装
    let _ = app.emit("hermes-install-log", "🔍 验证安装...");
    let enhanced = hermes_enhanced_path();
    match run_at_path("hermes", &["version"], &enhanced) {
        Ok(ver) => {
            let _ = app.emit(
                "hermes-install-log",
                format!("✅ Hermes Agent 安装成功: {ver}"),
            );
            let _ = app.emit("hermes-install-progress", 100u32);
            let _ = app.emit(
                "hermes-install-done",
                serde_json::json!({ "success": true, "version": ver }),
            );
            Ok(ver)
        }
        Err(e) => {
            let msg = format!("⚠️ 安装完成但验证失败: {e}");
            let _ = app.emit("hermes-install-log", &msg);
            let _ = app.emit(
                "hermes-install-done",
                serde_json::json!({ "success": false, "error": msg }),
            );
            Err(msg)
        }
    }
}

/// 从字节数据中解压 uv 并验证，返回 uv 可执行文件路径
fn extract_and_verify_uv(
    data: &[u8],
    bin_dir: &std::path::Path,
    uv_path: &std::path::Path,
) -> Result<String, String> {
    std::fs::create_dir_all(bin_dir).map_err(|e| format!("创建目录失败: {e}"))?;

    #[cfg(target_os = "windows")]
    {
        extract_uv_zip(data, bin_dir)?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        extract_uv_tar_gz(data, bin_dir)?;
    }

    let path_str = uv_path.to_string_lossy().to_string();
    if !uv_path.exists() {
        return Err("uv 解压后未找到".into());
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(uv_path, std::fs::Permissions::from_mode(0o755));
    }

    match run_silent(&path_str, &["--version"]) {
        Ok(_) => Ok(path_str),
        Err(e) => Err(format!("uv 验证失败: {e}")),
    }
}

/// 确保 uv 二进制可用，不存在则下载
/// 查找顺序: 已有二进制 → 系统 PATH → 应用内置资源 → 本地缓存 → 网络下载
async fn ensure_uv(app: &tauri::AppHandle) -> Result<String, String> {
    let uv_path = uv_bin_path();

    // 已有 uv（ClawPanel 管理的路径）
    if uv_path.exists() {
        let path_str = uv_path.to_string_lossy().to_string();
        if let Ok(ver) = run_silent(&path_str, &["--version"]) {
            let _ = app.emit("hermes-install-log", format!("✓ uv 已就绪: {ver}"));
            return Ok(path_str);
        }
    }

    // 系统 PATH 中有 uv
    let enhanced = hermes_enhanced_path();
    if let Ok(ver) = run_at_path("uv", &["--version"], &enhanced) {
        let _ = app.emit("hermes-install-log", format!("✓ 系统 uv 已就绪: {ver}"));
        if let Some(path) = find_executable_path("uv", &enhanced) {
            return Ok(path);
        }
        return Ok("uv".into());
    }

    // 检查内置 uv 包（Dev: src-tauri/resources/，便携: exe 同级 resources/）
    let bundled_zip = bundled_uv_archive_path();
    if bundled_zip.exists() {
        let _ = app.emit("hermes-install-log", "📦 发现内置 uv 包，解压中...");
        let _ = app.emit("hermes-install-progress", 5u32);
        let bin_dir = uv_bin_dir();
        match std::fs::read(&bundled_zip) {
            Ok(data) => match extract_and_verify_uv(&data, &bin_dir, &uv_path) {
                Ok(path) => {
                    let _ = app.emit("hermes-install-log", "✓ uv 安装成功 (内置资源)");
                    return Ok(path);
                }
                Err(e) => {
                    let _ = app.emit(
                        "hermes-install-log",
                        format!("⚠️ 内置资源解压失败: {e}，尝试本地缓存..."),
                    );
                }
            },
            Err(e) => {
                let _ = app.emit(
                    "hermes-install-log",
                    format!("⚠️ 读取内置资源失败: {e}，尝试本地缓存..."),
                );
            }
        }
    }

    // 检查本地缓存（应用根目录下的 cache/）
    let cache_path = uv_cached_archive_path();
    if cache_path.exists() {
        let _ = app.emit("hermes-install-log", "📦 发现本地缓存 uv 包，解压中...");
        let _ = app.emit("hermes-install-progress", 5u32);
        let bin_dir = uv_bin_dir();
        match std::fs::read(&cache_path) {
            Ok(data) => match extract_and_verify_uv(&data, &bin_dir, &uv_path) {
                Ok(path) => {
                    let _ = app.emit("hermes-install-log", "✓ uv 安装成功 (本地缓存)");
                    return Ok(path);
                }
                Err(e) => {
                    let _ = app.emit(
                        "hermes-install-log",
                        format!("⚠️ 缓存文件错误: {e}，尝试网络下载..."),
                    );
                }
            },
            Err(e) => {
                let _ = app.emit(
                    "hermes-install-log",
                    format!("⚠️ 读取缓存文件失败: {e}，尝试网络下载..."),
                );
            }
        }
    }

    // 需要下载 uv
    let _ = app.emit("hermes-install-log", "📦 下载 uv 包管理器...");
    let _ = app.emit("hermes-install-progress", 5u32);

    let version = "0.7.12"; // 稳定版本
    let url = uv_download_url(version);
    let _ = app.emit("hermes-install-log", format!("下载: {url}"));

    let client = super::build_http_client(std::time::Duration::from_secs(300), Some("ClawPanel"))
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("uv 下载失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("uv 下载失败 (HTTP {})", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("uv 下载读取失败: {e}"))?;

    let _ = app.emit(
        "hermes-install-log",
        format!(
            "下载完成 ({:.1}MB)，解压中...",
            bytes.len() as f64 / 1_048_576.0
        ),
    );
    let _ = app.emit("hermes-install-progress", 12u32);

    let bin_dir = uv_bin_dir();
    extract_and_verify_uv(&bytes, &bin_dir, &uv_path)
}

/// Windows: 解压 zip 格式的 uv 二进制
#[cfg(target_os = "windows")]
fn extract_uv_zip(data: &[u8], dest: &std::path::Path) -> Result<(), String> {
    let reader = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("ZIP 解析失败: {e}"))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("ZIP 条目读取失败: {e}"))?;
        let name = file.name().to_string();
        // 只提取 uv.exe（可能在子目录中）
        if name.ends_with("uv.exe") {
            let out_path = dest.join("uv.exe");
            let mut out_file =
                std::fs::File::create(&out_path).map_err(|e| format!("创建文件失败: {e}"))?;
            std::io::copy(&mut file, &mut out_file).map_err(|e| format!("写入失败: {e}"))?;
            return Ok(());
        }
    }
    Err("ZIP 中未找到 uv.exe".into())
}

/// Unix: 解压 tar.gz 格式的 uv 二进制
#[cfg(not(target_os = "windows"))]
fn extract_uv_tar_gz(data: &[u8], dest: &std::path::Path) -> Result<(), String> {
    let gz = flate2::read::GzDecoder::new(std::io::Cursor::new(data));
    let mut archive = tar::Archive::new(gz);
    for entry in archive
        .entries()
        .map_err(|e| format!("tar 解析失败: {e}"))?
    {
        let mut entry = entry.map_err(|e| format!("tar 条目读取失败: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("路径读取失败: {e}"))?
            .to_path_buf();
        if let Some(name) = path.file_name() {
            if name == "uv" {
                let out_path = dest.join("uv");
                let mut out_file =
                    std::fs::File::create(&out_path).map_err(|e| format!("创建文件失败: {e}"))?;
                std::io::copy(&mut entry, &mut out_file).map_err(|e| format!("写入失败: {e}"))?;
                return Ok(());
            }
        }
    }
    Err("tar.gz 中未找到 uv".into())
}

/// Hermes Agent 的 GitHub 仓库地址（不在 PyPI 上发布，只能从 GitHub 安装）
const HERMES_GIT_URL: &str = "git+https://github.com/NousResearch/hermes-agent.git";

/// 运行 uv 命令并实时流式输出日志到前端
/// 使用 tokio::io::BufReader 逐行读取 stdout/stderr，每行立即通过 app.emit 发送
/// 同时处理超时，超时后自动 kill 子进程
async fn run_uv_with_streaming(
    app: &tauri::AppHandle,
    cmd: &mut tokio::process::Command,
    timeout_secs: u64,
) -> Result<std::process::Output, String> {
    use tokio::io::AsyncBufReadExt;

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("启动进程失败: {e}"))?;

    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取 stderr")?;

    let mut stdout_reader = tokio::io::BufReader::new(stdout).lines();
    let mut stderr_reader = tokio::io::BufReader::new(stderr).lines();

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

    let mut collected_stdout: Vec<String> = Vec::new();
    let mut collected_stderr: Vec<String> = Vec::new();

    let mut stdout_done = false;
    let mut stderr_done = false;

    loop {
        if stdout_done && stderr_done {
            break;
        }

        // 检查超时
        if tokio::time::Instant::now() >= deadline {
            let _ = child.kill().await;
            // 读取剩余的缓冲输出
            if !stdout_done {
                while let Ok(Some(line)) = stdout_reader.next_line().await {
                    let trimmed = line.trim().to_string();
                    if !trimmed.is_empty() {
                        let _ = app.emit("hermes-install-log", &trimmed);
                    }
                    collected_stdout.push(line);
                }
            }
            if !stderr_done {
                while let Ok(Some(line)) = stderr_reader.next_line().await {
                    let trimmed = line.trim().to_string();
                    if !trimmed.is_empty() {
                        let _ = app.emit("hermes-install-log", &trimmed);
                    }
                    collected_stderr.push(line);
                }
            }
            return Err(format!(
                "操作超时 ({}s)。可能是网络原因导致下载失败，请检查网络后重试。",
                timeout_secs
            ));
        }

        tokio::select! {
            result = stdout_reader.next_line(), if !stdout_done => {
                match result {
                    Ok(Some(line)) => {
                        let trimmed = line.trim().to_string();
                        if !trimmed.is_empty() {
                            let _ = app.emit("hermes-install-log", &trimmed);
                        }
                        collected_stdout.push(line);
                    }
                    _ => { stdout_done = true; }
                }
            }
            result = stderr_reader.next_line(), if !stderr_done => {
                match result {
                    Ok(Some(line)) => {
                        let trimmed = line.trim().to_string();
                        if !trimmed.is_empty() {
                            let _ = app.emit("hermes-install-log", &trimmed);
                        }
                        collected_stderr.push(line);
                    }
                    _ => { stderr_done = true; }
                }
            }
        }
    }

    // 等待子进程结束
    let status = child
        .wait()
        .await
        .map_err(|e| format!("等待进程结束失败: {e}"))?;

    Ok(std::process::Output {
        status,
        stdout: collected_stdout.join("\n").into_bytes(),
        stderr: collected_stderr.join("\n").into_bytes(),
    })
}

/// 通过 uv tool install 安装 Hermes Agent
/// local_source: 本地源码路径（优先），None 则从 GitHub 安装
async fn install_via_uv_tool(
    app: &tauri::AppHandle,
    uv_path: &str,
    extras: &[String],
    local_source: Option<&str>,
) -> Result<(), String> {
    let source_label = if local_source.is_some() {
        "本地源码"
    } else {
        "GitHub"
    };
    let _ = app.emit(
        "hermes-install-log",
        format!("📦 通过 uv tool install 从 {source_label} 安装 Hermes Agent..."),
    );
    let _ = app.emit("hermes-install-progress", 25u32);

    // 构造源码 URL（local_source 或 GitHub）
    let source_url = match local_source {
        Some(path) => {
            let normalized = path.replace('\\', "/");
            if normalized.starts_with('/') {
                format!("file://{normalized}")
            } else {
                format!("file:///{normalized}")
            }
        }
        None => HERMES_GIT_URL.to_string(),
    };

    let mut cmd = tokio::process::Command::new(uv_path);
    // 使用 @ PEP 508 语法：`uv tool install "hermes-agent[web] @ file:///path"`
    // --from 无法解析本地源码目录，因此用 --with 显式指定依赖
    let pkg = if extras.is_empty() {
        format!("hermes-agent @ {source_url}")
    } else {
        format!("hermes-agent[{}] @ {source_url}", extras.join(","))
    };
    cmd.args(["tool", "install", "--force", &pkg]);
    cmd.args(["--with", "croniter"]);
    if extras.iter().any(|e| e.eq_ignore_ascii_case("web")) {
        cmd.args(["--with", "aiohttp"]);
    }

    // 配置 PyPI 镜像（extras 的依赖仍从 PyPI 下载）
    if let Some(mirror) = pypi_mirror_url() {
        cmd.args(["--index-url", &mirror]);
    }

    // 代理
    super::apply_proxy_env_tokio(&mut cmd);
    cmd.env("PATH", hermes_enhanced_path());
    // 从 GitHub 安装时需要 git 来克隆仓库
    if local_source.is_none() {
        cmd.env("GIT_TERMINAL_PROMPT", "0");
    }
    // 便携模式：设置 UV_TOOL_DIR，使 hermes.exe 安装到 <app_root>/uv-tools/bin/
    {
        let uv_tools = uv_tool_dir();
        let _ = std::fs::create_dir_all(&uv_tools);
        cmd.env("UV_TOOL_DIR", uv_tools.to_string_lossy().to_string());
    }
    // 便携模式：设置 UV_PYTHON_INSTALL_DIR 并尝试使用本地缓存的 Python 可执行文件
    // 通过 --python <完整路径> 跳过 uv 的网络下载
    {
        if let Some(uv_python) = prepare_uv_python_dir() {
            cmd.env(
                "UV_PYTHON_INSTALL_DIR",
                uv_python.to_string_lossy().to_string(),
            );
            // 查找本地缓存的 python.exe（优先使用，跳过 uv 网络下载）
            if let Some(python_path) = find_cached_python(&uv_python) {
                cmd.arg("--python");
                cmd.arg(&python_path);
                let _ = app.emit(
                    "hermes-install-log",
                    format!("✓ 使用本地缓存 Python: {python_path}"),
                );
            } else {
                cmd.args(["--python", "3.11"]);
                let _ = app.emit(
                    "hermes-install-log",
                    "ℹ Python 缓存目录已准备，等待 uv 自行下载 Python 3.11...",
                );
            }
        } else {
            cmd.args(["--python", "3.11"]);
            let _ = app.emit(
                "hermes-install-log",
                "ℹ 使用 uv 默认 Python 缓存 (~/.uv/python/)",
            );
        }
    }

    // 限制 HTTP 超时，防止网络问题导致无限挂起
    cmd.env("UV_HTTP_TIMEOUT", "120");
    // 限制并发下载数，避免网络抖动
    cmd.env("UV_CONCURRENT_DOWNLOADS", "4");

    let _ = app.emit(
        "hermes-install-log",
        format!(
            "> uv tool install {} @ {source_url} --with croniter{} --python <cache>",
            if extras.is_empty() {
                "hermes-agent".to_string()
            } else {
                format!("hermes-agent[{}]", extras.join(","))
            },
            if extras.iter().any(|e| e.eq_ignore_ascii_case("web")) {
                " --with aiohttp"
            } else {
                ""
            }
        ),
    );

    let output = run_uv_with_streaming(app, &mut cmd, 600).await?;

    if output.status.success() {
        let _ = app.emit("hermes-install-log", "✓ uv tool install 完成");
        // 更新 shell PATH
        let mut update_cmd = tokio::process::Command::new(uv_path);
        update_cmd.args(["tool", "update-shell"]);
        #[cfg(target_os = "windows")]
        update_cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = update_cmd.output().await;
        Ok(())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "安装失败 (exit {}): {}",
            output.status.code().unwrap_or(-1),
            err_msg.trim()
        ))
    }
}

/// 通过 uv pip install 安装到 venv（备选方式）
/// local_source: 本地源码路径（优先），None 则从 GitHub 安装
async fn install_via_uv_pip(
    app: &tauri::AppHandle,
    uv_path: &str,
    extras: &[String],
    local_source: Option<&str>,
) -> Result<(), String> {
    let source_label = if local_source.is_some() {
        "本地源码"
    } else {
        "GitHub"
    };
    let _ = app.emit(
        "hermes-install-log",
        format!("📦 通过 uv venv + pip install 从 {source_label} 安装..."),
    );
    let _ = app.emit("hermes-install-progress", 25u32);

    let venv_dir = app_root_dir().join("data").join("hermes-venv");
    let venv_str = venv_dir.to_string_lossy().to_string();

    // 创建 venv
    let _ = app.emit(
        "hermes-install-log",
        format!("> uv venv {venv_str} --python 3.11"),
    );
    let mut venv_cmd = tokio::process::Command::new(uv_path);
    venv_cmd.args(["venv", &venv_str]);
    // 便携模式：设置 UV_PYTHON_INSTALL_DIR 并尝试使用本地缓存的 Python 可执行文件
    {
        if let Some(uv_python) = prepare_uv_python_dir() {
            venv_cmd.env(
                "UV_PYTHON_INSTALL_DIR",
                uv_python.to_string_lossy().to_string(),
            );
            // 查找本地缓存的 python.exe（优先使用，跳过 uv 网络下载）
            if let Some(python_path) = find_cached_python(&uv_python) {
                venv_cmd.arg("--python");
                venv_cmd.arg(&python_path);
                let _ = app.emit(
                    "hermes-install-log",
                    format!("✓ 使用本地缓存 Python: {python_path}"),
                );
            } else {
                venv_cmd.args(["--python", "3.11"]);
                let _ = app.emit(
                    "hermes-install-log",
                    "ℹ Python 缓存目录已准备，等待 uv 自行下载 Python 3.11...",
                );
            }
        } else {
            venv_cmd.args(["--python", "3.11"]);
            let _ = app.emit(
                "hermes-install-log",
                "ℹ 使用 uv 默认 Python 缓存 (~/.uv/python/)",
            );
        }
    }
    // 限制 HTTP 超时，防止网络问题导致无限挂起
    venv_cmd.env("UV_HTTP_TIMEOUT", "120");
    venv_cmd.env("UV_CONCURRENT_DOWNLOADS", "4");
    super::apply_proxy_env_tokio(&mut venv_cmd);
    let venv_out = run_uv_with_streaming(app, &mut venv_cmd, 300).await?;
    if !venv_out.status.success() {
        let stderr = String::from_utf8_lossy(&venv_out.stderr);
        return Err(format!("创建 venv 失败: {stderr}"));
    }
    let _ = app.emit("hermes-install-log", "✓ Python 虚拟环境创建完成");
    let _ = app.emit("hermes-install-progress", 40u32);

    // pip install（本地或 GitHub）
    let source_url = match local_source {
        Some(path) => {
            let normalized = path.replace('\\', "/");
            if normalized.starts_with('/') {
                format!("file://{normalized}")
            } else {
                format!("file:///{normalized}")
            }
        }
        None => HERMES_GIT_URL.to_string(),
    };
    let pkg = if extras.is_empty() {
        format!("hermes-agent @ {source_url}")
    } else {
        format!("hermes-agent[{}] @ {source_url}", extras.join(","))
    };
    let _ = app.emit("hermes-install-log", format!("> uv pip install \"{pkg}\""));

    let mut pip_cmd = tokio::process::Command::new(uv_path);
    pip_cmd.args(["pip", "install", &pkg]);
    if local_source.is_none() {
        pip_cmd.env("GIT_TERMINAL_PROMPT", "0");
    }
    pip_cmd.env("VIRTUAL_ENV", &venv_str);
    if let Some(mirror) = pypi_mirror_url() {
        pip_cmd.args(["--index-url", &mirror]);
    }
    // 限制 HTTP 超时，防止网络问题导致无限挂起
    pip_cmd.env("UV_HTTP_TIMEOUT", "120");
    pip_cmd.env("UV_CONCURRENT_DOWNLOADS", "4");
    super::apply_proxy_env_tokio(&mut pip_cmd);

    let pip_out = run_uv_with_streaming(app, &mut pip_cmd, 600).await?;

    if !pip_out.status.success() {
        let err_msg = String::from_utf8_lossy(&pip_out.stderr);
        return Err(format!("pip install 失败: {}", err_msg.trim()));
    }

    let _ = app.emit("hermes-install-log", "✓ pip install 完成");

    // 创建全局命令链接
    #[cfg(not(target_os = "windows"))]
    {
        let hermes_bin = venv_dir.join("bin").join("hermes");
        let link_dir = home.join(".local").join("bin");
        let _ = std::fs::create_dir_all(&link_dir);
        let link_path = link_dir.join("hermes");
        let _ = std::fs::remove_file(&link_path);
        if let Err(e) = std::os::unix::fs::symlink(&hermes_bin, &link_path) {
            let _ = app.emit(
                "hermes-install-log",
                format!("⚠️ 创建全局链接失败: {e}（hermes 仍可通过 {hermes_bin:?} 使用）"),
            );
        } else {
            let _ = app.emit("hermes-install-log", format!("✓ 全局链接: {link_path:?}"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Windows: 将 venv\Scripts 加入用户 PATH（通过注册表）
        let scripts_dir = venv_dir.join("Scripts");
        let _ = app.emit(
            "hermes-install-log",
            format!("提示：请将 {} 加入系统 PATH", scripts_dir.display()),
        );
    }

    Ok(())
}

/// 获取 PyPI 镜像 URL（如果配置了的话）
fn pypi_mirror_url() -> Option<String> {
    super::read_panel_config_value()
        .and_then(|v| v.get("pypiMirror")?.as_str().map(String::from))
        .filter(|s| !s.trim().is_empty())
}

// ---------------------------------------------------------------------------
// configure_hermes — 写入配置
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn configure_hermes(
    provider: String,
    api_key: String,
    model: Option<String>,
    base_url: Option<String>,
) -> Result<String, String> {
    let home = hermes_home();
    std::fs::create_dir_all(&home).map_err(|e| format!("创建配置目录失败: {e}"))?;

    // 创建子目录
    for dir in &[
        "cron",
        "sessions",
        "logs",
        "memories",
        "skills",
        "pairing",
        "hooks",
        "image_cache",
        "audio_cache",
    ] {
        let _ = std::fs::create_dir_all(home.join(dir));
    }

    // ---- Provider-aware key routing ----
    // ClawPanel 使用 HERMES_PROVIDER_REGISTRY (22 providers) 决定 .env key 名和
    // config.yaml 的 model.provider 字段。详见 hermes_providers.rs 的文档。
    use super::hermes_providers;

    let pcfg = hermes_providers::get_provider(&provider);

    // 模型标识：优先使用调用方传入，否则用 provider 的首个已知模型；
    // aggregator 没有默认模型，要求调用方显式提供。
    let model_str = model.unwrap_or_else(|| {
        pcfg.and_then(|p| p.models.first().map(|s| s.to_string()))
            .unwrap_or_default()
    });
    if model_str.is_empty() {
        return Err(format!(
            "Provider '{provider}' has no default model; please pass an explicit model name"
        ));
    }

    // ---- 写入 config.yaml（合并模式：保留用户自定义的 hooks/skills/cron 等） ----
    let config_path = home.join("config.yaml");
    let base_url_value = base_url
        .as_ref()
        .map(|url| url.trim().trim_end_matches('/').to_string())
        .unwrap_or_default();
    let base_url_line = if !base_url_value.is_empty() {
        format!("  base_url: {base_url_value}\n")
    } else {
        String::new()
    };
    let transport = pcfg
        .map(|p| p.transport)
        .unwrap_or(hermes_providers::TRANSPORT_OPENAI_CHAT);
    let openai_chat_transport = transport == hermes_providers::TRANSPORT_OPENAI_CHAT;
    let custom_provider = provider == "custom";
    let api_mode_line = if custom_provider || (!base_url_value.is_empty() && openai_chat_transport)
    {
        "  api_mode: chat_completions\n".to_string()
    } else {
        String::new()
    };
    let custom_provider_block = if custom_provider && !base_url_value.is_empty() {
        format!(
            "custom_providers:\n  - name: custom_openai\n    base_url: {base_url_value}\n    key_env: OPENAI_API_KEY\n    api_mode: chat_completions\n    model: {model_str}\n"
        )
    } else {
        String::new()
    };
    let base_url_for_env: Option<String> = match base_url.as_ref() {
        Some(url) if !url.trim().is_empty() => Some(url.trim().to_string()),
        _ => None,
    };
    // Provider 字段：Hermes v0.14+ 的 model_switch 依赖该字段决定 env_var。
    // MiniMax/Anthropic transport 不能写 chat_completions，也不能带 custom OpenAI-compatible providers。
    let provider_line = if provider.is_empty() {
        String::new()
    } else {
        format!("  provider: {provider}\n{api_mode_line}")
    };

    let config_content = if config_path.exists() {
        // 读取现有配置，只更新 model 区块，保留其余内容
        let existing = std::fs::read_to_string(&config_path).unwrap_or_default();
        merge_hermes_config_yaml(
            &existing,
            &model_str,
            &base_url_line,
            &provider_line,
            &custom_provider_block,
        )
    } else {
        // 首次创建：生成完整的基线配置
        format!(
            r#"# Hermes Agent configuration (managed by ClawPanel)
model:
  default: {model_str}
{provider_line}{base_url_line}platform_toolsets:
  api_server:
    - hermes-api-server
terminal:
  backend: local
platforms:
  api_server:
    enabled: true
{custom_provider_block}
"#
        )
    };
    std::fs::write(&config_path, &config_content)
        .map_err(|e| format!("写入 config.yaml 失败: {e}"))?;

    // ---- 写入 .env（合并模式：保留用户自定义的环境变量如 TAVILY_API_KEY 等） ----
    // 根据 provider 选择正确的 env var；OAuth/external_process 类没有 api_key_env_vars，
    // 此时跳过写 key（CLI 登录后 Hermes 会自行管理 auth.json）。
    let key_env = hermes_providers::primary_api_key_env(&provider);
    let url_env = hermes_providers::primary_base_url_env(&provider);

    // ClawPanel 管理的 key 列表：包含所有 provider 的 api_key_env_vars + base_url_env_vars
    // + ClawPanel 特定的两个 key。换 provider 时这些会被重写或清除。
    let managed_keys_owned = hermes_providers::all_managed_env_keys();
    let managed_keys: Vec<&str> = managed_keys_owned.to_vec();

    let mut new_pairs: Vec<(String, String)> = vec![
        ("GATEWAY_ALLOW_ALL_USERS".into(), "true".into()),
        ("API_SERVER_KEY".into(), "clawpanel-local".into()),
    ];

    if let Some(env) = key_env {
        if !api_key.trim().is_empty() {
            new_pairs.push((env.into(), api_key.trim().into()));
        }
    } else if !api_key.trim().is_empty() {
        // OAuth provider 传了 api_key —— 记日志，不落盘
        eprintln!("[configure_hermes] Provider '{provider}' uses OAuth; ignoring provided api_key");
    }

    if let (Some(env), Some(url)) = (url_env, base_url_for_env.as_ref()) {
        let u = url.trim();
        if !u.is_empty() {
            new_pairs.push((env.into(), u.into()));
        }
    }

    let env_path = home.join(".env");
    let env_content = if env_path.exists() {
        let existing = std::fs::read_to_string(&env_path).unwrap_or_default();
        merge_env_file(&existing, &managed_keys, &new_pairs)
    } else {
        new_pairs
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("\n")
            + "\n"
    };
    std::fs::write(&env_path, &env_content).map_err(|e| format!("写入 .env 失败: {e}"))?;

    // Unix: 设置 .env 文件权限为 600
    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&env_path, std::fs::Permissions::from_mode(0o600));
    }

    Ok("配置已保存".into())
}

// ---------------------------------------------------------------------------
// 配置合并帮助函数
// ---------------------------------------------------------------------------

/// 合并 Hermes config.yaml：只更新 model 区块（default/base_url），
/// 保留用户自定义的 hooks、skills、cron、session 等其他顶级 section。
fn merge_hermes_config_yaml(
    existing: &str,
    model_str: &str,
    base_url_line: &str,
    provider_line: &str,
    custom_provider_block: &str,
) -> String {
    let mut result = Vec::new();
    let mut in_model_block = false;
    let mut model_block_written = false;
    let lines: Vec<&str> = existing.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        if is_hermes_model_provider_section(trimmed) {
            i += 1;
            while i < lines.len() {
                let next = lines[i];
                let next_trimmed = next.trim();
                if next_trimmed.is_empty() {
                    i += 1;
                    continue;
                }
                if next.starts_with("  ") || next.starts_with('\t') {
                    i += 1;
                    continue;
                }
                break;
            }
            continue;
        }

        if trimmed == "model:" || trimmed.starts_with("model:") {
            // 进入 model 区块，写入新的 model 配置
            in_model_block = true;
            model_block_written = true;
            result.push("model:".to_string());
            result.push(format!("  default: {model_str}"));
            if !base_url_line.is_empty() {
                // base_url_line 已包含 "  base_url: xxx\n" 格式
                result.push(base_url_line.trim_end().to_string());
            }
            // provider_line 仅在非空时写入（Hermes 不需要 provider 字段）
            if !provider_line.is_empty() {
                result.push(provider_line.trim_end().to_string());
            }
            i += 1;
            // 跳过旧 model 区块的缩进行
            while i < lines.len() {
                let next = lines[i];
                let next_trimmed = next.trim();
                // 空行或缩进行（属于 model 区块）继续跳过
                if next_trimmed.is_empty() {
                    i += 1;
                    continue;
                }
                if next.starts_with("  ") || next.starts_with('\t') {
                    i += 1;
                    continue;
                }
                // 遇到新的顶级 key，停止跳过
                break;
            }
            continue;
        }

        if in_model_block
            && !trimmed.is_empty()
            && !line.starts_with("  ")
            && !line.starts_with('\t')
        {
            in_model_block = false;
        }

        if !in_model_block {
            result.push(line.to_string());
        }
        i += 1;
    }

    // 如果原文件没有 model: 区块（异常情况），追加
    if !model_block_written {
        result.push("model:".to_string());
        result.push(format!("  default: {model_str}"));
        if !base_url_line.is_empty() {
            result.push(base_url_line.trim_end().to_string());
        }
        if !provider_line.is_empty() {
            result.push(provider_line.trim_end().to_string());
        }
    }

    // 确保 platform_toolsets 和 platforms 存在（首次合并保底）
    let joined = result.join("\n");
    let mut final_content = joined.clone();
    if !final_content.contains("platform_toolsets:") {
        final_content.push_str("\nplatform_toolsets:\n  api_server:\n    - hermes-api-server\n");
    }
    if !final_content.contains("terminal:") {
        final_content.push_str("terminal:\n  backend: local\n");
    }
    if !final_content.contains("platforms:") {
        final_content.push_str("platforms:\n  api_server:\n    enabled: true\n");
    }
    if !custom_provider_block.trim().is_empty() {
        if !final_content.ends_with('\n') {
            final_content.push('\n');
        }
        final_content.push_str(custom_provider_block);
    }
    if !final_content.ends_with('\n') {
        final_content.push('\n');
    }
    final_content
}

fn is_hermes_model_provider_section(trimmed: &str) -> bool {
    trimmed == "custom_providers:"
        || trimmed.starts_with("custom_providers:")
        || trimmed == "providers:"
        || trimmed.starts_with("providers:")
        || trimmed == "fallback_providers:"
        || trimmed.starts_with("fallback_providers:")
        || trimmed == "credential_pool_strategies:"
        || trimmed.starts_with("credential_pool_strategies:")
        || trimmed == "auxiliary:"
        || trimmed.starts_with("auxiliary:")
}

/// 合并 .env 文件：更新 managed_keys 对应的值，保留用户自定义的其他环境变量。
fn merge_env_file(existing: &str, managed_keys: &[&str], new_pairs: &[(String, String)]) -> String {
    let mut result = Vec::new();
    let _new_keys: std::collections::HashSet<&str> =
        new_pairs.iter().map(|(k, _)| k.as_str()).collect();

    // 保留非 managed 的行，跳过 managed 的行（后面追加新值）
    for line in existing.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            result.push(line.to_string());
            continue;
        }
        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim();
            if managed_keys.contains(&key) {
                // 跳过 managed key（后面追加新值）
                continue;
            }
        }
        result.push(line.to_string());
    }

    // 追加新的 managed key=value
    for (k, v) in new_pairs {
        result.push(format!("{k}={v}"));
    }

    let mut content = result.join("\n");
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content
}

#[tauri::command]
pub async fn hermes_read_config() -> Result<Value, String> {
    use super::hermes_providers;

    let home = hermes_home();
    let config_path = home.join("config.yaml");
    let env_path = home.join(".env");

    // 读取 config.yaml
    let config_raw = std::fs::read_to_string(&config_path).unwrap_or_default();
    let mut model_name = String::new();
    let mut base_url_from_yaml = String::new();
    let mut provider_from_yaml = String::new();
    let mut in_model = false;
    for line in config_raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("model:") {
            in_model = true;
            // `model: "xxx"` 单行格式
            if let Some(v) = trimmed
                .strip_prefix("model:")
                .map(|s| s.trim().trim_matches('"'))
            {
                if !v.is_empty() && !v.contains(':') {
                    model_name = v.to_string();
                }
            }
            continue;
        }
        if in_model {
            if trimmed.starts_with("default:") {
                model_name = trimmed
                    .strip_prefix("default:")
                    .unwrap()
                    .trim()
                    .trim_matches('"')
                    .to_string();
            } else if trimmed.starts_with("base_url:") {
                base_url_from_yaml = trimmed
                    .strip_prefix("base_url:")
                    .unwrap()
                    .trim()
                    .trim_matches('"')
                    .to_string();
            } else if trimmed.starts_with("provider:") {
                provider_from_yaml = trimmed
                    .strip_prefix("provider:")
                    .unwrap()
                    .trim()
                    .trim_matches('"')
                    .to_string();
            } else if !trimmed.is_empty() && !trimmed.starts_with('#') && !trimmed.starts_with('-')
            {
                in_model = false;
            }
        }
    }

    // 读取 .env 到 key→value map
    let env_raw = std::fs::read_to_string(&env_path).unwrap_or_default();
    let env_map: std::collections::HashMap<String, String> = env_raw
        .lines()
        .filter_map(|line| {
            let t = line.trim();
            if t.is_empty() || t.starts_with('#') {
                return None;
            }
            t.split_once('=')
                .map(|(k, v)| (k.trim().to_string(), v.to_string()))
        })
        .collect();

    // 推断 provider：优先 config.yaml.model.provider，其次从 .env 反查
    let provider_id: String = if !provider_from_yaml.is_empty() {
        provider_from_yaml.clone()
    } else {
        let keys_refs: Vec<&str> = env_map.keys().map(|s| s.as_str()).collect();
        hermes_providers::infer_provider_from_env_keys(&keys_refs)
            .map(String::from)
            .unwrap_or_default()
    };

    // 按 provider 的 api_key_env_vars 顺序拿 api_key
    let api_key: String = hermes_providers::get_provider(&provider_id)
        .and_then(|p| {
            p.api_key_env_vars
                .iter()
                .find_map(|ev| env_map.get(*ev).cloned())
        })
        .unwrap_or_default();

    // 有效 base_url：优先 config.yaml.model.base_url，其次 provider 的 base_url_env_var
    let effective_base_url: String = if !base_url_from_yaml.is_empty() {
        base_url_from_yaml.clone()
    } else {
        hermes_providers::get_provider(&provider_id)
            .and_then(|p| {
                if p.base_url_env_var.is_empty() {
                    None
                } else {
                    env_map.get(p.base_url_env_var).cloned()
                }
            })
            .unwrap_or_default()
    };

    // UI 显示用短名（去掉 provider/ 前缀），如 openai/QC-S05 → QC-S05
    let display_model = if let Some(pos) = model_name.find('/') {
        model_name[pos + 1..].to_string()
    } else {
        model_name.clone()
    };

    Ok(serde_json::json!({
        "model": display_model,
        "model_raw": model_name,
        "base_url": effective_base_url,
        "provider": provider_id,
        "api_key": api_key,
        "config_exists": config_path.exists(),
    }))
}

// ---------------------------------------------------------------------------
// hermes_fetch_models — 从 API 获取模型列表（后端代理，避免 CORS）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn hermes_fetch_models(
    base_url: String,
    api_key: String,
    api_type: Option<String>,
    provider: Option<String>,
) -> Result<Vec<String>, String> {
    use super::hermes_providers;

    // 如果显式指定了 provider，优先走注册表决定 probe 方式 + fallback
    if let Some(pid) = provider.as_ref() {
        if let Some(pcfg) = hermes_providers::get_provider(pid) {
            // OAuth / external_process / copilot → 不能用 api_key 探测，
            // 直接返回静态 catalog
            if pcfg.models_probe == hermes_providers::PROBE_NONE {
                let mut models: Vec<String> = pcfg.models.iter().map(|s| s.to_string()).collect();
                models.sort();
                return Ok(models);
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    // api_type 优先级：调用方 api_type > provider.transport 推断 > 默认 openai
    let api = api_type.unwrap_or_else(|| {
        provider
            .as_ref()
            .and_then(|pid| hermes_providers::get_provider(pid))
            .map(|p| match p.transport {
                hermes_providers::TRANSPORT_ANTHROPIC => "anthropic-messages".to_string(),
                hermes_providers::TRANSPORT_GOOGLE => "google-generative-ai".to_string(),
                _ => "openai".to_string(),
            })
            .unwrap_or_else(|| "openai".into())
    });

    let mut base = base_url.trim_end_matches('/').to_string();
    // 移除尾部的 chat/completions 等路径
    for suffix in &[
        "/chat/completions",
        "/completions",
        "/responses",
        "/messages",
        "/models",
    ] {
        if base.ends_with(suffix) {
            base = base[..base.len() - suffix.len()].to_string();
        }
    }

    let resp = match api.as_str() {
        "anthropic-messages" => {
            if !base.ends_with("/v1") {
                base.push_str("/v1");
            }
            client
                .get(format!("{base}/models"))
                .header("anthropic-version", "2023-06-01")
                .header("x-api-key", &api_key)
                .send()
                .await
        }
        "google-generative-ai" | "google-gemini" => {
            client
                .get(format!("{base}/models?key={api_key}"))
                .send()
                .await
        }
        _ => {
            client
                .get(format!("{base}/models"))
                .header("Authorization", format!("Bearer {api_key}"))
                .send()
                .await
        }
    }
    .map_err(|e| format!("请求失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        let short = if body.len() > 200 {
            &body[..200]
        } else {
            &body
        };
        return Err(format!("HTTP {status}: {short}"));
    }

    let data: Value = resp
        .json()
        .await
        .map_err(|e| format!("JSON 解析失败: {e}"))?;

    let models: Vec<String> = if api.contains("google") {
        data.get("models")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        m.get("name")
                            .and_then(|n| n.as_str())
                            .map(|s| s.replace("models/", ""))
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        data.get("data")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("id").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    };

    let mut sorted = models;
    sorted.sort();
    Ok(sorted)
}

// ---------------------------------------------------------------------------
// hermes_update_model — 快速切换模型（只改 config.yaml 的 model.default）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn hermes_update_model(
    model: String,
    provider: Option<String>,
) -> Result<String, String> {
    use super::hermes_providers;

    let home = hermes_home();
    let config_path = home.join("config.yaml");
    let config_raw =
        std::fs::read_to_string(&config_path).map_err(|e| format!("读取 config.yaml 失败: {e}"))?;

    let model_str = model.clone();

    // Provider 决定策略：
    //   1. 调用方显式提供 → 直接使用
    //   2. 从静态 catalog 反查唯一匹配 → 使用反查结果
    //   3. 找不到 / 模糊 → 保持现有 provider（不改）
    let resolved_provider: Option<String> =
        provider.or_else(|| hermes_providers::find_provider_by_model(&model).map(String::from));
    // 一次性扫描并替换 model 区块中的 default / provider 字段。
    let lines: Vec<&str> = config_raw.lines().collect();
    let mut out: Vec<String> = Vec::with_capacity(lines.len() + 1);
    let mut in_model = false;
    let mut default_written = false;
    let mut provider_written = false;
    let mut default_indent: String = "  ".into();

    for line in lines.iter() {
        let trimmed = line.trim();
        if trimmed.starts_with("model:") {
            in_model = true;
            out.push(line.to_string());
            continue;
        }
        if in_model {
            let is_indented = line.starts_with("  ") || line.starts_with('\t');
            if !is_indented && !trimmed.is_empty() && !trimmed.starts_with('#') {
                // 离开 model 区块 —— 先补齐未写入的 provider 行
                if let Some(pid) = resolved_provider.as_ref() {
                    if !provider_written && !pid.is_empty() && pid != "custom" {
                        out.push(format!("{default_indent}provider: {pid}"));
                        provider_written = true;
                    }
                }
                in_model = false;
                out.push(line.to_string());
                continue;
            }

            if trimmed.starts_with("default:") {
                let indent_len = line.len() - line.trim_start().len();
                default_indent = " ".repeat(indent_len);
                out.push(format!("{default_indent}default: {model_str}"));
                default_written = true;
                continue;
            }
            if trimmed.starts_with("provider:") {
                if let Some(pid) = resolved_provider.as_ref() {
                    if !pid.is_empty() && pid != "custom" {
                        let indent_len = line.len() - line.trim_start().len();
                        let indent = " ".repeat(indent_len);
                        out.push(format!("{indent}provider: {pid}"));
                        provider_written = true;
                        continue;
                    }
                    // custom → 删除 provider 行
                    continue;
                }
                // 未提供新 provider，保留旧值
                out.push(line.to_string());
                provider_written = true;
                continue;
            }
        }
        out.push(line.to_string());
    }

    // 文件末尾还在 model 块里：补 provider 行
    if in_model {
        if let Some(pid) = resolved_provider.as_ref() {
            if !provider_written && !pid.is_empty() && pid != "custom" {
                out.push(format!("{default_indent}provider: {pid}"));
            }
        }
    }

    if !default_written {
        return Err("config.yaml 中未找到 model.default 字段".into());
    }

    let mut new_content = out.join("\n");
    if !new_content.ends_with('\n') {
        new_content.push('\n');
    }

    std::fs::write(&config_path, new_content).map_err(|e| format!("写入 config.yaml 失败: {e}"))?;
    Ok(format!("模型已切换为 {model_str}"))
}

// ---------------------------------------------------------------------------
// hermes_gateway_action — Gateway 管理
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn hermes_gateway_action(
    app: tauri::AppHandle,
    action: String,
) -> Result<String, String> {
    let enhanced = hermes_enhanced_path();
    match action.as_str() {
        "start" => {

            // Guardian: ensure platforms.api_server.enabled:true is present
            // before every start. Auto-heal if missing (with a .bak backup).
            // See `ensure_api_server_enabled` for rationale.
            ensure_api_server_enabled(&app)?;

            // 在启动 Gateway 前修正所有 uv tool 的 pyvenv.cfg Python 路径
            patch_uv_tool_pyvenv_cfgs();

            #[cfg(target_os = "windows")]
            {
                let home = hermes_home();
                let port = hermes_gateway_port();
                let addr: std::net::SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();

                // 1. 如果端口已经可达，说明 Gateway 已在运行
                if std::net::TcpStream::connect_timeout(
                    &addr,
                    std::time::Duration::from_millis(300),
                )
                .is_ok()
                {
                    // 即使已在运行也启动 Guardian 守护
                    start_guardian(&app);
                    emit_gateway_status(true);
                    return Ok("Gateway 已在运行".into());
                }

                // 2. 先精准杀掉之前我们 spawn 的进程
                kill_gateway_pid();
                // 如果仍有残留（非我们启动的），只清理已验证的旧 Hermes 端口占用者。
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                if std::net::TcpStream::connect_timeout(
                    &addr,
                    std::time::Duration::from_millis(200),
                )
                .is_ok()
                {
                    let _ = kill_hermes_gateway_port_owner();
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }

                // 3. 清理过期 PID 文件（绕过 Hermes Windows bug）
                let pid_file = home.join("gateway.pid");
                if pid_file.exists() {
                    let _ = std::fs::remove_file(&pid_file);
                }

                // 4. 启动 Gateway 进程
                let log_path = home.join("gateway-run.log");
                let log_file = std::fs::File::create(&log_path)
                    .map_err(|e| format!("创建日志文件失败: {e}"))?;
                let log_err = log_file
                    .try_clone()
                    .map_err(|e| format!("克隆日志句柄失败: {e}"))?;

                if let Some(runtime_error) = hermes_portable_runtime_error() {
                    let _ = std::fs::write(&log_path, &runtime_error);
                    return Err(format!("Hermes gateway run 失败: {runtime_error}"));
                }

                let mut cmd = hermes_command(&["gateway", "run"], &enhanced);
                cmd.stdin(std::process::Stdio::null())
                    .stdout(log_file)
                    .stderr(log_err)
                    .creation_flags(CREATE_NO_WINDOW);
                // 便携模式：若内置了 Git Bash，设置 HERMES_GIT_BASH_PATH
                // Hermes Agent 的 _find_bash() 会优先使用这个路径，无需系统安装 Git
                // 注意：bin/bash.exe 是 45KB 的 MSYS2 桩，需要完整目录结构才能找到 top-level，
                // 而 usr/bin/bash.exe 是真身（2.4MB），可以直接运行
                if let Some(portable_root) = portable_resources_dir() {
                    let portable_bash = portable_root
                        .join("git")
                        .join("usr")
                        .join("bin")
                        .join("bash.exe");
                    if portable_bash.is_file() {
                        cmd.env(
                            "HERMES_GIT_BASH_PATH",
                            portable_bash.to_string_lossy().to_string(),
                        );
                    }
                }
                // 注入 .env 环境变量
                let env_path = home.join(".env");
                if let Ok(env_content) = std::fs::read_to_string(&env_path) {
                    for line in env_content.lines() {
                        let line = line.trim();
                        if line.is_empty() || line.starts_with('#') {
                            continue;
                        }
                        if let Some((key, val)) = line.split_once('=') {
                            cmd.env(key.trim(), val.trim());
                        }
                    }
                }
                match cmd.spawn() {
                    Ok(child) => {
                        // 记录 PID 供后续精准 kill
                        GW_PID.store(child.id(), Ordering::SeqCst);
                        register_hermes_lifecycle_process(child.id(), &enhanced);

                        // 5. 等待 Gateway 端口可达（最多 20s）
                        let mut ok = false;
                        for i in 0..40 {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            if std::net::TcpStream::connect_timeout(
                                &addr,
                                std::time::Duration::from_millis(500),
                            )
                            .is_ok()
                            {
                                ok = true;
                                break;
                            }
                            // 前 3 秒每次都检查，之后检查日志是否有错误
                            if i > 6 {
                                if let Ok(log) = std::fs::read_to_string(&log_path) {
                                    if log.contains("failed to connect")
                                        || log.contains("Port") && log.contains("already in use")
                                    {
                                        break; // 进程已报错，不再等待
                                    }
                                }
                            }
                        }
                        if ok {
                            // 启动 Guardian 后台守护
                            start_guardian(&app);
                            emit_gateway_status(true);
                            Ok("Gateway 已启动".into())
                        } else {
                            let log_tail = std::fs::read_to_string(&log_path).unwrap_or_default();
                            let tail: String = log_tail
                                .lines()
                                .rev()
                                .take(20)
                                .collect::<Vec<_>>()
                                .into_iter()
                                .rev()
                                .collect::<Vec<_>>()
                                .join("\n");
                            Err(format!(
                                "Gateway 启动失败。\n日志:\n{}",
                                if tail.is_empty() {
                                    "(日志为空)".to_string()
                                } else {
                                    tail
                                }
                            ))
                        }
                    }
                    Err(e) => Err(format!(
                        "Hermes gateway run failed: {e}\n{}",
                        hermes_runtime_diagnostics()
                    )),
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                let home = hermes_home();
                // 先精准杀掉之前我们 spawn 的进程
                kill_gateway_pid();

                if let Some(runtime_error) = hermes_portable_runtime_error() {
                    return Err(format!("Hermes gateway run failed: {runtime_error}"));
                }

                let mut cmd = hermes_command(&["gateway", "run"], &enhanced);
                cmd.stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null());

                // 注入 .env 环境变量
                let env_path = home.join(".env");
                if let Ok(env_content) = std::fs::read_to_string(&env_path) {
                    for line in env_content.lines() {
                        let line = line.trim();
                        if line.is_empty() || line.starts_with('#') {
                            continue;
                        }
                        if let Some((key, val)) = line.split_once('=') {
                            cmd.env(key.trim(), val.trim());
                        }
                    }
                }

                match cmd.spawn() {
                    Ok(child) => {
                        GW_PID.store(child.id(), Ordering::SeqCst);
                        register_hermes_lifecycle_process(child.id(), &enhanced);
                        // 等待端口可达（最多 15s）
                        let port = hermes_gateway_port();
                        let addr: std::net::SocketAddr =
                            format!("127.0.0.1:{port}").parse().unwrap();
                        let mut ok = false;
                        for _ in 0..30 {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            if std::net::TcpStream::connect_timeout(
                                &addr,
                                std::time::Duration::from_millis(500),
                            )
                            .is_ok()
                            {
                                ok = true;
                                break;
                            }
                        }
                        if ok {
                            start_guardian(&app);
                            emit_gateway_status(true);
                            Ok("Gateway 已启动".into())
                        } else {
                            Err("Gateway 启动后端口未就绪".into())
                        }
                    }
                    Err(e) => {
                        // fallback: hermes gateway start
                        let mut fallback = hermes_tokio_command(&["gateway", "start"], &enhanced);
                        let out = fallback
                            .output()
                            .await
                            .map_err(|e2| format!("启动失败: {e} / fallback: {e2}"))?;
                        if out.status.success() {
                            start_guardian(&app);
                            emit_gateway_status(true);
                            Ok("Gateway 已启动".into())
                        } else {
                            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                            Err(if stderr.is_empty() {
                                format!(
                                    "Gateway 启动失败 (exit {})",
                                    out.status.code().unwrap_or(-1)
                                )
                            } else {
                                stderr
                            })
                        }
                    }
                }
            }
        }
        "stop" => {
            // 停止 Guardian 守护
            stop_guardian();

            // 1. 先精准杀掉我们 spawn 的进程
            let killed = kill_gateway_pid();

            // 2. 尝试 hermes gateway stop（作为补充）
            let mut cmd = hermes_tokio_command(&["gateway", "stop"], &enhanced);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let stop_result = cmd.output().await;

            // 3. 如果以上都没成功，Windows 上只清理已验证的旧 Hermes 端口占用者。
            #[cfg(target_os = "windows")]
            if !killed {
                let port = hermes_gateway_port();
                let addr: std::net::SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                if std::net::TcpStream::connect_timeout(
                    &addr,
                    std::time::Duration::from_millis(300),
                )
                .is_ok()
                {
                    let _ = kill_hermes_gateway_port_owner();
                }
            }

            let stopped = wait_gateway_stopped(5000).await;
            #[cfg(target_os = "windows")]
            let stopped = if stopped {
                true
            } else {
                let _ = kill_hermes_gateway_port_owner();
                wait_gateway_stopped(3000).await
            };
            #[cfg(not(target_os = "windows"))]
            let stopped = stopped;

            if stopped {
                emit_gateway_status(false);
            } else {
                emit_gateway_status(true);
                return Err(
                    "Gateway stop requested, but the health endpoint is still reachable".into(),
                );
            }

            match stop_result {
                Ok(out) if out.status.success() || killed => Ok("Gateway 已停止".into()),
                Ok(_) if killed => Ok("Gateway 已停止".into()),
                Ok(out) => {
                    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                    if stderr.is_empty() {
                        Ok("Gateway 已停止".into())
                    } else {
                        Err(stderr)
                    }
                }
                Err(_) if killed => Ok("Gateway 已停止".into()),
                Err(e) => Err(format!("停止失败: {e}")),
            }
        }
        "status" => {
            let mut cmd = hermes_tokio_command(&["gateway", "status"], &enhanced);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let out = cmd.output().await.map_err(|e| format!("查询失败: {e}"))?;
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            Ok(stdout)
        }
        "install" => {
            let mut cmd = hermes_tokio_command(&["gateway", "install"], &enhanced);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let out = cmd.output().await.map_err(|e| format!("安装失败: {e}"))?;
            if out.status.success() {
                Ok("Gateway 服务已安装".into())
            } else {
                Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
            }
        }
        "uninstall" => {
            let mut cmd = hermes_tokio_command(&["gateway", "uninstall"], &enhanced);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let out = cmd.output().await.map_err(|e| format!("卸载失败: {e}"))?;
            if out.status.success() {
                Ok("Gateway 服务已卸载".into())
            } else {
                Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
            }
        }
        _ => Err(format!("不支持的操作: {action}")),
    }
}

// ---------------------------------------------------------------------------
// hermes_health_check — Gateway 健康检查
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn hermes_health_check() -> Result<Value, String> {
    let url = format!("{}/health", hermes_gateway_url());

    let client = hermes_gateway_http_client(std::time::Duration::from_secs(5))
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body: Value = resp.json().await.unwrap_or(Value::Null);
            Ok(body)
        }
        Ok(resp) => Err(format!("Gateway 返回 HTTP {}", resp.status())),
        Err(e) => Err(format!("Gateway 不可达: {e}")),
    }
}

// ---------------------------------------------------------------------------
// hermes_detect_environments — 检测 WSL2 / Docker 中的 Hermes Agent
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn hermes_detect_environments() -> Result<Value, String> {
    let mut result = serde_json::json!({
        "wsl2": { "available": false },
        "docker": { "available": false },
        "portable": {},
    });

    // --- WSL2 检测（仅 Windows）---
    #[cfg(target_os = "windows")]
    {
        // 0. 先检测 wsl.exe 是否在 PATH 中（区分 WSL 功能是否可用 vs 是否安装了发行版）
        let wsl_exists = std::process::Command::new("where")
            .arg("wsl.exe")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .and_then(|o| if o.status.success() { Some(()) } else { None })
            .is_some();

        if wsl_exists {
            result["wsl2"]["wslInstalled"] = serde_json::json!(true);
        }

        // 1. 检测 WSL 发行版
        let wsl_check = std::process::Command::new("wsl")
            .args(["--list", "--quiet"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = wsl_check {
            if out.status.success() {
                let distros_raw = String::from_utf8_lossy(&out.stdout);
                let distros: Vec<String> = distros_raw
                    .lines()
                    .map(|l| l.trim().replace('\0', "").trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();

                if !distros.is_empty() {
                    result["wsl2"]["available"] = serde_json::json!(true);
                    result["wsl2"]["distros"] = serde_json::json!(distros);

                    // 2. 获取默认 WSL2 IP
                    let ip_cmd = std::process::Command::new("wsl")
                        .args(["-e", "hostname", "-I"])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                    if let Ok(ip_out) = ip_cmd {
                        if ip_out.status.success() {
                            let ip_str = String::from_utf8_lossy(&ip_out.stdout);
                            let ip = ip_str.split_whitespace().next().unwrap_or("").to_string();
                            if !ip.is_empty() {
                                result["wsl2"]["ip"] = serde_json::json!(ip);
                            }
                        }
                    }

                    // 3. 检测 WSL 里是否安装了 hermes
                    let hermes_check = std::process::Command::new("wsl")
                        .args([
                            "-e",
                            "bash",
                            "-lc",
                            "command -v hermes && hermes --version 2>/dev/null || echo NOT_FOUND",
                        ])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                    if let Ok(h_out) = hermes_check {
                        let h_str = String::from_utf8_lossy(&h_out.stdout).trim().to_string();
                        if !h_str.contains("NOT_FOUND") && !h_str.is_empty() {
                            result["wsl2"]["hermesInstalled"] = serde_json::json!(true);
                            result["wsl2"]["hermesInfo"] = serde_json::json!(h_str);
                        }
                    }

                    // 4. 探测 WSL 中 Gateway 是否正在运行
                    let wsl_ip = result["wsl2"]["ip"].as_str().map(String::from);
                    if let Some(ip) = wsl_ip {
                        let port = hermes_gateway_port();
                        let addr_str = format!("{ip}:{port}");
                        if let Ok(addr) = addr_str.parse::<std::net::SocketAddr>() {
                            let reachable = std::net::TcpStream::connect_timeout(
                                &addr,
                                std::time::Duration::from_millis(500),
                            )
                            .is_ok();
                            result["wsl2"]["gatewayRunning"] = serde_json::json!(reachable);
                            if reachable {
                                result["wsl2"]["gatewayUrl"] =
                                    serde_json::json!(format!("http://{ip}:{port}"));
                            }
                        }
                    }
                } else {
                    // wsl --list 成功但无发行版 — 提示用户安装
                    result["wsl2"]["wslNoDistros"] = serde_json::json!(true);
                    result["wsl2"]["hint"] = serde_json::json!(
                        "WSL is installed but no Linux distro is installed. Run 'wsl --install' in a terminal to install Ubuntu, or use the Microsoft Store to install a distro."
                    );
                }
            } else {
                // wsl --list 命令失败 — 可能 WSL 组件未完全安装
                if wsl_exists {
                    result["wsl2"]["wslNoDistros"] = serde_json::json!(true);
                    result["wsl2"]["hint"] = serde_json::json!(
                        "wsl.exe found but 'wsl --list' failed. Try reinstalling WSL: run 'wsl --install' in an admin terminal."
                    );
                }
            }
        } else if wsl_exists {
            // 命令本身执行失败（例如 WSL 组件损坏）
            result["wsl2"]["wslNoDistros"] = serde_json::json!(true);
            result["wsl2"]["hint"] = serde_json::json!(
                "wsl.exe exists but failed to run. Try reinstalling WSL from 'Turn Windows features on or off' or run 'wsl --install' in an admin terminal."
            );
        }
    }

    // --- Docker 检测（所有平台）---
    {
        let docker_check = {
            let mut cmd = std::process::Command::new("docker");
            cmd.args(["info", "--format", "{{.ServerVersion}}"]);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.output()
        };

        if let Ok(out) = docker_check {
            if out.status.success() {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                result["docker"]["available"] = serde_json::json!(true);
                result["docker"]["version"] = serde_json::json!(version);

                // 查找运行中的 hermes 相关容器
                let ps_cmd = {
                    let mut cmd = std::process::Command::new("docker");
                    cmd.args([
                        "ps",
                        "--format",
                        "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}",
                        "--filter",
                        "status=running",
                    ]);
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    cmd.output()
                };

                if let Ok(ps_out) = ps_cmd {
                    let ps_str = String::from_utf8_lossy(&ps_out.stdout);
                    let containers: Vec<Value> = ps_str
                        .lines()
                        .filter(|l| {
                            let lower = l.to_lowercase();
                            lower.contains("hermes") || lower.contains("8642")
                        })
                        .map(|l| {
                            let parts: Vec<&str> = l.split('\t').collect();
                            serde_json::json!({
                                "id": parts.first().unwrap_or(&""),
                                "name": parts.get(1).unwrap_or(&""),
                                "image": parts.get(2).unwrap_or(&""),
                                "ports": parts.get(3).unwrap_or(&""),
                                "status": parts.get(4).unwrap_or(&""),
                            })
                        })
                        .collect();

                    if !containers.is_empty() {
                        result["docker"]["hermesContainers"] = serde_json::json!(containers);
                    }
                }
            }
        }
    }

    // --- 便携模式检测（Windows，内置 Git Bash / ripgrep）---
    {
        let mut p = serde_json::Map::new();
        let pv = portable_resources_dir();
        let has_bash = pv
            .as_ref()
            .map(|r| {
                r.join("git")
                    .join("usr")
                    .join("bin")
                    .join("bash.exe")
                    .is_file()
            })
            .unwrap_or(false);
        let has_rg = pv
            .as_ref()
            .map(|r| r.join("rg").join("rg.exe").is_file())
            .unwrap_or(false);
        let available = has_bash || has_rg;

        // 使用 usr/bin/bash.exe（真身），bin/bash.exe 是 45KB 桩，无法在 trimmed 环境下找到 top-level
        p.insert("available".into(), serde_json::json!(available));
        p.insert("hasBash".into(), serde_json::json!(has_bash));
        p.insert("hasRg".into(), serde_json::json!(has_rg));

        result["portable"] = serde_json::json!(p);
    }

    Ok(result)
}

// ---------------------------------------------------------------------------
// hermes_set_gateway_url — 设置自定义 Gateway URL（用于远程/WSL2/Docker）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn hermes_set_gateway_url(url: Option<String>) -> Result<String, String> {
    let config_paths = super::panel_config_candidate_paths();
    let config_path = config_paths.first().ok_or("找不到配置文件路径")?;

    let mut config = if config_path.exists() {
        let content =
            std::fs::read_to_string(config_path).map_err(|e| format!("读取配置失败: {e}"))?;
        serde_json::from_str::<Value>(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // 确保 hermes 对象存在
    if !config.get("hermes").is_some_and(|v| v.is_object()) {
        config["hermes"] = serde_json::json!({});
    }

    match &url {
        Some(u) if !u.trim().is_empty() => {
            config["hermes"]["gatewayUrl"] = serde_json::json!(u.trim());
        }
        _ => {
            // 清除自定义 URL，回退到本地
            if let Some(obj) = config["hermes"].as_object_mut() {
                obj.remove("gatewayUrl");
            }
        }
    }

    let json_str = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {e}"))?;
    if let Some(parent) = config_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(config_path, json_str).map_err(|e| format!("写入配置失败: {e}"))?;

    let current_url = hermes_gateway_url();
    Ok(format!("Gateway URL 已设置: {current_url}"))
}

// ---------------------------------------------------------------------------
// update_hermes — 升级
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn update_hermes(app: tauri::AppHandle) -> Result<String, String> {
    let _ = app.emit("hermes-install-log", "📦 升级 Hermes Agent...");
    let _ = app.emit("hermes-install-progress", 0u32);

    let uv_path = uv_bin_path();
    let uv = if uv_path.exists() {
        uv_path.to_string_lossy().to_string()
    } else {
        "uv".into()
    };

    // 优先使用本地 hermes-agent-main.zip
    let local_source: Option<String> = {
        let bundled = bundled_hermes_archive_path();
        if bundled.exists() {
            let _ = app.emit("hermes-install-log", "📦 发现本地 Hermes Agent 源码包");
            match extract_hermes_zip(&bundled) {
                Ok(extracted) => {
                    let _ = app.emit("hermes-install-log", "✓ 本地源码包已解压");
                    Some(extracted.to_string_lossy().to_string())
                }
                Err(e) => {
                    let _ = app.emit(
                        "hermes-install-log",
                        format!("⚠️ 本地源码包解压失败: {e}，将尝试从 GitHub"),
                    );
                    None
                }
            }
        } else {
            None
        }
    };

    // hermes-agent 从 GitHub 或本地源码安装，upgrade 不可用，改用 reinstall
    let source_url = match &local_source {
        Some(path) => {
            let normalized = path.replace('\\', "/");
            if normalized.starts_with('/') {
                format!("file://{normalized}")
            } else {
                format!("file:///{normalized}")
            }
        }
        None => HERMES_GIT_URL.to_string(),
    };
    let pkg = format!("hermes-agent[web] @ {source_url}");
    let mut cmd = tokio::process::Command::new(&uv);
    cmd.args([
        "tool",
        "install",
        "--reinstall",
        &pkg,
        "--with",
        "croniter",
        "--with",
        "aiohttp",
    ]);
    let _ = app.emit("hermes-install-progress", 20u32);
    if local_source.is_none() {
        cmd.env("GIT_TERMINAL_PROMPT", "0");
    }
    if let Some(mirror) = pypi_mirror_url() {
        cmd.args(["--index-url", &mirror]);
    }
    super::apply_proxy_env_tokio(&mut cmd);
    cmd.env("PATH", hermes_enhanced_path());
    // 便携模式：设置 UV_TOOL_DIR，使 hermes.exe 安装到 <app_root>/uv-tools/bin/
    {
        let uv_tools = uv_tool_dir();
        let _ = std::fs::create_dir_all(&uv_tools);
        cmd.env("UV_TOOL_DIR", uv_tools.to_string_lossy().to_string());
    }
    // 便携模式：设置 UV_PYTHON_INSTALL_DIR 并尝试使用本地缓存的 Python 可执行文件
    {
        if let Some(uv_python) = prepare_uv_python_dir() {
            cmd.env(
                "UV_PYTHON_INSTALL_DIR",
                uv_python.to_string_lossy().to_string(),
            );
            // 查找本地缓存的 python.exe（优先使用，跳过 uv 网络下载）
            if let Some(python_path) = find_cached_python(&uv_python) {
                cmd.arg("--python");
                cmd.arg(&python_path);
                let _ = app.emit(
                    "hermes-install-log",
                    format!("✓ 使用本地缓存 Python: {python_path}"),
                );
            } else {
                cmd.args(["--python", "3.11"]);
                let _ = app.emit(
                    "hermes-install-log",
                    "ℹ Python 缓存目录已准备，等待 uv 自行下载 Python 3.11...",
                );
            }
        }
    }
    // 限制 HTTP 超时，防止网络问题导致无限挂起
    cmd.env("UV_HTTP_TIMEOUT", "120");
    cmd.env("UV_CONCURRENT_DOWNLOADS", "4");
    let output = run_uv_with_streaming(&app, &mut cmd, 600).await?;

    if output.status.success() {
        let _ = app.emit("hermes-install-log", "✅ 升级完成");
        let _ = app.emit("hermes-install-progress", 100u32);
        Ok("升级完成".into())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("升级失败: {}", err_msg.trim()))
    }
}

// ---------------------------------------------------------------------------
// uninstall_hermes — 卸载
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn uninstall_hermes(app: tauri::AppHandle, clean_config: bool) -> Result<String, String> {
    let _ = app.emit("hermes-install-log", "🗑️ 卸载 Hermes Agent...");
    let _ = app.emit("hermes-install-progress", 10u32);

    let uv_path = uv_bin_path();
    let uv = if uv_path.exists() {
        uv_path.to_string_lossy().to_string()
    } else {
        "uv".into()
    };

    // uv tool uninstall
    let mut cmd = tokio::process::Command::new(&uv);
    cmd.args(["tool", "uninstall", "hermes-agent"]);
    let _ = app.emit("hermes-install-log", "> uv tool uninstall hermes-agent");
    cmd.env("PATH", hermes_enhanced_path());
    // 便携模式：设置 UV_TOOL_DIR，从 <app_root>/uv-tools/ 卸载
    {
        let uv_tools = uv_tool_dir();
        cmd.env("UV_TOOL_DIR", uv_tools.to_string_lossy().to_string());
    }
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().await.map_err(|e| format!("卸载失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    for line in stdout.lines().chain(stderr.lines()) {
        if !line.trim().is_empty() {
            let _ = app.emit("hermes-install-log", line.trim());
        }
    }

    if !output.status.success() {
        return Err(format!("卸载失败: {}", stderr.trim()));
    }
    let _ = app.emit("hermes-install-progress", 65u32);

    // 清理 venv（如果存在）
    let venv_dir = app_root_dir().join("data").join("hermes-venv");
    if venv_dir.exists() {
        let _ = app.emit(
            "hermes-install-log",
            format!("清理虚拟环境: {}", venv_dir.display()),
        );
        let _ = std::fs::remove_dir_all(&venv_dir);
    }

    // 可选：清理配置
    if clean_config {
        let home = hermes_home();
        if home.exists() {
            let _ = app.emit(
                "hermes-install-log",
                format!("清理配置目录: {}", home.display()),
            );
            let _ = std::fs::remove_dir_all(&home);
        }
    }

    let _ = app.emit("hermes-install-log", "✅ Hermes Agent 已卸载");
    let _ = app.emit("hermes-install-progress", 100u32);
    Ok("Hermes Agent 已卸载".into())
}

// ---------------------------------------------------------------------------
// hermes_api_proxy — 代理前端对 Gateway REST API 的请求（绕过 CORS）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn hermes_api_proxy(
    method: String,
    path: String,
    body: Option<String>,
    headers: Option<Value>,
) -> Result<Value, String> {
    let url = format!("{}{path}", hermes_gateway_url());

    // 读取 API_SERVER_KEY
    let api_key = {
        let env_path = hermes_home().join(".env");
        let mut key = String::new();
        if let Ok(content) = std::fs::read_to_string(&env_path) {
            for line in content.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("API_SERVER_KEY=") {
                    key = val.trim().to_string();
                    break;
                }
            }
        }
        key
    };

    let timeout = if path.contains("/chat/completions") || path.contains("/responses") {
        std::time::Duration::from_secs(120)
    } else {
        std::time::Duration::from_secs(30)
    };
    let client =
        hermes_gateway_http_client(timeout).map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => {
            let mut r = client.post(&url);
            if let Some(b) = &body {
                r = r.header("Content-Type", "application/json").body(b.clone());
            }
            r
        }
        "PATCH" => {
            let mut r = client.patch(&url);
            if let Some(b) = &body {
                r = r.header("Content-Type", "application/json").body(b.clone());
            }
            r
        }
        "PUT" => {
            let mut r = client.put(&url);
            if let Some(b) = &body {
                r = r.header("Content-Type", "application/json").body(b.clone());
            }
            r
        }
        "DELETE" => {
            let mut r = client.delete(&url);
            if let Some(b) = &body {
                r = r.header("Content-Type", "application/json").body(b.clone());
            }
            r
        }
        _ => return Err(format!("不支持的方法: {method}")),
    };

    // 注入 API_SERVER_KEY 认证
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    // 注入自定义 headers（如 X-Hermes-Session-Id）
    if let Some(Value::Object(map)) = &headers {
        for (k, v) in map {
            if let Some(s) = v.as_str() {
                req = req.header(k.as_str(), s);
            }
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Gateway 请求失败: {e}"))?;
    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();

    // 尝试解析为 JSON，否则包装为字符串
    let json_val: Value =
        serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({ "raw": text }));

    if status >= 400 {
        // 提取错误信息：支持 {"error": "msg"} 和 {"error": {"message": "msg"}} 两种格式
        let err_msg = json_val
            .get("error")
            .and_then(|v| {
                v.as_str()
                    .map(String::from)
                    .or_else(|| v.get("message").and_then(|m| m.as_str()).map(String::from))
            })
            .unwrap_or_else(|| text.clone());
        return Err(err_msg);
    }

    Ok(json_val)
}

// ---------------------------------------------------------------------------
// hermes_agent_run — 通过 /v1/runs + SSE 事件流驱动 Agent（工具调用可见）
// ---------------------------------------------------------------------------

fn json_string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(s) = value.get(*key).and_then(|v| v.as_str()) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    String::new()
}

fn normalize_image_detail(detail: Option<String>) -> Option<String> {
    let value = detail.unwrap_or_default().trim().to_ascii_lowercase();
    match value.as_str() {
        "low" | "high" => Some(value),
        _ => None,
    }
}

fn build_hermes_run_input(input: &str, attachments: &Option<Value>) -> Value {
    let text = input.trim();
    let mut parts: Vec<Value> = Vec::new();
    if !text.is_empty() {
        parts.push(serde_json::json!({ "type": "text", "text": text }));
    }

    if let Some(items) = attachments.as_ref().and_then(|v| v.as_array()) {
        for item in items {
            let category = json_string_field(item, &["category", "type"]).to_ascii_lowercase();
            let mime_type = {
                let mime = json_string_field(item, &["mimeType", "mediaType", "mime"]);
                if mime.is_empty() {
                    "image/png".to_string()
                } else {
                    mime
                }
            };
            if category != "image" && !mime_type.to_ascii_lowercase().starts_with("image/") {
                continue;
            }

            let mut url = json_string_field(item, &["url", "dataUrl"]);
            let data = json_string_field(item, &["content", "data"]);
            if url.is_empty() && !data.is_empty() {
                if data.starts_with("data:image/") {
                    url = data;
                } else {
                    url = format!("data:{mime_type};base64,{data}");
                }
            }

            let lower = url.to_ascii_lowercase();
            if !(lower.starts_with("data:image/")
                || lower.starts_with("http://")
                || lower.starts_with("https://"))
            {
                continue;
            }
            let mut image_url = serde_json::Map::new();
            image_url.insert("url".to_string(), Value::String(url));
            if let Some(detail) = normalize_image_detail(Some(json_string_field(
                item,
                &["detail", "imageDetail"],
            ))) {
                image_url.insert("detail".to_string(), Value::String(detail));
            }
            parts.push(serde_json::json!({
                "type": "image_url",
                "image_url": Value::Object(image_url)
            }));
        }
    }

    let has_image = parts
        .iter()
        .any(|part| part.get("type").and_then(|v| v.as_str()) == Some("image_url"));
    if !has_image {
        return Value::String(text.to_string());
    }
    if !parts
        .iter()
        .any(|part| part.get("type").and_then(|v| v.as_str()) == Some("text"))
    {
        parts.insert(
            0,
            serde_json::json!({ "type": "text", "text": "请分析我刚刚上传或粘贴的图片。" }),
        );
    }
    serde_json::json!([{ "role": "user", "content": parts }])
}

const HERMES_HISTORY_MAX_MESSAGES: usize = 24;
const HERMES_HISTORY_MAX_CHARS: usize = 12000;

fn safe_hermes_session_id(session_id: &str) -> String {
    session_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        .collect()
}

fn normalize_hermes_history_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn same_hermes_history_text(left: &str, right: &str) -> bool {
    let a = normalize_hermes_history_text(left);
    let b = normalize_hermes_history_text(right);
    !a.is_empty() && !b.is_empty() && (a == b || a.contains(&b) || b.contains(&a))
}

fn compact_hermes_history_content(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.trim().to_string();
    }

    if let Some(items) = content.as_array() {
        let mut parts: Vec<String> = Vec::new();
        for item in items {
            if let Some(text) = item.as_str() {
                let text = text.trim();
                if !text.is_empty() {
                    parts.push(text.to_string());
                }
                continue;
            }

            let Some(obj) = item.as_object() else {
                continue;
            };
            let typ = obj
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();

            if (typ == "text" || typ == "input_text" || typ.is_empty())
                && obj.get("text").and_then(|v| v.as_str()).is_some()
            {
                let text = obj
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                if !text.is_empty() {
                    parts.push(text.to_string());
                }
                continue;
            }

            if typ == "image"
                || typ == "input_image"
                || typ == "image_url"
                || obj.contains_key("image_url")
                || obj.get("source").and_then(|v| v.get("data")).is_some()
            {
                parts.push("[image]".to_string());
            }
        }
        return parts.join("\n").trim().to_string();
    }

    if let Some(obj) = content.as_object() {
        for key in ["text", "content", "output", "message"] {
            if let Some(text) = obj.get(key).and_then(|v| v.as_str()) {
                return text.trim().to_string();
            }
        }
    }
    String::new()
}

fn build_hermes_conversation_history_from_session(
    session_id: Option<&String>,
    current_input: &str,
) -> Option<Value> {
    let sid = safe_hermes_session_id(session_id?.trim());
    if sid.is_empty() {
        return None;
    }

    let path = hermes_home()
        .join("sessions")
        .join(format!("session_{sid}.json"));
    let raw = std::fs::read_to_string(path).ok()?;
    let parsed: Value = serde_json::from_str(&raw).ok()?;
    let messages = parsed.get("messages")?.as_array()?;

    let mut history: Vec<Value> = Vec::new();
    for msg in messages {
        let role = msg
            .get("role")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(role.as_str(), "system" | "user" | "assistant") {
            continue;
        }
        let content = msg
            .get("content")
            .map(compact_hermes_history_content)
            .unwrap_or_default();
        if content.trim().is_empty() {
            continue;
        }
        history.push(serde_json::json!({ "role": role, "content": content }));
    }

    while history
        .last()
        .and_then(|item| {
            item.get("role").and_then(|v| v.as_str()).map(|role| {
                role == "user"
                    && same_hermes_history_text(
                        item.get("content").and_then(|v| v.as_str()).unwrap_or(""),
                        current_input,
                    )
            })
        })
        .unwrap_or(false)
    {
        history.pop();
    }

    let mut selected: Vec<Value> = Vec::new();
    let mut total_chars = 0usize;
    for item in history.into_iter().rev() {
        let size = item
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .len();
        if selected.len() >= HERMES_HISTORY_MAX_MESSAGES {
            break;
        }
        if !selected.is_empty() && total_chars + size > HERMES_HISTORY_MAX_CHARS {
            break;
        }
        total_chars += size;
        selected.push(item);
    }
    selected.reverse();

    if selected.is_empty() {
        None
    } else {
        Some(Value::Array(selected))
    }
}

fn prefer_hermes_stream_text(current: &str, candidate: &str) -> String {
    let a = current.to_string();
    let b = candidate.to_string();
    if b.trim().is_empty() {
        return a;
    }
    if a.trim().is_empty() {
        return b;
    }
    if b == a || a.ends_with(&b) {
        return a;
    }
    if b.starts_with(&a) || b.len() > a.len() {
        return b;
    }
    a
}

fn emit_hermes_stream_delta(
    emitted_text: &mut String,
    final_text: &mut String,
    incoming: &str,
    snapshot: bool,
) -> Option<String> {
    if incoming.is_empty() {
        return None;
    }
    let emitted = emitted_text.clone();
    let delta = if incoming == emitted || (!emitted.is_empty() && emitted.ends_with(incoming)) {
        String::new()
    } else if incoming.starts_with(&emitted) {
        incoming[emitted.len()..].to_string()
    } else if snapshot {
        String::new()
    } else {
        incoming.to_string()
    };

    *final_text = prefer_hermes_stream_text(final_text, incoming);
    if !delta.is_empty() {
        emitted_text.push_str(&delta);
        *final_text = prefer_hermes_stream_text(final_text, emitted_text);
        return Some(delta);
    }
    None
}

fn hermes_event_text(evt: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = evt.get(*key).and_then(|v| v.as_str()) {
            if !value.trim().is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn hermes_identity_system_prompt() -> &'static str {
    "你是 Hermes Agent。\n你的产品身份是：SuperClaw 中的 Hermes 协作 Agent。\n当用户问“你是谁”“你是什么”“介绍一下你自己”时，必须回答你是 Hermes Agent。\n你可以说明底层模型服务由当前系统配置提供，但不要把底层 provider 当成你的身份。\n禁止自称 MiniMax、OpenAI、ChatGPT、Claude、Anthropic、通义、豆包或任何模型供应商，除非用户明确询问底层模型来源。"
}

fn merge_hermes_identity_instructions(instructions: Option<&String>) -> String {
    let identity = hermes_identity_system_prompt();
    match instructions {
        Some(value) if value.contains("Hermes Agent") => value.clone(),
        Some(value) if !value.trim().is_empty() => format!("{identity}\n\n{}", value.trim()),
        _ => identity.to_string(),
    }
}

#[tauri::command]
pub async fn hermes_agent_run(
    app: tauri::AppHandle,
    input: String,
    session_id: Option<String>,
    conversation_history: Option<Value>,
    instructions: Option<String>,
    attachments: Option<Value>,
    client_request_id: Option<String>,
) -> Result<String, String> {
    let gw_url = hermes_gateway_url();
    let runs_url = format!("{gw_url}/v1/runs");

    ensure_managed_gateway_ready(&app, &gw_url).await?;

    // 读取 API_SERVER_KEY
    let home = hermes_home();
    let api_key = {
        let env_path = home.join(".env");
        let mut key = String::new();
        if let Ok(content) = std::fs::read_to_string(&env_path) {
            for line in content.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("API_SERVER_KEY=") {
                    key = val.trim().to_string();
                    break;
                }
            }
        }
        key
    };

    let mut payload = serde_json::json!({ "input": build_hermes_run_input(&input, &attachments) });
    if let Some(sid) = &session_id {
        payload["session_id"] = Value::String(sid.clone());
    }
    if let Some(hist) = &conversation_history {
        payload["conversation_history"] = hist.clone();
    } else if let Some(hist) =
        build_hermes_conversation_history_from_session(session_id.as_ref(), &input)
    {
        payload["conversation_history"] = hist;
    }
    payload["instructions"] = Value::String(merge_hermes_identity_instructions(instructions.as_ref()));

    let client = hermes_gateway_http_client(std::time::Duration::from_secs(10))
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    // 1. POST /v1/runs → 获取 run_id
    let mut req = client
        .post(&runs_url)
        .header("Content-Type", "application/json")
        .body(payload.to_string());
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    let resp = match req.send().await {
        Ok(resp) => resp,
        Err(error) => {
            return Err(hermes_run_failure_message(
                "启动 run 失败",
                &gw_url,
                reqwest_error_detail(&error),
            )
            .await);
        }
    };
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {e}"))?;
    let run_id = body["run_id"]
        .as_str()
        .ok_or("响应中没有 run_id")?
        .to_string();
    let response_session_id = body
        .get("session_id")
        .or_else(|| body.get("sessionId"))
        .and_then(|v| v.as_str())
        .or(session_id.as_deref())
        .unwrap_or("")
        .to_string();

    let _ = app.emit(
        "hermes-run-started",
        serde_json::json!({
            "run_id": &run_id,
            "session_id": &response_session_id,
            "clientRequestId": &client_request_id,
        }),
    );

    // 2. GET /v1/runs/{run_id}/events — SSE 事件流
    let events_url = format!("{gw_url}/v1/runs/{run_id}/events");
    let sse_client = hermes_gateway_http_client(std::time::Duration::from_secs(300))
        .map_err(|e| format!("SSE 客户端创建失败: {e}"))?;

    let mut sse_req = sse_client.get(&events_url);
    if !api_key.is_empty() {
        sse_req = sse_req.header("Authorization", format!("Bearer {api_key}"));
    }

    let sse_resp = match sse_req.send().await {
        Ok(resp) => resp,
        Err(error) => {
            return Err(hermes_run_failure_message(
                "SSE 连接失败",
                &gw_url,
                reqwest_error_detail(&error),
            )
            .await);
        }
    };

    if !sse_resp.status().is_success() {
        let status = sse_resp.status().as_u16();
        let text = sse_resp.text().await.unwrap_or_default();
        return Err(format!("SSE HTTP {status}: {text}"));
    }

    // 流式读取 SSE 事件并转发到前端
    use futures_util::StreamExt;
    let mut stream = sse_resp.bytes_stream();
    let mut buffer = String::new();
    let mut final_output = String::new();
    let mut emitted_output = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("SSE 读取失败: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            let trimmed = line.trim();
            if !trimmed.starts_with("data: ") {
                continue;
            }
            let data = trimmed[6..].trim();
            if data == "[DONE]" {
                let _ = app.emit(
                    "hermes-run-done",
                    serde_json::json!({
                        "run_id": &run_id,
                        "session_id": &response_session_id,
                        "output": &final_output,
                        "clientRequestId": &client_request_id,
                    }),
                );
                return Ok(run_id);
            }

            if let Ok(evt) = serde_json::from_str::<Value>(data) {
                let event_type = evt["event"].as_str().unwrap_or("");
                match event_type {
                    "message.delta" => {
                        if let Some(delta) = evt["delta"].as_str() {
                            if let Some(stream_delta) = emit_hermes_stream_delta(
                                &mut emitted_output,
                                &mut final_output,
                                delta,
                                false,
                            ) {
                                let _ = app.emit(
                                    "hermes-run-delta",
                                    serde_json::json!({
                                        "run_id": &run_id,
                                        "delta": stream_delta,
                                        "clientRequestId": &client_request_id,
                                    }),
                                );
                            }
                        }
                    }
                    "message.final" => {
                        if let Some(output) =
                            hermes_event_text(&evt, &["output", "content", "response", "message"])
                        {
                            if let Some(stream_delta) = emit_hermes_stream_delta(
                                &mut emitted_output,
                                &mut final_output,
                                &output,
                                true,
                            ) {
                                let _ = app.emit(
                                    "hermes-run-delta",
                                    serde_json::json!({
                                        "run_id": &run_id,
                                        "delta": stream_delta,
                                        "clientRequestId": &client_request_id,
                                    }),
                                );
                            }
                        }
                    }
                    "tool.started" | "tool.completed" | "tool.progress" | "tool.error" => {
                        let mut tool_evt = evt.clone();
                        if let Some(obj) = tool_evt.as_object_mut() {
                            obj.insert("run_id".into(), Value::String(run_id.clone()));
                            obj.insert("session_id".into(), Value::String(response_session_id.clone()));
                            if let Some(id) = client_request_id.as_ref().filter(|s| !s.trim().is_empty()) {
                                obj.insert("clientRequestId".into(), Value::String(id.to_string()));
                            }
                            if !obj.contains_key("tool_call_id") {
                                let name = obj
                                    .get("tool")
                                    .or_else(|| obj.get("tool_name"))
                                    .or_else(|| obj.get("name"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("tool");
                                obj.insert(
                                    "tool_call_id".into(),
                                    Value::String(format!("{run_id}:{name}")),
                                );
                            }
                        }
                        let _ = app.emit("hermes-run-tool", tool_evt);
                    }
                    "reasoning.available" => {
                        let _ = app.emit("hermes-run-reasoning", evt.clone());
                    }
                    "run.completed" => {
                        if let Some(output) =
                            hermes_event_text(&evt, &["output", "content", "response", "message"])
                        {
                            if let Some(stream_delta) = emit_hermes_stream_delta(
                                &mut emitted_output,
                                &mut final_output,
                                &output,
                                true,
                            ) {
                                let _ = app.emit(
                                    "hermes-run-delta",
                                    serde_json::json!({
                                        "run_id": &run_id,
                                        "delta": stream_delta,
                                        "clientRequestId": &client_request_id,
                                    }),
                                );
                            }
                        }
                        let _ = app.emit(
                            "hermes-run-done",
                            serde_json::json!({
                                "run_id": &run_id,
                                "session_id": &response_session_id,
                                "output": &final_output,
                                "clientRequestId": &client_request_id,
                            }),
                        );
                        return Ok(run_id);
                    }
                    "run.failed" => {
                        let err = evt["error"].as_str().unwrap_or("unknown error");
                        let _ = app.emit(
                            "hermes-run-error",
                            serde_json::json!({
                                "run_id": &run_id,
                                "session_id": &response_session_id,
                                "error": err,
                                "clientRequestId": &client_request_id,
                            }),
                        );
                        return Err(format!("Agent run failed: {err}"));
                    }
                    _ => {
                        // 其他事件类型也转发
                        let _ = app.emit("hermes-run-event", evt.clone());
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "hermes-run-done",
        serde_json::json!({
            "run_id": &run_id,
            "session_id": &response_session_id,
            "output": &final_output,
            "clientRequestId": &client_request_id,
        }),
    );
    Ok(run_id)
}

// ---------------------------------------------------------------------------
// Hermes Sessions / Logs / Skills / Memory — 文件系统 + CLI 命令
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn hermes_sessions_list(
    source: Option<String>,
    limit: Option<usize>,
    profile: Option<String>,
) -> Result<Value, String> {
    let mut args: Vec<String> = Vec::new();
    if let Some(p) = profile.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        args.push("--profile".into());
        args.push(p.to_string());
    }
    args.extend(["sessions", "export", "-"].iter().map(|s| s.to_string()));
    if let Some(s) = source.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        args.push("--source".into());
        args.push(s.to_string());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = match run_silent("hermes", &refs) {
        Ok(s) => s,
        Err(_) => return Ok(serde_json::json!([])),
    };
    let mut sessions: Vec<Value> = Vec::new();
    for line in output.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if let Ok(obj) = serde_json::from_str::<Value>(t) {
            // Extra numeric fields for Usage analytics. Carry through as-is so
            // the frontend can aggregate without another round-trip. Missing
            // fields fall back to 0 / null rather than breaking the shape.
            //
            // `started_at` is a POSIX seconds timestamp produced by the
            // official Hermes CLI export. We also surface it under that name
            // (matching the web UI contract) so the Usage store can group
            // sessions by day without needing a separate parse.
            let started_at = obj
                .get("started_at")
                .and_then(|v| v.as_u64())
                .unwrap_or_else(|| {
                    // Fallback: parse ISO8601 → epoch seconds.
                    // Hermes CLI 可能输出 created_at（snake）或 createdAt（camel），
                    // 也可能是 updated_at / updatedAt，逐个尝试。
                    for key in &["created_at", "createdAt", "updated_at", "updatedAt"] {
                        if let Some(ts) = obj
                            .get(*key)
                            .and_then(|v| v.as_str())
                            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                            .map(|dt| dt.timestamp() as u64)
                        {
                            return ts;
                        }
                    }
                    0
                });
            sessions.push(serde_json::json!({
                "id": obj.get("session_id").or(obj.get("id")).and_then(|v| v.as_str()).unwrap_or(""),
                "title": obj.get("title").or(obj.get("name")).and_then(|v| v.as_str()).unwrap_or(""),
                "source": obj.get("source").and_then(|v| v.as_str()).unwrap_or(""),
                "model": obj.get("model").and_then(|v| v.as_str()).unwrap_or(""),
                "created_at": obj.get("created_at").or(obj.get("createdAt")).and_then(|v| v.as_str()).unwrap_or(""),
                "updated_at": obj.get("updated_at").or(obj.get("updatedAt")).and_then(|v| v.as_str()).unwrap_or(""),
                "message_count": obj.get("message_count").and_then(|v| v.as_u64()).unwrap_or(0),
                // --- Usage analytics fields ---
                "started_at": started_at,
                "input_tokens": obj.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                "output_tokens": obj.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                "cache_read_tokens": obj.get("cache_read_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                "cache_write_tokens": obj.get("cache_write_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                "estimated_cost_usd": obj.get("estimated_cost_usd").and_then(|v| v.as_f64()),
                "actual_cost_usd": obj.get("actual_cost_usd").and_then(|v| v.as_f64()),
            }));
        }
    }
    sessions.sort_by(|a, b| {
        let ca = a["created_at"].as_str().unwrap_or("");
        let cb = b["created_at"].as_str().unwrap_or("");
        cb.cmp(ca)
    });
    if let Some(lim) = limit {
        if lim > 0 {
            sessions.truncate(lim);
        }
    }
    Ok(Value::Array(sessions))
}

#[tauri::command]
pub async fn hermes_sessions_summary_list(
    source: Option<String>,
    limit: Option<usize>,
    profile: Option<String>,
) -> Result<Value, String> {
    let lim = limit.unwrap_or(80).clamp(1, 500);
    let mut args: Vec<String> = Vec::new();
    if let Some(p) = profile.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        args.push("--profile".into());
        args.push(p.to_string());
    }
    args.extend(
        ["sessions", "list", "--limit"]
            .iter()
            .map(|s| s.to_string()),
    );
    args.push(lim.to_string());
    if let Some(s) = source.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        args.push("--source".into());
        args.push(s.to_string());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = match run_silent("hermes", &refs) {
        Ok(s) => s,
        Err(_) => return Ok(serde_json::json!([])),
    };
    let sep = regex::Regex::new(r"\s{2,}").map_err(|e| e.to_string())?;
    let mut has_titles = false;
    let mut sessions: Vec<Value> = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed == "No sessions found." || trimmed.starts_with('─') {
            continue;
        }
        if trimmed.contains("Title") && trimmed.contains("Preview") && trimmed.contains("ID") {
            has_titles = true;
            continue;
        }
        if trimmed.contains("Preview") && trimmed.contains("Last Active") && trimmed.contains("ID")
        {
            has_titles = false;
            continue;
        }
        let cols: Vec<&str> = sep
            .split(trimmed)
            .filter(|s| !s.trim().is_empty())
            .collect();
        if cols.len() < 3 {
            continue;
        }
        let id = cols.last().copied().unwrap_or("").trim();
        if id.is_empty() {
            continue;
        }
        let (title, preview, last_active, parsed_source) = if has_titles {
            let title = cols.first().copied().unwrap_or("").trim();
            let preview = cols.get(1).copied().unwrap_or("").trim();
            let last_active = cols.get(2).copied().unwrap_or("").trim();
            (
                if title == "—" { "" } else { title },
                preview,
                last_active,
                source.as_deref().unwrap_or(""),
            )
        } else {
            let preview = cols.first().copied().unwrap_or("").trim();
            let last_active = cols.get(1).copied().unwrap_or("").trim();
            let parsed_source = cols
                .get(2)
                .copied()
                .unwrap_or(source.as_deref().unwrap_or(""))
                .trim();
            ("", preview, last_active, parsed_source)
        };
        sessions.push(serde_json::json!({
            "id": id,
            "title": title,
            "source": parsed_source,
            "model": "",
            "created_at": "",
            "updated_at": "",
            "last_active_label": last_active,
            "preview": preview,
            "message_count": 0,
            "input_tokens": 0,
            "output_tokens": 0,
        }));
    }
    Ok(Value::Array(sessions))
}

#[tauri::command]
pub async fn hermes_usage_analytics(
    days: Option<u64>,
    profile: Option<String>,
) -> Result<Value, String> {
    let days = days.unwrap_or(30).clamp(1, 365);
    let cutoff = chrono::Utc::now().timestamp() - (days as i64 * 86_400);
    let sessions = hermes_sessions_list(None, None, profile).await?;
    let mut total_input: u64 = 0;
    let mut total_output: u64 = 0;
    let mut total_cache_read: u64 = 0;
    let mut total_cache_write: u64 = 0;
    let mut total_estimated_cost = 0.0_f64;
    let mut total_actual_cost = 0.0_f64;
    let mut total_sessions: u64 = 0;
    let mut daily: std::collections::BTreeMap<String, serde_json::Map<String, Value>> =
        std::collections::BTreeMap::new();
    let mut by_model: std::collections::BTreeMap<String, serde_json::Map<String, Value>> =
        std::collections::BTreeMap::new();
    if let Some(arr) = sessions.as_array() {
        for s in arr {
            let started = s.get("started_at").and_then(|v| v.as_i64()).unwrap_or(0);
            if started > 0 && started < cutoff {
                continue;
            }
            let input = s.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let output = s.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let cache_read = s
                .get("cache_read_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let cache_write = s
                .get("cache_write_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let estimated = s
                .get("estimated_cost_usd")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let actual = s
                .get("actual_cost_usd")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            total_input += input;
            total_output += output;
            total_cache_read += cache_read;
            total_cache_write += cache_write;
            total_estimated_cost += estimated;
            total_actual_cost += actual;
            total_sessions += 1;
            let day = if started > 0 {
                chrono::DateTime::from_timestamp(started, 0)
                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                    .unwrap_or_else(|| "unknown".into())
            } else {
                "unknown".into()
            };
            let d = daily.entry(day.clone()).or_insert_with(|| {
                let mut m = serde_json::Map::new();
                m.insert("day".into(), Value::String(day));
                m.insert("input_tokens".into(), Value::from(0_u64));
                m.insert("output_tokens".into(), Value::from(0_u64));
                m.insert("cache_read_tokens".into(), Value::from(0_u64));
                m.insert("estimated_cost".into(), Value::from(0.0));
                m.insert("actual_cost".into(), Value::from(0.0));
                m.insert("sessions".into(), Value::from(0_u64));
                m
            });
            *d.get_mut("input_tokens").unwrap() =
                Value::from(d["input_tokens"].as_u64().unwrap_or(0) + input);
            *d.get_mut("output_tokens").unwrap() =
                Value::from(d["output_tokens"].as_u64().unwrap_or(0) + output);
            *d.get_mut("cache_read_tokens").unwrap() =
                Value::from(d["cache_read_tokens"].as_u64().unwrap_or(0) + cache_read);
            *d.get_mut("estimated_cost").unwrap() =
                Value::from(d["estimated_cost"].as_f64().unwrap_or(0.0) + estimated);
            *d.get_mut("actual_cost").unwrap() =
                Value::from(d["actual_cost"].as_f64().unwrap_or(0.0) + actual);
            *d.get_mut("sessions").unwrap() = Value::from(d["sessions"].as_u64().unwrap_or(0) + 1);
            let raw_model = s
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !raw_model.is_empty() {
                // 规范化模型名：去掉 provider/ 前缀
                // 例如 "anthropic/claude-opus-4.6" → "claude-opus-4.6"
                let model_key = if let Some(pos) = raw_model.rfind('/') {
                    raw_model[pos + 1..].to_string()
                } else {
                    raw_model.clone()
                };
                let m = by_model.entry(model_key.clone()).or_insert_with(|| {
                    let mut row = serde_json::Map::new();
                    row.insert("model".into(), Value::String(model_key));
                    row.insert("input_tokens".into(), Value::from(0_u64));
                    row.insert("output_tokens".into(), Value::from(0_u64));
                    row.insert("cache_read_tokens".into(), Value::from(0_u64));
                    row.insert("estimated_cost".into(), Value::from(0.0));
                    row.insert("sessions".into(), Value::from(0_u64));
                    row
                });
                *m.get_mut("input_tokens").unwrap() =
                    Value::from(m["input_tokens"].as_u64().unwrap_or(0) + input);
                *m.get_mut("output_tokens").unwrap() =
                    Value::from(m["output_tokens"].as_u64().unwrap_or(0) + output);
                *m.get_mut("cache_read_tokens").unwrap() =
                    Value::from(m["cache_read_tokens"].as_u64().unwrap_or(0) + cache_read);
                *m.get_mut("estimated_cost").unwrap() =
                    Value::from(m["estimated_cost"].as_f64().unwrap_or(0.0) + estimated);
                *m.get_mut("sessions").unwrap() =
                    Value::from(m["sessions"].as_u64().unwrap_or(0) + 1);
            }
        }
    }
    let mut models: Vec<Value> = by_model.into_values().map(Value::Object).collect();
    models.sort_by(|a, b| {
        let at = a["input_tokens"].as_u64().unwrap_or(0) + a["output_tokens"].as_u64().unwrap_or(0);
        let bt = b["input_tokens"].as_u64().unwrap_or(0) + b["output_tokens"].as_u64().unwrap_or(0);
        bt.cmp(&at)
    });
    Ok(serde_json::json!({
        "daily": daily.into_values().map(Value::Object).collect::<Vec<_>>(),
        "by_model": models,
        "totals": {
            "total_input": total_input,
            "total_output": total_output,
            "total_cache_read": total_cache_read,
            "total_cache_write": total_cache_write,
            "total_estimated_cost": total_estimated_cost,
            "total_actual_cost": total_actual_cost,
            "total_sessions": total_sessions,
            "total_api_calls": 0,
        },
        "period_days": days,
        "skills": {
            "summary": {
                "total_skill_loads": 0,
                "total_skill_edits": 0,
                "total_skill_actions": 0,
                "distinct_skills_used": 0,
            },
            "top_skills": [],
        },
    }))
}

#[tauri::command]
pub async fn hermes_session_detail(
    session_id: String,
    profile: Option<String>,
) -> Result<Value, String> {
    let mut args: Vec<String> = Vec::new();
    if let Some(p) = profile.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        args.push("--profile".into());
        args.push(p.to_string());
    }
    args.extend(
        ["sessions", "export", "-", "--session-id"]
            .iter()
            .map(|s| s.to_string()),
    );
    args.push(session_id.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output =
        run_silent("hermes", &refs).map_err(|e| format!("Failed to read sessions: {e}"))?;
    for line in output.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if let Ok(obj) = serde_json::from_str::<Value>(t) {
            let id = obj
                .get("session_id")
                .or(obj.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if id == session_id {
                let messages = obj
                    .get("messages")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .map(|m| {
                                serde_json::json!({
                                    "role": m.get("role").and_then(|v| v.as_str()).unwrap_or(""),
                                    "content": m.get("content").map(|c| {
                                        if let Some(s) = c.as_str() { s.to_string() }
                                        else { c.to_string() }
                                    }).unwrap_or_default(),
                                    "timestamp": m.get("timestamp").or(m.get("created_at")).and_then(|v| v.as_str()).unwrap_or(""),
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                return Ok(serde_json::json!({
                    "id": id,
                    "title": obj.get("title").or(obj.get("name")).and_then(|v| v.as_str()).unwrap_or(""),
                    "source": obj.get("source").and_then(|v| v.as_str()).unwrap_or(""),
                    "model": obj.get("model").and_then(|v| v.as_str()).unwrap_or(""),
                    "created_at": obj.get("created_at").and_then(|v| v.as_str()).unwrap_or(""),
                    "messages": messages,
                }));
            }
        }
    }
    Err("Session not found".into())
}

#[tauri::command]
pub async fn hermes_session_delete(
    session_id: String,
    profile: Option<String>,
) -> Result<String, String> {
    let mut args: Vec<String> = Vec::new();
    if let Some(p) = profile.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        args.push("--profile".into());
        args.push(p.to_string());
    }
    args.extend(["sessions", "delete"].iter().map(|s| s.to_string()));
    args.push(session_id);
    args.push("--yes".into());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_silent("hermes", &refs)?;
    Ok("ok".into())
}

#[tauri::command]
pub async fn hermes_session_rename(
    session_id: String,
    title: String,
    profile: Option<String>,
) -> Result<String, String> {
    let mut args: Vec<String> = Vec::new();
    if let Some(p) = profile.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        args.push("--profile".into());
        args.push(p.to_string());
    }
    args.extend(["sessions", "rename"].iter().map(|s| s.to_string()));
    args.push(session_id);
    args.push(title);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_silent("hermes", &refs)?;
    Ok("ok".into())
}

#[tauri::command]
pub async fn hermes_profiles_list() -> Result<Value, String> {
    let output = match run_silent("hermes", &["profile", "list"]) {
        Ok(s) => s,
        Err(_) => return Ok(serde_json::json!({ "active": "default", "profiles": [] })),
    };
    let mut active = "default".to_string();
    let mut profiles: Vec<Value> = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.contains("Profile")
            || trimmed.starts_with('─')
            || trimmed.starts_with('-')
        {
            continue;
        }
        let is_active = trimmed.starts_with('◆');
        let row = trimmed.trim_start_matches('◆').trim();
        let parts: Vec<&str> = row.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }
        let name = parts[0];
        if name != "default"
            && !name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
        {
            continue;
        }
        let gateway_idx = parts
            .iter()
            .position(|p| *p == "running" || *p == "stopped")
            .unwrap_or(2);
        if gateway_idx <= 1 || gateway_idx >= parts.len() {
            continue;
        }
        let model = parts[1..gateway_idx].join(" ");
        let gateway = parts[gateway_idx];
        let alias = parts.get(gateway_idx + 1).copied().unwrap_or("—");
        if is_active {
            active = name.to_string();
        }
        profiles.push(serde_json::json!({
            "name": name,
            "active": is_active,
            "model": if model == "—" { "" } else { &model },
            "gatewayRunning": gateway == "running",
            "alias": if alias == "—" { "" } else { alias },
        }));
    }
    if !profiles
        .iter()
        .any(|p| p.get("active").and_then(|v| v.as_bool()).unwrap_or(false))
    {
        if let Some(p) = profiles
            .iter_mut()
            .find(|p| p.get("name").and_then(|v| v.as_str()) == Some("default"))
        {
            if let Some(obj) = p.as_object_mut() {
                obj.insert("active".to_string(), Value::Bool(true));
            }
        }
    }
    Ok(serde_json::json!({ "active": active, "profiles": profiles }))
}

#[tauri::command]
pub async fn hermes_profile_use(name: String) -> Result<String, String> {
    run_silent("hermes", &["profile", "use", &name])?;
    Ok("ok".into())
}

fn is_safe_log_file_name(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.ends_with(':')
        || trimmed.to_ascii_lowercase().starts_with("log files in")
    {
        return false;
    }
    trimmed.ends_with(".log") || trimmed.ends_with(".txt") || trimmed.ends_with(".jsonl")
}

#[tauri::command]
pub async fn hermes_logs_list() -> Result<Value, String> {
    let logs_dir = hermes_home().join("logs");
    if !logs_dir.exists() {
        return Ok(serde_json::json!([]));
    }
    let mut files: Vec<Value> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !is_safe_log_file_name(&name) {
                continue;
            }
            let (size, modified) = if let Ok(meta) = entry.metadata() {
                let sz = meta.len();
                let mt = meta
                    .modified()
                    .ok()
                    .and_then(|t| {
                        t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| {
                            let secs = d.as_secs() as i64;
                            // Simple ISO-ish format
                            chrono_simple(secs)
                        })
                    })
                    .unwrap_or_default();
                (sz, mt)
            } else {
                (0, String::new())
            };
            files.push(serde_json::json!({
                "name": name,
                "size": size,
                "modified": modified,
            }));
        }
    }
    files.sort_by(|a, b| {
        let ma = a["modified"].as_str().unwrap_or("");
        let mb = b["modified"].as_str().unwrap_or("");
        mb.cmp(ma)
    });
    Ok(Value::Array(files))
}

/// Simple timestamp formatter (no chrono crate dependency)
fn chrono_simple(epoch_secs: i64) -> String {
    // Use system time formatting via std
    let d = std::time::UNIX_EPOCH + std::time::Duration::from_secs(epoch_secs as u64);
    // Format as ISO string via debug (rough but functional)
    format!("{d:?}")
}

#[tauri::command]
pub async fn hermes_logs_read(
    name: String,
    lines: Option<usize>,
    level: Option<String>,
) -> Result<Value, String> {
    let max_lines = lines.unwrap_or(200);
    if !is_safe_log_file_name(&name) {
        return Err("日志文件名无效".into());
    }
    let log_path = hermes_home().join("logs").join(&name);
    if !log_path.exists() {
        return Err(format!("日志文件不存在：{name}"));
    }
    // Security: ensure path is within logs dir
    let logs_dir = hermes_home().join("logs");
    let canonical = log_path
        .canonicalize()
        .map_err(|e| format!("Path error: {e}"))?;
    let canonical_dir = logs_dir
        .canonicalize()
        .map_err(|e| format!("Path error: {e}"))?;
    if !canonical.starts_with(&canonical_dir) {
        return Err("Access denied".into());
    }

    let content =
        std::fs::read_to_string(&canonical).map_err(|e| format!("Failed to read log: {e}"))?;
    let all_lines: Vec<&str> = content.lines().collect();
    let start = if all_lines.len() > max_lines {
        all_lines.len() - max_lines
    } else {
        0
    };
    let tail = &all_lines[start..];

    let level_upper = level.as_deref().unwrap_or("").to_uppercase();
    let mut entries: Vec<Value> = Vec::new();
    // Regex-like manual parsing: "TIMESTAMP LEVEL MESSAGE"
    for line in tail {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        // Try to parse structured log: "2024-01-01 12:00:00 INFO message..."
        let parsed = parse_log_line(t);
        if !level_upper.is_empty() && level_upper != "ALL" {
            if let Some(ref lvl) = parsed.level {
                if lvl.to_uppercase() != level_upper {
                    continue;
                }
            } else {
                continue; // skip raw lines when filtering by level
            }
        }
        entries.push(match (parsed.timestamp, parsed.level, parsed.message) {
            (Some(ts), Some(lvl), Some(msg)) => serde_json::json!({
                "timestamp": ts,
                "level": lvl,
                "message": msg,
                "raw": t,
            }),
            _ => serde_json::json!({ "raw": t }),
        });
    }
    Ok(Value::Array(entries))
}

struct ParsedLogLine {
    timestamp: Option<String>,
    level: Option<String>,
    message: Option<String>,
}

fn parse_log_line(line: &str) -> ParsedLogLine {
    // Pattern: "YYYY-MM-DD HH:MM:SS LEVEL rest..." or "HH:MM:SS LEVEL rest..."
    let parts: Vec<&str> = line.splitn(4, char::is_whitespace).collect();
    if parts.len() >= 3 {
        // Check if first two parts look like a timestamp
        let maybe_date = parts[0];
        let maybe_time = parts[1];
        if (maybe_date.len() == 10 && maybe_date.contains('-'))
            && (maybe_time.len() >= 8 && maybe_time.contains(':'))
        {
            let ts = format!("{maybe_date} {maybe_time}");
            let lvl = parts[2].to_string();
            let msg = if parts.len() > 3 {
                parts[3].to_string()
            } else {
                String::new()
            };
            return ParsedLogLine {
                timestamp: Some(ts),
                level: Some(lvl),
                message: Some(msg),
            };
        }
    }
    // Fallback: check if first part is time-like
    if parts.len() >= 2 && parts[0].contains(':') && parts[0].len() >= 8 {
        let ts = parts[0].to_string();
        let lvl = parts[1].to_string();
        let msg = parts[2..].join(" ");
        return ParsedLogLine {
            timestamp: Some(ts),
            level: Some(lvl),
            message: Some(msg),
        };
    }
    ParsedLogLine {
        timestamp: None,
        level: None,
        message: None,
    }
}

/// Extract the first `# Heading` or the first long prose line from Markdown,
/// used as a skill's canonical name/description. Mirrors hermes-web-ui's
/// `extractDescription()` behaviour — first non-empty/non-heading line,
/// truncated to 200 chars.
fn md_first_heading(content: &str) -> Option<String> {
    content
        .lines()
        .find(|l| l.starts_with("# "))
        .map(|l| l[2..].trim().to_string())
}

fn md_first_description(content: &str) -> String {
    content
        .lines()
        .find(|l| !l.starts_with('#') && !l.trim().is_empty() && l.trim().len() > 10)
        .map(|l| {
            let s = l.trim();
            if s.len() > 200 {
                format!("{}...", &s[..200])
            } else {
                s.to_string()
            }
        })
        .unwrap_or_default()
}

/// Read `config.yaml` and return the list of `skills.disabled` entries.
/// Gracefully handles missing file / missing section → empty list.
///
/// The disable mechanism matches upstream `hermes-web-ui`:
///
/// ```yaml
/// skills:
///   disabled:
///     - web_search
///     - file_tools
/// ```
fn read_disabled_skills() -> Vec<String> {
    let config_path = hermes_home().join("config.yaml");
    let raw = match std::fs::read_to_string(&config_path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mut disabled: Vec<String> = Vec::new();
    let mut in_skills = false;
    let mut in_disabled = false;
    for line in raw.lines() {
        // Strip trailing comments.
        let line = match line.find('#') {
            Some(i) => &line[..i],
            None => line,
        };
        let trimmed_full = line.trim_end();
        if trimmed_full.is_empty() {
            continue;
        }
        let indent = trimmed_full.len() - trimmed_full.trim_start().len();
        let body = trimmed_full.trim_start();

        if indent == 0 {
            in_skills = body.starts_with("skills:");
            in_disabled = false;
        } else if in_skills && indent == 2 && body.starts_with("disabled:") {
            in_disabled = true;
        } else if in_skills && in_disabled && indent >= 4 && body.starts_with("- ") {
            // Strip the `- ` prefix and any surrounding quotes.
            let name = body
                .trim_start_matches("- ")
                .trim()
                .trim_matches('"')
                .trim_matches('\'');
            if !name.is_empty() {
                disabled.push(name.to_string());
            }
        } else if indent <= 2 {
            // Left the disabled list.
            in_disabled = false;
        }
    }
    disabled
}

/// Shape returned to the frontend — kept compatible with the previous
/// version (file/name/description/path) while adding `enabled` and the
/// optional `isDir`/`category` fields that `hermes-web-ui` also uses.
#[tauri::command]
pub async fn hermes_skills_list() -> Result<Value, String> {
    let _ = hermes_ensure_builtin_skills();
    let skills_dir = hermes_home().join("skills");
    if !skills_dir.exists() {
        return Ok(serde_json::json!([]));
    }
    let disabled_names = read_disabled_skills();
    let is_enabled = |name: &str| -> bool { !disabled_names.iter().any(|d| d == name) };

    let mut categories: Vec<Value> = Vec::new();
    let entries =
        std::fs::read_dir(&skills_dir).map_err(|e| format!("Failed to read skills dir: {e}"))?;

    for entry in entries.flatten() {
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let cat_name = entry.file_name().to_string_lossy().to_string();
        if cat_name.starts_with('.') {
            continue;
        }

        if ft.is_dir() {
            let cat_dir = skills_dir.join(&cat_name);

            // Category description from optional DESCRIPTION.md
            let cat_desc = std::fs::read_to_string(cat_dir.join("DESCRIPTION.md"))
                .ok()
                .map(|c| {
                    md_first_heading(&c)
                        .unwrap_or_else(|| c.trim().lines().next().unwrap_or("").to_string())
                })
                .unwrap_or_default();

            let mut skills: Vec<Value> = Vec::new();
            if let Ok(files) = std::fs::read_dir(&cat_dir) {
                for f in files.flatten() {
                    let fname = f.file_name().to_string_lossy().to_string();
                    let fpath = cat_dir.join(&fname);
                    let ftype = match f.file_type() {
                        Ok(t) => t,
                        Err(_) => continue,
                    };

                    // v0.14.1 structured skill: <category>/<skill>/SKILL.md
                    if ftype.is_dir() {
                        let skill_md = fpath.join("SKILL.md");
                        if !skill_md.exists() {
                            continue;
                        }
                        let content = std::fs::read_to_string(&skill_md).unwrap_or_default();
                        let display = md_first_heading(&content).unwrap_or_else(|| fname.clone());
                        let desc = md_first_description(&content);
                        skills.push(serde_json::json!({
                            "file": fname.clone(),
                            "name": display,
                            "slug": fname.clone(),
                            "description": desc,
                            "path": skill_md.to_string_lossy(),
                            "skill_dir": fpath.to_string_lossy(),
                            "isDir": true,
                            "enabled": is_enabled(&fname),
                        }));
                        continue;
                    }

                    // Legacy flat skill: <category>/<name>.md
                    if !fname.ends_with(".md") || fname == "DESCRIPTION.md" {
                        continue;
                    }
                    let content = std::fs::read_to_string(&fpath).unwrap_or_default();
                    let slug = fname.trim_end_matches(".md").to_string();
                    let display = md_first_heading(&content).unwrap_or_else(|| slug.clone());
                    let desc = md_first_description(&content);
                    skills.push(serde_json::json!({
                        "file": fname,
                        "name": display,
                        "slug": slug.clone(),
                        "description": desc,
                        "path": fpath.to_string_lossy(),
                        "isDir": false,
                        "enabled": is_enabled(&slug),
                    }));
                }
            }
            if !skills.is_empty() {
                skills.sort_by(|a, b| {
                    a["name"]
                        .as_str()
                        .unwrap_or("")
                        .cmp(b["name"].as_str().unwrap_or(""))
                });
                categories.push(serde_json::json!({
                    "category": cat_name,
                    "description": cat_desc,
                    "skills": skills,
                }));
            }
        } else if cat_name.ends_with(".md") && cat_name != "DESCRIPTION.md" {
            // Uncategorized top-level skill file.
            let fpath = skills_dir.join(&cat_name);
            let content = std::fs::read_to_string(&fpath).unwrap_or_default();
            let slug = cat_name.trim_end_matches(".md").to_string();
            let display = md_first_heading(&content).unwrap_or_else(|| slug.clone());
            categories.push(serde_json::json!({
                "category": "_root",
                "description": "",
                "skills": [{
                    "file": cat_name,
                    "name": display,
                    "slug": slug.clone(),
                    "description": md_first_description(&content),
                    "path": fpath.to_string_lossy(),
                    "isDir": false,
                    "enabled": is_enabled(&slug),
                }],
            }));
        }
    }

    categories.sort_by(|a, b| {
        a["category"]
            .as_str()
            .unwrap_or("")
            .cmp(b["category"].as_str().unwrap_or(""))
    });

    Ok(Value::Array(categories))
}

#[tauri::command]
pub async fn hermes_skill_detail(file_path: String) -> Result<String, String> {
    let skills_dir = hermes_home().join("skills");
    let resolved = PathBuf::from(&file_path);
    let canonical = resolved
        .canonicalize()
        .map_err(|e| format!("Path error: {e}"))?;
    let canonical_dir = skills_dir
        .canonicalize()
        .map_err(|e| format!("Path error: {e}"))?;
    if !canonical.starts_with(&canonical_dir) {
        return Err("Access denied".into());
    }
    std::fs::read_to_string(&canonical).map_err(|e| format!("Failed to read skill: {e}"))
}

// ============================================================================
// Skills — enable/disable toggle (Phase 3)
// ============================================================================

/// Toggle a skill's enabled state by mutating `config.yaml`'s
/// `skills.disabled` list. Matches the behaviour of hermes-web-ui's
/// `PUT /api/hermes/skills/toggle`.
///
/// * `enabled = true`  → remove `name` from disabled list
/// * `enabled = false` → add `name` to disabled list
///
/// A `config.yaml.bak-<epoch>` backup is written before any mutation so
/// users can always recover a broken config.
#[tauri::command]
pub async fn hermes_skill_toggle(name: String, enabled: bool) -> Result<Value, String> {
    if name.is_empty() {
        return Err("Skill name is required".into());
    }
    let config_path = hermes_home().join("config.yaml");
    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config.yaml: {e}"))?;

    // Write a timestamped backup before any mutation.
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup_path = hermes_home().join(format!("config.yaml.bak-{ts}"));
    let _ = std::fs::write(&backup_path, &raw);

    let patched = patch_yaml_toggle_skill(&raw, &name, enabled);
    std::fs::write(&config_path, &patched)
        .map_err(|e| format!("Failed to write config.yaml: {e}"))?;

    Ok(serde_json::json!({
        "ok": true,
        "skill": name,
        "enabled": enabled,
        "backup": backup_path.to_string_lossy(),
    }))
}

/// YAML patcher: add/remove `name` from `skills.disabled[]`.
///
/// Careful to preserve line ordering + indentation + other sections so that
/// user-edited comments and custom keys survive round-trips.
fn patch_yaml_toggle_skill(raw: &str, name: &str, enabled: bool) -> String {
    let mut lines: Vec<String> = raw.lines().map(str::to_string).collect();

    // Find `skills:` top-level key.
    let skills_idx = lines.iter().position(|l| {
        let trimmed = l.trim_end();
        let indent = trimmed.len() - trimmed.trim_start().len();
        indent == 0 && trimmed.trim_start().starts_with("skills:")
    });

    // If no `skills:` block exists yet, synthesize one.
    if skills_idx.is_none() {
        if enabled {
            // Already enabled (not in any disabled list). Nothing to do.
            return raw.to_string();
        }
        // Append a new skills.disabled block.
        if !raw.is_empty() && !raw.ends_with('\n') {
            lines.push(String::new());
        }
        lines.push("skills:".to_string());
        lines.push("  disabled:".to_string());
        lines.push(format!("    - {name}"));
        lines.push(String::new());
        return lines.join("\n");
    }

    let skills_idx = skills_idx.unwrap();

    // Find `disabled:` under skills.
    let mut disabled_idx: Option<usize> = None;
    let mut i = skills_idx + 1;
    while i < lines.len() {
        let trimmed = lines[i].trim_end();
        let indent = trimmed.len() - trimmed.trim_start().len();
        if !trimmed.is_empty() && indent == 0 {
            break; // left the skills block
        }
        if indent == 2 && trimmed.trim_start().starts_with("disabled:") {
            disabled_idx = Some(i);
            break;
        }
        i += 1;
    }

    // Create a `disabled:` list if absent.
    if disabled_idx.is_none() {
        if enabled {
            // Already not disabled — nothing to do.
            return raw.to_string();
        }
        let insert_at = skills_idx + 1;
        lines.insert(insert_at, "  disabled:".to_string());
        lines.insert(insert_at + 1, format!("    - {name}"));
        return lines.join("\n");
    }

    let disabled_idx = disabled_idx.unwrap();

    // Collect existing list item line indices + their values.
    let mut item_rows: Vec<(usize, String)> = Vec::new();
    let mut j = disabled_idx + 1;
    while j < lines.len() {
        let trimmed = lines[j].trim_end();
        let indent = trimmed.len() - trimmed.trim_start().len();
        if !trimmed.is_empty() && indent < 4 {
            break;
        }
        let body = trimmed.trim_start();
        if body.starts_with("- ") {
            let v = body
                .trim_start_matches("- ")
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            item_rows.push((j, v));
        }
        j += 1;
    }

    let has_item = item_rows.iter().any(|(_, v)| v == name);

    if enabled {
        // Remove all rows that match.
        if !has_item {
            return raw.to_string();
        }
        let to_remove: Vec<usize> = item_rows
            .iter()
            .filter(|(_, v)| v == name)
            .map(|(i, _)| *i)
            .collect();
        for idx in to_remove.iter().rev() {
            lines.remove(*idx);
        }
    } else {
        if has_item {
            return raw.to_string();
        }
        // Insert right after the `disabled:` key line or at the end of
        // existing items — whichever produces stable ordering.
        let insert_at = item_rows
            .last()
            .map(|(i, _)| *i + 1)
            .unwrap_or(disabled_idx + 1);
        lines.insert(insert_at, format!("    - {name}"));
    }

    lines.join("\n")
}

/// Recursively list all files inside a skill directory. Returns an array
/// of `{ path, name, isDir }` where `path` is relative to `~/.hermes/`.
/// Skips the top-level `SKILL.md` because the UI already renders it
/// separately in the detail pane.
#[tauri::command]
pub async fn hermes_skill_files(category: String, skill: String) -> Result<Value, String> {
    let skills_root = hermes_home().join("skills");
    let skill_dir = skills_root.join(&category).join(&skill);
    if !skill_dir.exists() || !skill_dir.is_dir() {
        return Ok(serde_json::json!([]));
    }

    let mut out: Vec<Value> = Vec::new();
    fn walk(root: &PathBuf, rel_base: &str, out: &mut Vec<Value>) {
        let entries = match std::fs::read_dir(root) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let rel = if rel_base.is_empty() {
                name.clone()
            } else {
                format!("{rel_base}/{name}")
            };
            let full = root.join(&name);
            let is_dir = full.is_dir();
            // Skip the flagship SKILL.md at the root level.
            if rel_base.is_empty() && name == "SKILL.md" {
                continue;
            }
            out.push(serde_json::json!({
                "path": rel,
                "name": name,
                "isDir": is_dir,
            }));
            if is_dir {
                walk(&full, &rel, out);
            }
        }
    }
    walk(&skill_dir, "", &mut out);
    out.sort_by(|a, b| {
        a["path"]
            .as_str()
            .unwrap_or("")
            .cmp(b["path"].as_str().unwrap_or(""))
    });
    Ok(Value::Array(out))
}

/// Write (create/update) a skill file. Path must be inside
/// `~/.hermes/skills/`. Intermediate directories are auto-created.
#[tauri::command]
pub async fn hermes_skill_write(file_path: String, content: String) -> Result<String, String> {
    let skills_dir = hermes_home().join("skills");
    let target = PathBuf::from(&file_path);

    // Ensure the target lives under the skills directory. We compare
    // absolute-normalized paths to allow writing *new* files (which cannot
    // be canonicalized yet) while still rejecting traversal.
    let skills_canon = skills_dir
        .canonicalize()
        .map_err(|e| format!("Skills dir not accessible: {e}"))?;
    let target_abs = if target.is_absolute() {
        target.clone()
    } else {
        skills_dir.join(&target)
    };
    let parent = target_abs
        .parent()
        .ok_or_else(|| "Invalid target path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    let parent_canon = parent
        .canonicalize()
        .map_err(|e| format!("Path error: {e}"))?;
    if !parent_canon.starts_with(&skills_canon) {
        return Err("Access denied".into());
    }
    std::fs::write(&target_abs, &content).map_err(|e| format!("Failed to write skill: {e}"))?;
    Ok("ok".into())
}

fn has_visible_entries(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .ok()
        .map(|entries| {
            entries
                .flatten()
                .any(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        })
        .unwrap_or(false)
}

fn same_canonical_dir(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn bundled_skill_sources() -> Vec<PathBuf> {
    let root = app_root_dir();
    vec![
        root.join("resources")
            .join("data")
            .join("hermes-source")
            .join("hermes-agent-main")
            .join("skills"),
        root.join("resources")
            .join("data")
            .join("hermes")
            .join("skills"),
        root.join("data")
            .join("hermes-source")
            .join("hermes-agent-main")
            .join("skills"),
        root.join("data").join("hermes").join("skills"),
    ]
}

/// 确保 Hermes 内置 skills 已填充到 `{hermes_home}/skills/`。
///
/// 便携版不能依赖在线 SkillHub/下载流程，所以这里只从随包资源复制。
/// 已有目录会做“补缺式同步”：只复制缺失文件，不覆盖用户已有 skill。
#[tauri::command]
pub fn hermes_ensure_builtin_skills() -> Result<Value, String> {
    let home = hermes_home();
    let target = home.join("skills");

    let source = bundled_skill_sources().into_iter().find(|source| {
        source.exists() && has_visible_entries(source) && !same_canonical_dir(source, &target)
    });

    let Some(source) = source else {
        return Ok(serde_json::json!({
            "seeded": false,
            "reason": "source_not_found",
            "target": target.to_string_lossy()
        }));
    };

    // 复制
    std::fs::create_dir_all(&target).map_err(|e| format!("创建 skills 目录失败: {e}"))?;
    let mut stats = CopyMissingStats::default();
    copy_dir_missing_recursively(&source, &target, &mut stats)
        .map_err(|e| format!("同步内置 skill 失败: {e}"))?;

    Ok(serde_json::json!({
        "seeded": stats.files_copied > 0,
        "merged": true,
        "count": {
            "categories": std::fs::read_dir(&target).map(|d| d.count()).unwrap_or(0),
            "files_copied": stats.files_copied,
            "files_skipped": stats.files_skipped,
            "dirs_created": stats.dirs_created
        },
        "target": target.to_string_lossy()
    }))
}

/// Resolve `memory|user|soul` to the file Hermes itself reads on startup.
///
/// Built-in memory is profile-scoped under `HERMES_HOME/memories/`, while the
/// agent identity/persona is `HERMES_HOME/SOUL.md`.
fn memory_file_path(kind: &str) -> Option<PathBuf> {
    let home = hermes_home();
    match kind {
        "memory" => Some(home.join("memories").join("MEMORY.md")),
        "user" => Some(home.join("memories").join("USER.md")),
        "soul" => Some(home.join("SOUL.md")),
        _ => None,
    }
}

#[tauri::command]
pub async fn hermes_memory_read(r#type: Option<String>) -> Result<String, String> {
    let kind = r#type.as_deref().unwrap_or("memory");
    let file_path = memory_file_path(kind)
        .ok_or_else(|| format!("Invalid memory kind '{kind}' (expected memory|user|soul)"))?;
    if !file_path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read memory: {e}"))
}

#[tauri::command]
pub async fn hermes_memory_write(
    r#type: Option<String>,
    content: String,
) -> Result<String, String> {
    let kind = r#type.as_deref().unwrap_or("memory");
    let file_path = memory_file_path(kind)
        .ok_or_else(|| format!("Invalid memory kind '{kind}' (expected memory|user|soul)"))?;
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    std::fs::write(&file_path, &content).map_err(|e| format!("Failed to write memory: {e}"))?;
    Ok("ok".into())
}

/// Read all memory sections (memory/user/soul) in one call, returning content
/// + last-modified UNIX timestamp (seconds) for each. A missing file yields an
/// empty string and `None` mtime — the caller shows "not yet written" state.
///
/// Shape matches `hermes-web-ui`'s `GET /api/hermes/memory` response so the
/// frontend can mirror the official UI's three-column layout.
#[tauri::command]
pub async fn hermes_memory_read_all() -> Result<Value, String> {
    let section = |kind: &str| -> (String, Option<u64>) {
        let path = match memory_file_path(kind) {
            Some(p) => p,
            None => return (String::new(), None),
        };
        if !path.exists() {
            return (String::new(), None);
        }
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let mtime = std::fs::metadata(&path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        (content, mtime)
    };
    let (memory, memory_mtime) = section("memory");
    let (user, user_mtime) = section("user");
    let (soul, soul_mtime) = section("soul");
    Ok(serde_json::json!({
        "memory": memory,
        "user": user,
        "soul": soul,
        "memory_mtime": memory_mtime,
        "user_mtime": user_mtime,
        "soul_mtime": soul_mtime,
    }))
}

fn downloads_dir_fallback() -> PathBuf {
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn safe_download_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

/// Read an entire log file and save it to the user's Downloads/ClawPanel
/// directory. We refuse path traversal and only allow files whose canonical
/// path lives inside `~/.hermes/logs/`.
#[tauri::command]
pub async fn hermes_logs_download(name: String) -> Result<Value, String> {
    // Reject traversal before any disk access.
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Invalid log file name".into());
    }
    let logs_dir = hermes_home().join("logs");
    let file_path = logs_dir.join(&name);
    // Canonicalize both sides to ensure symlinks/relative segments can't
    // escape the logs directory.
    let canon_dir = logs_dir
        .canonicalize()
        .map_err(|e| format!("Logs dir not found: {e}"))?;
    let canon_file = file_path
        .canonicalize()
        .map_err(|e| format!("Log file not found: {e}"))?;
    if !canon_file.starts_with(&canon_dir) {
        return Err("Access denied".into());
    }
    let content =
        std::fs::read_to_string(&canon_file).map_err(|e| format!("Failed to read log: {e}"))?;
    let out_dir = downloads_dir_fallback().join("ClawPanel");
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("Failed to create download dir: {e}"))?;
    let out_path = out_dir.join(safe_download_filename(&name));
    std::fs::write(&out_path, content).map_err(|e| format!("Failed to save log: {e}"))?;
    Ok(serde_json::json!({
        "path": out_path.to_string_lossy().to_string(),
    }))
}

// ============================================================================
// api_server guardian (Step 5 / G7)
//
// ClawPanel's Hermes integration requires `platforms.api_server.enabled: true`
// in ~/.hermes/config.yaml so that `hermes gateway run` exposes the
// /v1/runs endpoint we depend on. The setting is written once by
// `configure_hermes`, but several real-world scenarios can remove it:
//   * User upgrades Hermes and the new default config.yaml is merged
//     without the api_server platform entry.
//   * User manually edits config.yaml (via Hermes CLI or text editor).
//   * Migration scripts accidentally drop the section.
//
// Rather than silently failing at Gateway start time with an opaque
// "endpoint not found" error, this guardian checks before every start and
// auto-heals the config. A timestamped backup (config.yaml.bak-<epoch>)
// is written before any mutation so users can always roll back.
// ============================================================================

/// Scan a YAML string for `platforms.api_server.enabled: true` and return
/// true only when that exact path exists with a truthy value.
fn config_has_api_server_enabled(raw: &str) -> bool {
    let mut in_platforms = false;
    let mut in_api_server = false;
    for line in raw.lines() {
        // Strip comments (crude, but matches the simple YAML we write).
        let line = match line.find('#') {
            Some(i) => &line[..i],
            None => line,
        };
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            continue;
        }
        let indent = trimmed.len() - trimmed.trim_start().len();

        if indent == 0 {
            in_platforms = trimmed.trim_start().starts_with("platforms:");
            in_api_server = false;
            continue;
        }
        if !in_platforms {
            continue;
        }
        // Inside platforms:
        if indent <= 2 {
            in_api_server = trimmed.trim_start().starts_with("api_server:");
            continue;
        }
        if !in_api_server {
            continue;
        }
        // Inside platforms.api_server:
        let t = trimmed.trim_start();
        if let Some(rest) = t.strip_prefix("enabled:") {
            let v = rest.trim().trim_matches(|c: char| c == '"' || c == '\'');
            return matches!(v.to_ascii_lowercase().as_str(), "true" | "yes" | "on" | "1");
        }
    }
    false
}

/// Produce a patched YAML that guarantees
/// `platforms.api_server.enabled: true` is present, preserving everything
/// else verbatim. If the config already has the setting (as `true`) this
/// returns the original text unchanged.
fn patch_yaml_ensure_api_server(raw: &str) -> String {
    if config_has_api_server_enabled(raw) {
        return raw.to_string();
    }

    // Strategy:
    //   * If `platforms:` exists, inject / replace api_server subtree under it.
    //   * Otherwise append a new top-level `platforms:` block at EOF.
    let lines: Vec<&str> = raw.lines().collect();
    let mut out: Vec<String> = Vec::with_capacity(lines.len() + 4);
    let mut platforms_found = false;
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim_end();
        let indent = trimmed.len() - trimmed.trim_start().len();

        if indent == 0 && trimmed.trim_start().starts_with("platforms:") {
            // Copy the platforms: header
            out.push(line.to_string());
            platforms_found = true;
            i += 1;
            // Accumulate children and drop the existing api_server subtree
            // (we'll rewrite it at the top of the block). Keep siblings.
            let mut accumulated_children: Vec<String> = Vec::new();
            let mut skipping_api_server = false;
            while i < lines.len() {
                let l = lines[i];
                let t = l.trim_end();
                let ind = t.len() - t.trim_start().len();
                if ind == 0 && !t.is_empty() {
                    break; // leaving platforms block
                }
                if ind <= 2 {
                    skipping_api_server = t.trim_start().starts_with("api_server:");
                }
                if !skipping_api_server {
                    accumulated_children.push(l.to_string());
                }
                i += 1;
            }
            // Inject a fresh api_server entry at the top of platforms:
            out.push("  api_server:".into());
            out.push("    enabled: true".into());
            out.extend(accumulated_children);
            continue;
        }
        out.push(line.to_string());
        i += 1;
    }

    if !platforms_found {
        if let Some(last) = out.last() {
            if !last.is_empty() {
                out.push(String::new());
            }
        }
        out.push("platforms:".into());
        out.push("  api_server:".into());
        out.push("    enabled: true".into());
    }

    let mut content = out.join("\n");
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content
}

/// Guardian called from `hermes_gateway_action` on every `start` request.
/// Returns Ok(()) when the config is healthy (either it was already correct
/// or the patch succeeded). Emits `hermes-config-patched` on auto-heal so
/// the frontend can display a transparent toast.
fn ensure_api_server_enabled(app: &tauri::AppHandle) -> Result<(), String> {
    let config_path = hermes_home().join("config.yaml");
    if !config_path.exists() {
        // Nothing to guard — configure_hermes will create a compliant file
        // on first run. Don't auto-create here; that's outside the guard's
        // responsibility.
        return Ok(());
    }
    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config.yaml: {e}"))?;
    if config_has_api_server_enabled(&raw) {
        return Ok(());
    }

    // Back up with a timestamped filename so we never overwrite an earlier
    // .bak (rapid re-starts would lose history otherwise).
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup_path = config_path.with_extension(format!("yaml.bak-{ts}"));
    let _ = std::fs::write(&backup_path, &raw);

    let patched = patch_yaml_ensure_api_server(&raw);
    std::fs::write(&config_path, &patched)
        .map_err(|e| format!("Failed to write config.yaml: {e}"))?;

    // Inform the frontend so it can surface a toast. Failure to emit is
    // non-fatal — the patch itself already succeeded.
    use tauri::Emitter;
    let _ = app.emit(
        "hermes-config-patched",
        serde_json::json!({
            "kind": "api_server_enabled",
            "backup": backup_path.to_string_lossy(),
            "message": "platforms.api_server.enabled 缺失，已自动修复并备份原文件",
        }),
    );
    Ok(())
}

// ============================================================================
// .env editor commands (Step 4 / G6)
//
// Users may need to set custom environment variables for Hermes (e.g.
// `TAVILY_API_KEY` for the tavily skill, `HTTP_PROXY`, etc.). These keys
// live in ~/.hermes/.env alongside the ClawPanel-managed provider keys.
//
// The three commands below:
//   * `hermes_env_read_unmanaged` — returns every key in .env that is NOT
//      managed by ClawPanel (i.e. not in `hermes_providers::all_managed_env_keys`)
//   * `hermes_env_set`            — writes or updates an unmanaged key
//   * `hermes_env_delete`         — removes an unmanaged key
//
// All three refuse to touch `all_managed_env_keys` to prevent users from
// accidentally clobbering provider keys from the editor UI (those should
// be configured via the setup page / configure_hermes).
// ============================================================================

/// Lenient .env parser shared by the three commands below.
/// Returns a Vec of (key, value, original_line_index) for every `KEY=VALUE`
/// pair. Comments and blanks are preserved by line index but not returned.
fn parse_env_file_lines(raw: &str) -> Vec<(String, String, usize)> {
    let mut out = Vec::new();
    for (i, line) in raw.lines().enumerate() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = t.split_once('=') {
            let k = k.trim().to_string();
            if k.is_empty() {
                continue;
            }
            out.push((k, v.to_string(), i));
        }
    }
    out
}

/// Return every non-managed `KEY=VALUE` pair from ~/.hermes/.env.
///
/// Output is ordered by the order of appearance in the file. Managed keys
/// (provider API keys, base URLs, `GATEWAY_ALLOW_ALL_USERS`, `API_SERVER_KEY`)
/// are filtered out — those are surfaced separately in the config UI.
#[tauri::command]
pub fn hermes_env_read_unmanaged() -> Result<Vec<(String, String)>, String> {
    use super::hermes_providers;

    let env_path = hermes_home().join(".env");
    if !env_path.exists() {
        return Ok(Vec::new());
    }

    let raw =
        std::fs::read_to_string(&env_path).map_err(|e| format!("Failed to read .env: {e}"))?;

    let managed = hermes_providers::all_managed_env_keys();
    let mut out: Vec<(String, String)> = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    for (k, v, _) in parse_env_file_lines(&raw) {
        if managed.contains(&k.as_str()) {
            continue;
        }
        if seen.insert(k.clone()) {
            out.push((k, v));
        }
    }
    Ok(out)
}

/// Write or update a single unmanaged env var in ~/.hermes/.env.
///
/// Refuses to write keys in `hermes_providers::all_managed_env_keys`.
/// Creates the file (and parent dir) if missing.
#[tauri::command]
pub fn hermes_env_set(key: String, value: String) -> Result<(), String> {
    use super::hermes_providers;

    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Key cannot be empty".into());
    }
    // Basic sanity: env var keys are typically A-Z0-9_
    if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(format!(
            "Invalid env var key '{key}': only [A-Z0-9_] are allowed"
        ));
    }
    let managed = hermes_providers::all_managed_env_keys();
    if managed.contains(&key.as_str()) {
        return Err(format!(
            "'{key}' is managed by ClawPanel; please configure it via the provider setup page"
        ));
    }

    let env_path = hermes_home().join(".env");
    if let Some(parent) = env_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .hermes dir: {e}"))?;
    }

    let raw = if env_path.exists() {
        std::fs::read_to_string(&env_path).map_err(|e| format!("Failed to read .env: {e}"))?
    } else {
        String::new()
    };

    // Preserve file structure: if the key already exists, update the first
    // occurrence and leave the rest (which would be dead code anyway for
    // dotenv loaders) alone. Otherwise append a new line.
    let lines: Vec<&str> = raw.lines().collect();
    let mut out: Vec<String> = Vec::with_capacity(lines.len() + 1);
    let mut replaced = false;
    for line in lines.iter() {
        let t = line.trim();
        if t.starts_with('#') || t.is_empty() {
            out.push(line.to_string());
            continue;
        }
        if let Some((k, _)) = t.split_once('=') {
            if k.trim() == key && !replaced {
                out.push(format!("{key}={value}"));
                replaced = true;
                continue;
            }
        }
        out.push(line.to_string());
    }
    if !replaced {
        out.push(format!("{key}={value}"));
    }
    let mut content = out.join("\n");
    if !content.ends_with('\n') {
        content.push('\n');
    }
    std::fs::write(&env_path, content).map_err(|e| format!("Failed to write .env: {e}"))?;
    Ok(())
}

/// Remove an unmanaged env var from ~/.hermes/.env.
///
/// Refuses to delete keys in `hermes_providers::all_managed_env_keys`.
/// No-op if the key doesn't exist.
#[tauri::command]
pub fn hermes_env_delete(key: String) -> Result<(), String> {
    use super::hermes_providers;

    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Key cannot be empty".into());
    }
    let managed = hermes_providers::all_managed_env_keys();
    if managed.contains(&key.as_str()) {
        return Err(format!(
            "'{key}' is managed by ClawPanel; please configure it via the provider setup page"
        ));
    }

    let env_path = hermes_home().join(".env");
    if !env_path.exists() {
        return Ok(());
    }
    let raw =
        std::fs::read_to_string(&env_path).map_err(|e| format!("Failed to read .env: {e}"))?;

    let lines: Vec<&str> = raw.lines().collect();
    let mut out: Vec<String> = Vec::with_capacity(lines.len());
    for line in lines.iter() {
        let t = line.trim();
        if t.starts_with('#') || t.is_empty() {
            out.push(line.to_string());
            continue;
        }
        if let Some((k, _)) = t.split_once('=') {
            if k.trim() == key {
                continue; // drop
            }
        }
        out.push(line.to_string());
    }
    let mut content = out.join("\n");
    if !content.ends_with('\n') {
        content.push('\n');
    }
    std::fs::write(&env_path, content).map_err(|e| format!("Failed to write .env: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn hermes_config_raw_read() -> Result<Value, String> {
    let path = hermes_home().join("config.yaml");
    let yaml = std::fs::read_to_string(&path).unwrap_or_default();
    Ok(serde_json::json!({ "yaml": yaml }))
}

#[tauri::command]
pub fn hermes_config_raw_write(yaml_text: String) -> Result<Value, String> {
    let path = hermes_home().join("config.yaml");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    if path.exists() {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let backup = path.with_extension(format!("yaml.bak-{ts}"));
        let _ = std::fs::copy(&path, backup);
    }
    std::fs::write(&path, yaml_text).map_err(|e| format!("Failed to write config.yaml: {e}"))?;
    Ok(serde_json::json!({ "ok": true }))
}

const VOICE_CONFIG_MASK: &str = "__SUPERCLAW_VOICE_KEY_MASKED__";

fn voice_config_default() -> Value {
    serde_json::json!({
        "provider": "openai-compatible",
        "apiFormat": "openai",
        "baseUrl": "",
        "authType": "bearer",
        "authHeader": "Authorization",
        "apiKeyEnv": "VOICE_API_KEY",
        "apiKey": "",
        "input": {
            "enabled": false,
            "model": "whisper-1",
            "path": "/audio/transcriptions",
            "language": "zh-CN"
        },
        "output": {
            "enabled": false,
            "model": "tts-1",
            "path": "/audio/speech",
            "voice": "alloy",
            "format": "mp3"
        }
    })
}

fn voice_config_path() -> PathBuf {
    hermes_home().join("voice.json")
}

fn voice_string(value: Option<&Value>, fallback: &str, max: usize) -> String {
    value
        .and_then(|v| v.as_str())
        .unwrap_or(fallback)
        .trim()
        .chars()
        .take(max)
        .collect()
}

fn voice_bool(value: Option<&Value>, fallback: bool) -> bool {
    value.and_then(|v| v.as_bool()).unwrap_or(fallback)
}

fn normalize_voice_config(input: &Value, existing: Option<&Value>) -> Value {
    let defaults = voice_config_default();
    let input_obj = input.get("input").unwrap_or(&Value::Null);
    let output_obj = input.get("output").unwrap_or(&Value::Null);
    let existing_key = existing
        .and_then(|v| v.get("apiKey"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let raw_key = voice_string(input.get("apiKey"), "", 8000);
    let api_key = if raw_key == VOICE_CONFIG_MASK {
        existing_key.to_string()
    } else {
        raw_key
    };
    let api_format = voice_string(
        input.get("apiFormat"),
        defaults["apiFormat"].as_str().unwrap_or("openai"),
        40,
    )
    .to_ascii_lowercase();
    let api_format = if api_format == "json" {
        "json"
    } else {
        "openai"
    };
    let auth_type = voice_string(
        input.get("authType"),
        defaults["authType"].as_str().unwrap_or("bearer"),
        40,
    )
    .to_ascii_lowercase();
    let auth_type = match auth_type.as_str() {
        "none" => "none",
        "header" => "header",
        _ => "bearer",
    };
    let output_format = voice_string(
        output_obj.get("format"),
        defaults["output"]["format"].as_str().unwrap_or("mp3"),
        40,
    )
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
    .collect::<String>();
    serde_json::json!({
        "provider": voice_string(input.get("provider"), defaults["provider"].as_str().unwrap_or("openai-compatible"), 120),
        "apiFormat": api_format,
        "baseUrl": voice_string(input.get("baseUrl"), "", 2000).trim_end_matches('/').to_string(),
        "authType": auth_type,
        "authHeader": voice_string(input.get("authHeader"), defaults["authHeader"].as_str().unwrap_or("Authorization"), 120),
        "apiKeyEnv": voice_string(input.get("apiKeyEnv"), defaults["apiKeyEnv"].as_str().unwrap_or("VOICE_API_KEY"), 120),
        "apiKey": api_key,
        "input": {
            "enabled": voice_bool(input_obj.get("enabled"), false),
            "model": voice_string(input_obj.get("model"), defaults["input"]["model"].as_str().unwrap_or("whisper-1"), 300),
            "path": voice_string(input_obj.get("path"), defaults["input"]["path"].as_str().unwrap_or("/audio/transcriptions"), 1000),
            "language": voice_string(input_obj.get("language"), defaults["input"]["language"].as_str().unwrap_or("zh-CN"), 80)
        },
        "output": {
            "enabled": voice_bool(output_obj.get("enabled"), false),
            "model": voice_string(output_obj.get("model"), defaults["output"]["model"].as_str().unwrap_or("tts-1"), 300),
            "path": voice_string(output_obj.get("path"), defaults["output"]["path"].as_str().unwrap_or("/audio/speech"), 1000),
            "voice": voice_string(output_obj.get("voice"), defaults["output"]["voice"].as_str().unwrap_or("alloy"), 300),
            "format": if output_format.is_empty() { "mp3".to_string() } else { output_format }
        }
    })
}

fn read_voice_config_raw() -> Value {
    let path = voice_config_path();
    match std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
    {
        Some(v) => normalize_voice_config(&v, None),
        None => voice_config_default(),
    }
}

fn resolve_voice_api_key(config: &Value) -> String {
    let env_name = config["apiKeyEnv"].as_str().unwrap_or("").trim();
    if !env_name.is_empty() {
        if let Ok(value) = std::env::var(env_name) {
            if !value.trim().is_empty() {
                return value;
            }
        }
    }
    config["apiKey"].as_str().unwrap_or("").trim().to_string()
}

fn mask_voice_config(config: Value) -> Value {
    let normalized = normalize_voice_config(&config, None);
    let key = resolve_voice_api_key(&normalized);
    let base_ready = !normalized["baseUrl"].as_str().unwrap_or("").is_empty()
        && (normalized["authType"].as_str().unwrap_or("") == "none" || !key.is_empty());
    let stored_key = !normalized["apiKey"].as_str().unwrap_or("").is_empty();
    let env_available = normalized["apiKeyEnv"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| std::env::var(s).ok())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let mut out = normalized;
    out["apiKey"] = serde_json::json!(if stored_key { VOICE_CONFIG_MASK } else { "" });
    out["apiKeyMasked"] = serde_json::json!(stored_key);
    out["envKeyAvailable"] = serde_json::json!(env_available);
    out["configured"] = serde_json::json!(base_ready);
    out["inputReady"] =
        serde_json::json!(base_ready && out["input"]["enabled"].as_bool().unwrap_or(false));
    out["outputReady"] =
        serde_json::json!(base_ready && out["output"]["enabled"].as_bool().unwrap_or(false));
    out
}

fn voice_endpoint(config: &Value, kind: &str) -> Result<String, String> {
    let base = config["baseUrl"]
        .as_str()
        .unwrap_or("")
        .trim()
        .trim_end_matches('/');
    let path = config[kind]["path"].as_str().unwrap_or("").trim();
    if base.is_empty() {
        return Err("语音模型 Base URL 未配置".into());
    }
    if path.starts_with("http://") || path.starts_with("https://") {
        return Ok(path.to_string());
    }
    Ok(format!("{}/{}", base, path.trim_start_matches('/')))
}

fn voice_auth_headers(config: &Value) -> Result<reqwest::header::HeaderMap, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    let auth_type = config["authType"].as_str().unwrap_or("bearer");
    if auth_type == "none" {
        return Ok(headers);
    }
    let key = resolve_voice_api_key(config);
    if key.is_empty() {
        return Err("Voice API Key 未配置".into());
    }
    if auth_type == "header"
        && config["authHeader"].as_str().unwrap_or("Authorization") != "Authorization"
    {
        let name = reqwest::header::HeaderName::from_bytes(
            config["authHeader"].as_str().unwrap_or("").as_bytes(),
        )
        .map_err(|e| format!("语音鉴权 Header 无效: {e}"))?;
        let value = reqwest::header::HeaderValue::from_str(&key)
            .map_err(|e| format!("语音鉴权值无效: {e}"))?;
        headers.insert(name, value);
        return Ok(headers);
    }
    let value = reqwest::header::HeaderValue::from_str(&format!("Bearer {key}"))
        .map_err(|e| format!("语音鉴权值无效: {e}"))?;
    headers.insert(reqwest::header::AUTHORIZATION, value);
    Ok(headers)
}

fn voice_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .user_agent("SuperClaw-Voice")
        .build()
        .map_err(|e| e.to_string())
}

async fn voice_json_response(resp: reqwest::Response) -> Result<Value, String> {
    let status = resp.status();
    let text = resp.text().await.map_err(|e| reqwest_error_detail(&e))?;
    let parsed =
        serde_json::from_str::<Value>(&text).unwrap_or_else(|_| serde_json::json!({ "raw": text }));
    if !status.is_success() {
        let msg = parsed["error"]["message"]
            .as_str()
            .or_else(|| parsed["error"].as_str())
            .or_else(|| parsed["message"].as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
        return Err(msg);
    }
    Ok(parsed)
}

fn mime_from_voice_format(format: &str, fallback: &str) -> String {
    match format.to_ascii_lowercase().as_str() {
        "wav" => "audio/wav".into(),
        "opus" => "audio/opus".into(),
        "aac" => "audio/aac".into(),
        "flac" => "audio/flac".into(),
        "pcm" => "audio/pcm".into(),
        "mp3" => "audio/mpeg".into(),
        _ => fallback.into(),
    }
}

#[tauri::command]
pub fn hermes_voice_config_read() -> Result<Value, String> {
    Ok(mask_voice_config(read_voice_config_raw()))
}

#[tauri::command]
pub fn hermes_voice_config_write(config: Value) -> Result<Value, String> {
    let current = read_voice_config_raw();
    let next = normalize_voice_config(&config, Some(&current));
    let path = voice_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create Hermes voice config dir: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(&next)
        .map_err(|e| format!("Failed to serialize voice config: {e}"))?;
    std::fs::write(path, raw).map_err(|e| format!("Failed to write voice.json: {e}"))?;
    Ok(mask_voice_config(next))
}

#[tauri::command]
pub async fn hermes_voice_transcribe(
    audio_base64: String,
    mime_type: Option<String>,
    language: Option<String>,
) -> Result<Value, String> {
    use base64::Engine as _;
    let config = read_voice_config_raw();
    if !config["input"]["enabled"].as_bool().unwrap_or(false) {
        return Err("语音输入模型未启用".into());
    }
    if audio_base64.trim().is_empty() {
        return Err("没有收到录音内容".into());
    }
    let endpoint = voice_endpoint(&config, "input")?;
    let client = voice_http_client()?;
    let headers = voice_auth_headers(&config)?;
    if config["apiFormat"].as_str().unwrap_or("openai") == "json" {
        let payload = serde_json::json!({
            "model": config["input"]["model"].as_str().unwrap_or("whisper-1"),
            "audio": audio_base64,
            "mime_type": mime_type.clone().unwrap_or_else(|| "audio/webm".into()),
            "language": language.clone().unwrap_or_else(|| config["input"]["language"].as_str().unwrap_or("zh-CN").into())
        });
        let json = voice_json_response(
            client
                .post(endpoint)
                .headers(headers)
                .json(&payload)
                .send()
                .await
                .map_err(|e| reqwest_error_detail(&e))?,
        )
        .await?;
        let text = json["text"]
            .as_str()
            .or_else(|| json["transcription"].as_str())
            .or_else(|| json["result"]["text"].as_str())
            .or_else(|| json["data"]["text"].as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        return Ok(serde_json::json!({ "text": text }));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64.trim())
        .map_err(|e| format!("录音 base64 解码失败: {e}"))?;
    let mime = mime_type.unwrap_or_else(|| "audio/webm".into());
    let file_name = if mime.contains("mp4") {
        "speech.mp4"
    } else {
        "speech.webm"
    };
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(file_name.to_string())
        .mime_str(&mime)
        .map_err(|e| format!("录音 MIME 类型无效: {e}"))?;
    let mut form = reqwest::multipart::Form::new()
        .text(
            "model",
            config["input"]["model"]
                .as_str()
                .unwrap_or("whisper-1")
                .to_string(),
        )
        .part("file", part);
    let lang = language.unwrap_or_else(|| {
        config["input"]["language"]
            .as_str()
            .unwrap_or("zh-CN")
            .into()
    });
    if !lang.trim().is_empty() {
        form = form.text("language", lang);
    }
    let json = voice_json_response(
        client
            .post(endpoint)
            .headers(headers)
            .multipart(form)
            .send()
            .await
            .map_err(|e| reqwest_error_detail(&e))?,
    )
    .await?;
    let text = json["text"]
        .as_str()
        .or_else(|| json["transcription"].as_str())
        .or_else(|| json["result"]["text"].as_str())
        .or_else(|| json["data"]["text"].as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    Ok(serde_json::json!({ "text": text }))
}

#[tauri::command]
pub async fn hermes_voice_synthesize(
    text: String,
    voice: Option<String>,
    format: Option<String>,
) -> Result<Value, String> {
    use base64::Engine as _;
    let config = read_voice_config_raw();
    if !config["output"]["enabled"].as_bool().unwrap_or(false) {
        return Err("语音输出模型未启用".into());
    }
    let input = text.trim();
    if input.is_empty() {
        return Err("没有可朗读的文本".into());
    }
    let endpoint = voice_endpoint(&config, "output")?;
    let client = voice_http_client()?;
    let headers = voice_auth_headers(&config)?;
    let output_format =
        format.unwrap_or_else(|| config["output"]["format"].as_str().unwrap_or("mp3").into());
    let selected_voice =
        voice.unwrap_or_else(|| config["output"]["voice"].as_str().unwrap_or("alloy").into());
    let payload = if config["apiFormat"].as_str().unwrap_or("openai") == "json" {
        serde_json::json!({
            "model": config["output"]["model"].as_str().unwrap_or("tts-1"),
            "text": input,
            "input": input,
            "voice": selected_voice,
            "format": output_format
        })
    } else {
        serde_json::json!({
            "model": config["output"]["model"].as_str().unwrap_or("tts-1"),
            "input": input,
            "voice": selected_voice,
            "response_format": output_format
        })
    };
    let resp = client
        .post(endpoint)
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| reqwest_error_detail(&e))?;
    let status = resp.status();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if content_type.to_ascii_lowercase().starts_with("audio/") {
        if !status.is_success() {
            return Err(format!("HTTP {}", status.as_u16()));
        }
        let bytes = resp.bytes().await.map_err(|e| reqwest_error_detail(&e))?;
        return Ok(serde_json::json!({
            "audioBase64": base64::engine::general_purpose::STANDARD.encode(bytes),
            "mimeType": content_type.split(';').next().unwrap_or("audio/mpeg")
        }));
    }
    let json = voice_json_response(resp).await?;
    let audio = json["audioBase64"]
        .as_str()
        .or_else(|| json["audio"].as_str())
        .or_else(|| json["audio_base64"].as_str())
        .or_else(|| json["data"]["audioBase64"].as_str())
        .or_else(|| json["data"]["audio"].as_str())
        .unwrap_or("");
    let url = json["url"]
        .as_str()
        .or_else(|| json["audioUrl"].as_str())
        .or_else(|| json["audio_url"].as_str())
        .or_else(|| json["data"]["url"].as_str())
        .unwrap_or("");
    let mime = json["mimeType"]
        .as_str()
        .or_else(|| json["mime_type"].as_str())
        .or_else(|| json["data"]["mimeType"].as_str())
        .map(String::from)
        .unwrap_or_else(|| mime_from_voice_format(&output_format, "audio/mpeg"));
    Ok(serde_json::json!({ "audioBase64": audio, "url": url, "mimeType": mime }))
}

#[tauri::command]
pub fn hermes_env_reveal(key: String) -> Result<Value, String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Key cannot be empty".into());
    }
    let env_path = hermes_home().join(".env");
    let raw =
        std::fs::read_to_string(&env_path).map_err(|e| format!("Failed to read .env: {e}"))?;
    for (k, v, _) in parse_env_file_lines(&raw) {
        if k == key {
            return Ok(serde_json::json!({ "key": key, "value": v }));
        }
    }
    Err(format!("{key} not found in .env"))
}

fn hermes_dashboard_theme_name(raw: &str) -> String {
    let mut in_dashboard = false;
    for line in raw.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        let indent = line.len() - line.trim_start().len();
        if indent == 0 {
            in_dashboard = t == "dashboard:" || t.starts_with("dashboard:");
            if t.starts_with("dashboard:") && t != "dashboard:" {
                return t
                    .trim_start_matches("dashboard:")
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string();
            }
            continue;
        }
        if in_dashboard && t.starts_with("theme:") {
            return t
                .trim_start_matches("theme:")
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
        }
    }
    "default".into()
}

fn patch_dashboard_theme(raw: &str, name: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut in_dashboard = false;
    let mut dashboard_seen = false;
    let mut theme_written = false;
    for line in raw.lines() {
        let t = line.trim();
        let indent = line.len() - line.trim_start().len();
        if indent == 0 && !t.is_empty() && !t.starts_with('#') {
            if in_dashboard && !theme_written {
                out.push(format!("  theme: {name}"));
                theme_written = true;
            }
            in_dashboard = t == "dashboard:" || t.starts_with("dashboard:");
            if in_dashboard {
                dashboard_seen = true;
            }
        }
        if in_dashboard && indent > 0 && t.starts_with("theme:") {
            out.push(format!("{}theme: {name}", " ".repeat(indent)));
            theme_written = true;
            continue;
        }
        out.push(line.to_string());
    }
    if in_dashboard && !theme_written {
        out.push(format!("  theme: {name}"));
    }
    if !dashboard_seen {
        if out.last().map(|s| !s.is_empty()).unwrap_or(false) {
            out.push(String::new());
        }
        out.push("dashboard:".into());
        out.push(format!("  theme: {name}"));
    }
    let mut content = out.join("\n");
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content
}

#[tauri::command]
pub fn hermes_dashboard_themes() -> Result<Value, String> {
    let config_raw = std::fs::read_to_string(hermes_home().join("config.yaml")).unwrap_or_default();
    let active = hermes_dashboard_theme_name(&config_raw);
    let mut themes = vec![
        serde_json::json!({ "name": "default", "label": "Default", "description": "Hermes default dashboard theme" }),
        serde_json::json!({ "name": "midnight", "label": "Midnight", "description": "Dark blue dashboard theme" }),
        serde_json::json!({ "name": "ember", "label": "Ember", "description": "Warm dashboard theme" }),
        serde_json::json!({ "name": "mono", "label": "Mono", "description": "Monochrome dashboard theme" }),
        serde_json::json!({ "name": "cyberpunk", "label": "Cyberpunk", "description": "Neon dashboard theme" }),
        serde_json::json!({ "name": "rose", "label": "Rose", "description": "Soft rose dashboard theme" }),
    ];
    let dir = hermes_home().join("dashboard-themes");
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let ext_ok = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("yaml") || s.eq_ignore_ascii_case("yml"))
                .unwrap_or(false);
            if !ext_ok {
                continue;
            }
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                themes.push(serde_json::json!({
                    "name": name,
                    "label": name,
                    "description": "User dashboard theme",
                }));
            }
        }
    }
    Ok(serde_json::json!({ "themes": themes, "active": active }))
}

#[tauri::command]
pub fn hermes_dashboard_theme_set(name: String) -> Result<Value, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Theme name cannot be empty".into());
    }
    let path = hermes_home().join("config.yaml");
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    std::fs::write(&path, patch_dashboard_theme(&raw, &name))
        .map_err(|e| format!("Failed to write config.yaml: {e}"))?;
    Ok(serde_json::json!({ "ok": true, "theme": name }))
}

fn scan_dashboard_plugins() -> Vec<Value> {
    let mut plugins = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    let roots = [hermes_home().join("plugins")];
    for root in roots {
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.flatten() {
                let dir = entry.path();
                if !dir.is_dir() {
                    continue;
                }
                let manifest = dir.join("dashboard").join("manifest.json");
                if !manifest.exists() {
                    continue;
                }
                let raw = match std::fs::read_to_string(&manifest) {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                let data: Value = match serde_json::from_str(&raw) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let name = data
                    .get("name")
                    .and_then(|v| v.as_str())
                    .or_else(|| dir.file_name().and_then(|s| s.to_str()))
                    .unwrap_or("");
                if name.is_empty() || !seen.insert(name.to_string()) {
                    continue;
                }
                let tab = data.get("tab").cloned().unwrap_or_else(
                    || serde_json::json!({ "path": format!("/{name}"), "position": "end" }),
                );
                plugins.push(serde_json::json!({
                    "name": name,
                    "label": data.get("label").and_then(|v| v.as_str()).unwrap_or(name),
                    "description": data.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                    "icon": data.get("icon").and_then(|v| v.as_str()).unwrap_or("Puzzle"),
                    "version": data.get("version").and_then(|v| v.as_str()).unwrap_or("0.0.0"),
                    "tab": tab,
                    "slots": data.get("slots").cloned().unwrap_or_else(|| serde_json::json!([])),
                    "entry": data.get("entry").and_then(|v| v.as_str()).unwrap_or("dist/index.js"),
                    "css": data.get("css").cloned().unwrap_or(Value::Null),
                    "has_api": data.get("api").is_some(),
                    "source": "user",
                }));
            }
        }
    }
    plugins
}

#[tauri::command]
pub fn hermes_dashboard_plugins() -> Result<Value, String> {
    Ok(Value::Array(scan_dashboard_plugins()))
}

#[tauri::command]
pub fn hermes_dashboard_plugins_rescan() -> Result<Value, String> {
    let plugins = scan_dashboard_plugins();
    Ok(serde_json::json!({ "ok": true, "count": plugins.len() }))
}

/// Hermes 内置工具集（configurable toolsets），来自 hermes_cli/tools_config.py
/// 当 `hermes tools list --platform cli` CLI 调用失败时作为回退数据源。
const BUILTIN_TOOLSETS: &[(&str, &str)] = &[
    ("web", "🔍 网页搜索与内容抓取"),
    ("browser", "🌐 浏览器自动化操作"),
    ("terminal", "💻 终端与进程管理"),
    ("file", "📁 文件读写与搜索"),
    ("code_execution", "⚡ 代码执行环境"),
    ("vision", "👁️ 图片识别与视觉分析"),
    ("video", "🎬 视频内容分析"),
    ("video_gen", "🎬 视频生成"),
    ("x_search", "🐦 X / Twitter 搜索"),
    ("moa", "🧠 多智能体协作"),
    ("tts", "🔊 文字转语音"),
    ("skills", "📚 技能查看与管理"),
    ("skills_hub", "📦 技能搜索与下载"),
    ("todo", "📋 任务规划与清单"),
    ("memory", "💾 长期记忆"),
    ("session_search", "🔎 会话搜索"),
    ("clarify", "❓ 澄清问题"),
    ("delegation", "👥 任务委派"),
    ("cronjob", "⏰ 定时任务"),
    ("messaging", "📨 跨平台消息"),
    ("homeassistant", "🏠 智能家居"),
    ("spotify", "🎵 Spotify"),
    ("discord", "💬 Discord 读取与参与"),
    ("discord_admin", "🛡️ Discord 服务器管理"),
    ("yuanbao", "🤖 Yuanbao"),
    ("computer_use", "🖱️ 电脑操作（macOS）"),
];

/// 新安装时默认关闭的工具集（来自 hermes _DEFAULT_OFF_TOOLSETS）
const DEFAULT_OFF_TOOLSETS: &[&str] = &[
    "moa",
    "homeassistant",
    "spotify",
    "discord",
    "discord_admin",
    "video",
    "video_gen",
    "x_search",
];

#[tauri::command]
pub fn hermes_toolsets_list() -> Result<Value, String> {
    // 1) 优先尝试 CLI
    let output = run_silent("hermes", &["tools", "list", "--platform", "cli"]).unwrap_or_default();
    if !output.is_empty() {
        return Ok(serde_json::json!({ "raw": output }));
    }

    // 2) CLI 失败，回退到内置工具集列表
    let off: HashSet<&str> = DEFAULT_OFF_TOOLSETS.iter().copied().collect();
    let mut fallback = String::from("Built-in toolsets (cli):\n");
    for (name, desc) in BUILTIN_TOOLSETS {
        let enabled = !off.contains(name);
        let status = if enabled {
            "✓ enabled"
        } else {
            "✗ disabled"
        };
        fallback.push_str(&format!("  {status}  {name}  {desc}\n"));
    }
    fallback.push_str("Search backends:\n");
    fallback.push_str("  ✓ enabled   duckduckgo  No API key required\n");
    fallback.push_str("  ✗ disabled  exa  API key required\n");
    fallback.push_str("  ✗ disabled  firecrawl  API key required\n");
    fallback.push_str("  ✗ disabled  perplexity  API key required\n");
    fallback.push_str("  ✗ disabled  searxng  endpoint not configured\n");
    fallback.push_str("  ✗ disabled  tavily  API key required\n");
    Ok(serde_json::json!({ "raw": fallback }))
}

#[tauri::command]
pub fn hermes_cron_jobs_list() -> Result<Value, String> {
    let path = hermes_home().join("cron").join("jobs.json");
    if !path.exists() {
        return Ok(Value::Array(Vec::new()));
    }
    let raw =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read cron jobs: {e}"))?;
    serde_json::from_str::<Value>(&raw).map_err(|e| format!("Failed to parse cron jobs: {e}"))
}

// ============================================================================
// Skills — install from URL or local zip file
// ============================================================================

/// Install a Hermes skill from a URL-downloaded zip or a base64-encoded zip.
///
/// * `source_type` — `"url"` or `"zip"`
/// * `source_data` — the URL string or base64-encoded zip bytes
///
/// Returns the updated skills list (same shape as `hermes_skills_list`).
#[tauri::command]
pub async fn hermes_skill_install(
    source_type: String,
    source_data: String,
) -> Result<Value, String> {
    let source_type = source_type.trim().to_ascii_lowercase();
    if source_type == "online" && !is_likely_skill_zip_url(&source_data) {
        install_hermes_skill_online(&source_data, false)?;
        return hermes_skills_list().await;
    }

    let zip_bytes = match source_type.as_str() {
        "online" => {
            if !is_likely_skill_zip_url(&source_data) {
                install_hermes_skill_online(&source_data, false)?;
                return hermes_skills_list().await;
            }
            download_skill_zip_bytes(&source_data).await?
        }
        "url" => {
            if !source_data.trim().starts_with("http://")
                && !source_data.trim().starts_with("https://")
            {
                install_hermes_skill_online(&source_data, false)?;
                return hermes_skills_list().await;
            }
            if !is_likely_skill_zip_url(&source_data) {
                install_hermes_skill_online(&source_data, false)?;
                return hermes_skills_list().await;
            }
            download_skill_zip_bytes(&source_data).await?
        }
        "zip" => {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD
                .decode(&source_data)
                .map_err(|e| format!("Base64 解码失败: {e}"))?
        }
        _ => return Err(format!("不支持的 source_type: {source_type}")),
    };

    let skills_dir = hermes_home().join("skills");
    std::fs::create_dir_all(&skills_dir).map_err(|e| format!("创建 skills 目录失败: {e}"))?;

    extract_zip_to_skills(&zip_bytes, &skills_dir)?;

    // Return updated skills list
    hermes_skills_list().await
}

async fn download_skill_zip_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client =
        super::build_http_client(std::time::Duration::from_secs(120), Some("SuperClaw/1.0"))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载失败: HTTP {}", resp.status()));
    }
    resp.bytes()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))
        .map(|b| b.to_vec())
}

fn clean_hermes_cli_text(text: &str) -> String {
    let re = regex::Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]").ok();
    let stripped = re
        .as_ref()
        .map(|r| r.replace_all(text, "").into_owned())
        .unwrap_or_else(|| text.to_string());
    stripped.replace('\r', "").trim().to_string()
}

fn decode_url_segment(value: &str) -> String {
    urlencoding::decode(value)
        .map(|v| v.into_owned())
        .unwrap_or_else(|_| value.to_string())
}

fn github_skill_url_to_identifier(raw: &str) -> Option<String> {
    let url = reqwest::Url::parse(raw).ok()?;
    let host = url.host_str()?.to_ascii_lowercase();
    if host != "github.com" && host != "www.github.com" {
        return None;
    }
    let mut parts: Vec<String> = url
        .path_segments()?
        .filter(|s| !s.is_empty())
        .map(decode_url_segment)
        .collect();
    if parts.len() < 5 {
        return None;
    }
    let marker = parts.get(2)?.to_ascii_lowercase();
    if marker != "tree" && marker != "blob" {
        return None;
    }
    let owner = parts.remove(0);
    let repo = parts.remove(0);
    // Drop "tree|blob" and branch name.
    parts.drain(0..2);
    if parts
        .last()
        .map(|s| s.eq_ignore_ascii_case("SKILL.md"))
        .unwrap_or(false)
    {
        parts.pop();
    }
    if parts.is_empty() {
        return None;
    }
    Some(format!("{owner}/{repo}/{}", parts.join("/")))
}

fn normalize_hermes_skill_install_spec(raw: &str) -> Result<String, String> {
    let input = raw.trim();
    if input.is_empty() {
        return Err("请输入 skill 标识、GitHub 链接、SKILL.md 链接或 ZIP 链接".into());
    }
    if input.starts_with("http://") || input.starts_with("https://") {
        return Ok(github_skill_url_to_identifier(input).unwrap_or_else(|| input.to_string()));
    }
    let normalized = input
        .strip_prefix("github:")
        .unwrap_or(input)
        .replace("skills.sh/", "skills-sh/");
    Ok(normalized)
}

fn is_likely_skill_zip_url(raw: &str) -> bool {
    reqwest::Url::parse(raw)
        .ok()
        .map(|url| {
            let lower =
                format!("{}?{}", url.path(), url.query().unwrap_or("")).to_ascii_lowercase();
            lower.contains(".zip")
        })
        .unwrap_or(false)
}

fn install_hermes_skill_online(identifier: &str, force: bool) -> Result<(), String> {
    let spec = normalize_hermes_skill_install_spec(identifier)?;
    patch_uv_tool_pyvenv_cfgs();
    let mut args = vec!["skills", "install", spec.as_str(), "--yes"];
    if force {
        args.push("--force");
    }
    run_silent("hermes", &args).map(|_| ()).map_err(|e| {
        let detail = clean_hermes_cli_text(&e);
        if detail.is_empty() {
            "Hermes 在线安装 skill 失败".to_string()
        } else {
            detail
        }
    })
}

/// Extract a zip archive into the skills directory.
/// Automatically strips a single root directory from zip entries if present.
fn extract_zip_to_skills(zip_bytes: &[u8], skills_dir: &Path) -> Result<(), String> {
    use std::io::Cursor;
    use zip::ZipArchive;

    let reader = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(reader).map_err(|e| format!("打开 zip 失败: {e}"))?;

    // Collect filenames to detect single root dir
    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index_raw(i).ok().map(|f| f.name().to_string()))
        .collect();
    if !names.iter().any(|name| {
        name.split('/')
            .last()
            .map(|leaf| leaf == "SKILL.md")
            .unwrap_or(false)
    }) {
        return Err("这不是有效 Hermes skill 包：ZIP 中未找到 SKILL.md".into());
    }
    let strip_prefix = detect_single_root_dir(&names);

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取 zip 条目失败: {e}"))?;

        let raw_name = file.name().to_string();

        // Path traversal prevention
        if raw_name.contains("..") || raw_name.starts_with('/') {
            continue;
        }

        // Strip single root directory
        let relative = if let Some(ref prefix) = strip_prefix {
            match raw_name.strip_prefix(prefix.as_str()) {
                Some(rest) if !rest.is_empty() => rest.to_string(),
                _ => continue,
            }
        } else {
            raw_name.clone()
        };

        if relative.is_empty() || relative.starts_with('/') || relative.contains("..") {
            continue;
        }

        let out_path = skills_dir.join(&relative);

        if file.is_dir() {
            let _ = std::fs::create_dir_all(&out_path);
        } else {
            if let Some(parent) = out_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("创建文件失败 {relative}: {e}"))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("写入文件失败 {relative}: {e}"))?;
        }
    }

    Ok(())
}

/// Detect whether all zip entries share a single root directory.
/// If so, returns the prefix (e.g. `"my-skill/"`) to strip during extraction.
fn detect_single_root_dir(names: &[String]) -> Option<String> {
    let mut root: Option<String> = None;
    for name in names {
        let first_segment = name.split('/').next().unwrap_or("");
        if first_segment.is_empty() {
            continue;
        }
        match &root {
            None => root = Some(format!("{}/", first_segment)),
            Some(existing) => {
                if !name.starts_with(existing.as_str()) {
                    return None;
                }
            }
        }
    }
    root
}

// ============================================================================
// Unit tests for the pure YAML helpers (no filesystem I/O).
// ============================================================================

#[cfg(test)]
mod guardian_tests {
    use super::{config_has_api_server_enabled, patch_yaml_ensure_api_server};

    #[test]
    fn detects_enabled_variants() {
        let yaml = "\
model:
  default: MiniMax-M3
platforms:
  api_server:
    enabled: true
";
        assert!(config_has_api_server_enabled(yaml));

        for v in ["true", "True", "TRUE", "yes", "on", "1"] {
            let y = format!("platforms:\n  api_server:\n    enabled: {v}\n");
            assert!(
                config_has_api_server_enabled(&y),
                "expected {v} to count as enabled"
            );
        }
    }

    #[test]
    fn detects_missing_or_disabled() {
        assert!(!config_has_api_server_enabled("model:\n  default: foo\n"));
        assert!(!config_has_api_server_enabled(
            "platforms:\n  other:\n    enabled: true\n"
        ));
        assert!(!config_has_api_server_enabled(
            "platforms:\n  api_server:\n    enabled: false\n"
        ));
        assert!(!config_has_api_server_enabled(
            "platforms:\n  api_server:\n    something: else\n"
        ));
    }

    #[test]
    fn ignores_commented_enabled() {
        let yaml = "platforms:\n  api_server:\n    # enabled: true\n";
        assert!(!config_has_api_server_enabled(yaml));
    }

    #[test]
    fn patch_is_noop_when_already_enabled() {
        let yaml = "\
model:
  default: x
platforms:
  api_server:
    enabled: true
";
        assert_eq!(patch_yaml_ensure_api_server(yaml), yaml);
    }

    #[test]
    fn patch_appends_when_no_platforms() {
        let yaml = "model:\n  default: x\n";
        let patched = patch_yaml_ensure_api_server(yaml);
        assert!(config_has_api_server_enabled(&patched));
        assert!(patched.contains("model:"));
        assert!(patched.contains("default: x"));
    }

    #[test]
    fn patch_injects_under_existing_platforms() {
        let yaml = "\
platforms:
  other:
    enabled: true
terminal:
  backend: local
";
        let patched = patch_yaml_ensure_api_server(yaml);
        assert!(config_has_api_server_enabled(&patched));
        assert!(patched.contains("other:"));
        assert!(patched.contains("terminal:"));
        assert!(patched.contains("backend: local"));
    }

    #[test]
    fn patch_replaces_disabled_api_server() {
        let yaml = "\
platforms:
  api_server:
    enabled: false
    extra: keepme
  other:
    enabled: true
";
        let patched = patch_yaml_ensure_api_server(yaml);
        assert!(config_has_api_server_enabled(&patched));
        assert!(patched.contains("other:"));
        assert!(
            !patched.contains("enabled: false"),
            "disabled marker should have been removed"
        );
    }
}
