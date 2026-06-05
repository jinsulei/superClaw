use base64::{engine::general_purpose, Engine as _};
/// AI 助手工具命令
/// 提供终端执行、文件读写、目录列表等能力
/// 仅在用户主动开启工具后由 AI 调用
#[cfg(target_os = "windows")]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;

/// 审计日志：记录 AI 助手的敏感操作（exec / read / write）
fn audit_log(action: &str, detail: &str) {
    let log_dir = super::openclaw_dir().join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("assistant-audit.log");
    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{ts}] [{action}] {detail}\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

/// ClawPanel 数据目录（~/.openclaw/clawpanel/）
fn data_dir() -> PathBuf {
    super::openclaw_dir().join("clawpanel")
}

/// 确保数据目录及子目录存在，返回目录路径
#[tauri::command]
pub async fn assistant_ensure_data_dir() -> Result<String, String> {
    let base = data_dir();
    let subdirs = ["images", "sessions", "cache"];
    for sub in &subdirs {
        let dir = base.join(sub);
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| format!("创建目录 {} 失败: {e}", dir.display()))?;
    }
    Ok(base.to_string_lossy().to_string())
}

/// 保存图片（base64 → 文件），返回文件路径
#[tauri::command]
pub async fn assistant_save_image(id: String, data: String) -> Result<String, String> {
    let dir = data_dir().join("images");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("创建目录失败: {e}"))?;

    // data 可能包含 data:image/xxx;base64, 前缀
    let pure_b64 = if let Some(pos) = data.find(",") {
        &data[pos + 1..]
    } else {
        &data
    };

    // 从 data URI 提取扩展名
    let ext = if data.starts_with("data:image/png") {
        "png"
    } else if data.starts_with("data:image/gif") {
        "gif"
    } else if data.starts_with("data:image/webp") {
        "webp"
    } else {
        "jpg"
    };

    let filename = format!("{}.{}", id, ext);
    let filepath = dir.join(&filename);

    let bytes = general_purpose::STANDARD
        .decode(pure_b64)
        .map_err(|e| format!("base64 解码失败: {e}"))?;

    tokio::fs::write(&filepath, &bytes)
        .await
        .map_err(|e| format!("写入图片失败: {e}"))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// 加载图片（文件 → base64 data URI）
#[tauri::command]
pub async fn assistant_load_image(id: String) -> Result<String, String> {
    let dir = data_dir().join("images");

    // 尝试各种扩展名
    let mut found: Option<PathBuf> = None;
    for ext in &["jpg", "png", "gif", "webp", "jpeg"] {
        let path = dir.join(format!("{}.{}", id, ext));
        if path.exists() {
            found = Some(path);
            break;
        }
    }

    let filepath = found.ok_or_else(|| format!("图片 {} 不存在", id))?;
    let bytes = tokio::fs::read(&filepath)
        .await
        .map_err(|e| format!("读取图片失败: {e}"))?;

    let ext = filepath
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");
    let mime = match ext {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };

    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

/// 删除图片文件
#[tauri::command]
pub async fn assistant_delete_image(id: String) -> Result<(), String> {
    let dir = data_dir().join("images");
    for ext in &["jpg", "png", "gif", "webp", "jpeg"] {
        let path = dir.join(format!("{}.{}", id, ext));
        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| format!("删除图片失败: {e}"))?;
        }
    }
    Ok(())
}

// ── AI 助手工具 ──

/// 执行 shell 命令，返回 stdout + stderr
#[tauri::command]
pub async fn assistant_exec(command: String, cwd: Option<String>) -> Result<String, String> {
    let work_dir = cwd.unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });

    audit_log("EXEC", &format!("cmd={command} cwd={work_dir}"));

    let output;

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        output = tokio::process::Command::new("cmd")
            .args(["/c", &command])
            .current_dir(&work_dir)
            .env("PATH", super::hermes::hermes_enhanced_path())
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await
            .map_err(|e| format!("执行失败: {e}"))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        output = tokio::process::Command::new("sh")
            .args(["-c", &command])
            .current_dir(&work_dir)
            .env("PATH", super::hermes::hermes_enhanced_path())
            .output()
            .await
            .map_err(|e| format!("执行失败: {e}"))?;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let code = output.status.code().unwrap_or(-1);

    let mut result = String::new();
    if !stdout.is_empty() {
        result.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str("[stderr] ");
        result.push_str(&stderr);
    }
    if result.is_empty() {
        result = format!("(命令已执行，退出码: {code})");
    } else if code != 0 {
        result.push_str(&format!("\n(退出码: {code})"));
    }

    // 限制输出长度
    if result.len() > 10000 {
        result.truncate(10000);
        result.push_str("\n...(输出已截断)");
    }

    Ok(result)
}

