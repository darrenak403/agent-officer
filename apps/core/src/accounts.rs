//! Which Claude and Codex accounts are signed in on this machine, and how much of the plan is used.
//! Reads only local files. Never returns or stores a token: from Codex's auth file it keeps the
//! auth mode and the account claims inside `id_token`; Claude's token lives in the Keychain and is
//! never touched.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

const BLOCK: i64 = 5 * 3600;

fn iso(t: DateTime<Utc>) -> String { t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true) }

/// `{ account, limits, estimate }` for one runtime; any part may be null.
pub fn summary(home: &Path, runtime: &str) -> Value {
    match runtime {
        "codex" => json!({ "account": codex_account(home), "limits": codex_limits(home), "estimate": null }),
        _ => json!({ "account": claude_account(home), "limits": null, "estimate": claude_estimate(home, Utc::now()) }),
    }
}

fn read_json(path: &Path) -> Option<Value> {
    // Both files are small; refuse anything unexpectedly large.
    let meta = std::fs::metadata(path).ok()?;
    if meta.len() > 8 * 1024 * 1024 { return None; }
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn text(v: &Value) -> Option<String> { v.as_str().filter(|s| !s.is_empty()).map(str::to_string) }

fn claude_account(home: &Path) -> Value {
    let Some(a) = read_json(&home.join(".claude.json")).and_then(|d| d.get("oauthAccount").cloned()) else { return Value::Null };
    // organizationType names the plan ("claude_pro", "claude_max"); the tier adds the Max multiplier.
    let tier = [text(&a["organizationType"]), text(&a["userRateLimitTier"]), text(&a["organizationRateLimitTier"])]
        .into_iter().flatten().collect::<Vec<_>>().join("_");
    let tier = (!tier.is_empty()).then_some(tier);
    json!({
        "email": text(&a["emailAddress"]),
        "name": text(&a["displayName"]).or_else(|| text(&a["fullName"])),
        "organization": text(&a["organizationName"]),
        "plan": tier.as_deref().map(claude_plan).or_else(|| text(&a["billingType"])),
    })
}

/// "default_claude_max_20x" → "Max 20x", "default_claude_pro" → "Pro".
fn claude_plan(tier: &str) -> String {
    let t = tier.to_lowercase();
    if t.contains("max") {
        let mult = t.split('_').find(|p| p.ends_with('x') && p[..p.len() - 1].parse::<u32>().is_ok());
        return mult.map(|m| format!("Max {m}")).unwrap_or_else(|| "Max".into());
    }
    if t.contains("pro") { "Pro".into() } else if t.contains("team") { "Team".into() } else if t.contains("enterprise") { "Enterprise".into() } else { tier.into() }
}

/// Decodes the JWT payload (base64url, no padding) without checking the signature: these are
/// display-only claims from a file the user's own Codex wrote.
fn jwt_claims(jwt: &str) -> Option<Value> {
    let payload = jwt.split('.').nth(1)?;
    let mut bits = 0u32; let mut n = 0; let mut out = Vec::with_capacity(payload.len() * 3 / 4);
    for c in payload.bytes() {
        let v = match c { b'A'..=b'Z' => c - b'A', b'a'..=b'z' => c - b'a' + 26, b'0'..=b'9' => c - b'0' + 52, b'-' | b'+' => 62, b'_' | b'/' => 63, b'=' => break, _ => return None } as u32;
        bits = (bits << 6) | v; n += 6;
        if n >= 8 { n -= 8; out.push((bits >> n) as u8); bits &= (1 << n) - 1; }
    }
    serde_json::from_slice(&out).ok()
}

fn codex_account(home: &Path) -> Value {
    let Some(auth) = read_json(&home.join(".codex/auth.json")) else { return Value::Null };
    let mode = text(&auth["auth_mode"]);
    let claims = auth["tokens"]["id_token"].as_str().and_then(jwt_claims).unwrap_or(Value::Null);
    let openai = &claims["https://api.openai.com/auth"];
    let has_key = auth["OPENAI_API_KEY"].as_str().is_some_and(|k| !k.is_empty());
    if mode.is_none() && claims.is_null() && !has_key { return Value::Null; }
    json!({
        "email": text(&claims["email"]),
        "name": text(&claims["name"]),
        "organization": null,
        "plan": text(&openai["chatgpt_plan_type"]).map(|p| { let mut c = p.chars(); c.next().map(|f| f.to_uppercase().chain(c).collect::<String>()).unwrap_or_default() })
            .or_else(|| (mode.as_deref() == Some("apikey") || has_key).then(|| "API key".to_string())),
    })
}

/// Codex writes the real plan usage into each session log; take the newest one.
fn codex_limits(home: &Path) -> Value {
    let root = home.join(".codex/sessions");
    let today = Utc::now().date_naive();
    let mut files: Vec<(SystemTime, PathBuf)> = Vec::new();
    for back in 0..3 {
        let d = today - chrono::Days::new(back);
        let dir = root.join(d.format("%Y/%m/%d").to_string());
        for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
            if let Ok(m) = e.metadata().and_then(|m| m.modified()) { files.push((m, e.path())); }
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));
    for (modified, path) in files.into_iter().take(5) {
        // Some token_count events carry empty limits; take the newest one with numbers.
        let Some(v) = tail_lines(&path, 512 * 1024).into_iter().rev()
            .filter(|l| l.contains("\"used_percent\""))
            .filter_map(|l| serde_json::from_str::<Value>(&l).ok())
            .find(|v| v["payload"]["rate_limits"]["primary"]["used_percent"].is_number()) else { continue };
        let rl = &v["payload"]["rate_limits"];
        let window = |w: &Value| -> (Value, Value) {
            let reset = w["resets_at"].as_i64().and_then(|s| DateTime::<Utc>::from_timestamp(s, 0));
            // The log may predate the reset; once that time has passed the window is empty again.
            if reset.is_some_and(|r| r <= Utc::now()) { return (json!(0.0), Value::Null); }
            let pct = w["used_percent"].as_f64().map(|p| json!(p.clamp(0.0, 100.0))).unwrap_or(Value::Null);
            (pct, reset.map(|t| json!(iso(t))).unwrap_or(Value::Null))
        };
        let (five, five_at) = window(&rl["primary"]);
        let (week, week_at) = window(&rl["secondary"]);
        let updated: DateTime<Utc> = modified.into();
        return json!({ "fiveHourPct": five, "fiveHourResetsAt": five_at, "weekPct": week, "weekResetsAt": week_at, "updatedAt": iso(updated) });
    }
    Value::Null
}

