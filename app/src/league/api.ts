import { supabase } from '../lib/supabase';
import type { LeaguePlayer } from './types';

/**
 * Supabase access for 상주리그.
 *
 * Reads run anonymously — RLS grants `select` to everyone. Writes require the
 * operator's session; without it Postgres rejects them, so these functions
 * surface that as a thrown error rather than failing silently.
 */

export interface Season {
  id: string;
  edition: number;
  title: string | null;
  totalWeeks: number;
  isActive: boolean;
}

export interface Team {
  id: string;
  seasonId: string;
  name: string;
  sortOrder: number;
}

/** Which team a player belongs to in a given season. */
export interface SeasonEntry {
  seasonId: string;
  playerId: string;
  teamId: string | null;
}

export interface Week {
  id: string;
  seasonId: string;
  weekNo: number;
  /** ISO date (yyyy-mm-dd), or null when not scheduled yet. */
  playedOn: string | null;
}

/** One team-vs-team fixture inside a week. */
export interface Match {
  id: string;
  weekId: string;
  homeTeamId: string;
  awayTeamId: string;
  laneNo: number | null;
}

export interface LeagueSnapshot {
  seasons: Season[];
  players: LeaguePlayer[];
  teams: Team[];
  entries: SeasonEntry[];
  weeks: Week[];
  matches: Match[];
}

export const EMPTY_SNAPSHOT: LeagueSnapshot = {
  seasons: [],
  players: [],
  teams: [],
  entries: [],
  weeks: [],
  matches: [],
};

class NotConfiguredError extends Error {
  constructor() {
    super('Supabase가 설정되지 않았습니다.');
  }
}

function client() {
  if (!supabase) throw new NotConfiguredError();
  return supabase;
}

/** Postgres errors carry the useful detail; surface it instead of a generic message. */
function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('응답이 비어 있습니다.');
  return result.data;
}

// ── Reads ───────────────────────────────────────────────────────

export async function fetchSnapshot(): Promise<LeagueSnapshot> {
  const db = client();

  // Small tables; one round trip each, in parallel.
  const [seasons, players, teams, entries, weeks, matches] = await Promise.all([
    db.from('seasons').select('id,edition,title,total_weeks,is_active').order('edition', { ascending: false }),
    db.from('players').select('id,name,gender,handicap,penalty,avg').order('name'),
    db.from('teams').select('id,season_id,name,sort_order').order('sort_order'),
    db.from('season_players').select('season_id,player_id,team_id'),
    db.from('weeks').select('id,season_id,week_no,played_on').order('week_no'),
    db.from('matches').select('id,week_id,home_team_id,away_team_id,lane_no').order('lane_no'),
  ]);

  return {
    seasons: check(seasons).map((r) => ({
      id: r.id,
      edition: r.edition,
      title: r.title,
      totalWeeks: r.total_weeks,
      isActive: r.is_active,
    })),
    players: check(players).map((r) => ({
      id: r.id,
      name: r.name,
      gender: r.gender,
      handicap: r.handicap ?? 0,
      penalty: r.penalty ?? 0,
      avg: r.avg,
    })),
    teams: check(teams).map((r) => ({
      id: r.id,
      seasonId: r.season_id,
      name: r.name,
      sortOrder: r.sort_order,
    })),
    entries: check(entries).map((r) => ({
      seasonId: r.season_id,
      playerId: r.player_id,
      teamId: r.team_id,
    })),
    weeks: check(weeks).map((r) => ({
      id: r.id,
      seasonId: r.season_id,
      weekNo: r.week_no,
      playedOn: r.played_on,
    })),
    matches: check(matches).map((r) => ({
      id: r.id,
      weekId: r.week_id,
      homeTeamId: r.home_team_id,
      awayTeamId: r.away_team_id,
      laneNo: r.lane_no,
    })),
  };
}

// ── Writes (operator only) ──────────────────────────────────────

export interface PlayerDraft {
  name: string;
  gender: '남' | '여' | null;
  handicap: number;
  penalty: number;
  avg: number | null;
}

/** Column payload shared by insert and update. */
const row = (d: PlayerDraft) => ({
  name: d.name,
  gender: d.gender,
  handicap: d.handicap,
  penalty: d.penalty,
  avg: d.avg,
});

export async function insertPlayers(drafts: readonly PlayerDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  const { error } = await client()
    .from('players')
    .insert(drafts.map(row));
  if (error) throw new Error(error.message);
}

export async function updatePlayer(id: string, patch: PlayerDraft): Promise<void> {
  const { error } = await client()
    .from('players')
    .update(row(patch))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Removing a player cascades to their season entries and any recorded scores —
 * the foreign keys are declared `on delete cascade`. Callers must confirm first.
 */
export async function deletePlayer(id: string): Promise<void> {
  const { error } = await client().from('players').delete().eq('id', id);
  if (error) throw new Error(error.message);
}


// ── Season / week / team / match writes (operator only) ─────────

/**
 * Creates a 회차 together with its weeks, so the schedule is usable straight
 * away rather than needing each week added by hand.
 */
export async function createSeason(
  edition: number,
  totalWeeks: number,
  title: string | null,
): Promise<void> {
  const db = client();
  const inserted = await db
    .from('seasons')
    .insert({ edition, total_weeks: totalWeeks, title })
    .select('id')
    .single();
  if (inserted.error) throw new Error(inserted.error.message);

  const seasonId = inserted.data.id as string;
  const weeks = Array.from({ length: totalWeeks }, (_, i) => ({
    season_id: seasonId,
    week_no: i + 1,
  }));
  const { error } = await db.from('weeks').insert(weeks);
  if (error) throw new Error(error.message);
}

export async function deleteSeason(id: string): Promise<void> {
  const { error } = await client().from('seasons').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Creates a team and records which players belong to it for that season. */
export async function createTeam(
  seasonId: string,
  name: string,
  playerIds: readonly string[],
  sortOrder: number,
): Promise<void> {
  const db = client();
  const inserted = await db
    .from('teams')
    .insert({ season_id: seasonId, name, sort_order: sortOrder })
    .select('id')
    .single();
  if (inserted.error) throw new Error(inserted.error.message);

  const teamId = inserted.data.id as string;
  if (playerIds.length === 0) return;

  // upsert: a player may already have a row for this season on another team.
  const { error } = await db.from('season_players').upsert(
    playerIds.map((playerId) => ({
      season_id: seasonId,
      player_id: playerId,
      team_id: teamId,
    })),
    { onConflict: 'season_id,player_id' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await client().from('teams').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createMatch(
  weekId: string,
  homeTeamId: string,
  awayTeamId: string,
  laneNo: number | null,
): Promise<void> {
  const { error } = await client().from('matches').insert({
    week_id: weekId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    lane_no: laneNo,
  });
  if (error) throw new Error(error.message);
}

export async function deleteMatch(id: string): Promise<void> {
  const { error } = await client().from('matches').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
