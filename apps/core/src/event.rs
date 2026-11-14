//! Wire formats accepted from the collector, validated like the zod schemas in packages/contracts.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HookEvent {
    pub event_id: String,
    pub schema_version: String,
    pub runtime: String,
    pub source_hook: String,
    pub runtime_session_id: String,
    pub runtime_agent_id: Option<String>,
    pub agent_type: Option<String>,
    pub turn_id: Option<String>,
    pub tool_name: Option<String>,
    pub tool_use_id: Option<String>,
    pub activity: Option<String>,
    pub task_id: Option<String>,
    pub task_subject: Option<String>,
    pub project_path: Option<String>,
    pub occurred_at: Option<String>,
    pub context_tokens: Option<i64>,
    pub context_limit: Option<i64>,
    pub model: Option<String>,
    pub mission: Option<String>,
    pub session_title: Option<String>,
    pub usage_input: Option<i64>,
    pub usage_cache_read: Option<i64>,
    pub usage_cache_write: Option<i64>,
    pub usage_output: Option<i64>,
    pub received_at: String,
    pub dedupe_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UsageLimitsEvent {
    pub runtime: String,
    pub five_hour_pct: Option<f64>,
    pub five_hour_resets_at: Option<String>,
    pub week_pct: Option<f64>,
    pub week_resets_at: Option<String>,
}

pub fn valid_runtime(r: &str) -> bool { r == "claude_code" || r == "codex" }

fn len_ok(v: &Option<String>, max: usize) -> bool {
    v.as_ref().map_or(true, |s| !s.is_empty() && s.chars().count() <= max)
}
fn count_ok(v: Option<i64>, max: i64) -> bool { v.map_or(true, |n| (0..=max).contains(&n)) }
fn time_ok(v: &Option<String>) -> bool { v.as_ref().map_or(true, |s| crate::time::normalize(s).is_some()) }

impl HookEvent {
    /// Same bounds as `HookEvent` in packages/contracts; returns the first violated field.
    pub fn validate(&self) -> Result<(), &'static str> {
        let short = |s: &str| !s.is_empty() && s.chars().count() <= 256;
        if uuid::Uuid::parse_str(&self.event_id).is_err() { return Err("eventId"); }
        if self.schema_version != "1.0" { return Err("schemaVersion"); }
        if !valid_runtime(&self.runtime) { return Err("runtime"); }
        if self.source_hook.is_empty() || self.source_hook.len() > 80 { return Err("sourceHook"); }
        if !short(&self.runtime_session_id) { return Err("runtimeSessionId"); }
        for (v, name) in [(&self.runtime_agent_id, "runtimeAgentId"), (&self.agent_type, "agentType"), (&self.turn_id, "turnId"),
            (&self.tool_name, "toolName"), (&self.tool_use_id, "toolUseId"), (&self.task_id, "taskId")] {
            if !len_ok(v, 256) { return Err(name); }
        }
        if !len_ok(&self.activity, 160) || !len_ok(&self.mission, 160) || !len_ok(&self.session_title, 160) { return Err("text"); }
        if !len_ok(&self.task_subject, 512) { return Err("taskSubject"); }
        if self.project_path.as_ref().is_some_and(|p| p.len() > 4096) { return Err("projectPath"); }
        if !len_ok(&self.model, 80) { return Err("model"); }
        if !count_ok(self.context_tokens, 10_000_000) || self.context_limit.is_some_and(|n| n <= 0 || n > 10_000_000) { return Err("context"); }
        for v in [self.usage_input, self.usage_cache_read, self.usage_cache_write, self.usage_output] {
            if !count_ok(v, i64::MAX) { return Err("usage"); }
        }
        if !time_ok(&self.occurred_at) || crate::time::normalize(&self.received_at).is_none() { return Err("time"); }
        if self.dedupe_key.is_empty() || self.dedupe_key.len() > 128 { return Err("dedupeKey"); }
        Ok(())
    }
}

impl UsageLimitsEvent {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !valid_runtime(&self.runtime) { return Err("runtime"); }
        let pct = |p: Option<f64>| p.map_or(true, |v| (0.0..=100.0).contains(&v));
        if !pct(self.five_hour_pct) || !pct(self.week_pct) { return Err("pct"); }
        if !time_ok(&self.five_hour_resets_at) || !time_ok(&self.week_resets_at) { return Err("resetsAt"); }
        Ok(())
    }
}