/// 读取文件内容
#[tauri::command]
pub async fn assistant_read_file(path: String) -> Result<String, String> {
    audit_log("READ", &path);
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("读取文件失败 {path}: {e}"))?;

    if content.len() > 50000 {
        Ok(format!(
            "{}...\n(文件内容已截断，共 {} 字节)",
            &content[..50000],
            content.len()
        ))
    } else {
        Ok(content)
    }
}

/// 写入文件
#[tauri::command]
pub async fn assistant_write_file(path: String, content: String) -> Result<String, String> {
    audit_log("WRITE", &format!("{path} ({} bytes)", content.len()));
    if let Some(parent) = PathBuf::from(&path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }

    tokio::fs::write(&path, &content)
        .await
        .map_err(|e| format!("写入文件失败 {path}: {e}"))?;

    Ok(format!("已写入 {} ({} 字节)", path, content.len()))
}

/// 获取系统信息（OS、架构、主目录、主机名）
#[tauri::command]
pub async fn assistant_system_info() -> Result<String, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let home = dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".into());
    let shell = if cfg!(target_os = "windows") {
        "powershell / cmd"
    } else if cfg!(target_os = "macos") {
        "zsh (macOS default)"
    } else {
        "bash / sh"
    };

    Ok(format!(
        "OS: {}\nArch: {}\nHome: {}\nHostname: {}\nShell: {}\nPath separator: {}",
        os,
        arch,
        home,
        hostname,
        shell,
        std::path::MAIN_SEPARATOR
    ))
}

/// 列出运行中的进程（按名称过滤）
#[tauri::command]
pub async fn assistant_list_processes(filter: Option<String>) -> Result<String, String> {
    let output;
    #[cfg(target_os = "windows")]
    {
        output = tokio::process::Command::new("powershell")
            .args(["-NoProfile", "-Command",
                "Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet64 | Sort-Object ProcessName | Format-Table -AutoSize | Out-String -Width 200"])
            .creation_flags(0x08000000)
            .output()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        output = tokio::process::Command::new("ps")
            .args(["aux", "--sort=-%mem"])
            .output()
            .await;
    }

    let output = output.map_err(|e| format!("获取进程列表失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if let Some(f) = filter {
        let f_lower = f.to_lowercase();
        let lines: Vec<&str> = stdout
            .lines()
            .filter(|line| {
                let lower = line.to_lowercase();
                lower.contains(&f_lower)
                    || lower.starts_with("id")
                    || lower.starts_with("user")
                    || lower.contains("---")
            })
            .collect();
        if lines.len() <= 2 {
            return Ok(format!("未找到匹配 '{}' 的进程", f));
        }
        Ok(lines.join("\n"))
    } else {
        // 无过滤时限制输出行数
        let lines: Vec<&str> = stdout.lines().take(80).collect();
        Ok(lines.join("\n"))
    }
}

/// 检测端口是否在监听
#[tauri::command]
pub async fn assistant_check_port(port: u16) -> Result<String, String> {
    use std::time::Duration;

    let addr = format!("127.0.0.1:{}", port);
    let result = std::net::TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("地址解析失败: {e}"))?,
        Duration::from_secs(2),
    );

    match result {
        Ok(_stream) => {
            // 尝试获取占用进程信息
            let process_info = get_port_process(port).await;
            Ok(format!(
                "端口 {} 已被占用（正在监听）{}",
                port, process_info
            ))
        }
        Err(_) => Ok(format!("端口 {} 未被占用（空闲）", port)),
    }
}

