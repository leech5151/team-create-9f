import { supabase } from '../lib/supabase';
import type { Gender, HistoryEntry, Member } from '../types';
import type { RegistryMember } from './registry';

/**
 * Supabase access for 정모 (정기모임).
 *
 * 팀짜기 itself stays a local, session-only tool — anyone can open it and draw
 * lanes without an account. A 정모 is the shared counterpart: the operator
 * saves one so everyone else can look up the same roster and lane assignment.
 *
 * Same contract as 상주리그: reads are anonymous, writes need the operator's
 * session and RLS rejects them otherwise. See migration-006-meetups.sql.
 */

export interface Meetup {
  id: string;
  /** ISO date (yyyy-mm-dd) — one 정모 per day. */
  metOn: string;
  title: string | null;
  laneCount: number;
  firstLane: number;
}

/** One attendee of a 정모, and the lane they were drawn into. */
export interface MeetupAttendee {
  meetupId: string;
  memberId: string;
  /** null until the lanes have been drawn and saved. */
  laneNo: number | null;
  /** Position within the lane, so a reopened 정모 lists the same order. */
  slot: number;
}

export interface MeetupSnapshot {
  meetups: Meetup[];
  /** The 정모 member master list — shared across every 정모. */
  members: Member[];
  attendees: MeetupAttendee[];
  /** 회원 명단 — the registered members, imported from the 칠텐 양식. */
  registry: RegistryMember[];
  /**
   * False when the server predates migration-011. 정모 still loads; only the
   * 회원 명단 is unavailable, and 회원등록 says why.
   */
  registryReady: boolean;
  /** Finished games per 정모 — the 기록 screen. */
  games: MeetupGame[];
  /** False when the server predates migration-012; 기록 is then not shared. */
  gamesReady: boolean;
}

/** One finished game of a 정모: who bowled on which lane. */
export interface MeetupGame extends HistoryEntry {
  meetupId: string;
}

export const EMPTY_MEETUP_SNAPSHOT: MeetupSnapshot = {
  meetups: [],
  members: [],
  attendees: [],
  registry: [],
  registryReady: true,
  games: [],
  gamesReady: true,
};

/** PostgREST "table not found" — meetup_games before migration-012. */
const UNDEFINED_TABLE = 'PGRST205';

const MISSING_GAMES_TABLE =
  '서버 DB에 기록 테이블이 없어요. Supabase SQL Editor에서 supabase/migration-012-meetup-games.sql 을 실행해 주세요.';

/** Postgres "undefined_column" — the registry columns are not there yet. */
const UNDEFINED_COLUMN = '42703';

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

// ── Reads ───────────────────────────────────────────────────────

export async function fetchMeetupSnapshot(): Promise<MeetupSnapshot> {
  const db = client();

  const [meetups, members, attendees, registry, games] = await Promise.all([
    db.from('meetups').select('id,met_on,title,lane_count,first_lane').order('met_on', {
      ascending: false,
    }),
    // 같은 이름은 오래된 것부터 — 회원 가져오기가 마지막 사본을 최신으로 본다.
    db.from('meetup_members').select('id,name,gender,avg').order('name').order('created_at'),
    db.from('meetup_attendees').select('meetup_id,member_id,lane_no,slot'),
    // 따로 묻는다 — 마이그레이션 전이라 컬럼이 없어도 정모 조회는 살아 있어야 한다.
    db
      .from('meetup_members')
      .select('id,name,gender,avg,record_no,birth,games,last_played')
      .eq('registered', true),
    db.from('meetup_games').select('meetup_id,game,first_lane,lanes').order('game'),
  ]);
  const registryReady = registry.error?.code !== UNDEFINED_COLUMN;
  const gamesReady = games.error?.code !== UNDEFINED_TABLE;

  return {
    meetups: check(meetups).map((r) => ({
      id: r.id,
      metOn: r.met_on,
      title: r.title,
      laneCount: r.lane_count,
      firstLane: r.first_lane,
    })),
    members: check(members).map((r) => ({
      id: r.id,
      name: r.name,
      gender: r.gender,
      avg: r.avg,
    })),
    attendees: check(attendees).map((r) => ({
      meetupId: r.meetup_id,
      memberId: r.member_id,
      laneNo: r.lane_no,
      slot: r.slot ?? 0,
    })),
    registry: registryReady
      ? check(registry).map((r) => ({
          id: r.id,
          name: r.name,
          gender: r.gender,
          avg: r.avg,
          recordNo: r.record_no,
          birth: r.birth,
          games: r.games,
          lastPlayed: r.last_played,
        }))
      : [],
    registryReady,
    games: gamesReady
      ? check(games).map((r) => ({
          meetupId: r.meetup_id,
          game: r.game,
          firstLane: r.first_lane,
          lanes: Array.isArray(r.lanes) ? (r.lanes as string[][]) : [],
        }))
      : [],
    gamesReady,
  };
}

// ── Writes (operator only) ──────────────────────────────────────

