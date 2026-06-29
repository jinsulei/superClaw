use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

static CLAUDE_PANEL_CHILD: LazyLock<Mutex<Option<Child>>> = LazyLock::new(|| Mutex::new(None));

const CLAUDE_PANEL_PORT: u16 = 3020;
const NATIVE_CLAUDE_WINDOW_TITLE: &str = "SuperClaw Claude Code Native";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn resources_dir() -> Result<PathBuf, String> {
    super::app_resources_dir().ok_or_else(|| "SuperClaw resources dir was not found".to_string())
}

fn claude_cli_path(resources: &Path) -> PathBuf {
    let file_name = if cfg!(target_os = "windows") {
        "claude.exe"
    } else {
        "claude"
    };
    resources
        .join("runtime")
        .join("claude-code")
        .join("bin")
        .join(file_name)
}

fn claude_home_path(resources: &Path) -> PathBuf {
    resources.join("data").join("claude-code").join("home")
}

fn claude_projects_path(resources: &Path) -> PathBuf {
    resources.join("data").join("claude-code").join("projects")
}

fn claude_panel_dir(resources: &Path) -> PathBuf {
    resources.join("runtime").join("claude-panel")
}

fn claude_panel_server(resources: &Path) -> PathBuf {
    claude_panel_dir(resources).join("server.js")
}

fn claude_panel_data_dir(resources: &Path) -> PathBuf {
    resources.join("data").join("claude-panel")
}

fn hermes_env_path(resources: &Path) -> PathBuf {
    resources.join("data").join("hermes").join(".env")
}

fn claude_relay_config_path(resources: &Path) -> PathBuf {
    claude_panel_data_dir(resources).join("relay-config.json")
}

fn panel_config_path(resources: &Path) -> PathBuf {
    resources
        .join("data")
        .join(".openclaw")
        .join("clawpanel.json")
}

fn bundled_node_path(resources: &Path) -> PathBuf {
    let file_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    resources.join("runtime").join("openclaw").join(file_name)
}

fn read_env_file(path: &Path) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Ok(text) = fs::read_to_string(path) else {
        return out;
    };
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        let value = value
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        out.insert(key.to_string(), value);
    }
    out
}

fn claude_relay_env(resources: &Path) -> Option<(String, String, String)> {
    let config = fs::read_to_string(claude_relay_config_path(resources)).ok()?;
    let value: Value = serde_json::from_str(&config).ok()?;
    if value
        .get("enabled")
        .and_then(|item| item.as_bool())
        .is_some_and(|enabled| !enabled)
    {
        return None;
    }
    let key = value
        .get("apiKey")
        .and_then(|item| item.as_str())
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty() && !item.contains("${"))?;
    let base = value
        .get("baseUrl")
        .and_then(|item| item.as_str())
        .map(|item| item.trim().trim_end_matches('/').to_string())
        .filter(|item| !item.is_empty() && !item.contains("${"))?;
    let model = value
        .get("model")
        .and_then(|item| item.as_str())
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| "MiniMax-M3".to_string());
    Some((key, base, model))
}

fn claude_compatible_minimax_env(resources: &Path) -> Option<(String, String, String)> {
    if let Some(relay) = claude_relay_env(resources) {
        return Some(relay);
    }
    let env = read_env_file(&hermes_env_path(resources));
    let key = env
        .get("MINIMAX_API_KEY")
        .or_else(|| env.get("MINIMAX_CN_API_KEY"))
        .cloned()
        .filter(|v| !v.trim().is_empty() && !v.contains("${"))?;
    let base = env
        .get("MINIMAX_BASE_URL")
        .or_else(|| env.get("MINIMAX_CN_BASE_URL"))
        .cloned()
        .filter(|v| !v.trim().is_empty() && !v.contains("${"))?;
    let model = env
        .get("OPENAI_MODEL")
        .cloned()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "MiniMax-M3".to_string());
    Some((key, base, model))
}

