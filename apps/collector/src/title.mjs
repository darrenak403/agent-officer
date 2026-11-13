import { open } from 'node:fs/promises';

const MAX_BYTES = 32 * 1024 * 1024;

/** Latest session name in a Claude Code transcript: a user rename wins over the generated title. */
export function parseTitle(text) {
  let custom = null; let ai = null;
  for (const line of text.split('\n')) {
    if (!line.includes('Title"')) continue;
    let row; try { row = JSON.parse(line); } catch { continue; }
    if (row?.type === 'custom-title' && typeof row.customTitle === 'string') custom = row.customTitle;
    if (row?.type === 'ai-title' && typeof row.aiTitle === 'string') ai = row.aiTitle;
  }
  const t = (custom ?? ai)?.trim();
  return t ? t.slice(0, 160) : null;
}

export async function readTitle(path) {
  if (typeof path !== 'string' || !path.endsWith('.jsonl')) return null;
  let handle;
  try {
    handle = await open(path, 'r');
    const { size } = await handle.stat();
    const length = Math.min(size, MAX_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return parseTitle(buffer.toString('utf8'));
  } catch { return null; } finally { await handle?.close(); }
}
