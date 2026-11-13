import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./setup-hooks.mjs', import.meta.url));

test('hook setup preserves existing handlers and uninstall removes only Office handlers', () => {
  const home = mkdtempSync(join(tmpdir(), 'office-hooks-home-'));
  const sentinel = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo existing-hook' }] }] } };
  try {
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.codex'));
    for (const config of [join(home, '.claude', 'settings.json'), join(home, '.codex', 'hooks.json')]) writeFileSync(config, JSON.stringify(sentinel));
    for (const mode of ['install', 'uninstall']) {
      const result = spawnSync(process.execPath, [script, mode, 'both'], { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 3000 });
      assert.equal(result.status, 0, result.stderr);
      for (const config of [join(home, '.claude', 'settings.json'), join(home, '.codex', 'hooks.json')]) {
        const data = JSON.parse(readFileSync(config, 'utf8'));
        assert.equal(data.hooks.SessionStart[0].hooks[0].command, 'echo existing-hook');
        assert.equal(data.hooks.SessionStart.length, mode === 'install' ? 2 : 1);
      }
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
