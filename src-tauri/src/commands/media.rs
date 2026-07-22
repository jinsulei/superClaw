use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;

const ROUTE_KINDS: &[&str] = &[
    "text_to_image",
    "image_to_image",
    "text_to_video",
    "image_to_video",
    "text_to_speech",
    "text_to_music",
    "image_understanding",
];
const ROUTE_PROTOCOLS: &[&str] = &["openai-images", "openai-video", "minimax-cli", "custom"];
const FORBIDDEN_ROUTE_FIELDS: &[&str] = &[
    "apiKey",
    "api_key",
    "token",
    "authorization",
    "baseUrl",
    "base_url",
];

fn media_config_path() -> Result<PathBuf, String> {
    let resources = super::app_resources_dir()
        .ok_or_else(|| "SuperClaw resources directory was not found".to_string())?;
    Ok(resources
        .join("data")
        .join("media")
        .join("media-routes.json"))
}

fn default_config() -> Value {
    json!({
        "version": 1,
        "routes": {}
    })
}

fn clean_text(value: Option<&Value>, field: &str, required: bool) -> Result<String, String> {
    let text = value.and_then(Value::as_str).unwrap_or("").trim();
    if required && text.is_empty() {
        return Err(format!("Media route field '{field}' is required"));
    }
    if text.len() > 512 {
        return Err(format!("Media route field '{field}' is too long"));
    }
    Ok(text.to_string())
}

fn sanitize_routes(routes: &Map<String, Value>) -> Result<Map<String, Value>, String> {
    let mut normalized = Map::new();
    for (kind, raw_route) in routes {
        if !ROUTE_KINDS.contains(&kind.as_str()) {
            return Err(format!("Unsupported media route kind: {kind}"));
        }
        let route = raw_route
            .as_object()
            .ok_or_else(|| format!("Media route '{kind}' must be an object"))?;
        if route
            .keys()
            .any(|key| FORBIDDEN_ROUTE_FIELDS.contains(&key.as_str()))
        {
            return Err(format!("Media route '{kind}' must reference an existing provider and must not contain credentials or Base URL"));
        }
        let provider_id = clean_text(route.get("providerId"), "providerId", true)?;
        let model = clean_text(route.get("model"), "model", true)?;
        let protocol = clean_text(route.get("protocol"), "protocol", true)?;
        if !ROUTE_PROTOCOLS.contains(&protocol.as_str()) {
            return Err(format!("Unsupported media route protocol: {protocol}"));
        }
        if !protocol_supports_kind(&protocol, kind) {
            return Err(format!(
                "Media protocol '{protocol}' does not support '{kind}'"
            ));
        }
        let enabled = route
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        normalized.insert(
            kind.clone(),
            json!({
                "providerId": provider_id,
                "model": model,
                "protocol": protocol,
                "enabled": enabled
            }),
        );
    }
    Ok(normalized)
}

fn protocol_supports_kind(protocol: &str, kind: &str) -> bool {
    match protocol {
        "openai-images" => matches!(kind, "text_to_image" | "image_to_image"),
        "openai-video" => matches!(kind, "text_to_video" | "image_to_video"),
        "minimax-cli" => matches!(
            kind,
            "text_to_image"
                | "text_to_video"
                | "image_to_video"
                | "text_to_speech"
                | "text_to_music"
                | "image_understanding"
        ),
        "custom" => true,
        _ => false,
    }
}

fn normalize_config(config: Value) -> Result<Value, String> {
    let root = config
        .as_object()
        .ok_or_else(|| "Media route config must be an object".to_string())?;
    let routes = root
        .get("routes")
        .and_then(Value::as_object)
        .ok_or_else(|| "Media route config requires a routes object".to_string())?;
    let version = root.get("version").and_then(Value::as_u64).unwrap_or(1);
    if version != 1 {
        return Err(format!("Unsupported media route config version: {version}"));
    }
    Ok(json!({
        "version": 1,
        "routes": sanitize_routes(routes)?
    }))
}

