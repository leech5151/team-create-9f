import { useState } from 'react';

const MIN_WEEKS = 1;
const MAX_WEEKS = 20;
/** The league runs 5–7 weeks per 회차; 6 is the usual length. */
const DEFAULT_WEEKS = 6;

interface Props {
  /** Editions already taken, so the clash is caught before the round trip. */
  usedEditions: readonly number[];
  suggestedEdition: number;
  onSave: (edition: number, totalWeeks: number, title: string | null) => Promise<string | null>;
  onClose: () => void;
}

export function SeasonSheet({ usedEditions, suggestedEdition, onSave, onClose }: Props) {
  const [edition, setEdition] = useState(String(suggestedEdition));
  const [weeks, setWeeks] = useState(String(DEFAULT_WEEKS));
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const digits = (raw: string) => raw.replace(/[^0-9]/g, '').slice(0, 2);

  const submit = async () => {
    const ed = Number(edition);
    if (!edition || !Number.isInteger(ed) || ed < 1) return setError('회차는 1 이상이어야 합니다.');
    if (usedEditions.includes(ed)) return setError(`${ed}회는 이미 있습니다.`);

    const wk = Number(weeks);
    if (!Number.isInteger(wk) || wk < MIN_WEEKS || wk > MAX_WEEKS) {
      return setError(`주차는 ${MIN_WEEKS}~${MAX_WEEKS} 사이여야 합니다.`);
    }

    setBusy(true);
    setError(null);
    const message = await onSave(ed, wk, title.trim() || null);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="회차 만들기">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">회차 만들기</div>
        <div className="sheet__hint">
          주차는 입력한 수만큼 자동으로 만들어집니다. 날짜는 나중에 지정할 수 있어요.
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
            {busy ? '만드는 중…' : '만들기'}
          </button>
          <button type="button" className="sheet__ghost" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
