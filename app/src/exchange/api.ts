import { supabase } from '../lib/supabase';
import type { Gender } from '../types';
import type { ExchangeMethod } from './draw';

/**
 * Supabase access for 교류전.
 *
 * There is no 회차: the tables hold the one roster currently in force, and the
 * next 교류전 overwrites it. Same contract as 정모 — reads are anonymous,
 * writes need the operator's session. See migration-008-exchange.sql.
 */

/** 교류전 is always one team against one other. */
export type ExchangeSide = 'home' | 'away';

export const EXCHANGE_SIDES: readonly ExchangeSide[] = ['home', 'away'];

export interface ExchangePlayer {
  id: string;
  side: ExchangeSide;
  name: string;
  gender: Gender;
  avg: number;
}

export interface ExchangeSettings {
  homeName: string;
  awayName: string;
  femaleHandicapOn: boolean;
  /** Added to every game a 여 player bowls, when `femaleHandicapOn`. */
  femaleHandicap: number;
  /** Lane number the first lane carries. */
  firstLane: number;
  /** Even; 0 means sized automatically from the roster. */
  laneCount: number;
}

/** One game and how it was laid out. */
export interface ExchangeGame {
  no: number;
  method: ExchangeMethod;
  /**
   * Player ids per lane, by position from `firstLane` — so lane i is lane
   * number `firstLane + i`. Empty until the game has been drawn.
   */
  lanes: string[][];
  /** Pins per player id, handicap excluded. Absent until entered. */
  scores: Record<string, number>;
}

export interface ExchangeSnapshot {
  settings: ExchangeSettings;
  players: ExchangePlayer[];
  games: ExchangeGame[];
}

export const DEFAULT_EXCHANGE_SETTINGS: ExchangeSettings = {
  homeName: '우리 팀',
  awayName: '상대 팀',
  femaleHandicapOn: false,
  femaleHandicap: 0,
  firstLane: 1,
  laneCount: 0,
};

export const EMPTY_EXCHANGE_SNAPSHOT: ExchangeSnapshot = {
  settings: DEFAULT_EXCHANGE_SETTINGS,
  players: [],
  games: [],
};

export interface ExchangePlayerDraft {
  name: string;
  gender: Gender;
  avg: number;
}

class NotConfiguredError extends Error {
  constructor() {
    super('Supabase가 설정되지 않았습니다.');
  }
}

function client() {
  if (!supabase) throw new NotConfiguredError();
  return supabase;
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('응답이 비어 있습니다.');
  return result.data;
}

/** The handicap a player actually gets under the current settings. */
export function handicapOf(player: Pick<ExchangePlayer, 'gender'>, s: ExchangeSettings): number {
  return s.femaleHandicapOn && player.gender === '여' ? s.femaleHandicap : 0;
}

export function teamName(side: ExchangeSide, s: ExchangeSettings): string {
  return side === 'home' ? s.homeName : s.awayName;
}

// ── Reads ───────────────────────────────────────────────────────

