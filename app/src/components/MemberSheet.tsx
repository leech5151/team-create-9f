import { useState } from 'react';
import type { Gender, Member, Tier } from '../types';
import { TIERS } from '../types';
import { TIER_COLOR } from '../theme';

export type EditorTarget = { mode: 'add'; tier: Tier } | { mode: 'edit'; member: Member };

export interface MemberDraft {
  name: string;
  tier: Tier;
  gender: Gender;
  avg: number;
}

const GENDERS: readonly Gender[] = ['남', '여'];
const MAX_AVG = 300;

interface Props {
  target: EditorTarget;
  onSave: (draft: MemberDraft) => void;
  onDelete: (member: Member) => void;
  onClose: () => void;
}

export function MemberSheet({ target, onSave, onDelete, onClose }: Props) {
  const existing = target.mode === 'edit' ? target.member : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [tier, setTier] = useState<Tier>(
    target.mode === 'edit' ? target.member.tier : target.tier,
  );
  const [gender, setGender] = useState<Gender>(existing?.gender ?? '남');
  const [avg, setAvg] = useState(existing ? String(existing.avg) : '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('이름을 입력해 주세요.');
    const parsed = Number(avg);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_AVG) {
      return setError(`에버리지는 0 ~ ${MAX_AVG} 사이 숫자로 입력해 주세요.`);
    }
    setError(null);
    onSave({ name: trimmed, tier, gender, avg: Math.round(parsed) });
  };

  return (
    <div
      className="sheetScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={existing ? '멤버 수정' : '멤버 추가'}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{existing ? '멤버 수정' : '멤버 추가'}</div>

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
          <span className="field__label">티어</span>
          <div className="optRow">
            {TIERS.map((t) => (
              <button
                type="button"
                key={t}
                className={`optBtn${tier === t ? ' optBtn--on' : ''}`}
                aria-pressed={tier === t}
                onClick={() => setTier(t)}
              >
                <span
                  className="tierDot"
                  style={{ background: tier === t ? '#fff' : TIER_COLOR[t] }}
                />
                {t}티어
              </button>
            ))}
          </div>
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
            에버리지
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
          {existing ? (
            <button
              type="button"
              className="sheet__ghost sheet__delete"
              onClick={() => onDelete(existing)}
            >
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
