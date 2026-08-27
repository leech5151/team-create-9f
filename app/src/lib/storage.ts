import type { HistoryEntry, Member, Options, ResultView, Screen, Section } from '../types';

const KEY = 'bowling-lane-draw/v1';

/** Everything that survives a reload. Draw phase/roll animation state does not. */
export interface PersistedState {
  roster: Member[];
  attend: Record<string, boolean>;
  opts: Options;
  history: HistoryEntry[];
  game: number;
  /** Which top-level area is open. */
  section: Section;
  screen: Screen;
  /** Current draw's lanes as member ids, so roster edits reconcile on load. */
  laneIds: string[][];
  queue: string[];
  placed: string[];
  resultView: ResultView;
}

/** First run: an empty roster the user fills in themselves. */
export function initialState(): PersistedState {
  return {
    roster: [],
    attend: {},
    opts: { balance: true, gender: true, avoid: true },
    history: [],
    game: 1,
    section: 'home',
    screen: 'roster',
    laneIds: [],
    queue: [],
    placed: [],
    resultView: 'cards',
  };
}

/**
 * Members persisted by earlier versions carry a stored `tier`; it is ignored,
 * since tier is now derived from `avg` at read time.
 */
function parseMember(raw: unknown): Member | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || typeof m.name !== 'string') return null;
  if (m.gender !== '남' && m.gender !== '여') return null;
  if (typeof m.avg !== 'number' || !Number.isFinite(m.avg)) return null;
  return { id: m.id, name: m.name, gender: m.gender, avg: m.avg };
}

const asIdList = (raw: unknown, known: ReadonlySet<string>): string[] =>
  Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string' && known.has(v)) : [];

/**
 * Read persisted state, dropping anything that no longer type-checks or that
 * references a deleted member. A corrupt or absent entry falls back to a fresh
 * empty state.
 */
export function loadState(): PersistedState {
  const fallback = initialState();
  let raw: unknown;
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return fallback;
    raw = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (typeof raw !== 'object' || raw === null) return fallback;
  const s = raw as Record<string, unknown>;

  // A missing roster array means corruption; an *empty* one is a legitimate
  // first-run state and must not be overwritten by the fallback.
  if (!Array.isArray(s.roster)) return fallback;
  const roster = s.roster.map(parseMember).filter((m): m is Member => m !== null);
  const ids = new Set(roster.map((m) => m.id));

  const attend: Record<string, boolean> = {};
  for (const m of roster) {
    const stored = (s.attend as Record<string, unknown> | undefined)?.[m.id];
    attend[m.id] = typeof stored === 'boolean' ? stored : true;
  }

  const storedOpts = (s.opts ?? {}) as Record<string, unknown>;
  const opts: Options = {
    balance: storedOpts.balance !== false,
    gender: storedOpts.gender !== false,
    avoid: storedOpts.avoid !== false,
  };

  const history: HistoryEntry[] = Array.isArray(s.history)
    ? s.history
        .map((h): HistoryEntry | null => {
          if (typeof h !== 'object' || h === null) return null;
          const e = h as Record<string, unknown>;
          if (typeof e.game !== 'number' || !Array.isArray(e.lanes)) return null;
          const lanes = e.lanes.map((l) => asIdList(l, ids)).filter((l) => l.length > 0);
          return lanes.length > 0 ? { game: e.game, lanes } : null;
        })
        .filter((h): h is HistoryEntry => h !== null)
    : [];

  const laneIds = Array.isArray(s.laneIds)
    ? s.laneIds.map((l) => asIdList(l, ids)).filter((l) => l.length > 0)
    : [];
  const queue = asIdList(s.queue, ids);
  const placedIds = new Set(queue);
  const placed = asIdList(s.placed, ids).filter((id) => placedIds.has(id));

  const screen: Screen =
    s.screen === 'roster' || s.screen === 'draw' || s.screen === 'result' || s.screen === 'history'
      ? s.screen
      : 'roster';

  return {
    roster,
    attend,
    opts,
    history,
    game: typeof s.game === 'number' && s.game >= 1 ? Math.floor(s.game) : 1,
    section: s.section === 'teams' ? 'teams' : 'home',
    // A draw screen with no lanes has nothing to show — send it back to 명단.
    screen: laneIds.length === 0 && (screen === 'draw' || screen === 'result') ? 'roster' : screen,
    laneIds,
    queue,
    placed,
    resultView: s.resultView === 'board' ? 'board' : 'cards',
  };
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or private-mode failure — the app still works, it just won't persist.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
