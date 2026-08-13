export type Tier = 1 | 2 | 3;
export type Gender = '남' | '여';

export const TIERS: readonly Tier[] = [1, 2, 3];

export interface Member {
  /** Stable id — survives renames, unlike the prototype which keyed on name. */
  id: string;
  name: string;
  tier: Tier;
  gender: Gender;
  avg: number;
}

export interface Lane {
  no: number;
  members: Member[];
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

export type Screen = 'roster' | 'draw' | 'result' | 'history';
export type Phase = 'idle' | 'rolling' | 'landed';
export type ResultView = 'cards' | 'board';
