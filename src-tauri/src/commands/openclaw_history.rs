use serde_json::{json, Value};
use std::fs;

use super::openclaw_dir;

fn sessions_dir() -> std::path::PathBuf {
    openclaw_dir().join("agents").join("main").join("sessions")
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
        let window = lines.iter().skip(index + 1).take(16).copied().collect::<Vec<_>>();
        let field = |name: &str| {
            let prefix = format!("\"{name}\": \"");
            window.iter().find_map(|candidate| {
                candidate.trim().strip_prefix(&prefix).and_then(|value| value.split('"').next()).map(str::to_string)
            })
        };
        let number = |name: &str| {
            let prefix = format!("\"{name}\": ");
            window.iter().find_map(|candidate| {
                candidate.trim().strip_prefix(&prefix).and_then(|value| {
                    value.trim_end_matches(',').parse::<i64>().ok()
                })
            })
        };
        let Some(session_id) = field("sessionId") else { continue; };
        entries.push((key, json!({
            "sessionId": session_id,
            "updatedAt": number("updatedAt"),
            "lastInteractionAt": number("lastInteractionAt"),
            "sessionStartedAt": number("sessionStartedAt"),
        })));
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
        return Err("parse sessions registry failed and no recoverable entries were found".to_string());
    }
    Ok(recovered)
}

fn text_content(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|block| {
                (block.get("type").and_then(Value::as_str) == Some("text"))
                    .then(|| block.get("text").and_then(Value::as_str).unwrap_or_default())
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// Read the portable OpenClaw JSONL source of truth. Gateway chat.history can
/// omit user turns after compaction, which makes a UI-only projection unsafe.
#[tauri::command]
pub fn read_openclaw_raw_history(session_key: String, limit: Option<usize>) -> Result<Value, String> {
    let sessions_dir = sessions_dir();
    let entries = read_session_entries()?;
    let session_id = entries
        .iter()
        .find(|(key, _)| key == &session_key)
        .and_then(|(_, entry)| entry.get("sessionId"))
        .and_then(Value::as_str)
        .ok_or_else(|| "session not found".to_string())?;
    let path = sessions_dir.join(format!("{session_id}.jsonl"));
    let source = fs::read_to_string(&path).map_err(|err| format!("read raw session failed: {err}"))?;
    let mut messages = Vec::new();
    for line in source.lines() {
        let Ok(entry) = serde_json::from_str::<Value>(line) else { continue; };
        if entry.get("type").and_then(Value::as_str) != Some("message") { continue; }
        let Some(message) = entry.get("message") else { continue; };
        let Some(role) = message.get("role").and_then(Value::as_str) else { continue; };
        if !matches!(role, "user" | "assistant" | "toolResult") { continue; }
        messages.push(json!({
            "id": entry.get("id").and_then(Value::as_str).unwrap_or_default(),
            "parentId": entry.get("parentId").and_then(Value::as_str).unwrap_or_default(),
            "role": role,
            "idempotencyKey": message.get("idempotencyKey").and_then(Value::as_str).unwrap_or_default(),
            "clientRequestId": message.get("clientRequestId").and_then(Value::as_str).unwrap_or_default(),
            "requestId": message.get("requestId").and_then(Value::as_str).unwrap_or_default(),
            "runId": message.get("runId").and_then(Value::as_str).unwrap_or_default(),
            "stopReason": message.get("stopReason").and_then(Value::as_str).unwrap_or_default(),
            "text": text_content(message),
            "toolName": message.get("toolName").and_then(Value::as_str).unwrap_or_default(),
            "toolCallId": message.get("toolCallId").and_then(Value::as_str).unwrap_or_default(),
            "timestamp": entry.get("timestamp").and_then(Value::as_str).unwrap_or_default(),
            "content": message.get("content").cloned().unwrap_or(Value::Null),
        }));
    }
    let limit = limit.unwrap_or(300).clamp(1, 1000);
    if messages.len() > limit { messages = messages.split_off(messages.len() - limit); }
    Ok(json!({ "sessionKey": session_key, "messages": messages }))
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
            "messageCount": entry.get("messageCount").cloned().unwrap_or(Value::Null),
            "compactionCheckpointCount": entry.get("compactionCheckpoints").and_then(Value::as_array).map(|items| items.len()).unwrap_or(0),
        }))
    }).collect::<Vec<_>>();
    sessions.sort_by(|a, b| {
        let a_time = a.get("updatedAt").and_then(Value::as_i64).unwrap_or_default();
        let b_time = b.get("updatedAt").and_then(Value::as_i64).unwrap_or_default();
        b_time.cmp(&a_time)
    });
    sessions.truncate(limit.unwrap_or(80).clamp(1, 500));
    Ok(json!({ "sessions": sessions }))
}

#[cfg(test)]
mod tests {
    use super::best_effort_registry_entries;

    #[test]
    fn recovers_session_entries_when_registry_has_invalid_json_later() {
        let source = "{\n  \"agent:main:main\": {\n    \"sessionId\": \"main-id\",\n    \"updatedAt\": 42,\n    \"broken\": \"line\n  }\n}";
        let entries = best_effort_registry_entries(source);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, "agent:main:main");
        assert_eq!(entries[0].1["sessionId"], "main-id");
        assert_eq!(entries[0].1["updatedAt"], 42);
    }
}
