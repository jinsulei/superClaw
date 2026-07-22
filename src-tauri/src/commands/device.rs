/// 设备密钥管理 + Gateway connect 握手签名
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use rand::RngCore;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::Path;
#[cfg(target_os = "windows")]
use std::process::Command;

const DEVICE_KEY_FILE: &str = "clawpanel-device-key.json";
const IDENTITY_DEVICE_FILE: &str = "device.json";
const IDENTITY_DEVICE_AUTH_FILE: &str = "device-auth.json";
const ED25519_SPKI_PREFIX_HEX: &str = "302a300506032b6570032100";
const ED25519_PKCS8_PRIVATE_PREFIX_HEX: &str = "302e020100300506032b657004220420";
const SCOPES: &[&str] = &[
    "operator.admin",
    "operator.approvals",
    "operator.pairing",
    "operator.read",
    "operator.write",
];

/// 获取或生成设备密钥
pub(crate) fn get_or_create_key() -> Result<(String, String, SigningKey), String> {
    let dir = super::openclaw_dir();
    get_or_create_key_in_dir(&dir)
}

pub(crate) fn get_or_create_key_in_dir(dir: &Path) -> Result<(String, String, SigningKey), String> {
    let path = dir.join(DEVICE_KEY_FILE);

    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("读取设备密钥失败: {e}"))?;
        let json: Value =
            serde_json::from_str(&content).map_err(|e| format!("解析设备密钥失败: {e}"))?;

        let device_id = json["deviceId"].as_str().unwrap_or("").to_string();
        let pub_b64 = json["publicKey"].as_str().unwrap_or("").to_string();
        let secret_hex = json["secretKey"].as_str().unwrap_or("");

        let secret_bytes = hex::decode(secret_hex).map_err(|e| format!("解码密钥失败: {e}"))?;
        if secret_bytes.len() != 32 {
            return Err("密钥长度错误".into());
        }
        let mut key_bytes = [0u8; 32];
        key_bytes.copy_from_slice(&secret_bytes);
        let signing_key = SigningKey::from_bytes(&key_bytes);

        return Ok((device_id, pub_b64, signing_key));
    }

    // 生成新密钥
    let mut rng = rand::thread_rng();
    let signing_key = SigningKey::generate(&mut rng);
    let verifying_key: VerifyingKey = (&signing_key).into();
    let pub_bytes = verifying_key.to_bytes();

    let device_id = {
        let mut hasher = Sha256::new();
        hasher.update(pub_bytes);
        hex::encode(hasher.finalize())
    };
    let pub_b64 = base64_url_encode(&pub_bytes);
    let secret_hex = hex::encode(signing_key.to_bytes());

    let json = serde_json::json!({
        "deviceId": device_id,
        "publicKey": pub_b64,
        "secretKey": secret_hex,
    });

    let _ = fs::create_dir_all(&dir);
    fs::write(&path, serde_json::to_string_pretty(&json).unwrap())
        .map_err(|e| format!("保存设备密钥失败: {e}"))?;

    Ok((device_id, pub_b64, signing_key))
}

/// base64url 编码（无 padding）
fn base64_url_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

fn base64_standard_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn pem_encode(label: &str, der: &[u8]) -> String {
    let encoded = base64_standard_encode(der);
    let mut body = String::new();
    for chunk in encoded.as_bytes().chunks(64) {
        body.push_str(std::str::from_utf8(chunk).unwrap_or(""));
        body.push('\n');
    }
    format!("-----BEGIN {label}-----\n{body}-----END {label}-----\n")
}

fn public_key_pem_from_raw(public_key_raw: &[u8]) -> Result<String, String> {
    let mut der = hex::decode(ED25519_SPKI_PREFIX_HEX)?;
    der.extend_from_slice(public_key_raw);
    Ok(pem_encode("PUBLIC KEY", &der))
}

