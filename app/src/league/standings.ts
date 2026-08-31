import type { LeagueSnapshot, Match } from './api';
import { scoreMatch, type MatchResult } from './scoring';
import type { GameNo, LeaguePlayer, SideInput } from './types';

/**
 * Builds the league table from recorded game scores.
 *
 * A fixture only counts once both sides have scores; a match that has been
 * announced but not played must not drag a team's record down.
 */

export interface TableRow {
  teamId: string;
  teamName: string;
  played: number;
  points: number;
  /** 누적 총득점 (핸디·패널티 반영) — the tiebreak the league uses. */
  totalPins: number;
  scratchPins: number;
  /** Games won outright, out of the three per match. */
  gameWins: number;
  /** The 4th point, taken on the 3-game total. */
  totalWins: number;
}

function sideOf(
  snapshot: LeagueSnapshot,
  match: Match,
  teamId: string,
  playerById: ReadonlyMap<string, LeaguePlayer>,
): SideInput | null {
  const roster = snapshot.entries
    .filter((e) => e.teamId === teamId)
    .map((e) => playerById.get(e.playerId))
    .filter((p): p is LeaguePlayer => p !== undefined);
  if (roster.length === 0) return null;

  const ids = new Set(roster.map((p) => p.id));
  const scores = snapshot.scores
    .filter((s) => s.matchId === match.id && ids.has(s.playerId))
    .map((s) => ({ playerId: s.playerId, gameNo: s.gameNo as GameNo, pins: s.pins }));

  // Every member must have all three games in before the match can be judged.
  if (scores.length < roster.length * 3) return null;

  return {
    teamId,
    lineup: roster.map((p) => ({ playerId: p.id, handicap: p.handicap, penalty: p.penalty })),
    scores,
  };
}

/**
 * Fixtures of a season that have complete scores, paired with their result.
 *
 * `throughWeekNo` cuts the season off after that week, which is what makes a
 * week-on-week comparison possible.
 */
export function playedResults(
  snapshot: LeagueSnapshot,
  seasonId: string,
  throughWeekNo?: number,
): { match: Match; result: MatchResult; weekNo: number }[] {
  const playerById = new Map(snapshot.players.map((p) => [p.id, p] as const));
  const weekNoById = new Map(
    snapshot.weeks
      .filter((w) => w.seasonId === seasonId)
      .map((w) => [w.id, w.weekNo] as const),
  );

  const out: { match: Match; result: MatchResult; weekNo: number }[] = [];
  for (const match of snapshot.matches) {
    const weekNo = weekNoById.get(match.weekId);
    if (weekNo === undefined) continue;
    if (throughWeekNo !== undefined && weekNo > throughWeekNo) continue;
    const home = sideOf(snapshot, match, match.homeTeamId, playerById);
    const away = sideOf(snapshot, match, match.awayTeamId, playerById);
    if (!home || !away) continue;
    out.push({ match, result: scoreMatch(home, away), weekNo });
  }
  return out;
}

/** The last week with a completed result, or null when nothing has been played. */
export function latestPlayedWeek(snapshot: LeagueSnapshot, seasonId: string): number | null {
  const weeks = playedResults(snapshot, seasonId).map((r) => r.weekNo);
  return weeks.length === 0 ? null : Math.max(...weeks);
}

/**
 * The table. Every team in the season appears, including those yet to play, so
 * the standings read as a full league rather than only the teams with results.
 *
 * Ordered by points, then cumulative pinfall — the league's stated tiebreak.
 */
