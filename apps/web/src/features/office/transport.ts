'use client';

import { OfficeAccountsSchema, type OfficeAccounts, OfficeEventsResponseSchema, OfficeSnapshotSchema, type OfficeEventsResponse, type OfficeSnapshot, type Runtime } from '@office/contracts';

/**
 * Everything the office UI needs from its backend. It talks HTTP and SSE to the office
 * server that the desktop app runs on 127.0.0.1:4100.
 */
export type OfficeTransport = {
  snapshot(runtime: Runtime, signal?: AbortSignal): Promise<OfficeSnapshot>;
  history(runtime: Runtime, sessionId: string, signal?: AbortSignal): Promise<OfficeEventsResponse["events"]>;
  accounts(runtime: Runtime, signal?: AbortSignal): Promise<OfficeAccounts>;
  /** Calls onChange whenever new data may exist; returns an unsubscribe function. */
  subscribe(runtime: Runtime, onChange: () => void, onConnection: (connected: boolean) => void): () => void;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4100';

async function getJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Office API returned ${response.status}`);
  return response.json();
}

export const httpTransport: OfficeTransport = {
  async snapshot(runtime, signal) {
    const parsed = OfficeSnapshotSchema.parse(await getJson(`${api}/api/office/snapshot?runtime=${runtime}`, signal));
    if (parsed.runtime !== runtime) throw new Error('Office API runtime mismatch');
    return parsed;
  },
  async history(runtime, sessionId, signal) {
    const parsed = OfficeEventsResponseSchema.parse(await getJson(`${api}/api/office/events?runtime=${runtime}&sessionId=${encodeURIComponent(sessionId)}`, signal));
    if (parsed.runtime !== runtime) throw new Error('Office history runtime mismatch');
    return parsed.events;
  },
  async accounts(runtime, signal) {
    return OfficeAccountsSchema.parse(await getJson(`${api}/api/office/accounts?runtime=${runtime}`, signal));
  },
  // Server-sent events; EventSource reconnects by itself, e.g. while the app restarts.
  subscribe(runtime, onChange, onConnection) {
    const source = new EventSource(`${api}/api/office/stream?runtime=${runtime}`);
    source.onopen = () => { onConnection(true); onChange(); };
    source.addEventListener('office.event', () => onChange());
    source.onerror = () => onConnection(false);
    return () => { source.close(); onConnection(false); };
  },
};

export const transport: OfficeTransport = httpTransport;
