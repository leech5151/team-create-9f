import type { Member, Phase } from '../types';
import { TIER_COLOR } from '../theme';

interface Props {
  phase: Phase;
  rollNo: number;
  member: Member | null;
  revealedAll: boolean;
}

export function RollOverlay({ phase, rollNo, member, revealedAll }: Props) {
  const landed = phase === 'landed';

  const label = landed
    ? `${rollNo}번 레인 배정!`
    : phase === 'rolling'
      ? '레인 뽑는 중'
      : revealedAll
        ? 'DONE'
        : '내 차례';

  return (
    <div className="rollScrim" role="status" aria-live="polite">
      <div className="rollCard">
        <div
          className="rollCard__chip"
          style={{
            background: revealedAll ? '#0E9D8B' : member ? TIER_COLOR[member.tier] : '#8A8F98',
          }}
        >
          {/* Korean given name starts at the 2nd character. */}
          {revealedAll ? '✓' : member ? member.name.slice(1, 2) : '?'}
        </div>
        <div className="rollCard__label">{label}</div>
        <div className="rollCard__name">
          {revealedAll ? '모두 배정 완료' : member ? member.name : '이름을 누르면 레인이 정해져요'}
        </div>
        <div className="rollCard__box">
          <div className="rollCard__cap">{landed ? 'LANE ASSIGNED' : 'ROLLING…'}</div>
          <div className={`rollCard__numRow${landed ? ' rollCard__numRow--landed' : ''}`}>
            <div className={`rollCard__n${landed ? ' rollCard__n--landed' : ''}`}>
              {phase === 'idle' ? '–' : rollNo}
            </div>
            <div className="rollCard__unit">번 레인</div>
          </div>
        </div>
      </div>
    </div>
  );
}
