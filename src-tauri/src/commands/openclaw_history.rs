use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use super::openclaw_dir;

fn sessions_dir() -> std::path::PathBuf {
    openclaw_dir().join("agents").join("main").join("sessions")
}

fn canonical_openclaw_workspace_output(path: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(path);
    let workspace = openclaw_dir().join("workspace");
    let workspace = workspace
        .canonicalize()
        .map_err(|error| format!("OpenClaw 工作区不可用: {error}"))?;
    let target = requested
        .canonicalize()
        .map_err(|error| format!("输出文件不存在或不可访问: {error}"))?;
    if !target.is_file() || !target.starts_with(&workspace) {
        return Err("只能访问当前 OpenClaw 便携工作区内的输出文件".to_string());
    }
    Ok(target)
}

fn safe_output_filename(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| "openclaw-output".to_string())
}

fn openclaw_gateway_media_request(path: &str) -> Result<(String, String), String> {
    let route = path.trim();
    if !route.starts_with("/api/chat/media/outgoing/")
        || route.contains('?')
        || route.contains('#')
        || route.contains('\\')
    {
        return Err("不允许的 OpenClaw 图片地址".to_string());
    }

    let config = super::config::load_openclaw_json()?;
    let port = config
        .pointer("/gateway/port")
        .and_then(Value::as_u64)
        .and_then(|value| u16::try_from(value).ok())
        .filter(|value| *value > 0)
        .unwrap_or(18789);
    let token = config
        .pointer("/gateway/auth/token")
        .or_else(|| config.pointer("/gateway/authToken"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if token.is_empty() {
        return Err("OpenClaw Gateway 未配置图片读取认证".to_string());
    }
    Ok((format!("http://127.0.0.1:{port}{route}"), token))
}

/// Loads an authenticated Gateway media response into a data URL without
/// exposing the portable Gateway token to WebView image elements.
#[tauri::command]
pub async fn openclaw_load_gateway_media(path: String) -> Result<String, String> {
    let (url, token) = openclaw_gateway_media_request(&path)?;
    let client = super::build_http_client_no_proxy(
        Duration::from_secs(15),
        Some("SuperClaw/OpenClawMedia"),
    )?;
    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|error| format!("读取 OpenClaw 图片失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "读取 OpenClaw 图片失败: HTTP {}",
            response.status()
        ));
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if !mime.starts_with("image/") {
        return Err("OpenClaw 返回的媒体不是图片".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取 OpenClaw 图片内容失败: {error}"))?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("OpenClaw 图片超过 20MB 限制".to_string());
    }
    // Gateway outgoing media is ephemeral. Archive a successful read without
    // making the current render depend on the archival write succeeding.
    let archive_path = gateway_media_archive_path(&path, &mime);
    if fs::create_dir_all(history_media_dir()).is_ok() && !archive_path.exists() {
        let _ = fs::write(&archive_path, &bytes);
    }
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

/// Loads a generated OpenClaw image from the portable data directory when the
/// short-lived Gateway media URL is no longer available after a restart.
#[tauri::command]
pub async fn openclaw_load_local_media(path: String) -> Result<String, String> {
    let requested = PathBuf::from(path.trim().trim_matches(&['"', '\''][..]));
    let filepath = tokio::fs::canonicalize(&requested)
        .await
        .map_err(|error| format!("OpenClaw local media not found: {error}"))?;
    // The portable `.openclaw/media` directory may not exist yet (the generated
    // media output dir is created lazily). A missing media root is simply "no
    // match" here, not a hard failure, so images written to the generated media
    // output dir still resolve through the generated_root check below.
    let media_root = tokio::fs::canonicalize(openclaw_dir().join("media")).await.ok();
    let generated_root =
        super::media_output_data_dir().and_then(|root| std::fs::canonicalize(root).ok());
    // Allow the `data/generated` parent of the generated media dir as well, in
    // case a plugin drops an artifact directly under generated/.
    let generated_parent = generated_root
        .as_ref()
        .and_then(|root| root.parent().and_then(|parent| std::fs::canonicalize(parent).ok()));
    let is_allowed = media_root
        .as_ref()
        .map(|root| filepath.starts_with(root))
        .unwrap_or(false)
        || generated_root
            .as_ref()
            .map(|root| filepath.starts_with(root))
            .unwrap_or(false)
        || generated_parent
            .as_ref()
            .map(|root| filepath.starts_with(root))
            .unwrap_or(false);
    if !filepath.is_file() || !is_allowed {
        return Err(
            "OpenClaw local media path is outside the portable media directories".to_string(),
        );
    }
    let mime = match filepath
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Err("Unsupported OpenClaw local media type".to_string()),
    };
    let bytes = tokio::fs::read(&filepath)
        .await
        .map_err(|error| format!("Failed to read OpenClaw local media: {error}"))?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("OpenClaw local media is larger than 20MB".to_string());
    }
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub async fn openclaw_open_workspace_output(path: String) -> Result<String, String> {
    let target = canonical_openclaw_workspace_output(&path)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe")
            .arg(&target)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| format!("打开输出文件失败: {error}"))?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&target)
        .spawn()
        .map_err(|error| format!("打开输出文件失败: {error}"))?;
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map_err(|error| format!("打开输出文件失败: {error}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn openclaw_download_workspace_output(path: String) -> Result<Value, String> {
    let source = canonical_openclaw_workspace_output(&path)?;
    let downloads = dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("SuperClaw");
    fs::create_dir_all(&downloads).map_err(|error| format!("创建下载目录失败: {error}"))?;
    let destination = downloads.join(safe_output_filename(&source));
    fs::copy(&source, &destination).map_err(|error| format!("导出输出文件失败: {error}"))?;
    Ok(json!({
        "path": destination.to_string_lossy(),
        "fileName": safe_output_filename(&source),
    }))
}

fn best_effort_registry_entries(source: &str) -> Vec<(String, Value)> {
    let lines = source.lines().collect::<Vec<_>>();
    let mut entries = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let Some(key) = line
            .strip_prefix("  \"")
            .and_then(|value| value.split_once("\": {"))
            .map(|(value, _)| value.to_string())
        else {
            continue;
        };
        // A registry entry can contain a long system prompt report before its
        // terminal status. Keep reading until the next top-level agent entry
        // so recovery can still tell whether a native run has finished.
        let window = lines
            .iter()
            .skip(index + 1)
            .take_while(|candidate| !candidate.starts_with("  \"agent:"))
            .copied()
            .collect::<Vec<_>>();
        let field = |name: &str| {
            let prefix = format!("\"{name}\": \"");
            window.iter().find_map(|candidate| {
                candidate
                    .trim()
                    .strip_prefix(&prefix)
                    .and_then(|value| value.split('"').next())
                    .map(str::to_string)
            })
        };
        let number = |name: &str| {
            let prefix = format!("\"{name}\": ");
            window.iter().find_map(|candidate| {
                candidate
                    .trim()
                    .strip_prefix(&prefix)
                    .and_then(|value| value.trim_end_matches(',').parse::<i64>().ok())
            })
        };
        let Some(session_id) = field("sessionId") else {
            continue;
        };
        entries.push((
            key,
            json!({
                "sessionId": session_id,
                "updatedAt": number("updatedAt"),
                "lastInteractionAt": number("lastInteractionAt"),
                "sessionStartedAt": number("sessionStartedAt"),
                "endedAt": number("endedAt"),
                "status": field("status"),
            }),
        ));
    }
    entries
}

fn read_session_entries() -> Result<Vec<(String, Value)>, String> {
    let registry = sessions_dir().join("sessions.json");
    let source = fs::read_to_string(&registry)
        .map_err(|err| format!("read sessions registry failed: {err}"))?;
    if let Ok(Value::Object(entries)) = serde_json::from_str::<Value>(&source) {
        return Ok(entries.into_iter().collect());
    }
    let recovered = best_effort_registry_entries(&source);
    if recovered.is_empty() {
        return Err(
            "parse sessions registry failed and no recoverable entries were found".to_string(),
        );
    }
    Ok(recovered)
}

fn portable_session_history_ids(entry: &Value, current_id: &str) -> Vec<String> {
    let mut ids = entry
        .get("usageFamilySessionIds")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if !ids.iter().any(|id| id == current_id) {
        ids.push(current_id.to_string());
    }
    ids.retain(|id| {
        id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    });
    ids.dedup();
    ids
}

fn portable_session_history_file(sessions_dir: &Path, session_id: &str) -> Option<PathBuf> {
    let active = sessions_dir.join(format!("{session_id}.jsonl"));
    if active.is_file() {
        return Some(active);
    }
    let prefix = format!("{session_id}.jsonl.");
    let mut archived = fs::read_dir(sessions_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                return false;
            };
            path.is_file()
                && name.starts_with(&prefix)
                && (name.contains(".reset.") || name.contains(".deleted."))
        })
        .collect::<Vec<_>>();
    archived.sort();
    archived.pop()
}

