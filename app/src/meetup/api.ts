import { supabase } from '../lib/supabase';
import type { Member } from '../types';

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
}

export const EMPTY_MEETUP_SNAPSHOT: MeetupSnapshot = {
  meetups: [],
  members: [],
  attendees: [],
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

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('응답이 비어 있습니다.');
  return result.data;
}

// ── Reads ───────────────────────────────────────────────────────

export async function fetchMeetupSnapshot(): Promise<MeetupSnapshot> {
  const db = client();

  const [meetups, members, attendees] = await Promise.all([
    db.from('meetups').select('id,met_on,title,lane_count,first_lane').order('met_on', {
      ascending: false,
    }),
    db.from('meetup_members').select('id,name,gender,avg').order('name'),
    db.from('meetup_attendees').select('meetup_id,member_id,lane_no,slot'),
  ]);

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

  return meetupId;
}

/** Removing a 정모 cascades to its attendee rows; the member master survives. */
export async function deleteMeetup(id: string): Promise<void> {
  const { error } = await client().from('meetups').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
