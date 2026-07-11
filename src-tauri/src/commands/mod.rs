use rand::Rng;
use std::net::IpAddr;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::process::Command;
use std::sync::RwLock;
use std::time::Duration;

/// 缓存 gateway 端口，避免频繁读文件（5秒有效期）
static GATEWAY_PORT_CACHE: std::sync::LazyLock<std::sync::Mutex<(u16, std::time::Instant)>> =
    std::sync::LazyLock::new(|| {
        std::sync::Mutex::new((18789, std::time::Instant::now() - Duration::from_secs(60)))
    });

const OPENCLAW_EFFECTIVE_TOOLS_PROFILE: &str = "coding";
const PORTABLE_GATEWAY_TOKEN_PREFIX: &str = "superclaw-local-";

pub mod agent;
pub mod assistant;
pub mod claude_code;
pub mod cli_conflict;
pub mod config;
pub mod device;
pub mod diagnose;
pub mod extensions;
pub mod hermes;
pub mod hermes_providers;
pub mod logs;
pub mod memory;
pub mod messaging;
pub mod ocr;
pub mod pairing;
pub mod service;
pub mod shared_memory;
pub mod skillhub;
pub mod skills;
pub mod update;

fn new_portable_gateway_token() -> String {
    let suffix: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(40)
        .map(char::from)
        .collect();
    format!("{PORTABLE_GATEWAY_TOKEN_PREFIX}{suffix}")
}

fn is_placeholder_or_legacy_gateway_token(value: Option<&str>) -> bool {
    let token = value.unwrap_or("").trim();
    token.is_empty()
        || token == "superclaw-portable-local"
        || (token.starts_with("${") && token.ends_with('}'))
}

/// 默认 OpenClaw 配置目录
/// Windows 上优先使用 USERPROFILE（与 Node.js os.homedir() 一致），
/// 并自动检测已有 openclaw.json 的目录，避免创建第二个 .openclaw
fn default_openclaw_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let mut candidates: Vec<PathBuf> = Vec::new();
        // 优先 USERPROFILE（与 Node.js os.homedir() 一致）
        if let Ok(up) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(up.trim());
            if !p.as_os_str().is_empty() {
                candidates.push(p);
            }
        }
        // dirs::home_dir() 作为补充（Windows API SHGetKnownFolderPath）
        if let Some(dh) = dirs::home_dir() {
            if !candidates
                .iter()
                .any(|c| panel_path_key(c) == panel_path_key(&dh))
            {
                candidates.push(dh);
            }
        }
        // HOMEDRIVE+HOMEPATH（域控/企业环境可能指向网络盘）
        if let (Ok(hd), Ok(hp)) = (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH")) {
            let combined = format!("{}{}", hd.trim(), hp.trim());
            let p = PathBuf::from(&combined);
            if !combined.is_empty()
                && !candidates
                    .iter()
                    .any(|c| panel_path_key(c) == panel_path_key(&p))
            {
                candidates.push(p);
            }
        }
        // 优先选已有 openclaw.json 的目录（自动对齐已安装的 OpenClaw）
        for home in &candidates {
            let dir = home.join(".openclaw");
            if dir.join("openclaw.json").exists() {
                return dir;
            }
        }
        // 都没有 → 用第一个候选（USERPROFILE）
        candidates
            .first()
            .cloned()
            .unwrap_or_default()
            .join(".openclaw")
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs::home_dir().unwrap_or_default().join(".openclaw")
    }
}

// ---------------------------------------------------------------------------
// 便携模式路径工具
// ---------------------------------------------------------------------------

/// 应用 resources 目录（便携模式定位用）
/// 1. 相对于可执行文件（已安装/打包模式）
/// 2. 相对于当前工作目录（开发模式）
fn app_resources_dir() -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(project_root) = manifest.parent() {
            let candidate = project_root.join("src-tauri").join("resources");
            if candidate.is_dir() && candidate.join("runtime").join("openclaw").is_dir() {
                return Some(candidate);
            }
        }
    }

    // 已安装/打包模式：找 exe 同级或父级目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Windows/Linux: exe 所在目录/resources/
            let candidate = exe_dir.join("resources");
            if candidate.is_dir() {
                return Some(candidate);
            }
            // macOS .app bundle: <name>.app/Contents/Resources/
            if let Some(parent) = exe_dir.parent() {
                if let Some(grandparent) = parent.parent() {
                    let candidate = grandparent.join("Resources");
                    if candidate.is_dir() {
                        return Some(candidate);
                    }
                }
            }
        }
    }
    // 开发模式：cwd/src-tauri/resources/
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join("src-tauri").join("resources");
        if candidate.is_dir() {
            return Some(candidate);
        }
        // 开发模式备选：cwd/resources/（Tauri dev 模式下 CWD 可能已经是 src-tauri/）
        let candidate2 = cwd.join("resources");
        if candidate2.is_dir() && candidate2.join("runtime").join("openclaw").is_dir() {
            return Some(candidate2);
        }
    }
    None
}

