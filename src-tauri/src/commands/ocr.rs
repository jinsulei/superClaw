use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRequest {
    pub image_path: Option<String>,
    pub image_data: Option<String>,
    pub mime_type: Option<String>,
    pub source_type: Option<String>,
    pub language: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OcrConfigRoot {
    ocr: OcrConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OcrConfig {
    enabled: bool,
    offline: bool,
    lazy_load: bool,
    engine: String,
    languages: Vec<String>,
    default_language: String,
    timeout_ms: u64,
    max_image_size: u64,
    fail_safe: bool,
    shared_for_agents: Vec<String>,
    runtime_path: String,
    language_path: String,
}

fn default_config() -> OcrConfig {
    OcrConfig {
        enabled: true,
        offline: true,
        lazy_load: true,
        engine: "tesseract.js".into(),
        languages: vec!["chi_sim".into(), "eng".into()],
        default_language: "chi_sim+eng".into(),
        timeout_ms: 30_000,
        max_image_size: 4096,
        fail_safe: true,
        shared_for_agents: vec!["hermes".into(), "openclaw".into(), "claude_code".into()],
        runtime_path: "runtime/ocr".into(),
        language_path: "runtime/ocr/tessdata".into(),
    }
}

fn config_path() -> Result<PathBuf, String> {
    let res = super::app_resources_dir().ok_or_else(|| "resources directory not found".to_string())?;
    Ok(res.join("data").join("ocr").join("ocr-config.json"))
}

fn read_config() -> OcrConfig {
    let path = match config_path() {
        Ok(p) => p,
        Err(_) => return default_config(),
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<OcrConfigRoot>(&text).ok())
        .map(|root| root.ocr)
        .unwrap_or_else(default_config)
}

fn resources_relative(path: &str) -> Result<PathBuf, String> {
    let res = super::app_resources_dir().ok_or_else(|| "resources directory not found".to_string())?;
    Ok(res.join(path.replace('\\', "/")))
}

fn bundled_node(runtime_dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let openclaw_node = super::bundled_openclaw_bin_dir()
            .map(|dir| dir.join("node.exe"))
            .filter(|p| p.is_file());
        if let Some(path) = openclaw_node {
            return path;
        }
        let local = runtime_dir.join("node.exe");
        if local.is_file() {
            return local;
        }
        PathBuf::from("node")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let local = runtime_dir.join("node");
        if local.is_file() {
            local
        } else {
            PathBuf::from("node")
        }
    }
}

fn fail(source_type: &str, path: &str, message: impl Into<String>) -> serde_json::Value {
    json!({
        "ok": false,
        "error": message.into(),
        "recoverable": true,
        "source": { "type": source_type, "path": path }
    })
}

#[tauri::command]
pub async fn ocr_get_config() -> Result<serde_json::Value, String> {
    let cfg = read_config();
    Ok(json!({
        "ocr": cfg.clone(),
        "runtimeDir": resources_relative(&cfg.runtime_path).ok().map(|p| p.to_string_lossy().to_string()),
        "languageDir": resources_relative(&cfg.language_path).ok().map(|p| p.to_string_lossy().to_string())
    }))
}

#[tauri::command]
pub async fn ocr_set_enabled(enabled: bool) -> Result<serde_json::Value, String> {
    let path = config_path()?;
    let mut root = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .filter(|value| value.is_object())
        .unwrap_or_else(|| json!({ "ocr": default_config() }));
    if !root.get("ocr").is_some_and(|v| v.is_object()) {
        root["ocr"] = serde_json::to_value(default_config()).unwrap_or_else(|_| json!({}));
    }
    root["ocr"]["enabled"] = json!(enabled);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create OCR config dir failed: {e}"))?;
    }
    let text = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("write OCR config failed: {e}"))?;
    ocr_get_config().await
}

#[tauri::command]
pub async fn ocr_extract_text(request: OcrRequest) -> Result<serde_json::Value, String> {
    let cfg = read_config();
    let source_type = request.source_type.as_deref().unwrap_or("image");
    let source_path = request.image_path.as_deref().unwrap_or("");
    if !cfg.enabled {
        return Ok(fail(source_type, source_path, "OCR is disabled"));
    }

    if let Some(path) = request.image_path.as_deref() {
        let meta = std::fs::metadata(path).map_err(|e| format!("read image metadata failed: {e}"))?;
        let max_bytes = cfg.max_image_size.saturating_mul(cfg.max_image_size).saturating_mul(4);
        if max_bytes > 0 && meta.len() > max_bytes {
            return Ok(fail(source_type, path, "image is larger than OCR maxImageSize budget"));
        }
    }

    let runtime_dir = resources_relative(&cfg.runtime_path)?;
    let runner = runtime_dir.join("ocr-runner.cjs");
    if !runner.is_file() {
        return Ok(fail(source_type, source_path, "OCR runner is missing"));
    }
    let lang_dir = resources_relative(&cfg.language_path)?;
    if !lang_dir.join("eng.traineddata.gz").is_file() || !lang_dir.join("chi_sim.traineddata.gz").is_file() {
        return Ok(fail(source_type, source_path, "OCR language data is missing"));
    }

    let payload = json!({
        "imagePath": request.image_path,
        "imageData": request.image_data,
        "mimeType": request.mime_type,
        "sourceType": source_type,
        "language": request.language.unwrap_or_else(|| cfg.default_language.clone()),
        "defaultLanguage": cfg.default_language,
    });

    let node = bundled_node(&runtime_dir);
    let mut cmd = Command::new(node);
    cmd.arg(&runner)
        .current_dir(&runtime_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("NO_UPDATE_NOTIFIER", "1")
        .env("TESSDATA_PREFIX", &lang_dir);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let mut child = cmd.spawn().map_err(|e| format!("start OCR runner failed: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.to_string().as_bytes())
            .map_err(|e| format!("write OCR request failed: {e}"))?;
    }

    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(cfg.timeout_ms).max(1000));
    let start = Instant::now();
    loop {
        if let Some(_status) = child.try_wait().map_err(|e| format!("wait OCR runner failed: {e}"))? {
            let output = child
                .wait_with_output()
                .map_err(|e| format!("read OCR output failed: {e}"))?;
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Ok(fail(source_type, source_path, format!("OCR returned no output: {stderr}")));
            }
            return serde_json::from_str(&stdout)
                .map_err(|e| format!("parse OCR output failed: {e}; output={stdout}"));
        }
        if start.elapsed() > timeout {
            let _ = child.kill();
            return Ok(fail(source_type, source_path, "OCR timed out"));
        }
        std::thread::sleep(Duration::from_millis(80));
    }
}