fn tail_lines(path: &Path, max: u64) -> Vec<String> {
    let Ok(mut f) = File::open(path) else { return vec![] };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(max);
    if f.seek(SeekFrom::Start(start)).is_err() { return vec![]; }
    let mut buf = String::new();
    if f.take(max).read_to_string(&mut buf).is_err() { return vec![]; }
    let mut lines: Vec<String> = buf.lines().map(str::to_string).collect();
    if start > 0 && !lines.is_empty() { lines.remove(0); } // first line is cut
    lines
}

/// One assistant reply: when, and the tokens it billed (cache reads are reported apart).
#[derive(Clone)]
struct Usage { at: i64, tokens: u64, cache_read: u64 }

/// Per transcript: bytes already parsed and the replies found, so each refresh reads only new lines.
#[derive(Default)]
struct FileScan { offset: u64, items: Vec<(String, Usage)>, hits: Vec<i64> }

/// How far back to look for 5-hour limit hits that calibrate the percentage.
const CALIBRATE: i64 = 7 * 24 * 3600;

static SCANS: Mutex<Option<HashMap<PathBuf, FileScan>>> = Mutex::new(None);

fn parse_usage(line: &str) -> Option<(String, Usage)> {
    if !line.contains("\"usage\"") { return None; }
    let v: Value = serde_json::from_str(line).ok()?;
    if v["type"] != "assistant" { return None; }
    let u = &v["message"]["usage"];
    let n = |k: &str| u[k].as_u64().unwrap_or(0);
    let at = DateTime::parse_from_rfc3339(v["timestamp"].as_str()?).ok()?.timestamp();
    // Streaming writes the same reply more than once; message id + request id identify it.
    let key = format!("{}:{}", v["message"]["id"].as_str().unwrap_or(""), v["requestId"].as_str().unwrap_or(""));
    Some((key, Usage { at, tokens: n("input_tokens") + n("output_tokens") + n("cache_creation_input_tokens"), cache_read: n("cache_read_input_tokens") }))
}

