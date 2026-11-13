import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContext } from '../src/context.mjs';

test('reads claude usage from the latest main-thread assistant turn', () => {
  const rows = [
    { type: 'assistant', message: { model: 'claude-x', content: 'secret', usage: { input_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 10 } } },
    { type: 'assistant', isSidechain: true, message: { model: 'side', usage: { input_tokens: 999999 } } },
    { type: 'user', message: { content: 'prompt text' } },
  ].map(r => JSON.stringify(r)).join('\n');
  const ctx = parseContext(rows);
  assert.deepEqual(ctx, { contextTokens: 1015, contextLimit: 200000, model: 'claude-x' });
  assert.ok(!JSON.stringify(ctx).includes('secret'));
});

test('reads codex token_count with the reported window', () => {
  const rows = [
    { type: 'turn_context', payload: { model: 'gpt-y' } },
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 150000 }, model_context_window: 258400 } } },
  ].map(r => JSON.stringify(r)).join('\n');
  assert.deepEqual(parseContext(rows), { contextTokens: 150000, contextLimit: 258400, model: 'gpt-y' });
});

test('assumes the 1M window above 200k and ignores garbage', () => {
  const rows = 'not json\n' + JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 300000 } } });
  assert.equal(parseContext(rows).contextLimit, 1000000);
  assert.equal(parseContext('{}'), null);
});
