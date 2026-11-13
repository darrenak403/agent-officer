import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const probe = fileURLToPath(new URL('../src/probe.mjs', import.meta.url));

function run(runtime, outDir, input) {
  return spawnSync(process.execPath, [probe, '--runtime', runtime, '--out-dir', outDir], {
    input,
    encoding: 'utf8',
    timeout: 3000,
  });
}

test('stores allowlisted metadata in separate runtime streams', () => {
  const dir = mkdtempSync(join(tmpdir(), 'office-probe-'));
  try {
    const source = JSON.stringify({
      hook_event_name: 'PreToolUse', session_id: 'same-id', agent_id: 'child-1',
      tool_name: 'Bash', tool_use_id: 'tool-1', cwd: '/tmp/project',
      prompt: 'PRIVATE_PROMPT', tool_input: { command: 'PRIVATE_COMMAND' },
      tool_output: 'PRIVATE_OUTPUT', api_key: 'PRIVATE_KEY',
    });
    for (const runtime of ['claude', 'codex']) {
      const result = run(runtime, dir, source);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    }
    assert.deepEqual(readdirSync(dir).sort(), ['claude.jsonl', 'codex.jsonl']);
    const claudeText = readFileSync(join(dir, 'claude.jsonl'), 'utf8');
    const codexText = readFileSync(join(dir, 'codex.jsonl'), 'utf8');
    for (const text of [claudeText, codexText]) {
      assert.doesNotMatch(text, /PRIVATE_/);
      const record = JSON.parse(text);
      assert.equal(record.runtimeAgentId, 'child-1');
      assert.equal(record.toolUseId, 'tool-1');
      assert.equal(record.projectPath, '/tmp/project');
    }
    assert.equal(JSON.parse(claudeText).runtime, 'claude_code');
    assert.equal(JSON.parse(codexText).runtime, 'codex');
    assert.notEqual(JSON.parse(claudeText).observedIdHash, JSON.parse(codexText).observedIdHash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects invalid and oversized input without blocking the runtime', () => {
  const dir = mkdtempSync(join(tmpdir(), 'office-probe-'));
  try {
    for (const source of ['not-json', '{}', 'x'.repeat(130 * 1024)]) {
      const result = run('codex', dir, source);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    }
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
