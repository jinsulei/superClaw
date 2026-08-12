mod agent_lifecycle;
mod commands;
mod instance_guard;
mod models;
mod tray;
mod utils;

use commands::{
    agent, assistant, claude_code, cli_conflict, config, device, diagnose, extensions, file_service, hermes,
    hermes_providers, logs, media, memory, messaging, ocr, openclaw_history, pairing, service,
    shared_memory, skills, update,
};
use tauri::Manager;

#[tauri::command]
async fn stop_agent(agent: String) -> Result<(), String> {
    let parsed = agent_lifecycle::parse_managed_agent(&agent)?;
    agent_lifecycle::stop_managed_agent(parsed)
}

#[tauri::command]
async fn stop_all_agents() -> Result<(), String> {
    agent_lifecycle::stop_all_managed_agents()
}

/// Explicit quit path. Closing the window only hides to the tray; selecting
/// "退出 SuperClaw" must release services owned by this instance.
pub async fn shutdown_current_instance(app: tauri::AppHandle) {
    // Individual runtimes can be unhealthy or already gone. A desktop quit
    // must not leave the UI process stranded forever while waiting for one.
    let _ = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        let _ = claude_code::claude_code_stop().await;
        let _ = hermes::hermes_gateway_action(app.clone(), "stop".to_string()).await;
        let _ = service::stop_service("ai.openclaw.gateway".to_string()).await;
    })
    .await;
    let _ = agent_lifecycle::stop_all_managed_agents();
}

/// Restart only this SuperClaw instance. The shutdown sequence keeps ownership
/// checks in the individual service controllers, so unrelated local agents are
/// never terminated just because this desktop app is restarting.
#[tauri::command]
async fn restart_current_instance(app: tauri::AppHandle) -> Result<(), String> {
    shutdown_current_instance(app.clone()).await;
    app.restart();
}

#[cfg(windows)]
fn allow_microphone_permission(app: &tauri::AppHandle) {
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        },
        PermissionRequestedEventHandler,
    };

    let Some(webview) = app.get_webview_window("main") else {
        eprintln!("[voice] main webview not found, microphone permission hook skipped");
        return;
    };

    if let Err(err) = webview.with_webview(|platform_webview| unsafe {
        let controller = platform_webview.controller();
        let Ok(core_webview) = controller.CoreWebView2() else {
            eprintln!("[voice] CoreWebView2 not ready, microphone permission hook skipped");
            return;
        };

        let mut token = 0;
        if let Err(err) = core_webview.add_PermissionRequested(
            &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else {
                    return Ok(());
                };

                let mut kind = Default::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }

                Ok(())
            })),
            &mut token,
        ) {
            eprintln!("[voice] failed to install microphone permission hook: {err}");
        }
    }) {
        eprintln!("[voice] with_webview failed: {err}");
    }
}

#[cfg(not(windows))]
fn allow_microphone_permission(_app: &tauri::AppHandle) {}

