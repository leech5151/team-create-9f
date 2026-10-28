import type { SheetRows } from '../lib/xlsx';
import { newMemberId } from '../lib/id';
import type { Member } from '../types';

/**
 * Reading the 칠텐 기록등록 양식 into a 회원 명단.
 *
 * The sheet has a header row of 번호 · 이름 · 생년월일 followed by one column
 * per game, each headed by its date (yyyymmdd, eight columns to a date). Every
 * row below is one member; unplayed slots hold 0.
 *
 * The file is read in the browser; the resulting 명단 is stored on the server
 * (`meetup_members.registered`), so every device picks from the same list.
 */

/**
 * One member of the 회원 명단. Guests typed in after the 명단 exists are
 * never in it; people saved to 정모 before it existed are carried over.
 */
export interface RegistryMember extends Member {
  /**
   * 칠텐 양식의 번호 — the key a re-import matches on. Null for someone carried
   * over from past 정모 who is not in the sheet.
   */
  recordNo: number | null;
  /** yyyymmdd, as the sheet has it. */
  birth: string | null;
  /** Games on record in the sheet; `avg` covers only the latest of them. */
  games: number;
  /** ISO date of the last recorded game. */
  lastPlayed: string | null;
}

/** Average over the latest games only — the sheet goes back years. */
export const RECENT_GAMES = 12;

const MAX_SCORE = 300;

/** Most recently active first, so the people who actually come are on top. */
export const byActivity = (a: RegistryMember, b: RegistryMember) =>
  (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '') || a.name.localeCompare(b.name, 'ko');

/** "19890620" → "89년생" — enough to tell two members of the same name apart. */
/** "183.4", and plain "183" for a whole number. */
export const avgLabel = (avg: number) => String(Math.round(avg * 10) / 10);

export const birthLabel = (birth: string | null) => (birth ? `${birth.slice(2, 4)}년생` : '');

export interface RecordRow {
  recordNo: number;
  name: string;
  birth: string | null;
  /** Mean of the last `RECENT_GAMES` scores to one decimal; 0 with no games. */
  avg: number;
  games: number;
  lastPlayed: string | null;
}