fn apply_minimax_env(cmd: &mut Command, resources: &Path) {
    if let Some((key, base, model)) = claude_compatible_minimax_env(resources) {
        cmd.env("MINIMAX_API_KEY", &key)
            .env("MINIMAX_BASE_URL", &base)
            .env("ANTHROPIC_API_KEY", &key)
            .env("ANTHROPIC_AUTH_TOKEN", &key)
            .env("ANTHROPIC_BASE_URL", &base)
            .env("ANTHROPIC_MODEL", &model)
            .env("ANTHROPIC_DEFAULT_HAIKU_MODEL", &model)
            .env("ANTHROPIC_DEFAULT_SONNET_MODEL", &model)
            .env("ANTHROPIC_DEFAULT_OPUS_MODEL", &model);
    }
}

fn panel_url() -> String {
    format!("http://127.0.0.1:{}/", CLAUDE_PANEL_PORT)
}

fn panel_status_url() -> String {
    format!("http://127.0.0.1:{}/api/status", CLAUDE_PANEL_PORT)
}

fn ensure_portable_dirs(home: &Path, projects: &Path) -> Result<(), String> {
    fs::create_dir_all(home).map_err(|e| e.to_string())?;
    fs::create_dir_all(projects).map_err(|e| e.to_string())?;
    fs::create_dir_all(home.join("AppData").join("Roaming")).map_err(|e| e.to_string())?;
    fs::create_dir_all(home.join("AppData").join("Local")).map_err(|e| e.to_string())?;
    fs::create_dir_all(home.join(".claude")).map_err(|e| e.to_string())?;
    Ok(())
}

fn apply_portable_env(cmd: &mut Command, resources: &Path, home: &Path, projects: &Path) {
    cmd.env("HOME", home)
        .env("USERPROFILE", home)
        .env("APPDATA", home.join("AppData").join("Roaming"))
        .env("LOCALAPPDATA", home.join("AppData").join("Local"))
        .env("CLAUDE_CONFIG_DIR", home.join("claude-config"))
        .env("CLAUDE_CODE_PROJECTS_DIR", projects)
        .env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1")
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .stdout(Stdio::piped());
    apply_minimax_env(cmd, resources);
}

