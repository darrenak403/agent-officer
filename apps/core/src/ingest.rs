//! Applies one hook event to the store. A line-for-line port of `OfficeService.ingest`.

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::event::{HookEvent, UsageLimitsEvent};
use crate::status::next_agent_status;
use crate::time;

#[derive(Debug, PartialEq)]
pub struct Ingested { pub runtime: String, pub sequence: i64, pub duplicate: bool }

#[derive(Debug)]
pub enum IngestError { Invalid(&'static str), Db(rusqlite::Error) }
impl From<rusqlite::Error> for IngestError { fn from(e: rusqlite::Error) -> Self { IngestError::Db(e) } }

fn new_id() -> String { Uuid::new_v4().to_string() }

pub fn ingest(conn: &mut Connection, e: &HookEvent) -> Result<Ingested, IngestError> {
    e.validate().map_err(IngestError::Invalid)?;
    // Replays from the collector spool are expected; answer with the original sequence.
    if let Some(seq) = conn.query_row("SELECT sequence FROM event WHERE runtime=?1 AND dedupe_key=?2",
        params![e.runtime, e.dedupe_key], |r| r.get::<_, i64>(0)).optional()? {
        return Ok(Ingested { runtime: e.runtime.clone(), sequence: seq, duplicate: true });
    }
    let received = time::normalize(&e.received_at).unwrap();
    let occurred = e.occurred_at.as_deref().and_then(time::normalize);
    let seen = occurred.clone().unwrap_or_else(|| received.clone());
    let hook = e.source_hook.as_str();
    let tx = conn.transaction()?;

    let project_id: Option<String> = match e.project_path.as_deref() {
        Some(path) => {
            let name = path.split('/').filter(|s| !s.is_empty()).last().unwrap_or(path).to_string();
            tx.execute("INSERT INTO project (id, root_path, name) VALUES (?1,?2,?3) ON CONFLICT(root_path) DO NOTHING", params![new_id(), path, name])?;
            Some(tx.query_row("SELECT id FROM project WHERE root_path=?1", [path], |r| r.get(0))?)
        }
        None => None,
    };

    tx.execute(
        "INSERT INTO session (id, runtime, runtime_session_id, project_id, started_at, last_event_at, title, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(runtime, runtime_session_id) DO UPDATE SET
           project_id = COALESCE(excluded.project_id, session.project_id),
           title = COALESCE(?7, session.title)",
        params![new_id(), e.runtime, e.runtime_session_id, project_id,
            if hook == "SessionStart" { Some(&seen) } else { None }, seen, e.session_title, time::now()])?;
    let (session_id, session_last, session_started): (String, Option<String>, Option<String>) = tx.query_row(
        "SELECT id, last_event_at, started_at FROM session WHERE runtime=?1 AND runtime_session_id=?2",
        params![e.runtime, e.runtime_session_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;

    // Main-thread hooks carry no agent id; attribute them to the session's main agent.
    let is_main = e.runtime_agent_id.is_none();
    let identity = e.runtime_agent_id.clone().or_else(|| (!hook.starts_with("Subagent")).then(|| "__main__".to_string()));
    let agent = match &identity {
        Some(key) => {
            tx.execute(
                "INSERT INTO agent (id, session_id, identity_key, runtime_agent_id, name, type, status, identity_confidence, last_seen_at)
                 VALUES (?1,?2,?3,?4,?5,?6,'DISCOVERED',?7,?8) ON CONFLICT(session_id, identity_key) DO NOTHING",
                params![new_id(), session_id, key, e.runtime_agent_id,
                    if is_main { "Main Agent".to_string() } else { e.agent_type.clone().unwrap_or_else(|| "Subagent".into()) },
                    if is_main { "MAIN" } else { "SUBAGENT" },
                    if e.runtime_agent_id.is_some() { "HIGH" } else { "MEDIUM" }, seen])?;
            Some(tx.query_row(
                "SELECT id, status, type, name, mission, last_applied_at FROM agent WHERE session_id=?1 AND identity_key=?2",
                params![session_id, key], |r| Ok(AgentRow { id: r.get(0)?, status: r.get(1)?, kind: r.get(2)?, name: r.get(3)?, mission: r.get(4)?, last_applied: r.get(5)? }))?)
        }
        None => None,
    };

    let task = match (&e.task_id, hook) {
        (Some(tid), "TaskCreated" | "TaskCompleted") => {
            let status = if hook == "TaskCompleted" { "COMPLETED" } else { "PENDING" };
            tx.execute(
                "INSERT INTO task (id, session_id, runtime_task_id, subject, status, last_event_at, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(session_id, runtime_task_id) DO NOTHING",
                params![new_id(), session_id, tid, e.task_subject, status, seen, time::now()])?;
            Some(tx.query_row("SELECT id, subject, last_event_at FROM task WHERE session_id=?1 AND runtime_task_id=?2",
                params![session_id, tid], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?)))?)
        }
        _ => None,
    };

    let tool_status = match hook {
        "PostToolUseFailure" => "FAILED",
        "PostToolUse" => if e.runtime == "codex" { "FINISHED" } else { "COMPLETED" },
        _ => "RUNNING",
    };
    let ended = (tool_status != "RUNNING").then(|| seen.clone());
    let tool = match (&e.tool_use_id, &e.tool_name, hook) {
        (Some(use_id), Some(name), "PreToolUse" | "PostToolUse" | "PostToolUseFailure") => {
            tx.execute(
                "INSERT INTO tool_execution (id, session_id, agent_id, tool_use_id, name, activity, status, started_at, ended_at, last_event_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(session_id, tool_use_id) DO NOTHING",
                params![new_id(), session_id, agent.as_ref().map(|a| &a.id), use_id, name, e.activity, tool_status,
                    (hook == "PreToolUse").then(|| &seen), ended, seen])?;
            Some(tx.query_row("SELECT id, last_event_at, started_at, agent_id FROM tool_execution WHERE session_id=?1 AND tool_use_id=?2",
                params![session_id, use_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?)))?)
        }
        _ => None,
    };

    tx.execute(
        "INSERT INTO event (id, runtime, dedupe_key, source_hook, session_id, agent_id, task_id, tool_name, occurred_at, received_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![new_id(), e.runtime, e.dedupe_key, hook, session_id, agent.as_ref().map(|a| &a.id),
            task.as_ref().map(|t| &t.0), e.tool_name, occurred, received])?;
    let sequence = tx.last_insert_rowid();

