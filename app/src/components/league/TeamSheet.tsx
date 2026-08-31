import { useState } from 'react';
import type { Team } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';

/** 3인 팀전 — the format fixes the squad size. */
const TEAM_SIZE = 3;

interface Props {
  /** Present when editing an existing team; absent when creating one. */
  team?: Team;
  /**
   * Players selectable for this team: everyone unassigned this season, plus the
   * team's own current members when editing.
   */
  available: readonly LeaguePlayer[];
  initialPlayerIds?: readonly string[];
  suggestedName: string;
  onSave: (name: string, playerIds: string[]) => Promise<string | null>;
  onDelete?: (team: Team) => Promise<string | null>;
  onClose: () => void;
}

export function TeamSheet({
  team,
  available,
  initialPlayerIds = [],
  suggestedName,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const editing = team !== undefined;
  const [name, setName] = useState(team?.name ?? suggestedName);
  const [picked, setPicked] = useState<string[]>([...initialPlayerIds]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= TEAM_SIZE ? cur : [...cur, id],
    );

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const message = await action();
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('팀 이름을 입력해 주세요.');
    if (picked.length !== TEAM_SIZE) {
      return setError(`${TEAM_SIZE}명을 선택해 주세요. (현재 ${picked.length}명)`);
    }
    void run(() => onSave(trimmed, picked));
  };

  const remove = () => {
    if (!team || !onDelete) return;
    if (!window.confirm(`${team.name}을 삭제할까요?\n이 팀의 대진도 함께 지워집니다.`)) return;
    void run(() => onDelete(team));
  };

  return (
    <div
      className="sheetScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={editing ? '팀 수정' : '팀 만들기'}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{editing ? '팀 수정' : '팀 만들기'}</div>
        <div className="sheet__hint">3인 팀전이라 세 명을 골라야 합니다.</div>

        <div className="field">
          <label className="field__label" htmlFor="team-name">
            팀 이름
          </label>
          <input
            id="team-name"
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
        </div>

        <div className="field">
          <span className="field__label">
            선수 선택 · {picked.length} / {TEAM_SIZE}
          </span>
          {available.length === 0 ? (
            <div className="hintBox">
              배정할 수 있는 선수가 없어요. 선수명단 탭에서 먼저 등록해 주세요.
            </div>
          ) : (
            <div className="pickGrid">
              {available.map((p) => {
                const on = picked.includes(p.id);
                const full = !on && picked.length >= TEAM_SIZE;
                return (
                  <button
                    type="button"
                    key={p.id}
                    className={`pick${on ? ' pick--on' : ''}`}
                    disabled={full}
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                  >
                    <span className="pick__name">{p.name}</span>
                    <span className="pick__meta">
                      {p.avg ?? '–'}
                      {p.handicap > 0 && ` +${p.handicap}`}
                      {p.penalty > 0 && ` −${p.penalty}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={submit} disabled={busy}>
            {busy ? '저장 중…' : editing ? '저장' : '만들기'}
          </button>
          {editing && onDelete ? (
            <button
              type="button"
              className="sheet__ghost sheet__delete"
              onClick={remove}
              disabled={busy}
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
