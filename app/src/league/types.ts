/** Games per match — fixed by the league format (3게임 + 총점). */
export const GAMES_PER_MATCH = 3;
export type GameNo = 1 | 2 | 3;

export interface LeaguePlayer {
  id: string;
  name: string;
  gender: '남' | '여' | null;
  /** Handicap added to every game this player bowls. */
  handicap: number;
  /** Penalty (deduction applied to stronger bowlers). */
  penalty: number;
  /** Average score; null when not recorded yet. */
  avg: number | null;
}

export interface LeagueTeam {
  id: string;
  name: string;
}

/**
 * One player's appearance in a match, paired with the handicap that applies.
 *
 * The handicap is read from the player's registration — it is not stored per
 * match. Editing a player's handicap therefore changes how their past games
 * score, which is what the operator expects from a single source of truth.
 */
export interface Appearance {
  playerId: string;
  /** Added to every game. Magnitude only — never negative. */
  handicap: number;
  /** Subtracted from every game. Magnitude only — never negative. */
  penalty: number;
}

export interface GameScore {
  playerId: string;
  gameNo: GameNo;
  /** Pins actually knocked down, before handicap. */
  pins: number;
}

/** One side of a match: who bowled, with what handicap, and what they scored. */
export interface SideInput {
  teamId: string;
  lineup: Appearance[];
  scores: GameScore[];
}