/// 便携模式下 bundled OpenClaw 的运行时目录（含 Node.js）
/// 例: resources/runtime/openclaw/
pub fn bundled_openclaw_bin_dir() -> Option<PathBuf> {
    let res = app_resources_dir()?;
    let dir = res.join("runtime").join("openclaw");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// 便携模式下的 OpenClaw 数据目录（存放运行配置、日志等）
/// 例: resources/data/.openclaw/
/// 当内置 OpenClaw 存在或该目录已有时返回 Some，否则返回 None
fn portable_openclaw_data_dir() -> Option<PathBuf> {
    let res = app_resources_dir()?;
    let dir = res.join("data").join(".openclaw");

    // Tauri watches src-tauri/resources during development. Keep OpenClaw's
    // writable state elsewhere so logs/config updates cannot restart the app.
    #[cfg(debug_assertions)]
    {
        let project_root = res.parent()?.parent()?;
        let dev_dir = project_root.join(".dev-data").join(".openclaw");
        ensure_dev_openclaw_data_dir(&dir, &dev_dir);
        return Some(dev_dir);
    }

    #[cfg(not(debug_assertions))]
    // 目录已存在 或 内置 OpenClaw 存在（便携模式）=> 返回此路径
    if dir.exists() || bundled_openclaw_bin_dir().is_some() {
        Some(dir)
    } else {
        None
    }
}

fn copy_dir_missing_only(source: &Path, target: &Path) {
    let Ok(entries) = std::fs::read_dir(source) else {
        return;
    };
    let _ = std::fs::create_dir_all(target);
    for entry in entries.flatten() {
        let src = entry.path();
        let dst = target.join(entry.file_name());
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            copy_dir_missing_only(&src, &dst);
        } else if file_type.is_file() && !dst.exists() {
            if let Some(parent) = dst.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::copy(&src, &dst);
        }
    }
}

#[cfg(debug_assertions)]
fn ensure_dev_openclaw_data_dir(source: &Path, target: &Path) {
    let _ = std::fs::create_dir_all(target);

    for name in [
        "openclaw.json",
        "clawpanel.json",
        "clawpanel-device-key.json",
        "exec-approvals.json",
    ] {
        let src = source.join(name);
        let dst = target.join(name);
        if src.is_file() && !dst.exists() {
            let _ = std::fs::copy(src, dst);
        }
    }

    // Seed durable configuration and capabilities only. Volatile logs,
    // process state and owner files are created under .dev-data at runtime.
    for name in [
        "agents",
        "devices",
        "identity",
        "skills",
        "workspace",
        "extensions",
        "plugins",
        "npm",
    ] {
        let src = source.join(name);
        if src.is_dir() {
            copy_dir_missing_only(&src, &target.join(name));
        }
    }
}

fn copy_dir_overwrite(source: &Path, target: &Path) {
    let Ok(entries) = std::fs::read_dir(source) else {
        return;
    };
    let _ = std::fs::create_dir_all(target);
    for entry in entries.flatten() {
        let src = entry.path();
        let dst = target.join(entry.file_name());
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            copy_dir_overwrite(&src, &dst);
        } else if file_type.is_file() {
            if let Some(parent) = dst.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::copy(&src, &dst);
        }
    }
}

fn ensure_portable_openclaw_skills(openclaw_dir: &Path) {
    let Some(runtime_dir) = bundled_openclaw_bin_dir() else {
        return;
    };
    let source = runtime_dir.join("skills");
    if source.is_dir() {
        copy_dir_missing_only(&source, &openclaw_dir.join("skills"));
    }
}

fn ensure_superclaw_openclaw_plugins() {
    let Some(runtime_dir) = bundled_openclaw_bin_dir() else {
        return;
    };
    let source_extensions = runtime_dir.join("dist").join("extensions");
    let runtime_extensions = runtime_dir
        .join("node_modules")
        .join("@qingchencloud")
        .join("openclaw-zh")
        .join("dist")
        .join("extensions");
    for plugin in ["desktop-control", "skill-manager"] {
        let source = source_extensions.join(plugin);
        let target = runtime_extensions.join(plugin);
        if source.join("openclaw.plugin.json").is_file() {
            copy_dir_overwrite(&source, &target);
        }
    }
    let source_agent = app_resources_dir()
        .map(|dir| dir.join("bin").join("desktop-control-agent.exe"))
        .unwrap_or_else(|| runtime_dir.join("bin").join("desktop-control-agent.exe"));
    let target_agent = runtime_dir.join("bin").join("desktop-control-agent.exe");
    if source_agent.is_file() && !target_agent.is_file() {
        if let Some(parent) = target_agent.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::copy(source_agent, target_agent);
    }
}

