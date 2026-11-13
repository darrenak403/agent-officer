#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = join(root, '.data');
const tokenPath = join(dataDir, 'ingest-token');
const envPath = join(root, '.env');
await mkdir(dataDir, { recursive: true, mode: 0o700 });
let token;
try { token = (await readFile(tokenPath, 'utf8')).trim(); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  token = randomBytes(32).toString('hex');
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600, flag: 'wx' });
}
try {
  const existing = await readFile(envPath, 'utf8');
  const configuredToken = existing.match(/^OFFICE_INGEST_TOKEN=(.+)$/m)?.[1]?.trim();
  if (configuredToken !== token) throw new Error('Existing .env token differs from .data/ingest-token; reconcile them before starting the Office');
}
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const env = `DATABASE_URL=postgresql://office:office_local@postgres:5432/office\nPOSTGRES_PASSWORD=office_local\nOFFICE_INGEST_TOKEN=${token}\nHOST=0.0.0.0\nPORT=4100\n`;
  await writeFile(envPath, env, { mode: 0o600, flag: 'wx' });
}
console.log('Local configuration ready. Secrets are stored in ignored files.');
