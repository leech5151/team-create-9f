import { useCallback, useEffect, useRef, useState } from 'react';
import { isConfigured } from '../lib/supabase';
import { fetchSnapshot, type LeagueSnapshot } from './api';
import { readCache, writeCache } from './cache';

export type LoadState = 'loading' | 'ready' | 'offline' | 'unconfigured';

export interface LeagueData {
  snapshot: LeagueSnapshot;
  state: LoadState;
  /** When the data on screen was last fetched; null if it never was. */
  fetchedAt: number | null;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * League data with an offline fallback.
 *
 * Renders from cache immediately, then refreshes in the background. A failed
 * refresh downgrades to `offline` and keeps the cached rows on screen instead
 * of blanking the league.
 */
export function useLeague(): LeagueData {
  const initial = useRef(readCache()).current;
  const [snapshot, setSnapshot] = useState<LeagueSnapshot>(initial.snapshot);
  const [fetchedAt, setFetchedAt] = useState<number | null>(initial.fetchedAt);
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
      const next = await fetchSnapshot();
      if (!alive.current) return;
      setSnapshot(next);
      writeCache(next);
      setFetchedAt(Date.now());
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

  return { snapshot, state, fetchedAt, error, refresh };
}