/** 8-digit dates as-is; a small number is an Excel day serial (1900 system). */
function normaliseBirth(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return raw;
  const serial = Number(raw);
  if (!Number.isFinite(serial) || serial < 1 || serial > 80_000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

const isoDate = (yyyymmdd: string) =>
  `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/** Throws with a message fit for the operator when the sheet is not the form. */
export function parseRecordSheet(rows: SheetRows): RecordRow[] {
  let headerRow = -1;
  const cols = { no: 0, name: 0, birth: 0 };
  const dateCols: [col: number, date: string][] = [];

  for (const [r, cells] of [...rows.entries()].sort(([a], [b]) => a - b)) {
    for (const [c, v] of cells) {
      if (v === '번호') cols.no = c;
      else if (v === '이름') cols.name = c;
      else if (v === '생년월일') cols.birth = c;
    }
    if (cols.name > 0) {
      headerRow = r;
      for (const [c, v] of cells) if (/^\d{8}$/.test(v)) dateCols.push([c, v]);
      break;
    }
  }
  if (headerRow < 0 || cols.no === 0) {
    throw new Error('번호·이름 머리글이 없어요. 칠텐 기록등록 양식인지 확인해 주세요.');
  }
  dateCols.sort(([a], [b]) => a - b);

  const out: RecordRow[] = [];
  const seen = new Set<number>();
  for (const [r, cells] of rows) {
    if (r <= headerRow) continue;
    // The form's sample row is numbered "ex) 1" — only plain numbers are members.
    const noText = cells.get(cols.no) ?? '';
    if (!/^\d+$/.test(noText)) continue;
    const recordNo = Number(noText);
    const name = (cells.get(cols.name) ?? '').trim();
    // Placeholder rows for one-off visitors are not members.
    if (!name || name === '게스트' || seen.has(recordNo)) continue;
    // 회원은 생년월일이 적혀 있다 — 비어 있으면 회원이 아닌 사람이라 뺀다.
    const birth = cols.birth ? normaliseBirth(cells.get(cols.birth)) : null;
    if (cols.birth && !birth) continue;
    seen.add(recordNo);

    const played: [date: string, score: number][] = [];
    for (const [c, date] of dateCols) {
      const score = Number(cells.get(c));
      if (Number.isFinite(score) && score > 0 && score <= MAX_SCORE) played.push([date, score]);
    }
    const recent = played.slice(-RECENT_GAMES);
    // 소수점 한 자리까지 — 183.4
    const avg = recent.length
      ? Math.round((recent.reduce((s, [, v]) => s + v, 0) / recent.length) * 10) / 10
      : 0;

    out.push({
      recordNo,
      name: name.slice(0, 20),
      birth,
      avg,
      games: played.length,
      lastPlayed: played.length ? isoDate(played[played.length - 1]![0]) : null,
    });
  }
  if (out.length === 0) throw new Error('엑셀에서 회원을 찾지 못했어요.');
  return out.sort((a, b) => a.recordNo - b.recordNo);
}

export interface ImportPlan {
  /** The whole new 명단: the sheet, then 정모 members it does not list. */
  rows: RegistryMember[];
  added: number;
  updated: number;
  /** People from past 정모 who are not in the sheet but stay on the 명단. */
  carried: number;
  /** Sheet members a re-import no longer lists — unregistered, not deleted. */
  removedIds: string[];
}

/** The sheet row a name match goes to: of same-named rows, the one that bowled last. */
function latestByName(sheet: readonly RecordRow[]): Map<string, RecordRow> {
  const out = new Map<string, RecordRow>();
  for (const r of sheet) {
    const prev = out.get(r.name);
    if (!prev || (r.lastPlayed ?? '') >= (prev.lastPlayed ?? '')) out.set(r.name, r);
  }
  return out;
}

/**
 * Lines the sheet up against the current 명단 and everyone saved to past 정모,
 * so that each person keeps one id and nobody who came to a 정모 drops off.
 *
 * - 번호 is the match key for anyone already imported — dozens share a name.
 * - Past 정모 saved a fresh copy of each person every time, so they are taken
 *   one per name (the latest copy). A name the sheet also has is joined to
 *   the sheet row that bowled most recently, keeping the 정모 copy's id and
 *   gender; the sheet supplies 번호 and the average.
 * - On the first import, 정모 people the sheet does not list join the 명단
 *   without a 번호, and a later import never drops them — only sheet members
 *   can fall off. Anyone typed into a 정모 after that is a guest and stays off.
 *
 * `saved` must be oldest first, so the last copy of a name is the latest.
 */
export function planImport(
  sheet: readonly RecordRow[],
  current: readonly RegistryMember[],
  saved: readonly Member[],
): ImportPlan {
  const byRecord = new Map<number, RegistryMember>();
  for (const m of current) if (m.recordNo !== null) byRecord.set(m.recordNo, m);

  // 번호 없는 사람을 이름당 하나로: 지난 정모의 최신 사본, 이미 명단에 있으면 그쪽.
  const listed = new Set(current.filter((m) => m.recordNo !== null).map((m) => m.name));
  const people = new Map<string, Member>();
  for (const m of saved) if (!listed.has(m.name)) people.set(m.name, m);
  const unnumbered = new Set<string>();
  for (const m of current) {
    if (m.recordNo === null) {
      people.set(m.name, m);
      unnumbered.add(m.id);
    }
  }

  const target = latestByName(sheet);
  let added = 0;
  let updated = 0;
  const rows = sheet.map((r): RegistryMember => {
    let match: Member | undefined = byRecord.get(r.recordNo);
    if (!match && target.get(r.name) === r && people.has(r.name)) {
      match = people.get(r.name);
      people.delete(r.name);
    }
    if (match && (byRecord.has(r.recordNo) || unnumbered.has(match.id))) updated++;
    else added++;
    return {
      id: match?.id ?? newMemberId(),
      name: r.name,
      gender: match?.gender ?? '남',
      avg: r.avg,
      recordNo: r.recordNo,
      birth: r.birth,
      games: r.games,
      lastPlayed: r.lastPlayed,
    };
  });

  /*
   * 지난 정모 사람을 옮겨 오는 건 첫 가져오기 한 번뿐이다. 그 뒤로 정모에 직접
   * 입력한 사람은 게스트·신입이라 명단에 올리지 않는다 — 이미 옮겨 온 사람만 남긴다.
   */
  const firstImport = current.length === 0;
  const carried = [...people.values()]
    .filter((m) => firstImport || unnumbered.has(m.id))
    .map((m): RegistryMember => ({
      id: m.id,
      name: m.name,
      gender: m.gender,
      avg: m.avg,
      recordNo: null,
      birth: null,
      games: 0,
      lastPlayed: null,
    }));
  for (const m of carried) {
    if (unnumbered.has(m.id)) updated++;
    else added++;
  }

  const kept = new Set([...rows, ...carried].map((r) => r.id));
  const removedIds = current.filter((m) => !kept.has(m.id)).map((m) => m.id);
  return { rows: [...rows, ...carried], added, updated, carried: carried.length, removedIds };
}