async fn get_port_process(port: u16) -> String {
    let output;
    #[cfg(target_os = "windows")]
    {
        output = tokio::process::Command::new("powershell")
            .args(["-NoProfile", "-Command",
                &format!("Get-NetTCPConnection -LocalPort {} -ErrorAction SilentlyContinue | Select-Object OwningProcess | ForEach-Object {{ (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName }}", port)])
            .creation_flags(0x08000000)
            .output()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        output = tokio::process::Command::new("lsof")
            .args(["-i", &format!(":{}", port), "-t"])
            .output()
            .await;
    }

    match output {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() {
                String::new()
            } else {
                format!("\n占用进程: {}", s)
            }
        }
        Err(_) => String::new(),
    }
}

/// 联网搜索（DuckDuckGo HTML）
#[tauri::command]
pub async fn assistant_web_search(
    query: String,
    max_results: Option<usize>,
) -> Result<String, String> {
    let max = max_results.unwrap_or(5);
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(&query)
    );

    let client = super::build_http_client(
        std::time::Duration::from_secs(10),
        Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    )
    .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let html = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {e}"))?
        .text()
        .await
        .map_err(|e| format!("读取搜索结果失败: {e}"))?;

    // 解析搜索结果
    let mut results = Vec::new();
    let re_result = regex::Regex::new(
        r#"class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)</a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)</a>"#
    ).unwrap();

    let re_strip_tags = regex::Regex::new(r"<[^>]+>").unwrap();

    for cap in re_result.captures_iter(&html) {
        if results.len() >= max {
            break;
        }
        let raw_url = &cap[1];
        let title = re_strip_tags.replace_all(&cap[2], "").trim().to_string();
        let snippet = re_strip_tags.replace_all(&cap[3], "").trim().to_string();

        // 解码 DuckDuckGo 的重定向 URL
        let final_url = if let Some(pos) = raw_url.find("uddg=") {
            let encoded = &raw_url[pos + 5..];
            let end = encoded.find('&').unwrap_or(encoded.len());
            urlencoding::decode(&encoded[..end])
                .unwrap_or_else(|_| encoded[..end].into())
                .to_string()
        } else {
            raw_url.to_string()
        };

        if !title.is_empty() && !final_url.is_empty() {
            results.push((title, final_url, snippet));
        }
    }

    if results.is_empty() {
        return Ok(format!("搜索「{}」未找到相关结果。", query));
    }

    let mut output = format!("搜索「{}」找到 {} 条结果：\n\n", query, results.len());
    for (i, (title, url, snippet)) in results.iter().enumerate() {
        output.push_str(&format!(
            "{}. **{}**\n   {}\n   {}\n\n",
            i + 1,
            title,
            url,
            snippet
        ));
    }
    Ok(output)
}

fn truncate_chars(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let mut out: String = text.chars().take(limit).collect();
    out.push_str("...");
    out
}

fn html_entity_decode(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

fn compact_text(text: &str, limit: usize) -> String {
    let decoded = html_entity_decode(text)
        .replace("\\n", " ")
        .replace("\\r", " ")
        .replace("\\t", " ");
    let cleaned = regex::Regex::new(r"\s+")
        .ok()
        .map(|re| re.replace_all(&decoded, " ").trim().to_string())
        .unwrap_or_else(|| decoded.trim().to_string());
    truncate_chars(&cleaned, limit)
}

fn is_short_video_share_url(url: &str) -> bool {
    let parsed = match reqwest::Url::parse(url) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let host = parsed.host_str().unwrap_or("").to_lowercase();
    [
        "douyin.com",
        "iesdouyin.com",
        "tiktok.com",
        "kuaishou.com",
        "xiaohongshu.com",
        "xhslink.com",
        "bilibili.com",
        "youtube.com",
        "youtu.be",
    ]
    .iter()
    .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

fn short_video_platform_label(url: &str) -> &'static str {
    let host = reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_lowercase()))
        .unwrap_or_default();
    if host.contains("douyin") || host.contains("iesdouyin") {
        "抖音"
    } else if host.contains("kuaishou") {
        "快手"
    } else if host.contains("xiaohongshu") || host.contains("xhslink") {
        "小红书"
    } else if host.contains("tiktok") {
        "TikTok"
    } else if host.contains("bilibili") {
        "B 站"
    } else if host.contains("youtube") || host == "youtu.be" {
        "YouTube"
    } else {
        "短视频平台"
    }
}

