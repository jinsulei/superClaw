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
// 即梦 (Jidu/Dreamina) 主流模型关键词。Seedream 是生图模型，Seedance 是生视频模型。
// 按子串做大小写不敏感匹配，与 src/lib/media-provider-routing.js 保持一致。
const SEEDREAM_KEYWORDS: &[&str] = &["seedream", "doubao-seedream"];
const SEEDANCE_KEYWORDS: &[&str] = &["seedance", "doubao-seedance", "seedans"];

fn media_config_path() -> Result<PathBuf, String> {
    super::media_config_path()
        .ok_or_else(|| "SuperClaw resources directory was not found".to_string())
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

/// Download a generated image returned as a URL. Some relays (e.g. the yiqiu
/// upstream behind yyapi) return `data[0].url` instead of `data[0].b64_json`.
/// Signed URLs usually work without auth; retry with the media provider key if
/// the first attempt is rejected with 401.
async fn download_media_url(client: &reqwest::Client, url: &str, api_key: &str) -> Result<Vec<u8>, String> {
    let first = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download generated image: {e}"))?;
    let response = if first.status() == reqwest::StatusCode::UNAUTHORIZED && !api_key.is_empty() {
        client
            .get(url)
            .bearer_auth(api_key)
            .send()
            .await
            .map_err(|e| format!("Failed to download generated image: {e}"))?
    } else {
        first
    };
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read generated image: {e}"))?;
    if !status.is_success() {
        return Err(format!("Failed to download generated image (HTTP {status})"));
    }
    if bytes.is_empty() {
        return Err("Generated image URL returned empty data".to_string());
    }
    Ok(bytes.to_vec())
}

fn chat_completion_endpoint(base_url: &str) -> String {
    let root = base_url.trim_end_matches('/');
    if root.ends_with("/v1") {
        format!("{root}/chat/completions")
    } else {
        format!("{root}/v1/chat/completions")
    }
}

fn selected_chat_provider(config: &Value) -> Result<(String, String, String), String> {
    let primary = config["agents"]["defaults"]["model"]["primary"]
        .as_str()
        .unwrap_or("")
        .trim();
    let (provider_id, model) = primary
        .split_once('/')
        .ok_or_else(|| "No primary chat model is configured for media intent classification".to_string())?;
    let provider = config["models"]["providers"][provider_id]
        .as_object()
        .ok_or_else(|| "Primary chat provider was not found".to_string())?;
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
    if base_url.is_empty() || api_key.is_empty() || model.trim().is_empty() {
        return Err("Primary chat model is missing Base URL, API Key, or model".to_string());
    }
    Ok((base_url, api_key, model.trim().to_string()))
}

fn parse_intent_json(raw: &str) -> Value {
    let trimmed = raw.trim().trim_matches('`').trim();
    let candidate = trimmed
        .strip_prefix("json")
        .map(str::trim)
        .unwrap_or(trimmed);
    let parsed = serde_json::from_str::<Value>(candidate).unwrap_or_else(|_| {
        let start = candidate.find('{');
        let end = candidate.rfind('}');
        match (start, end) {
            (Some(start), Some(end)) if end >= start => serde_json::from_str(&candidate[start..=end]).unwrap_or_else(|_| json!({})),
            _ => json!({}),
        }
    });
    let action = match parsed["action"].as_str().unwrap_or("") {
        "generate" | "generate_image" => "generate_image",
        "plan" | "plan_image" => "plan_image",
        _ => "chat",
    };
    let deliverable = match parsed["deliverable"].as_str().unwrap_or("") {
        "image" | "document" | "video" | "code" | "music" | "speech" | "chat" => parsed["deliverable"].as_str().unwrap_or("").trim(),
        _ => "chat",
    };
    json!({
        "action": action,
        "deliverable": deliverable,
        "prompt": parsed["prompt"].as_str().unwrap_or("").trim(),
        "reason": parsed["reason"].as_str().unwrap_or("").trim(),
    })
}

/// Uses the selected chat model only to classify the user's *current* intent.
/// The result never generates media itself: the caller invokes the deterministic
/// native media route after the classifier returns `generate_image`.
#[tauri::command]
pub async fn media_classify_intent(text: String, context: Option<Value>) -> Result<Value, String> {
    let text = text.trim();
    if text.is_empty() {
        return Ok(json!({ "action": "chat", "prompt": "", "reason": "empty input" }));
    }
    let config = super::config::read_openclaw_config()?;
    let (base_url, api_key, model) = selected_chat_provider(&config)?;
    let recent = context
        .as_ref()
        .and_then(|value| value.get("recent_messages"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    let system = r#"You are a strict JSON intent classifier for a desktop AI assistant. Return JSON only: {"action":"chat|plan_image|generate_image","deliverable":"image|document|video|code|music|speech|chat","prompt":"","reason":""}. 你必须根据当前消息和最近对话的含义判断，不要按单个词匹配。
规则：
1. deliverable 表示用户最终想要的交付物类型：image=图片/海报/插画/封面/配图/头像/照片/壁纸/效果图等视觉图；document=PPT/幻灯片/演示文稿/文档/Word/Excel/表格/报告/论文/纪要/清单/方案/策划案；video=视频/剪辑/动画；code=代码/程序/脚本/网页/网站/前端/后端；music=音乐/歌曲；speech=配音/语音/朗读；chat=普通对话/咨询/分析/总结等。注意"生成一份PPT"这类，交付物是 PPT 文档，deliverable=document，绝不能因为出现"生成"就判为图片。
2. action：只有 deliverable=image 时才可能是 plan_image（用户说"先理解意图/先分析/先规划/不要生成"）或 generate_image（当前明确要求生成/交付图片，并把最近对话中的完整画面要求整理到 prompt）。deliverable 为 document/video/code/music/speech/chat 时 action 一律为 chat——即使出现"生成/制作/做出来"等动词也不行，这些任务由 agent 自己处理。
3. 上一轮出现过图片需求本身不能自动执行，必须看当前轮是否要求交付图片。
示例："饭店横屏宣传图，88元套餐，你先理解意图" => {"action":"plan_image","deliverable":"image"}。上一轮是该需求，本轮说"现在就按刚才需求生成横屏宣传图" => {"action":"generate_image","deliverable":"image"}。"帮我生成一份项目汇报PPT" => {"action":"chat","deliverable":"document"}。"帮我生成一段产品介绍视频" => {"action":"chat","deliverable":"video"}。不要解释，不要添加 markdown。"#;
    let payload = json!({
        "model": model,
        "temperature": 0,
        "max_tokens": 320,
        "stream": false,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": format!("Recent conversation (may be empty): {}\n\nCurrent user message:\n{}", recent, text) }
        ]
    });
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| format!("Failed to create intent classifier client: {e}"))?
        .post(chat_completion_endpoint(&base_url))
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Media intent classification request failed: {e}"))?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|e| format!("Media intent classifier returned invalid JSON: {e}"))?;
    if !status.is_success() {
        return Err(body["error"]["message"].as_str().unwrap_or("Media intent classifier rejected the request").to_string());
    }
    let content = body["choices"][0]["message"]["content"].as_str().unwrap_or("");
    Ok(parse_intent_json(content))
}

fn media_output_dir() -> Result<PathBuf, String> {
    super::media_output_data_dir()
        .ok_or_else(|| "SuperClaw media output directory was not found".to_string())
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

fn provider_model_ids(provider: &Value) -> Vec<String> {
    provider
        .get("models")
        .and_then(Value::as_array)
        .map(|models| {
            models
                .iter()
                .filter_map(|entry| {
                    let id = entry
                        .as_str()
                        .or_else(|| entry.get("id").and_then(Value::as_str))
                        .or_else(|| entry.get("model").and_then(Value::as_str))?
                        .trim();
                    (!id.is_empty()).then(|| id.to_string())
                })
                .collect()
        })
        .unwrap_or_default()
}

fn provider_has_credentials(provider: &Value) -> bool {
    let base_url = provider
        .get("baseUrl")
        .or_else(|| provider.get("base_url"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let api_key = provider
        .get("apiKey")
        .or_else(|| provider.get("api_key"))
        .or_else(|| provider.get("key"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    !base_url.is_empty() && !api_key.is_empty()
}

fn media_provider_usable(openclaw: &Value, route: &Value) -> bool {
    let provider_id = route["providerId"].as_str().unwrap_or("");
    if provider_id.is_empty() {
        return false;
    }
    match openclaw["models"]["providers"][provider_id].as_object() {
        Some(provider) => {
            let base_url = provider
                .get("baseUrl")
                .or_else(|| provider.get("base_url"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            let api_key = provider
                .get("apiKey")
                .or_else(|| provider.get("api_key"))
                .or_else(|| provider.get("key"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            !base_url.is_empty() && !api_key.is_empty()
        }
        None => false,
    }
}

fn is_minimax_provider(provider_id: &str, provider: &Value) -> bool {
    let id = provider_id.to_ascii_lowercase();
    let base_url = provider
        .get("baseUrl")
        .or_else(|| provider.get("base_url"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    id.contains("minimax") || base_url.contains("api.minimax.io") || base_url.contains("api.minimaxi.com")
}

fn contains_any_keyword(model_ids: &[String], keywords: &[&str]) -> bool {
    model_ids.iter().any(|id| {
        let lower = id.to_ascii_lowercase();
        keywords.iter().any(|keyword| lower.contains(keyword))
    })
}

fn find_keyword_model<'a>(model_ids: &'a [String], keywords: &[&str]) -> Option<&'a str> {
    model_ids.iter().find(|id| {
        let lower = id.to_ascii_lowercase();
        keywords.iter().any(|keyword| lower.contains(keyword))
    }).map(|s| s.as_str())
}

fn mark_route(routes: &mut Map<String, Value>, kind: &str, route: Value) {
    if !routes.contains_key(kind) {
        let mut r = route;
        if let Some(obj) = r.as_object_mut() {
            obj.insert("implicit".to_string(), Value::Bool(true));
        }
        routes.insert(kind.to_string(), r);
    }
}

/// Generalize media provider auto-detection across every configured provider,
/// mirroring src/lib/media-provider-routing.js. A user's explicit media route
/// always wins (handled by configured_media_route); this fills capabilities
/// from model-list keywords so yyapi/gpt-image-2, MiniMax and 即梦 can coexist.
///
/// Image priority: gpt-image-2 > MiniMax > Seedream.
/// Video priority: MiniMax > Seedance.
fn auto_detect_media_routes(config: &Value) -> Value {
    let providers = config["models"]["providers"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    let mut routes: Map<String, Value> = Map::new();
    let mut gpt_image_providers: Vec<(String, String)> = Vec::new();
    let mut minimax_providers: Vec<(String, String)> = Vec::new();
    let mut seedream_providers: Vec<(String, String)> = Vec::new();
    let mut seedance_providers: Vec<(String, String)> = Vec::new();
    for (provider_id, provider) in &providers {
        if !provider.is_object() || !provider_has_credentials(provider) {
            continue;
        }
        let model_ids = provider_model_ids(provider);
        if is_minimax_provider(provider_id, provider) {
            let model = model_ids
                .first()
                .cloned()
                .unwrap_or_else(|| "MiniMax".to_string());
            minimax_providers.push((provider_id.clone(), model));
        }
        if model_ids.iter().any(|id| id.eq_ignore_ascii_case("gpt-image-2")) {
            if let Some(model) = model_ids
                .iter()
                .find(|id| id.eq_ignore_ascii_case("gpt-image-2"))
            {
                gpt_image_providers.push((provider_id.clone(), model.clone()));
            }
        }
        if contains_any_keyword(&model_ids, SEEDREAM_KEYWORDS) {
            if let Some(model) = find_keyword_model(&model_ids, SEEDREAM_KEYWORDS) {
                seedream_providers.push((provider_id.clone(), model.to_string()));
            }
        }
        if contains_any_keyword(&model_ids, SEEDANCE_KEYWORDS) {
            if let Some(model) = find_keyword_model(&model_ids, SEEDANCE_KEYWORDS) {
                seedance_providers.push((provider_id.clone(), model.to_string()));
            }
        }
    }
    // text_to_image priority: gpt-image-2 > MiniMax > Seedream
    if let Some((provider_id, model)) = gpt_image_providers.first() {
        mark_route(
            &mut routes,
            "text_to_image",
            json!({ "providerId": provider_id, "model": model, "protocol": "openai-images", "enabled": true }),
        );
    } else if let Some((provider_id, model)) = minimax_providers.first() {
        mark_route(
            &mut routes,
            "text_to_image",
            json!({ "providerId": provider_id, "model": model, "protocol": "minimax-cli", "enabled": true }),
        );
    } else if let Some((provider_id, model)) = seedream_providers.first() {
        mark_route(
            &mut routes,
            "text_to_image",
            json!({ "providerId": provider_id, "model": model, "protocol": "openai-images", "enabled": true }),
        );
    }
    // image_to_image: Seedream only (gpt-image-2/relay image-to-image is not synthesized).
    if let Some((provider_id, model)) = seedream_providers.first() {
        mark_route(
            &mut routes,
            "image_to_image",
            json!({ "providerId": provider_id, "model": model, "protocol": "openai-images", "enabled": true }),
        );
    }
    // MiniMax fills every minimax-cli capability (image routes above are already
    // reserved by higher-priority providers and mark_route will not overwrite them).
    if let Some((provider_id, model)) = minimax_providers.first() {
        for kind in [
            "text_to_image",
            "text_to_video",
            "image_to_video",
            "text_to_speech",
            "text_to_music",
            "image_understanding",
        ] {
            mark_route(
                &mut routes,
                kind,
                json!({ "providerId": provider_id, "model": model, "protocol": "minimax-cli", "enabled": true }),
            );
        }
    }
    // Video priority: MiniMax (set above) > Seedance.
    if let Some((provider_id, model)) = seedance_providers.first() {
        mark_route(
            &mut routes,
            "text_to_video",
            json!({ "providerId": provider_id, "model": model, "protocol": "openai-video", "enabled": true }),
        );
        mark_route(
            &mut routes,
            "image_to_video",
            json!({ "providerId": provider_id, "model": model, "protocol": "openai-video", "enabled": true }),
        );
    }
    Value::Object(routes)
}

fn configured_media_route(config: &Value, kind: &str) -> Value {
    let openclaw = super::config::read_openclaw_config().unwrap_or(Value::Null);
    // A user who is actively using yyapi should not have a legacy MiniMax
    // image route silently take over text-to-image. Explicit non-legacy routes
    // still win, and all non-image media keeps its configured route.
    if kind == "text_to_image" {
        let primary = openclaw["agents"]["defaults"]["model"]["primary"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if primary.starts_with("yyapi/") {
            let detected = auto_detect_media_routes(&openclaw);
            if let Some(route) = detected.get("text_to_image") {
                if !route.is_null() {
                    return route.clone();
                }
            }
        }
    }
    let explicit = config["routes"][kind].clone();
    if !explicit.is_null() {
        // An explicitly-configured media route always wins, but only while its
        // provider still exists and is fully configured. After a provider rename
        // (e.g. minimax_cn/yyapi -> minimax), the stale reference must not
        // hard-fail media generation; fall back to the auto-detected route.
        if !media_provider_usable(&openclaw, &explicit) {
            let detected = auto_detect_media_routes(&openclaw)
                .get(kind)
                .cloned()
                .unwrap_or(Value::Null);
            if !detected.is_null()
                && detected["enabled"] != false
                && media_provider_usable(&openclaw, &detected)
            {
                return detected;
            }
        }
        return explicit;
    }
    auto_detect_media_routes(&openclaw)
        .get(kind)
        .cloned()
        .unwrap_or(Value::Null)
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

fn newest_generated_image(dir: &PathBuf) -> Option<PathBuf> {
    fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let extension = path.extension()?.to_str()?.to_ascii_lowercase();
            matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif")
                .then(|| {
                    let modified = entry.metadata().ok()?.modified().ok()?;
                    Some((modified, path))
                })
                .flatten()
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

fn preserve_generated_image(file: PathBuf, output_dir: &PathBuf) -> Result<PathBuf, String> {
    let extension = file
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("png");
    let target = output_dir.join(safe_media_name("image", extension));
    if let Err(rename_error) = fs::rename(&file, &target) {
        fs::copy(&file, &target).map_err(|copy_error| {
            format!(
                "Failed to preserve generated image after rename error ({rename_error}): {copy_error}"
            )
        })?;
        fs::remove_file(&file).map_err(|remove_error| {
            format!("Failed to remove temporary generated image after copy: {remove_error}")
        })?;
    }
    Ok(target)
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
        let file = newest_generated_image(&output_dir).ok_or_else(|| {
            "MiniMax image generation completed without producing an output file".to_string()
        })?;
        let file = preserve_generated_image(file, &output_dir)?;
        return Ok(
            json!({ "ok": true, "kind": "image", "path": file.to_string_lossy(), "relativePath": media_relative_path(&file), "details": serde_json::from_str::<Value>(&stdout).unwrap_or_else(|_| json!({ "output": stdout })) }),
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

// ---------------------------------------------------------------------------
// OpenAI-style video adapter (即梦 Seedance and other relays). Mirrors the pure
// endpoint/parse semantics in src/lib/media-provider-routing.js so the plugin,
// the Web debug server and the native Rust command all share the same shape.
// ---------------------------------------------------------------------------

/// Build submit + poll endpoints for an OpenAI-compatible or Volcengine Ark
/// video provider. baseUrl may end with `/v1` (relay) or `/api/v3` (Ark).
fn video_endpoints(base_url: &str) -> (String, String, bool) {
    let root = base_url.trim_end_matches('/');
    if root.contains("/api/v3") {
        (
            format!("{root}/contents/generations/tasks"),
            format!("{root}/contents/generations/tasks/"),
            true,
        )
    } else if root.ends_with("/v1") {
        (
            format!("{root}/videos/generations"),
            format!("{root}/videos/generations/"),
            false,
        )
    } else {
        (
            format!("{root}/v1/videos/generations"),
            format!("{root}/v1/videos/generations/"),
            false,
        )
    }
}

/// Convert a local source image path to a data URL for image-to-video. URLs and
/// data URLs pass through untouched.
fn local_image_data_url(input_path: &str) -> Result<String, String> {
    let value = input_path.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    if value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("data:")
    {
        return Ok(value.to_string());
    }
    let path = PathBuf::from(value);
    let metadata = fs::metadata(&path)
        .map_err(|_| format!("Image file not found: {value}"))?;
    if !metadata.is_file() {
        return Err(format!("Image file not found: {value}"));
    }
    if metadata.len() > 25 * 1024 * 1024 {
        return Err("Source image for video is larger than 25MB".to_string());
    }
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read source image: {e}"))?;
    let mime = match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    };
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

async fn save_video_result(
    client: &reqwest::Client,
    url: &str,
    b64: &str,
    api_key: &str,
) -> Result<Value, String> {
    let bytes = if !b64.is_empty() {
        let decoded = general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("Video provider returned invalid video data: {e}"))?;
        if decoded.is_empty() {
            return Err("Video provider returned empty video data".to_string());
        }
        decoded
    } else if !url.is_empty() {
        let first = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Failed to download generated video: {e}"))?;
        let response = if first.status() == reqwest::StatusCode::UNAUTHORIZED
            && !api_key.is_empty()
        {
            client
                .get(url)
                .bearer_auth(api_key)
                .send()
                .await
                .map_err(|e| format!("Failed to download generated video: {e}"))?
        } else {
            first
        };
        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read generated video: {e}"))?;
        if !status.is_success() {
            return Err(format!("Failed to download generated video (HTTP {status})"));
        }
        if bytes.is_empty() {
            return Err("Generated video URL returned empty data".to_string());
        }
        bytes.to_vec()
    } else {
        return Err("Video provider did not return downloadable video data".to_string());
    };
    if bytes.len() > 500 * 1024 * 1024 {
        return Err("Generated video is larger than 500MB".to_string());
    }
    let dir = media_output_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create media output directory: {e}"))?;
    let name = format!(
        "video-{}-{}.mp4",
        chrono::Utc::now().timestamp_millis(),
        rand::random::<u32>()
    );
    let path = dir.join(name);
    fs::write(&path, bytes).map_err(|e| format!("Failed to save generated video: {e}"))?;
    Ok(json!({
        "ok": true,
        "kind": "video",
        "path": path.to_string_lossy(),
        "relativePath": format!("data/generated/media/{}", path.file_name().unwrap_or_default().to_string_lossy())
    }))
}

/// Execute an OpenAI-style video route (即梦 Seedance or a relay). Supports both
/// the Ark async task flow (submit + poll + download) and the relay sync flow
/// (data[0].url / data[0].b64_json, or async id + poll).
async fn run_openai_video(
    _kind: &str,
    route: &Value,
    prompt: &str,
    input_path: Option<&str>,
) -> Result<Value, String> {
    let (base_url, api_key, model) = media_provider(route)?;
    let (submit_endpoint, poll_base, ark) = video_endpoints(&base_url);
    if submit_endpoint.is_empty() {
        return Err("Video provider Base URL is invalid".to_string());
    }
    let image_data_url = local_image_data_url(input_path.unwrap_or(""))?;
    let mut body = Map::new();
    body.insert("model".to_string(), json!(model));
    if ark {
        let mut content = vec![json!({ "type": "text", "text": prompt })];
        if !image_data_url.is_empty() {
            content.push(json!({ "type": "image_url", "image_url": { "url": image_data_url } }));
        }
        body.insert("content".to_string(), Value::Array(content));
    } else {
        body.insert("prompt".to_string(), json!(prompt));
        if !image_data_url.is_empty() {
            body.insert("image_url".to_string(), json!(image_data_url));
        }
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create video media client: {e}"))?;
    let mut headers = reqwest::header::HeaderMap::new();
    if ark {
        headers.insert(
            "X-MultiModal-Async",
            "1".parse().map_err(|_| "Invalid header value".to_string())?,
        );
    }
    let submit = client
        .post(&submit_endpoint)
        .bearer_auth(&api_key)
        .headers(headers)
        .json(&Value::Object(body))
        .send()
        .await
        .map_err(|e| format!("Video provider submit failed: {e}"))?;
    let status = submit.status();
    let submit_payload: Value = submit
        .json()
        .await
        .map_err(|e| format!("Video provider returned invalid JSON: {e}"))?;
    if !status.is_success() {
        return Err(submit_payload["error"]["message"]
            .as_str()
            .unwrap_or("Video provider submit failed")
            .to_string());
    }
    let data = submit_payload["data"].as_array().cloned().unwrap_or_default();
    if let Some(first) = data.first() {
        if let Some(url) = first["url"].as_str().filter(|value| !value.trim().is_empty()) {
            return save_video_result(&client, url, "", &api_key).await;
        }
        if let Some(b64) = first["b64_json"]
            .as_str()
            .filter(|value| !value.trim().is_empty())
        {
            return save_video_result(&client, "", b64, &api_key).await;
        }
    }
    let task_id = submit_payload["id"]
        .as_str()
        .or_else(|| submit_payload["task_id"].as_str())
        .or_else(|| submit_payload["output"]["task_id"].as_str())
        .or_else(|| submit_payload["request_id"].as_str())
        .unwrap_or("")
        .trim();
    if task_id.is_empty() {
        return Err("Video provider did not return a task id or a direct video".to_string());
    }
    let poll_endpoint = format!("{poll_base}{task_id}");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(600);
    while std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let poll = client
            .get(&poll_endpoint)
            .bearer_auth(&api_key)
            .send()
            .await
            .map_err(|e| format!("Video provider poll failed: {e}"))?;
        let poll_status = poll.status();
        let poll_payload: Value = poll
            .json()
            .await
            .map_err(|e| format!("Video provider poll returned invalid JSON: {e}"))?;
        if !poll_status.is_success() {
            return Err(poll_payload["error"]["message"]
                .as_str()
                .unwrap_or("Video provider poll failed")
                .to_string());
        }
        let status = poll_payload["status"]
            .as_str()
            .or_else(|| poll_payload["task_status"].as_str())
            .or_else(|| poll_payload["output"]["status"].as_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let video_url = poll_payload["data"][0]["url"]
            .as_str()
            .or_else(|| poll_payload["video_url"].as_str())
            .or_else(|| poll_payload["content"]["video_url"].as_str())
            .or_else(|| poll_payload["output"]["video_url"].as_str())
            .or_else(|| poll_payload["results"]["video_url"].as_str())
            .unwrap_or("")
            .trim();
        if !video_url.is_empty() {
            return save_video_result(&client, video_url, "", &api_key).await;
        }
        if status.contains("fail") || status.contains("cancel") || status.contains("error") {
            let message = poll_payload["error"]["message"]
                .as_str()
                .or_else(|| poll_payload["error_message"].as_str())
                .or_else(|| poll_payload["output"]["error_message"].as_str())
                .unwrap_or(&format!("Video task failed with status '{status}'"))
                .to_string();
            return Err(message);
        }
        if status.contains("succeed") || status == "success" || status == "done" {
            return Err("Video task succeeded without a downloadable URL".to_string());
        }
    }
    Err("Video generation timed out after 10 minutes".to_string())
}

/// Executes only the standard OpenAI Images text-to-image contract. The route
/// references an existing provider; credentials never cross the UI boundary.
#[tauri::command]
pub async fn media_generate_text_image(
    prompt: String,
    size: Option<String>,
) -> Result<Value, String> {
    let config = media_config_read()?;
    let route = configured_media_route(&config, "text_to_image");
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
    let payload = json!({
        "model": model,
        "prompt": prompt,
        "size": size.unwrap_or_else(|| "1024x1024".to_string()),
        "response_format": "b64_json",
        "output_format": "png"
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create media client: {e}"))?;
    let response = client
        .post(text_image_endpoint(&base_url))
        .bearer_auth(&api_key)
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
    let bytes = if let Some(encoded) = body["data"][0]["b64_json"].as_str() {
        let decoded = general_purpose::STANDARD
            .decode(encoded)
            .map_err(|e| format!("Media provider returned invalid image data: {e}"))?;
        if decoded.is_empty() {
            return Err("Media provider returned empty image data".to_string());
        }
        decoded
    } else if let Some(url) = body["data"][0]["url"].as_str() {
        download_media_url(&client, url, &api_key).await?
    } else {
        return Err("Media provider did not return image bytes or a URL".to_string());
    };
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
    let route = configured_media_route(&config, kind);
    if route.is_null() || route["enabled"] == false {
        return Err(format!("Media route '{kind}' is not configured"));
    }
    eprintln!(
        "[superclaw-media] request accepted kind={} protocol={} provider={} model={}",
        kind,
        route["protocol"].as_str().unwrap_or("unknown"),
        route["providerId"].as_str().unwrap_or("unknown"),
        route["model"].as_str().unwrap_or("unknown")
    );
    let result = match route["protocol"].as_str() {
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
        Some("openai-video") if kind == "text_to_video" || kind == "image_to_video" => {
            run_openai_video(kind, &route, prompt, input_path.as_deref()).await
        }
        Some(protocol) => Err(format!(
            "Media route '{kind}' uses '{protocol}', which is not executable in this build"
        )),
        None => Err(format!("Media route '{kind}' has no protocol")),
    };
    match &result {
        Ok(value) => eprintln!(
            "[superclaw-media] request completed kind={} output={}",
            kind,
            value["path"].as_str().unwrap_or("(no path)")
        ),
        Err(error) => eprintln!("[superclaw-media] request failed kind={} error={}", kind, error),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{auto_detect_media_routes, media_provider_usable, normalize_config, video_endpoints};
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

    #[test]
    fn yyapi_gpt_image_is_only_an_implicit_text_to_image_route() {
        let config = json!({
            "models": {
                "providers": {
                    "yyapi": {
                        "baseUrl": "https://api.yaoyaolx.com.cn",
                        "apiKey": "hidden",
                        "models": [{ "id": "gpt-5.4" }, { "id": "GPT-IMAGE-2" }]
                    }
                }
            }
        });
        let routes = auto_detect_media_routes(&config);
        let route = routes
            .get("text_to_image")
            .expect("yyapi gpt-image-2 should provide text-to-image");
        assert_eq!(route["model"], "GPT-IMAGE-2");
        assert_eq!(route["protocol"], "openai-images");
        assert!(routes.get("image_to_image").is_none());
        assert!(routes.get("text_to_video").is_none());
    }

    #[test]
    fn jidu_seedream_and_seedance_auto_route_to_openai_protocols() {
        let config = json!({
            "models": {
                "providers": {
                    "jimeng": {
                        "baseUrl": "https://jimeng.example.com/v1",
                        "apiKey": "hidden",
                        "models": [{ "id": "doubao-seedream-4-0" }, { "id": "doubao-seedance-1-0-pro" }]
                    }
                }
            }
        });
        let routes = auto_detect_media_routes(&config);
        assert_eq!(routes["text_to_image"]["protocol"], "openai-images");
        assert_eq!(routes["text_to_image"]["model"], "doubao-seedream-4-0");
        assert_eq!(routes["image_to_image"]["protocol"], "openai-images");
        assert_eq!(routes["text_to_video"]["protocol"], "openai-video");
        assert_eq!(routes["text_to_video"]["model"], "doubao-seedance-1-0-pro");
        assert_eq!(routes["image_to_video"]["protocol"], "openai-video");
        assert!(routes.get("text_to_speech").is_none());
        assert!(routes.get("text_to_music").is_none());
    }

    #[test]
    fn minimax_beats_seedance_for_video_when_both_are_configured() {
        let config = json!({
            "models": {
                "providers": {
                    "minimax": {
                        "baseUrl": "https://api.minimaxi.com/v1",
                        "apiKey": "hidden",
                        "models": [{ "id": "MiniMax-M3" }]
                    },
                    "jimeng": {
                        "baseUrl": "https://jimeng.example.com/v1",
                        "apiKey": "hidden",
                        "models": [{ "id": "seedance-1-0-pro" }]
                    }
                }
            }
        });
        let routes = auto_detect_media_routes(&config);
        assert_eq!(routes["text_to_video"]["providerId"], "minimax");
        assert_eq!(routes["text_to_video"]["protocol"], "minimax-cli");
        assert_eq!(routes["image_to_video"]["providerId"], "minimax");
    }

    #[test]
    fn video_endpoints_support_relay_and_ark_shapes() {
        let (submit, poll_base, ark) = video_endpoints("https://relay.test/v1");
        assert_eq!(submit, "https://relay.test/v1/videos/generations");
        assert_eq!(poll_base, "https://relay.test/v1/videos/generations/");
        assert!(!ark);

        let (submit, poll_base, ark) = video_endpoints("https://ark.cn-beijing.volces.com/api/v3");
        assert_eq!(
            submit,
            "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
        );
        assert_eq!(
            poll_base,
            "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/"
        );
        assert!(ark);

        let (submit, _, _) = video_endpoints("https://relay.test");
        assert_eq!(submit, "https://relay.test/v1/videos/generations");
    }

    #[test]
    fn media_provider_usable_rejects_stale_or_incomplete_provider_references() {
        let openclaw = json!({
            "models": {
                "providers": {
                    "minimax": {
                        "baseUrl": "https://api.minimaxi.com/v1",
                        "apiKey": "hidden"
                    },
                    "snake_case": {
                        "base_url": "https://api.snake.example/v1",
                        "api_key": "hidden"
                    },
                    "no_key": {
                        "baseUrl": "https://api.nokey.example/v1"
                    },
                    "empty_values": {
                        "baseUrl": "",
                        "apiKey": ""
                    }
                }
            }
        });

        // A route pointing at a provider that still exists and has credentials is usable.
        assert!(media_provider_usable(
            &openclaw,
            &json!({ "providerId": "minimax" })
        ));
        assert!(media_provider_usable(
            &openclaw,
            &json!({ "providerId": "snake_case" })
        ));

        // A stale reference (provider renamed/removed) is NOT usable.
        assert!(!media_provider_usable(
            &openclaw,
            &json!({ "providerId": "minimax_cn" })
        ));
        assert!(!media_provider_usable(
            &openclaw,
            &json!({ "providerId": "yyapi" })
        ));

        // Incomplete or empty providers are NOT usable.
        assert!(!media_provider_usable(
            &openclaw,
            &json!({ "providerId": "no_key" })
        ));
        assert!(!media_provider_usable(
            &openclaw,
            &json!({ "providerId": "empty_values" })
        ));
        assert!(!media_provider_usable(
            &openclaw,
            &json!({ "providerId": "" })
        ));
    }
}
