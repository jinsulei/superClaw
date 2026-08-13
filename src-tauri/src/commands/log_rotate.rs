//! 按天日志工具：每天一个日志文件，命名 `{stem}-YYYY-MM-DD{ext}`，保留 N 天。
//!
//! 背景：OpenClaw/Hermes 日志此前全部为单文件无限追加（gateway.log 已 1.2MB 无轮转）。
//! 本模块统一提供按天切分 + 保留策略，供 service.rs（guardian/gateway）与 hermes.rs 使用。

use chrono::{Duration, Local, NaiveDate};
use regex::Regex;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// 默认保留天数
pub const DEFAULT_KEEP_DAYS: u32 = 15;

/// 当天日期字符串 `YYYY-MM-DD`
pub fn today_str() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// 按天日志路径：`{dir}/{stem}-{today}{ext}`（如 `gateway.err-2026-08-12.log`）
pub fn daily_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    dir.join(format!("{stem}-{}{ext}", today_str()))
}

/// 追加一行到按天日志（自动创建目录）。供 guardian_log 等逐行写入使用。
pub fn append_daily(dir: &Path, stem: &str, ext: &str, line: &str) {
    let _ = fs::create_dir_all(dir);
    let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(daily_path(dir, stem, ext))
    else {
        return;
    };
    let _ = f.write_all(line.as_bytes());
}

/// 以追加模式打开当天的日志文件（用于进程 stdout/stderr 重定向）。
/// 注意：跨天时仍在运行的进程会继续写旧文件，下次启动自然落到新日期文件（v1 采用此策略）。
pub fn open_daily_append(dir: &Path, stem: &str, ext: &str) -> std::io::Result<File> {
    fs::create_dir_all(dir)?;
    OpenOptions::new().create(true).append(true).open(daily_path(dir, stem, ext))
}

/// 清理 `{dir}` 下保留期外的按天日志（文件名含 `YYYY-MM-DD` 且日期早于 cutoff）。
/// 无日期命名的旧文件（如历史 `gateway.log`）不受影响。
pub fn prune_daily_logs(dir: &Path, keep_days: u32) {
    let cutoff = Local::now().date_naive() - Duration::days(keep_days as i64);
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(date) = extract_date_from_name(&name) {
            if date < cutoff {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

/// 从文件名中提取日期：匹配 `YYYY-MM-DD`（如 `gateway.err-2026-08-12.log`）
fn extract_date_from_name(name: &str) -> Option<NaiveDate> {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(\d{4}-\d{2}-\d{2})").expect("valid date regex"));
    re.captures(name)
        .and_then(|c| c.get(1))
        .and_then(|m| NaiveDate::parse_from_str(m.as_str(), "%Y-%m-%d").ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daily_path_formats_date() {
        let dir = Path::new("/tmp/logs");
        let p = daily_path(dir, "gateway.err", ".log");
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        assert!(name.starts_with("gateway.err-"), "got {name}");
        assert!(name.ends_with(".log"), "got {name}");
        // 中间应为 YYYY-MM-DD
        let date_part = name.trim_start_matches("gateway.err-").trim_end_matches(".log");
        assert_eq!(date_part.len(), 10, "got {date_part}");
        NaiveDate::parse_from_str(date_part, "%Y-%m-%d").expect("valid date");
    }

    #[test]
    fn extract_date_works() {
        assert!(extract_date_from_name("gateway.err-2026-08-12.log").is_some());
        assert!(extract_date_from_name("guardian-2026-08-01.log").is_some());
        // 旧的无日期文件
        assert!(extract_date_from_name("gateway.log").is_none());
        assert!(extract_date_from_name("guardian.log").is_none());
        // stability 快照（时间戳带 T/Z 不匹配纯日期）
        assert!(extract_date_from_name("openclaw-stability-2026-08-12T07-14-38-172Z.json").is_some());
    }

    #[test]
    fn append_and_prune_roundtrip() {
        let dir = std::env::temp_dir().join(format!("logrotate-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // 写两天前的文件 + 今天的文件
        let old = dir.join("gateway.err-2020-01-01.log");
        fs::write(&old, "old").unwrap();
        append_daily(&dir, "gateway.err", ".log", "today line\n");

        // prune 15 天：2020 年的应被删
        prune_daily_logs(&dir, DEFAULT_KEEP_DAYS);
        assert!(!old.exists(), "old daily file should be pruned");
        // 今天的仍在
        let today = daily_path(&dir, "gateway.err", ".log");
        assert!(today.exists(), "today file should remain");

        let _ = fs::remove_dir_all(&dir);
    }
}
