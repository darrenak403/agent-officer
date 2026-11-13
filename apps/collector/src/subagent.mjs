import { open, readFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

const MAX_BYTES = 16 * 1024 * 1024;
const int = value => Number.isInteger(value) && value >= 0 ? value : 0;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Claude Code keeps each subagent next to its session transcript:
 * <session>.jsonl -> <session>/subagents/agent-<id>.{jsonl,meta.json}
 */
export function subagentPaths(transcriptPath, agentId) {
  if (typeof transcriptPath !== 'string' || !transcriptPath.endsWith('.jsonl') || !SAFE_ID.test(agentId ?? '')) return null;
  const base = join(dirname(transcriptPath), basename(transcriptPath, '.jsonl'), 'subagents', `agent-${agentId}`);
  return { meta: `${base}.meta.json`, transcript: `${base}.jsonl` };
}

/** Delegation label the parent wrote (the Agent tool's short description), never the prompt. */
export function parseMeta(text) {
  try {
    const d = JSON.parse(text)?.description;
    return typeof d === 'string' && d.trim() ? d.trim().slice(0, 160) : null;
  } catch { return null; }
}

/**
 * Token totals of a subagent run. Streamed replies repeat one message across lines,
 * so usage is counted once per message id. Only numbers leave this function.
 */
export function parseUsage(text) {
  const seen = new Set();
  const total = { usageInput: 0, usageCacheRead: 0, usageCacheWrite: 0, usageOutput: 0 };
  let last = null; let model = null;
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let row; try { row = JSON.parse(line); } catch { continue; }
    const msg = row?.message;
    if (row?.type !== 'assistant' || !msg?.usage) continue;
    const key = msg.id ?? row.uuid;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const u = msg.usage;
    total.usageInput += int(u.input_tokens);
    total.usageCacheRead += int(u.cache_read_input_tokens);
    total.usageCacheWrite += int(u.cache_creation_input_tokens);
    total.usageOutput += int(u.output_tokens);
    last = int(u.input_tokens) + int(u.cache_read_input_tokens) + int(u.cache_creation_input_tokens);
    if (typeof msg.model === 'string') model = msg.model.slice(0, 80);
  }
  if (!seen.size) return null;
  return { ...total, contextTokens: last, contextLimit: last > 200_000 ? 1_000_000 : 200_000, model };
}

export async function readSubagent(transcriptPath, agentId) {
  const paths = subagentPaths(transcriptPath, agentId);
  if (!paths) return null;
  const out = {};
  try { const m = parseMeta(await readFile(paths.meta, 'utf8')); if (m) out.mission = m; } catch {}
  let handle;
  try {
    handle = await open(paths.transcript, 'r');
    const { size } = await handle.stat();
    const length = Math.min(size, MAX_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    const usage = parseUsage(buffer.toString('utf8'));
    if (usage) Object.assign(out, usage);
  } catch {} finally { await handle?.close(); }
  return Object.keys(out).length ? out : null;
}
