//! Builds the JSON the office UI reads (`OfficeSnapshotSchema` / `OfficeEventsResponseSchema`).

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::{json, Value};

use crate::time;

/// An ACTIVE session silent this long is shown as UNKNOWN (the runtime may have died).
const STALE_MS: i64 = 120_000;

fn event_json(r: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, String>("id")?, "sequence": r.get::<_, i64>("sequence")?.to_string(),
        "sourceHook": r.get::<_, String>("source_hook")?, "receivedAt": r.get::<_, String>("received_at")?,
        "sessionId": r.get::<_, Option<String>>("session_id")?, "agentId": r.get::<_, Option<String>>("agent_id")?,
        "toolName": r.get::<_, Option<String>>("tool_name")?,
    }))
}

fn rows(conn: &Connection, sql: &str, p: impl rusqlite::Params, f: impl FnMut(&Row) -> rusqlite::Result<Value>) -> rusqlite::Result<Vec<Value>> {
    conn.prepare(sql)?.query_map(p, f)?.collect()
}

fn agents(conn: &Connection, session_id: &str) -> rusqlite::Result<Vec<Value>> {
    rows(conn, "SELECT * FROM agent WHERE session_id=?1 ORDER BY rowid", [session_id], |r| {
        let input: Option<i64> = r.get("usage_input")?;
        Ok(json!({
            "id": r.get::<_, String>("id")?, "runtimeAgentId": r.get::<_, Option<String>>("runtime_agent_id")?,
            "name": r.get::<_, String>("name")?, "type": r.get::<_, String>("type")?, "status": r.get::<_, String>("status")?,
            "currentTool": r.get::<_, Option<String>>("current_tool")?, "currentActivity": r.get::<_, Option<String>>("current_activity")?,
            "mission": r.get::<_, Option<String>>("mission")?, "contextTokens": r.get::<_, Option<i64>>("context_tokens")?,
            "contextLimit": r.get::<_, Option<i64>>("context_limit")?, "model": r.get::<_, Option<String>>("model")?,
            "usage": input.map(|i| Ok::<_, rusqlite::Error>(json!({ "input": i,
                "cacheRead": r.get::<_, Option<i64>>("usage_cache_read")?.unwrap_or(0),
                "cacheWrite": r.get::<_, Option<i64>>("usage_cache_write")?.unwrap_or(0),
                "output": r.get::<_, Option<i64>>("usage_output")?.unwrap_or(0) }))).transpose()?,
            "lastSeenAt": r.get::<_, Option<String>>("last_seen_at")?,
            "identityConfidence": r.get::<_, String>("identity_confidence")?,
            "parentAgentId": r.get::<_, Option<String>>("parent_agent_id")?,
        }))
    })
}

pub fn snapshot(conn: &Connection, runtime: &str) -> rusqlite::Result<Value> {
    let now = chrono::Utc::now().timestamp_millis();
    let mut sessions = rows(conn,
        "SELECT s.*, p.name AS project_name FROM session s LEFT JOIN project p ON p.id = s.project_id WHERE s.runtime=?1
         ORDER BY s.last_event_at IS NULL, s.last_event_at DESC, s.created_at DESC LIMIT 50", [runtime], |r| {
        let status: String = r.get("status")?;
        let last: Option<String> = r.get("last_event_at")?;
        let stale = status == "ACTIVE" && last.as_deref().and_then(time::millis).is_some_and(|t| now - t > STALE_MS);
        Ok(json!({
            "id": r.get::<_, String>("id")?, "runtime": runtime, "runtimeSessionId": r.get::<_, String>("runtime_session_id")?,
            "projectName": r.get::<_, Option<String>>("project_name")?, "title": r.get::<_, Option<String>>("title")?,
            "status": if stale { "UNKNOWN".to_string() } else { status },
            "startedAt": r.get::<_, Option<String>>("started_at")?, "endedAt": r.get::<_, Option<String>>("ended_at")?,
        }))
    })?;
    for s in sessions.iter_mut() {
        let id = s["id"].as_str().unwrap().to_string();
        s["agents"] = Value::Array(agents(conn, &id)?);
    }
    let tasks = rows(conn,
        "SELECT t.* FROM task t JOIN session s ON s.id = t.session_id WHERE s.runtime=?1 ORDER BY t.created_at DESC LIMIT 100", [runtime], |r| Ok(json!({
            "id": r.get::<_, String>("id")?, "sessionId": r.get::<_, String>("session_id")?,
            "runtimeTaskId": r.get::<_, String>("runtime_task_id")?, "subject": r.get::<_, Option<String>>("subject")?,
            "status": r.get::<_, String>("status")?,
        })))?;
    let tools = rows(conn,
        "SELECT t.* FROM tool_execution t JOIN session s ON s.id = t.session_id WHERE s.runtime=?1 ORDER BY t.last_event_at DESC LIMIT 100", [runtime], |r| Ok(json!({
            "id": r.get::<_, String>("id")?, "sessionId": r.get::<_, String>("session_id")?, "agentId": r.get::<_, Option<String>>("agent_id")?,
            "toolUseId": r.get::<_, String>("tool_use_id")?, "name": r.get::<_, String>("name")?,
            "activity": r.get::<_, Option<String>>("activity")?, "status": r.get::<_, String>("status")?,
            "startedAt": r.get::<_, Option<String>>("started_at")?, "endedAt": r.get::<_, Option<String>>("ended_at")?,
        })))?;
    let events = rows(conn, "SELECT * FROM event WHERE runtime=?1 ORDER BY sequence DESC LIMIT 100", [runtime], event_json)?;
    let sequence: i64 = conn.query_row("SELECT COALESCE(MAX(sequence),0) FROM event WHERE runtime=?1", [runtime], |r| r.get(0))?;
    let limits = conn.query_row("SELECT * FROM usage_limit WHERE runtime=?1", [runtime], |r| Ok(json!({
        "fiveHourPct": r.get::<_, Option<f64>>("five_hour_pct")?, "fiveHourResetsAt": r.get::<_, Option<String>>("five_hour_resets_at")?,
        "weekPct": r.get::<_, Option<f64>>("week_pct")?, "weekResetsAt": r.get::<_, Option<String>>("week_resets_at")?,
        "updatedAt": r.get::<_, String>("updated_at")?,
    }))).optional()?;
    Ok(json!({ "runtime": runtime, "sequence": sequence.to_string(), "sessions": sessions, "tasks": tasks,
        "tools": tools, "events": events, "limits": limits }))
}

/// Events after a cursor (ascending) or the latest 200 (descending), optionally for one session.
pub fn events(conn: &Connection, runtime: &str, after: Option<i64>, session_id: Option<&str>) -> rusqlite::Result<Value> {
    let order = if after.is_some() { "ASC" } else { "DESC" };
    let sql = format!("SELECT * FROM event WHERE runtime=?1 AND (?2 IS NULL OR session_id=?2) AND (?3 IS NULL OR sequence > ?3)
        ORDER BY sequence {order} LIMIT 200");
    let list = rows(conn, &sql, params![runtime, session_id, after], event_json)?;
    Ok(json!({ "runtime": runtime, "events": list }))
}
