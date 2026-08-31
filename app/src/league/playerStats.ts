import type { LeagueSnapshot } from './api';
import type { LeaguePlayer } from './types';

/**
 * Per-player performance across a 회차.
 *
 * Counts every score actually recorded, whether or not the opponent's sheet is
 * finished — how a bowler threw does not depend on the other team's paperwork.
 * (The league table is stricter, because a *match* result needs both sides.)
 *
 * All figures are scratch pins. Handicap and penalty are league adjustments for
 * deciding matches, not part of what a player threw, and the registered 에버리지
 * they are compared against is itself a scratch number.
 */

export interface PlayerStat {
  player: LeaguePlayer;
  games: number;
  /** Sum of scratch pins — the MVP measure. */
  totalPins: number;
  /** Scratch average over the games played, rounded. */
  average: number;
  /** Best single game. */
  highGame: number;
  /**
   * average − registered 에버리지. Positive means bowling above their book.
   * Null when the player has no 에버리지 recorded to compare against.
   */
  delta: number | null;
}

export function playerStats(snapshot: LeagueSnapshot, seasonId: string): PlayerStat[] {
  const weekIds = new Set(snapshot.weeks.filter((w) => w.seasonId === seasonId).map((w) => w.id));
  const matchIds = new Set(
    snapshot.matches.filter((m) => weekIds.has(m.weekId)).map((m) => m.id),
  );
  const playerById = new Map(snapshot.players.map((p) => [p.id, p] as const));

  const acc = new Map<string, { games: number; total: number; high: number }>();
  for (const row of snapshot.scores) {
    if (!matchIds.has(row.matchId)) continue;
    const cur = acc.get(row.playerId) ?? { games: 0, total: 0, high: 0 };
    cur.games += 1;
    cur.total += row.pins;
    cur.high = Math.max(cur.high, row.pins);
    acc.set(row.playerId, cur);
  }

  const stats: PlayerStat[] = [];
  for (const [playerId, { games, total, high }] of acc) {
    const player = playerById.get(playerId);
    if (!player || games === 0) continue;
    const average = Math.round(total / games);
    stats.push({
      player,
      games,
      totalPins: total,
      average,
      highGame: high,
      delta: player.avg === null ? null : average - player.avg,
    });
  }
  return stats;
}

/** MVP order: most scratch pins, then higher average as the tiebreak. */
export function byTotalPins(stats: readonly PlayerStat[]): PlayerStat[] {
  return stats
    .slice()
    .sort(
      (a, b) =>
        b.totalPins - a.totalPins ||
        b.average - a.average ||
        a.player.name.localeCompare(b.player.name, 'ko'),
    );
}

/**
 * Bowlers beating their registered 에버리지, biggest gain first.
 *
 * Only positive gains are returned — the list exists to highlight form, and
 * publishing who is under their book would be a different (unkind) feature.
 */
export function improvers(stats: readonly PlayerStat[]): PlayerStat[] {
  return stats
    .filter((s): s is PlayerStat & { delta: number } => s.delta !== null && s.delta > 0)
    .sort((a, b) => b.delta - a.delta || b.average - a.average);
}
