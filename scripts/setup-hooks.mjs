#!/usr/bin/env node

import { readFile, writeFile, rename, copyFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const hookPath = join(root, 'apps', 'collector', 'src', 'hook.mjs');
const mode = process.argv[2];
const target = process.argv[3] ?? 'both';
const definitions = {
  claude: { path: join(homedir(), '.claude', 'settings.json'), events: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Notification', 'SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'StopFailure', 'TaskCreated', 'TaskCompleted', 'TeammateIdle'] },
  codex: { path: join(homedir(), '.codex', 'hooks.json'), events: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse', 'Stop'] },
};
if (!['install', 'uninstall'].includes(mode) || !['claude', 'codex', 'both'].includes(target)) {
  console.error('Usage: node scripts/setup-hooks.mjs install|uninstall [claude|codex|both]');
  process.exit(2);
}

function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
const marker = `visual-agent-office:${hookPath}`;
function isOurs(group) {
  return Array.isArray(group?.hooks) && group.hooks.some(h => typeof h.command === 'string' && h.command.includes(marker));
}

async function health() {
  const response = await fetch('http://127.0.0.1:4100/api/health', { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error('Office API is not healthy; start docker compose first');
}

async function update(runtime) {
  const { path, events } = definitions[runtime];
  await mkdir(dirname(path), { recursive: true });
  let document;
  try { document = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    document = {};
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error(`Invalid config: ${path}`);
  if (!document.hooks) document.hooks = {};
  if (typeof document.hooks !== 'object' || Array.isArray(document.hooks)) throw new Error(`Invalid hooks: ${path}`);
  let changed = false;
  for (const event of events) {
    const groups = document.hooks[event] ?? [];
    if (!Array.isArray(groups)) throw new Error(`Invalid hook event ${event}: ${path}`);
    const kept = groups.filter(group => !isOurs(group));
    if (kept.length !== groups.length) changed = true;
    if (mode === 'install') {
      const command = `${quote(process.execPath)} ${quote(hookPath)} --runtime ${runtime} # ${marker}`;
      kept.push({ hooks: [{ type: 'command', command, timeout: 3 }] });
      changed = true;
    }
    if (kept.length) document.hooks[event] = kept;
    else delete document.hooks[event];
  }
  if (!changed) return console.log(`${runtime}: already clean`);
  try {
    await copyFile(path, `${path}.office-backup-${new Date().toISOString().replaceAll(':', '-')}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${path}.office-${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
  console.log(`${runtime}: ${mode} complete; existing hooks preserved`);
}

if (mode === 'install') await health();
for (const runtime of target === 'both' ? ['claude', 'codex'] : [target]) await update(runtime);
