use std::net::IpAddr;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::process::Command;
use std::sync::RwLock;
use std::time::Duration;

/// 缂撳瓨 gateway 绔彛锛岄伩鍏嶉绻佽鏂囦欢锛?绉掓湁鏁堟湡锛?
static GATEWAY_PORT_CACHE: std::sync::LazyLock<std::sync::Mutex<(u16, std::time::Instant)>> =
    std::sync::LazyLock::new(|| {
        std::sync::Mutex::new((18789, std::time::Instant::now() - Duration::from_secs(60)))
    });

fn configured_minimax_api_key() -> Option<String> {
    std::env::var("MINIMAX_API_KEY")
        .or_else(|_| std::env::var("MINIMAX_CN_API_KEY"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            let env = read_hermes_env_file();
            env.get("MINIMAX_API_KEY")
                .or_else(|| env.get("MINIMAX_CN_API_KEY"))
                .cloned()
        })
}

fn configured_minimax_base_url() -> Option<String> {
    std::env::var("MINIMAX_BASE_URL")
        .or_else(|_| std::env::var("MINIMAX_CN_BASE_URL"))
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            let env = read_hermes_env_file();
            env.get("MINIMAX_BASE_URL")
                .or_else(|| env.get("MINIMAX_CN_BASE_URL"))
                .cloned()
        })
        .or_else(|| Some("https://api.minimax.io/v1".to_string()))
}

fn set_json_field(
    obj: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    value: serde_json::Value,
) -> bool {
    if obj.get(key) == Some(&value) {
        return false;
    }
    obj.insert(key.to_string(), value);
    true
}

fn openclaw_minimax_models_json() -> serde_json::Value {
    serde_json::json!([
        {
            "id": "MiniMax-M2.7",
            "name": "MiniMax M2.7",
            "api": "openai-completions",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 4096
        },
        {
            "id": "MiniMax-M2.5",
            "name": "MiniMax M2.5",
            "api": "openai-completions",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 4096
        }
    ])
}

fn sync_minimax_provider_from_hermes_env(
    obj: &mut serde_json::Map<String, serde_json::Value>,
) -> bool {
    let Some(api_key) = configured_minimax_api_key() else {
        return false;
    };
    let base_url =
        configured_minimax_base_url().unwrap_or_else(|| "https://api.minimax.io/v1".to_string());
    let mut changed = false;

    let models = obj
        .entry("models")
        .or_insert_with(|| serde_json::json!({}));
    if !models.is_object() {
        *models = serde_json::json!({});
        changed = true;
    }
    let models_obj = models.as_object_mut().unwrap();
    let providers = models_obj
        .entry("providers")
        .or_insert_with(|| serde_json::json!({}));
    if !providers.is_object() {
        *providers = serde_json::json!({});
        changed = true;
    }
    let providers_obj = providers.as_object_mut().unwrap();
    let provider = providers_obj
        .entry("minimax")
        .or_insert_with(|| serde_json::json!({}));
    if !provider.is_object() {
        *provider = serde_json::json!({});
        changed = true;
    }
    let provider_obj = provider.as_object_mut().unwrap();
    changed |= set_json_field(provider_obj, "baseUrl", serde_json::json!(base_url));
    changed |= set_json_field(provider_obj, "apiKey", serde_json::json!(api_key));
    changed |= set_json_field(provider_obj, "api", serde_json::json!("openai-completions"));
    changed |= set_json_field(provider_obj, "models", openclaw_minimax_models_json());

    let primary = "minimax/MiniMax-M2.7";
    let fallback = "minimax/MiniMax-M2.5";
    if let Some(agents) = obj.get_mut("agents").and_then(|v| v.as_object_mut()) {
        if let Some(defaults) = agents.get_mut("defaults").and_then(|v| v.as_object_mut()) {
            let models_map = defaults
                .entry("models")
                .or_insert_with(|| serde_json::json!({}));
            if let Some(models_obj) = models_map.as_object_mut() {
                models_obj
                    .entry(primary)
                    .or_insert_with(|| serde_json::json!({}));
                models_obj
                    .entry(fallback)
                    .or_insert_with(|| serde_json::json!({}));
            }
            if let Some(model) = defaults.get_mut("model").and_then(|v| v.as_object_mut()) {
                let current_primary = model
                    .get("primary")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if current_primary.is_empty() || current_primary.starts_with("minimax/") {
                    changed |= set_json_field(model, "primary", serde_json::json!(primary));
                    changed |= set_json_field(model, "fallbacks", serde_json::json!([fallback]));
                }
            }
        }
        if let Some(list) = agents.get_mut("list").and_then(|v| v.as_array_mut()) {
            for agent in list.iter_mut().filter_map(|v| v.as_object_mut()) {
                if let Some(model) = agent.get_mut("model").and_then(|v| v.as_object_mut()) {
                    let current_primary = model
                        .get("primary")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_ascii_lowercase();
                    if current_primary.is_empty() || current_primary.starts_with("minimax/") {
                        changed |= set_json_field(model, "primary", serde_json::json!(primary));
                        changed |=
                            set_json_field(model, "fallbacks", serde_json::json!([fallback]));
                    }
                }
            }
        }
    }

    changed
}

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

