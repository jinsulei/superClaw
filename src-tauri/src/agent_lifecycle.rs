use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Copy, Clone, Debug, Eq, PartialEq, Hash)]
pub enum ManagedAgent {
    Hermes,
    OpenClaw,
    ClaudeCode,
}

#[derive(Clone, Debug)]
pub struct ManagedAgentProcess {
    pub agent: ManagedAgent,
    pub pid: u32,
    pub cwd: String,
    pub exe: String,
    pub port: Option<u16>,
    pub started_at_ms: u64,
}

static MANAGED_AGENTS: OnceLock<Mutex<HashMap<ManagedAgent, Vec<ManagedAgentProcess>>>> =
    OnceLock::new();

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedAgentRegistry {
    version: u32,
    package_root: String,
    processes: Vec<ManagedAgentProcessRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedAgentProcessRecord {
    agent: String,
    pid: u32,
    cwd: String,
    exe: String,
    port: Option<u16>,
    started_at_ms: u64,
    package_root: String,
}

fn registry() -> &'static Mutex<HashMap<ManagedAgent, Vec<ManagedAgentProcess>>> {
    MANAGED_AGENTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn parse_managed_agent(name: &str) -> Result<ManagedAgent, String> {
    match name.to_ascii_lowercase().as_str() {
        "hermes" => Ok(ManagedAgent::Hermes),
        "openclaw" => Ok(ManagedAgent::OpenClaw),
        "claudecode" | "claude_code" | "claude-code" | "claude" => Ok(ManagedAgent::ClaudeCode),
        other => Err(format!("unsupported agent: {other}")),
    }
}

pub fn register_managed_agent(
    agent: ManagedAgent,
    pid: u32,
    cwd: String,
    exe: String,
    port: Option<u16>,
) {
    if pid == 0 {
        return;
    }
    let mut map = registry().lock().unwrap();
    let list = map.entry(agent).or_default();
    if list.iter().any(|item| item.pid == pid) {
        return;
    }
    list.push(ManagedAgentProcess {
        agent,
        pid,
        cwd,
        exe,
        port,
        started_at_ms: current_time_ms(),
    });
    persist_registry_map(&map);
}

pub fn stop_managed_agent(agent: ManagedAgent) -> Result<(), String> {
    let processes = {
        let mut map = registry().lock().unwrap();
        let processes = map.remove(&agent).unwrap_or_default();
        persist_registry_map(&map);
        processes
    };

    let mut errors = Vec::new();
    for process in processes {
        if let Err(error) = stop_pid_tree(process.pid) {
            errors.push(format!(
                "{:?} pid={} exe={} cwd={} port={:?}: {}",
                process.agent, process.pid, process.exe, process.cwd, process.port, error
            ));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

pub fn stop_all_managed_agents() -> Result<(), String> {
    let mut errors = Vec::new();
    for agent in [
        ManagedAgent::Hermes,
        ManagedAgent::OpenClaw,
        ManagedAgent::ClaudeCode,
    ] {
        if let Err(error) = stop_managed_agent(agent) {
            errors.push(format!("{agent:?}: {error}"));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

pub fn cleanup_stale_managed_agents_on_startup() {
    let records = load_registry_records();
    if records.is_empty() {
        let _ = registry();
        return;
    }

    let mut remaining = Vec::new();
    for record in records {
        if parse_managed_agent(&record.agent).is_err() {
            continue;
        }

        let Some(details) = process_details(record.pid) else {
            continue;
        };

        if !record_belongs_to_managed_root(&record, &details) {
            eprintln!(
                "[agent-lifecycle] skip stale pid {} for {}: ownership could not be verified",
                record.pid, record.agent
            );
            remaining.push(record);
            continue;
        }

        if let Err(error) = stop_pid_tree(record.pid) {
            eprintln!(
                "[agent-lifecycle] failed to stop stale {} pid {}: {}",
                record.agent, record.pid, error
            );
            remaining.push(record);
        }
    }

    persist_registry_records(&remaining);
    let _ = registry();
}

pub fn is_managed_agent_running(agent: ManagedAgent) -> bool {
    registry()
        .lock()
        .unwrap()
        .get(&agent)
        .map(|items| !items.is_empty())
        .unwrap_or(false)
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn managed_agent_name(agent: ManagedAgent) -> &'static str {
    match agent {
        ManagedAgent::Hermes => "hermes",
        ManagedAgent::OpenClaw => "openclaw",
        ManagedAgent::ClaudeCode => "claudecode",
    }
}

fn registry_file_path() -> PathBuf {
    std::env::temp_dir().join("superclaw-managed-agent-registry.json")
}

fn current_package_root() -> String {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            if parent.join("resources").exists() || parent.join("src-tauri").exists() {
                return normalize_path_lossy(parent);
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        if cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
            if let Some(parent) = cwd.parent() {
                return normalize_path_lossy(parent);
            }
        }
        return normalize_path_lossy(&cwd);
    }

    String::new()
}

fn persist_registry_map(map: &HashMap<ManagedAgent, Vec<ManagedAgentProcess>>) {
    let package_root = current_package_root();
    let processes = map
        .values()
        .flat_map(|items| items.iter())
        .map(|item| ManagedAgentProcessRecord {
            agent: managed_agent_name(item.agent).to_string(),
            pid: item.pid,
            cwd: item.cwd.clone(),
            exe: item.exe.clone(),
            port: item.port,
            started_at_ms: item.started_at_ms,
            package_root: package_root.clone(),
        })
        .collect::<Vec<_>>();

    persist_registry_records_with_root(&package_root, &processes);
}

fn persist_registry_records(records: &[ManagedAgentProcessRecord]) {
    persist_registry_records_with_root(&current_package_root(), records);
}

fn persist_registry_records_with_root(package_root: &str, records: &[ManagedAgentProcessRecord]) {
    let path = registry_file_path();
    if records.is_empty() {
        let _ = fs::remove_file(path);
        return;
    }

    let registry = ManagedAgentRegistry {
        version: 1,
        package_root: package_root.to_string(),
        processes: records.to_vec(),
    };

    match serde_json::to_string_pretty(&registry) {
        Ok(json) => {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Err(error) = fs::write(&path, json) {
                eprintln!(
                    "[agent-lifecycle] failed to write managed registry {}: {}",
                    path.display(),
                    error
                );
            }
        }
        Err(error) => {
            eprintln!("[agent-lifecycle] failed to serialize managed registry: {error}");
        }
    }
}

fn load_registry_records() -> Vec<ManagedAgentProcessRecord> {
    let path = registry_file_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(registry) = serde_json::from_str::<ManagedAgentRegistry>(&raw) else {
        eprintln!(
            "[agent-lifecycle] ignoring invalid managed registry {}",
            path.display()
        );
        return Vec::new();
    };
    registry.processes
}

#[derive(Clone, Debug)]
struct ProcessDetails {
    exe: String,
    command_line: String,
}

fn process_details(pid: u32) -> Option<ProcessDetails> {
    if pid == 0 {
        return None;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let script = format!(
            "$p=Get-CimInstance Win32_Process -Filter 'ProcessId={pid}'; if($p){{[Console]::WriteLine($p.ExecutablePath); [Console]::WriteLine($p.CommandLine)}}"
        );
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut lines = stdout.lines();
        let exe = lines.next().unwrap_or_default().trim().to_string();
        let command_line = lines.collect::<Vec<_>>().join("\n");
        if exe.is_empty() && command_line.is_empty() {
            return None;
        }
        Some(ProcessDetails { exe, command_line })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .ok()?;
        if output.status.success() {
            Some(ProcessDetails {
                exe: String::new(),
                command_line: String::new(),
            })
        } else {
            None
        }
    }
}

fn record_belongs_to_managed_root(
    record: &ManagedAgentProcessRecord,
    details: &ProcessDetails,
) -> bool {
    if record.pid == 0 || record.package_root.trim().is_empty() {
        return false;
    }

    let registered_scope_ok = path_is_under(&record.cwd, &record.package_root)
        || path_is_under(&record.exe, &record.package_root);
    if !registered_scope_ok {
        return false;
    }

    if !details.exe.trim().is_empty()
        && (path_is_under(&details.exe, &record.package_root)
            || same_pathish(&details.exe, &record.exe))
    {
        return true;
    }

    if !details.command_line.trim().is_empty()
        && normalized_text(&details.command_line).contains(&normalized_text(&record.package_root))
    {
        return true;
    }

    details.exe.trim().is_empty() && details.command_line.trim().is_empty()
}

fn path_is_under(path: &str, root: &str) -> bool {
    let path = normalized_text(&normalize_path_lossy(Path::new(path)));
    let root = normalized_text(&normalize_path_lossy(Path::new(root)));
    !path.is_empty()
        && !root.is_empty()
        && (path == root || path.starts_with(&(root.trim_end_matches('\\').to_string() + "\\")))
}

fn same_pathish(left: &str, right: &str) -> bool {
    let left = normalized_text(&normalize_path_lossy(Path::new(left)));
    let right = normalized_text(&normalize_path_lossy(Path::new(right)));
    !left.is_empty() && left == right
}

fn normalize_path_lossy(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
}

fn normalized_text(value: &str) -> String {
    value.replace('/', "\\").to_ascii_lowercase()
}

fn stop_pid_tree(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let output = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|error| error.to_string())?;

        if output.status.success() {
            return Ok(());
        }

        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
        .to_lowercase();
        if text.contains("not found")
            || text.contains("no running")
            || text.contains("not running")
            || text.contains("找不到")
            || text.contains("没有运行")
            || text.contains("不存在")
        {
            return Ok(());
        }

        Err(format!("taskkill failed for pid {pid}: {}", text.trim()))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
            .map_err(|error| error.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(format!("kill failed for pid {pid}"))
        }
    }
}
