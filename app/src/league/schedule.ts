/**
 * Week and date arithmetic for 상주리그.
 *
 * Dates are plain `YYYY-MM-DD` strings throughout. All arithmetic goes through
 * UTC so a machine east or west of the league never shifts a match by a day —
 * using local `Date` parsing would do exactly that.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DAYS_PER_WEEK = 7;

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** `YYYY-MM-DD` → epoch ms at UTC midnight. Returns null if unparseable. */
export function parseDate(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : ms;
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today at UTC midnight, so comparisons against stored dates line up. */
export function todayUtc(now: Date = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export const addDays = (ms: number, days: number): number => ms + days * DAY_MS;

/** "9/3 (수)" — compact enough for a chip, unambiguous about the weekday. */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WEEKDAY_LABELS[d.getUTCDay()]})`;
}

export function weekdayLabel(ms: number): string {
  return WEEKDAY_LABELS[new Date(ms).getUTCDay()]!;
}

export interface WeekRange {
  start: number;
  end: number;
}

/**
 * The 7-day span of a given week, or null when the season has no start date.
 * Week 1 begins on the start date itself.
 */
export function weekRange(startDate: string | null, weekNo: number): WeekRange | null {
  const start = parseDate(startDate);
  if (start === null) return null;
  const from = addDays(start, (weekNo - 1) * DAYS_PER_WEEK);
  return { start: from, end: addDays(from, DAYS_PER_WEEK - 1) };
}

/** The seven dates of a week, for picking which day a fixture falls on. */
export function weekDays(startDate: string | null, weekNo: number): number[] {
  const range = weekRange(startDate, weekNo);
  if (range === null) return [];
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(range.start, i));
}

/**
 * Which week number `today` falls in, clamped to the season.
 *
 * Before the season starts it reports week 1, and after it ends the last week,
 * so the UI always has a sensible week to open rather than showing nothing.
 * Returns null when the season has no start date to measure from.
 */
export function currentWeekNo(
  startDate: string | null,
  totalWeeks: number,
  today: number = todayUtc(),
): number | null {
  const start = parseDate(startDate);
  if (start === null || totalWeeks < 1) return null;
  const elapsedDays = Math.floor((today - start) / DAY_MS);
  const raw = Math.floor(elapsedDays / DAYS_PER_WEEK) + 1;
  return Math.min(Math.max(raw, 1), totalWeeks);
}

/** True when `today` sits inside the given week — used to badge "이번 주". */
export function isCurrentWeek(
  startDate: string | null,
  weekNo: number,
  today: number = todayUtc(),
): boolean {
  const range = weekRange(startDate, weekNo);
  if (range === null) return false;
  return today >= range.start && today <= range.end;
}


/** Monday-first weekday order, as Korean schedules are written. */
export const WEEKDAYS: readonly { label: string; day: number }[] = [
  { label: '월', day: 1 },
  { label: '화', day: 2 },
  { label: '수', day: 3 },
  { label: '목', day: 4 },
  { label: '금', day: 5 },
  { label: '토', day: 6 },
  { label: '일', day: 0 },
];

/** Day of week (0 = Sunday) for an ISO date, or null when unset. */
export function weekdayOf(iso: string | null): number | null {
  const ms = parseDate(iso);
  return ms === null ? null : new Date(ms).getUTCDay();
}