/**
 * What one save writes: the roster as it stands, who attended, and the lanes
 * they were drawn into.
 *
 * `lanes` holds member ids per lane in draw order; the lane *numbers* come from
 * `firstLane`, so renumbering does not change who sits with whom.
 */
export interface MeetupDraft {
  metOn: string;
  title: string | null;
  firstLane: number;
  /** Everyone on the roster, whether attending or not. */
  members: readonly Member[];
  /** Attending member ids with no lane yet — those still count as attending. */
  attendingIds: readonly string[];
  lanes: readonly (readonly string[])[];
  /** Finished games — replaces what the 정모 had, like attendance. */
  games: readonly HistoryEntry[];
}

/**
 * Saves a 정모, creating it if that date has none yet.
 *
 * The roster is upserted by id, so a member drawn locally keeps the same id on
 * the server and a re-save updates rather than duplicates them. Attendance is
 * replaced wholesale — a member unchecked since the last save has to disappear,
 * which a plain upsert would never do.
 */
export async function saveMeetup(draft: MeetupDraft): Promise<string> {
  const db = client();

  const meetup = await db
    .from('meetups')
    .upsert(
      {
        met_on: draft.metOn,
        title: draft.title,
        lane_count: draft.lanes.length,
        first_lane: draft.firstLane,
      },
      { onConflict: 'met_on' },
    )
    .select('id')
    .single();
  if (meetup.error) throw new Error(meetup.error.message);
  const meetupId = meetup.data.id as string;

  if (draft.members.length > 0) {
    const upserted = await db.from('meetup_members').upsert(
      draft.members.map((m) => ({
        id: m.id,
        name: m.name,
        gender: m.gender,
        avg: m.avg,
      })),
      { onConflict: 'id' },
    );
    if (upserted.error) throw new Error(upserted.error.message);
  }

  const cleared = await db.from('meetup_attendees').delete().eq('meetup_id', meetupId);
  if (cleared.error) throw new Error(cleared.error.message);

  /** lane_no per member, from the drawn lanes. */
  const laneOf = new Map<string, { laneNo: number; slot: number }>();
  draft.lanes.forEach((ids, i) => {
    ids.forEach((id, slot) => laneOf.set(id, { laneNo: draft.firstLane + i, slot }));
  });

  // Everyone attending gets a row; those not drawn yet carry a null lane.
  const rows = draft.attendingIds.map((memberId) => ({
    meetup_id: meetupId,
    member_id: memberId,
    lane_no: laneOf.get(memberId)?.laneNo ?? null,
    slot: laneOf.get(memberId)?.slot ?? 0,
  }));
  if (rows.length > 0) {
    const { error } = await db.from('meetup_attendees').insert(rows);
    if (error) throw new Error(error.message);
  }

  // 기록도 통째로 바꾼다 — 지운 게임이 서버에 남지 않도록.
  const gamesCleared = await db.from('meetup_games').delete().eq('meetup_id', meetupId);
  if (gamesCleared.error) {
    throw new Error(
      gamesCleared.error.code === UNDEFINED_TABLE
        ? MISSING_GAMES_TABLE
        : gamesCleared.error.message,
    );
  }
  if (draft.games.length > 0) {
    const { error } = await db.from('meetup_games').insert(
      draft.games.map((g) => ({
        meetup_id: meetupId,
        game: g.game,
        first_lane: g.firstLane,
        lanes: g.lanes,
      })),
    );
    if (error) throw new Error(error.message);
  }

  return meetupId;
}

/**
 * Writes an imported 회원 명단: every row in the sheet becomes a registered
 * member, and registered members the sheet no longer lists drop back out.
 *
 * Dropped members are unregistered, not deleted — deleting would cascade
 * through `meetup_attendees` and erase them from past 정모.
 */
export async function importRegistry(
  rows: readonly RegistryMember[],
  unregisterIds: readonly string[],
): Promise<void> {
  const db = client();

  if (rows.length > 0) {
    const { error } = await db.from('meetup_members').upsert(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        gender: r.gender,
        avg: r.avg,
        registered: true,
        record_no: r.recordNo,
        birth: r.birth,
        games: r.games,
        last_played: r.lastPlayed,
      })),
      { onConflict: 'id' },
    );
    if (error) throw new Error(error.message);
  }

  // Ids ride in the query string, so a long list goes in chunks.
  for (let i = 0; i < unregisterIds.length; i += 100) {
    const { error } = await db
      .from('meetup_members')
      // 번호도 비워 둔다 — 나중에 다시 명단에 오면 새 행이 같은 번호를 쓸 수 있도록.
      .update({ registered: false, record_no: null })
      .in('id', unregisterIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/** The sheet has no gender column, so it is set by hand on 회원등록. */
export async function setMemberGender(id: string, gender: Gender): Promise<void> {
  const { error } = await client().from('meetup_members').update({ gender }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Removing a 정모 cascades to its attendee rows; the member master survives. */
export async function deleteMeetup(id: string): Promise<void> {
  const { error } = await client().from('meetups').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