fn append_portable_session_messages(source: &str, session_key: &str, messages: &mut Vec<Value>) {
    for line in source.lines() {
        let Ok(entry) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if entry.get("type").and_then(Value::as_str) != Some("message") {
            continue;
        }
        let Some(message) = entry.get("message") else {
            continue;
        };
        let Some(role) = message.get("role").and_then(Value::as_str) else {
            continue;
        };
        if !matches!(role, "user" | "assistant" | "toolResult") {
            continue;
        }
        messages.push(json!({
            "id": entry.get("id").and_then(Value::as_str).unwrap_or_default(),
            "parentId": entry.get("parentId").and_then(Value::as_str).unwrap_or_default(),
            "role": role,
            "sessionKey": session_key,
            "idempotencyKey": message.get("idempotencyKey").and_then(Value::as_str).unwrap_or_default(),
            "clientRequestId": message.get("clientRequestId").and_then(Value::as_str).unwrap_or_default(),
            "requestId": message.get("requestId").and_then(Value::as_str).unwrap_or_default(),
            "runId": message.get("runId").and_then(Value::as_str).unwrap_or_default(),
            "stopReason": message.get("stopReason").and_then(Value::as_str).unwrap_or_default(),
            "text": text_content(message),
            "toolName": message.get("toolName").and_then(Value::as_str).unwrap_or_default(),
            "toolCallId": message.get("toolCallId").and_then(Value::as_str).unwrap_or_default(),
            "tools": tool_calls(message),
            "isError": tool_result_failed(message),
            "status": if tool_result_failed(message) { "error" } else { "completed" },
            "timestamp": entry.get("timestamp").and_then(Value::as_str).unwrap_or_default(),
            "content": message.get("content").cloned().unwrap_or(Value::Null),
            "attachments": if role == "user" {
                user_image_attachments(message)
            } else {
                image_attachments(message)
            },
        }));
    }
}