fn ensure_portable_openclaw_config(openclaw_dir: &Path) {
    let _ = std::fs::create_dir_all(openclaw_dir);
    ensure_portable_openclaw_skills(openclaw_dir);
    ensure_superclaw_openclaw_plugins();
    let workspace = openclaw_dir.join("workspace");
    let logs = openclaw_dir.join("logs");
    let _ = std::fs::create_dir_all(&workspace);
    let _ = std::fs::create_dir_all(&logs);
    let exec_approvals_path = openclaw_dir.join("exec-approvals.json");
    let exec_approvals = serde_json::json!({
        "version": 1,
        "defaults": { "security": "full", "ask": "off", "askFallback": "full" }
    });
    let should_write_exec_approvals = std::fs::read_to_string(&exec_approvals_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .map(|current| {
            current
                .get("defaults")
                .and_then(|v| v.get("security"))
                .and_then(|v| v.as_str())
                != Some("full")
                || current
                    .get("defaults")
                    .and_then(|v| v.get("ask"))
                    .and_then(|v| v.as_str())
                    != Some("off")
                || current
                    .get("defaults")
                    .and_then(|v| v.get("askFallback"))
                    .and_then(|v| v.as_str())
                    != Some("full")
        })
        .unwrap_or(true);
    if should_write_exec_approvals {
        if let Ok(content) = serde_json::to_string_pretty(&exec_approvals) {
            let _ = std::fs::write(&exec_approvals_path, content);
        }
    }

    let config_path = openclaw_dir.join("openclaw.json");
    let mut config = std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .filter(|value| value.is_object())
        .unwrap_or_else(|| serde_json::json!({}));

    let obj = config.as_object_mut().unwrap();
    let mut changed = false;

    if !obj.get("meta").is_some_and(|v| v.is_object()) {
        obj.insert("meta".into(), serde_json::json!({}));
        changed = true;
    }
    if let Some(meta) = obj.get_mut("meta").and_then(|v| v.as_object_mut()) {
        if meta.get("lastTouchedVersion").and_then(|v| v.as_str()) != Some("YY1.0.1") {
            meta.insert("lastTouchedVersion".into(), serde_json::json!("YY1.0.1"));
            changed = true;
        }
    }

    if !obj.get("gateway").is_some_and(|v| v.is_object()) {
        obj.insert("gateway".into(), serde_json::json!({}));
        changed = true;
    }
    if let Some(gateway) = obj.get_mut("gateway").and_then(|v| v.as_object_mut()) {
        let required = [
            ("mode", serde_json::json!("local")),
            ("bind", serde_json::json!("loopback")),
            ("port", serde_json::json!(18789)),
        ];
        for (key, value) in required {
            if gateway.get(key) != Some(&value) {
                gateway.insert(key.into(), value);
                changed = true;
            }
        }
        if !gateway.get("auth").is_some_and(|v| v.is_object()) {
            gateway.insert(
                "auth".into(),
                serde_json::json!({ "mode": "token", "token": "" }),
            );
            changed = true;
        }
        let current_auth_token = gateway
            .get("auth")
            .and_then(|v| v.get("token"))
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let portable_gateway_token =
            if is_placeholder_or_legacy_gateway_token(current_auth_token.as_deref()) {
                let token = new_portable_gateway_token();
                if let Some(auth) = gateway.get_mut("auth").and_then(|v| v.as_object_mut()) {
                    if auth.get("mode").and_then(|v| v.as_str()) != Some("token") {
                        auth.insert("mode".into(), serde_json::json!("token"));
                    }
                    auth.insert("token".into(), serde_json::json!(token.clone()));
                }
                changed = true;
                token
            } else {
                current_auth_token.unwrap_or_default().trim().to_string()
            };
        let current_remote_token = gateway
            .get("remote")
            .and_then(|v| v.get("token"))
            .and_then(|v| v.as_str());
        if is_placeholder_or_legacy_gateway_token(current_remote_token)
            || current_remote_token.map(str::trim) != Some(portable_gateway_token.as_str())
        {
            gateway.insert(
                "remote".into(),
                serde_json::json!({ "token": portable_gateway_token }),
            );
            changed = true;
        }
        if !gateway.get("controlUi").is_some_and(|v| v.is_object()) {
            gateway.insert(
                "controlUi".into(),
                serde_json::json!({
                    "enabled": true,
                    "allowedOrigins": [
                        "tauri://localhost",
                        "https://tauri.localhost",
                        "http://tauri.localhost",
                        "http://localhost",
                        "http://127.0.0.1",
                        "http://localhost:1420",
                        "http://127.0.0.1:1420",
                        "http://127.0.0.1:18777",
                        "app://localhost",
                        "app://",
                        "null"
                    ],
                    "allowInsecureAuth": false
                }),
            );
            changed = true;
        }
    }

    if !obj.get("agents").is_some_and(|v| v.is_object()) {
        obj.insert("agents".into(), serde_json::json!({}));
        changed = true;
    }
    if let Some(agents) = obj.get_mut("agents").and_then(|v| v.as_object_mut()) {
        if !agents.get("defaults").is_some_and(|v| v.is_object()) {
            agents.insert("defaults".into(), serde_json::json!({}));
            changed = true;
        }
        if let Some(defaults) = agents.get_mut("defaults").and_then(|v| v.as_object_mut()) {
            let workspace_value = serde_json::json!("workspace");
            if defaults.get("workspace") != Some(&workspace_value) {
                defaults.insert("workspace".into(), workspace_value);
                changed = true;
            }
            if !defaults.get("model").is_some_and(|v| v.is_object()) {
                defaults.insert(
                    "model".into(),
                    serde_json::json!({
                        "primary": "",
                        "fallbacks": []
                    }),
                );
                changed = true;
            }
            if !defaults.get("skills").is_some_and(|v| v.is_array()) {
                defaults.insert("skills".into(), serde_json::json!([]));
                changed = true;
            }
            if defaults.get("contextInjection").and_then(|v| v.as_str()) != Some("never") {
                defaults.insert("contextInjection".into(), serde_json::json!("never"));
                changed = true;
            }
        }
        if !agents.get("list").is_some_and(|v| v.is_array()) {
            agents.insert(
                "list".into(),
                serde_json::json!([{
                    "id": "main",
                    "name": "Main Agent",
                    "workspace": "workspace",
                    "model": {
                        "primary": "",
                        "fallbacks": []
                    },
                    "skills": [],
                    "skillsLimits": { "maxSkillsPromptChars": 0 },
                    "tools": {
                        "profile": OPENCLAW_EFFECTIVE_TOOLS_PROFILE,
                        "alsoAllow": ["browser", "desktop_control", "skill_manager", "exec", "process"]
                    },
                    "thinkingDefault": "off",
                    "verboseDefault": "off"
                }]),
            );
            changed = true;
        }
    }
    if !obj.get("models").is_some_and(|v| v.is_object()) {
        obj.insert(
            "models".into(),
            serde_json::json!({
                "providers": {}
            }),
        );
        changed = true;
    }

    if !obj.get("plugins").is_some_and(|v| v.is_object()) {
        obj.insert("plugins".into(), serde_json::json!({}));
        changed = true;
    }
    if let Some(plugins) = obj.get_mut("plugins").and_then(|v| v.as_object_mut()) {
        let allow = plugins
            .entry("allow")
            .or_insert_with(|| serde_json::json!([]));
        if let Some(allow_arr) = allow.as_array_mut() {
            for key in ["browser", "desktop-control", "skill-manager"] {
                if !allow_arr.iter().any(|v| v.as_str() == Some(key)) {
                    allow_arr.push(serde_json::json!(key));
                    changed = true;
                }
            }
        }
        let entries = plugins
            .entry("entries")
            .or_insert_with(|| serde_json::json!({}));
        if let Some(entries_obj) = entries.as_object_mut() {
            for key in ["browser", "desktop-control", "skill-manager"] {
                let enabled = entries_obj
                    .get(key)
                    .and_then(|v| v.get("enabled"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                if !enabled {
                    entries_obj.insert(key.into(), serde_json::json!({ "enabled": true }));
                    changed = true;
                }
            }
        }
    }

    if !obj.get("skills").is_some_and(|v| v.is_object()) {
        obj.insert(
            "skills".into(),
            serde_json::json!({ "entries": {}, "limits": { "maxSkillsPromptChars": 0 } }),
        );
        changed = true;
    }

    if !obj.get("tools").is_some_and(|v| v.is_object()) {
        obj.insert(
            "tools".into(),
            serde_json::json!({
                "profile": OPENCLAW_EFFECTIVE_TOOLS_PROFILE,
                "alsoAllow": ["browser", "desktop_control", "skill_manager", "exec", "process"],
                "exec": { "host": "gateway", "security": "full", "ask": "off" },
                "sessions": { "visibility": "agent" }
            }),
        );
        changed = true;
    } else if let Some(tools) = obj.get_mut("tools").and_then(|v| v.as_object_mut()) {
        if tools.get("profile").and_then(|v| v.as_str()) != Some(OPENCLAW_EFFECTIVE_TOOLS_PROFILE) {
            tools.insert(
                "profile".into(),
                serde_json::json!(OPENCLAW_EFFECTIVE_TOOLS_PROFILE),
            );
            changed = true;
        }
        let allow = serde_json::json!([
            "browser",
            "desktop_control",
            "skill_manager",
            "exec",
            "process"
        ]);
        if tools.get("alsoAllow") != Some(&allow) {
            tools.insert("alsoAllow".into(), allow);
            changed = true;
        }
        let exec = serde_json::json!({ "host": "gateway", "security": "full", "ask": "off" });
        if tools.get("exec") != Some(&exec) {
            tools.insert("exec".into(), exec);
            changed = true;
        }
        if let Some(deny) = tools.get_mut("deny").and_then(|v| v.as_array_mut()) {
            let before = deny.len();
            deny.retain(|tool| tool.as_str() != Some("exec"));
            if before != deny.len() {
                changed = true;
            }
        }
        if let Some(deny) = tools.get_mut("alsoDeny").and_then(|v| v.as_array_mut()) {
            let before = deny.len();
            deny.retain(|tool| tool.as_str() != Some("exec"));
            if before != deny.len() {
                changed = true;
            }
        }
        if !tools.get("sessions").is_some_and(|v| v.is_object()) {
            tools.insert(
                "sessions".into(),
                serde_json::json!({ "visibility": "agent" }),
            );
            changed = true;
        }
    }

    if changed {
        if let Ok(content) = serde_json::to_string_pretty(&config) {
            let _ = std::fs::write(config_path, content);
        }
    }

    ensure_portable_device_identity(openclaw_dir);
}

fn ensure_portable_device_identity(openclaw_dir: &Path) {
    if let Err(err) = pairing::ensure_pairing_for_dir(openclaw_dir) {
        eprintln!("[portable] failed to bootstrap OpenClaw device identity: {err}");
    }
}

fn panel_path_key(path: &std::path::Path) -> String {
    #[cfg(target_os = "windows")]
    {
        path.to_string_lossy().replace('/', "\\").to_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        path.to_string_lossy().to_string()
    }
}

fn push_unique_panel_config_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    let key = panel_path_key(&path);
    if paths.iter().any(|existing| panel_path_key(existing) == key) {
        return;
    }
    paths.push(path);
}

fn panel_config_candidate_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    // 便携数据目录优先（exe 同级 resources/data/.openclaw/clawpanel.json）
    if let Some(portable) = portable_openclaw_data_dir() {
        push_unique_panel_config_path(&mut paths, portable.join("clawpanel.json"));
    }
    push_unique_panel_config_path(&mut paths, default_openclaw_dir().join("clawpanel.json"));

    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let trimmed = profile.trim();
            if !trimmed.is_empty() {
                push_unique_panel_config_path(
                    &mut paths,
                    PathBuf::from(trimmed)
                        .join(".openclaw")
                        .join("clawpanel.json"),
                );
            }
        }

        if let (Ok(home_drive), Ok(home_path)) =
            (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH"))
        {
            let combined = format!("{}{}", home_drive.trim(), home_path.trim());
            let trimmed = combined.trim();
            if !trimmed.is_empty() {
                push_unique_panel_config_path(
                    &mut paths,
                    PathBuf::from(trimmed)
                        .join(".openclaw")
                        .join("clawpanel.json"),
                );
            }
        }

        if let Ok(appdata) = std::env::var("APPDATA") {
            let appdata_path = PathBuf::from(appdata.trim());
            if let Some(profile_dir) = appdata_path.parent().and_then(|p| p.parent()) {
                push_unique_panel_config_path(
                    &mut paths,
                    profile_dir.join(".openclaw").join("clawpanel.json"),
                );
            }
        }
    }

    paths
}

