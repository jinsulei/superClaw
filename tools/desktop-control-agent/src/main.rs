use serde::{Deserialize, Serialize};
use std::io::{self, Read};
use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT,
    VK_BACK, VK_ESCAPE, VK_RETURN, VK_SPACE, VK_TAB,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    GetWindowRect, IsWindowVisible, SetCursorPos, SetForegroundWindow, ShowWindow, SW_RESTORE,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct Request {
    action: String,
    query: Option<String>,
    text: Option<String>,
    key: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    limit: Option<usize>,
}

#[derive(Debug, Serialize, Clone)]
struct WindowInfo {
    id: isize,
    title: String,
    class_name: String,
    foreground: bool,
}

#[derive(Debug, Serialize)]
struct Response<T: Serialize> {
    ok: bool,
    message: String,
    data: T,
}

fn utf16_to_string(buf: &[u16]) -> String {
    let end = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn window_text(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; (len as usize) + 1];
        let copied = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if copied <= 0 {
            return String::new();
        }
        utf16_to_string(&buf)
    }
}

fn class_name(hwnd: HWND) -> String {
    unsafe {
        let mut buf = vec![0u16; 256];
        let copied = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if copied <= 0 {
            return String::new();
        }
        utf16_to_string(&buf)
    }
}

unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> i32 {
    let windows = &mut *(lparam as *mut Vec<WindowInfo>);
    if IsWindowVisible(hwnd) == 0 {
        return 1;
    }
    let title = window_text(hwnd);
    if title.trim().is_empty() {
        return 1;
    }
    windows.push(WindowInfo {
        id: hwnd as isize,
        title,
        class_name: class_name(hwnd),
        foreground: hwnd == GetForegroundWindow(),
    });
    1
}

fn list_windows() -> Vec<WindowInfo> {
    let mut windows = Vec::<WindowInfo>::new();
    unsafe {
        EnumWindows(Some(enum_windows_proc), &mut windows as *mut _ as LPARAM);
    }
    windows
}

fn find_window(query: &str) -> Option<WindowInfo> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return None;
    }
    list_windows().into_iter().find(|w| {
        w.title.to_lowercase().contains(&q) || w.class_name.to_lowercase().contains(&q)
    })
}

fn activate(hwnd: HWND) -> bool {
    unsafe {
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd) != 0
    }
}

fn key_vk(name: &str) -> Option<u16> {
    match name.trim().to_lowercase().as_str() {
        "enter" | "return" => Some(VK_RETURN),
        "tab" => Some(VK_TAB),
        "escape" | "esc" => Some(VK_ESCAPE),
        "backspace" | "back" => Some(VK_BACK),
        "space" => Some(VK_SPACE),
        _ => None,
    }
}

fn send_virtual_key(vk: u16) {
    unsafe {
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: 0,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let mut up = down;
        up.Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;
        let mut inputs = [down, up];
        SendInput(inputs.len() as u32, inputs.as_mut_ptr(), std::mem::size_of::<INPUT>() as i32);
    }
}

fn type_unicode(text: &str) {
    unsafe {
        for ch in text.encode_utf16() {
            let down = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: 0,
                        wScan: ch,
                        dwFlags: KEYEVENTF_UNICODE,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            let mut up = down;
            up.Anonymous.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            let mut inputs = [down, up];
            SendInput(inputs.len() as u32, inputs.as_mut_ptr(), std::mem::size_of::<INPUT>() as i32);
        }
    }
}

fn click_window(hwnd: HWND, x: i32, y: i32) -> bool {
    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return false;
        }
        let sx = rect.left + x;
        let sy = rect.top + y;
        SetCursorPos(sx, sy);
        let down = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_LEFTDOWN,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let mut up = down;
        up.Anonymous.mi.dwFlags = MOUSEEVENTF_LEFTUP;
        let mut inputs = [down, up];
        SendInput(inputs.len() as u32, inputs.as_mut_ptr(), std::mem::size_of::<INPUT>() as i32);
        true
    }
}

fn print_json<T: Serialize>(value: &T) {
    println!("{}", serde_json::to_string(value).unwrap_or_else(|_| "{\"ok\":false}".to_string()));
}

fn main() {
    let mut raw = String::new();
    if io::stdin().read_to_string(&mut raw).is_err() || raw.trim().is_empty() {
        print_json(&Response {
            ok: false,
            message: "missing json request".to_string(),
            data: serde_json::json!({}),
        });
        return;
    }
    let req: Request = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            print_json(&Response {
                ok: false,
                message: format!("invalid json request: {e}"),
                data: serde_json::json!({}),
            });
            return;
        }
    };

    match req.action.as_str() {
        "status" => print_json(&Response {
            ok: true,
            message: "desktop-control-agent ready".to_string(),
            data: serde_json::json!({ "version": env!("CARGO_PKG_VERSION") }),
        }),
        "list_windows" => {
            let mut windows = list_windows();
            if let Some(q) = req.query.as_deref() {
                let q = q.to_lowercase();
                windows.retain(|w| w.title.to_lowercase().contains(&q) || w.class_name.to_lowercase().contains(&q));
            }
            windows.truncate(req.limit.unwrap_or(40).min(100));
            print_json(&Response { ok: true, message: "windows listed".to_string(), data: windows });
        }
        "activate" => {
            let query = req.query.unwrap_or_default();
            if let Some(w) = find_window(&query) {
                let ok = activate(w.id as HWND);
                print_json(&Response { ok, message: if ok { "window activated" } else { "activation failed" }.to_string(), data: w });
            } else {
                print_json(&Response { ok: false, message: "window not found".to_string(), data: serde_json::json!({ "query": query }) });
            }
        }
        "click" => {
            let query = req.query.unwrap_or_default();
            if let Some(w) = find_window(&query) {
                activate(w.id as HWND);
                let ok = click_window(w.id as HWND, req.x.unwrap_or(20), req.y.unwrap_or(20));
                print_json(&Response { ok, message: if ok { "clicked" } else { "click failed" }.to_string(), data: w });
            } else {
                print_json(&Response { ok: false, message: "window not found".to_string(), data: serde_json::json!({ "query": query }) });
            }
        }
        "type_text" => {
            let query = req.query.unwrap_or_default();
            if let Some(w) = find_window(&query) {
                activate(w.id as HWND);
                type_unicode(req.text.as_deref().unwrap_or_default());
                print_json(&Response { ok: true, message: "text typed".to_string(), data: w });
            } else {
                print_json(&Response { ok: false, message: "window not found".to_string(), data: serde_json::json!({ "query": query }) });
            }
        }
        "press_key" => {
            let query = req.query.unwrap_or_default();
            if let Some(w) = find_window(&query) {
                activate(w.id as HWND);
                if let Some(vk) = key_vk(req.key.as_deref().unwrap_or("enter")) {
                    send_virtual_key(vk);
                    print_json(&Response { ok: true, message: "key pressed".to_string(), data: w });
                } else {
                    print_json(&Response { ok: false, message: "unsupported key".to_string(), data: serde_json::json!({ "key": req.key }) });
                }
            } else {
                print_json(&Response { ok: false, message: "window not found".to_string(), data: serde_json::json!({ "query": query }) });
            }
        }
        _ => print_json(&Response {
            ok: false,
            message: "unknown action".to_string(),
            data: serde_json::json!({ "action": req.action }),
        }),
    }
}
