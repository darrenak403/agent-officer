
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OfficeSnapshot, Runtime } from '@office/contracts';
import { transport } from './transport';

export const emptySnapshot = (runtime: Runtime): OfficeSnapshot => ({ runtime, sequence: '0', sessions: [], tasks: [], tools: [], events: [], limits: null });

export function useOfficeLive(runtime: Runtime) {
  const client = useQueryClient();
  const [socketConnected, setSocketConnected] = useState(false);
  const query = useQuery({
    queryKey: ['office', 'snapshot', runtime],
    queryFn: ({ signal }) => transport.snapshot(runtime, signal),
    staleTime: 1000,
    refetchInterval: 10000,
    retry: 1,
  });
  useEffect(() => {
    setSocketConnected(false);
    return transport.subscribe(runtime, () => void client.invalidateQueries({ queryKey: ['office', 'snapshot', runtime] }), setSocketConnected);
  }, [runtime, client]);
  return { snapshot: query.data ?? emptySnapshot(runtime), available: query.isSuccess, socketConnected, error: query.isError };
}

export function useOfficeHistory(runtime: Runtime, sessionId: string | null) {
  return useQuery({
    queryKey: ['office', 'history', runtime, sessionId], enabled: !!sessionId,
    queryFn: ({ signal }) => transport.history(runtime, sessionId!, signal),
    staleTime: 5000,
  });
}

/** Account and plan usage; local file reads, so once a minute is plenty. */
export function useOfficeAccounts(runtime: Runtime) {
  return useQuery({ queryKey: ['office', 'accounts', runtime], queryFn: ({ signal }) => transport.accounts(runtime, signal), refetchInterval: 60000, staleTime: 30000, retry: 1 });
}
