#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRequire = createRequire(join(root, 'apps', 'web', 'package.json'));
const { io } = webRequire('socket.io-client');
const token = (await readFile(join(root, '.data', 'ingest-token'), 'utf8')).trim();
const runtimeSessionId = `office-test-${randomUUID()}`;
const baseTime = Date.now();
const at = offset => new Date(baseTime + offset).toISOString();
const socket = io('http://127.0.0.1:4100', { transports: ['websocket'], autoConnect: false, reconnection: false });

async function waitForApi() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4100/api/health', { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Office API did not become healthy within 15 seconds');
}

function envelope(runtime, sourceHook, extra = {}, time = at(0)) {
  const eventId = randomUUID();
  return {
    eventId, schemaVersion: '1.0', runtime, sourceHook, runtimeSessionId,
    runtimeAgentId: null, agentType: null, turnId: null, toolName: null,
    toolUseId: null, taskId: null, taskSubject: null,
    projectPath: null, occurredAt: time, receivedAt: new Date().toISOString(),
    dedupeKey: createHash('sha256').update(eventId).digest('hex'), ...extra,
  };
}

async function post(event) {
  const response = await fetch('http://127.0.0.1:4100/api/ingest', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-office-token': token },
    body: JSON.stringify(event),
  });
  if (response.status !== 202) assert.fail(`Ingest returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function snapshot(runtime) {
  const response = await fetch(`http://127.0.0.1:4100/api/office/snapshot?runtime=${runtime}`);
  assert.equal(response.status, 200);
  return response.json();
}

try {
  await waitForApi();
  socket.connect();
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('Socket.IO connection timed out')), 3000);
  });
  const subscribed = await new Promise(resolve => socket.emit('subscribe', 'claude_code', resolve));
  assert.equal(subscribed.ok, true);
  const realtime = new Promise((resolve, reject) => {
    socket.once('office.event', resolve);
    setTimeout(() => reject(new Error('No realtime office event')), 3000);
  });
  const claudeStart = envelope('claude_code', 'SessionStart', {}, at(0));
  assert.equal((await post(claudeStart)).duplicate, false);
  assert.equal((await realtime).runtime, 'claude_code');
  assert.equal((await post(claudeStart)).duplicate, true);
  await post(envelope('codex', 'SessionStart', {}, at(0)));
  await post(envelope('claude_code', 'SubagentStart', { runtimeAgentId: 'child-test', agentType: 'worker' }, at(1000)));
  await post(envelope('claude_code', 'PreToolUse', { runtimeAgentId: 'child-test', toolName: 'Read', toolUseId: 'tool-test' }, at(3000)));
  await post(envelope('claude_code', 'Stop', { runtimeAgentId: 'child-test' }, at(2000)));
  let claude = await snapshot('claude_code');
  let codex = await snapshot('codex');
  const claudeSession = claude.sessions.find(s => s.runtimeSessionId === runtimeSessionId);
  const codexSession = codex.sessions.find(s => s.runtimeSessionId === runtimeSessionId);
  assert.ok(claudeSession && codexSession);
  assert.notEqual(claudeSession.id, codexSession.id);
  assert.equal(claudeSession.agents.find(a => a.runtimeAgentId === 'child-test').status, 'WORKING');
  assert.equal(claude.tools.find(t => t.toolUseId === 'tool-test').status, 'RUNNING');
  assert.equal(codex.tools.some(t => t.toolUseId === 'tool-test'), false);
  await post(envelope('claude_code', 'PostToolUseFailure', { runtimeAgentId: 'child-test', toolName: 'Read', toolUseId: 'tool-test' }, at(4000)));
  await post(envelope('claude_code', 'TaskCreated', { taskId: 'task-test', taskSubject: 'Integration task' }, at(5000)));
  await post(envelope('claude_code', 'TaskCompleted', { taskId: 'task-test', taskSubject: 'Integration task' }, at(6000)));
  claude = await snapshot('claude_code');
  assert.equal(claude.tools.find(t => t.toolUseId === 'tool-test').status, 'FAILED');
  assert.equal(claude.tasks.find(t => t.runtimeTaskId === 'task-test').status, 'COMPLETED');
  assert.equal(claude.sessions.find(s => s.id === claudeSession.id).agents.find(a => a.runtimeAgentId === 'child-test').status, 'WORKING', 'a failed tool keeps the agent in its turn');
  const historyResponse = await fetch(`http://127.0.0.1:4100/api/office/events?runtime=claude_code&sessionId=${claudeSession.id}`);
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.events.length, 7);
  assert.ok(history.events.every(event => event.sessionId === claudeSession.id));
  const wrongRuntimeResponse = await fetch(`http://127.0.0.1:4100/api/office/events?runtime=codex&sessionId=${claudeSession.id}`);
  assert.equal(wrongRuntimeResponse.status, 200);
  assert.equal((await wrongRuntimeResponse.json()).events.length, 0);
  console.log('Integration passed: runtime isolation, duplicate, late event, tool failure, task projection, session history, realtime.');
} finally {
  socket.disconnect();
  // Test session IDs contain only generated UUID characters and a fixed prefix.
  const safeId = runtimeSessionId.replaceAll("'", "''");
  const sql = `DELETE FROM "Event" WHERE "sessionId" IN (SELECT id FROM "Session" WHERE "runtimeSessionId"='${safeId}'); DELETE FROM "ToolExecution" WHERE "sessionId" IN (SELECT id FROM "Session" WHERE "runtimeSessionId"='${safeId}'); DELETE FROM "Task" WHERE "sessionId" IN (SELECT id FROM "Session" WHERE "runtimeSessionId"='${safeId}'); DELETE FROM "Agent" WHERE "sessionId" IN (SELECT id FROM "Session" WHERE "runtimeSessionId"='${safeId}'); DELETE FROM "Session" WHERE "runtimeSessionId"='${safeId}';`;
  const cleanup = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'office', '-d', 'office', '-c', sql], { cwd: root, encoding: 'utf8' });
  if (cleanup.status !== 0) console.error('Integration test cleanup failed; inspect test sessions in local DB.');
}