fn private_key_pem_from_raw(private_key_raw: &[u8]) -> Result<String, String> {
    let mut der = hex::decode(ED25519_PKCS8_PRIVATE_PREFIX_HEX)?;
    der.extend_from_slice(private_key_raw);
    Ok(pem_encode("PRIVATE KEY", &der))
}

fn new_pairing_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64_url_encode(&bytes)
}

fn unix_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(target_os = "windows")]
fn gateway_cli_probe_platform() -> &'static str {
    "win32"
}

#[cfg(not(target_os = "windows"))]
fn gateway_cli_probe_platform() -> &'static str {
    std::env::consts::OS
}

pub(crate) fn ensure_gateway_identity_store_in_dir(dir: &Path) -> Result<(), String> {
    let identity_dir = dir.join("identity");
    let identity_path = identity_dir.join(IDENTITY_DEVICE_FILE);
    let device_auth_path = identity_dir.join(IDENTITY_DEVICE_AUTH_FILE);
    if identity_path.exists() && device_auth_path.exists() {
        return Ok(());
    }

    let (device_id, public_key, signing_key) = get_or_create_key_in_dir(dir)?;
    fs::create_dir_all(&identity_dir).map_err(|e| format!("创建 identity 目录失败: {e}"))?;

    if !identity_path.exists() {
        let verifying_key: VerifyingKey = (&signing_key).into();
        let identity = serde_json::json!({
            "version": 1,
            "deviceId": device_id,
            "publicKeyPem": public_key_pem_from_raw(&verifying_key.to_bytes())?,
            "privateKeyPem": private_key_pem_from_raw(&signing_key.to_bytes())?,
            "createdAtMs": unix_now_ms()
        });
        fs::write(
            &identity_path,
            serde_json::to_string_pretty(&identity).unwrap(),
        )
        .map_err(|e| format!("写入 device.json 失败: {e}"))?;
    }

    let token = ensure_paired_operator_token(dir, &device_id, &public_key)?;
    if !device_auth_path.exists() {
        let device_auth = serde_json::json!({
            "version": 1,
            "deviceId": device_id,
            "tokens": {
                "operator": {
                    "token": token,
                    "role": "operator",
                    "scopes": SCOPES,
                    "updatedAtMs": unix_now_ms()
                }
            }
        });
        fs::write(
            &device_auth_path,
            serde_json::to_string_pretty(&device_auth).unwrap(),
        )
        .map_err(|e| format!("写入 device-auth.json 失败: {e}"))?;
    }

    Ok(())
}

