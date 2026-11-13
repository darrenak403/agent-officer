#!/usr/bin/env node

import { normalizeHook, readLimitedStdin } from './normalize.mjs';
import { deliver, loadToken, spool } from './deliver.mjs';

let observedHook;
async function main() {
  const runtime = process.argv[process.argv.indexOf('--runtime') + 1];
  const raw = await readLimitedStdin();
  if (!raw) return;
  const event = normalizeHook(JSON.parse(raw), runtime);
  if (!event) return;
  observedHook = event.sourceHook;
  const token = await loadToken();
  try { if (await deliver(event, token)) return; } catch {}
  await spool(event);
}

// Hook failure must never block either coding runtime.
await main().catch(() => {});
if (process.argv.includes('codex') && ['Stop', 'SubagentStop'].includes(observedHook)) process.stdout.write('{}\n');
