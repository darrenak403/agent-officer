//! Hook collector, run by Claude Code / Codex as `agent-office hook --runtime <claude|codex>`.
//! Port of apps/collector: normalize the hook, enrich it from local transcripts (numbers and
//! short labels only), POST it to the office server, and spool it if the server is down.

pub mod deliver;
pub mod normalize;
pub mod statusline;
pub mod transcript;

use std::io::Read;
use std::path::Path;

use serde_json::Value;

/// Hooks after which the main thread's context size can have changed.
const CONTEXT_HOOKS: [&str; 6] = ["SessionStart", "UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop", "PreCompact"];
const SUBAGENT_HOOKS: [&str; 4] = ["SubagentStart", "PostToolUse", "PostToolUseFailure", "SubagentStop"];
const TITLE_HOOKS: [&str; 3] = ["SessionStart", "UserPromptSubmit", "Stop"];

/// Builds the enriched event for one hook payload, or None when it is not a hook we track.
pub fn build_event(input: &Value, runtime: &str) -> Option<Value> {
    let mut event = normalize::normalize_hook(input, runtime)?;
    let hook = event["sourceHook"].as_str().unwrap_or_default().to_string();
    let is_main = event["runtimeAgentId"].is_null();
    let transcript = input.get("transcript_path").and_then(Value::as_str);
    let merge = |event: &mut Value, extra: Option<serde_json::Map<String, Value>>| {
        if let Some(extra) = extra { for (k, v) in extra { event[k] = v; } }
    };
    if is_main && CONTEXT_HOOKS.contains(&hook.as_str()) { merge(&mut event, transcript.and_then(transcript::read_context)); }
    if is_main && TITLE_HOOKS.contains(&hook.as_str()) {
        if let Some(title) = transcript.and_then(transcript::read_title) { event["sessionTitle"] = title.into(); }
    }
    if !is_main && SUBAGENT_HOOKS.contains(&hook.as_str()) {
        let agent = event["runtimeAgentId"].as_str().unwrap_or_default().to_string();
        merge(&mut event, transcript.and_then(|t| transcript::read_subagent(t, &agent)));
    }
    Some(event)
}

/// Entry point for the `hook` subcommand. Never fails loudly: a hook must not block the runtime.
pub fn run_hook(runtime: &str, data_dir: &Path) {
    let mut raw = Vec::new();
    let read = std::io::stdin().take(normalize::MAX_INPUT_BYTES as u64 + 1).read_to_end(&mut raw);
    let hook = (|| {
        if read.is_err() || raw.is_empty() || raw.len() > normalize::MAX_INPUT_BYTES { return None; }
        let input: Value = serde_json::from_slice(&raw).ok()?;
        let event = build_event(&input, runtime)?;
        let hook = event["sourceHook"].as_str().map(str::to_string);
        if let Some(token) = deliver::load_token(data_dir) {
            if deliver::post("/api/ingest", &event, &token, 750) { return hook; }
        }
        deliver::spool(data_dir, &event);
        hook
    })();
    // Codex expects a JSON reply from Stop hooks.
    if runtime == "codex" && matches!(hook.as_deref(), Some("Stop" | "SubagentStop")) { println!("{{}}"); }
}