#[cfg(target_os = "windows")]
fn hide_console_window(cmd: &mut Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(_cmd: &mut Command) {}

fn panel_status_ready(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    let request = format!(
        "GET /api/status HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut buf = String::new();
    if stream.read_to_string(&mut buf).is_err() {
        return false;
    }
    buf.starts_with("HTTP/1.1 200") || buf.starts_with("HTTP/1.0 200")
}

fn wait_for_panel(port: u16) -> bool {
    for _ in 0..40 {
        if panel_status_ready(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

fn apply_panel_env(cmd: &mut Command, resources: &Path, home: &Path, projects: &Path) {
    let data_dir = claude_panel_data_dir(resources);
    let appdata = home.join("AppData").join("Roaming");
    let localappdata = home.join("AppData").join("Local");
    let claude_bin = claude_cli_path(resources)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| resources.to_path_buf());
    let path_env = std::env::var("PATH").unwrap_or_default();
    let next_path = format!(
        "{}{}{}",
        claude_bin.display(),
        if cfg!(target_os = "windows") {
            ";"
        } else {
            ":"
        },
        path_env
    );

    cmd.env("PORT", CLAUDE_PANEL_PORT.to_string())
        .env("CLEAN_PANEL_HOME_DIR", home)
        .env("CLEAN_PANEL_DATA_DIR", &data_dir)
        .env(
            "CLEAN_PANEL_CLAUDE_SETTINGS_PATH",
            home.join(".claude").join("settings.json"),
        )
        .env(
            "CLEAN_PANEL_CLAUDE_PROJECTS_JSON_PATH",
            home.join(".claude.json"),
        )
        .env(
            "CLEAN_PANEL_CLAUDE_SKILLS_DIR",
            home.join(".claude").join("skills"),
        )
        .env("CLEAN_PANEL_RELAY_CONFIG_ENABLED", "1")
        .env("CLAUDE_CLI_PATH", claude_cli_path(resources))
        .env("CLAUDE_CONFIG_DIR", home.join("claude-config"))
        .env("CLAUDE_CODE_PROJECTS_DIR", projects)
        .env("SUPERCLAW_PANEL_CONFIG_PATH", panel_config_path(resources))
        .env("HOME", home)
        .env("USERPROFILE", home)
        .env("APPDATA", appdata)
        .env("LOCALAPPDATA", localappdata)
        .env("PATH", next_path)
        .stdin(Stdio::null());
    apply_minimax_env(cmd, resources);
}

fn panel_running_info(resources: &Path) -> Value {
    let server = claude_panel_server(resources);
    let status_ready = panel_status_ready(CLAUDE_PANEL_PORT);
    json!({
        "installed": server.is_file(),
        "running": status_ready,
        "statusOk": status_ready,
        "url": panel_url(),
        "statusUrl": panel_status_url(),
        "server": server,
        "dataDir": claude_panel_data_dir(resources)
    })
}

fn read_claude_version(claude: &Path, home: &Path, projects: &Path) -> (Option<String>, String) {
    if !claude.is_file() {
        return (None, "Claude Code CLI file is missing".to_string());
    }

    let mut cmd = Command::new(claude);
    cmd.arg("--version")
        .current_dir(projects.parent().unwrap_or(projects));
    let Ok(resources) = resources_dir() else {
        return (None, "SuperClaw resources dir was not found".to_string());
    };
    apply_portable_env(&mut cmd, &resources, home, projects);
    hide_console_window(&mut cmd);

    match cmd.output() {
        Ok(output) => {
            let text = String::from_utf8_lossy(if output.stdout.is_empty() {
                &output.stderr
            } else {
                &output.stdout
            })
            .trim()
            .to_string();
            if output.status.success() {
                (Some(text), String::new())
            } else {
                (None, text)
            }
        }
        Err(err) => (None, err.to_string()),
    }
}

fn status_impl() -> Result<Value, String> {
    let resources = resources_dir()?;
    let claude = claude_cli_path(&resources);
    let home = claude_home_path(&resources);
    let projects = claude_projects_path(&resources);
    ensure_portable_dirs(&home, &projects)?;
    let (version, error) = read_claude_version(&claude, &home, &projects);
    let panel = panel_running_info(&resources);
    let panel_installed = claude_panel_server(&resources).is_file();
    let panel_running = panel
        .get("running")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let cli_installed = claude.is_file();
    let connected = version.is_some() || (panel_installed && panel_running);

    Ok(json!({
        "installed": cli_installed || panel_installed,
        "connected": connected,
        "running": panel_running,
        "mode": "panel",
        "runtimeMode": "OPENAI_RELAY",
        "needsPanel": true,
        "message": "Claude Code panel relay is available through the portable clean-claude-panel runtime.",
        "panelUrl": panel_url(),
        "url": panel_url(),
        "version": version.or_else(|| panel_installed.then(|| "Claude Code Panel relay".to_string())),
        "versionError": if cli_installed { error } else { String::new() },
        "paths": {
            "resources": resources,
            "claude": claude,
            "homeDir": home,
            "projectsDir": projects
        },
        "panel": panel
    }))
}

fn start_cli_impl() -> Result<Value, String> {
    let resources = resources_dir()?;
    let home = claude_home_path(&resources);
    let projects = claude_projects_path(&resources);
    ensure_portable_dirs(&home, &projects)?;
    fs::create_dir_all(claude_panel_data_dir(&resources)).map_err(|e| e.to_string())?;

    let status = status_impl()?;
    let panel = status.get("panel").cloned().unwrap_or_else(|| json!({}));
    if panel
        .get("running")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return Ok(json!({
            "started": false,
            "reused": true,
            "mode": "panel",
            "panelUrl": panel_url(),
            "url": panel_url(),
            "message": "Claude Code panel is already running.",
            "status": status
        }));
    }

    let server = claude_panel_server(&resources);
    if !server.is_file() {
        return Err(format!("Claude Code 面板资源缺失：{}", server.display()));
    }
    let node = bundled_node_path(&resources);
    let node_cmd = if node.is_file() {
        node
    } else {
        PathBuf::from("node")
    };
    let log_dir = claude_panel_data_dir(&resources);
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let stdout = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("panel.log"))
        .map_err(|e| e.to_string())?;
    let stderr = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("panel.err.log"))
        .map_err(|e| e.to_string())?;

    let panel_cwd = claude_panel_dir(&resources);
    let node_cmd_display = node_cmd.display().to_string();
    let mut cmd = Command::new(&node_cmd);
    cmd.arg(&server)
        .current_dir(&panel_cwd)
        .stdout(stdout)
        .stderr(stderr);
    apply_panel_env(&mut cmd, &resources, &home, &projects);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd
        .spawn()
        .map_err(|e| format!("启动 Claude Code 面板失败：{e}"))?;
    let child_pid = child.id();
    crate::agent_lifecycle::register_managed_agent(
        crate::agent_lifecycle::ManagedAgent::ClaudeCode,
        child_pid,
        panel_cwd.display().to_string(),
        node_cmd_display,
        Some(CLAUDE_PANEL_PORT),
    );
    if let Ok(mut slot) = CLAUDE_PANEL_CHILD.lock() {
        *slot = Some(child);
    }
    if !wait_for_panel(CLAUDE_PANEL_PORT) {
        return Err(format!(
            "Claude Code 面板启动超时，请查看 {}",
            log_dir.join("panel.err.log").display()
        ));
    }

    Ok(json!({
        "started": true,
        "reused": false,
        "mode": "panel",
        "panelUrl": panel_url(),
        "url": panel_url(),
        "message": "Claude Code panel started.",
        "status": status_impl()?
    }))
}

fn quote_cmd(value: &Path) -> String {
    format!("\"{}\"", value.display().to_string().replace('"', "\"\""))
}

#[cfg(target_os = "windows")]
fn write_native_launcher(
    resources: &Path,
    home: &Path,
    projects: &Path,
    run_cwd: &Path,
    claude: &Path,
) -> Result<PathBuf, String> {
    let appdata = home.join("AppData").join("Roaming");
    let localappdata = home.join("AppData").join("Local");
    let config_dir = home.join("claude-config");
    let launcher = home.join("run-claude-native.cmd");
    let claude_dir = claude.parent().unwrap_or_else(|| Path::new(""));
    let minimax_env = claude_compatible_minimax_env(resources);
    let lines = vec![
        "@echo off".to_string(),
        "chcp 65001 >nul".to_string(),
        format!("title {}", NATIVE_CLAUDE_WINDOW_TITLE),
        format!("cd /d {}", quote_cmd(run_cwd)),
        format!("set \"HOME={}\"", home.display()),
        format!("set \"USERPROFILE={}\"", home.display()),
        format!("set \"APPDATA={}\"", appdata.display()),
        format!("set \"LOCALAPPDATA={}\"", localappdata.display()),
        format!("set \"CLAUDE_CONFIG_DIR={}\"", config_dir.display()),
        format!("set \"CLAUDE_CODE_PROJECTS_DIR={}\"", projects.display()),
        "set \"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1\"".to_string(),
        minimax_env
            .as_ref()
            .map(|(key, _, _)| format!("set \"{}={}\"", "MINIMAX_API_KEY", key))
            .unwrap_or_else(|| "rem MINIMAX_API_KEY not configured".to_string()),
        minimax_env
            .as_ref()
            .map(|(_, base, _)| format!("set \"{}={}\"", "MINIMAX_BASE_URL", base))
            .unwrap_or_else(|| "rem MINIMAX_BASE_URL not configured".to_string()),
        minimax_env
            .as_ref()
            .map(|(key, _, _)| format!("set \"ANTHROPIC_API_KEY={}\"", key))
            .unwrap_or_else(|| "rem ANTHROPIC_API_KEY not configured".to_string()),
        minimax_env
            .as_ref()
            .map(|(key, _, _)| format!("set \"ANTHROPIC_AUTH_TOKEN={}\"", key))
            .unwrap_or_else(|| "rem ANTHROPIC_AUTH_TOKEN not configured".to_string()),
        minimax_env
            .as_ref()
            .map(|(_, base, _)| format!("set \"ANTHROPIC_BASE_URL={}\"", base))
            .unwrap_or_else(|| "rem ANTHROPIC_BASE_URL not configured".to_string()),
        minimax_env
            .as_ref()
            .map(|(_, _, model)| format!("set \"ANTHROPIC_MODEL={}\"", model))
            .unwrap_or_else(|| "rem ANTHROPIC_MODEL not configured".to_string()),
        format!("set \"PATH={};%PATH%\"", claude_dir.display()),
        quote_cmd(claude),
    ];
    fs::write(&launcher, lines.join("\r\n")).map_err(|e| e.to_string())?;
    Ok(launcher)
}

fn native_cwd(cwd: Option<String>, fallback: &Path) -> PathBuf {
    cwd.as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .and_then(|path| {
            let resolved = if path.is_absolute() {
                path
            } else {
                std::env::current_dir().ok()?.join(path)
            };
            if resolved.is_dir() {
                Some(resolved)
            } else {
                None
            }
        })
        .unwrap_or_else(|| fallback.to_path_buf())
}

fn start_native_impl(cwd: Option<String>) -> Result<Value, String> {
    let resources = resources_dir()?;
    let home = claude_home_path(&resources);
    let projects = claude_projects_path(&resources);
    ensure_portable_dirs(&home, &projects)?;

    let claude = claude_cli_path(&resources);
    if !claude.is_file() {
        return Err(format!("Claude Code CLI 缺失：{}", claude.display()));
    }

    let run_cwd = native_cwd(cwd, &projects);

    #[cfg(target_os = "windows")]
    let launcher_path: Option<PathBuf>;
    #[cfg(not(target_os = "windows"))]
    let launcher_path: Option<PathBuf> = None;

    #[cfg(target_os = "windows")]
    {
        let launcher = write_native_launcher(&resources, &home, &projects, &run_cwd, &claude)?;
        let mut cmd = Command::new("cmd.exe");
        cmd.args(["/d", "/c", "start", "", "cmd.exe", "/k"])
            .arg(&launcher)
            .current_dir(&run_cwd)
            .env("HOME", &home)
            .env("USERPROFILE", &home)
            .env("APPDATA", home.join("AppData").join("Roaming"))
            .env("LOCALAPPDATA", home.join("AppData").join("Local"))
            .env("CLAUDE_CONFIG_DIR", home.join("claude-config"))
            .env("CLAUDE_CODE_PROJECTS_DIR", &projects)
            .env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");
        apply_minimax_env(&mut cmd, &resources);
        launcher_path = Some(launcher);
        cmd.spawn()
            .map_err(|e| format!("启动 Claude Code 原生终端失败：{e}"))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new(&claude);
        cmd.current_dir(&run_cwd);
        apply_portable_env(&mut cmd, &resources, &home, &projects);
        cmd.spawn()
            .map_err(|e| format!("启动 Claude Code 原生终端失败：{e}"))?;
    }

    Ok(json!({
        "ok": true,
        "started": true,
        "mode": "native",
        "message": "Claude Code 原生终端已启动。",
        "cwd": run_cwd,
        "command": claude,
        "launcher": launcher_path,
        "windowTitle": NATIVE_CLAUDE_WINDOW_TITLE,
        "status": status_impl()?
    }))
}

#[tauri::command]
pub async fn claude_code_start() -> Result<Value, String> {
    start_cli_impl()
}

#[tauri::command]
pub async fn claude_code_native_start(cwd: Option<String>) -> Result<Value, String> {
    start_native_impl(cwd)
}

#[tauri::command]
pub async fn claude_code_stop() -> Result<Value, String> {
    if let Ok(mut slot) = CLAUDE_PANEL_CHILD.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
        }
    }
    Ok(json!({
        "stopped": true,
        "mode": "panel",
        "message": "Claude Code panel process was stopped if it was started by SuperClaw."
    }))
}

