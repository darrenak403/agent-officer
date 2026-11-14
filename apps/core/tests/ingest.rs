use office_core::{db, event::{HookEvent, UsageLimitsEvent}, ingest::{ingest, save_limits, IngestError}, snapshot::{events, snapshot}};
use serde_json::{json, Value};

const SID: &str = "11111111-1111-4111-8111-111111111111";

fn ev(n: u32, hook: &str, extra: Value) -> HookEvent {
    let mut base = json!({
        "eventId": format!("00000000-0000-4000-8000-{n:012}"), "schemaVersion": "1.0", "runtime": "claude_code",
        "sourceHook": hook, "runtimeSessionId": SID, "projectPath": "/Users/me/code/agent-officer",
        "occurredAt": format!("2026-11-14T05:00:{n:02}.000Z"), "receivedAt": format!("2026-11-14T05:00:{n:02}.000Z"),
        "dedupeKey": format!("k{n}"),
    });
    for (k, v) in extra.as_object().unwrap() { base[k] = v.clone(); }
    serde_json::from_value(base).unwrap()
}

fn main_agent(s: &Value) -> &Value { s["sessions"][0]["agents"].as_array().unwrap().iter().find(|a| a["type"] == "MAIN").unwrap() }

#[test]
fn main_turn_tools_and_title() {
    let mut c = db::open_memory().unwrap();
    ingest(&mut c, &ev(1, "SessionStart", json!({ "sessionTitle": "Fix login" }))).unwrap();
    ingest(&mut c, &ev(2, "UserPromptSubmit", json!({}))).unwrap();
    ingest(&mut c, &ev(3, "PreToolUse", json!({ "toolName": "Bash", "toolUseId": "t1", "activity": "Chạy test" }))).unwrap();
    let s = snapshot(&c, "claude_code").unwrap();
    assert_eq!(s["sessions"][0]["title"], "Fix login");
    assert_eq!(s["sessions"][0]["projectName"], "agent-officer");
    assert_eq!(main_agent(&s)["status"], "WORKING");
    assert_eq!(main_agent(&s)["currentTool"], "Bash");
    ingest(&mut c, &ev(4, "PostToolUse", json!({ "toolName": "Bash", "toolUseId": "t1" }))).unwrap();
    ingest(&mut c, &ev(5, "Stop", json!({ "contextTokens": 40000, "contextLimit": 200000, "model": "claude-opus-5-5" }))).unwrap();
    let s = snapshot(&c, "claude_code").unwrap();
    let a = main_agent(&s);
    assert_eq!(a["status"], "IDLE");
    assert_eq!(a["currentTool"], Value::Null);
    assert_eq!(a["currentActivity"], "Chạy test");
    assert_eq!(a["contextTokens"], 40000);
    assert_eq!(s["tools"][0]["status"], "COMPLETED");
    assert_eq!(s["sequence"], "5");
    ingest(&mut c, &ev(6, "SessionEnd", json!({}))).unwrap();
    assert_eq!(snapshot(&c, "claude_code").unwrap()["sessions"][0]["status"], "ENDED");
}

#[test]
fn duplicates_return_original_sequence() {
    let mut c = db::open_memory().unwrap();
    let first = ingest(&mut c, &ev(1, "SessionStart", json!({}))).unwrap();
    let again = ingest(&mut c, &ev(1, "SessionStart", json!({}))).unwrap();
    assert!(!first.duplicate && again.duplicate);
    assert_eq!(first.sequence, again.sequence);
}

#[test]
fn subagent_mission_usage_and_stop() {
    let mut c = db::open_memory().unwrap();
    ingest(&mut c, &ev(1, "PreToolUse", json!({ "toolName": "Agent", "toolUseId": "a1", "activity": "Count files" }))).unwrap();
    ingest(&mut c, &ev(2, "SubagentStart", json!({ "runtimeAgentId": "sub1", "agentType": "Explore" }))).unwrap();
    ingest(&mut c, &ev(3, "SubagentStop", json!({ "runtimeAgentId": "sub1", "usageInput": 40000, "usageCacheRead": 37000, "usageOutput": 1000 }))).unwrap();
    let s = snapshot(&c, "claude_code").unwrap();
    let sub = s["sessions"][0]["agents"].as_array().unwrap().iter().find(|a| a["type"] == "SUBAGENT").unwrap();
    assert_eq!(sub["name"], "Explore");
    assert_eq!(sub["mission"], "Count files");
    assert_eq!(sub["status"], "STOPPED");
    assert_eq!(sub["usage"], json!({ "input": 40000, "cacheRead": 37000, "cacheWrite": 0, "output": 1000 }));
}

#[test]
fn out_of_order_event_does_not_rewind_status() {
    let mut c = db::open_memory().unwrap();
    ingest(&mut c, &ev(5, "Stop", json!({}))).unwrap();
    ingest(&mut c, &ev(2, "UserPromptSubmit", json!({}))).unwrap();
    assert_eq!(main_agent(&snapshot(&c, "claude_code").unwrap())["status"], "IDLE");
}

#[test]
fn rejects_bad_envelopes_and_saves_limits() {
    let mut c = db::open_memory().unwrap();
    let bad = ev(1, "Stop", json!({ "runtime": "gpt" }));
    assert!(matches!(ingest(&mut c, &bad), Err(IngestError::Invalid("runtime"))));
    let unknown = serde_json::from_value::<HookEvent>(json!({ "eventId": "x", "surprise": 1 }));
    assert!(unknown.is_err());
    let l: UsageLimitsEvent = serde_json::from_value(json!({ "runtime": "claude_code", "fiveHourPct": 91.0,
        "fiveHourResetsAt": "2026-11-14T05:30:00+07:00", "weekPct": 17.0, "weekResetsAt": null })).unwrap();
    save_limits(&c, &l).unwrap();
    let s = snapshot(&c, "claude_code").unwrap();
    assert_eq!(s["limits"]["fiveHourPct"], 91.0);
    assert_eq!(s["limits"]["fiveHourResetsAt"], "2026-11-13T22:30:00.000Z");
    assert_eq!(events(&c, "claude_code", None, None).unwrap()["events"].as_array().unwrap().len(), 0);
}

#[test]
fn stop_closes_tools_that_never_got_a_post_event() {
    let mut c = db::open_memory().unwrap();
    ingest(&mut c, &ev(1, "UserPromptSubmit", json!({}))).unwrap();
    // A hook blocked this call, so the runtime never sends PostToolUse for it.
    ingest(&mut c, &ev(2, "PreToolUse", json!({ "toolName": "Bash", "toolUseId": "blocked" }))).unwrap();
    ingest(&mut c, &ev(3, "Stop", json!({}))).unwrap();
    let s = snapshot(&c, "claude_code").unwrap();
    assert_eq!(main_agent(&s)["status"], "IDLE");
    assert_eq!(main_agent(&s)["currentTool"], Value::Null);
    assert_eq!(s["tools"][0]["status"], "INTERRUPTED");
}
