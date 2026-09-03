import { useEffect, useState } from 'react';
import type { Team } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';

interface Props {
  team: Team;
  /** Players already on this team, captain first. */
  members: readonly LeaguePlayer[];
  captainId: string | null;
  /** True while a write is in flight, so the sheet can show it. */
  busy: boolean;
  /**
   * Message from the last failed write, or null. The tab behind the scrim
   * shows it too, but that is hidden while the sheet is open.
   */
  error: string | null;
  /** Players on no team yet — the pool this team can draw from. */
  available: readonly LeaguePlayer[];
  onAdd: (playerId: string) => void;
  onRemove: (playerId: string) => void;
  onSetCaptain: (playerId: string) => void;
  onClearCaptain: (playerId: string) => void;
  /** Resolves true once the new name is stored. */
  onRename: (name: string) => Promise<boolean>;
  onDeleteTeam: () => void;
  onClose: () => void;
}

/**
 * Roster editor for one team: rename it, add or drop players, choose the
 * captain.
 *
 * The roster actions write through immediately, so there is no save button.
 * The name is the exception — typing cannot commit on every keystroke, so it
 * gets its own 변경 button and commits on Enter too.
 */
export function TeamMemberSheet({
  team,
  members,
  captainId,
  busy,
  error,
  available,
  onAdd,
  onRemove,
  onSetCaptain,
  onClearCaptain,
  onRename,
  onDeleteTeam,
  onClose,
}: Props) {
  const [name, setName] = useState(team.name);

  // Follow the stored name — after a successful rename, and if the sheet is
  // reused for another team.
  useEffect(() => setName(team.name), [team.id, team.name]);

  const trimmed = name.trim();
  const changed = trimmed !== '' && trimmed !== team.name;

  const commitName = () => {
    if (!changed || busy) return;
    void onRename(trimmed);
  };

  return (
    <div
      className="sheetScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${team.name} 구성`}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{team.name}</div>
        <div className="sheet__hint">
          바꾸는 즉시 저장됩니다. 팀장은 팀마다 한 명이에요.
        </div>

        <div className="field">
          <label className="field__label" htmlFor="team-name">
            팀 이름
          </label>
          <div className="renameRow">
            <input
              id="team-name"
              className="field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitName();
                }
              }}
              placeholder={team.name}
              autoComplete="off"
              maxLength={20}
              disabled={busy}
            />
            <button
              type="button"
              className="renameRow__save"
              onClick={commitName}
              disabled={busy || !changed}
            >
              변경
            </button>
          </div>
        </div>

        {busy && <div className="sheetBusy">저장 중…</div>}
        {!busy && error && <div className="field__error">{error}</div>}

        <div className="sectionLabel">
          팀원
          <span className="sectionLabel__note">{members.length}명</span>
        </div>
        {members.length === 0 ? (
          <div className="empty">아직 배정된 선수가 없어요.</div>
        ) : (
          <div className="card">
            {members.map((p) => {
              const isCaptain = captainId === p.id;
              return (
                <div className="memberRow" key={p.id}>
                  <button
                    type="button"
                    className="memberRow__main"
                    disabled={busy}
                    onClick={() => (isCaptain ? onClearCaptain(p.id) : onSetCaptain(p.id))}
                    aria-pressed={isCaptain}
                    title={isCaptain ? '팀장 해제' : '팀장으로 지정'}
                  >
                    <div
                      className="check"
                      style={{
                        background: isCaptain ? '#FF4A21' : 'transparent',
                        borderColor: isCaptain ? '#FF4A21' : 'rgba(0,0,0,.2)',
                      }}
                    >
                      {isCaptain ? '장' : ''}
                    </div>
                    <div className="memberRow__name">{p.name}</div>
                    <div className="memberRow__gender">{p.gender ?? '—'}</div>
                    <div className="memberRow__avg">{p.avg ?? '–'}</div>
                  </button>
                  <button
                    type="button"
                    className="memberRow__del"
                    disabled={busy}
                    onClick={() => onRemove(p.id)}
                    aria-label={`${p.name}을 대기 목록으로`}
                    title={`${p.name}을 아래 대기 목록으로 보냅니다`}
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="sectionLabel">
          대기 선수
          <span className="sectionLabel__note">{available.length}명 · 눌러서 팀에 추가</span>
        </div>
        {available.length === 0 ? (
          <div className="empty">배정할 수 있는 선수가 없어요.</div>
        ) : (
          <div className="card captainPickList">
            {available.map((p) => (
              <div className="memberRow" key={p.id}>
                <button
                  type="button"
                  className="memberRow__main"
                  disabled={busy}
                  onClick={() => onAdd(p.id)}
                  aria-label={`${p.name}을 팀에 추가`}
                >
                  <div className="addRow__plus">↑</div>
                  <div className="memberRow__name">{p.name}</div>
                  <div className="memberRow__gender">{p.gender ?? '—'}</div>
                  <div className="memberRow__avg">{p.avg ?? '–'}</div>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={onClose}>
            완료
          </button>
          <button
            type="button"
            className="sheet__ghost sheet__delete"
            onClick={onDeleteTeam}
            disabled={busy}
          >
            팀 삭제
          </button>
        </div>
      </div>
    </div>
  );
}
