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
  /** ISO date week 1 begins on; null for seasons created before dates existed. */
  startDate: string | null;
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
  /** ISO date the fixture is played on — one of its week's seven days. */
  playedOn: string | null;
  /** Wall-clock start time as `HH:MM`, or null when not decided yet. */
  startTime: string | null;
}

/** One player's score in one game of a match. */
export interface GameScoreRow {
  matchId: string;
  playerId: string;
  gameNo: 1 | 2 | 3;
  pins: number;
}

export interface LeagueSnapshot {
  seasons: Season[];
  players: LeaguePlayer[];
  teams: Team[];
  entries: SeasonEntry[];
  weeks: Week[];
  matches: Match[];
  scores: GameScoreRow[];
}

export const EMPTY_SNAPSHOT: LeagueSnapshot = {
  seasons: [],
  players: [],
  teams: [],
  entries: [],
  weeks: [],
  matches: [],
  scores: [],
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
  const [seasons, players, teams, entries, weeks, matches, scores] = await Promise.all([
    db
      .from('seasons')
      .select('id,edition,title,total_weeks,is_active,start_date')
      .order('edition', { ascending: false }),
    db.from('players').select('id,name,gender,handicap,penalty,avg').order('name'),
    db.from('teams').select('id,season_id,name,sort_order').order('sort_order'),
    db.from('season_players').select('season_id,player_id,team_id'),
    db.from('weeks').select('id,season_id,week_no,played_on').order('week_no'),
    db
      .from('matches')
      .select('id,week_id,home_team_id,away_team_id,lane_no,played_on,start_time')
      .order('played_on'),
    db.from('game_scores').select('match_id,player_id,game_no,pins'),
  ]);

  return {
    seasons: check(seasons).map((r) => ({
      id: r.id,
      edition: r.edition,
      title: r.title,
      totalWeeks: r.total_weeks,
      isActive: r.is_active,
      startDate: r.start_date,
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
      playedOn: r.played_on,
      // Postgres returns `HH:MM:SS`; the UI only ever deals in `HH:MM`.
      startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
    })),
    scores: check(scores).map((r) => ({
      matchId: r.match_id,
      playerId: r.player_id,
      gameNo: r.game_no as 1 | 2 | 3,
      pins: r.pins,
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
  startDate: string,
): Promise<void> {
  const db = client();
  const inserted = await db
    .from('seasons')
    .insert({ edition, total_weeks: totalWeeks, title, start_date: startDate })
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

/**
 * Updates a 회차 and reconciles its weeks to the new count.
 *
 * Growing adds the missing weeks; shrinking deletes the trailing ones, which
 * cascades to their fixtures — callers must confirm that first.
 */
export async function updateSeason(
  id: string,
  edition: number,
  totalWeeks: number,
  title: string | null,
  startDate: string,
): Promise<void> {
  const db = client();

  const updated = await db
    .from('seasons')
    .update({ edition, total_weeks: totalWeeks, title, start_date: startDate })
    .eq('id', id);
  if (updated.error) throw new Error(updated.error.message);

  const existing = await db.from('weeks').select('id,week_no').eq('season_id', id);
  if (existing.error) throw new Error(existing.error.message);

  const present = new Set(existing.data.map((w) => w.week_no as number));

  const missing = [];
  for (let n = 1; n <= totalWeeks; n++) {
    if (!present.has(n)) missing.push({ season_id: id, week_no: n });
  }
  if (missing.length > 0) {
    const { error } = await db.from('weeks').insert(missing);
    if (error) throw new Error(error.message);
  }

  const surplus = existing.data
    .filter((w) => (w.week_no as number) > totalWeeks)
    .map((w) => w.id as string);
  if (surplus.length > 0) {
    const { error } = await db.from('weeks').delete().in('id', surplus);
    if (error) throw new Error(error.message);
  }
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

/**
 * Renames a team and replaces its roster.
 *
 * The old members are detached first, so a player dropped from the team is left
 * unassigned rather than silently staying on it.
 */
export async function updateTeam(
  teamId: string,
  seasonId: string,
  name: string,
  playerIds: readonly string[],
): Promise<void> {
  const db = client();

  const renamed = await db.from('teams').update({ name }).eq('id', teamId);
  if (renamed.error) throw new Error(renamed.error.message);

  const cleared = await db
    .from('season_players')
    .update({ team_id: null })
    .eq('season_id', seasonId)
    .eq('team_id', teamId);
  if (cleared.error) throw new Error(cleared.error.message);

  if (playerIds.length === 0) return;
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
  playedOn: string | null,
  startTime: string | null,
): Promise<void> {
  const { error } = await client().from('matches').insert({
    week_id: weekId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    lane_no: laneNo,
    played_on: playedOn,
    start_time: startTime,
  });
  if (error) throw new Error(error.message);
}

export async function updateMatch(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  laneNo: number | null,
  playedOn: string | null,
  startTime: string | null,
): Promise<void> {
  const { error } = await client()
    .from('matches')
    .update({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      lane_no: laneNo,
      played_on: playedOn,
      start_time: startTime,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteMatch(id: string): Promise<void> {
  const { error } = await client().from('matches').delete().eq('id', id);
  if (error) throw new Error(error.message);
}


// ── Game scores ─────────────────────────────────────────────────

export interface ScoreEntry {
  playerId: string;
  gameNo: 1 | 2 | 3;
  /** null clears a previously recorded score. */
  pins: number | null;
}

/**
 * Replaces the recorded scores for one match.
 *
 * Blank entries are deleted rather than stored as zero — a missing score means
 * "not entered yet", and the standings deliberately skip incomplete matches.
 * Storing 0 would instead count as a played game with no pins.
 */
export async function saveGameScores(
  matchId: string,
  entries: readonly ScoreEntry[],
): Promise<void> {
  const db = client();

  const filled = entries.filter((e) => e.pins !== null);
  const cleared = entries.filter((e) => e.pins === null);

  if (filled.length > 0) {
    const { error } = await db.from('game_scores').upsert(
      filled.map((e) => ({
        match_id: matchId,
        player_id: e.playerId,
        game_no: e.gameNo,
        pins: e.pins,
      })),
      { onConflict: 'match_id,player_id,game_no' },
    );
    if (error) throw new Error(error.message);
  }

  // Deleting per player keeps the filter simple; a match has at most 6 players.
  for (const playerId of new Set(cleared.map((e) => e.playerId))) {
    const games = cleared.filter((e) => e.playerId === playerId).map((e) => e.gameNo);
    const { error } = await db
      .from('game_scores')
      .delete()
      .eq('match_id', matchId)
      .eq('player_id', playerId)
      .in('game_no', games);
    if (error) throw new Error(error.message);
  }
}
