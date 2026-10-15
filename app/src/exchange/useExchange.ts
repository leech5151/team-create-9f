import { useCallback, useEffect, useRef, useState } from 'react';
import { isConfigured } from '../lib/supabase';
import type { LoadState } from '../league/useLeague';
import { EMPTY_EXCHANGE_SNAPSHOT, fetchExchangeSnapshot, type ExchangeSnapshot } from './api';

export interface ExchangeData {
  snapshot: ExchangeSnapshot;
  state: LoadState;
  error: string | null;
  refresh: () => Promise<void>;
}

/** The 교류전 roster and settings, fetched once on mount and after each write. */
export function useExchange(): ExchangeData {
  const [snapshot, setSnapshot] = useState<ExchangeSnapshot>(EMPTY_EXCHANGE_SNAPSHOT);
  const [state, setState] = useState<LoadState>(isConfigured ? 'loading' : 'unconfigured');
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isConfigured) {
      setState('unconfigured');
      return;
    }
    setState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const next = await fetchExchangeSnapshot();
      if (!alive.current) return;
      setSnapshot(next);
      setError(null);
      setState('ready');
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setState('offline');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, state, error, refresh };
}