fn ensure_paired_operator_token(
    dir: &Path,
    device_id: &str,
    public_key: &str,
) -> Result<String, String> {
    let devices_dir = dir.join("devices");
    fs::create_dir_all(&devices_dir).map_err(|e| format!("创建 devices 目录失败: {e}"))?;
    let paired_path = devices_dir.join("paired.json");
    let mut paired = fs::read_to_string(&paired_path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .filter(|value| value.is_object())
        .unwrap_or_else(|| serde_json::json!({}));
    let now = unix_now_ms();
    let token = {
        let entry = paired
            .as_object_mut()
            .unwrap()
            .entry(device_id.to_string())
            .or_insert_with(|| {
                serde_json::json!({
                    "deviceId": device_id,
                    "publicKey": public_key,
                    "platform": gateway_cli_probe_platform(),
                    "clientId": "openclaw-control-ui",
                    "clientMode": "ui",
                    "role": "operator",
                    "roles": ["operator"],
                    "scopes": SCOPES,
                    "approvedScopes": SCOPES,
                    "tokens": {},
                    "createdAtMs": now,
                    "approvedAtMs": now
                })
            });
        if !entry.is_object() {
            *entry = serde_json::json!({});
        }
        let obj = entry.as_object_mut().unwrap();
        obj.entry("deviceId")
            .or_insert_with(|| serde_json::json!(device_id));
        obj.entry("publicKey")
            .or_insert_with(|| serde_json::json!(public_key));
        obj.entry("platform")
            .or_insert_with(|| serde_json::json!(gateway_cli_probe_platform()));
        obj.entry("clientId")
            .or_insert_with(|| serde_json::json!("openclaw-control-ui"));
        obj.entry("clientMode")
            .or_insert_with(|| serde_json::json!("ui"));
        obj.entry("role")
            .or_insert_with(|| serde_json::json!("operator"));
        obj.entry("roles")
            .or_insert_with(|| serde_json::json!(["operator"]));
        obj.entry("scopes")
            .or_insert_with(|| serde_json::json!(SCOPES));
        obj.entry("approvedScopes")
            .or_insert_with(|| serde_json::json!(SCOPES));
        obj.entry("createdAtMs")
            .or_insert_with(|| serde_json::json!(now));
        obj.entry("approvedAtMs")
            .or_insert_with(|| serde_json::json!(now));
        let tokens = obj.entry("tokens").or_insert_with(|| serde_json::json!({}));
        if !tokens.is_object() {
            *tokens = serde_json::json!({});
        }
        let tokens_obj = tokens.as_object_mut().unwrap();
        if let Some(existing) = tokens_obj
            .get("operator")
            .and_then(|value| value.get("token"))
            .and_then(|value| value.as_str())
            .filter(|value| !value.trim().is_empty())
        {
            existing.to_string()
        } else {
            let next = new_pairing_token();
            tokens_obj.insert(
                "operator".into(),
                serde_json::json!({
                    "token": next,
                    "role": "operator",
                    "scopes": SCOPES,
                    "createdAtMs": now,
                    "revokedAtMs": null,
                    "lastUsedAtMs": null
                }),
            );
            next
        }
    };
    fs::write(&paired_path, serde_json::to_string_pretty(&paired).unwrap())
        .map_err(|e| format!("写入 paired.json 失败: {e}"))?;
    Ok(token)
}

/// hex 编码（ed25519_dalek 不自带 hex）
mod hex {
    pub fn encode(data: impl AsRef<[u8]>) -> String {
        data.as_ref().iter().map(|b| format!("{b:02x}")).collect()
    }
    pub fn decode(s: &str) -> Result<Vec<u8>, String> {
        if !s.len().is_multiple_of(2) {
            return Err("奇数长度".into());
        }
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string()))
            .collect()
    }
}

/// 生成 Gateway connect 帧（含 Ed25519 签名）
/// gateway_token: token 模式认证凭据（可为空）
/// gateway_password: password 模式认证凭据（可为空，新增）
#[tauri::command]
pub fn create_connect_frame(
    nonce: String,
    gateway_token: String,
    gateway_password: Option<String>,
) -> Result<Value, String> {
    let (device_id, pub_b64, signing_key) = get_or_create_key()?;
    let signed_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let platform = gateway_cli_probe_platform();
    let device_family = "";

    // OpenClaw negotiates the Gateway protocol as a range. The current bundled
    // runtime speaks v4, while older May builds used v3, so advertise both.
    let min_protocol_version = 3;
    let max_protocol_version = 4;
    let signature_payload_version = 3;
    let auth_secret = if !gateway_token.is_empty() {
        &gateway_token
    } else {
        gateway_password.as_deref().unwrap_or("")
    };

    let scopes_str = SCOPES.join(",");
    // v3 签名格式：v3|deviceId|clientId|clientMode|role|scopes|signedAt|token|nonce|platform|deviceFamily
    // 使用 openclaw-control-ui + ui 模式，使 Gateway 识别为 Control UI 客户端，
    // 本地连接时触发静默自动配对（shouldAllowSilentLocalPairing = true）
    let payload_str = format!(
        "v{signature_payload_version}|{device_id}|openclaw-control-ui|ui|operator|{scopes_str}|{signed_at}|{auth_secret}|{nonce}|{platform}|{device_family}"
    );

    let signature = signing_key.sign(payload_str.as_bytes());
    let sig_b64 = base64_url_encode(&signature.to_bytes());

    // 构建 auth 对象：根据有无 token/password 选择填充字段
    let password = gateway_password.unwrap_or_default();
    let auth = if !gateway_token.is_empty() {
        serde_json::json!({ "token": gateway_token })
    } else if !password.is_empty() {
        serde_json::json!({ "password": password })
    } else {
        serde_json::json!({})
    };

    let frame = serde_json::json!({
        "type": "req",
        "id": format!("connect-{:08x}-{:04x}", signed_at as u32, rand::random::<u16>()),
        "method": "connect",
        "params": {
            "minProtocol": min_protocol_version,
            "maxProtocol": max_protocol_version,
            "client": {
                "id": "openclaw-control-ui",
                "version": env!("CARGO_PKG_VERSION"),
                "platform": platform,
                "mode": "ui"
            },
            "role": "operator",
            "scopes": SCOPES,
            "caps": ["tool-events"],
            "auth": auth,
            "device": {
                "id": device_id,
                "publicKey": pub_b64,
                "signedAt": signed_at as u64,
                "nonce": nonce,
                "signature": sig_b64,
            },
            "locale": "zh-CN",
            "userAgent": format!("ClawPanel/{}", env!("CARGO_PKG_VERSION")),
        }
    });

    Ok(frame)
}

