//! SkillHub/ClawHub SDK used by the Tauri command layer.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const COS_BASE: &str = "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com";
const LEGACY_API_BASE: &str = "https://lightmake.site/api/v1";
const CLAWHUB_API_BASE: &str = "https://clawhub.ai/api/v1";
const INDEX_TTL: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillHubItem {
    pub slug: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, alias = "displayName")]
    pub display_name: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Option<Value>,
    #[serde(default)]
    pub categories: Option<Vec<String>>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub downloads: Option<u64>,
    #[serde(default)]
    pub stars: Option<u64>,
    #[serde(default)]
    pub owner_name: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default, alias = "latestVersion")]
    pub latest_version: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct LegacySearchResponse {
    #[serde(default)]
    results: Vec<SkillHubItem>,
}

#[derive(Debug, Deserialize)]
struct ClawHubSearchResponse {
    #[serde(default)]
    items: Vec<SkillHubItem>,
}

#[derive(Debug, Deserialize)]
struct IndexResponse {
    #[serde(default)]
    skills: Vec<SkillHubItem>,
}

#[derive(Debug, Deserialize)]
struct InstallArchive {
    #[serde(default, rename = "downloadUrl")]
    download_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct InstallResponse {
    #[serde(default)]
    ok: Option<bool>,
    #[serde(default, rename = "installKind")]
    install_kind: Option<String>,
    #[serde(default)]
    archive: Option<InstallArchive>,
}

static INDEX_CACHE: Mutex<Option<(Instant, Vec<SkillHubItem>)>> = Mutex::new(None);

fn client() -> Result<reqwest::Client, String> {
    super::build_http_client(Duration::from_secs(30), Some("ClawPanel-SkillHub/1.0"))
}

pub async fn search(query: &str, limit: u32) -> Result<Vec<SkillHubItem>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let max = limit.clamp(1, 50);
    let mut items = Vec::new();
    let mut errors = Vec::new();

    match search_legacy(q, max).await {
        Ok(mut found) => items.append(&mut found),
        Err(err) => errors.push(err),
    }
    match search_clawhub(q, max).await {
        Ok(mut found) => items.append(&mut found),
        Err(err) => errors.push(err),
    }

    let merged = dedupe_items(items);
    if merged.is_empty() && !errors.is_empty() {
        return Err(format!("SkillHub search failed: {}", errors.join("; ")));
    }

    Ok(merged.into_iter().take(max as usize).collect())
}

pub async fn fetch_index() -> Result<Vec<SkillHubItem>, String> {
    if let Ok(guard) = INDEX_CACHE.lock() {
        if let Some((ts, ref items)) = *guard {
            if ts.elapsed() < INDEX_TTL {
                return Ok(items.clone());
            }
        }
    }

    let url = format!("{}/skills.json", COS_BASE);
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("SkillHub index request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("SkillHub index failed: HTTP {}", resp.status()));
    }
    let data: IndexResponse = resp
        .json()
        .await
        .map_err(|e| format!("SkillHub index parse failed: {e}"))?;

    let items = data.skills;
    if let Ok(mut guard) = INDEX_CACHE.lock() {
        *guard = Some((Instant::now(), items.clone()));
    }
    Ok(items)
}

pub async fn download_zip(slug: &str) -> Result<Vec<u8>, String> {
    validate_slug(slug)?;
    let c = client()?;
    let mut errors = Vec::new();

    match download_from_clawhub(&c, slug).await {
        Ok(bytes) => return Ok(bytes),
        Err(err) => errors.push(err),
    }

    let cos_url = format!("{}/skills/{}.zip", COS_BASE, urlencoding::encode(slug));
    match download_from_url(&c, &cos_url, "legacy-cos").await {
        Ok(bytes) => return Ok(bytes),
        Err(err) => errors.push(err),
    }

    let api_url = format!(
        "{}/download?slug={}",
        LEGACY_API_BASE,
        urlencoding::encode(slug)
    );
    match download_from_url(&c, &api_url, "legacy-api").await {
        Ok(bytes) => return Ok(bytes),
        Err(err) => errors.push(err),
    }

    Err(format!("SkillHub download failed: {}", errors.join("; ")))
}

pub async fn install(slug: &str, skills_dir: &Path) -> Result<PathBuf, String> {
    validate_slug(slug)?;
    let target_dir = skills_dir.join(slug);
    let zip_bytes = download_zip(slug).await?;
    extract_zip(&zip_bytes, &target_dir)?;
    Ok(target_dir)
}

async fn search_legacy(query: &str, limit: u32) -> Result<Vec<SkillHubItem>, String> {
    let url = format!(
        "{}/search?q={}&limit={}",
        LEGACY_API_BASE,
        urlencoding::encode(query),
        limit
    );
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("legacy SkillHub search request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "legacy SkillHub search failed: HTTP {}",
            resp.status()
        ));
    }
    let data: LegacySearchResponse = resp
        .json()
        .await
        .map_err(|e| format!("legacy SkillHub search parse failed: {e}"))?;
    let mut items = data.results;
    for item in items.iter_mut() {
        if item.source.is_none() {
            item.source = Some("legacy-skillhub".to_string());
        }
    }
    Ok(items)
}

async fn search_clawhub(query: &str, limit: u32) -> Result<Vec<SkillHubItem>, String> {
    let url = format!(
        "{}/skills?search={}&limit={}",
        CLAWHUB_API_BASE,
        urlencoding::encode(query),
        limit
    );
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("ClawHub search request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ClawHub search failed: HTTP {}", resp.status()));
    }
    let data: ClawHubSearchResponse = resp
        .json()
        .await
        .map_err(|e| format!("ClawHub search parse failed: {e}"))?;
    Ok(data.items.into_iter().map(normalize_clawhub_item).collect())
}

