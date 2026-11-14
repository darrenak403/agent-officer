//! Turns a raw hook payload into the HookEvent envelope (same rules as normalize.mjs).

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const MAX_INPUT_BYTES: usize = 128 * 1024;

fn runtime_name(cli: &str) -> Option<&'static str> {
    match cli { "claude" => Some("claude_code"), "codex" => Some("codex"), _ => None }
}

fn safe(v: Option<&Value>, max: usize) -> Option<String> {
    v.and_then(Value::as_str).filter(|s| !s.is_empty() && s.encode_utf16().count() <= max).map(str::to_string)
}

fn clip(s: &str) -> Option<String> {
    let joined = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let out: String = joined.chars().take(160).collect();
    (!out.is_empty()).then_some(out)
}

fn basename(p: &str) -> Option<&str> { p.split(['/', '\\']).filter(|s| !s.is_empty()).last() }

fn hostname(url: &str) -> Option<String> {
    let rest = url.split_once("://")?.1;
    let authority = rest.split(['/', '?', '#']).next()?;
    let host = authority.rsplit('@').next()?;
    let host = if host.starts_with('[') { host.split(']').next()?.trim_start_matches('[') } else { host.split(':').next()? };
    (!host.is_empty()).then(|| host.to_lowercase())
}

/// One short, human summary of a tool call. Prompts, file contents, commands and queries never
/// leave the hook: only the agent's own `description`, a file name, or a web host.
pub fn summarize_activity(input: &Value) -> Option<String> {
    let tool = safe(input.get("tool_name"), 128)?;
    let args = input.get("tool_input")?.as_object()?;
    if let Some(d) = args.get("description").and_then(Value::as_str) { return clip(d); }
    let file = ["file_path", "notebook_path", "path"].iter().find_map(|k| args.get(*k).and_then(Value::as_str)).and_then(basename);
    if let Some(f) = file {
        if matches!(tool.as_str(), "Read" | "Edit" | "MultiEdit" | "Write" | "NotebookEdit" | "apply_patch") { return clip(f); }
    }
    args.get("url").and_then(Value::as_str).and_then(hostname).and_then(|h| clip(&h))
}

pub fn normalize_hook(input: &Value, runtime: &str) -> Option<Value> {
    input.as_object()?;
    let hook = safe(input.get("hook_event_name"), 80)?;
    let session = safe(input.get("session_id"), 256)?;
    let runtime_id = runtime_name(runtime)?;
    let event_id = uuid::Uuid::new_v4().to_string();
    let agent_id = safe(input.get("agent_id"), 256);
    let turn_id = safe(input.get("turn_id"), 256);
    let tool_use_id = safe(input.get("tool_use_id"), 256);
    let occurred = safe(input.get("timestamp"), 40).and_then(|t| crate::time::normalize(&t));
    // Retries of the same tool call collapse to one event; everything else is unique.
    let dedupe_source = match &tool_use_id {
        Some(t) => serde_json::to_string(&json!([runtime, hook, session, agent_id, turn_id, t])).unwrap(),
        None => event_id.clone(),
    };
    let dedupe = format!("{:x}", Sha256::digest(dedupe_source.as_bytes()));
    Some(json!({
        "eventId": event_id, "schemaVersion": "1.0", "runtime": runtime_id,
        "sourceHook": hook, "runtimeSessionId": session, "runtimeAgentId": agent_id,
        "agentType": safe(input.get("agent_type"), 128), "turnId": turn_id,
        "toolName": safe(input.get("tool_name"), 128), "toolUseId": tool_use_id,
        "activity": if hook == "PreToolUse" { summarize_activity(input) } else { None },
        "taskId": safe(input.get("task_id"), 256),
        // Task titles can contain prompt text; only the runtime task id is kept.
        "taskSubject": null,
        "projectPath": safe(input.get("cwd"), 4096), "occurredAt": occurred,
        "contextTokens": null, "contextLimit": null, "model": null,
        "receivedAt": crate::time::now(), "dedupeKey": dedupe,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn activity_never_leaks_paths_or_queries() {
        assert_eq!(summarize_activity(&json!({ "tool_name": "Bash", "tool_input": { "command": "rm -rf x", "description": "Run   the tests" } })).as_deref(), Some("Run the tests"));
        assert_eq!(summarize_activity(&json!({ "tool_name": "Edit", "tool_input": { "file_path": "/Users/me/secret/app.ts" } })).as_deref(), Some("app.ts"));
        assert_eq!(summarize_activity(&json!({ "tool_name": "WebFetch", "tool_input": { "url": "https://user:pw@Docs.Rs:443/a?q=1" } })).as_deref(), Some("docs.rs"));
        assert_eq!(summarize_activity(&json!({ "tool_name": "Grep", "tool_input": { "pattern": "password" } })), None);
    }
    #[test]
    fn same_tool_call_dedupes() {
        let input = json!({ "hook_event_name": "PreToolUse", "session_id": "s", "tool_use_id": "t", "tool_name": "Bash", "cwd": "/x" });
        let a = normalize_hook(&input, "claude").unwrap();
        let b = normalize_hook(&input, "claude").unwrap();
        assert_eq!(a["dedupeKey"], b["dedupeKey"]);
        assert_ne!(a["eventId"], b["eventId"]);
        assert!(normalize_hook(&input, "gpt").is_none());
        assert!(normalize_hook(&json!({ "session_id": "s" }), "claude").is_none());
    }
}
