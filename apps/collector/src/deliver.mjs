import { appendFile, mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const spoolDir = process.env.OFFICE_SPOOL_DIR ?? join(projectRoot, '.data', 'spool');

export async function loadToken() {
  if (process.env.OFFICE_INGEST_TOKEN) return process.env.OFFICE_INGEST_TOKEN;
  return (await readFile(join(projectRoot, '.data', 'ingest-token'), 'utf8')).trim();
}

export async function deliver(event, token, timeout = 750) {
  const response = await fetch(process.env.OFFICE_API_URL ?? 'http://127.0.0.1:4100/api/ingest', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-office-token': token },
    body: JSON.stringify(event), signal: AbortSignal.timeout(timeout),
  });
  return response.ok;
}

export async function spool(event) {
  await mkdir(spoolDir, { recursive: true, mode: 0o700 });
  await appendFile(join(spoolDir, `${event.runtime}.jsonl`), `${JSON.stringify(event)}\n`, { mode: 0o600 });
}

export async function replay(runtime, token) {
  const source = join(spoolDir, `${runtime}.jsonl`);
  const processing = join(spoolDir, `${runtime}.${process.pid}.processing`);
  try { await rename(source, processing); } catch { return 0; }
  const lines = (await readFile(processing, 'utf8')).split('\n').filter(Boolean);
  let delivered = 0;
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.runtime !== runtime || !(await deliver(event, token, 2000))) await spool(event);
      else delivered++;
    } catch {
      try { await appendFile(source, `${line}\n`, { mode: 0o600 }); } catch {}
    }
  }
  await unlink(processing);
  return delivered;
}
