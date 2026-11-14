//! HTTP API on 127.0.0.1 (same routes as the old NestJS app), shared by the CLI server and the desktop app.

use std::{convert::Infallible, path::PathBuf, sync::{Arc, Mutex}};

use axum::{
    body::Bytes, extract::{DefaultBodyLimit, Query, State}, http::{HeaderMap, HeaderValue, Method, StatusCode},
    response::{sse::{Event, KeepAlive, Sse}, IntoResponse, Response}, routing::{get, post}, Json, Router,
};
use futures_util::Stream;
use crate::{db, event::{valid_runtime, HookEvent, UsageLimitsEvent}, ingest::{self, IngestError}, snapshot};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::json;
use subtle::ConstantTimeEq;
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use tower_http::cors::CorsLayer;

const UI_ORIGINS: [&str; 3] = ["http://127.0.0.1:3000", "http://localhost:3000", "tauri://localhost"];

#[derive(Clone)]
struct AppState { db: Arc<Mutex<Connection>>, token: Arc<String>, changes: broadcast::Sender<(String, i64)> }

type ApiResult = Result<Response, (StatusCode, String)>;
fn bad(msg: impl Into<String>) -> (StatusCode, String) { (StatusCode::BAD_REQUEST, msg.into()) }
fn internal(e: impl std::fmt::Display) -> (StatusCode, String) { eprintln!("office-core: {e}"); (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into()) }

fn authorized(state: &AppState, headers: &HeaderMap) -> bool {
    headers.get("x-office-token").and_then(|v| v.to_str().ok())
        .is_some_and(|t| t.len() == state.token.len() && bool::from(t.as_bytes().ct_eq(state.token.as_bytes())))
}

fn map_ingest(e: IngestError) -> (StatusCode, String) {
    match e { IngestError::Invalid(field) => bad(format!("invalid event envelope: {field}")), IngestError::Db(e) => internal(e) }
}

async fn ingest_event(State(s): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    if !authorized(&s, &headers) { return Err((StatusCode::FORBIDDEN, "forbidden".into())); }
    let event: HookEvent = serde_json::from_slice(&body).map_err(|_| bad("invalid event envelope"))?;
    let result = { let mut conn = s.db.lock().unwrap(); ingest::ingest(&mut conn, &event).map_err(map_ingest)? };
    if !result.duplicate { let _ = s.changes.send((result.runtime.clone(), result.sequence)); }
    Ok((StatusCode::ACCEPTED, Json(json!({ "runtime": result.runtime, "sequence": result.sequence.to_string(), "duplicate": result.duplicate })))
        .into_response())
}

async fn ingest_limits(State(s): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    if !authorized(&s, &headers) { return Err((StatusCode::FORBIDDEN, "forbidden".into())); }
    let limits: UsageLimitsEvent = serde_json::from_slice(&body).map_err(|_| bad("invalid limits"))?;
    let (runtime, seq) = { let conn = s.db.lock().unwrap(); ingest::save_limits(&conn, &limits).map_err(map_ingest)? };
    let _ = s.changes.send((runtime, seq));
    Ok((StatusCode::ACCEPTED, Json(json!({ "ok": true }))).into_response())
}

#[derive(Deserialize)]
struct RuntimeQuery { runtime: Option<String>, after: Option<String>, #[serde(rename = "sessionId")] session_id: Option<String> }

fn runtime_of(q: &RuntimeQuery) -> Result<String, (StatusCode, String)> {
    q.runtime.clone().filter(|r| valid_runtime(r)).ok_or_else(|| bad("runtime must be claude_code or codex"))
}

async fn get_snapshot(State(s): State<AppState>, Query(q): Query<RuntimeQuery>) -> ApiResult {
    let runtime = runtime_of(&q)?;
    let conn = s.db.lock().unwrap();
    Ok(Json(snapshot::snapshot(&conn, &runtime).map_err(internal)?).into_response())
}

async fn get_events(State(s): State<AppState>, Query(q): Query<RuntimeQuery>) -> ApiResult {
    let runtime = runtime_of(&q)?;
    let after = match q.after.as_deref() { Some(a) => Some(a.parse::<i64>().map_err(|_| bad("invalid cursor"))?), None => None };
    if let Some(id) = &q.session_id { if uuid::Uuid::parse_str(id).is_err() { return Err(bad("invalid session")); } }
    let conn = s.db.lock().unwrap();
    Ok(Json(snapshot::events(&conn, &runtime, after, q.session_id.as_deref()).map_err(internal)?).into_response())
}

/// Server-sent "something changed" pings per runtime; the UI refetches the snapshot on each.
async fn stream(State(s): State<AppState>, Query(q): Query<RuntimeQuery>) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, String)> {
    let runtime = runtime_of(&q)?;
    let pings = BroadcastStream::new(s.changes.subscribe()).filter_map(move |msg| match msg {
        Ok((r, seq)) if r == runtime => Some(Ok(Event::default().event("office.event").data(json!({ "runtime": r, "sequence": seq.to_string() }).to_string()))),
        _ => None,
    });
    Ok(Sse::new(pings).keep_alive(KeepAlive::default()))
}

pub fn load_token(data_dir: &PathBuf) -> String {
    std::env::var("OFFICE_INGEST_TOKEN").ok().filter(|t| !t.is_empty())
        .or_else(|| std::fs::read_to_string(data_dir.join("ingest-token")).ok().map(|t| t.trim().to_string()))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| {
            // First run: mint a token the collector reads from the same file (owner-only).
            let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
            let path = data_dir.join("ingest-token");
            let _ = std::fs::write(&path, &token);
            #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)); }
            token
        })
}

/// Opens the store in `data_dir` and serves until `shutdown` resolves.
pub async fn serve(data_dir: PathBuf, port: u16, shutdown: impl std::future::Future<Output = ()> + Send + 'static) -> std::io::Result<()> {
    std::fs::create_dir_all(&data_dir)?;
    let conn = db::open(data_dir.join("office.sqlite").to_str().unwrap()).map_err(std::io::Error::other)?;
    let (changes, _) = broadcast::channel(256);
    let state = AppState { db: Arc::new(Mutex::new(conn)), token: Arc::new(load_token(&data_dir)), changes };
    let cors = CorsLayer::new().allow_methods([Method::GET])
        .allow_origin(UI_ORIGINS.map(HeaderValue::from_static));
    let app = Router::new()
        .route("/api/health", get(|| async { Json(json!({ "ok": true, "service": "visual-agent-office" })) }))
        .route("/api/office/snapshot", get(get_snapshot))
        .route("/api/office/events", get(get_events))
        .route("/api/office/stream", get(stream))
        .route("/api/ingest", post(ingest_event))
        .route("/api/ingest/limits", post(ingest_limits))
        .layer(DefaultBodyLimit::max(32 * 1024))
        .layer(cors)
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    println!("office-core listening on 127.0.0.1:{port}");
    axum::serve(listener, app).with_graceful_shutdown(shutdown).await
}
