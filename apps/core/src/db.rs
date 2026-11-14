//! SQLite schema. Mirrors the Prisma models; ids are UUID text, times are canonical UTC strings.

use rusqlite::Connection;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY, root_path TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY, runtime TEXT NOT NULL, runtime_session_id TEXT NOT NULL,
  project_id TEXT REFERENCES project(id), title TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE',
  started_at TEXT, ended_at TEXT, last_event_at TEXT, created_at TEXT NOT NULL,
  UNIQUE (runtime, runtime_session_id));
CREATE INDEX IF NOT EXISTS session_recent ON session (runtime, last_event_at);
CREATE TABLE IF NOT EXISTS agent (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES session(id), parent_agent_id TEXT,
  runtime_agent_id TEXT, identity_key TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISCOVERED', current_tool TEXT, current_activity TEXT, mission TEXT,
  context_tokens INTEGER, context_limit INTEGER, model TEXT,
  usage_input INTEGER, usage_cache_read INTEGER, usage_cache_write INTEGER, usage_output INTEGER,
  identity_confidence TEXT NOT NULL DEFAULT 'LOW', last_seen_at TEXT, last_applied_at TEXT,
  UNIQUE (session_id, identity_key));
CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES session(id), runtime_task_id TEXT NOT NULL,
  subject TEXT, status TEXT NOT NULL DEFAULT 'PENDING', last_event_at TEXT, created_at TEXT NOT NULL,
  UNIQUE (session_id, runtime_task_id));
CREATE TABLE IF NOT EXISTS tool_execution (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES session(id), agent_id TEXT,
  tool_use_id TEXT NOT NULL, name TEXT NOT NULL, activity TEXT, status TEXT NOT NULL DEFAULT 'RUNNING',
  started_at TEXT, ended_at TEXT, last_event_at TEXT NOT NULL,
  UNIQUE (session_id, tool_use_id));
CREATE INDEX IF NOT EXISTS tool_agent_status ON tool_execution (agent_id, status);
CREATE TABLE IF NOT EXISTS event (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, runtime TEXT NOT NULL,
  dedupe_key TEXT NOT NULL, source_hook TEXT NOT NULL, session_id TEXT, agent_id TEXT,
  tool_name TEXT, task_id TEXT, occurred_at TEXT, received_at TEXT NOT NULL,
  UNIQUE (runtime, dedupe_key));
CREATE INDEX IF NOT EXISTS event_session ON event (session_id, sequence);
CREATE TABLE IF NOT EXISTS usage_limit (
  runtime TEXT PRIMARY KEY, five_hour_pct REAL, five_hour_resets_at TEXT,
  week_pct REAL, week_resets_at TEXT, updated_at TEXT NOT NULL);
"#;

/// Opens (or creates) the database with WAL so readers never block the hook writer.
pub fn open(path: &str) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;")?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

pub fn open_memory() -> rusqlite::Result<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}