#[tauri::command]
pub fn media_config_read() -> Result<Value, String> {
    let path = media_config_path()?;
    if !path.exists() {
        return Ok(default_config());
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read media route config: {e}"))?;
    let parsed: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Media route config must be valid JSON: {e}"))?;
    normalize_config(parsed)
}

#[tauri::command]
pub fn media_config_write(config: Value) -> Result<Value, String> {
    let normalized = normalize_config(config)?;
    let path = media_config_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "Media route config has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create media config directory: {e}"))?;
    let text = serde_json::to_string_pretty(&normalized)
        .map_err(|e| format!("Failed to serialize media route config: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("Failed to write media route config: {e}"))?;
    Ok(json!({
        "ok": true,
        "path": "data/media/media-routes.json",
        "config": normalized
    }))
}

fn text_image_endpoint(base_url: &str) -> String {
    let root = base_url.trim_end_matches('/');
    if root.ends_with("/v1") {
        format!("{root}/images/generations")
    } else {
        format!("{root}/v1/images/generations")
    }
}

fn media_output_dir() -> Result<PathBuf, String> {
    let resources = super::app_resources_dir()
        .ok_or_else(|| "SuperClaw resources directory was not found".to_string())?;
    Ok(resources.join("data").join("generated").join("media"))
}

fn media_provider(route: &Value) -> Result<(String, String, String), String> {
    let provider_id = route["providerId"].as_str().unwrap_or("");
    let config = super::config::read_openclaw_config()?;
    let provider = config["models"]["providers"][provider_id]
        .as_object()
        .ok_or_else(|| "Configured media provider was not found".to_string())?;
    let base_url = provider
        .get("baseUrl")
        .or_else(|| provider.get("base_url"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let api_key = provider
        .get("apiKey")
        .or_else(|| provider.get("api_key"))
        .or_else(|| provider.get("key"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if base_url.is_empty() || api_key.is_empty() {
        return Err("Configured media provider is missing Base URL or API Key".to_string());
    }
    Ok((
        base_url,
        api_key,
        route["model"].as_str().unwrap_or("").to_string(),
    ))
}

fn official_minimax_base_url(base_url: &str) -> bool {
    let lower = base_url.to_ascii_lowercase();
    lower.contains("api.minimax.io") || lower.contains("api.minimaxi.com")
}

fn minimax_region(base_url: &str) -> &'static str {
    if base_url.to_ascii_lowercase().contains("minimaxi.com") {
        "cn"
    } else {
        "global"
    }
}

fn minimax_cli_paths() -> Result<(PathBuf, PathBuf), String> {
    let resources = super::app_resources_dir()
        .ok_or_else(|| "SuperClaw resources directory was not found".to_string())?;
    let runtime = resources.join("runtime").join("openclaw");
    let node = if cfg!(target_os = "windows") {
        runtime.join("node.exe")
    } else {
        runtime.join("node")
    };
    let cli = runtime
        .join("node_modules")
        .join("mmx-cli")
        .join("dist")
        .join("mmx.mjs");
    if !node.is_file() {
        return Err("Bundled OpenClaw Node runtime was not found".to_string());
    }
    if !cli.is_file() {
        return Err("Bundled MiniMax media CLI was not found".to_string());
    }
    Ok((node, cli))
}

fn safe_media_name(prefix: &str, extension: &str) -> String {
    format!(
        "{prefix}-{}-{}.{}",
        chrono::Utc::now().timestamp_millis(),
        rand::random::<u32>(),
        extension
    )
}

fn media_relative_path(path: &PathBuf) -> String {
    format!(
        "data/generated/media/{}",
        path.file_name().unwrap_or_default().to_string_lossy()
    )
}

async fn run_minimax_cli(
    kind: &str,
    route: &Value,
    prompt: &str,
    input_path: Option<&str>,
    options: Option<&Value>,
) -> Result<Value, String> {
    let (base_url, api_key, _) = media_provider(route)?;
    if !official_minimax_base_url(&base_url) {
        return Err(
            "MiniMax media requires an official MiniMax Global or China Base URL, not a relay URL"
                .to_string(),
        );
    }
    let (node, cli) = minimax_cli_paths()?;
    let output_dir = media_output_dir()?;
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create media output directory: {e}"))?;
    let input = input_path.unwrap_or("").trim();
    let mut args = vec![cli.to_string_lossy().to_string()];
    let mut output_file: Option<PathBuf> = None;
    match kind {
        "text_to_image" => {
            args.extend([
                "image".into(),
                "generate".into(),
                "--prompt".into(),
                prompt.into(),
                "--out-dir".into(),
                output_dir.to_string_lossy().to_string(),
            ]);
            if let Some(ratio) = options
                .and_then(|v| v.get("aspectRatio"))
                .and_then(Value::as_str)
                .filter(|v| !v.trim().is_empty())
            {
                args.extend(["--aspect-ratio".into(), ratio.trim().into()]);
            }
        }
        "text_to_video" | "image_to_video" => {
            args.extend([
                "video".into(),
                "generate".into(),
                "--prompt".into(),
                prompt.into(),
            ]);
            if kind == "image_to_video" {
                if input.is_empty() {
                    return Err("Image-to-video requires a source image".to_string());
                }
                args.extend(["--first-frame".into(), input.into()]);
            }
            let file = output_dir.join(safe_media_name("video", "mp4"));
            args.extend(["--download".into(), file.to_string_lossy().to_string()]);
            output_file = Some(file);
        }
        "text_to_speech" => {
            let file = output_dir.join(safe_media_name("speech", "mp3"));
            args.extend([
                "speech".into(),
                "synthesize".into(),
                "--text".into(),
                prompt.into(),
                "--out".into(),
                file.to_string_lossy().to_string(),
            ]);
            if let Some(voice) = options
                .and_then(|v| v.get("voice"))
                .and_then(Value::as_str)
                .filter(|v| !v.trim().is_empty())
            {
                args.extend(["--voice".into(), voice.trim().into()]);
            }
            output_file = Some(file);
        }
        "text_to_music" => {
            let file = output_dir.join(safe_media_name("music", "mp3"));
            args.extend([
                "music".into(),
                "generate".into(),
                "--prompt".into(),
                prompt.into(),
                "--instrumental".into(),
                "--out".into(),
                file.to_string_lossy().to_string(),
            ]);
            output_file = Some(file);
        }
        "image_understanding" => {
            if input.is_empty() {
                return Err("Image understanding requires a source image".to_string());
            }
            args.extend([
                "vision".into(),
                "describe".into(),
                "--image".into(),
                input.into(),
                "--prompt".into(),
                prompt.into(),
            ]);
        }
        _ => return Err(format!("MiniMax media does not support '{kind}'")),
    }
    args.extend([
        "--api-key".into(),
        api_key,
        "--region".into(),
        minimax_region(&base_url).into(),
        "--output".into(),
        "json".into(),
        "--quiet".into(),
        "--non-interactive".into(),
        "--no-color".into(),
    ]);
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(310),
        tokio::process::Command::new(node)
            .args(args)
            .stdin(Stdio::null())
            .output(),
    )
    .await
    .map_err(|_| "MiniMax media request timed out".to_string())?
    .map_err(|e| format!("Failed to start bundled MiniMax media CLI: {e}"))?;
    let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).trim().to_string();
    if !result.status.success() {
        let message = if stderr.is_empty() { stdout } else { stderr };
        return Err(if message.is_empty() {
            "MiniMax media request failed".to_string()
        } else {
            message
        });
    }
    if kind == "image_understanding" {
        let parsed =
            serde_json::from_str::<Value>(&stdout).unwrap_or_else(|_| json!({ "text": stdout }));
        return Ok(
            json!({ "ok": true, "kind": kind, "text": parsed["text"].as_str().unwrap_or(&stdout), "details": parsed }),
        );
    }
    if kind == "text_to_image" {
        return Ok(
            json!({ "ok": true, "kind": "image", "path": output_dir.to_string_lossy(), "relativePath": "data/generated/media", "details": serde_json::from_str::<Value>(&stdout).unwrap_or_else(|_| json!({ "output": stdout })) }),
        );
    }
    let file =
        output_file.ok_or_else(|| "MiniMax media did not create an output target".to_string())?;
    if !file.is_file() {
        return Err("MiniMax media completed without producing an output file".to_string());
    }
    Ok(
        json!({ "ok": true, "kind": kind, "path": file.to_string_lossy(), "relativePath": media_relative_path(&file), "details": serde_json::from_str::<Value>(&stdout).unwrap_or_else(|_| json!({ "output": stdout })) }),
    )
}

/// Executes only the standard OpenAI Images text-to-image contract. The route
/// references an existing provider; credentials never cross the UI boundary.
#[tauri::command]
pub async fn media_generate_text_image(
    prompt: String,
    size: Option<String>,
) -> Result<Value, String> {
    let config = media_config_read()?;
    let route = config["routes"]["text_to_image"].clone();
    if route.is_null() || route["enabled"] == false {
        return Err("Text-to-image is not configured".to_string());
    }
    let prompt = prompt.trim();
    if prompt.is_empty() || prompt.len() > 8000 {
        return Err("Image prompt must be between 1 and 8000 characters".to_string());
    }
    if route["protocol"].as_str() == Some("minimax-cli") {
        return run_minimax_cli("text_to_image", &route, prompt, None, None).await;
    }
    if route["protocol"].as_str() != Some("openai-images") {
        return Err("Text-to-image route does not use a supported media protocol".to_string());
    }
    let (base_url, api_key, model) = media_provider(&route)?;
    let payload = json!({ "model": model, "prompt": prompt, "size": size.unwrap_or_else(|| "1024x1024".to_string()), "response_format": "b64_json" });
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create media client: {e}"))?
        .post(text_image_endpoint(&base_url))
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Media generation request failed: {e}"))?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Media provider returned invalid JSON: {e}"))?;
    if !status.is_success() {
        return Err(body["error"]["message"]
            .as_str()
            .unwrap_or("Media provider rejected the request")
            .to_string());
    }
    let encoded = body["data"][0]["b64_json"]
        .as_str()
        .ok_or_else(|| "Media provider did not return image bytes".to_string())?;
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Media provider returned invalid image data: {e}"))?;
    if bytes.len() > 25 * 1024 * 1024 {
        return Err("Generated image is larger than 25MB".to_string());
    }
    let dir = media_output_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create media output directory: {e}"))?;
    let name = format!(
        "image-{}-{}.png",
        chrono::Utc::now().timestamp_millis(),
        rand::random::<u32>()
    );
    let path = dir.join(name);
    fs::write(&path, bytes).map_err(|e| format!("Failed to save generated image: {e}"))?;
    Ok(
        json!({"ok":true,"kind":"image","path":path.to_string_lossy(),"relativePath":format!("data/generated/media/{}", path.file_name().unwrap().to_string_lossy())}),
    )
}

