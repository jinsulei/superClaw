use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

fn shared_memory_dir() -> Result<PathBuf, String> {
    let resources = super::app_resources_dir()
        .ok_or_else(|| "SuperClaw resources directory was not found".to_string())?;
    Ok(resources.join("data").join("memory"))
}

fn shared_memory_file() -> Result<PathBuf, String> {
    Ok(shared_memory_dir()?.join("shared-agent-memory.json"))
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
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create memory directory: {e}"))?;
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
    fs::write(&file, serde_json::to_string_pretty(&parsed).unwrap_or(content))
        .map_err(|e| format!("Failed to write shared memory: {e}"))?;
    Ok(json!({
        "ok": true,
        "path": "data/memory/shared-agent-memory.json",
        "absolutePath": file.to_string_lossy().to_string()
    }))
}

#[tauri::command]
pub fn shared_memory_write_file(path: String, content: String) -> Result<serde_json::Value, String> {
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