    if session_last.as_deref().map_or(true, |l| seen.as_str() >= l) {
        tx.execute(
            "UPDATE session SET last_event_at=?2,
               status = CASE WHEN ?3 THEN 'ENDED' ELSE status END,
               ended_at = CASE WHEN ?3 THEN ?2 ELSE ended_at END,
               started_at = CASE WHEN ?4 THEN ?2 ELSE started_at END
             WHERE id=?1",
            params![session_id, seen, hook == "SessionEnd", hook == "SessionStart" && session_started.is_none()])?;
    }
    if let Some((task_id, subject, last)) = &task {
        if last.as_deref().map_or(true, |l| seen.as_str() >= l) {
            tx.execute("UPDATE task SET subject=?2, status=?3, last_event_at=?4 WHERE id=?1",
                params![task_id, e.task_subject.clone().or(subject.clone()), if hook == "TaskCompleted" { "COMPLETED" } else { "PENDING" }, seen])?;
        }
    }
    if let Some((tool_id, last, started, tool_agent)) = &tool {
        if seen.as_str() >= last.as_str() {
            tx.execute(
                "UPDATE tool_execution SET status=?2, ended_at=?3, activity=COALESCE(?4, activity), started_at=?5, last_event_at=?6,
                   agent_id = COALESCE(agent_id, ?7) WHERE id=?1",
                params![tool_id, tool_status, ended, e.activity,
                    if hook == "PreToolUse" { Some(seen.clone()) } else { started.clone() }, seen,
                    if tool_agent.is_none() { agent.as_ref().map(|a| a.id.clone()) } else { None }])?;
        }
    }
    if let Some(a) = &agent {
        if a.last_applied.as_deref().map_or(true, |l| seen.as_str() >= l) {
            apply_agent(&tx, a, e, &session_id, &seen)?;
        }
    }
    tx.commit()?;
    Ok(Ingested { runtime: e.runtime.clone(), sequence, duplicate: false })
}

struct AgentRow { id: String, status: String, kind: String, name: String, mission: Option<String>, last_applied: Option<String> }