fn read_panel_config_from(path: &std::path::Path) -> Option<serde_json::Value> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

fn normalize_custom_openclaw_dir(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let expanded = if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        dirs::home_dir().unwrap_or_default().join(rest)
    } else {
        PathBuf::from(trimmed)
    };

    if expanded.is_absolute() {
        Some(expanded)
    } else {
        std::env::current_dir().ok().map(|cwd| cwd.join(expanded))
    }
}

pub fn openclaw_search_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let Some(value) = read_panel_config_value() else {
        return paths;
    };
    let Some(entries) = value.get("openclawSearchPaths").and_then(|v| v.as_array()) else {
        return paths;
    };

    for raw in entries.iter().filter_map(|v| v.as_str()) {
        if let Some(path) = normalize_custom_openclaw_dir(raw) {
            if !paths.iter().any(|p| p == &path) {
                paths.push(path);
            }
        }
    }
    paths
}

/// 获取 OpenClaw 配置目录
/// 优先级：
///   1. 便携数据目录（exe 同级 resources/data/.openclaw/）
///   2. clawpanel.json 中配置的 openclawDir 自定义路径
///   3. 默认 ~/.openclaw/
pub fn openclaw_dir() -> PathBuf {
    // 1. 便携数据目录（最高优先级）
    if let Some(portable) = portable_openclaw_data_dir() {
        if !portable.exists() {
            let _ = std::fs::create_dir_all(&portable);
        }
        ensure_portable_openclaw_config(&portable);
        return portable;
    }
    // 2. clawpanel.json 中配置的自定义路径
    if let Some(custom) = read_panel_config_value()
        .and_then(|v| v.get("openclawDir")?.as_str().map(String::from))
        .and_then(|v| normalize_custom_openclaw_dir(&v))
    {
        return custom;
    }
    // 3. 默认 ~/.openclaw/
    default_openclaw_dir()
}

