use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

fn shared_memory_dir() -> Result<PathBuf, String> {
    super::shared_memory_data_dir()
        .ok_or_else(|| "SuperClaw resources directory was not found".to_string())
}

fn shared_memory_file() -> Result<PathBuf, String> {
    Ok(shared_memory_dir()?.join("shared-agent-memory.json"))
}

fn collaboration_messages_file() -> Result<PathBuf, String> {
    Ok(shared_memory_dir()?.join("collaboration-messages.json"))
}

fn is_unsafe_relative_path(path: &str) -> bool {
    path.contains("..")
        || path.contains('\0')
        || path.starts_with('/')
        || path.starts_with('\\')
        || (path.len() >= 2 && path.as_bytes()[1] == b':')
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create memory directory: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn shared_memory_config() -> Result<serde_json::Value, String> {
    let dir = shared_memory_dir()?;
    Ok(json!({
        "enabled": true,
        "store": "local",
        "portable": true,
        "path": "data/memory",
        "absolutePath": dir.to_string_lossy().to_string(),
        "maxRecentMessages": 50,
        "maxSummaryLength": 8000,
        "persistTaskContext": true,
        "persistAgentMessages": true,
        "sharedForAgents": ["hermes", "openclaw", "claude_code"]
    }))
}

#[tauri::command]
pub fn shared_memory_read() -> Result<String, String> {
    let file = shared_memory_file()?;
    if !file.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&file).map_err(|e| format!("Failed to read shared memory: {e}"))
}

#[tauri::command]
pub fn shared_memory_write(content: String) -> Result<serde_json::Value, String> {
    let file = shared_memory_file()?;
    ensure_parent(&file)?;
    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Shared memory content must be valid JSON: {e}"))?;
    fs::write(
        &file,
        serde_json::to_string_pretty(&parsed).unwrap_or(content),
    )
    .map_err(|e| format!("Failed to write shared memory: {e}"))?;
    Ok(json!({
        "ok": true,
        "path": "data/memory/shared-agent-memory.json",
        "absolutePath": file.to_string_lossy().to_string()
    }))
}

#[tauri::command]
pub fn shared_memory_write_file(
    path: String,
    content: String,
) -> Result<serde_json::Value, String> {
    if is_unsafe_relative_path(&path) {
        return Err("Illegal shared memory path".to_string());
    }
    let file = shared_memory_dir()?.join(&path);
    ensure_parent(&file)?;
    fs::write(&file, content).map_err(|e| format!("Failed to write shared memory file: {e}"))?;
    Ok(json!({
        "ok": true,
        "path": format!("data/memory/{}", path.replace('\\', "/")),
        "absolutePath": file.to_string_lossy().to_string()
    }))
}

/// Small durable handoff queue for messages crossing Tauri WebView windows.
/// WebView localStorage is not a reliable transport boundary in packaged apps.
#[tauri::command]
pub fn collaboration_message_append(message: serde_json::Value) -> Result<serde_json::Value, String> {
    if !message.is_object() {
        return Err("Collaboration message must be a JSON object".to_string());
    }
    let file = collaboration_messages_file()?;
    ensure_parent(&file)?;
    let mut rows: Vec<serde_json::Value> = if file.exists() {
        serde_json::from_str(&fs::read_to_string(&file).map_err(|e| format!("Failed to read collaboration queue: {e}"))?)
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let duplicate = rows.iter().any(|row| {
        row.get("task_id") == message.get("task_id")
            && row.get("message_type") == message.get("message_type")
            && row.get("from_agent") == message.get("from_agent")
            && row.get("content") == message.get("content")
    });
    if !duplicate {
        rows.push(message);
        if rows.len() > 200 {
            rows.drain(0..rows.len() - 200);
        }
        fs::write(&file, serde_json::to_string_pretty(&rows).map_err(|e| format!("Failed to serialize collaboration queue: {e}"))?)
            .map_err(|e| format!("Failed to write collaboration queue: {e}"))?;
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn collaboration_message_drain(to_agent: Option<String>) -> Result<serde_json::Value, String> {
    let file = collaboration_messages_file()?;
    if !file.exists() {
        return Ok(json!({ "messages": [] }));
    }
    let rows: Vec<serde_json::Value> = serde_json::from_str(
        &fs::read_to_string(&file).map_err(|e| format!("Failed to read collaboration queue: {e}"))?,
    )
    .unwrap_or_default();
    let target = to_agent.unwrap_or_default();
    let (messages, retained): (Vec<_>, Vec<_>) = rows.into_iter().partition(|row| {
        target.is_empty()
            || row.get("to_agent").and_then(serde_json::Value::as_str) == Some(target.as_str())
    });
    ensure_parent(&file)?;
    fs::write(&file, serde_json::to_string_pretty(&retained).map_err(|e| format!("Failed to serialize collaboration queue: {e}"))?)
        .map_err(|e| format!("Failed to write collaboration queue: {e}"))?;
    Ok(json!({ "messages": messages }))
}
