//! Agent Office core: validates hook events, stores them in SQLite and builds the office snapshot.
//! The same library backs the standalone `office-core` server and, later, the Tauri desktop app.

pub mod collector;
pub mod db;
pub mod event;
pub mod ingest;
pub mod server;
pub mod snapshot;
pub mod status;
pub mod time;

/// Where the office keeps its database, ingest token and spool. `OFFICE_DATA_DIR` overrides the
/// per-user app data folder, so the desktop app and its hook commands always agree.
pub fn default_data_dir() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("OFFICE_DATA_DIR") { return dir.into(); }
    const ID: &str = "dev.agentoffice.app";
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    if cfg!(target_os = "macos") { return format!("{home}/Library/Application Support/{ID}").into(); }
    if cfg!(windows) { if let Ok(app) = std::env::var("APPDATA") { return format!("{app}\\{ID}").into(); } }
    std::env::var("XDG_DATA_HOME").map(|d| format!("{d}/{ID}")).unwrap_or_else(|_| format!("{home}/.local/share/{ID}")).into()
}

/// Handles `hook --runtime <claude|codex>` and `statusline`; true when argv was one of them.
pub fn run_cli(args: &[String]) -> bool {
    match args.get(1).map(String::as_str) {
        Some("hook") => {
            let runtime = args.iter().position(|a| a == "--runtime").and_then(|i| args.get(i + 1)).cloned().unwrap_or_default();
            collector::run_hook(&runtime, &default_data_dir());
            true
        }
        Some("statusline") => { collector::statusline::run_statusline(&default_data_dir()); true }
        _ => false,
    }
}