export async function fetchExchangeSnapshot(): Promise<ExchangeSnapshot> {
  const db = client();

  const [settings, players, games, lanes, scores] = await Promise.all([
    db
      .from('exchange_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle(),
    db.from('exchange_players').select('id,side,name,gender,avg').order('created_at'),
    db.from('exchange_games').select('no,method').order('no'),
    db.from('exchange_lanes').select('game_no,player_id,lane_idx,slot'),
    db.from('exchange_scores').select('game_no,player_id,score'),
  ]);
  if (settings.error) throw new Error(settings.error.message);

  // The migration seeds the row, but a missing one should not break the screen.
  const row = settings.data;
  /*
   * 경기설정 테이블(migration-009)이 없거나 깨져도 선수명단은 보여야 한다 —
   * 게임 쪽 실패는 빈 목록으로 두고, 명단·설정 실패만 화면 전체를 막는다.
   */
  const gameRows = games.error ? [] : (games.data ?? []);
  const laneRows = lanes.error ? [] : (lanes.data ?? []);
  const scoreRows = scores.error ? [] : (scores.data ?? []);
  return {
    settings: row
      ? {
          homeName: row.home_name,
          awayName: row.away_name,
          femaleHandicapOn: row.female_handicap_on,
          femaleHandicap: row.female_handicap,
          // migration-009 전에는 컬럼이 없다.
          firstLane: row.first_lane ?? DEFAULT_EXCHANGE_SETTINGS.firstLane,
          laneCount: row.lane_count ?? DEFAULT_EXCHANGE_SETTINGS.laneCount,
        }
      : DEFAULT_EXCHANGE_SETTINGS,
    players: check(players).map((r) => ({
      id: r.id,
      side: r.side,
      name: r.name,
      gender: r.gender,
      avg: r.avg,
    })),
    games: gameRows.map((g) => ({
      no: g.no,
      method: g.method,
      lanes: lanesOf(laneRows.filter((l) => l.game_no === g.no)),
      scores: Object.fromEntries(
        scoreRows.filter((r) => r.game_no === g.no).map((r) => [r.player_id, r.score]),
      ),
    })),
  };
}

/** Rows back into lanes: index by lane_idx, order by slot. Gaps stay empty. */
function lanesOf(rows: { player_id: string; lane_idx: number; slot: number }[]): string[][] {
  const size = rows.reduce((n, r) => Math.max(n, r.lane_idx + 1), 0);
  const out: string[][] = Array.from({ length: size }, () => []);
  rows
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .forEach((r) => out[r.lane_idx]!.push(r.player_id));
  return out;
}

// ── Writes (operator only) ──────────────────────────────────────

export async function saveExchangeSettings(s: ExchangeSettings): Promise<void> {
  const { error } = await client()
    .from('exchange_settings')
    .upsert(
      {
        id: 1,
        home_name: s.homeName,
        away_name: s.awayName,
        female_handicap_on: s.femaleHandicapOn,
        female_handicap: s.femaleHandicap,
        first_lane: s.firstLane,
        lane_count: s.laneCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  if (error) throw new Error(error.message);
}

export async function insertExchangePlayers(
  side: ExchangeSide,
  drafts: readonly ExchangePlayerDraft[],
): Promise<void> {
  if (drafts.length === 0) return;
  const { error } = await client()
    .from('exchange_players')
    .insert(drafts.map((d) => ({ side, name: d.name, gender: d.gender, avg: d.avg })));
  if (error) throw new Error(error.message);
}

export async function updateExchangePlayer(id: string, patch: ExchangePlayerDraft): Promise<void> {
  const { error } = await client()
    .from('exchange_players')
    .update({ name: patch.name, gender: patch.gender, avg: patch.avg })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteExchangePlayer(id: string): Promise<void> {
  const { error } = await client().from('exchange_players').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Empties one team's roster — how a new opponent replaces the last one. */
export async function clearExchangeSide(side: ExchangeSide): Promise<void> {
  const { error } = await client().from('exchange_players').delete().eq('side', side);
  if (error) throw new Error(error.message);
}

// ── Games (operator only) ───────────────────────────────────────

export async function addExchangeGame(no: number, method: ExchangeMethod): Promise<void> {
  const { error } = await client().from('exchange_games').insert({ no, method });
  if (error) throw new Error(error.message);
}

/** Its lane rows go with it — `on delete cascade`. */
export async function deleteExchangeGame(no: number): Promise<void> {
  const { error } = await client().from('exchange_games').delete().eq('no', no);
  if (error) throw new Error(error.message);
}

/**
 * Stores one game's method and layout. The lane rows are replaced wholesale,
 * since a redraw or swap can move anyone and stale rows must not survive.
 */
export async function saveExchangeGame(game: ExchangeGame): Promise<void> {
  const db = client();
  const updated = await db.from('exchange_games').update({ method: game.method }).eq('no', game.no);
  if (updated.error) throw new Error(updated.error.message);

  const cleared = await db.from('exchange_lanes').delete().eq('game_no', game.no);
  if (cleared.error) throw new Error(cleared.error.message);

  const rows = game.lanes.flatMap((ids, laneIdx) =>
    ids.map((playerId, slot) => ({
      game_no: game.no,
      player_id: playerId,
      lane_idx: laneIdx,
      slot,
    })),
  );
  if (rows.length > 0) {
    const { error } = await db.from('exchange_lanes').insert(rows);
    if (error) throw new Error(error.message);
  }
}

/**
 * Writes the scores entered for some players of one game. A null clears that
 * player's score, so a mistyped entry can be taken back.
 */
export async function saveExchangeScores(
  gameNo: number,
  entries: readonly { playerId: string; score: number | null }[],
): Promise<void> {
  const db = client();
  const set = entries.filter((e) => e.score !== null);
  const cleared = entries.filter((e) => e.score === null).map((e) => e.playerId);

  if (set.length > 0) {
    const { error } = await db.from('exchange_scores').upsert(
      set.map((e) => ({ game_no: gameNo, player_id: e.playerId, score: e.score })),
      { onConflict: 'game_no,player_id' },
    );
    if (error) throw new Error(error.message);
  }
  if (cleared.length > 0) {
    const { error } = await db
      .from('exchange_scores')
      .delete()
      .eq('game_no', gameNo)
      .in('player_id', cleared);
    if (error) throw new Error(error.message);
  }
}