/// 榛樿 OpenClaw 閰嶇疆鐩綍
/// Windows 涓婁紭鍏堜娇鐢?USERPROFILE锛堜笌 Node.js os.homedir() 涓€鑷达級锛?
/// 骞惰嚜鍔ㄦ娴嬪凡鏈?openclaw.json 鐨勭洰褰曪紝閬垮厤鍒涘缓绗簩涓?.openclaw
fn default_openclaw_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let mut candidates: Vec<PathBuf> = Vec::new();
        // 浼樺厛 USERPROFILE锛堜笌 Node.js os.homedir() 涓€鑷达級
        if let Ok(up) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(up.trim());
            if !p.as_os_str().is_empty() {
                candidates.push(p);
            }
        }
        // dirs::home_dir() 浣滀负琛ュ厖锛圵indows API SHGetKnownFolderPath锛?
        if let Some(dh) = dirs::home_dir() {
            if !candidates
                .iter()
                .any(|c| panel_path_key(c) == panel_path_key(&dh))
            {
                candidates.push(dh);
            }
        }
        // HOMEDRIVE+HOMEPATH锛堝煙鎺?浼佷笟鐜鍙兘鎸囧悜缃戠粶鐩橈級
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
        // 浼樺厛閫夊凡鏈?openclaw.json 鐨勭洰褰曪紙鑷姩瀵归綈宸插畨瑁呯殑 OpenClaw锛?
        for home in &candidates {
            let dir = home.join(".openclaw");
            if dir.join("openclaw.json").exists() {
                return dir;
            }
        }
        // 閮芥病鏈?鈫?鐢ㄧ涓€涓€欓€夛紙USERPROFILE锛?
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
// 渚挎惡妯″紡璺緞宸ュ叿
// ---------------------------------------------------------------------------