pub fn run() {
    let hot_update_dir = commands::openclaw_dir()
        .join("clawpanel")
        .join("web-update");

    // issue #261: 装新版 app 时，如果旧的热更新目录里装的是更旧版本的前端
    // （或根本没 .version 标记），protocol handler 会优先读它，导致
    // 用户装了 v0.14.0 看到的还是 v0.9.8 的界面。
    // 启动时先比对版本，落后于当前 app 就直接清掉，让 protocol handler 回退到内嵌 bundle。
    cleanup_stale_hot_update(&hot_update_dir);

    if !instance_guard::prepare_instance() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .register_uri_scheme_protocol("tauri", move |ctx, request| {
            let uri_path = request.uri().path();
            let path = if uri_path == "/" || uri_path.is_empty() {
                "index.html"
            } else {
                uri_path.strip_prefix('/').unwrap_or(uri_path)
            };

            // 1. 优先检查热更新目录
            let update_file = hot_update_dir.join(path);
            if update_file.is_file() {
                if let Ok(data) = std::fs::read(&update_file) {
                    return tauri::http::Response::builder()
                        .header(
                            tauri::http::header::CONTENT_TYPE,
                            update::mime_from_path(path),
                        )
                        .body(data)
                        .unwrap();
                }
            }

            // 2. 回退到内嵌资源
            if let Some(asset) = ctx.app_handle().asset_resolver().get(path.to_string()) {
                let builder = tauri::http::Response::builder()
                    .header(tauri::http::header::CONTENT_TYPE, &asset.mime_type);
                // Tauri 内嵌资源可能带 CSP header
                let builder = if let Some(csp) = asset.csp_header {
                    builder.header("Content-Security-Policy", csp)
                } else {
                    builder
                };
                builder.body(asset.bytes).unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::NOT_FOUND)
                    .body(b"Not Found".to_vec())
                    .unwrap()
            }
        })
        .setup(|app| {
            instance_guard::register_primary_instance(app.handle().clone());
            agent_lifecycle::cleanup_stale_managed_agents_on_startup();
            service::start_backend_guardian(app.handle().clone());
            tauri::async_runtime::spawn(async {
                if let Err(err) = claude_code::claude_code_start().await {
                    eprintln!("[superclaw] failed to auto-start Claude Panel relay: {err}");
                }
            });
            allow_microphone_permission(app.handle());
            tray::setup_tray(app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 配置
            config::read_openclaw_config,
            config::write_openclaw_config,
            config::validate_openclaw_config,
            config::read_mcp_config,
            config::write_mcp_config,
            config::get_version_info,
            config::check_installation,
            config::init_openclaw_config,
            config::calibrate_openclaw_config,
            config::check_node,
            config::check_node_at_path,
            config::check_openclaw_at_path,
            config::scan_node_paths,
            config::scan_openclaw_paths,
            config::save_custom_node_path,
            config::write_env_file,
            config::list_backups,
            config::create_backup,
            config::restore_backup,
            config::delete_backup,
            config::reload_gateway,
            config::restart_gateway,
            config::test_model,
            config::test_model_verbose,
            config::list_remote_models,
            config::list_openclaw_versions,
            config::upgrade_openclaw,
            config::uninstall_openclaw,
            config::install_gateway,
            config::uninstall_gateway,
            config::patch_model_vision,
            config::check_panel_update,
            config::get_openclaw_dir,
            config::read_panel_config,
            config::write_panel_config,
            config::test_proxy,
            config::get_npm_registry,
            config::set_npm_registry,
            config::check_git,
            config::scan_git_paths,
            config::auto_install_git,
            config::configure_git_https,
            config::invalidate_path_cache,
            config::get_status_summary,
            config::doctor_fix,
            config::doctor_check,
            config::relaunch_app,
            // 设备密钥 + Gateway 握手
            device::create_connect_frame,
            device::get_usb_binding_context,
            // 设备配对
            pairing::auto_pair_device,
            pairing::check_pairing_status,
            pairing::pairing_list_channel,
            pairing::pairing_approve_channel,
            // 服务
            service::get_services_status,
            service::start_service,
            service::stop_service,
            service::restart_service,
            service::claim_gateway,
            service::probe_gateway_port,
            service::guardian_status,
            openclaw_history::read_openclaw_raw_history,
            openclaw_history::list_openclaw_raw_sessions,
            openclaw_history::repair_stuck_sessions,
            openclaw_history::openclaw_load_gateway_media,
            openclaw_history::openclaw_load_local_media,
            openclaw_history::openclaw_open_workspace_output,
            openclaw_history::openclaw_download_workspace_output,
            // 诊断
            diagnose::diagnose_gateway_connection,
            diagnose::check_ciao_windowshide_bug,
            // CLI 冲突检测与隔离（PATH 中残留的非 standalone openclaw）
            cli_conflict::scan_openclaw_path_conflicts,
            cli_conflict::quarantine_openclaw_path,
            cli_conflict::quarantine_openclaw_paths_bulk,
            cli_conflict::list_quarantined_openclaw,
            cli_conflict::restore_quarantined_openclaw,
            // 日志
            logs::read_log_tail,
            logs::search_log,
            // 记忆文件
            memory::list_memory_files,
            memory::read_memory_file,
            memory::write_memory_file,
            memory::delete_memory_file,
            memory::export_memory_zip,
            shared_memory::shared_memory_config,
            shared_memory::shared_memory_read,
            shared_memory::shared_memory_write,
            shared_memory::shared_memory_write_file,
            shared_memory::collaboration_message_append,
            shared_memory::collaboration_message_drain,
            file_service::file_service_run,
            claude_code::claude_collaboration_drain,
            claude_code::claude_collaboration_result_append,
            // Portable media provider routes. These never alter Gateway chat routing.
            media::media_config_read,
            media::media_config_write,
            media::media_classify_intent,
            media::media_generate_text_image,
            media::media_generate,
            // 扩展工具
            extensions::get_cftunnel_status,
            extensions::cftunnel_action,
            extensions::get_cftunnel_logs,
            extensions::get_clawapp_status,
            extensions::install_cftunnel,
            extensions::install_clawapp,
            // Agent 管理
            agent::list_agents,
            agent::get_agent_detail,
            agent::list_agent_files,
            agent::read_agent_file,
            agent::write_agent_file,
            agent::get_agent_workspace_info,
            agent::list_agent_workspace_entries,
            agent::read_agent_workspace_file,
            agent::write_agent_workspace_file,
            agent::add_agent,
            agent::delete_agent,
            agent::update_agent_config,
            agent::update_agent_identity,
            agent::update_agent_model,
            agent::backup_agent,
            // AI 助手工具
            assistant::assistant_exec,
            assistant::assistant_read_file,
            assistant::assistant_write_file,
            assistant::assistant_list_dir,
            assistant::assistant_open_path,
            assistant::assistant_system_info,
            assistant::assistant_list_processes,
            assistant::assistant_check_port,
            assistant::assistant_web_search,
            assistant::assistant_fetch_url,
            // 数据目录 & 图片存储
            assistant::assistant_ensure_data_dir,
            assistant::assistant_save_image,
            assistant::assistant_load_image,
            assistant::hermes_load_media_image,
            assistant::assistant_delete_image,
            ocr::ocr_get_config,
            ocr::ocr_set_enabled,
            ocr::ocr_extract_text,
            // 消息渠道管理
            messaging::read_platform_config,
            messaging::save_messaging_platform,
            messaging::remove_messaging_platform,
            messaging::toggle_messaging_platform,
            messaging::verify_bot_token,
            messaging::diagnose_channel,
            messaging::repair_qqbot_channel_setup,
            messaging::list_configured_platforms,
            messaging::get_channel_plugin_status,
            messaging::list_all_plugins,
            messaging::toggle_plugin,
            messaging::install_plugin,
            messaging::install_channel_plugin,
            messaging::install_qqbot_plugin,
            messaging::run_channel_action,
            messaging::check_weixin_plugin_status,
            // Agent 渠道绑定管理
            messaging::get_agent_bindings,
            messaging::list_all_bindings,
            messaging::save_agent_binding,
            messaging::delete_agent_binding,
            messaging::delete_agent_all_bindings,
            // Skills 管理
            skills::skills_list,
            skills::skills_info,
            skills::skills_check,
            skills::skills_install_dep,
            skills::skills_install_builtin,
            skills::skills_uninstall,
            skills::skills_validate,
            // SkillHub SDK（内置 HTTP，不依赖 CLI）
            skills::skillhub_search,
            skills::skillhub_index,
            skills::skillhub_install,
            // 前端热更新
            update::check_frontend_update,
            update::download_frontend_update,
            update::rollback_frontend_update,
            update::get_update_status,
            // Hermes Agent 管理
            hermes::check_python,
            hermes::check_hermes,
            hermes::install_hermes,
            hermes::configure_hermes,
            hermes::hermes_gateway_action,
            hermes::hermes_health_check,
            hermes::hermes_api_proxy,
            hermes::hermes_agent_run,
            hermes::hermes_agent_resolve_approval,
            hermes::hermes_save_document_attachment,
            hermes::hermes_native_terminal_start,
            hermes::hermes_read_config,
            hermes::hermes_fetch_models,
            hermes::hermes_update_model,
            hermes::hermes_detect_environments,
            hermes_providers::hermes_list_providers,
            hermes::hermes_env_read_unmanaged,
            hermes::hermes_env_set,
            hermes::hermes_env_delete,
            hermes::hermes_env_reveal,
            hermes::hermes_config_raw_read,
            hermes::hermes_config_raw_write,
            hermes::hermes_voice_config_read,
            hermes::hermes_voice_config_write,
            hermes::hermes_voice_transcribe,
            hermes::hermes_voice_synthesize,
            hermes::hermes_set_gateway_url,
            hermes::update_hermes,
            hermes::uninstall_hermes,
            hermes::hermes_sessions_list,
            hermes::hermes_sessions_summary_list,
            hermes::hermes_usage_analytics,
            hermes::hermes_session_detail,
            hermes::hermes_session_delete,
            hermes::hermes_session_rename,
            hermes::hermes_profiles_list,
            hermes::hermes_profile_use,
            hermes::hermes_logs_list,
            hermes::hermes_logs_read,
            hermes::hermes_skills_list,
            hermes::hermes_skill_detail,
            hermes::hermes_skill_toggle,
            hermes::hermes_skill_files,
            hermes::hermes_skill_write,
            hermes::hermes_skill_install,
            hermes::hermes_ensure_builtin_skills,
            hermes::hermes_memory_read,
            hermes::hermes_memory_write,
            hermes::hermes_memory_read_all,
            hermes::hermes_logs_download,
            hermes::hermes_dashboard_themes,
            hermes::hermes_dashboard_theme_set,
            hermes::hermes_dashboard_plugins,
            hermes::hermes_dashboard_plugins_rescan,
            hermes::hermes_dashboard_probe,
            hermes::hermes_dashboard_start,
            hermes::hermes_dashboard_stop,
            hermes::hermes_toolsets_list,
            hermes::hermes_cron_jobs_list,
            claude_code::claude_code_start,
            claude_code::claude_code_native_start,
            claude_code::claude_code_native_stop,
            claude_code::claude_code_stop,
            claude_code::claude_code_status,
            claude_code::configure_claude_code_relay,
            stop_agent,
            stop_all_agents,
            restart_current_instance,
        ])
        .on_window_event(|window, event| {
            // 关闭窗口时最小化到托盘，不退出应用
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("启动 SuperClaw 失败")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                let _ = agent_lifecycle::stop_all_managed_agents();
            }
        });
}

/// 启动时清理落后版本的热更新目录（issue #261）。
///
/// 规则：
/// - 目录不存在：noop
/// - 目录存在，`.version` 文件不存在：视为"版本未知"，保守清理
///   （老版 SuperClaw 没写 .version，不清理就会永远卡在旧前端）
/// - 目录存在，`.version >= app 版本`：保留（正常热更新场景）
/// - 目录存在，`.version < app 版本`：清理（用户装了新 app，旧热更新残留）
fn cleanup_stale_hot_update(dir: &std::path::Path) {
    if !dir.exists() {
        return;
    }
    let app_version = env!("CARGO_PKG_VERSION");
    let web_version = std::fs::read_to_string(dir.join(".version"))
        .ok()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    // 有标记且 >= app 版本：保留
    if !web_version.is_empty() && update::version_ge(&web_version, app_version) {
        return;
    }

    // 落后或无标记：清理，让 protocol handler 回退到 asset_resolver
    eprintln!(
        "[clawpanel] clearing stale web-update dir (app={}, web={})",
        app_version,
        if web_version.is_empty() {
            "<missing>"
        } else {
            web_version.as_str()
        }
    );
    let _ = std::fs::remove_dir_all(dir);
}
