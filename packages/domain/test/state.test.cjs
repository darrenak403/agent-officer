const test = require('node:test');
const assert = require('node:assert/strict');
const { nextAgentStatus, isTerminalSessionHook } = require('../dist/index.js');

test('tool failure does not fail the agent', () => {
  assert.equal(nextAgentStatus('WORKING', 'PostToolUseFailure'), 'WORKING');
});
test('agent keeps working between tools until the turn stops', () => {
  assert.equal(nextAgentStatus('IDLE', 'UserPromptSubmit'), 'WORKING');
  assert.equal(nextAgentStatus('WORKING', 'PostToolUse'), 'WORKING');
  assert.equal(nextAgentStatus('WORKING', 'Notification'), 'WAITING');
  assert.equal(nextAgentStatus('WAITING', 'PreToolUse'), 'WORKING');
});
test('Stop does not end a session', () => {
  assert.equal(nextAgentStatus('WORKING', 'Stop'), 'IDLE');
  assert.equal(isTerminalSessionHook('Stop'), false);
  assert.equal(isTerminalSessionHook('SessionEnd'), true);
});