/// 搴旂敤 resources 鐩綍锛堜究鎼烘ā寮忓畾浣嶇敤锛?
/// 1. 鐩稿浜庡彲鎵ц鏂囦欢锛堝凡瀹夎/鎵撳寘妯″紡锛?
/// 2. 鐩稿浜庡綋鍓嶅伐浣滅洰褰曪紙寮€鍙戞ā寮忥級
/// 从 Hermes .env 文件读取 KEY=VALUE 对（用于便携模式下获取 MiniMax 配置）
fn read_hermes_env_file() -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    let Some(res) = app_resources_dir() else { return map; };
    let env_path = res.join("data").join("hermes").join(".env");
    let Ok(text) = std::fs::read_to_string(&env_path) else { return map; };
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let k = k.trim();
            let v = v.trim().trim_matches('"').trim_matches('\'').to_string();
            if !v.is_empty() && !v.contains("${") {
                map.insert(k.to_string(), v);
            }
        }
    }
    map
}
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

    // 宸插畨瑁?鎵撳寘妯″紡锛氭壘 exe 鍚岀骇鎴栫埗绾х洰褰?
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Windows/Linux: exe 鎵€鍦ㄧ洰褰?resources/
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
    // 寮€鍙戞ā寮忥細cwd/src-tauri/resources/
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join("src-tauri").join("resources");
        if candidate.is_dir() {
            return Some(candidate);
        }
        // 寮€鍙戞ā寮忓閫夛細cwd/resources/锛圱auri dev 妯″紡涓?CWD 鍙兘宸茬粡鏄?src-tauri/锛?
        let candidate2 = cwd.join("resources");
        if candidate2.is_dir() && candidate2.join("runtime").join("openclaw").is_dir() {
            return Some(candidate2);
        }
    }
    None
}