#[tauri::command]
pub fn get_usb_binding_context() -> Result<Value, String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("读取程序路径失败: {e}"))?;
    let app_root = exe_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| exe_path.clone());

    #[cfg(target_os = "windows")]
    {
        let drive_id = windows_drive_id(&app_root)
            .ok_or_else(|| format!("无法识别程序所在盘符: {}", app_root.display()))?;
        let disk = windows_logical_disk_info(&drive_id)?;
        let serial = disk
            .get("VolumeSerialNumber")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let label = disk
            .get("VolumeName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let drive_type = disk.get("DriveType").and_then(|v| v.as_u64()).unwrap_or(0);
        let is_removable = drive_type == 2;
        let usb_id = if serial.is_empty() {
            String::new()
        } else {
            let mut hasher = Sha256::new();
            hasher.update(format!("superclaw-usb|{drive_id}|{serial}|{label}").as_bytes());
            hex::encode(hasher.finalize())
        };

        return Ok(serde_json::json!({
            "platform": std::env::consts::OS,
            "available": !serial.is_empty(),
            "enforcementReady": is_removable && !serial.is_empty(),
            "appRoot": app_root.to_string_lossy(),
            "driveId": drive_id,
            "driveType": drive_type,
            "driveTypeName": windows_drive_type_name(drive_type),
            "isRemovable": is_removable,
            "volumeSerial": serial,
            "volumeLabel": label,
            "usbId": usb_id,
        }));
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(serde_json::json!({
            "platform": std::env::consts::OS,
            "available": false,
            "enforcementReady": false,
            "appRoot": app_root.to_string_lossy(),
            "reason": "USB binding is currently implemented for Windows portable builds.",
        }))
    }
}

#[cfg(target_os = "windows")]
fn windows_drive_id(path: &std::path::Path) -> Option<String> {
    let raw = path.to_string_lossy();
    let bytes = raw.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' {
        Some(raw[0..2].to_ascii_uppercase())
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn windows_logical_disk_info(drive_id: &str) -> Result<Value, String> {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let script = format!(
        "$d='{drive_id}'; $v=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='$d'\"; if ($v) {{ $v | Select-Object DeviceID,VolumeSerialNumber,VolumeName,DriveType | ConvertTo-Json -Compress }}"
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
        .map_err(|e| format!("读取磁盘信息失败: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "读取磁盘信息失败".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Err(format!("未找到磁盘信息: {drive_id}"));
    }
    serde_json::from_str::<Value>(&stdout).map_err(|e| format!("解析磁盘信息失败: {e}"))
}

#[cfg(target_os = "windows")]
fn windows_drive_type_name(drive_type: u64) -> &'static str {
    match drive_type {
        2 => "removable",
        3 => "fixed",
        4 => "network",
        5 => "cdrom",
        6 => "ramdisk",
        _ => "unknown",
    }
}
