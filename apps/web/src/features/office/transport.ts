'use client';

import { io } from 'socket.io-client';
import { OfficeEventsResponseSchema, OfficeSnapshotSchema, type OfficeEventsResponse, type OfficeSnapshot, type Runtime } from '@office/contracts';

/**
 * Everything the office UI needs from its backend. The browser build talks HTTP + socket.io to
 * the local API; the desktop app will supply its own implementation over the Tauri bridge.
 */
export type OfficeTransport = {
  snapshot(runtime: Runtime, signal?: AbortSignal): Promise<OfficeSnapshot>;
  history(runtime: Runtime, sessionId: string, signal?: AbortSignal): Promise<OfficeEventsResponse["events"]>;
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
  subscribe(runtime, onChange, onConnection) {
    const socket = io(api, { reconnection: true });
    socket.on('connect', () => { onConnection(true); socket.emit('subscribe', runtime); onChange(); });
    socket.on('disconnect', () => onConnection(false));
    socket.on('office.event', (event: { runtime?: Runtime }) => { if (event.runtime === runtime) onChange(); });
    return () => { socket.disconnect(); onConnection(false); };
  },
};

export const transport: OfficeTransport = httpTransport;
