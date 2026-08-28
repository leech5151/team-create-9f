/** Games per match — fixed by the league format (3게임 + 총점). */
export const GAMES_PER_MATCH = 3;
export type GameNo = 1 | 2 | 3;

export interface LeaguePlayer {
  id: string;
  name: string;
  gender: '남' | '여' | null;
}

export interface LeagueTeam {
  id: string;
  name: string;
}

/**
 * One player's appearance in a match. Handicap is captured per match because
 * the operator re-enters it each week; storing it here keeps past results from
 * shifting when the number changes.
 */
export interface Appearance {
  playerId: string;
  handicap: number;
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