fn is_fetch_failure_text(text: &str) -> bool {
    let lower = text.to_lowercase();
    [
        "抓取失败",
        "抓取超时",
        "读取失败",
        "无法读取",
        "无法抓取",
        "timeout",
        "timed out",
        "fetch failed",
        "network error",
        "econnreset",
        "socket hang up",
        "und_err",
        "connection reset",
        "连接被断开",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn extract_meta_content(html: &str, key: &str) -> String {
    let escaped = regex::escape(key);
    let patterns = [
        format!(
            r#"<meta\b[^>]+(?:property|name)=["']{}["'][^>]+content=["']([^"']*)["'][^>]*>"#,
            escaped
        ),
        format!(
            r#"<meta\b[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']{}["'][^>]*>"#,
            escaped
        ),
    ];
    for pattern in patterns {
        if let Ok(re) = regex::Regex::new(&pattern) {
            if let Some(cap) = re.captures(html) {
                if let Some(value) = cap.get(1) {
                    return compact_text(value.as_str(), 2000);
                }
            }
        }
    }
    String::new()
}

fn extract_quoted_json_field(html: &str, key: &str) -> String {
    let escaped = regex::escape(key);
    let pattern = format!(r#"["']{}["']\s*:\s*["']((?:\\.|[^"'\\])*)["']"#, escaped);
    if let Ok(re) = regex::Regex::new(&pattern) {
        if let Some(cap) = re.captures(html) {
            if let Some(value) = cap.get(1) {
                return compact_text(value.as_str(), 2000);
            }
        }
    }
    String::new()
}

struct ReadablePageMetadata {
    title: String,
    description: String,
    keywords: String,
    image: String,
    text_sample: String,
}

fn extract_readable_page_metadata(html: &str) -> ReadablePageMetadata {
    let title_tag = regex::Regex::new(r"(?is)<title[^>]*>(.*?)</title>")
        .ok()
        .and_then(|re| re.captures(html))
        .and_then(|cap| cap.get(1).map(|m| compact_text(m.as_str(), 500)))
        .unwrap_or_default();
    let title = {
        let value = extract_meta_content(html, "og:title");
        if !value.is_empty() {
            value
        } else {
            let value = extract_meta_content(html, "twitter:title");
            if !value.is_empty() {
                value
            } else {
                title_tag
            }
        }
    };
    let description = {
        let candidates = [
            extract_meta_content(html, "og:description"),
            extract_meta_content(html, "description"),
            extract_meta_content(html, "twitter:description"),
            extract_quoted_json_field(html, "desc"),
            extract_quoted_json_field(html, "description"),
        ];
        candidates
            .into_iter()
            .find(|v| !v.is_empty())
            .unwrap_or_default()
    };
    let text_without_scripts =
        regex::Regex::new(r"(?is)<script[\s\S]*?</script>|<style[\s\S]*?</style>")
            .ok()
            .map(|re| re.replace_all(html, " ").to_string())
            .unwrap_or_else(|| html.to_string());
    let plain_text = regex::Regex::new(r"(?is)<[^>]+>")
        .ok()
        .map(|re| re.replace_all(&text_without_scripts, " ").to_string())
        .unwrap_or(text_without_scripts);
    ReadablePageMetadata {
        title,
        description,
        keywords: extract_meta_content(html, "keywords"),
        image: {
            let value = extract_meta_content(html, "og:image");
            if !value.is_empty() {
                value
            } else {
                extract_meta_content(html, "twitter:image")
            }
        },
        text_sample: compact_text(&plain_text, 1200),
    }
}

async fn fetch_readable_url_content(url: &str) -> Result<String, String> {
    let is_video = is_short_video_share_url(url);
    let reader_error: String;

    let jina_url = format!("https://r.jina.ai/{}", url);
    match super::build_http_client(std::time::Duration::from_secs(15), Some("Mozilla/5.0")) {
        Ok(client) => {
            match client
                .get(&jina_url)
                .header("Accept", "text/plain")
                .send()
                .await
            {
                Ok(resp) => match resp.text().await {
                    Ok(content) => {
                        let content = if content.len() > 100_000 {
                            format!(
                                "{}\n\n[内容已截断，超过 100KB 限制]",
                                truncate_chars(&content, 100_000)
                            )
                        } else {
                            content
                        };
                        if !content.trim().is_empty() && !is_fetch_failure_text(&content) {
                            return Ok(content);
                        }
                        reader_error = if content.trim().is_empty() {
                            "Reader 返回空内容".into()
                        } else {
                            content
                        };
                    }
                    Err(e) => reader_error = format!("读取内容失败: {e}"),
                },
                Err(e) => reader_error = format!("{e}"),
            }
        }
        Err(e) => reader_error = format!("创建 HTTP 客户端失败: {e}"),
    }

    if !is_video {
        return Ok(format!("抓取失败: {reader_error}"));
    }

    let client = super::build_http_client(
        std::time::Duration::from_secs(12),
        Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36"),
    )
    .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    let direct = client
        .get(url)
        .header(
            "Accept",
            "text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.7")
        .send()
        .await
        .map_err(|e| format!("抓取失败: {e}"))?;
    let final_url = direct.url().to_string();
    let html = direct
        .text()
        .await
        .map_err(|e| format!("读取内容失败: {e}"))?;
    let meta = extract_readable_page_metadata(&html);
    let has_useful_meta = [
        &meta.title,
        &meta.description,
        &meta.keywords,
        &meta.text_sample,
    ]
    .iter()
    .any(|v| !v.trim().is_empty());
    if !has_useful_meta {
        return Ok(format!(
            "抓取失败: {}",
            if reader_error.is_empty() {
                "未读取到页面内容"
            } else {
                &reader_error
            }
        ));
    }

    let mut lines = vec![
        "[短视频页面可读取信息]".to_string(),
        format!("平台: {}", short_video_platform_label(url)),
        format!("原始链接: {url}"),
        format!("最终链接: {final_url}"),
        "读取方式: 页面元信息兜底".to_string(),
    ];
    if !meta.title.is_empty() {
        lines.push(format!("标题: {}", meta.title));
    }
    if !meta.description.is_empty() {
        lines.push(format!("描述: {}", meta.description));
    }
    if !meta.keywords.is_empty() {
        lines.push(format!("关键词: {}", meta.keywords));
    }
    if !meta.image.is_empty() {
        lines.push(format!("封面图: {}", meta.image));
    }
    if !meta.text_sample.is_empty() {
        lines.push(String::new());
        lines.push("[页面文本摘录]".to_string());
        lines.push(meta.text_sample);
        lines.push("[/页面文本摘录]".to_string());
    }
    lines.extend([
        String::new(),
        "[读取限制]".to_string(),
        "当前只读取到了短视频分享页的公开标题、描述、封面或页面文本片段；如果缺少口播、字幕和完整画面，请先基于已读信息做文字拆解。若具备用户授权的浏览器/页面读取工具，可继续从用户已打开或授权打开的页面读取公开可见信息，但不要在聊天中展示或播放平台页面。".to_string(),
        "[/读取限制]".to_string(),
        "[/短视频页面可读取信息]".to_string(),
    ]);
    Ok(lines.join("\n"))
}

/// 抓取 URL 内容（通过 Jina Reader API）
#[tauri::command]
pub async fn assistant_fetch_url(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".into());
    }
    fetch_readable_url_content(&url).await
}

/// 列出目录内容
#[tauri::command]
pub async fn assistant_list_dir(path: String) -> Result<String, String> {
    let mut entries = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| format!("读取目录失败 {path}: {e}"))?;

    let mut items = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| format!("{e}"))? {
        let meta = entry.metadata().await.ok();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);

        if is_dir {
            items.push(format!("[DIR]  {}/", name));
        } else {
            items.push(format!("[FILE] {} ({} bytes)", name, size));
        }

        if items.len() >= 200 {
            items.push("...(已截断)".into());
            break;
        }
    }

    items.sort();
    Ok(items.join("\n"))
}

#[tauri::command]
pub async fn assistant_open_path(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("路径不能为空".into());
    }
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("路径不存在: {path}"));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&target)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("打开路径失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("打开路径失败: {e}"))?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("打开路径失败: {e}"))?;
    }

    Ok(format!("已打开 {path}"))
}
