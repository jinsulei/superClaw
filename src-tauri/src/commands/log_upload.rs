//! 当天错误日志收集与上传。
//!
//! 接口规范见 `docs/log-daily-rotation-plan.md` 第六节：
//! POST {base_url}/api/v1/log-upload  (multipart/form-data)
//! 收集范围：当天错误日志 + 当天正常日志尾部（≤512KB/文件），上传前脱敏。
//! 用户可在前端勾选排除项（excluded）后再打包上传。

use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// 后端上传地址（由后端提供）
const UPLOAD_BASE_URL: &str = "https://openclaw.yaoyaolx.com.cn";
const UPLOAD_ENDPOINT: &str = "/api/v1/log-upload";
/// 正常日志尾部最大字节数（≤512KB）
const MAX_TAIL_BYTES: u64 = 512 * 1024;

fn openclaw_logs_dir() -> PathBuf {
    crate::commands::openclaw_dir().join("logs")
}

fn hermes_logs_dir() -> PathBuf {
    crate::commands::hermes::hermes_home().join("logs")
}

/// 持久化设备 ID（client_id）
fn client_id() -> String {
    let dir = crate::commands::openclaw_dir();
    let path = dir.join("client-id");
    if let Ok(s) = std::fs::read_to_string(&path) {
        let s = s.trim().to_string();
        if !s.is_empty() {
            return s;
        }
    }
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let id = format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        rng.gen::<u32>(),
        rng.gen::<u16>(),
        rng.gen::<u16>(),
        rng.gen::<u16>(),
        rng.gen::<u64>()
    );
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&path, &id);
    id
}

struct LogSource {
    /// 唯一 key（前端勾选用）
    key: String,
    /// zip 内相对路径
    name: String,
    /// 源文件路径
    path: PathBuf,
    /// 是否错误类日志
    error: bool,
    /// 尾部截断上限（None = 全量）
    max_bytes: Option<u64>,
}

fn push_src(v: &mut Vec<LogSource>, path: PathBuf, key: &str, name: &str, error: bool, max_bytes: Option<u64>) {
    if path.exists() {
        v.push(LogSource { key: key.to_string(), name: name.to_string(), path, error, max_bytes });
    }
}

/// 收集今天的日志源（错误 + 正常尾部）
fn collect_sources() -> Vec<LogSource> {
    let today = crate::commands::log_rotate::today_str();
    let oc = openclaw_logs_dir();
    let hm = hermes_logs_dir();
    let mut v: Vec<LogSource> = Vec::new();

    // ── OpenClaw ──
    push_src(&mut v, oc.join(format!("gateway.err-{today}.log")), "oc-err", &format!("openclaw/gateway.err-{today}.log"), true, None);
    push_src(&mut v, oc.join(format!("guardian-{today}.log")), "oc-guardian", &format!("openclaw/guardian-{today}.log"), true, None);
    push_src(&mut v, oc.join(format!("gateway-{today}.log")), "oc-tail", &format!("openclaw/gateway-{today}.log.tail"), false, Some(MAX_TAIL_BYTES));

    // ── Hermes ──
    push_src(&mut v, hm.join(format!("errors-{today}.log")), "hm-err", &format!("hermes/errors-{today}.log"), true, None);
    push_src(&mut v, hm.join("errors.log"), "hm-py-err", "hermes/errors.log", true, None);
    push_src(&mut v, hm.join(format!("gateway-run-{today}.log")), "hm-tail", &format!("hermes/gateway-run-{today}.log.tail"), false, Some(MAX_TAIL_BYTES));

    v
}

fn read_limited(path: &Path, max_bytes: Option<u64>) -> String {
    let bytes = std::fs::read(path).unwrap_or_default();
    let bytes = match max_bytes {
        Some(mb) if (bytes.len() as u64) > mb => bytes[bytes.len() - mb as usize..].to_vec(),
        _ => bytes,
    };
    String::from_utf8_lossy(&bytes).into_owned()
}

/// 上传前脱敏：API key / token / Authorization
fn redact(text: &str) -> String {
    let mut s = text.to_string();
    if let Ok(re) = regex::Regex::new(r"(?i)(sk-[a-z0-9_-]{8,})") {
        s = re.replace_all(&s, "sk-****").into_owned();
    }
    if let Ok(re) = regex::Regex::new(r"(?i)(Bearer\s+)[a-z0-9._\-]{8,}") {
        s = re.replace_all(&s, "${1}****").into_owned();
    }
    if let Ok(re) = regex::Regex::new(r"(?i)(authorization\s*[:=]\s*)[^\s,;\"']+") {
        s = re.replace_all(&s, "${1}****").into_owned();
    }
    if let Ok(re) = regex::Regex::new(r#"(?i)("?api[_a-z]*"?\s*[:=]\s*")[^"]{8,}""#) {
        s = re.replace_all(&s, "${1}****\"").into_owned();
    }
    if let Ok(re) = regex::Regex::new(r#"(?i)(api[_-]?key|api[_-]?secret|token|secret)\s*[:=]\s*([a-z0-9._\-]{8,})"#) {
        s = re.replace_all(&s, "${1}=****").into_owned();
    }
    s
}

fn count_levels(content: &str) -> (usize, usize) {
    let mut err = 0;
    let mut warn = 0;
    for line in content.lines() {
        let upper = line.to_ascii_uppercase();
        if upper.contains(" ERROR ") || upper.contains(" [ERROR]") || upper.contains(" ERR ") {
            err += 1;
        } else if upper.contains(" WARN ") || upper.contains(" [WARN]") || upper.contains(" WARNING ") {
            warn += 1;
        }
    }
    (err, warn)
}