fn apply_agent(tx: &rusqlite::Transaction, a: &AgentRow, e: &HookEvent, session_id: &str, seen: &str) -> rusqlite::Result<()> {
    let hook = e.source_hook.as_str();
    let active_tool: Option<String> = tx.query_row(
        "SELECT name FROM tool_execution WHERE agent_id=?1 AND status='RUNNING' ORDER BY started_at DESC LIMIT 1",
        [&a.id], |r| r.get(0)).optional()?;
    // Subagents inherit the description their parent wrote when delegating them.
    let mission = match &e.mission {
        Some(m) => Some(m.clone()),
        None if hook == "SubagentStart" && a.mission.is_none() => tx.query_row(
            "SELECT activity FROM tool_execution WHERE session_id=?1 AND name IN ('Agent','Task') AND status='RUNNING'
               AND activity IS NOT NULL ORDER BY started_at DESC LIMIT 1", [session_id], |r| r.get(0)).optional()?,
        None => None,
    };
    let latest_activity: Option<Option<String>> = match &e.tool_use_id {
        Some(use_id) => tx.query_row("SELECT activity FROM tool_execution WHERE session_id=?1 AND tool_use_id=?2",
            params![session_id, use_id], |r| r.get(0)).optional()?,
        None => None,
    };
    // A new prompt starts fresh; otherwise keep the last thing done while the agent reasons or rests.
    let (set_activity, activity) = if hook == "UserPromptSubmit" { (true, None) }
        else if let Some(act) = latest_activity { (true, act) } else { (false, None) };
    let status = if active_tool.is_some() { "WORKING".to_string() } else { next_agent_status(&a.status, hook) };
    let rename = (e.agent_type.is_some() && a.kind == "SUBAGENT" && a.name == "Subagent").then(|| e.agent_type.clone()).flatten();
    tx.execute(
        "UPDATE agent SET
           mission = COALESCE(?2, mission),
           usage_input = CASE WHEN ?3 IS NOT NULL THEN ?3 ELSE usage_input END,
           usage_cache_read = CASE WHEN ?3 IS NOT NULL THEN COALESCE(?4, 0) ELSE usage_cache_read END,
           usage_cache_write = CASE WHEN ?3 IS NOT NULL THEN COALESCE(?5, 0) ELSE usage_cache_write END,
           usage_output = CASE WHEN ?3 IS NOT NULL THEN COALESCE(?6, 0) ELSE usage_output END,
           context_tokens = CASE WHEN ?7 IS NOT NULL THEN ?7 ELSE context_tokens END,
           context_limit = CASE WHEN ?7 IS NOT NULL THEN ?8 ELSE context_limit END,
           model = CASE WHEN ?7 IS NOT NULL THEN ?9 ELSE model END,
           name = COALESCE(?10, name),
           current_activity = CASE WHEN ?11 THEN ?12 ELSE current_activity END,
           status = ?13, current_tool = ?14, last_seen_at = ?15, last_applied_at = ?15
         WHERE id = ?1",
        params![a.id, mission, e.usage_input, e.usage_cache_read, e.usage_cache_write, e.usage_output,
            e.context_tokens, e.context_limit, e.model, rename, set_activity, activity, status, active_tool, seen])?;
    Ok(())
}

/// Stores the latest plan usage limits and returns the current event sequence for the runtime.
pub fn save_limits(conn: &Connection, l: &UsageLimitsEvent) -> Result<(String, i64), IngestError> {
    l.validate().map_err(IngestError::Invalid)?;
    let five = l.five_hour_resets_at.as_deref().and_then(time::normalize);
    let week = l.week_resets_at.as_deref().and_then(time::normalize);
    conn.execute(
        "INSERT INTO usage_limit (runtime, five_hour_pct, five_hour_resets_at, week_pct, week_resets_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(runtime) DO UPDATE SET five_hour_pct=?2, five_hour_resets_at=?3,
           week_pct=?4, week_resets_at=?5, updated_at=?6",
        params![l.runtime, l.five_hour_pct, five, l.week_pct, week, time::now()])?;
    let seq: i64 = conn.query_row("SELECT COALESCE(MAX(sequence),0) FROM event WHERE runtime=?1", [&l.runtime], |r| r.get(0))?;
    Ok((l.runtime.clone(), seq))
}
