import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTitle } from '../src/title.mjs';

test('prefers the user rename over the generated title', () => {
  const rows = [{ type: 'ai-title', aiTitle: 'Auto' }, { type: 'user', message: { content: 'SECRET Title"' } }, { type: 'custom-title', customTitle: 'My session' }].map(r => JSON.stringify(r)).join('\n');
  assert.equal(parseTitle(rows), 'My session');
  assert.equal(parseTitle(JSON.stringify({ type: 'ai-title', aiTitle: 'Auto' })), 'Auto');
  assert.equal(parseTitle('{}'), null);
});
