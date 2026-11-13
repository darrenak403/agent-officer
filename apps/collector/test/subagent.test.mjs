import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeta, parseUsage, subagentPaths } from '../src/subagent.mjs';

test('derives subagent files next to the session transcript', () => {
  assert.deepEqual(subagentPaths('/p/s1.jsonl', 'a12'), { meta: '/p/s1/subagents/agent-a12.meta.json', transcript: '/p/s1/subagents/agent-a12.jsonl' });
  assert.equal(subagentPaths('/p/s1.jsonl', '../x'), null);
});

test('reads only the delegation description', () => {
  assert.equal(parseMeta('{"description":"Scout API","prompt":"SECRET"}'), 'Scout API');
  assert.equal(parseMeta('nope'), null);
});

test('sums usage once per streamed message', () => {
  const u = { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 };
  const rows = [
    { type: 'assistant', message: { id: 'm1', model: 'm', content: 'SECRET', usage: u } },
    { type: 'assistant', message: { id: 'm1', model: 'm', usage: u } },
    { type: 'assistant', message: { id: 'm2', model: 'm', usage: u } },
  ].map(r => JSON.stringify(r)).join('\n');
  const r = parseUsage(rows);
  assert.equal(r.usageInput, 20); assert.equal(r.usageCacheRead, 200); assert.equal(r.usageOutput, 14); assert.equal(r.contextTokens, 115);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});
