import { useState } from 'react';
import type { Team } from '../../league/api';

interface Props {
  weekNo: number;
  teams: readonly Team[];
  /** Teams already fixtured this week — they cannot play twice. */
  busyTeamIds: readonly string[];
  onSave: (homeTeamId: string, awayTeamId: string, laneNo: number | null) => Promise<string | null>;
  onClose: () => void;
}

export function MatchSheet({ weekNo, teams, busyTeamIds, onSave, onClose }: Props) {
  const [home, setHome] = useState<string | null>(null);
  const [away, setAway] = useState<string | null>(null);
  const [lane, setLane] = useState('');
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
    setBusy(true);
    setError(null);
    const message = await onSave(home, away, laneNo);
    setBusy(false);
    if (message) setError(message);
    else onClose();
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
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="대진 추가">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{weekNo}주차 대진 추가</div>
        <div className="sheet__hint">맞붙는 두 팀을 고르세요. 레인 번호는 선택입니다.</div>

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

        <div className="field">
          <label className="field__label" htmlFor="match-lane">
            레인 번호 (선택)
          </label>
          <input
            id="match-lane"
            className="field__input"
            value={lane}
            onChange={(e) => setLane(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            inputMode="numeric"
            placeholder="예: 3"
            autoComplete="off"
          />
        </div>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={() => void submit()} disabled={busy}>
            {busy ? '등록 중…' : '대진 등록'}
          </button>
          <button type="button" className="sheet__ghost" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
