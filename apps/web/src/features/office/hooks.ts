'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { OfficeEventsResponseSchema, OfficeSnapshotSchema, type OfficeSnapshot, type Runtime } from '@office/contracts';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4100';
const empty = (runtime: Runtime): OfficeSnapshot => ({ runtime, sequence: '0', sessions: [], tasks: [], tools: [], events: [] });

export function useOfficeLive(runtime: Runtime, initialRuntime: Runtime, initialSnapshot: OfficeSnapshot, initialAvailable: boolean) {
  const client = useQueryClient();
  const [socketConnected, setSocketConnected] = useState(false);
  const query = useQuery({
    queryKey: ['office', 'snapshot', runtime],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${api}/api/office/snapshot?runtime=${runtime}`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error(`Office API returned ${response.status}`);
      const parsed = OfficeSnapshotSchema.parse(await response.json());
      if (parsed.runtime !== runtime) throw new Error('Office API runtime mismatch');
      return parsed;
    },
    initialData: runtime === initialRuntime && initialAvailable ? initialSnapshot : undefined,
    staleTime: 1000,
    refetchInterval: 10000,
    retry: 1,
  });
  useEffect(() => {
    setSocketConnected(false);
    const socket = io(api, { reconnection: true });
    socket.on('connect', () => { setSocketConnected(true); socket.emit('subscribe', runtime); void client.invalidateQueries({ queryKey: ['office', 'snapshot', runtime] }); });
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('office.event', (event: { runtime?: Runtime }) => {
      if (event.runtime === runtime) void client.invalidateQueries({ queryKey: ['office', 'snapshot', runtime] });
    });
    return () => { socket.disconnect(); setSocketConnected(false); };
  }, [runtime, client]);
  return { snapshot: query.data ?? empty(runtime), available: query.isSuccess, socketConnected, error: query.isError };
}

export function useOfficeHistory(runtime: Runtime, sessionId: string | null) {
  return useQuery({
    queryKey: ['office', 'history', runtime, sessionId], enabled: !!sessionId,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${api}/api/office/events?runtime=${runtime}&sessionId=${sessionId}`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error(`Office history returned ${response.status}`);
      const parsed = OfficeEventsResponseSchema.parse(await response.json());
      if (parsed.runtime !== runtime) throw new Error('Office history runtime mismatch');
      return parsed.events;
    },
    staleTime: 5000,
  });
}
