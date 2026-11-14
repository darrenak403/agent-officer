//! Agent Office desktop shell. Runs the office server in-process (no Docker, no Node), shows the
//! static UI in one window, and lives in the menu bar: closing the window only hides it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Manager, WindowEvent,
};

const PORT: u16 = 4100;

/// Menu-bar click: hide the window when it is in front, otherwise bring it up.
fn toggle_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) { let _ = w.hide(); } else { show_main(app); }
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
}

/// Native yes/no question; no dialog plugin needed on macOS.
fn ask(msg: &str, yes: &str, no: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        let esc = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!("button returned of (display dialog \"{}\" with title \"Agent Office\" buttons {{\"{}\", \"{}\"}} default button \"{}\")",
            esc(msg), esc(no), esc(yes), esc(yes));
        return std::process::Command::new("osascript").args(["-e", &script]).output()
            .is_ok_and(|o| String::from_utf8_lossy(&o.stdout).trim() == yes);
    }
    #[allow(unreachable_code)] { let _ = (msg, yes, no); false }
}

fn tell(msg: &str) {
    #[cfg(target_os = "macos")]
    { let _ = std::process::Command::new("osascript").args(["-e", &format!("display notification \"{}\" with title \"Agent Office\"", msg.replace('"', "'"))]).status(); }
    #[cfg(not(target_os = "macos"))] eprintln!("{msg}");
}

fn set_hooks(install: bool) {
    let (Some(home), Ok(exe)) = (std::env::var_os("HOME").map(std::path::PathBuf::from), std::env::current_exe()) else { return };
    let dir = office_core::default_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    tell(&office_core::installer::apply_all(&home, &exe, &dir, install).join("; "));
}

/// First run (or the app moved): ask once before touching Claude/Codex settings.
fn first_run_hooks() {
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else { return };
    let Ok(exe) = std::env::current_exe() else { return };
    let dir = office_core::default_data_dir();
    let asked = office_core::installer::consent(&dir);
    if asked == Some(false) || !office_core::installer::needs_install(&home, &exe) { return; }
    let msg = if asked == Some(true) { "Hook trỏ tới bản Agent Office cũ. Cập nhật sang bản này?" }
        else { "Agent Office cần thêm hook vào ~/.claude/settings.json (và ~/.codex/hooks.json nếu có) để thấy agent làm việc. Hook cũ của bạn được giữ, file được sao lưu trước. Cài ngay?" };
    set_hooks(ask(msg, "Cài hook", "Để sau"));
}

/// Checks GitHub Releases for a newer signed build; asks before installing, then restarts.
/// `quiet` skips the "already up to date" notice for the background checks.
async fn check_update(app: tauri::AppHandle, quiet: bool) {
    use tauri_plugin_updater::UpdaterExt;
    let update = match app.updater().map_err(|e| e.to_string()) {
        Ok(u) => u.check().await.map_err(|e| e.to_string()),
        Err(e) => Err(e),
    };
    match update {
        Ok(Some(u)) => {
            let msg = format!("Có bản mới Agent Office v{} (đang dùng v{}). Cập nhật và khởi động lại?", u.version, u.current_version);
            if !tauri::async_runtime::spawn_blocking(move || ask(&msg, "Cập nhật", "Để sau")).await.unwrap_or(false) { return; }
            tell("Đang tải bản cập nhật...");
            match u.download_and_install(|_, _| {}, || {}).await {
                Ok(()) => app.restart(),
                Err(e) => tell(&format!("Cập nhật lỗi: {e}")),
            }
        }
        Ok(None) => if !quiet { tell(&format!("Đang dùng bản mới nhất v{}", app.package_info().version)) },
        Err(e) => if !quiet { tell(&format!("Không kiểm tra được bản mới: {e}")) },
    }
}

fn main() {
    // Runtimes call the same binary for hooks and the status line; those exit without a window.
    let args: Vec<String> = std::env::args().collect();
    if office_core::run_cli(&args) { return; }
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Menu-bar app: no Dock icon on macOS.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let dir = office_core::default_data_dir();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = office_core::server::serve(dir, PORT, std::future::pending()).await {
                    eprintln!("agent-office: server stopped: {e} (is port {PORT} already in use?)");
                }
            });

            std::thread::spawn(first_run_hooks);
            // Check on start, then every 6 hours.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    check_update(handle.clone(), true).await;
                    tokio::time::sleep(std::time::Duration::from_secs(6 * 3600)).await;
                }
            });

            let open = MenuItem::with_id(app, "open", "Mở Agent Office", true, None::<&str>)?;
            let install = MenuItem::with_id(app, "hooks-on", "Cài hook Claude/Codex", true, None::<&str>)?;
            let uninstall = MenuItem::with_id(app, "hooks-off", "Gỡ hook", true, None::<&str>)?;
            let update = MenuItem::with_id(app, "update", "Kiểm tra bản mới", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &install, &uninstall, &update, &quit])?;
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().cloned().expect("bundle icon"))
                .tooltip("Agent Office")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "hooks-on" => { std::thread::spawn(|| set_hooks(true)); }
                    "hooks-off" => { std::thread::spawn(|| set_hooks(false)); }
                    "update" => { tauri::async_runtime::spawn(check_update(app.clone(), false)); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { toggle_main(tray.app_handle()); }
                })
                .build(app)?;
            Ok(())
        })
        // Closing hides the window; the page pauses its canvas while hidden, the server keeps collecting.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
        })
        .run(tauri::generate_context!())
        .expect("error while running Agent Office");
}
