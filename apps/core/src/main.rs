//! Standalone office server. Env: OFFICE_DATA_DIR (default ./.data),
//! OFFICE_INGEST_TOKEN (else <data>/ingest-token), PORT (default 4100).

use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if office_core::run_cli(&args) { return; }
    serve_main();
}

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn serve_main() {
    let data_dir = PathBuf::from(std::env::var("OFFICE_DATA_DIR").unwrap_or_else(|_| ".data".into()));
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(4100);
    office_core::server::serve(data_dir, port, async { let _ = tokio::signal::ctrl_c().await; }).await.expect("office server");
}