fn gateway_status() -> String {
    let port = crate::commands::gateway_listen_port();
    match std::net::TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().unwrap_or_else(|_| "127.0.0.1:18789".parse().unwrap()), Duration::from_millis(800)) {
        Ok(_) => "running".to_string(),
        Err(_) => "stopped".to_string(),
    }
}

fn manifest_json(excluded: &[String], remark: &str, files: &[Value]) -> Value {
    let mut err = 0usize;
    let mut warn = 0usize;
    for f in files {
        err += f["error_count"].as_u64().unwrap_or(0) as usize;
        warn += f["warn_count"].as_u64().unwrap_or(0) as usize;
    }
    json!({
        "app_version": env!("CARGO_PKG_VERSION"),
        "client_id": client_id(),
        "os": std::env::consts::OS,
        "engine": "both",
        "upload_date": crate::commands::log_rotate::today_str(),
        "upload_at": chrono::Local::now().to_rfc3339(),
        "gateway_status": gateway_status(),
        "files": files,
        "excluded": excluded,
        "remark": remark,
        "stats": { "error_count": err, "warn_count": warn }
    })
}

/// 预览：返回当天可上传文件清单（供前端勾选/预览）
#[tauri::command]
pub fn log_upload_preview() -> Result<Value, String> {
    let sources = collect_sources();
    let files: Vec<Value> = sources
        .iter()
        .map(|s| {
            let content = read_limited(&s.path, s.max_bytes);
            let (err, warn) = count_levels(&content);
            json!({
                "key": s.key,
                "name": s.name,
                "size": std::fs::metadata(&s.path).map(|m| m.len()).unwrap_or(0),
                "lines": content.lines().count(),
                "error": s.error,
                "error_count": err,
                "warn_count": warn,
            })
        })
        .collect();
    Ok(json!({ "files": files }))
}

/// 打包 zip：按用户排除项生成 `{openclaw_dir}/log-upload/log-{date}-{client_id前8}.zip`
#[tauri::command]
pub fn log_upload_build(excluded: Vec<String>, remark: String) -> Result<Value, String> {
    let sources = collect_sources();
    let out_dir = crate::commands::openclaw_dir().join("log-upload");
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("创建上传目录失败: {e}"))?;
    let date = crate::commands::log_rotate::today_str();
    let cid = client_id();
    let cid8 = cid.chars().take(8).collect::<String>();
    let zip_path = out_dir.join(format!("log-{date}-{cid8}.zip"));

    let file = std::fs::File::create(&zip_path).map_err(|e| format!("创建 zip 失败: {e}"))?;
    let mut zw = zip::ZipWriter::new(file);

    let mut files_meta: Vec<Value> = Vec::new();
    let mut stats_err = 0usize;
    let mut stats_warn = 0usize;

    let mut add_entry = |zw: &mut zip::ZipWriter<std::fs::File>, name: &str, content: &str| -> Result<(), String> {
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        zw.start_file(name, opts).map_err(|e| format!("zip 写入 {name} 失败: {e}"))?;
        zw.write_all(content.as_bytes()).map_err(|e| format!("zip 写入 {name} 失败: {e}"))
    };

    for s in &sources {
        if excluded.iter().any(|e| e == &s.key) {
            continue;
        }
        let raw = read_limited(&s.path, s.max_bytes);
        let content = redact(&raw);
        let (err, warn) = count_levels(&raw);
        add_entry(&mut zw, &s.name, &content)?;
        files_meta.push(json!({
            "name": s.name,
            "size": content.len(),
            "lines": content.lines().count(),
            "error": s.error,
            "error_count": err,
            "warn_count": warn,
        }));
        stats_err += err;
        stats_warn += warn;
    }

    // excluded.txt（用户排除项）
    if !excluded.is_empty() {
        let txt = excluded.join("\n");
        add_entry(&mut zw, "excluded.txt", &txt)?;
    }

    // manifest.json
    let manifest = manifest_json(&excluded, &remark, &files_meta);
    add_entry(&mut zw, "manifest.json", &serde_json::to_string_pretty(&manifest).unwrap_or_default())?;

    zw.finish().map_err(|e| format!("zip 收尾失败: {e}"))?;

    Ok(json!({
        "zip_path": zip_path.to_string_lossy().to_string(),
        "size": std::fs::metadata(&zip_path).map(|m| m.len()).unwrap_or(0),
        "files": files_meta,
        "stats": { "error_count": stats_err, "warn_count": stats_warn },
    }))
}

/// 上传 zip 到后端接口
#[tauri::command]
pub async fn log_upload_send(zip_path: String, remark: String) -> Result<Value, String> {
    let p = PathBuf::from(&zip_path);
    if !p.exists() {
        return Err("zip 文件不存在，请先构建".into());
    }
    let url = format!("{UPLOAD_BASE_URL}{UPLOAD_ENDPOINT}");
    let date = crate::commands::log_rotate::today_str();

    let form = reqwest::multipart::Form::new()
        .text("client_id", client_id())
        .text("client_version", env!("CARGO_PKG_VERSION").to_string())
        .text("engine", "both")
        .text("upload_date", date)
        .text("remark", remark)
        .file("file", p.clone())
        .await
        .map_err(|e| format!("构造上传请求失败: {e}"))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;

    let resp = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("上传请求失败: {e}"))?;

    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    if status == 200 {
        if let Ok(j) = serde_json::from_str::<Value>(&body) {
            if j["code"].as_i64().unwrap_or(-1) == 0 {
                return Ok(json!({ "ok": true, "upload_id": j["data"]["upload_id"], "body": body }));
            }
        }
        return Err(format!("上传返回异常（HTTP {status}）: {body}"));
    }
    Err(format!("上传失败（HTTP {status}）: {}", body.chars().take(300).collect::<String>()))
}
