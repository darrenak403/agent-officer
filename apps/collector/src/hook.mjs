#!/usr/bin/env node

import { normalizeHook, readLimitedStdin } from './normalize.mjs';
import { deliver, loadToken, spool } from './deliver.mjs';
import { readContext } from './context.mjs';
import { readSubagent } from './subagent.mjs';
import { readTitle } from './title.mjs';

// Hooks after which the main thread's context size can have changed.
const CONTEXT_HOOKS = new Set(['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'PreCompact']);

const SUBAGENT_HOOKS = new Set(['SubagentStart', 'PostToolUse', 'PostToolUseFailure', 'SubagentStop']);

const TITLE_HOOKS = new Set(['SessionStart', 'UserPromptSubmit', 'Stop']);

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
  // Session name as the runtime shows it; cheap line filter, read at turn boundaries only.
  if (!event.runtimeAgentId && TITLE_HOOKS.has(event.sourceHook)) {
    const title = await readTitle(input.transcript_path);
    if (title) event.sessionTitle = title;
  }
  // Subagents: mission label and running token totals from their own transcript.
  if (event.runtimeAgentId && SUBAGENT_HOOKS.has(event.sourceHook)) {
    const sub = await readSubagent(input.transcript_path, event.runtimeAgentId);
    if (sub) Object.assign(event, sub);
  }
  observedHook = event.sourceHook;
  const token = await loadToken();
  try { if (await deliver(event, token)) return; } catch {}
  await spool(event);
}

// Hook failure must never block either coding runtime.
await main().catch(() => {});
if (process.argv.includes('codex') && ['Stop', 'SubagentStop'].includes(observedHook)) process.stdout.write('{}\n');