/// Runs a configured portable media route. This keeps agent-facing media work
/// separate from chat model routing and uses the same bundled MiniMax CLI as
/// the OpenClaw plugin when that protocol is selected.
#[tauri::command]
pub async fn media_generate(
    kind: String,
    prompt: String,
    input_path: Option<String>,
    options: Option<Value>,
) -> Result<Value, String> {
    let kind = kind.trim();
    if !ROUTE_KINDS.contains(&kind) {
        return Err(format!("Unsupported media route kind: {kind}"));
    }
    let prompt = prompt.trim();
    if prompt.is_empty() || prompt.len() > 8000 {
        return Err("Media prompt must be between 1 and 8000 characters".to_string());
    }
    let config = media_config_read()?;
    let route = config["routes"][kind].clone();
    if route.is_null() || route["enabled"] == false {
        return Err(format!("Media route '{kind}' is not configured"));
    }
    match route["protocol"].as_str() {
        Some("minimax-cli") => {
            run_minimax_cli(
                kind,
                &route,
                prompt,
                input_path.as_deref(),
                options.as_ref(),
            )
            .await
        }
        Some("openai-images") if kind == "text_to_image" => {
            media_generate_text_image(
                prompt.to_string(),
                options.and_then(|v| v.get("size").and_then(Value::as_str).map(str::to_string)),
            )
            .await
        }
        Some(protocol) => Err(format!(
            "Media route '{kind}' uses '{protocol}', which is not executable in this build"
        )),
        None => Err(format!("Media route '{kind}' has no protocol")),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_config;
    use serde_json::json;

    #[test]
    fn media_routes_keep_only_provider_references() {
        let normalized = normalize_config(json!({
            "version": 1,
            "routes": {
                "text_to_image": {
                    "providerId": "image_provider",
                    "model": "image-model-v1",
                    "protocol": "openai-images"
                }
            }
        }))
        .expect("media route should be valid");

        assert_eq!(
            normalized["routes"]["text_to_image"]["providerId"],
            "image_provider"
        );
        assert_eq!(normalized["routes"]["text_to_image"]["enabled"], true);
    }

    #[test]
    fn media_routes_reject_embedded_credentials_and_base_urls() {
        for forbidden in ["apiKey", "token", "baseUrl"] {
            let result = normalize_config(json!({
                "version": 1,
                "routes": {
                    "text_to_image": {
                        "providerId": "image_provider",
                        "model": "image-model-v1",
                        "protocol": "openai-images",
                        forbidden: "must-not-be-stored-here"
                    }
                }
            }));
            assert!(result.is_err(), "{forbidden} must be rejected");
        }
    }
}
