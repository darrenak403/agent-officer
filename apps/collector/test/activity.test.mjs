import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeActivity } from '../src/normalize.mjs';

test('uses the agent-written description for commands and delegation', () => {
  assert.equal(summarizeActivity({ tool_name: 'Bash', tool_input: { command: 'cat .env', description: 'Check git status' } }), 'Check git status');
  assert.equal(summarizeActivity({ tool_name: 'Agent', tool_input: { prompt: 'secret plan', description: 'Review API code' } }), 'Review API code');
});
test('keeps only the file name and host, never paths, contents or queries', () => {
  assert.equal(summarizeActivity({ tool_name: 'Edit', tool_input: { file_path: '/Users/me/private/app/page.tsx', old_string: 'x' } }), 'page.tsx');
  assert.equal(summarizeActivity({ tool_name: 'WebFetch', tool_input: { url: 'https://nextjs.org/docs?q=1' } }), 'nextjs.org');
  assert.equal(summarizeActivity({ tool_name: 'Grep', tool_input: { pattern: 'password' } }), null);
  assert.equal(summarizeActivity({ tool_name: 'Bash', tool_input: { command: 'rm -rf x' } }), null);
});
