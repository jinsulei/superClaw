/// 设备配对命令
/// 自动向 Gateway 注册设备，跳过手动配对流程

const REQUIRED_SCOPES: &[&str] = &[
    "operator.admin",
    "operator.approvals",
    "operator.pairing",
    "operator.read",
    "operator.write",
];

#[tauri::command]
pub fn auto_pair_device() -> Result<String, String> {
    // 无论是否已配对，都确保 gateway.controlUi.allowedOrigins 已写入
    // 必须在最前面，避免因设备密钥不存在而跳过
    patch_gateway_origins();

    let openclaw_dir = crate::commands::openclaw_dir();
    ensure_pairing_for_dir(&openclaw_dir)
}

pub(crate) fn ensure_pairing_for_dir(openclaw_dir: &std::path::Path) -> Result<String, String> {
    // 获取或生成设备密钥（首次安装时自动创建）
    let (device_id, public_key, _) = super::device::get_or_create_key_in_dir(openclaw_dir)?;

    // 读取或创建 paired.json
    let paired_path = openclaw_dir.join("devices").join("paired.json");
    let devices_dir = openclaw_dir.join("devices");

    // 确保 devices 目录存在
    if !devices_dir.exists() {
        std::fs::create_dir_all(&devices_dir).map_err(|e| format!("创建 devices 目录失败: {e}"))?;
    }

    let mut paired: serde_json::Value = if paired_path.exists() {
        let content = std::fs::read_to_string(&paired_path)
            .map_err(|e| format!("读取 paired.json 失败: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("解析 paired.json 失败: {e}"))?
    } else {
        serde_json::json!({})
    };

    let os_platform = std::env::consts::OS; // "windows" | "macos" | "linux"

    // 如果已配对，档查 platform 字段是否正确；不正确则覆盖更新，
    // 避免 Gateway 因 metadata-upgrade 拒绝静默自动配对
    if let Some(existing) = paired.get_mut(&device_id) {
        if patch_existing_pairing_record(existing, os_platform) {
            let new_content = serde_json::to_string_pretty(&paired)
                .map_err(|e| format!("serialize paired.json failed: {e}"))?;
            std::fs::write(&paired_path, new_content)
                .map_err(|e| format!("update paired.json failed: {e}"))?;
            return Ok("device pairing scopes repaired".into());
        }
        let current_platform = existing
            .get("platform")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if current_platform != os_platform {
            if let Some(obj) = existing.as_object_mut() {
                obj.insert(
                    "platform".to_string(),
                    serde_json::Value::String(os_platform.to_string()),
                );
                obj.insert(
                    "deviceFamily".to_string(),
                    serde_json::Value::String("desktop".to_string()),
                );
            }
            let new_content = serde_json::to_string_pretty(&paired)
                .map_err(|e| format!("序列化 paired.json 失败: {e}"))?;
            std::fs::write(&paired_path, new_content)
                .map_err(|e| format!("更新 paired.json 失败: {e}"))?;
            return Ok("设备已配对（已修正平台字段）".into());
        }
        return Ok("设备已配对".into());
    }

    // 添加设备到配对列表
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    paired[&device_id] = serde_json::json!({
        "deviceId": device_id,
        "publicKey": public_key,
        "platform": os_platform,
        "deviceFamily": "desktop",
        "clientId": "openclaw-control-ui",
        "clientMode": "ui",
        "role": "operator",
        "roles": ["operator"],
        "scopes": REQUIRED_SCOPES,
        "approvedScopes": REQUIRED_SCOPES,
        "tokens": {},
        "createdAtMs": now_ms,
        "approvedAtMs": now_ms
    });

    // 写入 paired.json
    let new_content = serde_json::to_string_pretty(&paired)
        .map_err(|e| format!("序列化 paired.json 失败: {e}"))?;

    std::fs::write(&paired_path, new_content).map_err(|e| format!("写入 paired.json 失败: {e}"))?;

    Ok("设备配对成功".into())
}

/// 将 Tauri 应用的 origin 写入 gateway.controlUi.allowedOrigins
/// 避免 Gateway 因 origin not allowed 拒绝 WebSocket 握手
fn patch_existing_pairing_record(record: &mut serde_json::Value, os_platform: &str) -> bool {
    let Some(obj) = record.as_object_mut() else {
        return false;
    };

    let mut changed = false;
    if obj.get("platform").and_then(|v| v.as_str()) != Some(os_platform) {
        obj.insert(
            "platform".into(),
            serde_json::Value::String(os_platform.into()),
        );
        changed = true;
    }
    if obj.get("deviceFamily").and_then(|v| v.as_str()) != Some("desktop") {
        obj.insert(
            "deviceFamily".into(),
            serde_json::Value::String("desktop".into()),
        );
        changed = true;
    }
    if obj.get("clientId").and_then(|v| v.as_str()) != Some("openclaw-control-ui") {
        obj.insert(
            "clientId".into(),
            serde_json::Value::String("openclaw-control-ui".into()),
        );
        changed = true;
    }
    if obj.get("clientMode").and_then(|v| v.as_str()) != Some("ui") {
        obj.insert("clientMode".into(), serde_json::Value::String("ui".into()));
        changed = true;
    }
    if obj.get("role").and_then(|v| v.as_str()) != Some("operator") {
        obj.insert("role".into(), serde_json::Value::String("operator".into()));
        changed = true;
    }
    if ensure_string_array_contains(obj, "roles", &["operator"]) {
        changed = true;
    }
    if ensure_string_array_contains(obj, "scopes", REQUIRED_SCOPES) {
        changed = true;
    }
    if ensure_string_array_contains(obj, "approvedScopes", REQUIRED_SCOPES) {
        changed = true;
    }

    if let Some(tokens) = obj.get_mut("tokens").and_then(|v| v.as_object_mut()) {
        for token in tokens.values_mut() {
            if let Some(token_obj) = token.as_object_mut() {
                if ensure_string_array_contains(token_obj, "scopes", REQUIRED_SCOPES) {
                    changed = true;
                }
            }
        }
    }

    changed
}

fn ensure_string_array_contains(
    obj: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    required: &[&str],
) -> bool {
    let mut values = obj
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut changed = !obj.get(key).is_some_and(|v| v.is_array());
    for item in required {
        if !values.iter().any(|v| v == item) {
            values.push((*item).to_string());
            changed = true;
        }
    }

    if changed {
        obj.insert(key.to_string(), serde_json::json!(values));
    }
    changed
}

fn patch_gateway_origins() {
    let Ok(mut config) = super::config::load_openclaw_json() else {
        return;
    };

    // Tauri 应用 + 本地开发服务器必须存在的 origin
    let required: Vec<String> = vec![
        "tauri://localhost".into(),
        "https://tauri.localhost".into(),
        "http://tauri.localhost".into(),
        "http://localhost:1420".into(),
        "http://127.0.0.1:1420".into(),
    ];

    if let Some(obj) = config.as_object_mut() {
        let gateway = obj
            .entry("gateway")
            .or_insert_with(|| serde_json::json!({}));
        if let Some(gw) = gateway.as_object_mut() {
            let control_ui = gw
                .entry("controlUi")
                .or_insert_with(|| serde_json::json!({}));
            if let Some(cui) = control_ui.as_object_mut() {
                // 合并：保留用户已有的 origin，追加缺失的 Tauri origin
                let existing: Vec<String> = cui
                    .get("allowedOrigins")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|s| s.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                let mut merged = existing;
                for r in &required {
                    if !merged.iter().any(|e| e == r) {
                        merged.push(r.clone());
                    }
                }
                cui.insert("allowedOrigins".to_string(), serde_json::json!(merged));
            }
        }
    }

    let _ = super::config::save_openclaw_json(&config);
}

#[tauri::command]
pub fn check_pairing_status() -> Result<bool, String> {
    // 读取设备密钥
    let device_key_path = crate::commands::openclaw_dir().join("clawpanel-device-key.json");
    if !device_key_path.exists() {
        return Ok(false);
    }

    let device_key_content =
        std::fs::read_to_string(&device_key_path).map_err(|e| format!("读取设备密钥失败: {e}"))?;

    let device_key: serde_json::Value =
        serde_json::from_str(&device_key_content).map_err(|e| format!("解析设备密钥失败: {e}"))?;

    let device_id = device_key["deviceId"].as_str().ok_or("设备 ID 不存在")?;

    // 检查 paired.json
    let paired_path = crate::commands::openclaw_dir()
        .join("devices")
        .join("paired.json");
    if !paired_path.exists() {
        return Ok(false);
    }

    let content =
        std::fs::read_to_string(&paired_path).map_err(|e| format!("读取 paired.json 失败: {e}"))?;

    let paired: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析 paired.json 失败: {e}"))?;

    Ok(paired.get(device_id).is_some())
}

async fn run_pairing_command(args: Vec<String>) -> Result<String, String> {
    let mut cmd = crate::utils::openclaw_command_async();
    cmd.args(args);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("执行 openclaw 失败: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let message = match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => String::new(),
    };

    if output.status.success() {
        Ok(if message.is_empty() {
            "操作完成".into()
        } else {
            message
        })
    } else {
        Err(if message.is_empty() {
            format!("命令执行失败: {}", output.status)
        } else {
            message
        })
    }
}

#[tauri::command]
pub async fn pairing_list_channel(channel: String) -> Result<String, String> {
    let channel = channel.trim();
    if channel.is_empty() {
        return Err("channel 不能为空".into());
    }
    run_pairing_command(vec!["pairing".into(), "list".into(), channel.into()]).await
}

#[tauri::command]
pub async fn pairing_approve_channel(
    channel: String,
    code: String,
    notify: bool,
) -> Result<String, String> {
    let channel = channel.trim();
    let code = code.trim();
    if channel.is_empty() {
        return Err("channel 不能为空".into());
    }
    if code.is_empty() {
        return Err("配对码不能为空".into());
    }
    let mut args = vec![
        "pairing".into(),
        "approve".into(),
        channel.into(),
        code.into(),
    ];
    if notify {
        args.push("--notify".into());
    }
    run_pairing_command(args).await
}
