#!/usr/bin/env node

import { loadToken, replay } from './deliver.mjs';

async function main() {
  const token = await loadToken();
  await Promise.all([replay('claude_code', token), replay('codex', token)]);
}

await main().catch(() => {});
