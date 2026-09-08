import { useState } from 'react';
import { formatDate, parseDate, weekdayLabel } from '../league/schedule';

const WEEKDAY_HEADS = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface Props {
  /** ISO dates that already have a saved 정모 — marked, and always tappable. */
  savedDates: ReadonlySet<string>;
  /** The 정모 currently open, as an ISO date. */
  selected: string;
  today: string;
  /**
   * Operators may pick a day with no 정모 yet, which starts a new one. Everyone
   * else can only open what has been saved.
   */
  canPickNew: boolean;
  busy: boolean;
  onPick: (metOn: string) => void;
}

/** Days in a month, and what weekday the 1st falls on — all in UTC. */
function monthGrid(year: number, month: number): (string | null)[] {
  const first = Date.UTC(year, month, 1);
  const lead = new Date(first).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(formatDate(Date.UTC(year, month, d)));
  // Trailing blanks so the last row is a full week and the grid keeps its shape.
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Month calendar for picking a 정모.
 *
 * Replaces the one-chip-per-정모 row, which grew without bound as meetups piled
 * up. Saved dates are filled dark, so which nights exist is visible at a glance
 * instead of being a list to read.
 */
export function MeetupCalendar({
  savedDates,
  selected,
  today,
  canPickNew,
  busy,
  onPick,
}: Props) {
  const anchor = parseDate(selected) ?? parseDate(today) ?? Date.now();
  const [view, setView] = useState(() => {
    const d = new Date(anchor);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  const step = (by: number) => {
    const next = new Date(Date.UTC(view.year, view.month + by, 1));
    setView({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };

  const cells = monthGrid(view.year, view.month);
  const savedThisMonth = cells.filter((iso) => iso !== null && savedDates.has(iso)).length;

  return (
    <div className="mcal">
      <div className="mcal__head">
        <button
          type="button"
          className="mcal__nav"
          onClick={() => step(-1)}
          aria-label="이전 달"
        >
          ‹
        </button>
        <div className="mcal__title">
          {view.year}. {String(view.month + 1).padStart(2, '0')}
          {savedThisMonth > 0 && <em className="mcal__count">정모 {savedThisMonth}</em>}
        </div>
        <button
          type="button"
          className="mcal__nav"
          onClick={() => step(1)}
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="mcal__grid">
        {WEEKDAY_HEADS.map((w) => (
          <div className="mcal__wd" key={w}>
            {w}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (iso === null) return <div className="mcal__blank" key={`b${i}`} />;
          const saved = savedDates.has(iso);
          return (
            <button
              type="button"
              key={iso}
              className={[
                'mcal__day',
                saved ? ' mcal__day--saved' : '',
                iso === selected ? ' mcal__day--on' : '',
                iso === today ? ' mcal__day--today' : '',
              ].join('')}
              // 저장된 정모가 없는 날은 운영자만 — 나머지는 만들 권한이 없다.
              disabled={busy || (!saved && !canPickNew)}
              onClick={() => onPick(iso)}
              title={`${iso} (${weekdayLabel(parseDate(iso)!)})${saved ? ' · 저장된 정모' : ''}`}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>

      <div className="mcal__legend">
        <span className="mcal__swatch mcal__swatch--saved" />
        저장된 정모
        {canPickNew && ' · 빈 날짜를 누르면 그 날짜로 새 정모'}
      </div>
    </div>
  );
}
