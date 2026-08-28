import { GAMES_PER_MATCH, type GameNo, type SideInput } from './types';

/**
 * 상주리그 채점.
 *
 * 형식: 3인 팀전, 팀 1:1. 게임 3개에 각 1승, 3게임 총점에 1승 → 경기당 최대 4승.
 * 핸디캡: 선수별 핸디캡을 매 게임에 더한다 (3게임이면 3번 반영).
 */

const GAME_NOS: readonly GameNo[] = [1, 2, 3];

export interface TeamGame {
  gameNo: GameNo;
  /** Handicap excluded — the "비핸디" figure used as the first tiebreak. */
  scratch: number;
  /** Handicap included — the figure that decides the game. */
  total: number;
}

export interface TeamTally {
  teamId: string;
  games: TeamGame[];
  scratchTotal: number;
  /** Sum of the three handicapped games — contests the 4th point. */
  grandTotal: number;
  /** Best single handicapped game, used as a later tiebreak. */
  highGame: number;
  /** Worst single handicapped game. */
  lowGame: number;
  /**
   * 하이로우: gap between the best and worst game. A wide gap means an
   * inconsistent night, so a *smaller* spread wins the tiebreak.
   *
   * Handicap-invariant by construction: the same lineup handicap is added to
   * all three games, so it cancels out of the difference. Scratch and
   * handicapped spreads are always equal.
   */
  spread: number;
}

/** Per-game and aggregate figures for one side. */
export function tally(side: SideInput): TeamTally {
  const handicapOf = new Map(side.lineup.map((a) => [a.playerId, a.handicap]));

  const games = GAME_NOS.map((gameNo): TeamGame => {
    const rows = side.scores.filter((s) => s.gameNo === gameNo);
    const scratch = rows.reduce((sum, s) => sum + s.pins, 0);
    // Handicap counts once per player per game.
    const handicap = rows.reduce((sum, s) => sum + (handicapOf.get(s.playerId) ?? 0), 0);
    return { gameNo, scratch, total: scratch + handicap };
  });

  const totals = games.map((g) => g.total);
  const highGame = Math.max(...totals);
  const lowGame = Math.min(...totals);
  return {
    teamId: side.teamId,
    games,
    scratchTotal: games.reduce((sum, g) => sum + g.scratch, 0),
    grandTotal: totals.reduce((sum, v) => sum + v, 0),
    highGame,
    lowGame,
    spread: highGame - lowGame,
  };
}

/**
 * Tiebreak chain for a drawn game or a drawn grand total, in the order the
 * league applies it: 비핸디 → 하이로우 → 단게임하이.
 *
 * Each comparator returns a positive number when `a` wins. Editing the order —
 * or a single rule — only means touching this array.
 */
const TIEBREAKS: readonly { name: string; compare: (a: TeamTally, b: TeamTally) => number }[] = [
  // 비핸디: 핸디캡을 뺀 실투 합계가 높은 쪽이 이긴다.
  { name: '비핸디', compare: (a, b) => a.scratchTotal - b.scratchTotal },
  // 하이로우: 최고·최저 게임의 차이. 기복이 작은 쪽이 이기므로 부호가 반대다.
  { name: '하이로우', compare: (a, b) => b.spread - a.spread },
  // 단게임하이: 한 게임 최고점이 높은 쪽이 이긴다.
  { name: '단게임하이', compare: (a, b) => a.highGame - b.highGame },
];

export interface Decision {
  /** 1 = home takes the point, 0 = away, 0.5 = split (every tiebreak drew). */
  home: number;
  away: number;
  /** Which rule settled it — null when the raw scores already differed. */
  brokenBy: string | null;
}

function decide(homeValue: number, awayValue: number, home: TeamTally, away: TeamTally): Decision {
  if (homeValue !== awayValue) {
    return { home: homeValue > awayValue ? 1 : 0, away: homeValue > awayValue ? 0 : 1, brokenBy: null };
  }
  for (const rule of TIEBREAKS) {
    const diff = rule.compare(home, away);
    if (diff !== 0) {
      return { home: diff > 0 ? 1 : 0, away: diff > 0 ? 0 : 1, brokenBy: rule.name };
    }
  }
  // Exhausted every rule: split rather than silently award nobody.
  return { home: 0.5, away: 0.5, brokenBy: '완전 동점' };
}

export interface MatchResult {
  home: TeamTally;
  away: TeamTally;
  /** One decision per game, in game order. */
  gameDecisions: Decision[];
  /** The 4th point, contested on the 3-game handicapped total. */
  totalDecision: Decision;
  homePoints: number;
  awayPoints: number;
}

export function scoreMatch(homeSide: SideInput, awaySide: SideInput): MatchResult {
  const home = tally(homeSide);
  const away = tally(awaySide);

  const gameDecisions = GAME_NOS.map((n) =>
    decide(home.games[n - 1]!.total, away.games[n - 1]!.total, home, away),
  );
  const totalDecision = decide(home.grandTotal, away.grandTotal, home, away);

  const sum = (pick: (d: Decision) => number) =>
    gameDecisions.reduce((acc, d) => acc + pick(d), 0) + pick(totalDecision);

  return {
    home,
    away,
    gameDecisions,
    totalDecision,
    homePoints: sum((d) => d.home),
    awayPoints: sum((d) => d.away),
  };
}

/** Points available per match: one per game plus one for the total. */
export const MAX_POINTS = GAMES_PER_MATCH + 1;

export interface StandingRow {
  teamId: string;
  played: number;
  points: number;
  /** 누적 총득점 (핸디캡 포함) — the standings tiebreak. */
  totalPins: number;
  scratchPins: number;
}

/**
 * Season table. Ordered by points, then by cumulative handicapped pinfall,
 * which is the league's stated tiebreak.
 */
export function standings(results: readonly MatchResult[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  const add = (t: { teamId: string; grandTotal: number; scratchTotal: number }, points: number) => {
    const row = rows.get(t.teamId) ?? {
      teamId: t.teamId,
      played: 0,
      points: 0,
      totalPins: 0,
      scratchPins: 0,
    };
    row.played += 1;
    row.points += points;
    row.totalPins += t.grandTotal;
    row.scratchPins += t.scratchTotal;
    rows.set(t.teamId, row);
  };

  for (const r of results) {
    add(r.home, r.homePoints);
    add(r.away, r.awayPoints);
  }

  return [...rows.values()].sort((a, b) => b.points - a.points || b.totalPins - a.totalPins);
}
