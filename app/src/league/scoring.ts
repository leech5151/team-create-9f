import { GAMES_PER_MATCH, type GameNo, type SideInput } from './types';

/**
 * 상주리그 채점.
 *
 * 형식: 3인 팀전, 팀 1:1. 게임 3개에 각 1승, 3게임 총점에 1승 → 경기당 최대 4승.
 *
 * 조정값: 선수별로 핸디를 더하고 패널티를 뺀다. 둘 다 매 게임에 반영되므로
 * 3게임이면 3번씩 적용된다. 두 값은 크기로만 저장되고 부호는 여기서 정한다.
 *
 * 여기에 대진 핸디캡이 더해진다 — 양 팀 점수 합의 차이만큼 약팀에 주는 보정으로,
 * 10 단위로 끊고 60 을 넘지 않는다.
 */

const GAME_NOS: readonly GameNo[] = [1, 2, 3];

/** 대진 핸디캡: 10 단위, 최대 60, 10 미만이면 없음. */
export const MATCH_HANDICAP_STEP = 10;
export const MATCH_HANDICAP_MAX = 60;

/**
 * The extra handicap the weaker side gets for this fixture.
 *
 * `gap` is the difference between the two line-ups' registered 점수 totals,
 * which is a per-game figure — a team 45 short on paper is 45 short each game —
 * so the result applies to every game rather than once per match.
 *
 * Rounded down to `MATCH_HANDICAP_STEP`: a gap of 45 gives 40, and anything
 * under one step gives nothing. Capped at `MATCH_HANDICAP_MAX`.
 */
export function matchHandicap(gap: number): number {
  if (gap < MATCH_HANDICAP_STEP) return 0;
  const stepped = Math.floor(gap / MATCH_HANDICAP_STEP) * MATCH_HANDICAP_STEP;
  return Math.min(MATCH_HANDICAP_MAX, stepped);
}

/**
 * The fixture handicap each side carries, from their 점수 totals.
 *
 * Only the weaker side gets one; an even fixture gives both zero.
 */
export function fixtureHandicaps(
  homeStrength: number,
  awayStrength: number,
): { home: number; away: number } {
  const extra = matchHandicap(Math.abs(homeStrength - awayStrength));
  return {
    home: homeStrength < awayStrength ? extra : 0,
    away: awayStrength < homeStrength ? extra : 0,
  };
}

/** Sum of the line-up's registered 점수; players without one contribute nothing. */
export function lineupStrength(side: SideInput): number {
  return side.lineup.reduce((sum, a) => sum + (a.avg ?? 0), 0);
}

export interface TeamGame {
  gameNo: GameNo;
  /** Adjustments excluded — the "비핸디" figure used as the first tiebreak. */
  scratch: number;
  /** Handicap added and penalty subtracted — the figure that decides the game. */
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
  /** 대진 핸디캡이 매 게임에 더해진 양. 0 이면 적용되지 않았다. */
  matchHandicap: number;
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

/**
 * Per-game and aggregate figures for one side.
 *
 * `extraPerGame` is the fixture's handicap for this side, already decided by
 * comparing the two line-ups — see `scoreMatch`.
 */
export function tally(side: SideInput, extraPerGame = 0): TeamTally {
  // Net per-player adjustment: handicap adds, penalty subtracts.
  const adjustmentOf = new Map(
    side.lineup.map((a) => [a.playerId, a.handicap - a.penalty] as const),
  );

  const games = GAME_NOS.map((gameNo): TeamGame => {
    const rows = side.scores.filter((s) => s.gameNo === gameNo);
    const scratch = rows.reduce((sum, s) => sum + s.pins, 0);
    // Counts once per player per game.
    const adjustment = rows.reduce((sum, s) => sum + (adjustmentOf.get(s.playerId) ?? 0), 0);
    return { gameNo, scratch, total: scratch + adjustment + extraPerGame };
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
    matchHandicap: extraPerGame,
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
  // The weaker line-up on paper carries the fixture handicap.
  const homeStrength = lineupStrength(homeSide);
  const awayStrength = lineupStrength(awaySide);
  const gap = Math.abs(homeStrength - awayStrength);
  const extra = matchHandicap(gap);

  const home = tally(homeSide, homeStrength < awayStrength ? extra : 0);
  const away = tally(awaySide, awayStrength < homeStrength ? extra : 0);

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
