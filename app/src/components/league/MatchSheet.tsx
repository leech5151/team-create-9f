import { useState } from 'react';
import type { Match, Team } from '../../league/api';
import { formatDate, parseDate, shortDate, weekdayLabel } from '../../league/schedule';

interface Props {
  /** Present when editing an existing fixture; absent when adding one. */
  match?: Match;
  weekNo: number;
  /** The seven dates of this week, as epoch ms. Empty when no start date is set. */
  days: readonly number[];
  teams: readonly Team[];
  /** Teams already fixtured this week — they cannot play twice. */
  busyTeamIds: readonly string[];
  onSave: (
    homeTeamId: string,
    awayTeamId: string,
    laneNo: number | null,
    playedOn: string | null,
    startTime: string | null,
  ) => Promise<string | null>;
  onDelete?: (match: Match) => Promise<string | null>;
  onClose: () => void;
}

export function MatchSheet({
  match,
  weekNo,
  days,
  teams,
  busyTeamIds,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const editing = match !== undefined;
  const [home, setHome] = useState<string | null>(match?.homeTeamId ?? null);
  const [away, setAway] = useState<string | null>(match?.awayTeamId ?? null);
  const [lane, setLane] = useState(match?.laneNo === null || match === undefined ? '' : String(match.laneNo));
  // Falls back to a free date field when the 회차 has no start date yet, so a
  // fixture can always be scheduled rather than the picker simply vanishing.
  const [day, setDay] = useState<string>(
    match?.playedOn ?? (days[0] !== undefined ? formatDate(days[0]) : ''),
  );
  const [time, setTime] = useState(match?.startTime ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const taken = new Set(busyTeamIds);

  /** Picking the same team on both sides is the easiest mistake to make. */
  const pick = (side: 'home' | 'away', id: string) => {
    if (side === 'home') {
      setHome(id);
      if (away === id) setAway(null);
    } else {
      setAway(id);
      if (home === id) setHome(null);
    }
  };

  const submit = async () => {
    if (!home || !away) return setError('두 팀을 모두 선택해 주세요.');
    if (home === away) return setError('같은 팀끼리는 대진할 수 없습니다.');
    const laneNo = lane.trim() === '' ? null : Number(lane);
    if (laneNo !== null && (!Number.isInteger(laneNo) || laneNo < 1 || laneNo > 99)) {
      return setError('레인 번호는 1~99 사이여야 합니다.');
    }
    if (day !== '' && parseDate(day) === null) return setError('날짜 형식이 올바르지 않습니다.');
    if (time !== '' && !/^\d{2}:\d{2}$/.test(time)) return setError('시간 형식이 올바르지 않습니다.');

    setBusy(true);
    setError(null);
    const message = await onSave(home, away, laneNo, day || null, time || null);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  const remove = () => {
    if (!match || !onDelete) return;
    if (!window.confirm('이 대진을 삭제할까요?')) return;
    void (async () => {
      setBusy(true);
      const message = await onDelete(match);
      setBusy(false);
      if (message) setError(message);
      else onClose();
    })();
  };

  const column = (side: 'home' | 'away', selected: string | null, other: string | null) => (
    <div className="teamPickCol">
      {teams.map((t) => {
        const already = taken.has(t.id);
        const isOther = other === t.id;
        return (
          <button
            type="button"
            key={t.id}
            className={`teamPick${selected === t.id ? ' teamPick--on' : ''}`}
            disabled={already || isOther}
            aria-pressed={selected === t.id}
            onClick={() => pick(side, t.id)}
            title={already ? '이번 주차에 이미 대진이 있습니다' : undefined}
          >
            {t.name}
            {already && <span className="teamPick__tag">배정됨</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={editing ? '대진 수정' : '대진 추가'}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{weekNo}주차 대진 {editing ? '수정' : '추가'}</div>
        <div className="sheet__hint">맞붙는 두 팀과 날짜를 고르세요. 시간과 레인은 비워둘 수 있어요.</div>

        <div className="matchPick">
          <div className="matchPick__side">
            <div className="field__label">팀 1</div>
            {column('home', home, away)}
          </div>
          <div className="matchPick__vs">VS</div>
          <div className="matchPick__side">
            <div className="field__label">팀 2</div>
            {column('away', away, home)}
          </div>
        </div>

        {days.length > 0 ? (
          <div className="field">
            <span className="field__label">요일</span>
            <div className="dayRow">
              {days.map((d) => {
                const iso = formatDate(d);
                return (
                  <button
                    type="button"
                    key={d}
                    className={`dayPick${day === iso ? ' dayPick--on' : ''}`}
                    aria-pressed={day === iso}
                    onClick={() => setDay(iso)}
                    title={shortDate(d)}
                  >
                    <span className="dayPick__dow">{weekdayLabel(d)}</span>
                    <span className="dayPick__date">{new Date(d).getUTCDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="match-date">
              날짜
            </label>
            <input
              id="match-date"
              className="field__input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
            <div className="field__note">
              회차에 시작 날짜를 넣으면 요일 버튼으로 고를 수 있어요.
            </div>
          </div>
        )}

        <div className="field">
          <span className="field__label">시간 · 레인</span>
          <div className="figureRow">
            <label className="figure">
              <span className="figure__label">시작 시간</span>
              <input
                className="figure__input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <label className="figure">
              <span className="figure__label">레인</span>
              <input
                className="figure__input"
                value={lane}
                onChange={(e) => setLane(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                inputMode="numeric"
                placeholder="–"
              />
            </label>
          </div>
        </div>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={() => void submit()} disabled={busy}>
            {busy ? '저장 중…' : editing ? '저장' : '대진 등록'}
          </button>
          {editing && onDelete ? (
            <button type="button" className="sheet__ghost sheet__delete" onClick={remove} disabled={busy}>
              삭제
            </button>
          ) : (
            <button type="button" className="sheet__ghost" onClick={onClose}>
              취소
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
