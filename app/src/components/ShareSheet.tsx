import type { Lane } from '../types';
import { namesLine, todayShort } from '../lib/format';

interface Props {
  game: number;
  lanes: readonly Lane[];
  onClose: () => void;
  onShare: () => void;
  onCopy: () => void;
}

export function ShareSheet({ game, lanes, onClose, onShare, onCopy }: Props) {
  return (
    <div
      className="shareScrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`GAME ${game} 레인 배정 공유`}
    >
      <div className="shareCard" onClick={(e) => e.stopPropagation()}>
        <div className="shareCard__head">
          <div className="shareCard__title">GAME {game} 레인 배정</div>
          <div className="shareCard__meta">{todayShort()} 정기모임</div>
        </div>
        <div className="shareGrid">
          {lanes.map((lane) => (
            <div className="shareLane" key={lane.no}>
              <div className="shareLane__no">LANE {lane.no}</div>
              <div className="shareLane__names">{namesLine(lane)}</div>
            </div>
          ))}
        </div>
        <div className="shareActions">
          <button type="button" className="shareActions__primary" onClick={onShare}>
            공유하기
          </button>
          <button type="button" className="shareActions__secondary" onClick={onCopy}>
            텍스트 복사
          </button>
        </div>
      </div>
    </div>
  );
}
