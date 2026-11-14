//! Readers for local runtime transcripts. Only token counts, model names, the session title and
//! the parent's short delegation label are extracted; message text never leaves these functions.

use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

const CONTEXT_TAIL: u64 = 256 * 1024;
const TITLE_TAIL: u64 = 32 * 1024 * 1024;
const SUBAGENT_MAX: u64 = 16 * 1024 * 1024;

fn n(v: &Value) -> i64 { v.as_i64().filter(|x| *x >= 0).unwrap_or(0) }

/// Reads at most `max` bytes: the tail of the file (or its head when `from_start`).
fn read_part(path: &Path, max: u64, from_start: bool) -> Option<String> {
    let mut f = File::open(path).ok()?;
    let size = f.metadata().ok()?.len();
    let len = size.min(max);
    if !from_start { f.seek(SeekFrom::Start(size - len)).ok()?; }
    let mut buf = Vec::with_capacity(len as usize);
    f.take(len).read_to_end(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

fn jsonl(path: &str) -> Option<&Path> { path.ends_with(".jsonl").then(|| Path::new(path)) }

fn window_for(tokens: i64) -> i64 { if tokens > 200_000 { 1_000_000 } else { 200_000 } }

/// Context-window fill of the latest main-thread turn (Claude assistant usage or Codex token_count).
pub fn parse_context(text: &str) -> Option<Map<String, Value>> {
    let (mut model, mut usage): (Option<String>, Option<(i64, Option<i64>)>) = (None, None);
    for line in text.lines().rev() {
        if line.trim().is_empty() { continue; }
        let Ok(row) = serde_json::from_str::<Value>(line) else { continue };
        let msg = &row["message"];
        if usage.is_none() && row["type"] == "assistant" && msg["usage"].is_object() && row["isSidechain"] != true {
            let u = &msg["usage"];
            let tokens = n(&u["input_tokens"]) + n(&u["cache_read_input_tokens"]) + n(&u["cache_creation_input_tokens"]);
            if tokens > 0 { usage = Some((tokens, None)); }
            if let Some(m) = msg["model"].as_str() { model = Some(m.into()); }
        }
        if usage.is_none() && row["payload"]["type"] == "token_count" {
            let info = &row["payload"]["info"];
            let tokens = n(&info["last_token_usage"]["input_tokens"]);
            if tokens > 0 { usage = Some((tokens, Some(n(&info["model_context_window"])).filter(|w| *w > 0))); }
        }
        if model.is_none() { model = row["payload"]["model"].as_str().or(row["model"].as_str()).map(str::to_string); }
        if usage.is_some() && model.is_some() { break; }
    }
    let (tokens, limit) = usage?;
    let mut out = Map::new();
    out.insert("contextTokens".into(), tokens.into());
    out.insert("contextLimit".into(), limit.unwrap_or_else(|| window_for(tokens)).into());
    out.insert("model".into(), json!(model.map(|m| m.chars().take(80).collect::<String>())));
    Some(out)
}

pub fn read_context(path: &str) -> Option<Map<String, Value>> { parse_context(&read_part(jsonl(path)?, CONTEXT_TAIL, false)?) }

/// Latest session name: a user rename wins over the generated title.
pub fn parse_title(text: &str) -> Option<String> {
    let (mut custom, mut ai) = (None, None);
    for line in text.lines().filter(|l| l.contains("Title\"")) {
        let Ok(row) = serde_json::from_str::<Value>(line) else { continue };
        if row["type"] == "custom-title" { if let Some(t) = row["customTitle"].as_str() { custom = Some(t.to_string()); } }
        if row["type"] == "ai-title" { if let Some(t) = row["aiTitle"].as_str() { ai = Some(t.to_string()); } }
    }
    let t = custom.or(ai)?.trim().chars().take(160).collect::<String>();
    (!t.is_empty()).then_some(t)
}

pub fn read_title(path: &str) -> Option<String> { parse_title(&read_part(jsonl(path)?, TITLE_TAIL, false)?) }

/// `<session>.jsonl` -> `<session>/subagents/agent-<id>.{meta.json,jsonl}`; ids are restricted
/// to a safe alphabet so a hook payload cannot point the reader elsewhere.
pub fn subagent_paths(transcript: &str, agent_id: &str) -> Option<(PathBuf, PathBuf)> {
    let safe = !agent_id.is_empty() && agent_id.len() <= 128 && agent_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    let path = jsonl(transcript).filter(|_| safe)?;
    let base = path.with_extension("").join("subagents").join(format!("agent-{agent_id}"));
    Some((base.with_extension("meta.json"), base.with_extension("jsonl")))
}

/// The delegation label the parent wrote (the Agent tool's short description), never the prompt.
pub fn parse_meta(text: &str) -> Option<String> {
    let d = serde_json::from_str::<Value>(text).ok()?["description"].as_str()?.trim().chars().take(160).collect::<String>();
    (!d.is_empty()).then_some(d)
}

/// Token totals of a subagent run, counted once per message id (streamed replies repeat lines).
pub fn parse_usage(text: &str) -> Option<Map<String, Value>> {
    let mut seen = HashSet::new();
    let (mut input, mut read, mut write, mut output, mut last) = (0, 0, 0, 0, 0);
    let mut model: Option<String> = None;
    for line in text.lines().filter(|l| l.contains("\"usage\"")) {
        let Ok(row) = serde_json::from_str::<Value>(line) else { continue };
        let msg = &row["message"];
        if row["type"] != "assistant" || !msg["usage"].is_object() { continue; }
        if let Some(key) = msg["id"].as_str().or(row["uuid"].as_str()) { if !seen.insert(key.to_string()) { continue; } }
        let u = &msg["usage"];
        input += n(&u["input_tokens"]); read += n(&u["cache_read_input_tokens"]);
        write += n(&u["cache_creation_input_tokens"]); output += n(&u["output_tokens"]);
        last = n(&u["input_tokens"]) + n(&u["cache_read_input_tokens"]) + n(&u["cache_creation_input_tokens"]);
        if let Some(m) = msg["model"].as_str() { model = Some(m.chars().take(80).collect()); }
    }
    if seen.is_empty() { return None; }
    let v = json!({ "usageInput": input, "usageCacheRead": read, "usageCacheWrite": write, "usageOutput": output,
        "contextTokens": last, "contextLimit": window_for(last), "model": model });
    v.as_object().cloned()
}

pub fn read_subagent(transcript: &str, agent_id: &str) -> Option<Map<String, Value>> {
    let (meta, run) = subagent_paths(transcript, agent_id)?;
    let mut out = Map::new();
    if let Some(m) = std::fs::read_to_string(meta).ok().as_deref().and_then(parse_meta) { out.insert("mission".into(), m.into()); }
    if let Some(u) = read_part(&run, SUBAGENT_MAX, true).as_deref().and_then(parse_usage) { out.extend(u); }
    (!out.is_empty()).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn context_from_latest_main_turn() {
        let t = [
            r#"{"type":"assistant","message":{"model":"old","usage":{"input_tokens":1}}}"#,
            r#"{"type":"assistant","isSidechain":true,"message":{"usage":{"input_tokens":999999}}}"#,
            r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":10,"cache_read_input_tokens":250000,"cache_creation_input_tokens":5}}}"#,
            r#"{"type":"assistant","isSidechain":true,"message":{"usage":{"input_tokens":7}}}"#,
        ].join("\n");
        let c = parse_context(&t).unwrap();
        assert_eq!(c["contextTokens"], 250015);
        assert_eq!(c["contextLimit"], 1_000_000);
        assert_eq!(c["model"], "claude-opus-5-5");
        let codex = r#"{"payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":5000},"model_context_window":272000}}}"#;
        assert_eq!(parse_context(codex).unwrap()["contextLimit"], 272000);
    }
    #[test]
    fn title_prefers_rename() {
        let t = "{\"type\":\"ai-title\",\"aiTitle\":\"Auto\"}\n{\"type\":\"custom-title\",\"customTitle\":\" Mine \"}\n{\"type\":\"ai-title\",\"aiTitle\":\"Later\"}";
        assert_eq!(parse_title(t).as_deref(), Some("Mine"));
        assert_eq!(parse_title("{\"type\":\"ai-title\",\"aiTitle\":\"Auto\"}").as_deref(), Some("Auto"));
    }
    #[test]
    fn subagent_usage_dedupes_and_paths_are_safe() {
        let t = [
            r#"{"type":"assistant","message":{"id":"m1","model":"claude-haiku-5-5","usage":{"input_tokens":100,"cache_read_input_tokens":50,"output_tokens":5}}}"#,
            r#"{"type":"assistant","message":{"id":"m1","usage":{"input_tokens":100,"cache_read_input_tokens":50,"output_tokens":5}}}"#,
            r#"{"type":"assistant","message":{"id":"m2","usage":{"input_tokens":10,"output_tokens":1}}}"#,
        ].join("\n");
        let u = parse_usage(&t).unwrap();
        assert_eq!((u["usageInput"].as_i64(), u["usageCacheRead"].as_i64(), u["usageOutput"].as_i64()), (Some(110), Some(50), Some(6)));
        assert_eq!(u["contextTokens"], 10);
        assert!(subagent_paths("/p/s.jsonl", "../../etc").is_none());
        let (meta, run) = subagent_paths("/p/s.jsonl", "abc-1").unwrap();
        assert_eq!(meta, PathBuf::from("/p/s/subagents/agent-abc-1.meta.json"));
        assert_eq!(run, PathBuf::from("/p/s/subagents/agent-abc-1.jsonl"));
        assert_eq!(parse_meta(r#"{"description":" Count files "}"#).as_deref(), Some("Count files"));
    }
}
