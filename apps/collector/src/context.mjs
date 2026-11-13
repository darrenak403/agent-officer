import { open } from 'node:fs/promises';

const TAIL_BYTES = 256 * 1024;
const int = value => Number.isInteger(value) && value >= 0 ? value : 0;

/**
 * Context-window fill of the latest turn, read from the tail of the runtime transcript.
 * Only token counts and the model name are extracted; message text never leaves this function.
 */
export function parseContext(text) {
  const lines = text.split('\n').reverse();
  let model = null;
  let usage = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    // Claude Code: assistant messages carry message.usage and message.model.
    const msg = row?.message;
    if (!usage && row?.type === 'assistant' && msg?.usage && !row.isSidechain) {
      const u = msg.usage;
      const tokens = int(u.input_tokens) + int(u.cache_read_input_tokens) + int(u.cache_creation_input_tokens);
      if (tokens > 0) usage = { tokens, limit: null };
      if (typeof msg.model === 'string') model = msg.model;
    }
    // Codex: token_count events report the last turn and the model's window.
    const info = row?.payload?.type === 'token_count' ? row.payload.info : null;
    if (!usage && info?.last_token_usage) {
      const tokens = int(info.last_token_usage.input_tokens);
      if (tokens > 0) usage = { tokens, limit: int(info.model_context_window) || null };
    }
    if (!model && typeof row?.payload?.model === 'string') model = row.payload.model;
    if (!model && typeof row?.model === 'string') model = row.model;
    if (usage && model) break;
  }
  if (!usage) return null;
  // Claude transcripts do not record the window; above 200k the session must be on the 1M window.
  const limit = usage.limit ?? (usage.tokens > 200_000 ? 1_000_000 : 200_000);
  return { contextTokens: usage.tokens, contextLimit: limit, model: model ? model.slice(0, 80) : null };
}

export async function readContext(path) {
  if (typeof path !== 'string' || !path.endsWith('.jsonl')) return null;
  let handle;
  try {
    handle = await open(path, 'r');
    const { size } = await handle.stat();
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return parseContext(buffer.toString('utf8'));
  } catch { return null; } finally { await handle?.close(); }
}
