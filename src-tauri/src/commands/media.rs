use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;

const ROUTE_KINDS: &[&str] = &[
    "text_to_image",
    "image_to_image",
    "text_to_video",
    "image_to_video",
];
const ROUTE_PROTOCOLS: &[&str] = &["openai-images", "openai-video", "custom"];
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

        assert_eq!(normalized["routes"]["text_to_image"]["providerId"], "image_provider");
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
