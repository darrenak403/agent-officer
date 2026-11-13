#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['install', 'uninstall'].includes(mode)) {
  console.error('Usage: node scripts/replay-service.mjs install|uninstall');
  process.exit(2);
}
if (process.platform !== 'darwin') throw new Error('The replay service currently supports macOS LaunchAgents');

const root = fileURLToPath(new URL('../', import.meta.url));
const label = 'dev.visual-agent-office.replay';
const plist = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const launchctl = (...args) => spawnSync('launchctl', args, { encoding: 'utf8' });
const domain = `gui/${process.getuid()}`;

if (mode === 'install') {
  await mkdir(join(root, '.data', 'spool'), { recursive: true, mode: 0o700 });
  await mkdir(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(root, 'apps', 'collector', 'src', 'replay.mjs'))}</string></array>
<key>StartInterval</key><integer>30</integer>
<key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>/dev/null</string>
<key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
`;
  let existing = null;
  try { existing = await readFile(plist, 'utf8'); } catch {}
  if (existing !== content) {
    launchctl('bootout', domain, plist);
    await writeFile(plist, content, { mode: 0o644 });
  }
  const result = launchctl('bootstrap', domain, plist);
  if (result.status !== 0 && !/already|in progress/i.test(result.stderr)) throw new Error(result.stderr || 'launchctl bootstrap failed');
  console.log('Replay LaunchAgent installed (every 30 seconds).');
} else {
  launchctl('bootout', domain, plist);
  try { await unlink(plist); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  console.log('Replay LaunchAgent removed.');
}
