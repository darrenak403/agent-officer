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

const basename = value => typeof value === 'string' ? value.split(/[\\/]/).filter(Boolean).at(-1) ?? null : null;
const clip = value => value.replace(/\s+/g, ' ').trim().slice(0, 160) || null;

/**
 * One short, human summary of a tool call. Deliberately narrow so prompts, file contents,
 * commands and search queries never leave the machine's hook process:
 * - `description`: the agent's own 3-10 word label (Bash, Agent/Task delegation)
 * - file tools: file name only, never the directory path
 * - web fetch: host name only
 */
export function summarizeActivity(input) {
  const tool = safeString(input.tool_name, 128);
  const args = input.tool_input && typeof input.tool_input === 'object' && !Array.isArray(input.tool_input) ? input.tool_input : null;
  if (!tool || !args) return null;
  if (typeof args.description === 'string') return clip(args.description);
  const file = basename(args.file_path ?? args.notebook_path ?? args.path);
  if (file && /^(Read|Edit|MultiEdit|Write|NotebookEdit|apply_patch)$/.test(tool)) return clip(file);
  if (typeof args.url === 'string') { try { return clip(new URL(args.url).hostname); } catch { return null; } }
  return null;
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
    activity: hook === 'PreToolUse' ? summarizeActivity(input) : null,
    taskId: safeString(input.task_id),
    // Task titles can contain prompt text. Keep only the runtime task ID by default.
    taskSubject: null,
    projectPath: safeString(input.cwd, 4096), occurredAt,
    contextTokens: null, contextLimit: null, model: null,
    receivedAt: new Date().toISOString(),
  };
  return probe ? { ...base, observedIdHash: hash } : { ...base, dedupeKey: hash };
}
