import type { Lane, Phase, Ranked } from '../types';
import { TIERS } from '../types';
import { TIER_COLOR } from '../theme';

interface Props {
  game: number;
  lanes: readonly Lane[];
  waiting: readonly Ranked[];
  placed: readonly string[];
  phase: Phase;
  /** Lane highlighted while a just-drawn number is on screen. */
  landedLane: number;
  placedCount: number;
  totalCount: number;
  revealedAll: boolean;
  onRoll: (id: string) => void;
  onUndo: (id: string) => void;
}

export function DrawScreen({
  game,
  lanes,
  waiting,
  placed,
  phase,
  landedLane,
  placedCount,
  totalCount,
  revealedAll,
  onRoll,
  onUndo,
}: Props) {
  const placedSet = new Set(placed);
  const lastPlaced = placed[placed.length - 1];

  return (
    <div className="screen">
      <div className="drawTop">
        <div className="drawTop__label">GAME {game} · 본인 차례에 직접 뽑기</div>
        <div className="drawTop__hint">
          {revealedAll ? '배정 완료' : `${placedCount} / ${totalCount}명`}
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="drawPrompt">
          <div className="drawPrompt__title">이름을 눌러 레인 뽑기</div>
          <div className="drawPrompt__sub">본인 이름을 누르면 레인이 랜덤으로 정해집니다</div>
          <div className="waitingList">
            {TIERS.map((tier) => {
              const people = waiting.filter((m) => m.tier === tier);
              return (
                <div className="waitingTier" key={tier}>
                  <div className="tierBadge" style={{ background: TIER_COLOR[tier] }}>
                    {tier}
                  </div>
                  <div className="waitingPeople">
                    {people.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        className="nameBtn"
                        disabled={phase !== 'idle'}
                        onClick={() => onRoll(m.id)}
                      >
                        {m.name}
                      </button>
                    ))}
                    {people.length === 0 && <div className="waitingEmpty">모두 배정됨</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="laneGrid">
        {lanes.map((lane) => {
          const drawn = lane.members.filter((m) => placedSet.has(m.id));
          const revealed = drawn.length;
          const full = revealed === lane.members.length;
          // Running total of who has actually been drawn, so the lanes can be
          // compared while the draw is still going. `lane.avg` is the finished
          // lane's average and says nothing about the half-filled state.
          const sum = drawn.reduce((acc, m) => acc + m.avg, 0);
          return (
            <div
              className={`laneCard${lane.no === landedLane ? ' laneCard--hot' : ''}`}
              key={lane.no}
            >
              <div className="laneCard__head">
                <div className="laneCard__no">{lane.no}번 레인</div>
                <div className="laneCard__meta">
                  {/* 아직 아무도 안 뽑힌 레인에 0 을 띄우지는 않는다. */}
                  {revealed > 0 && (
                    <span className="laneCard__sum" title="배정된 인원의 점수 합">
                      {sum}
                    </span>
                  )}
                  <span className="laneCard__prog">
                    {full ? `AVG ${lane.avg}` : `${revealed}/${lane.members.length}`}
                  </span>
                </div>
              </div>
              <div className="laneCard__slots">
                {lane.members.map((m) => {
                  const on = placedSet.has(m.id);
                  const justNow = on && m.id === lastPlaced && phase === 'landed';
                  return (
                    <div
                      key={m.id}
                      className={`slot${on ? ' slot--on' : ''}${justNow ? ' slot--just' : ''}`}
                    >
                      <div
                        className="slot__chip"
                        style={
                          on ? { background: TIER_COLOR[m.tier], color: '#fff' } : undefined
                        }
                      >
                        {m.tier}
                      </div>
                      <div className="slot__name">{on ? m.name : '· · ·'}</div>
                      <div className="slot__avg">{on ? m.avg : ''}</div>
                      {on && phase === 'idle' && (
                        <button
                          type="button"
                          className="slot__undo"
                          title={`${m.name} 배정 취소`}
                          aria-label={`${m.name} 배정 취소`}
                          onClick={() => onUndo(m.id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