/// Gateway 监听端口：读取 `openclaw.json` 的 `gateway.port`，缺省 **18789**。
/// 与面板「Gateway 配置」、服务状态检测（netstat / TCP / launchctl 兜底）共用同一来源，
/// 并尊重 `clawpanel.json` 中的 `openclawDir` 自定义配置目录。
pub fn gateway_listen_port() -> u16 {
    // 5秒内返回缓存值，避免服务状态检测时频繁读文件
    if let Ok(cache) = GATEWAY_PORT_CACHE.lock() {
        if cache.1.elapsed() < Duration::from_secs(5) {
            return cache.0;
        }
    }
    let port = read_gateway_port_from_config();
    if let Ok(mut cache) = GATEWAY_PORT_CACHE.lock() {
        *cache = (port, std::time::Instant::now());
    }
    port
}

fn read_gateway_port_from_config() -> u16 {
    let config_path = openclaw_dir().join("openclaw.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(port) = val
                .get("gateway")
                .and_then(|g| g.get("port"))
                .and_then(|p| p.as_u64())
            {
                if port > 0 && port < 65536 {
                    return port as u16;
                }
            }
        }
    }
    18789
}

fn panel_config_path() -> PathBuf {
    let candidates = panel_config_candidate_paths();
    for path in &candidates {
        if read_panel_config_from(path).is_some() {
            return path.clone();
        }
    }
    for path in &candidates {
        if path.exists() {
            return path.clone();
        }
    }
    candidates
        .into_iter()
        .next()
        .unwrap_or_else(|| default_openclaw_dir().join("clawpanel.json"))
}

#[cfg(target_os = "windows")]
pub(crate) fn windows_npm_global_prefix() -> Option<String> {
    if let Ok(prefix) = std::env::var("NPM_CONFIG_PREFIX") {
        let trimmed = prefix.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut cmd = Command::new("cmd");
    cmd.args(["/d", "/s", "/c", "npm config get prefix"]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let prefix = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !prefix.is_empty() && prefix.to_lowercase() != "undefined" {
                return Some(prefix);
            }
        }
    }

    None
}

pub fn read_panel_config_value() -> Option<serde_json::Value> {
    for path in panel_config_candidate_paths() {
        if let Some(value) = read_panel_config_from(&path) {
            return Some(value);
        }
    }
    None
}

pub fn configured_proxy_url() -> Option<String> {
    let value = read_panel_config_value()?;
    let raw = value
        .get("networkProxy")
        .and_then(|entry| {
            if let Some(obj) = entry.as_object() {
                obj.get("url").and_then(|v| v.as_str())
            } else {
                entry.as_str()
            }
        })?
        .trim()
        .to_string();
    if raw.is_empty() {
        None
    } else {
        Some(raw)
    }
}

fn should_bypass_proxy_host(host: &str) -> bool {
    let lower = host.trim().to_ascii_lowercase();
    if lower.is_empty() || lower == "localhost" || lower.ends_with(".local") {
        return true;
    }
    if let Ok(ip) = lower.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
            IpAddr::V6(v6) => {
                v6.is_loopback() || v6.is_unique_local() || v6.is_unicast_link_local()
            }
        };
    }
    false
}

/// 构建 HTTP 客户端，use_proxy=true 时走用户配置的代理
pub fn build_http_client(
    timeout: Duration,
    user_agent: Option<&str>,
) -> Result<reqwest::Client, String> {
    build_http_client_opt(timeout, user_agent, true)
}

/// 构建模型请求用的 HTTP 客户端
/// 默认不走代理；用户在面板设置中开启 proxyModelRequests 后才走代理
pub fn build_http_client_no_proxy(
    timeout: Duration,
    user_agent: Option<&str>,
) -> Result<reqwest::Client, String> {
    let use_proxy = read_panel_config_value()
        .and_then(|v| v.get("networkProxy")?.get("proxyModelRequests")?.as_bool())
        .unwrap_or(false);
    build_http_client_opt(timeout, user_agent, use_proxy)
}

fn build_http_client_opt(
    timeout: Duration,
    user_agent: Option<&str>,
    use_proxy: bool,
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(timeout)
        .gzip(true)
        .brotli(true)
        .deflate(true);
    if let Some(ua) = user_agent {
        builder = builder.user_agent(ua);
    }
    if use_proxy {
        if let Some(proxy_url) = configured_proxy_url() {
            let proxy_value = proxy_url.clone();
            builder = builder.proxy(reqwest::Proxy::custom(move |url| {
                let host = url.host_str().unwrap_or("");
                if should_bypass_proxy_host(host) {
                    None
                } else {
                    Some(proxy_value.clone())
                }
            }));
        }
    }
    builder.build().map_err(|e| e.to_string())
}