#[tauri::command]
pub async fn claude_code_native_stop() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("taskkill.exe");
        cmd.args([
            "/F",
            "/T",
            "/FI",
            &format!("WINDOWTITLE eq {}*", NATIVE_CLAUDE_WINDOW_TITLE),
        ]);
        hide_console_window(&mut cmd);
        let output = cmd.output().map_err(|e| e.to_string())?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
        .trim()
        .to_string();
        let no_task = text.contains("no tasks")
            || text.contains("没有运行")
            || text.contains("找不到")
            || text.to_lowercase().contains("not found");
        if output.status.success() || no_task {
            return Ok(json!({
                "ok": true,
                "stopped": !no_task,
                "message": if no_task { "没有发现正在运行的 Claude Code 原生终端。" } else { "Claude Code 原生终端已关闭。" },
                "output": text,
                "windowTitle": NATIVE_CLAUDE_WINDOW_TITLE
            }));
        }
        return Err(if text.is_empty() {
            "关闭 Claude Code 原生终端失败。".to_string()
        } else {
            text
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(json!({
            "ok": true,
            "stopped": false,
            "message": "当前平台未绑定 Claude Code 原生终端关闭动作。"
        }))
    }
}

#[tauri::command]
pub async fn claude_code_status() -> Result<Value, String> {
    status_impl()
}

