//! Shared, offline document execution for Hermes, OpenClaw, and Claude Code.
//! Inputs remain read-only; every edit is written below the portable data root.

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;

fn safe_segment(value: &str, fallback: &str) -> String {
    let value: String = value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
        .take(96)
        .collect();
    if value.is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn supported_document(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "xlsx" | "docx" | "pdf" | "pptx"
    )
}

fn file_workspace_root() -> Result<PathBuf, String> {
    let resources = super::app_resources_dir().ok_or("无法定位应用资源目录")?;
    #[cfg(debug_assertions)]
    {
        let project_root = resources
            .parent()
            .and_then(Path::parent)
            .ok_or("Unable to locate the development data directory")?;
        Ok(project_root.join(".dev-data").join("file-workspaces"))
    }
    #[cfg(not(debug_assertions))]
    {
        Ok(resources.join("data").join("file-workspaces"))
    }
}

fn document_tool_path() -> Result<PathBuf, String> {
    let resources = super::app_resources_dir().ok_or("无法定位应用资源目录")?;
    let path = resources
        .join("runtime")
        .join("document-tools")
        .join("hermes_document_tool.py");
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!("共享文件工具不存在: {}", path.display()))
    }
}

fn portable_python_and_site() -> Result<(PathBuf, PathBuf), String> {
    let resources = super::app_resources_dir().ok_or("无法定位应用资源目录")?;
    let python_root = resources.join("runtime").join("uv-python");
    let python = std::fs::read_dir(&python_root)
        .map_err(|err| err.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("python.exe"))
        .find(|path| path.is_file())
        .ok_or("便携 Python 不存在")?;
    let site = resources
        .join("runtime")
        .join("hermes-agent")
        .join("Lib")
        .join("site-packages");
    if !site.is_dir() {
        return Err("文件服务依赖目录不存在".into());
    }
    Ok((python, site))
}

fn resolve_output_name(source: &Path, requested: Option<&str>) -> String {
    if let Some(name) = requested.map(str::trim).filter(|value| !value.is_empty()) {
        let name = Path::new(name)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if supported_document(Path::new(name)) {
            return name.to_string();
        }
    }
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document");
    let ext = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("bin");
    format!("{stem}-superclaw.{ext}")
}

#[tauri::command]
pub async fn file_service_run(
    agent: String,
    session_id: String,
    task_id: String,
    operation: String,
    input_path: String,
    output_name: Option<String>,
    find: Option<String>,
    replace: Option<String>,
    text: Option<String>,
) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        let operation = operation.trim().to_ascii_lowercase();
        if !matches!(operation.as_str(), "preview" | "replace" | "clean-excel" | "watermark" | "create-presentation") { return Err("不支持的文件操作".into()); }
        let creating_presentation = operation == "create-presentation";
        let source = if creating_presentation {
            None
        } else {
            let source = std::fs::canonicalize(&input_path).map_err(|_| "输入文件不存在或无法读取")?;
            if !source.is_file() || !supported_document(&source) {
                return Err("仅支持 .xlsx、.docx、.pptx、.pdf 文件".into());
            }
            Some(source)
        };
        if operation == "preview" {
            // Preview never creates an artifact and never mutates the source.
        } else if operation == "clean-excel" && source.as_deref().and_then(|value| value.extension()).and_then(|v| v.to_str()).map(|v| !v.eq_ignore_ascii_case("xlsx")).unwrap_or(true) {
            return Err("clean-excel 仅支持 .xlsx 文件".into());
        }
        let root = file_workspace_root()?;
        let task_dir = root.join(safe_segment(&session_id, "session")).join(safe_segment(&task_id, "task"));
        std::fs::create_dir_all(&task_dir).map_err(|err| err.to_string())?;
        let output_name = if creating_presentation {
            output_name.as_deref().filter(|value| supported_document(Path::new(value)) && value.to_ascii_lowercase().ends_with(".pptx")).unwrap_or("presentation-superclaw.pptx").to_string()
        } else {
            resolve_output_name(source.as_deref().expect("source exists"), output_name.as_deref())
        };
        let output = task_dir.join(output_name);
        let tool = document_tool_path()?;
        let (python, site) = portable_python_and_site()?;
        let mut command = Command::new(python);
        command.arg(tool).arg(&operation).env("PYTHONPATH", site);
        if let Some(source) = source.as_ref() { command.arg(source); }
        if operation != "preview" { command.arg("--output").arg(&output); }
        if let Some(value) = find.filter(|value| !value.is_empty()) { command.arg("--find").arg(value); }
        if let Some(value) = replace.filter(|value| !value.is_empty()) { command.arg("--replace").arg(value); }
        if let Some(value) = text.filter(|value| !value.is_empty()) { command.arg("--text").arg(value); }
        let process = command.output().map_err(|err| format!("启动共享文件工具失败: {err}"))?;
        if !process.status.success() { return Err(String::from_utf8_lossy(&process.stderr).trim().to_string()); }
        let mut result: Value = serde_json::from_slice(&process.stdout).map_err(|err| format!("文件工具返回格式错误: {err}"))?;
        if let Some(object) = result.as_object_mut() {
            object.insert("agent".into(), Value::String(safe_segment(&agent, "agent")));
            object.insert("session_id".into(), Value::String(safe_segment(&session_id, "session")));
            object.insert("task_id".into(), Value::String(safe_segment(&task_id, "task")));
            object.insert("operation".into(), Value::String(operation));
            if output.is_file() {
                let relative = output.strip_prefix(&root).unwrap_or(&output).to_string_lossy().replace('\\', "/");
                object.insert("artifact".into(), serde_json::json!({"type":"file", "path": relative, "created_at": chrono::Utc::now().to_rfc3339()}));
                object.insert("output".into(), Value::String(relative));
            }
        }
        let manifest = task_dir.join("result.json");
        let _ = std::fs::write(manifest, serde_json::to_vec_pretty(&result).unwrap_or_default());
        Ok(result)
    }).await.map_err(|err| err.to_string())?
}
