import { createHash, randomUUID } from 'node:crypto';

export const MAX_INPUT_BYTES = 128 * 1024;
export const RUNTIMES = new Map([['claude', 'claude_code'], ['codex', 'codex']]);

function safeString(value, maxLength = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

export async function readLimitedStdin(stream = process.stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function normalizeHook(input, runtime, probe = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const hook = safeString(input.hook_event_name, 80);
  const session = safeString(input.session_id);
  if (!hook || !session || !RUNTIMES.has(runtime)) return null;
  const eventId = randomUUID();
  const agentId = safeString(input.agent_id);
  const turnId = safeString(input.turn_id);
  const toolUseId = safeString(input.tool_use_id);
  const sourceTime = safeString(input.timestamp, 40);
  const occurredAt = sourceTime && !Number.isNaN(Date.parse(sourceTime)) ? new Date(sourceTime).toISOString() : null;
  const dedupeSource = toolUseId ? JSON.stringify([runtime, hook, session, agentId, turnId, toolUseId]) : eventId;
  const hash = createHash('sha256').update(dedupeSource).digest('hex');
  const base = {
    eventId, schemaVersion: probe ? 'probe-1' : '1.0', runtime: RUNTIMES.get(runtime),
    sourceHook: hook, runtimeSessionId: session, runtimeAgentId: agentId,
    agentType: safeString(input.agent_type, 128), turnId,
    toolName: safeString(input.tool_name, 128), toolUseId,
    taskId: safeString(input.task_id),
    // Task titles can contain prompt text. Keep only the runtime task ID by default.
    taskSubject: null,
    projectPath: safeString(input.cwd, 4096), occurredAt,
    receivedAt: new Date().toISOString(),
  };
  return probe ? { ...base, observedIdHash: hash } : { ...base, dedupeKey: hash };
}
