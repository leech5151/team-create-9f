import { useMemo, useState } from 'react';
import type { Gender, Member } from '../types';
import { birthLabel, byActivity, type RegistryMember } from '../meetup/registry';

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
  title?: string;
  hint?: string;
  onSave: (drafts: MemberDraft[]) => void;
  onClose: () => void;
  /**
   * 정모 only: the 회원 명단. When given, the sheet opens on picking from it,
   * and typing a name in becomes the guest path.
   */
  registry?: readonly RegistryMember[];
  /** Ids already on the roster — shown ticked and not pickable again. */
  added?: ReadonlySet<string>;
  onPick?: (members: Member[]) => void;
}

type Mode = 'pick' | 'type';

/**
 * Bulk entry: one member per line, "줄 추가" for more. Tier is not asked for —
 * it is derived from the scores once everyone is in.
 */
export function AddMembersSheet({
  title = '멤버 추가',
  hint = '점수를 적으면 명단 전체와 비교해 1·2·3티어가 자동으로 정해집니다.',
  onSave,
  onClose,
  registry,
  added,
  onPick,
}: Props) {
  const canPick = registry !== undefined && onPick !== undefined;
  const [mode, setMode] = useState<Mode>(canPick ? 'pick' : 'type');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => (registry ?? []).slice().sort(byActivity), [registry]);
  const q = query.trim();
  const shown = q ? candidates.filter((m) => m.name.includes(q)) : candidates;

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitPick = () => {
    if (!onPick) return;
    // 서버 행의 부가 정보는 떼고 명단에 필요한 것만 넘긴다.
    onPick(
      candidates
        .filter((m) => picked.has(m.id))
        .map(({ id, name, gender, avg }) => ({ id, name, gender, avg })),
    );
  };

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
    <div
      className="sheetScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`sheet${canPick ? ' sheet--tall' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <div className="sheet__title">{title}</div>
          <button type="button" className="sheet__x" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        {canPick && (
          <div className="addMode" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'pick'}
              className={`addMode__btn${mode === 'pick' ? ' addMode__btn--on' : ''}`}
              onClick={() => setMode('pick')}
            >
              회원에서 선택
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'type'}
              className={`addMode__btn${mode === 'type' ? ' addMode__btn--on' : ''}`}
              onClick={() => setMode('type')}
            >
              게스트·신입 입력
            </button>
          </div>
        )}

        {mode === 'pick' ? (
          <>
            <div className="sheet__hint">
              최근에 친 회원부터 보여요. 여러 명을 골라 한 번에 추가하세요.
            </div>
            <input
              className="registrySearch registrySearch--sheet"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 검색"
              aria-label="회원 이름 검색"
            />
            <div className="pickList">
              {candidates.length === 0 && (
                <div className="registryEmpty">
                  추가할 회원이 없어요. 홈 › 회원관리 › 회원등록에서 엑셀을 가져와 주세요.
                </div>
              )}
              {candidates.length > 0 && shown.length === 0 && (
                <div className="registryEmpty">"{q}" 회원이 없어요.</div>
              )}
              {shown.map((m) => {
                // 이미 명단에 있는 사람은 체크된 채로 보이되 다시 고를 수 없다.
                const already = added?.has(m.id) ?? false;
                const on = already || picked.has(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    className={`pickRow${already ? ' pickRow--added' : ''}`}
                    onClick={() => togglePick(m.id)}
                    disabled={already}
                    aria-pressed={on}
                  >
                    <span className={`check${already ? ' check--added' : on ? ' check--on' : ''}`}>
                      {on ? '✓' : ''}
                    </span>
                    <span className="pickRow__name">{m.name}</span>
                    <span className="pickRow__meta">
                      {already ? '명단에 있음' : birthLabel(m.birth)}
                    </span>
                    <span className="memberRow__gender">{m.gender}</span>
                    <span className="memberRow__avg">
                      {m.games > 0 || m.recordNo === null ? m.avg : '–'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="sheet__actions">
              <button
                type="button"
                className="sheet__save"
                onClick={submitPick}
                disabled={picked.size === 0}
              >
                {picked.size > 0 ? `${picked.size}명 추가` : '추가'}
              </button>
              <button type="button" className="sheet__ghost" onClick={onClose}>
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="sheet__hint">
              {canPick ? '게스트·신입은 이 정모에만 들어가고 회원 명단에는 올라가지 않아요.' : hint}
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
          </>
        )}
      </div>
    </div>
  );
}
