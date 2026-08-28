import { EMPTY_SNAPSHOT, type LeagueSnapshot } from './api';

const KEY = 'nineframe/league-cache/v1';

export interface CachedSnapshot {
  snapshot: LeagueSnapshot;
  /** Epoch ms of the last successful fetch, or null when never fetched. */
  fetchedAt: number | null;
}

/**
 * Last known-good league data.
 *
 * Bowling alleys have unreliable wifi, so a failed fetch falls back to this
 * rather than showing an empty league. Anything that fails to parse is
 * discarded — stale-but-valid is useful, malformed is not.
 */
export function readCache(): CachedSnapshot {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return { snapshot: EMPTY_SNAPSHOT, fetchedAt: null };
    const parsed = JSON.parse(text) as Partial<CachedSnapshot>;
    const s = parsed.snapshot;
    if (
      !s ||
      !Array.isArray(s.seasons) ||
      !Array.isArray(s.players) ||
      !Array.isArray(s.teams) ||
      !Array.isArray(s.entries)
    ) {
      return { snapshot: EMPTY_SNAPSHOT, fetchedAt: null };
    }
    return {
      snapshot: s as LeagueSnapshot,
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : null,
    };
  } catch {
    return { snapshot: EMPTY_SNAPSHOT, fetchedAt: null };
  }
}

export function writeCache(snapshot: LeagueSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ snapshot, fetchedAt: Date.now() }));
  } catch {
    // Quota or private mode — the app still works, it just won't survive offline.
  }
}
