import {
  handicapOf,
  teamName,
  type ExchangeGame,
  type ExchangePlayer,
  type ExchangeSettings,
  type ExchangeSide,
} from './api';
import { LANES_PER_TABLE } from './draw';

/** One table (= one team) of a drawn game, with its players resolved. */
export interface GameTable {
  /** 0-based position among all tables. */
  idx: number;
  /**
   * What the team is called. 팀vs팀 numbers each club's tables separately —
   * "9FRAME 1팀", "BLOCK9 1팀" — since a bare 1·2·3·4팀 hides which club
   * sits where. Other methods mix clubs, so plain 1팀, 2팀 ….
   */
  name: string;
  /** Lane number of the table's first lane. */
  firstLane: number;
  lanes: ExchangePlayer[][];
  members: ExchangePlayer[];
  /** The home : away split for mixed tables; empty when one club. */
  label: string;
  /** Average with handicap, rounded. */
  avg: number;
}

export function gameTables(
  game: ExchangeGame,
  byId: ReadonlyMap<string, ExchangePlayer>,
  settings: ExchangeSettings,
): GameTable[] {
  const out: GameTable[] = [];
  const perClub: Record<ExchangeSide, number> = { home: 0, away: 0 };
  for (let i = 0; i < game.lanes.length; i += LANES_PER_TABLE) {
    const lanes = game.lanes
      .slice(i, i + LANES_PER_TABLE)
      .map((ids) => ids.map((id) => byId.get(id)).filter((p): p is ExchangePlayer => !!p));
    const members = lanes.flat();
    const home = members.filter((p) => p.side === 'home').length;
    const club: ExchangeSide | null =
      members.length === 0 ? null : home === members.length ? 'home' : home === 0 ? 'away' : null;
    const idx = i / LANES_PER_TABLE;
    const name =
      game.method === 'clubs' && club
        ? `${teamName(club, settings)} ${++perClub[club]}팀`
        : `${idx + 1}팀`;
    const label = club ? '' : `${home} : ${members.length - home}`;
    const avg =
      members.length === 0
        ? 0
        : Math.round(
            members.reduce((s, p) => s + p.avg + handicapOf(p, settings), 0) / members.length,
          );
    out.push({
      idx,
      name,
      firstLane: settings.firstLane + i,
      lanes,
      members,
      label,
      avg,
    });
  }
  return out;
}

export interface Tally {
  /** Pins plus handicap, over the players who have a score. */
  total: number;
  /** Handicap included in `total` — decides a tie. */
  handicap: number;
  entered: number;
  count: number;
}

/**
 * Positive when `a` beats `b`, 0 for a true draw. Equal totals go to the side
 * that received *less* handicap — same rule as 상주리그.
 */
export function compareTally(
  a: Pick<Tally, 'total' | 'handicap'>,
  b: Pick<Tally, 'total' | 'handicap'>,
): number {
  return a.total - b.total || b.handicap - a.handicap;
}

/** Totals for `players` in `game` — a table, a club, anyone. */
export function tally(
  players: readonly ExchangePlayer[],
  game: ExchangeGame,
  settings: ExchangeSettings,
): Tally {
  let total = 0;
  let handicap = 0;
  let entered = 0;
  for (const p of players) {
    const score = game.scores[p.id];
    if (score === undefined) continue;
    const handi = handicapOf(p, settings);
    total += score + handi;
    handicap += handi;
    entered++;
  }
  return { total, handicap, entered, count: players.length };
}

/** Each club's tally for one game, counting only who was placed in it. */
export function clubTallies(
  game: ExchangeGame,
  byId: ReadonlyMap<string, ExchangePlayer>,
  settings: ExchangeSettings,
): Record<ExchangeSide, Tally> {
  const placed = game.lanes
    .flat()
    .map((id) => byId.get(id))
    .filter((p): p is ExchangePlayer => !!p);
  return {
    home: tally(
      placed.filter((p) => p.side === 'home'),
      game,
      settings,
    ),
    away: tally(
      placed.filter((p) => p.side === 'away'),
      game,
      settings,
    ),
  };
}
