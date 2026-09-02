import { useEffect, useRef, useState } from 'react';
import type { Team } from '../../league/api';
import type { LeaguePlayer } from '../../league/types';
import { shuffle } from '../../lib/assign';

/** Matches the player draw's slot timing so the two rolls feel the same. */
const SPIN_TICK_MS = 70;
const SPIN_DURATION_MS = 1200;

interface Entry {
  team: Team;
  members: readonly LeaguePlayer[];
  captainId: string | null;
}

interface Props {
  player: LeaguePlayer;
  teams: readonly Entry[];
  busy: boolean;
  /** Performs the write; resolves true once it lands. */
  onAssign: (teamId: string) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Assigns the drawn player to a random team out of the ones ticked.
 *
 * The point is to settle a contest: when several teams want the same player,
 * the operator narrows it to those teams and lets the roll decide.
 */
export function RandomAssignSheet({ player, teams, busy, onAssign, onClose }: Props) {
  // Every team is in the running until the operator narrows it.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(teams.map((t) => t.team.id)));
  const [flash, setFlash] = useState<string | null>(null);
  /** The team that won, held so the result stays up until dismissed. */
  const [result, setResult] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<{ tick?: number; stop?: number }>({});

  const stop = () => {
    if (timers.current.tick !== undefined) clearInterval(timers.current.tick);
    if (timers.current.stop !== undefined) clearTimeout(timers.current.stop);
    timers.current = {};
  };
  useEffect(() => stop, []);

  const toggle = (teamId: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });

  const roll = () => {
    const candidates = teams.filter((t) => picked.has(t.team.id));
    if (candidates.length === 0) return setError('한 팀 이상 선택해 주세요.');
    setError(null);

    // Decide first, then animate — the roll is presentation, not the draw.
    const winner = shuffle(candidates)[0]!;
    stop();
    setFlash(winner.team.name);

    timers.current.tick = window.setInterval(() => {
      setFlash(candidates[Math.floor(Math.random() * candidates.length)]!.team.name);
    }, SPIN_TICK_MS);

    timers.current.stop = window.setTimeout(() => {
      stop();
      setFlash(null);
      void onAssign(winner.team.id).then((saved) => {
        if (saved) setResult(winner);
        else setError('배정에 실패했어요. 다시 시도해 주세요.');
      });
    }, SPIN_DURATION_MS);
  };

  const spinning = flash !== null;

  return (
    <div
      className="sheetScrim"
      onClick={spinning || result ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label="랜덤 배정"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">{player.name} 랜덤 배정</div>
        <div className="sheet__hint">
          경쟁하는 팀만 남기고 돌리세요. 선택한 팀 중에서 무작위로 정해집니다.
        </div>

        {result ? (
          <div className="drawPanel drawPanel--result">
            <div className="drawPanel__label">낙찰</div>
            <div className="drawPanel__name">{result.team.name}</div>
            <div className="drawPanel__meta">
              {player.name} 배정 완료 · 이제 {result.members.length + 1}명
            </div>
            <div className="resultRoster">
              {[...result.members.map((m) => m.name), player.name].join(' · ')}
            </div>
          </div>
        ) : spinning ? (
          <div className="drawPanel">
            <div className="drawPanel__label">배정 중…</div>
            <div className="drawPanel__name drawPanel__name--spin">{flash}</div>
            <div className="drawPanel__meta">{player.name}</div>
          </div>
        ) : (
          <>
            <div className="sectionLabel">
              후보 팀
              <span className="sectionLabel__note">{picked.size} / {teams.length}팀</span>
            </div>
            <div className="claimList">
              {teams.map(({ team, members, captainId }) => {
                const on = picked.has(team.id);
                return (
                  <button
                    type="button"
                    key={team.id}
                    className={`claimRow${on ? ' claimRow--on' : ''}`}
                    onClick={() => toggle(team.id)}
                    aria-pressed={on}
                    disabled={busy}
                  >
                    <span
                      className="check"
                      style={{
                        background: on ? '#FF4A21' : 'transparent',
                        borderColor: on ? '#FF4A21' : 'rgba(0,0,0,.2)',
                      }}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="claimRow__body">
                      <span className="claimRow__name">{team.name}</span>
                      <span className="claimRow__members">
                        {members.length === 0
                          ? '미배정'
                          : members
                              .map((m) => (captainId === m.id ? `${m.name}(장)` : m.name))
                              .join(' · ')}
                      </span>
                    </span>
                    <span className="claimRow__count">{members.length}명</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {error && <div className="field__error">{error}</div>}

        {result ? (
          <div className="sheet__actions">
            <button type="button" className="sheet__save" onClick={onClose}>
              확인
            </button>
          </div>
        ) : (
          !spinning && (
            <div className="sheet__actions">
              <button
                type="button"
                className="sheet__save"
                onClick={roll}
                disabled={busy || picked.size === 0}
              >
                {picked.size}팀 중 랜덤 배정
              </button>
              <button type="button" className="sheet__ghost" onClick={onClose} disabled={busy}>
                취소
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
