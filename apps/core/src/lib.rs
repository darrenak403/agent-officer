//! Agent Office core: validates hook events, stores them in SQLite and builds the office snapshot.
//! The same library backs the standalone `office-core` server and, later, the Tauri desktop app.

pub mod db;
pub mod event;
pub mod ingest;
pub mod snapshot;
pub mod status;
pub mod time;
