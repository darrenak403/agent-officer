import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLimits } from '../src/statusline.mjs';

test('extracts only usage limits', () => {
  const r = parseLimits({ cwd: '/secret', rate_limits: { five_hour: { used_percentage: 91, resets_at: 1794608400 }, seven_day: { used_percentage: 17.5, resets_at: '2026-11-20T11:00:00Z' } } });
  assert.equal(r.fiveHourPct, 91); assert.equal(r.weekPct, 17.5);
  assert.equal(r.fiveHourResetsAt, new Date(1794608400 * 1000).toISOString());
  assert.ok(!JSON.stringify(r).includes('secret'));
  assert.equal(parseLimits({}), null);
});
