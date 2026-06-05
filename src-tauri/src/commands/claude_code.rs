use serde_json::{json, Value};
use std::fs;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

static CLAUDE_PANEL_CHILD: LazyLock<Mutex<Option<Child>>> = LazyLock::new(|| Mutex::new(None));

const CLAUDE_PANEL_PORT: u16 = 3020;

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

fn panel_url() -> String {
    format!("http://127.0.0.1:{}/", CLAUDE_PANEL_PORT)
}

fn ensure_portable_dirs(home: &Path, projects: &Path) -> Result<(), String> {
    fs::create_dir_all(home).map_err(|e| e.to_string())?;
    fs::create_dir_all(projects).map_err(|e| e.to_string())?;
    fs::create_dir_all(home.join("AppData").join("Roaming")).map_err(|e| e.to_string())?;
    fs::create_dir_all(home.join("AppData").join("Local")).map_err(|e| e.to_string())?;
    fs::create_dir_all(home.join(".claude")).map_err(|e| e.to_string())?;
    Ok(())
}

fn apply_portable_env(cmd: &mut Command, home: &Path, projects: &Path) {
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
}

fn is_port_open(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn wait_for_panel(port: u16) -> bool {
    for _ in 0..40 {
        if is_port_open(port) {
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
}

fn panel_running_info(resources: &Path) -> Value {
    let server = claude_panel_server(resources);
    json!({
        "installed": server.is_file(),
        "running": is_port_open(CLAUDE_PANEL_PORT),
        "url": panel_url(),
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
    apply_portable_env(&mut cmd, home, projects);

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
    let connected = version.is_some();
    let panel = panel_running_info(&resources);
    let panel_running = panel
        .get("running")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(json!({
        "installed": claude.is_file(),
        "connected": connected,
        "running": panel_running,
        "mode": "panel",
        "needsPanel": true,
        "message": "Claude Code CLI and the local Claude UI panel are available.",
        "panelUrl": panel_url(),
        "url": panel_url(),
        "version": version,
        "versionError": error,
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
    if !claude_cli_path(&resources).is_file() {
        return Err(format!(
            "Claude Code CLI 缺失：{}",
            claude_cli_path(&resources).display()
        ));
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

    let mut cmd = Command::new(node_cmd);
    cmd.arg(&server)
        .current_dir(claude_panel_dir(&resources))
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

#[tauri::command]
pub async fn claude_code_start() -> Result<Value, String> {
    start_cli_impl()
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
pub async fn claude_code_status() -> Result<Value, String> {
    status_impl()
}