pub fn apply_proxy_env(cmd: &mut std::process::Command) {
    if let Some(proxy_url) = configured_proxy_url() {
        cmd.env("HTTP_PROXY", &proxy_url)
            .env("HTTPS_PROXY", &proxy_url)
            .env("http_proxy", &proxy_url)
            .env("https_proxy", &proxy_url)
            .env("NO_PROXY", "localhost,127.0.0.1,::1")
            .env("no_proxy", "localhost,127.0.0.1,::1");
    }
}

pub fn apply_proxy_env_tokio(cmd: &mut tokio::process::Command) {
    if let Some(proxy_url) = configured_proxy_url() {
        cmd.env("HTTP_PROXY", &proxy_url)
            .env("HTTPS_PROXY", &proxy_url)
            .env("http_proxy", &proxy_url)
            .env("https_proxy", &proxy_url)
            .env("NO_PROXY", "localhost,127.0.0.1,::1")
            .env("no_proxy", "localhost,127.0.0.1,::1");
    }
}

/// 缓存 enhanced_path 结果，避免每次调用都扫描文件系统
/// 使用 RwLock 替代 OnceLock，支持运行时刷新缓存
static ENHANCED_PATH_CACHE: RwLock<Option<String>> = RwLock::new(None);

/// Tauri 应用启动时 PATH 可能不完整：
/// - macOS 从 Finder 启动时 PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin
/// - Windows 上安装 Node.js 到非默认路径、或安装后未重启进程
///
/// 补充 Node.js / npm 常见安装路径
pub fn enhanced_path() -> String {
    // 先尝试读缓存
    if let Ok(guard) = ENHANCED_PATH_CACHE.read() {
        if let Some(ref cached) = *guard {
            return cached.clone();
        }
    }
    // 缓存为空，重新构建
    let path = build_enhanced_path();
    if let Ok(mut guard) = ENHANCED_PATH_CACHE.write() {
        *guard = Some(path.clone());
    }
    path
}

/// 刷新 enhanced_path 缓存，使新设置的 Node.js 路径立即生效（无需重启应用）
pub fn refresh_enhanced_path() {
    let new_path = build_enhanced_path();
    if let Ok(mut guard) = ENHANCED_PATH_CACHE.write() {
        *guard = Some(new_path);
    }
}