fn normalize_clawhub_item(mut item: SkillHubItem) -> SkillHubItem {
    if item.name.is_none() {
        item.name = item.display_name.clone();
    }
    if item.display_name.is_none() {
        item.display_name = item.name.clone().or_else(|| Some(item.slug.clone()));
    }
    if item.version.is_none() {
        if let Some(version) = item
            .latest_version
            .as_ref()
            .and_then(|v| v.get("version"))
            .and_then(|v| v.as_str())
        {
            item.version = Some(version.to_string());
        } else if let Some(version) = item
            .tags
            .as_ref()
            .and_then(|v| v.get("latest"))
            .and_then(|v| v.as_str())
        {
            item.version = Some(version.to_string());
        }
    }
    item.source = Some("clawhub".to_string());
    item
}

fn dedupe_items(items: Vec<SkillHubItem>) -> Vec<SkillHubItem> {
    let mut seen = HashSet::new();
    let mut merged = Vec::new();
    for item in items {
        if item.slug.is_empty() {
            continue;
        }
        if seen.insert(item.slug.clone()) {
            merged.push(item);
        }
    }
    merged
}

async fn download_from_clawhub(c: &reqwest::Client, slug: &str) -> Result<Vec<u8>, String> {
    let install_url = format!(
        "{}/skills/{}/install",
        CLAWHUB_API_BASE,
        urlencoding::encode(slug)
    );
    let resp = c
        .get(&install_url)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("ClawHub install request failed: {e}"))?;
    let status = resp.status();
    let body = resp
        .bytes()
        .await
        .map_err(|e| format!("ClawHub install read failed: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "ClawHub install HTTP {}: {}",
            status,
            preview_bytes(&body)
        ));
    }

    let data: InstallResponse =
        serde_json::from_slice(&body).map_err(|e| format!("ClawHub install parse failed: {e}"))?;
    if data.ok == Some(false) {
        return Err("ClawHub install returned ok=false".to_string());
    }
    if data.install_kind.as_deref() != Some("archive") {
        return Err("ClawHub install did not return archive kind".to_string());
    }
    let download_url = data
        .archive
        .and_then(|archive| archive.download_url)
        .ok_or_else(|| "ClawHub install did not return downloadUrl".to_string())?;

    download_from_url(c, &download_url, "clawhub").await
}

async fn download_from_url(
    c: &reqwest::Client,
    url: &str,
    source: &str,
) -> Result<Vec<u8>, String> {
    let resp = c
        .get(url)
        .header("accept", "application/zip,application/octet-stream,*/*")
        .send()
        .await
        .map_err(|e| format!("{source} request failed: {e}"))?;
    let status = resp.status();
    let body = resp
        .bytes()
        .await
        .map_err(|e| format!("{source} read failed: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "{source} HTTP {}: {}",
            status,
            preview_bytes(&body)
        ));
    }
    if !is_zip(&body) {
        return Err(format!(
            "{source} response is not a zip: {}",
            preview_bytes(&body)
        ));
    }
    Ok(body.to_vec())
}

fn validate_slug(slug: &str) -> Result<(), String> {
    if slug.is_empty() {
        return Err("Skill slug is required".into());
    }
    if slug.contains("..")
        || slug.contains('/')
        || slug.contains('\\')
        || !slug
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(format!("Invalid Skill slug: {slug}"));
    }
    Ok(())
}

fn is_zip(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && bytes[0] == b'P' && bytes[1] == b'K'
}

fn preview_bytes(bytes: &[u8]) -> String {
    String::from_utf8_lossy(&bytes[..bytes.len().min(120)])
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_zip(zip_bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    use std::io::Cursor;
    use zip::ZipArchive;

    if target_dir.exists() {
        std::fs::remove_dir_all(target_dir)
            .map_err(|e| format!("Failed to clean target directory: {e}"))?;
    }
    std::fs::create_dir_all(target_dir)
        .map_err(|e| format!("Failed to create target directory: {e}"))?;

    let reader = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(reader).map_err(|e| format!("Failed to open zip: {e}"))?;

    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index_raw(i).ok().map(|f| f.name().to_string()))
        .collect();
    let strip_prefix = detect_single_root_dir(&names);

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {e}"))?;

        let raw_name = file.name().replace('\\', "/");
        if raw_name.contains("..") || raw_name.starts_with('/') || raw_name.contains(':') {
            continue;
        }

        let relative = if let Some(ref prefix) = strip_prefix {
            match raw_name.strip_prefix(prefix.as_str()) {
                Some(rest) if !rest.is_empty() => rest.to_string(),
                _ => continue,
            }
        } else {
            raw_name
        };

        if relative.is_empty() {
            continue;
        }

        let out_path = target_dir.join(&relative);
        if file.is_dir() {
            std::fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create file {relative}: {e}"))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file {relative}: {e}"))?;
        }
    }
    Ok(())
}

fn detect_single_root_dir(names: &[String]) -> Option<String> {
    let mut root: Option<String> = None;
    for name in names {
        let first_segment = name.split('/').next().unwrap_or("");
        if first_segment.is_empty() {
            continue;
        }
        match &root {
            None => root = Some(format!("{}/", first_segment)),
            Some(existing) => {
                if !name.starts_with(existing.as_str()) {
                    return None;
                }
            }
        }
    }
    root
}
