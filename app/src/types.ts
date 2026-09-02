export type Tier = 1 | 2 | 3;
export type Gender = '남' | '여';

export const TIERS: readonly Tier[] = [1, 2, 3];

/**
 * A club member. Tier is deliberately absent: it is not a stored property but
 * a rank derived from `avg` across whoever is attending — see `assignTiers`.
 */
export interface Member {
  /** Stable id — survives renames, unlike the prototype which keyed on name. */
  id: string;
  name: string;
  gender: Gender;
  avg: number;
}

/** A member paired with the tier they fell into for a given attendance set. */
export interface Ranked extends Member {
  tier: Tier;
}

export interface Lane {
  no: number;
  members: Ranked[];
  avg: number;
}

export interface Options {
  /** Minimise stddev of per-lane averages. */
  balance: boolean;
  /** Spread 여 participants evenly across lanes. */
  gender: boolean;
  /** Penalise pairs that already shared a lane in `history`. */
  avoid: boolean;
}

/** A finished game, kept for the "중복 방지" penalty and the 기록 screen. */
export interface HistoryEntry {
  game: number;
  /** Member ids per lane, lane order preserved. */
  lanes: string[][];
}

/**
 * Top-level area of the app. `home` is the hub; each other value is a feature
 * with its own internal navigation. Add a member here when a feature becomes
 * routable — the hub lists planned ones separately.
 */
export type Section = 'home' | 'teams' | 'league';

/** Screens *within* the 팀짜기 feature. */
export type Screen = 'roster' | 'draw' | 'result' | 'history';

/** Tabs *within* the 상주리그 feature. */
export type LeagueTab = 'main' | 'play' | 'schedule' | 'standings' | 'players' | 'draw';

/**
 * `adminOnly` tabs are hidden from readers entirely rather than shown
 * read-only — 경기설정 exists to configure the league, and everything a
 * participant needs to see is on 경기일정.
 */
export const LEAGUE_TABS: readonly { key: LeagueTab; label: string; adminOnly?: boolean }[] = [
  { key: 'main', label: '메인' },
  { key: 'schedule', label: '경기일정' },
  { key: 'standings', label: '경기순위' },
  { key: 'play', label: '경기설정', adminOnly: true },
  { key: 'draw', label: '팀짜기', adminOnly: true },
  { key: 'players', label: '선수명단' },
];
export type Phase = 'idle' | 'rolling' | 'landed';
export type ResultView = 'cards' | 'board';
