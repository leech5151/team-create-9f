import { useState } from 'react';
import type { PlayerDraft } from '../league/api';

interface Row {
  key: number;
  name: string;
  gender: '남' | '여';
  handicap: string;
  penalty: string;
  avg: string;
}

const INITIAL_ROWS = 3;
const MAX_AVG = 300;

let nextKey = 0;
const blankRow = (): Row => ({
  key: nextKey++,
  name: '',
  gender: '남',
  handicap: '',
  penalty: '',
  avg: '',
});

/**
 * Digits only. Both figures are stored as magnitudes — the column decides the
 * sign (핸디 adds, 패널티 subtracts), so a typed minus would double-negate.
 */
const numeric = (raw: string) => raw.replace(/[^0-9]/g, '').slice(0, 3);

interface Props {
  /** Names already registered, so duplicates are caught before the round trip. */
  existingNames: readonly string[];
  onSave: (drafts: PlayerDraft[]) => Promise<string | null>;
  onClose: () => void;
}

/** Bulk entry for league players: name, gender, and the default figures. */
export function AddPlayersSheet({ existingNames, onSave, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: INITIAL_ROWS }, () => blankRow()),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (key: number, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const removeRow = (key: number) =>
    setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((r) => r.key !== key)));

  const filled = rows.filter((r) => r.name.trim() !== '');

  const submit = async () => {
    if (filled.length === 0) return setError('한 명 이상 입력해 주세요.');

    const drafts: PlayerDraft[] = [];
    for (const [i, r] of filled.entries()) {
      const name = r.name.trim();
      const avg = r.avg.trim() === '' ? null : Number(r.avg);
      if (avg !== null && (!Number.isFinite(avg) || avg < 0 || avg > MAX_AVG)) {
        return setError(`${i + 1}번째 줄 (${name}): 점수는 0~${MAX_AVG} 사이여야 합니다.`);
      }
      drafts.push({
        name,
        gender: r.gender,
        // Blank means "no adjustment", which is 0 — not an error.
        handicap: r.handicap.trim() === '' ? 0 : Number(r.handicap),
        penalty: r.penalty.trim() === '' ? 0 : Number(r.penalty),
        avg,
      });
    }

    const dupeInForm = drafts.find((d, i) => drafts.findIndex((x) => x.name === d.name) !== i);
    if (dupeInForm) return setError(`입력한 이름이 겹칩니다: ${dupeInForm.name}`);

    const taken = new Set(existingNames);
    const already = drafts.find((d) => taken.has(d.name));
    if (already) return setError(`이미 등록된 선수입니다: ${already.name}`);

    setBusy(true);
    setError(null);
    const message = await onSave(drafts);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="선수 등록">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">선수 등록</div>
        <div className="sheet__hint">
          핸디는 매 게임 <b>더하고</b>, 패널티는 <b>빼는</b> 값입니다. 숫자만 넣으면 돼요.
        </div>

        <div className="bulkHead bulkHead--league">
          <span className="bulkHead__name">이름</span>
          <span className="bulkHead__gender">성별</span>
          <span className="bulkHead__num">핸디 +</span>
          <span className="bulkHead__num">패널티 −</span>
          <span className="bulkHead__num">점수</span>
          <span className="bulkHead__spacer" />
        </div>

        <div className="bulkRows">
          {rows.map((r, i) => (
            <div className="bulkRow bulkRow--league" key={r.key}>
              <input
                className="bulkRow__name"
                value={r.name}
                onChange={(e) => patch(r.key, { name: e.target.value })}
                placeholder={`이름${i + 1}`}
                autoComplete="off"
                maxLength={20}
                aria-label={`${i + 1}번째 줄 이름`}
              />
              <div className="bulkRow__gender">
                {(['남', '여'] as const).map((g) => (
                  <button
                    type="button"
                    key={g}
                    className={`bulkRow__g${r.gender === g ? ' bulkRow__g--on' : ''}`}
                    aria-pressed={r.gender === g}
                    aria-label={`${i + 1}번째 줄 ${g}`}
                    onClick={() => patch(r.key, { gender: g })}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <input
                className="bulkRow__num"
                value={r.handicap}
                onChange={(e) => patch(r.key, { handicap: numeric(e.target.value) })}
                placeholder="0"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`${i + 1}번째 줄 핸디`}
              />
              <input
                className="bulkRow__num"
                value={r.penalty}
                onChange={(e) => patch(r.key, { penalty: numeric(e.target.value) })}
                placeholder="0"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`${i + 1}번째 줄 패널티`}
              />
              <input
                className="bulkRow__num"
                value={r.avg}
                onChange={(e) => patch(r.key, { avg: numeric(e.target.value) })}
                placeholder="–"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`${i + 1}번째 줄 점수`}
              />
              <button
                type="button"
                className="bulkRow__del"
                onClick={() => removeRow(r.key)}
                aria-label={`${i + 1}번째 줄 지우기`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="bulkAdd" onClick={() => setRows((rs) => [...rs, blankRow()])}>
          + 사람 추가
        </button>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={() => void submit()} disabled={busy}>
            {busy ? '등록 중…' : filled.length > 0 ? `${filled.length}명 등록` : '등록'}
          </button>
          <button type="button" className="sheet__ghost" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