/// 渚挎惡妯″紡涓?bundled OpenClaw 鐨勮繍琛屾椂鐩綍锛堝惈 Node.js锛?
/// 渚? resources/runtime/openclaw/
pub fn bundled_openclaw_bin_dir() -> Option<PathBuf> {
    let res = app_resources_dir()?;
    let dir = res.join("runtime").join("openclaw");
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// 渚挎惡妯″紡涓嬬殑 OpenClaw 鏁版嵁鐩綍锛堝瓨鏀捐繍琛岄厤缃€佹棩蹇楃瓑锛?
/// 渚? resources/data/.openclaw/
/// 褰撳唴缃?OpenClaw 瀛樺湪鎴栬鐩綍宸叉湁鏃惰繑鍥?Some锛屽惁鍒欒繑鍥?None
fn portable_openclaw_data_dir() -> Option<PathBuf> {
    let res = app_resources_dir()?;
    let dir = res.join("data").join(".openclaw");
    // 鐩綍宸插瓨鍦?鎴?鍐呯疆 OpenClaw 瀛樺湪锛堜究鎼烘ā寮忥級=> 杩斿洖姝よ矾寰?
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

fn sync_openclaw_agent_models_from_config(openclaw_dir: &Path, config: &serde_json::Value) {
    let Some(src_providers) = config
        .get("models")
        .and_then(|v| v.get("providers"))
        .and_then(|v| v.as_object())
    else {
        return;
    };
    let agents_dir = openclaw_dir.join("agents");
    let Ok(entries) = std::fs::read_dir(&agents_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let models_path = entry.path().join("agent").join("models.json");
        let Ok(content) = std::fs::read_to_string(&models_path) else {
            continue;
        };
        let Ok(mut models_json) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };
        if !models_json
            .get("providers")
            .and_then(|v| v.as_object())
            .is_some()
        {
            if let Some(root) = models_json.as_object_mut() {
                root.insert("providers".into(), serde_json::json!({}));
            }
        }
        let Some(dst_providers) = models_json
            .get_mut("providers")
            .and_then(|v| v.as_object_mut())
        else {
            continue;
        };
        let mut changed = false;
        for (name, src_provider) in src_providers {
            let dst_provider = dst_providers
                .entry(name.clone())
                .or_insert_with(|| serde_json::json!({}));
            if !dst_provider.is_object() {
                *dst_provider = serde_json::json!({});
                changed = true;
            }
            if let Some(dst_obj) = dst_provider.as_object_mut() {
                for field in ["baseUrl", "apiKey", "api"] {
                    if let Some(src_val) = src_provider.get(field).and_then(|v| v.as_str()) {
                        changed |= set_json_field(dst_obj, field, serde_json::json!(src_val));
                    }
                }
                if name == "minimax" {
                    if let Some(models) = src_provider.get("models") {
                        changed |= set_json_field(dst_obj, "models", models.clone());
                    }
                }
            }
        }
        if changed {
            if let Ok(json) = serde_json::to_string_pretty(&models_json) {
                let _ = std::fs::write(&models_path, format!("{json}\n"));
            }
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
            copy_dir_missing_only(&source, &target);
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
                serde_json::json!({ "mode": "token", "token": "superclaw-portable-local" }),
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
                    "allowInsecureAuth": true
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
                        "profile": "minimal",
                        "alsoAllow": ["browser", "desktop_control", "skill_manager", "exec"]
                    },
                    "thinkingDefault": "off",
                    "verboseDefault": "off"
                }]),
            );
            changed = true;
        }
    }

    if !obj.get("models").is_some_and(|v| v.is_object()) {
        let providers = {
            let mut providers = serde_json::json!({});
            if let Some(api_key) = configured_minimax_api_key() {
                let base_url = configured_minimax_base_url().unwrap_or_else(|| "https://api.minimax.io/v1".to_string());
                providers["minimax"] = serde_json::json!({
                    "baseUrl": base_url,
                    "apiKey": api_key,
                    "api": "openai-completions",
                    "models": [
                        { "id": "MiniMax-M2.7" },
                        { "id": "MiniMax-M2.5" }
                    ]
                });
            }
            providers
        };
        obj.insert(
            "models".into(),
            serde_json::json!({
                "providers": providers
            }),
        );
        changed = true;
    }
    changed |= sync_minimax_provider_from_hermes_env(obj);
    // 模型注入：仅 MiniMax
    let minimax_model = obj
        .get("models")
        .and_then(|v| v.get("providers"))
        .and_then(|v| v.get("minimax"))
        .and_then(|v| v.get("models"))
        .and_then(|v| v.as_array())
        .and_then(|models| models.first())
        .and_then(|model| model.get("id"))
        .and_then(|v| v.as_str())
        .map(|id| format!("minimax/{id}"));
    let primary_model = minimax_model.clone().unwrap_or_default();
    let fallback_model = minimax_model.clone().unwrap_or_else(|| primary_model.clone());
    if let Some(agents) = obj.get_mut("agents").and_then(|v| v.as_object_mut()) {
        if let Some(defaults) = agents.get_mut("defaults").and_then(|v| v.as_object_mut()) {
            if let Some(model) = defaults.get_mut("model").and_then(|v| v.as_object_mut()) {
                if let Some(fallbacks) = model.get_mut("fallbacks").and_then(|v| v.as_array_mut()) {
                    if fallbacks.is_empty()
                        && !fallback_model.is_empty()
                        && !primary_model.is_empty()
                    {
                        fallbacks.push(serde_json::json!(fallback_model.clone()));
                        changed = true;
                    }
                }
            }
        }
        if let Some(list) = agents.get_mut("list").and_then(|v| v.as_array_mut()) {
            for agent in list.iter_mut().filter_map(|v| v.as_object_mut()) {
                if let Some(model) = agent.get_mut("model").and_then(|v| v.as_object_mut()) {
                    if let Some(fallbacks) =
                        model.get_mut("fallbacks").and_then(|v| v.as_array_mut())
                    {
                        if fallbacks.is_empty()
                            && !fallback_model.is_empty()
                            && !primary_model.is_empty()
                        {
                            fallbacks.push(serde_json::json!(fallback_model.clone()));
                            changed = true;
                        }
                    }
                }
            }
        }
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
                "profile": "minimal",
                "alsoAllow": ["browser", "desktop_control", "skill_manager", "exec"],
                "exec": { "host": "gateway", "security": "full", "ask": "off" },
                "sessions": { "visibility": "agent" }
            }),
        );
        changed = true;
    } else if let Some(tools) = obj.get_mut("tools").and_then(|v| v.as_object_mut()) {
        if tools.get("profile").and_then(|v| v.as_str()) != Some("minimal") {
            tools.insert("profile".into(), serde_json::json!("minimal"));
            changed = true;
        }
        let allow = serde_json::json!(["browser", "desktop_control", "skill_manager", "exec"]);
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
    sync_openclaw_agent_models_from_config(openclaw_dir, &config);
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
    // 渚挎惡鏁版嵁鐩綍浼樺厛锛坋xe 鍚岀骇 resources/data/.openclaw/clawpanel.json锛?
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

/// 鑾峰彇 OpenClaw 閰嶇疆鐩綍
/// 浼樺厛绾э細
///   1. 渚挎惡鏁版嵁鐩綍锛坋xe 鍚岀骇 resources/data/.openclaw/锛?
///   2. clawpanel.json 涓厤缃殑 openclawDir 鑷畾涔夎矾寰?
///   3. 榛樿 ~/.openclaw/
pub fn openclaw_dir() -> PathBuf {
    // 1. 渚挎惡鏁版嵁鐩綍锛堟渶楂樹紭鍏堢骇锛?
    if let Some(portable) = portable_openclaw_data_dir() {
        if !portable.exists() {
            let _ = std::fs::create_dir_all(&portable);
        }
        ensure_portable_openclaw_config(&portable);
        return portable;
    }
    // 2. clawpanel.json 涓厤缃殑鑷畾涔夎矾寰?
    if let Some(custom) = read_panel_config_value()
        .and_then(|v| v.get("openclawDir")?.as_str().map(String::from))
        .and_then(|v| normalize_custom_openclaw_dir(&v))
    {
        return custom;
    }
    // 3. 榛樿 ~/.openclaw/
    default_openclaw_dir()
}

/// Gateway 鐩戝惉绔彛锛氳鍙?`openclaw.json` 鐨?`gateway.port`锛岀己鐪?**18789**銆?
/// 涓庨潰鏉裤€孏ateway 閰嶇疆銆嶃€佹湇鍔＄姸鎬佹娴嬶紙netstat / TCP / launchctl 鍏滃簳锛夊叡鐢ㄥ悓涓€鏉ユ簮锛?
/// 骞跺皧閲?`clawpanel.json` 涓殑 `openclawDir` 鑷畾涔夐厤缃洰褰曘€?
pub fn gateway_listen_port() -> u16 {
    // 5绉掑唴杩斿洖缂撳瓨鍊硷紝閬垮厤鏈嶅姟鐘舵€佹娴嬫椂棰戠箒璇绘枃浠?
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

/// 鏋勫缓 HTTP 瀹㈡埛绔紝use_proxy=true 鏃惰蛋鐢ㄦ埛閰嶇疆鐨勪唬鐞?
pub fn build_http_client(
    timeout: Duration,
    user_agent: Option<&str>,
) -> Result<reqwest::Client, String> {
    build_http_client_opt(timeout, user_agent, true)
}

/// 鏋勫缓妯″瀷璇锋眰鐢ㄧ殑 HTTP 瀹㈡埛绔?
/// 榛樿涓嶈蛋浠ｇ悊锛涚敤鎴峰湪闈㈡澘璁剧疆涓紑鍚?proxyModelRequests 鍚庢墠璧颁唬鐞?
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

/// 缂撳瓨 enhanced_path 缁撴灉锛岄伩鍏嶆瘡娆¤皟鐢ㄩ兘鎵弿鏂囦欢绯荤粺
/// 浣跨敤 RwLock 鏇夸唬 OnceLock锛屾敮鎸佽繍琛屾椂鍒锋柊缂撳瓨
static ENHANCED_PATH_CACHE: RwLock<Option<String>> = RwLock::new(None);

/// Tauri 搴旂敤鍚姩鏃?PATH 鍙兘涓嶅畬鏁达細
/// - macOS 浠?Finder 鍚姩鏃?PATH 鍙湁 /usr/bin:/bin:/usr/sbin:/sbin
/// - Windows 涓婂畨瑁?Node.js 鍒伴潪榛樿璺緞銆佹垨瀹夎鍚庢湭閲嶅惎杩涚▼
///
/// 琛ュ厖 Node.js / npm 甯歌瀹夎璺緞
pub fn enhanced_path() -> String {
    // 鍏堝皾璇曡缂撳瓨
    if let Ok(guard) = ENHANCED_PATH_CACHE.read() {
        if let Some(ref cached) = *guard {
            return cached.clone();
        }
    }
    // 缂撳瓨涓虹┖锛岄噸鏂版瀯寤?
    let path = build_enhanced_path();
    if let Ok(mut guard) = ENHANCED_PATH_CACHE.write() {
        *guard = Some(path.clone());
    }
    path
}

/// 鍒锋柊 enhanced_path 缂撳瓨锛屼娇鏂拌缃殑 Node.js 璺緞绔嬪嵆鐢熸晥锛堟棤闇€閲嶅惎搴旂敤锛?
pub fn refresh_enhanced_path() {
    let new_path = build_enhanced_path();
    if let Ok(mut guard) = ENHANCED_PATH_CACHE.write() {
        *guard = Some(new_path);
    }
}

fn build_enhanced_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = dirs::home_dir().unwrap_or_default();

    // 璇诲彇鐢ㄦ埛淇濆瓨鐨勮嚜瀹氫箟 Node.js 璺緞
    let custom_path =
        read_panel_config_value().and_then(|v| v.get("nodePath")?.as_str().map(String::from));

    #[cfg(target_os = "macos")]
    {
        // 鐗堟湰绠＄悊鍣ㄨ矾寰勪紭鍏堜簬绯荤粺璺緞锛岀‘淇?nvm/volta/fnm 绠＄悊鐨?Node.js 鐗堟湰琚紭鍏堟娴嬪埌
        let mut extra: Vec<String> = vec![
            format!("{}/.nvm/current/bin", home.display()),
            format!("{}/.volta/bin", home.display()),
            format!("{}/.nodenv/shims", home.display()),
            format!("{}/n/bin", home.display()),
            format!("{}/.npm-global/bin", home.display()),
            "/usr/local/bin".into(),
            "/opt/homebrew/bin".into(),
        ];
        // 渚挎惡妯″紡锛氬唴缃?OpenClaw 鑷甫鐨?Node.js 璺緞锛堟渶楂樹紭鍏堢骇锛?
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
        // NPM_CONFIG_PREFIX: 鐢ㄦ埛閫氳繃 npm config set prefix 鑷畾涔夌殑鍏ㄥ眬瀹夎璺緞
        if let Ok(prefix) = std::env::var("NPM_CONFIG_PREFIX") {
            extra.push(format!("{}/bin", prefix));
        }
        // standalone 瀹夎鐩綍锛堥泦涓鐞嗭紝閬垮厤澶氬纭紪鐮侊級
        for sa_dir in config::all_standalone_dirs() {
            extra.push(sa_dir.to_string_lossy().into_owned());
        }
        // 鎵弿 nvm 瀹為檯瀹夎鐨勭増鏈洰褰曪紙鍏煎鏃?current 绗﹀彿閾炬帴鐨勬儏鍐碉級
        // 鎸夌増鏈彿鍊掑簭鎺掑垪锛岀‘淇濇渶鏂扮増浼樺厛锛堜慨澶?#143锛歷20 鎺掑湪 v24 鍓嶉潰锛?
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
        // fnm: 鎵弿 $FNM_DIR 鎴栭粯璁?~/.local/share/fnm 涓嬬殑鐗堟湰鐩綍
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
        // 鐗堟湰绠＄悊鍣ㄨ矾寰勪紭鍏堜簬绯荤粺璺緞锛岀‘淇?nvm/volta/fnm 绠＄悊鐨?Node.js 鐗堟湰琚紭鍏堟娴嬪埌
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
        // 渚挎惡妯″紡锛氬唴缃?OpenClaw 鑷甫鐨?Node.js 璺緞锛堟渶楂樹紭鍏堢骇锛?
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
        // NPM_CONFIG_PREFIX: 鐢ㄦ埛閫氳繃 npm config set prefix 鑷畾涔夌殑鍏ㄥ眬瀹夎璺緞
        if let Ok(prefix) = std::env::var("NPM_CONFIG_PREFIX") {
            extra.push(format!("{}/bin", prefix));
        }
        // standalone 瀹夎鐩綍锛堥泦涓鐞嗭紝閬垮厤澶氬纭紪鐮侊級
        for sa_dir in config::all_standalone_dirs() {
            extra.push(sa_dir.to_string_lossy().into_owned());
        }
        // NVM_DIR 鐜鍙橀噺锛堢敤鎴峰彲鑳借嚜瀹氫箟浜?nvm 瀹夎鐩綍锛?
        // 鎸夌増鏈彿鍊掑簭鎺掑垪锛岀‘淇濇渶鏂扮増浼樺厛锛堜慨澶?#143锛歷20 鎺掑湪 v24 鍓嶉潰锛?
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
        // fnm: 鎵弿 $FNM_DIR 鎴栭粯璁?~/.local/share/fnm 涓嬬殑鐗堟湰鐩綍
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
        // nodesource / 鎵嬪姩瀹夎鐨?Node.js 鍙兘鍦?/usr/local/lib/nodejs/ 涓?
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

        // 鐗堟湰绠＄悊鍣ㄨ矾寰勪紭鍏堬紝纭繚 nvm/volta/fnm 绠＄悊鐨?Node.js 琚紭鍏堟娴嬪埌
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

        // 1. NVM_SYMLINK锛坣vm-windows 娲昏穬鐗堟湰绗﹀彿閾炬帴锛屽 D:\nodejs锛夆€斺€?鏈€楂樹紭鍏堢骇
        // 澧炲己锛氬皾璇曡В鏋愮鍙烽摼鎺ョ洰鏍?
        if let Ok(nvm_symlink) = std::env::var("NVM_SYMLINK") {
            let symlink_path = std::path::Path::new(&nvm_symlink);
            if symlink_path.is_dir() {
                extra.push(nvm_symlink.clone());
            }
            // 濡傛灉鏄鍙烽摼鎺ワ紝灏濊瘯璇诲彇鍏跺疄闄呮寚鍚戠殑鐩爣
            #[cfg(target_os = "windows")]
            if symlink_path.is_symlink() {
                if let Ok(target) = std::fs::read_link(symlink_path) {
                    if target.is_dir() {
                        extra.push(target.to_string_lossy().to_string());
                    }
                }
            }
        }

        // 2. NVM_HOME锛堢敤鎴疯嚜瀹氫箟 nvm 瀹夎鐩綍锛?
        if let Ok(nvm_home) = std::env::var("NVM_HOME") {
            let nvm_path = std::path::Path::new(&nvm_home);
            if nvm_path.is_dir() {
                // 鎵弿鎵€鏈夊凡瀹夎鐨勭増鏈洰褰?
                if let Ok(entries) = std::fs::read_dir(nvm_path) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() && p.join("node.exe").exists() {
                            extra.push(p.to_string_lossy().to_string());
                        }
                    }
                }
                // 灏濊瘯浠?settings.json 璇诲彇褰撳墠婵€娲荤増鏈?
                let settings_path = nvm_path.join("settings.json");
                if settings_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&settings_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            // settings.json 涓湁 "path" 瀛楁鎸囧悜褰撳墠鐗堟湰
                            if let Some(current_version) = json.get("path").and_then(|v| v.as_str())
                            {
                                let version_path = nvm_path.join(current_version);
                                if version_path.is_dir() {
                                    // 灏嗗綋鍓嶆縺娲荤増鏈Щ鍒版洿楂樹紭鍏堢骇
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

        // 3. %APPDATA%\nvm锛坣vm-windows 榛樿瀹夎鐩綍锛?
        if !appdata.is_empty() {
            let nvm_dir = std::path::Path::new(&appdata).join("nvm");
            if nvm_dir.is_dir() {
                // 鎵弿鎵€鏈夊凡瀹夎鐨勭増鏈?
                if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() && p.join("node.exe").exists() {
                            extra.push(p.to_string_lossy().to_string());
                        }
                    }
                }
                // 灏濊瘯浠?settings.json 璇诲彇褰撳墠婵€娲荤増鏈?
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
        // volta 鐨勬椿璺冪増鏈?
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
            // 灏濊瘯鎵惧埌 fnm 鐨勫綋鍓嶆椿璺冪増鏈?
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
            // 鎵弿鎵€鏈夌増鏈?
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

        // 6. npm 鍏ㄥ眬锛坥penclaw.cmd 閫氬父鍦ㄨ繖閲岋級
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

        // 6.5 standalone 瀹夎鐩綍锛堥泦涓鐞嗭紝閬垮厤澶氬纭紪鐮侊級
        // standalone 瀹夎鍚庨€氳繃娉ㄥ唽琛ㄥ啓鍏ョ敤鎴?PATH锛屼絾褰撳墠杩涚▼鐨?PATH 鐜鍙橀噺涓嶄細
        // 瀹炴椂鏇存柊锛岄渶瑕佹樉寮忔坊鍔犲埌 enhanced_path 浠ョ‘淇?resolve_openclaw_cli_path()
        // 鑳芥壘鍒?standalone 瀹夎鐨?openclaw.cmd
        for sa_dir in config::all_standalone_dirs() {
            extra.push(sa_dir.to_string_lossy().into_owned());
        }

        // 渚挎惡妯″紡锛氬唴缃?OpenClaw 鑷甫鐨?Node.js 璺緞锛堟渶楂樹紭鍏堢骇锛?
        if let Some(bundled) = bundled_openclaw_bin_dir() {
            extra.insert(0, bundled.to_string_lossy().into_owned());
        }

        // 7. 绯荤粺榛樿 Node.js 瀹夎璺緞锛堜紭鍏堢骇鏈€浣庯級
        extra.push(format!(r"{}\nodejs", pf));
        extra.push(format!(r"{}\nodejs", pf86));
        if !localappdata.is_empty() {
            extra.push(format!(r"{}\Programs\nodejs", localappdata));
        }

        // 8. 鎵弿甯歌鐩樼涓嬬殑 Node 瀹夎锛堢敤鎴峰彲鑳借鍦?D:\銆丗:\ 绛夛級
        for drive in &["C", "D", "E", "F"] {
            extra.push(format!(r"{}:\nodejs", drive));
            extra.push(format!(r"{}:\Node", drive));
            extra.push(format!(r"{}:\Program Files\nodejs", drive));
            // 甯歌 AI/Dev 宸ュ叿鐩綍
            extra.push(format!(r"{}:\AI\Node", drive));
            extra.push(format!(r"{}:\AI\nodejs", drive));
            extra.push(format!(r"{}:\Dev\nodejs", drive));
            extra.push(format!(r"{}:\Tools\nodejs", drive));
        }

        let mut parts: Vec<&str> = vec![];
        // 鐢ㄦ埛鑷畾涔夎矾寰勪紭鍏堢骇鏈€楂?
        if let Some(ref cp) = custom_path {
            parts.push(cp.as_str());
        }
        // 鐒跺悗鏄粯璁ゆ壂鎻忓埌鐨勮矾寰勶紙鍘婚噸锛?
        let mut seen = std::collections::HashSet::new();
        for p in &extra {
            if std::path::Path::new(p).exists() && seen.insert(p.clone()) {
                parts.push(p.as_str());
            }
        }
        // 鏈€鍚庢槸绯荤粺 PATH
        if !current.is_empty() {
            parts.push(&current);
        }
        parts.join(";")
    }
}
