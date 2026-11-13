import type { AgentStatus, HookEvent } from '@office/contracts';

/**
 * An agent is WORKING for the whole turn: from the prompt (or subagent start) until Stop.
 * Finishing a tool only means the model is reasoning about the next step, not resting.
 * A tool failure is evidence about that tool, not a terminal agent failure.
 */
export function nextAgentStatus(current: AgentStatus, hook: string): AgentStatus {
  if (hook === 'SubagentStart') return 'WORKING';
  if (current === 'STOPPED' || current === 'COMPLETED' || current === 'FAILED') return current;
  switch (hook) {
    case 'UserPromptSubmit':
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure': return 'WORKING';
    case 'Notification':
    case 'PermissionRequest': return 'WAITING';
    case 'StopFailure': return 'FAILED';
    case 'Stop':
    case 'TeammateIdle': return 'IDLE';
    case 'SubagentStop': return 'STOPPED';
    default: return current;
  }
}

export function isTerminalSessionHook(hook: string): boolean {
  return hook === 'SessionEnd';
}

export function hasAgentEvidence(event: HookEvent): boolean {
  return !!event.runtimeAgentId || event.sourceHook === 'SessionStart';
}
