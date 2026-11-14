//! Agent status machine, identical to `nextAgentStatus` in packages/domain.

/// An agent is WORKING for the whole turn, from the prompt (or subagent start) until Stop.
/// Finishing a tool only means the model is reasoning; a tool failure is not an agent failure.
pub fn next_agent_status(current: &str, hook: &str) -> String {
    if hook == "SubagentStart" { return "WORKING".into(); }
    if matches!(current, "STOPPED" | "COMPLETED" | "FAILED") { return current.into(); }
    match hook {
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" => "WORKING",
        "Notification" | "PermissionRequest" => "WAITING",
        "StopFailure" => "FAILED",
        "Stop" | "TeammateIdle" => "IDLE",
        "SubagentStop" => "STOPPED",
        _ => current,
    }.into()
}

#[cfg(test)]
mod tests {
    use super::next_agent_status as n;
    #[test]
    fn turn_lifecycle() {
        assert_eq!(n("DISCOVERED", "UserPromptSubmit"), "WORKING");
        assert_eq!(n("WORKING", "PostToolUseFailure"), "WORKING");
        assert_eq!(n("WORKING", "Notification"), "WAITING");
        assert_eq!(n("WORKING", "Stop"), "IDLE");
        assert_eq!(n("WORKING", "SubagentStop"), "STOPPED");
        assert_eq!(n("STOPPED", "PreToolUse"), "STOPPED");
        assert_eq!(n("STOPPED", "SubagentStart"), "WORKING");
        assert_eq!(n("IDLE", "SessionEnd"), "IDLE");
    }
}
