import { useState } from 'react';
import type { Match } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import { parseDate, shortDate } from '../../league/schedule';

interface Side {
  teamId: string;
  teamName: string;
  /** Everyone on the squad, captain first. */
  squad: readonly LeaguePlayer[];
  captainId: string | null;
  /** Currently recorded line-up; empty means nobody picked yet. */
  playing: readonly string[];
}

interface Props {
  match: Match;
  home: Side;
  away: Side;
  onSave: (picks: { teamId: string; playerIds: string[] }[]) => Promise<string | null>;
  onClose: () => void;
}

/**
 * Picks who bowls for each team in a match.
 *
 * League squads are bigger than the group that turns up, so the line-up is set
 * per match. With nobody picked the whole squad is assumed, which keeps older
 * fixtures scoring as before.
 */
export function LineupSheet({ match, home, away, onSave, onClose }: Props) {
  const [picks, setPicks] = useState<Record<string, Set<string>>>(() => ({
    [home.teamId]: new Set(home.playing.length > 0 ? home.playing : home.squad.map((p) => p.id)),
    [away.teamId]: new Set(away.playing.length > 0 ? away.playing : away.squad.map((p) => p.id)),
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (teamId: string, playerId: string) =>
    setPicks((cur) => {
      const next = new Set(cur[teamId]);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return { ...cur, [teamId]: next };
    });

  const submit = async () => {
    const chosen = [home, away].map((side) => ({
      teamId: side.teamId,
      playerIds: side.squad.map((p) => p.id).filter((id) => picks[side.teamId]?.has(id)),
    }));
    if (chosen.some((c) => c.playerIds.length === 0)) {
      return setError('양 팀 모두 한 명 이상 선택해 주세요.');
    }
    setBusy(true);
    setError(null);
    const message = await onSave(chosen);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  const renderSide = (side: Side) => {
    const picked = picks[side.teamId] ?? new Set<string>();
    return (
      <div key={side.teamId}>
        <div className="sectionLabel">
          {side.teamName}
          <span className="sectionLabel__note">
            {picked.size} / {side.squad.length}명 출전
          </span>
        </div>
        {side.squad.length === 0 ? (
          <div className="empty">팀에 배정된 선수가 없어요.</div>
        ) : (
          <div className="card">
            {side.squad.map((p) => {
              const on = picked.has(p.id);
              return (
                <div className="memberRow" key={p.id}>
                  <button
                    type="button"
                    className="memberRow__main"
                    style={{ opacity: on ? 1 : 0.42 }}
                    onClick={() => toggle(side.teamId, p.id)}
                    aria-pressed={on}
                  >
                    <div
                      className="check"
                      style={{
                        background: on ? '#0E9D8B' : 'transparent',
                        borderColor: on ? '#0E9D8B' : 'rgba(0,0,0,.2)',
                      }}
                    >
                      {on ? '✓' : ''}
                    </div>
                    <div className="memberRow__name">
                      {side.captainId === p.id && <em className="captainMark">장</em>}
                      {p.name}
                    </div>
                    <div className="memberRow__gender">{p.gender ?? '—'}</div>
                    <div className="memberRow__avg">{p.avg ?? '–'}</div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sheetScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="출전 선수">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">출전 선수</div>
        <div className="sheet__hint">
          {match.playedOn ? shortDate(parseDate(match.playedOn)!) : '날짜 미정'}
          {match.startTime ? ` ${match.startTime}` : ''} — 이 경기에 나가는 선수만 남기세요.
          제외하면 그 선수의 점수도 함께 지워집니다.
        </div>

        {renderSide(home)}
        {renderSide(away)}

        {error && <div className="field__error">{error}</div>}

        <div className="sheet__actions">
          <button type="button" className="sheet__save" onClick={() => void submit()} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="sheet__ghost" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
