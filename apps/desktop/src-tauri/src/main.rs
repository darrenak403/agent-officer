//! Agent Office desktop shell. Runs the office server in-process (no Docker, no Node), shows the
//! static UI in one window, and lives in the menu bar: closing the window only hides it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

use tauri::{
    menu::{Menu, MenuItem}, tray::{MouseButton, TrayIconBuilder, TrayIconEvent}, Manager, WindowEvent,
};

const PORT: u16 = 4100;

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
}

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    std::env::var("OFFICE_DATA_DIR").map(PathBuf::from)
        .unwrap_or_else(|_| app.path().app_data_dir().expect("app data dir"))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Menu-bar app: no Dock icon on macOS.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let dir = data_dir(app.handle());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = office_core::server::serve(dir, PORT, std::future::pending()).await {
                    eprintln!("agent-office: server stopped: {e} (is port {PORT} already in use?)");
                }
            });

            let open = MenuItem::with_id(app, "open", "Mở Agent Office", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().cloned().expect("bundle icon"))
                .tooltip("Agent Office")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event { show_main(tray.app_handle()); }
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
