import { useCallback, useEffect, useRef, useState } from 'react';
import { isConfigured } from '../lib/supabase';
import type { LoadState } from '../league/useLeague';
import { EMPTY_MEETUP_SNAPSHOT, fetchMeetupSnapshot, type MeetupSnapshot } from './api';

export interface MeetupData {
  snapshot: MeetupSnapshot;
  state: LoadState;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Saved 정모 data.
 *
 * Unlike `useLeague` this keeps no offline cache: 팀짜기 works entirely from
 * local state without it, so a failed fetch only means the saved 정모 list is
 * unavailable — there is nothing to keep on screen in its place.
 */
export function useMeetups(): MeetupData {
  const [snapshot, setSnapshot] = useState<MeetupSnapshot>(EMPTY_MEETUP_SNAPSHOT);
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
      const next = await fetchMeetupSnapshot();
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
