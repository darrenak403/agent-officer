import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hook = fileURLToPath(new URL('../src/hook.mjs', import.meta.url));

test('failed delivery spools only allowlisted event metadata and exits cleanly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'office-spool-'));
  try {
    const result = spawnSync(process.execPath, [hook, '--runtime', 'codex'], {
      env: { ...process.env, OFFICE_INGEST_TOKEN: 'test-token', OFFICE_API_URL: 'http://127.0.0.1:9/ingest', OFFICE_SPOOL_DIR: dir },
      input: JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 'session-1', agent_id: 'child-1', prompt: 'PRIVATE_PROMPT', tool_input: 'PRIVATE_INPUT', task_subject: 'PRIVATE_TASK' }),
      encoding: 'utf8', timeout: 3000,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    const saved = readFileSync(join(dir, 'codex.jsonl'), 'utf8');
    assert.doesNotMatch(saved, /PRIVATE_/);
    const event = JSON.parse(saved);
    assert.equal(event.runtime, 'codex');
    assert.equal(event.runtimeAgentId, 'child-1');
    assert.equal(event.schemaVersion, '1.0');
    assert.match(event.dedupeKey, /^[a-f0-9]{64}$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('replay sends a spooled event once and clears the spool', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'office-replay-'));
  const received = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received.push(JSON.parse(body));
    response.writeHead(202).end('{}');
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.OFFICE_SPOOL_DIR = dir;
    process.env.OFFICE_API_URL = `http://127.0.0.1:${server.address().port}/api/ingest`;
    const { spool, replay } = await import(`../src/deliver.mjs?test=${Date.now()}`);
    const event = { runtime: 'codex', sourceHook: 'SessionStart', runtimeSessionId: 'replay-test' };
    await spool(event);
    assert.equal(await replay('codex', 'test-token'), 1);
    assert.deepEqual(received, [event]);
    assert.equal(existsSync(join(dir, 'codex.jsonl')), false);
  } finally {
    delete process.env.OFFICE_SPOOL_DIR;
    delete process.env.OFFICE_API_URL;
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
