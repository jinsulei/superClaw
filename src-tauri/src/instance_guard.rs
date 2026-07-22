//! Local desktop-instance coordination for portable Windows builds.
//!
//! It coordinates only the SuperClaw UI process. Gateway, Hermes, Claude and
//! collaboration workers keep their existing ownership checks.

use serde::{Deserialize, Serialize};

const RESTART_WAIT_MS: u32 = 20_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RunningInstance {
    pid: u32,
}

fn record_path() -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("SuperClaw")
        .join("running-instance.json")
}

fn read_instance() -> Option<RunningInstance> {
    serde_json::from_str(&std::fs::read_to_string(record_path()).ok()?).ok()
}

fn write_instance() {
    let path = record_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let record = RunningInstance {
        pid: std::process::id(),
    };
    let _ = std::fs::write(path, serde_json::to_vec(&record).unwrap_or_default());
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    const ERROR_ALREADY_EXISTS: u32 = 183;
    const IDYES: i32 = 6;
    const IDNO: i32 = 7;
    const MB_YESNOCANCEL: u32 = 0x0000_0003;
    const MB_ICONQUESTION: u32 = 0x0000_0020;
    const SW_RESTORE: i32 = 9;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const SYNCHRONIZE: u32 = 0x0010_0000;
    const WAIT_OBJECT_0: u32 = 0;
    const WAIT_TIMEOUT: u32 = 258;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(
            attributes: *mut std::ffi::c_void,
            initial_owner: i32,
            name: *const u16,
        ) -> *mut std::ffi::c_void;
        fn GetLastError() -> u32;
        fn CreateEventW(
            attributes: *mut std::ffi::c_void,
            manual_reset: i32,
            initial_state: i32,
            name: *const u16,
        ) -> *mut std::ffi::c_void;
        fn SetEvent(event: *mut std::ffi::c_void) -> i32;
        fn ResetEvent(event: *mut std::ffi::c_void) -> i32;
        fn WaitForSingleObject(handle: *mut std::ffi::c_void, milliseconds: u32) -> u32;
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            typ: u32,
        ) -> i32;
        fn EnumWindows(
            callback: unsafe extern "system" fn(*mut std::ffi::c_void, isize) -> i32,
            data: isize,
        ) -> i32;
        fn GetWindowThreadProcessId(hwnd: *mut std::ffi::c_void, pid: *mut u32) -> u32;
        fn ShowWindowAsync(hwnd: *mut std::ffi::c_void, command: i32) -> i32;
        fn SetForegroundWindow(hwnd: *mut std::ffi::c_void) -> i32;
    }

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    fn process_is_alive(pid: u32) -> bool {
        let handle =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid) };
        if handle.is_null() {
            return false;
        }
        let active = unsafe { WaitForSingleObject(handle, 0) } == WAIT_TIMEOUT;
        unsafe { CloseHandle(handle) };
        active
    }

    fn wait_for_process_exit(pid: u32, timeout_ms: u32) -> bool {
        let handle = unsafe { OpenProcess(SYNCHRONIZE, 0, pid) };
        if handle.is_null() {
            return true;
        }
        let exited = unsafe { WaitForSingleObject(handle, timeout_ms) } == WAIT_OBJECT_0;
        unsafe { CloseHandle(handle) };
        exited
    }

    unsafe extern "system" fn focus_matching_window(
        hwnd: *mut std::ffi::c_void,
        data: isize,
    ) -> i32 {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == data as u32 {
            ShowWindowAsync(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
            return 0;
        }
        1
    }

    fn focus_running_instance(pid: u32) {
        unsafe { EnumWindows(focus_matching_window, pid as isize) };
    }

    fn restart_event() -> *mut std::ffi::c_void {
        let name = wide("Local\\SuperClawDesktopRestart");
        unsafe { CreateEventW(std::ptr::null_mut(), 1, 0, name.as_ptr()) }
    }

    pub fn prepare_instance() -> bool {
        let mutex_name = wide("Local\\SuperClawDesktopInstance");
        let mutex = unsafe { CreateMutexW(std::ptr::null_mut(), 0, mutex_name.as_ptr()) };
        if mutex.is_null() || unsafe { GetLastError() } != ERROR_ALREADY_EXISTS {
            // Raw Windows handles are not RAII values; retaining this handle
            // keeps the named mutex alive until the process exits.
            return true;
        }

        let Some(existing) = read_instance().filter(|record| process_is_alive(record.pid)) else {
            return true;
        };
        let mut message = wide("检测到 SuperClaw 正在运行。\n\n");
        message.pop();
        message.extend(wide(
            "是：打开当前应用\n否：重启并打开当前应用\n取消：保持当前状态",
        ));
        let caption = wide("SuperClaw");
        let choice = unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                message.as_ptr(),
                caption.as_ptr(),
                MB_YESNOCANCEL | MB_ICONQUESTION,
            )
        };
        if choice == IDYES {
            focus_running_instance(existing.pid);
            return false;
        }
        if choice == IDNO {
            let event = restart_event();
            if !event.is_null() {
                unsafe { SetEvent(event) };
            }
            if wait_for_process_exit(existing.pid, RESTART_WAIT_MS) {
                return true;
            }
            let title = wide("SuperClaw");
            let message = wide("当前运行中的 SuperClaw 未能在限定时间内正常退出。为避免服务冲突，未启动第二个实例。");
            unsafe {
                MessageBoxW(
                    std::ptr::null_mut(),
                    message.as_ptr(),
                    title.as_ptr(),
                    0x0000_0010,
                )
            };
            return false;
        }
        false
    }

    pub fn register_primary_instance(app: tauri::AppHandle) {
        write_instance();
        let event = restart_event();
        if event.is_null() {
            return;
        }
        let event_address = event as usize;
        std::thread::spawn(move || {
            eprintln!("[instance] restart listener armed");
            let event = event_address as *mut std::ffi::c_void;
            if unsafe { WaitForSingleObject(event, u32::MAX) } == WAIT_OBJECT_0 {
                eprintln!("[instance] restart requested by a newer SuperClaw launch");
                unsafe { ResetEvent(event) };
                tauri::async_runtime::spawn(async move {
                    crate::shutdown_current_instance(app.clone()).await;
                    eprintln!("[instance] owned services stopped; exiting replaced instance");
                    app.exit(0);
                });
            }
            unsafe { CloseHandle(event) };
        });
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn prepare_instance() -> bool {
        true
    }
    pub fn register_primary_instance(_app: tauri::AppHandle) {}
}

pub fn prepare_instance() -> bool {
    platform::prepare_instance()
}

pub fn register_primary_instance(app: tauri::AppHandle) {
    platform::register_primary_instance(app)
}
