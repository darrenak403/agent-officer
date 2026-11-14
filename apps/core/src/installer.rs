//! Adds (or removes) the office hooks in Claude Code and Codex settings. Existing hooks and keys
//! are kept, the file is backed up before every change, and installing twice changes nothing.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

/// Every command we add carries this marker, as did the older Node collector's.
const MARKER: &str = "visual-agent-office:";

const CLAUDE_EVENTS: [&str; 14] = ["SessionStart", "SessionEnd", "UserPromptSubmit", "Notification", "SubagentStart", "SubagentStop",
    "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "StopFailure", "TaskCreated", "TaskCompleted", "TeammateIdle"];
const CODEX_EVENTS: [&str; 8] = ["SessionStart", "SessionEnd", "UserPromptSubmit", "SubagentStart", "SubagentStop", "PreToolUse", "PostToolUse", "Stop"];

pub struct Target { pub runtime: &'static str, pub path: PathBuf, events: &'static [&'static str], statusline: bool }

pub fn targets(home: &Path) -> [Target; 2] {
    [
        Target { runtime: "claude", path: home.join(".claude/settings.json"), events: &CLAUDE_EVENTS, statusline: true },
        Target { runtime: "codex", path: home.join(".codex/hooks.json"), events: &CODEX_EVENTS, statusline: false },
    ]
}

fn quote(s: &str) -> String { format!("'{}'", s.replace('\'', "'\\''")) }

fn is_ours(group: &Value) -> bool {
    group["hooks"].as_array().is_some_and(|hs| hs.iter().any(|h| h["command"].as_str().is_some_and(|c| c.contains(MARKER))))
}

fn read_doc(path: &Path) -> Result<Map<String, Value>, String> {
    match fs::read_to_string(path) {
        Ok(text) if text.trim().is_empty() => Ok(Map::new()),
        Ok(text) => serde_json::from_str::<Value>(&text).ok().and_then(|v| v.as_object().cloned())
            .ok_or_else(|| format!("{} is not a JSON object; left untouched", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Map::new()),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

fn write_doc(path: &Path, doc: &Map<String, Value>) -> Result<(), String> {
    let err = |e: std::io::Error| format!("{}: {e}", path.display());
    if let Some(dir) = path.parent() { fs::create_dir_all(dir).map_err(err)?; }
    if path.exists() {
        let stamp = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%SZ");
        fs::copy(path, path.with_file_name(format!("{}.office-backup-{stamp}", path.file_name().unwrap().to_string_lossy()))).map_err(err)?;
    }
    let tmp = path.with_extension(format!("office-{}.tmp", std::process::id()));
    fs::write(&tmp, format!("{}\n", serde_json::to_string_pretty(doc).unwrap())).map_err(err)?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600)); }
    fs::rename(&tmp, path).map_err(err)
}

/// Rewrites one settings file; returns whether it changed. `exe` is this app's binary.
pub fn apply(t: &Target, exe: &Path, data_dir: &Path, install: bool) -> Result<bool, String> {
    let mut doc = read_doc(&t.path)?;
    let original = doc.clone();
    let hooks = doc.entry("hooks").or_insert_with(|| json!({}));
    let hooks = hooks.as_object_mut().ok_or_else(|| format!("{}: \"hooks\" is not an object", t.path.display()))?;
    let command = format!("{} hook --runtime {} # {MARKER}app", quote(&exe.to_string_lossy()), t.runtime);
    for event in t.events {
        let groups = hooks.get(*event).cloned().unwrap_or_else(|| json!([]));
        let mut kept: Vec<Value> = groups.as_array().ok_or_else(|| format!("{}: hooks.{event} is not a list", t.path.display()))?
            .iter().filter(|g| !is_ours(g)).cloned().collect();
        if install { kept.push(json!({ "hooks": [{ "type": "command", "command": command, "timeout": 3 }] })); }
        if kept.is_empty() { hooks.remove(*event); } else { hooks.insert(event.to_string(), Value::Array(kept)); }
    }
    if hooks.is_empty() { doc.remove("hooks"); }
    if t.statusline { statusline(&mut doc, exe, data_dir, install)?; }
    if doc == original { return Ok(false); }
    write_doc(&t.path, &doc)?;
    Ok(true)
}

/// Our status line reports plan limits, then runs the user's previous one (kept in the data dir).
fn statusline(doc: &mut Map<String, Value>, exe: &Path, data_dir: &Path, install: bool) -> Result<(), String> {
    let next = data_dir.join("statusline-next.sh");
    let current = doc.get("statusLine").and_then(|s| s["command"].as_str()).map(str::to_string);
    // Ours: the app binary or the older Node script of this project.
    let ours = |c: &str| c.contains(MARKER) || c.contains("collector/src/statusline.mjs");
    if install {
        if let Some(prev) = current.as_deref().filter(|c| !ours(c)) {
            fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
            fs::write(&next, format!("{prev}\n")).map_err(|e| e.to_string())?;
        }
        doc.insert("statusLine".into(), json!({ "type": "command", "command": format!("{} statusline # {MARKER}app", quote(&exe.to_string_lossy())) }));
    } else if current.as_deref().is_some_and(ours) {
        match fs::read_to_string(&next).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
            Some(prev) => { doc.insert("statusLine".into(), json!({ "type": "command", "command": prev })); let _ = fs::remove_file(&next); }
            None => { doc.remove("statusLine"); }
        }
    }
    Ok(())
}

/// True when any runtime still calls something other than this binary (or nothing at all).
pub fn needs_install(home: &Path, exe: &Path) -> bool {
    let exe = exe.to_string_lossy().to_string();
    targets(home).iter().any(|t| {
        let doc = read_doc(&t.path).unwrap_or_default();
        !t.events.iter().all(|e| doc.get("hooks").and_then(|h| h.get(*e)).and_then(Value::as_array)
            .is_some_and(|gs| gs.iter().any(|g| is_ours(g) && g.to_string().contains(&exe))))
    })
}

/// Install or remove hooks for every runtime whose config dir exists (or Claude, always).
/// Returns one line per runtime for the user.
pub fn apply_all(home: &Path, exe: &Path, data_dir: &Path, install: bool) -> Vec<String> {
    let mut out = Vec::new();
    for t in targets(home) {
        if install && t.runtime == "codex" && !t.path.parent().is_some_and(Path::exists) { continue; }
        out.push(match apply(&t, exe, data_dir, install) {
            Ok(true) => format!("{}: {}", t.runtime, if install { "đã cài hook" } else { "đã gỡ hook" }),
            Ok(false) => format!("{}: không đổi", t.runtime),
            Err(e) => format!("{}: lỗi - {e}", t.runtime),
        });
    }
    let _ = fs::write(data_dir.join("hooks-consent"), if install { "installed" } else { "declined" });
    out
}

/// None until the user has answered the first-run question once.
pub fn consent(data_dir: &Path) -> Option<bool> {
    fs::read_to_string(data_dir.join("hooks-consent")).ok().map(|s| s.trim() == "installed")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("office-installer-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn install_replaces_node_hooks_keeps_others_and_round_trips() {
        let home = tmp("home");
        let data = home.join("data");
        let exe = PathBuf::from("/Applications/Agent Office.app/Contents/MacOS/agent-office");
        let settings = home.join(".claude/settings.json");
        fs::create_dir_all(settings.parent().unwrap()).unwrap();
        let before = json!({ "theme": "dark", "hooks": {
            "Stop": [{ "hooks": [{ "type": "command", "command": "say done" }] },
                     { "hooks": [{ "type": "command", "command": "node hook.mjs --runtime claude # visual-agent-office:/x/hook.mjs" }] }] },
            "statusLine": { "type": "command", "command": "~/bin/my-line" } });
        fs::write(&settings, before.to_string()).unwrap();
        let [claude, _] = targets(&home);

        assert!(needs_install(&home, &exe));
        assert!(apply(&claude, &exe, &data, true).unwrap());
        assert!(!apply(&claude, &exe, &data, true).unwrap(), "second install is a no-op");
        let doc: Value = serde_json::from_str(&fs::read_to_string(&settings).unwrap()).unwrap();
        let stop = doc["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2);
        assert_eq!(stop[0]["hooks"][0]["command"], "say done");
        assert!(stop[1]["hooks"][0]["command"].as_str().unwrap().starts_with("'/Applications/Agent Office.app/Contents/MacOS/agent-office' hook --runtime claude"));
        assert_eq!(doc["theme"], "dark");
        assert_eq!(doc.as_object().unwrap().keys().next().unwrap(), "theme", "key order kept");
        assert!(doc["statusLine"]["command"].as_str().unwrap().contains("statusline"));
        assert_eq!(fs::read_to_string(data.join("statusline-next.sh")).unwrap().trim(), "~/bin/my-line");
        assert!(fs::read_dir(settings.parent().unwrap()).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().contains("office-backup")));

        assert!(apply(&claude, &exe, &data, false).unwrap());
        let doc: Value = serde_json::from_str(&fs::read_to_string(&settings).unwrap()).unwrap();
        assert_eq!(doc["hooks"]["Stop"], json!([{ "hooks": [{ "type": "command", "command": "say done" }] }]));
        assert_eq!(doc["statusLine"]["command"], "~/bin/my-line");
        assert!(doc["hooks"].get("PreToolUse").is_none());
    }

    #[test]
    fn refuses_to_touch_invalid_files() {
        let home = tmp("bad");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::write(home.join(".codex/hooks.json"), "[1,2]").unwrap();
        let [_, codex] = targets(&home);
        assert!(apply(&codex, Path::new("/bin/agent-office"), &home, true).is_err());
        assert_eq!(fs::read_to_string(home.join(".codex/hooks.json")).unwrap(), "[1,2]");
    }
}