fn build_enhanced_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = dirs::home_dir().unwrap_or_default();

    // 读取用户保存的自定义 Node.js 路径
    let custom_path =
        read_panel_config_value().and_then(|v| v.get("nodePath")?.as_str().map(String::from));

    #[cfg(target_os = "macos")]
    {
        // 版本管理器路径优先于系统路径，确保 nvm/volta/fnm 管理的 Node.js 版本被优先检测到
        let mut extra: Vec<String> = vec![
            format!("{}/.nvm/current/bin", home.display()),
            format!("{}/.volta/bin", home.display()),
            format!("{}/.nodenv/shims", home.display()),
            format!("{}/n/bin", home.display()),
            format!("{}/.npm-global/bin", home.display()),
            "/usr/local/bin".into(),
            "/opt/homebrew/bin".into(),
        ];
        // 便携模式：内置 OpenClaw 自带的 Node.js 路径（最高优先级）
        if let Some(bundled) = bundled_openclaw_bin_dir() {
            extra.insert(0, bundled.to_string_lossy().into_owned());
        }
        for configured in openclaw_search_paths() {
            let dir = if configured.is_file() {
                configured.parent().map(|p| p.to_path_buf())
            } else {
                Some(configured)
            };
            if let Some(dir) = dir {
                if dir.is_dir() {
                    extra.push(dir.to_string_lossy().to_string());
                }
            }
        }
        // NPM_CONFIG_PREFIX: 用户通过 npm config set prefix 自定义的全局安装路径
        if let Ok(prefix) = std::env::var("NPM_CONFIG_PREFIX") {
            extra.push(format!("{}/bin", prefix));
        }
        // standalone 安装目录（集中管理，避免多处硬编码）
        for sa_dir in config::all_standalone_dirs() {
            extra.push(sa_dir.to_string_lossy().into_owned());
        }
        // 扫描 nvm 实际安装的版本目录（兼容无 current 符号链接的情况）
        // 按版本号倒序排列，确保最新版优先（修复 #143：v20 排在 v24 前面）
        let nvm_versions = home.join(".nvm/versions/node");
        if nvm_versions.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
                let mut dirs: Vec<_> = entries
                    .flatten()
                    .filter(|e| e.path().join("bin").is_dir())
                    .collect();
                dirs.sort_by_key(|b| std::cmp::Reverse(b.file_name()));
                for entry in dirs {
                    extra.push(entry.path().join("bin").to_string_lossy().to_string());
                }
            }
        }
        // fnm: 扫描 $FNM_DIR 或默认 ~/.local/share/fnm 下的版本目录
        let fnm_dir = std::env::var("FNM_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share/fnm"));
        let fnm_versions = fnm_dir.join("node-versions");
        if fnm_versions.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
                let mut dirs: Vec<_> = entries
                    .flatten()
                    .filter(|e| e.path().join("installation/bin").is_dir())
                    .collect();
                dirs.sort_by_key(|b| std::cmp::Reverse(b.file_name()));
                for entry in dirs {
                    extra.push(
                        entry
                            .path()
                            .join("installation/bin")
                            .to_string_lossy()
                            .to_string(),
                    );
                }
            }
        }
        let mut parts: Vec<&str> = vec![];
        if let Some(ref cp) = custom_path {
            parts.push(cp.as_str());
        }
        parts.extend(extra.iter().map(|s| s.as_str()));
        if !current.is_empty() {
            parts.push(&current);
        }
        parts.join(":")
    }

    #[cfg(target_os = "linux")]
    {
        // 版本管理器路径优先于系统路径，确保 nvm/volta/fnm 管理的 Node.js 版本被优先检测到
        let mut extra: Vec<String> = vec![
            format!("{}/.nvm/current/bin", home.display()),
            format!("{}/.volta/bin", home.display()),
            format!("{}/.nodenv/shims", home.display()),
            format!("{}/n/bin", home.display()),
            format!("{}/.npm-global/bin", home.display()),
            format!("{}/.local/bin", home.display()),
            "/usr/local/bin".into(),
            "/usr/bin".into(),
            "/snap/bin".into(),
        ];
        // 便携模式：内置 OpenClaw 自带的 Node.js 路径（最高优先级）
        if let Some(bundled) = bundled_openclaw_bin_dir() {
            extra.insert(0, bundled.to_string_lossy().into_owned());
        }
        for configured in openclaw_search_paths() {
            let dir = if configured.is_file() {
                configured.parent().map(|p| p.to_path_buf())
            } else {
                Some(configured)
            };
            if let Some(dir) = dir {
                if dir.is_dir() {
                    extra.push(dir.to_string_lossy().to_string());
                }
            }
        }
        // NPM_CONFIG_PREFIX: 用户通过 npm config set prefix 自定义的全局安装路径
        if let Ok(prefix) = std::env::var("NPM_CONFIG_PREFIX") {
            extra.push(format!("{}/bin", prefix));
        }
        // standalone 安装目录（集中管理，避免多处硬编码）
        for sa_dir in config::all_standalone_dirs() {
            extra.push(sa_dir.to_string_lossy().into_owned());
        }
        // NVM_DIR 环境变量（用户可能自定义了 nvm 安装目录）
        // 按版本号倒序排列，确保最新版优先（修复 #143：v20 排在 v24 前面）
        let nvm_dir = std::env::var("NVM_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".nvm"));
        let nvm_versions = nvm_dir.join("versions/node");
        if nvm_versions.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
                let mut dirs: Vec<_> = entries
                    .flatten()
                    .filter(|e| e.path().join("bin").is_dir())
                    .collect();
                dirs.sort_by_key(|b| std::cmp::Reverse(b.file_name()));
                for entry in dirs {
                    extra.push(entry.path().join("bin").to_string_lossy().to_string());
                }
            }
        }
        // fnm: 扫描 $FNM_DIR 或默认 ~/.local/share/fnm 下的版本目录
        let fnm_dir = std::env::var("FNM_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share/fnm"));
        let fnm_versions = fnm_dir.join("node-versions");
        if fnm_versions.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
                let mut dirs: Vec<_> = entries
                    .flatten()
                    .filter(|e| e.path().join("installation/bin").is_dir())
                    .collect();
                dirs.sort_by_key(|b| std::cmp::Reverse(b.file_name()));
                for entry in dirs {
                    extra.push(
                        entry
                            .path()
                            .join("installation/bin")
                            .to_string_lossy()
                            .to_string(),
                    );
                }
            }
        }
        // nodesource / 手动安装的 Node.js 可能在 /usr/local/lib/nodejs/ 下
        let nodejs_lib = std::path::Path::new("/usr/local/lib/nodejs");
        if nodejs_lib.is_dir() {
            if let Ok(entries) = std::fs::read_dir(nodejs_lib) {
                for entry in entries.flatten() {
                    let bin = entry.path().join("bin");
                    if bin.is_dir() {
                        extra.push(bin.to_string_lossy().to_string());
                    }
                }
            }
        }
        let mut parts: Vec<&str> = vec![];
        if let Some(ref cp) = custom_path {
            parts.push(cp.as_str());
        }
        parts.extend(extra.iter().map(|s| s.as_str()));
        if !current.is_empty() {
            parts.push(&current);
        }
        parts.join(":")
    }

    #[cfg(target_os = "windows")]
    {
        let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
        let pf86 =
            std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".into());
        let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let appdata = std::env::var("APPDATA").unwrap_or_default();

        // 版本管理器路径优先，确保 nvm/volta/fnm 管理的 Node.js 被优先检测到
        let mut extra: Vec<String> = vec![];

        for configured in openclaw_search_paths() {
            let dir = if configured.is_file() {
                configured.parent().map(|p| p.to_path_buf())
            } else {
                Some(configured)
            };
            if let Some(dir) = dir {
                if dir.is_dir() {
                    extra.push(dir.to_string_lossy().to_string());
                }
            }
        }

        // 1. NVM_SYMLINK（nvm-windows 活跃版本符号链接，如 D:\nodejs）—— 最高优先级
        // 增强：尝试解析符号链接目标
        if let Ok(nvm_symlink) = std::env::var("NVM_SYMLINK") {
            let symlink_path = std::path::Path::new(&nvm_symlink);
            if symlink_path.is_dir() {
                extra.push(nvm_symlink.clone());
            }
            // 如果是符号链接，尝试读取其实际指向的目标
            #[cfg(target_os = "windows")]
            if symlink_path.is_symlink() {
                if let Ok(target) = std::fs::read_link(symlink_path) {
                    if target.is_dir() {
                        extra.push(target.to_string_lossy().to_string());
                    }
                }
            }
        }

        // 2. NVM_HOME（用户自定义 nvm 安装目录）
        if let Ok(nvm_home) = std::env::var("NVM_HOME") {
            let nvm_path = std::path::Path::new(&nvm_home);
            if nvm_path.is_dir() {
                // 扫描所有已安装的版本目录
                if let Ok(entries) = std::fs::read_dir(nvm_path) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() && p.join("node.exe").exists() {
                            extra.push(p.to_string_lossy().to_string());
                        }
                    }
                }
                // 尝试从 settings.json 读取当前激活版本
                let settings_path = nvm_path.join("settings.json");
                if settings_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&settings_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            // settings.json 中有 "path" 字段指向当前版本
                            if let Some(current_version) = json.get("path").and_then(|v| v.as_str())
                            {
                                let version_path = nvm_path.join(current_version);
                                if version_path.is_dir() {
                                    // 将当前激活版本移到更高优先级
                                    let version_bin = version_path.to_string_lossy().to_string();
                                    if !extra.contains(&version_bin) {
                                        extra.insert(0, version_bin);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. %APPDATA%\nvm（nvm-windows 默认安装目录）
        if !appdata.is_empty() {
            let nvm_dir = std::path::Path::new(&appdata).join("nvm");
            if nvm_dir.is_dir() {
                // 扫描所有已安装的版本
                if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() && p.join("node.exe").exists() {
                            extra.push(p.to_string_lossy().to_string());
                        }
                    }
                }
                // 尝试从 settings.json 读取当前激活版本
                let settings_path = nvm_dir.join("settings.json");
                if settings_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&settings_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(current_version) = json.get("path").and_then(|v| v.as_str())
                            {
                                let version_path = nvm_dir.join(current_version);
                                if version_path.is_dir() {
                                    let version_bin = version_path.to_string_lossy().to_string();
                                    if !extra.contains(&version_bin) {
                                        extra.insert(0, version_bin);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. volta
        extra.push(format!(r"{}\.volta\bin", home.display()));
        // volta 的活跃版本
        let volta_bin = std::path::Path::new(&home).join(".volta/bin");
        if volta_bin.is_dir() && !extra.contains(&volta_bin.to_string_lossy().to_string()) {
            extra.insert(0, volta_bin.to_string_lossy().to_string());
        }

        // 5. fnm
        if !localappdata.is_empty() {
            extra.push(format!(r"{}\fnm_multishells", localappdata));
        }
        let fnm_base = std::env::var("FNM_DIR")
            .ok()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::Path::new(&appdata).join("fnm"));
        let fnm_versions = fnm_base.join("node-versions");
        if fnm_versions.is_dir() {
            // 尝试找到 fnm 的当前活跃版本
            let fnm_current = fnm_base.join("current");
            if fnm_current.is_dir() {
                let current_inst = fnm_current.join("installation");
                if current_inst.is_dir()
                    && current_inst.join("node.exe").exists()
                    && !extra.contains(&current_inst.to_string_lossy().to_string())
                {
                    extra.insert(0, current_inst.to_string_lossy().to_string());
                }
            }
            // 扫描所有版本
            if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
                for entry in entries.flatten() {
                    let inst = entry.path().join("installation");
                    if inst.is_dir() && inst.join("node.exe").exists() {
                        let inst_str = inst.to_string_lossy().to_string();
                        if !extra.contains(&inst_str) {
                            extra.push(inst_str);
                        }
                    }
                }
            }
        }

        // 6. npm 全局（openclaw.cmd 通常在这里）
        if !appdata.is_empty() {
            extra.push(format!(r"{}\npm", appdata));
        }
        if let Some(prefix) = windows_npm_global_prefix() {
            let prefix_path = std::path::Path::new(&prefix);
            if prefix_path.is_dir() {
                let prefix_str = prefix_path.to_string_lossy().to_string();
                if !extra.contains(&prefix_str) {
                    extra.push(prefix_str);
                }
            }
        }

        // 6.5 standalone 安装目录（集中管理，避免多处硬编码）
        // standalone 安装后通过注册表写入用户 PATH，但当前进程的 PATH 环境变量不会
        // 实时更新，需要显式添加到 enhanced_path 以确保 resolve_openclaw_cli_path()
        // 能找到 standalone 安装的 openclaw.cmd
        for sa_dir in config::all_standalone_dirs() {
            extra.push(sa_dir.to_string_lossy().into_owned());
        }

        // 便携模式：内置 OpenClaw 自带的 Node.js 路径（最高优先级）
        if let Some(bundled) = bundled_openclaw_bin_dir() {
            extra.insert(0, bundled.to_string_lossy().into_owned());
        }

        // 7. 系统默认 Node.js 安装路径（优先级最低）
        extra.push(format!(r"{}\nodejs", pf));
        extra.push(format!(r"{}\nodejs", pf86));
        if !localappdata.is_empty() {
            extra.push(format!(r"{}\Programs\nodejs", localappdata));
        }

        // 8. 扫描常见盘符下的 Node 安装（用户可能装在 D:\、F:\ 等）
        for drive in &["C", "D", "E", "F"] {
            extra.push(format!(r"{}:\nodejs", drive));
            extra.push(format!(r"{}:\Node", drive));
            extra.push(format!(r"{}:\Program Files\nodejs", drive));
            // 常见 AI/Dev 工具目录
            extra.push(format!(r"{}:\AI\Node", drive));
            extra.push(format!(r"{}:\AI\nodejs", drive));
            extra.push(format!(r"{}:\Dev\nodejs", drive));
            extra.push(format!(r"{}:\Tools\nodejs", drive));
        }

        let mut parts: Vec<&str> = vec![];
        // 用户自定义路径优先级最高
        if let Some(ref cp) = custom_path {
            parts.push(cp.as_str());
        }
        // 然后是默认扫描到的路径（去重）
        let mut seen = std::collections::HashSet::new();
        for p in &extra {
            if std::path::Path::new(p).exists() && seen.insert(p.clone()) {
                parts.push(p.as_str());
            }
        }
        // 最后是系统 PATH
        if !current.is_empty() {
            parts.push(&current);
        }
        parts.join(";")
    }
}
