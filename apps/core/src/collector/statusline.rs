//! Status-line wrapper: reports plan usage limits, then prints the previous status line's output
//! (`<data>/statusline-next.sh`) or a one-row summary.

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};

use chrono::{DateTime, FixedOffset, TimeZone, Utc};
use serde_json::{json, Value};

fn pct(v: &Value) -> Option<f64> { v.as_f64().filter(|x| x.is_finite()).map(|x| x.clamp(0.0, 100.0)) }

/// resets_at may be epoch seconds, epoch ms or an ISO string.
fn when(v: &Value) -> Option<String> {
    let t: DateTime<Utc> = match v {
        Value::Number(n) => { let x = n.as_f64()?; let ms = if x < 1e12 { x * 1000.0 } else { x }; Utc.timestamp_millis_opt(ms as i64).single()? }
        Value::String(s) => DateTime::parse_from_rfc3339(s).ok()?.with_timezone(&Utc),
        _ => return None,
    };
    Some(t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// Only the four limit numbers leave this function; the rest of the payload is ignored.
pub fn parse_limits(p: &Value) -> Option<Value> {
    let r = p.get("rate_limits")?.as_object()?;
    let (five, week) = (r.get("five_hour").cloned().unwrap_or(Value::Null), r.get("seven_day").cloned().unwrap_or(Value::Null));
    let (fp, wp) = (pct(&five["used_percentage"]), pct(&week["used_percentage"]));
    if fp.is_none() && wp.is_none() { return None; }
    Some(json!({ "runtime": "claude_code", "fiveHourPct": fp, "fiveHourResetsAt": when(&five["resets_at"]),
        "weekPct": wp, "weekResetsAt": when(&week["resets_at"]) }))
}

fn hm(iso: &Value) -> String {
    let vn = FixedOffset::east_opt(7 * 3600).unwrap();
    iso.as_str().and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map(|t| t.with_timezone(&vn).format("%H:%M").to_string()).unwrap_or_else(|| "?".into())
}

pub fn summary(p: &Value) -> String {
    let mut parts: Vec<String> = p["model"]["display_name"].as_str().map(str::to_string).into_iter().collect();
    if let Some(l) = parse_limits(p) {
        if let Some(f) = l["fiveHourPct"].as_f64() { parts.push(format!("5h {}% · hồi {}", f.round(), hm(&l["fiveHourResetsAt"]))); }
        if let Some(w) = l["weekPct"].as_f64() { parts.push(format!("tuần {}%", w.round())); }
    }
    parts.join("  |  ")
}

pub fn run_statusline(data_dir: &Path) {
    let mut raw = String::new();
    let _ = std::io::stdin().read_to_string(&mut raw);
    let payload: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let report = {
        let (payload, dir) = (payload.clone(), data_dir.to_path_buf());
        std::thread::spawn(move || {
            if let (Some(limits), Some(token)) = (parse_limits(&payload), super::deliver::load_token(&dir)) {
                super::deliver::post("/api/ingest/limits", &limits, &token, 1500);
            }
        })
    };
    let next = data_dir.join("statusline-next.sh");
    if next.exists() {
        if let Ok(mut child) = Command::new("/bin/sh").arg(&next).stdin(Stdio::piped()).stderr(Stdio::null()).spawn() {
            if let Some(mut stdin) = child.stdin.take() { let _ = stdin.write_all(raw.as_bytes()); }
            let _ = child.wait();
        }
    } else {
        print!("{}", summary(&payload));
    }
    let _ = report.join();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_and_summary() {
        let p = json!({ "model": { "display_name": "Opus 5.5" }, "rate_limits": {
            "five_hour": { "used_percentage": 91.4, "resets_at": 1_763_073_000 }, "seven_day": { "used_percentage": 17 } } });
        let l = parse_limits(&p).unwrap();
        assert_eq!(l["fiveHourResetsAt"], "2025-11-13T22:30:00.000Z");
        assert_eq!(l["weekResetsAt"], Value::Null);
        assert_eq!(summary(&p), "Opus 5.5  |  5h 91% · hồi 05:30  |  tuần 17%");
        assert!(parse_limits(&json!({ "rate_limits": {} })).is_none());
    }
}
