//! Delivery to the local office server over a tiny HTTP/1.1 client (no TLS, loopback only),
//! plus the on-disk spool used while the server is not running.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::time::Duration;

use serde_json::Value;

fn port() -> u16 { std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(4100) }

pub fn load_token(data_dir: &Path) -> Option<String> {
    std::env::var("OFFICE_INGEST_TOKEN").ok().filter(|t| !t.is_empty())
        .or_else(|| fs::read_to_string(data_dir.join("ingest-token")).ok().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()))
}

/// POSTs JSON to 127.0.0.1; true on any 2xx answer within `timeout_ms`.
pub fn post(path: &str, body: &Value, token: &str, timeout_ms: u64) -> bool {
    let timeout = Duration::from_millis(timeout_ms);
    let addr = SocketAddr::from(([127, 0, 0, 1], port()));
    let Ok(mut s) = TcpStream::connect_timeout(&addr, timeout) else { return false };
    let _ = s.set_read_timeout(Some(timeout));
    let _ = s.set_write_timeout(Some(timeout));
    let payload = body.to_string();
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nX-Office-Token: {token}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len());
    if s.write_all(request.as_bytes()).is_err() { return false; }
    let mut head = [0u8; 16];
    let read = s.read(&mut head).unwrap_or(0);
    // "HTTP/1.1 2xx"
    read >= 12 && head[9] == b'2'
}

fn append(path: &Path, line: &str) {
    let mut opts = OpenOptions::new();
    opts.create(true).append(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; opts.mode(0o600); }
    if let Ok(mut f) = opts.open(path) { let _ = writeln!(f, "{line}"); }
}

pub fn spool(data_dir: &Path, event: &Value) {
    let dir = data_dir.join("spool");
    if fs::create_dir_all(&dir).is_err() { return; }
    let runtime = event["runtime"].as_str().unwrap_or("unknown");
    append(&dir.join(format!("{runtime}.jsonl")), &event.to_string());
}

/// Sends spooled events for every runtime; undelivered ones go back to the spool. Returns the count sent.
pub fn replay(data_dir: &Path, token: &str) -> usize {
    let dir = data_dir.join("spool");
    let mut sent = 0;
    for runtime in ["claude_code", "codex"] {
        let source = dir.join(format!("{runtime}.jsonl"));
        let processing = dir.join(format!("{runtime}.{}.processing", std::process::id()));
        if fs::rename(&source, &processing).is_err() { continue; }
        for line in fs::read_to_string(&processing).unwrap_or_default().lines().filter(|l| !l.is_empty()) {
            match serde_json::from_str::<Value>(line) {
                Ok(e) if e["runtime"] == runtime && post("/api/ingest", &e, token, 2000) => sent += 1,
                _ => append(&source, line),
            }
        }
        let _ = fs::remove_file(&processing);
    }
    sent
}
