#!/usr/bin/env node
// Status-line wrapper: reports plan usage limits to the office, then hands the
// untouched payload to the previous status-line command so its output is kept.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadToken, projectRoot } from './deliver.mjs';

const pct = v => typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : null;
// resets_at may be epoch seconds, epoch ms or an ISO string.
const when = v => {
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : typeof v === 'string' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};

/** Only the four limit numbers leave this function; the rest of the payload is ignored. */
export function parseLimits(payload) {
  const r = payload?.rate_limits;
  if (!r || typeof r !== 'object') return null;
  const five = r.five_hour ?? {}; const week = r.seven_day ?? {};
  const out = {
    runtime: 'claude_code',
    fiveHourPct: pct(five.used_percentage), fiveHourResetsAt: when(five.resets_at),
    weekPct: pct(week.used_percentage), weekResetsAt: when(week.resets_at),
  };
  return out.fiveHourPct == null && out.weekPct == null ? null : out;
}

async function report(raw) {
  let limits; try { limits = parseLimits(JSON.parse(raw)); } catch { return; }
  if (!limits) return;
  const url = (process.env.OFFICE_API_URL ?? 'http://127.0.0.1:4100/api/ingest') + '/limits';
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-office-token': await loadToken() },
    body: JSON.stringify(limits), signal: AbortSignal.timeout(1500) });
}

const hm = iso => iso ? new Date(iso).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }) : '?';

/** One status-line row when no other status-line command is chained: model, context and plan windows. */
export function summary(raw) {
  let p; try { p = JSON.parse(raw); } catch { return ''; }
  const l = parseLimits(p);
  const parts = [p?.model?.display_name].filter(Boolean);
  if (l?.fiveHourPct != null) parts.push(`5h ${Math.round(l.fiveHourPct)}% · hồi ${hm(l.fiveHourResetsAt)}`);
  if (l?.weekPct != null) parts.push(`tuần ${Math.round(l.weekPct)}%`);
  return parts.join('  |  ');
}

function forward(raw) {
  const next = join(projectRoot, '.data', 'statusline-next.sh');
  if (!existsSync(next)) { process.stdout.write(summary(raw)); return Promise.resolve(); }
  return new Promise(resolve => {
    const child = spawn('/bin/sh', [next], { stdio: ['pipe', 'inherit', 'ignore'] });
    child.on('close', resolve); child.on('error', resolve);
    child.stdin.end(raw);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunks = []; for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  await Promise.all([report(raw).catch(() => {}), forward(raw)]);
}
