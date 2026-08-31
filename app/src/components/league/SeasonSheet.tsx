import { useState } from 'react';
import type { Season } from '../../league/api';
import { formatDate, todayUtc } from '../../league/schedule';

const MIN_WEEKS = 1;
const MAX_WEEKS = 20;
/** The league runs 5–7 weeks per 회차; 6 is the usual length. */
const DEFAULT_WEEKS = 6;

interface Props {
  /** Present when editing an existing 회차; absent when creating one. */
  season?: Season;
  /** Editions already taken, so the clash is caught before the round trip. */
  usedEditions: readonly number[];
  suggestedEdition: number;
  onSave: (
    edition: number,
    totalWeeks: number,
    title: string | null,
    startDate: string,
  ) => Promise<string | null>;
  onDelete?: (season: Season) => Promise<string | null>;
  onClose: () => void;
}

export function SeasonSheet({
  season,
  usedEditions,
  suggestedEdition,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const editing = season !== undefined;
  const [edition, setEdition] = useState(String(season?.edition ?? suggestedEdition));
  const [weeks, setWeeks] = useState(String(season?.totalWeeks ?? DEFAULT_WEEKS));
  const [title, setTitle] = useState(season?.title ?? '');
  // Defaults to today so the common case needs no typing.
  const [startDate, setStartDate] = useState(
    () => season?.startDate ?? formatDate(todayUtc()),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const digits = (raw: string) => raw.replace(/[^0-9]/g, '').slice(0, 2);

  const submit = async () => {
    const ed = Number(edition);
    if (!edition || !Number.isInteger(ed) || ed < 1) return setError('회차는 1 이상이어야 합니다.');
    // Keeping your own edition number is not a clash.
    if (ed !== season?.edition && usedEditions.includes(ed)) {
      return setError(`${ed}회는 이미 있습니다.`);
    }

    const wk = Number(weeks);
    if (!Number.isInteger(wk) || wk < MIN_WEEKS || wk > MAX_WEEKS) {
      return setError(`주차는 ${MIN_WEEKS}~${MAX_WEEKS} 사이여야 합니다.`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return setError('시작 날짜를 입력해 주세요.');

    // Shrinking the season destroys the trailing weeks and their fixtures.
    if (editing && season && wk < season.totalWeeks) {
      const lost = season.totalWeeks - wk;
      if (!window.confirm(`주차를 ${season.totalWeeks} → ${wk}로 줄이면 마지막 ${lost}개 주차와 그 대진이 삭제됩니다. 계속할까요?`)) {
        return;
      }
    }

    setBusy(true);
    setError(null);
    const message = await onSave(ed, wk, title.trim() || null, startDate);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  const remove = () => {
    if (!season || !onDelete) return;
    if (!window.confirm(`${season.edition}회를 삭제할까요?\n주차·팀·대진이 모두 지워집니다.`)) return;
    void (async () => {
      setBusy(true);
      const message = await onDelete(season);
      setBusy(false);
      if (message) setError(message);
      else onClose();
    })();
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={editing ? '회차 수정' : '회차 만들기'}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{editing ? `${season!.edition}회 수정` : '회차 만들기'}</div>
        <div className="sheet__hint">
          시작 날짜부터 7일씩 끊어 주차가 매겨집니다. 주차는 입력한 수만큼 자동 생성돼요.
        </div>

        <div className="field">
          <label className="field__label" htmlFor="season-start">
            시작 날짜 (1주차 시작일)
          </label>
          <input
            id="season-start"
            className="field__input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="field">
          <span className="field__label">회차 · 주차 수</span>
          <div className="figureRow">
            <label className="figure">
              <span className="figure__label">회차</span>
              <input
                className="figure__input"
                value={edition}
                onChange={(e) => setEdition(digits(e.target.value))}
                inputMode="numeric"
                placeholder="1"
              />
            </label>
            <label className="figure">
              <span className="figure__label">주차 수</span>
              <input
                className="figure__input"
                value={weeks}
                onChange={(e) => setWeeks(digits(e.target.value))}
                inputMode="numeric"
                placeholder={String(DEFAULT_WEEKS)}
              />
            </label>
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="season-title">
            부제 (선택)
          </label>
          <input
            id="season-title"
            className="field__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2026 상반기"
            maxLength={40}
            autoComplete="off"
          />
        </div>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={() => void submit()} disabled={busy}>
            {busy ? '저장 중…' : editing ? '저장' : '만들기'}
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
