#!/usr/bin/env node

import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { normalizeHook, readLimitedStdin, RUNTIMES } from './normalize.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const runtime = option('--runtime');
  if (!RUNTIMES.has(runtime)) return;
  const raw = await readLimitedStdin();
  if (!raw) return;
  const record = normalizeHook(JSON.parse(raw), runtime, true);
  if (!record) return;
  const outDir = option('--out-dir') ?? join(homedir(), '.local', 'share', 'visual-agent-office', 'probe');
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  await appendFile(join(outDir, `${runtime}.jsonl`), `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

await main().catch(() => {});
