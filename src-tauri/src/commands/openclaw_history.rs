use serde_json::{json, Value};
use std::collections::BTreeMap;
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
            "endedAt": number("endedAt"),
            "status": field("status"),
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
        let Ok(entry) = serde_json::from_str::<Value>(line) else { continue; };
        let entry_type = entry.get("type").and_then(Value::as_str).unwrap_or_default();
        if !matches!(entry_type, "model.completed" | "trace.artifacts") { continue; }
        let run_id = entry.get("runId").and_then(Value::as_str).unwrap_or_default();
        if run_id.is_empty() { continue; }
        let data = entry.get("data").unwrap_or(&Value::Null);
        let run = runs.entry(run_id.to_string()).or_default();
        if run.timestamp.is_empty() {
            run.timestamp = entry.get("ts").and_then(Value::as_str).unwrap_or_default().to_string();
        }
        if let Some(prompt) = data.get("finalPromptText").and_then(Value::as_str) {
            if !prompt.trim().is_empty() { run.prompt = prompt.to_string(); }
        }
        if let Some(texts) = data.get("assistantTexts").and_then(Value::as_array) {
            let values = texts.iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>();
            if values.len() >= run.assistant_texts.len() { run.assistant_texts = values; }
        }
        if entry_type == "trace.artifacts" {
            if let Some(items) = data.get("itemLifecycle").and_then(Value::as_array) {
                for (index, item) in items.iter().enumerate() {
                    let label = item.get("title").or_else(|| item.get("name")).or_else(|| item.get("summary"))
                        .and_then(Value::as_str).unwrap_or_default().trim();
                    if label.is_empty() { continue; }
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
                    let label = tool.get("name").or_else(|| tool.get("toolName"))
                        .and_then(Value::as_str).unwrap_or("tool");
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
        let Some(final_text) = run.assistant_texts.pop() else { continue; };
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

/// Read the portable OpenClaw JSONL source of truth. Gateway chat.history can
/// omit user turns after compaction, which makes a UI-only projection unsafe.
#[tauri::command]
pub fn read_openclaw_raw_history(session_key: String, limit: Option<usize>) -> Result<Value, String> {
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
    let trajectory_path = sessions_dir.join(format!("{session_id}.trajectory.jsonl"));
    if let Ok(trajectory_source) = fs::read_to_string(&trajectory_path) {
        for candidate in trajectory_messages(&trajectory_source) {
            let candidate_run_id = candidate.get("runId").and_then(Value::as_str).unwrap_or_default();
            let candidate_text = text_content(&candidate);
            let already_present = messages.iter().any(|message| {
                if message.get("role").and_then(Value::as_str) != Some("assistant") { return false; }
                let same_run = !candidate_run_id.is_empty()
                    && message.get("runId").and_then(Value::as_str) == Some(candidate_run_id);
                let same_text = !candidate_text.trim().is_empty()
                    && text_content(message).trim() == candidate_text.trim();
                same_run || same_text
            });
            if !already_present { messages.push(candidate); }
        }
    }
    messages.sort_by(|left, right| {
        let left_time = left.get("timestamp").and_then(Value::as_str).unwrap_or_default();
        let right_time = right.get("timestamp").and_then(Value::as_str).unwrap_or_default();
        left_time.cmp(right_time)
    });
    let limit = limit.unwrap_or(300).clamp(1, 1000);
    if messages.len() > limit { messages = messages.split_off(messages.len() - limit); }
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
        let a_time = a.get("updatedAt").and_then(Value::as_i64).unwrap_or_default();
        let b_time = b.get("updatedAt").and_then(Value::as_i64).unwrap_or_default();
        b_time.cmp(&a_time)
    });
    sessions.truncate(limit.unwrap_or(80).clamp(1, 500));
    Ok(json!({ "sessions": sessions }))
}

#[cfg(test)]
mod tests {
    use super::{best_effort_registry_entries, trajectory_messages};

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
        assert_eq!(messages[0]["executionTimeline"].as_array().map(Vec::len), Some(2));
    }

    #[test]
    fn trajectory_projection_marks_a_portable_terminal_reply() {
        let source = r#"{"type":"model.completed","ts":"2026-07-13T07:27:26.324Z","runId":"run-2","data":{"assistantTexts":["final answer"],"finalPromptText":"question"}}"#;
        let messages = trajectory_messages(source);
        assert_eq!(messages[0]["id"], "trajectory-run-2");
        assert_eq!(messages[0]["trajectoryFinal"], true);
    }
}