fn media_paths_in_text(value: &str) -> Vec<String> {
    value
        .lines()
        .filter_map(|line| line.trim().strip_prefix("MEDIA:"))
        .map(|path| path.trim().trim_matches(&['"', '\''][..]).to_string())
        .filter(|path| {
            let lower = path.to_ascii_lowercase();
            lower.ends_with(".png")
                || lower.ends_with(".jpg")
                || lower.ends_with(".jpeg")
                || lower.ends_with(".gif")
                || lower.ends_with(".webp")
        })
        .collect()
}

fn stable_media_key(value: &str) -> String {
    // A deterministic local key lets history recover media after Gateway's
    // short-lived outgoing URL has expired.
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn media_extension_for_mime(mime: &str) -> &'static str {
    match mime.to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    }
}

fn history_media_dir() -> PathBuf {
    openclaw_dir().join("media").join("history")
}

fn archive_openclaw_media_file(source: &str) -> Option<String> {
    let source = PathBuf::from(source.trim().trim_matches(&['"', '\''][..]));
    let source = source.canonicalize().ok()?;
    let media_root = openclaw_dir().join("media").canonicalize().ok()?;
    if !source.is_file() || !source.starts_with(&media_root) {
        return None;
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("png");
    let target_dir = history_media_dir();
    fs::create_dir_all(&target_dir).ok()?;
    let target = target_dir.join(format!(
        "generated-{}.{}",
        stable_media_key(&source.to_string_lossy()),
        extension
    ));
    if !target.exists() && fs::copy(&source, &target).is_err() {
        return None;
    }
    Some(target.to_string_lossy().to_string())
}

fn gateway_media_archive_path(route: &str, mime: &str) -> PathBuf {
    history_media_dir().join(format!(
        "gateway-{}.{}",
        stable_media_key(route),
        media_extension_for_mime(mime)
    ))
}

fn archived_gateway_media_path(route: &str) -> Option<String> {
    ["png", "jpg", "gif", "webp"]
        .into_iter()
        .find_map(|extension| {
            let target = history_media_dir().join(format!(
                "gateway-{}.{}",
                stable_media_key(route),
                extension
            ));
            target
                .is_file()
                .then(|| target.to_string_lossy().to_string())
        })
}

fn attach_openclaw_local_media_fallbacks(messages: &mut [Value]) {
    let mut pending_paths = Vec::<String>::new();
    for message in messages {
        if message.get("role").and_then(Value::as_str) != Some("assistant") {
            continue;
        }
        let paths = media_paths_in_text(&text_content(message));
        if !paths.is_empty() {
            pending_paths = paths;
        }
        let Some(attachments) = message.get_mut("attachments").and_then(Value::as_array_mut) else {
            continue;
        };
        if pending_paths.is_empty() {
            continue;
        }
        let mut attached_any = false;
        for (index, attachment) in attachments.iter_mut().enumerate() {
            let url = attachment
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if url.starts_with("/api/chat/media/outgoing/")
                && attachment.get("fallbackMediaPath").is_none()
            {
                if let Some(object) = attachment.as_object_mut() {
                    let source = pending_paths
                        .get(index)
                        .or_else(|| pending_paths.last())
                        .map(String::as_str)
                        .and_then(archive_openclaw_media_file)
                        .or_else(|| archived_gateway_media_path(&url));
                    let Some(source) = source else {
                        continue;
                    };
                    object.insert("fallbackMediaPath".to_string(), Value::String(source));
                    attached_any = true;
                }
            }
        }
        if attached_any {
            pending_paths.clear();
        }
    }
}

fn text_content(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|block| {
                (block.get("type").and_then(Value::as_str) == Some("text")).then(|| {
                    block
                        .get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                })
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn tool_calls(message: &Value) -> Vec<Value> {
    message
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|block| {
                    (block.get("type").and_then(Value::as_str) == Some("toolCall")).then(|| {
                        json!({
                            "id": block.get("id").and_then(Value::as_str).unwrap_or_default(),
                            "name": block.get("name").and_then(Value::as_str).unwrap_or("tool"),
                            "input": block.get("arguments").cloned().unwrap_or(Value::Null),
                            "status": "running",
                        })
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Preserve native assistant media as ordinary chat attachments as well as in
/// the original content array. The WebView can then restore media after a
/// restart without depending on a particular Gateway message projection.
fn image_attachments(message: &Value) -> Vec<Value> {
    message.get("content").and_then(Value::as_array)
        .map(|blocks| blocks.iter().filter_map(|block| {
            (block.get("type").and_then(Value::as_str) == Some("image")).then(|| {
                let url = block.get("url")
                    .or_else(|| block.get("imageUrl"))
                    .or_else(|| block.get("source").and_then(|source| source.get("url")))
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let data = block.get("data")
                    .or_else(|| block.get("source").and_then(|source| source.get("data")))
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if url.is_empty() && data.is_empty() { return Value::Null; }
                json!({
                    "category": "image",
                    "type": "image",
                    "mimeType": block.get("mimeType").or_else(|| block.get("mediaType")).and_then(Value::as_str).unwrap_or("image/png"),
                    "url": url,
                    "imageUrl": url,
                    "content": data,
                    "fileName": block.get("fileName").or_else(|| block.get("name")).and_then(Value::as_str).unwrap_or_default(),
                })
            })
        }).filter(|attachment| !attachment.is_null()).collect())
        .unwrap_or_default()
}

/// Native OpenClaw user turns carry uploaded media as top-level
/// `MediaPath`/`MediaPaths` (+ `MediaType`/`MediaTypes`) fields on the message
/// object rather than as content blocks. Surface those as ordinary image
/// attachments so a WebView refresh can restore the user's original upload.
fn user_image_attachments(message: &Value) -> Vec<Value> {
    let paths = message
        .get("MediaPaths")
        .and_then(Value::as_array)
        .map(|array| {
            array
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .or_else(|| {
            message
                .get("MediaPath")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(|path| vec![path.to_string()])
        })
        .unwrap_or_default();
    let types = message
        .get("MediaTypes")
        .and_then(Value::as_array)
        .map(|array| {
            array
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .or_else(|| {
            message
                .get("MediaType")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| vec![value.to_string()])
        })
        .unwrap_or_default();
    paths
        .into_iter()
        .enumerate()
        .map(|(index, path)| {
            let trimmed = path.trim().trim_matches(&['"', '\''][..]).to_string();
            if trimmed.is_empty() {
                return Value::Null;
            }
            let extension = std::path::Path::new(&trimmed)
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            let mime = types.get(index).cloned().unwrap_or_else(|| {
                match extension.as_str() {
                    "jpg" | "jpeg" => "image/jpeg".to_string(),
                    "gif" => "image/gif".to_string(),
                    "webp" => "image/webp".to_string(),
                    _ => "image/png".to_string(),
                }
            });
            json!({
                "category": "image",
                "type": "image",
                "mimeType": mime,
                "mediaPath": trimmed,
                "generatedMediaPath": trimmed,
                "fileName": std::path::Path::new(&trimmed).file_name().and_then(|name| name.to_str()).unwrap_or("image").to_string(),
            })
        })
        .filter(|attachment| !attachment.is_null())
        .collect()
}

fn tool_result_failed(message: &Value) -> bool {
    message.get("isError").and_then(Value::as_bool) == Some(true)
        || message
            .get("details")
            .and_then(|details| details.get("exitCode"))
            .and_then(Value::as_i64)
            .map(|code| code != 0)
            .unwrap_or(false)
}

fn trajectory_messages(source: &str) -> Vec<Value> {
    #[derive(Default)]
    struct RunProjection {
        timestamp: String,
        prompt: String,
        assistant_texts: Vec<String>,
        timeline: Vec<Value>,
    }

    let mut runs = BTreeMap::<String, RunProjection>::new();
    for line in source.lines() {
        let Ok(entry) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let entry_type = entry
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !matches!(entry_type, "model.completed" | "trace.artifacts") {
            continue;
        }
        let run_id = entry
            .get("runId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if run_id.is_empty() {
            continue;
        }
        let data = entry.get("data").unwrap_or(&Value::Null);
        let run = runs.entry(run_id.to_string()).or_default();
        if run.timestamp.is_empty() {
            run.timestamp = entry
                .get("ts")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
        }
        if let Some(prompt) = data.get("finalPromptText").and_then(Value::as_str) {
            if !prompt.trim().is_empty() {
                run.prompt = prompt.to_string();
            }
        }
        if let Some(texts) = data.get("assistantTexts").and_then(Value::as_array) {
            let values = texts
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>();
            if values.len() >= run.assistant_texts.len() {
                run.assistant_texts = values;
            }
        }
        if entry_type == "trace.artifacts" {
            if let Some(items) = data.get("itemLifecycle").and_then(Value::as_array) {
                for (index, item) in items.iter().enumerate() {
                    let label = item
                        .get("title")
                        .or_else(|| item.get("name"))
                        .or_else(|| item.get("summary"))
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .trim();
                    if label.is_empty() {
                        continue;
                    }
                    run.timeline.push(json!({
                        "key": format!("trajectory-item-{run_id}-{index}"),
                        "kind": item.get("kind").and_then(Value::as_str).unwrap_or("task"),
                        "label": label,
                        "status": item.get("status").and_then(Value::as_str).unwrap_or("completed"),
                    }));
                }
            }
            if let Some(tools) = data.get("toolMetas").and_then(Value::as_array) {
                for (index, tool) in tools.iter().enumerate() {
                    let label = tool
                        .get("name")
                        .or_else(|| tool.get("toolName"))
                        .and_then(Value::as_str)
                        .unwrap_or("tool");
                    run.timeline.push(json!({
                        "key": format!("trajectory-tool-{run_id}-{index}"),
                        "kind": "tool",
                        "label": label,
                        "status": if tool.get("isError").and_then(Value::as_bool) == Some(true) { "error" } else { "completed" },
                    }));
                }
            }
        }
    }

    let mut messages = Vec::new();
    for (run_id, mut run) in runs {
        let Some(final_text) = run.assistant_texts.pop() else {
            continue;
        };
        for (index, text) in run.assistant_texts.into_iter().enumerate() {
            run.timeline.push(json!({
                "key": format!("trajectory-progress-{run_id}-{index}"),
                "kind": "progress",
                "label": text.chars().take(600).collect::<String>(),
                "status": "completed",
            }));
        }
        messages.push(json!({
            "id": format!("trajectory-{run_id}"),
            "role": "assistant",
            "runId": run_id,
            "text": final_text,
            "content": final_text,
            "timestamp": run.timestamp,
            "trajectoryPrompt": run.prompt,
            "executionTimeline": run.timeline,
            "trajectoryFinal": true,
        }));
    }
    messages
}

fn compact_terminal_text(value: &str, limit: usize) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= limit {
        return normalized;
    }
    let prefix = normalized.chars().take(limit).collect::<String>();
    format!("{prefix}...")
}

fn history_message_text(message: &Value) -> String {
    message
        .get("text")
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| text_content(message))
}

/// Some OpenClaw provider responses finish immediately after a successful tool
/// result, without emitting the final assistant frame.  The native session is
/// still complete, but leaving the desktop UI waiting would be misleading.
/// Build a narrowly-scoped terminal record only when the trajectory confirms a
/// successful end and the latest user turn has no regular assistant final.
fn successful_tool_only_terminal_messages(
    messages: &[Value],
    trajectory_source: &str,
) -> Vec<Value> {
    let mut completed_runs = Vec::<(String, String)>::new();
    for line in trajectory_source.lines() {
        let Ok(entry) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if entry.get("type").and_then(Value::as_str) != Some("session.ended") {
            continue;
        }
        if entry
            .get("data")
            .and_then(|data| data.get("status"))
            .and_then(Value::as_str)
            != Some("success")
        {
            continue;
        }
        let run_id = entry
            .get("runId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        if run_id.is_empty() {
            continue;
        }
        let timestamp = entry
            .get("ts")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        completed_runs.push((run_id.to_string(), timestamp));
    }
    let Some((run_id, timestamp)) = completed_runs.last() else {
        return Vec::new();
    };

    let Some(last_user_index) = messages
        .iter()
        .rposition(|message| message.get("role").and_then(Value::as_str) == Some("user"))
    else {
        return Vec::new();
    };
    let turn = &messages[last_user_index + 1..];
    let has_regular_final = turn.iter().any(|message| {
        message.get("role").and_then(Value::as_str) == Some("assistant")
            && message.get("stopReason").and_then(Value::as_str) != Some("toolUse")
            && !history_message_text(message).trim().is_empty()
    });
    if has_regular_final {
        return Vec::new();
    }
    let already_projected = messages.iter().any(|message| {
        message.get("role").and_then(Value::as_str) == Some("assistant")
            && message.get("runId").and_then(Value::as_str) == Some(run_id.as_str())
            && message.get("trajectoryFinal").and_then(Value::as_bool) == Some(true)
    });
    if already_projected {
        return Vec::new();
    }

    let last_step = turn.iter().rev().find_map(|message| {
        (message.get("role").and_then(Value::as_str) == Some("assistant")
            && message.get("stopReason").and_then(Value::as_str) == Some("toolUse"))
        .then(|| history_message_text(message))
        .filter(|text| !text.trim().is_empty())
    });
    let last_result = turn.iter().rev().find_map(|message| {
        (message.get("role").and_then(Value::as_str) == Some("toolResult"))
            .then(|| history_message_text(message))
            .filter(|text| !text.trim().is_empty())
    });
    if last_step.is_none() && last_result.is_none() {
        return Vec::new();
    }

    let mut lines = vec!["OpenClaw 原生任务已执行完成。".to_string()];
    if let Some(step) = last_step {
        lines.push(format!(
            "最后处理步骤：{}",
            compact_terminal_text(&step, 500)
        ));
    }
    if let Some(result) = last_result {
        lines.push(format!("执行结果：{}", compact_terminal_text(&result, 900)));
    }
    vec![json!({
        "id": format!("trajectory-tool-only-{run_id}"),
        "role": "assistant",
        "runId": run_id,
        "text": lines.join("\n\n"),
        "content": lines.join("\n\n"),
        "timestamp": timestamp,
        "trajectoryFinal": true,
        "toolOnlyTerminal": true,
    })]
}

/// Read the portable OpenClaw JSONL source of truth. Gateway chat.history can
/// omit user turns after compaction, which makes a UI-only projection unsafe.
#[tauri::command]
pub fn read_openclaw_raw_history(
    session_key: String,
    limit: Option<usize>,
) -> Result<Value, String> {
    let sessions_dir = sessions_dir();
    let entries = read_session_entries()?;
    let session_entry = entries
        .iter()
        .find(|(key, _)| key == &session_key)
        .map(|(_, entry)| entry);
    let session_id = session_entry
        .and_then(|entry| entry.get("sessionId"))
        .and_then(Value::as_str)
        .ok_or_else(|| "session not found".to_string())?;
    let mut messages = Vec::new();
    let family_ids =
        portable_session_history_ids(session_entry.unwrap_or(&Value::Null), session_id);
    for family_id in family_ids {
        let Some(path) = portable_session_history_file(&sessions_dir, &family_id) else {
            continue;
        };
        let source =
            fs::read_to_string(&path).map_err(|err| format!("read raw session failed: {err}"))?;
        let mut segment_messages = Vec::new();
        append_portable_session_messages(&source, &session_key, &mut segment_messages);

        let trajectory_path = sessions_dir.join(format!("{family_id}.trajectory.jsonl"));
        if let Ok(trajectory_source) = fs::read_to_string(&trajectory_path) {
            for mut candidate in trajectory_messages(&trajectory_source) {
                if let Some(object) = candidate.as_object_mut() {
                    object.insert("sessionKey".to_string(), Value::String(session_key.clone()));
                }
                let candidate_run_id = candidate
                    .get("runId")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let candidate_text = text_content(&candidate);
                let already_present = segment_messages.iter().any(|message| {
                    if message.get("role").and_then(Value::as_str) != Some("assistant") {
                        return false;
                    }
                    let same_run = !candidate_run_id.is_empty()
                        && message.get("runId").and_then(Value::as_str) == Some(candidate_run_id);
                    let same_text = !candidate_text.trim().is_empty()
                        && text_content(message).trim() == candidate_text.trim();
                    same_run || same_text
                });
                if !already_present {
                    segment_messages.push(candidate);
                }
            }
            for mut candidate in
                successful_tool_only_terminal_messages(&segment_messages, &trajectory_source)
            {
                if let Some(object) = candidate.as_object_mut() {
                    object.insert("sessionKey".to_string(), Value::String(session_key.clone()));
                }
                segment_messages.push(candidate);
            }
        }
        messages.extend(segment_messages);
    }
    messages.sort_by(|left, right| {
        let left_time = left
            .get("timestamp")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let right_time = right
            .get("timestamp")
            .and_then(Value::as_str)
            .unwrap_or_default();
        left_time.cmp(right_time)
    });
    attach_openclaw_local_media_fallbacks(&mut messages);
    let limit = limit.unwrap_or(1_000).clamp(1, 5_000);
    if messages.len() > limit {
        messages = messages.split_off(messages.len() - limit);
    }
    Ok(json!({
        "sessionKey": session_key,
        "messages": messages,
        "sessionStatus": session_entry.and_then(|entry| entry.get("status")).cloned().unwrap_or(Value::Null),
        "endedAt": session_entry.and_then(|entry| entry.get("endedAt")).cloned().unwrap_or(Value::Null),
    }))
}

/// Read the portable session registry while Gateway is reconnecting. This
/// prevents a WebView restart from replacing the sidebar with an empty list.
#[tauri::command]
pub fn list_openclaw_raw_sessions(limit: Option<usize>) -> Result<Value, String> {
    let entries = read_session_entries()?;
    let mut sessions = entries.iter().filter_map(|(session_key, entry)| {
        let session_id = entry.get("sessionId").and_then(Value::as_str)?;
        Some(json!({
            "sessionKey": session_key,
            "key": session_key,
            "sessionId": session_id,
            "updatedAt": entry.get("updatedAt").cloned().unwrap_or(Value::Null),
            "lastActivity": entry.get("lastInteractionAt").cloned().unwrap_or(Value::Null),
            "createdAt": entry.get("sessionStartedAt").cloned().unwrap_or(Value::Null),
            "endedAt": entry.get("endedAt").cloned().unwrap_or(Value::Null),
            "status": entry.get("status").cloned().unwrap_or(Value::Null),
            "messageCount": entry.get("messageCount").cloned().unwrap_or(Value::Null),
            "compactionCheckpointCount": entry.get("compactionCheckpoints").and_then(Value::as_array).map(|items| items.len()).unwrap_or(0),
        }))
    }).collect::<Vec<_>>();
    sessions.sort_by(|a, b| {
        let a_time = a
            .get("updatedAt")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let b_time = b
            .get("updatedAt")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        b_time.cmp(&a_time)
    });
    sessions.truncate(limit.unwrap_or(80).clamp(1, 500));
    Ok(json!({ "sessions": sessions }))
}

const STUCK_SESSION_TIMEOUT_MS: i64 = 5 * 60 * 1000; // 5 分钟无活动视为卡死

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 从 trajectory 尾部解析会话最后状态：(is_stuck, error, error_type)
/// 优先读 `model.completed` 的 errorMessage/errorCode（如 yyapi 403 余额不足），
/// 其次 `session.ended` 的状态；都没有则返回最后活动时间用于超时判定。
fn parse_trajectory_stuck(trajectory_path: &Path, now: i64) -> (bool, String, String) {
    let content = match fs::read_to_string(trajectory_path) {
        Ok(c) => c,
        Err(_) => return (false, String::new(), String::new()),
    };
    // 从末尾往前解析，最多看 120 行（trajectory 可能很大）
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(120);
    for line in lines[start..].iter().rev() {
        let entry: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let etype = entry.get("type").and_then(Value::as_str).unwrap_or("");
        if etype == "model.completed" {
            let snap = entry
                .pointer("/data/messagesSnapshot")
                .and_then(Value::as_array);
            if let Some(snap) = snap {
                if let Some(last) = snap.last() {
                    let stop_reason = last.get("stopReason").and_then(Value::as_str).unwrap_or("");
                    let err_msg = last
                        .get("errorMessage")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    if stop_reason == "error" || !err_msg.is_empty() {
                        let msg = if !err_msg.is_empty() {
                            err_msg.to_string()
                        } else {
                            "Agent 执行出错".to_string()
                        };
                        return (true, msg, "error".to_string());
                    }
                }
            }
        }
        if etype == "session.ended" || etype == "session.done" {
            let data = entry.get("data").or_else(|| entry.get("payload"));
            let status = data
                .and_then(|d| d.get("status"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let err_msg = data
                .and_then(|d| d.get("error"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if status == "error" {
                let msg = if !err_msg.is_empty() {
                    err_msg.to_string()
                } else {
                    "Agent 已结束但会话状态未更新".to_string()
                };
                return (true, msg, "error".to_string());
            }
            if status == "success" || status == "done" {
                return (true, "Agent 已结束但会话状态未更新".to_string(), "ended".to_string());
            }
        }
    }
    // 最后一条的时间戳 → 超时判定
    if let Some(last_line) = lines.last() {
        if let Ok(entry) = serde_json::from_str::<Value>(last_line) {
            let ts = entry.get("ts").and_then(Value::as_i64).unwrap_or(0);
            if ts > 0 && now - ts > STUCK_SESSION_TIMEOUT_MS {
                return (
                    true,
                    format!("会话已超过 {} 分钟无活动", STUCK_SESSION_TIMEOUT_MS / 60000),
                    "timeout".to_string(),
                );
            }
        }
    }
    (false, String::new(), String::new())
}

/// 检测并修复卡死会话（status=running 但实际已结束/超时），返回修复结果含
/// 错误信息（如 yyapi 403 余额不足），供前端向用户明确提示。打包版没有
/// dev-api 的 /__api/repair_stuck_sessions，此命令提供等价能力。
#[tauri::command]
pub fn repair_stuck_sessions() -> Result<Value, String> {
    let dir = sessions_dir();
    let registry_path = dir.join("sessions.json");
    let mut store: Value = match fs::read_to_string(&registry_path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or(json!({})),
        Err(_) => json!({}),
    };
    let Some(obj) = store.as_object_mut() else {
        return Ok(json!({ "repaired": [], "totalChecked": 0 }));
    };
    let now = now_millis();
    let mut repaired: Vec<Value> = Vec::new();

    for (session_key, entry) in obj.iter_mut() {
        let Some(e) = entry.as_object_mut() else { continue };
        let status = e.get("status").and_then(Value::as_str).unwrap_or("").to_lowercase();
        if status != "running" {
            continue;
        }
        let Some(sid) = e.get("sessionId").and_then(Value::as_str) else { continue };
        if sid.is_empty() {
            continue;
        }
        let sid = sid.to_string();
        let trajectory_path = dir.join(format!("{sid}.trajectory.jsonl"));
        let (mut is_stuck, mut err_msg, mut err_type) =
            parse_trajectory_stuck(&trajectory_path, now);
        if !is_stuck {
            // 无 trajectory 或未结束：检查 startedAt 超时
            let started = e
                .get("startedAt")
                .or_else(|| e.get("sessionStartedAt"))
                .and_then(Value::as_i64)
                .unwrap_or(0);
            if started > 0 && now - started > STUCK_SESSION_TIMEOUT_MS {
                is_stuck = true;
                err_msg = format!("会话已运行 {} 分钟无响应", (now - started) / 60000);
                err_type = "timeout".to_string();
            }
        }
        if is_stuck {
            e.insert("status".into(), json!("done"));
            e.insert("endedAt".into(), json!(now));
            e.insert("error".into(), json!(err_msg));
            e.insert("errorType".into(), json!(err_type));
            repaired.push(json!({
                "sessionKey": session_key,
                "sessionId": sid,
                "error": err_msg,
                "errorType": err_type,
                "model": e.get("model").cloned().unwrap_or(Value::Null),
                "modelProvider": e.get("modelProvider").cloned().unwrap_or(Value::Null),
            }));
        }
    }

    let total_checked = obj.len();
    let _ = obj;

    if !repaired.is_empty() {
        if let Ok(content) = serde_json::to_string_pretty(&store) {
            let _ = fs::write(&registry_path, content);
        }
    }
    Ok(json!({ "repaired": repaired, "totalChecked": total_checked }))
}

#[cfg(test)]
mod tests {
    use super::{
        best_effort_registry_entries, image_attachments, parse_trajectory_stuck,
        successful_tool_only_terminal_messages, trajectory_messages, user_image_attachments,
    };
    use serde_json::json;

    #[test]
    fn parses_trajectory_quota_error_from_model_completed() {
        let p = std::env::temp_dir().join("superclaw-traj-quota-test.jsonl");
        std::fs::write(
            &p,
            "{\"type\":\"prompt.submitted\",\"ts\":100,\"data\":{}}\n\
             {\"type\":\"model.completed\",\"ts\":200,\"data\":{\"messagesSnapshot\":[{\"role\":\"assistant\",\"stopReason\":\"error\",\"errorMessage\":\"403 预扣费额度失败, 用户剩余额度: ＄0.13, 需要预扣费额度: ＄0.14\",\"errorCode\":\"insufficient_user_quota\"}]}}\n",
        )
        .unwrap();
        let (stuck, err, err_type) = parse_trajectory_stuck(&p, 300);
        let _ = std::fs::remove_file(&p);
        assert!(stuck);
        assert!(err.contains("403"));
        assert_eq!(err_type, "error");
    }

    #[test]
    fn marks_idle_trajectory_as_timeout() {
        let p = std::env::temp_dir().join("superclaw-traj-idle-test.jsonl");
        std::fs::write(
            &p,
            "{\"type\":\"prompt.submitted\",\"ts\":100,\"data\":{}}\n",
        )
        .unwrap();
        // now 远大于最后活动 ts(100)，超过 5 分钟阈值
        let (stuck, _err, err_type) = parse_trajectory_stuck(&p, 100 + 6 * 60 * 1000);
        let _ = std::fs::remove_file(&p);
        assert!(stuck);
        assert_eq!(err_type, "timeout");
    }

    #[test]
    fn recovers_session_entries_when_registry_has_invalid_json_later() {
        let source = "{\n  \"agent:main:main\": {\n    \"sessionId\": \"main-id\",\n    \"updatedAt\": 42,\n    \"broken\": \"line\n  }\n}";
        let entries = best_effort_registry_entries(source);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, "agent:main:main");
        assert_eq!(entries[0].1["sessionId"], "main-id");
        assert_eq!(entries[0].1["updatedAt"], 42);
    }

    #[test]
    fn recovers_terminal_assistant_reply_from_trajectory() {
        let source = r#"{"type":"model.completed","ts":"2026-07-13T07:27:26.324Z","runId":"run-1","data":{"assistantTexts":["checking","final answer"],"finalPromptText":"question"}}
{"type":"trace.artifacts","ts":"2026-07-13T07:27:26.326Z","runId":"run-1","data":{"assistantTexts":["checking","final answer"],"toolMetas":[{"name":"exec","isError":false}]}}"#;
        let messages = trajectory_messages(source);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["text"], "final answer");
        assert_eq!(messages[0]["trajectoryPrompt"], "question");
        assert_eq!(
            messages[0]["executionTimeline"].as_array().map(Vec::len),
            Some(2)
        );
    }

    #[test]
    fn trajectory_projection_marks_a_portable_terminal_reply() {
        let source = r#"{"type":"model.completed","ts":"2026-07-13T07:27:26.324Z","runId":"run-2","data":{"assistantTexts":["final answer"],"finalPromptText":"question"}}"#;
        let messages = trajectory_messages(source);
        assert_eq!(messages[0]["id"], "trajectory-run-2");
        assert_eq!(messages[0]["trajectoryFinal"], true);
    }

    #[test]
    fn synthesizes_terminal_reply_when_successful_tool_run_has_no_final_text() {
        let messages = vec![
            json!({ "role": "user", "text": "edit the attached document" }),
            json!({ "role": "assistant", "stopReason": "toolUse", "text": "Verify the output file" }),
            json!({ "role": "toolResult", "text": "Saved -> edited.docx" }),
        ];
        let trajectory = r#"{"type":"session.ended","ts":"2026-07-19T03:12:22.844Z","runId":"run-tool-only","data":{"status":"success"}}"#;
        let synthesized = successful_tool_only_terminal_messages(&messages, trajectory);
        assert_eq!(synthesized.len(), 1);
        assert_eq!(synthesized[0]["runId"], "run-tool-only");
        assert!(synthesized[0]["text"]
            .as_str()
            .unwrap()
            .contains("edited.docx"));
    }

    #[test]
    fn does_not_synthesize_when_regular_final_exists() {
        let messages = vec![
            json!({ "role": "user", "text": "edit the attached document" }),
            json!({ "role": "assistant", "stopReason": "toolUse", "text": "Verify the output file" }),
            json!({ "role": "toolResult", "text": "Saved -> edited.docx" }),
            json!({ "role": "assistant", "stopReason": "stop", "text": "Done." }),
        ];
        let trajectory = r#"{"type":"session.ended","ts":"2026-07-19T03:12:22.844Z","runId":"run-with-final","data":{"status":"success"}}"#;
        assert!(successful_tool_only_terminal_messages(&messages, trajectory).is_empty());
    }

    #[test]
    fn exposes_native_outgoing_images_as_chat_attachments() {
        let message = json!({
            "content": [
                { "type": "text", "text": "Here is the image" },
                { "type": "image", "url": "/api/chat/media/outgoing/run/image.png", "mimeType": "image/png" }
            ]
        });
        let attachments = image_attachments(&message);
        assert_eq!(attachments.len(), 1);
        assert_eq!(attachments[0]["category"], "image");
        assert_eq!(
            attachments[0]["imageUrl"],
            "/api/chat/media/outgoing/run/image.png"
        );
    }

    #[test]
    fn restores_user_uploaded_media_paths_as_attachments() {
        let message = json!({
            "role": "user",
            "content": "optimize this image",
            "MediaPath": "C:\\data\\.openclaw\\media\\inbound\\377f9702.jpg",
            "MediaPaths": ["C:\\data\\.openclaw\\media\\inbound\\377f9702.jpg"],
            "MediaType": "image/jpeg",
            "MediaTypes": ["image/jpeg"]
        });
        let attachments = user_image_attachments(&message);
        assert_eq!(attachments.len(), 1);
        assert_eq!(attachments[0]["category"], "image");
        assert_eq!(attachments[0]["mimeType"], "image/jpeg");
        assert_eq!(
            attachments[0]["mediaPath"],
            "C:\\data\\.openclaw\\media\\inbound\\377f9702.jpg"
        );
        assert_eq!(
            attachments[0]["generatedMediaPath"],
            "C:\\data\\.openclaw\\media\\inbound\\377f9702.jpg"
        );
    }

    #[test]
    fn ignores_user_messages_without_media_paths() {
        let message = json!({
            "role": "user",
            "content": "hello"
        });
        assert!(user_image_attachments(&message).is_empty());
    }
}
