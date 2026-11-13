#!/usr/bin/env node

import { normalizeHook, readLimitedStdin } from './normalize.mjs';
import { deliver, loadToken, spool } from './deliver.mjs';
import { readContext } from './context.mjs';

// Hooks after which the main thread's context size can have changed.
const CONTEXT_HOOKS = new Set(['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'PreCompact']);

let observedHook;
async function main() {
  const runtime = process.argv[process.argv.indexOf('--runtime') + 1];
  const raw = await readLimitedStdin();
  if (!raw) return;
  const input = JSON.parse(raw);
  const event = normalizeHook(input, runtime);
  if (!event) return;
  if (!event.runtimeAgentId && CONTEXT_HOOKS.has(event.sourceHook)) {
    const ctx = await readContext(input.transcript_path);
    if (ctx) Object.assign(event, ctx);
  }
  observedHook = event.sourceHook;
  const token = await loadToken();
  try { if (await deliver(event, token)) return; } catch {}
  await spool(event);
}

// Hook failure must never block either coding runtime.
await main().catch(() => {});
if (process.argv.includes('codex') && ['Stop', 'SubagentStop'].includes(observedHook)) process.stdout.write('{}\n');