/// Reset time (unix seconds) of a "5-hour limit reached" error Claude Code wrote into the transcript.
fn parse_limit_hit(line: &str) -> Option<i64> {
    if !line.contains("usage_limit_reached") || !line.contains("five_hour") { return None; }
    let v: Value = serde_json::from_str(line).ok()?;
    fn find(v: &Value) -> Option<i64> {
        match v {
            Value::Object(m) => {
                if m.get("rateLimitType").and_then(Value::as_str) == Some("five_hour") {
                    if let Some(r) = m.get("resetsAt").and_then(Value::as_i64) { return Some(r); }
                }
                m.values().find_map(find)
            }
            Value::Array(a) => a.iter().find_map(find),
            _ => None,
        }
    }
    find(&v)
}

fn scan(path: &Path, state: &mut FileScan) {
    let Ok(f) = File::open(path) else { return };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    if len < state.offset { *state = FileScan::default(); } // rewritten
    let mut r = BufReader::new(f);
    if r.seek(SeekFrom::Start(state.offset)).is_err() { return; }
    let mut line = String::new();
    loop {
        line.clear();
        match r.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if !line.ends_with('\n') { break; } // still being written; read it next time
                state.offset += n as u64;
                if let Some(item) = parse_usage(&line) { state.items.push(item); }
                // Limit errors can carry an (empty) usage block too, so check both.
                if let Some(reset) = parse_limit_hit(&line) { state.hits.push(reset); }
            }
        }
    }
}

fn transcripts(home: &Path, since: SystemTime) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![(home.join(".claude/projects"), 0)];
    while let Some((dir, depth)) = stack.pop() {
        for e in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
            let p = e.path();
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() { if depth < 3 { stack.push((p, depth + 1)); } }
            else if p.extension().is_some_and(|x| x == "jsonl") && meta.modified().is_ok_and(|m| m >= since) { out.push(p); }
        }
    }
    out
}

