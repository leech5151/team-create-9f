import { useState } from 'react';
import type { Gender } from '../types';

export interface MemberDraft {
  name: string;
  gender: Gender;
  avg: number;
}

interface Row {
  key: number;
  name: string;
  gender: Gender;
  avg: string;
}

const MAX_AVG = 300;
const INITIAL_ROWS = 3;

let nextKey = 0;
const blankRow = (): Row => ({ key: nextKey++, name: '', gender: '남', avg: '' });

const isBlank = (r: Row) => r.name.trim() === '' && r.avg.trim() === '';

interface Props {
  onSave: (drafts: MemberDraft[]) => void;
  onClose: () => void;
}

/**
 * Bulk entry: one member per line, "줄 추가" for more. Tier is not asked for —
 * it is derived from the scores once everyone is in.
 */
export function AddMembersSheet({ onSave, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: INITIAL_ROWS }, () => blankRow()),
  );
  const [error, setError] = useState<string | null>(null);

  const patch = (key: number, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const addRow = () => setRows((rs) => [...rs, blankRow()]);

  const removeRow = (key: number) =>
    setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((r) => r.key !== key)));

  const submit = () => {
    // Untouched rows are padding, not mistakes — drop them silently.
    const filled = rows.filter((r) => !isBlank(r));
    if (filled.length === 0) return setError('한 명 이상 입력해 주세요.');

    const drafts: MemberDraft[] = [];
    for (const [i, r] of filled.entries()) {
      const name = r.name.trim();
      if (!name) return setError(`${i + 1}번째 줄: 이름을 입력해 주세요.`);
      const avg = Number(r.avg);
      if (r.avg.trim() === '' || !Number.isFinite(avg) || avg < 0 || avg > MAX_AVG) {
        return setError(`${i + 1}번째 줄 (${name}): 점수를 0~${MAX_AVG} 사이로 입력해 주세요.`);
      }
      drafts.push({ name, gender: r.gender, avg: Math.round(avg) });
    }

    const dupe = drafts.find((d, i) => drafts.findIndex((x) => x.name === d.name) !== i);
    if (dupe) return setError(`이름이 겹칩니다: ${dupe.name}`);

    setError(null);
    onSave(drafts);
  };

  const readyCount = rows.filter((r) => !isBlank(r)).length;

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="멤버 추가">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">멤버 추가</div>
        <div className="sheet__hint">
          점수를 적으면 명단 전체와 비교해 1·2·3티어가 자동으로 정해집니다.
        </div>

        <div className="bulkHead">
          <span className="bulkHead__name">이름</span>
          <span className="bulkHead__gender">성별</span>
          <span className="bulkHead__avg">점수</span>
          <span className="bulkHead__spacer" />
        </div>

        <div className="bulkRows">
          {rows.map((r, i) => (
            <div className="bulkRow" key={r.key}>
              <input
                className="bulkRow__name"
                value={r.name}
                onChange={(e) => patch(r.key, { name: e.target.value })}
                placeholder={`이름 ${i + 1}`}
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
                className="bulkRow__avg"
                value={r.avg}
                onChange={(e) =>
                  patch(r.key, { avg: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })
                }
                placeholder="180"
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

        <button type="button" className="bulkAdd" onClick={addRow}>
          + 사람 추가
        </button>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={submit}>
            {readyCount > 0 ? `${readyCount}명 등록` : '등록'}
          </button>
          <button type="button" className="sheet__ghost" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
