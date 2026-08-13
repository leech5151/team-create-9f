import { useState } from 'react';
import type { Gender, Member, Tier } from '../types';

export interface MemberEdit {
  name: string;
  gender: Gender;
  avg: number;
}

const GENDERS: readonly Gender[] = ['남', '여'];
const MAX_AVG = 300;

interface Props {
  member: Member;
  /** Tier the member currently falls into, shown read-only — it follows the score. */
  tier: Tier | null;
  onSave: (edit: MemberEdit) => void;
  onDelete: (member: Member) => void;
  onClose: () => void;
}

export function MemberSheet({ member, tier, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(member.name);
  const [gender, setGender] = useState<Gender>(member.gender);
  const [avg, setAvg] = useState(String(member.avg));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('이름을 입력해 주세요.');
    const parsed = Number(avg);
    if (avg.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > MAX_AVG) {
      return setError(`점수는 0 ~ ${MAX_AVG} 사이 숫자로 입력해 주세요.`);
    }
    setError(null);
    onSave({ name: trimmed, gender, avg: Math.round(parsed) });
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="멤버 수정">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">멤버 수정</div>
        <div className="sheet__hint">
          {tier === null
            ? '티어는 참석자들의 점수 순위로 자동 계산됩니다.'
            : `현재 ${tier}티어 — 점수를 바꾸면 티어도 자동으로 바뀝니다.`}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="member-name">
            이름
          </label>
          <input
            id="member-name"
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            autoComplete="off"
            maxLength={20}
          />
        </div>

        <div className="field">
          <span className="field__label">성별</span>
          <div className="optRow">
            {GENDERS.map((g) => (
              <button
                type="button"
                key={g}
                className={`optBtn${gender === g ? ' optBtn--on' : ''}`}
                aria-pressed={gender === g}
                onClick={() => setGender(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="member-avg">
            점수 (에버리지)
          </label>
          <input
            id="member-avg"
            className="field__input"
            value={avg}
            onChange={(e) => setAvg(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            placeholder="180"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={submit}>
            저장
          </button>
          <button
            type="button"
            className="sheet__ghost sheet__delete"
            onClick={() => onDelete(member)}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