#[tauri::command]
pub async fn configure_claude_code_relay(config: Value) -> Result<Value, String> {
    let resources = resources_dir()?;
    let data_dir = claude_panel_data_dir(&resources);
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let config_path = claude_relay_config_path(&resources);

    let existing = fs::read_to_string(&config_path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .unwrap_or_else(|| json!({}));

    let force = config
        .get("force")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let managed = existing
        .get("managedBy")
        .and_then(|v| v.as_str())
        .is_some_and(|v| v == "superclaw-minimax-test");
    let has_existing_user_config = existing
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        && existing
            .get("baseUrl")
            .and_then(|v| v.as_str())
            .is_some_and(|v| !v.trim().is_empty())
        && existing
            .get("apiKey")
            .and_then(|v| v.as_str())
            .is_some_and(|v| !v.trim().is_empty());

    if has_existing_user_config && !managed && !force {
        return Ok(json!({
            "configured": false,
            "skipped": true,
            "reason": "existing-user-relay-config",
            "path": config_path
        }));
    }

    let base_url = config
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let api_key = config
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let model = config
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if base_url.is_empty() || api_key.is_empty() || model.is_empty() {
        return Ok(json!({
            "configured": false,
            "skipped": true,
            "reason": "missing-base-url-api-key-or-model",
            "path": config_path
        }));
    }

    let relay_name = config
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("MiniMax");
    let relay_provider = config
        .get("provider")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("openai-compatible");
    let default_provider = config
        .get("defaultProvider")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("minimax");
    let managed_by = config
        .get("managedBy")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("superclaw-minimax-test");

    let mut branch_models = config
        .get("branchModels")
        .or_else(|| config.get("models"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    if branch_models.is_empty() {
        branch_models.push(model.to_string());
    }

    let next = json!({
        "enabled": true,
        "interfaceType": config
            .get("interfaceType")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("relay"),
        "name": relay_name,
        "provider": relay_provider,
        "defaultProvider": default_provider,
        "baseUrl": base_url,
        "model": model,
        "branchModels": branch_models,
        "apiKey": api_key,
        "managedBy": managed_by,
        "updatedAt": format!("{:?}", std::time::SystemTime::now())
    });
    let content = serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;

    Ok(json!({
        "configured": true,
        "skipped": false,
        "provider": relay_provider,
        "model": model,
        "path": config_path
    }))
}