export function leagueTable(
  snapshot: LeagueSnapshot,
  seasonId: string,
  throughWeekNo?: number,
): TableRow[] {
  const rows = new Map<string, TableRow>();

  for (const team of snapshot.teams.filter((t) => t.seasonId === seasonId)) {
    rows.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      points: 0,
      totalPins: 0,
      scratchPins: 0,
      gameWins: 0,
      totalWins: 0,
    });
  }

  for (const { result } of playedResults(snapshot, seasonId, throughWeekNo)) {
    const sides = [
      { tally: result.home, points: result.homePoints, pick: (n: number) => n },
      { tally: result.away, points: result.awayPoints, pick: (n: number) => n },
    ] as const;

    for (const [i, side] of sides.entries()) {
      const row = rows.get(side.tally.teamId);
      if (!row) continue;
      row.played += 1;
      row.points += side.points;
      row.totalPins += side.tally.grandTotal;
      row.scratchPins += side.tally.scratchTotal;
      row.gameWins += result.gameDecisions.reduce(
        (sum, d) => sum + (i === 0 ? d.home : d.away),
        0,
      );
      row.totalWins += i === 0 ? result.totalDecision.home : result.totalDecision.away;
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.totalPins - a.totalPins || a.teamName.localeCompare(b.teamName, 'ko'),
  );
}


export interface DashboardRow extends TableRow {
  rank: number;
  /**
   * Places gained since the previous week — positive is up, negative is down,
   * 0 is unchanged. Null when there is no previous week to compare against.
   */
  rankDelta: number | null;
  /** Points won during the latest played week. Never negative: points accrue. */
  pointsGained: number;
}

export interface Dashboard {
  rows: DashboardRow[];
  /** The week the standings are current as of, or null before any results. */
  latestWeekNo: number | null;
  /** False until at least one fixture has both sides' scores in. */
  hasResults: boolean;
}

/**
 * Standings plus week-on-week movement.
 *
 * "Previous" means the table as it stood before the latest played week, so the
 * arrows describe what that week changed rather than an arbitrary window.
 */
export function dashboard(snapshot: LeagueSnapshot, seasonId: string): Dashboard {
  const latestWeekNo = latestPlayedWeek(snapshot, seasonId);
  const current = leagueTable(snapshot, seasonId, latestWeekNo ?? undefined);

  if (latestWeekNo === null) {
    return {
      rows: current.map((row, i) => ({ ...row, rank: i + 1, rankDelta: null, pointsGained: 0 })),
      latestWeekNo: null,
      hasResults: false,
    };
  }

  const previous = leagueTable(snapshot, seasonId, latestWeekNo - 1);
  const prevRank = new Map(previous.map((row, i) => [row.teamId, i + 1] as const));
  const prevPoints = new Map(previous.map((row) => [row.teamId, row.points] as const));

  // Before anyone has played, every team is level and the ordering is arbitrary —
  // reporting movement off that baseline would be noise, so suppress it.
  const prevMeaningful = previous.some((row) => row.played > 0);

  return {
    rows: current.map((row, i) => {
      const rank = i + 1;
      const before = prevRank.get(row.teamId);
      return {
        ...row,
        rank,
        rankDelta: prevMeaningful && before !== undefined ? before - rank : null,
        pointsGained: row.points - (prevPoints.get(row.teamId) ?? 0),
      };
    }),
    latestWeekNo,
    hasResults: true,
  };
}


export type Outcome = 'win' | 'loss' | 'draw';

export const OUTCOME_LABEL: Record<Outcome, string> = {
  win: '승리',
  loss: '패배',
  draw: '무승부',
};

/**
 * Completed results keyed by fixture id, for showing 승리/패배 on a match card.
 * A fixture without both sides' scores is simply absent.
 */
export function resultByMatch(
  snapshot: LeagueSnapshot,
  seasonId: string,
): Map<string, MatchResult> {
  return new Map(playedResults(snapshot, seasonId).map(({ match, result }) => [match.id, result]));
}

/**
 * How the match went for one side. 2:2 is a draw — the four points split, which
 * happens when each team takes two of the four.
 */
export function outcomeFor(result: MatchResult, isHome: boolean): Outcome {
  const mine = isHome ? result.homePoints : result.awayPoints;
  const theirs = isHome ? result.awayPoints : result.homePoints;
  if (mine > theirs) return 'win';
  if (mine < theirs) return 'loss';
  return 'draw';
}

/** Points as seen from one side, e.g. "4 : 0". */
export function pointsFor(result: MatchResult, isHome: boolean): string {
  return isHome
    ? `${result.homePoints} : ${result.awayPoints}`
    : `${result.awayPoints} : ${result.homePoints}`;
}
