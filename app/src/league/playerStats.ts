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
  /** Matches the player was named in the line-up for. */
  appearances: number;
  games: number;
  /** Sum of scratch pins. */
  totalPins: number;
  /**
   * Scratch average rounded to a whole pin.
   *
   * Used where the comparison is against another whole-pin figure — the
   * registered 에버리지 in `delta`, and the 에버 향상 list built from it.
   */
  average: number;
  /**
   * The average rounded off at the ones digit, so it lands on a multiple of
   * ten — the MVP measure. 185.7 and 190.2 both rank as 190.
   *
   * Banding is what makes the games-played tiebreak do real work: on the exact
   * figure almost nobody ties, and the ranking would turn on hundredths of a
   * pin rather than on who has bowled more of the season.
   */
  rankAverage: number;
  /** The unrounded average, shown beside `rankAverage` as the actual figure. */
  exactAverage: number;
  /** Best single game. */
  highGame: number;
  /**
   * average − registered 에버리지. Positive means bowling above their book.
   * Null when the player has no 에버리지 recorded to compare against.
   */
  delta: number | null;
}

/** MVP 에버는 이 단위로 끊어 매긴다 — 일의 자리에서 반올림. */
export const AVERAGE_BAND = 10;

export function playerStats(snapshot: LeagueSnapshot, seasonId: string): PlayerStat[] {
  const weekIds = new Set(snapshot.weeks.filter((w) => w.seasonId === seasonId).map((w) => w.id));
  const matchIds = new Set(
    snapshot.matches.filter((m) => weekIds.has(m.weekId)).map((m) => m.id),
  );
  const playerById = new Map(snapshot.players.map((p) => [p.id, p] as const));

  const appearanceCount = countAppearances(snapshot, matchIds);

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
    const exactAverage = total / games;
    const average = Math.round(exactAverage);
    stats.push({
      player,
      appearances: appearanceCount.get(playerId) ?? 0,
      games,
      totalPins: total,
      average,
      rankAverage: Math.round(exactAverage / AVERAGE_BAND) * AVERAGE_BAND,
      exactAverage,
      highGame: high,
      delta: player.avg === null ? null : average - player.avg,
    });
  }
  return stats;
}

/**
 * MVP order: highest 에버 first, banded to `AVERAGE_BAND`.
 *
 * Ranked on the banded figure, not the exact one, so the order matches the
 * number people read off the screen. Level on that, the bowler with more games
 * ranks higher — the same average over nine games has been earned against more
 * of the season than over three.
 */
export function byAverage(stats: readonly PlayerStat[]): PlayerStat[] {
  return stats
    .slice()
    .sort(
      (a, b) =>
        b.rankAverage - a.rankAverage ||
        b.games - a.games ||
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


/**
 * Matches each player took part in.
 *
 * A player counts as having played a match if they were named in its line-up
 * *or* have a score recorded for it. Requiring the line-up alone left everyone
 * on zero whenever scores were entered without one being set — which is the
 * common case, since the line-up picker is optional.
 *
 * Counted per match, so three games in one night stay one appearance.
 */
function countAppearances(
  snapshot: LeagueSnapshot,
  matchIds: ReadonlySet<string>,
): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  const note = (playerId: string, matchId: string) => {
    const cur = seen.get(playerId) ?? new Set<string>();
    cur.add(matchId);
    seen.set(playerId, cur);
  };

  for (const row of snapshot.lineups) {
    if (matchIds.has(row.matchId)) note(row.playerId, row.matchId);
  }
  for (const row of snapshot.scores) {
    if (matchIds.has(row.matchId)) note(row.playerId, row.matchId);
  }

  return new Map([...seen].map(([playerId, matches]) => [playerId, matches.size]));
}

/** Matches each player took part in, for the season. */
export function appearances(
  snapshot: LeagueSnapshot,
  seasonId: string,
): Map<string, number> {
  const weekIds = new Set(snapshot.weeks.filter((w) => w.seasonId === seasonId).map((w) => w.id));
  const matchIds = new Set(snapshot.matches.filter((m) => weekIds.has(m.weekId)).map((m) => m.id));
  return countAppearances(snapshot, matchIds);
}