/// Claude's 5-hour window, estimated the way ccusage does: a block starts at the hour of the first
/// reply after the previous block ended and lasts 5 hours. Counts tokens; the plan's real
/// percentage is only known from the status line.
fn claude_estimate(home: &Path, now: DateTime<Utc>) -> Value {
    let since = SystemTime::now() - Duration::from_secs(CALIBRATE as u64);
    let mut guard = SCANS.lock().unwrap();
    let scans = guard.get_or_insert_with(HashMap::new);
    let files = transcripts(home, since);
    scans.retain(|p, _| files.contains(p));
    let mut seen = HashSet::new();
    let mut items: Vec<Usage> = Vec::new();
    let mut hits: Vec<i64> = Vec::new();
    let now_s = now.timestamp();
    let cutoff = now_s - CALIBRATE;
    for p in files {
        let s = scans.entry(p.clone()).or_default();
        scan(&p, s);
        s.items.retain(|(_, u)| u.at >= cutoff);
        s.hits.retain(|r| *r >= cutoff);
        for (k, u) in &s.items { if seen.insert(k.clone()) { items.push(u.clone()); } }
        hits.extend(&s.hits);
    }
    items.sort_by_key(|u| u.at);
    hits.sort_unstable();
    hits.dedup();
    let sum = |from: i64, to: i64| items.iter().filter(|u| u.at >= from && u.at < to).map(|u| u.tokens).sum::<u64>();
    // Tokens used in a window that ended in a limit hit are what 100% looked like.
    let cap = hits.iter().filter(|r| **r <= now_s).map(|r| sum(r - BLOCK, *r)).max().filter(|c| *c > 0);
    let at = |s: i64| DateTime::<Utc>::from_timestamp(s, 0).map(iso);
    // A hit whose reset is still ahead gives the real window.
    let blocked = hits.iter().copied().find(|r| *r > now_s);
    let start = match blocked {
        Some(r) => Some(r - BLOCK),
        None => {
            let mut start: Option<i64> = None;
            for u in items.iter().filter(|u| u.at >= now_s - 2 * BLOCK) {
                if start.is_none_or(|s| u.at >= s + BLOCK) { start = Some(u.at - u.at.rem_euclid(3600)); }
            }
            start.filter(|s| now_s < s + BLOCK)
        }
    };
    let Some(start) = start else {
        return json!({ "tokens": 0, "cacheRead": 0, "replies": 0, "startedAt": null, "resetsAt": null, "pct": cap.map(|_| 0.0), "calibrations": hits.len() });
    };
    let block: Vec<&Usage> = items.iter().filter(|u| u.at >= start && u.at < start + BLOCK).collect();
    let tokens: u64 = block.iter().map(|u| u.tokens).sum();
    let pct = if blocked.is_some() { Some(100.0) } else { cap.map(|c| (tokens as f64 / c as f64 * 100.0).min(99.0)) };
    json!({ "tokens": tokens, "cacheRead": block.iter().map(|u| u.cache_read).sum::<u64>(), "replies": block.len(),
            "startedAt": at(start), "resetsAt": at(start + BLOCK), "pct": pct, "calibrations": hits.len() })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("office-accounts-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn reads_accounts_without_tokens() {
        let h = home("acct");
        std::fs::write(h.join(".claude.json"), r#"{"oauthAccount":{"emailAddress":"a@b.c","displayName":"A","organizationType":"claude_max","organizationRateLimitTier":"default_claude_max_20x"}}"#).unwrap();
        std::fs::create_dir_all(h.join(".codex")).unwrap();
        // payload {"email":"x@y.z","https://api.openai.com/auth":{"chatgpt_plan_type":"plus"}}
        let id = "h.eyJlbWFpbCI6InhAeS56IiwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS9hdXRoIjp7ImNoYXRncHRfcGxhbl90eXBlIjoicGx1cyJ9fQ.s";
        std::fs::write(h.join(".codex/auth.json"), format!(r#"{{"auth_mode":"chatgpt","tokens":{{"id_token":"{id}","access_token":"SECRET","refresh_token":"SECRET"}}}}"#)).unwrap();
        let c = summary(&h, "claude_code");
        assert_eq!(c["account"]["email"], "a@b.c");
        assert_eq!(c["account"]["plan"], "Max 20x");
        let x = summary(&h, "codex");
        assert_eq!(x["account"]["email"], "x@y.z");
        assert_eq!(x["account"]["plan"], "Plus");
        assert!(!x.to_string().contains("SECRET"));
        std::fs::write(h.join(".claude.json"), r#"{"oauthAccount":{"organizationType":"claude_pro","organizationRateLimitTier":"default_claude_ai"}}"#).unwrap();
        assert_eq!(summary(&h, "claude_code")["account"]["plan"], "Pro");
    }

    #[test]
    fn estimates_the_current_block_once_per_reply() {
        let h = home("est");
        let dir = h.join(".claude/projects/p");
        std::fs::create_dir_all(&dir).unwrap();
        let now = Utc::now();
        let line = |id: &str, mins: i64, out: u64| format!(
            r#"{{"type":"assistant","requestId":"r{id}","timestamp":"{}","message":{{"id":"m{id}","usage":{{"input_tokens":10,"output_tokens":{out},"cache_read_input_tokens":1000}}}}}}"#,
            (now - chrono::Duration::minutes(mins)).to_rfc3339());
        let body = [line("old", 60 * 7, 999), line("1", 30, 90), line("1", 30, 90), line("2", 5, 40)].join("\n") + "\n";
        std::fs::write(dir.join("s.jsonl"), body).unwrap();
        let e = claude_estimate(&h, now);
        assert_eq!(e["replies"], 2);
        assert_eq!(e["tokens"], 150);
        assert_eq!(e["cacheRead"], 2000);
        assert!(e["resetsAt"].is_string());
    }

    #[test]
    fn calibrates_percent_from_a_past_limit_hit() {
        let h = home("cal");
        let dir = h.join(".claude/projects/p");
        std::fs::create_dir_all(&dir).unwrap();
        let now = Utc::now();
        let ts = |mins: i64| (now - chrono::Duration::minutes(mins)).to_rfc3339();
        let reply = |id: &str, mins: i64, out: u64| format!(
            r#"{{"type":"assistant","requestId":"r{id}","timestamp":"{}","message":{{"id":"m{id}","usage":{{"input_tokens":0,"output_tokens":{out}}}}}}}"#, ts(mins));
        // A window 24h ago used 1000 tokens and hit the limit; the current one has used 250.
        let reset = (now - chrono::Duration::hours(24)).timestamp();
        let hit = format!(r#"{{"type":"assistant","error":"usage_limit_reached","apiErrorParams":{{"rate_limit_info":{{"rateLimitType":"five_hour","resetsAt":{reset}}}}}}}"#);
        let lines = [reply("a", 24 * 60 + 120, 1000), hit, reply("b", 30, 250)].join("\n") + "\n";
        std::fs::write(dir.join("t.jsonl"), lines).unwrap();
        let e = claude_estimate(&h, now);
        assert_eq!(e["tokens"], 250);
        assert!((e["pct"].as_f64().unwrap() - 25.0).abs() < 0.01, "{e}");
    }
}
