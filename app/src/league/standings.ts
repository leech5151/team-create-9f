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

/** Fixtures of a season that have complete scores, paired with their result. */
export function playedResults(
  snapshot: LeagueSnapshot,
  seasonId: string,
): { match: Match; result: MatchResult }[] {
  const playerById = new Map(snapshot.players.map((p) => [p.id, p] as const));
  const weekIds = new Set(
    snapshot.weeks.filter((w) => w.seasonId === seasonId).map((w) => w.id),
  );

  const out: { match: Match; result: MatchResult }[] = [];
  for (const match of snapshot.matches) {
    if (!weekIds.has(match.weekId)) continue;
    const home = sideOf(snapshot, match, match.homeTeamId, playerById);
    const away = sideOf(snapshot, match, match.awayTeamId, playerById);
    if (!home || !away) continue;
    out.push({ match, result: scoreMatch(home, away) });
  }
  return out;
}

/**
 * The table. Every team in the season appears, including those yet to play, so
 * the standings read as a full league rather than only the teams with results.
 *
 * Ordered by points, then cumulative pinfall — the league's stated tiebreak.
 */
export function leagueTable(snapshot: LeagueSnapshot, seasonId: string): TableRow[] {
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

  for (const { result } of playedResults(snapshot, seasonId)) {
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
